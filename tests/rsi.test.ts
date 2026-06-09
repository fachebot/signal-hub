import { describe, it, expect } from "vitest";
import { calculateRsi, detectRsiSignals } from "../src/rsi.js";
import type { Kline } from "../src/types.js";

// =============================================================================
// calculateRsi — Wilder 平滑法
// =============================================================================

describe("calculateRsi", () => {
  it("应返回空数组：数据量不足（少于 period + 1）", () => {
    expect(calculateRsi([100, 101], 14)).toEqual([]);
    expect(calculateRsi([], 14)).toEqual([]);
    expect(calculateRsi([100], 14)).toEqual([]);
  });

  it("全上涨行情应返回 RSI = 100", () => {
    const closes = Array.from({ length: 16 }, (_, i) => 100 + i);
    const result = calculateRsi(closes, 14);
    expect(result.length).toBe(closes.length - 14);
    for (const rsi of result) {
      expect(rsi).toBe(100);
    }
  });

  it("全下跌行情应返回 RSI = 0", () => {
    const closes = Array.from({ length: 16 }, (_, i) => 200 - i);
    const result = calculateRsi(closes, 14);
    expect(result.length).toBe(closes.length - 14);
    for (const rsi of result) {
      expect(rsi).toBe(0);
    }
  });

  it("等幅涨跌交替时 RSI 应约等于 50", () => {
    // Wilder 平滑下 RSI 会小幅波动（约 ±3.5），而非稳定 50
    const closes: number[] = [100];
    for (let i = 0; i < 30; i++) {
      closes.push(closes[closes.length - 1] + (i % 2 === 0 ? 5 : -5));
    }
    const result = calculateRsi(closes, 14);
    expect(result.length).toBe(closes.length - 14);
    for (const rsi of result) {
      expect(rsi).toBeGreaterThanOrEqual(45);
      expect(rsi).toBeLessThanOrEqual(55);
    }
  });

  it("period = 1 时工作正常", () => {
    // period=1 时 Wilder 退化为简单比较：涨=100，跌=0
    const result = calculateRsi([100, 110, 105, 120], 1);
    expect(result).toEqual([100, 0, 100]);
  });

  it("所有收盘价相同应返回 RSI = 100（avgLoss 恒为 0）", () => {
    const closes = Array.from({ length: 20 }, () => 150);
    const result = calculateRsi(closes, 14);
    expect(result.length).toBe(closes.length - 14);
    for (const rsi of result) {
      expect(rsi).toBe(100);
    }
  });

  it("返回的 RSI 数量正确：等于 closes.length - period", () => {
    expect(calculateRsi([100, 98, 101, 105], 2).length).toBe(2);
    expect(calculateRsi([100, 99, 101, 103, 106], 2).length).toBe(3);
    expect(calculateRsi([100, 99, 101, 103, 106], 3).length).toBe(2);
  });

  it("Wilder 平滑法 RSI 计算结果正确（period=2）", () => {
    // closes = [100, 98, 101, 105], period=2
    // 变化: [-2, +3, +4]
    // 首期 gains[0..1]=[0,3] avgGain=1.5, losses[0..1]=[2,0] avgLoss=1 => RSI=60
    // 二期 gains[2]=4, avgGain=(1.5*1+4)/2=2.75, avgLoss=(1*1+0)/2=0.5 => RSI≈84.62
    const rsi = calculateRsi([100, 98, 101, 105], 2);
    expect(rsi[0]).toBe(60);
    expect(rsi[1]).toBeCloseTo(84.62, 1);
  });
});

// =============================================================================
// detectRsiSignals
// =============================================================================

function makeKlines(closes: number[]): Kline[] {
  return closes.map((c, i) => ({
    openTime: i * 60_000,
    open: c,
    high: c,
    low: c,
    close: c,
    closeTime: (i + 1) * 60_000,
  }));
}

describe("detectRsiSignals", () => {
  it("应检测到超买穿越信号：之前未超买，当前进入超买区", () => {
    // period=2, closes=[100, 97, 100, 103, 106]
    // RSI=[50, 75, 87.5], prev=75 < 79, curr=87.5 >= 79 => overbought
    const closes = [100, 97, 100, 103, 106];
    const signals = detectRsiSignals(makeKlines(closes), "5m", 106, 2, 79, 30);
    expect(signals.length).toBe(1);
    expect(signals[0].direction).toBe("overbought");
    expect(signals[0].timeframe).toBe("5m");
    expect(signals[0].rsiValue).toBeGreaterThanOrEqual(79);
    expect(signals[0].currentPrice).toBe(106);
  });

  it("应检测到超卖穿越信号：之前未超卖，当前进入超卖区", () => {
    // period=2, closes=[100, 97, 99, 98]
    // 变化: [-3, +2, -1]
    // 首期 gains=[0,2] avgGain=1.0, losses=[3,0] avgLoss=1.5 => RSI=40
    // 二期 gain=0 loss=1, avgGain=(1*1+0)/2=0.5, avgLoss=(1.5*1+1)/2=1.25 => RSI≈28.57
    // prev=40 > 30, curr=28.57 <= 30 => oversold
    const closes = [100, 97, 99, 98];
    const signals = detectRsiSignals(makeKlines(closes), "15m", 98, 2, 79, 30);
    expect(signals.length).toBe(1);
    expect(signals[0].direction).toBe("oversold");
    expect(signals[0].timeframe).toBe("15m");
    expect(signals[0].rsiValue).toBeLessThanOrEqual(30);
    expect(signals[0].currentPrice).toBe(98);
  });

  it("RSI 一直在超买区不应产生新信号", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    const signals = detectRsiSignals(makeKlines(closes), "5m", 120, 5, 79, 30);
    expect(signals.length).toBe(0);
  });

  it("RSI 一直在正常区不应产生信号", () => {
    const closes = [100, 101, 100, 101, 100, 101, 100, 101, 100, 101,
      100, 101, 100, 101, 100, 101];
    const signals = detectRsiSignals(makeKlines(closes), "5m", 101, 5, 79, 30);
    expect(signals.length).toBe(0);
  });

  it("数据量不足时应返回空数组", () => {
    expect(detectRsiSignals(makeKlines([100, 101, 102]), "5m", 102, 5, 79, 30)).toEqual([]);
    expect(detectRsiSignals([], "5m", 0, 5, 79, 30)).toEqual([]);
  });
});
