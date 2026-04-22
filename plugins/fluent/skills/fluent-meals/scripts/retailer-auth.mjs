import crypto from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { FLUENT_MEALS_BROWSER_DATA_DIR } from './runtime-paths.mjs';

const execFile = promisify(execFileCallback);

export const DEFAULT_CREDENTIAL_PROVIDER = 'interactive';
export const SUPPORTED_CREDENTIAL_PROVIDERS = ['interactive', 'bitwarden', 'env'];
export const DEFAULT_VERIFICATION_PROVIDER = 'gog';
export const VOILA_BASE_URL = 'https://voila.ca/';
export const VOILA_LOGIN_URL = 'https://voila.ca/login';
export const DEFAULT_BROWSER_DATA_DIR = FLUENT_MEALS_BROWSER_DATA_DIR;
export const BITWARDEN_SCRIPT_PATH =
  process.env.FLUENT_BITWARDEN_SCRIPT_PATH?.trim() || process.env.BITWARDEN_SCRIPT_PATH?.trim() || null;
export const DEFAULT_VERIFICATION_CODE_LENGTH = 6;

const VOILA_SELECTORS = {
  dismiss: [
    'button[aria-label*="Close pop-up"]',
    'button[aria-label*="Close"]',
    'button:has-text("Close")',
    'button:has-text("Accept")',
    'button:has-text("I Agree")',
  ],
  loginPageHeading: [
    'h1:has-text("Please Sign In")',
    'h2:has-text("Log in with your email and password:")',
  ],
  email: [
    'input[placeholder*="Email"]',
    'input[aria-label*="Email"]',
    'input[type="email"]',
    'input[name*="email" i]',
  ],
  password: [
    'input[placeholder*="Password"]',
    'input[aria-label*="Password"]',
    'input[type="password"]',
    'input[name*="password" i]',
  ],
  submit: [
    'button:has-text("Submit")',
    'button[aria-label*="Submit" i]',
    'button[aria-label*="Click Here to Submit" i]',
    'button[type="submit"]',
    'input[type="submit"]',
  ],
  loggedIn: [
    'button:has-text("Account")',
    'a[href*="/orders/"]',
    'a[href*="/settings/account"]',
    'a:has-text("My Account")',
    'button:has-text("My Account")',
    'text=/my account/i',
  ],
  loggedOut: [
    'button:has-text("Sign in")',
    'a:has-text("Sign in")',
    'text=/please sign in/i',
  ],
  otpInputs: [
    'input[autocomplete="one-time-code"]',
    'input[name*="otp" i]',
    'input[name*="code" i]',
    'input[placeholder*="code" i]',
    'input[inputmode="numeric"]',
  ],
  otpSubmit: [
    'button:has-text("Verify")',
    'button:has-text("Continue")',
    'button:has-text("Submit")',
    'button[type="submit"]',
  ],
  manualVerification: [
    'text=/verifying your account/i',
    'text=/select a method to verify/i',
    'text=/verify your voilà account/i',
  ],
  verificationCodeInput: [
    'input[name*="Code" i]',
    'input[aria-label*="Enter code" i]',
    'input[name*="emailCode" i]',
  ],
  verificationSubmit: [
    'button:has-text("Verify")',
    'button:has-text("Continue")',
    'button:has-text("Submit")',
    'button:has-text("Next")',
    'button:has-text("Done")',
    '[role="button"]:has-text("Verify")',
    '[role="button"]:has-text("Continue")',
    '[role="button"]:has-text("Submit")',
    '[role="button"]:has-text("Next")',
    'button[aria-label*="Verify" i]',
    'button[aria-label*="Continue" i]',
    'button[aria-label*="Next" i]',
    'input[type="button"]',
    'input[type="submit"]',
    'input[type="button"][value*="Verify" i]',
    'input[type="button"][value*="Continue" i]',
    'input[type="button"][value*="Next" i]',
  ],
  errors: [
    '[role="alert"]',
    '[aria-live="assertive"]',
    '.gigya-error-msg',
    '.gigya-error-display',
  ],
};

export class RetailerVerificationRequiredError extends Error {
  constructor(options = {}) {
    super(options.message || 'Retailer requested an email verification code.');
    this.name = 'RetailerVerificationRequiredError';
    this.codeLength = Number.isFinite(Number(options.codeLength))
      ? Number(options.codeLength)
      : DEFAULT_VERIFICATION_CODE_LENGTH;
    this.deliveryHint = options.deliveryHint ? String(options.deliveryHint) : null;
    this.provider = 'agent_assisted_email_code';
    this.requestedAt = options.requestedAt ? String(options.requestedAt) : new Date().toISOString();
    this.verificationEmail = options.verificationEmail ? String(options.verificationEmail) : null;
  }
}

export function isRetailerVerificationRequiredError(error) {
  return error instanceof RetailerVerificationRequiredError;
}

