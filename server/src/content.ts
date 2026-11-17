// 轮回修仙跑团 — U-565 内容配置加载层：全部静态内容池放 server/src/content/
// 下的 JSON 配置文件，与代码分离——加内容只加数据行，不改代码。
// 规则照 C-10 与 C-18 的共同规则（内容放数据文件、附 schema 校验）：
// 本模块在加载时用 zod schema 逐池校验 JSON（结构/类型/必填），再做
// 跨池引用完整性自检（id 唯一、事件/敌手引用的地点存在、事件关系引用
// 的 NPC 存在、法宝修正表键 ⊆ 法宝池）；任一处非法立刻抛错，不静默
// 兜底，错误经动作层 withErrorLogging 记入服务端报错记录。
// 红线：本项只迁移内容位置——数值与文案与迁移前逐字一致（金快照逐项
// 深比对验证）；Q1–Q18、判定公式、存档结构未动。「任务/成就」在本游戏
// 里没有独立内容池：任务即事件池 + 宗门差事检定（checks.ts SKILL_CHECKS
// 声明），无独立成就系统，故无对应配置文件——不是漏迁。
// 检定配置（技能加分/难度公式/命格修正数值口径）仍在 checks.ts 的
// U-563 配置表一处维护；命格条目本身（名号/说明/修正）已迁入
// content/destinies.json，checks.ts 从本模块取数后照旧结算。

import { z } from "zod";
import realmsJson from "./content/realms.json" with { type: "json" };
import rootsJson from "./content/roots.json" with { type: "json" };
import namesJson from "./content/names.json" with { type: "json" };
import originsJson from "./content/origins.json" with { type: "json" };
import talentsJson from "./content/talents.json" with { type: "json" };
import artifactsJson from "./content/artifacts.json" with { type: "json" };
import techniquesJson from "./content/techniques.json" with { type: "json" };
import treasuresJson from "./content/treasures.json" with { type: "json" };
import locationsJson from "./content/locations.json" with { type: "json" };
import sectRanksJson from "./content/sect-ranks.json" with { type: "json" };
import enemiesJson from "./content/enemies.json" with { type: "json" };
import mainlineJson from "./content/mainline.json" with { type: "json" };
import shopJson from "./content/shop.json" with { type: "json" };
import npcsJson from "./content/npcs.json" with { type: "json" };
import destiniesJson from "./content/destinies.json" with { type: "json" };
import reincarnationPointsJson from "./content/reincarnation-points.json" with { type: "json" };
import dailyEventsJson from "./content/daily-events.json" with { type: "json" };
import commissionsJson from "./content/commissions.json" with { type: "json" };
import timedEventsJson from "./content/timed-events.json" with { type: "json" };
import dailyCommissionsJson from "./content/daily-commissions.json" with { type: "json" };
import signInsJson from "./content/sign-ins.json" with { type: "json" };
import sealedEggsJson from "./content/sealed-eggs.json" with { type: "json" };
import eventPacksJson from "./content/event-packs.json" with { type: "json" };
import eventReleasesJson from "./content/event-releases.json" with { type: "json" };
import locationDropsJson from "./content/location-drops.json" with { type: "json" };
import timeCostsJson from "./content/time-costs.json" with { type: "json" };
import craftSkillsJson from "./content/craft-skills.json" with { type: "json" };
import forgeJson from "./content/forge.json" with { type: "json" };
import artifactSourcesJson from "./content/artifact-sources.json" with { type: "json" };
// U-376：事件池不在本文件加载——事件类型/schema/稀有度分档/分桶归属
// 与五分文件合并都在 events-base.ts（事件组织法的基础文件），本文件
// 只转发其导出，保持既有 import 路径不变；跨池引用自检仍在下方跑。
import { EVENTS, EVENT_RARITY, eventRarityTier, type Effect, type RelSpec } from "./events-base";
export { EVENTS, EVENT_LOOP, EVENT_RARITY, eventCostBlockReason, eventRarityTier, formatEffectGains, formatEventCost, loopDcFor, loopMultiplier, scaleEffectForLoop } from "./events-base";
export type { Effect, EventDef, EventOptionDef, RelSpec } from "./events-base";

// ---------- 内容条目类型（与迁移前 data.ts / events.ts / checks.ts 的
// 接口逐字相同，调用方无需改动） ----------

export interface RealmDef { name: string; lifespan: number; hp: number; mp: number }
export interface RootDef { id: string; name: string; desc: string; might: number; sense: number; fortune: number; body: number }
export interface TalentDef { id: string; name: string; tier: "gold" | "purple" | "blue"; desc: string }
// U-618：minRealm 是本命法宝的境界使用门槛（境界序号，口径与地点
// minRealm 一致）——按功能强度逐件定（弱功能低境界、强功能高境界，
// 分档见 DATA-PLAN 的 U-618 记录）。未达门槛不可认主生效（封存），
// 轮回结算挑选亦按此门槛过滤；缺失或非法境界在加载自检即拦。
// U-617：本命法宝功能效果声明（配置表口径）——除四维修正（bonus，
// 与 checks.ts 的 ARTIFACT_BONUSES 同口径、由 artifactBonusFor 合并
// 结算）外，各系统向的功能效果逐项声明在此，结算点只读本表：
// cultPct 修炼收益% / cavePct 洞府内修炼收益% / healPct 休整回血
// 额外百分点（占气血上限）/ breakDcDown 突破难度直减 /
// backfireShieldChance 突破走火入魔时护持概率（0–1，挡下则按普通
// 失败结算）/ karmaShield 负业力不拖累突破（0/1）/ dmgReducePct
// 受伤减免% / escapeChance 斗法败北致死时遁逃概率（0–1）/
// critChance 斗法获胜暴击概率（0–1，缴获与修为 ×1.5）/
// memoryPct 轮回记忆保留率 +%（百分点，仍受各口径上限约束）/
// eventRewardPct 探索际遇成功收益（灵石/修为）% / eggChanceAdd
// 封印之蛋现身概率 +%（百分点）/ craftPct 副职成功收益%（craftKind
// 限定时只对该副职，缺省四项通吃）/ socialPct 社交情谊增减幅度% /
// sectPct 宗门差事贡献% / sellPct 寄卖收益% / shopDiscountPct
// 坊市买丹折扣% / pillPct 服丹效果% / legacyBonus 轮回结算传承点
// +N / pointsBonus 轮回结算轮回点 +N。现有 6 件无法宝 fx（效果仍
// 只走 ARTIFACT_BONUSES，数值逐字不变）；每件法宝必须至少有一处
// 效果（四维修正或 fx 任一字段），空效果在加载自检即拦。
export interface ArtifactFx {
  bonus?: { might?: number; sense?: number; fortune?: number; body?: number };
  cultPct?: number; cavePct?: number; healPct?: number;
  breakDcDown?: number; backfireShieldChance?: number; karmaShield?: number;
  dmgReducePct?: number; escapeChance?: number; critChance?: number;
  memoryPct?: number; eventRewardPct?: number; eggChanceAdd?: number;
  craftPct?: number; craftKind?: "alchemy" | "forge" | "farm" | "fish";
  socialPct?: number; sectPct?: number;
  sellPct?: number; shopDiscountPct?: number; pillPct?: number;
  legacyBonus?: number; pointsBonus?: number;
}
export interface ArtifactDef { id: string; name: string; desc: string; legacyCost: number; minRealm: number; fx?: ArtifactFx }
export interface TechDef { id: string; name: string; desc: string; bonusPct: number; legacyCost: number }
export interface TreasureDef { id: string; name: string; desc: string; legacyCost: number; effect: { stones?: number; cult?: number } }
export interface LocationDef { id: string; name: string; desc: string; minRealm: number; group: string }
export interface SectRankDef { id: string; name: string; contribNeed: number; realmNeed: number; stipend: number; cultivateBonus: number }
export interface EnemyDef { id: string; name: string; desc: string; tier: number; might: number; locations: string[] }
export interface MainlineChapter { need: number; title: string; text: string }
export interface ShopItemDef { name: string; base: number; desc: string }
export interface ShopDef { heal: ShopItemDef; cult: ShopItemDef; brk: ShopItemDef }
export type RelKind = "partner" | "master" | "disciple" | "friend" | "enemy";
// Q34：realm 为 NPC 境界序号（0 炼气 … 8 渡劫），供社交/决斗难度
// 按双方境界差计算（checks.ts 的 SOCIAL_REALM_DIFF / DUEL_CHECK）。
export interface NpcDef { id: string; name: string; title: string; desc: string; kind: RelKind; realm: number }
export interface DestinyDef {
  id: string; name: string; desc: string;
  might?: number; sense?: number; fortune?: number; body?: number;
  lifespanPct?: number; cultPct?: number; stones?: number; karma?: number;
}
// 事件条目类型（Effect / RelSpec / EventOptionDef / EventDef）与稀有度
// 分档（EVENT_RARITY / eventRarityTier）自 U-376 起在 events-base.ts
// 一处维护，本文件顶部已转发导出，接口逐字不变。
// U-002 轮回点数值配置表：结算发放档位（按本世评级）与开局分配价格，
// 全部数值只在本表一处维护（content/reincarnation-points.json）。
// U-021：同表新增 boons——「强化下一世再战天道」的开局强化项，与
// U-002 的花费项（初始属性四维 / 重置天赋灵根候选）不重叠：强化的是
// 气血/法力上限、寿元与开局灵石，降生时一次性生效。
// U-322：同表新增 shardTiers——「完成每世主线」的又一产点口径：轮回
// 结算时按本世新收集的记忆碎片数（主线「前世之谜」）分档发放，与
// grantByGrade 同入一个轮回点池。min = 本世新集碎片数门槛（达到即按
// 该档发放，取满足的最高档），points = 该档发放点数。碎片跨世累计
// 上限 9 枚，故本口径全程总供给有界（≤9 点），不会冲击既有价格。
export interface BirthBoonEffect { hp?: number; mp?: number; stones?: number; lifespanPct?: number }
export interface BirthBoonDef {
  id: string; name: string; desc: string; cost: number; effect: BirthBoonEffect;
}
// U-384 经营日常随机事件配置表：经营/休整日常动作（修炼/休整/副职/
// 宗门差事）结算后触发随机危机/惊喜事件的概率（百分比），只在本表
// 一处维护（content/daily-events.json）。触发的事件从现有事件池按
// 既有牌堆口径抽取、走既有 chooseOption 结算，本表只管概率本身。
export interface DailyEventsDef {
  chancePct: number;
}

// U-388 委托板数值/内容配置表：街边告示板式接取支线——委托池、板上
// 同时张贴数（boardSize）与同时可接数（maxActive）只在本表一处维护
// （content/commissions.json）。委托全部从现有内容取材：委托人是现
// 有 NPC、目标地点是现有地点、目标是既有系统的行为计数（explore =
// 在目标地点结算一桩牌堆事件、fight = 在目标地点斗法获胜、craft =
// 在目标地点做一回副职、sectChore = 办一回宗门差事），奖励走既有
// Effect 字段、结缘走既有 RelSpec——不新编数值体系。接取无时限、
// 不接无惩罚（U-389 限时/U-390 日常委托池是另两项，本表不涉及）。
export type CommissionObjectiveKind = "explore" | "fight" | "craft" | "sectChore";
export interface CommissionDef {
  id: string; title: string; issuerNpc: string;
  boardLocationId: string; locationId: string;
  objective: { kind: CommissionObjectiveKind; need: number };
  brief: string; story: string;
  reward: Effect; relOk?: RelSpec;
}
export interface CommissionsDef {
  boardSize: number;
  maxActive: number;
  commissions: CommissionDef[];
}

