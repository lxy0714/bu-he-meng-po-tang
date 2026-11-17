// 游戏规则定义（Q1–Q18，按玩法分组）与参考来源清单。

import type { SettingKey } from "./types";

// ---------- design tree definition ----------

export interface TreeOption { value: string; label: string; desc: string; recommended?: boolean }
export interface TreeNode { key: SettingKey; q: string; title: string; icon: string; syncNote: string; options: TreeOption[] }

export const TREE: TreeNode[] = [
  {
    key: "q1", q: "Q1", title: "谁来玩", icon: "人",
    syncNote: "同步：首页显示同行模式。",
    options: [
      { value: "solo", label: "单人 · GM 陪跑", desc: "就你一个人，系统当 GM，随时开随时停，设定随你改。", recommended: true },
      { value: "friends_later", label: "以后拉朋友", desc: "先记下这个意向，当前仍按单人盘推进，日后可扩多人。" },
    ],
  },
  {
    key: "q2", q: "Q2", title: "主角开局", icon: "芽",
    syncNote: "同步：新建角色的默认灵根与开局剧情；已有角色时下一世生效。",
    options: [
      { value: "waste_root", label: "废灵根凡人 + 封印的前世记忆", desc: "开局弱、成长空间大，轮回主题第一世就埋下。", recommended: true },
      { value: "mortal", label: "普通凡人", desc: "无封印记忆，属性均衡，从零修仙。" },
      { value: "reborn", label: "转世重修的大能", desc: "记忆全开，开局自带 90 点修为与额外灵石。" },
    ],
  },
  {
    key: "q3", q: "Q3", title: "轮回规则", icon: "轮",
    syncNote: "同步：下一次轮回结算的继承比例与记忆判定方式。",
    options: [
      { value: "recommended", label: "死亡即轮回 · 记忆按死法判定 · 传承点赎回保留 · 修为留一成", desc: "修为按境界打折只留一成；保留之物（法宝/功法/遗藏）要用传承点赎回，点数不够就得取舍。", recommended: true },
      { value: "memory_only", label: "只留记忆", desc: "记忆完整保留（不掷判定），修为清零，靠经验重头再来。" },
      { value: "artifact_only", label: "只留法宝", desc: "记忆必封印，只剩本命法宝认得你。" },
      { value: "generous", label: "宽松轮回 · 修为留三成", desc: "轮回惩罚最轻，滚雪球最快（记忆仍按 Q7 苛刻判定）。" },
    ],
  },
  {
    key: "q4", q: "Q4", title: "境界体系", icon: "境",
    syncNote: "同步：首页境界梯立刻换成所选体系，当前境界按新体系对齐。",
    options: [
      { value: "classic9", label: "经典九境", desc: "炼气→筑基→金丹→元婴→化神→炼虚→合体→大乘→渡劫，每境四阶。", recommended: true },
      { value: "short5", label: "精简五境", desc: "炼气→筑基→金丹→元婴→化神，更快摸到顶点。" },
    ],
  },
  {
    key: "q5", q: "Q5", title: "可视化范围", icon: "目",
    syncNote: "同步：首页按所选范围显示或收起地图与轮回树。",
    options: [
      { value: "all", label: "全部可视化", desc: "角色面板 + 轮回树 + 世界地图，全都上盘。", recommended: true },
      { value: "panel_tree", label: "角色面板 + 轮回树", desc: "收起世界地图，专注面板与轮回。" },
      { value: "panel_only", label: "只看角色面板", desc: "最精简：只有角色面板与行动。" },
    ],
  },
  {
    key: "q6", q: "Q6", title: "主角姓名与出身", icon: "骰",
    syncNote: "同步：每一世降生的姓名与出身生成方式；出身走三选一保留。",
    options: [
      { value: "random", label: "全部随机", desc: "姓名、出身都随机生成——每一世都是新的人生（2026-11-11 你定的）。", recommended: true },
      { value: "named", label: "姓名自定，出身随机", desc: "名字你来起，出身仍随机。" },
    ],
  },
  {
    key: "q7", q: "Q7", title: "记忆保留（苛刻版）", icon: "忆",
    syncNote: "同步：下一次轮回的记忆保留率与分层方式。",
    options: [
      { value: "strict", label: "苛刻版：按死法分档 + 记忆分层", desc: "第二轮定为坐化 50% / 战死 25% / 横死 10%（元婴 +15%，封顶 65%）；第三轮你又按推荐收紧，见 Q12——当前实际执行 Q12 的数值。", recommended: true },
      { value: "by_realm", label: "按境界判定（旧版·较宽松）", desc: "坐化全留、元婴以上全留、筑基/金丹七成、炼气四成。显式改选此项时它会真的生效、覆盖 Q12 的百分比；保持推荐项则按 Q12 执行。" },
    ],
  },
  {
    key: "q8", q: "Q8", title: "判定骰（已被 Q34 取代）", icon: "骰",
    syncNote: "同步：此条为历史定稿——2026-11-14 起实际执行 Q34 分系统骰面（见 Q34 条），本条仅作记录。",
    options: [
      { value: "d150", label: "1d150（历史）", desc: "掷 1 颗 150 面骰，加修正后与难度比（2026-11-11 定）。2026-11-14 你觉得所有判定都掷 d150 不合适，已被 Q34 分系统骰面取代，仅作记录。", recommended: true },
      { value: "d100", label: "1d100（未采用）", desc: "曾考虑的方案，已被 1d150 取代；选它目前仅作记录。" },
      { value: "d20", label: "1d20（第一版，未采用）", desc: "第一版用过，已被 1d150 取代；选它目前仅作记录。" },
    ],
  },
  {
    key: "q34", q: "Q34", title: "分系统骰面 · 动态上下限", icon: "骰",
    syncNote: "同步：全部检定即刻按本条结算——记号「1dS[下限~上限]+修正 vs 难度」，修正按固定顺序：属性（未被骰面吸收时）→ 承世玉 → 额外加成 → modifier 链（详见百科「判定记号」）。",
    options: [
      { value: "per_system_dynamic", label: "不同系统不同骰，上下限随属性动态适配", desc: "斗法/决斗/复仇 d20（1+战力/5 ~ 20+战力/2）、突破 d100（1+境界×2 ~ 100+机缘）、探索 d80（1+机缘/5 ~ 80+机缘/2）、副职 d60（1+副职等级×3 ~ 60+神识/2）、社交 d40（1+好感/10 ~ 40+机缘/2）、宗门差事 d50（1+位阶×2 ~ 50+体魄/2）、记忆保留 d100 百分比。难度按「玩家能力 vs 目标档位」的相对差距算并等概率重标：同境界同属性成功率与 d150 时代一致，境界高时敌手与事件档位同步跟上，不会一路碾压；社交按双方境界差、探索机缘按品阶与境界差（气运可抵消部分难度）。撑起骰面的属性不再重复进固定修正（2026-11-14 你定的，取代 Q8）。", recommended: true },
    ],
  },
  {
    key: "q9", q: "Q9", title: "本命法宝来源", icon: "剑",
    syncNote: "同步：选「开局自带」时，创建角色页直接挑一件法宝随身降生；轮回带走仍走传承点赎回。",
    options: [
      { value: "recommended", label: "第一世没有，死后从本世所得中挑一件", desc: "第一世赤手空拳；首次轮回时从本世所得里挑一件作本命法宝带走，之后每世可换（2026-11-11 按推荐定）。", recommended: true },
      { value: "from_start", label: "开局自带一件", desc: "第一世降生即选一件本命法宝（第一版旧规）。" },
    ],
  },
  {
    key: "q10", q: "Q10", title: "节奏难度", icon: "烈",
    syncNote: "同步：事件烈度、突破风险与高危地点。",
    options: [
      { value: "medium_hard", label: "中等偏虐", desc: "突破失败 15% 走火入魔当场陨落；镇魔关高伤事件常驻；炼气期就可能死，轮回转得快（2026-11-11 按推荐定）。", recommended: true },
      { value: "steady", label: "稳健长生", desc: "节奏放缓，死得慢、修得久（当前结算规则同为中等偏虐，此项仅作意向记录）。" },
    ],
  },
  {
    key: "q11", q: "Q11", title: "第一世从哪开始", icon: "骰",
    syncNote: "同步：降生抽选的规模——姓名 48 / 出身 36 / 命格 18 / 天赋 24 / 灵根 10 的超大随机池。",
    options: [
      { value: "random_open", label: "直接随机 · 超大体量随机池", desc: "第一世不预设起点：姓名、出身、命格、灵根、天赋全部从大池里抽（2026-11-11 你定的）。", recommended: true },
      { value: "village_start", label: "山村醒来（第一轮推荐，未采用）", desc: "最垃圾开局的经典起点，已被「直接随机」取代，仅作记录。" },
    ],
  },
  {
    key: "q12", q: "Q12", title: "记忆保留（再收紧）", icon: "忆",
    syncNote: "同步：覆盖 Q7 数值——下一次轮回按此判定，结算面板实时预告保留率。",
    options: [
      { value: "recommended", label: "坐化三成 · 战死一成 · 横死不留 · 每境 +半成 · 上限五成", desc: "境界每高一境（境界序号）多留半成；走火入魔 = 魂飞魄散：记忆全失、本命法宝碎裂（2026-11-11 按推荐定）。", recommended: true },
      { value: "q7_strict", label: "Q7 苛刻版（50/25/10，未采用）", desc: "上一轮的数值，已被 Q12 取代，仅作记录。" },
    ],
  },
  {
    key: "q13", q: "Q13", title: "随机开局怎么抽", icon: "抽",
    syncNote: "同步：降生抽选面板——出身/命格/灵根/天赋逐项独立设置（二级选择页）；姓名已退出抽选，只剩自填框 + 随机按钮。",
    options: [
      { value: "independent", label: "各自独立：可独立随机，也可自选", desc: "出身/命格/灵根/天赋每项各抽 3 个候选，点开二级页逐项自选或点「随机」掷定；姓名不做选择，自填或随机掷一个（2026-11-11 你定的，姓名部分同日改为自填+随机）。命格为新增系统。", recommended: true },
      { value: "three_choice", label: "旧三选一（第二轮，未采用）", desc: "出身与天赋混在一起三选一，已被独立抽选取代，仅作记录。" },
    ],
  },
  {
    key: "q14", q: "Q14", title: "体量扩哪块", icon: "扩",
    syncNote: "同步：功法 10 门、宗门系统、副职四样、机缘事件 80（U-375 扩量）、命格、地点 12 处已全部上盘。",
    options: [
      { value: "all", label: "全都要", desc: "功法 + 宗门 + 副职（炼丹炼器灵田垂钓）+ 机缘事件 + 命格，一次全加（2026-11-11 你定的）。", recommended: true },
      { value: "core_first", label: "先功法+机缘+命格（第一轮推荐，未采用）", desc: "分批扩容方案，已被「全都要」取代，仅作记录。" },
    ],
  },
  {
    key: "q15", q: "Q15", title: "战斗怎么打", icon: "战",
    syncNote: "同步：斗法面板——各地敌手难度按其境界定（基准难度），掷斗法骰 d20[下限~上限]（战力计入骰面）对抗，胜负浮动按归一化胜势差结算（Q34）。",
    options: [
      { value: "duel_d150", label: "掷骰对抗 vs 按敌手境界定的难度 · 胜负浮动结算", desc: "基准难度 = 70+敌手境界×18+其战力，掷骰时按 Q34 换算到斗法骰 d20 的动态范围（战力撑起上下限）；赢得越漂亮奖励越多，输得越惨伤得越重（2026-11-11 按推荐定，2026-11-14 骰面改按 Q34）。", recommended: true },
      { value: "pure_stats", label: "纯数值比较（未采用）", desc: "不掷骰、战力高者胜的方案，已被掷骰对抗取代，仅作记录。" },
    ],
  },
  {
    key: "q16", q: "Q16", title: "有没有主线", icon: "线",
    syncNote: "同步：前世之谜面板——碎片进度与已揭开的章节；不强制，不集也不挡路。",
    options: [
      { value: "light_mainline", label: "轻主线 · 前世之谜", desc: "封印的前世记忆就是主线：9 枚碎片散落在机缘与轮回里，集齐 1/3/5/7/9 揭开五章前世身份，集满后每世带前世道果（2026-11-11 按推荐定）。", recommended: true },
      { value: "sandbox_only", label: "纯沙盒（未采用）", desc: "无主线的方案，已被轻主线取代，仅作记录。" },
    ],
  },
  {
    key: "q17", q: "Q17", title: "灵石经济", icon: "石",
    syncNote: "同步：坊市商店与洞府升级——物价按你的境界分档，境界越高越贵。",
    options: [
      { value: "stones_economy", label: "赚靠打工卖丹探索 · 花在丹药与洞府 · 物价按境界分档", desc: "坊市可买回春/聚气/破境三丹、可寄卖丹药；洞府聚灵阵三级升级；价格 ×(1+境界×0.6)（2026-11-11 按推荐定）。", recommended: true },
      { value: "no_economy", label: "灵石只进不出（旧版，未采用）", desc: "早期灵石只有收入没有消费口的形态，已被商店经济取代，仅作记录。" },
    ],
  },
  {
    key: "q18", q: "Q18", title: "社交系统", icon: "交",
    syncNote: "同步：人际面板——12 位 NPC、五种关系（道侣/师父/徒弟/道友/仇敌）及全部互动；仇敌仇怨深了会寻仇。",
    options: [
      { value: "social_full", label: "细致版 · 体量放大", desc: "关系从事件与结识中自然产生：道侣助修炼、师父减突破难度、徒弟给进项、仇敌会寻仇；拜访/双修/请教/指点/赠礼/决斗/和解全做（2026-11-11 你定的：做细致、体量大一点）。", recommended: true },
      { value: "social_simple", label: "简单版（第一轮推荐，未采用）", desc: "只给加成不做互动的精简方案，已被细致版取代，仅作记录。" },
    ],
  },
];

