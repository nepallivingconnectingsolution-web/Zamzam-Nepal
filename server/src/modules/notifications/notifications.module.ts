import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

/**
 * @Global() mirrors DatabaseModule's pattern (see database/database.module.ts):
 * imported once in AppModule, then injectable anywhere in the app without
 * every feature module needing its own explicit import.
 */
@Global()
@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}