// U-621（Q41）：AI 厂商目录（服务端权威版）与统一调用适配器。
// 18 家预设 + 自定义 OpenAI 兼容入口。调用协议只有三种：
// - openai：OpenAI 兼容 Chat Completions（Bearer 鉴权），绝大多数厂商走这条；
// - anthropic：Claude 原生 Messages API（x-api-key 鉴权）；
// - mimo：小米 MiMo 官方按量付费接口（api.xiaomimimo.com/v1，OpenAI
//   兼容，但鉴权头是 api-key 而非 Authorization Bearer；2026-11-16 核实）。
// 客户端目录（client/src/ai-providers.ts）与此表 id/地址/模型保持一致；
// 思考强度的实际参数映射在本文件 thinkingExtras 一处维护，测试连接与
// 陪跑对话（U-622）共用，返回值带 appliedThinking 明示本次实际发了什么。
// API Key 只在请求里透传给厂商，服务端不落盘、不记日志、不进存档。

export type AiProtocol = "openai" | "anthropic" | "mimo" | "local";
export type ThinkingLevel = "low" | "medium" | "high";

export interface AiProviderDef {
  id: string;
  name: string;
  baseUrl: string;
  protocol: AiProtocol;
  defaultModel: string;
  models: string[];
}

export const AI_PROVIDERS: AiProviderDef[] = [
  { id: "kimi", name: "Kimi · 月之暗面", baseUrl: "https://api.moonshot.cn/v1", protocol: "openai", defaultModel: "moonshot-v1-8k", models: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k", "kimi-k2-0711-preview"] },
  { id: "glm", name: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", protocol: "openai", defaultModel: "glm-4-flash", models: ["glm-4-flash", "glm-4-plus", "glm-4-air", "glm-4.5"] },
  { id: "mimo", name: "小米 MiMo", baseUrl: "https://api.xiaomimimo.com/v1", protocol: "mimo", defaultModel: "mimo-v2.6-flash", models: ["mimo-v2.6-flash"] },
  { id: "qwen", name: "通义千问 Qwen", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", protocol: "openai", defaultModel: "qwen-plus", models: ["qwen-plus", "qwen-turbo", "qwen-max", "qwen3-235b-a22b"] },
  { id: "aliyun", name: "阿里云百炼", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", protocol: "openai", defaultModel: "qwen-max", models: ["qwen-max", "qwen-plus", "deepseek-v3", "deepseek-r1"] },
  { id: "volcano", name: "火山引擎 · 豆包", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", protocol: "openai", defaultModel: "doubao-1-5-lite-32k-250115", models: ["doubao-1-5-lite-32k-250115", "doubao-1-5-pro-32k-250115", "doubao-seed-1-6-250615"] },
  { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", protocol: "openai", defaultModel: "deepseek-chat", models: ["deepseek-chat", "deepseek-reasoner"] },
  { id: "baidu", name: "百度千帆 · 文心", baseUrl: "https://qianfan.baidubce.com/v2", protocol: "openai", defaultModel: "ernie-4.5-turbo-128k", models: ["ernie-4.5-turbo-128k", "ernie-x1-turbo-32k", "ernie-4.0-turbo-8k"] },
  { id: "tencent", name: "腾讯混元", baseUrl: "https://api.hunyuan.cloud.tencent.com/v1", protocol: "openai", defaultModel: "hunyuan-turbos-latest", models: ["hunyuan-turbos-latest", "hunyuan-standard", "hunyuan-lite"] },
  { id: "spark", name: "讯飞星火", baseUrl: "https://spark-api-open.xf-yun.com/v1", protocol: "openai", defaultModel: "generalv3.5", models: ["generalv3.5", "4.0Ultra", "max-32k"] },
  { id: "minimax", name: "MiniMax", baseUrl: "https://api.minimax.chat/v1", protocol: "openai", defaultModel: "MiniMax-Text-01", models: ["MiniMax-Text-01", "MiniMax-M1", "abab6.5s-chat"] },
  { id: "stepfun", name: "阶跃星辰 StepFun", baseUrl: "https://api.stepfun.com/v1", protocol: "openai", defaultModel: "step-1-flash", models: ["step-1-flash", "step-2-16k", "step-1-8k"] },
  { id: "siliconflow", name: "硅基流动 SiliconFlow", baseUrl: "https://api.siliconflow.cn/v1", protocol: "openai", defaultModel: "deepseek-ai/DeepSeek-V3", models: ["deepseek-ai/DeepSeek-V3", "deepseek-ai/DeepSeek-R1", "Qwen/Qwen2.5-72B-Instruct"] },
  { id: "gemini", name: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/", protocol: "openai", defaultModel: "gemini-2.5-flash", models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"] },
  { id: "grok", name: "xAI Grok", baseUrl: "https://api.x.ai/v1", protocol: "openai", defaultModel: "grok-3-mini", models: ["grok-3-mini", "grok-3", "grok-4"] },
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", protocol: "openai", defaultModel: "gpt-4.1-mini", models: ["gpt-4.1-mini", "gpt-4.1", "gpt-5", "o4-mini"] },
  { id: "claude", name: "Anthropic Claude", baseUrl: "https://api.anthropic.com/v1", protocol: "anthropic", defaultModel: "claude-sonnet-4-5", models: ["claude-sonnet-4-5", "claude-haiku-4-5", "claude-opus-4-1"] },
  { id: "openrouter", name: "OpenRouter 聚合", baseUrl: "https://openrouter.ai/api/v1", protocol: "openai", defaultModel: "deepseek/deepseek-chat", models: ["deepseek/deepseek-chat", "openai/gpt-4.1-mini", "anthropic/claude-sonnet-4.5"] },
  // 本地模型（第一类预设）：无需 API Key。注意：这三家只能由玩家设备
  // 直连本机地址——网页版走浏览器直连、移植后引擎直连，服务端中转
  // 够不到玩家本机的 localhost，故 actions 层对 protocol=local 的中转
  // 请求直接拒绝并说明原因（见 actions-ai.ts）。此处的条目只作目录
  // 登记与移植配置的统一 id。
  { id: "ollama", name: "Ollama（本地）", baseUrl: "http://localhost:11434/v1", protocol: "local", defaultModel: "", models: [] },
  { id: "lmstudio", name: "LM Studio（本地）", baseUrl: "http://localhost:1234/v1", protocol: "local", defaultModel: "", models: [] },
  { id: "localcustom", name: "自定义本地地址", baseUrl: "", protocol: "local", defaultModel: "", models: [] },
  { id: "custom", name: "自定义 OpenAI 兼容", baseUrl: "", protocol: "openai", defaultModel: "", models: [] },
];

export function aiProviderById(id: string): AiProviderDef | undefined {
  return AI_PROVIDERS.find((p) => p.id === id);
}

// 思考强度（低/中/高）→ 各家实际参数。只在已知安全的组合上发送参数，
// 其余一律不发、并在 note 里明示「不生效、由模型自身决定」——设置页
// 与测试结果都展示这条 note，不假装全家通用。
export function thinkingExtras(provider: AiProviderDef, level: ThinkingLevel, model: string): { extra: Record<string, unknown>; note: string } {
  if (provider.protocol === "anthropic") {
    const budget = level === "low" ? 1024 : level === "medium" ? 4096 : 16384;
    return { extra: { thinking: { type: "enabled", budget_tokens: budget } }, note: `Claude 原生 thinking：budget_tokens=${budget}（${level === "low" ? "低" : level === "medium" ? "中" : "高"}档）` };
  }
  if (provider.id === "openai" && /^(o\d|gpt-5)/.test(model)) {
    return { extra: { reasoning_effort: level }, note: `OpenAI reasoning_effort=${level}` };
  }
  if (provider.id === "gemini") {
    return { extra: { reasoning_effort: level }, note: `Gemini（OpenAI 兼容口）reasoning_effort=${level}` };
  }
  if (provider.id === "grok" && model === "grok-3-mini") {
    const eff = level === "low" ? "low" : "high";
    return { extra: { reasoning_effort: eff }, note: `Grok 3 Mini 只分两档 reasoning_effort，本档映射为 ${eff}` };
  }
  if ((provider.id === "qwen" || provider.id === "aliyun") && model.startsWith("qwen3")) {
    const on = level !== "low";
    return { extra: { enable_thinking: on }, note: `Qwen3 enable_thinking=${on}（低档关闭思考，中/高档开启；该系列不分更细档位）` };
  }
  if (provider.id === "volcano" && (model.includes("seed-1-6") || model.includes("1-6"))) {
    const t = level === "low" ? "disabled" : "enabled";
    return { extra: { thinking: { type: t } }, note: `豆包 1.6 thinking.type=${t}（低档关闭，中/高档开启）` };
  }
  return { extra: {}, note: "该厂商/模型没有统一的思考强度参数，本档不发送额外参数，思考深度由模型自身决定" };
}

export interface AiChatMessage { role: "system" | "user" | "assistant"; content: string }
export interface AiCallResult {
  ok: boolean; text: string; error: string; latencyMs: number;
  appliedThinking: string; model: string; endpoint: string;
}

function trimBase(base: string): string {
  return base.replace(/\/+$/, "");
}

// 统一调用：按协议组装请求 → fetch（30 秒超时）→ 抽出文本。
// 失败不抛错，返回 ok=false + 厂商原始报错摘要，供设置页明示。
export async function callAiProvider(opts: {
  provider: AiProviderDef; apiKey: string; model: string; baseUrl?: string;
  thinking: ThinkingLevel; messages: AiChatMessage[]; system?: string;
  temperature?: number; maxTokens?: number;
}): Promise<AiCallResult> {
  const started = Date.now();
  const base = trimBase((opts.baseUrl && opts.baseUrl.trim()) || opts.provider.baseUrl);
  const model = opts.model.trim() || opts.provider.defaultModel;
  const { extra, note } = thinkingExtras(opts.provider, opts.thinking, model);
  const fail = (error: string, endpoint: string): AiCallResult => ({
    ok: false, text: "", error, latencyMs: Date.now() - started, appliedThinking: note, model, endpoint,
  });
  if (!base) return fail("尚未填写接口地址（Base URL）", "");
  if (!model) return fail("尚未填写模型名", base);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    let endpoint = "";
    let res: Response;
    if (opts.provider.protocol === "anthropic") {
      endpoint = `${base}/messages`;
      const budget = typeof (extra.thinking as { budget_tokens?: number } | undefined)?.budget_tokens === "number"
        ? (extra.thinking as { budget_tokens: number }).budget_tokens : 0;
      const maxTokens = Math.max(opts.maxTokens ?? 1024, budget + 512);
      const body: Record<string, unknown> = {
        model, max_tokens: maxTokens,
        messages: opts.messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content })),
        ...extra,
      };
      const sys = [opts.system ?? "", ...opts.messages.filter((m) => m.role === "system").map((m) => m.content)].filter(Boolean).join("\n");
      if (sys) body.system = sys;
      if (opts.temperature !== undefined) body.temperature = opts.temperature;
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": opts.apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify(body), signal: ctrl.signal,
      });
    } else {
      endpoint = `${base}/chat/completions`;
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (opts.provider.protocol === "mimo") {
        // MiMo 官方按量付费接口用 api-key 头鉴权（2026-11-16 核实）。
        if (opts.apiKey) headers["api-key"] = opts.apiKey;
      } else if (opts.apiKey) {
        headers.authorization = `Bearer ${opts.apiKey}`;
      }
      const messages = opts.system
        ? [{ role: "system", content: opts.system }, ...opts.messages]
        : opts.messages;
      const body: Record<string, unknown> = {
        model, messages,
        max_tokens: opts.maxTokens ?? 1024,
        ...extra,
      };
      if (opts.temperature !== undefined) body.temperature = opts.temperature;
      res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body), signal: ctrl.signal });
    }
    const rawText = await res.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(rawText); } catch { /* 非 JSON 响应按原文报错 */ }
    if (!res.ok) {
      const detail = rawText.slice(0, 300).replace(/\s+/g, " ").trim();
      return fail(`厂商返回 HTTP ${res.status}${detail ? `：${detail}` : ""}`, endpoint);
    }
    let text = "";
    if (opts.provider.protocol === "anthropic") {
      const blocks = (parsed as { content?: { type?: string; text?: string }[] } | null)?.content ?? [];
      text = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    } else {
      const choice = (parsed as { choices?: { message?: { content?: string } }[] } | null)?.choices?.[0];
      text = choice?.message?.content ?? "";
    }
    if (!text) return fail("厂商返回成功，但没有可读的文本内容（可能模型名不对或响应格式不同）", endpoint);
    return { ok: true, text, error: "", latencyMs: Date.now() - started, appliedThinking: note, model, endpoint };
  } catch (e) {
    const msg = e instanceof Error ? (e.name === "AbortError" ? "请求超时（30 秒未响应）" : e.message) : String(e);
    return fail(`连接失败：${msg}`, base);
  } finally {
    clearTimeout(timer);
  }
}
