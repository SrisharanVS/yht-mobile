// @yht/shared — Application-wide constants
// Used by both web (Next.js) and mobile (Expo) apps.

export const APP_NAME = "YHT Thatuvadai Set";
export const SHOP_SLUG = "yht";

// ── Order lifecycle ────────────────────────────────────────────────────────────

/** How long a PENDING_ACCEPTANCE order stays alive (milliseconds) */
export const ORDER_ACCEPTANCE_TTL_MS = 3 * 60 * 1000; // 3 minutes

/** How long a device ban lasts after 3 consecutive expired orders */
export const DEVICE_BAN_DURATION_MS = 60 * 60 * 1000; // 1 hour

/** Maximum active (accepted) orders allowed per device simultaneously */
export const MAX_ACTIVE_ORDERS_PER_DEVICE = 3;

/** Consecutive expired orders before triggering a ban */
export const ABUSE_THRESHOLD = 3;

/** 3-digit order number range */
export const ORDER_NUMBER_MIN = 100;
export const ORDER_NUMBER_MAX = 999;

/** Window within which order numbers must be unique (milliseconds) */
export const ORDER_NUMBER_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/** Max random retries when generating a collision-safe order number */
export const ORDER_NUMBER_MAX_RETRIES = 10;

// ── Ably channel names ─────────────────────────────────────────────────────────

/** All kitchen/vendor clients subscribe to this (renamed from "kitchen") */
export const ABLY_ORDERS_CHANNEL = "orders";

/** Menu update events — admin changes propagate to mobile app */
export const ABLY_MENU_CHANNEL = "menu";

/** Admin broadcast channel */
export const ABLY_ADMIN_CHANNEL = "admin";

/** Per-order channel prefix — clients subscribe to `order:{orderId}` */
export const ABLY_ORDER_CHANNEL_PREFIX = "order";

// ── UI timing ─────────────────────────────────────────────────────────────────

/** How long a completed order card stays visible before fading (ms) */
export const COMPLETED_ORDER_FADE_MS = 5000;

/** Interval for auto-expiring old pending orders on the dashboard (ms) */
export const EXPIRY_CHECK_INTERVAL_MS = 30 * 1000; // 30 seconds
