import {
  DEFAULT_BROWSER_DATA_DIR,
  DEFAULT_CREDENTIAL_PROVIDER,
  DEFAULT_VERIFICATION_PROVIDER,
  ensureRetailerAuthentication,
  ensureRetailerAuthenticationInPage,
} from '../../retailer-auth.mjs';

export const VOILA_PROFILE_NAME = 'voila';
export const VOILA_BASE_URL = 'https://voila.ca/';
export const VOILA_CART_URL = 'https://voila.ca/cart';
export const VOILA_ORDERS_URL = 'https://voila.ca/orders';

const SELECTORS = {
  dismiss: [
    'button[aria-label*="Close pop-up"]',
    'button[aria-label*="Close"]',
    'button:has-text("Close")',
    'button:has-text("Accept")',
    'button:has-text("I Agree")',
  ],
  loggedIn: [
    'button:has-text("Account")',
    'a[href*="/orders/"]',
    'a[href*="/settings/account"]',
    'a:has-text("My Account")',
    'button:has-text("My Account")',
    'text=/my account/i',
  ],
  productCard: [
    '.product-card-container',
    '[class*="product-card"]',
    '[data-testid*="product"]',
    'article',
  ],
  title: [
    'a[href*="/products/"]',
    '[class*="product-name"]',
    'h3',
    'h2',
  ],
  brand: ['[class*="brand"]', '.brand'],
  price: ['[class*="price"]', '.price'],
  saleBadge: ['[class*="sale"]', '[class*="promo"]', '[class*="discount"]', 'text=/sale|special|deal|save/i'],
  addToCart: [
    'button[aria-label*="Add"][aria-label*="basket"]',
    'button[aria-label*="Add to"]',
    'button[aria-label*="add to"]',
    '[class*="add-to-cart"]',
    '[class*="addToCart"]',
    '[class*="add-button"]',
    'button:has-text("Add")',
    'button[class*="action"]',
    'button:has-text("+")',
  ],
  incrementButton: [
    'button[aria-label*="Increase"]',
    'button[aria-label*="increase"]',
    'button[aria-label*="Add more"]',
    '[class*="increment"]',
    '[class*="plus"]',
    'button:has-text("+")',
  ],
  quantityDisplay: [
    '[class*="quantity"] input',
    '[class*="quantity"] span',
    'input[type="number"]',
    '[class*="stepper"] span',
    '[aria-label*="quantity"]',
  ],
};

const COUNT_UNITS = new Set([
  '',
  'pcs',
  'pieces',
  'piece',
  'count',
  'each',
  'unit',
  'units',
  'can',
  'cans',
  'bottle',
  'bottles',
  'bag',
  'bags',
  'box',
  'boxes',
  'package',
  'packages',
  'pkg',
  'bunch',
  'bunches',
  'head',
  'heads',
  'loaf',
  'loaves',
]);

