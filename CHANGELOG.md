# 更新公告 · Changelog

> 本文件记录《不喝孟婆汤》的真实开发里程碑。v1.0.0 为开源初始版本，汇总此前在托管环境中完成的全部成果；日期均为实际完成日期，不设虚构版本。
>
> This file records the real development milestones of *No Mengpo Soup*. v1.0.0 is the initial open-source release, collecting everything built before it in a hosted environment. All dates are actual completion dates; no fictional versions.

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
