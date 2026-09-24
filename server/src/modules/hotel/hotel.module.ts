import { Module } from '@nestjs/common';
import { PartnerDocumentsModule } from '../partner-documents/partner-documents.module';
import { BusinessUploadsModule } from '../../common/uploads/business-uploads.module';
import { HotelsController } from './hotels.controller';
import { PartnerHotelsController, PartnerHotelMetricsController } from './partner-hotels.controller';
import { HotelService } from './hotel.service';

@Module({
  imports: [PartnerDocumentsModule, BusinessUploadsModule],
  controllers: [HotelsController, PartnerHotelsController, PartnerHotelMetricsController],
  providers: [HotelService],
  exports: [HotelService],
})
export class HotelModule {}