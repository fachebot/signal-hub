/**
 * RSI 对比校验脚本
 *
 * 因沙箱环境无法访问外部网络，改用本地生成的模拟 K 线数据
 * 对比两种 RSI 算法的差异：
 *
 *   方法 A — 简单平均法（本项目 calculateRsi 所用）
 *     每个窗口独立计算 period 根 K 线的涨跌平均值
 *
 *   方法 B — Wilder 平滑法（币安 / TradingView 默认使用）
 *     初始窗口平均后，后续使用指数平滑: avg = (prev * (p-1) + curr) / p
 *
 * 你可以把这个脚本复制到有网络的机器上运行，或把 fetchBinanceKlines()
 * 改回实时拉取来对比真正的币安数据。
 */

import { calculateRsi } from "../src/rsi.js";

// ============================================================
// Wilder 平滑 RSI（标准实现）
// ============================================================
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

  // 首期：简单平均
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  if (avgLoss === 0) {
    rsi.push(100);
  } else {
    rsi.push(Math.round((100 - 100 / (1 + avgGain / avgLoss)) * 100) / 100);
  }

  // 后续：Wilder 平滑
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

// ============================================================
// 模拟 K 线数据生成器
// 生成在不同行情下的收盘价，方便观察两种算法的差异
// ============================================================
function simulateCloses(length: number): number[] {
  const closes: number[] = [65000]; // 起始价
  const types = ["range", "trend_up", "trend_down", "volatile"];

  let phase = 0;
  for (let i = 1; i < length; i++) {
    const prev = closes[closes.length - 1];
    let change = 0;

    const t = types[phase % types.length];
    if (t === "range") {
      // 震荡 0.5%-1.5% 随机
      change = prev * (Math.random() * 0.015 + 0.005) * (Math.random() > 0.5 ? 1 : -1);
    } else if (t === "trend_up") {
      // 趋势上涨 1%-3%
      change = prev * (Math.random() * 0.02 + 0.01) + (Math.random() > 0.8 ? -prev * 0.01 : 0);
    } else if (t === "trend_down") {
      // 趋势下跌 1%-3%
      change = -(prev * (Math.random() * 0.02 + 0.01)) + (Math.random() > 0.8 ? prev * 0.01 : 0);
    } else if (t === "volatile") {
      // 剧烈波动 3%-6%
      change = prev * (Math.random() * 0.03 + 0.03) * (Math.random() > 0.5 ? 1 : -1);
    }

    closes.push(Math.round((prev + change) * 100) / 100);

    // 每 20-30 根 K 线切换行情类型
    if (i % 25 === 0) phase++;
  }

  return closes;
}

// ============================================================
// 对比输出
// ============================================================
async function main() {
  const period = 14;
  const totalKlines = 100;

  console.log("生成模拟 K 线数据 ...");
  const closes = simulateCloses(totalKlines);
  console.log(`共 ${closes.length} 根收盘价 (起始 ${closes[0]}, 当前 ${closes[closes.length - 1]})\n`);

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

  console.log("=".repeat(90));
  console.log("  整体统计");
  console.log("=".repeat(90));
  console.log(`  平均绝对差值 : ${avgAbsDiff.toFixed(4)}`);
  console.log(`  最大绝对差值 : ${maxAbsDiff.toFixed(4)} (索引 ${maxDiffIdx}, 我们的=${ourRsi[maxDiffIdx].toFixed(2)}, Wilder=${wrRsi[maxDiffIdx].toFixed(2)})`);
  console.log(`  RSI 总数      : ${ourRsi.length}`);
  console.log();

  // 细分差异统计
  const smallDiffs = absDiffs.filter((d) => d < 1).length;
  const medDiffs = absDiffs.filter((d) => d >= 1 && d < 5).length;
  const largeDiffs = absDiffs.filter((d) => d >= 5).length;
  console.log(`  差值 < 1  : ${smallDiffs} 根 (${(smallDiffs / absDiffs.length * 100).toFixed(0)}%)`);
  console.log(`  差值 1-5  : ${medDiffs} 根 (${(medDiffs / absDiffs.length * 100).toFixed(0)}%)`);
  console.log(`  差值 >= 5 : ${largeDiffs} 根 (${(largeDiffs / absDiffs.length * 100).toFixed(0)}%)`);
  console.log();

  // 打印最后 15 根详细对比
  const showLast = 15;
  const start = ourRsi.length - showLast;

  console.log("=".repeat(90));
  console.log(`  最后 ${showLast} 根 K 线详细对比 (period=${period})`);
  console.log("=".repeat(90));
  console.log(
    "  序号".padEnd(8),
    "收盘价".padEnd(14),
    "简单平均 RSI".padEnd(16),
    "Wilder 平滑".padEnd(16),
    "差值".padEnd(10),
    "行情阶段",
  );
  console.log("-".repeat(90));

  for (let i = start; i < ourRsi.length; i++) {
    const klineIdx = i + period;
    const close = closes[klineIdx];
    const o = ourRsi[i];
    const w = wrRsi[i];
    const d = Math.round((o - w) * 100) / 100;

    const phaseLabel = (() => {
      // 简单判断行情方向
      const windowCloses = closes.slice(Math.max(0, klineIdx - 5), klineIdx + 1);
      const trend = windowCloses[windowCloses.length - 1] - windowCloses[0];
      if (trend > 500) return "📈 上涨";
      if (trend < -500) return "📉 下跌";
      if (Math.abs(trend) < 100) return "➡️ 横盘";
      return "↗️ 微涨";
    })();

    console.log(
      `  #${(klineIdx + 1).toString().padStart(2)}`.padEnd(8),
      close.toFixed(1).padEnd(14),
      o.toFixed(2).padEnd(16),
      w.toFixed(2).padEnd(16),
      (d >= 0 ? "+" : "") + d.toFixed(2).padEnd(8),
      phaseLabel,
    );
  }

  console.log();
  console.log("=".repeat(90));
  console.log("  结论");
  console.log("=".repeat(90));
  console.log(`
  币安网页端/ TradingView 默认使用 Wilder 平滑法计算 RSI。
  本项目的 calculateRsi 使用的是简单平均法。

  两种算法的核心区别:
    - 简单平均法: 每个 period 窗口独立计算均值，对近期价格敏感度较低。
    - Wilder 平滑法: 历史值通过指数方式延续，对近期价格变化响应更快。

  如果你的目标是和币安页面显示的 RSI 完全一致，
  则需要将 calculateRsi 替换为 Wilder 平滑法实现。
`);
}

main().catch((err) => {
  console.error("脚本异常:", err);
  process.exit(1);
});
