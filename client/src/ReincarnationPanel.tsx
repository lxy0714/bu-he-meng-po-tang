// 轮回结算面板：评级、传承点赎回、下一世降生抽选。

import { useEffect, useRef, useState } from "react";
import type { Character, DrawField, PointsAttr, State } from "./types";
import { KEEPSAKE_ARTIFACTS, LOCATIONS, TREASURE_OPTIONS, tribulationImg } from "./display-data";
import { Seal, ageTextOf } from "./widgets";
import { BirthDrawPanel } from "./BirthDrawPanel";
import { PointsAllocator } from "./PointsAllocator";

// ---------- reincarnation settlement ----------

// 与服务端 buildReincarnation 的判定优先级保持一致：Q3 极端规则 >
// Q7 显式改选的按境界判定 > Q12 定稿公式。
export function memoryPreview(c: Character, q3: string, q7: string): string {
  const cause = c.deathCause ?? "";
  if (q3 === "artifact_only") return "按「只留法宝」之规（游戏规则 Q3）：记忆必封印，只剩本命法宝认得你";
  if (q3 === "memory_only") return "按「只留记忆」之规（游戏规则 Q3）：记忆必定保留，修为清零重来";
  if (cause.includes("走火入魔")) return "死于走火入魔，魂飞魄散——记忆全失（保留率 0%），本命法宝碎裂";
  // U-617：镇魂类法宝（镇魂塔）——持有且未封存（陨落时境界已达
  // 门槛）时保留率加配置百分点，与服务端结算同口径。
  const artPct = !c.artifactSealed ? (c.artifactMemoryPct ?? 0) : 0;
  if (q7 === "by_realm") {
    if (cause.includes("寿元") || cause.includes("坐化")) return "按 Q7「按境界判定」：坐化全留——记忆必定保留";
    if (c.realmIdx >= 3) return "按 Q7「按境界判定」：元婴以上全留——记忆必定保留";
    if (c.realmIdx >= 1) return `按 Q7「按境界判定」：筑基/金丹留七成——保留率 ${Math.min(100, 70 + artPct)}%${artPct ? `（含「${c.artifactName}」镇魂 +${artPct}%）` : ""}`;
    return `按 Q7「按境界判定」：炼气留四成——保留率 ${Math.min(100, 40 + artPct)}%${artPct ? `（含「${c.artifactName}」镇魂 +${artPct}%）` : ""}`;
  }
  const realmBonus = c.realmIdx * 5;
  const talentBonus = c.talentIds.includes("t_memory") ? 10 : 0;
  const pct = (base: number) => Math.min(50, base + realmBonus + talentBonus + artPct);
  const tail = `（Q12：基础 + 境界加成 ${realmBonus}%${talentBonus ? " + 宿慧深种 10%" : ""}${artPct ? ` + 「${c.artifactName}」镇魂 ${artPct}%` : ""}，封顶 50%）`;
  if (cause.includes("寿元") || cause.includes("坐化")) return `寿终坐化——保留率 ${pct(30)}%${tail}`;
  if (cause.includes("陨落")) return `战死陨落——保留率 ${pct(10)}%${tail}`;
  return `横死——保留率 ${pct(0)}%${tail}`;
}

