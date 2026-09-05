from datetime import datetime

from pydantic import Field, model_validator

from app.crm.models.reminder import ReminderStatus, ReminderTargetType
from app.crm.schemas.common import CrmSchema


class ReminderCreate(CrmSchema):
    text: str = Field(min_length=1, max_length=2000)
    due_at: datetime
    repeat_rule: str | None = Field(default=None, max_length=255)


class ReminderManagerCreate(CrmSchema):
    due_at: datetime
    repeat_rule: str | None = Field(default=None, max_length=255)
    target_id: int | None = None
    target_type: ReminderTargetType | None = None
    text: str = Field(min_length=1, max_length=2000)

    @model_validator(mode="after")
    def validate_target(self):
        if self.target_type in (None, ReminderTargetType.STANDALONE):
            self.target_type = ReminderTargetType.STANDALONE
            self.target_id = 0
            return self

        if not self.target_id or self.target_id < 1:
            raise ValueError("target_id is required for linked reminder")
        return self


class ReminderUpdate(CrmSchema):
    due_at: datetime
    repeat_rule: str | None = Field(default=None, max_length=255)
    target_id: int | None = None
    target_type: ReminderTargetType | None = None
    text: str = Field(min_length=1, max_length=2000)

    @model_validator(mode="after")
    def validate_target(self):
        if self.target_type in (None, ReminderTargetType.STANDALONE):
            self.target_type = ReminderTargetType.STANDALONE
            self.target_id = 0
            return self

        if not self.target_id or self.target_id < 1:
            raise ValueError("target_id is required for linked reminder")
        return self


class ReminderPostponeUpdate(CrmSchema):
    postpone_until: datetime


class ReminderRepeatUpdate(CrmSchema):
    repeat_rule: str | None = Field(default=None, max_length=255)


class ReminderDoneUpdate(CrmSchema):
    completed_at: datetime | None = None


class ReminderTargetSummaryRead(CrmSchema):
    target_type: ReminderTargetType
    target_id: int
    title: str
    subtitle: str | None = None


class ReminderRead(CrmSchema):
    id: int
    target_type: ReminderTargetType
    target_id: int
    text: str
    due_at: datetime
    status: ReminderStatus
    postpone_until: datetime | None
    repeat_rule: str | None
    completed_at: datetime | None
    created_by_user_id: int
    created_at: datetime
    updated_at: datetime
    effective_status: str
    is_overdue: bool
    target_summary: ReminderTargetSummaryRead


class NotificationRead(CrmSchema):
    id: int
    reminder_id: int
    text: str
    due_at: datetime
    effective_status: str
    is_overdue: bool
    repeat_rule: str | None
    status: ReminderStatus
    postpone_until: datetime | None
    target_summary: ReminderTargetSummaryRead
    completed_at: datetime | None = None


class NotificationsSummaryRead(CrmSchema):
    due: int
    scheduled: int
    history: int
    all: int
