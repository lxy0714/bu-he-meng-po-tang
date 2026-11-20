// 轮回修仙跑团 — 轮回结算与降生抽选：Q12 记忆保留判定、前尘残片生成、
// 降生抽选（Q11/Q13）、命格生效、轮回结算候选池构建。
// 从 actions.ts 原样拆分，记忆保留公式未动。

import {
ARTIFACTS, CLASSIC_REALMS, TECHNIQUES, TECHNIQUE_MASTERY, TREASURES, TALENTS, ORIGIN_POOL, DESTINIES, ROOTS,
destinyById, imprintValuesFor, reincarnationPointsForGrade, reincarnationPointsForShards, techLayerBreakdown, techLayerText, type TalentDef,
} from "./data";
import { codexImprintOf, imprintTextFor, lifeGrade, pushLog, realmText, realmsFor, rngForNext, techProgressOf, type BirthChoice, type BirthDraw, type Character, type FreeTechniqueCandidate, type GameState, type MemoryFragment, type PendingKeepsake, type Reincarnation } from "./state";
import { randomSet, uniformTable, weighted, type SeededRng } from "./rng";
import { MEMORY_CHECK, memoryChanceFor, realmMemoryChanceFor } from "./checks";

// Q12（第三轮按推荐定稿）：记忆保留再收紧——坐化 30% / 战死 10% / 横死 0%，
// 境界每高一境（境界序号）多留半成（+5%），上限 50%。死于走火入魔 =
// 魂飞魄散：保留率 0%，且本命法宝碎裂（在 reincarnate 里处理）。
// 「宿慧深种」天赋额外 +10%（仍受 50% 上限约束）。
// U-573：保留判定改由调用方传入的种子化实例掷出，保留率公式不变。
export function memoryOutcome(c: Character, rng: SeededRng): { kept: boolean; chance: number; note: string } {
  const cause = c.deathCause ?? "";
  if (cause.includes("走火入魔")) return { kept: false, chance: 0, note: "死于走火入魔，魂飞魄散——记忆全失，本命法宝亦随之碎裂，只余零星梦境。" };
  // U-563：基础保留率、境界加成（每境 +5%）、宿慧深种 +10% 与 50% 上限
  // 出自检定配置表（checks.ts 的 MEMORY_CHECK / memoryChanceFor），数值
  // 与文案逐字不变；判定仍由传入的种子化实例掷出，随机流不变。
  const m = memoryChanceFor(cause, c.realmIdx, c.talentIds);
  // U-617：镇魂类法宝（镇魂塔）——本世持有且陨落时境界已达该宝
  // 门槛的，保留率按配置加百分点（仍受 Q12 的 50% 上限约束）；
  // 走火入魔已在上方拦截（魂飞魄散、法宝碎裂，不适用）。无此
  // fx 时保留率与文案逐字不变。
  const memDef = c.artifactId ? (ARTIFACTS.find((a) => a.id === c.artifactId) ?? null) : null;
  const memPct = memDef?.fx?.memoryPct && c.realmIdx >= memDef.minRealm ? memDef.fx.memoryPct : 0;
  const chance = Math.min(MEMORY_CHECK.cap, m.chance + memPct / 100);
  // Q34：记忆保留走 d100 掷点（范围 0–100 的百分比口径）——掷
  // 1~100，≤ 保留率×100 即保留；概率与 Q12 百分比口径一致，文案
  // 写明掷点（U-571 记号：记忆 d100）。
  const roll100 = rng.int(1, 100);
  const kept = roll100 <= Math.round(chance * 100);
  const pct = Math.round(chance * 100);
  const parts = `${m.baseLabel}基础 ${Math.round(m.base * 100)}% + 境界加成 ${Math.round(m.realmBonus * 100)}%${m.talentBonus > 0 ? " + 宿慧深种 10%" : ""}${memPct ? ` + 「${memDef?.name ?? ""}」镇魂 ${memPct}%` : ""}，封顶 50%`;
  return kept
    ? { kept, chance, note: `${parts}——保留率 ${pct}%，记忆 d100 掷出 ${roll100}（≤${pct}），这一掷过了：上一世记忆清晰留存；更早的世只剩前尘残片。` }
    : { kept, chance, note: `${parts}——保留率 ${pct}%，记忆 d100 掷出 ${roll100}（需 ≤${pct}），这一掷没过：上一世记忆也被封印，只余前尘残片可查。` };
}

