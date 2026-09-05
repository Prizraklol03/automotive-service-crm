from __future__ import annotations

import base64
import hmac
import io
import secrets
import uuid
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_runtime_dir, get_settings
from app.core.errors import AppError
from app.core.paths import resolve_path_within_root
from app.core.time import app_now_naive
from app.crm.models.order import CrmOrder
from app.crm.models.order_photo import CrmOrderPhoto, PhotoStage
from app.crm.services.audit_log_service import AuditLogService


def get_photos_root() -> Path:
    path = get_runtime_dir() / "storage" / "photos"
    path.mkdir(parents=True, exist_ok=True)
    return path


class OrderPhotoService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.audit_logs = AuditLogService(session)

    # ------------------------------------------------------------------ upload

    def upload(self, order_id: int, stage: PhotoStage, file_bytes: bytes) -> CrmOrderPhoto:
        order = self.session.get(CrmOrder, order_id)
        if order is None:
            raise AppError(code="not_found", message="Заказ не найден", status_code=404)

        file_id = uuid.uuid4().hex
        filename = f"{file_id}.jpg"

        stage_dir = get_photos_root() / str(order_id) / stage.value
        stage_dir.mkdir(parents=True, exist_ok=True)

        file_path = stage_dir / filename
        thumb_path_val: str | None = None

        try:
            from PIL import Image, ImageOps  # type: ignore[import]

            img = Image.open(io.BytesIO(file_bytes))
            img = ImageOps.exif_transpose(img)
            if img.mode != "RGB":
                img = img.convert("RGB")

            # Save original (cap at 2400 px on long side)
            if max(img.size) > 2400:
                img.thumbnail((2400, 2400), Image.LANCZOS)
            img.save(file_path, "JPEG", quality=85)

            # Thumbnail (max 800 px)
            thumb_name = f"{file_id}_thumb.jpg"
            thumb_abs = stage_dir / thumb_name
            thumb = img.copy()
            thumb.thumbnail((800, 800), Image.LANCZOS)
            thumb.save(thumb_abs, "JPEG", quality=75)
            thumb_path_val = str(thumb_abs.relative_to(get_runtime_dir()))
        except Exception:
            # Pillow not installed or corrupt image — save raw bytes as-is
            file_path.write_bytes(file_bytes)

        sort_order = self.session.scalar(
            select(func.count()).where(
                CrmOrderPhoto.order_id == order_id,
                CrmOrderPhoto.stage == stage,
            )
        ) or 0

        photo = CrmOrderPhoto(
            order_id=order_id,
            stage=stage,
            sort_order=sort_order,
            filename=filename,
            storage_path=str(file_path.relative_to(get_runtime_dir())),
            thumb_path=thumb_path_val,
        )
        self.session.add(photo)
        self.session.commit()
        self.session.refresh(photo)
        return photo

    # ------------------------------------------------------------------- list

    def list_by_order(self, order_id: int) -> list[CrmOrderPhoto]:
        return list(
            self.session.scalars(
                select(CrmOrderPhoto)
                .where(CrmOrderPhoto.order_id == order_id)
                .order_by(CrmOrderPhoto.stage, CrmOrderPhoto.sort_order)
            )
        )

    # ----------------------------------------------------------------- delete

    def delete(self, order_id: int, photo_id: int) -> None:
        photo = self.session.get(CrmOrderPhoto, photo_id)
        if photo is None or photo.order_id != order_id:
            raise AppError(code="not_found", message="Фото не найдено", status_code=404)

        runtime_dir = get_runtime_dir()
        for rel in [photo.storage_path, photo.thumb_path]:
            if rel:
                try:
                    (runtime_dir / rel).unlink(missing_ok=True)
                except Exception:
                    pass

        self.session.delete(photo)
        self.session.commit()

    # ------------------------------------------------------------------ files

    def get_file_path(self, order_id: int, photo_id: int, *, thumbnail: bool = False) -> Path:
        photo = self.session.get(CrmOrderPhoto, photo_id)
        if photo is None or photo.order_id != order_id:
            raise AppError(code="not_found", message="Фото не найдено", status_code=404)
        runtime_dir = get_runtime_dir().resolve()
        relative_path = photo.thumb_path if thumbnail and photo.thumb_path else photo.storage_path
        path = resolve_path_within_root(runtime_dir, runtime_dir / relative_path)
        if path is None:
            raise AppError(code="not_found", message="Фото не найдено", status_code=404)
        return path

    def get_file_bytes(self, order_id: int, photo_id: int, *, thumbnail: bool = False) -> tuple[bytes, str]:
        return self.get_file_path(order_id, photo_id, thumbnail=thumbnail).read_bytes(), "image/jpeg"

    # --------------------------------------------------------------- sharing

    def get_share_info(self, order_id: int) -> tuple[str | None, int]:
        """Returns (share_token, order_id)."""
        order = self.session.get(CrmOrder, order_id)
        if order is None:
            raise AppError(code="not_found", message="Заказ не найден", status_code=404)
        return order.photo_share_token, order_id

    def generate_share_token(self, order_id: int, *, actor_user_id: int | None = None) -> str:
        if not get_settings().crm_public_share_enabled:
            raise AppError(code="forbidden", message="Public share disabled", status_code=403)
        order = self.session.get(CrmOrder, order_id)
        if order is None:
            raise AppError(code="not_found", message="Заказ не найден", status_code=404)
        if not order.photo_share_token:
            order.photo_share_token = secrets.token_urlsafe(32)
        order.photo_share_expires_at = None
        order.photo_share_revoked_at = None
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="order_photo_share",
            entity_id=order.id,
            action="generate",
            title="Order photo share link generated",
        )
        self.session.commit()
        return order.photo_share_token  # type: ignore[return-value]

    def revoke_share_token(self, order_id: int, *, actor_user_id: int | None = None) -> None:
        order = self.session.get(CrmOrder, order_id)
        if order is None:
            raise AppError(code="not_found", message="Заказ не найден", status_code=404)
        order.photo_share_token = None
        order.photo_share_revoked_at = app_now_naive()
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="order_photo_share",
            entity_id=order.id,
            action="revoke",
            title="Order photo share link revoked",
        )
        self.session.commit()

    def list_by_share_token(self, token: str) -> tuple[list[CrmOrderPhoto], int]:
        order = self._resolve_share_order(token)
        return self.list_by_order(order.id), order.id

    def get_shared_file_bytes(self, token: str, photo_key: str, *, thumbnail: bool) -> tuple[bytes, str]:
        if len(photo_key) != 43:
            raise AppError(code="not_found", message="Share page not found", status_code=404)
        order = self._resolve_share_order(token)
        photo = next(
            (
                item
                for item in self.list_by_order(order.id)
                if hmac.compare_digest(self.get_public_photo_key(token, item.id), photo_key)
            ),
            None,
        )
        if photo is None:
            raise AppError(code="not_found", message="Share page not found", status_code=404)
        return self.get_file_bytes(order.id, photo.id, thumbnail=thumbnail)

    @staticmethod
    def get_public_photo_key(token: str, photo_id: int) -> str:
        digest = hmac.digest(
            get_settings().auth_secret_key.encode("utf-8"),
            f"public-photo:{token}:{photo_id}".encode("utf-8"),
            "sha256",
        )
        return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")

    def _resolve_share_order(self, token: str) -> CrmOrder:
        if not get_settings().crm_public_share_enabled or not 32 <= len(token) <= 128:
            raise AppError(code="not_found", message="Share page not found", status_code=404)
        order = self.session.scalar(select(CrmOrder).where(CrmOrder.photo_share_token == token))
        if order is None or order.photo_share_revoked_at is not None:
            raise AppError(code="not_found", message="Share page not found", status_code=404)
        return order
