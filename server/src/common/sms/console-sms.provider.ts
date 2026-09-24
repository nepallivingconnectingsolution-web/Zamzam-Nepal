import { Logger } from '@nestjs/common';
import { SmsProvider } from './sms.provider';

/**
 * Development only: prints the message instead of sending it. Refuses to be
 * constructed in production so a missing SMS configuration can never silently
 * turn every OTP into a log line nobody reads.
 */
export class ConsoleSmsProvider extends SmsProvider {
  private readonly logger = new Logger('ConsoleSms');

  constructor() {
    super();
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ConsoleSmsProvider cannot be used in production. Set SMS_PROVIDER=sparrow and its credentials.');
    }
  }

  async send(to: string, text: string): Promise<void> {
    this.logger.warn(`[DEV SMS] to ${to}: ${text}`);
  }
}