// Q7 旧版「按境界判定」：设计树里显式改选此项时真的生效（覆盖 Q12 的
// 百分比公式）：坐化全留、元婴以上全留、筑基/金丹七成、炼气四成。
// 死于走火入魔仍是魂飞魄散（与 Q12 一致）。
export function realmMemoryOutcome(c: Character, rng: SeededRng): { kept: boolean; chance: number; note: string } {
  const cause = c.deathCause ?? "";
  if (cause.includes("走火入魔")) return { kept: false, chance: 0, note: "死于走火入魔，魂飞魄散——记忆全失，本命法宝亦随之碎裂，只余零星梦境。（Q7 按境界判定亦然）" };
  // U-563：分档保留率与境界门槛出自检定配置表（checks.ts 的
  // REALM_MEMORY_CHECK / realmMemoryChanceFor），数值逐字不变。
  const baseOutcome = realmMemoryChanceFor(cause, c.realmIdx);
  const rule = baseOutcome.rule;
  // U-617：镇魂类法宝同 Q12 口径加百分点（此口径上限为 100%）。
  const memDef = c.artifactId ? (ARTIFACTS.find((a) => a.id === c.artifactId) ?? null) : null;
  const memPct = memDef?.fx?.memoryPct && c.realmIdx >= memDef.minRealm ? memDef.fx.memoryPct : 0;
  const chance = Math.min(1, baseOutcome.chance + memPct / 100);
  const memNote = memPct ? `（「${memDef?.name ?? ""}」镇魂护忆 +${memPct}%）` : "";
  // Q34：同 Q12 路，记忆保留走 d100 掷点（≤ 保留率×100 即保留）。
  const roll100 = rng.int(1, 100);
  const kept = roll100 <= Math.round(chance * 100);
  return kept
    ? { kept, chance, note: `按设计树 Q7「按境界判定」：${rule}${memNote}——记忆 d100 掷出 ${roll100}，这一掷过了，上一世记忆清晰留存；更早的世只剩前尘残片。` }
    : { kept, chance, note: `按设计树 Q7「按境界判定」：${rule}${memNote}（保留率 ${Math.round(chance * 100)}%）——记忆 d100 掷出 ${roll100}，这一掷没过，上一世记忆被封印，只余前尘残片可查。` };
}

// ---------- 前尘残片（记忆分层：前几世只剩关键词记录） ----------

export function makeFragments(state: GameState, dead: Character, kept: boolean): MemoryFragment[] {
  const s = state.settings;
  const frags: MemoryFragment[] = [];
  const realm = realmText(dead, s);
  frags.push({ id: 0, lifeNo: dead.lifeNo, label: `止步${realm}`, detail: `第${dead.lifeNo}世 ${dead.name}（${dead.origin}），修至${realm}，享年${dead.age}岁。` });
  frags.push({ id: 0, lifeNo: dead.lifeNo, label: `死因：${dead.deathCause ?? "陨落"}`, detail: `第${dead.lifeNo}世之死：${dead.deathCause ?? "陨落"}。${kept ? "上一世记忆清晰，此条之外尚有完整记忆。" : "记忆已封印，只余此等残片。"}` });
  if (dead.artifactName) frags.push({ id: 0, lifeNo: dead.lifeNo, label: `本命法宝「${dead.artifactName}」`, detail: `第${dead.lifeNo}世的本命法宝是「${dead.artifactName}」，曾随其征战。` });
  if (dead.totalCultivation > 0) frags.push({ id: 0, lifeNo: dead.lifeNo, label: `累计修为 ${dead.totalCultivation}`, detail: `第${dead.lifeNo}世一生累计修为 ${dead.totalCultivation} 点，轮回时按规打折继承。` });
  if (dead.karma !== 0) frags.push({ id: 0, lifeNo: dead.lifeNo, label: `业力 ${dead.karma > 0 ? "+" : ""}${dead.karma}`, detail: `第${dead.lifeNo}世结下的业力 ${dead.karma}，善恶皆随轮回延续。` });
  for (const f of frags) { state.logSeq += 1; f.id = state.logSeq; }
  return frags;
}

