import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  buildMutationProvenance,
  FLUENT_HEALTH_READ_SCOPE,
  FLUENT_HEALTH_WRITE_SCOPE,
  FLUENT_MEALS_READ_SCOPE,
  FLUENT_MEALS_WRITE_SCOPE,
  FLUENT_STYLE_READ_SCOPE,
  FLUENT_STYLE_WRITE_SCOPE,
  requireAnyScope,
  requireScopes,
} from './auth';
import type { HealthService } from './domains/health/service';
import { summarizeDomainEvents, type MealsService } from './domains/meals/service';
import type { StyleService } from './domains/style/service';
import {
  FLUENT_GUIDANCE_RESOURCE_URIS,
} from './contract';
import {
  buildFluentHomeMetadata,
  buildFluentHomeViewModel,
  buildFluentHomeWidgetMeta,
  FLUENT_HOME_ACTIONS_PREVIOUS_TEMPLATE_URI,
  FLUENT_HOME_CACHED_TEMPLATE_URI,
  FLUENT_HOME_CANARY_TEMPLATE_URI,
  FLUENT_HOME_COMPAT_TEMPLATE_URI,
  FLUENT_HOME_DIRECT_ACTIONS_PREVIOUS_TEMPLATE_URI,
  FLUENT_HOME_LEGACY_TEMPLATE_URI,
  FLUENT_HOME_LIVE_PREVIOUS_TEMPLATE_URI,
  FLUENT_HOME_MODAL_PREVIOUS_TEMPLATE_URI,
  FLUENT_HOME_PREVIOUS_TEMPLATE_URI,
  FLUENT_HOME_RECENT_TEMPLATE_URI,
  FLUENT_HOME_REVIEW_TEMPLATE_URI,
  FLUENT_HOME_TEMPLATE_URI,
  getFluentHomeWidgetHtml,
} from './fluent-home';
import { getFluentGuidanceDocument } from './fluent-guidance';
import { FluentCoreService, type FluentAccountStatus } from './fluent-core';
import { iconFor, jsonResource, provenanceInputSchema, readViewSchema, toolResult } from './mcp-shared';

export interface FluentAccountStatusToolView {
  accessState: FluentAccountStatus['accessState'];
  answerText: string;
  enabledDomains: string[];
  entitlement: FluentAccountStatus['entitlement'];
  instructions: FluentAccountStatus['instructions'];
  links: FluentAccountStatus['links'];
  safety: {
    billingBoundary: string;
    paymentDetails: string;
    privacyBoundary: string;
  };
  support: {
    displayLine: string;
    email: string;
    href: string;
    instruction: string;
  };
  supportEmail: string;
}

export function buildFluentAccountStatusToolView(status: FluentAccountStatus): FluentAccountStatusToolView {
  const answerText = buildFluentAccountStatusToolText(status);
  return {
    accessState: status.accessState,
    answerText,
    enabledDomains: [...status.enabledDomains],
    entitlement: status.entitlement,
    instructions: status.instructions,
    links: status.links,
    safety: {
      billingBoundary: 'Billing and account management happen on meetfluent.app, outside ChatGPT.',
      paymentDetails: 'Payment details stay with the billing provider; Fluent does not collect card data directly.',
      privacyBoundary: 'Private account and billing identifiers are not included in assistant-facing account text.',
    },
    support: {
      displayLine: `Support: email ${status.supportEmail}.`,
      email: status.supportEmail,
      href: status.links.supportEmail,
      instruction: status.instructions.support,
    },
    supportEmail: status.supportEmail,
  };
}

export function buildFluentAccountStatusToolText(status: FluentAccountStatus): string {
  const enabledDomains = status.enabledDomains.length ? status.enabledDomains.join(', ') : 'none enabled yet';
  const guidance = describeAccountStatusForUser(status);
  const exportLine = status.links.export ? `Export your data: ${status.instructions.export}` : `Export your data: ${status.instructions.export}`;
  const deletionLine = status.links.deletion ? `Delete account: ${status.links.deletion}` : `Delete account: ${status.instructions.deletion}`;
  return [
    `Fluent account: ${guidance.label}.`,
    guidance.summary === `Your Fluent account is ${guidance.label}.` ? null : guidance.summary,
    `Next: ${guidance.nextStep}`,
    `Enabled areas: ${enabledDomains}.`,
    `Manage account: ${status.links.manageAccount}`,
    exportLine,
    deletionLine,
    `Support: email ${status.supportEmail}.`,
    'Billing and account management happen on meetfluent.app, outside ChatGPT.',
  ].filter((line): line is string => Boolean(line)).join('\n');
}

