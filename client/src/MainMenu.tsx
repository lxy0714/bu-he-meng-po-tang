// U-624 主菜单：打开游戏的第一屏。六项——新游戏 / 继续游戏 /
// 读取存档 / 游戏规则（只读）/ 设置 / 退出游戏。继续游戏有存档时
// 一键直达游戏盘；没有存档时不显示继续游戏（2026-11-16 用户口径：
// 存档 = 已创建的角色或已历前世；创建角色不做保存——未走完的降生
// 抽选不算存档、不断续，退出即作废，见服务端 abandonCreation）；
// 新游戏有存档时先走散功三级确认
//（与设置页存档栏同一口径，U-621 细化：一级点按 → 二级确认 →
// 三级弹窗输「不后悔」；设置里关掉三级确认时二级确认后直接执行），
// 无存档直接进规则设定页（U-625：先定整局规则、确认锁定后进创建）；读取
// 存档先看存档详情（第几世、境界、寿元）再继续（单存档）；退出
// 游戏在网页版即关闭页面，游戏内对应「返回主菜单」（App 游戏视图
// 顶部）。水墨动图为纯 SVG + CSS 动画（云雾漂移、墨晕呼吸、轮回
// 环缓转，类名在 theme.css），不挂图片/视频文件；「界面动画」关
// 或系统减动效时静止。布局、文案、配色走 U-623 水墨宣纸规矩。

import { useState } from "react";
import type { State } from "./types";
import { Seal, ageTextOf } from "./widgets";

const FIELD = "w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";
const CARD = "rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm";

// 水墨动图：三层云雾横向漂移（.menu-mist）、两团墨晕呼吸缩放
//（.menu-bloom）、一圈轮回环缓转（.menu-wheel，十二点象世数流转），
// 中心一点朱砂。全部只动 transform，元素十余个，首屏无额外请求。
function InkScene() {
  const dots: [number, number][] = [
    [232, 110], [225, 136], [206, 155], [180, 162], [154, 155], [135, 136],
    [128, 110], [135, 84], [154, 65], [180, 58], [206, 65], [225, 84],
  ];
  return (
    <svg viewBox="0 0 360 220" className="h-full w-full" aria-hidden="true" focusable="false">
      <defs>
        <filter id="menu-blur-lg" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
        <filter id="menu-blur-sm" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      <g fill="var(--ink)">
        <circle className="menu-bloom" cx="88" cy="66" r="34" opacity="0.1" filter="url(#menu-blur-lg)" />
        <circle className="menu-bloom" style={{ animationDelay: "-3.5s" }} cx="282" cy="152" r="26" opacity="0.08" filter="url(#menu-blur-lg)" />
        <circle cx="184" cy="112" r="17" opacity="0.06" filter="url(#menu-blur-sm)" />
      </g>
      <g fill="var(--dim)">
        <ellipse className="menu-mist" cx="82" cy="50" rx="92" ry="12" opacity="0.16" filter="url(#menu-blur-lg)" />
        <ellipse className="menu-mist menu-mist-slow" style={{ animationDelay: "-7s" }} cx="272" cy="94" rx="112" ry="14" opacity="0.12" filter="url(#menu-blur-lg)" />
        <ellipse className="menu-mist" style={{ animationDelay: "-2.5s" }} cx="150" cy="172" rx="122" ry="13" opacity="0.14" filter="url(#menu-blur-lg)" />
      </g>
      <g className="menu-wheel">
        <circle cx="180" cy="110" r="52" fill="none" stroke="var(--gold)" strokeWidth="1.4" strokeDasharray="3 7" opacity="0.65" />
        <circle cx="180" cy="110" r="40" fill="none" stroke="var(--ink)" strokeWidth="1" opacity="0.35" />
        {dots.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i === 0 ? 3.4 : 2.2} fill={i === 0 ? "var(--gold)" : "var(--dim)"} opacity={i === 0 ? 0.95 : 0.6} />
        ))}
      </g>
      <circle cx="180" cy="110" r="4" fill="var(--seal)" />
    </svg>
  );
}

function MenuItem({ seal, label, hint, disabled, onClick }: {
  seal: string; label: string; hint?: string; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} aria-label={hint ? `${label}：${hint}` : label}
      className="flex w-full items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 text-left shadow-sm transition enabled:active:scale-[0.99] disabled:opacity-45">
      <span className="text-xl leading-none"><Seal ch={seal} /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-song text-base font-black">{label}</span>
        {hint && <span className="block truncate text-xs text-[var(--dim)]">{hint}</span>}
      </span>
      <span aria-hidden="true" className="shrink-0 text-lg text-[var(--dim)]">›</span>
    </button>
  );
}

