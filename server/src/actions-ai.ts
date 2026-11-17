// U-621（Q41）：AI 中转动作 + 存档导出/导入动作。
// 中转纪律：API Key 只在单次请求里透传给厂商，服务端不落盘、不记
// 志、不进存档（报错记录的 withErrorLogging 只记动作名与错误文本，
// 本文件的失败一律走返回值 ok=false，不抛错，故 Key 不会进日志）。
// 本地模型（protocol=local）不走中转：服务端够不到玩家本机的
// localhost，中转请求直接拒绝并说明——网页版由浏览器直连本机地址，
// 移植到 Godot/Unity 后由引擎直连。

import { defineAction, z } from "./platform";
import { aiProviderById, callAiProvider, type AiChatMessage } from "./ai";
import { loadState, saveState, defaultState } from "./state";
import { stateResponse, toResponse, type StateResponse } from "./respond";
import { saveStorageFor, GAME_SLOT } from "./storage";

const aiResultShape = z.object({
  ok: z.boolean(), text: z.string(), error: z.string(), latencyMs: z.number(),
  appliedThinking: z.string(), model: z.string(), endpoint: z.string(),
});

const aiCallRequest = z.object({
  providerId: z.string().min(1).max(40),
  apiKey: z.string().max(512),
  model: z.string().max(160),
  baseUrl: z.string().max(300).optional(),
  thinking: z.enum(["low", "medium", "high"]),
});

function localRefusal(providerName: string) {
  return {
    ok: false, text: "", latencyMs: 0, model: "", endpoint: "",
    appliedThinking: "本地模型无统一思考强度参数，由本地模型自身决定",
    error: `${providerName}是本地模型：服务端中转够不到你本机的 localhost，这家要在浏览器里直连本机地址测试（设置页的本地档测试就是直连）。`,
  };
}

export const aiActions = {
  aiTestConnection: defineAction({
    description: "AI 陪跑连接测试：用玩家本次请求里带来的厂商、模型与 API Key 向厂商发一条最小对话验证连通；Key 只透传不保存，本地模型不走中转。",
    request: aiCallRequest,
    response: aiResultShape,
    async handler(_ctx, args) {
      const provider = aiProviderById(args.providerId);
      if (!provider) return { ok: false, text: "", error: `未知厂商：${args.providerId}`, latencyMs: 0, appliedThinking: "", model: "", endpoint: "" };
      if (provider.protocol === "local") return localRefusal(provider.name);
      const messages: AiChatMessage[] = [{ role: "user", content: "ping" }];
      return callAiProvider({
        provider, apiKey: args.apiKey, model: args.model,
        ...(args.baseUrl ? { baseUrl: args.baseUrl } : {}),
        thinking: args.thinking, messages,
        system: "你是连接测试助手。用户发来 ping 时，只回复两个字：在。不要加任何其他内容。",
        temperature: 0, maxTokens: 64,
      });
    },
  }),

  aiChat: defineAction({
    description: "AI 陪跑对话中转（供陪跑面板 U-622 调用）：把对话与系统提示透传给玩家选定的厂商并返回回复；Key 只透传不保存，本地模型不走中转。",
    request: z.object({
      ...aiCallRequest.shape,
      system: z.string().max(4000).optional(),
      messages: z.array(z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string().min(1).max(8000) })).min(1).max(100),
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().int().min(16).max(8192).optional(),
    }),
    response: aiResultShape,
    async handler(_ctx, args) {
      const provider = aiProviderById(args.providerId);
      if (!provider) return { ok: false, text: "", error: `未知厂商：${args.providerId}`, latencyMs: 0, appliedThinking: "", model: "", endpoint: "" };
      if (provider.protocol === "local") return localRefusal(provider.name);
      return callAiProvider({
        provider, apiKey: args.apiKey, model: args.model,
        ...(args.baseUrl ? { baseUrl: args.baseUrl } : {}),
        thinking: args.thinking, messages: args.messages,
        ...(args.system ? { system: args.system } : {}),
        ...(args.temperature !== undefined ? { temperature: args.temperature } : {}),
        ...(args.maxTokens !== undefined ? { maxTokens: args.maxTokens } : {}),
      });
    },
  }),

  exportSave: defineAction({
    description: "导出游戏存档：返回存档槽位的原始 JSON 字符串，供设置页下载备份（不含报错记录与任何 API Key）。",
    request: z.object({}),
    response: z.object({ json: z.string(), exportedAt: z.number() }),
    async handler(ctx) {
      const raw = await saveStorageFor(ctx).read(GAME_SLOT);
      return { json: raw ?? JSON.stringify(defaultState()), exportedAt: Date.now() };
    },
  }),

  importSave: defineAction({
    description: "导入游戏存档：校验 JSON 结构后写入存档槽位并按现行规则迁移读入，返回导入后的游戏状态；结构非法时拒绝并说明。",
    request: z.object({ json: z.string().min(2).max(3_000_000) }),
    response: stateResponse,
    async handler(ctx, args): Promise<StateResponse> {
      let parsed: unknown;
      try { parsed = JSON.parse(args.json); } catch { throw new Error("导入失败：文件不是合法的 JSON。"); }
      if (!parsed || typeof parsed !== "object" || !("settings" in parsed) || typeof (parsed as { settings: unknown }).settings !== "object") {
        throw new Error("导入失败：这份 JSON 不像不喝孟婆汤的存档（缺少 settings 段）。");
      }
      await saveStorageFor(ctx).write(GAME_SLOT, JSON.stringify(parsed));
      const state = await loadState(ctx);
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),
};
