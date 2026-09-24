import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { validateUpload } from './validate-upload';
import { CloudinaryService, type UploadedImage } from '../cloudinary/cloudinary.service';
import { ModerationService } from '../moderation/moderation.service';

export const MAX_BUSINESS_PHOTOS = 10;

/**
 * The one path every business-photo upload goes through, regardless of
 * which domain (hotel/room/bus/vehicle/restaurant/grocery) is calling it:
 * validate the file signature, run content moderation (same Rekognition
 * call driver documents use, same fail-closed-on-error semantics), then
 * upload to Cloudinary. Each domain service calls this once per file and
 * handles its own DB array update — this service owns none of that state.
 */
@Injectable()
export class BusinessImageUploadService {
  constructor(
    private readonly cloudinary: CloudinaryService,
    private readonly moderation: ModerationService,
  ) {}

  async upload(
    file: { buffer: Buffer; mimetype: string; size: number },
    folder: string,
  ): Promise<UploadedImage> {
    validateUpload(file, { imagesOnly: true });

    let result: { allowed: boolean; reasons: string[] };
    try {
      result = await this.moderation.checkImage(file.buffer);
    } catch {
      throw new UnprocessableEntityException(
        'Could not verify this image right now. Please try again in a moment.',
      );
    }
    if (!result.allowed) {
      throw new UnprocessableEntityException(
        'This image was flagged by automated content moderation and cannot be uploaded.',
      );
    }

    return this.cloudinary.uploadImage(file.buffer, folder);
  }
}
