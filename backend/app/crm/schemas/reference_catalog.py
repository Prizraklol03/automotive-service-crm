from pydantic import Field

from app.crm.schemas.common import CrmSchema


class CarBrandCreate(CrmSchema):
    name: str = Field(min_length=1, max_length=128)
    sort_order: int = 0
    is_active: bool = True


class CarBrandRead(CrmSchema):
    id: int
    name: str
    aliases: list[str] = Field(default_factory=list)
    sort_order: int
    is_active: bool


class CarModelCreate(CrmSchema):
    brand_id: int
    name: str = Field(min_length=1, max_length=128)
    sort_order: int = 0
    is_active: bool = True


class CarModelRead(CrmSchema):
    id: int
    brand_id: int
    name: str
    aliases: list[str] = Field(default_factory=list)
    sort_order: int
    is_active: bool
