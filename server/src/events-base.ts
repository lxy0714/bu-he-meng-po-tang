// 轮回修仙跑团 — U-376 事件组织法：事件池「基类 + 分文件」的基础文件。
// 组织方式照 C-4《MischicatBot》（探险事件按类分文件、事件基类与公共
// 工具在 _base）：事件类型、zod schema、稀有度分档（U-375）、分桶归属
// 与合并加载全在本文件一处；事件本体按桶拆进 content/events/ 五个
// JSON 文件，新增事件只需往对应桶文件加一条，不改本文件与主流程。
//
// 分桶口径（确定性规则，由 eventBucket 计算、加载时逐条自检——条目
// 放错文件立刻抛错，不静默混池）：
//   1. 稀有度档位为「稀有」（最高选项难度 ≥110）→ rare.json（稀有）
//   2. 否则单地点事件按地点分专属桶：青云山门 sect → sect.json
//      （宗门专属）、临渊坊市 market → city.json（城市专属）、
//      其余单地点 → regional.json（地区专属）
//   3. 其余（多地点、非稀有）→ generic.json（通用）
// 当前分布：通用 40 / 稀有 7 / 地区专属 23 / 城市专属 6 / 宗门专属 4。
// 合并顺序固定为 通用 → 稀有 → 地区专属 → 城市专属 → 宗门专属，文件
// 内保持原相对顺序；合并后 EVENTS 对外接口与拆分前逐字一致（80 条，
// id/文案/选项/效果/地点/commonality 权重经金快照逐项深比对验证）。
// 红线：本项只改组织方式——事件规则、权重、触发与结算一字未动；
// 跨池引用自检（地点/NPC 存在、权重与档位一致）仍在 content.ts。
//
// U-377 二选一代价事件模板（2026-11-14，来源 A-96《月圆之夜》）：
// 在事件选项上新增可选字段 cost——「二选一且带代价」模板：选项明码
// 标价（代价用既有效果键表达，如灵石/气血/法力/修为/业力，值必须为
// 负数即扣减量），玩家选定即先结算代价、再掷骰结算成败收益（结算在
// actions-play 的 chooseOption，代价走 state.ts 的 applyEventCost
// 精确扣减、不吃天赋与衰减修正，保证扣数与配置一致）；代价付不起
// 时选项不可选并明示原因（eventCostBlockReason，待决事件构建时算好
// 随选项下发、chooseOption 再复核一次）。模板只定义选项结构，具体
// 代价数值由各事件填写；判定仍走 Q34 探索 d80，数值未动。本次仅
// 3 条示范事件按模板填代价（坊市奇遇·赌一把 灵石 50、坊市拍卖会·
// 竞拍古丹 灵石 70、瀑下炼体·入瀑炼体 气血 12——均由选项原有的负值
// 效果平移而来，成败结算总量与改前逐项相同），其余 77 条不动。
//
// U-378 见好就收事件模板（2026-11-14，来源 A-13《循环英雄 Loop
// Hero》）：在事件选项上新增可选标记 loop——「见好就收」模板：选了
// 带 loop 的选项并掷骰成功后，事件不立即结束，而是进入抉择点（每圈
// 只给一次）：继续加圈（下一圈难度与成败收益按同一比例上调，比例
// 出自下方配置表 EVENT_LOOP——每圈 ×1.5 复利）或见好就收（就此
// 结算，已得收获全部保留）。每一圈的收获在该圈成功时即落袋（走
// 既有 applyEffects 结算链），故撤退与后续圈失败都不追扣已得；某
// 一圈失败则按该圈（已放大）的失败效果结算、事件结束。进行状态
// （圈数/基准难度/累计收获）挂在待决事件上（state.ts 的
// PendingEvent.loop），抉择本身是一个 id 为「loop:<事件id>」的待决
// 事件，仍走 chooseOption 结算，客户端无需新动作。判定仍走 Q34
// 探索 d80（难度先在既有基准标尺上放大、再由 rollCheck 照旧等概率
// 换算，骰面与口径未动），触发与抽牌规则未动。本次仅 2 条示范事件
// 按模板标记（灵矿采掘·下矿采掘、灵泉枯井·下井探查——均为「越深
// 越险、收获越厚」的采掘型选项），其余 78 条不动。
//
// U-379 三选一抉择事件模板（2026-11-15，来源 B-63《洪荒，开局选择
// 神话大罗法》）：在事件上新增可选标记 trio——「三选一抉择」模板：
// 同一事件恰好给三个选项，各带取向明显不同的奖励与好感/因果后果
// （如告知 / 误导 / 沉默），玩家选定即按所选走既有结算链一次性结
// 算（chooseOption，判定仍走 Q34 探索 d80）。与轮回结算的「三选一
// 保留」（U-575）是两回事：本项只管事件内的抉择，不动轮回结算。
// 结构约束由下方 schema + 加载自检把关：trio 事件必须恰好 3 个选
// 项；三选项的「取向签名」（成功/失败各自的关系钩子 npc:kind 与
// 业力符号，见 trioOrientation）必须两两不同——取向雷同的三选一
// 只是换标签，不算抉择模板；三选项合起来必须至少带一处关系钩子
// （好感维度）与一处非零业力（因果维度）；trio 选项不得带 loop
// （loop 是成功后不结算、进抉择点的模板，与「选定即结算」互斥）。
// 本次 2 条示范事件按模板改作：山门访客整条改作告知 / 误导 / 沉默
// 三选一（访客拉住玩家问宗主下落，玩家恰知宗主闭关）；坊市扒手
// 保留原两选项结算不变、新增第三选项「对个眼神，事后分赃」（同
// 流取向：灵石 +35 / 业力 −8），与擒贼（结善缘）、示警（小善）三
// 种取向分明。其余 78 条事件未动。
//
// U-380 多解事件模板（2026-11-15，来源 A-15《死亡循环 DEATHLOOP》）：
// 在事件上新增可选标记 dual——「双解法」模板：同一事件给两种解法
// （如强攻硬闯与潜行绕过），两种解法各走一次判定、选定即按所选走
// 既有 chooseOption 一次性结算（判定仍走 Q34 探索 d80）；解法只影
// 响过程文本（okText/failText）与奖励侧重，不改变事件归属地点，
// 触发与抽牌规则未动。结构约束由下方 schema + 加载自检把关：dual
// 事件必须恰好 2 个选项；两解法都必须真掷骰（dc > 0——双解法的
// 本义就是两条路各走一次判定，自动成功的选项不算解法）；两解法
// 的结算结构相同（都带非空的成功奖励与失败后果——同为「一次判定
// 定成败」的结构，数值可不同）；两解法的「奖励侧重签名」（成功奖
// 励中正值效果的键集合，见 dualRewardFocus）必须不同——侧重雷同
// 的两条路只是换标签，不算双解法；dual 选项不得带 loop（loop 是
// 成功后不结算、进抉择点的模板，与「选定即结算」互斥），dual 与
// trio 不得并存于同一事件（一个事件只挂一种抉择模板）。本次 2 条
// 示范事件按模板标记（内容一字未动，原本就是双解法形态）：古修
// 遗府（强行破禁·战力——修为/灵石向，失败反噬伤身；参悟禁制纹
// 路·神识——修为/业力/记忆碎片向，失败只耗光阴）；遗府守灵（与
// 傀儡对招·战力——修为/灵石向，失败重伤；行古礼叩拜·机缘——修
// 为/业力向，失败只耗一年）。其余 78 条事件未动。
//
// U-383 道德分叉事件模板（2026-11-15，来源 A-6《修仙故事：轮回》）：
// 在事件上新增可选标记 moral——「道德分叉」模板：同一事件给行善
// 助人 / 偷抢夺宝两条分支——行善分支得 NPC 好感（relOk 结友好关
// 系）与因果善缘（业力为正），偷抢分支得即时物资（灵石）但记仇
// 敌（relOk/relFail 结仇）与/或因果恶缘（业力为负）；选定即按所
// 选走既有 chooseOption 一次性结算（判定仍走 Q34 探索 d80）。分
// 支只复用既有好感（关系）、因果（业力）与物资（灵石）字段——
// Q1–Q18 未定义善恶值，本模板不新增任何善恶数值。结构约束由下方
// schema + 加载自检把关：moral 事件必须恰好 2 个选项；恰好一条
// 行善分支与一条偷抢分支（由 moralBranchOf 按后果结构判定，不
// 靠标签文字）；moral 选项不得带 loop（与「选定即结算」互斥），
// moral 与 trio / dual 不得并存于同一事件（一个事件只挂一种抉
// 择模板）。本次 2 条示范事件按模板改作：雪原商队（开路护送——
// 灵石/修为向的酬谢之外补业力 +8 与金不换道友 30，行善分支；原
// 「以神识探路绕行」改作趁乱劫货——灵石 +130、业力 −12、金不
// 换结仇 35，偷抢分支）；边关时疫（协助施药熬汤本就是行善分
// 支——孙济世道友 30、业力 +12，一字未动；原「布阵隔疫」改作
// 趁疫囤药牟利——灵石 +70、业力 −12、孙济世结仇 25，偷抢分
// 支）。其余 78 条事件未动。

