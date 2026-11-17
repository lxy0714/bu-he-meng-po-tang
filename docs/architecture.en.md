# Architecture

## Overview

*No Mengpo Soup* is a full-stack web game in React + TypeScript. Its design strictly separates four layers — **logic, content, storage, UI** — which is what makes this standalone open-source export possible.

```
Client (React) ──HTTP──> Server action layer ──> Pure-TS logic core ──> JSON content pools
                                │
                                └──> SaveStorage abstraction ──> storage impl (hosted: database / open-source: local)
```

## Logic core (pure TypeScript)

- `state.ts`: global state and the save load/store entry points.
- `dice.ts` / `checks.ts`: the check-expression parser, the modifier chain, and the central check config table (where the Q34 per-system dice formulas live).
- `rng.ts`: seeded randomness (seedrandom). Seeds are composed of save ID + life number + event type + action sequence, so the same save and action sequence always reproduce the same results; the PRNG's internal state can be exported/restored and is stored in the save.
- `reincarnation.ts`: settlement (grading, reincarnation points, memory retention, legacy-point redemption).
- `events-base.ts` and friends: the event deck (rarity-weighted draws without replacement), event templates (cost / loop / three-way / dual-solution / moral-fork) and the route system.

The logic core depends on no UI framework and no host environment, and can be ported to other engines as-is (see the Godot port on the roadmap).

## Content pools (JSON config tables)

All static content lives in `server/src/content/*.json`: 80 exploration events (split into generic / rare / regional / city / sect files), 12 locations, 12 NPCs, 28 treasures, techniques, talents, fates, spirit roots, enemies, plus system config tables for commissions, timed posts, sign-ins, forging and the fine clock.

Loading validates twice: zod schema checks plus a cross-pool reference-integrity self-check. Illegal configs fail loudly at startup instead of silently misbehaving at runtime. Content changes are JSON-only — no code changes.

## Storage layer

- `storage.ts` defines the async `SaveStorage` interface (write / read / list / remove). To the storage layer, a save is an opaque JSON string; slot mapping (game save, error log) is centralized in one place.
- The hosted edition implements it on a database (Drizzle); the open-source edition swaps in a local storage implementation with no changes to upper layers.
- `savefields.ts` is the save-field registry: every persistable field registers its path, type and old-save default, with a module-load self-check (duplicate registrations or missing parent paths throw immediately). Old saves migrate automatically through the registry, keeping the format stable over time.
- In-game save export/import JSON is compatible with the open-source edition, so progress migrates both ways.

## Server action layer

38 published actions (state reads, all gameplay actions, combat, social, sect, economy, reincarnation settlement, save export/import, AI pass-through, …), all returning through a single respond assembler. The hosted edition calls them through the platform bridge; the open-source edition exposes plain HTTP endpoints with unchanged action semantics.

## AI pass-through

The settings page's AI connection uses one unified adapter: cloud providers go through a server pass-through (the API key is only forwarded in the request — never persisted or logged server-side), Claude uses its native Messages API, and local models (Ollama / LM Studio) are called directly from the browser to the player's own machine. Keys themselves live only in the browser's localStorage.

## Client

A React single-page app: main menu (animated ink-wash title screen), rule setup / read-only rules page, birth creation, the five-page game board (Character / Map & Exploration / Cultivation & Sect / Social & Economy / Reincarnation History), encyclopedia, and settings. The visual system is the ink-wash rice-paper design language (CSS design tokens plus three theme modes: light / dark / follow system).
