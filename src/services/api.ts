import { router } from "expo-router";
import { useAuthStore } from "../store/authStore";
import { disconnectAbly } from "../lib/ably";
import type { ApiResponse } from "@yht/shared";
import { getBackendUrl } from "./config";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions {
  body?: unknown;
  /** Skip auth header */
  skipAuth?: boolean;
}

/**
 * Handle globally-intercepted error response.
 * Runs outside of React components.
 */
async function handleGlobalError(status: number, error?: string): Promise<void> {
  if (status === 403 && error === "subscription_inactive") {
    try {
      await disconnectAbly();
    } catch {
      /* ignore */
    }
    router.replace("/(auth)/suspended");
    return;
  }

  if (status === 401) {
    await useAuthStore.getState().logout();
    router.replace("/(auth)/login");
  }
}

/**
 * Core generic API request method.
 */
export async function api<T = unknown>(
  method: Method,
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const baseUrl = getBackendUrl();
  const { token } = useAuthStore.getState();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (!options.skipAuth && token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${baseUrl}${path}`, {
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

  if (!res.ok) {
    handleGlobalError(res.status, json.error).catch(console.warn);
    throw new Error(json.error ?? "Unknown API error");
  }

  if (!json.success) {
    throw new Error(json.error ?? "Unknown API error");
  }

  return json.data as T;
}

/**
 * Centralized HTTP helpers.
 */
export const apiConfig = {
  get: <T = unknown>(path: string, options?: RequestOptions) =>
    api<T>("GET", path, options),
  
  post: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    api<T>("POST", path, { ...options, body }),
  
  put: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    api<T>("PUT", path, { ...options, body }),
  
  patch: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    api<T>("PATCH", path, { ...options, body }),
  
  delete: <T = unknown>(path: string, options?: RequestOptions) =>
    api<T>("DELETE", path, options),
};

/**
 * Handle authentication request.
 */
export async function login(username: string, password: string) {
  const baseUrl = getBackendUrl();
  const res = await fetch(`${baseUrl}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const contentType = res.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    const text = await res.text();
    throw new Error(
      `Server returned non-JSON response (status ${res.status}): ${text.slice(0, 150)}`
    );
  }

  const data = await res.json();
  return {
    status: res.status,
    ok: res.ok,
    data,
  };
}

/**
 * Make a raw session check request.
 */
export async function checkSession(token: string): Promise<{
  status: number;
  error?: string;
  data?: {
    authenticated: boolean;
    user: { id: string; username: string };
    restaurant: { id: string; name: string; status: string };
  };
}> {
  const baseUrl = getBackendUrl();
  try {
    const res = await fetch(`${baseUrl}/api/auth/session`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    const json = await res.json();
    return { status: res.status, error: json.error, data: json.data };
  } catch {
    return { status: 0, error: "network_error" };
  }
}

/**
 * Test server connectivity at a specified URL.
 */
export async function testConnection(url: string): Promise<boolean> {
  const cleanUrl = url.trim().replace(/\/+$/, "");
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 5000);

  try {
    // Try health check
    const res = await fetch(`${cleanUrl}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(id);
    return res.status >= 200;
  } catch {
    try {
      // Try ping as backup
      const res2 = await fetch(`${cleanUrl}/api/ping`, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(id);
      return res2.status >= 200;
    } catch {
      clearTimeout(id);
      return false;
    }
  }
}
