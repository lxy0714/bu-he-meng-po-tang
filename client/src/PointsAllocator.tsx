// 轮回点开局分配面板（U-002）：创建页与轮回结算页共用。
// 轮回点是跨世点数池：轮回结算时按本世评级发放（档位见 pointsConfig），
// 只在开局花——逐点提升下一世初始属性，或整段重置天赋与灵根候选。
// U-021 在同一面板、同一配置表下加一组「再战天道」强化项（气血/法力
// 上限、寿元、开局灵石），与上面的花费项不重叠，降生时一次性生效。
// 与传承点完全分开：传承点只赎回装备/功法，两者不互换。

import type { PointsAttr, State } from "./types";
import { Seal } from "./widgets";

const ATTRS: { key: PointsAttr; label: string; icon: string }[] = [
  { key: "might", label: "战力", icon: "战" },
  { key: "sense", label: "神识", icon: "识" },
  { key: "fortune", label: "机缘", icon: "缘" },
  { key: "body", label: "体魄", icon: "魄" },
];

export function PointsAllocator({ state, busy, rootLocked, onAllocate, onResetDraw, onBuyBoon }: {
  state: State;
  busy: boolean;
  rootLocked: boolean;
  onAllocate: (attr: PointsAttr, delta: number) => void;
  onResetDraw: () => void;
  onBuyBoon: (boonId: string) => void;
}) {
  const cfg = state.pointsConfig;
  const balance = state.reincarnationPoints;
  const boost = state.birthBoost ?? { might: 0, sense: 0, fortune: 0, body: 0 };
  const g = cfg.grantByGrade;
  const canReset = !busy && balance >= cfg.resetCost;
  return (
    <div className="rounded-[var(--radius)] bg-[var(--surface)] p-4">
      <div className="flex items-baseline gap-2">
        <p className="flex-1 font-brush text-base font-black"><Seal ch="轮" /> 轮回点 · 开局分配</p>
        <p className="font-brush text-lg font-black text-[var(--seal)]">{balance} 点</p>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-[var(--dim)]">
        每世轮回结算时按评级发放（S {g.S} · A {g.A} · B {g.B} · C {g.C}）；本世新集的记忆碎片（主线「前世之谜」）也按档发放（{cfg.shardTiers.map((t) => `集 ${t.min} 枚 +${t.points}`).join(" · ")}），两路同入一池。攒着开局花：提升下一世的初始属性，或重置天赋与灵根候选。
        传承点是另一回事——只用来赎回装备与功法，两者不能互换。
      </p>

      <div className="mt-3 space-y-2">
        {ATTRS.map((a) => {
          const v = boost[a.key];
          const canPlus = !busy && v < cfg.attrCapPerAttr && balance >= cfg.attrCostPerPoint;
          const canMinus = !busy && v > 0;
          return (
            <div key={a.key} className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
              <span aria-hidden className="glyph-tile text-base">{a.icon}</span>
              <span className="min-w-0 flex-1 text-sm font-bold">
                {a.label}
                <span className="ml-1.5 text-[11px] font-normal text-[var(--dim)]">初始属性 +{v}（单项上限 {cfg.attrCapPerAttr}）</span>
              </span>
              <button type="button" disabled={!canMinus} aria-label={`减少${a.label}的轮回点分配，退回 ${cfg.attrCostPerPoint} 点`}
                onClick={() => onAllocate(a.key, -1)}
                className="h-8 w-8 shrink-0 rounded-full bg-[var(--surface2)] text-base font-black disabled:opacity-35">−</button>
              <span className="w-6 shrink-0 text-center font-brush text-base font-black">{v}</span>
              <button type="button" disabled={!canPlus} aria-label={`给${a.label}加 1 点，花费 ${cfg.attrCostPerPoint} 轮回点`}
                onClick={() => onAllocate(a.key, 1)}
                className="h-8 w-8 shrink-0 rounded-full bg-[var(--accent)] text-base font-black text-[var(--on-bright)] disabled:opacity-35">+</button>
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-[var(--dim)]">每 +1 点属性花费 {cfg.attrCostPerPoint} 轮回点，减回去原数退回；分配在降生时生效，未降生前可随时调整。</p>

      <button type="button" disabled={!canReset} onClick={onResetDraw}
        aria-label={`花费 ${cfg.resetCost} 轮回点重置天赋与灵根候选`}
        className="mt-3 w-full rounded-xl border-2 border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2.5 text-left disabled:opacity-40">
        <span className="font-song text-sm font-bold">重置天赋与灵根候选 · {cfg.resetCost} 点</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-[var(--dim)]">
          只换天赋候选与灵根候选（已选天赋清空），出身、命格和上面的属性分配都不动{balance < cfg.resetCost ? `；轮回点不足（现有 ${balance} 点）` : ""}。
          {rootLocked ? "灵根由游戏规则 Q2 锁定，重置实际只换天赋候选。" : "「全部重抽」是免费的，但会把出身、命格一起重抽。"}
        </span>
      </button>

      {/* U-021：再战天道强化项——与上面的属性分配/重置候选不重叠，
          强化气血/法力上限、寿元与开局灵石，降生时一次性生效。 */}
      <div className="mt-4 border-t border-[var(--border)] pt-3">
        <p className="font-song text-sm font-black"><Seal ch="战" /> 强化下一世 · 再战天道</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--dim)]">
          拿轮回点给下一世添底气：强化的不是初始属性、天赋或灵根，而是气血法力、寿元与开局灵石。每项每世只购一份，降生时生效；降生前点已购项可退订，点数原数退回。
        </p>
        <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {cfg.boons.map((b) => {
            const owned = state.birthBoons.includes(b.id);
            const canBuy = !busy && (owned || balance >= b.cost);
            return (
              <button key={b.id} type="button" disabled={!canBuy} onClick={() => onBuyBoon(b.id)}
                aria-label={owned ? `退订强化项${b.name}，退回 ${b.cost} 轮回点` : `花费 ${b.cost} 轮回点购入强化项${b.name}`}
                aria-pressed={owned}
                className={`rounded-xl border-2 px-3 py-2.5 text-left disabled:opacity-40 ${owned ? "border-[var(--gold)] bg-[var(--gold-soft)]" : "border-[var(--border)] bg-[var(--bg)]"}`}>
                <span className="flex items-baseline gap-2">
                  <span className="flex-1 font-song text-sm font-bold">{b.name}</span>
                  <span className="shrink-0 text-xs font-black text-[var(--accent)]">{owned ? "已购 · 点此退订" : `${b.cost} 点`}</span>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-[var(--dim)]">{b.desc}{!owned && balance < b.cost ? `（轮回点不足，现有 ${balance} 点）` : ""}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
