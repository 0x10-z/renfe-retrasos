import * as echarts from "echarts";
import { state } from "./store";

export const CHART_COLORS = {
  delayed:  "#dc2626",
  onTime:   "#059669",
  text:     "#6b7280",
  subtext:  "#9ca3af",
  grid:     "#e2e7f2",
  tooltip:  "#111827",
  p50:      "#6366f1",
  p75:      "#f59e0b",
  p90:      "#ef4444",
};

export function getOrCreateChart(): echarts.ECharts {
  const el = document.getElementById("echart-main")!;
  if (!state.chart) {
    state.chart = echarts.init(el, undefined, { renderer: "canvas" });
    new ResizeObserver(() => state.chart?.resize()).observe(el);
  }
  return state.chart;
}

export function renderHistory() {
  if (state.historyRecords.length < 2) return;
  document.getElementById("history-section")!.style.display = "block";
  if (state.activeDays === -1) renderHourly(); else renderDaily();
}

export function linearRegression(data: number[]): number[] {
  const n = data.length;
  if (n < 2) return data;
  const sumX  = (n * (n - 1)) / 2;
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
  const sumY  = data.reduce((a, b) => a + b, 0);
  const sumXY = data.reduce((acc, y, i) => acc + i * y, 0);
  const m = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const b = (sumY - m * sumX) / n;
  return data.map((_, i) => Math.max(0, +(b + m * i).toFixed(2)));
}

