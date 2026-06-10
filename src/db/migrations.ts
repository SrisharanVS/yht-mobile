// apps/mobile/src/db/migrations.ts
// Creates all SQLite tables on first launch.
// Uses CREATE TABLE IF NOT EXISTS — safe to re-run on every app start.

import { getDb } from "./client";

export function runMigrations(): void {
  const db = getDb();

  db.execSync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    -- Active, pending, and completed orders
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number INTEGER NOT NULL,
      device_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING_ACCEPTANCE',
      type TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      accepted_at TEXT,
      completed_at TEXT,
      expires_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
    CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders (order_number);
    CREATE INDEX IF NOT EXISTS idx_orders_expires_at ON orders (expires_at);

    -- Individual line items for each order
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      dish_id TEXT NOT NULL,
      dish_name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      completed INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_completed ON order_items (completed);

    -- Local menu cache (synced from web API via Ably menu:updated events)
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category_id TEXT NOT NULL,
      price REAL NOT NULL,
      dining_available INTEGER NOT NULL DEFAULT 1,
      takeaway_available INTEGER NOT NULL DEFAULT 1,
      image_url TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_menu_items_category_id ON menu_items (category_id);
    CREATE INDEX IF NOT EXISTS idx_menu_items_active ON menu_items (active);

    -- Key-value store for app settings (WEB_API_URL, auth_token, etc.)
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}
