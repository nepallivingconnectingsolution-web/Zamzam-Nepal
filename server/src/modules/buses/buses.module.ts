import { Module } from '@nestjs/common';
import { BusesController } from './buses.controller';
import { OperatorBusesController } from './operator-buses.controller';
import { BusesService } from './buses.service';
import { BusesCronService } from './buses.cron';
import { PartnerDocumentsModule } from '../partner-documents/partner-documents.module';

@Module({
  imports: [PartnerDocumentsModule],
  controllers: [BusesController, OperatorBusesController],
  providers: [BusesService, BusesCronService],
  exports: [BusesService],
})
export class BusesModule {}