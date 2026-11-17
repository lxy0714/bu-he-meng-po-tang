// 轮回修仙跑团 — 存档状态模型与引擎helper：设定默认值、存档读写（含旧存档
// 迁移）、境界/衰减/检定/效果结算。从 actions.ts 原样拆分，规则未动。

import type { Ctx } from "./platform";
import { GAME_SLOT, saveStorageFor } from "./storage";
import { applySaveFieldDefaults } from "./savefields";
import {
ARTIFACTS, ARTIFACT_SOURCES, CLASSIC_REALMS, COMMISSIONS, CRAFT_SKILLS, CURRENT_EVENT_VERSION, DAILY_COMMISSIONS, ENEMIES, FORGE, LOCATION_DROPS, LOCATIONS, MAINLINE_CHAPTERS, MAINLINE_TOTAL_SHARDS, SEALED_EGGS, SECT_RANKS, SHORT_REALMS, SIGN_INS, STAGES, TIME_COSTS, TIMED_EVENTS, TREASURES, artifactById, birthBoonById, combatDc, commissionById, craftLevelDefFor, craftProficiencyFor, craftYieldPctFor, dailyCommissionById, dropTierDef, eventReleasedForDeck, eventUnlockedForLife, locById, locationDropAt, npcById, sealedEggAtLocation, signInByLocation, signInTierDef, techById, timeCostMonths, timedEventById, travelMonthsTo,
type ArtifactDef, type ArtifactFx, type CommissionDef, type DailyCommissionDef, type EnemyDef, type ForgeTierDef, type LocationDef, type RealmDef, type RelKind, type SealedEggDef, type SignInSpotDef, type TalentDef, type TimedEventDef, type TimedRepDelta, type TimeCostKey
} from "./data";
import { ATTR_NAME, EVENTS, formatEffectGains, type Effect, type EventDef } from "./events";
import { SeededRng, makeSeed, randomSet, uniformTable, weighted, weightedDeckCards } from "./rng";
import { assertModifierChain, assertRollMode, buildCheckDetail, evaluateDiceExpression, runModifiersAfter, runModifiersBefore, type CheckDetail, type CheckModifier, type CheckModifierContext, type ModifierTraceEntry, type RollMode } from "./dice";
import { CHECK_CONFIG, COMBAT_CHECK, FATE_TIER, artifactBonusFor, checkExpressionFor, craftTalentBonus, cultivationThresholdFor, diceRangeFor, eventTalentBonus, isCheckSuccess, rescaleDc, scaleMargin, talentAttrBonus, type AttrKey, type CheckSystem } from "./checks";

// ---------- state model ----------

export interface SettingItem { value: string; confirmed: boolean }
export interface Settings {
  q1: SettingItem; q2: SettingItem; q3: SettingItem; q4: SettingItem; q5: SettingItem;
  q6: SettingItem; q7: SettingItem; q8: SettingItem; q9: SettingItem; q10: SettingItem;
  q11: SettingItem; q12: SettingItem; q13: SettingItem; q14: SettingItem;
  q15: SettingItem; q16: SettingItem; q17: SettingItem; q18: SettingItem;
  // Q34（2026-11-14）：分系统骰面 + 动态上下限，取代 Q8 的全游戏 d150。
  q34: SettingItem;
}

export interface PendingOption {
  label: string; hint: string; attr: string; dc: number;
  // U-377 代价模板：cost 为事件配置的明码标价（随待决事件构建时从
  // 事件定义复制进来，结算以此为准）；costBlocked 为构建时算好的
  // 「付不起」原因，非空即不可选（chooseOption 结算时还会按当前
  // 状态复核一次）。无代价的选项两字段皆缺省，旧存档读入不受影响。
  cost?: Effect; costBlocked?: string;
  // U-378 见好就收模板：loop 为真表示这是「可加圈」选项——掷骰成功
  // 后给继续加圈/见好就收的抉择（客户端据此标注）；抉择待决事件的
  // 两个选项不带此标记。无模板的选项缺省，旧存档读入不受影响。
  loop?: boolean;
}
// U-378 见好就收进行状态：挂在抉择待决事件（id 为 loop:<事件id>）
// 上——原事件与选项的定位、已完成圈数、第 1 圈的结算难度 baseDc
// （后续圈数按 EVENT_LOOP 倍率由此放大）、累计收获 gains（每圈成功
// 时以结算前后的资源差值实测累计，即玩家真正落袋的数，含衰减与
// 天赋修正）。抉择待决事件只由新版产生，旧存档无此字段、读入不受
// 影响；普通待决事件同样缺省此字段。
export interface PendingLoop { eventId: string; optionIdx: number; round: number; baseDc: number; gains: Effect }
// U-381 分叉地图路线选择（来源 A-92《杀戮尖塔》）：探索不再单线抽
// 事件，而是踏上一程分叉路线——共 ROUTE_TOTAL_LAYERS 层，每层给三个
// 类型各不相同的节点（战斗/精英/事件/商店/休息中任选其三，种子化抽
// 取），选定节点即触发对应类型的既有系统：战斗/精英走 Q15 斗法结算
// （精英 = 本地点最强敌手，敌手在生成节点时就定下、明示给玩家，路线
// 选择本身即策略）、事件走 U-576 牌堆抽取 + Q34 探索 d80、商店向路
// 上的行商买 Q17 同款丹药（同价）、休息走既有休整结算。路线层只决
// 定「下一步触发哪类」，不新增事件种类、不新编数值。
export type RouteNodeType = "combat" | "elite" | "event" | "shop" | "rest";
export interface RouteNode { type: RouteNodeType; enemyId?: string }
export interface RouteState { layer: number; totalLayers: number; nodes: RouteNode[] }
export const ROUTE_TOTAL_LAYERS = 5;
export const ROUTE_NODE_TYPES: readonly RouteNodeType[] = ["combat", "elite", "event", "shop", "rest"];

// U-388 委托板（接取式支线）：玩家在各处告示板（坊市告示墙、山门
// 告示、村口老槐树、古刹布施榜——即委托的张贴地点）主动接取支线
// 委托，接取后目标按地点刷新（在目标地点完成既有系统的行为计数：
// 探索结算事件 / 斗法获胜 / 副职 / 宗门差事），达成后回张贴处结算
// 领奖并听委托人讲一段世界与人物的故事。接取无时限、不接无惩罚、
// 放弃无惩罚；委托是本世的营生，轮回不带走（新世重新接）。状态只
// 三段：板上张贴（board，本世内一张委托只贴一次）、已接（active，
// 含进度与是否达成）、本世已完成数（completedCount）。委托定义在
// 配置表 content/commissions.json，全部取材现有 NPC/地点/系统。
export interface ActiveCommission { id: string; progress: number; done: boolean }
export interface CommissionState { board: string[]; active: ActiveCommission[]; completedCount: number }
export function emptyCommissionState(): CommissionState {
  return { board: [], active: [], completedCount: 0 };
}

// U-389 限时事件（来源 B-65《修真聊天群》，拆自 v1 U-47 的限时部
// 分）：群友发布的限时帖，与 U-388 委托板分开——委托无时限、不接
// 无惩罚；限时帖带倒计时：帖子在板上只挂 postDays 天，挂满无人接
// 取即过期沉底并结算「不接」声望；接取后 deadlineDay = 接取时天序
// + limitDays，须在此前办妥目标（目标达成即锁定成功、之后交帖不
// 受时限约束），天序到达 deadlineDay 仍未办妥即超时失败。倒计时
// 时钟（U-610/Q37）：走 U-608 累计月份——天序 = totalMonths ×
// daysPerMonth（1 个月按配置表 timed-events.json 的 daysPerMonth
// 天折算），不再挂角色年龄。接 / 不接 / 成 / 败四段都结算声望，
// 声望只落既有字段：发布人的既有关系 bond（relations）与既有宗门
// 贡献 sectContrib，不新设货币、不新设声望字段（结算见 applyRep-
// utation）。状态四段：板上挂帖（board，含挂帖时天序 postedDay）、
// 已接（active，含进度 / 是否达成 / 截止天序 deadlineDay）、本世
// 办妥数 / 失败数 / 过期数。限时帖是本世的营生，轮回不带走。定
// 义在配置表 content/timed-events.json。旧存档（按年口径的
// postedAge/deadlineAge）在读档时由 migrateTimedClock 按剩余年限
// 换算成新天序（见该函数），不直接判超时。
export interface TimedPosting { id: string; postedDay: number }
export interface ActiveTimedEvent { id: string; progress: number; done: boolean; deadlineDay: number }
export interface TimedEventState { board: TimedPosting[]; active: ActiveTimedEvent[]; completedCount: number; failedCount: number; lapsedCount: number }
export function emptyTimedEventState(): TimedEventState {
  return { board: [], active: [], completedCount: 0, failedCount: 0, lapsedCount: 0 };
}

// U-390 日常委托事件池（来源 B-66《我的微信连三界》，拆自 v1 U-47
// 的日常池部分）：天庭朋友圈 / 地府委托——按批刷新一批委托事件，
// 不设接取动作、无接取声望，进入委托地点即触发本批委托（把委托引
// 用的现有事件摆成待决事件），办妥得稀有材料（天庭）或前世线索
// （地府，记忆碎片）；未完成不惩罚，刷新时整批换新。与 U-388
// 委托板（接取式、无时限、回板结算）与 U-389 限时事件（有时限、
// 声望结算）分开：无接取、无声望、无回板结算，办妥当场结清。
// 刷新节律（U-611/Q37）：U-390 时按角色年龄刷新（年龄每进一岁刷
// 新一批，字段 dayAge 记本批刷新的年龄）；U-611 起改走 U-608 细时
// 钟的累计月份——batchMonth 记本批刷新时的累计月份，累计月份自
// 此推进满配置表 refreshIntervalMonths（1 个月）即刷新下一批，一
// 次行动跨多个月也最多刷新一批（刷新时 batchMonth 直接对齐到当
// 前累计月份，见 ensureDailyBoard）。旧存档（只有 dayAge）在读档
// 时由 migrateDailyClock 对齐：当前批次保留、batchMonth 对齐到当
// 前累计月份，不一读档就连刷多批、也不丢当前批次。状态三段：本
// 批委托 id（pending，按刷新序）、本批已办妥 id（doneIds，同批内
// 办妥的不再触发）、本世已办妥数（completedCount）。日常委托是本
// 世的营生，轮回不带走（新世自降生之月重新刷新）。定义在配置表
// content/daily-commissions.json。
export interface DailyState { batchMonth: number; pending: string[]; doneIds: string[]; completedCount: number }
export function emptyDailyState(): DailyState {
  // batchMonth = -1 表示尚未刷新过（降生/旧存档补值），首次读档即
  // 按当前累计月份刷出第一批。
  return { batchMonth: -1, pending: [], doneIds: [], completedCount: 0 };
}

// U-391 地点签到（来源 B-42《修仙：神级签到系统》，拆自 v1 U-45 的
// 签到部分）：到达指定地点（坊市 / 宗门山门 / 秘境，配置表
// content/sign-ins.json）触发签到式事件一次——即到即得：无需接取、
// 无时限、无掷骰判定，奖励按配置三选一（功法 / 法宝 / 灵石其一，
// 内容全部取材现有功法池/法宝池/灵石字段）。与 U-388 委托板（接取
// 式）、U-389 限时事件（有时限声望）、U-390 日常委托（按日刷新、
// 事件触发）明确分开：签到是纯到达触发的一次性奖励。状态两段：
// 本世已签到的签到点 id（done，同一地点本世不重复签到）、本世已
// 签到数（count）。签到是本世的足迹，轮回不带走（新世各地点重新
// 可签）。
// U-392 签到图鉴（同源 B-42，拆自 v1 U-45 的图鉴部分）：在上面的
// 本世记录之上加两件事——①收集进度：签到过的地点记入跨世图鉴
// （GameState.signInCodex，轮回不清空），图鉴只记「已签到地点」清
// 单与奖励档位（配置 tiers），不设图鉴货币；②按档奖励：大奖按签
// 到点逐点配置（档位越高越重），本世已签过的地点再次抵达时不再
// 重发大奖，只按所在档位发配置 tiers 里的故地重游小奖（revisit，
// 既有 Effect 的灵石/修为），鼓励探索新地点。触发规则与 U-391 完
// 全一致（到达触发、无接取、无时限、无掷骰）；小奖只在旅行抵达
// 时发，读档期不发（防反复读档刷奖），见 settleSignInHere。
export interface SignInState { done: string[]; count: number }
export function emptySignInState(): SignInState {
  return { done: [], count: 0 };
}

// U-393 封印之蛋式收集物（来源 A-39《轩辕剑六》；来源未核实，见
// content.ts 的 SEALED_EGGS 注释）：探索时各地点按配置概率随机出
// 现封印之蛋，拾取记入收集进度；集齐门槛的倍数枚换一条前世遗藏
// 线索。与 U-391/U-392 签到明确分开：签到是到达即得的奖励，封印
// 之蛋是探索才现身的收集物，拾取本身与线索都不发奖励。收集是跨
// 世的（与签到图鉴同一口径，轮回不清空）：found 是已拾蛋 id 清
// 单、totalFound 是累计拾取数、clues 是已换得的线索（只记被指地
// 点与来源）、cluedBuried 是已被线索指过的既有遗藏键（避免重复
// 指同一处）、revealed 是线索标出的无主遗藏方位（宝物取材既有
// 遗藏池，玩家到该地点探索即可循线取回，取回前一直有效、跨世
// 保留）。收集物只记清单，不进丹药囊、不占格子。
export interface SealedEggClue { locationId: string; locationName: string; source: "buried" | "cache"; text: string }
export interface RevealedCache { treasureId: string; treasureName: string; locationId: string; locationName: string }
export interface SealedEggState {
  found: string[]; totalFound: number;
  clues: SealedEggClue[]; cluedBuried: string[];
  revealed: RevealedCache | null;
}
export function emptySealedEggState(): SealedEggState {
  return { found: [], totalFound: 0, clues: [], cluedBuried: [], revealed: null };
}

export interface PendingEvent {
  id: string; title: string; desc: string; art: string; options: PendingOption[]; loop?: PendingLoop;
  // U-379 三选一抉择模板：trio 为真表示这是「三选一抉择」事件（随
  // 待决事件构建时从事件定义复制进来，客户端据此标注）；普通待决
  // 事件与旧存档皆缺省，读入不受影响。
  trio?: boolean;
  // U-380 多解事件模板：dual 为真表示这是「双解法」事件（同样随待
  // 决事件构建时从事件定义复制进来，客户端据此标注）；普通待决事
  // 件与旧存档皆缺省，读入不受影响。
  dual?: boolean;
  // U-383 道德分叉模板：moral 为真表示这是「道德分叉」事件（同样
  // 随待决事件构建时从事件定义复制进来，客户端据此标注）；普通待
  // 决事件与旧存档皆缺省，读入不受影响。
  moral?: boolean;
  // U-390 日常委托：本待决事件由日常委托触发时带此标记（委托 id 与
  // 触发地点）——chooseOption 据此在办妥（掷骰成功）时结清日常委
  // 托的额外奖励；普通待决事件与旧存档皆缺省，读入不受影响。委托
  // 引用的事件经配置自检不得带 loop 选项，故日常结算不进 loop 链。
  daily?: { dailyId: string; locationId: string };
}
// U-570：lastRoll 除原有汇总数字外，带一份结构化判定明细（detail，
// 见 dice.ts 的 CheckDetail）；旧存档的 lastRoll 没有 detail，客户端
// 回退到原汇总展示，读入不受影响。
export interface LastRoll { label: string; dice: number; bonus: number; total: number; dc: number; success: boolean; text: string; detail?: CheckDetail }