export function normalizeCredentialProvider(value) {
  const normalized = String(value || DEFAULT_CREDENTIAL_PROVIDER).trim().toLowerCase();
  if (normalized === 'session_only') {
    throw new Error(
      'Credential provider "session_only" has been removed because Voila session reuse is not durable across browser restarts. Use "bitwarden", "env", or "interactive"; all still try to reuse an existing session before logging in again.',
    );
  }
  if (!SUPPORTED_CREDENTIAL_PROVIDERS.includes(normalized)) {
    throw new Error(
      `Unsupported credential provider "${value}". Expected one of: ${SUPPORTED_CREDENTIAL_PROVIDERS.join(', ')}.`,
    );
  }
  return normalized;
}

export function normalizeVerificationProvider(value, fallback = DEFAULT_VERIFICATION_PROVIDER) {
  const normalized = String(value || fallback).trim().toLowerCase();
  if (!['gog', 'manual'].includes(normalized)) {
    throw new Error(`Unsupported verification provider "${value}". Expected one of: gog, manual.`);
  }
  return normalized;
}

export function getProviderEnvConfig(store, env = process.env) {
  const normalizedStore = String(store || 'voila').trim().toUpperCase();
  const read = (...names) => {
    for (const name of names) {
      const value = env[name];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return null;
  };

  return {
    username: read(`FLUENT_${normalizedStore}_USERNAME`, 'FLUENT_RETAILER_USERNAME'),
    password: read(`FLUENT_${normalizedStore}_PASSWORD`, 'FLUENT_RETAILER_PASSWORD'),
    totp: read(`FLUENT_${normalizedStore}_TOTP`, 'FLUENT_RETAILER_TOTP'),
    totpSecret: read(`FLUENT_${normalizedStore}_TOTP_SECRET`, 'FLUENT_RETAILER_TOTP_SECRET'),
  };
}

export function resolveEnvCredentials(store, env = process.env) {
  const config = getProviderEnvConfig(store, env);
  if (!config.username || !config.password) {
    throw new Error(`Env credential provider requires username and password for ${store}.`);
  }

  return {
    provider: 'env',
    username: config.username,
    password: config.password,
    totp: config.totp || (config.totpSecret ? generateTotpCode(config.totpSecret) : null),
    accountLabel: `env:${store}`,
  };
}

export function generateTotpCode(secret, options = {}) {
  const cleaned = String(secret || '').replace(/\s+/g, '').toUpperCase();
  if (!cleaned) {
    throw new Error('TOTP secret is empty.');
  }

  const digits = Number.isInteger(options.digits) ? options.digits : 6;
  const period = Number.isInteger(options.period) ? options.period : 30;
  const timestampMs = Number.isInteger(options.timestampMs) ? options.timestampMs : Date.now();
  const counter = Math.floor(timestampMs / 1000 / period);
  const key = decodeBase32(cleaned);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', key).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export async function resolveBitwardenCredentials({
  retailerAccount,
  bwScriptPath = BITWARDEN_SCRIPT_PATH,
  powershellPath,
}) {
  if (!retailerAccount?.trim()) {
    throw new Error('Bitwarden credential provider requires --retailer-account.');
  }

  await runBitwardenAction({
    action: 'ensure-session',
    bwScriptPath,
    powershellPath,
    expectJson: true,
  });

  const lookupArgs = buildBitwardenLookupArgs(retailerAccount.trim());
  const item = await runBitwardenAction({
    action: 'get-item',
    bwScriptPath,
    powershellPath,
    expectJson: true,
    ...lookupArgs,
  });

  const username = item?.login?.username ? String(item.login.username) : null;
  const password = item?.login?.password ? String(item.login.password) : null;
  if (!username || !password) {
    throw new Error(`Bitwarden item "${retailerAccount}" is missing login username or password.`);
  }

  let totp = null;
  try {
    const rawTotp = await runBitwardenAction({
      action: 'get-secret',
      field: 'totp',
      bwScriptPath,
      powershellPath,
      expectJson: false,
      ...lookupArgs,
    });
    if (typeof rawTotp === 'string' && rawTotp.trim()) {
      totp = rawTotp.trim();
    }
  } catch {
    totp = null;
  }

  return {
    provider: 'bitwarden',
    username,
    password,
    totp,
    accountLabel: item?.name ? String(item.name) : retailerAccount.trim(),
  };
}

export function buildBitwardenLookupArgs(retailerAccount) {
  const trimmed = String(retailerAccount || '').trim();
  if (!trimmed) {
    throw new Error('Retailer account label or id is required.');
  }

  return isLikelyUuid(trimmed) ? { id: trimmed } : { query: trimmed };
}

