"""Supabase JWT Verification & Role-Based Access Control (RBAC)."""

from typing import Annotated, Any

import jwt
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from pydantic import BaseModel

from backend.app.config import settings

_bearer_scheme = HTTPBearer(auto_error=False)
_jwks_clients: dict[str, PyJWKClient] = {}


def _get_jwks_client(supabase_url: str) -> PyJWKClient:
    """Retrieve or initialize cached JWKS client for a Supabase project."""
    url = f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    if url not in _jwks_clients:
        _jwks_clients[url] = PyJWKClient(url, cache_jwk_set=True, lifespan=3600)
    return _jwks_clients[url]


class UserClaims(BaseModel):
    """Authenticated user identity extracted from verified Supabase JWT."""

    id: str
    email: str
    role: str = "user"
    token: str = ""


def decode_token(token: str) -> UserClaims:
    """Decode and validate a Supabase JWT token.

    Handles real HS256 symmetric Supabase JWTs, modern RS256/ES256 asymmetric Supabase JWTs,
    as well as isolated development test tokens.
    """
    if not token or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 1. Support deterministic test mock tokens (only allowed during offline tests and non-production development)
    if token.startswith("test-token:"):
        if settings.environment == "production":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Synthetic test tokens are strictly prohibited in production mode. A valid Supabase JWT is required.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        parts = token.split(":")
        if len(parts) >= 4:
            return UserClaims(id=parts[1], email=parts[2], role=parts[3], token=token)

    # 2. Enforce configuration requirements in production mode
    if settings.environment == "production":
        if not settings.supabase_jwt_secret:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Server configuration error: SUPABASE_JWT_SECRET is required to verify authentication tokens in production.",
            )
        if not settings.supabase_url:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Server configuration error: SUPABASE_URL is required to verify authentication token issuer in production.",
            )

    # 3. Inspect token header for algorithm validation
    try:
        header = jwt.get_unverified_header(token)
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token header.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from err

    alg = header.get("alg")
    if not alg or alg.lower() == "none" or alg not in ("HS256", "RS256", "ES256"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Unsupported or invalid authentication token algorithm '{alg}'.",
            headers={"WWW-Authenticate": "Bearer"},
        )


    # 3. Determine expected issuer and required claims
    expected_iss = f"{settings.supabase_url.rstrip('/')}/auth/v1" if settings.supabase_url else None
    required_claims = ["exp", "sub", "aud"]

    if expected_iss:
        required_claims.append("iss")
        try:
            unverified_claims = jwt.decode(token, options={"verify_signature": False})
            token_iss = unverified_claims.get("iss")
            if not token_iss:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication token is missing required 'iss' (issuer) claim.",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            if token_iss != expected_iss:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid authentication token issuer.",
                    headers={"WWW-Authenticate": "Bearer"},
                )
        except HTTPException:
            raise
        except Exception as err:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Malformed token claims.",
                headers={"WWW-Authenticate": "Bearer"},
            ) from err

    # 4. Signature verification per algorithm
    payload: dict | None = None
    try:
        decode_kwargs: dict[str, Any] = {
            "algorithms": [alg],
            "audience": "authenticated",
            "options": {"require": required_claims},
        }
        if expected_iss:
            decode_kwargs["issuer"] = expected_iss

        if alg == "HS256":
            if settings.supabase_jwt_secret:
                payload = jwt.decode(
                    token,
                    settings.supabase_jwt_secret,
                    **decode_kwargs,
                )
            elif settings.environment == "production":
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Server configuration error: SUPABASE_JWT_SECRET is required to verify authentication tokens in production.",
                )
            else:
                # Local dev fallback only
                payload = jwt.decode(token, options={"verify_signature": False})

        elif alg in ("RS256", "ES256"):
            if settings.supabase_jwt_secret and "BEGIN" in settings.supabase_jwt_secret:
                # Asymmetric public key provided directly in secret config
                payload = jwt.decode(
                    token,
                    settings.supabase_jwt_secret,
                    **decode_kwargs,
                )
            elif settings.supabase_url:
                # Verify using public key fetched from Supabase JWKS endpoint
                jwks_client = _get_jwks_client(settings.supabase_url)
                signing_key = jwks_client.get_signing_key_from_jwt(token)
                payload = jwt.decode(
                    token,
                    signing_key.key,
                    **decode_kwargs,
                )
            elif settings.environment == "production":
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Server configuration error: SUPABASE_URL or public key is required to verify asymmetric Supabase tokens in production.",
                )
            else:
                # Local dev fallback only
                payload = jwt.decode(token, options={"verify_signature": False})

    except jwt.ExpiredSignatureError as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has expired.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from err
    except jwt.InvalidSignatureError as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication token: {err}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from err
    except jwt.InvalidTokenError as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication token: {err}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from err
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication token: {err}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from err

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token payload.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    email = payload.get("email", "")
    # Check user role strictly from app_metadata (never from user_metadata)
    app_meta = payload.get("app_metadata", {})
    assigned_role = app_meta.get("role", "user")
    role = assigned_role if assigned_role in ("user", "operator", "admin", "super_admin") else "user"

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token claims: missing subject.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return UserClaims(id=user_id, email=email, role=role, token=token)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Security(_bearer_scheme)],
) -> UserClaims:
    """FastAPI dependency: Extract and verify current user claims."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide a Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return decode_token(credentials.credentials)


async def require_admin(
    current_user: Annotated[UserClaims, Depends(get_current_user)],
) -> UserClaims:
    """FastAPI dependency: Enforces admin or super_admin role requirement."""
    if current_user.role not in ("admin", "super_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrative privileges required for this action.",
        )
    return current_user


async def require_super_admin(
    current_user: Annotated[UserClaims, Depends(get_current_user)],
) -> UserClaims:
    """FastAPI dependency: Enforces super_admin role requirement."""
    if current_user.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super Administrator privileges required for this action.",
        )
    return current_user


async def require_operator_or_admin(
    current_user: Annotated[UserClaims, Depends(get_current_user)],
) -> UserClaims:
    """FastAPI dependency: Enforces operator, admin, or super_admin role requirement."""
    if current_user.role not in ("operator", "admin", "super_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Elevated privileges (operator or admin) required.",
        )
    return current_user
