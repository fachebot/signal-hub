// 定时调度模块
// 每 30 秒 tick 一次，根据当前分钟数决定检测哪个时间周期的信号：
//   - 5m 检测：每分钟 :00/:05/:10...（分钟 % 5 === 0）
//   - 15m 检测：每分钟 :00/:15/:30/:45（分钟 % 15 === 0）

import type { AppConfig } from "./types.js";
import { fetchKlines, filterClosedKlines } from "./binance.js";
import { detectFvgs } from "./fvg.js";
import { detectRsiSignals } from "./rsi.js";
import { isNotified, markNotified, saveStore, fvgKey, rsiKey } from "./dedupe.js";
import { notifyFvg, notifyRsi } from "./notify.js";

/** 检测上下文：记录最后一轮检测的分针数，防止重复 */
interface CheckContext {
  lastM5: number;
  lastM15: number;
}

const ctx: CheckContext = { lastM5: -1, lastM15: -1 };

/**
 * 检测指定时间周期的信号
 * 流程：获取 K 线 -> 过滤已收盘 -> 检测 FVG + RSI -> 去重 -> 通知 -> 持久化
 */
export async function checkTimeframe(
  timeframe: string,
  intervalMinutes: number,
  config: AppConfig,
): Promise<void> {
  const now = new Date();
  const mins = now.getMinutes();

  // 同一分钟内避免重复检测
  if (intervalMinutes === 5 && mins % 5 === 0 && ctx.lastM5 === mins) return;
  if (intervalMinutes === 15 && mins % 15 === 0 && ctx.lastM15 === mins) return;

  if (intervalMinutes === 5) ctx.lastM5 = mins;
  if (intervalMinutes === 15) ctx.lastM15 = mins;

  console.log(`[check] ${timeframe} starting at ${now.toISOString()}`);

  try {
    const raw = await fetchKlines(config.symbol, timeframe, 500);
    const klines = filterClosedKlines(raw);
    const currentPrice = klines.length > 0 ? klines[klines.length - 1].close : 0;

    // FVG 信号检测与通知
    // 只检测最近 10 根 K 线，避免首次运行时扫描全部历史产生几十条重复通知
    const recentKlines = klines.slice(-10);
    const fvgs = detectFvgs(recentKlines, timeframe, currentPrice, config.fvgMinGap);
    for (const fvg of fvgs) {
      const key = fvgKey(fvg);
      if (isNotified(key)) continue;
      markNotified(key);
      await notifyFvg(config, fvg);
    }

    // RSI 信号检测与通知
    const rsiSignals = detectRsiSignals(
      klines, timeframe, currentPrice,
      config.rsiPeriod, config.rsiOverbought, config.rsiOversold,
    );
    for (const signal of rsiSignals) {
      const key = rsiKey(signal);
      if (isNotified(key)) continue;
      markNotified(key);
      await notifyRsi(config, signal);
    }

    saveStore();
  } catch (err) {
    console.error(`[check] ${timeframe} error:`, err);
  }
}

/** 启动定时检测器 */
export function startChecker(config: AppConfig): void {
  setInterval(() => {
    const mins = new Date().getMinutes();

    if (mins % 5 === 0) {
      checkTimeframe("5m", 5, config);
    }
    if (mins % 15 === 0) {
      checkTimeframe("15m", 15, config);
    }
  }, 30_000);

  console.log(`[scheduler] started, checking 5m (every :00/:05/... ) and 15m (every :00/:15/... )`);
}