import { z } from "zod";
import genericJson from "./content/events/generic.json" with { type: "json" };
import rareJson from "./content/events/rare.json" with { type: "json" };
import regionalJson from "./content/events/regional.json" with { type: "json" };
import cityJson from "./content/events/city.json" with { type: "json" };
import sectJson from "./content/events/sect.json" with { type: "json" };

// ---------- 事件条目类型（与拆分前 content.ts 的接口逐字相同） ----------

export type RelKind = "partner" | "master" | "disciple" | "friend" | "enemy";
export interface Effect { cult?: number; hp?: number; mp?: number; stones?: number; karma?: number; age?: number; shard?: number }
export interface RelSpec { npc: string; kind: RelKind; bond: number }
export interface EventOptionDef {
  label: string; hint: string; attr: "might" | "sense" | "fortune" | "body"; dc: number;
  okText: string; ok: Effect; failText: string; fail: Effect;
  relOk?: RelSpec; relFail?: RelSpec;
  // U-377 代价模板（见文件头）：选定即付的明码标价，可选；只允许
  // hp/mp/stones/cult/karma 五键且值必须为负（扣减量），合法性由下方
  // schema + 加载自检双重把关，非法结构（正值、空对象、shard/age
  // 等不可支付的键）在内容加载时即抛错。
  cost?: Effect;
  // U-378 见好就收模板（见文件头）：标记者为「可加圈」选项——掷骰
  // 成功后不直接结束事件，而是给一次抉择：继续加圈（下一圈难度与
  // 收益按 EVENT_LOOP 配置同比例上调）或见好就收（按已累计收获
  // 结算收手）。结构约束（必须真掷骰 dc>0、不得带关系钩子、成败
  // 效果不得带 shard）由下方 schema + 加载自检把关。
  loop?: boolean;
}

