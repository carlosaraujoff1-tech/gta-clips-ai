"""HTTP middleware: request logging and local-client protection."""

from __future__ import annotations

import time
import uuid
from collections.abc import Awaitable, Callable

import structlog
from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.logging import get_logger

log = get_logger("http")

# Every state-changing request must carry this header. Browsers cannot add a
# custom header to a cross-site request without a CORS preflight, and our CORS
# policy only allows the local frontend, so a random website open in the browser
# cannot trigger actions on this API (CSRF protection).
CLIENT_HEADER = "X-GTA-Clips-Client"
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)
        start = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            structlog.contextvars.unbind_contextvars("request_id")
        duration_ms = round((time.perf_counter() - start) * 1000, 1)
        log.info(
            "request",
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            duration_ms=duration_ms,
        )
        response.headers["X-Request-ID"] = request_id
        return response


class LocalClientGuardMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        if request.method not in SAFE_METHODS:
            if request.headers.get(CLIENT_HEADER) != "web":
                return JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={
                        "error": {
                            "code": "client_not_allowed",
                            "message": "Requisição recusada: cliente não autorizado.",
                            "details": {},
                        }
                    },
                )
            content_type = request.headers.get("content-type", "")
            has_body = request.headers.get("content-length", "0") not in ("", "0")
            if has_body and not content_type.startswith("application/json"):
                return JSONResponse(
                    status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                    content={
                        "error": {
                            "code": "unsupported_media_type",
                            "message": "Envie os dados como JSON.",
                            "details": {},
                        }
                    },
                )
        return await call_next(request)
