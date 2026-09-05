import type { OrderSummary } from "@/entities/order/model/types";

const FALLBACK_ORDER_COLOR = "#4DA3FF";

export function getOrderAccentColors(order: Pick<OrderSummary, "category_colors" | "primary_category_color">) {
  const seen = new Set<string>();
  const colors = order.category_colors.reduce<string[]>((result, color) => {
    const normalizedColor = color.trim().toLowerCase();
    if (!normalizedColor || seen.has(normalizedColor)) {
      return result;
    }

    seen.add(normalizedColor);
    result.push(color);
    return result;
  }, []);

  if (colors.length > 0) {
    return colors;
  }

  return [order.primary_category_color ?? FALLBACK_ORDER_COLOR];
}

export function getUniqueOrderAccentColors(orders: Array<Pick<OrderSummary, "category_colors" | "primary_category_color">>) {
  const seen = new Set<string>();

  return orders.reduce<string[]>((colors, order) => {
    getOrderAccentColors(order).forEach((color) => {
      const normalizedColor = color.trim().toLowerCase();
      if (!normalizedColor || seen.has(normalizedColor)) {
        return;
      }

      seen.add(normalizedColor);
      colors.push(color);
    });

    return colors;
  }, []);
}
