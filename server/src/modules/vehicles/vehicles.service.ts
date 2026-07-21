import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import { auditLogs, driverStatus, users, vehicles } from '../../database/schema';
import { apiError } from '../../common/exceptions';
import { id } from '../../common/id';
import { NotificationsService } from '../notifications/notifications.service';
import type { RegisterVehicleDto, UpdateVehicleDto, VehicleCategory } from './dto/vehicles.dto.ts';

/**
 * Which marketplace services each vehicle category can serve. This is the
 * capacity/fit rule from the architecture doc, kept in code (not schema) so
 * it can evolve without a migration. Used by the nearby-matching query in
 * Batch 3 and shown to drivers so they know what work a vehicle unlocks.
 */
export const CATEGORY_SERVICES: Record<VehicleCategory, string[]> = {
  bike: ['bike', 'parcel'],
  car: ['taxi', 'parcel'],
  van: ['parcel', 'freight'],
  mini_truck: ['parcel', 'freight'],
  truck: ['freight'],
};

/**
 * Inverse of CATEGORY_SERVICES: for a requested service, which vehicle
 * categories can serve it. Derived (not hand-written) so the two mappings
 * can never drift apart.
 */
export const SERVICE_CATEGORIES: Record<string, VehicleCategory[]> = Object.entries(
  CATEGORY_SERVICES,
).reduce<Record<string, VehicleCategory[]>>((acc, [category, services]) => {
  for (const service of services) {
    (acc[service] ??= []).push(category as VehicleCategory);
  }
  return acc;
}, {});

/** Default carrying capacity (kg) per category when the driver doesn't specify. */
const DEFAULT_MAX_WEIGHT_KG: Record<VehicleCategory, number> = {
  bike: 20,
  car: 100,
  van: 800,
  mini_truck: 1500,
  truck: 10000,
};

