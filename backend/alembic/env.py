from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import get_settings
from app.db.alembic_versioning import patch_alembic_version_table_impl
from app.crm.models import (  # noqa: F401
    CrmAuditLog,
    CrmCarBrand,
    CustomFieldDef,  # noqa: F401
    OrderFieldValue,  # noqa: F401
    CrmOrderStatus,  # noqa: F401
    CrmCarModel,
    CrmClient,
    CrmDocument,
    CrmDocumentTemplate,
    CrmExternalLeadPayloadLog,
    CrmExternalLeadSubmission,
    CrmFinanceCategory,
    CrmFinanceExpense,
    CrmFinanceExpenseAttachment,
    CrmIntegrationSource,
    CrmMaterial,
    CrmMaterialAttachment,
    CrmNote,
    CrmOrder,
    CrmOrderPayment,
    CrmOrderService,
    CrmReminder,
    CrmRole,
    CrmServiceCatalog,
    CrmServiceCategory,
    CrmSetting,
    CrmUser,
    CrmUserPermission,
    CrmUserSession,
    CrmVehicle,
    CrmVehicleOwnerHistory,
    DocumentType,
    ReminderStatus,
    ReminderTargetType,
)
from app.db.base import Base

config = context.config
settings = get_settings()
patch_alembic_version_table_impl()
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None and not config.attributes.get("skip_logging_config", False):
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
