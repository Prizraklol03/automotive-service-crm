import { z } from "zod";

import { getClientDisplayLabel, normalizeClientType, type Client, type ClientPayload, type ClientType } from "@/entities/client/model/types";
import { formatPhoneNumber, normalizePhoneNumber } from "@/shared/lib/phone";
import { normalizeTelegramUsername } from "@/shared/lib/telegram";

export const clientFormSchema = z.object({
  actual_address: z.string().max(5000),
  address: z.string().max(5000),
  client_type: z.enum(["individual", "legal"]),
  comment: z.string().max(5000),
  company_name: z.string().max(255),
  full_name: z.string().trim().max(255),
  inn: z.string().max(32),
  kpp: z.string().max(32),
  legal_address: z.string().max(5000),
  ogrn: z.string().max(32),
  representative_basis: z.string().max(5000),
  representative_full_name: z.string().max(255),
  representative_position: z.string().max(255),
  phone: z
    .string()
    .trim()
    .min(1, "Введите телефон")
    .max(32)
    .refine((value) => normalizePhoneNumber(value) !== null, "Введите корректный номер РФ"),
  telegram_username: z.string().max(65)
}).superRefine((values, ctx) => {
  if (values.client_type === "legal") {
    if (!values.company_name.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Введите название организации",
        path: ["company_name"]
      });
    }
    return;
  }

  if (!values.full_name.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Введите имя клиента",
      path: ["full_name"]
    });
  }
});

export type ClientFormValues = {
  actual_address: string;
  address: string;
  client_type: ClientType;
  comment: string;
  company_name: string;
  full_name: string;
  inn: string;
  kpp: string;
  legal_address: string;
  ogrn: string;
  representative_basis: string;
  representative_full_name: string;
  representative_position: string;
  phone: string;
  telegram_username: string;
};

export function mapClientToFormValues(client: Client): ClientFormValues {
  const clientType = normalizeClientType(client.client_type);
  const displayLabel = getClientDisplayLabel(client);

  return {
    actual_address: client.actual_address ?? "",
    address: client.address ?? "",
    client_type: clientType,
    comment: client.comment ?? "",
    company_name: client.company_name ?? (clientType === "legal" ? displayLabel : ""),
    full_name: client.full_name ?? displayLabel,
    inn: client.inn ?? "",
    kpp: client.kpp ?? "",
    legal_address: client.legal_address ?? "",
    ogrn: client.ogrn ?? "",
    representative_basis: client.representative_basis ?? "",
    representative_full_name: client.representative_full_name ?? "",
    representative_position: client.representative_position ?? "",
    phone: formatPhoneNumber(client.phone_display),
    telegram_username: client.telegram_username ?? ""
  };
}

export function mapFormValuesToClientPayload(values: ClientFormValues): ClientPayload {
  const normalizedPhone = normalizePhoneNumber(values.phone);
  if (!normalizedPhone) {
    throw new Error("Phone must be normalized before submit");
  }

  const clientType: ClientType = values.client_type === "legal" ? "legal" : "individual";
  const legalFields = clientType === "legal";
  const resolvedCompanyName = values.company_name.trim() || values.full_name.trim();

  return {
    actual_address: legalFields ? values.actual_address.trim() || null : null,
    address: values.address.trim() || null,
    client_type: clientType,
    comment: values.comment.trim() ? values.comment.trim() : null,
    company_name: legalFields ? resolvedCompanyName || null : null,
    full_name: legalFields ? resolvedCompanyName : values.full_name.trim(),
    inn: legalFields ? values.inn.trim() || null : null,
    kpp: legalFields ? values.kpp.trim() || null : null,
    legal_address: legalFields ? values.legal_address.trim() || null : null,
    ogrn: legalFields ? values.ogrn.trim() || null : null,
    representative_basis: legalFields ? values.representative_basis.trim() || null : null,
    representative_full_name: legalFields ? values.representative_full_name.trim() || null : null,
    representative_position: legalFields ? values.representative_position.trim() || null : null,
    phone: normalizedPhone,
    telegram_username: normalizeTelegramUsername(values.telegram_username)
  };
}
