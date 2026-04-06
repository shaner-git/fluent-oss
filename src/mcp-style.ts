import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  buildMutationProvenance,
  FLUENT_MEALS_READ_SCOPE,
  FLUENT_MEALS_WRITE_SCOPE,
  FLUENT_STYLE_READ_SCOPE,
  FLUENT_STYLE_WRITE_SCOPE,
  requireAnyScope,
} from './auth';
import {
  presentStyleDescriptorBacklog,
  buildStyleMutationAck,
  presentStyleEvidenceGaps,
  presentStylePurchaseAnalysis,
  presentStyleWardrobeAnalysis,
  StyleService,
  summarizeStyleDescriptorBacklog,
  summarizeStyleContext,
  summarizeStyleEvidenceGaps,
  summarizeStyleItem,
  summarizeStyleProfile,
  summarizeStylePurchaseAnalysis,
  summarizeStyleWardrobeAnalysis,
} from './domains/style/service';
import {
  firstTemplateValue,
  iconFor,
  jsonResource,
  provenanceInputSchema,
  readViewSchema,
  toolResult,
  writeResponseModeSchema,
} from './mcp-shared';

const styleVisualBundleDeliveryModeSchema = z.enum(['authenticated_only', 'authenticated_with_signed_fallback']).optional();
const styleEvidenceGapPriorityFilterSchema = z.enum(['actionable', 'all', 'high', 'medium', 'low']).optional();
const styleDescriptorBacklogFocusSchema = z.enum(['priority', 'blocked', 'all']).optional();

