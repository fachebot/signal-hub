/**
 * RSI 对比校验脚本
 *
 * 使用 src/binance.ts 的 fetchKlines 从币安拉取实时数据（--live 模式），
 * 或使用本地生成的模拟 K 线数据（默认）。
 *
 * 对比两种 RSI 算法的差异：
 *   方法 A — Wilder 平滑法（本项目 calculateRsi，与币安一致）
 *   方法 B — 独立实现的 Wilder 平滑法（wilderRsi，用于交叉验证）
 */

import { fetchKlines, filterClosedKlines } from "../src/binance.js";
import { calculateRsi } from "../src/rsi.js";
import type { Kline } from "../src/types.js";

// === Wilder 平滑 RSI（标准实现）—— 独立实现，用于交叉验证 ===
function wilderRsi(closes: number[], period: number): number[] {
  if (closes.length < period + 1) return [];

  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }

  const rsi: number[] = [];
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  if (avgLoss === 0) {
    rsi.push(100);
  } else {
    rsi.push(Math.round((100 - 100 / (1 + avgGain / avgLoss)) * 100) / 100);
  }

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(Math.round((100 - 100 / (1 + rs)) * 100) / 100);
    }
  }
  return rsi;
}

// === 模拟 K 线数据生成器 ===
function simulateCloses(length: number): number[] {
  const closes: number[] = [65000];
  const types = ["range", "trend_up", "trend_down", "volatile"];
  let phase = 0;
  for (let i = 1; i < length; i++) {
    const prev = closes[closes.length - 1];
    let change = 0;
    const t = types[phase % types.length];
    if (t === "range") {
      change = prev * (Math.random() * 0.015 + 0.005) * (Math.random() > 0.5 ? 1 : -1);
    } else if (t === "trend_up") {
      change = prev * (Math.random() * 0.02 + 0.01) + (Math.random() > 0.8 ? -prev * 0.01 : 0);
    } else if (t === "trend_down") {
      change = -(prev * (Math.random() * 0.02 + 0.01)) + (Math.random() > 0.8 ? prev * 0.01 : 0);
    } else if (t === "volatile") {
      change = prev * (Math.random() * 0.03 + 0.03) * (Math.random() > 0.5 ? 1 : -1);
    }
    closes.push(Math.round((prev + change) * 100) / 100);
    if (i % 25 === 0) phase++;
  }
  return closes;
}

// === 从币安获取收盘价序列 ===
async function fetchLiveCloses(symbol: string, interval: string, limit: number): Promise<number[]> {
  const klines = await fetchKlines(symbol, interval, limit);
  const closed = filterClosedKlines(klines);
  return closed.map((k) => k.close);
}

// === 主程序 ===
async function main() {
  const isLive = process.argv.includes("--live") || process.env.LIVE === "true";
  const period = 14;

  console.log("=== RSI 算法对比校验 ===");
  console.log("参数: period=%d", period);
  console.log();

  // 获取数据
  const closes: number[] = await (() => {
    if (isLive) {
      console.log("模式: 实时 (币安 BTCUSDT 1h, limit=1000)");
      return fetchLiveCloses("BTCUSDT", "1h", 1000);
    } else {
      console.log("模式: 模拟数据 (100 根 K 线)");
      return simulateCloses(100);
    }
  })();

  console.log("共 %d 根收盘价 (起始 %.1f, 当前 %.1f)", closes.length, closes[0], closes[closes.length - 1]);
  console.log();

  // 两种算法
  const ourRsi = calculateRsi(closes, period);
  const wrRsi = wilderRsi(closes, period);

  if (ourRsi.length !== wrRsi.length) {
    console.error("RSI 数组长度不一致！");
    return;
  }

  // 全量统计
  const diffs = ourRsi.map((v, i) => v - wrRsi[i]);
  const absDiffs = diffs.map(Math.abs);
  const avgAbsDiff = absDiffs.reduce((a, b) => a + b, 0) / absDiffs.length;
  const maxAbsDiff = Math.max(...absDiffs);
  const maxDiffIdx = absDiffs.indexOf(maxAbsDiff);

  console.log("=== 整体统计 ===");
  console.log("平均绝对差值 : %.4f", avgAbsDiff);
  console.log("最大绝对差值 : %.4f (索引 %d, 我们的=%.2f, Wilder=%.2f)", maxAbsDiff, maxDiffIdx, ourRsi[maxDiffIdx], wrRsi[maxDiffIdx]);
  console.log("RSI 总数      : %d", ourRsi.length);
  console.log();

  const smallDiffs = absDiffs.filter((d) => d < 1).length;
  const medDiffs = absDiffs.filter((d) => d >= 1 && d < 5).length;
  const largeDiffs = absDiffs.filter((d) => d >= 5).length;
  console.log("差值 < 1  : %d (%d%%)", smallDiffs, Math.round(smallDiffs / absDiffs.length * 100));
  console.log("差值 1-5  : %d (%d%%)", medDiffs, Math.round(medDiffs / absDiffs.length * 100));
  console.log("差值 >= 5 : %d (%d%%)", largeDiffs, Math.round(largeDiffs / absDiffs.length * 100));
  console.log();

  // 最后 15 根
  const showLast = 15;
  const start = ourRsi.length - showLast;
  console.log("=== 最后 %d 根 K 线详细对比 ===", showLast);
  console.log(" %5s | %8s | %10s | %10s | %6s", "序号", "收盘价", "我们的 RSI", "Wilder RSI", "差值");
  console.log("-".repeat(60));
  for (let i = start; i < ourRsi.length; i++) {
    const klineIdx = i + period;
    const o = ourRsi[i];
    const w = wrRsi[i];
    const d = Math.round((o - w) * 100) / 100;
    console.log(" %5d | %8.1f | %10.2f | %10.2f | %+6.2f", klineIdx, closes[klineIdx], o, w, d);
  }
  console.log();

  console.log("两种算法的值应完全一致（本项目已改用 Wilder 平滑法）。");
  console.log("若有差异，说明 calculateRsi 与独立 wilderRsi 实现不一致。");
}

main().catch((err) => {
  console.error("脚本异常:", err);
  process.exit(1);
});
