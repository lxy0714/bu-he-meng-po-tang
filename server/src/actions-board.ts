// 轮回修仙跑团 — U-388 委托板动作（接取式支线，来源 A-35《古剑奇
// 谭三》，拆自 v1 U-47 的接取部分）：街边告示板式委托板——玩家在
// 委托的张贴地点（坊市告示墙 / 山门告示 / 村口老槐树 / 古刹布施榜）
// 主动接取支线委托，接取后目标按地点刷新（在目标地点完成既有系统
// 的行为计数，进度推进在 state.ts 的 bumpCommissions，挂在斗法/
// 副职/宗门差事/事件结算四处既有尾巴上），达成后回张贴处结算：发
// 既有 Effect 奖励、按既有 RelSpec 结缘，并由委托人讲一段世界与
// 人物的故事（编年史 + 结算文案）。
//
// 口径红线（计划原文）：接取无时限、不接无惩罚、放弃无惩罚；委托
// 内容全部复用现有事件/结算与既有字段，不新编数值体系；不碰
// U-389（限时事件）与 U-390（日常委托事件池）；不改 Q1–Q18 与
// Q34–Q36，不改现有事件的触发与结算规则，不新增事件/NPC/法宝/
// 地点——委托池在配置表 content/commissions.json，委托人、张贴处
// 与目标地点、目标行为与奖励字段全部取自现有内容。
// 守卫与既有动作一致：陨落 / 有待决事件 / 分叉路线进行中不受理
// （先处理完手头的事再看告示）；接取与结算都必须身在张贴地点
// （「回板结算」是本项的仪式感所在），放弃不限地点、无代价。

import { defineAction, z } from "./platform";
import { COMMISSIONS, commissionById, commissionGrantFor, locById, npcById } from "./data";
import { formatEffectGains } from "./events";
import {
addRelation, applyEffects, artifactGrantOutcomeText, commissionObjectiveText, loadState, notePendingEventBlock, pushLog, saveState, settleArtifactGrant,
} from "./state";
import { stateResponse, toResponse, type StateResponse } from "./respond";

export const boardActions = {
  commission: defineAction({
    description: "委托板（U-388 接取式支线）：在委托的张贴地点接取板上委托（无时限、不接无惩罚，同时可接数见配置表）、目标达成后回张贴地点结算领奖并听委托人讲故事（奖励与结缘走既有字段；配置内的委托另由委托人赠一件法宝，U-620 委托赠宝，赋予走 U-618 门槛口径）、或随时放弃已接委托（无惩罚，委托回池日后可再贴）。",
    request: z.object({
      kind: z.enum(["accept", "claim", "abandon"]),
      commissionId: z.string().min(1).max(60),
    }),
    response: stateResponse,
    async handler(ctx, args): Promise<StateResponse> {
      const state = await loadState(ctx);
      const c = state.character;
      if (!c || c.dead) return toResponse(state);
      // 待决守卫排在 route 早退之前（同 actions-play forgeArtifact 注释）。
      if (notePendingEventBlock(state)) { await saveState(ctx, state); return toResponse(state); }
      if (c.route || !c.commissions) return toResponse(state);
      const cs = c.commissions;
      const def = commissionById(args.commissionId);
      if (!def) return toResponse(state);
      const issuer = npcById(def.issuerNpc);
      const boardLoc = locById(def.boardLocationId);
      const atBoard = c.locationId === def.boardLocationId;

      if (args.kind === "accept") {
        if (!cs.board.includes(def.id)) return toResponse(state);
        if (cs.active.some((a) => a.id === def.id)) return toResponse(state);
        if (!atBoard) {
          pushLog(state, c.lifeNo, "hint", `这张委托贴在「${boardLoc?.name ?? def.boardLocationId}」的告示处——要接，先去那里揭榜。`);
          await saveState(ctx, state);
          return toResponse(state);
        }
        if (cs.active.length >= COMMISSIONS.maxActive) {
          pushLog(state, c.lifeNo, "hint", `手头已接了 ${COMMISSIONS.maxActive} 张委托，告示处管事摇头：先办完手上的再说。委托不设时限，慢慢来。`);
          await saveState(ctx, state);
          return toResponse(state);
        }
        cs.board = cs.board.filter((id) => id !== def.id);
        cs.active.push({ id: def.id, progress: 0, done: false });
        pushLog(state, c.lifeNo, "commission", `📜 揭榜接下委托：「${def.title}」——${issuer ? `${issuer.name}（${issuer.title}）托付：` : ""}${commissionObjectiveText(def)}。无时限，办妥后回「${boardLoc?.name ?? def.boardLocationId}」结算。`);
      }

      if (args.kind === "claim") {
        const entry = cs.active.find((a) => a.id === def.id);
        if (!entry || !entry.done) return toResponse(state);
        if (!atBoard) {
          pushLog(state, c.lifeNo, "hint", `委托「${def.title}」已办妥——回「${boardLoc?.name ?? def.boardLocationId}」的告示处找委托人结算。`);
          await saveState(ctx, state);
          return toResponse(state);
        }
        cs.active = cs.active.filter((a) => a.id !== def.id);
        cs.completedCount += 1;
        // 奖励走既有 applyEffects（与事件奖励同一结算链：天赋修正
        // 照旧，地点衰减不适用——委托报酬是当面结清的工钱）。
        applyEffects(state, def.reward);
        if (def.relOk) addRelation(state, c, def.relOk.npc, def.relOk.kind, def.relOk.bond, `结缘于委托「${def.title}」`);
        // U-620：委托赠宝——配置表（artifact-sources.json 的
        // commissionGrants）里列明的委托，结算时委托人额外赠下
        // 一件定死的法宝（委托原有奖励与结缘一字未动，赠宝是额
        // 外一层）；赋予走统一口径（槽空认主、U-618 门槛对齐；
        // 槽已占按配置折作）。不在表里的委托不发宝、日志不提。
        const grant = commissionGrantFor(def.id);
        if (grant) {
          const outcome = settleArtifactGrant(state, c, grant.artifactId, grant.occupiedFallback);
          if (outcome) pushLog(state, c.lifeNo, "commission", `🎁 委托赠宝：「${def.title}」——${grant.text}（${artifactGrantOutcomeText(state, c, grant.artifactId, outcome, grant.occupiedFallback)}）`);
        }
        c.lastRoll = {
          label: `委托结算·${def.title}`, dice: 0, bonus: 0, total: 0, dc: 0, success: true,
          text: `${issuer ? `${issuer.name}听完你的回报，` : ""}这桩委托就此了结。报酬：${formatEffectGains(def.reward) || "无"}。`,
        };
        pushLog(state, c.lifeNo, "commission", `📜 委托结算：「${def.title}」——${def.story}（报酬：${formatEffectGains(def.reward) || "无"}；本世已完成委托 ${cs.completedCount} 件）`);
      }

      if (args.kind === "abandon") {
        if (!cs.active.some((a) => a.id === def.id)) return toResponse(state);
        cs.active = cs.active.filter((a) => a.id !== def.id);
        pushLog(state, c.lifeNo, "commission", `📜 撕下委托：「${def.title}」就此作罢——告示处不记过、不追责，日后这张榜还会再贴出来。`);
      }

      await saveState(ctx, state);
      return toResponse(state);
    },
  }),
};
