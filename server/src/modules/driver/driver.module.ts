import { Module } from '@nestjs/common';
import { DriverController, DriversController } from './driver.controller';
import { DriverService } from './driver.service';

@Module({
  controllers: [DriverController, DriversController],
  providers: [DriverService],
})
export class DriverModule {}