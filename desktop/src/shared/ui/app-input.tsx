import * as React from "react";
import { CalendarClock, CalendarDays, Clock3 } from "lucide-react";

import { cn } from "@/shared/lib/cn";

export type AppInputProps = React.InputHTMLAttributes<HTMLInputElement>;

const DATE_LIKE_TYPES = new Set(["date", "datetime-local", "time"]);
const FIELD_BACKGROUND_CLASS = "bg-[var(--field-background)]";

function isDateLikeType(type: string | undefined): type is "date" | "datetime-local" | "time" {
  return type !== undefined && DATE_LIKE_TYPES.has(type);
}

function formatDateLikeValue(type: "date" | "datetime-local" | "time", value: string) {
  if (!value) {
    return "";
  }

  if (type === "date") {
    const [year, month, day] = value.split("-");
    if (!year || !month || !day) {
      return value;
    }
    return `${day}.${month}.${year}`;
  }

  if (type === "time") {
    return value.slice(0, 5);
  }

  const [datePart, timePart = ""] = value.split("T");
  if (!datePart) {
    return value;
  }
  const [year, month, day] = datePart.split("-");
  if (!year || !month || !day) {
    return value;
  }

  return `${day}.${month}.${year}${timePart ? `, ${timePart.slice(0, 5)}` : ""}`;
}

function getDateLikePlaceholder(type: "date" | "datetime-local" | "time", placeholder: string | undefined) {
  if (placeholder) {
    return placeholder;
  }

  if (type === "datetime-local") {
    return "Выберите дату и время";
  }

  if (type === "time") {
    return "Выберите время";
  }

  return "Выберите дату";
}

function getDateLikeIcon(type: "date" | "datetime-local" | "time") {
  if (type === "datetime-local") {
    return CalendarClock;
  }

  if (type === "time") {
    return Clock3;
  }

  return CalendarDays;
}

function assignInputRef(
  target: React.Ref<HTMLInputElement> | undefined,
  value: HTMLInputElement | null
) {
  if (!target) {
    return;
  }

  if (typeof target === "function") {
    target(value);
    return;
  }

  (target as React.MutableRefObject<HTMLInputElement | null>).current = value;
}

export const AppInput = React.forwardRef<HTMLInputElement, AppInputProps>(
  ({ className, onChange, onWheel, placeholder, type, value, defaultValue, disabled, ...props }, ref) => {
    if (isDateLikeType(type)) {
      const Icon = getDateLikeIcon(type);
      const inputRef = React.useRef<HTMLInputElement | null>(null);
      const [isCoarsePointer, setIsCoarsePointer] = React.useState(false);
      const displayValue = typeof value === "string" ? value : typeof defaultValue === "string" ? defaultValue : "";
      // iOS native date picker "Сбросить" fires the `input` event instead of `change`.
      // React maps `onChange` → native `change`, so it misses the clear action.
      // Forwarding `onInput` → `onChange` catches it on all platforms.
      const onInput = onChange as unknown as React.FormEventHandler<HTMLInputElement> | undefined;
      const formattedValue = formatDateLikeValue(type, displayValue);

      React.useEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
          return;
        }

        const mediaQuery = window.matchMedia("(pointer: coarse)");
        const updatePointerMode = () => setIsCoarsePointer(mediaQuery.matches);
        updatePointerMode();

        if (typeof mediaQuery.addEventListener === "function") {
          mediaQuery.addEventListener("change", updatePointerMode);
          return () => mediaQuery.removeEventListener("change", updatePointerMode);
        }

        mediaQuery.addListener(updatePointerMode);
        return () => mediaQuery.removeListener(updatePointerMode);
      }, []);

      const openNativePicker = () => {
        const input = inputRef.current;
        if (!input || disabled || isCoarsePointer) {
          return;
        }

        if (typeof input.showPicker === "function") {
          input.showPicker();
          return;
        }

        input.focus();
        input.click();
      };

      return (
        <div className="relative min-w-0 max-w-full">
          <button
            type="button"
            disabled={disabled}
            onClick={openNativePicker}
            className={cn(
              "flex h-11 w-full min-w-0 max-w-full items-center overflow-hidden rounded-xl border border-input px-3 py-2 pr-11 text-base text-left text-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm",
              FIELD_BACKGROUND_CLASS,
              disabled && "cursor-not-allowed opacity-50",
              className
            )}
          >
            <span className={cn("truncate", formattedValue ? "text-foreground" : "text-muted-foreground")}>
              {formattedValue || getDateLikePlaceholder(type, placeholder)}
            </span>
          </button>
          <input
            ref={(node) => {
              inputRef.current = node;
              assignInputRef(ref, node);
            }}
            className={cn(
              "absolute inset-0 h-full w-full min-w-0 max-w-full opacity-0",
              isCoarsePointer ? "z-10 cursor-pointer" : "pointer-events-none"
            )}
            defaultValue={defaultValue}
            disabled={disabled}
            onChange={onChange}
            placeholder={placeholder}
            tabIndex={-1}
            type={type}
            value={value}
            {...props}
          />
          <Icon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      );
    }

    const handleWheel = (event: React.WheelEvent<HTMLInputElement>) => {
      onWheel?.(event);
      if (event.defaultPrevented || type !== "number") {
        return;
      }

      event.currentTarget.blur();
    };

    return (
      <input
        ref={ref}
        className={cn(
          "flex h-11 w-full min-w-0 max-w-full rounded-xl border border-input px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm",
          FIELD_BACKGROUND_CLASS,
          className
        )}
        defaultValue={defaultValue}
        disabled={disabled}
        onChange={onChange}
        onWheel={handleWheel}
        placeholder={placeholder}
        type={type}
        value={value}
        {...props}
      />
    );
  }
);

AppInput.displayName = "AppInput";
