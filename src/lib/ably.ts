// apps/mobile/src/lib/ably.ts
// Ably Realtime client for the mobile (vendor) app.
// - Subscribes to "orders" channel for new order events from customers
// - Publishes order status updates back (for customer status tracking)
// - Subscribes to "menu" channel for menu change events

import Ably from "ably";
import {
  ABLY_ORDERS_CHANNEL,
  ABLY_MENU_CHANNEL,
  type AblyEventType,
  type Order,
  type OrderStatusPayload,
} from "@yht/shared";
import { useAuthStore } from "../store/authStore";
import { useOrdersStore } from "../store/ordersStore";
import { useMenuStore } from "../store/menuStore";

let client: Ably.Realtime | null = null;
let ordersChannel: Ably.RealtimeChannel | null = null;
let menuChannel: Ably.RealtimeChannel | null = null;

/**
 * Initialize the Ably client and subscribe to operational channels.
 * Called once after successful login.
 */
export async function initAbly(): Promise<void> {
  const { token, user, webApiUrl } = useAuthStore.getState();
  if (!token || !user) throw new Error("Not authenticated");

  // Disconnect existing connection if any
  await disconnectAbly();

  const clientId = `vendor-${user.username}`;

  client = new Ably.Realtime({
    authUrl: `${webApiUrl}/api/ably-token?clientId=${encodeURIComponent(clientId)}`,
    authHeaders: { Authorization: `Bearer ${token}` },
    authMethod: "GET",
    clientId,
  });

  await new Promise<void>((resolve, reject) => {
    client!.connection.once("connected", () => resolve());
    client!.connection.once("failed", (err) =>
      reject(new Error(`Ably connection failed: ${err?.reason?.message}`))
    );
  });

  // Subscribe to "orders" channel
  ordersChannel = client.channels.get(ABLY_ORDERS_CHANNEL);

  ordersChannel.subscribe("order:new", (msg) => {
    const order = msg.data as Order;
    useOrdersStore.getState().addOrder(order);
  });

  // Subscribe to "menu" channel for admin updates
  menuChannel = client.channels.get(ABLY_MENU_CHANNEL);

  menuChannel.subscribe("menu:updated", async () => {
    // Re-sync menu from web API when admin makes changes
    await useMenuStore.getState().syncFromApi();
  });

  console.log("[Ably] Connected as", clientId);
}

/**
 * Publish an event to the orders channel (for customer status tracking).
 * Used after vendor accepts an order or completes an item.
 */
export async function publishOrderEvent(
  event: AblyEventType,
  payload: OrderStatusPayload
): Promise<void> {
  if (!ordersChannel) {
    console.warn("[Ably] Not connected — cannot publish");
    return;
  }

  try {
    // Publish to main orders channel (all subscribers)
    await ordersChannel.publish(event, payload);

    // Also publish to per-order channel for customer's direct subscription
    if (client) {
      const perOrderChannel = client.channels.get(`order:${payload.orderId}`);
      await perOrderChannel.publish(event, payload);
    }
  } catch (err) {
    console.error("[Ably] Publish failed:", err);
  }
}

/**
 * Publish to the menu channel (after admin saves a dish/category change).
 */
export async function publishMenuUpdated(payload?: Record<string, unknown>): Promise<void> {
  if (!menuChannel) {
    console.warn("[Ably] Not connected — cannot publish menu event");
    return;
  }

  try {
    await menuChannel.publish("menu:updated", payload ?? {});
  } catch (err) {
    console.error("[Ably] Menu publish failed:", err);
  }
}

/**
 * Disconnect and clean up all Ably connections.
 */
export async function disconnectAbly(): Promise<void> {
  if (ordersChannel) {
    ordersChannel.unsubscribe();
    ordersChannel = null;
  }
  if (menuChannel) {
    menuChannel.unsubscribe();
    menuChannel = null;
  }
  if (client) {
    client.close();
    client = null;
  }
}

export function getAblyClient(): Ably.Realtime | null {
  return client;
}

export function isAblyConnected(): boolean {
  return client?.connection.state === "connected";
}
