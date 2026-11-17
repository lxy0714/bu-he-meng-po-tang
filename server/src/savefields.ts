// 轮回修仙跑团 — 存档字段注册表（U-598）。
//
// 借鉴 C-24 的 ECS 存档思路：全部游戏状态集中在具名存储里（本游戏是
// U-596 的 SaveStorage 槽位 + 整段 JSON），存档字段像 ComponentStore
// 一样集中登记成一张表（对应其 SaveComponentEntry）——每一个会落盘
// 的字段在本文件有一行：槽位、路径、类型，以及旧存档缺失时的补值
// 工厂（make）。state.ts 的 loadState 与 errors.ts 的 loadErrorStore
// 的缺省补值全部由本表驱动（applySaveFieldDefaults 按登记顺序逐项
// 补 null/undefined），补值与补值顺序和注册前的散写 ??= 逐字一致，
// 存档内容与字节序不变。
//
// 新增可持久化字段的唯一流程：在这里加一行（嵌套字段写全路径，如
// "character.新字段"；需要旧存档迁移就给 make 补值工厂，不给则视为
// 构造点保证必有的字段）。不登记的字段会被覆盖核查
// （findUnregisteredFields）当场指出——漏登记 = 漏存/漏迁移风险，
// 不再靠人肉排查。固定小形状的叶子对象（设定项、丹药囊等）用
// children 一次登记其直属子键，子键同样受覆盖核查约束。
//
// 明确不在本层解决（计划原文）：多端同步、冲突解决与鉴权——那是
// 有真实后端后的独立任务；存档层不提前做冲突合并，只保证单端存档
// 完整与迁移正确。

import { ERROR_LOG_SLOT, GAME_SLOT } from "./storage";

export type SaveFieldKind = "string" | "number" | "boolean" | "object" | "array" | "record";

export interface SaveDefaultEnv {
  /** 当前周键（character.weekKey 的补值来源，与 state.weekKeyOf 同值，由 loadState 传入）。 */
  currentWeekKey: string;
}

type Host = Record<string, unknown>;

export interface SaveFieldEntry {
  slot: string;
  /** 点路径；数组元素段以 [] 结尾，如 "lives[].name"。 */
  path: string;
  kind: SaveFieldKind;
  /** 值可为 null（路径仍按非空形状登记）。 */
  nullable?: boolean;
  /** 键可整体缺席（如 lastRoll.detail、keepsakes[].locationId）。 */
  optional?: boolean;
  /** 固定小形状叶子对象的直属子键：登记在此即完成登记，覆盖核查按此校验且不再下钻。 */
  children?: readonly string[];
  /** 旧存档缺失（null/undefined）时的补值工厂；无此项 = 无迁移补值（构造点保证必有）。 */
  makeDefault?: (host: Host, env: SaveDefaultEnv) => unknown;
  note: string;
}

type RowOpts = {
  nullable?: boolean;
  optional?: boolean;
  children?: readonly string[];
  make?: (host: Host, env: SaveDefaultEnv) => unknown;
  note?: string;
};
function F(slot: string, path: string, kind: SaveFieldKind, opts: RowOpts = {}): SaveFieldEntry {
  const entry: SaveFieldEntry = { slot, path, kind, note: opts.note ?? "" };
  if (opts.nullable) entry.nullable = true;
  if (opts.optional) entry.optional = true;
  if (opts.children) entry.children = opts.children;
  if (opts.make) entry.makeDefault = opts.make;
  return entry;
}

const G = GAME_SLOT;
const E = ERROR_LOG_SLOT;

