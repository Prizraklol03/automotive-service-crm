from __future__ import annotations

import os
import sys
from ipaddress import ip_network
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


APP_DATA_FOLDER = "AutomotiveServiceCRM"
AUTH_SECRET_KEY_VARIABLE = "AUTH_SECRET_KEY"
AUTH_SECRET_KEY_DEVELOPMENT_DEFAULT = "development-only-placeholder"
AUTH_SECRET_KEY_MIN_BYTES = 32
NON_PRODUCTION_ENVIRONMENTS = frozenset({"development", "dev", "test", "testing"})
SAFE_PRODUCTION_COOKIE_SAMESITE = frozenset({"lax", "strict"})
DEFAULT_DATABASE_URL = "postgresql+psycopg://app_user:CHANGE_ME@127.0.0.1:5432/automotive_crm"
DEFAULT_TRUSTED_HOSTS = "localhost,127.0.0.1,backend"

DEFAULT_CORS_ORIGINS = ",".join(
    [
        "http://localhost:1420",
        "http://127.0.0.1:1420",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "tauri://localhost",
        "http://tauri.localhost",
        "https://tauri.localhost",
        "app://localhost",
    ]
)


def is_frozen_bundle() -> bool:
    return getattr(sys, "frozen", False)


def get_bundle_root() -> Path:
    if is_frozen_bundle():
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).resolve().parent))
    return Path(__file__).resolve().parents[3]


def get_backend_root() -> Path:
    if is_frozen_bundle():
        return get_bundle_root() / "backend"
    return Path(__file__).resolve().parents[2]


