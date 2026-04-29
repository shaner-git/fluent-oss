export const FLUENT_CLOUD_WAITLIST_URL = 'https://meetfluent.app/';
export const FLUENT_CLOUD_ACCESS_DOCS_URL = 'https://docs.meetfluent.app/getting-started/cloud-access.html';
export const FLUENT_OSS_AVAILABLE_URL = 'https://github.com/shaner-git/fluent-oss';
export const FLUENT_SUPPORT_EMAIL = 'hello@meetfluent.app';

const FLUENT_CLOUD_EARLY_ACCESS_NOTE = 'Fluent is in early access and open source.';

export type FluentCloudAccessEnvironment = 'production' | 'staging' | 'development' | 'local';
export type FluentCloudConfiguredAccessMode = 'allowlist' | 'open_dev';
export type FluentCloudResolvedAccessMode = FluentCloudConfiguredAccessMode | 'closed';
export type FluentCloudAccessDenialReason = 'missing_allowlist' | 'not_in_allowlist' | null;
export type FluentCloudAccessFailureCode =
  | 'not_on_waitlist'
  | 'waitlist_pending_review'
  | 'waitlisted_not_invited'
  | 'waitlist_declined'
  | 'invite_expired'
  | 'invite_canceled'
  | 'invited_not_onboarded'
  | 'account_already_active'
  | 'account_disabled'
  | 'account_deleted'
  | 'auth_expired'
  | 'contract_version_unsupported'
  | 'client_unsupported'
  | 'temporarily_unavailable';

type EarlyAccessMessageOptions = {
  lead?: string;
};

type EarlyAccessPageOptions = {
  heading?: string;
  lead?: string;
  title?: string;
};

type FluentCloudAccessEvaluationInput = {
  accessMode?: string | null;
  allowAllCloudEmailsForDev?: boolean | string | null;
  allowedEmails: readonly string[];
  deploymentEnvironment?: string | null;
  email: string | null | undefined;
  onWarning?: (warning: string) => void;
};

export type FluentCloudAccessEvaluation = {
  allowed: boolean;
  configuredAllowlist: boolean;
  denialReason: FluentCloudAccessDenialReason;
  normalizedEmail: string | null;
  operatorWarnings: string[];
  requestedMode: FluentCloudConfiguredAccessMode | null;
  resolvedEnvironment: FluentCloudAccessEnvironment;
  resolvedMode: FluentCloudResolvedAccessMode;
};

export type FluentCloudAccessFailureContext = {
  clientName?: string | null;
  contractVersion?: string | null;
  email?: string | null;
  heading?: string | null;
  lead?: string | null;
  title?: string | null;
};

export type FluentCloudAccessFailureDetails = {
  code: FluentCloudAccessFailureCode;
  heading: string;
  message: string;
  nextAction: string;
  oauthError: 'access_denied' | 'invalid_client' | 'invalid_token' | 'temporarily_unavailable';
  pageTitle: string;
  shortExplanation: string;
  status: number;
  supportPath: string;
  waitlistUrl: string | null;
  ossFallback: string | null;
};

type FailureTemplate = {
  heading: string;
  explanationTemplate: string;
  nextActionTemplate: string;
  oauthError: FluentCloudAccessFailureDetails['oauthError'];
  ossFallback: boolean;
  status: number;
  waitlist: boolean;
};

const emittedOperatorWarnings = new Set<string>();

