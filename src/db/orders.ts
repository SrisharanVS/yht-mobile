// apps/mobile/src/db/orders.ts
// SQLite CRUD helpers for orders and order_items tables.
// All vendor operations go through these — no cloud roundtrips required.

import { getDb } from "./client";
import type { LocalOrder, LocalOrderItem, Order, OrderStatus } from "@yht/shared";

// ── Reads ──────────────────────────────────────────────────────────────────────

/**
 * Get all non-expired orders that the dashboard needs to display.
 * Includes PENDING_ACCEPTANCE, ACTIVE, PARTIALLY_COMPLETED.
 */
export function getActiveOrders(): { order: LocalOrder; items: LocalOrderItem[] }[] {
  const db = getDb();

  const orders = db.getAllSync<LocalOrder>(
    `SELECT * FROM orders
     WHERE status IN ('PENDING_ACCEPTANCE', 'ACTIVE', 'PARTIALLY_COMPLETED')
     ORDER BY created_at ASC`
  );

  return orders.map((order) => ({
    order,
    items: getOrderItems(order.id),
  }));
}

/**
 * Get all orders for the dashboard (active + recently completed).
 */
export function getAllDashboardOrders(): { order: LocalOrder; items: LocalOrderItem[] }[] {
  const db = getDb();

  // Include completed orders from the last hour for fade-out animation
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const orders = db.getAllSync<LocalOrder>(
    `SELECT * FROM orders
     WHERE status IN ('PENDING_ACCEPTANCE', 'ACTIVE', 'PARTIALLY_COMPLETED')
        OR (status = 'COMPLETED' AND completed_at > ?)
     ORDER BY created_at ASC`,
    [cutoff]
  );

  return orders.map((order) => ({
    order,
    items: getOrderItems(order.id),
  }));
}

export function getOrderItems(orderId: string): LocalOrderItem[] {
  const db = getDb();
  return db.getAllSync<LocalOrderItem>(
    "SELECT * FROM order_items WHERE order_id = ? ORDER BY rowid ASC",
    [orderId]
  );
}

/**
 * Get order numbers active in the last 15-minute window (for collision check).
 */
export function getActiveOrderNumbers(windowMs: number): Set<number> {
  const db = getDb();
  const windowStart = new Date(Date.now() - windowMs).toISOString();

  const rows = db.getAllSync<{ order_number: number }>(
    `SELECT order_number FROM orders
     WHERE created_at >= ? AND status NOT IN ('EXPIRED', 'REJECTED', 'COMPLETED')`,
    [windowStart]
  );

  return new Set(rows.map((r) => r.order_number));
}

// ── Writes ─────────────────────────────────────────────────────────────────────

/**
 * Insert an order received from Ably (order:new event).
 * Idempotent — silently ignores duplicate IDs.
 */
export function insertOrder(order: Order): void {
  const db = getDb();

  db.withTransactionSync(() => {
    db.runSync(
      `INSERT OR IGNORE INTO orders
         (id, order_number, device_id, status, type, notes, created_at, accepted_at, completed_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        order.id,
        order.orderNumber,
        order.deviceId,
        order.status,
        order.type,
        order.notes ?? null,
        order.createdAt,
        order.acceptedAt ?? null,
        order.completedAt ?? null,
        order.expiresAt,
      ]
    );

    for (const item of order.items) {
      db.runSync(
        `INSERT OR IGNORE INTO order_items
           (id, order_id, dish_id, dish_name, quantity, completed, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id,
          order.id,
          item.dishId,
          item.dishName ?? item.dish?.name ?? "Unknown",
          item.quantity,
          item.completed ? 1 : 0,
          item.completedAt ?? null,
        ]
      );
    }
  });
}

/**
 * Accept a pending order — transitions PENDING_ACCEPTANCE → ACTIVE.
 * Returns true if the order was found and updated.
 */
export function acceptOrder(orderNumber: number): LocalOrder | null {
  const db = getDb();

  const now = new Date().toISOString();
  const expiryCheck = new Date().toISOString();

  const order = db.getFirstSync<LocalOrder>(
    `SELECT * FROM orders
     WHERE order_number = ? AND status = 'PENDING_ACCEPTANCE' AND expires_at > ?`,
    [orderNumber, expiryCheck]
  );

  if (!order) return null;

  db.runSync(
    `UPDATE orders SET status = 'ACTIVE', accepted_at = ? WHERE id = ?`,
    [now, order.id]
  );

  return db.getFirstSync<LocalOrder>("SELECT * FROM orders WHERE id = ?", [order.id]);
}

/**
 * Toggle an order item's completed state.
 * Automatically updates the parent order status.
 * Returns the updated order.
 */
