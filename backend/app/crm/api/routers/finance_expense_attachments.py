from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crm.api.deps import CurrentUserContext, require_permission
from app.crm.schemas.finance_expense_attachment import FinanceExpenseAttachmentRead
from app.crm.services.finance_expense_attachment_service import FinanceExpenseAttachmentService

router = APIRouter()


def _to_read_model(attachment) -> FinanceExpenseAttachmentRead:
    return FinanceExpenseAttachmentRead(
        id=attachment.id,
        expense_id=attachment.expense_id,
        file_name=attachment.file_name,
        mime_type=attachment.mime_type,
        size=attachment.size,
        created_at=attachment.created_at,
        created_by_user_id=attachment.created_by_user_id,
    )


@router.get("/{expense_id}/attachments", response_model=list[FinanceExpenseAttachmentRead])
def list_finance_expense_attachments(
    expense_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("finance.view")),
) -> list[FinanceExpenseAttachmentRead]:
    return [_to_read_model(item) for item in FinanceExpenseAttachmentService(db).list_by_expense(expense_id)]


@router.post("/{expense_id}/attachments", response_model=FinanceExpenseAttachmentRead, status_code=status.HTTP_201_CREATED)
async def upload_finance_expense_attachment(
    expense_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("finance.expenses.edit_delete")),
) -> FinanceExpenseAttachmentRead:
    attachment = await FinanceExpenseAttachmentService(db).upload(expense_id, file, actor_user_id=current_user.user.id)
    return _to_read_model(attachment)


@router.get("/{expense_id}/attachments/{attachment_id}/file", response_class=FileResponse)
def serve_finance_expense_attachment(
    expense_id: int,
    attachment_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("finance.view")),
) -> FileResponse:
    attachment = FinanceExpenseAttachmentService(db).get_attachment_or_404(expense_id, attachment_id)
    path = FinanceExpenseAttachmentService(db).get_file_path(expense_id, attachment_id)
    return FileResponse(path, media_type=attachment.mime_type, filename=attachment.file_name)


@router.delete("/{expense_id}/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_finance_expense_attachment(
    expense_id: int,
    attachment_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("finance.expenses.edit_delete")),
) -> Response:
    FinanceExpenseAttachmentService(db).delete(expense_id, attachment_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
