import { createHash } from 'node:crypto';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  buildMutationProvenance,
  type FluentAuthProps,
  FLUENT_MEALS_READ_SCOPE,
  FLUENT_MEALS_WRITE_SCOPE,
  FLUENT_STYLE_READ_SCOPE,
  FLUENT_STYLE_WRITE_SCOPE,
  requireAnyScope,
} from './auth';
import {
  asNullableString,
  asRecord,
  normalizeStylePurchaseCandidate,
  parseJsonLike,
} from './domains/style/helpers';
import type { StyleVisualBundleAssetRecord, StyleVisualBundleRecord } from './domains/style/types';
import {
  buildPurchaseAnalysisMetadata,
  buildPurchaseAnalysisStructuredContent,
  buildPurchaseAnalysisViewModel,
  getPurchaseAnalysisWidgetHtml,
  type PurchaseAnalysisImageHints,
  STYLE_PURCHASE_ANALYSIS_CACHED_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_COMBINED_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_HUMAN_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_IMAGE_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_LEGACY_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_PREVIOUS_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_TEMPLATE_URI,
} from './domains/style/purchase-analysis';
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
const stylePurchaseAnalysisActionIdSchema = z.enum(['log_purchase']);
const STYLE_PURCHASE_VISUAL_EVIDENCE_SOURCE = 'style_submit_purchase_visual_observations';
const STYLE_PURCHASE_VISUAL_EVIDENCE_CACHE_TTL_MS = 15 * 60 * 1000;
const INSUFFICIENT_PURCHASE_VISUAL_EVIDENCE_PATTERNS = [
  /\b(?:cannot|can't|couldn't|could not|unable to)\s+(?:inspect|see|view|open|access)\b/,
  /\b(?:did not|didn't)\s+(?:inspect|see|view|open|access)\s+(?:the\s+)?(?:candidate|product|image|photo|pixels?)\b/,
  /\b(?:not|never)\s+(?:actually\s+)?inspected\b/,
  /\bpixels?\s+(?:were\s+)?not\s+inspected\b/,
  /\bno\s+(?:usable|direct|actual|candidate|product|sneaker|shoe)?\s*images?\b/,
  /\bno\s+(?:concrete|actual|real|usable)?\s*(?:pixel|visual)\s+observations?\b/,
  /\b(?:without|lacks?|missing)\s+(?:concrete|actual|real)?\s*(?:pixel|visual)\s+(?:observations?|inspection|evidence)\b/,
  /\bvisual\s+evidence\b.*\b(?:not supplied|missing|none|absent|placeholder)\b/,
  /\bnot\s+(?:based on|from)\s+(?:pixel|visual)\s+inspection\b/,
  /\bimage\s+extraction\b.*\b(?:failed|logos?|not usable|no usable|not product)\b/,
  /\b(?:mostly|only|just)\s+logos?\b/,
  /\blogos?\s+(?:only|rather than|instead of)\b/,
  /\b(?:placeholder|sprite|tracking pixel|qa abuse)\b/,
  /\bnot\s+concrete\b/,
  /\bnot\s+(?:a\s+)?(?:product|candidate|sneaker|shoe)\s+image\b/,
  /\bnot\s+usable\b/,
];
const styleConcreteVisualObservationSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !isInsufficientPurchaseVisualEvidenceText(value), {
    message: 'Observation must describe concrete candidate image pixels.',
  });
const stylePurchaseVisualEvidenceInputSchema = z.object({
  candidateInspected: z.literal(true),
  candidateObservations: z.array(styleConcreteVisualObservationSchema).min(1),
  comparatorItemIdsInspected: z.array(z.string()).optional(),
  source: z.string().optional(),
  visionPacketId: z.string().nullable().optional(),
  visualObservationId: z.string().optional(),
});
const stylePurchaseVisualObservationRoleSchema = z.enum([
  'candidate',
  'direct_comparator',
  'adjacent_reference',
  'requested_item',
  'exact_comparator',
  'typed_role',
  'same_category',
  'nearby_formality',
]);
const stylePurchaseVisualObservationDetailSchema = z.object({
  image_id: z.string().trim().min(1),
  item_id: z.string().trim().min(1).nullable().optional(),
  role: stylePurchaseVisualObservationRoleSchema,
  observed: z.object({
    color: styleConcreteVisualObservationSchema,
    distinctive_details: z.array(styleConcreteVisualObservationSchema).min(1),
    material_or_texture: styleConcreteVisualObservationSchema.optional(),
    silhouette: styleConcreteVisualObservationSchema,
  }),
});
const styleSubmitPurchaseVisualObservationsInputSchema = z.object({
  candidate: z.any(),
  comparator_item_ids_inspected: z.array(z.string()).optional(),
  observations: z.array(stylePurchaseVisualObservationDetailSchema).min(1),
  source: z.string().optional(),
  vision_packet_id: z.string().optional(),
});
const stylePurchasePageEvidenceInputSchema = {
  max_images: z.number().min(1).max(12).optional(),
  product_url: z.string().min(1),
};

type StylePurchasePageImageEvidence = {
  alt: string | null;
  source: string;
  url: string;
};

type StylePurchasePageEvidenceStatus =
  | 'blocked_url'
  | 'fetch_failed'
  | 'image_references_extracted'
  | 'no_images_found';

type StyleHostVisionTaskStatus = 'complete' | 'needs_candidate_image' | 'ready_for_host_vision';

type StyleVisualBundleInlineImageContent = {
  assetIndex: number;
  byteLength: number;
  contentIndex: number;
  itemId: string | null;
  label: string;
  mimeType: string;
  photoId: string | null;
  role: StyleVisualBundleAssetRecord['role'];
  sourceUrl: string;
};

type StyleVisualBundleInlineImageFetch = StyleVisualBundleInlineImageContent & {
  data: string;
};

type StyleToolContent =
  | { text: string; type: 'text' }
  | { data: string; mimeType: string; type: 'image' };
type StylePurchasePreparation = ReturnType<typeof buildStylePurchasePreparation>;
type StylePurchaseVisualEvidence = z.infer<typeof stylePurchaseVisualEvidenceInputSchema>;
type StylePurchaseVisualEvidenceCacheEntry = {
  expiresAt: number;
  visualEvidence: StylePurchaseVisualEvidence;
};

const stylePurchaseVisualEvidenceCache = new Map<string, StylePurchaseVisualEvidenceCacheEntry>();

const STYLE_VISUAL_BUNDLE_MAX_INLINE_IMAGES = 4;
const STYLE_VISUAL_BUNDLE_MAX_INLINE_IMAGE_BYTES = 1_500_000;
const STYLE_PURCHASE_WIDGET_RETAIL_IMAGE_DOMAINS = [
  'https://cdn.shopify.com',
  'https://images.footlocker.ca',
  'https://images.footlocker.com',
  'https://jdsports.ca',
  'https://kith.com',
  'https://www.footlocker.ca',
  'https://www.jdsports.ca',
  'https://www.kith.com',
] as const;

function buildClaudeWidgetDomain(origin: string) {
  return `${createHash('sha256').update(origin).digest('hex').slice(0, 32)}.claudemcpcontent.com`;
}

function buildWidgetMeta(description: string, origin: string) {
  const resourceDomains = Array.from(new Set([origin, ...STYLE_PURCHASE_WIDGET_RETAIL_IMAGE_DOMAINS]));
  return {
    'openai/widgetCSP': {
      connect_domains: [],
      resource_domains: resourceDomains,
    },
    'openai/widgetDescription': description,
    'openai/widgetDomain': origin,
    'openai/widgetPrefersBorder': true,
    ui: {
      csp: {
        connectDomains: [],
        resourceDomains,
      },
      domain: buildClaudeWidgetDomain(origin),
      prefersBorder: true,
    },
  } as const;
}

function buildStylePurchasePreparation(input: {
  analysis: Awaited<ReturnType<StyleService['analyzePurchase']>>;
  candidateInput: unknown;
}) {
  const { analysis, candidateInput } = input;
  const candidate = analysis.candidate;
  const sourceUrl = extractPurchaseCandidateSourceUrl(candidateInput);
  const visuallyGrounded = analysis.evidenceQuality.candidateVisualGrounding === 'host_visual_inspection';
  const rankedComparatorItemIds = analysis.comparatorReasoning.topComparisons.map((entry) => entry.itemId);
  const fallbackComparatorItemIds = [
    ...analysis.contextBuckets.exactComparatorItems.map((entry) => entry.itemId),
    ...analysis.contextBuckets.typedRoleItems.map((entry) => entry.itemId),
    ...analysis.contextBuckets.sameCategoryItems.map((entry) => entry.itemId),
  ];
  const comparatorItemIds = Array.from(
    new Set(rankedComparatorItemIds.length > 0 ? rankedComparatorItemIds : fallbackComparatorItemIds),
  ).slice(0, 6);
  const directComparatorItemIds = analysis.comparatorReasoning.topComparisons
    .filter((entry) => isDirectPurchaseComparisonRelation(entry.relation))
    .map((entry) => entry.itemId)
    .filter((itemId) => comparatorItemIds.includes(itemId));
  const adjacentReferenceItemIds = comparatorItemIds.filter((itemId) => !directComparatorItemIds.includes(itemId));
  const candidateHasImageReference = analysis.evidenceQuality.candidateImageCount > 0;
  const hostResponseMode = visuallyGrounded
    ? 'final_recommendation_ready'
    : candidateHasImageReference
      ? 'inspect_purchase_vision_packet'
      : 'request_candidate_image';
  const userFacingStatus = visuallyGrounded
    ? 'Ready for the final widget and short stylist explanation.'
    : candidateHasImageReference
      ? 'I have the closet comparison lane and image references; I am checking the actual visuals before making the call.'
      : sourceUrl
        ? 'I have the closet comparison lane; I am pulling product-page evidence before making the call.'
        : 'I have the closet comparison lane; I need a product image before making the call.';
  const userFacingNarrationInstruction =
    'When narrating this step to the user, do not say a tool call was blocked. Say the analysis is waiting on product-page evidence, image inspection, or the final widget step.';
  const hostResponseInstruction = visuallyGrounded
    ? 'Host visual evidence is present. In ChatGPT/App SDK hosts, call style_show_purchase_analysis_widget next before or alongside the final buy/wait/skip explanation; use style_render_purchase_analysis only for text-first clients.'
    : candidateHasImageReference
      ? 'Do not give a final buy/wait/skip recommendation yet. Call style_get_purchase_vision_packet next, inspect the returned candidate and comparator images, then call style_submit_purchase_visual_observations before rendering the widget. If this text-first host does not expose style_submit_purchase_visual_observations, call style_render_purchase_analysis after inspection with concrete visual_evidence and source: "host_vision".'
      : sourceUrl
        ? 'Do not give a final buy/wait/skip recommendation yet. Call style_extract_purchase_page_evidence next with the product URL, re-run style_prepare_purchase_analysis with the enriched candidate it returns, then call style_get_purchase_vision_packet and style_submit_purchase_visual_observations before rendering the widget. If this text-first host does not expose the submit tool, use style_render_purchase_analysis with concrete host_vision visual_evidence after image inspection. If extraction returns no usable image, ask the user for a direct product image.'
        : 'Do not give a final buy/wait/skip recommendation yet. Ask the user for a direct candidate image, then call style_get_purchase_vision_packet and style_submit_purchase_visual_observations before rendering the widget. If this text-first host does not expose the submit tool, use style_render_purchase_analysis with concrete host_vision visual_evidence after image inspection.';
  const hostVisionTask = buildStylePurchaseHostVisionTask({
    adjacentReferenceItemIds,
    analysis,
    candidate,
    comparatorItemIds,
    directComparatorItemIds,
    sourceUrl,
    visuallyGrounded,
  });
  const recommendedNextSteps = visuallyGrounded
    ? [
        {
          tool: 'style_show_purchase_analysis_widget',
          reason:
            'Open the final rich purchase-analysis widget in ChatGPT/App SDK hosts now that host visual inspection evidence is present.',
          input: {
            candidate,
            visual_evidence: {
              candidateInspected: true,
              candidateObservations: analysis.evidenceQuality.candidateVisualObservations,
              comparatorItemIdsInspected: analysis.evidenceQuality.comparatorItemIdsInspected,
              source: analysis.evidenceQuality.visualEvidenceSource ?? 'host_vision',
            },
          },
        },
        {
          tool: 'style_render_purchase_analysis',
          reason:
            'Plain MCP or text-first clients can use structured purchase-analysis data instead of opening a widget.',
          input: {
            candidate,
            visual_evidence: {
              candidateInspected: true,
              candidateObservations: analysis.evidenceQuality.candidateVisualObservations,
              comparatorItemIdsInspected: analysis.evidenceQuality.comparatorItemIdsInspected,
              source: analysis.evidenceQuality.visualEvidenceSource ?? 'host_vision',
            },
          },
        },
      ]
    : candidateHasImageReference
      ? [
          {
            tool: 'style_get_purchase_vision_packet',
            reason:
              'Return model-visible candidate and closet comparator images, then inspect those pixels before submitting visual observations.',
            input: {
              candidate,
              comparator_item_ids: comparatorItemIds,
              max_inline_images: STYLE_VISUAL_BUNDLE_MAX_INLINE_IMAGES,
            },
          },
          {
            tool: 'style_submit_purchase_visual_observations',
            reason:
              'Submit concrete visual observations from the returned inline images to produce render-ready visual evidence.',
            input: {
              candidate,
              observations: 'Use the imageManifest from style_get_purchase_vision_packet and concrete observations from the inline images.',
              vision_packet_id: 'use visionPacketId from style_get_purchase_vision_packet',
            },
          },
          {
            tool: 'style_render_purchase_analysis',
            reason:
              'Claude/text-first fallback only: if style_submit_purchase_visual_observations is not exposed, inspect the candidate and comparator images first, then pass concrete visual_evidence with source: "host_vision" here instead of giving a direct freehand verdict.',
            input: {
              candidate,
              visual_evidence: {
                candidateInspected: true,
                candidateObservations: [
                  'replace with concrete candidate pixel observations from inspected image(s)',
                ],
                comparatorItemIdsInspected: comparatorItemIds,
                source: 'host_vision',
              },
            },
          },
        ]
      : [
        ...(sourceUrl && analysis.evidenceQuality.candidateImageCount === 0
          ? [
              {
                tool: 'style_extract_purchase_page_evidence',
                reason:
                  'Extract product-page title and direct candidate image references before asking the host to inspect pixels.',
                input: { product_url: sourceUrl, max_images: 6 },
              },
              {
                tool: 'style_prepare_purchase_analysis',
                reason:
                  'Re-run purchase preparation with the enriched candidate returned by style_extract_purchase_page_evidence so the hostVisionTask includes candidate image references before requesting the visual bundle.',
                input: { candidate: 'use candidate from style_extract_purchase_page_evidence' },
              },
              {
                tool: 'user_request_candidate_image',
                reason:
                  'If extraction returns no usable product image, ask the user for a direct image or uploaded photo instead of giving the final buy/wait/skip verdict.',
                input: {
                  message:
                    'I found the right closet comparison lane, but I need a direct product image before I can make a real visual shopping call.',
                },
              },
            ]
          : []),
        {
          tool: 'host_vision',
          reason:
            sourceUrl
              ? 'After extracting image references and re-running preparation, inspect the candidate and closest closet comparator images before any render/widget step.'
              : 'Ask for or otherwise obtain a direct candidate image before making visual claims or rendering a widget.',
          input: hostVisionTask,
        },
      ];

  return {
    analysisSummary: summarizeStylePurchaseAnalysis(analysis),
    candidate,
    candidateSummary: analysis.candidateSummary,
    adjacentReferenceItemIds,
    comparatorItemIds,
    directComparatorItemIds,
    hostVisionTask,
    hostResponseInstruction,
    hostResponseMode,
    renderReady: visuallyGrounded,
    recommendedNextSteps,
    sourceUrl,
    userFacingNarrationInstruction,
    userFacingStatus,
    visualGrounding: {
      candidateImageCount: analysis.evidenceQuality.candidateImageCount,
      candidateVisualGrounding: analysis.evidenceQuality.candidateVisualGrounding,
      candidateVisualObservations: analysis.evidenceQuality.candidateVisualObservations,
      comparatorItemIdsInspected: analysis.evidenceQuality.comparatorItemIdsInspected,
      finalRecommendationReady: visuallyGrounded,
      notes: analysis.evidenceQuality.notes,
      requiredEvidence: visuallyGrounded
        ? []
        : [
            'Fetch or open the product page and locate direct product image(s).',
            'If no usable direct image can be extracted, ask the user for a direct product image or uploaded photo instead of giving the final buy/wait/skip answer.',
            'Call style_get_purchase_vision_packet, inspect the returned inline images with a vision-capable model, and call style_submit_purchase_visual_observations before rendering the widget or giving the final buy/wait/skip answer.',
            'Inspect the candidate image with a vision-capable model before making color, material, texture, or visual-overlap claims.',
            'Inspect the closest closet comparator images returned by the purchase vision packet when available.',
          ],
    },
  };
}

