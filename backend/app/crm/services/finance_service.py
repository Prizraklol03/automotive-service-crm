from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.time import app_today
from app.crm.models.finance_category import CrmFinanceCategory
from app.crm.models.finance_expense import CrmFinanceExpense
from app.crm.repositories.finance_category_repository import FinanceCategoryRepository
from app.crm.repositories.finance_expense_repository import FinanceExpenseRepository
from app.crm.schemas.finance import (
    FinanceCategoryCreate,
    FinanceCategoryUpdate,
    FinanceExpenseCreate,
)
from app.crm.services.audit_log_service import AuditLogService
from app.crm.services.finance_expense_attachment_service import FinanceExpenseAttachmentService
from app.crm.services.order_calculation_service import OrderCalculationService


class FinanceService:
    DEFAULT_CATEGORY_NAMES: tuple[str, ...] = (
        "Зарплата",
        "Аванс",
        "Хозрасходы",
        "Закупка материалов",
        "Напитки",
        "Прочее",
    )

    def __init__(self, session: Session) -> None:
        self.session = session
        self.categories = FinanceCategoryRepository(session)
        self.expenses = FinanceExpenseRepository(session)
        self.audit_logs = AuditLogService(session)
        self.attachments = FinanceExpenseAttachmentService(session)

    def ensure_default_categories(self) -> list[CrmFinanceCategory]:
        changed = False
        for name in self.DEFAULT_CATEGORY_NAMES:
            if self.categories.get_by_name(name) is None:
                self.categories.create(CrmFinanceCategory(name=name))
                changed = True
        if changed:
            self.session.commit()
        return self.categories.list_all()

    def list_categories(self) -> list[CrmFinanceCategory]:
        categories = self.categories.list_all()
        if categories:
            return categories
        return self.ensure_default_categories()

    def get_category(self, category_id: int) -> CrmFinanceCategory:
        category = self.categories.get_by_id(category_id)
        if not category:
            raise AppError(code="not_found", message="Категория финансов не найдена", status_code=404)
        return category

    def create_category(self, payload: FinanceCategoryCreate, *, actor_user_id: int | None = None) -> CrmFinanceCategory:
        category = CrmFinanceCategory(name=payload.name.strip())
        try:
            self.categories.create(category)
            self.audit_logs.record(
                actor_user_id=actor_user_id,
                entity_type="finance_category",
                entity_id=category.id,
                action="create",
                title=f"Создана категория финансов {category.name}",
                description=category.name,
            )
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise AppError(code="conflict", message="Категория с таким названием уже существует", status_code=409) from exc
        return self.get_category(category.id)

    def update_category(
        self,
        category_id: int,
        payload: FinanceCategoryUpdate,
        *,
        actor_user_id: int | None = None,
    ) -> CrmFinanceCategory:
        category = self.get_category(category_id)
        category.name = payload.name.strip()
        try:
            self.audit_logs.record(
                actor_user_id=actor_user_id,
                entity_type="finance_category",
                entity_id=category.id,
                action="update",
                title=f"Обновлена категория финансов {category.name}",
                description=category.name,
            )
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise AppError(code="conflict", message="Категория с таким названием уже существует", status_code=409) from exc
        return self.get_category(category.id)

    def delete_category(self, category_id: int, *, actor_user_id: int | None = None) -> None:
        category = self.get_category(category_id)
        if self.categories.has_expenses(category.id):
            raise AppError(
                code="category_in_use",
                message="Нельзя удалить категорию, пока в ней есть финансовые расходы",
                status_code=409,
            )
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="finance_category",
            entity_id=category.id,
            action="delete",
            title=f"Удалена категория финансов {category.name}",
            description=category.name,
        )
        self.categories.delete(category)
        self.session.commit()

    def _resolve_category(self, category_id: int) -> CrmFinanceCategory:
        return self.get_category(category_id)

    def _apply_expense_payload(self, expense: CrmFinanceExpense, payload: FinanceExpenseCreate) -> None:
        category = self._resolve_category(payload.category_id)
        amount = OrderCalculationService.validate_price(Decimal(payload.amount), field="amount")
        expense.expense_date = payload.expense_date
        expense.category_id = category.id
        expense.category = category
        expense.comment = payload.comment.strip()
        expense.amount = amount

    def get_expense(self, expense_id: int) -> CrmFinanceExpense:
        expense = self.expenses.get_by_id(expense_id)
        if not expense:
            raise AppError(code="not_found", message="Финансовый расход не найден", status_code=404)
        return expense

    def list_expenses(self, *, date_from: date | None = None, date_to: date | None = None) -> list[CrmFinanceExpense]:
        return self.expenses.list_in_period(date_from=date_from, date_to=date_to)

    def get_summary(self, *, date_from: date | None = None, date_to: date | None = None) -> Decimal:
        return self.expenses.get_total_in_period(date_from=date_from, date_to=date_to)

    def list_page(
        self,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
        page: int | None = None,
        page_size: int | None = None,
        sort_by: str | None = None,
        sort_dir: str | None = None,
    ) -> tuple[list[CrmFinanceExpense], int, int, int]:
        return self.expenses.list_page(
            date_from=date_from,
            date_to=date_to,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_dir=sort_dir,
        )

    def create_expense(self, payload: FinanceExpenseCreate, *, actor_user_id: int | None = None) -> CrmFinanceExpense:
        expense = CrmFinanceExpense(expense_date=payload.expense_date or app_today(), created_by_user_id=actor_user_id)
        self._apply_expense_payload(expense, payload)
        self.expenses.create(expense)
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="finance_expense",
            entity_id=expense.id,
            action="create",
            title=f"Добавлен финансовый расход #{expense.id}",
            description=f"{expense.amount} · {expense.comment or expense.category.name}",
        )
        self.session.commit()
        return self.get_expense(expense.id)

    def update_expense(
        self,
        expense_id: int,
        payload: FinanceExpenseCreate,
        *,
        actor_user_id: int | None = None,
    ) -> CrmFinanceExpense:
        expense = self.get_expense(expense_id)
        self._apply_expense_payload(expense, payload)
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="finance_expense",
            entity_id=expense.id,
            action="update",
            title=f"Обновлён финансовый расход #{expense.id}",
            description=f"{expense.amount} · {expense.comment or expense.category.name}",
        )
        self.session.commit()
        return self.get_expense(expense.id)

    def delete_expense(self, expense_id: int, *, actor_user_id: int | None = None) -> None:
        expense = self.get_expense(expense_id)
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="finance_expense",
            entity_id=expense.id,
            action="delete",
            title=f"Удалён финансовый расход #{expense.id}",
            description=f"{expense.amount} · {expense.comment or expense.category.name}",
        )
        self.attachments.delete_all_for_expense(expense.id)
        self.expenses.delete(expense)
        self.session.commit()