export async function ensureRetailerAuthentication({
  credentialProvider = DEFAULT_CREDENTIAL_PROVIDER,
  headless = false,
  loginTimeoutMs = 120_000,
  retailerAccount = null,
  store = 'voila',
  useChrome = false,
  userDataDir = DEFAULT_BROWSER_DATA_DIR,
  verificationProvider,
  gogAccount,
  verificationEmail,
}) {
  const provider = normalizeCredentialProvider(credentialProvider);
  const verificationMode = normalizeVerificationProvider(
    verificationProvider,
    provider === 'interactive' ? 'manual' : DEFAULT_VERIFICATION_PROVIDER,
  );
  const normalizedStore = String(store || 'voila').trim().toLowerCase();
  if (normalizedStore !== 'voila') {
    throw new Error(`Retailer login recovery is only implemented for voila in this phase. Received: ${store}`);
  }

  let recovery = null;
  try {
    return await runRetailerAuthenticationAttempt({
      gogAccount,
      headless,
      loginTimeoutMs,
      normalizedStore,
      provider,
      retailerAccount,
      useChrome,
      userDataDir,
      verificationEmail,
      verificationMode,
    });
  } catch (error) {
    if (!isRecoverableVoilaProfileError(error)) {
      throw error;
    }
    recovery = await archiveStaleBrowserProfile(userDataDir);
    const retried = await runRetailerAuthenticationAttempt({
      gogAccount,
      headless,
      loginTimeoutMs,
      normalizedStore,
      provider,
      retailerAccount,
      useChrome,
      userDataDir,
      verificationEmail,
      verificationMode,
    });
    retried.profileReset = true;
    retried.archivedProfileDir = recovery.archivedProfileDir;
    return retried;
  }
}

export function shouldDeferVoilaSecondFactor(options = {}) {
  if (options.allowManualSecondFactor === true) {
    return true;
  }
  const verificationProvider = String(options.verificationProvider || '').trim().toLowerCase();
  if (verificationProvider === 'manual' || verificationProvider === 'gog') {
    return true;
  }
  return Boolean(String(options.verificationCode || '').trim());
}

