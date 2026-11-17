# 不喝孟婆汤 · No Mengpo Soup

[English](README.en.md) ｜ 中文

一款单人轮回修仙文字游戏：废灵根凡人开局，带着封印的前世记忆，一世一世地活、死、再来——修为只留一成，记忆按死法保留，本命法宝带一件走。**死亡不是终点，是进度单位。**

水墨宣纸风界面 · 纯 TypeScript 逻辑核 · 全部内容 JSON 配置化

## 玩法亮点

- **轮回结算**：按本世评级发放轮回点；修为只留一成；记忆按坐化 / 战死 / 横死分别保留 30% / 10% / 0%（境界加成封顶 50%）
- **降生抽选**：姓名、出身、命格、天赋、灵根各抽 3 个候选，逐项随机或自选
- **分系统判定骰**：斗法 d20、突破 d100、探索 d80、副职 d60、社交 d40、宗门差事 d50——难度按「你的能力 vs 目标档位」的相对差距算，高境界不碾压低档位
- **细时钟**：时间按月流逝，每个动作都有耗时，寿元按月结算，限时帖按天倒计时
- **80 条探索事件**：代价抉择、见好就收、三选一、双解法、道德分叉等模板，外加五层分叉路线探索
- **28 件本命法宝**：按功能强度分级门槛，未达门槛封存、达境解封；可锻造、可掉落、宗门晋升赐宝
- **经营与社交**：委托板、限时帖、日常委托、地点签到图鉴、封印之蛋收集、前世遗藏与因果待办、12 位 NPC 五种关系
- **主线「前世之谜」**：收集 9 枚记忆碎片，逐步拼出前世身份
- **可选 AI 陪跑配置**：18 家云端厂商 + 本地模型（Ollama / LM Studio），API Key 只存本机

## 快速开始

需要 [Bun](https://bun.sh) 1.x。

```bash
bun install
bun run build   # 打包客户端到 client/dist/
bun run start   # 启动服务，默认 http://localhost:4173
```

- 存档保存在本地 `./data/game.db`（SQLite），可用环境变量 `GAME_DB_PATH` 改位置、`PORT` 改端口。
- 开发模式：`bun run dev`（服务端热重载；客户端改动后重新 `bun run build`）。
- 存档可在游戏内导出 / 导入 JSON，与 Muse 托管版格式互通，进度可互相迁移。
- AI 陪跑（可选）：在游戏内「设置 → AI 陪跑」里选厂商、填自己的 API Key。Key 只存浏览器本机，服务端仅透传给厂商、不落盘；本地模型由浏览器直连本机地址。

## 文档

- [玩法说明](docs/how-to-play.md)（[English](docs/how-to-play.en.md)）
- [设计思路](docs/design-notes.md)（[English](docs/design-notes.en.md)）——每条核心规则的定夺与取舍
- [来源与灵感](docs/sources.md)（[English](docs/sources.en.md)）——已核实的借鉴出处
- [架构说明](docs/architecture.md)（[English](docs/architecture.en.md)）
- [路线图](docs/roadmap.md)——回合制战斗、背包、多人（异步）、引擎移植等
- [更新公告](CHANGELOG.md)

## 独立版架构

本仓库是独立开源版：与 Muse 托管版同一套游戏代码与内容，平台耦合已解耦为本地实现，游戏逻辑代码未改语义。

| 托管版 | 独立版 |
| --- | --- |
| `@hatch/space-sdk` 的 `defineAction` / `z` / `Ctx` | `server/src/platform.ts`（同契约本地复刻） |
| 平台桥 RPC（客户端 `createActionClient`） | `client/src/api.ts` 改走 `fetch`：`POST /api/<action>` |
| 平台数据库（libsql） | `server/src/standalone/db.ts`：`bun:sqlite` + drizzle，`saves` 表形一致 |
| 平台动作分发与校验 | `server/src/standalone.ts`：`Bun.serve` 托管静态文件 + 按动作 schema 校验分发 |
| 存档存储 | 仍走既有 `SaveStorage` 抽象（`server/src/storage.ts`），只换了 `ctx.db` 的来源 |

目录：`client/` 前端（React），`server/` 后端动作与全部内容池（`server/src/content/*.json`）；规则与数值都在配置表和 `server/src/checks.ts` / `dice.ts` 里，改内容只改数据文件。详见[架构说明](docs/architecture.md)。

## 许可证

MIT，见 [LICENSE](./LICENSE)。游戏内水墨美术为本项目 AI 生成的自有素材，随仓库一并发布。
