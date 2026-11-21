// 轮回修仙跑团 — U-407 连环任务动作（多阶段任务模型 / 通用任务
// 引擎的玩家入口）：任务定义在配置表 content/quests.json（多阶段
// + 可分支），进度在存档（state.ts 的 QuestState），推进由引擎
// bumpQuests 挂在各既有动作的结算尾巴上统一监听——本文件只管四
// 件事：接取（须身在张贴处、同时进行中上限 = 配置表 maxActive）、
// 分支抉择（阶段完成停在分支点时二选一，选项的业力与即时奖励当
// 场落账、走向由选项的 next 决定）、回板结算（全链走完后回张贴
// 处领全链奖励并听结局故事，按分支选择可换结局文案）、放弃（无
// 惩罚，任务回可接列表、日后可再接）。
//
// 口径（定稿）：任务按世重置——轮回时未完成任务清空、已完成只进
// 本世历史（completedIds/completedCount），不跨世保留进度；本世
// 已完成的任务不再贴出（与委托办完回池不同：连环任务是一次性的
// 故事链）。守卫与委托板一致：陨落 / 有待决事件 / 分叉路线进行
// 中不受理；接取与结算都必须身在张贴地点，抉择与放弃不限地点。
// U-388 委托板 / U-389 限时帖 / U-390 日常委托的行为与代码路径
// 一字未动；本引擎能表达单阶段任务，U-406 等后续项复用。

import { defineAction, z } from "./platform";
import { QUESTS, locById, npcById, questById } from "./data";
import {
grantQuestReward, loadState, notePendingEventBlock, pushLog, questAvailable, questObjectiveText, questRewardText, saveState,
} from "./state";
import { stateResponse, toResponse, type StateResponse } from "./respond";

