// 轮回修仙跑团 — 存档存储抽象层（U-596）。
//
// 接口设计借鉴 C-24 的 .plans/save-load.md 核心设计（只借鉴接口设计；
// C-24 的 SaveStorage 实现是否已落地未在其 README 中确认，不当作成熟
// 实现引用）：四个方法 write/read/list/remove，全部返回 Promise——
// 即使某个实现底层是同步的（如将来的 localStorage 实现），上层也只
// 面对异步契约，日后换成 fetch 后端实现（createHttpSaveStorage(
// baseUrl, authToken)）时上层一行不改。
//
// 存储层只收发「已 JSON 序列化好的存档字符串」：data 是不透明的
// 字符串，存储层不解析、不碰游戏数据结构——序列化、旧存档迁移与
// 校验都在上层（state.ts 的 GameState、errors.ts 的 ErrorStore）。
//
// 今天唯一的实现是服务端的 Drizzle 实现（createDbSaveStorage）：
// 沿用既有 saves 表（一行一个槽位，payload 存整段字符串），槽位名
// 与行 id 的对应在此一处登记——游戏存档 "game" → id=1（state.ts
// 种子用的 SAVE_ID=1 与此一致，不要改）、报错记录 "error-logs"
// → id=2。U-597 多存档槽落地时在这里扩展映射（或届时加迁移），
// 上层仍只认槽位名。
//
// 未登记的槽位名：read 返回 null、remove 为空操作、list 不包含它；
// write 抛错——没有行 id 就无法落盘，静默丢弃存档比报错更糟。
// U-598 存档字段注册表建在本层之上（savefields.ts：字段登记在
// 上层，存储仍只见字符串）。

import type { Ctx } from "./platform";
import { eq } from "drizzle-orm";
import * as schema from "./schema";

export interface SaveStorage {
  /** 写入一个槽位的完整存档字符串（覆盖写）。 */
  write(slot: string, data: string): Promise<void>;
  /** 读取一个槽位的存档字符串；槽位不存在（或未登记）返回 null。 */
  read(slot: string): Promise<string | null>;
  /** 列出当前有数据的槽位名，按登记顺序。 */
  list(): Promise<string[]>;
  /** 删除一个槽位；槽位不存在（或未登记）时为空操作。 */
  remove(slot: string): Promise<void>;
}

/** 游戏存档槽位（saves 表 id=1）。 */
export const GAME_SLOT = "game";
/** 报错记录槽位（saves 表 id=2），与游戏存档互不覆盖。 */
export const ERROR_LOG_SLOT = "error-logs";

// 槽位名 → saves 表行 id。本层的唯一登记处；顺序即 list() 的顺序。
const SLOT_ROW_IDS: ReadonlyArray<readonly [slot: string, rowId: number]> = [
  [GAME_SLOT, 1],
  [ERROR_LOG_SLOT, 2],
];

function rowIdFor(slot: string): number | null {
  for (const [name, rowId] of SLOT_ROW_IDS) if (name === slot) return rowId;
  return null;
}
function slotForRowId(rowId: number): string | null {
  for (const [name, id] of SLOT_ROW_IDS) if (id === rowId) return name;
  return null;
}

/**
 * 服务端实现：saves 表一行一个槽位。读写删的 SQL 形态与抽象层引入
 * 前逐字一致——先 select 全表按 id 找行，写入时有行走 update（带
 * where 限定本行 + 更新 updatedAt）、无行走 insert，payload 原样
 * 存取，不做任何解析。
 */
export function createDbSaveStorage(ctx: Ctx): SaveStorage {
  const db = () => ctx.db<typeof schema>();
  return {
    async write(slot: string, data: string): Promise<void> {
      const rowId = rowIdFor(slot);
      if (rowId === null) throw new Error(`save-storage: 未登记的存档槽位「${slot}」，无法写入`);
      const rows = await db().select().from(schema.saves);
      if (rows.find((r) => r.id === rowId)) {
        // 必须限定本行 id：无 where 的 update 会把其他槽位一起覆盖。
        await db().update(schema.saves).set({ payload: data, updatedAt: new Date() }).where(eq(schema.saves.id, rowId));
      } else {
        await db().insert(schema.saves).values({ id: rowId, payload: data });
      }
    },
    async read(slot: string): Promise<string | null> {
      const rowId = rowIdFor(slot);
      if (rowId === null) return null;
      const rows = await db().select().from(schema.saves);
      return rows.find((r) => r.id === rowId)?.payload ?? null;
    },
    async list(): Promise<string[]> {
      const rows = await db().select().from(schema.saves);
      const present = new Set(rows.map((r) => r.id));
      return SLOT_ROW_IDS.filter(([, rowId]) => present.has(rowId)).map(([slot]) => slot);
    },
    async remove(slot: string): Promise<void> {
      const rowId = rowIdFor(slot);
      if (rowId === null) return;
      await db().delete(schema.saves).where(eq(schema.saves.id, rowId));
    },
  };
}

/** 上层取存储的统一入口：将来的本地缓存/HTTP 实现在此替换，上层不改。 */
export function saveStorageFor(ctx: Ctx): SaveStorage {
  // 独立版：ctx.db 已由 standalone/ctx.ts 接到本地 bun:sqlite 的
  // drizzle 实例，createDbSaveStorage 的 SQL 形态原样适用——这正是
  // 当初留 SaveStorage 抽象的目的：换宿主只换 ctx，上层一行不改。
  return createDbSaveStorage(ctx);
}

// 供上层与校验脚本使用的纯函数：槽位登记表自检（行 id 不重复、
// 槽位名不重复、行 id 为正整数）。模块加载即跑，登记写错立刻抛错，
// 不等到某次存档读写才暴露。
export function assertSlotRegistry(): void {
  const seenSlots = new Set<string>();
  const seenIds = new Set<number>();
  for (const [slot, rowId] of SLOT_ROW_IDS) {
    if (!slot) throw new Error("save-storage: 槽位名为空");
    if (seenSlots.has(slot)) throw new Error(`save-storage: 槽位名重复「${slot}」`);
    if (!Number.isInteger(rowId) || rowId <= 0) throw new Error(`save-storage: 槽位「${slot}」的行 id 非法`);
    if (seenIds.has(rowId)) throw new Error(`save-storage: 行 id ${rowId} 被多个槽位共用`);
    seenSlots.add(slot);
    seenIds.add(rowId);
    if (slotForRowId(rowId) !== slot || rowIdFor(slot) !== rowId) {
      throw new Error(`save-storage: 槽位「${slot}」的双向映射不一致`);
    }
  }
}
assertSlotRegistry();
