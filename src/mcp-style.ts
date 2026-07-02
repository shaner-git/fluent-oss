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
import { buildSignedStyleRemoteImageUrl } from './domains/style/media';
import {
  getStyleSetupCalibrationWidgetHtml,
  STYLE_SETUP_CALIBRATION_TEMPLATE_URI,
} from './domains/style/onboarding-calibration';
import {
  buildStyleClosetStructuredContent,
  buildStyleClosetWidgetMeta,
  getStyleClosetWidgetHtml,
  STYLE_CLOSET_PREVIOUS_TEMPLATE_URI,
  STYLE_CLOSET_TEMPLATE_URI,
  STYLE_CLOSET_V2_TEMPLATE_URI,
  STYLE_CLOSET_V3_TEMPLATE_URI,
  STYLE_CLOSET_V4_TEMPLATE_URI,
  STYLE_CLOSET_V5_TEMPLATE_URI,
  STYLE_CLOSET_V6_TEMPLATE_URI,
  type StyleClosetFilter,
} from './domains/style/closet-manager';
import type {
  StylePurchaseStylistJudgment,
  StyleVisualBundleAssetRecord,
  StyleVisualBundleRecord,
} from './domains/style/types';
import {
  buildPurchaseAnalysisMetadata,
  buildPurchaseAnalysisStructuredContent,
  buildPurchaseAnalysisViewModel,
  getPurchaseAnalysisWidgetHtml,
  type PurchaseAnalysisImageHints,
  STYLE_PURCHASE_ANALYSIS_BRIDGE_PREVIOUS_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_ACTIONS_PREVIOUS_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_CACHED_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_COMPARISON_PREVIOUS_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_COMBINED_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_DECISION_PREVIOUS_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_EDITORIAL_PREVIOUS_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_FRAMED_PREVIOUS_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_HUMAN_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_HYDRATION_PREVIOUS_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_IMAGE_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_JUDGMENT_PREVIOUS_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_LEGACY_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_NATIVE_PREVIOUS_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_MCP_APPS_PREVIOUS_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_PHOTO_READ_PREVIOUS_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_PREVIOUS_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_SECONDARY_ACTION_PREVIOUS_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_TITLE_PREVIOUS_TEMPLATE_URI,
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
const styleClosetFilterSchema = z.object({
  brand: z.string().optional(),
  category: z.string().optional(),
  color: z.string().optional(),
  favorite_only: z.boolean().optional(),
  item_ids: z.array(z.string()).optional(),
  query: z.string().optional(),
  size: z.string().optional(),
  status: z.enum(['active', 'archived', 'any']).optional(),
  subcategory: z.string().optional(),
}).optional();
const styleCalibrationSignalKindSchema = z.enum([
  'aesthetic',
  'budget',
  'color',
  'fit',
  'formality',
  'hard_avoid',
  'occasion',
  'silhouette',
]);
const styleCalibrationSignalStatusSchema = z.enum(['inferred', 'confirmed', 'rejected', 'corrected']);
const styleInferenceSourceSchema = z.enum([
  'user_confirmed',
  'closet_inferred',
  'item_metadata',
  'host_visual_inspection',
  'fallback',
]);
const styleItemWearStatusSchema = z.enum(['actively_worn', 'stale', 'accidental', 'unknown']);
const STYLE_PURCHASE_VISUAL_EVIDENCE_SOURCE = 'style_submit_purchase_visual_observations';
const STYLE_PURCHASE_VISUAL_EVIDENCE_CACHE_TTL_MS = 15 * 60 * 1000;
const STYLE_PURCHASE_HOST_VISION_SOURCES = new Set([
  'assistant_image_inspection',
  'host_vision',
  'host_vision_uploaded_image',
  'host_uploaded_image',
  'uploaded_image',
]);
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
  candidateInspected: z.literal(true).describe('Must be true only after the host has inspected the actual candidate image pixels.'),
  candidateObservations: z
    .array(styleConcreteVisualObservationSchema)
    .min(1)
    .describe('Concrete visual observations from the inspected candidate image; do not include guesses from text metadata only.'),
  comparatorItemIdsInspected: z
    .array(z.string())
    .optional()
    .describe('Optional comparator item IDs or handles from style_prepare_purchase_analysis that were also visually inspected.'),
  source: z.string().nullable().optional().describe('Evidence source label such as style_submit_purchase_visual_observations or host_vision_uploaded_image; omit or null for host-vision evidence.'),
  visionPacketId: z.string().nullable().optional().describe('Vision packet ID returned by style_get_purchase_vision_packet, or null for uploaded-image evidence.'),
  visualObservationId: z.string().nullable().optional().describe('Receipt ID returned by style_submit_purchase_visual_observations when reusing accepted visual evidence; omit or null for host-vision evidence (that legacy tool is not in the public profile).'),
}).describe('Host-inspected visual evidence required before rendering or logging a Style purchase decision.');
const styleJsonLeafSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const styleToolMetadataInputSchema = z
  .record(z.string(), z.union([styleJsonLeafSchema, z.array(styleJsonLeafSchema)]))
  .optional()
  .describe('Optional compact machine-readable source metadata returned by Fluent tools; omit for normal user-entered updates.');
const styleWeightedPreferenceInputSchema = z.object({
  note: z.string().nullable().optional().describe('Optional short user-confirmed note for this preference.'),
  value: z.string().describe('Preference value, such as black, relaxed fit, or clean minimal sneakers.'),
  weight: z.enum(['low', 'medium', 'high']).optional().describe('How strongly the user confirmed this preference.'),
}).describe('One weighted Style preference confirmed by the user.');
const styleBrandAffinityInputSchema = z.object({
  brand: z.string().describe('Brand name.'),
  note: z.string().nullable().optional().describe('Optional short reason or caveat for the brand stance.'),
  stance: z.enum(['prefer', 'avoid', 'conditional']).describe('User-confirmed brand stance.'),
}).describe('One Style brand preference or avoidance rule.');
const styleBudgetProfileInputSchema = z.object({
  everydayTier: z.string().nullable().optional().describe('Normal comfortable spend tier for everyday items.'),
  investmentTier: z.string().nullable().optional().describe('Higher spend tier for investment pieces.'),
  splurgeCategories: z.array(z.string()).optional().describe('Categories where the user is willing to spend more.'),
}).describe('Budget constraints confirmed during Style setup or purchase calibration.');
const styleFitProfileInputSchema = z.object({
  bodyNotes: z.array(z.string()).optional().describe('User-confirmed fit or body-context notes.'),
  legShapePreference: z.string().nullable().optional().describe('Preferred pant or leg shape, when confirmed.'),
  risePreference: z.string().nullable().optional().describe('Preferred pant rise, when confirmed.'),
  sleevePreference: z.string().nullable().optional().describe('Preferred sleeve fit or length, when confirmed.'),
  topLengthPreference: z.string().nullable().optional().describe('Preferred top length, when confirmed.'),
}).describe('User-confirmed Style fit preferences.');
const styleProfilePatchInputSchema = z.object({
  aestheticKeywords: z.array(z.string()).optional().describe('User-confirmed aesthetic words to add to the Style profile.'),
  brandAffinities: z.array(styleBrandAffinityInputSchema).optional().describe('User-confirmed brand preferences or avoids.'),
  budgetProfile: styleBudgetProfileInputSchema.nullable().optional().describe('Budget profile patch confirmed by the user.'),
  closetCoverage: z.enum(['current', 'partial']).nullable().optional().describe('Whether the closet evidence is current or partial.'),
  colorDirections: z.array(z.string()).optional().describe('Legacy simple color direction labels confirmed by the user.'),
  colorPreferences: z.array(styleWeightedPreferenceInputSchema).optional().describe('Weighted color preferences confirmed by the user.'),
  contextRules: z.array(z.string()).optional().describe('Context rules such as work, weekend, travel, or climate constraints.'),
  fitNotes: z.array(z.string()).optional().describe('Simple user-confirmed fit notes.'),
  fitProfile: styleFitProfileInputSchema.nullable().optional().describe('Structured fit profile patch confirmed by the user.'),
  formalityTendency: z.string().nullable().optional().describe('Overall formality direction, such as casual, smart casual, or polished.'),
  hardAvoids: z.array(z.string()).optional().describe('Only explicit hard avoids the user confirmed.'),
  importedClosetConfirmed: z.boolean().optional().describe('Whether the user confirmed an imported closet is representative.'),
  onboardingPath: z.enum(['seeded', 'fresh']).nullable().optional().describe('Style onboarding path when explicitly known.'),
  preferredSilhouettes: z.array(z.string()).optional().describe('Legacy simple silhouette labels confirmed by the user.'),
  practicalCalibrationConfirmed: z.boolean().optional().describe('Whether practical constraints such as budget, fit, or occasions are confirmed.'),
  silhouettePreferences: z.array(styleWeightedPreferenceInputSchema).optional().describe('Weighted silhouette preferences confirmed by the user.'),
  sizingPreferences: z.array(z.string()).optional().describe('User-confirmed sizing or alteration notes.'),
  tasteCalibrationConfirmed: z.boolean().optional().describe('Whether taste signals such as color, aesthetic, or silhouette are confirmed.'),
}).strict().describe('Sparse Style profile patch. Include only fields the user explicitly confirmed or corrected in the current setup/calibration turn.');
const stylePurchaseStylistJudgmentSchema = z.object({
  caveats: z.array(z.string().trim().min(1)).optional(),
  decisionBasis: z.enum(['gap', 'upgrade', 'replacement', 'duplicate', 'taste_fit', 'unclear']).nullable().optional(),
  decision_basis: z.enum(['gap', 'upgrade', 'replacement', 'duplicate', 'taste_fit', 'unclear']).nullable().optional(),
  headline: z.string().trim().min(1).nullable().optional(),
  pairingOpportunities: z.array(z.string().trim().min(1)).optional(),
  pairing_opportunities: z.array(z.string().trim().min(1)).optional(),
  rationale: z.string().trim().min(1).nullable().optional(),
  referencedComparatorIds: z.array(z.string().trim().min(1)).optional(),
  referenced_comparator_ids: z.array(z.string().trim().min(1)).optional(),
  verdict: z.enum(['buy', 'skip', 'consider', 'wait']),
  wardrobeImpact: z
    .enum(['positive_addition', 'deepens_existing', 'replaces_item', 'redundant', 'expands_range'])
    .nullable()
    .optional(),
  wardrobe_impact: z
    .enum(['positive_addition', 'deepens_existing', 'replaces_item', 'redundant', 'expands_range'])
    .nullable()
    .optional(),
  whatItAdds: z.string().trim().min(1).nullable().optional(),
  what_it_adds: z.string().trim().min(1).nullable().optional(),
  whereItOverlaps: z.string().trim().min(1).nullable().optional(),
  where_it_overlaps: z.string().trim().min(1).nullable().optional(),
});

function normalizeStylePurchaseStylistJudgment(value: unknown): StylePurchaseStylistJudgment | null {
  if (value == null) return null;
  const parsed = stylePurchaseStylistJudgmentSchema.parse(value);
  return {
    caveats: parsed.caveats ?? [],
    decisionBasis: parsed.decisionBasis ?? parsed.decision_basis ?? null,
    headline: parsed.headline ?? null,
    pairingOpportunities: parsed.pairingOpportunities ?? parsed.pairing_opportunities ?? [],
    rationale: parsed.rationale ?? null,
    referencedComparatorIds: parsed.referencedComparatorIds ?? parsed.referenced_comparator_ids ?? [],
    verdict: parsed.verdict,
    wardrobeImpact: parsed.wardrobeImpact ?? parsed.wardrobe_impact ?? null,
    whatItAdds: parsed.whatItAdds ?? parsed.what_it_adds ?? null,
    whereItOverlaps: parsed.whereItOverlaps ?? parsed.where_it_overlaps ?? null,
  };
}

function extractStylePurchaseStylistJudgmentArgument(record: Record<string, unknown>): StylePurchaseStylistJudgment | null {
  return normalizeStylePurchaseStylistJudgment(record.stylist_judgment ?? record.stylistJudgment ?? null);
}

function buildStylePurchaseRenderInput(input: {
  candidate: unknown;
  stylistJudgment?: StylePurchaseStylistJudgment | null;
  visualEvidence: unknown;
}) {
  return {
    candidate: input.candidate,
    visual_evidence: input.visualEvidence,
    ...(input.stylistJudgment ? { stylist_judgment: input.stylistJudgment } : {}),
  };
}

type AppsOAuth2SecurityScheme = {
  scopes: string[];
  type: 'oauth2';
};