function describeAccountStatusForUser(status: FluentAccountStatus): { label: string; nextStep: string; summary: string } {
  switch (status.entitlement.state) {
    case 'active':
    case 'trialing':
      return {
        label: 'active',
        nextStep: 'You can keep using your enabled Fluent areas.',
        summary: status.entitlement.summary,
      };
    case 'past_due_grace':
      return {
        label: 'in payment grace',
        nextStep: 'Manage billing on meetfluent.app before the grace window ends.',
        summary: status.entitlement.summary,
      };
    case 'limited':
    case 'canceled_retention':
      return {
        label: 'limited',
        nextStep: 'Use meetfluent.app to export data, request deletion, reactivate, or manage billing during the retention window.',
        summary: status.entitlement.summary,
      };
    case 'retention_expired':
      return {
        label: 'past the retention window',
        nextStep: 'Contact support if you believe this is wrong or need help with retained billing records.',
        summary: status.entitlement.summary,
      };
    case 'suspended':
      return {
        label: 'paused',
        nextStep: 'Contact support before trying more Fluent actions.',
        summary: status.entitlement.summary,
      };
    case 'deleted':
      return {
        label: 'deleted',
        nextStep: 'Contact support if you believe the deletion was a mistake.',
        summary: status.entitlement.summary,
      };
    case 'pending':
      return {
        label: 'not ready yet',
        nextStep: 'Finish the requested setup step on meetfluent.app or wait for your invite/access status to change.',
        summary: status.entitlement.summary,
      };
    case 'unavailable':
    default:
      return {
        label: 'unavailable right now',
        nextStep: 'Reconnect Fluent or contact support if the account should be active.',
        summary: status.entitlement.summary,
      };
  }
}

