import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join, extname } from 'path';
import { id } from '../../common/id';

export const PARTNER_DOCUMENTS_DIR = join(process.cwd(), 'uploads', 'partner-documents');

export function ensurePartnerDocumentsDir(): void {
  if (!existsSync(PARTNER_DOCUMENTS_DIR)) mkdirSync(PARTNER_DOCUMENTS_DIR, { recursive: true });
}

export function writePartnerDocumentFile(buffer: Buffer, originalName: string): string {
  ensurePartnerDocumentsDir();
  const filename = `${id('doc')}${extname(originalName).toLowerCase()}`;
  writeFileSync(join(PARTNER_DOCUMENTS_DIR, filename), buffer);
  return filename;
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