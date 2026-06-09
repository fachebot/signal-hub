/**
 * RSI 偏差诊断脚本
 *
 * 从币安拉取 K 线，用多种方式计算 RSI 并列出最后 N 根的结果，
 * 方便你对照网页端 RSI 值，找到偏差来源。
 *
 * 运行:
 *   npx tsx scripts/rsi_debug.ts
 *
 * 对比维度:
 *   1. 是否过滤未收完 K 线 (filterClosedKlines)
 *   2. 不同 K 线数量 (100 / 500 / 1000)
 *   3. 数据源 (fapi vs spot)
 */

import { fetchKlines, filterClosedKlines } from "../src/binance.js";
import { calculateRsi } from "../src/rsi.js";
import type { Kline } from "../src/types.js";

/** 从现货 API 获取 K 线（备用数据源） */
async function fetchSpotKlines(
  symbol: string,
  interval: string,
  limit: number = 100,
): Promise<Kline[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Spot API ${response.status}`);
  const raw = (await response.json()) as unknown[][];
  return raw.map((row) => ({
    openTime: row[0] as number,
    open: parseFloat(row[1] as string),
    high: parseFloat(row[2] as string),
    low: parseFloat(row[3] as string),
    close: parseFloat(row[4] as string),
    closeTime: row[6] as number,
  }));
}

interface RsiMethod {
  label: string;
  values: number[];
}

function fmt(n: number): string { return n.toFixed(2); }
function pad(s: string, w: number): string { while (s.length < w) s += " "; return s; }

async function main() {
  const symbol = "BTCUSDT";
  const interval = "1h";
  const period = 14;
  const show = 30;

  console.log("=== RSI 偏差诊断 ===");
  console.log("Symbol: %s %s, period=%d", symbol, interval, period);
  console.log("");

  // 拉取数据
  const rawF = await fetchKlines(symbol, interval, 1000);
  const finF = filterClosedKlines(rawF);
  const rawS = await fetchSpotKlines(symbol, interval, 1000);
  const finS = filterClosedKlines(rawS);
  const rawF5 = await fetchKlines(symbol, interval, 500);
  const finF5 = filterClosedKlines(rawF5);
  const rawF1 = await fetchKlines(symbol, interval, 100);
  const finF1 = filterClosedKlines(rawF1);

  console.log("Data sizes:");
  console.log("  fapi raw=%.0f, closed=%.0f (dropped %.0f unclosed)", rawF.length, finF.length, rawF.length - finF.length);
  console.log("  spot raw=%.0f, closed=%.0f", rawS.length, finS.length);
  console.log("");

  // 多种方式计算
  const ms: RsiMethod[] = [
    { label: "fapi1000过滤", values: calculateRsi(finF.map(k => k.close), period) },
    { label: "fapi1000不滤", values: calculateRsi(rawF.map(k => k.close), period) },
    { label: "fapi500过滤",  values: calculateRsi(finF5.map(k => k.close), period) },
    { label: "fapi100过滤",  values: calculateRsi(finF1.map(k => k.close), period) },
    { label: "spot1000过滤", values: calculateRsi(finS.map(k => k.close), period) },
    { label: "spot1000不滤", values: calculateRsi(rawS.map(k => k.close), period) },
  ];

  const minN = Math.min(...ms.map(m => m.values.length));
  const st = Math.max(0, minN - show);

  // 表头
  const hdr = ms.map(m => pad(m.label, 16)).join(" | ");
  console.log("Last %.0f values:", show);
  console.log("  " + "-".repeat(hdr.length));
  console.log("  " + hdr);
  console.log("  " + "-".repeat(hdr.length));
  for (let i = st; i < minN; i++) {
    console.log("  " + ms.map(m => pad(fmt(m.values[i]), 16)).join(" | "));
  }
  console.log("  " + "-".repeat(hdr.length));
  console.log("");

  // 差异
  const base = ms[0].values;
  console.log("Diff vs fapi1000过滤:");
  for (let i = 1; i < ms.length; i++) {
    const n = Math.min(base.length, ms[i].values.length);
    const d = [];
    for (let j = 0; j < n; j++) d.push(Math.abs(base[j] - ms[i].values[j]));
    const avg = d.reduce((a,b)=>a+b,0)/d.length;
    const mx = Math.max(...d);
    const tl = d.slice(-show);
    const ta = tl.reduce((a,b)=>a+b,0)/tl.length;
    const tm = Math.max(...tl);
    console.log("  %s: avg=%.4f max=%.4f tail30_avg=%.4f tail30_max=%.4f",
      pad(ms[i].label, 16), avg, mx, ta, tm);
  }
  console.log("");

  console.log("=== 建议 ===");
  console.log("  和网页 RSI 对比后，找到最接近的配置列，");
  console.log("  然后告诉我偏差来源（过滤/count/数据源），我统一修改。");
}

main().catch(e => { console.error(e); process.exit(1); });
