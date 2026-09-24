import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { eq, inArray } from 'drizzle-orm';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import { applicationDocuments, auditLogs, driverApplications, verificationReviews } from '../../database/schema';
import { id } from '../../common/id';
import { NotificationsService } from '../notifications/notifications.service';
import { assertTransition } from './application-state';
import { currentDocFor, loadApplicationSnapshot } from './application-snapshot';
import { DRIVER_OFFLINE_HOOK, type DriverOfflineHook } from './hooks';
import { RequirementsService } from './requirements.service';

/**
 * Approval does not last forever: a licence or a required document that passes
 * its expiry date takes the driver out of service until they upload a valid one.
 * (Eligibility also checks these dates on every request; this job is what moves
 * the application to EXPIRED, tells the driver, and lists what to replace.)
 */
@Injectable()
export class ExpiryService {
  private readonly logger = new Logger(ExpiryService.name);

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly notifications: NotificationsService,
    private readonly requirements: RequirementsService,
    @Optional() @Inject(DRIVER_OFFLINE_HOOK) private readonly offlineHook?: DriverOfflineHook,
  ) {}

  @Cron('0 2 * * *')
  async nightly(): Promise<void> {
    try {
      const { expired } = await this.run();
      if (expired > 0) this.logger.log(`Expired ${expired} driver application(s).`);
    } catch (err) {
      this.logger.error(`Expiry sweep failed: ${(err as Error).message}`);
    }
  }

  async run(today = new Date().toISOString().slice(0, 10)): Promise<{ expired: number }> {
    const approved = await this.db.select().from(driverApplications).where(eq(driverApplications.status, 'APPROVED'));
    let expired = 0;

    for (const app of approved) {
      const snap = await loadApplicationSnapshot(this.db, this.requirements, app);
      const problems: string[] = [];
      const docIds = new Set<string>();

      const licenceLapsed = !!snap.profile?.licenceExpiryDate && snap.profile.licenceExpiryDate <= today;
      if (licenceLapsed) problems.push('driving licence');

      // Only REQUIRED documents count; an expired optional one never takes a driver off the road.
      for (const r of snap.requirements.filter((x) => x.isRequired)) {
        const row = currentDocFor(snap, r);
        if (!row) continue;
        if (row.doc.expiryDate && row.doc.expiryDate <= today) {
          problems.push(r.label);
          docIds.add(row.doc.id);
        }
        // The licence date lives on the profile, so its images must be replaced too.
        if (licenceLapsed && (r.docType === 'licence_front' || r.docType === 'licence_back')) {
          docIds.add(row.doc.id);
        }
      }
      if (problems.length === 0) continue;

      const reason = `${problems.join(', ')} expired`;
      const done = await this.db.transaction(async (tx) => {
        const [locked] = await tx.select().from(driverApplications).where(eq(driverApplications.id, app.id)).for('update');
        if (!locked || locked.status !== 'APPROVED') return false;
        assertTransition('APPROVED', 'EXPIRED');

        if (docIds.size > 0) {
          await tx.update(applicationDocuments).set({ status: 'EXPIRED' }).where(inArray(applicationDocuments.id, [...docIds]));
        }
        await tx
          .update(driverApplications)
          .set({ status: 'EXPIRED', version: locked.version + 1, updatedAt: new Date() })
          .where(eq(driverApplications.id, app.id));
        await tx.insert(verificationReviews).values({
          id: id('vr'),
          applicationId: app.id,
          targetType: 'APPLICATION',
          targetId: app.id,
          action: 'AUTO_EXPIRED',
          fromStatus: 'APPROVED',
          toStatus: 'EXPIRED',
          reason,
          adminId: null,
        });
        await tx.insert(auditLogs).values({
          id: id('audit'),
          actorId: 'system',
          actorType: 'system',
          action: 'system.driver_application.expired',
          targetType: 'driver_application',
          targetId: app.id,
          metadata: { from: 'APPROVED', to: 'EXPIRED', reason },
        });
        return true;
      });
      if (!done) continue;

      expired += 1;
      try {
        await this.offlineHook?.onDriverForcedOffline(app.userId, reason);
      } catch (err) {
        this.logger.error(`Could not push offline state to driver ${app.userId}: ${(err as Error).message}`);
      }
      await this.notifications.notifyUser(app.userId, {
        type: 'driver_application',
        title: 'Document expired',
        message: `Your ${problems.join(' and ')} expired. Upload a valid one to go online again.`,
        entityType: 'driver_application',
        entityId: app.id,
      });
    }
    return { expired };
  }
}
