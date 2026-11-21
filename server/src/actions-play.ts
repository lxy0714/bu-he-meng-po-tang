// 轮回修仙跑团 — 游戏动作：在世的修炼/突破/探索/事件抉择/旅行/宗门/
// 遗藏/承世玉/预设路线。从 actions.ts 原样拆分，规则未动。

import { defineAction, z } from "./platform";
import {
DAILY_EVENTS, JADE_PER_LAYER, SECT_RANKS, SHOP, CRAFT_SKILLS, GRID_CELL_LABELS, RAMPAGE_EVENT_DEF, RESONANCE, RESONANCE_ENCOUNTER_DEFS, annualEventById, destinyById, enemyById, exploreTuningFor, forgeCandidatesFor, forgeTierByTier, gridChapterFor, gridFallbackEventById, isRandomExploreEventId, locById, randomExploreEventById, randomExploreGrantFor, randomExploreModeById, resonanceEventById, secretRealmAt, sectGrantForRank, sectRankById, shopPrice, techById, techLayerText, travelMonthsTo, treasureById, tribulationFor,
type ActionPointKey,
type CraftKind,
type DailyCommissionDef,
} from "./data";
import { ATTR_NAME, EVENTS, eventCostBlockReason, formatEffectGains, formatEventCost, loopDcFor, loopMultiplier, scaleEffectForLoop, type Effect, type EventDef, type EventOptionDef } from "./events";
import {
addRelation, advanceActionMonths, advanceTravelMonths, advanceYears, activeArtifactFx, applyEffects, applyEventCost, artifactGate, attrOf, bumpCommissions, bumpGroupCount, bumpQuests, bumpTimedEvents, checkDeath, completeDailyCommission, craftBonusFor, craftLevelFor, craftProficiencyOf, craftUsesFor, craftYieldPctOf, dailyObjectiveText, dailyPendingHere, decayMult, drawEventFromDeck, eventBonusFor, finishRouteStep, forgeGateFor, grantArtifact, hasRelationKind, lifespanMonthsOf, loadState, monthsOfYears, oreCountFor, removeArtifactBonus,
artifactGrantOutcomeText, ascendAfterBreakthrough, breakthroughPillBlockReason, concludeTribulation, dealGridBoard, drawGridEvent, drawRandomExploreEvent, ensureDailyBoard, gainTechniqueProficiency, isMajorBreakthroughNext, isNoRoot, locUnlocked, maybeDropArtifact, maybeDropOre, maybeDropTechniquePage, maybeFindSealedEgg, maybeHiddenDiscovery, maybeSecretRealmBoss, maybeSecretRealmSlot, notePendingEventBlock, noteSecretRealmPrelude, presentGridEvent, pushLog, realmText, realmsFor, resonanceDisorderActive, resonanceStateOf, resolveFight, rngForNext, rollCheck, saveState, settleArtifactGrant, settleRandomExploreGrant, settleSecretRealmBossFight, settleSignInHere, settleTribulationFight, shuffledEventDeck, spendActionPoints, startRoute, syncArtifactGate, techEffectiveBonusPctOf, threshold, weekKeyOf,
type Character, type GameState, type PendingEvent, type PendingLoop, type PendingOption,
} from "./state";
import { stateResponse, toResponse, type StateResponse } from "./respond";
import { rangeTable, uniformTable, weighted } from "./rng";
import { breakthroughPityModifier, breakthroughPityReduction, formatModifierTrace } from "./dice";
import { BREAKTHROUGH_CHECK, SKILL_CHECKS, ambushDcFor, ambushOptionDcFor, breakthroughBonusFor, breakthroughDcFor, fateTierBump } from "./checks";

// ---------- 单步行动执行（act 与预设路线共用） ----------

interface CraftCfg { label: string; attr: "might" | "sense" | "fortune" | "body"; dc: number; okText: string; ok: Effect; failText: string; fail: Effect }
// U-563：副职四项检定的属性与难度阈值出自检定配置表（checks.ts 的
// SKILL_CHECKS.craft），本表只留文案与成败效果，数值逐字不变。
const CRAFT_CFG: Record<string, CraftCfg> = {
  alchemy: { label: "开炉炼丹", ...SKILL_CHECKS.craft.alchemy, okText: "丹成九转，药香满室。服下丹药，修为精进。", ok: { cult: 52, stones: 10 }, failText: "火候失控，丹炉炸了膛，药材尽毁。", fail: { hp: -12, stones: -15 } },
  forge: { label: "炼器淬胚", ...SKILL_CHECKS.craft.forge, okText: "三百锤落，剑胚嗡鸣——一件趁手法器卖了好价钱。", ok: { stones: 55, cult: 25 }, failText: "淬火时手一抖，器胚开裂，只卖了废铁价。", fail: { hp: -8, stones: 5 } },
  farm: { label: "灵田劳作", ...SKILL_CHECKS.craft.farm, okText: "灵稻丰收，卖给宗门换了灵石，还留了些灵米自用。", ok: { stones: 45, cult: 15 }, failText: "虫害突至，抢收回来不到三成，勉强交租。", fail: { stones: 8, age: 1 } },
  fish: { label: "灵潭垂钓", ...SKILL_CHECKS.craft.fish, okText: "银鳞灵鱼上钩！食之养神，清明许久。", ok: { cult: 34, karma: 2 }, failText: "枯坐一日，空军而归，只当晒了晒太阳。", fail: { age: 1 } },
};

// ---------- U-378 见好就收：加圈结算 helper ----------

