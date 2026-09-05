from app.crm.models.audit_log import CrmAuditLog
from app.crm.models.custom_field import CustomFieldDef, FieldType, OrderFieldValue
from app.crm.models.car_brand import CrmCarBrand
from app.crm.models.car_model import CrmCarModel
from app.crm.models.client import CrmClient
from app.crm.models.document import CrmDocument
from app.crm.models.document_template import CrmDocumentTemplate, DocumentType
from app.crm.models.external_lead import (
    CrmExternalLeadPayloadLog,
    CrmExternalLeadSubmission,
    CrmIntegrationSource,
)
from app.crm.models.finance_category import CrmFinanceCategory
from app.crm.models.finance_expense import CrmFinanceExpense
from app.crm.models.finance_expense_attachment import CrmFinanceExpenseAttachment
from app.crm.models.inspection import (
    CrmInspectionExport,
    CrmInspectionGeneralPhoto,
    CrmInspectionMark,
    CrmInspectionMarkPhoto,
    CrmInspectionSession,
    InspectionDefectType,
    InspectionGeometryType,
    InspectionMarkStatus,
    InspectionSessionStatus,
    InspectionSeverity,
    InspectionViewType,
)
from app.crm.models.material import CrmMaterial
from app.crm.models.material_attachment import CrmMaterialAttachment
from app.crm.models.note import CrmNote
from app.crm.models.order import CrmOrder, OrderStatus
from app.crm.models.order_payment import CrmOrderPayment, CrmOrderPaymentIdempotency, OrderPaymentMethod
from app.crm.models.order_status import ACTIVE_GROUPS, ARCHIVED_GROUPS, CrmOrderStatus, StatusGroup
from app.crm.models.order_photo import CrmOrderPhoto, PhotoStage
from app.crm.models.order_service import CrmOrderService
from app.crm.models.reminder import CrmReminder, ReminderStatus, ReminderTargetType
from app.crm.models.role import CrmRole
from app.crm.models.user_permission import CrmUserPermission
from app.crm.models.service_catalog import CrmServiceCatalog
from app.crm.models.service_category import CrmServiceCategory
from app.crm.models.setting import CrmSetting
from app.crm.models.user import CrmUser
from app.crm.models.user_preference import CrmUserPreference
from app.crm.models.user_session import CrmUserSession
from app.crm.models.vehicle import CrmVehicle
from app.crm.models.vehicle_owner_history import CrmVehicleOwnerHistory

__all__ = [
    "CustomFieldDef",
    "FieldType",
    "OrderFieldValue",
    "ACTIVE_GROUPS",
    "ARCHIVED_GROUPS",
    "CrmOrderStatus",
    "StatusGroup",
    "CrmCarBrand",
    "CrmCarModel",
    "CrmAuditLog",
    "CrmClient",
    "CrmDocument",
    "CrmDocumentTemplate",
    "CrmExternalLeadPayloadLog",
    "CrmExternalLeadSubmission",
    "CrmFinanceCategory",
    "CrmFinanceExpense",
    "CrmFinanceExpenseAttachment",
    "CrmIntegrationSource",
    "CrmInspectionExport",
    "CrmInspectionGeneralPhoto",
    "CrmInspectionMark",
    "CrmInspectionMarkPhoto",
    "CrmInspectionSession",
    "CrmMaterial",
    "CrmMaterialAttachment",
    "CrmNote",
    "CrmOrder",
    "CrmOrderPayment",
    "CrmOrderPaymentIdempotency",
    "CrmOrderPhoto",
    "CrmOrderService",
    "CrmReminder",
    "CrmRole",
    "CrmUserPermission",
    "CrmServiceCatalog",
    "CrmServiceCategory",
    "CrmSetting",
    "CrmUser",
    "CrmUserPreference",
    "CrmUserSession",
    "CrmVehicle",
    "CrmVehicleOwnerHistory",
    "DocumentType",
    "InspectionDefectType",
    "InspectionGeometryType",
    "InspectionMarkStatus",
    "InspectionSessionStatus",
    "InspectionSeverity",
    "InspectionViewType",
    "OrderStatus",
    "OrderPaymentMethod",
    "PhotoStage",
    "ReminderStatus",
    "ReminderTargetType",
]
