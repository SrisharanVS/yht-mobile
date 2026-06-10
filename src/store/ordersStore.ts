// apps/mobile/src/store/ordersStore.ts
// Orders state — backed by SQLite, loaded into memory for instant UI access.
// This is the source of truth for all vendor operational state.

import { create } from "zustand";
import type { OrderStatus, CumulativeItem } from "@yht/shared";
import type { LocalOrder, LocalOrderItem } from "@yht/shared";
import {
  getAllDashboardOrders,
  acceptOrder,
  toggleOrderItem,
  expireStaleOrders,
  computeCumulativeCounts,
  insertOrder,
  completeOrder,
} from "../db/orders";
import type { Order } from "@yht/shared";

export interface OrderWithItems {
  order: LocalOrder;
  items: LocalOrderItem[];
}

interface OrdersState {
  orders: OrderWithItems[];
  cumulative: CumulativeItem[];
  isLoaded: boolean;

  // Actions
  loadFromDb: () => void;
  addOrder: (order: Order) => void;
  acceptOrderByNumber: (orderNumber: number) => LocalOrder | null;
  toggleItem: (itemId: string, completed: boolean) => {
    order: LocalOrder;
    items: LocalOrderItem[];
    newStatus: OrderStatus;
  } | null;
  completeOrder: (orderId: string) => {
    order: LocalOrder;
    items: LocalOrderItem[];
    newStatus: OrderStatus;
  } | null;
  expireStale: () => string[];
  refreshCumulative: () => void;
}

export const useOrdersStore = create<OrdersState>((set, get) => ({
  orders: [],
  cumulative: [],
  isLoaded: false,

  loadFromDb: () => {
    const orders = getAllDashboardOrders();
    const cumulative = computeCumulativeCounts();
    set({ orders, cumulative, isLoaded: true });
  },

  addOrder: (order: Order) => {
    // Insert into SQLite (idempotent)
    insertOrder(order);
    // Reload from DB to get the canonical state
    const orders = getAllDashboardOrders();
    const cumulative = computeCumulativeCounts();
    set({ orders, cumulative });
  },

  acceptOrderByNumber: (orderNumber: number) => {
    const updated = acceptOrder(orderNumber);
    if (updated) {
      // Reload orders from DB
      const orders = getAllDashboardOrders();
      const cumulative = computeCumulativeCounts();
      set({ orders, cumulative });
    }
    return updated;
  },

  toggleItem: (itemId: string, completed: boolean) => {
    const result = toggleOrderItem(itemId, completed);
    if (result) {
      const orders = getAllDashboardOrders();
      const cumulative = computeCumulativeCounts();
      set({ orders, cumulative });
    }
    return result;
  },

  completeOrder: (orderId: string) => {
    const result = completeOrder(orderId);
    if (result) {
      const orders = getAllDashboardOrders();
      const cumulative = computeCumulativeCounts();
      set({ orders, cumulative });
    }
    return result;
  },

  expireStale: () => {
    const expiredIds = expireStaleOrders();
    if (expiredIds.length > 0) {
      const orders = getAllDashboardOrders();
      set({ orders });
    }
    return expiredIds;
  },

  refreshCumulative: () => {
    const cumulative = computeCumulativeCounts();
    set({ cumulative });
  },
}));