export async function ensureRetailerAuthenticationInPage({
  page,
  credentialProvider = DEFAULT_CREDENTIAL_PROVIDER,
  loginTimeoutMs = 120_000,
  retailerAccount = null,
  store = 'voila',
  verificationProvider,
  gogAccount,
  verificationEmail,
  allowManualVerification = false,
  verificationCode = null,
}) {
  if (!page) {
    throw new Error('Retailer authentication in page requires a Playwright page.');
  }

  const provider = normalizeCredentialProvider(credentialProvider);
  const verificationMode = normalizeVerificationProvider(
    verificationProvider,
    provider === 'interactive' ? 'manual' : DEFAULT_VERIFICATION_PROVIDER,
  );
  const normalizedStore = String(store || 'voila').trim().toLowerCase();
  if (normalizedStore !== 'voila') {
    throw new Error(`Retailer login recovery is only implemented for voila in this phase. Received: ${store}`);
  }

  const loginReport = {
    authenticated: false,
    provider,
    accountLabel: provider === 'env' ? `env:${normalizedStore}` : retailerAccount,
    headlessRequested: null,
    headlessUsed: null,
    reusedSession: false,
    totpUsed: false,
    verificationProvider: verificationMode,
    verificationStatus: 'not_needed',
    verificationCodeUsed: false,
    status: 'not_started',
    error: null,
    profileReset: false,
    archivedProfileDir: null,
  };

  try {
    await navigateVoilaHome(page);
    const initialState = await detectInitialVoilaAuthState(page);
    if (initialState === true) {
      loginReport.authenticated = true;
      loginReport.reusedSession = true;
      loginReport.status = 'reused_session';
      return loginReport;
    }

    if (provider === 'interactive') {
      loginReport.status = 'interactive_login_required';
      await navigateVoilaLogin(page);
      await waitForVoilaAuthenticated(page, loginTimeoutMs, {
        allowManualVerification: true,
        verificationCode,
        verificationEmail,
        onVerificationStatus(status) {
          loginReport.verificationStatus = status;
          if (status === 'provided_code_submitted') {
            loginReport.verificationCodeUsed = true;
          }
        },
      });
      await page.waitForTimeout(1_500);
      loginReport.authenticated = true;
      loginReport.status = 'interactive_login_completed';
      return loginReport;
    }

    const credentials =
      provider === 'bitwarden'
        ? await resolveBitwardenCredentials({ retailerAccount })
        : resolveEnvCredentials(normalizedStore);
    loginReport.accountLabel = credentials.accountLabel;
    loginReport.status = 'credential_login_started';

    await navigateVoilaLogin(page);
    await completeVoilaLogin(page, credentials, {
      allowManualSecondFactor: allowManualVerification === true,
      verificationCode,
      verificationProvider: verificationMode,
    });
    if (credentials.totp) {
      loginReport.totpUsed = true;
    }

    await waitForVoilaAuthenticated(page, loginTimeoutMs, {
      allowManualVerification,
      gogAccount,
      verificationCode,
      verificationEmail: verificationEmail || credentials.username,
      verificationProvider: verificationMode,
      throwOnVerificationRequired: allowManualVerification !== true,
      onVerificationStatus(status) {
        loginReport.verificationStatus = status;
        if (status === 'provided_code_submitted') {
          loginReport.verificationCodeUsed = true;
        }
      },
    });
    await page.waitForTimeout(1_500);
    loginReport.authenticated = true;
    loginReport.status = 'credential_login_completed';
    return loginReport;
  } catch (error) {
    loginReport.status = 'failed';
    loginReport.error = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

async function runRetailerAuthenticationAttempt({
  gogAccount,
  headless,
  loginTimeoutMs,
  normalizedStore,
  provider,
  retailerAccount,
  useChrome,
  userDataDir,
  verificationEmail,
  verificationMode,
}) {
  const launchHeadless = provider === 'interactive' ? false : Boolean(headless);
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: launchHeadless,
    ...(useChrome ? { channel: 'chrome' } : {}),
  });
  const page = context.pages()[0] || (await context.newPage());

  const loginReport = {
    authenticated: false,
    provider,
    accountLabel: provider === 'env' ? `env:${normalizedStore}` : retailerAccount,
    headlessRequested: Boolean(headless),
    headlessUsed: launchHeadless,
    reusedSession: false,
    totpUsed: false,
    verificationProvider: verificationMode,
    verificationStatus: 'not_needed',
    status: 'not_started',
    error: null,
    profileReset: false,
    archivedProfileDir: null,
  };

  try {
    await navigateVoilaHome(page);
    const initialState = await detectInitialVoilaAuthState(page);
    if (initialState === true) {
      loginReport.authenticated = true;
      loginReport.reusedSession = true;
      loginReport.status = 'reused_session';
      return loginReport;
    }

    if (provider === 'interactive') {
      loginReport.status = 'interactive_login_required';
      console.log('[fluent-meals] Retailer login required. Complete login in the opened browser window to continue.');
      await navigateVoilaLogin(page);
      await waitForVoilaAuthenticated(page, loginTimeoutMs, {
        allowManualVerification: true,
      });
      await page.waitForTimeout(1_500);
      loginReport.authenticated = true;
      loginReport.status = 'interactive_login_completed';
      return loginReport;
    }

    const credentials =
      provider === 'bitwarden'
        ? await resolveBitwardenCredentials({ retailerAccount })
        : resolveEnvCredentials(normalizedStore);
    loginReport.accountLabel = credentials.accountLabel;
    loginReport.status = 'credential_login_started';

    await navigateVoilaLogin(page);
    await completeVoilaLogin(page, credentials, {
      allowManualSecondFactor: launchHeadless === false,
      verificationCode,
      verificationProvider: verificationMode,
    });
    if (credentials.totp) {
      loginReport.totpUsed = true;
    }

    await waitForVoilaAuthenticated(page, loginTimeoutMs, {
      allowManualVerification: launchHeadless === false || verificationMode === 'manual',
      verificationProvider: verificationMode,
      gogAccount,
      verificationEmail: verificationEmail || credentials.username,
      onVerificationStatus(status) {
        loginReport.verificationStatus = status;
      },
    });
    await page.waitForTimeout(1_500);
    loginReport.authenticated = true;
    loginReport.status = 'credential_login_completed';
    return loginReport;
  } catch (error) {
    loginReport.status = 'failed';
    loginReport.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    await context.close();
  }
}

