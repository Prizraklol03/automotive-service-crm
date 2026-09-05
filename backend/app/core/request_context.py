from __future__ import annotations

from contextvars import ContextVar

_ip_prefix_ctx: ContextVar[str | None] = ContextVar("ip_prefix", default=None)
_ua_hash_ctx: ContextVar[str | None] = ContextVar("user_agent_hash", default=None)


def set_request_security_context(*, ip_prefix: str | None, user_agent_hash: str | None) -> None:
    _ip_prefix_ctx.set(ip_prefix)
    _ua_hash_ctx.set(user_agent_hash)


def get_request_ip_prefix() -> str | None:
    return _ip_prefix_ctx.get()


def get_request_user_agent_hash() -> str | None:
    return _ua_hash_ctx.get()
