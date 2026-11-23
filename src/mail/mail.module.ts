import { Inject, Injectable, Logger, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env';

export interface OutboundMail {
  to: string[];
  subject: string;
  text: string;
}

export interface MailProvider {
  send(mail: OutboundMail): Promise<void>;
}

@Injectable()
export class MailService implements MailProvider {
  private readonly logger = new Logger(MailService.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  async send(mail: OutboundMail): Promise<void> {
    if (mail.to.length === 0) {
      throw new Error('Aucun destinataire');
    }
    if (this.env.MAIL_PROVIDER === 'console') {
      this.logger.log({ to: mail.to, subject: mail.subject, text: mail.text }, 'email');
      return;
    }
    if (this.env.MAIL_PROVIDER === 'resend') {
      await this.post('https://api.resend.com/emails', {
        authorization: `Bearer ${this.env.MAIL_API_KEY}`,
        body: { from: this.env.MAIL_FROM, to: mail.to, subject: mail.subject, text: mail.text },
      });
      return;
    }
    await this.post('https://api.brevo.com/v3/smtp/email', {
      apiKey: this.env.MAIL_API_KEY,
      body: {
        sender: { email: this.env.MAIL_FROM },
        to: mail.to.map((email) => ({ email })),
        subject: mail.subject,
        textContent: mail.text,
      },
    });
  }

  private async post(
    url: string,
    input: { authorization?: string; apiKey?: string; body: unknown },
  ): Promise<void> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (input.authorization) {
      headers.authorization = input.authorization;
    }
    if (input.apiKey) {
      headers['api-key'] = input.apiKey;
    }
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(input.body) });
    if (!response.ok) {
      throw new Error(`Envoi d'email refusé (${response.status})`);
    }
  }
}

@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