// ---------- 轮回结算候选池 ----------

// ---------- 降生抽选（Q11/Q13：每项独立抽 3 个候选，可随机可自选） ----------

// U-573：抽选全程用同一个种子化实例（一次降生抽选 = 一次操作，
// 同一实例内顺序抽出身/命格/灵根/天赋候选），抽法与候选数不变。
// U-576：三选一统一走不放回抽取 randomSet(3, 池)——内部仍是全洗牌取
// 前 3，同种子同结果与旧 shuffle+slice 逐字一致，候选互不重复由
// randomSet 的模型保证（池不足 3 时抛错，不静默兜底；现有四池均 ≥10）。
export function drawThree<T>(pool: readonly T[], rng: SeededRng): T[] { return randomSet(rng, 3, pool); }
export function makeBirthDraw(rng: SeededRng, excludeTalentIds: string[] = []): BirthDraw {
  const originPool = drawThree(ORIGIN_POOL, rng);
  const destinyPool = drawThree(DESTINIES, rng).map((d) => d.id);
  const rootPool = drawThree(ROOTS, rng).map((r) => r.id);
  const talentPool = TALENTS.filter((t) => !excludeTalentIds.includes(t.id));
  return {
    origin: { pool: originPool, value: originPool[0] ?? "", random: true },
    destiny: { pool: destinyPool, value: destinyPool[0] ?? "", random: true },
    root: { pool: rootPool, value: rootPool[0] ?? "", random: true },
    talentChoices: randomSet(rng, 3, talentPool),
    chosenTalents: [],
  };
}
// 结算一项抽选：展示即结果——value 就是面板上展示的当前值（自选
// 值，或点「随机」时已当场掷定的值，见 setBirthChoice），降生按
// 它落定，不在创建时另掷一次（2026-11-18 自测修复：此前 random
// 在创建时重掷，面板/状态里摆着的具体值与最终落到角色身上的结
// 果对不上）。value 不在候选池里（旧存档异常）时才回退：自选按
// value、随机按池内掷定。
// U-575：回退掷定同走权重表抽取，候选无权重字段按 commonality: 1 等权。
export function resolveChoice(choice: BirthChoice, rng: SeededRng): string {
  if (choice.value && choice.pool.includes(choice.value)) return choice.value;
  if (!choice.random && choice.value) return choice.value;
  return weighted(rng, uniformTable(choice.pool.length > 0 ? choice.pool : [choice.value]));
}
export function applyDestiny(c: Character, destinyId: string) {
  const d = destinyById(destinyId);
  if (!d) { c.destinyId = ""; return; }
  c.destinyId = d.id;
  c.might = Math.max(1, c.might + (d.might ?? 0));
  c.sense = Math.max(1, c.sense + (d.sense ?? 0));
  c.fortune = Math.max(1, c.fortune + (d.fortune ?? 0));
  c.body = Math.max(1, c.body + (d.body ?? 0));
  if (d.lifespanPct) c.lifespan = Math.max(30, Math.floor(c.lifespan * (1 + d.lifespanPct / 100)));
  if (d.stones) c.stones = Math.max(0, c.stones + d.stones);
  if (d.karma) c.karma += d.karma;
}

// 轮回结算的评级天赋池（三选一保留）：按本世评级定三档品阶，从各档
// 池里等权抽一（排除上一世已带天赋），去重。buildReincarnation 与
// U-002 轮回点「重置天赋」共用同一口径，抽法与概率不变。
export function rollRatedTalents(rng: SeededRng, grade: string, excludeTalentIds: string[]): TalentDef[] {
  const tierPool: TalentDef["tier"][] = grade === "S" ? ["gold", "purple", "blue"] : grade === "A" ? ["purple", "purple", "blue"] : grade === "B" ? ["purple", "blue", "blue"] : ["blue", "blue", "blue"];
  return tierPool.map((tier) => {
    const pool = TALENTS.filter((t) => t.tier === tier && !excludeTalentIds.includes(t.id));
    // U-575：三选一保留的天赋候选同走权重表抽取（等权，概率不变）。
    return weighted(rng, uniformTable(pool.length > 0 ? pool : TALENTS));
  }).filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i);
}