export function MainMenu({ state, tripleConfirm, resetting, onContinue, onNewGameDirect, onNewGameReset, onOpenRules, onOpenSettings }: {
  state: State;
  tripleConfirm: boolean;
  resetting: boolean;
  onContinue: () => void;
  onNewGameDirect: () => void;
  onNewGameReset: () => void;
  onOpenRules: () => void;
  onOpenSettings: () => void;
}) {
  const c = state.character;
  // 存档口径：已创建的角色或已历前世才算存档。仅有降生抽选
  //（birthDraw）是未完成的创建，不算存档——菜单不显示继续游戏，
  // 退出创建即作废，不留可续的进度。
  const hasSave = !!c || state.lives.length > 0;
  const [panel, setPanel] = useState<"none" | "load" | "exit">("none");
  // 散功三级确认（新游戏有存档时）：0 未开始 → 1 二级确认 → 2 三级弹窗。
  const [resetStage, setResetStage] = useState<0 | 1 | 2>(0);
  const [resetPhrase, setResetPhrase] = useState("");

  const realmText = c ? `${state.realmNames[c.realmIdx] ?? ""}·${state.stageNames[c.stageIdx] ?? ""}` : "";
  const locName = c ? (state.locations.find((l) => l.id === c.locationId)?.name ?? c.locationId) : "";
  const lastLife = state.lives.reduce<(typeof state.lives)[number] | undefined>(
    (acc, l) => (acc === undefined || l.lifeNo > acc.lifeNo ? l : acc), undefined);
  const statusLine = c
    ? `当前存档 · 第 ${c.lifeNo} 世 ${c.name} · ${realmText}`
    : hasSave
      ? `已历 ${state.lives.length} 世 · 新一世待降生`
      : "尚无存档 · 从第一世开始";

  const startNewGame = () => {
    if (!hasSave) { onNewGameDirect(); return; }
    setPanel("none");
    setResetStage(1);
  };
  const confirmResetStage1 = () => {
    if (tripleConfirm) { setResetPhrase(""); setResetStage(2); }
    else { onNewGameReset(); setResetStage(0); }
  };

  return (
    <div className="fade-slide-in mx-auto max-w-md">
      {/* 水墨题屏：动图 + 标题（标题即本屏内容本身） */}
      <div className="relative overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]">
        <div className="relative h-52 sm:h-60">
          <div className="absolute inset-0"><InkScene /></div>
          <div className="absolute inset-x-0 bottom-0 px-4 pb-4 text-center">
            <h1 className="font-brush text-4xl font-black tracking-wide">不喝孟婆汤</h1>
            <p className="mt-1.5 text-xs text-[var(--dim)]" role="status">{statusLine}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-2.5">
        <MenuItem seal="新" label="新游戏" onClick={startNewGame}
          hint={hasSave ? "清空当前存档，先定规则再重新开始" : "先定整局规则，再开始第一世"} />
        {hasSave && (
          <MenuItem seal="续" label="继续游戏" onClick={onContinue}
            hint={c ? `第 ${c.lifeNo} 世 · ${realmText} · ${locName}` : "新一世待降生"} />
        )}
        <MenuItem seal="读" label="读取存档" disabled={!hasSave} onClick={() => setPanel(panel === "load" ? "none" : "load")}
          hint={hasSave ? "先看存档详情，再决定是否继续" : "暂无存档"} />
        <MenuItem seal="规" label="游戏规则" onClick={onOpenRules} hint="只读查看本局的 19 条规则" />
        <MenuItem seal="设" label="设置" onClick={onOpenSettings} hint="AI 陪跑 / 显示偏好 / 存档管理" />
        <MenuItem seal="退" label="退出游戏" onClick={() => setPanel(panel === "exit" ? "none" : "exit")}
          hint="网页版关闭页面即退出" />
      </div>

      {/* 新游戏二级确认（行内） */}
      {resetStage === 1 && (
        <div className={`${CARD} mt-4`} role="alert">
          <p className="text-sm font-bold text-[var(--red)]">新游戏会先散功重开：清空角色、全部前世与编年史（报错记录保留），确定？</p>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={resetting} onClick={confirmResetStage1}
              className="flex-1 rounded-full bg-[var(--red)] px-4 py-2.5 text-sm font-bold text-[var(--on-bright)] disabled:opacity-40">确认散功</button>
            <button type="button" onClick={() => setResetStage(0)} className="flex-1 rounded-full bg-[var(--surface2)] px-4 py-2.5 text-sm font-bold">取消</button>
          </div>
        </div>
      )}

      {/* 读取存档：存档详情 + 继续 */}
      {panel === "load" && hasSave && (
        <section aria-label="存档详情" className={`${CARD} mt-4`}>
          <h2 className="font-brush text-base font-black"><Seal ch="档" /> 存档详情（单存档）</h2>
          {c ? (
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-[var(--dim)]">姓名</dt><dd className="font-bold">{c.name}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-[var(--dim)]">世数</dt><dd className="font-bold">第 {c.lifeNo} 世</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-[var(--dim)]">境界</dt><dd className="font-bold">{realmText}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-[var(--dim)]">寿元</dt><dd className="font-bold">{ageTextOf(c)} / 寿元 {c.lifespan}（余 {Math.max(0, c.lifespan * 12 - c.totalMonths)} 个月）</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-[var(--dim)]">所在</dt><dd className="font-bold">{locName}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-[var(--dim)]">传承点 · 轮回点</dt><dd className="font-bold">{c.legacyPoints} · {state.reincarnationPoints}</dd></div>
            </dl>
          ) : (
            <div className="mt-3 space-y-1.5 text-sm leading-relaxed">
              <p>已历 {state.lives.length} 世，当前没有在世角色{state.birthDraw ? "，降生抽选进行中" : ""}。</p>
              {lastLife && <p className="text-[var(--dim)]">最近一世：{lastLife.name}（第 {lastLife.lifeNo} 世，{lastLife.realmText}，{lastLife.cause}）</p>}
            </div>
          )}
          <button type="button" onClick={onContinue}
            className="mt-4 w-full rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-[var(--on-bright)]">继续游戏</button>
        </section>
      )}

      {/* 退出游戏说明（网页版口径） */}
      {panel === "exit" && (
        <section aria-label="退出游戏说明" className={`${CARD} mt-4`}>
          <h2 className="font-brush text-base font-black"><Seal ch="退" /> 退出游戏</h2>
          {hasSave ? (
            <p className="mt-2 text-sm leading-relaxed">网页版没有单独的退出动作：<b>关闭本页面即退出</b>，进度已自动保存在存档里，下次打开从主菜单「继续游戏」接着玩。游戏内点「返回主菜单」可以回到这里。</p>
          ) : (
            <p className="mt-2 text-sm leading-relaxed">网页版没有单独的退出动作：<b>关闭本页面即退出</b>。当前没有存档；还没创建完成的角色不会保存，退出就当退出了，下次从「新游戏」重新开始。</p>
          )}
          <button type="button" onClick={() => setPanel("none")} className="mt-3 w-full rounded-full bg-[var(--surface2)] px-4 py-2.5 text-sm font-bold">知道了</button>
        </section>
      )}

      {/* 散功三级确认弹窗：与设置页存档栏同一口径 */}
      {resetStage === 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="散功重开最终确认">
          <div className="w-full max-w-sm rounded-[var(--radius)] bg-[var(--surface)] p-5 shadow-xl">
            <h3 className="font-brush text-base font-black text-[var(--red)]"><Seal ch="戒" /> 最后一步：散功重开</h3>
            <p className="mt-2 text-sm leading-relaxed">散功重开会清空角色、全部前世与编年史（报错记录保留），且<b>无法撤销</b>。真要散功开始新游戏，在下方输入「不后悔」三个字，再点确认。</p>
            <label htmlFor="menu-reset-phrase" className="mb-1.5 mt-4 block text-xs font-bold text-[var(--dim)]">输入「不后悔」以解锁确认</label>
            <input id="menu-reset-phrase" type="text" value={resetPhrase} onChange={(e) => setResetPhrase(e.target.value)}
              placeholder="不后悔" autoComplete="off" autoFocus
              className={FIELD} />
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={resetting || resetPhrase.trim() !== "不后悔"}
                onClick={() => { onNewGameReset(); setResetStage(0); setResetPhrase(""); }}
                className="flex-1 rounded-full bg-[var(--red)] px-4 py-2.5 text-sm font-bold text-[var(--on-bright)] disabled:opacity-40">确认散功</button>
              <button type="button" onClick={() => { setResetStage(0); setResetPhrase(""); }} className="flex-1 rounded-full bg-[var(--surface2)] px-4 py-2.5 text-sm font-bold">取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
