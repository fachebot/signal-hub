import { describe, it, expect } from "vitest";
import { detectFvgs } from "../src/fvg.js";
import type { Kline } from "../src/types.js";

// =============================================================================
// detectFvgs
// =============================================================================

function k(
  idx: number,
  o: number, h: number, l: number, c: number,
): Kline {
  const t = idx * 60_000;
  return {
    openTime: t,
    open: o,
    high: h,
    low: l,
    close: c,
    closeTime: t + 60_000,
  };
}

describe("detectFvgs", () => {
  it("应检测到看涨 FVG：第 3 根最低价 > 第 1 根最高价", () => {
    // c1: [100, 110, 90, 105]
    // c2: [120, 125, 115, 122]
    // c3: [130, 135, 128, 132] -> low=128 > high=110 => bullish gap=18
    const klines = [
      k(0, 100, 110, 90, 105),
      k(1, 120, 125, 115, 122),
      k(2, 130, 135, 128, 132),
    ];
    const signals = detectFvgs(klines, "5m", 132, 10);
    expect(signals.length).toBe(1);
    expect(signals[0].direction).toBe("bullish");
    expect(signals[0].gapSize).toBe(18); // 128 - 110
    expect(signals[0].gapLow).toBe(110);
    expect(signals[0].gapHigh).toBe(128);
  });

  it("应检测到看跌 FVG：第 3 根最高价 < 第 1 根最低价", () => {
    // c1: [130, 135, 120, 132]
    // c2: [115, 118, 110, 116]
    // c3: [100, 108, 95, 105] -> high=108 < low=120 => bearish gap=12
    const klines = [
      k(0, 130, 135, 120, 132),
      k(1, 115, 118, 110, 116),
      k(2, 100, 108, 95, 105),
    ];
    const signals = detectFvgs(klines, "15m", 105, 10);
    expect(signals.length).toBe(1);
    expect(signals[0].direction).toBe("bearish");
    expect(signals[0].gapSize).toBe(12); // 120 - 108
    expect(signals[0].gapLow).toBe(108);
    expect(signals[0].gapHigh).toBe(120);
  });

  it("价格重叠时不应检测到 FVG", () => {
    // c3.low=100 < c1.high=110, c3.high=118 > c1.low=90 => 完全重叠
    const klines = [
      k(0, 100, 110, 90, 105),
      k(1, 105, 115, 95, 110),
      k(2, 108, 118, 100, 115),
    ];
    const signals = detectFvgs(klines, "5m", 115, 1);
    expect(signals.length).toBe(0);
  });

  it("缺口等于 minGap 时触发，小于 minGap 时忽略", () => {
    const klines = [
      k(0, 80, 100, 70, 90),
      k(1, 110, 115, 105, 112),
      k(2, 130, 135, 120, 132), // low=120 > high=100 => gap=20
    ];
    // minGap=20 触发
    expect(detectFvgs(klines, "5m", 132, 20).length).toBe(1);
    // minGap=21 不触发
    expect(detectFvgs(klines, "5m", 132, 21).length).toBe(0);
  });

  it("K 线数量不足 3 根时应返回空数组", () => {
    expect(detectFvgs([k(0, 100, 110, 90, 105)], "5m", 105, 10)).toEqual([]);
    expect(detectFvgs([], "5m", 0, 10)).toEqual([]);
  });

  it("应正确检测密集出现的多个 FVG 信号", () => {
    // i=0: c1,c2,c3 => c3.low=128 > c1.high=110 => bullish(18)
    // i=1: c2,c3,c4 => c4.low=105 < c2.high=125, c4.high=120 > c2.low=115 => 重叠无信号
    // i=2: c3,c4,c5 => c5.high=110 < c3.low=128 => bearish(18)
    const klines = [
      k(0, 100, 110, 90, 105),   // c1
      k(1, 120, 125, 115, 122),  // c2
      k(2, 130, 135, 128, 132),  // c3
      k(3, 110, 120, 105, 115),  // c4（与 c2 重叠）
      k(4, 100, 110, 90, 105),   // c5
    ];
    const signals = detectFvgs(klines, "5m", 105, 10);
    expect(signals.length).toBe(2);
    expect(signals[0].direction).toBe("bullish");
    expect(signals[0].gapSize).toBe(18);
    expect(signals[1].direction).toBe("bearish");
    expect(signals[1].gapSize).toBe(18);
  });

  it("缺口刚好接触（c3.low === c1.high）时不应视为 FVG", () => {
    const klines = [
      k(0, 100, 110, 90, 105),
      k(1, 115, 120, 105, 118),
      k(2, 125, 130, 110, 128), // low=110 === high=110, gap=0
    ];
    expect(detectFvgs(klines, "5m", 128, 1).length).toBe(0);
  });

  it("看涨和看跌 FVG 数据应正确对称（gapLow/gapHigh 赋值正确）", () => {
    // 看涨: gapLow=c1.high, gapHigh=c3.low
    const bullish = detectFvgs([
      k(0, 90, 100, 85, 95),
      k(1, 110, 115, 105, 112),
      k(2, 130, 135, 125, 132), // low=125 > high=100
    ], "5m", 132, 10);
    expect(bullish.length).toBe(1);
    expect(bullish[0].gapLow).toBe(100);
    expect(bullish[0].gapHigh).toBe(125);

    // 看跌: gapLow=c3.high, gapHigh=c1.low
    const bearish = detectFvgs([
      k(0, 130, 135, 120, 132),
      k(1, 110, 115, 105, 112),
      k(2, 95, 100, 90, 97), // high=100 < low=120
    ], "15m", 97, 10);
    expect(bearish.length).toBe(1);
    expect(bearish[0].gapLow).toBe(100);
    expect(bearish[0].gapHigh).toBe(120);
  });
});