// U-389 限时事件数值/内容配置表（来源 B-65《修真聊天群》，拆自 v1
// U-47 的限时部分）：群友发布的限时帖——秘境探索 / 求丹 / 斗法约战
// 等，带倒计时：帖子在板上只挂 postDays 天，无人接取即过期沉底；
// 接取后须在 limitDays 天内办妥目标，超时即失败（U-610/Q37：倒计
// 时改按天/月计——时钟走 U-608 累计月份，天数按月内折算：1 个月
// = daysPerMonth 天，本表一处定；时限数值按各帖目标的动作耗时核
// 算，如约战 90 天 = 3 个月、求丹 540 天）。接 / 不接 / 成 / 败四
// 段都结算「声望」，
// 声望只复用既有字段：bond = 发布人在既有关系表（relations）里的
// 情谊/仇怨增减、sect = 既有宗门贡献字段（sectContrib）增减——不
// 新设货币、不新设声望字段。帖子内容全部取材现有 NPC/地点/系统，
// 目标与委托板共用同一套行为计数口径（CommissionObjectiveKind），
// 奖励走既有 Effect。与 U-388 委托板（无时限、不接无惩罚、回板结
// 算）分开：本表独立、状态独立、结算独立；U-390 日常委托池未碰。
export interface TimedRepDelta { bond?: number; sect?: number }
export interface TimedRepStages { accept: TimedRepDelta; ignore: TimedRepDelta; success: TimedRepDelta; fail: TimedRepDelta }
export interface TimedEventDef {
  id: string; title: string; issuerNpc: string;
  boardLocationId: string; locationId: string;
  objective: { kind: CommissionObjectiveKind; need: number };
  limitDays: number; postDays: number;
  brief: string; story: string;
  reward: Effect; rep: TimedRepStages;
}
export interface TimedEventsDef {
  boardSize: number;
  maxActive: number;
  daysPerMonth: number;
  postings: TimedEventDef[];
}

// U-390 日常委托事件池数值/内容配置表（来源 B-66《我的微信连三
// 界》，拆自 v1 U-47 的日常池部分）：天庭朋友圈 / 地府委托做成日常
// 探索事件池——按批刷新（U-390 时按角色年龄、年龄每进一岁刷新一
// 批；U-611 起改按 U-608 细时钟的累计月份：每过 refreshInterval-
// Months 个月刷新一批、一次行动最多刷新一批），每批 batchSize
// 条；不设接取动作、不接取声望：进入委托地点即触发本批委托（把委
// 托引用的现有事件按既有牌堆同口径摆成待决事件），办妥（任一选项
// 掷骰成功）当场发额外奖励——天庭朋友圈（source=heaven）给稀有材
// 料（灵石/修为等既有资源）、地府委托（source=underworld）给前世
// 线索（reward.shard 走既有记忆碎片字段，汇入 Q16 前世之谜）；未
// 完成不惩罚，刷新时整批换新。与 U-388 委托板（接取式、无时限、
// 回板结算）与 U-389 限时事件（有时限、声望结算）分开：本表独立、
// 状态独立、无接取动作。内容全部取材现有内容：eventId 必须是现有
// 事件且该事件在 locationId 出没，奖励走既有 Effect 字段——不新
// 增事件/NPC/法宝/地点，不新编数值体系、不新设货币。
export type DailySource = "heaven" | "underworld";
export interface DailyCommissionDef {
  id: string; source: DailySource; title: string; issuer: string;
  locationId: string; eventId: string;
  brief: string; reward: Effect;
}
export interface DailyCommissionsDef {
  batchSize: number;
  // U-611：刷新间隔（月，走 U-608 累计月份口径）——累计月份自本批
  // 刷新起推进满此数即刷新下一批；必须为正整数（加载自检）。
  refreshIntervalMonths: number;
  commissions: DailyCommissionDef[];
}

// U-391 地点签到数值/内容配置表（来源 B-42《修仙：神级签到系统》，
// 拆自 v1 U-45 的签到部分）：到达指定地点（坊市 / 宗门山门 / 秘境）
// 触发签到式事件一次，即到即得——无需接取、无时限、无掷骰判定，
// 奖励三选一式：每个签到点在配置里定死一类奖励（功法 / 法宝 / 灵
// 石其一），内容全部取材现有内容池（techniqueId 必须是现有功法、
// artifactId 必须是现有法宝、灵石走既有 Effect 字段），不新增事
// 件/NPC/法宝/地点、不新编数值体系、不新设货币。功法/法宝奖励带
// fallback（既有 Effect）：签到时若功法槽已有功法（已在修习别的
// 功法）或本命法宝槽已有法宝（第二件法宝无处安放），按配置折作
// fallback 结算——签到仍是一次性、奖励仍与配置一致，两条分支都
// 在配置里明示（见 state.ts settleSignInHere）。
// U-392 签到图鉴（同源 B-42，拆自 v1 U-45 的图鉴部分）：tiers 是
// 按地点稀有度分档的档位表——每档定标签与「故地重游小奖」revisit
// （既有 Effect，只许灵石/修为两键）：签到大奖仍按签到点逐点配置
// （档位越高大奖越重：寻常给灵石、稀有赐功法、绝世遗法宝），本世
// 已签过的地点再次抵达时不再重发大奖，只按所在档位发 revisit 小
// 奖，鼓励探索新地点。图鉴收集进度是跨世记录（state.signInCodex：
// 已签到过的签到点 id 清单），只记清单与档位，不设图鉴货币；分档
// 与小奖的口径在加载自检里逐项核（见下方自检段）。
export type SignInTier = "common" | "rare" | "epic";
export type SignInReward =
  | { kind: "stones"; effect: Effect }
  | { kind: "technique"; techniqueId: string; fallback: Effect }
  | { kind: "artifact"; artifactId: string; fallback: Effect };
export interface SignInTierDef {
  label: string; revisit: Effect;
}
export interface SignInSpotDef {
  id: string; locationId: string; tier: SignInTier;
  title: string; text: string; reward: SignInReward;
}
export interface SignInsDef {
  tiers: Record<SignInTier, SignInTierDef>;
  spots: SignInSpotDef[];
}

// U-393 封印之蛋式收集物（来源 A-39《轩辕剑六》的「封印之蛋」收集；
// 来源未核实：调研文档已标注该作无 Steam 页，机制采信、来源标注未
// 核实；拆自 v1 U-45 的收集物部分，收集物集齐换线索，与 U-391/
// U-392 的签到触发方式不同）：探索时各地点随机出现「封印之蛋」式
// 收集物——每枚蛋在配置里定死埋藏地点（全部取材现有 12 个地点、
// 一地点至多一枚），探索抵达该地点时按 chancePct 概率（种子化掷
// 骰）现身，拾取即记入跨世收集进度（state.sealedEggs，轮回不清
// 空）；集齐 clueThreshold 的倍数枚时，蛋身封印共鸣换出一条前世
// 遗藏线索——线索只提示遗藏地点（优先指向一处真实存在的既有前
// 世遗藏；没有时标出一处由既有遗藏池取材的无主遗藏方位），不直
// 接发任何奖励，宝物仍要玩家亲自去该地点探索取回（走既有遗藏取
// 回链）。收集物只记收集清单，不进丹药囊、不占任何格子。不新增
// 事件/NPC/法宝/地点，不新设货币，集齐数量与线索口径都在本配置
// 表里（chancePct / clueThreshold），加载自检逐项核。
export interface SealedEggDef {
  id: string; locationId: string; name: string; text: string;
}
export interface SealedEggsDef {
  chancePct: number;
  clueThreshold: number;
  eggs: SealedEggDef[];
}

// U-394 探索事件分包/外传（来源 A-38《古剑奇谭二》，拆自 v1 新增）：
// 探索事件按「外传」分包——本篇自第一世起就在轮询里；外传包只在
// 轮回达到配置的世数后解锁（如外传一第二世起、外传二第五世起），
// 解锁后新包事件加入本世牌堆轮询，旧包不删除。包的成员全部取材
// 现有事件池（本篇 = 未被任何外传包认领的事件，不在配置里逐条列
// 名），不新增事件；解锁条件（minLife = 第几世起）只在本配置表一
// 处维护（content/event-packs.json），加载自检逐项核（包 id 唯
// 一、minLife 为正整数且互不相同、恰有一个 minLife 为 1 的本篇包
// 且它不得列 eventIds、外传包 eventIds 非空且互不重叠、引用的事
// 件必须存在于事件池）。分包只决定「哪些事件进本世牌堆」，事件
// 本身的触发/结算规则与牌堆抽取口径（U-576）一字未动。
export interface EventPackDef {
  id: string; name: string; desc: string; minLife: number;
  eventIds: string[];
}
export interface EventPacksDef {
  packs: EventPackDef[];
}

// U-395 新增事件分批投放（来源 A-41《轩辕剑外传：穹之扉》的「加强
// 版新增内容」思路，拆自 v1 新增；与 U-394 的区别：U-394 管已有内
// 容按轮回世数分包解锁，本项管新增内容的投放规则）：探索事件按批
// 次投放入池——每条事件带一个投放版本标记：首发时便在池中的事件
// 为第 1 批（不在配置里逐条列名，是「未被任何批次认领」的余集，
// 与 U-394 本篇包同一口径）；此后新增的事件进池时必须登记进一个
// 批次（version ≥ 2），批次只在本配置表一处维护
// （content/event-releases.json）。投放口径：角色降生时把当时的最
// 新投放版本落定为本世牌堆版本（character.deckVersion），本世建
// 堆与抽牌只收投放版本不高于牌堆版本的事件——当世进行中的牌堆不
// 受后来新批次影响（中途重洗与本地点子牌堆同口径）；轮回开新世
// 时牌堆版本推进到最新，旧存档无需重开存档即可在新世遇见新增事
// 件。事件本身的触发/结算规则与牌堆抽取口径（U-576）一字未动。
export interface EventReleaseBatchDef {
  version: number; name: string; desc: string;
  eventIds: string[];
}
export interface EventReleasesDef {
  batches: EventReleaseBatchDef[];
}

// U-396 按地点排布事件掉落（来源 A-36《轩辕剑柒》，拆自 v1 新增）：
// 探索事件的掉落与地点绑定——掉落表按地点写进本配置表
// （content/location-drops.json）：每个地点定死掉哪一门功法的残页
// 与其品质档（下品 / 中品 / 上品，如凡村掉下品、镇魔关古战场掉上
// 品）。品质档不是新数值：由功法既有字段派生（传承价 legacyCost
// 2 → 下品、3 → 中品、4 → 上品，与功法池既有的三档定价一致），配
// 置里的 tier 必须与派生档一致（加载自检逐项核），地点只决定掉
// 落品质档。结算复用既有功法/残页字段（与 U-391 签到功法同一口
// 径）：探索事件掷骰成功后按 chancePct 掷一次掉落判定，命中即得
// 该地点的功法残页——功法槽空着则学会这门功法（techniqueId 字
// 段，此后修炼按其 bonusPct 结算）；已在修习功法（无论是否同一
// 门）则残页不再另学，按所在档位的 fallback 折作参悟结算
// （applyEffects 既有 Effect 字段）。掉落判定是事件结算之后额外
// 的一掷：不改任何事件的触发概率、选项难度与成败结算，牌堆抽取
// 口径（U-576）一字未动；失败不掉（残页是际遇的收获）。
export type DropTier = "low" | "mid" | "high";
export interface DropTierDef {
  label: string; fallback: Effect;
}
export interface LocationDropDef {
  locationId: string; tier: DropTier; techniqueId: string;
}
export interface LocationDropsDef {
  chancePct: number;
  tiers: Record<DropTier, DropTierDef>;
  drops: LocationDropDef[];
}