export interface Keepsake { kind: "artifact" | "technique" | "treasure"; id: string; locationId?: string }
// Q18 社交：一段关系。bond 对友好关系是情谊（0–100），对仇敌是仇怨（0–100）。
export interface Relation { npcId: string; name: string; kind: RelKind; bond: number; note: string }
export interface Pills { heal: number; cult: number; brk: number }
export interface Character {
  name: string; origin: string; rootId: string; rootName: string; artifactId: string; artifactName: string;
  // U-618 本命法宝分级门槛：法宝属性修正是否已落到四维上。持有法宝
  // 但境界未达配置门槛（artifacts.json 的 minRealm）时为 false——法宝
  // 封存（保留在栏位、加成不生效），境界达到门槛后由 syncArtifactGate
  // 自动解封补上加成。封存与否恒由此字段与境界派生（见 artifactGate），
  // 不另存冗余标记。旧存档缺失时由存档字段注册表按「持有即已生效」
  // 补 true（旧口径下赋予即生效），再由 loadState 的门槛对齐收回。
  artifactBonusApplied: boolean;
  lifeNo: number; realmIdx: number; stageIdx: number; cultivation: number; totalCultivation: number;
  hp: number; maxHp: number; mp: number; maxMp: number; stones: number; karma: number;
  age: number; lifespan: number; locationId: string;
  // U-608 细时钟：本世累计月份（自降生起算，降生 = 16 岁 × 12 =
  // 192）——每次行动按配置表 time-costs.json 推进（advanceMonths），
  // age 恒由它推导（floor(totalMonths / 12)，满 12 个月进 1 岁）。
  // 旧存档缺失时由存档字段注册表按 age × 12 迁移补值。U-609 起
  // 寿元结算也按它走：寿元上限换算成月（lifespan × monthsPerYear，
  // 见 lifespanMonthsOf），checkDeath 按累计月份判定寿终。
  totalMonths: number;
  might: number; sense: number; fortune: number; body: number;
  sealedMemory: boolean; memoryTier: number; dead: boolean; deathCause: string | null;
  pendingEvent: PendingEvent | null; lastRoll: LastRoll | null;
  // U-381 分叉路线进行状态：非 null 表示正走在一程路线里、当前层三
  // 个节点待选（或由节点触发的待决事件正在结算）。旧存档缺失时由
  // 存档字段注册表补 null（无进行中路线），降生时恒为 null。
  route: RouteState | null;
  talentIds: string[]; techniqueId: string | null;
  legacyPoints: number; jadeLayers: number;
  weekKey: string; groupCounts: Record<string, number>;
  caveClaimedLife: number;
  destinyId: string; sectRankId: string; sectContrib: number;
  breakFails: number; recentEvents: string[]; quickPlan: { kind: string; count: number }[];
  // U-576 事件牌堆：本世剩余事件牌序（事件 id，牌堆顶 = index 0）。
  // 每世开局洗一副全事件牌堆，探索从堆顶往下找本地点可用的牌抽走，
  // 本世内抽过的事件不再出现；只有整副牌堆的可玩牌全部抽完时才整副
  // 重洗，本地点牌先抽完时只在本地点已抽牌里重洗子牌堆、不动主牌堆
  // （见 drawEventFromDeck）。旧存档缺省 []，首次探索时初始化。
  eventDeck: string[];
  // U-395 新增事件分批投放：本世牌堆的投放版本——降生时把当时的
  // 最新投放版本（配置表 event-releases.json 的最高批次）落定于
  // 此，本世建堆与抽牌只收投放版本不高于此值的事件；当世牌堆不
  // 随后来新批次变化，轮回开新世时推进到最新版本，旧存档无需重
  // 开即可在新世遇见新增事件。旧存档缺失时由存档字段注册表补 1
  // （首发批：其当世牌堆本就是在只有首发事件时建的）。
  deckVersion: number;
  // U-388 委托板状态（本世）：板上张贴的委托 id、已接委托与进度、
  // 本世已完成数。旧存档缺失时由存档字段注册表补空状态，降生时恒
  // 为空状态（板面在读档/降生后由 ensureCommissionBoard 补齐）。
  commissions: CommissionState;
  // U-389 限时帖状态（本世）：板上挂帖（id + 挂帖时天序）、已接限
  // 时帖（进度 / 是否达成 / 截止天序）、本世办妥 / 失败 / 过期数。
  // 旧存档缺失时由存档字段注册表补空状态，降生时恒为空状态（板面
  // 在读档/降生后由 ensureTimedBoard 补齐、到期由 settleTimedEvents
  // 在读档时结算）。
  timedEvents: TimedEventState;
  // U-390 日常委托事件池状态（本世）：本批刷新时的累计月份
  // batchMonth（U-611，旧存档的 dayAge 由 migrateDailyClock 对齐）、
  // 本批待办委托 id、本批已办妥 id、本世已办妥数。旧存档缺失时由
  // 存档字段注册表补空状态（batchMonth=-1），降生时恒为空状态；
  // 本批内容在读档/降生后由 ensureDailyBoard 按累计月份刷新补齐。
  dailyCommissions: DailyState;
  // U-391 地点签到状态（本世）：已签到的签到点 id 列表与本世已签
  // 到数。旧存档缺失时由存档字段注册表补空状态，降生时恒为空状态；
  // 触发在旅行抵达结算尾巴与读档时（settleSignInHere）。
  signIns: SignInState;
  // U-482 副职熟练度：四门副职各自的使用次数（键 = alchemy/forge/
  // farm/fish，缺键 = 0 次）——本世内累计（与灵田/丹药囊等本世状态
  // 同口径，轮回不带走；U-619 炼制门槛读的「炼器等级」即由 forge
  // 的次数经配置表派生）。熟练度与等级都是派生量（配置表
  // craft-skills.json），不另存。旧存档缺失时由存档字段注册表补 {}
  // （四门皆 0 次、熟练度 0，与计划口径「旧存档默认 0」一致）。
  craftUses: Record<string, number>;
  // U-464 锻造矿石：七阶矿石的本世持有数（键 = 配置表 forge.json
  // 的矿石 id，缺键 = 0 块）——锻造法宝的耗材，来源只有坊市购买
  // 与探索拾得两条（配置表定价/掉率，不凭空发放）。与丹药囊同口
  // 径：本世持有、轮回不带走。旧存档缺失时由存档字段注册表补 {}
  // （一无所有，与「不凭空发」一致）。
  ores: Record<string, number>;
  relations: Relation[]; pills: Pills; caveLevel: number; breakBonus: number;
}
export interface LifeRecord {
  lifeNo: number; name: string; realmText: string; age: number; cause: string; grade: string;
  artifactName: string; keepsakes: string[]; talents: string[];
}
export interface MemoryFragment { id: number; lifeNo: number; label: string; detail: string }
export interface PendingKeepsake {
  kind: "artifact" | "technique" | "treasure"; id: string; name: string; desc: string; cost: number;
  // U-618：仅法宝候选带门槛信息——minRealm/minRealmName 为该宝的境界
  // 使用门槛，locked 为本世止步境界未达门槛（候选仍列出、明示原因、
  // 不可点选），lockReason 是给玩家看的不可选原因。功法/遗藏候选
  // 不带这些字段，口径不变。
  minRealm?: number; minRealmName?: string; locked?: boolean; lockReason?: string;
}
// Q13：降生抽选——出身/命格/灵根/天赋各自独立，各抽 3 个候选，
// 每项可随机（random=true）或自选其一（value 给出候选值）。
// 姓名不走抽选：自填，或降生时从姓名池全池随机（用户 2026-11-11 定）。
export interface BirthChoice { pool: string[]; value: string; random: boolean }
export interface BirthDraw {
  origin: BirthChoice; destiny: BirthChoice; root: BirthChoice;
  talentChoices: TalentDef[]; chosenTalents: string[];
}
export interface Reincarnation {
  grade: string; legacyEarned: number;
  // U-002：本次轮回结算发放的轮回点（按评级档位，配置表定）。
  pointsEarned: number;
  // U-322：本次结算按本世新集记忆碎片数分档发放的轮回点（配置表
  // shardTiers），与 pointsEarned 同入一个轮回点池；shardsThisLife
  // 是本世新集碎片数（= 结算时 mainline.shards − 本世开始时基线）。
  shardPointsEarned: number;
  shardsThisLife: number;
  keepsakeCandidates: PendingKeepsake[]; keepsakes: Keepsake[];
  chosenOrigin: string | null; memoryKept: boolean; memoryNote: string;
  artifactShattered: boolean;
}
export interface LogEntry { id: number; lifeNo: number; kind: string; text: string }
export interface BuriedTreasure { treasureId: string; treasureName: string; locationId: string; locationName: string; buriedLife: number }
// Q16 轻主线：跨世累计的前世记忆碎片（不随轮回清零）。
export interface Mainline { shards: number; done: boolean }
// U-574：存档里的 PRNG 流位置（种子标识 + 序号），见 GameState.rngState。
export interface RngStreamState { seed: string; seq: number }
// U-002：开局属性分配——轮回点在降生前逐项分到四维上，暂存于此，
// 降生（createCharacter / reincarnate）时落到新角色并清空。
export interface BirthBoost { might: number; sense: number; fortune: number; body: number }
export interface GameState {
  settings: Settings;
  // U-625 规则锁定：新游戏先在规则设定页逐项定下整局规则（默认 =
  // Q1–Q18 定夺推荐值），确认（confirmRules）即置 true 锁定本局；
  // 锁定后 setSetting 一律拒绝、游戏内规则页只读。散功重开
  //（resetAll → defaultState）回到 false 重新设定。旧存档缺失此
  // 字段时由注册表按「本局是否已开局」补值（见 savefields.ts）。
  rulesLocked: boolean;
  character: Character | null; lives: LifeRecord[]; log: LogEntry[]; logSeq: number;
  fragments: MemoryFragment[]; buried: BuriedTreasure[]; reincarnation: Reincarnation | null;
  birthDraw: BirthDraw | null; mainline: Mainline;
  // U-322：本世开始时的主线碎片累计基线——轮回结算时本世新集碎片数
  // = mainline.shards − 本值，结算后在 buildReincarnation 里推进到
  // 当时的 mainline.shards，成为下一世的基线。memoryKept 的 +2 碎片
  // 在 reincarnate 里于结算之后发放，故计入下一世的新集数。旧存档
  // 缺失时以读入当时 mainline.shards 作为基线兜底、不追溯发放（见
  // savefields.ts 注册表 make）；新存档初始基线为 0。
  shardsAtLifeStart: number;
  // U-002 轮回点：跨世主货币（D-1 已定），与传承点分工——传承点只赎
  // 装备/功法，轮回点只用于开局分配（提升初始属性、重置初始天赋与
  // 灵根），两者不混用、不互换。每次轮回结算按评级档位发放（配置表
  // content/reincarnation-points.json）。旧存档缺失按 0 点兜底。
  reincarnationPoints: number;
  // U-002：已分配待降生生效的初始属性加成（未分配时为 null）。
  birthBoost: BirthBoost | null;
  // U-021：已购待降生生效的「再战天道」强化项 id 列表（配置表 boons）：
  // 轮回点在开局买下、降生时一次性生效并清空；与 birthBoost（四维
  // 属性）分开记账，花费同走轮回点池。旧存档缺失按空列表兜底。
  birthBoons: string[];
  // U-392 签到图鉴：跨世收集记录——历世签到过的签到点 id 清单（收
  // 录发生在签到结算当刻，loadState 另把本世已签列表并入兜底），
  // 轮回不清空；图鉴只记清单与档位（档位在配置表 tiers），不设图
  // 鉴货币、不影响任何结算。旧存档缺失按空列表兜底。
  signInCodex: string[];
  // U-393 封印之蛋收集（跨世）：已拾蛋清单 / 累计拾取数 / 已换得
  // 的遗藏线索 / 已被线索指过的既有遗藏 / 线索标出的无主遗藏方
  // 位。轮回不清空；旧存档缺失由注册表补空状态。
  sealedEggs: SealedEggState;
  // U-573 种子化随机：单调递增的操作序号，拼进种子字符串（见 rngForNext）。
  // 每次取随机实例时 +1 并随存档持久化；同一存档从同一序号重放同一操作，
  // 必得同一结果。旧存档缺省 0。
  rngSeq: number;
  // U-574 PRNG 状态保存与恢复：随机流位置的显式存档形态——种子标识
  // （save:<存档ID>）+ 当前序号 seq。落盘时由 rngSeq 快照而成
  // （snapshotRngState），读入时以其 seq 恢复 rngSeq（restoreRngState），
  // 中途退出重进后随机序列不断档、不再「刷新重掷命运」。旧存档没有
  // 此字段（注册表补 null），按 rngSeq 原有规则兜底、不报错。
  rngState: RngStreamState | null;
}

export function defaultSettings(): Settings {
  // 第一轮 Q1–Q5（2026-11-08）、第二轮 Q6–Q10（2026-11-11）与第三轮
  // Q11–Q14（2026-11-11）均已由用户确认定稿。
  return {
    q1: { value: "solo", confirmed: true },
    q2: { value: "waste_root", confirmed: true },
    q3: { value: "recommended", confirmed: true },
    q4: { value: "classic9", confirmed: true },
    q5: { value: "all", confirmed: true },
    q6: { value: "random", confirmed: true },
    q7: { value: "strict", confirmed: true },
    q8: { value: "d150", confirmed: true },
    q9: { value: "recommended", confirmed: true },
    q10: { value: "medium_hard", confirmed: true },
    q11: { value: "random_open", confirmed: true },
    q12: { value: "recommended", confirmed: true },
    q13: { value: "independent", confirmed: true },
    q14: { value: "all", confirmed: true },
    q15: { value: "duel_d150", confirmed: true },
    q16: { value: "light_mainline", confirmed: true },
    q17: { value: "stones_economy", confirmed: true },
    q18: { value: "social_full", confirmed: true },
    q34: { value: "per_system_dynamic", confirmed: true },
  };
}
export function defaultState(): GameState {
  return { settings: defaultSettings(), rulesLocked: false, character: null, lives: [], log: [], logSeq: 0, fragments: [], buried: [], reincarnation: null, birthDraw: null, mainline: { shards: 0, done: false }, shardsAtLifeStart: 0, reincarnationPoints: 0, birthBoost: null, birthBoons: [], signInCodex: [], sealedEggs: emptySealedEggState(), rngSeq: 0, rngState: null };
}
export function realmsFor(s: Settings): RealmDef[] {
  return s.q4.value === "short5" ? SHORT_REALMS : CLASSIC_REALMS;
}
// 突破门槛公式在 U-563 检定配置表（checks.ts 的 CULTIVATION_THRESHOLD）
// 一处维护，此处只转发，数值逐字不变。
export function threshold(realmIdx: number, stageIdx: number): number {
  return cultivationThresholdFor(realmIdx, stageIdx);
}
export function realmText(c: Character, s: Settings): string {
  const r = realmsFor(s)[Math.min(c.realmIdx, realmsFor(s).length - 1)];
  return `${r?.name ?? "炼气"}·${STAGES[c.stageIdx] ?? "初期"}`;
}
export function weekKeyOf(d: Date): string {
  const y = d.getFullYear();
  const oneJan = new Date(y, 0, 1);
  const week = Math.ceil((((d.getTime() - oneJan.getTime()) / 86400000) + oneJan.getDay() + 1) / 7);
  return `${y}-W${week}`;
}
export function decayMult(count: number): number {
  return count <= 0 ? 1 : count === 1 ? 0.6 : count === 2 ? 0.35 : 0.15;
}
export function locUnlocked(c: Character, loc: LocationDef): boolean {
  const realmGate = loc.id === "realm" && c.lifeNo >= 2 ? 0 : loc.minRealm;
  return c.realmIdx >= realmGate;
}
// 属性天赋加分表在 U-563 检定配置表（checks.ts 的 ATTR_TALENT_POINTS，
// 每级 +extraPointsPerLevel.attrTalent）一处维护，此处只转发。
export function talentBonus(c: Character, kind: "might" | "sense" | "fortune" | "body"): number {
  return talentAttrBonus(c.talentIds, kind);
}
export function attrOf(c: Character, attr: string): number {
  const base = attr === "might" ? c.might : attr === "sense" ? c.sense : attr === "fortune" ? c.fortune : c.body;
  return base + talentBonus(c, attr as "might" | "sense" | "fortune" | "body");
}
export function lifeGrade(c: Character): string {
  const score = c.realmIdx * 4 + c.stageIdx + Math.floor(c.totalCultivation / 400);
  return score >= 14 ? "S" : score >= 9 ? "A" : score >= 5 ? "B" : "C";
}

