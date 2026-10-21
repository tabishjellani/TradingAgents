"""Supabase JWT Verification & Role-Based Access Control (RBAC)."""

from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from backend.app.config import settings

_bearer_scheme = HTTPBearer(auto_error=False)


class UserClaims(BaseModel):
    """Authenticated user identity extracted from verified Supabase JWT."""

    id: str
    email: str
    role: str = "user"
    token: str = ""


def decode_token(token: str) -> UserClaims:
    """Decode and validate a Supabase JWT token.

    Handles real HS256 Supabase JWTs as well as isolated test tokens.
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

    # 2. Supabase JWT Secret Verification
    if settings.supabase_jwt_secret:
        try:
            # Verify issuer if token contains iss and supabase_url is configured
            if settings.supabase_url:
                expected_iss = f"{settings.supabase_url.rstrip('/')}/auth/v1"
                try:
                    unverified_claims = jwt.decode(token, options={"verify_signature": False})
                    token_iss = unverified_claims.get("iss")
                    if token_iss and token_iss != expected_iss:
                        raise HTTPException(
                            status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid authentication token issuer.",
                            headers={"WWW-Authenticate": "Bearer"},
                        )
                except HTTPException:
                    raise
                except Exception:
                    pass

            payload = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
            user_id = payload.get("sub")
            email = payload.get("email", "")
            # Check user role strictly from app_metadata (never from user_metadata)
            app_meta = payload.get("app_metadata", {})
            assigned_role = app_meta.get("role", "user")
            role = assigned_role if assigned_role in ("user", "operator", "admin") else "user"

            if not user_id:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token claims: missing subject.",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            return UserClaims(id=user_id, email=email, role=role, token=token)
        except jwt.ExpiredSignatureError as err:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication token has expired.",
                headers={"WWW-Authenticate": "Bearer"},
            ) from err
        except jwt.InvalidTokenError as err:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token.",
                headers={"WWW-Authenticate": "Bearer"},
            ) from err

    # In production, unverified decoding without secret signature check is strictly forbidden
    if settings.environment == "production":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server configuration error: SUPABASE_JWT_SECRET is required to verify authentication tokens in production.",
        )

    # 3. Unverified decode fallback ONLY in local offline development if JWT secret is not configured
    try:
        unverified = jwt.decode(token, options={"verify_signature": False})
        user_id = unverified.get("sub") or "local-dev-user"
        email = unverified.get("email") or "dev@local.test"
        app_meta = unverified.get("app_metadata", {})
        assigned_role = app_meta.get("role", "user")
        role = assigned_role if assigned_role in ("user", "operator", "admin") else "user"
        return UserClaims(id=user_id, email=email, role=role, token=token)
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token header.",
        ) from err


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
    """FastAPI dependency: Enforces admin role requirement."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrative privileges required for this action.",
        )
    return current_user


async def require_operator_or_admin(
    current_user: Annotated[UserClaims, Depends(get_current_user)],
) -> UserClaims:
    """FastAPI dependency: Enforces operator or admin role requirement."""
    if current_user.role not in ("operator", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Elevated privileges (operator or admin) required.",
        )
    return current_user