export const FLUENT_CLOUD_ACCESS_FAILURE_TEMPLATES: Record<FluentCloudAccessFailureCode, FailureTemplate> = {
  not_on_waitlist: {
    explanationTemplate: '{{account_label}} has not requested Fluent early access yet.',
    heading: 'Request early access to Fluent',
    nextActionTemplate: 'Request early access, then reconnect after you receive an invite.',
    oauthError: 'access_denied',
    ossFallback: true,
    status: 403,
    waitlist: true,
  },
  waitlisted_not_invited: {
    explanationTemplate: '{{account_label}} has requested Fluent early access, but an invite is not ready yet.',
    heading: 'Your Fluent invite is not ready yet',
    nextActionTemplate: 'Watch for your invite email before reconnecting.',
    oauthError: 'access_denied',
    ossFallback: true,
    status: 403,
    waitlist: true,
  },
  waitlist_pending_review: {
    explanationTemplate: '{{account_label}} is still being reviewed for Fluent early access.',
    heading: 'Your Fluent early-access request is still in review',
    nextActionTemplate: 'Wait for review to finish, or explore the open-source runtime today.',
    oauthError: 'access_denied',
    ossFallback: true,
    status: 403,
    waitlist: true,
  },
  waitlist_declined: {
    explanationTemplate: '{{account_label}} is not approved for Fluent early access right now.',
    heading: 'This waitlist request was not approved',
    nextActionTemplate: 'Request early access again later if availability opens up, or explore the open-source runtime today.',
    oauthError: 'access_denied',
    ossFallback: true,
    status: 403,
    waitlist: true,
  },
  invite_expired: {
    explanationTemplate: '{{account_label}} had a Fluent invite, but it expired before acceptance.',
    heading: 'This Fluent invite expired',
    nextActionTemplate: 'Request a new invite from support or wait for a resend before reconnecting.',
    oauthError: 'access_denied',
    ossFallback: true,
    status: 403,
    waitlist: true,
  },
  invite_canceled: {
    explanationTemplate: '{{account_label}} had a Fluent invite, but it was canceled before acceptance.',
    heading: 'This Fluent invite was canceled',
    nextActionTemplate: 'Contact support if you expected access, or request early access again later.',
    oauthError: 'access_denied',
    ossFallback: true,
    status: 403,
    waitlist: true,
  },
  invited_not_onboarded: {
    explanationTemplate: '{{account_label}} has a Fluent invite, but onboarding is not complete yet.',
    heading: 'Finish Fluent onboarding first',
    nextActionTemplate: 'Finish the onboarding steps from your invite email or support handoff, then reconnect.',
    oauthError: 'access_denied',
    ossFallback: true,
    status: 403,
    waitlist: false,
  },
  account_already_active: {
    explanationTemplate: '{{account_label}} already belongs to an active Fluent account.',
    heading: 'This Fluent account is already active',
    nextActionTemplate: 'Sign in with the existing account owner identity or contact support if the account should be transferred.',
    oauthError: 'access_denied',
    ossFallback: false,
    status: 409,
    waitlist: false,
  },
  account_disabled: {
    explanationTemplate: '{{account_label}} is disabled right now.',
    heading: 'This Fluent account is disabled',
    nextActionTemplate: 'Contact support to restore access before reconnecting.',
    oauthError: 'access_denied',
    ossFallback: true,
    status: 403,
    waitlist: false,
  },
  account_deleted: {
    explanationTemplate: '{{account_label}} has been deleted from Fluent.',
    heading: 'This Fluent account was deleted',
    nextActionTemplate: 'Contact support if you expected this account to still exist, or run Fluent yourself instead.',
    oauthError: 'access_denied',
    ossFallback: true,
    status: 403,
    waitlist: false,
  },
  auth_expired: {
    explanationTemplate: 'Your Fluent sign-in has expired.',
    heading: 'Your Fluent sign-in expired',
    nextActionTemplate: 'Sign in again to refresh access, then reconnect.',
    oauthError: 'invalid_token',
    ossFallback: false,
    status: 401,
    waitlist: false,
  },
  contract_version_unsupported: {
    explanationTemplate:
      'This client requested Fluent contract version {{contract_version}}, which Fluent no longer supports.',
    heading: 'This Fluent contract version is not supported',
    nextActionTemplate: 'Update the Fluent client or plugin, then reconnect with a supported contract version.',
    oauthError: 'access_denied',
    ossFallback: true,
    status: 426,
    waitlist: false,
  },
  client_unsupported: {
    explanationTemplate: 'The {{client_name}} client is not supported for Fluent right now.',
    heading: 'This Fluent client is not supported',
    nextActionTemplate: 'Update to a supported Fluent client or run Fluent yourself.',
    oauthError: 'invalid_client',
    ossFallback: true,
    status: 400,
    waitlist: false,
  },
  temporarily_unavailable: {
    explanationTemplate: 'Fluent is temporarily unavailable right now.',
    heading: 'Fluent is temporarily unavailable',
    nextActionTemplate: 'Retry in a few minutes. If this keeps happening, contact support.',
    oauthError: 'temporarily_unavailable',
    ossFallback: true,
    status: 503,
    waitlist: false,
  },
};