// ---------- U-377 代价模板：付费判定与文案 ----------

// 代价可从这五项里付：气血（付后至少留 1 点，代价不能把人付死）、
// 法力、灵石、修为、业力（业力可为负，故按「现有 ≥ 需付」判定）。
export interface CostPayer { hp: number; mp: number; stones: number; cultivation: number; karma: number }
export const COST_KEY_LABEL: Record<string, string> = { stones: "灵石", hp: "气血", mp: "法力", cult: "修为", karma: "业力" };
/** 代价的展示文案，如「灵石 −50 · 气血 −12」（值为负，− 即扣减）。 */
export function formatEventCost(cost: Effect): string {
  const parts: string[] = [];
  for (const k of ["stones", "hp", "mp", "cult", "karma"] as const) {
    const v = cost[k];
    if (v) parts.push(`${COST_KEY_LABEL[k]} ${v}`);
  }
  return parts.join(" · ");
}
/** 付不起时返回明示原因（客户端禁用选项并展示），付得起返回 null。 */
export function eventCostBlockReason(payer: CostPayer, cost: Effect): string | null {
  if (cost.stones && payer.stones < -cost.stones) return `灵石不足：此选项需先付灵石 ${-cost.stones}，你现有 ${payer.stones}`;
  if (cost.hp && payer.hp + cost.hp < 1) return `气血不足：此选项需先耗气血 ${-cost.hp}（付后至少留 1 点），你现有 ${payer.hp}`;
  if (cost.mp && payer.mp < -cost.mp) return `法力不足：此选项需先耗法力 ${-cost.mp}，你现有 ${payer.mp}`;
  if (cost.cult && payer.cultivation < -cost.cult) return `修为不足：此选项需先耗修为 ${-cost.cult}，你现有 ${payer.cultivation}`;
  if (cost.karma && payer.karma < -cost.karma) return `业力不足：此选项需先耗业力 ${-cost.karma}，你现有 ${payer.karma}`;
  return null;
}

