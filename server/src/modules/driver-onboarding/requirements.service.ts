import { Inject, Injectable } from '@nestjs/common';
import { asc } from 'drizzle-orm';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import { documentRequirements } from '../../database/schema';
import { id } from '../../common/id';
import type { GateRequirement } from './application-gates';
import type { DbExecutor } from './db-types';

export type Requirement = GateRequirement & {
  id: string;
  sortOrder: number;
  vehicleType: string;
  serviceClass: string;
};

export interface UpsertRequirementInput {
  vehicleType: string; // '' = all vehicle types
  serviceClass: string; // '' = all service classes
  subject: 'DRIVER' | 'VEHICLE';
  docType: string;
  kind: 'DOCUMENT' | 'PHOTO';
  label: string;
  isRequired: boolean;
  requiresExpiry: boolean;
  sortOrder: number;
}

type Row = typeof documentRequirements.$inferSelect;

const toRequirement = (r: Row): Requirement => ({
  id: r.id,
  docType: r.docType,
  kind: r.kind as 'DOCUMENT' | 'PHOTO',
  label: r.label,
  isRequired: r.isRequired,
  requiresExpiry: r.requiresExpiry,
  subject: r.subject,
  sortOrder: r.sortOrder,
  vehicleType: r.vehicleType,
  serviceClass: r.serviceClass,
});

/** Reads the admin-editable "what must a driver upload" configuration. */
@Injectable()
export class RequirementsService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  /**
   * Requirements for one driver: every driver-level item plus the items for the
   * chosen vehicle type / service class. A row that names the vehicle type or
   * service class is more specific and overrides the generic row for the same
   * document, so admins can tighten or relax rules per service class.
   *
   * Pass the open transaction as `db` when calling from inside one: querying the
   * pool instead would take a second connection (and deadlock a single-connection
   * test database).
   */
  async forVehicle(
    vehicleType: string | null,
    serviceClass?: string | null,
    db: DbExecutor = this.db,
  ): Promise<Requirement[]> {
    const rows = await db
      .select()
      .from(documentRequirements)
      .orderBy(asc(documentRequirements.subject), asc(documentRequirements.sortOrder));

    const best = new Map<string, { row: Row; specificity: number }>();
    for (const r of rows) {
      if (r.subject === 'VEHICLE' && !vehicleType) continue;
      if (r.vehicleType && r.vehicleType !== vehicleType) continue;
      if (r.serviceClass && r.serviceClass !== (serviceClass ?? '')) continue;
      const specificity = (r.vehicleType ? 1 : 0) + (r.serviceClass ? 1 : 0);
      const key = `${r.subject}|${r.docType}`;
      const cur = best.get(key);
      if (!cur || specificity > cur.specificity) best.set(key, { row: r, specificity });
    }
    return [...best.values()]
      .map((b) => b.row)
      .sort((a, b) => (a.subject === b.subject ? a.sortOrder - b.sortOrder : a.subject === 'DRIVER' ? -1 : 1))
      .map(toRequirement);
  }

  /** Every configured row, for the admin editor. */
  async listAll(): Promise<Requirement[]> {
    const rows = await this.db
      .select()
      .from(documentRequirements)
      .orderBy(asc(documentRequirements.vehicleType), asc(documentRequirements.subject), asc(documentRequirements.sortOrder));
    return rows.map(toRequirement);
  }

  async upsert(input: UpsertRequirementInput): Promise<Requirement> {
    const [row] = await this.db
      .insert(documentRequirements)
      .values({ id: id('req'), ...input })
      .onConflictDoUpdate({
        target: [
          documentRequirements.vehicleType,
          documentRequirements.serviceClass,
          documentRequirements.subject,
          documentRequirements.docType,
        ],
        set: {
          kind: input.kind,
          label: input.label,
          isRequired: input.isRequired,
          requiresExpiry: input.requiresExpiry,
          sortOrder: input.sortOrder,
        },
      })
      .returning();
    return toRequirement(row);
  }
}
