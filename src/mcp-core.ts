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
  FLUENT_HOME_TEMPLATE_URI,
  getFluentHomeWidgetHtml,
} from './fluent-home';
import { getFluentGuidanceDocument } from './fluent-guidance';
import { FluentCoreService } from './fluent-core';
import { iconFor, jsonResource, provenanceInputSchema, readViewSchema, toolResult } from './mcp-shared';

export function registerCoreMcpSurface(
  server: McpServer,
  fluentCore: FluentCoreService,
  meals: MealsService,
  health: HealthService,
  style: StyleService,
  origin: string,
) {
  const homeWidgetMeta = buildFluentHomeWidgetMeta(origin);

  server.registerResource(
    'fluent-home-widget',
    FLUENT_HOME_TEMPLATE_URI,
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
          uri: FLUENT_HOME_TEMPLATE_URI,
          mimeType: 'text/html;profile=mcp-app',
          text: getFluentHomeWidgetHtml(),
          _meta: homeWidgetMeta,
        },
      ],
    }),
  );

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
      return jsonResource(uri.href, await fluentCore.getAccountStatus());
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
        'Open the unified Fluent Home memory overview with domain readiness, Meals, Style, Health, account/access state, and suggested next actions. In ChatGPT / MCP Apps-style hosts this can render as a rich widget; all hosts receive a text fallback and structured summary. Does not expose raw internal IDs or billing checkout.',
      annotations: { readOnlyHint: true, idempotentHint: true },
      _meta: {
        ui: {
          resourceUri: FLUENT_HOME_TEMPLATE_URI,
        },
        'openai/outputTemplate': FLUENT_HOME_TEMPLATE_URI,
        'openai/toolInvocation/invoked': 'Fluent Home ready.',
        'openai/toolInvocation/invoking': 'Opening Fluent Home...',
      },
    },
    async () => {
      requireAnyScope([FLUENT_MEALS_READ_SCOPE, FLUENT_HEALTH_READ_SCOPE, FLUENT_STYLE_READ_SCOPE]);
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
        'Fetch a ChatGPT-safe Fluent account/status surface with access state, enabled domains, public entitlement state, manage-account link, export and deletion links or instructions, and support email. Does not expose billing internals or internal IDs.',
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async () => {
      requireAnyScope([FLUENT_MEALS_READ_SCOPE, FLUENT_HEALTH_READ_SCOPE, FLUENT_STYLE_READ_SCOPE]);
      return toolResult(await fluentCore.getAccountStatus());
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
