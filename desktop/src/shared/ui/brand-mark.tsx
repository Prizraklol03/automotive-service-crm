import { BRAND_FULL_NAME, BRAND_LOGO_PATH, BRAND_NAME } from "@/shared/config/brand";
import { cn } from "@/shared/lib/cn";

export function BrandMark({
  className,
  compact = false,
  hideBadge = false,
  subtitle
}: {
  className?: string;
  compact?: boolean;
  hideBadge?: boolean;
  subtitle?: string;
}) {
  return (
    <div className={cn("flex items-center gap-4", className)}>
      <div
        className={cn(
          "flex min-w-[132px] items-center justify-center rounded-2xl border border-[#d8dbd3] bg-[#f3f1ea] px-4 py-3 shadow-soft",
          compact && "min-w-[124px] rounded-xl px-3 py-2.5"
        )}
      >
        <img alt={`${BRAND_NAME} logo`} className={cn("h-9 w-auto object-contain", compact && "h-7")} src={BRAND_LOGO_PATH} />
      </div>
      <div className="min-w-0">
        {!hideBadge ? <p className="text-[11px] uppercase tracking-[0.32em] text-muted-foreground">{BRAND_NAME}</p> : null}
        <h2 className={cn("mt-1 text-lg font-semibold tracking-tight text-foreground", compact && "text-base")}>{BRAND_FULL_NAME}</h2>
        {subtitle ? <p className="mt-1 whitespace-nowrap text-xs tracking-[0.14em] text-muted-foreground">{subtitle}</p> : null}
      </div>
    </div>
  );
}
