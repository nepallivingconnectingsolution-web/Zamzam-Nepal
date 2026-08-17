import { Module } from '@nestjs/common';
import { DriverDocumentsController } from './driver-documents.controller';
import { AdminDriverDocumentsController } from './admin-driver-documents.controller';
import { DriverDocumentsService } from './driver-documents.service';
import { ModerationModule } from '../../common/moderation/moderation.module';

@Module({
  imports: [ModerationModule],
  controllers: [DriverDocumentsController, AdminDriverDocumentsController],
  providers: [DriverDocumentsService],
})
export class DriverDocumentsModule {}