export function ReincarnationPanel({ state, busy, prepareFailed, onPrepare, onAllocatePoints, onResetDraw, onBuyBoon, onKeepsake, onConfirm, onDraw, drawing, onChoice, onTalents }: {
  state: State;
  busy: boolean;
  prepareFailed: boolean;
  onPrepare: () => void;
  onAllocatePoints: (attr: PointsAttr, delta: number) => void;
  onResetDraw: () => void;
  onBuyBoon: (boonId: string) => void;
  onKeepsake: (kind: "artifact" | "technique" | "treasure", id: string, locationId?: string) => void;
  onConfirm: (name: string) => void;
  onDraw: () => void;
  drawing: boolean;
  onChoice: (field: DrawField, random: boolean, value?: string) => void;
  onTalents: (ids: string[]) => void;
}) {
  const c = state.character;
  const re = state.reincarnation;
  const draw = state.birthDraw;
  const [burialTarget, setBurialTarget] = useState<string | null>(null);
  const [nextName, setNextName] = useState("");
  // 自动结算防重复守卫（修 React #185 更新深度超限）：onPrepare 由上层
  // 每次渲染新建，直接进 effect 依赖会让「已死且未结算」期间每次渲染都
  // 重发一次 prepare，mutation 状态变化又触发渲染，形成更新循环。这里
  // 回调只经 ref 持有最新值，effect 只依赖事实本身；同一世只自动发
  // 一次（按 lifeNo 记守卫），prepare 失败后放开守卫，改由下方
  // 「打开轮回结算」按钮手动重试（按钮直调 onPrepare，不经守卫）。
  const prepareRef = useRef(onPrepare);
  prepareRef.current = onPrepare;
  const autoFiredFor = useRef<number | null>(null);
  const deadNoSettlement = !!c?.dead && !re;
  const lifeNo = c?.lifeNo;
  useEffect(() => {
    if (prepareFailed) { autoFiredFor.current = null; return; }
    if (!deadNoSettlement || busy || lifeNo === undefined) return;
    if (autoFiredFor.current === lifeNo) return;
    autoFiredFor.current = lifeNo;
    prepareRef.current();
  }, [deadNoSettlement, lifeNo, prepareFailed, busy]);
  if (!c) return null;
  const q2Lock = state.settings.q2.value;
  const lockedRoot = q2Lock === "waste_root" ? "waste" : q2Lock === "reborn" ? "heaven" : null;
  const realmText = `${state.realmNames[c.realmIdx] ?? "炼气"}·${state.stageNames[c.stageIdx] ?? "初期"}`;
  const inheritPreview = Math.floor(c.totalCultivation * (state.settings.q3.value === "generous" ? 0.3 : state.settings.q3.value === "recommended" ? 0.1 : 0));
  const budget = re ? c.legacyPoints + re.legacyEarned : c.legacyPoints;
  const keptCost = re?.keptCost ?? 0;

  return (
    <section aria-label="轮回结算" className="fade-slide-in overflow-hidden rounded-[var(--radius)] border-2 border-[var(--gold)] bg-[var(--surface)]">
      <div className="relative">
        <img src={tribulationImg} alt="雷云压顶的陨落之景" className="h-36 w-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 pt-8">
          <p className="font-brush text-xl font-black text-white">第{c.lifeNo}世 · 陨落</p>
          <p className="text-sm text-white/90">{c.deathCause}。享年 {ageTextOf(c)}，止步 {realmText}。</p>
        </div>
      </div>

      {!re ? (
        <div className="p-4 text-center">
          <p className="text-sm text-[var(--dim)]">正在结算这一世的因果…</p>
          <button type="button" disabled={busy} onClick={onPrepare} className="mt-3 rounded-full bg-[var(--gold)] px-5 py-2.5 font-brush text-base font-black text-[var(--on-bright)] disabled:opacity-40"><Seal ch="轮" /> 打开轮回结算</button>
        </div>
      ) : (
        <div className="space-y-4 p-4">
          {/* 评级与传承点 */}
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-xl bg-[var(--surface2)] p-2.5"><p className="font-brush text-lg font-black text-[var(--seal)]">{re.grade} 级</p><p className="text-xs text-[var(--dim)]">本世评级</p></div>
            <div className="rounded-xl bg-[var(--surface2)] p-2.5"><p className="font-brush text-lg font-black">+{re.legacyEarned}</p><p className="text-xs text-[var(--dim)]">传承点（余 {budget - keptCost}）</p></div>
            <div className="rounded-xl bg-[var(--surface2)] p-2.5"><p className="font-brush text-lg font-black">{inheritPreview}</p><p className="text-xs text-[var(--dim)]">继承修为{state.settings.q3.value === "generous" ? "（留三成）" : state.settings.q3.value === "recommended" ? "（留一成）" : "（不留）"}</p></div>
          </div>
          <p className="rounded-xl bg-[var(--gold-soft)] p-3 text-sm">记忆判定：{re.memoryNote}</p>
          <p className="rounded-xl bg-[var(--accent-soft)] p-3 text-sm">轮回点：本世结算按 {re.grade} 级档位发放 <b>+{re.pointsEarned}</b>，当前余 <b>{state.reincarnationPoints}</b> 点——在下方「轮回点 · 开局分配」里给下一世加初始属性、重置天赋与灵根，或购入「再战天道」强化项，与传承点不混用。</p>
          {re.shardPointsEarned > 0 && (
            <p className="rounded-xl bg-[var(--accent-soft)] p-3 text-sm">主线轮回点：本世新集记忆碎片 <b>{re.shardsThisLife}</b> 枚（前世之谜），按碎片档另发放 <b>+{re.shardPointsEarned}</b>，已与评级发放同池入账（上方余额已含）。</p>
          )}
          {re.artifactShattered && (
            <p className="rounded-xl border-2 border-[var(--red)] bg-[var(--surface)] p-3 text-sm font-bold text-[var(--red)]">走火入魔 · 魂飞魄散：本命法宝已碎裂——下方「本命法宝」类不可赎回；功法与遗藏不受影响。</p>
          )}

          {/* 传承点赎回：法宝 / 功法 / 遗藏 */}
          <fieldset>
            <legend className="text-sm font-bold">用传承点赎回保留（法宝、功法各限一件，遗藏不限；点数不够就得取舍）</legend>
            <div className="mt-2 space-y-3">
              {(["artifact", "technique", "treasure"] as const).map((kind) => {
                const cands = re.keepsakeCandidates.filter((k) => k.kind === kind);
                // U-618：本命法宝候选只含本世实际持有的那一件；本世一
                // 件法宝都没有时，本命法宝挑选区整个不显示。
                if (kind === "artifact" && cands.length === 0) return null;
                const lockedCand = kind === "artifact" ? cands.find((k) => k.locked) : undefined;
                return (
                <div key={kind}>
                  <p className="mb-1.5 text-xs font-bold text-[var(--dim)]">{kind === "artifact" ? "本命法宝（本世所得）" : kind === "technique" ? "功法" : "前世遗藏（选地点埋下，后世探索取回）"}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {cands.map((k) => {
                      const kept = re.keepsakes.some((x) => x.kind === k.kind && x.id === k.id);
                      const keptLoc = re.keepsakes.find((x) => x.kind === k.kind && x.id === k.id)?.locationId;
                      const shatteredBlocked = kind === "artifact" && re.artifactShattered;
                      const lockedBlocked = !!k.locked;
                      const afford = kept || keptCost + k.cost <= budget;
                      return (
                        <button key={k.id} type="button" disabled={busy || !afford || shatteredBlocked || lockedBlocked}
                          aria-pressed={kept}
                          aria-label={lockedBlocked ? `${k.name}不可选：${k.lockReason ?? "境界未达使用门槛"}` : `${kept ? "取消保留" : "保留"}${k.name}，需传承点 ${k.cost}`}
                          onClick={() => {
                            if (kind === "treasure" && !kept) { setBurialTarget(burialTarget === k.id ? null : k.id); return; }
                            onKeepsake(kind, k.id);
                          }}
                          className={`rounded-xl border-2 p-2.5 text-center disabled:opacity-40 ${kept ? "border-[var(--gold)] bg-[var(--gold-soft)]" : "border-[var(--border)]"}`}>
                          <span className="glyph-tile text-2xl" aria-hidden>{kind === "artifact" ? (KEEPSAKE_ARTIFACTS.find((a) => a.id === k.id)?.icon ?? "剑") : kind === "technique" ? "法" : (TREASURE_OPTIONS.find((t) => t.id === k.id)?.icon ?? "匣")}</span>
                          <span className="mt-1 block font-song text-sm font-bold">{k.name}</span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-[var(--dim)]">{k.desc}</span>
                          <span className="mt-1 block text-[11px] font-bold text-[var(--gold)]">{shatteredBlocked ? "已碎裂" : lockedBlocked ? `需${k.minRealmName ?? ""}境认主 · 本世未达` : kept ? `✓ 已保留${keptLoc ? ` · 埋于${LOCATIONS.find((l) => l.id === keptLoc)?.name ?? ""}` : ""}` : `传承点 ${k.cost}${kind === "artifact" && k.minRealmName ? ` · 需${k.minRealmName}境` : ""}`}</span>
                        </button>
                      );
                    })}
                  </div>
                  {lockedCand?.lockReason && (
                    <p className="mt-1.5 text-[11px] leading-snug font-bold text-[var(--red)]">{lockedCand.lockReason}。</p>
                  )}
                  {kind === "treasure" && burialTarget && re.keepsakeCandidates.some((k) => k.kind === "treasure" && k.id === burialTarget && !re.keepsakes.some((x) => x.id === k.id)) && (
                    <div className="mt-2 rounded-xl bg-[var(--surface2)] p-2.5">
                      <p className="text-xs font-bold">把「{re.keepsakeCandidates.find((k) => k.id === burialTarget)?.name}」埋在哪里？后世到该地探索必定取回。</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {LOCATIONS.map((l) => (
                          <button key={l.id} type="button" disabled={busy} onClick={() => { onKeepsake("treasure", burialTarget, l.id); setBurialTarget(null); }}
                            className="rounded-full bg-[var(--surface)] px-3 py-1.5 text-xs font-medium disabled:opacity-40">{l.name}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </fieldset>

          {/* 下一世降生抽选（Q13：各自独立随机/自选；姓名在下方自填或随机） */}
          <fieldset>
            <legend className="text-sm font-bold">下一世降生抽选 · 出身/命格/灵根/天赋各自独立（已有天赋 {c.talentNames.length}/3，新天赋将替换最旧的）</legend>
            <div className="mt-2">
              {draw ? (
                <BirthDrawPanel state={state} draw={draw} busy={busy || drawing} rootLockedId={lockedRoot}
                  onChoice={onChoice} onTalents={onTalents} onRedraw={onDraw} />
              ) : (
                <button type="button" disabled={drawing} onClick={onDraw} className="w-full rounded-xl bg-[var(--gold)] py-3 font-brush text-base font-black text-[var(--on-bright)] disabled:opacity-40">
                  {drawing ? "抽取中…" : "抽取下一世的命盘"}
                </button>
              )}
            </div>
          </fieldset>

          {/* U-002 轮回点开局分配：提升下一世初始属性 / 重置天赋与灵根候选 */}
          <PointsAllocator state={state} busy={busy || drawing} rootLocked={lockedRoot !== null}
            onAllocate={onAllocatePoints} onResetDraw={onResetDraw} onBuyBoon={onBuyBoon} />

          <div>
            <label htmlFor="next-life-name" className="text-sm font-bold">下一世姓名</label>
            <div className="mt-1.5 flex gap-2">
              <input id="next-life-name" value={nextName} onChange={(e) => setNextName(e.target.value)} maxLength={12}
                placeholder="给下一世起个名字" className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-base outline-none focus:border-[var(--accent)]" />
              <button type="button" disabled={busy} aria-label="随机掷一个姓名填入"
                onClick={() => setNextName(state.pools.names[Math.floor(Math.random() * state.pools.names.length)] ?? "")}
                className="shrink-0 rounded-lg bg-[var(--surface2)] px-4 py-2.5 text-sm font-bold disabled:opacity-40">随机</button>
            </div>
            <p className="mt-1.5 text-xs text-[var(--dim)]">自己填，或点随机从姓名池里掷一个；留空的话，降生时也会随机掷定。</p>
          </div>

          <button type="button" disabled={busy} onClick={() => onConfirm(nextName.trim())}
            className="w-full rounded-[var(--radius)] bg-[var(--ink)] py-3.5 font-brush text-lg font-black text-[var(--on-ink)] disabled:opacity-40">
            <Seal ch="轮" /> 确认结算 · 开启第{c.lifeNo + 1}世
          </button>
          <p className="text-center text-xs text-[var(--dim)]">未赎回的法宝、功法将留在这一世；未取回的遗藏仍在原地等后世。</p>
        </div>
      )}
    </section>
  );
}
