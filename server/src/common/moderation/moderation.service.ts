import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RekognitionClient, DetectModerationLabelsCommand } from '@aws-sdk/client-rekognition';

export interface ModerationResult {
  allowed: boolean;
  /** Human-readable reasons for rejection, e.g. "Explicit Nudity (92.3%)". Empty when allowed. */
  reasons: string[];
}

/**
 * Wraps AWS Rekognition's image moderation. Only ever called with image
 * bytes (image/jpeg, image/png, image/webp) — Rekognition doesn't support
 * PDFs, so PDF uploads never reach this service; see driver-documents and
 * partner-documents services for where that mimetype check happens.
 *
 * Fails OPEN (allows the upload) only when AWS_REGION isn't configured at
 * all — that's the local-dev-without-AWS-credentials case, mirroring how
 * RESEND_API_KEY works elsewhere in this codebase (unset = degrade
 * gracefully in dev). In production, main.ts refuses to boot without
 * AWS_REGION set, so this fallback never actually triggers there.
 *
 * Fails CLOSED (throws) if Rekognition is configured but the API call
 * itself errors — callers must catch that and reject the upload, not
 * swallow it and let an unmoderated file through.
 */
@Injectable()
export class ModerationService {
  private readonly client: RekognitionClient | null;
  private readonly minConfidence: number;

  constructor(private readonly config: ConfigService) {
    const region = this.config.get<string>('AWS_REGION');
    this.minConfidence = Number(this.config.get<string>('REKOGNITION_MIN_CONFIDENCE') ?? 80);
    this.client = region ? new RekognitionClient({ region }) : null;
  }

  async checkImage(buffer: Buffer): Promise<ModerationResult> {
    if (!this.client) return { allowed: true, reasons: [] };

    const result = await this.client.send(
      new DetectModerationLabelsCommand({
        Image: { Bytes: buffer },
        MinConfidence: this.minConfidence,
      }),
    );

    const labels = result.ModerationLabels ?? [];
    if (labels.length === 0) return { allowed: true, reasons: [] };

    return {
      allowed: false,
      reasons: labels.map((l) => `${l.Name} (${l.Confidence?.toFixed(1)}%)`),
    };
  }
}
