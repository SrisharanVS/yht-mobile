// apps/mobile/src/store/authStore.ts
// Authentication state — JWT token + user info + restaurant info.
// Token is persisted in expo-secure-store for security.
// Restaurant data is derived from the server on login/session-check — never trusted from storage.

import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import type { UserRole, Restaurant } from "@yht/shared";

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  restaurant: Restaurant | null;
  isAuthenticated: boolean;

  // Actions
  login: (token: string, user: AuthUser, restaurant: Restaurant) => Promise<void>;
  logout: () => Promise<void>;
  /** Load persisted token from SecureStore. Does NOT validate with server — call checkSession() for that. */
  loadFromStorage: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  restaurant: null,
  isAuthenticated: false,

  login: async (token, user, restaurant) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    // NOTE: restaurant is intentionally NOT persisted in SecureStore.
    // It is always re-fetched from the server on session check.
    set({ token, user, restaurant, isAuthenticated: true });
  },

  logout: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    set({ token: null, user: null, restaurant: null, isAuthenticated: false });
  },

  loadFromStorage: async () => {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const userJson = await SecureStore.getItemAsync(USER_KEY);

      if (token && userJson) {
        const user = JSON.parse(userJson) as AuthUser;
        // Only set the token/user — restaurant is NOT loaded from storage.
        // isAuthenticated is set to true tentatively; _layout.tsx will do the session check.
        set({ token, user, restaurant: null, isAuthenticated: true });
      }
    } catch {
      // Storage read failed — treat as logged out
      set({ token: null, user: null, restaurant: null, isAuthenticated: false });
    }
  },
}));