export const FLUENT_CLOUD_ACCESS_FAILURE_TEMPLATE_EXPORT = (
  Object.entries(FLUENT_CLOUD_ACCESS_FAILURE_TEMPLATES) as Array<[FluentCloudAccessFailureCode, FailureTemplate]>
).map(([code, template]) => ({
  code,
  explanationTemplate: template.explanationTemplate,
  heading: template.heading,
  messageTemplate:
    [
      template.explanationTemplate,
      `Next action: ${template.nextActionTemplate}`,
      template.ossFallback ? `Open-source runtime: ${FLUENT_OSS_AVAILABLE_URL}` : null,
      template.waitlist ? `Request early access: ${FLUENT_CLOUD_WAITLIST_URL}` : null,
      `Support: ${FLUENT_SUPPORT_EMAIL}`,
      FLUENT_CLOUD_EARLY_ACCESS_NOTE,
    ]
      .filter(Boolean)
      .join(' '),
  nextActionTemplate: template.nextActionTemplate,
  includesOssFallback: template.ossFallback,
  includesWaitlist: template.waitlist,
}));

export function hasFluentCloudAccess(
  email: string | null | undefined,
  allowedEmails: readonly string[],
  options: Omit<FluentCloudAccessEvaluationInput, 'allowedEmails' | 'email'> = {},
): boolean {
  return evaluateFluentCloudAccess({
    ...options,
    allowedEmails,
    email,
  }).allowed;
}

export function evaluateFluentCloudAccess(
  input: FluentCloudAccessEvaluationInput,
): FluentCloudAccessEvaluation {
  const normalizedEmail = input.email?.trim().toLowerCase() ?? null;
  const resolvedEnvironment = normalizeFluentCloudAccessEnvironment(input.deploymentEnvironment);
  const requestedMode = normalizeFluentCloudAccessMode(input.accessMode);
  const configuredAllowlist = input.allowedEmails.length > 0;
  const operatorWarnings: string[] = [];
  const warn = (message: string) => {
    operatorWarnings.push(message);
    emitFluentCloudAccessWarning(message, input.onWarning);
  };

  if (input.accessMode?.trim() && !requestedMode) {
    warn(
      `Ignoring unsupported FLUENT_CLOUD_ACCESS_MODE=${input.accessMode.trim()}. Supported values are allowlist and open_dev.`,
    );
  }

  const devOverrideFlag = parseBooleanFlag(input.allowAllCloudEmailsForDev);
  if (requestedMode === 'allowlist' && devOverrideFlag) {
    warn(
      'ALLOW_ALL_CLOUD_EMAILS_FOR_DEV=true is ignored because FLUENT_CLOUD_ACCESS_MODE=allowlist is set explicitly.',
    );
  }

  const devOverrideRequested =
    requestedMode === 'open_dev' || (requestedMode !== 'allowlist' && devOverrideFlag);
  if (devOverrideRequested && !isLocalDevelopmentEnvironment(resolvedEnvironment)) {
    warn(
      `Ignoring the open_dev cloud access override in ${resolvedEnvironment}. Production and staging must use an explicit allowlist.`,
    );
  }

  if (devOverrideRequested && isLocalDevelopmentEnvironment(resolvedEnvironment)) {
    return {
      allowed: true,
      configuredAllowlist,
      denialReason: null,
      normalizedEmail,
      operatorWarnings,
      requestedMode,
      resolvedEnvironment,
      resolvedMode: 'open_dev',
    };
  }

  if (configuredAllowlist) {
    return {
      allowed: Boolean(normalizedEmail && input.allowedEmails.includes(normalizedEmail)),
      configuredAllowlist,
      denialReason: normalizedEmail && input.allowedEmails.includes(normalizedEmail) ? null : 'not_in_allowlist',
      normalizedEmail,
      operatorWarnings,
      requestedMode,
      resolvedEnvironment,
      resolvedMode: 'allowlist',
    };
  }

  warn(
    `${resolvedEnvironment} Fluent Cloud access is fail-closed because no allowlist is configured. Set ALLOWED_EMAILS or ALLOWED_EMAIL. Local development may opt in explicitly with FLUENT_CLOUD_ACCESS_MODE=open_dev or ALLOW_ALL_CLOUD_EMAILS_FOR_DEV=true.`,
  );
  return {
    allowed: false,
    configuredAllowlist,
    denialReason: 'missing_allowlist',
    normalizedEmail,
    operatorWarnings,
    requestedMode,
    resolvedEnvironment,
    resolvedMode: 'closed',
  };
}

