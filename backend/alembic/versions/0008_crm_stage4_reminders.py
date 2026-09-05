"""crm stage 4 reminders"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0008_crm_stage4_reminders"
down_revision = "0007_crm_stage3_documents"
branch_labels = None
depends_on = None


reminder_target_type_enum = sa.Enum(
    "client",
    "order",
    name="crm_reminder_target_type_enum",
    native_enum=False,
)

reminder_status_enum = sa.Enum(
    "active",
    "postponed",
    "done",
    name="crm_reminder_status_enum",
    native_enum=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    reminder_target_type_enum.create(bind, checkfirst=True)
    reminder_status_enum.create(bind, checkfirst=True)

    op.create_table(
        "crm_reminders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("target_type", reminder_target_type_enum, nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=False),
        sa.Column("text", sa.String(length=500), nullable=False),
        sa.Column("due_at", sa.DateTime(), nullable=False),
        sa.Column(
            "status",
            reminder_status_enum,
            nullable=False,
            server_default="active",
        ),
        sa.Column("postpone_until", sa.DateTime(), nullable=True),
        sa.Column("repeat_rule", sa.String(length=255), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["crm_users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_crm_reminders_target_type", "crm_reminders", ["target_type"], unique=False)
    op.create_index("ix_crm_reminders_target_id", "crm_reminders", ["target_id"], unique=False)
    op.create_index("ix_crm_reminders_status", "crm_reminders", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_crm_reminders_status", table_name="crm_reminders")
    op.drop_index("ix_crm_reminders_target_id", table_name="crm_reminders")
    op.drop_index("ix_crm_reminders_target_type", table_name="crm_reminders")
    op.drop_table("crm_reminders")

    bind = op.get_bind()
    reminder_status_enum.drop(bind, checkfirst=True)
    reminder_target_type_enum.drop(bind, checkfirst=True)
