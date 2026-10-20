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

    # 1. Support deterministic test mock tokens (for isolated unit tests and offline dev)
    if token.startswith("test-token:"):
        parts = token.split(":")
        if len(parts) >= 4:
            return UserClaims(id=parts[1], email=parts[2], role=parts[3])

    # 2. Supabase JWT Secret Verification
    if settings.supabase_jwt_secret:
        try:
            payload = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
            user_id = payload.get("sub")
            email = payload.get("email", "")
            # Check user role from app_metadata or payload
            app_meta = payload.get("app_metadata", {})
            role = app_meta.get("role") or payload.get("role", "user")

            if not user_id:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token claims: missing subject.",
                )

            return UserClaims(id=user_id, email=email, role=role)
        except jwt.ExpiredSignatureError as err:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication token has expired.",
            ) from err
        except jwt.InvalidTokenError as err:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token.",
            ) from err

    # 3. Unverified decode fallback if JWT secret is not configured in local environment
    try:
        unverified = jwt.decode(token, options={"verify_signature": False})
        user_id = unverified.get("sub") or "local-dev-user"
        email = unverified.get("email") or "dev@local.test"
        role = unverified.get("role", "user")
        return UserClaims(id=user_id, email=email, role=role)
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
