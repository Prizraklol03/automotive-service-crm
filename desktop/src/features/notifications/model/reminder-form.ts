import { z } from "zod";

export const reminderEditorSchema = z.object({
  due_at: z.string().min(1, "Укажите дату и время"),
  repeat_rule: z.string().max(255),
  target_id: z.number().int().nullable(),
  target_type: z.enum(["client", "order", "vehicle", "standalone"]),
  text: z.string().trim().min(1, "Введите текст напоминания").max(2000)
}).superRefine((value, ctx) => {
  if (value.target_type !== "standalone" && value.target_id === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Выберите связанную сущность",
      path: ["target_id"]
    });
  }
});

export type ReminderEditorValues = z.infer<typeof reminderEditorSchema>;

export const postponeReminderSchema = z.object({
  postpone_until: z.string().min(1, "Укажите новую дату и время")
});

export type PostponeReminderValues = z.infer<typeof postponeReminderSchema>;

export const repeatReminderSchema = z.object({
  repeat_rule: z.string().max(255)
});

export type RepeatReminderValues = z.infer<typeof repeatReminderSchema>;
