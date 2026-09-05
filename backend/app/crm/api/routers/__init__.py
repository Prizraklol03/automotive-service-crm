from fastapi import APIRouter

from app.crm.api.routers import (
    analytics,
    auth,
    car_brands,
    car_models,
    clients,
    custom_fields,
    documents,
    finances,
    finance_expense_attachments,
    integrations,
    inspection_marks,
    inspection_sessions,
    materials,
    material_attachments,
    notes,
    notifications,
    order_photos,
    order_payments,
    order_statuses,
    orders,
    presets,
    reminders,
    service_categories,
    services_catalog,
    settings,
    users,
    vehicles,
)

crm_api_router = APIRouter()
crm_api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
crm_api_router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
crm_api_router.include_router(users.router, prefix="/users", tags=["users"])
crm_api_router.include_router(clients.router, prefix="/clients", tags=["clients"])
crm_api_router.include_router(vehicles.router, prefix="/vehicles", tags=["vehicles"])
crm_api_router.include_router(car_brands.router, prefix="/car-brands", tags=["car-brands"])
crm_api_router.include_router(car_models.router, prefix="/car-models", tags=["car-models"])
crm_api_router.include_router(service_categories.router, prefix="/service-categories", tags=["service-categories"])
crm_api_router.include_router(services_catalog.router, prefix="/services", tags=["services"])
crm_api_router.include_router(materials.router, prefix="/materials", tags=["materials"])
crm_api_router.include_router(material_attachments.router, prefix="/materials", tags=["material-attachments"])
crm_api_router.include_router(notes.router, prefix="/notes", tags=["notes"])
crm_api_router.include_router(integrations.router, prefix="/integrations", tags=["integrations"])
crm_api_router.include_router(orders.router, prefix="/orders", tags=["orders"])
crm_api_router.include_router(order_photos.router, prefix="/orders", tags=["order-photos"])
crm_api_router.include_router(order_payments.router, tags=["order-payments"])
crm_api_router.include_router(inspection_sessions.router, tags=["inspection-sessions"])
crm_api_router.include_router(inspection_marks.router, tags=["inspection-marks"])
crm_api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
crm_api_router.include_router(reminders.router, tags=["reminders"])
crm_api_router.include_router(documents.router, tags=["documents"])
crm_api_router.include_router(finances.router, prefix="/finance", tags=["finance"])
crm_api_router.include_router(
    finance_expense_attachments.router,
    prefix="/finance/expenses",
    tags=["finance-expense-attachments"],
)
crm_api_router.include_router(settings.router, prefix="/settings", tags=["settings"])
crm_api_router.include_router(order_statuses.router, prefix="/settings", tags=["order-statuses"])
crm_api_router.include_router(presets.router, prefix="/settings", tags=["presets"])
crm_api_router.include_router(custom_fields.settings_router, prefix="/settings", tags=["custom-fields"])
crm_api_router.include_router(custom_fields.order_router, tags=["order-field-values"])