export function buildFluentCloudAccessFailureDetails(
  code: FluentCloudAccessFailureCode,
  context: FluentCloudAccessFailureContext = {},
): FluentCloudAccessFailureDetails {
  const template = FLUENT_CLOUD_ACCESS_FAILURE_TEMPLATES[code];
  const shortExplanation = context.lead?.trim() || applyFailureTemplate(template.explanationTemplate, context);
  const heading = context.heading?.trim() || template.heading;
  const nextAction = applyFailureTemplate(template.nextActionTemplate, context);
  const waitlistUrl = template.waitlist ? FLUENT_CLOUD_WAITLIST_URL : null;
  const ossFallback = template.ossFallback ? `Open-source runtime: ${FLUENT_OSS_AVAILABLE_URL}` : null;
  const supportPath = `Support: ${FLUENT_SUPPORT_EMAIL}`;
  return {
    code,
    heading,
    message: [
      shortExplanation,
      `Next action: ${nextAction}`,
      ossFallback,
      waitlistUrl ? `Request early access: ${waitlistUrl}` : null,
      supportPath,
      FLUENT_CLOUD_EARLY_ACCESS_NOTE,
    ]
      .filter(Boolean)
      .join(' '),
    nextAction,
    oauthError: template.oauthError,
    pageTitle: context.title?.trim() || heading,
    shortExplanation,
    status: template.status,
    supportPath,
    waitlistUrl,
    ossFallback,
  };
}

export function createFluentCloudAccessFailurePayload(
  code: FluentCloudAccessFailureCode,
  context: FluentCloudAccessFailureContext = {},
): Record<string, unknown> {
  const details = buildFluentCloudAccessFailureDetails(code, context);
  return {
    error: details.oauthError,
    error_description: details.message,
    fluent_cloud_failure: {
      code: details.code,
      early_access_note: FLUENT_CLOUD_EARLY_ACCESS_NOTE,
      heading: details.heading,
      next_action: details.nextAction,
      oss_fallback_url: details.ossFallback ? FLUENT_OSS_AVAILABLE_URL : null,
      short_explanation: details.shortExplanation,
      support_email: FLUENT_SUPPORT_EMAIL,
      waitlist_url: details.waitlistUrl,
    },
  };
}

export function isFluentCloudEarlyAccessDenial(input: unknown): boolean {
  const value = normalizeErrorText(input);
  if (!value) {
    return false;
  }

  return [
    'access_denied',
    'account deleted',
    'account disabled',
    'auth expired',
    'client unsupported',
    'contract version',
    'early access',
    'fluent_cloud_failure',
    'not on the fluent waitlist',
    'onboarding is not complete',
    'temporarily unavailable',
    'waitlist',
  ].some((needle) => value.includes(needle));
}

export function buildFluentCloudEarlyAccessMessage(options: EarlyAccessMessageOptions = {}): string {
  return buildFluentCloudAccessFailureDetails('not_on_waitlist', { lead: options.lead }).message;
}

export function normalizeFluentCloudAccessEnvironment(value: string | null | undefined): FluentCloudAccessEnvironment {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'local':
      return 'local';
    case 'dev':
    case 'development':
    case 'test':
      return 'development';
    case 'stage':
    case 'staging':
    case 'preview':
      return 'staging';
    case 'prod':
    case 'production':
    case '':
      return 'production';
    default:
      return 'production';
  }
}

export function resetFluentCloudAccessWarningsForTests(): void {
  emittedOperatorWarnings.clear();
}

