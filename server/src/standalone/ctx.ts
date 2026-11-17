// 独立版 Ctx：动作 handler 的宿主上下文最小实现。
//
// - db 访问器把 drizzle 实例按 schema 类型交回（运行时就是同一个
//   实例，泛型只在类型层存在，与 SDK 的 SpaceDbAccessor 同口径）。
// - invalidateQueries 在托管版用于通知其他打开的客户端刷新查询；
//   单机版同一时刻只有一个页面、动作返回值即最新数据，故为空操作。

import type { Ctx, SpaceDb } from "../platform";
import type { StandaloneDb } from "./db";

export function createStandaloneCtx(db: StandaloneDb): Ctx {
  return {
    slug: "bu-he-meng-po-tang",
    db: <TSchema extends Record<string, unknown> = Record<string, never>>() =>
      db as unknown as SpaceDb<TSchema>,
    invalidateQueries() {
      /* 单机版无其他客户端需要通知，空操作。 */
    },
  };
}
