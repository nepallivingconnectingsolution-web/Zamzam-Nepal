/** Uppercase, alphanumerics only, so "ba-99-pa-1234" and "BA 99 PA 1234" compare equal. */
export function normalizePlate(input: string): string {
  return (input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Nepal plates: province/zone letters, 1-3 digits, series letters, 1-4 digits
 * (e.g. BA 99 PA 1234, BA 1 KHA 1234, LU 1 PA 123). Takes the already
 * normalized value; a value containing separators is rejected.
 */
const NEPAL_PLATE = /^[A-Z]{1,3}\d{1,3}[A-Z]{1,4}\d{1,4}$/;

export function isValidNepalPlate(normalized: string): boolean {
  return NEPAL_PLATE.test(normalized);
}
