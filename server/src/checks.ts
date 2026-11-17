// 轮回修仙跑团 — U-563 检定配置表：境界加成、命格修正、法宝修正一处
// 维护，难度阈值 + 每级技能加分（extraPointsPerLevel）+ Q34 分系统
// 骰面表（DICE_SYSTEMS，各系统基础骰面与动态上下限公式、难度等概率
// 重标），判定公式一处维护。
// 来源：C-10《liana-p/narrat-engine》的技能检定系统——skills.yaml 声明
// 技能、skillchecks.yaml 声明检定、判定逻辑集中在 skillchecks.ts。
// 本模块按同一分工在本地实现（不设为生产依赖、未 npm 安装）：
// - 「技能声明」：天赋给检定的加分表（属性天赋 / 副职天赋 / 情境天赋）、
//   法宝修正表、命格表（DESTINIES，修正字段即声明）——加分多少、给谁，
//   只在这里声明。
// - 「检定声明」：SKILL_CHECKS（固定难度的具名检定：副职四项、宗门差事、
//   广交道友、和解）与各公式检定的参数（突破 / 斗法 / 决斗 / 寻仇 / 突破
//   门槛 / 记忆保留）——难度阈值与境界加成系数只在这里声明。
// - 「判定逻辑」：本文件下半部分的纯函数（breakthroughDcFor 等）与
//   state.ts 的 rollCheck（掷骰走 U-568 表达式、过 U-569 modifier 链、
//   返回 U-570 结构化明细）；公式只在这里实现，actions 只查表调用。
// 事件选项的难度声明在 events.ts 的事件表里（那是内容数据表，与本表
// 分工：内容表声明单个选项的 dc，本表声明系统级检定的公式与阈值），
// 两处都只经 rollCheck 一条判定公式结算。
// 红线（U-563 当时）：本项只统一写法与配置位置——所有数值与改前
// 逐字一致，同种子重放结果不变；Q1–Q18 与存档结构未动。配置非法
// （骰面范围坏、难度非整数、命格 id 重复等）一律抛错不静默兜底
// （assertCheckConfig 在模块加载时自检，错误经动作层记入服务端
// 报错记录）。
// Q34 增补（2026-11-14）：骰面改由 DICE_SYSTEMS 分系统声明（见下），
// CHECK_CONFIG.doubleRoll 登记双掷记号（L 优势 / H 劣势），
// checkExpressionFor(mode, range) 按系统骰面 + 动态范围拼表达式
// （如斗法 2d20[5~30]L）；双掷的触发条件不在此表声明。

export type AttrKey = "might" | "sense" | "fortune" | "body";

// ---------- 总配置：每级技能加分 + 双掷记号 ----------
export const CHECK_CONFIG = {
  // 每级技能加分：天赋（技能）每点给检定的固定加分与承世玉每层加分。
  extraPointsPerLevel: {
    attrTalent: 6,   // 属性天赋（剑骨天成等）每个给对应属性检定 +6
    craftTalent: 12, // 副职天赋（丹道天才等）每个给对应副职检定 +12
    jadeLayer: 2,    // 承世玉每层给一切检定 +2（跨世叠加）
  },
  // U-572 双掷记号：优势 = 掷 doubleRoll.diceCount 颗同面骰、后缀 L
  // （舍弃低的、取高的，如斗法 2d20[5~30]L）；劣势 = 后缀 H（舍弃高
  // 的、取低的）。只登记记号与掷数：触发条件不在此表，由各系统规则定。
  doubleRoll: { diceCount: 2, advantageSuffix: "L", disadvantageSuffix: "H" },
} as const;

