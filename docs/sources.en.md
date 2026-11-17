# Sources & Inspiration

This game's mechanics have traceable origins. This page records only verified borrowings: what was borrowed is mechanism design — all text, numbers and content in this repository are original.

## Primary source: *Hundred Lives to Immortality*

- 《百世成仙》 (*Hundred Lives to Immortality*), by Kaifei Studio, Steam, 2026-10-08
- Store page: https://store.steampowered.com/app/5235070/Hundred_Lives_to_Immortality/
- Mechanisms borrowed and implemented:
  - **Legacy-point redemption**: at reincarnation settlement, spend a limited pool of points, priced by quality, to carry equipment/techniques into the next life.
  - **Past-life buried treasures**: bury an item at a chosen location in this life; travel there in a later life to retrieve it.
  - **World-Inheriting Jade**: a keepsake whose cross-life bonuses stack and can be strengthened by sacrificing lifespan.
  - **Karma to-do list**: unfinished past-life karma and unretrieved treasures are kept as a checklist to be settled item by item.
- **Reverse disclaimer**: that game has never advertised randomized starting identity/talents/fate. This game's birth draw (candidates drawn for name, origin, fate, talent and spirit root) is an original design and does **not** come from it.

## Research base

In November 2026 the project ran a systematic survey: 100 cultivation/reincarnation games, 100 reincarnation-cultivation novels and 24 open-source GitHub repositories, each analyzed for borrowable mechanisms. Beyond the primary source above, borrowings actually implemented include:

| Implemented feature | Source |
| --- | --- |
| Forked route exploration (five layers, three nodes each) | Route structure of *Slay the Spire* |
| Commission board (accept-based side quests) | *Gujian 3* （古剑奇谭三） |
| Timed posts (dual countdowns, reputation settlement) | Novel *Cultivation Chat Group* （修真聊天群） |
| Daily commissions (monthly refresh, location-triggered) | Novel 我的微信连三界 |
| Location sign-ins and the sign-in codex | Novel 修仙：神级签到系统 |
| Sealed-egg collection (sets trade for past-life treasure clues) | *Xuan-Yuan Sword VI* （轩辕剑六）* |
| Moral-fork events (kindness / plunder branches) | *Cultivation Story: Reincarnation* （修仙故事：轮回） |
| Random daily crises / windfalls | *Amazing Cultivation Simulator* （了不起的修仙模拟器） |
| Event packs (main story / side packs unlocked by life count) | *Gujian 2* （古剑奇谭二） |
| Staged event releases (deck pinned per release version) | *Xuan-Yuan Sword: The Gate of Firmament* side story （轩辕剑外传：穹之扉） |
| Location-based event drops | *Xuan-Yuan Sword VII* （轩辕剑柒） |
| Treasure forging (seven ore tiers, market ore shop) | 造化仙缘 |
| Crafting-profession proficiency and breakthrough tiers | Novel 苟在神诡求长生 |

\* No Steam store page for *Xuan-Yuan Sword VI* could be found during the survey, so this source is not fully verified; the mechanism was adopted after evaluation and is flagged here for honesty.

## Artwork

The ink-wash images in the game are original assets generated with AI during this project's development (in `client/src/assets/`) and are published with this repository.

## Note

The borrowings listed here are at the level of mechanism design and homage; they are not copies of any original work's text, artwork or numbers. If you are an author of a listed work and believe an attribution is wrong, please open an Issue in this repository so we can correct it.
