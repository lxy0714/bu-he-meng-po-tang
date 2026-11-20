// 轮回修仙跑团 — game actions.
// One save slot (id=1) holds the full game state as JSON: design-tree
// settings (Q1–Q10), the current character, past lives and the chronicle.
//
// 第二轮定稿（2026-11-11）：
// - Q6 主角姓名与出身随机生成（每世开局三选一保留出身/天赋）。
// - Q7 记忆保留改为苛刻版：按死法分档（坐化 50% / 战死 25% / 横死 10%），
//   元婴以上 +15%，上限 65%；且记忆分层——只有上一世清晰，前几世只剩
//   若干条「前尘残片」，每条是可查阅的关键词记录。
// - Q8 判定统一记号（U-571）：1d150+修正 vs 难度，总值 ≥ 难度成功。
// - Q9 第一世无本命法宝；死后首次轮回从本世所得中挑一件带走，
//   之后每世可换；法宝之外再加传承点赎回（参考《百世成仙》）。
// - Q10 中等偏虐：妖魔战场常驻死亡风险、事件失败可致死、
//   突破失败有走火入魔概率。
// 参考《百世成仙》（Steam，凯菲工作室）的轮回系统：传承点、前世遗藏、
// 藏器于野、承世玉、地点收益衰减 100/60/35/15%、第二世起秘境门槛放宽。
// 注意：该作本身无随机开局系统；随机出身/天赋与三选一保留源自轮回
// 修仙小说（《轮回修仙人生》《百世修仙，苟在修仙界证道长生》等）。
//
// 第三轮定稿（2026-11-11）：
// - Q11 第一世直接随机：姓名/出身/命格/天赋/灵根各有大随机池，开局
//   先各抽 3 个候选，玩家可全随机、一键随机定一项，或逐项自选。
// - Q12 记忆保留按推荐再收紧：坐化留三成 / 战死留一成 / 横死不留，
//   境界每高一境多留半成（境界序号 ×5%），上限五成；死于走火入魔 =
//   魂飞魄散：记忆全失，本命法宝碎裂（赎回的法宝也不带走）。
// - Q13 姓名、出身、命格、天赋、灵根全部独立：每项可独立随机抽候选、
//   在候选中自选、或从全池自选（姓名可自填）。新增「命格」系统：
//   每世降生抽命格，自带吉凶各异的修正（见 DESTINIES）。
// - Q14 体量全都要：功法扩至 10 门、宗门系统（入门/差事/晋升/月俸）、
//   副职（炼丹/炼器/灵田/垂钓）、机缘事件 24→40、命格、地点 8→12、
//   天赋 12→24、灵根 6→10（新增变异灵根与特殊体质）。
//
// 第四轮定稿（2026-11-11）：
// - Q15 战斗 1d150+战力 vs 难度：斗法动作挑战按地点分布的敌手，难度按其境界
//   定（70+境界×18+其战力），胜负奖励/伤势按胜势差浮动结算。
// - Q16 轻主线：前世之谜——9 枚记忆碎片（特定机缘事件掉落、记忆保留
//   成功 +2），集齐 1/3/5/7/9 揭开五章前世身份（玄微真人），集满后
//   每世降生带前世道果（神识/机缘 +4）；不强制，不做也不挡路。
// - Q17 灵石经济：坊市商店三丹（回春/聚气/破境），物价按境界分档
//   （×(1+境界×0.6)）；寄卖丹药（每周一次）、洞府三级聚灵阵升级；
//   赚的路子沿用打工（差事/灵田）、卖丹、探索搜刮。
// - Q18 社交做细、体量放大：12 位 NPC，五种关系（道侣/师父/徒弟/
//   道友/仇敌），关系由事件成败与「广交道友」自然产生；道侣修炼
//   +12%、师父突破难度 −8、徒弟给进项、仇敌仇怨 ≥30 会寻仇堵人
//   （探索时 30% 触发）；互动含拜访/双修/请教/指点/赠礼/决斗/和解。
//
// 设定生效修复（2026-11-11，用户报「设计树的选择没有用」）：此前 Q9
// 「开局自带一件」从未被任何服务端逻辑读取（createCharacter 恒无
// 法宝）、Q3「只留记忆」记忆仍掷 Q12 判定、Q7「按境界判定」从未被
// memoryOutcome 读取——三项均为摆设。现已全部接线：Q9 from_start 时
// 创建页挑法宝、createCharacter 校验赋予；Q3 memory_only 记忆必留；
// Q7 by_realm 显式改选时按境界判定（坐化/元婴全留、筑基金丹七成、
// 炼气四成）覆盖 Q12 公式。其余标「未采用/仅作记录」的选项本就是
// 历史方案（选项文案已明示），设计树顶部加了用途说明。
//
// 降生抽选改版（2026-11-11，用户）：姓名退出抽选——只剩自填输入框 +
// 随机按钮（随机走本地姓名池即时填入；留空则降生时服务端从姓名池
// 全池随机）；出身/命格/灵根/天赋改为二级选择页（主层总览 + 点开
// 逐项大卡片选择）。抽选结构 BirthDraw 不再含 name 字段，旧存档里
// 残留的 name 键由响应整形自动忽略。
//
// U-002 轮回点（2026-11-13，更新计划第二期，D-1 已定为主货币）：新增
// 跨世货币「轮回点」，与传承点分工不混用——传承点只赎装备/功法，
// 轮回点只用于开局分配。发放：每次轮回结算（buildReincarnation）按
// 本世评级档位发放，档位与开局价格全部出自数值配置表
// content/reincarnation-points.json（S 6 / A 4 / B 3 / C 2；属性
// 1 点/点、单项上限 10；重置天赋与灵根候选 3 点）。消费只在开局：
// allocatePoints 逐点分四维（birthBoost 暂存，降生时落定清空），
// resetDrawWithPoints 定向重抽天赋+灵根候选（出身/命格不动，结算中
// 天赋仍走评级池；与免费「全部重抽」分工）。旧存档无此字段按 0 点
// 兜底（savefields 注册表补值）。
//
// U-021 轮回点强化下一世再战天道（2026-11-14）：与 U-002 同一轮回点
// 体系、同一配置表（content/reincarnation-points.json 新增 boons）、
// 同一余额池，不另立点数或汇率。花费项与 U-002 不重叠：U-002 买四维
// 初始属性与重置天赋/灵根候选；U-021 买「再战天道」强化项（气血/法力
// 上限、寿元、开局灵石），开局购入（buyBirthBoon，可退订原价退回），
// 降生时一次性生效并清空（applyBirthBoons）。产点仍是 U-002 的结算
// 按评级发放，未动。
//
// U-322 完成每世主线得轮回点（2026-11-14）：与 U-002/U-021 同一轮回
// 点体系、同一配置表（新增 shardTiers）、同一余额池。用户定口径：
// 按每世新收集的碎片数分档发放——主线「前世之谜」的碎片跨世累计，
// GameState 新增 shardsAtLifeStart 基线，轮回结算时本世新集 =
// mainline.shards − 基线，查表分档（1 枚 +1 / 2 枚 +2 / 3 枚 +3 /
// 5 枚 +5）与评级发放叠加入池，结算后基线推进到当前累计；集满时
// 传承点 +5 的既有奖励与碎片掉落/章节解锁规则未动。碎片总数上限 9
// 枚使本口径全程总供给 ≤9 点，与 U-002 发放、U-021 花费同表验算过。
//
// U-326 双层货币分层（2026-11-14，用户定口径「按计划字面」）：货币
// 明确分两层——局内层灵石是当世货币，死后全清零，新世固定 50（原
// 「50 + 前世结余 20%」改为固定 50，结余不带入）；跨局层轮回点与
// 传承点永久保留、不受轮回影响。本项只动分层本身：发放与花费规则
// 未动，丹药/法宝/洞府等其余当世资产的生死规则未动；U-021 天道馈
// 赠的开局灵石 +120 是强化项，仍在固定 50 的基础上叠加。
//
// Q34 分系统骰面（2026-11-14 新定夺，取代 Q8 全游戏 d150）：七个
// 系统各用各的基础骰面（斗法/决斗/复仇 d20、突破 d100、探索 d80、
// 副职 d60、社交 d40、宗门差事 d50、记忆保留 d100），每次掷骰的
// 实际范围 [下限, 上限] 由相关属性现算（checks.ts 的 DICE_SYSTEMS /
// diceRangeFor，不进存档）；难度按「玩家能力 vs 目标档位」的相对
// 差距算，掷骰时由 rescaleDc 等概率换算到新骰面，成功率曲线与
// d150 时代一致；撑起骰面的属性不再进固定修正（防重复计算）。
// 补充口径同日落地：社交难度按双方境界差（socialDcFor）、决斗按
// 对方境界、探索机缘按品阶与境界差（FATE_TIER，机缘可抵消部分
// 难度）、抽牌有机缘牵引偏置。Q1–Q18 其余规则与数值结构未动。
//
// U-377 二选一代价事件模板（2026-11-14，来源 A-96《月圆之夜》）：
// 事件选项新增可选 cost 字段（events-base.ts 模板 + 校验）——明码
// 标价、选定即先付代价再结算收益、付不起不可选并明示原因；代价走
// applyEventCost 精确扣减（不吃天赋/衰减），判定仍走 Q34 探索
// d80、数值未动。示范 3 条（坊市奇遇·赌一把 灵石 50、坊市拍卖会·
// 竞拍古丹 灵石 70、瀑下炼体·入瀑炼体 气血 12），代价均由选项原有
// 负值效果平移，成败结算总量与改前逐项相同；其余 77 条事件未动。
//
// U-378 见好就收事件模板（2026-11-14，来源 A-13《循环英雄》）：
// 事件选项新增可选标记 loop（events-base.ts 模板 + 校验）——选了
// 可加圈选项并掷骰成功后不结束事件，进入抉择待决事件（id 为
// loop:<事件id>，进行状态挂 PendingEvent.loop）：继续加圈（下一
// 圈难度与成败收益按配置表 EVENT_LOOP 的 scalePct=50 同比例上调、
// ×1.5 复利）或见好就收（按当前累计结算收手）；每圈只给一次抉
// 择，可多轮加圈。每圈收获在该圈成功时即落袋（applyEffects 既有
// 结算链，累计以资源差值实测），撤退与后续圈失败都不追扣已得；
// 某圈失败按该圈已放大的失败效果结算并结束事件。判定仍走 Q34 探
// 索 d80（难度先在基准标尺上放大再照旧换算），触发规则未动。示
// 范 2 条（灵矿采掘·下矿采掘、灵泉枯井·下井探查），其余 78 条
// 事件未动。
//
// U-379 三选一抉择事件模板（2026-11-15，来源 B-63《洪荒，开局选择
// 神话大罗法》）：事件新增可选标记 trio（events-base.ts 模板 + 校
// 验）——同一事件恰好三个选项，各带取向明显不同的奖励与好感/因
// 果后果（取向签名两两不同、好感与因果维度齐备，非法结构加载即
// 拦），选定即按所选走既有 chooseOption 一次性结算，判定仍走
// Q34 探索 d80。与轮回结算的「三选一保留」（U-575）是两回事，
// 轮回结算未动。示范 2 条（山门访客整条改作告知/误导/沉默三选
// 一；坊市扒手保留原两选项、新增「事后分赃」同流取向），其余
// 78 条事件未动。
//
// U-380 多解事件模板（2026-11-15，来源 A-15《死亡循环 DEATHLOOP》）：
// 事件新增可选标记 dual（events-base.ts 模板 + 校验）——同一事件两
// 种解法（如强攻硬闯与潜行绕过），各走一次判定，难度与奖励结构相
// 同、数值可不同；解法只影响过程文本与奖励侧重，不改变事件归属地
// 点。计划原文的「d150 判定」写于 Q34 之前，本项不改判定口径：两
// 解法各走一次 Q34 探索 d80（动态上下限）。结构约束：恰好 2 个选
// 项、两解法都真掷骰、结算结构相同（成功有奖/失败有后果）、奖励
// 侧重签名不同、不得带 loop、不得与 trio 并存，非法结构加载即拦；
// 标记经待决事件传递到游戏盘，事件卡显示「🗡️ 双解法」标注，结算
// 仍走既有 chooseOption。示范 2 条（内容一字未动，原本即双解法形
// 态）：古修遗府（强行破禁·修为/灵石向 vs 参悟禁制·修为/业力/碎
// 片向）、遗府守灵（对招·修为/灵石向 vs 叩拜·修为/业力向），其
// 余 78 条事件未动。
//
// U-381 分叉地图路线选择（2026-11-15，来源 A-92《杀戮尖塔》）：本项
// 是地图路线层，不是事件模板。探索（寻仇/遗藏两支优先触发落空后）
// 不再直接抽事件，而是踏上一程分叉路线（state.ts 的 RouteState，共
// 5 层）：每层种子化抽 3 个类型各不相同的节点（战斗/精英/事件/商
// 店/休息），chooseRouteNode 选定即触发对应类型的既有系统——战斗/
// 精英走 Q15 斗法结算（resolveFight 与 fight 动作共用；精英 = 本地
// 点最强敌手，敌手生成节点时定下并明示）、事件走 U-576 牌堆抽取摆
// 成待决事件（presentDeckEvent 与原探索抽牌逐字一致）、商店摆「行
// 商驻足」卡按 Q17 同价买丹（route:shop，chooseOption 分支结算）、
// 休息走既有休整结算；节点结算完毕推进一层（事件类经 chooseOption
// 的 finishRouteStep 钩子），走完第 5 层结束，节点待选时可收程放
// 弃（abandonRoute）。路线进行中日常行动/旅行/预设路线不受理。判
// 定口径不变（斗法 d20、探索 d80），不新增事件/NPC/法宝/地点，
// Q1–Q18 与 Q34–Q36 未动。
//
// U-384 经营日常随机危机/惊喜事件（2026-11-15，来源 A-5《了不起的
// 修仙模拟器》）：新增「经营日常」触发形式——经营/休整日常动作（修
// 炼/休整/副职四项/宗门差事）结算完毕后，按配置表 content/daily-
// events.json 的 chancePct（15%）掷一次触发判定（种子 op daily:event）；
// 命中则从现有事件池按既有牌堆口径抽一张（presentDeckEvent，与
// U-381 路线「事件」节点共用同一段）摆成待决事件，走既有 chooseOption
// 结算（Q34 探索 d80 与全部事件模板标记照旧）。只新增触发形式：不
// 新增事件/NPC/法宝/地点，不改探索/战斗（寻仇）/寿元节点的既有触
// 发规则，不改 Q1–Q18 与 Q34–Q36；已陨落/已有待决事件/路线进行中
// 不触发，预设路线连走遇触发即停步（既有守卫）。相关项 U-438、
// U-439（其他触发形式）本轮未做。
//
// U-388 委托板（接取式支线）（2026-11-15，来源 A-35《古剑奇谭三》，
// 拆自 v1 U-47 的接取部分）：新增接取入口与任务状态字段——街边告
// 示板式委托板（actions-board.ts 的 commission 动作：接取/结算/
// 放弃），玩家在委托的张贴地点主动接取支线，接取后按地点刷新任
// 务目标（在目标地点完成既有系统的行为计数：牌堆事件结算/斗法获
// 胜/副职/宗门差事，进度推进是 state.ts 的 bumpCommissions，挂在
// 四处既有结算尾巴上），达成后回张贴处结算并由委托人讲述世界与
// 人物故事。接取无时限、不接无惩罚、放弃无惩罚；委托池在配置表
// content/commissions.json（9 条，委托人/地点/行为/奖励字段全部
// 取自现有内容，奖励走既有 applyEffects、结缘走既有 RelSpec），
// 不新编数值体系。状态挂角色 commissions 字段（本世制，轮回不带
// 走），板面由 loadState 的 ensureCommissionBoard 按配置张贴数补
// 齐。只做接取式这一项：U-389 限时事件与 U-390 日常委托事件池
// 未碰，Q1–Q18 与 Q34–Q36、现有事件触发与结算规则未动。
//
// U-389 限时事件（2026-11-15，来源 B-65《修真聊天群》，拆自 v1
// U-47 的限时部分）：群友发布的限时帖（actions-timed.ts 的 timedEvent
// 动作：接取/交帖/撕帖）——带倒计时：帖子挂板 postDays 天无人接取
// 即过期沉底、接取后须在 limitDays 天内办妥目标（U-610/Q37：倒计
// 时改按天/月计，时钟 = 天序 = 累计月份 × 每月天数；到期结算在
// state.ts 的 settleTimedEvents，读档时按当前天序结清超时失败与
// 挂帖过期），接与不接、成
// 与败均结算声望——声望只落既有字段（发布人的 relations bond 与宗
// 门 sectContrib，applyReputation 一处落账），不新设货币。帖子池、
// 时限与四段声望全在配置表 content/timed-events.json，内容全部取材
// 现有 NPC/地点/系统，目标进度与委托共用同一套行为计数（bumpTimed-
// Events 挂在同四处结算尾巴，与 bumpCommissions 并行、互不影响）。
// 与 U-388 委托板（无时限、不接无惩罚）明确分开：状态、动作、配置
// 各自独立；主动撕帖按爽约（败段声望）结算。U-390 日常委托事件池
// 未碰，Q1–Q18 与 Q34–Q36、现有事件触发与结算规则未动。
//
// U-390 日常委托事件池（2026-11-15，来源 B-66《我的微信连三界》，
// 拆自 v1 U-47 的日常池部分）：天庭朋友圈 / 地府委托做成日常探索
// 事件池——按批刷新（U-390 时时钟 = 角色年龄、按岁刷新；U-611 起
// 改按 U-608 累计月份每月刷新一批、间隔进配置表 refreshInterval-
// Months，旧存档 dayAge 由 migrateDailyClock 对齐；刷新在 state.ts
// 的 ensureDailyBoard，读档时整批换新），不设接取动作、无接取声
// 望：进入委托地点即触发本批委托（travel 抵达结算尾巴查 daily-
// PendingHere，委托指定的际遇还在本世牌堆里才由 presentDailyEvent
// 摘出摆成带 daily 标记的待决事件——U-576 本世不重复口径不变），
// 办妥（任一选项掷骰成功，chooseOption 主分支）当场结清额外奖励：
// 天庭给稀有材料（灵石/修为等既有资源）、地府给前世线索（reward.
// shard 走既有记忆碎片字段，汇入 Q16）。未完成不惩罚（失败不结、
// 刷新时整批换新不记过不动声望），与 U-388 委托板（接取
// 式、无时限、回板结算）与 U-389 限时事件（有时限、声望结算）明
// 确分开：状态、配置、结算各自独立，无新动作。内容全部取材现有
// 事件/地点，奖励走既有 Effect 字段，不新增事件/NPC/法宝/地点、
// 不新设货币，Q1–Q18 与 Q34–Q36 未动。
//
// U-383 道德分叉事件模板（2026-11-15，来源 A-6《修仙故事：轮回》）：
// 事件新增可选标记 moral（events-base.ts 模板 + 校验）——同一事件
// 行善助人 / 偷抢夺宝两条分支：行善得 NPC 好感（relOk 结友好关系）
// 与因果善缘（业力为正），偷抢得即时物资（灵石）但记仇敌与/或因果
// 恶缘（业力为负）；分支归属由 moralBranchOf 按后果结构判定，恰好
// 一善一夺、不得与 trio/dual/loop 并存，非法结构加载即拦。分支只
// 复用既有好感/因果/物资字段，不新增善恶数值（Q1–Q18 未定义善恶
// 值）；判定仍走 Q34 探索 d80，结算仍走既有 chooseOption。示范
// 2 条（按模板改作）：雪原商队（护送补善缘与金不换好感、原绕行
// 选项改作趁乱劫货）、边关时疫（施药行善分支未动、原布阵选项改
// 作趁疫囤药牟利），其余 78 条事件未动。
//
// U-391 地点签到（2026-11-15，来源 B-42《修仙：神级签到系统》，拆
// 自 v1 U-45 的签到部分）：到达指定地点（坊市 / 宗门山门 / 秘境，
// 配置表 content/sign-ins.json）触发签到式事件一次——即到即得：
// 无需接取、无时限、无掷骰判定，奖励按配置三选一（灵石 / 功法 /
// 法宝其一，内容全部取材现有灵石字段与功法池/法宝池）。触发点两
// 处共用 state.ts 的 settleSignInHere：旅行抵达结算尾巴（actions-
// play 的 travel）与读档时（loadState，覆盖旧存档升级前已站在签
// 到点上的情形，与限时帖到期结算同一读档期派生口径）。状态挂角
// 色 signIns 字段（本世制：已签点 id + 已签数，轮回不带走），同
// 一地点本世不重复签到。功法/法宝槽已被占时不替换，按配置
// fallback 折作结算（两条分支都在配置里明示）。tier 只是地点稀
// 有度分档的预留接口：分档规则、签到图鉴与收集进度归 U-392，本
// 项不按 tier 做任何结算分支；U-393（封印之蛋式收集物）未碰。
// 与 U-388 委托板（接取式）、U-389 限时事件（时限声望）、U-390
// 日常委托（按月刷新事件池，U-611）明确分开：无新动作（纯到达触发 +
// 只读展示段），不改 Q1–Q18 与 Q34–Q36、不改现有事件触发/结算
// 规则、不新增事件/NPC/法宝/地点、不新设货币。
//
// U-392 签到图鉴（2026-11-15，来源 B-42《修仙：神级签到系统》，拆
// 自 v1 U-45 的图鉴部分）：在 U-391 的签到记录与 tier 预留之上做
// 收集进度与按档奖励——①收集进度：签到过的地点记入跨世图鉴
// （GameState.signInCodex 签到点 id 清单，轮回不清空，注册表登记
// 缺省补空；收录发生在签到结算当刻，loadState 把本世已签列表并
// 入兜底、覆盖本项上线前已签的旧存档，只补记录不发奖）；②按档
// 奖励：配置表 sign-ins.json 新增 tiers 档位表（寻常/稀有/绝世，
// 每档标签 + 故地重游小奖 revisit，只许灵石/修为两键），大奖仍按
// 签到点逐点配置（档位越高越重），本世已签过的地点再次抵达时不
// 再重发大奖、只按档发小奖（加载自检硬核：每档小奖总量须严格小
// 于该档每个签到点的大奖参照总量）。小奖只在旅行抵达时发
// （settleSignInHere 的 viaTravel），读档期站在已签地点上不发，
// 防反复读档刷奖；旅行耗时一年、往返有寿元成本，是天然节流。
// 触发规则与 U-391 完全一致（到达触发、无接取、无时限、无掷
// 骰），无新动作（图鉴是只读展示段：respond 的 signIns 段加跨世
// 收集数 codexCount/codexTotal、每点 inCodex 与按档小奖文案
// revisitText，档位标签改读配置 tiers）；不改 Q1–Q18 与 Q34–
// Q36、不改现有事件触发/结算规则、不新增事件/NPC/法宝/地点、
// 不新设货币（图鉴只记清单与档位）；U-393（封印之蛋式收集物）
// 未碰。
//
// U-393 封印之蛋式收集物（2026-11-15，来源 A-39《轩辕剑六》的
// 「封印之蛋」收集；来源未核实：调研文档已标注该作无 Steam 页，
// 机制采信、来源标注未核实；拆自 v1 U-45 的收集物部分）：探索时
// 埋「封印之蛋」式收集物——12 枚蛋在配置表 content/sealed-eggs
// .json 里各定死一个埋藏地点（全部取材现有 12 个地点，一地点一
// 枚），探索（act explore）到该地点时按配置 chancePct（60%）种
// 子化掷骰随机现身（种子 op egg:spawn），拾取当场记入跨世收集进
// 度（GameState.sealedEggs，轮回不清空，注册表登记缺省补空），
// 不占待决事件槽位、不改寻仇/遗藏/路线三支的触发与结算顺序。
// 集齐 clueThreshold（4）的倍数枚换一条前世遗藏线索：优先指向
// 一处真实存在的既有前世遗藏（往世埋下、未取回、未被指过）的埋
// 藏地点；没有可指时，封印共鸣标出一处无主前世遗藏的方位（宝
// 物种子化取自既有遗藏池 TREASURES、地点取自现有地点，只记方
// 位存 sealedEggs.revealed）。线索只提示遗藏地点、不直接发奖励
// ——宝物仍须玩家亲自到该地点探索取回：既有遗藏走既有 buried_
// find 链，无主遗藏走同形的 sealed_cache 待决（探索到该地点摆
// 出、取回时才按既有遗藏 effect 结算）。收集物只记清单，不进丹
// 药囊、不占格子；无新动作（respond 加只读 sealedEggs 段，地
// 图页加收集区块）。不改 Q1–Q18 与 Q34–Q36、不改现有事件的触
// 发/结算规则与 U-391/U-392 签到口径、不新增事件/NPC/法宝/地
// 点、不新设货币；U-423（死前埋宝主动化）未碰。
//
// U-395 新增事件分批投放（2026-11-16，来源 A-41《轩辕剑外传：穹
// 之扉》的「加强版新增内容」思路）：探索事件按批次投放入池——
// 配置表 content/event-releases.json：首发事件为第 1 批（未被任何
// 批次认领的余集，不逐条列名，与 U-394 本篇包同一口径）；此后新
// 增事件进池时必须登记进一个批次（version ≥ 2），带版本标记。
// 投放口径只有一处：角色降生时把当时最新投放版本落定为本世牌堆
// 版本（character.deckVersion，存档字段注册表登记、旧存档补 1），
// 建堆（state.ts shuffledEventDeck）与抽牌本地点池
// （drawEventFromDeck）只收「分包已解锁（U-394）∧ 投放版本 ≤ 本
// 世牌堆版本」的事件——当世进行中的牌堆不受后来新批次影响（中
// 途重洗与本地点子牌堆同口径），轮回开新世时牌堆版本推进到最
// 新，旧存档无需重开即可遇见新增事件，新批次入世在编年史播报一
// 行。牌堆抽取规则（U-576 三条规则、稀有度权重、机缘牵引）与事
// 件触发/结算一字未动；无新动作（respond 加只读 eventReleases
// 段，地图页加投放区块）；不改 Q1–Q18 与 Q34–Q36、不新增事件/
// NPC/法宝/地点、不新设货币；U-394 的已有内容轮回解锁分包与
// U-375 的扩量口径未碰。
//
// U-394 探索事件分包/外传（2026-11-15，来源 A-38《古剑奇谭二》）：
// 探索事件按「外传」分包——配置表 content/event-packs.json：本篇
// （minLife 1，成员为未被外传认领的余集 64 条）自第一世起轮询；
// 外传一 · 前尘回响（minLife 2，8 条：前世托梦/第二重梦/前人洞府
// 遗泽/洞壁古铭/烽火台旧事/佛前经卷/藏宝残图/秘境传承线索）；
// 外传二 · 天外残篇（minLife 5，8 条：秘境崩塌/魔君残痕/宗门禁
// 地/跨境挑战/天河老蛟/冰窟雪灵/遗府守灵/魔潮攻关）。成员全部取
// 材现有 80 条事件，旧包不删除、新包解锁后加入轮询。落实只有一
// 处口径：建堆（state.ts shuffledEventDeck）与抽牌本地点池
// （drawEventFromDeck）按本世世数过滤未解锁包的事件——牌堆抽取
// 规则（U-576 三条规则、稀有度权重、机缘牵引）与事件触发/结算
// 一字未动；轮回开新世时恰达解锁世数的包在编年史播报一行。无新
// 动作（respond 加只读 eventPacks 段，地图页加分包区块），无存
// 档新字段（解锁状态由世数与配置现算）；不改 Q1–Q18 与 Q34–
// Q36、不新增事件/NPC/法宝/地点、不新设货币；U-395（新增事件分
// 批投放）与 U-434 未碰。
//
// U-399 探索事件分布密度（2026-11-20，来源 A-70《Tutien Path》）：
// 新增探索调参表 content/explore-tuning.json（加载自检保证恰好
// 覆盖全部 12 个地点）：每地点 density（0–1，每次探索触发事件
// 的概率）与 hiddenSlots（本世可被发现的隐藏要素总数），外加全
// 局 hiddenChancePct（15%）。接线两处：①探索（act explore）在
// 寻仇/遗藏/封印之蛋线索三支优先触发落空后、踏上 U-381 路线之
// 前先掷密度（种子流 explore:density）——未命中为安静一步（记
// 一条「一路无话，并无异事」日志、探索 3 个月耗时照常）；命中
// 走现有流程逐字不变（牌堆/避开最近 3 个/Q34 探索 d80/U-377
// 代价选项）。封印之蛋现身等探索钩子在密度掷之前照旧掷；际遇
// 办妥后的拾矿/残页/法宝掉落（结算尾巴三掷）每次探索都掷、不
// 受密度命中与否影响——2026-11-20 审计修正：安静一步分支同样
// 独立掷这三掷（种子流/概率/结算与尾巴逐字一致，掷中照常发奖
// 记日志，三掷皆空才是纯安静一步、无奖惩）。②路线「事件」节点摆事件之前先
// 掷隐藏发现（state.ts maybeHiddenDiscovery）：本地点仍有剩余
// 埋点且按 hiddenChancePct 掷中时，改为触发一次隐藏发现并扣
// 减 1 个埋点——奖励从既有类型里按地点品阶（U-396 掉落档）取
// 一样（灵石/修为/参悟/矿石/功法残页，残页与 U-396 同口径结
// 算），日志明示「隐藏发现」与剩余数；无埋点或未掷中走普通事
// 件。埋点剩余存角色 hiddenSlots 字段（本世制：降生按配置表整
// 表初始化、轮回重置、旧存档缺字段由存档字段注册表按配置默认
// 值补齐）。密度只影响触发频率，不改事件内容与任何判定数值
// （计划原文的 d150 阈值是 Q34 之前的旧说法，本项不碰判定）。
// 呈现只加地图卡小字「事件 稠密/适中/稀疏」（density 分档派
// 生，respond locations 段 densityWord），不新增页面；无新动
// 作、不新设货币，Q1–Q18 与 Q34–Q36 未动。

