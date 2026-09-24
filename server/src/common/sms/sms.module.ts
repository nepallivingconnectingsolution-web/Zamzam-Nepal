import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ConsoleSmsProvider } from './console-sms.provider';
import { SparrowSmsProvider } from './sparrow-sms.provider';
import { SmsProvider, UnconfiguredSmsProvider } from './sms.provider';

function smsProviderFactory(config: ConfigService): SmsProvider {
  const production = (config.get<string>('NODE_ENV') ?? 'development') === 'production';
  const wanted = config.get<string>('SMS_PROVIDER') ?? (production ? 'sparrow' : 'console');

  if (wanted === 'sparrow') {
    const token = config.get<string>('SPARROW_SMS_TOKEN');
    const from = config.get<string>('SPARROW_SMS_FROM');
    if (token && from) return new SparrowSmsProvider(token, from);
    new Logger('Sms').error(
      'SPARROW_SMS_TOKEN / SPARROW_SMS_FROM are not set: SMS-based verification will fail until they are.',
    );
    return new UnconfiguredSmsProvider();
  }
  return new ConsoleSmsProvider(); // throws in production by design
}

@Module({
  imports: [ConfigModule],
  providers: [{ provide: SmsProvider, inject: [ConfigService], useFactory: smsProviderFactory }],
  exports: [SmsProvider],
})
export class SmsModule {}