export function registerStyleMcpSurface(server: McpServer, style: StyleService, origin: string) {
  server.registerResource(
    'style-profile',
    'fluent://style/profile',
    {
      title: 'Style Profile',
      description: 'Current lightweight Style calibration profile.',
      mimeType: 'application/json',
      icons: iconFor(origin),
    },
    async (uri) => {
      requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      return jsonResource(uri.href, (await style.getProfile()).raw);
    },
  );

  server.registerResource(
    'style-context',
    'fluent://style/context',
    {
      title: 'Style Context',
      description: 'Closet-derived Style context for the Fluent Style workflow.',
      mimeType: 'application/json',
      icons: iconFor(origin),
    },
    async (uri) => {
      requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      return jsonResource(uri.href, await style.getContext());
    },
  );

  server.registerResource(
    'style-items',
    'fluent://style/items',
    {
      title: 'Style Items',
      description: 'Canonical Style closet items.',
      mimeType: 'application/json',
      icons: iconFor(origin),
    },
    async (uri) => {
      requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      return jsonResource(uri.href, await style.listItems());
    },
  );

  server.registerResource(
    'style-item',
    new ResourceTemplate('fluent://style/items/{item_id}', { list: undefined }),
    {
      title: 'Style Item',
      description: 'A single Style item with linked photos and item profile.',
      mimeType: 'application/json',
      icons: iconFor(origin),
    },
    async (uri, params) => {
      requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      return jsonResource(uri.href, await style.getItem(firstTemplateValue(params.item_id)));
    },
  );

  server.registerResource(
    'style-item-profile',
    new ResourceTemplate('fluent://style/item-profiles/{item_id}', { list: undefined }),
    {
      title: 'Style Item Profile',
      description: 'Typed Style profile/enrichment state for a single closet item.',
      mimeType: 'application/json',
      icons: iconFor(origin),
    },
    async (uri, params) => {
      requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      return jsonResource(uri.href, await style.getItemProfile(firstTemplateValue(params.item_id)));
    },
  );

  server.registerResource(
    'style-item-provenance',
    new ResourceTemplate('fluent://style/item-provenance/{item_id}', { list: undefined }),
    {
      title: 'Style Item Provenance',
      description: 'Field evidence, source snapshot, and technical metadata for a single Style item.',
      mimeType: 'application/json',
      icons: iconFor(origin),
    },
    async (uri, params) => {
      requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      return jsonResource(uri.href, await style.getItemProvenance(firstTemplateValue(params.item_id)));
    },
  );

  server.registerTool(
    'style_get_profile',
    {
      title: 'Get Style Profile',
      description: 'Fetch the current Style calibration profile.',
      inputSchema: {
        view: readViewSchema,
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ view }) => {
      requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      const profile = await style.getProfile();
      const summary = summarizeStyleProfile(profile);
      return toolResult(profile.raw, {
        textData: view === 'full' ? profile.raw : summary,
        structuredContent: view === 'summary' ? summary : undefined,
      });
    },
  );

  server.registerTool(
    'style_update_profile',
    {
      title: 'Update Style Profile',
      description: 'Update the lightweight Style calibration profile.',
      inputSchema: {
        profile: z.any(),
        response_mode: writeResponseModeSchema,
        ...provenanceInputSchema,
      },
    },
    async (args) => {
      const authProps = requireAnyScope([FLUENT_STYLE_WRITE_SCOPE, FLUENT_MEALS_WRITE_SCOPE]);
      const updated = await style.updateProfile({
        profile: args.profile,
        provenance: buildMutationProvenance(authProps, args),
      });
      const ack = buildStyleMutationAck('style_profile', updated.profileId, 'style.profile_updated', new Date().toISOString(), {
        hardAvoidCount: updated.raw.hardAvoids.length,
        importedClosetConfirmed: updated.raw.importedClosetConfirmed,
        tasteSignalCount:
          updated.raw.preferredSilhouettes.length +
          updated.raw.colorDirections.length +
          updated.raw.aestheticKeywords.length,
      });
      return toolResult(updated.raw, {
        textData: args.response_mode === 'full' ? updated.raw : ack,
        structuredContent: args.response_mode === 'ack' ? ack : undefined,
      });
    },
  );

  server.registerTool(
    'style_get_context',
    {
      title: 'Get Style Context',
      description: 'Fetch closet-derived Style context needed by the Fluent Style workflow.',
      inputSchema: {
        view: readViewSchema,
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ view }) => {
      requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      const context = await style.getContext();
      const summary = summarizeStyleContext(context);
      return toolResult(context, {
        textData: view === 'full' ? context : summary,
        structuredContent: view === 'summary' ? summary : context,
      });
    },
  );

  server.registerTool(
    'style_list_items',
    {
      title: 'List Style Items',
      description: 'List canonical Style closet items.',
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async () => {
      requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      const items = await style.listItems();
      const summaries = items.map((item) => summarizeStyleItem(item));
      const categoryCounts = summaries.reduce<Record<string, number>>((counts, item) => {
        const key = item.category ?? 'unknown';
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {});
      return toolResult(items, {
        textData: {
          itemCount: summaries.length,
          categoryCounts,
          preview: summaries.slice(0, 12),
        },
        structuredContent: { items: summaries },
      });
    },
  );

  server.registerTool(
    'style_get_item',
    {
      title: 'Get Style Item',
      description: 'Fetch a single Style closet item with its linked photos and item profile.',
      inputSchema: {
        item_id: z.string(),
        view: readViewSchema,
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ item_id, view }) => {
      requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      const item = await style.getItem(item_id);
      const summary = item ? summarizeStyleItem(item) : { value: null };
      return toolResult(item, {
        textData:
          item && view === 'full'
            ? {
                ...summary,
                deliverablePhotoCount: item.photos.filter((photo) => photo.delivery).length,
                photoCount: item.photos.length,
                photoPreview: item.photos.slice(0, 4).map((photo) => ({
                  id: photo.id,
                  hasDelivery: Boolean(photo.delivery),
                  isPrimary: photo.isPrimary,
                  kind: photo.kind,
                })),
              }
            : summary,
        structuredContent: view === 'summary' ? summary : undefined,
      });
    },
  );

  server.registerTool(
    'style_upsert_item',
    {
      title: 'Upsert Style Item',
      description: 'Create or update a canonical Style closet item.',
      inputSchema: {
        item: z.any(),
        source_snapshot: z.any().optional(),
        response_mode: writeResponseModeSchema,
        ...provenanceInputSchema,
      },
    },
    async (args) => {
      const authProps = requireAnyScope([FLUENT_STYLE_WRITE_SCOPE, FLUENT_MEALS_WRITE_SCOPE]);
      const item = await style.upsertItem({
        item: args.item,
        provenance: buildMutationProvenance(authProps, args),
        sourceSnapshot: args.source_snapshot,
      });
      const ack = buildStyleMutationAck('style_item', item.id, 'style.item_upserted', new Date().toISOString(), {
        category: item.category,
        name: item.name,
        photoCount: item.photos.length,
      });
      return toolResult(item, {
        textData: args.response_mode === 'full' ? item : ack,
        structuredContent: args.response_mode === 'ack' ? ack : undefined,
      });
    },
  );

  server.registerTool(
    'style_upsert_item_photos',
    {
      title: 'Upsert Style Item Photos',
      description: 'Replace the linked photo/media set for a Style item.',
      inputSchema: {
        item_id: z.string(),
        photos: z.any(),
        response_mode: writeResponseModeSchema,
        ...provenanceInputSchema,
      },
    },
    async (args) => {
      const authProps = requireAnyScope([FLUENT_STYLE_WRITE_SCOPE, FLUENT_MEALS_WRITE_SCOPE]);
      const photos = await style.upsertItemPhotos({
        itemId: args.item_id,
        photos: args.photos,
        provenance: buildMutationProvenance(authProps, args),
      });
      const ack = buildStyleMutationAck('style_item_photos', args.item_id, 'style.item_photos_replaced', new Date().toISOString(), {
        itemId: args.item_id,
        photoCount: photos.length,
      });
      return toolResult(photos, {
        textData: args.response_mode === 'full' ? photos : ack,
        structuredContent: args.response_mode === 'ack' ? ack : undefined,
      });
    },
  );

  server.registerTool(
    'style_get_item_profile',
    {
      title: 'Get Style Item Profile',
      description: 'Fetch typed Style profile/enrichment state for a single closet item.',
      inputSchema: {
        item_id: z.string(),
        view: readViewSchema,
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ item_id, view }) => {
      requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      const profile = await style.getItemProfile(item_id);
      return toolResult(profile, {
        textData:
          view === 'full'
            ? profile
            : profile
              ? {
                  itemId: profile.itemId,
                  method: profile.method,
                  source: profile.source,
                  updatedAt: profile.updatedAt,
                  tags: profile.raw.tags,
                  descriptorConfidence: profile.raw.descriptorConfidence,
                }
              : null,
      });
    },
  );

  server.registerTool(
    'style_upsert_item_profile',
    {
      title: 'Upsert Style Item Profile',
      description: 'Create or update canonical typed stylist enrichment for a Style item.',
      inputSchema: {
        item_id: z.string(),
        legacy_profile_id: z.number().int().optional(),
        method: z.string().optional(),
        profile: z.any(),
        response_mode: writeResponseModeSchema,
        source: z.string().optional(),
        ...provenanceInputSchema,
      },
    },
    async (args) => {
      const authProps = requireAnyScope([FLUENT_STYLE_WRITE_SCOPE, FLUENT_MEALS_WRITE_SCOPE]);
      const profile = await style.upsertItemProfile({
        itemId: args.item_id,
        legacyProfileId: args.legacy_profile_id ?? null,
        method: args.method ?? null,
        profile: args.profile,
        provenance: buildMutationProvenance(authProps, args),
        source: args.source ?? null,
      });
      const ack = buildStyleMutationAck('style_item_profile', args.item_id, 'style.item_profile_upserted', new Date().toISOString(), {
        descriptorConfidence: profile.raw.descriptorConfidence,
        itemId: args.item_id,
        styleRole: profile.raw.styleRole,
        tagCount: profile.raw.tags.length,
      });
      return toolResult(profile, {
        textData: args.response_mode === 'full' ? profile : ack,
        structuredContent: args.response_mode === 'ack' ? ack : undefined,
      });
    },
  );

  server.registerTool(
    'style_get_item_provenance',
    {
      title: 'Get Style Item Provenance',
      description: 'Fetch non-canonical evidence, source snapshot, and technical metadata for a Style item.',
      inputSchema: {
        item_id: z.string(),
        view: readViewSchema,
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ item_id, view }) => {
      requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      const provenance = await style.getItemProvenance(item_id);
      const summary = provenance
        ? {
            fieldEvidenceKeys: provenance.fieldEvidence && typeof provenance.fieldEvidence === 'object' ? Object.keys(provenance.fieldEvidence as Record<string, unknown>) : [],
            hasSourceSnapshot: provenance.sourceSnapshot != null,
            hasTechnicalMetadata: provenance.technicalMetadata != null,
            itemId: item_id,
            updatedAt: provenance.updatedAt,
          }
        : null;
      return toolResult(provenance, {
        textData: view === 'full' ? provenance : summary,
        structuredContent: view === 'summary' ? summary : provenance,
      });
    },
  );

  server.registerTool(
    'style_list_descriptor_backlog',
    {
      title: 'List Style Descriptor Backlog',
      description: 'Prioritize which Style items should get stylist descriptor enrichment next, based on current wardrobe impact and photo support.',
      inputSchema: {
        focus: styleDescriptorBacklogFocusSchema,
        max_items: z.number().int().positive().max(24).optional(),
        view: readViewSchema,
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ focus, max_items, view }) => {
      requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      const backlog = await style.listDescriptorBacklog({
        focus,
        maxItems: max_items,
      });
      const summary = summarizeStyleDescriptorBacklog(backlog);
      const full = presentStyleDescriptorBacklog(backlog);
      return toolResult(backlog, {
        textData: view === 'full' ? full : summary,
        structuredContent: view === 'summary' ? summary : full,
      });
    },
  );

  server.registerTool(
    'style_list_evidence_gaps',
    {
      title: 'List Style Evidence Gaps',
      description: 'List Style items blocked by missing image delivery, typed profiles, descriptors, or comparator identity.',
      inputSchema: {
        priority_filter: styleEvidenceGapPriorityFilterSchema,
        view: readViewSchema,
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ priority_filter, view }) => {
      requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      const gaps = await style.listEvidenceGaps({ priorityFilter: priority_filter ?? 'actionable' });
      const summary = summarizeStyleEvidenceGaps(gaps);
      const full = presentStyleEvidenceGaps(gaps);
      return toolResult(gaps, {
        textData: view === 'full' ? full : summary,
        structuredContent: view === 'summary' ? summary : full,
      });
    },
  );

  server.registerTool(
    'style_analyze_wardrobe',
    {
      title: 'Analyze Wardrobe',
      description: 'Return derived wardrobe-level strengths, weak spots, gap lanes, replacements, and buy-next guidance for Style.',
      inputSchema: {
        focus: z.enum(['all', 'gaps', 'replacements', 'buy_next', 'redundancy', 'occasion']).optional(),
        view: readViewSchema,
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ focus, view }) => {
      requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      const analysis = await style.analyzeWardrobe({ focus });
      const summary = summarizeStyleWardrobeAnalysis(analysis);
      const full = presentStyleWardrobeAnalysis(analysis);
      return toolResult(analysis, {
        textData: view === 'full' ? full : summary,
        structuredContent: view === 'summary' ? summary : full,
      });
    },
  );

  server.registerTool(
    'style_analyze_purchase',
    {
      title: 'Analyze Style Purchase',
      description: 'Return coverage-aware, bucketed closet-derived wardrobe context for a candidate item using canonical Style state and the current lightweight profile.',
      inputSchema: {
        candidate: z.any(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ candidate }) => {
      requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      const analysis = await style.analyzePurchase({ candidate });
      const full = presentStylePurchaseAnalysis(analysis);
      return toolResult(analysis, {
        textData: summarizeStylePurchaseAnalysis(analysis),
        structuredContent: full,
      });
    },
  );

  server.registerTool(
    'style_get_visual_bundle',
    {
      title: 'Get Style Visual Bundle',
      description:
        'Return a curated visual packet for stylist tasks, including authenticated image routes and optional short-lived signed fallbacks.',
      inputSchema: {
        candidate: z.any().optional(),
        delivery_mode: styleVisualBundleDeliveryModeSchema,
        include_comparators: z.boolean().optional(),
        item_ids: z.array(z.string()).optional(),
        max_images: z.number().int().positive().max(12).optional(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ candidate, delivery_mode, include_comparators, item_ids, max_images }) => {
      requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      const bundle = await style.getVisualBundle({
        candidate,
        deliveryMode: delivery_mode,
        includeComparators: include_comparators,
        itemIds: item_ids,
        maxImages: max_images,
      });
      return toolResult(bundle, {
        textData: {
          assetCount: bundle.assets.length,
          comparatorCoverageMode: bundle.comparatorCoverageMode,
          deliveryMode: bundle.deliveryMode,
          evidenceWarnings: bundle.evidenceWarnings,
          requestedItemIds: bundle.requestedItemIds,
        },
        structuredContent: bundle,
      });
    },
  );
}