// ---------- U-614 精通印记衰减（连续自适应版） ----------
// 每次轮回结算生成时统一结算印记（本函数只在 buildReincarnation
// 里调一次——结算对象生成后即复用、不会重复生成，故每世恰好结
// 算一次；且在免费带走候选生成之前，候选待遇取结算后的 t）：
// - 本世精通了该功法：t 回满 100（印记变深/回满）；
// - 曾精通但本世未精通：t 减少 (100 − p) / 衰减除数（配置表
//   imprintDecayDivisor = 2）。U-626：p 改为该功法本世进度占比
//   ×100（已攒总点数 / 总点数 ×100，本世没学这门时 p = 0，一世
//   全放掉 50；与 U-614 的 0–100 熟练度口径等比例）；练得越接
//   近精通、淡得越少——自适应所在。t 不低于 0（下限即涨幅 +下
//   限%、永不遗忘，「学会过」记录与曾精通标记都不动）；
// - 未精通过的条目不带印记、不参与结算。
// t 实际变化时各记一条编年史，写明变深/变淡与当前换算待遇。
// 占比展示文本：整数原样、小数保留一位（总点数 120/160/200 下
// 占比可为 x.5 等半数），避免日志出现浮点长尾。
function ratioPctText(p: number): string {
  return Number.isInteger(p) ? String(p) : p.toFixed(1);
}
export function settleMasteryImprints(state: GameState, dead: Character): void {
  if (!state.knowledgeCodex) state.knowledgeCodex = {};
  const divisor = TECHNIQUE_MASTERY.imprintDecayDivisor;
  for (const tech of TECHNIQUES) {
    const entry = state.knowledgeCodex[tech.id];
    const progress = techProgressOf(dead, tech.id);
    if (progress.mastered) {
      if (!entry) {
        // 兜底：本世精通当刻本应已同步图鉴（gainTechniqueProficiency），
        // 极旧存档缺条目时在此补建为满印记。
        state.knowledgeCodex[tech.id] = { mastered: true, imprint: 100 };
        continue;
      }
      const before = codexImprintOf(entry);
      entry.mastered = true;
      entry.imprint = 100;
      if (before < 100) {
        const v = imprintValuesFor(100, tech);
        pushLog(state, dead.lifeNo, "technique", `📖 知识图鉴：「${tech.name}」这一世再度臻至精通，精通印记变深、重回完满（强度 ${imprintTextFor(before)} → 100）——后世重学自${techLayerText(tech, v.startPoints)}起步、增长 +${v.gainBonusPct}%。`);
      }
      continue;
    }
    if (!entry?.mastered) continue;
    const before = codexImprintOf(entry);
    // U-626：p = 本世进度占比 ×100（层数口径：已攒总点数 / 总点
    // 数）；无限层功法 ratio 恒 0（防护值，且其永不精通、不会有
    // 曾精通条目走到这里）。
    const p = techLayerBreakdown(tech, progress.points).ratio * 100;
    const decay = (100 - p) / divisor;
    const after = Math.max(0, before - decay);
    entry.imprint = after;
    if (after !== before) {
      const v = imprintValuesFor(after, tech);
      const layerNote = progress.points > 0 ? `练到${techLayerText(tech, progress.points)}（总进度 ${ratioPctText(p)}%）` : "整世未曾修习（总进度 0%）";
      pushLog(state, dead.lifeNo, "technique", after <= 0
        ? `📖 知识图鉴：「${tech.name}」这一世只${layerNote}，精通印记变淡到底（强度 ${imprintTextFor(before)} → 0）——只余下限微光：后世重学自${techLayerText(tech, v.startPoints)}起步、增长 +${v.gainBonusPct}%；印记到此为止、再过几世也不会消失。`
        : `📖 知识图鉴：「${tech.name}」这一世${layerNote}、未至精通，精通印记变淡（强度 ${imprintTextFor(before)} → ${imprintTextFor(after)}）——后世重学自${techLayerText(tech, v.startPoints)}起步、增长 +${v.gainBonusPct}%；哪一世再将它练至精通，印记即回满。`);
    }
  }
}

