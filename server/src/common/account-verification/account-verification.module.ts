import { Global, Module } from '@nestjs/common';
import { SmsModule } from '../sms/sms.module';
import { AccountVerificationService } from './account-verification.service';

@Global()
@Module({
  imports: [SmsModule],
  providers: [AccountVerificationService],
  exports: [AccountVerificationService],
})
export class AccountVerificationModule {}