// ============================================================
// 注册表正文。登记顺序有意义：同一对象上的补值按登记顺序应用，
// 与注册前 loadState 的 ??= 语句顺序逐字对齐（顶层：settings 合并
// 在 loadState 单独做，其后 fragments → buried → reincarnation →
// mainline → rngSeq → rngState → birthDraw → lives；character 以有补值的字段
// 按旧语句顺序在前、无补值字段在后）。跨对象的相对顺序不影响结果。
// ============================================================
export const SAVE_FIELD_REGISTRY: readonly SaveFieldEntry[] = [
  // ---------- 游戏存档 · 顶层（GameState） ----------
  F(G, "settings", "object", { note: "规则设定 Q1–Q18；迁移为与默认设定合并（loadState 的 merge，非逐项补值）" }),
  F(G, "settings.q1", "object", { children: ["value", "confirmed"] }),
  F(G, "settings.q2", "object", { children: ["value", "confirmed"] }),
  F(G, "settings.q3", "object", { children: ["value", "confirmed"] }),
  F(G, "settings.q4", "object", { children: ["value", "confirmed"] }),
  F(G, "settings.q5", "object", { children: ["value", "confirmed"] }),
  F(G, "settings.q6", "object", { children: ["value", "confirmed"] }),
  F(G, "settings.q7", "object", { children: ["value", "confirmed"] }),
  F(G, "settings.q8", "object", { children: ["value", "confirmed"] }),
  F(G, "settings.q9", "object", { children: ["value", "confirmed"] }),
  F(G, "settings.q10", "object", { children: ["value", "confirmed"] }),
  F(G, "settings.q11", "object", { children: ["value", "confirmed"] }),
  F(G, "settings.q12", "object", { children: ["value", "confirmed"] }),
  F(G, "settings.q13", "object", { children: ["value", "confirmed"] }),
  F(G, "settings.q14", "object", { children: ["value", "confirmed"] }),
  F(G, "settings.q15", "object", { children: ["value", "confirmed"] }),
  F(G, "settings.q16", "object", { children: ["value", "confirmed"] }),
  F(G, "settings.q17", "object", { children: ["value", "confirmed"] }),
  F(G, "settings.q18", "object", { children: ["value", "confirmed"] }),
  F(G, "settings.q34", "object", { children: ["value", "confirmed"] }),
  F(G, "rulesLocked", "boolean", { make: (host) => { const ch = host.character; const lv = host.lives; return (!!ch && typeof ch === "object") || (Array.isArray(lv) && lv.length > 0); }, note: "U-625 本局规则是否已锁定（新游戏在规则设定页确认后置 true，锁定后 setSetting 拒绝、游戏内只读）；旧存档缺失时按本局是否已开局补值——已有角色/前世 = 本局已按现有规则在跑，补 true 沿用已锁定的本局规则只读显示；尚无任何进度的补 false（仍可在新游戏设定页里改）。仅有降生抽选（birthDraw）不算已开局：创建角色不做保存，未完成的创建退出即作废（abandonCreation 清抽选并解锁）" }),
  F(G, "fragments", "array", { make: () => [], note: "前尘残片（MemoryFragment[]）" }),
  F(G, "fragments[].id", "number"),
  F(G, "fragments[].lifeNo", "number"),
  F(G, "fragments[].label", "string"),
  F(G, "fragments[].detail", "string"),
  F(G, "buried", "array", { make: () => [], note: "前世遗藏（BuriedTreasure[]）" }),
  F(G, "buried[].treasureId", "string"),
  F(G, "buried[].treasureName", "string"),
  F(G, "buried[].locationId", "string"),
  F(G, "buried[].locationName", "string"),
  F(G, "buried[].buriedLife", "number"),
  F(G, "reincarnation", "object", { nullable: true, make: () => null, note: "轮回结算；另有结构失效迁移（旧 originChoices 结构作废）在 loadState 明示，不属补值" }),
  F(G, "reincarnation.grade", "string"),
  F(G, "reincarnation.legacyEarned", "number"),
  F(G, "reincarnation.pointsEarned", "number", { make: () => 0, note: "U-002 本次结算发放的轮回点（按评级档位）；U-002 前已生成的旧结算补 0、不追溯发放" }),
  F(G, "reincarnation.shardPointsEarned", "number", { make: () => 0, note: "U-322 本次结算按本世新集碎片数分档发放的轮回点；U-322 前已生成的旧结算补 0、不追溯发放" }),
  F(G, "reincarnation.shardsThisLife", "number", { make: () => 0, note: "U-322 本世新收集的记忆碎片数（结算时 = mainline.shards − shardsAtLifeStart）" }),
  F(G, "reincarnation.keepsakeCandidates", "array", { note: "PendingKeepsake[]" }),
  F(G, "reincarnation.keepsakeCandidates[].kind", "string"),
  F(G, "reincarnation.keepsakeCandidates[].id", "string"),
  F(G, "reincarnation.keepsakeCandidates[].name", "string"),
  F(G, "reincarnation.keepsakeCandidates[].desc", "string"),
  F(G, "reincarnation.keepsakeCandidates[].cost", "number"),
  F(G, "reincarnation.keepsakes", "array", { note: "Keepsake[]" }),
  F(G, "reincarnation.keepsakes[].kind", "string"),
  F(G, "reincarnation.keepsakes[].id", "string"),
  F(G, "reincarnation.keepsakes[].locationId", "string", { optional: true, note: "仅遗藏类有埋藏地点" }),
  F(G, "reincarnation.chosenOrigin", "string", { nullable: true }),
  F(G, "reincarnation.memoryKept", "boolean"),
  F(G, "reincarnation.memoryNote", "string"),
  F(G, "reincarnation.artifactShattered", "boolean", { make: () => false, note: "第三轮补字段：走火入魔魂飞魄散时本命法宝碎裂" }),
  F(G, "mainline", "object", { make: () => ({ shards: 0, done: false }), children: ["shards", "done"], note: "Q16 前世之谜进度，跨世不清零" }),
  F(G, "shardsAtLifeStart", "number", { make: (host) => { const m = host.mainline; const s = m && typeof m === "object" ? (m as Record<string, unknown>).shards : undefined; return typeof s === "number" && Number.isFinite(s) && s > 0 ? Math.floor(s) : 0; }, note: "U-322 本世开始时的主线碎片累计基线（结算算本世新集用，结算后推进）；旧存档缺失时以当时 mainline.shards 作为基线、不追溯发放（mainline 先于本行补值，故缺失 mainline 时基线为 0）" }),
  F(G, "rngSeq", "number", { make: () => 0, note: "U-573 种子化随机的操作序号，随存档持久化" }),
  F(G, "rngState", "object", { nullable: true, make: () => null, children: ["seed", "seq"], note: "U-574 PRNG 流位置显式存档 { seed, seq }：saveState 快照落盘、loadState 按 seq 恢复 rngSeq；旧存档缺失补 null、按 rngSeq 原规则兜底" }),
  F(G, "reincarnationPoints", "number", { make: () => 0, note: "U-002 轮回点跨世点数池（结算按评级发放、开局分配消费）；旧存档缺失按 0 点兜底" }),
  F(G, "birthBoost", "object", { nullable: true, make: () => null, children: ["might", "sense", "fortune", "body"], note: "U-002 开局属性分配（轮回点分到四维，降生时落到新角色并清空）" }),
  F(G, "birthBoons", "array", { make: () => [], note: "U-021 已购待降生生效的「再战天道」强化项 id 列表（轮回点购入，降生时一次性生效并清空）；旧存档缺失按空列表兜底" }),
  F(G, "signInCodex", "array", { make: () => [], note: "U-392 签到图鉴跨世收录：历世签到过的签到点 id 清单（收集进度），轮回不清空；收录发生在签到结算当刻，loadState 另把本世已签列表并入兜底（覆盖本项上线前已签的旧存档，只补记录不发奖）；旧存档缺失按空列表兜底" }),
  F(G, "sealedEggs", "object", { make: () => ({ found: [], totalFound: 0, clues: [], cluedBuried: [], revealed: null }), children: ["found", "totalFound", "clues", "cluedBuried", "revealed"], note: "U-393 封印之蛋收集（跨世，轮回不清空）：已拾蛋 id 清单 / 累计拾取数 / 已换得的前世遗藏线索（元素为固定小形状 {locationId, locationName, source, text}）/ 已被线索指过的既有遗藏键 / 线索标出的无主遗藏方位（固定小形状 {treasureId, treasureName, locationId, locationName} 或 null），children 登记后不再下钻；旧存档缺失补空状态，拾取在探索动作里按配置概率触发、集齐门槛换线索（只提示地点不发奖励），收集物不进丹药囊" }),
  F(G, "birthDraw", "object", { nullable: true, make: () => null, note: "Q11/Q13 降生抽选（BirthDraw）" }),
  F(G, "birthDraw.origin", "object", { children: ["pool", "value", "random"] }),
  F(G, "birthDraw.destiny", "object", { children: ["pool", "value", "random"] }),
  F(G, "birthDraw.root", "object", { children: ["pool", "value", "random"] }),
  F(G, "birthDraw.talentChoices", "array", { note: "TalentDef[]" }),
  F(G, "birthDraw.talentChoices[].id", "string"),
  F(G, "birthDraw.talentChoices[].name", "string"),
  F(G, "birthDraw.talentChoices[].tier", "string"),
  F(G, "birthDraw.talentChoices[].desc", "string"),
  F(G, "birthDraw.chosenTalents", "array"),
  F(G, "lives", "array", { make: () => [], note: "前世记录（LifeRecord[]），轮回树数据源" }),
  F(G, "lives[].lifeNo", "number"),
  F(G, "lives[].name", "string", { make: () => "" }),
  F(G, "lives[].realmText", "string"),
  F(G, "lives[].age", "number"),
  F(G, "lives[].cause", "string"),
  F(G, "lives[].grade", "string", { make: () => "" }),
  F(G, "lives[].artifactName", "string"),
  F(G, "lives[].keepsakes", "array", { make: () => [] }),
  F(G, "lives[].talents", "array", { make: () => [] }),
  F(G, "log", "array", { note: "编年史（LogEntry[]），上限 80 条" }),
  F(G, "log[].id", "number"),
  F(G, "log[].lifeNo", "number"),
  F(G, "log[].kind", "string"),
  F(G, "log[].text", "string"),
  F(G, "logSeq", "number", { note: "编年史序号（单调递增）" }),
  F(G, "character", "object", { nullable: true, note: "当前角色（Character）；无角色时为 null" }),

  // ---------- 游戏存档 · 角色（Character，有补值字段按旧迁移顺序在前） ----------
  F(G, "character.origin", "string", { make: () => "出身未记" }),
  F(G, "character.memoryTier", "number", { make: () => 0, note: "记忆保留层级（0 无 / 1 残片 / 2 清晰）" }),
  F(G, "character.talentIds", "array", { make: () => [] }),
  F(G, "character.techniqueId", "string", { nullable: true, make: () => null }),
  F(G, "character.legacyPoints", "number", { make: () => 0, note: "传承点（Q9 赎回货币）" }),
  F(G, "character.jadeLayers", "number", { make: () => 0, note: "承世玉层数（每层判定修正 +2，U-563 配置）" }),
  F(G, "character.weekKey", "string", { make: (_host, env) => env.currentWeekKey, note: "周衰减键（年-周），补值为当前周" }),
  F(G, "character.groupCounts", "record", { make: () => ({}), note: "地点组周计数（收益衰减用），键为地点组名故用 record" }),
  F(G, "character.caveClaimedLife", "number", { make: () => 0, note: "接管洞府的世数（cave_takeover 每世一次判定用）" }),
  F(G, "character.destinyId", "string", { make: () => "", note: "命格 id（Q13/Q14）" }),
  F(G, "character.sectRankId", "string", { make: () => "", note: "宗门位阶 id（Q14）" }),
  F(G, "character.sectContrib", "number", { make: () => 0 }),
  F(G, "character.breakFails", "number", { make: () => 0, note: "突破连败保底计数（U-569 modifier 链记账）" }),
  F(G, "character.recentEvents", "array", { make: () => [], note: "最近事件 id（牌堆子牌堆避紧邻用，U-576）" }),
  F(G, "character.eventDeck", "array", { make: () => [], note: "U-576 本世事件牌堆（剩余事件 id，堆顶 = index 0）；仅服务端持久化，不进响应形状" }),
  F(G, "character.deckVersion", "number", { make: () => 1, note: "U-395 本世牌堆的事件投放版本（降生时落定为当时最新投放版本，建堆/抽牌只收投放版本不高于此值的事件）；旧存档缺失补 1（首发批——其当世牌堆本就是在只有首发事件时建的，当世不受后来新批次影响，轮回开新世时推进到最新版本）；仅服务端持久化，不进响应形状（响应侧由 eventReleases.lifeVersion 下发）" }),
  F(G, "character.route", "object", { nullable: true, make: () => null, children: ["layer", "totalLayers", "nodes"], note: "U-381 分叉路线进行状态（RouteState）：当前层 / 总层数 / 本层三节点；节点是固定小形状（type + 可选 enemyId）不再下钻；旧存档缺失补 null（无进行中路线）" }),
  F(G, "character.commissions", "object", { make: () => ({ board: [], active: [], completedCount: 0 }), children: ["board", "active", "completedCount"], note: "U-388 委托板状态（本世）：板上张贴的委托 id 列表 / 已接委托（元素为固定小形状 {id, progress, done}，children 登记后不再下钻）/ 本世已完成数；旧存档缺失补空状态，板面由 loadState 的 ensureCommissionBoard 补齐" }),
  F(G, "character.timedEvents", "object", { make: () => ({ board: [], active: [], completedCount: 0, failedCount: 0, lapsedCount: 0 }), children: ["board", "active", "completedCount", "failedCount", "lapsedCount"], note: "U-389 限时帖状态（本世）：板上挂帖（元素为固定小形状 {id, postedDay}）/ 已接限时帖（元素为固定小形状 {id, progress, done, deadlineDay}）/ 本世办妥·失败·过期数，children 登记后不再下钻；旧存档缺失补空状态，板面由 loadState 的 ensureTimedBoard 补齐、到期由 settleTimedEvents 在读档时结算；U-610 起时钟改天序（累计月份×每月天数），旧存档的 postedAge/deadlineAge 由 loadState 的 migrateTimedClock 换算" }),
  F(G, "character.dailyCommissions", "object", { make: () => ({ batchMonth: -1, pending: [], doneIds: [], completedCount: 0 }), children: ["batchMonth", "pending", "doneIds", "completedCount"], note: "U-390 日常委托事件池状态（本世）：本批刷新时的累计月份 batchMonth（-1 = 尚未刷新）/ 本批待办委托 id 列表 / 本批已办妥 id 列表 / 本世已办妥数，children 登记后不再下钻；旧存档缺失补空状态，本批内容由 loadState 的 ensureDailyBoard 按累计月份刷新补齐（未办妥不惩罚）；U-611 起刷新标记由年龄 dayAge 改累计月份 batchMonth，旧存档的 dayAge 由 loadState 的 migrateDailyClock 对齐换算（当前批次保全）" }),
  F(G, "character.signIns", "object", { make: () => ({ done: [], count: 0 }), children: ["done", "count"], note: "U-391 地点签到状态（本世）：已签到的签到点 id 列表 / 本世已签到数，children 登记后不再下钻；旧存档缺失补空状态，触发由旅行抵达尾巴与 loadState 的 settleSignInHere 结算（到达即得、大奖本世每处一次；U-392 起本世再抵达已签地点改发按档小奖、签到记入跨世图鉴 signInCodex）" }),
  F(G, "character.craftUses", "record", { make: () => ({}), note: "U-482 副职使用次数（本世）：键为副职 id（alchemy/forge/farm/fish）、值为本世使用次数，熟练度与等级由配置表 craft-skills.json 派生不另存；键为副职 id 故用 record；旧存档缺失补 {}（四门皆 0 次、熟练度默认 0），轮回不带走（降生构造点给 {}）" }),
  F(G, "character.ores", "record", { make: () => ({}), note: "U-464 锻造矿石持有数（本世）：键为配置表 forge.json 的矿石 id、值为持有块数，缺键 = 0；旧存档缺失补 {}（一无所有——矿石只经坊市购买与探索拾得两条来源，不凭空发放），轮回不带走（降生构造点给 {}）" }),
  F(G, "character.quickPlan", "array", { make: () => [], note: "预设路线步骤" }),
  F(G, "character.quickPlan[].kind", "string"),
  F(G, "character.quickPlan[].count", "number"),
  F(G, "character.relations", "array", { make: () => [], note: "Q18 人际关系（Relation[]）" }),
  F(G, "character.relations[].npcId", "string"),
  F(G, "character.relations[].name", "string"),
  F(G, "character.relations[].kind", "string", { note: "partner / master / disciple / friend / enemy" }),
  F(G, "character.relations[].bond", "number", { note: "友好为情谊、仇敌为仇怨（0–100）" }),
  F(G, "character.relations[].note", "string"),
  F(G, "character.pills", "object", { make: () => ({ heal: 0, cult: 0, brk: 0 }), children: ["heal", "cult", "brk"], note: "Q17 丹药囊" }),
  F(G, "character.caveLevel", "number", { make: () => 0, note: "Q17 洞府聚灵阵等级（0–3，本世置办）" }),
  F(G, "character.breakBonus", "number", { make: () => 0, note: "Q17/Q18 下次突破助力（破境丹/请教，突破时消耗）" }),
  F(G, "character.totalMonths", "number", { make: (host) => { const a = host.age; return typeof a === "number" && Number.isFinite(a) && a > 0 ? Math.floor(a) * 12 : 0; }, note: "U-608 细时钟累计月份（本世自降生起算，年龄由它推导：满 12 个月进 1 岁）；旧存档缺失按 U-608 迁移口径补当前年龄 × 12（monthsPerYear 由配置表自检锁死为 12，与此换算一致）" }),
  F(G, "character.artifactBonusApplied", "boolean", { make: (host) => { const id = host.artifactId; return typeof id === "string" && id !== ""; }, note: "U-618 本命法宝属性修正是否已生效；旧存档缺失按旧口径补值（持有法宝即已生效），随后由 loadState 的门槛对齐（syncArtifactGate）把未达新门槛者的加成收回并封存——法宝保留不没收，境界达到自动解封" }),
  // —— 以下为构造点保证必有的字段（无迁移补值） ——
  F(G, "character.name", "string"),
  F(G, "character.rootId", "string"),
  F(G, "character.rootName", "string"),
  F(G, "character.artifactId", "string"),
  F(G, "character.artifactName", "string"),
  F(G, "character.lifeNo", "number"),
  F(G, "character.realmIdx", "number"),
  F(G, "character.stageIdx", "number"),
  F(G, "character.cultivation", "number"),
  F(G, "character.totalCultivation", "number"),
  F(G, "character.hp", "number"),
  F(G, "character.maxHp", "number"),
  F(G, "character.mp", "number"),
  F(G, "character.maxMp", "number"),
  F(G, "character.stones", "number"),
  F(G, "character.karma", "number"),
  F(G, "character.age", "number"),
  F(G, "character.lifespan", "number"),
  F(G, "character.locationId", "string"),
  F(G, "character.might", "number"),
  F(G, "character.sense", "number"),
  F(G, "character.fortune", "number"),
  F(G, "character.body", "number"),
  F(G, "character.sealedMemory", "boolean"),
  F(G, "character.dead", "boolean"),
  F(G, "character.deathCause", "string", { nullable: true }),
  F(G, "character.pendingEvent", "object", { nullable: true, note: "待决事件（PendingEvent）" }),
  F(G, "character.pendingEvent.id", "string"),
  F(G, "character.pendingEvent.title", "string"),
  F(G, "character.pendingEvent.desc", "string"),
  F(G, "character.pendingEvent.art", "string"),
  F(G, "character.pendingEvent.options", "array", { children: ["label", "hint", "attr", "dc", "cost", "costBlocked", "loop"], note: "PendingOption[]；cost/costBlocked 为 U-377 代价模板字段、loop 为 U-378 见好就收模板标记，均可缺省（无模板选项与旧存档均无），cost 是固定小形状（五种可支付键）不再下钻" }),
  F(G, "character.pendingEvent.loop", "object", { optional: true, children: ["eventId", "optionIdx", "round", "baseDc", "gains"], note: "U-378 见好就收进行状态（PendingLoop）；仅抉择待决事件带此字段，gains 为累计收获小形状（五种资源键）不再下钻" }),
  F(G, "character.pendingEvent.daily", "object", { optional: true, children: ["dailyId", "locationId"], note: "U-390 日常委托触发标记（{dailyId, locationId}）；仅日常委托触发的待决事件带此字段，chooseOption 据此在办妥时结清日常奖励" }),
  F(G, "character.lastRoll", "object", { nullable: true, note: "最近一次判定（LastRoll）" }),
  F(G, "character.lastRoll.label", "string"),
  F(G, "character.lastRoll.dice", "number"),
  F(G, "character.lastRoll.bonus", "number"),
  F(G, "character.lastRoll.total", "number"),
  F(G, "character.lastRoll.dc", "number"),
  F(G, "character.lastRoll.success", "boolean"),
  F(G, "character.lastRoll.text", "string"),
  F(G, "character.lastRoll.detail", "object", { optional: true, note: "U-570 结构化判定明细（CheckDetail）；U-570 前的存档没有这一段" }),
  F(G, "character.lastRoll.detail.expression", "string"),
  F(G, "character.lastRoll.detail.rollMode", "string", { optional: true, note: "U-572 双掷记号；U-572 前的明细没有这一段" }),
  F(G, "character.lastRoll.detail.keptRolls", "array", { optional: true, note: "U-572 保留的骰值" }),
  F(G, "character.lastRoll.detail.droppedRolls", "array", { optional: true, note: "U-572 舍弃的骰值" }),
  F(G, "character.lastRoll.detail.rolls", "array"),
  F(G, "character.lastRoll.detail.diceTotal", "number"),
  F(G, "character.lastRoll.detail.attrLabel", "string"),
  F(G, "character.lastRoll.detail.bonusParts", "array", { children: ["label", "value"], note: "修正构成段（{label, value}[]）" }),
  F(G, "character.lastRoll.detail.bonus", "number"),
  F(G, "character.lastRoll.detail.baseDc", "number"),
  F(G, "character.lastRoll.detail.dc", "number"),
  F(G, "character.lastRoll.detail.total", "number"),
  F(G, "character.lastRoll.detail.margin", "number"),
  F(G, "character.lastRoll.detail.success", "boolean"),
  F(G, "character.lastRoll.detail.grade", "string"),
  F(G, "character.lastRoll.detail.modifierTrace", "array", { children: ["name", "label", "phase", "dcBefore", "dcAfter", "dcDelta", "bonusBefore", "bonusAfter", "bonusDelta"], note: "U-570 modifier 生效过程（ModifierTraceEntry[]）" }),
  F(G, "character.lastRoll.detail.text", "string"),

  // ---------- 报错记录（ErrorStore，槽位 error-logs） ----------
  F(E, "seq", "number", { make: (host) => (Array.isArray(host.logs) ? host.logs.length : 0), note: "报错序号（跨清空继续递增）；缺失时按已有条数补" }),
  F(E, "logs", "array", { note: "ErrorLogEntry[]，上限 200 条、最新在前" }),
  F(E, "logs[].id", "number"),
  F(E, "logs[].time", "number", { note: "epoch ms（创建时刻）" }),
  F(E, "logs[].timeText", "string", { note: "ISO 时间串" }),
  F(E, "logs[].source", "string", { note: "server / client" }),
  F(E, "logs[].location", "string"),
  F(E, "logs[].message", "string"),
  F(E, "logs[].detail", "string"),
];

