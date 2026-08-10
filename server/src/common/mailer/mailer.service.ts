import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Zamzam's one outbound-email path (Resend). This is the first email
 * feature in the app — everything sends through here rather than each
 * module reaching for its own client, so switching providers later is a
 * one-file change.
 *
 * Without RESEND_API_KEY configured, sends log the email instead of
 * throwing — this keeps the forgot-password flow fully testable in local
 * dev before a real provider key exists, rather than making the whole
 * feature depend on that key being set from day one.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly resend: Resend | null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.from = this.config.get<string>('MAIL_FROM') ?? 'Zamzam <onboarding@resend.dev>';

    if (!this.resend) {
      this.logger.warn(
        'RESEND_API_KEY is not set — outbound emails will be logged to the console instead of sent. ' +
          'Set RESEND_API_KEY (and optionally MAIL_FROM) in server/.env to send real email.',
      );
    }
  }

  async send({ to, subject, html, text }: SendEmailInput): Promise<void> {
    if (!this.resend) {
      this.logger.log(`[DEV EMAIL] to=${to} subject="${subject}"\n${text}`);
      return;
    }

    const { error } = await this.resend.emails.send({ from: this.from, to, subject, html, text });
    if (error) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`);
      // Deliberately not re-thrown into the request path — see callers
      // (auth.service.ts forgotPassword): the forgot-password endpoint
      // always returns a generic success response regardless of delivery,
      // both to avoid leaking whether an email exists and because a
      // transient provider failure shouldn't surface as a user-facing error.
    }
  }

  async sendPasswordResetOtp(to: string, otp: string): Promise<void> {
    const subject = 'Your Zamzam password reset code';
    const text = `Your Zamzam password reset code is ${otp}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`;
    const html = `
      <div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px">
        <p style="font-size:14px;color:#444">Your Zamzam password reset code is:</p>
        <p style="font-size:32px;font-weight:700;letter-spacing:6px;font-family:monospace;margin:12px 0">${otp}</p>
        <p style="font-size:13px;color:#777">This code expires in 10 minutes. If you didn't request a password reset, you can safely ignore this email.</p>
      </div>
    `.trim();
    await this.send({ to, subject, html, text });
  }
}
