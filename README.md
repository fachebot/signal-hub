# Signal Hub

实时监控币安期货 BTC/USDT K线信号，通过飞书推送通知。

支持两种信号类型：
- **FVG** (Fair Value Gap) —— 3根K线缺口检测，看涨/看跌
- **RSI** —— 相对强弱指标超买/超卖穿越检测

## 快速开始

### 1. 安装依赖

`ash
npm install
`

### 2. 配置环境变量

`ash
cp .env.example .env
`

编辑 .env 文件，填入飞书应用凭证和参数。

### 3. 启动

`ash
npm start
`

首次启动时会扫描历史数据，把已存在的信号全部标记为已通知，不会推送。之后每轮只推送新产生的信号。

### 4. 用 pm2 常驻

`ash
npm install -g pm2
pm2 start npm --name signal-hub -- start
pm2 save
pm2 startup
`

## 调度时序

每 30 秒 tick 一次，根据当前分钟决定检查内容：

| 时间点 | 检查内容 |
|---|---|
| :01、:06、:11... (分钟 % 5 === 1) | 5m FVG + 5m RSI |
| :01、:16、:31、:46 (分钟 % 15 === 1) | 15m FVG + 15m RSI |

采用 :01 而非 :00 是为了给K线收盘留1分钟缓冲，代码里还用了 closeTime < now 过滤，双重保险。

## 信号说明

### FVG (Fair Value Gap)

对每组连续 3 根K线：

- **看涨 FVG**：第3根最低价 > 第1根最高价，缺口 = c3.low - c1.high
- **看跌 FVG**：第3根最高价 < 第1根最低价，缺口 = c1.low - c3.high

缺口 >= FVG_MIN_GAP 时触发通知。

### RSI

基于收盘价计算，采用简单平均法，取最近 1000 根K线：

- **超买信号**：RSI 从下方穿越 RSI_OVERBOUGHT 阈值
- **超卖信号**：RSI 从上方穿越 RSI_OVERSOLD 阈值

采用穿越检测而非单纯判断是否在区域内，避免重复通知。

## 通知格式

### FVG 消息

`
[FVG] BTC/USDT 5m 看涨 (缺口 150 USDT)
当前价格: 68950 USDT
FVG 范围: 68700 - 68850
K线时间: 2026/6/9 14:05
`

### RSI 消息

`
[RSI] BTC/USDT 15m 超卖 (RSI: 28.5)
当前价格: 68200 USDT
K线时间: 2026/6/9 14:00
`

## 配置项

| 变量 | 默认值 | 说明 |
|---|---|---|
| SYMBOL | — | 交易对，如 BTCUSDT |
| FVG_MIN_GAP | 60 | FVG 缺口最小值 (USDT) |
| RSI_PERIOD | 14 | RSI 计算周期 |
| RSI_OVERBOUGHT | 79 | 超买阈值 |
| RSI_OVERSOLD | 30 | 超卖阈值 |
| LARK_APP_ID | — | 飞书自建应用 App ID |
| LARK_APP_SECRET | — | 飞书自建应用 App Secret |
| LARK_BASE_URL | https://open.larksuite.com | 飞书 API 地址 |
| LARK_USER_ID_TYPE | — | 用户 ID 类型 |
| LARK_URGENT_USER_IDS | — | 接收通知的用户 ID，逗号分隔 |

## 项目结构

`
src/
  config.ts      环境变量加载
  binance.ts     币安 API 客户端 (fapi fallback 到 spot)
  fvg.ts         FVG 检测逻辑
  rsi.ts         RSI 计算 + 信号检测
  dedupe.ts     去重持久化 (signals.json)
  notify.ts      飞书消息推送
  scheduler.ts   定时调度
  index.ts       入口
signals.json      去重状态文件 (自动创建)
`

## 依赖

- Node.js 20+
- 币安期货 API (公共接口，无需 API Key)
- 飞书自建应用 (需要消息和加急权限)
- pm2 (可选，推荐用于常驻)