@Injectable()
export class VehiclesService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly notifications: NotificationsService,
  ) {}

  /* ─────────────────────── Driver / transporter side ─────────────────────── */

  async register(driverId: string, dto: RegisterVehicleDto) {
    // Plate numbers are globally unique (uniqueIndex in schema) — check first
    // so the driver gets a friendly message instead of a raw constraint error.
    const [existing] = await this.db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(eq(vehicles.plateNumber, dto.plateNumber))
      .limit(1);
    if (existing) apiError(409, 'A vehicle with this plate number is already registered.');

    const [row] = await this.db
      .insert(vehicles)
      .values({
        id: id('veh'),
        driverId,
        category: dto.category,
        makeModel: dto.makeModel,
        plateNumber: dto.plateNumber,
        color: dto.color ?? null,
        maxWeightKg: dto.maxWeightKg ?? DEFAULT_MAX_WEIGHT_KG[dto.category],
        seats: dto.seats ?? (dto.category === 'bike' ? 1 : 4),
        photoRef: dto.photoRef ?? null,
        documentRef: dto.documentRef ?? null,
        // Every new vehicle starts PENDING — same trust model as partner KYC.
      })
      .returning();

    await this.notifications.notify({
      type: 'system',
      title: 'New vehicle awaiting verification',
      message: `${dto.makeModel} (${dto.plateNumber}) was registered and needs document review.`,
      entityType: 'vehicle',
      entityId: row.id,
    });

    return this.toDto(row);
  }

  async mine(driverId: string) {
    const rows = await this.db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.driverId, driverId), eq(vehicles.isActive, true)))
      .orderBy(desc(vehicles.createdAt));

    const [status] = await this.db
      .select({ activeVehicleId: driverStatus.activeVehicleId })
      .from(driverStatus)
      .where(eq(driverStatus.userId, driverId))
      .limit(1);

    const activeId = status?.activeVehicleId ?? null;
    return rows.map((r) => ({ ...this.toDto(r), isCurrentVehicle: r.id === activeId }));
  }

  async update(driverId: string, vehicleId: string, dto: UpdateVehicleDto) {
    const vehicle = await this.ownedVehicleOrFail(driverId, vehicleId);

    if (dto.plateNumber && dto.plateNumber !== vehicle.plateNumber) {
      const [existing] = await this.db
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(eq(vehicles.plateNumber, dto.plateNumber))
        .limit(1);
      if (existing) apiError(409, 'A vehicle with this plate number is already registered.');
    }

    // Identity-defining fields changed → the admin's earlier approval no
    // longer applies, so verification drops back to PENDING (cosmetic edits
    // like color/photo don't).
    const identityChanged =
      (dto.plateNumber !== undefined && dto.plateNumber !== vehicle.plateNumber) ||
      (dto.category !== undefined && dto.category !== vehicle.category) ||
      (dto.documentRef !== undefined && dto.documentRef !== vehicle.documentRef);

    const [row] = await this.db
      .update(vehicles)
      .set({
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.makeModel !== undefined ? { makeModel: dto.makeModel } : {}),
        ...(dto.plateNumber !== undefined ? { plateNumber: dto.plateNumber } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.maxWeightKg !== undefined ? { maxWeightKg: dto.maxWeightKg } : {}),
        ...(dto.seats !== undefined ? { seats: dto.seats } : {}),
        ...(dto.photoRef !== undefined ? { photoRef: dto.photoRef } : {}),
        ...(dto.documentRef !== undefined ? { documentRef: dto.documentRef } : {}),
        ...(identityChanged ? { verificationStatus: 'PENDING' as const } : {}),
        updatedAt: new Date(),
      })
      .where(eq(vehicles.id, vehicleId))
      .returning();

    // A vehicle that just lost its APPROVED badge can't stay the active one.
    if (identityChanged) await this.clearIfActive(driverId, vehicleId);

    return this.toDto(row);
  }

  /**
   * Makes this the driver's active vehicle — the one nearby-matching (Batch 3)
   * advertises. Only APPROVED vehicles qualify: this is the "Verified" gate
   * from the architecture doc's four availability conditions.
   */
  async setActive(driverId: string, vehicleId: string) {
    const vehicle = await this.ownedVehicleOrFail(driverId, vehicleId);
    if (vehicle.verificationStatus !== 'APPROVED') {
      apiError(400, 'This vehicle is not verified yet. It can be selected once an admin approves it.');
    }

    await this.db
      .insert(driverStatus)
      .values({ userId: driverId, online: false, activeVehicleId: vehicleId })
      .onConflictDoUpdate({
        target: driverStatus.userId,
        set: { activeVehicleId: vehicleId, updatedAt: new Date() },
      });

    return { ok: true, activeVehicleId: vehicleId };
  }

  /** Soft delete: hides the vehicle and detaches it if it was active. */
  async remove(driverId: string, vehicleId: string) {
    await this.ownedVehicleOrFail(driverId, vehicleId);
    await this.db
      .update(vehicles)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(vehicles.id, vehicleId));
    await this.clearIfActive(driverId, vehicleId);
    return { ok: true };
  }

  /* ───────────────────────────── Super admin side ─────────────────────────── */

  async adminList(status?: 'PENDING' | 'APPROVED' | 'SUSPENDED') {
    const rows = await this.db
      .select({
        vehicle: vehicles,
        driverName: users.name,
        driverMobile: users.mobile,
      })
      .from(vehicles)
      .innerJoin(users, eq(vehicles.driverId, users.id))
      .where(
        status
          ? and(eq(vehicles.isActive, true), eq(vehicles.verificationStatus, status))
          : eq(vehicles.isActive, true),
      )
      .orderBy(desc(vehicles.createdAt));

    return rows.map((r) => ({
      ...this.toDto(r.vehicle),
      driverName: r.driverName,
      driverMobile: r.driverMobile,
    }));
  }

  async adminVerify(superAdminId: string, vehicleId: string, status: 'APPROVED' | 'SUSPENDED') {
    const [vehicle] = await this.db
      .select()
      .from(vehicles)
      .where(eq(vehicles.id, vehicleId))
      .limit(1);
    if (!vehicle) apiError(404, 'Vehicle not found.');

    await this.db
      .update(vehicles)
      .set({ verificationStatus: status, updatedAt: new Date() })
      .where(eq(vehicles.id, vehicleId));

    // A suspended vehicle must immediately leave the matching pool.
    if (status === 'SUSPENDED') await this.clearIfActive(vehicle.driverId, vehicleId);

    await this.db.insert(auditLogs).values({
      id: id('audit'),
      actorId: superAdminId,
      actorType: 'super_admin',
      action: `super_admin.vehicle.${status.toLowerCase()}`,
      targetType: 'vehicle',
      targetId: vehicleId,
    });

    return { ok: true };
  }

  /* ───────────────────────────── Helpers ─────────────────────────────────── */

  private async ownedVehicleOrFail(driverId: string, vehicleId: string) {
    const [vehicle] = await this.db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, vehicleId), eq(vehicles.driverId, driverId), eq(vehicles.isActive, true)))
      .limit(1);
    if (!vehicle) apiError(404, 'Vehicle not found.');
    return vehicle;
  }

  private async clearIfActive(driverId: string, vehicleId: string) {
    await this.db
      .update(driverStatus)
      .set({ activeVehicleId: null, updatedAt: new Date() })
      .where(and(eq(driverStatus.userId, driverId), eq(driverStatus.activeVehicleId, vehicleId)));
  }

  private toDto(row: typeof vehicles.$inferSelect) {
    return {
      id: row.id,
      driverId: row.driverId,
      category: row.category,
      services: CATEGORY_SERVICES[row.category],
      makeModel: row.makeModel,
      plateNumber: row.plateNumber,
      color: row.color,
      maxWeightKg: row.maxWeightKg,
      seats: row.seats,
      photoRef: row.photoRef,
      documentRef: row.documentRef,
      verificationStatus: row.verificationStatus,
      createdAt: row.createdAt.toISOString(),
    };
  }
}