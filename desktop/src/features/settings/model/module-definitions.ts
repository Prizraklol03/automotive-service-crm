import type { ModuleKey } from "@/entities/settings/model/types";

export type ModuleDefinition = {
  description: string;
  key: ModuleKey;
  label: string;
};

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  {
    key: "photos",
    label: "Фото-контур",
    description: "Фотографии до/после при приёмке, в процессе и после выдачи"
  },
  {
    key: "customer_payer",
    label: "Заказчик и плательщик",
    description: "Разделение владельца автомобиля, заказчика и плательщика в заказе"
  },
  {
    key: "scheduler",
    label: "Планировщик загрузки",
    description: "Слоты по постам и мастерам, визуальная запись на дату"
  },
  {
    key: "kanban",
    label: "Канбан заказов",
    description: "Доска с drag-and-drop по статусам заказов"
  },
  {
    key: "online_booking",
    label: "Онлайн-запись",
    description: "Виджет и ссылка для самостоятельной записи клиентов"
  },
  {
    key: "warehouse",
    label: "Склад и запчасти",
    description: "Учет остатков, приход и списание запчастей с привязкой к заказу"
  },
  {
    key: "labor_norms",
    label: "Нормо-часы",
    description: "База трудоёмкости по маркам, моделям и операциям"
  },
  {
    key: "salary",
    label: "Зарплаты и KPI",
    description: "Расчёт зарплат сотрудников и показатели эффективности"
  },
  {
    key: "maintenance_schedule",
    label: "Регламент обслуживания",
    description: "Умные напоминания клиентам по интервалам обслуживания"
  },
  {
    key: "vin_catalog",
    label: "VIN-каталоги",
    description: "Подбор запчастей по VIN через каталоги поставщиков"
  },
  {
    key: "client_portal",
    label: "Клиентский портал",
    description: "Личный кабинет клиента с историей работ и документами"
  }
];
