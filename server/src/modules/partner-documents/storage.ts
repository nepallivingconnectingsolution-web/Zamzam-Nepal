import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';

export const PARTNER_DOCUMENTS_DIR = join(process.cwd(), 'uploads', 'partner-documents');

export function ensurePartnerDocumentsDir(): void {
  if (!existsSync(PARTNER_DOCUMENTS_DIR)) mkdirSync(PARTNER_DOCUMENTS_DIR, { recursive: true });
}

export function deleteUploadedPartnerDocumentFile(fileUrl: string): void {
  try {
    const filename = fileUrl.split('/').pop();
    if (!filename) return;
    const filePath = join(PARTNER_DOCUMENTS_DIR, filename);
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch {
    // Stale file on disk isn't worth failing the request over.
  }
}