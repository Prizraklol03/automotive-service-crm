export type InspectionChecklistItemDefinition = {
  key: string;
  label: string;
  noteLabel?: string;
};

export type InspectionChecklistValue = Record<string, { checked: boolean; label: string; note?: string }>;

export const INSPECTION_CHECKLIST_DEFINITIONS: InspectionChecklistItemDefinition[] = [
  { key: "windshield_chips", label: "Сколы лобового стекла", noteLabel: "Комментарий" },
  { key: "wheel_damage", label: "Повреждения дисков", noteLabel: "Комментарий" },
  { key: "interior_dirt", label: "Загрязнение салона", noteLabel: "Комментарий" },
  { key: "customer_items", label: "Вещи клиента в салоне", noteLabel: "Что именно" },
  { key: "glass_cracks", label: "Трещины стекол", noteLabel: "Комментарий" },
  { key: "optics_damage", label: "Повреждения оптики", noteLabel: "Комментарий" },
  { key: "fuel_level", label: "Уровень топлива", noteLabel: "Отметка топлива" },
  { key: "body_condition", label: "Общий внешний вид загрязнения", noteLabel: "Комментарий" },
  { key: "other", label: "Прочее", noteLabel: "Комментарий" },
];

export function createDefaultInspectionChecklist(): InspectionChecklistValue {
  return INSPECTION_CHECKLIST_DEFINITIONS.reduce<InspectionChecklistValue>((acc, item) => {
    acc[item.key] = {
      checked: false,
      label: item.label,
      note: "",
    };
    return acc;
  }, {});
}