async function navigateVoilaHome(page) {
  await page.goto(VOILA_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(1_500);
  await dismissTransientVoilaUi(page);
}

async function navigateVoilaLogin(page) {
  await page.goto(VOILA_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(1_000);
}

async function completeVoilaLogin(page, credentials, options = {}) {
  const emailLocator = await waitForVisibleLocator(page, VOILA_SELECTORS.email, 20_000);
  const passwordLocator = await waitForVisibleLocator(page, VOILA_SELECTORS.password, 20_000);
  if (!emailLocator || !passwordLocator) {
    throw await buildMissingVoilaLoginFormError(page);
  }

  await emailLocator.fill(credentials.username);
  await passwordLocator.fill(credentials.password);
  await clickFirstVisible(page, VOILA_SELECTORS.submit);
  await page.waitForTimeout(2_000);
  await maybeHandleVoilaTotp(page, credentials.totp, options);
}

async function maybeHandleVoilaTotp(page, totp, options = {}) {
  const otpLocators = await getVisibleLocators(page, VOILA_SELECTORS.otpInputs);
  if (otpLocators.length === 0) {
    return false;
  }
  if (!totp) {
    if (shouldDeferVoilaSecondFactor(options)) {
      console.log('[fluent-meals] Retailer requested a second-factor code. Complete it manually in the opened browser window to continue.');
      return false;
    }
    throw new Error('Retailer requested TOTP verification but no TOTP value was available.');
  }

  const code = String(totp).trim();
  if (otpLocators.length >= code.length && otpLocators.every((locator) => locator)) {
    for (let index = 0; index < Math.min(code.length, otpLocators.length); index += 1) {
      await otpLocators[index].fill(code[index]);
    }
  } else {
    await otpLocators[0].fill(code);
  }

  await clickFirstVisible(page, VOILA_SELECTORS.otpSubmit);
  await page.waitForTimeout(1_500);
  return true;
}

async function waitForVoilaAuthenticated(page, timeoutMs, options = {}) {
  let announcedManualVerification = false;
  let announcedGogFallback = false;
  let gogAttempted = false;
  let verificationCodeAttempted = false;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const state = await detectVoilaAuthState(page);
    if (state === true) {
      return true;
    }

    if (page.url().startsWith(VOILA_BASE_URL)) {
      await dismissTransientVoilaUi(page);
    }

    const errorMessage = await readVoilaErrorMessage(page);
    if (errorMessage) {
      throw new Error(`Retailer login failed: ${errorMessage}`);
    }

    if (await detectVoilaManualVerification(page)) {
      if (options.verificationCode && !verificationCodeAttempted) {
        options.onVerificationStatus?.('provided_code_started');
        await completeVoilaEmailVerificationWithCode(page, options.verificationCode);
        verificationCodeAttempted = true;
        options.onVerificationStatus?.('provided_code_submitted');
        await page.waitForTimeout(2_000);
        continue;
      }

      if (options.verificationProvider === 'gog' && !gogAttempted) {
        options.onVerificationStatus?.('gog_fetch_started');
        try {
          await completeVoilaEmailVerificationWithGog(page, {
            gogAccount: options.gogAccount,
            verificationEmail: options.verificationEmail,
            verificationStartedAtMs: startedAt,
          });
          gogAttempted = true;
          options.onVerificationStatus?.('gog_code_submitted');
          await page.waitForTimeout(2_000);
          continue;
        } catch (error) {
          gogAttempted = true;
          options.onVerificationStatus?.('gog_failed');
          if (options.allowManualVerification === true) {
            if (!announcedGogFallback) {
              const message = error instanceof Error ? error.message : String(error);
              console.log(
                `[fluent-meals] Gog verification retrieval failed (${message}). Complete the retailer verification manually in the opened browser window to continue.`,
              );
              announcedGogFallback = true;
            }
            options.onVerificationStatus?.('gog_failed_manual_required');
          } else {
            throw error;
          }
        }
      }

      if (options.throwOnVerificationRequired === true) {
        throw new RetailerVerificationRequiredError({
          codeLength: DEFAULT_VERIFICATION_CODE_LENGTH,
          deliveryHint: options.verificationEmail
            ? `Retrieve the newest Voila verification code sent to ${options.verificationEmail}.`
            : 'Retrieve the newest Voila verification code email.',
          message: 'Voila sent a verification code to email. Resume this same browser session with the newest code.',
          requestedAt: new Date().toISOString(),
          verificationEmail: options.verificationEmail ?? null,
        });
      }

      if (options.allowManualVerification === true) {
        if (!announcedManualVerification) {
          console.log(
            '[fluent-meals] Additional retailer verification is required. Complete the verification step in the opened browser window to continue.',
          );
          announcedManualVerification = true;
        }
        options.onVerificationStatus?.('manual_required');
      } else {
        throw new Error(
          'Retailer requested an additional verification step. Rerun in headed mode or use --credential-provider interactive to complete it manually.',
        );
      }
    }

    await page.waitForTimeout(1_500);
  }

  throw new Error('Timed out waiting for retailer login.');
}

async function detectVoilaAuthState(page) {
  const url = page.url().toLowerCase();
  if (url.includes('login-seconnecter.ca') || url.includes('/login')) {
    const loginPageVisible = await isAnyVisible(page, [...VOILA_SELECTORS.loginPageHeading, ...VOILA_SELECTORS.email], 300);
    if (loginPageVisible) {
      return false;
    }
  }

  const loggedInVisible = await isAnyVisible(page, VOILA_SELECTORS.loggedIn, 300);
  if (loggedInVisible) {
    return true;
  }

  const loggedOutVisible = await isAnyVisible(page, VOILA_SELECTORS.loggedOut, 300);
  if (loggedOutVisible) {
    return false;
  }

  return null;
}

async function detectInitialVoilaAuthState(page, timeoutMs = 8_000) {
  const startedAt = Date.now();
  let lastKnownState = null;
  while (Date.now() - startedAt < timeoutMs) {
    const state = await detectVoilaAuthState(page);
    if (state !== null) {
      return state;
    }
    lastKnownState = state;
    await page.waitForTimeout(500);
    await dismissTransientVoilaUi(page);
  }
  return lastKnownState;
}

function isRecoverableVoilaProfileError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Could not find the Voila email/password login form.');
}

