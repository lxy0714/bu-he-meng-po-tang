// 轮回修仙跑团 — U-573 种子化随机（PRNG）：字符串种子 → 确定性序列。
// 来源：C-13《davidbau/seedrandom》、C-14《ironarachne/rng》、C-9《dfabulich/choicescript》
// （三者规则相同点：字符串种子生成确定性伪随机序列，同一存档、同一操作
// 重放得到同一结果）。
//
// 设计要点（照计划 U-573 做法）：
// - 种子是可读字符串：「存档ID + 世数 + 事件类型 + 序号」，见 makeSeed。
// - 局部实例而非全局替换：绝不覆盖 Math.random；每次判定都
//   new SeededRng(seed) 生成一个独立实例，避免并发请求互相污染随机流。
// - 日常判定用 ARC4（RC4）流：以种子字节做 KSA 调度，丢弃前 256 字节
//   （ARC4-drop，去初始偏差），之后每 4 字节合成一个 [0,1) 小数。
// - 接口照 C-14 的方法集：int(min, max) 闭区间整数（正好掷 1d150）、
//   chance(p) 概率判定、item(array) 随机取一、shuffle(array) 洗牌。
// - 只改随机实现，不改任何概率数值：所有调用点的概率/区间与改前一致。
//
// U-575 权重表抽取（本文件下半部分）：照 C-14 的 weighted() API，统一的
// 加权抽取 weighted(rng, table)，table 为 { value, commonality }[]。
// 存量各池（事件/遗藏/奖励/候选）均无显式权重字段，一律按 commonality: 1
// 等权接入，概率与改前逐项相同；校验非法即抛错，不静默兜底。

// 把可读种子拼成字符串：save:1|life:2|op:check:sense|seq:42
export function makeSeed(saveId: number, lifeNo: number, opType: string, seq: number): string {
  return `save:${saveId}|life:${lifeNo}|op:${opType}|seq:${seq}`;
}

// ---------- U-574 PRNG 状态保存与恢复（照 C-13 的 { state: true }） ----------
// seedrandom 的 { state: true } 选项让实例能导出内部状态、之后原样
// 恢复续掷。本类的内部状态就是 ARC4 的 S 盒（256 字节置换）加 i/j
// 两个下标：state() 导出一份深拷贝；构造时传 { state } 选项、或用
// SeededRng.fromState(state)，即按该状态原样恢复——恢复后的实例从
// 导出点继续同一条随机流，与不中断直达逐值一致。状态形状非法
// （S 盒不是 0–255 的全排列、i/j 越界或非整数等）一律抛错，不静默
// 兜底（与本文件 weighted/bellFloat 的校验口径一致）。
export interface SeededRngState { s: number[]; i: number; j: number }

export function assertSeededRngState(state: unknown): asserts state is SeededRngState {
  const fail = (why: string): never => { throw new Error(`SeededRng state: ${why}`); };
  if (!state || typeof state !== "object") fail("not an object");
  const st = state as { s?: unknown; i?: unknown; j?: unknown };
  if (!Array.isArray(st.s) || st.s.length !== 256) fail("s must be an array of 256 bytes");
  const seen = new Uint8Array(256);
  for (const b of st.s as unknown[]) {
    if (!Number.isInteger(b) || (b as number) < 0 || (b as number) > 255) fail("s entries must be integers in [0, 255]");
    if (seen[b as number]) fail("s must be a permutation of 0..255");
    seen[b as number] = 1;
  }
  if (!Number.isInteger(st.i) || (st.i as number) < 0 || (st.i as number) > 255) fail("i must be an integer in [0, 255]");
  if (!Number.isInteger(st.j) || (st.j as number) < 0 || (st.j as number) > 255) fail("j must be an integer in [0, 255]");
}

export class SeededRng {
  private s: Uint8Array;
  private i = 0;
  private j = 0;

  constructor(seed: string, options?: { state?: SeededRngState }) {
    // U-574：传了 { state } 即原样恢复该内部状态续掷（照 C-13），
    // 不再走种子调度——恢复后的流只由状态决定，与导出点逐值衔接。
    if (options?.state !== undefined) {
      assertSeededRngState(options.state);
      this.s = Uint8Array.from(options.state.s);
      this.i = options.state.i;
      this.j = options.state.j;
      return;
    }
    // 种子字节：UTF-8 编码；空种子退化为单字节 0，保证仍可调度。
    const key = new TextEncoder().encode(seed.length > 0 ? seed : "seed");
    const s = new Uint8Array(256);
    for (let k = 0; k < 256; k++) s[k] = k;
    let j = 0;
    for (let k = 0; k < 256; k++) {
      const sk = s[k] ?? 0;
      j = (j + sk + (key[k % key.length] ?? 0)) % 256;
      s[k] = s[j] ?? 0;
      s[j] = sk;
    }
    this.s = s;
    // ARC4-drop：丢弃前 256 个输出字节，避开 RC4 初始输出偏差。
    for (let k = 0; k < 256; k++) this.nextByte();
  }

