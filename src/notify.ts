// 飞书消息推送模块
// 通过飞书开放 API 发送文本消息并追加紧急应用内推送，
// 支持自动获取和缓存 tenant_access_token。

import type { AppConfig, FvgSignal, RsiSignal } from "./types.js";

/** 飞书获取 token 的响应结构 */
interface TokenResponse {
  code: number;
  tenant_access_token?: string;
  expire?: number;
}

/** 飞书发送消息的响应结构 */
interface SendResponse {
  code: number;
  msg?: string;
  data?: { message_id?: string };
}

/** tenant_access_token 的内存缓存，避免每次请求都重新获取 */
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * 获取飞书 tenant_access_token（含缓存）
 * 过期前 60 秒自动刷新
 */
async function getToken(config: AppConfig): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const resp = await fetch(
    `${config.larkBaseUrl}/open-apis/auth/v3/tenant_access_token/internal`,
    {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        app_id: config.larkAppId,
        app_secret: config.larkAppSecret,
      }),
    },
  );

  const data = (await resp.json()) as TokenResponse;
  if (data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`Lark token error: ${data.tenant_access_token}`);
  }

  cachedToken = {
    token: data.tenant_access_token,
    expiresAt: Date.now() + (data.expire ?? 3600) * 1000,
  };
  return cachedToken.token;
}

/**
 * 向指定用户发送文本消息
 * @param config - 应用配置
 * @param userId - 目标用户 ID
 * @param text   - 消息文本内容
 * @returns 消息 ID（用于后续紧急推送）
 */
async function sendMessage(
  config: AppConfig,
  userId: string,
  text: string,
): Promise<string> {
  const token = await getToken(config);
  const resp = await fetch(
    `${config.larkBaseUrl}/open-apis/im/v1/messages?receive_id_type=${config.larkUserIdType}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        receive_id: userId,
        msg_type: "text",
        content: JSON.stringify({ text }),
      }),
    },
  );

  const data = (await resp.json()) as SendResponse;
  if (data.code !== 0 || !data.data?.message_id) {
    throw new Error(`Lark send error: ${data.msg ?? "unknown"}`);
  }
  return data.data.message_id;
}

/**
 * 对已发送的消息追加应用内紧急推送（强提醒）
 * 调用后用户在飞书内会收到高亮通知
 * @param config    - 应用配置
 * @param messageId - 待紧急推送的消息 ID
 * @param userId    - 目标用户 ID
 */
async function urgentApp(
  config: AppConfig,
  messageId: string,
  userId: string,
): Promise<void> {
  const token = await getToken(config);
  const resp = await fetch(
    `${config.larkBaseUrl}/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/urgent_app?user_id_type=${config.larkUserIdType}`,
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ user_id_list: [userId] }),
    },
  );
  const data = (await resp.json()) as { code: number; msg?: string };
  if (data.code !== 0) {
    console.error("[notify] urgent_app failed:", data.msg);
  }
}

/** 发送 FVG 信号通知（含紧急推送） */
export async function notifyFvg(
  config: AppConfig,
  signal: FvgSignal,
): Promise<void> {
  const direction = signal.direction === "bullish" ? "🟢 看涨" : "🔴 看跌";
  const time = new Date(signal.candleCloseTime).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
  });

  const text = [
    `${direction} BTC/USDT ${signal.timeframe} FVG`,
    "",
    `当前价格: ${signal.currentPrice} USDT`,
    `FVG 范围: ${signal.gapLow} - ${signal.gapHigh}（缺口 ${signal.gapSize} USDT）`,
    `收盘时间: ${time}`,
  ].join("\n");

  for (const userId of config.larkUrgentUserIds) {
    try {
      const msgId = await sendMessage(config, userId, text);
      await urgentApp(config, msgId, userId);
      console.log(
        `[notify] fvg ${signal.direction} ${signal.timeframe} sent to ${userId}`,
      );
    } catch (err) {
      console.error(`[notify] fvg failed for ${userId}:`, err);
    }
  }
}

/** 发送 RSI 信号通知（含紧急推送） */
export async function notifyRsi(
  config: AppConfig,
  signal: RsiSignal,
): Promise<void> {
  const direction = signal.direction === "overbought" ? "🔴 超买" : "🟢 超卖";
  const time = new Date(signal.candleCloseTime).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
  });

  const text = [
    `${direction} BTC/USDT ${signal.timeframe} RSI`,
    "",
    `当前价格: ${signal.currentPrice} USDT`,
    `RSI 值: ${signal.rsiValue}`,
    `收盘时间: ${time}`,
  ].join("\n");

  for (const userId of config.larkUrgentUserIds) {
    try {
      const msgId = await sendMessage(config, userId, text);
      await urgentApp(config, msgId, userId);
      console.log(
        `[notify] rsi ${signal.direction} ${signal.timeframe} sent to ${userId}`,
      );
    } catch (err) {
      console.error(`[notify] rsi failed for ${userId}:`, err);
    }
  }
}
