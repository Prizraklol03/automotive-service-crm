from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from sqlalchemy.orm import Session

from app.api.routers import api_router
from app.core.cache_control import NoStoreApiResponsesMiddleware
from app.core.config import get_openapi_urls, get_settings, is_non_production_environment, parse_csv_list
from app.core.crypto import get_file_encryption_service
from app.core.errors import register_exception_handlers
from app.core.key_identity import validate_runtime_key_identities
from app.core.logging import configure_logging, get_logger
from app.crm.services.document_template_service import DocumentTemplateService
from app.crm.services.finance_service import FinanceService
from app.crm.services.settings_service import SettingsService
from app.crm.services.user_service import UserService
from app.crm.services.vehicle_catalog_sync_service import maybe_run_monthly_vehicle_catalog_sync
from app.db.session import SessionLocal

settings = get_settings()
configure_logging()
logger = get_logger(__name__)


def _validate_security_runtime(session: Session) -> None:
    if is_non_production_environment(settings.app_env):
        return

    get_file_encryption_service()
    validate_runtime_key_identities(session.connection(), app_env=settings.app_env)


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info("Starting %s", settings.app_name)

    session = SessionLocal()
    try:
        _validate_security_runtime(session)
        user_service = UserService(session)
        user_service.ensure_default_roles()
        user_service.ensure_bootstrap_admin(
            login=settings.bootstrap_admin_login,
            password=settings.bootstrap_admin_password,
            full_name=settings.bootstrap_admin_full_name,
        )
        SettingsService(session).ensure_defaults()
        DocumentTemplateService(session).ensure_default_templates()
        FinanceService(session).ensure_default_categories()
    finally:
        session.close()

    try:
        sync_result = maybe_run_monthly_vehicle_catalog_sync()
        if sync_result is not None:
            logger.info("Vehicle catalog monthly sync complete: %s", sync_result.as_dict())
    except Exception:
        if settings.vehicle_catalog_sync_fail_on_error:
            raise
        logger.exception("Vehicle catalog monthly sync failed; continuing startup")

    logger.info("Application startup complete")
    yield

    logger.info("Stopping %s", settings.app_name)


openapi_url, docs_url, redoc_url = get_openapi_urls(settings.app_env)

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
    openapi_url=openapi_url,
    docs_url=docs_url,
    redoc_url=redoc_url,
)

trusted_hosts = parse_csv_list(settings.trusted_hosts)
if trusted_hosts and "*" not in trusted_hosts:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=trusted_hosts)

allowed_origins = parse_csv_list(settings.cors_allowed_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)
app.add_middleware(NoStoreApiResponsesMiddleware, api_base_path=settings.api_base_path)

register_exception_handlers(app)
app.include_router(api_router, prefix=settings.api_base_path)