  // U-574：导出内部状态（深拷贝——改导出对象不影响本实例），
  // 可 JSON 序列化后随存档落盘，日后原样恢复续掷。
  state(): SeededRngState {
    return { s: Array.from(this.s), i: this.i, j: this.j };
  }

  // U-574：从导出的内部状态原样恢复一个实例（照 C-13 的 { state } 恢复）。
  static fromState(state: SeededRngState): SeededRng {
    return new SeededRng("", { state });
  }

  private nextByte(): number {
    const s = this.s;
    this.i = (this.i + 1) % 256;
    const si = s[this.i] ?? 0;
    this.j = (this.j + si) % 256;
    const sj = s[this.j] ?? 0;
    s[this.i] = sj;
    s[this.j] = si;
    return s[(si + sj) % 256] ?? 0;
  }

  // [0, 1) 小数：4 个流字节合成一个 32 位无符号整数再归一化。
  next(): number {
    const b0 = this.nextByte();
    const b1 = this.nextByte();
    const b2 = this.nextByte();
    const b3 = this.nextByte();
    return (((b0 << 24) >>> 0) + (b1 << 16) + (b2 << 8) + b3) / 4294967296;
  }

  // 闭区间整数 [min, max]，正好用于掷 1d150（int(1, 150)）。
  int(min: number, max: number): number {
    if (max < min) throw new Error("SeededRng.int: empty range");
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  // 概率判定：以概率 p 返回 true（与旧写法 Math.random() < p 等价）。
  chance(p: number): boolean {
    return this.next() < p;
  }

  // 从数组随机取一个（C-14 的 item(array)）。
  item<T>(arr: readonly T[]): T {
    const v = arr[this.int(0, arr.length - 1)];
    if (v === undefined) throw new Error("SeededRng.item: empty pool");
    return v;
  }

  // Fisher-Yates 洗牌，返回新数组（不改原数组）。
  shuffle<T>(arr: readonly T[]): T[] {
    const a = [...arr];
    for (let k = a.length - 1; k > 0; k--) {
      const j = this.int(0, k);
      const t = a[k]; a[k] = a[j] as T; a[j] = t as T;
    }
    return a;
  }
}

// ---------- U-575 权重表抽取：weighted(rng, table) ----------
// 借鉴 C-14《ironarachne/rng》的 weighted() API 设计与实现思路，本地实现，
// 不设为生产依赖。table 形如 [{ value: 'gold', commonality: 10 }, ...]，
// commonality 即权重：抽中概率正比于权重；commonality: 0 的项永不抽中，
// 可用来做条件锁定。抽取只用传入的种子化实例（rng.next()），不用
// Math.random；同一实例同一次抽取重放得同一结果。
//
// 校验（不静默兜底，非法即抛错；错误经动作层 withErrorLogging 记入
// 服务端报错记录）：空表、负权重、NaN、无穷大、总权重为零、commonality
// 缺失或非数字，全部抛错。
//
// 等权兼容性：表内权重全为 1 时，weighted 与 SeededRng.item() 消耗同样
// 多的随机数（一次 next()）、且同一 next() 值落到同一项——存量各池改走
// weighted 后，同一存档同一操作的重放结果与改前逐项一致。

export interface WeightedEntry<T> { value: T; commonality: number }

// 校验权重表并返回总权重；任何非法形状都抛错。
export function validateWeightedTable<T>(table: readonly WeightedEntry<T>[]): number {
  if (!Array.isArray(table) || table.length === 0) throw new Error("weighted: empty table");
  let total = 0;
  for (const entry of table) {
    const w = (entry as WeightedEntry<T> | null | undefined)?.commonality;
    if (typeof w !== "number" || !Number.isFinite(w) || w < 0) {
      throw new Error("weighted: invalid commonality (must be a finite, non-negative number)");
    }
    total += w;
  }
  if (!(total > 0)) throw new Error("weighted: total commonality is zero");
  return total;
}

// 加权抽取：按 commonality 比例从 table 中抽一项的 value。
export function weighted<T>(rng: SeededRng, table: readonly WeightedEntry<T>[]): T {
  const total = validateWeightedTable(table);
  let roll = rng.next() * total;
  let lastPositive: WeightedEntry<T> | undefined;
  for (const entry of table) {
    if (entry.commonality > 0) lastPositive = entry;
    roll -= entry.commonality;
    if (roll < 0) return entry.value;
  }
  // 浮点边界：roll 理论上必在表内落点；万一精度溢出表尾，回落到最后一个
  // 正权重项（0 权重项仍永不抽中）。
  if (lastPositive) return lastPositive.value;
  throw new Error("weighted: no drawable entry");
}

// 把无权重字段的等权池包成权重表（存量数据的统一接法，概率不变）。
export function uniformTable<T>(values: readonly T[]): WeightedEntry<T>[] {
  return values.map((value) => ({ value, commonality: 1 }));
}

// 把闭区间整数范围包成等权表：与 SeededRng.int(min, max) 同分布、同样
// 消耗一次 next()、同一 next() 值下结果相同（宗门差事奖励表用）。
export function rangeTable(min: number, max: number): WeightedEntry<number>[] {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) throw new Error("rangeTable: empty range");
  const out: WeightedEntry<number>[] = [];
  for (let v = min; v <= max; v++) out.push({ value: v, commonality: 1 });
  return out;
}

