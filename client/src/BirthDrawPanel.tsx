// 降生抽选面板（Q11/Q13），创建与轮回结算共用。
// 姓名不走抽选：自填输入框 + 随机按钮，在创建/结算视图里单独处理。
// 本面板管出身/命格/灵根/天赋四项：主层是四项的当前状态总览（每项一行），
// 点任一项进入二级选择页——该项的候选逐个列成大卡片带说明，
// 点候选 = 自选、点「随机」= 降生时从候选里掷一个，选完自动返回总览。

import { useState } from "react";
import type { BirthDraw, DrawField, State } from "./types";
import { ROOTS, TIER_LABEL, TIER_STYLE } from "./display-data";
import { Seal } from "./widgets";

type Page = DrawField | "talent";

export function BirthDrawPanel({ state, draw, busy, onChoice, onTalents, onRedraw, rootLockedId }: {
  state: State;
  draw: BirthDraw;
  busy: boolean;
  onChoice: (field: DrawField, random: boolean, value?: string) => void;
  onTalents: (ids: string[]) => void;
  onRedraw: () => void;
  rootLockedId: string | null;
}) {
  const [page, setPage] = useState<Page | null>(null);
  const destinyOf = (id: string) => state.pools.destinies.find((d) => d.id === id);
  const rootOf = (id: string) => ROOTS.find((r) => r.id === id);
  const fieldDefs: { field: DrawField; label: string; icon: string; poolNote: string; render: (v: string) => { name: string; desc?: string } }[] = [
    { field: "origin", label: "出身", icon: "身", poolNote: `出身池 ${state.pools.origins.length} 种`, render: (v) => ({ name: v }) },
    { field: "destiny", label: "命格", icon: "命", poolNote: `命格池 ${state.pools.destinies.length} 种`, render: (v) => { const d = destinyOf(v); return { name: d?.name ?? v, desc: d?.desc }; } },
    { field: "root", label: "灵根", icon: "根", poolNote: `灵根池 ${ROOTS.length} 种`, render: (v) => { const r = rootOf(v); return { name: r?.name ?? v, desc: r ? `${r.desc}（${r.stats}）` : undefined }; } },
  ];
  const chosenTalent = draw.talentChoices.find((t) => t.id === draw.chosenTalents[0]);

  // ---------- 二级选择页：天赋 ----------
  if (page === "talent") {
    return (
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setPage(null)} aria-label="返回降生抽选总览" className="shrink-0 rounded-full bg-[var(--surface2)] px-3 py-1.5 text-xs font-bold">‹ 返回</button>
          <p className="font-brush text-base font-black"><Seal ch="赋" /> 选择天赋</p>
          <span className="text-[11px] text-[var(--dim)]">候选 3 个选 1，可不选</span>
        </div>
        <button type="button" disabled={busy} aria-pressed={draw.chosenTalents.length === 0}
          onClick={() => { onTalents([]); setPage(null); }}
          className={`w-full rounded-xl border-2 p-3 text-left disabled:opacity-50 ${draw.chosenTalents.length === 0 ? "border-[var(--gold)] bg-[var(--gold-soft)]" : "border-[var(--border)] bg-[var(--bg)]"}`}>
          <span className="font-song text-sm font-bold">不带新天赋</span>
          <span className="mt-0.5 block text-xs text-[var(--dim)]">这一世不带新天赋降生（每世结算时还能再换）。</span>
        </button>
        {draw.talentChoices.map((t) => {
          const selected = draw.chosenTalents.includes(t.id);
          return (
            <button key={t.id} type="button" disabled={busy} aria-pressed={selected}
              onClick={() => { onTalents([t.id]); setPage(null); }}
              className={`w-full rounded-xl border-2 p-3 text-left disabled:opacity-50 ${selected ? "border-[var(--gold)] bg-[var(--gold-soft)]" : "border-[var(--border)] bg-[var(--bg)]"}`}>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${TIER_STYLE[t.tier] ?? TIER_STYLE.blue}`}>{TIER_LABEL[t.tier] ?? ""}级天赋</span>
              <span className="mt-1 block font-song text-base font-bold">{t.name}{selected ? " ✓" : ""}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-[var(--dim)]">{t.desc}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // ---------- 二级选择页：出身 / 命格 / 灵根 ----------
  if (page) {
    const fd = fieldDefs.find((f) => f.field === page);
    if (fd) {
      const choice = draw[fd.field];
      return (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setPage(null)} aria-label="返回降生抽选总览" className="shrink-0 rounded-full bg-[var(--surface2)] px-3 py-1.5 text-xs font-bold">‹ 返回</button>
            <p className="font-brush text-base font-black"><Seal ch={fd.icon} /> 选择{fd.label}</p>
            <span className="text-[11px] text-[var(--dim)]">{fd.poolNote} · 候选 3 个</span>
          </div>
          <p className="text-xs leading-relaxed text-[var(--dim)]">点候选 = 自选定下这一项；点「随机」= 降生时从这 3 个候选里掷一个。选完自动返回。</p>
          <button type="button" disabled={busy} aria-pressed={choice.random}
            onClick={() => { onChoice(fd.field, true); setPage(null); }}
            className={`w-full rounded-xl border-2 p-3 text-left disabled:opacity-50 ${choice.random ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--bg)]"}`}>
            <span className="font-song text-sm font-bold">随机{choice.random ? " ✓" : ""}</span>
            <span className="mt-0.5 block text-xs leading-relaxed break-words text-[var(--dim)]">候选：{choice.pool.map((v) => fd.render(v).name).join(" / ")}——降生时掷定。</span>
          </button>
          {choice.pool.map((v) => {
            const d = fd.render(v);
            const selected = !choice.random && choice.value === v;
            return (
              <button key={v} type="button" disabled={busy} aria-pressed={selected}
                onClick={() => { onChoice(fd.field, false, v); setPage(null); }}
                className={`w-full rounded-xl border-2 p-3 text-left disabled:opacity-50 ${selected ? "border-[var(--gold)] bg-[var(--gold-soft)]" : "border-[var(--border)] bg-[var(--bg)]"}`}>
                <span className="font-song text-base font-bold">{d.name}{selected ? " ✓" : ""}</span>
                {d.desc && <span className="mt-0.5 block text-xs leading-relaxed text-[var(--dim)]">{d.desc}</span>}
              </button>
            );
          })}
        </div>
      );
    }
  }

  // ---------- 主层：四项总览 ----------
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-xs leading-relaxed text-[var(--dim)]">出身、命格、灵根、天赋各自独立：点开任一项进选择页，逐项自选或掷随机，互不影响。</p>
        <button type="button" disabled={busy} onClick={onRedraw} className="shrink-0 rounded-full bg-[var(--surface2)] px-3 py-1.5 text-xs font-bold disabled:opacity-40">↻ 全部重抽</button>
      </div>
      {fieldDefs.map((fd) => {
        const choice = draw[fd.field];
        const locked = fd.field === "root" && rootLockedId !== null;
        const lockedRoot = locked ? rootOf(rootLockedId) : undefined;
        if (locked && lockedRoot) {
          return (
            <div key={fd.field} className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-2.5">
              <span aria-hidden className="glyph-tile text-xl">{fd.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{fd.label} <span className="text-[11px] font-normal text-[var(--dim)]">{fd.poolNote}</span></span>
                <span className="block text-xs text-[var(--dim)]"><b className="text-[var(--text)]">{lockedRoot.name}</b> 由游戏规则 Q2 锁定（{lockedRoot.stats}）；要自选灵根，先去游戏规则把 Q2 改为「普通凡人」。</span>
              </span>
            </div>
          );
        }
        const current = fd.render(choice.value);
        const summary = choice.random
          ? `随机（候选：${choice.pool.map((v) => fd.render(v).name).join(" / ")}）`
          : `${current.name}${current.desc ? ` —— ${current.desc}` : ""}`;
        return (
          <button key={fd.field} type="button" disabled={busy} onClick={() => setPage(fd.field)}
            aria-label={`选择${fd.label}，当前${choice.random ? "随机" : current.name}`}
            className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-left disabled:opacity-50">
            <span aria-hidden className="glyph-tile text-xl">{fd.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">{fd.label} <span className="text-[11px] font-normal text-[var(--dim)]">{fd.poolNote}</span></span>
              <span className="block text-xs leading-relaxed break-words text-[var(--dim)]">当前：<b className="text-[var(--text)]">{summary}</b></span>
            </span>
            <span aria-hidden className="shrink-0 text-sm font-bold text-[var(--accent)]">选择 ›</span>
          </button>
        );
      })}

      <button type="button" disabled={busy} onClick={() => setPage("talent")}
        aria-label={`选择天赋，当前${chosenTalent ? chosenTalent.name : "未选"}`}
        className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-left disabled:opacity-50">
        <span aria-hidden className="glyph-tile text-xl">赋</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">天赋 <span className="text-[11px] font-normal text-[var(--dim)]">天赋池 {state.pools.talents.length} 个 · 候选 3 个选 1</span></span>
          <span className="block text-xs leading-relaxed break-words text-[var(--dim)]">当前：<b className="text-[var(--text)]">{chosenTalent ? `${chosenTalent.name} —— ${chosenTalent.desc}` : "未选天赋"}</b></span>
        </span>
        <span aria-hidden className="shrink-0 text-sm font-bold text-[var(--accent)]">选择 ›</span>
      </button>
    </div>
  );
}
