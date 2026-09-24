import { Module } from '@nestjs/common';
import { VehiclesController } from './vehicles.controller';
import { AdminVehiclesController } from './admin-vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { BusinessUploadsModule } from '../../common/uploads/business-uploads.module';

/**
 * VehiclesService is exported because Batch 3/4 (nearby matching + booking)
 * reads CATEGORY_SERVICES and vehicle records from the driver and rides
 * modules.
 */
@Module({
  imports: [BusinessUploadsModule],
  controllers: [VehiclesController, AdminVehiclesController],
  providers: [VehiclesService],
  exports: [VehiclesService],
})
export class VehiclesModule {}