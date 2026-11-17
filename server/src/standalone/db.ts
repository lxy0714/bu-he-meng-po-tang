// 独立版数据库：bun:sqlite + drizzle-orm/bun-sqlite。
//
// 表形与托管版 schema.ts 的 saves 表逐字一致（id / payload /
// updated_at），且 updated_at 与托管版 libsql 驱动一样以毫秒整数
// 落盘——从托管版导出的数据库文件可以直接拿来续档（反之亦然）。
// 数据库文件默认 ./data/game.db，可用环境变量 GAME_DB_PATH 覆盖
// （验收与测试用 :memory: 或临时文件，不碰真实存档）。

import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "../schema";

export type StandaloneDb = ReturnType<typeof createStandaloneDb>;

export function createStandaloneDb(dbPath: string) {
  if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath, { create: true });
  sqlite.exec("PRAGMA journal_mode = WAL;");
  // 与 drizzle/0002_game_save_slot.sql 等价的建表（独立版不走平台
  // 迁移通道，首次启动时自建；IF NOT EXISTS 保证幂等）。
  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS saves (
      id integer PRIMARY KEY,
      payload text NOT NULL,
      updated_at integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
    );`,
  );
  return drizzle(sqlite, { schema });
}
