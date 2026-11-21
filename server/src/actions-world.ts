// 轮回修仙跑团 — 第四轮动作：斗法（Q15）、灵石经济（Q17）、社交（Q18）。
// Q15：斗法记号（Q34）1d20[下限~上限]（战力计入骰面）vs 难度——难度按敌手境界定，
// 胜负浮动按胜势差结算（赢得越多奖越丰，输得越惨伤越重）。
// Q17：坊市商店（物价按境界分档）、寄卖丹药、丹药服用、洞府升级。
// Q18：关系从事件与结识中自然产生；道侣助修炼、师父减突破难度、
// 徒弟给进项、仇敌仇怨深了会寻仇（寻仇结算在 actions-play 的 chooseOption）。

import { defineAction, z } from "./platform";
import {
NPCS, SHOP, breakthroughBossFor, caveUpgradeCost, enemyById, shopPrice
} from "./data";
import {
addRelation, advanceActionMonths, activeArtifactFx, applyEffects, bumpQuests, checkDeath, decayMult, isMajorBreakthroughNext, loadState,
notePendingEventBlock, pushLog, realmsFor, resolveFight, rngForNext, rollCheck, saveState, settleBreakthroughBossFight, spendActionPoints, weekKeyOf, type GameState,
} from "./state";
import { formatEffectGains, type Effect } from "./events";
import { stateResponse, toResponse, type StateResponse } from "./respond";
import { bellFloat, uniformTable, weighted } from "./rng";
import { DUEL_CHECK, SKILL_CHECKS, duelDcFor, socialDcFor } from "./checks";

// 静默失败修复（2026-11-12）：条件不满足（地点不对、关系类型不匹配、
// 资源不足等）时不再无声返回 ok，而是往编年史记一条说明原因的提示，
// 玩家点下按钮立刻能在编年史顶部看到为什么没生效。提示不改变任何状态。
function hint(state: GameState, lifeNo: number, text: string) {
  pushLog(state, lifeNo, "hint", text);
}

const REL_KIND_NAME: Record<string, string> = {
  partner: "道侣", master: "师父", disciple: "徒弟", friend: "道友", enemy: "仇敌",
};

