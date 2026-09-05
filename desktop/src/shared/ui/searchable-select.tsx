import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

import { cn } from "@/shared/lib/cn";

export type SearchableOption = {
  keywords?: string[];
  label: string;
  value: string;
};

type SearchableSelectProps = {
  actionKeywords?: string[];
  actionLabel?: string;
  disabled?: boolean;
  emptyLabel?: string;
  error?: boolean;
  errorLabel?: string;
  loading?: boolean;
  onAction?: () => void;
  onOpen?: () => void;
  onRetry?: () => void;
  onValueChange: (value: string | null) => void;
  options: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  value: string | null;
};

type MenuItem =
  | { kind: "action"; keywords: string[]; label: string }
  | { kind: "option"; option: SearchableOption };

const FIELD_BACKGROUND_CLASS = "bg-[var(--field-background)]";

export function SearchableSelect({
  actionKeywords = [],
  actionLabel,
  disabled,
  emptyLabel = "Ничего не найдено",
  error = false,
  errorLabel = "Не удалось загрузить, повторить",
  loading = false,
  onAction,
  onOpen,
  onRetry,
  onValueChange,
  options,
  placeholder = "Выберите значение",
  searchPlaceholder = "Поиск...",
  value
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const suppressNextFocusRef = useRef(false);

  const selectedOption = options.find((option) => option.value === value) ?? null;
  const normalizedSearch = search.trim().toLowerCase();

  const filteredOptions = useMemo(() => {
    if (!normalizedSearch) {
      return options;
    }

    return options.filter((option) => {
      const haystack = [option.label, ...(option.keywords ?? [])].join(" ").toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [normalizedSearch, options]);

  const items = useMemo<MenuItem[]>(() => {
    const nextItems: MenuItem[] = [];
    if (actionLabel && onAction) {
      nextItems.push({ kind: "action", keywords: actionKeywords, label: actionLabel });
    }
    nextItems.push(...filteredOptions.map((option) => ({ kind: "option" as const, option })));
    return nextItems;
  }, [actionKeywords, actionLabel, filteredOptions, onAction]);

  useEffect(() => {
    if (!isOpen) {
      setSearch("");
      setActiveIndex(0);
      return;
    }

    const timeoutId = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!items.length) {
      setActiveIndex(0);
      return;
    }

    setActiveIndex((current) => Math.min(current, items.length - 1));
  }, [items]);

  const displayValue = isOpen ? search : selectedOption?.label ?? "";

  const openMenu = () => {
    setIsOpen((current) => {
      if (!current) {
        onOpen?.();
      }
      return true;
    });
  };

  const handleSelect = (nextValue: string | null) => {
    suppressNextFocusRef.current = true;
    onValueChange(nextValue);
    setSearch("");
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleAction = () => {
    suppressNextFocusRef.current = true;
    setSearch("");
    setIsOpen(false);
    inputRef.current?.blur();
    onAction?.();
  };

  return (
    <div ref={containerRef} className="relative">
      <div
        className={cn(
          "flex h-11 w-full items-center rounded-xl border border-input px-3 transition focus-within:ring-2 focus-within:ring-ring",
          FIELD_BACKGROUND_CLASS,
          disabled && "cursor-not-allowed opacity-50",
          isOpen && "ring-2 ring-ring"
        )}
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          disabled={disabled}
          value={displayValue}
          onFocus={() => {
            if (suppressNextFocusRef.current) {
              suppressNextFocusRef.current = false;
              return;
            }
            openMenu();
            setSearch("");
          }}
          onChange={(event) => {
            setSearch(event.target.value);
            openMenu();
          }}
          onKeyDown={(event) => {
            if (!items.length) {
              return;
            }

            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((current) => (current + 1) % items.length);
            }

            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((current) => (current - 1 + items.length) % items.length);
            }

            if (event.key === "Enter") {
              event.preventDefault();
              const item = items[activeIndex];
              if (!item) {
                return;
              }

              if (item.kind === "action") {
                handleAction();
                return;
              }

              handleSelect(item.option.value);
            }
          }}
          placeholder={isOpen ? searchPlaceholder : selectedOption ? "" : placeholder}
          className="h-full w-full bg-transparent px-3 text-base text-foreground outline-none placeholder:text-muted-foreground sm:text-sm"
        />
        {value ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setSearch("");
              handleSelect(null);
            }}
            className="cursor-pointer rounded-md p-1 text-muted-foreground transition hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed"
            aria-label="Очистить значение"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
        <button
          type="button"
          disabled={disabled}
          onClick={() => (isOpen ? setIsOpen(false) : openMenu())}
          className="cursor-pointer rounded-md p-1 text-muted-foreground transition hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed"
          aria-label="Открыть список"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      {isOpen ? (
        <div className="absolute z-[70] mt-2 w-full rounded-2xl border border-border bg-background p-2 shadow-panel">
          <div className="app-scrollbar max-h-64 overflow-y-auto">
            {error ? (
              <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-3 text-sm text-danger">
                <span>{errorLabel}</span>
                {onRetry ? (
                  <button
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onRetry();
                    }}
                    className="shrink-0 cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    Повторить
                  </button>
                ) : null}
              </div>
            ) : loading ? (
              <div className="rounded-xl px-3 py-3 text-sm text-muted-foreground">Загружаем...</div>
            ) : items.length ? (
              items.map((item, index) => {
                if (item.kind === "action") {
                  const isActive = index === activeIndex;
                  return (
                    <button
                      key="action"
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        handleAction();
                      }}
                      className={cn(
                        "mb-1 flex w-full cursor-pointer items-center justify-between rounded-xl border border-dashed border-border px-3 py-2 text-left text-sm text-foreground transition hover:bg-surface-2",
                        isActive && "bg-accent-muted"
                      )}
                    >
                      <span className="truncate">{item.label}</span>
                      <span className="text-xs text-muted-foreground">Ввод</span>
                    </button>
                  );
                }

                const isSelected = item.option.value === value;
                const isActive = index === activeIndex;
                return (
                  <button
                    key={item.option.value}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      handleSelect(item.option.value);
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition hover:bg-surface-2",
                      isSelected && "bg-accent-muted",
                      isActive && "bg-surface-2"
                    )}
                  >
                    <span className="truncate">{item.option.label}</span>
                    {isSelected ? <Check className="h-4 w-4 text-foreground" /> : null}
                  </button>
                );
              })
            ) : (
              <div className="rounded-xl px-3 py-3 text-sm text-muted-foreground">{emptyLabel}</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
