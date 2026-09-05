from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crm.api.deps import CurrentUserContext, require_permission
from app.crm.schemas.finance import (
    FinanceCategoryCreate,
    FinanceCategoryRead,
    FinanceCategoryUpdate,
    FinanceExpenseCreate,
    FinanceExpenseRead,
    FinanceExpenseSummaryRead,
)
from app.crm.services.finance_service import FinanceService

router = APIRouter()


def _category_to_read(category) -> FinanceCategoryRead:
    return FinanceCategoryRead(id=category.id, name=category.name)


def _expense_to_read(expense) -> FinanceExpenseRead:
    return FinanceExpenseRead(
        id=expense.id,
        expense_date=expense.expense_date,
        category_id=expense.category_id,
        category_name=expense.category.name,
        comment=expense.comment,
        amount=expense.amount,
        created_by_user_id=expense.created_by_user_id,
        created_by_user_name=expense.created_by_user.full_name if expense.created_by_user else None,
    )


@router.get("/categories", response_model=list[FinanceCategoryRead])
def list_finance_categories(
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("finance.view")),
) -> list[FinanceCategoryRead]:
    return [_category_to_read(item) for item in FinanceService(db).list_categories()]


@router.post("/categories", response_model=FinanceCategoryRead, status_code=status.HTTP_201_CREATED)
def create_finance_category(
    payload: FinanceCategoryCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("finance.view")),
) -> FinanceCategoryRead:
    category = FinanceService(db).create_category(payload, actor_user_id=current_user.user.id)
    return _category_to_read(category)


@router.put("/categories/{category_id}", response_model=FinanceCategoryRead)
def update_finance_category(
    category_id: int,
    payload: FinanceCategoryUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("finance.view")),
) -> FinanceCategoryRead:
    category = FinanceService(db).update_category(category_id, payload, actor_user_id=current_user.user.id)
    return _category_to_read(category)


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_finance_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("finance.view")),
) -> Response:
    FinanceService(db).delete_category(category_id, actor_user_id=current_user.user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/expenses", response_model=Any)
def list_finance_expenses(
    date_from: date | None = None,
    date_to: date | None = None,
    page: int | None = None,
    page_size: int | None = None,
    sort_by: str | None = None,
    sort_dir: str | None = None,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("finance.view")),
) -> Any:
    service = FinanceService(db)
    if page is not None or page_size is not None:
        items, total, normalized_page, normalized_page_size = service.list_page(
            date_from=date_from,
            date_to=date_to,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_dir=sort_dir,
        )
        return {
            "items": [_expense_to_read(item) for item in items],
            "total": total,
            "page": normalized_page,
            "page_size": normalized_page_size,
        }
    return [_expense_to_read(item) for item in service.list_expenses(date_from=date_from, date_to=date_to)]


@router.get("/expenses/summary", response_model=FinanceExpenseSummaryRead)
def get_finance_expenses_summary(
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("finance.view")),
) -> FinanceExpenseSummaryRead:
    return FinanceExpenseSummaryRead(total_amount=FinanceService(db).get_summary(date_from=date_from, date_to=date_to))


@router.get("/expenses/{expense_id}", response_model=FinanceExpenseRead)
def get_finance_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("finance.view")),
) -> FinanceExpenseRead:
    return _expense_to_read(FinanceService(db).get_expense(expense_id))


@router.post("/expenses", response_model=FinanceExpenseRead, status_code=status.HTTP_201_CREATED)
def create_finance_expense(
    payload: FinanceExpenseCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("finance.expenses.create")),
) -> FinanceExpenseRead:
    expense = FinanceService(db).create_expense(payload, actor_user_id=current_user.user.id)
    return _expense_to_read(expense)


@router.put("/expenses/{expense_id}", response_model=FinanceExpenseRead)
def update_finance_expense(
    expense_id: int,
    payload: FinanceExpenseCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("finance.expenses.edit_delete")),
) -> FinanceExpenseRead:
    expense = FinanceService(db).update_expense(expense_id, payload, actor_user_id=current_user.user.id)
    return _expense_to_read(expense)


@router.delete("/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_finance_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("finance.expenses.edit_delete")),
) -> Response:
    FinanceService(db).delete_expense(expense_id, actor_user_id=current_user.user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
