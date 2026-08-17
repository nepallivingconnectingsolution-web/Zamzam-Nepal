import { Module } from '@nestjs/common';
import { PartnerDocumentsController } from './partner-documents.controller';
import { AdminPartnerDocumentsController } from './admin-partner-documents.controller';
import { PartnerDocumentsService } from './partner-documents.service';
import { ModerationModule } from '../../common/moderation/moderation.module';

@Module({
  imports: [ModerationModule],
  controllers: [PartnerDocumentsController, AdminPartnerDocumentsController],
  providers: [PartnerDocumentsService],
  // Exported so each vertical can call assertRequiredDocsUploaded() before
  // letting a partner publish anything customers can buy.
  exports: [PartnerDocumentsService],
})
export class PartnerDocumentsModule {}