export function renderDaily() {
  const byDate = new Map<string, { totalSum: number; delayedSum: number; maxMin: number; p50s: number[]; p75s: number[]; p90s: number[] }>();
  for (const r of state.historyRecords) {
    if (!byDate.has(r.date)) byDate.set(r.date, { totalSum: 0, delayedSum: 0, maxMin: 0, p50s: [], p75s: [], p90s: [] });
    const d = byDate.get(r.date)!;
    d.totalSum   += r.total   ?? 0;
    d.delayedSum += r.delayed ?? 0;
    d.maxMin = Math.max(d.maxMin, r.max_min ?? 0);
    if (r.p50 > 0) d.p50s.push(r.p50);
    if (r.p75 > 0) d.p75s.push(r.p75);
    if (r.p90 > 0) d.p90s.push(r.p90);
  }

  let dates = [...byDate.keys()].sort();
  if (state.activeDays > 0) dates = dates.slice(-state.activeDays);

  const avg = (arr: number[]) => arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : null;
  const delayedData = dates.map(date => {
    const d = byDate.get(date)!;
    const pct = d.totalSum > 0 ? +(d.delayedSum / d.totalSum * 100).toFixed(1) : 0;
    return { value: pct, meta: d };
  });
  const onTimeData = dates.map((_, i) => +(100 - delayedData[i].value).toFixed(1));
  const p50Data = dates.map(date => avg(byDate.get(date)!.p50s));
  const p75Data = dates.map(date => avg(byDate.get(date)!.p75s));
  const p90Data = dates.map(date => avg(byDate.get(date)!.p90s));

  getOrCreateChart().setOption({
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: CHART_COLORS.tooltip,
      borderColor: CHART_COLORS.tooltip,
      textStyle: { color: "#fff", fontSize: 12, fontFamily: "JetBrains Mono, monospace" },
      formatter: (params: any) => {
        const i = params[0].dataIndex;
        const d = byDate.get(dates[i])!;
        const pct = delayedData[i].value;
        const p50 = p50Data[i]; const p75 = p75Data[i]; const p90 = p90Data[i];
        const percLine = p50 != null ? `p50 ${p50}m · p75 ${p75}m · p90 ${p90}m<br/>` : "";
        return `<b>${dates[i]}</b><br/>${pct}% con retraso · max ${d.maxMin}min<br/>${percLine}${d.delayedSum.toLocaleString("es")} / ${d.totalSum.toLocaleString("es")} trenes`;
      },
    },
    legend: {
      data: ["Con retraso", "A tiempo", "Tendencia", "p50", "p75", "p90"],
      bottom: 0,
      textStyle: { color: CHART_COLORS.text, fontSize: 11 },
      icon: "roundRect",
      itemWidth: 10,
      itemHeight: 10,
    },
    grid: { left: 52, right: 48, top: 12, bottom: 48 },
    dataZoom: dates.length > 60
      ? [{ type: "inside", startValue: dates[dates.length - 60], endValue: dates[dates.length - 1] }]
      : [],
    xAxis: {
      type: "category",
      data: dates.map(d => d.slice(5)),
      axisLine: { lineStyle: { color: CHART_COLORS.grid } },
      axisTick: { show: false },
      axisLabel: { color: CHART_COLORS.subtext, fontSize: 10, rotate: dates.length > 30 ? 45 : 0 },
    },
    yAxis: [
      {
        type: "value",
        max: 100,
        axisLabel: { formatter: "{value}%", color: CHART_COLORS.subtext, fontSize: 10 },
        splitLine: { lineStyle: { color: CHART_COLORS.grid } },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      {
        type: "value",
        name: "min",
        nameTextStyle: { color: CHART_COLORS.subtext, fontSize: 10 },
        axisLabel: { formatter: "{value}m", color: CHART_COLORS.subtext, fontSize: 10 },
        splitLine: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
      },
    ],
    series: [
      {
        name: "Con retraso",
        type: "bar",
        stack: "total",
        barMaxWidth: 28,
        yAxisIndex: 0,
        data: delayedData.map(d => d.value),
        itemStyle: { color: CHART_COLORS.delayed, opacity: 0.85, borderRadius: [0, 0, 0, 0] },
        emphasis: { itemStyle: { opacity: 1 } },
      },
      {
        name: "A tiempo",
        type: "bar",
        stack: "total",
        barMaxWidth: 28,
        yAxisIndex: 0,
        data: onTimeData,
        itemStyle: { color: CHART_COLORS.onTime, opacity: 0.35, borderRadius: [3, 3, 0, 0] },
        emphasis: { itemStyle: { opacity: 0.55 } },
      },
      {
        name: "Tendencia",
        type: "line",
        yAxisIndex: 0,
        data: linearRegression(delayedData.map(d => d.value)),
        smooth: false,
        symbol: "none",
        lineStyle: { color: "#f59e0b", width: 2, type: "dashed" },
        itemStyle: { color: "#f59e0b" },
        z: 10,
      },
      {
        name: "p50",
        type: "line",
        yAxisIndex: 1,
        data: p50Data,
        smooth: true,
        symbol: "none",
        lineStyle: { color: CHART_COLORS.p50, width: 1.5 },
        itemStyle: { color: CHART_COLORS.p50 },
        connectNulls: false,
      },
      {
        name: "p75",
        type: "line",
        yAxisIndex: 1,
        data: p75Data,
        smooth: true,
        symbol: "none",
        lineStyle: { color: CHART_COLORS.p75, width: 1.5 },
        itemStyle: { color: CHART_COLORS.p75 },
        connectNulls: false,
      },
      {
        name: "p90",
        type: "line",
        yAxisIndex: 1,
        data: p90Data,
        smooth: true,
        symbol: "none",
        lineStyle: { color: CHART_COLORS.p90, width: 1.5 },
        itemStyle: { color: CHART_COLORS.p90 },
        connectNulls: false,
      },
    ],
  }, true);
}

