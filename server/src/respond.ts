// 轮回修仙跑团 — 响应形状：zod schema 与内部状态 → 对外响应的整形。
// 从 actions.ts 原样拆分，字段与整形规则未动。

import { z } from "./platform";
import {
ARTIFACTS, CLASSIC_REALMS, COMMISSIONS, CRAFT_KINDS, CRAFT_SKILLS, CURRENT_EVENT_VERSION, DAILY_COMMISSIONS, DESTINIES, ENEMIES, EVENT_PACKS, EVENT_RELEASES, FORGE, LOCATION_DROPS, LOCATIONS, MAINLINE_CHAPTERS, MAINLINE_TOTAL_SHARDS, NAME_POOL, ORIGIN_POOL, REINCARNATION_POINTS, SEALED_EGGS, SECT_RANKS, SHOP, SIGN_INS, STAGES, TALENTS, TIME_COSTS, TREASURES, TIMED_EVENTS,
artifactById, caveUpgradeCost, combatDc, commissionById, commissionGrantFor, craftLevelDefFor, craftNextLevelDef, craftProficiencyFor, craftYieldPctFor, dailyCommissionById, destinyById, dropTierDef, eventPackOf, eventReleaseVersion, forgeCandidatesFor, locById, npcById, sectGrantForRank, sectRankById, shopPrice, talentById, techById, timeCostMonths, timedEventById, travelMonthsTo, treasureById,
type TimeCostKey,
} from "./data";
import { EVENTS, formatEffectGains, type Effect } from "./events";
import { commissionObjectiveText, dailyBatchIsCurrent, dailyObjectiveText, decayMult, forgeGateFor, locUnlocked, oreCountFor, realmsFor, signInRevisitText, signInRewardText, threshold, timedDaysText, timedNowDay, timedObjectiveText, timedRepText, weekKeyOf, type Character, type GameState, type Settings } from "./state";

// ---------- zod shapes ----------

