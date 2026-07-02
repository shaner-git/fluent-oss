import type { MutationProvenance } from '../../auth';
import { randomUUID } from 'node:crypto';
import { getFluentIdentityContext } from '../../fluent-identity';
import type { SeamSignal } from '../../personal-context';
import type { FluentDatabase } from '../../storage';

export const BUDGET_CATEGORIES = ['style-clothing', 'meals-groceries'] as const;
export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];
export type PurchaseSignal = 'comfortable' | 'tight' | 'no_signal';

export interface BudgetTargetSetup {
  category: BudgetCategory;
  currency: string;
  monthlyAmount: number;
  periodStart: string;
  remainingThisPeriod: number;
  spentThisPeriod: number;
  updatedAt: string;
}

export interface PurchaseContext {
  category: BudgetCategory;
  categoryPressure: number | null;
  caveats: string[];
  liquidityFloor: null;
  purchaseSignal: PurchaseSignal;
  targetSetup: BudgetTargetSetup | null;
}

export interface InternalPurchaseContext extends PurchaseContext {
  projectedRatio: number | null;
}

export interface BudgetEnvelopeWriteResult {
  durable: boolean;
  envelope: BudgetTargetSetup | null;
  purchaseContext: PurchaseContext;
}

export interface BudgetSpendWriteResult {
  durable: boolean;
  eventId: string | null;
  purchaseContext: PurchaseContext;
}

const BUDGET_TIGHT_RATIO = 0.8;
const BUDGET_STALE_DAYS = 45;
const DEFAULT_TIMEZONE = 'America/Toronto';

export class BudgetsService {
  constructor(private readonly db: FluentDatabase) {}

  async getPurchaseContext(input: {
    amount?: number | null;
    category: BudgetCategory;
    now?: Date | string | null;
  }): Promise<InternalPurchaseContext> {
    const category = normalizeBudgetCategory(input.category);
    const now = normalizeNow(input.now);
    const timezone = await this.getTimezone();
    const { periodStart, nextPeriodStart } = localMonthRange(now, timezone);
    const envelope = await this.getEnvelopeRow(category);
    if (!envelope) {
      return noSignalContext(category, null, [], null);
    }

    const spend = await this.getPeriodSpend(category, periodStart, nextPeriodStart);
    const latestSpendDate = await this.getLatestSpendDate(category);
    const caveats = buildCaveats({
      envelopeUpdatedAt: stringField(envelope.updated_at),
      latestSpendDate,
      now,
      periodEventCount: spend.eventCount,
    });
    const monthlyAmountCents = numberField(envelope.monthly_amount_cents);
    const spentCents = spend.spentCents;
    const targetSetup = {
      category,
      currency: stringField(envelope.currency) ?? 'CAD',
      monthlyAmount: centsToDollars(monthlyAmountCents),
      periodStart,
      remainingThisPeriod: centsToDollars(monthlyAmountCents - spentCents),
      spentThisPeriod: centsToDollars(spentCents),
      updatedAt: stringField(envelope.updated_at) ?? new Date(0).toISOString(),
    };
    const categoryPressure = ratio(spentCents, monthlyAmountCents);
    if (targetSetup.currency !== 'CAD') {
      caveats.push('currency_unverified');
    }
    if (caveats.includes('stale_envelope')) {
      return noSignalContext(category, targetSetup, caveats, null);
    }

    const amountCents = toCentsOrNull(input.amount);
    const projectedRatio = ratio(spentCents + (amountCents ?? 0), monthlyAmountCents);
    const signal = projectedRatio != null && projectedRatio > BUDGET_TIGHT_RATIO ? 'tight' : 'comfortable';
    return {
      categoryPressure,
      category,
      caveats,
      liquidityFloor: null,
      projectedRatio,
      purchaseSignal: signal,
      targetSetup,
    };
  }

