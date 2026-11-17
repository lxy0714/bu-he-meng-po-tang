// Drizzle schema for this space: a single save slot holding the whole game
// state (character, past lives, chronicle, design-tree settings) as JSON.

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const saves = sqliteTable("saves", {
  id: integer("id").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