export function createVoilaRetailerProfile() {
  return {
    name: VOILA_PROFILE_NAME,
    browserBackend: 'playwright',
    async ensureAuthenticated(options = {}) {
      return ensureRetailerAuthentication({
        credentialProvider: options.credentialProvider || DEFAULT_CREDENTIAL_PROVIDER,
        headless: options.headless,
        loginTimeoutMs: options.loginTimeoutMs,
        retailerAccount: options.retailerAccount,
        store: VOILA_PROFILE_NAME,
        useChrome: options.useChrome,
        userDataDir: options.userDataDir || DEFAULT_BROWSER_DATA_DIR,
        verificationProvider: options.verificationProvider || DEFAULT_VERIFICATION_PROVIDER,
        gogAccount: options.gogAccount,
        verificationEmail: options.verificationEmail,
      });
    },
    async ensureAuthenticatedInBrowser(adapter, options = {}) {
      return ensureRetailerAuthenticationInPage({
        allowManualVerification: options.allowManualVerification === true,
        credentialProvider: options.credentialProvider || DEFAULT_CREDENTIAL_PROVIDER,
        gogAccount: options.gogAccount,
        loginTimeoutMs: options.loginTimeoutMs,
        page: adapter.page,
        retailerAccount: options.retailerAccount,
        store: VOILA_PROFILE_NAME,
        verificationCode: options.verificationCode ?? null,
        verificationEmail: options.verificationEmail,
        verificationProvider: options.verificationProvider || DEFAULT_VERIFICATION_PROVIDER,
      });
    },
    hydrateExport(exportData) {
      return hydrateVoilaExport(exportData);
    },
    async openRetailer(adapter) {
      await adapter.goto(VOILA_BASE_URL, { waitForLoadState: 'domcontentloaded' });
      await adapter.bringToFront();
      await dismissPopups(adapter.page);
      const authenticated = await detectLoggedInState(adapter.page);
      return {
        url: adapter.page.url(),
        authenticated,
      };
    },
    async readCartSummary(adapter) {
      return readVoilaCartSummary(adapter.page);
    },
    async readCartItems(adapter) {
      return readVoilaCartItems(adapter.page);
    },
    async readConfirmedOrderDetails(adapter, options = {}) {
      return readVoilaConfirmedOrderDetails(adapter.page, options);
    },
    async addItems(adapter, hydratedExport) {
      const items = Array.isArray(hydratedExport?.items) ? hydratedExport.items : [];
      const results = [];

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        results.push(await addVoilaItem(adapter.page, item, index, items.length));
      }

      const added = results.filter((item) => item.added === true).length;
      const failed = results.filter((item) => item.added !== true).length;
      const partialQuantity = results.filter((item) => item.quantityOutcome === 'partial').length;
      const quantityMatches = results.filter((item) => item.quantityOutcome === 'matched').length;

      return {
        items: results,
        summary: {
          total: results.length,
          added,
          failed,
          partialQuantity,
          quantityMatches,
        },
      };
    },
    async reachExecutionReadyState(adapter, context = {}) {
      const cartStart = context.cartStart ?? null;
      await adapter.goto(VOILA_CART_URL, { waitForLoadState: 'domcontentloaded' });
      await dismissPopups(adapter.page);
      const cartEnd = await readVoilaCartSummary(adapter.page);
      const addedCount = Number(context.summary?.added ?? 0);
      const cartChanged =
        typeof cartStart?.itemCount === 'number' && typeof cartEnd?.itemCount === 'number'
          ? cartEnd.itemCount >= cartStart.itemCount
          : false;
      const executionReady = addedCount > 0 && (cartChanged || cartEnd.itemCount > 0 || adapter.page.url().includes('/cart'));

      return {
        ok: executionReady,
        executionReady,
        cart: {
          changed: cartChanged,
          start: cartStart,
          end: cartEnd,
        },
      };
    },
  };
}

export function hydrateVoilaExport(exportData) {
  const items = Array.isArray(exportData?.items) ? exportData.items : [];
  return {
    store: VOILA_PROFILE_NAME,
    itemCount: items.length,
    items: items.map((item) => ({
      itemKey: typeof item?.itemKey === 'string' && item.itemKey.trim() ? item.itemKey.trim() : null,
      name: String(item?.name || '').trim(),
      amount: typeof item?.amount === 'number' ? item.amount : Number(item?.amount) || null,
      unit: String(item?.unit || '').trim(),
      orderingPolicy: String(item?.orderingPolicy || '').trim() || 'flexible_match',
      searchQuery: String(item?.searchQuery || item?.name || '').trim(),
      preferredBrands: compactStrings(item?.preferredBrands),
      avoidBrands: compactStrings(item?.avoidBrands),
      allowedSubstituteQueries: compactStrings(item?.allowedSubstituteQueries),
      blockedSubstituteTerms: compactStrings(item?.blockedSubstituteTerms),
      sourceMeals: compactStrings(item?.sourceMeals),
      sourceRecipeNames: compactStrings(item?.sourceRecipeNames),
      reasons: compactStrings(item?.reasons),
      uncertainty: item?.uncertainty ?? null,
      note: item?.note ?? null,
    })),
  };
}

export function buildVoilaSearchQueries(item) {
  const candidates = [
    item?.searchQuery,
    item?.name,
    ...compactStrings(item?.allowedSubstituteQueries),
  ];
  const unique = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(String(candidate).trim());
  }
  return unique;
}

