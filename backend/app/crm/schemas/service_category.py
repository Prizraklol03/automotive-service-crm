from pydantic import Field

from app.crm.schemas.common import CrmSchema


class ServiceCategoryCreate(CrmSchema):
    color: str = Field(default="#4DA3FF", min_length=7, max_length=7)
    name: str = Field(min_length=1, max_length=255)
    sort_order: int = 0
    is_active: bool = True


class ServiceCategoryRead(CrmSchema):
    color: str
    id: int
    name: str
    sort_order: int
    is_active: bool


class ServiceCategoryReorderItem(CrmSchema):
    id: int
    sort_order: int = Field(ge=1)


class ServiceCategoryReorderRequest(CrmSchema):
    items: list[ServiceCategoryReorderItem] = Field(min_length=1)