  async setBudgetEnvelope(input: {
    category: BudgetCategory;
    currency?: string | null;
    monthlyAmount: number;
    now?: Date | string | null;
    provenance: MutationProvenance;
  }): Promise<BudgetEnvelopeWriteResult> {
    const category = normalizeBudgetCategory(input.category);
    const monthlyAmountCents = toPositiveCents(input.monthlyAmount, 'monthly_amount');
    const now = normalizeNow(input.now);
    const currency = (input.currency ?? 'CAD').trim().toUpperCase() || 'CAD';
    if (isAcceptanceTestProvenance(input.provenance)) {
      return {
        durable: false,
        envelope: (await this.getPurchaseContext({ category, now })).targetSetup,
        purchaseContext: toPublicPurchaseContext(await this.getPurchaseContext({ category, now })),
      };
    }
    await this.db
      .prepare(
        `INSERT INTO budget_envelopes (tenant_id, category, monthly_amount_cents, currency, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(tenant_id, category) DO UPDATE SET
           monthly_amount_cents = excluded.monthly_amount_cents,
           currency = excluded.currency,
           updated_at = excluded.updated_at`,
      )
      .bind(this.tenantId(), category, monthlyAmountCents, currency, now.toISOString())
      .run();
    const purchaseContext = await this.getPurchaseContext({ category, now });
    return {
      durable: true,
      envelope: purchaseContext.targetSetup,
      purchaseContext: toPublicPurchaseContext(purchaseContext),
    };
  }

