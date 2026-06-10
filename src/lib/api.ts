// apps/mobile/src/lib/api.ts
// Centralized API client for the mobile app.
// Automatically attaches the JWT Bearer token and the web API base URL.
//
// 403 subscription_inactive — disconnects Ably and navigates to the suspended screen.
// 401 unauthorized          — clears auth and navigates to the login screen.
//
// All requests to the web API go through this helper.

import { router } from "expo-router";
import { useAuthStore } from "../store/authStore";
import { disconnectAbly } from "./ably";
import type { ApiResponse } from "@yht/shared";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions {
  body?: unknown;
  /** Skip auth header (for the login request itself) */
  skipAuth?: boolean;
}

/**
 * Handle a globally-intercepted error response.
 * Runs outside of React — uses the store + router directly.
 */
async function handleGlobalError(status: number, error?: string): Promise<void> {
  if (status === 403 && error === "subscription_inactive") {
    // Disconnect real-time subscription — KDS cannot operate for suspended restaurants
    try { await disconnectAbly(); } catch { /* ignore */ }
    router.replace("/(auth)/suspended");
    return;
  }

  if (status === 401) {
    // Token expired or revoked — clear credentials and send to login
    await useAuthStore.getState().logout();
    router.replace("/(auth)/login");
  }
}

/**
 * Make an authenticated request to the web API.
 *
 * Usage:
 *   const data = await api<Category[]>("GET", "/api/categories");
 *   const cat  = await api<Category>("POST", "/api/categories", { body: { name: "Starters" } });
 */
export async function api<T = unknown>(
  method: Method,
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { token, webApiUrl } = useAuthStore.getState();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (!options.skipAuth && token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${webApiUrl}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const contentType = res.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    const text = await res.text();
    throw new Error(
      `Server returned non-JSON response (status ${res.status}): ${text.slice(0, 150)}`
    );
  }

  const json = (await res.json()) as ApiResponse<T>;

  // ── Global error interception ───────────────────────────────────────────────
  if (!res.ok) {
    // Fire-and-forget the navigation so the caller can still handle the throw
    handleGlobalError(res.status, json.error).catch(console.warn);
    throw new Error(json.error ?? "Unknown API error");
  }

  if (!json.success) {
    throw new Error(json.error ?? "Unknown API error");
  }

  return json.data as T;
}

/**
 * Make a raw session-check request without triggering automatic redirects.
 * Used by _layout.tsx during startup to decide which screen to show.
 *
 * Returns: { status, error? }
 */
export async function checkSession(webApiUrl: string, token: string): Promise<{
  status: number;
  error?: string;
  data?: { authenticated: boolean; user: { id: string; username: string }; restaurant: { id: string; name: string; status: string } };
}> {
  try {
    const res = await fetch(`${webApiUrl}/api/auth/session`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    const json = await res.json();
    return { status: res.status, error: json.error, data: json.data };
  } catch {
    // Network error — treat as transient, do not log out
    return { status: 0, error: "network_error" };
  }
}
