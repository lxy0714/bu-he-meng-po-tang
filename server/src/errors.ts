// 报错记录 — 与游戏存档分开存放（存储层槽位 "error-logs"，
// saves 表 id=2），供控制面板读取。
// 服务端动作失败与页面报错都记在这里：时间、来源（服务端/页面）、
// 位置（哪个动作 / 哪类页面错误）、错误内容与堆栈详情。
// 上限 200 条，最新在前；记录本身失败绝不反过来拖垮游戏动作。
// U-596：存取走存储抽象层（storage.ts），本文件只管记录的结构、
// 序列化与追加逻辑，存储层只见字符串。

import type { Ctx } from "./platform";
import { ERROR_LOG_SLOT, saveStorageFor } from "./storage";
import { applySaveFieldDefaults } from "./savefields";

export interface ErrorLogEntry {
  id: number;
  time: number; // epoch ms（创建时刻，查看者本地渲染）
  timeText: string; // ISO 时间串
  source: "server" | "client";
  location: string;
  message: string;
  detail: string;
}

interface ErrorStore { seq: number; logs: ErrorLogEntry[] }

const MAX_LOGS = 200;

export async function loadErrorStore(ctx: Ctx): Promise<ErrorStore> {
  const raw = await saveStorageFor(ctx).read(ERROR_LOG_SLOT);
  if (raw === null) return { seq: 0, logs: [] };
  try {
    const parsed = JSON.parse(raw) as ErrorStore;
    if (!parsed || !Array.isArray(parsed.logs)) return { seq: 0, logs: [] };
    // U-598：seq 的缺省补值走存档字段注册表（savefields.ts，缺失时
    // 按已有条数补，与注册前 `?? parsed.logs.length` 一致）。
    applySaveFieldDefaults(ERROR_LOG_SLOT, parsed);
    return { seq: parsed.seq, logs: parsed.logs };
  } catch {
    return { seq: 0, logs: [] };
  }
}

export async function saveErrorStore(ctx: Ctx, store: ErrorStore): Promise<void> {
  await saveStorageFor(ctx).write(ERROR_LOG_SLOT, JSON.stringify(store));
}

export async function appendErrorLog(
  ctx: Ctx,
  input: { source: "server" | "client"; location: string; message: string; detail?: string },
): Promise<ErrorLogEntry> {
  const store = await loadErrorStore(ctx);
  store.seq += 1;
  const now = new Date();
  const entry: ErrorLogEntry = {
    id: store.seq,
    time: now.getTime(),
    timeText: now.toISOString(),
    source: input.source,
    location: (input.location || "未知位置").slice(0, 160),
    message: (input.message || "未知错误").slice(0, 1000),
    detail: (input.detail ?? "").slice(0, 4000),
  };
  store.logs.unshift(entry);
  store.logs = store.logs.slice(0, MAX_LOGS);
  await saveErrorStore(ctx, store);
  return entry;
}

// 记日志失败时静默吞掉：报错记录是旁路，不能让它把原本的动作再搞挂。
export async function appendErrorLogSafe(
  ctx: Ctx,
  input: { source: "server" | "client"; location: string; message: string; detail?: string },
): Promise<void> {
  try {
    await appendErrorLog(ctx, input);
  } catch {
    // ignore — diagnostic path must never break gameplay
  }
}

export function errorToText(e: unknown): { message: string; detail: string } {
  if (e instanceof Error) {
    return { message: e.message || e.name || "未知错误", detail: e.stack ?? "" };
  }
  if (typeof e === "string") return { message: e, detail: "" };
  try {
    return { message: JSON.stringify(e)?.slice(0, 1000) ?? String(e), detail: "" };
  } catch {
    return { message: String(e), detail: "" };
  }
}
