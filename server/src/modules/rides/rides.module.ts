import { Module } from '@nestjs/common';
import { RidesController, RidesService } from './rides.controller';

@Module({
  controllers: [RidesController],
  providers: [RidesService],
})
export class RidesModule {}