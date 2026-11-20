// 轮回修仙跑团 — U-389 限时事件动作（来源 B-65《修真聊天群》，拆
// 自 v1 U-47 的限时部分）：群友发布的限时帖——带倒计时，接取后须
// 在时限内完成，超时即失败；接与不接、成与败均影响群内声望。与
// U-388 委托板分开做：委托无时限、不接无惩罚、回板结算；限时帖的
// 时限与声望结算都在本文件与 state.ts 的 settleTimedEvents /
// applyReputation 里，委托板一字未动。
//
// 口径（计划原文）：
// - 时钟 = 天序（U-610/Q37：累计月份 × 每月天数 daysPerMonth，
//   天数按月内折算、配置表定）：帖子挂板 postDays 天无人接取即过
//   期沉底（不结算任何声望、不结仇、同帖本世不再重挂——2026-11
//   -18 自测修复，原「不接」声望段自此不生效；在 loadState 的
//   settleTimedEvents 里到期结清）；接取时截止天序 = 当前天序 +
//   limitDays，天序到达截止仍未办妥即超时失败（结算「败」声望，
//   同在 settleTimedEvents 结清）；目标办妥即锁定成功，交帖领赏
//   不再受时限约束。
// - 声望只复用现有字段：发布人的既有关系 bond（relations 情谊/
//   仇怨）与既有宗门贡献 sectContrib（applyReputation 一处落账），
//   接 / 不接 / 成 / 败四段数值全部出自配置表 timed-events.json。
// - 主动撕帖 = 爽约：按「败」段声望结算、计入失败数（与委托板的
//   无惩罚撕榜明确不同——限时帖接了就是承诺）。
// - 守卫与委托板一致：陨落 / 有待决事件 / 分叉路线进行中不受理；
//   接取与交帖都必须身在张贴地点，撕帖不限地点。
// - 目标进度推进在 state.ts 的 bumpTimedEvents，挂在与委托相同
//   的四处既有结算尾巴上（斗法获胜 / 副职 / 宗门差事 / 牌堆事件
//   结算），不改任何既有结算数值；不新增事件/NPC/法宝/地点，不
//   改 Q1–Q18 与 Q34–Q36，不碰 U-390（日常委托事件池）。

import { defineAction, z } from "./platform";
import { TIMED_EVENTS, locById, npcById, timedEventById } from "./data";
import { formatEffectGains } from "./events";
import {
applyEffects, applyReputation, loadState, notePendingEventBlock, pushLog, saveState, timedDaysText, timedNowDay, timedObjectiveText, timedRepText,
} from "./state";
import { stateResponse, toResponse, type StateResponse } from "./respond";

