import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createOrderReminderRequest,
  createReminderRequest,
  deleteReminderRequest,
  getReminderRequest,
  getNotificationsSummaryRequest,
  listNotificationsRequest,
  listOrderRemindersRequest,
  markReminderDoneRequest,
  postponeReminderRequest,
  repeatReminderRequest,
  updateReminderRequest
} from "@/entities/notification/api/notification-api";
import type {
  NotificationsScope,
  NotificationsSummary,
  ReminderCreatePayload,
  ReminderUpdatePayload
} from "@/entities/notification/model/types";

export function notificationsListQueryKey(scope: NotificationsScope) {
  return ["notifications", scope] as const;
}

export function reminderDetailQueryKey(reminderId: number) {
  return ["notifications", "detail", reminderId] as const;
}

export function orderRemindersQueryKey(orderId: number) {
  return ["notifications", "order-reminders", orderId] as const;
}

export function useNotificationsListQuery(scope: NotificationsScope) {
  return useQuery({
    queryKey: notificationsListQueryKey(scope),
    queryFn: () => listNotificationsRequest(scope),
    placeholderData: keepPreviousData,
    staleTime: 30_000
  });
}

export function notificationsSummaryQueryKey() {
  return ["notifications", "summary"] as const;
}

export function useNotificationsSummaryQuery() {
  return useQuery<NotificationsSummary>({
    queryKey: notificationsSummaryQueryKey(),
    queryFn: getNotificationsSummaryRequest,
    placeholderData: keepPreviousData,
    staleTime: 30_000
  });
}

export function useReminderDetailQuery(reminderId: number | null) {
  return useQuery({
    queryKey: reminderId ? reminderDetailQueryKey(reminderId) : ["notifications", "detail", "empty"],
    queryFn: () => getReminderRequest(reminderId as number),
    enabled: reminderId !== null
  });
}

export function useOrderRemindersQuery(orderId: number | null) {
  return useQuery({
    queryKey: orderId ? orderRemindersQueryKey(orderId) : ["notifications", "order-reminders", "empty"],
    queryFn: () => listOrderRemindersRequest(orderId as number),
    enabled: orderId !== null
  });
}

function invalidateNotifications(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["notifications"] });
}

export function useCreateReminderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ReminderCreatePayload) => createReminderRequest(payload),
    onSuccess: (reminder) => {
      queryClient.setQueryData(reminderDetailQueryKey(reminder.id), reminder);
      invalidateNotifications(queryClient);
    }
  });
}

export function useUpdateReminderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ reminderId, payload }: { reminderId: number; payload: ReminderUpdatePayload }) =>
      updateReminderRequest(reminderId, payload),
    onSuccess: (reminder) => {
      queryClient.setQueryData(reminderDetailQueryKey(reminder.id), reminder);
      invalidateNotifications(queryClient);
      if (reminder.target_type === "order") {
        void queryClient.invalidateQueries({ queryKey: orderRemindersQueryKey(reminder.target_id) });
      }
    }
  });
}

export function useDeleteReminderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reminderId: number) => deleteReminderRequest(reminderId),
    onSuccess: (_, reminderId) => {
      queryClient.removeQueries({ queryKey: reminderDetailQueryKey(reminderId) });
      invalidateNotifications(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["notifications", "order-reminders"] });
    }
  });
}

export function useMarkReminderDoneMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reminderId: number) => markReminderDoneRequest(reminderId, { completed_at: null }),
    onSuccess: (reminder) => {
      queryClient.setQueryData(reminderDetailQueryKey(reminder.id), reminder);
      invalidateNotifications(queryClient);
      if (reminder.target_type === "order") {
        void queryClient.invalidateQueries({ queryKey: orderRemindersQueryKey(reminder.target_id) });
      }
    }
  });
}

export function usePostponeReminderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ postponeUntil, reminderId }: { postponeUntil: string; reminderId: number }) =>
      postponeReminderRequest(reminderId, { postpone_until: postponeUntil }),
    onSuccess: (reminder) => {
      queryClient.setQueryData(reminderDetailQueryKey(reminder.id), reminder);
      invalidateNotifications(queryClient);
      if (reminder.target_type === "order") {
        void queryClient.invalidateQueries({ queryKey: orderRemindersQueryKey(reminder.target_id) });
      }
    }
  });
}

export function useRepeatReminderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ reminderId, repeatRule }: { reminderId: number; repeatRule: string | null }) =>
      repeatReminderRequest(reminderId, { repeat_rule: repeatRule }),
    onSuccess: (reminder) => {
      queryClient.setQueryData(reminderDetailQueryKey(reminder.id), reminder);
      invalidateNotifications(queryClient);
      if (reminder.target_type === "order") {
        void queryClient.invalidateQueries({ queryKey: orderRemindersQueryKey(reminder.target_id) });
      }
    }
  });
}

export function useCreateOrderReminderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orderId,
      payload
    }: {
      orderId: number;
      payload: { due_at: string; repeat_rule: string | null; text: string };
    }) => createOrderReminderRequest(orderId, payload),
    onSuccess: (reminder) => {
      queryClient.setQueryData(reminderDetailQueryKey(reminder.id), reminder);
      void queryClient.invalidateQueries({ queryKey: orderRemindersQueryKey(reminder.target_id) });
      invalidateNotifications(queryClient);
    }
  });
}