const settingItem = z.object({ value: z.string(), confirmed: z.boolean() });
const settingsShape = z.object({
  q1: settingItem, q2: settingItem, q3: settingItem, q4: settingItem, q5: settingItem,
  q6: settingItem, q7: settingItem, q8: settingItem, q9: settingItem, q10: settingItem,
  q11: settingItem, q12: settingItem, q13: settingItem, q14: settingItem,
  q15: settingItem, q16: settingItem, q17: settingItem, q18: settingItem,
  // Q34（2026-11-14）：旧存档无此键时由 loadState 的默认值合并补齐。
  q34: settingItem,
});
const pendingEventShape = z.object({
  id: z.string(), title: z.string(), desc: z.string(), art: z.string(),
  options: z.array(z.object({
    label: z.string(), hint: z.string(), attr: z.string(), dc: z.number(),
    // U-377 代价模板：cost 为明码标价（可支付五键、值为负），
    // costBlocked 为付不起时的明示原因；无代价选项与旧存档皆缺省。
    cost: z.object({
      cult: z.number().optional(), hp: z.number().optional(), mp: z.number().optional(),
      stones: z.number().optional(), karma: z.number().optional(),
    }).optional(),
    costBlocked: z.string().optional(),
    // U-378 见好就收模板：loop 为真表示可加圈选项；无模板选项与旧
    // 存档皆缺省。
    loop: z.boolean().optional(),
  })),
  // U-379 三选一抉择模板：trio 为真表示三选一抉择事件，客户端据此
  // 标注；普通待决事件与旧存档皆缺省。
  trio: z.boolean().optional(),
  // U-380 多解事件模板：dual 为真表示双解法事件，客户端据此标注；
  // 普通待决事件与旧存档皆缺省。
  dual: z.boolean().optional(),
  // U-383 道德分叉模板：moral 为真表示道德分叉事件，客户端据此
  // 标注；普通待决事件与旧存档皆缺省。
  moral: z.boolean().optional(),
  // U-390 日常委托触发标记：仅日常委托触发的待决事件带此字段，
  // 客户端据此标注「今日委托」；普通待决事件与旧存档皆缺省。
  daily: z.object({ dailyId: z.string(), locationId: z.string() }).optional(),
  // U-378 见好就收进行状态：仅抉择待决事件（id 为 loop:<事件id>）
  // 带此字段，客户端据此可标注圈数；普通待决事件与旧存档皆缺省。
  loop: z.object({
    eventId: z.string(), optionIdx: z.number(), round: z.number(), baseDc: z.number(),
    gains: z.object({
      cult: z.number().optional(), hp: z.number().optional(), mp: z.number().optional(),
      stones: z.number().optional(), karma: z.number().optional(),
    }),
  }).optional(),
});
// U-570：结构化判定明细（dice.ts 的 CheckDetail）；旧存档的 lastRoll
// 没有这一段，整段可选，缺失时客户端回退到汇总数字展示。
const checkDetailShape = z.object({
  expression: z.string(),
  // U-572：双掷明细（掷法 + 保留/舍弃的骰值）。U-572 之前的存档明细
  // 没有这三段，整段可选，缺失时客户端按普通 1d150 展示，读入不受影响。
  rollMode: z.enum(["normal", "advantage", "disadvantage"]).optional(),
  keptRolls: z.array(z.number()).optional(),
  droppedRolls: z.array(z.number()).optional(),
  // Q34：所属系统、基础骰面、本次动态上下限与归一化胜势差；Q34
  // 之前的存档明细没有这四段，整段可选。
  system: z.string().optional(),
  diceBase: z.number().optional(),
  diceLo: z.number().optional(),
  diceHi: z.number().optional(),
  scaledMargin: z.number().optional(),
  rolls: z.array(z.number()),
  diceTotal: z.number(),
  attrLabel: z.string(),
  bonusParts: z.array(z.object({ label: z.string(), value: z.number() })),
  bonus: z.number(),
  baseDc: z.number(),
  dc: z.number(),
  total: z.number(),
  margin: z.number(),
  success: z.boolean(),
  grade: z.enum(["success", "failure"]),
  modifierTrace: z.array(z.object({
    name: z.string(), label: z.string(), phase: z.enum(["before", "after"]),
    dcBefore: z.number(), dcAfter: z.number(), dcDelta: z.number(),
    bonusBefore: z.number(), bonusAfter: z.number(), bonusDelta: z.number(),
  })),
  text: z.string(),
});
const lastRollShape = z.object({
  label: z.string(), dice: z.number(), bonus: z.number(), total: z.number(), dc: z.number(),
  success: z.boolean(), text: z.string(),
  detail: checkDetailShape.optional(),
});
const characterShape = z.object({
  name: z.string(), origin: z.string(), rootId: z.string(), rootName: z.string(), artifactId: z.string(), artifactName: z.string(),
  // U-618 本命法宝分级门槛：artifactSealed 为持有法宝但境界未达门槛
  // （封存不可用）；artifactMinRealm/Name 是该宝的门槛（无宝时 0/空串）。
  artifactSealed: z.boolean(), artifactMinRealm: z.number(), artifactMinRealmName: z.string(),
  // U-617：所持法宝的镇魂记忆加成（百分点，无此 fx 时 0）——供轮回
  // 结算面板的记忆预判与服务端 memoryOutcome 同口径相加。
  artifactMemoryPct: z.number(),
  lifeNo: z.number(), realmIdx: z.number(), stageIdx: z.number(), cultivation: z.number(), totalCultivation: z.number(),
  hp: z.number(), maxHp: z.number(), mp: z.number(), maxMp: z.number(), stones: z.number(), karma: z.number(),
  age: z.number(), lifespan: z.number(), locationId: z.string(),
  // U-608 细时钟：本世累计月份（年龄由它推导，客户端据此显示「年+月」）。
  totalMonths: z.number(),
  might: z.number(), sense: z.number(), fortune: z.number(), body: z.number(),
  sealedMemory: z.boolean(), memoryTier: z.number(), dead: z.boolean(), deathCause: z.string().nullable(),
  pendingEvent: pendingEventShape.nullable(), lastRoll: lastRollShape.nullable(),
  // U-381 分叉路线：进行状态（当前层/总层数/本层三节点）；战斗与精英
  // 节点带敌手名、境界名与基准难度（生成时已定、明示给玩家选路）；
  // 无进行中路线与旧存档皆为 null。
  route: z.object({
    layer: z.number(), totalLayers: z.number(),
    nodes: z.array(z.object({
      type: z.string(),
      enemyId: z.string().optional(), enemyName: z.string().optional(),
      enemyTierName: z.string().optional(), enemyDc: z.number().optional(),
    })),
  }).nullable(),
  talentIds: z.array(z.string()), talentNames: z.array(z.string()), techniqueId: z.string().nullable(), techniqueName: z.string(),
  legacyPoints: z.number(), jadeLayers: z.number(),
  destinyId: z.string(), destinyName: z.string(), destinyDesc: z.string(),
  sectRankId: z.string(), sectRankName: z.string(), sectContrib: z.number(),
  // U-620：grantName = 晋升到下一位阶时宗门赐宝的法宝名（该位阶
  // 不在赐宝表里时为空串），晋升按钮旁明示，赐宝不再是暗奖。
  sectNext: z.object({ name: z.string(), contribNeed: z.number(), realmNeed: z.number(), grantName: z.string() }).nullable(),
  breakFails: z.number(), recentEvents: z.array(z.string()),
  quickPlan: z.array(z.object({ kind: z.string(), count: z.number() })),
  relations: z.array(z.object({ npcId: z.string(), name: z.string(), kind: z.string(), bond: z.number(), note: z.string() })),
  pills: z.object({ heal: z.number(), cult: z.number(), brk: z.number() }),
  caveLevel: z.number(), breakBonus: z.number(),
  // U-482 副职熟练度：craftUses 为四门副职的本世使用次数（存档原
  // 始字段）；craftSkills 为服务端按配置表 craft-skills.json 整形
  // 的熟练度面板——每门的使用次数、熟练度、当前等级与名号、当前
  // 破限产量加成、下一档门槛与名号、四档破限行及解锁状态。只读
  // 展示：熟练度结算在副职行动里由服务端按同一份配置执行。
  craftUses: z.record(z.string(), z.number()),
  craftSkills: z.array(z.object({
    kind: z.string(), label: z.string(), uses: z.number(), proficiency: z.number(),
    level: z.number(), levelName: z.string(), yieldPct: z.number(),
    nextLevelAt: z.number().nullable(), nextLevelName: z.string(),
    breakthroughs: z.array(z.object({ level: z.number(), label: z.string(), desc: z.string(), yieldPct: z.number(), unlocked: z.boolean() })),
  })),
  // U-464 锻造矿石：本世七阶矿石持有数（存档原始字段，键 = 矿石
  // id）；锻造台与坊市矿行的整形在顶层 forge 段。
  ores: z.record(z.string(), z.number()),
});
const talentShape = z.object({ id: z.string(), name: z.string(), tier: z.string(), desc: z.string() });
const birthChoiceShape = z.object({ pool: z.array(z.string()), value: z.string(), random: z.boolean() });
const birthDrawShape = z.object({
  origin: birthChoiceShape, destiny: birthChoiceShape, root: birthChoiceShape,
  talentChoices: z.array(talentShape), chosenTalents: z.array(z.string()),
});
const reincarnationShape = z.object({
  grade: z.string(), legacyEarned: z.number(),
  pointsEarned: z.number(),
  shardPointsEarned: z.number(), shardsThisLife: z.number(),
  // U-618：法宝候选额外带门槛字段（minRealm/minRealmName/locked/
  // lockReason，仅法宝候选有值）；法宝候选只含本世实际持有的那一
  // 件，本世无宝时数组里没有任何 kind=artifact 的条目。
  keepsakeCandidates: z.array(z.object({
    kind: z.string(), id: z.string(), name: z.string(), desc: z.string(), cost: z.number(),
    minRealm: z.number().optional(), minRealmName: z.string().optional(),
    locked: z.boolean().optional(), lockReason: z.string().optional(),
  })),
  keepsakes: z.array(z.object({ kind: z.string(), id: z.string(), name: z.string(), locationId: z.string() })),
  keptCost: z.number(),
  chosenOrigin: z.string().nullable(),
  memoryKept: z.boolean(), memoryNote: z.string(),
  artifactShattered: z.boolean(),
});
// U-388 委托板：板上张贴的委托（全量下发，atBoard 标记是否身在张
// 贴处——接取与结算都须身在张贴处）与已接委托（进度/是否达成/目
// 标地点）。委托定义、目标文案与奖励文案都由服务端按配置表整形，
// 客户端只展示与发动作。
const commissionOfferShape = z.object({
  id: z.string(), title: z.string(), brief: z.string(),
  issuerName: z.string(), issuerTitle: z.string(),
  boardLocationId: z.string(), boardLocationName: z.string(), atBoard: z.boolean(),
  locationName: z.string(), objectiveText: z.string(), rewardText: z.string(),
});
const commissionActiveShape = z.object({
  id: z.string(), title: z.string(),
  issuerName: z.string(), issuerTitle: z.string(),
  boardLocationId: z.string(), boardLocationName: z.string(), atBoard: z.boolean(),
  locationId: z.string(), locationName: z.string(), atTarget: z.boolean(), objectiveText: z.string(),
  progress: z.number(), need: z.number(), done: z.boolean(), rewardText: z.string(),
});
// U-389 限时帖：板上挂帖（带挂帖倒计时 daysLeft = 还能挂几天、
// leftText 为天/月文案、接取时限 limitDays/limitText 与声望四段文
// 案 repText，接帖前代价全明示）与已接限时帖（带截止倒计时
// daysLeft = 还剩几天办妥；done 后倒计时不再约束交帖）。U-610：
// 倒计时按天/月计，时钟走累计月份折算天序。定义、目标/声望文案
// 与倒计时都由服务端按配置表与当前天序整形，客户端只展示与发
// 动作。
const timedOfferShape = z.object({
  id: z.string(), title: z.string(), brief: z.string(),
  issuerName: z.string(), issuerTitle: z.string(),
  boardLocationId: z.string(), boardLocationName: z.string(), atBoard: z.boolean(),
  locationName: z.string(), objectiveText: z.string(), rewardText: z.string(),
  limitDays: z.number(), limitText: z.string(), daysLeft: z.number(), leftText: z.string(), repText: z.string(),
});
const timedActiveShape = z.object({
  id: z.string(), title: z.string(),
  issuerName: z.string(), issuerTitle: z.string(),
  boardLocationId: z.string(), boardLocationName: z.string(), atBoard: z.boolean(),
  locationId: z.string(), locationName: z.string(), atTarget: z.boolean(), objectiveText: z.string(),
  progress: z.number(), need: z.number(), done: z.boolean(), rewardText: z.string(),
  daysLeft: z.number(), leftText: z.string(), repText: z.string(),
});
// U-390 日常委托：今日这一批委托（待办与已办妥分开下发）——来源
// （heaven 天庭朋友圈 / underworld 地府委托）、发布方名义、触发地
// 点与际遇名、奖励文案都由服务端按配置表整形；没有接取动作，客
// 户端只展示（进入地点即触发，待办卡上明示「去此地即触发」）。
const dailyItemShape = z.object({
  id: z.string(), title: z.string(), brief: z.string(),
  source: z.string(), sourceLabel: z.string(), issuer: z.string(),
  locationId: z.string(), locationName: z.string(), atLocation: z.boolean(),
  eventTitle: z.string(), objectiveText: z.string(), rewardText: z.string(),
});
// U-391 地点签到：全部签到点下发（地点/档位/标题/签到文案/奖励文
// 案），signed 标记本世是否已签、atLocation 标记是否正站在此地。
// 没有接取动作：到达即由服务端结算（旅行尾巴/读档），客户端只展示。
// U-392 签到图鉴：inCodex 标记该点是否已记入跨世图鉴、revisitText
// 是按档故地重游小奖文案（本世已签后再抵达只发这份小奖）。
const signInItemShape = z.object({
  id: z.string(), title: z.string(), text: z.string(),
  locationId: z.string(), locationName: z.string(), atLocation: z.boolean(),
  tier: z.string(), tierLabel: z.string(), rewardText: z.string(), signed: z.boolean(),
  inCodex: z.boolean(), revisitText: z.string(),
});