// U-608 细时钟核心（Q37 第八轮定夺第一项）：时间单位细化到月——
// 1 年 = monthsPerYear（12）个月；每个动作的耗时只在本配置表一处
// 维护（content/time-costs.json）：行动按 costs 推进累计月份（角
// 色 totalMonths），满 12 个月进 1 岁、年龄由累计月份推导（state.ts
// 的 advanceMonths）；旅行按目的地查 travelMonths（1–6 月，目的地
// 越远耗时越久——地点表没有坐标，远近以目的地为准、同一目的地同
// 一耗时，与「按距离」的草稿口径在配置层面对齐）。耗时草稿出自
// Q37：修炼 12、探索 3、斗法 1、休整 1；草稿未定的副职（craft）/
// 宗门差事（sectChore）/突破（breakthrough）/社交（social）在本表
// 定为 6/6/6/3 并验算：一生（16→120 岁 = 1248 个月）纯修炼可修
// 104 次，与改前（一步一岁、104 步）逐项一致；副职单次修为收益
// 约为修炼的 1.7 倍、耗时取其一半（6 月），年化收益仍高于修炼但
// 受检定成败与周衰减约束；社交单次收益小、取 3 月。本项只建时
// 钟与配置表（寿元结算当时仍按年龄口径，后由 U-609 改按累计月份
// 结算，见 state.ts 的 lifespanMonthsOf / checkDeath）；限时帖
// 倒计时后由 U-610 改走累计月份折算的天序；日常委托（U-611）
// 的口径本项不改、仍按年龄键结算。
export type TimeCostKey = "cultivate" | "breakthrough" | "explore" | "rest" | "fight" | "craft" | "sectChore" | "social";
export interface TimeCostsDef {
  monthsPerYear: number;
  costs: Record<TimeCostKey, number>;
  travelMonths: Record<string, number>;
}

export interface ReincarnationPointsDef {
  grantByGrade: { S: number; A: number; B: number; C: number };
  attrCostPerPoint: number;
  attrCapPerAttr: number;
  resetCost: number;
  boons: BirthBoonDef[];
  // U-322：主线碎片分档发放（min 升序，取满足的最高档）。
  shardTiers: { min: number; points: number }[];
}

// U-482 副职熟练度与破限（来源 B-44《苟在神诡求长生》，拆自 v1
// U-50）：四门副职（炼丹/炼器/灵田/垂钓）各自独立成长——每次使用
// 任一副职（成败都算），该门使用次数 +1、熟练度按
// proficiencyPerUse 涨（熟练度 = 使用次数 × proficiencyPerUse，
// 派生量不另存）；使用次数达到 levels 某档的 minUses 即升到该等
// 级（破限），破限奖励只在本表声明：解锁该门既有成功产出的产量
// 加成（yieldPct，作用于成功收益的灵石/修为，与 U-617 副职类法
// 宝 craftPct 同口径叠乘）——不新造丹方/矿石/配方体系（那是
// U-498/U-499 的活）。熟练度等级同时是 Q34 副职 d60 的「副职等
// 级」（骰面下限 1+等级×loPerLevel），取代旧的天赋有无 1/0 代
// 理（checks.ts 的 DICE_SYSTEMS.craft）。本表是其余副职成长项
// （U-466/U-473/U-495 等）共用的底座：数值结构为「使用次数—熟
// 练度—破限奖励」三段，只在本表一处维护（content/craft-skills.json）。
export type CraftKind = "alchemy" | "forge" | "farm" | "fish";
export const CRAFT_KINDS: readonly CraftKind[] = ["alchemy", "forge", "farm", "fish"];
export interface CraftLevelDef { level: number; name: string; minUses: number }
export interface CraftBreakthroughDef { level: number; label: string; desc: string; yieldPct: number }
export interface CraftKindDef { label: string; breakthroughs: CraftBreakthroughDef[] }
export interface CraftSkillsDef {
  proficiencyPerUse: number;
  levels: CraftLevelDef[];
  kinds: Record<CraftKind, CraftKindDef>;
}

// ---------- schema 校验（zod；非法即抛错，带配置名与路径） ----------

const num = z.number().finite();
const str = z.string().min(1);
const relKindEnum = z.enum(["partner", "master", "disciple", "friend", "enemy"]);

