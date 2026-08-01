"""Authentication helpers for the analyzer's privileged endpoints.

The analyzer's inference endpoints (/v1/anomaly/*, /v1/predict/*) are called by the
frontend through the gateway and are intentionally open. Expensive or state-mutating
operations (model retraining) require a valid service JWT or an internal token.
"""
import os
from typing import Optional

from fastapi import HTTPException, Header
from jose import jwt as jose_jwt
from jose.exceptions import JWTError

from app.core.config import settings


def require_internal_auth(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    x_internal_token: Optional[str] = Header(default=None, alias="X-Internal-Token"),
) -> None:
    """Reject unauthenticated calls to privileged endpoints.

    Accepts either:
      - a Bearer JWT signed with the shared JWT_SECRET, or
      - the INTERNAL_API_TOKEN header (same convention as the collector's internal
        metrics endpoint).
    Fails closed: if neither secret is configured the endpoint returns 503 rather
    than silently allowing the call.
    """
    internal_token = os.getenv("INTERNAL_API_TOKEN", "")
    if x_internal_token and internal_token and x_internal_token == internal_token:
        return

    jwt_secret = settings.jwt_secret
    if authorization and authorization.startswith("Bearer ") and jwt_secret:
        token = authorization[7:].strip()
        try:
            jose_jwt.decode(token, jwt_secret, algorithms=["HS256"])
            return
        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid token")

    if not jwt_secret and not internal_token:
        raise HTTPException(
            status_code=503,
            detail="Server auth is not configured (JWT_SECRET / INTERNAL_API_TOKEN unset)",
        )

    raise HTTPException(status_code=401, detail="Authentication required")