// U-596：存档读写走存储抽象层（storage.ts 的 SaveStorage）——本函数
// 只负责把槽位里的字符串解析成 GameState 并做旧存档迁移，存储层
// 不碰数据结构；槽位无数据与改前「无 id=1 行」一致，回默认状态。
// U-598：旧存档迁移的缺省补值全部走存档字段注册表（savefields.ts）
// ——每个可持久化字段在注册表登记一行（路径 + 补值工厂），本函数只
// 做两件注册表外的事情：设定与默认值的合并（merge 迁移）、旧轮回
// 结算结构的失效（结构迁移，不是补值）。补值的字段、取值与应用
// 顺序和注册前的散写 ??= 逐字一致，存档内容与键序不变；新增可
// 持久化字段只在注册表加一行即自动获得迁移与覆盖核查。
export async function loadState(ctx: Ctx): Promise<GameState> {
  const raw = await saveStorageFor(ctx).read(GAME_SLOT);
  if (raw === null) return defaultState();
  try {
    const parsed = JSON.parse(raw) as GameState & { settings?: Partial<Settings> };
    if (!parsed.settings) return defaultState();
    // 旧存档迁移：补齐新增的设定与字段（不改动既有角色与记录）。
    // 设定合并（注册表 settings 项的 merge 迁移）：默认值在前、存档值覆盖。
    const d = defaultSettings();
    parsed.settings = { ...d, ...parsed.settings } as Settings;
    // 其余字段的缺省补值全部由注册表驱动：第二轮的 fragments/buried、
    // 第三轮的命格/宗门/牌堆、第四轮的主线与 Q15–Q18 新字段、U-573
    // 的 rngSeq 等都在 savefields.ts 登记，顺序与改前一致。
    applySaveFieldDefaults(GAME_SLOT, parsed, { currentWeekKey: weekKeyOf(new Date()) });
    // U-388：委托板板面补齐（派生展示状态：张贴数不足时从可接池种
    // 子化补贴；已张贴/已接/已达成的委托一字不动，角色已陨落时不补）。
    ensureCommissionBoard(parsed);
    // U-389：限时帖到期结算 + 板面补齐（同为读档期派生处理：先按
    // 当前天序结算超时失败与挂帖过期——声望与计数就此落定，随本
    // 次读档之后的任一动作存档一并持久化；再补齐板面。角色已陨
    // 落时两步都跳过，本世限时帖随轮回清空、不跨世追罚）。
    // U-610：结算前先把旧存档按年口径的限时帖时钟换算成新天序
    // （剩余时间保全、不直接判超时，见 migrateTimedClock）。
    migrateTimedClock(parsed);
    settleTimedEvents(parsed);
    ensureTimedBoard(parsed);
    // U-390：日常委托按批刷新（读档期派生处理：本批已过期即整批
    // 换新——上批未办妥的就此作罢、不惩罚、无声望变动；角色已陨
    // 落时不刷新，本世日常委托随轮回清空）。
    // U-611：刷新前先把旧存档按年龄口径的 dayAge 对齐成累计月份
    // 口径的 batchMonth（当前批次保留、不连刷，见 migrateDailyClock）。
    migrateDailyClock(parsed);
    ensureDailyBoard(parsed);
    // U-618：本命法宝门槛读档对齐——旧存档的持有法宝若未达新门槛，
    // 在此封存（收回加成、法宝保留，日志说明一次）；已达门槛的不受
    // 影响。与其余读档期派生结算同口径：结果随本次读档之后的任一
    // 动作存档一并持久化，getState 只读响应一致、不重复落账。
    if (parsed.character) syncArtifactGate(parsed, parsed.character);
    // U-391：地点签到读档期触发——角色此刻正站在某个本世未签过的
    // 签到点上（旧存档升级前就站在坊市/山门/秘境、或上一动作落盘
    // 前已抵达）即当场签到发奖（settleSignInHere，与限时帖到期结
    // 算同一「读档期派生结算」口径：结果随本次读档之后的任一动作
    // 存档一并持久化，getState 只读响应一致、不重复落账）；旅行抵
    // 达新地点走不到读档这一步，由 travel 动作在抵达尾巴里再调
    // 一次。角色已陨落时不触发。
    settleSignInHere(parsed);
    // U-392：签到图鉴收录兜底——把本世已签列表并入跨世图鉴（收录
    // 本在签到结算当刻完成，见 settleSignInHere；此处并入只覆盖
    // U-392 上线前已签到过的旧存档：只补记录、不发任何奖励，与
    // U-322「旧存档不追溯发放」口径一致）。读档期不发故地重游小
    // 奖（settleSignInHere 的 viaTravel 缺省为否），反复读档不刷奖。
    if (parsed.character?.signIns) {
      for (const id of parsed.character.signIns.done) {
        if (!parsed.signInCodex.includes(id)) parsed.signInCodex.push(id);
      }
    }
    // U-574：以存档里的显式 PRNG 流位置恢复序号——有 rngState 时以
    // 其 seq 为准（restoreRngState），无 rngState 的旧存档保留注册表
    // 补出的 rngSeq 原值按原有种子规则兜底，均不报错。
    restoreRngState(parsed);
    // 第三轮迁移：旧轮回结算（originChoices/talentChoices 结构）作废重抽。
    // 这是结构失效而非缺省补值，留在本处明示（注册表 reincarnation
    // 项注有此项特殊迁移）。
    const reAny = parsed.reincarnation as (Reincarnation & { originChoices?: unknown }) | null;
    if (reAny && reAny.originChoices !== undefined) parsed.reincarnation = null;
    return parsed as GameState;
  } catch {
    return defaultState();
  }
}
// U-596：序列化在本层完成（JSON.stringify 与改前逐字一致），写槽位
// 的事交给存储层；槽位隔离（游戏存档不覆盖报错记录行）由存储层的
// 行 id 限定保证，见 storage.ts。
export async function saveState(ctx: Ctx, state: GameState): Promise<void> {
  // U-574：落盘前把随机流当前位置（种子 + 序号）显式快照进 rngState
  // 一并保存，下次读入时由 restoreRngState 按它恢复（见 loadState）。
  snapshotRngState(state);
  await saveStorageFor(ctx).write(GAME_SLOT, JSON.stringify(state));
  ctx.invalidateQueries();
}

export function pushLog(state: GameState, lifeNo: number, kind: string, text: string) {
  state.logSeq += 1;
  state.log.unshift({ id: state.logSeq, lifeNo, kind, text });
  state.log = state.log.slice(0, 80);
}

// ---------- U-608 细时钟推进（全游戏唯一的时间推进口） ----------
// 累计月份 totalMonths 是细时钟主字段：推进月份后年龄按
// floor(totalMonths / monthsPerYear) 重新推导（满 12 个月进 1
// 岁）。所有行动耗时只从配置表 time-costs.json 取数（content.ts
// 的 TIME_COSTS / timeCostMonths / travelMonthsTo），行动点不得
// 再直接写 c.age += n。事件效果的 age 字段（单位仍是年）经
// advanceYears 换算成月份走同一口，年口径不变。U-609 起寿元结算
// 也走累计月份：checkDeath 按 totalMonths >= 寿元上限（月）判寿终。
export function advanceMonths(state: GameState, months: number): void {
  const c = state.character;
  if (!c || !Number.isFinite(months) || months === 0) return;
  c.totalMonths += months;
  c.age = Math.floor(c.totalMonths / TIME_COSTS.monthsPerYear);
}
export function advanceYears(state: GameState, years: number): void {
  advanceMonths(state, years * TIME_COSTS.monthsPerYear);
}
/** 按动作键推进耗时（配置表 costs）。 */
export function advanceActionMonths(state: GameState, key: TimeCostKey): void {
  advanceMonths(state, timeCostMonths(key));
}
/** 按目的地推进旅行耗时（配置表 travelMonths，1–6 月）。 */
export function advanceTravelMonths(state: GameState, locationId: string): void {
  advanceMonths(state, travelMonthsTo(locationId));
}

// ---------- U-609 寿元按月结算（Q37 细时钟第二项） ----------
// 寿元上限仍以年存（lifespan，境界表/天赋/延寿口径不变），结算时
// 一律换算成月与累计月份 totalMonths 比较：120 岁 = 1440 月。寿终
// 判定按月触发——累计月份一跨过上限即坐化，不必等年龄整岁跳变；
// 任何按「余下寿元」做的守卫（如祭练承世玉）同样先换算成月再比。
/** 寿元上限换算成月。 */
export function lifespanMonthsOf(c: { lifespan: number }): number {
  return c.lifespan * TIME_COSTS.monthsPerYear;
}
/** 距寿元上限还剩的月数（已越限为 0）。 */
export function lifespanMonthsLeft(c: { lifespan: number; totalMonths: number }): number {
  return Math.max(0, lifespanMonthsOf(c) - c.totalMonths);
}
/** 年数换算成月（与 advanceYears 同一换算，供寿元类守卫按月比较）。 */
export function monthsOfYears(years: number): number {
  return years * TIME_COSTS.monthsPerYear;
}
// 享年文案按月口径：整岁写「X岁」，有余月写「X岁Y个月」。
function ageMonthsText(totalMonths: number): string {
  const years = Math.floor(totalMonths / TIME_COSTS.monthsPerYear);
  const rem = totalMonths % TIME_COSTS.monthsPerYear;
  return rem > 0 ? `${years}岁${rem}个月` : `${years}岁`;
}

export function checkDeath(state: GameState, cause: string) {
  const c = state.character;
  if (!c || c.dead) return;
  if (c.hp <= 0) {
    c.hp = 0; c.dead = true; c.deathCause = cause;
    pushLog(state, c.lifeNo, "death", `第${c.lifeNo}世陨落：${cause}。享年${ageMonthsText(c.totalMonths)}，止步${realmText(c, state.settings)}。`);
  } else if (c.totalMonths >= lifespanMonthsOf(c)) {
    c.dead = true; c.deathCause = "寿元耗尽，坐化于洞府之中";
    pushLog(state, c.lifeNo, "death", `第${c.lifeNo}世寿终：享年${ageMonthsText(c.totalMonths)}，止步${realmText(c, state.settings)}。`);
  }
}
export function applyEffects(state: GameState, eff: Effect, opts?: { decayed?: boolean }) {
  const c = state.character;
  if (!c) return;
  const resilient = c.talentIds.includes("t_resilient");
  const wealthy = c.talentIds.includes("t_wealth");
  const social = c.talentIds.includes("t_social");
  if (eff.cult) {
    let v = eff.cult;
    if (v > 0 && opts?.decayed) v = Math.max(1, Math.floor(v * decayMult(c.groupCounts[locById(c.locationId)?.group ?? ""] ?? 0)));
    c.cultivation += v; c.totalCultivation += Math.max(0, v);
  }
  if (eff.hp) {
    let v = eff.hp;
    if (v < 0 && resilient) v = Math.ceil(v / 2);
    // U-617：护命类法宝（不灭心灯）受伤减免——在天赋减伤之后按
    // 配置百分比再减一层（向零取整，至少伤 1 点的口径与 resilient
    // 的 Math.ceil 一致）；无此 fx 时结算逐字不变。
    if (v < 0) {
      const fx = activeArtifactFx(state, c);
      if (fx?.dmgReducePct) v = Math.ceil(v * (1 - fx.dmgReducePct / 100));
    }
    c.hp = Math.max(0, Math.min(c.maxHp, c.hp + v));
  }
  if (eff.mp) c.mp = Math.max(0, Math.min(c.maxMp, c.mp + eff.mp));
  if (eff.stones) {
    let v = eff.stones;
    if (v > 0 && wealthy) v = Math.floor(v * 1.5);
    c.stones = Math.max(0, c.stones + v);
  }
  if (eff.karma) c.karma += social && eff.karma > 0 ? eff.karma * 2 : eff.karma;
  // U-608：效果的 age 单位仍是年，经细时钟口换算成月份推进（年口径不变）。
  if (eff.age) advanceYears(state, eff.age);
  if (eff.shard) grantShards(state, eff.shard);
}

// U-377 代价结算：选定带代价的选项时，在掷骰结算收益之前先付代价。
// 与 applyEffects 分开：代价是明码标价，必须按配置原数精确扣减——
// 不吃天赋修正（耐揍减伤/富贵加成）、不吃地点衰减，否则玩家看到的
// 标价与实扣对不上。可付性已由 eventCostBlockReason 复核（气血付后
// ≥1），这里的 clamp 只是防御性兜底。
export function applyEventCost(state: GameState, cost: Effect) {
  const c = state.character;
  if (!c) return;
  if (cost.hp) c.hp = Math.max(1, c.hp + cost.hp);
  if (cost.mp) c.mp = Math.max(0, c.mp + cost.mp);
  if (cost.stones) c.stones = Math.max(0, c.stones + cost.stones);
  if (cost.cult) c.cultivation = Math.max(0, c.cultivation + cost.cult);
  if (cost.karma) c.karma += cost.karma;
}

// Q16：发放记忆碎片；跨过章节门槛时记一笔，集满时主线达成（一次性奖励）。
export function grantShards(state: GameState, n: number) {
  const c = state.character;
  const before = state.mainline.shards;
  state.mainline.shards = Math.min(MAINLINE_TOTAL_SHARDS, before + n);
  if (state.mainline.shards <= before || !c) return;
  const unlocked = MAINLINE_CHAPTERS.filter((ch) => state.mainline.shards >= ch.need).length;
  const wasUnlocked = MAINLINE_CHAPTERS.filter((ch) => before >= ch.need).length;
  if (unlocked > wasUnlocked) {
    const ch = MAINLINE_CHAPTERS[unlocked - 1];
    if (ch) pushLog(state, c.lifeNo, "mainline", `🧩 前世之谜推进：记忆碎片 ${state.mainline.shards}/${MAINLINE_TOTAL_SHARDS}，揭开第${unlocked}章「${ch.title}」。`);
  }
  if (state.mainline.shards >= MAINLINE_TOTAL_SHARDS && !state.mainline.done) {
    state.mainline.done = true;
    c.legacyPoints += 5;
    pushLog(state, c.lifeNo, "mainline", "🧩 前世之谜全解：玄微真人的记忆尽数归位！得传承点 +5，此后每世降生携带前世道果（神识 +4、机缘 +4）。");
  }
}

// Q18：结下或加深一段关系（同 NPC 已有关系时只调整 bond，不重复建）。
export function addRelation(state: GameState, c: Character, npcId: string, kind: RelKind, bond: number, note: string) {
  const npc = npcById(npcId);
  if (!npc) return;
  const existing = c.relations.find((r) => r.npcId === npcId);
  if (existing) {
    existing.bond = Math.max(0, Math.min(100, existing.bond + (existing.kind === "enemy" ? bond : 10)));
    return;
  }
  c.relations.push({ npcId, name: npc.name, kind, bond, note });
  const kindLabel = kind === "partner" ? "道侣" : kind === "master" ? "师父" : kind === "disciple" ? "徒弟" : kind === "enemy" ? "仇敌" : "道友";
  pushLog(state, c.lifeNo, "social", kind === "enemy"
    ? `⚔️ 结下仇敌：${npc.name}（${npc.title}）——${note}仇怨 ${bond}，深了会来寻仇。`
    : `🤝 结下${kindLabel}：${npc.name}（${npc.title}）——${note}。`);
}
export function hasRelationKind(c: Character, kind: RelKind): boolean {
  return c.relations.some((r) => r.kind === kind);
}
export function bumpGroupCount(c: Character) {
  const g = locById(c.locationId)?.group ?? c.locationId;
  c.groupCounts[g] = (c.groupCounts[g] ?? 0) + 1;
}

