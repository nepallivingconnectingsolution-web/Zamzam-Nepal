import { Module } from '@nestjs/common';
import { RestaurantsController } from './restaurants.controller';
import {
  PartnerRestaurantsController,
  PartnerRestaurantMetricsController,
} from './partner-restaurants.controller';
import { RestaurantService } from './restaurant.service';

@Module({
  controllers: [RestaurantsController, PartnerRestaurantsController, PartnerRestaurantMetricsController],
  providers: [RestaurantService],
  exports: [RestaurantService],
})
export class RestaurantModule {}