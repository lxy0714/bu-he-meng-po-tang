// 轮回修仙跑团 — U-408 单轮目标动作（玩家入口）：目标定义在配置
// 表 content/round-goals.json，状态在存档（state.ts 的 RoundGoal-
// State），进度推进由 bumpRoundGoal 挂在各既有动作的结算尾巴上统
// 一监听——本文件只管两件事：选定目标（只能从当前候选里选、且
// 当前没有进行中的目标）、放弃重选（清当前目标与进度、候选重新
// 随机）。口径（定稿）：目标只做行为引导——不锁、不拦任何动作，
// 未完成无任何惩罚，放弃不扣任何资源；完成奖励在 bumpRoundGoal
// 达成瞬间发放（只发一次），不在本动作内结算。目标按世重置（轮
// 回时随新世构造清空）。守卫与委托/任务面板一致：陨落 / 有待决
// 事件 / 分叉路线进行中不受理选定与放弃（这是面板动作自身的既
// 有守卫，不是目标系统去拦别的动作——目标进行中时修炼/探索/旅
// 行等一切动作照常可用，本系统不参与它们的任何守卫判定）。

import { defineAction, z } from "./platform";
import { ROUND_GOALS, roundGoalById } from "./data";
import {
  ensureRoundGoalCandidates, loadState, notePendingEventBlock, pushLog, questRewardText, roundGoalObjectiveText, saveState,
} from "./state";
import { stateResponse, toResponse, type StateResponse } from "./respond";

export const goalActions = {
  roundGoal: defineAction({
    description: "单轮目标（U-408）：从随机给出的候选目标（配置表 candidateCount 个）里选定 1 个作为本轮目标（进度随探索/旅行/斗法/修炼/隐藏发现/拾矿/学残页/累计获得灵石等既有动作自动推进，完成瞬间发小额额外奖励并刷新候选），或放弃当前目标重选（无惩罚、不扣任何资源，候选重新随机）。目标只做行为引导，不锁定、不拦截任何其他动作，未完成无惩罚；轮回时目标清空重置。",
    request: z.object({
      kind: z.enum(["choose", "abandon"]),
      goalId: z.string().min(1).max(60).optional(),
    }),
    response: stateResponse,
    async handler(ctx, args): Promise<StateResponse> {
      const state = await loadState(ctx);
      const c = state.character;
      if (!c || c.dead) return toResponse(state);
      // 待决守卫排在 route 早退之前（同 actions-board 注释）。
      if (notePendingEventBlock(state)) { await saveState(ctx, state); return toResponse(state); }
      if (c.route || !c.roundGoal) return toResponse(state);
      const g = c.roundGoal;
      // 候选兜底：正常已由 loadState 补齐；此处再补一次，保证选定
      // 时面对的候选与卡面一致（已有当前目标时本函数不动候选）。
      ensureRoundGoalCandidates(state);

      if (args.kind === "choose") {
        if (g.currentId) return toResponse(state);
        const def = args.goalId ? roundGoalById(args.goalId) : undefined;
        if (!def || !g.candidates.includes(def.id)) return toResponse(state);
        g.currentId = def.id;
        g.progress = 0;
        g.candidates = [];
        pushLog(state, c.lifeNo, "goal", `🎯 定下本轮目标：「${def.title}」——${def.text}（目标：${roundGoalObjectiveText(def)}；达成额外奖励：${questRewardText(def.reward)}。做完即走，未完成也无妨，更不拦你做别的。）`);
      }

      if (args.kind === "abandon") {
        if (!g.currentId) return toResponse(state);
        const def = roundGoalById(g.currentId);
        g.currentId = "";
        g.progress = 0;
        g.candidates = [];
        ensureRoundGoalCandidates(state);
        pushLog(state, c.lifeNo, "goal", `🎯 放下本轮目标：「${def?.title ?? "本轮目标"}」就此作罢——不记过、不扣任何东西。新的 ${ROUND_GOALS.candidateCount} 个候选已经备好，去「本轮目标」卡重新选一个吧。`);
      }

      await saveState(ctx, state);
      return toResponse(state);
    },
  }),
};