// ---------- U-378 见好就收模板：加圈比例配置与缩放 ----------

// 加圈比例配置表：难度与收益的同比例上调幅度只在本表一处维护——
// 每多探一圈，下一圈的难度与成败效果量级同乘 (1 + scalePct/100)，
// 按圈数复利（第 n 圈倍率 = (1+scalePct/100)^(n−1)，第 1 圈恒为原
// 数值）。判定仍走 Q34 探索 d80：难度先在既有基准标尺上按倍率
// 放大，再由 rollCheck 照旧等概率换算到骰面，骰面与口径未动。
export const EVENT_LOOP = { scalePct: 50 } as const;
/** 第 round 圈（从 1 起）的难度/收益倍率；第 1 圈恒为 1（原数值）。 */
export function loopMultiplier(round: number): number {
  return Math.pow(1 + EVENT_LOOP.scalePct / 100, Math.max(0, round - 1));
}
/** 第 round 圈的结算难度：基准难度按倍率放大（取整）；第 1 圈原值。 */
export function loopDcFor(baseDc: number, round: number): number {
  if (round <= 1) return baseDc;
  return Math.round(baseDc * loopMultiplier(round));
}
/** 第 round 圈的成败效果：每个数值按倍率同比例放大（按量级取整，
 * 正负同规则，风险与收益同涨）；第 1 圈返回原对象不变。 */
export function scaleEffectForLoop(eff: Effect, round: number): Effect {
  if (round <= 1) return eff;
  const m = loopMultiplier(round);
  const out: Effect = {};
  for (const k of ["cult", "hp", "mp", "stones", "karma", "age", "shard"] as const) {
    const v = eff[k];
    if (v) out[k] = Math.sign(v) * Math.round(Math.abs(v) * m);
  }
  return out;
}
/** 累计收获的展示文案，如「灵石 +70 · 修为 +15」（只列非零项）。 */
export function formatEffectGains(gains: Effect): string {
  const parts: string[] = [];
  for (const k of ["stones", "cult", "hp", "mp", "karma"] as const) {
    const v = gains[k];
    if (v) parts.push(`${COST_KEY_LABEL[k]} ${v > 0 ? `+${v}` : v}`);
  }
  // U-390：记忆碎片（前世线索）也是可兑付的收获——日常委托的地府
  // 奖励即以碎片计，此前不渲染 shard 会让奖励文案缺项。既有调用点
  // 的奖励/收获均不含 shard（loop 收获按资源差值实测、五键之外不
  // 记），此行对它们无影响。
  if (gains.shard) parts.push(`前世线索（记忆碎片） +${gains.shard}`);
  return parts.join(" · ");
}
export interface EventDef {
  id: string; title: string; desc: string; art: string; locations: string[];
  // U-375 补做（2026-11-14 定夺）：稀有度权重 commonality，走 U-575
  // weighted() 口径——牌堆建堆时按权重不放回抽取（state.ts 的
  // shuffledEventDeck），常见高、不常见中、稀有低；分档标准与档位
  // 权重见下方 EVENT_RARITY，加载自检逐条核对，缺失/错档即抛错。
  commonality: number;
  // U-379 三选一抉择模板（见文件头）：标记者为「三选一抉择」事件——
  // 恰好 3 个选项、三取向签名两两不同、好感与因果维度齐备、选定即
  // 结算；结构合法性由下方 schema + 加载自检把关。未标记的事件即
  // 使恰好有 3 个选项（如坊市奇遇、妖兽拦路）也只是普通多选项事
  // 件，不受本模板约束。
  trio?: boolean;
  // U-380 多解事件模板（见文件头）：标记者为「双解法」事件——恰
  // 好 2 个选项、两解法各走一次判定、结算结构相同而奖励侧重签名
  // 不同、选定即结算；结构合法性由下方 schema + 加载自检把关。
  // 未标记的事件即使恰好有 2 个选项（绝大多数事件都是）也只是普
  // 通双选项事件，不受本模板约束。
  dual?: boolean;
  // U-383 道德分叉事件模板（见文件头）：标记者为「道德分叉」事
  // 件——恰好 2 个选项，一条行善分支（好感 + 善缘）与一条偷抢分
  // 支（物资 + 恶缘/仇敌），选定即结算；分支只复用好感/因果/物
  // 资字段，不新增善恶数值；结构合法性由下方 schema + 加载自检
  // 把关。未标记的事件即使恰好有善恶两面的选项也只是普通事件，
  // 不受本模板约束。
  moral?: boolean;
  options: EventOptionDef[];
}

