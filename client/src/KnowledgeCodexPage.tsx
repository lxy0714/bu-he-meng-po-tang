// U-086 知识图鉴（轮回历史下的二级页面）：跨世永久收录的功法总览。
// 只展示真实记录——服务端下发的 knowledgeCodex 只含学过的功法
// （未学过的不出现、不留占位）；每门带是否曾精通（精通记录供
// U-614 轮回结算自选免费带走读取）与是否本世修习中。本页只展
// 示、不发任何动作：收录在学会当刻、精通标记在精通当刻，都由
// 服务端结算落定。
//
// U-614 精通印记（连续模型）：曾精通功法带印记强度（0–100），
// 页面用五格深浅条 + 深浅名呈现，格数由强度换算（每格 20），并
// 明示按当前强度换算的重学待遇（起始层数 / 增长加成，与服务
// 端结算同一份换算）；规则说明写清衰减与回满口径，不摆无解释
// 的数字。本世重学标记不在图鉴条目里（那是本世进度
// techProgress 的事），从 character.techniques 里对当前修习功法
// 现查后标注。
//
// U-626：条目带品阶标识（凡/黄/玄/地/天），服务端按品阶由高到
// 低下发；重学起点改层数口径——起始占比（满印记 = 总进度的
// 10%）按各功法总层数换算成起始层数 + 层内点下发。

import type { State } from "./types";
import { Seal } from "./widgets";

function imprintText(t: number): string {
  return Number.isInteger(t) ? String(t) : t.toFixed(1);
}

export function KnowledgeCodexPage({ state, onBack }: { state: State; onBack: () => void }) {
  const codex = state.knowledgeCodex;
  const currentTech = state.character?.techniques.find((t) => t.active);
  const currentRelearned = !!currentTech?.relearned;

  return (
    <section aria-label="知识图鉴" className="rounded-[var(--radius)] bg-[var(--surface)] p-4">
      <button type="button" onClick={onBack}
        className="rounded-full bg-[var(--surface2)] px-3.5 py-2 text-xs font-bold transition active:scale-95">
        ‹ 返回轮回历史
      </button>

      <h2 className="mt-3 font-brush text-lg font-black"><Seal ch="鉴" /> 知识图鉴 <span className="text-xs font-normal text-[var(--dim)]">学过的功法永久收录 · 轮回不清零 · 已收录 {codex.count} 门 · 曾精通 {codex.masteredCount} 门</span></h2>
      <p className="mt-1.5 text-sm leading-relaxed text-[var(--dim)]">
        每一门学过的功法都会录入此图鉴，生死轮回都抹不去。后世重新学到图鉴在册的功法时，前世参悟犹在，按图鉴之助起步重学。曾臻精通的功法留有<b className="text-[var(--text)]">精通印记</b>：印记越深，重学起始层数与增长加成越高（最深时自该功法总进度的 <b className="text-[var(--text)]">{codex.imprintFullStartPct}%</b> 起——按其总层数换算成层数落盘、增长 <b className="text-[var(--text)]">+{codex.imprintFullGainPct}%</b>）；每过一世没再精通它，印记按那一世练到的进度占比变淡（练得越接近修满淡得越少，整世没碰淡得最多），淡到底也只余下限微光（增长 <b className="text-[var(--text)]">+{codex.imprintFloorGainPct}%</b>）、永不消失；任一世再练至精通，印记即回满。轮回结算时，还可凭印记免费带走一门曾精通功法。
      </p>

      {codex.entries.length === 0 ? (
        <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
          <p className="font-song text-sm font-bold">图鉴尚空</p>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--dim)]">
            历世还没有学过任何功法，图鉴无从收录。学功法的路子有三条：探索际遇办妥后可能掉落功法残页（见「地图探索」页的「地点掉落」）；部分地点的签到大奖是功法（见「地图探索」页的「签到图鉴」）；轮回结算时也可用传承点赎回前世功法。学到第一门的那一刻，它就会录入此图鉴。
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-2.5">
          {codex.entries.map((e) => {
            const segs = Math.round(e.imprint / 20);
            return (
            <div key={e.id} className={`rounded-xl border p-3.5 ${e.current ? "border-[var(--gold)] bg-[var(--gold-soft)]" : "border-[var(--border)] bg-[var(--bg)]"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-song text-base font-bold">{e.name}</span>
                <span className="rounded bg-[var(--ink)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--on-ink)]">{e.grade}阶</span>
                <span className="text-[11px] font-bold text-[var(--dim)]">{e.kind}</span>
                <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--accent)]">已收录</span>
                {e.mastered && <span className="rounded bg-[var(--seal)] px-1.5 py-0.5 text-[11px] font-bold text-[#f7f1de]">曾精通</span>}
                {e.current && <span className="rounded bg-[var(--accent)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--on-bright)]">本世修习中</span>}
                {e.current && currentRelearned && <span className="rounded bg-[var(--gold)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--on-bright)]">图鉴重学加成中</span>}
              </div>
              <p className="mt-1 text-sm leading-relaxed text-[var(--dim)]">{e.desc}</p>
              {e.mastered ? (
                <div className="mt-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-0.5" role="img" aria-label={`精通印记${e.imprintLabel}，强度 ${imprintText(e.imprint)}/100`}>
                      {[0, 1, 2, 3, 4].map((i) => (
                        <span key={i} aria-hidden className={`h-2 w-6 rounded-full ${i < segs ? "bg-[var(--seal)]" : "bg-[var(--border)]"}`} />
                      ))}
                    </span>
                    <span className="text-sm font-bold text-[var(--seal)]">{e.imprintLabel}</span>
                    <span className="text-xs text-[var(--dim)]">印记强度 {imprintText(e.imprint)}/100（五格深浅，一格约合 20）</span>
                  </div>
                  <p className="mt-1.5 text-sm">
                    修炼加成 <b className="text-[var(--gold)]">+{e.bonusPct}%</b>
                    <span className="ml-1.5 text-xs text-[var(--dim)]">
                      按当前印记，后世重学此功法自第 {e.relearnStartLayer} 层起（本层已积 {e.relearnStartLayerPoints}/{e.pointsPerLayer} 点）、增长 +{e.relearnGainBonusPct}%；轮回结算可凭印记免费带走。
                    </span>
                  </p>
                </div>
              ) : (
                <p className="mt-1.5 text-sm">
                  修炼加成 <b className="text-[var(--gold)]">+{e.bonusPct}%</b>
                  <span className="ml-1.5 text-xs text-[var(--dim)]">
                    此功法尚不曾精通过——任一世练至精通，图鉴即记下精通印记。后世重学自第 {e.relearnStartLayer} 层起（本层已积 {e.relearnStartLayerPoints}/{e.pointsPerLayer} 点）、增长 +{e.relearnGainBonusPct}%。
                  </span>
                </p>
              )}
            </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