const realmSchema = z.strictObject({ name: str, lifespan: num, hp: num, mp: num });
const rootSchema = z.strictObject({ id: str, name: str, desc: str, might: num, sense: num, fortune: num, body: num });
const talentSchema = z.strictObject({ id: str, name: str, tier: z.enum(["gold", "purple", "blue"]), desc: str });
const pctField = z.number().min(0).max(100);
const probField = z.number().min(0).max(1);
const artifactFxSchema = z.strictObject({
  bonus: z.strictObject({ might: num.optional(), sense: num.optional(), fortune: num.optional(), body: num.optional() }).optional(),
  cultPct: pctField.optional(), cavePct: pctField.optional(), healPct: pctField.optional(),
  breakDcDown: z.number().int().min(0).max(30).optional(),
  backfireShieldChance: probField.optional(), karmaShield: z.number().int().min(0).max(1).optional(),
  dmgReducePct: pctField.optional(), escapeChance: probField.optional(), critChance: probField.optional(),
  memoryPct: z.number().min(0).max(20).optional(), eventRewardPct: pctField.optional(), eggChanceAdd: pctField.optional(),
  craftPct: pctField.optional(), craftKind: z.enum(["alchemy", "forge", "farm", "fish"]).optional(),
  socialPct: pctField.optional(), sectPct: pctField.optional(),
  sellPct: pctField.optional(), shopDiscountPct: z.number().min(0).max(50).optional(), pillPct: pctField.optional(),
  legacyBonus: z.number().int().min(0).max(3).optional(), pointsBonus: z.number().int().min(0).max(3).optional(),
});
const artifactSchema = z.strictObject({ id: str, name: str, desc: str, legacyCost: num, minRealm: z.number().int().min(0), fx: artifactFxSchema.optional() });
const techSchema = z.strictObject({ id: str, name: str, desc: str, bonusPct: num, legacyCost: num });
const treasureSchema = z.strictObject({
  id: str, name: str, desc: str, legacyCost: num,
  effect: z.strictObject({ stones: num.optional(), cult: num.optional() }),
});
const locationSchema = z.strictObject({ id: str, name: str, desc: str, minRealm: num, group: str });
const sectRankSchema = z.strictObject({ id: str, name: str, contribNeed: num, realmNeed: num, stipend: num, cultivateBonus: num });
const enemySchema = z.strictObject({ id: str, name: str, desc: str, tier: num, might: num, locations: z.array(str) });
const chapterSchema = z.strictObject({ need: num, title: str, text: str });
const mainlineSchema = z.strictObject({ totalShards: num, caveUpgradeBase: z.array(num), chapters: z.array(chapterSchema) });
const realmsSchema = z.strictObject({ classicRealms: z.array(realmSchema) });
const shopItemSchema = z.strictObject({ name: str, base: num, desc: str });
const shopSchema = z.strictObject({ heal: shopItemSchema, cult: shopItemSchema, brk: shopItemSchema });
const npcSchema = z.strictObject({ id: str, name: str, title: str, desc: str, kind: relKindEnum, realm: num });
const destinySchema = z.strictObject({
  id: str, name: str, desc: str,
  might: num.optional(), sense: num.optional(), fortune: num.optional(), body: num.optional(),
  lifespanPct: num.optional(), cultPct: num.optional(), stones: num.optional(), karma: num.optional(),
});
// 事件 schema（effect/relSpec/eventOption/event）自 U-376 起在
// events-base.ts 维护（事件组织法的基础文件），本文件不再重复定义。
const boonSchema = z.strictObject({
  id: str, name: str, desc: str, cost: num,
  effect: z.strictObject({ hp: num.optional(), mp: num.optional(), stones: num.optional(), lifespanPct: num.optional() }),
});
const dailyEventsSchema = z.strictObject({ chancePct: num });
// U-388 委托板：奖励只许既有 Effect 键（与事件效果同一形状，值在
// 加载自检里逐项核正数）；结缘钩子与事件的 RelSpec 同一形状。
const commissionRewardSchema = z.strictObject({
  cult: num.optional(), hp: num.optional(), mp: num.optional(),
  stones: num.optional(), karma: num.optional(), age: num.optional(), shard: num.optional(),
});
const commissionRelSchema = z.strictObject({ npc: str, kind: relKindEnum, bond: num });
const commissionSchema = z.strictObject({
  id: str, title: str, issuerNpc: str,
  boardLocationId: str, locationId: str,
  objective: z.strictObject({ kind: z.enum(["explore", "fight", "craft", "sectChore"]), need: num }),
  brief: str, story: str,
  reward: commissionRewardSchema,
  relOk: commissionRelSchema.optional(),
});
const commissionsSchema = z.strictObject({
  boardSize: num, maxActive: num,
  commissions: z.array(commissionSchema),
});
// U-389 限时事件：声望段只许 bond（发布人既有关系情谊/仇怨）与 sect
// （既有宗门贡献）两键，符号口径在加载自检里逐段核（接/成非负、
// 不接/败非正，且每段至少一项非零——四段都必须真的影响声望）。
const timedRepSchema = z.strictObject({ bond: num.optional(), sect: num.optional() });
const timedEventSchema = z.strictObject({
  id: str, title: str, issuerNpc: str,
  boardLocationId: str, locationId: str,
  objective: z.strictObject({ kind: z.enum(["explore", "fight", "craft", "sectChore"]), need: num }),
  limitDays: num, postDays: num,
  brief: str, story: str,
  reward: commissionRewardSchema,
  rep: z.strictObject({ accept: timedRepSchema, ignore: timedRepSchema, success: timedRepSchema, fail: timedRepSchema }),
});
const timedEventsSchema = z.strictObject({
  boardSize: num, maxActive: num, daysPerMonth: num,
  postings: z.array(timedEventSchema),
});
// U-390 日常委托事件池：发布方 issuer 是「天庭朋友圈/地府」的名义
// （非 NPC，不走关系系统）；奖励只许既有 Effect 键（与委托奖励同
// 一形状），稀有材料/前世线索的口径在加载自检里按 source 逐条核。
const dailyCommissionSchema = z.strictObject({
  id: str, source: z.enum(["heaven", "underworld"]), title: str, issuer: str,
  locationId: str, eventId: str,
  brief: str, reward: commissionRewardSchema,
});
const dailyCommissionsSchema = z.strictObject({
  batchSize: num,
  refreshIntervalMonths: num,
  commissions: z.array(dailyCommissionSchema),
});
// U-391 地点签到：奖励是判别联合——三类奖励（灵石/功法/法宝）形状
// 互斥，strictObject + discriminatedUnion 保证一处签到只定一类奖励；
// 奖励内容引用（功法/法宝 id）与 fallback 的正数口径在加载自检里核。
const signInRewardSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("stones"), effect: commissionRewardSchema }),
  z.strictObject({ kind: z.literal("technique"), techniqueId: str, fallback: commissionRewardSchema }),
  z.strictObject({ kind: z.literal("artifact"), artifactId: str, fallback: commissionRewardSchema }),
]);
const signInSpotSchema = z.strictObject({
  id: str, locationId: str, tier: z.enum(["common", "rare", "epic"]),
  title: str, text: str, reward: signInRewardSchema,
});
// U-392：档位表三档齐备（寻常/稀有/绝世），每档带标签与故地重游
// 小奖（键与正数口径在加载自检里核）。
const signInTierSchema = z.strictObject({ label: str, revisit: commissionRewardSchema });
const signInsSchema = z.strictObject({
  tiers: z.strictObject({ common: signInTierSchema, rare: signInTierSchema, epic: signInTierSchema }),
  spots: z.array(signInSpotSchema),
});
// U-393 封印之蛋：出现概率与集齐门槛为顶层两数（口径在加载自检里
// 核），每枚蛋只定名号、埋藏地点与现身文案，不带任何奖励字段——
// 收集物本身不发奖励、线索也不发奖励，schema 层就保证这一点。
const sealedEggSchema = z.strictObject({
  id: str, locationId: str, name: str, text: str,
});
const sealedEggsSchema = z.strictObject({
  chancePct: num, clueThreshold: num,
  eggs: z.array(sealedEggSchema),
});
// U-394：外传包 schema——eventIds 只许是字符串数组（成员存在性与
// 互不重叠在加载自检里核）；本篇包的 eventIds 必须为空（本篇成员
// 是「未被外传认领」的余集，逐条列名只会与事件池双写漂移）。
const eventPackSchema = z.strictObject({
  id: str, name: str, desc: str, minLife: num,
  eventIds: z.array(str),
});
const eventPacksSchema = z.strictObject({
  packs: z.array(eventPackSchema),
});
// U-395：投放批次 schema——version/name/desc/eventIds 四键，批次
// 的版本口径（≥2、互不相同）与成员口径（非空、事件存在、不重复
// 认领）在加载自检里逐项核。
const eventReleaseBatchSchema = z.strictObject({
  version: num, name: str, desc: str,
  eventIds: z.array(str),
});
const eventReleasesSchema = z.strictObject({
  batches: z.array(eventReleaseBatchSchema),
});
// U-396：地点掉落表 schema——顶层掉落概率、三档档位表（标签 +
// 折作参悟的 fallback，只许既有 Effect 键）、逐地点掉落行（地点 /
// 品质档 / 功法）；档位与功法的派生品质一致性、地点/功法引用与
// fallback 正数口径在加载自检里逐项核。
const dropTierSchema = z.strictObject({ label: str, fallback: commissionRewardSchema });
const locationDropSchema = z.strictObject({
  locationId: str, tier: z.enum(["low", "mid", "high"]), techniqueId: str,
});
const locationDropsSchema = z.strictObject({
  chancePct: num,
  tiers: z.strictObject({ low: dropTierSchema, mid: dropTierSchema, high: dropTierSchema }),
  drops: z.array(locationDropSchema),
});
// U-608：细时钟耗时表 schema——monthsPerYear、八个动作耗时键（键
// 集由 strictObject 锁死，多键/缺键即拦）、逐目的地旅行月数（键
// 是地点 id、覆盖与取值范围在加载自检里逐项核）。
const timeCostsSchema = z.strictObject({
  monthsPerYear: num,
  costs: z.strictObject({
    cultivate: num, breakthrough: num, explore: num, rest: num,
    fight: num, craft: num, sectChore: num, social: num,
  }),
  travelMonths: z.record(z.string(), num),
});
const reincarnationPointsSchema = z.strictObject({
  grantByGrade: z.strictObject({ S: num, A: num, B: num, C: num }),
  attrCostPerPoint: num, attrCapPerAttr: num, resetCost: num,
  boons: z.array(boonSchema),
  shardTiers: z.array(z.strictObject({ min: num, points: num })),
});
// U-482：副职熟练度表 schema——每次熟练度、四档等级（等级号/名
// 称/所需使用次数）与四门副职各自的破限奖励行（等级/名号/说明/
// 产量加成%）；键集由 strictObject 锁死（四门缺一多一即拦），等
// 级连续性、门槛递增与破限覆盖在加载自检里逐项核。
const craftLevelSchema = z.strictObject({ level: num, name: str, minUses: num });
const craftBreakthroughSchema = z.strictObject({ level: num, label: str, desc: str, yieldPct: num });
const craftKindSchema = z.strictObject({ label: str, breakthroughs: z.array(craftBreakthroughSchema) });
const craftSkillsSchema = z.strictObject({
  proficiencyPerUse: num,
  levels: z.array(craftLevelSchema),
  kinds: z.strictObject({
    alchemy: craftKindSchema, forge: craftKindSchema, farm: craftKindSchema, fish: craftKindSchema,
  }),
});
// U-464：锻造法宝表 schema——「矿石品阶—判定—法宝产出」表：7 阶
// 矿石（与 U-499 的 7 阶矿石口径对齐，artifactRealm 恒等于 tier，
// 即该阶矿石锻出门槛为该境界的法宝，产出在加载自检里核对法宝池）；
// dc 为该阶锻造的副职检定基准难度（Q34 副职 d60 结算，属性与天赋
// 加成走 SKILL_CHECKS.craft.forge 同一链）；stoneCost 为锻造另付的
// 灵石（先付、失败不退）；buyPrice 为坊市购矿基准价（实际价走
// Q17 shopPrice 按境界分档）；dropWeight 为探索掉落的相对权重；
// dropChancePct 为际遇办妥后拾得矿石的概率（百分点）。
// U-619：minCraftLevel / minRealm 为炼制双门槛——开炉炼制该阶法宝
// 须炼器熟练度等级（U-482 craft-skills.json 的等级口径）与角色境
// 界（realms 下标）同时达标，缺哪项入口明示哪项、服务端同步拦截。
const forgeTierSchema = z.strictObject({
  tier: num, id: str, name: str, artifactRealm: num,
  dc: num, stoneCost: num, buyPrice: num, dropWeight: num,
  minCraftLevel: num, minRealm: num,
});
const forgeSchema = z.strictObject({
  dropChancePct: num,
  tiers: z.array(forgeTierSchema),
});
// U-620：多途径获取表 schema——掉落池（法宝 + 相对权重）、宗门赐
// 宝行（位阶 / 法宝 / 折作 / 文案）、委托赠宝行（委托 / 法宝 / 折
// 作 / 文案）；引用存在性、概率/权重取值与不重复口径在加载自检
// 里逐项核。occupiedFallback 只许既有 Effect 键（与委托奖励同形）。
const artifactSourcesSchema = z.strictObject({
  exploreDrop: z.strictObject({
    chancePct: num,
    pool: z.array(z.strictObject({ artifactId: str, weight: num })),
    occupiedFallback: commissionRewardSchema,
  }),
  sectGrants: z.array(z.strictObject({ rankId: str, artifactId: str, occupiedFallback: commissionRewardSchema, text: str })),
  commissionGrants: z.array(z.strictObject({ commissionId: str, artifactId: str, occupiedFallback: commissionRewardSchema, text: str })),
});
export interface ForgeTierDef { tier: number; id: string; name: string; artifactRealm: number; dc: number; stoneCost: number; buyPrice: number; dropWeight: number; minCraftLevel: number; minRealm: number }
export interface ForgeDef { dropChancePct: number; tiers: ForgeTierDef[] }
// U-620：本命法宝多途径获取配置表（来源 Q40，2026-11-16 第十一轮
// 定夺）——炼制（U-464/U-619）之外新增三条获取途径，全部进本表、
// 不凭空发宝：
// - exploreDrop 探索事件掉落：际遇办妥后按 chancePct 掷一次（与
//   U-396 残页、U-464 矿石并列的额外一掷），命中按 pool 权重从同
//   一 28 件法宝池里抽一件；
// - sectGrants 宗门赐宝：晋升到配置位阶时宗门赐下定死的一件；
// - commissionGrants 委托赠宝：配置内的委托结算时委托人额外赠
//   下定死的一件（委托原有奖励一字不改，赠宝是额外一层）。
// 三条途径共用 U-391 签到法宝的赋予口径：本命法宝槽空着才认主
// （走 grantArtifact 统一入口，U-618 门槛对齐——未达门槛封存、
// 达门槛生效）；槽已占则不替换，按各自 occupiedFallback（既有
// Effect）折作结算。签到（U-391）与遗藏（U-393 线索/取回）的既
// 有奖励口径不在本表、不动。text 为赐宝/赠宝的叙事文案（日志用）。
export interface ArtifactDropEntryDef { artifactId: string; weight: number }
export interface ArtifactSectGrantDef { rankId: string; artifactId: string; occupiedFallback: Effect; text: string }
export interface ArtifactCommissionGrantDef { commissionId: string; artifactId: string; occupiedFallback: Effect; text: string }
export interface ArtifactSourcesDef {
  exploreDrop: { chancePct: number; pool: ArtifactDropEntryDef[]; occupiedFallback: Effect };
  sectGrants: ArtifactSectGrantDef[];
  commissionGrants: ArtifactCommissionGrantDef[];
}
function load<T>(name: string, schema: z.ZodType<T>, raw: unknown): T {
  const r = schema.safeParse(raw);
  if (!r.success) {
    const first = r.error.issues[0];
    const where = first ? `${first.path.join(".") || "(root)"}: ${first.message}` : "unknown";
    throw new Error(`content: invalid config ${name}: ${where}`);
  }
  // 校验通过后返回原始解析值（不返回 zod 重组的对象）：字段顺序与值与
  // 配置文件逐字一致，校验只把关、不改形。
  return raw as T;
}

// ---------- 加载全部内容池 ----------

export const CLASSIC_REALMS: RealmDef[] = load("realms.json", realmsSchema, realmsJson).classicRealms;
export const ROOTS: RootDef[] = load("roots.json", z.array(rootSchema), rootsJson);
export const NAME_POOL: string[] = load("names.json", z.array(str), namesJson);
export const ORIGIN_POOL: string[] = load("origins.json", z.array(str), originsJson);
export const TALENTS: TalentDef[] = load("talents.json", z.array(talentSchema), talentsJson);
export const ARTIFACTS: ArtifactDef[] = load("artifacts.json", z.array(artifactSchema), artifactsJson);
export const TECHNIQUES: TechDef[] = load("techniques.json", z.array(techSchema), techniquesJson);
export const TREASURES: TreasureDef[] = load("treasures.json", z.array(treasureSchema), treasuresJson);
export const LOCATIONS: LocationDef[] = load("locations.json", z.array(locationSchema), locationsJson);
export const SECT_RANKS: SectRankDef[] = load("sect-ranks.json", z.array(sectRankSchema), sectRanksJson);
export const ENEMIES: EnemyDef[] = load("enemies.json", z.array(enemySchema), enemiesJson);
const mainline = load("mainline.json", mainlineSchema, mainlineJson);
export const MAINLINE_TOTAL_SHARDS: number = mainline.totalShards;
export const CAVE_UPGRADE_BASE: number[] = mainline.caveUpgradeBase;
export const MAINLINE_CHAPTERS: MainlineChapter[] = mainline.chapters;
export const SHOP: ShopDef = load("shop.json", shopSchema, shopJson);
export const NPCS: NpcDef[] = load("npcs.json", z.array(npcSchema), npcsJson);
// EVENTS 自 U-376 起由 events-base.ts 合并五分文件后提供（顶部已导入）。
export const DESTINIES: DestinyDef[] = load("destinies.json", z.array(destinySchema), destiniesJson);
export const REINCARNATION_POINTS: ReincarnationPointsDef = load("reincarnation-points.json", reincarnationPointsSchema, reincarnationPointsJson);
export const DAILY_EVENTS: DailyEventsDef = load("daily-events.json", dailyEventsSchema, dailyEventsJson);
export const COMMISSIONS: CommissionsDef = load("commissions.json", commissionsSchema, commissionsJson);
export const TIMED_EVENTS: TimedEventsDef = load("timed-events.json", timedEventsSchema, timedEventsJson);
export const DAILY_COMMISSIONS: DailyCommissionsDef = load("daily-commissions.json", dailyCommissionsSchema, dailyCommissionsJson);
export const SIGN_INS: SignInsDef = load("sign-ins.json", signInsSchema, signInsJson);
export const SEALED_EGGS: SealedEggsDef = load("sealed-eggs.json", sealedEggsSchema, sealedEggsJson);
export const EVENT_PACKS: EventPacksDef = load("event-packs.json", eventPacksSchema, eventPacksJson);
export const EVENT_RELEASES: EventReleasesDef = load("event-releases.json", eventReleasesSchema, eventReleasesJson);
export const LOCATION_DROPS: LocationDropsDef = load("location-drops.json", locationDropsSchema, locationDropsJson);
export const TIME_COSTS: TimeCostsDef = load("time-costs.json", timeCostsSchema, timeCostsJson);
export const CRAFT_SKILLS: CraftSkillsDef = load("craft-skills.json", craftSkillsSchema, craftSkillsJson);
export const FORGE: ForgeDef = load("forge.json", forgeSchema, forgeJson);
export const ARTIFACT_SOURCES: ArtifactSourcesDef = load("artifact-sources.json", artifactSourcesSchema, artifactSourcesJson);

