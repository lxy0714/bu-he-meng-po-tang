# 更新公告 · Changelog

> 本文件记录《不喝孟婆汤》的真实开发里程碑。v1.0.0 为开源初始版本，汇总此前在托管环境中完成的全部成果；日期均为实际完成日期，不设虚构版本。
>
> This file records the real development milestones of *No Mengpo Soup*. v1.0.0 is the initial open-source release, collecting everything built before it in a hosted environment. All dates are actual completion dates; no fictional versions.

## v1.2.0 — 行动点、渡劫与翻格 · Action Points, Tribulation & the Grid（2026-11-21）

### 2026-11-21 — 事件系统十项 · Ten Event-System Items

- 随机探索三模式（U-402）：地图页新增「随机探索」区——远征（偏灵石）、探秘（偏材料）、试炼塔（偏修为）三模式各有独立事件池（各 8 条），一次进入算一次探索行动（3 个月），不设境界门槛（难度按相对差距缩放），与地点探索的密度、隐藏埋点、三界秘境掉落槽互不干扰。
  Three random-exploration modes (U-402): a new Random Exploration zone on the map tab — Expedition (spirit-stone leaning), Delving (material leaning) and the Trial Tower (cultivation leaning), each with its own event pool (8 events apiece). One entry is one exploration action (3 months) with no realm gate (difficulty scales by relative gap), fully independent of location density, hidden caches and secret-realm slots.
- 探索分类（U-403）：探索结果按类型打标（际遇 / 战斗 / 采集 / 秘闻等），日志与编年史可按类型回看，角色页有本世分类计数。
  Exploration categories (U-403): exploration outcomes are tagged by type (encounter / combat / gathering / lore and more); logs and the chronicle can be filtered by type, and the character page counts this life's outcomes per type.
- 多阶段连环任务（U-407）：委托板新增连环任务（3 条链共 9 段），段段相扣、整链限时（按月计），完成整链另有大奖；与普通委托并存，同受接取上限约束。
  Multi-stage quest chains (U-407): the commission board gains chained quests (3 chains, 9 stages) — stages unlock in sequence under a whole-chain monthly deadline, with a bonus prize for finishing a chain; they coexist with ordinary commissions under the same holding cap.
- 单轮目标（U-408）：每轮从 3 个候选里自选 1 个小目标（如探索若干次、抵达若干地点），达成即领奖，过期自动换新。
  Round goals (U-408): each round, pick 1 of 3 candidate mini-goals (explore a number of times, reach a number of locations, …); completing it pays out at once, and an expired goal is replaced automatically.
- 年度行动点（U-409）：按细时钟适配的年度行动点——每年 40 点，各动作耗点进配置表（修炼 20 / 探索 10 / 突破 15 / 副职 12 / 宗门差事 12 / 斗法 6 / 社交 6 / 旅行 4），休整不耗点以防卡死；耗尽后本年只能做免费动作，跨年刷新。
  Yearly action points (U-409): a yearly action-point budget adapted to the fine clock — 40 points per year, per-action costs in a config table (cultivate 20 / explore 10 / breakthrough 15 / craft 12 / sect errand 12 / duel 6 / social 6 / travel 4), resting always free so a spent year can never soft-lock; the budget refreshes each new year.
- 年度事件（U-410）：每年随机触发一次年度大事件（兽潮、宗门大比之类），多选一抉择，结算走既有奖惩与判定链。
  Annual events (U-410): once a year a grand event strikes at random (a beast tide, a sect tournament, …) — a multi-way choice settled through the existing reward and check pipeline.
- 翻格遇事件（U-412）：新增 3×3 覆面棋盘探索——开局算一次探索行动（3 个月 + 10 行动点），九格在战斗 / 机缘 / 休整 / 狩猎 / 突破五类中按权重随机分布、发牌即定死，逐格翻开逐格结算；章节题词随境界推进（共九章）。
  Flip-grid exploration (U-412): a 3×3 face-down board — opening a board is one exploration action (3 months + 10 action points); its nine cells are dealt once from five types (combat / fortune / rest / hunt / breakthrough) by configured weights and settled one flip at a time; chapter verses advance with your realm (nine chapters).
