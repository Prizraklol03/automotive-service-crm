import { AlertTriangle } from "lucide-react";

import { AppButton } from "@/shared/ui/app-button";

export function ErrorState({
  actionLabel,
  description,
  onAction,
  title
}: {
  actionLabel?: string;
  description: string;
  onAction?: () => void;
  title: string;
}) {
  return (
    <div className="glass-panel rounded-2xl p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/10 text-danger">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      {actionLabel && onAction ? (
        <div className="mt-5 flex justify-center">
          <AppButton onClick={onAction}>{actionLabel}</AppButton>
        </div>
      ) : null}
    </div>
  );
}
