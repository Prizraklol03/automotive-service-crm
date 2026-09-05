from datetime import date, datetime

from pydantic import Field

from app.crm.schemas.common import CrmSchema


class VehicleCreate(CrmSchema):
    client_id: int
    plate_number: str = Field(min_length=1, max_length=32)
    vin: str | None = Field(default=None, max_length=32)
    brand_id: int | None = None
    model_id: int | None = None
    brand: str | None = Field(default=None, max_length=128)
    model: str | None = Field(default=None, max_length=128)
    year: int | None = None
    mileage: int | None = Field(default=None, ge=0)
    color: str | None = Field(default=None, max_length=64)
    comment: str | None = None


class VehicleRead(CrmSchema):
    id: int
    client_id: int
    plate_number_display: str
    plate_number_normalized: str
    vin: str | None
    brand_id: int | None
    model_id: int | None
    brand: str | None
    model: str | None
    year: int | None
    mileage: int | None
    color: str | None
    comment: str | None
    is_deleted: bool
    deleted_at: datetime | None

class VehicleOwnerChangeCreate(CrmSchema):
    client_id: int
    owned_from: date | None = None
    comment: str | None = None
