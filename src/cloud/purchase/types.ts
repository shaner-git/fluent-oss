import type { MutationProvenance } from '../../auth';

export type PurchaseBrowserBackend = 'local' | 'cloudflare_browser_rendering' | 'cloudflare_sandbox';

export type PurchaseFailureCode =
  | 'transient'
  | 'verification_required'
  | 'manual_checkout_required'
  | 'browser_idle_timeout'
  | 'session_recovery_failed'
  | 'extended_operator_pause_needed'
  | 'selector_drift'
  | 'terminal_retailer_change'
  | 'unknown';

export type PurchaseFailureDisposition =
  | 'needs_retry'
  | 'needs_manual_recovery'
  | 'terminal_retailer_change'
  | 'unknown';

export type PurchaseRunStatus =
  | 'queued'
  | 'running'
  | 'waiting'
  | 'needs_manual_recovery'
  | 'errored'
  | 'cancelled'
  | 'complete';

export type PurchaseRunLockStatus = 'unlocked' | 'locked' | 'released' | 'cancelled';
export type PurchaseVerificationChannel = 'email_code';
export type PurchaseVerificationRequestStatus = 'pending' | 'submitted' | 'consumed';

export interface PurchaseVerificationRequest {
  requestId: string;
  channel: PurchaseVerificationChannel;
  provider: 'agent_assisted_email_code';
  prompt: string;
  deliveryHint: string | null;
  requestedAt: string;
  expiresAt: string | null;
  codeLength: number | null;
  status: PurchaseVerificationRequestStatus;
  submittedAt: string | null;
  submittedBy: string | null;
}

export interface PurchaseRunCreateInput {
  retailer: string;
  weekStart: string;
  browserBackendPreference?: PurchaseBrowserBackend | null;
  forceNewRun?: boolean;
  syncConfirmedOrder?: boolean;
  forceOrderSync?: boolean;
  syncDeliveryCalendar?: boolean;
  orderId?: string | null;
}

export interface PurchaseRunExecuteInput extends PurchaseRunCreateInput {
  reportPath?: string | null;
}

export interface PurchaseRunSummary {
  executionReady: boolean;
  cartItemCount: number | null;
  addedCount: number;
  failedCount: number;
  unresolvedCount: number | null;
  stopBeforeCheckout: boolean;
}

export interface PurchaseFailureRecord {
  code: PurchaseFailureCode;
  disposition: PurchaseFailureDisposition;
  message: string;
  fallbackBackend: Extract<PurchaseBrowserBackend, 'cloudflare_sandbox'> | null;
}

export interface PurchaseRunStateRecord {
  runId: string;
  retailer: string;
  weekStart: string;
  browserBackend: PurchaseBrowserBackend;
  lockStatus: PurchaseRunLockStatus;
  stage: string | null;
  status: PurchaseRunStatus;
  retryCount: number;
  sessionId: string | null;
  verificationCode: string | null;
  verificationRequest: PurchaseVerificationRequest | null;
  cartFingerprint: string | null;
  preparedOrderFingerprint: string | null;
  lastErrorCode: PurchaseFailureCode | null;
  lastErrorMessage: string | null;
  fallbackBackend: Extract<PurchaseBrowserBackend, 'cloudflare_sandbox'> | null;
  resultSummary: PurchaseRunSummary | null;
  reportArtifactKey: string | null;
  workflowInstanceId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
}

export interface PurchaseExecutionContext {
  retailer: string;
  weekStart: string;
  browserBackend: Exclude<PurchaseBrowserBackend, 'local'>;
  runId: string;
  reportArtifactKey?: string | null;
  serviceAuthToken?: string | null;
  provenance: MutationProvenance;
  state: PurchaseRunStateRecord;
}

export interface PurchaseStepArtifacts {
  loginReport?: Record<string, unknown> | null;
  currentCartSummary?: Record<string, unknown> | null;
  currentCartItems?: Array<Record<string, unknown>>;
  exportData?: Record<string, unknown>;
  hydratedExport?: {
    itemCount: number;
    items: Array<Record<string, unknown>>;
    store: string;
  };
  itemRun?: {
    items: Array<Record<string, unknown>>;
    summary: {
      total: number;
      added: number;
      failed: number;
      partialQuantity: number;
      quantityMatches: number;
    };
  };
  preparedOrder?: Record<string, unknown> | null;
  readyState?: Record<string, unknown> | null;
  updatedCartItems?: Array<Record<string, unknown>>;
  confirmedOrder?: Record<string, unknown> | null;
  confirmedOrderSync?: Record<string, unknown> | null;
  deliveryCalendarCandidate?: Record<string, unknown> | null;
}