// ---------- Q34 分系统骰面（2026-11-14 新定夺，取代 Q8 全游戏 d150） ----------
// 背景：d150 一掷跨度 1–150、标准差约 43，全部修正加起来仍小于骰子
// 随机波动，养成感被骰子吃掉。Q34 改为：每个系统固定一个基础骰面，
// 七个系统各不相同；每次掷骰的实际范围 [下限, 上限] 由该系统相关
// 属性现算（不写死、不进存档）——下限是保底（强者掷不出太烂的），
// 上限是天花板（实力/机缘越强，运气上限越高）。
// 防重复计算：撑起骰面范围的那个属性不再同时进固定修正（absorbed），
// 固定修正只留情境加成（承世玉、副职/事件天赋、突破保底、师父等）。
// 难度重标：各检定的难度仍按 d150 时代的「基准标尺」声明（下方各
// dc 公式与事件表 dc 不变），掷骰时由 rescaleDc 按等概率换算到新
// 骰面——同境界同属性下成功率与 d150 时代一致（误差 ≤ 1 个骰点），
// 且属性/境界涨时骰面与换算难度同步涨，挑战保持相对性，不会一路
// 碾压（用户 2026-11-14 补充条件）。胜势差供斗法奖惩公式使用时经
// scaleMargin 归一化回基准标尺，奖惩数值结构不变。
export type CheckSystem = "combat" | "breakthrough" | "explore" | "craft" | "social" | "sect";
export const SYSTEM_LABEL: Record<CheckSystem, string> = {
  combat: "斗法", breakthrough: "突破", explore: "探索", craft: "副职", social: "社交", sect: "宗门差事",
};
// 各系统骰面系数（Q34 草稿系数，验算后定稿于此）：
// - combat 斗法/决斗/复仇 d20：下限 1+检定属性/5，上限 20+检定属性/2
//   （战力 20 → 掷 5~30，与 Q34 定夺示例逐字一致）；
// - breakthrough 突破 d100：下限 1+境界×2，上限 100+机缘；
// - explore 探索 d80：下限 1+机缘/5，上限 80+机缘/2；
// - craft 副职 d60：下限 1+副职等级×3（副职等级 = U-482 熟练度
//   等级，1–4 档，由该门副职使用次数查配置表 craft-skills.json
//   派生；U-482 前以天赋有无 1/0 作代理，现已取代，系数与骰面不
//   变），上限 60+神识/2；
// - social 社交 d40：下限 1+好感/10（无既有关系时好感按 0），上限
//   40+机缘/2；
// - sect 宗门差事 d50：下限 1+宗门位阶×2（位阶序号，外门 = 0），
//   上限 50+体魄/2。
export const DICE_SYSTEMS = {
  combat: { base: 20, loBase: 1, loPerAttr: 1 / 5, hiPerAttr: 1 / 2 },
  breakthrough: { base: 100, loBase: 1, loPerRealm: 2, hiPerFortune: 1 },
  explore: { base: 80, loBase: 1, loPerFortune: 1 / 5, hiPerFortune: 1 / 2 },
  craft: { base: 60, loBase: 1, loPerLevel: 3, hiPerSense: 1 / 2 },
  social: { base: 40, loBase: 1, loPerBond: 1 / 10, hiPerFortune: 1 / 2 },
  sect: { base: 50, loBase: 1, loPerRank: 2, hiPerBody: 1 / 2 },
} as const;

export interface DiceRangeContext {
  attr: string;        // 本次检定的属性键（might/sense/fortune/body）
  attrValue: number;   // 本次检定属性值（含对应天赋加成）
  fortune: number;     // 机缘（含天赋）
  sense: number;       // 神识（含天赋）
  realmIdx: number;    // 玩家境界序号
  sectRankIdx: number; // 宗门位阶序号（未入门/外门 = 0）
  bond: number;        // 社交好感（仇敌为仇怨；无关系 = 0）
  craftLevel: number;  // 副职等级（U-482 熟练度等级 1–4，见 diceRangeFor 的 craft 分支）
}
export interface DiceRange { lo: number; hi: number; base: number; absorbed: boolean }

// 本次掷骰的动态范围：[lo, hi] 现算，不进存档。absorbed = 本次检定
// 属性已被骰面范围吸收（不再进固定修正，防重复计算）。
export function diceRangeFor(system: CheckSystem, ctx: DiceRangeContext): DiceRange {
  switch (system) {
    case "combat": {
      const s = DICE_SYSTEMS.combat;
      return { base: s.base, lo: s.loBase + Math.floor(ctx.attrValue * s.loPerAttr), hi: s.base + Math.floor(ctx.attrValue * s.hiPerAttr), absorbed: true };
    }
    case "breakthrough": {
      const s = DICE_SYSTEMS.breakthrough;
      return { base: s.base, lo: s.loBase + ctx.realmIdx * s.loPerRealm, hi: s.base + Math.floor(ctx.fortune * s.hiPerFortune), absorbed: false };
    }
    case "explore": {
      const s = DICE_SYSTEMS.explore;
      return { base: s.base, lo: s.loBase + Math.floor(ctx.fortune * s.loPerFortune), hi: s.base + Math.floor(ctx.fortune * s.hiPerFortune), absorbed: ctx.attr === "fortune" };
    }
    case "craft": {
      const s = DICE_SYSTEMS.craft;
      return { base: s.base, lo: s.loBase + ctx.craftLevel * s.loPerLevel, hi: s.base + Math.floor(ctx.sense * s.hiPerSense), absorbed: ctx.attr === "sense" };
    }
    case "social": {
      const s = DICE_SYSTEMS.social;
      return { base: s.base, lo: s.loBase + Math.floor(ctx.bond * s.loPerBond), hi: s.base + Math.floor(ctx.fortune * s.hiPerFortune), absorbed: ctx.attr === "fortune" };
    }
    case "sect": {
      const s = DICE_SYSTEMS.sect;
      return { base: s.base, lo: s.loBase + Math.max(0, ctx.sectRankIdx) * s.loPerRank, hi: s.base + Math.floor(ctx.attrValue * s.hiPerBody), absorbed: ctx.attr === "body" };
    }
  }
}