// Applies accumulated cultivation into stage/realm advancement (used for
// inheritance at reincarnation). Returns nothing; mutates stats to new realm.
export function applyCultivationLevels(state: GameState) {
  const c = state.character;
  if (!c) return;
  const realms = realmsFor(state.settings);
  let guard = 0;
  while (guard++ < 60) {
    const need = threshold(c.realmIdx, c.stageIdx);
    if (c.cultivation < need) break;
    c.cultivation -= need;
    if (c.stageIdx < 3) {
      c.stageIdx += 1;
    } else if (c.realmIdx < realms.length - 1) {
      c.realmIdx += 1; c.stageIdx = 0;
      const def = realms[c.realmIdx];
      if (def) { c.lifespan = def.lifespan; c.maxHp = def.hp; c.maxMp = def.mp; }
    } else {
      c.cultivation = need; break;
    }
  }
  c.hp = c.maxHp; c.mp = c.maxMp;
  // U-618：修为进阶跨过境界时，封存中的本命法宝可能就此达门槛——
  // 在此统一对齐（自动解封补加成），与突破路径同一入口。
  syncArtifactGate(state, c);
}

// ---------- U-573 种子化随机：每判定一个独立实例 ----------
// 存档固定在 saves 表 id=1，种子里的「存档ID」即 1。种子由
// 存档ID + 世数 + 事件类型（opType）+ 操作序号（state.rngSeq）拼成
// 可读字符串；每次调用取走当前序号并 +1（随下一次 saveState 持久化）。
// 同一存档、同一世数、同一操作序号重放同一操作，必得同一结果；
// 不同操作序号互不相同，避免同类操作永远掷出同一骰。调用方若最终
// 没有保存存档（如无声返回的早退路径），序号不落盘，重试即重放。
export const SAVE_ID = 1;

// ---------- U-574 PRNG 状态保存与恢复：流位置的显式快照/恢复 ----------
// 本游戏的随机流位置由「种子标识 + rngSeq 序号」完全决定（每个操作
// 的实例都从这两者派生，见 rngForNext）。U-574 把这个位置做成显式
// 的存档字段 rngState：保存时快照、读档时恢复，中途退出重进后随机
// 序列不断档。种子公式、序号递增与一切概率数值与 U-573 逐字不变——
// 同一位置派生出的种子串与改前完全相同。
// 本存档随机流的种子标识（与 makeSeed 的 save:<存档ID> 段一致）。
export function rngStreamSeed(): string {
  return `save:${SAVE_ID}`;
}
// 保存：把随机流当前位置快照进 state.rngState（随存档一并落盘）。
// saveState 落盘前调用；rngForNext 每次取号后也调用一次，保证内存
// 中的 rngState 与 rngSeq 始终同位。
export function snapshotRngState(state: GameState): void {
  state.rngState = { seed: rngStreamSeed(), seq: state.rngSeq ?? 0 };
}
// 恢复：读档时以 rngState.seq 为准恢复 rngSeq——存档里的显式流位置
// 优先于 rngSeq 字段本身。rngState 缺失（旧存档）、种子标识不属于
// 本存档的流、或 seq 非法时不动 rngSeq，按原有种子规则兜底、不报错。
export function restoreRngState(state: GameState): void {
  const rs = state.rngState;
  if (!rs || typeof rs !== "object") return;
  if (rs.seed !== rngStreamSeed()) return;
  if (!Number.isInteger(rs.seq) || rs.seq < 0) return;
  state.rngSeq = rs.seq;
}

export function rngForNext(state: GameState, opType: string): SeededRng {
  const seq = state.rngSeq ?? 0;
  state.rngSeq = seq + 1;
  // U-574：取号后同步刷新显式流位置，存档快照与序号永不脱节。
  snapshotRngState(state);
  const lifeNo = state.character?.lifeNo ?? state.lives.length + 1;
  return new SeededRng(makeSeed(SAVE_ID, lifeNo, opType, seq));
}

// U-576：洗一副全事件牌堆（全 80 个事件 id 各一张）。
// U-375 补做（2026-11-14 定夺）：建堆改按稀有度权重不放回抽取
// （weightedDeckCards，走 U-575 的 weighted() 选段口径）——常见
// 事件（commonality 高）倾向排在牌堆前面、稀有事件倾向沉底，一世
// 探索次数有限，稀有事件自然少见。牌堆仍是一世 80 张、不放回、
// 抽完才整副重洗（drawEventFromDeck 的三条规则不变），地点过滤与
// 本地子牌堆重洗口径不变。每世降生时调用一次，结果存进
// character.eventDeck 随存档持久化；旧存档首次探索时也走这里补洗
// （op 记为 event-deck，序号走 rngSeq，同存档同操作重放一致）。
export function shuffledEventDeck(state: GameState): string[] {
  // U-394 外传分包：建堆成员按本世世数过滤——所属外传包尚未解锁
  // （包 minLife > 本世世数）的事件不进本世牌堆；已解锁的外传包与
  // 本篇一同按既有稀有度权重不放回建堆，抽取口径（U-576）不变。
  // 世数口径与 rngForNext 一致：当前角色世数，无角色时按已历世数 +1。
  // U-395 分批投放：建堆成员另按本世牌堆版本过滤——投放版本高于
  // 本世牌堆版本的事件（本世降生之后才投放的新批次）不进本世牌
  // 堆，当世进行中的牌堆不受新批次影响；牌堆版本在降生时落定为
  // 当时最新版本（character.deckVersion），轮回开新世即推进。无
  // 角色时（新世尚未降生）按最新版本计，与新世落定值一致。
  const lifeNo = state.character?.lifeNo ?? state.lives.length + 1;
  const deckVersion = state.character?.deckVersion ?? CURRENT_EVENT_VERSION;
  const pool = EVENTS.filter((e) => eventUnlockedForLife(e.id, lifeNo) && eventReleasedForDeck(e.id, deckVersion));
  return weightedDeckCards(rngForNext(state, "event-deck"), pool.map((e) => ({ value: e.id, commonality: e.commonality })));
}

// U-576 修复（提前重洗）：从本世事件牌堆里为当前地点抽一张事件牌。
// 初版的问题：本地点的牌抽完时，即使主牌堆里还留着其他地点的牌，也
// 整副重洗覆盖余牌——已抽过的事件提前回池、未抽的其他地点牌被丢弃，
// 且不是严格从牌堆顶依次抽。修复后的规则：
// 1. 主牌堆里还有本地点可用的牌 → 从牌堆顶往下取第一张并抽走（其余
//    牌序一字不动），本世内抽过的事件不再出现。
// 2. 本地点在主牌堆里已无可用牌、但整副牌堆还没抽完（仍有可玩牌）
//    → 只拿「本地点本世已抽过的牌」重洗一个本地点子牌堆抽一张（优先
//    避开紧邻的上一个事件），主牌堆一字不动：其他地点未抽的牌不丢、
//    别处抽过的牌不回池。只有本地点内部允许重复，这是池子小于探索
//    次数时不可避免的，且重复范围被关在本地点已抽集合内。
// 3. 整副牌堆的可玩牌全部抽完（牌堆为空，或只剩 cave_takeover 这种
//    本世已出过、不可再玩的牌）→ 才整副重洗一副新牌堆，再按规则 1 抽。
// cave_takeover 每世只出一次：本世已接管洞府后它不算可用牌、也不算
// 已抽牌（不会被子牌堆捞回来）。无可用事件（地点无事件池）时返回
// undefined，调用方沿用旧兜底。
export function drawEventFromDeck(state: GameState, c: Character): EventDef | undefined {
  // U-394：本地点池同样只含本世已解锁分包的事件（与建堆口径一致；
  // 规则 2 的本地点子牌堆从本池取「已抽过」的牌，未解锁事件从未进
  // 过牌堆，自然不在子牌堆里）。
  // U-395：本地点池同口径再按本世牌堆版本过滤——投放版本高于本
  // 世牌堆版本的事件从未进过本世牌堆，不得被规则 2 当作「已抽
  // 过」捞进子牌堆；当世中途整副重洗（规则 3）走 shuffledEventDeck
  // 同一过滤，口径一致。
  const pool = EVENTS.filter((e) => e.locations.includes(c.locationId) && eventUnlockedForLife(e.id, c.lifeNo) && eventReleasedForDeck(e.id, c.deckVersion) && !(e.id === "cave_takeover" && c.caveClaimedLife === c.lifeNo));
  if (pool.length === 0) return undefined;
  if (!c.eventDeck) c.eventDeck = [];
  const playable = (id: string) => !(id === "cave_takeover" && c.caveClaimedLife === c.lifeNo);
  // 规则 3：整副牌堆的可玩牌抽完才整副重洗（旧存档空堆在此补洗）。
  if (!c.eventDeck.some(playable)) c.eventDeck = shuffledEventDeck(state);
  // 规则 1：从牌堆顶往下取第一张本地点可用的牌。
  let idx = c.eventDeck.findIndex((id) => pool.some((e) => e.id === id));
  if (idx >= 0) {
    // Q34 补充口径·机缘牵引（抽牌偏置）：气运够高时，有一定概率不取
    // 堆顶的本地点牌，而是取本地点牌里档位最高的那张（最高选项难度
    // 高出堆顶牌至少 drawBiasMinGap 才算高阶机缘）——低境界也可能
    // 碰见高境界的机缘；抽走的牌照常从牌堆移除，本世不重复不变。
    // 难度按境界差的上调与气运抵消在 actions-play 探索结算处按
    // FATE_TIER 计算（fateTierBump）。
    const fortune = attrOf(c, "fortune");
    if (fortune >= FATE_TIER.drawBiasMinFortune) {
      const localIdxs = c.eventDeck.map((id, i) => (pool.some((e) => e.id === id) ? i : -1)).filter((i) => i >= 0);
      if (localIdxs.length >= 2) {
        const maxDcOf = (id: string | undefined) => Math.max(0, ...(EVENTS.find((e) => e.id === id)?.options.map((o) => o.dc) ?? [0]));
        let bestIdx = idx;
        for (const i of localIdxs) if (maxDcOf(c.eventDeck[i]) > maxDcOf(c.eventDeck[bestIdx])) bestIdx = i;
        if (bestIdx !== idx && maxDcOf(c.eventDeck[bestIdx]) - maxDcOf(c.eventDeck[idx]) >= FATE_TIER.drawBiasMinGap) {
          const p = Math.min(FATE_TIER.drawBiasChanceMax, (fortune - FATE_TIER.drawBiasMinFortune) / FATE_TIER.drawBiasChanceDivisor);
          if (rngForNext(state, "event-deck:fate").chance(p)) idx = bestIdx;
        }
      }
    }
    const id = c.eventDeck[idx];
    c.eventDeck.splice(idx, 1);
    return EVENTS.find((e) => e.id === id);
  }
  // 规则 2：本地点子牌堆——只含本地点本世已抽过的牌，主牌堆不动。
  const drawnHere = pool.filter((e) => !c.eventDeck.includes(e.id));
  if (drawnHere.length === 0) return undefined;
  let candidates = drawnHere;
  const lastId = c.recentEvents[c.recentEvents.length - 1];
  if (candidates.length > 1 && lastId) {
    const filtered = candidates.filter((e) => e.id !== lastId);
    if (filtered.length > 0) candidates = filtered;
  }
  const shuffled = rngForNext(state, "event-deck:local").shuffle(candidates);
  return shuffled[0];
}

// 判定（U-571 记号，Q34 改版）：1dS[下限~上限]+修正 vs 难度——S 为
// 所属系统的基础骰面（斗法 d20 / 突破 d100 / 探索 d80 / 副职 d60 /
// 社交 d40 / 差事 d50），[下限~上限] 由相关属性现算；修正 = 属性
// （被骰面吸收时不计）+ 承世玉 + 额外加成，总值 ≥ 难度成功。
// U-563：骰面表、每级加分、表达式与成败公式出自检定配置表
// （checks.ts）；各检定的基准难度阈值与境界加成也在该表声明（突破/
// 斗法/决斗/寻仇/副职/差事/社交），本函数只做统一结算：基准难度在
// 此按等概率换算（rescaleDc）到新骰面，成功率曲线与 d150 时代一致。
// U-573：骰面改由种子化实例掷出（独立实例，种子含本次操作序号）。
// U-568：判定改走表达式解析器——检定统一写成带动态范围的表达式由
// dice.ts 求值（修正以变量注入），全游戏判定（副职/突破/宗门差事/
// 事件选项/寻仇/斗法/社交）都经此一处，不再各处手写掷骰+加总。
// U-569：判定主流程只做「过 modifier 链（掷骰前）→ 核心掷骰 → 过
// modifier 链（掷骰后）」：modifiers 依次调整 ctx.dc/bonus 并在掷骰后
// 记账，返回的 dc/bonus 是过链后的生效值。不传 modifiers 时与改前
// 逐字等价（链为空、dc/bonus 不变、随机流消耗不变）。
// U-570：rollCheck 返回值在原有汇总字段（dice/bonus/total/dc/success，
// 旧调用点不传新字段照常工作）之外，多带一份结构化明细 detail（见
// dice.ts 的 CheckDetail）：每颗骰子的原始骰值、修正构成、链前/链后
// 阈值、modifier 生效过程、胜势差与成功/失败等级，外加一行可审计
// 文本。modifier 链改为逐个过钩子并在每个环节前后快照 dc/bonus 以
// 记录 trace：先整链校验（与 U-569 一次整链调用的校验时机一致），
// 钩子执行顺序与叠加结果与改前逐字相同，不改任何判定数值与随机流。
// U-572：可选参数 rollMode（缺省 "normal"）——advantage 时表达式
// 换成 2dS[lo~hi]L（掷两颗取高）、disadvantage 时换成 2dS[lo~hi]H
// （掷两颗取低），双掷仍由同一个种子实例连续掷出，返回的 dice 为
// 取舍后保留的那一颗，detail 写清两颗骰值与取舍。触发条件由调用方
// 按其系统规则决定：现有全部调用点都不传 rollMode；固定加成不改
// 成双掷。Q34：opts.system 决定所属系统（调用方必填其系统，缺省
// 探索），opts.bond / opts.craftLevel 供社交/副职算骰面范围。
export interface RollCheckOpts {
  // Q34：本次判定所属系统（决定基础骰面与动态范围）。缺省按探索。
  system?: CheckSystem;
  // 社交系统：对方好感（仇敌为仇怨），无既有关系时 0。
  bond?: number;
  // 副职系统：副职等级（U-482 熟练度等级，由该门使用次数查配置表派生）。
  craftLevel?: number;
}