// ---------- U-576 不放回抽取 / 牌堆模型 ----------
// 借鉴 C-14《ironarachne/rng》的 randomSet/shuffle 与 C-15《icepool》的
// deck 思路（只借鉴 API 设计与实现思路，本地实现，不设为生产依赖）：
// - shuffle(rng, array)：Fisher-Yates 洗牌，返回新数组，不原地改原数组。
// - randomSet(rng, count, array)：不放回抽 count 个互不重复的项。
// - 牌堆 deck：先 shuffle 洗牌，再从牌堆顶（数组首）依次抽牌；抽空时
//   自动洗一副新牌堆继续，不抛错中断。
// 全部只用传入的 U-573 种子化实例（rng），不用 Math.random、不全局
// 替换；同种子同输入重放得同一结果。
// 校验（不静默兜底）：randomSet 的 count 非整数、count<0、count>池长、
// 空池，一律抛错（错误经动作层 withErrorLogging 记入服务端报错记录）。

// Fisher-Yates 洗牌：返回新数组，原数组不动。
export function shuffle<T>(rng: SeededRng, array: readonly T[]): T[] {
  return rng.shuffle(array);
}

// 不放回抽取：从 array 中抽 count 个互不重复的项（顺序即抽出顺序）。
export function randomSet<T>(rng: SeededRng, count: number, array: readonly T[]): T[] {
  if (!Array.isArray(array) || array.length === 0) throw new Error("randomSet: empty pool");
  if (!Number.isInteger(count) || count < 0) throw new Error("randomSet: invalid count (must be a non-negative integer)");
  if (count > array.length) throw new Error("randomSet: count exceeds pool size");
  if (count === 0) return [];
  // 全洗牌后取前 count 个：与旧 drawThree 的 shuffle+slice 消耗同样的
  // 随机流、同种子同结果，存量三选一的重放结果不变。
  return shuffle(rng, array).slice(0, count);
}

// 洗一副新牌堆：返回洗好的牌序数组（牌堆顶 = index 0）。空池抛错。
export function makeDeckCards<T>(rng: SeededRng, items: readonly T[]): T[] {
  if (!Array.isArray(items) || items.length === 0) throw new Error("deck: empty pool");
  return shuffle(rng, items);
}

// 从牌堆顶抽一张（原地修改 deck 数组）：deck 抽空时先用 rng 把 source
// 重新洗成一副新牌堆再抽，不抛错。source 为空才是真错误，抛错。
export function drawFromDeck<T>(rng: SeededRng, deck: T[], source: readonly T[]): T {
  if (!Array.isArray(source) || source.length === 0) throw new Error("deck: empty source pool");
  if (deck.length === 0) {
    const fresh = makeDeckCards(rng, source);
    deck.push(...fresh);
  }
  const card = deck.shift();
  if (card === undefined) throw new Error("deck: draw failed");
  return card;
}

