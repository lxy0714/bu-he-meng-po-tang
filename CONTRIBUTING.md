# 贡献指南 · Contributing

欢迎提交 Issue 与 Pull Request。
Issues and Pull Requests are welcome.

## 本地运行 · Local setup

见 README 的「快速开始」：`bun install && bun run build && bun run start`。
See the README quick start: `bun install && bun run build && bun run start`.

## 改内容 · Changing content

- 优先改 `server/src/content/*.json` 配置表，不要把内容写死在代码里。配置在加载时有结构与引用校验，非法配置会在启动时报错。
  Prefer editing the JSON config tables in `server/src/content/` over hard-coding content. Configs are schema- and reference-validated at load; illegal configs fail at startup.
- 判定公式集中在 `server/src/checks.ts` 与 `server/src/dice.ts`；新增存档字段必须登记到 `server/src/savefields.ts` 并给旧存档默认值。
  Check formulas live in `server/src/checks.ts` and `server/src/dice.ts`. New save fields must be registered in `server/src/savefields.ts` with an old-save default.

## 提交前 · Before submitting

- 跑通 `bun run build` 与 `bun run typecheck`。
  Make sure `bun run build` and `bun run typecheck` pass.
- 规则层面的改动请先开 Issue 讨论：本作的核心规则都有定夺记录（见 [设计思路](docs/design-notes.md)），改规则等于改定夺，需要先达成一致。
  For rule-level changes, open an Issue first: the game's core rules have recorded design decisions (see the [Design Notes](docs/design-notes.en.md)), and changing a rule means revisiting a settled decision.
