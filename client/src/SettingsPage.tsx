// U-621（Q41）：设置页——多栏多项：AI 陪跑 / 游戏 / 存档 / 关于。
// 桌面：左侧栏导航 + 右侧内容（AI 栏内再分两列）；手机：顶部横滑
// 栏签 + 内容纵向堆叠。设置只存本机 localStorage（settings.ts），
// Key 不进存档、不上传存档文件；云端测试经服务端中转透传，本地
// 模型测试由浏览器直连本机地址。
// 控件按类型选：有限选项用原生下拉框（厂商按组 optgroup、模型预设、
// 思考强度、回复上限、摘要详略、主题、字号），开关用 switch，数值
// 用滑块 + 数字输入框双向联动，自由文本才用输入框。散功重开只在
// 本页存档栏（三级确认，见 settings.game.resetTripleConfirm）。

import { useRef, useState } from "react";
import { actionFields } from "./fields";
import type { Actions } from "../../server/src/actions";
import { api } from "./api";
import type { State } from "./types";
import { Seal, ThemeIcon } from "./widgets";
import { AI_GROUPS, AI_PROVIDERS_UI, aiProviderUiById } from "./ai-providers";
import {
DEFAULT_SYSTEM_PROMPT, buildSaveSummary, callLocalAi, exportSettingsJson, importSettingsJson, resolveTheme, useSystemDark,
type AppSettings, type SummaryDetail, type ThinkingLevel,
} from "./settings";

// AI 连接三项输入（Key / 模型名 / 接口地址）的长度限制直接取自
// aiTestConnection 动作的请求 schema，与服务端校验同源、不再手写
// （平台 v29 口径）；这些值仍只存本机设置，限制只是提交口径对齐。
const FIELDS = actionFields<typeof Actions>();

type Section = "ai" | "game" | "save" | "about";
const SECTIONS: { id: Section; icon: string; label: string }[] = [
  { id: "ai", icon: "陪", label: "AI 陪跑" },
  { id: "game", icon: "戏", label: "游戏" },
  { id: "save", icon: "存", label: "存档" },
  { id: "about", icon: "关", label: "关于" },
];

interface TestResult { ok: boolean; lines: string[] }

