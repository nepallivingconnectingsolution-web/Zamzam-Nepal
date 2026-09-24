import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { DRIVER_OFFLINE_HOOK } from '../driver-onboarding/hooks';
import { DispatchService } from './dispatch.service';
import { DispatchSweeper } from './dispatch.sweeper';
import { DriverEventsBus } from './driver-events.bus';
import { EligibilityService } from './eligibility.service';
import { LOCATION_STORE, MemoryLocationStore, RedisLocationStore } from './location.store';
import { OffersController } from './offers.controller';
import { PresenceController } from './presence.controller';
import { PresenceService } from './presence.service';

@Module({
  imports: [ConfigModule],
  controllers: [PresenceController, OffersController],
  providers: [
    DriverEventsBus,
    EligibilityService,
    PresenceService,
    DispatchService,
    DispatchSweeper,
    { provide: DRIVER_OFFLINE_HOOK, useExisting: PresenceService },
    {
      provide: LOCATION_STORE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('REDIS_URL');
        const logger = new Logger('LocationStore');
        if (url) {
          const redis = new Redis(url, { maxRetriesPerRequest: 2 });
          redis.on('error', () => undefined); // failures are handled (and logged) per call by the store
          logger.log('Live driver locations: Redis GEO');
          return new RedisLocationStore(redis);
        }
        if ((config.get<string>('NODE_ENV') ?? 'development') === 'production') {
          logger.warn('REDIS_URL is not set: driver locations are kept in memory and will not survive restarts or scale across instances.');
        }
        return new MemoryLocationStore();
      },
    },
  ],
  exports: [DriverEventsBus, EligibilityService, PresenceService, DispatchService, LOCATION_STORE, DRIVER_OFFLINE_HOOK],
})
export class DriverDispatchModule {}
