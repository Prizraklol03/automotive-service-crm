from __future__ import annotations

import io
import uuid
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageOps
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import AppError
from app.core.time import app_now_naive
from app.crm.models.audit_log import CrmAuditLog
from app.crm.models.inspection import (
    CrmInspectionExport,
    CrmInspectionGeneralPhoto,
    CrmInspectionMark,
    CrmInspectionMarkPhoto,
    CrmInspectionSession,
    InspectionGeometryType,
    InspectionSessionStatus,
)
from app.crm.models.order import CrmOrder
from app.crm.schemas.audit_log import AuditLogRead
from app.crm.schemas.inspection import (
    InspectionExportRead,
    InspectionGeneralPhotoRead,
    InspectionHistoryRead,
    InspectionMarkCreatePayload,
    InspectionMarkPhotoRead,
    InspectionMarkRead,
    InspectionMarkReorderPayload,
    InspectionMarkUpdatePayload,
    InspectionSessionDetailRead,
    InspectionSessionPatch,
    InspectionSessionRead,
    InspectionUserMiniRead,
)
from app.crm.services.audit_log_service import AuditLogService
from app.crm.services.inspection_storage_service import InspectionStorageService


MAX_IMAGE_SIDE = 2400


class InspectionService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.audit_logs = AuditLogService(session)
        self.storage = InspectionStorageService()

    # ------------------------------------------------------------------ loads

    def _session_statement(self):
        return (
            select(CrmInspectionSession)
            .options(
                selectinload(CrmInspectionSession.created_by),
                selectinload(CrmInspectionSession.updated_by),
                selectinload(CrmInspectionSession.marks).selectinload(CrmInspectionMark.photos),
                selectinload(CrmInspectionSession.general_photos),
                selectinload(CrmInspectionSession.exports),
            )
        )

    def _get_order(self, order_id: int) -> CrmOrder:
        order = self.session.get(CrmOrder, order_id)
        if order is None:
            raise AppError(code="not_found", message="Заказ не найден", status_code=404)
        return order

    def _get_session(self, session_id: int) -> CrmInspectionSession:
        inspection_session = self.session.scalar(self._session_statement().where(CrmInspectionSession.id == session_id))
        if inspection_session is None or inspection_session.deleted_at is not None:
            raise AppError(code="not_found", message="Осмотр не найден", status_code=404)
        return inspection_session

    def _get_mark(self, mark_id: int) -> CrmInspectionMark:
        statement = (
            select(CrmInspectionMark)
            .options(selectinload(CrmInspectionMark.photos), selectinload(CrmInspectionMark.inspection_session))
            .where(CrmInspectionMark.id == mark_id)
        )
        mark = self.session.scalar(statement)
        if mark is None:
            raise AppError(code="not_found", message="Отметка осмотра не найдена", status_code=404)
        return mark

    def _get_mark_photo(self, photo_id: int) -> CrmInspectionMarkPhoto:
        photo = self.session.get(CrmInspectionMarkPhoto, photo_id)
        if photo is None:
            raise AppError(code="not_found", message="Фотография отметки не найдена", status_code=404)
        return photo

    def _get_general_photo(self, photo_id: int) -> CrmInspectionGeneralPhoto:
        photo = self.session.get(CrmInspectionGeneralPhoto, photo_id)
        if photo is None:
            raise AppError(code="not_found", message="Общая фотография осмотра не найдена", status_code=404)
        return photo

    def _get_mark_photo_for_session(
        self,
        session_id: int,
        mark_id: int,
        photo_id: int,
    ) -> tuple[CrmInspectionSession, CrmInspectionMark, CrmInspectionMarkPhoto]:
        inspection_session = self._get_session(session_id)
        mark = self._get_mark(mark_id)
        if mark.inspection_session_id != inspection_session.id:
            raise AppError(code="not_found", message="Отметка не относится к этому осмотру", status_code=404)

        photo = self._get_mark_photo(photo_id)
        if photo.inspection_mark_id != mark.id:
            raise AppError(code="not_found", message="Фотография не относится к этой отметке", status_code=404)
        return inspection_session, mark, photo

    def _get_general_photo_for_session(
        self,
        session_id: int,
        photo_id: int,
    ) -> tuple[CrmInspectionSession, CrmInspectionGeneralPhoto]:
        inspection_session = self._get_session(session_id)
        photo = self._get_general_photo(photo_id)
        if photo.inspection_session_id != inspection_session.id:
            raise AppError(code="not_found", message="Фотография не относится к этому осмотру", status_code=404)
        return inspection_session, photo

    def get_current_session(self, order_id: int) -> InspectionSessionDetailRead | None:
        self._get_order(order_id)
        statement = (
            self._session_statement()
            .where(CrmInspectionSession.order_id == order_id, CrmInspectionSession.deleted_at.is_(None))
            .order_by(CrmInspectionSession.created_at.desc(), CrmInspectionSession.id.desc())
        )
        inspection_session = self.session.scalar(statement)
        if inspection_session is None:
            return None
        return self.to_session_detail_read(inspection_session)

    def get_session_model(self, session_id: int) -> CrmInspectionSession:
        return self._get_session(session_id)

    # --------------------------------------------------------------- validation

    def _ensure_editable(self, inspection_session: CrmInspectionSession) -> None:
        if inspection_session.status in {
            InspectionSessionStatus.COMPLETED,
            InspectionSessionStatus.CONFIRMED,
            InspectionSessionStatus.LOCKED,
        }:
            raise AppError(
                code="inspection_locked",
                message="Осмотр завершён и недоступен для редактирования без переоткрытия",
                status_code=409,
            )

    def _validate_mark_geometry(self, geometry_type: InspectionGeometryType, points_count: int) -> None:
        if geometry_type == InspectionGeometryType.POINT and points_count != 1:
            raise AppError(code="validation_error", message="Для точки нужна ровно одна координата", status_code=422)
        if geometry_type == InspectionGeometryType.LINE and points_count < 2:
            raise AppError(code="validation_error", message="Для линии нужно минимум две точки", status_code=422)
        if geometry_type == InspectionGeometryType.POLYGON and points_count < 3:
            raise AppError(code="validation_error", message="Для области нужно минимум три точки", status_code=422)

    def _normalize_geometry(self, geometry_type: InspectionGeometryType, geometry_data: dict) -> dict:
        points = geometry_data.get("points") or []
        self._validate_mark_geometry(geometry_type, len(points))
        normalized_points = []
        for point in points:
            x = float(point["x"])
            y = float(point["y"])
            if x < 0 or x > 1 or y < 0 or y > 1:
                raise AppError(
                    code="validation_error",
                    message="Координаты отметки должны быть в диапазоне от 0 до 1",
                    status_code=422,
                )
            normalized_points.append({"x": round(x, 6), "y": round(y, 6)})
        return {"points": normalized_points}

    # --------------------------------------------------------------- serialization

    @staticmethod
    def _to_user_read(user) -> InspectionUserMiniRead | None:
        if user is None:
            return None
        return InspectionUserMiniRead(id=user.id, full_name=user.full_name)

    @staticmethod
    def to_export_read(export_record: CrmInspectionExport) -> InspectionExportRead:
        return InspectionExportRead.model_validate(export_record)

    @staticmethod
    def to_mark_photo_read(photo: CrmInspectionMarkPhoto) -> InspectionMarkPhotoRead:
        return InspectionMarkPhotoRead.model_validate(photo)

    @staticmethod
    def to_general_photo_read(photo: CrmInspectionGeneralPhoto) -> InspectionGeneralPhotoRead:
        return InspectionGeneralPhotoRead.model_validate(photo)

    def to_mark_read(self, mark: CrmInspectionMark) -> InspectionMarkRead:
        return InspectionMarkRead(
            id=mark.id,
            inspection_session_id=mark.inspection_session_id,
            order_id=mark.order_id,
            vehicle_id=mark.vehicle_id,
            view_type=mark.view_type,
            zone_key=mark.zone_key,
            geometry_type=mark.geometry_type,
            geometry_data=mark.geometry_data,
            defect_type=mark.defect_type,
            severity=mark.severity,
            status=mark.status,
            comment=mark.comment,
            sort_order=mark.sort_order,
            created_by_user_id=mark.created_by_user_id,
            updated_by_user_id=mark.updated_by_user_id,
            created_at=mark.created_at,
            updated_at=mark.updated_at,
            photos=[self.to_mark_photo_read(photo) for photo in mark.photos],
        )

    def _counts_for_session(self, inspection_session: CrmInspectionSession) -> tuple[int, int, int]:
        marks_count = len(inspection_session.marks)
        mark_photos_count = sum(len(mark.photos) for mark in inspection_session.marks)
        general_photos_count = len(inspection_session.general_photos)
        return marks_count, mark_photos_count, general_photos_count

    def to_session_read(self, inspection_session: CrmInspectionSession) -> InspectionSessionRead:
        marks_count, mark_photos_count, general_photos_count = self._counts_for_session(inspection_session)
        latest_export = inspection_session.exports[0] if inspection_session.exports else None
        return InspectionSessionRead(
            id=inspection_session.id,
            order_id=inspection_session.order_id,
            vehicle_id=inspection_session.vehicle_id,
            status=inspection_session.status,
            started_at=inspection_session.started_at,
            completed_at=inspection_session.completed_at,
            confirmed_at=inspection_session.confirmed_at,
            locked_at=inspection_session.locked_at,
            created_by_user_id=inspection_session.created_by_user_id,
            updated_by_user_id=inspection_session.updated_by_user_id,
            general_comment=inspection_session.general_comment,
            checklist_json=inspection_session.checklist_json,
            snapshot_version=inspection_session.snapshot_version,
            export_front_image_path=inspection_session.export_front_image_path,
            export_rear_image_path=inspection_session.export_rear_image_path,
            export_left_image_path=inspection_session.export_left_image_path,
            export_right_image_path=inspection_session.export_right_image_path,
            export_top_image_path=inspection_session.export_top_image_path,
            export_interior_image_path=inspection_session.export_interior_image_path,
            created_at=inspection_session.created_at,
            updated_at=inspection_session.updated_at,
            created_by=self._to_user_read(inspection_session.created_by),
            updated_by=self._to_user_read(inspection_session.updated_by),
            marks_count=marks_count,
            mark_photos_count=mark_photos_count,
            general_photos_count=general_photos_count,
            latest_export=self.to_export_read(latest_export) if latest_export else None,
        )

    def to_session_detail_read(self, inspection_session: CrmInspectionSession) -> InspectionSessionDetailRead:
        base = self.to_session_read(inspection_session)
        return InspectionSessionDetailRead(
            **base.model_dump(),
            marks=[self.to_mark_read(mark) for mark in inspection_session.marks],
            general_photos=[self.to_general_photo_read(photo) for photo in inspection_session.general_photos],
        )

    # ------------------------------------------------------------------ session

    def start(self, order_id: int, actor_user_id: int) -> InspectionSessionDetailRead:
        order = self._get_order(order_id)
        current = self.get_current_session(order_id)
        if current is not None:
            session_model = self._get_session(current.id)
            if session_model.status in {InspectionSessionStatus.CONFIRMED, InspectionSessionStatus.LOCKED}:
                raise AppError(
                    code="inspection_locked",
                    message="Осмотр подтверждён или заблокирован. Для изменений нужно переоткрытие.",
                    status_code=409,
                )
            if session_model.status == InspectionSessionStatus.COMPLETED:
                session_model.status = InspectionSessionStatus.IN_PROGRESS
            elif session_model.status == InspectionSessionStatus.NOT_STARTED:
                session_model.status = InspectionSessionStatus.DRAFT
            session_model.started_at = session_model.started_at or app_now_naive()
            session_model.updated_by_user_id = actor_user_id
            self.audit_logs.record(
                actor_user_id=actor_user_id,
                entity_type="inspection_session",
                entity_id=session_model.id,
                action="inspection_started",
                title="Осмотр начат",
                description=f"Заказ #{order.id}",
            )
            self.session.commit()
            return self.to_session_detail_read(self._get_session(session_model.id))

        now = app_now_naive()
        session_model = CrmInspectionSession(
            order_id=order.id,
            vehicle_id=order.vehicle_id,
            status=InspectionSessionStatus.DRAFT,
            started_at=now,
            created_by_user_id=actor_user_id,
            updated_by_user_id=actor_user_id,
            general_comment=None,
            checklist_json=None,
        )
        self.session.add(session_model)
        self.session.flush()
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="inspection_session",
            entity_id=session_model.id,
            action="inspection_started",
            title="Осмотр начат",
            description=f"Заказ #{order.id}",
        )
        self.session.commit()
        return self.to_session_detail_read(self._get_session(session_model.id))

    def update_session(self, session_id: int, payload: InspectionSessionPatch, actor_user_id: int) -> InspectionSessionRead:
        inspection_session = self._get_session(session_id)
        self._ensure_editable(inspection_session)

        before_status = inspection_session.status
        if payload.general_comment is not None:
            inspection_session.general_comment = payload.general_comment
        if payload.checklist_json is not None:
            inspection_session.checklist_json = payload.checklist_json
        if payload.status is not None:
            if payload.status not in {
                InspectionSessionStatus.NOT_STARTED,
                InspectionSessionStatus.DRAFT,
                InspectionSessionStatus.IN_PROGRESS,
            }:
                raise AppError(
                    code="validation_error",
                    message="Через PATCH можно устанавливать только not_started, draft или in_progress",
                    status_code=422,
                )
            inspection_session.status = payload.status
            if payload.status == InspectionSessionStatus.IN_PROGRESS and inspection_session.started_at is None:
                inspection_session.started_at = app_now_naive()
        inspection_session.updated_by_user_id = actor_user_id
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="inspection_session",
            entity_id=inspection_session.id,
            action="inspection_updated",
            title="Осмотр обновлён",
            description=f"Статус: {before_status.value} → {inspection_session.status.value}",
        )
        self.session.commit()
        return self.to_session_read(self._get_session(session_id))

    def complete(self, session_id: int, actor_user_id: int) -> InspectionSessionRead:
        inspection_session = self._get_session(session_id)
        self._ensure_editable(inspection_session)
        now = app_now_naive()
        inspection_session.status = InspectionSessionStatus.COMPLETED
        inspection_session.completed_at = now
        inspection_session.updated_by_user_id = actor_user_id
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="inspection_session",
            entity_id=inspection_session.id,
            action="inspection_completed",
            title="Осмотр завершён",
        )
        self.session.commit()
        return self.to_session_read(self._get_session(session_id))

    def confirm(self, session_id: int, actor_user_id: int) -> InspectionSessionRead:
        inspection_session = self._get_session(session_id)
        if inspection_session.status not in {InspectionSessionStatus.COMPLETED, InspectionSessionStatus.CONFIRMED}:
            raise AppError(
                code="validation_error",
                message="Подтвердить можно только завершённый осмотр",
                status_code=409,
            )
        inspection_session.status = InspectionSessionStatus.CONFIRMED
        inspection_session.confirmed_at = app_now_naive()
        inspection_session.updated_by_user_id = actor_user_id
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="inspection_session",
            entity_id=inspection_session.id,
            action="inspection_confirmed",
            title="Осмотр подтверждён",
        )
        self.session.commit()
        return self.to_session_read(self._get_session(session_id))

    def lock(self, session_id: int, actor_user_id: int) -> InspectionSessionRead:
        inspection_session = self._get_session(session_id)
        if inspection_session.status not in {
            InspectionSessionStatus.COMPLETED,
            InspectionSessionStatus.CONFIRMED,
            InspectionSessionStatus.LOCKED,
        }:
            raise AppError(
                code="validation_error",
                message="Заблокировать можно только завершённый или подтверждённый осмотр",
                status_code=409,
            )
        inspection_session.status = InspectionSessionStatus.LOCKED
        inspection_session.locked_at = app_now_naive()
        inspection_session.updated_by_user_id = actor_user_id
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="inspection_session",
            entity_id=inspection_session.id,
            action="inspection_locked",
            title="Осмотр заблокирован",
        )
        self.session.commit()
        return self.to_session_read(self._get_session(session_id))

    def reopen(self, session_id: int, actor_user_id: int) -> InspectionSessionRead:
        inspection_session = self._get_session(session_id)
        inspection_session.status = InspectionSessionStatus.DRAFT
        inspection_session.updated_by_user_id = actor_user_id
        inspection_session.completed_at = None
        inspection_session.confirmed_at = None
        inspection_session.locked_at = None
        inspection_session.snapshot_version += 1
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="inspection_session",
            entity_id=inspection_session.id,
            action="inspection_reopened",
            title="Осмотр переоткрыт",
        )
        self.session.commit()
        return self.to_session_read(self._get_session(session_id))

    # -------------------------------------------------------------------- marks

    def list_marks(self, session_id: int) -> list[InspectionMarkRead]:
        inspection_session = self._get_session(session_id)
        return [self.to_mark_read(mark) for mark in inspection_session.marks]

    def get_mark_read(self, mark_id: int) -> InspectionMarkRead:
        return self.to_mark_read(self._get_mark(mark_id))

    def _next_mark_sort_order(self, session_id: int) -> int:
        return int(
            self.session.scalar(
                select(func.coalesce(func.max(CrmInspectionMark.sort_order), -1)).where(
                    CrmInspectionMark.inspection_session_id == session_id
                )
            )
            or -1
        ) + 1

    def create_mark(self, session_id: int, payload: InspectionMarkCreatePayload, actor_user_id: int) -> InspectionMarkRead:
        inspection_session = self._get_session(session_id)
        self._ensure_editable(inspection_session)
        geometry_data = self._normalize_geometry(payload.geometry_type, payload.geometry_data.model_dump())
        mark = CrmInspectionMark(
            inspection_session_id=inspection_session.id,
            order_id=inspection_session.order_id,
            vehicle_id=inspection_session.vehicle_id,
            view_type=payload.view_type,
            zone_key=payload.zone_key,
            geometry_type=payload.geometry_type,
            geometry_data=geometry_data,
            defect_type=payload.defect_type,
            severity=payload.severity,
            status=payload.status,
            comment=payload.comment,
            sort_order=payload.sort_order if payload.sort_order >= 0 else self._next_mark_sort_order(session_id),
            created_by_user_id=actor_user_id,
            updated_by_user_id=actor_user_id,
        )
        self.session.add(mark)
        inspection_session.updated_by_user_id = actor_user_id
        self.session.flush()
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="inspection_session",
            entity_id=inspection_session.id,
            action="inspection_mark_created",
            title="Добавлена отметка осмотра",
            description=f"#{mark.id} {mark.view_type.value}/{mark.defect_type.value}",
        )
        self.session.commit()
        return self.get_mark_read(mark.id)

    def update_mark(self, mark_id: int, payload: InspectionMarkUpdatePayload, actor_user_id: int) -> InspectionMarkRead:
        mark = self._get_mark(mark_id)
        self._ensure_editable(mark.inspection_session)
        if payload.view_type is not None:
            mark.view_type = payload.view_type
        if payload.zone_key is not None:
            mark.zone_key = payload.zone_key
        if payload.geometry_type is not None and payload.geometry_data is not None:
            mark.geometry_type = payload.geometry_type
            mark.geometry_data = self._normalize_geometry(payload.geometry_type, payload.geometry_data.model_dump())
        if payload.defect_type is not None:
            mark.defect_type = payload.defect_type
        if payload.severity is not None:
            mark.severity = payload.severity
        if payload.status is not None:
            mark.status = payload.status
        if payload.comment is not None:
            mark.comment = payload.comment
        if payload.sort_order is not None:
            mark.sort_order = payload.sort_order
        mark.updated_by_user_id = actor_user_id
        mark.inspection_session.updated_by_user_id = actor_user_id
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="inspection_session",
            entity_id=mark.inspection_session_id,
            action="inspection_mark_updated",
            title="Отметка осмотра изменена",
            description=f"#{mark.id}",
        )
        self.session.commit()
        return self.get_mark_read(mark.id)

    def delete_mark(self, mark_id: int, actor_user_id: int) -> None:
        mark = self._get_mark(mark_id)
        self._ensure_editable(mark.inspection_session)
        session_id = mark.inspection_session_id
        self._cleanup_paths(photo.file_path for photo in mark.photos)
        self.session.delete(mark)
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="inspection_session",
            entity_id=session_id,
            action="inspection_mark_deleted",
            title="Отметка осмотра удалена",
            description=f"#{mark.id}",
        )
        self.session.commit()

    def reorder_marks(self, payload: InspectionMarkReorderPayload, actor_user_id: int) -> list[InspectionMarkRead]:
        marks = list(
            self.session.scalars(
                select(CrmInspectionMark).where(CrmInspectionMark.id.in_([item.id for item in payload.items]))
            )
        )
        marks_by_id = {mark.id: mark for mark in marks}
        if len(marks_by_id) != len(payload.items):
            raise AppError(code="validation_error", message="Некоторые отметки не найдены", status_code=422)
        session_ids = {mark.inspection_session_id for mark in marks}
        if len(session_ids) != 1:
            raise AppError(
                code="validation_error",
                message="Можно менять порядок только у отметок одного осмотра",
                status_code=422,
            )
        inspection_session = marks[0].inspection_session
        self._ensure_editable(inspection_session)
        for item in payload.items:
            marks_by_id[item.id].sort_order = item.sort_order
            marks_by_id[item.id].updated_by_user_id = actor_user_id
        inspection_session.updated_by_user_id = actor_user_id
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="inspection_session",
            entity_id=inspection_session.id,
            action="inspection_marks_reordered",
            title="Порядок отметок изменён",
        )
        self.session.commit()
        return self.list_marks(inspection_session.id)

    # -------------------------------------------------------------------- files

    def _save_image(self, directory: Path, file_bytes: bytes) -> tuple[str, int, int]:
        directory.mkdir(parents=True, exist_ok=True)
        image_id = uuid.uuid4().hex
        output_path = directory / f"{image_id}.jpg"
        try:
            image = Image.open(io.BytesIO(file_bytes))
            image = ImageOps.exif_transpose(image)
            if image.mode != "RGB":
                image = image.convert("RGB")
            width, height = image.size
            if max(width, height) > MAX_IMAGE_SIDE:
                image.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE), Image.LANCZOS)
            image.save(output_path, "JPEG", quality=85)
            final_width, final_height = image.size
        except Exception as exc:  # pragma: no cover - depends on runtime image codecs
            raise AppError(code="validation_error", message="Не удалось обработать изображение", status_code=422) from exc
        return self.storage.to_relative_path(output_path), final_width, final_height

    def _cleanup_paths(self, relative_paths: Iterable[str | None]) -> None:
        for relative_path in relative_paths:
            if not relative_path:
                continue
            try:
                self.storage.resolve(relative_path).unlink(missing_ok=True)
            except Exception:
                continue

    def upload_mark_photo(
        self,
        mark_id: int,
        *,
        original_name: str,
        mime_type: str,
        size_bytes: int,
        file_bytes: bytes,
        actor_user_id: int,
    ) -> list[InspectionMarkPhotoRead]:
        mark = self._get_mark(mark_id)
        self._ensure_editable(mark.inspection_session)
        file_path, width, height = self._save_image(
            self.storage.get_mark_photos_dir(mark.inspection_session_id, mark.id),
            file_bytes,
        )
        photo = CrmInspectionMarkPhoto(
            inspection_mark_id=mark.id,
            file_path=file_path,
            original_name=original_name,
            mime_type="image/jpeg",
            size_bytes=size_bytes,
            width=width,
            height=height,
            sort_order=len(mark.photos),
            uploaded_by_user_id=actor_user_id,
        )
        self.session.add(photo)
        mark.inspection_session.updated_by_user_id = actor_user_id
        self.session.flush()
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="inspection_session",
            entity_id=mark.inspection_session_id,
            action="inspection_mark_photo_uploaded",
            title="Загружена фотография к отметке",
            description=f"Отметка #{mark.id}",
        )
        self.session.commit()
        return [self.to_mark_photo_read(item) for item in self._get_mark(mark.id).photos]

    def delete_mark_photo(self, photo_id: int, actor_user_id: int) -> None:
        photo = self._get_mark_photo(photo_id)
        mark = self._get_mark(photo.inspection_mark_id)
        self._ensure_editable(mark.inspection_session)
        self._cleanup_paths([photo.file_path])
        self.session.delete(photo)
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="inspection_session",
            entity_id=mark.inspection_session_id,
            action="inspection_mark_photo_deleted",
            title="Удалена фотография отметки",
            description=f"Отметка #{mark.id}",
        )
        self.session.commit()

    def upload_general_photo(
        self,
        session_id: int,
        *,
        original_name: str,
        mime_type: str,
        size_bytes: int,
        file_bytes: bytes,
        actor_user_id: int,
    ) -> list[InspectionGeneralPhotoRead]:
        inspection_session = self._get_session(session_id)
        self._ensure_editable(inspection_session)
        file_path, width, height = self._save_image(self.storage.get_general_photos_dir(session_id), file_bytes)
        photo = CrmInspectionGeneralPhoto(
            inspection_session_id=inspection_session.id,
            file_path=file_path,
            original_name=original_name,
            mime_type="image/jpeg",
            size_bytes=size_bytes,
            width=width,
            height=height,
            sort_order=len(inspection_session.general_photos),
            uploaded_by_user_id=actor_user_id,
        )
        self.session.add(photo)
        inspection_session.updated_by_user_id = actor_user_id
        self.session.flush()
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="inspection_session",
            entity_id=inspection_session.id,
            action="inspection_general_photo_uploaded",
            title="Загружена общая фотография осмотра",
        )
        self.session.commit()
        return [self.to_general_photo_read(item) for item in self._get_session(session_id).general_photos]

    def delete_general_photo(self, photo_id: int, actor_user_id: int) -> None:
        photo = self._get_general_photo(photo_id)
        inspection_session = self._get_session(photo.inspection_session_id)
        self._ensure_editable(inspection_session)
        self._cleanup_paths([photo.file_path])
        self.session.delete(photo)
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="inspection_session",
            entity_id=inspection_session.id,
            action="inspection_general_photo_deleted",
            title="Удалена общая фотография осмотра",
        )
        self.session.commit()

    def get_mark_photo_file_path(self, *, session_id: int, mark_id: int, photo_id: int) -> Path:
        _, _, photo = self._get_mark_photo_for_session(session_id, mark_id, photo_id)
        path = self.storage.resolve(photo.file_path)
        if not path.exists():
            raise AppError(code="not_found", message="Файл фотографии отметки не найден", status_code=404)
        return path

    def get_general_photo_file_path(self, *, session_id: int, photo_id: int) -> Path:
        _, photo = self._get_general_photo_for_session(session_id, photo_id)
        path = self.storage.resolve(photo.file_path)
        if not path.exists():
            raise AppError(code="not_found", message="Файл общей фотографии осмотра не найден", status_code=404)
        return path

    # ------------------------------------------------------------------ history

    def get_history(self, session_id: int) -> InspectionHistoryRead:
        self._get_session(session_id)
        items = [
            AuditLogRead.model_validate(item)
            for item in self.audit_logs.audit_logs.list_by_entity("inspection_session", session_id, limit=500)
        ]
        return InspectionHistoryRead(items=items)
