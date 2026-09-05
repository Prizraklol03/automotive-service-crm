import { useEffect, useRef } from "react";
import * as echarts from "echarts";

import { cn } from "@/shared/lib/cn";

type AnalyticsChartClickParams = {
  componentType?: string;
  data?: unknown;
  dataIndex?: number;
  name?: string;
  seriesName?: string;
  value?: unknown;
};

export function AnalyticsChart({
  className,
  height = 320,
  loading = false,
  onClick,
  option
}: {
  className?: string;
  height?: number;
  loading?: boolean;
  onClick?: (params: AnalyticsChartClickParams) => void;
  option: unknown;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }

    const instance = echarts.init(node, undefined, {
      renderer: "canvas"
    });
    chartRef.current = instance;

    let frame = 0;
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        chartRef.current?.resize({
          animation: {
            duration: 150
          }
        });
      });
    });

    resizeObserver.observe(node);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      instance.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) {
      return;
    }

    chartRef.current.setOption(option as echarts.EChartsOption, {
      lazyUpdate: true,
      notMerge: true
    });
  }, [option]);

  useEffect(() => {
    const instance = chartRef.current;
    if (!instance) {
      return;
    }

    if (loading) {
      instance.showLoading("default", {
        color: "#4FA8F2",
        maskColor: "rgba(10, 10, 10, 0.24)",
        text: "Загружаем график",
        textColor: "#DADAD6"
      });
      return;
    }

    instance.hideLoading();
  }, [loading]);

  useEffect(() => {
    const instance = chartRef.current;
    if (!instance || !onClick) {
      return;
    }

    const handleClick = (params: unknown) => {
      onClick(params as AnalyticsChartClickParams);
    };

    instance.on("click", handleClick);
    return () => {
      instance.off("click", handleClick);
    };
  }, [onClick]);

  return <div ref={containerRef} className={cn("w-full", className)} style={{ height }} />;
}
