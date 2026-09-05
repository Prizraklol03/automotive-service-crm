import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { ChevronDown, ChevronUp, FolderTree, GripHorizontal, Plus, Wrench } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import type { ServiceCatalogItem, ServiceCategory } from "@/entities/service/model/types";
import { useCan } from "@/features/auth/model/permissions";
import {
  useReorderServiceCategoriesMutation,
  useReorderServicesMutation,
  useServiceCategoriesQuery,
  useServicesListQuery
} from "@/features/services/api/services-hooks";
import { CategoryDetailPanel } from "@/features/services/ui/category-detail-panel";
import { ServiceDetailPanel } from "@/features/services/ui/service-detail-panel";
import { useMediaQuery } from "@/shared/hooks/use-media-query";
import { cn } from "@/shared/lib/cn";
import { formatCurrency, formatNumber } from "@/shared/lib/format";
import { AppButton } from "@/shared/ui/app-button";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingState } from "@/shared/ui/loading-state";
import { PageContainer } from "@/shared/ui/page-container";
import { PageHeader } from "@/shared/ui/page-header";
import { SearchInput } from "@/shared/ui/search-input";
import { StatCard } from "@/shared/ui/stat-card";
import { StatusBadge } from "@/shared/ui/status-badge";

type ActiveServiceDrag = {
  categoryId: number;
  currentClientY: number;
  currentOrderedIds: number[];
  initialOrderedIds: number[];
  pointerOffsetY: number;
  rowHeight: number;
  rowLeft: number;
  rowWidth: number;
  serviceId: number;
};

type ActiveCategoryDrag = {
  categoryId: number;
  currentClientY: number;
  currentOrderedIds: number[];
  initialOrderedIds: number[];
  pointerOffsetY: number;
  rowHeight: number;
  rowLeft: number;
  rowWidth: number;
};

