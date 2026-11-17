// U-621（Q41）：AI 厂商目录（客户端展示版）——与服务端目录
// （server/src/ai.ts）id / 地址 / 模型保持一致，此处多带分组、Key
// 提示与获取入口等展示字段。共 21 项预设：
// - 本地模型 3 项（第一类预设）：Ollama / LM Studio / 自定义本地地址，
//   无需 API Key，由浏览器直连玩家本机地址（服务端中转够不到本机
//   localhost），不花 API 费用；
// - 云端厂商 18 家：Kimi / GLM / MiMo / 通义千问 / 阿里云百炼 / 火山
//   豆包 / DeepSeek / 百度千帆 / 腾讯混元 / 讯飞星火 / MiniMax / 阶跃
//   星辰 / 硅基流动 / Gemini / Grok / OpenAI / Claude / OpenRouter，
//   外加「自定义 OpenAI 兼容」云端入口 1 项。
// 云端调用经服务端中转透传 Key（不落盘）；协议差异（Claude 原生
// Messages、MiMo 的 api-key 头）由服务端适配器处理。

export type AiGroup = "本地模型" | "国产厂商" | "海外厂商" | "聚合与自定义";
export type AiProtocolUi = "openai" | "anthropic" | "mimo" | "local";

export interface AiProviderUi {
  id: string;
  name: string;
  group: AiGroup;
  baseUrl: string;
  protocol: AiProtocolUi;
  defaultModel: string;
  models: string[];
  keyHint: string;
  keyUrl?: string;
  note: string;
}