// 一圈结算前后的五种资源快照差 = 这一圈真正落袋的收获（已经过
// applyEffects 的地点衰减与天赋修正，与玩家实际到手逐项一致）。
interface ResourceSnapshot { cult: number; hp: number; mp: number; stones: number; karma: number }
function snapshotResources(c: Character): ResourceSnapshot {
  return { cult: c.cultivation, hp: c.hp, mp: c.mp, stones: c.stones, karma: c.karma };
}
function diffResources(before: ResourceSnapshot, c: Character): Effect {
  const gains: Effect = {};
  const cult = c.cultivation - before.cult; if (cult) gains.cult = cult;
  const hp = c.hp - before.hp; if (hp) gains.hp = hp;
  const mp = c.mp - before.mp; if (mp) gains.mp = mp;
  const stones = c.stones - before.stones; if (stones) gains.stones = stones;
  const karma = c.karma - before.karma; if (karma) gains.karma = karma;
  return gains;
}
function mergeGains(a: Effect, b: Effect): Effect {
  const out: Effect = { ...a };
  for (const k of ["cult", "hp", "mp", "stones", "karma"] as const) {
    const v = b[k];
    if (v) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}
function multText(round: number): string {
  return String(Number(loopMultiplier(round).toFixed(2)));
}
// 构建「继续加圈 / 见好就收」抉择待决事件：每圈成功后呈现一次（每圈
// 只给一次抉择），两个选项即抉择本身——继续 = 立刻结算下一圈，收手
// = 按当前累计结算结束（见 chooseOption 的 loop: 分支）。下一圈的
// 难度在选项上明示（与结算时用的放大难度一致）。
function loopDecisionEvent(ev: EventDef, opt: EventOptionDef, loop: PendingLoop): PendingEvent {
  const next = loop.round + 1;
  return {
    id: `loop:${ev.id}`,
    title: `${ev.title} · 已探 ${loop.round} 圈`,
    desc: `这一趟你已探了 ${loop.round} 圈，落袋的收获：${formatEffectGains(loop.gains) || "暂无"}。再往深处加一圈，难度与收益同涨到 ×${multText(next)}；就此收手，已得收获分文不少、全数带走。每一圈，只做这一次抉择。`,
    art: ev.art,
    options: [
      { label: `继续加圈 · 第 ${next} 圈`, hint: `${ATTR_NAME[opt.attr] ?? opt.attr}检定 · 难度与收益 ×${multText(next)}`, attr: opt.attr, dc: loopDcFor(loop.baseDc, next) },
      { label: "见好就收", hint: "就此收手 · 已得收获全部保留", attr: opt.attr, dc: 0 },
    ],
    loop,
  };
}

// 把一张已定的事件摆成待决事件（presentDeckEvent 与 U-390 日常触
// 发共用）：代价/模板标记复制（U-377/U-378/U-379/U-380/U-383）、Q34
// 机缘档位上调与日志都在这一处，与原探索路径逐字一致。
// U-390：可选参数 dailyDef——日常委托触发时据此给待决事件盖 daily
// 标记（chooseOption 办妥时凭它结清日常奖励）并在事件描述前缀委
// 托简报；不传时行为与改前逐字一致。
function presentDrawnEvent(state: GameState, c: Character, ev: EventDef, dailyDef?: DailyCommissionDef): void {
  c.recentEvents = [...c.recentEvents, ev.id].slice(-3);
  c.pendingEvent = {
    id: ev.id, title: ev.title, desc: ev.desc, art: ev.art,
    ...(dailyDef ? { daily: { dailyId: dailyDef.id, locationId: dailyDef.locationId } } : {}),
    // U-377 代价模板：带代价的选项把标价复制进待决选项，并按
    // 当前状态算好付不起的原因（客户端据此禁用并明示）；无
    // 代价的选项保持原四字段，形状与此前逐字一致。
    // U-378 见好就收模板：可加圈选项把 loop 标记复制进待决
    // 选项（客户端据此标注），加圈结算在 chooseOption。
    // U-379 三选一抉择模板：trio 标记复制进待决事件（客户端
    // 据此标注），结算仍走 chooseOption 按所选一次性结算。
    // U-380 多解事件模板：dual 标记同样复制进待决事件（客户
    // 端据此标注），结算仍走 chooseOption——两解法各走一次判
    // 定、按所选一次性结算，链路与普通选项无异。
    // U-383 道德分叉模板：moral 标记同样复制进待决事件（客户
    // 端据此标注），结算仍走 chooseOption——两分支各走一次判
    // 定、按所选一次性结算，好感/因果/物资都走既有字段。
    ...(ev.trio ? { trio: true } : {}),
    ...(ev.dual ? { dual: true } : {}),
    ...(ev.moral ? { moral: true } : {}),
    options: ev.options.map((o) => {
      const base = { label: o.label, hint: o.hint, attr: o.attr, dc: o.dc };
      const withLoop = o.loop ? { ...base, loop: true } : base;
      if (!o.cost) return withLoop;
      const blocked = eventCostBlockReason(c, o.cost);
      return { ...withLoop, cost: o.cost, ...(blocked ? { costBlocked: blocked } : {}) };
    }),
  };
  // Q34 补充口径·探索机缘档位：这桩机缘的品阶（以最高选项难度
  // 编码）若高出玩家当前境界，难度按境界差上调，机缘（气运）
  // 可部分抵消（checks.ts 的 FATE_TIER / fateTierBump）。上调
  // 记在待决事件的选项难度里（既有字段），玩家在选项上能看到
  // 基准难度变化；事件本身与奖励不变。
  const fate = fateTierBump(Math.max(0, ...ev.options.map((o) => o.dc)), c.realmIdx, attrOf(c, "fortune"));
  if (fate.gapSteps > 0 && c.pendingEvent) {
    for (const o of c.pendingEvent.options) if (o.dc > 0) o.dc += fate.bump;
    c.pendingEvent.desc += ` ✨ 机缘牵引：此番际遇的档位高出你当前境界约 ${fate.gapSteps} 档——${fate.bump > 0 ? `难度上调 +${fate.bump}，你的气运已抵消其中一部分` : "你的气运正盛，已把境界差带来的难度尽数抵消"}。`;
    pushLog(state, c.lifeNo, "event", `✨ 机缘牵引：「${ev.title}」档位高出当前境界约 ${fate.gapSteps} 档，难度 +${fate.bump}（气运抵消后）。`);
  }
  // U-390：日常委托触发的事件，描述前缀委托简报（玩家一眼知道这
  // 是今日委托、办妥有何额外兑付）；事件本体与选项一字未动。
  if (dailyDef && c.pendingEvent) {
    c.pendingEvent.desc = `【今日委托 · ${dailyDef.title}】${dailyDef.brief}\n${c.pendingEvent.desc}`;
  }
  pushLog(state, c.lifeNo, "event", `遭遇事件：${ev.title}。`);
  // U-401：若这正是某处秘境的专属前置事件，本世该秘境的隐藏
  // Boss 就此被惊动（此后探索该秘境才可能现身，见 state.ts 的
  // noteSecretRealmPrelude）；普通事件调用时无任何副作用。
  noteSecretRealmPrelude(state, ev.id);
}

// 把一张牌堆事件摆成待决事件：U-381 路线「事件」节点与 U-384 经营
// 日常触发共用。抽牌（U-576 牌堆模型）规则见 state.ts 的
// drawEventFromDeck：主牌堆从堆顶往下取本地点可用的牌、本世不重
// 复；本地点牌先抽完时只在本地点已抽牌里重洗子牌堆、不动主牌
// 堆；整副牌堆可玩牌抽完才整副重洗。旧存档空堆在抽牌时补洗。
function presentDeckEvent(state: GameState, c: Character): void {
  const ev = drawEventFromDeck(state, c) ?? EVENTS[0];
  if (!ev) return;
  presentDrawnEvent(state, c, ev);
}

// U-390 日常委托触发：把委托指定的那桩际遇摆成待决事件。前提是这
// 桩际遇还在本世牌堆里（U-576 本世不重复的口径不变）：在堆里就把
// 它从牌堆摘出、照常摆成待决事件（与 presentDeckEvent 同一构建
// 段）；本世已被别处抽走（或整副牌堆已抽空重洗后仍不在）则本批
// 触发不了，返回 false——委托仍留在本批待办里，不消耗任何东西，
// 下批刷新再换一批。不窥牌、不额外掷骰：牌堆成员检查是确定性的。
function presentDailyEvent(state: GameState, c: Character, def: DailyCommissionDef): boolean {
  const ev = EVENTS.find((e) => e.id === def.eventId);
  if (!ev) return false;
  if (!c.eventDeck) c.eventDeck = [];
  if (c.eventDeck.length === 0) c.eventDeck = shuffledEventDeck(state);
  const idx = c.eventDeck.indexOf(def.eventId);
  if (idx < 0) return false;
  c.eventDeck.splice(idx, 1);
  pushLog(state, c.lifeNo, "daily", `${def.source === "heaven" ? "🌤️" : "🌙"} 今日委托在此触发：「${def.title}」——${def.issuer}托付：${dailyObjectiveText(def)}。不用接取，办妥（任一选项掷骰成功）当场兑付额外奖励；办不成也不罚，下月刷新再换新批。`);
  presentDrawnEvent(state, c, ev, def);
  return true;
}

// ---------- U-384 经营日常随机危机/惊喜事件 ----------

// 经营/休整日常动作（修炼/休整/副职/宗门差事）结算完毕后，按配置表
// DAILY_EVENTS.chancePct 的概率被一桩随机变故打断：事件从现有事件池
// 按既有牌堆口径抽取（presentDeckEvent 与路线「事件」节点共用同一
// 段），摆成待决事件后走既有 chooseOption 结算（Q34 探索 d80、代价/
// 见好就收/三选一/双解法/道德分叉模板标记照旧复制）——本项只新增
// 「经营日常」这一种触发形式，不新编事件、不新编数值。守卫：已陨落、
// 已有待决事件、或分叉路线进行中（路线休息节点也走 doSimpleAction，
// 路线内不另触发，免得两条待决链穿插）时不触发；预设路线连走时
// executeQuickPlan 本就在待决事件出现后停步，语义一致。
function maybeTriggerDailyEvent(state: GameState): void {
  const c = state.character;
  if (!c || c.dead || c.pendingEvent || c.route) return;
  if (!rngForNext(state, "daily:event").chance(DAILY_EVENTS.chancePct / 100)) return;
  pushLog(state, c.lifeNo, "event", `🏠 经营日常之间，忽生变故——一桩意料之外的事打断了手头的营生，是危机还是惊喜，且看眼前。`);
  presentDeckEvent(state, c);
}

// ---------- U-416 属性共鸣 / 失衡：奇遇呈现与暴走触发 ----------

// 把一桩共鸣奇遇 / 灵力暴走摆成待决事件：构建与 presentDrawn-
// Event 同口径（代价复制 + 付不起原因预先算好），另盖 resonance
// 标记（encounter / rampage），chooseOption 据此走 U-416 口径
// 结算。不走 Q34 机缘档位上调——共鸣与暴走都是角色自身的体内
// 际遇、不分品阶，难度以配置原值为准（玩家在选项上看到多少就
// 是多少）。
function presentResonanceEvent(state: GameState, c: Character, ev: EventDef, kind: "encounter" | "rampage"): void {
  c.recentEvents = [...c.recentEvents, ev.id].slice(-3);
  c.pendingEvent = {
    id: ev.id, title: ev.title, desc: ev.desc, art: ev.art,
    resonance: { kind },
    options: ev.options.map((o) => {
      const base = { label: o.label, hint: o.hint, attr: o.attr, dc: o.dc };
      if (!o.cost) return base;
      const blocked = eventCostBlockReason(c, o.cost);
      return { ...base, cost: o.cost, ...(blocked ? { costBlocked: blocked } : {}) };
    }),
  };
  pushLog(state, c.lifeNo, "event", `遭遇事件：${ev.title}。`);
}

// U-416：灵力失衡期间，每次修炼 / 探索结算后按配置概率
// （rampageChancePct，种子流 resonance:rampage）触发一次「灵力
// 暴走」——摆成待决事件走 chooseOption 的 U-416 专属分支（气血
// 钳制不致死、留紊乱 debuff、绝不触发死亡链）。守卫与经营日常
// 事件同口径：已陨落、已有待决事件、路线进行中或渡劫中都不触
// 发（不与既有待决链穿插）。状态非失衡时不掷骰。返回是否触发。
function maybeTriggerRampage(state: GameState): boolean {
  const c = state.character;
  if (!c || c.dead || c.pendingEvent || c.route || c.tribulation) return false;
  if (resonanceStateOf(c).kind !== "imbalance") return false;
  if (!rngForNext(state, "resonance:rampage").chance(RESONANCE.rampageChancePct / 100)) return false;
  pushLog(state, c.lifeNo, "event", `🌀 灵力暴走：四维失衡日久，体内灵力忽然脱缰——这一关只在你自己体内，先了结它再说其他。`);
  presentResonanceEvent(state, c, RAMPAGE_EVENT_DEF, "rampage");
  return true;
}

// U-416：四象共鸣期间，探索按配置概率（resonanceEncounter-
// ChancePct，种子流 resonance:encounter-chance）把本程普通探索
// 替换为共鸣奇遇：从配置表 3 桩专属小事件里按 commonality 加
// 权抽一桩（种子流 resonance:encounter，避开最近 3 个事件、沿
// 用现有避重口径），摆成待决事件走既有 chooseOption 结算链。
// 状态非共鸣时不掷骰。返回是否替换。
function maybePresentResonanceEncounter(state: GameState): boolean {
  const c = state.character;
  if (!c || c.dead || c.pendingEvent) return false;
  if (resonanceStateOf(c).kind !== "resonance") return false;
  if (!rngForNext(state, "resonance:encounter-chance").chance(RESONANCE.resonanceEncounterChancePct / 100)) return false;
  const recent = new Set(c.recentEvents);
  let pool = RESONANCE_ENCOUNTER_DEFS.filter((e) => !recent.has(e.id));
  if (pool.length === 0) pool = [...RESONANCE_ENCOUNTER_DEFS];
  const ev = weighted(rngForNext(state, "resonance:encounter"), pool.map((e) => ({ value: e, commonality: e.commonality })));
  pushLog(state, c.lifeNo, "event", `✨ 四象共鸣：四维调和如一，这一程的际遇被共鸣牵引，化作一桩只属于调和者的奇遇。`);
  presentResonanceEvent(state, c, ev, "encounter");
  return true;
}

// 执行一步无事件行动（修炼/休整/副职），返回一句小结；不可执行时返回 null。
// U-384：行动结算后有概率被经营日常随机事件打断（见 maybeTriggerDailyEvent）。
function doSimpleAction(state: GameState, kind: string): string | null {
  const c = state.character;
  if (!c || c.dead || c.pendingEvent) return null;
  // U-409：行动点在动作开始时扣除（修炼 20 / 副职 12 / 休整 0，
  // 配置表 action-points.json）——点数不足时 spendActionPoints
  // 已记明示原因、本步不执行（返回 null，预设路线据此停步，
  // 与遇事件/陨落停步同口径）；判定、收益、耗时一字不动。
  const apKey: ActionPointKey = kind === "cultivate" ? "cultivate" : kind === "rest" ? "rest" : "craft";
  if (!spendActionPoints(state, apKey)) return null;
  let summary: string | null = null;

  if (kind === "cultivate") {
    // U-627：无灵根角色的修炼即「炼体」——驱动属性由神识换成体
    // 魄（floor(体魄/2)，与引气口径同构替换），其余结算链（地点
    // 加成、天赋/道侣/功法/命格/法宝倍率、宗门加成、衰减、耗时
    // 12 月、攒点 +3）一字不变；炼体不耗灵力（引气路径的灵力
    // −8 是消耗不是门槛、本就不卡人，炼体索性不扣——无灵根的
    // 灵力只余斗法等既有用途，不因炼体被掏空）。
    const noRoot = isNoRoot(c);
    const locBonus = c.locationId === "sect" ? 6 : c.locationId === "realm" ? 4 : c.locationId === "cave" ? 5 + c.caveLevel * 3 : c.locationId === "temple" ? 3 : c.locationId === "falls" ? 3 : c.locationId === "border" ? 2 : 0;
    let gain = rngForNext(state, "cultivate").int(14, 30) + Math.floor(attrOf(c, noRoot ? "body" : "sense") / 2) + locBonus;
    if (c.talentIds.includes("t_diligent")) gain = Math.floor(gain * 1.25);
    // Q18：有道侣同修，阴阳调和，修炼收益 +12%。
    if (hasRelationKind(c, "partner")) gain = Math.floor(gain * 1.12);
    const tech = techById(c.techniqueId);
    // U-612：功法加成按有效值结算——已精通的功法在基础 bonusPct
    // 上按配置表精通档步长上升一档（techEffectiveBonusPctOf）；
    // 未精通时有效值 = 基础值，与改前逐字一致。
    if (tech) gain = Math.floor(gain * (1 + techEffectiveBonusPctOf(c, tech) / 100));
    const destiny = destinyById(c.destinyId);
    if (destiny?.cultPct) gain = Math.floor(gain * (1 + destiny.cultPct / 100));
    // U-617：聚灵类法宝（聚灵幡/悟道蒲团）修炼收益按配置百分比
    // 放大（与命格 cultPct 同口径叠乘）；聚灵阵盘的 cavePct 只在
    // 听涛洞府内起效。封存期间不生效（activeArtifactFx 把关）。
    const cultFx = activeArtifactFx(state, c);
    if (cultFx?.cultPct) gain = Math.floor(gain * (1 + cultFx.cultPct / 100));
    if (cultFx?.cavePct && c.locationId === "cave") gain = Math.floor(gain * (1 + cultFx.cavePct / 100));
    // U-416：四象共鸣时修炼收益按配置 +5%（与命格 / 法宝同口径
    // 叠乘）；灵力紊乱生效期间按配置 −10%（debuff 只折修炼收
    // 益、不碰其他结算）。状态在本次修炼结算前按当前四维实时
    // 判定（紊乱到期月份在下方 advanceActionMonths 里才推进，
    // 故本回修炼仍按紊乱中结算——与「持续 N 个月」的口径一
    // 致）。两项都在下方日志里明示。
    const resonanceKind = resonanceStateOf(c).kind;
    if (resonanceKind === "resonance") gain = Math.floor(gain * (1 + RESONANCE.resonanceCultivateBonusPct / 100));
    const disorderOn = resonanceDisorderActive(c);
    if (disorderOn) gain = Math.floor(gain * (1 - RESONANCE.disorderCultivatePenaltyPct / 100));
    gain += sectRankById(c.sectRankId)?.cultivateBonus ?? 0;
    const mult = decayMult(c.groupCounts[locById(c.locationId)?.group ?? ""] ?? 0);
    const finalGain = Math.max(1, Math.floor(gain * mult));
    c.cultivation += finalGain; c.totalCultivation += finalGain;
    // U-608：修炼耗时按细时钟配置表（cultivate，草稿 12 月 = 一年，节奏与改前一致）。
    advanceActionMonths(state, "cultivate");
    // U-627：炼体不耗灵力（见上方分支头注），引气路径照旧 −8。
    if (!noRoot) c.mp = Math.max(0, c.mp - 8);
    bumpGroupCount(c);
    // U-612：修炼即施展——当前修习功法在本次修炼结算中计入施展
    // 一次，攒点按配置表 cultivateGain 增长（每次修炼动作只结
    // 算一次，预设路线连走时每步各算一次施展）；进度附在本条日
    // 志后（U-626 层数口径），升层与臻至精通由 gainTechnique-
    // Proficiency 另记专条明示。
    const profGain = gainTechniqueProficiency(state, "cultivate");
    const profNote = profGain && tech ? `《${profGain.name}》${techLayerText(tech, profGain.after)}${profGain.mastered ? "（已精通）" : ""}${profGain.relearned ? `（知识图鉴重学加成：本次 +${profGain.gained} 点，基础 +${profGain.baseGain} 点）` : ""}。` : "";
    // U-627：炼体文案——无灵根不写「闭关引气」，写锤炼筋骨、以
    // 体魄入道；数值与衰减注记口径与引气路径一致。
    // U-416：共鸣加成 / 紊乱惩罚的日志注记（数值已在上方结算，
    // 此处只作文案明示，玩家对账可见）。
    const resonanceNote = `${resonanceKind === "resonance" ? `（四象共鸣：修炼收益 +${RESONANCE.resonanceCultivateBonusPct}%）` : ""}${disorderOn ? `（灵力紊乱未消：修炼收益 −${RESONANCE.disorderCultivatePenaltyPct}%）` : ""}`;
    pushLog(state, c.lifeNo, "cultivate", noRoot
      ? `炼体一年，锤炼筋骨、气血搬运，修为 +${finalGain}${mult < 1 ? `（本周同类收益衰减至 ${Math.round(mult * 100)}%）` : ""}${resonanceNote}。无灵根引气无门，修为全凭体魄打熬。${profNote}`
      : `闭关修炼一年，修为 +${finalGain}${mult < 1 ? `（本周同类收益衰减至 ${Math.round(mult * 100)}%）` : ""}${resonanceNote}。${profNote}`);
    checkDeath(state, noRoot ? "炼体时寿元耗尽" : "修炼时寿元耗尽");
    // U-407：修炼一回，推进连环任务当前阶段的「修炼」目标（无灵
    // 根的炼体同为修炼动作、同一口径；陨落时 bumpQuests 自行跳过）。
    bumpQuests(state, "cultivate", {});
    summary = noRoot ? `炼体一年，修为 +${finalGain}` : `修炼一年，修为 +${finalGain}`;
  }

  if (kind === "rest") {
    // 休整优化：回血 60%（凡村 75%），并附带静坐调息修为 +6，不再是纯回血的空转年。
    // U-617：回春类法宝（回春佩）在基础比例上再加配置百分点（封顶 100%）。
    let healPct = c.locationId === "village" ? 0.75 : 0.6;
    const restFx = activeArtifactFx(state, c);
    if (restFx?.healPct) healPct = Math.min(1, healPct + restFx.healPct / 100);
    const before = c.hp;
    c.hp = Math.min(c.maxHp, c.hp + Math.floor(c.maxHp * healPct));
    c.mp = c.maxMp;
    // U-608：休整耗时按细时钟配置表（rest，草稿 1 月）。
    advanceActionMonths(state, "rest");
    c.cultivation += 6; c.totalCultivation += 6;
    const healed = c.hp - before;
    pushLog(state, c.lifeNo, "rest", `休整一月，气血恢复 ${healed} 点，灵力充盈，静坐调息修为 +6。`);
    checkDeath(state, "休整时寿元耗尽");
    summary = `休整一月，气血 +${healed}，修为 +6`;
  }

  const cfg = CRAFT_CFG[kind];
  if (cfg) {
    // Q34 + U-482：副职系统骰面 d60（下限随副职等级、上限随神识）；
    // 副职等级自 U-482 起改用熟练度等级（该门使用次数查配置表
    // craft-skills.json 派生），取代旧的天赋有无 1/0 代理——骰面、
    // 系数与判定链不动，副职天赋的 +12 固定加成（craftBonusFor）
    // 照旧。掷骰用「本次使用之前」的等级：这一回练完才涨熟练度。
    const levelBefore = craftLevelFor(c, kind);
    const roll = rollCheck(state, c, cfg.attr, cfg.dc, craftBonusFor(c, kind), [], "normal", { system: "craft", craftLevel: levelBefore });
    const success = roll.success;
    // U-617：副职类法宝（丹炉/铸锤/灵锄/钓竿）——成功收益的灵石与
    // 修为按配置百分比放大；craftKind 限定的只对对应副职，失败结算
    // 不动。无此 fx 时逐字不变。
    let okEff = cfg.ok;
    if (success) {
      const craftFx = activeArtifactFx(state, c);
      if (craftFx?.craftPct && (!craftFx.craftKind || craftFx.craftKind === kind)) {
        const m = 1 + craftFx.craftPct / 100;
        okEff = { ...cfg.ok, ...(cfg.ok.stones && cfg.ok.stones > 0 ? { stones: Math.floor(cfg.ok.stones * m) } : {}), ...(cfg.ok.cult && cfg.ok.cult > 0 ? { cult: Math.floor(cfg.ok.cult * m) } : {}) };
      }
      // U-482：破限产量加成——当前熟练度等级解锁的产量加成（配置
      // 表 breakthroughs.yieldPct）同样放大成功收益的灵石与修为，
      // 与法宝 craftPct 叠乘；只放大既有产出，不新造产出种类。
      const yieldPct = craftYieldPctOf(c, kind);
      if (yieldPct > 0) {
        const m = 1 + yieldPct / 100;
        okEff = { ...okEff, ...(okEff.stones && okEff.stones > 0 ? { stones: Math.floor(okEff.stones * m) } : {}), ...(okEff.cult && okEff.cult > 0 ? { cult: Math.floor(okEff.cult * m) } : {}) };
      }
    }
    applyEffects(state, success ? okEff : cfg.fail, { decayed: success });
    // U-482：本次使用计入熟练度（成败都算练习，与计划口径「每次
    // 使用任一副职时触发」一致）——该门使用次数 +1，熟练度随之
    // 上涨；跨过破限门槛则等级提升，另记一条破限日志。四门各自
    // 独立计数，互不影响。
    const usesBefore = craftUsesFor(c, kind);
    c.craftUses[kind] = usesBefore + 1;
    const profAfter = craftProficiencyOf(c, kind);
    const levelAfter = craftLevelFor(c, kind);
    const kindDef = CRAFT_SKILLS.kinds[kind as CraftKind];
    c.lastRoll = { label: cfg.label, dice: roll.dice, bonus: roll.bonus, total: roll.total, dc: roll.dc, success, text: success ? cfg.okText : cfg.failText, detail: roll.detail };
    pushLog(state, c.lifeNo, success ? "craft_ok" : "craft_fail", `${cfg.label}（判定明细：${roll.detail.text}）：${success ? cfg.okText : cfg.failText}（${kindDef?.label ?? kind}熟练度 ${profAfter}）`);
    if (levelAfter > levelBefore) {
      const bt = kindDef?.breakthroughs.find((b) => b.level === levelAfter);
      pushLog(state, c.lifeNo, "craft_level", `🎓 副职破限：${kindDef?.label ?? kind}精进至 Lv${levelAfter}${bt ? `「${bt.label}」——${bt.desc}` : ""}（熟练度 ${profAfter}，本世已练 ${usesBefore + 1} 次；副职判定骰面下限随等级提升）`);
    }
    bumpGroupCount(c);
    // U-608：副职耗时按细时钟配置表（craft，配置表定 6 月）。
    advanceActionMonths(state, "craft");
    checkDeath(state, `陨落于${cfg.label}`);
    // U-388：在本地点做一回副职，推进「副职」类委托进度（成败都算
    // 出过力，与委托文案「帮工」口径一致；既有结算数值不变）。
    bumpCommissions(state, "craft", c.locationId);
    // U-389：同一回副职同样推进「副职」类限时帖进度（口径与委托一致）。
    bumpTimedEvents(state, "craft", c.locationId);
    // U-407：同一回副职同样推进连环任务当前阶段的「副职」目标。
    bumpQuests(state, "craft", { locationId: c.locationId });
    summary = `${cfg.label}${success ? "成功" : "失败"} · 熟练度 ${profAfter}${levelAfter > levelBefore ? ` · 破限 Lv${levelAfter}` : ""}`;
  }
  // U-416：修炼这一步结算完毕后，灵力失衡有概率引来灵力暴走
  //（只修炼触发——探索的暴走掷在 act 的探索分支里）；暴走摆成
  // 待决事件后，紧随其后的经营日常事件掷自会因待决守卫让位。
  if (summary !== null && kind === "cultivate") maybeTriggerRampage(state);
  // U-384：这一步日常行动结算完毕（且确实执行了），按概率掷一次
  // 经营日常随机事件触发；触发与否都不改本步的小结与既有结算。
  if (summary !== null) maybeTriggerDailyEvent(state);
  return summary;
}

// 预设路线：一次最多连走 12 步；遇事件、陨落或步骤不可执行即停。
function executeQuickPlan(state: GameState): void {
  const c = state.character;
  if (!c) return;
  let ran = 0;
  while (ran < 12 && c.quickPlan.length > 0) {
    const step = c.quickPlan[0];
    if (!step) break;
    if (!doSimpleAction(state, step.kind)) break;
    step.count -= 1;
    if (step.count <= 0) c.quickPlan.shift();
    ran += 1;
    if (c.dead || c.pendingEvent) break;
  }
}

export const playActions = {
  act: defineAction({
    description: "执行一项日常行动：修炼、突破、探索（踏上 U-381 分叉路线，寻仇/遗藏仍优先触发；探索时当前地点埋有未拾的封印之蛋会按配置概率随机现身、拾取记入跨世收集进度，集齐门槛换一条只提示地点的前世遗藏线索，U-393；优先触发落空后、踏上路线之前先按当前地点的事件密度掷一次，未命中为安静一步——只记一条无事发生的日志、耗时照常、无奖励无惩罚，U-399）、休整、炼丹炼器、灵田劳作或垂钓（四门副职各自累计熟练度、破限解锁产量加成且熟练度等级决定副职判定骰面下限，U-482）；经营/休整类行动（修炼/休整/副职）结算后按配置概率（U-384）可能被一桩现有事件池的随机变故打断，摆成待决事件走既有抉择结算；路线进行中须先选节点或收程，本动作不受理；属性共鸣/失衡（U-416）：四维配比实时判定四象共鸣/平稳/灵力失衡（只读现有四维、不新增属性）——共鸣时修炼收益按配置 +5%（日志可见）、探索按配置概率把本程普通探索替换为共鸣奇遇（3 桩专属小事件），失衡时修炼/探索结算后按配置概率触发灵力暴走待决事件（结算见 chooseOption 的 U-416 专属分支）。",
    request: z.object({ kind: z.enum(["cultivate", "breakthrough", "explore", "rest", "alchemy", "forge", "farm", "fish"]) }),
    response: stateResponse,
    async handler(ctx, args): Promise<StateResponse> {
      const state = await loadState(ctx);
      const c = state.character;
      if (!c || c.dead) return toResponse(state);
      const realms = realmsFor(state.settings);

      // 每周收益衰减：新的一周重置各组计数（参考《百世成仙》100/60/35/15%）。
      const wk = weekKeyOf(new Date());
      if (c.weekKey !== wk) { c.weekKey = wk; c.groupCounts = {}; }

      if ((c.pendingEvent || c.tribulation) && args.kind !== "explore") {
        // 2026-11-18 自测修复：待决事件拦截不再静默，明示先处理待决事件。
        // U-415：渡劫进行中同属待决状态，一并在此拦下（提示文案由
        // notePendingEventBlock 按状态区分）。
        notePendingEventBlock(state);
        await saveState(ctx, state);
        return toResponse(state);
      }
      // U-381：路线进行中（节点待选或节点事件待决），日常行动一律不
      // 受理——先在路线卡上选节点（或收程放弃），免得路线状态与日常
      // 结算互相穿插。
      if (c.route) return toResponse(state);

      if (args.kind === "cultivate" || args.kind === "rest" || args.kind === "alchemy" || args.kind === "forge" || args.kind === "farm" || args.kind === "fish") {
        doSimpleAction(state, args.kind);
      }

      if (args.kind === "breakthrough") {
        const need = threshold(c.realmIdx, c.stageIdx);
        if (c.cultivation < need || c.pendingEvent) return toResponse(state);
        // U-414：大境界突破的持丹门槛——下一步是大境界突破（境
        // 界序号递增）且丹药囊无破境丹时拦下并明示原因（缺丹 +
        // 指引禁地夺丹/坊市等既有来源），不扣行动点、不掷骰、不
        // 静默失败；小境界突破不走此门槛。破境丹的消耗点 U-415
        // 起改在渡劫成功、正式升境时（见 state.ts 的 conclude-
        // Tribulation）——判定成功但渡劫失败不消耗。
        const pillBlock = breakthroughPillBlockReason(state);
        if (pillBlock) {
          pushLog(state, c.lifeNo, "hint", pillBlock);
          await saveState(ctx, state);
          return toResponse(state);
        }
        const majorNext = isMajorBreakthroughNext(c, state.settings);
        // U-409：突破耗行动点 15（配置表）——修为已达门槛、真正
        // 掷骰之前扣点，成败都扣；点数不足明示原因、不掷骰。
        if (!spendActionPoints(state, "breakthrough")) { await saveState(ctx, state); return toResponse(state); }
        // U-563：突破难度（118 + 境界×6、守心如玉 −10、Q18 师父护法 −8）
        // 与额外加成（业力/5 + 破关如喝水 +10 + 破境助力）的公式出自
        // 检定配置表（checks.ts 的 BREAKTHROUGH_CHECK），数值逐字不变。
        let dc = breakthroughDcFor(c.realmIdx, c.talentIds, hasRelationKind(c, "master"));
        // U-617：破禁类法宝（破禁锥/悟道蒲团）——突破难度按配置在
        // 基准标尺上直减（与师父护法 −8 同口径）；净业宝莲护持时负
        // 业力不计入突破加成（按 0 计，见下方 rollCheck 的业力入参）。
        // 无此 fx 时逐字不变。
        const brkFx = activeArtifactFx(state, c);
        if (brkFx?.breakDcDown) dc = Math.max(1, dc - brkFx.breakDcDown);
        // Q17：破境丹/师父指点的破境助力在本次突破时消耗。
        const usedBreakBonus = c.breakBonus;
        c.breakBonus = 0;
        // U-415：连败保底计数快照（掷骰前）——判定成功时保底
        // modifier 会把计数清零；若这是大境界突破且随后渡劫失
        // 败，劫后结算按此快照恢复（渡劫失败不推进也不清空保
        // 底，见 TribulationState.breakFailsBefore）。
        const breakFailsBefore = c.breakFails;
        // U-569：连败保底走 modifier 链——难度减免（连败×5、封顶 20）与
        // 掷骰后的连败增减（失败 +1、成功清零）都由 breakthroughPityModifier
        // 在 rollCheck 内处理，生效难度以 roll.dc 为准；数值与改前一致。
        // Q34：突破系统骰面 d100（下限随境界、上限随机缘）。
        const roll = rollCheck(state, c, BREAKTHROUGH_CHECK.attr, dc, breakthroughBonusFor(brkFx?.karmaShield && c.karma < 0 ? 0 : c.karma, c.talentIds, usedBreakBonus), [breakthroughPityModifier(c)], "normal", { system: "breakthrough" });
        dc = roll.dc;
        const success = roll.success;
        c.lastRoll = { label: "突破", dice: roll.dice, bonus: roll.bonus, total: roll.total, dc, success, text: success ? "灵光贯通，境界松动！" : "关窍如铁，突破失败。", detail: roll.detail };
        if (success) {
          c.cultivation -= need;
          const before = realmText(c, state.settings);
          if (majorNext) {
            // U-415 渡劫仪式（U-414 挂点在此兑现）：大境界突破判
            // 定成功不直接升境——进入渡劫三段（雷劫来临 → 渡劫
            // 战 → 劫后结算，推进走 tribulation 动作，结算在
            // state.ts 的 settleTribulationFight / concludeTri-
            // bulation）。升境、破境丹消耗（U-415 改点：渡劫成
            // 功、正式升境时才消耗）、任务推进与法宝对齐全部推
            // 迟到劫后结算的升境单一路径（ascendAfterBreak-
            // through）；渡劫失败则修为退回、保底恢复、停在大
            // 圆满（见 concludeTribulation）。渡劫状态自此进入
            // 待决拦截（notePendingEventBlock），进存档可续。
            const tribDef = tribulationFor(c.realmIdx + 1);
            c.tribulation = { phase: "arrival", targetRealmIdx: c.realmIdx + 1, spentCultivation: need, breakFailsBefore, won: false };
            pushLog(state, c.lifeNo, "breakthrough", `突破判定已过：${before} 的关窍应声而开，境界之门近在咫尺——但门外雷云汇聚，天劫将至。判定明细：${roll.detail.text}${formatModifierTrace(roll.detail.modifierTrace) ? `（${formatModifierTrace(roll.detail.modifierTrace)}）` : ""}。渡过雷劫，方成${realms[c.realmIdx + 1]?.name ?? ""}境。`);
            if (tribDef) pushLog(state, c.lifeNo, "event", `⚡ 雷劫来临 —— ${tribDef.intro}`);
          } else {
            // 小境界突破：判定成功即升境（无渡劫），升境结算走
            // 单一路径 ascendAfterBreakthrough（与渡劫胜后的升
            // 境同一实现）。
            ascendAfterBreakthrough(state, c);
            pushLog(state, c.lifeNo, "breakthrough", `突破成功：${before} → ${realmText(c, state.settings)}！判定明细：${roll.detail.text}${formatModifierTrace(roll.detail.modifierTrace) ? `（${formatModifierTrace(roll.detail.modifierTrace)}）` : ""}。`);
            // U-407：突破成功，推进连环任务当前阶段的「突破」目标。
            bumpQuests(state, "breakthrough", {});
            // U-618：突破跨境后，封存中的本命法宝可能就此达门槛——统一
            // 对齐（自动解封补加成并记日志），与修为进阶同一入口。
            syncArtifactGate(state, c);
            if (c.realmIdx === realms.length - 1 && c.stageIdx === 3) {
              pushLog(state, c.lifeNo, "breakthrough", "已至此界之巅——再进一步，便是渡劫飞升。（本团当前以此为顶点）");
            }
          }
        } else {
          // 连败计数已由保底 modifier 的 afterRoll +1（见上方 rollCheck 调用）。
          // Q10 中等偏虐：突破失败有 15% 概率走火入魔当场陨落（U-573：种子化判定，概率仍为 15%）。
          const backfire = rngForNext(state, "breakthrough:backfire").chance(0.15);
          // U-617：渡劫护持类法宝（混元渡劫伞）——走火将发时按配置
          // 概率挡下，改按普通失败结算；护持掷骰走独立种子流，只在
          // 走火已触发且持有已认主的该宝时才掷，15% 概率逐字不变。
          const shielded = backfire && !!brkFx?.backfireShieldChance && rngForNext(state, "breakthrough:shield").chance(brkFx.backfireShieldChance);
          if (backfire && !shielded) {
            c.hp = 0;
            pushLog(state, c.lifeNo, "breakthrough", `突破失败，灵气逆冲经脉——走火入魔！判定明细：${roll.detail.text}${formatModifierTrace(roll.detail.modifierTrace) ? `（${formatModifierTrace(roll.detail.modifierTrace)}）` : ""}。`);
          } else {
            c.hp = Math.max(1, c.hp - 20); c.cultivation = Math.floor(c.cultivation / 2);
            pushLog(state, c.lifeNo, "breakthrough", `突破失败，经脉受损，修为折半。判定明细：${roll.detail.text}${formatModifierTrace(roll.detail.modifierTrace) ? `（${formatModifierTrace(roll.detail.modifierTrace)}）` : ""}。已连败 ${c.breakFails} 次，下次突破难度 −${breakthroughPityReduction(c.breakFails)}（保底）。${shielded ? "混元渡劫伞在头顶张开，替你挡下了走火入魔那一劫——只余经脉受损。" : ""}`);
          }
        }
        // U-608：突破耗时按细时钟配置表（breakthrough，配置表定 6 月）。
        advanceActionMonths(state, "breakthrough");
        checkDeath(state, "突破时走火入魔");
      }

      if (args.kind === "explore") {
        if (c.pendingEvent || c.tribulation) {
          notePendingEventBlock(state);
          await saveState(ctx, state);
          return toResponse(state);
        }
        // U-409：探索耗行动点 10（配置表）——出门之前扣点；点数
        // 不足明示原因、不推进时钟、不触发任何探索钩子。
        if (!spendActionPoints(state, "explore")) { await saveState(ctx, state); return toResponse(state); }
        // U-608：探索耗时按细时钟配置表（explore，草稿 3 月）——出门
        // 历练本身耗时，在触发判定（拾蛋/寻仇/遗藏/路线）之前先推进；
        // 路线节点各自的耗时（战斗/休息节点）仍按各自的动作键另计，
        // 事件抉择结算（chooseOption）本身不再另计耗时。
        advanceActionMonths(state, "explore");
        // U-416：灵力失衡时，本次探索先按配置概率掷一次灵力暴走
        // ——暴走摆成待决事件后，本程其余探索分支（遗藏 / 秘境 /
        // 密度 / 路线）本就以 !c.pendingEvent 为前提、自然让位；
        // 寻仇分支的掷骰在下方一并补上同一守卫（旧路径下此处待
        // 决恒为空，补守卫不改既有行为）。
        maybeTriggerRampage(state);
        // U-393 封印之蛋：探索时当前地点埋有未拾之蛋时，按配置概率
        // 随机现身、当场拾取记入跨世收集进度（集齐门槛另行换出前世
        // 遗藏线索，见 state.ts maybeFindSealedEgg）。拾取不占待决
        // 事件槽位，发生在寻仇/遗藏/路线三支之前，不改三支的触发
        // 与结算规则；本地点无蛋或蛋已拾得时不掷骰、不留痕。
        maybeFindSealedEgg(state);
        // Q18：仇怨够深的仇敌会主动寻仇——探索时三成概率被堵个正着。
        // U-416 补守卫：灵力暴走刚摆成待决事件时寻仇不再抢槽（旧
        // 路径下进入本段时待决恒为空，此守卫不改既有行为）。
        const nemesis = c.relations.find((r) => r.kind === "enemy" && r.bond >= 30);
        if (!c.pendingEvent && nemesis && rngForNext(state, "explore:ambush").chance(0.3)) {
          // U-563：寻仇难度公式出自检定配置表（checks.ts 的 AMBUSH_CHECK）。
          const dc = ambushDcFor(c.realmIdx, nemesis.bond);
          c.pendingEvent = {
            id: `ambush:${nemesis.npcId}`, title: "仇敌寻仇", art: "tribulation",
            desc: `你刚踏出没几步，${nemesis.name}便从暗处转了出来，兵刃半出鞘：「${nemesis.note}这笔账，今日算算。」仇怨 ${nemesis.bond}，躲是躲不过去了。`,
            options: [
              { label: "拔剑迎战", hint: "战力检定 · 胜则仇怨大减", attr: "might", dc },
              { label: "破财消灾", hint: "机缘检定 · 赔一笔灵石了事", attr: "fortune", dc: ambushOptionDcFor(dc, "pay") },
              { label: "转身遁走", hint: "体魄检定 · 逃得掉就不亏", attr: "body", dc: ambushOptionDcFor(dc, "flee") },
            ],
          };
          pushLog(state, c.lifeNo, "social", `⚔️ 仇敌寻仇：${nemesis.name}堵住了你的去路（仇怨 ${nemesis.bond}）。`);
        }
        // 前世遗藏：到藏宝地点探索必定触发取回（隔多世仍有效）。
        const buriedHere = !c.pendingEvent ? state.buried.find((b) => b.locationId === c.locationId && b.buriedLife !== c.lifeNo) : undefined;
        if (buriedHere) {
          const tr = treasureById(buriedHere.treasureId);
          c.pendingEvent = {
            id: "buried_find", title: "前世遗藏", art: "cave",
            desc: `你在${buriedHere.locationName}的隐秘处发现了前世（第${buriedHere.buriedLife}世）埋下的「${buriedHere.treasureName}」——${tr?.desc ?? ""}藏器于野，隔世仍在。`,
            options: [{ label: "取出遗藏", hint: "前世所埋 · 必定取回", attr: "fortune", dc: 0 }],
          };
          pushLog(state, c.lifeNo, "event", `发现前世遗藏：第${buriedHere.buriedLife}世埋下的「${buriedHere.treasureName}」。`);
        } else if (!c.pendingEvent && state.sealedEggs?.revealed && state.sealedEggs.revealed.locationId === c.locationId) {
          // U-393：封印之蛋线索标出的无主前世遗藏就在此地——探索即
          // 循线寻见，摆成与 buried_find 同形的待决事件（必定取回、
          // 取回时才按既有遗藏 effect 结算；线索本身不发奖励）。既
          // 有遗藏（buriedHere）优先于它，两者不会同地点同世并存争
          // 槽位时以既有遗藏为准。
          const rv = state.sealedEggs.revealed;
          const tr = treasureById(rv.treasureId);
          c.pendingEvent = {
            id: "sealed_cache", title: "前世遗藏 · 线索所指", art: "cave",
            desc: `封印之蛋的线索把你引到${rv.locationName}的隐秘处——果然有一处无主的前世遗藏「${rv.treasureName}」沉睡于此。${tr?.desc ?? ""}线索只给了方位，宝物还得亲手取。`,
            options: [{ label: "取出遗藏", hint: "线索所指 · 必定取回", attr: "fortune", dc: 0 }],
          };
          pushLog(state, c.lifeNo, "event", `线索应验：在${rv.locationName}寻见了无主前世遗藏「${rv.treasureName}」。`);
        } else if (!c.pendingEvent) {
          // U-401 秘境探索：身处三界秘境时，先判定隐藏 Boss 现身
          // （前置已触发且未击败才掷，见 maybeSecretRealmBoss），
          // 再判定固定掉落槽（丹药/典籍逐槽按配置概率掷，命中即
          // 领、本次探索就此结算，替代普通事件触发，见
          // maybeSecretRealmSlot）；两支都落空才照旧走下方密度/
          // 路线流程。非秘境地点两支都不掷骰，流程与改前逐字一致。
          if (maybeSecretRealmBoss(state)) {
            // Boss 已现身摆成待决事件，本次探索到此为止。
          } else if (maybeSecretRealmSlot(state)) {
            // 固定掉落槽已领取，本次探索到此为止。
          } else {
          // U-399 探索事件密度：寻仇/遗藏/线索三支优先触发都落空
          // 后、踏上路线之前，先按当前地点的事件密度（配置表
          // explore-tuning.json 的 density）掷一次（种子流
          // explore:density）——未命中则为安静一步：记一条无事发
          // 生的日志，探索耗时（上方已推进的 3 个月）照常、不踏路
          // 线。密度只影响触发频率：命中后走的路线与事件流程（牌
          // 堆、避开最近 3 个、Q34 探索 d80、U-377 代价选项）与改
          // 前逐字一致；封印之蛋等探索附带钩子在密度掷之前已照旧
          // 掷过，不受命中与否影响。
          const tuning = exploreTuningFor(c.locationId);
          if (tuning && !rngForNext(state, "explore:density").chance(tuning.density)) {
            const locName = locById(c.locationId)?.name ?? c.locationId;
            pushLog(state, c.lifeNo, "event", `🍃 在「${locName}」一带走了一圈，一路无话，并无异事——只有山风与自己的脚步声。`);
            // U-399 修正（2026-11-20 审计）：探索附带钩子每次探索
            // 都掷、不受密度命中与否影响——安静一步同样独立掷一
            // 遍与际遇结算尾巴（chooseOption 成功分支）相同的三
            // 掷：U-396 功法残页（drop:page）/ U-464 拾矿
            // （drop:ore）/ U-620 法宝掉落（drop:artifact），各自
            // 独立种子流、概率与结算口径与尾巴逐字一致。掷中照常
            // 发奖并由各钩子自记日志；三掷皆空本步才是纯安静一步
            // （无奖惩、3 个月耗时照常）。此前安静步直接跳过这三
            // 掷，密度越低漏掉的掉落机会越多，与原需求第 2 条相悖。
            maybeDropTechniquePage(state);
            maybeDropOre(state);
            maybeDropArtifact(state);
          } else if (maybePresentResonanceEncounter(state)) {
            // U-416：四象共鸣牵引——本程普通探索被替换为共鸣奇遇
            //（待决事件已摆好），不踏路线；未命中替换时照旧走下
            // 方路线分支。
          } else {
            // U-381 分叉地图路线选择：普通探索不再直接抽事件——寻仇与
            // 遗藏两支优先触发都落空后，改为踏上分叉路线（共 5 层、每
            // 层三选一节点），由 chooseRouteNode 按节点类型触发战斗/
            // 精英/事件/商店/休息；其中「事件」节点才走牌堆抽取
            // （presentDeckEvent，抽牌与结算口径与原探索逐字一致）。
            // 牌堆模型（U-576）与抽取口径保持可用，路线层只决定下一步
            // 触发哪一类。
            startRoute(state, c);
          }
          }
        }
      }

      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  tribulation: defineAction({
    description: "渡劫仪式推进（U-415）：大境界突破判定成功后进入渡劫三段——face 迎劫（雷劫来临叙事段 → 渡劫战段）、fight 迎战雷劫化身（按目标境界配表的化身，走 Q34 斗法 d20 链，败北伤势照常但不致死、不触发任何惩罚链）、conclude 领受劫果（劫后结算：胜则正式升境并在此刻消耗破境丹 1 颗，败则退回本境大圆满、修为全额退回、破境丹不消耗、连败保底按进入渡劫前快照不变）；三段都不另耗月份与行动点（成本已含在突破动作里），渡劫状态进存档可中断续走，未了结前其他动作按待决口径一律拦截。",
    request: z.object({ step: z.enum(["face", "fight", "conclude"]) }),
    response: stateResponse,
    async handler(ctx, args): Promise<StateResponse> {
      const state = await loadState(ctx);
      const c = state.character;
      if (!c || c.dead || !c.tribulation) return toResponse(state);
      const trib = c.tribulation;
      const def = tribulationFor(trib.targetRealmIdx);
      const targetName = realmsFor(state.settings)[trib.targetRealmIdx]?.name ?? "";
      if (args.step === "face") {
        if (trib.phase !== "arrival" || !def) return toResponse(state);
        trib.phase = "battle";
        pushLog(state, c.lifeNo, "event", `⚡ 迎劫：你立于雷海正中，抬头直面「${def.name}」——退无可退，唯有一战。胜之，${targetName}境门为你而开；败了，也不过退回大圆满，雷劫不取你性命。`);
      } else if (args.step === "fight") {
        if (trib.phase !== "battle") return toResponse(state);
        settleTribulationFight(state);
      } else {
        if (trib.phase !== "settle") return toResponse(state);
        concludeTribulation(state);
      }
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  randomExplore: defineAction({
    description: "随机探索（U-402）：远征/探秘/试炼塔三类通用随机探索，不绑定任何地点、无境界门槛——点入即一次探索行动，耗时与地点探索同为 3 个月（细时钟 explore 键），从该类独立事件子池（每类 8 桩）抽一桩摆成待决事件，走既有 chooseOption 结算（Q34 探索 d80、U-377 代价选项照常、难度按机缘档位随境界缩放）；产出只有普通资源（远征偏灵石、探秘附赠矿石/残页/丹药等已有材料、试炼塔偏修为），不给传承点、不掉法宝；与地点探索互不干扰：不掷地点密度、不占隐藏埋点、不动 U-401 三界秘境槽位，结算不挂地点掉落尾巴；待决事件未决或路线进行中时不受理。",
    request: z.object({ mode: z.enum(["expedition", "delve", "tower"]) }),
    response: stateResponse,
    async handler(ctx, args): Promise<StateResponse> {
      const state = await loadState(ctx);
      const c = state.character;
      if (!c || c.dead) return toResponse(state);
      // 待决事件未决时照旧拦截（与其他动作同一口径，明示原因）。
      if (notePendingEventBlock(state)) { await saveState(ctx, state); return toResponse(state); }
      // 路线进行中同样不受理（与 act 同口径：先走完路线或收程）。
      if (c.route) return toResponse(state);
      // U-409：随机探索与地点探索同属探索类，耗行动点 10（配置
      // 表）——抽事件之前扣点；点数不足明示原因、不抽不耗时。
      if (!spendActionPoints(state, "explore")) { await saveState(ctx, state); return toResponse(state); }
      const mode = randomExploreModeById(args.mode);
      const ev = drawRandomExploreEvent(state, args.mode);
      if (!mode || !ev) return toResponse(state);
      // 耗时与地点探索同键（time-costs 的 explore = 3 月）：出门
      // 历练本身耗时，先推进时钟再摆事件；事件抉择结算不再另计
      // 耗时（与地点探索逐字同口径）。
      advanceActionMonths(state, "explore");
      pushLog(state, c.lifeNo, "event", `随机探索 · ${mode.label}：这一程不问目的地，只循着心意走——耗时 3 个月。`);
      presentDrawnEvent(state, c, ev);
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  startGrid: defineAction({
    description: "翻格开局（U-412）：开一局 3×3 覆面棋盘 = 一次探索行动，耗 3 个月 + 探索类行动点 10 点（与地点探索同键 explore、与 U-409 口径一致），九格类型在战斗/机缘/休整/狩猎/突破五类中按配置权重随机分布、发牌即定死并存档；已有未翻完的棋盘时不开新局（先翻完或收局），已有待决事件未决时不受理；本局翻完（9 格全翻）后可直接再开新局覆盖。",
    request: z.object({}),
    response: stateResponse,
    async handler(ctx): Promise<StateResponse> {
      const state = await loadState(ctx);
      const c = state.character;
      if (!c || c.dead) return toResponse(state);
      if (notePendingEventBlock(state)) { await saveState(ctx, state); return toResponse(state); }
      // 已有未翻完的棋盘：不开新局（成本已付、棋盘保留续翻）。
      if (c.gridBoard && c.gridBoard.cells.some((x) => !x.flipped)) {
        pushLog(state, c.lifeNo, "hint", "已有一局翻格未收：先把这局翻完，或收局之后再开新局。");
        await saveState(ctx, state);
        return toResponse(state);
      }
      // U-409：开局与地点探索同属探索类，耗行动点 10（配置表）
      // ——发牌之前扣点；点数不足明示原因、不发牌不耗时。
      if (!spendActionPoints(state, "explore")) { await saveState(ctx, state); return toResponse(state); }
      c.gridBoard = dealGridBoard(state);
      // 耗时与地点探索同键（time-costs 的 explore = 3 月）：开局
      // 本身耗时，翻格不再另计（与随机探索逐字同口径）。
      advanceActionMonths(state, "explore");
      pushLog(state, c.lifeNo, "event", `翻格开局 · ${gridChapterFor(c.realmIdx)}：一方 3×3 的覆面棋盘在眼前铺开——九格之下，战斗、机缘、休整、狩猎、突破，各藏其一（耗时 3 个月）。翻哪一格，先由你定。`);
      checkDeath(state, "翻格开局途中寿元耗尽");
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  flipGridCell: defineAction({
    description: "翻格（U-412）：翻开棋盘上指定的一格——亮出格子类型与一句对应类型的短诗，并触发一桩对应事件：优先从现有事件池按类型过滤抽取（战斗/机缘/休整/狩猎/突破，分类只读事件内容），走既有待决事件卡 + chooseOption 结算（Q34 探索 d80、U-377 代价照常），某类在事件池中无可过滤项时用该类型的专属兜底小事件；翻格本身不另耗月份/行动点（开局已付）；已有待决事件未决或正在分叉路线上时不受理；翻格事件不挂地点探索尾部钩子、不掷地点密度、不占隐藏埋点、不动 U-401 秘境槽位。",
    request: z.object({ cellIdx: z.number().int().min(0).max(8) }),
    response: stateResponse,
    async handler(ctx, args): Promise<StateResponse> {
      const state = await loadState(ctx);
      const c = state.character;
      if (!c || c.dead) return toResponse(state);
      if (notePendingEventBlock(state)) { await saveState(ctx, state); return toResponse(state); }
      // 路线进行中不受理：路线事件与翻格事件同走待决链，混排会
      // 让 chooseOption 的路线推进钩子误进一层（与年度事件排队
      // 同理）——先走完这一程或收程再来翻格。
      if (c.route) {
        pushLog(state, c.lifeNo, "hint", "正在分叉路线上：先走完这一程或收程，再来翻格。");
        await saveState(ctx, state);
        return toResponse(state);
      }
      const board = c.gridBoard;
      const cell = board?.cells[args.cellIdx];
      if (!board || !cell) {
        pushLog(state, c.lifeNo, "hint", "眼下没有进行中的翻格棋盘：先开一局再来翻格。");
        await saveState(ctx, state);
        return toResponse(state);
      }
      if (cell.flipped) {
        pushLog(state, c.lifeNo, "hint", "这一格已经翻开过了，换一格试试。");
        await saveState(ctx, state);
        return toResponse(state);
      }
      // 先落翻开状态再摆事件：事件未决期间棋盘如实显示此格已翻
      //（待决拦截保证它不会被重复翻），结算与否不回滚翻格。
      cell.flipped = true;
      const label = GRID_CELL_LABELS[cell.type] ?? cell.type;
      const flippedCount = board.cells.filter((x) => x.flipped).length;
      pushLog(state, c.lifeNo, "event", `翻开一格 · ${label}格（第 ${flippedCount}/9 格）：「${cell.poem}」`);
      const ev = drawGridEvent(state, cell.type);
      if (ev) presentGridEvent(state, ev, cell.type);
      if (flippedCount >= 9) {
        pushLog(state, c.lifeNo, "event", "九格尽翻，本局翻格就此翻完——收局，或再开一局新的棋盘。");
      }
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  closeGrid: defineAction({
    description: "翻格收局（U-412）：主动结束当前进行中的棋盘——已付的开局成本（3 个月 + 10 行动点）不退、已翻格的结算分毫不动，无任何惩罚；收局后可再开新局。无进行中棋盘时无操作。",
    request: z.object({}),
    response: stateResponse,
    async handler(ctx): Promise<StateResponse> {
      const state = await loadState(ctx);
      const c = state.character;
      if (!c || c.dead) return toResponse(state);
      if (!c.gridBoard) return toResponse(state);
      const flippedCount = c.gridBoard.cells.filter((x) => x.flipped).length;
      c.gridBoard = null;
      pushLog(state, c.lifeNo, "event", `翻格收局：这一局翻了 ${flippedCount}/9 格，就此收起棋盘——开局的成本不退，翻过的际遇都已落袋，无任何惩罚。`);
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  sect: defineAction({
    description: "宗门系统：在青云山门拜入宗门、接宗门差事攒贡献、凭贡献与境界晋升、领取月俸（Q14）；晋升到配置位阶时宗门另赐一件法宝（U-620 宗门赐宝，赋予走 U-618 门槛口径）；差事同属经营日常，结算后按配置概率（U-384）可能被一桩现有事件池的随机变故打断。",
    request: z.object({ kind: z.enum(["join", "chore", "promote", "stipend"]) }),
    response: stateResponse,
    async handler(ctx, args): Promise<StateResponse> {
      const state = await loadState(ctx);
      const c = state.character;
      if (!c || c.dead) return toResponse(state);
      if (notePendingEventBlock(state)) { await saveState(ctx, state); return toResponse(state); }
      const wk = weekKeyOf(new Date());
      if (c.weekKey !== wk) { c.weekKey = wk; c.groupCounts = {}; }
      const rank = sectRankById(c.sectRankId);

      if (args.kind === "join") {
        if (c.sectRankId) {
          pushLog(state, c.lifeNo, "hint", "你已是青云宗弟子，无需重复拜入。");
        } else if (c.locationId !== "sect") {
          pushLog(state, c.lifeNo, "hint", "拜入宗门要在青云山门进行——先启程前往青云山门。");
        } else {
          c.sectRankId = "outer";
          pushLog(state, c.lifeNo, "sect", "在青云山门测灵台前登记造册，正式拜入宗门，成为外门弟子——从此有月俸、有差事、也有晋升之路。");
        }
      }

      if (args.kind === "chore") {
        if (!rank) pushLog(state, c.lifeNo, "hint", "尚未拜入宗门，接不了宗门差事——先去青云山门拜入。");
        else if (c.locationId !== "sect") pushLog(state, c.lifeNo, "hint", "宗门差事要在青云山门接取——你现在不在山门。");
        if (!rank || c.locationId !== "sect") { await saveState(ctx, state); return toResponse(state); }
        // U-409：宗门差事耗行动点 12（配置表）——守卫已过、真正
        // 办差之前扣点；点数不足明示原因、不掷骰不耗时。
        if (!spendActionPoints(state, "sectChore")) { await saveState(ctx, state); return toResponse(state); }
        const dbl = c.talentIds.includes("t_sect") ? 2 : 1;
        // Q34：宗门差事系统骰面 d50（下限随宗门位阶、上限随体魄）。
        const roll = rollCheck(state, c, SKILL_CHECKS.sectChore.attr, SKILL_CHECKS.sectChore.dc, 0, [], "normal", { system: "sect" });
        // U-617：宗门类法宝（青云功勋令）——差事贡献（成功与辛苦
        // 贡献同口径）按配置百分比放大；无此 fx 时倍率恒为 1、逐字不变。
        const sectFx = activeArtifactFx(state, c);
        const sectMult = sectFx?.sectPct ? 1 + sectFx.sectPct / 100 : 1;
        if (roll.success) {
          // U-575：宗门差事奖励统一走权重表抽取；奖励区间包成等权表，
          // 与原 int(10, 18) / int(10, 25) 同分布、同结果（概率不变）。
          const choreRng = rngForNext(state, "sect:chore-reward");
          const contrib = Math.floor(weighted(choreRng, rangeTable(10, 18)) * dbl * sectMult);
          c.sectContrib += contrib;
          const eff: Effect = { stones: weighted(choreRng, rangeTable(10, 25)), cult: 10 };
          applyEffects(state, eff, { decayed: true });
          c.lastRoll = { label: "宗门差事", dice: roll.dice, bonus: roll.bonus, total: roll.total, dc: roll.dc, success: true, text: `差事办得利落，宗门贡献 +${contrib}${dbl > 1 ? "（宗门栋梁，翻倍）" : ""}。`, detail: roll.detail };
          pushLog(state, c.lifeNo, "sect", `宗门差事（判定明细：${roll.detail.text}）：办得利落，贡献 +${contrib}，赏灵石与修为。`);
        } else {
          const contrib = Math.floor(4 * dbl * sectMult);
          c.sectContrib += contrib;
          c.lastRoll = { label: "宗门差事", dice: roll.dice, bonus: roll.bonus, total: roll.total, dc: roll.dc, success: false, text: `差事办砸了，只记了个辛苦贡献 +${contrib}。`, detail: roll.detail };
          pushLog(state, c.lifeNo, "sect", `宗门差事（判定明细：${roll.detail.text}）：办砸了，贡献只 +${contrib}。`);
        }
        bumpGroupCount(c);
        // U-608：宗门差事耗时按细时钟配置表（sectChore，配置表定 6 月）。
        advanceActionMonths(state, "sectChore");
        checkDeath(state, "做宗门差事时寿元耗尽");
        // U-388：办一回宗门差事，推进「差事」类委托进度（成败都算
        // 办过，与差事本身的辛苦贡献口径一致；既有结算数值不变）。
        bumpCommissions(state, "sectChore", c.locationId);
        // U-389：同一回差事同样推进「差事」类限时帖进度。
        bumpTimedEvents(state, "sectChore", c.locationId);
        // U-407：同一回差事同样推进连环任务当前阶段的「差事」目标。
        bumpQuests(state, "sectChore", { locationId: c.locationId });
        // U-384：宗门差事同属经营日常，结算后同样按概率触发随机事件。
        maybeTriggerDailyEvent(state);
      }

      if (args.kind === "promote") {
        if (!rank) {
          pushLog(state, c.lifeNo, "hint", "尚未拜入宗门，谈不上晋升——先去青云山门拜入。");
        } else {
          const idx = SECT_RANKS.findIndex((r) => r.id === rank.id);
          const next = SECT_RANKS[idx + 1];
          if (!next) {
            pushLog(state, c.lifeNo, "hint", "你已是宗门最高位阶，无可晋升。");
          } else if (c.sectContrib < next.contribNeed || c.realmIdx < next.realmNeed) {
            const lacks: string[] = [];
            if (c.sectContrib < next.contribNeed) lacks.push(`贡献 ${c.sectContrib}/${next.contribNeed}`);
            if (c.realmIdx < next.realmNeed) lacks.push(`境界需达${realmsFor(state.settings)[next.realmNeed]?.name ?? ""}境（现为${realmText(c, state.settings)}）`);
            pushLog(state, c.lifeNo, "hint", `晋升${next.name}条件未满：${lacks.join("、")}。`);
          } else {
            c.sectRankId = next.id;
            pushLog(state, c.lifeNo, "sect", `晋升！凭 ${c.sectContrib} 点宗门贡献与${realmText(c, state.settings)}的境界，你成为${next.name}，月俸涨至 ${next.stipend} 灵石/世次。`);
            // U-620：宗门赐宝——晋升到配置表（artifact-sources
            // .json 的 sectGrants）里列明的位阶时，宗门另赐一件
            // 定死的法宝（晋升本身的贡献/境界门槛与月俸口径一字
            // 未动，赐宝是额外一层）；赋予走统一口径（槽空认主、
            // U-618 门槛对齐；槽已占按配置折作）。该位阶不在表
            // 里时不发宝、日志不提。
            const grant = sectGrantForRank(next.id);
            if (grant) {
              const outcome = settleArtifactGrant(state, c, grant.artifactId, grant.occupiedFallback);
              if (outcome) pushLog(state, c.lifeNo, "sect", `🎁 宗门赐宝：${grant.text}——${artifactGrantOutcomeText(state, c, grant.artifactId, outcome, grant.occupiedFallback)}。`);
            }
          }
        }
      }

      if (args.kind === "stipend") {
        if (!rank) {
          pushLog(state, c.lifeNo, "hint", "尚未拜入宗门，没有月俸可领。");
        } else {
          const lastKey = `stipend:${c.lifeNo}`;
          if (c.groupCounts[lastKey]) {
            pushLog(state, c.lifeNo, "hint", "本世月俸已经领过了。");
          } else {
            c.groupCounts[lastKey] = 1;
            const amount = rank.stipend * (c.talentIds.includes("t_sect") ? 2 : 1);
            c.stones += amount;
            pushLog(state, c.lifeNo, "sect", `领取${rank.name}月俸：灵石 +${amount}${c.talentIds.includes("t_sect") ? "（宗门栋梁，翻倍）" : ""}。`);
          }
        }
      }

      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  chooseOption: defineAction({
    description: "在当前事件中选择一个选项：带代价的选项（U-377 模板）先复核可付性并精确扣代价（付不起则不结算），再按 Q34 探索骰 d80[下限~上限]+修正 vs 难度（难度以待决选项为准，含机缘档位上调）检定并结算成败；带 loop 标记的选项（U-378 见好就收模板）成功后进入「继续加圈/见好就收」抉择待决事件，加圈按配置比例同涨难度与收益、撤退按累计收获结算；U-381 路线商店卡（route:shop）按 Q17 同价买丹或离开，结算后推进路线一层，路线事件结算完毕同样推进一层；日常委托（U-390）触发的事件掷骰成功即办妥，当场额外结清日常奖励（稀有材料/前世线索），失败不结、委托仍可再触发；年度事件（U-410，待决事件带 annual 标记）同走本链结算，了结后补记「第 N 年 · 年度事件了结」日志并跳过地点口径的结算尾巴（不绑地点），排队中的年度事件在本次落盘时紧接着补呈现；共鸣奇遇（U-416，待决事件带 resonance 标记）同走本链结算并跳过地点尾巴，灵力暴走走 U-416 专属分支：同链判定结算，但气血损失钳制不致死、绝不调 checkDeath（不触发死亡/轮回/走火入魔死亡口径/记忆规则），结算后留下灵力紊乱 debuff（持续配置月数、修炼收益按配置打折、到期自动消散）。",
    request: z.object({ optionIdx: z.number().int().min(0).max(5) }),
    response: stateResponse,
    async handler(ctx, args): Promise<StateResponse> {
      const state = await loadState(ctx);
      const c = state.character;
      if (!c || c.dead || !c.pendingEvent) return toResponse(state);
      const pending = c.pendingEvent;

      // U-381 路线商店（行商驻足）：选项 0/1/2 = 按 Q17 商店同价买
      // 回春/聚气/破境丹（价格公式与坊市完全一致 shopPrice）；其余
      // 下标 = 拱手别过。买成或离开后卡片关闭并推进路线一层
      // （finishRouteStep）。灵石不足的选项在摆卡时已按 U-377 同
      // 口径标 costBlocked 由客户端禁用（见 chooseRouteNode 商店
      // 节点），此处灵石复核只是服务端兜底：万一被点到，只记提示、
      // 卡片保留待另选，不结算。
      if (pending.id === "route:shop") {
        const keys = ["heal", "cult", "brk"] as const;
        const key = keys[args.optionIdx];
        if (key) {
          const item = SHOP[key];
          const price = shopPrice(item.base, c.realmIdx);
          if (c.stones < price) {
            pushLog(state, c.lifeNo, "hint", `灵石不足：${item.name}要 ${price} 灵石，你只有 ${c.stones}——行商还候着，换一样或就此别过。`);
            await saveState(ctx, state);
            return toResponse(state);
          }
          c.stones -= price;
          c.pills[key] += 1;
          c.lastRoll = { label: "行商驻足", dice: 0, bonus: 0, total: 0, dc: 0, success: true, text: `向行商买下「${item.name}」，花费灵石 ${price}。` };
          pushLog(state, c.lifeNo, "shop", `路线商店：向行商购入「${item.name}」一枚，花费灵石 ${price}（${item.desc}）`);
        } else {
          pushLog(state, c.lifeNo, "event", "路线商店：你与行商拱手作别，各赶各的路。");
        }
        c.pendingEvent = null;
        finishRouteStep(state, c);
        await saveState(ctx, state);
        return toResponse(state);
      }

      if (pending.id === "buried_find") {
        const buriedHere = state.buried.find((b) => b.locationId === c.locationId && b.buriedLife !== c.lifeNo);
        if (buriedHere) {
          const tr = treasureById(buriedHere.treasureId);
          state.buried = state.buried.filter((b) => b !== buriedHere);
          if (tr) applyEffects(state, tr.effect);
          c.lastRoll = { label: "前世遗藏", dice: 0, bonus: 0, total: 0, dc: 0, success: true, text: `取回「${buriedHere.treasureName}」，前世的安排在这一世开了花。` };
          pushLog(state, c.lifeNo, "treasure", `取回前世遗藏「${buriedHere.treasureName}」（第${buriedHere.buriedLife}世所埋）。`);
        }
        c.pendingEvent = null;
        await saveState(ctx, state);
        return toResponse(state);
      }

      // U-393：循封印之蛋线索取回无主前世遗藏——与 buried_find 同形
      // 结算（必定取回、取回时才按既有遗藏 effect 落账，线索本身不
      // 发奖励）；取回后方位清空，下一条线索再标新处。
      if (pending.id === "sealed_cache") {
        const rv = state.sealedEggs?.revealed;
        if (rv && rv.locationId === c.locationId) {
          const tr = treasureById(rv.treasureId);
          if (tr) applyEffects(state, tr.effect);
          c.lastRoll = { label: "前世遗藏", dice: 0, bonus: 0, total: 0, dc: 0, success: true, text: `循着封印之蛋的线索，取回「${rv.treasureName}」。` };
          pushLog(state, c.lifeNo, "treasure", `取回线索所指的前世遗藏「${rv.treasureName}」（封印之蛋线索应验）。`);
          state.sealedEggs.revealed = null;
        }
        c.pendingEvent = null;
        await saveState(ctx, state);
        return toResponse(state);
      }

      // U-401 秘境之主：选项 0 = 迎战——战斗本体走既有斗法链
      // （settleSecretRealmBossFight 内的 resolveFight），打赢发
      // 固定大奖并置空本世 Boss 槽、败北按斗法败北口径且可再战；
      // 其余选项 = 暂避锋芒，不结算、不惩罚，Boss 仍会再来。
      if (pending.id.startsWith("realmboss:")) {
        const locId = pending.id.slice("realmboss:".length);
        const realmDef = secretRealmAt(locId);
        if (!realmDef || c.locationId !== realmDef.locationId) { c.pendingEvent = null; await saveState(ctx, state); return toResponse(state); }
        if (args.optionIdx === 0) {
          settleSecretRealmBossFight(state, realmDef);
        } else {
          pushLog(state, c.lifeNo, "event", `你暂避锋芒，退出了「${realmDef.boss.name}」的领地——它没有追来，还会在此地等你。`);
        }
        c.pendingEvent = null;
        await saveState(ctx, state);
        return toResponse(state);
      }

      // Q18 仇敌寻仇：胜则仇怨大减（清零则此怨了结），败则伤上加伤、仇怨更深。
      if (pending.id.startsWith("ambush:")) {
        const npcId = pending.id.slice("ambush:".length);
        const rel = c.relations.find((r) => r.npcId === npcId && r.kind === "enemy");
        const opt = pending.options[args.optionIdx];
        if (!rel || !opt) { c.pendingEvent = null; await saveState(ctx, state); return toResponse(state); }
        // Q34：寻仇属复仇，走斗法系统骰面 d20（难度按境界差：寻仇
        // 基准难度本就随玩家境界与仇怨算，见 AMBUSH_CHECK）。
        const roll = rollCheck(state, c, opt.attr, opt.dc, 0, [], "normal", { system: "combat" });
        const success = roll.success;
        let text = "";
        if (args.optionIdx === 0) {
          if (success) {
            applyEffects(state, { stones: 25, cult: 20, karma: 2 });
            rel.bond -= 45;
            text = rel.bond <= 0 ? `你胜了这一场，${rel.name}收剑退走：「这笔账，一笔勾销。」仇怨就此了结。` : `你胜了这一场，${rel.name}恨恨退走，仇怨消减大半。`;
          } else {
            applyEffects(state, { hp: -34 });
            rel.bond = Math.min(100, rel.bond + 5);
            text = `你败下阵来，${rel.name}也不追击，只冷笑一声没入林影——这梁子，结得更深了。`;
          }
        } else if (args.optionIdx === 1) {
          if (success) {
            applyEffects(state, { stones: -40 });
            rel.bond -= 35;
            text = rel.bond <= 0 ? `你赔上一笔灵石，${rel.name}掂了掂钱袋，转身离去——破财免灾，此怨了结。` : `你赔上一笔灵石，${rel.name}的脸色缓和了些，仇怨消减。`;
          } else {
            applyEffects(state, { stones: -70, hp: -15 });
            text = `${rel.name}收了灵石却翻脸动手，你又赔钱又挨打，亏到家了。`;
          }
        } else {
          if (success) {
            rel.bond -= 10;
            text = `你脚底抹油窜入山林，${rel.name}追之不及，只在后面骂了几声。`;
          } else {
            applyEffects(state, { hp: -30 });
            rel.bond = Math.min(100, rel.bond + 5);
            text = `没跑出多远就被${rel.name}截住揍了一顿，拖着伤腿才甩脱。`;
          }
        }
        if (rel.bond <= 0) c.relations = c.relations.filter((r) => r !== rel);
        c.lastRoll = { label: `仇敌寻仇·${opt.label}`, dice: roll.dice, bonus: roll.bonus, total: roll.total, dc: roll.dc, success, text, detail: roll.detail };
        pushLog(state, c.lifeNo, success ? "social" : "event_fail", `仇敌寻仇——${opt.label}（判定明细：${roll.detail.text}）：${text}`);
        c.pendingEvent = null;
        checkDeath(state, "陨落于仇敌寻仇");
        await saveState(ctx, state);
        return toResponse(state);
      }

      // U-378 见好就收：抉择待决事件（id 为 loop:<事件id>，进行状态
      // 在 pending.loop）。选项 0 = 继续加圈：立刻按放大后的难度与
      // 成败效果结算下一圈——成功则刷新抉择（圈数 +1、收获累计），
      // 失败则按该圈失败效果结束事件（先前各圈收获已落袋、不追
      // 扣）；选项 1 = 见好就收：按当前累计结算收手，已得收获全部
      // 保留。每圈只呈现这一次抉择，抉择本身不掷骰、不耗时。
      if (pending.id.startsWith("loop:")) {
        const loop = pending.loop;
        // U-410：年度事件的加圈抉择继承年度标记（见主分支构建
        // 处）——收手与加圈失败了结时补记年度了结日志，继续加圈
        // 时把标记传给下一圈的抉择待决事件。
        const annualMark = pending.annual;
        const ev = loop ? EVENTS.find((e) => e.id === loop.eventId) : undefined;
        const opt = ev?.options[loop?.optionIdx ?? -1];
        if (!loop || !ev || !opt) { c.pendingEvent = null; await saveState(ctx, state); return toResponse(state); }
        if (args.optionIdx === 1) {
          const gainsText = formatEffectGains(loop.gains) || "无";
          c.lastRoll = { label: `${ev.title}·见好就收`, dice: 0, bonus: 0, total: 0, dc: 0, success: true, text: `见好就收，抽身而退。这一趟共探 ${loop.round} 圈，收获 ${gainsText}，全数落袋。` };
          pushLog(state, c.lifeNo, "event_ok", `${ev.title}——见好就收：探到第 ${loop.round} 圈收手，累计收获 ${gainsText} 全部保留。`);
          if (annualMark) pushLog(state, c.lifeNo, "event_ok", `📅 第 ${annualMark.year} 年 · 年度事件了结：「${ev.title}」${annualMark.grand ? "（年度大事件）" : ""}——这一年的际遇就此翻篇。`);
          bumpGroupCount(c);
          // U-388：这桩际遇在本地点结算完毕，推进「探索」类委托进度。
          bumpCommissions(state, "explore", c.locationId);
          // U-389：同一桩际遇同样推进「探索」类限时帖进度。
          bumpTimedEvents(state, "explore", c.locationId);
          // U-407：同一桩际遇同样推进连环任务当前阶段的「探索」目标。
          bumpQuests(state, "explore", { locationId: c.locationId });
          c.pendingEvent = null;
          // U-381：路线事件至此结算完毕，推进路线一层（无路线时 no-op）。
          finishRouteStep(state, c);
          await saveState(ctx, state);
          return toResponse(state);
        }
        if (args.optionIdx !== 0) return toResponse(state);
        const round = loop.round + 1;
        const dc = loopDcFor(loop.baseDc, round);
        // Q34：加圈判定仍走探索系统骰面 d80（难度已在基准标尺上
        // 按 EVENT_LOOP 倍率放大，rollCheck 照旧等概率换算）。
        const roll = rollCheck(state, c, opt.attr, dc, eventBonusFor(c, ev), [], "normal", { system: "explore" });
        const before = snapshotResources(c);
        applyEffects(state, roll.success ? scaleEffectForLoop(opt.ok, round) : scaleEffectForLoop(opt.fail, round), { decayed: roll.success });
        const roundGains = diffResources(before, c);
        if (roll.success) {
          const gains = mergeGains(loop.gains, roundGains);
          c.lastRoll = { label: `${ev.title}·${opt.label} 第${round}圈`, dice: roll.dice, bonus: roll.bonus, total: roll.total, dc: roll.dc, success: true, text: opt.okText, detail: roll.detail };
          pushLog(state, c.lifeNo, "event_ok", `${ev.title}——${opt.label}第 ${round} 圈（难度与收益 ×${multText(round)}；判定明细：${roll.detail.text}）：${opt.okText} 本圈落袋 ${formatEffectGains(roundGains) || "无"}，累计 ${formatEffectGains(gains) || "无"}——继续加圈，还是见好就收？`);
          c.pendingEvent = loopDecisionEvent(ev, opt, { ...loop, round, gains });
          if (annualMark) c.pendingEvent.annual = annualMark;
          checkDeath(state, `陨落于「${ev.title}」`);
          if (c.dead) { c.pendingEvent = null; c.route = null; }
        } else {
          c.lastRoll = { label: `${ev.title}·${opt.label} 第${round}圈`, dice: roll.dice, bonus: roll.bonus, total: roll.total, dc: roll.dc, success: false, text: opt.failText, detail: roll.detail };
          pushLog(state, c.lifeNo, "event_fail", `${ev.title}——${opt.label}第 ${round} 圈（难度与收益 ×${multText(round)}；判定明细：${roll.detail.text}）：${opt.failText} 这一趟止步于此；先前 ${loop.round} 圈的收获 ${formatEffectGains(loop.gains) || "无"} 早已落袋，不受影响。`);
          if (annualMark) pushLog(state, c.lifeNo, "event_fail", `📅 第 ${annualMark.year} 年 · 年度事件了结：「${ev.title}」${annualMark.grand ? "（年度大事件）" : ""}——这一年的际遇就此翻篇。`);
          bumpGroupCount(c);
          // U-388：这桩际遇在本地点结算完毕，推进「探索」类委托进度。
          bumpCommissions(state, "explore", c.locationId);
          // U-389：同一桩际遇同样推进「探索」类限时帖进度。
          bumpTimedEvents(state, "explore", c.locationId);
          // U-407：同一桩际遇同样推进连环任务当前阶段的「探索」目标。
          bumpQuests(state, "explore", { locationId: c.locationId });
          c.pendingEvent = null;
          checkDeath(state, `陨落于「${ev.title}」`);
          // U-381：路线事件至此结算完毕，推进路线一层（无路线时 no-op）。
          finishRouteStep(state, c);
        }
        await saveState(ctx, state);
        return toResponse(state);
      }

      // U-416 灵力暴走：走专属结算分支——判定链与普通事件同一
      // 条（Q34 探索 d80、U-377 代价照常），但守三条 U-416 红
      // 线：① 气血损失钳制不致死（结算后气血至少余 1）；② 绝
      // 不调 checkDeath——暴走不触发死亡 / 轮回 / Q35 走火入魔
      // 死亡口径 / 记忆规则中的任何一条；③ 结算后留下「灵力紊
      // 乱」debuff（到期月份 = 当前累计月份 + 配置 disorder-
      // Months，期间修炼收益按配置打折，到期由 advanceMonths
      // 的 settleResonanceDisorder 自动消散）。暴走不绑地点：
      // 不推进地点口径的委托 / 限时帖 / 连环任务、不挂地点结算
      // 尾巴（整段先于主分支返回）。
      if (pending.resonance?.kind === "rampage") {
        const ev = RAMPAGE_EVENT_DEF;
        const opt = ev.options[args.optionIdx];
        if (!opt) return toResponse(state);
        const optCost = pending.options[args.optionIdx]?.cost;
        let costNote = "";
        if (optCost) {
          if (eventCostBlockReason(c, optCost)) return toResponse(state);
          applyEventCost(state, optCost);
          costNote = `先付代价（${formatEventCost(optCost)}），`;
        }
        const optDc = pending.options[args.optionIdx]?.dc ?? opt.dc;
        const roll = rollCheck(state, c, opt.attr, optDc, eventBonusFor(c, ev), [], "normal", { system: "explore" });
        const success = optDc <= 0 ? true : roll.success;
        applyEffects(state, success ? opt.ok : opt.fail, { decayed: success });
        // 红线①：气血钳制——暴走伤得再重，也留一口气在。
        if (c.hp < 1) c.hp = 1;
        // 红线③：紊乱 debuff 落盘（只落到期月份，状态本身不存）。
        c.resonanceDisorderUntil = c.totalMonths + RESONANCE.disorderMonths;
        const text = success ? opt.okText : opt.failText;
        c.lastRoll = { label: `${ev.title}·${opt.label}`, dice: optDc > 0 ? roll.dice : 0, bonus: optDc > 0 ? roll.bonus : 0, total: optDc > 0 ? roll.total : 0, dc: optDc > 0 ? roll.dc : 0, success, text, ...(optDc > 0 ? { detail: roll.detail } : {}) };
        pushLog(state, c.lifeNo, success ? "event_ok" : "event_fail", `${ev.title}——${opt.label}（判定明细：${roll.detail.text}）：${costNote}${text}`);
        pushLog(state, c.lifeNo, "event", `🌀 灵力紊乱：暴走虽平，经脉里的乱流还得养 ${RESONANCE.disorderMonths} 个月——紊乱期间修炼收益 −${RESONANCE.disorderCultivatePenaltyPct}%，到期自动消散。这只是体内的小劫：不伤寿元、不动记忆、不涉轮回。`);
        c.pendingEvent = null;
        await saveState(ctx, state);
        return toResponse(state);
      }

      // U-402：待决事件也可能来自随机探索的模式子池（远征/探秘/
      // 试炼塔）——先查地点事件池、再查模式池，两池 id 经配置自
      // 检互不撞车，查到哪桩就按哪桩的选项结算，链路同一条。
      // U-410：年度事件的个人事件本就在 EVENTS 里（同一查表命
      // 中）；年度大事件在年度小池里，作第三查。
      // U-412：翻格事件主池抽的本就在 EVENTS 里（同一查表命
      // 中）；兜底小事件在翻格专属小池里，作第四查。
      // U-416：共鸣奇遇在共鸣专属小池里，作第五查（暴走事件不
      // 走本查——已在上方专属分支结算）。
      const ev = EVENTS.find((e) => e.id === pending.id) ?? randomExploreEventById(pending.id) ?? annualEventById(pending.id) ?? gridFallbackEventById(pending.id) ?? resonanceEventById(pending.id);
      const opt = ev?.options[args.optionIdx];
      if (!ev || !opt) return toResponse(state);
      const isModeEvent = isRandomExploreEventId(pending.id);
      // U-410：年度事件标记（个人/大事件同）：结算后补记了结日
      // 志，且与模式事件同口径跳过地点结算尾巴（年度事件不绑地
      // 点——不推进地点口径的委托/限时帖/连环任务、不结日常委
      // 托、不挂残页/拾矿/法宝三掷）。
      const annualMark = pending.annual;
      // U-412：翻格标记——翻格事件与年度事件同口径跳过地点结算
      // 尾巴（不绑地点：不推进地点口径的委托/限时帖/连环任务、
      // 不结日常委托、不挂残页/拾矿/法宝三掷）。翻格主池事件经
      // 配置分类排除带 loop 选项者，故不会进上方加圈链。
      const gridMark = pending.grid;
      // U-416：共鸣标记——共鸣奇遇与年度 / 翻格事件同口径跳过
      // 地点结算尾巴（不绑地点），了结后补记一条共鸣了结日志。
      //（暴走已在上方专属分支返回，走不到这里。）
      const resonanceMark = pending.resonance;
      // U-377 代价模板：标价以待决选项里的 cost 为准（与玩家看到的
      // 一致）。付不起 → 选项不可选：整次选择不结算、事件仍待决，
      // 状态原样返回（客户端已禁用该选项并明示原因，这里是服务端
      // 复核兜底）。付得起 → 先精确扣代价，再掷骰结算成败收益，
      // 成败都不退代价。
      const optCost = pending.options[args.optionIdx]?.cost;
      let costNote = "";
      if (optCost) {
        if (eventCostBlockReason(c, optCost)) return toResponse(state);
        applyEventCost(state, optCost);
        costNote = `先付代价（${formatEventCost(optCost)}），`;
      }
      // 结算难度以待决事件里的选项难度为准（与玩家看到的一致）：
      // Q34 机缘档位上调正是记在这里（事件原表难度不变）。
      const optDc = pending.options[args.optionIdx]?.dc ?? opt.dc;
      // Q34：探索系统骰面 d80（上下限随机缘现算）。
      const roll = rollCheck(state, c, opt.attr, optDc, eventBonusFor(c, ev), [], "normal", { system: "explore" });
      const success = optDc <= 0 ? true : roll.success;
      const eff = success ? opt.ok : opt.fail;
      const text = success ? opt.okText : opt.failText;
      // U-378 见好就收：loop 选项成功时要按资源差值实测本圈收获，
      // 结算前先留一份资源快照（失败或无模板选项不留、路径不变）。
      const loopBefore = success && opt.loop ? snapshotResources(c) : null;
      // U-617：寻宝类法宝（寻踪罗盘）——际遇成功时灵石/修为收益按
      // 配置百分比放大（只放大正收益；代价、失败效果与事件本身的
      // 触发/难度一字不动，放大后仍走 applyEffects 的地点衰减与
      // 天赋修正）。无此 fx 时逐字不变。
      let rewardEff = eff;
      if (success) {
        const evFx = activeArtifactFx(state, c);
        if (evFx?.eventRewardPct && ((eff.stones ?? 0) > 0 || (eff.cult ?? 0) > 0)) {
          const m = 1 + evFx.eventRewardPct / 100;
          rewardEff = { ...eff, ...(eff.stones && eff.stones > 0 ? { stones: Math.floor(eff.stones * m) } : {}), ...(eff.cult && eff.cult > 0 ? { cult: Math.floor(eff.cult * m) } : {}) };
        }
      }
      applyEffects(state, rewardEff, { decayed: success });
      // U-378 见好就收：带 loop 标记的选项掷骰成功后不结束事件——
      // 本圈收获即刻落袋（已由 applyEffects 结算完），随即给出本圈
      // 唯一一次抉择（继续加圈 / 见好就收，见 loopDecisionEvent 与
      // 上方 loop: 分支）；失败照旧单次结算结束，与无模板选项一
      // 致。loop 选项经模板校验必无关系钩子，故在此先于关系结算
      // 返回不影响 Q18。
      if (loopBefore) {
        const gains = diffResources(loopBefore, c);
        c.lastRoll = { label: `${ev.title}·${opt.label}`, dice: optDc > 0 ? roll.dice : 0, bonus: optDc > 0 ? roll.bonus : 0, total: optDc > 0 ? roll.total : 0, dc: optDc > 0 ? roll.dc : 0, success: true, text, ...(optDc > 0 ? { detail: roll.detail } : {}) };
        pushLog(state, c.lifeNo, "event_ok", `${ev.title}——${opt.label}第 1 圈（判定明细：${roll.detail.text}）：${costNote}${text} 本圈落袋 ${formatEffectGains(gains) || "无"}——继续加圈（难度与收益同涨），还是见好就收？`);
        c.pendingEvent = loopDecisionEvent(ev, opt, { eventId: ev.id, optionIdx: args.optionIdx, round: 1, baseDc: optDc, gains });
        // U-410：年度事件若带加圈选项，抉择待决事件继承年度标
        // 记——收手/失败了结时照样补记年度了结日志。
        if (annualMark) c.pendingEvent.annual = annualMark;
        checkDeath(state, `陨落于「${ev.title}」`);
        if (c.dead) { c.pendingEvent = null; c.route = null; }
        await saveState(ctx, state);
        return toResponse(state);
      }
      // Q18：事件是关系的来源——成败各可能结下一段缘或一桩仇。
      const relSpec = success ? opt.relOk : opt.relFail;
      if (relSpec) addRelation(state, c, relSpec.npc, relSpec.kind, relSpec.bond, `结缘于「${ev.title}」`);
      if (ev.id === "cave_takeover") c.caveClaimedLife = c.lifeNo;
      c.lastRoll = { label: `${ev.title}·${opt.label}`, dice: optDc > 0 ? roll.dice : 0, bonus: optDc > 0 ? roll.bonus : 0, total: optDc > 0 ? roll.total : 0, dc: optDc > 0 ? roll.dc : 0, success, text, ...(optDc > 0 ? { detail: roll.detail } : {}) };
      pushLog(state, c.lifeNo, success ? "event_ok" : "event_fail",
        optDc > 0 ? `${ev.title}——${opt.label}（判定明细：${roll.detail.text}）：${costNote}${text}` : `${ev.title}——${opt.label}：${costNote}${text}`);
      // U-410：年度事件了结补记（标明年份，与触发日志成对）——
      // 这一年的际遇就此翻篇，下一个跨年再排下一桩。
      if (annualMark) pushLog(state, c.lifeNo, success ? "event_ok" : "event_fail", `📅 第 ${annualMark.year} 年 · 年度事件了结：「${ev.title}」${annualMark.grand ? "（年度大事件）" : ""}——这一年的际遇就此翻篇。`);
      // U-416：共鸣奇遇了结补记（与触发日志成对）。
      if (resonanceMark?.kind === "encounter") pushLog(state, c.lifeNo, success ? "event_ok" : "event_fail", `✨ 共鸣奇遇了结：「${ev.title}」——四象调和的际遇就此翻篇。`);
      bumpGroupCount(c);
      // U-402：模式探索（远征/探秘/试炼塔）的际遇不绑地点——不推
      // 进地点口径的委托/限时帖进度、不结日常委托（模式事件永不
      // 带 daily 标记）、不挂地点探索尾部的残页/拾矿/法宝掉落三
      // 掷（模式池自带材料产出，见下方附赠结算）；地点事件的结算
      // 尾巴与改前逐字一致，只在 isModeEvent 时整段跳过。
      if (!isModeEvent && !annualMark && !gridMark && !resonanceMark) {
      // U-388：这桩际遇在本地点结算完毕，推进「探索」类委托进度
      // （路线事件节点与 U-384 日常触发的事件同走本分支，一并计入；
      // 既有结算数值不变）。
      bumpCommissions(state, "explore", c.locationId);
      // U-389：同一桩际遇同样推进「探索」类限时帖进度（与委托并行
      // 计数、互不影响；路线事件与日常触发事件同走本分支，一并计入）。
      bumpTimedEvents(state, "explore", c.locationId);
      // U-407：同一桩际遇同样推进连环任务当前阶段的「探索」目标
      // （与委托/限时帖并行计数、互不影响）。
      bumpQuests(state, "explore", { locationId: c.locationId });
      // U-390：这桩际遇若是本批日常委托触发的（pending.daily 标
      // 记），掷骰成功即算办妥——当场结清日常委托的额外奖励（稀
      // 有材料/前世线索，走既有字段，见 completeDailyCommission）；
      // 失败不结、委托仍留在本批待办里（这桩际遇已出本世牌堆，
      // 本批内不会再触发，下月刷新换新批，不惩罚）。事件本
      // 身的成败结算与奖励已在上方照旧走完，日常奖励是额外的一层。
      if (success && pending.daily) completeDailyCommission(state, pending.daily.dailyId);
      // U-396：际遇办妥之后，按当前地点的掉落表掷一次功法残页掉
      // 落（地点决定残页的功法与品质档，见 state.ts 的
      // maybeDropTechniquePage 与 content/location-drops.json）。
      // 这是结算之外的额外一掷：事件的触发概率、难度与成败收益
      // 一字未动；失败不掉。路线事件节点与日常触发事件同走本分
      // 支，一并按其所在地点掉落。
      if (success) maybeDropTechniquePage(state);
      // U-464：同一桩际遇办妥后再掷一次矿石掉落（独立种子流
      // drop:ore，与残页掉落互不干扰）：命中按配置权重拾得一块矿
      // 石——矿石的两条来源之一（另一条是坊市购买），见 state.ts
      // 的 maybeDropOre 与 content/forge.json。
      if (success) maybeDropOre(state);
      // U-620：同一桩际遇办妥后再掷一次法宝掉落（独立种子流
      // drop:artifact，与残页/矿石两掷互不干扰）：命中按配置权重
      // 从同一法宝池抽一件，赋予走统一口径（U-618 门槛封存/解
      // 封、槽已占折作），见 state.ts 的 maybeDropArtifact 与
      // content/artifact-sources.json。
      if (success) maybeDropArtifact(state);
      }
      // U-402：模式际遇（远征/探秘/试炼塔）掷骰成功时，按配置表
      // 结算所选选项的材料附赠（探秘的材料产出走这里——矿石/残
      // 页/丹药，不走上方地点掉落尾巴）；失败不发附赠。
      if (isModeEvent && success) {
        const grant = randomExploreGrantFor(ev.id, args.optionIdx);
        if (grant) settleRandomExploreGrant(state, grant);
      }
      c.pendingEvent = null;
      checkDeath(state, `陨落于「${ev.title}」`);
      // U-381：路线事件至此结算完毕，推进路线一层（无路线时 no-op；
      // 陨落时路线随本世终结，见 finishRouteStep）。
      finishRouteStep(state, c);
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  chooseRouteNode: defineAction({
    description: "分叉路线选节点（U-381）：在当前层三个节点中选定一个——战斗/精英即刻按 Q15 斗法结算（对手为生成节点时定下的敌手，精英是本地点最强者）、事件从本世事件牌堆抽一张摆成待决事件（结算完推进一层；摆事件之前先掷隐藏发现：本地点仍有剩余埋点且按配置概率掷中时改为触发一次隐藏发现、扣减 1 个埋点并发既有类型奖励，U-399）、商店摆出「行商驻足」卡按 Q17 同价买丹、休息按既有休整结算；即时结算的节点结算完即推进到下一层，走完第 5 层路线结束。",
    request: z.object({ nodeIdx: z.number().int().min(0).max(2) }),
    response: stateResponse,
    async handler(ctx, args): Promise<StateResponse> {
      const state = await loadState(ctx);
      const c = state.character;
      if (!c || c.dead || !c.route) return toResponse(state);
      if (notePendingEventBlock(state)) { await saveState(ctx, state); return toResponse(state); }
      const route = c.route;
      const node = route.nodes[args.nodeIdx];
      if (!node) return toResponse(state);
      const wk = weekKeyOf(new Date());
      if (c.weekKey !== wk) { c.weekKey = wk; c.groupCounts = {}; }

      if (node.type === "event") {
        // U-399 隐藏要素：摆事件之前先掷隐藏发现（本地点仍有剩余
        // 埋点且按配置概率掷中时，改为触发一次隐藏发现并扣减埋
        // 点、奖励即刻落袋，见 state.ts 的 maybeHiddenDiscovery）；
        // 触发了发现则本节点就此结算完毕、直接推进一层。未触发
        // （无剩余埋点或未掷中）走普通事件，口径不变。
        if (maybeHiddenDiscovery(state)) {
          finishRouteStep(state, c);
        } else {
          // 事件节点：摆成待决事件就地结算，路线推进推迟到 chooseOption
          // 把这桩事件结算完毕（finishRouteStep 钩子）。
          presentDeckEvent(state, c);
          // 地点无事件池等极端情形下没能摆出事件：不卡路线，直接推进。
          if (!c.pendingEvent) finishRouteStep(state, c);
        }
      } else if (node.type === "combat" || node.type === "elite") {
        const enemy = node.enemyId ? enemyById(node.enemyId) : undefined;
        if (enemy) {
          pushLog(state, c.lifeNo, "event", `🧭 路线第 ${route.layer} 层选了「${node.type === "elite" ? "精英" : "战斗"}」：迎面撞上${enemy.name}，避无可避。`);
          // Q15 斗法结算本体（与斗法动作共用 resolveFight，数值不变）。
          resolveFight(state, c, enemy);
        }
        finishRouteStep(state, c);
      } else if (node.type === "shop") {
        // 商店节点：行商驻足——丹药与价格全用 Q17 商店表（shopPrice
        // 按境界分档），买成/离开在 chooseOption 的 route:shop 分支
        // 结算并推进路线。
        // 2026-11-18 自测修复：购买选项带上与 U-377 代价模板同一
        // 口径的 cost / costBlocked——灵石不足时客户端预先禁用并
        // 明示原因，不再出现「点了只回提示、事件不关、可无限重复
        // 点」。标价与 chooseOption 结算实扣同源（shopPrice）。
        c.pendingEvent = {
          id: "route:shop", title: "行商驻足", art: "market",
          desc: "赶路途中，一名行商在岔路口支起了摊子：担子里正是坊市丹药铺的三种丹药，价钱也与坊市分毫不差（按你的境界分档）。买与不买，只在此一面之缘。",
          options: [
            ...(["heal", "cult", "brk"] as const).map((k): PendingOption => {
              const price = shopPrice(SHOP[k].base, c.realmIdx);
              const cost: Effect = { stones: -price };
              const blocked = eventCostBlockReason(c, cost);
              return {
                label: `买${SHOP[k].name}`,
                hint: `${SHOP[k].desc} · ${price} 灵石`,
                attr: "fortune", dc: 0,
                cost,
                ...(blocked ? { costBlocked: blocked } : {}),
              };
            }),
            { label: "谢过行商，就此别过", hint: "不买东西 · 继续赶路", attr: "fortune", dc: 0 },
          ],
        };
      } else {
        // 休息节点：既有休整结算（doSimpleAction 的 rest 分支，数值
        // 不变）；休整日志由结算本身记录。
        doSimpleAction(state, "rest");
        finishRouteStep(state, c);
      }
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  abandonRoute: defineAction({
    description: "放弃当前分叉路线（U-381）：仅在节点待选时可用（节点触发的事件待决中不可放弃），已走层数作废，回到日常行动。",
    request: z.object({}),
    response: stateResponse,
    async handler(ctx): Promise<StateResponse> {
      const state = await loadState(ctx);
      const c = state.character;
      if (!c || c.dead || !c.route) return toResponse(state);
      if (notePendingEventBlock(state)) { await saveState(ctx, state); return toResponse(state); }
      pushLog(state, c.lifeNo, "event", `🧭 在路线第 ${c.route.layer} 层就此收程，余下岔路留待下一程。`);
      c.route = null;
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  travel: defineAction({
    description: "前往世界地图上的另一个地点，耗时按目的地远近 1–6 个月（U-608 细时钟配置表 time-costs.json 的 travelMonths）；未解锁地点不可前往；分叉路线进行中不可启程（先走完或收程）；抵达指定地点（坊市/宗门/秘境）若本世未签到过则触发地点签到（U-391，即到即得发大奖、无需接取，并记入跨世签到图鉴 U-392）；本世已签到过则不再重发大奖，只按地点档位发故地重游小奖（U-392）；抵达时若本批日常委托（U-390，U-611 起按月刷新）正等在此地，不设接取、即刻触发为待决事件（途中寿终则两者都不触发）。",
    request: z.object({ locationId: z.string().min(1) }),
    response: stateResponse,
    async handler(ctx, args): Promise<StateResponse> {
      const state = await loadState(ctx);
      const c = state.character;
      if (!c || c.dead) return toResponse(state);
      // 待决守卫排在 route 早退之前（同 forgeArtifact 注释）。
      if (notePendingEventBlock(state)) { await saveState(ctx, state); return toResponse(state); }
      if (c.route) return toResponse(state);
      const loc = locById(args.locationId);
      if (!loc || loc.id === c.locationId) return toResponse(state);
      if (!locUnlocked(c, loc)) return toResponse(state);
      // U-409：旅行耗行动点 4（配置表）——启程之前扣点；点数不
      // 足明示原因、原地不动、不推进时钟。
      if (!spendActionPoints(state, "travel")) { await saveState(ctx, state); return toResponse(state); }
      c.locationId = loc.id;
      // U-608：旅行耗时按目的地查细时钟配置表（travelMonths，1–6 月）。
      advanceTravelMonths(state, loc.id);
      pushLog(state, c.lifeNo, "travel", `启程前往「${loc.name}」，耗时 ${travelMonthsTo(loc.id)} 个月。`);
      checkDeath(state, "赶路途中寿元耗尽");
      // U-407：旅行抵达，推进连环任务当前阶段的「抵达」目标（途
      // 中寿终则 bumpQuests 自行跳过；抵达地点以新地点为准）。
      if (!c.dead) bumpQuests(state, "arrive", { locationId: loc.id });
      // U-391 地点签到「到达即触发」：抵达的地点若是签到点（坊市/
      // 山门/秘境）且本世未签过，当场签到发大奖（settleSignInHere，
      // 即到即得、无接取无时限无掷骰）并记入跨世签到图鉴；本世已
      // 签过则改发按档小奖（U-392 故地重游，viaTravel=true——小奖
      // 只认真实抵达，读档期不发）。签到是纯到达奖励、不占待决事
      // 件槽位，故排在日常委托触发之前：两者同程抵达时先签到、再
      // 摆日常际遇，互不影响。途中寿终（checkDeath 已置 dead）则
      // 不签（settleSignInHere 内有守卫，此处再以 !c.dead 明示时序）。
      if (!c.dead) settleSignInHere(state, true);
      // U-390 日常委托「进入地点即触发」：旅行本身耗时数月（U-608
      // 细时钟）、必然跨月——先把日常批次刷新到抵达时的累计月份
      // （U-611 按月刷新，与 loadState 的读档刷新同一函数、同一口
      // 径；不先刷新，抵达时查到的还是上月的批次），再查本批委
      // 托。抵达后（且没有在路上寿终）若本批有一件日常委托正等在
      // 此地，不设接取动作、不用声望——委托指定的际遇还在本世牌
      // 堆里就当场触发（摆成带 daily 标记的待决事件，见 present-
      // DailyEvent）；这桩际遇本世已被别处抽走则本批触发不了，委
      // 托仍待办、下月刷新再换。
      if (!c.dead) ensureDailyBoard(state);
      if (!c.dead && !c.pendingEvent) {
        const dailyDef = dailyPendingHere(state);
        if (dailyDef) presentDailyEvent(state, c, dailyDef);
      }
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  buryTreasure: defineAction({
    description: "把一件宝物埋在当前地点作为前世遗藏：埋藏须真实封入宝物内容物等值的自有资源（修为/灵石按该宝物取回效果计，埋藏时当场扣除），任一后世到此地探索必定取回、取回即销账，隔多世仍有效。",
    request: z.object({ treasureId: z.string().min(1) }),
    response: stateResponse,
    async handler(ctx, args): Promise<StateResponse> {
      const state = await loadState(ctx);
      const c = state.character;
      if (!c || c.dead) return toResponse(state);
      if (notePendingEventBlock(state)) { await saveState(ctx, state); return toResponse(state); }
      const tr = treasureById(args.treasureId);
      const loc = locById(c.locationId);
      if (!tr || !loc) return toResponse(state);
      if (state.buried.some((b) => b.treasureId === tr.id && b.buriedLife === c.lifeNo)) {
        pushLog(state, c.lifeNo, "hint", `本世已经埋过一件「${tr.name}」了——同世同类只埋一件，免得后世的自己挑花了眼。`);
        await saveState(ctx, state);
        return toResponse(state);
      }
      // 2026-11-18 自测修复（遗藏零成本刷）：埋藏必须真实持有并消
      // 耗宝物的内容物——宝物取回时给多少（effect 的修为/灵石），
      // 埋藏时就须先封入多少自有资源，当场扣除。付不起则明示原
      // 因、不埋。取回侧既有口径不变（取回即从 buried 销账，一
      // 件只能取回一次）。轮回结算用传承点赎回遗藏的那条路是另
      // 一回事（已付传承点），不在此限。
      const needCult = tr.effect.cult ?? 0;
      const needStones = tr.effect.stones ?? 0;
      const lacks: string[] = [];
      if (c.cultivation < needCult) lacks.push(`修为需 ${needCult}（现有 ${c.cultivation}）`);
      if (c.stones < needStones) lacks.push(`灵石需 ${needStones}（现有 ${c.stones}）`);
      if (lacks.length > 0) {
        pushLog(state, c.lifeNo, "hint", `埋不下「${tr.name}」：遗藏要封入真实的东西——${lacks.join("、")}。攒够了再来埋，空匣子骗不了后世的自己。`);
        await saveState(ctx, state);
        return toResponse(state);
      }
      const cost: Effect = {};
      if (needCult) cost.cult = -needCult;
      if (needStones) cost.stones = -needStones;
      if (cost.cult || cost.stones) applyEffects(state, cost);
      state.buried.push({ treasureId: tr.id, treasureName: tr.name, locationId: loc.id, locationName: loc.name, buriedLife: c.lifeNo });
      const costParts: string[] = [];
      if (needCult) costParts.push(`修为 ${needCult}`);
      if (needStones) costParts.push(`灵石 ${needStones}`);
      pushLog(state, c.lifeNo, "treasure", `在「${loc.name}」埋下「${tr.name}」（封入${costParts.join("、")}，已当场扣除）——留给后世的自己，后世到此地探索即可取回。`);
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  sacrificeJade: defineAction({
    description: "祭练承世玉：献祭 5 年寿元，给跨世挂饰承世玉叠一层永久加成（每层检定 +2）。",
    request: z.object({}),
    response: stateResponse,
    async handler(ctx): Promise<StateResponse> {
      const state = await loadState(ctx);
      const c = state.character;
      if (!c || c.dead) return toResponse(state);
      if (notePendingEventBlock(state)) { await saveState(ctx, state); return toResponse(state); }
      // U-609：守卫按月比——献祭 5 年（60 个月）后累计月份不得触到
      // 寿元上限（月），与 checkDeath 的按月寿终判定同一口径。
      if (c.totalMonths + monthsOfYears(5) >= lifespanMonthsOf(c)) return toResponse(state);
      // U-608：献祭的 5 年寿元经细时钟口按年换算成月份推进（口径不变）。
      advanceYears(state, 5); c.jadeLayers += 1;
      pushLog(state, c.lifeNo, "jade", `以五年寿元祭练承世玉，承世玉叠至 ${c.jadeLayers} 层——此后每世检定 +${c.jadeLayers * JADE_PER_LAYER}。`);
      checkDeath(state, "祭练承世玉时寿元耗尽");
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  setQuickPlan: defineAction({
    description: "排一条预设路线（修炼/休整/副职的组合，最多 4 段）并立即自动执行（单次最多连走 12 步，遇事件或陨落停下）。",
    request: z.object({
      steps: z.array(z.object({
        kind: z.enum(["cultivate", "rest", "alchemy", "forge", "farm", "fish"]),
        count: z.number().int().min(1).max(20),
      })).min(1).max(4),
    }),
    response: stateResponse,
    async handler(ctx, args): Promise<StateResponse> {
      const state = await loadState(ctx);
      const c = state.character;
      if (!c || c.dead) return toResponse(state);
      // 待决守卫排在 route 早退之前（同 forgeArtifact 注释）。
      if (notePendingEventBlock(state)) { await saveState(ctx, state); return toResponse(state); }
      if (c.route) return toResponse(state);
      const wk = weekKeyOf(new Date());
      if (c.weekKey !== wk) { c.weekKey = wk; c.groupCounts = {}; }
      c.quickPlan = args.steps.map((s) => ({ kind: s.kind, count: s.count }));
      executeQuickPlan(state);
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  runQuickPlan: defineAction({
    description: "继续执行当前预设路线剩余的步数（单次最多连走 12 步）。",
    request: z.object({}),
    response: stateResponse,
    async handler(ctx): Promise<StateResponse> {
      const state = await loadState(ctx);
      const c = state.character;
      if (!c || c.dead) return toResponse(state);
      // 待决守卫排在 route 早退之前（同 forgeArtifact 注释）。
      if (notePendingEventBlock(state)) { await saveState(ctx, state); return toResponse(state); }
      if (c.route || c.quickPlan.length === 0) return toResponse(state);
      const wk = weekKeyOf(new Date());
      if (c.weekKey !== wk) { c.weekKey = wk; c.groupCounts = {}; }
      executeQuickPlan(state);
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  clearQuickPlan: defineAction({
    description: "清空当前预设路线。",
    request: z.object({}),
    response: stateResponse,
    async handler(ctx): Promise<StateResponse> {
      const state = await loadState(ctx);
      const c = state.character;
      if (!c) return toResponse(state);
      c.quickPlan = [];
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  buyOre: defineAction({
    description: "在临渊坊市购买一块锻造矿石（U-464）：七阶矿石各有基准价，实际价按 Q17 物价口径随境界分档（shopPrice）；须身在坊市、灵石足够，买入不耗月。矿石的另一条来源是探索际遇办妥后按配置概率拾得。",
    request: z.object({ tier: z.number().int().min(1).max(7) }),
    response: stateResponse,
    async handler(ctx, args): Promise<StateResponse> {
      const state = await loadState(ctx);
      const c = state.character;
      if (!c || c.dead) return toResponse(state);
      // 2026-11-18 自测修复：有待决事件时买矿此前静默无反馈，现明示拦截。
      if (notePendingEventBlock(state)) { await saveState(ctx, state); return toResponse(state); }
      const tier = forgeTierByTier(args.tier);
      if (!tier) return toResponse(state);
      const price = shopPrice(tier.buyPrice, c.realmIdx);
      if (c.locationId !== "market") {
        pushLog(state, c.lifeNo, "hint", `买矿石要去临渊坊市的矿行——你现在不在坊市，${tier.name}无处买。`);
      } else if (c.stones < price) {
        pushLog(state, c.lifeNo, "hint", `灵石不足：${tier.tier}阶矿石「${tier.name}」要 ${price} 灵石，你只有 ${c.stones}。`);
      } else {
        c.stones -= price;
        c.ores[tier.id] = oreCountFor(c, tier.id) + 1;
        pushLog(state, c.lifeNo, "shop", `在临渊坊市矿行购入${tier.tier}阶矿石「${tier.name}」一块，花费灵石 ${price}（现有 ${c.ores[tier.id]} 块；去修炼宗门页的锻造台可锻造${realmsFor(state.settings)[tier.artifactRealm]?.name ?? ""}门槛的法宝）。`);
      }
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  forgeArtifact: defineAction({
    description: "锻造法宝（U-464 + U-619 双门槛）：在锻造台选一阶矿石开炉——开炉前先过炼制双门槛（配置表 forge.json：炼器熟练度等级 U-482 口径 + 境界，两项同时达标，缺哪项明示哪项，未达门槛服务端直接拦截、资源分毫不动）；过门槛后先付代价（该阶矿石 1 块 + 配置灵石，失败不退），再按 Q34 副职 d60 掷一次锻造判定（属性/天赋加成与炼器淬胚同一链，骰面下限随 U-482 炼器熟练度等级）；成功按矿石品阶查表从同一法宝池（门槛境界 = 该阶）等权产出一件法宝认主（已有本命法宝则替换、旧宝灵光散尽；锻出之宝同样守 U-618 门槛，未达门槛封存、达门槛自动解封），失败则矿石报废、不扣寿元；本次锻造计入炼器熟练度（U-482 口径），耗时同副职（细时钟 craft）。",
    request: z.object({ tier: z.number().int().min(1).max(7) }),
    response: stateResponse,
    async handler(ctx, args): Promise<StateResponse> {
      const state = await loadState(ctx);
      const c = state.character;
      if (!c || c.dead) return toResponse(state);
      // 2026-11-18 自测修复：有待决事件时锻造此前静默无反馈，现明示拦截。
      // 待决守卫必须排在 c.route 早退之前——路线事件/商店正是「在路线
      // 中 + 有待决事件」的组合，守卫排在 route 早退之后等于永不触发。
      if (notePendingEventBlock(state)) { await saveState(ctx, state); return toResponse(state); }
      if (c.route) return toResponse(state);
      const tier = forgeTierByTier(args.tier);
      if (!tier) return toResponse(state);
      // U-619：炼制双门槛服务端守卫（与锻造台整形同一 forgeGateFor
      // 口径）——未达门槛在任何代价/判定之前拦截，逐项明示缺哪项，
      // 矿石与灵石分毫不动。
      const gate = forgeGateFor(state, c, tier);
      if (!gate.open) {
        pushLog(state, c.lifeNo, "hint", `炼制门槛未达：${tier.tier}阶矿石「${tier.name}」暂不能开炉——${gate.missing.join("；")}。门槛未达，矿石与灵石分毫未动。`);
        await saveState(ctx, state);
        return toResponse(state);
      }
      const wk = weekKeyOf(new Date());
      if (c.weekKey !== wk) { c.weekKey = wk; c.groupCounts = {}; }
      const realmName = realmsFor(state.settings)[tier.artifactRealm]?.name ?? "";
      // 产出候选 = 同一法宝池里门槛恰为该阶境界的法宝，排除当前
      // 正持有的那件（锻出自己已持有的宝没有意义）；候选为空只
      // 可能是该阶仅一件且正持有它——入口明示、不付任何代价。
      const candidates = forgeCandidatesFor(tier).filter((a) => a.id !== c.artifactId);
      if (candidates.length === 0) {
        pushLog(state, c.lifeNo, "hint", `锻造无从下手：${tier.tier}阶矿石能锻的法宝只有「${c.artifactName}」，正是你本命法宝在身的那件——无可再锻，换一阶矿石吧。`);
        await saveState(ctx, state);
        return toResponse(state);
      }
      if (oreCountFor(c, tier.id) < 1) {
        pushLog(state, c.lifeNo, "hint", `缺矿石：锻造${realmName}门槛的法宝要一块${tier.tier}阶矿石「${tier.name}」，你一块都没有——去临渊坊市矿行买，或探索际遇时留意拾矿。`);
        await saveState(ctx, state);
        return toResponse(state);
      }
      if (c.stones < tier.stoneCost) {
        pushLog(state, c.lifeNo, "hint", `灵石不足：这一炉要另付灵石 ${tier.stoneCost}（开炉耗材），你只有 ${c.stones}。`);
        await saveState(ctx, state);
        return toResponse(state);
      }
      // U-409：锻造同属副职动作，耗行动点 12（配置表 craft）——
      // 全部门槛与代价可付性都已核过、真正开炉之前扣点；点数
      // 不足明示原因，矿石与灵石分毫不动。
      if (!spendActionPoints(state, "craft")) { await saveState(ctx, state); return toResponse(state); }
      // 代价先付：矿石 1 块 + 灵石，成败都不退（失败 = 矿石报废，
      // 灵石是开炉耗材；不扣寿元——U-499 的走火惩罚是另一项）。
      c.ores[tier.id] = oreCountFor(c, tier.id) - 1;
      c.stones -= tier.stoneCost;
      // Q34 + U-482：锻造判定走副职 d60 同一链——属性与副职天赋加
      // 成同炼器淬胚（SKILL_CHECKS.craft.forge），难度按矿石品阶查
      // 配置表，骰面下限随炼器熟练度等级（掷骰用本次之前的等级）。
      const forgeCfg = SKILL_CHECKS.craft.forge;
      const levelBefore = craftLevelFor(c, "forge");
      const roll = rollCheck(state, c, forgeCfg.attr, tier.dc, craftBonusFor(c, "forge"), [], "normal", { system: "craft", craftLevel: levelBefore });
      const success = roll.success;
      const label = `锻造法宝 · ${tier.name}`;
      if (success) {
        const def = weighted(rngForNext(state, "forge:artifact"), uniformTable(candidates));
        // 本命法宝只有一席：已有法宝时先收回旧宝已生效的属性修正
        // （封存中的旧宝本就没落修正），再走统一赋予入口认主新宝。
        const oldName = c.artifactId ? c.artifactName : "";
        if (c.artifactId && c.artifactBonusApplied) removeArtifactBonus(c, c.artifactId);
        const sealed = grantArtifact(state, c, def);
        const gate = artifactGate(state, c);
        c.lastRoll = { label, dice: roll.dice, bonus: roll.bonus, total: roll.total, dc: roll.dc, success: true, text: `炉火纯青，${tier.name}熔铸成形——法宝「${def.name}」出炉认主！`, detail: roll.detail };
        pushLog(state, c.lifeNo, "forge_ok", `🔨 锻造法宝（判定明细：${roll.detail.text}）：${tier.tier}阶矿石「${tier.name}」熔铸成形（矿石 −1、灵石 −${tier.stoneCost}），得法宝「${def.name}」——${def.desc}${oldName ? `原先的本命法宝「${oldName}」灵光散尽、就此让位。` : ""}${sealed ? `但此宝需${gate.minRealmName}境方能认主，当前境界不足，法宝封存暂不可用，境界达到后自动解封。` : "法宝认主，属性加成即刻生效。"}`);
      } else {
        c.lastRoll = { label, dice: roll.dice, bonus: roll.bonus, total: roll.total, dc: roll.dc, success: false, text: `淬火失手，${tier.name}在炉中崩裂报废，这一炉白忙了。`, detail: roll.detail };
        pushLog(state, c.lifeNo, "forge_fail", `🔨 锻造法宝（判定明细：${roll.detail.text}）：淬火失手，${tier.tier}阶矿石「${tier.name}」在炉中崩裂报废（矿石 −1、灵石 −${tier.stoneCost} 不退；不伤寿元）。再接再厉——炼器熟练度照涨。`);
      }
      // U-482：本次锻造计入炼器熟练度（成败都算，与副职行动同一
      // 口径）；跨过破限门槛另记一条破限日志。
      const usesBefore = craftUsesFor(c, "forge");
      c.craftUses.forge = usesBefore + 1;
      const profAfter = craftProficiencyOf(c, "forge");
      const levelAfter = craftLevelFor(c, "forge");
      if (levelAfter > levelBefore) {
        const kindDef = CRAFT_SKILLS.kinds.forge;
        const bt = kindDef.breakthroughs.find((b) => b.level === levelAfter);
        pushLog(state, c.lifeNo, "craft_level", `🎓 副职破限：${kindDef.label}精进至 Lv${levelAfter}${bt ? `「${bt.label}」——${bt.desc}` : ""}（熟练度 ${profAfter}，本世已练 ${usesBefore + 1} 次；副职判定骰面下限随等级提升）`);
      }
      bumpGroupCount(c);
      // U-608：锻造耗时同副职（细时钟配置表 craft）。
      advanceActionMonths(state, "craft");
      checkDeath(state, "锻造法宝时寿元耗尽");
      // U-388/U-389：开炉锻造同为一回炼器营生，推进「副职」类委托
      // 与限时帖进度（与炼器淬胚同一口径）。
      bumpCommissions(state, "craft", c.locationId);
      bumpTimedEvents(state, "craft", c.locationId);
      // U-407：同一回锻造同样推进连环任务当前阶段的「副职」目标。
      bumpQuests(state, "craft", { locationId: c.locationId });
      // U-384：锻造结算后同样可能被经营日常随机变故打断。
      maybeTriggerDailyEvent(state);
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

};
