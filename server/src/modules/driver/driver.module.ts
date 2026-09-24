import { Module } from '@nestjs/common';
import { DriverController, DriversController } from './driver.controller';
import { DriverService } from './driver.service';
import { DriverDispatchModule } from '../driver-dispatch/driver-dispatch.module';

@Module({
  imports: [DriverDispatchModule],
  controllers: [DriverController, DriversController],
  providers: [DriverService],
})
export class DriverModule {}