export function registerCoreMcpSurface(
  server: McpServer,
  fluentCore: FluentCoreService,
  meals: MealsService,
  health: HealthService,
  style: StyleService,
  origin: string,
) {
  const homeWidgetMeta = buildFluentHomeWidgetMeta(origin);
  const fluentHomeReadSecuritySchemes = [
    { type: 'oauth2' as const, scopes: [FLUENT_MEALS_READ_SCOPE, FLUENT_HEALTH_READ_SCOPE, FLUENT_STYLE_READ_SCOPE] },
  ];

  for (const [name, uri] of [
    ['fluent-home-widget', FLUENT_HOME_TEMPLATE_URI],
    ['fluent-home-widget-v20', FLUENT_HOME_MODAL_PREVIOUS_TEMPLATE_URI],
    ['fluent-home-widget-v19', FLUENT_HOME_DIRECT_ACTIONS_PREVIOUS_TEMPLATE_URI],
    ['fluent-home-widget-v18', FLUENT_HOME_ACTIONS_PREVIOUS_TEMPLATE_URI],
    ['fluent-home-widget-v17', FLUENT_HOME_LIVE_PREVIOUS_TEMPLATE_URI],
    ['fluent-home-widget-v16', FLUENT_HOME_CANARY_TEMPLATE_URI],
    ['fluent-home-widget-v15', FLUENT_HOME_REVIEW_TEMPLATE_URI],
    ['fluent-home-widget-v14', FLUENT_HOME_CACHED_TEMPLATE_URI],
    ['fluent-home-widget-v13', FLUENT_HOME_RECENT_TEMPLATE_URI],
    ['fluent-home-widget-v12', FLUENT_HOME_PREVIOUS_TEMPLATE_URI],
    ['fluent-home-widget-v11', FLUENT_HOME_COMPAT_TEMPLATE_URI],
    ['fluent-home-widget-v10', FLUENT_HOME_LEGACY_TEMPLATE_URI],
  ] as const) {
    server.registerResource(
      name,
      uri,
      {
        title: 'Fluent Home Widget',
        description: 'Rich Fluent Home overview for ChatGPT/App SDK hosts.',
        mimeType: 'text/html;profile=mcp-app',
        icons: iconFor(origin),
        _meta: homeWidgetMeta,
      },
      async () => ({
        contents: [
          {
            uri,
            mimeType: 'text/html;profile=mcp-app',
            text: getFluentHomeWidgetHtml(),
            _meta: homeWidgetMeta,
          },
        ],
      }),
    );
  }

  server.registerResource(
    'fluent-core-capabilities',
    'fluent://core/capabilities',
    {
      title: 'Fluent Capabilities',
      description: 'Fluent backend mode, domain availability, onboarding state, and contract metadata.',
      mimeType: 'application/json',
      icons: iconFor(origin),
    },
    async (uri) => {
      requireAnyScope([FLUENT_MEALS_READ_SCOPE, FLUENT_HEALTH_READ_SCOPE, FLUENT_STYLE_READ_SCOPE]);
      return jsonResource(uri.href, await fluentCore.getCapabilities());
    },
  );

  server.registerResource(
    'fluent-core-profile',
    'fluent://core/profile',
    {
      title: 'Fluent Profile',
      description: 'The shared Fluent profile for the current Fluent deployment.',
      mimeType: 'application/json',
      icons: iconFor(origin),
    },
    async (uri) => {
      requireAnyScope([FLUENT_MEALS_READ_SCOPE, FLUENT_HEALTH_READ_SCOPE, FLUENT_STYLE_READ_SCOPE]);
      return jsonResource(uri.href, await fluentCore.getProfile());
    },
  );

  server.registerResource(
    'fluent-core-account-status',
    'fluent://core/account-status',
    {
      title: 'Fluent Account Status',
      description: 'Sanitized Fluent account access, domain, entitlement, export, deletion, and support status for ChatGPT-style clients.',
      mimeType: 'application/json',
      icons: iconFor(origin),
    },
    async (uri) => {
      requireAnyScope([FLUENT_MEALS_READ_SCOPE, FLUENT_HEALTH_READ_SCOPE, FLUENT_STYLE_READ_SCOPE]);
      const status = await fluentCore.getAccountStatus();
      return jsonResource(uri.href, buildFluentAccountStatusToolView(status));
    },
  );

  server.registerResource(
    'fluent-core-domains',
    'fluent://core/domains',
    {
      title: 'Fluent Domains',
      description: 'The Fluent domain registry with lifecycle and onboarding state.',
      mimeType: 'application/json',
      icons: iconFor(origin),
    },
    async (uri) => {
      requireAnyScope([FLUENT_MEALS_READ_SCOPE, FLUENT_HEALTH_READ_SCOPE, FLUENT_STYLE_READ_SCOPE]);
      return jsonResource(uri.href, await fluentCore.listDomains());
    },
  );

  for (const guidanceUri of FLUENT_GUIDANCE_RESOURCE_URIS) {
    const document = getFluentGuidanceDocument(guidanceUri);
    server.registerResource(
      guidanceUri.replace('fluent://guidance/', 'fluent-guidance-'),
      guidanceUri,
      {
        title: document?.title ?? 'Fluent Runtime Guidance',
        description: document?.summary ?? 'Compact runtime guidance for Fluent MCP clients without packaged skills.',
        mimeType: 'application/json',
        icons: iconFor(origin),
      },
      async (uri) => {
        requireAnyScope([FLUENT_MEALS_READ_SCOPE, FLUENT_HEALTH_READ_SCOPE, FLUENT_STYLE_READ_SCOPE]);
        const body = getFluentGuidanceDocument(uri.href);
        if (!body) {
          throw new Error(`Unknown Fluent guidance resource: ${uri.href}`);
        }
        return jsonResource(uri.href, body);
      },
    );
  }

  server.registerTool(
    'fluent_get_home',
    {
      title: 'Get Fluent Home',
      description:
        `Open the unified Fluent Home overview only when the user asks for Fluent Home, a cross-domain check-in, readiness, or what to do next across Meals, Style, and Health. This is not the Grocery List surface, Health Today surface, Account surface, or a shortcut router. For direct user asks such as "open my grocery list", "show me my grocery list", or "what do I need to buy?", use meals_render_grocery_list_v2 in ChatGPT / MCP Apps-style hosts instead of Home. For "show today's training", "what is my workout today?", or "what training do I have today?", use health_get_today_context instead of Home. For account/access/billing/export/deletion/support asks, use fluent_get_account_status instead of Home. Home may include component actions such as Open grocery list; ChatGPT/App SDK hosts can hand those actions to their dedicated rich surfaces, and text-only hosts should summarize the action result instead. All hosts receive a text fallback and structured summary; text-only hosts should prefer the provided fallback wording instead of rephrasing counts into report-like status telemetry. Does not expose raw internal IDs or billing checkout.`,
      annotations: { readOnlyHint: true, idempotentHint: true },
      securitySchemes: fluentHomeReadSecuritySchemes,
      _meta: {
        ui: {
          resourceUri: FLUENT_HOME_TEMPLATE_URI,
        },
        'openai/outputTemplate': FLUENT_HOME_TEMPLATE_URI,
        securitySchemes: fluentHomeReadSecuritySchemes,
        'openai/toolInvocation/invoked': 'Fluent Home ready.',
        'openai/toolInvocation/invoking': 'Opening Fluent Home...',
        'openai/widgetAccessible': true,
      },
    } as any,
    async () => {
      requireScopes([FLUENT_MEALS_READ_SCOPE, FLUENT_HEALTH_READ_SCOPE, FLUENT_STYLE_READ_SCOPE]);
      const home = await buildFluentHomeViewModel({ fluentCore, health, meals, style });
      return {
        _meta: buildFluentHomeMetadata(home),
        content: [
          {
            type: 'text' as const,
            text: home.textFallback,
          },
        ],
        structuredContent: home as unknown as Record<string, unknown>,
      };
    },
  );

  server.registerTool(
    'fluent_get_capabilities',
    {
      title: 'Get Fluent Capabilities',
      description:
        'Fetch backend mode, contract version, available domains, enabled domains, onboarding state, and starter workflow discovery hints for Fluent tool routing.',
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async () => {
      requireAnyScope([FLUENT_MEALS_READ_SCOPE, FLUENT_HEALTH_READ_SCOPE, FLUENT_STYLE_READ_SCOPE]);
      return toolResult(await fluentCore.getCapabilities());
    },
  );

  server.registerTool(
    'fluent_get_next_actions',
    {
      title: 'Get Fluent Next Actions',
      description:
        'Return MCP-native routing guidance for the next Fluent tool calls from a user goal, host family, optional domain hint, and intent. Use this as the in-band substitute for packaged Fluent skills in ChatGPT and generic MCP clients, and as a lightweight router when Claude, OpenClaw, or Codex routing is unclear.',
      inputSchema: {
        domain_hint: z.enum(['core', 'health', 'meals', 'style', 'unknown']).optional(),
        host_family: z.enum(['chatgpt_app', 'claude', 'openclaw', 'codex', 'generic_mcp', 'unknown']).optional(),
        intent: z.enum(['read', 'write', 'render', 'plan', 'onboard', 'unknown']).optional(),
        user_goal: z.string().optional(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ domain_hint, host_family, intent, user_goal }) => {
      requireAnyScope([FLUENT_MEALS_READ_SCOPE, FLUENT_HEALTH_READ_SCOPE, FLUENT_STYLE_READ_SCOPE]);
      return toolResult(
        await fluentCore.getNextActions({
          domainHint: domain_hint,
          hostFamily: host_family,
          intent,
          userGoal: user_goal,
        }),
      );
    },
  );

  server.registerTool(
    'fluent_get_profile',
    {
      title: 'Get Fluent Profile',
      description: 'Fetch the shared Fluent profile for the current Fluent deployment.',
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async () => {
      requireAnyScope([FLUENT_MEALS_READ_SCOPE, FLUENT_HEALTH_READ_SCOPE, FLUENT_STYLE_READ_SCOPE]);
      return toolResult(await fluentCore.getProfile());
    },
  );

  server.registerTool(
    'fluent_get_account_status',
    {
      title: 'Get Fluent Account Status',
      description:
        'Fetch the ChatGPT-safe Fluent account/status surface when the user asks about account status, access status, billing boundary, subscription state, export, deletion, reactivation, support, or whether Fluent is ready for their account. Prefer this over fluent_get_home for account/access asks. Returns access state, enabled domains, public entitlement state, manage-account link, export and deletion links or instructions, and support email. When summarizing the result, include the support line as plain text instead of a blank heading, for example: "Support: email hello@meetfluent.app." Does not expose billing internals or internal IDs.',
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async () => {
      requireAnyScope([FLUENT_MEALS_READ_SCOPE, FLUENT_HEALTH_READ_SCOPE, FLUENT_STYLE_READ_SCOPE]);
      const status = await fluentCore.getAccountStatus();
      return toolResult(status, {
        structuredContent: buildFluentAccountStatusToolView(status) as unknown as Record<string, unknown>,
        textData: buildFluentAccountStatusToolText(status),
      });
    },
  );

  server.registerTool(
    'fluent_update_profile',
    {
      title: 'Update Fluent Profile',
      description: 'Update the shared Fluent profile display name, timezone, or metadata.',
      inputSchema: {
        display_name: z.string().optional(),
        timezone: z.string().optional(),
        metadata: z.any().optional(),
        ...provenanceInputSchema,
      },
    },
    async (args) => {
      const authProps = requireAnyScope([FLUENT_MEALS_WRITE_SCOPE, FLUENT_HEALTH_WRITE_SCOPE, FLUENT_STYLE_WRITE_SCOPE]);
      return toolResult(
        await fluentCore.updateProfile(
          {
            displayName: args.display_name,
            metadata: args.metadata,
            timezone: args.timezone,
          },
          buildMutationProvenance(authProps, args),
        ),
      );
    },
  );

  server.registerTool(
    'fluent_list_domains',
    {
      title: 'List Fluent Domains',
      description: 'List available Fluent domains with lifecycle and onboarding state.',
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async () => {
      requireAnyScope([FLUENT_MEALS_READ_SCOPE, FLUENT_HEALTH_READ_SCOPE, FLUENT_STYLE_READ_SCOPE]);
      return toolResult(await fluentCore.listDomains());
    },
  );

  server.registerTool(
    'fluent_list_domain_events',
    {
      title: 'List Domain Events',
      description: 'Fetch Fluent domain-event audit history with optional filters.',
      inputSchema: {
        domain: z.string().optional(),
        entity_type: z.string().optional(),
        entity_id: z.string().optional(),
        event_type: z.string().optional(),
        since: z.string().optional(),
        until: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
        view: readViewSchema,
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ domain, entity_type, entity_id, event_type, since, until, limit, view }) => {
      requireAnyScope([FLUENT_MEALS_READ_SCOPE, FLUENT_HEALTH_READ_SCOPE, FLUENT_STYLE_READ_SCOPE]);
      const events = await meals.listDomainEvents({
        domain,
        entityType: entity_type,
        entityId: entity_id,
        eventType: event_type,
        since,
        until,
        limit,
      });
      const summary = summarizeDomainEvents(events);
      return toolResult(events, {
        textData: view === 'full' ? events : summary,
        structuredContent: view === 'summary' ? summary : undefined,
      });
    },
  );

  server.registerTool(
    'fluent_enable_domain',
    {
      title: 'Enable Fluent Domain',
      description: 'Enable a Fluent domain so it can participate in first-use activation and workflows.',
      inputSchema: {
        domain_id: z.string(),
        ...provenanceInputSchema,
      },
    },
    async (args) => {
      const authProps = requireAnyScope([FLUENT_MEALS_WRITE_SCOPE, FLUENT_HEALTH_WRITE_SCOPE, FLUENT_STYLE_WRITE_SCOPE]);
      return toolResult(await fluentCore.enableDomain(args.domain_id, buildMutationProvenance(authProps, args)));
    },
  );

  server.registerTool(
    'fluent_disable_domain',
    {
      title: 'Disable Fluent Domain',
      description: 'Disable a Fluent domain without removing its registry record.',
      inputSchema: {
        domain_id: z.string(),
        ...provenanceInputSchema,
      },
    },
    async (args) => {
      const authProps = requireAnyScope([FLUENT_MEALS_WRITE_SCOPE, FLUENT_HEALTH_WRITE_SCOPE, FLUENT_STYLE_WRITE_SCOPE]);
      return toolResult(await fluentCore.disableDomain(args.domain_id, buildMutationProvenance(authProps, args)));
    },
  );

  server.registerTool(
    'fluent_begin_domain_onboarding',
    {
      title: 'Begin Domain Onboarding',
      description: 'Mark domain onboarding as started for a Fluent domain.',
      inputSchema: {
        domain_id: z.string(),
        onboarding_version: z.string().optional(),
        ...provenanceInputSchema,
      },
    },
    async (args) => {
      const authProps = requireAnyScope([FLUENT_MEALS_WRITE_SCOPE, FLUENT_HEALTH_WRITE_SCOPE, FLUENT_STYLE_WRITE_SCOPE]);
      return toolResult(
        await fluentCore.beginDomainOnboarding(
          args.domain_id,
          { onboardingVersion: args.onboarding_version },
          buildMutationProvenance(authProps, args),
        ),
      );
    },
  );

  server.registerTool(
    'fluent_complete_domain_onboarding',
    {
      title: 'Complete Domain Onboarding',
      description: 'Mark domain onboarding as completed for a Fluent domain.',
      inputSchema: {
        domain_id: z.string(),
        onboarding_version: z.string().optional(),
        ...provenanceInputSchema,
      },
    },
    async (args) => {
      const authProps = requireAnyScope([FLUENT_MEALS_WRITE_SCOPE, FLUENT_HEALTH_WRITE_SCOPE, FLUENT_STYLE_WRITE_SCOPE]);
      return toolResult(
        await fluentCore.completeDomainOnboarding(
          args.domain_id,
          { onboardingVersion: args.onboarding_version },
          buildMutationProvenance(authProps, args),
        ),
      );
    },
  );
}
