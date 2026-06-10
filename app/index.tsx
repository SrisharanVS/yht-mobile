// apps/mobile/app/index.tsx
// Root redirect — sends to dashboard if authenticated, login if not.

import { Redirect } from "expo-router";
import { useAuthStore } from "../src/store/authStore";

export default function Index() {
  const { isAuthenticated, restaurant } = useAuthStore();

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  if (restaurant?.status === "SUSPENDED") {
    return <Redirect href="/(auth)/suspended" />;
  }

  return <Redirect href="/(app)/dashboard" />;
}
