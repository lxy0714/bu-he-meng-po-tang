# No Mengpo Soup · 不喝孟婆汤

English ｜ [中文](README.md)

A single-player reincarnation-cultivation text game. You start as a mortal with a crippled spirit root and sealed past-life memories, and live, die, and return, life after life — keeping one tenth of your cultivation, retaining memory according to how you died, and carrying one natal treasure with you. **Death is not the end; it is the unit of progress.**

Ink-wash rice-paper UI · pure TypeScript logic core · all content in JSON config tables

## Highlights

- **Reincarnation settlement**: reincarnation points granted by each life's grade; only 10% of cultivation carries over; memory retention by manner of death — 30% for dying of old age, 10% in battle, 0% for a violent death (realm bonus capped at 50%)
- **Birth draw**: name, origin, fate, talent and spirit root each draw 3 candidates; every field can be random or hand-picked
- **Per-system check dice**: combat d20, breakthrough d100, exploration d80, crafting d60, social d40, sect errands d50 — difficulty scales with the relative gap between your capability and the target tier, so high realms never trivially crush low-tier content
- **Fine clock**: time flows by month, every action has a time cost, lifespan settles monthly, timed posts count down in days
- **80 exploration events**: costly choices, press-your-luck loops, three-way choices, dual solutions, moral forks — plus five-layer forked route exploration
- **28 natal treasures**: tiered realm thresholds by functional strength; sealed below threshold, auto-unsealed on reaching it; forgeable, droppable, granted by sect promotions
- **Management & social**: commission board, timed posts, daily commissions, sign-in codex, sealed-egg collection, past-life buried treasures and a karma to-do list, 12 NPCs with five relationship types
- **Main storyline "The Past-Life Mystery"**: collect 9 memory shards to piece together who you were
- **Optional AI companion setup**: 18 cloud providers plus local models (Ollama / LM Studio); API keys never leave your machine

## Quick start

Requires [Bun](https://bun.sh) 1.x.

```bash
bun install
bun run build   # bundle the client into client/dist/
bun run start   # serve at http://localhost:4173 by default
```

- Saves live in a local `./data/game.db` (SQLite). Use `GAME_DB_PATH` to relocate it and `PORT` to change the port.
- Development mode: `bun run dev` (server hot-reloads; rebuild the client after client changes).
- Saves export/import as JSON in-game and are format-compatible with the hosted Muse edition — progress migrates both ways.
- AI companion (optional): in-game under Settings → AI Companion, pick a provider and enter your own API key. Keys are stored only in your browser; the server merely forwards them to the provider and never persists them. Local models are called directly from your browser to your own machine.

## Documentation

- [How to Play](docs/how-to-play.en.md)（[中文](docs/how-to-play.md)）
- [Design Notes](docs/design-notes.en.md)（[中文](docs/design-notes.md)）— the decisions and trade-offs behind every core rule
- [Sources & Inspiration](docs/sources.en.md)（[中文](docs/sources.md)）— verified attributions for borrowed mechanisms
- [Architecture](docs/architecture.en.md)（[中文](docs/architecture.md)）
- [Roadmap](docs/roadmap.md) — turn-based combat, backpack system, asynchronous multiplayer, engine port
- [Changelog](CHANGELOG.md)

## Standalone architecture

This repository is the standalone open-source edition: the same game code and content as the hosted Muse edition, with the platform coupling replaced by local implementations and no change to game-logic semantics.

| Hosted edition | Standalone edition |
| --- | --- |
| `defineAction` / `z` / `Ctx` from `@hatch/space-sdk` | `server/src/platform.ts` (local reimplementation of the same contract) |
| Platform bridge RPC (client `createActionClient`) | `client/src/api.ts` uses `fetch`: `POST /api/<action>` |
| Platform database (libsql) | `server/src/standalone/db.ts`: `bun:sqlite` + drizzle, identical `saves` table shape |
| Platform action dispatch & validation | `server/src/standalone.ts`: `Bun.serve` static hosting + schema-validated dispatch |
| Save storage | Still the existing `SaveStorage` abstraction (`server/src/storage.ts`); only the source of `ctx.db` changed |

Layout: `client/` is the React front end; `server/` holds the backend actions and all content pools (`server/src/content/*.json`). Rules and numbers live in the config tables and in `server/src/checks.ts` / `dice.ts` — content changes are data-file changes. See [Architecture](docs/architecture.en.md) for details.

## License

MIT — see [LICENSE](./LICENSE). The in-game ink-wash artwork is original AI-generated material from this project and is published with this repository.
