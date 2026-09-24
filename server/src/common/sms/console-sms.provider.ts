import { Logger } from '@nestjs/common';
import { SmsProvider } from './sms.provider';

/**
 * Development only: prints the message instead of sending it. Refuses to be
 * constructed in production so a missing SMS configuration can never silently
 * turn every OTP into a log line nobody reads — unless ALLOW_CONSOLE_SMS_IN_PRODUCTION
 * is *also* explicitly set, a second deliberate flag for manual testing on a
 * live deployment before real SMS credentials exist (e.g. Sparrow SMS pending
 * account setup). Remove that env var the moment real credentials land.
 */
export class ConsoleSmsProvider extends SmsProvider {
  private readonly logger = new Logger('ConsoleSms');

  constructor() {
    super();
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_CONSOLE_SMS_IN_PRODUCTION !== 'true') {
      throw new Error(
        'ConsoleSmsProvider cannot be used in production. Set SMS_PROVIDER=sparrow and its credentials, ' +
          'or set ALLOW_CONSOLE_SMS_IN_PRODUCTION=true for temporary manual testing without real SMS.',
      );
    }
  }

  async send(to: string, text: string): Promise<void> {
    this.logger.warn(`[DEV SMS] to ${to}: ${text}`);
  }
}
