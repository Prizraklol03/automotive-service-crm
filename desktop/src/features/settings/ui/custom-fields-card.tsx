import { useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";

import {
  useCreateCustomFieldDefMutation,
  useCustomFieldDefsQuery,
  useDeleteCustomFieldDefMutation,
  useReorderCustomFieldDefsMutation,
  useUpdateCustomFieldDefMutation,
} from "@/features/settings/api/settings-hooks";
import type { CustomFieldDef, CustomFieldDefCreatePayload, FieldType } from "@/entities/settings/model/types";
import { FIELD_TYPE_LABELS } from "@/entities/settings/model/types";
import { cn } from "@/shared/lib/cn";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";
import { AppSwitch } from "@/shared/ui/app-switch";
import { SectionCard } from "@/shared/ui/section-card";

const FIELD_TYPES: FieldType[] = ["text", "number", "select", "checkbox", "date"];

type FormState = {
  label: string;
  field_type: FieldType;
  is_required: boolean;
  placeholder: string;
  options_text: string; // comma-separated for select type
};

const EMPTY_FORM: FormState = {
  label: "",
  field_type: "text",
  is_required: false,
  placeholder: "",
  options_text: "",
};

function FieldForm({
  initial,
  onSave,
  onCancel,
  isSaving,
  isEdit,
}: {
  initial: FormState;
  onSave: (form: FormState) => void;
  onCancel: () => void;
  isSaving: boolean;
  isEdit?: boolean;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const isValid = form.label.trim().length > 0;

  return (
    <div className="rounded-xl border border-border/80 bg-surface-2/60 p-4">
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Название поля *</label>
          <AppInput
            placeholder="Например: VIN-код, Цвет кузова"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Тип</label>
          <div className="flex flex-wrap gap-2">
            {FIELD_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setForm((f) => ({ ...f, field_type: type }))}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  form.field_type === type
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border/70 bg-surface-2 text-muted-foreground hover:border-border hover:text-foreground"
                )}
              >
                {FIELD_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        {form.field_type !== "checkbox" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Подсказка (placeholder)</label>
            <AppInput
              placeholder="Текст подсказки внутри поля"
              value={form.placeholder}
              onChange={(e) => setForm((f) => ({ ...f, placeholder: e.target.value }))}
            />
          </div>
        )}

        {form.field_type === "select" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Варианты (через запятую)
            </label>
            <AppInput
              placeholder="Вариант 1, Вариант 2, Вариант 3"
              value={form.options_text}
              onChange={(e) => setForm((f) => ({ ...f, options_text: e.target.value }))}
            />
          </div>
        )}

        <label className="flex cursor-pointer items-center gap-3">
          <AppSwitch
            checked={form.is_required}
            onChange={(v) => setForm((f) => ({ ...f, is_required: v }))}
          />
          <span className="text-sm text-foreground">Обязательное поле</span>
        </label>
      </div>

      <div className="mt-4 flex gap-2">
        <AppButton
          type="button"
          size="sm"
          disabled={!isValid || isSaving}
          onClick={() => onSave(form)}
        >
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {isEdit ? "Сохранить" : "Добавить поле"}
        </AppButton>
        <AppButton type="button" size="sm" variant="ghost" onClick={onCancel}>
          <X className="h-3.5 w-3.5" />
          Отмена
        </AppButton>
      </div>
    </div>
  );
}

function fieldFormToPayload(form: FormState): CustomFieldDefCreatePayload {
  const options =
    form.field_type === "select" && form.options_text.trim()
      ? form.options_text
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : null;
  return {
    label: form.label.trim(),
    field_type: form.field_type,
    is_required: form.is_required,
    placeholder: form.placeholder.trim() || null,
    options,
  };
}

function defToFormState(def: CustomFieldDef): FormState {
  return {
    label: def.label,
    field_type: def.field_type,
    is_required: def.is_required,
    placeholder: def.placeholder ?? "",
    options_text: def.options?.join(", ") ?? "",
  };
}

