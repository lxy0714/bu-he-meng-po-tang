// 小组件：属性条、判定骰子（Q34 记号 1dS[下限~上限]+修正 vs 难度）、命轮。

import { useEffect, useRef, useState } from "react";
import type { Character } from "./types";

// ---------- small components ----------

// U-623 水墨宣纸：印章字组件——朱砂方印 + 白色书法单字，替代各处
// emoji 图标（页签、标题、条目前缀）。样式在 theme.css 的 .seal。
export function Seal({ ch }: { ch: string }) {
  return <span aria-hidden className="seal">{ch}</span>;
}

// 主题图标（U-623 细化）：浅色=太阳、深色=月亮、跟随系统=阴阳——
// 阴阳调和、随系统明暗，贴轮回修仙题材。三枚均为水墨线条 SVG
//（currentColor 描边，随按钮字色走），不用 emoji。
export function ThemeIcon({ kind }: { kind: "system" | "light" | "dark" }) {
  const common = {
    width: 18, height: 18, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
    "aria-hidden": true, focusable: false,
  };
  if (kind === "light") {
    // 太阳：圆心 + 八道光芒
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5 5l1.6 1.6M17.4 17.4L19 19M19 5l-1.6 1.6M6.6 17.4L5 19" />
      </svg>
    );
  }
  if (kind === "dark") {
    // 月亮：弯月
    return (
      <svg {...common}>
        <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />
      </svg>
    );
  }
  // 阴阳：外圆 + S 形分界 + 两点鱼眼（一实一空，线条口径）
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a4.5 4.5 0 0 1 0 9 4.5 4.5 0 0 0 0 9" />
      <circle cx="12" cy="7.5" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="12" cy="16.5" r="1.15" />
    </svg>
  );
}

// U-608 细时钟：年龄显示为「年+月」——由累计月份 totalMonths 推导
// （满 12 个月进 1 岁，与服务端 advanceMonths 同一口径）；整年时
// 只显示岁数，不带「0 月」。
export function ageTextOf(c: { totalMonths: number }): string {
  const years = Math.floor(c.totalMonths / 12);
  const months = c.totalMonths % 12;
  return months > 0 ? `${years} 岁 ${months} 月` : `${years} 岁`;
}

