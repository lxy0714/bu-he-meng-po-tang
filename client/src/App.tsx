// 应用外壳：查询/变更接线与视图切换。各视图在独立文件里。

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaTopScrim } from "./platform-client";
import { api } from "./api";
import type { ActKind, CommissionKind, DrawField, EconomyKind, PointsAttr, SectKind, SettingKey, SocialKind, State, TimedEventKind } from "./types";
import { TREE } from "./tree-data";
import { GameRules } from "./GameRules";
import { MainMenu } from "./MainMenu";
import { Creation } from "./Creation";
import { GameBoard } from "./GameBoard";
import { Encyclopedia } from "./Encyclopedia";
import { SettingsPage } from "./SettingsPage";
import { Seal, ThemeIcon } from "./widgets";
import { FONT_ZOOM, loadAppSettings, resolveTheme, saveAppSettings, useSystemDark, type AppSettings } from "./settings";

// ---------- 页面报错回传 ----------
// 同一条报错 3 秒内只记一次，避免错误风暴把记录刷满。回传走裸 api 调用
// （不经 React Query），它自己失败时静默——记录链路不能连环报错。
// 桥接失败（Spaces bridge request failed）是宿主桥的临时抖动，不是游戏
// 本身的故障：game-state 读取会自动重试（见下方 stateQ），这类失败一律
// 不记为页面报错，免得控制面板被临时抖动刷满。
function isBridgeFailure(text: string): boolean {
  return text.includes("Spaces bridge request failed");
}
let lastReportKey = "";
let lastReportAt = 0;
function reportPageError(location: string, message: string, detail = "", onDone?: () => void) {
  if (isBridgeFailure(message) || isBridgeFailure(detail)) return;
  const key = `${location}|${message}`;
  const now = Date.now();
  if (key === lastReportKey && now - lastReportAt < 3000) return;
  lastReportKey = key;
  lastReportAt = now;
  const args: { location: string; message: string; detail?: string } = {
    location: location.slice(0, 160) || "页面未知位置",
    message: (message || "未知错误").slice(0, 1000),
  };
  if (detail) args.detail = detail.slice(0, 4000);
  api.reportClientError(args).then(() => onDone?.()).catch(() => { /* 记录失败静默 */ });
}
function errText(e: unknown): { message: string; detail: string } {
  if (e instanceof Error) return { message: e.message || e.name, detail: e.stack ?? "" };
  return { message: String(e), detail: "" };
}

// ---------- app shell ----------

