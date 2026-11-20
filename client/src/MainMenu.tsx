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
// 顶部）。题屏美术（2026-11-18 用户选定「忘川彼岸」）：竖版水墨图
//（奈何桥、孟婆汤摊、朱红彼岸花，上半部大面积宣纸留白）作全屏
// 背景 cover 铺满题屏，原纯 CSS/SVG 代码动画山水场景已撤。背景图
// 是固定美术、不随主题变：标题书法体五字横排居中、落在画面上半
// 部留白区（2026-11-18 用户反馈由竖排改回横排；顶部一层极淡纸
// 色渐变衬底兜底宽屏裁切时的可读性），标题右侧一枚朱砂小印点
// 缀；菜单按钮是窄纸笺条——纸色 0.35 不透明 + 背景模糊 14px
//（2026-11-18 用户两轮实测：八成底与实心无异、五成半仍嫌不
// 够透，故再降到 0.35 让背后的水面/花丛明显透出，悬停 0.52、
// 按下 0.68 逐档加深）+ 细墨边 + 固定墨字（字下纸晕
// text-shadow 略加厚兜底对比度，不靠回升底色），竖列靠左
// 排在左下桥下水面一带（与桥构图呼应、避开右下主题悬浮钮），
// 列背后另有一层自下而上渐隐的极轻纸色渐变托底；面板（详情/
// 说明/确认）仍用近实宣纸底保密度文字可读；深浅两主题下都按
// 同一套纸面配色读（内容层局部覆盖 --dim 为纸面上的次级墨
// 色）。object-position 锚定：竖屏 50% 85%、宽屏 50% 72%——
// cover 裁切时桥、汤摊与彼岸花主体都留在画面内，只让上半部留
// 白被裁。
// 题屏滚动锁定（2026-11-18 用户实测 bug 修复）：题屏是整幅画的
// 固定画面，必须完全不可滚动——根容器 fixed inset-0 + h-100dvh
// + overflow hidden 脱离文档流（不再撑高页面），App 在菜单期间
// 另锁 html/body 的 overflow 与 overscroll；矮屏放不下时不靠滚
// 动解决，theme.css 里按视口高度分三档压缩（>740px 常规 /
// ≤740px / ≤660px：标题字号、按钮内距与间距、上下留白逐档收），
// 保证 360×640 量级下六个按钮与状态行一屏完整可见。面板（存档
// 详情/退出说明/散功二级确认）改作底部浮层卡：展开时盖在按钮
// 列上方，不再把内容顶出屏外，卡内按钮即可关闭/继续。

// 散功执行口径（2026-11-20 bug 修复）：点「确认散功」后弹窗不
// 抢先关闭——等服务端返回：成功则 App 跳规则设定页、菜单整体
// 卸载；失败则弹窗保持打开、短语不清空、弹窗内明示可直接重试。
// 此前是点完立刻关窗，失败提示被全屏菜单盖住、存档没清也无从
// 重试，表现为「输完不后悔却开不了新游戏」。

import { useState, type CSSProperties } from "react";
import type { State } from "./types";
import { Seal, ageTextOf } from "./widgets";
import menuBg from "./assets/menu-bg.webp";

const FIELD = "w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";
const CARD = "rounded-[var(--radius)] border border-[rgba(38,32,25,0.30)] bg-[rgba(247,241,222,0.94)] p-4 shadow-sm backdrop-blur-[3px]";

function MenuItem({ seal, label, hint, disabled, onClick }: {
  seal: string; label: string; hint?: string; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} aria-label={hint ? `${label}：${hint}` : label}
      className="menu-item flex w-full items-center gap-3 rounded-[var(--radius)] border border-[rgba(38,32,25,0.45)] bg-[rgba(247,241,222,0.35)] px-4 py-2.5 text-left shadow-sm backdrop-blur-[14px] transition enabled:hover:bg-[rgba(247,241,222,0.52)] enabled:active:scale-[0.99] enabled:active:bg-[rgba(243,229,189,0.68)] disabled:opacity-45">
      <span className="text-xl leading-none"><Seal ch={seal} /></span>
      <span className="min-w-0 flex-1" style={{ textShadow: "0 0 8px rgba(247,241,222,0.85), 0 0 3px rgba(247,241,222,0.9)" }}>
        <span className="menu-item-label block font-song text-base font-black text-[#262019]">{label}</span>
        {hint && <span className="menu-item-hint block truncate text-xs text-[#57493a]">{hint}</span>}
      </span>
      <span aria-hidden="true" className="shrink-0 text-lg text-[#57493a]" style={{ textShadow: "0 0 8px rgba(247,241,222,0.85)" }}>›</span>
    </button>
  );
}

