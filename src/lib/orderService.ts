// apps/mobile/src/lib/orderService.ts
// High-level vendor order operations.
// Each action: 1) updates SQLite locally (instant), 2) publishes to Ably (for customer), 3) syncs to PostgreSQL.
// Local state is always updated first — network and API are best-effort.

import { useOrdersStore } from "../store/ordersStore";
import { publishOrderEvent } from "./ably";
import { api } from "./api";
import type { LocalOrder } from "@yht/shared";
import { getUncompletedItemsForDish } from "../db/orders";

/**
 * Vendor accepts an order by entering the 3-digit order number on the keypad.
 * Returns the accepted order, or null if not found / expired.
 * Performance target: <100ms (SQLite write + Ably publish async)
 */
export async function acceptOrder(orderNumber: number): Promise<LocalOrder | null> {
  // 1. Instant local update
  const updatedOrder = useOrdersStore.getState().acceptOrderByNumber(orderNumber);

  if (!updatedOrder) return null;

  // 2. Async publish for customer (non-blocking)
  publishOrderEvent("order:accepted", {
    orderId: updatedOrder.id,
    orderNumber: updatedOrder.order_number,
    status: "ACTIVE",
  }).catch((err) => console.warn("[orderService] accept publish failed:", err));

  // 3. Sync to Next.js server (non-blocking)
  api("PATCH", `/api/orders/${updatedOrder.id}`, {
    body: { status: "ACTIVE" }
  }).catch((err) => console.warn("[orderService] accept server sync failed:", err));

  return updatedOrder;
}

/**
 * Vendor toggles an item's completion state.
 * Performance target: <50ms (SQLite write only, Ably is fire-and-forget)
 */
export async function toggleOrderItem(
  itemId: string,
  completed: boolean
): Promise<void> {
  const result = useOrdersStore.getState().toggleItem(itemId, completed);

  if (!result) return;

  const { order, newStatus } = result;

  // Async publish for customer status tracking
  const event =
    newStatus === "COMPLETED" ? "order:completed" : "order:item_completed";

  publishOrderEvent(event, {
    orderId: order.id,
    orderNumber: order.order_number,
    status: newStatus,
    itemId,
    completed,
  }).catch((err) => console.warn("[orderService] item toggle publish failed:", err));

  // Sync to Next.js server (non-blocking)
  api("PATCH", `/api/orders/${order.id}`, {
    body: {
      status: newStatus,
      items: [{ id: itemId, completed }]
    }
  }).catch((err) => console.warn("[orderService] item toggle server sync failed:", err));
}

/**
 * Vendor forces completion of an entire order.
 */
export async function forceCompleteOrder(orderId: string): Promise<void> {
  const result = useOrdersStore.getState().completeOrder(orderId);

  if (!result) return;

  const { order, items } = result;

  publishOrderEvent("order:completed", {
    orderId: order.id,
    orderNumber: order.order_number,
    status: "COMPLETED",
  }).catch((err) => console.warn("[orderService] order completion publish failed:", err));

  // Sync to Next.js server (non-blocking)
  api("PATCH", `/api/orders/${order.id}`, {
    body: {
      status: "COMPLETED",
      items: items.map((i) => ({ id: i.id, completed: true }))
    }
  }).catch((err) => console.warn("[orderService] order completion server sync failed:", err));
}

/**
 * Complete a specific quantity of a dish under cumulative view,
 * completing item rows across actual orders in FIFO order (created_at ASC).
 */
export async function completeCumulativeDishItems(
  dishName: string,
  type: "DINING" | "TAKEAWAY",
  countToComplete: number
): Promise<void> {
  const items = getUncompletedItemsForDish(dishName, type);

  let remaining = countToComplete;
  for (const item of items) {
    if (remaining <= 0) break;
    
    // Complete this item
    await toggleOrderItem(item.id, true);
    
    // Subtract its quantity from remaining
    remaining -= item.quantity;
  }
}
