import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ModerationModule } from '../../common/moderation/moderation.module';
import { SmsModule } from '../../common/sms/sms.module';
import { DriverDispatchModule } from '../driver-dispatch/driver-dispatch.module';
import { ApplicationController } from './application.controller';
import { AdminApplicationsController } from './admin-applications.controller';
import { AdminApplicationsService } from './admin-applications.service';
import { ApplicationService } from './application.service';
import { ExpiryService } from './expiry.service';
import { RequirementsService } from './requirements.service';
import { AdminFilesController, DriverFilesController } from './files/files.controller';
import { LocalPrivateStorage, StorageBackend, StorageService } from './files/storage.service';
import { OtpController } from './otp/otp.controller';
import { OtpService } from './otp/otp.service';

@Module({
  imports: [ConfigModule, ModerationModule, DriverDispatchModule, SmsModule],
  controllers: [
    ApplicationController,
    AdminApplicationsController,
    OtpController,
    DriverFilesController,
    AdminFilesController,
  ],
  providers: [
    RequirementsService,
    ApplicationService,
    AdminApplicationsService,
    ExpiryService,
    StorageService,
    OtpService,
    {
      provide: StorageBackend,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new LocalPrivateStorage(config.get<string>('UPLOAD_PRIVATE_DIR')),
    },
  ],
  exports: [RequirementsService, ApplicationService, AdminApplicationsService, StorageService],
})
export class DriverOnboardingModule {}
