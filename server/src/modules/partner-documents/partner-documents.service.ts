import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, and } from 'drizzle-orm';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import { auditLogs, partnerDocuments, users } from '../../database/schema';
import { apiError } from '../../common/exceptions';
import { id } from '../../common/id';
import { NotificationsService } from '../notifications/notifications.service';
import { deleteUploadedPartnerDocumentFile } from './storage';
import { PARTNER_DOCUMENT_CATALOG, type PartnerType } from './dto/partner-documents.dto';

type DocumentRow = typeof partnerDocuments.$inferSelect;

export const PARTNER_TYPE_LABEL: Record<PartnerType, string> = {
  hotel: 'Hotel',
  restaurant: 'Restaurant',
  grocery: 'Grocery store',
  bus_operator: 'Bus operator',
  freight: 'Freight partner',
};

@Injectable()
export class PartnerDocumentsService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly notifications: NotificationsService,
  ) {}

  async mine(partnerId: string, partnerType: PartnerType) {
    const catalog = PARTNER_DOCUMENT_CATALOG[partnerType];
    const rows = await this.db.select().from(partnerDocuments).where(eq(partnerDocuments.partnerId, partnerId));
    const byType = new Map(rows.map((r) => [r.type, r]));

    return catalog.map((spec) => {
      const row = byType.get(spec.type);
      if (!row) {
        return {
          id: null, type: spec.type, label: spec.label, hint: spec.hint,
          fileUrl: null, fileName: null, status: 'NOT_UPLOADED' as const,
          reviewNote: null, updatedAt: null,
        };
      }
      return this.toDto(row);
    });
  }

  async upload(partnerId: string, partnerType: PartnerType, type: string, file: Express.Multer.File) {
    const spec = PARTNER_DOCUMENT_CATALOG[partnerType].find((d) => d.type === type)!;
    const fileUrl = `/uploads/partner-documents/${file.filename}`;

    const [existing] = await this.db
      .select().from(partnerDocuments)
      .where(and(eq(partnerDocuments.partnerId, partnerId), eq(partnerDocuments.type, type)))
      .limit(1);

    let row: DocumentRow;
    if (existing) {
      deleteUploadedPartnerDocumentFile(existing.fileUrl);
      [row] = await this.db
        .update(partnerDocuments)
        .set({ fileUrl, fileName: file.originalname, mimeType: file.mimetype, status: 'PENDING', reviewNote: null, updatedAt: new Date() })
        .where(eq(partnerDocuments.id, existing.id))
        .returning();
    } else {
      [row] = await this.db
        .insert(partnerDocuments)
        .values({ id: id('doc'), partnerId, partnerType, type, fileUrl, fileName: file.originalname, mimeType: file.mimetype })
        .returning();
    }

    const [partner] = await this.db.select({ name: users.name }).from(users).where(eq(users.id, partnerId)).limit(1);
    await this.notifications.notify({
      type: 'system',
      title: 'Partner document awaiting review',
      message: `${partner?.name ?? 'A partner'} (${PARTNER_TYPE_LABEL[partnerType]}) uploaded a ${spec.label.toLowerCase()} and needs verification.`,
      entityType: 'partner_document',
      entityId: partnerId,
    });

    return this.toDto(row);
  }

  async adminList(status?: 'PENDING' | 'APPROVED' | 'SUSPENDED', partnerType?: PartnerType) {
    const conditions = [
      status ? eq(partnerDocuments.status, status) : undefined,
      partnerType ? eq(partnerDocuments.partnerType, partnerType) : undefined,
    ].filter((c): c is NonNullable<typeof c> => Boolean(c));

    const rows = await this.db
      .select({ document: partnerDocuments, partnerName: users.name, partnerMobile: users.mobile })
      .from(partnerDocuments)
      .innerJoin(users, eq(partnerDocuments.partnerId, users.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(partnerDocuments.createdAt));

    return rows.map((r) => ({
      ...this.toDto(r.document),
      partnerId: r.document.partnerId,
      partnerType: r.document.partnerType,
      partnerTypeLabel: PARTNER_TYPE_LABEL[r.document.partnerType as PartnerType],
      partnerName: r.partnerName,
      partnerMobile: r.partnerMobile,
    }));
  }

  async adminVerify(superAdminId: string, documentId: string, status: 'APPROVED' | 'SUSPENDED', reviewNote?: string) {
    const [document] = await this.db.select().from(partnerDocuments).where(eq(partnerDocuments.id, documentId)).limit(1);
    if (!document) apiError(404, 'Document not found.');

    await this.db
      .update(partnerDocuments)
      .set({ status, reviewNote: reviewNote ?? null, updatedAt: new Date() })
      .where(eq(partnerDocuments.id, documentId));

    await this.db.insert(auditLogs).values({
      id: id('audit'),
      actorId: superAdminId,
      actorType: 'super_admin',
      action: `super_admin.partner_document.${status.toLowerCase()}`,
      targetType: 'partner_document',
      targetId: documentId,
    });

    return { ok: true };
  }

  private toDto(row: DocumentRow) {
    const spec = PARTNER_DOCUMENT_CATALOG[row.partnerType as PartnerType].find((d) => d.type === row.type);
    return {
      id: row.id, type: row.type, label: spec?.label ?? row.type, hint: spec?.hint ?? '',
      fileUrl: row.fileUrl, fileName: row.fileName, status: row.status,
      reviewNote: row.reviewNote, updatedAt: row.updatedAt.toISOString(),
    };
  }
}