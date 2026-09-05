from __future__ import annotations

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware


class NoStoreApiResponsesMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, *, api_base_path: str) -> None:
        super().__init__(app)
        self.api_base_path = api_base_path.rstrip("/") or "/api"

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        if request.url.path == self.api_base_path or request.url.path.startswith(f"{self.api_base_path}/"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response
