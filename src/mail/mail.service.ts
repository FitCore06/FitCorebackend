import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendPasswordResetEmail(input: {
    to: string;
    name: string;
    resetLink: string;
  }): Promise<boolean> {
    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    const from =
      this.config.get<string>('PASSWORD_RESET_FROM_EMAIL')?.trim() ??
      'FitCore <onboarding@resend.dev>';

    if (!apiKey) {
      this.log.warn(
        `RESEND_API_KEY not set — cannot email ${input.to}. Link: ${input.resetLink}`,
      );
      return false;
    }

    const html = `
      <p>Hi ${escapeHtml(input.name)},</p>
      <p>We received a request to reset your FitCore password.</p>
      <p><a href="${escapeHtml(input.resetLink)}">Set a new password</a></p>
      <p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p>
      <p style="color:#666;font-size:12px;">Or copy this URL:<br>${escapeHtml(input.resetLink)}</p>
    `.trim();

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [input.to],
          subject: 'Reset your FitCore password',
          html,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        this.log.error(`Resend ${res.status}: ${body}`);
        return false;
      }

      this.log.log(`Password reset email sent to ${input.to}`);
      return true;
    } catch (err) {
      this.log.error(
        `Resend request failed: ${err instanceof Error ? err.message : err}`,
      );
      return false;
    }
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}