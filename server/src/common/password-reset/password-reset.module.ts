import { Global, Module } from '@nestjs/common';
import { PasswordResetService } from './password-reset.service';

@Global()
@Module({
  providers: [PasswordResetService],
  exports: [PasswordResetService],
})
export class PasswordResetModule {}
