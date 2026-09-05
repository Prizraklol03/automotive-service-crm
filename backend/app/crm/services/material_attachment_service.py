from __future__ import annotations

import mimetypes
import re
import uuid
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.core.config import get_runtime_dir
from app.core.errors import AppError
from app.crm.models.material_attachment import CrmMaterialAttachment
from app.crm.repositories.material_attachment_repository import MaterialAttachmentRepository
from app.crm.repositories.material_repository import MaterialRepository

_MAX_UPLOAD_BYTES = 20 * 1024 * 1024


def get_material_attachments_root() -> Path:
    path = get_runtime_dir() / "storage" / "material_attachments"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _safe_filename(filename: str | None, fallback: str = "attachment") -> str:
    raw_name = Path(filename or fallback).name or fallback
    normalized = re.sub(r"[^A-Za-z0-9А-Яа-я._-]+", "_", raw_name).strip("._")
    return normalized or fallback


class MaterialAttachmentService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.materials = MaterialRepository(session)
        self.attachments = MaterialAttachmentRepository(session)

    def _get_material_or_404(self, material_id: int):
        material = self.materials.get_by_id(material_id)
        if material is None:
            raise AppError(code="not_found", message="Материал не найден", status_code=404)
        return material

    def _attachment_path(self, material_id: int, attachment_id: str, filename: str) -> Path:
        root = get_material_attachments_root() / str(material_id)
        root.mkdir(parents=True, exist_ok=True)
        return root / f"{attachment_id}_{filename}"

    def list_by_material(self, material_id: int) -> list[CrmMaterialAttachment]:
        self._get_material_or_404(material_id)
        return self.attachments.list_by_material_id(material_id)

    async def upload(
        self,
        material_id: int,
        file: UploadFile,
        *,
        actor_user_id: int | None = None,
    ) -> CrmMaterialAttachment:
        self._get_material_or_404(material_id)

        data = await file.read(_MAX_UPLOAD_BYTES + 1)
        if len(data) > _MAX_UPLOAD_BYTES:
            raise AppError(code="validation_error", message="Размер вложения не должен превышать 20 МБ", status_code=422)

        attachment_id = uuid.uuid4().hex
        safe_name = _safe_filename(file.filename)
        file_path = self._attachment_path(material_id, attachment_id, safe_name)
        file_path.write_bytes(data)

        attachment = CrmMaterialAttachment(
            material_id=material_id,
            file_name=safe_name,
            mime_type=file.content_type or mimetypes.guess_type(safe_name)[0] or "application/octet-stream",
            storage_path=str(file_path.relative_to(get_runtime_dir())),
            size=len(data),
            created_by_user_id=actor_user_id,
        )
        self.attachments.create(attachment)
        self.session.commit()
        return self.get_attachment_or_404(material_id, attachment.id)

    def get_attachment_or_404(self, material_id: int, attachment_id: int) -> CrmMaterialAttachment:
        attachment = self.attachments.get_by_id(attachment_id)
        if attachment is None or attachment.material_id != material_id:
            raise AppError(code="not_found", message="Вложение не найдено", status_code=404)
        return attachment

    def delete(self, material_id: int, attachment_id: int) -> None:
        attachment = self.get_attachment_or_404(material_id, attachment_id)
        self._delete_physical_file(attachment.storage_path)
        self.attachments.delete(attachment)
        self.session.commit()

    def delete_all_for_material(self, material_id: int) -> None:
        for attachment in self.attachments.list_by_material_id(material_id):
            self._delete_physical_file(attachment.storage_path)

    def get_file_path(self, material_id: int, attachment_id: int) -> Path:
        attachment = self.get_attachment_or_404(material_id, attachment_id)
        return get_runtime_dir() / attachment.storage_path

    def _delete_physical_file(self, storage_path: str) -> None:
        try:
            (get_runtime_dir() / storage_path).unlink(missing_ok=True)
        except Exception:
            pass