// ---------- 规则分组（按玩法） ----------
// 19 条规则的展示分组：规则页按组分段呈现，每条规则仍对应 TREE 里的一条，
// 分组只决定排版顺序，不改变任何规则的键、选项与生效逻辑。

export interface RuleGroup { id: string; title: string; icon: string; desc: string; keys: SettingKey[] }

export const RULE_GROUPS: RuleGroup[] = [
  {
    id: "opening", title: "开局与降生", icon: "芽",
    desc: "每一世怎么开始：谁来玩、什么开局、姓名出身怎么来、第一世带不带法宝。",
    keys: ["q1", "q2", "q6", "q11", "q13", "q9"],
  },
  {
    id: "reincarnation", title: "轮回与记忆", icon: "轮",
    desc: "死后留什么：修为、法宝与传承点怎么继承，记忆按什么规则保留。",
    keys: ["q3", "q7", "q12"],
  },
  {
    id: "cultivation", title: "修炼与境界", icon: "境",
    desc: "境界怎么升、节奏有多虐、这一局的体量扩到哪。",
    keys: ["q4", "q10", "q14"],
  },
  {
    id: "combat", title: "判定与战斗", icon: "战",
    desc: "所有检定掷什么骰，斗法怎么分胜负、怎么结算赏罚。",
    keys: ["q8", "q34", "q15"],
  },
  {
    id: "world", title: "世界与日常", icon: "世",
    desc: "盘面显示什么、有没有主线、灵石怎么流通、人际关系怎么做。",
    keys: ["q5", "q16", "q17", "q18"],
  },
];

