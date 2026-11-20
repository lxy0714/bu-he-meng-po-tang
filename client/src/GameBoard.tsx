// 首页视图：角色面板、行动、事件、世界地图、轮回树、编年史。
// 分页（2026-11-13）：首页内部分 5 页——角色 / 地图探索 / 修炼宗门 /
// 社交经济 / 轮回历史，默认停在「角色」。只改排布：命轮与角色面板、宗门、
// 丹药囊等区块从原来的一整页长列里拆进各自的页；骰子结果、待决事件与
// 轮回结算属于流程本身，常驻显示在分页签下方（在哪一页触发就在哪一页
// 结算，不跳页）。规则、数值、存档与全部按钮行为均未改动。
//
// 二级展开（2026-11-13，用户点名三项）：① 角色页贴片云与境界梯收进
// 「属性详情」折叠，主层只留命轮、进度条与一行摘要；② 人际改为总览行
// （仇敌置顶、组内情谊/仇怨高的在前），点名字展开情谊条与全部互动
// 按钮；③ 轮回树只默认展开最近两世，更早的世一行摘要、点开看全卡。
// 仍只改排布：所有按钮的接线、禁用条件与文案均未动。

import { useState } from "react";
import type { ActKind, CommissionKind, DrawField, EconomyKind, PointsAttr, SectKind, SocialKind, State, TimedEventKind } from "./types";
import { ART_BY_KEY, LOCATIONS, PLAN_LABEL, TREASURE_OPTIONS, heroImg, portraitImg, realmImg } from "./display-data";
import { Bar, Dice, FateWheel, Seal, ageTextOf } from "./widgets";
import { ReincarnationPanel, memoryPreview } from "./ReincarnationPanel";
import { TechniquesPage } from "./TechniquesPage";
import { KnowledgeCodexPage } from "./KnowledgeCodexPage";

// ---------- game board ----------

const REL_META: Record<string, { icon: string; label: string }> = {
  partner: { icon: "侣", label: "道侣" },
  master: { icon: "师", label: "师父" },
  disciple: { icon: "徒", label: "徒弟" },
  friend: { icon: "友", label: "道友" },
  enemy: { icon: "仇", label: "仇敌" },
};
function bondTier(kind: string, bond: number): string {
  if (kind === "enemy") return bond >= 70 ? "不共戴天" : bond >= 45 ? "深仇大恨" : bond >= 20 ? "结怨" : "小隙";
  return bond >= 80 ? "生死之交" : bond >= 55 ? "莫逆之交" : bond >= 30 ? "相知" : "泛泛之交";
}

// U-377 代价模板：选项标价的展示文案（与服务端 formatEventCost 同
// 口径：可支付五键、值为负即扣减），如「灵石 −50 · 气血 −12」。
const COST_LABEL: Record<string, string> = { stones: "灵石", hp: "气血", mp: "法力", cult: "修为", karma: "业力" };
function costText(cost: { stones?: number; hp?: number; mp?: number; cult?: number; karma?: number }): string {
  return (["stones", "hp", "mp", "cult", "karma"] as const)
    .filter((k) => cost[k])
    .map((k) => `${COST_LABEL[k]} ${cost[k]}`)
    .join(" · ");
}

type BoardTab = "role" | "map" | "sect" | "social" | "history";
const BOARD_TABS: { id: BoardTab; icon: string; label: string }[] = [
  { id: "role", icon: "角", label: "角色" },
  { id: "map", icon: "图", label: "地图探索" },
  { id: "sect", icon: "宗", label: "修炼宗门" },
  { id: "social", icon: "交", label: "社交经济" },
  { id: "history", icon: "轮", label: "轮回历史" },
];

// U-381 分叉路线：五种节点的展示文案（结算全在服务端，类型与既有
// 系统一一对应：战斗/精英=斗法、事件=牌堆事件、商店=行商买丹、休息=休整）。
const ROUTE_NODE_META: Record<string, { icon: string; label: string; sub: string }> = {
  combat: { icon: "战", label: "战斗", sub: "斗法 · 胜负按胜势差结算 · 耗 1 月" },
  elite: { icon: "锐", label: "精英", sub: "本地最强敌手 · 斗法结算 · 耗 1 月" },
  event: { icon: "缘", label: "事件", sub: "牌堆机缘 · 探索骰 d80 · 抉择不另耗时" },
  shop: { icon: "市", label: "商店", sub: "行商驻足 · 丹药与坊市同价" },
  rest: { icon: "憩", label: "休息", sub: "休整一月 · 回血 + 修为" },
};