// ---------- 注册表自检（模块加载即跑） ----------
// 路径重复、父路径未登记、children 与显式子行并存、children 重复，
// 任何一项写错立刻抛错，不等到某次存档读写才暴露。
export function assertSaveFieldRegistry(): void {
  const seen = new Set<string>();
  const byKey = new Map<string, SaveFieldEntry>();
  for (const entry of SAVE_FIELD_REGISTRY) {
    const key = `${entry.slot}:${entry.path}`;
    if (!entry.slot) throw new Error("save-fields: 存在未登记槽位的条目");
    if (!entry.path || entry.path.startsWith(".") || entry.path.endsWith(".")) {
      throw new Error(`save-fields: 路径非法「${entry.path}」`);
    }
    if (seen.has(key)) throw new Error(`save-fields: 字段重复登记「${key}」`);
    seen.add(key);
    byKey.set(key, entry);
    if (entry.children) {
      const childSeen = new Set<string>();
      for (const child of entry.children) {
        if (!child || child.includes(".") || child.includes("[")) {
          throw new Error(`save-fields: 「${key}」的 children 子键非法「${child}」`);
        }
        if (childSeen.has(child)) throw new Error(`save-fields: 「${key}」的 children 子键重复「${child}」`);
        childSeen.add(child);
      }
    }
  }
  for (const entry of SAVE_FIELD_REGISTRY) {
    const segments = entry.path.split(".");
    for (let i = 1; i < segments.length; i++) {
      let ancestor = segments.slice(0, i).join(".");
      if (ancestor.endsWith("[]")) ancestor = ancestor.slice(0, -2);
      if (!byKey.has(`${entry.slot}:${ancestor}`)) {
        throw new Error(`save-fields: 「${entry.slot}:${entry.path}」的父路径「${ancestor}」未登记`);
      }
    }
    if (entry.children) {
      for (const other of SAVE_FIELD_REGISTRY) {
        if (other.slot === entry.slot && other !== entry
          && (other.path.startsWith(`${entry.path}.`) || other.path.startsWith(`${entry.path}[]`))) {
          throw new Error(`save-fields: 「${entry.slot}:${entry.path}」已用 children 登记子键，不得再有显式子行「${other.path}」`);
        }
      }
    }
  }
}
assertSaveFieldRegistry();