- 破境丹与禁地夺丹（U-414）：大境界突破新增破境丹门槛——无丹突破被拦并明示夺丹指引（不耗行动点与时间），持丹突破判定成功才消耗，失败不消耗；小境界突破不需要丹。修炼宗门页新增「禁地夺丹」：大圆满时挑战对应禁地 Boss（8 位，按目标境界配表）夺丹，按一次斗法计，败可无限再战。
  Breakthrough pills & forbidden-ground duels (U-414): major-realm breakthroughs now require a Breakthrough Pill — without one the attempt is blocked with directions to get one (no action points or time charged); the pill is consumed only when the breakthrough check succeeds, never on failure; minor-stage breakthroughs need no pill. A new Forbidden-Ground Duel on the cultivation page lets a cultivator at Perfection challenge the matching guardian boss (8, one per target realm) for a pill, at the cost of one duel, retrying freely after a loss.
- 渡劫仪式（U-415）：大境界突破判定成功后不直接升境，进入渡劫三段——雷劫来临叙事卡 → 渡劫战（雷劫化身按目标境界配表，走斗法判定链）→ 劫后结算；胜则正式升境并消耗破境丹，败则退回本境大圆满（丹不消耗、修为全额退回、渡劫战气血钳制不致死）；渡劫状态进存档，可中断续走。
  The tribulation rite (U-415): a successful major-breakthrough check no longer raises the realm directly — it opens a three-stage tribulation (an omen card, a duel against the tribulation avatar tiered to the target realm on the combat check chain, then settlement). Victory raises the realm and consumes the pill; defeat returns you to Perfection of the current realm (pill kept, cultivation fully refunded, the tribulation duel cannot kill). Tribulation state is saved and can be resumed.
- 属性共鸣 / 失衡（U-416）：按四维最高 / 最低比值实时判定三态——比值 ≤1.6 为「四象共鸣」（修炼 +5%，探索可触发共鸣奇遇），≥2.5 为「灵力失衡」（探索与修炼可触发灵力暴走二选一事件，并留 6 个月「灵力紊乱」：修炼 −10%），中间为平稳；角色页实时显示状态，暴走结算钳制气血、绝不致死。
  Attribute resonance & imbalance (U-416): the ratio of your highest to lowest attribute is judged live in three states — at ≤1.6, Four-Signs Resonance (cultivation +5%, with a chance of resonance encounters while exploring); at ≥2.5, Spiritual Imbalance (exploration and cultivation can trigger a two-choice mana-surge event and leave a 6-month Spiritual Turmoil debuff, cultivation −10%); in between, Balanced. The character page shows the state live; surge settlements clamp health and can never kill.

## v1.1.0 — 三界秘境与无灵根 · Secret Realms & the Rootless（2026-11-20）

### 2026-11-18 ~ 20 — 功法品阶、无灵根、探索调参与三界秘境 · Technique Tiers, the Rootless, Exploration Tuning & Secret Realms

- 功法品阶与层数（U-626）：功法新增凡/黄/玄/地/天五阶品阶；熟练度改层数制（每层 20 点，黄 6 层 / 玄 8 层 / 地 10 层），修满即精通、加成升一档；老存档熟练度按比例换算不清零。
  Technique tiers & layers (U-626): techniques gained five tiers （凡/黄/玄/地/天）; proficiency became a layer system (20 points per layer; 6/8/10 layers by tier) — a full stack means mastery and a stronger bonus; legacy proficiency converts proportionally, never wiped.
- 无灵根（U-627）：降生灵根池新增「无灵根」——引气无门，只能修体修类功法，修炼改炼体（体魄驱动）；起步体修功法《凡骨锻体篇》进普通功法池，无灵根开局自带；引气类功法在签到/残页/赎回/免费带走全部途径被拦截并明示。
  The Rootless (U-627): a new birth root, "no spiritual root" — qi-gathering techniques are barred on every acquisition path; cultivation becomes body tempering driven by physique; the starter body technique 《凡骨锻体篇》 joins the common pool and is granted at birth.