export function renderFluentCloudAccessFailurePage(
  code: FluentCloudAccessFailureCode,
  context: FluentCloudAccessFailureContext = {},
): string {
  const details = buildFluentCloudAccessFailureDetails(code, context);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(details.pageTitle)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f8fafc;
      --card: #ffffff;
      --ink: #0f172a;
      --muted: #475569;
      --border: #dbe4f0;
      --accent: #0f172a;
      --accent-soft: #e2e8f0;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at top, rgba(15, 23, 42, 0.07), transparent 40%),
        var(--bg);
      color: var(--ink);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    main {
      width: 100%;
      max-width: 720px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 24px;
      padding: 32px;
      box-shadow: 0 24px 80px rgba(15, 23, 42, 0.08);
    }
    .eyebrow {
      margin: 0 0 12px;
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--muted);
    }
    h1 {
      margin: 0 0 12px;
      font-size: clamp(2rem, 5vw, 2.75rem);
      line-height: 1.05;
    }
    p {
      margin: 0 0 16px;
      color: var(--muted);
      line-height: 1.6;
    }
    ul {
      margin: 20px 0 0;
      padding-left: 20px;
      color: var(--muted);
      line-height: 1.7;
    }
    a {
      color: var(--accent);
      font-weight: 600;
    }
    .note {
      margin-top: 20px;
      padding: 16px 18px;
      border-radius: 16px;
      background: var(--accent-soft);
      color: var(--ink);
    }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">Fluent</p>
    <h1>${escapeHtml(details.heading)}</h1>
    <p>${escapeHtml(details.shortExplanation)}</p>
    <div class="note">${escapeHtml(FLUENT_CLOUD_EARLY_ACCESS_NOTE)}</div>
    <ul>
      <li>Next action: ${escapeHtml(details.nextAction)}</li>
      ${details.waitlistUrl ? `<li>Request early access: <a href="${escapeHtml(details.waitlistUrl)}">${escapeHtml(details.waitlistUrl)}</a></li>` : ''}
      ${details.ossFallback ? `<li>Open-source runtime: <a href="${escapeHtml(FLUENT_OSS_AVAILABLE_URL)}">${escapeHtml(FLUENT_OSS_AVAILABLE_URL)}</a></li>` : ''}
      <li>Support: <a href="mailto:${escapeHtml(FLUENT_SUPPORT_EMAIL)}">${escapeHtml(FLUENT_SUPPORT_EMAIL)}</a></li>
      <li>If you already signed in and need deletion instead, open <code>/account/delete</code>.</li>
    </ul>
  </main>
</body>
</html>`;
}

export function renderFluentCloudEarlyAccessPage(options: EarlyAccessPageOptions = {}): string {
  return renderFluentCloudAccessFailurePage('not_on_waitlist', {
    heading: options.heading,
    lead: options.lead,
    title: options.title,
  });
}

function applyFailureTemplate(template: string, context: FluentCloudAccessFailureContext): string {
  const accountLabel = context.email?.trim() ? `The account ${context.email.trim()}` : 'This account';
  const clientName = context.clientName?.trim() || 'current';
  const contractVersion = context.contractVersion?.trim() || 'an unsupported version';
  return template
    .replaceAll('{{account_label}}', accountLabel)
    .replaceAll('{{client_name}}', clientName)
    .replaceAll('{{contract_version}}', contractVersion);
}

function normalizeErrorText(input: unknown): string {
  if (!input) {
    return '';
  }
  if (typeof input === 'string') {
    return input.trim().toLowerCase();
  }
  if (typeof input === 'object') {
    const record = input as Record<string, unknown>;
    const fluentFailure =
      record.fluent_cloud_failure && typeof record.fluent_cloud_failure === 'object'
        ? (record.fluent_cloud_failure as Record<string, unknown>).code
        : null;
    return [record.error, record.error_description, record.message, fluentFailure]
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
      .trim()
      .toLowerCase();
  }
  return String(input).trim().toLowerCase();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function emitFluentCloudAccessWarning(message: string, onWarning?: (warning: string) => void): void {
  if (onWarning) {
    onWarning(message);
    return;
  }
  if (emittedOperatorWarnings.has(message)) {
    return;
  }
  emittedOperatorWarnings.add(message);
  console.warn(`[fluent-cloud-access] ${message}`);
}

function isLocalDevelopmentEnvironment(value: FluentCloudAccessEnvironment): boolean {
  return value === 'development' || value === 'local';
}

function normalizeFluentCloudAccessMode(value: string | null | undefined): FluentCloudConfiguredAccessMode | null {
  switch ((value ?? '').trim().toLowerCase()) {
    case '':
      return null;
    case 'allowlist':
      return 'allowlist';
    case 'open_dev':
      return 'open_dev';
    default:
      return null;
  }
}

function parseBooleanFlag(value: boolean | string | null | undefined): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = (value ?? '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}
