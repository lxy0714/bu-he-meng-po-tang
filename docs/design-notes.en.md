# Design Notes

Every core rule in this game was decided deliberately. Starting 2026-11-08, the design went through rounds of point-by-point decisions (recorded as Q1–Q42 and D-1–D-6): rules were argued to a conclusion first, written into a 625-item development plan, and only then implemented. This page explains the reasoning behind the major choices.

## In one sentence

**Death is not the end — it is the unit of progress.** You play a soul carrying sealed past-life memories, living, dying and returning life after life, trading each life for cross-life accumulation on the road to immortality.

## Reincarnation rules

- **The worst possible start**: a mortal with a crippled spirit root and sealed memories — the lower the starting point, the more each life's growth matters.
- **Only one tenth of cultivation carries over** (Q3 / D-6): after death, 10% of cultivation passes to the next life. Keep less and every life feels wasted; keep more and death costs nothing. One tenth is the calibrated point.
- **Memory retention depends on how you die** (Q12): dying of old age keeps 30%, dying in battle 10%, a violent death nothing; each higher realm adds 5 percentage points, capped at 50%. How you die becomes a strategy, as important as how long you live.
- **Qi deviation is graded** (Q35, amending Q12): early versions made any deviation annihilate the soul; players found it too harsh. Light deviation now means heavy injury plus cultivation loss; only severe deviation destroys the soul — and a rescue item can be consumed to survive it once.
- **Natal treasures** (Q9 / Q40): the first life has none; after the first death you pick one to carry, swappable each life. There are 28 treasures in seven threshold tiers by functional strength — below the threshold a treasure stays sealed and unseals automatically when you reach the realm. Settlement only lists treasures actually held this life and at threshold.

## Birth: random and chosen, side by side

Name, origin, fate, talent and spirit root can each independently be random or hand-picked. Random draws offer 3 candidates from large pools (48 names / 36 origins / 18 fates / 24 talents / 10 roots). Randomness gives a sense of fate; choice gives control; neither excludes the other.

## Three currencies, strictly separated

- **Reincarnation points** (the cross-life currency): granted by the life's grade (S 6 / A 4 / B 3 / C 2), plus tiers by newly collected memory shards this life. At birth they can be allocated point-by-point to Combat / Spirit / Fortune / Physique (cap 10 each), spent 3 at a time to redraw talent and root candidates, or used to buy birth boons.
- **Legacy points**: used only at settlement to redeem equipment and techniques (borrowed from *Hundred Lives to Immortality* — see [Sources & Inspiration](sources.en.md)).
- **Spirit stones** (in-life currency): fully cleared on death; every life starts with a fixed 50 — no hoarding snowballs; each life earns its own way.

## Checks: why one die does not fit all

The game originally rolled a single d150 for everything. Its standard deviation (~43) dwarfed single-digit attribute modifiers, making outcomes nearly independent of character growth. Q34 therefore introduced **per-system dice**, with each die's range computed live from the relevant attribute:

| System | Die | Range driven by |
| --- | --- | --- |
| Combat / duels / revenge | d20 | Combat |
| Breakthrough | d100 | Realm, Fortune |
| Exploration events | d80 | Fortune |
| Crafting professions | d60 | Profession proficiency, Spirit |
| Social | d40 | Favor, Fortune |
| Sect errands | d50 | Sect rank, Physique |
| Memory retention | d100 | Percentage rules (Q12) |

Together with a **relative-gap principle**: every check's difficulty is computed from the gap between the player's relevant capability and the target's tier — as your realm rises, the opponents and events you meet scale with you, so there is no stage where a high realm trivially crushes low-tier content.

## The fine clock: time flows by month

Q37 refined time from years to months (1 year = 12 months): cultivation takes 12 months, exploration 3, combat 1, travel 1–6 by distance — all costs in a config table. Age is derived from accumulated months; lifespan (120 years = 1440 months) settles monthly; timed posts count down in days/months and daily commissions refresh monthly. Time becomes a resource you can feel, not a jumping number.

## Content & engineering

- **Fully data-driven content**: events (80), locations (12), NPCs (12), treasures (28), techniques, enemies and more all live in JSON config tables, validated for structure and cross-references at load. Content changes need no code changes.
- **Save engineering first**: a storage abstraction layer, a save-field registry and PRNG state save/restore landed early — the save format is stable and migratable, and is what made this open-source export possible.
- **Rules before the run**: a run's rules are set and locked at new game; in-game they are read-only. Rules about the first life cannot change mid-run without breaking the run's consistency, so the only entrance is at the start.

## Difficulty

Moderately punishing (Q10). Breakthroughs have failure protection (each failure lowers the next difficulty by 5, up to −20), and resting restores 60% health plus a little cultivation — harsh, but never a dead end.
