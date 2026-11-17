// 轮回修仙跑团 — 事件池门面：80 个事件的本体自 U-565 起迁入 JSON
// 配置、经 schema 校验与跨池引用自检后加载；U-376 起按事件组织法拆
// 成五分文件（content/events/ 下 generic 通用 / rare 稀有 / regional
// 地区专属 / city 城市专属 / sect 宗门专属），事件类型、schema、
// 稀有度分档、分桶归属与合并加载都在基础文件 events-base.ts 一处，
// content.ts 转发导出。本文件只做再导出，保持既有 import 路径不变；
// 新增事件 = 往对应桶的 JSON 里加一条（放错桶会在加载时被自检拦下）。
// U-375 补做：每条事件带 commonality 稀有度权重（必填，events-base.ts
// 按最高难度分档逐条核对），牌堆建堆按权重不放回抽取（见 state.ts 的
// shuffledEventDeck 与 rng.ts 的 weightedDeckCards）。
// U-377：选项可选 cost 代价模板（明码标价、选定即付、付不起不可选），
// 结构与校验在 events-base.ts，本文件转发 eventCostBlockReason /
// formatEventCost 供结算与待决事件构建使用。
// U-378：选项可选 loop 见好就收模板（成功后继续加圈或撤退抉择，加圈
// 比例出自配置表 EVENT_LOOP），结构、校验与缩放 helper 在
// events-base.ts，本文件转发 loopDcFor / loopMultiplier /
// scaleEffectForLoop / formatEffectGains 供结算使用。

export { EVENTS, EVENT_LOOP, eventCostBlockReason, formatEffectGains, formatEventCost, loopDcFor, loopMultiplier, scaleEffectForLoop } from "./content";
export type { Effect, EventDef, EventOptionDef, RelSpec } from "./content";

export const ATTR_NAME: Record<string, string> = { might: "战力", sense: "神识", fortune: "机缘", body: "体魄" };