function buildStylePurchaseHostVisionTask(input: {
  adjacentReferenceItemIds: string[];
  analysis: Awaited<ReturnType<StyleService['analyzePurchase']>>;
  candidate: unknown;
  comparatorItemIds: string[];
  directComparatorItemIds: string[];
  sourceUrl: string | null;
  visuallyGrounded: boolean;
}) {
  const candidateImageUrls = Array.isArray(input.analysis.candidate.imageUrls) ? input.analysis.candidate.imageUrls : [];
  const status: StyleHostVisionTaskStatus = input.visuallyGrounded
    ? 'complete'
    : candidateImageUrls.length > 0
      ? 'ready_for_host_vision'
      : 'needs_candidate_image';
  const expectedComparatorIds =
    input.directComparatorItemIds.length > 0 ? input.directComparatorItemIds : input.comparatorItemIds;
  const purchaseVisionPacketRequest = {
    candidate: input.candidate,
    comparator_item_ids: input.comparatorItemIds,
    max_inline_images: STYLE_VISUAL_BUNDLE_MAX_INLINE_IMAGES,
  };

  return {
    kind: 'style_purchase_visual_comparison',
    status,
    hostAction:
      candidateImageUrls.length === 0
        ? 'First obtain a direct candidate product image. Do not render a widget or give the final buy/wait/skip recommendation until candidate image pixels have been inspected.'
        : 'Call style_get_purchase_vision_packet, inspect the actual candidate image and the closest closet comparator images, then call style_submit_purchase_visual_observations before rendering or giving the final shopping recommendation. In Claude/text-first hosts where the submit tool is not exposed, call style_render_purchase_analysis with concrete visual_evidence and source: "host_vision" after inspection.',
    candidate: {
      imageUrls: candidateImageUrls,
      name: input.analysis.candidateSummary.name,
      sourceUrl: input.sourceUrl,
      summary: input.analysis.candidateSummary,
    },
    directComparators: input.directComparatorItemIds.map((itemId) =>
      buildStylePurchaseHostVisionComparator(input.analysis, itemId, 'direct_comparator'),
    ),
    adjacentReferences: input.adjacentReferenceItemIds.map((itemId) =>
      buildStylePurchaseHostVisionComparator(input.analysis, itemId, 'adjacent_reference'),
    ),
    expectedVisualEvidence: {
      candidateInspected: true,
      candidateObservations: [
        'Replace with concrete observations from the candidate image: silhouette, proportions, sole, material, color temperature, accents, branding, wearability, and any fit/cut cues visible.',
      ],
      comparatorItemIdsInspected: expectedComparatorIds,
      source: 'host_vision',
    },
    inspectionQuestions: [
      ...(candidateImageUrls.length === 0
        ? [
            'Candidate imageUrls is empty: ask for or extract a direct product image before making candidate-side visual claims or a final buy/wait/skip recommendation.',
          ]
        : [
            'Describe the candidate from the image: silhouette, shape, sole profile, material, texture, color temperature, accents, branding, and any visible fit or proportion cues.',
          ]),
      'Compare the candidate against directComparators first; decide whether each is the same item, same model family, a replacement, an upgrade, or visually distinct.',
      'Use adjacentReferences only for styling lane, formality, and wardrobe context; do not treat them as duplicate/substitute evidence unless the pixels support it.',
      'Name which comparator images were actually inspected and what visual detail changed, confirmed, or weakened the closet-overlap verdict.',
      'Do not call style_render_purchase_analysis or style_show_purchase_analysis_widget until candidate image pixels and available direct comparator image pixels have been inspected. Prefer style_submit_purchase_visual_observations when available; if it is not exposed in a text-first host, pass those concrete observations directly to style_render_purchase_analysis as visual_evidence with source: "host_vision".',
    ],
    renderGate: {
      pendingUntil: input.visuallyGrounded
        ? []
        : [
            ...(candidateImageUrls.length > 0
              ? []
              : ['A direct candidate product image is located from the product page or supplied by the user.']),
            'The host model inspects the candidate image pixels and records concrete observations.',
            'The host model inspects available direct comparator images from style_get_purchase_vision_packet.',
            'Concrete image observations are submitted through style_submit_purchase_visual_observations, or in a text-first host without that tool, passed directly to style_render_purchase_analysis as host_vision visual_evidence.',
          ],
      canRenderWidget: input.visuallyGrounded,
    },
    purchaseVisionPacketRequest,
  };
}

function buildStylePurchaseRenderRepair(input: {
  candidate: unknown;
  preparation: StylePurchasePreparation;
}) {
  const expectedComparatorIds =
    input.preparation.directComparatorItemIds.length > 0
      ? input.preparation.directComparatorItemIds
      : input.preparation.comparatorItemIds;
  const visualEvidence = {
    candidateInspected: true,
    candidateObservations: [
      'replace with concrete observations from the inspected candidate image: silhouette, proportions, material, texture, color temperature, accents, branding, and visible fit/cut cues',
    ],
    comparatorItemIdsInspected: expectedComparatorIds,
    source: 'host_vision',
  };
  return {
    acceptedInputKeys: ['visualEvidence', 'visual_evidence'],
    nextTool: 'style_render_purchase_analysis',
    reason:
      'The render path is waiting for concrete host visual evidence. In text-first or generic MCP hosts, this can be supplied directly to style_render_purchase_analysis without style_submit_purchase_visual_observations when the host has actually inspected the images.',
    retryInput: {
      candidate: input.candidate,
      visualEvidence,
    },
    retryInputSnakeCase: {
      candidate: input.candidate,
      visual_evidence: visualEvidence,
    },
    status: 'missing_or_unaccepted_visual_evidence',
    useWhen:
      'Use after inspecting the candidate image and closest available comparator images. Replace the placeholder observation with real pixel observations before retrying.',
  };
}

function buildStylePurchaseHostVisionComparator(
  analysis: Awaited<ReturnType<StyleService['analyzePurchase']>>,
  itemId: string,
  role: 'adjacent_reference' | 'direct_comparator',
) {
  const item = analysis.itemsById[itemId];
  const comparison = analysis.comparatorReasoning.topComparisons.find((entry) => entry.itemId === itemId);
  return {
    itemId,
    name: item?.name ?? itemId,
    overlapScore: comparison?.overlapScore ?? null,
    relation: comparison?.relation ?? null,
    role,
    summary: comparison?.summary ?? null,
    whyInspect:
      role === 'direct_comparator'
        ? 'Inspect this before deciding overlap; this is a likely same-lane comparator, replacement, upgrade, or duplicate candidate.'
        : 'Inspect as context for styling lane and formality, but keep it secondary to direct comparators.',
  };
}

function isDirectPurchaseComparisonRelation(relation: string): boolean {
  return relation === 'duplicate' || relation === 'replacement' || relation === 'upgrade';
}

function extractPurchaseCandidateSourceUrl(value: unknown): string | null {
  const parsed = parseJsonLike<unknown>(value);
  const direct = asNullableString(parsed) ?? asNullableString(value);
  if (direct && /^https?:\/\//i.test(direct)) {
    return direct;
  }
  const record = asRecord(parsed);
  if (!record) {
    return null;
  }
  return [
    record.url,
    record.productUrl,
    record.product_url,
    record.sourceUrl,
    record.source_url,
    record.pageUrl,
    record.page_url,
  ]
    .map(asNullableString)
    .find((entry) => entry != null && /^https?:\/\//i.test(entry)) ?? null;
}

export async function extractStylePurchasePageEvidence(input: {
  fetchImpl?: typeof fetch;
  maxImages?: number | null;
  productUrl: string;
}): Promise<{
  candidate: Record<string, unknown>;
  extraction: {
    attempted: boolean;
    finalUrl: string | null;
    imageCandidates: StylePurchasePageImageEvidence[];
    pageTitle: string | null;
  };
  productUrl: string;
  recommendedNextSteps: Array<{
    input: Record<string, unknown> | null;
    reason: string;
    tool: string;
  }>;
  renderReady: boolean;
  status: StylePurchasePageEvidenceStatus;
  hostResponseInstruction: string;
  hostResponseMode: 'prepare_with_extracted_images' | 'request_candidate_image';
  nextRequiredTool: string;
  userFacingNarrationInstruction: string;
  userFacingStatus: string;
  visualGrounding: {
    candidateImageCount: number;
    candidateVisualGrounding: 'image_reference_only' | 'none';
    requiredEvidence: string[];
  };
  warnings: string[];
}> {
  const maxImages = clampPageEvidenceMaxImages(input.maxImages);
  const url = normalizePublicProductUrl(input.productUrl);
  if (!url) {
    return buildPageEvidenceResult({
      candidate: {},
      finalUrl: null,
      imageCandidates: [],
      pageTitle: null,
      productUrl: input.productUrl,
      status: 'blocked_url',
      warnings: ['Product URL must be public http(s) and must not target localhost or private network hosts.'],
    });
  }

  let response: Response;
  try {
    response = await (input.fetchImpl ?? fetch)(url.toString(), {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'FluentStyleEvidenceBot/1.0 (+https://meetfluent.app)',
      },
      signal: createFetchTimeoutSignal(15_000),
    });
  } catch (error) {
    return buildPageEvidenceResult({
      candidate: { productUrl: url.toString(), url: url.toString() },
      finalUrl: null,
      imageCandidates: [],
      pageTitle: null,
      productUrl: url.toString(),
      status: 'fetch_failed',
      warnings: [`Could not fetch product page: ${error instanceof Error ? error.message : String(error)}`],
    });
  }

  if (!response.ok) {
    return buildPageEvidenceResult({
      candidate: { productUrl: url.toString(), url: url.toString() },
      finalUrl: response.url || url.toString(),
      imageCandidates: [],
      pageTitle: null,
      productUrl: url.toString(),
      status: 'fetch_failed',
      warnings: [`Product page fetch returned HTTP ${response.status}.`],
    });
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType && !/html|text\/plain|application\/xhtml/i.test(contentType)) {
    return buildPageEvidenceResult({
      candidate: { productUrl: url.toString(), url: url.toString() },
      finalUrl: response.url || url.toString(),
      imageCandidates: [],
      pageTitle: null,
      productUrl: url.toString(),
      status: 'fetch_failed',
      warnings: [`Product page returned unsupported content type: ${contentType}.`],
    });
  }

  const html = (await response.text()).slice(0, 1_500_000);
  const finalUrl = response.url || url.toString();
  const pageTitle = extractHtmlTitle(html);
  const imageExtraction = extractProductImageCandidates(html, finalUrl, maxImages, pageTitle);
  const imageCandidates = imageExtraction.accepted;
  const candidate = {
    imageUrls: imageCandidates.map((entry) => entry.url),
    name: pageTitle,
    productUrl: finalUrl,
    sourceUrl: finalUrl,
    url: finalUrl,
  };

  return buildPageEvidenceResult({
    candidate,
    finalUrl,
    imageCandidates,
    pageTitle,
    productUrl: url.toString(),
    status: imageCandidates.length > 0 ? 'image_references_extracted' : 'no_images_found',
    warnings: imageCandidates.length > 0
      ? imageExtraction.warnings
      : [
          imageExtraction.rejectedCount > 0
            ? `Found ${imageExtraction.rejectedCount} image reference(s), but they looked like logos, navigation, or marketing assets rather than product images.`
            : 'No direct product image references were found in the product page HTML.',
          ...imageExtraction.warnings,
        ],
  });
}

