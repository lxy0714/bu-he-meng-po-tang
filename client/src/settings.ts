// U-621（Q41）：玩家设置（本地存储）+ 本地模型浏览器直连。
// 设置是一份版本化 JSON（version 字段供移植时迁移），只存玩家本机
// localStorage：API Key 不进游戏存档、不进仓库、不上传——云端调用时
// 只随单次请求经服务端中转透传（服务端不落盘），本地模型则由浏览
// 器直接调本机地址、根本不经过服务端。移植到 Godot/Unity 时这份
// JSON 原样带走，落盘换成本地文件、调用换成引擎的 HTTP 层即可。

import { useEffect, useState } from "react";
import type { State } from "./types";

export type ThinkingLevel = "low" | "medium" | "high";
export type SummaryDetail = "brief" | "standard" | "full";

export interface AiSettings {
  enabled: boolean;
  providerId: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  thinking: ThinkingLevel;
  contextRounds: number;
  sendSummary: boolean;
  summaryDetail: SummaryDetail;
  temperature: number;
  maxTokens: number;
  stream: boolean;
  systemPrompt: string;
}
export interface GameSettings {
  theme: "system" | "light" | "dark";
  fontScale: "small" | "standard" | "large" | "xlarge";
  animations: boolean;
  autoScrollTop: boolean;
  // 散功重开三级确认：默认开启（一级点按钮 → 二级确认框 → 三级弹窗输
  // 「不后悔」再确认）；关闭后只剩一次普通确认。
  resetTripleConfirm: boolean;
}
export interface AppSettings { version: 1; ai: AiSettings; game: GameSettings }

export const DEFAULT_SYSTEM_PROMPT = "你是一位修仙跑团的 GM 陪跑：熟悉轮回、境界与因果。你只做解说、复盘与建议，不替玩家做决定，也不直接改动存档；回答用中文，简洁有仙气，不剧透未解锁的主线。";

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  ai: {
    enabled: false, providerId: "kimi", apiKey: "",
    baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k",
    thinking: "medium", contextRounds: 10, sendSummary: true, summaryDetail: "standard",
    temperature: 0.7, maxTokens: 1024, stream: true, systemPrompt: DEFAULT_SYSTEM_PROMPT,
  },
  game: { theme: "system", fontScale: "standard", animations: true, autoScrollTop: true, resetTripleConfirm: true },
};

const STORAGE_KEY = "lunhui.settings.v1";

function mergeSettings(raw: unknown): AppSettings {
  if (!raw || typeof raw !== "object") return structuredClone(DEFAULT_SETTINGS);
  const r = raw as Partial<AppSettings>;
  return {
    version: 1,
    ai: { ...DEFAULT_SETTINGS.ai, ...(r.ai ?? {}) },
    game: { ...DEFAULT_SETTINGS.game, ...(r.game ?? {}) },
  };
}

export function loadAppSettings(): AppSettings {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (!text) return structuredClone(DEFAULT_SETTINGS);
    return mergeSettings(JSON.parse(text));
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}
export function saveAppSettings(s: AppSettings): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* 存储不可用时静默：设置仍在内存里生效 */ }
}
export function exportSettingsJson(s: AppSettings, includeKey: boolean): string {
  const copy = structuredClone(s);
  if (!includeKey) copy.ai.apiKey = copy.ai.apiKey ? "***" : "";
  return JSON.stringify(copy, null, 2);
}
export function importSettingsJson(text: string): AppSettings {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || !("ai" in parsed)) throw new Error("这份 JSON 不像本游戏的设置（缺少 ai 段）。");
  const merged = mergeSettings(parsed);
  // 导出的脱敏 Key（***）导入时不能当真 Key 用。
  if (merged.ai.apiKey === "***") merged.ai.apiKey = "";
  return merged;
}

export const FONT_ZOOM: Record<GameSettings["fontScale"], number> = { small: 0.92, standard: 1, large: 1.08, xlarge: 1.16 };

