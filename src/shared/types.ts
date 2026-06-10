// @yht/shared — Types
// Shared TypeScript types used by both web (Next.js) and mobile (Expo) apps.
// No runtime dependencies — pure type definitions.

// ── Enums / Unions ────────────────────────────────────────────────────────────

export type UserRole = "VENDOR" | "ADMIN";

export type RestaurantStatus = "ACTIVE" | "SUSPENDED" | "TRIAL";

export interface Restaurant {
  id: string;
  name: string;
  status: RestaurantStatus;
}

export type OrderStatus =
  | "PENDING_ACCEPTANCE"
  | "ACTIVE"
  | "PARTIALLY_COMPLETED"
  | "COMPLETED"
  | "EXPIRED"
  | "REJECTED";

export type OrderType = "DINING" | "TAKEAWAY";

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface JWTPayload {
  userId: string;
  username: string;
  role: UserRole;
  restaurantId: string;
  iat?: number;
  exp?: number;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    username: string;
    role: UserRole;
  };
  restaurant: Restaurant;
}

// ── Menu ──────────────────────────────────────────────────────────────────────

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
  createdAt: string;
}

export interface Dish {
  id: string;
  name: string;
  categoryId: string;
  category?: Category;
  price: number; // Decimal serialized as number
  diningAvailable: boolean;
  takeawayAvailable: boolean;
  imageUrl?: string | null;
  imagePath?: string | null;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ── Orders ────────────────────────────────────────────────────────────────────

export interface OrderItem {
  id: string;
  orderId: string;
  dishId: string;
  dishName: string; // Denormalized for local-first storage (no join needed)
  dish?: Dish;
  quantity: number;
  completed: boolean;
  completedAt?: string | null;
}

export interface Order {
  id: string;
  orderNumber: number;
  deviceId: string;
  status: OrderStatus;
  type: OrderType;
  notes?: string | null;
  createdAt: string;
  acceptedAt?: string | null;
  completedAt?: string | null;
  expiresAt: string;
  items: OrderItem[];
}

// ── Local-first (Mobile SQLite) order shapes ──────────────────────────────────
// These map directly to the SQLite row format used by the mobile app.

export interface LocalOrder {
  id: string;
  order_number: number;
  device_id: string;
  status: OrderStatus;
  type: OrderType;
  notes: string | null;
  created_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  expires_at: string;
}

export interface LocalOrderItem {
  id: string;
  order_id: string;
  dish_id: string;
  dish_name: string;
  quantity: number;
  completed: number; // 0 | 1 (SQLite integer bool)
  completed_at: string | null;
}

// ── Cart (client-side web only) ───────────────────────────────────────────────

export interface CartItem {
  dishId: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string | null;
}

// ── Cumulative Dashboard ──────────────────────────────────────────────────────

export interface CumulativeItem {
  dishId: string;
  dishName: string;
  diningCount: number;
  takeawayCount: number;
  totalCount: number;
}

// ── Ably Real-time Events ─────────────────────────────────────────────────────

/**
 * Events on the "orders" channel (formerly "kitchen"):
 *   order:new        — customer placed an order
 *   order:accepted   — vendor accepted (keypad entry)
 *   order:item_completed — vendor checked off one item
 *   order:completed  — all items done
 *   order:expired    — TTL elapsed without acceptance
 *   order:rejected   — vendor explicitly rejected
 *
 * Events on the "menu" channel:
 *   menu:updated     — admin changed menu/categories
 *
 * Events on the "admin" channel:
 *   admin:announcement — broadcast from admin
 */
export type AblyEventType =
  | "order:new"
  | "order:accepted"
  | "order:item_completed"
  | "order:completed"
  | "order:expired"
  | "order:rejected"
  | "cumulative:update"
  | "menu:updated"
  | "admin:announcement";

export interface AblyMessage<T = unknown> {
  event: AblyEventType;
  data: T;
}

// ── Payloads published over Ably ──────────────────────────────────────────────

/** Payload for order:new — full order with items (published by web API) */
export type NewOrderPayload = Order;

/** Payload for order:accepted, order:item_completed, order:completed */
export interface OrderStatusPayload {
  orderId: string;
  orderNumber: number;
  status: OrderStatus;
  itemId?: string;
  completed?: boolean;
}

// ── API Responses ─────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ── Anti-abuse ────────────────────────────────────────────────────────────────

export interface AbuseCheckResult {
  allowed: boolean;
  reason?: "BANNED" | "TOO_MANY_ACTIVE" | "RATE_LIMITED";
  banExpiresAt?: string;
}
