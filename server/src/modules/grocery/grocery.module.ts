import { Module } from '@nestjs/common';
import { PartnerDocumentsModule } from '../partner-documents/partner-documents.module';
import { GroceriesController } from './groceries.controller';
import { PartnerGroceriesController, PartnerGroceryMetricsController } from './partner-groceries.controller';
import { GroceryService } from './grocery.service';

@Module({
  imports: [PartnerDocumentsModule],
  controllers: [GroceriesController, PartnerGroceriesController, PartnerGroceryMetricsController],
  providers: [GroceryService],
  exports: [GroceryService],
})
export class GroceryModule {}