export function toggleOrderItem(
  itemId: string,
  completed: boolean
): { order: LocalOrder; items: LocalOrderItem[]; newStatus: OrderStatus } | null {
  const db = getDb();

  const now = completed ? new Date().toISOString() : null;

  db.runSync(
    `UPDATE order_items SET completed = ?, completed_at = ? WHERE id = ?`,
    [completed ? 1 : 0, now, itemId]
  );

  const item = db.getFirstSync<LocalOrderItem>(
    "SELECT * FROM order_items WHERE id = ?",
    [itemId]
  );

  if (!item) return null;

  const allItems = db.getAllSync<LocalOrderItem>(
    "SELECT * FROM order_items WHERE order_id = ?",
    [item.order_id]
  );

  const allCompleted = allItems.every((i) => i.completed === 1);
  const anyCompleted = allItems.some((i) => i.completed === 1);

  let newStatus: OrderStatus = "ACTIVE";
  if (allCompleted) newStatus = "COMPLETED";
  else if (anyCompleted) newStatus = "PARTIALLY_COMPLETED";

  const completedAt = allCompleted ? new Date().toISOString() : null;

  db.runSync(
    `UPDATE orders SET status = ?, completed_at = ? WHERE id = ?`,
    [newStatus, completedAt, item.order_id]
  );

  const updatedOrder = db.getFirstSync<LocalOrder>(
    "SELECT * FROM orders WHERE id = ?",
    [item.order_id]
  )!;

  return { order: updatedOrder, items: allItems, newStatus };
}

/**
 * Force-complete an entire order, marking all its items as completed.
 * Returns the updated order and its items.
 */
export function completeOrder(
  orderId: string
): { order: LocalOrder; items: LocalOrderItem[]; newStatus: OrderStatus } | null {
  const db = getDb();
  const now = new Date().toISOString();

  // Update all items of this order to completed = 1
  db.runSync(
    `UPDATE order_items SET completed = 1, completed_at = ? WHERE order_id = ?`,
    [now, orderId]
  );

  // Update order status to COMPLETED
  db.runSync(
    `UPDATE orders SET status = 'COMPLETED', completed_at = ? WHERE id = ?`,
    [now, orderId]
  );

  const updatedOrder = db.getFirstSync<LocalOrder>(
    "SELECT * FROM orders WHERE id = ?",
    [orderId]
  );

  if (!updatedOrder) return null;

  const allItems = db.getAllSync<LocalOrderItem>(
    "SELECT * FROM order_items WHERE order_id = ?",
    [orderId]
  );

  return { order: updatedOrder, items: allItems, newStatus: "COMPLETED" };
}


/**
 * Expire all PENDING_ACCEPTANCE orders that have passed their TTL.
 * Called by the dashboard on a 30-second interval.
 */
export function expireStaleOrders(): string[] {
  const db = getDb();
  const now = new Date().toISOString();

  const stale = db.getAllSync<{ id: string }>(
    "SELECT id FROM orders WHERE status = 'PENDING_ACCEPTANCE' AND expires_at < ?",
    [now]
  );

  if (stale.length === 0) return [];

  const ids = stale.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");

  db.runSync(
    `UPDATE orders SET status = 'EXPIRED' WHERE id IN (${placeholders})`,
    ids
  );

  return ids;
}

/**
 * Find all active/partially completed order items matching a dish name and type,
 * sorted by order creation time (ASC) for FIFO resolution.
 */
export function getUncompletedItemsForDish(
  dishName: string,
  type: string
): { id: string; order_id: string; quantity: number }[] {
  const db = getDb();
  return db.getAllSync<{ id: string; order_id: string; quantity: number }>(
    `SELECT
       oi.id,
       oi.order_id,
       oi.quantity
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.status IN ('ACTIVE', 'PARTIALLY_COMPLETED')
       AND oi.completed = 0
       AND oi.dish_name = ?
       AND o.type = ?
     ORDER BY o.created_at ASC`,
    [dishName, type]
  );
}

/**
 * Compute cumulative item counts for active preparation.
 * Pure SQLite aggregation — instant, no network.
 */
export function computeCumulativeCounts(): {
  dishId: string;
  dishName: string;
  diningCount: number;
  takeawayCount: number;
  totalCount: number;
}[] {
  const db = getDb();

  const rows = db.getAllSync<{
    dish_id: string;
    dish_name: string;
    type: string;
    total_qty: number;
  }>(
    `SELECT
       oi.dish_id,
       oi.dish_name,
       o.type,
       SUM(oi.quantity) as total_qty
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.status IN ('ACTIVE', 'PARTIALLY_COMPLETED')
       AND oi.completed = 0
     GROUP BY oi.dish_id, o.type`
  );

  // Merge dining + takeaway counts per dish
  const map: Record<string, { dishId: string; dishName: string; diningCount: number; takeawayCount: number }> = {};

  for (const row of rows) {
    if (!map[row.dish_id]) {
      map[row.dish_id] = { dishId: row.dish_id, dishName: row.dish_name, diningCount: 0, takeawayCount: 0 };
    }
    if (row.type === "DINING") map[row.dish_id].diningCount += row.total_qty;
    else map[row.dish_id].takeawayCount += row.total_qty;
  }

  return Object.values(map)
    .map((item) => ({ ...item, totalCount: item.diningCount + item.takeawayCount }))
    .sort((a, b) => b.totalCount - a.totalCount);
}