// ---------- 补值应用（loadState / loadErrorStore 共用） ----------
// 解析父路径为宿主对象列表：普通段下钻一层对象，"x[]" 段展开数组
// 全部元素。宿主不存在（字段为 null / 槽位结构不符）时该条跳过——
// 与注册前 `if (c) { ... }` 的守卫语义一致。
function resolveHosts(root: unknown, parentSegments: readonly string[]): Host[] {
  let hosts: unknown[] = [root];
  for (const seg of parentSegments) {
    const isArray = seg.endsWith("[]");
    const name = isArray ? seg.slice(0, -2) : seg;
    const next: unknown[] = [];
    for (const h of hosts) {
      if (!h || typeof h !== "object") continue;
      const v = (h as Host)[name];
      if (isArray) {
        if (Array.isArray(v)) next.push(...v);
      } else if (v && typeof v === "object") {
        next.push(v);
      }
    }
    hosts = next;
  }
  return hosts.filter((h): h is Host => !!h && typeof h === "object");
}

/**
 * 按注册表顺序，把该槽位所有带 makeDefault 的字段在 root 里补齐：
 * 值为 null 或 undefined 才补（与 ??= 语义一致），已有值一字不动。
 * 补值只增不改，应用后 JSON.stringify 的键序与注册前逐项 ??= 一致。
 */
