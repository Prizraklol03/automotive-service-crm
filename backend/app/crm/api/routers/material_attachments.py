from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crm.api.deps import CurrentUserContext, require_permission
from app.crm.schemas.material_attachment import MaterialAttachmentRead
from app.crm.services.material_attachment_service import MaterialAttachmentService

router = APIRouter()


def _to_read_model(attachment) -> MaterialAttachmentRead:
    return MaterialAttachmentRead(
        id=attachment.id,
        material_id=attachment.material_id,
        file_name=attachment.file_name,
        mime_type=attachment.mime_type,
        size=attachment.size,
        created_at=attachment.created_at,
        created_by_user_id=attachment.created_by_user_id,
    )


@router.get("/{material_id}/attachments", response_model=list[MaterialAttachmentRead])
def list_material_attachments(
    material_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("materials.manage")),
) -> list[MaterialAttachmentRead]:
    return [_to_read_model(item) for item in MaterialAttachmentService(db).list_by_material(material_id)]


@router.post("/{material_id}/attachments", response_model=MaterialAttachmentRead, status_code=status.HTTP_201_CREATED)
async def upload_material_attachment(
    material_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("materials.manage")),
) -> MaterialAttachmentRead:
    attachment = await MaterialAttachmentService(db).upload(material_id, file, actor_user_id=current_user.user.id)
    return _to_read_model(attachment)


@router.get("/{material_id}/attachments/{attachment_id}/file", response_class=FileResponse)
def serve_material_attachment(
    material_id: int,
    attachment_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("materials.manage")),
) -> FileResponse:
    attachment = MaterialAttachmentService(db).get_attachment_or_404(material_id, attachment_id)
    path = MaterialAttachmentService(db).get_file_path(material_id, attachment_id)
    return FileResponse(path, media_type=attachment.mime_type, filename=attachment.file_name)


@router.delete("/{material_id}/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_material_attachment(
    material_id: int,
    attachment_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("materials.manage")),
) -> Response:
    MaterialAttachmentService(db).delete(material_id, attachment_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
