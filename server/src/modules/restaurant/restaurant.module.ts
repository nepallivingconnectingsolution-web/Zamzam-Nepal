import { Module } from '@nestjs/common';
import { PartnerDocumentsModule } from '../partner-documents/partner-documents.module';
import { RestaurantsController } from './restaurants.controller';
import {
  PartnerRestaurantsController,
  PartnerRestaurantMetricsController,
} from './partner-restaurants.controller';
import { RestaurantService } from './restaurant.service';

@Module({
  imports: [PartnerDocumentsModule],
  controllers: [RestaurantsController, PartnerRestaurantsController, PartnerRestaurantMetricsController],
  providers: [RestaurantService],
  exports: [RestaurantService],
})
export class RestaurantModule {}