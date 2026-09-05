import { useInfiniteQuery, type InfiniteData, type QueryKey, type UseInfiniteQueryResult } from "@tanstack/react-query";
import { useMemo } from "react";

type PageEnvelope<TItem> = {
  items: TItem[];
  page: number;
  page_size: number;
  total: number;
};

type UseInfinitePagedQueryOptions<TItem, TPage extends PageEnvelope<TItem>> = {
  enabled?: boolean;
  initialPageParam?: number;
  queryFn: (page: number) => Promise<TPage>;
  queryKey: QueryKey;
};

export type InfinitePagedQueryResult<TItem, TPage extends PageEnvelope<TItem>> = Omit<
  UseInfiniteQueryResult<InfiniteData<TPage, number>, Error>,
  "data"
> & {
  data?: InfiniteData<TPage, number>;
  items: TItem[];
  loadedCount: number;
  total: number;
};

export function useInfinitePagedQuery<TItem, TPage extends PageEnvelope<TItem>>({
  enabled = true,
  initialPageParam = 1,
  queryFn,
  queryKey
}: UseInfinitePagedQueryOptions<TItem, TPage>): InfinitePagedQueryResult<TItem, TPage> {
  const query = useInfiniteQuery<TPage, Error, InfiniteData<TPage, number>, QueryKey, number>({
    enabled,
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.reduce((sum, page) => sum + page.items.length, 0);
      if (lastPage.items.length < lastPage.page_size) {
        return undefined;
      }
      return loadedCount < lastPage.total ? allPages.length + initialPageParam : undefined;
    },
    initialPageParam,
    queryKey,
    queryFn: ({ pageParam }) => queryFn(Number(pageParam))
  });

  const data = query.data as InfiniteData<TPage, number> | undefined;
  const items = useMemo<TItem[]>(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);
  const total = data?.pages[0]?.total ?? 0;
  const loadedCount = items.length;

  return {
    ...query,
    items,
    loadedCount,
    total
  };
}
