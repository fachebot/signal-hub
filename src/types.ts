// 信号枢纽核心类型定义
// 定义了 K 线数据、FVG 信号、RSI 信号及应用配置的数据结构

/** 单根 K 线数据 */
export interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  closeTime: number;
}

/** FVG（Fair Value Gap，公允价值缺口）信号 */
export interface FvgSignal {
  timeframe: string;
  direction: "bullish" | "bearish";
  gapSize: number;
  gapLow: number;
  gapHigh: number;
  currentPrice: number;
  candleOpenTime: number;
  candleCloseTime: number;
}

/** RSI（相对强弱指标）信号 */
export interface RsiSignal {
  timeframe: string;
  direction: "overbought" | "oversold";
  rsiValue: number;
  currentPrice: number;
  candleOpenTime: number;
  candleCloseTime: number;
}

/** 信号类型枚举 */
export type SignalKind = "fvg" | "rsi";

/** 应用全局配置 */
export interface AppConfig {
  /** 交易对，如 BTCUSDT */
  symbol: string;
  /** FVG 最小缺口阈值（USDT） */
  fvgMinGap: number;
  /** RSI 计算周期 */
  rsiPeriod: number;
  /** RSI 超买阈值 */
  rsiOverbought: number;
  /** RSI 超卖阈值 */
  rsiOversold: number;
  /** 飞书自建应用 App ID */
  larkAppId: string;
  /** 飞书自建应用 App Secret */
  larkAppSecret: string;
  /** 飞书 API 基础地址 */
  larkBaseUrl: string;
  /** 飞书用户 ID 类型（如 open_id） */
  larkUserIdType: string;
  /** 接收紧急通知的用户 ID 列表 */
  larkUrgentUserIds: string[];
}
