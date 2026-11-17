// 轮回修仙跑团 — 降生与轮回动作：抽选命盘、创建角色、轮回结算与开启
// 下一世。从 actions.ts 原样拆分，规则未动。

import { defineAction, z } from "./platform";
import { ARTIFACTS, CURRENT_EVENT_VERSION, EVENT_PACKS, EVENT_RELEASES, NAME_POOL, REINCARNATION_POINTS, ROOTS, TALENTS, TIME_COSTS, birthBoonById, destinyById, locById, talentById, treasureById } from "./data";
import {
applyBirthBoons, applyBirthBoost, applyCultivationLevels, applyTalentsOnCreate, artifactGate, grantArtifact, grantShards, loadState, pushLog, realmText,
emptyCommissionState, emptyDailyState, emptySignInState, emptyTimedEventState, ensureCommissionBoard, ensureDailyBoard, ensureTimedBoard, realmsFor, rngForNext, saveState, shuffledEventDeck, weekKeyOf, type BirthBoost, type Character,
} from "./state";
import { applyDestiny, buildReincarnation, drawThree, makeBirthDraw, makeFragments, resolveChoice, rollRatedTalents } from "./reincarnation";
import { randomSet, uniformTable, weighted } from "./rng";
import { stateResponse, toResponse, type StateResponse } from "./respond";

