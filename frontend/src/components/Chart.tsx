import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart, HeatmapChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  MarkLineComponent,
  AriaComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
echarts.use([
  BarChart,
  LineChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  MarkLineComponent,
  AriaComponent,
  CanvasRenderer,
]);
import type { EChartsOption } from "echarts";
import type { ECElementEvent } from "echarts/core";
export function Chart({
  option,
  height = 300,
  onClick,
  label,
}: {
  option: EChartsOption;
  height?: number;
  onClick?: (event: ECElementEvent) => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "canvas" });
    chart.setOption({
      ...option,
      aria: { enabled: true, description: label },
      textStyle: {
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 12,
        color: "#64777c",
      },
    });
    if (onClick) chart.on("click", onClick);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [option, onClick, label]);
  return (
    <div
      ref={ref}
      role="img"
      aria-label={label}
      style={{ height, width: "100%" }}
    />
  );
}
