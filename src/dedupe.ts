// 信号去重持久化模块
// 将已通知的信号记录存储到 signals.json 文件中，
// 避免程序重启或多次运行导致重复推送相同信号。

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { FvgSignal, RsiSignal } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// 去重状态文件路径（项目根目录下的 signals.json）
const DATA_PATH = join(__dirname, "..", "signals.json");

/** 持久化存储的结构 */
interface Store {
  notified: string[];
  lastUpdated: string;
}

/** 运行时去重集合（内存） */
let store: Set<string> = new Set();

/**
 * 从磁盘加载已有的去重状态
 * 首次启动时自动创建空文件
 */
export function loadDedupeStore(): void {
  if (existsSync(DATA_PATH)) {
    try {
      const raw: Store = JSON.parse(readFileSync(DATA_PATH, "utf-8"));
      store = new Set(raw.notified);
      console.log(`[dedupe] loaded ${store.size} notified signals`);
    } catch {
      store = new Set();
    }
  } else {
    store = new Set();
    saveStore();
  }
}

/** 检查指定 key 是否已通知过 */
export function isNotified(key: string): boolean {
  return store.has(key);
}

/** 将 key 标记为已通知 */
export function markNotified(key: string): void {
  store.add(key);
}

/**
 * 将去重状态持久化到磁盘
 * 每次检测信号后调用一次，确保数据不丢失
 */
export function saveStore(): void {
  writeFileSync(
    DATA_PATH,
    JSON.stringify({ notified: [...store], lastUpdated: new Date().toISOString() }, null, 2),
    "utf-8",
  );
}

/** 生成 FVG 信号的唯一去重 key */
export function fvgKey(signal: FvgSignal): string {
  return `fvg:${signal.timeframe}:${signal.candleOpenTime}:${signal.direction}`;
}

/** 生成 RSI 信号的唯一去重 key */
export function rsiKey(signal: RsiSignal): string {
  return `rsi:${signal.timeframe}:${signal.candleOpenTime}:${signal.direction}`;
}
