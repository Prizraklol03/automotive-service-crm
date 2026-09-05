from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict


class CrmSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


T = TypeVar("T")


class PaginatedRead(CrmSchema, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
