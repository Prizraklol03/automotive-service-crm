import { LoaderCircle } from "lucide-react";

import { useInfiniteScrollTrigger } from "@/shared/hooks/use-infinite-scroll-trigger";
import { cn } from "@/shared/lib/cn";
import { formatNumber } from "@/shared/lib/format";
import { AppButton } from "@/shared/ui/app-button";

type InfiniteScrollFooterProps = {
  className?: string;
  hasNextPage: boolean;
  isFetchNextPageError?: boolean;
  isFetchingNextPage?: boolean;
  loadedCount: number;
  onLoadMore: () => void;
  onRetry: () => void;
  total: number;
};

export function InfiniteScrollFooter({
  className,
  hasNextPage,
  isFetchNextPageError = false,
  isFetchingNextPage = false,
  loadedCount,
  onLoadMore,
  onRetry,
  total
}: InfiniteScrollFooterProps) {
  const shouldObserve = hasNextPage && !isFetchingNextPage && !isFetchNextPageError;
  const sentinelRef = useInfiniteScrollTrigger(() => {
    if (hasNextPage && !isFetchingNextPage) {
      onLoadMore();
    }
  }, !shouldObserve);

  if (!hasNextPage && loadedCount === 0) {
    return null;
  }

  return (
    <div className={cn("rounded-2xl border border-border/70 bg-surface/65 px-4 py-3 text-sm text-muted-foreground", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span>
          Показано {formatNumber(loadedCount)} из {formatNumber(total)}
        </span>
        {isFetchingNextPage ? (
          <span className="inline-flex items-center gap-1 text-foreground/80">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Загружаем ещё...
          </span>
        ) : null}
        {!hasNextPage && loadedCount > 0 ? <span>Все записи загружены</span> : null}
      </div>

      {isFetchNextPageError ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-warning">
          <span>Не удалось загрузить следующую порцию.</span>
          <AppButton size="sm" variant="outline" onClick={onRetry} type="button">
            Повторить
          </AppButton>
        </div>
      ) : null}

      <div ref={sentinelRef} aria-hidden="true" className="h-1 w-full" />
    </div>
  );
}
