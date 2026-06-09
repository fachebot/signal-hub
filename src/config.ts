// 配置加载模块
// 从 .env 文件和 process.env 中读取运行配置，
// 提供缺失变量检测以保证运行时可靠性。

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { AppConfig } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// .env 文件路径（项目根目录）
const dotEnvPath = join(__dirname, "..", ".env");

/** 加载并返回应用配置 */
export function loadConfig(): AppConfig {
  loadDotEnv(dotEnvPath);

  const raw = process.env;

  /** 读取必填环境变量，缺失时抛出错误 */
  function req(key: string): string {
    const v = raw[key]?.trim();
    if (!v) throw new Error(`Missing required env: ${key}`);
    return v;
  }

  return {
    symbol: req("SYMBOL"),
    fvgMinGap: Number(req("FVG_MIN_GAP")),
    rsiPeriod: Number(req("RSI_PERIOD")),
    rsiOverbought: Number(req("RSI_OVERBOUGHT")),
    rsiOversold: Number(req("RSI_OVERSOLD")),
    larkAppId: req("LARK_APP_ID"),
    larkAppSecret: req("LARK_APP_SECRET"),
    // larkBaseUrl 可选，默认使用国际版
    larkBaseUrl: raw.LARK_BASE_URL?.trim() ?? "https://open.larksuite.com",
    larkUserIdType: req("LARK_USER_ID_TYPE"),
    // 逗号分隔的用户 ID 列表，去除空串
    larkUrgentUserIds: req("LARK_URGENT_USER_IDS").split(",").map((s) => s.trim()).filter(Boolean),
  };
}

/** 简易 .env 文件加载器（避免额外依赖） */
function loadDotEnv(path: string): void {
  try {
    const content = readFileSync(path, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      // 跳过空行和注释
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      // 去除可选的引号包裹
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      // 不覆盖已通过进程环境变量设置的值
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch {
    // .env 文件不存在，仅依赖 process.env
  }
}