// 牌堆类（C-15 deck 思路）：持有一副洗好的牌，依次 draw()；抽空自动
// 用构造时传入的 rng 洗新牌堆继续。游戏存档里只存牌序数组（见
// Character.eventDeck），跨存档的抽牌走上面的 makeDeckCards /
// drawFromDeck 加每次操作各自的 rngForNext 实例，道理相同。
export class Deck<T> {
  private readonly rng: SeededRng;
  private readonly source: readonly T[];
  private cards: T[];

  constructor(rng: SeededRng, items: readonly T[]) {
    this.rng = rng;
    this.source = items;
    this.cards = makeDeckCards(rng, items);
  }

  // 剩余牌数（0 时下一次 draw 会先自动洗新牌堆）。
  get remaining(): number { return this.cards.length; }

  draw(): T { return drawFromDeck(this.rng, this.cards, this.source); }

  // 立即弃掉余牌、洗一副新牌堆。
  reshuffle(): void { this.cards = makeDeckCards(this.rng, this.source); }
}

export function createDeck<T>(rng: SeededRng, items: readonly T[]): Deck<T> {
  return new Deck(rng, items);
}

// ---------- U-375 补做：加权不放回洗牌 weightedDeckCards ----------
// 事件稀有度权重（U-375 定夺补做，2026-11-14）：牌堆建堆改为按权重
// 不放回抽取——用与 weighted() 完全相同的选段算法（一次 rng.next()
// 累加选段、浮点边缘回落最后一个正权重项）从剩余池里反复抽，抽中
// 即移除，直到正权重项抽满。高权重项倾向排在牌堆前面、低权重项
// 倾向沉底；commonality: 0 的项永不抽中、永不入堆（剩余全为 0 权重
// 时停抽，不抛错——0 权重是合法的锁定语义，不是非法配置）。
// 校验与 weighted() 同口径：先整表过 validateWeightedTable（空表、
// 负权重、NaN、无穷大、缺失 commonality、总权重为零一律抛错）。
// 全程只用传入的种子化实例，同种子同表重放得同一牌序。
export function weightedDeckCards<T>(rng: SeededRng, table: readonly WeightedEntry<T>[]): T[] {
  validateWeightedTable(table);
  const remaining: WeightedEntry<T>[] = [...table];
  const out: T[] = [];
  while (remaining.length > 0) {
    let total = 0;
    for (const e of remaining) total += e.commonality;
    if (!(total > 0)) break; // 其余全是 0 权重：永不入堆，停抽。
    let roll = rng.next() * total;
    let idx = -1;
    let lastPositive = -1;
    for (let i = 0; i < remaining.length; i++) {
      const e = remaining[i];
      if (!e) continue;
      if (e.commonality > 0) lastPositive = i;
      roll -= e.commonality;
      if (roll < 0) { idx = i; break; }
    }
    if (idx < 0) idx = lastPositive; // 浮点边界回落（与 weighted() 一致）
    const picked = idx >= 0 ? remaining[idx] : undefined;
    if (!picked) throw new Error("weightedDeckCards: no drawable entry");
    out.push(picked.value);
    remaining.splice(idx, 1);
  }
  return out;
}

// ---------- U-577 正态分布波动：bellFloat(rng, min, max) ----------
// 借鉴 C-14《ironarachne/rng》的 bellFloat API（只借 API 设计与算法：
// 三个均匀随机求和近似正态分布，本地实现，不设为生产依赖）：
// bellFloat 返回 [min, max] 内的浮点数，取值集中在区间均值附近、
// 越靠近两端越罕见——用来替换「均匀随机」的好感波动，让好感变化
// 多为小步、极端跳变少。三个均匀随机全部取自传入的 U-573 种子化
// 实例（rng.next() ×3），同种子同输入重放得同一结果；不用
// Math.random、不全局替换。
// 只改波动的分布形状：取值范围 [min, max] 与均值都与均匀随机相同，
// 调用方原有的取值范围一字不变；需要整数的调用方自行 Math.round
// （min/max 为整数时 round 结果仍落在 [min, max] 内）。
// 校验（不静默兜底）：min/max 非有限数或 max < min 一律抛错（错误经
// 动作层 withErrorLogging 记入服务端报错记录）。

export function bellFloat(rng: SeededRng, min: number, max: number): number {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
    throw new Error("bellFloat: invalid range (min/max must be finite and max >= min)");
  }
  // 三个 [0,1) 均匀随机求和 /3 → 近似正态的 [0,1) 权重（均值 0.5）。
  const t = (rng.next() + rng.next() + rng.next()) / 3;
  return min + t * (max - min);
}
