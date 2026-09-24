import { and, eq } from 'drizzle-orm';
import { vehicles } from '../../database/schema';
import { apiError } from '../../common/exceptions';
import type { DbExecutor } from './db-types';
import { isValidNepalPlate, normalizePlate } from './plate.util';

/**
 * Normalizes the plate and rejects it when another ACTIVE vehicle already has
 * it. This gives a friendly message; the partial unique index on
 * vehicles.plate_normalized is the real guarantee under concurrency.
 *
 * The Nepal format rule applies to bike/car only, so existing freight plates
 * are never blocked by it.
 */
export async function assertPlateUsable(
  db: DbExecutor,
  category: string,
  plateNumber: string,
  exceptVehicleId?: string,
): Promise<string> {
  const normalized = normalizePlate(plateNumber);
  if ((category === 'bike' || category === 'car') && !isValidNepalPlate(normalized)) {
    apiError(400, 'Enter a valid number plate, for example BA 99 PA 1234.', 'INVALID_PLATE');
  }
  const [existing] = await db
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(and(eq(vehicles.plateNormalized, normalized), eq(vehicles.isActive, true)))
    .limit(1);
  if (existing && existing.id !== exceptVehicleId) {
    apiError(409, 'A vehicle with this number plate is already registered.', 'PLATE_TAKEN');
  }
  return normalized;
}