export function MainMenu({ state, tripleConfirm, resetting, resetFailed, onClearResetError, onContinue, onNewGameDirect, onNewGameReset, onOpenRules, onOpenSettings }: {
  state: State;
  tripleConfirm: boolean;
  resetting: boolean;
  // 上一次散功调用失败（重试耗尽后）：确认弹窗内明示、原地可重试。
  resetFailed: boolean;
  onClearResetError: () => void;
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
    onClearResetError();
    if (!hasSave) { onNewGameDirect(); return; }
    setPanel("none");
    setResetStage(1);
  };
  const confirmResetStage1 = () => {
    if (tripleConfirm) { setResetPhrase(""); setResetStage(2); }
    // 关掉三级确认时直接执行：确认卡保持打开直到成功（App 跳转
    // 卸载菜单）或失败（卡内明示重试），不抢先关闭。
    else onNewGameReset();
  };

  return (
    <div className="menu-screen fade-slide-in fixed inset-0 z-30 h-[100dvh] overflow-hidden bg-[#e9e0cb]">
      {/* 题屏美术背景：「忘川彼岸」全视口 cover（桌面宽屏同样
          全幅；加载前以近纸色兜底）。object-position 响应式锚定：
          竖屏 85%、宽屏 72%——宽屏纵向裁切时桥、汤摊与中上部彼岸
          花簇都留在画面内。菜单切页即卸载，不影响其他页面。 */}
      <img src={menuBg} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[50%_85%] min-[640px]:object-[50%_72%]" />
      {/* 标题区纸色雾衬：极淡纸色渐变托底，宽屏下题字与状态行落到
          桥面/雾岸上时仍可读（无边框无阴影，淡到不抢画）。 */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[55%] bg-[linear-gradient(to_bottom,rgba(247,241,222,0.66),rgba(247,241,222,0.42)_45%,rgba(247,241,222,0))]" />
      {/* 按钮列托底：下半部极轻纸色渐变，只为半透明按钮衬字，
          自下而上渐隐，不盖画。 */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[48%] bg-[linear-gradient(to_top,rgba(247,241,222,0.30),rgba(247,241,222,0.12)_55%,rgba(247,241,222,0))]" />
      <div className="menu-pad relative mx-auto flex h-full w-full max-w-md flex-col px-5 pb-6 pt-8 text-[#262019]"
        style={{ "--dim": "#6f6250" } as CSSProperties}>
        {/* 标题横排居中落在画面上半部留白区（标题即本屏内容本身）：
            五字书法体横排 + 标题右侧一枚朱砂小印，状态行居中随题。 */}
        <div>
          <div className="menu-title-col flex items-start justify-center gap-2.5">
            <h1 className="menu-title pb-2 text-center font-brush text-[40px] font-black tracking-[0.08em] text-[#262019]">不喝孟婆汤</h1>
            <span className="mt-2 text-base leading-none"><Seal ch="轮" /></span>
          </div>
          <p className="menu-status mt-2.5 text-center text-sm text-[#5c5142]" role="status"><span className="inline-block rounded-full bg-[rgba(247,241,222,0.55)] px-3 py-1 backdrop-blur-[3px]">{statusLine}</span></p>
        </div>

        {/* 菜单按钮：窄纸笺条竖列靠左排布，压在画面左下桥下水面
            一带（与桥的构图呼应），右侧留给汤摊与花丛；靠左同时
            天然避开右下角主题悬浮钮的横向占用带。间距拉开、留白。 */}
        <div className="menu-buttons mr-auto mt-auto flex w-64 flex-col gap-3 pt-6">
        <MenuItem seal="新" label="新游戏" onClick={startNewGame}
          hint={hasSave ? "清空存档，先定规则再开始" : "先定整局规则，再开始第一世"} />
        {hasSave && (
          <MenuItem seal="续" label="继续游戏" onClick={onContinue}
            hint={c ? `第 ${c.lifeNo} 世 · ${realmText} · ${locName}` : "新一世待降生"} />
        )}
        <MenuItem seal="读" label="读取存档" disabled={!hasSave} onClick={() => setPanel(panel === "load" ? "none" : "load")}
          hint={hasSave ? "先看详情，再决定是否继续" : "暂无存档"} />
        <MenuItem seal="规" label="游戏规则" onClick={onOpenRules} hint="只读查看本局的 19 条规则" />
        <MenuItem seal="设" label="设置" onClick={onOpenSettings} hint="AI 陪跑 / 显示偏好 / 存档管理" />
        <MenuItem seal="退" label="退出游戏" onClick={() => setPanel(panel === "exit" ? "none" : "exit")}
          hint="网页版关闭页面即退出" />
      </div>

      {/* 面板浮层：存档详情 / 退出说明 / 散功二级确认统一从底部
          浮起盖在按钮列上方（题屏不可滚动，面板不能再把内容往下
          顶）；卡内自带取消/继续/知道了，关掉即回按钮列。 */}
      {(resetStage === 1 || (panel === "load" && hasSave) || panel === "exit") && (
      <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-4">
      <div className="w-full max-w-md">
      {/* 新游戏二级确认 */}
      {resetStage === 1 && (
        <div className={CARD} role="alert">
          <p className="text-sm font-bold text-[#b3402e]">新游戏会先散功重开：清空角色、全部前世与编年史（报错记录保留），确定？</p>
          {resetFailed && !tripleConfirm && (
            <p className="mt-2 text-xs font-bold text-[#b3402e]">散功没成功，存档还没有清空——多半是网络抖动。再点一次「确认散功」重试。</p>
          )}
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={resetting} onClick={confirmResetStage1}
              className="flex-1 rounded-full bg-[#b3402e] px-4 py-2.5 text-sm font-bold text-[#f7f1de] disabled:opacity-40">{resetting && !tripleConfirm ? "散功中…" : "确认散功"}</button>
            <button type="button" disabled={resetting} onClick={() => { setResetStage(0); onClearResetError(); }} className="flex-1 rounded-full bg-[rgba(38,32,25,0.08)] px-4 py-2.5 text-sm font-bold disabled:opacity-40">取消</button>
          </div>
        </div>
      )}

      {/* 读取存档：存档详情 + 继续 */}
      {panel === "load" && hasSave && (
        <section aria-label="存档详情" className={CARD}>
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
        <section aria-label="退出游戏说明" className={CARD}>
          <h2 className="font-brush text-base font-black"><Seal ch="退" /> 退出游戏</h2>
          {hasSave ? (
            <p className="mt-2 text-sm leading-relaxed">网页版没有单独的退出动作：<b>关闭本页面即退出</b>，进度已自动保存在存档里，下次打开从主菜单「继续游戏」接着玩。游戏内点「返回主菜单」可以回到这里。</p>
          ) : (
            <p className="mt-2 text-sm leading-relaxed">网页版没有单独的退出动作：<b>关闭本页面即退出</b>。当前没有存档；还没创建完成的角色不会保存，退出就当退出了，下次从「新游戏」重新开始。</p>
          )}
          <button type="button" onClick={() => setPanel("none")} className="mt-3 w-full rounded-full bg-[rgba(38,32,25,0.08)] px-4 py-2.5 text-sm font-bold">知道了</button>
        </section>
      )}
      </div>
      </div>
      )}
      </div>

      {/* 散功三级确认弹窗：与设置页存档栏同一口径（弹窗在纸面内容层之外，走主题色） */}
      {resetStage === 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="散功重开最终确认">
          <div className="w-full max-w-sm rounded-[var(--radius)] bg-[var(--surface)] p-5 shadow-xl">
            <h3 className="font-brush text-base font-black text-[var(--red)]"><Seal ch="戒" /> 最后一步：散功重开</h3>
            <p className="mt-2 text-sm leading-relaxed">散功重开会清空角色、全部前世与编年史（报错记录保留），且<b>无法撤销</b>。真要散功开始新游戏，在下方输入「不后悔」三个字，再点确认。</p>
            <label htmlFor="menu-reset-phrase" className="mb-1.5 mt-4 block text-xs font-bold text-[var(--dim)]">输入「不后悔」以解锁确认</label>
            <input id="menu-reset-phrase" type="text" value={resetPhrase} onChange={(e) => setResetPhrase(e.target.value)}
              placeholder="不后悔" autoComplete="off" autoFocus disabled={resetting}
              className={FIELD} />
            {resetFailed && (
              <p className="mt-3 text-sm font-bold text-[var(--red)]" role="alert">散功没成功，存档还没有清空——多半是刚才网络抖动。输入不用重打，直接再点「确认散功」重试。</p>
            )}
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={resetting || resetPhrase.trim() !== "不后悔"}
                onClick={() => onNewGameReset()}
                className="flex-1 rounded-full bg-[var(--red)] px-4 py-2.5 text-sm font-bold text-[var(--on-bright)] disabled:opacity-40">{resetting ? "散功中…" : "确认散功"}</button>
              <button type="button" disabled={resetting} onClick={() => { setResetStage(0); setResetPhrase(""); onClearResetError(); }} className="flex-1 rounded-full bg-[var(--surface2)] px-4 py-2.5 text-sm font-bold disabled:opacity-40">取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