import { defineAction, z, type ActionsModule, type Ctx } from "./platform";
import { defaultState, loadState, pushLog, realmsFor, saveState, syncArtifactGate } from "./state";
import { stateResponse, toResponse, type StateResponse } from "./respond";
import { appendErrorLog, appendErrorLogSafe, errorToText, loadErrorStore, saveErrorStore, type ErrorLogEntry } from "./errors";
import { lifeActions } from "./actions-life";
import { playActions } from "./actions-play";
import { worldActions } from "./actions-world";
import { boardActions } from "./actions-board";
import { timedActions } from "./actions-timed";
import { aiActions } from "./actions-ai";

// ---------- 报错记录（控制面板）：形状与整形 ----------
// 报错单独存 saves 表 id=2（见 errors.ts），与游戏存档互不覆盖：
// 散功重开不清报错，清空报错也不动存档。

const errorLogShape = z.object({
  id: z.number(), time: z.number(), timeText: z.string(),
  source: z.string(), location: z.string(), message: z.string(), detail: z.string(),
});
const errorLogsResponse = z.object({
  logs: z.array(errorLogShape), total: z.number(), serverCount: z.number(), clientCount: z.number(),
});
type ErrorLogsResponse = z.infer<typeof errorLogsResponse>;

function toErrorLogsResponse(logs: ErrorLogEntry[]): ErrorLogsResponse {
  return {
    logs,
    total: logs.length,
    serverCount: logs.filter((l) => l.source === "server").length,
    clientCount: logs.filter((l) => l.source === "client").length,
  };
}

