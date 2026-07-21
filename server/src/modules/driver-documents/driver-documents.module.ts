import { Module } from '@nestjs/common';
import { DriverDocumentsController } from './driver-documents.controller';
import { AdminDriverDocumentsController } from './admin-driver-documents.controller';
import { DriverDocumentsService } from './driver-documents.service';

@Module({
  controllers: [DriverDocumentsController, AdminDriverDocumentsController],
  providers: [DriverDocumentsService],
})
export class DriverDocumentsModule {}