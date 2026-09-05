from decimal import Decimal

from pydantic import Field

from app.crm.schemas.common import CrmSchema


class ServiceCatalogCreate(CrmSchema):
    category_id: int
    name: str = Field(min_length=1, max_length=255)
    default_price: Decimal = Field(ge=1)
    is_active: bool = True


class ServiceCatalogRead(CrmSchema):
    id: int
    category_id: int
    name: str
    default_price: Decimal
    is_active: bool
    sort_order: int


class ServiceCatalogReorderItem(CrmSchema):
    id: int
    sort_order: int = Field(ge=1)


class ServiceCatalogReorderRequest(CrmSchema):
    category_id: int
    items: list[ServiceCatalogReorderItem] = Field(min_length=1)
