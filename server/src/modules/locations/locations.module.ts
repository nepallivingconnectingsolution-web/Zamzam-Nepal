import { Module } from '@nestjs/common';
import { LocationsController, LocationsService } from './locations.controller';

@Module({
  controllers: [LocationsController],
  providers: [LocationsService],
})
export class LocationsModule {}