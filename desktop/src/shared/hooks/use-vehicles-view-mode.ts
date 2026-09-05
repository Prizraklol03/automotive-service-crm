import { usePersistedViewMode } from "@/shared/hooks/use-persisted-view-mode";

export function useVehiclesViewMode() {
  return usePersistedViewMode("crm.pref.vehiclesViewMode", "rows");
}