function buildPageEvidenceResult(input: {
  candidate: Record<string, unknown>;
  finalUrl: string | null;
  imageCandidates: StylePurchasePageImageEvidence[];
  pageTitle: string | null;
  productUrl: string;
  status: StylePurchasePageEvidenceStatus;
  warnings: string[];
}) {
  const candidate = {
    ...input.candidate,
    imageUrls: input.imageCandidates.map((entry) => entry.url),
  };
  return {
    candidate,
    extraction: {
      attempted: input.status !== 'blocked_url',
      finalUrl: input.finalUrl,
      imageCandidates: input.imageCandidates,
      pageTitle: input.pageTitle,
    },
    productUrl: input.productUrl,
    recommendedNextSteps: [
      {
        tool: 'style_prepare_purchase_analysis',
        reason:
          input.imageCandidates.length > 0
            ? 'Use the enriched candidate with direct image references to recompute closet context.'
            : 'Use the original product URL candidate, but keep the result text-first until image evidence exists.',
        input: {
          candidate: input.imageCandidates.length > 0 ? candidate : { productUrl: input.productUrl, url: input.productUrl },
        },
      },
      ...(input.imageCandidates.length > 0
        ? [
            {
              tool: 'style_get_purchase_vision_packet',
              reason:
                'After style_prepare_purchase_analysis returns comparatorItemIds for this enriched candidate, request the host-visible candidate and closet comparator images before making a buy/wait/skip call.',
              input: {
                candidate,
                comparator_item_ids: 'use comparatorItemIds from style_prepare_purchase_analysis',
                max_inline_images: STYLE_VISUAL_BUNDLE_MAX_INLINE_IMAGES,
              } as Record<string, unknown>,
            },
          ]
        : []),
      {
        tool: 'host_vision',
        reason:
          input.imageCandidates.length > 0
            ? 'Inspect the returned image URL(s) with a vision-capable host before making color, material, texture, condition, or visual-overlap claims.'
            : 'Open the retailer page manually or ask the user for a product image before making visual claims.',
        input: input.imageCandidates.length > 0 ? { image_urls: input.imageCandidates.map((entry) => entry.url) } : null,
      },
    ],
    renderReady: false,
    status: input.status,
    hostResponseInstruction:
      input.imageCandidates.length > 0
        ? 'Do not give the final buy/wait/skip recommendation yet. Re-run style_prepare_purchase_analysis with this enriched candidate, then call style_get_purchase_vision_packet and inspect the returned inline images before deciding. If narrating this intermediate step to the user, say you found product-page evidence and are checking the visuals; do not say the tool was blocked.'
        : 'Do not give the final buy/wait/skip recommendation yet. Ask the user for a direct product image or uploaded photo before deciding. If narrating this intermediate step to the user, say the analysis needs a product image; do not say the tool was blocked.',
    hostResponseMode: input.imageCandidates.length > 0 ? 'prepare_with_extracted_images' as const : 'request_candidate_image' as const,
    nextRequiredTool: input.imageCandidates.length > 0 ? 'style_prepare_purchase_analysis' : 'user_request_candidate_image',
    userFacingNarrationInstruction:
      'When narrating this step to the user, do not say a tool call was blocked. Say the analysis is waiting on product-page evidence, image inspection, or a product image.',
    userFacingStatus:
      input.imageCandidates.length > 0
        ? 'I found product-page evidence and am checking the actual visuals before making the call.'
        : 'I need a direct product image before making the visual shopping call.',
    visualGrounding: {
      candidateImageCount: input.imageCandidates.length,
      candidateVisualGrounding: input.imageCandidates.length > 0 ? 'image_reference_only' as const : 'none' as const,
      requiredEvidence:
        input.imageCandidates.length > 0
          ? ['Inspect returned image URLs with a vision-capable model before rendering the widget.']
          : ['Locate or request a candidate product image before rendering the widget.'],
    },
    warnings: input.warnings,
  };
}

function clampPageEvidenceMaxImages(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 6;
  }
  return Math.min(12, Math.max(1, Math.trunc(value)));
}

function inferImportedFromSource(sourceUrl: string | null): string | null {
  if (!sourceUrl) {
    return null;
  }
  try {
    const hostname = new URL(sourceUrl).hostname.replace(/^www\./i, '');
    return hostname || null;
  } catch {
    return null;
  }
}

function createFetchTimeoutSignal(milliseconds: number): AbortSignal | undefined {
  if (typeof AbortSignal === 'undefined') {
    return undefined;
  }
  const maybeAbortSignal = AbortSignal as typeof AbortSignal & {
    timeout?: (milliseconds: number) => AbortSignal;
  };
  return maybeAbortSignal.timeout?.(milliseconds);
}

async function buildStyleVisualBundleToolResult(input: {
  bundle: StyleVisualBundleRecord;
  includeInlineImages?: boolean | null;
  maxInlineImages?: number | null;
}) {
  const inlineFetches = input.includeInlineImages
    ? await fetchStyleVisualBundleInlineImages(input.bundle, clampStyleVisualBundleInlineImageCount(input.maxInlineImages))
    : { images: [] as StyleVisualBundleInlineImageFetch[], warnings: [] as string[] };
  const inlineImageContent = inlineFetches.images.map(({ data: _data, ...metadata }) => metadata);
  const hasCandidateAsset = input.bundle.assets.some((asset) => asset.role === 'candidate');
  const textFirstRenderFallback = buildStyleTextFirstRenderFallbackFromVisualBundle({
    bundle: input.bundle,
    inlineImageContent,
  });
  const purchaseFlowGuidance = hasCandidateAsset
    ? 'If this bundle is being used for a staged purchase decision, treat it as a fallback visual reference only. The canonical purchase flow is style_get_purchase_vision_packet, actual host image inspection, then style_submit_purchase_visual_observations before a final buy/wait/skip recommendation. If this text-first host does not expose style_submit_purchase_visual_observations, inspect these inline images and then call style_render_purchase_analysis with concrete visual_evidence and source: "host_vision".'
    : null;
  const hostModelGuidance =
    input.bundle.visualInspection.state === 'missing_candidate_image'
      ? 'Use the returned comparator images plus each asset itemContext and comparisonContext, but the candidate image is missing. Ask the user for a direct product image or inspect a usable product image before making color, texture, condition, fit, or fine visual-overlap claims. Call style_get_item only when correcting an item, checking provenance, or needing full item detail outside this bundle.'
      : hasCandidateAsset
        ? 'Use the returned inline images or image URLs plus each asset itemContext and comparisonContext only as fallback purchase visual context. For staged purchase analysis, call style_get_purchase_vision_packet and then style_submit_purchase_visual_observations before the final buy/wait/skip answer when those tools are exposed. If this host does not expose style_submit_purchase_visual_observations, call Render Purchase Analysis Data / style_render_purchase_analysis with concrete visualEvidence or visual_evidence after inspection; set source to "host_vision". The render tool accepts this fallback directly and does not require the submit tool in text-first hosts. If render returns not_render_ready, retry render with candidateInspected true and candidateObservations populated instead of declaring the backend blocked. Call style_get_item only when correcting an item, checking provenance, or needing full item detail outside this bundle.'
        : 'Use the returned inline images or image URLs plus each asset itemContext and comparisonContext for normal visual analysis. Call style_get_item only when correcting an item, checking provenance, or needing full item detail outside this bundle.';
  const structuredContent = (
    inlineImageContent.length > 0 || inlineFetches.warnings.length > 0
      ? {
          ...input.bundle,
          hostModelGuidance,
          inlineImageContent,
          inlineImageWarnings: inlineFetches.warnings,
          purchaseFlowGuidance,
          textFirstRenderFallback,
        }
      : {
          ...input.bundle,
          hostModelGuidance,
          purchaseFlowGuidance,
          textFirstRenderFallback,
        }
  ) as unknown as Record<string, unknown>;
  const textData = {
    assetCount: input.bundle.assets.length,
    assetContextCount: input.bundle.assets.filter((asset) => asset.itemContext || asset.comparisonContext).length,
    comparatorCoverageMode: input.bundle.comparatorCoverageMode,
    deliveryMode: input.bundle.deliveryMode,
    evidenceWarnings: input.bundle.evidenceWarnings,
    hostModelGuidance,
    inlineImageContentCount: inlineImageContent.length,
    inlineImageWarnings: inlineFetches.warnings,
    purchaseFlowGuidance,
    requestedItemIds: input.bundle.requestedItemIds,
    textFirstRenderFallback,
    visualInspection: input.bundle.visualInspection,
  };
  const content: StyleToolContent[] = [
    { type: 'text', text: JSON.stringify(textData) },
    ...inlineFetches.images.map((image) => ({
      type: 'image' as const,
      data: image.data,
      mimeType: image.mimeType,
    })),
  ];
  return {
    content,
    structuredContent,
  };
}

function buildStyleTextFirstRenderFallbackFromVisualBundle(input: {
  bundle: StyleVisualBundleRecord;
  inlineImageContent?: StyleVisualBundleInlineImageContent[];
}) {
  const candidateAsset = input.bundle.assets.find((asset) => asset.role === 'candidate') ?? null;
  if (!candidateAsset) {
    return null;
  }
  const candidateInlineImage = input.inlineImageContent?.find((entry) => entry.role === 'candidate') ?? null;
  const candidateSourceUrl = candidateInlineImage?.sourceUrl ?? selectStyleVisualBundlePublicUrl(candidateAsset);
  const comparatorItemIds = Array.from(
    new Set(
      input.bundle.assets
        .filter((asset) => asset.role !== 'candidate')
        .map((asset) => asset.itemId)
        .filter((itemId): itemId is string => Boolean(itemId)),
    ),
  );
  const visualEvidenceTemplate = {
    candidateInspected: true,
    candidateObservations: [
      'replace with concrete observations from the inspected candidate image: silhouette, proportions, material, texture, color temperature, accents, branding, and visible fit/cut cues',
    ],
    comparatorItemIdsInspected: comparatorItemIds,
    source: 'host_vision',
  };
  return {
    acceptedInputKeys: ['visualEvidence', 'visual_evidence'],
    candidateImage: {
      contentIndex: candidateInlineImage?.contentIndex ?? null,
      label: candidateAsset.label,
      sourceUrl: candidateSourceUrl,
    },
    comparatorItemIds,
    nextTool: 'style_render_purchase_analysis',
    renderInputTemplate: {
      candidate: 'Reuse the same candidate object or product URL that was used to request this visual bundle.',
      visualEvidence: visualEvidenceTemplate,
    },
    renderInputTemplateSnakeCase: {
      candidate: 'Reuse the same candidate object or product URL that was used to request this visual bundle.',
      visual_evidence: visualEvidenceTemplate,
    },
    retryInstruction:
      'After inspecting the candidate and available comparator images, call style_render_purchase_analysis with one of these templates and replace candidateObservations with real pixel observations. If render returns not_render_ready, use the renderRepair.retryInput payload from that response and retry instead of saying the backend requires style_submit_purchase_visual_observations.',
    source: 'host_vision',
    useWhen:
      'Text-first or generic MCP hosts where style_submit_purchase_visual_observations is not exposed, but Render Purchase Analysis Data / style_render_purchase_analysis is available.',
  };
}

async function enrichStyleVisualBundleCandidateFromProductPage(input: {
  candidate: unknown;
  maxImages?: number | null;
}): Promise<unknown> {
  if (input.candidate == null) {
    return input.candidate;
  }
  try {
    const normalizedCandidate = normalizeStylePurchaseCandidate(input.candidate);
    if (normalizedCandidate.imageUrls.some((url) => isLikelyDirectCandidateImageUrl(url))) {
      return input.candidate;
    }
  } catch {
    return input.candidate;
  }

  const record = asRecord(parseJsonLike<Record<string, unknown>>(input.candidate)) ?? {};
  const rawStringValue = asNullableString(input.candidate);
  const productUrl =
    asNullableString(record.productUrl) ??
    asNullableString(record.product_url) ??
    asNullableString(record.url) ??
    asNullableString(record.sourceUrl) ??
    asNullableString(record.source_url) ??
    asNullableString(record.pageUrl) ??
    asNullableString(record.page_url) ??
    rawStringValue;
  if (!productUrl) {
    return input.candidate;
  }

  try {
    const evidence = await extractStylePurchasePageEvidence({
      maxImages: Math.min(6, Math.max(1, input.maxImages ?? 4)),
      productUrl,
    });
    const imageUrls = Array.isArray(evidence.candidate.imageUrls)
      ? evidence.candidate.imageUrls.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
      : [];
    if (imageUrls.length === 0) {
      return input.candidate;
    }
    return {
      ...record,
      ...evidence.candidate,
      imageUrl: imageUrls[0],
      imageUrls,
    };
  } catch {
    return input.candidate;
  }
}

function isLikelyDirectCandidateImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const pathname = url.pathname.toLowerCase();
    return (
      /\.(?:avif|gif|jpe?g|png|webp)$/.test(pathname) ||
      hostname === 'images.footlocker.com' ||
      hostname.endsWith('.scene7.com') ||
      hostname === 'cdn.shopify.com' ||
      pathname.includes('/cdn/shop/files/')
    );
  } catch {
    return false;
  }
}

function buildStylePurchaseVisionPacketId(input: {
  bundle: StyleVisualBundleRecord;
  candidate: unknown;
  comparatorItemIds: string[];
}): string {
  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        assetKeys: input.bundle.assets.map((asset) => ({
          itemId: asset.itemId,
          photoId: asset.photoId,
          role: asset.role,
          sourceUrl: asset.sourceUrl,
        })),
        candidate: input.candidate,
        comparatorItemIds: input.comparatorItemIds,
      }),
    )
    .digest('hex')
    .slice(0, 20);
  return `style-purchase-vision:${hash}`;
}

function stylePurchaseVisionImageId(asset: StyleVisualBundleAssetRecord, assetIndex: number): string {
  if (asset.role === 'candidate') {
    return `candidate:${assetIndex}`;
  }
  return `${asset.itemId ?? asset.role}:${asset.photoId ?? assetIndex}`;
}

async function buildStylePurchaseVisionPacketToolResult(input: {
  bundle: StyleVisualBundleRecord;
  candidate: unknown;
  maxInlineImages?: number | null;
  preparation: StylePurchasePreparation;
}) {
  const inlineFetches =
    input.preparation.hostVisionTask.status === 'ready_for_host_vision'
      ? await fetchStyleVisualBundleInlineImages(
          input.bundle,
          clampStyleVisualBundleInlineImageCount(input.maxInlineImages),
        )
      : { images: [] as StyleVisualBundleInlineImageFetch[], warnings: [] as string[] };
  const inlineImageContent = inlineFetches.images.map(({ data: _data, ...metadata }) => metadata);
  const packetId = buildStylePurchaseVisionPacketId({
    bundle: input.bundle,
    candidate: input.candidate,
    comparatorItemIds: input.preparation.comparatorItemIds,
  });
  const imageManifest = input.bundle.assets.map((asset, assetIndex) => {
    const inlineImage = inlineImageContent.find((entry) => entry.assetIndex === assetIndex) ?? null;
    const publicSourceUrl = inlineImage?.sourceUrl ?? selectStyleVisualBundlePublicUrl(asset);
    return {
      assetIndex,
      comparisonContext: asset.comparisonContext,
      contentIndex: inlineImage?.contentIndex ?? null,
      imageId: stylePurchaseVisionImageId(asset, assetIndex),
      inlineAvailable: inlineImage != null,
      itemContext: asset.itemContext,
      itemId: asset.itemId,
      label: asset.label,
      photoId: asset.photoId,
      role: asset.role,
      sourceUrl: publicSourceUrl,
    };
  });
  const candidateManifestEntry = imageManifest.find((entry) => entry.role === 'candidate') ?? null;
  const candidateInlineAvailable = candidateManifestEntry?.inlineAvailable === true;
  const readyForHostVision =
    input.preparation.hostVisionTask.status === 'ready_for_host_vision' && candidateInlineAvailable;
  const hostAssets = input.bundle.assets.map(sanitizeStyleVisualBundleAssetForHost);
  const textFirstRenderFallback = buildStyleTextFirstRenderFallbackFromVisualBundle({
    bundle: input.bundle,
    inlineImageContent,
  });
  const structuredContent = {
    assets: hostAssets,
    candidate: input.preparation.candidate,
    candidateInlineAvailable,
    candidateSummary: input.preparation.candidateSummary,
    comparatorItemIds: input.preparation.comparatorItemIds,
    directComparatorItemIds: input.preparation.directComparatorItemIds,
    evidenceWarnings: input.bundle.evidenceWarnings,
    hostResponseMode:
      readyForHostVision
        ? 'inspect_inline_images_then_submit_observations'
        : 'request_candidate_image',
    imageManifest,
    inlineImageContent,
    inlineImageWarnings: inlineFetches.warnings,
    nextTool: readyForHostVision ? 'style_submit_purchase_visual_observations' : null,
    renderReady: false,
    requiredObservationSchema: readyForHostVision
      ? {
          candidate: 'Use the same candidate object passed to this tool.',
          observations:
            'At least one role=candidate entry with concrete observed color, silhouette, and distinctive_details from image pixels.',
          comparator_item_ids_inspected:
            'Closet item IDs whose inline comparator images were actually inspected; include direct comparators first.',
          vision_packet_id: packetId,
        }
      : null,
    status: readyForHostVision ? 'ready_for_host_vision' : 'needs_candidate_image',
    textFirstRenderFallback: readyForHostVision ? textFirstRenderFallback : null,
    visualBundle: {
      ...input.bundle,
      assets: hostAssets,
    },
    visionPacketId: packetId,
  };
  const textData = {
    candidateName: input.preparation.candidateSummary.name,
    directComparatorItemIds: input.preparation.directComparatorItemIds,
    hostModelGuidance:
      readyForHostVision
        ? 'Inspect each inline MCP image content entry named in imageManifest. Submit concrete pixel observations with style_submit_purchase_visual_observations before rendering the widget or giving the final buy/wait/skip answer.'
        : candidateManifestEntry
          ? 'The candidate image was not included as inline MCP image content. Do not submit visual observations, render the widget, or make final visual claims yet. Open or fetch the candidate source URL yourself if the host supports it, or ask the user for a direct product image.'
          : 'No candidate image is available yet. Ask the user for a direct product image or extract one from the product page before making the final shopping call.',
    imageManifest: imageManifest.map((entry) => ({
      contentIndex: entry.contentIndex,
      imageId: entry.imageId,
      itemId: entry.itemId,
      label: entry.label,
      role: entry.role,
    })),
    candidateInlineAvailable,
    inlineImageContentCount: inlineImageContent.length,
    inlineImageWarnings: inlineFetches.warnings,
    nextTool: structuredContent.nextTool,
    renderReady: false,
    status: structuredContent.status,
    textFirstRenderFallback: structuredContent.textFirstRenderFallback,
    visionPacketId: packetId,
  };
  const content: StyleToolContent[] = [
    { type: 'text', text: JSON.stringify(textData) },
    ...inlineFetches.images.map((image) => ({
      type: 'image' as const,
      data: image.data,
      mimeType: image.mimeType,
    })),
  ];
  return {
    content,
    structuredContent,
  };
}

function buildStylePurchaseVisualEvidenceFromObservations(input: z.infer<typeof styleSubmitPurchaseVisualObservationsInputSchema>) {
  const candidateObservations = input.observations
    .filter((observation) => observation.role === 'candidate')
    .map((observation) => {
      const parts = [
        `image ${observation.image_id}`,
        `color: ${observation.observed.color}`,
        `silhouette: ${observation.observed.silhouette}`,
        observation.observed.material_or_texture ? `material/texture: ${observation.observed.material_or_texture}` : null,
        `details: ${observation.observed.distinctive_details.join('; ')}`,
      ].filter((entry): entry is string => Boolean(entry));
      return parts.join('. ');
    });
  if (candidateObservations.length === 0) {
    throw new Error(
      'style_submit_purchase_visual_observations not_render_ready: at least one candidate image observation is required.',
    );
  }
  const comparatorItemIdsInspected = Array.from(
    new Set(
      (input.comparator_item_ids_inspected ?? input.observations.map((observation) => observation.item_id ?? '').filter(Boolean))
        .map((itemId) => itemId.trim())
        .filter(Boolean),
    ),
  );
  const visualEvidence = stylePurchaseVisualEvidenceInputSchema.parse({
    candidateInspected: true,
    candidateObservations,
    comparatorItemIdsInspected,
    source: STYLE_PURCHASE_VISUAL_EVIDENCE_SOURCE,
  });
  return {
    ...visualEvidence,
    visionPacketId: input.vision_packet_id ?? null,
    visualObservationId: buildStylePurchaseVisualObservationReceiptId({
      observations: input.observations,
      visionPacketId: input.vision_packet_id ?? null,
    }),
  };
}

function buildStylePurchaseVisualObservationReceiptId(input: {
  observations: z.infer<typeof styleSubmitPurchaseVisualObservationsInputSchema>['observations'];
  visionPacketId: string | null;
}) {
  const hash = createHash('sha256')
    .update(JSON.stringify({ observations: input.observations, visionPacketId: input.visionPacketId }))
    .digest('hex')
    .slice(0, 20);
  return `style-purchase-visual-observation:${hash}`;
}

function stableJsonForCache(value: unknown): string {
  if (value == null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJsonForCache(entry)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJsonForCache(record[key])}`)
    .join(',')}}`;
}

function stylePurchaseCacheAuthKey(authProps: FluentAuthProps): string {
  return (
    authProps.userId?.trim() ||
    authProps.email?.trim() ||
    authProps.tenantId?.trim() ||
    authProps.oauthClientId?.trim() ||
    'anonymous'
  );
}

function stylePurchaseCandidateCacheKey(authProps: FluentAuthProps, candidate: unknown): string {
  let normalized: unknown;
  try {
    normalized = normalizeStylePurchaseCandidate(candidate);
  } catch {
    normalized = parseJsonLike<unknown>(candidate) ?? candidate;
  }
  const hash = createHash('sha256')
    .update(
      stableJsonForCache({
        auth: stylePurchaseCacheAuthKey(authProps),
        candidate: normalized,
      }),
    )
    .digest('hex')
    .slice(0, 32);
  return `style-purchase-visual-evidence:${hash}`;
}

function pruneStylePurchaseVisualEvidenceCache(now = Date.now()) {
  if (stylePurchaseVisualEvidenceCache.size <= 100) {
    for (const [key, entry] of stylePurchaseVisualEvidenceCache) {
      if (entry.expiresAt <= now) {
        stylePurchaseVisualEvidenceCache.delete(key);
      }
    }
    return;
  }
  for (const [key, entry] of stylePurchaseVisualEvidenceCache) {
    if (entry.expiresAt <= now || stylePurchaseVisualEvidenceCache.size > 80) {
      stylePurchaseVisualEvidenceCache.delete(key);
    }
  }
}

function rememberStylePurchaseVisualEvidence(input: {
  authProps: FluentAuthProps;
  candidateInputs: unknown[];
  visualEvidence: StylePurchaseVisualEvidence;
}) {
  const now = Date.now();
  pruneStylePurchaseVisualEvidenceCache(now);
  const entry: StylePurchaseVisualEvidenceCacheEntry = {
    expiresAt: now + STYLE_PURCHASE_VISUAL_EVIDENCE_CACHE_TTL_MS,
    visualEvidence: input.visualEvidence,
  };
  for (const candidateInput of input.candidateInputs) {
    stylePurchaseVisualEvidenceCache.set(
      stylePurchaseCandidateCacheKey(input.authProps, candidateInput),
      entry,
    );
  }
  if (input.visualEvidence.visualObservationId) {
    stylePurchaseVisualEvidenceCache.set(
      `${stylePurchaseCacheAuthKey(input.authProps)}:${input.visualEvidence.visualObservationId}`,
      entry,
    );
  }
}

function recallStylePurchaseVisualEvidence(input: {
  args: unknown;
  authProps: FluentAuthProps;
  candidate: unknown;
}): StylePurchaseVisualEvidence | undefined {
  const now = Date.now();
  pruneStylePurchaseVisualEvidenceCache(now);
  const record = asRecord(input.args);
  const candidateKeys = [
    record?.visualObservationId,
    record?.visual_observation_id,
    asRecord(record?.visualEvidence ?? record?.visual_evidence)?.visualObservationId,
    asRecord(record?.visualEvidence ?? record?.visual_evidence)?.visual_observation_id,
  ]
    .map(asNullableString)
    .filter((entry): entry is string => Boolean(entry))
    .map((id) => `${stylePurchaseCacheAuthKey(input.authProps)}:${id}`);
  candidateKeys.push(stylePurchaseCandidateCacheKey(input.authProps, input.candidate));
  for (const key of candidateKeys) {
    const entry = stylePurchaseVisualEvidenceCache.get(key);
    if (entry && entry.expiresAt > now) {
      return entry.visualEvidence;
    }
  }
  return undefined;
}

