// apps/mobile/app/_layout.tsx
// Root layout — runs migrations, loads auth from storage, validates session with server.
//
// Startup flow:
//   1. Run SQLite migrations (idempotent)
//   2. Load persisted token from SecureStore
//   3. If token exists, call GET /api/auth/session to verify with the server:
//      - 200 → update restaurant in store, route to dashboard
//      - 403 subscription_inactive → route to suspended screen (restaurant blocked)
//      - 401 → clear token, route to login
//      - Network error (0) → allow through (offline tolerance)
//   4. If no token, route to login

import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { runMigrations } from "../src/db/migrations";
import { useAuthStore } from "../src/store/authStore";
import { checkSession } from "../src/lib/api";
import { View, ActivityIndicator } from "react-native";

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);
  const { loadFromStorage, logout, login, token, user, webApiUrl } = useAuthStore();

  useEffect(() => {
    async function init() {
      // ── 1. Run DB migrations (idempotent) ────────────────────────────────
      runMigrations();

      // ── 2. Load persisted auth token from SecureStore ─────────────────────
      await loadFromStorage();

      setDbReady(true);
    }
    init().catch(console.error);
  }, []);

  // ── 3. Session validation (runs after dbReady + once token is loaded) ──────
  // We need a second effect that watches the token value after dbReady is true.
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    if (!dbReady) return; // Wait for storage load to complete

    async function validate() {
      const currentToken = useAuthStore.getState().token;
      const currentUser = useAuthStore.getState().user;

      if (!currentToken || !currentUser) {
        // No stored credentials
        setSessionChecked(true);
        return;
      }

      // Call the server to verify token and subscription status
      const { status, error, data } = await checkSession(webApiUrl, currentToken);

      if (status === 0) {
        // Network error — allow through with the cached token (offline tolerance)
        // The next API call will handle 403/401 if they occur
        setSessionChecked(true);
        return;
      }

      if (status === 200 && data) {
        // Session valid — update restaurant data in store (it wasn't persisted)
        await login(currentToken, currentUser, {
          id: data.restaurant.id,
          name: data.restaurant.name,
          status: data.restaurant.status as "ACTIVE" | "SUSPENDED" | "TRIAL",
        });
        setSessionChecked(true);
        return;
      }

      if (status === 403 && error === "subscription_inactive") {
        // Restaurant is suspended — update the store so other components know it
        useAuthStore.setState({
          restaurant: { id: "", name: "", status: "SUSPENDED" }
        });
        setSessionChecked(true);
        return;
      }

      // 401 or any other error — clear token and send to login
      await logout();
      setSessionChecked(true);
    }

    validate().catch(console.error);
  }, [dbReady]);

  // Show spinner while initializing
  if (!dbReady || !sessionChecked) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0a0a0a", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color="#f59e0b" size="large" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
