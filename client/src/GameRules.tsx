// 游戏规则视图：19 条规则（Q1–Q18 + Q34）按玩法分组展示，每条显示
// 当前选项与全部选项说明。原「设计树」改版（2026-11-11）。
//
// U-625 三种形态（同一组件、同一份规则内容）：
// - setup（新游戏规则设定页）：点新游戏先到这里——默认值为 Q1–Q18
//   定夺推荐值，可逐项改、带「已改」标记与逐条/一键「恢复推荐」，
//   底部确认栏点「确认规则，开始降生」后本局锁定、进创建（降生抽选
//   仍在创建界面，本页不重复）；
// - readOnly（游戏内规则页与主菜单入口）：显示本局锁定的规则与固定
//   规则，选项禁用、无「已改」标红、无恢复推荐入口，服务端
//   setSetting 同步拒绝，锁定后无后门可改。
//
// 展示改造（2026-11-13）：分组带图标与区分色、当前选中项高亮 chip、推荐标记
// 加醒目；五组可折叠（默认只展开一组，展开状态存 localStorage 记住）；顶部
// sticky 搜索（按标题/说明/选项搜，命中高亮，搜索时自动展开含结果的组）；
// 与推荐不一致的规则卡带「已改」标记与「恢复推荐」；顶部分组导航随滚动
// 高亮当前组。判定记号速查卡全文已搬到独立「百科」页（Encyclopedia.tsx），
// 本页只留两三行摘要 + 「查看完整百科」入口。只改展示与交互：规则内容、
// 选项、Q1–Q18 与改选逻辑（onPick → setSetting）一律未动。

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { SettingKey, State } from "./types";
import { RULE_GROUPS, SOURCES, TREE, type TreeNode } from "./tree-data";
import { Seal } from "./widgets";

// ---------- 分组区分色（仅展示） ----------

const GROUP_COLORS: Record<string, string> = {
  opening: "#2f6f5e",
  reincarnation: "#a83226",
  cultivation: "#a97f2c",
  combat: "#3f6485",
  world: "#5a5348",
};

const OPEN_GROUPS_KEY = "lunhui-rules-open-groups-v1";

function loadOpenGroups(): Set<string> {
  try {
    const raw = window.localStorage.getItem(OPEN_GROUPS_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as unknown;
      if (Array.isArray(arr)) {
        const valid = arr.filter((x): x is string => typeof x === "string" && RULE_GROUPS.some((g) => g.id === x));
        return new Set(valid);
      }
    }
  } catch { /* localStorage 不可用时用默认 */ }
  const first = RULE_GROUPS[0];
  return new Set(first ? [first.id] : []);
}

function saveOpenGroups(groups: Set<string>) {
  try { window.localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify([...groups])); } catch { /* 静默 */ }
}

// ---------- 搜索命中高亮 ----------