async function fetchStyleVisualBundleInlineImages(
  bundle: StyleVisualBundleRecord,
  maxImages: number,
): Promise<{ images: StyleVisualBundleInlineImageFetch[]; warnings: string[] }> {
  const images: StyleVisualBundleInlineImageFetch[] = [];
  const warnings: string[] = [];
  for (const [assetIndex, asset] of bundle.assets.entries()) {
    if (images.length >= maxImages) {
      break;
    }
    const sourceUrls = selectStyleVisualBundleFetchUrls(asset);
    if (sourceUrls.length === 0) {
      warnings.push(`No fetchable image URL was available for ${asset.label}.`);
      continue;
    }
    const skippedReasons: string[] = [];
    let didInline = false;
    for (const sourceUrl of sourceUrls) {
      const publicUrl = normalizePublicProductUrl(sourceUrl);
      if (!publicUrl) {
        skippedReasons.push('non-public URL');
        continue;
      }
      try {
        const fetched = await fetchStyleVisualBundleImage(publicUrl.toString());
        images.push({
          ...fetched,
          assetIndex,
          contentIndex: images.length + 1,
          itemId: asset.itemId,
          label: asset.label,
          photoId: asset.photoId,
          role: asset.role,
          sourceUrl: publicUrl.toString(),
        });
        didInline = true;
        break;
      } catch (error) {
        skippedReasons.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (!didInline) {
      warnings.push(`Could not inline ${asset.label}: ${skippedReasons.join('; ')}`);
    }
  }
  return { images, warnings };
}

async function fetchStyleVisualBundleImage(url: string): Promise<{
  byteLength: number;
  data: string;
  mimeType: string;
}> {
  const response = await fetch(url, {
    headers: { accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8' },
    signal: createFetchTimeoutSignal(15_000),
  });
  if (!response.ok) {
    throw new Error(`image fetch returned HTTP ${response.status}`);
  }
  const mimeType = normalizeImageMimeType(response.headers.get('content-type'));
  if (!mimeType) {
    throw new Error('image fetch did not return an image content type');
  }
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > STYLE_VISUAL_BUNDLE_MAX_INLINE_IMAGE_BYTES) {
    throw new Error(`image is larger than ${STYLE_VISUAL_BUNDLE_MAX_INLINE_IMAGE_BYTES} bytes`);
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > STYLE_VISUAL_BUNDLE_MAX_INLINE_IMAGE_BYTES) {
    throw new Error(`image is larger than ${STYLE_VISUAL_BUNDLE_MAX_INLINE_IMAGE_BYTES} bytes`);
  }
  return {
    byteLength: buffer.byteLength,
    data: encodeArrayBufferBase64(buffer),
    mimeType,
  };
}

function selectStyleVisualBundleFetchUrls(asset: StyleVisualBundleAssetRecord): string[] {
  const candidates =
    asset.role === 'candidate'
      ? [asset.sourceUrl, asset.fallbackSignedOriginalUrl, asset.authenticatedOriginalUrl]
      : [asset.fallbackSignedOriginalUrl, asset.sourceUrl, asset.authenticatedOriginalUrl];
  return Array.from(
    new Set(
      candidates
        .filter((value): value is string => Boolean(value))
        .flatMap((value) =>
          asset.role === 'candidate' ? buildInlineFriendlyCandidateImageUrls(value) : [value],
        ),
    ),
  );
}

function buildInlineFriendlyCandidateImageUrls(value: string): string[] {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'images.footlocker.com' || hostname === 'images.footlocker.ca') {
      return [
        withImageSearchParamSize(url, { heightParam: 'hei', size: 640, widthParam: 'wid' }),
        withImageSearchParamSize(url, { heightParam: 'hei', size: 320, widthParam: 'wid' }),
        withImageSearchParamSize(url, { heightParam: 'hei', size: 150, widthParam: 'wid' }),
        value,
      ];
    }
    if (hostname === 'cdn.shopify.com' || url.pathname.includes('/cdn/shop/files/')) {
      return [
        withImageSearchParamSize(url, { size: 1200, widthParam: 'width' }),
        withImageSearchParamSize(url, { size: 900, widthParam: 'width' }),
        withImageSearchParamSize(url, { size: 640, widthParam: 'width' }),
        value,
      ];
    }
  } catch {
    return [value];
  }
  return [value];
}

function withImageSearchParamSize(
  source: URL,
  options: { heightParam?: string; size: number; widthParam: string },
): string {
  const url = new URL(source.toString());
  url.searchParams.set(options.widthParam, String(options.size));
  if (options.heightParam) {
    url.searchParams.set(options.heightParam, String(options.size));
  }
  return url.toString();
}

function normalizeImageMimeType(value: string | null): string | null {
  const mimeType = value?.split(';')[0]?.trim().toLowerCase() ?? '';
  return mimeType.startsWith('image/') ? mimeType : null;
}

function clampStyleVisualBundleInlineImageCount(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return STYLE_VISUAL_BUNDLE_MAX_INLINE_IMAGES;
  }
  return Math.min(STYLE_VISUAL_BUNDLE_MAX_INLINE_IMAGES, Math.max(1, Math.trunc(value)));
}

function encodeArrayBufferBase64(buffer: ArrayBuffer): string {
  if (typeof btoa === 'function') {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return btoa(binary);
  }
  const maybeBuffer = (globalThis as typeof globalThis & {
    Buffer?: { from(input: ArrayBuffer): { toString(encoding: 'base64'): string } };
  }).Buffer;
  if (maybeBuffer) {
    return maybeBuffer.from(buffer).toString('base64');
  }
  throw new Error('No base64 encoder is available in this runtime');
}

function normalizePublicProductUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('127.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
      hostname === '::1' ||
      hostname === '[::1]'
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function extractProductImageCandidates(
  html: string,
  baseUrl: string,
  maxImages: number,
  pageTitle: string | null,
): {
  accepted: StylePurchasePageImageEvidence[];
  rejectedCount: number;
  warnings: string[];
} {
  const candidates: StylePurchasePageImageEvidence[] = [];
  const push = (urlValue: string | null, source: string, alt: string | null = null) => {
    const normalized = normalizeCandidateImageUrl(urlValue, baseUrl);
    if (!normalized) {
      return;
    }
    candidates.push({ alt, source, url: normalized });
  };

  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseHtmlAttributes(tag[0]);
    const key = (attrs.property ?? attrs.name ?? '').toLowerCase();
    if (['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src'].includes(key)) {
      push(attrs.content ?? null, key);
    }
  }

  for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = parseHtmlAttributes(tag[0]);
    if ((attrs.rel ?? '').toLowerCase().split(/\s+/).includes('image_src')) {
      push(attrs.href ?? null, 'link:image_src');
    }
  }

  for (const tag of html.matchAll(/<img\b[^>]*>/gi)) {
    const attrs = parseHtmlAttributes(tag[0]);
    push(attrs.src ?? attrs['data-src'] ?? attrs['data-original'] ?? null, 'img', attrs.alt ?? null);
    for (const srcsetUrl of splitSrcset(attrs.srcset ?? attrs['data-srcset'] ?? '')) {
      push(srcsetUrl, 'img:srcset', attrs.alt ?? null);
    }
  }

  for (const match of html.matchAll(/https?:\\?\/\\?\/[^"'\s<>]+?\.(?:avif|gif|jpe?g|png|webp)(?:\?[^"'\s<>]*)?/gi)) {
    push(match[0], 'html-url');
  }

  const deduped = dedupeProductImageEvidence(candidates, pageTitle, baseUrl);
  const accepted = deduped
    .filter((entry) => !isLikelyNonProductImage(entry, pageTitle, baseUrl))
    .sort((left, right) => scoreProductImageEvidence(right, pageTitle, baseUrl) - scoreProductImageEvidence(left, pageTitle, baseUrl))
    .slice(0, maxImages);
  const rejectedCount = deduped.length - accepted.length;
  return {
    accepted,
    rejectedCount,
    warnings:
      rejectedCount > 0
        ? [`Filtered ${rejectedCount} non-product image reference(s) from the product page.`]
        : [],
  };
}

function sanitizeStyleVisualBundleAssetForHost(asset: StyleVisualBundleAssetRecord): StyleVisualBundleAssetRecord {
  const publicSourceUrl = selectStyleVisualBundlePublicUrl(asset);
  return {
    ...asset,
    sourceUrl: publicSourceUrl,
  };
}

async function buildPurchaseAnalysisImageHints(
  style: StyleService,
  analysis: Awaited<ReturnType<StyleService['analyzePurchase']>>,
  candidate: unknown,
): Promise<PurchaseAnalysisImageHints> {
  const hints: PurchaseAnalysisImageHints = {
    candidateImageUrl: analysis.candidate.imageUrls[0] ?? null,
    comparatorImageUrlsByItemId: {},
  };
  const comparatorItemIds = analysis.comparatorReasoning.topComparisons
    .map((entry) => entry.itemId)
    .filter(Boolean)
    .slice(0, 4);
  if (comparatorItemIds.length === 0 && !hints.candidateImageUrl) {
    return hints;
  }

  try {
    const bundle = await style.getVisualBundle({
      candidate,
      deliveryMode: 'authenticated_with_signed_fallback',
      includeComparators: true,
      itemIds: comparatorItemIds,
      maxImages: Math.max(1, Math.min(8, comparatorItemIds.length + 1)),
    });
    for (const asset of bundle.assets) {
      const publicUrl = selectStyleVisualBundlePublicUrl(asset);
      if (!publicUrl) {
        continue;
      }
      if (asset.role === 'candidate') {
        hints.candidateImageUrl = publicUrl;
      } else if (asset.itemId) {
        hints.comparatorImageUrlsByItemId![asset.itemId] = publicUrl;
      }
    }
  } catch {
    // Widget images are an enhancement. Analysis should still render if a
    // signed image URL cannot be assembled for this host response.
  }

  return hints;
}

function selectStyleVisualBundlePublicUrl(asset: StyleVisualBundleAssetRecord): string | null {
  for (const sourceUrl of selectStyleVisualBundleFetchUrls(asset)) {
    const publicUrl = normalizePublicProductUrl(sourceUrl);
    if (publicUrl) {
      return publicUrl.toString();
    }
  }
  return null;
}

function dedupeProductImageEvidence(
  candidates: StylePurchasePageImageEvidence[],
  pageTitle: string | null,
  pageUrl: string,
): StylePurchasePageImageEvidence[] {
  const byIdentity = new Map<string, StylePurchasePageImageEvidence>();
  for (const candidate of candidates) {
    const identity = productImageIdentityKey(candidate.url);
    const existing = byIdentity.get(identity);
    if (!existing || compareProductImageEvidence(candidate, existing, pageTitle, pageUrl) > 0) {
      byIdentity.set(identity, candidate);
    }
  }
  return Array.from(byIdentity.values());
}

function compareProductImageEvidence(
  left: StylePurchasePageImageEvidence,
  right: StylePurchasePageImageEvidence,
  pageTitle: string | null,
  pageUrl: string,
): number {
  const scoreDelta = scoreProductImageEvidence(left, pageTitle, pageUrl) - scoreProductImageEvidence(right, pageTitle, pageUrl);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }
  const protocolDelta = imageUrlProtocolScore(left.url) - imageUrlProtocolScore(right.url);
  if (protocolDelta !== 0) {
    return protocolDelta;
  }
  const widthDelta = imageUrlWidthScore(left.url) - imageUrlWidthScore(right.url);
  if (widthDelta !== 0) {
    return widthDelta;
  }
  return right.url.length - left.url.length;
}

function productImageIdentityKey(value: string): string {
  try {
    const url = new URL(value);
    const params = new URLSearchParams(url.search);
    for (const key of ['height', 'h', 'quality', 'q', 'width', 'w']) {
      params.delete(key);
    }
    const normalizedSearch = params.toString();
    return `${url.hostname.replace(/^www\./i, '').toLowerCase()}${url.pathname.toLowerCase()}${normalizedSearch ? `?${normalizedSearch}` : ''}`;
  } catch {
    return value.toLowerCase();
  }
}

function imageUrlProtocolScore(value: string): number {
  try {
    return new URL(value).protocol === 'https:' ? 1 : 0;
  } catch {
    return 0;
  }
}

function imageUrlWidthScore(value: string): number {
  try {
    const url = new URL(value);
    const width = Number(url.searchParams.get('width') ?? url.searchParams.get('w') ?? 0);
    return Number.isFinite(width) ? width : 0;
  } catch {
    return 0;
  }
}

function extractHtmlTitle(html: string): string | null {
  for (const key of ['og:title', 'twitter:title']) {
    const value = extractMetaContent(html, key);
    if (value) {
      return value;
    }
  }
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? null;
  return normalizeHtmlText(title);
}

function extractMetaContent(html: string, key: string): string | null {
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseHtmlAttributes(tag[0]);
    const attrKey = (attrs.property ?? attrs.name ?? '').toLowerCase();
    if (attrKey === key) {
      return normalizeHtmlText(attrs.content ?? null);
    }
  }
  return null;
}

function parseHtmlAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
    attrs[match[1]!.toLowerCase()] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