async function archiveStaleBrowserProfile(userDataDir) {
  const archivedProfileDir = `${userDataDir}-stale-${Date.now()}`;
  try {
    await fs.access(userDataDir);
  } catch {
    await fs.mkdir(userDataDir, { recursive: true });
    return {
      archivedProfileDir: null,
    };
  }

  await fs.mkdir(path.dirname(userDataDir), { recursive: true });
  try {
    await fs.rename(userDataDir, archivedProfileDir);
  } catch {
    await fs.rm(userDataDir, { recursive: true, force: true });
    await fs.mkdir(userDataDir, { recursive: true });
    return {
      archivedProfileDir: null,
    };
  }
  await fs.mkdir(userDataDir, { recursive: true });
  return {
    archivedProfileDir,
  };
}

async function buildMissingVoilaLoginFormError(page) {
  const currentUrl = page.url();
  const bodyPreview = await page
    .locator('body')
    .innerText()
    .then((value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 240))
    .catch(() => '');
  return new Error(
    `Could not find the Voila email/password login form. url=${currentUrl}${bodyPreview ? ` body=${bodyPreview}` : ''}`,
  );
}

async function dismissTransientVoilaUi(page) {
  for (const selector of VOILA_SELECTORS.dismiss) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0 && (await locator.isVisible().catch(() => false))) {
      await locator.click({ timeout: 2_000 }).catch(() => {});
      await page.waitForTimeout(250);
    }
  }
}

async function readVoilaErrorMessage(page) {
  for (const selector of VOILA_SELECTORS.errors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0 && (await locator.isVisible().catch(() => false))) {
      const text = (await locator.innerText().catch(() => '')).trim();
      if (text) {
        return text;
      }
    }
  }
  return null;
}

async function detectVoilaManualVerification(page) {
  if (await isAnyVisible(page, VOILA_SELECTORS.manualVerification, 200)) {
    return true;
  }

  const bodyText = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
  return (
    bodyText.includes('verifying your account') ||
    bodyText.includes('select a method to verify') ||
    bodyText.includes('verify your voilà account')
  );
}

async function completeVoilaEmailVerificationWithGog(page, options) {
  const verificationEmail = String(options.verificationEmail || '').trim();
  if (!verificationEmail) {
    throw new Error('Voila verification requires a verification email address for gog lookup.');
  }

  const verificationStartedAtMs = Number.isFinite(Number(options.verificationStartedAtMs))
    ? Number(options.verificationStartedAtMs)
    : Date.now() - 60_000;

  await maybeTriggerVoilaVerificationResend(page);

  const code = await resolveVoilaVerificationCode({
    gogAccount: options.gogAccount,
    verificationEmail,
    issuedAfterMs: verificationStartedAtMs,
    maxPollAttempts: 4,
    pollIntervalMs: 4_000,
  });

  const input = await waitForVisibleLocator(page, VOILA_SELECTORS.verificationCodeInput, 10_000);
  if (!input) {
    throw new Error('Could not find the Voila email verification code input.');
  }

  await input.fill(code);
  await submitVoilaVerificationCode(page, input);
}

async function completeVoilaEmailVerificationWithCode(page, code) {
  const input = await waitForVisibleLocator(page, VOILA_SELECTORS.verificationCodeInput, 10_000);
  if (!input) {
    throw new Error('Could not find the Voila email verification code input.');
  }

  await input.fill(String(code || '').trim());
  await submitVoilaVerificationCode(page, input);
}

async function submitVoilaVerificationCode(page, input) {
  const submit = await waitForVisibleLocator(page, VOILA_SELECTORS.verificationSubmit, 5_000);
  if (submit) {
    await submit.click({ timeout: 10_000 });
    return;
  }

  await input.press('Enter').catch(() => {});
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const active = document.activeElement;
    if (!active) return;
    const form = active.closest ? active.closest('form') : null;
    if (!form) return;
    if (typeof form.requestSubmit === 'function') {
      form.requestSubmit();
      return;
    }
    if (typeof form.submit === 'function') {
      form.submit();
    }
  }).catch(() => {});
}