const CARD = "rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm";
const FIELD = "w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// 开关：布尔项统一用 switch，不再用按钮组或复选框代替。
function Switch({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={onToggle}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? "bg-[var(--accent)]" : "bg-[var(--surface2)]"}`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

// 下拉框：有限选项统一用原生 select（带自定义箭头），选项多时可滚动查找。
function Select<T extends string>({ id, label, hint, value, options, onPick }: {
  id: string; label: string; hint?: string; value: T;
  options: { v: T; label: string }[]; onPick: (v: T) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-bold text-[var(--dim)]">{label}</label>
      <div className="relative">
        <select id={id} value={value} onChange={(e) => onPick(e.target.value as T)}
          className={`${FIELD} appearance-none pr-9 font-medium`}>
          {options.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
        <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--dim)]">▾</span>
      </div>
      {hint && <p className="mt-1 text-[11px] leading-relaxed text-[var(--dim)]">{hint}</p>}
    </div>
  );
}

// 滑块 + 数字输入：拖动粗调、输入精调，两边随时同步。
function SliderNumber({ id, label, hint, value, min, max, step, format, onSet }: {
  id: string; label: string; hint?: string; value: number; min: number; max: number; step: number;
  format?: (v: number) => string; onSet: (v: number) => void;
}) {
  const clamp = (v: number) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-bold text-[var(--dim)]">{label}</label>
      <div className="flex items-center gap-3">
        <input id={id} type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onSet(clamp(Number(e.target.value)))} className="min-w-0 flex-1 accent-[var(--accent)]" />
        <input type="number" min={min} max={max} step={step} value={format ? format(value) : value}
          onChange={(e) => onSet(clamp(Number(e.target.value)))} aria-label={`${label}（数值输入）`}
          className="w-[4.5rem] shrink-0 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-center text-sm font-bold outline-none focus:border-[var(--accent)]" />
      </div>
      {hint && <p className="mt-1 text-[11px] leading-relaxed text-[var(--dim)]">{hint}</p>}
    </div>
  );
}

// 开关行：左文案右开关，游戏栏与 AI 栏共用。
function SwitchRow({ title, desc, checked, onToggle }: { title: string; desc: string; checked: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs font-bold text-[var(--dim)]">{title}<span className="block font-normal">{desc}</span></p>
      <Switch label={title} checked={checked} onToggle={onToggle} />
    </div>
  );
}

export function SettingsPage({ settings, onChange, state, onExportSave, onImportSave, onResetAll, resetting, resetFailed, onClearResetError }: {
  settings: AppSettings;
  onChange: (next: AppSettings) => void;
  state: State | null;
  onExportSave: () => Promise<string>;
  onImportSave: (json: string) => Promise<void>;
  onResetAll: () => void;
  resetting: boolean;
  // 上一次散功调用失败（重试耗尽后）：确认处明示、原地可重试。
  // 与主菜单同一口径（2026-11-20 修复）：确认弹窗成功前不关、
  // 失败不清空已输入的「不后悔」，避免失败被静默吞掉。
  resetFailed: boolean;
  onClearResetError: () => void;
}) {
  const [section, setSection] = useState<Section>("ai");
  // 主题实际生效值：跟随系统时随系统深浅色实时变，设置里明示当前是哪一档。
  const systemDark = useSystemDark();
  const effectiveTheme = resolveTheme(settings.game.theme, systemDark);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [saveMsg, setSaveMsg] = useState("");
  // 散功重开确认流程：0 未开始 → 1 二级确认框 → 2 三级弹窗（输入「不后悔」）。
  // 三级确认被设置项关闭时，二级确认后直接执行。
  const [resetStage, setResetStage] = useState<0 | 1 | 2>(0);
  const [resetPhrase, setResetPhrase] = useState("");
  const [includeKey, setIncludeKey] = useState(false);
  const saveFileRef = useRef<HTMLInputElement>(null);
  const settingsFileRef = useRef<HTMLInputElement>(null);

  const ai = settings.ai;
  const provider = aiProviderUiById(ai.providerId) ?? AI_PROVIDERS_UI[0]!;
  const isLocal = provider.protocol === "local";
  const setAi = (patch: Partial<AppSettings["ai"]>) => onChange({ ...settings, ai: { ...ai, ...patch } });
  const setGame = (patch: Partial<AppSettings["game"]>) => onChange({ ...settings, game: { ...settings.game, ...patch } });

  const pickProvider = (id: string) => {
    const p = aiProviderUiById(id);
    if (!p) return;
    setAi({ providerId: id, baseUrl: p.baseUrl, model: p.defaultModel });
    setTest(null);
  };

  const statusText = !ai.enabled
    ? "未开启：当前由规则引擎 GM 陪跑——系统按既定规则掷骰、结算、记编年史，不连 AI 也能完整游玩。"
    : isLocal
      ? (ai.baseUrl.trim() && ai.model.trim() ? `已开启（本地直连）：${provider.name} · ${ai.model} · ${ai.baseUrl}` : `已开启（本地）：${provider.name}，还差${ai.baseUrl.trim() ? "" : "地址"}${ai.model.trim() ? "" : "模型名"}没填。`)
      : !ai.apiKey.trim()
        ? `已开启：${provider.name}，但还没填 API Key，暂时连不上。`
        : `已开启：${provider.name} · ${ai.model || provider.defaultModel}（填了 Key，点下方「测试连接」验证）。`;

  const runTest = async () => {
    setTesting(true); setTest(null);
    try {
      if (isLocal) {
        const r = await callLocalAi({
          baseUrl: ai.baseUrl, model: ai.model,
          messages: [{ role: "user", content: "ping" }],
          system: "你是连接测试助手。用户发来 ping 时，只回复两个字：在。不要加任何其他内容。",
          temperature: 0, maxTokens: 64,
        });
        setTest({
          ok: r.ok,
          lines: r.ok
            ? [`✓ 直连成功（${r.latencyMs} ms）`, `接口：${r.endpoint}`, `模型回复：「${r.text.slice(0, 120)}」`, "本地模型不走服务端中转：浏览器直接调你本机地址，移植到引擎后由引擎直连。"]
            : [`✕ ${r.error}`, `接口：${r.endpoint}`],
        });
      } else {
        const args: { providerId: string; apiKey: string; model: string; thinking: ThinkingLevel; baseUrl?: string } = {
          providerId: ai.providerId, apiKey: ai.apiKey, model: ai.model || provider.defaultModel, thinking: ai.thinking,
        };
        if (ai.baseUrl.trim()) args.baseUrl = ai.baseUrl.trim();
        const r = await api.aiTestConnection(args);
        setTest({
          ok: r.ok,
          lines: r.ok
            ? [`✓ 连接成功（${r.latencyMs} ms）`, `接口：${r.endpoint}`, `模型回复：「${r.text.slice(0, 120)}」`, `思考强度实际生效：${r.appliedThinking}`, "Key 经服务端中转透传给厂商，服务端不保存。"]
            : [`✕ ${r.error || "连接失败"}`, r.endpoint ? `接口：${r.endpoint}` : "", `思考强度映射：${r.appliedThinking}`].filter(Boolean),
        });
      }
    } catch (e) {
      setTest({ ok: false, lines: [`✕ 测试调用失败：${e instanceof Error ? e.message : String(e)}`] });
    } finally {
      setTesting(false);
    }
  };

  const onSaveFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      await onImportSave(await f.text());
      setSaveMsg("✓ 存档导入成功，首页已切换到导入的进度。");
    } catch (e) {
      setSaveMsg(`✕ ${e instanceof Error ? e.message : "导入失败"}`);
    }
  };
  const onSettingsFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      onChange(importSettingsJson(await f.text()));
      setSaveMsg("✓ 设置导入成功（脱敏导出里的 Key 不会带入，需重新填写）。");
    } catch (e) {
      setSaveMsg(`✕ ${e instanceof Error ? e.message : "设置导入失败"}`);
    }
  };

  return (
    <div className="lg:grid lg:grid-cols-[168px_minmax(0,1fr)] lg:gap-4">
      {/* 栏导航：手机横滑、桌面竖列（粘性跟随） */}
      <div className="-mx-1 mb-3 overflow-x-auto px-1 pb-0.5 lg:mx-0 lg:mb-0 lg:overflow-visible lg:px-0" role="tablist" aria-label="设置分栏">
        <div className="flex min-w-max gap-1.5 lg:sticky lg:top-3 lg:min-w-0 lg:flex-col">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={section === s.id} onClick={() => setSection(s.id)}
              className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-left font-song text-sm font-black lg:rounded-xl ${section === s.id ? "bg-[var(--accent)] text-[var(--on-bright)] shadow-sm" : "border border-[var(--border)] bg-[var(--surface)] text-[var(--dim)]"}`}>
              <Seal ch={s.icon} /> {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-w-0">
        {section === "ai" && (
          <div className="space-y-4">
            <section aria-label="AI 陪跑总开关" className={CARD}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-brush text-base font-black"><Seal ch="陪" /> AI 陪跑</h2>
                  <p className="mt-0.5 text-xs leading-relaxed text-[var(--dim)]">{statusText}</p>
                </div>
                <Switch label="AI 陪跑总开关" checked={ai.enabled} onToggle={() => setAi({ enabled: !ai.enabled })} />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[var(--dim)]">陪跑只做解说、复盘与建议，不直接改动存档（陪跑面板是下一项 U-622，本页先把连接与参数定下来）。默认关闭；关闭时游戏由规则引擎 GM 独立运行，与现在完全一样。</p>
            </section>

            <div className="grid gap-4 md:grid-cols-2">
              {/* 左列：厂商 / Key / 地址 / 模型 */}
              <section aria-label="厂商与密钥" className={CARD}>
                <h3 className="font-song text-sm font-black">连接</h3>
                <div className="mt-3">
                  <label htmlFor="ai-provider" className="mb-1.5 block text-xs font-bold text-[var(--dim)]">厂商</label>
                  <div className="relative">
                    <select id="ai-provider" value={ai.providerId} onChange={(e) => pickProvider(e.target.value)}
                      className={`${FIELD} appearance-none pr-9 font-medium`}>
                      {AI_GROUPS.map((g) => (
                        <optgroup key={g} label={g === "本地模型" ? "本地模型 · 无需 Key · 浏览器直连本机" : g}>
                          {AI_PROVIDERS_UI.filter((p) => p.group === g).map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--dim)]">▾</span>
                  </div>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-[var(--dim)]">{provider.note}</p>

                {!isLocal && (
                  <div className="mt-4">
                    <label htmlFor="ai-key" className="mb-1.5 block text-xs font-bold text-[var(--dim)]">API Key（只存这台设备的浏览器本地，不进存档、不进仓库）</label>
                    <div className="flex gap-1.5">
                      <input id="ai-key" {...FIELDS.aiTestConnection.apiKey} type={showKey ? "text" : "password"} value={ai.apiKey} onChange={(e) => setAi({ apiKey: e.target.value })}
                        placeholder={provider.keyHint || "粘贴你的 API Key"} autoComplete="off"
                        className={`${FIELD} min-w-0 flex-1`} />
                      <button type="button" onClick={() => setShowKey(!showKey)} aria-label={showKey ? "隐藏 API Key" : "显示 API Key"}
                        className="shrink-0 rounded-xl bg-[var(--surface2)] px-3 py-2 text-xs font-bold">{showKey ? "隐藏" : "显示"}</button>
                      {ai.apiKey && <button type="button" onClick={() => setAi({ apiKey: "" })} aria-label="清除 API Key" className="shrink-0 rounded-xl bg-[var(--surface2)] px-3 py-2 text-xs font-bold">清除</button>}
                    </div>
                    {provider.keyUrl && <a href={provider.keyUrl} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-xs font-bold text-[var(--accent)]">去{provider.name}官网获取 Key ↗</a>}
                  </div>
                )}
                {isLocal && (
                  <p className="mt-4 rounded-xl bg-[var(--accent-soft)] p-3 text-xs leading-relaxed">本地模型不需要 API Key：先在你电脑上把本地服务跑起来（Ollama / LM Studio 等），网页会直接连你本机的地址——服务端中转够不到你电脑的 localhost，所以本地档一律浏览器直连；移植到 Godot / Unity 后改由引擎直连同一地址。本地部署不花 API 费用，显卡好可以跑大模型。</p>
                )}

                <div className="mt-4">
                  <label htmlFor="ai-base" className="mb-1.5 block text-xs font-bold text-[var(--dim)]">接口地址（Base URL）{provider.id === "custom" || provider.id === "localcustom" ? " · 必填" : " · 预设可改（如走代理/中转）"}</label>
                  <input id="ai-base" {...FIELDS.aiTestConnection.baseUrl} type="text" value={ai.baseUrl} onChange={(e) => setAi({ baseUrl: e.target.value })}
                    placeholder={isLocal ? "http://localhost:11434/v1" : "https://…/v1"} autoComplete="off"
                    className={FIELD} />
                  {provider.baseUrl && ai.baseUrl !== provider.baseUrl && (
                    <button type="button" onClick={() => setAi({ baseUrl: provider.baseUrl })} className="mt-1.5 text-xs font-bold text-[var(--accent)]">恢复厂商默认地址</button>
                  )}
                </div>

                <div className="mt-4 space-y-3">
                  {provider.models.length > 0 && (
                    <Select id="ai-model-preset" label="预设模型（选中即填入下方模型名）"
                      value={provider.models.includes(ai.model) ? ai.model : ""}
                      options={[{ v: "", label: "— 自定义（在下方输入）—" }, ...provider.models.map((m) => ({ v: m, label: m }))]}
                      onPick={(v) => { if (v) setAi({ model: v }); }} />
                  )}
                  <div>
                    <label htmlFor="ai-model" className="mb-1.5 block text-xs font-bold text-[var(--dim)]">模型名{isLocal ? "（必填：填本机已加载/拉取的模型名）" : "（可从上方预设选，也可直接改名）"}</label>
                    <input id="ai-model" {...FIELDS.aiTestConnection.model} type="text" value={ai.model} onChange={(e) => setAi({ model: e.target.value })}
                      placeholder={isLocal ? "如 qwen3:8b" : provider.defaultModel} autoComplete="off"
                      className={FIELD} />
                  </div>
                </div>
              </section>

              {/* 右列：思考 / 上下文 / 高级 / 测试 */}
              <div className="space-y-4">
                <section aria-label="思考与上下文" className={CARD}>
                  <h3 className="font-song text-sm font-black">思考与上下文</h3>
                  <div className="mt-3 space-y-4">
                    <Select id="ai-thinking" label="思考强度" value={ai.thinking}
                      hint="按当前厂商的参数映射，测试结果会写明实际发了什么。"
                      options={[{ v: "low" as ThinkingLevel, label: "低 · 快而省" }, { v: "medium" as ThinkingLevel, label: "中 · 均衡" }, { v: "high" as ThinkingLevel, label: "高 · 想得深" }]}
                      onPick={(v) => setAi({ thinking: v })} />
                    <SliderNumber id="ai-rounds" label="对话记忆轮数" value={ai.contextRounds} min={0} max={50} step={1}
                      hint="陪跑时带上最近这么多轮对话；0 = 每句都是新话题。"
                      onSet={(v) => setAi({ contextRounds: v })} />
                    <SwitchRow title="发送当前存档摘要给 AI" desc="让陪跑知道你的境界、气血、所在与近况；关闭则只聊你打的字。"
                      checked={ai.sendSummary} onToggle={() => setAi({ sendSummary: !ai.sendSummary })} />
                    {ai.sendSummary && (
                      <>
                        <Select id="ai-summary-detail" label="摘要详略" value={ai.summaryDetail}
                          options={[{ v: "brief" as SummaryDetail, label: "简要" }, { v: "standard" as SummaryDetail, label: "标准" }, { v: "full" as SummaryDetail, label: "详细" }]}
                          onPick={(v) => setAi({ summaryDetail: v })} />
                        <details className="rounded-xl bg-[var(--bg)] p-3">
                          <summary className="cursor-pointer text-xs font-bold text-[var(--dim)]">预览将发送的存档摘要</summary>
                          <pre className="mt-2 whitespace-pre-wrap text-xs leading-relaxed">{buildSaveSummary(state, ai.summaryDetail)}</pre>
                        </details>
                      </>
                    )}
                  </div>
                </section>

                <section aria-label="高级参数" className={CARD}>
                  <h3 className="font-song text-sm font-black">高级</h3>
                  <div className="mt-3 space-y-4">
                    <SliderNumber id="ai-temp" label="温度 Temperature" value={ai.temperature} min={0} max={2} step={0.1}
                      format={(v) => v.toFixed(1)} hint="低则稳重，高则放飞。"
                      onSet={(v) => setAi({ temperature: Math.round(v * 10) / 10 })} />
                    <Select id="ai-max-tokens" label="单次回复上限（max tokens）" value={String(ai.maxTokens)}
                      options={[{ v: "512", label: "512" }, { v: "1024", label: "1024" }, { v: "2048", label: "2048" }, { v: "4096", label: "4096" }]}
                      onPick={(v) => setAi({ maxTokens: Number(v) })} />
                    <SwitchRow title="流式输出" desc="陪跑面板里逐字吐字（U-622 使用）；测试连接不用流式。"
                      checked={ai.stream} onToggle={() => setAi({ stream: !ai.stream })} />
                    <div>
                      <label htmlFor="ai-sys" className="mb-1.5 block text-xs font-bold text-[var(--dim)]">GM 人设（系统提示词）</label>
                      <textarea id="ai-sys" value={ai.systemPrompt} onChange={(e) => setAi({ systemPrompt: e.target.value })} rows={4}
                        className={`${FIELD} leading-relaxed`} />
                      {ai.systemPrompt !== DEFAULT_SYSTEM_PROMPT && (
                        <button type="button" onClick={() => setAi({ systemPrompt: DEFAULT_SYSTEM_PROMPT })} className="mt-1.5 text-xs font-bold text-[var(--accent)]">恢复默认人设</button>
                      )}
                    </div>
                  </div>
                </section>

                <section aria-label="测试连接" className={CARD}>
                  <h3 className="font-song text-sm font-black">测试连接</h3>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--dim)]">{isLocal ? "向本机地址直连发一条 ping，验证本地服务通不通。" : "经服务端中转向厂商发一条 ping，验证 Key、模型与地址是否可用；Key 不会被保存。"}测试会消耗极少量额度（本地模型不花钱）。</p>
                  <button type="button" disabled={testing || !ai.enabled} onClick={runTest}
                    className="mt-3 w-full rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-[var(--on-bright)] transition active:scale-[0.99] disabled:opacity-40">
                    {testing ? "正在连接…" : ai.enabled ? "测试连接" : "先打开上方总开关"}
                  </button>
                  {test && (
                    <div className={`mt-3 rounded-xl p-3 text-xs leading-relaxed ${test.ok ? "bg-[var(--accent-soft)]" : "bg-[var(--gold-soft)]"}`} role="status">
                      {test.lines.map((l, i) => <p key={i} className={i > 0 ? "mt-1" : ""}>{l}</p>)}
                    </div>
                  )}
                </section>
              </div>
            </div>
          </div>
        )}

        {section === "game" && (
          <section aria-label="游戏设置" className={CARD}>
            <h2 className="font-brush text-base font-black"><Seal ch="戏" /> 游戏</h2>
            <div className="mt-3 max-w-md space-y-4">
              <div>
                <span id="game-theme-label" className="mb-1.5 block text-xs font-bold text-[var(--dim)]">主题</span>
                <div className="flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-1" role="radiogroup" aria-labelledby="game-theme-label">
                  {([
                    { v: "system" as const, label: "跟随系统" },
                    { v: "light" as const, label: "浅色" },
                    { v: "dark" as const, label: "深色" },
                  ]).map((o) => {
                    const active = settings.game.theme === o.v;
                    return (
                      <button key={o.v} type="button" role="radio" aria-checked={active}
                        onClick={() => setGame({ theme: o.v })}
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium ${active ? "bg-[var(--ink)] text-[var(--on-ink)]" : "text-[var(--dim)]"}`}>
                        <ThemeIcon kind={o.v} />{o.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--dim)]">{`阴阳 = 跟随系统：按设备深浅色自动切换，系统切换时页面实时跟随。当前实际显示：${effectiveTheme === "dark" ? "深色（月亮）" : "浅色（太阳）"}。右下角悬浮按钮也可快捷切换（点一下循环换档）。`}</p>
              </div>
              <Select id="game-font" label="字号" value={settings.game.fontScale}
                options={[{ v: "small" as const, label: "小" }, { v: "standard" as const, label: "标准" }, { v: "large" as const, label: "大" }, { v: "xlarge" as const, label: "特大" }]}
                onPick={(v) => setGame({ fontScale: v })} />
              <SwitchRow title="界面动画" desc="骰子滚动、卡片淡入、呼吸光环等动效；关闭后全部静止，低端机更流畅。"
                checked={settings.game.animations} onToggle={() => setGame({ animations: !settings.game.animations })} />
              <SwitchRow title="新一世自动回到顶部" desc="轮回开启新一世时自动滚到页面顶部，从新面板开始看。"
                checked={settings.game.autoScrollTop} onToggle={() => setGame({ autoScrollTop: !settings.game.autoScrollTop })} />
              <p className="text-xs leading-relaxed text-[var(--dim)]">玩法规则（境界体系、记忆保留、难度等）不在这里——那是「游戏规则」页的设计树，在这里改的是纯显示与操作偏好，同样只存本机。</p>
            </div>
          </section>
        )}

        {section === "save" && (
          <div className="space-y-4">
            <section aria-label="游戏存档" className={CARD}>
              <h2 className="font-brush text-base font-black"><Seal ch="存" /> 游戏存档</h2>
              <p className="mt-1 text-xs leading-relaxed text-[var(--dim)]">存档存在服务端数据库（单槽位）。导出一份 JSON 自己备份；导入会覆盖当前进度，导入前先导出一份更稳妥。导出文件不含报错记录，也不含任何 API Key（Key 根本不在存档里）。</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={async () => { try { downloadText("lunhui-save.json", await onExportSave()); setSaveMsg("✓ 存档已导出下载。"); } catch (e) { setSaveMsg(`✕ 导出失败：${e instanceof Error ? e.message : String(e)}`); } }}
                  className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-bold text-[var(--on-bright)]">导出存档</button>
                <button type="button" onClick={() => saveFileRef.current?.click()} className="rounded-full bg-[var(--surface2)] px-4 py-2 text-xs font-bold">导入存档（覆盖当前）</button>
                <input ref={saveFileRef} type="file" accept="application/json,.json" className="hidden" aria-label="选择要导入的存档文件"
                  onChange={(e) => { void onSaveFile(e.target.files?.[0]); e.target.value = ""; }} />
              </div>
              <div className="mt-4 border-t border-[var(--border)] pt-3">
                <SwitchRow title="散功三级确认" desc="开启：点按钮 → 确认框 → 弹窗输入「不后悔」三步才执行；关闭：只要一次普通确认。"
                  checked={settings.game.resetTripleConfirm} onToggle={() => setGame({ resetTripleConfirm: !settings.game.resetTripleConfirm })} />
                <div className="mt-3">
                  {resetStage === 1 ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-[var(--red)]">散功重开会清空角色、前世与编年史（报错记录保留），确定？</span>
                      <button type="button" disabled={resetting} onClick={() => {
                        if (settings.game.resetTripleConfirm) { setResetPhrase(""); setResetStage(2); }
                        // 关掉三级确认时直接执行：确认行保持打开直到
                        // 成功（App 跳回主菜单）或失败（行内明示重试）。
                        else onResetAll();
                      }} className="rounded-full bg-[var(--red)] px-3 py-2 text-xs font-bold text-[var(--on-bright)] disabled:opacity-40">{resetting && !settings.game.resetTripleConfirm ? "散功中…" : "确认散功"}</button>
                      <button type="button" disabled={resetting} onClick={() => { setResetStage(0); onClearResetError(); }} className="rounded-full bg-[var(--surface2)] px-3 py-2 text-xs disabled:opacity-40">取消</button>
                      {resetFailed && !settings.game.resetTripleConfirm && (
                        <span className="w-full text-xs font-bold text-[var(--red)]" role="alert">散功没成功，存档还没有清空——多半是网络抖动。再点一次「确认散功」重试。</span>
                      )}
                    </span>
                  ) : (
                    <button type="button" onClick={() => { onClearResetError(); setResetStage(1); }} className="rounded-full bg-[var(--surface2)] px-4 py-2 text-xs font-bold text-[var(--red)]">散功重开（清空存档）</button>
                  )}
                </div>
              </div>
            </section>

            <section aria-label="设置文件" className={CARD}>
              <h2 className="font-brush text-base font-black"><Seal ch="置" /> 设置文件</h2>
              <p className="mt-1 text-xs leading-relaxed text-[var(--dim)]">全部设置（AI 陪跑 + 游戏偏好）是一份带版本号的 JSON，只存本机。导出默认脱敏 Key；打开下方开关的导出文件等于把钥匙写进文件，只适合自己保管、别外发。移植到 Godot / Unity 时，这份 JSON 原样带走。</p>
              <div className="mt-3">
                <SwitchRow title="导出时包含 API Key" desc="慎开：含 Key 的设置文件请只自己保管，不要外发。"
                  checked={includeKey} onToggle={() => setIncludeKey(!includeKey)} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => { downloadText("lunhui-settings.json", exportSettingsJson(settings, includeKey)); setSaveMsg(includeKey ? "✓ 设置已导出（含 Key，注意保管）。" : "✓ 设置已导出（Key 已脱敏）。"); }}
                  className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-bold text-[var(--on-bright)]">导出设置</button>
                <button type="button" onClick={() => settingsFileRef.current?.click()} className="rounded-full bg-[var(--surface2)] px-4 py-2 text-xs font-bold">导入设置</button>
                <input ref={settingsFileRef} type="file" accept="application/json,.json" className="hidden" aria-label="选择要导入的设置文件"
                  onChange={(e) => { void onSettingsFile(e.target.files?.[0]); e.target.value = ""; }} />
              </div>
              <details className="mt-3 rounded-xl bg-[var(--bg)] p-3">
                <summary className="cursor-pointer text-xs font-bold text-[var(--dim)]">查看当前设置 JSON（Key 脱敏）</summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed">{exportSettingsJson(settings, false)}</pre>
              </details>
              {saveMsg && <p className="mt-3 text-xs font-bold" role="status">{saveMsg}</p>}
            </section>
          </div>
        )}

        {section === "about" && (
          <div className="space-y-4">
            <section aria-label="关于本游戏" className={CARD}>
              <h2 className="font-brush text-base font-black"><Seal ch="关" /> 关于</h2>
              <div className="mt-2 space-y-2 text-sm leading-relaxed">
                <p>《不喝孟婆汤》：单人轮回修仙跑团。废灵根凡人开局，死亡即轮回，记忆按规则保留，本命法宝与传承跨世延续。</p>
                <p><b>GM 陪跑已经在跑了</b>：现在陪你掷骰、结算事件、记编年史的就是规则引擎 GM——所有判定（Q34 分系统骰面）与数值都由它按既定规则执行，不需要联网。本页的 AI 陪跑是可选的第二层：接上你自己的大模型后，它在规则引擎之上做解说、复盘与建议，不碰判定与存档。</p>
                <p className="text-xs text-[var(--dim)]">设置配置版本 v1 · AI 预设共 {AI_PROVIDERS_UI.length} 项（本地模型 3 · 云端厂商 18 · 自定义云端入口 1）· 规则定稿 Q1–Q41。</p>
              </div>
            </section>
            <section aria-label="移植说明" className={CARD}>
              <h2 className="font-brush text-base font-black"><Seal ch="移" /> 移植到引擎（TapTap / Steam / WeGame / Epic）</h2>
              <div className="mt-2 space-y-2 text-sm leading-relaxed">
                <p>为上架引擎版做准备，本页的设置按「配置与调用分离」设计：</p>
                <ul className="list-inside list-disc space-y-1 text-xs leading-relaxed text-[var(--dim)]">
                  <li>设置是一份版本化 JSON（上方「存档」栏可导出），Godot / Unity / Unreal 移植时原样带走，只换落盘方式（本地文件）。</li>
                  <li>厂商调用走统一适配器：OpenAI 兼容口一种协议覆盖绝大多数厂商，Claude 走原生 Messages API，MiMo 用 api-key 头，本地模型由客户端直连本机地址——引擎版只需用引擎的 HTTP 层重写这一层，配置与参数映射（思考强度、上下文）不变。</li>
                  <li>API Key 永远只存玩家设备本地：网页版在 localStorage、经服务端中转时只透传不落盘；引擎版存本地配置文件，不进存档、不进仓库。</li>
                  <li>游戏本体（规则引擎 GM、存档 JSON 结构）与 AI 层解耦：不接 AI 时引擎版照常完整运行。</li>
                </ul>
              </div>
            </section>
            <section aria-label="隐私说明" className={CARD}>
              <h2 className="font-brush text-base font-black"><Seal ch="私" /> 隐私与费用</h2>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs leading-relaxed text-[var(--dim)]">
                <li>API Key 只存在你这台设备的浏览器本地存储里；清除浏览器数据即消失，散功重开也不会动它。</li>
                <li>云端调用时，Key 随单次请求经服务端中转透传给厂商，服务端不保存、不记日志；对话内容直达你选的厂商，按厂商的计费与隐私政策执行。</li>
                <li>本地模型全程不出你的电脑：浏览器（或移植后的引擎）直连本机地址，无 API 费用。</li>
                <li>是否发送存档摘要、发多详，都由你在 AI 陪跑栏里控制，预览与实际发送一致。</li>
              </ul>
            </section>
          </div>
        )}
      </div>

      {/* 散功三级确认弹窗：输入「不后悔」后「确认散功」才可点 */}
      {resetStage === 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="散功重开最终确认">
          <div className="w-full max-w-sm rounded-[var(--radius)] bg-[var(--surface)] p-5 shadow-xl">
            <h3 className="font-brush text-base font-black text-[var(--red)]"><Seal ch="戒" /> 最后一步：散功重开</h3>
            <p className="mt-2 text-sm leading-relaxed">散功重开会清空角色、全部前世与编年史（报错记录保留），且<b>无法撤销</b>。真要散功，在下方输入「不后悔」三个字，再点确认。</p>
            <label htmlFor="reset-phrase" className="mb-1.5 mt-4 block text-xs font-bold text-[var(--dim)]">输入「不后悔」以解锁确认</label>
            <input id="reset-phrase" type="text" value={resetPhrase} onChange={(e) => setResetPhrase(e.target.value)}
              placeholder="不后悔" autoComplete="off" autoFocus disabled={resetting}
              className={FIELD} />
            {resetFailed && (
              <p className="mt-3 text-sm font-bold text-[var(--red)]" role="alert">散功没成功，存档还没有清空——多半是刚才网络抖动。输入不用重打，直接再点「确认散功」重试。</p>
            )}
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={resetting || resetPhrase.trim() !== "不后悔"}
                onClick={() => onResetAll()}
                className="flex-1 rounded-full bg-[var(--red)] px-4 py-2.5 text-sm font-bold text-[var(--on-bright)] disabled:opacity-40">{resetting ? "散功中…" : "确认散功"}</button>
              <button type="button" disabled={resetting} onClick={() => { setResetStage(0); setResetPhrase(""); onClearResetError(); }} className="flex-1 rounded-full bg-[var(--surface2)] px-4 py-2.5 text-sm font-bold disabled:opacity-40">取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