// ---------- U-379 三选一抉择模板：取向签名 ----------

/** 选项的「取向签名」：它在好感/因果两轴上留下的印记——成功与失败
 * 各自的关系钩子（npc:关系种类，无则空）与业力符号（正/负/零）。
 * 三选一抉择要求三选项签名两两不同，保证三种取向（如告知结缘、
 * 误导结仇、沉默两不沾）在后果层面真的分明，而非只换标签。 */
export function trioOrientation(opt: EventOptionDef): string {
  const rel = (r?: RelSpec) => (r ? `${r.npc}:${r.kind}` : "");
  const sgn = (v?: number) => (v ? (v > 0 ? "+" : "-") : "0");
  return [rel(opt.relOk), rel(opt.relFail), sgn(opt.ok.karma), sgn(opt.fail.karma)].join("|");
}

// ---------- U-380 多解事件模板：奖励侧重签名 ----------

/** 解法的「奖励侧重签名」：成功奖励里正值效果的键集合（排序后拼
 * 接）——它标示这条解法把收获押在哪几样东西上（如强攻押修为+灵
 * 石、巧解押修为+业力+碎片）。双解法要求两解法签名不同：侧重真
 * 的分道扬镳才算两条路，只改数值大小不算换侧重。 */
export function dualRewardFocus(opt: EventOptionDef): string {
  const keys: string[] = [];
  for (const k of ["cult", "hp", "mp", "stones", "karma", "age", "shard"] as const) {
    const v = opt.ok[k];
    if (v && v > 0) keys.push(k);
  }
  return keys.join("+");
}

// ---------- U-383 道德分叉模板：分支归属 ----------

/** 选项的「道德分支」归属（按后果结构判定，不看标签文字）：行善
 * 分支 = 成功与 NPC 结友好关系（relOk 为道友/道侣/师父/徒弟）
 * 且成败至少一侧业力为正（因果善缘）；偷抢分支 = 成功得即时物
 * 资（灵石为正）且留下恶缘——业力为负（成败任一侧）或结仇敌
 * （relOk/relFail 为 enemy）。两者都不合返回 null。道德分叉要
 * 求两条分支一善一夺、后果取向分明：只给灵石不留恶缘的是正经
 * 交易，只结善缘不给物资的是普通善举，都不算分叉的一侧。 */
export function moralBranchOf(opt: EventOptionDef): "kind" | "greed" | null {
  const rel = opt.relOk;
  if (rel && rel.kind !== "enemy" && ((opt.ok.karma ?? 0) > 0 || (opt.fail.karma ?? 0) > 0)) return "kind";
  const grabsGoods = (opt.ok.stones ?? 0) > 0;
  const leavesGrudge = (opt.ok.karma ?? 0) < 0 || (opt.fail.karma ?? 0) < 0
    || opt.relOk?.kind === "enemy" || opt.relFail?.kind === "enemy";
  if (grabsGoods && leavesGrudge) return "greed";
  return null;
}