export const stateResponse = z.object({
  settings: settingsShape,
  // U-625：本局规则是否已锁定（新游戏规则设定页确认后为 true；
  // 客户端据此渲染游戏内规则页只读，设定页仅在未锁定时出现）。
  rulesLocked: z.boolean(),
  character: characterShape.nullable(),
  lives: z.array(z.object({
    lifeNo: z.number(), name: z.string(), realmText: z.string(), age: z.number(), cause: z.string(), grade: z.string(),
    artifactName: z.string(), keepsakes: z.array(z.string()), talents: z.array(z.string()),
  })),
  log: z.array(z.object({ id: z.number(), lifeNo: z.number(), kind: z.string(), text: z.string() })),
  fragments: z.array(z.object({ id: z.number(), lifeNo: z.number(), label: z.string(), detail: z.string() })),
  buried: z.array(z.object({ treasureName: z.string(), locationId: z.string(), locationName: z.string(), buriedLife: z.number(), found: z.boolean() })),
  reincarnation: reincarnationShape.nullable(),
  birthDraw: birthDrawShape.nullable(),
  // U-002 轮回点：跨世点数池余额、待降生生效的开局属性分配、数值配置
  // 表（发放档位与价格，客户端展示用，与服务端结算同一份配置）。
  reincarnationPoints: z.number(),
  birthBoost: z.object({ might: z.number(), sense: z.number(), fortune: z.number(), body: z.number() }).nullable(),
  // U-021：已购待降生生效的「再战天道」强化项 id 列表。
  birthBoons: z.array(z.string()),
  pointsConfig: z.object({
    grantByGrade: z.object({ S: z.number(), A: z.number(), B: z.number(), C: z.number() }),
    attrCostPerPoint: z.number(), attrCapPerAttr: z.number(), resetCost: z.number(),
    boons: z.array(z.object({
      id: z.string(), name: z.string(), desc: z.string(), cost: z.number(),
      effect: z.object({ hp: z.number().optional(), mp: z.number().optional(), stones: z.number().optional(), lifespanPct: z.number().optional() }),
    })),
    // U-322：主线碎片分档发放表（与服务端结算同一份配置）。
    shardTiers: z.array(z.object({ min: z.number(), points: z.number() })),
  }),
  pools: z.object({
    names: z.array(z.string()), origins: z.array(z.string()),
    destinies: z.array(z.object({ id: z.string(), name: z.string(), desc: z.string() })),
    talents: z.array(talentShape),
    artifacts: z.array(z.object({ id: z.string(), name: z.string(), desc: z.string(), minRealm: z.number(), minRealmName: z.string() })),
    treasures: z.array(z.object({ id: z.string(), name: z.string(), desc: z.string() })),
    sectRanks: z.array(z.object({ id: z.string(), name: z.string(), contribNeed: z.number(), realmNeed: z.number(), stipend: z.number() })),
  }),
  realmNames: z.array(z.string()),
  stageNames: z.array(z.string()),
  threshold: z.number(),
  locations: z.array(z.object({ id: z.string(), name: z.string(), locked: z.boolean(), lockReason: z.string(), decayPct: z.number() })),
  mainline: z.object({
    shards: z.number(), total: z.number(), done: z.boolean(),
    chapters: z.array(z.object({ title: z.string(), text: z.string(), need: z.number(), unlocked: z.boolean() })),
  }),
  enemiesHere: z.array(z.object({ id: z.string(), name: z.string(), desc: z.string(), tierName: z.string(), dc: z.number() })),
  shop: z.object({ healPrice: z.number(), cultPrice: z.number(), breakPrice: z.number(), sellReady: z.boolean(), caveCost: z.number() }),
  // U-464 锻造法宝：七阶矿石整行下发——品阶/矿名/可锻法宝的门槛境
  // 界名/锻造难度/灵石代价/坊市价（已按境界分档）/持有数/该阶可
  // 锻法宝名（同一法宝池）/不可锻原因（空串 = 可锻）。判定与产出
  // 都在服务端按同一份配置表执行，客户端只展示与发动作。
  // U-619：另下发炼制双门槛的静态要求（炼器等级数/等级名/境界名），
  // 客户端逐阶明示；未达门槛时 blockReason 即门槛缺项文案。
  forge: z.object({
    dropChancePct: z.number(),
    tiers: z.array(z.object({
      tier: z.number(), id: z.string(), name: z.string(), artifactRealmName: z.string(),
      dc: z.number(), stoneCost: z.number(), buyPrice: z.number(), owned: z.number(),
      artifacts: z.array(z.string()), blockReason: z.string(),
      minCraftLevel: z.number(), minCraftLevelName: z.string(), minRealmName: z.string(),
    })),
  }),
  // U-388 委托板：同时可接数、本世已完成数、板上张贴与已接委托。
  commissions: z.object({
    maxActive: z.number(), completedCount: z.number(),
    offered: z.array(commissionOfferShape),
    active: z.array(commissionActiveShape),
  }),
  // U-389 限时帖：同时可接数、本世办妥/失败/过期数、板上挂帖与已接限时帖（均带倒计时）。
  timedEvents: z.object({
    maxActive: z.number(), completedCount: z.number(), failedCount: z.number(), lapsedCount: z.number(),
    offered: z.array(timedOfferShape),
    active: z.array(timedActiveShape),
  }),
  // U-390 日常委托事件池：本批条数、本世已办妥数、本批待办与本批已办妥（U-611 起按月刷新、无接取动作）。
  dailyCommissions: z.object({
    batchSize: z.number(), completedCount: z.number(),
    pending: z.array(dailyItemShape),
    done: z.array(dailyItemShape),
  }),
  // U-391 地点签到：签到点总数、本世已签到数、全部签到点（到达即得、无接取动作）。
  // U-392 签到图鉴：codexCount/codexTotal 是跨世收集进度（已收录签到点数 / 签到点总数）。
  signIns: z.object({
    total: z.number(), signedCount: z.number(),
    codexCount: z.number(), codexTotal: z.number(),
    spots: z.array(signInItemShape),
  }),
  // U-393 封印之蛋：收集物总数、已拾数（跨世）、集齐门槛、距下一
  // 条线索还差几枚、全部蛋（埋藏地点/是否已拾/是否正在此地）、已
  // 换得的前世遗藏线索（只含被指地点与线索文案）、线索标出的无
  // 主遗藏所在地点名（未标出时为空串；只给地点，不给宝物名号）。
  // 没有接取动作：探索拾取由服务端结算，客户端只展示。
  sealedEggs: z.object({
    total: z.number(), foundCount: z.number(),
    clueThreshold: z.number(), nextClueIn: z.number(),
    eggs: z.array(z.object({
      id: z.string(), name: z.string(), text: z.string(),
      locationId: z.string(), locationName: z.string(),
      atLocation: z.boolean(), found: z.boolean(),
    })),
    clues: z.array(z.object({
      locationId: z.string(), locationName: z.string(),
      source: z.string(), text: z.string(),
    })),
    revealedLocationName: z.string(),
  }),
  // U-394 探索事件分包/外传：全部事件包（配置表顺序）与本世解锁
  // 状态——lifeNo 为当前世数（无角色时为下一世世数），每包带解锁
  // 世数 minLife、是否已解锁、成员事件数与成员事件名（本篇成员为
  // 未被外传认领的余集，在此展开）。只读展示：解锁在轮回建堆时由
  // 服务端按配置结算，客户端不参与判定。
  eventPacks: z.object({
    lifeNo: z.number(),
    poolTotal: z.number(),
    packs: z.array(z.object({
      id: z.string(), name: z.string(), desc: z.string(),
      minLife: z.number(), unlocked: z.boolean(),
      events: z.array(z.object({ id: z.string(), title: z.string() })),
    })),
  }),
  // U-395 新增事件分批投放：全部投放批次（首发第 1 批在最前，其成
  // 员为未被任何批次认领的余集，在此展开计数、事件名只下发新批
  // 次的）与两个版本数——currentVersion 为配置表当前最新投放版
  // 本，lifeVersion 为本世牌堆落定的投放版本（无角色时为最新版
  // 本，即下一世将落定的值）；inThisLife = 该批是否已随本世牌堆
  // 入世，未入世的批次将于轮回开新世时自动纳入，无需重开存档。
  // 只读展示：投放过滤在建堆/抽牌时由服务端按配置结算，客户端
  // 不参与判定。
  eventReleases: z.object({
    currentVersion: z.number(),
    lifeVersion: z.number(),
    batches: z.array(z.object({
      version: z.number(), name: z.string(), desc: z.string(),
      inThisLife: z.boolean(), eventCount: z.number(),
      events: z.array(z.object({ id: z.string(), title: z.string() })),
    })),
  }),
  // U-396 按地点排布事件掉落：掉落概率与全部掉落行（配置表顺序）
  // ——每行带地点名、品质档与档位标签、残页功法名与说明、已在修
  // 习功法时的折作参悟文案、是否正站在此地。只读展示：掉落在事
  // 件结算时由服务端按配置结算，客户端不参与判定。
  locationDrops: z.object({
    chancePct: z.number(),
    drops: z.array(z.object({
      locationId: z.string(), locationName: z.string(), atLocation: z.boolean(),
      tier: z.string(), tierLabel: z.string(),
      techniqueId: z.string(), techniqueName: z.string(), techniqueDesc: z.string(),
      fallbackText: z.string(),
    })),
  }),
  // U-608 细时钟：耗时配置表整形——每月数、八个动作耗时（带中文
  // 名）与逐目的地旅行耗时（带地点名，按地点表顺序）。只读展示：
  // 时间推进在各行动结算时由服务端按同一份配置执行，客户端不
  // 参与判定。
  timeCosts: z.object({
    monthsPerYear: z.number(),
    costs: z.array(z.object({ key: z.string(), label: z.string(), months: z.number() })),
    travel: z.array(z.object({ locationId: z.string(), locationName: z.string(), months: z.number() })),
  }),
});
type StateResponse = z.infer<typeof stateResponse>;
type CharacterResponse = z.infer<typeof characterShape>;

