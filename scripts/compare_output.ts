/**
 * 对比输出脚本
 *
 * 从币安拉取实时数据（或使用内置模拟数据），输出 FVG / RSI 计算结果，
 * 格式为清晰表格，方便你复制到看盘软件中手动比对。
 *
 * 使用方式:
 *   npm run compare              # 内置模拟数据（沙箱可用）
 *   npm run compare -- --live    # 从币安 API 拉取实时数据（需联网）
 *
 * 输出格式说明:
 *   [主表]  bar# | 时间 | 开盘 | 最高 | 最低 | 收盘 | RSI(14) | 备注
 *   [FVG]  检测到的 FVG 信号
 *   [RSI]  RSI 超买/超卖穿越信号（仅实时数据模式）
 */

import { fetchKlines, filterClosedKlines } from "../src/binance.js";
import { calculateRsi, detectRsiSignals } from "../src/rsi.js";
import { detectFvgs } from "../src/fvg.js";
import type { Kline, FvgSignal, RsiSignal } from "../src/types.js";

// ============================================================
// 1a. 数据源：从币安拉取真实 K 线
// ============================================================

/** 从币安 API 获取实时 K 线数据 */
async function fetchBinanceKlines(
  symbol: string,
  interval: string,
  limit: number = 100,
): Promise<Bar[]> {
  const baseUrl = "https://fapi.binance.com/fapi/v1/klines";
  const url = `${baseUrl}?symbol=${symbol}&interval=${interval}&limit=${limit}`;

  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Binance API ${response.status}: ${body}`);
  }

  type BinanceKline = [
    number,
    string,
    string,
    string,
    string,
    string,
    number,
    string,
    string,
    number,
    string,
    string,
  ];
  const raw = (await response.json()) as BinanceKline[];

  return raw.map((row) => ({
    openTime: row[0],
    open: parseFloat(row[1]),
    high: parseFloat(row[2]),
    low: parseFloat(row[3]),
    close: parseFloat(row[4]),
  }));
}

// ============================================================
// 1b. 数据源：模拟数据（含看涨/看跌 FVG + RSI 超买超卖区域）
// ============================================================

/** 模拟 OHLC 数据：15m K 线，覆盖多种行情 */
interface Bar {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

function generateSampleBars(): Bar[] {
  // 以 2026-06-08 00:00 UTC 为起始，15m 一根
  const baseTime = new Date("2026-06-08T00:00:00Z").getTime();
  const intervalMs = 15 * 60_000;
  let t = baseTime;

  // 设计一个有明确模式的 BTC 价格序列
  // 价格结构：横盘 → 缓涨 → 大跌(FVG 看跌机会) → 反弹(FVG 看涨机会) → 冲高回落(RSI 超买) → 企稳
  const priceSequence: Bar[] = [];

  // 辅助：生成一根 K 线
  function bar(o: number, h: number, l: number, c: number) {
    const b: Bar = { openTime: t, open: o, high: h, low: l, close: c };
    t += intervalMs;
    return b;
  }

  // === Phase 1: 横盘 69000-69500 (12 根) ===
  priceSequence.push(bar(69000, 69150, 68920, 69050));
  priceSequence.push(bar(69050, 69200, 68980, 69150));
  priceSequence.push(bar(69150, 69280, 69050, 69200));
  priceSequence.push(bar(69200, 69300, 69120, 69250));
  priceSequence.push(bar(69250, 69400, 69200, 69380));
  priceSequence.push(bar(69380, 69500, 69300, 69450));
  priceSequence.push(bar(69450, 69550, 69350, 69400));
  priceSequence.push(bar(69400, 69500, 69300, 69350));
  priceSequence.push(bar(69350, 69450, 69200, 69300));
  priceSequence.push(bar(69300, 69380, 69100, 69150));
  priceSequence.push(bar(69150, 69300, 69050, 69200));
  priceSequence.push(bar(69200, 69350, 69150, 69250));

  // === Phase 2: 缓涨 69250 → 69800 (8 根) ===
  priceSequence.push(bar(69250, 69400, 69200, 69350));
  priceSequence.push(bar(69350, 69500, 69280, 69450));
  priceSequence.push(bar(69450, 69600, 69350, 69550));
  priceSequence.push(bar(69550, 69700, 69450, 69650));
  priceSequence.push(bar(69650, 69800, 69550, 69750));
  priceSequence.push(bar(69750, 69900, 69600, 69800));
  priceSequence.push(bar(69800, 69900, 69650, 69700));
  priceSequence.push(bar(69700, 69850, 69600, 69720));

  // === Phase 3: 快速拉升到 71000 (6 根，RSI 逐步进入超买) ===
  priceSequence.push(bar(69720, 69950, 69650, 69900));
  priceSequence.push(bar(69900, 70100, 69700, 70050));
  priceSequence.push(bar(70050, 70300, 69900, 70200));
  priceSequence.push(bar(70200, 70500, 70000, 70400));
  priceSequence.push(bar(70400, 70800, 70200, 70700));
  priceSequence.push(bar(70700, 71200, 70500, 71000));

  // === Phase 4: 急跌 (4 根，产生看跌 FVG) ===
  // c1: 71000-70800  / c2: 68000-67500 / c3: 65500-65000
  // c3.high=65500 < c1.low=70500 => 看跌 FVG gap=70500-65500=5000
  priceSequence.push(bar(71000, 71000, 70500, 70800)); // c1
  priceSequence.push(bar(70800, 68500, 67500, 68000)); // c2
  priceSequence.push(bar(68000, 65500, 65000, 65400)); // c3  bearish FVG: c3.high(65500) < c1.low(70500)

  // === Phase 5: 继续跌 + 小反弹 (6 根，RSI 进入超卖) ===
  priceSequence.push(bar(65400, 65800, 64800, 65000));
  priceSequence.push(bar(65000, 65500, 64500, 64700));
  priceSequence.push(bar(64700, 65200, 64200, 64500));
  priceSequence.push(bar(64500, 65000, 64000, 64800));
  priceSequence.push(bar(64800, 65500, 64600, 65300));
  priceSequence.push(bar(65300, 65800, 64800, 65200));

  // === Phase 6: 反弹 (8 根，可能产生看涨 FVG) ===
  // c1: 65200-64800 / c2: 66000-65700 / c3: 67000-66800
  // c3.low=66800 > c1.high=65200 => 看涨 FVG gap=66800-65200=1600
  priceSequence.push(bar(65200, 65200, 64800, 65000)); // c1
  priceSequence.push(bar(65000, 66000, 65500, 65800)); // c2
  priceSequence.push(bar(65800, 67000, 66800, 67000)); // c3  bullish FVG: c3.low(66800) > c1.high(65200)

  // === Phase 7: 冲高回落 (8 根) ===
  priceSequence.push(bar(67000, 67500, 66000, 66500));
  priceSequence.push(bar(66500, 66800, 65800, 66000));
  priceSequence.push(bar(66000, 66500, 65500, 65800));
  priceSequence.push(bar(65800, 66200, 65000, 65200));
  priceSequence.push(bar(65200, 65800, 64800, 65000));
  priceSequence.push(bar(65000, 65500, 64600, 64800));
  priceSequence.push(bar(64800, 65200, 64400, 64600));
  priceSequence.push(bar(64600, 65000, 64300, 64500));

  return priceSequence;
}

// ============================================================
// 2. Kline 转换
// ============================================================

function barsToKlines(bars: Bar[]): Kline[] {
  return bars.map((b) => ({
    openTime: b.openTime,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    closeTime: b.openTime + 15 * 60_000,
  }));
}

// ============================================================
// 3. 输出工具
// ============================================================

function pad(s: string, n: number): string {
  return s.padEnd(n);
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtPrice(p: number): string {
  return p.toFixed(1);
}

// ============================================================
// 4. 主流程
// ============================================================

async function main() {
  // CLI 参数：--live 启用实时数据
  const useLive = process.argv.includes("--live");
  console.info("正在执行对比输出脚本...", process.argv);

  const period = 14;
  const rsiOverbought = 79;
  const rsiOversold = 30;
  const fvgMinGap = 1000;

  console.log(
    "========================================================================",
  );
  console.log("  signal-hub  FVG / RSI 对比输出");
  if (useLive) {
    console.log("  数据: 币安实时 1h BTC/USDT K 线 (limit=1000)");
  } else {
    console.log("  数据: 模拟 15m BTC/USDT K 线");
  }
  console.log("  RSI 参数: period=14, 超买=79, 超卖=30");
  console.log("  FVG 参数: minGap=1000 USDT");
  console.log(
    "========================================================================",
  );
  console.log();
  if (useLive) {
    console.log("  ✓ 实时模式: 从币安 API 拉取 BTC/USDT 1h K 线数据");
  }
  console.log("  使用方式: npm run compare              # 模拟数据");
  console.log("            npm run compare -- --live    # 实时数据");
  console.log();

  // 生成或拉取数据
  let bars: Bar[];
  if (useLive) {
    console.log("→ 正在从币安获取 K 线数据 (BTC/USDT 1h)...");
    bars = await fetchBinanceKlines("BTCUSDT", "1h", 100);
    console.log(`  已获取 ${bars.length} 根 K 线`);
  } else {
    bars = generateSampleBars();
    console.log(`  使用模拟数据，共 ${bars.length} 根 K 线`);
  }
  console.log();
  const klines = barsToKlines(bars);

  // 获取当前价格（最后一根收盘价）
  const currentPrice = bars[bars.length - 1].close;

  // 计算 RSI
  const closes = bars.map((b) => b.close);
  const rsiValues = calculateRsi(closes, period);

  // 检测 FVG
  const fvgSignals = detectFvgs(klines, "15m", currentPrice, fvgMinGap);

  // 检测 RSI 信号
  const rsiSignals = detectRsiSignals(
    klines,
    "15m",
    currentPrice,
    period,
    rsiOverbought,
    rsiOversold,
  );

  // ============================================================
  // 输出主表
  // ============================================================
  const headerRow = [
    pad("Bar#", 5),
    pad("时间(北京时间)", 18),
    pad("开盘", 10),
    pad("最高", 10),
    pad("最低", 10),
    pad("收盘", 10),
    pad("RSI(14)", 8),
    pad("FVG 方向", 10),
    pad("备注 / FVG 详情", 40),
  ].join(" | ");

  console.log("─".repeat(headerRow.length));
  console.log(headerRow);
  console.log("─".repeat(headerRow.length));

  // 为每根 K 线标注 FVG 信号（用 candleOpenTime 匹配）
  const fvgAtBar = new Map<number, { dir: string; detail: string }>();

  for (const fvg of fvgSignals) {
    const idx = bars.findIndex((b) => b.openTime === fvg.candleOpenTime);
    if (idx >= 0) {
      fvgAtBar.set(idx, {
        dir: fvg.direction === "bullish" ? "📈 看涨" : "📉 看跌",
        detail: `gap=${fmtPrice(fvg.gapSize)} [${fmtPrice(fvg.gapLow)} - ${fmtPrice(fvg.gapHigh)}]`,
      });
    }
  }

  // 为 RSI 标注入场点
  const rsiEventAtBar = new Map<number, string>();
  for (const signal of rsiSignals) {
    const idx = bars.findIndex((b) => b.openTime === signal.candleOpenTime);
    if (idx >= 0) {
      rsiEventAtBar.set(
        idx,
        signal.direction === "overbought" ? "【超买信号】" : "【超卖信号】",
      );
    }
  }

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const rsiIdx = i - period;
    const rsiStr = rsiIdx >= 0 ? rsiValues[rsiIdx].toFixed(2) : "".padStart(8);

    const fvgInfo = fvgAtBar.get(i);
    const fvgStr = fvgInfo
      ? fvgInfo.dir
      : (() => {
          // 判断是否在 FVG 区域内
          for (const fvg of fvgSignals) {
            // 检查当前 bar 是否在 FVG 的 candleOpenTime ~ candleCloseTime 范围内
            if (
              b.openTime >= fvg.candleOpenTime &&
              b.openTime <= fvg.candleCloseTime
            ) {
              return fvg.direction === "bullish" ? "⬆缺口内" : "⬇缺口内";
            }
          }
          return "";
        })();

    const rsiEvent = rsiEventAtBar.get(i);
    const note = rsiEvent || (fvgInfo ? fvgInfo.detail : "");

    const rowStr = [
      pad(String(i + 1), 5),
      pad(fmtTime(b.openTime), 18),
      pad(fmtPrice(b.open), 10),
      pad(fmtPrice(b.high), 10),
      pad(fmtPrice(b.low), 10),
      pad(fmtPrice(b.close), 10),
      pad(rsiStr, 8),
      pad(fvgStr, 10),
      pad(note, 40),
    ].join(" | ");

    console.log(rowStr);
  }

  console.log("─".repeat(headerRow.length));
  console.log();

  // ============================================================
  // FVG 汇总
  // ============================================================
  console.log("=".repeat(80));
  console.log("  FVG 检测结果汇总");
  console.log("=".repeat(80));

  if (fvgSignals.length === 0) {
    console.log("  （无 FVG 信号）");
  } else {
    console.log("  # | 方向 | 周期 | 缺口范围 (USDT) | 缺口大小 | 起始 K 线");
    console.log("─".repeat(80));
    for (let i = 0; i < fvgSignals.length; i++) {
      const s = fvgSignals[i];
      const barIdx = bars.findIndex((b) => b.openTime === s.candleOpenTime);
      const dir = s.direction === "bullish" ? "📈看涨" : "📉看跌";
      const range = `${fmtPrice(s.gapLow)} - ${fmtPrice(s.gapHigh)}`;
      console.log(
        `  ${String(i + 1).padStart(2)} | ${dir.padEnd(6)} | ${s.timeframe.padEnd(4)} | ${range.padEnd(20)} | ${fmtPrice(s.gapSize).padStart(8)} | Bar#${(barIdx + 1).toString().padStart(3)} ${fmtTime(s.candleOpenTime)}`,
      );
    }
  }
  console.log();

  // ============================================================
  // RSI 汇总
  // ============================================================
  console.log("=".repeat(80));
  console.log("  RSI 信号汇总");
  console.log("=".repeat(80));

  if (rsiSignals.length === 0) {
    const lastRsi = rsiValues[rsiValues.length - 1];
    const lastBar = bars[bars.length - 1];
    console.log(
      `  （当前无穿越信号。最新 RSI(14)=${lastRsi.toFixed(2)}, 收盘价=${lastBar.close.toFixed(1)}）`,
    );
  } else {
    console.log("  # | 方向 | 周期 | RSI 值 | 当前价格 | K 线时间");
    console.log("─".repeat(80));
    for (let i = 0; i < rsiSignals.length; i++) {
      const s = rsiSignals[i];
      const barIdx = bars.findIndex((b) => b.openTime === s.candleOpenTime);
      const dir = s.direction === "overbought" ? "🔴超买" : "🟢超卖";
      console.log(
        `  ${String(i + 1).padStart(2)} | ${dir.padEnd(6)} | ${s.timeframe.padEnd(4)} | ${String(s.rsiValue).padStart(6)}   | ${fmtPrice(s.currentPrice).padStart(8)}  | Bar#${(barIdx + 1).toString().padStart(3)} ${fmtTime(s.candleOpenTime)}`,
      );
    }
  }
  console.log();

  // ============================================================
  // 最后 15 根 RSI 明细（便于与 TradingView 逐根核对）
  // ============================================================
  console.log("=".repeat(80));
  console.log("  最后 15 根 K 线 RSI 明细（用于与看盘软件逐根核对）");
  console.log("=".repeat(80));
  console.log("  Bar# | 收盘价     | RSI(14)");
  console.log("─".repeat(40));
  const start = Math.max(0, bars.length - 15);
  for (let i = start; i < bars.length; i++) {
    const rsiIdx = i - period;
    const rsiStr = rsiIdx >= 0 ? String(rsiValues[rsiIdx]) : "-";
    console.log(
      `  ${String(i + 1).padStart(4)} | ${fmtPrice(bars[i].close).padStart(8)}   | ${rsiStr.padStart(8)}`,
    );
  }
  console.log();

  // ============================================================
  // CSV 导出（方便粘贴到 Excel）
  // ============================================================
  console.log("=".repeat(80));
  console.log("  CSV 格式（可复制粘贴到 Excel/Sheets）");
  console.log("=".repeat(80));
  console.log("Bar#,时间,开盘,最高,最低,收盘,RSI(14)");
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const rsiIdx = i - period;
    const rsiStr = rsiIdx >= 0 ? String(rsiValues[rsiIdx]) : "";
    console.log(
      `${i + 1},${fmtTime(b.openTime)},${b.open},${b.high},${b.low},${b.close},${rsiStr}`,
    );
  }
  console.log();

  console.log("  提示: 选中上方 CSV 区域，复制后粘贴到 Excel，");
  console.log('  选择"分列"或直接粘贴即可得到结构化数据。');
  console.log("  将 RSI(14) 列与 TradingView / 币安网页 RS 指标对比。");
  console.log();
  console.log("  FVG 信号: 找到对应的 Bar#，用 TradingView 的 FVG 指标或手动");
  console.log("  检查三根连续 K 线的价格重叠关系验证。");
}

main().catch((err) => {
  console.error("脚本异常:", err);
  process.exit(1);
});
