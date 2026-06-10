// apps/mobile/app/(auth)/_layout.tsx
// Auth group layout — no tab bar, just a stack for the login screen.

import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }} />
  );
}