// 基准标尺（d150 时代）下的成功概率：U[1,150] + bonus ≥ dc。
export const BASELINE_SIDES = 150;
export function successProbBaseline(dc: number, bonus: number): number {
  if (dc <= 0) return 1;
  const need = dc - bonus;
  return Math.min(1, Math.max(0, (BASELINE_SIDES + 1 - need) / BASELINE_SIDES));
}

// 难度重标（等概率换算）：给定基准难度与基准修正、以及新骰面的范围
// 与新修正，算出新难度，使 U[lo,hi] + bonusNew ≥ 新难度 的概率与
// 基准标尺下一致（取整到最近的骰点数）。基准难度 ≤ 0 时原样返回
// （自动成功语义不变）。
export function rescaleDc(dcBaseline: number, bonusBaseline: number, bonusNew: number, lo: number, hi: number): number {
  if (dcBaseline <= 0) return dcBaseline;
  const w = hi - lo + 1;
  const keep = Math.round(successProbBaseline(dcBaseline, bonusBaseline) * w);
  const needNew = hi - keep + 1;
  return needNew + bonusNew;
}

// 胜势差归一化：把新骰面下的胜势差按宽度比换算回基准标尺，供斗法
// 等按胜势差浮动的奖惩公式沿用原数值结构。
export function scaleMargin(margin: number, lo: number, hi: number): number {
  return Math.round((margin * BASELINE_SIDES) / (hi - lo + 1));
}

// 判定表达式（U-568 文法，Q34 记号）：「1d20[5~30]+修正」——基础骰面
// d20、本次动态范围 [5, 30]；双掷按各系统骰面适配（U-572）：优势
// 「2d20[5~30]L+修正」、劣势「2d20[5~30]H+修正」。
export function checkExpressionFor(mode: "normal" | "advantage" | "disadvantage", range: { lo: number; hi: number; base: number }): string {
  const core = `d${range.base}[${range.lo}~${range.hi}]`;
  if (mode === "normal") return `1${core}+修正`;
  if (mode === "advantage") return `${CHECK_CONFIG.doubleRoll.diceCount}${core}${CHECK_CONFIG.doubleRoll.advantageSuffix}+修正`;
  if (mode === "disadvantage") return `${CHECK_CONFIG.doubleRoll.diceCount}${core}${CHECK_CONFIG.doubleRoll.disadvantageSuffix}+修正`;
  throw new Error(`checks: invalid roll mode "${String(mode)}"`);
}

// ---------- 社交境界差（Q34 补充口径，2026-11-14） ----------
// 社交难度按双方境界差动态算：NPC 境界高于玩家越多越难，低于越多
// 越易（渡劫期结识练气期很容易，练气期攀附渡劫期难上加难）。每差
// 一境，基准难度 ±8。作用于社交系统的检定（广交道友、和解）与决斗
// （决斗难度改按对方境界计，见 DUEL_CHECK 调用处）。
export const SOCIAL_REALM_DIFF = { dcPerRealm: 8 } as const;
export function socialDcFor(baseDc: number, playerRealmIdx: number, npcRealmIdx: number): number {
  return baseDc + (npcRealmIdx - playerRealmIdx) * SOCIAL_REALM_DIFF.dcPerRealm;
}

// ---------- 相对差距原则（Q34 通用口径，2026-11-14 澄清） ----------
// 社交与探索机缘两条只是打比方：相对差距是通用原则——每个系统的
// 判定难度都按「玩家相关能力 vs 目标档位」的相对差距算。统一实现：
// 基准难度 = 目标档位，玩家能力进基准修正与骰面范围，rescaleDc 的
// 等概率换算只取决于（基准难度 − 基准修正）这个差距，成功率天然
// 只随相对差距变。各系统的目标档位来源（有数据支撑处另加显式
// 差距项，系数都在本表）：
// - 斗法/决斗/复仇：敌手境界（combatDcFor 的 tier×18、决斗改按对方
//   境界×12）vs 玩家战力（骰面范围 + 基准修正）；
// - 突破：境界门槛（118 + 境界×6，门槛随境界涨）vs 玩家神识/业力；
// - 社交：NPC 境界（SOCIAL_REALM_DIFF 每境 ±8）vs 玩家境界 + 机缘；
// - 探索/采集：机缘/草药品阶（FATE_TIER 以事件最高难度编码品阶，
//   气运牵引高品阶机缘）vs 玩家境界，机缘部分抵消境界差难度；
// - 副职：丹药/法器品阶由各副职基准难度编码（炼器 95 > 炼丹 92 >
//   垂钓 88 > 灵田 80，品阶差即难度差）vs 副职等级（骰面下限）+
//   对应属性；未另加差距项，避免与副职天赋 +12 重复计算；
// - 宗门差事：差事要求（基准难度 84）vs 宗门位阶（骰面下限）+ 体魄。
export const RELATIVE_GAP = {
  combatDcPerEnemyTier: 18,   // 与 COMBAT_CHECK.dcPerTier 同值，备查
  breakthroughDcPerRealm: 6,  // 与 BREAKTHROUGH_CHECK.dcPerRealm 同值
  socialDcPerRealmDiff: 8,    // 与 SOCIAL_REALM_DIFF.dcPerRealm 同值
  craftTier: { farm: 0, fish: 1, alchemy: 2, forge: 3 }, // 品阶（难度编码）
} as const;