export async function resolveVoilaVerificationCode({
  gogAccount,
  verificationEmail,
  issuedAfterMs = 0,
  maxPollAttempts = 1,
  pollIntervalMs = 0,
  allowRecentFallback = true,
}) {
  const account = String(gogAccount || process.env.FLUENT_GOG_ACCOUNT || '').trim();
  if (!account) {
    throw new Error('Gog verification requires --gog-account or FLUENT_GOG_ACCOUNT.');
  }

  await runGogCommand(['auth', 'list', '--check'], { account, tolerateAccountFlag: false });
  const searchQuery = `from:(voila.ca OR login-seconnecter.ca OR sobeys.com) to:${verificationEmail} newer_than:1d`;
  const issuedAfter = Number.isFinite(Number(issuedAfterMs)) ? Number(issuedAfterMs) : 0;

  for (let attempt = 0; attempt < Math.max(1, Number(maxPollAttempts) || 1); attempt += 1) {
    const searchResult = await runGogCommand(
      ['gmail', 'messages', 'search', searchQuery, '--max', '10', '--json', '--results-only'],
      { account },
    );
    const messages = filterRecentVerificationMessages(extractGogMessages(searchResult), issuedAfter);
    if (messages.length > 0) {
      for (const message of messages) {
        const messageId = message?.id ? String(message.id) : null;
        if (!messageId) continue;

        const messageResult = await runGogCommand(['gmail', 'get', messageId, '--json', '--results-only'], { account });
        const code = extractVerificationCodeFromGogMessage(messageResult);
        if (code) {
          return code;
        }
      }
    }

    if (attempt < Math.max(1, Number(maxPollAttempts) || 1) - 1 && pollIntervalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  if (allowRecentFallback) {
    const fallbackResult = await runGogCommand(
      ['gmail', 'messages', 'search', searchQuery, '--max', '10', '--json', '--results-only'],
      { account },
    );
    const fallbackMessages = extractGogMessages(fallbackResult).sort(
      (left, right) => extractMessageTimestampMs(right) - extractMessageTimestampMs(left),
    );
    for (const message of fallbackMessages) {
      const messageId = message?.id ? String(message.id) : null;
      if (!messageId) continue;
      const messageResult = await runGogCommand(['gmail', 'get', messageId, '--json', '--results-only'], { account });
      const code = extractVerificationCodeFromGogMessage(messageResult);
      if (code) {
        return code;
      }
    }
  }

  throw new Error(`Could not extract a fresh 6-digit Voila verification code for ${verificationEmail}.`);
}

async function maybeTriggerVoilaVerificationResend(page) {
  const resendCandidates = [
    'button:has-text("Resend")',
    'input[type="button"][value*="Resend" i]',
    'text=/resend in/i',
  ];

  for (const selector of resendCandidates) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) continue;
    const visible = await locator.isVisible().catch(() => false);
    if (!visible) continue;
    const disabled = await locator.isDisabled().catch(() => false);
    if (disabled) {
      continue;
    }
    await locator.click({ timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(750);
    return true;
  }
  return false;
}

export function filterRecentVerificationMessages(messages, issuedAfterMs) {
  const thresholdMs = Number.isFinite(Number(issuedAfterMs)) ? Number(issuedAfterMs) : 0;
  return [...(Array.isArray(messages) ? messages : [])]
    .filter((message) => extractMessageTimestampMs(message) >= thresholdMs)
    .sort((left, right) => extractMessageTimestampMs(right) - extractMessageTimestampMs(left));
}

export function extractMessageTimestampMs(message) {
  if (!message || typeof message !== 'object') return 0;

  const candidates = [
    message.internalDate,
    message.internal_date,
    message.internalTimestamp,
    message.internal_timestamp,
    message.receivedAt,
    message.received_at,
    message.timestamp,
    message.date,
  ];

  for (const value of candidates) {
    const parsed = parseTimestampMs(value);
    if (parsed > 0) {
      return parsed;
    }
  }

  if (Array.isArray(message.payload?.headers)) {
    for (const header of message.payload.headers) {
      if (String(header?.name || '').toLowerCase() !== 'date') continue;
      const parsed = parseTimestampMs(header?.value);
      if (parsed > 0) {
        return parsed;
      }
    }
  }

  return 0;
}

async function clickFirstVisible(page, selectors) {
  const locator = await waitForVisibleLocator(page, selectors, 10_000);
  if (!locator) {
    throw new Error(`Could not find a clickable element for selectors: ${selectors.join(', ')}`);
  }
  await locator.click({ timeout: 10_000 });
}

async function waitForVisibleLocator(page, selectors, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
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
    await page.waitForTimeout(300);
  }
  return null;
}

async function getVisibleLocators(page, selectors) {
  const locators = [];
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      if (await candidate.isVisible().catch(() => false)) {
        locators.push(candidate);
      }
    }
    if (locators.length > 0) {
      return locators;
    }
  }
  return locators;
}

async function isAnyVisible(page, selectors, timeoutMs = 0) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      if ((await locator.count()) > 0 && (await locator.isVisible().catch(() => false))) {
        return true;
      }
    }
    if (timeoutMs === 0) {
      break;
    }
    await page.waitForTimeout(150);
  }
  return false;
}

