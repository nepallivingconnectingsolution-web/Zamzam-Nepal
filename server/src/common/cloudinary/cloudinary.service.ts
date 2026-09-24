import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { apiError } from '../exceptions';

export interface UploadedImage {
  url: string;
  publicId: string;
}

/**
 * Every image this service uploads is delivered through this exact
 * transformation prefix (f_auto,q_auto — auto format/quality, baked into
 * the URL at upload time via cloudinary.url(), not left to per-request
 * transformation). publicIdFromUrl() depends on this being the only path
 * shape this service ever produces — don't change one without the other.
 */
const DELIVERY_PREFIX = '/image/upload/f_auto,q_auto/';

/**
 * Thin wrapper around the Cloudinary Node SDK. Configured from a single
 * CLOUDINARY_URL env var (cloudinary://key:secret@cloud_name). Mirrors how
 * ModerationService treats AWS_REGION: unset in dev/test is fine (uploads
 * just 503 if actually called), main.ts is expected to warn loudly on boot
 * if it's unset in production.
 */
@Injectable()
export class CloudinaryService {
  private readonly configured: boolean;

  constructor(config: ConfigService) {
    const url = config.get<string>('CLOUDINARY_URL');
    this.configured = Boolean(url);
    if (url) {
      // cloudinary.config(true) re-parses CLOUDINARY_URL from process.env —
      // the SDK's documented way to configure from a URL string you already
      // have (rather than relying on import-time env parsing, which would
      // race NestJS's own .env loading).
      process.env.CLOUDINARY_URL = url;
      cloudinary.config(true);
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async uploadImage(buffer: Buffer, folder: string): Promise<UploadedImage> {
    if (!this.configured) {
      apiError(503, 'Image uploads are temporarily unavailable.', 'UPLOADS_UNCONFIGURED');
    }

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: `zamzam-${folder}`, resource_type: 'image' },
        (error, result) => {
          if (error || !result) {
            reject(error ?? new Error('Cloudinary upload failed'));
            return;
          }
          const url = cloudinary.url(result.public_id, {
            secure: true,
            resource_type: 'image',
            fetch_format: 'auto',
            quality: 'auto',
          });
          resolve({ url, publicId: result.public_id });
        },
      );
      stream.end(buffer);
    });
  }

  /** Best-effort: a failed delete just leaves an orphaned (harmless, still billed) Cloudinary asset — never blocks the caller. */
  async deleteImage(publicId: string): Promise<void> {
    if (!this.configured) return;
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    } catch {
      // orphaned asset, not worth failing the request over
    }
  }

  /** Reverses uploadImage()'s url. Returns null for any URL this service didn't generate (e.g. a stale/foreign URL). */
  publicIdFromUrl(url: string): string | null {
    const idx = url.indexOf(DELIVERY_PREFIX);
    return idx === -1 ? null : url.slice(idx + DELIVERY_PREFIX.length);
  }
}