export function scoreVoilaCandidate(item, query, candidate) {
  const title = normalizeText(candidate.title);
  const brand = normalizeText(candidate.brand);
  const haystack = `${brand} ${title}`.trim();
  const queryTokens = tokenize(query);
  const coreTokens = queryTokens.filter((token) => token.length > 2);
  const relevantTokens = coreTokens.length > 0 ? coreTokens : queryTokens;
  const overlap = relevantTokens.filter((token) => haystack.includes(token));
  const overlapRatio = relevantTokens.length > 0 ? overlap.length / relevantTokens.length : 0;
  let score = overlapRatio * 10;

  if (relevantTokens.length > 0 && overlap.length === relevantTokens.length) {
    score += 5;
  }

  const preferredBrands = compactStrings(item?.preferredBrands).map(normalizeText);
  if (preferredBrands.some((brandValue) => brandValue && haystack.includes(brandValue))) {
    score += 4;
  }

  const avoidBrands = compactStrings(item?.avoidBrands).map(normalizeText);
  if (avoidBrands.some((brandValue) => brandValue && haystack.includes(brandValue))) {
    score -= 8;
  }

  const blockedTerms = compactStrings(item?.blockedSubstituteTerms).map(normalizeText);
  for (const blockedTerm of blockedTerms) {
    if (blockedTerm && title.includes(blockedTerm) && !normalizeText(item?.name).includes(blockedTerm)) {
      score -= 6;
    }
  }

  if (item?.orderingPolicy === 'direct_match' && overlap.length !== relevantTokens.length) {
    score -= 2;
  }

  if (candidate.onSale) {
    score += 1;
  }

  return score;
}

export function deriveVoilaProductReference(value) {
  const href = String(value || '').trim();
  if (!href) {
    return {
      productKey: null,
      productUrl: null,
    };
  }

  try {
    const url = new URL(href, VOILA_BASE_URL);
    const pathname = url.pathname.replace(/\/+$/, '').toLowerCase();
    return {
      productKey: pathname.includes('/products/') ? pathname : null,
      productUrl: `${url.origin}${url.pathname}`.replace(/\/+$/, ''),
    };
  } catch {
    return {
      productKey: null,
      productUrl: null,
    };
  }
}

export function determineVoilaQuantityTarget(item) {
  const normalizedUnit = String(item?.unit || '').trim().toLowerCase();
  const requestedAmount = Number(item?.amount);
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 1) {
    return 1;
  }
  if (!COUNT_UNITS.has(normalizedUnit)) {
    return 1;
  }
  return Math.max(1, Math.min(Math.round(requestedAmount), 6));
}

