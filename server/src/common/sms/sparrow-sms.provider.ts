import { Logger } from '@nestjs/common';
import { apiError } from '../exceptions';
import { SmsProvider } from './sms.provider';

/**
 * Sparrow SMS (Nepal). Needs SPARROW_SMS_TOKEN and SPARROW_SMS_FROM.
 *
 * NOTE: the request shape below follows Sparrow's public v2 API
 * (POST /v2/sms/ with token, from, to, text; JSON reply with response_code
 * 200 on success). It has not been exercised against live credentials, so
 * confirm it with a real send before go-live.
 */
export class SparrowSmsProvider extends SmsProvider {
  private readonly logger = new Logger('SparrowSms');

  constructor(
    private readonly token: string,
    private readonly from: string,
    private readonly endpoint = 'https://api.sparrowsms.com/v2/sms/',
  ) {
    super();
    if (!token || !from) {
      throw new Error('SMS_PROVIDER=sparrow requires SPARROW_SMS_TOKEN and SPARROW_SMS_FROM.');
    }
  }

  async send(to: string, text: string): Promise<void> {
    const fail = () => apiError(502, 'We could not send the SMS right now. Please try again.', 'SMS_FAILED');
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: this.token, from: this.from, to, text }).toString(),
        signal: AbortSignal.timeout(8000),
      });
      const body = (await res.json().catch(() => ({}))) as { response_code?: number };
      if (!res.ok || body.response_code !== 200) {
        this.logger.error(`Sparrow rejected the message: HTTP ${res.status} code ${body.response_code}`);
        return fail();
      }
    } catch (err) {
      if ((err as { getStatus?: () => number }).getStatus) throw err;
      this.logger.error(`Sparrow request failed: ${(err as Error).message}`);
      return fail();
    }
  }
}
