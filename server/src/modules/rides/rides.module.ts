import { Module } from '@nestjs/common';
import { RidesController, RidesService, BookingsController, BookingsService } from './rides.controller';

@Module({
  controllers: [RidesController, BookingsController],
  providers: [RidesService, BookingsService],
})
export class RidesModule {}