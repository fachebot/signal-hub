// FVG（Fair Value Gap，公允价值缺口）检测模块
// 基于连续三根 K 线的价格重叠关系检测市场中的不平衡区域：
//   - 看涨缺口：第 3 根最低价 > 第 1 根最高价
//   - 看跌缺口：第 3 根最高价 < 第 1 根最低价

import type { Kline, FvgSignal } from "./types.js";

/**
 * 从 K 线数组中检测 FVG 信号
 * @param klines      - 已收完的 K 线数组（时序升序）
 * @param timeframe   - K 线周期标识，如 "5m"、"15m"
 * @param currentPrice - 当前最新价格，用于信号上下文
 * @param minGap      - 最小缺口阈值，小于此值的不触发信号
 * @returns 检测到的 FVG 信号数组
 */
export function detectFvgs(
  klines: Kline[],
  timeframe: string,
  currentPrice: number,
  minGap: number,
): FvgSignal[] {
  const results: FvgSignal[] = [];

  // 遍历所有连续三根 K 线的组合，滑动窗口检测
  for (let i = 0; i <= klines.length - 3; i++) {
    const c1 = klines[i];
    const c3 = klines[i + 2];

    // 看涨 FVG：第 3 根 K 线最低价 > 第 1 根 K 线最高价
    // 说明中间 K 线（c2）与两侧存在未被回补的价格缺口
    if (c3.low > c1.high) {
      const gap = c3.low - c1.high;
      if (gap >= minGap) {
        results.push({
          timeframe,
          direction: "bullish",
          gapSize: round2(gap),
          gapLow: round2(c1.high),
          gapHigh: round2(c3.low),
          currentPrice: round2(currentPrice),
          candleOpenTime: c1.openTime,
          candleCloseTime: c3.closeTime,
        });
      }
    }

    // 看跌 FVG：第 3 根 K 线最高价 < 第 1 根 K 线最低价
    // 说明中间 K 线（c2）与两侧存在未被回补的价格缺口
    if (c3.high < c1.low) {
      const gap = c1.low - c3.high;
      if (gap >= minGap) {
        results.push({
          timeframe,
          direction: "bearish",
          gapSize: round2(gap),
          gapLow: round2(c3.high),
          gapHigh: round2(c1.low),
          currentPrice: round2(currentPrice),
          candleOpenTime: c1.openTime,
          candleCloseTime: c3.closeTime,
        });
      }
    }
  }

  return results;
}

/** 保留两位小数 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
