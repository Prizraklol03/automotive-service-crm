from __future__ import annotations

import argparse
import json

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.crm.services.session_housekeeping_service import SessionHousekeepingService
from app.crm.services.user_service import UserService
from app.crm.services.vehicle_catalog_sync_service import VehicleCatalogSyncService
from app.db.migrations import run_migrations
from app.db.session import SessionLocal


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="CRM backend management commands")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("migrate", help="Apply database migrations to head")

    bootstrap_admin = subparsers.add_parser(
        "bootstrap-admin",
        help="Create the bootstrap admin if the user table is empty",
    )
    bootstrap_admin.add_argument("--login", default=None)
    bootstrap_admin.add_argument("--password", default=None)
    bootstrap_admin.add_argument("--full-name", default=None)

    sync_vehicle_catalog = subparsers.add_parser(
        "sync-vehicle-catalog",
        help="Import or refresh the vehicle brand/model reference catalog",
    )
    sync_vehicle_catalog.add_argument(
        "--monthly-only",
        action="store_true",
        help="Run sync only when the monthly interval has elapsed",
    )
    sync_vehicle_catalog.add_argument(
        "--replace",
        action="store_true",
        help="Explicitly detach references and fully replace the catalog after validation",
    )
    sync_vehicle_catalog.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and simulate catalog changes without committing them",
    )

    cleanup_auth_sessions = subparsers.add_parser(
        "cleanup-auth-sessions",
        help="Delete stale revoked or long-expired auth sessions outside the active retention window",
    )
    cleanup_auth_sessions.add_argument(
        "--retention-days",
        type=int,
        default=30,
        help="Keep revoked sessions for this many days before purging them",
    )
    cleanup_auth_sessions.add_argument(
        "--dry-run",
        action="store_true",
        help="Show how many stale sessions would be removed without deleting them",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    configure_logging()

    if args.command == "migrate":
        run_migrations()
        print(json.dumps({"status": "ok", "migrations": "head"}, ensure_ascii=False))
        return

    session = SessionLocal()
    try:
        if args.command == "bootstrap-admin":
            settings = get_settings()
            service = UserService(session)
            service.ensure_default_roles()
            user = service.ensure_bootstrap_admin(
                login=args.login or settings.bootstrap_admin_login,
                password=args.password or settings.bootstrap_admin_password,
                full_name=args.full_name or settings.bootstrap_admin_full_name,
            )
            payload = {
                "status": "created" if user else "skipped",
                "login": None if user is None else user.login,
            }
            print(json.dumps(payload, ensure_ascii=False))
            return

        if args.command == "sync-vehicle-catalog":
            service = VehicleCatalogSyncService(session)
            result = (
                service.sync_if_due(replace=args.replace, dry_run=args.dry_run)
                if args.monthly_only
                else service.sync(replace=args.replace, dry_run=args.dry_run)
            )
            payload = {"status": "skipped"} if result is None else result.as_dict()
            print(json.dumps(payload, ensure_ascii=False, indent=2))
            return

        if args.command == "cleanup-auth-sessions":
            result = SessionHousekeepingService(session).purge_stale_sessions(
                retention_days=args.retention_days,
                dry_run=args.dry_run,
            )
            print(json.dumps(result.as_dict(), ensure_ascii=False, indent=2))
            return

        parser.error(f"Unsupported command: {args.command}")
    finally:
        session.close()


if __name__ == "__main__":
    main()