// ---------- 主题：跟随系统 / 浅色 / 深色 ----------
// 「跟随系统」不是写死在 CSS 媒体查询里就完事：这里用 matchMedia 监听
// 系统深浅色，系统在页面开着时切换（日落自动变暗、手动切换）会立刻
// 触发重渲染，App 把解析结果挂到 <html data-theme>，全站变量随之换。
export function useSystemDark(): boolean {
  const [dark, setDark] = useState<boolean>(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return dark;
}

// 三档设置 → 实际生效的深/浅。
export function resolveTheme(theme: GameSettings["theme"], systemDark: boolean): "light" | "dark" {
  return theme === "system" ? (systemDark ? "dark" : "light") : theme;
}

// 存档摘要：陪跑对话时按详略拼出的当前存档概况（sendSummary 关闭时
// 不发送）。设置页有同口径预览，玩家看到的与实际发送的一致。
export function buildSaveSummary(state: State | null, detail: SummaryDetail): string {
  const c = state?.character;
  if (!state || !c) return "（当前还没有角色，玩家尚未降生或正处于创建阶段。）";
  const realm = `${state.realmNames[c.realmIdx] ?? ""}·${state.stageNames[c.stageIdx] ?? ""}`;
  const locName = state.locations.find((l) => l.id === c.locationId)?.name ?? c.locationId;
  const lines = [
    `角色：${c.name}，第 ${c.lifeNo} 世，${realm}，${c.age} 岁（寿元 ${c.lifespan}），所在：${locName}。`,
    `气血 ${c.hp}/${c.maxHp}，灵力 ${c.mp}/${c.maxMp}，修为 ${c.cultivation}，灵石 ${c.stones}，业力 ${c.karma}。`,
  ];
  if (detail !== "brief") {
    lines.push(`出身：${c.origin}；灵根：${c.rootName}${c.destinyName ? `；命格：${c.destinyName}` : ""}。四维：战力 ${c.might} / 神识 ${c.sense} / 机缘 ${c.fortune} / 体魄 ${c.body}。`);
    lines.push(`本命法宝：${c.artifactName || "无"}${c.artifactSealed ? "（境界未达门槛，封存中）" : ""}；功法：${c.techniqueName || "无"}；天赋：${c.talentNames.join("、") || "无"}。`);
    lines.push(`主线「前世之谜」：记忆碎片 ${state.mainline.shards}/${state.mainline.total}${state.mainline.done ? "（已全解）" : ""}；已历 ${state.lives.length} 世；传承点 ${c.legacyPoints}，轮回点 ${state.reincarnationPoints}。`);
    if (c.relations.length > 0) lines.push(`人际：${c.relations.map((r) => `${r.name}（${r.kind}，${r.bond}）`).join("、")}。`);
  }
  if (detail === "full") {
    const log = state.log.slice(0, 8).map((l) => l.text).join("\n");
    if (log) lines.push(`近况（编年史最近 8 条）：\n${log}`);
    if (state.fragments.length > 0) lines.push(`前尘残片 ${state.fragments.length} 条。`);
  }
  return lines.join("\n");
}

// ---------- 本地模型：浏览器直连本机地址 ----------
// 服务端中转够不到玩家本机的 localhost，本地三档一律由浏览器直接
// fetch 本机 OpenAI 兼容口（无鉴权头）。失败原因多为本地服务没开、
// 端口不对或浏览器拦截混合内容，报错时把原始信息带出来便于排查。
export interface LocalCallResult { ok: boolean; text: string; error: string; latencyMs: number; endpoint: string }

export async function callLocalAi(opts: {
  baseUrl: string; model: string;
  messages: { role: string; content: string }[];
  system?: string; temperature?: number; maxTokens?: number;
}): Promise<LocalCallResult> {
  const started = Date.now();
  const base = opts.baseUrl.trim().replace(/\/+$/, "");
  const endpoint = `${base}/chat/completions`;
  if (!base) return { ok: false, text: "", error: "尚未填写本地地址", latencyMs: 0, endpoint };
  if (!opts.model.trim()) return { ok: false, text: "", error: "尚未填写模型名（本地模型要填你在本机加载/拉取的模型名）", latencyMs: 0, endpoint };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const messages = opts.system ? [{ role: "system", content: opts.system }, ...opts.messages] : opts.messages;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: opts.model.trim(), messages, max_tokens: opts.maxTokens ?? 1024, ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}) }),
      signal: ctrl.signal,
    });
    const raw = await res.text();
    if (!res.ok) return { ok: false, text: "", error: `本地服务返回 HTTP ${res.status}：${raw.slice(0, 300).replace(/\s+/g, " ").trim()}`, latencyMs: Date.now() - started, endpoint };
    let text = "";
    try {
      const parsed = JSON.parse(raw) as { choices?: { message?: { content?: string } }[] };
      text = parsed.choices?.[0]?.message?.content ?? "";
    } catch { /* 非 JSON 在下方按无内容处理 */ }
    if (!text) return { ok: false, text: "", error: "本地服务返回成功，但没有可读的文本内容（确认模型名与服务模式）", latencyMs: Date.now() - started, endpoint };
    return { ok: true, text, error: "", latencyMs: Date.now() - started, endpoint };
  } catch (e) {
    const msg = e instanceof Error ? (e.name === "AbortError" ? "请求超时（30 秒）" : e.message) : String(e);
    return { ok: false, text: "", error: `直连失败：${msg}。常见原因：本地服务没启动、地址/端口不对，或页面是 https 而本地是 http 被浏览器拦截（移植到引擎后无此问题）。`, latencyMs: Date.now() - started, endpoint };
  } finally {
    clearTimeout(timer);
  }
}
