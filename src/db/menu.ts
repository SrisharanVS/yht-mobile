// apps/mobile/src/db/menu.ts
// SQLite CRUD helpers for the local menu cache (categories + menu_items).
// The mobile app caches menu data locally so the admin screen works offline
// and the dashboard has dish names without network calls.

import { getDb } from "./client";
import type { Category, Dish } from "@yht/shared";

// ── Reads ──────────────────────────────────────────────────────────────────────

export function getCategories(): Category[] {
  const db = getDb();
  const rows = db.getAllSync<{
    id: string;
    name: string;
    sort_order: number;
    active: number;
  }>("SELECT * FROM categories WHERE active = 1 ORDER BY sort_order ASC");

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sortOrder: r.sort_order,
    active: r.active === 1,
    createdAt: "",
  }));
}

export function getMenuItems(includeHidden = false): Dish[] {
  const db = getDb();
  const whereClause = includeHidden ? "" : "WHERE m.active = 1";

  const rows = db.getAllSync<{
    id: string;
    name: string;
    category_id: string;
    category_name: string;
    price: number;
    dining_available: number;
    takeaway_available: number;
    image_url: string | null;
    active: number;
    sort_order: number;
  }>(
    `SELECT m.*, c.name as category_name
     FROM menu_items m
     LEFT JOIN categories c ON c.id = m.category_id
     ${whereClause}
     ORDER BY m.sort_order ASC`
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    categoryId: r.category_id,
    category: r.category_name
      ? { id: r.category_id, name: r.category_name, sortOrder: 0, active: true, createdAt: "" }
      : undefined,
    price: r.price,
    diningAvailable: r.dining_available === 1,
    takeawayAvailable: r.takeaway_available === 1,
    imageUrl: r.image_url,
    active: r.active === 1,
    sortOrder: r.sort_order,
    createdAt: "",
    updatedAt: "",
  }));
}

// ── Writes (bulk sync from web API) ───────────────────────────────────────────

/**
 * Replace entire local menu cache with fresh data from web API.
 * Called on startup and when menu:updated Ably event is received.
 */
export function syncMenuFromApi(categories: Category[], dishes: Dish[]): void {
  const db = getDb();

  db.withTransactionSync(() => {
    // Clear and repopulate categories
    db.runSync("DELETE FROM categories");
    for (const cat of categories) {
      db.runSync(
        `INSERT INTO categories (id, name, sort_order, active) VALUES (?, ?, ?, ?)`,
        [cat.id, cat.name, cat.sortOrder, cat.active ? 1 : 0]
      );
    }

    // Clear and repopulate menu items
    db.runSync("DELETE FROM menu_items");
    for (const dish of dishes) {
      db.runSync(
        `INSERT INTO menu_items
           (id, name, category_id, price, dining_available, takeaway_available, image_url, active, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          dish.id,
          dish.name,
          dish.categoryId,
          dish.price,
          dish.diningAvailable ? 1 : 0,
          dish.takeawayAvailable ? 1 : 0,
          dish.imageUrl ?? null,
          dish.active ? 1 : 0,
          dish.sortOrder,
        ]
      );
    }
  });
}

/**
 * Get dish name by ID from local cache (for denormalized order_items).
 */
export function getDishName(dishId: string): string {
  const db = getDb();
  const row = db.getFirstSync<{ name: string }>(
    "SELECT name FROM menu_items WHERE id = ?",
    [dishId]
  );
  return row?.name ?? "Unknown";
}