export function GameBoard({ state, busy, pendingKey, onAct, onChoose, onChooseRouteNode, onAbandonRoute, onTravel, onBury, onJade, onPrepare, prepareFailed, onAllocatePoints, onResetDraw, onBuyBoon, onKeepsake, onSelectFreeTechnique, onReincarnate, onDraw, drawing, onChoice, onTalents, onSect, onSetPlan, onRunPlan, onClearPlan, onFight, onEconomy, onSocial, onCommission, onTimedEvent, onForgeArtifact, onBuyOre }: {
  state: State;
  busy: boolean;
  pendingKey: string | null;
  onAct: (kind: ActKind) => void;
  onChoose: (idx: number) => void;
  onChooseRouteNode: (idx: number) => void;
  onAbandonRoute: () => void;
  onTravel: (id: string) => void;
  onBury: (treasureId: string) => void;
  onJade: () => void;
  onPrepare: () => void;
  prepareFailed: boolean;
  onAllocatePoints: (attr: PointsAttr, delta: number) => void;
  onResetDraw: () => void;
  onBuyBoon: (boonId: string) => void;
  onKeepsake: (kind: "artifact" | "technique" | "treasure", id: string, locationId?: string) => void;
  onSelectFreeTechnique: (id: string) => void;
  onReincarnate: (name: string) => void;
  onDraw: () => void;
  drawing: boolean;
  onChoice: (field: DrawField, random: boolean, value?: string) => void;
  onTalents: (ids: string[]) => void;
  onSect: (kind: SectKind) => void;
  onSetPlan: (steps: { kind: ActKind; count: number }[]) => void;
  onRunPlan: () => void;
  onClearPlan: () => void;
  onFight: (enemyId: string) => void;
  onEconomy: (kind: EconomyKind) => void;
  onSocial: (kind: SocialKind, relationId?: string) => void;
  onCommission: (kind: CommissionKind, commissionId: string) => void;
  onTimedEvent: (kind: TimedEventKind, timedId: string) => void;
  onForgeArtifact: (tier: number) => void;
  onBuyOre: (tier: number) => void;
}) {
  const c = state.character;
  const [tab, setTab] = useState<BoardTab>("role");
  // U-613：修炼宗门下的二级页面——"main" 为宗门页本体，"techniques"
  // 为功法页（已学功法总览）；离开修炼宗门页签时回到本体。
  const [sectSub, setSectSub] = useState<"main" | "techniques">("main");
  // U-086：轮回历史下的二级页面——"main" 为历史页本体（前世之谜/
  // 轮回树/编年史），"codex" 为知识图鉴（跨世学过的功法与精通记录）。
  const [historySub, setHistorySub] = useState<"main" | "codex">("main");
  const [showFragments, setShowFragments] = useState(false);
  const [buryPick, setBuryPick] = useState(false);
  const [showAllLog, setShowAllLog] = useState(false);
  // 二级展开（2026-11-13）：属性详情默认收起、人际总览点开看互动、轮回树旧世默认一行摘要。
  const [showDetail, setShowDetail] = useState(false);
  const [openNpc, setOpenNpc] = useState<string | null>(null);
  const [openLives, setOpenLives] = useState<Record<number, boolean>>({});
  if (!c) return null;
  const realmName = state.realmNames[c.realmIdx] ?? "炼气";
  const realmText = `${realmName}·${state.stageNames[c.stageIdx] ?? "初期"}`;
  const q5 = state.settings.q5.value;
  const showMap = q5 === "all";
  const showTree = q5 === "all" || q5 === "panel_tree";
  const canBreak = c.cultivation >= state.threshold && !c.pendingEvent && !c.dead;
  const currentLoc = LOCATIONS.find((l) => l.id === c.locationId);
  const locState = state.locations.find((l) => l.id === c.locationId);
  const buriedHere = state.buried.filter((b) => b.locationId === c.locationId);
  const pendingBuried = state.buried.filter((b) => !b.found);
  const craftByLoc: Record<string, { kind: ActKind; label: string; icon: string; sub: string }> = {
    cave: { kind: "alchemy", label: "炼丹", icon: "丹", sub: "神识检定" },
    sect: { kind: "alchemy", label: "炼丹", icon: "丹", sub: "神识检定" },
    temple: { kind: "alchemy", label: "炼丹", icon: "丹", sub: "古刹丹房" },
    fields: { kind: "farm", label: "灵田劳作", icon: "田", sub: "稳收灵石" },
    falls: { kind: "fish", label: "垂钓", icon: "钓", sub: "飞瀑灵潭" },
    border: { kind: "fish", label: "垂钓", icon: "钓", sub: "冰湖垂钓" },
    market: { kind: "forge", label: "炼器", icon: "器", sub: "体魄检定" },
    wilds: { kind: "forge", label: "炼器", icon: "器", sub: "就地取材" },
  };
  const craft = craftByLoc[c.locationId] ?? { kind: "fish" as ActKind, label: "垂钓", icon: "钓", sub: "机缘检定" };
  // U-608 细时钟：行动/旅行耗时（月）现读服务端下发的配置表整形，
  // 按钮与说明文案据此标注，与服务端推进口径同一份配置。
  const costOf = (k: string) => state.timeCosts.costs.find((x) => x.key === k)?.months ?? 0;
  const travelOf = (id: string) => state.timeCosts.travel.find((x) => x.locationId === id)?.months ?? 0;
  const canPromote = !!c.sectNext && c.sectContrib >= c.sectNext.contribNeed && c.realmIdx >= c.sectNext.realmNeed;

  return (
    <div className="space-y-4">
      {/* hero banner */}
      <div className="relative overflow-hidden rounded-[var(--radius)]">
        <img src={currentLoc?.img ?? heroImg} alt={`${currentLoc?.name ?? "青云山"}景色`} className="h-32 w-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/70 to-transparent p-3 pt-8">
          <div>
            <p className="font-brush text-lg font-black text-white">{c.name} · 第{c.lifeNo}世</p>
            <p className="text-xs text-white/85">{currentLoc?.name} · {c.origin} · {state.settings.q1.value === "solo" ? "单人 · GM 陪跑" : "预留同行 · 当前单人盘"}</p>
          </div>
          <span className="rounded-full bg-black/45 px-2 py-1 text-xs text-white">灵石 {c.stones} · 业力 {c.karma}</span>
        </div>
      </div>

      {/* 首页分页签：5 页横向滚动，窄屏不截断 */}
      <div className="-mx-1 overflow-x-auto px-1 pb-0.5" role="tablist" aria-label="首页分页">
        <div className="flex min-w-max gap-1.5">
          {BOARD_TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => { setTab(t.id); if (t.id !== "sect") setSectSub("main"); }}
              className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 font-song text-sm font-black ${tab === t.id ? "bg-[var(--accent)] text-[var(--on-bright)]" : "bg-[var(--surface)] text-[var(--dim)]"}`}>
              <Seal ch={t.icon} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ===== 角色页：命轮、角色面板 ===== */}
      {tab === "role" && (
      <section aria-label="角色面板" className="rounded-[var(--radius)] bg-[var(--surface)] p-4">
        <div className="flex gap-4">
          <img src={portraitImg} alt={`${c.name}的画像`} className="hidden h-44 w-32 shrink-0 rounded-xl object-cover sm:block" />
          <div className="min-w-0 flex-1">
            <FateWheel c={c} threshold={state.threshold} realmName={realmText} />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <Bar label="气血" value={c.hp} max={c.maxHp} color="var(--red)" icon="血" />
          <Bar label="灵力" value={c.mp} max={c.maxMp} color="var(--accent)" icon="灵" />
          <Bar label="修为（本阶）" value={c.cultivation} max={state.threshold} color="var(--gold)" icon="修" />
          {/* U-609：寿元按月结算——条与数字都以月计（上限 = 寿元年数 × 每年月数），余月逐月递减，不再整年跳变 */}
          <Bar label="寿元（月）" value={Math.max(0, c.lifespan * state.timeCosts.monthsPerYear - c.totalMonths)} max={c.lifespan * state.timeCosts.monthsPerYear} color="#8a6d3b" icon="寿" />
        </div>
        {/* U-609：寿元将尽提示按月口径——余寿不足一年（12 个月）时出现 */}
        {!c.dead && c.lifespan * state.timeCosts.monthsPerYear - c.totalMonths <= state.timeCosts.monthsPerYear && (
          <p className="mt-2 text-xs font-bold text-[var(--red)]">寿元将尽——余 {Math.max(0, c.lifespan * state.timeCosts.monthsPerYear - c.totalMonths)} 个月，大限将至，早做轮回打算。</p>
        )}
        {/* 摘要行：常用数值一眼可见，其余贴片与境界梯收进「属性详情」 */}
        <p className="mt-3 text-xs leading-relaxed text-[var(--dim)]">
          {c.origin} · {c.rootName} · 战力 {c.might} · 神识 {c.sense} · 机缘 {c.fortune} · 体魄 {c.body} · 传承点 {c.legacyPoints} · 承世玉 {c.jadeLayers} 层{c.destinyName ? ` · ${c.destinyName}` : ""}
        </p>
        <button type="button" aria-expanded={showDetail} onClick={() => setShowDetail(!showDetail)}
          className="mt-2 rounded-full bg-[var(--surface2)] px-3.5 py-2 text-xs font-bold transition active:scale-95">
          属性详情 {showDetail ? "收起 ▴" : "展开 ▾"}
        </button>
        {showDetail && (<>
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-full bg-[var(--surface2)] px-2.5 py-1">出身 · {c.origin}</span>
          {c.destinyName && <span className="rounded-full bg-[var(--gold-soft)] px-2.5 py-1 text-[var(--gold)]" title={c.destinyDesc}>命格 · {c.destinyName}</span>}
          <span className="rounded-full bg-[var(--surface2)] px-2.5 py-1">灵根 · {c.rootName}</span>
          <span className="rounded-full bg-[var(--surface2)] px-2.5 py-1">{c.sectRankName ? `青云宗 · ${c.sectRankName}（贡献 ${c.sectContrib}）` : "未入宗门"}</span>
          <span className={`rounded-full px-2.5 py-1 ${c.artifactSealed ? "bg-[var(--gold-soft)] text-[var(--gold)]" : "bg-[var(--surface2)]"}`}>本命法宝 · {c.artifactName ? (c.artifactSealed ? `${c.artifactName}（境界不足，暂不可用：需${c.artifactMinRealmName}境，当前${state.realmNames[c.realmIdx] ?? ""}境，达门槛自动解封）` : `${c.artifactName}（需${c.artifactMinRealmName}境 ✓）`) : (state.settings.q9.value === "from_start" ? "暂无" : "暂无（Q9：死后从所得中挑）")}</span>
          {c.techniqueName && <span className="rounded-full bg-[var(--surface2)] px-2.5 py-1">功法 · {c.techniqueName}{c.techniqueProgress?.mastered ? " · 精通" : ""}</span>}
          <span className="rounded-full bg-[var(--surface2)] px-2.5 py-1">战力 {c.might}</span>
          <span className="rounded-full bg-[var(--surface2)] px-2.5 py-1">神识 {c.sense}</span>
          <span className="rounded-full bg-[var(--surface2)] px-2.5 py-1">机缘 {c.fortune}</span>
          <span className="rounded-full bg-[var(--surface2)] px-2.5 py-1">体魄 {c.body}</span>
          {c.talentNames.map((t) => <span key={t} className="rounded-full bg-[var(--gold-soft)] px-2.5 py-1 text-[var(--gold)]">天赋 · {t}</span>)}
          {c.caveLevel > 0 && <span className="rounded-full bg-[var(--surface2)] px-2.5 py-1">洞府聚灵阵 {c.caveLevel} 级（修炼 +{c.caveLevel * 3}）</span>}
          {c.breakBonus > 0 && <span className="rounded-full bg-[var(--gold-soft)] px-2.5 py-1 text-[var(--gold)]">破境助力 +{c.breakBonus}（下次突破消耗）</span>}
          <span className="rounded-full bg-[var(--surface2)] px-2.5 py-1">传承点 {c.legacyPoints}</span>
          <span className="rounded-full bg-[var(--surface2)] px-2.5 py-1">轮回点 {state.reincarnationPoints}（开局分配用）</span>
          <span className="rounded-full bg-[var(--surface2)] px-2.5 py-1">承世玉 {c.jadeLayers} 层（检定 +{c.jadeLayers * 2}）</span>
          {c.sealedMemory && <span className="rounded-full bg-[var(--gold-soft)] px-2.5 py-1 text-[var(--gold)]">前世记忆封印中（识海深处）</span>}
          {!c.sealedMemory && c.lifeNo > 1 && <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[var(--accent)]">上一世记忆清晰</span>}
          <span className="rounded-full bg-[var(--surface2)] px-2.5 py-1">累计修为 {c.totalCultivation}</span>
          <span className="rounded-full bg-[var(--surface2)] px-2.5 py-1">本世已历 {c.totalMonths} 个月（细时钟 · 年龄 {ageTextOf(c)}）</span>
          {locState && locState.decayPct < 100 && <span className="rounded-full bg-[var(--surface2)] px-2.5 py-1">本地本周收益 {locState.decayPct}%（刷多了会衰减）</span>}
        </div>

        <div className="mt-4" role="img" aria-label={`境界梯：当前${realmText}`}>
          <p className="mb-1.5 text-xs font-bold text-[var(--dim)]">境界梯 · {state.realmNames.length} 境 × 初期/中期/后期/大圆满</p>
          <div className="flex flex-wrap items-end gap-1">
            {state.realmNames.map((r, i) => (
              <div key={r} className="flex flex-col items-center" style={{ marginBottom: `${Math.min(i * 3, 18)}px` }}>
                <span className={`rounded-lg px-2 py-1.5 font-song text-sm font-bold ${i < c.realmIdx ? "bg-[var(--gold)] text-[var(--on-bright)]" : i === c.realmIdx ? "bg-[var(--accent)] text-[var(--on-bright)] frontier-pulse" : "bg-[var(--surface2)] text-[var(--dim)]"}`}>{r}</span>
                {i === c.realmIdx && <span className="mt-0.5 text-[10px] text-[var(--accent)]">{state.stageNames[c.stageIdx]}</span>}
              </div>
            ))}
          </div>
        </div>
        </>)}

        {/* 承世玉祭练（埋遗藏在「社交经济」页）；路线进行中先走路线 */}
        {!c.dead && !c.pendingEvent && !c.route && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={busy || c.totalMonths + 5 * state.timeCosts.monthsPerYear >= c.lifespan * state.timeCosts.monthsPerYear} onClick={onJade}
              aria-label="祭练承世玉，献祭五年寿元叠一层永久加成"
              className="rounded-full bg-[var(--surface2)] px-3.5 py-2 text-xs font-bold disabled:opacity-40">
              祭练承世玉（−5 年寿元，检定永久 +2）
            </button>
          </div>
        )}
      </section>
      )}

      {/* dice result（常驻：任何一页的行动结果都立刻可见） */}
      {c.lastRoll && !c.dead && <Dice roll={c.lastRoll} />}

      {/* death / reincarnation（常驻：轮回结算流程不受分页影响） */}
      {c.dead ? (
        <>
          <p className="rounded-xl bg-[var(--gold-soft)] p-3 text-sm">记忆预判：{memoryPreview(c, state.settings.q3.value, state.settings.q7.value)}。进入结算后揭晓，并按评级发放传承点与天赋候选。</p>
          <ReincarnationPanel state={state} busy={busy} prepareFailed={prepareFailed} onPrepare={onPrepare} onAllocatePoints={onAllocatePoints} onResetDraw={onResetDraw} onBuyBoon={onBuyBoon} onKeepsake={onKeepsake} onSelectFreeTechnique={onSelectFreeTechnique} onConfirm={onReincarnate} onDraw={onDraw} drawing={drawing} onChoice={onChoice} onTalents={onTalents} />
        </>
      ) : c.pendingEvent ? (
        /* 待决事件（常驻：探索在哪页触发，选项就在哪页结算，不跳页） */
        <section aria-label="当前事件" className="fade-slide-in overflow-hidden rounded-[var(--radius)] border-2 border-[var(--accent)] bg-[var(--surface)]">
          <div className="relative">
            <img src={ART_BY_KEY[c.pendingEvent.art] ?? realmImg} alt="" loading="lazy" decoding="async" className="h-32 w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8">
              <p className="font-brush text-lg font-black text-white">{c.pendingEvent.title}</p>
            </div>
          </div>
          <div className="p-4">
            <p className="text-sm leading-relaxed">{c.pendingEvent.desc}</p>
            {c.pendingEvent.trio && <p className="mt-2 text-xs font-bold text-[var(--gold)]">三选一抉择：三种取向，三种后果——选定即结算，没有回头路。</p>}
            {c.pendingEvent.dual && <p className="mt-2 text-xs font-bold text-[var(--gold)]">双解法：同一桩事，两条路——各走一次判定，收获的侧重各不相同，挑合你本事的那条。</p>}
            {c.pendingEvent.moral && <p className="mt-2 text-xs font-bold text-[var(--gold)]">道德分叉：一念行善，一念夺宝——行善结好感与善缘，夺宝得横财也记恶缘与仇家，都记在因果账上。</p>}
            <div className="mt-3 space-y-2">
              {c.pendingEvent.options.map((o, i) => (
                <button key={i} type="button" disabled={busy || !!o.costBlocked} onClick={() => onChoose(i)}
                  aria-label={`选择：${o.label}，${o.hint}${o.dc > 0 ? `，难度 ${o.dc}` : ""}${o.cost ? `，代价：${costText(o.cost)}，选定即付` : ""}${o.costBlocked ? `，不可选：${o.costBlocked}` : ""}${o.loop ? "，见好就收型：成功后可继续加圈或收手" : ""}`}
                  className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 text-left transition active:scale-[0.99] disabled:opacity-50">
                  <span className="glyph-tile text-2xl" aria-hidden>骰</span>
                  <span className="flex-1">
                    <span className="block font-song text-base font-bold">{o.label}</span>
                    <span className="block text-xs text-[var(--dim)]">{o.hint}{o.dc > 0 ? ` · 掷骰判定 · 基准难度 ${o.dc}（掷骰时按本系统骰面换算）` : " · 不掷骰"}</span>
                    {o.cost && <span className="mt-0.5 block text-xs font-bold text-[var(--gold)]">代价：{costText(o.cost)}（选定即付，成败不退）</span>}
                    {o.costBlocked && <span className="mt-0.5 block text-xs font-bold text-[var(--red)]">{o.costBlocked}</span>}
                    {o.loop && <span className="mt-0.5 block text-xs font-bold text-[var(--accent)]">见好就收型：成功后可抉择——继续加圈（难度与收益同涨）或收手保住已得收获</span>}
                  </span>
                  <span className="text-[var(--accent)]">{pendingKey === `choose:${i}` ? "…" : "▸"}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : c.route ? (
        /* 分叉路线（U-381，常驻：路线进行中先选节点，选定即触发对应际遇并推进一层） */
        <section aria-label="分叉路线" className="fade-slide-in overflow-hidden rounded-[var(--radius)] border-2 border-[var(--gold)] bg-[var(--surface)]">
          <div className="p-4">
            <p className="font-brush text-lg font-black"><Seal ch="路" /> 分叉路线 · 第 {c.route.layer}/{c.route.totalLayers} 层
              <span className="ml-2 text-xs font-normal text-[var(--dim)]">{currentLoc?.name} · 三条岔路任选其一——走哪条，本身就是策略</span>
            </p>
            <div className="mt-2 flex gap-1" role="img" aria-label={`路线进度：第 ${c.route.layer} 层，共 ${c.route.totalLayers} 层`}>
              {Array.from({ length: c.route.totalLayers }).map((_, i) => (
                <span key={i} className={`h-1.5 flex-1 rounded-full ${c.route && i < c.route.layer ? "bg-[var(--gold)]" : "bg-[var(--surface2)]"}`} aria-hidden />
              ))}
            </div>
            <div className="mt-3 space-y-2">
              {c.route.nodes.map((n, i) => {
                const meta = ROUTE_NODE_META[n.type] ?? { icon: "途", label: n.type, sub: "" };
                const foe = n.enemyName ? `${n.enemyName}（${n.enemyTierName}境 · 难度 ${n.enemyDc}）` : "";
                return (
                  <button key={i} type="button" disabled={busy} onClick={() => onChooseRouteNode(i)}
                    aria-label={`选择${meta.label}节点${foe ? `：对手${foe}` : ""}，${meta.sub}`}
                    className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 text-left transition active:scale-[0.99] disabled:opacity-50">
                    <span className="glyph-tile text-2xl" aria-hidden>{meta.icon}</span>
                    <span className="flex-1">
                      <span className="block font-song text-base font-bold">{meta.label}{foe && <span className="ml-2 text-sm text-[var(--red)]">{foe}</span>}</span>
                      <span className="block text-xs text-[var(--dim)]">{meta.sub}</span>
                    </span>
                    <span className="text-[var(--gold)]">{pendingKey === `route:${i}` ? "…" : "▸"}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" disabled={busy} onClick={onAbandonRoute}
              className="mt-3 rounded-full bg-[var(--surface2)] px-3.5 py-2 text-xs font-bold transition active:scale-95 disabled:opacity-40">
              就此收程（放弃本程路线，回到日常行动）
            </button>
          </div>
        </section>
      ) : tab === "role" ? (
        /* ===== 角色页：修炼 / 突破 / 休整 + 预设路线（探索与副职分别在地图探索、修炼宗门页） ===== */
        <section aria-label="行动" className="rounded-[var(--radius)] bg-[var(--surface)] p-4">
          <p className="mb-2.5 text-sm font-bold">这一程，做点什么？<span className="ml-2 text-xs font-normal text-[var(--dim)]">时间按月流逝（细时钟）：修炼耗 {costOf("cultivate")} 月 · 突破耗 {costOf("breakthrough")} 月 · 休整耗 {costOf("rest")} 月，余项见「地图探索」页的细时钟耗时表 · 本周同类收益会衰减 · 也可排预设路线自动连走</span></p>
          <div className="grid grid-cols-3 gap-2 touch-manipulation">
            {/* U-627：无灵根角色的修炼动作即「炼体」（服务端按体魄驱动结算），按钮随灵根换口径 */}
            <button type="button" disabled={busy} onClick={() => onAct("cultivate")} className="rounded-xl bg-[var(--accent)] p-3 text-center text-[var(--on-bright)] transition active:scale-95 disabled:opacity-40">
              <span className="block font-brush text-2xl" aria-hidden>{pendingKey === "act:cultivate" ? "…" : c.rootId === "noroot" ? "炼" : "修"}</span><span className="mt-1 block text-sm font-bold">{c.rootId === "noroot" ? "炼体" : "修炼"}</span><span className="block text-[11px] opacity-85">{c.rootId === "noroot" ? "以体魄锤炼 · 修为上升" : "修为上升"}</span>
            </button>
            <button type="button" disabled={busy || !canBreak} onClick={() => onAct("breakthrough")} className="rounded-xl bg-[var(--red)] p-3 text-center text-[var(--on-bright)] transition active:scale-95 disabled:opacity-40" aria-label={canBreak ? "突破境界" : `突破境界，修为还差 ${state.threshold - c.cultivation}`}>
              <span className="block font-brush text-2xl" aria-hidden>{pendingKey === "act:breakthrough" ? "…" : "破"}</span><span className="mt-1 block text-sm font-bold">突破</span><span className="block text-[11px] opacity-85">{canBreak ? (c.breakFails > 0 ? `渡关 · 保底−${Math.min(20, c.breakFails * 5)}` : "d100 渡关") : `还差 ${state.threshold - c.cultivation}`}</span>
            </button>
            <button type="button" disabled={busy} onClick={() => onAct("rest")} className="rounded-xl bg-[var(--surface2)] p-3 text-center transition active:scale-95 disabled:opacity-40">
              <span className="block font-brush text-2xl" aria-hidden>{pendingKey === "act:rest" ? "…" : "息"}</span><span className="mt-1 block text-sm font-bold">休整</span><span className="block text-[11px] text-[var(--dim)]">回血+修为</span>
            </button>
          </div>

          {/* 预设路线：一次排好自动连走，省去重复点击 */}
          <div className="mt-3 rounded-xl bg-[var(--bg)] p-3">
            {c.quickPlan.length === 0 ? (
              <>
                <p className="text-xs font-bold text-[var(--dim)]">预设路线 · 排好后自动连走（单次最多 12 步，陨落即停）</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={() => onSetPlan([{ kind: "cultivate", count: 5 }])} className="rounded-full bg-[var(--surface2)] px-3.5 py-2 text-xs font-bold transition active:scale-95 disabled:opacity-40">闭关五年</button>
                  <button type="button" disabled={busy} onClick={() => onSetPlan([{ kind: "cultivate", count: 5 }, { kind: "rest", count: 1 }, { kind: "cultivate", count: 4 }])} className="rounded-full bg-[var(--surface2)] px-3.5 py-2 text-xs font-bold transition active:scale-95 disabled:opacity-40">苦修九年</button>
                  <button type="button" disabled={busy} onClick={() => onSetPlan([{ kind: craft.kind, count: 3 }])} className="rounded-full bg-[var(--surface2)] px-3.5 py-2 text-xs font-bold transition active:scale-95 disabled:opacity-40">{craft.icon} {craft.label}三回</button>
                  <button type="button" disabled={busy} onClick={() => onSetPlan([{ kind: "rest", count: 2 }])} className="rounded-full bg-[var(--surface2)] px-3.5 py-2 text-xs font-bold transition active:scale-95 disabled:opacity-40">静养两月</button>
                </div>
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 text-xs">路线未走完：<b>{c.quickPlan.map((s) => `${c.rootId === "noroot" && s.kind === "cultivate" ? "炼体" : PLAN_LABEL[s.kind] ?? s.kind}×${s.count}`).join(" → ")}</b></p>
                <button type="button" disabled={busy} onClick={onRunPlan} className="rounded-full bg-[var(--accent)] px-3.5 py-2 text-xs font-bold text-[var(--on-bright)] transition active:scale-95 disabled:opacity-40">{pendingKey === "plan" ? "执行中…" : "▶ 继续执行"}</button>
                <button type="button" disabled={busy} onClick={onClearPlan} className="rounded-full bg-[var(--surface2)] px-3.5 py-2 text-xs font-bold transition active:scale-95 disabled:opacity-40">✕ 清空路线</button>
              </div>
            )}
          </div>
        </section>
      ) : tab === "map" && !c.dead ? (
        /* ===== 地图探索页：探索（触发事件，事件卡在本页上方结算） ===== */
        <section aria-label="探索" className="rounded-[var(--radius)] bg-[var(--surface)] p-4">
          <p className="mb-2.5 text-sm font-bold">在{currentLoc?.name}四下探索<span className="ml-2 text-xs font-normal text-[var(--dim)]">探索耗 {costOf("explore")} 月 · 踏上分叉路线（共 5 层，每层三选一：战斗/精英/事件/商店/休息），节点在本页上方就地结算</span></p>
          <button type="button" disabled={busy} onClick={() => onAct("explore")} className="w-full rounded-xl bg-[var(--gold)] p-3 text-center text-[var(--on-bright)] transition active:scale-[0.99] disabled:opacity-40">
            <span className="font-brush text-2xl" aria-hidden>{pendingKey === "act:explore" ? "…" : "探"}</span>
            <span className="ml-2 font-song text-base font-bold">探索</span>
            <span className="ml-2 text-xs opacity-85">{buriedHere.length > 0 ? "此地有前世遗藏！" : "踏上分叉路线"}</span>
          </button>
        </section>
      ) : tab === "sect" && sectSub === "main" && !c.dead ? (
        /* ===== 修炼宗门页：副职（炼丹/炼器/灵田/垂钓，随所在地点而定） ===== */
        <section aria-label="副职" className="rounded-[var(--radius)] bg-[var(--surface)] p-4">
          <p className="mb-2.5 text-sm font-bold">副职 · 在{currentLoc?.name}可做的营生<span className="ml-2 text-xs font-normal text-[var(--dim)]">耗 {costOf("craft")} 月 · 换个地点，副职也跟着变</span></p>
          <button type="button" disabled={busy} onClick={() => onAct(craft.kind)} className="w-full rounded-xl bg-[var(--ink)] p-3 text-center text-[var(--on-ink)] transition active:scale-[0.99] disabled:opacity-40">
            <span className="font-brush text-2xl" aria-hidden>{pendingKey === `act:${craft.kind}` ? "…" : craft.icon}</span>
            <span className="ml-2 font-song text-base font-bold">{craft.label}</span>
            <span className="ml-2 text-xs opacity-85">{craft.sub}</span>
          </button>
          {/* U-482 熟练度面板：四门副职各自的使用次数/熟练度/等级与
              破限解锁（服务端按配置表整形下发，只展示）。等级同时
              决定副职判定 d60 的骰面下限，破限解锁成功收益加成。 */}
          <div className="mt-3 space-y-2">
            <p className="text-xs font-bold text-[var(--dim)]">熟练度 · 四门各自精进（等级定副职判定下限，破限解锁产量加成）</p>
            {c.craftSkills.map((s) => {
              const isHere = s.kind === craft.kind;
              const pct = s.nextLevelAt ? Math.min(100, Math.round((s.uses / s.nextLevelAt) * 100)) : 100;
              return (
                <div key={s.kind} className={`rounded-xl border p-2.5 ${isHere ? "border-[var(--gold)] bg-[var(--gold-soft)]" : "border-[var(--border)] bg-[var(--bg)]"}`}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                    <span className="font-song text-sm font-bold">{s.label}</span>
                    <span className="rounded bg-[var(--surface2)] px-1.5 py-0.5 font-bold">Lv{s.level} {s.levelName}</span>
                    <span className="text-[var(--dim)]">熟练度 {s.proficiency} · 本世已练 {s.uses} 次</span>
                    {s.yieldPct > 0 && <span className="font-bold text-[var(--gold)]">成功收益 +{s.yieldPct}%</span>}
                    {isHere && <span className="text-[var(--dim)]">（此地营生）</span>}
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface2)]" role="img" aria-label={`${s.label}熟练度进度：已练 ${s.uses} 次${s.nextLevelAt ? `，再练 ${s.nextLevelAt - s.uses} 次破限至${s.nextLevelName}` : "，已达最高等级"}`}>
                    <div className="h-full rounded-full bg-[var(--gold)] transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-[var(--dim)]">
                    {s.nextLevelAt
                      ? <>再练 {s.nextLevelAt - s.uses} 次破限至 Lv{s.level + 1}「{s.nextLevelName}」：{s.breakthroughs.find((b) => b.level === s.level + 1)?.desc ?? ""}</>
                      : <>已臻最高等级：{s.breakthroughs[s.breakthroughs.length - 1]?.desc ?? ""}</>}
                    {" · "}已解锁：{s.breakthroughs.filter((b) => b.unlocked).length > 0 ? s.breakthroughs.filter((b) => b.unlocked).map((b) => `Lv${b.level} ${b.label}（+${b.yieldPct}%）`).join("、") : "暂无"}
                  </p>
                </div>
              );
            })}
          </div>
          {/* U-464 锻造台 + U-619 炼制双门槛：选一阶矿石开炉锻造法
              宝——开炉须炼器等级与境界双门槛同时达标（逐阶明示要
              求，未达项由服务端整形写进不可锻原因）；过门槛后代价
              先付（矿石 1 块 + 灵石），副职 d60 判定（炼器熟练度定
              骰面下限），成功按品阶从同一法宝池产出、守 U-618 门
              槛，失败矿石报废不扣寿元。 */}
          <div className="mt-4 border-t border-[var(--border)] pt-3">
            <p className="text-xs font-bold text-[var(--dim)]">锻造台 · 以矿石锻造法宝（耗 {costOf("craft")} 月 · 计入炼器熟练度）</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--dim)]">
              开炉须炼器等级与境界双门槛同时达标（逐阶见下方「门槛」行，缺哪项会明示）。过门槛后先付矿石 1 块与灵石，判定失败矿石报废、灵石不退（不伤寿元）。锻出之宝出自同一法宝池，境界未达其门槛先封存、达门槛自动解封。矿石来源：临渊坊市矿行购买，或探索际遇办妥后 {state.forge.dropChancePct}% 概率拾得。
              {c.artifactId ? <>你已有本命法宝「{c.artifactName}」——锻造成功将以新宝替换之，旧宝灵光散尽。</> : <>你尚无本命法宝。</>}
            </p>
            <div className="mt-2 space-y-2">
              {state.forge.tiers.map((t) => (
                <div key={t.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-2.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                    <span className="font-song text-sm font-bold">{t.tier}阶 · {t.name}</span>
                    <span className="rounded bg-[var(--surface2)] px-1.5 py-0.5 font-bold">锻{t.artifactRealmName}门槛法宝</span>
                    <span className="rounded bg-[var(--surface2)] px-1.5 py-0.5 font-bold">门槛：炼器 Lv{t.minCraftLevel}「{t.minCraftLevelName}」· {t.minRealmName}境</span>
                    <span className="text-[var(--dim)]">持有 {t.owned} 块 · 难度 {t.dc} · 灵石 {t.stoneCost}</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-[var(--dim)]">可锻：{t.artifacts.join("、")}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <button type="button" disabled={busy || !!t.blockReason || !!c.pendingEvent || !!c.route} onClick={() => onForgeArtifact(t.tier)}
                      aria-label={t.blockReason ? `锻造${t.tier}阶法宝不可用：${t.blockReason}` : `以${t.name}锻造法宝，耗矿石一块、灵石${t.stoneCost}`}
                      className="rounded-full bg-[var(--ink)] px-3.5 py-2 text-xs font-bold text-[var(--on-ink)] transition active:scale-95 disabled:opacity-40">
                      {pendingKey === `forge:${t.tier}` ? "开炉中…" : "开炉锻造"}
                    </button>
                    {t.blockReason && <span className="text-[11px] font-bold text-[var(--red)]">{t.blockReason}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ===== 地图探索页：世界地图（旅行） ===== */}
      {tab === "map" && showMap && (
        <section aria-label="世界地图" className="cv-auto">
          <h2 className="mb-2 font-brush text-lg font-black"><Seal ch="图" /> 世界地图 <span className="text-xs font-normal text-[var(--dim)]">点地点启程，耗时按目的地远近 1–6 月（各地点耗时见下方卡片与细时钟表）· 灰色为未解锁</span></h2>
          <div className="grid grid-cols-2 gap-2.5">
            {LOCATIONS.map((l) => {
              const here = c.locationId === l.id;
              const ls = state.locations.find((x) => x.id === l.id);
              const locked = ls?.locked ?? false;
              return (
                <button key={l.id} type="button" disabled={busy || here || c.dead || !!c.pendingEvent || !!c.route || locked} onClick={() => onTravel(l.id)}
                  aria-label={here ? `当前地点：${l.name}` : locked ? `${l.name}，未解锁：${ls?.lockReason ?? ""}` : `前往${l.name}`}
                  className={`relative overflow-hidden rounded-[var(--radius)] text-left disabled:opacity-90 ${here ? "ring-[3px] ring-[var(--gold)]" : ""}`}>
                  <img src={l.img} alt="" loading="lazy" decoding="async" className={`h-24 w-full object-cover ${locked ? "opacity-50 grayscale" : ""}`} />
                  <span className="absolute inset-x-0 bottom-0 block bg-gradient-to-t from-black/75 to-transparent p-2 pt-6">
                    <span className="block font-song text-sm font-bold text-[var(--on-bright)]">{pendingKey === `travel:${l.id}` ? "启程中…" : <>{locked ? "锁 " : ""}{l.name} {here && <span className="ml-1 rounded bg-[var(--gold)] px-1.5 py-0.5 text-[10px] text-[var(--on-bright)]">在此</span>}</>}</span>
                    <span className="block text-[11px] text-white/85">{locked ? (ls?.lockReason ?? "") : l.desc}{!locked && !here ? ` · 启程 ${travelOf(l.id)} 月` : ""}{!locked && ls && ls.decayPct < 100 ? ` · 本周收益 ${ls.decayPct}%` : ""}{!locked && ls ? ` · 事件${ls.densityWord}` : ""}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ===== 地图探索页：三界秘境（U-401 固定掉落槽与隐藏 Boss） ===== */}
      {tab === "map" && !c.dead && (
        <section aria-label="三界秘境" className="rounded-[var(--radius)] bg-[var(--surface)] p-4">
          <h2 className="font-brush text-base font-black"><Seal ch="境" /> 三界秘境 <span className="text-xs font-normal text-[var(--dim)]">每界每世各藏三份秘藏：稀有丹药、失传典籍、秘境之主——探索时丹药/典籍各有 {state.secretRealms.slotChancePct}% 概率寻得（领完本世即空，轮回重置）；秘境之主须先在该界触发专属前置际遇才会被惊动，现身概率 {state.secretRealms.bossChancePct}%，打赢得传承点与该档法宝，败北可再战</span></h2>
          <div className="mt-3 space-y-2">
            {state.secretRealms.realms.map((r) => {
              const pillText = "丹药 · " + r.pillName + "×" + r.pillCount + (r.pillClaimed ? "（本世已领）" : "");
              const techText = "典籍 · " + r.techGrade + "阶失传功法" + (r.techClaimed ? "（本世已领）" : "");
              const bossText = "秘境之主 · " + r.bossName + (r.bossDefeated ? "（本世已击败）" : r.bossReady ? "（已被惊动，随时现身）" : "（沉睡中 · 先触发前置际遇）");
              const bossCls = r.bossDefeated ? "bg-[var(--surface2)] text-[var(--dim)]" : r.bossReady ? "bg-[var(--red)] text-[var(--on-bright)]" : "bg-[var(--surface2)] text-[var(--dim)]";
              return (
              <div key={r.locationId} className={`rounded-xl border p-3 ${r.atLocation ? "border-[var(--gold)] bg-[var(--gold-soft)]" : "border-[var(--border)] bg-[var(--bg)]"}`}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                  <span className="font-song text-sm font-bold">{r.locationName}</span>
                  {r.atLocation && <span className="rounded bg-[var(--gold)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--on-bright)]">在此</span>}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                  <span className={`rounded-full px-2 py-0.5 font-bold ${r.pillClaimed ? "bg-[var(--surface2)] text-[var(--dim)]" : "bg-[var(--accent-soft)] text-[var(--accent)]"}`}>{pillText}</span>
                  <span className={`rounded-full px-2 py-0.5 font-bold ${r.techClaimed ? "bg-[var(--surface2)] text-[var(--dim)]" : "bg-[var(--accent-soft)] text-[var(--accent)]"}`}>{techText}</span>
                  <span className={`rounded-full px-2 py-0.5 font-bold ${bossCls}`}>{bossText}</span>
                </div>
                {!r.bossDefeated && <p className="mt-1 text-[11px] leading-relaxed text-[var(--dim)]">{r.bossIntro}</p>}
              </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ===== 地图探索页：委托板（U-388 接取式支线） ===== */}
      {tab === "map" && !c.dead && (
        <section aria-label="委托板" className="rounded-[var(--radius)] bg-[var(--surface)] p-4">
          <h2 className="font-brush text-base font-black"><Seal ch="榜" /> 委托板 <span className="text-xs font-normal text-[var(--dim)]">告示贴在各处（坊市告示墙 · 山门告示 · 村口老槐树 · 古刹布施榜）· 须身在张贴处揭榜与结算 · 无时限 · 不接无罚 · 同时可接 {state.commissions.maxActive} 张{state.commissions.completedCount > 0 ? ` · 本世已完成 ${state.commissions.completedCount} 件` : ""}</span></h2>

          {state.commissions.active.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-bold text-[var(--dim)]">已接委托</p>
              {state.commissions.active.map((a) => (
                <div key={a.id} className={`rounded-xl border p-3 ${a.done ? "border-[var(--gold)] bg-[var(--gold-soft)]" : "border-[var(--border)] bg-[var(--bg)]"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-song text-sm font-bold">{a.title}</span>
                    <span className="rounded bg-[var(--surface2)] px-1.5 py-0.5 text-[10px] text-[var(--dim)]">{a.issuerName} · {a.issuerTitle}</span>
                    {a.done
                      ? <span className="text-xs font-bold text-[var(--gold)]">✓ 目标已达成，回「{a.boardLocationName}」结算</span>
                      : <span className="text-xs text-[var(--dim)]">{a.objectiveText} · 进度 {a.progress}/{a.need}{a.atTarget ? " · 你正在目标地点" : ""}</span>}
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--surface2)]" role="img" aria-label={`委托进度 ${a.progress}/${a.need}`}>
                    <div className="h-full rounded-full bg-[var(--gold)] transition-all duration-500" style={{ width: `${Math.min(100, (a.progress / Math.max(1, a.need)) * 100)}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--dim)]">报酬：{a.rewardText} · 结算处：「{a.boardLocationName}」告示处</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {a.done && (
                      <button type="button" disabled={busy || !!c.pendingEvent || !!c.route || !a.atBoard} onClick={() => onCommission("claim", a.id)}
                        aria-label={a.atBoard ? `结算委托${a.title}，领取报酬` : `结算委托${a.title}，需先回到${a.boardLocationName}`}
                        className="rounded-full bg-[var(--gold)] px-3.5 py-2 text-xs font-bold text-[var(--on-bright)] transition active:scale-95 disabled:opacity-40">
                        {pendingKey === `commission:claim:${a.id}` ? "结算中…" : a.atBoard ? "回板结算（听委托人讲讲这桩事）" : `回「${a.boardLocationName}」结算`}
                      </button>
                    )}
                    <button type="button" disabled={busy || !!c.pendingEvent || !!c.route} onClick={() => onCommission("abandon", a.id)}
                      aria-label={`放弃委托${a.title}，无惩罚`}
                      className="rounded-full bg-[var(--surface2)] px-3 py-1.5 text-xs font-bold transition active:scale-95 disabled:opacity-40">
                      {pendingKey === `commission:abandon:${a.id}` ? "处理中…" : "撕榜放弃（无惩罚）"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 space-y-2">
            <p className="text-xs font-bold text-[var(--dim)]">板上张贴</p>
            {state.commissions.offered.length === 0 && <p className="text-sm text-[var(--dim)]">眼下告示处暂无新委托——旧榜办完或境界到了，新榜自然会贴出来。</p>}
            {state.commissions.offered.map((o) => (
              <div key={o.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-song text-sm font-bold">{o.title}</span>
                  <span className="rounded bg-[var(--surface2)] px-1.5 py-0.5 text-[10px] text-[var(--dim)]">{o.issuerName} · {o.issuerTitle}</span>
                  <span className="rounded bg-[var(--surface2)] px-1.5 py-0.5 text-[10px] text-[var(--dim)]">贴于「{o.boardLocationName}」</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--dim)]">{o.brief}</p>
                <p className="mt-1 text-[11px] text-[var(--dim)]">目标：{o.objectiveText} · 报酬：{o.rewardText} · 无时限</p>
                <button type="button" disabled={busy || !!c.pendingEvent || !!c.route || !o.atBoard || state.commissions.active.length >= state.commissions.maxActive} onClick={() => onCommission("accept", o.id)}
                  aria-label={o.atBoard ? `接取委托${o.title}` : `接取委托${o.title}，需先前往${o.boardLocationName}揭榜`}
                  className="mt-2 rounded-full bg-[var(--accent)] px-3.5 py-2 text-xs font-bold text-[var(--on-bright)] transition active:scale-95 disabled:opacity-40">
                  {pendingKey === `commission:accept:${o.id}` ? "揭榜中…" : o.atBoard ? "揭榜接取" : state.commissions.active.length >= state.commissions.maxActive ? `已接满 ${state.commissions.maxActive} 张` : `去「${o.boardLocationName}」揭榜`}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ===== 地图探索页：限时帖（U-389 限时事件） ===== */}
      {tab === "map" && !c.dead && (
        <section aria-label="限时帖" className="mt-4 rounded-[var(--radius)] bg-[var(--surface)] p-4">
          <h2 className="font-brush text-base font-black"><Seal ch="帖" /> 限时帖 <span className="text-xs font-normal text-[var(--dim)]">群友发布的限时委托 · 带倒计时（按天/月计）· 接帖后须在限期内办妥，超时即失败 · 接、成、败动声望（只记在发布人情谊与宗门贡献上），不接过期不动声望、也不再重挂· 须身在张贴处揭帖与交帖 · 同时可接 {state.timedEvents.maxActive} 张{state.timedEvents.completedCount > 0 ? ` · 本世已办妥 ${state.timedEvents.completedCount} 件` : ""}{state.timedEvents.failedCount > 0 ? ` · 失败 ${state.timedEvents.failedCount} 件` : ""}{state.timedEvents.lapsedCount > 0 ? ` · 过期 ${state.timedEvents.lapsedCount} 张` : ""}</span></h2>

          {state.timedEvents.active.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-bold text-[var(--dim)]">已接限时帖</p>
              {state.timedEvents.active.map((a) => (
                <div key={a.id} className={`rounded-xl border p-3 ${a.done ? "border-[var(--gold)] bg-[var(--gold-soft)]" : a.daysLeft <= 30 ? "border-[var(--red)] bg-[var(--bg)]" : "border-[var(--border)] bg-[var(--bg)]"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-song text-sm font-bold">{a.title}</span>
                    <span className="rounded bg-[var(--surface2)] px-1.5 py-0.5 text-[10px] text-[var(--dim)]">{a.issuerName} · {a.issuerTitle}</span>
                    {a.done
                      ? <span className="text-xs font-bold text-[var(--gold)]">✓ 已在限期内办妥，回「{a.boardLocationName}」交帖领赏（不再受时限约束）</span>
                      : <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${a.daysLeft <= 30 ? "bg-[var(--red)] text-[var(--on-bright)]" : "bg-[var(--surface2)] text-[var(--dim)]"}`}>倒计时：剩 {a.leftText}</span>}
                    {!a.done && <span className="text-xs text-[var(--dim)]">{a.objectiveText} · 进度 {a.progress}/{a.need}{a.atTarget ? " · 你正在目标地点" : ""}</span>}
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--surface2)]" role="img" aria-label={`限时帖进度 ${a.progress}/${a.need}`}>
                    <div className="h-full rounded-full bg-[var(--red)] transition-all duration-500" style={{ width: `${Math.min(100, (a.progress / Math.max(1, a.need)) * 100)}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--dim)]">报酬：{a.rewardText} · 交帖处：「{a.boardLocationName}」 · 声望账：{a.repText}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {a.done && (
                      <button type="button" disabled={busy || !!c.pendingEvent || !!c.route || !a.atBoard} onClick={() => onTimedEvent("claim", a.id)}
                        aria-label={a.atBoard ? `交帖结算限时帖${a.title}，领取报酬与成功声望` : `交帖结算限时帖${a.title}，需先回到${a.boardLocationName}`}
                        className="rounded-full bg-[var(--gold)] px-3.5 py-2 text-xs font-bold text-[var(--on-bright)] transition active:scale-95 disabled:opacity-40">
                        {pendingKey === `timed:claim:${a.id}` ? "交帖中…" : a.atBoard ? "交帖领赏（听发布人说说这桩事）" : `回「${a.boardLocationName}」交帖`}
                      </button>
                    )}
                    <button type="button" disabled={busy || !!c.pendingEvent || !!c.route} onClick={() => onTimedEvent("abandon", a.id)}
                      aria-label={`撕掉限时帖${a.title}，按爽约结算失败声望`}
                      className="rounded-full bg-[var(--surface2)] px-3 py-1.5 text-xs font-bold transition active:scale-95 disabled:opacity-40">
                      {pendingKey === `timed:abandon:${a.id}` ? "处理中…" : "撕帖爽约（按失败结声望）"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 space-y-2">
            <p className="text-xs font-bold text-[var(--dim)]">板上挂帖（挂满即过期沉底，不接也动声望）</p>
            {state.timedEvents.offered.length === 0 && <p className="text-sm text-[var(--dim)]">眼下暂无限时帖——旧帖办完、过期或境界到了，新帖自然会挂出来。</p>}
            {state.timedEvents.offered.map((o) => (
              <div key={o.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-song text-sm font-bold">{o.title}</span>
                  <span className="rounded bg-[var(--surface2)] px-1.5 py-0.5 text-[10px] text-[var(--dim)]">{o.issuerName} · {o.issuerTitle}</span>
                  <span className="rounded bg-[var(--surface2)] px-1.5 py-0.5 text-[10px] text-[var(--dim)]">贴于「{o.boardLocationName}」</span>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${o.daysLeft <= 30 ? "bg-[var(--red)] text-[var(--on-bright)]" : "bg-[var(--surface2)] text-[var(--dim)]"}`}>挂帖剩 {o.leftText}过期</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--dim)]">{o.brief}</p>
                <p className="mt-1 text-[11px] text-[var(--dim)]">目标：{o.objectiveText} · 报酬：{o.rewardText} · 接帖后限时 {o.limitText}</p>
                <p className="mt-1 text-[11px] text-[var(--dim)]">声望账：{o.repText}</p>
                <button type="button" disabled={busy || !!c.pendingEvent || !!c.route || !o.atBoard || state.timedEvents.active.length >= state.timedEvents.maxActive} onClick={() => onTimedEvent("accept", o.id)}
                  aria-label={o.atBoard ? `接取限时帖${o.title}，限时${o.limitText}` : `接取限时帖${o.title}，需先前往${o.boardLocationName}揭帖`}
                  className="mt-2 rounded-full bg-[var(--red)] px-3.5 py-2 text-xs font-bold text-[var(--on-bright)] transition active:scale-95 disabled:opacity-40">
                  {pendingKey === `timed:accept:${o.id}` ? "揭帖中…" : o.atBoard ? "揭帖接下（开始倒计时）" : state.timedEvents.active.length >= state.timedEvents.maxActive ? `已接满 ${state.timedEvents.maxActive} 张` : `去「${o.boardLocationName}」揭帖`}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ===== 地图探索页：今日委托（U-390 日常委托事件池） ===== */}
      {tab === "map" && !c.dead && (
        <section aria-label="今日委托" className="mt-4 rounded-[var(--radius)] bg-[var(--surface)] p-4">
          <h2 className="font-brush text-base font-black"><Seal ch="日" /> 今日委托 <span className="text-xs font-normal text-[var(--dim)]">天庭朋友圈 · 地府委托 · 每月刷新一批（每过 1 个月换新批）· 不用接取——进入委托地点即触发 · 办妥当场兑付：天庭给稀有材料、地府给前世线索 · 没办妥不罚，下月整批换新{state.dailyCommissions.completedCount > 0 ? ` · 本世已办妥 ${state.dailyCommissions.completedCount} 件` : ""}</span></h2>

          <div className="mt-3 space-y-2">
            {state.dailyCommissions.pending.length === 0 && state.dailyCommissions.done.length === 0 && <p className="text-sm text-[var(--dim)]">这批委托还没刷出来——境界到了、地点解锁了，日子往前走一个月自然会刷新。</p>}
            {state.dailyCommissions.pending.map((d) => (
              <div key={d.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-song text-sm font-bold"><Seal ch={d.source === "heaven" ? "天" : "冥"} /> {d.title}</span>
                  <span className="rounded bg-[var(--surface2)] px-1.5 py-0.5 text-[10px] text-[var(--dim)]">{d.sourceLabel}</span>
                  <span className="rounded bg-[var(--surface2)] px-1.5 py-0.5 text-[10px] text-[var(--dim)]">{d.issuer}</span>
                  {d.atLocation
                    ? <span className="text-xs font-bold text-[var(--gold)]">你正在此地 · 抵达此地时即触发（本月尚未触发，多半是这桩际遇已被别处抽走，下月刷新再看）</span>
                    : <span className="rounded bg-[var(--surface2)] px-1.5 py-0.5 text-[10px] text-[var(--dim)]">触发地：「{d.locationName}」</span>}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--dim)]">{d.brief}</p>
                <p className="mt-1 text-[11px] text-[var(--dim)]">触发：{d.objectiveText} · 办妥兑付：{d.rewardText} · 无接取 · 未办妥不罚</p>
              </div>
            ))}
            {state.dailyCommissions.done.map((d) => (
              <div key={d.id} className="rounded-xl border border-[var(--gold)] bg-[var(--gold-soft)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-song text-sm font-bold">✓ {d.title}</span>
                  <span className="rounded bg-[var(--surface2)] px-1.5 py-0.5 text-[10px] text-[var(--dim)]">{d.sourceLabel} · {d.issuer}</span>
                  <span className="text-xs font-bold text-[var(--gold)]">本月已办妥，奖励已当场兑付：{d.rewardText}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ===== 地图探索页：签到图鉴（U-391 地点签到 + U-392 签到图鉴） ===== */}
      {tab === "map" && !c.dead && (
        <section aria-label="签到图鉴" className="mt-4 rounded-[var(--radius)] bg-[var(--surface)] p-4">
          <h2 className="font-brush text-base font-black"><Seal ch="鉴" /> 签到图鉴 <span className="text-xs font-normal text-[var(--dim)]">到达指定地点即签到 · 即到即得，不用接取、没有时限 · 大奖每处每世一次（灵石 / 功法 / 法宝，按地点档位）· 图鉴跨世收录 {state.signIns.codexCount}/{state.signIns.codexTotal} 处 · 本世已签到 {state.signIns.signedCount}/{state.signIns.total} 处 · 已签过的地点再抵达不再重发大奖，只给按档小奖</span></h2>

          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="图鉴分档收集进度">
            {[...new Map(state.signIns.spots.map((s) => [s.tier, s.tierLabel])).entries()].map(([tier, label]) => {
              const tierSpots = state.signIns.spots.filter((s) => s.tier === tier);
              const got = tierSpots.filter((s) => s.inCodex).length;
              return (
                <span key={tier} className={`rounded-full px-2 py-0.5 text-[11px] ${got === tierSpots.length ? "bg-[var(--gold)] font-bold text-[var(--on-bright)]" : "bg-[var(--surface2)] text-[var(--dim)]"}`}>{label}档图鉴 {got}/{tierSpots.length}</span>
              );
            })}
          </div>

          <div className="mt-3 space-y-2">
            {state.signIns.spots.map((s) => (
              <div key={s.id} className={`rounded-xl border p-3 ${s.signed ? "border-[var(--gold)] bg-[var(--gold-soft)]" : "border-[var(--border)] bg-[var(--bg)]"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-song text-sm font-bold">{s.signed ? "✓ " : ""}{s.title}</span>
                  <span className="rounded bg-[var(--surface2)] px-1.5 py-0.5 text-[10px] text-[var(--dim)]">{s.tierLabel}签到</span>
                  <span className="rounded bg-[var(--surface2)] px-1.5 py-0.5 text-[10px] text-[var(--dim)]">签到地：「{s.locationName}」</span>
                  {s.inCodex && <span className="rounded bg-[var(--gold)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--on-bright)]">图鉴已收录</span>}
                  {s.signed
                    ? <span className="text-xs font-bold text-[var(--gold)]">本世已签到，大奖已到账（见编年史）· 再抵达只给{s.tierLabel}档小奖</span>
                    : s.inCodex
                      ? <span className="text-xs text-[var(--dim)]">往世已收录图鉴 · 本世尚未签到，抵达「{s.locationName}」即发本世大奖</span>
                      : s.atLocation
                        ? <span className="text-xs font-bold text-[var(--gold)]">你正在此地 · 签到已在抵达时自动结算（见编年史）</span>
                        : <span className="text-xs text-[var(--dim)]">尚未到访 · 抵达「{s.locationName}」即自动签到并收录图鉴</span>}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--dim)]">{s.text}</p>
                <p className="mt-1 text-[11px] text-[var(--dim)]">签到大奖：{s.rewardText}</p>
                <p className="mt-0.5 text-[11px] text-[var(--dim)]">故地重游（本世已签后再抵达）：{s.revisitText}，大奖不再重发</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ===== 地图探索页：封印之蛋（U-393 封印之蛋式收集物） ===== */}
      {tab === "map" && !c.dead && (
        <section aria-label="封印之蛋" className="mt-4 rounded-[var(--radius)] bg-[var(--surface)] p-4">
          <h2 className="font-brush text-base font-black"><Seal ch="印" /> 封印之蛋 <span className="text-xs font-normal text-[var(--dim)]">探索时各地点随机出现 · 拾取记入收集进度（跨世累计，不占丹药囊格子）· 每集齐 {state.sealedEggs.clueThreshold} 枚换一条前世遗藏线索——线索只提示遗藏地点，不直接发奖励 · 已收集 {state.sealedEggs.foundCount}/{state.sealedEggs.total}{state.sealedEggs.nextClueIn > 0 ? ` · 再集 ${state.sealedEggs.nextClueIn} 枚得下一条线索` : " · 蛋已拾尽"}</span></h2>

          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface2)]" role="progressbar" aria-valuenow={state.sealedEggs.foundCount} aria-valuemin={0} aria-valuemax={state.sealedEggs.total} aria-label="封印之蛋收集进度">
            <div className="h-full bg-[var(--gold)]" style={{ width: `${state.sealedEggs.total ? Math.round((state.sealedEggs.foundCount / state.sealedEggs.total) * 100) : 0}%` }} />
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {state.sealedEggs.eggs.map((e) => (
              <span key={e.id} className={`rounded-full px-2 py-0.5 text-[11px] ${e.found ? "bg-[var(--gold)] font-bold text-[var(--on-bright)]" : e.atLocation ? "bg-[var(--accent)] font-bold text-[var(--on-bright)]" : "bg-[var(--surface2)] text-[var(--dim)]"}`}>
                {e.found ? "蛋" : "·"} {e.name}（{e.locationName}）{e.found ? " 已拾" : e.atLocation ? " · 就在此地，探索有机会现身" : ""}
              </span>
            ))}
          </div>

          {state.sealedEggs.clues.length > 0 && (
            <div className="mt-3 space-y-2">
              {state.sealedEggs.clues.map((cl, i) => (
                <div key={i} className="rounded-xl border border-[var(--gold)] bg-[var(--gold-soft)] p-3">
                  <p className="text-xs font-bold">前世遗藏线索 · 第 {i + 1} 条（指向「{cl.locationName}」）</p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--dim)]">{cl.text}</p>
                </div>
              ))}
              {state.sealedEggs.revealedLocationName && (
                <p className="text-[11px] text-[var(--dim)]">当前有一处无主前世遗藏的方位已被标出：「{state.sealedEggs.revealedLocationName}」——去那里探索即可循线寻见，取回前一直有效。</p>
              )}
            </div>
          )}
        </section>
      )}

      {/* ===== 地图探索页：事件外传分包（U-394 探索事件分包/外传） ===== */}
      {tab === "map" && !c.dead && (
        <section aria-label="事件外传" className="mt-4 rounded-[var(--radius)] bg-[var(--surface)] p-4">
          <h2 className="font-brush text-base font-black"><Seal ch="传" /> 事件外传 <span className="text-xs font-normal text-[var(--dim)]">探索事件按外传分包 · 本篇自第一世起轮询，外传包在轮回达到指定世数后解锁、加入本世探索轮询（旧包不删除）· 当前第 {state.eventPacks.lifeNo} 世 · 本世事件池共 {state.eventPacks.poolTotal} 桩</span></h2>
          <div className="mt-3 space-y-2">
            {state.eventPacks.packs.map((p) => (
              <div key={p.id} className={`rounded-xl border p-3 ${p.unlocked ? "border-[var(--gold)] bg-[var(--gold-soft)]" : "border-[var(--border)] bg-[var(--surface2)]"}`}>
                <p className="text-xs font-bold">
                  {p.name}
                  <span className="ml-2 font-normal text-[var(--dim)]">{p.id === "base" ? "第一世起" : `第 ${p.minLife} 世起解锁`} · {p.events.length} 桩际遇 · {p.unlocked ? "已解锁，本世探索可遇" : `尚未解锁（第 ${p.minLife} 世起）`}</span>
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--dim)]">{p.desc}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.events.map((e) => (
                    <span key={e.id} className={`rounded-full px-2 py-0.5 text-[11px] ${p.unlocked ? "bg-[var(--surface)] font-bold" : "bg-[var(--surface)] text-[var(--dim)]"}`}>{e.title}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ===== 地图探索页：事件分批投放（U-395 新增事件分批投放） ===== */}
      {tab === "map" && !c.dead && (
        <section aria-label="事件投放" className="mt-4 rounded-[var(--radius)] bg-[var(--surface)] p-4">
          <h2 className="font-brush text-base font-black"><Seal ch="投" /> 事件投放 <span className="text-xs font-normal text-[var(--dim)]">新增事件按批次投放入池 · 当前最新第 {state.eventReleases.currentVersion} 批 · 本世牌堆按第 {state.eventReleases.lifeVersion} 批建堆——当世牌堆不受后来新批次影响，轮回开新世时自动纳入最新批次，旧存档无需重开</span></h2>
          <div className="mt-3 space-y-2">
            {state.eventReleases.batches.map((b) => (
              <div key={b.version} className={`rounded-xl border p-3 ${b.inThisLife ? "border-[var(--gold)] bg-[var(--gold-soft)]" : "border-[var(--border)] bg-[var(--surface2)]"}`}>
                <p className="text-xs font-bold">
                  第 {b.version} 批{b.version > 1 ? ` · ${b.name}` : " · 首发批"}
                  <span className="ml-2 font-normal text-[var(--dim)]">{b.eventCount} 桩际遇 · {b.inThisLife ? "已随本世牌堆入世，探索可遇" : "尚未入世，轮回开新世后加入轮询"}</span>
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--dim)]">{b.desc}</p>
                {b.events.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {b.events.map((e) => (
                      <span key={e.id} className={`rounded-full px-2 py-0.5 text-[11px] ${b.inThisLife ? "bg-[var(--surface)] font-bold" : "bg-[var(--surface)] text-[var(--dim)]"}`}>{e.title}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ===== 地图探索页：地点掉落（U-396 按地点排布事件掉落） ===== */}
      {tab === "map" && !c.dead && (
        <section aria-label="地点掉落" className="mt-4 rounded-[var(--radius)] bg-[var(--surface)] p-4">
          <h2 className="font-brush text-base font-black"><Seal ch="残" /> 地点掉落 <span className="text-xs font-normal text-[var(--dim)]">探索际遇按地点掉功法残页 · 在一处地点办妥际遇后有 {state.locationDrops.chancePct}% 机会拾得此地残页——地点只决定残页的功法与品质档（下品 / 中品 / 上品），不改际遇本身的出现机会 · 功法槽空着时学会该功法，已在修习功法时残页折作参悟</span></h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {state.locationDrops.drops.map((d) => (
              <div key={d.locationId} className={`rounded-xl border p-3 ${d.atLocation ? "border-[var(--gold)] bg-[var(--gold-soft)]" : "border-[var(--border)] bg-[var(--surface2)]"}`}>
                <p className="text-xs font-bold">
                  {d.locationName}
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold ${d.tier === "high" ? "bg-[var(--gold)] text-[var(--on-bright)]" : d.tier === "mid" ? "bg-[var(--accent)] text-[var(--on-bright)]" : "bg-[var(--surface)] text-[var(--dim)]"}`}>{d.tierLabel}残页</span>
                  {d.atLocation && <span className="ml-2 font-normal text-[var(--dim)]">你正在此地</span>}
                </p>
                <p className="mt-1 text-xs leading-relaxed">功法残页 ·「{d.techniqueName}」<span className="text-[var(--dim)]">（{d.techniqueDesc}）</span></p>
                <p className="mt-0.5 text-[11px] text-[var(--dim)]">已在修习功法时折作参悟：{d.fallbackText}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ===== 地图探索页：细时钟（U-608 细时钟核心与动作耗时配置表） ===== */}
      {tab === "map" && !c.dead && (
        <section aria-label="细时钟" className="mt-4 rounded-[var(--radius)] bg-[var(--surface)] p-4">
          <h2 className="font-brush text-base font-black"><Seal ch="钟" /> 细时钟 <span className="text-xs font-normal text-[var(--dim)]">时间按月流逝 · 1 年 = {state.timeCosts.monthsPerYear} 个月，满 12 个月进 1 岁，年龄按「年+月」显示 · 你本世已历 {c.totalMonths} 个月（{ageTextOf(c)}）· 每个动作的耗时由配置表统一定，短动作省时、长动作费时</span></h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {state.timeCosts.costs.map((t) => (
              <span key={t.key} className="rounded-full bg-[var(--surface2)] px-2.5 py-1 text-xs">{t.label} · {t.months} 月</span>
            ))}
          </div>
          <p className="mt-3 text-xs font-bold text-[var(--dim)]">旅行耗时（按目的地远近）</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {state.timeCosts.travel.map((t) => (
              <span key={t.locationId} className={`rounded-full px-2.5 py-1 text-xs ${t.locationId === c.locationId ? "bg-[var(--gold-soft)] text-[var(--gold)]" : "bg-[var(--surface2)]"}`}>{t.locationName} · {t.months} 月{t.locationId === c.locationId ? "（在此）" : ""}</span>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--dim)]">事件际遇里标注的「年」与祭练承世玉的 5 年寿元，同样按 12 个月一年折算推进；寿元按月结算：上限 = 寿元年数 × 12 个月，累计月份一跨上限即寿终坐化，寿元将尽的提示同样按月计。</p>
        </section>
      )}

      {/* ===== 修炼宗门页：宗门系统（Q14） ===== */}
      {tab === "sect" && sectSub === "main" && !c.dead && (
        <section aria-label="宗门" className="rounded-[var(--radius)] bg-[var(--surface)] p-4">
          <p className="text-sm font-bold"><Seal ch="宗" /> 宗门 · 青云宗 {c.sectRankName ? <span className="ml-1 rounded bg-[var(--accent)] px-1.5 py-0.5 text-[11px] text-[var(--on-bright)]">{c.sectRankName}</span> : <span className="ml-1 text-xs font-normal text-[var(--dim)]">尚未入门</span>}
            {c.sectRankName && <span className="ml-2 text-xs font-normal text-[var(--dim)]">贡献 {c.sectContrib}{c.sectNext ? ` · 晋升${c.sectNext.name}需贡献 ${c.sectNext.contribNeed} + ${state.realmNames[c.sectNext.realmNeed] ?? ""}境${c.sectNext.grantName ? ` · 晋升赐宝「${c.sectNext.grantName}」` : ""}` : " · 已至长老"}</span>}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {!c.sectRankName && (
              <button type="button" disabled={busy || !!c.pendingEvent || c.locationId !== "sect"} onClick={() => onSect("join")}
                className="rounded-full bg-[var(--accent)] px-3.5 py-2 text-xs font-bold text-[var(--on-bright)] disabled:opacity-40">
                {c.locationId === "sect" ? "拜入青云宗（成为外门弟子）" : "拜入宗门（需身在青云山门）"}
              </button>
            )}
            {c.sectRankName && (
              <>
                <button type="button" disabled={busy || !!c.pendingEvent || c.locationId !== "sect"} onClick={() => onSect("chore")}
                  className="rounded-full bg-[var(--surface2)] px-3.5 py-2 text-xs font-bold disabled:opacity-40">
                  {c.locationId === "sect" ? `宗门差事（+贡献 · 耗 ${costOf("sectChore")} 月）` : "宗门差事（需身在青云山门）"}
                </button>
                <button type="button" disabled={busy || !!c.pendingEvent || !canPromote} onClick={() => onSect("promote")}
                  aria-label={c.sectNext ? `晋升为${c.sectNext.name}` : "已至最高位阶"}
                  className="rounded-full bg-[var(--gold)] px-3.5 py-2 text-xs font-bold text-[var(--on-bright)] disabled:opacity-40">
                  {c.sectNext ? `晋升${c.sectNext.name}${canPromote ? "" : "（条件未满）"}` : "已至长老之位"}
                </button>
                <button type="button" disabled={busy || !!c.pendingEvent} onClick={() => onSect("stipend")}
                  className="rounded-full bg-[var(--surface2)] px-3.5 py-2 text-xs font-bold disabled:opacity-40">
                  领月俸（每世一次）
                </button>
              </>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-[var(--dim)]">位阶越高，修炼越快（内门 +2 / 真传 +4 / 长老 +6）；晋升内门 / 真传 / 长老时宗门另赐一件法宝（已持有本命法宝时折作灵石）；宗门身份不跨世继承，轮回后重新入门。</p>
        </section>
      )}

      {/* ===== 修炼宗门页：功法（摘要 + U-613 功法页入口） ===== */}
      {tab === "sect" && sectSub === "main" && (
        <section aria-label="功法" className="rounded-[var(--radius)] bg-[var(--surface)] p-4">
          <h2 className="font-brush text-base font-black"><Seal ch="法" /> 功法</h2>
          {c.techniqueName ? (
            <div className="mt-1.5">
              <p className="text-sm">当前修习 · <b>{c.techniqueName}</b>
                {c.techniqueProgress && <span className="ml-2 rounded bg-[var(--ink)] px-1.5 py-0.5 align-middle text-[11px] font-bold text-[var(--on-ink)]">{c.techniqueProgress.grade}阶</span>}
                {c.techniqueProgress && <span className="ml-2 text-xs text-[var(--dim)]">{c.techniqueProgress.kind}</span>}
                {c.techniqueProgress?.mastered && <span className="ml-2 rounded bg-[var(--seal)] px-1.5 py-0.5 align-middle text-[11px] font-bold text-[#f7f1de]">精通</span>}
                <span className="ml-2 text-xs text-[var(--dim)]">功法加成已计入检定与修炼</span></p>
              {c.techniqueProgress && (
                <div className="mt-2.5 max-w-md">
                  <Bar label={c.techniqueProgress.mastered ? `第 ${c.techniqueProgress.layer} 层 · 圆满` : `第 ${c.techniqueProgress.layer} 层`} value={c.techniqueProgress.layerPoints} max={c.techniqueProgress.pointsPerLayer} color="var(--gold)" icon="层" />
                  <p className="mt-1.5 text-xs leading-relaxed text-[var(--dim)]">
                    {c.techniqueProgress.mastered
                      ? <>已修满全部 {c.techniqueProgress.totalLayers ?? 0} 层，臻至精通：修炼加成 +{c.techniqueProgress.effectiveBonusPct}%（基础 +{c.techniqueProgress.bonusPct}% + 精通一档 +{c.techniqueProgress.masteryStepPct}%）。</>
                      : c.techniqueProgress.totalLayers !== null && c.techniqueProgress.totalPoints !== null
                        ? <>第 {c.techniqueProgress.layer}/{c.techniqueProgress.totalLayers} 层 · 本层 {c.techniqueProgress.layerPoints}/{c.techniqueProgress.pointsPerLayer} 点，距修满精通还差 {c.techniqueProgress.totalPoints - c.techniqueProgress.points} 点，精通后修炼加成自 +{c.techniqueProgress.bonusPct}% 提升至 +{c.techniqueProgress.bonusPct + c.techniqueProgress.masteryStepPct}%（上升一档）。</>
                        : <>第 {c.techniqueProgress.layer} 层 · 本层 {c.techniqueProgress.layerPoints}/{c.techniqueProgress.pointsPerLayer} 点，此功法层数无上限。</>}
                    斗法与修炼中施展此功法，都会攒进度点、攒满一层进下一层。
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-1.5 text-sm text-[var(--dim)]">尚未习得功法。功法可在轮回结算时用传承点赎回，带入下一世修习。</p>
          )}
          {/* U-613：功法页入口——已学功法总览在二级页面集中展示 */}
          <button type="button" onClick={() => setSectSub("techniques")}
            className="mt-3 rounded-full bg-[var(--surface2)] px-3.5 py-2 text-xs font-bold transition active:scale-95">
            功法页 · 已学功法总览 ›
          </button>
        </section>
      )}

      {/* ===== 修炼宗门页 · 二级页面：功法页（U-613） ===== */}
      {tab === "sect" && sectSub === "techniques" && (
        <TechniquesPage state={state} onBack={() => setSectSub("main")} />
      )}

      {/* 斗法（Q15）：有待决事件时先处理事件 */}
      {tab === "sect" && sectSub === "main" && !c.dead && !c.pendingEvent && state.enemiesHere.length > 0 && (
        <section aria-label="斗法" className="rounded-[var(--radius)] bg-[var(--surface)] p-4">
          <h2 className="font-brush text-base font-black"><Seal ch="斗" /> 斗法 <span className="text-xs font-normal text-[var(--dim)]">斗法骰 d20 · 战力计入骰面 vs 按敌手境界定的难度 · 赢得越漂亮奖越多，输得越惨伤越重 · 耗 {costOf("fight")} 月</span></h2>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {state.enemiesHere.map((e) => (
              <div key={e.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-song text-sm font-bold">{e.name} <span className="ml-1 rounded bg-[var(--surface2)] px-1.5 py-0.5 text-[10px] text-[var(--dim)]">{e.tierName}境 · 难度 {e.dc}</span></p>
                  <p className="mt-0.5 text-xs text-[var(--dim)]">{e.desc}</p>
                </div>
                <button type="button" disabled={busy} onClick={() => onFight(e.id)}
                  aria-label={`挑战${e.name}，难度 ${e.dc}`}
                  className="shrink-0 rounded-full bg-[var(--red)] px-3.5 py-2 text-xs font-bold text-[var(--on-bright)] transition active:scale-95 disabled:opacity-40">
                  {pendingKey === `fight:${e.id}` ? "交手…" : "挑战"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ===== 社交经济页：丹药囊（Q17，坊市购买、随身服用、不耗年） ===== */}
      {tab === "social" && !c.dead && !c.pendingEvent && (
        <section aria-label="丹药囊" className="rounded-[var(--radius)] bg-[var(--surface)] p-4">
          <h2 className="font-brush text-base font-black"><Seal ch="丹" /> 丹药囊 <span className="text-xs font-normal text-[var(--dim)]">丹药在临渊坊市购买，物价随境界涨 · 服用不耗年</span></h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy || c.pills.heal <= 0} onClick={() => onEconomy("useHeal")}
              aria-label={`服用回春丹，恢复一半气血，现有 ${c.pills.heal} 枚`}
              className="rounded-full bg-[var(--surface2)] px-3 py-1.5 text-xs font-bold disabled:opacity-40">
              {pendingKey === "eco:useHeal" ? "… " : ""} 回春丹 ×{c.pills.heal}（回血 50%）
            </button>
            <button type="button" disabled={busy || c.pills.cult <= 0} onClick={() => onEconomy("useCult")}
              aria-label={`服用聚气丹，修为加 55，现有 ${c.pills.cult} 枚`}
              className="rounded-full bg-[var(--surface2)] px-3 py-1.5 text-xs font-bold disabled:opacity-40">
              {pendingKey === "eco:useCult" ? "… " : ""} 聚气丹 ×{c.pills.cult}（修为 +55）
            </button>
            <button type="button" disabled={busy || c.pills.brk <= 0} onClick={() => onEconomy("useBreak")}
              aria-label={`服用破境丹，下次突破加 15，现有 ${c.pills.brk} 枚`}
              className="rounded-full bg-[var(--surface2)] px-3 py-1.5 text-xs font-bold disabled:opacity-40">
              {pendingKey === "eco:useBreak" ? "… " : ""} 破境丹 ×{c.pills.brk}（突破 +15）
            </button>
          </div>
        </section>
      )}

      {tab === "social" && !c.dead && !c.pendingEvent && c.locationId === "market" && (
        <section aria-label="坊市商店" className="rounded-[var(--radius)] bg-[var(--surface)] p-4">
          <h2 className="font-brush text-base font-black"><Seal ch="市" /> 临渊坊市 · 丹药铺 <span className="text-xs font-normal text-[var(--dim)]">物价按你的境界分档（当前 {realmName}）· 灵石 {c.stones}</span></h2>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <button type="button" disabled={busy || c.stones < state.shop.healPrice} onClick={() => onEconomy("buyHeal")}
              aria-label={`购买回春丹，${state.shop.healPrice} 灵石，恢复一半气血`}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 text-left transition active:scale-[0.98] disabled:opacity-40">
              <span className="glyph-tile text-xl" aria-hidden>春</span>
              <span className="mt-0.5 block font-song text-sm font-bold">回春丹</span>
              <span className="block text-[11px] text-[var(--dim)]">回血 50% · {state.shop.healPrice} 灵石 · 囊中 {c.pills.heal}</span>
            </button>
            <button type="button" disabled={busy || c.stones < state.shop.cultPrice} onClick={() => onEconomy("buyCult")}
              aria-label={`购买聚气丹，${state.shop.cultPrice} 灵石，修为加 55`}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 text-left transition active:scale-[0.98] disabled:opacity-40">
              <span className="glyph-tile text-xl" aria-hidden>气</span>
              <span className="mt-0.5 block font-song text-sm font-bold">聚气丹</span>
              <span className="block text-[11px] text-[var(--dim)]">修为 +55 · {state.shop.cultPrice} 灵石 · 囊中 {c.pills.cult}</span>
            </button>
            <button type="button" disabled={busy || c.stones < state.shop.breakPrice} onClick={() => onEconomy("buyBreak")}
              aria-label={`购买破境丹，${state.shop.breakPrice} 灵石，下次突破加 15`}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 text-left transition active:scale-[0.98] disabled:opacity-40">
              <span className="glyph-tile text-xl" aria-hidden>破</span>
              <span className="mt-0.5 block font-song text-sm font-bold">破境丹</span>
              <span className="block text-[11px] text-[var(--dim)]">突破 +15 · {state.shop.breakPrice} 灵石 · 囊中 {c.pills.brk}</span>
            </button>
          </div>
          <button type="button" disabled={busy || !state.shop.sellReady} onClick={() => onEconomy("sellPills")}
            className="mt-2 w-full rounded-xl bg-[var(--surface2)] py-2.5 text-sm font-bold transition active:scale-[0.99] disabled:opacity-40">
            {pendingKey === "eco:sellPills" ? "寄卖中…" : state.shop.sellReady ? "寄卖一颗丹药（扣丹药囊里最多的一种 1 颗 · 本周一次）" : "本周已寄卖过丹药"}
          </button>
          {/* U-464 矿行：七阶锻造矿石在此购买（价格同丹药按境界分
              档），买入不耗月；锻造在修炼宗门页的锻造台。 */}
          <div className="mt-3 border-t border-[var(--border)] pt-3">
            <p className="text-xs font-bold text-[var(--dim)]">矿行 · 锻造矿石（去修炼宗门页锻造台开炉）</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {state.forge.tiers.map((t) => (
                <button key={t.id} type="button" disabled={busy || c.stones < t.buyPrice} onClick={() => onBuyOre(t.tier)}
                  aria-label={`购买${t.tier}阶矿石${t.name}，${t.buyPrice} 灵石，现有 ${t.owned} 块`}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-2.5 text-left transition active:scale-[0.98] disabled:opacity-40">
                  <span className="block font-song text-sm font-bold">{t.tier}阶 · {t.name}</span>
                  <span className="block text-[11px] text-[var(--dim)]">{t.buyPrice} 灵石 · 现有 {t.owned} 块 · 锻{t.artifactRealmName}门槛法宝</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {tab === "social" && !c.dead && !c.pendingEvent && c.locationId === "cave" && (
        <section aria-label="洞府" className="rounded-[var(--radius)] bg-[var(--surface)] p-4">
          <h2 className="font-brush text-base font-black"><Seal ch="府" /> 听涛洞府 · 聚灵阵 {c.caveLevel} 级 <span className="text-xs font-normal text-[var(--dim)]">每级在此修炼 +3 修为/年 · 洞府随本世置办，轮回不带走</span></h2>
          <button type="button" disabled={busy || c.caveLevel >= 3 || c.stones < state.shop.caveCost} onClick={() => onEconomy("caveUpgrade")}
            className="mt-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold text-[var(--on-bright)] transition active:scale-95 disabled:opacity-40">
            {c.caveLevel >= 3 ? "聚灵阵已满级" : `${pendingKey === "eco:caveUpgrade" ? "布阵中…" : `升级聚灵阵（${state.shop.caveCost} 灵石）`}`}
          </button>
        </section>
      )}

      {!c.dead && !c.pendingEvent && tab === "social" && (
        <section aria-label="人际关系" className="rounded-[var(--radius)] bg-[var(--surface)] p-4">
          <h2 className="font-brush text-base font-black"><Seal ch="人" /> 人际 <span className="text-xs font-normal text-[var(--dim)]">仇敌在前 · 点名字展开互动 · 道侣助修炼 · 师父减突破难度 · 仇敌仇怨 ≥30 会寻仇</span></h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={busy || !["market", "sect", "temple", "village", "fields", "arena"].includes(c.locationId)} onClick={() => onSocial("meet")}
              className="rounded-full bg-[var(--accent)] px-3.5 py-2 text-xs font-bold text-[var(--on-bright)] transition active:scale-95 disabled:opacity-40">
              {pendingKey === "social:meet:" ? "结识中…" : `广交道友（耗 ${costOf("social")} 月 · 在坊市/山门/古刹/凡村/灵田/论道台）`}
            </button>
          </div>
          {c.relations.length === 0 && <p className="mt-2 text-sm text-[var(--dim)]">这一世还没结下什么关系。去探索碰机缘（论道、采药、测灵台、古刹论道都可能结缘），或点「广交道友」。</p>}
          <div className="mt-2 space-y-2">
            {[...c.relations].sort((a, b) => (a.kind === "enemy" ? 0 : 1) - (b.kind === "enemy" ? 0 : 1) || b.bond - a.bond).map((r) => {
              const meta = REL_META[r.kind] ?? { icon: "友", label: r.kind };
              const isEnemy = r.kind === "enemy";
              const btn = "rounded-full bg-[var(--surface2)] px-3 py-1.5 text-xs font-bold transition active:scale-95 disabled:opacity-40";
              const open = openNpc === r.npcId;
              return (
                <div key={r.npcId} className={`rounded-xl border p-3 ${isEnemy ? "border-[var(--red)] bg-[var(--bg)]" : "border-[var(--border)] bg-[var(--bg)]"}`}>
                  <button type="button" aria-expanded={open} onClick={() => setOpenNpc(open ? null : r.npcId)}
                    aria-label={`${open ? "收起" : "展开"}${r.name}的互动（${meta.label}，${isEnemy ? "仇怨" : "情谊"} ${r.bond}，${bondTier(r.kind, r.bond)}）`}
                    className="flex w-full flex-wrap items-center gap-2 text-left">
                    <span className="font-song text-sm font-bold"><Seal ch={meta.icon} /> {r.name}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold text-[var(--on-bright)] ${isEnemy ? "bg-[var(--red)]" : "bg-[var(--accent)]"}`}>{meta.label}</span>
                    <span className="text-xs text-[var(--dim)]">{isEnemy ? "仇怨" : "情谊"} {r.bond} · {bondTier(r.kind, r.bond)}</span>
                    {isEnemy && r.bond >= 30 && <span className="text-xs font-bold text-[var(--red)]">仇怨已深，探索时可能被寻仇</span>}
                    <span className="ml-auto text-[var(--accent)]" aria-hidden>{open ? "▾" : "▸"}</span>
                  </button>
                  {open && (<>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--surface2)]" role="img" aria-label={`${isEnemy ? "仇怨" : "情谊"} ${r.bond}/100`}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${r.bond}%`, background: isEnemy ? "var(--red)" : "var(--accent)" }} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {!isEnemy && <button type="button" disabled={busy} onClick={() => onSocial("visit", r.npcId)} className={btn} aria-label={`拜访${r.name}，耗 3 月`}>{pendingKey === `social:visit:${r.npcId}` ? "… " : ""}拜访</button>}
                    {r.kind === "partner" && <button type="button" disabled={busy} onClick={() => onSocial("dual", r.npcId)} className={btn} aria-label={`与道侣${r.name}双修，耗 3 月`}>{pendingKey === `social:dual:${r.npcId}` ? "… " : ""}双修</button>}
                    {r.kind === "master" && <button type="button" disabled={busy} onClick={() => onSocial("guidance", r.npcId)} className={btn} aria-label={`向师父${r.name}请教，得破境助力，耗 3 月`}>{pendingKey === `social:guidance:${r.npcId}` ? "… " : ""}请教（破境 +12）</button>}
                    {r.kind === "disciple" && <button type="button" disabled={busy} onClick={() => onSocial("teach", r.npcId)} className={btn} aria-label={`指点徒弟${r.name}，得进项，耗 3 月`}>{pendingKey === `social:teach:${r.npcId}` ? "… " : ""}指点（得进项）</button>}
                    {isEnemy && <button type="button" disabled={busy} onClick={() => onSocial("duel", r.npcId)} className={btn} aria-label={`与仇敌${r.name}决斗，耗 3 月`}>{pendingKey === `social:duel:${r.npcId}` ? "… " : ""}决斗</button>}
                    {isEnemy && <button type="button" disabled={busy || c.stones < 50} onClick={() => onSocial("reconcile", r.npcId)} className={btn} aria-label={`与仇敌${r.name}和解，花费五十灵石，耗 3 月`}>{pendingKey === `social:reconcile:${r.npcId}` ? "… " : ""}和解（50 灵石）</button>}
                    <button type="button" disabled={busy || c.stones < 30} onClick={() => onSocial("gift", r.npcId)} className={btn} aria-label={`赠礼${r.name}，花费三十灵石`}>{pendingKey === `social:gift:${r.npcId}` ? "… " : ""}赠礼（30 灵石{isEnemy ? " · 仇怨 −12" : " · 情谊 +12"}）</button>
                  </div>
                  </>)}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ===== 社交经济页：埋遗藏 + 因果待办（前世遗藏） ===== */}
      {tab === "social" && !c.dead && !c.pendingEvent && (
        <section aria-label="埋下遗藏" className="rounded-[var(--radius)] bg-[var(--surface)] p-4">
          <h2 className="font-brush text-base font-black"><Seal ch="藏" /> 埋下遗藏 <span className="text-xs font-normal text-[var(--dim)]">藏器于野，留待来世在同一地点探索取回 · 埋藏须封入等值的自有修为/灵石（埋多少、取回多少）</span></h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => setBuryPick(!buryPick)} aria-expanded={buryPick}
              className="rounded-full bg-[var(--surface2)] px-3.5 py-2 text-xs font-bold disabled:opacity-40">
              在此地埋下遗藏
            </button>
          </div>
          {buryPick && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {TREASURE_OPTIONS.map((t) => {
                const already = state.buried.some((b) => b.treasureName === t.name);
                // 埋藏须真实封入等值自有资源（与取回所得等值）：付
                // 不起就预先禁用并写明缺什么，服务端同口径复核。
                const lacks: string[] = [];
                if (t.cult > 0 && c.cultivation < t.cult) lacks.push(`修为需 ${t.cult}（现有 ${c.cultivation}）`);
                if (t.stones > 0 && c.stones < t.stones) lacks.push(`灵石需 ${t.stones}（现有 ${c.stones}）`);
                const costText = [t.cult > 0 ? `修为 ${t.cult}` : "", t.stones > 0 ? `灵石 ${t.stones}` : ""].filter(Boolean).join("、");
                return (
                  <button key={t.id} type="button" disabled={busy || lacks.length > 0} onClick={() => { onBury(t.id); setBuryPick(false); }}
                    aria-label={`埋下${t.name}：封入${costText}，后世取回等值所得${lacks.length > 0 ? `；现在埋不下：${lacks.join("、")}` : ""}`}
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 text-left disabled:opacity-50">
                    <span className="glyph-tile text-xl" aria-hidden>{t.icon}</span>
                    <span className="ml-1 font-song text-sm font-bold">{t.name}</span>
                    <span className="mt-0.5 block text-[11px] text-[var(--dim)]">{t.desc} · 埋于{currentLoc?.name}{already ? "（本世已埋过同类）" : ""}</span>
                    <span className="mt-0.5 block text-[11px] font-bold text-[var(--gold)]">埋藏封入：{costText}（当场扣除）</span>
                    {lacks.length > 0 && <span className="mt-0.5 block text-[11px] font-bold text-[var(--red)]">埋不下：{lacks.join("、")}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {tab === "social" && pendingBuried.length > 0 && (
        <section aria-label="因果待办" className="rounded-[var(--radius)] bg-[var(--surface)] p-4">
          <h2 className="font-brush text-base font-black"><Seal ch="因" /> 因果待办 · 前世遗藏</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {pendingBuried.map((b, i) => (
              <li key={i} className="flex items-center gap-2 rounded-xl bg-[var(--surface2)] px-3 py-2">
                <Seal ch="匣" />
                <span className="flex-1">第{b.buriedLife}世埋于「{b.locationName}」的「{b.treasureName}」</span>
                <span className="text-xs text-[var(--dim)]">{b.locationId === c.locationId ? "就在此地，探索即可取回" : `前往${b.locationName}探索取回`}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ===== 轮回历史页：前世之谜（Q16 轻主线，跨世累计） ===== */}
      {tab === "history" && historySub === "main" && (
      <section aria-label="前世之谜" className="rounded-[var(--radius)] bg-[var(--surface)] p-4">
        <h2 className="font-brush text-base font-black"><Seal ch="谜" /> 前世之谜 <span className="text-xs font-normal text-[var(--dim)]">封印的前世记忆碎片 · 藏在机缘与轮回里 · 不集也不挡路</span></h2>
        <div className="mt-2 flex items-center gap-1.5" role="img" aria-label={`记忆碎片 ${state.mainline.shards}/${state.mainline.total}`}>
          {Array.from({ length: state.mainline.total }).map((_, i) => (
            <span key={i} className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${i < state.mainline.shards ? "bg-[var(--gold)] text-[var(--on-bright)]" : "bg-[var(--surface2)] text-[var(--dim)]"}`} aria-hidden>{i < state.mainline.shards ? "片" : "·"}</span>
          ))}
          <span className="ml-1 text-xs text-[var(--dim)]">{state.mainline.shards}/{state.mainline.total} 枚</span>
          {state.mainline.done && <span className="rounded-full bg-[var(--gold)] px-2 py-0.5 text-[11px] font-bold text-[var(--on-bright)]">前世道果已成（每世神识/机缘 +4）</span>}
        </div>
        <div className="mt-2 space-y-1.5">
          {state.mainline.chapters.map((ch, i) => (
            ch.unlocked ? (
              <details key={ch.title} className="rounded-xl bg-[var(--surface2)] px-3 py-2" open={i === state.mainline.chapters.filter((x) => x.unlocked).length - 1}>
                <summary className="cursor-pointer text-sm font-bold">第{i + 1}章 · {ch.title}</summary>
                <p className="mt-1 text-sm leading-relaxed text-[var(--dim)]">{ch.text}</p>
              </details>
            ) : (
              <p key={ch.title} className="rounded-xl bg-[var(--surface2)] px-3 py-2 text-sm text-[var(--dim)]">第{i + 1}章 · 集齐 {ch.need} 枚碎片揭开</p>
            )
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-[var(--dim)]">碎片来源：古修遗府参悟禁制、前世托梦、秘境传承、接管前世洞府、高人温养法宝等机缘；轮回时记忆保留成功也会凝成 2 枚。</p>
      </section>
      )}

      {/* ===== 轮回历史页：知识图鉴入口（U-086，与前世之谜/轮回树并列） ===== */}
      {tab === "history" && historySub === "main" && (
      <section aria-label="知识图鉴" className="rounded-[var(--radius)] bg-[var(--surface)] p-4">
        <h2 className="font-brush text-base font-black"><Seal ch="鉴" /> 知识图鉴 <span className="text-xs font-normal text-[var(--dim)]">历世学过的功法永久收录 · 轮回不清零 · 精通有记</span></h2>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--dim)]">
          {state.knowledgeCodex.count > 0
            ? <>已收录 <b className="text-[var(--text)]">{state.knowledgeCodex.count}</b> 门功法，其中 <b className="text-[var(--text)]">{state.knowledgeCodex.masteredCount}</b> 门曾臻精通、留有精通印记。后世重学图鉴在册的功法有图鉴之助：曾精通的按其印记深浅起步（印记越深、开局层数起点与增长加成越高），轮回结算时还可凭印记免费带走一门。</>
            : <>还没有收录任何功法。学到第一门功法时，它就会录入图鉴，从此轮回不清空；后世重学时还有图鉴之助。</>}
        </p>
        <button type="button" onClick={() => setHistorySub("codex")}
          className="mt-3 rounded-full bg-[var(--surface2)] px-3.5 py-2 text-xs font-bold transition active:scale-95">
          知识图鉴 · 历世所学总览 ›
        </button>
      </section>
      )}

      {/* ===== 轮回历史页 · 二级页面：知识图鉴（U-086） ===== */}
      {tab === "history" && historySub === "codex" && (
        <KnowledgeCodexPage state={state} onBack={() => setHistorySub("main")} />
      )}

      {/* ===== 轮回历史页：轮回树 ===== */}
      {tab === "history" && historySub === "main" && showTree && (
        <section aria-label="轮回树" className="cv-auto">
          <h2 className="mb-2 font-brush text-lg font-black"><Seal ch="轮" /> 轮回树 <span className="text-xs font-normal text-[var(--dim)]">最近两世展开，更早的世点开看详情</span></h2>
          <div className="relative space-y-2.5">
            <div className="absolute bottom-3 left-[15px] top-3 w-0.5 bg-[var(--border)]" aria-hidden />
            {state.lives.map((life, idx) => {
              const recent = idx >= state.lives.length - 2;
              const open = recent || !!openLives[life.lifeNo];
              if (!open) {
                return (
                  <div key={life.lifeNo} className="relative flex gap-3 pl-0">
                    <span className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface2)] font-brush text-base" aria-hidden>世</span>
                    <button type="button" onClick={() => setOpenLives((s) => ({ ...s, [life.lifeNo]: true }))}
                      aria-label={`展开第${life.lifeNo}世详情：修至${life.realmText}，享年 ${life.age} 岁`}
                      className="flex-1 rounded-xl bg-[var(--surface)] px-3 py-2 text-left text-sm transition active:scale-[0.99]">
                      <b>第{life.lifeNo}世</b>{life.name ? ` · ${life.name}` : ""} · {life.realmText} <span className="text-xs text-[var(--dim)]">享年 {life.age} 岁</span>
                      <span className="float-right text-[var(--accent)]" aria-hidden>▸</span>
                    </button>
                  </div>
                );
              }
              return (
                <div key={life.lifeNo} className="relative flex gap-3 pl-0">
                  <span className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface2)] font-brush text-base" aria-hidden>世</span>
                  <div className="flex-1 rounded-xl bg-[var(--surface)] p-3">
                    <p className="text-sm font-bold">第{life.lifeNo}世{life.name ? ` · ${life.name}` : ""} · {life.realmText} {life.grade && <span className="ml-1 rounded bg-[var(--gold)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--on-bright)]">{life.grade} 级</span>} <span className="ml-1 text-xs font-normal text-[var(--dim)]">享年 {life.age} 岁</span></p>
                    <p className="mt-0.5 text-xs text-[var(--dim)]">死因：{life.cause}{life.artifactName ? ` · 本命法宝：${life.artifactName}` : ""}</p>
                    {life.keepsakes.length > 0 && <p className="mt-0.5 text-xs text-[var(--dim)]">带走：{life.keepsakes.join("、")}</p>}
                    {!recent && (
                      <button type="button" onClick={() => setOpenLives((s) => ({ ...s, [life.lifeNo]: false }))} className="mt-1.5 text-xs font-bold text-[var(--accent)]">收起 ▴</button>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="relative flex gap-3">
              <span className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-brush text-base ${c.dead ? "bg-[var(--red)] text-[var(--on-bright)]" : "bg-[var(--gold)] text-[var(--on-bright)] frontier-pulse"}`} aria-hidden>{c.dead ? "陨" : "生"}</span>
              <div className={`flex-1 rounded-xl border-2 p-3 ${c.dead ? "border-[var(--red)] bg-[var(--surface)]" : "border-[var(--gold)] bg-[var(--gold-soft)]"}`}>
                <p className="text-sm font-bold">第{c.lifeNo}世 · {c.name} · {realmText} <span className="ml-1 text-xs font-normal text-[var(--dim)]">{c.dead ? "已陨落，待轮回" : `进行中 · ${ageTextOf(c)}`}</span></p>
                <p className="mt-0.5 text-xs text-[var(--dim)]">{c.origin} · {c.rootName}{c.artifactName ? ` · 本命法宝「${c.artifactName}」` : " · 尚无本命法宝"} · 累计修为 {c.totalCultivation}</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ===== 轮回历史页：前尘残片 ===== */}
      {tab === "history" && historySub === "main" && state.fragments.length > 0 && (
        <section aria-label="前尘残片">
          <button type="button" aria-expanded={showFragments} onClick={() => setShowFragments(!showFragments)} className="mb-2 font-brush text-lg font-black">
            <Seal ch="尘" /> 前尘残片 <span className="text-xs font-normal text-[var(--dim)]">前几世只剩这些关键词记得 · {showFragments ? "收起" : "展开查阅"}</span>
          </button>
          {showFragments && (
            <div className="flex flex-wrap gap-1.5">
              {state.fragments.map((f) => (
                <span key={f.id} title={f.detail} className="cursor-help rounded-full bg-[var(--surface)] px-3 py-1.5 text-xs" aria-label={`第${f.lifeNo}世残片：${f.label}。${f.detail}`}>
                  第{f.lifeNo}世 · {f.label}
                </span>
              ))}
            </div>
          )}
          {showFragments && <p className="mt-1.5 text-xs text-[var(--dim)]">把注意力停在任一残片上可读全貌——记忆分层：只有上一世清晰，更早的世只剩残片。</p>}
        </section>
      )}

      {/* ===== 轮回历史页：编年史 ===== */}
      {tab === "history" && historySub === "main" && (
      <section aria-label="编年史" className="cv-auto">
        <h2 className="mb-2 font-brush text-lg font-black"><Seal ch="史" /> 编年史</h2>
        <div className="space-y-1.5">
          {state.log.length === 0 && <p className="rounded-xl bg-[var(--surface)] p-3 text-sm text-[var(--dim)]">尚无记录。</p>}
          {(showAllLog ? state.log : state.log.slice(0, 15)).map((e) => (
            <p key={e.id} className="rounded-xl bg-[var(--surface)] px-3 py-2 text-sm leading-relaxed">
              <span className="mr-1.5 rounded bg-[var(--surface2)] px-1.5 py-0.5 text-[11px] text-[var(--dim)]">第{e.lifeNo}世</span>{e.text}
            </p>
          ))}
        </div>
        {state.log.length > 15 && (
          <button type="button" aria-expanded={showAllLog} onClick={() => setShowAllLog(!showAllLog)} className="mt-2 w-full rounded-xl bg-[var(--surface)] py-2.5 text-sm font-bold text-[var(--accent)]">
            {showAllLog ? "▴ 收起编年史" : `▾ 展开全部编年史（共 ${state.log.length} 条）`}
          </button>
        )}
      </section>
      )}
    </div>
  );
}
