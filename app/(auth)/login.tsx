// apps/mobile/app/(auth)/login.tsx
// Vendor login screen — calls web API's /api/auth endpoint.
//
// Handles three distinct server responses:
//   200 → success: stores JWT + restaurant, initializes Ably, navigates to dashboard
//   403 subscription_inactive → navigates to the suspended screen (do NOT show "invalid credentials")
//   401 → shows "Invalid credentials" alert

import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { useAuthStore } from "../../src/store/authStore";
import { login as apiLogin } from "../../src/services/api";
import { initAbly } from "../../src/lib/ably";
import { useMenuStore } from "../../src/store/menuStore";
import { useOrdersStore } from "../../src/store/ordersStore";
import type { Restaurant } from "@yht/shared";

export default function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const { login } = useAuthStore();

  async function handleLogin() {
    if (!username.trim() || !password.trim()) return;
    setLoading(true);

    try {
      const { ok, status, data } = await apiLogin(username.trim(), password);

      // ── 403: subscription inactive ─────────────────────────────────────────
      // This is intentionally distinct from 401 — the user exists but their
      // restaurant's subscription is not active. Never show "invalid credentials".
      if (status === 403 && data.error === "subscription_inactive") {
        router.replace("/(auth)/suspended");
        return;
      }

      // ── 401 or other errors ────────────────────────────────────────────────
      if (!ok || !data.success) {
        Alert.alert("Login Failed", data.error || "Invalid credentials");
        return;
      }

      // ── 200: success ───────────────────────────────────────────────────────
      const restaurant = data.data.restaurant as Restaurant;

      // Store token + user + restaurant
      await login(data.data.token, data.data.user, restaurant);

      // Initialize Ably connection
      await initAbly();

      // Load local data from SQLite
      useOrdersStore.getState().loadFromDb();

      // Sync menu from web API (builds local cache)
      await useMenuStore.getState().syncFromApi();

      // Navigate to dashboard
      router.replace("/(app)/dashboard");
    } catch (err) {
      Alert.alert("Error", "Could not connect to server. Check your network.");
      console.error("[Login]", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Settings Floating Button */}
      <TouchableOpacity
        style={styles.settingsFloatingButton}
        onPress={() => router.push("/(auth)/settings")}
        activeOpacity={0.7}
      >
        <Text style={styles.settingsButtonIcon}>⚙️</Text>
      </TouchableOpacity>

      {/* Background glow orbs */}
      <View style={styles.glow1} />
      <View style={styles.glow2} />

      <View style={styles.card}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logoIcon}>
            <Text style={styles.logoEmoji}>🍛</Text>
          </View>
          <Text style={styles.logoTitle}>YHT</Text>
          <Text style={styles.logoSubtitle}>Thatuvadai Set</Text>
          <Text style={styles.logoHint}>Vendor & Admin Portal</Text>
        </View>

        {/* Form */}
        <Text style={styles.formTitle}>Sign In</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="vendor or admin"
            placeholderTextColor="#525252"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="#525252"
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />
        </View>

        <TouchableOpacity
          style={[styles.button, (!username || !password || loading) && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={!username || !password || loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign In →</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  glow1: {
    position: "absolute",
    top: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "#f59e0b",
    opacity: 0.06,
  },
  glow2: {
    position: "absolute",
    bottom: -100,
    left: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "#ea580c",
    opacity: 0.06,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#111111",
    borderRadius: 20,
    padding: 32,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoIcon: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: "#f59e0b",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  logoEmoji: {
    fontSize: 36,
  },
  logoTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: "#f59e0b",
    letterSpacing: 2,
  },
  logoSubtitle: {
    fontSize: 13,
    color: "#a3a3a3",
    marginTop: 2,
  },
  logoHint: {
    fontSize: 11,
    color: "#525252",
    marginTop: 4,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#f5f5f5",
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
    color: "#a3a3a3",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: "#f5f5f5",
  },
  button: {
    marginTop: 8,
    backgroundColor: "#f59e0b",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  buttonDisabled: {
    backgroundColor: "#2a2a2a",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  settingsFloatingButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 40,
    right: 24,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#111111",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  settingsButtonIcon: {
    fontSize: 20,
  },
});