async function addVoilaItem(page, item, index, total) {
  const queries = buildVoilaSearchQueries(item);
  if (queries.length === 0) {
    return buildFailureResult(item, 'no_search_queries');
  }

  await dismissPopups(page);
  for (const query of queries) {
    await page.goto(buildSearchUrl(query), { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(1_500);
    await dismissPopups(page);
    const selection = await selectBestVoilaCard(page, item, query);
    if (!selection) {
      continue;
    }

    const addResult = await addSelectedVoilaCard(selection, item);
    if (addResult.added) {
      return {
        itemKey: item.itemKey ?? null,
        name: item.name,
        added: true,
        matched: true,
        failureReason: null,
        searchQueries: queries,
        selectedQuery: query,
        productTitle: selection.title,
        productBrand: selection.brand,
        productKey: selection.productKey ?? null,
        productUrl: selection.productUrl ?? null,
        quantityTarget: determineVoilaQuantityTarget(item),
        quantityOutcome: addResult.quantityOutcome,
        itemIndex: index,
        totalItems: total,
      };
    }
  }

  return buildFailureResult(item, 'no_confident_match', queries);
}

async function selectBestVoilaCard(page, item, query) {
  const cardSelector = SELECTORS.productCard.join(', ');
  const cards = page.locator(cardSelector);
  const count = Math.min(await cards.count(), 12);
  let best = null;

  for (let index = 0; index < count; index += 1) {
    const card = cards.nth(index);
    if (!(await card.isVisible().catch(() => false))) {
      continue;
    }

    const title = await readFirstText(card, SELECTORS.title);
    if (!title) {
      continue;
    }
    const brand = await readFirstText(card, SELECTORS.brand);
    const productUrl = await readFirstHref(card, SELECTORS.title);
    const productReference = deriveVoilaProductReference(productUrl);
    const onSale = await isAnyVisibleWithin(card, SELECTORS.saleBadge);
    const candidate = {
      card,
      page,
      title,
      brand,
      onSale,
      productKey: productReference.productKey,
      productUrl: productReference.productUrl,
    };
    const score = scoreVoilaCandidate(item, query, candidate);
    if (!best || score > best.score) {
      best = { ...candidate, score };
    }
  }

  if (!best || best.score < 3) {
    return null;
  }

  return best;
}

async function addSelectedVoilaCard(selection, item) {
  const added = await clickAddToCart(selection.card);
  if (!added) {
    return {
      added: false,
      quantityOutcome: 'failed',
    };
  }

  await selection.page.waitForTimeout(1_000);
  const quantityTarget = determineVoilaQuantityTarget(item);
  if (quantityTarget <= 1) {
    return {
      added: true,
      quantityOutcome: 'matched',
    };
  }

  let currentQuantity = 1;
  for (let attempt = 0; attempt < quantityTarget - 1; attempt += 1) {
    const incremented = await clickIncrement(selection.card);
    if (!incremented) {
      return {
        added: true,
        quantityOutcome: 'partial',
      };
    }
    currentQuantity += 1;
    await selection.page.waitForTimeout(500);
  }

  return {
    added: true,
    quantityOutcome: currentQuantity >= quantityTarget ? 'matched' : 'partial',
  };
}

async function clickAddToCart(card) {
  for (const selector of SELECTORS.addToCart) {
    const locator = card.locator(selector).first();
    if ((await locator.count()) === 0) continue;
    if (!(await locator.isVisible().catch(() => false))) continue;
    await locator.click({ timeout: 10_000 }).catch(() => {});
    return true;
  }

  const fallback = card.getByRole('button', { name: /add/i }).first();
  if ((await fallback.count()) > 0 && (await fallback.isVisible().catch(() => false))) {
    await fallback.click({ timeout: 10_000 }).catch(() => {});
    return true;
  }

  return false;
}

async function clickIncrement(card) {
  for (const selector of SELECTORS.incrementButton) {
    const locator = card.locator(selector).first();
    if ((await locator.count()) === 0) continue;
    if (!(await locator.isVisible().catch(() => false))) continue;
    await locator.click({ timeout: 10_000 }).catch(() => {});
    return true;
  }
  return clickAddToCart(card);
}

async function readVoilaCartSummary(page) {
  try {
    const cartButton = page.locator('button[aria-label*="Cart"]').first();
    const cartButtonVisible = await cartButton.isVisible({ timeout: 1_000 }).catch(() => false);
    const cartLabel = cartButtonVisible ? await cartButton.getAttribute('aria-label').catch(() => '') : '';
    const summaryText = await page
      .locator('text=/Total number of items in your cart/i')
      .first()
      .textContent({ timeout: 1_000 })
      .catch(() => '');

    return {
      itemCount: extractFirstInteger(summaryText || cartLabel),
      total: extractCurrencyValue(cartLabel),
      url: page.url(),
    };
  } catch {
    return {
      itemCount: 0,
      total: null,
      url: page.url(),
    };
  }
}

async function readVoilaCartItems(page) {
  try {
    await page.goto(VOILA_CART_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(1_000);
    await dismissPopups(page);

    const pageText = await page.locator('body').innerText().catch(() => '');
    const directCartLooksBroken = /page not found\./i.test(pageText || '');
    if (directCartLooksBroken) {
      await page.goto(VOILA_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.waitForTimeout(1_000);
      await dismissPopups(page);
      await openQuickViewCart(page);
    }

    const selectors = [
      '[role="dialog"] a[href*="/products/"]',
      '[aria-modal="true"] a[href*="/products/"]',
      '[class*="cart"] a[href*="/products/"]',
      '[data-testid*="cart"] a[href*="/products/"]',
      'main a[href*="/products/"]',
    ];

    const items = [];
    for (const selector of selectors) {
      const locator = page.locator(selector);
      const count = Math.min(await locator.count().catch(() => 0), 50);
      for (let index = 0; index < count; index += 1) {
        const entry = locator.nth(index);
        const text = (await entry.textContent().catch(() => '')).trim();
        if (text) {
          const href = await entry.getAttribute('href').catch(() => null);
          const productReference = deriveVoilaProductReference(href);
          items.push({
            productKey: productReference.productKey,
            productUrl: productReference.productUrl,
            title: text,
          });
        }
      }
      if (items.length > 0) {
        break;
      }
    }

    const seen = new Set();
    return items
      .map((item) => ({
        productKey: typeof item?.productKey === 'string' && item.productKey.trim() ? item.productKey.trim() : null,
        productUrl: typeof item?.productUrl === 'string' && item.productUrl.trim() ? item.productUrl.trim() : null,
        title: String(item?.title || '').trim(),
      }))
      .filter((item) => item.title.length > 0)
      .filter((item) => {
        const key = item.productKey ?? normalizeText(item.title);
        if (!key || seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
  } catch {
    return [];
  }
}

async function openQuickViewCart(page) {
  const button = page.locator('button[aria-label*="Open quick view cart"], button[aria-label*="Cart"]').first();
  if ((await button.count().catch(() => 0)) === 0) {
    return false;
  }
  const visible = await button.isVisible().catch(() => false);
  if (!visible) {
    return false;
  }
  await button.click({ timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(1_000);
  return true;
}

async function readVoilaConfirmedOrderDetails(page, options = {}) {
  const requestedOrderId = String(options.orderId || '').trim();
  const recovered = await openVoilaOrderDetailsPage(page, requestedOrderId);
  await page.waitForTimeout(1_000);
  await dismissPopups(page);

  const orderId =
    requestedOrderId ||
    extractOrderIdFromUrl(page.url()) ||
    (await page.locator('text=/^\\d{10,}$/').first().textContent().catch(() => '')).trim() ||
    null;

  const slotWindow = await readFirstVisibleText(page, [
    'main text=/\\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\\b.*\\d{1,2}:\\d{2}(?:am|pm).*\\d{1,2}:\\d{2}(?:am|pm)/i',
    'text=/\\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\\b.*\\d{1,2}:\\d{2}(?:am|pm).*\\d{1,2}:\\d{2}(?:am|pm)/i',
  ]);
  const statusLine = await readFirstVisibleText(page, [
    'h1',
    'main text=/edit this order|order details|upcoming/i',
  ]);
  const totalText = await readFirstVisibleText(page, [
    'text=/Summary/i',
    'text=/\\$[0-9]+(?:\\.[0-9]{2})?/',
  ]);

  const items = await page.evaluate(() => {
    const root = document.querySelector('main') ?? document.body;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const values = [];
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent?.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      if (text.length < 2) continue;
      values.push(text);
    }
    return values;
  });

  const ignore = [
    /^products list$/i,
    /^summary$/i,
    /^items$/i,
    /^back$/i,
    /^remove$/i,
    /^edit$/i,
    /^\$[0-9]+(?:\.[0-9]{2})?$/,
    /^\d+$/,
    /^you can edit this order/i,
    /^delivery address$/i,
    /^payment method$/i,
    /^order details$/i,
  ];

  const normalizedItems = [];
  const seen = new Set();
  for (const text of items) {
    if (ignore.some((pattern) => pattern.test(text))) continue;
    if (extractOrderIdFromText(text) && text === orderId) continue;
    if (/^(Tue|Wed|Thu|Fri|Sat|Sun|Mon)\b/i.test(text) && /\d{1,2}:\d{2}(am|pm)/i.test(text)) continue;
    if (/^\$[0-9]+(?:\.[0-9]{2})?$/.test(text)) continue;
    const key = normalizeText(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    normalizedItems.push({ title: text, quantity: 1 });
  }

  return {
    confirmedAt: String(options.confirmedAt || '').trim() || new Date().toISOString(),
    orderId,
    recoveredViaOrdersPage: recovered === true,
    retailer: VOILA_PROFILE_NAME,
    slotWindow: slotWindow || null,
    status: statusLine || 'order_confirmed',
    summary: {
      total: extractCurrencyValue(totalText),
      url: page.url(),
    },
    items: normalizedItems,
  };
}

async function openVoilaOrderDetailsPage(page, orderId) {
  const currentUrl = page.url();
  if (extractOrderIdFromUrl(currentUrl) && currentUrl.includes('/details')) {
    return false;
  }

  if (orderId) {
    await page.goto(`${VOILA_ORDERS_URL}/${orderId}/details`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    return false;
  }

  await page.goto(VOILA_ORDERS_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await dismissPopups(page);
  const detailLink = page.locator('a[href*="/orders/"][href$="/details"]').first();
  if ((await detailLink.count().catch(() => 0)) > 0) {
    await detailLink.click({ timeout: 10_000 }).catch(async () => {
      const href = await detailLink.getAttribute('href').catch(() => null);
      if (href) {
        const url = href.startsWith('http') ? href : `${VOILA_BASE_URL.replace(/\/$/, '')}${href.startsWith('/') ? '' : '/'}${href}`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      }
    });
    return true;
  }

  throw new Error('Could not locate a Voila order details page to confirm the placed order.');
}

function extractOrderIdFromUrl(url) {
  const match = String(url || '').match(/\/orders\/(\d+)\/details/i);
  return match ? match[1] : null;
}

function extractOrderIdFromText(text) {
  const match = String(text || '').match(/^\d{10,}$/);
  return match ? match[0] : null;
}

async function readFirstVisibleText(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count().catch(() => 0)) === 0) continue;
    const text = (await locator.textContent().catch(() => '')).trim();
    if (text) return text;
  }
  return '';
}

async function detectLoggedInState(page) {
  for (const selector of SELECTORS.loggedIn) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0 && (await locator.isVisible().catch(() => false))) {
      return true;
    }
  }
  return false;
}

async function dismissPopups(page) {
  for (const selector of SELECTORS.dismiss) {
    const button = page.locator(selector).first();
    if ((await button.count()) === 0) continue;
    if (!(await button.isVisible().catch(() => false))) continue;
    await button.click({ timeout: 3_000 }).catch(() => {});
    await page.waitForTimeout(200);
  }
}

async function readFirstText(root, selectors) {
  for (const selector of selectors) {
    const locator = root.locator(selector).first();
    if ((await locator.count()) === 0) continue;
    const text = (await locator.textContent().catch(() => '')).trim();
    if (text) {
      return text;
    }
  }
  return '';
}

async function readFirstHref(root, selectors) {
  for (const selector of selectors) {
    const locator = root.locator(selector).first();
    if ((await locator.count()) === 0) continue;
    const href = (await locator.getAttribute('href').catch(() => '')).trim();
    if (href) {
      return href;
    }
  }
  return '';
}

async function isAnyVisibleWithin(root, selectors) {
  for (const selector of selectors) {
    const locator = root.locator(selector).first();
    if ((await locator.count()) > 0 && (await locator.isVisible().catch(() => false))) {
      return true;
    }
  }
  return false;
}

function buildSearchUrl(query) {
  return `https://voila.ca/search?q=${encodeURIComponent(query)}`;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(value) {
  return normalizeText(value)
    .split(/\s+/)
    .filter(Boolean);
}

function compactStrings(value) {
  return Array.isArray(value)
    ? value.map((entry) => String(entry || '').trim()).filter(Boolean)
    : [];
}

function buildFailureResult(item, failureReason, searchQueries = []) {
  return {
    itemKey: item?.itemKey ?? null,
    name: item?.name || '',
    added: false,
    matched: false,
    failureReason,
    searchQueries,
    selectedQuery: null,
    productTitle: null,
    productBrand: null,
    productKey: null,
    productUrl: null,
    quantityTarget: determineVoilaQuantityTarget(item),
    quantityOutcome: 'failed',
  };
}

function extractFirstInteger(value) {
  const match = String(value || '').match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function extractCurrencyValue(value) {
  const match = String(value || '').match(/\$([0-9]+(?:\.[0-9]{2})?)/);
  return match ? Number(match[1]) : null;
}