// ---------- 探索机缘档位（Q34 补充口径，2026-11-14） ----------
// 机缘影响遇到高阶机缘的档位：气运高时，低境界也可能碰见高境界的
// 机缘（抽牌偏置在 state.ts 的 drawEventFromDeck）；已遭遇的机缘若
// 档位高出玩家当前境界，难度按境界差上调，但机缘可部分抵消上调。
// 档位以事件最高选项基准难度与「与境界相称的难度基准」之差计：
// 每高出 gapStep 记一档，每档难度 +dcPerGapStep，再减气运抵消
// floor(机缘 / fortuneOffsetDivisor)，不低于 0。
export const FATE_TIER = {
  parBase: 78, parPerRealm: 7, gapStep: 14, dcPerGapStep: 6, fortuneOffsetDivisor: 4,
  drawBiasMinFortune: 20, drawBiasChanceMax: 0.3, drawBiasChanceDivisor: 120, drawBiasMinGap: 10,
} as const;
export function fateTierBump(maxDc: number, realmIdx: number, fortune: number): { gapSteps: number; bump: number } {
  const par = FATE_TIER.parBase + realmIdx * FATE_TIER.parPerRealm;
  const gapSteps = Math.max(0, Math.floor((maxDc - par) / FATE_TIER.gapStep));
  const bump = Math.max(0, gapSteps * FATE_TIER.dcPerGapStep - Math.floor(fortune / FATE_TIER.fortuneOffsetDivisor));
  return { gapSteps, bump };
}

// 判定公式（唯一实现点，rollCheck 调用）：总值 ≥ 难度成功；
// 难度 ≤ 0 自动成功（无需检定的选项）。胜势差 = 总值 − 难度（U-570）。
export function isCheckSuccess(total: number, dc: number): boolean {
  return dc <= 0 ? true : total >= dc;
}

// ---------- 境界加成：随境界/阶位缩放的阈值与难度公式参数 ----------
// 突破门槛（本阶修为需达）：60 + 境界×45 + 小阶×15。
export const CULTIVATION_THRESHOLD = { base: 60, perRealm: 45, perStage: 15 } as const;
export function cultivationThresholdFor(realmIdx: number, stageIdx: number): number {
  return CULTIVATION_THRESHOLD.base + realmIdx * CULTIVATION_THRESHOLD.perRealm + stageIdx * CULTIVATION_THRESHOLD.perStage;
}

// 突破检定：难度 = 118 + 境界×6，守心如玉 −10、有师父护法 −8（掷骰前
// 难度调整）；修正额外加成 = 业力/5（向下取整）+ 破关如喝水 +10 + 破境
// 助力（破境丹/请教累积，消耗品，上限在经济/社交侧维护）。连败保底
// 不在此列——它走 U-569 modifier 链（dice.ts 的 breakthroughPityModifier）。
export const BREAKTHROUGH_CHECK = {
  attr: "sense",
  baseDc: 118,
  dcPerRealm: 6,
  talentDcAdjust: [{ talentId: "t_greedless", dcDelta: -10 }],
  masterDcDelta: -8,
  karmaDivisor: 5,
  talentBonus: [{ talentId: "t_break", points: 10 }],
} as const;
export function breakthroughDcFor(realmIdx: number, talentIds: readonly string[], hasMaster: boolean): number {
  let dc = BREAKTHROUGH_CHECK.baseDc + realmIdx * BREAKTHROUGH_CHECK.dcPerRealm;
  for (const adj of BREAKTHROUGH_CHECK.talentDcAdjust) if (talentIds.includes(adj.talentId)) dc += adj.dcDelta;
  if (hasMaster) dc += BREAKTHROUGH_CHECK.masterDcDelta;
  return dc;
}
export function breakthroughBonusFor(karma: number, talentIds: readonly string[], breakBonus: number): number {
  let bonus = Math.floor(karma / BREAKTHROUGH_CHECK.karmaDivisor) + breakBonus;
  for (const t of BREAKTHROUGH_CHECK.talentBonus) if (talentIds.includes(t.talentId)) bonus += t.points;
  return bonus;
}

