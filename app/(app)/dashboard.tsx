// apps/mobile/app/(app)/dashboard.tsx
// Kitchen Dashboard — Vendor's real-time order management screen.
// Local-first: all data comes from SQLite via Zustand store.
// No cloud roundtrips for any operational action.

import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useOrdersStore } from "../../src/store/ordersStore";
import { useAuthStore } from "../../src/store/authStore";
import { acceptOrder, toggleOrderItem, forceCompleteOrder, completeCumulativeDishItems } from "../../src/lib/orderService";
import { disconnectAbly, isAblyConnected } from "../../src/lib/ably";
import { router } from "expo-router";
import type { LocalOrder, LocalOrderItem, CumulativeItem, OrderStatus } from "@yht/shared";
import { EXPIRY_CHECK_INTERVAL_MS } from "@yht/shared";

// ── Helper functions for Emojis / Dishes ──────────────────────────────────────

function getDishDetails(dishName: string, type: "DINING" | "TAKEAWAY") {
  const match = dishName.match(/^([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])\s*(.*)$/);
  if (match) {
    return { emoji: match[1], cleanName: match[2] };
  }
  return { emoji: type === "DINING" ? "🍽️" : "📦", cleanName: dishName };
}

function RenderDishIcon({ emoji }: { emoji: string }) {
  if (emoji === "🍽️") {
    return (
      <MaterialCommunityIcons
        name="silverware-fork-knife"
        size={16}
        color="#ffffff"
        style={{ marginRight: 6 }}
      />
    );
  }
  return <Text style={{ fontSize: 16, marginRight: 6 }}>{emoji}</Text>;
}

// ── Keypad Component ───────────────────────────────────────────────────────────

interface AcceptanceKeypadProps {
  onAccept: (code: string) => Promise<boolean>;
  activeCount: number;
}