export function applySaveFieldDefaults(
  slot: string,
  root: unknown,
  env: SaveDefaultEnv = { currentWeekKey: "" },
): void {
  if (!root || typeof root !== "object") return;
  for (const entry of SAVE_FIELD_REGISTRY) {
    if (entry.slot !== slot || !entry.makeDefault) continue;
    const segments = entry.path.split(".");
    const key = segments[segments.length - 1] ?? "";
    for (const host of resolveHosts(root, segments.slice(0, -1))) {
      if (host[key] === undefined || host[key] === null) {
        host[key] = entry.makeDefault(host, env);
      }
    }
  }
}

// ---------- 覆盖核查（验收/测试用，不进运行时路径） ----------
/**
 * 遍历一份已解析的存档对象，返回其中未在注册表登记的字段路径
 * （去重排序）。返回空数组 = 该存档的全部字段都已登记。
 * record 类型的键是动态数据（地点组名），只核查其路径本身；
 * children 登记过的叶子对象按子键名单核查、不再下钻。
 */
export function findUnregisteredFields(slot: string, value: unknown): string[] {
  const byPath = new Map<string, SaveFieldEntry>();
  for (const entry of SAVE_FIELD_REGISTRY) {
    if (entry.slot === slot) byPath.set(entry.path, entry);
  }
  const found = new Set<string>();
  const visit = (val: unknown, path: string): void => {
    if (val === null || val === undefined) return;
    if (Array.isArray(val)) {
      // 数组项登记在数组行自身的 children 里（固定小形状叶子对象）：
      // 按名单核查元素子键、不再下钻；无 children 的数组才按
      // "path[]" 逐项路径下钻核查。
      const arrEntry = path === "" ? undefined : byPath.get(path);
      for (const el of val) {
        if (!el || typeof el !== "object" || Array.isArray(el)) continue;
        if (arrEntry?.children) {
          for (const k of Object.keys(el as Host)) {
            if (!arrEntry.children.includes(k)) found.add(`${path}[].${k}`);
          }
        } else {
          visit(el, `${path}[]`);
        }
      }
      return;
    }
    if (typeof val !== "object") return;
    const entry = path === "" ? undefined : byPath.get(path);
    if (entry?.kind === "record") return;
    for (const [k, v] of Object.entries(val as Host)) {
      const childPath = path === "" ? k : `${path}.${k}`;
      if (entry?.children) {
        if (!entry.children.includes(k)) found.add(childPath);
        continue;
      }
      if (!byPath.has(childPath)) {
        found.add(childPath);
        continue;
      }
      visit(v, childPath);
    }
  };
  visit(value, "");
  return [...found].sort();
}

/** 某槽位已登记的字段行数（报告/测试用）。 */
export function registeredFieldCount(slot: string): number {
  return SAVE_FIELD_REGISTRY.filter((e) => e.slot === slot).length;
}