// 给每个动作的 handler 套一层：抛错时先把「时间 / 动作名 / 错误内容 /
// 堆栈」记进报错记录，再把原错误抛回去（客户端照常收到失败）。
// 报错记录自身的三个动作失败时不再套娃记录，避免连环失败刷屏。
type AnyActionDef = { handler: (ctx: Ctx, args: never) => Promise<unknown> };
function withErrorLogging<T extends AnyActionDef>(name: string, def: T): T {
  if (name === "getErrorLogs" || name === "reportClientError" || name === "clearErrorLogs") return def;
  const original = def.handler;
  return {
    ...def,
    handler: async (ctx: Ctx, args: never) => {
      try {
        return await original(ctx, args);
      } catch (e) {
        const { message, detail } = errorToText(e);
        await appendErrorLogSafe(ctx, { source: "server", location: `服务端动作 ${name}`, message, detail });
        throw e;
      }
    },
  };
}

// ---------- actions ----------

const rawActions = {
  getState: defineAction({
    description: "读取跑团存档：设计树设定（Q1–Q14）、当前角色、降生抽选、前世记录、编年史、前尘残片与遗藏待办。",
    request: z.object({}),
    response: stateResponse,
    async handler(ctx): Promise<StateResponse> {
      return toResponse(await loadState(ctx));
    },
  }),

  setSetting: defineAction({
    description: "在新游戏规则设定页修改一条整局规则（Q1–Q18/Q34），标记为已定。U-625：本局规则一经确认锁定（rulesLocked），锁定后本动作直接拒绝、不改任何字段——游戏内规则页只读、无后门可改。",
    request: z.object({
      key: z.enum(["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10", "q11", "q12", "q13", "q14", "q15", "q16", "q17", "q18", "q34"]),
      value: z.string().min(1).max(40),
    }),
    response: stateResponse,
    async handler(ctx, args): Promise<StateResponse> {
      const state = await loadState(ctx);
      // U-625 锁定守卫：规则已锁定本局时拒绝修改（与全站守卫同一
      // 口径——原样返回当前状态、不落盘、不记报错；客户端游戏内
      // 规则页本就只读，这里是防直调的最后一道门）。
      if (state.rulesLocked) return toResponse(state);
      state.settings[args.key] = { value: args.value, confirmed: true };
      const c = state.character;
      if (c) {
        if (args.key === "q4") {
          const realms = realmsFor(state.settings);
          if (c.realmIdx > realms.length - 1) {
            c.realmIdx = realms.length - 1; c.stageIdx = 0; c.cultivation = 0;
            const def = realms[c.realmIdx];
            if (def) { c.lifespan = def.lifespan; c.maxHp = def.hp; c.maxMp = def.mp; c.hp = Math.min(c.hp, c.maxHp); c.mp = Math.min(c.mp, c.maxMp); }
            // U-618：境界被新体系压低时，持有法宝可能跌破门槛——同步
            // 封存对齐（加成收回、法宝保留），与读档对齐同一入口。
            syncArtifactGate(state, c);
          }
          pushLog(state, c.lifeNo, "setting", `设定变更：境界体系改为「${args.value === "short5" ? "精简五境" : "经典九境"}」，境界已按新体系对齐。`);
        } else if (args.key === "q2") pushLog(state, c.lifeNo, "setting", "设定变更：主角开局已修改，将在下一世生效。");
        else if (args.key === "q3") pushLog(state, c.lifeNo, "setting", "设定变更：轮回规则已修改，下一次轮回按新规结算。");
        else if (args.key === "q6") pushLog(state, c.lifeNo, "setting", "设定变更：姓名/出身生成方式已修改，下一世生效。");
        else if (args.key === "q7") pushLog(state, c.lifeNo, "setting", "设定变更：记忆保留规则已修改，下一次轮回按新规判定。");
        else if (args.key === "q8") pushLog(state, c.lifeNo, "setting", "设定变更：判定骰已切换（Q8 为历史定稿，当前实际执行 Q34 分系统骰面，见 Q34 条）。");
        else if (args.key === "q9") pushLog(state, c.lifeNo, "setting", "设定变更：本命法宝来源已修改，下一世生效。");
        else if (args.key === "q10") pushLog(state, c.lifeNo, "setting", "设定变更：难度节奏已修改，即刻生效。");
        else if (args.key === "q11") pushLog(state, c.lifeNo, "setting", "设定变更：开局方式已修改，下一世降生按新规抽选。");
        else if (args.key === "q12") pushLog(state, c.lifeNo, "setting", "设定变更：记忆保留已按 Q12 新规（坐化三成/战死一成/横死不留，每境 +半成，封顶五成），下一次轮回生效。");
        else if (args.key === "q13") pushLog(state, c.lifeNo, "setting", "设定变更：降生抽选方式已修改，下一世生效。");
        else if (args.key === "q14") pushLog(state, c.lifeNo, "setting", "设定变更：扩展内容范围已修改。");
        else if (args.key === "q15") pushLog(state, c.lifeNo, "setting", "设定变更：战斗判定已修改（当前定稿：基准难度按敌手境界定，掷斗法骰 d20 对抗，胜负浮动按归一化胜势差结算，见 Q34）。");
        else if (args.key === "q16") pushLog(state, c.lifeNo, "setting", "设定变更：主线形式已修改（当前定稿轻主线——前世之谜碎片）。");
        else if (args.key === "q17") pushLog(state, c.lifeNo, "setting", "设定变更：灵石经济规则已修改（当前定稿物价按境界分档）。");
        else if (args.key === "q18") pushLog(state, c.lifeNo, "setting", "设定变更：社交系统范围已修改（当前定稿细致版：五种关系全做）。");
        else if (args.key === "q34") pushLog(state, c.lifeNo, "setting", "设定变更：判定骰已按 Q34 分系统（斗法 d20 / 突破 d100 / 探索 d80 / 副职 d60 / 社交 d40 / 差事 d50 / 记忆 d100），骰面上下限随相关属性动态适配，难度按相对差距重标。");
      }
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  confirmRules: defineAction({
    description: "U-625 确认本局规则：新游戏规则设定页点「确认规则」时调用——把当前设定锁定为本局规则（rulesLocked = true），此后 setSetting 一律拒绝、游戏内规则页只读，直到散功重开。已锁定时重复调用无副作用。尚无角色、无前世时，残留的未完成降生抽选一并作废（创建不做保存）。",
    request: z.object({}),
    response: stateResponse,
    async handler(ctx): Promise<StateResponse> {
      const state = await loadState(ctx);
      let dirty = false;
      if (!state.rulesLocked) {
        state.rulesLocked = true;
        dirty = true;
      }
      // 创建角色不做保存：尚无角色、无前世时残留的降生抽选（如上次
      // 创建中途直接关页面留下的）在重新确认规则时一并作废，进
      // 创建页重新抽，不续上次的半成品。
      if (!state.character && state.lives.length === 0 && state.birthDraw) {
        state.birthDraw = null;
        dirty = true;
      }
      if (dirty) await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  resetAll: defineAction({
    description: "散功重开：清空角色、前世、编年史、前尘残片与遗藏，设计树回到已定稿状态。",
    request: z.object({}),
    response: stateResponse,
    async handler(ctx): Promise<StateResponse> {
      const state = defaultState();
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  getErrorLogs: defineAction({
    description: "读取报错记录（控制面板用）：服务端动作失败与页面报错，含时间、位置、错误内容与堆栈，最新在前。",
    request: z.object({}),
    response: errorLogsResponse,
    async handler(ctx): Promise<ErrorLogsResponse> {
      const store = await loadErrorStore(ctx);
      return toErrorLogsResponse(store.logs);
    },
  }),

  reportClientError: defineAction({
    description: "页面报错回传：把浏览器端捕获的报错（运行时错误、未处理 Promise 拒绝、数据请求失败）记入报错记录，供控制面板查看。",
    request: z.object({
      location: z.string().min(1).max(160),
      message: z.string().min(1).max(1000),
      detail: z.string().max(4000).optional(),
    }),
    response: errorLogsResponse,
    async handler(ctx, args): Promise<ErrorLogsResponse> {
      await appendErrorLog(ctx, { source: "client", location: args.location, message: args.message, detail: args.detail ?? "" });
      const store = await loadErrorStore(ctx);
      ctx.invalidateQueries();
      return toErrorLogsResponse(store.logs);
    },
  }),

  clearErrorLogs: defineAction({
    description: "清空全部报错记录（控制面板用）；不影响游戏存档，序号继续递增以便区分新旧批次。",
    request: z.object({}),
    response: errorLogsResponse,
    async handler(ctx): Promise<ErrorLogsResponse> {
      const store = await loadErrorStore(ctx);
      store.logs = [];
      await saveErrorStore(ctx, store);
      ctx.invalidateQueries();
      return toErrorLogsResponse([]);
    },
  }),

  ...lifeActions,
  ...playActions,
  ...worldActions,
  ...boardActions,
  ...timedActions,
  ...aiActions,
};

export const Actions = Object.fromEntries(
  Object.entries(rawActions).map(([name, def]) => [name, withErrorLogging(name, def as AnyActionDef)]),
) as typeof rawActions satisfies ActionsModule;
