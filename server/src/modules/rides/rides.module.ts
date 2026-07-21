import { Module } from '@nestjs/common';
import { BookingsController, BookingsService, RidesController, RidesService } from './rides.controller';

@Module({
  controllers: [RidesController, BookingsController],
  providers: [RidesService, BookingsService],
})
export class RidesModule {}