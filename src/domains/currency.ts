// D26 (2026-09-27): currency is an open ISO 4217 string on the tool surface, with a server-side
// allowlist, so supporting a new currency never needs a ChatGPT resubmission. Fluent never fetches
// exchange rates or converts: the host model converts and sends provenance.
export const SUPPORTED_CURRENCIES = ['CAD', 'USD'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];
export const DEFAULT_CURRENCY: SupportedCurrency = 'CAD';

export const SUPPORTED_CURRENCY_DESCRIPTION =
  `ISO 4217 currency code. Fluent currently supports ${SUPPORTED_CURRENCIES.join(' and ')}. Fluent never converts; convert other currencies yourself before sending.`;

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

/** Normalizes an optional currency code; null/empty means "not given". Throws a host-actionable error. */
export function normalizeSupportedCurrency(value: unknown, field = 'currency'): SupportedCurrency | null {
  if (value === null || value === undefined) return null;
  const code = String(value).trim().toUpperCase();
  if (!code) return null;
  if (!isSupportedCurrency(code)) {
    throw new Error(
      `${field} ${code} is not supported yet. Fluent currently supports ${SUPPORTED_CURRENCIES.join(' and ')}. `
      + 'Convert the amount to a supported currency yourself and resend; Fluent never converts.',
    );
  }
  return code;
}