function withAppsSecurity<T extends { _meta?: Record<string, unknown> }>(
  config: T,
  securitySchemes: AppsOAuth2SecurityScheme[],
  options?: { uiVisibility?: string[] },
): T {
  const meta: Record<string, unknown> = {
    ...(config._meta ?? {}),
    securitySchemes,
  };
  if (options?.uiVisibility) {
    const currentUi = meta.ui && typeof meta.ui === 'object' && !Array.isArray(meta.ui)
      ? (meta.ui as Record<string, unknown>)
      : {};
    meta.ui = {
      ...currentUi,
      visibility: options.uiVisibility,
    };
  }
  return {
    ...config,
    securitySchemes,
    _meta: meta,
  } as T;
}
const stylePurchaseVisualObservationRoleSchema = z.enum([
  'candidate',
  'direct_comparator',
  'adjacent_reference',
  'requested_item',
  'exact_comparator',
  'typed_role',
  'rejected_comparator',
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
function omitNullCandidateFields(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, candidateValue]) => candidateValue !== null),
  );
}
const stylePurchaseCandidateObjectInputSchema = z.preprocess(
  omitNullCandidateFields,
  z.object({
    avoidUseCases: z.array(z.string()).optional(),
    brand: z.string().optional(),
    brand_name: z.string().optional(),
    category: z.string().optional(),
    colorFamily: z.string().optional(),
    colorName: z.string().optional(),
    color_family: z.string().optional(),
    color_name: z.string().optional(),
    colorway: z.string().optional(),
    comparatorKey: z.string().optional(),
    comparator_key: z.string().optional(),
    descriptorConfidence: z.number().optional(),
    estimatedPrice: z
      .object({
        max: z.number().nullable().optional(),
        min: z.number().nullable().optional(),
      })
      .optional(),
    fabricHand: z.string().optional(),
    fitObservations: z.array(z.string()).optional(),
    fitType: z.string().optional(),
    formality: z.number().optional(),
    imageUrl: z.string().url().optional(),
    imageUrls: z.array(z.string().url()).optional(),
    image_url: z.string().url().optional(),
    images: z.array(z.string().url()).optional(),
    itemType: z.string().optional(),
    name: z.string().optional(),
    notes: z.string().optional(),
    pageUrl: z.string().url().optional(),
    page_url: z.string().url().optional(),
    polishLevel: z.string().optional(),
    productUrl: z.string().url().optional(),
    product_url: z.string().url().optional(),
    qualityTier: z.string().optional(),
    seasonality: z.array(z.string()).optional(),
    silhouette: z.string().optional(),
    sourceUrl: z.string().url().optional(),
    source_url: z.string().url().optional(),
    structureLevel: z.string().optional(),
    styleRole: z.string().optional(),
    sub_category: z.string().optional(),
    sub_type: z.string().optional(),
    subcategory: z.string().optional(),
    subtype: z.string().optional(),
    tags: z.array(z.string()).optional(),
    texture: z.string().optional(),
    url: z.string().url().optional(),
    useCases: z.array(z.string()).optional(),
    visualWeight: z.string().optional(),
  }).strict().describe('Object form for a purchase candidate. All fields are optional; provide only known product details such as name, brand, category, sourceUrl, and direct image URLs.'),
).describe('Structured Style purchase candidate supplied by the user, product page extraction, or an uploaded/direct image flow.');
const stylePurchaseCandidateInputSchema = z.union([
  z.string().trim().min(1).describe('Plain-text candidate name or product description when no structured product object is available.'),
  stylePurchaseCandidateObjectInputSchema,
]).describe('Style purchase candidate. Use a short string for simple prompts or an object for known product details and image/source URLs.');
const styleStarterClosetItemProfileInputSchema = z.object({
  bestOccasions: z.array(z.string()).optional().describe('Best occasions or settings for this starter item.'),
  fitObservations: z.array(z.string()).optional().describe('User-supplied fit details such as relaxed, cropped, knee length, or structured shoulders.'),
  polishLevel: z.string().nullable().optional().describe('Polish level such as casual, polished, rugged, or dressy.'),
  silhouette: z.string().nullable().optional().describe('Silhouette words supplied by the user.'),
  structureLevel: z.string().nullable().optional().describe('Structure level such as soft, tailored, structured, or slouchy.'),
  tags: z.array(z.string()).optional().describe('Short descriptive tags from the user-supplied item evidence.'),
  useCases: z.array(z.string()).optional().describe('Use cases such as work, dinner, weekend, travel, or gym.'),
}).strict().describe('Optional item-profile details for a user-supplied starter closet item.');
const styleStarterClosetItemInputSchema = z.object({
  brand: z.string().nullable().optional().describe('Optional brand name if the user supplied it.'),
  category: z.string().nullable().optional().describe('Broad item category such as top, bottom, shoe, outerwear, or accessory.'),
  colorFamily: z.string().nullable().optional().describe('Optional broad color family, camelCase form.'),
  color_family: z.string().nullable().optional().describe('Optional broad color family, snake_case form.'),
  description: z.string().nullable().optional().describe('User-provided item description; preserve concrete details.'),
  formality: z.number().nullable().optional().describe('Optional formality estimate on Fluent internal scale when known.'),
  id: z.string().nullable().optional().describe('Optional stable item ID when the item already has one; omit for new starter evidence.'),
  itemProfile: styleStarterClosetItemProfileInputSchema.optional().describe('Optional camelCase item profile details.'),
  item_profile: styleStarterClosetItemProfileInputSchema.optional().describe('Optional snake_case item profile details.'),
  name: z.string().nullable().optional().describe('Item name or short label, such as navy overshirt or black leather loafer.'),
  notes: z.string().nullable().optional().describe('Short user-provided notes about why this item belongs in the starter closet.'),
  occasions: z.array(z.string()).optional().describe('Occasions the user associates with this starter item.'),
  photoUrl: z.string().url().nullable().optional().describe('Optional direct photo URL, camelCase form.'),
  photo_url: z.string().url().nullable().optional().describe('Optional direct photo URL, snake_case form.'),
  profile: styleStarterClosetItemProfileInputSchema.optional().describe('Optional profile details for this starter item.'),
  status: z.enum(['active', 'archived', 'retired']).optional().describe('Closet status; starter additions should normally be active.'),
  subcategory: z.string().nullable().optional().describe('Specific item type such as loafer, overshirt, jean, or tee.'),
  tags: z.array(z.string()).optional().describe('Short descriptive tags from the user-provided evidence.'),
  useCases: z.array(z.string()).optional().describe('Use cases such as work, dinner, weekend, travel, or gym.'),
  use_cases: z.array(z.string()).optional().describe('Use cases in snake_case form.'),
}).strict().describe('One user-supplied starter closet item. Use only details the user provided; do not invent closet contents.');
const stylePurchaseRetryInputSchema = z.object({
  candidate: stylePurchaseCandidateInputSchema.optional().describe('Optional repeated candidate from the prior purchase-analysis step.'),
  visualEvidence: stylePurchaseVisualEvidenceInputSchema.optional().describe('Accepted visual evidence in camelCase form.'),
  visual_evidence: stylePurchaseVisualEvidenceInputSchema.optional().describe('Accepted visual evidence in snake_case form.'),
  visualObservations: z.array(styleConcreteVisualObservationSchema).optional().describe('Concrete candidate observations in camelCase shorthand.'),
  visual_observations: z.array(styleConcreteVisualObservationSchema).optional().describe('Concrete candidate observations in snake_case shorthand.'),
  visualObservationId: z.string().optional().describe('Optional visual-observation receipt ID in camelCase form.'),
  visual_observation_id: z.string().optional().describe('Optional visual-observation receipt ID in snake_case form.'),
}).strict().describe('Retry input from a prior not-render-ready purchase response; include only concrete visual evidence fields.');
const stylePurchaseRenderRepairInputSchema = z.object({
  reason: z.string().optional().describe('Short reason the prior render attempt needed repair.'),
  retryInput: stylePurchaseRetryInputSchema.optional().describe('CamelCase retry payload for a repaired purchase-analysis render attempt.'),
  retry_input: stylePurchaseRetryInputSchema.optional().describe('Snake_case retry payload for a repaired purchase-analysis render attempt.'),
}).strict().describe('Repair payload returned by a prior purchase-analysis response when the host is adding missing visual evidence.');
const styleSubmitPurchaseVisualObservationsInputSchema = z.object({
  candidate: stylePurchaseCandidateInputSchema,
  comparator_item_ids_inspected: z.array(z.string()).optional(),
  observations: z.array(stylePurchaseVisualObservationDetailSchema).min(1),
  source: z.string().optional(),
  stylistJudgment: stylePurchaseStylistJudgmentSchema.optional(),
  stylist_judgment: stylePurchaseStylistJudgmentSchema.optional(),
  vision_packet_id: z.string().optional(),
});
const stylePurchasePageEvidenceInputSchema = {
  max_images: z.number().min(1).max(12).optional(),
  product_url: z.string().min(1),
};