function arraysEqual(left: number[], right: number[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function insertDraggedAt(ids: number[], draggedId: number, insertIndex: number) {
  const next = ids.filter((id) => id !== draggedId);
  next.splice(insertIndex, 0, draggedId);
  return next;
}

export function ServicesPage() {
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const canManageCatalog = useCan("settings.catalog.manage");
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [expandedCategories, setExpandedCategories] = useState<number[]>([]);
  const [categoryOrder, setCategoryOrder] = useState<number[]>([]);
  const [activeCategoryDrag, setActiveCategoryDrag] = useState<ActiveCategoryDrag | null>(null);
  const [serviceOrderByCategory, setServiceOrderByCategory] = useState<Record<number, number[]>>({});
  const [activeServiceDrag, setActiveServiceDrag] = useState<ActiveServiceDrag | null>(null);

  const categoryRefs = useRef(new Map<number, HTMLElement>());
  const activeCategoryDragRef = useRef<ActiveCategoryDrag | null>(null);
  const rowRefs = useRef(new Map<number, HTMLDivElement>());
  const activeServiceDragRef = useRef<ActiveServiceDrag | null>(null);
  const pointerClientYRef = useRef<number | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const justDraggedRef = useRef(false);
  const justDraggedTimeoutRef = useRef<number | null>(null);
  const layoutSnapshotRef = useRef<Map<number, number> | null>(null);

  const serviceKey = searchParams.get("service");
  const categoryKey = searchParams.get("category");
  const serviceCategoryPreset = searchParams.get("serviceCategory")
    ? Number(searchParams.get("serviceCategory"))
    : null;

  const servicesQuery = useServicesListQuery();
  const categoriesQuery = useServiceCategoriesQuery();
  const reorderCategoriesMutation = useReorderServiceCategoriesMutation();
  const reorderServicesMutation = useReorderServicesMutation();

  const categories = categoriesQuery.data ?? [];
  const services = servicesQuery.data ?? [];
  const searchQuery = search.trim().toLowerCase();
  const canReorderCategories = canManageCatalog && !searchQuery;
  const canReorderServices = canManageCatalog && !searchQuery;

  useEffect(() => {
    setCategoryOrder((current) => {
      const categoryIds = categories.map((category) => category.id);
      const keptIds = current.filter((categoryId) => categoryIds.includes(categoryId));
      const appendedIds = categoryIds.filter((categoryId) => !keptIds.includes(categoryId));
      return [...keptIds, ...appendedIds];
    });
  }, [categories]);

  useEffect(() => {
    setServiceOrderByCategory((current) => {
      const next: Record<number, number[]> = {};

      categories.forEach((category) => {
        const serviceIds = services
          .filter((service) => service.category_id === category.id)
          .map((service) => service.id);
        const currentIds = current[category.id] ?? [];
        const keptIds = currentIds.filter((serviceId) => serviceIds.includes(serviceId));
        const appendedIds = serviceIds.filter((serviceId) => !keptIds.includes(serviceId));
        next[category.id] = [...keptIds, ...appendedIds];
      });

      return next;
    });
  }, [categories, services]);

  useEffect(() => {
    return () => {
      if (autoScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(autoScrollFrameRef.current);
      }
      if (justDraggedTimeoutRef.current !== null) {
        window.clearTimeout(justDraggedTimeoutRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    const snapshot = layoutSnapshotRef.current;
    if (!snapshot) {
      return;
    }

    snapshot.forEach((previousTop, serviceId) => {
      const element = rowRefs.current.get(serviceId);
      if (!element) {
        return;
      }

      const nextTop = element.getBoundingClientRect().top;
      const diff = previousTop - nextTop;
      if (Math.abs(diff) < 1) {
        return;
      }

      element.animate(
        [
          { transform: `translateY(${diff}px)` },
          { transform: "translateY(0)" }
        ],
        {
          duration: 180,
          easing: "ease-out"
        }
      );
    });

    layoutSnapshotRef.current = null;
  }, [serviceOrderByCategory]);

  const filteredServices = useMemo(() => {
    if (!searchQuery) {
      return services;
    }

    return services.filter((service) => service.name.toLowerCase().includes(searchQuery));
  }, [searchQuery, services]);

  const orderedCategories = useMemo(() => {
    const categoriesById = new Map(categories.map((category) => [category.id, category]));
    const orderedIds = categoryOrder.length ? categoryOrder : categories.map((category) => category.id);
    return orderedIds.map((categoryId) => categoriesById.get(categoryId)).filter((category): category is ServiceCategory => Boolean(category));
  }, [categories, categoryOrder]);

  const groupedCategories = useMemo(() => {
    const servicesById = new Map(filteredServices.map((service) => [service.id, service]));

    return orderedCategories.map((category) => {
      const fallbackIds = filteredServices
        .filter((service) => service.category_id === category.id)
        .map((service) => service.id);
      const orderedIds = serviceOrderByCategory[category.id]?.length
        ? serviceOrderByCategory[category.id]
        : fallbackIds;

      return {
        category,
        services: (orderedIds ?? [])
          .map((serviceId) => servicesById.get(serviceId))
          .filter((service): service is ServiceCatalogItem => Boolean(service))
      };
    });
  }, [filteredServices, orderedCategories, serviceOrderByCategory]);

  const activeDraggedService = useMemo(
    () => (activeServiceDrag ? services.find((service) => service.id === activeServiceDrag.serviceId) ?? null : null),
    [activeServiceDrag, services]
  );
  const activeDraggedCategory = useMemo(
    () => (activeCategoryDrag ? categories.find((category) => category.id === activeCategoryDrag.categoryId) ?? null : null),
    [activeCategoryDrag, categories]
  );

  const updateParams = (updates: Record<string, string | null | undefined>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (!value) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    });
    setSearchParams(next, { replace: true });
  };

  const toggleCategory = (categoryId: number) => {
    setExpandedCategories((current) =>
      current.includes(categoryId) ? current.filter((item) => item !== categoryId) : [...current, categoryId]
    );
  };

  const openService = (serviceId: number) => {
    if (justDraggedRef.current) {
      return;
    }
    updateParams({ service: String(serviceId), category: null, serviceCategory: null });
  };

  const openCreateService = (categoryId: number) => {
    updateParams({ service: "new", category: null, serviceCategory: String(categoryId) });
  };

  const openCategory = (categoryId: number) => {
    if (justDraggedRef.current) {
      return;
    }
    updateParams({ category: String(categoryId), service: null, serviceCategory: null });
  };

  const closePanels = () => {
    updateParams({ service: null, category: null, serviceCategory: null });
  };

  const snapshotRowPositions = (categoryId: number) => {
    const orderedIds = serviceOrderByCategory[categoryId] ?? [];
    const snapshot = new Map<number, number>();

    orderedIds.forEach((serviceId) => {
      const element = rowRefs.current.get(serviceId);
      if (!element) {
        return;
      }
      snapshot.set(serviceId, element.getBoundingClientRect().top);
    });

    layoutSnapshotRef.current = snapshot;
  };

  const syncDragPosition = (clientY: number) => {
    const drag = activeServiceDragRef.current;
    if (!drag) {
      return;
    }

    const otherRows = drag.currentOrderedIds.filter((serviceId) => serviceId !== drag.serviceId);
    const draggedCenter = window.scrollY + clientY - drag.pointerOffsetY + drag.rowHeight / 2;
    const insertIndex = otherRows.filter((serviceId) => {
      const element = rowRefs.current.get(serviceId);
      if (!element) {
        return false;
      }

      const rect = element.getBoundingClientRect();
      const midpoint = rect.top + window.scrollY + rect.height / 2;
      return draggedCenter > midpoint;
    }).length;

    const nextOrderedIds = insertDraggedAt(drag.currentOrderedIds, drag.serviceId, insertIndex);

    if (!arraysEqual(nextOrderedIds, drag.currentOrderedIds)) {
      snapshotRowPositions(drag.categoryId);
      setServiceOrderByCategory((current) => ({
        ...current,
        [drag.categoryId]: nextOrderedIds
      }));

      const nextDrag = {
        ...drag,
        currentClientY: clientY,
        currentOrderedIds: nextOrderedIds
      };
      activeServiceDragRef.current = nextDrag;
      setActiveServiceDrag(nextDrag);
      return;
    }

    const nextDrag = {
      ...drag,
      currentClientY: clientY
    };
    activeServiceDragRef.current = nextDrag;
    setActiveServiceDrag(nextDrag);
  };

  const stopAutoScroll = () => {
    if (autoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
  };

  const startAutoScroll = () => {
    stopAutoScroll();

    const step = () => {
      const clientY = pointerClientYRef.current;
      if (clientY === null || !activeServiceDragRef.current) {
        autoScrollFrameRef.current = null;
        return;
      }

      const threshold = 96;
      let scrollDelta = 0;

      if (clientY < threshold) {
        scrollDelta = -Math.max(8, Math.ceil((threshold - clientY) / 4));
      } else if (clientY > window.innerHeight - threshold) {
        scrollDelta = Math.max(8, Math.ceil((clientY - (window.innerHeight - threshold)) / 4));
      }

      if (scrollDelta !== 0) {
        window.scrollBy({ top: scrollDelta });
        syncDragPosition(clientY);
      }

      autoScrollFrameRef.current = window.requestAnimationFrame(step);
    };

    autoScrollFrameRef.current = window.requestAnimationFrame(step);
  };

  const clearDragGuard = () => {
    if (justDraggedTimeoutRef.current !== null) {
      window.clearTimeout(justDraggedTimeoutRef.current);
    }

    justDraggedTimeoutRef.current = window.setTimeout(() => {
      justDraggedRef.current = false;
      justDraggedTimeoutRef.current = null;
    }, 120);
  };

  const syncCategoryDragPosition = (clientY: number) => {
    const drag = activeCategoryDragRef.current;
    if (!drag) {
      return;
    }

    const otherCategories = drag.currentOrderedIds.filter((categoryId) => categoryId !== drag.categoryId);
    const insertIndex = otherCategories.filter((categoryId) => {
      const element = categoryRefs.current.get(categoryId);
      if (!element) {
        return false;
      }

      const rect = element.getBoundingClientRect();
      return clientY > rect.top + rect.height / 2;
    }).length;

    const nextOrderedIds = insertDraggedAt(drag.currentOrderedIds, drag.categoryId, insertIndex);
    if (arraysEqual(nextOrderedIds, drag.currentOrderedIds)) {
      const nextDrag = {
        ...drag,
        currentClientY: clientY
      };
      activeCategoryDragRef.current = nextDrag;
      setActiveCategoryDrag(nextDrag);
      return;
    }

    const nextDrag = {
      ...drag,
      currentClientY: clientY,
      currentOrderedIds: nextOrderedIds
    };
    activeCategoryDragRef.current = nextDrag;
    setActiveCategoryDrag(nextDrag);
    setCategoryOrder(nextOrderedIds);
  };

  const finishCategoryDrag = async () => {
    const drag = activeCategoryDragRef.current;
    activeCategoryDragRef.current = null;
    setActiveCategoryDrag(null);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";

    if (!drag) {
      return;
    }

    justDraggedRef.current = true;
    clearDragGuard();

    if (arraysEqual(drag.currentOrderedIds, drag.initialOrderedIds)) {
      return;
    }

    try {
      await reorderCategoriesMutation.mutateAsync({
        items: drag.currentOrderedIds.map((categoryId, index) => ({
          id: categoryId,
          sort_order: index + 1
        }))
      });
    } catch {
      setCategoryOrder(drag.initialOrderedIds);
      void categoriesQuery.refetch();
    }
  };

  useEffect(() => {
    if (!activeCategoryDrag) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      event.preventDefault();
      pointerClientYRef.current = event.clientY;
      syncCategoryDragPosition(event.clientY);
    };

    const handlePointerUp = () => {
      void finishCategoryDrag();
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [activeCategoryDrag]);

  const beginCategoryDrag = (event: ReactPointerEvent<HTMLButtonElement>, categoryId: number, orderedIds: number[]) => {
    if (!canReorderCategories || reorderCategoriesMutation.isPending || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const element = categoryRefs.current.get(categoryId);
    if (!element) {
      return;
    }

    const rect = element.getBoundingClientRect();

    const nextDrag: ActiveCategoryDrag = {
      categoryId,
      currentClientY: event.clientY,
      currentOrderedIds: orderedIds,
      initialOrderedIds: orderedIds,
      pointerOffsetY: event.clientY - rect.top,
      rowHeight: rect.height,
      rowLeft: rect.left,
      rowWidth: rect.width
    };
    pointerClientYRef.current = event.clientY;
    activeCategoryDragRef.current = nextDrag;
    setActiveCategoryDrag(nextDrag);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
  };

  const finishServiceDrag = async () => {
    stopAutoScroll();
    const drag = activeServiceDragRef.current;
    activeServiceDragRef.current = null;
    pointerClientYRef.current = null;
    setActiveServiceDrag(null);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";

    if (!drag) {
      return;
    }

    justDraggedRef.current = true;
    clearDragGuard();

    if (arraysEqual(drag.currentOrderedIds, drag.initialOrderedIds)) {
      return;
    }

    try {
      await reorderServicesMutation.mutateAsync({
        category_id: drag.categoryId,
        items: drag.currentOrderedIds.map((serviceId, index) => ({
          id: serviceId,
          sort_order: index + 1
        }))
      });
    } catch {
      setServiceOrderByCategory((current) => ({
        ...current,
        [drag.categoryId]: drag.initialOrderedIds
      }));
      void servicesQuery.refetch();
    }
  };

  useEffect(() => {
    if (!activeServiceDrag) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      event.preventDefault();
      pointerClientYRef.current = event.clientY;
      syncDragPosition(event.clientY);
    };

    const handlePointerUp = () => {
      void finishServiceDrag();
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    startAutoScroll();

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      stopAutoScroll();
    };
  }, [activeServiceDrag]);

  const beginServiceDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    categoryId: number,
    serviceId: number,
    orderedIds: number[]
  ) => {
    if (!canReorderServices || reorderServicesMutation.isPending || event.button !== 0) {
      return;
    }

    const rowElement = rowRefs.current.get(serviceId);
    if (!rowElement) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const rect = rowElement.getBoundingClientRect();
    const nextDrag: ActiveServiceDrag = {
      categoryId,
      currentClientY: event.clientY,
      currentOrderedIds: orderedIds,
      initialOrderedIds: orderedIds,
      pointerOffsetY: event.clientY - rect.top,
      rowHeight: rect.height,
      rowLeft: rect.left,
      rowWidth: rect.width,
      serviceId
    };

    pointerClientYRef.current = event.clientY;
    activeServiceDragRef.current = nextDrag;
    setActiveServiceDrag(nextDrag);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
  };

  return (
    <PageContainer>
      <PageHeader
        title="Услуги"
        description="Каталог услуг по категориям."
        actions={
          <>
            {canManageCatalog ? (
              <AppButton
                onClick={() => updateParams({ category: "new", service: null, serviceCategory: null })}
              >
                Новая категория
              </AppButton>
            ) : null}
          </>
        }
      />

      <div className="hidden gap-4 md:grid-cols-2 lg:grid">
        <StatCard
          label="Услуги"
          value={formatNumber(filteredServices.length)}
          hint="В текущей выборке"
          trend={<Wrench className="h-4 w-4" />}
        />
        <StatCard
          label="Категории"
          value={formatNumber(categories.length)}
          hint="В каталоге"
          trend={<FolderTree className="h-4 w-4" />}
        />
      </div>

      <section className="glass-panel rounded-2xl p-4 sm:p-5">
        <SearchInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Поиск по названию услуги"
        />
      </section>

      <section className="space-y-4">
        {servicesQuery.isLoading || categoriesQuery.isLoading ? (
          <LoadingState title="Загружаем каталог" description="Получаем услуги и категории." />
        ) : null}

        {servicesQuery.isError || categoriesQuery.isError ? (
          <ErrorState
            title="Не удалось загрузить каталог"
            description="Проверьте подключение и попробуйте снова."
            actionLabel="Повторить"
            onAction={() => void Promise.all([servicesQuery.refetch(), categoriesQuery.refetch()])}
          />
        ) : null}

        {!servicesQuery.isLoading &&
        !servicesQuery.isError &&
        !categoriesQuery.isLoading &&
        !categoriesQuery.isError ? (
          groupedCategories.length ? (
            groupedCategories.map(({ category, services: categoryServices }) => {
              const expanded = expandedCategories.includes(category.id);
              const categoryOrderedIds = categoryOrder.length ? categoryOrder : groupedCategories.map((item) => item.category.id);
              const orderedIds = serviceOrderByCategory[category.id]?.length
                ? serviceOrderByCategory[category.id]
                : categoryServices.map((service) => service.id);
              const isCategoryDragged = activeCategoryDrag?.categoryId === category.id;

              return (
                <section
                  key={category.id}
                  ref={(element) => {
                    if (element) {
                      categoryRefs.current.set(category.id, element);
                    } else {
                      categoryRefs.current.delete(category.id);
                    }
                  }}
                  className="glass-panel overflow-hidden rounded-2xl"
                >
                  {isCategoryDragged && activeCategoryDrag ? (
                    <div
                      className="m-4 rounded-2xl border border-dashed border-accent/45 bg-accent-muted/35"
                      style={{ height: Math.max(activeCategoryDrag.rowHeight - 32, 92) }}
                    >
                      <div className="flex h-full items-center justify-center px-4 text-xs font-medium tracking-[0.08em] text-foreground/80">
                        Отпустите, чтобы зафиксировать позицию категории
                      </div>
                    </div>
                  ) : null}
                  <div className={cn(
                    "group flex flex-col gap-3 border-b border-border px-4 py-4 transition-[background-color,box-shadow] duration-200 hover:bg-surface-2/20 sm:flex-row sm:items-center sm:justify-between",
                    isCategoryDragged && "hidden",
                  )}>
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      {canReorderCategories ? (
                        <button
                          type="button"
                          className="flex h-10 w-10 shrink-0 touch-none items-center justify-center rounded-2xl border border-border/70 bg-surface-2 text-muted-foreground transition-all duration-200 group-hover:border-accent/30 group-hover:bg-accent-muted/40 group-hover:text-foreground"
                          aria-label={`Переместить категорию ${category.name}`}
                          title="Перетащите, чтобы изменить порядок категорий"
                          onPointerDown={(event) => beginCategoryDrag(event, category.id, categoryOrderedIds)}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <GripHorizontal className="h-5 w-5" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => toggleCategory(category.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface-2 text-muted-foreground">
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className="h-3 w-3 rounded-full border border-white/15"
                              style={{ backgroundColor: category.color }}
                            />
                            <h2 className="text-base font-semibold">{category.name}</h2>
                          <StatusBadge
                            label={category.is_active ? "Активно" : "Неактивно"}
                            tone={category.is_active ? "success" : "muted"}
                          />
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {formatNumber(categoryServices.length)} услуг
                        </p>
                      </div>
                      </button>
                    </div>

                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
                      {canManageCatalog ? (
                        <>
                          <AppButton
                            className="w-full sm:w-auto"
                            size="sm"
                            variant="outline"
                            onClick={() => openCategory(category.id)}
                          >
                            Изменить категорию
                          </AppButton>
                          <AppButton
                            className="w-full sm:w-auto"
                            size="sm"
                            onClick={() => openCreateService(category.id)}
                          >
                            <Plus className="h-4 w-4" />
                            Добавить услугу
                          </AppButton>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {expanded ? (
                    <div className="divide-y divide-border">
                      {categoryServices.length ? (
                        categoryServices.map((service) => {
                          const isDragged =
                            activeServiceDrag?.categoryId === category.id &&
                            activeServiceDrag.serviceId === service.id;

                          if (isDragged && activeServiceDrag) {
                            return (
                              <div
                                key={service.id}
                                className="px-3 py-3 sm:px-4"
                              >
                                <div
                                  className="rounded-2xl border border-dashed border-accent/45 bg-accent-muted/35"
                                  style={{ height: Math.max(activeServiceDrag.rowHeight - 24, 68) }}
                                >
                                  <div className="flex h-full items-center justify-center px-4 text-xs font-medium tracking-[0.08em] text-foreground/80">
                                    Отпустите, чтобы зафиксировать позицию услуги
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={service.id}
                              ref={(element) => {
                                if (element) {
                                  rowRefs.current.set(service.id, element);
                                } else {
                                  rowRefs.current.delete(service.id);
                                }
                              }}
                              className="relative"
                            >
                              <div className="flex items-stretch gap-2 px-3 py-3 sm:px-4">
                                {canReorderServices ? (
                                  <button
                                    type="button"
                                    className="flex w-10 shrink-0 touch-none items-center justify-center rounded-2xl border border-border/70 bg-surface-2 text-muted-foreground transition-all duration-200 hover:border-accent/30 hover:bg-accent-muted/40 hover:text-foreground"
                                    aria-label={`Переместить услугу ${service.name}`}
                                    title="Перетащите, чтобы изменить порядок"
                                    onPointerDown={(event) =>
                                      beginServiceDrag(event, category.id, service.id, orderedIds ?? [])
                                    }
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    <GripHorizontal className="h-5 w-5" />
                                  </button>
                                ) : (
                                  <div className="w-10 shrink-0" />
                                )}

                                <button
                                  type="button"
                                  onClick={() => openService(service.id)}
                                  className="grid min-w-0 flex-1 gap-3 rounded-2xl px-2 py-1 text-left transition-colors hover:bg-surface-2/50 md:grid-cols-[1fr_180px_140px]"
                                >
                                  <div className="min-w-0">
                                    <div className="font-medium">{service.name}</div>
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {formatCurrency(service.default_price)}
                                  </div>
                                  <div className="flex items-start md:justify-end">
                                    <StatusBadge
                                      label={service.is_active ? "Активно" : "Неактивно"}
                                      tone={service.is_active ? "success" : "muted"}
                                    />
                                  </div>
                                </button>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="px-4 py-6 text-sm text-muted-foreground">
                          {searchQuery
                            ? "По текущему поиску в этой категории ничего не найдено."
                            : "В этой категории пока нет услуг."}
                        </div>
                      )}
                    </div>
                  ) : null}
                </section>
              );
            })
          ) : (
            <EmptyState
              title="Каталог пуст"
              description="Добавьте первую категорию и услуги."
              action={
                canManageCatalog ? (
                  <AppButton onClick={() => updateParams({ category: "new" })}>
                    Создать категорию
                  </AppButton>
                ) : undefined
              }
            />
          )
        ) : null}
      </section>

      {activeCategoryDrag && activeDraggedCategory ? (
        <div
          className="pointer-events-none fixed z-[80]"
          style={{
            left: activeCategoryDrag.rowLeft,
            top: activeCategoryDrag.currentClientY - activeCategoryDrag.pointerOffsetY,
            width: activeCategoryDrag.rowWidth
          }}
        >
          <div className="overflow-hidden rounded-2xl border border-accent/35 bg-background/96 shadow-panel ring-1 ring-border/60 backdrop-blur-md">
            <div className="border-b border-border/60 bg-accent-muted/35 px-3 py-2 text-[11px] font-medium tracking-[0.12em] text-foreground/80">
              Перемещение категории
            </div>
            <div className="flex items-center gap-3 px-4 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-surface-2 text-muted-foreground">
                <GripHorizontal className="h-5 w-5" />
              </div>
              <span
                className="h-3 w-3 shrink-0 rounded-full border border-white/15"
                style={{ backgroundColor: activeDraggedCategory.color }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-foreground">{activeDraggedCategory.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {formatNumber(
                    services.filter((service) => service.category_id === activeDraggedCategory.id).length
                  )}{" "}
                  услуг
                </div>
              </div>
              <StatusBadge
                label={activeDraggedCategory.is_active ? "Активно" : "Неактивно"}
                tone={activeDraggedCategory.is_active ? "success" : "muted"}
              />
            </div>
          </div>
        </div>
      ) : null}

      {activeServiceDrag && activeDraggedService ? (
        <div
          className="pointer-events-none fixed z-[80]"
          style={{
            left: activeServiceDrag.rowLeft,
            top: activeServiceDrag.currentClientY - activeServiceDrag.pointerOffsetY,
            width: activeServiceDrag.rowWidth
          }}
        >
          <div className="overflow-hidden rounded-2xl border border-accent/35 bg-background/96 shadow-panel ring-1 ring-border/60 backdrop-blur-md">
            <div className="border-b border-border/60 bg-accent-muted/35 px-3 py-2 text-[11px] font-medium tracking-[0.12em] text-foreground/80">
              Перемещение услуги
            </div>
            <div className="flex items-stretch gap-2 px-3 py-3 sm:px-4">
              <div className="flex w-10 shrink-0 items-center justify-center rounded-2xl text-muted-foreground">
                <GripHorizontal className="h-5 w-5" />
              </div>
              <div className="grid min-w-0 flex-1 gap-3 rounded-2xl px-2 py-1 text-left md:grid-cols-[1fr_180px_140px]">
                <div className="min-w-0">
                  <div className="font-medium">{activeDraggedService.name}</div>
                </div>
                <div className="text-sm text-muted-foreground">
                  {formatCurrency(activeDraggedService.default_price)}
                </div>
                <div className="flex items-start md:justify-end">
                  <StatusBadge
                    label={activeDraggedService.is_active ? "Активно" : "Неактивно"}
                    tone={activeDraggedService.is_active ? "success" : "muted"}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {serviceKey ? (
        <ServiceDetailPanel
          categoryPresetId={serviceCategoryPreset}
          desktopMode="overlay"
          isMobile={isMobile}
          onClose={closePanels}
          onCreated={(id) => updateParams({ service: String(id), serviceCategory: null })}
          serviceKey={serviceKey}
        />
      ) : null}

      {!serviceKey && categoryKey ? (
        <CategoryDetailPanel
          categoryKey={categoryKey}
          desktopMode="overlay"
          isMobile={isMobile}
          onClose={closePanels}
          onCreated={(id) => updateParams({ category: String(id) })}
        />
      ) : null}
    </PageContainer>
  );
}