def get_runtime_dir() -> Path:
    explicit = os.getenv("APP_RUNTIME_DIR")
    if explicit:
        path = Path(explicit)
    elif is_frozen_bundle():
        local_app_data = Path(os.getenv("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
        path = local_app_data / APP_DATA_FOLDER
    else:
        path = Path(__file__).resolve().parents[3]

    path.mkdir(parents=True, exist_ok=True)
    return path


def get_default_backup_dir() -> Path:
    path = get_runtime_dir() / "backups"
    path.mkdir(parents=True, exist_ok=True)
    return path


def parse_csv_list(raw_value: str | None) -> list[str]:
    if not raw_value:
        return []
    return [item.strip() for item in raw_value.split(",") if item.strip()]


def is_non_production_environment(app_env: str) -> bool:
    return app_env.strip().lower() in NON_PRODUCTION_ENVIRONMENTS


def get_openapi_urls(app_env: str) -> tuple[str | None, str | None, str | None]:
    if is_non_production_environment(app_env):
        return "/openapi.json", "/docs", "/redoc"
    return None, None, None


def validate_auth_refresh_cookie_policy(*, app_env: str, secure: bool, samesite: str) -> str:
    normalized_samesite = samesite.strip().lower()
    if is_non_production_environment(app_env):
        return normalized_samesite
    if not secure:
        raise ValueError("AUTH_REFRESH_COOKIE_SECURE must be true in staging/production")
    if normalized_samesite not in SAFE_PRODUCTION_COOKIE_SAMESITE:
        raise ValueError("AUTH_REFRESH_COOKIE_SAMESITE must be lax or strict in staging/production")
    return normalized_samesite


def get_documents_root_dir() -> Path:
    path = get_runtime_dir() / "storage" / "documents"
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_document_templates_dir() -> Path:
    explicit = os.getenv("DOCUMENT_TEMPLATES_DIR")
    if explicit:
        path = Path(explicit)
    else:
        repo_local = get_bundle_root() / "documents_templates"
        path = repo_local if repo_local.exists() else get_runtime_dir() / "storage" / "document_templates"
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_generated_documents_dir() -> Path:
    path = get_documents_root_dir() / "generated"
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_seed_document_templates_dir() -> Path:
    return get_document_templates_dir()


def validate_database_url(raw_value: str) -> str:
    database_url = raw_value.strip()
    is_postgresql_url = database_url.startswith("postgresql://") or (
        database_url.startswith("postgresql+") and "://" in database_url
    )
    if not is_postgresql_url:
        raise ValueError("DATABASE_URL must be configured with a PostgreSQL URL; SQLite is no longer supported.")
    return database_url


def validate_auth_secret_key(*, app_env: str, secret_key: str | None) -> str:
    if is_non_production_environment(app_env):
        return secret_key if secret_key is not None else AUTH_SECRET_KEY_DEVELOPMENT_DEFAULT

    if secret_key is None or not secret_key.strip():
        raise ValueError(f"{AUTH_SECRET_KEY_VARIABLE} must be explicitly configured and must not be empty or whitespace")
    if secret_key == AUTH_SECRET_KEY_DEVELOPMENT_DEFAULT:
        raise ValueError(f"{AUTH_SECRET_KEY_VARIABLE} must not use the development default in staging/production")
    if len(secret_key.encode("utf-8")) < AUTH_SECRET_KEY_MIN_BYTES:
        raise ValueError(
            f"{AUTH_SECRET_KEY_VARIABLE} must contain at least {AUTH_SECRET_KEY_MIN_BYTES} UTF-8 bytes in staging/production"
        )
    return secret_key


def validate_trusted_proxy_cidrs(*, app_env: str, raw_value: str | None) -> str:
    raw_cidrs = (raw_value or "").strip()
    if is_non_production_environment(app_env):
        return raw_cidrs
    if not raw_cidrs:
        raise ValueError("TRUSTED_PROXY_CIDRS must be explicitly configured in staging/production")

    normalized_networks: list[str] = []
    for raw_cidr in raw_cidrs.split(","):
        candidate = raw_cidr.strip()
        if not candidate:
            raise ValueError("TRUSTED_PROXY_CIDRS must contain only valid, explicit CIDRs in staging/production")
        try:
            network = ip_network(candidate, strict=False)
        except ValueError as exc:
            raise ValueError("TRUSTED_PROXY_CIDRS must contain only valid, explicit CIDRs in staging/production") from exc
        if network.prefixlen == 0:
            raise ValueError("TRUSTED_PROXY_CIDRS must not contain a wildcard CIDR in staging/production")
        normalized_networks.append(str(network))
    return ",".join(normalized_networks)


def _require_explicit_nonempty(*, variable_name: str, value: str | None) -> None:
    if value is None or not value.strip():
        raise ValueError(f"{variable_name} must be explicitly configured in staging/production")


def _validate_production_origins(raw_value: str) -> None:
    origins = parse_csv_list(raw_value)
    if not origins:
        raise ValueError("CORS_ALLOWED_ORIGINS must be explicitly configured in staging/production")
    if any(origin == "*" or "*" in origin or not origin.startswith("https://") for origin in origins):
        raise ValueError("CORS_ALLOWED_ORIGINS must contain explicit HTTPS origins without wildcards in staging/production")


def _validate_production_hosts(raw_value: str) -> None:
    hosts = parse_csv_list(raw_value)
    if not hosts:
        raise ValueError("TRUSTED_HOSTS must be explicitly configured in staging/production")
    if any(host == "*" or "*" in host for host in hosts):
        raise ValueError("TRUSTED_HOSTS must not contain wildcard hosts in staging/production")


def validate_runtime_configuration(settings: "Settings") -> None:
    """Validate startup configuration without including values in failures or logs."""

    settings.database_url = validate_database_url(settings.database_url)
    settings.auth_secret_key = validate_auth_secret_key(
        app_env=settings.app_env,
        secret_key=settings.auth_secret_key,
    )
    settings.auth_refresh_cookie_samesite = validate_auth_refresh_cookie_policy(
        app_env=settings.app_env,
        secure=settings.auth_refresh_cookie_secure,
        samesite=settings.auth_refresh_cookie_samesite,
    )
    settings.trusted_proxy_cidrs = validate_trusted_proxy_cidrs(
        app_env=settings.app_env,
        raw_value=settings.trusted_proxy_cidrs,
    )

    if is_non_production_environment(settings.app_env):
        return

    if settings.database_url == DEFAULT_DATABASE_URL:
        raise ValueError("DATABASE_URL must be explicitly configured in staging/production")
    if settings.trusted_hosts == DEFAULT_TRUSTED_HOSTS:
        raise ValueError("TRUSTED_HOSTS must be explicitly configured in staging/production")
    if settings.crm_insecure_http_allowed:
        raise ValueError("CRM_INSECURE_HTTP_ALLOWED must be false in staging/production")
    if settings.auth_access_token_ttl_minutes > 15:
        raise ValueError("AUTH_ACCESS_TOKEN_TTL_MINUTES must be 15 minutes or lower in staging/production")

    _validate_production_origins(settings.cors_allowed_origins)
    _validate_production_hosts(settings.trusted_hosts)
    for variable_name, value in (
        ("CRM_DATA_ENCRYPTION_KEY", settings.crm_data_encryption_key),
        ("CRM_DATA_ENCRYPTION_KEY_ID", settings.crm_data_encryption_key_id),
        ("CRM_DATA_HASH_KEY", settings.crm_data_hash_key),
        ("CRM_FILE_ENCRYPTION_KEY", settings.crm_file_encryption_key),
        ("CRM_FILE_ENCRYPTION_KEY_ID", settings.crm_file_encryption_key_id),
    ):
        _require_explicit_nonempty(variable_name=variable_name, value=value)


def get_env_file() -> Path | None:
    runtime_env = get_runtime_dir() / ".env"
    if runtime_env.exists():
        return runtime_env

    repo_env = Path(__file__).resolve().parents[3] / ".env"
    if repo_env.exists():
        return repo_env
    return None


class Settings(BaseSettings):
    app_env: str = Field(default="development", alias="APP_ENV")
    app_name: str = Field(default="Automotive Service CRM", alias="APP_NAME")
    app_timezone: str = Field(default="Asia/Krasnoyarsk", alias="APP_TIMEZONE")
    api_host: str = Field(default="0.0.0.0", alias="API_HOST")
    api_port: int = Field(default=8000, alias="API_PORT")
    api_base_path: str = Field(default="/api", alias="API_BASE_PATH")
    database_url: str = Field(
        default=DEFAULT_DATABASE_URL,
        alias="DATABASE_URL",
    )
    cors_allowed_origins: str = Field(default=DEFAULT_CORS_ORIGINS, alias="CORS_ALLOWED_ORIGINS")
    trusted_hosts: str = Field(default=DEFAULT_TRUSTED_HOSTS, alias="TRUSTED_HOSTS")
    trusted_proxy_cidrs: str = Field(default="", alias="TRUSTED_PROXY_CIDRS")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    log_json: bool = Field(default=False, alias="LOG_JSON")
    app_version: str = Field(default="0.1.0", alias="APP_VERSION")
    runtime_dir: str = Field(default_factory=lambda: str(get_runtime_dir()), alias="APP_RUNTIME_DIR")
    auth_secret_key: str = Field(default=AUTH_SECRET_KEY_DEVELOPMENT_DEFAULT, alias=AUTH_SECRET_KEY_VARIABLE)
    auth_access_token_ttl_minutes: int = Field(default=15, alias="AUTH_ACCESS_TOKEN_TTL_MINUTES")
    auth_refresh_inactivity_ttl_days: int = Field(default=30, alias="AUTH_REFRESH_INACTIVITY_TTL_DAYS")
    auth_refresh_absolute_ttl_days: int = Field(default=90, alias="AUTH_REFRESH_ABSOLUTE_TTL_DAYS")
    auth_refresh_cookie_name: str = Field(default="crm_refresh_token", alias="AUTH_REFRESH_COOKIE_NAME")
    auth_refresh_cookie_secure: bool = Field(default=False, alias="AUTH_REFRESH_COOKIE_SECURE")
    auth_refresh_cookie_samesite: str = Field(default="lax", alias="AUTH_REFRESH_COOKIE_SAMESITE")
    crm_insecure_http_allowed: bool = Field(default=False, alias="CRM_INSECURE_HTTP_ALLOWED")
    crm_data_encryption_key: str = Field(default="", alias="CRM_DATA_ENCRYPTION_KEY")
    crm_data_encryption_key_id: str = Field(default="v1", alias="CRM_DATA_ENCRYPTION_KEY_ID")
    crm_data_hash_key: str = Field(default="", alias="CRM_DATA_HASH_KEY")
    crm_file_encryption_key: str = Field(default="", alias="CRM_FILE_ENCRYPTION_KEY")
    crm_file_encryption_key_id: str = Field(default="", alias="CRM_FILE_ENCRYPTION_KEY_ID")
    crm_public_share_enabled: bool = Field(default=False, alias="PUBLIC_SHARE_ENABLED")
    auth_login_rate_limit_window_seconds: int = Field(default=900, alias="AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS")
    auth_login_rate_limit_attempts: int = Field(default=5, alias="AUTH_LOGIN_RATE_LIMIT_ATTEMPTS")
    auth_refresh_rate_limit_window_seconds: int = Field(default=60, alias="AUTH_REFRESH_RATE_LIMIT_WINDOW_SECONDS")
    auth_refresh_rate_limit_attempts: int = Field(default=20, alias="AUTH_REFRESH_RATE_LIMIT_ATTEMPTS")
    external_lead_max_body_bytes: int = Field(default=65_536, ge=1024, le=1_048_576, alias="EXTERNAL_LEAD_MAX_BODY_BYTES")
    external_lead_rate_limit_window_seconds: int = Field(default=60, ge=1, alias="EXTERNAL_LEAD_RATE_LIMIT_WINDOW_SECONDS")
    external_lead_rate_limit_attempts: int = Field(default=30, ge=1, alias="EXTERNAL_LEAD_RATE_LIMIT_ATTEMPTS")
    public_photo_list_rate_limit_window_seconds: int = Field(default=300, ge=1, alias="PUBLIC_PHOTO_LIST_RATE_LIMIT_WINDOW_SECONDS")
    public_photo_list_rate_limit_attempts: int = Field(default=60, ge=1, alias="PUBLIC_PHOTO_LIST_RATE_LIMIT_ATTEMPTS")
    public_photo_file_rate_limit_window_seconds: int = Field(default=300, ge=1, alias="PUBLIC_PHOTO_FILE_RATE_LIMIT_WINDOW_SECONDS")
    public_photo_file_rate_limit_attempts: int = Field(default=240, ge=1, alias="PUBLIC_PHOTO_FILE_RATE_LIMIT_ATTEMPTS")
    bootstrap_admin_login: str | None = Field(default=None, alias="BOOTSTRAP_ADMIN_LOGIN")
    bootstrap_admin_password: str | None = Field(default=None, alias="BOOTSTRAP_ADMIN_PASSWORD")
    bootstrap_admin_full_name: str = Field(default="Local Admin", alias="BOOTSTRAP_ADMIN_FULL_NAME")
    docx_pdf_converter: str = Field(default="auto", alias="DOCX_PDF_CONVERTER")
    libreoffice_executable_path: str | None = Field(default=None, alias="LIBREOFFICE_EXECUTABLE_PATH")
    docx2pdf_python_executable: str | None = Field(default=None, alias="DOCX2PDF_PYTHON_EXECUTABLE")
    document_templates_dir: str = Field(default_factory=lambda: str(get_document_templates_dir()), alias="DOCUMENT_TEMPLATES_DIR")
    vehicle_catalog_provider: str = Field(default="local_bundle", alias="VEHICLE_CATALOG_PROVIDER")
    vehicle_catalog_bundle_path: str = Field(
        default="car_catalog_files/car_catalog_bundle.json",
        alias="VEHICLE_CATALOG_BUNDLE_PATH",
    )
    vehicle_catalog_source_base_url: str = Field(
        default="https://example.invalid/api/vehicles",
        alias="VEHICLE_CATALOG_SOURCE_BASE_URL",
    )
    vehicle_catalog_sync_timeout_seconds: int = Field(default=30, alias="VEHICLE_CATALOG_SYNC_TIMEOUT_SECONDS")
    vehicle_catalog_sync_workers: int = Field(default=8, alias="VEHICLE_CATALOG_SYNC_WORKERS")
    vehicle_catalog_monthly_sync_enabled: bool = Field(default=False, alias="VEHICLE_CATALOG_MONTHLY_SYNC_ENABLED")
    vehicle_catalog_sync_interval_days: int = Field(default=30, alias="VEHICLE_CATALOG_SYNC_INTERVAL_DAYS")
    vehicle_catalog_sync_fail_on_error: bool = Field(default=False, alias="VEHICLE_CATALOG_SYNC_FAIL_ON_ERROR")
    external_leads_duplicate_window_hours: int = Field(default=24, alias="EXTERNAL_LEADS_DUPLICATE_WINDOW_HOURS")

    model_config = SettingsConfigDict(
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    settings = Settings(_env_file=get_env_file())
    validate_runtime_configuration(settings)
    settings.runtime_dir = str(get_runtime_dir())
    settings.document_templates_dir = str(get_document_templates_dir())
    return settings