export function rollCheck(state: GameState, c: Character, attr: string, dc: number, extraBonus = 0, modifiers: CheckModifier[] = [], rollMode: RollMode = "normal", opts: RollCheckOpts = {}): { dice: number; bonus: number; total: number; dc: number; success: boolean; detail: CheckDetail; scaledMargin: number } {
  assertRollMode(rollMode);
  const system: CheckSystem = opts.system ?? "explore";
  const attrValue = attrOf(c, attr);
  // U-563：承世玉每层加分出自检定配置表（extraPointsPerLevel.jadeLayer）。
  const jadeBonus = c.jadeLayers * CHECK_CONFIG.extraPointsPerLevel.jadeLayer;
  // Q34：本次掷骰的动态范围现算（不进存档）。撑起范围的属性被吸收
  // （absorbed）时不再进固定修正，防重复计算；基准修正 bonusBaseline
  // 仍按 d150 时代口径（属性 + 承世玉 + 额外加成）算，供难度等概率
  // 换算（rescaleDc）保持成功率曲线不变。
  const sectRankIdx = Math.max(0, SECT_RANKS.findIndex((r) => r.id === c.sectRankId));
  const range = diceRangeFor(system, {
    attr, attrValue,
    fortune: attrOf(c, "fortune"), sense: attrOf(c, "sense"),
    realmIdx: c.realmIdx, sectRankIdx, bond: opts.bond ?? 0, craftLevel: opts.craftLevel ?? 0,
  });
  const bonusBaseline = attrValue + jadeBonus + extraBonus;
  const bonus = bonusBaseline - (range.absorbed ? attrValue : 0);
  const dcScaled = rescaleDc(dc, bonusBaseline, bonus, range.lo, range.hi);
  const attrLabel = ATTR_NAME[attr] ?? attr;
  const bonusParts = [{ label: range.absorbed ? `${attrLabel}（计入骰面 ${range.lo}~${range.hi}）` : attrLabel, value: range.absorbed ? 0 : attrValue }];
  if (jadeBonus !== 0) bonusParts.push({ label: "承世玉", value: jadeBonus });
  if (extraBonus !== 0) bonusParts.push({ label: "额外加成", value: extraBonus });
  const ctx: CheckModifierContext = { dc: dcScaled, bonus, dice: null, total: null, success: null };
  assertModifierChain(modifiers);
  const trace: ModifierTraceEntry[] = [];
  const snapshot = (m: CheckModifier, phase: "before" | "after", before: { dc: number; bonus: number }) => {
    trace.push({
      name: m.name, label: m.label ?? m.name, phase,
      dcBefore: before.dc, dcAfter: ctx.dc, dcDelta: ctx.dc - before.dc,
      bonusBefore: before.bonus, bonusAfter: ctx.bonus, bonusDelta: ctx.bonus - before.bonus,
    });
  };
  for (const m of modifiers) {
    const before = { dc: ctx.dc, bonus: ctx.bonus };
    runModifiersBefore([m], ctx);
    snapshot(m, "before", before);
  }
  // modifier 若在掷骰前改了修正（如未来的加成类修饰），其增减也记进
  // 修正构成，保证明细自洽（buildCheckDetail 会校验合计）。
  for (const t of trace) if (t.phase === "before" && t.bonusDelta !== 0) bonusParts.push({ label: t.label, value: t.bonusDelta });
  // Q34：表达式与成败公式都出自检定配置表（checks.ts）——表达式按
  // 系统基础骰面 + 本次动态范围拼出（如「1d20[5~30]+修正」），解析器
  // 在 [lo, hi] 内逐颗掷；成败走 isCheckSuccess（总值 ≥ 难度，难度
  // ≤ 0 自动成功）。难度 dc 是调用方按基准标尺声明的原始难度，
  // ctx.dc 是等概率换算后的生效难度（baseDc 记换算值，与保底等
  // modifier 的调整区分）。
  // U-572：双掷模式按各系统骰面适配（2dS[lo~hi]L / H）。
  const result = evaluateDiceExpression(rngForNext(state, `check:${attr}`), checkExpressionFor(rollMode, range), { 修正: ctx.bonus });
  const firstGroup = result.groups[0];
  if (!firstGroup || firstGroup.rolls.length === 0) throw new Error("dice: check produced no dice rolls");
  // dice = 判定采用的骰值：普通判定是唯一一颗；双掷是取舍后保留的
  // 那一颗（keptRolls 缺省时回退到原始骰值，普通路径与改前相同）。
  const dice = (firstGroup.keptRolls ?? firstGroup.rolls)[0] ?? 0;
  const total = result.total;
  const success = isCheckSuccess(total, ctx.dc);
  ctx.dice = dice; ctx.total = total; ctx.success = success;
  for (const m of modifiers) {
    const before = { dc: ctx.dc, bonus: ctx.bonus };
    runModifiersAfter([m], ctx);
    if (ctx.dc !== before.dc || ctx.bonus !== before.bonus) snapshot(m, "after", before);
  }
  const scaledMargin = scaleMargin(total - ctx.dc, range.lo, range.hi);
  const detail = buildCheckDetail({
    expression: result.text, groups: result.groups,
    attrLabel: ATTR_NAME[attr] ?? attr, bonusParts,
    baseDc: dcScaled, dc: ctx.dc, success, modifierTrace: trace,
    system, scaledMargin,
  });
  return { dice, bonus: ctx.bonus, total, dc: ctx.dc, success, detail, scaledMargin };
}

