// 币安 API 客户端模块
// 支持从币安合约 API（fapi）获取 K 线数据，失败时降级到现货 API（api）。
// 公开接口无需 API Key。

import type { Kline } from "./types.js";

// API 端点优先级：合约优先 -> 现货兜底
const API_HOSTS = [
  "https://fapi.binance.com/fapi/v1/klines",
  "https://api.binance.com/api/v3/klines",
];

/**
 * 从币安获取 K 线数据
 * @param symbol   - 交易对符号，如 BTCUSDT
 * @param interval - K 线周期，如 5m、15m
 * @param limit    - 获取数量上限，默认 100
 * @returns 格式化后的 K 线数组
 */
export async function fetchKlines(
  symbol: string,
  interval: string,
  limit: number = 100,
): Promise<Kline[]> {
  let lastError: unknown;

  for (const baseUrl of API_HOSTS) {
    const url = `${baseUrl}?symbol=${symbol}&interval=${interval}&limit=${limit}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        const body = await response.text();
        // 403/451 通常表示地理限制，尝试下一个端点
        if (response.status === 403 || response.status === 451) {
          lastError = body;
          continue;
        }
        throw new Error(`Binance API ${response.status}: ${body}`);
      }

      const raw = (await response.json()) as unknown[][];
      // 将币安原始二维数组映射为结构化 Kline 对象
      return raw.map((row) => ({
        openTime: row[0] as number,
        open: parseFloat(row[1] as string),
        high: parseFloat(row[2] as string),
        low: parseFloat(row[3] as string),
        close: parseFloat(row[4] as string),
        closeTime: row[6] as number,
      }));
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(lastError instanceof Error ? lastError.message : String(lastError));
}

/** 过滤出已关闭的 K 线（closeTime < 当前时间戳），避免使用未收完的 K 线 */
export function filterClosedKlines(klines: Kline[]): Kline[] {
  const now = Date.now();
  return klines.filter((k) => k.closeTime < now);
}