// U-614：免费带走候选快照——印记结算之后按图鉴当前 t 生成：图
// 鉴里曾精通的功法全列（本世刚精通的在精通当刻已入图鉴、天然
// 在内），每门带结算后的 t 与按 t 换算的带走待遇。图鉴无曾精
// 通时为空。
export function freeTechniqueCandidatesOf(state: GameState): FreeTechniqueCandidate[] {
  const codex = state.knowledgeCodex ?? {};
  return TECHNIQUES
    .filter((t) => !!codex[t.id]?.mastered)
    .map((t) => {
      const imprint = codexImprintOf(codex[t.id]);
      return { id: t.id, name: t.name, desc: t.desc, imprint, ...imprintValuesFor(imprint, t) };
    });
}

export function buildReincarnation(state: GameState, dead: Character): Reincarnation {
  // U-614：结算生成第一步先结算精通印记（本世精通回满、其余按
  // 本世最终熟练度衰减），随后再按结算后的图鉴生成免费带走候
  // 选——候选待遇即衰减后的 t 换算待遇。
  settleMasteryImprints(state, dead);
  const freeTechniqueCandidates = freeTechniqueCandidatesOf(state);
  const grade = lifeGrade(dead);
  let legacyEarned = dead.realmIdx * 2 + dead.stageIdx + (grade === "S" ? 4 : grade === "A" ? 3 : grade === "B" ? 2 : 1);
  // U-002：轮回点在每次轮回结算时按本世评级档位发放（档位出自数值
  // 配置表），入跨世点数池；与传承点分池记账、互不换算。
  let pointsEarned = reincarnationPointsForGrade(grade);
  state.reincarnationPoints += pointsEarned;
  // U-322：完成每世主线得轮回点——按本世新收集的记忆碎片数（主线
  // 「前世之谜」）分档发放（档位出自同一配置表 shardTiers），与评级
  // 发放同入一个池。本世新集 = 当前累计 − 本世开始基线；结算后把
  // 基线推进到当前累计，下一世从此处起算（reincarnate 里 memoryKept
  // 的 +2 碎片在本结算之后发放，计入下一世的新集数）。
  const shardsThisLife = Math.max(0, state.mainline.shards - (state.shardsAtLifeStart ?? 0));
  const shardPointsEarned = reincarnationPointsForShards(shardsThisLife);
  state.reincarnationPoints += shardPointsEarned;
  state.shardsAtLifeStart = state.mainline.shards;
  const keepsakeCandidates: PendingKeepsake[] = [];
  // U-618（Q40 挑选口径修复）：本命法宝候选只列本世实际持有的那一
  // 件——没获得过、没炼制过的法宝根本不进挑选列表；本世一件法宝
  // 都没有时，候选里没有任何法宝条目，客户端据此整段不显示本命
  // 法宝挑选区。持有但本世止步境界未达该宝门槛（配置表 minRealm）
  // 的，仍列出但标 locked 并注明原因、不可点选（服务端
  // selectKeepsake 同步拦截）。功法/遗藏候选口径不变。
  const heldArtifact = dead.artifactId ? (ARTIFACTS.find((a) => a.id === dead.artifactId) ?? null) : null;
  if (heldArtifact) {
    const realms = realmsFor(state.settings);
    const minRealmName = realms[heldArtifact.minRealm]?.name ?? CLASSIC_REALMS[heldArtifact.minRealm]?.name ?? "";
    const deadRealmName = realms[dead.realmIdx]?.name ?? "";
    const locked = dead.realmIdx < heldArtifact.minRealm;
    keepsakeCandidates.push({
      kind: "artifact", id: heldArtifact.id, name: heldArtifact.name, desc: heldArtifact.desc, cost: heldArtifact.legacyCost,
      minRealm: heldArtifact.minRealm, minRealmName,
      locked,
      lockReason: locked ? `本世止步${deadRealmName}境，未达此宝使用门槛（需${minRealmName}境）——境界未至，法宝不认主，不可赎回带走` : undefined,
    });
  }
  // U-617：轮回结算类法宝（六道轮回盘）——本世持有且陨落时境界已
  // 达门槛的，结算传承点/轮回点按配置额外加成；走火入魔魂飞魄散
  // 时法宝已碎裂，不加成。无此 fx 时发放逐字不变。
  if (heldArtifact?.fx && dead.realmIdx >= heldArtifact.minRealm && !(dead.deathCause ?? "").includes("走火入魔")) {
    if (heldArtifact.fx.legacyBonus) legacyEarned += heldArtifact.fx.legacyBonus;
    if (heldArtifact.fx.pointsBonus) { pointsEarned += heldArtifact.fx.pointsBonus; state.reincarnationPoints += heldArtifact.fx.pointsBonus; }
  }
  // 2026-11-18 自测修复：功法候选与法宝同一口径——只列本世实际
  // 学过的功法（功法槽 techniqueId，本世至多一门）；没学过的功
  // 法不再混进「保留」候选（此前按全功法池生成，玩家会疑惑没学
  // 过的功法为什么能保留）。本世未学功法时候选里没有任何功法
  // 条目，客户端据此整段不显示功法挑选区。selectKeepsake 服务端
  // 同步拦截未学功法的点选。遗藏候选口径不变（那是花传承点买
  // 下埋给后世，本就不是「保留本世所得」）。
  const learnedTech = dead.techniqueId ? (TECHNIQUES.find((t) => t.id === dead.techniqueId) ?? null) : null;
  if (learnedTech) keepsakeCandidates.push({ kind: "technique", id: learnedTech.id, name: learnedTech.name, desc: learnedTech.desc, cost: learnedTech.legacyCost, grade: learnedTech.grade });
  for (const t of TREASURES) keepsakeCandidates.push({ kind: "treasure", id: t.id, name: t.name, desc: t.desc, cost: t.legacyCost });
  // 下一世降生抽选（Q13）：出身只定出身；天赋另从评级池三选一保留。
  state.birthDraw = makeBirthDraw(rngForNext(state, "birth-draw"), dead.talentIds);
  state.birthDraw.talentChoices = rollRatedTalents(rngForNext(state, "birth-draw:talents"), grade, dead.talentIds);
  const shattered = (dead.deathCause ?? "").includes("走火入魔");
  // 记忆判定优先级：设计树 Q3 的两个极端规则 > Q7 显式改选的按境界判定 > Q12 定稿公式。
  const q3v = state.settings.q3.value;
  const outcome = q3v === "artifact_only"
    ? { kept: false, chance: 0, note: "按「只留法宝」之规（设计树 Q3），记忆封印，只剩本命法宝认得你。" }
    : q3v === "memory_only"
      ? { kept: true, chance: 1, note: "按「只留记忆」之规（设计树 Q3）：记忆完整保留，不掷判定；代价是修为清零，靠经验重头再来。" }
      : state.settings.q7.value === "by_realm"
        ? realmMemoryOutcome(dead, rngForNext(state, "memory:by-realm"))
        : memoryOutcome(dead, rngForNext(state, "memory:q12"));
  // 2026-11-18 自测修复：轮回点发放日志在此（结算生成当刻）记账
  // ——余额是发放后、开局分配消费之前的数，账目自洽。此前这两条
  // 记在 reincarnate（降生）时打印，余额已被结算期内的开局分配
  // 扣掉，单看像点数凭空消失。数值与发放口径一字不变。
  pushLog(state, dead.lifeNo, "birth", `🔄 轮回结算发放轮回点 +${pointsEarned}（按 ${grade} 级档位），轮回点余 ${state.reincarnationPoints}——只用于开局分配，与传承点不混用。`);
  if (shardPointsEarned > 0) pushLog(state, dead.lifeNo, "birth", `🧩 主线轮回点：本世新集记忆碎片 ${shardsThisLife} 枚（前世之谜），按碎片档发放轮回点 +${shardPointsEarned}，已与评级发放同池入账（余 ${state.reincarnationPoints}）。`);
  return {
    grade, legacyEarned, pointsEarned, shardPointsEarned, shardsThisLife, keepsakeCandidates, keepsakes: [],
    freeTechniqueCandidates, freeTechniqueId: null,
    chosenOrigin: null, memoryKept: outcome.kept, memoryNote: outcome.note,
    artifactShattered: shattered,
  };
}