function normalizeCandidateImageUrl(value: string | null, baseUrl: string): string | null {
  const cleaned = normalizeHtmlText(value)
    ?.replace(/\\u0026/gi, '&')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/');
  if (!cleaned) {
    return null;
  }
  try {
    const url = new URL(cleaned, baseUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:' && !url.protocol.startsWith('data:')) {
      return null;
    }
    if (url.protocol === 'http:') {
      url.protocol = 'https:';
    }
    const signature = `${url.hostname}${url.pathname}${url.search}`.toLowerCase();
    if (url.pathname.toLowerCase().endsWith('.svg')) {
      return null;
    }
    if (!/\.(avif|gif|jpe?g|png|webp)(?:$|\?)/.test(url.pathname.toLowerCase()) && !/(image|img|photo|media|cdn)/.test(signature)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeHtmlText(value: string | null): string | null {
  const normalized = decodeHtmlEntities(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function splitSrcset(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim().split(/\s+/)[0])
    .filter((entry): entry is string => Boolean(entry));
}

function scoreImageEvidenceSource(source: string): number {
  if (source.startsWith('og:image')) return 5;
  if (source.startsWith('twitter:image')) return 4;
  if (source === 'link:image_src') return 3;
  if (source.startsWith('img')) return 2;
  return 1;
}

function scoreProductImageEvidence(entry: StylePurchasePageImageEvidence, pageTitle: string | null, pageUrl: string): number {
  let score = scoreImageEvidenceSource(entry.source) * 10;
  const signature = imageEvidenceSignature(entry);
  if (/\b(product|pdp|catalog|sku|style|shot|main|primary|zoom|large|detail)\b/.test(signature)) score += 8;
  if (/\b(model|front|side|lateral|medial|pair|shoe|sneaker|boot|loafer|shirt|jacket|pant|dress)\b/.test(signature)) score += 5;
  const productTerms = productImageTitleTerms(pageTitle);
  for (const term of productTerms) {
    if (signature.includes(term)) score += 3;
  }
  if (hasProductPageId(entry, pageUrl)) score += 18;
  return score;
}

function isLikelyNonProductImage(entry: StylePurchasePageImageEvidence, pageTitle: string | null, pageUrl: string): boolean {
  const signature = imageEvidenceSignature(entry);
  const searchText = imageEvidenceSearchText(entry);
  if (/\b(logo|brand logo|brand logos|icon|sprite|favicon|payment|badge|loader|placeholder)\b/.test(searchText)) {
    return true;
  }
  if (/\b(homepage|home page|top nav|nav image|navigation|header|footer|banner|hero|promo|campaign|editorial)\b/.test(searchText)) {
    return true;
  }
  if (/\b(evergreen brands|brands brand|brand 6up|brand grid|category|basketball|running|spring|men s|womens?|kids)\b/.test(searchText) && !hasProductTitleTerm(entry, pageTitle)) {
    return true;
  }
  if (hasConflictingCommerceImageId(entry, pageUrl)) {
    return true;
  }
  if (entry.source.startsWith('img') && !hasProductTitleTerm(entry, pageTitle) && !hasProductPageId(entry, pageUrl) && !/\b(product|pdp|sku|catalog|main|primary|zoom|shot)\b/.test(signature)) {
    return true;
  }
  return false;
}

function hasProductTitleTerm(entry: StylePurchasePageImageEvidence, pageTitle: string | null): boolean {
  const signature = imageEvidenceSignature(entry);
  return productImageTitleTerms(pageTitle).some((term) => signature.includes(term));
}

function imageEvidenceSignature(entry: StylePurchasePageImageEvidence): string {
  return `${entry.url} ${entry.alt ?? ''} ${entry.source}`.toLowerCase();
}

function imageEvidenceSearchText(entry: StylePurchasePageImageEvidence): string {
  return imageEvidenceSignature(entry)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function productImageTitleTerms(pageTitle: string | null): string[] {
  const stopWords = new Set([
    'the',
    'and',
    'for',
    'with',
    'mens',
    'men',
    'women',
    'womens',
    'kids',
    'shoe',
    'shoes',
    'canada',
    'foot',
    'locker',
    'footlocker',
  ]);
  return (pageTitle ?? '')
    .toLowerCase()
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((term) => term.length >= 3 && !stopWords.has(term))
    .slice(0, 12);
}

function hasProductPageId(entry: StylePurchasePageImageEvidence, pageUrl: string): boolean {
  const pageIds = productImagePageIds(pageUrl);
  if (pageIds.length === 0) {
    return false;
  }
  const signature = imageEvidenceSignature(entry);
  return pageIds.some((id) => signature.includes(id));
}

function hasConflictingCommerceImageId(entry: StylePurchasePageImageEvidence, pageUrl: string): boolean {
  const pageIds = productImagePageIds(pageUrl);
  if (pageIds.length === 0) {
    return false;
  }
  const imageIds = productImageUrlIds(entry.url);
  if (imageIds.length === 0) {
    return false;
  }
  return !imageIds.some((id) => pageIds.includes(id));
}

function productImagePageIds(pageUrl: string): string[] {
  try {
    const url = new URL(pageUrl);
    return Array.from(new Set(extractCommerceImageIds(url.pathname)));
  } catch {
    return [];
  }
}

function productImageUrlIds(imageUrl: string): string[] {
  try {
    const url = new URL(imageUrl);
    return Array.from(new Set(extractCommerceImageIds(url.pathname)));
  } catch {
    return [];
  }
}

function extractCommerceImageIds(value: string): string[] {
  const ids: string[] = [];
  const normalized = value.toLowerCase();
  for (const match of normalized.matchAll(/[a-z]{2,}[a-z0-9]*\d{3,}[a-z0-9]*(?:-\d{2,})?/g)) {
    ids.push(match[0]);
  }
  for (const token of normalized.split(/[^a-z0-9-]+/i)) {
    if (/^\d{5,}$/.test(token) || /^[a-z]{2,}\d{4,}(?:-\d{2,})?$/.test(token)) {
      ids.push(token);
    }
  }
  return ids;
}

function coercePurchaseVisualObservationStrings(value: unknown): string[] {
  const entries = Array.isArray(value) ? value : [value];
  return entries
    .map((entry) => {
      const direct = asNullableString(entry)?.trim();
      if (direct) {
        return direct;
      }
      const record = asRecord(entry);
      if (!record) {
        return null;
      }
      const observed = asRecord(record.observed);
      const distinctiveDetails = observed?.distinctive_details;
      return [
        record.observation,
        record.observations,
        record.description,
        record.details,
        record.summary,
        record.color,
        record.material,
        record.texture,
        record.silhouette,
        record.difference,
        observed?.color,
        observed?.material_or_texture,
        observed?.material,
        observed?.texture,
        observed?.silhouette,
        ...(Array.isArray(distinctiveDetails) ? distinctiveDetails : [distinctiveDetails]),
      ]
        .map((part) => asNullableString(part)?.trim())
        .filter(Boolean)
        .join('. ');
    })
    .filter((entry): entry is string => Boolean(entry));
}

function firstRecommendedPurchaseRenderInput(record: Record<string, unknown>): Record<string, unknown> | null {
  const steps = record.recommendedNextSteps ?? record.recommended_next_steps;
  if (!Array.isArray(steps)) {
    return null;
  }
  for (const step of steps) {
    const stepRecord = asRecord(step);
    if (!stepRecord) {
      continue;
    }
    const toolName = asNullableString(stepRecord.tool);
    const input = asRecord(stepRecord.input);
    if (input && (!toolName || toolName === 'style_render_purchase_analysis')) {
      return input;
    }
  }
  return null;
}

function coercePurchaseVisualEvidence(value: unknown, options: { allowHostVisionFallback?: boolean } = {}) {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const candidateInspectedFlag = record.candidateInspected === true || record.candidate_inspected === true;
  const rawObservations = record.candidateObservations ?? record.candidate_observations ?? record.observations;
  const observations = coercePurchaseVisualObservationStrings(rawObservations);
  const candidateInspected = candidateInspectedFlag || (options.allowHostVisionFallback === true && observations.length > 0);
  if (!candidateInspected || observations.length === 0) {
    return null;
  }
  if (isInsufficientPurchaseVisualEvidenceText(observations.join(' '))) {
    return null;
  }
  const source = asNullableString(record.source);
  const acceptedSource =
    source === STYLE_PURCHASE_VISUAL_EVIDENCE_SOURCE
      ? STYLE_PURCHASE_VISUAL_EVIDENCE_SOURCE
      : options.allowHostVisionFallback === true && (!source || source === 'host_vision')
        ? 'host_vision'
        : null;
  if (!acceptedSource) {
    return null;
  }
  const rawComparatorIds =
    record.comparatorItemIdsInspected ??
    record.comparator_item_ids_inspected ??
    record.inspectedComparatorItemIds ??
    record.inspected_comparator_item_ids ??
    record.comparatorItemIds ??
    record.comparator_item_ids;
  const comparatorItemIdsInspected = (Array.isArray(rawComparatorIds) ? rawComparatorIds : [rawComparatorIds])
    .map((itemId) => asNullableString(itemId)?.trim())
    .filter((itemId): itemId is string => Boolean(itemId));
  return {
    candidateInspected: true,
    candidateObservations: observations,
    comparatorItemIdsInspected,
    source: acceptedSource,
    visionPacketId: asNullableString(record.visionPacketId ?? record.vision_packet_id) ?? null,
    visualObservationId: asNullableString(record.visualObservationId ?? record.visual_observation_id) ?? undefined,
  };
}

function hasConcretePurchaseVisualEvidence(value: unknown): boolean {
  return coercePurchaseVisualEvidence(value, { allowHostVisionFallback: true }) !== null;
}

function hasAcceptedPurchaseVisualEvidence(
  value: unknown,
  options: { allowHostVisionFallback?: boolean } = {},
): boolean {
  return coercePurchaseVisualEvidence(value, options) !== null;
}

function acceptedPurchaseVisualEvidenceOrUndefined(
  value: unknown,
  options: { allowHostVisionFallback?: boolean } = {},
): unknown | undefined {
  return coercePurchaseVisualEvidence(value, options) ?? undefined;
}

function extractPurchaseVisualEvidenceArgument(args: unknown): unknown {
  const record = asRecord(args);
  if (!record) {
    return undefined;
  }
  const retryInput = asRecord(record.retryInput ?? record.retry_input);
  const renderRepair = asRecord(record.renderRepair ?? record.render_repair);
  const renderRepairRetryInput = asRecord(renderRepair?.retryInput ?? renderRepair?.retry_input);
  const renderInput = asRecord(record.renderInput ?? record.render_input ?? record.input);
  const receipt = asRecord(record.receipt ?? record.result ?? record.structuredContent ?? record.structured_content);
  const recommendedInput = firstRecommendedPurchaseRenderInput(record) ?? (receipt ? firstRecommendedPurchaseRenderInput(receipt) : null);
  return (
    record.visual_evidence ??
    record.visualEvidence ??
    record.visual_observations ??
    record.visualObservations ??
    record.evidence ??
    renderInput?.visual_evidence ??
    renderInput?.visualEvidence ??
    renderInput?.visual_observations ??
    renderInput?.visualObservations ??
    renderInput?.evidence ??
    receipt?.visual_evidence ??
    receipt?.visualEvidence ??
    receipt?.visual_observations ??
    receipt?.visualObservations ??
    receipt?.evidence ??
    recommendedInput?.visual_evidence ??
    recommendedInput?.visualEvidence ??
    recommendedInput?.visual_observations ??
    recommendedInput?.visualObservations ??
    recommendedInput?.evidence ??
    retryInput?.visualEvidence ??
    retryInput?.visual_evidence ??
    retryInput?.visualObservations ??
    retryInput?.visual_observations ??
    renderRepairRetryInput?.visualEvidence ??
    renderRepairRetryInput?.visual_evidence ??
    renderRepairRetryInput?.visualObservations ??
    renderRepairRetryInput?.visual_observations ??
    (record.observations ? record : undefined)
  );
}

function isInsufficientPurchaseVisualEvidenceText(value: string): boolean {
  const normalized = value.toLowerCase();
  return INSUFFICIENT_PURCHASE_VISUAL_EVIDENCE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function registerStyleMcpSurface(server: McpServer, style: StyleService, origin: string) {
  const purchaseAnalysisWidgetMeta = buildWidgetMeta(
    'Rich Fluent purchase analysis for Style buy/skip decisions in ChatGPT-style widget hosts.',
    origin,
  );

  const registerPurchaseAnalysisWidgetResource = (name: string, uri: string, title: string) => {
    server.registerResource(
      name,
      uri,
      {
        title,
        description: 'Rich Style purchase analysis card for buy, consider, wait, or skip decisions.',
        mimeType: 'text/html;profile=mcp-app',
        icons: iconFor(origin),
        _meta: purchaseAnalysisWidgetMeta,
      },
      async () => ({
        contents: [
          {
            uri,
            mimeType: 'text/html;profile=mcp-app',
            text: getPurchaseAnalysisWidgetHtml(),
            _meta: purchaseAnalysisWidgetMeta,
          },
        ],
      }),
    );
  };

  registerPurchaseAnalysisWidgetResource(
    'fluent-style-purchase-analysis-widget-legacy-v2',
    STYLE_PURCHASE_ANALYSIS_LEGACY_TEMPLATE_URI,
    'Purchase Analysis Widget Legacy v2',
  );
  registerPurchaseAnalysisWidgetResource(
    'fluent-style-purchase-analysis-widget-previous-v3',
    STYLE_PURCHASE_ANALYSIS_PREVIOUS_TEMPLATE_URI,
    'Purchase Analysis Widget Previous v3',
  );
  registerPurchaseAnalysisWidgetResource(
    'fluent-style-purchase-analysis-widget-cached-v4',
    STYLE_PURCHASE_ANALYSIS_CACHED_TEMPLATE_URI,
    'Purchase Analysis Widget Cached v4',
  );
  registerPurchaseAnalysisWidgetResource(
    'fluent-style-purchase-analysis-widget-image-v5',
    STYLE_PURCHASE_ANALYSIS_IMAGE_TEMPLATE_URI,
    'Purchase Analysis Widget Image v5',
  );
  registerPurchaseAnalysisWidgetResource(
    'fluent-style-purchase-analysis-widget-human-v6',
    STYLE_PURCHASE_ANALYSIS_HUMAN_TEMPLATE_URI,
    'Purchase Analysis Widget Human v6',
  );
  registerPurchaseAnalysisWidgetResource(
    'fluent-style-purchase-analysis-widget-combined-v7',
    STYLE_PURCHASE_ANALYSIS_COMBINED_TEMPLATE_URI,
    'Purchase Analysis Widget Combined v7',
  );
  registerPurchaseAnalysisWidgetResource(
    'fluent-style-purchase-analysis-widget',
    STYLE_PURCHASE_ANALYSIS_TEMPLATE_URI,
    'Purchase Analysis Widget',
  );

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
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
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
      description:
        'Fetch ambient closet-derived Style context for broad wardrobe and setup workflows. Do not use this as the first tool for purchase decisions, product links, direct image URLs, or "should I buy this?" prompts; use style_prepare_purchase_analysis first even when the candidate is text-only or has no image yet.',
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
      description:
        'Create, update, archive, or retire a canonical Style closet item. Use this when the user says they no longer own something, wants an item removed from the closet, or needs a saved item corrected.',
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
    'style_archive_item',
    {
      title: 'Archive Style Item',
      description:
        'Archive a Style closet item by item_id or exact item_name, then return read-after-write verification that no active exact match remains. Use this when the user says they do not own a saved item or asks to remove an incorrect closet item.',
      inputSchema: {
        item_id: z.string().optional(),
        item_name: z.string().optional(),
        source_snapshot: z.any().optional(),
        ...provenanceInputSchema,
      },
      annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: true, openWorldHint: false },
    },
    async (args) => {
      const authProps = requireAnyScope([FLUENT_STYLE_WRITE_SCOPE, FLUENT_MEALS_WRITE_SCOPE]);
      const result = await style.archiveItem({
        itemId: args.item_id,
        itemName: args.item_name,
        provenance: buildMutationProvenance(authProps, args),
        sourceSnapshot: args.source_snapshot,
      });
      return toolResult(result, {
        textData: {
          archivedItemIds: result.archivedItemIds,
          matchedItemCount: result.matchedItems.length,
          requestedItemId: result.requestedItemId,
          requestedName: result.requestedName,
          status: result.status,
          verifiedNoActiveExactMatch: result.verifiedNoActiveExactMatch,
        },
        structuredContent: result,
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
    'style_set_item_product_image',
    {
      title: 'Set Style Item Product Image',
      description:
        'Set one exact user-provided product image URL as the primary product photo for a Style item, then verify the saved item and visual bundle. Use this for closet corrections when the user provides the exact item and image URL; do not search or guess images.',
      inputSchema: {
        image_url: z.string().min(1),
        imported_from: z.string().optional(),
        item_id: z.string(),
        photo_id: z.string().optional(),
        response_mode: writeResponseModeSchema,
        source_url: z.string().optional(),
        ...provenanceInputSchema,
      },
      annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: true, openWorldHint: true },
    },
    async (args) => {
      const authProps = requireAnyScope([FLUENT_STYLE_WRITE_SCOPE, FLUENT_MEALS_WRITE_SCOPE]);
      const before = await style.getItem(args.item_id);
      if (!before) {
        throw new Error(`Unknown style item: ${args.item_id}`);
      }
      const imageUrl = args.image_url.trim();
      const sourceUrl = asNullableString(args.source_url) ?? imageUrl;
      const photoId = asNullableString(args.photo_id) ?? `style-photo:${args.item_id}:product-primary`;
      const importedFrom = asNullableString(args.imported_from) ?? inferImportedFromSource(sourceUrl);
      const photos = await style.upsertItemPhotos({
        itemId: args.item_id,
        photos: [
          {
            id: photoId,
            imported_from: importedFrom,
            is_fit: false,
            is_primary: true,
            kind: 'product',
            source_url: sourceUrl,
            url: imageUrl,
            view: 'product',
          },
        ],
        provenance: buildMutationProvenance(authProps, args),
      });
      const item = await style.getItem(args.item_id);
      const visualBundle = await style.getVisualBundle({
        includeComparators: false,
        itemIds: [args.item_id],
        maxImages: 4,
      });
      const primaryPhoto = photos.find((photo) => photo.isPrimary) ?? photos[0] ?? null;
      const result = {
        item,
        photo: primaryPhoto,
        replacedPhotoCount: before.photos.length,
        visualBundle,
      };
      const summary = {
        hasDelivery: Boolean(primaryPhoto?.delivery),
        imageReturnedInVisualBundle: visualBundle.assets.some((asset) => asset.photoId === primaryPhoto?.id),
        itemId: args.item_id,
        photoCount: item?.photos.length ?? photos.length,
        photoId: primaryPhoto?.id ?? null,
        sourceUrl: primaryPhoto?.sourceUrl ?? null,
        visualBundleAssetCount: visualBundle.assets.length,
      };
      return toolResult(result, {
        textData: args.response_mode === 'full' ? result : summary,
        structuredContent: args.response_mode === 'ack' ? summary : result,
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
    'style_extract_purchase_page_evidence',
    {
      title: 'Extract Style Purchase Page Evidence',
      description:
        'Fetch a public product page URL and extract page title plus direct product image references for Style purchase analysis. This returns image references only; the host must still inspect pixels with vision before calling style_show_purchase_analysis_widget or making color, material, texture, condition, or visual-overlap claims.',
      inputSchema: stylePurchasePageEvidenceInputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ product_url, max_images }) => {
      requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      const evidence = await extractStylePurchasePageEvidence({
        maxImages: max_images,
        productUrl: product_url,
      });
      return toolResult(evidence, {
        textData: {
          candidateImageCount: evidence.visualGrounding.candidateImageCount,
          candidateVisualGrounding: evidence.visualGrounding.candidateVisualGrounding,
          finalUrl: evidence.extraction.finalUrl,
          hostResponseInstruction: evidence.hostResponseInstruction,
          hostResponseMode: evidence.hostResponseMode,
          nextRequiredTool: evidence.nextRequiredTool,
          pageTitle: evidence.extraction.pageTitle,
          renderReady: evidence.renderReady,
          status: evidence.status,
          userFacingNarrationInstruction: evidence.userFacingNarrationInstruction,
          userFacingStatus: evidence.userFacingStatus,
          warningCount: evidence.warnings.length,
        },
        structuredContent: evidence,
      });
    },
  );

  server.registerTool(
    'style_prepare_purchase_analysis',
    {
      title: 'Prepare Style Purchase Analysis',
      description:
        'Required first step for every Style purchase decision, including text-only candidate names, product URLs, direct image URLs, and "should I buy this?" prompts. Normalizes the candidate, returns closet comparator context, and tells the host what product-page or image evidence must be inspected before any final verdict or rich purchase-analysis widget. Do not start purchase analysis with style_get_context or style_analyze_purchase. If only a product URL was provided and no candidate image references exist yet, use style_extract_purchase_page_evidence next. Use before style_render_purchase_analysis for "should I buy this?", "analyze this purchase", and product-link prompts.',
      inputSchema: {
        candidate: z.any(),
        evidence: z.any().optional(),
        renderRepair: z.any().optional(),
        render_repair: z.any().optional(),
        retryInput: z.any().optional(),
        retry_input: z.any().optional(),
        visualEvidence: z.any().optional(),
        visualObservationId: z.string().optional(),
        visual_observation_id: z.string().optional(),
        visual_evidence: z.any().optional(),
        visualObservations: z.any().optional(),
        visual_observations: z.any().optional(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (args) => {
      const authProps = requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      const { candidate } = args;
      const acceptedVisualEvidence =
        acceptedPurchaseVisualEvidenceOrUndefined(extractPurchaseVisualEvidenceArgument(args), {
          allowHostVisionFallback: true,
        }) ?? recallStylePurchaseVisualEvidence({ args, authProps, candidate });
      const analysis = await style.analyzePurchase({
        candidate,
        visualEvidence: acceptedVisualEvidence,
      });
      const preparation = buildStylePurchasePreparation({
        analysis,
        candidateInput: candidate,
      });
      return toolResult(preparation, {
        textData: {
          candidateName: preparation.candidateSummary.name,
          candidateVisualGrounding: preparation.visualGrounding.candidateVisualGrounding,
          comparatorItemIds: preparation.comparatorItemIds,
          hostResponseInstruction: preparation.hostResponseInstruction,
          hostResponseMode: preparation.hostResponseMode,
          hostVisionTaskStatus: preparation.hostVisionTask.status,
          renderReady: preparation.renderReady,
          requiredEvidence: preparation.visualGrounding.requiredEvidence,
          sourceUrl: preparation.sourceUrl,
          userFacingNarrationInstruction: preparation.userFacingNarrationInstruction,
          userFacingStatus: preparation.userFacingStatus,
        },
        structuredContent: preparation,
      });
    },
  );

  server.registerTool(
    'style_get_purchase_vision_packet',
    {
      title: 'Style Get Purchase Vision Packet',
      description:
        'Primary Fluent Style purchase-analysis visual step. Use this instead of style_get_visual_bundle for staged purchase decisions; it returns model-visible inline candidate and closet-comparator images plus compact comparison context. Use after style_prepare_purchase_analysis for image-bearing candidates, inspect the returned image content, then call style_submit_purchase_visual_observations before rendering the widget or giving the final buy/wait/skip recommendation.',
      inputSchema: {
        candidate: z.any(),
        comparator_item_ids: z.array(z.string()).optional(),
        max_inline_images: z.number().int().positive().max(STYLE_VISUAL_BUNDLE_MAX_INLINE_IMAGES).optional(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ candidate, comparator_item_ids, max_inline_images }) => {
      requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      const enrichedCandidate = await enrichStyleVisualBundleCandidateFromProductPage({
        candidate,
        maxImages: 8,
      });
      const analysis = await style.analyzePurchase({ candidate: enrichedCandidate });
      const preparation = buildStylePurchasePreparation({
        analysis,
        candidateInput: enrichedCandidate,
      });
      const bundle =
        preparation.hostVisionTask.status === 'ready_for_host_vision'
          ? await style.getVisualBundle({
              candidate: preparation.candidate,
              deliveryMode: 'authenticated_with_signed_fallback',
              includeComparators: true,
              itemIds: comparator_item_ids ?? preparation.comparatorItemIds,
              maxImages: 8,
            })
          : {
              assets: [],
              comparatorCoverageMode: analysis.comparatorCoverage.mode,
              deliveryMode: 'authenticated_with_signed_fallback' as const,
              evidenceWarnings: ['Candidate image is missing; no inline purchase vision packet was created.'],
              requestedItemIds: comparator_item_ids ?? preparation.comparatorItemIds,
              visualInspection: {
                assetCount: 0,
                fetchableAssetCount: 0,
                note:
                  'A direct candidate product image is required before Fluent can ask the host model for visual observations.',
                state: 'missing_candidate_image' as const,
              },
            };
      return buildStylePurchaseVisionPacketToolResult({
        bundle,
        candidate: preparation.candidate,
        maxInlineImages: max_inline_images,
        preparation,
      });
    },
  );

  server.registerTool(
    'style_submit_purchase_visual_observations',
    {
      title: 'Style Submit Purchase Visual Observations',
      description:
        'Submit concrete host-model observations from style_get_purchase_vision_packet inline image content. In ChatGPT/App SDK hosts, the next required presentation step is style_show_purchase_analysis_widget; do not stop with only a prose answer after this succeeds. Plain MCP or text-first clients may use style_render_purchase_analysis instead.',
      inputSchema: styleSubmitPurchaseVisualObservationsInputSchema.shape,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (args) => {
      const authProps = requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      const parsed = styleSubmitPurchaseVisualObservationsInputSchema.parse(args);
      const visualEvidence = buildStylePurchaseVisualEvidenceFromObservations(parsed);
      const analysis = await style.analyzePurchase({
        candidate: parsed.candidate,
        visualEvidence,
      });
      const preparation = buildStylePurchasePreparation({
        analysis,
        candidateInput: parsed.candidate,
      });
      const receipt = {
        analysisSummary: summarizeStylePurchaseAnalysis(analysis),
        candidate: preparation.candidate,
        candidateSummary: preparation.candidateSummary,
        comparatorItemIds: preparation.comparatorItemIds,
        directComparatorItemIds: preparation.directComparatorItemIds,
        chatgptWidgetTool: 'style_show_purchase_analysis_widget',
        hostResponseMode: 'final_recommendation_ready',
        hostResponseInstruction:
          'Final recommendation is ready. In Claude, OpenClaw, Codex, and generic MCP clients, give the final buy/wait/skip answer now or call style_render_purchase_analysis for structured data; do not open the ChatGPT widget. In ChatGPT/App SDK hosts, style_show_purchase_analysis_widget may be used with this candidate and visual_evidence.',
        nextTool: 'style_render_purchase_analysis',
        nextRequiredTool: null,
        recommendedNextSteps: [
          {
            host: 'claude_or_plain_mcp',
            input: { candidate: preparation.candidate, visual_evidence: visualEvidence },
            reason: 'Return structured purchase-analysis data without opening a ChatGPT/App SDK widget.',
            tool: 'style_render_purchase_analysis',
          },
          {
            host: 'chatgpt_app_sdk',
            input: { candidate: preparation.candidate, visual_evidence: visualEvidence },
            reason: 'Open the rich purchase-analysis widget only in ChatGPT/App SDK hosts.',
            tool: 'style_show_purchase_analysis_widget',
          },
        ],
        renderInput: { candidate: preparation.candidate, visual_evidence: visualEvidence },
        renderReady: true,
        source: visualEvidence.source ?? 'host_vision',
        status: 'visual_observations_accepted',
        visual_evidence: visualEvidence,
        visualGrounding: preparation.visualGrounding,
        visualObservationId: buildStylePurchaseVisualObservationReceiptId({
          observations: parsed.observations,
          visionPacketId: parsed.vision_packet_id ?? null,
        }),
        visionPacketId: parsed.vision_packet_id ?? null,
      };
      rememberStylePurchaseVisualEvidence({
        authProps,
        candidateInputs: [parsed.candidate, preparation.candidate],
        visualEvidence,
      });
      return toolResult(receipt, {
        textData: {
          candidateName: receipt.candidateSummary.name,
          candidateObservationCount: visualEvidence.candidateObservations.length,
          comparatorItemIdsInspected: visualEvidence.comparatorItemIdsInspected,
          hostResponseInstruction: receipt.hostResponseInstruction,
          hostResponseMode: receipt.hostResponseMode,
          chatgptWidgetTool: receipt.chatgptWidgetTool,
          nextTool: receipt.nextTool,
          nextRequiredTool: receipt.nextRequiredTool,
          recommendedNextSteps: receipt.recommendedNextSteps,
          renderInput: { candidate: receipt.candidate, visual_evidence: receipt.visual_evidence },
          renderReady: receipt.renderReady,
          status: receipt.status,
          visualObservationId: receipt.visualObservationId,
          visionPacketId: receipt.visionPacketId,
        },
        structuredContent: receipt,
      });
    },
  );

  server.registerTool(
    'style_analyze_purchase',
    {
      title: 'Analyze Style Purchase',
      description:
        'Return coverage-aware, bucketed closet-derived wardrobe context for a candidate item using canonical Style state and the current lightweight profile. For product URLs or natural "should I buy this?" prompts, call style_prepare_purchase_analysis first so visual evidence requirements are explicit before any widget is rendered. Do not call this after style_prepare_purchase_analysis returns hostResponseMode=request_candidate_image as a way to continue the purchase verdict; ask the user for candidate image evidence instead. Text-first hosts that cannot access style_submit_purchase_visual_observations may pass concrete host_vision visual_evidence or visualEvidence after actually inspecting images.',
      inputSchema: {
        candidate: z.any(),
        evidence: z.any().optional(),
        renderRepair: z.any().optional(),
        render_repair: z.any().optional(),
        retryInput: z.any().optional(),
        retry_input: z.any().optional(),
        visualEvidence: z.any().optional(),
        visualObservationId: z.string().optional(),
        visual_observation_id: z.string().optional(),
        visual_evidence: z.any().optional(),
        visualObservations: z.any().optional(),
        visual_observations: z.any().optional(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (args) => {
      const authProps = requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      const { candidate } = args;
      const acceptedVisualEvidence =
        acceptedPurchaseVisualEvidenceOrUndefined(extractPurchaseVisualEvidenceArgument(args), {
          allowHostVisionFallback: true,
        }) ?? recallStylePurchaseVisualEvidence({ args, authProps, candidate });
      const analysis = await style.analyzePurchase({
        candidate,
        visualEvidence: acceptedVisualEvidence,
      });
      if (analysis.evidenceQuality.candidateVisualGrounding !== 'host_visual_inspection') {
        const preparation = buildStylePurchasePreparation({
          analysis,
          candidateInput: candidate,
        });
        const renderRepair = buildStylePurchaseRenderRepair({ candidate, preparation });
        return toolResult(preparation, {
          textData: {
            candidateName: preparation.candidateSummary.name,
            candidateVisualGrounding: preparation.visualGrounding.candidateVisualGrounding,
            comparatorItemIds: preparation.comparatorItemIds,
            hostResponseInstruction: preparation.hostResponseInstruction,
            hostResponseMode: preparation.hostResponseMode,
            hostVisionTaskStatus: preparation.hostVisionTask.status,
            renderReady: false,
            requiredEvidence: preparation.visualGrounding.requiredEvidence,
            renderRepair,
            sourceUrl: preparation.sourceUrl,
            status: 'not_render_ready',
          },
          structuredContent: {
            ...preparation,
            experience: 'purchase_analysis_preparation',
            renderRepair,
            status: 'not_render_ready',
          },
        });
      }
      const full = presentStylePurchaseAnalysis(analysis);
      return toolResult(analysis, {
        textData: summarizeStylePurchaseAnalysis(analysis),
        structuredContent: full,
      });
    },
  );

  server.registerTool(
    'style_render_purchase_analysis',
    {
      title: 'Render Purchase Analysis Data',
      description:
        'Return structured Fluent Style purchase-analysis presentation data without opening a widget. For product URLs or "should I buy this?" prompts, call style_prepare_purchase_analysis first so visual evidence requirements are explicit. ChatGPT / MCP Apps-style hosts should only open the rich widget through style_show_purchase_analysis_widget after real host visual evidence exists. Claude and other text-first hosts may use this after actually inspecting images and passing concrete host_vision visual_evidence or visualEvidence when style_submit_purchase_visual_observations is unavailable. This render tool accepts the text-first host_vision fallback directly; it does not require style_submit_purchase_visual_observations when candidateInspected is true and candidateObservations contains concrete pixel observations.',
      inputSchema: {
        candidate: z.any(),
        evidence: z.any().optional(),
        renderRepair: z.any().optional(),
        render_repair: z.any().optional(),
        retryInput: z.any().optional(),
        retry_input: z.any().optional(),
        visualEvidence: z.any().optional(),
        visualObservationId: z.string().optional(),
        visual_observation_id: z.string().optional(),
        visual_evidence: z.any().optional(),
        visualObservations: z.any().optional(),
        visual_observations: z.any().optional(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (args) => {
      const authProps = requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      const { candidate } = args;
      const acceptedVisualEvidence =
        acceptedPurchaseVisualEvidenceOrUndefined(extractPurchaseVisualEvidenceArgument(args), {
          allowHostVisionFallback: true,
        }) ?? recallStylePurchaseVisualEvidence({ args, authProps, candidate });
      const analysis = await style.analyzePurchase({
        candidate,
        visualEvidence: acceptedVisualEvidence,
      });
      if (analysis.evidenceQuality.candidateVisualGrounding !== 'host_visual_inspection') {
        const preparation = buildStylePurchasePreparation({
          analysis,
          candidateInput: candidate,
        });
        const renderRepair = buildStylePurchaseRenderRepair({ candidate, preparation });
        return toolResult(preparation, {
          textData: {
            candidateName: preparation.candidateSummary.name,
            candidateVisualGrounding: preparation.visualGrounding.candidateVisualGrounding,
            comparatorItemIds: preparation.comparatorItemIds,
            hostResponseInstruction: preparation.hostResponseInstruction,
            hostResponseMode: preparation.hostResponseMode,
            hostVisionTaskStatus: preparation.hostVisionTask.status,
            renderReady: false,
            requiredEvidence: preparation.visualGrounding.requiredEvidence,
            renderRepair,
            sourceUrl: preparation.sourceUrl,
            status: 'not_render_ready',
          },
          structuredContent: {
            ...preparation,
            experience: 'purchase_analysis_preparation',
            renderRepair,
            status: 'not_render_ready',
          },
        });
      }
      const imageHints = await buildPurchaseAnalysisImageHints(style, analysis, candidate);
      const viewModel = buildPurchaseAnalysisViewModel(analysis, {
        actionToolName: 'style_apply_purchase_analysis_action',
        imageHints,
      });
      return toolResult(buildPurchaseAnalysisStructuredContent(viewModel), {
        meta: buildPurchaseAnalysisMetadata(viewModel),
        textData: `Prepared purchase analysis data for ${viewModel.item.name}.`,
      });
    },
  );

  server.registerTool(
    'style_show_purchase_analysis_widget',
    {
      title: 'Show Purchase Analysis Widget',
      description:
        'Open the rich Fluent Style purchase-analysis widget in ChatGPT / MCP Apps-style hosts only after style_prepare_purchase_analysis has run and the host has actually inspected candidate images. Do not call this with only a product URL, text metadata, image references, or uninspected visual-bundle assets. Requires visual_evidence with candidateInspected true and concrete candidateObservations.',
      inputSchema: {
        candidate: z.any(),
        visual_evidence: stylePurchaseVisualEvidenceInputSchema,
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
      _meta: {
        ui: {
          resourceUri: STYLE_PURCHASE_ANALYSIS_TEMPLATE_URI,
        },
        'openai/outputTemplate': STYLE_PURCHASE_ANALYSIS_TEMPLATE_URI,
        'openai/toolInvocation/invoked': 'Purchase analysis ready.',
        'openai/toolInvocation/invoking': 'Opening purchase analysis…',
      },
    },
    async ({ candidate, visual_evidence }) => {
      requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      if (!hasAcceptedPurchaseVisualEvidence(visual_evidence)) {
        throw new Error(
          'style_show_purchase_analysis_widget not_render_ready: concrete candidate image observations are required. Call style_prepare_purchase_analysis or style_render_purchase_analysis for non-widget not-ready output.',
        );
      }
      const analysis = await style.analyzePurchase({
        candidate,
        visualEvidence: visual_evidence,
      });
      if (analysis.evidenceQuality.candidateVisualGrounding === 'none') {
        throw new Error(
          'style_show_purchase_analysis_widget not_render_ready: visual evidence did not produce host visual grounding. Call style_prepare_purchase_analysis or style_render_purchase_analysis for non-widget not-ready output.',
        );
      }
      const imageHints = await buildPurchaseAnalysisImageHints(style, analysis, candidate);
      const viewModel = buildPurchaseAnalysisViewModel(analysis, {
        actionToolName: 'style_apply_purchase_analysis_action',
        imageHints,
      });
      return {
        _meta: buildPurchaseAnalysisMetadata(viewModel),
        content: [
          {
            type: 'text' as const,
            text: `Showing the purchase analysis for ${viewModel.item.name}.`,
          },
        ],
        structuredContent: buildPurchaseAnalysisStructuredContent(viewModel),
      };
    },
  );

  server.registerTool(
    'style_apply_purchase_analysis_action',
    {
      title: 'Apply Purchase Analysis Action',
      description:
        'Apply a widget-originated Style purchase analysis action, such as logging a purchased item into the Fluent closet.',
      inputSchema: {
        action_id: stylePurchaseAnalysisActionIdSchema,
        candidate: z.any(),
        ...provenanceInputSchema,
      },
      annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
      _meta: {
        'openai/widgetAccessible': true,
      },
    },
    async (args) => {
      const authProps = requireAnyScope([FLUENT_STYLE_WRITE_SCOPE, FLUENT_MEALS_WRITE_SCOPE]);
      const candidate = normalizeStylePurchaseCandidate(args.candidate);

      if (args.action_id !== 'log_purchase') {
        throw new Error(`Unsupported purchase analysis action: ${args.action_id}`);
      }

      const itemId = `style-item:purchase:${crypto.randomUUID()}`;
      const item = await style.upsertItem({
        item: {
          id: itemId,
          brand: candidate.brand,
          category: candidate.category,
          color_family: candidate.colorFamily,
          formality: candidate.formality,
          name: candidate.name ?? candidate.subcategory ?? candidate.category,
          status: 'active',
          subcategory: candidate.subcategory,
        },
        provenance: buildMutationProvenance(authProps, args),
        sourceSnapshot: candidate,
      });

      if (candidate.imageUrls[0]) {
        try {
          await style.upsertItemPhotos({
            itemId,
            photos: [
              {
                id: `style-photo:${itemId}:1`,
                is_primary: true,
                source_url: candidate.imageUrls[0],
                view: 'front',
              },
            ],
            provenance: buildMutationProvenance(authProps, args),
          });
        } catch {
          // Best-effort only: a purchase log should still succeed even if the
          // remote product image cannot be fetched into Fluent storage yet.
        }
      }

      const created = await style.getItem(itemId);
      const ack = buildStyleMutationAck('style_item', itemId, 'style.purchase_logged', new Date().toISOString(), {
        category: created?.category ?? item.category,
        name: created?.name ?? item.name,
        photoCount: created?.photos.length ?? item.photos.length,
      });
      return toolResult(created ?? item, {
        structuredContent: ack,
        textData: ack,
      });
    },
  );

  server.registerTool(
    'style_get_visual_bundle',
    {
      title: 'Get Style Visual Bundle',
      description:
        'Return a curated visual packet for broad stylist tasks outside the canonical staged purchase flow, including authenticated image routes, optional short-lived signed fallbacks, opt-in inline MCP image content, and compact closet comparator context. For purchase decisions, prefer style_get_purchase_vision_packet followed by style_submit_purchase_visual_observations.',
      inputSchema: {
        candidate: z.any().optional(),
        delivery_mode: styleVisualBundleDeliveryModeSchema,
        include_inline_images: z.boolean().optional(),
        include_comparators: z.boolean().optional(),
        item_ids: z.array(z.string()).optional(),
        max_inline_images: z.number().int().positive().max(STYLE_VISUAL_BUNDLE_MAX_INLINE_IMAGES).optional(),
        max_images: z.number().int().positive().max(12).optional(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ candidate, delivery_mode, include_inline_images, include_comparators, item_ids, max_images, max_inline_images }) => {
      requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      const enrichedCandidate = include_inline_images
        ? await enrichStyleVisualBundleCandidateFromProductPage({
            candidate,
            maxImages: max_images,
          })
        : candidate;
      const bundle = await style.getVisualBundle({
        candidate: enrichedCandidate,
        deliveryMode: delivery_mode,
        includeComparators: include_comparators,
        itemIds: item_ids,
        maxImages: max_images,
      });
      return buildStyleVisualBundleToolResult({
        bundle,
        includeInlineImages: include_inline_images,
        maxInlineImages: max_inline_images,
      });
    },
  );
}