function Hl({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: ReactNode[] = [];
  let rest = text;
  let restLower = lower;
  let k = 0;
  for (;;) {
    const i = restLower.indexOf(needle);
    if (i < 0) { parts.push(rest); break; }
    if (i > 0) parts.push(rest.slice(0, i));
    parts.push(
      <mark key={k++} className="rounded-[3px] px-0.5" style={{ backgroundColor: "#f2cf5b", color: "#262019" }}>
        {rest.slice(i, i + needle.length)}
      </mark>,
    );
    rest = rest.slice(i + needle.length);
    restLower = restLower.slice(i + needle.length);
    if (!rest) break;
  }
  return <>{parts}</>;
}

function nodeMatches(node: TreeNode, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  const hay = [
    node.q, node.title, node.syncNote,
    ...node.options.flatMap((o) => [o.label, o.desc]),
  ].join("\n").toLowerCase();
  return hay.includes(needle);
}

function recommendedValue(node: TreeNode): string | undefined {
  return node.options.find((o) => o.recommended)?.value;
}

// ---------- game rules view ----------

export function GameRules({ state, onPick, picking, onOpenEncyclopedia, readOnly = false, setup = false, onConfirmSetup, confirming = false, onRestoreAll, restoringAll = false }: {
  state: State;
  onPick: (key: SettingKey, value: string) => void;
  picking: boolean;
  onOpenEncyclopedia: () => void;
  // U-625：游戏内（底部导航）与主菜单入口均为只读——可展开看全部
  // 选项与说明，选项按钮禁用、不显示「已改」标红与「恢复推荐」。
  readOnly?: boolean;
  // U-625：新游戏规则设定页形态——可改 + 底部确认栏（确认即锁定
  // 本局并进创建）。与 readOnly 互斥（setup 时 readOnly 恒 false）。
  setup?: boolean;
  onConfirmSetup?: () => void;
  confirming?: boolean;
  onRestoreAll?: () => void;
  restoringAll?: boolean;
}) {
  const [openKey, setOpenKey] = useState<SettingKey | null>(null);
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(loadOpenGroups);
  const [activeId, setActiveId] = useState<string>("notation");
  const settled = TREE.filter((n) => state.settings[n.key].confirmed).length;
  const nodeByKey = useMemo(() => new Map(TREE.map((n) => [n.key, n])), []);
  const q = query.trim();
  const searching = q.length > 0;

  // U-625：只读形态不展示「已改」——本局规则已锁定，偏离推荐只是
  // 本局的既定选择而非待纠正项；「已改」标记只在设定页（可改）出现。
  const changedCount = useMemo(
    () => (readOnly ? 0 : TREE.filter((n) => {
      const rec = recommendedValue(n);
      return rec !== undefined && state.settings[n.key].value !== rec;
    }).length),
    [state.settings, readOnly],
  );

  // 每组在当前搜索下的可见规则
  const visibleByGroup = useMemo(() => {
    const map = new Map<string, TreeNode[]>();
    for (const g of RULE_GROUPS) {
      const nodes = g.keys.map((k) => nodeByKey.get(k)).filter((n) => n !== undefined);
      map.set(g.id, searching ? nodes.filter((n) => nodeMatches(n, q)) : nodes);
    }
    return map;
  }, [nodeByKey, searching, q]);
  const totalMatches = useMemo(
    () => [...visibleByGroup.values()].reduce((sum, arr) => sum + arr.length, 0),
    [visibleByGroup],
  );

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      saveOpenGroups(next);
      return next;
    });
  };

  const jumpTo = (id: string) => {
    if (id !== "notation" && !openGroups.has(id)) {
      const next = new Set(openGroups);
      next.add(id);
      saveOpenGroups(next);
      setOpenGroups(next);
    }
    // 等展开渲染后再滚，避免目标位置按折叠高度算错
    requestAnimationFrame(() => {
      document.getElementById(`rules-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  // 滚动跟随：观察速查卡与各分组段落，高亮当前所在分组
  useEffect(() => {
    const ids = ["notation", ...RULE_GROUPS.map((g) => g.id)];
    const els = ids
      .map((id) => document.getElementById(`rules-${id}`))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActiveId(e.target.id.replace(/^rules-/, ""));
        }
      },
      { rootMargin: "-25% 0px -65% 0px", threshold: 0 },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [searching, totalMatches]);

  const navChip = (id: string, label: ReactNode) => {
    const active = activeId === id;
    const color = GROUP_COLORS[id];
    return (
      <button
        key={id}
        type="button"
        onClick={() => jumpTo(id)}
        aria-current={active ? "true" : undefined}
        className="rounded-full px-3 py-1.5 text-xs font-bold transition"
        style={active
          ? { backgroundColor: color ?? "var(--gold)", color: "#fff" }
          : { backgroundColor: "var(--surface2)", color: "var(--text)" }}
      >
        {label}
      </button>
    );
  };

  return (
    <div>
      {/* sticky 顶栏：进度 + 搜索 + 分组导航，滚动时常驻 */}
      <div className="sticky top-0 z-30 -mx-4 bg-[var(--bg)] px-4 pb-2 pt-1">
        <div className="rounded-[var(--radius)] bg-[var(--surface)] p-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap justify-between gap-x-3 text-xs text-[var(--dim)]">
                <span>游戏规则</span>
                <span>
                  {settled} / {TREE.length} 条已定
                  {changedCount > 0 && <span className="ml-2 font-bold text-[var(--red)]">· {changedCount} 条已改</span>}
                </span>
              </div>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-[var(--surface2)]">
                <div className="h-full rounded-full bg-[var(--gold)] transition-all duration-500" style={{ width: `${(settled / TREE.length) * 100}%` }} />
              </div>
            </div>
            <span className="hidden shrink-0 text-xs text-[var(--dim)] sm:block">{setup ? <>新游戏 · 规则设定<br />确认后锁定本局</> : readOnly ? <>只读查看<br />本局规则已锁定</> : <>点任意一条改选项，<br />实时同步到首页</>}</span>
          </div>

          <div className="relative mt-3">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索规则：标题、说明、选项…"
              aria-label="搜索规则"
              className="w-full rounded-full border border-[var(--border)] bg-[var(--bg)] py-2 pl-4 pr-10 text-sm text-[var(--text)] outline-none placeholder:text-[var(--dim)] focus:border-[var(--gold)]"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="清除搜索"
                className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--surface2)] text-sm text-[var(--dim)]"
              >
                ✕
              </button>
            ) : (
              <span aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-brush text-[var(--dim)]">搜</span>
            )}
          </div>
          {searching && (
            <p className="mt-2 text-xs text-[var(--dim)]" role="status">
              {totalMatches > 0 ? `命中 ${totalMatches} 条规则，含结果的分组已自动展开。` : "无结果：没有规则匹配这个关键词。"}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-1.5" role="navigation" aria-label="规则分组跳转">
            {navChip("notation", <><Seal ch="骰" /> 判定记号</>)}
            {RULE_GROUPS.map((g) => navChip(g.id, <><Seal ch={g.icon} /> {g.title}</>))}
          </div>
        </div>
      </div>

      <p className="mb-4 mt-1 rounded-[var(--radius)] bg-[var(--surface)] p-3 text-xs leading-relaxed text-[var(--dim)]">
        {setup ? (
          <>开局先定<b className="text-[var(--text)]">整局规则</b>：19 条规则按玩法分成五组，下面已经按你定夺过的<b className="text-[var(--text)]">推荐值</b>预选好，可以逐条展开改选；改过的会带「已改」标记，也能逐条或一键恢复推荐。每条都写明什么时候生效（看「同步」说明：立刻生效 / 下一世生效 / 下一次轮回生效）——比如 Q2 决定开局灵根、Q9 决定第一世带不带法宝、Q12 决定轮回时记忆留多少。标了「未采用 · 仅作记录」的选项是历轮讨论留下的旧方案，只存档备查，选了不会改变规则。<span className="mt-1 block font-bold text-[var(--text)]">定好后点页面底部「确认规则，开始降生」：规则即锁定本局，游戏内只能查看不能再改；姓名、出身、命格、灵根、天赋的随机或自选在下一步创建界面里定，不在这里。</span></>
        ) : readOnly ? (
          <>这里是这局游戏的<b className="text-[var(--text)]">规则总开关</b>：19 条规则按玩法分成五组，每条都写明当前选了什么、什么时候生效（看「同步」说明：立刻生效 / 下一世生效 / 下一次轮回生效）。比如 Q2 决定开局灵根、Q9 决定第一世带不带法宝、Q12 决定轮回时记忆留多少。标了「未采用 · 仅作记录」的选项是历轮讨论留下的旧方案，只存档备查，不会改变规则。<span className="mt-1 block font-bold text-[var(--text)]">本局规则已在开局时锁定：这里只能查看，不能修改；要改规则请回主菜单点「新游戏」，在开局的规则设定页里重定。</span></>
        ) : (
          <>这里是这局游戏的<b className="text-[var(--text)]">规则总开关</b>：19 条规则按玩法分成五组，每条都写明当前选了什么、什么时候生效（看「同步」说明：立刻生效 / 下一世生效 / 下一次轮回生效）。改了真的会变——比如 Q2 决定开局灵根、Q9 决定第一世带不带法宝、Q12 决定轮回时记忆留多少。标了「未采用 · 仅作记录」的选项是历轮讨论留下的旧方案，只存档备查，选了不会改变规则。改过的规则会带「已改」标记，随时可以一键恢复推荐。</>
        )}
      </p>

      {/* 判定记号速查摘要（原 U-571/U-572 速查卡全文已搬到「百科」页，
          这里只留两三行摘要 + 入口；摘要与百科首节一致）。 */}
      <section id="rules-notation" aria-label="判定记号速查摘要" style={{ scrollMarginTop: 200 }} className="mb-6 rounded-[var(--radius)] border-2 border-[var(--gold)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-brush text-lg font-black"><Seal ch="骰" /> 判定记号速查（全游戏统一）</h2>
          <span className="rounded-full bg-[var(--gold)] px-2 py-0.5 text-[11px] font-bold text-[var(--on-bright)]">速查摘要</span>
        </div>
        <p className="mt-2 text-sm leading-relaxed">
          判定按系统分骰面（Q34），记号统一写作 <b className="font-song">1dS[下限~上限]+修正 vs 难度</b>：斗法 d20、突破 d100、探索 d80、副职 d60、社交 d40、宗门差事 d50、记忆保留 d100；[下限~上限] 由相关属性现算（如战力 20 的斗法掷 5~30），撑起骰面的属性不再重复进修正。难度按「玩家能力 vs 目标档位」的相对差距等概率重标，同境界同属性的成功率与旧 d150 一致。带优势 / 劣势时用双掷记号 <b className="font-song">2dS[下限~上限]L / H</b>（按各系统骰面）。九境门槛、记忆保留、好感档位等速查也在百科里。
        </p>
        <button
          type="button"
          onClick={onOpenEncyclopedia}
          className="mt-3 rounded-full bg-[var(--gold)] px-4 py-2 text-sm font-bold text-[var(--on-bright)]"
        >
          查看完整百科
        </button>
      </section>

      {searching && totalMatches === 0 && (
        <div className="mb-6 rounded-[var(--radius)] bg-[var(--surface)] p-6 text-center" role="status">
          <p className="font-song text-base font-bold">无结果</p>
          <p className="mt-1 text-sm text-[var(--dim)]">没有规则的标题、说明或选项里包含「{q}」。</p>
          <button type="button" onClick={() => setQuery("")} className="mt-3 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold text-[var(--on-bright)]">清除搜索</button>
        </div>
      )}

      {RULE_GROUPS.map((group) => {
        const allNodes = group.keys.map((k) => nodeByKey.get(k)).filter((n) => n !== undefined);
        const nodes = visibleByGroup.get(group.id) ?? [];
        if (searching && nodes.length === 0) return null;
        const color = GROUP_COLORS[group.id] ?? "var(--gold)";
        const groupSettled = allNodes.filter((n) => state.settings[n.key].confirmed).length;
        const groupChanged = readOnly ? 0 : allNodes.filter((n) => {
          const rec = recommendedValue(n);
          return rec !== undefined && state.settings[n.key].value !== rec;
        }).length;
        const expanded = searching ? true : openGroups.has(group.id);
        return (
          <section key={group.id} id={`rules-${group.id}`} aria-label={`规则分组：${group.title}`} style={{ scrollMarginTop: 200 }} className="mb-6">
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={`${group.title}分组，${expanded ? "收起" : "展开"}`}
              onClick={() => { if (!searching) toggleGroup(group.id); }}
              className="mb-2 flex w-full items-center gap-2.5 rounded-[var(--radius)] px-3 py-2.5 text-left"
              style={{ backgroundColor: `${color}1f`, border: `1.5px solid ${color}59` }}
            >
              <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-brush text-lg text-[#f7f1de]" style={{ backgroundColor: color }}>
                <span aria-hidden>{group.icon}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-brush text-lg font-black leading-tight"><Hl text={group.title} q={q} /></span>
                <span className="block text-xs text-[var(--dim)]">
                  {searching ? `命中 ${nodes.length} 条` : `${allNodes.length} 条 · 已定 ${groupSettled}`}
                  {groupChanged > 0 && <span className="ml-1.5 font-bold text-[var(--red)]">· 已改 {groupChanged}</span>}
                </span>
              </span>
              <span aria-hidden className="shrink-0 text-base text-[var(--dim)]">{expanded ? "▾" : "▸"}</span>
            </button>
            {expanded && (
              <>
                <p className="mb-3 px-0.5 text-xs leading-relaxed text-[var(--dim)]"><Hl text={group.desc} q={q} /></p>
                <div className="space-y-3">
                  {nodes.map((node) => {
                    const setting = state.settings[node.key];
                    const open = openKey === node.key;
                    const chosen = node.options.find((o) => o.value === setting.value);
                    const recValue = recommendedValue(node);
                    const changed = !readOnly && recValue !== undefined && setting.value !== recValue;
                    return (
                      <article key={node.key} className={`rounded-[var(--radius)] border-2 bg-[var(--surface)] ${setting.confirmed ? "border-[var(--border)]" : "border-[var(--gold)] frontier-pulse"}`}>
                        <div className="p-3 pb-0">
                          <button
                            type="button"
                            aria-expanded={open}
                            aria-label={`${node.q} ${node.title}，当前：${chosen?.label ?? setting.value}，${setting.confirmed ? "已定" : "暂定"}${changed ? "，已改" : ""}，${readOnly ? "点击查看" : "点击修改"}`}
                            onClick={() => setOpenKey(open ? null : node.key)}
                            className="w-full text-left"
                          >
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="glyph-tile text-xl" aria-hidden>{node.icon}</span>
                              <span className="rounded bg-[var(--ink)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--on-ink)]">{node.q}</span>
                              <span className="font-song text-base font-bold"><Hl text={node.title} q={q} /></span>
                              {changed && <span className="rounded-full bg-[var(--red)] px-2 py-0.5 text-[11px] font-bold text-[var(--on-bright)]">已改</span>}
                              <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${setting.confirmed ? "bg-[var(--accent)] text-[var(--on-bright)]" : "bg-[var(--gold)] text-[var(--on-bright)]"}`}>
                                {setting.confirmed ? "✓ 已定" : "前沿 · 暂定"}
                              </span>
                            </span>
                            <span className="mt-2 block rounded-lg bg-[var(--surface2)] px-2.5 py-2">
                              <span className="flex items-center gap-2">
                                <span className="text-[11px] font-bold text-[var(--dim)]">当前规则</span>
                                {chosen?.recommended
                                  ? <span className="rounded-full bg-[var(--gold-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--gold)]">★ 推荐</span>
                                  : changed && <span className="rounded-full bg-[var(--red)] px-2 py-0.5 text-[11px] font-bold text-[var(--on-bright)]">非推荐 · 已改</span>}
                              </span>
                              <span className="mt-1 inline-block max-w-full rounded-full bg-[var(--accent)] px-3 py-1 text-sm font-bold leading-snug text-[var(--on-bright)]">
                                <Hl text={chosen?.label ?? setting.value} q={q} />
                              </span>
                              {chosen && <span className="mt-1.5 block text-xs leading-relaxed text-[var(--dim)]"><Hl text={chosen.desc} q={q} /></span>}
                            </span>
                            {!setting.confirmed && !readOnly && <span className="mt-1.5 block text-xs text-[var(--dim)]">当前为推荐答案暂定，你点选任意一项即正式定下。</span>}
                            <span className="mt-1.5 block text-xs text-[var(--accent)]"><Hl text={node.syncNote} q={q} /></span>
                            <span className="mt-1 block text-xs text-[var(--dim)]">{open ? "▾ 收起选项" : readOnly ? "▸ 点开看全部选项（只读）" : "▸ 点开看全部选项，可改"}</span>
                          </button>
                          {changed && recValue !== undefined && !readOnly && (
                            <div className="mt-2 flex items-center gap-2 pb-1">
                              <span className="text-xs text-[var(--dim)]">这条已改成非推荐选项。</span>
                              <button
                                type="button"
                                disabled={picking}
                                onClick={() => onPick(node.key, recValue)}
                                aria-label={`恢复推荐：${node.q} ${node.title}`}
                                className="ml-auto shrink-0 rounded-full bg-[var(--gold)] px-3 py-1.5 text-xs font-bold text-[var(--on-bright)] disabled:opacity-50"
                              >
                                ↺ 恢复推荐
                              </button>
                            </div>
                          )}
                        </div>
                        {open && (
                          <div className="space-y-2 px-3 pb-3 pt-2" role="radiogroup" aria-label={`${node.title}的选项`}>
                            {node.options.map((opt) => {
                              const selected = setting.value === opt.value;
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  role="radio"
                                  aria-checked={selected}
                                  disabled={picking || readOnly}
                                  onClick={() => onPick(node.key, opt.value)}
                                  className={`w-full rounded-[var(--radius)] border p-3 text-left transition ${selected ? "border-[var(--gold)] bg-[var(--gold-soft)]" : "border-[var(--border)] bg-[var(--bg)]"}`}
                                >
                                  <span className="flex flex-wrap items-center gap-2 text-sm font-bold">
                                    <span aria-hidden>{selected ? "◉" : "○"}</span>
                                    <span><Hl text={opt.label} q={q} /></span>
                                    {opt.recommended && <span className="rounded-full bg-[var(--red)] px-2 py-0.5 text-[11px] font-bold text-[var(--on-bright)]">★ 推荐</span>}
                                    {selected && <span className="ml-auto shrink-0 rounded-full bg-[var(--accent)] px-2 py-0.5 text-[11px] font-bold text-[var(--on-bright)]">当前选择</span>}
                                  </span>
                                  <span className="mt-1 block text-xs leading-relaxed text-[var(--dim)]"><Hl text={opt.desc} q={q} /></span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        );
      })}

      {/* 参考来源 */}
      <section aria-label="参考来源" className="mt-6 rounded-[var(--radius)] bg-[var(--surface)] p-4">
        <h2 className="font-brush text-base font-black"><Seal ch="源" /> 本轮扩容的参考来源</h2>
        <p className="mt-1 text-xs leading-relaxed text-[var(--dim)]">
          传承点、前世遗藏、承世玉、地点收益衰减、第二世秘境门槛放宽，借鉴自 Steam《百世成仙》（凯菲工作室，2026-10-08 发售；截至 2026-11-11 调研时 Steam 总评 Mixed、44 篇，样本小、口碑未定）。
          需要说明：该作本身没有随机开局系统——随机出身/天赋、三选一保留、记忆分层等规则源自下列轮回修仙小说，未混为一谈。
        </p>
        <ul className="mt-2 space-y-1 text-xs">
          {SOURCES.game.map((s) => (
            <li key={s.url}>· <a href={s.url} target="_blank" rel="noreferrer" className="text-[var(--accent)] underline">{s.label}</a></li>
          ))}
        </ul>
        <p className="mt-3 text-xs font-bold text-[var(--dim)]">轮回修仙小说（18 本，各取其一机制）</p>
        <ul className="mt-1 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
          {SOURCES.novels.map((n) => (
            <li key={n.url} className="rounded-lg bg-[var(--surface2)] px-2 py-1.5">
              <a href={n.url} target="_blank" rel="noreferrer" className="font-medium text-[var(--accent)] underline">{n.name}</a>
              <span className="text-[var(--dim)]"> · {n.author}</span>
              <span className="block text-[var(--dim)]">{n.mech}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* U-625 规则设定页确认栏：固定底部（设定页无底部导航，让位
          关系与游戏内导航一致）。确认 = 服务端锁定本局规则后进
          创建；改过非推荐项时另给一键恢复全部推荐。 */}
      {setup && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--surface)]" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-3">
            <p className="min-w-0 flex-1 text-xs leading-snug text-[var(--dim)]" role="status">
              {changedCount > 0
                ? <>已改 <b className="text-[var(--red)]">{changedCount}</b> 条为非推荐值</>
                : "当前全部为推荐值"}
              <span className="block">确认后锁定本局，游戏内不可再改</span>
            </p>
            {changedCount > 0 && onRestoreAll && (
              <button type="button" disabled={picking || restoringAll} onClick={onRestoreAll}
                aria-label="恢复全部推荐：把所有改过的规则一键改回推荐值"
                className="shrink-0 rounded-full bg-[var(--gold)] px-3.5 py-2.5 text-sm font-bold text-[var(--on-bright)] disabled:opacity-50">
                ↺ 恢复推荐
              </button>
            )}
            <button type="button" disabled={confirming || picking || restoringAll} onClick={onConfirmSetup}
              className="shrink-0 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-[var(--on-bright)] disabled:opacity-50">
              {confirming ? "锁定中…" : "确认规则，开始降生"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
