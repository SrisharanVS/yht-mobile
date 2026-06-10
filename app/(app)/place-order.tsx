// apps/mobile/app/(app)/place-order.tsx
// Place Order screen — allows vendors to place orders directly from the KDS.
// Fetches active dishes from the Admin menu cache and submits to the API.

import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuthStore } from "../../src/store/authStore";
import { useMenuStore } from "../../src/store/menuStore";
import { useOrdersStore } from "../../src/store/ordersStore";
import { acceptOrder } from "../../src/lib/orderService";
import { router } from "expo-router";

function getDishDetails(dishName: string, type: "DINING" | "TAKEAWAY") {
  const match = dishName.match(/^([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])\s*(.*)$/);
  if (match) {
    return { emoji: match[1], cleanName: match[2] };
  }
  return { emoji: type === "DINING" ? "🍽️" : "📦", cleanName: dishName };
}

export default function PlaceOrderScreen() {
  const { token, webApiUrl } = useAuthStore();
  const { dishes, categories, loadFromDb, syncFromApi } = useMenuStore();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [orderType, setOrderType] = useState<"DINING" | "TAKEAWAY">("DINING");
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);

  // Sync menu on mount
  useEffect(() => {
    loadFromDb();
    syncFromApi();
  }, []);

  const activeDishes = dishes.filter((d) => d.active);

  const filteredDishes = selectedCategory === "all"
    ? activeDishes
    : activeDishes.filter((d) => d.categoryId === selectedCategory);

  const totalItems = Object.values(cart).reduce((sum, qty) => sum + qty, 0);

  const totalPrice = Object.entries(cart).reduce((sum, [dishId, qty]) => {
    const dish = dishes.find((d) => d.id === dishId);
    return sum + (dish ? Number(dish.price) * qty : 0);
  }, 0);

  const addToCart = (dishId: string) => {
    setCart((prev) => ({
      ...prev,
      [dishId]: (prev[dishId] ?? 0) + 1,
    }));
  };

  const removeFromCart = (dishId: string) => {
    setCart((prev) => {
      const copy = { ...prev };
      if (copy[dishId] <= 1) {
        delete copy[dishId];
      } else {
        copy[dishId] -= 1;
      }
      return copy;
    });
  };

  const clearCart = () => {
    setCart({});
    setNotes("");
  };

  async function handlePlaceOrder() {
    if (totalItems === 0) return;
    setPlacing(true);

    try {
      const orderItems = Object.entries(cart).map(([dishId, quantity]) => ({
        dishId,
        quantity,
      }));

      // Generate unique device ID for vendor to bypass customer limits
      const vendorDeviceId = `vendor-pos-${Date.now()}`;

      const res = await fetch(`${webApiUrl}/api/orders`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deviceId: vendorDeviceId,
          type: orderType,
          notes: notes.trim() || null,
          items: orderItems,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        Alert.alert("Error", data.error || "Failed to place order");
        return;
      }

      const orderData = data.data;

      // 1. Manually add to ordersStore (writes to SQLite)
      useOrdersStore.getState().addOrder(orderData);

      // 2. Accept order immediately in the KDS
      const acceptedOrder = await acceptOrder(Number(orderData.orderNumber));

      if (acceptedOrder) {
        Alert.alert(
          "Success",
          `Order #${orderData.orderNumber} placed & accepted successfully!`,
          [
            {
              text: "OK",
              onPress: () => {
                clearCart();
                router.push("/dashboard");
              },
            },
          ]
        );
      } else {
        Alert.alert("Warning", "Order placed on server but could not be accepted locally.");
      }
    } catch (err) {
      console.error("[place-order] Submit failed:", err);
      Alert.alert("Error", "Network or server error placing order.");
    } finally {
      setPlacing(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerLogo}>YHT</Text>
          <Text style={styles.headerTitle}>New Order</Text>
        </View>
        {totalItems > 0 && (
          <TouchableOpacity onPress={clearCart} style={styles.clearButton}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Categories Horizontal Selector */}
      <View style={styles.categoryRowContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
          <TouchableOpacity
            style={[styles.categoryPill, selectedCategory === "all" && styles.categoryPillActive]}
            onPress={() => setSelectedCategory("all")}
          >
            <Text style={[styles.categoryPillText, selectedCategory === "all" && styles.categoryPillActiveText]}>
              All Items
            </Text>
          </TouchableOpacity>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.categoryPill, selectedCategory === cat.id && styles.categoryPillActive]}
              onPress={() => setSelectedCategory(cat.id)}
            >
              <Text style={[styles.categoryPillText, selectedCategory === cat.id && styles.categoryPillActiveText]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Main content split */}
      <View style={styles.mainLayout}>
        {/* Dishes list */}
        <ScrollView style={styles.dishesList} contentContainerStyle={styles.dishesContent}>
          {filteredDishes.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>🍽️</Text>
              <Text style={styles.emptyText}>No active dishes in this category</Text>
            </View>
          ) : (
            filteredDishes.map((dish) => {
              const qty = cart[dish.id] ?? 0;
              const { emoji, cleanName } = getDishDetails(dish.name, "DINING");
              const unavailable =
                (orderType === "DINING" && !dish.diningAvailable) ||
                (orderType === "TAKEAWAY" && !dish.takeawayAvailable);

              return (
                <View
                  key={dish.id}
                  style={[styles.dishCard, unavailable && styles.dishCardUnavailable]}
                >
                  <View style={styles.dishInfo}>
                    <View style={styles.dishTitleRow}>
                      <Text style={styles.dishEmoji}>{emoji}</Text>
                      <Text style={styles.dishName}>{cleanName}</Text>
                    </View>
                    <Text style={styles.dishPrice}>₹{dish.price}</Text>
                  </View>

                  {unavailable ? (
                    <Text style={styles.unavailableLabel}>Unavailable</Text>
                  ) : qty === 0 ? (
                    <TouchableOpacity
                      style={styles.addButton}
                      onPress={() => addToCart(dish.id)}
                    >
                      <Text style={styles.addButtonText}>+ Add</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.qtyContainer}>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => removeFromCart(dish.id)}
                      >
                        <Text style={styles.qtyBtnText}>−</Text>
                      </TouchableOpacity>
                      <Text style={styles.qtyText}>{qty}</Text>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => addToCart(dish.id)}
                      >
                        <Text style={styles.qtyBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Sticky footer checkout panel */}
        {totalItems > 0 && (
          <View style={styles.checkoutPanel}>
            {/* Order type toggle */}
            <View style={styles.typeToggleRow}>
              <TouchableOpacity
                style={[styles.typeBtn, orderType === "DINING" && styles.typeBtnActive]}
                onPress={() => setOrderType("DINING")}
              >
                <Text style={[styles.typeBtnText, orderType === "DINING" && styles.typeBtnTextActive]}>
                  🍽️ Dine In
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, orderType === "TAKEAWAY" && styles.typeBtnActive]}
                onPress={() => setOrderType("TAKEAWAY")}
              >
                <Text style={[styles.typeBtnText, orderType === "TAKEAWAY" && styles.typeBtnTextActive]}>
                  📦 Takeaway
                </Text>
              </TouchableOpacity>
            </View>

            {/* Notes */}
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Cooking instructions / notes..."
              placeholderTextColor="#525252"
              multiline
              numberOfLines={2}
            />

            {/* Order submission button */}
            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handlePlaceOrder}
              disabled={placing}
            >
              {placing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View style={styles.submitBtnContent}>
                  <Text style={styles.submitBtnText}>Place & Accept Order</Text>
                  <Text style={styles.submitBtnPrice}>
                    ₹{totalPrice.toFixed(0)} • {totalItems} items
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0c0f12" },

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
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#1b2229",
  },
  clearText: { color: "#ef4444", fontSize: 12, fontWeight: "600" },

  categoryRowContainer: {
    backgroundColor: "#13171c",
    borderBottomWidth: 1,
    borderBottomColor: "#1d242c",
    paddingVertical: 10,
  },
  categoryRow: { paddingHorizontal: 16 },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#1b2229",
    borderWidth: 1,
    borderColor: "#2c3945",
    marginRight: 8,
  },
  categoryPillActive: { backgroundColor: "#f97316", borderColor: "transparent" },
  categoryPillText: { fontSize: 12, fontWeight: "600", color: "#8fa0b0" },
  categoryPillActiveText: { color: "#fff" },

  mainLayout: { flex: 1 },
  dishesList: { flex: 1 },
  dishesContent: { padding: 16, gap: 12 },

  emptyContainer: { alignItems: "center", justifyContent: "center", paddingVertical: 120 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 14, color: "#4b5563", fontWeight: "600" },

  dishCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#13171c",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1d242c",
  },
  dishCardUnavailable: { opacity: 0.4 },
  dishInfo: { flex: 1, marginRight: 16 },
  dishTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  dishEmoji: { fontSize: 16 },
  dishName: { fontSize: 15, fontWeight: "600", color: "#e2e8f0" },
  dishPrice: { fontSize: 14, fontWeight: "700", color: "#f97316" },

  addButton: {
    backgroundColor: "rgba(249,115,22,0.1)",
    borderWidth: 1,
    borderColor: "#f97316",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: { color: "#f97316", fontSize: 13, fontWeight: "700" },

  qtyContainer: { flexDirection: "row", alignItems: "center", gap: 12 },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#1b2229",
    borderWidth: 1,
    borderColor: "#2c3945",
    justifyContent: "center",
    alignItems: "center",
  },
  qtyBtnText: { color: "#e2e8f0", fontSize: 16, fontWeight: "700" },
  qtyText: { fontSize: 15, fontWeight: "800", color: "#f97316", minWidth: 16, textAlign: "center" },

  unavailableLabel: { fontSize: 12, color: "#ef4444", fontWeight: "600" },

  checkoutPanel: {
    backgroundColor: "#13171c",
    borderTopWidth: 1,
    borderTopColor: "#1d242c",
    padding: 16,
    gap: 12,
  },
  typeToggleRow: { flexDirection: "row", gap: 8 },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#1b2229",
    borderWidth: 1,
    borderColor: "#2c3945",
    alignItems: "center",
  },
  typeBtnActive: { backgroundColor: "rgba(249,115,22,0.1)", borderColor: "#f97316" },
  typeBtnText: { fontSize: 13, fontWeight: "600", color: "#8fa0b0" },
  typeBtnTextActive: { color: "#f97316" },

  notesInput: {
    backgroundColor: "#1b2229",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: "#e2e8f0",
    borderWidth: 1,
    borderColor: "#2c3945",
  },

  submitBtn: {
    backgroundColor: "#f97316",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitBtnContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 16,
  },
  submitBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  submitBtnPrice: { color: "#fff", fontSize: 13, fontWeight: "600" },
});
