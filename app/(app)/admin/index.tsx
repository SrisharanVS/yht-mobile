// apps/mobile/app/(app)/admin/index.tsx
// Admin screen — menu and category management.
// Calls web API to create/edit/delete, then publishes menu:updated via Ably.

import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  Modal,
  Switch,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../../../src/store/authStore";
import { useMenuStore } from "../../../src/store/menuStore";
import { publishMenuUpdated } from "../../../src/lib/ably";
import type { Category, Dish } from "@yht/shared";

// ── Category Manager ───────────────────────────────────────────────────────────

function CategoryManager() {
  const { token, webApiUrl } = useAuthStore();
  const { categories, syncFromApi } = useMenuStore();
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  async function addCategory() {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`${webApiUrl}/api/categories`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: newName.trim(), sortOrder: categories.length }),
      });
      const data = await res.json();
      if (data.success) {
        setNewName("");
        await syncFromApi();
        await publishMenuUpdated();
      } else {
        Alert.alert("Error", data.error);
      }
    } finally {
      setAdding(false);
    }
  }

  async function toggleCategory(cat: Category) {
    await fetch(`${webApiUrl}/api/categories/${cat.id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ active: !cat.active }),
    });
    await syncFromApi();
    await publishMenuUpdated();
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>📂 Categories</Text>

      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          value={newName}
          onChangeText={setNewName}
          placeholder="New category name..."
          placeholderTextColor="#525252"
          returnKeyType="done"
          onSubmitEditing={addCategory}
        />
        <TouchableOpacity
          style={[styles.addButton, (!newName.trim() || adding) && styles.buttonDisabled]}
          onPress={addCategory}
          disabled={!newName.trim() || adding}
        >
          {adding ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.addButtonText}>Add</Text>}
        </TouchableOpacity>
      </View>

      {categories.map((cat) => (
        <View key={cat.id} style={[styles.listItem, !cat.active && styles.listItemHidden]}>
          <Text style={styles.listItemName}>{cat.name}</Text>
          <TouchableOpacity
            style={[styles.pillButton, cat.active ? styles.pillHide : styles.pillShow]}
            onPress={() => toggleCategory(cat)}
          >
            <Text style={styles.pillButtonText}>{cat.active ? "Hide" : "Show"}</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

// ── Dish Form Modal ────────────────────────────────────────────────────────────

function DishFormModal({
  dish,
  onClose,
  onSave,
}: {
  dish?: Dish | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const { token, webApiUrl } = useAuthStore();
  const { categories } = useMenuStore();
  const isEdit = !!dish;

  const [name, setName] = useState(dish?.name ?? "");
  const [categoryId, setCategoryId] = useState(dish?.categoryId ?? categories[0]?.id ?? "");
  const [price, setPrice] = useState(dish?.price?.toString() ?? "");
  const [diningAvailable, setDiningAvailable] = useState(dish?.diningAvailable ?? true);
  const [takeawayAvailable, setTakeawayAvailable] = useState(dish?.takeawayAvailable ?? true);
  const [active, setActive] = useState(dish?.active ?? true);
  const [saving, setSaving] = useState(false);

  const { syncFromApi } = useMenuStore();

  async function handleSave() {
    if (!name.trim() || !categoryId || !price) {
      Alert.alert("Error", "Name, category, and price are required");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        categoryId,
        price: parseFloat(price),
        diningAvailable,
        takeawayAvailable,
        active,
      };

      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      const url = isEdit
        ? `${webApiUrl}/api/menu/${dish!.id}`
        : `${webApiUrl}/api/menu`;

      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers,
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!data.success) {
        Alert.alert("Error", data.error);
        return;
      }

      await syncFromApi();
      await publishMenuUpdated();
      onSave();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{isEdit ? "Edit Dish" : "New Dish"}</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalClose}>
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.fieldLabel}>Dish Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Egg Rice"
              placeholderTextColor="#525252"
            />

            <Text style={styles.fieldLabel}>Category *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryPills}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.categoryPill, categoryId === cat.id && styles.categoryPillActive]}
                  onPress={() => setCategoryId(cat.id)}
                >
                  <Text style={[styles.categoryPillText, categoryId === cat.id && styles.categoryPillActiveText]}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>Price (₹) *</Text>
            <TextInput
              style={styles.input}
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#525252"
            />

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>🍽️ Dining</Text>
              <Switch
                value={diningAvailable}
                onValueChange={setDiningAvailable}
                trackColor={{ false: "#2a2a2a", true: "#f59e0b" }}
                thumbColor={diningAvailable ? "#fff" : "#a3a3a3"}
              />
            </View>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>📦 Takeaway</Text>
              <Switch
                value={takeawayAvailable}
                onValueChange={setTakeawayAvailable}
                trackColor={{ false: "#2a2a2a", true: "#f59e0b" }}
                thumbColor={takeawayAvailable ? "#fff" : "#a3a3a3"}
              />
            </View>

            {isEdit && (
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Active (visible on menu)</Text>
                <Switch
                  value={active}
                  onValueChange={setActive}
                  trackColor={{ false: "#2a2a2a", true: "#f59e0b" }}
                  thumbColor={active ? "#fff" : "#a3a3a3"}
                />
              </View>
            )}

            <TouchableOpacity
              style={[styles.saveButton, saving && styles.buttonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>
                  {isEdit ? "Save Changes" : "Create Dish"}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Dish Manager ───────────────────────────────────────────────────────────────

function DishManager() {
  const { token, webApiUrl } = useAuthStore();
  const { dishes, categories, syncFromApi } = useMenuStore();
  const [showForm, setShowForm] = useState(false);
  const [editingDish, setEditingDish] = useState<Dish | null>(null);
  const [filterCat, setFilterCat] = useState("all");

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  async function toggleDish(dish: Dish) {
    await fetch(`${webApiUrl}/api/menu/${dish.id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ active: !dish.active }),
    });
    await syncFromApi();
    await publishMenuUpdated();
  }

  const filtered = filterCat === "all" ? dishes : dishes.filter((d) => d.categoryId === filterCat);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>🍽️ Menu Items</Text>
        <TouchableOpacity
          style={styles.addButtonSmall}
          onPress={() => { setEditingDish(null); setShowForm(true); }}
        >
          <Text style={styles.addButtonSmallText}>+ Add Dish</Text>
        </TouchableOpacity>
      </View>

      {/* Category filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterPill, filterCat === "all" && styles.filterPillActive]}
          onPress={() => setFilterCat("all")}
        >
          <Text style={[styles.filterPillText, filterCat === "all" && styles.filterPillActiveText]}>All</Text>
        </TouchableOpacity>
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={[styles.filterPill, filterCat === cat.id && styles.filterPillActive]}
            onPress={() => setFilterCat(cat.id)}
          >
            <Text style={[styles.filterPillText, filterCat === cat.id && styles.filterPillActiveText]}>
              {cat.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {filtered.map((dish) => (
        <View key={dish.id} style={[styles.listItem, !dish.active && styles.listItemHidden]}>
          <View style={styles.dishInfo}>
            <View style={styles.dishTitleRow}>
              <Text style={styles.listItemName}>{dish.name}</Text>
              {!dish.active && <Text style={styles.hiddenBadge}>Hidden</Text>}
            </View>
            <View style={styles.dishMeta}>
              <Text style={styles.dishPrice}>₹{dish.price}</Text>
              <Text style={styles.dishCategory}>{dish.category?.name}</Text>
              {dish.diningAvailable && <Text style={styles.dishAvail}>🍽️</Text>}
              {dish.takeawayAvailable && <Text style={styles.dishAvail}>📦</Text>}
            </View>
          </View>
          <View style={styles.dishActions}>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => { setEditingDish(dish); setShowForm(true); }}
            >
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pillButton, dish.active ? styles.pillHide : styles.pillShow]}
              onPress={() => toggleDish(dish)}
            >
              <Text style={styles.pillButtonText}>{dish.active ? "Hide" : "Show"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {(showForm || editingDish) && (
        <DishFormModal
          dish={editingDish}
          onClose={() => { setShowForm(false); setEditingDish(null); }}
          onSave={() => { setShowForm(false); setEditingDish(null); }}
        />
      )}
    </View>
  );
}

// ── Main Admin Screen ──────────────────────────────────────────────────────────

type AdminTab = "dishes" | "categories";

export default function AdminScreen() {
  const [tab, setTab] = useState<AdminTab>("dishes");
  const { syncFromApi, isSyncing } = useMenuStore();
  const { user } = useAuthStore();

  useEffect(() => {
    syncFromApi();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerLogo}>YHT</Text>
          <Text style={styles.headerTitle}>Admin Panel</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.headerUsername}>{user?.username}</Text>
          {isSyncing && <ActivityIndicator color="#f59e0b" size="small" />}
        </View>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === "dishes" && styles.tabActive]}
          onPress={() => setTab("dishes")}
        >
          <Text style={[styles.tabText, tab === "dishes" && styles.tabTextActive]}>🍽️ Dishes</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "categories" && styles.tabActive]}
          onPress={() => setTab("categories")}
        >
          <Text style={[styles.tabText, tab === "categories" && styles.tabTextActive]}>📂 Categories</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {tab === "dishes" && <DishManager />}
        {tab === "categories" && <CategoryManager />}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a2a",
    backgroundColor: "#111111",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerLogo: { fontSize: 20, fontWeight: "900", color: "#f59e0b", letterSpacing: 1 },
  headerTitle: { fontSize: 13, fontWeight: "600", color: "#a3a3a3" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerUsername: { fontSize: 13, color: "#a3a3a3" },

  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: "#111111",
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a2a",
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  tabActive: { backgroundColor: "#f59e0b", borderColor: "transparent" },
  tabText: { fontSize: 13, fontWeight: "600", color: "#a3a3a3" },
  tabTextActive: { color: "#fff" },

  content: { flex: 1, padding: 16 },

  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#f5f5f5" },

  addRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  input: {
    flex: 1,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: "#f5f5f5",
  },
  addButton: {
    backgroundColor: "#f59e0b",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 60,
  },
  addButtonSmall: {
    backgroundColor: "#f59e0b",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  addButtonSmallText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  addButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  buttonDisabled: { backgroundColor: "#2a2a2a" },

  listItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#111111",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  listItemHidden: { opacity: 0.5 },
  listItemName: { fontSize: 14, fontWeight: "600", color: "#f5f5f5" },

  pillButton: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  pillHide: { backgroundColor: "rgba(239,68,68,0.15)", borderWidth: 1, borderColor: "rgba(239,68,68,0.3)" },
  pillShow: { backgroundColor: "rgba(34,197,94,0.15)", borderWidth: 1, borderColor: "rgba(34,197,94,0.3)" },
  pillButtonText: { fontSize: 11, fontWeight: "600", color: "#a3a3a3" },

  dishInfo: { flex: 1 },
  dishTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  hiddenBadge: { fontSize: 10, color: "#ef4444", backgroundColor: "rgba(239,68,68,0.1)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  dishMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  dishPrice: { fontSize: 13, fontWeight: "700", color: "#f59e0b" },
  dishCategory: { fontSize: 11, color: "#525252" },
  dishAvail: { fontSize: 12 },
  dishActions: { flexDirection: "row", gap: 6 },
  editButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "rgba(245,158,11,0.15)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.3)",
  },
  editButtonText: { fontSize: 11, fontWeight: "600", color: "#f59e0b" },

  filterRow: { marginBottom: 12 },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    marginRight: 6,
  },
  filterPillActive: { backgroundColor: "#f59e0b", borderColor: "transparent" },
  filterPillText: { fontSize: 12, fontWeight: "600", color: "#a3a3a3" },
  filterPillActiveText: { color: "#fff" },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: "#111111",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: "90%",
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#f5f5f5" },
  modalClose: { width: 32, height: 32, borderRadius: 8, backgroundColor: "#1a1a1a", justifyContent: "center", alignItems: "center" },
  modalCloseText: { fontSize: 16, color: "#a3a3a3" },
  fieldLabel: { fontSize: 13, fontWeight: "500", color: "#a3a3a3", marginBottom: 6, marginTop: 12 },
  categoryPills: { marginBottom: 4 },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    marginRight: 8,
  },
  categoryPillActive: { backgroundColor: "#f59e0b", borderColor: "transparent" },
  categoryPillText: { fontSize: 13, fontWeight: "600", color: "#a3a3a3" },
  categoryPillActiveText: { color: "#fff" },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 16 },
  toggleLabel: { fontSize: 14, color: "#f5f5f5" },
  saveButton: {
    marginTop: 24,
    backgroundColor: "#f59e0b",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 8,
  },
  saveButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
