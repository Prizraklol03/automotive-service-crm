"""rename employee role code to standard_user

Revision ID: 0057_standard_user_role_code
Revises: 0056_client_name_blind_tokens
Create Date: 2026-07-16

Session revocation and token-version increments performed by upgrade are
intentionally irreversible. Downgrade only restores the role code and name.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0057_standard_user_role_code"
down_revision = "0056_client_name_blind_tokens"
branch_labels = None
depends_on = None


def _locked_role_id(*, source_code: str, target_code: str) -> int:
    bind = op.get_bind()
    bind.execute(sa.text("LOCK TABLE crm_roles IN EXCLUSIVE MODE"))
    rows = bind.execute(
        sa.text(
            """
            SELECT id, code
            FROM crm_roles
            WHERE code = :source_code OR code = :target_code
            ORDER BY id
            """
        ),
        {"source_code": source_code, "target_code": target_code},
    ).mappings().all()
    roles_by_code = {row["code"]: row["id"] for row in rows}

    if target_code in roles_by_code:
        raise RuntimeError(
            f"Cannot rename role {source_code!r} to {target_code!r}: target role already exists"
        )
    if source_code not in roles_by_code:
        raise RuntimeError(
            f"Cannot rename role {source_code!r} to {target_code!r}: source role does not exist"
        )
    return int(roles_by_code[source_code])


def upgrade() -> None:
    bind = op.get_bind()
    role_id = _locked_role_id(source_code="employee", target_code="standard_user")

    bind.execute(
        sa.text(
            """
            UPDATE crm_roles
            SET code = 'standard_user',
                name = 'Standard User',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :role_id
            """
        ),
        {"role_id": role_id},
    )
    bind.execute(
        sa.text(
            """
            UPDATE crm_users
            SET token_version = token_version + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE role_id = :role_id
            """
        ),
        {"role_id": role_id},
    )
    bind.execute(
        sa.text(
            """
            UPDATE crm_user_sessions
            SET revoked_at = CURRENT_TIMESTAMP,
                revoke_reason = 'role_code_migration'
            WHERE revoked_at IS NULL
              AND expires_at > CURRENT_TIMESTAMP
              AND absolute_expires_at > CURRENT_TIMESTAMP
              AND user_id IN (
                  SELECT id
                  FROM crm_users
                  WHERE role_id = :role_id
              )
            """
        ),
        {"role_id": role_id},
    )


def downgrade() -> None:
    bind = op.get_bind()
    role_id = _locked_role_id(source_code="standard_user", target_code="employee")
    bind.execute(
        sa.text(
            """
            UPDATE crm_roles
            SET code = 'employee',
                name = 'Employee',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :role_id
            """
        ),
        {"role_id": role_id},
    )
