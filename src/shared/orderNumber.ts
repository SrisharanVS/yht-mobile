// @yht/shared — Order Number Generation (pure, no DB dependency)
// Accepts a Set<number> of currently active order numbers and generates a unique one.
// The caller (web API or mobile app) is responsible for building the set.

import {
  ORDER_NUMBER_MIN,
  ORDER_NUMBER_MAX,
  ORDER_NUMBER_MAX_RETRIES,
} from "./constants";

/**
 * Generate a unique 3-digit order number (100–999) from a set of used numbers.
 *
 * Strategy:
 *  1. Try random picks up to ORDER_NUMBER_MAX_RETRIES times (fast path)
 *  2. Fall back to deterministic sequential scan (guaranteed to find a free slot)
 *  3. Throws if the entire pool (900 numbers) is exhausted
 *
 * @param usedNumbers  Set of order numbers already active in the current window.
 *                     Web: queried from PostgreSQL. Mobile: queried from SQLite.
 */
export function generateOrderNumberFromSet(usedNumbers: Set<number>): number {
  const totalPossible = ORDER_NUMBER_MAX - ORDER_NUMBER_MIN + 1;

  if (usedNumbers.size >= totalPossible) {
    throw new Error(
      "Order number pool exhausted — too many concurrent orders in the 15-minute window"
    );
  }

  // Fast path: random pick
  for (let attempt = 0; attempt < ORDER_NUMBER_MAX_RETRIES; attempt++) {
    const candidate =
      Math.floor(Math.random() * totalPossible) + ORDER_NUMBER_MIN;
    if (!usedNumbers.has(candidate)) {
      return candidate;
    }
  }

  // Deterministic fallback — only reached at >90% pool saturation
  for (let n = ORDER_NUMBER_MIN; n <= ORDER_NUMBER_MAX; n++) {
    if (!usedNumbers.has(n)) {
      return n;
    }
  }

  throw new Error("Could not generate a unique order number after exhaustive scan");
}
