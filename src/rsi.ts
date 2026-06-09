// RSI（Relative Strength Index，相对强弱指标）计算与信号检测模块
// 采用 Wilder 平滑法计算 RSI，与币安 / TradingView 默认实现一致：
//   - 首期：简单平均
//   - 后续：指数平滑 avg = (prevAvg * (p-1) + currentChange) / p
// 信号检测采用穿越阈值方式（而非在阈值区域内），避免重复通知。

import type { Kline, RsiSignal } from "./types.js";

/**
 * 计算 RSI 值序列（Wilder 平滑法）
 *
 * 与币安网页端 / TradingView 默认 RSI 实现一致。
 *
 * @param closes - 收盘价数组（时序升序）
 * @param period - RSI 周期，通常为 14
 * @returns RSI 值数组，长度 = closes.length - period
 */
export function calculateRsi(closes: number[], period: number): number[] {
  if (closes.length < period + 1) return [];

  // 1. 计算每根的涨跌幅
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }

  const rsiValues: number[] = [];

  // 2. 首期：简单平均
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  if (avgLoss === 0) {
    rsiValues.push(100);
  } else {
    const rs = avgGain / avgLoss;
    rsiValues.push(Math.round((100 - 100 / (1 + rs)) * 100) / 100);
  }

  // 3. 后续：Wilder 平滑
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;

    if (avgLoss === 0) {
      rsiValues.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsiValues.push(Math.round((100 - 100 / (1 + rs)) * 100) / 100);
    }
  }

  return rsiValues;
}

/**
 * 检测 RSI 超买/超卖穿越信号
 * 仅在当前 RSI 穿过阈值而上一值未穿过时触发，避免重复通知
 * @param klines      - K 线数组
 * @param timeframe   - K 线周期标识
 * @param currentPrice - 当前最新价格
 * @param period      - RSI 计算周期
 * @param overbought  - 超买阈值
 * @param oversold    - 超卖阈值
 * @returns RSI 信号数组（每次至多一个信号）
 */
export function detectRsiSignals(
  klines: Kline[],
  timeframe: string,
  currentPrice: number,
  period: number,
  overbought: number,
  oversold: number,
): RsiSignal[] {
  if (klines.length < period + 2) return [];

  const closes = klines.map((k) => k.close);
  const rsiValues = calculateRsi(closes, period);
  const lastCandle = klines[klines.length - 1];

  if (rsiValues.length < 2) return [];

  const currentRsi = rsiValues[rsiValues.length - 1];
  const previousRsi = rsiValues[rsiValues.length - 2];

  // 超买穿越：之前未超买，当前进入超买区
  if (currentRsi >= overbought && previousRsi < overbought) {
    return [{
      timeframe,
      direction: "overbought",
      rsiValue: Math.round(currentRsi * 100) / 100,
      currentPrice: Math.round(currentPrice * 100) / 100,
      candleOpenTime: lastCandle.openTime,
      candleCloseTime: lastCandle.closeTime,
    }];
  }

  // 超卖穿越：之前未超卖，当前进入超卖区
  if (currentRsi <= oversold && previousRsi > oversold) {
    return [{
      timeframe,
      direction: "oversold",
      rsiValue: Math.round(currentRsi * 100) / 100,
      currentPrice: Math.round(currentPrice * 100) / 100,
      candleOpenTime: lastCandle.openTime,
      candleCloseTime: lastCandle.closeTime,
    }];
  }

  return [];
}
