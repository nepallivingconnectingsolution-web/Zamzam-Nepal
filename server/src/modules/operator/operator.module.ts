import { Module } from '@nestjs/common';
import { OperatorController } from './operator.controller';
import { BusesModule } from '../buses/buses.module';

@Module({
  imports: [BusesModule],
  controllers: [OperatorController],
})
export class OperatorModule {}
