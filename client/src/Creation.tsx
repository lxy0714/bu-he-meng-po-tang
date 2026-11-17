// 创建视图：第一世降生。

import { useEffect, useRef, useState } from "react";
import type { DrawField, PointsAttr, State } from "./types";
import { TREE, optionLabel } from "./tree-data";
import { KEEPSAKE_ARTIFACTS, villageImg } from "./display-data";
import { BirthDrawPanel } from "./BirthDrawPanel";
import { Seal } from "./widgets";
import { PointsAllocator } from "./PointsAllocator";

// ---------- creation view ----------

// 游戏规则 Q2 在这一页的实际效果（与服务端 createCharacter 的结算一一对应），
// 明写出来，改 Q2 时一眼能看出这一页变了什么。
const Q2_EFFECTS: Record<string, string> = {
  waste_root: "灵根锁定为废灵根（战力 8 · 神识 10 · 机缘 22 · 体魄 12），前世记忆封印，开局灵石 50。",
  mortal: "灵根不锁定——在下方降生抽选里自选或随机，属性随所选灵根而定；无封印记忆。",
  reborn: "灵根锁定为天灵根（战力 18 · 神识 18 · 机缘 16 · 体魄 16），记忆全开，开局自带 90 点修为、灵石 +100、神识 +6。",
};

