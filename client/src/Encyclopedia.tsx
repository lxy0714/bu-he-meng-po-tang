// 百科视图：全游戏速查内容的集中页——判定记号全文、九境门槛、记忆保留、
// 轮回继承、好感档位、丹药与洞府。内容全部搬自现有已定稿的规则页速查卡、
// Q1–Q18 规则文案与服务端配置表（checks.ts / data.ts / GameBoard 档位函数），
// 逐字一致，不新编数字与规则；这里只放说明、没有可改选项，改规则不影响本页。
//
// 交互：分小节、可折叠（展开状态存 localStorage 记住）；顶部搜索搜小节
// 标题与正文，命中高亮，搜索时自动展开含结果的小节、无结果给出提示。

import { useMemo, useState, type ReactNode } from "react";
import { Seal } from "./widgets";

// ---------- 搜索命中高亮（与规则页同款） ----------

function Hl({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const needle = q.toLowerCase();
  const parts: ReactNode[] = [];
  let rest = text;
  let restLower = text.toLowerCase();
  let k = 0;
  for (;;) {
    const i = restLower.indexOf(needle);
    if (i < 0) { parts.push(rest); break; }
    if (i > 0) parts.push(rest.slice(0, i));
    parts.push(
      <mark key={k++} className="rounded-[3px] px-0.5" style={{ backgroundColor: "#f2cf5b", color: "#262019" }}>
        {rest.slice(i, i + needle.length)}
      </mark>,
    );
    rest = rest.slice(i + needle.length);
    restLower = restLower.slice(i + needle.length);
    if (!rest) break;
  }
  return <>{parts}</>;
}

// ---------- 小节定义 ----------
// text 是该节全部正文的纯文本拼接（供搜索匹配）；render 渲染同一份文案。

interface Section {
  id: string;
  icon: string;
  title: string;
  text: string;
  render: (q: string) => ReactNode;
}

const P = "mt-2 text-sm leading-relaxed";
const UL = "mt-2 space-y-1.5 text-sm leading-relaxed";
const TH = "px-2 py-1.5 text-left font-song text-xs font-black";
const TD = "px-2 py-1.5 text-sm";

// 九境境界梯（data.ts CLASSIC_REALMS）与突破门槛公式（checks.ts：
// 60 + 境界×45 + 小阶×15，境界/小阶从 0 数起），门槛值由公式算出。
const REALMS: { name: string; lifespan: number; hp: number; mp: number }[] = [
  { name: "炼气", lifespan: 120, hp: 60, mp: 50 },
  { name: "筑基", lifespan: 200, hp: 95, mp: 95 },
  { name: "金丹", lifespan: 350, hp: 140, mp: 160 },
  { name: "元婴", lifespan: 600, hp: 195, mp: 250 },
  { name: "化神", lifespan: 1000, hp: 265, mp: 390 },
  { name: "炼虚", lifespan: 1600, hp: 350, mp: 560 },
  { name: "合体", lifespan: 2600, hp: 460, mp: 800 },
  { name: "大乘", lifespan: 4000, hp: 600, mp: 1150 },
  { name: "渡劫", lifespan: 6000, hp: 780, mp: 1600 },
];
const STAGE_NAMES = ["初期", "中期", "后期", "大圆满"];
const thresholdFor = (realmIdx: number, stageIdx: number) => 60 + realmIdx * 45 + stageIdx * 15;

const SECTIONS: Section[] = [
  {
    id: "notation",
    icon: "骰",
    title: "判定记号（Q34 分系统骰面）",
    text: [
      "判定记号统一写作：1dS[下限~上限]+修正 vs 难度（Q34，2026-11-14 取代 Q8 的全游戏 1d150）。S 是所属系统的基础骰面：斗法/决斗/复仇 d20、突破 d100、探索 d80、副职 d60、社交 d40、宗门差事 d50、记忆保留 d100（百分比掷点）。",
      "动态范围 [下限~上限]：每次掷骰的实际范围由该系统相关属性现算——斗法 1+战力/5 ~ 20+战力/2（战力 20 就掷 5~30）；突破 1+境界×2 ~ 100+机缘；探索 1+机缘/5 ~ 80+机缘/2；副职 1+副职等级×3 ~ 60+神识/2（副职等级 = U-482 熟练度等级：四门副职各练各的，练 5/15/30 次破限至熟手/精通/宗师，破限还解锁成功收益 +10%/+20%/+35%）；社交 1+好感/10 ~ 40+机缘/2；差事 1+宗门位阶×2 ~ 50+体魄/2。下限是保底：强者掷不出太烂的结果；上限是天花板：实力与气运越强，运气上限越高。",
      "怎么读：首页与编年史里每次判定都记同一行审计文本，如斗法「1d20[5~30] 掷出 17 + 战力 0 = 17 vs 难度 12」——在 5~30 里掷出 17；战力已经撑起骰面范围，所以修正里不再重复计战力（防重复计算），只计承世玉、情境加成等。",
      "难度按相对差距重标：每个检定的基准难度（按目标档位定：敌手境界、突破门槛、NPC 境界、机缘品阶、丹药/法器品阶、差事要求）先按「玩家能力 vs 目标档位」的差距算出在旧标尺下的成功率，再等概率换算到本系统骰面——同境界同属性下成功率与 d150 时代一致；境界高了，碰到的敌手与机缘档位也同步跟上，不会一路碾压。社交难度按双方境界差：对方高你一境 +8、低你一境 −8。探索里气运高可能引来高品阶机缘，难度按境界差上调，机缘可抵消一部分。",
      "成败等级（按现有规则，不另设大成功/大失败）：总值 ≥ 难度 = 成功，总值 < 难度 = 失败；难度 ≤ 0 时不掷骰、自动成功。胜势差 = 总值 − 难度，斗法结算按归一化回旧标尺的胜势差浮动赏罚，幅度与旧时一致。",
      "双掷记号 2dS[下限~上限]L / H（优势 / 劣势，按各系统骰面）：在本次动态范围内掷两颗、只取其中一颗——L 是优势：舍弃低的那颗（Low），取高的；H 是劣势：舍弃高的那颗（High），取低的。审计文本会把两颗都写出来并标明取舍，如「2d20[5~30]L 掷出 17、29（优势：舍弃低的 17，取高的 29） + 战力 0 = 29 vs 难度 12」。",
      "双掷什么时候用：只在某条规则自己写明「此判定带优势 / 劣势」时才用双掷，触发条件由那条规则定，记号本身不给任何加成；没写明的判定仍掷普通单骰。现有的属性、法宝等固定加成仍按下面「修正的固定顺序」处理，不改成双掷。",
      "记忆保留（d100）：轮回时掷 1~100，≤ 保留率×100 即保留上一世记忆——保留率仍按 Q12（坐化 30% / 战死 10% / 横死 0% + 每境 5%，封顶 50%），百分比口径不变。",
      "修正的固定顺序（每次判定都按这个顺序叠加）",
      "属性：本次检定的属性——战力 / 神识 / 机缘 / 体魄（已含对应天赋加成）；若该属性正是撑起本系统骰面范围的那个，它计入骰面、不再进修正（明细里会写明）。",
      "承世玉：每层 +2。",
      "额外加成：情境加成合并为一项——副职与事件的天赋/情境加成、突破的业力与破境助力等都在这一项里。",
      "modifier 链（掷骰前调整）：按链上顺序叠加，目前链上只有突破保底——它扣的是难度：连败几次就扣几次 ×5，封顶 −20（成功清零、失败 +1 次）。",
      "四步算完后在本系统动态范围内掷骰，总值 = 骰值 + 修正合计，再与（换算并经保底调整后的）难度比较。首页骰子卡上的「修正构成」与编年史的「判定明细」都按这个顺序展示，对不上就是有问题。",
    ].join("\n"),
    render: (q) => (
      <>
        <p className={P}>
          <Hl text="判定记号统一写作：" q={q} /><b className="font-song">1dS[下限~上限]+修正 vs 难度</b><Hl text="（Q34，2026-11-14 取代全游戏 1d150）。S 是所属系统的基础骰面：斗法/决斗/复仇 " q={q} /><b className="font-song">d20</b><Hl text="、突破 " q={q} /><b className="font-song">d100</b><Hl text="、探索 " q={q} /><b className="font-song">d80</b><Hl text="、副职 " q={q} /><b className="font-song">d60</b><Hl text="、社交 " q={q} /><b className="font-song">d40</b><Hl text="、宗门差事 " q={q} /><b className="font-song">d50</b><Hl text="、记忆保留 " q={q} /><b className="font-song">d100</b><Hl text="（百分比掷点）。带优势 / 劣势的判定把主记号换成下面的双掷记号。" q={q} />
        </p>
        <ul className={UL}>
          <li><b>动态范围 [下限~上限]：</b><Hl text="每次掷骰的实际范围由该系统相关属性现算——斗法 1+战力/5 ~ 20+战力/2（战力 20 就掷 5~30）；突破 1+境界×2 ~ 100+机缘；探索 1+机缘/5 ~ 80+机缘/2；副职 1+副职等级×3 ~ 60+神识/2（副职等级 = U-482 熟练度等级：四门副职各练各的，练 5/15/30 次破限至熟手/精通/宗师，破限还解锁成功收益 +10%/+20%/+35%）；社交 1+好感/10 ~ 40+机缘/2；差事 1+宗门位阶×2 ~ 50+体魄/2。下限是保底：强者掷不出太烂的结果；上限是天花板：实力与气运越强，运气上限越高。" q={q} /></li>
          <li><b>怎么读：</b><Hl text="首页与编年史里每次判定都记同一行审计文本，如斗法「1d20[5~30] 掷出 17 + 战力 0 = 17 vs 难度 12」——在 5~30 里掷出 17；战力已撑起骰面范围，修正里不再重复计（防重复计算），只计承世玉与情境加成。" q={q} /></li>
          <li><b>难度按相对差距重标：</b><Hl text="基准难度按目标档位定（敌手境界、突破门槛、NPC 境界、机缘品阶、丹药/法器品阶、差事要求），先按「玩家能力 vs 目标档位」的差距算出旧标尺成功率，再等概率换算到本系统骰面——同境界同属性下成功率与 d150 时代一致；境界高了，敌手与机缘档位同步跟上，不会一路碾压。社交按双方境界差：对方高你一境难度 +8、低你一境 −8。探索里气运高可能引来高品阶机缘，难度按境界差上调，机缘可抵消一部分。" q={q} /></li>
          <li><b>成败等级（按现有规则，不另设大成功/大失败）：</b><Hl text="总值 ≥ 难度 = 成功，总值 < 难度 = 失败；难度 ≤ 0 时不掷骰、自动成功。胜势差 = 总值 − 难度，斗法结算按归一化回旧标尺的胜势差浮动赏罚，幅度与旧时一致。" q={q} /></li>
          <li><b>双掷记号 2dS[下限~上限]L / H（优势 / 劣势）：</b><Hl text="在本次动态范围内掷两颗、只取其中一颗——后缀 L 是优势：舍弃低的那颗（Low），取高的；后缀 H 是劣势：舍弃高的那颗（High），取低的。审计文本会把两颗都写出来并标明取舍，如「2d20[5~30]L 掷出 17、29（优势：舍弃低的 17，取高的 29） + 战力 0 = 29 vs 难度 12」。" q={q} /></li>
          <li><b>双掷什么时候用：</b><Hl text="只在某条规则自己写明「此判定带优势 / 劣势」时才用双掷，触发条件由那条规则定，记号本身不给任何加成；没写明的判定仍掷普通单骰。现有的属性、法宝等固定加成仍按下面「修正的固定顺序」处理，不改成双掷。" q={q} /></li>
          <li><b>记忆保留（d100）：</b><Hl text="轮回时掷 1~100，≤ 保留率×100 即保留上一世记忆——保留率仍按 Q12（坐化 30% / 战死 10% / 横死 0% + 每境 5%，封顶 50%），百分比口径不变。" q={q} /></li>
        </ul>
        <p className="mt-3 text-sm font-bold"><Hl text="修正的固定顺序（每次判定都按这个顺序叠加）" q={q} /></p>
        <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-sm leading-relaxed">
          <li><b>属性</b><Hl text="：本次检定的属性——战力 / 神识 / 机缘 / 体魄（已含对应天赋加成）；若该属性正是撑起本系统骰面范围的那个，它计入骰面、不再进修正（明细里会写明）。" q={q} /></li>
          <li><b>承世玉</b><Hl text="：每层 +2。" q={q} /></li>
          <li><b>额外加成</b><Hl text="：情境加成合并为一项——副职与事件的天赋/情境加成、突破的业力与破境助力等都在这一项里。" q={q} /></li>
          <li><b>modifier 链（掷骰前调整）</b><Hl text="：按链上顺序叠加，目前链上只有" q={q} /><b>突破保底</b><Hl text="——它扣的是难度：连败几次就扣几次 ×5，封顶 −20（成功清零、失败 +1 次）。" q={q} /></li>
        </ol>
        <p className="mt-2 text-xs leading-relaxed text-[var(--dim)]"><Hl text="四步算完后在本系统动态范围内掷骰，总值 = 骰值 + 修正合计，再与（换算并经保底调整后的）难度比较。首页骰子卡上的「修正构成」与编年史的「判定明细」都按这个顺序展示，对不上就是有问题。" q={q} /></p>
      </>
    ),
  },
  {
    id: "realms",
    icon: "境",
    title: "九境门槛表",
    text: [
      "经典九境：炼气→筑基→金丹→元婴→化神→炼虚→合体→大乘→渡劫，每境四阶（初期 / 中期 / 后期 / 大圆满）。（Q4 另有「精简五境」可选：炼气→筑基→金丹→元婴→化神。）",
      ...REALMS.map((r, i) => `${r.name} 寿元 ${r.lifespan} 气血 ${r.hp} 灵力 ${r.mp} 突破门槛 ${STAGE_NAMES.map((s, j) => `${s} ${thresholdFor(i, j)}`).join(" ")}`),
      "突破门槛（本阶修为需达）：60 + 境界×45 + 小阶×15（境界、小阶均从 0 数起）。修为没达到门槛不能突破。",
      "突破难度公式：难度 = 118 + 境界×6；守心如玉 −10、有师父护法 −8（掷骰前难度调整）；连败保底扣难度：连败几次就扣几次 ×5，封顶 −20（成功清零、失败 +1 次）。修正额外加成 = 业力/5（向下取整）+ 破关如喝水 +10 + 破境助力。",
    ].join("\n"),
    render: (q) => (
      <>
        <p className={P}><Hl text="经典九境：炼气→筑基→金丹→元婴→化神→炼虚→合体→大乘→渡劫，每境四阶（初期 / 中期 / 后期 / 大圆满）。（Q4 另有「精简五境」可选：炼气→筑基→金丹→元婴→化神。）" q={q} /></p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--dim)]">
                <th className={TH}>境界</th>
                <th className={TH}>寿元</th>
                <th className={TH}>气血</th>
                <th className={TH}>灵力</th>
                <th className={TH}>突破门槛（初期 / 中期 / 后期 / 大圆满）</th>
              </tr>
            </thead>
            <tbody>
              {REALMS.map((r, i) => (
                <tr key={r.name} className="border-b border-[var(--border)] last:border-0">
                  <td className={`${TD} font-song font-bold`}><Hl text={r.name} q={q} /></td>
                  <td className={TD}>{r.lifespan}</td>
                  <td className={TD}>{r.hp}</td>
                  <td className={TD}>{r.mp}</td>
                  <td className={TD}>{STAGE_NAMES.map((_, j) => thresholdFor(i, j)).join(" / ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className={UL}>
          <li><b>突破门槛（本阶修为需达）：</b><Hl text="60 + 境界×45 + 小阶×15（境界、小阶均从 0 数起）。修为没达到门槛不能突破。" q={q} /></li>
          <li><b>突破难度公式：</b><Hl text="难度 = 118 + 境界×6；守心如玉 −10、有师父护法 −8（掷骰前难度调整）；连败保底扣难度：连败几次就扣几次 ×5，封顶 −20（成功清零、失败 +1 次）。修正额外加成 = 业力/5（向下取整）+ 破关如喝水 +10 + 破境助力。" q={q} /></li>
        </ul>
      </>
    ),
  },
  {
    id: "memory",
    icon: "忆",
    title: "记忆保留（Q12）",
    text: [
      "坐化三成 · 战死一成 · 横死不留 · 每境 +半成 · 上限五成。",
      "保留率 = 死法基础（坐化 30% / 战死 10% / 横死 0%）+ 境界序号 ×5% + 天赋「宿慧深种」10%，封顶 50%。",
      "境界每高一境（境界序号）多留半成；走火入魔 = 魂飞魄散：记忆全失、本命法宝碎裂（2026-11-11 按推荐定）。",
      "死于走火入魔 = 魂飞魄散：记忆全失，本命法宝碎裂（赎回的法宝也不带走）。",
    ].join("\n"),
    render: (q) => (
      <>
        <p className={P}><b><Hl text="坐化三成 · 战死一成 · 横死不留 · 每境 +半成 · 上限五成" q={q} /></b></p>
        <ul className={UL}>
          <li><b>保留率公式：</b><Hl text="死法基础（坐化 30% / 战死 10% / 横死 0%）+ 境界序号 ×5% + 天赋「宿慧深种」10%，封顶 50%。" q={q} /></li>
          <li><Hl text="境界每高一境（境界序号）多留半成；走火入魔 = 魂飞魄散：记忆全失、本命法宝碎裂（2026-11-11 按推荐定）。" q={q} /></li>
          <li><Hl text="死于走火入魔 = 魂飞魄散：记忆全失，本命法宝碎裂（赎回的法宝也不带走）。" q={q} /></li>
        </ul>
      </>
    ),
  },
  {
    id: "inheritance",
    icon: "轮",
    title: "轮回继承（Q3）",
    text: [
      "死亡即轮回 · 记忆按死法判定 · 传承点赎回保留 · 修为留一成。",
      "修为按境界打折只留一成；保留之物（法宝/功法/遗藏）要用传承点赎回，点数不够就得取舍。",
      "本命法宝带一件走：第一世没有，死后从本世所得中挑一件。第一世赤手空拳；首次轮回时从本世所得里挑一件作本命法宝带走，之后每世可换。",
      "用传承点赎回保留（法宝、功法各限一件，遗藏不限；点数不够就得取舍）。未赎回的法宝、功法将留在这一世；未取回的遗藏仍在原地等后世。",
    ].join("\n"),
    render: (q) => (
      <>
        <p className={P}><b><Hl text="死亡即轮回 · 记忆按死法判定 · 传承点赎回保留 · 修为留一成" q={q} /></b></p>
        <ul className={UL}>
          <li><b>修为只留一成：</b><Hl text="修为按境界打折只留一成；保留之物（法宝/功法/遗藏）要用传承点赎回，点数不够就得取舍。" q={q} /></li>
          <li><b>本命法宝带一件走：</b><Hl text="第一世没有，死后从本世所得中挑一件。第一世赤手空拳；首次轮回时从本世所得里挑一件作本命法宝带走，之后每世可换。" q={q} /></li>
          <li><b>传承点赎回：</b><Hl text="用传承点赎回保留（法宝、功法各限一件，遗藏不限；点数不够就得取舍）。未赎回的法宝、功法将留在这一世；未取回的遗藏仍在原地等后世。" q={q} /></li>
        </ul>
      </>
    ),
  },
  {
    id: "bond",
    icon: "缘",
    title: "好感档位与五种关系",
    text: [
      "五种关系（道侣/师父/徒弟/道友/仇敌），关系由事件成败与「广交道友」自然产生。",
      "好感（情谊 / 仇怨）范围 0–100。友好关系看情谊：80 以上 生死之交，55 以上 莫逆之交，30 以上 相知，其余 泛泛之交。仇敌看仇怨：70 以上 不共戴天，45 以上 深仇大恨，20 以上 结怨，其余 小隙。",
      "常驻效果：道侣修炼 +12%、师父突破难度 −8、徒弟给进项、仇敌仇怨 ≥30 会寻仇堵人（探索时 30% 触发）。",
      "互动：拜访/双修/请教/指点/赠礼/决斗/和解。",
    ].join("\n"),
    render: (q) => (
      <>
        <p className={P}><Hl text="五种关系（道侣/师父/徒弟/道友/仇敌），关系由事件成败与「广交道友」自然产生。好感（情谊 / 仇怨）范围 0–100。" q={q} /></p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--dim)]">
                <th className={TH}>关系</th>
                <th className={TH}>数值</th>
                <th className={TH}>档位</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[var(--border)]">
                <td className={`${TD} font-song font-bold`} rowSpan={4}><Hl text="友好（情谊）" q={q} /></td>
                <td className={TD}>≥ 80</td>
                <td className={TD}><Hl text="生死之交" q={q} /></td>
              </tr>
              <tr className="border-b border-[var(--border)]"><td className={TD}>≥ 55</td><td className={TD}><Hl text="莫逆之交" q={q} /></td></tr>
              <tr className="border-b border-[var(--border)]"><td className={TD}>≥ 30</td><td className={TD}><Hl text="相知" q={q} /></td></tr>
              <tr className="border-b border-[var(--border)]"><td className={TD}>其余</td><td className={TD}><Hl text="泛泛之交" q={q} /></td></tr>
              <tr className="border-b border-[var(--border)]">
                <td className={`${TD} font-song font-bold`} rowSpan={4}><Hl text="仇敌（仇怨）" q={q} /></td>
                <td className={TD}>≥ 70</td>
                <td className={TD}><Hl text="不共戴天" q={q} /></td>
              </tr>
              <tr className="border-b border-[var(--border)]"><td className={TD}>≥ 45</td><td className={TD}><Hl text="深仇大恨" q={q} /></td></tr>
              <tr className="border-b border-[var(--border)]"><td className={TD}>≥ 20</td><td className={TD}><Hl text="结怨" q={q} /></td></tr>
              <tr><td className={TD}>其余</td><td className={TD}><Hl text="小隙" q={q} /></td></tr>
            </tbody>
          </table>
        </div>
        <ul className={UL}>
          <li><b>常驻效果：</b><Hl text="道侣修炼 +12%、师父突破难度 −8、徒弟给进项、仇敌仇怨 ≥30 会寻仇堵人（探索时 30% 触发）。" q={q} /></li>
          <li><b>互动：</b><Hl text="拜访/双修/请教/指点/赠礼/决斗/和解。" q={q} /></li>
        </ul>
      </>
    ),
  },
  {
    id: "shop",
    icon: "丹",
    title: "丹药与洞府",
    text: [
      "坊市商店三丹：回春丹 基准价 30，服用恢复 50% 气血。聚气丹 基准价 45，服用修为 +55。破境丹 基准价 80，服用后下一次突破检定 +15（可叠至 +30）。",
      "物价按境界分档：丹药基准价 × (1 + 境界序号 × 0.6)，境界越高物价越贵；洞府升级同理。",
      "听涛洞府聚灵阵三级升级：基准价 120 / 300 / 600（同按境界分档）；每级在此修炼 +3 修为/年；洞府随本世置办，轮回不带走。",
    ].join("\n"),
    render: (q) => (
      <>
        <div className="mt-1 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--dim)]">
                <th className={TH}>丹药</th>
                <th className={TH}>基准价</th>
                <th className={TH}>效果</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[var(--border)]">
                <td className={`${TD} font-song font-bold`}><Hl text="回春丹" q={q} /></td>
                <td className={TD}>30</td>
                <td className={TD}><Hl text="服用恢复 50% 气血。" q={q} /></td>
              </tr>
              <tr className="border-b border-[var(--border)]">
                <td className={`${TD} font-song font-bold`}><Hl text="聚气丹" q={q} /></td>
                <td className={TD}>45</td>
                <td className={TD}><Hl text="服用修为 +55。" q={q} /></td>
              </tr>
              <tr>
                <td className={`${TD} font-song font-bold`}><Hl text="破境丹" q={q} /></td>
                <td className={TD}>80</td>
                <td className={TD}><Hl text="服用后下一次突破检定 +15（可叠至 +30）。" q={q} /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <ul className={UL}>
          <li><b>物价按境界分档：</b><Hl text="丹药基准价 × (1 + 境界序号 × 0.6)，境界越高物价越贵；洞府升级同理。" q={q} /></li>
          <li><b>洞府聚灵阵：</b><Hl text="听涛洞府聚灵阵三级升级，基准价 120 / 300 / 600（同按境界分档）；每级在此修炼 +3 修为/年；洞府随本世置办，轮回不带走。" q={q} /></li>
        </ul>
      </>
    ),
  },
];

// ---------- 百科视图 ----------

const OPEN_KEY = "lunhui-encyclopedia-open-v1";

function loadOpen(): Set<string> {
  try {
    const raw = window.localStorage.getItem(OPEN_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as unknown;
      if (Array.isArray(arr)) {
        const valid = arr.filter((x): x is string => typeof x === "string" && SECTIONS.some((s) => s.id === x));
        if (valid.length > 0) return new Set(valid);
      }
    }
  } catch { /* localStorage 不可用时用默认 */ }
  return new Set(SECTIONS.map((s) => s.id));
}

function saveOpen(set: Set<string>) {
  try { window.localStorage.setItem(OPEN_KEY, JSON.stringify([...set])); } catch { /* 静默 */ }
}

export function Encyclopedia() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(loadOpen);
  const q = query.trim();
  const searching = q.length > 0;

  const visible = useMemo(() => {
    if (!searching) return SECTIONS;
    const needle = q.toLowerCase();
    return SECTIONS.filter((s) => `${s.title}\n${s.text}`.toLowerCase().includes(needle));
  }, [searching, q]);

  const toggle = (id: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      saveOpen(next);
      return next;
    });
  };

  const jumpTo = (id: string) => {
    if (!open.has(id)) {
      const next = new Set(open);
      next.add(id);
      saveOpen(next);
      setOpen(next);
    }
    requestAnimationFrame(() => {
      document.getElementById(`encyc-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <div>
      {/* sticky 顶栏：搜索 + 小节导航 */}
      <div className="sticky top-0 z-30 -mx-4 bg-[var(--bg)] px-4 pb-2 pt-1">
        <div className="rounded-[var(--radius)] bg-[var(--surface)] p-3 shadow-sm">
          <div className="relative">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索百科：判定记号、门槛、记忆、好感…"
              aria-label="搜索百科"
              className="w-full rounded-full border border-[var(--border)] bg-[var(--bg)] py-2 pl-4 pr-10 text-sm text-[var(--text)] outline-none placeholder:text-[var(--dim)] focus:border-[var(--gold)]"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="清除搜索"
                className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--surface2)] text-sm text-[var(--dim)]"
              >
                ✕
              </button>
            ) : (
              <span aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-brush text-[var(--dim)]">搜</span>
            )}
          </div>
          {searching && (
            <p className="mt-2 text-xs text-[var(--dim)]" role="status">
              {visible.length > 0 ? `命中 ${visible.length} 个小节，含结果的小节已自动展开。` : "无结果：没有小节匹配这个关键词。"}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5" role="navigation" aria-label="百科小节跳转">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => jumpTo(s.id)}
                className="rounded-full bg-[var(--surface2)] px-3 py-1.5 text-xs font-bold text-[var(--text)]"
              >
                <Seal ch={s.icon} /> <Hl text={s.title} q={q} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="mb-4 mt-1 rounded-[var(--radius)] bg-[var(--surface)] p-3 text-xs leading-relaxed text-[var(--dim)]">
        这里集中放全游戏的<b className="text-[var(--text)]">速查说明</b>：判定记号、境界门槛、记忆保留、轮回继承、好感档位、丹药与洞府。内容与游戏规则页、游戏内实际结算一致；本页只供查阅，要改规则请去「游戏规则」页。
      </p>

      {searching && visible.length === 0 && (
        <div className="mb-6 rounded-[var(--radius)] bg-[var(--surface)] p-6 text-center" role="status">
          <p className="font-song text-base font-bold">无结果</p>
          <p className="mt-1 text-sm text-[var(--dim)]">没有小节的标题或正文里包含「{q}」。</p>
          <button type="button" onClick={() => setQuery("")} className="mt-3 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold text-[var(--on-bright)]">清除搜索</button>
        </div>
      )}

      {visible.map((s) => {
        const expanded = searching ? true : open.has(s.id);
        return (
          <section key={s.id} id={`encyc-${s.id}`} aria-label={`百科小节：${s.title}`} style={{ scrollMarginTop: 190 }} className="mb-5 rounded-[var(--radius)] bg-[var(--surface)] p-4">
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={`${s.title}，${expanded ? "收起" : "展开"}`}
              onClick={() => { if (!searching) toggle(s.id); }}
              className="flex w-full items-center gap-2 text-left"
            >
              <span aria-hidden className="glyph-tile text-xl">{s.icon}</span>
              <span className="min-w-0 flex-1 font-brush text-lg font-black"><Hl text={s.title} q={q} /></span>
              <span aria-hidden className="shrink-0 text-base text-[var(--dim)]">{expanded ? "▾" : "▸"}</span>
            </button>
            {expanded && s.render(q)}
          </section>
        );
      })}
    </div>
  );
}