// U-464：按阶位取矿石行（未知阶位返回 undefined，调用方不结算）。
export function forgeTierByTier(tier: number): ForgeTierDef | undefined {
  return FORGE.tiers.find((t) => t.tier === tier);
}

// U-464：某阶矿石能锻出的法宝候选——同一法宝池（artifacts.json）
// 里门槛境界恰为该阶 artifactRealm 的全部法宝，锻造不另立产出池、
// 不绕过 U-618 门槛（锻出后走 grantArtifact 统一赋予）。
export function forgeCandidatesFor(tierDef: ForgeTierDef): ArtifactDef[] {
  return ARTIFACTS.filter((a) => a.minRealm === tierDef.artifactRealm);
}

// U-620：按宗门位阶取赐宝行（该位阶无赐宝返回 undefined，晋升照
// 旧结算、不发宝）。
export function sectGrantForRank(rankId: string): ArtifactSectGrantDef | undefined {
  return ARTIFACT_SOURCES.sectGrants.find((g) => g.rankId === rankId);
}

// U-620：按委托 id 取赠宝行（该委托无赠宝返回 undefined，结算照
// 旧口径、只发原有奖励）。
export function commissionGrantFor(commissionId: string): ArtifactCommissionGrantDef | undefined {
  return ARTIFACT_SOURCES.commissionGrants.find((g) => g.commissionId === commissionId);
}

// U-482：某门副职在给定使用次数下的熟练度（派生量：次数 × 每次
// 熟练度，不另存字段）。
export function craftProficiencyFor(uses: number): number {
  return Math.max(0, Math.floor(uses)) * CRAFT_SKILLS.proficiencyPerUse;
}

// U-482：某门副职在给定使用次数下的等级行（取满足 minUses 的最
// 高档；等级表由加载自检保证首档 minUses=0，恒有行）。
export function craftLevelDefFor(uses: number): CraftLevelDef {
  let cur: CraftLevelDef = CRAFT_SKILLS.levels[0] ?? { level: 1, name: "入门", minUses: 0 };
  for (const l of CRAFT_SKILLS.levels) if (uses >= l.minUses) cur = l;
  return cur;
}

// U-482：下一等级行（已达最高档返回 null，供面板显示进度）。
export function craftNextLevelDef(uses: number): CraftLevelDef | null {
  const cur = craftLevelDefFor(uses);
  return CRAFT_SKILLS.levels.find((l) => l.level === cur.level + 1) ?? null;
}

// U-482：某门副职在给定等级下的破限产量加成%（取该等级对应的破
// 限行；入门档无加成 = 0）。未知副职返回 0（调用方只传四门）。
export function craftYieldPctFor(kind: string, level: number): number {
  if (!CRAFT_KINDS.includes(kind as CraftKind)) return 0;
  const def = CRAFT_SKILLS.kinds[kind as CraftKind];
  return def.breakthroughs.find((b) => b.level === level)?.yieldPct ?? 0;
}

// U-388：按 id 取委托定义（未知 id 返回 undefined，调用方不结算）。
export function commissionById(id: string): CommissionDef | undefined {
  return COMMISSIONS.commissions.find((d) => d.id === id);
}

// U-389：按 id 取限时帖定义（未知 id 返回 undefined，调用方不结算）。
export function timedEventById(id: string): TimedEventDef | undefined {
  return TIMED_EVENTS.postings.find((d) => d.id === id);
}

// U-390：按 id 取日常委托定义（未知 id 返回 undefined，调用方不结算）。
export function dailyCommissionById(id: string): DailyCommissionDef | undefined {
  return DAILY_COMMISSIONS.commissions.find((d) => d.id === id);
}

// U-391：按地点取签到点定义（一个地点至多一个签到点，加载自检保
// 证）；无签到点的地点返回 undefined，调用方不触发。
export function signInByLocation(locationId: string): SignInSpotDef | undefined {
  return SIGN_INS.spots.find((s) => s.locationId === locationId);
}

// U-392：按档位取档位定义（标签 + 故地重游小奖）；三档由 schema
// 保证齐备，恒有定义。
export function signInTierDef(tier: SignInTier): SignInTierDef {
  return SIGN_INS.tiers[tier];
}

// U-393：按地点取封印之蛋定义（一地点至多一枚，加载自检保证）；
// 没有蛋的地点返回 undefined，调用方不掷出现判定。
export function sealedEggAtLocation(locationId: string): SealedEggDef | undefined {
  return SEALED_EGGS.eggs.find((e) => e.locationId === locationId);
}

// U-394：事件所属的外传包（未被任何外传包认领的事件归本篇包——
// minLife 最小者；本篇包由加载自检保证恰有一个且 minLife 为 1）。
export function eventPackOf(eventId: string): EventPackDef {
  for (const p of EVENT_PACKS.packs) {
    if (p.eventIds.includes(eventId)) return p;
  }
  const base = EVENT_PACKS.packs.reduce((a, b) => (b.minLife < a.minLife ? b : a));
  return base;
}

// U-394：某事件在第 lifeNo 世是否已解锁（所属包的 minLife 不大于
// 本世世数）。牌堆建堆与抽取只按此判定成员，事件规则不动。
export function eventUnlockedForLife(eventId: string, lifeNo: number): boolean {
  return eventPackOf(eventId).minLife <= lifeNo;
}

// U-395：当前最新投放版本（配置表里最高批次；尚无新批次时为首发
// 的第 1 批）。新事件进池登记批次后，本值即随之推进。
export const CURRENT_EVENT_VERSION: number = EVENT_RELEASES.batches.reduce((m, b) => Math.max(m, b.version), 1);

// U-395：某事件的投放版本（被某批次认领则为该批次版本，未被认领
// 的是首发第 1 批）。新增事件进池时必须登记进批次（加载自检保证
// 一条事件至多被一个批次认领），标记只在本配置表一处维护。
export function eventReleaseVersion(eventId: string): number {
  for (const b of EVENT_RELEASES.batches) {
    if (b.eventIds.includes(eventId)) return b.version;
  }
  return 1;
}

// U-395：某事件是否已随投放版本 deckVersion 入世（投放版本不高于
// 本世牌堆版本）。牌堆建堆与抽牌本地点池按此判定成员——当世牌堆
// 版本在降生时落定，轮回开新世才推进到最新版本。
export function eventReleasedForDeck(eventId: string, deckVersion: number): boolean {
  return eventReleaseVersion(eventId) <= deckVersion;
}

// U-396：功法的品质档——由既有传承价派生（2 → 下品、3 → 中品、
// 4 → 上品），与功法池既有三档定价（修炼收益 +15/+20/+25%）一
// 一对应，不另立品质数值。
export function techniqueDropTier(t: TechDef): DropTier {
  return t.legacyCost <= 2 ? "low" : t.legacyCost === 3 ? "mid" : "high";
}

// U-396：按地点取掉落行（一地点至多一行，加载自检保证）；没有掉
// 落的地点返回 undefined，调用方不掷掉落判定。
export function locationDropAt(locationId: string): LocationDropDef | undefined {
  return LOCATION_DROPS.drops.find((d) => d.locationId === locationId);
}

// U-396：按档位取档位定义（标签 + 折作参悟 fallback）；三档由
// schema 保证齐备，恒有定义。
export function dropTierDef(tier: DropTier): DropTierDef {
  return LOCATION_DROPS.tiers[tier];
}

// U-608：某动作的耗时月数（配置表 costs；键集由 schema 锁死，恒有值）。
export function timeCostMonths(key: TimeCostKey): number {
  return TIME_COSTS.costs[key];
}

// U-608：前往某目的地的旅行耗时月数（配置表 travelMonths，加载自
// 检保证每个现有地点恰有一行）；未知地点回退 1（调用方 travel 已
// 先校验地点存在，此回退只是防御）。
export function travelMonthsTo(locationId: string): number {
  return TIME_COSTS.travelMonths[locationId] ?? 1;
}

// U-002：本世评级 → 本次轮回结算发放的轮回点（档位出自配置表；
// 未知评级不发放，不静默给档）。
export function reincarnationPointsForGrade(grade: string): number {
  const g = REINCARNATION_POINTS.grantByGrade;
  return grade === "S" ? g.S : grade === "A" ? g.A : grade === "B" ? g.B : grade === "C" ? g.C : 0;
}

// U-021：按 id 取「再战天道」强化项（未知 id 返回 undefined，调用方不结算）。
export function birthBoonById(id: string): BirthBoonDef | undefined {
  return REINCARNATION_POINTS.boons.find((b) => b.id === id);
}

// U-322：本世新收集的记忆碎片数 → 本次轮回结算的主线碎片档发放
// （分档出自配置表 shardTiers，取满足的最高档；未达最低档不发放）。
export function reincarnationPointsForShards(newShards: number): number {
  let points = 0;
  for (const t of REINCARNATION_POINTS.shardTiers) {
    if (newShards >= t.min) points = t.points;
  }
  return points;
}

// ---------- 跨池引用完整性自检（模块加载即跑，非法即抛错） ----------

