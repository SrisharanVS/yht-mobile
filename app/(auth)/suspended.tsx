// apps/mobile/app/(auth)/suspended.tsx
// Subscription Inactive screen — shown when the restaurant's account is suspended.
//
// The user cannot access any KDS functionality from this screen.
// Logging out clears SecureStore and returns to the login screen.

import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuthStore } from "../../src/store/authStore";
import { disconnectAbly } from "../../src/lib/ably";

export default function SuspendedScreen() {
  const { logout, restaurant } = useAuthStore();

  async function handleLogout() {
    Alert.alert(
      "Sign Out",
      "You will be returned to the login screen.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            try { await disconnectAbly(); } catch { /* ignore */ }
            await logout();
            router.replace("/(auth)/login");
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {/* Background glow orbs */}
      <View style={styles.glow1} />
      <View style={styles.glow2} />

      <View style={styles.content}>
        {/* Icon */}
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>🔒</Text>
        </View>

        {/* Status badge */}
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {restaurant?.status?.toUpperCase() ?? "SUSPENDED"}
          </Text>
        </View>

        {/* Heading */}
        <Text style={styles.title}>Subscription Inactive</Text>

        {/* Message */}
        <Text style={styles.message}>
          Your restaurant&apos;s subscription is no longer active.
          {"\n"}Access to the Kitchen Display System has been restricted.
        </Text>

        {/* Contact info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>What to do next</Text>
          <Text style={styles.infoText}>
            Please contact your system administrator or support team to restore access.
            Your order history and settings are safe.
          </Text>
        </View>

        {/* Restaurant name if available */}
        {restaurant?.name ? (
          <Text style={styles.restaurantName}>
            Restaurant: {restaurant.name}
          </Text>
        ) : null}

        {/* Logout button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  glow1: {
    position: "absolute",
    top: -80,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "#ef4444",
    opacity: 0.07,
  },
  glow2: {
    position: "absolute",
    bottom: -80,
    left: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "#7c3aed",
    opacity: 0.06,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 20,
  },
  iconContainer: {
    width: 88,
    height: 88,
    borderRadius: 22,
    backgroundColor: "#1a0a0a",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#450a0a",
    marginBottom: 4,
  },
  icon: {
    fontSize: 42,
  },
  badge: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#ef4444",
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 26,
    fontWeight: "900",
    color: "#f5f5f5",
    textAlign: "center",
    marginTop: 4,
  },
  message: {
    fontSize: 15,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: 24,
  },
  infoCard: {
    width: "100%",
    backgroundColor: "#111111",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 16,
    padding: 20,
    gap: 8,
    marginTop: 4,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#f59e0b",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  infoText: {
    fontSize: 14,
    color: "#6b7280",
    lineHeight: 22,
  },
  restaurantName: {
    fontSize: 12,
    color: "#4b5563",
    fontStyle: "italic",
  },
  logoutButton: {
    marginTop: 12,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#ef4444",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
    alignItems: "center",
    width: "100%",
  },
  logoutText: {
    color: "#ef4444",
    fontSize: 16,
    fontWeight: "700",
  },
});
