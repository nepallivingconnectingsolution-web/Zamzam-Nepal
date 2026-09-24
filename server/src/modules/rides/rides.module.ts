import { Module } from '@nestjs/common';
import { DriverDispatchModule } from '../driver-dispatch/driver-dispatch.module';
import { RidesController, RidesService, BookingsController, BookingsService } from './rides.controller';

@Module({
  imports: [DriverDispatchModule],
  controllers: [RidesController, BookingsController],
  providers: [RidesService, BookingsService],
})
export class RidesModule {}