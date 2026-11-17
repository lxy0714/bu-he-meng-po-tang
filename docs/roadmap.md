# 路线图 · Roadmap

本页是《不喝孟婆汤》的公开路线图，条目均来自已定稿的 625 项开发计划（当前进度 50/625）。顺序为大致排期，具体以实际交付为准。

This is the public roadmap for *No Mengpo Soup*. Every item comes from the settled 625-item development plan (current progress: 50/625). Ordering is indicative; actual delivery prevails.

## 近期 · Near term

- **功法系统（Q38）**：功法熟练度层（使用与练习增长、满级进精通档）、功法页面（流派搭配 / 等级成长 / 练习入口）、轮回结算自选一门已精通功法免费带走（U-612–U-614）。
  **Technique system (Q38)**: a proficiency layer for techniques (grows by use and practice, graduating to a mastery tier), a technique page (build synergies / growth / practice entry), and one mastered technique carried free at settlement (U-612–U-614).
- **计划内事件与系统条目**：探索事件分布密度、境界与区域解锁挂钩等既定条目继续逐项推进。
  **Planned event & system items**: exploration-event distribution density, realm-gated region unlocks, and the remaining settled items, delivered one by one.

## 中期 · Mid term

- **回合制战斗（Q39）**：斗法全面改回合制——战斗属性体系（攻击 / 防御 / 速度 / 灵力），五行与流派克制、法宝特效先行，套装、助战、组合技、经脉、翻盘随后；旧单次掷骰结算退役。
  **Turn-based combat (Q39)**: combat becomes fully turn-based — a combat-attribute system (attack / defense / speed / spirit power), five-element and school counters plus treasure effects first, then sets, assists, combo skills, meridians and comeback effects; the old single-roll resolution retires.
- **背包系统（Q36）**：背包（装备栏 + 道具栏）、装备套装、储物袋扩容、跨世储物；丹药囊并入背包。
  **Backpack system (Q36)**: a backpack (equipment + item slots), equipment sets, storage-bag expansion and cross-life storage; the pill pouch merges into it.
- **走火入魔分轻重落地（Q35）**：轻重判定与抢救道具按配置表实施。
  **Graded qi deviation (Q35)**: severity checks and rescue items implemented per the config tables.

## 长期 · Long term

- **多人（异步方向，后续再加）**：实时多人与 AI 担任 GM 的组合实现难度过高，已定方向为异步多人——候选形态包括接力轮回（轮流扮演同一灵魂的每一世）、异步斗法（挑战朋友角色的数据镜像）、跨玩家遗藏（你埋下的宝，别人能挖到）、互看轮回树与排行榜。具体形态待定，单人仍是主线。
  **Multiplayer (asynchronous, later)**: real-time multiplayer with an AI game master proved impractical; the settled direction is asynchronous multiplayer — candidate forms include relay reincarnation (players take turns living one soul's successive lives), asynchronous duels (against data mirrors of friends' characters), cross-player buried treasures, and shared reincarnation trees / leaderboards. The exact form is undecided; single-player remains the main line.
- **飞升后新篇章（D-5）**：飞升后开启完整新篇章（先剧情版，后新地图与新规则）。
  **Post-ascension chapters (D-5)**: a full new chapter after ascension (story version first, then new maps and rules).
- **有限轮回挑战模式（D-2）**：无限轮回为默认；有限世数作为可选挑战模式。
  **Limited-lives challenge mode (D-2)**: unlimited reincarnation stays the default; a limited-lives run becomes an optional challenge mode.
- **引擎移植与上架**：规则定型后移植 Godot（逻辑核为纯 TypeScript、内容全在 JSON 配置中，移植面清晰），目标平台 Steam 优先，其次 TapTap。
  **Engine port & store release**: after the rules freeze, port to Godot (the logic core is pure TypeScript and all content lives in JSON configs, so the port surface is clean); Steam first, then TapTap.
- **游戏 UI 国际化（i18n）**：当前游戏界面仅中文；仓库文档已双语。UI 双语需将全部客户端文案抽离为语言包，列为独立工程排期。
  **Game UI internationalization (i18n)**: the game UI is currently Chinese-only; repository documentation is already bilingual. UI bilingual support requires extracting all client text into language packs and is scheduled as its own project.

## 开源同步 · Open-source sync

托管版为开发主线；本仓库将在里程碑节点同步发布新版（见 [更新公告](../CHANGELOG.md)）。

The hosted version is the development mainline; this repository will publish new releases at milestone points (see the [Changelog](../CHANGELOG.md)).
