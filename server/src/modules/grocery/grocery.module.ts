import { Module } from '@nestjs/common';
import { GroceriesController } from './groceries.controller';
import { PartnerGroceriesController, PartnerGroceryMetricsController } from './partner-groceries.controller';
import { GroceryService } from './grocery.service';

@Module({
  controllers: [GroceriesController, PartnerGroceriesController, PartnerGroceryMetricsController],
  providers: [GroceryService],
  exports: [GroceryService],
})
export class GroceryModule {}