// U-375 补做：事件稀有度分档——按事件最高选项难度（与 checks.ts
// FATE_TIER 同一把尺子：最高难度编码品阶）分三档：<100 常见、
// 100–109 不常见、≥110 稀有。U-375 新增的 40 条按此尺正好是常见
// 24 / 不常见 12 / 稀有 4；全池 80 条为 52 / 21 / 7。权重数值只在
// 本表一处维护，各分文件每条的 commonality 必须与所在档位一致
// （content.ts 跨池自检逐条核对）。
export const EVENT_RARITY = {
  weights: { common: 10, uncommon: 4, rare: 1 },
  uncommonMinDc: 100,
  rareMinDc: 110,
} as const;
export function eventRarityTier(ev: EventDef): "common" | "uncommon" | "rare" {
  const maxDc = Math.max(0, ...ev.options.map((o) => o.dc));
  return maxDc >= EVENT_RARITY.rareMinDc ? "rare" : maxDc >= EVENT_RARITY.uncommonMinDc ? "uncommon" : "common";
}

// ---------- 分桶归属（U-376 组织口径，见文件头） ----------

export type EventBucket = "generic" | "rare" | "regional" | "city" | "sect";
export function eventBucket(ev: EventDef): EventBucket {
  if (eventRarityTier(ev) === "rare") return "rare";
  if (ev.locations.length === 1) {
    const loc = ev.locations[0];
    if (loc === "sect") return "sect";
    if (loc === "market") return "city";
    return "regional";
  }
  return "generic";
}

// ---------- schema 校验（zod；非法即抛错，带文件名与路径） ----------

const num = z.number().finite();
const str = z.string().min(1);
const attrEnum = z.enum(["might", "sense", "fortune", "body"]);
const relKindEnum = z.enum(["partner", "master", "disciple", "friend", "enemy"]);

const effectSchema = z.strictObject({
  cult: num.optional(), hp: num.optional(), mp: num.optional(), stones: num.optional(),
  karma: num.optional(), age: num.optional(), shard: num.optional(),
});
const relSpecSchema = z.strictObject({ npc: str, kind: relKindEnum, bond: num });
// U-377 代价结构：strictObject 先把键收窄到可支付的五项（shard/age
// 等不可支付的键直接判非法），值的符号与非空由加载后自检把关。
const costSchema = z.strictObject({
  cult: num.optional(), hp: num.optional(), mp: num.optional(), stones: num.optional(), karma: num.optional(),
});
const eventOptionSchema = z.strictObject({
  label: str, hint: str, attr: attrEnum, dc: num,
  okText: z.string(), ok: effectSchema, failText: z.string(), fail: effectSchema,
  relOk: relSpecSchema.optional(), relFail: relSpecSchema.optional(),
  cost: costSchema.optional(),
  // U-378 见好就收模板：只接受字面 true（写 false 或其他值即非法，
  // 模板标记没有「关」的写法，要取消就删字段）；结构约束由加载后
  // 自检把关（见 loadEventFile）。
  loop: z.literal(true).optional(),
});
const eventSchema = z.strictObject({
  id: str, title: str, desc: str, art: str, locations: z.array(str).min(1),
  // U-375 补做：commonality 为必填——缺失权重的事件在加载时即被拦下
  // （strictObject + 必填字段），不会静默按等权混进牌堆。
  commonality: num,
  // U-379 三选一抉择模板：只接受字面 true（写 false 或其他值即非
  // 法，要取消就删字段）；三选项与取向约束由加载后自检把关。
  trio: z.literal(true).optional(),
  // U-380 多解事件模板：只接受字面 true（同 trio 口径）；双解法
  // 的结构约束由加载后自检把关。
  dual: z.literal(true).optional(),
  // U-383 道德分叉模板：只接受字面 true（同 trio 口径）；两分支
  // 的取向约束由加载后自检把关。
  moral: z.literal(true).optional(),
  options: z.array(eventOptionSchema).min(1),
});