export type StylePurchasePageImageEvidence = {
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

export const STYLE_VISUAL_BUNDLE_MAX_INLINE_IMAGES = 4;
const STYLE_VISUAL_BUNDLE_MAX_INLINE_IMAGE_BYTES = 1_500_000;
const STYLE_PURCHASE_STATE_AUTHORITY_RULE =
  'Do not let host memory, prior chat context, or an earlier unsaved recommendation determine the buy/wait/skip call unless the user confirms it in the current turn or Fluent state/tool evidence supports it. Mention outside context only as outside Fluent state.';

function buildStylePurchaseCalibrationContext(analysis: Awaited<ReturnType<StyleService['analyzePurchase']>>) {
  const readiness = analysis.calibration.purchaseAnalysisReadiness;
  const callablePrompts = analysis.calibration.calibrationPrompts.filter((entry) => entry.toolName);
  const prompt =
    readiness.readinessLevel === 'not_ready'
      ? analysis.calibration.calibrationPrompts.find((entry) => entry.toolName === 'style_add_starter_closet_item') ??
        callablePrompts.find((entry) => entry.kind === 'import_review') ??
        callablePrompts[0] ??
        null
      : analysis.calibration.calibrationPrompts.find((entry) => entry.toolName === 'style_record_calibration_response') ??
        callablePrompts[0] ??
        null;
  return {
    activeItemCount: analysis.calibration.activeItemCount,
    confidenceBreakdown: analysis.calibration.confidenceBreakdown,
    confirmedSignalCount: analysis.calibration.confirmedStyleSignals.length,
    inferredSignalCount: analysis.calibration.inferredStyleSignals.length,
    hostMemoryRule: STYLE_PURCHASE_STATE_AUTHORITY_RULE,
    languageRule:
      readiness.basis === 'closet_inferred' || readiness.basis === 'imported_unconfirmed'
        ? 'Say "your closet suggests" for inferred signals. Do not say "you prefer" unless citing confirmed taste.'
        : readiness.basis === 'no_closet' || readiness.basis === 'thin_closet'
          ? 'Do not make wardrobe-fit claims beyond the available starter evidence.'
          : readiness.readinessLevel === 'provisional'
            ? 'Use cautious wording and do not present ownership as confirmed taste.'
            : 'Cite confirmed signals for strong taste claims.',
    opportunisticCalibrationPrompt: prompt,
    readinessBasis: readiness.basis,
    readinessLabel: readiness.label,
    readinessLevel: readiness.readinessLevel,
    readinessNotes: readiness.notes,
    readinessReady: readiness.ready,
  };
}

function buildStylePurchaseFinalHostInstruction(input: {
  calibrationContext: ReturnType<typeof buildStylePurchaseCalibrationContext>;
  mode: 'render_ready' | 'widget_rendered';
  verdict?: string | null;
}): string {
  const notReadyPrefix = input.calibrationContext.readinessLevel === 'not_ready'
    ? 'This is a candidate-focused answer only: avoid wardrobe-fit claims until Style has stronger closet evidence. '
    : '';
  const stateAuthorityRule = `${input.calibrationContext.hostMemoryRule} `;
  if (input.mode === 'widget_rendered') {
    return `${notReadyPrefix}${stateAuthorityRule}The native Fluent Style card is mounted with verdict "${input.verdict ?? 'unknown'}". If you add prose after the card, it must match that verdict and the same stylist_judgment used for the card; do not introduce a second conflicting buy/skip/wait recommendation. Keep user-facing prose stylist-like and avoid the banned phrases "lane", "nearby lane", "same role", "Yes if", and "No if".`;
  }
  return `${notReadyPrefix}${stateAuthorityRule}Native purchase-analysis card data is ready. In MCP Apps-style hosts, especially Claude.ai MCP Apps-capable runs, call style_show_purchase_analysis_widget next with renderInput if a native card is not already mounted. Do not treat style_render_purchase_analysis as the final visual step in those hosts. In visualizer-only or plain text hosts, answer from this structured result.`;
}

function buildWidgetMeta(description: string, origin: string) {
  const resourceDomains = [origin];
  return {
    'openai/widgetCSP': {
      connect_domains: [],
      resource_domains: resourceDomains,
    },
    'openai/widgetDescription': description,
    'openai/widgetDomain': origin,
    'openai/widgetPrefersBorder': true,
    // MCP Apps `ui.domain` is host-provisioned (Claude rejects a server-supplied origin).
    ui: {
      csp: {
        connectDomains: [],
        resourceDomains,
      },
      prefersBorder: true,
    },
  } as const;
}

function buildStylePurchasePreparation(input: {
  allowPurchasePageExtraction?: boolean;
  analysis: Awaited<ReturnType<StyleService['analyzePurchase']>>;
  candidateInput: unknown;
}) {
  const { analysis, candidateInput } = input;
  const allowPurchasePageExtraction = input.allowPurchasePageExtraction ?? true;
  const candidate = analysis.candidate;
  const sourceUrl = extractPurchaseCandidateSourceUrl(candidateInput);
  const visuallyGrounded = analysis.evidenceQuality.candidateVisualGrounding === 'host_visual_inspection';
  const calibrationContext = buildStylePurchaseCalibrationContext(analysis);
  const rankedComparatorItemIds = analysis.comparatorReasoning.topComparisons.map((entry) => entry.itemId);
  const fallbackComparatorItemIds = [
    ...analysis.contextBuckets.exactComparatorItems.map((entry) => entry.itemId),
    ...analysis.contextBuckets.typedRoleItems.map((entry) => entry.itemId),
    ...analysis.contextBuckets.sameCategoryItems.map((entry) => entry.itemId),
  ];
  const comparatorItemIds = Array.from(
    new Set(rankedComparatorItemIds.length > 0 ? rankedComparatorItemIds : fallbackComparatorItemIds),
  ).slice(0, 6);
  const taxonomyDirectComparatorIds = new Set([
    ...analysis.contextBuckets.exactComparatorItems.map((entry) => entry.itemId),
    ...analysis.contextBuckets.typedRoleItems.map((entry) => entry.itemId),
  ]);
  const directComparatorItemIds = Array.from(
    new Set(
      analysis.comparatorReasoning.topComparisons
        .filter((entry) => isDirectPurchaseComparisonRelation(entry.relation) || taxonomyDirectComparatorIds.has(entry.itemId))
        .map((entry) => entry.itemId)
        .filter((itemId) => comparatorItemIds.includes(itemId)),
    ),
  );
  const adjacentReferenceItemIds = comparatorItemIds.filter((itemId) => !directComparatorItemIds.includes(itemId));
  const rejectedComparatorItemIds = analysis.comparatorReasoning.rejectedComparisons.map((entry) => entry.itemId);
  const candidateHasImageReference = analysis.evidenceQuality.candidateImageCount > 0;
  const hostResponseMode = visuallyGrounded
    ? 'final_recommendation_ready'
    : candidateHasImageReference
      ? 'inspect_purchase_vision_packet'
      : 'request_candidate_image';
  const evidenceStatusPrefix = calibrationContext.readinessLevel === 'not_ready'
    ? 'I can judge the candidate, but I do not know the wardrobe well enough for wardrobe-fit claims yet'
    : 'I have the closet comparison set';
  const userFacingStatus = visuallyGrounded
    ? calibrationContext.readinessLevel === 'not_ready'
      ? 'Ready for a candidate-focused final answer; avoid wardrobe-fit claims until Style has stronger closet evidence.'
      : 'Ready for the final widget and short stylist explanation.'
    : candidateHasImageReference
      ? `${evidenceStatusPrefix} and image references; I am checking the actual visuals before making the call.`
      : sourceUrl
        ? allowPurchasePageExtraction
          ? `${evidenceStatusPrefix}; I am pulling product-page evidence before making the call.`
          : `${evidenceStatusPrefix}; I need item details plus a direct product image or uploaded photo before making the call.`
        : `${evidenceStatusPrefix}; I need a product image before making the call.`;
  const userFacingNarrationInstruction = allowPurchasePageExtraction
    ? 'When narrating this step to the user, do not say a tool call was blocked. Say the analysis is waiting on product-page evidence, image inspection, or the final widget step.'
    : 'When narrating this step to the user, do not say a tool call was blocked. Say the analysis is waiting on item details, an uploaded/direct image, image inspection, or the final widget step.';
  const calibrationInstruction =
    calibrationContext.readinessLevel === 'ready'
      ? `Calibration: ${calibrationContext.readinessLabel}`
      : calibrationContext.readinessLevel === 'not_ready'
        ? `Calibration: ${calibrationContext.readinessLabel} This is not ready for wardrobe-fit claims; judge the candidate only, ask for starter/import confirmation evidence, and ${calibrationContext.languageRule}`
        : `Calibration: ${calibrationContext.readinessLabel} Use provisional language and ${calibrationContext.languageRule}`;
  const runtimeStateAuthorityInstruction = calibrationContext.hostMemoryRule;
  const hostResponseInstruction = visuallyGrounded
    ? `Host visual evidence is present. ${calibrationInstruction} ${runtimeStateAuthorityInstruction} In ChatGPT/MCP Apps-style hosts, including Claude.ai runs that have proved ui:// mounting, call style_show_purchase_analysis_widget next before or alongside the final buy/wait/skip explanation; use style_render_purchase_analysis only for visualizer-only or text-first clients.`
    : candidateHasImageReference
      ? `Do not give a final buy/wait/skip recommendation yet. ${calibrationInstruction} ${runtimeStateAuthorityInstruction} Call style_get_purchase_vision_packet next, inspect the returned candidate and comparator images, then call style_submit_purchase_visual_observations before rendering the widget. If this text-first host does not expose style_submit_purchase_visual_observations, call style_render_purchase_analysis after inspection with concrete visual_evidence and source: "host_vision".`
      : sourceUrl
        ? allowPurchasePageExtraction
          ? `Do not give a final buy/wait/skip recommendation yet. ${calibrationInstruction} ${runtimeStateAuthorityInstruction} Call style_extract_purchase_page_evidence next with the product URL, re-run style_prepare_purchase_analysis with the enriched candidate it returns, then call style_get_purchase_vision_packet and style_submit_purchase_visual_observations before rendering the widget. If this text-first host does not expose the submit tool, use style_render_purchase_analysis with concrete host_vision visual_evidence after image inspection. If extraction returns no usable image, ask the user for a direct product image.`
          : `Do not give a final buy/wait/skip recommendation yet. ${calibrationInstruction} ${runtimeStateAuthorityInstruction} Ask the user for item details plus a direct candidate image or uploaded photo, then call style_get_purchase_vision_packet and style_submit_purchase_visual_observations before rendering the widget. If this text-first host does not expose the submit tool, use style_render_purchase_analysis with concrete host_vision visual_evidence after image inspection.`
        : `Do not give a final buy/wait/skip recommendation yet. ${calibrationInstruction} ${runtimeStateAuthorityInstruction} Ask the user for a direct candidate image, then call style_get_purchase_vision_packet and style_submit_purchase_visual_observations before rendering the widget. If this text-first host does not expose the submit tool, use style_render_purchase_analysis with concrete host_vision visual_evidence after image inspection.`;
  const hostVisionTask = buildStylePurchaseHostVisionTask({
    adjacentReferenceItemIds,
    allowPurchasePageExtraction,
    analysis,
    candidate,
    comparatorItemIds,
    directComparatorItemIds,
    sourceUrl,
    visuallyGrounded,
  });
  const calibrationAskRule = calibrationContext.opportunisticCalibrationPrompt?.toolName === 'style_add_starter_closet_item'
    ? 'Ask this only when it helps the current purchase decision. Call style_add_starter_closet_item only after the user provides an explicit starter item photo, product link, or description.'
    : 'Ask this only when it helps the current purchase decision. Call style_record_calibration_response only after the user answers with explicit intent, using schema-valid signals, item_wear_statuses, or profile_patch.';
  const recommendedNextSteps = visuallyGrounded
    ? [
        {
          tool: 'style_show_purchase_analysis_widget',
          reason:
            'Open the final rich purchase-analysis widget in ChatGPT/MCP Apps-style hosts now that host visual inspection evidence is present.',
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
              observations: [
                {
                  image_id: 'replace with candidate image_id from style_get_purchase_vision_packet imageManifest',
                  observed: {
                    color: 'replace with concrete observed candidate color',
                    distinctive_details: ['replace with concrete visible candidate details'],
                    silhouette: 'replace with concrete observed candidate silhouette',
                  },
                  role: 'candidate',
                },
              ],
              vision_packet_id: 'use visionPacketId from style_get_purchase_vision_packet',
            },
          },
          {
            tool: 'style_render_purchase_analysis',
            reason:
              'Claude visualizer-only/text-first fallback only: if style_submit_purchase_visual_observations is not exposed and the host cannot mount MCP Apps ui:// resources, inspect the candidate and comparator images first, then pass concrete visual_evidence with source: "host_vision" here instead of giving a direct freehand verdict.',
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
        ...(sourceUrl && analysis.evidenceQuality.candidateImageCount === 0 && allowPurchasePageExtraction
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
                  'Re-run purchase preparation with the enriched candidate returned by style_extract_purchase_page_evidence so the hostVisionTask includes candidate image references before requesting the purchase vision packet.',
                input: { candidate: 'use candidate from style_extract_purchase_page_evidence' },
              },
              {
                tool: 'user_request_candidate_image',
                reason:
                  'If extraction returns no usable product image, ask the user for a direct image or uploaded photo instead of giving the final buy/wait/skip verdict.',
                input: {
                  message:
                    calibrationContext.readinessLevel === 'not_ready'
                      ? 'I can judge the item itself, but I need a direct product image before I can make a real visual shopping call.'
                      : 'I found the right closet comparison set, but I need a direct product image before I can make a real visual shopping call.',
                },
              },
            ]
          : []),
        {
          tool: 'host_vision',
          reason:
            sourceUrl
              ? allowPurchasePageExtraction
                ? 'After extracting image references and re-running preparation, inspect the candidate and closest closet comparator images before any render/widget step.'
                : 'After the user provides item details plus a direct image or uploaded photo, inspect the candidate and closest closet comparator images before any render/widget step.'
              : 'Ask for or otherwise obtain a direct candidate image before making visual claims or rendering a widget.',
          input: hostVisionTask,
        },
      ];
  // D16 feed-before-judging: surface the proven budget signal to the host BEFORE it forms a
  // verdict. Fluent will not override the host's judgment; this is how the host gets informed.
  const budgetContext = analysis.budgetContext ?? null;
  const budgetInstruction = budgetContext && budgetContext.targetSetup
    ? `Budget context (Fluent-verified): ${budgetContext.purchaseSignal} - $${budgetContext.targetSetup.spentThisPeriod} of $${budgetContext.targetSetup.monthlyAmount} ${budgetContext.category} spent this month, $${budgetContext.targetSetup.remainingThisPeriod} remaining. Factor this into your buy/wait/skip judgment; Fluent will not override your verdict.`
    : null;

  return {
    analysisSummary: summarizeStylePurchaseAnalysis(analysis),
    budgetContext,
    budgetInstruction,
    calibrationAsk: calibrationContext.opportunisticCalibrationPrompt
      ? {
          prompt: calibrationContext.opportunisticCalibrationPrompt,
          rule: calibrationAskRule,
        }
      : null,
    candidate,
    candidateSummary: analysis.candidateSummary,
    calibrationContext,
    adjacentReferenceItemIds,
    comparatorItemIds,
    directComparatorItemIds,
    rejectedComparatorItemIds,
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
            allowPurchasePageExtraction
              ? 'Fetch or open the product page and locate direct product image(s).'
              : 'Ask the user for item details plus a direct product image or uploaded photo; do not fetch arbitrary product pages in this profile.',
            allowPurchasePageExtraction
              ? 'If no usable direct image can be extracted, ask the user for a direct product image or uploaded photo instead of giving the final buy/wait/skip answer.'
              : 'If the user cannot provide a usable direct image, stop before the final buy/wait/skip answer.',
            'Call style_get_purchase_vision_packet, inspect the returned inline images with a vision-capable model, and call style_submit_purchase_visual_observations before rendering the widget or giving the final buy/wait/skip answer.',
            'Inspect the candidate image with a vision-capable model before making color, material, texture, or visual-overlap claims.',
            'Inspect the closest closet comparator images returned by the purchase vision packet when available.',
          ],
    },
  };
}