// U-620：委托奖励文案——原有报酬之外，配置了赠宝的委托（artifact
// -sources.json 的 commissionGrants）再缀一句赠宝注（法宝名与效
// 果、槽已占时的折作值），玩家揭榜前就看得见这件宝，不做暗奖；
// 无赠宝的委托文案与改前逐字一致。
function commissionRewardText(commissionId: string, reward: Effect): string {
  const base = formatEffectGains(reward);
  const grant = commissionGrantFor(commissionId);
  if (!grant) return base;
  const def = artifactById(grant.artifactId);
  const note = `另赠法宝「${def?.name ?? grant.artifactId}」（${def?.desc ?? ""}已有本命法宝时折作${formatEffectGains(grant.occupiedFallback)}）`;
  return base ? `${base}；${note}` : note;
}

function toCharacter(c: Character, settings: Settings): CharacterResponse {
  const destiny = destinyById(c.destinyId);
  const rankIdx = SECT_RANKS.findIndex((r) => r.id === c.sectRankId);
  const nextRank = rankIdx >= 0 ? SECT_RANKS[rankIdx + 1] : undefined;
  // U-618：法宝门槛展示字段——封存 = 持有法宝但加成未生效（境界未
  // 达门槛）；门槛名按当前境界体系取，越界时回退经典九境名。
  const artifactDef = artifactById(c.artifactId);
  return {
    ...c,
    artifactSealed: !!artifactDef && !c.artifactBonusApplied,
    artifactMinRealm: artifactDef?.minRealm ?? 0,
    artifactMinRealmName: artifactDef ? (realmsFor(settings)[artifactDef.minRealm]?.name ?? CLASSIC_REALMS[artifactDef.minRealm]?.name ?? "") : "",
    artifactMemoryPct: artifactDef?.fx?.memoryPct ?? 0,
    // U-381：路线节点整形——敌手 id 换成可展示的名字/境界/难度。
    route: c.route ? {
      layer: c.route.layer, totalLayers: c.route.totalLayers,
      nodes: c.route.nodes.map((n) => {
        const e = n.enemyId ? ENEMIES.find((x) => x.id === n.enemyId) : undefined;
        return e
          ? { type: n.type, enemyId: e.id, enemyName: e.name, enemyTierName: realmsFor(settings)[e.tier]?.name ?? "", enemyDc: combatDc(e) }
          : { type: n.type };
      }),
    } : null,
    talentNames: c.talentIds.map((id) => talentById(id)?.name ?? id),
    techniqueName: techById(c.techniqueId)?.name ?? "",
    destinyName: destiny?.name ?? "",
    destinyDesc: destiny?.desc ?? "",
    sectRankName: sectRankById(c.sectRankId)?.name ?? "",
    sectNext: nextRank ? { name: nextRank.name, contribNeed: nextRank.contribNeed, realmNeed: nextRank.realmNeed, grantName: artifactById(sectGrantForRank(nextRank.id)?.artifactId ?? "")?.name ?? "" } : null,
    // U-482：熟练度面板整形——四门按配置表顺序逐门算派生量（熟练
    // 度/等级/下一档/破限解锁），客户端只展示不判定。
    craftSkills: CRAFT_KINDS.map((kind) => {
      const uses = Math.max(0, Math.floor(c.craftUses?.[kind] ?? 0));
      const lvl = craftLevelDefFor(uses);
      const next = craftNextLevelDef(uses);
      const def = CRAFT_SKILLS.kinds[kind];
      return {
        kind, label: def.label, uses,
        proficiency: craftProficiencyFor(uses),
        level: lvl.level, levelName: lvl.name,
        yieldPct: craftYieldPctFor(kind, lvl.level),
        nextLevelAt: next ? next.minUses : null,
        nextLevelName: next ? next.name : "",
        breakthroughs: def.breakthroughs.map((b) => ({ level: b.level, label: b.label, desc: b.desc, yieldPct: b.yieldPct, unlocked: lvl.level >= b.level })),
      };
    }),
  };
}
export function toResponse(state: GameState): StateResponse {
  const c = state.character;
  const wk = weekKeyOf(new Date());
  const counts = c && c.weekKey === wk ? c.groupCounts : {};
  return {
    settings: state.settings,
    rulesLocked: state.rulesLocked,
    character: c ? toCharacter(c, state.settings) : null,
    lives: state.lives,
    log: state.log.slice(0, 40),
    fragments: state.fragments,
    buried: state.buried.map((b) => ({ treasureName: b.treasureName, locationId: b.locationId, locationName: b.locationName, buriedLife: b.buriedLife, found: false })),
    reincarnation: state.reincarnation ? {
      grade: state.reincarnation.grade,
      legacyEarned: state.reincarnation.legacyEarned,
      pointsEarned: state.reincarnation.pointsEarned,
      shardPointsEarned: state.reincarnation.shardPointsEarned ?? 0,
      shardsThisLife: state.reincarnation.shardsThisLife ?? 0,
      keepsakeCandidates: state.reincarnation.keepsakeCandidates,
      keepsakes: state.reincarnation.keepsakes.map((k) => ({
        kind: k.kind, id: k.id,
        name: k.kind === "artifact" ? (ARTIFACTS.find((a) => a.id === k.id)?.name ?? k.id) : k.kind === "technique" ? (techById(k.id)?.name ?? k.id) : (treasureById(k.id)?.name ?? k.id),
        locationId: k.locationId ?? "",
      })),
      keptCost: state.reincarnation.keepsakes.reduce((sum, k) => sum + (state.reincarnation?.keepsakeCandidates.find((x) => x.kind === k.kind && x.id === k.id)?.cost ?? 0), 0),
      chosenOrigin: state.reincarnation.chosenOrigin,
      memoryKept: state.reincarnation.memoryKept,
      memoryNote: state.reincarnation.memoryNote,
      artifactShattered: state.reincarnation.artifactShattered,
    } : null,
    birthDraw: state.birthDraw,
    reincarnationPoints: state.reincarnationPoints,
    birthBoost: state.birthBoost,
    birthBoons: state.birthBoons ?? [],
    pointsConfig: REINCARNATION_POINTS,
    pools: {
      names: NAME_POOL, origins: ORIGIN_POOL,
      destinies: DESTINIES.map((d) => ({ id: d.id, name: d.name, desc: d.desc })),
      talents: TALENTS,
      artifacts: ARTIFACTS.map((a) => ({ id: a.id, name: a.name, desc: a.desc, minRealm: a.minRealm, minRealmName: realmsFor(state.settings)[a.minRealm]?.name ?? CLASSIC_REALMS[a.minRealm]?.name ?? "" })),
      treasures: TREASURES.map((t) => ({ id: t.id, name: t.name, desc: t.desc })),
      sectRanks: SECT_RANKS.map((r) => ({ id: r.id, name: r.name, contribNeed: r.contribNeed, realmNeed: r.realmNeed, stipend: r.stipend })),
    },
    realmNames: realmsFor(state.settings).map((r) => r.name),
    stageNames: [...STAGES],
    threshold: c ? threshold(c.realmIdx, c.stageIdx) : 60,
    locations: LOCATIONS.map((l) => {
      const locked = c ? !locUnlocked(c, l) : l.minRealm > 0;
      const gate = l.id === "realm" && c && c.lifeNo >= 2 ? 0 : l.minRealm;
      return {
        id: l.id, name: l.name, locked,
        lockReason: locked ? `需${realmsFor(state.settings)[gate]?.name ?? ""}境${l.id === "realm" ? "（仅第一世）" : ""}` : "",
        decayPct: Math.round(decayMult(counts[l.group] ?? 0) * 100),
      };
    }),
    mainline: {
      shards: state.mainline.shards, total: MAINLINE_TOTAL_SHARDS, done: state.mainline.done,
      chapters: MAINLINE_CHAPTERS.map((ch) => ({ title: ch.title, text: ch.text, need: ch.need, unlocked: state.mainline.shards >= ch.need })),
    },
    enemiesHere: c ? ENEMIES.filter((e) => e.locations.includes(c.locationId)).map((e) => ({
      id: e.id, name: e.name, desc: e.desc,
      tierName: realmsFor(state.settings)[e.tier]?.name ?? "",
      dc: combatDc(e),
    })) : [],
    shop: {
      healPrice: c ? shopPrice(SHOP.heal.base, c.realmIdx) : SHOP.heal.base,
      cultPrice: c ? shopPrice(SHOP.cult.base, c.realmIdx) : SHOP.cult.base,
      breakPrice: c ? shopPrice(SHOP.brk.base, c.realmIdx) : SHOP.brk.base,
      sellReady: c ? !counts["sellpills"] : false,
      caveCost: c && c.caveLevel < 3 ? caveUpgradeCost(c.caveLevel, c.realmIdx) : 0,
    },
    // U-464 锻造台整形：逐阶算坊市价（Q17 按境界分档）、持有数与
    // 不可锻原因（与 forgeArtifact 的服务端守卫同口径：U-619 双
    // 门槛 / 候选为空 / 缺矿石 / 灵石不足，顺序一致——门槛排最前，
    // 未达门槛时 blockReason 逐项列出缺的门槛）；无角色时价取基准
    // 价、持有 0。
    forge: {
      dropChancePct: FORGE.dropChancePct,
      tiers: FORGE.tiers.map((t) => {
        const owned = c ? oreCountFor(c, t.id) : 0;
        const candidates = forgeCandidatesFor(t);
        const forgeable = c ? candidates.filter((a) => a.id !== c.artifactId) : candidates;
        const gate = c ? forgeGateFor(state, c, t) : null;
        const blockReason = !c ? ""
          : gate && !gate.open ? gate.missing.join("；")
          : forgeable.length === 0 ? `此阶能锻的法宝只有你正持有的那件，无可再锻`
          : owned < 1 ? `缺矿石：没有${t.tier}阶「${t.name}」`
          : c.stones < t.stoneCost ? `灵石不足：需 ${t.stoneCost}，你只有 ${c.stones}`
          : "";
        return {
          tier: t.tier, id: t.id, name: t.name,
          artifactRealmName: realmsFor(state.settings)[t.artifactRealm]?.name ?? CLASSIC_REALMS[t.artifactRealm]?.name ?? "",
          dc: t.dc, stoneCost: t.stoneCost,
          buyPrice: c ? shopPrice(t.buyPrice, c.realmIdx) : t.buyPrice,
          owned,
          artifacts: candidates.map((a) => a.name),
          blockReason,
          minCraftLevel: t.minCraftLevel,
          minCraftLevelName: CRAFT_SKILLS.levels.find((l) => l.level === t.minCraftLevel)?.name ?? "",
          minRealmName: realmsFor(state.settings)[t.minRealm]?.name ?? CLASSIC_REALMS[t.minRealm]?.name ?? "",
        };
      }),
    },
    // U-388 委托板整形：id → 委托人/地点名/目标文案/奖励文案；无角
    // 色（创建页）时为空板。
    commissions: {
      maxActive: COMMISSIONS.maxActive,
      completedCount: c?.commissions?.completedCount ?? 0,
      offered: (c?.commissions?.board ?? []).flatMap((id) => {
        const d = commissionById(id);
        if (!d) return [];
        const issuer = npcById(d.issuerNpc);
        return [{
          id: d.id, title: d.title, brief: d.brief,
          issuerName: issuer?.name ?? "", issuerTitle: issuer?.title ?? "",
          boardLocationId: d.boardLocationId,
          boardLocationName: locById(d.boardLocationId)?.name ?? d.boardLocationId,
          atBoard: !!c && c.locationId === d.boardLocationId,
          locationName: locById(d.locationId)?.name ?? d.locationId,
          objectiveText: commissionObjectiveText(d),
          rewardText: commissionRewardText(d.id, d.reward),
        }];
      }),
      active: (c?.commissions?.active ?? []).flatMap((a) => {
        const d = commissionById(a.id);
        if (!d) return [];
        const issuer = npcById(d.issuerNpc);
        return [{
          id: d.id, title: d.title,
          issuerName: issuer?.name ?? "", issuerTitle: issuer?.title ?? "",
          boardLocationId: d.boardLocationId,
          boardLocationName: locById(d.boardLocationId)?.name ?? d.boardLocationId,
          atBoard: !!c && c.locationId === d.boardLocationId,
          locationId: d.locationId,
          locationName: locById(d.locationId)?.name ?? d.locationId,
          atTarget: !!c && c.locationId === d.locationId,
          objectiveText: commissionObjectiveText(d),
          progress: a.progress, need: d.objective.need, done: a.done,
          rewardText: commissionRewardText(d.id, d.reward),
        }];
      }),
    },
    // U-389 限时帖整形：id → 发布人/地点名/目标文案/奖励文案/声望
    // 四段文案；倒计时按当前天序现算（U-610：挂帖 daysLeft = 挂
    // 满过期的剩余天数、已接 daysLeft = 截止天序的剩余天数，
    // leftText 为天/月文案；到期项已在 loadState 的 settleTimed-
    // Events 里结清，不会出现负数，仍以 0 兜底防陈旧内存状态）。
    // 无角色（创建页）时为空板。
    timedEvents: {
      maxActive: TIMED_EVENTS.maxActive,
      completedCount: c?.timedEvents?.completedCount ?? 0,
      failedCount: c?.timedEvents?.failedCount ?? 0,
      lapsedCount: c?.timedEvents?.lapsedCount ?? 0,
      offered: (c?.timedEvents?.board ?? []).flatMap((p) => {
        const d = timedEventById(p.id);
        if (!d || !c) return [];
        const issuer = npcById(d.issuerNpc);
        const daysLeft = Math.max(0, p.postedDay + d.postDays - timedNowDay(c));
        return [{
          id: d.id, title: d.title, brief: d.brief,
          issuerName: issuer?.name ?? "", issuerTitle: issuer?.title ?? "",
          boardLocationId: d.boardLocationId,
          boardLocationName: locById(d.boardLocationId)?.name ?? d.boardLocationId,
          atBoard: c.locationId === d.boardLocationId,
          locationName: locById(d.locationId)?.name ?? d.locationId,
          objectiveText: timedObjectiveText(d),
          rewardText: formatEffectGains(d.reward),
          limitDays: d.limitDays, limitText: timedDaysText(d.limitDays),
          daysLeft, leftText: timedDaysText(daysLeft),
          repText: timedRepText(d),
        }];
      }),
      active: (c?.timedEvents?.active ?? []).flatMap((a) => {
        const d = timedEventById(a.id);
        if (!d || !c) return [];
        const issuer = npcById(d.issuerNpc);
        const daysLeft = Math.max(0, a.deadlineDay - timedNowDay(c));
        return [{
          id: d.id, title: d.title,
          issuerName: issuer?.name ?? "", issuerTitle: issuer?.title ?? "",
          boardLocationId: d.boardLocationId,
          boardLocationName: locById(d.boardLocationId)?.name ?? d.boardLocationId,
          atBoard: c.locationId === d.boardLocationId,
          locationId: d.locationId,
          locationName: locById(d.locationId)?.name ?? d.locationId,
          atTarget: c.locationId === d.locationId,
          objectiveText: timedObjectiveText(d),
          progress: a.progress, need: d.objective.need, done: a.done,
          rewardText: formatEffectGains(d.reward),
          daysLeft, leftText: timedDaysText(daysLeft),
          repText: timedRepText(d),
        }];
      }),
    },
    // U-390 日常委托整形：本批待办/已办妥的 id → 来源/发布方/地点
    // 名/际遇名/目标文案/奖励文案；本批以读档时 ensureDailyBoard
    // 按累计月份刷新为准（U-611：批次已过期未刷新的陈旧内存状态
    // 按空批下发，dailyBatchIsCurrent 与服务端同一口径）。无角色
    // （创建页）时为空批。
    dailyCommissions: {
      batchSize: DAILY_COMMISSIONS.batchSize,
      completedCount: c?.dailyCommissions?.completedCount ?? 0,
      pending: (c && c.dailyCommissions && dailyBatchIsCurrent(c) ? c.dailyCommissions.pending : []).flatMap((id) => {
        const d = dailyCommissionById(id);
        if (!d || !c || c.dailyCommissions.doneIds.includes(id)) return [];
        return [{
          id: d.id, title: d.title, brief: d.brief,
          source: d.source, sourceLabel: d.source === "heaven" ? "🌤️ 天庭朋友圈" : "🌙 地府委托",
          issuer: d.issuer,
          locationId: d.locationId,
          locationName: locById(d.locationId)?.name ?? d.locationId,
          atLocation: c.locationId === d.locationId,
          eventTitle: EVENTS.find((e) => e.id === d.eventId)?.title ?? d.eventId,
          objectiveText: dailyObjectiveText(d),
          rewardText: formatEffectGains(d.reward),
        }];
      }),
      done: (c && c.dailyCommissions && dailyBatchIsCurrent(c) ? c.dailyCommissions.doneIds : []).flatMap((id) => {
        const d = dailyCommissionById(id);
        if (!d || !c) return [];
        return [{
          id: d.id, title: d.title, brief: d.brief,
          source: d.source, sourceLabel: d.source === "heaven" ? "🌤️ 天庭朋友圈" : "🌙 地府委托",
          issuer: d.issuer,
          locationId: d.locationId,
          locationName: locById(d.locationId)?.name ?? d.locationId,
          atLocation: c.locationId === d.locationId,
          eventTitle: EVENTS.find((e) => e.id === d.eventId)?.title ?? d.eventId,
          objectiveText: dailyObjectiveText(d),
          rewardText: formatEffectGains(d.reward),
        }];
      }),
    },
    // U-391 地点签到整形：配置表全部签到点 → 地点名/档位标签/奖励
    // 文案（服务端按配置整形），signed 取角色本世已签列表、atLocation
    // 取当前所在地；无角色（创建页）时 signed 全为否。
    // U-392 签到图鉴整形：档位标签改读配置 tiers（与分档结算同一份
    // 配置）、inCodex 取跨世图鉴清单、revisitText 是按档小奖文案、
    // codexCount/codexTotal 是跨世收集进度。
    signIns: {
      total: SIGN_INS.spots.length,
      signedCount: c?.signIns?.count ?? 0,
      codexCount: state.signInCodex?.length ?? 0,
      codexTotal: SIGN_INS.spots.length,
      spots: SIGN_INS.spots.map((s) => ({
        id: s.id, title: s.title, text: s.text,
        locationId: s.locationId,
        locationName: locById(s.locationId)?.name ?? s.locationId,
        atLocation: !!c && c.locationId === s.locationId,
        tier: s.tier,
        tierLabel: SIGN_INS.tiers[s.tier].label,
        rewardText: signInRewardText(s),
        signed: !!c && (c.signIns?.done ?? []).includes(s.id),
        inCodex: (state.signInCodex ?? []).includes(s.id),
        revisitText: signInRevisitText(s),
      })),
    },
    // U-393 封印之蛋整形：配置表全部蛋 → 埋藏地点名/是否已拾（跨
    // 世收集清单）/是否正在此地；nextClueIn 是距下一条线索还差的
    // 枚数（蛋已拾尽时为 0）；clues 只下发被指地点与线索文案；
    // revealedLocationName 只给无主遗藏的所在地点（线索已公开的信
    // 息），不下发宝物 id/名号——宝物要到现场取回时才揭晓。
    sealedEggs: {
      total: SEALED_EGGS.eggs.length,
      foundCount: state.sealedEggs?.totalFound ?? 0,
      clueThreshold: SEALED_EGGS.clueThreshold,
      nextClueIn: (state.sealedEggs?.totalFound ?? 0) >= SEALED_EGGS.eggs.length
        ? 0
        : SEALED_EGGS.clueThreshold - ((state.sealedEggs?.totalFound ?? 0) % SEALED_EGGS.clueThreshold),
      eggs: SEALED_EGGS.eggs.map((e) => ({
        id: e.id, name: e.name, text: e.text,
        locationId: e.locationId,
        locationName: locById(e.locationId)?.name ?? e.locationId,
        atLocation: !!c && c.locationId === e.locationId,
        found: (state.sealedEggs?.found ?? []).includes(e.id),
      })),
      clues: (state.sealedEggs?.clues ?? []).map((cl) => ({
        locationId: cl.locationId, locationName: cl.locationName,
        source: cl.source, text: cl.text,
      })),
      revealedLocationName: state.sealedEggs?.revealed?.locationName ?? "",
    },
    // U-394 外传分包整形：按配置表顺序下发全部包；成员事件名由事
    // 件池现查（本篇包成员 = 未被任何外传包认领的事件）；unlocked
    // 按本世世数与包 minLife 现算，与建堆过滤同一口径。
    eventPacks: {
      lifeNo: c?.lifeNo ?? state.lives.length + 1,
      // 本世事件池总数 = 已解锁分包且已随本世牌堆版本入世的事件合
      // 计，与本世牌堆建堆张数一致（U-394 分包过滤 ∧ U-395 投放
      // 过滤，牌堆成员即本池事件按权重洗序）。
      poolTotal: EVENTS.filter((e) => eventPackOf(e.id).minLife <= (c?.lifeNo ?? state.lives.length + 1) && eventReleaseVersion(e.id) <= (c?.deckVersion ?? CURRENT_EVENT_VERSION)).length,
      packs: EVENT_PACKS.packs.map((p) => ({
        id: p.id, name: p.name, desc: p.desc,
        minLife: p.minLife,
        unlocked: p.minLife <= (c?.lifeNo ?? state.lives.length + 1),
        events: EVENTS.filter((e) => eventPackOf(e.id).id === p.id).map((e) => ({ id: e.id, title: e.title })),
      })),
    },
    // U-395 投放批次整形：首发第 1 批（余集）置于最前，其后按版本
    // 升序排配置批次；inThisLife 按本世牌堆版本现算，与建堆过滤同
    // 一口径。首发批只下发计数（80 桩事件名已在 eventPacks 段全量
    // 展开，不重复下发），新批次下发成员事件名。
    eventReleases: {
      currentVersion: CURRENT_EVENT_VERSION,
      lifeVersion: c?.deckVersion ?? CURRENT_EVENT_VERSION,
      batches: [
        {
          version: 1, name: "首发批", desc: "游戏首发时便在池中的探索事件，自第一批起投放。",
          inThisLife: true,
          eventCount: EVENTS.filter((e) => eventReleaseVersion(e.id) === 1).length,
          events: [],
        },
        ...[...EVENT_RELEASES.batches].sort((a, b) => a.version - b.version).map((b) => ({
          version: b.version, name: b.name, desc: b.desc,
          inThisLife: b.version <= (c?.deckVersion ?? CURRENT_EVENT_VERSION),
          eventCount: b.eventIds.length,
          events: b.eventIds.map((id) => ({ id, title: EVENTS.find((e) => e.id === id)?.title ?? id })),
        })),
      ],
    },
    // U-396 掉落表整形：按配置表顺序下发全部掉落行；地点名/功法
    // 名由内容池现查，折作参悟文案按所在档位 fallback 现算，与服
    // 务端结算同一份配置。
    locationDrops: {
      chancePct: LOCATION_DROPS.chancePct,
      drops: LOCATION_DROPS.drops.map((d) => {
        const tech = techById(d.techniqueId);
        const td = dropTierDef(d.tier);
        return {
          locationId: d.locationId,
          locationName: locById(d.locationId)?.name ?? d.locationId,
          atLocation: !!c && c.locationId === d.locationId,
          tier: d.tier, tierLabel: td.label,
          techniqueId: d.techniqueId,
          techniqueName: tech?.name ?? d.techniqueId,
          techniqueDesc: tech?.desc ?? "",
          fallbackText: formatEffectGains(td.fallback),
        };
      }),
    },
    // U-608 细时钟整形：动作耗时按固定展示顺序下发（键 → 中文名在
    // 此一处映射），旅行耗时按地点表顺序；数值全部现读配置表，与
    // 服务端推进口径同一份配置。
    timeCosts: {
      monthsPerYear: TIME_COSTS.monthsPerYear,
      costs: ([
        ["cultivate", "修炼"], ["breakthrough", "突破"], ["explore", "探索"], ["rest", "休整"],
        ["fight", "斗法"], ["craft", "副职"], ["sectChore", "宗门差事"], ["social", "社交"],
      ] as [TimeCostKey, string][]).map(([key, label]) => ({ key, label, months: timeCostMonths(key) })),
      travel: LOCATIONS.map((l) => ({
        locationId: l.id,
        locationName: l.name,
        months: travelMonthsTo(l.id),
      })),
    },
  };
}

export type { StateResponse, CharacterResponse };
