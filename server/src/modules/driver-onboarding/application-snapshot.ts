import { and, eq, isNull } from 'drizzle-orm';
import {
  applicationDocuments,
  driverApplications,
  driverProfiles,
  storedFiles,
  vehicles,
} from '../../database/schema';
import type { DbExecutor } from './db-types';
import type { GateDoc, GateInput } from './application-gates';
import type { Requirement, RequirementsService } from './requirements.service';

export type AppRow = typeof driverApplications.$inferSelect;
export type ProfileRow = typeof driverProfiles.$inferSelect;
export type VehicleRow = typeof vehicles.$inferSelect;
export type DocRow = { doc: typeof applicationDocuments.$inferSelect; file: typeof storedFiles.$inferSelect };

export interface ApplicationSnapshot {
  profile: ProfileRow | null;
  vehicle: VehicleRow | null;
  requirements: Requirement[];
  /** Current (non-superseded) documents only. */
  docRows: DocRow[];
  /** Ready to hand to evaluateSubmitGate / evaluateApprovalGate. */
  gateInput: GateInput;
}

/** The current document for a requirement, scoped to the driver or the vehicle. */
export function currentDocFor(
  snapshot: Pick<ApplicationSnapshot, 'docRows' | 'vehicle'>,
  r: Pick<Requirement, 'docType' | 'subject'>,
): DocRow | undefined {
  const scope = r.subject === 'DRIVER' ? 'driver' : snapshot.vehicle?.id;
  return snapshot.docRows.find(
    (d) => d.doc.docType === r.docType && d.doc.subject === r.subject && d.doc.scope === scope,
  );
}

/** Loads everything the gates and the views need, in one place so they can never disagree. */
export async function loadApplicationSnapshot(
  db: DbExecutor,
  requirements: RequirementsService,
  app: AppRow,
): Promise<ApplicationSnapshot> {
  const [profile = null] = await db
    .select()
    .from(driverProfiles)
    .where(eq(driverProfiles.userId, app.userId))
    .limit(1);

  let vehicle: VehicleRow | null = null;
  if (app.vehicleId) {
    [vehicle = null] = await db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, app.vehicleId), eq(vehicles.isActive, true)))
      .limit(1);
  }

  const reqs = await requirements.forVehicle(vehicle?.category ?? null, vehicle?.serviceClass ?? null, db);

  const docRows = await db
    .select({ doc: applicationDocuments, file: storedFiles })
    .from(applicationDocuments)
    .innerJoin(storedFiles, eq(storedFiles.id, applicationDocuments.fileId))
    .where(and(eq(applicationDocuments.applicationId, app.id), isNull(applicationDocuments.supersededById)));

  const snapshot = { docRows, vehicle };
  const gateDocs: GateDoc[] = [];
  for (const r of reqs) {
    const row = currentDocFor(snapshot, r);
    if (row) {
      gateDocs.push({
        docType: r.docType,
        subject: r.subject,
        status: row.doc.status,
        expiryDate: row.doc.expiryDate,
      });
    }
  }

  return {
    profile,
    vehicle,
    requirements: reqs,
    docRows,
    gateInput: {
      profile,
      vehicle: vehicle
        ? {
            category: vehicle.category,
            plateNumber: vehicle.plateNumber,
            make: vehicle.make,
            model: vehicle.model,
            manufactureYear: vehicle.manufactureYear,
            color: vehicle.color,
          }
        : null,
      requirements: reqs,
      docs: gateDocs,
    },
  };
}
