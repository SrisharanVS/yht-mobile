// apps/mobile/src/db/client.ts
// SQLite database singleton for the mobile app.
// All order and menu state is persisted here — local-first operational store.

import * as SQLite from "expo-sqlite";

let db: SQLite.SQLiteDatabase | null = null;

/**
 * Get the shared SQLite database instance.
 * Opens the database on first call, reuses on subsequent calls.
 */
export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync("yht_kitchen.db");
  }
  return db;
}
