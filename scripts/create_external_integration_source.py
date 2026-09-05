from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.crm.models.external_lead import CrmIntegrationSource  # noqa: E402
from app.crm.services.external_lead_service import ExternalLeadService  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create an external lead integration source and print its API key once.")
    parser.add_argument("--name", required=True, help="Human-readable source name")
    parser.add_argument("--type", default="website", help="Source type, for example website, cms, quiz")
    parser.add_argument(
        "--allowed-domain",
        action="append",
        dest="allowed_domains",
        default=None,
        help="Allowed domain. Repeat the flag to add multiple domains.",
    )
    parser.add_argument("--inactive", action="store_true", help="Create the source in inactive state")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    api_key = ExternalLeadService.generate_api_key()
    session = SessionLocal()
    try:
        source = CrmIntegrationSource(
            name=args.name.strip(),
            type=args.type.strip() or "website",
            api_key_hash=ExternalLeadService.hash_api_key(api_key),
            is_active=not args.inactive,
            allowed_domains=[item.strip() for item in (args.allowed_domains or []) if item.strip()] or None,
        )
        session.add(source)
        session.commit()
        print(f"Integration source created: id={source.id}, name={source.name}, type={source.type}, active={source.is_active}")
        print("API key (store it now, it will not be shown again):")
        print(api_key)
        return 0
    finally:
        session.close()


if __name__ == "__main__":
    raise SystemExit(main())
