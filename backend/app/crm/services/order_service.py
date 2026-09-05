from __future__ import annotations









import re




from datetime import date, datetime




from decimal import Decimal









from sqlalchemy.orm import Session









from app.core.errors import AppError




from app.crm.models.audit_log import CrmAuditLog




from app.crm.models.order import CrmOrder, OrderStatus




from app.crm.models.order_service import CrmOrderService




from app.crm.models.order_status import CrmOrderStatus, StatusGroup




from app.crm.repositories.client_repository import ClientRepository




from app.crm.repositories.order_repository import OrderRepository




from app.crm.repositories.service_catalog_repository import ServiceCatalogRepository




from app.crm.repositories.vehicle_repository import VehicleRepository




from app.crm.schemas.order import (
    OrderClientSummaryRead,
    OrderCreate,
    OrderListSummaryRead,
    OrderRead,
    OrderStatusHistoryEntryRead,
    OrderSummaryRead,
    OrderVehicleSummaryRead,
)
from app.crm.schemas.order_payment import OrderPaymentRead




from app.core.text import repair_mojibake_text
from app.crm.services.audit_log_service import AuditLogService
from app.crm.services.order_payment_service import summarize_order_payments




from app.crm.services.order_calculation_service import OrderCalculationService




from app.crm.services.order_status_service import OrderStatusService




from app.crm.utils.normalization import (




    normalize_phone_search_query,




    normalize_plate_search_query,




    normalize_vin_search_query,




)