function AcceptanceKeypad({ onAccept, activeCount }: AcceptanceKeypadProps) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState<"success" | "error" | null>(null);

  // Layout: [1][2][3][CLR] / [4][5][6][0] / [7][8][9][OK]
  const keys = ["1", "2", "3", "CLR", "4", "5", "6", "0", "7", "8", "9", "OK"];

  async function handleKey(key: string) {
    if (loading) return;

    if (key === "CLR") {
      setInput("");
      return;
    }

    if (key === "OK") {
      if (input.length < 3) return;
      setLoading(true);
      const success = await onAccept(input);
      setFlash(success ? "success" : "error");
      setTimeout(() => setFlash(null), 800);
      if (success) setInput("");
      setLoading(false);
      return;
    }

    if (input.length < 3) {
      setInput((prev) => prev + key);
    }
  }

  const displayColor =
    flash === "success" ? "#22c55e" :
    flash === "error" ? "#ef4444" :
    input.length === 3 ? "#f97316" : "#7a8c99";

  return (
    <View style={styles.keypadContainer}>
      {/* Header Row */}
      <View style={styles.keypadHeaderRow}>
        <Text style={styles.activeOrdersLabel}>
          ACTIVE <Text style={styles.activeOrdersCount}>{activeCount}</Text>
        </Text>
        
        <Text style={[styles.keypadValue, { color: displayColor }]}>
          {input ? input.split("").join("   ") : "-   -   -"}
        </Text>
      </View>

      {/* Grid */}
      <View style={styles.keypadGrid}>
        {keys.map((key) => (
          <TouchableOpacity
            key={key}
            style={[
              styles.keypadKey,
              key === "OK" && styles.keypadOk,
              key === "CLR" && styles.keypadClr,
              key === "OK" && input.length < 3 && styles.keypadDisabled,
            ]}
            onPress={() => handleKey(key)}
            disabled={loading || (key === "OK" && input.length < 3)}
            activeOpacity={0.6}
          >
            <Text style={[
              styles.keypadKeyText,
              key === "OK" && styles.keypadOkText,
              key === "CLR" && styles.keypadClrText,
            ]}>
              {key === "OK" && loading ? "..." : key}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ── Order Item Row ─────────────────────────────────────────────────────────────

function OrderItemRow({
  item,
  onToggle,
  isPending,
}: {
  item: LocalOrderItem;
  onToggle: () => void;
  isPending: boolean;
}) {
  const completed = item.completed === 1;
  const { emoji, cleanName } = getDishDetails(item.dish_name, "DINING");

  return (
    <TouchableOpacity
      style={styles.itemRow}
      onPress={isPending ? undefined : onToggle}
      disabled={isPending}
      activeOpacity={0.6}
    >
      <View style={[styles.itemCheckbox, completed && styles.itemCheckboxChecked]}>
        {completed && <MaterialCommunityIcons name="check" size={12} color="white" />}
      </View>
      
      <View style={styles.itemContent}>
        {item.quantity > 1 ? (
          <Text style={styles.itemQty}>{item.quantity}× </Text>
        ) : null}
        
        <RenderDishIcon emoji={emoji} />
        
        <Text style={[styles.itemNameText, completed && styles.itemNameCompleted]}>
          {cleanName}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Order Card ─────────────────────────────────────────────────────────────────

function OrderCard({
  order,
  items,
  onItemToggle,
  onComplete,
}: {
  order: LocalOrder;
  items: LocalOrderItem[];
  onItemToggle: (itemId: string, completed: boolean) => void;
  onComplete: () => void;
}) {
  const typeEmoji = order.type === "DINING" ? "🍽️" : "📦";

  return (
    <View style={[styles.orderCard, styles.orderCardActive]}>
      {/* Header */}
      <View style={styles.orderCardHeader}>
        <View style={styles.orderCardTitleRow}>
          <Text style={styles.orderNumber}>#{order.order_number}</Text>
          <Text style={styles.orderTypeEmoji}>{typeEmoji}</Text>
        </View>

        <View style={styles.orderCardMeta}>
          <Text style={styles.orderTime}>
            {new Date(order.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </Text>

          <View style={[styles.statusBadge, { backgroundColor: "#166534" }]}>
            <Text style={styles.statusBadgeText}>
              {order.status}
            </Text>
          </View>

          <TouchableOpacity onPress={onComplete} style={styles.completeButton}>
            <Text style={styles.completeButtonText}>Complete Order</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Items */}
      <View style={styles.orderCardItems}>
        {items.map((item) => (
          <OrderItemRow
            key={item.id}
            item={item}
            isPending={false}
            onToggle={() => onItemToggle(item.id, item.completed !== 1)}
          />
        ))}
      </View>

      {order.notes ? (
        <Text style={styles.orderNotes}>📝 {order.notes}</Text>
      ) : null}
    </View>
  );
}

// ── Cumulative Panel ───────────────────────────────────────────────────────────

function CumulativePanel({
  items,
  onPillPress,
}: {
  items: CumulativeItem[];
  onPillPress: (dishName: string, type: "DINING" | "TAKEAWAY", count: number) => void;
}) {
  const pills: { dishName: string; count: number; type: "DINING" | "TAKEAWAY" }[] = [];

  for (const item of items) {
    if (item.diningCount > 0) {
      pills.push({ dishName: item.dishName, count: item.diningCount, type: "DINING" });
    }
    if (item.takeawayCount > 0) {
      pills.push({ dishName: item.dishName, count: item.takeawayCount, type: "TAKEAWAY" });
    }
  }

  if (pills.length === 0) return null;

  return (
    <View style={styles.cumulativePanel}>
      {pills.map((pill, idx) => {
        const { emoji, cleanName } = getDishDetails(pill.dishName, pill.type);
        return (
          <TouchableOpacity
            key={`${pill.dishName}-${pill.type}-${idx}`}
            style={styles.pill}
            onPress={() => onPillPress(pill.dishName, pill.type, pill.count)}
            activeOpacity={0.7}
          >
            <View style={styles.pillLeft}>
              <RenderDishIcon emoji={emoji} />
              <Text style={styles.pillText}>{cleanName}</Text>
            </View>
            <View style={styles.pillRight}>
              <Text style={styles.pillCount}>{pill.count}</Text>
              <View style={styles.pillCheckCircle}>
                <MaterialCommunityIcons name="check" size={10} color="white" />
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const { orders, cumulative, loadFromDb, expireStale } = useOrdersStore();
  const { user, logout } = useAuthStore();
  const [connected, setConnected] = useState(false);

  // Load orders from SQLite on mount
  useEffect(() => {
    loadFromDb();
    setConnected(isAblyConnected());

    // Check Ably status periodically
    const connectionInterval = setInterval(() => {
      setConnected(isAblyConnected());
    }, 5000);

    return () => clearInterval(connectionInterval);
  }, []);

  // Auto-expire stale orders every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      expireStale();
    }, EXPIRY_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const handleAccept = useCallback(async (code: string): Promise<boolean> => {
    const result = await acceptOrder(parseInt(code, 10));
    return result !== null;
  }, []);

  const handleCompleteOrder = useCallback(async (orderId: string) => {
    await forceCompleteOrder(orderId);
  }, []);

  const handleItemToggle = useCallback(async (itemId: string, completed: boolean) => {
    await toggleOrderItem(itemId, completed);
  }, []);

  const handleCumulativePillPress = useCallback((dishName: string, type: "DINING" | "TAKEAWAY", count: number) => {
    const { cleanName } = getDishDetails(dishName, type);
    
    if (count <= 1) {
      Alert.alert(
        "Complete item?",
        `Are you sure you want to complete the 1 active order for ${cleanName} (${type.toLowerCase()})?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Yes, Complete",
            style: "default",
            onPress: () => {
              completeCumulativeDishItems(dishName, type, 1);
            },
          },
        ]
      );
    } else {
      Alert.alert(
        "Complete items?",
        `How many counts of ${cleanName} (${type.toLowerCase()}) do you want to complete?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: `Complete All (${count})`,
            style: "default",
            onPress: () => {
              completeCumulativeDishItems(dishName, type, count);
            },
          },
          {
            text: "Complete 1",
            style: "default",
            onPress: () => {
              completeCumulativeDishItems(dishName, type, 1);
            },
          },
        ]
      );
    }
  }, []);

  async function handleLogout() {
    await disconnectAbly();
    await logout();
    router.replace("/(auth)/login");
  }

  // Filter orders to display in dashboard
  const ordersToShow = orders
    .filter((o) => ["ACTIVE", "PARTIALLY_COMPLETED"].includes(o.order.status))
    .sort((a, b) => new Date(b.order.created_at).getTime() - new Date(a.order.created_at).getTime());

  const activeOrdersCount = ordersToShow.length;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerLogo}>
            YHT <Text style={styles.headerTitle}>Kitchen</Text>
          </Text>
          <View style={[styles.connectionBadge, connected ? styles.connectionBadgeOn : styles.connectionBadgeOff]}>
            <Text style={[styles.connectionText, connected ? styles.connectionTextOn : styles.connectionTextOff]}>
              {connected ? "• LIVE" : "• OFFLINE"}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Main content area */}
      <ScrollView
        style={styles.main}
        contentContainerStyle={styles.mainContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Pills / Cumulative */}
        <CumulativePanel items={cumulative} onPillPress={handleCumulativePillPress} />

        {/* Active / Pending Orders Cards List */}
        {ordersToShow.length === 0 ? (
          <View style={styles.emptyOrders}>
            <Text style={styles.emptyOrdersEmoji}>🍳</Text>
            <Text style={styles.emptyOrdersText}>No active orders</Text>
            <Text style={styles.emptyOrdersHint}>Accept an order using the keypad below</Text>
          </View>
        ) : (
          ordersToShow.map((item) => (
            <OrderCard
              key={item.order.id}
              order={item.order}
              items={item.items}
              onItemToggle={handleItemToggle}
              onComplete={() => handleCompleteOrder(item.order.id)}
            />
          ))
        )}
      </ScrollView>

      {/* Keypad Footer */}
      <View style={styles.footer}>
        <AcceptanceKeypad
          onAccept={handleAccept}
          activeCount={activeOrdersCount}
        />
      </View>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0c0f12" },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1d242c",
    backgroundColor: "#13171c",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerLogo: { fontSize: 20, fontWeight: "900", color: "#f97316", letterSpacing: 0.5 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#7a8c99" },
  connectionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  connectionBadgeOn: { borderColor: "rgba(34,197,94,0.4)", backgroundColor: "rgba(34,197,94,0.08)" },
  connectionBadgeOff: { borderColor: "rgba(239,68,68,0.4)", backgroundColor: "rgba(239,68,68,0.08)" },
  connectionText: { fontSize: 11, fontWeight: "700" },
  connectionTextOn: { color: "#22c55e" },
  connectionTextOff: { color: "#ef4444" },
  logoutButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#1b2229",
    borderWidth: 1,
    borderColor: "#2c3945",
  },
  logoutText: { fontSize: 12, color: "#8fa0b0", fontWeight: "600" },

  // Main scroll layout
  main: { flex: 1 },
  mainContent: { padding: 16, gap: 14 },

  // Cumulative Panel (stacked pills)
  cumulativePanel: {
    gap: 8,
    marginBottom: 6,
  },
  pill: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#13171c",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#854d0e", // Dark gold/orange border
    paddingVertical: 6,
    paddingHorizontal: 14,
    alignSelf: "flex-start",
  },
  pillLeft: { flexDirection: "row", alignItems: "center" },
  pillText: { fontSize: 13, fontWeight: "600", color: "#e2e8f0" },
  pillRight: { flexDirection: "row", alignItems: "center" },
  pillCount: { fontSize: 13, fontWeight: "800", color: "#f97316", marginLeft: 6 },
  pillCheckCircle: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: "#16a34a",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },

  // Active / Pending Cards List
  emptyOrders: { alignItems: "center", justifyContent: "center", paddingVertical: 80 },
  emptyOrdersEmoji: { fontSize: 48, marginBottom: 12 },
  emptyOrdersText: { fontSize: 16, fontWeight: "600", color: "#7a8c99" },
  emptyOrdersHint: { fontSize: 12, color: "#4b5563", marginTop: 4, textAlign: "center" },

  // Order Card
  orderCard: {
    backgroundColor: "#13171c",
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    overflow: "hidden",
    gap: 12,
  },
  orderCardActive: { borderColor: "#15803d" }, // Solid bright green border
  orderCardPending: { borderColor: "#ea580c" }, // Solid orange border
  orderCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  orderCardTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  orderNumber: { fontSize: 24, fontWeight: "900", color: "#ff9f0a", fontFamily: "monospace" },
  orderTypeEmoji: { fontSize: 18 },
  orderCardMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  orderTime: { fontSize: 12, color: "#636366" },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeText: { fontSize: 9, fontWeight: "700", color: "white" },
  
  completeButton: {
    borderWidth: 1,
    borderColor: "#15803d",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "rgba(21,128,61,0.1)",
  },
  completeButtonText: { color: "#22c55e", fontSize: 11, fontWeight: "700" },
  
  acceptButton: {
    borderWidth: 1,
    borderColor: "#ea580c",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "rgba(234,88,12,0.1)",
  },
  acceptButtonText: { color: "#f97316", fontSize: 11, fontWeight: "700" },

  orderCardItems: { gap: 10, paddingVertical: 4 },
  orderNotes: { fontSize: 12, color: "#8fa0b0", marginTop: 2 },

  // Item row styling
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2,
  },
  itemCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#2c3945",
    backgroundColor: "#1b2229",
    justifyContent: "center",
    alignItems: "center",
  },
  itemCheckboxChecked: { backgroundColor: "#16a34a", borderColor: "#16a34a" },
  itemContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginLeft: 10,
  },
  itemQty: { fontSize: 14, fontWeight: "900", color: "#f97316" },
  itemNameText: { fontSize: 14, fontWeight: "600", color: "#e2e8f0" },
  itemNameCompleted: { color: "#4b5563", textDecorationLine: "line-through" },

  // Footer & Keypad
  footer: {
    backgroundColor: "#0d0f11",
    borderTopWidth: 1,
    borderTopColor: "#1d242c",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
  },
  keypadContainer: { gap: 10 },
  keypadHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  activeOrdersLabel: { fontSize: 13, fontWeight: "600", color: "#7a8c99" },
  activeOrdersCount: { fontSize: 15, fontWeight: "900", color: "#f97316" },
  keypadValue: { fontSize: 20, fontWeight: "900", color: "#7a8c99", fontFamily: "monospace", letterSpacing: 4 },
  
  keypadGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 6 },
  keypadKey: {
    width: "23.5%",
    aspectRatio: 1.5,
    backgroundColor: "#131920",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#212a32",
  },
  keypadOk: { backgroundColor: "#3a230c", borderColor: "#5c3611" },
  keypadClr: { backgroundColor: "#131920", borderColor: "#450a0a" },
  keypadDisabled: { opacity: 0.3 },
  keypadKeyText: { fontSize: 18, fontWeight: "700", color: "#e2e8f0" },
  keypadOkText: { color: "#f97316" },
  keypadClrText: { color: "#ef4444" },
});
