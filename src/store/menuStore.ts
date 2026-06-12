// apps/mobile/src/store/menuStore.ts
// Local menu cache — synced from web API, stored in SQLite.
// Loaded into memory for instant access in admin screen and order display.

import { create } from "zustand";
import type { Category, Dish } from "@yht/shared";
import { getCategories, getMenuItems, syncMenuFromApi } from "../db/menu";
import { api } from "../services/api";

interface MenuState {
  categories: Category[];
  dishes: Dish[];
  isLoaded: boolean;
  isSyncing: boolean;
  lastSyncedAt: string | null;

  // Actions
  loadFromDb: () => void;
  syncFromApi: () => Promise<void>;
}

export const useMenuStore = create<MenuState>((set, get) => ({
  categories: [],
  dishes: [],
  isLoaded: false,
  isSyncing: false,
  lastSyncedAt: null,

  loadFromDb: () => {
    const categories = getCategories();
    const dishes = getMenuItems(true); // include hidden for admin screen
    set({ categories, dishes, isLoaded: true });
  },

  syncFromApi: async () => {
    if (get().isSyncing) return;

    set({ isSyncing: true });
    try {
      const [categories, dishes] = await Promise.all([
        api<Category[]>("GET", "/api/categories"),
        api<Dish[]>("GET", "/api/menu"),
      ]);

      // Persist to SQLite
      syncMenuFromApi(categories, dishes);
      // Update memory state
      const freshCats = getCategories();
      const freshDishes = getMenuItems(true);
      set({
        categories: freshCats,
        dishes: freshDishes,
        lastSyncedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn("[menuStore] Sync failed:", err);
    } finally {
      set({ isSyncing: false });
    }
  },
}));
