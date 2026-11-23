import { Inject, Injectable, Logger } from '@nestjs/common';
import type { BrowserContext, ConsoleMessage, Page, Request, Response } from 'playwright';
import { ENV, type Env } from '../../config/env';
import type { DomMetrics, NavigationInfo } from '../../common/types';
import { groupEntries, type RawLog } from '../../rules/group-entries';
import { isFirstParty } from '../../rules/normalize';
import { BrowserService } from './browser.service';
import { CHALLENGE_PATTERN, VIEWPORT_SIZES, type ViewportName } from './constants';

export interface ViewportCapture {
  viewport: ViewportName;
  navigation: NavigationInfo;
  entries: ReturnType<typeof groupEntries>;
  dom: DomMetrics;
  tokenHosts: string[];
}

export interface InspectionResult {
  captures: ViewportCapture[];
  durationMs: number;
}

const EMPTY_DOM: DomMetrics = {
  stylesheetLinks: 0,
  accessibleStylesheets: 0,
  cssRulesTotal: 0,
  scriptCount: 0,
  visibleTextLength: 0,
  scrollHeight: 0,
  hasH1: false,
  hasHeader: false,
  hasMain: false,
  hasFooter: false,
  hasNav: false,
};

@Injectable()
export class InspectorService {
  private readonly logger = new Logger(InspectorService.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly browsers: BrowserService,
  ) {}

  async inspect(pageUrl: string): Promise<InspectionResult> {
    const started = Date.now();
    const browser = await this.browsers.getBrowser();
    const captures: ViewportCapture[] = [];
    for (const viewport of this.env.VIEWPORTS) {
      captures.push(await this.capture(browser, pageUrl, viewport));
    }
    return { captures, durationMs: Date.now() - started };
  }

  private async capture(
    browser: Awaited<ReturnType<BrowserService['getBrowser']>>,
    pageUrl: string,
    viewport: ViewportName,
  ): Promise<ViewportCapture> {
    const size = VIEWPORT_SIZES[viewport];
    const context = await browser.newContext({
      userAgent: this.env.MONITOR_USER_AGENT,
      viewport: size,
      ignoreHTTPSErrors: false,
    });
    const tokenHosts: string[] = [];
    const raw: RawLog[] = [];
    let page: Page | null = null;
    try {
      await this.installTokenRoute(context, pageUrl, tokenHosts);
      page = await context.newPage();
      const navigation = await this.collect(page, pageUrl, raw);
      const dom = navigation.error ? EMPTY_DOM : await this.readDom(page);
      return {
        viewport,
        navigation,
        dom,
        tokenHosts,
        entries: groupEntries(raw, pageUrl, this.env.MAX_LOG_ENTRIES, this.env.MAX_LOG_TEXT_LENGTH),
      };
    } finally {
      await page?.close().catch(() => undefined);
      await context.close().catch(() => undefined);
    }
  }

  private async installTokenRoute(
    context: BrowserContext,
    pageUrl: string,
    tokenHosts: string[],
  ): Promise<void> {
    await context.route('**/*', async (route) => {
      const request = route.request();
      const headers = { ...request.headers() };
      delete headers['x-monitor-token'];
      const url = request.url();
      if (isFirstParty(url, pageUrl)) {
        headers['x-monitor-token'] = this.env.MONITOR_TOKEN;
        try {
          tokenHosts.push(new URL(url).hostname);
        } catch {
          this.logger.debug('URL de requête illisible pour l’audit du jeton');
        }
      }
      await route.continue({ headers });
    });
  }

  private async collect(page: Page, pageUrl: string, raw: RawLog[]): Promise<NavigationInfo> {
    page.on('console', (message: ConsoleMessage) => {
      const type = message.type();
      if (type !== 'error' && !(this.env.CAPTURE_WARNINGS && type === 'warning')) {
        return;
      }
      raw.push({
        source: 'console',
        level: type,
        text: message.text(),
        url: message.location().url || undefined,
      });
    });
    page.on('pageerror', (error: Error) => {
      raw.push({ source: 'pageerror', level: 'error', text: `${error.name}: ${error.message}` });
    });
    page.on('requestfailed', (request: Request) => {
      const errorText = request.failure()?.errorText ?? 'failed';
      if (errorText === 'net::ERR_ABORTED') {
        return;
      }
      raw.push({
        source: 'network',
        level: 'error',
        text: errorText,
        url: request.url(),
        resourceType: request.resourceType(),
        status: 'failed',
      });
    });
    page.on('response', (response: Response) => {
      if (response.status() < 400) {
        return;
      }
      raw.push({
        source: 'network',
        level: 'error',
        text: `HTTP ${response.status()}`,
        url: response.url(),
        resourceType: response.request().resourceType(),
        status: String(response.status()),
      });
    });

    let response: Response | null = null;
    let error: string | null = null;
    try {
      response = await page.goto(pageUrl, {
        waitUntil: 'load',
        timeout: this.env.INSPECT_TIMEOUT_MS,
      });
      await Promise.race([
        page.waitForLoadState('networkidle'),
        new Promise((resolve) => setTimeout(resolve, this.env.NETWORKIDLE_CAP_MS)),
      ]);
      await new Promise((resolve) => setTimeout(resolve, this.env.LOG_SETTLE_MS));
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'erreur de navigation';
    }

    const sample = error
      ? ''
      : await page
          .evaluate(() => {
            const title = document.title || '';
            const body = document.body && document.body.innerText ? document.body.innerText.slice(0, 500) : '';
            return `${title}\n${body}`;
          })
          .catch(() => '');
    const challenge = CHALLENGE_PATTERN.test(sample);
    const status = response?.status() ?? null;
    const blocked =
      status === 401 ||
      status === 403 ||
      status === 429 ||
      challenge ||
      (status === 503 && challenge);
    let redirectCount = 0;
    let current: Request | null | undefined = response?.request();
    while (current?.redirectedFrom()) {
      redirectCount += 1;
      current = current.redirectedFrom();
    }
    return {
      documentStatus: status,
      finalUrl: response?.url() ?? null,
      redirectCount,
      error: blocked ? null : error,
      blocked,
      challenge,
    };
  }

  private async readDom(page: Page): Promise<DomMetrics> {
    try {
      const metrics = await page.evaluate(() => {
        const text = document.body ? document.body.innerText : '';
        let accessible = 0;
        let rules = 0;
        for (const sheet of Array.from(document.styleSheets)) {
          try {
            rules += sheet.cssRules ? sheet.cssRules.length : 0;
            accessible += 1;
          } catch {
            // Feuille cross-origin : cssRules est illisible.
          }
        }
        return {
          stylesheetLinks: document.querySelectorAll('link[rel~="stylesheet"]').length,
          accessibleStylesheets: accessible,
          cssRulesTotal: rules,
          scriptCount: document.scripts.length,
          visibleTextLength: text.trim().length,
          scrollHeight: document.documentElement ? document.documentElement.scrollHeight : 0,
          hasH1: Boolean(document.querySelector('h1')),
          hasHeader: Boolean(document.querySelector('header')),
          hasMain: Boolean(document.querySelector('main')),
          hasFooter: Boolean(document.querySelector('footer')),
          hasNav: Boolean(document.querySelector('nav')),
        };
      });
      return { ...EMPTY_DOM, ...metrics };
    } catch {
      return EMPTY_DOM;
    }
  }
}