export function App() {
  const queryClient = useQueryClient();
  // U-624：打开游戏先停在主菜单（"menu"），从菜单进各页。
  // U-625：点新游戏先进规则设定页（"setup"，可改、默认推荐值），
  // 确认锁定后才进创建（"game"）；游戏规则页（"rules"）从菜单与
  // 底部导航进入均为只读——本局规则已锁定，服务端同步拒绝修改。
  const [view, setView] = useState<"menu" | "setup" | "game" | "rules" | "encyclopedia" | "settings">("menu");
  // 导航门控（2026-11-16 用户反馈修复）：底部导航是「游戏内」导航，
  // 只在真正进了游戏才出现——置 true 的入口只有两个：主菜单「继续
  // 游戏」直达、或新游戏在规则设定页确认锁定后进创建；「返回主菜单」
  // 时清零。从主菜单进的设置/规则/百科是菜单层页面：不挂底部导航，
  // 只能用页首「返回主菜单」离开。此前设置页（从菜单进入）带着底部
  // 导航，点「首页」就绕过新游戏流程（规则设定 → 确认锁定）直接
  // 进了游戏，没存档时尤其明显；百科（从设定页「查看完整百科」
  // 进入）同理。规则设定页（setup）也因此只许从主菜单「新游戏」
  // 进入：游戏内任何入口都到不了它，游戏内「游戏规则」恒为只读页。
  const [enteredGame, setEnteredGame] = useState(false);
  // U-621 玩家设置（本机 localStorage）：AI 陪跑连接、主题/字号/动画等
  // 显示偏好。只存本机、不进存档；修改即落盘并即时应用到外壳。
  const [appSettings, setAppSettings] = useState<AppSettings>(() => loadAppSettings());
  const updateSettings = useCallback((next: AppSettings) => { setAppSettings(next); saveAppSettings(next); }, []);
  // game-state 读取对桥接失败自动重试：桥接抖动时多试几次（最多 6 次，
  // 退避 0.6s→12s 封顶），期间一直停留在「正在展开命盘…」，不闪报错；
  // 非桥接的真实错误只按常规重试 2 次后才走失败态。
  const stateQ = useQuery({
    queryKey: ["game-state"],
    queryFn: () => api.getState({}),
    retry: (failureCount, error) => (isBridgeFailure(error instanceof Error ? error.message : String(error)) ? failureCount < 6 : failureCount < 2),
    retryDelay: (attempt) => Math.min(600 * 2 ** attempt, 12000),
  });
  // 页面报错捕获：运行时错误、未处理 Promise 拒绝，以及 React Query 里
  // 数据读取/动作调用失败，统统回传记进报错记录（独立控制面板可查）。
  useEffect(() => {
    const refreshLogs = () => { void queryClient.invalidateQueries({ queryKey: ["error-logs"] }); };
    const onWindowError = (ev: ErrorEvent) => {
      const detail = ev.error instanceof Error ? (ev.error.stack ?? "") : `${ev.filename || ""}:${ev.lineno}:${ev.colno}`;
      reportPageError("页面运行时错误", ev.message || "未知运行时错误", detail, refreshLogs);
    };
    const onRejection = (ev: PromiseRejectionEvent) => {
      const t = errText(ev.reason);
      reportPageError("页面未处理 Promise 拒绝", t.message, t.detail, refreshLogs);
    };
    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onRejection);

    const unsubMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type !== "updated" || event.mutation.state.status !== "error" || !event.mutation.state.error) return;
      // 控制面板自身的清空/测试动作失败不重复记（面板上会直接显示失败态）。
      const fnText = String(event.mutation.options.mutationFn ?? "");
      if (fnText.includes("clearErrorLogs") || fnText.includes("reportClientError")) return;
      const t = errText(event.mutation.state.error);
      let vars = "";
      try { vars = JSON.stringify(event.mutation.state.variables)?.slice(0, 500) ?? ""; } catch { vars = ""; }
      reportPageError("页面动作调用失败", t.message, [vars ? `调用参数：${vars}` : "", t.detail].filter(Boolean).join("\n"), refreshLogs);
    });
    const unsubQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.query.state.status !== "error" || !event.query.state.error) return;
      const key = event.query.queryKey.join("/");
      if (key === "error-logs") return; // 报错记录本身读失败不再套娃
      const t = errText(event.query.state.error);
      reportPageError(`页面数据读取失败 · ${key}`, t.message, t.detail, refreshLogs);
    });
    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onRejection);
      unsubMutations();
      unsubQueries();
    };
  }, [queryClient]);

  const apply = (data: State) => queryClient.setQueryData(["game-state"], data);
  const settingM = useMutation({ mutationFn: (a: { key: SettingKey; value: string }) => api.setSetting(a), onSuccess: apply });
  const createM = useMutation({ mutationFn: (a: { name?: string; artifactId?: string }) => api.createCharacter(a), onSuccess: apply });
  const drawM = useMutation({ mutationFn: () => api.drawStart({}), onSuccess: apply });
  // 降生抽选是纯选择状态（候选池已在本地 state 里）：乐观更新，点击瞬间就切换，
  // 不等服务端往返；服务端返回后以其结果为准，失败回滚到点击前。
  const choiceM = useMutation({
    mutationFn: (a: { field: DrawField; random: boolean; value?: string }) => api.setBirthChoice(a),
    onMutate: async (a) => {
      await queryClient.cancelQueries({ queryKey: ["game-state"] });
      const prev = queryClient.getQueryData<State>(["game-state"]);
      const draw = prev?.birthDraw;
      if (prev && draw) {
        const choice = draw[a.field];
        const nextChoice = a.random
          ? { ...choice, random: true, value: choice.pool[Math.floor(Math.random() * choice.pool.length)] ?? choice.value }
          : a.value && choice.pool.includes(a.value)
            ? { ...choice, random: false, value: a.value }
            : choice;
        if (nextChoice !== choice) {
          const nextDraw = { ...draw };
          nextDraw[a.field] = nextChoice;
          queryClient.setQueryData<State>(["game-state"], { ...prev, birthDraw: nextDraw });
        }
      }
      return { prev };
    },
    onError: (_err, _a, context) => { if (context?.prev) queryClient.setQueryData(["game-state"], context.prev); },
    onSuccess: apply,
  });
  const drawTalentsM = useMutation({
    mutationFn: (ids: string[]) => api.setDrawTalents({ talentIds: ids }),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: ["game-state"] });
      const prev = queryClient.getQueryData<State>(["game-state"]);
      const draw = prev?.birthDraw;
      if (prev && draw) {
        const chosen = ids.filter((id) => draw.talentChoices.some((t) => t.id === id)).slice(0, 1);
        queryClient.setQueryData<State>(["game-state"], { ...prev, birthDraw: { ...draw, chosenTalents: chosen } });
      }
      return { prev };
    },
    onError: (_err, _ids, context) => { if (context?.prev) queryClient.setQueryData(["game-state"], context.prev); },
    onSuccess: apply,
  });
  const sectM = useMutation({ mutationFn: (kind: SectKind) => api.sect({ kind }), onSuccess: apply });
  const planM = useMutation({ mutationFn: (steps: { kind: ActKind; count: number }[]) => api.setQuickPlan({ steps: steps as { kind: "cultivate" | "rest" | "alchemy" | "forge" | "farm" | "fish"; count: number }[] }), onSuccess: apply });
  const runPlanM = useMutation({ mutationFn: () => api.runQuickPlan({}), onSuccess: apply });
  const clearPlanM = useMutation({ mutationFn: () => api.clearQuickPlan({}), onSuccess: apply });
  const actM = useMutation({ mutationFn: (kind: ActKind) => api.act({ kind }), onSuccess: apply });
  const chooseM = useMutation({ mutationFn: (idx: number) => api.chooseOption({ optionIdx: idx }), onSuccess: apply });
  const routeM = useMutation({ mutationFn: (idx: number) => api.chooseRouteNode({ nodeIdx: idx }), onSuccess: apply });
  const abandonRouteM = useMutation({ mutationFn: () => api.abandonRoute({}), onSuccess: apply });
  const travelM = useMutation({ mutationFn: (id: string) => api.travel({ locationId: id }), onSuccess: apply });
  const buryM = useMutation({ mutationFn: (id: string) => api.buryTreasure({ treasureId: id }), onSuccess: apply });
  const jadeM = useMutation({ mutationFn: () => api.sacrificeJade({}), onSuccess: apply });
  const prepareM = useMutation({ mutationFn: () => api.prepareReincarnation({}), onSuccess: apply });
  const allocateM = useMutation({ mutationFn: (a: { attr: PointsAttr; delta: number }) => api.allocatePoints(a), onSuccess: apply });
  const buyBoonM = useMutation({ mutationFn: (boonId: string) => api.buyBirthBoon({ boonId }), onSuccess: apply });
  const resetDrawM = useMutation({ mutationFn: () => api.resetDrawWithPoints({}), onSuccess: apply });
  const keepsakeM = useMutation({ mutationFn: (a: { kind: "artifact" | "technique" | "treasure"; id: string; locationId?: string }) => api.selectKeepsake(a), onSuccess: apply });
  const reincM = useMutation({ mutationFn: (name: string) => api.reincarnate(name ? { name } : {}), onSuccess: apply });
  const fightM = useMutation({ mutationFn: (id: string) => api.fight({ enemyId: id }), onSuccess: apply });
  const economyM = useMutation({ mutationFn: (kind: EconomyKind) => api.economy({ kind }), onSuccess: apply });
  const socialM = useMutation({ mutationFn: (a: { kind: SocialKind; relationId?: string }) => api.social(a.relationId ? { kind: a.kind, relationId: a.relationId } : { kind: a.kind }), onSuccess: apply });
  const forgeM = useMutation({ mutationFn: (tier: number) => api.forgeArtifact({ tier }), onSuccess: apply });
  const buyOreM = useMutation({ mutationFn: (tier: number) => api.buyOre({ tier }), onSuccess: apply });
  const commissionM = useMutation({ mutationFn: (a: { kind: CommissionKind; commissionId: string }) => api.commission(a), onSuccess: apply });
  const timedM = useMutation({ mutationFn: (a: { kind: TimedEventKind; timedId: string }) => api.timedEvent(a), onSuccess: apply });
  const resetM = useMutation({ mutationFn: () => api.resetAll({}), onSuccess: apply });
  // 创建角色不做保存：尚无角色、无前世（第一世创建未完成）时离开
  // 创建 = 放弃这次降生——服务端作废残留的降生抽选并解锁规则，
  // 退出就当退出了。已有角色/前世的进行中存档不受影响。
  const abandonM = useMutation({ mutationFn: () => api.abandonCreation({}), onSuccess: apply });
  const abandonMutate = abandonM.mutate;
  const abandonIfUnfinishedCreation = useCallback(() => {
    const s = queryClient.getQueryData<State>(["game-state"]);
    if (s && !s.character && s.lives.length === 0 && (s.birthDraw || s.rulesLocked)) abandonMutate();
  }, [queryClient, abandonMutate]);
  // U-625：规则设定页确认——服务端锁定本局规则后进创建。
  const lockRulesM = useMutation({
    mutationFn: () => api.confirmRules({}),
    onSuccess: (data) => { apply(data); setEnteredGame(true); setView("game"); },
  });
  // U-625：设定页一键恢复全部推荐——逐条顺序调用 setSetting（每次
  // 都以服务端返回的最新状态为准，避免并发写互相覆盖），最后一份
  // 响应即全部恢复后的状态。
  const [restoringAll, setRestoringAll] = useState(false);
  const restoreAllRecommended = useCallback(async () => {
    const cur = queryClient.getQueryData<State>(["game-state"]);
    if (!cur || restoringAll) return;
    setRestoringAll(true);
    try {
      let latest: State = cur;
      for (const n of TREE) {
        const rec = n.options.find((o) => o.recommended)?.value;
        if (rec !== undefined && latest.settings[n.key].value !== rec) {
          latest = await api.setSetting({ key: n.key, value: rec });
        }
      }
      apply(latest);
    } catch { /* 失败走全局报错回传；已恢复的条目以服务端为准，下次读取对齐 */ }
    setRestoringAll(false);
  }, [queryClient, restoringAll]);
  const busy = settingM.isPending || createM.isPending || actM.isPending || chooseM.isPending || routeM.isPending || abandonRouteM.isPending || travelM.isPending || reincM.isPending || prepareM.isPending || allocateM.isPending || buyBoonM.isPending || resetDrawM.isPending || keepsakeM.isPending || buryM.isPending || jadeM.isPending || choiceM.isPending || drawTalentsM.isPending || sectM.isPending || planM.isPending || runPlanM.isPending || clearPlanM.isPending || fightM.isPending || economyM.isPending || socialM.isPending || commissionM.isPending || timedM.isPending || forgeM.isPending || buyOreM.isPending;
  const pendingKey: string | null =
    actM.isPending ? `act:${actM.variables}` :
    chooseM.isPending ? `choose:${chooseM.variables}` :
    routeM.isPending ? `route:${routeM.variables}` :
    travelM.isPending ? `travel:${travelM.variables}` :
    fightM.isPending ? `fight:${fightM.variables}` :
    economyM.isPending ? `eco:${economyM.variables}` :
    socialM.isPending ? `social:${socialM.variables.kind}:${socialM.variables.relationId ?? ""}` :
    commissionM.isPending ? `commission:${commissionM.variables.kind}:${commissionM.variables.commissionId}` :
    forgeM.isPending ? `forge:${forgeM.variables}` :
    buyOreM.isPending ? `buyore:${buyOreM.variables}` :
    timedM.isPending ? `timed:${timedM.variables.kind}:${timedM.variables.timedId}` :
    planM.isPending || runPlanM.isPending ? "plan" : null;

  const onChoice = (field: DrawField, random: boolean, value?: string) => choiceM.mutate({ field, random, value });
  const onTalents = (ids: string[]) => drawTalentsM.mutate(ids);

  // 传给子视图 effect 的回调必须身份稳定：内联箭头每次渲染都是新函数，
  // 曾让轮回面板的自动结算 effect 随渲染反复重发 prepare、触发 React
  // #185 更新循环。mutate 本身身份稳定，包一层 useCallback 即可。
  const prepareMutate = prepareM.mutate;
  const onPrepareStable = useCallback(() => prepareMutate(), [prepareMutate]);
  const drawMutate = drawM.mutate;
  const onDrawStable = useCallback(() => drawMutate(), [drawMutate]);

  const state = stateQ.data;
  const boardProps = state ? {
    state, busy, pendingKey,
    onAct: (k: ActKind) => actM.mutate(k), onChoose: (i: number) => chooseM.mutate(i),
    onChooseRouteNode: (i: number) => routeM.mutate(i), onAbandonRoute: () => abandonRouteM.mutate(),
    onTravel: (id: string) => travelM.mutate(id), onBury: (id: string) => buryM.mutate(id), onJade: () => jadeM.mutate(),
    onPrepare: onPrepareStable, prepareFailed: prepareM.isError,
    onAllocatePoints: (attr: PointsAttr, delta: number) => allocateM.mutate({ attr, delta }),
    onBuyBoon: (boonId: string) => buyBoonM.mutate(boonId),
    onResetDraw: () => resetDrawM.mutate(),
    onKeepsake: (kind: "artifact" | "technique" | "treasure", id: string, locationId?: string) => keepsakeM.mutate({ kind, id, locationId }),
    onReincarnate: (name: string) => reincM.mutate(name),
    onDraw: onDrawStable, drawing: drawM.isPending, onChoice, onTalents,
    onSect: (kind: SectKind) => sectM.mutate(kind),
    onSetPlan: (steps: { kind: ActKind; count: number }[]) => planM.mutate(steps),
    onRunPlan: () => runPlanM.mutate(),
    onClearPlan: () => clearPlanM.mutate(),
    onFight: (id: string) => fightM.mutate(id),
    onEconomy: (kind: EconomyKind) => economyM.mutate(kind),
    onSocial: (kind: SocialKind, relationId?: string) => socialM.mutate(relationId ? { kind, relationId } : { kind }),
    onForgeArtifact: (tier: number) => forgeM.mutate(tier),
    onBuyOre: (tier: number) => buyOreM.mutate(tier),
    onCommission: (kind: CommissionKind, commissionId: string) => commissionM.mutate({ kind, commissionId }),
    onTimedEvent: (kind: TimedEventKind, timedId: string) => timedM.mutate({ kind, timedId }),
  } : null;
  const settledCount = state ? TREE.filter((n) => state.settings[n.key].confirmed).length : 0;

  // 新一世开启（或角色初次降生）时回到顶部，从新一世的面板开始看
  //（U-621：可在设置页「游戏」栏关闭此行为）。
  const lifeNo = state?.character?.lifeNo;
  const prevLife = useRef<number | undefined>(undefined);
  const autoScrollTop = appSettings.game.autoScrollTop;
  useEffect(() => {
    if (autoScrollTop && lifeNo !== undefined && prevLife.current !== undefined && lifeNo !== prevLife.current) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    prevLife.current = lifeNo;
  }, [lifeNo, autoScrollTop]);

  // 主题三档（跟随系统/浅色/深色）：跟随系统时监听系统深浅色变化、
  // 实时解析，解析结果挂到 <html data-theme>，theme.css 里对应的变量
  // 块随之生效（优先级高于媒体查询）；colorScheme 同步给浏览器控件。
  const systemDark = useSystemDark();
  const resolvedTheme = resolveTheme(appSettings.game.theme, systemDark);
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);
  // 底部导航切页后回到页首：从长页面中段切过去时不落在新页半腰。
  useEffect(() => { window.scrollTo({ top: 0 }); }, [view]);

  const animClass = appSettings.game.animations ? "" : "no-anim";

  return (
    <div className={`paper-grain min-h-screen bg-[var(--bg)] text-[var(--text)] ${animClass}`} style={{ zoom: FONT_ZOOM[appSettings.game.fontScale] }}>
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      <main className="mx-auto w-full max-w-3xl px-4 pb-32 pt-3">
        {stateQ.isPending && <p className="py-16 text-center text-[var(--dim)]">正在展开命盘…</p>}
        {stateQ.error && (
          <div className="rounded-[var(--radius)] bg-[var(--surface)] p-4 text-center">
            <p className="text-sm text-[var(--red)]">存档读取失败。</p>
            <button type="button" onClick={() => stateQ.refetch()} className="mt-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold text-[var(--on-bright)]">重试</button>
          </div>
        )}

        {state && view === "menu" && (
          <MainMenu state={state} tripleConfirm={appSettings.game.resetTripleConfirm} resetting={resetM.isPending}
            onContinue={() => { setEnteredGame(true); setView("game"); }}
            onNewGameDirect={() => { abandonIfUnfinishedCreation(); setView("setup"); }}
            onNewGameReset={() => resetM.mutate(undefined, { onSuccess: () => setView("setup") })}
            onOpenRules={() => setView("rules")}
            onOpenSettings={() => setView("settings")} />
        )}

        {/* U-625 规则设定页：新游戏的第一站——整局规则默认推荐值、
            可逐项改、含恢复推荐；确认后服务端锁定本局并进创建。
            已锁定的存档不会走到这里（新游戏必先散功重开解锁）。 */}
        {state && view === "setup" && (
          <GameRules state={state} picking={settingM.isPending} setup
            onPick={(key, value) => settingM.mutate({ key, value })}
            onOpenEncyclopedia={() => setView("encyclopedia")}
            onConfirmSetup={() => lockRulesM.mutate()}
            confirming={lockRulesM.isPending}
            onRestoreAll={restoreAllRecommended}
            restoringAll={restoringAll} />
        )}

        {/* U-625：游戏内规则页只读——显示本局锁定的规则，不可改。 */}
        {state && view === "rules" && (
          <GameRules state={state} picking={false} readOnly onPick={(key, value) => settingM.mutate({ key, value })} onOpenEncyclopedia={() => setView("encyclopedia")} />
        )}

        {view === "encyclopedia" && <Encyclopedia />}

        {/* 设置页散功成功后回主菜单并退出游戏内会话（导航门控）：
            存档已清空，留在设置页再从导航进游戏等于绕过新游戏流程。 */}
        {view === "settings" && (
          <SettingsPage settings={appSettings} onChange={updateSettings} state={state ?? null}
            onExportSave={async () => (await api.exportSave({})).json}
            onImportSave={async (json) => { apply(await api.importSave({ json })); }}
            onResetAll={() => resetM.mutate(undefined, { onSuccess: () => { setEnteredGame(false); setView("menu"); } })} resetting={resetM.isPending} />
        )}

        {/* U-624 退出游戏（游戏内入口）：各页顶部回主菜单。
            关闭页面才是真退出。 */}
        {(view === "game" ? !!state : view !== "menu") && (
          <div className="mb-2 flex justify-end">
            <button type="button" onClick={() => { abandonIfUnfinishedCreation(); setEnteredGame(false); setView("menu"); }} aria-label="返回主菜单（退出游戏）"
              className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-bold text-[var(--dim)]">
              ‹ 返回主菜单
            </button>
          </div>
        )}

        {state && view === "game" && boardProps && (
          state.character ? (
            <GameBoard {...boardProps} />
          ) : (
            <Creation state={state} creating={createM.isPending} drawing={drawM.isPending}
              onDraw={onDrawStable} onChoice={onChoice} onTalents={onTalents}
              onAllocatePoints={(attr, delta) => allocateM.mutate({ attr, delta })}
              onBuyBoon={(boonId) => buyBoonM.mutate(boonId)}
              onResetDraw={() => resetDrawM.mutate()}
              onCreate={(name, artifactId) => {
                const a: { name?: string; artifactId?: string } = {};
                if (name) a.name = name;
                if (artifactId) a.artifactId = artifactId;
                createM.mutate(a);
              }} />
          )
        )}

        {settingM.isError && <p className="mt-3 text-center text-sm text-[var(--red)]">设定保存失败，请重试。</p>}
      </main>

      {/* 主题切换悬浮按钮：右下角、底部导航上方，只显示当前档的单枚
          图标（阴阳=跟随系统 / 太阳=浅色 / 月亮=深色），点一下循环
          换档：跟随系统 → 浅色 → 深色 → 跟随系统。z-40 与底栏同层，
          散功确认弹窗（z-50）打开时仍在其上。U-625：规则设定页底部
          是确认栏，悬浮钮在该页隐藏以免与确认栏重叠。 */}
      {view !== "setup" && (() => {
        const theme = appSettings.game.theme;
        const next = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
        const label = theme === "system" ? "跟随系统（阴阳）" : theme === "light" ? "浅色（太阳）" : "深色（月亮）";
        const nextLabel = next === "system" ? "跟随系统" : next === "light" ? "浅色" : "深色";
        return (
          <button type="button" aria-label={`主题切换：当前${label}，点击切换为${nextLabel}`} title={`主题：${label}（点击切换）`}
            onClick={() => updateSettings({ ...appSettings, game: { ...appSettings.game, theme: next } })}
            className="fixed right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-lg"
            style={{ bottom: "calc(76px + env(safe-area-inset-bottom))" }}>
            <ThemeIcon kind={theme} />
          </button>
        );
      })()}

      {/* 底部导航：四页切换固定在屏幕底部，拇指可达、大按钮；选中项
          墨底金字，未选中项淡墨字（印章照旧朱砂）。z-40 低于散功确认
          弹窗（z-50），弹窗打开时导航让位。U-624：主菜单是独立的
          第一屏，不显示底部导航（菜单自带六项入口）。U-625：规则
          设定页同样不显示——设定页自带固定确认栏，走完确认才进
          游戏，避免中途从导航跳进未锁定的创建。导航门控（见上方
          enteredGame 注释）：仅游戏内会话显示；从主菜单进的设置/
          规则/百科不显示，杜绝从设置页点「首页」绕过新游戏流程
          直接进游戏。 */}
      {enteredGame && view !== "menu" && view !== "setup" && (
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--surface)]" aria-label="主导航">
        <div className="mx-auto flex w-full max-w-3xl px-1" role="tablist" aria-label="视图切换" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          {([
            { key: "game", seal: "首", label: "首页" },
            { key: "rules", seal: "规", label: "游戏规则" },
            { key: "encyclopedia", seal: "典", label: "百科" },
            { key: "settings", seal: "设", label: "设置" },
          ] as const).map((item) => {
            const active = view === item.key;
            return (
              <button key={item.key} type="button" role="tab" aria-selected={active}
                aria-label={item.key === "rules" && state ? `游戏规则，已定 ${settledCount}/${TREE.length}` : item.label}
                onClick={() => setView(item.key)}
                className={`flex min-h-[64px] flex-1 flex-col items-center justify-center gap-1 px-1 py-2 font-song ${active ? "bg-[var(--ink)] text-[var(--on-ink)]" : "text-[var(--dim)]"}`}>
                <span className="text-lg leading-none"><Seal ch={item.seal} /></span>
                <span className="text-xs font-black leading-none">{item.label}{item.key === "rules" && state ? ` ${settledCount}/${TREE.length}` : ""}</span>
              </button>
            );
          })}
        </div>
      </nav>
      )}
    </div>
  );
}