export function optionLabel(node: TreeNode, value: string): string {
  return node.options.find((o) => o.value === value)?.label ?? value;
}

// ---------- 参考来源（调研 2026-11-11） ----------

export const SOURCES = {
  game: [
    { label: "Steam 商店页《百世成仙》（凯菲工作室，2026-10-08 发售）", url: "https://store.steampowered.com/app/5235070/Hundred_Lives_to_Immortality/" },
    { label: "SteamDB 更新公告总览（传承点/遗藏/承世玉等机制出处）", url: "https://steamdb.info/app/5235070/patchnotes/" },
  ],
  novels: [
    { name: "《轮回修仙人生》", author: "欧阳冶", mech: "血脉投胎 · 胎中之迷 · 天赋最多选 3", url: "https://m.xxsy.net/bookquery/qbjdlwgtvxzf" },
    { name: "《百世修仙，苟在修仙界证道长生》", author: "陈伶cl", mech: "时间回溯 · 每世三选一保留", url: "https://book.qq.com/bqq/qbycxagtwzsk" },
    { name: "《百世求仙》", author: "黑茄酿啤酒", mech: "百世碑 · 寿终返老还童 · 被杀则作废", url: "https://www.qidiantu.com/info/1034971152" },
    { name: "《我在修仙界轮回证道》", author: "半生如履薄冰", mech: "轮回印 · 封存前世修为 · 无限轮回", url: "https://miread.novel.qq.com/bqq/qbxanjrhoshv" },
    { name: "《人在凡人，百世修仙》", author: "思考人生的火腿", mech: "结算评分选天赋 · 10 岁觉醒 · 取回埋藏", url: "https://mbook.read.qq.com/bqq/clenvxiqzf" },
    { name: "《修仙：我能在诸天轮回》", author: "黑心师尊", mech: "道果固化命格 · 一证永证", url: "https://ikan.novel.qq.com/bqq/lwururiqqb" },
    { name: "《百世飞升》", author: "白眉罗汉", mech: "血脉轮回 · 成就抽体质/技能/天赋", url: "https://xiaoshuo.qq.com/bqq/dyospejd/p19" },
    { name: "《百世修仙：我能固定天赋》", author: "牛顿不秃顶", mech: "血脉后人轮转 · 成就换天赋可固定", url: "https://mbook.novel.qq.com/bqq/rhiqmiurtu" },
    { name: "《万世轮回书》", author: "血色烈焰", mech: "死得其所才可重来 · 以寿元换敌之长", url: "https://mwbook.book.qq.com/bqq/qbjdzfhvhvqb" },
    { name: "《百世真仙》", author: "墨菲特啃地瓜", mech: "分身继承上一世肉身属性", url: "https://ihome.qq.com/bqq/dyqburosiq" },
    { name: "《修仙，我能转世重修》", author: "仰望星空.3", mech: "转生仅 9 次 · 不成仙则消亡", url: "https://ing.qq.com/bqq/vxmixarhzf" },
    { name: "《我以长生寻仙道》", author: "我可是正人君子", mech: "三生石仅 3 次 · 经历化作天赋神通", url: "https://bookac.qq.com/bqq/vxvxurmiqb" },
    { name: "《苟在万界百世修仙》", author: "阗妖", mech: "修为封印进道蕴珠 · 下一世寻回", url: "https://e-book.qq.com/bqq/qbjdrhrhamlw" },
    { name: "《苟在轮回里修仙》", author: "名寇", mech: "非人转世 · 每世唤醒一件上古秘宝", url: "https://ispace.qq.com/bqq/qbyciqamlwcl" },
    { name: "《百世轮回，我于世间证仙道》", author: "金色大皮卡", mech: "成就评价生成气运 · 燃烧此世拓宽上限", url: "https://m.ispace.qq.com/bqq/vxskfonjam" },
    { name: "《百世成仙，从坊市散修开始》", author: "糖醋鱼小李", mech: "百世蝉 · 未来身反哺本体", url: "https://novel.qq.com/detail/1060921096" },
    { name: "《长生路：从百世轮回开始》", author: "齐鸣镇南", mech: "百世书 · 死亡重回穿越之时", url: "https://e-book.qq.com/bqq/qbqblwrhpemi" },
    { name: "《百世成仙，你说这是封神？》", author: "九世琉璃", mech: "劫力攒满才保记忆 · 只留感悟", url: "https://reader.novel.qq.com/bqq/qbxamienwzlw" },
  ],
};