export const worldActions = {

  fight: defineAction({
    description: "斗法（Q15/Q34）：挑战当前地点的一名敌手，掷斗法骰 d20[下限~上限]（战力计入骰面）vs 其按境界定的基准难度（掷骰时等概率换算），胜负奖励与伤势按归一化胜势差浮动结算，耗时一年。",
    request: z.object({ enemyId: z.string().min(1) }),
    response: stateResponse,
    async handler(ctx, args): Promise<StateResponse> {
      const state = await loadState(ctx);
      const c = state.character;
      if (!c || c.dead) return toResponse(state);
      if (notePendingEventBlock(state)) { await saveState(ctx, state); return toResponse(state); }
      const enemy = enemyById(args.enemyId);
      if (!enemy) {
        hint(state, c.lifeNo, "斗法无从下手：没有这名敌手。");
        await saveState(ctx, state);
        return toResponse(state);
      }
      if (!enemy.locations.includes(c.locationId)) {
        hint(state, c.lifeNo, `${enemy.name}不在此地出没——斗法要去它盘踞的地方。`);
        await saveState(ctx, state);
        return toResponse(state);
      }
      // U-409：斗法耗行动点 6（配置表）——守卫已过、交手之前扣
      // 点，成败都扣；点数不足明示原因、不结算。路线节点战斗与
      // 秘境 Boss 战走 resolveFight 本体、不经本动作，不另扣点
      //（那一程探索已在启程时扣过探索点）。
      if (!spendActionPoints(state, "fight")) { await saveState(ctx, state); return toResponse(state); }
      const wk = weekKeyOf(new Date());
      if (c.weekKey !== wk) { c.weekKey = wk; c.groupCounts = {}; }
      // 结算本体抽到 state.ts 的 resolveFight（与 U-381 路线战斗/精英
      // 节点共用同一结算，数值与文案逐字不变）；本动作只做守卫与周键。
      resolveFight(state, c, enemy);
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  challengeBreakthroughBoss: defineAction({
    description: "禁地夺丹（U-414）：处于某境大圆满时挑战对应禁地的 Boss（按目标境界配表），按一次斗法行动计（耗 1 个月 + 斗法行动点 6 点，走既有斗法结算），胜则破境丹 +1 入丹药囊、败则无丹可再战；非大圆满时明示原因不结算。",
    request: z.object({}),
    response: stateResponse,
    async handler(ctx): Promise<StateResponse> {
      const state = await loadState(ctx);
      const c = state.character;
      if (!c || c.dead) return toResponse(state);
      if (notePendingEventBlock(state)) { await saveState(ctx, state); return toResponse(state); }
      if (c.route) {
        hint(state, c.lifeNo, "你正在分叉路线上——先走完这一程或收程，再来挑战禁地 Boss。");
        await saveState(ctx, state);
        return toResponse(state);
      }
      // 资格：下一步即大境界突破（某境大圆满且有下一境）才有对
      // 应的禁地 Boss；其余情形明示原因、不扣点不结算。
      if (!isMajorBreakthroughNext(c, state.settings)) {
        const realms = realmsFor(state.settings);
        if (c.realmIdx >= realms.length - 1 && c.stageIdx >= 3) {
          hint(state, c.lifeNo, "你已至此界之巅，再无大境界可破——禁地夺丹当前不需要（破境丹的门槛只拦大境界突破）。");
        } else {
          const stageName = ["初期", "中期", "后期", "大圆满"][c.stageIdx] ?? "";
          hint(state, c.lifeNo, `禁地夺丹当前不需要：你尚在${realms[c.realmIdx]?.name ?? ""}${stageName}，修至大圆满、下一步即大境界突破时，才需备下破境丹、来此挑战对应禁地的 Boss。`);
        }
        await saveState(ctx, state);
        return toResponse(state);
      }
      const def = breakthroughBossFor(c.realmIdx + 1);
      if (!def) return toResponse(state);
      // U-409/U-608：按一次斗法行动计——斗法行动点 6 点（守卫已
      // 过、交手之前扣，成败都扣；点数不足明示原因、不结算）；
      // 耗时 1 个月由 resolveFight 内的 fight 键统一推进。
      if (!spendActionPoints(state, "fight")) { await saveState(ctx, state); return toResponse(state); }
      const wk = weekKeyOf(new Date());
      if (c.weekKey !== wk) { c.weekKey = wk; c.groupCounts = {}; }
      pushLog(state, c.lifeNo, "fight", `⚔️ 禁地夺丹：你踏入${def.placeName}，直面「${def.name}」——胜之夺破境丹，败了养好伤还能再战。`);
      settleBreakthroughBossFight(state);
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  economy: defineAction({
    description: "灵石经济（Q17）：在坊市购买丹药（物价按境界分档）、寄卖丹药赚钱、服用丹药，或在听涛洞府升级洞府（聚灵阵）。",
    request: z.object({ kind: z.enum(["buyHeal", "buyCult", "buyBreak", "useHeal", "useCult", "useBreak", "sellPills", "caveUpgrade"]) }),
    response: stateResponse,
    async handler(ctx, args): Promise<StateResponse> {
      const state = await loadState(ctx);
      const c = state.character;
      if (!c || c.dead) return toResponse(state);
      if (notePendingEventBlock(state)) { await saveState(ctx, state); return toResponse(state); }
      const wk = weekKeyOf(new Date());
      if (c.weekKey !== wk) { c.weekKey = wk; c.groupCounts = {}; }
      // U-617：聚财/丹道类法宝（聚宝盆/药王鼎）在本 handler 内统一
      // 读取——买丹折扣、寄卖加成、服丹效果放大都走这一个 fx 快照；
      // 无此 fx 时各项逐字不变。
      const ecoFx = activeArtifactFx(state, c);

      if (args.kind === "buyHeal" || args.kind === "buyCult" || args.kind === "buyBreak") {
        const key = args.kind === "buyHeal" ? "heal" : args.kind === "buyCult" ? "cult" : "brk";
        const item = SHOP[key];
        const price = ecoFx?.shopDiscountPct ? Math.max(1, Math.floor(shopPrice(item.base, c.realmIdx) * (1 - ecoFx.shopDiscountPct / 100))) : shopPrice(item.base, c.realmIdx);
        if (c.locationId !== "market") {
          hint(state, c.lifeNo, `买丹要去临渊坊市——你现在不在坊市，${item.name}无处买。`);
        } else if (c.stones < price) {
          hint(state, c.lifeNo, `灵石不足：${item.name}要 ${price} 灵石，你只有 ${c.stones}。`);
        } else {
          c.stones -= price;
          c.pills[key] += 1;
          pushLog(state, c.lifeNo, "shop", `在临渊坊市购入「${item.name}」一枚，花费灵石 ${price}（${item.desc}）`);
        }
      }

      if (args.kind === "useHeal") {
        if (c.pills.heal <= 0) {
          hint(state, c.lifeNo, "丹药囊里没有回春丹可服——先去坊市买一颗。");
        } else {
          c.pills.heal -= 1;
          const before = c.hp;
          // U-617：药王鼎丹效放大——回春丹回复比例按配置百分比放大。
          c.hp = Math.min(c.maxHp, c.hp + Math.floor(c.maxHp * 0.5 * (ecoFx?.pillPct ? 1 + ecoFx.pillPct / 100 : 1)));
          pushLog(state, c.lifeNo, "shop", `服下回春丹，气血恢复 ${c.hp - before} 点。`);
        }
      }
      if (args.kind === "useCult") {
        if (c.pills.cult <= 0) {
          hint(state, c.lifeNo, "丹药囊里没有聚气丹可服——先去坊市买一颗。");
        } else {
          c.pills.cult -= 1;
          // U-617：药王鼎丹效放大——聚气丹修为按配置百分比放大。
          const cultGain = Math.floor(55 * (ecoFx?.pillPct ? 1 + ecoFx.pillPct / 100 : 1));
          applyEffects(state, { cult: cultGain });
          pushLog(state, c.lifeNo, "shop", `服下聚气丹，药力化开，修为 +${cultGain}。`);
        }
      }
      if (args.kind === "useBreak") {
        if (c.pills.brk <= 0) {
          hint(state, c.lifeNo, "丹药囊里没有破境丹可服——先去坊市买一颗。");
        } else {
          c.pills.brk -= 1;
          // U-617：药王鼎丹效放大——破境丹助力按配置百分比放大（助力上限 30 不变）。
          const brkGain = Math.floor(15 * (ecoFx?.pillPct ? 1 + ecoFx.pillPct / 100 : 1));
          c.breakBonus = Math.min(30, c.breakBonus + brkGain);
          pushLog(state, c.lifeNo, "shop", `服下破境丹，药力潜伏经脉——下一次突破检定 +${brkGain}（当前助力 +${c.breakBonus}，突破时消耗）。`);
        }
      }

      if (args.kind === "sellPills") {
        if (c.locationId !== "market") {
          hint(state, c.lifeNo, "寄卖丹药要去临渊坊市的丹铺——你现在不在坊市。");
        } else if (c.groupCounts["sellpills"]) {
          hint(state, c.lifeNo, "本周已寄卖过一次丹药了，下周再来。");
        } else {
          // 寄卖必须真扣丹药：优先扣丹药囊里数量最多的一种；一颗没有时
          // 只给提示，不发灵石，也不占用本周寄卖次数。
          const keys = ["heal", "cult", "brk"] as const;
          let sellKey: (typeof keys)[number] | null = null;
          for (const k of keys) {
            if (c.pills[k] > 0 && (sellKey === null || c.pills[k] > c.pills[sellKey])) sellKey = k;
          }
          if (sellKey === null) {
            hint(state, c.lifeNo, "没有可寄卖的丹药——丹药囊是空的，先去坊市买一颗丹药再来寄卖。");
          } else {
            c.pills[sellKey] -= 1;
            c.groupCounts["sellpills"] = 1;
            const baseGain = rngForNext(state, "economy:sell-pills").int(35, 70) + c.realmIdx * 15;
            // U-617：聚宝盆寄卖加成——入账按配置百分比放大（仍走 applyEffects 的富贵天赋修正）。
            const gain = ecoFx?.sellPct ? Math.floor(baseGain * (1 + ecoFx.sellPct / 100)) : baseGain;
            applyEffects(state, { stones: gain });
            pushLog(state, c.lifeNo, "shop", `把丹药囊里的一颗「${SHOP[sellKey].name}」寄卖给坊市丹铺（${SHOP[sellKey].name} −1），入账灵石 +${gain}（本周寄卖已达上限）。`);
          }
        }
      }

      if (args.kind === "caveUpgrade") {
        if (c.locationId !== "cave") {
          hint(state, c.lifeNo, "升级洞府聚灵阵要在听涛洞府进行——你现在不在洞府。");
        } else if (c.caveLevel >= 3) {
          hint(state, c.lifeNo, "聚灵阵已是三级满级，升无可升。");
        } else {
          const cost = caveUpgradeCost(c.caveLevel, c.realmIdx);
          if (c.stones < cost) {
            hint(state, c.lifeNo, `灵石不足：升级聚灵阵要 ${cost} 灵石，你只有 ${c.stones}。`);
          } else {
            c.stones -= cost;
            c.caveLevel += 1;
            pushLog(state, c.lifeNo, "shop", `听涛洞府升级至 ${c.caveLevel} 级聚灵阵（花费灵石 ${cost}）：在此修炼每年前多得修为 +${c.caveLevel * 3}。`);
          }
        }
      }

      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  social: defineAction({
    description: "社交（Q18）：广交道友结识新关系；拜访道友、与道侣双修、向师父请教（得破境助力）、指点徒弟（得进项）、赠礼，以及与仇敌决斗或和解。",
    request: z.object({
      kind: z.enum(["meet", "visit", "dual", "guidance", "teach", "gift", "duel", "reconcile"]),
      relationId: z.string().optional(),
    }),
    response: stateResponse,
    async handler(ctx, args): Promise<StateResponse> {
      const state = await loadState(ctx);
      const c = state.character;
      if (!c || c.dead) return toResponse(state);
      if (notePendingEventBlock(state)) { await saveState(ctx, state); return toResponse(state); }
      const wk = weekKeyOf(new Date());
      if (c.weekKey !== wk) { c.weekKey = wk; c.groupCounts = {}; }
      // U-617：社交类法宝（同心结）——情谊与仇怨的增减幅度按配置
      // 百分比放大（结识/拜访/双修/请教/指点/赠礼六处同口径）；无
      // 此 fx 时倍率恒为 1、各处数值逐字不变。
      const socialFx = activeArtifactFx(state, c);
      const bondGain = (base: number) => (socialFx?.socialPct ? Math.max(1, Math.floor(base * (1 + socialFx.socialPct / 100))) : base);

      if (args.kind === "meet") {
        if (!["market", "sect", "temple", "village", "fields", "arena"].includes(c.locationId)) {
          hint(state, c.lifeNo, "此地人迹罕至，广交道友要去坊市、青云山门、云深寺、凡间村落、灵田或论道台。");
          await saveState(ctx, state);
          return toResponse(state);
        }
        const known = new Set(c.relations.map((r) => r.npcId));
        const pool = NPCS.filter((n) => n.kind !== "enemy" && !known.has(n.id));
        if (pool.length === 0) {
          hint(state, c.lifeNo, "能结识的人你都已结识遍了，暂时没有新面孔。");
          await saveState(ctx, state);
          return toResponse(state);
        }
        // U-409：社交动作耗行动点 6（配置表）——真正结识之前扣
        // 点；点数不足明示原因、不掷骰不耗时。
        if (!spendActionPoints(state, "social")) { await saveState(ctx, state); return toResponse(state); }
        // U-575：结识人选同走权重表抽取（等权，概率不变）。
        const npc = weighted(rngForNext(state, "social:meet-npc"), uniformTable(pool));
        // U-563：广交道友检定出自检定配置表（SKILL_CHECKS.socialMeet）。
        // Q34：社交系统骰面 d40（下限随好感——初次结识按 0、上限随机
        // 缘）；难度按双方境界差动态算（socialDcFor）：对方境界高你
        // 越多越难亲近，低你越多越易结交。
        const meetDc = socialDcFor(SKILL_CHECKS.socialMeet.dc, c.realmIdx, npc.realm);
        const roll = rollCheck(state, c, SKILL_CHECKS.socialMeet.attr, meetDc, 0, [], "normal", { system: "social", bond: 0 });
        // U-577：初始情谊改走 bellFloat 正态波动（范围不变：成功 22–32、
        // 失败 10–18，只是取值集中在均值附近、极端跳变少；整数取整）。
        const bondRng = rngForNext(state, "social:meet-bond");
        const bond = bondGain(Math.round(roll.success ? bellFloat(bondRng, 22, 32) : bellFloat(bondRng, 10, 18)));
        addRelation(state, c, npc.id, npc.kind, bond, `广交道友时结识（${npc.desc}）`);
        c.lastRoll = { label: "广交道友", dice: roll.dice, bonus: roll.bonus, total: roll.total, dc: roll.dc, success: roll.success, text: roll.success ? `与${npc.name}相谈甚欢，一见如故。` : `与${npc.name}寒暄几句，算是混了个脸熟。`, detail: roll.detail };
        advanceActionMonths(state, "social"); // U-608：社交耗时按细时钟配置表（social，配置表定 3 月）
        checkDeath(state, "结交道友时寿元耗尽");
        await saveState(ctx, state);
        return toResponse(state);
      }

      const rel = c.relations.find((r) => r.npcId === args.relationId);
      if (!rel) {
        hint(state, c.lifeNo, "这段关系已不在你的故人名单里了（对方已离世，或恩怨已了结）。");
        await saveState(ctx, state);
        return toResponse(state);
      }
      // U-409：社交动作耗行动点 6（配置表）——只对真正会执行的
      // 互动扣点（与下方各分支的执行条件同口径：关系类型匹配、
      // 赠礼/和解的灵石付得起）；类型不匹配等只给提示的调用不
      // 扣点。扣点在任何结算之前，成败都扣（赠礼无掷骰、送出
      // 即扣）。
      const socialWillRun =
        args.kind === "visit" ? rel.kind !== "enemy"
        : args.kind === "dual" ? rel.kind === "partner"
        : args.kind === "guidance" ? rel.kind === "master"
        : args.kind === "teach" ? rel.kind === "disciple"
        : args.kind === "gift" ? c.stones >= 30
        : args.kind === "duel" ? rel.kind === "enemy"
        : args.kind === "reconcile" ? rel.kind === "enemy" && c.stones >= 50
        : false;
      if (socialWillRun && !spendActionPoints(state, "social")) { await saveState(ctx, state); return toResponse(state); }
      const clampBond = () => { rel.bond = Math.max(0, Math.min(100, rel.bond)); };

      if (args.kind === "visit" && rel.kind !== "enemy") {
        const visitRng = rngForNext(state, "social:visit");
        // U-577：拜访情谊增益改走 bellFloat 正态波动（范围 4–9 不变，
        // 取值集中在均值附近；整数取整）。
        const gain = bondGain(Math.round(bellFloat(visitRng, 4, 9)));
        rel.bond += gain; clampBond();
        // 2026-11-18 自测修复：拜访的额外收益（论道修为 / 业力 /
        // 道侣贴补灵石）此前只落账不记日志，玩家对不上账——结算
        // 前后实测差值（经天赋修正后的实际到手数）一并写进日志，
        // 与其他社交动作的记账口径一致。掷骰与结算顺序不变。
        const before = { cult: c.cultivation, karma: c.karma, stones: c.stones };
        applyEffects(state, { cult: 8 + visitRng.int(0, 10), karma: 1 });
        if (rel.kind === "partner") applyEffects(state, { stones: visitRng.int(0, 15) });
        const gains: Effect = {};
        if (c.cultivation !== before.cult) gains.cult = c.cultivation - before.cult;
        if (c.karma !== before.karma) gains.karma = c.karma - before.karma;
        if (c.stones !== before.stones) gains.stones = c.stones - before.stones;
        const gainText = formatEffectGains(gains);
        pushLog(state, c.lifeNo, "social", `登门拜访${rel.name}，叙谈半日，情谊 +${gain}（${rel.bond}）。${gainText ? `席间另有所获：${gainText}。` : ""}`);
        advanceActionMonths(state, "social"); // U-608：社交耗时按细时钟配置表（social，配置表定 3 月）
        // U-407：登门拜访一回，推进连环任务当前阶段的「拜访」目标
        // （按被访 NPC 匹配；仇敌不可拜访、不在此列）。
        bumpQuests(state, "visit", { npcId: rel.npcId });
      }

      if (args.kind === "dual" && rel.kind === "partner") {
        const mult = decayMult(c.groupCounts["social"] ?? 0);
        const gain = Math.max(1, Math.floor((30 + Math.floor(rel.bond / 2) + Math.floor(c.sense / 2)) * mult));
        c.cultivation += gain; c.totalCultivation += gain;
        c.groupCounts["social"] = (c.groupCounts["social"] ?? 0) + 1;
        const dualBond = bondGain(6);
        rel.bond += dualBond; clampBond();
        pushLog(state, c.lifeNo, "social", `与道侣${rel.name}同参双修，阴阳调和，修为 +${gain}${mult < 1 ? `（本周同类收益衰减至 ${Math.round(mult * 100)}%）` : ""}，情谊 +${dualBond}（${rel.bond}）。`);
        advanceActionMonths(state, "social"); // U-608：社交耗时按细时钟配置表（social，配置表定 3 月）
      }

      if (args.kind === "guidance" && rel.kind === "master") {
        c.breakBonus = Math.min(30, c.breakBonus + 12);
        applyEffects(state, { cult: 20 });
        const guideBond = bondGain(4);
        rel.bond += guideBond; clampBond();
        pushLog(state, c.lifeNo, "social", `向师父${rel.name}请教关窍，师父三言两语点破迷津：修为 +20，下一次突破助力 +12（当前 +${c.breakBonus}，突破时消耗），情谊 +${guideBond}（${rel.bond}）。`);
        advanceActionMonths(state, "social"); // U-608：社交耗时按细时钟配置表（social，配置表定 3 月）
      }

      if (args.kind === "teach" && rel.kind === "disciple") {
        const gain = 18 + Math.floor(rel.bond / 2);
        applyEffects(state, { stones: gain, karma: 2 });
        const teachBond = bondGain(5);
        rel.bond += teachBond; clampBond();
        pushLog(state, c.lifeNo, "social", `指点徒弟${rel.name}修行，徒弟替你办了几桩差事，进项灵石 +${gain}，情谊 +${teachBond}（${rel.bond}）。`);
        advanceActionMonths(state, "social"); // U-608：社交耗时按细时钟配置表（social，配置表定 3 月）
      }

      if (args.kind === "gift") {
        if (c.stones < 30) {
          hint(state, c.lifeNo, `灵石不足：赠礼要备 30 灵石，你只有 ${c.stones}。`);
        } else {
        c.stones -= 30;
        if (rel.kind === "enemy") {
          const giftBond = bondGain(12);
          rel.bond -= giftBond; clampBond();
          pushLog(state, c.lifeNo, "social", `备上一份厚礼送给${rel.name}，话没说透，礼先到了——仇怨 −${giftBond}（${rel.bond}）。`);
          if (rel.bond <= 0) { c.relations = c.relations.filter((r) => r !== rel); pushLog(state, c.lifeNo, "social", `与${rel.name}的仇怨就此化干戈为玉帛。`); }
        } else {
          const giftBond = bondGain(12);
          rel.bond += giftBond; clampBond();
          pushLog(state, c.lifeNo, "social", `赠礼${rel.name}（灵石 −30），对方郑重收下，情谊 +${giftBond}（${rel.bond}）。`);
        }
        }
      }

      if (args.kind === "duel" && rel.kind === "enemy") {
        // U-563：决斗难度公式出自检定配置表（checks.ts 的 DUEL_CHECK）。
        // Q34 相对差距：决斗走斗法骰面 d20，难度按对方境界计（境界差
        // 直接体现在难度上），不再按玩家自身境界。
        const npcRealm = NPCS.find((n) => n.id === rel.npcId)?.realm ?? c.realmIdx;
        const dc = duelDcFor(npcRealm, rel.bond);
        const roll = rollCheck(state, c, DUEL_CHECK.attr, dc, 0, [], "normal", { system: "combat" });
        if (roll.success) {
          const stones = 40 + c.realmIdx * 30;
          applyEffects(state, { stones, cult: 30, karma: 3 });
          c.lastRoll = { label: `决斗·${rel.name}`, dice: roll.dice, bonus: roll.bonus, total: roll.total, dc: roll.dc, success: true, text: `你正面击败${rel.name}，多年仇怨一朝了结，还赢了彩头灵石 ${stones}。`, detail: roll.detail };
          pushLog(state, c.lifeNo, "social", `与仇敌${rel.name}决斗获胜（判定明细：${roll.detail.text}）：仇怨了结，灵石 +${stones}、修为 +30。`);
          c.relations = c.relations.filter((r) => r !== rel);
        } else {
          const dmg = 30 + c.realmIdx * 8;
          applyEffects(state, { hp: -dmg });
          rel.bond = Math.min(100, rel.bond + 10);
          c.lastRoll = { label: `决斗·${rel.name}`, dice: roll.dice, bonus: roll.bonus, total: roll.total, dc: roll.dc, success: false, text: `你败给了${rel.name}，带伤退走——仇没报成，怨更深了。`, detail: roll.detail };
          pushLog(state, c.lifeNo, "social", `与仇敌${rel.name}决斗落败（判定明细：${roll.detail.text}）：气血 −${dmg}，仇怨 +10（${rel.bond}）。`);
        }
        advanceActionMonths(state, "social"); // U-608：社交耗时按细时钟配置表（social，配置表定 3 月）
      }

      if (args.kind === "reconcile" && rel.kind === "enemy" && c.stones < 50) {
        hint(state, c.lifeNo, `灵石不足：和解要备 50 灵石摆一桌酒，你只有 ${c.stones}。`);
      }

      if (args.kind === "reconcile" && rel.kind === "enemy" && c.stones >= 50) {
        // Q34：和解走社交骰面 d40（下限随仇怨、上限随机缘），难度按
        // 双方境界差动态算（socialDcFor）。
        const npcRealm = NPCS.find((n) => n.id === rel.npcId)?.realm ?? c.realmIdx;
        const reconcileDc = socialDcFor(SKILL_CHECKS.reconcile.dc, c.realmIdx, npcRealm);
        const roll = rollCheck(state, c, SKILL_CHECKS.reconcile.attr, reconcileDc, 0, [], "normal", { system: "social", bond: rel.bond });
        if (roll.success) {
          c.stones -= 50;
          applyEffects(state, { karma: 5 });
          c.lastRoll = { label: `和解·${rel.name}`, dice: roll.dice, bonus: roll.bonus, total: roll.total, dc: roll.dc, success: true, text: `一桌酒、一席话，你与${rel.name}把话说开——五十灵石买个清净，值。`, detail: roll.detail };
          pushLog(state, c.lifeNo, "social", `与仇敌${rel.name}和解（判定明细：${roll.detail.text}）：花费灵石 50，仇怨一笔勾销。`);
          c.relations = c.relations.filter((r) => r !== rel);
        } else {
          c.stones -= 25;
          rel.bond = Math.min(100, rel.bond + 8);
          c.lastRoll = { label: `和解·${rel.name}`, dice: roll.dice, bonus: roll.bonus, total: roll.total, dc: roll.dc, success: false, text: `${rel.name}酒照喝、钱照收，话却不肯说满——和解没成，还搭进去二十五灵石。`, detail: roll.detail };
          pushLog(state, c.lifeNo, "social", `与仇敌${rel.name}和解失败（判定明细：${roll.detail.text}）：花费灵石 25，仇怨 +8（${rel.bond}）。`);
        }
        advanceActionMonths(state, "social"); // U-608：社交耗时按细时钟配置表（social，配置表定 3 月）
      }

      // 关系类型不匹配：上面各分支都不会命中，这里统一给出原因，不再静默。
      const relName = REL_KIND_NAME[rel.kind] ?? "故人";
      if (args.kind === "visit" && rel.kind === "enemy") {
        hint(state, c.lifeNo, `${rel.name}是你的仇敌，仇怨未消，不会让你登门拜访——先和解，或决斗了结这段仇怨。`);
      }
      if (args.kind === "dual" && rel.kind !== "partner") {
        hint(state, c.lifeNo, `双修需要道侣关系——${rel.name}是你的${relName}，不是道侣。`);
      }
      if (args.kind === "guidance" && rel.kind !== "master") {
        hint(state, c.lifeNo, `请教需要师父关系——${rel.name}是你的${relName}，不是师父。`);
      }
      if (args.kind === "teach" && rel.kind !== "disciple") {
        hint(state, c.lifeNo, `指点需要徒弟关系——${rel.name}是你的${relName}，不是徒弟。`);
      }
      if (args.kind === "duel" && rel.kind !== "enemy") {
        hint(state, c.lifeNo, `决斗只能向仇敌发起——${rel.name}是你的${relName}，与你无冤无仇。`);
      }
      if (args.kind === "reconcile" && rel.kind !== "enemy") {
        hint(state, c.lifeNo, `和解是说给仇敌听的——${rel.name}是你的${relName}，与你并无仇怨。`);
      }

      checkDeath(state, "社交往来中寿元耗尽");
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

};
