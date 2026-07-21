import { nanoid, customAlphabet } from 'nanoid';

const refAlphabet = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6); // no 0/O/1/I ambiguity

/**
 * Generates a prefixed, collision-resistant ID, e.g. `id('u')` -> "u_V1StGXR8".
 * Mirrors the old mock engine's `prefix_n` id style closely enough that
 * existing frontend assumptions about ID *shape* (a short opaque string)
 * keep holding, while actually being globally unique instead of a counter.
 */
export function id(prefix: string): string {
  return `${prefix}_${nanoid(14)}`;
}

/** Generates a human-friendly booking reference, e.g. "ZZ-7K2QXA". */
export function bookingRef(): string {
  return `ZZ-${refAlphabet()}`;
}