function assertContentIntegrity(): void {
  const bad = (why: string) => new Error(`content: integrity check failed: ${why}`);
  const unique = (pool: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) { if (seen.has(id)) throw bad(`${pool} duplicate id ${id}`); seen.add(id); }
  };
  unique("roots", ROOTS.map((r) => r.id));
  unique("talents", TALENTS.map((t) => t.id));
  unique("artifacts", ARTIFACTS.map((a) => a.id));
  // U-618：法宝境界门槛自检——每件必须带合法门槛（整数境界序号、
  // 落在经典九境范围内）；缺失已由 schema 必填拦下，此处拦越界值。
  for (const a of ARTIFACTS) {
    if (!Number.isInteger(a.minRealm) || a.minRealm < 0 || a.minRealm >= CLASSIC_REALMS.length) throw bad(`artifact ${a.id} has invalid minRealm ${String(a.minRealm)}`);
    // U-617：fx 若声明必须非空（空对象等于没效果，属配置笔误）；
    // craftKind 只能修饰 craftPct（单写 craftKind 没有任何效果）。
    if (a.fx) {
      if (Object.keys(a.fx).length === 0) throw bad(`artifact ${a.id} has empty fx`);
      if (a.fx.craftKind !== undefined && a.fx.craftPct === undefined) throw bad(`artifact ${a.id} fx.craftKind without craftPct`);
      if (a.fx.bonus && Object.keys(a.fx.bonus).length === 0) throw bad(`artifact ${a.id} has empty fx.bonus`);
    }
  }
  unique("techniques", TECHNIQUES.map((t) => t.id));
  unique("treasures", TREASURES.map((t) => t.id));
  unique("locations", LOCATIONS.map((l) => l.id));
  unique("sect-ranks", SECT_RANKS.map((r) => r.id));
  unique("enemies", ENEMIES.map((e) => e.id));
  unique("npcs", NPCS.map((n) => n.id));
  unique("events", EVENTS.map((e) => e.id));
  unique("destinies", DESTINIES.map((d) => d.id));
  unique("names", NAME_POOL);
  unique("origins", ORIGIN_POOL);
  const locIds = new Set(LOCATIONS.map((l) => l.id));
  const npcIds = new Set(NPCS.map((n) => n.id));
  // U-375 补做：事件稀有度权重自检——每条 commonality 必须为有限
  // 非负数，且与按最高难度分出的档位权重（EVENT_RARITY）逐条一致；
  // 错档（比如稀有事件误标常见权重）在加载时即抛错，不静默放行。
  for (const ev of EVENTS) {
    const w = ev.commonality;
    if (typeof w !== "number" || !Number.isFinite(w) || w < 0) throw bad(`event ${ev.id} has invalid commonality ${String(w)}`);
    const expected = EVENT_RARITY.weights[eventRarityTier(ev)];
    if (w !== expected) throw bad(`event ${ev.id} commonality ${w} does not match its rarity tier weight ${expected}`);
  }
  for (const ev of EVENTS) {
    for (const loc of ev.locations) if (!locIds.has(loc)) throw bad(`event ${ev.id} references unknown location ${loc}`);
    for (const opt of ev.options) {
      for (const rel of [opt.relOk, opt.relFail]) {
        if (rel && !npcIds.has(rel.npc)) throw bad(`event ${ev.id} references unknown npc ${rel.npc}`);
      }
    }
  }
  for (const e of ENEMIES) for (const loc of e.locations) if (!locIds.has(loc)) throw bad(`enemy ${e.id} references unknown location ${loc}`);
  if (MAINLINE_CHAPTERS.length === 0) throw bad("mainline chapters empty");
  for (let i = 1; i < MAINLINE_CHAPTERS.length; i++) {
    const prev = MAINLINE_CHAPTERS[i - 1]; const cur = MAINLINE_CHAPTERS[i];
    if (prev && cur && cur.need <= prev.need) throw bad("mainline chapter needs must strictly increase");
  }
  const lastChapter = MAINLINE_CHAPTERS[MAINLINE_CHAPTERS.length - 1];
  if (lastChapter && lastChapter.need !== MAINLINE_TOTAL_SHARDS) throw bad("last mainline chapter need must equal totalShards");
  if (CAVE_UPGRADE_BASE.length === 0) throw bad("caveUpgradeBase empty");
  // U-384：经营日常触发概率自检——必须是 (0, 100] 的百分比数值，
  // 0 会让触发形式形同虚设、超过 100 无意义，加载即拦下。
  if (!(DAILY_EVENTS.chancePct > 0) || DAILY_EVENTS.chancePct > 100) throw bad(`daily-events chancePct ${DAILY_EVENTS.chancePct} out of range (0, 100]`);
  // U-388：委托板自检——张贴数/可接数为正整数且可接数不小于张贴数
  // 的一半（板别空转）；委托 id 唯一，委托人必须是现有 NPC、张贴处
  // 与目标地点必须是现有地点、宗门差事目标地点必须是青云山门（差
  // 事只能在山门办）、目标次数为正整数、奖励至少一项且各项为正数
  // （委托是付出后得报酬，不许倒扣）、结缘 NPC 必须存在。
  if (!Number.isInteger(COMMISSIONS.boardSize) || COMMISSIONS.boardSize <= 0) throw bad("commissions boardSize must be a positive integer");
  if (!Number.isInteger(COMMISSIONS.maxActive) || COMMISSIONS.maxActive <= 0) throw bad("commissions maxActive must be a positive integer");
  if (COMMISSIONS.commissions.length < COMMISSIONS.boardSize) throw bad("commissions pool smaller than boardSize");
  unique("commissions", COMMISSIONS.commissions.map((d) => d.id));
  for (const d of COMMISSIONS.commissions) {
    if (!npcIds.has(d.issuerNpc)) throw bad(`commission ${d.id} references unknown issuer npc ${d.issuerNpc}`);
    if (!locIds.has(d.boardLocationId)) throw bad(`commission ${d.id} references unknown board location ${d.boardLocationId}`);
    if (!locIds.has(d.locationId)) throw bad(`commission ${d.id} references unknown location ${d.locationId}`);
    if (d.objective.kind === "sectChore" && d.locationId !== "sect") throw bad(`commission ${d.id} sectChore objective must target sect`);
    if (!Number.isInteger(d.objective.need) || d.objective.need <= 0) throw bad(`commission ${d.id} objective need must be a positive integer`);
    const rewardVals = Object.values(d.reward);
    if (rewardVals.length === 0 || rewardVals.some((v) => typeof v !== "number" || !(v > 0))) throw bad(`commission ${d.id} reward must have positive values`);
    if (d.relOk && !npcIds.has(d.relOk.npc)) throw bad(`commission ${d.id} references unknown relOk npc ${d.relOk.npc}`);
  }
  // U-389：限时事件自检——与委托板同一批引用完整性（发布人/张贴处/
  // 目标地点/差事地点），另加限时口径：接取时限（limitDays）与挂
  // 帖时限（postDays）为正整数天数、天数折月口径（daysPerMonth，
  // U-610）为正整数、目标次数为正整数、奖励至少一项且
  // 各项为正数；声望四段逐段核——每段至少一项非零（四段都必须真
  // 的影响声望）、接/成段不得为负、不接/败段不得为正、数值必须为
  // 整数（声望只落既有 bond/sectContrib 字段，不新设货币）。
  if (!Number.isInteger(TIMED_EVENTS.boardSize) || TIMED_EVENTS.boardSize <= 0) throw bad("timed-events boardSize must be a positive integer");
  if (!Number.isInteger(TIMED_EVENTS.maxActive) || TIMED_EVENTS.maxActive <= 0) throw bad("timed-events maxActive must be a positive integer");
  if (!Number.isInteger(TIMED_EVENTS.daysPerMonth) || TIMED_EVENTS.daysPerMonth <= 0) throw bad("timed-events daysPerMonth must be a positive integer");
  if (TIMED_EVENTS.postings.length < TIMED_EVENTS.boardSize) throw bad("timed-events pool smaller than boardSize");
  unique("timed-events", TIMED_EVENTS.postings.map((d) => d.id));
  for (const d of TIMED_EVENTS.postings) {
    if (!npcIds.has(d.issuerNpc)) throw bad(`timed-event ${d.id} references unknown issuer npc ${d.issuerNpc}`);
    if (!locIds.has(d.boardLocationId)) throw bad(`timed-event ${d.id} references unknown board location ${d.boardLocationId}`);
    if (!locIds.has(d.locationId)) throw bad(`timed-event ${d.id} references unknown location ${d.locationId}`);
    if (d.objective.kind === "sectChore" && d.locationId !== "sect") throw bad(`timed-event ${d.id} sectChore objective must target sect`);
    if (!Number.isInteger(d.objective.need) || d.objective.need <= 0) throw bad(`timed-event ${d.id} objective need must be a positive integer`);
    if (!Number.isInteger(d.limitDays) || d.limitDays <= 0) throw bad(`timed-event ${d.id} limitDays must be a positive integer`);
    if (!Number.isInteger(d.postDays) || d.postDays <= 0) throw bad(`timed-event ${d.id} postDays must be a positive integer`);
    const rewardVals = Object.values(d.reward);
    if (rewardVals.length === 0 || rewardVals.some((v) => typeof v !== "number" || !(v > 0))) throw bad(`timed-event ${d.id} reward must have positive values`);
    const stages = [["accept", d.rep.accept, 1], ["success", d.rep.success, 1], ["ignore", d.rep.ignore, -1], ["fail", d.rep.fail, -1]] as const;
    for (const [stage, delta, sign] of stages) {
      const vals = [delta.bond, delta.sect].filter((v) => v !== undefined);
      if (vals.length === 0 || vals.every((v) => v === 0)) throw bad(`timed-event ${d.id} rep.${stage} must move reputation`);
      for (const v of vals) {
        if (!Number.isInteger(v)) throw bad(`timed-event ${d.id} rep.${stage} must be integers`);
        if (sign > 0 && v < 0) throw bad(`timed-event ${d.id} rep.${stage} must not be negative`);
        if (sign < 0 && v > 0) throw bad(`timed-event ${d.id} rep.${stage} must not be positive`);
      }
    }
  }
  // U-390：日常委托事件池自检——每批条数为正整数、池不小于一批；
  // U-611：刷新间隔（月）为正整数；
  // 委托 id 唯一，地点必须是现有地点、引用的事件必须存在且在该地
  // 点出没（进入地点即触发的前提）；引用的事件不得是每世一次的
  // cave_takeover（其专用结算不走日常口径），也不得带 loop 选项
  // （见好就收的抉择链不进日常结算口径，保证办妥判定只走普通选项
  // 的一次掷骰成败）；奖励至少一项且各项为正数，且按来源核口径——
  // 天庭朋友圈给稀有材料（灵石/修为等资源，不得夹带碎片）、地府委
  // 托必须给前世线索（shard ≥ 1，走既有记忆碎片字段）。
  if (!Number.isInteger(DAILY_COMMISSIONS.batchSize) || DAILY_COMMISSIONS.batchSize <= 0) throw bad("daily-commissions batchSize must be a positive integer");
  // U-611：刷新间隔（月）必须为正整数——0/负数会让每批刚刷新就过期、
  // 非整数与累计月份口径对不齐，加载即拦。
  if (!Number.isInteger(DAILY_COMMISSIONS.refreshIntervalMonths) || DAILY_COMMISSIONS.refreshIntervalMonths <= 0) throw bad("daily-commissions refreshIntervalMonths must be a positive integer");
  if (DAILY_COMMISSIONS.commissions.length < DAILY_COMMISSIONS.batchSize) throw bad("daily-commissions pool smaller than batchSize");
  unique("daily-commissions", DAILY_COMMISSIONS.commissions.map((d) => d.id));
  for (const d of DAILY_COMMISSIONS.commissions) {
    if (!locIds.has(d.locationId)) throw bad(`daily-commission ${d.id} references unknown location ${d.locationId}`);
    const ev = EVENTS.find((e) => e.id === d.eventId);
    if (!ev) throw bad(`daily-commission ${d.id} references unknown event ${d.eventId}`);
    if (!ev.locations.includes(d.locationId)) throw bad(`daily-commission ${d.id} event ${d.eventId} does not occur at ${d.locationId}`);
    if (d.eventId === "cave_takeover") throw bad(`daily-commission ${d.id} must not reference cave_takeover`);
    if (ev.options.some((o) => o.loop)) throw bad(`daily-commission ${d.id} event ${d.eventId} has loop options`);
    const rewardVals = Object.values(d.reward);
    if (rewardVals.length === 0 || rewardVals.some((v) => typeof v !== "number" || !(v > 0))) throw bad(`daily-commission ${d.id} reward must have positive values`);
    if (d.source === "heaven" && d.reward.shard) throw bad(`daily-commission ${d.id} heaven reward must be materials, not shards`);
    if (d.source === "underworld" && !(d.reward.shard && d.reward.shard >= 1)) throw bad(`daily-commission ${d.id} underworld reward must grant a past-life clue (shard >= 1)`);
  }
  // U-391：地点签到自检——签到点 id 唯一、一个地点至多一个签到点
  // （同一地点不重复签到的结构前提）、地点必须是现有地点；奖励三
  // 类逐类核引用与口径：灵石类只许 stones 一键且为正数（签到给的
  // 是灵石，不夹带别的资源）；功法类引用的功法必须存在于功法池；
  // 法宝类引用的法宝必须存在于法宝池；功法/法宝类的 fallback 至
  // 少一项且各项为正数（折作结算也是给东西，不许倒扣）。
  unique("sign-ins", SIGN_INS.spots.map((s) => s.id));
  unique("sign-ins.locations", SIGN_INS.spots.map((s) => s.locationId));
  const techIds = new Set(TECHNIQUES.map((t) => t.id));
  const artifactIds = new Set(ARTIFACTS.map((a) => a.id));
  for (const s of SIGN_INS.spots) {
    if (!locIds.has(s.locationId)) throw bad(`sign-in ${s.id} references unknown location ${s.locationId}`);
    const r = s.reward;
    if (r.kind === "stones") {
      const keys = Object.keys(r.effect);
      if (keys.length !== 1 || !(r.effect.stones && r.effect.stones > 0)) throw bad(`sign-in ${s.id} stones reward must be exactly { stones: >0 }`);
    } else {
      if (r.kind === "technique" && !techIds.has(r.techniqueId)) throw bad(`sign-in ${s.id} references unknown technique ${r.techniqueId}`);
      if (r.kind === "artifact" && !artifactIds.has(r.artifactId)) throw bad(`sign-in ${s.id} references unknown artifact ${r.artifactId}`);
      const fbVals = Object.values(r.fallback);
      if (fbVals.length === 0 || fbVals.some((v) => typeof v !== "number" || !(v > 0))) throw bad(`sign-in ${s.id} fallback must have positive values`);
    }
  }
  // U-392：签到图鉴分档自检——三档（schema 保证齐备）逐档核故地重
  // 游小奖：至少一项、只许灵石/修为两键（小奖是小额物资，不夹带
  // 碎片/寿元等）、各项为正数；且必须真的「小」——每档小奖总量须
  // 严格小于该档每个签到点的大奖参照总量（灵石类取 effect 总量、
  // 功法/法宝类取 fallback 总量），保证「不再重复给大奖、只给小
  // 额奖励」是配置层面的硬约束而非文案承诺。每档至少要有一个签
  // 到点用到（档位表不留空档）。
  const effectSum = (e: Effect): number => Object.values(e).reduce((a, v) => a + (typeof v === "number" ? v : 0), 0);
  for (const tier of ["common", "rare", "epic"] as const) {
    const td = SIGN_INS.tiers[tier];
    const rKeys = Object.keys(td.revisit);
    if (rKeys.length === 0 || rKeys.some((k) => k !== "stones" && k !== "cult")) throw bad(`sign-in tier ${tier} revisit must use only stones/cult keys`);
    const rVals = Object.values(td.revisit);
    if (rVals.some((v) => typeof v !== "number" || !(v > 0))) throw bad(`sign-in tier ${tier} revisit values must be positive`);
    const tierSpots = SIGN_INS.spots.filter((s) => s.tier === tier);
    if (tierSpots.length === 0) throw bad(`sign-in tier ${tier} has no spots`);
    const revisitSum = effectSum(td.revisit);
    for (const s of tierSpots) {
      const grandRef = s.reward.kind === "stones" ? effectSum(s.reward.effect) : effectSum(s.reward.fallback);
      if (!(revisitSum < grandRef)) throw bad(`sign-in tier ${tier} revisit total ${revisitSum} must be smaller than spot ${s.id} grand reference ${grandRef}`);
    }
  }
  // U-393：封印之蛋自检——出现概率为 (0, 100] 的整数、集齐门槛为
  // 正整数、蛋的总数不少于门槛（否则线索永远换不出）；蛋 id 唯
  // 一、一地点至多一枚（拾取按地点定位的结构前提）、埋藏地点必
  // 须是现有地点。蛋本身不带奖励字段（schema 已保证），线索只提
  // 示地点、不发奖励的口径在 state.ts 的结算里落实。
  if (!Number.isInteger(SEALED_EGGS.chancePct) || SEALED_EGGS.chancePct <= 0 || SEALED_EGGS.chancePct > 100) throw bad("sealed-eggs chancePct must be an integer in (0, 100]");
  if (!Number.isInteger(SEALED_EGGS.clueThreshold) || SEALED_EGGS.clueThreshold <= 0) throw bad("sealed-eggs clueThreshold must be a positive integer");
  if (SEALED_EGGS.eggs.length < SEALED_EGGS.clueThreshold) throw bad("sealed-eggs pool smaller than clueThreshold");
  unique("sealed-eggs", SEALED_EGGS.eggs.map((e) => e.id));
  unique("sealed-eggs.locations", SEALED_EGGS.eggs.map((e) => e.locationId));
  for (const e of SEALED_EGGS.eggs) {
    if (!locIds.has(e.locationId)) throw bad(`sealed-egg ${e.id} references unknown location ${e.locationId}`);
  }
  // U-394：外传分包自检——包 id 唯一；minLife 为正整数且互不相同
  // （两包同世解锁无法分辨先后）；恰有一个 minLife 为 1 的本篇包
  // 且它不得列 eventIds（本篇成员是余集）；外传包必须非空（空包
  // 解锁了个寂寞）、成员事件必须存在于事件池、同一事件不得被两
  // 个外传包重复认领。
  unique("event-packs", EVENT_PACKS.packs.map((p) => p.id));
  const packMinLives = EVENT_PACKS.packs.map((p) => p.minLife);
  if (new Set(packMinLives).size !== packMinLives.length) throw bad("event-packs minLife values must be distinct");
  const basePacks = EVENT_PACKS.packs.filter((p) => p.minLife === 1);
  if (basePacks.length !== 1) throw bad(`event-packs must have exactly one base pack with minLife 1, got ${basePacks.length}`);
  const eventIds = new Set(EVENTS.map((e) => e.id));
  const claimed = new Set<string>();
  for (const p of EVENT_PACKS.packs) {
    if (!Number.isInteger(p.minLife) || p.minLife <= 0) throw bad(`event-pack ${p.id} minLife must be a positive integer`);
    if (p.minLife === 1) {
      if (p.eventIds.length !== 0) throw bad(`event-pack ${p.id} is the base pack (minLife 1) and must not list eventIds (base membership is the complement)`);
      continue;
    }
    if (p.eventIds.length === 0) throw bad(`event-pack ${p.id} has no events (an unlockable pack must not be empty)`);
    for (const id of p.eventIds) {
      if (!eventIds.has(id)) throw bad(`event-pack ${p.id} references unknown event ${id}`);
      if (claimed.has(id)) throw bad(`event ${id} is claimed by more than one event pack`);
      claimed.add(id);
    }
  }
  // U-395：投放批次自检——版本必须为 ≥2 的整数（第 1 批是首发余
  // 集、不许显式登记，避免与余集口径双写漂移）且互不相同；批次
  // 必须非空（空批次投放了个寂寞）、成员事件必须存在于事件池、
  // 同一事件不得被两个批次重复认领（版本标记必须唯一确定）。
  const releaseVersions = EVENT_RELEASES.batches.map((b) => b.version);
  if (new Set(releaseVersions).size !== releaseVersions.length) throw bad("event-releases versions must be distinct");
  const releaseClaimed = new Set<string>();
  for (const b of EVENT_RELEASES.batches) {
    if (!Number.isInteger(b.version) || b.version < 2) throw bad(`event-release batch ${b.name} version must be an integer >= 2 (version 1 is the implicit launch batch)`);
    if (b.eventIds.length === 0) throw bad(`event-release batch v${b.version} has no events (a release batch must not be empty)`);
    for (const id of b.eventIds) {
      if (!eventIds.has(id)) throw bad(`event-release batch v${b.version} references unknown event ${id}`);
      if (releaseClaimed.has(id)) throw bad(`event ${id} is claimed by more than one release batch`);
      releaseClaimed.add(id);
    }
  }
  // U-396：地点掉落表自检——掉落概率为 (0, 100] 的整数；一地点
  // 至多一行掉落（按地点定位掉落的结构前提）、地点必须是现有地
  // 点、功法必须是现有功法；配置的品质档必须与功法既有传承价派
  // 生的品质档一致（地点只决定品质档，档不能靠文案虚标）；三档
  // 逐档核——标签非空（schema 已保证）、折作参悟 fallback 至少一
  // 项且各项为正数（折作也是给东西，不许倒扣）、每档至少被一个
  // 地点用到（档位表不留空档）；且三档的 fallback 总量须随档位
  // 严格递增（上品残页的参悟价值必须真的高于下品，与「不同地点
  // 掉不同品质」的口径在配置层面对齐）。
  if (!Number.isInteger(LOCATION_DROPS.chancePct) || LOCATION_DROPS.chancePct <= 0 || LOCATION_DROPS.chancePct > 100) throw bad("location-drops chancePct must be an integer in (0, 100]");
  unique("location-drops.locations", LOCATION_DROPS.drops.map((d) => d.locationId));
  const dropTechIds = new Set(TECHNIQUES.map((t) => t.id));
  const dropTierSums: Record<DropTier, number> = { low: 0, mid: 0, high: 0 };
  for (const tier of ["low", "mid", "high"] as const) {
    const td = LOCATION_DROPS.tiers[tier];
    const fbVals = Object.values(td.fallback);
    if (fbVals.length === 0 || fbVals.some((v) => typeof v !== "number" || !(v > 0))) throw bad(`location-drops tier ${tier} fallback must have positive values`);
    dropTierSums[tier] = fbVals.reduce((a, v) => a + (typeof v === "number" ? v : 0), 0);
    if (!LOCATION_DROPS.drops.some((d) => d.tier === tier)) throw bad(`location-drops tier ${tier} has no locations`);
  }
  if (!(dropTierSums.low < dropTierSums.mid && dropTierSums.mid < dropTierSums.high)) throw bad("location-drops tier fallback totals must strictly increase (low < mid < high)");
  for (const d of LOCATION_DROPS.drops) {
    if (!locIds.has(d.locationId)) throw bad(`location-drop at ${d.locationId} references unknown location`);
    if (!dropTechIds.has(d.techniqueId)) throw bad(`location-drop at ${d.locationId} references unknown technique ${d.techniqueId}`);
    const tech = TECHNIQUES.find((t) => t.id === d.techniqueId);
    if (tech && techniqueDropTier(tech) !== d.tier) throw bad(`location-drop at ${d.locationId} tier ${d.tier} does not match technique ${d.techniqueId} derived tier ${techniqueDropTier(tech)}`);
  }
  // U-608：细时钟耗时表自检——1 年必须恰为 12 个月（Q37 定夺的
  // 换算基数，年龄推导与旧存档迁移都按它算，不许配置漂移）；八
  // 个动作耗时必须为 [1, 12] 的整数（至少 1 个月——行动不能不耗
  // 时；至多 12 个月——单个动作不超过一年，与草稿锚点修炼 12 月
  // 对齐）；旅行表必须恰好覆盖全部现有地点（不多不少：漏一个地
  // 点旅行就没耗时、多一个就是引用了不存在的地点），每行耗时
  // 为 [1, 6] 的整数（Q37 草稿的旅行 1–6 月区间）。
  if (TIME_COSTS.monthsPerYear !== 12) throw bad(`time-costs monthsPerYear must be exactly 12 (got ${TIME_COSTS.monthsPerYear})`);
  for (const [k, v] of Object.entries(TIME_COSTS.costs)) {
    if (!Number.isInteger(v) || v < 1 || v > TIME_COSTS.monthsPerYear) throw bad(`time-costs cost ${k} must be an integer in [1, ${TIME_COSTS.monthsPerYear}] (got ${v})`);
  }
  const travelIds = Object.keys(TIME_COSTS.travelMonths);
  if (travelIds.length !== LOCATIONS.length) throw bad(`time-costs travelMonths must cover exactly the ${LOCATIONS.length} locations (got ${travelIds.length})`);
  for (const id of travelIds) {
    if (!locIds.has(id)) throw bad(`time-costs travelMonths references unknown location ${id}`);
    const v = TIME_COSTS.travelMonths[id];
    if (v === undefined || !Number.isInteger(v) || v < 1 || v > 6) throw bad(`time-costs travelMonths ${id} must be an integer in [1, 6] (got ${v})`);
  }
  for (const l of LOCATIONS) {
    if (!(l.id in TIME_COSTS.travelMonths)) throw bad(`time-costs travelMonths missing location ${l.id}`);
  }
  // U-002：轮回点配置表自检——发放档位与价格必须为正整数。
  const rp = REINCARNATION_POINTS;
  for (const [k, v] of Object.entries({ ...rp.grantByGrade, attrCostPerPoint: rp.attrCostPerPoint, attrCapPerAttr: rp.attrCapPerAttr, resetCost: rp.resetCost })) {
    if (!Number.isInteger(v) || v <= 0) throw bad(`reincarnation-points ${k} must be a positive integer`);
  }
  // U-021：强化项自检——id 唯一、价格为正整数、效果至少一项且各项为正数。
  unique("reincarnation-points.boons", rp.boons.map((b) => b.id));
  for (const b of rp.boons) {
    if (!Number.isInteger(b.cost) || b.cost <= 0) throw bad(`reincarnation-points boon ${b.id} cost must be a positive integer`);
    const vals = Object.values(b.effect);
    if (vals.length === 0 || vals.some((v) => typeof v !== "number" || !(v > 0))) throw bad(`reincarnation-points boon ${b.id} effect must have positive values`);
  }
  // U-322：碎片分档自检——至少一档、门槛为正整数且严格递增、不超过
  // 碎片总数、发放为正整数且不随档位递减（高档不得低于低档）。
  if (rp.shardTiers.length === 0) throw bad("reincarnation-points shardTiers empty");
  for (let i = 0; i < rp.shardTiers.length; i++) {
    const t = rp.shardTiers[i];
    if (!t) throw bad("reincarnation-points shardTiers hole");
    if (!Number.isInteger(t.min) || t.min < 1 || t.min > MAINLINE_TOTAL_SHARDS) throw bad(`reincarnation-points shardTier min ${t.min} out of range`);
    if (!Number.isInteger(t.points) || t.points <= 0) throw bad(`reincarnation-points shardTier points ${t.points} must be a positive integer`);
    const prev = i > 0 ? rp.shardTiers[i - 1] : undefined;
    if (prev) {
      if (t.min <= prev.min) throw bad("reincarnation-points shardTier mins must strictly increase");
      if (t.points < prev.points) throw bad("reincarnation-points shardTier points must not decrease");
    }
  }
  // U-482：副职熟练度表自检——每次熟练度为正整数；等级至少两档、
  // 等级号自 1 连续、首档门槛为 0（新角色恒有等级）、门槛为非负整
  // 数且严格递增；每门副职的破限行须恰好覆盖 2..最高档各一行、
  // 产量加成为正整数且不越平衡上限（60%，与既有副职类法宝
  // craftPct 上限 40 同量级再留一级头寸）、随等级严格递增（高
  // 档不得弱于低档）。四门键集已由 schema 的 strictObject 锁死。
  const cs = CRAFT_SKILLS;
  if (!Number.isInteger(cs.proficiencyPerUse) || cs.proficiencyPerUse <= 0) throw bad(`craft-skills proficiencyPerUse must be a positive integer (got ${cs.proficiencyPerUse})`);
  if (cs.levels.length < 2) throw bad("craft-skills levels must have at least 2 tiers");
  for (let i = 0; i < cs.levels.length; i++) {
    const l = cs.levels[i];
    if (!l) throw bad("craft-skills levels hole");
    if (l.level !== i + 1) throw bad(`craft-skills level numbers must be consecutive from 1 (row ${i} has ${l.level})`);
    if (!Number.isInteger(l.minUses) || l.minUses < 0) throw bad(`craft-skills level ${l.level} minUses must be a non-negative integer`);
    if (i === 0 && l.minUses !== 0) throw bad("craft-skills first level minUses must be 0");
    const prev = i > 0 ? cs.levels[i - 1] : undefined;
    if (prev && l.minUses <= prev.minUses) throw bad("craft-skills level minUses must strictly increase");
  }
  const maxCraftLevel = cs.levels.length;
  for (const kind of CRAFT_KINDS) {
    const def = cs.kinds[kind];
    if (def.breakthroughs.length !== maxCraftLevel - 1) throw bad(`craft-skills ${kind} breakthroughs must cover levels 2..${maxCraftLevel} exactly once`);
    const seenLevels = new Set<number>();
    let prevYield = 0;
    for (const b of [...def.breakthroughs].sort((a, b2) => a.level - b2.level)) {
      if (!Number.isInteger(b.level) || b.level < 2 || b.level > maxCraftLevel) throw bad(`craft-skills ${kind} breakthrough level ${b.level} out of range`);
      if (seenLevels.has(b.level)) throw bad(`craft-skills ${kind} duplicate breakthrough level ${b.level}`);
      seenLevels.add(b.level);
      if (!Number.isInteger(b.yieldPct) || b.yieldPct <= 0 || b.yieldPct > 60) throw bad(`craft-skills ${kind} breakthrough level ${b.level} yieldPct must be an integer in [1, 60]`);
      if (b.yieldPct <= prevYield) throw bad(`craft-skills ${kind} breakthrough yieldPct must strictly increase with level`);
      prevYield = b.yieldPct;
    }
  }
  // U-464：锻造表自检——恰 7 阶（与 U-499 的 7 阶矿石口径对齐）、
  // 阶号自 1 连续、id 唯一、artifactRealm 恒等于阶号（该阶矿石锻
  // 出该境界门槛的法宝）；难度/灵石代价/坊市价/掉落权重均为正整
  // 数且难度随阶严格递增（高阶更难锻）；每一阶在同一法宝池里至
  // 少有一件可锻法宝（产出走法宝池，池里无货的阶位不许存在）；
  // 探索掉矿概率为 (0, 100] 的整数百分点。
  const fg = FORGE;
  if (!Number.isInteger(fg.dropChancePct) || fg.dropChancePct <= 0 || fg.dropChancePct > 100) throw bad(`forge dropChancePct must be an integer in (0, 100] (got ${fg.dropChancePct})`);
  if (fg.tiers.length !== 7) throw bad(`forge tiers must be exactly 7 (got ${fg.tiers.length})`);
  const seenOreIds = new Set<string>();
  for (let i = 0; i < fg.tiers.length; i++) {
    const t = fg.tiers[i];
    if (!t) throw bad("forge tiers hole");
    if (t.tier !== i + 1) throw bad(`forge tier numbers must be consecutive from 1 (row ${i} has ${t.tier})`);
    if (seenOreIds.has(t.id)) throw bad(`forge duplicate ore id ${t.id}`);
    seenOreIds.add(t.id);
    if (t.artifactRealm !== t.tier) throw bad(`forge tier ${t.tier} artifactRealm must equal its tier (got ${t.artifactRealm})`);
    for (const f of ["dc", "stoneCost", "buyPrice", "dropWeight"] as const) {
      if (!Number.isInteger(t[f]) || t[f] <= 0) throw bad(`forge tier ${t.tier} ${f} must be a positive integer (got ${t[f]})`);
    }
    const prev = i > 0 ? fg.tiers[i - 1] : undefined;
    if (prev && t.dc <= prev.dc) throw bad("forge tier dc must strictly increase with tier");
    if (forgeCandidatesFor(t).length === 0) throw bad(`forge tier ${t.tier} has no artifacts in the shared pool at realm ${t.artifactRealm}`);
    // U-619：炼制双门槛自检——炼器等级须落在副职等级表内、境界须
    // 落在经典九境下标内且不高于所锻法宝的门槛境界（提前一境锻造
    // 是 minRealm = artifactRealm − 1 的既定口径，锻出先封存）；
    // 两道门槛随阶位单调不减，高阶不得比低阶更好开炉。
    const maxCraftLevel = CRAFT_SKILLS.levels.reduce((m, l) => Math.max(m, l.level), 0);
    if (!Number.isInteger(t.minCraftLevel) || t.minCraftLevel < 1 || t.minCraftLevel > maxCraftLevel) throw bad(`forge tier ${t.tier} minCraftLevel must be an integer in [1, ${maxCraftLevel}] (got ${t.minCraftLevel})`);
    if (!Number.isInteger(t.minRealm) || t.minRealm < 0 || t.minRealm >= CLASSIC_REALMS.length) throw bad(`forge tier ${t.tier} minRealm must be an integer realm index in [0, ${CLASSIC_REALMS.length}) (got ${t.minRealm})`);
    if (t.minRealm > t.artifactRealm) throw bad(`forge tier ${t.tier} minRealm ${t.minRealm} must not exceed its artifactRealm ${t.artifactRealm}`);
    if (prev && t.minCraftLevel < prev.minCraftLevel) throw bad("forge tier minCraftLevel must be non-decreasing with tier");
    if (prev && t.minRealm < prev.minRealm) throw bad("forge tier minRealm must be non-decreasing with tier");
  }
  // U-620：多途径获取表自检——三条新途径都不得凭空发宝、不得绕
  // 过法宝池与门槛：掉落概率为 (0, 100] 的整数百分点、掉落池非
  // 空且每件都是法宝池现有法宝、权重为正整数、池内不重复（同件
  // 法宝在池里只占一行，概率由权重表达）；宗门赐宝的位阶必须存
  // 在、一位阶至多赐一件、所赐必须是现有法宝；委托赠宝的委托必
  // 须存在、一委托至多赠一件、所赠必须是现有法宝；三处折作
  // occupiedFallback 至少一项且各项为正数（与签到 fallback 同口
  // 径：折作是给东西，不许倒扣）。
  const as = ARTIFACT_SOURCES;
  const asArtifactIds = new Set(ARTIFACTS.map((a) => a.id));
  const checkFallback = (where: string, fb: Effect) => {
    const vals = Object.values(fb);
    if (vals.length === 0 || vals.some((v) => typeof v !== "number" || !(v > 0))) throw bad(`artifact-sources ${where} occupiedFallback must have positive values`);
  };
  if (!Number.isInteger(as.exploreDrop.chancePct) || as.exploreDrop.chancePct <= 0 || as.exploreDrop.chancePct > 100) throw bad(`artifact-sources exploreDrop chancePct must be an integer in (0, 100] (got ${as.exploreDrop.chancePct})`);
  if (as.exploreDrop.pool.length === 0) throw bad("artifact-sources exploreDrop pool must not be empty");
  const seenDropIds = new Set<string>();
  for (const e of as.exploreDrop.pool) {
    if (!asArtifactIds.has(e.artifactId)) throw bad(`artifact-sources exploreDrop references unknown artifact ${e.artifactId}`);
    if (seenDropIds.has(e.artifactId)) throw bad(`artifact-sources exploreDrop duplicate artifact ${e.artifactId}`);
    seenDropIds.add(e.artifactId);
    if (!Number.isInteger(e.weight) || e.weight <= 0) throw bad(`artifact-sources exploreDrop weight for ${e.artifactId} must be a positive integer (got ${e.weight})`);
  }
  checkFallback("exploreDrop", as.exploreDrop.occupiedFallback);
  const rankIds = new Set(SECT_RANKS.map((r) => r.id));
  const seenGrantRanks = new Set<string>();
  for (const g of as.sectGrants) {
    if (!rankIds.has(g.rankId)) throw bad(`artifact-sources sectGrants references unknown sect rank ${g.rankId}`);
    if (seenGrantRanks.has(g.rankId)) throw bad(`artifact-sources sectGrants duplicate rank ${g.rankId}`);
    seenGrantRanks.add(g.rankId);
    if (!asArtifactIds.has(g.artifactId)) throw bad(`artifact-sources sectGrants references unknown artifact ${g.artifactId}`);
    checkFallback(`sectGrants ${g.rankId}`, g.occupiedFallback);
  }
  const commissionIds = new Set(COMMISSIONS.commissions.map((cm) => cm.id));
  const seenGrantCommissions = new Set<string>();
  for (const g of as.commissionGrants) {
    if (!commissionIds.has(g.commissionId)) throw bad(`artifact-sources commissionGrants references unknown commission ${g.commissionId}`);
    if (seenGrantCommissions.has(g.commissionId)) throw bad(`artifact-sources commissionGrants duplicate commission ${g.commissionId}`);
    seenGrantCommissions.add(g.commissionId);
    if (!asArtifactIds.has(g.artifactId)) throw bad(`artifact-sources commissionGrants references unknown artifact ${g.artifactId}`);
    checkFallback(`commissionGrants ${g.commissionId}`, g.occupiedFallback);
  }
}

assertContentIntegrity();
