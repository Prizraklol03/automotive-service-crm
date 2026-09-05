import { usePersistedViewMode } from "@/shared/hooks/use-persisted-view-mode";

export function useClientsViewMode() {
  return usePersistedViewMode("crm.pref.clientsViewMode", "rows");
}
