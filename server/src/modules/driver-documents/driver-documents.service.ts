import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, and } from 'drizzle-orm';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import { auditLogs, driverDocuments, users } from '../../database/schema';
import { apiError } from '../../common/exceptions';
import { id } from '../../common/id';
import { NotificationsService } from '../notifications/notifications.service';
import { deleteUploadedDocumentFile } from './storage';
import { DRIVER_DOCUMENT_TYPES, type DriverDocumentType } from './dto/driver-documents.dto';

export const DRIVER_DOCUMENT_LABELS: Record<DriverDocumentType, string> = {
  citizenship: 'Citizenship certificate',
  license: 'Driving license',
  nid: 'National ID (NID)',
};

type DocumentRow = typeof driverDocuments.$inferSelect;

@Injectable()
export class DriverDocumentsService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly notifications: NotificationsService,
  ) {}

  /* ─────────────────────────────── Driver side ────────────────────────── */

  /**
   * Always returns all three document slots (citizenship/license/nid), even
   * ones the driver hasn't uploaded yet, so the page can render three
   * upload cards instead of the frontend having to reconstruct the full
   * set from whatever partial rows happen to exist.
   */
  async mine(driverId: string) {
    const rows = await this.db.select().from(driverDocuments).where(eq(driverDocuments.driverId, driverId));
    const byType = new Map(rows.map((r) => [r.type, r]));

    return DRIVER_DOCUMENT_TYPES.map((type) => {
      const row = byType.get(type);
      if (!row) {
        return {
          id: null,
          type,
          label: DRIVER_DOCUMENT_LABELS[type],
          fileUrl: null,
          fileName: null,
          status: 'NOT_UPLOADED' as const,
          reviewNote: null,
          updatedAt: null,
        };
      }
      return this.toDto(row);
    });
  }

  async upload(driverId: string, type: DriverDocumentType, file: Express.Multer.File) {
    const fileUrl = `/uploads/driver-documents/${file.filename}`;

    const [existing] = await this.db
      .select()
      .from(driverDocuments)
      .where(and(eq(driverDocuments.driverId, driverId), eq(driverDocuments.type, type)))
      .limit(1);

    let row: DocumentRow;
    if (existing) {
      // Re-upload replaces the old file and drops back to PENDING — a
      // prior approval was for the old file, not this one.
      deleteUploadedDocumentFile(existing.fileUrl);
      [row] = await this.db
        .update(driverDocuments)
        .set({
          fileUrl,
          fileName: file.originalname,
          mimeType: file.mimetype,
          status: 'PENDING',
          reviewNote: null,
          updatedAt: new Date(),
        })
        .where(eq(driverDocuments.id, existing.id))
        .returning();
    } else {
      [row] = await this.db
        .insert(driverDocuments)
        .values({
          id: id('doc'),
          driverId,
          type,
          fileUrl,
          fileName: file.originalname,
          mimeType: file.mimetype,
        })
        .returning();
    }

    const [driver] = await this.db.select({ name: users.name }).from(users).where(eq(users.id, driverId)).limit(1);
    await this.notifications.notify({
      type: 'system',
      title: 'Driver document awaiting review',
      message: `${driver?.name ?? 'A driver'} uploaded a ${DRIVER_DOCUMENT_LABELS[type].toLowerCase()} and needs verification.`,
      entityType: 'driver_document',
      entityId: driverId,
    });

    return this.toDto(row);
  }

  /* ───────────────────────────── Super admin side ─────────────────────── */

  async adminList(status?: 'PENDING' | 'APPROVED' | 'SUSPENDED') {
    const rows = await this.db
      .select({
        document: driverDocuments,
        driverName: users.name,
        driverMobile: users.mobile,
      })
      .from(driverDocuments)
      .innerJoin(users, eq(driverDocuments.driverId, users.id))
      .where(status ? eq(driverDocuments.status, status) : undefined)
      .orderBy(desc(driverDocuments.createdAt));

    return rows.map((r) => ({
      ...this.toDto(r.document),
      driverId: r.document.driverId,
      driverName: r.driverName,
      driverMobile: r.driverMobile,
    }));
  }

  async adminVerify(
    superAdminId: string,
    documentId: string,
    status: 'APPROVED' | 'SUSPENDED',
    reviewNote?: string,
  ) {
    const [document] = await this.db
      .select()
      .from(driverDocuments)
      .where(eq(driverDocuments.id, documentId))
      .limit(1);
    if (!document) apiError(404, 'Document not found.');

    await this.db
      .update(driverDocuments)
      .set({ status, reviewNote: reviewNote ?? null, updatedAt: new Date() })
      .where(eq(driverDocuments.id, documentId));

    await this.db.insert(auditLogs).values({
      id: id('audit'),
      actorId: superAdminId,
      actorType: 'super_admin',
      action: `super_admin.driver_document.${status.toLowerCase()}`,
      targetType: 'driver_document',
      targetId: documentId,
    });

    return { ok: true };
  }

  /* ───────────────────────────────── Helpers ──────────────────────────── */

  private toDto(row: DocumentRow) {
    return {
      id: row.id,
      type: row.type,
      label: DRIVER_DOCUMENT_LABELS[row.type],
      fileUrl: row.fileUrl,
      fileName: row.fileName,
      status: row.status,
      reviewNote: row.reviewNote,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}