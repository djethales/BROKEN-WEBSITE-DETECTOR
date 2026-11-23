import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { chromium, type Browser } from 'playwright';
import { ENV, type Env } from '../../config/env';

@Injectable()
export class BrowserService implements OnModuleDestroy {
  private browser: Browser | null = null;
  private jobsSinceRestart = 0;

  constructor(@Inject(ENV) private readonly env: Env) {}

  async getBrowser(): Promise<Browser> {
    if (
      !this.browser ||
      !this.browser.isConnected() ||
      this.jobsSinceRestart >= this.env.BROWSER_RESTART_EVERY
    ) {
      await this.browser?.close().catch(() => undefined);
      this.browser = await chromium.launch({
        headless: true,
        args: ['--disable-dev-shm-usage'],
      });
      this.jobsSinceRestart = 0;
    }
    this.jobsSinceRestart += 1;
    return this.browser;
  }

  async onModuleDestroy(): Promise<void> {
    await this.browser?.close().catch(() => undefined);
    this.browser = null;
  }
}