  async logBudgetSpend(input: {
    amount: number;
    category: BudgetCategory;
    note?: string | null;
    now?: Date | string | null;
    occurredOn?: string | null;
    provenance: MutationProvenance;
  }): Promise<BudgetSpendWriteResult> {
    const category = normalizeBudgetCategory(input.category);
    const amountCents = toNonZeroCents(input.amount, 'amount');
    const now = normalizeNow(input.now);
    const occurredOn = input.occurredOn?.trim() || localIsoDate(now, await this.getTimezone());
    assertIsoDate(occurredOn, 'occurred_on');
    if (isAcceptanceTestProvenance(input.provenance)) {
      return {
        durable: false,
        eventId: null,
        purchaseContext: toPublicPurchaseContext(await this.getPurchaseContext({ category, now })),
      };
    }
    const eventId = `budget_spend_${randomUUID()}`;
    await this.db
      .prepare(
        `INSERT INTO budget_spend_events
           (id, tenant_id, category, amount_cents, occurred_on, note, provenance_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        eventId,
        this.tenantId(),
        category,
        amountCents,
        occurredOn,
        cleanNullableString(input.note),
        JSON.stringify(input.provenance),
        now.toISOString(),
      )
      .run();
    return {
      durable: true,
      eventId,
      purchaseContext: toPublicPurchaseContext(await this.getPurchaseContext({ category, now })),
    };
  }

  private tenantId(): string {
    return getFluentIdentityContext().tenantId;
  }

  private async getTimezone(): Promise<string> {
    const identity = getFluentIdentityContext();
    const row = await this.db
      .prepare('SELECT timezone FROM fluent_profile WHERE tenant_id = ? AND profile_id = ? LIMIT 1')
      .bind(identity.tenantId, identity.profileId)
      .first<{ timezone?: string | null }>();
    return row?.timezone?.trim() || DEFAULT_TIMEZONE;
  }

  private async getEnvelopeRow(category: BudgetCategory): Promise<Record<string, unknown> | null> {
    return (
      (await this.db
        .prepare(
          `SELECT category, monthly_amount_cents, currency, updated_at
           FROM budget_envelopes
           WHERE tenant_id = ? AND category = ?
           LIMIT 1`,
        )
        .bind(this.tenantId(), category)
        .first<Record<string, unknown>>()) ?? null
    );
  }

  private async getPeriodSpend(
    category: BudgetCategory,
    periodStart: string,
    nextPeriodStart: string,
  ): Promise<{ eventCount: number; spentCents: number }> {
    const row = await this.db
      .prepare(
        `SELECT COALESCE(SUM(amount_cents), 0) AS spent_cents, COUNT(*) AS event_count
         FROM budget_spend_events
         WHERE tenant_id = ? AND category = ? AND occurred_on >= ? AND occurred_on < ?`,
      )
      .bind(this.tenantId(), category, periodStart, nextPeriodStart)
      .first<Record<string, unknown>>();
    return {
      eventCount: numberField(row?.event_count),
      spentCents: numberField(row?.spent_cents),
    };
  }

  private async getLatestSpendDate(category: BudgetCategory): Promise<string | null> {
    const row = await this.db
      .prepare(
        `SELECT MAX(occurred_on) AS latest_spend_date
         FROM budget_spend_events
         WHERE tenant_id = ? AND category = ?`,
      )
      .bind(this.tenantId(), category)
      .first<Record<string, unknown>>();
    return stringField(row?.latest_spend_date);
  }
}

export function toPublicPurchaseContext(context: InternalPurchaseContext): PurchaseContext {
  return {
    category: context.category,
    categoryPressure: context.categoryPressure,
    caveats: context.caveats,
    liquidityFloor: null,
    purchaseSignal: context.purchaseSignal,
    targetSetup: context.targetSetup,
  };
}

export function toDerivedSeam(context: PurchaseContext): SeamSignal {
  return {
    seam_id: 'budgets.meals.grocery_pressure',
    producer: 'budgets',
    consumer: 'meals',
    value: context.purchaseSignal,
    freshness: context.caveats.includes('stale_envelope')
      ? 'stale'
      : context.purchaseSignal === 'no_signal'
        ? 'no_signal'
        : 'current',
    caveats: [...context.caveats],
    hosts: 'all',
    contract_version: 1,
  };
}

function noSignalContext(
  category: BudgetCategory,
  targetSetup: BudgetTargetSetup | null,
  caveats: string[],
  projectedRatio: number | null,
): InternalPurchaseContext {
  return {
    category,
    categoryPressure: null,
    caveats,
    liquidityFloor: null,
    projectedRatio,
    purchaseSignal: 'no_signal',
    targetSetup,
  };
}

function buildCaveats(input: {
  envelopeUpdatedAt: string | null;
  latestSpendDate: string | null;
  now: Date;
  periodEventCount: number;
}): string[] {
  const caveats: string[] = [];
  const envelopeAgeDays = input.envelopeUpdatedAt ? daysSince(parseDate(input.envelopeUpdatedAt), input.now) : null;
  const latestSpendAgeDays = input.latestSpendDate ? daysSince(parseIsoDate(input.latestSpendDate), input.now) : null;
  if (
    envelopeAgeDays != null &&
    envelopeAgeDays > BUDGET_STALE_DAYS &&
    latestSpendAgeDays != null &&
    latestSpendAgeDays > BUDGET_STALE_DAYS
  ) {
    caveats.push('stale_envelope');
  } else if (input.periodEventCount === 0) {
    caveats.push('no_spend_events_recorded');
  }
  return caveats;
}

function normalizeBudgetCategory(category: string): BudgetCategory {
  if ((BUDGET_CATEGORIES as readonly string[]).includes(category)) {
    return category as BudgetCategory;
  }
  throw new Error(`Unsupported budget category: ${category}.`);
}

function localMonthRange(date: Date, timezone: string): { nextPeriodStart: string; periodStart: string } {
  const parts = localDateParts(date, timezone);
  const periodStart = `${parts.year}-${pad2(parts.month)}-01`;
  const next = new Date(Date.UTC(parts.year, parts.month, 1));
  const nextPeriodStart = `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-01`;
  return { nextPeriodStart, periodStart };
}

function localIsoDate(date: Date, timezone: string): string {
  const parts = localDateParts(date, timezone);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function localDateParts(date: Date, timezone: string): { day: number; month: number; year: number } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: timezone,
    year: 'numeric',
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    day: Number(parts.day),
    month: Number(parts.month),
    year: Number(parts.year),
  };
}

function normalizeNow(value: Date | string | null | undefined): Date {
  if (value instanceof Date) {
    return value;
  }
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid now timestamp.');
  }
  return date;
}

function toPositiveCents(value: number, field: string): number {
  const cents = toCentsOrNull(value);
  if (cents == null || cents <= 0) {
    throw new Error(`${field} must be greater than zero.`);
  }
  return cents;
}

function toNonZeroCents(value: number, field: string): number {
  const cents = toCentsOrNull(value);
  if (cents == null || cents === 0) {
    throw new Error(`${field} must be non-zero.`);
  }
  return cents;
}

function toCentsOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) : null;
}

function centsToDollars(value: number): number {
  return Number((value / 100).toFixed(2));
}

function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  return Number((numerator / denominator).toFixed(4));
}

function numberField(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number(value ?? 0) || 0;
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function cleanNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function assertIsoDate(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must be YYYY-MM-DD.`);
  }
}

function parseDate(value: string): Date {
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function parseIsoDate(value: string): Date {
  return parseDate(`${value}T12:00:00Z`);
}

function daysSince(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function isAcceptanceTestProvenance(provenance: MutationProvenance): boolean {
  return new Set(['acceptance_test', 'acceptance-test', 'verifier_acceptance_test']).has(
    provenance.sourceType.trim().toLowerCase(),
  );
}
