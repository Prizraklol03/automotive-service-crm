import type { Vehicle } from "@/entities/vehicle/model/types";
import type { ListViewMode } from "@/shared/hooks/use-persisted-view-mode";
import { cn } from "@/shared/lib/cn";
import { EmptyState } from "@/shared/ui/empty-state";

export function VehiclesList({
  isMobile,
  onOpenVehicle,
  selectedVehicleId,
  vehicles,
  viewMode = "rows"
}: {
  isMobile: boolean;
  onOpenVehicle: (vehicleId: number) => void;
  selectedVehicleId: number | null;
  vehicles: Vehicle[];
  viewMode?: ListViewMode;
}) {
  if (!vehicles.length) {
    return (
      <EmptyState
        title="Автомобили не найдены"
        description="Измените поиск по госномеру, марке, модели или VIN, либо создайте новый автомобиль."
      />
    );
  }

  const renderVehicleCard = (vehicle: Vehicle) => (
    <button
      key={vehicle.id}
      type="button"
      onClick={() => onOpenVehicle(vehicle.id)}
      className={cn(
        "glass-panel w-full cursor-pointer rounded-2xl p-4 text-left transition-colors hover:bg-surface-2/80",
        selectedVehicleId === vehicle.id && "border-accent/60"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold">{vehicle.plate_number_display}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {[vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "Марка и модель не указаны"}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">{vehicle.year || "—"}</div>
      </div>
      <div className="mt-3 text-sm text-muted-foreground">VIN: {vehicle.vin || "—"}</div>
    </button>
  );

  if (isMobile || viewMode === "cards") {
    return <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">{vehicles.map(renderVehicleCard)}</div>;
  }

  return (
    <div className="glass-panel overflow-hidden rounded-2xl">
      <div className="grid grid-cols-[200px_1fr_160px_180px] gap-4 border-b border-border bg-surface-2/70 px-4 py-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <span>Госномер</span>
        <span>Автомобиль</span>
        <span>Год</span>
        <span>VIN</span>
      </div>
      <div className="divide-y divide-border">
        {vehicles.map((vehicle) => (
          <button
            key={vehicle.id}
            type="button"
            onClick={() => onOpenVehicle(vehicle.id)}
            className={cn(
              "grid w-full cursor-pointer grid-cols-[200px_1fr_160px_180px] gap-4 px-4 py-4 text-left transition-colors hover:bg-surface-2/50",
              selectedVehicleId === vehicle.id && "bg-accent-muted/60"
            )}
          >
            <div className="font-medium">{vehicle.plate_number_display}</div>
            <div className="min-w-0 text-sm text-muted-foreground">
              {[vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "Марка и модель не указаны"}
            </div>
            <div className="text-sm text-muted-foreground">{vehicle.year || "—"}</div>
            <div className="truncate text-sm text-muted-foreground">{vehicle.vin || "—"}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
