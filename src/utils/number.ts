/**
 * Why: Single source of truth for decimal rounding used by billing/import math.
 * When: Anywhere money/quantity is rounded to 2 decimals.
 * Where: Shared util (previously duplicated in controllers and tenant-context).
 * How: Adds a tiny epsilon before rounding to counter float artifacts
 *      (e.g. 1.005 -> 1 instead of 1.01).
 */
export function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/** Short alias used across billing / import modules. */
export const r2 = round2;
