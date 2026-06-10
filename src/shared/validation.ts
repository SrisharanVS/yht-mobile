// @yht/shared — Order validation (pure functions, no I/O)

import type { OrderType, CartItem } from "./types";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate the order type field.
 */
export function validateOrderType(type: string): ValidationResult {
  if (!["DINING", "TAKEAWAY"].includes(type)) {
    return { valid: false, error: "type must be DINING or TAKEAWAY" };
  }
  return { valid: true };
}

/**
 * Validate a cart before placing an order.
 */
export function validateCart(items: CartItem[], type: OrderType): ValidationResult {
  if (!items || items.length === 0) {
    return { valid: false, error: "Cart is empty" };
  }

  for (const item of items) {
    if (item.quantity < 1) {
      return { valid: false, error: `Invalid quantity for ${item.name}` };
    }
  }

  return { valid: true };
}

/**
 * Validate a device ID (non-empty string).
 */
export function validateDeviceId(deviceId: unknown): ValidationResult {
  if (!deviceId || typeof deviceId !== "string" || deviceId.trim().length === 0) {
    return { valid: false, error: "deviceId is required" };
  }
  return { valid: true };
}
