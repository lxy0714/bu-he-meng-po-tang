// U-613 功法页面（修炼宗门下的二级页面）：集中展示本世已学功法。
// 只放已落地的东西——已学功法列表（名称/品阶/说明/加成/层数进
// 度/精通）、生效中标注；练习入口（U-470）与丹田格子/流派
// （U-339）未落地，按用户 2026-11-18 定夺先不显示、不留占位，
// 等对应项做好再扩。
// 数据全部读服务端整形（character.techniques，与修炼结算同源同
// 口径），本页只展示、不发任何动作、不改任何数值与结算。
//
// U-626 品阶与层数：功法带品阶（凡/黄/玄/地/天），本页按品阶
// 分组呈现（天→地→玄→黄→凡），只显示有功法的品阶、不摆空组；
// 进度改层数呈现——第 N/总层数 层 + 本层进度点（层内攒满进下
// 一层），修满全部层数 = 精通（圆满），不再显示 0–100 熟练度。
//
// 生效口径（如实）：功法槽只有一门——本世学到的功法即是修习中、
// 生效中的那一门（不存在装备切换）；techProgress 里留有记录但
// 不是当前修习的功法（正常流程不会出现）如实标为「本世未修习」。

import type { State } from "./types";
import { Bar, Seal } from "./widgets";

const GRADE_ORDER = ["天", "地", "玄", "黄", "凡"] as const;

export function TechniquesPage({ state, onBack }: { state: State; onBack: () => void }) {
  const c = state.character;
  if (!c) return null;
  const list = c.techniques;
  const groups = GRADE_ORDER
    .map((g) => ({ grade: g, items: list.filter((t) => t.grade === g) }))
    .filter((g) => g.items.length > 0);

  return (
    <section aria-label="功法页" className="rounded-[var(--radius)] bg-[var(--surface)] p-4">
      <button type="button" onClick={onBack}
        className="rounded-full bg-[var(--surface2)] px-3.5 py-2 text-xs font-bold transition active:scale-95">
        ‹ 返回修炼宗门
      </button>

      <h2 className="mt-3 font-brush text-lg font-black"><Seal ch="法" /> 功法 <span className="text-xs font-normal text-[var(--dim)]">本世已学功法总览 · 按品阶分组（凡/黄/玄/地/天，品阶越高层数越多、越难练满） · 功法槽只有一门，学到的即是修习中、生效中的那一门，加成计入修炼与检定 · 斗法、修炼中施展攒进度点，攒满一层进下一层，修满全部层数进精通档、加成上升一档</span></h2>

      {list.length === 0 ? (
        <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
          <p className="font-song text-sm font-bold">尚未习得功法</p>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--dim)]">
            这一世还没学到任何功法。学功法的路子有三条：探索际遇办妥后可能掉落功法残页（见「地图探索」页的「地点掉落」，各地掉的功法都列在那里），功法槽空着时拾得即学会；部分地点的签到大奖是功法（见「地图探索」页的「签到图鉴」）；轮回结算时也可用传承点赎回前世功法，带入下一世修习。
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          {groups.map((g) => (
            <div key={g.grade}>
              <p className="font-brush text-sm font-black text-[var(--gold)]">{g.grade}阶功法</p>
              <div className="mt-2 space-y-2.5">
                {g.items.map((t) => (
                  <div key={t.id} className={`rounded-xl border p-3.5 ${t.active ? "border-[var(--gold)] bg-[var(--gold-soft)]" : "border-[var(--border)] bg-[var(--bg)]"}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-song text-base font-bold">{t.name}</span>
                      <span className="rounded bg-[var(--ink)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--on-ink)]">{t.grade}阶</span>
                      <span className="text-[11px] font-bold text-[var(--dim)]">{t.kind}</span>
                      {t.active
                        ? <span className="rounded bg-[var(--accent)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--on-bright)]">修习中 · 生效中</span>
                        : <span className="rounded bg-[var(--surface2)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--dim)]">本世未修习</span>}
                      {t.mastered && <span className="rounded bg-[var(--seal)] px-1.5 py-0.5 text-[11px] font-bold text-[#f7f1de]">精通 · 圆满</span>}
                      {t.relearned && <span className="rounded bg-[var(--gold)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--on-bright)]">图鉴重学</span>}
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--dim)]">{t.desc}</p>
                    <p className="mt-1.5 text-sm">
                      修炼加成 <b className="text-[var(--gold)]">+{t.effectiveBonusPct}%</b>
                      {t.mastered
                        ? <span className="ml-1.5 text-xs text-[var(--dim)]">（基础 +{t.bonusPct}% + 精通一档 +{t.masteryStepPct}%）</span>
                        : <span className="ml-1.5 text-xs text-[var(--dim)]">（精通后升至 +{t.bonusPct + t.masteryStepPct}%）</span>}
                    </p>
                    <div className="mt-2.5 max-w-md">
                      <Bar label={t.mastered ? `第 ${t.layer} 层 · 圆满` : `第 ${t.layer} 层`} value={t.layerPoints} max={t.pointsPerLayer} color="var(--gold)" icon="层" />
                      <p className="mt-1.5 text-xs leading-relaxed text-[var(--dim)]">
                        {t.mastered
                          ? `已修满全部 ${t.totalLayers ?? 0} 层，臻至精通（圆满）：加成已按精通档生效。`
                          : t.totalLayers !== null && t.totalPoints !== null
                            ? `第 ${t.layer}/${t.totalLayers} 层 · 本层 ${t.layerPoints}/${t.pointsPerLayer} 点，距修满全部 ${t.totalLayers} 层（精通）还差 ${t.totalPoints - t.points} 点。斗法与修炼中施展此功法，都会攒进度点。`
                            : `第 ${t.layer} 层 · 本层 ${t.layerPoints}/${t.pointsPerLayer} 点。此功法层数无上限，永无修满之日。`}
                        {t.relearned && " 这门功法载于知识图鉴，本世属重学：起始层数已由图鉴给定，攒点带图鉴加成（数值见轮回历史页的知识图鉴）。"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