export const AI_PROVIDERS_UI: AiProviderUi[] = [
  // ---------- 本地模型（无需 Key，浏览器直连本机） ----------
  { id: "ollama", name: "Ollama", group: "本地模型", baseUrl: "http://localhost:11434/v1", protocol: "local", defaultModel: "", models: [], keyHint: "", note: "本机跑 Ollama 后直连，模型名填你在 Ollama 里拉好的（如 qwen3:8b、llama3.1:8b）。本地部署不花 API 费用，显卡好可以跑大模型。" },
  { id: "lmstudio", name: "LM Studio", group: "本地模型", baseUrl: "http://localhost:1234/v1", protocol: "local", defaultModel: "", models: [], keyHint: "", note: "在 LM Studio 里加载模型并启动 Local Server 后直连，模型名填 LM Studio 里显示的模型 id。本地部署不花 API 费用，显卡好可以跑大模型。" },
  { id: "localcustom", name: "自定义本地地址", group: "本地模型", baseUrl: "", protocol: "local", defaultModel: "", models: [], keyHint: "", note: "任何跑在本机的 OpenAI 兼容服务（如 llama.cpp server、vLLM 本地口）：填地址与模型名即可，无需 Key。本地部署不花 API 费用。" },
  // ---------- 国产厂商 ----------
  { id: "kimi", name: "Kimi · 月之暗面", group: "国产厂商", baseUrl: "https://api.moonshot.cn/v1", protocol: "openai", defaultModel: "moonshot-v1-8k", models: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k", "kimi-k2-0711-preview"], keyHint: "sk-…", keyUrl: "https://platform.moonshot.cn/console/api-keys", note: "Moonshot 开放平台的 Key。" },
  { id: "glm", name: "智谱 GLM", group: "国产厂商", baseUrl: "https://open.bigmodel.cn/api/paas/v4", protocol: "openai", defaultModel: "glm-4-flash", models: ["glm-4-flash", "glm-4-plus", "glm-4-air", "glm-4.5"], keyHint: "id.secret 形式", keyUrl: "https://open.bigmodel.cn/usercenter/apikeys", note: "智谱开放平台的 API Key（id 与 secret 以点号连在一起的那串）。" },
  { id: "mimo", name: "小米 MiMo", group: "国产厂商", baseUrl: "https://api.xiaomimimo.com/v1", protocol: "mimo", defaultModel: "mimo-v2.6-flash", models: ["mimo-v2.6-flash"], keyHint: "api-key", note: "MiMo 官方按量付费接口：OpenAI 兼容，但鉴权用 api-key 头（适配器已处理）。" },
  { id: "qwen", name: "通义千问 Qwen", group: "国产厂商", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", protocol: "openai", defaultModel: "qwen-plus", models: ["qwen-plus", "qwen-turbo", "qwen-max", "qwen3-235b-a22b"], keyHint: "sk-…", keyUrl: "https://bailian.console.aliyun.com/?apiKey=1#/api-key", note: "阿里云百炼的 Key，走 DashScope 的 OpenAI 兼容口。" },
  { id: "aliyun", name: "阿里云百炼", group: "国产厂商", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", protocol: "openai", defaultModel: "qwen-max", models: ["qwen-max", "qwen-plus", "deepseek-v3", "deepseek-r1"], keyHint: "sk-…", keyUrl: "https://bailian.console.aliyun.com/?apiKey=1#/api-key", note: "与通义千问是同一把百炼 Key：千问那项只列自家模型，这项是百炼平台口径，可调平台上架的第三方模型（如 DeepSeek）。" },
  { id: "volcano", name: "火山引擎 · 豆包", group: "国产厂商", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", protocol: "openai", defaultModel: "doubao-1-5-lite-32k-250115", models: ["doubao-1-5-lite-32k-250115", "doubao-1-5-pro-32k-250115", "doubao-seed-1-6-250615"], keyHint: "方舟 API Key", keyUrl: "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey", note: "火山方舟的 Key；模型也可以填你在方舟建的推理接入点 ID（ep-…）。" },
  { id: "deepseek", name: "DeepSeek", group: "国产厂商", baseUrl: "https://api.deepseek.com/v1", protocol: "openai", defaultModel: "deepseek-chat", models: ["deepseek-chat", "deepseek-reasoner"], keyHint: "sk-…", keyUrl: "https://platform.deepseek.com/api_keys", note: "deepseek-chat 是 V 系列对话模型，deepseek-reasoner 是 R 系列推理模型。" },
  { id: "baidu", name: "百度千帆 · 文心", group: "国产厂商", baseUrl: "https://qianfan.baidubce.com/v2", protocol: "openai", defaultModel: "ernie-4.5-turbo-128k", models: ["ernie-4.5-turbo-128k", "ernie-x1-turbo-32k", "ernie-4.0-turbo-8k"], keyHint: "bce-v3/…", note: "千帆平台 v2 的 API Key（控制台「应用接入」里创建）。" },
  { id: "tencent", name: "腾讯混元", group: "国产厂商", baseUrl: "https://api.hunyuan.cloud.tencent.com/v1", protocol: "openai", defaultModel: "hunyuan-turbos-latest", models: ["hunyuan-turbos-latest", "hunyuan-standard", "hunyuan-lite"], keyHint: "sk-…", note: "混元大模型 API 的 Key（腾讯云控制台开通后创建）。" },
  { id: "spark", name: "讯飞星火", group: "国产厂商", baseUrl: "https://spark-api-open.xf-yun.com/v1", protocol: "openai", defaultModel: "generalv3.5", models: ["generalv3.5", "4.0Ultra", "max-32k"], keyHint: "APIKey:APISecret", note: "星火的 Key 填「APIKey:APISecret」两段以冒号拼接（讯飞开放平台应用里查看）。" },
  { id: "minimax", name: "MiniMax", group: "国产厂商", baseUrl: "https://api.minimax.chat/v1", protocol: "openai", defaultModel: "MiniMax-Text-01", models: ["MiniMax-Text-01", "MiniMax-M1", "abab6.5s-chat"], keyHint: "eyJ…", note: "MiniMax 开放平台的 API Key。" },
  { id: "stepfun", name: "阶跃星辰 StepFun", group: "国产厂商", baseUrl: "https://api.stepfun.com/v1", protocol: "openai", defaultModel: "step-1-flash", models: ["step-1-flash", "step-2-16k", "step-1-8k"], keyHint: "sk-…", note: "阶跃星辰开放平台的 Key。" },
  { id: "siliconflow", name: "硅基流动 SiliconFlow", group: "国产厂商", baseUrl: "https://api.siliconflow.cn/v1", protocol: "openai", defaultModel: "deepseek-ai/DeepSeek-V3", models: ["deepseek-ai/DeepSeek-V3", "deepseek-ai/DeepSeek-R1", "Qwen/Qwen2.5-72B-Instruct"], keyHint: "sk-…", keyUrl: "https://cloud.siliconflow.cn/account/ak", note: "聚合平台：一把 Key 调多家开源模型，模型名带厂商前缀（平台模型广场可查全单）。" },
  // ---------- 海外厂商 ----------
  { id: "gemini", name: "Google Gemini", group: "海外厂商", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/", protocol: "openai", defaultModel: "gemini-2.5-flash", models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"], keyHint: "AIza…", keyUrl: "https://aistudio.google.com/apikey", note: "走 Gemini 的 OpenAI 兼容口；注意 Gemini API 与 Google AI Pro 会员是两回事，API 需单独开通计费。" },
  { id: "grok", name: "xAI Grok", group: "海外厂商", baseUrl: "https://api.x.ai/v1", protocol: "openai", defaultModel: "grok-3-mini", models: ["grok-3-mini", "grok-3", "grok-4"], keyHint: "xai-…", keyUrl: "https://console.x.ai/team/default/api-keys", note: "xAI 控制台的 API Key。" },
  { id: "openai", name: "OpenAI", group: "海外厂商", baseUrl: "https://api.openai.com/v1", protocol: "openai", defaultModel: "gpt-4.1-mini", models: ["gpt-4.1-mini", "gpt-4.1", "gpt-5", "o4-mini"], keyHint: "sk-…", keyUrl: "https://platform.openai.com/api-keys", note: "OpenAI 平台的 API Key（与 ChatGPT 订阅分开计费）。" },
  { id: "claude", name: "Anthropic Claude", group: "海外厂商", baseUrl: "https://api.anthropic.com/v1", protocol: "anthropic", defaultModel: "claude-sonnet-4-5", models: ["claude-sonnet-4-5", "claude-haiku-4-5", "claude-opus-4-1"], keyHint: "sk-ant-…", keyUrl: "https://console.anthropic.com/settings/keys", note: "唯一不走 OpenAI 兼容口的：适配器走 Claude 原生 Messages API，思考强度映射为 thinking 预算。" },
  // ---------- 聚合与自定义 ----------
  { id: "openrouter", name: "OpenRouter 聚合", group: "聚合与自定义", baseUrl: "https://openrouter.ai/api/v1", protocol: "openai", defaultModel: "deepseek/deepseek-chat", models: ["deepseek/deepseek-chat", "openai/gpt-4.1-mini", "anthropic/claude-sonnet-4.5"], keyHint: "sk-or-…", keyUrl: "https://openrouter.ai/settings/keys", note: "一把 Key 路由到各家模型，模型名带厂商前缀；适合一家家试。" },
  { id: "custom", name: "自定义 OpenAI 兼容", group: "聚合与自定义", baseUrl: "", protocol: "openai", defaultModel: "", models: [], keyHint: "sk-…", note: "任何 OpenAI 兼容的云端接口（中转站、自建网关等）：自己填地址、模型与 Key，经服务端中转调用。" },
];

export function aiProviderUiById(id: string): AiProviderUi | undefined {
  return AI_PROVIDERS_UI.find((p) => p.id === id);
}
export const AI_GROUPS: AiGroup[] = ["本地模型", "国产厂商", "海外厂商", "聚合与自定义"];