async function runBitwardenAction({
  action,
  bwScriptPath,
  powershellPath,
  field,
  id,
  query,
  expectJson,
}) {
  if (!bwScriptPath?.trim()) {
    throw new Error(
      'Bitwarden credential provider requires FLUENT_BITWARDEN_SCRIPT_PATH or BITWARDEN_SCRIPT_PATH to point at the helper script.',
    );
  }
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', bwScriptPath, action];
  if (field) {
    args.push('-Field', field);
  }
  if (id) {
    args.push('-Id', id);
  } else if (query) {
    args.push('-Query', query);
  }

  const { stdout, stderr } = await execViaPreferredShell(powershellPath, args);

  if (stderr?.trim()) {
    const message = stderr.trim();
    if (!expectJson) {
      throw new Error(message);
    }
  }

  const trimmed = stdout.trim();
  if (!expectJson) {
    return trimmed;
  }
  return parseJsonOutput(trimmed);
}

async function execViaPreferredShell(explicitShell, args) {
  const candidates = explicitShell ? [explicitShell] : ['pwsh.exe', 'powershell.exe'];
  let lastError = null;

  for (const shell of candidates) {
    try {
      return await execFile(shell, args, {
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('Failed to execute the Bitwarden helper shell.');
}

async function runGogCommand(args, options = {}) {
  const commandArgs = [...args];
  if (options.account && options.tolerateAccountFlag !== false) {
    commandArgs.push('--account', options.account);
  }

  try {
    const { stdout, stderr } = await execFile('gog', commandArgs, {
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    });
    const trimmed = stdout.trim();
    if (!trimmed) {
      return null;
    }
    return tryParseJson(trimmed) ?? trimmed;
  } catch (error) {
    const stderr = error?.stderr ? String(error.stderr) : '';
    const stdout = error?.stdout ? String(error.stdout) : '';
    const message = [stderr.trim(), stdout.trim(), error instanceof Error ? error.message : String(error)]
      .filter(Boolean)
      .join('\n');

    if (message.includes('invalid_grant') || message.includes('expired or revoked')) {
      throw new Error(`Gog Gmail auth for ${options.account || 'the configured account'} is expired or revoked. Refresh gog auth before retrying.`);
    }

    throw new Error(message || 'gog command failed.');
  }
}

export function extractGogMessages(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (!value || typeof value !== 'object') {
    return [];
  }

  for (const key of ['messages', 'items', 'results']) {
    if (Array.isArray(value[key])) {
      return value[key];
    }
  }

  if (value.result && typeof value.result === 'object') {
    return extractGogMessages(value.result);
  }
  if (value.data && typeof value.data === 'object') {
    return extractGogMessages(value.data);
  }

  return [];
}

export function extractVerificationCodeFromGogMessage(message) {
  const texts = collectMessageTextFragments(message);
  for (const text of texts) {
    const match = text.match(/\b(\d{6})\b/);
    if (match) {
      return match[1];
    }
  }
  return null;
}

function collectMessageTextFragments(value, results = []) {
  if (typeof value === 'string') {
    results.push(value);
    const decoded = tryDecodeBase64Url(value);
    if (decoded) {
      results.push(decoded);
    }
    return results;
  }

  if (!value || typeof value !== 'object') {
    return results;
  }

  for (const key of ['snippet', 'body', 'data', 'textPlain', 'textHtml', 'value']) {
    if (typeof value[key] === 'string') {
      results.push(value[key]);
      const decoded = tryDecodeBase64Url(value[key]);
      if (decoded) {
        results.push(decoded);
      }
    }
  }

  for (const key of ['payload', 'part', 'parts', 'message', 'result']) {
    const child = value[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        collectMessageTextFragments(item, results);
      }
    } else if (child && typeof child === 'object') {
      collectMessageTextFragments(child, results);
    }
  }

  return results;
}

function tryDecodeBase64Url(value) {
  const normalized = String(value || '').trim();
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(normalized) || normalized.length < 16) {
    return null;
  }
  try {
    const base64 = normalized.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const decoded = Buffer.from(padded, 'base64').toString('utf8');
    return /[0-9A-Za-z]/.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

function parseJsonOutput(value) {
  try {
    return JSON.parse(value);
  } catch {
    const starts = [];
    for (let index = 0; index < value.length; index += 1) {
      const character = value[index];
      if ((character === '{' || character === '[') && (index === 0 || value[index - 1] === '\n')) {
        starts.push(index);
      }
    }

    for (let index = starts.length - 1; index >= 0; index -= 1) {
      const candidate = value.slice(starts[index]).trim();
      try {
        return JSON.parse(candidate);
      } catch {
        continue;
      }
    }

    throw new Error(`Failed to parse Bitwarden JSON output.`);
  }
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isLikelyUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function decodeBase32(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const character of value) {
    const index = alphabet.indexOf(character);
    if (index === -1) {
      if (character === '=') continue;
      throw new Error(`Invalid Base32 character "${character}" in TOTP secret.`);
    }
    bits += index.toString(2).padStart(5, '0');
  }

  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function parseTimestampMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000;
  }
  if (typeof value !== 'string') return 0;
  const trimmed = value.trim();
  if (!trimmed) return 0;
  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);
    return numeric > 10_000_000_000 ? numeric : numeric * 1000;
  }
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}