- 探索密度调参（U-399）：每个地点配事件密度与隐藏埋点（调参表），探索有概率是「安静步」或撞见隐藏发现，埋点挖完为止、轮回重置；安静步同样独立结算残页/拾矿/法宝掉落钩子，不因无事发生而少掉机会。
  Exploration tuning (U-399): per-location event density and hidden-cache counts in a tuning table; exploration can be a "quiet step" or a hidden discovery, caches deplete per life and reset on reincarnation; quiet steps still roll the page/ore/treasure hooks independently.
- 地点境界门槛落定（U-400）：门槛表按现状定稿——7 处无门槛、筑基 3 处、金丹 1 处、元婴 1 处，硬锁；青冥秘境特例保留（第一世需筑基，第二世起取消）。
  Location realm gates settled (U-400): 7 locations open, 3 at Foundation, 1 at Golden Core, 1 at Nascent Soul, hard locks; the Azure Secret Realm exception stays (Foundation required in the first life only).
- 三界秘境（U-401）：地图 12 → 15 处，新增人间「沉沙古城」（无门槛）、洞天「蓬莱洞天」（筑基）、地府「黄泉鬼域」（元婴）；每界每世三类固定掉落槽（稀有丹药 / 失传典籍 / 隐藏 Boss），领完即空、轮回重置；三只隐藏 Boss 须先触发专属前置事件才现身，打赢给传承点与对应档法宝。
  Three secret realms (U-401): the map grew from 12 to 15 locations — Sunken City (open), Penglai Grotto (Foundation), Yellow Springs (Nascent Soul); each realm holds three fixed per-life caches (rare pills / a lost technique / a hidden boss), emptied once taken and reset on reincarnation; each boss appears only after its bespoke trigger event and pays heritage points plus a tiered treasure.
