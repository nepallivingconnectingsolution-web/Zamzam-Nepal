import { Module } from '@nestjs/common';
import { PartnerDocumentsController } from './partner-documents.controller';
import { AdminPartnerDocumentsController } from './admin-partner-documents.controller';
import { PartnerDocumentsService } from './partner-documents.service';

@Module({
  controllers: [PartnerDocumentsController, AdminPartnerDocumentsController],
  providers: [PartnerDocumentsService],
})
export class PartnerDocumentsModule {}