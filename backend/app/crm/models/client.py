from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.encrypted_types import EncryptedText
from app.db.base import Base, TimestampMixin


class CrmClient(TimestampMixin, Base):
    __tablename__ = "crm_clients"

    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(EncryptedText(), nullable=False)
    client_type: Mapped[str] = mapped_column(String(16), nullable=False, default="individual")
    phone_display: Mapped[str] = mapped_column(EncryptedText(), nullable=False)
    phone_normalized: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    phone_search_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    phone_fragment_hashes: Mapped[list[str]] = mapped_column(ARRAY(String(64)), nullable=False, default=list)
    name_search_hashes: Mapped[list[str] | None] = mapped_column(ARRAY(String(64)), nullable=True)
    address: Mapped[str | None] = mapped_column(EncryptedText(), nullable=True)
    company_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    inn: Mapped[str | None] = mapped_column(String(32), nullable=True)
    kpp: Mapped[str | None] = mapped_column(String(32), nullable=True)
    ogrn: Mapped[str | None] = mapped_column(String(32), nullable=True)
    legal_address: Mapped[str | None] = mapped_column(EncryptedText(), nullable=True)
    actual_address: Mapped[str | None] = mapped_column(EncryptedText(), nullable=True)
    representative_full_name: Mapped[str | None] = mapped_column(EncryptedText(), nullable=True)
    representative_position: Mapped[str | None] = mapped_column(String(255), nullable=True)
    representative_basis: Mapped[str | None] = mapped_column(EncryptedText(), nullable=True)
    telegram_username: Mapped[str | None] = mapped_column(String(65), nullable=True)
    comment: Mapped[str | None] = mapped_column(EncryptedText(), nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    vehicles = relationship("CrmVehicle", back_populates="client")
    orders = relationship("CrmOrder", back_populates="client", foreign_keys="CrmOrder.client_id")
    payer_orders = relationship("CrmOrder", foreign_keys="CrmOrder.payer_client_id", back_populates="payer_client")

    @property
    def is_individual(self) -> bool:
        return (self.client_type or "individual") == "individual"

    @property
    def is_legal(self) -> bool:
        return (self.client_type or "individual") == "legal"

    @property
    def display_label(self) -> str:
        if self.is_legal:
            for value in (self.company_name, self.full_name, self.phone_display):
                text = value.strip() if isinstance(value, str) else ""
                if text:
                    return text
        for value in (self.full_name, self.company_name, self.phone_display):
            text = value.strip() if isinstance(value, str) else ""
            if text:
                return text
        return self.phone_normalized
