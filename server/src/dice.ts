// 轮回修仙跑团 — U-568 判定表达式解析器：把判定写成骰子表达式求值，
// 如「1d150+修正 vs 难度」，不再在各 actions 里手写掷骰+加总。
// 来源：C-11《dice-roller/rpg-dice-roller》——照它的架构分层：文法定义、
// 词法、语法分析、求值四层分离，核心库与 UI 解耦（服务端只调本模块
// 求值，前端只展示结果）。本模块按同一文法结构在本地实现，不设为
// 生产依赖、未 npm 安装。
//
// 文法（EBNF，优先级自低到高；与下方 Parser 的方法一一对应）：
//   expression := term (("+" | "-") term)*
//   term       := factor (("*" | "/" | "×" | "÷") factor)*
//   factor     := ("-" | "+") factor | primary
//   primary    := dice | number | identifier | "(" expression ")"
//   dice       := [number] ("d" | "D") number [drop]  // 1d150、d20、4d6、2d150L
//   drop       := "L" | "H"                           // U-572 双掷后缀，见下
//   identifier := 变量名（字母/汉字/下划线开头）        // 由 vars 注入数值，如「修正」
// 求值语义：
// - 骰子用调用方传入的 U-573 种子化实例逐颗掷（rng.int(1, sides)），
//   每组骰子的逐颗结果都保留在返回值 rolls 里，供 U-570 结构化展示复用。
// - U-572 双掷后缀（照 C-12 RANDSUM 的优劣势表达 roll("2d20L") /
//   roll("2d20H")，本地约定）：骰子组带 L = 舍弃最低的一颗、取其余
//   （优势，2d150L = 掷两颗取高的）；带 H = 舍弃最高的一颗、取其余
//   （劣势，2d150H = 掷两颗取低的）。被舍弃的骰值仍逐颗记录在组的
//   droppedRolls 里，保留下来的在 keptRolls 里，subtotal 只算保留的。
//   后缀只加记号与掷法：掷骰仍逐颗走种子实例（双掷即连续两次
//   int(1, sides)），不改骰面与任何数值；哪些判定算优势/劣势由各
//   系统规则自己定，本解析器不设触发条件。后缀要求至少 2 颗骰子，
//   1 颗带后缀抛错。
// - 除法为整数除法（向零截断）；除零抛错。
// - 变量必须由 vars 提供，缺失抛错；表达式非法（空、括号不配、骰子
//   个数/面数越界、尾随多余 token）一律抛错，不静默兜底——错误经
//   动作层 withErrorLogging 记入服务端报错记录。
// 边界：本项只做表达式解析与求值，不做结构化展示（U-570）、
// 不改任何判定数值：
// rollCheck 改走本模块后，同一存档同一操作掷出的骰值与改前逐字相同
// （1d150 仍是种子实例的第一次 int(1, 150)，修正仍是同一个加数）。

import { SeededRng } from "./rng";

// 一组骰子的求值明细：一颗一颗的原始骰值与小计。带 U-572 双掷后缀
// 时多三个字段：drop（"L" 舍低取高 / "H" 舍高取低）、keptRolls
// （保留下来的骰值）、droppedRolls（被舍弃的骰值）；subtotal 只算
// keptRolls。普通组无这三个字段，保留即全部 rolls。
export interface DiceGroupResult {
  count: number; sides: number; rolls: number[]; subtotal: number;
  drop?: "L" | "H"; keptRolls?: number[]; droppedRolls?: number[];
  // Q34：动态范围 [rangeLo, rangeHi]（记号 dS[lo~hi]）——带此二字段时
  // 每颗骰子掷的是 rng.int(rangeLo, rangeHi)，sides 仍记基础骰面。
  rangeLo?: number; rangeHi?: number;
}
// 一次表达式求值的完整结果：总和 + 每组骰子的明细 + 规范化回显文本。
export interface DiceEvalResult { total: number; groups: DiceGroupResult[]; text: string }

const MAX_DICE_COUNT = 100;
const MAX_DICE_SIDES = 1000;

// ---------- 词法 ----------

