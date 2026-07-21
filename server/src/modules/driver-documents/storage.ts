import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';

/**
 * Driver documents are stored on local disk (not S3 — this deployment has
 * no object-storage credentials configured) and served back out through
 * NestExpressApplication.useStaticAssets (see main.ts), which mounts this
 * directory at the public `/uploads/driver-documents` prefix. Filenames are
 * random ids (see driver-documents.controller.ts), so the URL itself is the
 * only thing standing between a stored document and whoever holds the link
 * — treat that as "unlisted", not access-controlled.
 */
export const DRIVER_DOCUMENTS_DIR = join(process.cwd(), 'uploads', 'driver-documents');

export function ensureDriverDocumentsDir(): void {
  if (!existsSync(DRIVER_DOCUMENTS_DIR)) mkdirSync(DRIVER_DOCUMENTS_DIR, { recursive: true });
}

/** Best-effort cleanup of the previous file when a document is re-uploaded. Never blocks the request. */
export function deleteUploadedDocumentFile(fileUrl: string): void {
  try {
    const filename = fileUrl.split('/').pop();
    if (!filename) return;
    const filePath = join(DRIVER_DOCUMENTS_DIR, filename);
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch {
    // Stale file left on disk is not worth failing the request over.
  }
}