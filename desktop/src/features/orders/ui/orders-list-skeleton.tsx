export function OrdersListSkeleton() {
  return (
    <div className="glass-panel rounded-2xl p-4">
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-border bg-surface-2 p-4">
            <div className="h-4 w-24 rounded bg-background/60" />
            <div className="mt-3 h-4 w-1/3 rounded bg-background/60" />
            <div className="mt-2 h-3 w-2/3 rounded bg-background/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