type Token =
  | { t: "num"; v: number }
  | { t: "ident"; v: string }
  | { t: "dice" }
  | { t: "op"; v: "+" | "-" | "*" | "/" }
  | { t: "lp" }
  | { t: "rp" }
  | { t: "lb" }
  | { t: "rb" }
  | { t: "tilde" };

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch) || (ch >= "一" && ch <= "鿿");
}
function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch) || (ch >= "一" && ch <= "鿿");
}

function tokenize(src: string): Token[] {
  const toks: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i] ?? "";
    if (ch === " " || ch === "\t" || ch === "　") { i += 1; continue; }
    if (ch >= "0" && ch <= "9") {
      let j = i;
      while (j < src.length && (src[j] ?? "") >= "0" && (src[j] ?? "") <= "9") j += 1;
      toks.push({ t: "num", v: Number(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (ch === "d" || ch === "D") { toks.push({ t: "dice" }); i += 1; continue; }
    if (isIdentStart(ch)) {
      let j = i;
      while (j < src.length && isIdentPart(src[j] ?? "")) j += 1;
      toks.push({ t: "ident", v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (ch === "+" || ch === "-") { toks.push({ t: "op", v: ch }); i += 1; continue; }
    if (ch === "*" || ch === "×") { toks.push({ t: "op", v: "*" }); i += 1; continue; }
    if (ch === "/" || ch === "÷") { toks.push({ t: "op", v: "/" }); i += 1; continue; }
    if (ch === "(" || ch === "（") { toks.push({ t: "lp" }); i += 1; continue; }
    if (ch === ")" || ch === "）") { toks.push({ t: "rp" }); i += 1; continue; }
    // Q34 动态范围记号：[下限~上限]，如 1d20[5~30]。
    if (ch === "[") { toks.push({ t: "lb" }); i += 1; continue; }
    if (ch === "]") { toks.push({ t: "rb" }); i += 1; continue; }
    if (ch === "~" || ch === "～") { toks.push({ t: "tilde" }); i += 1; continue; }
    throw new Error(`dice: unexpected character "${ch}" in expression`);
  }
  return toks;
}

// ---------- 语法分析 + 求值（递归下降，方法与文法规则一一对应） ----------

class Parser {
  private pos = 0;
  readonly groups: DiceGroupResult[] = [];

  constructor(
    private readonly toks: Token[],
    private readonly rng: SeededRng,
    private readonly vars: Record<string, number>,
  ) {}

  private peek(): Token | undefined { return this.toks[this.pos]; }
  private take(): Token | undefined { return this.toks[this.pos++]; }

  get atEnd(): boolean { return this.pos >= this.toks.length; }

  // expression := term (("+" | "-") term)*
  parseExpression(): number {
    let v = this.parseTerm();
    for (;;) {
      const tok = this.peek();
      if (!tok || tok.t !== "op" || (tok.v !== "+" && tok.v !== "-")) return v;
      this.take();
      const rhs = this.parseTerm();
      v = tok.v === "+" ? v + rhs : v - rhs;
    }
  }

  // term := factor (("*" | "/") factor)*
  private parseTerm(): number {
    let v = this.parseFactor();
    for (;;) {
      const tok = this.peek();
      if (!tok || tok.t !== "op" || (tok.v !== "*" && tok.v !== "/")) return v;
      this.take();
      const rhs = this.parseFactor();
      if (tok.v === "*") v = v * rhs;
      else {
        if (rhs === 0) throw new Error("dice: division by zero");
        v = Math.trunc(v / rhs);
      }
    }
  }

  // factor := ("-" | "+") factor | primary
  private parseFactor(): number {
    const tok = this.peek();
    if (tok && tok.t === "op" && (tok.v === "-" || tok.v === "+")) {
      this.take();
      const v = this.parseFactor();
      return tok.v === "-" ? -v : v;
    }
    return this.parsePrimary();
  }

  // primary := dice | number | identifier | "(" expression ")"
  // dice    := [number] ("d" | "D") number
  private parsePrimary(): number {
    const tok = this.take();
    if (!tok) throw new Error("dice: unexpected end of expression");
    if (tok.t === "dice") return this.rollDice(1);
    if (tok.t === "num") {
      const next = this.peek();
      if (next && next.t === "dice") { this.take(); return this.rollDice(tok.v); }
      return tok.v;
    }
    if (tok.t === "ident") {
      const v = this.vars[tok.v];
      if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`dice: unknown variable "${tok.v}"`);
      return v;
    }
    if (tok.t === "lp") {
      const v = this.parseExpression();
      const close = this.take();
      if (!close || close.t !== "rp") throw new Error("dice: missing closing parenthesis");
      return v;
    }
    throw new Error("dice: unexpected token in expression");
  }

  // 掷一组骰子：逐颗用种子实例掷并记录明细。count 已由文法保证为
  // 「d」前的数字（缺省 1）；面数是「d」后必须跟的数字；其后可跟
  // U-572 双掷后缀（紧贴的单个 ident token "L" / "H"）。
  private rollDice(count: number): number {
    const sidesTok = this.take();
    if (!sidesTok || sidesTok.t !== "num") throw new Error("dice: missing die sides after 'd'");
    const sides = sidesTok.v;
    if (!Number.isInteger(count) || count < 1 || count > MAX_DICE_COUNT) {
      throw new Error(`dice: dice count out of range (1..${MAX_DICE_COUNT})`);
    }
    if (!Number.isInteger(sides) || sides < 2 || sides > MAX_DICE_SIDES) {
      throw new Error(`dice: die sides out of range (2..${MAX_DICE_SIDES})`);
    }
    // Q34 动态范围：骰面后可跟 [下限~上限]，如 1d20[5~30]、2d20[5~30]L。
    let rangeLo: number | undefined;
    let rangeHi: number | undefined;
    if (this.peek()?.t === "lb") {
      this.take();
      const loTok = this.take();
      if (!loTok || loTok.t !== "num") throw new Error("dice: missing range lower bound after '['");
      const tildeTok = this.take();
      if (!tildeTok || tildeTok.t !== "tilde") throw new Error("dice: missing '~' in dice range");
      const hiTok = this.take();
      if (!hiTok || hiTok.t !== "num") throw new Error("dice: missing range upper bound in dice range");
      const rbTok = this.take();
      if (!rbTok || rbTok.t !== "rb") throw new Error("dice: missing ']' after dice range");
      rangeLo = loTok.v; rangeHi = hiTok.v;
      if (!Number.isInteger(rangeLo) || !Number.isInteger(rangeHi) || rangeLo < 1 || rangeHi < rangeLo || rangeHi > MAX_DICE_SIDES) {
        throw new Error(`dice: invalid dice range [${rangeLo}~${rangeHi}]`);
      }
    }
    let drop: "L" | "H" | undefined;
    const suffix = this.peek();
    if (suffix && suffix.t === "ident" && (suffix.v === "L" || suffix.v === "H")) {
      this.take();
      drop = suffix.v;
      if (count < 2) throw new Error("dice: drop suffix (L/H) needs at least 2 dice");
    }
    const rolls: number[] = [];
    for (let k = 0; k < count; k++) rolls.push(rangeLo !== undefined && rangeHi !== undefined ? this.rng.int(rangeLo, rangeHi) : this.rng.int(1, sides));
    const rangeFields = rangeLo !== undefined && rangeHi !== undefined ? { rangeLo, rangeHi } : {};
    if (!drop) {
      const subtotal = rolls.reduce((a, b) => a + b, 0);
      this.groups.push({ count, sides, rolls, subtotal, ...rangeFields });
      return subtotal;
    }
    // 双掷取舍：L 舍弃最低的一颗、H 舍弃最高的一颗（并列时舍弃先
    // 掷出的那一颗）；被舍弃的仍记录，subtotal 只算保留的。
    const target = drop === "L" ? Math.min(...rolls) : Math.max(...rolls);
    const dropIdx = rolls.indexOf(target);
    const keptRolls = rolls.filter((_, i) => i !== dropIdx);
    const droppedRolls = [target];
    const subtotal = keptRolls.reduce((a, b) => a + b, 0);
    this.groups.push({ count, sides, rolls, subtotal, drop, keptRolls, droppedRolls, ...rangeFields });
    return subtotal;
  }
}

// 求值一个骰子表达式：掷骰只用传入的种子化实例，同种子同表达式
// 重放得同一结果。vars 提供表达式里的变量（如 { 修正: 23 }）。
export function evaluateDiceExpression(rng: SeededRng, expression: string, vars: Record<string, number> = {}): DiceEvalResult {
  if (typeof expression !== "string" || expression.trim().length === 0) throw new Error("dice: empty expression");
  const parser = new Parser(tokenize(expression), rng, vars);
  const total = parser.parseExpression();
  if (!parser.atEnd) throw new Error("dice: trailing tokens after expression");
  return { total, groups: parser.groups, text: expression.trim() };
}

// ---------- U-569 modifier 链：可组合的判定修饰 ----------
// 借鉴 C-11 dice-roller 的 modifier 体系（只借 API 设计：modifier 是
// 可组合的链上环节，核心掷骰与修饰解耦；本地实现，不设为生产依赖）。
// 一个 modifier 有名字 + 两个可选钩子：
// - beforeRoll(ctx)：掷骰前调整 ctx.dc / ctx.bonus；
// - afterRoll(ctx)：掷骰后读 ctx.dice/total/success 做结算记账（如保底
//   的连败计数增减），不得改已定的 success。
// 判定主流程（state.ts 的 rollCheck）只调核心掷骰 + 依次过 modifier 链
// （链按数组顺序执行，顺序即叠加顺序）；以后加新修饰（爆炸/重掷/取
// 最高最低等）只新增一个 modifier，不改主流程。本项只落地突破保底
// 一个 modifier，不新增任何玩法修饰、不改任何判定数值。
// 非法配置一律抛错、不静默兜底：链不是数组、环节不是对象、名字缺失
// 或为空、两个钩子都没有、钩子不是函数，都会在掷骰前被拒。

export interface CheckModifierContext {
  dc: number;
  bonus: number;
  dice: number | null;
  total: number | null;
  success: boolean | null;
}

export interface CheckModifier {
  name: string;
  // U-570：可选的人类可读名，供结构化明细的 modifier 生效过程展示
  // （缺省时展示回退到 name）。
  label?: string;
  beforeRoll?: (ctx: CheckModifierContext) => void;
  afterRoll?: (ctx: CheckModifierContext) => void;
}

// 校验一条 modifier 链的形状；任一环节非法即抛错。
export function assertModifierChain(modifiers: CheckModifier[]): void {
  if (!Array.isArray(modifiers)) throw new Error("dice: modifier chain must be an array");
  for (const m of modifiers) {
    if (!m || typeof m !== "object") throw new Error("dice: modifier must be an object");
    if (typeof m.name !== "string" || m.name.trim().length === 0) throw new Error("dice: modifier needs a non-empty name");
    if (m.beforeRoll === undefined && m.afterRoll === undefined) throw new Error(`dice: modifier "${m.name}" has no hooks`);
    if (m.beforeRoll !== undefined && typeof m.beforeRoll !== "function") throw new Error(`dice: modifier "${m.name}" beforeRoll must be a function`);
    if (m.afterRoll !== undefined && typeof m.afterRoll !== "function") throw new Error(`dice: modifier "${m.name}" afterRoll must be a function`);
  }
}

// 掷骰前依次过链（数组顺序 = 叠加顺序）。
export function runModifiersBefore(modifiers: CheckModifier[], ctx: CheckModifierContext): void {
  assertModifierChain(modifiers);
  for (const m of modifiers) m.beforeRoll?.(ctx);
}

// 掷骰后依次过链（ctx 已带 dice/total/success）。
export function runModifiersAfter(modifiers: CheckModifier[], ctx: CheckModifierContext): void {
  assertModifierChain(modifiers);
  for (const m of modifiers) m.afterRoll?.(ctx);
}

// ---------- 突破连败保底 modifier（本项唯一落地的修饰） ----------
// 数值与改前逐字一致：每次突破失败，下次突破难度 −5，叠满 −20；
// 突破成功后连败清零。保底状态仍是角色原有字段 breakFails（连败
// 次数），减免由它现算、不另存、不改存档结构。此前这套公式散落在
// actions-play.ts 突破分支四处（难度计算、成功清零、失败累加、失败
// 日志重算），现统一收敛到这里：难度减免在 beforeRoll 改 ctx.dc，
// 连败增减在 afterRoll 记账。
export const BREAKTHROUGH_PITY_STEP = 5;
export const BREAKTHROUGH_PITY_CAP = 20;

export function breakthroughPityReduction(breakFails: number): number {
  if (!Number.isInteger(breakFails) || breakFails < 0) throw new Error(`dice: invalid breakFails for pity modifier: ${breakFails}`);
  return Math.min(BREAKTHROUGH_PITY_CAP, breakFails * BREAKTHROUGH_PITY_STEP);
}

// ---------- U-570 判定结构化返回 ----------
// 借鉴 C-11 dice-roller 与 C-12 RANDSUM 的结构化返回（只借 API 设计：
// 每次掷骰返回带每一步明细的类型化结果，而非只给总数；本地实现，不
// 设为生产依赖、未 npm 安装）。一次判定返回 CheckDetail：
// - rolls：每颗骰子的单颗原始结果（来自 U-568 求值的 groups）；
//   U-572 起另带 rollMode 与 keptRolls/droppedRolls（双掷取舍明细，
//   普通判定 keptRolls = rolls、droppedRolls = []）；
// - bonusParts / bonus：修正的构成明细与合计；
// - baseDc / dc：modifier 链生效前 / 后的阈值；
// - modifierTrace：每个 modifier 在 before/after 阶段对 dc/bonus 的
//   改动过程（如突破保底生效时能看到难度被扣了 −5）；
// - total / margin / success / grade：总值、胜势差（总值 − 难度）、
//   成败与成败等级。等级只按现有判定规则划分（总值 ≥ 难度 = 成功，
//   难度 ≤ 0 自动成功），不新定义等级。
// - text：一行可审计文本，如「1d150 掷出 87 + 战力 23 = 110 vs 难度 100」，
//   供游戏盘、编年史与结算共用同一份明细。
// U-571 判定记号规范（借鉴 C-12 RANDSUM 的 Dice Notation 思路：
// 一种记号、固定 modifier 顺序；本地约定，不设为生产依赖）。
// Q34（2026-11-14）改版：记号按系统分骰面并带动态范围——主记号
// 「1dS[下限~上限]+修正 vs 难度」（NdS = N 颗 S 面骰，S 为该系统
// 基础骰面；[下限~上限] 是本次掷骰由相关属性现算的实际范围）。
// 七个系统：斗法/决斗/复仇 d20、突破 d100、探索 d80、副职 d60、
// 社交 d40、宗门差事 d50、记忆保留 d100（百分比掷点，不走本明细）。
// 例：斗法「1d20[5~30] 掷出 17 + 战力 0 = 17 vs 难度 12」——战力已
// 计入骰面范围 [5~30]，不再重复进修正（防重复计算）。修正的固定
// 顺序（与 state.ts rollCheck 的 bonusParts 组装顺序、U-569 链的
// 执行顺序一致，不另编）：
//   ① 属性（未被骰面吸收时才计：战力/神识/机缘/体魄，已含天赋）
//   ② 承世玉（每层 +2）
//   ③ 额外加成（情境加成合并为一项：副职/事件天赋、突破的业力与
//      破境助力等）
//   ④ modifier 链掷骰前调整（U-569，按链上顺序叠加；目前只有突破
//      保底，扣难度：连败×5、封顶 −20；链若改修正，其增减按链顺序
//      追加在 ③ 之后）
// 总值 = 骰值 + 修正合计，与（基准难度按等概率换算、再经保底调整
// 的）难度比较：总值 ≥ 难度 = 成功，< 难度 = 失败（难度 ≤ 0 自动
// 成功）；胜势差 = 总值 − 难度，斗法奖惩另按归一化胜势差结算。
// U-572 双掷记号（照 C-12 RANDSUM 的 roll("2d20L") / roll("2d20H")
// 优劣势表达，Q34 起按各系统骰面适配）：「2d20[5~30]L」= 优势——
// 在本次动态范围内掷两颗、舍弃低的、取高的；「…H」= 劣势——舍弃
// 高的、取低的。双掷走 U-573 种子化随机（同一实例连续掷两颗），
// 结构化明细里 rolls 记两颗原始骰值、keptRolls/droppedRolls 写清
// 取了哪一颗、舍了哪一颗，审计文本同样写明。触发条件由各系统
// 规则定，记号本身不给任何加成。
// 校验纪律：字段非法/缺失/互相矛盾一律抛错（assertCheckDetail），
// 不静默兜底——错误经动作层记入服务端报错记录。本节只组装与校验
// 明细，不掷骰、不改任何判定数值。

// ---------- U-572 双掷模式 ----------
// 一次判定的掷法：normal = 普通单掷；advantage = 2dS[lo~hi]L（掷
// 两颗取高）；disadvantage = 2dS[lo~hi]H（掷两颗取低）。模式只决定记号与
// 掷法，由调用方按其系统规则传入（rollCheck 的 rollMode 参数）；
// 非法模式一律抛错，不静默回退到普通掷。
export type RollMode = "normal" | "advantage" | "disadvantage";

export function assertRollMode(mode: RollMode): void {
  if (mode !== "normal" && mode !== "advantage" && mode !== "disadvantage") {
    throw new Error(`dice: invalid roll mode "${String(mode)}"`);
  }
}

// 模式 → 双掷后缀（normal 无后缀）。
export function rollModeSuffix(mode: RollMode): "" | "L" | "H" {
  assertRollMode(mode);
  return mode === "advantage" ? "L" : mode === "disadvantage" ? "H" : "";
}

// 由求值明细的骰子组反推掷法（取第一组的双掷后缀；无后缀即普通）。
export function rollModeOfGroups(groups: DiceGroupResult[]): RollMode {
  const drop = groups[0]?.drop;
  return drop === "L" ? "advantage" : drop === "H" ? "disadvantage" : "normal";
}

export type CheckGrade = "success" | "failure";

export interface BonusPart { label: string; value: number }

export interface ModifierTraceEntry {
  name: string;
  label: string;
  phase: "before" | "after";
  dcBefore: number; dcAfter: number; dcDelta: number;
  bonusBefore: number; bonusAfter: number; bonusDelta: number;
}

export interface CheckDetail {
  expression: string;
  // Q34（U-570 增补）：本次判定所属系统、基础骰面与动态上下限——
  // 明细必须带本次掷骰的实际范围 [diceLo, diceHi]（现算、不进存档
  // 结构，旧存档明细无此四字段，整段可选）。scaledMargin 是胜势差
  // 按基准标尺（d150）归一化后的值，供斗法奖惩沿用原数值结构。
  system?: string;
  diceBase?: number;
  diceLo?: number;
  diceHi?: number;
  scaledMargin?: number;
  // rolls：全部原始骰值（双掷时两颗都在，按掷出顺序）；keptRolls /
  // droppedRolls：双掷取舍明细（普通判定 keptRolls = rolls、
  // droppedRolls = []）；diceTotal 只算 keptRolls。
  rollMode: RollMode;
  rolls: number[];
  keptRolls: number[];
  droppedRolls: number[];
  diceTotal: number;
  attrLabel: string;
  bonusParts: BonusPart[];
  bonus: number;
  baseDc: number;
  dc: number;
  total: number;
  margin: number;
  success: boolean;
  grade: CheckGrade;
  modifierTrace: ModifierTraceEntry[];
  text: string;
}

function fmtSigned(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

// 一行可审计文本（U-571 记号，Q34 分系统骰面）：如斗法「1d20[5~30]
// 掷出 17 + 战力 0 = 17 vs 难度 12」、突破「1d100[1~120] 掷出 87
// + 神识 23 = 110 vs 难度 100」。多组骰子时逐颗列出。
// U-572 双掷时两颗都列出并写清取舍，如优势「2d20[5~30]L 掷出
// 17、29（优势：舍弃低的 17，取高的 29） + 战力 0 = 29 vs 难度 12」。
export function formatCheckText(
  expression: string, rolls: number[], attrLabel: string, bonus: number, total: number, dc: number,
  dropInfo?: { mode: RollMode; keptRolls: number[]; droppedRolls: number[] } | null,
): string {
  const dicePart = rolls.length > 1 ? rolls.join("、") : `${rolls[0] ?? 0}`;
  const bonusPart = bonus >= 0 ? `+ ${attrLabel} ${bonus}` : `− ${attrLabel} ${Math.abs(bonus)}`;
  const head = expression.split("+")[0]?.trim() ?? expression;
  if (dropInfo && dropInfo.mode !== "normal" && dropInfo.droppedRolls.length > 0) {
    const kept = dropInfo.keptRolls[0] ?? 0;
    const dropped = dropInfo.droppedRolls[0] ?? 0;
    const modeText = dropInfo.mode === "advantage"
      ? `优势：舍弃低的 ${dropped}，取高的 ${kept}`
      : `劣势：舍弃高的 ${dropped}，取低的 ${kept}`;
    return `${head} 掷出 ${dicePart}（${modeText}） ${bonusPart} = ${total} vs 难度 ${dc}`;
  }
  return `${head} 掷出 ${dicePart} ${bonusPart} = ${total} vs 难度 ${dc}`;
}

// 校验一份结构化明细的完整性与自洽性；任一项不满足即抛错。
export function assertCheckDetail(d: CheckDetail): void {
  const bad = (why: string) => new Error(`dice: invalid check detail: ${why}`);
  if (!d || typeof d !== "object") throw bad("not an object");
  if (typeof d.expression !== "string" || d.expression.trim().length === 0) throw bad("missing expression");
  if (!Array.isArray(d.rolls) || d.rolls.length === 0) throw bad("missing per-die rolls");
  for (const r of d.rolls) if (!Number.isInteger(r) || r < 1) throw bad(`invalid die roll ${r}`);
  // U-572：keptRolls + droppedRolls 必须恰好拼回 rolls（多重集合相等），
  // diceTotal 只算保留下来的；普通判定 droppedRolls 为空、rollMode 为
  // normal；双掷时保留/舍弃的大小关系必须与优势/劣势语义相符。
  if (d.rollMode !== "normal" && d.rollMode !== "advantage" && d.rollMode !== "disadvantage") throw bad(`invalid rollMode ${String(d.rollMode)}`);
  if (!Array.isArray(d.keptRolls) || d.keptRolls.length === 0 || !Array.isArray(d.droppedRolls)) throw bad("missing kept/dropped rolls");
  const sortedJoin = (a: number[]) => [...a].sort((x, y) => x - y).join(",");
  if (sortedJoin([...d.keptRolls, ...d.droppedRolls]) !== sortedJoin(d.rolls)) throw bad("kept + dropped does not match rolls");
  if ((d.droppedRolls.length === 0) !== (d.rollMode === "normal")) throw bad("rollMode inconsistent with dropped rolls");
  if (d.rollMode === "advantage" && Math.min(...d.keptRolls) < Math.max(...d.droppedRolls)) throw bad("advantage kept a lower die");
  if (d.rollMode === "disadvantage" && Math.max(...d.keptRolls) > Math.min(...d.droppedRolls)) throw bad("disadvantage kept a higher die");
  // Q34：带动态范围字段时，每颗骰值必须落在 [diceLo, diceHi] 内。
  if (d.diceLo !== undefined || d.diceHi !== undefined) {
    if (!Number.isInteger(d.diceLo) || !Number.isInteger(d.diceHi) || (d.diceLo ?? 0) < 1 || (d.diceHi ?? 0) < (d.diceLo ?? 0)) throw bad("invalid dynamic dice range");
    for (const r of d.rolls) if (r < (d.diceLo ?? 0) || r > (d.diceHi ?? 0)) throw bad(`die roll ${r} outside dynamic range [${d.diceLo}, ${d.diceHi}]`);
    if (d.scaledMargin !== undefined && !Number.isInteger(d.scaledMargin)) throw bad("scaledMargin must be an integer");
  }
  if (d.diceTotal !== d.keptRolls.reduce((a, b) => a + b, 0)) throw bad("diceTotal does not match kept rolls");
  if (!Array.isArray(d.bonusParts)) throw bad("missing bonusParts");
  for (const p of d.bonusParts) {
    if (!p || typeof p.label !== "string" || p.label.trim().length === 0 || !Number.isFinite(p.value)) throw bad("invalid bonus part");
  }
  if (d.bonus !== d.bonusParts.reduce((a, p) => a + p.value, 0)) throw bad("bonus does not match bonusParts");
  if (!Number.isInteger(d.baseDc) || !Number.isInteger(d.dc)) throw bad("dc must be integers");
  if (d.total !== d.diceTotal + d.bonus) throw bad("total does not match diceTotal + bonus");
  if (d.margin !== d.total - d.dc) throw bad("margin does not match total - dc");
  if (typeof d.success !== "boolean") throw bad("success must be boolean");
  if (d.grade !== (d.success ? "success" : "failure")) throw bad("grade does not match success");
  if (!Array.isArray(d.modifierTrace)) throw bad("missing modifierTrace");
  for (const t of d.modifierTrace) {
    if (!t || typeof t.name !== "string" || t.name.trim().length === 0) throw bad("trace entry missing name");
    if (t.dcDelta !== t.dcAfter - t.dcBefore || t.bonusDelta !== t.bonusAfter - t.bonusBefore) throw bad(`trace entry "${t.name}" deltas inconsistent`);
  }
  if (typeof d.text !== "string" || d.text.trim().length === 0) throw bad("missing audit text");
}

// 由求值结果与判定上下文组装结构化明细（组装后立即自校验）。
export function buildCheckDetail(input: {
  expression: string;
  groups: DiceGroupResult[];
  attrLabel: string;
  bonusParts: BonusPart[];
  baseDc: number;
  dc: number;
  success: boolean;
  modifierTrace: ModifierTraceEntry[];
  // Q34：所属系统与归一化胜势差（动态范围由第一组骰子的 rangeLo/
  // rangeHi 推出，无范围时回退到 [1, 基础骰面]）。
  system?: string;
  scaledMargin?: number;
}): CheckDetail {
  if (!Array.isArray(input.groups) || input.groups.length === 0) throw new Error("dice: check produced no dice group");
  const first = input.groups[0];
  const rolls = input.groups.flatMap((g) => g.rolls);
  // U-572：保留/舍弃按组取（普通组无 keptRolls 字段，保留即全部）。
  const keptRolls = input.groups.flatMap((g) => g.keptRolls ?? g.rolls);
  const droppedRolls = input.groups.flatMap((g) => g.droppedRolls ?? []);
  const rollMode = rollModeOfGroups(input.groups);
  const diceTotal = keptRolls.reduce((a, b) => a + b, 0);
  const bonus = input.bonusParts.reduce((a, p) => a + p.value, 0);
  const total = diceTotal + bonus;
  const detail: CheckDetail = {
    expression: input.expression,
    ...(input.system !== undefined ? { system: input.system } : {}),
    ...(first ? { diceBase: first.sides, diceLo: first.rangeLo ?? 1, diceHi: first.rangeHi ?? first.sides } : {}),
    ...(input.scaledMargin !== undefined ? { scaledMargin: input.scaledMargin } : {}),
    rollMode,
    rolls,
    keptRolls,
    droppedRolls,
    diceTotal,
    attrLabel: input.attrLabel,
    bonusParts: input.bonusParts,
    bonus,
    baseDc: input.baseDc,
    dc: input.dc,
    total,
    margin: total - input.dc,
    success: input.success,
    grade: input.success ? "success" : "failure",
    modifierTrace: input.modifierTrace,
    text: formatCheckText(input.expression, rolls, input.attrLabel, bonus, total, input.dc,
      rollMode === "normal" ? null : { mode: rollMode, keptRolls, droppedRolls }),
  };
  assertCheckDetail(detail);
  return detail;
}

// modifier 生效过程的一行说明（只列真有改动的环节），供编年史与
// 游戏盘共用，如「突破保底：难度 118 → 113（−5）」。
export function formatModifierTrace(trace: ModifierTraceEntry[]): string {
  const parts: string[] = [];
  for (const t of trace) {
    const changes: string[] = [];
    if (t.dcDelta !== 0) changes.push(`难度 ${t.dcBefore} → ${t.dcAfter}（${fmtSigned(t.dcDelta)}）`);
    if (t.bonusDelta !== 0) changes.push(`修正 ${t.bonusBefore} → ${t.bonusAfter}（${fmtSigned(t.bonusDelta)}）`);
    if (changes.length > 0) parts.push(`${t.label}：${changes.join("，")}`);
  }
  return parts.join("；");
}

export function breakthroughPityModifier(holder: { breakFails: number }): CheckModifier {
  breakthroughPityReduction(holder.breakFails); // 构造时即校验状态合法，非法抛错
  return {
    name: "breakthrough-pity",
    label: "突破保底",
    beforeRoll(ctx) { ctx.dc -= breakthroughPityReduction(holder.breakFails); },
    afterRoll(ctx) { holder.breakFails = ctx.success ? 0 : holder.breakFails + 1; },
  };
}
