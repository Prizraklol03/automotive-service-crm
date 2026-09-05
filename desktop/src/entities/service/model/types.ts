export type ServiceCategory = {
  color: string;
  id: number;
  is_active: boolean;
  name: string;
  sort_order: number;
};

export type ServiceCategoryPayload = {
  color: string;
  is_active: boolean;
  name: string;
  sort_order: number;
};

export type ServiceCatalogItem = {
  category_id: number;
  default_price: string;
  id: number;
  is_active: boolean;
  name: string;
  sort_order: number;
};

export type ServiceCatalogPayload = {
  category_id: number;
  default_price: string;
  is_active: boolean;
  name: string;
};

export type ServiceCatalogReorderPayload = {
  category_id: number;
  items: Array<{
    id: number;
    sort_order: number;
  }>;
};

export type ServiceCategoryReorderPayload = {
  items: Array<{
    id: number;
    sort_order: number;
  }>;
};