function buildStylePurchaseHostVisionTask(input: {
  adjacentReferenceItemIds: string[];
  allowPurchasePageExtraction: boolean;
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
        ? input.allowPurchasePageExtraction
          ? 'First obtain a direct candidate product image. Do not render a widget or give the final buy/wait/skip recommendation until candidate image pixels have been inspected.'
          : 'Ask the user for item details plus a direct candidate product image or uploaded photo. Do not render a widget or give the final buy/wait/skip recommendation until candidate image pixels have been inspected.'
        : 'Call style_get_purchase_vision_packet, inspect the actual candidate image and the closest closet comparator images, then call style_submit_purchase_visual_observations before rendering or giving the final shopping recommendation. In Claude.ai MCP Apps-capable runs, finish with style_show_purchase_analysis_widget after accepted observations. In Claude visualizer-only or other text-first hosts where the submit tool is not exposed and ui:// mounting is unavailable, call style_render_purchase_analysis with concrete visual_evidence and source: "host_vision" after inspection.',
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
    rejectedComparators: input.analysis.comparatorReasoning.rejectedComparisons.slice(0, 6).map((entry) => ({
      itemId: entry.itemId,
      name: input.analysis.itemsById[entry.itemId]?.name ?? entry.itemId,
      rejectedBecause: entry.rejectedBecause,
      reasons: entry.reasons,
    })),
    comparatorTaxonomy: {
      directComparatorCount: input.directComparatorItemIds.length,
      hasCleanDirectComparator: input.directComparatorItemIds.length > 0,
      note:
        input.directComparatorItemIds.length > 0
          ? 'Direct comparators are same-category, same-wardrobe-job substitutes for the candidate.'
          : 'No clean direct comparator was found. Treat adjacent references as context only, not as substitute or duplicate evidence.',
    },
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
            input.allowPurchasePageExtraction
              ? 'Candidate imageUrls is empty: ask for or extract a direct product image before making candidate-side visual claims or a final buy/wait/skip recommendation.'
              : 'Candidate imageUrls is empty: ask the user for item details plus a direct product image or uploaded photo before making candidate-side visual claims or a final buy/wait/skip recommendation.',
          ]
        : [
            'Describe the candidate from the image: silhouette, shape, sole profile, material, texture, color temperature, accents, branding, and any visible fit or proportion cues.',
          ]),
      'Compare the candidate against directComparators first; decide whether each is the same item, same model family, a replacement, an upgrade, or visually distinct.',
      'Use adjacentReferences only for styling direction, formality, and wardrobe context; do not treat them as duplicate/substitute evidence unless the pixels support it.',
      'Name which comparator images were actually inspected and what visual detail changed, confirmed, or weakened the closet-overlap verdict.',
      'Do not call style_render_purchase_analysis or style_show_purchase_analysis_widget until candidate image pixels and available direct comparator image pixels have been inspected. Prefer style_submit_purchase_visual_observations when available; if it is not exposed in a text-first host, pass those concrete observations directly to style_render_purchase_analysis as visual_evidence with source: "host_vision".',
    ],
    renderGate: {
      pendingUntil: input.visuallyGrounded
        ? []
        : [
            ...(candidateImageUrls.length > 0
              ? []
              : [
                  input.allowPurchasePageExtraction
                    ? 'A direct candidate product image is located from the product page or supplied by the user.'
                    : 'A direct candidate product image is supplied by the user or uploaded into the host.',
                ]),
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
        ? 'Inspect this before deciding overlap; this is a likely same-category comparator, replacement, upgrade, or duplicate candidate.'
        : 'Inspect as context for styling direction and formality, but keep it secondary to direct comparators.',
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
  browserUserAgent?: boolean;
  fetchImpl?: typeof fetch;
  includeRawHtml?: boolean;
  maxImages?: number | null;
  productUrl: string;
}): Promise<{
  candidate: Record<string, unknown>;
  extraction: {
    attempted: boolean;
    finalUrl: string | null;
    imageCandidates: StylePurchasePageImageEvidence[];
    pageTitle: string | null;
    rawHtml?: string;
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

  let currentUrl = url;
  let response: Response | null = null;
  try {
    for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
      response = await (input.fetchImpl ?? fetch)(currentUrl.toString(), {
        headers: input.browserUserAgent
          ? {
              // Opt-in browser UA: many retailers (e.g. Gap) serve DEGRADED bot markup to a bot UA — the
              // real product gallery (incl the clean packshot) is omitted, leaving only stripped/on-model
              // images. A browser UA + accept gets the same full gallery a user's browser sees. Used by the
              // closet-add display-image resolver; the purchase path keeps the honest bot UA below.
              accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
              'accept-language': 'en-US,en;q=0.9',
              'user-agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            }
          : {
              accept: 'text/html,application/xhtml+xml',
              'user-agent': 'FluentStyleEvidenceBot/1.0 (+https://meetfluent.app)',
            },
        redirect: 'manual',
        signal: createFetchTimeoutSignal(15_000),
      });
      if (response.status < 300 || response.status >= 400) {
        break;
      }
      const location = response.headers.get('location');
      const nextUrl = location ? normalizePublicProductUrl(new URL(location, currentUrl).toString()) : null;
      if (!nextUrl) {
        return buildPageEvidenceResult({
          candidate: { productUrl: url.toString(), url: url.toString() },
          finalUrl: currentUrl.toString(),
          imageCandidates: [],
          pageTitle: null,
          productUrl: url.toString(),
          status: 'blocked_url',
          warnings: ['Product page redirected to a non-public or unsupported URL.'],
        });
      }
      currentUrl = nextUrl;
    }
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

  if (!response) {
    return buildPageEvidenceResult({
      candidate: { productUrl: url.toString(), url: url.toString() },
      finalUrl: currentUrl.toString(),
      imageCandidates: [],
      pageTitle: null,
      productUrl: url.toString(),
      status: 'fetch_failed',
      warnings: ['Product page fetch did not return a response.'],
    });
  }

  if (!response.ok) {
    return buildPageEvidenceResult({
      candidate: { productUrl: url.toString(), url: url.toString() },
      finalUrl: response.url || currentUrl.toString(),
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
      finalUrl: response.url || currentUrl.toString(),
      imageCandidates: [],
      pageTitle: null,
      productUrl: url.toString(),
      status: 'fetch_failed',
      warnings: [`Product page returned unsupported content type: ${contentType}.`],
    });
  }

  const html = (await response.text()).slice(0, 1_500_000);
  const finalUrl = response.url || currentUrl.toString();
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
    rawHtml: input.includeRawHtml ? html : undefined,
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
  rawHtml?: string;
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
      ...(input.rawHtml != null ? { rawHtml: input.rawHtml } : {}),
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

export function createFetchTimeoutSignal(milliseconds: number): AbortSignal | undefined {
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
  return `closet-image-${assetIndex}`;
}

function stylePurchaseComparatorHandle(preparation: StylePurchasePreparation, itemId: string | null | undefined): string | null {
  if (!itemId) {
    return null;
  }
  const index = preparation.comparatorItemIds.indexOf(itemId);
  return index >= 0 ? `closet-match-${index + 1}` : null;
}

function stylePurchaseComparatorHandleMap(preparation: StylePurchasePreparation): Map<string, string> {
  return new Map(preparation.comparatorItemIds.map((itemId, index) => [`closet-match-${index + 1}`, itemId] as const));
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
    const itemHandle = stylePurchaseComparatorHandle(input.preparation, asset.itemId);
    return {
      assetIndex,
      comparisonContext: asset.comparisonContext,
      contentIndex: inlineImage?.contentIndex ?? null,
      imageId: stylePurchaseVisionImageId(asset, assetIndex),
      inlineAvailable: inlineImage != null,
      itemContext: asset.itemContext,
      itemId: asset.itemId,
      itemHandle,
      label: asset.label,
      role: asset.role,
      sourceUrl: publicSourceUrl,
    };
  });
  const rejectedComparatorItemIds = input.preparation.rejectedComparatorItemIds;
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
    adjacentReferenceItemIds: input.preparation.adjacentReferenceItemIds,
    rejectedComparatorItemIds,
    comparatorTaxonomy: {
      directComparators:
        input.preparation.directComparatorItemIds.length > 0
          ? 'Inspect these first as true same-category, same-wardrobe-job substitutes.'
          : 'No clean direct comparators are available; do not promote adjacent or rejected items as duplicate proof.',
      adjacentReferences: 'Use adjacent references for taste, styling direction, and outfit context only.',
      rejectedComparators: 'Rejected comparators are tempting metadata matches that Fluent intentionally excluded.',
    },
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
            'Closet match handles whose inline comparator images were actually inspected, such as closet-match-1; include direct comparators first.',
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
    directComparatorHandles: input.preparation.directComparatorItemIds
      .map((itemId) => stylePurchaseComparatorHandle(input.preparation, itemId))
      .filter((handle): handle is string => Boolean(handle)),
    adjacentReferenceHandles: input.preparation.adjacentReferenceItemIds
      .map((itemId) => stylePurchaseComparatorHandle(input.preparation, itemId))
      .filter((handle): handle is string => Boolean(handle)),
    rejectedComparatorItemIds,
    hostModelGuidance:
      readyForHostVision
        ? 'Inspect each inline MCP image content entry named in imageManifest. Submit concrete pixel observations with style_submit_purchase_visual_observations before rendering the widget or giving the final buy/wait/skip answer.'
        : candidateManifestEntry
          ? 'The candidate image was not included as inline MCP image content. Do not submit visual observations, render the widget, or make final visual claims yet. Open or fetch the candidate source URL yourself if the host supports it, or ask the user for a direct product image.'
          : 'No candidate image is available yet. Ask the user for a direct product image or extract one from the product page before making the final shopping call.',
    imageManifest: imageManifest.map((entry) => ({
      contentIndex: entry.contentIndex,
      imageId: entry.imageId,
      itemHandle: entry.itemHandle,
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

function buildStylePurchaseVisualEvidenceFromObservations(
  input: z.infer<typeof styleSubmitPurchaseVisualObservationsInputSchema>,
  preparation: StylePurchasePreparation,
) {
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
  ).map((itemIdOrHandle) => stylePurchaseComparatorHandleMap(preparation).get(itemIdOrHandle) ?? itemIdOrHandle);
  const allowedComparatorItemIds = new Set([
    ...preparation.comparatorItemIds,
    ...preparation.directComparatorItemIds,
    ...preparation.rejectedComparatorItemIds,
  ]);
  const unknownComparatorItemIds = comparatorItemIdsInspected.filter((itemId) => !allowedComparatorItemIds.has(itemId));
  if (unknownComparatorItemIds.length > 0) {
    throw new Error(
      `style_submit_purchase_visual_observations rejected unknown comparator image evidence: ${unknownComparatorItemIds.join(', ')}. Use only comparator item IDs from the current style_get_purchase_vision_packet.`,
    );
  }
  const source = STYLE_PURCHASE_HOST_VISION_SOURCES.has(String(input.source ?? ''))
    ? 'host_vision'
    : STYLE_PURCHASE_VISUAL_EVIDENCE_SOURCE;
  const visualEvidence = stylePurchaseVisualEvidenceInputSchema.parse({
    candidateInspected: true,
    candidateObservations,
    comparatorItemIdsInspected,
    source,
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

function buildStylePurchaseLoggedItemId(candidate: ReturnType<typeof normalizeStylePurchaseCandidate>): string {
  const hash = createHash('sha256')
    .update(
      stableJsonForCache({
        brand: candidate.brand ?? null,
        category: candidate.category,
        colorFamily: candidate.colorFamily ?? null,
        imageUrl: candidate.imageUrls[0] ?? null,
        name: candidate.name ?? null,
        subcategory: candidate.subcategory ?? null,
      }),
    )
    .digest('hex')
    .slice(0, 24);
  return `style-item:purchase:${hash}`;
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

export async function fetchStyleVisualBundleImage(url: string, signal?: AbortSignal): Promise<{
  byteLength: number;
  data: string;
  mimeType: string;
}> {
  // SSRF boundary: never server-fetch a non-public URL. Caller-/host-supplied photo URLs can be arbitrary
  // (retailer or user-provided), so reject localhost / private / link-local hosts BEFORE fetching. Mirrors
  // the write-path boundary at domains/style/service.ts (store-by-reference; never fetch host-inspected
  // URLs). Public retailer and owned signed (img.meetfluent.app) URLs pass unchanged.
  if (!normalizePublicProductUrl(url)) {
    throw new Error('refusing to fetch a non-public image URL');
  }
  const response = await fetch(url, {
    // Do NOT send a browser User-Agent here. Empirically (probed against the live CDN), content.gapinc
    // content-negotiates purely on UA: a browser UA gets image/avif (which the vision model CANNOT view, so
    // we would discard it), while a UA-less request gets image/webp (host-viewable). The accept header is
    // ignored by that CDN. So a bot/absent UA is what actually yields a usable inline image here. (The
    // product-page scraper is the opposite case — it needs a browser UA to get full HTML — they are distinct.)
    //
    // cache:'no-store' is REQUIRED for correctness, not just freshness: content.gapinc serves a different
    // body per UA (avif vs webp) but declares only `Vary: Origin` (NOT Vary: User-Agent) with max-age=1yr.
    // So Cloudflare's Worker-subrequest cache keys on the URL alone — a browser-UA fetch (e.g. an earlier
    // deploy) caches AVIF, and a later UA-less fetch gets a cache HIT on that stale avif, masking this fix.
    // Bypassing the cache forces a fresh UA-less origin fetch -> webp.
    cache: 'no-store',
    headers: { accept: 'image/webp,image/png,image/jpeg,image/gif,image/*;q=0.8' },
    signal: signal ?? createFetchTimeoutSignal(15_000),
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

export function normalizePublicProductUrl(value: string): URL | null {
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
      hostname.startsWith('169.254.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
      hostname === '::1' ||
      hostname === '[::1]' ||
      /^f[cd][0-9a-f]*:/i.test(hostname) ||
      /^fe80:/i.test(hostname) ||
      hostname.startsWith('[fc') ||
      hostname.startsWith('[fd') ||
      hostname.startsWith('[fe80:')
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

function sanitizeStyleVisualBundleAssetForHost(asset: StyleVisualBundleAssetRecord): Record<string, unknown> {
  const publicSourceUrl = selectStyleVisualBundlePublicUrl(asset);
  return {
    comparisonContext: asset.comparisonContext,
    itemContext: asset.itemContext,
    label: asset.label,
    role: asset.role,
    sourceUrl: publicSourceUrl,
  };
}

async function buildPurchaseAnalysisImageHints(
  style: StyleService,
  analysis: Awaited<ReturnType<StyleService['analyzePurchase']>>,
  candidate: unknown,
  options: { imageDeliverySecret?: string | null; origin: string },
): Promise<PurchaseAnalysisImageHints> {
  const hints: PurchaseAnalysisImageHints = {
    candidateImageUrl: await buildWidgetImageUrl(analysis.candidate.imageUrls[0] ?? null, options),
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
        hints.candidateImageUrl = await buildWidgetImageUrl(publicUrl, options);
      } else if (asset.itemId) {
        const widgetUrl = await buildWidgetImageUrl(publicUrl, options);
        if (widgetUrl) {
          hints.comparatorImageUrlsByItemId![asset.itemId] = widgetUrl;
        }
      }
    }
  } catch {
    // Widget images are an enhancement. Analysis should still render if a
    // signed image URL cannot be assembled for this host response.
  }

  return hints;
}

async function buildWidgetImageUrl(
  value: string | null,
  options: { imageDeliverySecret?: string | null; origin: string },
): Promise<string | null> {
  if (!value) {
    return null;
  }
  const publicUrl = normalizePublicProductUrl(value);
  if (!publicUrl) {
    return null;
  }
  if (isSameOriginUrl(publicUrl, options.origin)) {
    return publicUrl.toString();
  }
  if (!options.imageDeliverySecret) {
    return null;
  }
  try {
    const signed = await buildSignedStyleRemoteImageUrl({
      origin: options.origin,
      secret: options.imageDeliverySecret,
      sourceUrl: publicUrl.toString(),
    });
    return signed.originalUrl;
  } catch {
    return null;
  }
}

function isSameOriginUrl(url: URL, origin: string): boolean {
  try {
    return url.origin === new URL(origin).origin;
  } catch {
    return false;
  }
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

export function scoreProductImageEvidence(entry: StylePurchasePageImageEvidence, pageTitle: string | null, pageUrl: string): number {
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

export function isLikelyNonProductImage(entry: StylePurchasePageImageEvidence, pageTitle: string | null, pageUrl: string): boolean {
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
  const record = asRecord(parseJsonLike<unknown>(value));
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
      : options.allowHostVisionFallback === true && (!source || STYLE_PURCHASE_HOST_VISION_SOURCES.has(source))
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

export function registerStyleMcpSurface(
  server: McpServer,
  style: StyleService,
  origin: string,
  options: { allowPurchasePageExtraction?: boolean; imageDeliverySecret?: string | null } = {},
) {
  const allowPurchasePageExtraction = options.allowPurchasePageExtraction ?? true;
  const styleReadSecuritySchemes = [{ type: 'oauth2' as const, scopes: [FLUENT_STYLE_READ_SCOPE] }];
  // Closet render adapter accepts either read scope (gate = requireAnyScope([style:read, meals:read]));
  // advertise both so the narrowed public token (meals:read) is in lockstep with the gate.
  const styleClosetReadSecuritySchemes = [{ type: 'oauth2' as const, scopes: [FLUENT_MEALS_READ_SCOPE, FLUENT_STYLE_READ_SCOPE] }];
  const styleWriteSecuritySchemes = [{ type: 'oauth2' as const, scopes: [FLUENT_STYLE_WRITE_SCOPE] }];
  const purchaseAnalysisWidgetMeta = buildWidgetMeta(
    'Rich Fluent purchase analysis for Style buy/skip decisions in ChatGPT-style widget hosts.',
    origin,
  );
  const setupCalibrationWidgetMeta = buildWidgetMeta(
    'Fluent Style setup and calibration view for closet confidence, inferred taste, confirmed taste, and next best action.',
    origin,
  );
  const closetWidgetMeta = buildStyleClosetWidgetMeta(
    'Photography-first Fluent Style closet manager for owned-item review and item-level edits.',
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
    'fluent-style-purchase-analysis-widget-bridge-previous-v9',
    STYLE_PURCHASE_ANALYSIS_BRIDGE_PREVIOUS_TEMPLATE_URI,
    'Purchase Analysis Widget Previous v9',
  );
  registerPurchaseAnalysisWidgetResource(
    'fluent-style-purchase-analysis-widget-actions-previous-v10',
    STYLE_PURCHASE_ANALYSIS_ACTIONS_PREVIOUS_TEMPLATE_URI,
    'Purchase Analysis Widget Previous v10',
  );
  registerPurchaseAnalysisWidgetResource(
    'fluent-style-purchase-analysis-widget-framed-previous-v11',
    STYLE_PURCHASE_ANALYSIS_FRAMED_PREVIOUS_TEMPLATE_URI,
    'Purchase Analysis Widget Previous v11',
  );
  registerPurchaseAnalysisWidgetResource(
    'fluent-style-purchase-analysis-widget-comparison-previous-v12',
    STYLE_PURCHASE_ANALYSIS_COMPARISON_PREVIOUS_TEMPLATE_URI,
    'Purchase Analysis Widget Previous v12',
  );
  registerPurchaseAnalysisWidgetResource(
    'fluent-style-purchase-analysis-widget-editorial-previous-v13',
    STYLE_PURCHASE_ANALYSIS_EDITORIAL_PREVIOUS_TEMPLATE_URI,
    'Purchase Analysis Widget Previous v13',
  );
  registerPurchaseAnalysisWidgetResource(
    'fluent-style-purchase-analysis-widget-title-previous-v14',
    STYLE_PURCHASE_ANALYSIS_TITLE_PREVIOUS_TEMPLATE_URI,
    'Purchase Analysis Widget Previous v14',
  );
  registerPurchaseAnalysisWidgetResource(
    'fluent-style-purchase-analysis-widget-photo-read-previous-v15',
    STYLE_PURCHASE_ANALYSIS_PHOTO_READ_PREVIOUS_TEMPLATE_URI,
    'Purchase Analysis Widget Previous v15',
  );
  registerPurchaseAnalysisWidgetResource(
    'fluent-style-purchase-analysis-widget-decision-previous-v16',
    STYLE_PURCHASE_ANALYSIS_DECISION_PREVIOUS_TEMPLATE_URI,
    'Purchase Analysis Widget Previous v16',
  );
  registerPurchaseAnalysisWidgetResource(
    'fluent-style-purchase-analysis-widget-secondary-action-previous-v17',
    STYLE_PURCHASE_ANALYSIS_SECONDARY_ACTION_PREVIOUS_TEMPLATE_URI,
    'Purchase Analysis Widget Previous v17',
  );
  registerPurchaseAnalysisWidgetResource(
    'fluent-style-purchase-analysis-widget-hydration-previous-v18',
    STYLE_PURCHASE_ANALYSIS_HYDRATION_PREVIOUS_TEMPLATE_URI,
    'Purchase Analysis Widget Previous v18',
  );
  registerPurchaseAnalysisWidgetResource(
    'fluent-style-purchase-analysis-widget-native-previous-v19',
    STYLE_PURCHASE_ANALYSIS_NATIVE_PREVIOUS_TEMPLATE_URI,
    'Purchase Analysis Widget Previous v19',
  );
  registerPurchaseAnalysisWidgetResource(
    'fluent-style-purchase-analysis-widget-mcp-apps-previous-v20',
    STYLE_PURCHASE_ANALYSIS_MCP_APPS_PREVIOUS_TEMPLATE_URI,
    'Purchase Analysis Widget Previous v20',
  );
  registerPurchaseAnalysisWidgetResource(
    'fluent-style-purchase-analysis-widget-judgment-previous-v21',
    STYLE_PURCHASE_ANALYSIS_JUDGMENT_PREVIOUS_TEMPLATE_URI,
    'Purchase Analysis Widget Previous v21',
  );
  registerPurchaseAnalysisWidgetResource(
    'fluent-style-purchase-analysis-widget',
    STYLE_PURCHASE_ANALYSIS_TEMPLATE_URI,
    'Purchase Analysis Widget',
  );

  const registerStyleClosetWidgetResource = (name: string, uri: string, title: string) => {
    server.registerResource(
      name,
      uri,
      {
        title,
        description: 'Photography-first closet manager for owned Fluent Style items.',
        mimeType: 'text/html;profile=mcp-app',
        icons: iconFor(origin),
        _meta: closetWidgetMeta,
      },
      async () => ({
        contents: [
          {
            uri,
            mimeType: 'text/html;profile=mcp-app',
            text: getStyleClosetWidgetHtml(),
            _meta: closetWidgetMeta,
          },
        ],
      }),
    );
  };

  registerStyleClosetWidgetResource(
    'fluent-style-closet-widget-previous-v1',
    STYLE_CLOSET_PREVIOUS_TEMPLATE_URI,
    'Style Closet Widget Previous v1',
  );
  registerStyleClosetWidgetResource(
    'fluent-style-closet-widget-previous-v2',
    STYLE_CLOSET_V2_TEMPLATE_URI,
    'Style Closet Widget Previous v2',
  );
  registerStyleClosetWidgetResource(
    'fluent-style-closet-widget-previous-v3',
    STYLE_CLOSET_V3_TEMPLATE_URI,
    'Style Closet Widget Previous v3',
  );
  registerStyleClosetWidgetResource(
    'fluent-style-closet-widget-previous-v4',
    STYLE_CLOSET_V4_TEMPLATE_URI,
    'Style Closet Widget Previous v4',
  );
  registerStyleClosetWidgetResource(
    'fluent-style-closet-widget-previous-v5',
    STYLE_CLOSET_V5_TEMPLATE_URI,
    'Style Closet Widget Previous v5',
  );
  registerStyleClosetWidgetResource(
    'fluent-style-closet-widget-previous-v6',
    STYLE_CLOSET_V6_TEMPLATE_URI,
    'Style Closet Widget Previous v6',
  );
  registerStyleClosetWidgetResource(
    'fluent-style-closet-widget-v7',
    STYLE_CLOSET_TEMPLATE_URI,
    'Style Closet Widget',
  );

  server.registerResource(
    'fluent-style-setup-calibration-widget',
    STYLE_SETUP_CALIBRATION_TEMPLATE_URI,
    {
      title: 'Style Setup Calibration Widget',
      description: 'Style setup and calibration card for empty, thin, imported, inferred, or confirmed closet states.',
      mimeType: 'text/html;profile=mcp-app',
      icons: iconFor(origin),
      _meta: setupCalibrationWidgetMeta,
    },
    async () => ({
      contents: [
        {
          uri: STYLE_SETUP_CALIBRATION_TEMPLATE_URI,
          mimeType: 'text/html;profile=mcp-app',
          text: getStyleSetupCalibrationWidgetHtml(),
          _meta: setupCalibrationWidgetMeta,
        },
      ],
    }),
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
      description:
        'Fetch the current raw Style calibration profile only when raw saved profile fields are explicitly needed outside the standard setup/calibration summary lane. Do not use this for ordinary Style setup, onboarding, calibration summaries, confidence checks, confirm/correct prompts, starter closet additions, stale/accidental phrase calibration, or "what do you know about my style?" prompts; style_get_onboarding_calibration is the sufficient read model for those so closet evidence, inferred signals, confirmed taste, and purchase readiness stay distinct.',
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
        'Fetch ambient closet-derived Style context for broad wardrobe detail outside the standard setup/calibration summary lane. itemCount, categoryBreakdown, colorBreakdown, photoCount, and coverage fields are active-closet counts; totalItemCount, totalCategoryBreakdown, totalColorBreakdown, inactiveItemCount, and inactiveStatusBreakdown explicitly label archived/retired inventory. Do not use this for ordinary Style setup, onboarding, calibration summaries, confirm/correct prompts, starter closet additions, or stale/accidental phrase calibration; style_get_onboarding_calibration is the authoritative read model for those. Do not use this as the first tool for purchase decisions, product links, direct image URLs, or "should I buy this?" prompts; use style_prepare_purchase_analysis first even when the candidate is text-only or has no image yet. When using this after setup for a specific broader wardrobe detail, carry forward the calibration language rule: say "your closet suggests" for inferred patterns and do not describe ownership as intentional taste or as what the user is wearing, avoiding, leaning toward, or preferring unless user-confirmed. Do not use this to exhaustively search for a stale/accidental phrase. If the setup read model does not expose a stable item match, record phrase-level calibration with style_record_calibration_response.',
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
    'style_get_onboarding_calibration',
    {
      title: 'Get Style Onboarding Calibration',
      description:
        'Required first and sufficient read model for Style setup/calibration. Fetch closet status, active evidence count, photo and category coverage, inferred versus confirmed taste signals, unresolved questions, suggested next action, and purchase-analysis readiness. Category counts are coverage evidence, not taste or aesthetic signals. Use this for Style setup, closet import calibration, stale/accidental calibration, widget rendering, confirm/correct prompts, starter closet additions, and any purchase answer that depends on closet confidence. For ordinary setup/calibration summaries, do not call style_get_context; this read model owns the onboarding state. For inferred signals, say "your closet suggests" and avoid second-person taste phrasing such as "you prefer", "you lean", or "you are going for" unless the user confirmed it. If the user marks a named item/phrase stale or accidental so it should not count as preference, and you cannot match a stable item ID, record phrase-level calibration with style_record_calibration_response instead of asking to use style_upsert_item.',
      inputSchema: {
        view: readViewSchema,
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ view }) => {
      requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      const calibration = await style.getOnboardingCalibration();
      const summary = {
        activeItemCount: calibration.activeItemCount,
        calibrationPrompts: calibration.calibrationPrompts,
        closetState: calibration.closetStatus.state,
        confirmedSignalCount: calibration.confirmedStyleSignals.length,
        confidenceBreakdown: calibration.confidenceBreakdown,
        inferredSignalCount: calibration.inferredStyleSignals.length,
        purchaseAnalysisReadiness: calibration.purchaseAnalysisReadiness,
        suggestedNextAction: calibration.suggestedNextAction,
        unresolvedQuestions: calibration.unresolvedQuestions,
      };
      return toolResult(calibration, {
        textData: view === 'full' ? calibration : summary,
        structuredContent: view === 'summary' ? summary : calibration,
      });
    },
  );

  server.registerTool(
    'style_record_calibration_response',
    {
      title: 'Record Style Calibration Response',
      description:
        'Save explicit Style calibration only after the user clearly confirms, rejects, or corrects a signal; marks known closet items actively worn, stale, or accidental; or gives basic constraints for a profile patch. Use signal rejections for phrase-level feedback such as "neon running tees are not me" or "mark the neon running tee accidental/stale so it does not count as my style preference" when no exact item ID is already available. In that case, call this immediately with a user_confirmed rejected signal, usually kind "aesthetic", value "neon running tee", and a note that no stable closet item match was found. Use kind "hard_avoid" only when the user explicitly says the phrase is a hard avoid. Do not fabricate item IDs, do not ask to use style_upsert_item merely to express phrase-level stale/accidental preference feedback, do not use this from inference alone, and do not treat rejected or stale/accidental evidence as confirmed taste.',
      inputSchema: {
        item_wear_statuses: z
          .array(
            z.object({
              item_id: z
                .string()
                .min(1)
                .describe('Use item_id returned by style_get_onboarding_calibration, style_list_items, or style_get_context; do not invent item IDs.'),
              note: z.string().nullable().optional().describe('Optional user-confirmed reason for the item wear-status calibration.'),
              wear_status: styleItemWearStatusSchema.describe('User-confirmed wear status for this known closet item.'),
            }),
          )
          .describe('Known closet items the user explicitly marked active, stale, accidental, retired, or otherwise calibrated.')
          .optional(),
        profile_patch: styleProfilePatchInputSchema.optional().describe('Sparse Style profile patch; include only explicit user-confirmed setup or calibration fields.'),
        response_mode: writeResponseModeSchema,
        signals: z
          .array(
            z.object({
              confidence: z.number().min(0).max(1).nullable().optional(),
              corrected_value: z.string().nullable().optional(),
              kind: styleCalibrationSignalKindSchema,
              note: z.string().nullable().optional(),
              source: styleInferenceSourceSchema,
              status: styleCalibrationSignalStatusSchema,
              value: z.string(),
            }),
          )
          .optional(),
        ...provenanceInputSchema,
      },
    },
    async (args) => {
      const authProps = requireAnyScope([FLUENT_STYLE_WRITE_SCOPE, FLUENT_MEALS_WRITE_SCOPE]);
      const calibration = await style.recordCalibrationResponse({
        itemWearStatuses: args.item_wear_statuses?.map((entry) => ({
          itemId: entry.item_id,
          note: entry.note,
          wearStatus: entry.wear_status,
        })),
        profilePatch: args.profile_patch,
        provenance: buildMutationProvenance(authProps, args),
        signals: args.signals?.map((entry) => ({
          confidence: entry.confidence,
          correctedValue: entry.corrected_value,
          kind: entry.kind,
          note: entry.note,
          source: entry.source,
          status: entry.status,
          value: entry.value,
        })),
      });
      const ack = buildStyleMutationAck('style_calibration', 'current', 'style.calibration_response_recorded', new Date().toISOString(), {
        closetState: calibration.closetStatus.state,
        confirmedSignalCount: calibration.confirmedStyleSignals.length,
        excludedItemCount: calibration.excludedItemCount,
        shoppingDecisionConfidence: calibration.confidenceBreakdown.shoppingDecisionConfidence,
      });
      return toolResult(calibration, {
        textData: args.response_mode === 'full' ? calibration : ack,
        structuredContent: args.response_mode === 'ack' ? ack : calibration,
      });
    },
  );

  server.registerTool(
    'style_add_starter_closet_item',
    {
      title: 'Add Starter Closet Item',
      description:
        'Preferred write tool for adding one active starter Style closet item from a user-provided description, product link, or image URL during setup. Preserve obvious descriptive details such as length, structure, silhouette, formality, occasions, and evidence gaps. This is for user-supplied evidence only; do not search for or invent closet items, and do not use style_upsert_item for starter closet onboarding unless the user is doing advanced item maintenance.',
      inputSchema: {
        item: styleStarterClosetItemInputSchema.describe('Required user-supplied starter closet item object with name/category/description/profile details when known.'),
        photo_url: z.string().url().optional().describe('Optional direct photo URL for the starter closet item.'),
        response_mode: writeResponseModeSchema,
        source_snapshot: styleToolMetadataInputSchema,
        ...provenanceInputSchema,
      },
    },
    async (args) => {
      const authProps = requireAnyScope([FLUENT_STYLE_WRITE_SCOPE, FLUENT_MEALS_WRITE_SCOPE]);
      const result = await style.addStarterClosetItem({
        item: args.item,
        photoUrl: args.photo_url,
        provenance: buildMutationProvenance(authProps, args),
        sourceSnapshot: args.source_snapshot,
      });
      const ack = buildStyleMutationAck('style_item', result.item.id, 'style.starter_item_added', new Date().toISOString(), {
        closetState: result.calibration.closetStatus.state,
        itemName: result.item.name,
        photoCount: result.item.photos.length,
      });
      return toolResult(result, {
        textData: args.response_mode === 'full' ? result : ack,
        structuredContent: args.response_mode === 'ack' ? ack : result,
      });
    },
  );

  server.registerTool(
    'style_show_setup_calibration_widget',
    withAppsSecurity({
      title: 'Show Style Setup Calibration Widget',
      description:
        'Request the native Style Setup / Calibration card for MCP Apps-capable hosts only after style_get_onboarding_calibration has already been called in this turn. Do not call this as the first Style setup/calibration tool, even when the user asks whether a native surface can mount. Do not call this for Claude.ai text-fallback onboarding; use style_get_onboarding_calibration plus explicit write tools instead. A successful tool call or Claude tool-call card is not proof that a widget rendered; claim native rendering only when the host visibly mounts ui://widget/fluent-style-setup-calibration-v1.html as an app/iframe surface. In Claude.ai/text hosts, the default classification is claude-visualizer-text unless that exact ui:// resource visibly mounts.',
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true },
      _meta: {
        ui: {
          resourceUri: STYLE_SETUP_CALIBRATION_TEMPLATE_URI,
        },
        'openai/outputTemplate': STYLE_SETUP_CALIBRATION_TEMPLATE_URI,
        'openai/toolInvocation/invoked': 'Style setup calibration ready.',
        'openai/toolInvocation/invoking': 'Requesting Style setup payload…',
        'openai/widgetAccessible': true,
      },
    }, styleReadSecuritySchemes),
    async () => {
      requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      const calibration = await style.getOnboardingCalibration();
      return {
        _meta: {
          styleCalibration: calibration,
          widgetResourceUri: STYLE_SETUP_CALIBRATION_TEMPLATE_URI,
        },
        content: [
          {
            type: 'text' as const,
            text: `Do not say the Style setup widget rendered from this tool response alone. This is a widget payload for closet state "${calibration.closetStatus.state}", not visible render proof. Native MCP Apps proof requires the host UI to visibly mount ${STYLE_SETUP_CALIBRATION_TEMPLATE_URI} as an app/iframe surface. If the host only shows a Claude tool-call card, classify the run as claude-visualizer-text and answer from style_get_onboarding_calibration.`,
          },
        ],
        structuredContent: {
          claudeHostModeIfNoVisibleUiResource: 'claude-visualizer-text',
          experience: 'style_setup_calibration_widget',
          nativeRenderProofRequired: true,
          nativeRenderProofRule:
            'Only claim native rendering when the visible host UI mounts ui://widget/fluent-style-setup-calibration-v1.html as an app/iframe surface; a tool call card is not render proof.',
          styleCalibration: calibration,
          widgetResourceUri: STYLE_SETUP_CALIBRATION_TEMPLATE_URI,
        },
      };
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
      description:
        'Fetch a single Style closet item with its linked photos and item profile only when you already have a stable item_id. Do not probe guessed ID ranges to locate a stale/accidental phrase; if the user wants a named phrase excluded from preference and no stable item_id is available from the setup read model, use style_record_calibration_response with a user_confirmed rejected signal instead.',
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
      description: 'Return derived wardrobe-level strengths, weak spots, wardrobe gaps, replacements, and buy-next guidance for Style.',
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
      description: allowPurchasePageExtraction
        ? 'Use for Style purchase-analysis requests, including text-only candidate names, product URLs, direct image URLs, and "should I buy this?" prompts. Normalizes the candidate, returns closet comparator context, and tells the host what product-page or image evidence must be inspected before any final verdict or rich purchase-analysis widget. Do not start purchase analysis with style_get_context or style_analyze_purchase. If only a product URL was provided and no candidate image references exist yet, use style_extract_purchase_page_evidence next. Use before style_render_purchase_analysis for "should I buy this?", "analyze this purchase", and product-link prompts.'
        : 'Use for Style purchase-analysis requests, including text-only candidate names, product URLs, direct image URLs, and "should I buy this?" prompts. Normalizes the candidate, returns closet comparator context, and tells the host what item details or image evidence must be inspected before any final verdict or rich purchase-analysis widget. Do not start purchase analysis with style_get_context or style_analyze_purchase. In ChatGPT, product links should be supported by user-provided item details plus a direct product image or uploaded photo before the final buy/wait/skip call. Use before style_render_purchase_analysis for "should I buy this?", "analyze this purchase", and product-link prompts.',
      inputSchema: {
        candidate: stylePurchaseCandidateInputSchema.describe('Required purchase candidate as a short string or structured object with known product details.'),
        evidence: stylePurchaseVisualEvidenceInputSchema.optional().describe('Accepted concrete visual evidence from a prior host inspection; omit until the image has actually been inspected.'),
        renderRepair: stylePurchaseRenderRepairInputSchema.optional().describe('Optional repair payload from a prior purchase-analysis response, camelCase form.'),
        render_repair: stylePurchaseRenderRepairInputSchema.optional().describe('Optional repair payload from a prior purchase-analysis response, snake_case form.'),
        retryInput: stylePurchaseRetryInputSchema.optional().describe('Optional retry payload with concrete visual evidence, camelCase form.'),
        retry_input: stylePurchaseRetryInputSchema.optional().describe('Optional retry payload with concrete visual evidence, snake_case form.'),
        visualEvidence: stylePurchaseVisualEvidenceInputSchema.optional().describe('Accepted concrete visual evidence in camelCase form.'),
        visualObservationId: z.string().optional().describe('Receipt ID returned by style_submit_purchase_visual_observations.'),
        visual_observation_id: z.string().optional().describe('Receipt ID returned by style_submit_purchase_visual_observations.'),
        visual_evidence: stylePurchaseVisualEvidenceInputSchema.optional().describe('Accepted concrete visual evidence in snake_case form.'),
        visualObservations: z.array(styleConcreteVisualObservationSchema).optional().describe('Concrete candidate image observations in camelCase shorthand.'),
        visual_observations: z.array(styleConcreteVisualObservationSchema).optional().describe('Concrete candidate image observations in snake_case shorthand.'),
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
        allowPurchasePageExtraction,
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
        'Primary Fluent Style purchase-analysis visual step for staged purchase decisions. Returns model-visible inline candidate and closet-comparator images plus compact comparison context. Use after style_prepare_purchase_analysis for image-bearing candidates, inspect the returned image content, then call style_submit_purchase_visual_observations before rendering the widget or giving the final buy/wait/skip recommendation.',
      inputSchema: {
        candidate: stylePurchaseCandidateInputSchema.describe('Purchase candidate from style_prepare_purchase_analysis or the same candidate object/string previously analyzed.'),
        comparator_item_ids: z
          .array(z.string().min(1).describe('Comparator item ID returned in comparatorItemIds by style_prepare_purchase_analysis.'))
          .optional()
          .describe('Optional exact comparator item IDs from the prior style_prepare_purchase_analysis result; omit to let Fluent choose comparators.'),
        max_inline_images: z
          .number()
          .int()
          .positive()
          .max(STYLE_VISUAL_BUNDLE_MAX_INLINE_IMAGES)
          .optional()
          .describe(`Maximum inline images to return, from 1 to ${STYLE_VISUAL_BUNDLE_MAX_INLINE_IMAGES}.`),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ candidate, comparator_item_ids, max_inline_images }) => {
      requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      const enrichedCandidate = allowPurchasePageExtraction
        ? await enrichStyleVisualBundleCandidateFromProductPage({
            candidate,
            maxImages: 8,
          })
        : candidate;
      const analysis = await style.analyzePurchase({ candidate: enrichedCandidate });
      const preparation = buildStylePurchasePreparation({
        allowPurchasePageExtraction,
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
    withAppsSecurity({
      title: 'Style Submit Purchase Visual Observations',
      description:
        'Submit concrete host-model observations from an inspected candidate product image plus the host agent stylist_judgment. The judgment is the agent-owned buy/skip/wait call; Fluent validates the evidence, stores a short-lived private receipt for the current purchase analysis, and returns renderInput for the native v22 purchase-analysis card. When the host supports MCP Apps and the user request calls for the rich card, pass the returned renderInput to style_show_purchase_analysis_widget. Claude visualizer-only, plain MCP, or text-first clients may use style_render_purchase_analysis instead.',
      inputSchema: styleSubmitPurchaseVisualObservationsInputSchema.shape,
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false, readOnlyHint: false },
      _meta: {},
    }, styleReadSecuritySchemes),
    async (args) => {
      const authProps = requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      const parsed = styleSubmitPurchaseVisualObservationsInputSchema.parse(args);
      const stylistJudgment = extractStylePurchaseStylistJudgmentArgument(parsed);
      const preparationBeforeVisualEvidence = buildStylePurchasePreparation({
        allowPurchasePageExtraction,
        analysis: await style.analyzePurchase({
          candidate: parsed.candidate,
        }),
        candidateInput: parsed.candidate,
      });
      const visualEvidence = buildStylePurchaseVisualEvidenceFromObservations(parsed, preparationBeforeVisualEvidence);
      const analysis = await style.analyzePurchase({
        candidate: parsed.candidate,
        visualEvidence,
      });
      const preparation = buildStylePurchasePreparation({
        allowPurchasePageExtraction,
        analysis,
        candidateInput: parsed.candidate,
      });
      if (preparation.visualGrounding.candidateVisualGrounding !== 'host_visual_inspection') {
        throw new Error(
          'style_submit_purchase_visual_observations not_render_ready: accepted observations did not produce host-inspected candidate grounding. Re-run style_get_purchase_vision_packet for image-reference candidates, or submit uploaded-image observations with source: "host_vision_uploaded_image".',
        );
      }
      const effectiveStylistJudgment = preparation.calibrationContext.readinessLevel === 'not_ready' ? null : stylistJudgment;
      const finalStateAuthorityInstruction = preparation.calibrationContext.hostMemoryRule;
      const receipt = {
        analysisSummary: summarizeStylePurchaseAnalysis(analysis),
        candidate: preparation.candidate,
        candidateSummary: preparation.candidateSummary,
        claudeAiRequiredNextToolInstruction:
          'If this appears in Claude.ai and the native Fluent card is not visibly mounted, call style_show_purchase_analysis_widget with renderInput now. Do not answer in prose only.',
        comparatorItemIds: preparation.comparatorItemIds,
        directComparatorItemIds: preparation.directComparatorItemIds,
        adjacentReferenceItemIds: preparation.adjacentReferenceItemIds,
        rejectedComparatorItemIds: preparation.rejectedComparatorItemIds,
        chatgptWidgetTool: 'style_show_purchase_analysis_widget',
        hostResponseMode: 'final_recommendation_ready',
        hostResponseInstruction:
          `${preparation.calibrationContext.readinessLevel === 'not_ready' ? 'Final candidate-focused recommendation is ready, but avoid wardrobe-fit claims until Style has stronger closet evidence. ' : 'Final recommendation is ready. '}${finalStateAuthorityInstruction} In ChatGPT/MCP Apps-style hosts, including Claude.ai MCP Apps-capable runs, call style_show_purchase_analysis_widget next with renderInput before giving prose; do not stop with only a text answer. In Claude visualizer-only, OpenClaw, Codex, and generic plain MCP clients, give the final buy/wait/skip answer now or call style_render_purchase_analysis for structured data; do not open the widget unless the host has proved MCP Apps ui:// mounting.`,
        nextTool: 'style_show_purchase_analysis_widget',
        nextRequiredTool: 'style_show_purchase_analysis_widget',
        recommendedNextSteps: [
          {
            host: 'mcp_apps',
            input: buildStylePurchaseRenderInput({
              candidate: preparation.candidate,
              stylistJudgment: effectiveStylistJudgment,
              visualEvidence,
            }),
            reason:
              'Required normal finish for ChatGPT/MCP Apps-style hosts, including Claude.ai MCP Apps-capable runs. Open the native card before prose.',
            tool: 'style_show_purchase_analysis_widget',
          },
          {
            host: 'visualizer_or_text_only',
            input: buildStylePurchaseRenderInput({
              candidate: preparation.candidate,
              stylistJudgment: effectiveStylistJudgment,
              visualEvidence,
            }),
            reason:
              'Use only when the host cannot mount MCP Apps ui:// resources. Do not use this in Claude.ai MCP Apps-capable runs.',
            tool: 'style_render_purchase_analysis',
          },
        ],
        renderInput: buildStylePurchaseRenderInput({
          candidate: preparation.candidate,
          stylistJudgment: effectiveStylistJudgment,
          visualEvidence,
        }),
        renderReady: true,
        source: visualEvidence.source ?? 'host_vision',
        status: 'visual_observations_accepted',
        visual_evidence: visualEvidence,
        stylist_judgment: effectiveStylistJudgment,
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
      const imageHints = await buildPurchaseAnalysisImageHints(style, analysis, preparation.candidate, {
        imageDeliverySecret: options.imageDeliverySecret,
        origin,
      });
      const viewModel = buildPurchaseAnalysisViewModel(analysis, {
        actionToolName: 'style_apply_purchase_analysis_action',
        comparatorItemIdMode: 'handles',
        imageHints,
        stylistJudgment: effectiveStylistJudgment,
      });
      const structuredContent = {
        ...buildPurchaseAnalysisStructuredContent(viewModel),
        ...receipt,
        calibrationContext: preparation.calibrationContext,
        experience: 'purchase_analysis_widget',
        hostResponseInstruction:
          `${preparation.calibrationContext.readinessLevel === 'not_ready' ? 'Native purchase-analysis card data is ready for a candidate-focused answer only; avoid wardrobe-fit claims until Style has stronger closet evidence. ' : 'Native purchase-analysis card data is ready. '}${finalStateAuthorityInstruction} In MCP Apps-style hosts, especially Claude.ai MCP Apps-capable runs, call style_show_purchase_analysis_widget next with renderInput; do not substitute style_render_purchase_analysis as the final presentation step. In visualizer-only or plain text hosts, answer from this structured result or call style_render_purchase_analysis with renderInput.`,
        hostResponseMode: 'native_widget_ready',
        widgetResourceUri: STYLE_PURCHASE_ANALYSIS_TEMPLATE_URI,
      };
      return toolResult(structuredContent, {
        meta: buildPurchaseAnalysisMetadata(viewModel),
        textData: {
          candidateName: receipt.candidateSummary.name,
          claudeAiRequiredNextToolInstruction: receipt.claudeAiRequiredNextToolInstruction,
          candidateObservationCount: visualEvidence.candidateObservations.length,
          comparatorItemIdsInspected: visualEvidence.comparatorItemIdsInspected,
          hostResponseInstruction: structuredContent.hostResponseInstruction,
          hostResponseMode: structuredContent.hostResponseMode,
          chatgptWidgetTool: receipt.chatgptWidgetTool,
          nextTool: receipt.nextTool,
          nextRequiredTool: receipt.nextRequiredTool,
          recommendedNextSteps: receipt.recommendedNextSteps,
          renderInput: buildStylePurchaseRenderInput({
            candidate: receipt.candidate,
            stylistJudgment: effectiveStylistJudgment,
            visualEvidence: receipt.visual_evidence,
          }),
          renderReady: receipt.renderReady,
          status: receipt.status,
          visualObservationId: receipt.visualObservationId,
          visionPacketId: receipt.visionPacketId,
          widgetResourceUri: STYLE_PURCHASE_ANALYSIS_TEMPLATE_URI,
        },
        structuredContent,
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
        candidate: stylePurchaseCandidateInputSchema,
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
          allowPurchasePageExtraction,
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
    withAppsSecurity({
      title: 'Render Purchase Analysis Data',
      description:
        'Return structured Fluent Style purchase-analysis presentation data after real host visual evidence exists. Pass stylist_judgment when the host agent has made the stylist call; Fluent will render that judgment instead of its conservative computed fallback. This is the visualizer-only/text-only fallback and compatibility data path, not the normal final presentation step for MCP Apps-capable Claude.ai runs. In MCP Apps-style hosts, call style_show_purchase_analysis_widget with the same candidate, visual_evidence, and stylist_judgment to open the native v22 purchase-analysis card.',
      inputSchema: {
        candidate: stylePurchaseCandidateInputSchema,
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
        stylistJudgment: stylePurchaseStylistJudgmentSchema.optional(),
        stylist_judgment: stylePurchaseStylistJudgmentSchema.optional(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
      _meta: {},
    }, styleReadSecuritySchemes),
    async (args) => {
      const authProps = requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      const { candidate } = args;
      const stylistJudgment = extractStylePurchaseStylistJudgmentArgument(args);
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
          allowPurchasePageExtraction,
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
      const imageHints = await buildPurchaseAnalysisImageHints(style, analysis, candidate, {
        imageDeliverySecret: options.imageDeliverySecret,
        origin,
      });
      const viewModel = buildPurchaseAnalysisViewModel(analysis, {
        actionToolName: 'style_apply_purchase_analysis_action',
        comparatorItemIdMode: 'handles',
        imageHints,
        stylistJudgment,
      });
      const calibrationContext = buildStylePurchaseCalibrationContext(analysis);
      const effectiveStylistJudgment = calibrationContext.readinessLevel === 'not_ready' ? null : stylistJudgment;
      const hostResponseInstruction = buildStylePurchaseFinalHostInstruction({
        calibrationContext,
        mode: 'render_ready',
      });
      const structuredContent = {
        ...buildPurchaseAnalysisStructuredContent(viewModel),
        calibrationContext,
        hostResponseInstruction,
        hostResponseMode: 'native_widget_ready',
        nextRequiredTool: 'style_show_purchase_analysis_widget',
        nextTool: 'style_show_purchase_analysis_widget',
        renderInput: buildStylePurchaseRenderInput({
          candidate,
          stylistJudgment: effectiveStylistJudgment,
          visualEvidence: acceptedVisualEvidence,
        }),
        widgetResourceUri: STYLE_PURCHASE_ANALYSIS_TEMPLATE_URI,
      };
      return toolResult(structuredContent, {
        meta: buildPurchaseAnalysisMetadata(viewModel),
        structuredContent,
        textData: {
          hostResponseInstruction,
          nextTool: 'style_show_purchase_analysis_widget',
          status: 'native_widget_ready',
          title: viewModel.item.name,
          verdict: viewModel.verdict,
          widgetResourceUri: STYLE_PURCHASE_ANALYSIS_TEMPLATE_URI,
        },
      });
    },
  );

  const stylePurchaseAnalysisWidgetInputSchema = {
    candidate: stylePurchaseCandidateInputSchema,
    visual_evidence: stylePurchaseVisualEvidenceInputSchema,
    stylistJudgment: stylePurchaseStylistJudgmentSchema.optional(),
    stylist_judgment: stylePurchaseStylistJudgmentSchema.optional(),
  };

  const renderStylePurchaseAnalysisWidgetResult = async (
    args: z.infer<z.ZodObject<typeof stylePurchaseAnalysisWidgetInputSchema>>,
    toolName: 'fluent_render_style_surface' | 'style_show_purchase_analysis_widget',
  ) => {
      const { candidate, visual_evidence } = args;
      const authProps = requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      const stylistJudgment = extractStylePurchaseStylistJudgmentArgument(args);
      const acceptedVisualEvidence = acceptedPurchaseVisualEvidenceOrUndefined(visual_evidence, {
        allowHostVisionFallback: true,
      });
      if (!acceptedVisualEvidence) {
        throw new Error(
          `${toolName} not_render_ready: concrete candidate image observations are required. Call style_prepare_purchase_analysis or style_render_purchase_analysis for non-widget not-ready output.`,
        );
      }
      const analysis = await style.analyzePurchase({
        candidate,
        visualEvidence: acceptedVisualEvidence,
      });
      if (analysis.evidenceQuality.candidateVisualGrounding !== 'host_visual_inspection') {
        throw new Error(
          `${toolName} not_render_ready: visual evidence did not produce host visual grounding. Call style_prepare_purchase_analysis or style_render_purchase_analysis for non-widget not-ready output.`,
        );
      }
      const imageHints = await buildPurchaseAnalysisImageHints(style, analysis, candidate, {
        imageDeliverySecret: options.imageDeliverySecret,
        origin,
      });
      const viewModel = buildPurchaseAnalysisViewModel(analysis, {
        actionToolName: 'style_apply_purchase_analysis_action',
        comparatorItemIdMode: 'handles',
        imageHints,
        stylistJudgment,
      });
      if (!authProps.scope?.includes(FLUENT_STYLE_WRITE_SCOPE)) {
        viewModel.actions = [];
      }
      const calibrationContext = buildStylePurchaseCalibrationContext(analysis);
      const structuredContent = {
        ...buildPurchaseAnalysisStructuredContent(viewModel),
        calibrationContext,
        hostResponseInstruction: buildStylePurchaseFinalHostInstruction({
          calibrationContext,
          mode: 'widget_rendered',
          verdict: viewModel.verdict,
        }),
        hostResponseMode: 'native_widget_rendered',
      };
      return {
        _meta: buildPurchaseAnalysisMetadata(viewModel),
        content: [
          {
            type: 'text' as const,
            text: `Showing the native purchase analysis for ${viewModel.item.name} with verdict "${viewModel.verdict}". Any prose must match the card verdict and avoid banned fallback phrasing such as lane, same role, Yes if, or No if.`,
          },
        ],
        structuredContent,
      };
  };

  server.registerTool(
    'fluent_render_style_closet_surface',
    withAppsSecurity({
      title: 'Show Fluent Style Closet',
      description:
        'Promoted render adapter for the Fluent Style closet manager MCP Apps surface. Reads owned Style items and returns the v1 closet widget plus compact structured fallback data. Pass the consolidated filter object to open the closet pre-narrowed to what the user asked about — for example filter.category "TOP" for shirts/tops, "SHOE" for shoes, or filter.color/filter.subcategory/filter.query for a more specific ask; the card opens focused on that filter and the user can broaden it in-card. Use filter.status "archived" to show archived items. This surface is for managing saved closet state, not purchase advice or stylist judgment.',
      inputSchema: {
        cursor: z.string().optional(),
        filter: styleClosetFilterSchema,
        limit: z.number().int().min(1).max(120).optional(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
      _meta: {
        ui: {
          csp: closetWidgetMeta.ui.csp,
          resourceUri: STYLE_CLOSET_TEMPLATE_URI,
        },
        'openai/outputTemplate': STYLE_CLOSET_TEMPLATE_URI,
        'openai/toolInvocation/invoked': 'Style closet ready.',
        'openai/toolInvocation/invoking': 'Opening style closet...',
        'openai/widgetAccessible': true,
      },
    }, styleClosetReadSecuritySchemes),
    async (args) => {
      requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      const structuredContent = await buildStyleClosetStructuredContent(style, {
        cursor: args.cursor,
        filter: args.filter as StyleClosetFilter | undefined,
        limit: args.limit,
      });
      // Reference-only / external photos (e.g. a pasted product URL) are cross-origin to the widget
      // iframe and Claude's COEP sandbox blocks them unless served through Fluent's signed same-origin
      // image route. Owned photos already carry a same-origin signed URL and pass through unchanged.
      const sameOriginImage = (value: string): boolean => {
        try {
          return new URL(value).origin === new URL(origin).origin;
        } catch {
          return false;
        }
      };
      await Promise.all(structuredContent.items.map(async (item) => {
        if (item.imageUrl && !sameOriginImage(item.imageUrl)) {
          const proxied = await buildWidgetImageUrl(item.imageUrl, { imageDeliverySecret: options.imageDeliverySecret, origin });
          item.imageUrl = proxied;
          item.hasImage = Boolean(proxied);
        }
        // The flip card's worn/fit photo needs the same treatment: a reference-only fit photo can be a
        // cross-origin sourceUrl that Claude's COEP iframe blocks. Proxy it, or null it if unproxiable.
        if (item.fitImageUrl && !sameOriginImage(item.fitImageUrl)) {
          item.fitImageUrl = await buildWidgetImageUrl(item.fitImageUrl, { imageDeliverySecret: options.imageDeliverySecret, origin });
        }
      }));
      const label = structuredContent.summary.filterLabel.toLowerCase();
      return {
        _meta: {
          openai: { outputTemplate: STYLE_CLOSET_TEMPLATE_URI },
          ui: { resourceUri: STYLE_CLOSET_TEMPLATE_URI },
          widgetResourceUri: STYLE_CLOSET_TEMPLATE_URI,
        },
        content: [
          {
            type: 'text' as const,
            text: `Your closet - ${structuredContent.summary.shownTotal} ${label} shown`,
          },
        ],
        structuredContent,
      };
    },
  );

  server.registerTool(
    'fluent_render_style_surface',
    withAppsSecurity({
      title: 'Legacy Style Purchase Card (deprecated)',
      description:
        'Legacy/compatibility render adapter only — do NOT use in the Phase 1/2 public Style purchase flow. A buy/skip/consider/wait verdict is PROSE from one fluent_get_context(domain="style", intent="purchase", candidate, amount) read; to show the user the owned items that compare to the candidate, render fluent_render_style_closet_surface with filter.item_ids set to those comparator ids — NEVER this tool. Retained only for older hosts still driving the deprecated evidence flow; if somehow used, answer from the structured fallback data in text.',
      inputSchema: stylePurchaseAnalysisWidgetInputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
      _meta: {
        ui: {
          resourceUri: STYLE_PURCHASE_ANALYSIS_TEMPLATE_URI,
        },
        'openai/outputTemplate': STYLE_PURCHASE_ANALYSIS_TEMPLATE_URI,
        'openai/toolInvocation/invoked': 'Style purchase analysis ready.',
        'openai/toolInvocation/invoking': 'Opening style purchase analysis...',
        'openai/widgetAccessible': true,
      },
    }, styleReadSecuritySchemes),
    async (args) => renderStylePurchaseAnalysisWidgetResult(args, 'fluent_render_style_surface'),
  );

  server.registerTool(
    'style_show_purchase_analysis_widget',
    withAppsSecurity({
      title: 'Show Purchase Analysis Widget',
      description:
        'Open the rich Fluent Style purchase-analysis widget in ChatGPT / MCP Apps-style hosts only after style_prepare_purchase_analysis has run and the host has actually inspected candidate images. Pass stylist_judgment with the host agent buy/skip/wait call so the card renders the agent-owned stylist decision. Do not call this with only a product URL, text metadata, image references, or uninspected visual evidence. Requires visual_evidence with candidateInspected true and concrete candidateObservations.',
      inputSchema: stylePurchaseAnalysisWidgetInputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
      _meta: {
        ui: {
          resourceUri: STYLE_PURCHASE_ANALYSIS_TEMPLATE_URI,
        },
        'openai/outputTemplate': STYLE_PURCHASE_ANALYSIS_TEMPLATE_URI,
        'openai/toolInvocation/invoked': 'Purchase analysis ready.',
        'openai/toolInvocation/invoking': 'Opening purchase analysis…',
        'openai/widgetAccessible': true,
      },
    }, styleReadSecuritySchemes),
    async (args) => renderStylePurchaseAnalysisWidgetResult(args, 'style_show_purchase_analysis_widget'),
  );

  server.registerResource(
    'style-onboarding-calibration',
    'fluent://style/onboarding-calibration',
    {
      title: 'Style Onboarding Calibration',
      description: 'Derived Style setup state, confidence breakdown, inferred taste, confirmed taste, and next best action.',
      mimeType: 'application/json',
      icons: iconFor(origin),
    },
    async (uri) => {
      requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      return jsonResource(uri.href, await style.getOnboardingCalibration());
    },
  );

  server.registerTool(
    'style_apply_purchase_analysis_action',
    withAppsSecurity({
      title: 'Apply Purchase Analysis Action',
      description:
        'Apply an explicit user-requested Style purchase analysis action from the widget, such as logging a purchased item into the Fluent closet.',
      inputSchema: {
        action_id: stylePurchaseAnalysisActionIdSchema,
        candidate: stylePurchaseCandidateInputSchema.describe('Purchase candidate returned by the rendered analysis widget or prior preparation step.'),
        ...provenanceInputSchema,
      },
      annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
      _meta: {
        'openai/widgetAccessible': true,
      },
    }, styleWriteSecuritySchemes, { uiVisibility: ['model', 'app'] }),
    async (args) => {
      const authProps = requireAnyScope([FLUENT_STYLE_WRITE_SCOPE, FLUENT_MEALS_WRITE_SCOPE]);
      const candidate = normalizeStylePurchaseCandidate(args.candidate);

      if (args.action_id !== 'log_purchase') {
        throw new Error(`Unsupported purchase analysis action: ${args.action_id}`);
      }

      const itemId = buildStylePurchaseLoggedItemId(candidate);
      const existing = await style.getItem(itemId);
      const item =
        existing ??
        (await style.upsertItem({
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
        }));

      let photoStatus: 'not_applicable' | 'stored' | 'partial_photo_failure' = 'not_applicable';
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
          photoStatus = 'stored';
        } catch {
          photoStatus = 'partial_photo_failure';
          // Best-effort only: a purchase log should still succeed even if the
          // remote product image cannot be fetched into Fluent storage yet.
        }
      }

      const created = await style.getItem(itemId);
      const ack = buildStyleMutationAck('style_item', itemId, 'style.purchase_logged', new Date().toISOString(), {
        category: created?.category ?? item.category,
        name: created?.name ?? item.name,
        photoCount: created?.photos.length ?? item.photos.length,
        photoStatus,
        status: existing ? 'already_exists' : 'created',
      });
      return toolResult(created ?? item, {
        structuredContent: ack,
        textData: ack,
      });
    },
  );

  const visualBundleInputSchema: Record<string, z.ZodTypeAny> = allowPurchasePageExtraction
    ? {
        candidate: z.any().optional(),
        delivery_mode: styleVisualBundleDeliveryModeSchema,
        include_inline_images: z.boolean().optional(),
        include_comparators: z.boolean().optional(),
        item_ids: z.array(z.string()).optional(),
        max_inline_images: z.number().int().positive().max(STYLE_VISUAL_BUNDLE_MAX_INLINE_IMAGES).optional(),
        max_images: z.number().int().positive().max(12).optional(),
      }
    : {
        include_inline_images: z.boolean().optional(),
        include_comparators: z.boolean().optional(),
      };
  type StyleVisualBundleToolArgs = {
    candidate?: unknown;
    delivery_mode?: z.infer<typeof styleVisualBundleDeliveryModeSchema>;
    include_inline_images?: boolean;
    include_comparators?: boolean;
    item_ids?: string[];
    max_images?: number;
    max_inline_images?: number;
  };

  server.registerTool(
    'style_get_visual_bundle',
    {
      title: 'Get Style Visual Bundle',
      description: allowPurchasePageExtraction
        ? 'Return a curated visual packet for broad stylist tasks outside the canonical staged purchase flow, including authenticated image routes, optional short-lived signed fallbacks, opt-in inline MCP image content, and compact closet comparator context. This tool does not extract arbitrary product pages; for product-link purchase decisions, use style_extract_purchase_page_evidence where exposed, then style_get_purchase_vision_packet followed by style_submit_purchase_visual_observations.'
        : 'Return a curated visual packet for broad stylist tasks outside the canonical staged purchase flow, including authenticated image routes, optional short-lived signed fallbacks, opt-in inline MCP image content, and compact closet comparator context. This full-MCP helper is not part of the curated ChatGPT submitted profile. It does not extract arbitrary product pages; purchase decisions should use style_prepare_purchase_analysis, direct product images or uploaded photos, style_get_purchase_vision_packet, and style_submit_purchase_visual_observations.',
      inputSchema: visualBundleInputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({
      candidate,
      delivery_mode,
      include_inline_images,
      include_comparators,
      item_ids,
      max_images,
      max_inline_images,
    }: StyleVisualBundleToolArgs) => {
      requireAnyScope([FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE]);
      const bundle = await style.getVisualBundle({
        candidate,
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
