import { HttpException } from '@nestjs/common';

/** Anything that can deliver a text message. Swap the adapter without touching OtpService. */
export abstract class SmsProvider {
  abstract send(to: string, text: string): Promise<void>;
}

/**
 * Used when production has no SMS credentials. The API still boots (every other
 * feature keeps working); only phone verification fails, with a clear message.
 */
export class UnconfiguredSmsProvider extends SmsProvider {
  async send(): Promise<void> {
    throw new HttpException(
      { message: 'Phone verification is temporarily unavailable. Please try again later.', code: 'SMS_NOT_CONFIGURED' },
      503,
    );
  }
}
