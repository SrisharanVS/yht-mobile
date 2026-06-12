import AsyncStorage from "@react-native-async-storage/async-storage";

const BACKEND_URL_KEY = "backend_url";
const DEFAULT_URL = process.env.EXPO_PUBLIC_WEB_API_URL ?? "http://localhost:3000";

let inMemoryBackendUrl: string = DEFAULT_URL;

/**
 * Get the currently configured backend URL.
 */
export function getBackendUrl(): string {
  return inMemoryBackendUrl;
}

/**
 * Synonym helper for getBackendUrl().
 */
export function getApiBaseUrl(): string {
  return inMemoryBackendUrl;
}

/**
 * Validate and set the backend URL, persisting it to storage.
 */
export async function setBackendUrl(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error("Invalid URL. Must start with http:// or https://");
  }
  
  // Strip trailing slash if present to prevent double slashes in paths
  const cleanUrl = trimmed.replace(/\/+$/, "");
  
  inMemoryBackendUrl = cleanUrl;
  await AsyncStorage.setItem(BACKEND_URL_KEY, cleanUrl);
}

/**
 * Load the stored backend URL from AsyncStorage during startup.
 */
export async function initializeConfig(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(BACKEND_URL_KEY);
    if (stored && stored.trim() !== "") {
      inMemoryBackendUrl = stored.trim().replace(/\/+$/, "");
    } else {
      inMemoryBackendUrl = DEFAULT_URL.replace(/\/+$/, "");
    }
  } catch (error) {
    console.error("[Config] Failed to load backend URL from storage:", error);
    inMemoryBackendUrl = DEFAULT_URL.replace(/\/+$/, "");
  }
}

/**
 * Get the default hardcoded API URL from environment variables.
 */
export function getDefaultBackendUrl(): string {
  return DEFAULT_URL.replace(/\/+$/, "");
}
