// apps/mobile/src/db/settings.ts
// Key-value store for persistent app settings (stored in SQLite settings table).

import { getDb } from "./client";

export function getSetting(key: string): string | null {
  const db = getDb();
  const row = db.getFirstSync<{ value: string }>(
    "SELECT value FROM settings WHERE key = ?",
    [key]
  );
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  db.runSync(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
    [key, value]
  );
}

export function deleteSetting(key: string): void {
  const db = getDb();
  db.runSync("DELETE FROM settings WHERE key = ?", [key]);
}
