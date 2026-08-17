import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProfileModule } from './modules/profile/profile.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { RidesModule } from './modules/rides/rides.module';
import { LocationsModule } from './modules/locations/locations.module';
import { BusesModule } from './modules/buses/buses.module';
import { DriverModule } from './modules/driver/driver.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { DriverDocumentsModule } from './modules/driver-documents/driver-documents.module';
import { PartnerDocumentsModule } from './modules/partner-documents/partner-documents.module';
import { OperatorModule } from './modules/operator/operator.module';
import { FreightModule } from './modules/freight/freight.module';
import { HotelModule } from './modules/hotel/hotel.module';
import { RestaurantModule } from './modules/restaurant/restaurant.module';
import { AdminModule } from './modules/admin/admin.module';
import { SuperAdminModule } from './modules/super-admin/super-admin.module';
import { GroceryModule } from './modules/grocery/grocery.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SupportModule } from './modules/support/support.module';
import { MaintenanceGuard } from './common/guards/maintenance.guard';
import { MailerModule } from './common/mailer/mailer.module';
import { PasswordResetModule } from './common/password-reset/password-reset.module';
import { buildThrottlerStorage } from './common/throttler/redis-throttler-storage';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            // General API traffic default — generous, since AUTH_RATE_LIMIT_*
            // is reserved for the stricter @Throttle() overrides on
            // login/register (auth.controller.ts) and super-admin login
            // (super-admin.controller.ts) only.
            ttl: Number(config.get('API_RATE_LIMIT_TTL_MS') ?? 60_000),
            limit: Number(config.get('API_RATE_LIMIT_LIMIT') ?? 300),
          },
        ],
        storage: buildThrottlerStorage(config.get<string>('REDIS_URL')),
      }),
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    NotificationsModule,
    MailerModule,
    PasswordResetModule,
    AuthModule,
    ProfileModule,
    WalletModule,
    RidesModule,
    LocationsModule,
    BusesModule,
    DriverModule,
    VehiclesModule,
    DriverDocumentsModule,
    PartnerDocumentsModule,
    OperatorModule,
    FreightModule,
    HotelModule,
    RestaurantModule,
    GroceryModule,
    SupportModule,
    AdminModule,
    SuperAdminModule,
  ],
 providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: MaintenanceGuard },
  ],
})
export class AppModule {}