// 斗法检定（Q15）：难度 = 70 + 敌手境界×18 + 敌手战力。
export const COMBAT_CHECK = { attr: "might", baseDc: 70, dcPerTier: 18 } as const;
export function combatDcFor(tier: number, might: number): number {
  return COMBAT_CHECK.baseDc + tier * COMBAT_CHECK.dcPerTier + might;
}

// 决斗检定（Q18）：难度 = 85 + 对方境界×12 + 仇怨/2（向下取整）。
// Q34 补充口径：境界按对方（NPC）境界计——境界差直接体现在难度上
// （调用方传 npcById(rel.npcId).realm，无记录时回退玩家境界）。
export const DUEL_CHECK = { attr: "might", baseDc: 85, dcPerRealm: 12, bondDivisor: 2 } as const;
export function duelDcFor(realmIdx: number, bond: number): number {
  return DUEL_CHECK.baseDc + realmIdx * DUEL_CHECK.dcPerRealm + Math.floor(bond / DUEL_CHECK.bondDivisor);
}

// 仇敌寻仇（Q18）：基准难度 = 70 + 境界×15 + 仇怨/2；三选项难度在基准
// 上调整（破财 −25、遁走 −15，均不低于 60；迎战用基准）。
export const AMBUSH_CHECK = {
  baseDc: 70, dcPerRealm: 15, bondDivisor: 2,
  payDelta: -25, fleeDelta: -15, optionFloor: 60,
} as const;
export function ambushDcFor(realmIdx: number, bond: number): number {
  return AMBUSH_CHECK.baseDc + realmIdx * AMBUSH_CHECK.dcPerRealm + Math.floor(bond / AMBUSH_CHECK.bondDivisor);
}
export function ambushOptionDcFor(baseDc: number, option: "fight" | "pay" | "flee"): number {
  if (option === "pay") return Math.max(AMBUSH_CHECK.optionFloor, baseDc + AMBUSH_CHECK.payDelta);
  if (option === "flee") return Math.max(AMBUSH_CHECK.optionFloor, baseDc + AMBUSH_CHECK.fleeDelta);
  return baseDc;
}

// ---------- 具名检定声明（固定难度，skillchecks.yaml 的对应物） ----------
export const SKILL_CHECKS = {
  craft: {
    alchemy: { attr: "sense", dc: 92 },
    forge: { attr: "body", dc: 95 },
    farm: { attr: "body", dc: 80 },
    fish: { attr: "fortune", dc: 88 },
  },
  sectChore: { attr: "body", dc: 84 },
  socialMeet: { attr: "fortune", dc: 80 },
  reconcile: { attr: "fortune", dc: 90 },
} as const;

// ---------- 技能（天赋）加分声明（skills.yaml 的对应物） ----------
// 属性天赋：每个给对应属性 +extraPointsPerLevel.attrTalent。
export const ATTR_TALENT_POINTS: readonly { talentId: string; attr: AttrKey }[] = [
  { talentId: "t_swordbone", attr: "might" },
  { talentId: "t_insight", attr: "sense" },
  { talentId: "t_luckystar", attr: "fortune" },
  { talentId: "t_pillbody", attr: "body" },
];
export function talentAttrBonus(talentIds: readonly string[], attr: AttrKey): number {
  let bonus = 0;
  for (const e of ATTR_TALENT_POINTS) if (e.attr === attr && talentIds.includes(e.talentId)) bonus += CHECK_CONFIG.extraPointsPerLevel.attrTalent;
  return bonus;
}

// 副职天赋：每个给对应副职检定 +extraPointsPerLevel.craftTalent。
export const CRAFT_TALENT_POINTS: readonly { kind: string; talentId: string }[] = [
  { kind: "alchemy", talentId: "t_alchemy" },
  { kind: "forge", talentId: "t_forge" },
  { kind: "fish", talentId: "t_fish" },
  { kind: "farm", talentId: "t_farm" },
];
export function craftTalentBonus(talentIds: readonly string[], kind: string): number {
  let bonus = 0;
  for (const e of CRAFT_TALENT_POINTS) if (e.kind === kind && talentIds.includes(e.talentId)) bonus += CHECK_CONFIG.extraPointsPerLevel.craftTalent;
  return bonus;
}

