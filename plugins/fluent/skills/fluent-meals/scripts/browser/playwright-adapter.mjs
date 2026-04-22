import { chromium } from 'playwright';

export async function launchPlaywrightAdapter(options = {}) {
  const context = await chromium.launchPersistentContext(options.userDataDir, {
    headless: Boolean(options.headless),
    ...(options.useChrome === false ? {} : { channel: 'chrome' }),
  });
  const page = context.pages()[0] || (await context.newPage());

  return {
    backend: 'playwright',
    context,
    page,
    async goto(url, extra = {}) {
      await page.goto(url, {
        waitUntil: extra.waitUntil || 'domcontentloaded',
        timeout: extra.timeout ?? 45_000,
      });
      if (extra.waitForLoadState) {
        await page.waitForLoadState(extra.waitForLoadState, { timeout: extra.timeout ?? 10_000 }).catch(() => {});
      }
      return page.url();
    },
    async bringToFront() {
      await page.bringToFront();
    },
    async wait(ms) {
      await page.waitForTimeout(ms);
    },
    async screenshot(filePath) {
      return page.screenshot({ path: filePath, fullPage: true });
    },
    async close() {
      await context.close();
    },
    async firstVisible(selectors, timeoutMs = 0) {
      const startedAt = Date.now();
      while (Date.now() - startedAt <= timeoutMs) {
        for (const selector of selectors) {
          const locator = page.locator(selector);
          const count = await locator.count();
          for (let index = 0; index < count; index += 1) {
            const candidate = locator.nth(index);
            if (await candidate.isVisible().catch(() => false)) {
              return candidate;
            }
          }
        }
        if (timeoutMs === 0) {
          break;
        }
        await page.waitForTimeout(150);
      }
      return null;
    },
    async clickFirstVisible(selectors, timeoutMs = 0) {
      const locator = await this.firstVisible(selectors, timeoutMs);
      if (!locator) {
        return false;
      }
      await locator.click({ timeout: 10_000 }).catch(() => {});
      return true;
    },
    async textOfFirstVisible(selectors, timeoutMs = 0) {
      const locator = await this.firstVisible(selectors, timeoutMs);
      if (!locator) {
        return '';
      }
      return (await locator.textContent().catch(() => '')).trim();
    },
  };
}
