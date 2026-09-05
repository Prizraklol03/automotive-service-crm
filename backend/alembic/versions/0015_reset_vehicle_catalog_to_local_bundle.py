"""reset vehicle catalog and load brands/models from local bundle"""

from __future__ import annotations

import json
from pathlib import Path

from alembic import op
import sqlalchemy as sa

from app.crm.utils.normalization import canonicalize_reference_name, normalize_reference_lookup_key


revision = "0015_reset_vehicle_catalog_to_local_bundle"
down_revision = "0014_material_expenses"
branch_labels = None
depends_on = None


def _bundle_path() -> Path:
    return Path(__file__).resolve().parents[3] / "car_catalog_files" / "car_catalog_bundle.json"


def upgrade() -> None:
    bind = op.get_bind()
    brand_table = sa.table(
        "crm_car_brands",
        sa.column("id", sa.Integer),
        sa.column("name", sa.String),
        sa.column("normalized_name", sa.String),
        sa.column("source_name", sa.String),
        sa.column("source_brand_id", sa.String),
        sa.column("sort_order", sa.Integer),
        sa.column("is_active", sa.Boolean),
    )
    model_table = sa.table(
        "crm_car_models",
        sa.column("brand_id", sa.Integer),
        sa.column("name", sa.String),
        sa.column("normalized_name", sa.String),
        sa.column("source_name", sa.String),
        sa.column("source_model_id", sa.String),
        sa.column("sort_order", sa.Integer),
        sa.column("is_active", sa.Boolean),
    )
    setting_table = sa.table(
        "crm_settings",
        sa.column("key", sa.String),
        sa.column("value", sa.String),
    )

    payload = json.loads(_bundle_path().read_text(encoding="utf-8"))

    op.execute("UPDATE crm_vehicles SET brand_id = NULL, model_id = NULL")
    op.execute("DELETE FROM crm_car_models")
    op.execute("DELETE FROM crm_car_brands")

    for brand_index, brand in enumerate(payload.get("brands", []), start=1):
        brand_slug = str(brand.get("slug") or "").strip()
        brand_name = str(brand.get("display_name") or brand.get("name_en") or brand.get("name_ru") or "").strip()
        if not brand_slug or not brand_name:
            continue

        canonical_brand_name = canonicalize_reference_name(brand_name)
        brand_result = bind.execute(
            sa.insert(brand_table).values(
                name=canonical_brand_name,
                normalized_name=normalize_reference_lookup_key(canonical_brand_name, entity="brand"),
                source_name="local_bundle",
                source_brand_id=brand_slug,
                sort_order=brand_index,
                is_active=True,
            )
        )
        brand_id = bind.execute(
            sa.select(brand_table.c.id).where(
                brand_table.c.source_name == "local_bundle",
                brand_table.c.source_brand_id == brand_slug,
            )
        ).scalar_one()

        for model_index, model in enumerate(brand.get("models", []), start=1):
            model_slug = str(model.get("slug") or "").strip()
            model_name = str(model.get("display_name") or model.get("name_en") or model.get("name_ru") or "").strip()
            if not model_slug or not model_name:
                continue

            canonical_model_name = canonicalize_reference_name(model_name)
            bind.execute(
                sa.insert(model_table).values(
                    brand_id=brand_id,
                    name=canonical_model_name,
                    normalized_name=normalize_reference_lookup_key(canonical_model_name, entity="model"),
                    source_name="local_bundle",
                    source_model_id=f"{brand_slug}:{model_slug}",
                    sort_order=model_index,
                    is_active=True,
                )
            )

    bind.execute(sa.delete(setting_table).where(setting_table.c.key == "vehicle_catalog_last_sync_provider"))
    bind.execute(sa.delete(setting_table).where(setting_table.c.key == "vehicle_catalog_last_synced_at"))
    bind.execute(sa.insert(setting_table).values(key="vehicle_catalog_last_sync_provider", value="local_bundle"))


def downgrade() -> None:
    pass
