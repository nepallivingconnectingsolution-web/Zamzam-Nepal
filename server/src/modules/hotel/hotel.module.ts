import { Module } from '@nestjs/common';
import { HotelsController } from './hotels.controller';
import { PartnerHotelsController, PartnerHotelMetricsController } from './partner-hotels.controller';
import { HotelService } from './hotel.service';

@Module({
  controllers: [HotelsController, PartnerHotelsController, PartnerHotelMetricsController],
  providers: [HotelService],
  exports: [HotelService],
})
export class HotelModule {}