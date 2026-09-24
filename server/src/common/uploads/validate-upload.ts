import { apiError } from '../exceptions';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export type UploadMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

const EXT: Record<UploadMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

const GENERIC = 'Only JPG, PNG, WEBP or PDF files up to 5 MB are allowed.';

/** Identify a file from its leading bytes, never from its name or declared type. */
function sniff(b: Buffer): UploadMime | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (b.length >= 4 && b.toString('ascii', 0, 4) === '%PDF') return 'application/pdf';
  return null;
}

/**
 * Server-side upload check: size cap, then the real file signature must be a
 * supported type AND match the type the client declared. Throws a friendly 400.
 */
export function validateUpload(
  file: { buffer: Buffer; mimetype: string; size: number },
  opts: { imagesOnly?: boolean } = {},
): { mime: UploadMime; ext: string } {
  const bad = () => apiError(400, GENERIC, 'INVALID_FILE');
  if (!file.buffer || file.buffer.length === 0 || file.size > MAX_UPLOAD_BYTES || file.buffer.length > MAX_UPLOAD_BYTES) {
    return bad();
  }
  const mime = sniff(file.buffer);
  if (!mime || mime !== file.mimetype) return bad();
  if (opts.imagesOnly && mime === 'application/pdf') {
    return apiError(400, 'Please upload a photo (JPG, PNG or WEBP).', 'INVALID_FILE');
  }
  return { mime, ext: EXT[mime] };
}