- 主菜单美术与修复：主菜单换上「忘川彼岸」全屏水墨背景（奈何桥 + 孟婆汤摊 + 彼岸花），按钮改半透明宣纸纸笺、靠左竖列；题屏锁定不可滚动；修复散功重开失败被静默吞掉、导致「输入不后悔后无法开新游戏」的问题（散功桥接失败自动重试，确认弹窗成功前不关闭、失败明示可原地重试）；主菜单两条按钮说明文案过长被截断，已缩短。
  Main-menu art & fixes: a full-screen ink-wash backdrop (Bridge of Helplessness, Mengpo's stall, red spider lilies) with translucent rice-paper buttons in a left column; the menu screen no longer scrolls; fixed a silent reset failure that made "new game" appear dead after typing the confirmation (bridge failures now auto-retry, the confirm dialog stays open until success and explains failures in place); two over-long menu hints that were truncated have been shortened.

## v1.0.0 — 开源初始版本 · Initial Open-Source Release（2026-11-17）

### 2026-11-16 — 细时钟、法宝、设置与视觉 · Fine Clock, Treasures, Settings, Visuals

- 细时钟（Q37）：时间改为按月累计，全部动作耗时进配置表；寿元结算、限时帖倒计时、日常委托刷新改按月/天计（U-608–U-611）。
  Fine clock (Q37): time now accumulates by month, with every action's cost in a config table; lifespan settlement, timed-post countdowns and daily-commission refreshes all run on months/days (U-608–U-611).
- 本命法宝大做（Q40）：法宝池 6 → 28 件，按功能强度分级使用门槛，未达门槛封存、达境自动解封；炼制双门槛（炼器等级 + 境界）；新增探索掉落、宗门晋升、委托奖励三条获取途径（U-617–U-620）。
  Natal treasures overhaul (Q40): the pool grew from 6 to 28, with per-item realm thresholds by functional strength — sealed below threshold, auto-unsealed on reaching it; dual crafting gates (crafting level + realm); three new acquisition paths: exploration drops, sect promotions, commission rewards (U-617–U-620).
- 设置页与 AI 连接（Q41）：多栏设置页；AI 陪跑可连可不连，18 家云端预设 + 本地模型（Ollama / LM Studio），API Key 只存玩家本机。
  Settings & AI connection (Q41): a multi-tab settings page; optional AI companion with 18 cloud presets plus local models (Ollama / LM Studio); API keys are stored only on the player's machine.
- 水墨宣纸视觉（Q42）与主菜单：全站换水墨宣纸风格；打开先见主菜单，新游戏先设定规则并锁定再降生，游戏内规则只读（U-621、U-623–U-625）。
  Ink-wash visual identity (Q42) and a main menu: the whole UI reskinned to rice-paper ink style; the game opens on a main menu, new games set and lock their rules before birth, and in-game rules are read-only (U-621, U-623–U-625).
- 2026-11-17：游戏正式更名为《不喝孟婆汤》。
  2026-11-17: the game was officially renamed to *No Mengpo Soup* （不喝孟婆汤）.

### 2026-11-14 ~ 15 — 判定改革与事件系统 · Check Reform & the Event System

- Q34：废除全游戏统一 d150，改为分系统骰子——斗法 d20 / 突破 d100 / 探索 d80 / 副职 d60 / 社交 d40 / 宗门差事 d50 / 记忆保留 d100；判定难度按「玩家能力 vs 目标档位」的相对差距计算。
  Q34: the single global d150 was replaced by per-system dice — combat d20 / breakthrough d100 / exploration d80 / crafting d60 / social d40 / sect errands d50 / memory retention d100 — with difficulty computed from the relative gap between the player's capability and the target tier.
- Q35：走火入魔分轻重——轻度重伤 + 修为折损，重度才按魂飞魄散结算；持有抢救道具可消耗一件救回一次。
  Q35: qi deviation is now graded — light cases mean heavy injury plus cultivation loss, only severe cases end the soul; a rescue item can be consumed to survive once.
- 事件池 40 → 80 并按稀有度权重组牌；事件模板：二选一代价、见好就收、三选一抉择、双解法、道德分叉；分叉路线探索（五层、每层三节点）；委托板、限时帖、日常委托、地点签到与签到图鉴、封印之蛋收集、事件分包与分批投放、按地点排布掉落（U-375–U-396）。
  The event pool grew from 40 to 80 with rarity-weighted deck building; new event templates (costly choices, press-your-luck loops, three-way choices, dual solutions, moral forks); forked route exploration (five layers, three nodes each); commission board, timed posts, daily commissions, location sign-ins with a codex, sealed-egg collection, event packs and staged releases, location-based drops (U-375–U-396).

### 2026-11-13 — 工程基础 · Engineering Foundations

- 判定链：判定表达式解析器、modifier 链、结构化判定返回、检定配置表、优势/劣势双掷记号（U-563、U-568–U-572）。
  Check pipeline: a check-expression parser, a modifier chain, structured check results, a central check config table, and advantage/disadvantage double-roll notation (U-563, U-568–U-572).
- 存档与内容工程：存档存储抽象层、存档字段注册表、PRNG 状态保存与恢复；全部静态内容迁入 JSON 配置表并加加载校验（U-565、U-574、U-596、U-598）。
  Save & content engineering: a storage abstraction layer, a save-field registry, PRNG state save/restore; all static content moved into validated JSON config tables (U-565, U-574, U-596, U-598).
- 轮回点货币：按本世评级发放、四维加点、开局强化购买、主线碎片分档奖励；灵石改为死后清零、每世固定 50（U-002、U-021、U-322、U-326）。
  Reincarnation points: granted by life grade, allocatable to four attributes, spendable on birth boons and shard-tier rewards; spirit stones now reset to a fixed 50 each life (U-002, U-021, U-322, U-326).

### 2026-11-08 — 项目启动 · Project Start

- 经多轮定夺（Q1–Q18）确立核心规则：废灵根凡人开局、携带封印的前世记忆；死亡即轮回，修为只留一成，记忆保留按境界与死法，本命法宝带一件走；经典九境（炼气 → 筑基 → 金丹 → 元婴 → 化神 → 炼虚 → 合体 → 大乘 → 渡劫）。
  The core rules were settled through rounds of design decisions (Q1–Q18): start as a mortal with a crippled spirit root and sealed past-life memories; death means reincarnation, keeping one tenth of cultivation, with memory retention by realm and manner of death, and one natal treasure carried over; the classic nine realms from Qi Refining to Tribulation.
