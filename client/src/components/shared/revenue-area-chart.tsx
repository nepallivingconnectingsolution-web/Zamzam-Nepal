import { useMemo } from "react";
import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import { npr } from "@/lib/utils";

export interface RevenueSeries {
  /** Legend / tooltip label, e.g. "Bus", "Hotel", "Net profit". */
  name: string;
  /** Hex color for the line, fill gradient, and legend dot. */
  color: string;
  /** One value per category (same length/order as `categories`). */
  data: number[];
}

interface RevenueAreaChartProps {
  /** X-axis labels, e.g. ["Jun 14", "Jun 15", ...]. */
  categories: string[];
  series: RevenueSeries[];
  height?: number;
  /** Defaults to NPR currency formatting via `npr()`. */
  valueFormatter?: (value: number) => string;
}

/**
 * Shared ApexCharts area chart for every revenue/earnings surface in the app
 * (bus, hotel, restaurant, grocery, driver earnings, super-admin combined
 * revenue). Centralising this in one place means every vertical gets the
 * same premium look automatically, and a future style tweak (colors,
 * gradients, tooltip shape) only has to happen once.
 *
 * Reads the app's existing CSS custom properties (--border, --muted-fg,
 * --card) so it inherits the current theme (including light/dark toggling)
 * without any extra plumbing — same technique the old recharts-based pages
 * already used.
 */
export function RevenueAreaChart({
  categories,
  series,
  height = 280,
  valueFormatter = (v) => npr(v),
}: RevenueAreaChartProps) {
  const options: ApexOptions = useMemo(
    () => ({
      chart: {
        type: "area",
        toolbar: { show: false },
        zoom: { enabled: false },
        fontFamily: "inherit",
        background: "transparent",
        animations: { easing: "easeinout", speed: 400 },
        sparkline: { enabled: false },
      },
      theme: { mode: "dark" },
      colors: series.map((s) => s.color),
      dataLabels: { enabled: false },
      stroke: { curve: "smooth", width: 2.5 },
      fill: {
        type: "gradient",
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.38,
          opacityTo: 0,
          stops: [0, 90, 100],
        },
      },
      grid: {
        borderColor: "hsl(var(--border))",
        strokeDashArray: 3,
        xaxis: { lines: { show: false } },
        padding: { left: 8, right: 8 },
      },
      legend: {
        show: series.length > 1,
        position: "top",
        horizontalAlign: "left",
        labels: { colors: "hsl(var(--muted-fg))" },
        markers: { size: 5 },
        itemMargin: { horizontal: 10 },
      },
      xaxis: {
        categories,
        labels: {
          style: { colors: "hsl(var(--muted-fg))", fontSize: "11px" },
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
        tickAmount: Math.min(6, categories.length - 1 > 0 ? categories.length - 1 : 1),
      },
      yaxis: {
        labels: {
          style: { colors: "hsl(var(--muted-fg))", fontSize: "12px" },
          formatter: (value: number) => valueFormatter(value),
        },
      },
      tooltip: {
        theme: "dark",
        y: { formatter: (value: number) => valueFormatter(value) },
      },
      markers: { size: 0, hover: { size: 5 } },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categories.join("|"), series.map((s) => s.name + s.color).join("|"), valueFormatter],
  );

  const chartSeries = useMemo(
    () => series.map((s) => ({ name: s.name, data: s.data })),
    [series],
  );

  return <Chart options={options} series={chartSeries} type="area" height={height} />;
}