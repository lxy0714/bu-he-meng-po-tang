// 轮回修仙跑团 — 静态数据池门面：内容本体自 U-565 起全部迁入
// server/src/content/*.json 配置文件，经 content.ts 做 schema 校验与
// 跨池引用自检后加载；本文件只做再导出（保持既有 import 路径不变）、
// 派生量与按 id 查表工具。加内容 = 往 JSON 里加一行，不改代码。

import { combatDcFor, CHECK_CONFIG } from "./checks";
import {
ARTIFACTS, ARTIFACT_SOURCES, CAVE_UPGRADE_BASE, CLASSIC_REALMS, COMMISSIONS, CRAFT_SKILLS, DAILY_COMMISSIONS, DAILY_EVENTS, DESTINIES, ENEMIES, EVENT_PACKS, EVENT_RELEASES, FORGE, LOCATION_DROPS, LOCATIONS,
MAINLINE_CHAPTERS, MAINLINE_TOTAL_SHARDS, NAME_POOL, NPCS, ORIGIN_POOL, REINCARNATION_POINTS, ROOTS,
SECT_RANKS, SEALED_EGGS, SHOP, SIGN_INS, TALENTS, TECHNIQUES, TIME_COSTS, TREASURES, TIMED_EVENTS,
type ArtifactDef, type EnemyDef, type LocationDef, type MainlineChapter, type NpcDef, type RealmDef,
type SectRankDef, type TalentDef, type TechDef, type TreasureDef,
} from "./content";

export {
  ARTIFACTS, ARTIFACT_SOURCES, CAVE_UPGRADE_BASE, CLASSIC_REALMS, COMMISSIONS, CRAFT_SKILLS, DAILY_COMMISSIONS, DAILY_EVENTS, DESTINIES, ENEMIES, EVENT_PACKS, EVENT_RELEASES, FORGE, LOCATION_DROPS, LOCATIONS,
  MAINLINE_CHAPTERS, MAINLINE_TOTAL_SHARDS, NAME_POOL, NPCS, ORIGIN_POOL, REINCARNATION_POINTS, ROOTS,
  SECT_RANKS, SEALED_EGGS, SHOP, SIGN_INS, TALENTS, TECHNIQUES, TIME_COSTS, TREASURES, TIMED_EVENTS,
};
export type { ArtifactSourcesDef, ArtifactDropEntryDef, ArtifactSectGrantDef, ArtifactCommissionGrantDef } from "./content";
export { commissionGrantFor, sectGrantForRank } from "./content";
export type { ForgeDef, ForgeTierDef } from "./content";
export type { CommissionsDef, CommissionDef, CommissionObjectiveKind, DailyEventsDef } from "./content";
export type { TimedEventsDef, TimedEventDef, TimedRepDelta, TimedRepStages } from "./content";
export type { DailyCommissionsDef, DailyCommissionDef, DailySource } from "./content";
export type { SignInsDef, SignInSpotDef, SignInReward, SignInTier, SignInTierDef } from "./content";
export type { SealedEggsDef, SealedEggDef } from "./content";
export type { EventPacksDef, EventPackDef } from "./content";
export type { EventReleasesDef, EventReleaseBatchDef } from "./content";
export type { LocationDropsDef, LocationDropDef, DropTier, DropTierDef } from "./content";
export { CURRENT_EVENT_VERSION, birthBoonById, commissionById, craftLevelDefFor, craftNextLevelDef, craftProficiencyFor, craftYieldPctFor, dailyCommissionById, dropTierDef, eventPackOf, eventReleaseVersion, eventReleasedForDeck, eventUnlockedForLife, forgeCandidatesFor, forgeTierByTier, locationDropAt, reincarnationPointsForGrade, reincarnationPointsForShards, sealedEggAtLocation, signInByLocation, signInTierDef, techniqueDropTier, timeCostMonths, timedEventById, travelMonthsTo } from "./content";
export { CRAFT_KINDS } from "./content";
export type { CraftKind, CraftSkillsDef, CraftLevelDef, CraftBreakthroughDef, CraftKindDef } from "./content";
export type { TimeCostsDef, TimeCostKey } from "./content";
export type { ReincarnationPointsDef } from "./content";
export type {
  EnemyDef, LocationDef, MainlineChapter, NpcDef, RealmDef, SectRankDef,
  TalentDef, TechDef, TreasureDef,
};
export type { ArtifactDef, ArtifactFx, DestinyDef, RelKind, RootDef, ShopDef, ShopItemDef } from "./content";
export { destinyById } from "./checks";

// ---------- shared game data ----------

export const STAGES = ["初期", "中期", "后期", "大圆满"] as const;

// 精简五境（Q4 备选体系）：经典九境的前五境，派生自配置，不另存一份。
export const SHORT_REALMS: RealmDef[] = CLASSIC_REALMS.slice(0, 5);

export function talentById(id: string): TalentDef | undefined { return TALENTS.find((t) => t.id === id); }
export function artifactById(id: string | null | undefined): ArtifactDef | undefined { return id ? ARTIFACTS.find((a) => a.id === id) : undefined; }
export function techById(id: string | null | undefined): TechDef | undefined { return TECHNIQUES.find((t) => t.id === id); }
export function treasureById(id: string | null | undefined): TreasureDef | undefined { return TREASURES.find((t) => t.id === id); }
export function locById(id: string): LocationDef | undefined { return LOCATIONS.find((l) => l.id === id); }
export function sectRankById(id: string | null | undefined): SectRankDef | undefined { return SECT_RANKS.find((r) => r.id === id); }
export function enemyById(id: string): EnemyDef | undefined { return ENEMIES.find((e) => e.id === id); }
export function npcById(id: string): NpcDef | undefined { return NPCS.find((n) => n.id === id); }

// 承世玉：跨世叠加的挂饰，每层给修炼类检定 +2 状态加成（参考《百世成仙》）。
export const JADE_PER_LAYER = CHECK_CONFIG.extraPointsPerLevel.jadeLayer;

// Q15 斗法难度：70 + 敌手境界×18 + 敌手战力（公式在 checks.ts 的
// combatDcFor，此处只是按敌手查表的便捷封装）。
export function combatDc(e: EnemyDef): number { return combatDcFor(e.tier, e.might); }

// Q17 灵石经济：丹药基准价 × (1 + 境界序号 × 0.6)，境界越高物价越贵；
// 洞府升级同理（基准价表在 content/mainline.json 的 caveUpgradeBase）。
export function shopPrice(base: number, realmIdx: number): number { return Math.round(base * (1 + realmIdx * 0.6)); }
export function caveUpgradeCost(level: number, realmIdx: number): number {
  const base = CAVE_UPGRADE_BASE[level];
  return base === undefined ? 0 : shopPrice(base, realmIdx);
}

// ---------- 工具 ----------

// 注意（U-573 种子化随机）：以下三个是旧的非种子工具，服务端判定与抽选
// 已全部改走 rng.ts 的 SeededRng 局部实例（state.rngForNext），不再调用
// 它们；保留仅为兼容旧引用，新代码不要再用。
export const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
export function pick<T>(arr: readonly T[]): T { const v = arr[rnd(0, arr.length - 1)]; if (v === undefined) throw new Error("empty pool"); return v; }
export function shuffle<T>(arr: T[]): T[] { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = rnd(0, i); const t = a[i]; a[i] = a[j] as T; a[j] = t as T; } return a; }