// 副职/情境天赋检定加成（炼丹/炼器/垂钓/灵田/赌石/镇魔与论道/草木
// 机缘）：加分表在 U-563 检定配置表（checks.ts 的 CRAFT_TALENT_POINTS /
// EVENT_TALENT_RULES）一处维护，此处只转发，数值逐字不变。
export function craftBonusFor(c: Character, kind: string): number {
  return craftTalentBonus(c.talentIds, kind);
}
// U-464：某阶矿石的持有数（存档字段 ores，缺键 = 0）。
export function oreCountFor(c: Character, oreId: string): number {
  const v = c.ores?.[oreId];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

// U-482：某门副职的使用次数（存档字段 craftUses，缺键 = 0）。
export function craftUsesFor(c: Character, kind: string): number {
  const v = c.craftUses?.[kind];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}
// U-482：某门副职的熟练度（派生量：使用次数 × 配置表每次熟练度）。
export function craftProficiencyOf(c: Character, kind: string): number {
  return craftProficiencyFor(craftUsesFor(c, kind));
}
// U-482：某门副职的熟练度等级（Q34 副职 d60 的「副职等级」新口径，
// 取代旧的天赋有无 1/0 代理；U-619 炼制双门槛读的炼器等级即
// craftLevelFor(c, "forge")）。等级表出自配置表 craft-skills.json。
export function craftLevelFor(c: Character, kind: string): number {
  return craftLevelDefFor(craftUsesFor(c, kind)).level;
}
// U-482：某门副职当前等级的破限产量加成%（成功收益放大，结算点
// 在 actions-play 的副职分支；入门档为 0）。
export function craftYieldPctOf(c: Character, kind: string): number {
  return craftYieldPctFor(kind, craftLevelFor(c, kind));
}
// ---------- U-619 炼制本命法宝双门槛 ----------
// 开炉炼制某阶法宝须同时满足两项（数值出自配置表 forge.json 的
// minCraftLevel / minRealm，加载自检把关）：炼器熟练度等级（U-482
// 口径 craftLevelFor(c, "forge")）与角色当前境界。missing 逐项列
// 出未达标的那一项（两项都缺时两项都列），锻造台整形（respond）
// 与 forgeArtifact 服务端守卫共用同一口径——入口关闭与服务端拦
// 截永远一致。门槛只拦开炉：锻造判定、产出、代价、失败规则与
// U-618 封存/解封均不在此列。
export interface ForgeGate { open: boolean; craftLevel: number; missing: string[] }
export function forgeGateFor(state: GameState, c: Character, t: ForgeTierDef): ForgeGate {
  const missing: string[] = [];
  const level = craftLevelFor(c, "forge");
  if (level < t.minCraftLevel) {
    const needName = CRAFT_SKILLS.levels.find((l) => l.level === t.minCraftLevel)?.name ?? "";
    const curName = craftLevelDefFor(craftUsesFor(c, "forge")).name;
    missing.push(`炼器等级不足：需 Lv${t.minCraftLevel}${needName ? `「${needName}」` : ""}，你现在 Lv${level}「${curName}」（炼器熟练度 ${craftProficiencyOf(c, "forge")}）`);
  }
  if (c.realmIdx < t.minRealm) {
    const realms = realmsFor(state.settings);
    const needRealm = realms[t.minRealm]?.name ?? CLASSIC_REALMS[t.minRealm]?.name ?? "";
    const curRealm = realms[c.realmIdx]?.name ?? "";
    missing.push(`境界不足：需${needRealm}境，你现在${curRealm}境`);
  }
  return { open: missing.length === 0, craftLevel: level, missing };
}
export function eventBonusFor(c: Character, ev: EventDef): number {
  return eventTalentBonus(c.talentIds, ev);
}

export function applyTalentsOnCreate(c: Character) {
  if (c.talentIds.includes("t_longlife")) c.lifespan = Math.floor(c.lifespan * 1.2);
  if (c.talentIds.includes("t_sturdy")) { c.maxHp += 20; c.hp += 20; }
  if (c.talentIds.includes("t_focus")) { c.maxMp += 20; c.mp += 20; }
}
// U-002：降生时把开局分配（birthBoost）落到新角色四维上并清空待分配，
// 返回说明文案（无分配时返回空串）。在灵根/命格/法宝/天赋等既有加成
// 全部落定后调用，纯叠加、不改任何既有加成口径。
export function applyBirthBoost(state: GameState, c: Character): string {
  const b = state.birthBoost;
  if (!b) return "";
  state.birthBoost = null;
  const parts: string[] = [];
  const attrs = ["might", "sense", "fortune", "body"] as const;
  for (const attr of attrs) {
    const v = b[attr];
    if (v > 0) { c[attr] += v; parts.push(`${ATTR_NAME[attr] ?? attr} +${v}`); }
  }
  return parts.length > 0 ? `🔄 轮回点淬体：${parts.join("、")}（开局分配，降生生效）。` : "";
}
// U-021：降生时把已购的「再战天道」强化项（birthBoons）一次性落到
// 新角色上并清空待生效列表，返回说明文案（无强化项时返回空串）。
// 强化的是气血/法力上限、寿元与开局灵石——不碰四维初始属性、天赋、
// 灵根（那是 U-002 的花费项），也不改任何既有加成口径，纯叠加。
// 在灵根/命格/法宝/天赋与 birthBoost 全部落定后调用：寿元按当时的
// 寿元基数取百分比，气血/法力上限加成同时补满当前值。
export function applyBirthBoons(state: GameState, c: Character): string {
  const ids = state.birthBoons ?? [];
  if (ids.length === 0) return "";
  state.birthBoons = [];
  const names: string[] = [];
  for (const id of ids) {
    const boon = birthBoonById(id);
    if (!boon) continue;
    const e = boon.effect;
    if (e.hp) { c.maxHp += e.hp; c.hp += e.hp; }
    if (e.mp) { c.maxMp += e.mp; c.mp += e.mp; }
    if (e.stones) c.stones += e.stones;
    if (e.lifespanPct) c.lifespan = Math.max(30, Math.floor(c.lifespan * (1 + e.lifespanPct / 100)));
    names.push(boon.name);
  }
  return names.length > 0 ? `⚔️ 轮回点强化再战天道：${names.join("、")}（开局购入，降生生效）。` : "";
}
// 法宝修正表在 U-563 检定配置表（checks.ts 的 ARTIFACT_BONUSES）一处
// 维护，此处按表通用结算（未知法宝无修正，与改前逐字一致）。
export function applyArtifactBonus(c: Character, artifactId: string) {
  const bonus = artifactBonusFor(artifactId);
  const attrs: AttrKey[] = ["might", "sense", "fortune", "body"];
  for (const attr of attrs) c[attr] += bonus[attr] ?? 0;
}
export function removeArtifactBonus(c: Character, artifactId: string) {
  const bonus = artifactBonusFor(artifactId);
  const attrs: AttrKey[] = ["might", "sense", "fortune", "body"];
  for (const attr of attrs) c[attr] = Math.max(1, c[attr] - (bonus[attr] ?? 0));
}

// ---------- U-618 本命法宝分级使用门槛 ----------
// 门槛在配置表（artifacts.json 的 minRealm，按功能强度逐件定，弱功能
// 低境界、强功能高境界）。三条赋予路径（降生 Q9 自带 / 轮回赎回 /
// 签到认主）统一走 grantArtifact：境界达门槛才落属性修正，未达则
// 封存——法宝保留在栏位、加成不生效、界面明示「境界不足，暂不可
// 用」；境界其后达到门槛（突破 / 修为进阶 / 读档对齐）时由
// syncArtifactGate 自动解封补上加成，不没收、不删除。sync 幂等：
// 状态已与门槛一致时一字不动，可在任意结算点重复调用。
export interface ArtifactGate { def: ArtifactDef | null; minRealm: number; minRealmName: string; usable: boolean; sealed: boolean }
export function artifactGate(state: GameState, c: Character): ArtifactGate {
  const def = artifactById(c.artifactId) ?? null;
  if (!def) return { def: null, minRealm: 0, minRealmName: "", usable: false, sealed: false };
  const usable = c.realmIdx >= def.minRealm;
  return {
    def, minRealm: def.minRealm,
    minRealmName: realmsFor(state.settings)[def.minRealm]?.name ?? CLASSIC_REALMS[def.minRealm]?.name ?? "",
    usable, sealed: !usable,
  };
}
// 把法宝的生效状态与当前境界对齐：该生效而未生效 → 补加成并记解封
// 日志；不该生效而生效中 → 收回加成（封存，法宝本身保留在栏位）。
// 角色已陨落时只对齐数值、不写日志（结算挑选的门槛另按陨落时境界
// 在 buildReincarnation 里判定，不读这里的加成状态）。
export function syncArtifactGate(state: GameState, c: Character): void {
  const gate = artifactGate(state, c);
  if (!gate.def) { c.artifactBonusApplied = false; return; }
  if (gate.usable && !c.artifactBonusApplied) {
    applyArtifactBonus(c, gate.def.id);
    c.artifactBonusApplied = true;
    if (!c.dead) pushLog(state, c.lifeNo, "artifact", `🗡️ 本命法宝解封：「${gate.def.name}」——境界已至${gate.minRealmName}，法宝认主，属性加成生效（${gate.def.desc}）。`);
  } else if (!gate.usable && c.artifactBonusApplied) {
    removeArtifactBonus(c, gate.def.id);
    c.artifactBonusApplied = false;
    if (!c.dead) pushLog(state, c.lifeNo, "artifact", `🔒 本命法宝封存：「${gate.def.name}」需${gate.minRealmName}境方能认主，当前境界不足——法宝保留在身、暂不可用，境界达到后自动解封。`);
  }
}
// 统一赋予入口：落栏位后立刻按门槛对齐（达门槛生效、未达封存）。
// 返回是否处于封存状态，供调用方写降生/认主文案。
export function grantArtifact(state: GameState, c: Character, def: ArtifactDef): boolean {
  c.artifactId = def.id;
  c.artifactName = def.name;
  c.artifactBonusApplied = false;
  syncArtifactGate(state, c);
  return artifactGate(state, c).sealed;
}

// ---------- U-620 多途径获取：统一赋予口径 ----------
// 探索掉落 / 宗门赐宝 / 委托赠宝三条新途径共用，与 U-391 签到法
// 宝同一口径：本命法宝槽空着才认主这件法宝（走 grantArtifact 统
// 一入口，U-618 门槛对齐——未达门槛封存、达门槛生效）；槽已占则
// 不替换，按配置 occupiedFallback 折作结算（applyEffects 既有
// 链）。返回结局供各调用方写各自的来源文案；法宝 id 非法（配置
// 自检已拦，运行时兜底）返回 null 且状态一字不动。
export type ArtifactGrantOutcome = "usable" | "sealed" | "fallback";
export function settleArtifactGrant(state: GameState, c: Character, artifactId: string, occupiedFallback: Effect): ArtifactGrantOutcome | null {
  const def = artifactById(artifactId);
  if (!def) return null;
  if (!c.artifactId) return grantArtifact(state, c, def) ? "sealed" : "usable";
  applyEffects(state, occupiedFallback);
  return "fallback";
}

// 赋予结局的一句人话（日志尾巴与板面文案共用）：认主生效 / 封存
// 待解封 / 槽已占折作，三种结局与 settleArtifactGrant 的落账逐项
// 一致——封存文案带门槛境界名与解封条件，折作文案带实际折作值。
export function artifactGrantOutcomeText(state: GameState, c: Character, artifactId: string, outcome: ArtifactGrantOutcome, occupiedFallback: Effect): string {
  const def = artifactById(artifactId);
  const name = def?.name ?? artifactId;
  if (outcome === "usable") return `法宝「${name}」认主生效（${def?.desc ?? ""}）`;
  if (outcome === "sealed") {
    const gate = artifactGate(state, c);
    return `法宝「${name}」入手（${def?.desc ?? ""}）——但此宝需${gate.minRealmName}境方能认主，当前境界不足，法宝封存暂不可用，境界达到后自动解封`;
  }
  return `已有本命法宝在身，「${name}」不再认主——折作${formatEffectGains(occupiedFallback)}`;
}

// U-617：功能效果（fx）的统一生效口径——与四维修正同一道门槛：
// 持有法宝且境界已达该宝 minRealm（artifactGate.usable）时 fx 才
// 生效，封存期间一律不生效。各结算点只经此 helper 读 fx，不各自
// 判断门槛。现有 6 件无 fx，返回 null，各结算点行为逐字不变。
export function activeArtifactFx(state: GameState, c: Character): ArtifactFx | null {
  const gate = artifactGate(state, c);
  if (!gate.def || !gate.usable) return null;
  return gate.def.fx ?? null;
}

// ---------- Q15 斗法结算（fight 动作与 U-381 路线战斗/精英节点共用） ----------
// 自 actions-world 的 fight 动作原样抽出：难度按敌手境界定（combatDc），
// 掷斗法骰 d20（Q34，战力计入骰面），胜负奖励/伤势按归一化胜势差浮
// 动结算，耗时一年。调用方负责各自的守卫（地点校验、待决事件、路线
// 状态）与周衰减键刷新；结算数值与日志文案与抽出前逐字一致。
export function resolveFight(state: GameState, c: Character, enemy: EnemyDef): void {
  // U-563：斗法难度公式在检定配置表（COMBAT_CHECK / combatDcFor，
  // data.ts 的 combatDc 转发至此），数值逐字不变。
  const dc = combatDc(enemy);
  // Q34：斗法系统骰面 d20（上下限随战力现算）；胜势差用归一化值
  // （scaleMargin 换算回基准标尺），奖惩公式与数值结构不变。
  const roll = rollCheck(state, c, COMBAT_CHECK.attr, dc, 0, [], "normal", { system: "combat" });
  const margin = roll.scaledMargin;
  if (roll.success) {
    const rewardRng = rngForNext(state, "fight:reward");
    let stones = rewardRng.int(20, 50) + enemy.tier * 25 + Math.max(0, margin);
    let cult = rewardRng.int(15, 35) + enemy.tier * 15 + Math.floor(Math.max(0, margin) / 2);
    // U-617：暴击类法宝（天罚雷珠）——获胜时按配置概率暴击，缴获
    // 与修为 ×1.5（向下取整）；掷骰走独立种子流（fight:crit），只在
    // 持有且已认主该宝时才掷，不扰动既有随机流。无此 fx 时逐字不变。
    let crit = false;
    const critFx = activeArtifactFx(state, c);
    if (critFx?.critChance && rngForNext(state, "fight:crit").chance(critFx.critChance)) {
      crit = true;
      stones = Math.floor(stones * 1.5);
      cult = Math.floor(cult * 1.5);
    }
    applyEffects(state, { stones, cult, karma: enemy.tier >= 2 ? 3 : 1 });
    // U-388：斗法获胜推进本地点的「斗法」类委托进度（结算数值不变）。
    bumpCommissions(state, "fight", c.locationId);
    // U-389：斗法获胜同样推进本地点的「斗法」类限时帖进度。
    bumpTimedEvents(state, "fight", c.locationId);
    const text = margin >= 40
      ? `摧枯拉朽！你以压倒之势击败${enemy.name}，缴获灵石 ${stones}、修为精进 ${cult}。`
      : `一番恶斗，你击败了${enemy.name}，缴获灵石 ${stones}、修为精进 ${cult}。`;
    c.lastRoll = { label: `斗法·${enemy.name}`, dice: roll.dice, bonus: roll.bonus, total: roll.total, dc: roll.dc, success: true, text: crit ? `${text}（天罚雷珠暴击：缴获与修为 ×1.5）` : text, detail: roll.detail };
    pushLog(state, c.lifeNo, "fight", `斗法胜：${enemy.name}（判定明细：${roll.detail.text}，胜势 +${margin}）：灵石 +${stones}、修为 +${cult}。${crit ? "天罚雷珠骤然炸响——暴击！缴获与修为按 ×1.5 结算。" : ""}`);
  } else {
    const dmg = 14 + enemy.tier * 9 + Math.min(34, Math.floor(-margin / 2));
    applyEffects(state, { hp: -dmg });
    const text = margin <= -40
      ? `完全不是对手——${enemy.name}的攻势如山压来，你重伤遁走，气血 −${dmg}。`
      : `你败给了${enemy.name}，带伤退走，气血 −${dmg}。`;
    c.lastRoll = { label: `斗法·${enemy.name}`, dice: roll.dice, bonus: roll.bonus, total: roll.total, dc: roll.dc, success: false, text, detail: roll.detail };
    pushLog(state, c.lifeNo, "fight", `斗法败：${enemy.name}（判定明细：${roll.detail.text}，败势 ${margin}）：气血 −${dmg}。`);
    // U-617：遁逃类法宝（遁光梭）——败北且气血见底（本该陨落）时
    // 按配置概率遁逃保命、气血余 1；掷骰走独立种子流（fight:escape），
    // 只在持有且已认主该宝、且确实致死时才掷。无此 fx 时逐字不变。
    if (c.hp <= 0) {
      const escFx = activeArtifactFx(state, c);
      if (escFx?.escapeChance && rngForNext(state, "fight:escape").chance(escFx.escapeChance)) {
        c.hp = 1;
        pushLog(state, c.lifeNo, "artifact", `🌀 遁光梭光华暴涨，裹住你破空遁走——本已必死的一击，竟被你从死门里逃了出来（气血余 1）。`);
      }
    }
  }
  bumpGroupCount(c);
  // U-608：斗法耗时按细时钟配置表（fight，草稿 1 月）。
  advanceActionMonths(state, "fight");
  checkDeath(state, `陨落于斗法（${enemy.name}）`);
}

// ---------- U-381 分叉路线：节点生成与层推进 ----------
// 每层节点：从五种类型里种子化不放回抽 3 个（类型必各不相同）。
// 战斗/精英的敌手在生成时就定下并存进节点（客户端明示对手与难度，
// 玩家知情选择）：敌手池优先当前地点出没的敌手（与斗法列表同一
// 池），本地点无敌手时（如百草灵田）用全图敌手池兜底——路线是出门
// 远行，途中遭遇说得通；精英取池中境界最高者（并列时种子抽一）。
export function generateRouteNodes(state: GameState, c: Character): RouteNode[] {
  const rng = rngForNext(state, "route:nodes");
  const types = randomSet(rng, 3, ROUTE_NODE_TYPES);
  const local = ENEMIES.filter((e) => e.locations.includes(c.locationId));
  const pool = local.length > 0 ? local : ENEMIES;
  return types.map((type) => {
    if (type === "combat") {
      const enemy = weighted(rngForNext(state, "route:combat"), uniformTable(pool));
      return enemy ? { type, enemyId: enemy.id } : { type };
    }
    if (type === "elite") {
      const maxTier = Math.max(...pool.map((e) => e.tier));
      const tops = pool.filter((e) => e.tier === maxTier);
      const enemy = weighted(rngForNext(state, "route:elite"), uniformTable(tops));
      return enemy ? { type, enemyId: enemy.id } : { type };
    }
    return { type };
  });
}
// 踏上路线（第 1 层）：探索动作在寻仇/遗藏两支优先触发落空后调用。
export function startRoute(state: GameState, c: Character): void {
  c.route = { layer: 1, totalLayers: ROUTE_TOTAL_LAYERS, nodes: generateRouteNodes(state, c) };
  pushLog(state, c.lifeNo, "event", `🧭 踏上分叉路线：前方之路共分 ${ROUTE_TOTAL_LAYERS} 层，每层三条岔路任选其一（战斗 / 精英 / 事件 / 商店 / 休息）——走哪条，本身就是策略。`);
}
// 推进一层：走完最后一层则路线结束（回到日常行动）。
export function advanceRoute(state: GameState, c: Character): void {
  const r = c.route;
  if (!r) return;
  if (r.layer >= r.totalLayers) {
    c.route = null;
    pushLog(state, c.lifeNo, "event", "🧭 这一程分叉路线走完，岔路尽头复归坦途。");
    return;
  }
  c.route = { layer: r.layer + 1, totalLayers: r.totalLayers, nodes: generateRouteNodes(state, c) };
}
// 一个节点结算完毕后的统一收尾：陨落则路线随本世终结，否则推进一层。
// 无进行中路线时是 no-op（普通事件在路线外结算不受影响）。
export function finishRouteStep(state: GameState, c: Character): void {
  if (!c.route) return;
  if (c.dead) { c.route = null; return; }
  advanceRoute(state, c);
}

// ---------- U-388 委托板：目标文案 / 板面补齐 / 进度推进 ----------

// 委托目标的一句人话（板面、已接列表与日志共用）：去向地点 + 既有
// 系统的行为 + 次数。地点名与委托定义都出自现有内容，不另造词。
export function commissionObjectiveText(def: CommissionDef): string {
  const locName = locById(def.locationId)?.name ?? def.locationId;
  const verb = def.objective.kind === "explore" ? "历际遇（结算事件）"
    : def.objective.kind === "fight" ? "斗法获胜"
    : def.objective.kind === "craft" ? "做副职营生"
    : "办宗门差事";
  return `在「${locName}」${verb} ${def.objective.need} 回`;
}

// 板面补齐：把张贴数补到配置表 boardSize——候选 = 当前未张贴、未接
// 取、且张贴处与目标地点都已解锁（境界够得着）的委托，种子化抽取。
// 接走的委托在接取期间不再贴；结算或放弃后回到池中，日后可再贴
// （跑腿护送这类营生本就常做常新，与副职/差事的无限营生同口径）。
// 读档（loadState）与降生时调用：板面是派生展示状态，补齐只增不改
// 已张贴的委托；随机序号走 rngSeq，同存档同位置重放结果一致。
export function ensureCommissionBoard(state: GameState): void {
  const c = state.character;
  if (!c || c.dead || !c.commissions) return;
  const cs = c.commissions;
  const size = COMMISSIONS.boardSize;
  if (cs.board.length >= size) return;
  const taken = new Set<string>([...cs.board, ...cs.active.map((a) => a.id)]);
  const pool = COMMISSIONS.commissions.filter((d) => {
    if (taken.has(d.id)) return false;
    const boardLoc = locById(d.boardLocationId);
    const targetLoc = locById(d.locationId);
    return !!boardLoc && !!targetLoc && locUnlocked(c, boardLoc) && locUnlocked(c, targetLoc);
  });
  while (cs.board.length < size && pool.length > 0) {
    const picked = weighted(rngForNext(state, "commission:board"), uniformTable(pool));
    if (!picked) break;
    cs.board.push(picked.id);
    pool.splice(pool.indexOf(picked), 1);
  }
}

// 进度推进：某个既有系统的行为在某地点结算完毕后调用——命中「目
// 标种类 + 目标地点」的已接委托各 +1（封顶 need），达成时记一笔
// 提示回张贴处结算。调用点只四处、都是既有结算的尾巴：斗法获胜
// （resolveFight）、副职结算（doSimpleAction）、宗门差事（sect
// chore）、牌堆事件结算（chooseOption 的事件分支，含路线事件节点
// 与 U-384 日常触发——同为在本地点历际遇）。不改任何既有结算数值。
export function bumpCommissions(state: GameState, kind: CommissionDef["objective"]["kind"], locationId: string): void {
  const c = state.character;
  if (!c || c.dead || !c.commissions) return;
  for (const a of c.commissions.active) {
    if (a.done) continue;
    const def = commissionById(a.id);
    if (!def || def.objective.kind !== kind || def.locationId !== locationId) continue;
    a.progress = Math.min(def.objective.need, a.progress + 1);
    if (a.progress >= def.objective.need) {
      a.done = true;
      const boardName = locById(def.boardLocationId)?.name ?? def.boardLocationId;
      pushLog(state, c.lifeNo, "commission", `📜 委托达成：「${def.title}」的目标已办妥——回「${boardName}」的告示处找委托人结算，听听这桩事背后的故事。`);
    }
  }
}

// ---------- U-389 限时事件：声望结算 / 目标文案 / 到期结算 / 板面补齐 / 进度推进 ----------

// 声望结算（本项唯一的声望入口）：把配置表的一段声望增减落到既有
// 字段——bond 落发布人的既有关系（友好关系调情谊、仇敌关系反向调
// 仇怨：声望涨则仇怨消、声望跌则仇怨涨；尚无关系时按增减方向新建
// ——正增减按发布人本性结缘、负增减记为结下仇敌），sect 落既有宗
// 门贡献字段（不为负）。不新设货币、不新设声望字段。返回一句人话
// 摘要（供日志与结算文案引用，与实际落账逐项一致）。
export function applyReputation(state: GameState, c: Character, npcId: string, delta: TimedRepDelta): string {
  const parts: string[] = [];
  const npc = npcById(npcId);
  if (delta.bond) {
    const rel = c.relations.find((r) => r.npcId === npcId);
    if (rel) {
      rel.bond = rel.kind === "enemy"
        ? Math.max(0, Math.min(100, rel.bond - delta.bond))
        : Math.max(0, Math.min(100, rel.bond + delta.bond));
    } else if (npc) {
      if (delta.bond > 0 && npc.kind !== "enemy") {
        addRelation(state, c, npcId, npc.kind, delta.bond, "因限时帖结缘");
      } else if (delta.bond < 0) {
        addRelation(state, c, npcId, "enemy", -delta.bond, "因限时帖声望受损结怨");
      }
      // 发布人本性为仇敌且声望正增、又尚无关系时：只是记了你的好，
      // 不新建关系（仇怨无从消起），摘要照记、落账为关系未动。
    }
    parts.push(`${npc?.name ?? npcId}声望 ${delta.bond > 0 ? "+" : ""}${delta.bond}`);
  }
  if (delta.sect) {
    c.sectContrib = Math.max(0, c.sectContrib + delta.sect);
    parts.push(`宗门声望 ${delta.sect > 0 ? "+" : ""}${delta.sect}`);
  }
  return parts.join("、");
}

// U-610 限时帖天/月倒计时助手：天序 = 累计月份 × 每月天数（配置表
// daysPerMonth），是两条倒计时（挂帖过期 / 接取限期）共用的时钟；
// 天数文案按月折算——不足一月写「X 天」、整月写「X 个月」、有余
// 写「X 个月零 Y 天」（板面、日志与响应整形共用一处口径）。
export function timedNowDay(c: { totalMonths: number }): number {
  return c.totalMonths * TIMED_EVENTS.daysPerMonth;
}
export function timedDaysText(days: number): string {
  const d = Math.max(0, Math.round(days));
  const per = TIMED_EVENTS.daysPerMonth;
  if (d < per) return `${d} 天`;
  const m = Math.floor(d / per);
  const r = d % per;
  return r === 0 ? `${m} 个月` : `${m} 个月零 ${r} 天`;
}

// 限时帖目标的一句人话（板面、已接列表与日志共用）：与委托目标同
// 一套行为口径（commissionObjectiveText 的动词表），另附时限。
export function timedObjectiveText(def: TimedEventDef): string {
  const locName = locById(def.locationId)?.name ?? def.locationId;
  const verb = def.objective.kind === "explore" ? "历际遇（结算事件）"
    : def.objective.kind === "fight" ? "斗法获胜"
    : def.objective.kind === "craft" ? "做副职营生"
    : "办宗门差事";
  return `在「${locName}」${verb} ${def.objective.need} 回`;
}

// 声望四段的一句人话（板面明示：接与不接、成与败各自动多少声望，
// 与配置表逐项一致，玩家接帖前就看得见代价）。
export function timedRepText(def: TimedEventDef): string {
  const fmt = (d: TimedRepDelta) => {
    const ps: string[] = [];
    if (d.bond) ps.push(`发布人声望 ${d.bond > 0 ? "+" : ""}${d.bond}`);
    if (d.sect) ps.push(`宗门声望 ${d.sect > 0 ? "+" : ""}${d.sect}`);
    return ps.join("、") || "声望不变";
  };
  return `接帖 ${fmt(def.rep.accept)} · 办成 ${fmt(def.rep.success)} · 超时/撕帖 ${fmt(def.rep.fail)} · 过期不接 ${fmt(def.rep.ignore)}`;
}

// U-610 旧存档时钟迁移（读档时调用，见 loadState，须在 settleTim-
// edEvents 之前）：U-610 之前已接/已挂的限时帖存的是按年口径
// （deadlineAge / postedAge，时钟 = 角色年龄），新口径是天序（累
// 计月份 × daysPerMonth）。换算按「剩余时间保全」：剩余年限 × 12
// × daysPerMonth = 剩余天数，新截止天序 = 当前天序 + 剩余天数、
// 挂帖按新 postDays 倒推 postedDay——玩家在旧口径下还剩多少时间，
// 换算后一分不少，不得直接判超时；旧口径下剩余已 ≤ 0（按旧规矩
// 本该在本次读档结算掉的）给一个月宽限重新起算，不在此处落账。
// 已是新口径的条目（带 deadlineDay/postedDay）原样不动；本函数只
// 换算时钟字段，不结算、不动声望与计数。换算结果随本次读档之后
// 任一动作的存档持久化。
export function migrateTimedClock(state: GameState): void {
  const c = state.character;
  if (!c || !c.timedEvents) return;
  const ts = c.timedEvents;
  const nowDay = timedNowDay(c);
  const daysPerYear = TIME_COSTS.monthsPerYear * TIMED_EVENTS.daysPerMonth;
  for (const a of ts.active as unknown as Array<ActiveTimedEvent & { deadlineAge?: unknown }>) {
    if (typeof a.deadlineDay === "number") continue;
    const old = typeof a.deadlineAge === "number" && Number.isFinite(a.deadlineAge) ? a.deadlineAge : null;
    const remainYears = old === null ? 0 : old - c.age;
    a.deadlineDay = nowDay + (remainYears > 0 ? Math.round(remainYears * daysPerYear) : TIMED_EVENTS.daysPerMonth);
    delete a.deadlineAge;
  }
  for (const p of ts.board as unknown as Array<TimedPosting & { postedAge?: unknown }>) {
    if (typeof p.postedDay === "number") continue;
    const def = timedEventById(p.id);
    const old = typeof p.postedAge === "number" && Number.isFinite(p.postedAge) ? p.postedAge : null;
    // 旧挂帖时限（postYears）在新配置表里已无对应字段，按旧定义
    // 剩余 = postedAge + postYears − age 无法再从配置读到；旧版七
    // 帖 postYears 均为 8–12 年，剩余按「挂帖总限未知」处理：以
    // 旧 postedAge 距今年限折算已挂天数，再对新 postDays 取剩余，
    // 已挂满新限的给一个月宽限（同已接帖口径，不直接判过期）。
    const postedAge = old ?? c.age;
    const elapsedDays = Math.max(0, Math.round((c.age - postedAge) * daysPerYear));
    const postDays = def?.postDays ?? TIMED_EVENTS.daysPerMonth;
    const remainDays = postDays - elapsedDays;
    p.postedDay = nowDay - (remainDays > 0 ? elapsedDays : postDays - TIMED_EVENTS.daysPerMonth);
    delete p.postedAge;
  }
}

// 到期结算（读档时调用，见 loadState）：按当前天序把两类到期一次
// 结清——① 已接未办妥且天序已到截止天序的限时帖：超时失败，结
// 算「败」段声望、失败数 +1；② 板上挂满 postDays 天无人接取的
// 帖子：过期沉底，结算「不接」段声望、过期数 +1。目标已达成的已
// 接帖不受时限约束（限时管的是「办妥」，交帖领赏随时）。角色已
// 陨落时不结算：本世限时帖随轮回清空，不跨世追罚。结算不掷骰、
// 不改任何既有系统数值；结果随本次读档之后任一动作的存档持久化
// （与 ensureCommissionBoard 的读档期派生处理同一口径）。
export function settleTimedEvents(state: GameState): void {
  const c = state.character;
  if (!c || c.dead || !c.timedEvents) return;
  const ts = c.timedEvents;
  const nowDay = timedNowDay(c);
  for (const a of [...ts.active]) {
    if (a.done) continue;
    const def = timedEventById(a.id);
    if (!def) { ts.active = ts.active.filter((x) => x !== a); continue; }
    if (nowDay < a.deadlineDay) continue;
    ts.active = ts.active.filter((x) => x !== a);
    ts.failedCount += 1;
    const rep = applyReputation(state, c, def.issuerNpc, def.rep.fail);
    const issuer = npcById(def.issuerNpc);
    pushLog(state, c.lifeNo, "timed", `⏰ 超时失败：「${def.title}」接帖后 ${timedDaysText(def.limitDays)} 限已满，目标还没办妥——${issuer ? `${issuer.name}在群里把话说得很难听` : "这事就此黄了"}（${rep}；本世限时帖失败 ${ts.failedCount} 件）。`);
  }
  for (const p of [...ts.board]) {
    const def = timedEventById(p.id);
    if (!def) { ts.board = ts.board.filter((x) => x !== p); continue; }
    if (nowDay < p.postedDay + def.postDays) continue;
    ts.board = ts.board.filter((x) => x !== p);
    ts.lapsedCount += 1;
    const rep = applyReputation(state, c, def.issuerNpc, def.rep.ignore);
    const issuer = npcById(def.issuerNpc);
    pushLog(state, c.lifeNo, "timed", `⌛ 帖子过期：「${def.title}」在告示处挂了 ${timedDaysText(def.postDays)} 无人接，帖子沉了底——${issuer ? `${issuer.name}等得心凉` : "没人再提这事"}（${rep}；本世过期帖 ${ts.lapsedCount} 张）。`);
  }
}

// 板面补齐：把挂帖数补到配置表 boardSize——候选 = 当前未挂帖、未
// 接取、且张贴处与目标地点都已解锁（境界够得着）的限时帖，种子
// 化抽取，挂帖时记下当前天序 postedDay（过期从此起算）。接走的
// 帖子在接取期间不再挂；办妥/失败/过期后回到池中，日后可再贴
// （限时营生常有常新，与委托板回池口径一致）。读档（loadState）
// 与降生时调用：补齐只增不改已挂帖子，随机序号走 rngSeq。
export function ensureTimedBoard(state: GameState): void {
  const c = state.character;
  if (!c || c.dead || !c.timedEvents) return;
  const ts = c.timedEvents;
  const size = TIMED_EVENTS.boardSize;
  if (ts.board.length >= size) return;
  const taken = new Set<string>([...ts.board.map((p) => p.id), ...ts.active.map((a) => a.id)]);
  const pool = TIMED_EVENTS.postings.filter((d) => {
    if (taken.has(d.id)) return false;
    const boardLoc = locById(d.boardLocationId);
    const targetLoc = locById(d.locationId);
    return !!boardLoc && !!targetLoc && locUnlocked(c, boardLoc) && locUnlocked(c, targetLoc);
  });
  while (ts.board.length < size && pool.length > 0) {
    const picked = weighted(rngForNext(state, "timed:board"), uniformTable(pool));
    if (!picked) break;
    ts.board.push({ id: picked.id, postedDay: timedNowDay(c) });
    pool.splice(pool.indexOf(picked), 1);
  }
}

// 进度推进：与 bumpCommissions 并行的一份——同一既有行为同时推进
// 委托与限时帖两边（各自独立计数、互不影响）。调用点与委托完全
// 相同（斗法获胜 / 副职 / 宗门差事 / 牌堆事件结算四处尾巴），不改
// 任何既有结算数值。达成时锁定成功：此后不再受截止天序约束，回
// 张贴处交帖领赏即可（超时结算在 settleTimedEvents 跳过 done）。
export function bumpTimedEvents(state: GameState, kind: TimedEventDef["objective"]["kind"], locationId: string): void {
  const c = state.character;
  if (!c || c.dead || !c.timedEvents) return;
  for (const a of c.timedEvents.active) {
    if (a.done) continue;
    const def = timedEventById(a.id);
    if (!def || def.objective.kind !== kind || def.locationId !== locationId) continue;
    a.progress = Math.min(def.objective.need, a.progress + 1);
    if (a.progress >= def.objective.need) {
      a.done = true;
      const boardName = locById(def.boardLocationId)?.name ?? def.boardLocationId;
      const left = a.deadlineDay - timedNowDay(c);
      pushLog(state, c.lifeNo, "timed", `⏳ 限时办妥：「${def.title}」的目标赶在限期内办妥了（余 ${timedDaysText(left)}）——回「${boardName}」交帖领赏，声望与报酬一并结清。`);
    }
  }
}

// ---------- U-390 日常委托事件池：按月刷新 / 触发查询 / 办妥结算 ----------

// 日常委托的一句人话（板面与日志共用）：发布方 + 委托引用的际遇 +
// 触发地点。事件名与地点名都出自现有内容，不另造词。
export function dailyObjectiveText(def: DailyCommissionDef): string {
  const ev = EVENTS.find((e) => e.id === def.eventId);
  const locName = locById(def.locationId)?.name ?? def.locationId;
  return `去「${locName}」历「${ev?.title ?? def.eventId}」这桩际遇`;
}

// 本批是否仍在有效期内（U-611 累计月份口径）：已刷新过（batchMonth
// >= 0）且累计月份自本批刷新起推进未满配置表刷新间隔。respond 的
// 下发守卫与 dailyPendingHere 的触发守卫共用此口径——内存中的批次
// 一旦过期（行动推进了月份、读档刷新还没跑），两处都不认它。
export function dailyBatchIsCurrent(c: Character): boolean {
  const ds = c.dailyCommissions;
  if (!ds) return false;
  return ds.batchMonth >= 0 && c.totalMonths - ds.batchMonth < DAILY_COMMISSIONS.refreshIntervalMonths;
}

// U-611 旧存档时钟对齐（读档时调用，见 loadState，须在 ensureDaily-
// Board 之前）：U-611 之前日常委托的刷新标记是 dayAge（本批刷新时
// 的角色年龄，按岁刷新），新口径是 batchMonth（本批刷新时的累计
// 月份，按月刷新）。对齐按「当前批次保全」：旧存档已刷出的这一批
// 原样保留，batchMonth 对齐到当前累计月份——本批自此刻起按新节律
// 计时，推进满刷新间隔才换下一批；不得一读档就把当前批次刷掉、
// 更不得按「相差多少岁」连刷多批。旧口径下从未刷新过（dayAge=-1）
// 的保持未刷新态（batchMonth=-1），由 ensureDailyBoard 刷出第一
// 批。已是新口径的存档（带 batchMonth）原样不动；本函数只换时钟
// 字段，不抽新批、不动计数。换算结果随本次读档之后任一动作的存
// 档持久化。
export function migrateDailyClock(state: GameState): void {
  const c = state.character;
  if (!c || !c.dailyCommissions) return;
  const ds = c.dailyCommissions as DailyState & { dayAge?: unknown };
  if (typeof ds.batchMonth === "number" && Number.isFinite(ds.batchMonth)) {
    // 已是新口径：只清掉可能残留的旧字段，不动批次与计时。
    if ("dayAge" in ds) delete ds.dayAge;
    return;
  }
  const old = typeof ds.dayAge === "number" && Number.isFinite(ds.dayAge) ? ds.dayAge : -1;
  ds.batchMonth = old >= 0 ? c.totalMonths : -1;
  delete ds.dayAge;
}

// 按月刷新（读档时调用，见 loadState；降生时亦调用，旅行抵达尾巴
// 在推进旅行月份后亦调用）：本批仍在有效期内不动（间隔内反复读
// 档不换批）；累计月份自本批刷新起推进满配置表 refreshInterval-
// Months 即整批刷新——刷新时 batchMonth 直接对齐到当前累计月份，
// 故一次行动跨多个月也最多刷新一批。候选 = 目标地点已解锁（境界
// 够得着）的日常委托，种子化不放回抽 batchSize 条。上批未办妥的
// 委托随旧批一并作罢：不惩罚、不动声望、不记失败数（与 U-389 的
// 过期结算明确不同），只在编年史里留一句刷新痕（首次刷新
// batchMonth=-1 不留痕，免得降生日志被刷屏——降生时本批即以当前
// 累计月份刷出，见 actions-life）。角色已陨落时不刷新：本世日常
// 委托随轮回清空，不跨世处理。
export function ensureDailyBoard(state: GameState): void {
  const c = state.character;
  if (!c || c.dead || !c.dailyCommissions) return;
  const ds = c.dailyCommissions;
  if (dailyBatchIsCurrent(c)) return;
  const hadBatch = ds.batchMonth >= 0 && ds.pending.length > 0;
  const undone = ds.pending.length - ds.doneIds.length;
  ds.batchMonth = c.totalMonths;
  ds.doneIds = [];
  ds.pending = [];
  const pool = DAILY_COMMISSIONS.commissions.filter((d) => {
    const loc = locById(d.locationId);
    return !!loc && locUnlocked(c, loc);
  });
  while (ds.pending.length < DAILY_COMMISSIONS.batchSize && pool.length > 0) {
    const picked = weighted(rngForNext(state, "daily:board"), uniformTable(pool));
    if (!picked) break;
    ds.pending.push(picked.id);
    pool.splice(pool.indexOf(picked), 1);
  }
  if (hadBatch) {
    pushLog(state, c.lifeNo, "daily", undone > 0
      ? `🌅 新的一月，天庭朋友圈与地府委托又刷新了一批日常委托——上月没办妥的 ${undone} 件就此作罢，不记过、不罚没，新一批已挂在各处地点，进门即触发。`
      : `🌅 新的一月，天庭朋友圈与地府委托又刷新了一批日常委托，进门即触发、办妥当场结清。`);
  }
}

// 当前地点本批可触发的日常委托（进入地点即触发的查询口径）：本批
// 待办里、尚未办妥、且地点正是当前地点的第一条。无则 undefined。
// 触发本身（把事件摆成待决事件）在 actions-play 的旅行结算尾巴里
// 做——摆事件要走 presentDeckEvent 的牌堆口径，那是 play 层的事。
export function dailyPendingHere(state: GameState): DailyCommissionDef | undefined {
  const c = state.character;
  if (!c || c.dead || !c.dailyCommissions) return undefined;
  const ds = c.dailyCommissions;
  if (!dailyBatchIsCurrent(c)) return undefined;
  for (const id of ds.pending) {
    if (ds.doneIds.includes(id)) continue;
    const def = dailyCommissionById(id);
    if (def && def.locationId === c.locationId) return def;
  }
  return undefined;
}

// 办妥结算（chooseOption 在日常委托触发的待决事件掷骰成功时调
// 用）：把委托移入本批已办妥、当场发放配置表奖励（applyEffects 既
// 有结算链：天庭的稀有材料是灵石/修为等资源、地府的前世线索是记
// 忆碎片 shard，汇入 Q16 前世之谜），并记一笔日志。失败不调用本
// 函数：委托仍留在本批待办里（际遇已出牌堆，本批内不再触发，下
// 批刷新换新）。不走
// 声望（applyReputation）、不回板结算——与 U-388/U-389 明确分开。
// 返回奖励文案（供日志引用）；委托不在本批待办里时返回空串不结算。
export function completeDailyCommission(state: GameState, dailyId: string): string {
  const c = state.character;
  if (!c || c.dead || !c.dailyCommissions) return "";
  const ds = c.dailyCommissions;
  const def = dailyCommissionById(dailyId);
  if (!def || !ds.pending.includes(dailyId) || ds.doneIds.includes(dailyId)) return "";
  ds.doneIds.push(dailyId);
  ds.completedCount += 1;
  applyEffects(state, def.reward);
  const rewardText = formatEffectGains(def.reward);
  pushLog(state, c.lifeNo, "daily", `${def.source === "heaven" ? "🌤️" : "🌙"} 日常委托办妥：「${def.title}」——${def.issuer}的委托就此结清，当场兑付${rewardText ? `：${rewardText}` : ""}（本世已办妥日常委托 ${ds.completedCount} 件）。`);
  return rewardText;
}

// ---------- U-391 地点签到：奖励文案 / 到达触发结算 ----------

// 签到奖励的一句人话（板面与日志共用）：按配置的三类奖励各表述
// 一次——灵石走既有 formatEffectGains；功法/法宝写明名号，并注明
// 槽位已占时的折作口径（fallback 的具体数值在配置里，文案只点明
// 「折作」这一规则、数值以结算日志为准）。
export function signInRewardText(def: SignInSpotDef): string {
  const r = def.reward;
  if (r.kind === "stones") return formatEffectGains(r.effect);
  if (r.kind === "technique") {
    const t = techById(r.techniqueId);
    return `功法「${t?.name ?? r.techniqueId}」（${t?.desc ?? ""}已在修习功法时折作参悟结算）`;
  }
  const a = ARTIFACTS.find((x) => x.id === r.artifactId);
  return `法宝「${a?.name ?? r.artifactId}」（${a?.desc ?? ""}已有本命法宝时折作灵石结算）`;
}

// U-392：故地重游小奖的一句人话（板面展示用）：按签到点所在档位
// 取配置 tiers 的 revisit——本世已签过的地点再次抵达时只发这份
// 小奖，大奖不再重发。
export function signInRevisitText(def: SignInSpotDef): string {
  const td = signInTierDef(def.tier);
  return `${td.label}档小奖：${formatEffectGains(td.revisit)}`;
}

// 到达触发结算（旅行抵达尾巴与读档时调用，见 actions-play 的
// travel 与 loadState）：当前地点是签到点、角色没陨落——满足才结
// 算：即到即得，无接取、无时限、无掷骰。分两种情形：
// - 本世还没签过（U-391 大奖）：按配置当场发奖并记一笔签到日志，
//   同时把该点记入跨世签到图鉴（U-392 收集进度，首次收录在日志
//   里注明图鉴进度）。奖励三类各走既有字段：
//   - 灵石：applyEffects(effect)（与委托/日常奖励同一结算链，吃
//     既有天赋修正，与其余一次性奖励口径一致；不吃地点衰减——
//     签到不是本地点经营收益）；
//   - 功法：功法槽（techniqueId）空着才学会这门功法（此后修炼按
//     其 bonusPct 结算，与传承点赎回的功法同一字段）；已在修习
//     功法则不替换，按配置 fallback 折作参悟结算（applyEffects）；
//   - 法宝：本命法宝槽（artifactId）空着才认主这件法宝（走统一
//     赋予入口 grantArtifact，U-618 门槛对齐与降生赋予同一口径）；已有本
//     命法宝则不替换，按配置 fallback 折作灵石结算（applyEffects）。
// - 本世已签过（U-392 故地重游）：大奖不再重发，只按所在档位发
//   配置 tiers 的小奖（revisit，走同一 applyEffects 链、不吃地点
//   衰减）并记一笔图鉴日志。小奖只在旅行抵达时发（viaTravel）：
//   读档期调用（loadState）站在已签地点上不发——否则反复打开页
//   面即可刷奖；旅行本身耗时一年、往返有寿元成本，是天然节流。
// 返回是否发生了结算（大奖或小奖；不结算时状态一字不动）。
export function settleSignInHere(state: GameState, viaTravel = false): boolean {
  const c = state.character;
  if (!c || c.dead || !c.signIns) return false;
  const def = signInByLocation(c.locationId);
  if (!def) return false;
  if (c.signIns.done.includes(def.id)) {
    if (!viaTravel) return false;
    const td = signInTierDef(def.tier);
    applyEffects(state, td.revisit);
    pushLog(state, c.lifeNo, "signin", `📖 签到图鉴 · 故地重游：「${def.title}」——此地本世已签到、图鉴在册，大奖不再重发；故地重游，只得${td.label}档小奖：${formatEffectGains(td.revisit)}（图鉴已收录 ${state.signInCodex.length}/${SIGN_INS.spots.length} 处）。`);
    return true;
  }
  const r = def.reward;
  let gained: string;
  if (r.kind === "stones") {
    applyEffects(state, r.effect);
    gained = `得${formatEffectGains(r.effect)}`;
  } else if (r.kind === "technique") {
    const t = techById(r.techniqueId);
    if (!c.techniqueId && t) {
      c.techniqueId = t.id;
      gained = `学会功法「${t.name}」（${t.desc}）`;
    } else {
      applyEffects(state, r.fallback);
      gained = `已在修习功法，不再另学——此番签到折作参悟：${formatEffectGains(r.fallback)}`;
    }
  } else {
    const a = ARTIFACTS.find((x) => x.id === r.artifactId);
    if (!c.artifactId && a) {
      // U-618：认主走统一赋予入口——境界未达门槛时法宝封存（留
      // 在栏位、加成不生效），日志与签到文案都写明门槛与解封条件。
      const sealed = grantArtifact(state, c, a);
      const gate = artifactGate(state, c);
      gained = sealed
        ? `得法宝「${a.name}」（${a.desc}）——但此宝需${gate.minRealmName}境方能认主，当前境界不足，法宝封存暂不可用，境界达到后自动解封`
        : `得法宝「${a.name}」（${a.desc}）`;
    } else {
      applyEffects(state, r.fallback);
      gained = `已有本命法宝在身，这件遗宝不再认主——此番签到折作：${formatEffectGains(r.fallback)}`;
    }
  }
  c.signIns.done.push(def.id);
  c.signIns.count += 1;
  // U-392：签到当刻记入跨世图鉴（首次收录才追加；本世已签列表与
  // 图鉴清单自此同步，loadState 的并入兜底只覆盖旧存档）。
  const codexNew = !state.signInCodex.includes(def.id);
  if (codexNew) state.signInCodex.push(def.id);
  pushLog(state, c.lifeNo, "signin", `📍 地点签到：「${def.title}」——${def.text}【签到所得】${gained}（本世已签到 ${c.signIns.count} 处${codexNew ? `；📖 签到图鉴新收录此地，图鉴收集 ${state.signInCodex.length}/${SIGN_INS.spots.length}` : ""}）。`);
  return true;
}

// ---------- U-393 封印之蛋：探索拾取 / 集齐换线索 ----------

// 既有前世遗藏的线索键（同一处遗藏只被线索指一次，取回后键留在
// 记录里无妨——同键的遗藏不会再出现）。
function buriedClueKey(b: BuriedTreasure): string {
  return `${b.buriedLife}:${b.treasureId}:${b.locationId}`;
}

// 集齐换线索：累计拾取数每跨过一个 clueThreshold 的倍数，换出一条
// 前世遗藏线索。线索只提示遗藏地点、不直接发奖励：
// - 优先指向一处真实存在的既有前世遗藏（往世埋下、本世尚未取回
//   且还没被线索指过的）——线索把它的埋藏地点点明，玩家仍须亲自
//   去该地点探索、走既有 buried_find 取回链，奖励一分不少也一分
//   不多地按既有遗藏口径在取回时才结算；
// - 没有可指的既有遗藏时，封印共鸣标出一处「无主前世遗藏」的方
//   位（state.sealedEggs.revealed）：宝物从既有遗藏池（TREASURES）
//   种子化取一、地点从现有地点里种子化取一，只记方位不发东西；
//   已有未取回的无主遗藏时，新线索仍指向它（方位不变、不重复埋）。
// 线索文本只写地点与来历，不写宝物名号与内容（那要到了现场才知晓）。
export function maybeGrantSealedEggClue(state: GameState): void {
  const c = state.character;
  const se = state.sealedEggs;
  if (!c || !se) return;
  const threshold = SEALED_EGGS.clueThreshold;
  while (Math.floor(se.totalFound / threshold) > se.clues.length) {
    const target = state.buried.find((b) => b.buriedLife !== c.lifeNo && !se.cluedBuried.includes(buriedClueKey(b)));
    if (target) {
      se.cluedBuried.push(buriedClueKey(target));
      const text = `第${target.buriedLife}世埋下的一处前世遗藏，就在「${target.locationName}」——封印纹路的共鸣指向那里。线索只指方向：宝物还埋在原处，去那里探索，自能取回。`;
      se.clues.push({ locationId: target.locationId, locationName: target.locationName, source: "buried", text });
      pushLog(state, c.lifeNo, "treasure", `🧭 前世遗藏线索（第 ${se.clues.length} 条）：集齐 ${threshold} 枚封印之蛋，蛋身封印共鸣——${text}`);
      continue;
    }
    let rv = se.revealed;
    if (!rv) {
      const rng = rngForNext(state, "egg:clue-cache");
      const tr = TREASURES[rng.int(0, TREASURES.length - 1)];
      const loc = LOCATIONS[rng.int(0, LOCATIONS.length - 1)];
      if (!tr || !loc) return;
      rv = { treasureId: tr.id, treasureName: tr.name, locationId: loc.id, locationName: loc.name };
      se.revealed = rv;
    }
    const text = `一处无主的前世遗藏在「${rv.locationName}」沉睡多年，封印共鸣替你标出了方位。线索只指方向：宝物尚未出土，去那里探索，自能寻见取回。`;
    se.clues.push({ locationId: rv.locationId, locationName: rv.locationName, source: "cache", text });
    pushLog(state, c.lifeNo, "treasure", `🧭 前世遗藏线索（第 ${se.clues.length} 条）：集齐 ${threshold} 枚封印之蛋，蛋身封印共鸣——${text}`);
  }
}

// 探索拾取（探索动作在待决事件守卫之后、寻仇/遗藏/路线三支之前调
// 用，见 actions-play 的 act explore）：当前地点埋有尚未拾得的封
// 印之蛋时，按配置 chancePct 种子化掷一次出现判定（种子 op
// egg:spawn）；现身即当场拾取、记入跨世收集进度，并顺带结算集齐
// 换线索（maybeGrantSealedEggClue）。拾取不占待决事件槽位、不改
// 探索其余三支的触发与结算顺序，蛋也不进丹药囊、不占任何格子。
// 本地点没有蛋或蛋已拾得时不掷骰（不消耗随机序列）、不留痕。
export function maybeFindSealedEgg(state: GameState): boolean {
  const c = state.character;
  if (!c || c.dead || !state.sealedEggs) return false;
  const def: SealedEggDef | undefined = sealedEggAtLocation(c.locationId);
  if (!def) return false;
  if (state.sealedEggs.found.includes(def.id)) return false;
  // U-617：寻踪类法宝（灵犀角）感应封印之气——现身概率按配置加
  // 百分点；无此 fx 时概率与改前逐字一致（同一颗骰、同一流）。
  const eggFx = activeArtifactFx(state, c);
  const eggChancePct = SEALED_EGGS.chancePct + (eggFx?.eggChanceAdd ?? 0);
  if (!rngForNext(state, "egg:spawn").chance(eggChancePct / 100)) return false;
  state.sealedEggs.found.push(def.id);
  state.sealedEggs.totalFound += 1;
  const locName = locById(def.locationId)?.name ?? def.locationId;
  pushLog(state, c.lifeNo, "treasure", `🥚 封印之蛋：${def.text}你拾起「${def.name}」——蛋身温润，封印纹路微微发亮（「${locName}」收集进度 ${state.sealedEggs.totalFound}/${SEALED_EGGS.eggs.length}；封印之蛋只记收集，不占丹药囊格子）。`);
  maybeGrantSealedEggClue(state);
  return true;
}

// ---------- U-396 按地点排布事件掉落：功法残页结算 ----------

// 探索事件掉落结算（chooseOption 的牌堆事件主分支在成败结算之后、
// 成功时调用，见 actions-play）：当前地点在掉落表里有一行时，按
// 配置 chancePct 种子化掷一次掉落判定（种子 op drop:page）——这
// 一掷在事件结算之外，不改事件的触发概率、难度与成败收益。命中
// 即得该地点定死的功法残页，结算复用既有功法字段（与 U-391 签
// 到功法同一口径）：
// - 功法槽（techniqueId）空着：学会这门功法，此后修炼按其
//   bonusPct 结算（与传承点赎回的功法同一字段）；
// - 已在修习功法：残页不再另学，按所在品质档的 fallback 折作参
//   悟结算（applyEffects 既有链）——修的正是这门时文案作「同页
//   参悟」，修的是别门时作「折作参悟」，数值同为配置 fallback。
// 本地点不在掉落表里时不掷骰（不消耗随机序列）、不留痕。残页不
// 进丹药囊、不占任何格子，掉落不设每世上限（每次成功际遇独立一
// 掷，与配置概率一致）。返回是否掉落命中。
export function maybeDropTechniquePage(state: GameState): boolean {
  const c = state.character;
  if (!c || c.dead) return false;
  const drop = locationDropAt(c.locationId);
  if (!drop) return false;
  if (!rngForNext(state, "drop:page").chance(LOCATION_DROPS.chancePct / 100)) return false;
  const tech = techById(drop.techniqueId);
  if (!tech) return false;
  const td = dropTierDef(drop.tier);
  const locName = locById(c.locationId)?.name ?? c.locationId;
  if (!c.techniqueId) {
    c.techniqueId = tech.id;
    pushLog(state, c.lifeNo, "treasure", `📜 地点掉落 · 功法残页：在「${locName}」的际遇余烬里，你拾得一页${td.label}功法残页——正是「${tech.name}」的失传篇页（${tech.desc}）残页入手、就地参悟，你学会了这门功法（此地掉落${td.label}残页，掉落表见地图页「地点掉落」）。`);
  } else {
    applyEffects(state, td.fallback);
    const same = c.techniqueId === tech.id;
    pushLog(state, c.lifeNo, "treasure", `📜 地点掉落 · 功法残页：在「${locName}」的际遇余烬里，你拾得一页${td.label}功法残页——「${tech.name}」的失传篇页。${same ? "这门功法你已在修习，同页对照、别有会心，残页化作参悟" : "你已在修习功法，残页不再另学，折作参悟"}：${formatEffectGains(td.fallback)}（此地掉落${td.label}残页，掉落表见地图页「地点掉落」）。`);
  }
  return true;
}

// ---------- U-464 探索拾矿 ----------

// 际遇办妥之后（与 U-396 功法残页掉落并列的一掷，独立种子流 drop:ore、
// 互不干扰）：按配置表 forge.json 的 dropChancePct 掷一次，命中则按
// 各阶 dropWeight 加权拾得一块矿石入 ores——矿石的两条来源之一（另
// 一条是坊市购买），不凭空发放：没命中就什么都不发生。阶位不看地点
// （矿脉无处不在、高阶权重低），拾得只记持有数，不占任何格子。返
// 回是否拾得。
export function maybeDropOre(state: GameState): boolean {
  const c = state.character;
  if (!c || c.dead) return false;
  if (!rngForNext(state, "drop:ore").chance(FORGE.dropChancePct / 100)) return false;
  const tier = weighted(rngForNext(state, "drop:ore-tier"), FORGE.tiers.map((t) => ({ value: t, commonality: t.dropWeight })));
  c.ores[tier.id] = oreCountFor(c, tier.id) + 1;
  const locName = locById(c.locationId)?.name ?? c.locationId;
  pushLog(state, c.lifeNo, "treasure", `⛏️ 探索拾矿：在「${locName}」的际遇余烬里，你拾得一块${tier.tier}阶矿石「${tier.name}」（现有 ${c.ores[tier.id]} 块）——可去修炼宗门页的锻造台以此锻造法宝，或留着待用。`);
  return true;
}

// ---------- U-620 探索事件掉落法宝 ----------

// 际遇办妥之后（与 U-396 功法残页、U-464 矿石并列的一掷，独立种
// 子流 drop:artifact，与前两掷互不干扰）：按配置表 artifact-
// sources.json 的 exploreDrop.chancePct 掷一次，命中则按池中权重
// 从同一 28 件法宝池里抽一件——不凭空发宝：没命中什么都不发生。
// 赋予走 settleArtifactGrant 统一口径（槽空认主、U-618 门槛封
// 存/解封；槽已占按配置折作灵石）。这是结算之外的额外一掷：事
// 件的触发概率、难度与成败收益一字未动；失败不掉。返回是否命中。
export function maybeDropArtifact(state: GameState): boolean {
  const c = state.character;
  if (!c || c.dead) return false;
  const drop = ARTIFACT_SOURCES.exploreDrop;
  if (!rngForNext(state, "drop:artifact").chance(drop.chancePct / 100)) return false;
  const entry = weighted(rngForNext(state, "drop:artifact-pick"), drop.pool.map((e) => ({ value: e, commonality: e.weight })));
  if (!entry) return false;
  const def = artifactById(entry.artifactId);
  if (!def) return false;
  const outcome = settleArtifactGrant(state, c, def.id, drop.occupiedFallback);
  if (!outcome) return false;
  const locName = locById(c.locationId)?.name ?? c.locationId;
  pushLog(state, c.lifeNo, "treasure", `🗡️ 探索掉落 · 法宝：在「${locName}」的际遇余烬里，一件无主法宝应着你的气机微微震颤——${artifactGrantOutcomeText(state, c, def.id, outcome, drop.occupiedFallback)}。`);
  return true;
}
