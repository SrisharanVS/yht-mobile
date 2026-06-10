// apps/mobile/app/(app)/_layout.tsx
// Authenticated layout — guards all vendor screens.
// Redirects to login if not authenticated.

import { useEffect } from "react";
import { Tabs } from "expo-router";
import { useAuthStore } from "../../src/store/authStore";
import { router } from "expo-router";
import { Text } from "react-native";

export default function AppLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/(auth)/login");
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) return null;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#111111",
          borderTopColor: "#2a2a2a",
          borderTopWidth: 1,
          height: 60,
        },
        tabBarActiveTintColor: "#f59e0b",
        tabBarInactiveTintColor: "#525252",
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Kitchen",
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🍳</Text>,
        }}
      />
      <Tabs.Screen
        name="admin/index"
        options={{
          title: "Admin",
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>⚙️</Text>,
        }}
      />
    </Tabs>
  );
}