export const questActions = {
  quest: defineAction({
    description: "连环任务（U-407 多阶段任务模型）：在张贴地点接取一条多阶段连环任务（多任务并行上限见配置表，本世已完成的任务不再出现）、在分支点二选一抉择（选项的业力与即时奖励当场落账，走向与后续阶段、结局文案随选择而不同）、全链走完后回张贴地点结算全链奖励并听结局故事、或随时放弃已接任务（无惩罚，日后可再接）。阶段进度由通用引擎监听既有动作自动推进（探索/抵达/斗法/修炼/副职/拜访/突破/差事），不在本动作内结算。",
    request: z.object({
      kind: z.enum(["accept", "branch", "claim", "abandon"]),
      questId: z.string().min(1).max(60),
      optionId: z.string().min(1).max(60).optional(),
    }),
    response: stateResponse,
    async handler(ctx, args): Promise<StateResponse> {
      const state = await loadState(ctx);
      const c = state.character;
      if (!c || c.dead) return toResponse(state);
      // 待决守卫排在 route 早退之前（同 actions-board 注释）。
      if (notePendingEventBlock(state)) { await saveState(ctx, state); return toResponse(state); }
      if (c.route || !c.quests) return toResponse(state);
      const qs = c.quests;
      const def = questById(args.questId);
      if (!def) return toResponse(state);
      const issuer = npcById(def.issuerNpc);
      const boardLoc = locById(def.boardLocationId);
      const atBoard = c.locationId === def.boardLocationId;
      const issuerName = issuer ? `${issuer.name}（${issuer.title}）` : "发布人";

      if (args.kind === "accept") {
        if (!questAvailable(c, def)) return toResponse(state);
        if (!atBoard) {
          pushLog(state, c.lifeNo, "hint", `这条连环任务贴在「${boardLoc?.name ?? def.boardLocationId}」——要接，先去那里揭帖。`);
          await saveState(ctx, state);
          return toResponse(state);
        }
        if (qs.active.length >= QUESTS.maxActive) {
          pushLog(state, c.lifeNo, "hint", `手头已有 ${QUESTS.maxActive} 条连环任务在走——先走完一条再说，贪多嚼不烂。`);
          await saveState(ctx, state);
          return toResponse(state);
        }
        const first = def.stages[0];
        if (!first) return toResponse(state);
        qs.active.push({ id: def.id, stageId: first.id, progress: 0, branchChoice: "", awaitingBranch: false, done: false });
        pushLog(state, c.lifeNo, "quest", `🧭 揭帖接下连环任务：「${def.title}」——${issuerName}托付。第一阶段「${first.title}」：${first.text}（目标：${questObjectiveText(first)}）`);
      }

      if (args.kind === "branch") {
        const entry = qs.active.find((a) => a.id === def.id);
        if (!entry || !entry.awaitingBranch) return toResponse(state);
        const stage = def.stages.find((s) => s.id === entry.stageId);
        const opt = stage?.branch?.options.find((o) => o.id === args.optionId);
        if (!stage?.branch || !opt) return toResponse(state);
        entry.branchChoice = opt.id;
        entry.awaitingBranch = false;
        // 抉择的业力与即时奖励当场落账（走引擎统一奖励入口）。
        const branchReward: { karma?: number } = {};
        if (opt.karma) branchReward.karma = opt.karma;
        if (Object.keys(branchReward).length > 0 || opt.reward) {
          grantQuestReward(state, { ...branchReward, ...opt.reward });
        }
        const gainParts: string[] = [];
        if (opt.karma) gainParts.push(`业力 ${opt.karma > 0 ? "+" : ""}${opt.karma}`);
        if (opt.reward) gainParts.push(questRewardText(opt.reward));
        const nextStage = def.stages.find((s) => s.id === opt.next);
        entry.stageId = opt.next;
        entry.progress = 0;
        pushLog(state, c.lifeNo, "quest", `🧭 连环任务抉择：「${def.title}」· ${stage.title}——你选了「${opt.label}」。${gainParts.length > 0 ? `当场落账：${gainParts.join("、")}。` : ""}${nextStage ? `下一阶段「${nextStage.title}」：${nextStage.text}（目标：${questObjectiveText(nextStage)}）` : ""}`);
      }

      if (args.kind === "claim") {
        const entry = qs.active.find((a) => a.id === def.id);
        if (!entry || !entry.done) return toResponse(state);
        if (!atBoard) {
          pushLog(state, c.lifeNo, "hint", `连环任务「${def.title}」已全链走完——回「${boardLoc?.name ?? def.boardLocationId}」找发布人结算。`);
          await saveState(ctx, state);
          return toResponse(state);
        }
        qs.active = qs.active.filter((a) => a.id !== def.id);
        if (!qs.completedIds.includes(def.id)) qs.completedIds.push(def.id);
        qs.completedCount += 1;
        // 全链奖励走引擎统一入口（与阶段奖励同一结算链）。
        grantQuestReward(state, def.finalReward);
        const story = (entry.branchChoice && def.storyByBranch?.[entry.branchChoice]) || def.story;
        c.lastRoll = {
          label: `连环任务结算·${def.title}`, dice: 0, bonus: 0, total: 0, dc: 0, success: true,
          text: `${issuer ? `${issuer.name}听完你的回报，` : ""}这条连环任务就此了结。全链奖励：${questRewardText(def.finalReward) || "无"}。`,
        };
        pushLog(state, c.lifeNo, "quest", `🧭 连环任务结算：「${def.title}」——${story}（全链奖励：${questRewardText(def.finalReward) || "无"}；本世已完成连环任务 ${qs.completedCount} 条）`);
      }

      if (args.kind === "abandon") {
        if (!qs.active.some((a) => a.id === def.id)) return toResponse(state);
        qs.active = qs.active.filter((a) => a.id !== def.id);
        pushLog(state, c.lifeNo, "quest", `🧭 放下连环任务：「${def.title}」就此搁下——不记过、不追责，进度不留，日后想走还可从头再接。`);
      }

      await saveState(ctx, state);
      return toResponse(state);
    },
  }),
};