export function Creation({ state, onCreate, creating, onDraw, drawing, onChoice, onTalents, onAllocatePoints, onResetDraw, onBuyBoon }: {
  state: State;
  onCreate: (name: string, artifactId?: string) => void;
  creating: boolean;
  onDraw: () => void;
  drawing: boolean;
  onChoice: (field: DrawField, random: boolean, value?: string) => void;
  onTalents: (ids: string[]) => void;
  onAllocatePoints: (attr: PointsAttr, delta: number) => void;
  onResetDraw: () => void;
  onBuyBoon: (boonId: string) => void;
}) {
  const q2 = state.settings.q2.value;
  const q6 = state.settings.q6.value;
  const q9 = state.settings.q9.value;
  const lockedRoot = q2 === "waste_root" ? "waste" : q2 === "reborn" ? "heaven" : null;
  const [name, setName] = useState("");
  // Q9「开局自带一件」时在创建页挑的法宝；默认选中第一件，可改选。
  const [artifactPick, setArtifactPick] = useState("");
  const effectiveArtifact = artifactPick || state.pools.artifacts[0]?.id || "";
  // 姓名随机：直接用本地姓名池即时掷一个填进输入框，不走服务器往返。
  const rollName = () => setName(state.pools.names[Math.floor(Math.random() * state.pools.names.length)] ?? "");
  const draw = state.birthDraw;
  const lifeNo = state.lives.length + 1;
  const q2Node = TREE[1];
  const needsDraw = !draw;
  const canCreate = !creating && !needsDraw && (q6 === "named" ? name.trim().length > 0 : true);
  const drawFired = useRef(false);
  useEffect(() => { if (needsDraw && !drawFired.current) { drawFired.current = true; onDraw(); } }, [needsDraw, onDraw]);
  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-[var(--radius)]">
        <img src={villageImg} alt="山下凡村：雾气中的小村与远山" className="h-36 w-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8">
          <p className="font-brush text-lg font-black text-white">第{lifeNo}世 · 降生</p>
          <p className="text-xs text-white/85">Q11 定稿：第一世直接随机——出身/命格/灵根/天赋全从大池里抽，姓名自填或随机掷；开局设定来自游戏规则 Q2：{q2Node ? optionLabel(q2Node, q2) : q2}</p>
        </div>
      </div>

      <div className="rounded-[var(--radius)] bg-[var(--surface)] px-4 py-3 text-xs leading-relaxed">
        <span className="font-bold">开局设定 · 游戏规则 Q2「{q2Node ? optionLabel(q2Node, q2) : q2}」：</span>
        <span className="text-[var(--dim)]">{Q2_EFFECTS[q2] ?? ""} 在游戏规则里改 Q2，这页和降生结算立刻跟着变。</span>
      </div>

      {needsDraw ? (
        <div className="rounded-[var(--radius)] bg-[var(--surface)] p-4 text-center">
          <p className="text-sm text-[var(--dim)]">正在为这一世掷命盘…</p>
          <button type="button" disabled={drawing} onClick={onDraw} className="mt-3 w-full rounded-xl bg-[var(--gold)] py-3 font-brush text-base font-black text-[var(--on-bright)] disabled:opacity-40">
            {drawing ? "抽取中…" : "抽取这一世的命盘"}
          </button>
        </div>
      ) : (
        <>
          <div className="rounded-[var(--radius)] bg-[var(--surface)] p-4">
            <label htmlFor="char-name" className="text-sm font-bold">姓名 / 道号</label>
            <div className="mt-2 flex gap-2">
              <input id="char-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={12}
                placeholder="例如：沈长生" className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-base outline-none focus:border-[var(--accent)]" />
              <button type="button" disabled={creating} onClick={rollName} aria-label="随机掷一个姓名填入"
                className="shrink-0 rounded-lg bg-[var(--surface2)] px-4 py-2.5 text-sm font-bold disabled:opacity-40">随机</button>
            </div>
            <p className="mt-1.5 text-xs text-[var(--dim)]">{q6 === "named" ? "Q6 当前为「姓名自定」：自己起一个，或点随机从姓名池里掷一个。" : "自己填，或点随机从姓名池里掷一个；留空的话，降生时也会随机掷定。"}</p>
          </div>

          <div className="rounded-[var(--radius)] bg-[var(--surface)] p-4">
            <p className="mb-3 font-brush text-base font-black"><Seal ch="命" /> 降生抽选 <span className="text-xs font-normal text-[var(--dim)]">Q13：各自独立 —— 点开逐项选</span></p>
            <BirthDrawPanel state={state} draw={draw} busy={drawing || creating} rootLockedId={lockedRoot}
              onChoice={onChoice} onTalents={onTalents} onRedraw={onDraw} />
          </div>

          <PointsAllocator state={state} busy={drawing || creating} rootLocked={lockedRoot !== null}
            onAllocate={onAllocatePoints} onResetDraw={onResetDraw} onBuyBoon={onBuyBoon} />
        </>
      )}

      {q9 === "from_start" ? (
        <div className="rounded-[var(--radius)] bg-[var(--surface)] p-4">
          <p className="font-brush text-base font-black"><Seal ch="宝" /> 本命法宝 · 开局自带 <span className="text-xs font-normal text-[var(--dim)]">游戏规则 Q9 当前为「开局自带一件」</span></p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--dim)]">挑一件随这一世降生。每件法宝按功能强度定了认主门槛（卡上标明）：降生是炼气，未达门槛的法宝先封存在身、加成不生效，境界达到后自动解封认主。之后每一世带走哪件，仍走轮回结算、用传承点赎回。想回赤手空拳开局，去游戏规则把 Q9 改回定稿项。</p>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            {state.pools.artifacts.map((a) => {
              const selected = effectiveArtifact === a.id;
              return (
                <button key={a.id} type="button" disabled={creating} aria-pressed={selected}
                  aria-label={`选择本命法宝${a.name}`}
                  onClick={() => setArtifactPick(a.id)}
                  className={`rounded-xl border-2 p-2.5 text-left disabled:opacity-50 ${selected ? "border-[var(--gold)] bg-[var(--gold-soft)]" : "border-[var(--border)] bg-[var(--bg)]"}`}>
                  <span className="glyph-tile text-xl" aria-hidden>{KEEPSAKE_ARTIFACTS.find((k) => k.id === a.id)?.icon ?? "剑"}</span>
                  <span className="mt-0.5 block font-song text-sm font-bold">{a.name}{selected ? " ✓" : ""}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-[var(--dim)]">{a.desc}</span>
                  <span className="mt-0.5 block text-[11px] font-bold text-[var(--gold)]">需{a.minRealmName}境认主 · 降生未达先封存</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-[var(--radius)] border-2 border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
          <p className="font-bold">本命法宝：本世暂无（Q9 定稿）</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--dim)]">第一世赤手空拳。这一世里攒下的法宝、功法与宝物，会在你死后进入轮回结算池，用传承点赎回带走——挑哪件、留哪件，到时候你说了算。想要开局自带一件，去游戏规则把 Q9 改成「开局自带一件」，这页就会让你挑。</p>
        </div>
      )}

      <button type="button" disabled={!canCreate}
        onClick={() => onCreate(name.trim(), q9 === "from_start" ? effectiveArtifact : undefined)}
        className="w-full rounded-[var(--radius)] bg-[var(--accent)] py-3.5 font-brush text-lg font-black text-[var(--on-bright)] disabled:opacity-40">
        {creating ? "降生中…" : "踏入仙途"}
      </button>
      {needsDraw && <p className="text-center text-xs text-[var(--dim)]">先抽取命盘，才能降生</p>}
      {q6 === "named" && name.trim().length === 0 && !needsDraw && <p className="text-center text-xs text-[var(--dim)]">Q6 当前为「姓名自定」：先给这一世起个名字（或去游戏规则改回全部随机）</p>}
    </div>
  );
}