function loadEventFile(bucket: EventBucket, raw: unknown): EventDef[] {
  const name = `events/${bucket}.json`;
  const r = z.array(eventSchema).safeParse(raw);
  if (!r.success) {
    const first = r.error.issues[0];
    const where = first ? `${first.path.join(".") || "(root)"}: ${first.message}` : "unknown";
    throw new Error(`content: invalid config ${name}: ${where}`);
  }
  // 校验通过后返回原始解析值（不返回 zod 重组的对象）：字段顺序与值
  // 与配置文件逐字一致，校验只把关、不改形。
  const events = raw as EventDef[];
  // 分桶归属自检：每条必须属于本文件对应的桶——放错文件的条目（比如
  // 稀有事件误入通用文件）在加载时即抛错，组织口径不靠人工自觉。
  for (const ev of events) {
    const actual = eventBucket(ev);
    if (actual !== bucket) {
      throw new Error(`content: event ${ev.id} is in events/${bucket}.json but belongs to bucket ${actual} (events/${actual}.json)`);
    }
    // U-377 代价结构自检：cost 必须非空（至少标一项价）且每项为负数
    // （代价是选定即付的扣减，正值/零值都是把收益伪装成代价，拦下）。
    for (const opt of ev.options) {
      if (opt.cost === undefined) continue;
      const entries = Object.entries(opt.cost).filter(([, v]) => v !== undefined);
      if (entries.length === 0) {
        throw new Error(`content: event ${ev.id} option "${opt.label}" has an empty cost (a priced option must name at least one price)`);
      }
      for (const [k, v] of entries) {
        if (typeof v !== "number" || !(v < 0)) {
          throw new Error(`content: event ${ev.id} option "${opt.label}" cost.${k} must be negative (paid upfront), got ${v}`);
        }
      }
    }
    // U-378 见好就收结构自检：loop 选项必须真掷骰（dc > 0——自动
    // 成功的选项能无限加圈刷收益）、不得带关系钩子（关系按事件一
    // 次性结算，不随圈重复结）、成败效果不得带 shard（主线碎片是
    // 跨世进度，不作加圈筹码缩放）。任一违反在加载时即抛错。
    for (const opt of ev.options) {
      if (!opt.loop) continue;
      if (!(opt.dc > 0)) {
        throw new Error(`content: event ${ev.id} option "${opt.label}" is a loop option but has dc ${opt.dc} (loop options must require a roll)`);
      }
      if (opt.relOk || opt.relFail) {
        throw new Error(`content: event ${ev.id} option "${opt.label}" is a loop option but carries a relation hook (relations settle once per event, not per round)`);
      }
      if (opt.ok.shard || opt.fail.shard) {
        throw new Error(`content: event ${ev.id} option "${opt.label}" is a loop option but carries shard effects (mainline shards are not loop stakes)`);
      }
    }
    // U-379 三选一抉择结构自检：trio 事件必须恰好 3 个选项；三选项
    // 不得带 loop（与「选定即结算」互斥）；取向签名两两不同；且三
    // 选项合起来至少带一处关系钩子（好感维度）与一处非零业力（因
    // 果维度）——缺任一项都只是普通多选项事件，不许冒充抉择模板。
    if (ev.trio) {
      if (ev.options.length !== 3) {
        throw new Error(`content: event ${ev.id} is marked trio but has ${ev.options.length} options (a trio event must have exactly 3)`);
      }
      for (const opt of ev.options) {
        if (opt.loop) {
          throw new Error(`content: event ${ev.id} option "${opt.label}" is in a trio event but carries loop (trio settles on selection; loop defers settlement)`);
        }
      }
      const sigs = ev.options.map(trioOrientation);
      if (new Set(sigs).size !== sigs.length) {
        throw new Error(`content: event ${ev.id} is marked trio but its options do not have pairwise-distinct orientations (${sigs.join(" ; ")})`);
      }
      const hasRel = ev.options.some((o) => o.relOk || o.relFail);
      const hasKarma = ev.options.some((o) => o.ok.karma || o.fail.karma);
      if (!hasRel || !hasKarma) {
        throw new Error(`content: event ${ev.id} is marked trio but lacks ${!hasRel ? "a relation hook (favor axis)" : "a nonzero karma effect (karma axis)"} across its three options`);
      }
    }
    // U-380 多解事件结构自检：dual 事件必须恰好 2 个选项；不得与
    // trio 并存（一个事件只挂一种抉择模板）；两解法都必须真掷骰
    // （dc > 0，各走一次判定）；两解法不得带 loop（与「选定即结
    // 算」互斥）；两解法的结算结构必须相同——都带非空的成功奖励
    // 与失败后果（同为一次判定定成败的结构，数值可不同）；两解
    // 法的奖励侧重签名必须不同（侧重雷同只是换标签）。任一违反
    // 在加载时即抛错。
    if (ev.dual) {
      if (ev.trio) {
        throw new Error(`content: event ${ev.id} is marked both dual and trio (an event carries at most one choice template)`);
      }
      if (ev.options.length !== 2) {
        throw new Error(`content: event ${ev.id} is marked dual but has ${ev.options.length} options (a dual-solution event must have exactly 2)`);
      }
      for (const opt of ev.options) {
        if (!(opt.dc > 0)) {
          throw new Error(`content: event ${ev.id} option "${opt.label}" is a dual solution but has dc ${opt.dc} (each solution must walk its own roll)`);
        }
        if (opt.loop) {
          throw new Error(`content: event ${ev.id} option "${opt.label}" is a dual solution but carries loop (dual settles on selection; loop defers settlement)`);
        }
        const okKeys = Object.values(opt.ok).filter((v) => v !== undefined && v !== 0);
        const failKeys = Object.values(opt.fail).filter((v) => v !== undefined && v !== 0);
        if (okKeys.length === 0 || failKeys.length === 0) {
          throw new Error(`content: event ${ev.id} option "${opt.label}" is a dual solution but has an empty ${okKeys.length === 0 ? "success reward" : "failure consequence"} (both solutions share the same settle structure: a reward on success, a consequence on failure)`);
        }
      }
      const [a, b] = ev.options;
      if (a && b && dualRewardFocus(a) === dualRewardFocus(b)) {
        throw new Error(`content: event ${ev.id} is marked dual but both solutions lean on the same reward focus (${dualRewardFocus(a)}) — two paths that only relabel the same emphasis are not dual solutions`);
      }
    }
    // U-383 道德分叉结构自检：moral 事件必须恰好 2 个选项；不得与
    // trio / dual 并存（一个事件只挂一种抉择模板）；两分支不得带
    // loop（与「选定即结算」互斥）；两分支的道德归属（moralBranchOf
    // 按后果结构判定）必须恰好一条行善（好感 + 善缘）与一条偷抢
    // （物资 + 恶缘/仇敌）——取向分明才算分叉，只换标签或一侧缺
    // 轴（行善无好感、偷抢无恶缘）在加载时即抛错。
    if (ev.moral) {
      if (ev.trio || ev.dual) {
        throw new Error(`content: event ${ev.id} is marked moral together with ${ev.trio ? "trio" : "dual"} (an event carries at most one choice template)`);
      }
      if (ev.options.length !== 2) {
        throw new Error(`content: event ${ev.id} is marked moral but has ${ev.options.length} options (a moral-fork event must have exactly 2: one kind branch, one greed branch)`);
      }
      for (const opt of ev.options) {
        if (opt.loop) {
          throw new Error(`content: event ${ev.id} option "${opt.label}" is in a moral event but carries loop (moral settles on selection; loop defers settlement)`);
        }
      }
      const branches = ev.options.map(moralBranchOf);
      const kindCount = branches.filter((b) => b === "kind").length;
      const greedCount = branches.filter((b) => b === "greed").length;
      if (kindCount !== 1 || greedCount !== 1) {
        throw new Error(`content: event ${ev.id} is marked moral but its branches resolve to [${branches.join(", ")}] (a moral fork needs exactly one kind branch — friendly relation plus positive karma — and one greed branch — goods plus negative karma or an enemy relation)`);
      }
    }
  }
  return events;
}

// ---------- 合并加载（顺序固定，见文件头） ----------

export const EVENTS: EventDef[] = [
  ...loadEventFile("generic", genericJson),
  ...loadEventFile("rare", rareJson),
  ...loadEventFile("regional", regionalJson),
  ...loadEventFile("city", cityJson),
  ...loadEventFile("sect", sectJson),
];