// 情境天赋：按事件地点/事件本身给加分（加分值逐条声明，因情境而异）。
export const EVENT_TALENT_RULES: readonly { talentId: string; points: number; locationsAny?: readonly string[]; eventIds?: readonly string[] }[] = [
  { talentId: "t_bounty", points: 10, locationsAny: ["demonfront", "arena", "wilds"] },
  { talentId: "t_gamble", points: 12, eventIds: ["merchant"] },
  { talentId: "t_herb", points: 8, eventIds: ["farming", "spirit_rain", "wilds_herd"] },
];
export function eventTalentBonus(talentIds: readonly string[], ev: { id: string; locations: readonly string[] }): number {
  let bonus = 0;
  for (const rule of EVENT_TALENT_RULES) {
    if (!talentIds.includes(rule.talentId)) continue;
    const locHit = rule.locationsAny ? rule.locationsAny.some((loc) => ev.locations.includes(loc)) : false;
    const idHit = rule.eventIds ? rule.eventIds.includes(ev.id) : false;
    if (locHit || idHit) bonus += rule.points;
  }
  return bonus;
}

// ---------- 法宝修正声明 ----------
// 本命法宝给四维的修正只在此表声明（data.ts 的 ARTIFACTS 只管名号、
// 说明与赎回价）；applyArtifactBonus（state.ts）按表通用结算。
export const ARTIFACT_BONUSES: Readonly<Record<string, Partial<Record<AttrKey, number>>>> = {
  sword: { might: 4 },
  armor: { body: 4 },
  gourd: { sense: 4, fortune: 2 },
  bell: { sense: 3, body: 2 },
  mirror: { fortune: 4 },
  needle: { might: 3, sense: 2 },
};
export function artifactBonusFor(artifactId: string): Partial<Record<AttrKey, number>> {
  const base = ARTIFACT_BONUSES[artifactId] ?? {};
  // U-617：新法宝的四维修正声明在配置表 fx.bonus 里（artifacts.json），
  // 与本表合并结算；现有 6 件无 fx，返回值与改前逐字一致。
  const fxBonus = ARTIFACTS_POOL.find((a) => a.id === artifactId)?.fx?.bonus;
  if (!fxBonus) return base;
  const merged: Partial<Record<AttrKey, number>> = { ...base };
  for (const k of ["might", "sense", "fortune", "body"] as AttrKey[]) {
    const v = fxBonus[k];
    if (v) merged[k] = (merged[k] ?? 0) + v;
  }
  return merged;
}

// ---------- 命格修正声明 ----------
// 命格（Q13/Q14 新增）：每世降生抽 3 选 1 或随机，自带吉凶修正。
// might/sense/fortune/body 为属性增减；lifespanPct 为寿元百分比修正；
// cultPct 为修炼收益百分比修正；stones/karma 为开局增减。
// U-565：命格条目本体已迁入 content/destinies.json 配置文件（经
// content.ts schema 校验加载），本表只保留类型与查表——修正字段的
// 结算口径仍在本文件一处维护，数值与文案逐字未动。
import { ARTIFACTS as ARTIFACTS_POOL, DESTINIES, type DestinyDef } from "./content";
export { DESTINIES, type DestinyDef };
export function destinyById(id: string | null | undefined): DestinyDef | undefined { return DESTINIES.find((d) => d.id === id); }

// 命格生效（applyDestiny，reincarnation.ts 调用）只读上表字段结算，
// cultPct 参与修炼收益（非检定）亦出自同一张表，一处维护。

// ---------- 记忆保留（Q12/Q7）：境界加成与上限 ----------
// Q12 定稿：坐化 30% / 战死 10% / 横死 0% + 境界序号×5% + 宿慧深种
// 10%，封顶 50%。死于走火入魔 = 保留率 0（调用方先行拦截，文案在彼）。
export const MEMORY_CHECK = {
  baseByCause: { seated: 0.3, battle: 0.1, other: 0 },
  perRealm: 0.05,
  cap: 0.5,
  talentBonus: { talentId: "t_memory", points: 0.1 },
} as const;
export function memoryBaseFor(deathCause: string): { rate: number; label: string } {
  if (deathCause.includes("寿元") || deathCause.includes("坐化")) return { rate: MEMORY_CHECK.baseByCause.seated, label: "寿终坐化" };
  if (deathCause.includes("陨落于") || deathCause.includes("陨落")) return { rate: MEMORY_CHECK.baseByCause.battle, label: "战死" };
  return { rate: MEMORY_CHECK.baseByCause.other, label: "横死" };
}
export function memoryChanceFor(deathCause: string, realmIdx: number, talentIds: readonly string[]): { chance: number; base: number; baseLabel: string; realmBonus: number; talentBonus: number } {
  const base = memoryBaseFor(deathCause);
  const realmBonus = realmIdx * MEMORY_CHECK.perRealm;
  const talentBonus = talentIds.includes(MEMORY_CHECK.talentBonus.talentId) ? MEMORY_CHECK.talentBonus.points : 0;
  return {
    chance: Math.min(MEMORY_CHECK.cap, base.rate + realmBonus + talentBonus),
    base: base.rate, baseLabel: base.label, realmBonus, talentBonus,
  };
}

