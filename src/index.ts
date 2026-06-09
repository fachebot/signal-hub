// 信号枢纽入口模块
// 初始化配置、去重存储和定时检测器

import { loadConfig } from "./config.js";
import { loadDedupeStore } from "./dedupe.js";
import { startChecker } from "./scheduler.js";

console.log("[signal-hub] starting...");

const config = loadConfig();
loadDedupeStore();
startChecker(config);

// 打印启动信息
console.log(`[signal-hub] monitoring ${config.symbol}`);
console.log(`[signal-hub] FVG min gap: ${config.fvgMinGap}`);
console.log(`[signal-hub] RSI period=${config.rsiPeriod} overbought=${config.rsiOverbought} oversold=${config.rsiOversold}`);
console.log(`[signal-hub] Lark targets: ${config.larkUrgentUserIds.join(", ")}`);

/** 优雅退出 */
process.on("SIGINT", () => {
  console.log("[signal-hub] shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("[signal-hub] shutting down...");
  process.exit(0);
});