class CrmOrderAppService:
    LEGACY_STATUS_MAP = {
        "draft": "new",
        "waiting": "new",
        "postponed": "in_progress",
        "completed": "closed",
    }




    def _get_default_status_record(self) -> CrmOrderStatus:
        record = self.session.query(CrmOrderStatus).filter(CrmOrderStatus.is_default.is_(True)).first()
        if record:
            return record

        canonical_default = self.session.get(CrmOrderStatus, "new")
        if canonical_default:
            return canonical_default

        first_status = self.session.query(CrmOrderStatus).order_by(CrmOrderStatus.sort_order, CrmOrderStatus.code).first()
        if not first_status:
            raise AppError(code="not_found", message="Статусы заказов не настроены", status_code=404)
        return first_status

    def _resolve_create_status_record(self, code: str | None) -> CrmOrderStatus:
        normalized_code = (code or "").strip()
        if not normalized_code:
            return self._get_default_status_record()

        try:
            return self._get_status_record(normalized_code)
        except AppError as exc:
            raise exc

    def _get_status_record(self, code: str) -> CrmOrderStatus:




        record = self.session.get(CrmOrderStatus, code)




        if not record:




            raise AppError(code="not_found", message=f"Статус '{code}' не найден", status_code=404)




        return record









    STATUS_PATTERNS = (



        re.compile(r"Новый статус:\s*(?P<status>[a-z_]+)", re.IGNORECASE),
        re.compile(r"Новый статус:\s*(?P<status>[a-z_]+)", re.IGNORECASE),



        re.compile(r"Статус:\s*(?P<status>[a-z_]+)", re.IGNORECASE),
        re.compile(r"Статус:\s*(?P<status>[a-z_]+)", re.IGNORECASE),



        re.compile(r"Начальный статус:\s*(?P<status>[a-z_]+)", re.IGNORECASE),
        re.compile(r"Начальный статус:\s*(?P<status>[a-z_]+)", re.IGNORECASE),




    )









    def __init__(self, session: Session) -> None:




        self.session = session




        self.clients = ClientRepository(session)




        self.vehicles = VehicleRepository(session)




        self.services_catalog = ServiceCatalogRepository(session)




        self.orders = OrderRepository(session)




        self.audit_logs = AuditLogService(session)









    def _vehicle_owner_client_id(self, vehicle) -> int:
        return self.vehicles.current_owner_client_id(vehicle)

    @staticmethod
    def _require_actor_permission(actor_permissions: set[str] | None, permission_code: str) -> None:
        if actor_permissions is not None and permission_code not in actor_permissions:
            raise AppError(code="forbidden", message="Недостаточно прав", status_code=403)

    @staticmethod
    def _service_price_signature(services: list[CrmOrderService]) -> tuple[tuple[Decimal, int], ...]:
        return tuple((Decimal(service.unit_price), int(service.quantity)) for service in services)

    def _requires_price_change_permission(self, order: CrmOrder, payload: OrderCreate) -> bool:
        current_services = sorted(order.services, key=lambda item: (item.sort_key, item.id))
        current_signature = self._service_price_signature(current_services)
        next_signature = tuple((Decimal(item.unit_price), int(item.quantity)) for item in payload.services)
        return (
            current_signature != next_signature
            or Decimal(order.discount_value) != Decimal(payload.discount_value)
            or order.discount_type != payload.discount_type
        )

    def _requires_complete_permission(self, current_status_code: str | None, next_status_code: str | None) -> bool:
        if not next_status_code:
            return False
        next_status = self._get_status_record(next_status_code)
        if next_status.group != StatusGroup.CLOSED:
            return False
        if not current_status_code:
            return True
        current_status = self._get_status_record(current_status_code)
        return current_status.group != StatusGroup.CLOSED

    def _ensure_client_vehicle(self, client_id: int, vehicle_id: int, *, existing_order: CrmOrder | None = None) -> None:
        client = self.clients.get_by_id(client_id)
        vehicle = self.vehicles.get_by_id(vehicle_id)

        if not client or not vehicle:
            if existing_order and existing_order.client_id == client_id and existing_order.vehicle_id == vehicle_id:
                client = self.clients.get_by_id(client_id, include_deleted=True)
                vehicle = self.vehicles.get_by_id(vehicle_id, include_deleted=True)

            if not client:
                raise AppError(code="not_found", message="Клиент не найден", status_code=404)

            if not vehicle:
                raise AppError(code="not_found", message="Автомобиль не найден", status_code=404)

    @staticmethod
    def _normalize_payer_client_id(client_id: int, payer_client_id: int | None) -> int | None:
        if payer_client_id is None or payer_client_id == client_id:
            return None
        return payer_client_id

    def _ensure_payer_client(self, payer_client_id: int | None) -> None:
        if payer_client_id is None:
            return
        payer_client = self.clients.get_by_id(payer_client_id)
        if not payer_client:
            raise AppError(code="not_found", message="Клиент не найден", status_code=404)









    def _replace_rows(self, order: CrmOrder, payload: OrderCreate) -> None:




        order.services.clear()









        for item in payload.services:




            category_name_snapshot = item.category_name_snapshot.strip() if item.category_name_snapshot else None




            service_name_snapshot = item.service_name_snapshot.strip()




            if item.service_catalog_id is not None:




                service_catalog = self.services_catalog.get_by_id(item.service_catalog_id)




                if not service_catalog:




                    raise AppError(code="not_found", message="Услуга из каталога не найдена", status_code=404)




                service_name_snapshot = service_catalog.name




                category_name_snapshot = service_catalog.category.name if service_catalog.category else category_name_snapshot









            order.services.append(




                CrmOrderService(




                    service_catalog_id=item.service_catalog_id,




                    service_name_snapshot=service_name_snapshot,




                    category_name_snapshot=category_name_snapshot,




                    unit_price=item.unit_price,




                    quantity=item.quantity,




                    sort_key=item.sort_key,




                )




            )









    def create(
        self,
        payload: OrderCreate,
        *,
        actor_user_id: int | None = None,
        actor_permissions: set[str] | None = None,
    ) -> CrmOrder:




        self._ensure_client_vehicle(payload.client_id, payload.vehicle_id)

        if self._requires_complete_permission(None, payload.status):
            self._require_actor_permission(actor_permissions, "orders.complete")

        payer_client_id = self._normalize_payer_client_id(payload.client_id, payload.payer_client_id)
        self._ensure_payer_client(payer_client_id)

        order = CrmOrder(




            client_id=payload.client_id,




            payer_client_id=payer_client_id,




            vehicle_id=payload.vehicle_id,




            due_date=payload.due_date,




            scheduled_for=payload.scheduled_for,
            handover_at=payload.handover_at,




            comment=payload.comment.strip() if payload.comment else None,




            discount_value=payload.discount_value,
            discount_type=payload.discount_type,




        )




        self._replace_rows(order, payload)




        OrderCalculationService.recalculate_order(order)




        OrderStatusService.apply_status(order, self._resolve_create_status_record(payload.status))




        self.orders.create(order)




        self.audit_logs.record(




            actor_user_id=actor_user_id,




            entity_type="order",




            entity_id=order.id,




            action="create",




            title=f"Создан заказ #{order.id}",




            description=(



                f"Клиент ID: {order.client_id}, авто ID: {order.vehicle_id}, "
                f"Клиент ID: {order.client_id}, авто ID: {order.vehicle_id}, "



                f"Начальный статус: {order.status}"
                f"Начальный статус: {order.status}"




            ),




        )




        self.session.commit()




        return self.get(order.id)









    def list_all(self, *, archived: bool | None = None) -> list[CrmOrder]:




        return self.orders.list_all(archived=archived)









    def list_page(
        self,
        *,
        archived_scope: str | None = None,
        search: str | None = None,
        status_codes: list[str] | None = None,
        scheduled_from: date | None = None,
        scheduled_to: date | None = None,
        updated_from: date | None = None,
        updated_to: date | None = None,
        payment_statuses: list[str] | None = None,
        has_comment: bool | None = None,
        has_documents: bool | None = None,
        client_filter: str | None = None,
        brand: str | None = None,
        model: str | None = None,
        plate: str | None = None,
        sort_by: list[str] | None = None,
        sort_dir: list[str] | None = None,
        page: int | None = None,
        page_size: int | None = None,
    ) -> tuple[list[CrmOrder], int, int, int]:









        return self.orders.list_page(









            archived_scope=archived_scope,









            search=search,









            status_codes=status_codes,
            scheduled_from=scheduled_from,
            scheduled_to=scheduled_to,
            updated_from=updated_from,
            updated_to=updated_to,
            payment_statuses=payment_statuses,
            has_comment=has_comment,
            has_documents=has_documents,
            client_filter=client_filter,
            brand=brand,
            model=model,
            plate=plate,









            sort_by=sort_by,









            sort_dir=sort_dir,









            page=page,









            page_size=page_size,









        )









    def list_archive(self) -> list[CrmOrder]:




        return self.orders.list_all(archived=True)









    def search(self, query: str, *, archived: bool | None = None) -> list[CrmOrder]:




        search_query = query.strip()




        if not search_query:




            return self.list_all(archived=archived)




        return self.orders.search(




            name_query=search_query,




            phone_query=normalize_phone_search_query(search_query) or None,




            plate_query=normalize_plate_search_query(search_query) or None,




            vin_query=normalize_vin_search_query(search_query) or None,




            search_query=search_query,




            archived=archived,




        )









    def get(self, order_id: int) -> CrmOrder:




        order = self.orders.get_by_id(order_id)




        if not order:




            raise AppError(code="not_found", message="Заказ не найден", status_code=404)




        return order









    def to_read(self, order: CrmOrder) -> OrderRead:
        payment_totals = summarize_order_payments(order)




        return OrderRead.model_validate(




            {




                "id": order.id,




                "client_id": order.client_id,
                "payer_client_id": order.payer_client_id,




                "vehicle_id": order.vehicle_id,




                "status": order.status,




                "status_display_name": order.status_record.display_name if order.status_record else order.status,




                "status_group": order.status_record.status_group if order.status_record else "new",




                "status_color": order.status_record.color if order.status_record else "#6b7280",




                "completed_at": order.completed_at,




                "due_date": order.due_date,




                "scheduled_for": order.scheduled_for,
                "handover_at": order.handover_at,




                "comment": order.comment,




                "discount_value": order.discount_value,
                "discount_type": order.discount_type,




                "services_total": order.services_total,
                "amount_to_pay": order.amount_to_pay,
                "paid_total": payment_totals.paid_total,
                "balance_due": payment_totals.balance_due,
                "payment_status": payment_totals.payment_status,








                "client_summary": self._build_client_summary(order),
                "vehicle_summary": self._build_vehicle_summary(order),
                "is_archived": order.is_archived,
                "services": order.services,
                "payments": [OrderPaymentRead.model_validate(payment) for payment in order.payments],




                "status_history": self._build_status_history(order),




            }




        )









    def to_summary_read(self, order: CrmOrder) -> OrderSummaryRead:
        payment_totals = summarize_order_payments(order)




        status_history = self._build_status_history(order)




        primary_service = next((service for service in order.services if service.category_name_snapshot), None)




        primary_category = primary_service.service_catalog.category if primary_service and primary_service.service_catalog else None




        category_colors: list[str] = []




        seen_colors: set[str] = set()









        for service in order.services:




            category = service.service_catalog.category if service.service_catalog else None




            if not category or not category.color:




                continue









            normalized_color = category.color.strip().lower()




            if not normalized_color or normalized_color in seen_colors:




                continue









            seen_colors.add(normalized_color)




            category_colors.append(category.color)









        return OrderSummaryRead.model_validate(




            {




                "id": order.id,




                "client_id": order.client_id,
                "payer_client_id": order.payer_client_id,




                "vehicle_id": order.vehicle_id,




                "status": order.status,




                "status_display_name": order.status_record.display_name if order.status_record else order.status,




                "status_group": order.status_record.status_group if order.status_record else "new",




                "status_color": order.status_record.color if order.status_record else "#6b7280",




                "status_changed_at": status_history[-1].changed_at if status_history else None,
                "updated_at": order.updated_at,




                "completed_at": order.completed_at,




                "due_date": order.due_date,




                "scheduled_for": order.scheduled_for,
                "handover_at": order.handover_at,




                "comment": order.comment,




                "discount_value": order.discount_value,
                "discount_type": order.discount_type,




                "services_total": order.services_total,
                "amount_to_pay": order.amount_to_pay,
                "paid_total": payment_totals.paid_total,
                "balance_due": payment_totals.balance_due,
                "payment_status": payment_totals.payment_status,








                "is_archived": order.is_archived,




                "client_full_name": order.client.display_label,




                "client_phone": order.client.phone_display,




                "vehicle_plate_number": order.vehicle.plate_number_display,




                "vehicle_brand": order.vehicle.brand,




                "vehicle_model": order.vehicle.model,




                "vehicle_vin": order.vehicle.vin,




                "service_names": [service.service_name_snapshot for service in order.services],




                "primary_category_name": primary_service.category_name_snapshot if primary_service else None,




                "primary_category_color": primary_category.color if primary_category else None,




                "category_colors": category_colors,




            }




        )









    @staticmethod
    def _build_client_summary(order: CrmOrder) -> OrderClientSummaryRead:
        return OrderClientSummaryRead.model_validate(
            {
                "id": order.client.id,
                "full_name": order.client.display_label,
                "phone_display": order.client.phone_display,
            }
        )









    def get_list_summary(self, *, archived_scope: str | None = None, search: str | None = None) -> OrderListSummaryRead:









        return OrderListSummaryRead.model_validate(









            self.orders.get_list_summary(archived_scope=archived_scope, search=search)









        )

    @staticmethod
    def _build_vehicle_summary(order: CrmOrder) -> OrderVehicleSummaryRead:
        vehicle_display_name_parts = [part for part in [order.vehicle.brand, order.vehicle.model] if part]
        vehicle_display_name = (
            f"{order.vehicle.plate_number_display} · {' '.join(vehicle_display_name_parts)}"
            if vehicle_display_name_parts
            else order.vehicle.plate_number_display
        )
        return OrderVehicleSummaryRead.model_validate(
            {
                "id": order.vehicle.id,
                "client_id": order.vehicle.client_id,
                "plate_number_display": order.vehicle.plate_number_display,
                "brand": order.vehicle.brand,
                "model": order.vehicle.model,
                "vin": order.vehicle.vin,
                "display_name": vehicle_display_name,
            }
        )

    def update(
        self,
        order_id: int,
        payload: OrderCreate,
        *,
        actor_user_id: int | None = None,
        actor_permissions: set[str] | None = None,
    ) -> CrmOrder:




        order = self.get(order_id)

        if self._requires_price_change_permission(order, payload):
            self._require_actor_permission(actor_permissions, "orders.change_prices")

        if self._requires_complete_permission(order.status, payload.status):
            self._require_actor_permission(actor_permissions, "orders.complete")




        self._ensure_client_vehicle(payload.client_id, payload.vehicle_id, existing_order=order)

        payload_fields = getattr(payload, "model_fields_set", set())
        if "payer_client_id" in payload_fields:
            payer_client_id = self._normalize_payer_client_id(payload.client_id, payload.payer_client_id)
            self._ensure_payer_client(payer_client_id)
            order.payer_client_id = payer_client_id

        order.client_id = payload.client_id




        order.vehicle_id = payload.vehicle_id




        order.due_date = payload.due_date




        order.scheduled_for = payload.scheduled_for
        order.handover_at = payload.handover_at




        order.comment = payload.comment.strip() if payload.comment else None




        order.discount_value = Decimal(payload.discount_value)
        order.discount_type = payload.discount_type




        self._replace_rows(order, payload)




        OrderCalculationService.recalculate_order(order)




        OrderStatusService.apply_status(order, self._get_status_record(payload.status), completed_at=order.completed_at)




        self.audit_logs.record(




            actor_user_id=actor_user_id,




            entity_type="order",




            entity_id=order.id,




            action="update",




            title=f"Обновлён заказ #{order.id}",




            description=f"Статус: {order.status}",




        )




        self.session.commit()




        return self.get(order_id)









    def update_status(
        self,
        order_id: int,
        next_status_code: str,
        *,
        completed_at: datetime | None = None,
        actor_user_id: int | None = None,
        actor_permissions: set[str] | None = None,
    ) -> CrmOrder:
        order = self.get(order_id)

        status_record = self._get_status_record(next_status_code)
        if self._requires_complete_permission(order.status, next_status_code):
            self._require_actor_permission(actor_permissions, "orders.complete")
        OrderStatusService.apply_status(order, status_record, completed_at=completed_at)

        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="order",
            entity_id=order.id,
            action="update_status",
            title=f"Изменён статус заказа #{order.id}",
            description=f"Новый статус: {order.status}",
        )

        self.session.commit()
        return self.get(order_id)

    def _build_status_history(self, order: CrmOrder) -> list[OrderStatusHistoryEntryRead]:




        audit_logs = self.audit_logs.audit_logs.list_by_entity("order", order.id, limit=200)




        history: list[OrderStatusHistoryEntryRead] = []









        created_status = self._normalize_status_code(self._resolve_created_status(audit_logs) or "new")




        history.append(OrderStatusHistoryEntryRead(status=created_status, changed_at=order.created_at))









        for audit_log in audit_logs:




            parsed_status = self._parse_status_from_audit_log(audit_log)




            if parsed_status is None:




                continue




            if history[-1].status == parsed_status:




                continue




            history.append(OrderStatusHistoryEntryRead(status=parsed_status, changed_at=audit_log.created_at))









        if history[-1].status != order.status:




            history.append(OrderStatusHistoryEntryRead(status=order.status, changed_at=order.updated_at))









        return history









    def _resolve_created_status(self, audit_logs: list[CrmAuditLog]) -> str | None:




        for audit_log in audit_logs:




            if audit_log.action != "create":




                continue




            return self._parse_status_from_audit_log(audit_log)




        return None









    def _parse_status_from_audit_log(self, audit_log: CrmAuditLog) -> str | None:

        payload = " ".join(
            filter(None, [repair_mojibake_text(audit_log.title), repair_mojibake_text(audit_log.description)])
        )

        for pattern in self.STATUS_PATTERNS:

            match = pattern.search(payload)

            if match:

                return self._normalize_status_code(match.group("status").lower())

        return None

    def _normalize_status_code(self, status: str) -> str:
        return self.LEGACY_STATUS_MAP.get(status, status)