// Q7 旧版「按境界判定」（设计树显式改选时覆盖 Q12）：坐化全留、
// 元婴以上（境界序号 ≥3）全留、筑基/金丹（≥1）七成、炼气四成。
export const REALM_MEMORY_CHECK = { seated: 1, highRealmIdx: 3, highRealm: 1, midRealmIdx: 1, midRealm: 0.7, lowRealm: 0.4 } as const;
export function realmMemoryChanceFor(deathCause: string, realmIdx: number): { chance: number; rule: string } {
  const seated = deathCause.includes("寿元") || deathCause.includes("坐化");
  if (seated) return { chance: REALM_MEMORY_CHECK.seated, rule: "坐化全留" };
  if (realmIdx >= REALM_MEMORY_CHECK.highRealmIdx) return { chance: REALM_MEMORY_CHECK.highRealm, rule: "元婴以上全留" };
  if (realmIdx >= REALM_MEMORY_CHECK.midRealmIdx) return { chance: REALM_MEMORY_CHECK.midRealm, rule: "筑基/金丹留七成" };
  return { chance: REALM_MEMORY_CHECK.lowRealm, rule: "炼气留四成" };
}

// ---------- 配置自检（非法即抛错，不静默兜底） ----------
export function assertCheckConfig(): void {
  const bad = (why: string) => new Error(`checks: invalid check config: ${why}`);
  // Q34：七个系统的基础骰面必须两两不同且为正整数，上下限系数为正。
  const bases = Object.values(DICE_SYSTEMS).map((s) => s.base);
  if (bases.some((b) => !Number.isInteger(b) || b < 2)) throw bad("DICE_SYSTEMS base must be an integer >= 2");
  if (new Set(bases).size !== bases.length) throw bad("DICE_SYSTEMS bases must be pairwise distinct");
  for (const [name, s] of Object.entries(DICE_SYSTEMS)) {
    for (const [k, v] of Object.entries(s)) {
      if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) throw bad(`DICE_SYSTEMS.${name}.${k} invalid`);
    }
    // 抽查一组代表性输入：范围必须合法（hi > lo）。
    const probe = diceRangeFor(name as CheckSystem, { attr: "might", attrValue: 20, fortune: 20, sense: 20, realmIdx: 2, sectRankIdx: 1, bond: 30, craftLevel: 1 });
    if (!(probe.hi > probe.lo && probe.lo >= 1)) throw bad(`DICE_SYSTEMS.${name} probe range invalid [${probe.lo}, ${probe.hi}]`);
  }
  if (!(SOCIAL_REALM_DIFF.dcPerRealm > 0)) throw bad("SOCIAL_REALM_DIFF.dcPerRealm invalid");
  if (!(FATE_TIER.gapStep > 0 && FATE_TIER.dcPerGapStep > 0 && FATE_TIER.fortuneOffsetDivisor > 0)) throw bad("FATE_TIER coefficients invalid");
  for (const [k, v] of Object.entries(CHECK_CONFIG.extraPointsPerLevel)) {
    if (!Number.isFinite(v) || v < 0) throw bad(`extraPointsPerLevel.${k} invalid`);
  }
  if (!Number.isInteger(CHECK_CONFIG.doubleRoll.diceCount) || CHECK_CONFIG.doubleRoll.diceCount < 2 || CHECK_CONFIG.doubleRoll.diceCount > 100) throw bad("doubleRoll.diceCount out of range");
  if (CHECK_CONFIG.doubleRoll.advantageSuffix !== "L" || CHECK_CONFIG.doubleRoll.disadvantageSuffix !== "H") throw bad("doubleRoll suffixes must be L (advantage) / H (disadvantage)");
  const dcEntries: [string, number][] = [
    ["threshold.base", CULTIVATION_THRESHOLD.base], ["threshold.perRealm", CULTIVATION_THRESHOLD.perRealm], ["threshold.perStage", CULTIVATION_THRESHOLD.perStage],
    ["breakthrough.baseDc", BREAKTHROUGH_CHECK.baseDc], ["breakthrough.dcPerRealm", BREAKTHROUGH_CHECK.dcPerRealm],
    ["combat.baseDc", COMBAT_CHECK.baseDc], ["combat.dcPerTier", COMBAT_CHECK.dcPerTier],
    ["duel.baseDc", DUEL_CHECK.baseDc], ["duel.dcPerRealm", DUEL_CHECK.dcPerRealm],
    ["ambush.baseDc", AMBUSH_CHECK.baseDc], ["ambush.dcPerRealm", AMBUSH_CHECK.dcPerRealm], ["ambush.optionFloor", AMBUSH_CHECK.optionFloor],
    ...Object.entries(SKILL_CHECKS.craft).map(([k, v]): [string, number] => [`craft.${k}.dc`, v.dc]),
    ["sectChore.dc", SKILL_CHECKS.sectChore.dc], ["socialMeet.dc", SKILL_CHECKS.socialMeet.dc], ["reconcile.dc", SKILL_CHECKS.reconcile.dc],
  ];
  for (const [k, v] of dcEntries) if (!Number.isInteger(v) || v < 0) throw bad(`${k} must be a non-negative integer`);
  const attrs: readonly string[] = ["might", "sense", "fortune", "body"];
  for (const [k, v] of [...Object.entries(SKILL_CHECKS.craft), ["sectChore", SKILL_CHECKS.sectChore], ["socialMeet", SKILL_CHECKS.socialMeet], ["reconcile", SKILL_CHECKS.reconcile]] as [string, { attr: string }][]) {
    if (!attrs.includes(v.attr)) throw bad(`check ${k} has invalid attr ${v.attr}`);
  }
  const destinyIds = new Set<string>();
  for (const d of DESTINIES) {
    if (destinyIds.has(d.id)) throw bad(`duplicate destiny id ${d.id}`);
    destinyIds.add(d.id);
    for (const f of ["might", "sense", "fortune", "body", "lifespanPct", "cultPct", "stones", "karma"] as const) {
      const v = d[f];
      if (v !== undefined && !Number.isFinite(v)) throw bad(`destiny ${d.id}.${f} not finite`);
    }
  }
  for (const [id, bonus] of Object.entries(ARTIFACT_BONUSES)) {
    for (const [k, v] of Object.entries(bonus)) {
      if (!attrs.includes(k) || typeof v !== "number" || !Number.isFinite(v)) throw bad(`artifact ${id} bonus invalid`);
    }
    // U-565：法宝修正表的键必须都在法宝配置文件里有对应条目。
    if (!ARTIFACTS_POOL.some((a) => a.id === id)) throw bad(`artifact bonus references unknown artifact ${id}`);
  }
  // U-617：每件法宝必须至少有一处真实效果（本表四维修正或配置表
  // fx 任一字段），且 fx 各项强度不得越过平衡上限——上限按「单件
  // 法宝在单一系统里的增益不超过既有最强同类修正（天赋/命格/位阶）
  // 的约 1.5 倍」逐项定死，配置写超即加载拦下，避免某一件恒优。
  const FX_CAPS: Record<string, number> = {
    cultPct: 25, cavePct: 30, healPct: 25, breakDcDown: 12,
    backfireShieldChance: 0.5, dmgReducePct: 30, escapeChance: 0.4, critChance: 0.3,
    memoryPct: 15, eventRewardPct: 30, eggChanceAdd: 30,
    craftPct: 40, socialPct: 40, sectPct: 40, sellPct: 40, shopDiscountPct: 15, pillPct: 40,
    legacyBonus: 2, pointsBonus: 2,
  };
  for (const a of ARTIFACTS_POOL) {
    const fx = a.fx;
    const hasAttrBonus = Object.keys(ARTIFACT_BONUSES[a.id] ?? {}).length > 0;
    const hasFx = !!fx && Object.keys(fx).length > 0;
    if (!hasAttrBonus && !hasFx) throw bad(`artifact ${a.id} has no effect (neither ARTIFACT_BONUSES nor fx)`);
    if (!fx) continue;
    for (const [k, cap] of Object.entries(FX_CAPS)) {
      const v = (fx as Record<string, unknown>)[k];
      if (v !== undefined && (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > cap)) throw bad(`artifact ${a.id} fx.${k} out of balance cap ${cap}: ${String(v)}`);
    }
    if (fx.bonus) {
      let sum = 0;
      for (const [k, v] of Object.entries(fx.bonus)) {
        if (!attrs.includes(k) || typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 4) throw bad(`artifact ${a.id} fx.bonus.${k} invalid`);
        sum += v;
      }
      if (sum > 6) throw bad(`artifact ${a.id} fx.bonus total ${sum} exceeds existing-artifact budget 6`);
    }
  }
  if (!(MEMORY_CHECK.cap > 0 && MEMORY_CHECK.cap <= 1)) throw bad("memory cap out of range");
}

// 模块加载即自检：配置写坏时服务端启动就报错，不带病运行。
assertCheckConfig();
