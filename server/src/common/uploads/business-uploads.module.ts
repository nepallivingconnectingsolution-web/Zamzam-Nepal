import { Module } from '@nestjs/common';
import { BusinessImageUploadService } from './business-image-upload.service';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { ModerationModule } from '../moderation/moderation.module';

@Module({
  imports: [ModerationModule, CloudinaryModule],
  providers: [BusinessImageUploadService],
  exports: [BusinessImageUploadService, CloudinaryModule],
})
export class BusinessUploadsModule {}