export const lifeActions = {

  drawStart: defineAction({
    description: "为下一世降生重抽全部候选：出身、命格、灵根各抽 3 个（Q11/Q13 大随机池），天赋候选 3 个；姓名不走抽选（自填或降生时从姓名池随机）。开局与每次重抽时调用。",
    request: z.object({}),
    response: stateResponse,
    async handler(ctx): Promise<StateResponse> {
      const state = await loadState(ctx);
      if (state.character && !state.character.dead) return toResponse(state);
      // 轮回结算中重抽时，天赋候选保持评级池，只重抽出身/命格/灵根三项。
      if (state.character?.dead && state.reincarnation) {
        const keepTalents = state.birthDraw?.talentChoices ?? [];
        const keepChosen = state.birthDraw?.chosenTalents ?? [];
        state.birthDraw = makeBirthDraw(rngForNext(state, "birth-draw"), state.character.talentIds);
        if (keepTalents.length > 0) { state.birthDraw.talentChoices = keepTalents; state.birthDraw.chosenTalents = keepChosen; }
      } else {
        state.birthDraw = makeBirthDraw(rngForNext(state, "birth-draw"), state.character?.talentIds ?? []);
      }
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  abandonCreation: defineAction({
    description: "放弃未完成的第一世创建：创建角色不做保存、不断续——尚无角色且无前世时（第一世降生抽选未走完），作废服务端存下的降生抽选并解锁本局规则（rulesLocked 回 false，设定值保留），退出就当退出了。已有角色（含陨落待轮回）或已有前世时属进行中的存档，本动作不动任何字段。",
    request: z.object({}),
    response: stateResponse,
    async handler(ctx): Promise<StateResponse> {
      const state = await loadState(ctx);
      if (!state.character && state.lives.length === 0 && (state.birthDraw !== null || state.rulesLocked)) {
        state.birthDraw = null;
        state.rulesLocked = false;
        await saveState(ctx, state);
      }
      return toResponse(state);
    },
  }),

  setBirthChoice: defineAction({
    description: "降生抽选：为出身/命格/灵根中的一项选择「随机」或自选一个候选值（Q13 独立随机/自选；姓名不走抽选）。",
    request: z.object({
      field: z.enum(["origin", "destiny", "root"]),
      random: z.boolean(),
      value: z.string().max(20).optional(),
    }),
    response: stateResponse,
    async handler(ctx, args): Promise<StateResponse> {
      const state = await loadState(ctx);
      if (state.character && !state.character.dead) return toResponse(state);
      if (!state.birthDraw) state.birthDraw = makeBirthDraw(rngForNext(state, "birth-draw"), state.character?.talentIds ?? []);
      const draw = state.birthDraw;
      const choice = draw[args.field];
      if (args.random) {
        choice.random = true;
        choice.value = weighted(rngForNext(state, `birth-choice:${args.field}`), uniformTable(choice.pool));
      } else if (args.value && choice.pool.includes(args.value)) {
        choice.random = false;
        choice.value = args.value;
      }
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  setDrawTalents: defineAction({
    description: "降生抽选/轮回结算：从天赋候选中选定要带入这一世的天赋（最多 1 个新天赋）。",
    request: z.object({ talentIds: z.array(z.string()).max(3) }),
    response: stateResponse,
    async handler(ctx, args): Promise<StateResponse> {
      const state = await loadState(ctx);
      if (state.character && !state.character.dead) return toResponse(state);
      if (!state.birthDraw) state.birthDraw = makeBirthDraw(rngForNext(state, "birth-draw"), state.character?.talentIds ?? []);
      state.birthDraw.chosenTalents = args.talentIds.filter((id) => state.birthDraw?.talentChoices.some((t) => t.id === id)).slice(0, 1);
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  createCharacter: defineAction({
    description: "创建新一世角色：出身/命格/灵根/天赋按降生抽选结算（Q11 直接随机、Q13 独立自选），姓名用传入值、未传则从姓名池全池随机；Q2 锁定时灵根按设计树强制；Q9 为「开局自带」时按传入 artifactId 赋予一件本命法宝（U-618：境界未达该宝门槛时封存、加成不生效，达门槛自动解封），为定稿规则时第一世无本命法宝。",
    request: z.object({
      name: z.string().max(12).optional(),
      artifactId: z.string().max(20).optional(),
    }),
    response: stateResponse,
    async handler(ctx, args): Promise<StateResponse> {
      const state = await loadState(ctx);
      if (state.character && !state.character.dead) return toResponse(state);
      if (state.lives.length > 0) return toResponse(state); // 后续世走 reincarnate
      const draw = state.birthDraw ?? makeBirthDraw(rngForNext(state, "birth-draw"));
      const q2Lock = state.settings.q2.value;
      const forcedRootId = q2Lock === "waste_root" ? "waste" : q2Lock === "reborn" ? "heaven" : null;
      const drawnRootId = resolveChoice(draw.root, rngForNext(state, "birth-choice:root"));
      const root = forcedRootId
        ? (ROOTS.find((r) => r.id === forcedRootId) ?? ROOTS[0])
        : (ROOTS.find((r) => r.id === drawnRootId) ?? ROOTS[0]);
      if (!root) throw new Error("invalid root");
      const realms = realmsFor(state.settings);
      const def = realms[0];
      if (!def) throw new Error("no realms");
      const drawnName = weighted(rngForNext(state, "birth-name"), uniformTable(NAME_POOL));
      const drawnOrigin = resolveChoice(draw.origin, rngForNext(state, "birth-choice:origin"));
      const drawnDestinyId = resolveChoice(draw.destiny, rngForNext(state, "birth-choice:destiny"));
      const destiny = destinyById(drawnDestinyId);
      const c: Character = {
        name: (args.name && args.name.trim()) ? args.name.trim().slice(0, 12) : drawnName,
        origin: drawnOrigin, rootId: root.id, rootName: root.name,
        artifactId: "", artifactName: "", artifactBonusApplied: false,
        lifeNo: 1, realmIdx: 0, stageIdx: 0,
        cultivation: 0, totalCultivation: 0,
        hp: def.hp, maxHp: def.hp, mp: def.mp, maxMp: def.mp,
        stones: 50, karma: 0, age: 16, lifespan: def.lifespan,
        // U-608 细时钟：累计月份自降生起算 = 降生年龄 × 每年月数。
        totalMonths: 16 * TIME_COSTS.monthsPerYear,
        locationId: "village",
        might: root.might, sense: root.sense, fortune: root.fortune, body: root.body,
        sealedMemory: q2Lock === "waste_root" || q2Lock === "artifact_only",
        memoryTier: 0,
        dead: false, deathCause: null, pendingEvent: null, lastRoll: null, route: null,
        talentIds: [...draw.chosenTalents], techniqueId: null, legacyPoints: 0, jadeLayers: 0,
        weekKey: weekKeyOf(new Date()), groupCounts: {}, caveClaimedLife: 0,
        destinyId: "", sectRankId: "", sectContrib: 0,
        breakFails: 0, recentEvents: [], quickPlan: [], eventDeck: [],
        // U-395：第一世牌堆按当时最新投放版本落定（投放口径见 state.ts）。
        deckVersion: CURRENT_EVENT_VERSION,
        commissions: emptyCommissionState(),
        timedEvents: emptyTimedEventState(),
        dailyCommissions: emptyDailyState(),
        signIns: emptySignInState(),
        craftUses: {},
        ores: {},
        relations: [], pills: { heal: 0, cult: 0, brk: 0 }, caveLevel: 0, breakBonus: 0,
      };
      applyDestiny(c, drawnDestinyId);
      applyTalentsOnCreate(c);
      // Q16：主线达成后，每世降生携带前世道果。
      if (state.mainline.done) { c.sense += 4; c.fortune += 4; }
      // Q9「开局自带一件」：设计树显式改选此项时，第一世降生即带一件
      // 所选本命法宝（服务端校验 id）；定稿规则下不赋予。U-618：赋予
      // 走统一入口 grantArtifact——降生境界（炼气）未达该宝门槛时法宝
      // 封存、加成不生效，境界达到门槛后自动解封，降生日志写明。
      const startArtifact = state.settings.q9.value === "from_start" && args.artifactId
        ? (ARTIFACTS.find((a) => a.id === args.artifactId) ?? null) : null;
      const startSealed = startArtifact ? grantArtifact(state, c, startArtifact) : false;
      // U-002：开局分配的轮回点属性加成在降生时落定（第一世点数恒为 0，
      // 此处通常无分配；逻辑与 reincarnate 共用同一结算点）。
      const boostNote = applyBirthBoost(state, c);
      // U-021：已购的「再战天道」强化项也在降生时一次性落定。
      const boonNote = applyBirthBoons(state, c);
      const artifactNote = startArtifact
        ? startSealed
          ? `本命法宝「${startArtifact.name}」自幼随身（设计树 Q9：开局自带），但此宝需${artifactGate(state, c).minRealmName}境方能认主——当前炼气，法宝封存暂不可用，境界达到后自动解封。`
          : `本命法宝「${startArtifact.name}」自幼随身（设计树 Q9：开局自带）。`
        : "";
      const talentNote = c.talentIds.length > 0 ? `天赋：${c.talentIds.map((id) => talentById(id)?.name ?? id).join("、")}。` : "";
      const destinyNote = destiny ? `命格「${destiny.name}」：${destiny.desc}` : "";
      if (q2Lock === "reborn") {
        c.cultivation = 90; c.totalCultivation = 90; c.sense += 6; c.stones += 100;
        pushLog(state, c.lifeNo, "birth", `${c.name}（${c.origin}）带着前世记忆睁开眼——转世重修，第一世便已站在炼气门槛之上。${artifactNote}${talentNote}${destinyNote}`);
      } else if (q2Lock === "waste_root") {
        pushLog(state, c.lifeNo, "birth", `${c.name} 出生于山下凡村，${c.origin}。测灵根时石碑毫无反应——废灵根。但没人知道，他脑海深处封着一世记忆。${artifactNote}${talentNote}${destinyNote}`);
      } else {
        pushLog(state, c.lifeNo, "birth", `${c.name} 出生于山下凡村，${c.origin}，${c.rootName}，${startArtifact ? artifactNote : "赤手空拳踏上仙途——本命法宝，要等第一世死后从所得中挑。"}${talentNote}${destinyNote}`);
      }
      if (boostNote) pushLog(state, c.lifeNo, "birth", boostNote);
      if (boonNote) pushLog(state, c.lifeNo, "birth", boonNote);
      state.character = c;
      state.birthDraw = null;
      // U-576：本世开局洗一副事件牌堆，本世探索从牌堆抽牌不重复。
      c.eventDeck = shuffledEventDeck(state);
      // U-388：新一世开局即贴满委托板（板面补齐口径见 state.ts）。
      ensureCommissionBoard(state);
      // U-389：新一世开局即挂满限时帖（挂帖年龄自降生之年起算）。
      ensureTimedBoard(state);
      // U-390：新一世开局即刷出降生之月的第一批日常委托（按月刷新
      // 口径见 state.ts 的 ensureDailyBoard，首次刷新不留痕）。
      ensureDailyBoard(state);
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  prepareReincarnation: defineAction({
    description: "角色陨落后生成轮回结算：本世评级、传承点、保留候选池、下一世降生抽选（出身/命格/灵根/天赋）与记忆保留判定（Q12）。",
    request: z.object({}),
    response: stateResponse,
    async handler(ctx): Promise<StateResponse> {
      const state = await loadState(ctx);
      const c = state.character;
      if (!c || !c.dead) return toResponse(state);
      if (!state.reincarnation) state.reincarnation = buildReincarnation(state, c);
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  selectKeepsake: defineAction({
    description: "轮回结算：点选一件保留候选（法宝/功法/遗藏），用传承点赎回或取消；遗藏需再点地图选埋藏地点。",
    request: z.object({ kind: z.enum(["artifact", "technique", "treasure"]), id: z.string().min(1), locationId: z.string().optional() }),
    response: stateResponse,
    async handler(ctx, args): Promise<StateResponse> {
      const state = await loadState(ctx);
      const c = state.character;
      const re = state.reincarnation;
      if (!c || !c.dead || !re) return toResponse(state);
      const cand = re.keepsakeCandidates.find((k) => k.kind === args.kind && k.id === args.id);
      if (!cand) return toResponse(state);
      // Q12：走火入魔魂飞魄散，本命法宝碎裂——法宝类不可再赎回。
      if (args.kind === "artifact" && re.artifactShattered) return toResponse(state);
      // U-618：候选被门槛锁定（本世止步境界未达该宝使用门槛）时不可
      // 点选带走——客户端已禁用，此处服务端同步拦截，不结算。
      if (cand.locked) return toResponse(state);
      const existingIdx = re.keepsakes.findIndex((k) => k.kind === args.kind && k.id === args.id);
      if (existingIdx >= 0) { re.keepsakes.splice(existingIdx, 1); await saveState(ctx, state); return toResponse(state); }
      // U-618：法宝类只许赎回本世实际持有的那一件——候选池口径
      // （buildReincarnation）的服务端兜底，本世没持有过的法宝点选
      // 一律不结算（取消已选的走上方 toggle，不受此限）。
      if (args.kind === "artifact" && c.artifactId !== args.id) return toResponse(state);
      if (args.kind === "artifact") re.keepsakes = re.keepsakes.filter((k) => k.kind !== "artifact");
      if (args.kind === "technique") re.keepsakes = re.keepsakes.filter((k) => k.kind !== "technique");
      if (args.kind === "treasure" && !args.locationId) return toResponse(state);
      const keptCost = re.keepsakes.reduce((sum, k) => sum + (re.keepsakeCandidates.find((x) => x.kind === k.kind && x.id === k.id)?.cost ?? 0), 0);
      if (keptCost + cand.cost > c.legacyPoints + re.legacyEarned) return toResponse(state);
      re.keepsakes.push({ kind: args.kind, id: args.id, locationId: args.locationId });
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  reincarnate: defineAction({
    description: "确认轮回结算并开启下一世：写入前世记录与前尘残片，结算传承点、赎回保留与记忆判定（Q12）；下一世出身/命格/灵根/天赋按降生抽选结算（Q13），姓名用传入值、未传则从姓名池全池随机，宗门身份不跨世。",
    request: z.object({ name: z.string().max(12).optional() }),
    response: stateResponse,
    async handler(ctx, args): Promise<StateResponse> {
      const state = await loadState(ctx);
      const c = state.character;
      if (!c) return toResponse(state);
      if (!c.dead) return toResponse(state);
      if (!state.reincarnation) state.reincarnation = buildReincarnation(state, c);
      const re = state.reincarnation;
      const draw = state.birthDraw ?? makeBirthDraw(rngForNext(state, "birth-draw"), c.talentIds);

      const keptCost = re.keepsakes.reduce((sum, k) => sum + (re.keepsakeCandidates.find((x) => x.kind === k.kind && x.id === k.id)?.cost ?? 0), 0);
      const artifactKeep = re.keepsakes.find((k) => k.kind === "artifact");
      // Q12：死于走火入魔 = 魂飞魄散，赎回的本命法宝也碎裂，不带走。
      const artifact = !re.artifactShattered && artifactKeep ? (ARTIFACTS.find((a) => a.id === artifactKeep.id) ?? null) : null;
      const techniqueKeep = re.keepsakes.find((k) => k.kind === "technique");
      state.lives.push({
        lifeNo: c.lifeNo, name: c.name, realmText: realmText(c, state.settings), age: c.age,
        cause: c.deathCause ?? "陨落", grade: re.grade,
        artifactName: c.artifactName,
        keepsakes: re.keepsakes.map((k) => re.keepsakeCandidates.find((x) => x.kind === k.kind && x.id === k.id)?.name ?? k.id),
        talents: [...c.talentIds],
      });
      const frags = makeFragments(state, c, re.memoryKept);
      state.fragments = [...frags, ...state.fragments].slice(0, 30);

      const q3 = state.settings.q3.value;
      const inheritRate = q3 === "recommended" ? 0.1 : q3 === "generous" ? 0.3 : 0;
      const inherited = Math.floor(c.totalCultivation * inheritRate);
      const memoryKept = re.memoryKept;
      const realms = realmsFor(state.settings);
      const def = realms[0];
      if (!def) throw new Error("no realms");

      // 下一世灵根（Q13）：Q2 锁定则按设计树，否则按降生抽选（可换根骨重修）。
      const q2Lock = state.settings.q2.value;
      const forcedRootId = q2Lock === "waste_root" ? "waste" : q2Lock === "reborn" ? "heaven" : null;
      const root = forcedRootId
        ? (ROOTS.find((r) => r.id === forcedRootId) ?? ROOTS[0])
        : (ROOTS.find((r) => r.id === resolveChoice(draw.root, rngForNext(state, "birth-choice:root"))) ?? ROOTS.find((r) => r.id === c.rootId) ?? ROOTS[0]);
      if (!root) throw new Error("no root");

      // 天赋保留：旧天赋 + 本世新选（上限 3，超出时替换最旧的）。
      const nextTalents = [...c.talentIds];
      for (const id of draw.chosenTalents) {
        if (!nextTalents.includes(id)) { nextTalents.push(id); while (nextTalents.length > 3) nextTalents.shift(); }
      }
      // 遗藏类保留：结算时即埋入所选地点，后世探索取回。
      for (const k of re.keepsakes.filter((x) => x.kind === "treasure")) {
        const tr = treasureById(k.id);
        const loc = k.locationId ? locById(k.locationId) : undefined;
        if (tr && loc) state.buried.push({ treasureId: tr.id, treasureName: tr.name, locationId: loc.id, locationName: loc.name, buriedLife: c.lifeNo });
      }

      const drawnDestinyId = resolveChoice(draw.destiny, rngForNext(state, "birth-choice:destiny"));
      const destiny = destinyById(drawnDestinyId);
      const next: Character = {
        name: (args.name && args.name.trim()) ? args.name.trim().slice(0, 12) : weighted(rngForNext(state, "birth-name"), uniformTable(NAME_POOL)),
        origin: resolveChoice(draw.origin, rngForNext(state, "birth-choice:origin")), rootId: root.id, rootName: root.name,
        artifactId: artifact?.id ?? "", artifactName: artifact?.name ?? "", artifactBonusApplied: false,
        lifeNo: c.lifeNo + 1, realmIdx: 0, stageIdx: 0,
        cultivation: inherited, totalCultivation: inherited,
        hp: def.hp, maxHp: def.hp, mp: def.mp, maxMp: def.mp,
        // U-326 双层货币分层：灵石是局内（当世）货币，死后全清零，新世
        // 固定 50，与前世结余无关；跨局层轮回点/传承点永久保留、不受
        // 本次轮回影响。U-021 天道馈赠的开局灵石 +120 由 applyBirthBoons
        // 在这个 50 的基础上叠加，不受本项改动影响。
        stones: 50, karma: c.karma,
        age: 16, lifespan: def.lifespan, locationId: "village",
        // U-608 细时钟：新世累计月份同样自降生起算（不跨世累计）。
        totalMonths: 16 * TIME_COSTS.monthsPerYear,
        might: root.might, sense: root.sense, fortune: root.fortune, body: root.body,
        sealedMemory: !memoryKept || state.settings.q2.value === "waste_root",
        memoryTier: memoryKept ? c.lifeNo : c.memoryTier,
        dead: false, deathCause: null, pendingEvent: null, lastRoll: null, route: null,
        talentIds: nextTalents, techniqueId: techniqueKeep?.id ?? null,
        legacyPoints: c.legacyPoints + re.legacyEarned - keptCost,
        jadeLayers: c.jadeLayers,
        weekKey: weekKeyOf(new Date()), groupCounts: {}, caveClaimedLife: 0,
        destinyId: "", sectRankId: "", sectContrib: 0,
        breakFails: 0, recentEvents: [], quickPlan: [], eventDeck: [],
        // U-395：新世牌堆版本推进到当时最新投放版本——上一世降生
        // 之后才投放的新批次事件随这一世入世（旧存档无需重开存
        // 档）；上一世的牌堆版本在下方投放播报里与此对比。
        deckVersion: CURRENT_EVENT_VERSION,
        commissions: emptyCommissionState(),
        timedEvents: emptyTimedEventState(),
        dailyCommissions: emptyDailyState(),
        signIns: emptySignInState(),
        craftUses: {},
        ores: {},
        relations: [], pills: { heal: 0, cult: 0, brk: 0 }, caveLevel: 0, breakBonus: 0,
      };
      // U-618：赎回带走的法宝走统一赋予入口——新世自炼气起步，未达
      // 该宝门槛时先封存（加成不生效），境界达到门槛后自动解封；
      // 解封/封存的说明在下方降生日志之后另记一条。
      const artifactSealed = artifact ? grantArtifact(state, next, artifact) : false;
      applyDestiny(next, drawnDestinyId);
      applyTalentsOnCreate(next);
      // Q16：主线达成后，每世降生携带前世道果。
      if (state.mainline.done) { next.sense += 4; next.fortune += 4; }
      // Q16：上一世记忆保留成功，清晰的记忆凝成 2 枚碎片汇入前世之谜。
      if (memoryKept) { state.character = next; grantShards(state, 2); }
      if (!memoryKept) next.sense = Math.max(5, next.sense - 3);
      // U-002：开局分配的轮回点属性加成在降生时落定（在记忆封印的神识
      // 扣减之后叠加，分配买到的加成不被封印吃掉），随后清空待分配。
      const boostNote = applyBirthBoost(state, next);
      // U-021：已购的「再战天道」强化项也在降生时一次性落定并清空。
      const boonNote = applyBirthBoons(state, next);
      state.character = next;
      state.reincarnation = null;
      state.birthDraw = null;
      // U-576：新一世开局重新洗一副事件牌堆（上一世的牌堆不跨世）。
      next.eventDeck = shuffledEventDeck(state);
      // U-388：新一世开局即贴满委托板（板面补齐口径见 state.ts）。
      ensureCommissionBoard(state);
      // U-389：新一世开局即挂满限时帖（上一世的帖不跨世带入）。
      ensureTimedBoard(state);
      // U-390：新一世开局即刷出降生之月的第一批日常委托（上一世的
      // 日常委托不跨世带入，首次刷新不留痕）。
      ensureDailyBoard(state);
      applyCultivationLevels(state);
      pushLog(state, next.lifeNo, "birth",
        `第${next.lifeNo}世开启：${next.name}（${next.origin}，${next.rootName}${destiny ? `，命格「${destiny.name}」` : ""}）。本世评级 ${re.grade}，得传承点 ${re.legacyEarned}（余 ${next.legacyPoints}）。${re.memoryNote}保留：${re.keepsakes.length > 0 ? re.keepsakes.map((k) => re.keepsakeCandidates.find((x) => x.kind === k.kind && x.id === k.id)?.name ?? k.id).join("、") : "无"}${re.artifactShattered && artifactKeep ? "（走火入魔魂飞魄散，赎回的法宝已碎裂）" : ""}；继承修为 ${inherited} 点${inheritRate > 0 ? `（前世总修为打折，只留${Math.round(inheritRate * 100)}%）` : ""}，今生起点 ${realmText(next, state.settings)}。`);
      pushLog(state, next.lifeNo, "birth", `🔄 轮回结算发放轮回点 +${re.pointsEarned}（按 ${re.grade} 级档位），轮回点余 ${state.reincarnationPoints}——只用于开局分配，与传承点不混用。`);
      if (re.shardPointsEarned > 0) pushLog(state, next.lifeNo, "birth", `🧩 主线轮回点：上一世新集记忆碎片 ${re.shardsThisLife} 枚（前世之谜），按碎片档发放轮回点 +${re.shardPointsEarned}，已与评级发放同池入账（余 ${state.reincarnationPoints}）。`);
      if (boostNote) pushLog(state, next.lifeNo, "birth", boostNote);
      if (boonNote) pushLog(state, next.lifeNo, "birth", boonNote);
      if (artifact && artifactSealed) pushLog(state, next.lifeNo, "birth", `🗡️ 本命法宝「${artifact.name}」随轮回带走，但新世境界未至（需${artifactGate(state, next).minRealmName}境，当前炼气）——法宝封存于身、加成暂不生效，境界达到后自动解封认主。`);
      // U-394：本世恰好达到解锁世数的外传包在此播报——新包事件已随
      // 本世牌堆建堆加入轮询（建堆过滤在 state.ts shuffledEventDeck）。
      for (const p of EVENT_PACKS.packs) {
        if (p.minLife === next.lifeNo && p.eventIds.length > 0) {
          pushLog(state, next.lifeNo, "birth", `📚 外传解锁：${p.name}——${p.desc}（${p.eventIds.length} 桩新际遇已加入本世探索轮询）`);
        }
      }
      // U-395：上一世降生之后才投放的新批次在此播报——其事件已随
      // 本世牌堆版本推进加入轮询（建堆过滤在 state.ts
      // shuffledEventDeck / drawEventFromDeck），旧存档无需重开。
      for (const b of EVENT_RELEASES.batches) {
        if (b.version > c.deckVersion && b.version <= next.deckVersion) {
          pushLog(state, next.lifeNo, "birth", `🆕 事件投放：${b.name}——${b.desc}（第 ${b.version} 批共 ${b.eventIds.length} 桩新增际遇已随这一世轮回入世，加入本世探索轮询）`);
        }
      }
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  // ---------- U-002 轮回点开局分配 ----------
  // 轮回点只在开局（无角色 / 角色已陨落待轮回）花：①逐点分给四维初始
  // 属性（价格与单项上限出自配置表，减分原价退回）；②整段重置天赋与
  // 灵根候选。点数池与传承点完全分开：本组动作只读写
  // state.reincarnationPoints / state.birthBoost，绝不碰 legacyPoints。

  allocatePoints: defineAction({
    description: "轮回点开局分配：把轮回点逐点分给下一世的初始属性（战力/神识/机缘/体魄），正数扣点、负数退点，受配置表单项上限与余额约束；降生时生效。只花轮回点，不碰传承点。",
    request: z.object({
      attr: z.enum(["might", "sense", "fortune", "body"]),
      delta: z.number().int().min(-10).max(10),
    }),
    response: stateResponse,
    async handler(ctx, args): Promise<StateResponse> {
      const state = await loadState(ctx);
      if (state.character && !state.character.dead) return toResponse(state);
      if (args.delta === 0) return toResponse(state);
      const cfg = REINCARNATION_POINTS;
      const boost: BirthBoost = state.birthBoost ?? { might: 0, sense: 0, fortune: 0, body: 0 };
      const nextVal = boost[args.attr] + args.delta;
      // 越界（超单项上限 / 减到负数）或余额不足时整笔不结算、不改状态。
      if (nextVal < 0 || nextVal > cfg.attrCapPerAttr) return toResponse(state);
      const cost = args.delta * cfg.attrCostPerPoint;
      if (cost > state.reincarnationPoints) return toResponse(state);
      boost[args.attr] = nextVal;
      state.birthBoost = boost;
      state.reincarnationPoints -= cost;
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  buyBirthBoon: defineAction({
    description: "轮回点开局强化（U-021）：购入或退订一项「再战天道」强化项（配置表 boons：气血/法力上限、寿元、开局灵石），购入扣轮回点、退订原价退回，降生时一次性生效；与 U-002 的属性分配/重置候选分开记账，同走轮回点池、不碰传承点。",
    request: z.object({ boonId: z.string().min(1).max(40) }),
    response: stateResponse,
    async handler(ctx, args): Promise<StateResponse> {
      const state = await loadState(ctx);
      if (state.character && !state.character.dead) return toResponse(state);
      const boon = birthBoonById(args.boonId);
      if (!boon) return toResponse(state);
      if (!state.birthBoons) state.birthBoons = [];
      const idx = state.birthBoons.indexOf(boon.id);
      if (idx >= 0) {
        // 退订：降生前可反悔，原价退回轮回点池。
        state.birthBoons.splice(idx, 1);
        state.reincarnationPoints += boon.cost;
      } else {
        // 购入：余额不足整笔不结算、不改状态；每项每世只购一份。
        if (state.reincarnationPoints < boon.cost) return toResponse(state);
        state.reincarnationPoints -= boon.cost;
        state.birthBoons.push(boon.id);
      }
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

  resetDrawWithPoints: defineAction({
    description: "轮回点开局分配：花费轮回点（配置表定价）定向重置降生抽选的天赋候选与灵根候选——出身/命格不动、已选天赋清空；结算中重置时天赋仍走本世评级池。与免费的「全部重抽」分工：那个重抽全部四项，这个只换天赋与灵根。",
    request: z.object({}),
    response: stateResponse,
    async handler(ctx): Promise<StateResponse> {
      const state = await loadState(ctx);
      if (state.character && !state.character.dead) return toResponse(state);
      const draw = state.birthDraw;
      if (!draw) return toResponse(state);
      const cfg = REINCARNATION_POINTS;
      if (state.reincarnationPoints < cfg.resetCost) return toResponse(state);
      state.reincarnationPoints -= cfg.resetCost;
      // 灵根候选：与 drawStart/makeBirthDraw 同口径——Q2 锁定废灵根时灵根
      // 不重抽（保持锁定待掷，费用实际只换天赋），其余从灵根池重抽 3 个。
      if (state.settings.q2.value === "waste_root") {
        draw.root = { pool: ["waste"], value: "waste", random: false };
      } else {
        const rootPool = drawThree(ROOTS, rngForNext(state, "points-reset:root")).map((r) => r.id);
        draw.root = { pool: rootPool, value: rootPool[0] ?? draw.root.value, random: true };
      }
      // 天赋候选：轮回结算中仍按本世评级池重抽（与结算生成同一口径）；
      // 第一世开局则从天赋池不放回抽 3（排除项与 makeBirthDraw 一致）。
      if (state.character?.dead && state.reincarnation) {
        draw.talentChoices = rollRatedTalents(rngForNext(state, "points-reset:talents"), state.reincarnation.grade, state.character.talentIds);
      } else {
        const talentPool = TALENTS.filter((t) => !(state.character?.talentIds ?? []).includes(t.id));
        draw.talentChoices = randomSet(rngForNext(state, "points-reset:talents"), 3, talentPool);
      }
      draw.chosenTalents = [];
      await saveState(ctx, state);
      return toResponse(state);
    },
  }),

};
