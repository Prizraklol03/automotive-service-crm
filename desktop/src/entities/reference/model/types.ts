export type CarBrand = {
  aliases: string[];
  id: number;
  is_active: boolean;
  name: string;
  sort_order: number;
};

export type CarModel = {
  aliases: string[];
  brand_id: number;
  id: number;
  is_active: boolean;
  name: string;
  sort_order: number;
};