export const timedActions = {
  timedEvent: defineAction({
    description: "限时帖（U-389 限时事件）：在帖子的张贴地点接取板上限时帖（接取结算接帖声望、同时可接数与时限见配置表，时限按天/月计——截止天序=接取天序+时限天数，时钟走累计月份折算）、目标在限期内办妥后回张贴地点交帖领赏并结算成功声望与奖励（奖励走既有字段）、或主动撕帖爽约（按失败声望结算）；已接帖超时失败的声望在读档时自动结清，未接取的挂帖过期只沉底、不结算声望且本世不再重挂。",
    request: z.object({
      kind: z.enum(["accept", "claim", "abandon"]),
      timedId: z.string().min(1).max(60),
    }),
    response: stateResponse,
    async handler(ctx, args): Promise<StateResponse> {
      const state = await loadState(ctx);
      const c = state.character;
      if (!c || c.dead) return toResponse(state);
      // 待决守卫排在 route 早退之前（同 actions-play forgeArtifact 注释）。
      if (notePendingEventBlock(state)) { await saveState(ctx, state); return toResponse(state); }
      if (c.route || !c.timedEvents) return toResponse(state);
      const ts = c.timedEvents;
      const def = timedEventById(args.timedId);
      if (!def) return toResponse(state);
      const issuer = npcById(def.issuerNpc);
      const boardLoc = locById(def.boardLocationId);
      const atBoard = c.locationId === def.boardLocationId;
      const issuerName = issuer ? `${issuer.name}（${issuer.title}）` : "发布人";

      if (args.kind === "accept") {
        if (!ts.board.some((p) => p.id === def.id)) return toResponse(state);
        if (ts.active.some((a) => a.id === def.id)) return toResponse(state);
        if (!atBoard) {
          pushLog(state, c.lifeNo, "hint", `这张限时帖贴在「${boardLoc?.name ?? def.boardLocationId}」——要接，先去那里揭帖。帖子挂板有时限，过期便沉底作罢（不接不罚），别拖太久。`);
          await saveState(ctx, state);
          return toResponse(state);
        }
        if (ts.active.length >= TIMED_EVENTS.maxActive) {
          pushLog(state, c.lifeNo, "hint", `手头已接了 ${TIMED_EVENTS.maxActive} 张限时帖——限时帖接了就是承诺，先办完手上的再说。`);
          await saveState(ctx, state);
          return toResponse(state);
        }
        ts.board = ts.board.filter((p) => p.id !== def.id);
        const deadlineDay = timedNowDay(c) + def.limitDays;
        ts.active.push({ id: def.id, progress: 0, done: false, deadlineDay });
        const rep = applyReputation(state, c, def.issuerNpc, def.rep.accept);
        pushLog(state, c.lifeNo, "timed", `⏳ 揭下限时帖：「${def.title}」——${issuerName}托付：${timedObjectiveText(def)}。限时 ${timedDaysText(def.limitDays)}（自今日起 ${def.limitDays} 天内办妥，办妥即锁定），接帖声望已结（${rep}）。声望账：${timedRepText(def)}。`);
      }

      if (args.kind === "claim") {
        const entry = ts.active.find((a) => a.id === def.id);
        if (!entry || !entry.done) return toResponse(state);
        if (!atBoard) {
          pushLog(state, c.lifeNo, "hint", `限时帖「${def.title}」已在限期内办妥——回「${boardLoc?.name ?? def.boardLocationId}」找发布人交帖领赏。`);
          await saveState(ctx, state);
          return toResponse(state);
        }
        ts.active = ts.active.filter((a) => a.id !== def.id);
        ts.completedCount += 1;
        // 奖励走既有 applyEffects（与事件/委托奖励同一结算链）；成
        // 功声望走 applyReputation 落既有 bond/sectContrib 字段。
        applyEffects(state, def.reward);
        const rep = applyReputation(state, c, def.issuerNpc, def.rep.success);
        c.lastRoll = {
          label: `限时帖交帖·${def.title}`, dice: 0, bonus: 0, total: 0, dc: 0, success: true,
          text: `${issuer ? `${issuer.name}验看无误，` : ""}这张限时帖按时办妥、就此结清。报酬：${formatEffectGains(def.reward) || "无"}；声望：${rep}。`,
        };
        pushLog(state, c.lifeNo, "timed", `⏳ 交帖结算：「${def.title}」——${def.story}（报酬：${formatEffectGains(def.reward) || "无"}；${rep}；本世已办妥限时帖 ${ts.completedCount} 件）`);
      }

      if (args.kind === "abandon") {
        if (!ts.active.some((a) => a.id === def.id)) return toResponse(state);
        ts.active = ts.active.filter((a) => a.id !== def.id);
        ts.failedCount += 1;
        const rep = applyReputation(state, c, def.issuerNpc, def.rep.fail);
        pushLog(state, c.lifeNo, "timed", `⏳ 撕下限时帖：「${def.title}」——接了帖又办不到，按爽约论处（${rep}；本世限时帖失败 ${ts.failedCount} 件）。限时帖接的是承诺，与告示处那些无时限的委托不同。`);
      }

      await saveState(ctx, state);
      return toResponse(state);
    },
  }),
};
