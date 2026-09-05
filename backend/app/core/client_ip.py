from __future__ import annotations

import ipaddress

from fastapi import Request


def resolve_client_ip(request: Request, trusted_proxy_cidrs: str | None) -> str | None:
    peer = request.client.host if request.client else None
    if not peer:
        return None

    try:
        peer_ip = ipaddress.ip_address(peer.strip())
    except ValueError:
        return peer

    trusted_networks = _parse_trusted_proxy_cidrs(trusted_proxy_cidrs)
    if not any(peer_ip in network for network in trusted_networks):
        return str(peer_ip)

    forwarded_for = request.headers.get("x-forwarded-for", "").strip()
    if not forwarded_for:
        return str(peer_ip)

    try:
        forwarded_chain = [ipaddress.ip_address(item.strip()) for item in forwarded_for.split(",") if item.strip()]
    except ValueError:
        return str(peer_ip)
    if not forwarded_chain or len(forwarded_chain) > 20:
        return str(peer_ip)

    for candidate in reversed(forwarded_chain):
        if not any(candidate in network for network in trusted_networks):
            return str(candidate)
    return str(forwarded_chain[0])


def _parse_trusted_proxy_cidrs(raw_value: str | None) -> tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...]:
    networks: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = []
    for item in (raw_value or "").split(","):
        candidate = item.strip()
        if not candidate:
            continue
        try:
            networks.append(ipaddress.ip_network(candidate, strict=False))
        except ValueError:
            continue
    return tuple(networks)
