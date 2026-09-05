import { apiRequest } from "@/shared/api/client";
import type {
  NotificationItem,
  NotificationsScope,
  Reminder,
  ReminderCreatePayload,
  ReminderDonePayload,
  ReminderPostponePayload,
  ReminderRepeatPayload,
  ReminderUpdatePayload
} from "@/entities/notification/model/types";

export function listNotificationsRequest(scope: NotificationsScope) {
  return apiRequest<NotificationItem[]>(`/notifications?scope=${scope}`);
}

export function getNotificationsSummaryRequest() {
  return apiRequest<{ all: number; due: number; history: number; scheduled: number }>("/notifications/summary");
}

export function listNotificationsHistoryRequest() {
  return apiRequest<NotificationItem[]>("/notifications/history");
}

export function getReminderRequest(reminderId: number) {
  return apiRequest<Reminder>(`/reminders/${reminderId}`);
}

export function createReminderRequest(payload: ReminderCreatePayload) {
  return apiRequest<Reminder>("/reminders", {
    method: "POST",
    body: payload
  });
}

export function updateReminderRequest(reminderId: number, payload: ReminderUpdatePayload) {
  return apiRequest<Reminder>(`/reminders/${reminderId}`, {
    method: "PATCH",
    body: payload
  });
}

export function deleteReminderRequest(reminderId: number) {
  return apiRequest<void>(`/reminders/${reminderId}`, {
    method: "DELETE"
  });
}

export function listOrderRemindersRequest(orderId: number) {
  return apiRequest<Reminder[]>(`/orders/${orderId}/reminders`);
}

export function createOrderReminderRequest(orderId: number, payload: Omit<ReminderCreatePayload, "target_id" | "target_type">) {
  return apiRequest<Reminder>(`/orders/${orderId}/reminders`, {
    method: "POST",
    body: payload
  });
}

export function markReminderDoneRequest(reminderId: number, payload: ReminderDonePayload) {
  return apiRequest<Reminder>(`/reminders/${reminderId}/done`, {
    method: "PATCH",
    body: payload
  });
}

export function postponeReminderRequest(reminderId: number, payload: ReminderPostponePayload) {
  return apiRequest<Reminder>(`/reminders/${reminderId}/postpone`, {
    method: "PATCH",
    body: payload
  });
}

export function repeatReminderRequest(reminderId: number, payload: ReminderRepeatPayload) {
  return apiRequest<Reminder>(`/reminders/${reminderId}/repeat`, {
    method: "PATCH",
    body: payload
  });
}
