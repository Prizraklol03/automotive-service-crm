from app.crm.repositories.car_brand_repository import CarBrandRepository
from app.crm.repositories.car_model_repository import CarModelRepository
from app.crm.repositories.client_repository import ClientRepository
from app.crm.repositories.document_repository import DocumentRepository
from app.crm.repositories.document_template_repository import DocumentTemplateRepository
from app.crm.repositories.order_repository import OrderRepository
from app.crm.repositories.reminder_repository import ReminderRepository
from app.crm.repositories.role_repository import RoleRepository
from app.crm.repositories.service_catalog_repository import ServiceCatalogRepository
from app.crm.repositories.service_category_repository import ServiceCategoryRepository
from app.crm.repositories.setting_repository import SettingRepository
from app.crm.repositories.user_repository import UserRepository
from app.crm.repositories.user_session_repository import UserSessionRepository
from app.crm.repositories.vehicle_repository import VehicleRepository

__all__ = [
    "CarBrandRepository",
    "CarModelRepository",
    "ClientRepository",
    "DocumentRepository",
    "DocumentTemplateRepository",
    "OrderRepository",
    "ReminderRepository",
    "RoleRepository",
    "ServiceCatalogRepository",
    "ServiceCategoryRepository",
    "SettingRepository",
    "UserRepository",
    "UserSessionRepository",
    "VehicleRepository",
]