export function CustomFieldsCard() {
  const query = useCustomFieldDefsQuery();
  const createMutation = useCreateCustomFieldDefMutation();
  const updateMutation = useUpdateCustomFieldDefMutation();
  const deleteMutation = useDeleteCustomFieldDefMutation();
  const reorderMutation = useReorderCustomFieldDefsMutation();

	  const [showForm, setShowForm] = useState(false);
	  const [editingKey, setEditingKey] = useState<string | null>(null);
	  const defs = query.data ?? [];
	  const requiredCount = defs.filter((def) => def.is_required).length;

  const handleCreate = (form: FormState) => {
    createMutation.mutate(fieldFormToPayload(form), {
      onSuccess: () => setShowForm(false),
    });
  };

  const handleUpdate = (key: string, form: FormState) => {
    const payload = fieldFormToPayload(form);
    const existing = query.data?.find((d) => d.key === key);
    updateMutation.mutate(
      {
        key,
        payload: {
          label: payload.label,
          field_type: payload.field_type,
          is_required: payload.is_required,
          placeholder: payload.placeholder ?? null,
          options: payload.options ?? null,
          sort_order: existing?.sort_order ?? 0,
        },
      },
      { onSuccess: () => setEditingKey(null) }
    );
  };

  const handleDelete = (key: string, label: string) => {
    if (!window.confirm(`Удалить поле «${label}»? Все сохранённые значения будут потеряны.`)) return;
    deleteMutation.mutate(key);
  };

  const handleReorder = (index: number, direction: "up" | "down") => {
    if (!query.data) {
      return;
    }

    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= query.data.length) {
      return;
    }

    const keys = query.data.map((def) => def.key);
    const currentKey = keys[index];
    keys[index] = keys[nextIndex]!;
    keys[nextIndex] = currentKey!;
    reorderMutation.mutate(keys);
  };

	  return (
	    <SectionCard
	      title="Дополнительные поля заказа"
	      description="Настройте произвольные поля, которые будут заполняться внутри карточки заказа."
	      action={!showForm ? (
	        <AppButton type="button" size="sm" variant="outline" onClick={() => setShowForm(true)}>
	          <Plus className="h-3.5 w-3.5" />
	          Добавить
	        </AppButton>
	      ) : undefined}
	    >
	      <div className="mb-4 flex flex-wrap gap-2">
	        <span className="rounded-full border border-border/60 bg-surface-2/50 px-3 py-1 text-xs text-muted-foreground">
	          Всего полей: <span className="font-medium text-foreground">{defs.length}</span>
	        </span>
	        <span className="rounded-full border border-border/60 bg-surface-2/50 px-3 py-1 text-xs text-muted-foreground">
	          Обязательных: <span className="font-medium text-foreground">{requiredCount}</span>
	        </span>
	      </div>

      {showForm && (
        <div className="mb-4">
          <FieldForm
            initial={EMPTY_FORM}
            onSave={handleCreate}
            onCancel={() => setShowForm(false)}
            isSaving={createMutation.isPending}
          />
        </div>
      )}

      {query.isLoading && (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загружаем поля...
        </div>
      )}

      {query.data && query.data.length === 0 && !showForm && (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Дополнительных полей нет. Нажмите «Добавить», чтобы создать первое.
        </div>
      )}

	      {query.data && query.data.length > 0 && (
	        <div className="space-y-2">
	          {query.data.map((def) => (
            <div key={def.key}>
              {editingKey === def.key ? (
                <FieldForm
                  initial={defToFormState(def)}
                  onSave={(form) => handleUpdate(def.key, form)}
                  onCancel={() => setEditingKey(null)}
                  isSaving={updateMutation.isPending}
                  isEdit
                />
              ) : (
	                <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-surface-2/40 px-3 py-3">
                  <div className="flex shrink-0 flex-col gap-0.5">
                    <button
                      type="button"
                      aria-label="Переместить поле вверх"
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground disabled:opacity-30"
                      onClick={() => handleReorder(def.sort_order, "up")}
                      disabled={def.sort_order === 0 || reorderMutation.isPending}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Переместить поле вниз"
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground disabled:opacity-30"
                      onClick={() => handleReorder(def.sort_order, "down")}
                      disabled={def.sort_order === query.data.length - 1 || reorderMutation.isPending}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
	                  <div className="min-w-0 flex-1">
	                    <div className="flex items-center gap-2">
	                      <span className="text-sm font-semibold text-foreground">{def.label}</span>
	                      {def.is_required && (
	                        <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-medium text-accent">
	                          обяз.
	                        </span>
	                      )}
	                    </div>
	                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
	                      <span>{FIELD_TYPE_LABELS[def.field_type]}</span>
	                      {def.placeholder ? <span>· {def.placeholder}</span> : null}
	                    </div>
	                    {def.options && def.options.length > 0 ? (
	                      <div className="mt-2 flex flex-wrap gap-1.5">
	                        {def.options.map((option) => (
	                          <span key={option} className="rounded-full border border-border/60 bg-background/40 px-2 py-0.5 text-[11px] text-muted-foreground">
	                            {option}
	                          </span>
	                        ))}
	                      </div>
	                    ) : null}
	                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      aria-label="Редактировать"
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-3 hover:text-foreground"
                      onClick={() => setEditingKey(def.key)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Удалить"
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                      onClick={() => handleDelete(def.key, def.label)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
	                  </div>
	                </div>
	              )}
	            </div>
	          ))}
	        </div>
	      )}
	    </SectionCard>
	  );
	}