export function Bar({ label, value, max, color, icon }: { label: string; value: number; max: number; color: string; icon: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-[var(--dim)]">
        <span className="flex items-center gap-1.5"><span aria-hidden className="font-brush text-sm leading-none" style={{ color }}>{icon}</span>{label}</span>
        <span className="font-medium text-[var(--text)]">{value} / {max}</span>
      </div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-[var(--surface2)]" role="img" aria-label={`${label} ${value}/${max}`}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export function Dice({ roll }: { roll: Character["lastRoll"] }) {
  const [shown, setShown] = useState<number | null>(null);
  const [animKey, setAnimKey] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!roll) { setShown(null); return; }
    if (roll.dc <= 0 || roll.dice <= 0) { setShown(null); return; }
    setAnimKey((k) => k + 1);
    if (timer.current) clearInterval(timer.current);
    // Q34：滚动动画的点数范围 = 本次明细的动态范围（旧存档明细无
    // 此段时回退 1~150）。
    const animLo = roll.detail?.diceLo ?? 1;
    const animHi = roll.detail?.diceHi ?? 150;
    let ticks = 0;
    timer.current = setInterval(() => {
      ticks += 1;
      setShown(animLo + Math.floor(Math.random() * (animHi - animLo + 1)));
      if (ticks > 7) {
        if (timer.current) clearInterval(timer.current);
        setShown(roll.dice);
      }
    }, 70);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [roll]);
  if (!roll) return null;
  const rolled = roll.dc > 0 && roll.dice > 0;
  // U-570：带结构化明细时展示可审计明细（审计行 + 修正构成 + modifier
  // 生效过程 + 胜势差）；旧存档的 lastRoll 没有 detail，回退原汇总展示。
  const d = roll.detail;
  const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`).replace("-", "−");
  const partsText = d ? d.bonusParts.map((p, i) => (i === 0 ? `${p.label} ${p.value}` : p.value >= 0 ? ` + ${p.label} ${p.value}` : ` − ${p.label} ${Math.abs(p.value)}`)).join("") : "";
  const traceLines = d ? d.modifierTrace.filter((t) => t.dcDelta !== 0 || t.bonusDelta !== 0).map((t) => {
    const changes: string[] = [];
    if (t.dcDelta !== 0) changes.push(`难度 ${t.dcBefore} → ${t.dcAfter}（${signed(t.dcDelta)}）`);
    if (t.bonusDelta !== 0) changes.push(`修正 ${t.bonusBefore} → ${t.bonusAfter}（${signed(t.bonusDelta)}）`);
    return `${t.label}：${changes.join("，")}`;
  }) : [];
  // U-572：双掷明细行——两颗骰值、舍了哪颗、取了哪颗（旧存档明细无
  // 此段时不显示）。审计行 d.text 里已含同一信息，这里再单列一行。
  const dropLine = d && d.droppedRolls && d.droppedRolls.length > 0
    ? d.rollMode === "advantage"
      ? `优势双掷 ${d.expression.split("+")[0]}：掷出 ${d.rolls.join("、")}，舍弃低的 ${d.droppedRolls[0]}，取高的 ${d.keptRolls?.[0] ?? roll?.dice}`
      : `劣势双掷 ${d.expression.split("+")[0]}：掷出 ${d.rolls.join("、")}，舍弃高的 ${d.droppedRolls[0]}，取低的 ${d.keptRolls?.[0] ?? roll?.dice}`
    : null;
  // Q34：骰面范围行——基础骰面与本次动态上下限（明细带此段时才有）。
  const rangeLine = d && d.diceLo !== undefined && d.diceHi !== undefined
    ? `骰面范围 ${d.diceLo}~${d.diceHi}（基础 d${d.diceBase ?? "?"}，随相关属性动态适配）`
    : null;
  return (
    <div aria-live="polite" className={`fade-slide-in flex items-center gap-3 rounded-[var(--radius)] border p-3 ${roll.success ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--red)] bg-[var(--gold-soft)]"}`}>
      <div key={animKey} className={`${rolled ? "dice-anim" : ""} flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-[var(--ink)] font-brush text-xl font-black text-[var(--on-ink)]`} aria-label={rolled ? `${d?.expression.split("+")[0] ?? "骰子"} 骰子点数 ${roll.dice}` : "无需检定"}>
        {rolled ? (shown ?? roll.dice) : "骰"}
      </div>
      <div className="min-w-0 text-sm">
        {d && rolled ? (
          <>
            <p className="font-medium">{roll.label}：{d.text} —— {roll.success ? "成功！" : "失败。"}</p>
            {rangeLine && <p className="mt-0.5 text-xs text-[var(--dim)]">{rangeLine}</p>}
            {dropLine && <p className="mt-0.5 text-xs text-[var(--gold)]">{dropLine}</p>}
            <p className="mt-0.5 text-xs text-[var(--dim)]">修正构成：{partsText} = {d.bonus} · 胜势差 {signed(d.margin)}</p>
            {traceLines.map((line) => <p key={line} className="mt-0.5 text-xs text-[var(--gold)]">{line}</p>)}
          </>
        ) : (
          <p className="font-medium">{roll.label}：{rolled ? <>{d?.expression.split("+")[0] ?? "骰子"} 掷出 {roll.dice} + 加成 {roll.bonus} = <b>{roll.total}</b> vs 难度 {roll.dc} —— {roll.success ? "成功！" : "失败。"}</> : "无需检定，稳妥行事。"}</p>
        )}
        <p className="mt-0.5 text-[var(--dim)]">{roll.text}</p>
      </div>
    </div>
  );
}

// 命轮： circular progress wheel
export function FateWheel({ c, threshold, realmName }: { c: Character; threshold: number; realmName: string }) {
  const pct = Math.max(0, Math.min(1, c.cultivation / Math.max(1, threshold)));
  const R = 62; const CIRC = 2 * Math.PI * R;
  const lifeDots = Math.min(c.lifeNo, 12);
  return (
    <div className="relative mx-auto h-44 w-44" role="img" aria-label={`命轮：第${c.lifeNo}世，${realmName}，修为进度 ${Math.round(pct * 100)}%`}>
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
        <circle cx="80" cy="80" r={R} fill="none" stroke="var(--border)" strokeWidth="10" />
        <circle cx="80" cy="80" r={R} fill="none" stroke="var(--accent)" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - pct)} className="transition-all duration-700" />
        {Array.from({ length: lifeDots }).map((_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return <circle key={i} cx={80 + Math.cos(a) * 76} cy={80 + Math.sin(a) * 76} r={i === c.lifeNo - 1 ? 4.5 : 3} fill={i === c.lifeNo - 1 ? "var(--gold)" : "var(--dim)"} />;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[11px] tracking-widest text-[var(--dim)]">第 {c.lifeNo} 世</span>
        <span className="font-brush text-xl font-black leading-tight">{realmName}</span>
        <span className="mt-0.5 text-xs text-[var(--dim)]">修为 {c.cultivation}/{threshold}</span>
        <span className="text-xs text-[var(--dim)]">{ageTextOf(c)} · 寿元 {c.lifespan}</span>
      </div>
    </div>
  );
}