export function renderHourly() {
  type HourBucket = { totalSum: number; delayedSum: number; samples: number; p50s: number[]; p75s: number[]; p90s: number[] };
  const byHour: HourBucket[] = Array.from({ length: 24 }, () =>
    ({ totalSum: 0, delayedSum: 0, samples: 0, p50s: [], p75s: [], p90s: [] })
  );
  for (const r of state.historyRecords) {
    const hour = parseInt(r.ts?.slice(11, 13) ?? "0", 10);
    if (isNaN(hour) || hour < 0 || hour > 23) continue;
    byHour[hour].totalSum   += r.total   ?? 0;
    byHour[hour].delayedSum += r.delayed ?? 0;
    byHour[hour].samples++;
    if (r.p50 > 0) byHour[hour].p50s.push(r.p50);
    if (r.p75 > 0) byHour[hour].p75s.push(r.p75);
    if (r.p90 > 0) byHour[hour].p90s.push(r.p90);
  }

  const avgArr = (arr: number[]) => arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : null;
  const maxSamples = Math.max(...byHour.map(h => h.samples), 1);
  const labels = byHour.map((_, i) => `${String(i).padStart(2, "0")}h`);
  const pctData = byHour.map(h =>
    h.totalSum > 0 ? +(h.delayedSum / h.totalSum * 100).toFixed(1) : 0
  );
  const opacityData = byHour.map(h =>
    h.samples === 0 ? 0.12 : 0.35 + 0.65 * (h.samples / maxSamples)
  );
  const p50Data = byHour.map(h => avgArr(h.p50s));
  const p75Data = byHour.map(h => avgArr(h.p75s));
  const p90Data = byHour.map(h => avgArr(h.p90s));

  getOrCreateChart().setOption({
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: CHART_COLORS.tooltip,
      borderColor: CHART_COLORS.tooltip,
      textStyle: { color: "#fff", fontSize: 12, fontFamily: "JetBrains Mono, monospace" },
      formatter: (params: any) => {
        const i   = params[0].dataIndex;
        const h   = byHour[i];
        const pct = pctData[i];
        if (h.samples === 0) return `<b>${labels[i]}</b><br/>Sin datos`;
        const p50 = p50Data[i]; const p75 = p75Data[i]; const p90 = p90Data[i];
        const percLine = p50 != null ? `p50 ${p50}m · p75 ${p75}m · p90 ${p90}m<br/>` : "";
        return `<b>${labels[i]}</b><br/>${pct}% con retraso<br/>${percLine}${h.delayedSum.toLocaleString("es")} / ${h.totalSum.toLocaleString("es")} trenes<br/>${h.samples} muestras`;
      },
    },
    grid: { left: 52, right: 48, top: 12, bottom: 32 },
    xAxis: {
      type: "category",
      data: labels,
      axisLine: { lineStyle: { color: CHART_COLORS.grid } },
      axisTick: { show: false },
      axisLabel: { color: CHART_COLORS.subtext, fontSize: 10 },
    },
    yAxis: [
      {
        type: "value",
        max: 100,
        axisLabel: { formatter: "{value}%", color: CHART_COLORS.subtext, fontSize: 10 },
        splitLine: { lineStyle: { color: CHART_COLORS.grid } },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      {
        type: "value",
        name: "min",
        nameTextStyle: { color: CHART_COLORS.subtext, fontSize: 10 },
        axisLabel: { formatter: "{value}m", color: CHART_COLORS.subtext, fontSize: 10 },
        splitLine: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
      },
    ],
    series: [
      {
        name: "% con retraso",
        type: "bar",
        yAxisIndex: 0,
        barMaxWidth: 32,
        data: pctData.map((v, i) => ({
          value: v,
          itemStyle: { color: CHART_COLORS.delayed, opacity: opacityData[i], borderRadius: [3, 3, 0, 0] },
        })),
        emphasis: { itemStyle: { opacity: 1 } },
      },
      {
        name: "p50",
        type: "line",
        yAxisIndex: 1,
        data: p50Data,
        smooth: true,
        symbol: "none",
        lineStyle: { color: CHART_COLORS.p50, width: 1.5 },
        itemStyle: { color: CHART_COLORS.p50 },
        connectNulls: false,
      },
      {
        name: "p75",
        type: "line",
        yAxisIndex: 1,
        data: p75Data,
        smooth: true,
        symbol: "none",
        lineStyle: { color: CHART_COLORS.p75, width: 1.5 },
        itemStyle: { color: CHART_COLORS.p75 },
        connectNulls: false,
      },
      {
        name: "p90",
        type: "line",
        yAxisIndex: 1,
        data: p90Data,
        smooth: true,
        symbol: "none",
        lineStyle: { color: CHART_COLORS.p90, width: 1.5 },
        itemStyle: { color: CHART_COLORS.p90 },
        connectNulls: false,
      },
    ],
  }, true);
}
