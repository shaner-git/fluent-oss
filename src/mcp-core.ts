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
import { summarizeDomainEvents, type MealsService } from './domains/meals/service';
import { FluentCoreService } from './fluent-core';
import { iconFor, jsonResource, provenanceInputSchema, readViewSchema, toolResult } from './mcp-shared';

export function registerCoreMcpSurface(server: McpServer, fluentCore: FluentCoreService, meals: MealsService, origin: string) {
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
