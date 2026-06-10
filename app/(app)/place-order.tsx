// apps/mobile/app/(app)/place-order.tsx
// Place Order screen — allows vendors to place orders directly from the KDS.
// Fetches active dishes from the Admin menu cache and submits to the API.
// Supports item-level selection of Dine In / Takeaway, splitting into separate orders on submission.

import { useEffect, useState } from "react";
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
import { useAuthStore } from "../../src/store/authStore";
import { useMenuStore } from "../../src/store/menuStore";
import { useOrdersStore } from "../../src/store/ordersStore";
import { acceptOrder } from "../../src/lib/orderService";
import { router } from "expo-router";

interface CartItem {
  dining: number;
  takeaway: number;
}

function getDishDetails(dishName: string) {
  const match = dishName.match(/^([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])\s*(.*)$/);
  if (match) {
    return { emoji: match[1], cleanName: match[2] };
  }
  return { emoji: "🍛", cleanName: dishName };
}

export default function PlaceOrderScreen() {
  const { token, webApiUrl } = useAuthStore();
  const { dishes, categories, loadFromDb, syncFromApi } = useMenuStore();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [cart, setCart] = useState<Record<string, CartItem>>({});
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

  const totalItems = Object.values(cart).reduce(
    (sum, item) => sum + item.dining + item.takeaway,
    0
  );

  const totalPrice = Object.entries(cart).reduce((sum, [dishId, item]) => {
    const dish = dishes.find((d) => d.id === dishId);
    if (!dish) return sum;
    const itemPrice = Number(dish.price);
    return sum + itemPrice * (item.dining + item.takeaway);
  }, 0);

  const addToCart = (dishId: string, type: "dining" | "takeaway") => {
    setCart((prev) => {
      const current = prev[dishId] ?? { dining: 0, takeaway: 0 };
      return {
        ...prev,
        [dishId]: {
          ...current,
          [type]: current[type] + 1,
        },
      };
    });
  };

  const removeFromCart = (dishId: string, type: "dining" | "takeaway") => {
    setCart((prev) => {
      const current = prev[dishId];
      if (!current) return prev;
      const copy = { ...prev };
      const newQty = Math.max(0, current[type] - 1);
      const updated = {
        ...current,
        [type]: newQty,
      };

      if (updated.dining === 0 && updated.takeaway === 0) {
        delete copy[dishId];
      } else {
        copy[dishId] = updated;
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
      const diningItems = Object.entries(cart)
        .filter(([_, item]) => item.dining > 0)
        .map(([dishId, item]) => ({ dishId, quantity: item.dining }));

      const takeawayItems = Object.entries(cart)
        .filter(([_, item]) => item.takeaway > 0)
        .map(([dishId, item]) => ({ dishId, quantity: item.takeaway }));

      const baseDeviceId = `vendor-pos-${Date.now()}`;
      const placedOrders: string[] = [];

      // 1. Submit Dine In Order if there are items
      if (diningItems.length > 0) {
        const res = await fetch(`${webApiUrl}/api/orders`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            deviceId: baseDeviceId,
            type: "DINING",
            notes: notes.trim() || null,
            items: diningItems,
          }),
        });

        const data = await res.json();
        if (data.success) {
          const orderData = data.data;
          useOrdersStore.getState().addOrder(orderData);
          await acceptOrder(Number(orderData.orderNumber));
          placedOrders.push(`#${orderData.orderNumber} (Dine In)`);
        } else {
          Alert.alert("Error", data.error || "Failed to place Dine In order");
          setPlacing(false);
          return;
        }
      }

      // 2. Submit Takeaway Order if there are items
      if (takeawayItems.length > 0) {
        const res = await fetch(`${webApiUrl}/api/orders`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            deviceId: `${baseDeviceId}-takeaway`,
            type: "TAKEAWAY",
            notes: notes.trim() || null,
            items: takeawayItems,
          }),
        });

        const data = await res.json();
        if (data.success) {
          const orderData = data.data;
          useOrdersStore.getState().addOrder(orderData);
          await acceptOrder(Number(orderData.orderNumber));
          placedOrders.push(`#${orderData.orderNumber} (Takeaway)`);
        } else {
          Alert.alert("Error", data.error || "Failed to place Takeaway order");
          setPlacing(false);
          return;
        }
      }

      Alert.alert(
        "Success",
        `Placed & accepted orders:\n${placedOrders.join("\n")}`,
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

      {/* Categories Selector */}
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

      {/* Main layout */}
      <View style={styles.mainLayout}>
        <ScrollView style={styles.dishesList} contentContainerStyle={styles.dishesContent}>
          {filteredDishes.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>🍽️</Text>
              <Text style={styles.emptyText}>No active dishes in this category</Text>
            </View>
          ) : (
            filteredDishes.map((dish) => {
              const item = cart[dish.id] ?? { dining: 0, takeaway: 0 };
              const { emoji, cleanName } = getDishDetails(dish.name);

              return (
                <View key={dish.id} style={styles.dishCard}>
                  <View style={styles.dishInfo}>
                    <View style={styles.dishTitleRow}>
                      <Text style={styles.dishEmoji}>{emoji}</Text>
                      <Text style={styles.dishName}>{cleanName}</Text>
                    </View>
                    <Text style={styles.dishPrice}>₹{dish.price}</Text>
                  </View>

                  <View style={styles.controlsSection}>
                    {/* Dine In Controls */}
                    {dish.diningAvailable && (
                      <View style={styles.controlRow}>
                        <Text style={styles.controlTypeLabel}>🍽️ Dine</Text>
                        {item.dining === 0 ? (
                          <TouchableOpacity
                            style={styles.smallAddBtn}
                            onPress={() => addToCart(dish.id, "dining")}
                          >
                            <Text style={styles.smallAddBtnText}>+ Add</Text>
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.qtyContainer}>
                            <TouchableOpacity
                              style={styles.qtyBtn}
                              onPress={() => removeFromCart(dish.id, "dining")}
                            >
                              <Text style={styles.qtyBtnText}>−</Text>
                            </TouchableOpacity>
                            <Text style={styles.qtyText}>{item.dining}</Text>
                            <TouchableOpacity
                              style={styles.qtyBtn}
                              onPress={() => addToCart(dish.id, "dining")}
                            >
                              <Text style={styles.qtyBtnText}>+</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    )}

                    {/* Takeaway Controls */}
                    {dish.takeawayAvailable && (
                      <View style={[styles.controlRow, dish.diningAvailable && { marginTop: 8 }]}>
                        <Text style={styles.controlTypeLabel}>📦 Take</Text>
                        {item.takeaway === 0 ? (
                          <TouchableOpacity
                            style={styles.smallAddBtn}
                            onPress={() => addToCart(dish.id, "takeaway")}
                          >
                            <Text style={styles.smallAddBtnText}>+ Add</Text>
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.qtyContainer}>
                            <TouchableOpacity
                              style={styles.qtyBtn}
                              onPress={() => removeFromCart(dish.id, "takeaway")}
                            >
                              <Text style={styles.qtyBtnText}>−</Text>
                            </TouchableOpacity>
                            <Text style={styles.qtyText}>{item.takeaway}</Text>
                            <TouchableOpacity
                              style={styles.qtyBtn}
                              onPress={() => addToCart(dish.id, "takeaway")}
                            >
                              <Text style={styles.qtyBtnText}>+</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    )}

                    {!dish.diningAvailable && !dish.takeawayAvailable && (
                      <Text style={styles.unavailableLabel}>Unavailable</Text>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Sticky footer checkout panel */}
        {totalItems > 0 && (
          <View style={styles.checkoutPanel}>
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
  dishInfo: { flex: 1, marginRight: 16 },
  dishTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  dishEmoji: { fontSize: 16 },
  dishName: { fontSize: 15, fontWeight: "600", color: "#e2e8f0" },
  dishPrice: { fontSize: 14, fontWeight: "700", color: "#f97316" },

  controlsSection: {
    flexDirection: "column",
    alignItems: "flex-end",
    minWidth: 150,
  },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  controlTypeLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#8fa0b0",
    marginRight: 8,
  },
  smallAddBtn: {
    backgroundColor: "rgba(249,115,22,0.1)",
    borderWidth: 1,
    borderColor: "#f97316",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: 64,
    alignItems: "center",
  },
  smallAddBtnText: { color: "#f97316", fontSize: 11, fontWeight: "700" },

  qtyContainer: { flexDirection: "row", alignItems: "center", gap: 6 },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "#1b2229",
    borderWidth: 1,
    borderColor: "#2c3945",
    justifyContent: "center",
    alignItems: "center",
  },
  qtyBtnText: { color: "#e2e8f0", fontSize: 14, fontWeight: "700" },
  qtyText: { fontSize: 14, fontWeight: "800", color: "#f97316", minWidth: 14, textAlign: "center" },

  unavailableLabel: { fontSize: 12, color: "#ef4444", fontWeight: "600" },

  checkoutPanel: {
    backgroundColor: "#13171c",
    borderTopWidth: 1,
    borderTopColor: "#1d242c",
    padding: 16,
    gap: 12,
  },
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
