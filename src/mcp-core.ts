import { productEnrichmentSchema } from './domains/style/product-reference';
import {
  assertStyleImageDataUrl,
  isStyleCatalogMediaUnusableError,
  isStyleImageInputError,
  routeStyleImageUrl,
  STYLE_UPLOADED_PHOTO_DATA_URL_STEP,
  styleImageNotAttachedReason,
  withNothingSavedNote,
  styleUploadedPhotoDataUrlStep,
  unusableStyleImageReason,
} from './domains/style/media';
import { photoLibraryActionSchema } from './domains/style/photo-library';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { accountProfileSchema, buildAccountProfile, FLUENT_ACCOUNT_PROFILE_TOOL } from './account-profile';
import { buildCurrentGroceryWidgetMetadata } from './mcp-meals';
import type { CurrentGroceryListRecord } from './domains/meals/types';
import {
  buildMutationProvenance,
  FLUENT_HEALTH_READ_SCOPE,
  FLUENT_HEALTH_WRITE_SCOPE,
  FLUENT_MEALS_READ_SCOPE,
  FLUENT_MEALS_WRITE_SCOPE,
  FLUENT_STYLE_READ_SCOPE,
  FLUENT_STYLE_WRITE_SCOPE,
  getFluentAuthProps,
  requireAnyScope,
  requireScopes,
} from './auth';
import type { BudgetCategory, BudgetsService } from './domains/budgets/service';
import {
  BUDGETS_ENVELOPE_SETUP_TEMPLATE_URI,
  buildBudgetsEnvelopeSetupWidgetMeta,
  getBudgetsEnvelopeSetupWidgetHtml,
} from './domains/budgets/envelope-setup';
import { recipeDocumentSchema, recipeIngredientSchema, recipeInstructionSchema } from './domains/meals/recipe-document';
import { summarizeDomainEvents, type MealsService } from './domains/meals/service';
import { STYLE_CLOSET_TEMPLATE_URI, type StyleClosetStructuredContent } from './domains/style/closet-manager';
import { STYLE_ITEM_FIT_FIELDS, type StyleDuplicateCandidate, type StyleDuplicateCandidateSignals, type StyleService } from './domains/style/service';
import {
  FLUENT_GUIDANCE_RESOURCE_URIS,
} from './contract';
import { getFluentGuidanceDocument } from './fluent-guidance';
import { FluentCoreService, resolveHostFamily, type FluentAccountStatus } from './fluent-core';
import { iconFor, jsonResource, provenanceInputSchema, readViewSchema, toolResult, writeResponseModeSchema } from './mcp-shared';
import { createFetchTimeoutSignal, fetchStyleVisualBundleImage } from './mcp-style';
import type { StyleClosetSurfaceBuilder } from './mcp-style';
import { enforcePublicWriteRateLimit, type FluentRateLimitBinding } from './rate-limits';
import {
  getFluentVNextContext,
  getFluentVNextItem,
  getFluentVNextMediaBundle,
  getFluentVNextPurchaseContext,
  getFluentVNextSharedProfile,
  listFluentVNextEvidence,
  listFluentVNextItemsPage,
  type FluentVNextReadServices,
} from './vnext-read-layer';
import {
  archiveFluentVNextItem,
  applyFluentVNextGroceryListChange,
  applyFluentVNextGroceryShoppingResult,
  logFluentBudgetSpend,
  createFluentStyleItem,
  refreshFluentStyleItemProfile,
  recordFluentVNextRecipeFeedback,
  recordFluentVNextEvent,
  saveFluentVNextMealPlan,
  saveFluentVNextRecipe,
  setFluentBudgetEnvelope,
  setFluentStyleItemImage,
  styleImagePhotoId,
  updateFluentStyleItemPatch,
  updateFluentVNextSharedProfilePatch,
  updateFluentVNextRecipePatch,
  upsertFluentVNextItem,
  type FluentVNextWriteAck,
  type FluentVNextWriteServices,
} from './vnext-write-layer';
import { buildVNextModelText, toVNextModelVisibleValue } from './vnext-model-text';

const fluentVNextDomainSchema = z.enum(['shared', 'meals', 'style', 'wellbeing', 'finance']).describe(
  'Fluent domain to read. Use meals for food, recipes, groceries, or pantry state; style for closet or purchase evidence; shared for cross-domain profile facts. Wellbeing and finance are reserved for broader profiles.',
);
const fluentVNextArchiveDomainSchema = z.enum(['meals', 'style']).describe(
  'Public Fluent domain containing the saved item to archive. Only Meals and Style items are archivable in the current contract.',
);
const fluentVNextIntentSchema = z.enum(['readiness', 'setup', 'planning', 'today', 'closet', 'purchase', 'budget_signal', 'unknown']).describe(
  'Why the host model is reading context. This helps Fluent choose compact relevant context; it does not make Fluent perform planning or judgment.',
);
const fluentVNextItemTypeSchema = z.enum(['meal_plan', 'recipe', 'grocery_list', 'inventory_item', 'style_item', 'goal', 'budget_signal']).describe(
  'Optional item class to narrow the read. For meals use meal_plan, recipe, grocery_list, or inventory_item. For style use style_item.',
);
const fluentVNextItemQuerySchema = z.string().min(1).max(120).describe(
  'Optional saved-item search text. For Meals recipes, pass a recipe title or stable recipe ID before fetching the exact recipe with fluent_get_item.',
);
const fluentVNextSurfaceSchema = z.literal('meals_grocery_list').describe(
  'Candidate app surface to render. Only meals_grocery_list is implemented in the full runtime, and it is intentionally omitted from the curated public profile until host proof passes.',
);
const fluentVNextMediaBundlePurposeSchema = z.enum(['saved_item_review', 'style_purchase_advice', 'visual_evidence_check', 'catalog_repair_source']).describe(
  'Reason media is being fetched. Use style_purchase_advice for shopping/style advice, saved_item_review for an existing saved item, visual_evidence_check when checking what images are available, or catalog_repair_source to retrieve only retained source evidence for an ordinary Catalog repair.',
);
const fluentVNextMediaBundleDeliveryModeSchema = z.enum(['authenticated_only', 'authenticated_with_signed_fallback']).describe(
  'How media references should be delivered. authenticated_with_signed_fallback is the normal choice for host inspection; authenticated_only avoids signed fallback URLs.',
);
const fluentVNextMediaCandidateSchema = z.object({
  brand: z.string().optional().describe('Optional product or item brand named by the user or saved item.'),
  description: z.string().optional().describe('Optional short item description supplied by the user or saved item.'),
  image_urls: z.array(z.string().url()).optional().describe('Optional image URLs the host can inspect. Do not pass arbitrary webpage URLs here.'),
  price_text: z.string().optional().describe('Optional exact listing price text the host saw, for example "$120" or "sale $89". Fluent validates only the cited text magnitude, not live page truth.'),
  retailer: z.string().optional().describe('Optional retailer or source name. Fluent will not browse or operate the retailer.'),
  title: z.string().optional().describe('Optional product or saved-item title.'),
  url: z.string().url().optional().describe('Optional direct product or item URL for provenance only. Fluent will not scrape it.'),
}).strict().describe(
  'Optional structured candidate metadata for the item under visual review. Prefer subject or item_ids for saved Fluent items; use candidate only when the user provides item details in the conversation.',
);
const fluentVNextPurchaseCandidateSchema = z.object({
  category: z.string().optional().describe('Optional candidate category as supplied by the host, for example outerwear. Fluent resolves it before claiming category completeness.'),
  image_urls: z.array(z.string().url()).optional().describe('Optional direct candidate image URLs inspected by the host. Fluent does not sign retailer URLs or inspect candidate pixels.'),
  name: z.string().min(1).describe('Candidate product or item name supplied by the host.'),
  price_text: z.string().optional().describe('Exact listing price text the host saw. For Style purchase budget arithmetic, pass amount only when it matches the number in this text, or falls within its cited range.'),
  subcategory: z.string().optional().describe('Optional candidate subcategory, for example Harrington jacket.'),
}).strict().describe(
  'Optional candidate metadata for a one-read Style purchase context. Used only with domain="style" and intent="purchase"; Fluent supplies owned-category evidence, not a verdict.',
);
const fluentVNextBudgetCategorySchema = z.enum(['style-clothing', 'meals-groceries']).describe(
  'Budget envelope category. Use style-clothing only for clothing/style purchases and meals-groceries only for grocery spend. Do not use this for dashboards, Plaid imports, or retailer automation.',
);
const fluentStyleClosetWriteResponseModeSchema = z.enum(['read_after_write', 'validated', 'ack', 'full']).optional();
const fluentStyleItemProfileSourceSchema = z.enum([
  'user',
  'user_correction',
  'tag_ocr',
  'host_fit_vision',
  'host_vision',
  'host_visual_inspection',
  'url_scrape',
  'host_text',
  'inferred',
  'heuristic_bootstrap',
]).optional();
const fluentStyleFitVerdictSchema = z.enum(['true_to_size', 'runs_small', 'runs_large']);
const fluentStyleItemFitAssessmentSchema = z.object({
  fitObservations: z.array(z.string()).optional(),
  fitVerdict: fluentStyleFitVerdictSchema.nullable().optional(),
  has_fit_image: z.boolean().optional().describe('Set true only when the host actually inspected a worn/fit image for this fit assessment.'),
  lengthNote: z.string().nullable().optional(),
  ownedSize: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  source: z.enum(['host_fit_vision', 'user', 'user_correction']).optional().describe('Source for fit fields. Omit to inherit a top-level user/user_correction source; otherwise defaults to host_fit_vision.'),
}).strict().optional().describe(
  'Sparse fit-assessment fields. Fit fields can ONLY be written here; fit fields inside profile are ignored to prevent product/display re-vision from clobbering fit data.',
);
const fluentStyleItemFeedbackSchema = z.object({
  avoid_for: z.array(z.string().trim().min(1).max(120)).max(12).optional().describe('Contexts the user says this exact item should not be recommended for.'),
  note: z.string().trim().min(1).max(500).nullable().optional().describe('Optional concise user-stated feedback about this exact item.'),
  signals: z.array(z.enum(['comfortable', 'hard_to_style', 'too_formal'])).max(3).optional(),
  wear_understanding: z.enum(['recently_worn', 'rarely_worn', 'unknown']).optional().describe('Use only when the user states or corrects wear recency; never infer unworn from silence.'),
  works_for: z.array(z.string().trim().min(1).max(120)).max(12).optional().describe('Contexts the user says this exact item works especially well for.'),
}).strict().optional().describe('Typed natural-language feedback for one exact saved Style item. User-stated feedback outranks inferred signals.');
const fluentStyleItemPatchSchema = z.object({
  brand: z.string().nullable().optional(),
  care: z.string().nullable().optional().describe('Legacy field: rejected without saving any part of the patch. Use product_enrichment with an empty patch for attributed care facts.'),
  category: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  formality: z.number().nullable().optional(),
  mode: z.literal('merge').optional().describe('Legacy merge marker accepted for cached clients. Optional; sparse patch behavior is always merge.'),
  name: z.string().nullable().optional(),
  notes: z.string().nullable().optional().describe('Legacy field: not supported by this patch; the entire patch is rejected without saving.'),
  size: z.string().nullable().optional(),
  status: z.enum(['active']).optional().describe('Set to "active" to restore (un-archive) an item to the active closet. Only "active" is accepted here; archiving must use fluent_archive_item with an explicit disposition.'),
  subcategory: z.string().nullable().optional(),
  tags: z.array(z.string()).optional().describe('Legacy field: rejected without saving any part of the patch. Use fluent_refresh_style_item_profile for tags.'),
  use_case: z.array(z.string()).optional().describe('Legacy field: rejected without saving any part of the patch. Use fluent_refresh_style_item_profile for styling descriptors.'),
}).strict().describe('Sparse Style closet item patch. Omitted fields are not changed. Unsupported fields reject the entire patch before saving. Set status:"active" to restore an archived item.');
const fluentStyleImageTypeSchema = z.enum(['primary', 'alternate', 'fit']).optional().describe(
  'Image role to store: primary/alternate are clean catalog/product display photos for the closet tile; fit is a worn/on-model photo for fit assessment.',
);
const fluentStyleImageOriginSchema = z.enum(['user_source', 'host_generated']).optional().describe(
  'Classify inspected source media as user_source and model-created display media as host_generated. Generated media is presentation-only and never garment evidence.',
);
const openAiFileParamSchema = z.object({
  download_url: z.string().min(1).max(16_384).describe('Temporary OpenAI-hosted download URL supplied by the ChatGPT file-parameter handoff. Fluent validates it server-side and copies only from approved OpenAI HTTPS file hosts.'),
  file_id: z.string().min(1).describe('Stable OpenAI file identifier supplied by the ChatGPT file-parameter handoff.'),
  mime_type: z.string().min(1).optional().describe('Optional MIME type supplied by ChatGPT.'),
  file_name: z.string().min(1).optional().describe('Optional file name supplied by ChatGPT.'),
}).strict().describe(
  'ChatGPT-native file input. ChatGPT supplies download_url and file_id for an uploaded, selected, or generated file; Fluent downloads the bytes once into owned media and never persists the temporary URL.',
);
const nestedProvenanceSchema = z.object({
  confidence: z.number().nullable().optional(),
  sessionId: z.string().nullable().optional(),
  session_id: z.string().nullable().optional(),
  sourceAgent: z.string().nullable().optional(),
  source_agent: z.string().nullable().optional(),
  sourceSkill: z.string().nullable().optional(),
  source_skill: z.string().nullable().optional(),
  sourceType: z.string().nullable().optional(),
  source_type: z.string().nullable().optional(),
}).passthrough().optional();
const fluentVNextEvidenceSubjectSchema = z.string().describe(
  'Optional evidence target. For meals, pass a saved recipe ID, exact saved recipe title, grocery-list ID, or meal-memory subject returned by Fluent. For style, pass a saved style item ID returned by fluent_list_items or fluent_get_item. Omit when the user asks for general evidence gaps.',
);
const fluentVNextEvidenceClaimSchema = z.string().describe(
  'Optional natural-language claim to check against Fluent evidence, for example "user dislikes mushrooms" or "this jacket matches saved closet context". Use only when the user asks to verify a specific claim.',
);
const fluentVNextCalibrationSignalSchema = z.object({
  corrected_value: z.string().optional().describe('Corrected value when the user is correcting an earlier signal.'),
  kind: z.enum(['planning_grocery_day', 'disliked_food', 'preferred_food', 'weeknight_time_limit', 'pantry_check_policy', 'routine_note']).describe(
    'Kind of user-approved signal being saved.',
  ),
  note: z.string().optional().describe('Short provenance note for why this signal is being saved.'),
  status: z.enum(['confirmed', 'corrected', 'rejected']).describe('User-approved signal status. Do not write inferred signals.'),
  value: z.string().describe('User-confirmed signal value.'),
}).strict().describe('One explicit user-approved Meals calibration signal.');
const fluentHostFamilySchema = z.enum(['chatgpt_app', 'claude', 'openclaw', 'codex', 'generic_mcp', 'unknown']);
const fluentVNextPantryItemPatchSchema = z.object({
  item_name: z.string().describe('Pantry or inventory item name explicitly confirmed by the user.'),
  note: z.string().optional().describe('Short confirmation or at-home-check note.'),
  status: z.enum(['confirmed', 'needs_confirmation', 'representative']).optional().describe(
    'Pantry item status. Use representative only for non-live acceptance fixtures.',
  ),
}).strict().describe('One explicit pantry or inventory calibration item.');
const fluentVNextPreferencePatchSchema = z.object({
  avoids: z.array(z.string()).optional().describe('Explicit foods, ingredients, garments, fits, or situations the user wants Fluent to remember avoiding.'),
  budget_notes: z.string().optional().describe('Optional user-confirmed budget or shopping constraint note.'),
  favorites: z.array(z.string()).optional().describe('Explicit favorites or preferred repeat choices the user wants Fluent to remember.'),
  grocery_preference: z.string().optional().describe('Optional user-confirmed grocery-list preference, such as delivery, pickup, in-store, or pantry-first.'),
  hard_avoids: z.array(z.string()).optional().describe('Explicit Meals hard avoids confirmed by the user.'),
  normal_weeknight_cooking_time_minutes: z.number().int().min(0).max(240).optional().describe(
    'User-confirmed normal weeknight cooking time limit in minutes.',
  ),
  planning_grocery_day: z.string().optional().describe('User-confirmed normal grocery planning or shopping day.'),
  routine_notes: z.string().optional().describe('Optional user-confirmed routine note relevant to planning.'),
  shopping_pantry_check_policy: z.string().optional().describe('User-confirmed policy for stale pantry or check-at-home items before planning.'),
  weeknight_time_limit_minutes: z.number().int().min(0).max(240).optional().describe(
    'User-confirmed weeknight cooking time limit in minutes.',
  ),
}).strict().describe('Sparse preference patch containing only explicit user-confirmed facts.');
const fluentVNextCalibrationResponsePatchSchema = z.object({
  answer: z.string().optional().describe('User-confirmed answer text to the calibration question.'),
  pantry_items: z.array(fluentVNextPantryItemPatchSchema).optional().describe('Explicit pantry or inventory calibration items.'),
  preference_patch: fluentVNextPreferencePatchSchema.optional().describe('Sparse preference facts explicitly confirmed by the user.'),
  question_id: z.string().optional().describe('Stable calibration question ID when one is available.'),
  signals: z.array(fluentVNextCalibrationSignalSchema).optional().describe('Explicit user-approved calibration signals.'),
  starter_preference_text: z.string().optional().describe('User-facing preference text captured during setup or correction.'),
}).strict().describe('Meals or domain calibration response to persist after explicit user approval.');
const fluentVNextSharedProfileFactKindSchema = z.enum([
  'allergy',
  'hard_avoid',
  'dietary_pattern',
  'avoid',
  'favorite',
  'planning_grocery_day',
  'weeknight_time_limit_minutes',
  'normal_weeknight_cooking_time_minutes',
  'shopping_pantry_check_policy',
  'routine_note',
  'timezone',
  'display_name',
]).describe(
  'The single explicit shared or Meals fact the user approved saving. Use meals kinds for food/planning memory and timezone or display_name for shared.',
);
const fluentVNextSharedProfilePatchSchema = z.object({
  kind: fluentVNextSharedProfileFactKindSchema,
  note: z.string().optional().describe('Optional short provenance note, preferably in the user\'s words. Do not include transcripts or hidden reasoning.'),
  pattern: z.enum(['vegetarian', 'vegan', 'pescatarian']).optional().describe(
    'Optional for kind="dietary_pattern": canonical dietary identity enum. Set it when capturing a CONFIRMED standing vegetarian, vegan, or pescatarian identity, even if the user\'s phrasing is not a literal label; do NOT set it for hedged, leaning, mostly, trying, flexitarian, negated, or no-longer statements.',
  ),
  question_id: z.string().optional().describe('Optional stable calibration question ID when this fact answers a Fluent question.'),
  status: z.enum(['confirmed', 'corrected', 'rejected']).describe(
    'User-approved status for this fact. Use rejected only to save that a proposed fact should not be treated as true.',
  ),
  value: z.string().describe('The user-confirmed shared or Meals value, such as "Sunday", "30", "mushrooms", or "America/Toronto".'),
}).strict().describe(
  'One explicit user-approved Fluent memory fact. Required shape: patch.kind, patch.value, and patch.status. Do not send inferred facts, plans, transcripts, or arbitrary JSON.',
);
const fluentVNextStyleCoveragePatchSchema = z.object({
  kind: z.literal('closet_coverage').describe('The only public Style profile fact available through this tool.'),
  note: z.string().optional().describe('Optional short provenance note, preferably in the user\'s words. Do not include transcripts or hidden reasoning.'),
  status: z.enum(['confirmed', 'corrected']).describe('Whether the user explicitly confirmed or corrected the saved Closet coverage.'),
  value: z.enum(['representative', 'partial', 'out_of_date', 'unknown']).describe('The exact user-confirmed coverage of the current saved Fluent closet.'),
}).strict().describe('One explicit user-confirmed Style closet-coverage fact.');
const fluentVNextSharedProfileExactInputSchema = z.discriminatedUnion('domain', [
  z.object({
    domain: z.literal('style').describe('Style coverage confirmation for the current saved Fluent closet.'),
    patch: fluentVNextStyleCoveragePatchSchema,
    response_mode: writeResponseModeSchema,
    ...provenanceInputSchema,
  }).strict(),
  z.object({
    domain: z.enum(['shared', 'meals']).describe('Shared or Meals domain for this explicit public memory write.'),
    patch: fluentVNextSharedProfilePatchSchema,
    response_mode: writeResponseModeSchema,
    ...provenanceInputSchema,
  }).strict(),
]).describe('Exact domain-discriminated public Fluent profile write. Style exposes only closet_coverage; arbitrary Style profile patches are not accepted.');

// The cached ChatGPT 1.0.0 registration requires patch.pattern and sends null for every kind other
// than dietary_pattern. null carries no fact, so it is treated as omitted.
function withoutNullSharedProfilePattern(input: unknown): unknown {
  const record = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : null;
  const patch = record?.patch && typeof record.patch === 'object' && !Array.isArray(record.patch)
    ? record.patch as Record<string, unknown>
    : null;
  if (!record || !patch || patch.pattern !== null) return input;
  const { pattern: _nullPattern, ...rest } = patch;
  return { ...record, patch: rest };
}

// MCP SDK 1.26 lists a top-level union as an EMPTY object schema in tools/list, so hosts saw no
// parameters. Expose one flat object (every field any branch accepts) on the wire and enforce the
// exact domain-discriminated union in a refinement, so validation stays as strict as before.
const fluentVNextSharedProfileToolInputSchema = z.object({
  domain: z.enum(['shared', 'meals', 'style']).describe(
    'Domain for this explicit profile write. Use shared only for timezone or display_name; meals for confirmed food, grocery, routine, and meal-planning facts; style only for kind="closet_coverage".',
  ),
  patch: z.object({
    kind: z.enum([...fluentVNextSharedProfileFactKindSchema.options, 'closet_coverage']).describe(
      'The single explicit fact the user approved saving. Meals kinds for food/planning memory; timezone or display_name with domain="shared"; closet_coverage only with domain="style".',
    ),
    note: z.string().optional().describe('Optional short provenance note, preferably in the user\'s words. Do not include transcripts or hidden reasoning.'),
    pattern: z.enum(['vegetarian', 'vegan', 'pescatarian']).nullable().optional().describe(
      'Only for kind="dietary_pattern": canonical dietary identity for a CONFIRMED standing vegetarian, vegan, or pescatarian identity; do NOT set it for hedged, leaning, mostly, trying, flexitarian, negated, or no-longer statements. Omit it (or send null) for every other kind.',
    ),
    question_id: z.string().optional().describe('Optional stable calibration question ID when this fact answers a Fluent question.'),
    status: z.enum(['confirmed', 'corrected', 'rejected']).describe(
      'User-approved status for this fact. Use rejected only to save that a proposed fact should not be treated as true. closet_coverage accepts only confirmed or corrected.',
    ),
    value: z.string().describe(
      'The user-confirmed value, such as "Sunday", "30", "mushrooms", or "America/Toronto". For closet_coverage use exactly representative, partial, out_of_date, or unknown.',
    ),
  }).strict().describe(
    'One explicit user-approved Fluent memory fact: patch.kind, patch.value, and patch.status. Do not send inferred facts, plans, transcripts, or arbitrary JSON.',
  ),
  response_mode: writeResponseModeSchema,
  ...provenanceInputSchema,
}).strict().superRefine((value, context) => {
  const exact = fluentVNextSharedProfileExactInputSchema.safeParse(withoutNullSharedProfilePattern(value));
  if (!exact.success) {
    for (const issue of exact.error.issues) {
      context.addIssue({ code: 'custom', message: issue.message, path: issue.path });
    }
  }
}).describe('Exact domain-discriminated public Fluent profile write. Style exposes only closet_coverage; arbitrary Style profile patches are not accepted.');
const fluentVNextRecipeWriteApprovalSchema = z.literal('explicit_user_approved').describe(
  'Required marker that the user explicitly approved this Fluent write in the current conversation. Do not send this for inferred, tentative, or assistant-only changes.',
);
const fluentVNextIsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('ISO calendar date formatted exactly as YYYY-MM-DD.');
const fluentVNextMealPlanEntrySchema = z.object({
  date: fluentVNextIsoDateSchema.optional().describe('Planned meal date, formatted exactly as YYYY-MM-DD.'),
  day_label: z.string().optional().describe('Optional user-facing day label, such as Monday.'),
  instructions: z.array(z.string()).optional().describe('Optional user-approved instructions snapshot for this meal.'),
  leftovers_expected: z.boolean().optional().describe('Whether leftovers are expected from this meal.'),
  meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).describe('Meal slot for this plan entry.'),
  notes: z.record(z.string(), z.unknown()).optional().describe('Optional bounded notes for this plan entry. Do not include hidden reasoning.'),
  prep_minutes: z.number().int().min(0).max(1440).optional().describe('Optional prep minutes when supplied or user-approved.'),
  recipe_id: z.string().optional().describe('Optional saved Fluent recipe ID returned by fluent_list_items/fluent_get_item.'),
  recipe_name: z.string().min(1).describe('Recipe or meal name selected by the user and host model.'),
  selection_status: z.enum(['planned', 'candidate', 'approved', 'substituted']).optional().describe('Selection status for this meal slot.'),
  serves: z.number().positive().optional().describe('Optional serving count when supplied or approved.'),
  status: z.enum(['planned', 'approved', 'cooked', 'skipped']).optional().describe('Lifecycle status for this entry.'),
  total_minutes: z.number().int().min(0).max(1440).optional().describe('Optional total minutes when supplied or user-approved.'),
}).strict().describe('One meal slot in an approved host-authored meal plan.');
const fluentVNextMealPlanGroceryItemSchema = z.object({
  display_name: z.string().min(1).describe('Grocery item name derived by the host model from the approved meal plan.'),
  notes: z.string().optional().describe('Optional user-visible note, such as the meals this item supports.'),
  quantity: z.number().positive().optional().describe('Optional approved or recipe-derived quantity.'),
  unit: z.string().min(1).optional().describe('Optional approved or recipe-derived unit.'),
}).strict().describe('One grocery item derived from the approved meal plan.');
const fluentVNextMealPlanSchema = z.object({
  entries: z.array(fluentVNextMealPlanEntrySchema).min(1).max(28).describe('Approved meal-plan entries. Keep this to the user-approved planning horizon.'),
  generated_at: z.string().optional().describe('Optional ISO timestamp for when the host drafted the plan.'),
  grocery_items: z.array(fluentVNextMealPlanGroceryItemSchema).min(1).max(100).optional().describe('Host-derived groceries for the approved plan. Include these whenever any plan entry is not linked to a saved Fluent recipe.'),
  id: z.string().optional().describe('Optional stable meal-plan ID. Omit to let Fluent create one.'),
  profile_owner: z.string().optional().describe('Optional owner label when the user supplied it.'),
  requirements: z.record(z.string(), z.unknown()).optional().describe('Optional user-facing requirements and constraints used for the plan.'),
  source_snapshot: z.record(z.string(), z.unknown()).optional().describe('Optional compact source snapshot. Do not include hidden reasoning, raw logs, credentials, or transcripts.'),
  status: z.enum(['approved', 'active', 'draft']).optional().describe('Plan lifecycle status. Use approved or active only after explicit user approval.'),
  summary: z.record(z.string(), z.unknown()).optional().describe('Optional compact plan summary for future readback.'),
  week_end: fluentVNextIsoDateSchema.optional().describe('Optional week end date formatted exactly as YYYY-MM-DD.'),
  week_start: fluentVNextIsoDateSchema.describe('Start date for the planned week, formatted exactly as YYYY-MM-DD.'),
}).strict().describe(
  'An approved host-authored Meals plan. Fluent stores the plan and proof; the host model owns planning judgment. Do not use for tentative drafts or hidden generated plans.',
);
const fluentVNextRecipePatchSchema = z.object({
  active_time: z.number().int().min(0).optional().describe('Updated active cooking minutes.'),
  cost_per_serving_cad: z.number().min(0).optional().describe('Updated estimated cost per serving in CAD.'),
  ingredients: z.array(recipeIngredientSchema).min(1).optional().describe('Complete replacement ingredients list.'),
  instructions: z.array(recipeInstructionSchema).min(1).optional().describe('Complete replacement instruction list.'),
  kid_friendly: z.boolean().optional().describe('Whether this saved recipe is kid-friendly.'),
  macros: z.object({
    calories: z.number(),
    fiber_g: z.number(),
    protein_g: z.number(),
    sodium_mg: z.number(),
  }).optional().describe('Updated nutrition estimate for the saved recipe.'),
  meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional().describe('Updated recipe meal type.'),
  mise_en_place: z.array(z.string()).optional().describe('Complete replacement prep checklist.'),
  mode: z.literal('merge').optional().describe('Legacy merge marker accepted for cached clients. Optional; sparse patch behavior is always merge.'),
  name: z.string().min(1).optional().describe('Updated recipe name.'),
  prep_notes: z.string().nullable().optional().describe('Updated prep notes, or null to clear them.'),
  reheat_guidance: z.string().nullable().optional().describe('Updated reheating guidance, or null to clear it.'),
  serving_notes: z.string().nullable().optional().describe('Updated serving notes, or null to clear them.'),
  servings: z.number().int().min(1).optional().describe('Updated number of servings.'),
  source_url: z.string().url().optional().describe('Optional source URL for provenance only. Fluent does not browse it.'),
  status: z.enum(['active', 'draft', 'retired', 'archived']).optional().describe('Updated saved-recipe lifecycle status.'),
  tags: z.array(z.string()).optional().describe('Complete replacement tags for this saved recipe.'),
  total_time: z.number().int().min(1).optional().describe('Updated total cooking minutes.'),
}).strict().describe(
  'Sparse patch for an existing saved recipe. It cannot include id or recipe_id; Fluent applies it only to the recipe_id argument.',
);
const fluentVNextRecipeFeedbackSchema = z.object({
  date: z.string().optional().describe('Optional ISO date for when the recipe was made or reviewed.'),
  difficulty: z.enum(['good', 'okay', 'bad']).optional().describe('How hard the recipe felt to execute.'),
  family_acceptance: z.enum(['good', 'okay', 'bad']).optional().describe('How well the recipe landed with the household.'),
  meal_plan_entry_id: z.string().optional().describe('Optional meal plan entry ID, when feedback came from a plan.'),
  meal_plan_id: z.string().optional().describe('Optional meal plan ID, when feedback came from a plan.'),
  notes: z.string().optional().describe('Short user-confirmed feedback notes. Do not save inferred preferences here.'),
  repeat_again: z.boolean().optional().describe('Whether the user wants this recipe repeated.'),
  submitted_by: z.string().optional().describe('Optional person or role that supplied the feedback.'),
  taste: z.enum(['good', 'okay', 'bad']).optional().describe('Taste feedback for this recipe.'),
  time_reality: z.enum(['good', 'okay', 'bad']).optional().describe('Whether the actual timing matched expectations.'),
}).strict().describe(
  'Recipe-specific feedback only. This does not create global preferences, hard avoids, allergies, grocery state, or shopping actions.',
);
const fluentVNextGroceryListAddItemChangeSchema = z.object({
  kind: z.literal('add_item').describe('Add a user-approved manual item to the current living grocery list.'),
  display_name: z.string().min(1).optional().describe('User-approved grocery item name to add. Do not invent brands, quantities, or stores.'),
  displayName: z.string().min(1).optional().describe('Camel-case alias for display_name accepted for host ergonomics.'),
  name: z.string().min(1).optional().describe('Alias for display_name. Prefer display_name, but accept name from hosts that use generic item naming.'),
  item: z.object({
    display_name: z.string().min(1).optional().describe('Wrapped user-approved grocery item name. Prefer top-level display_name when possible.'),
    displayName: z.string().min(1).optional().describe('Wrapped camel-case alias for display_name.'),
    name: z.string().min(1).optional().describe('Wrapped alias for display_name.'),
    notes: z.string().optional().describe('Wrapped optional user-approved note.'),
    quantity: z.number().positive().optional().describe('Wrapped optional user-approved quantity.'),
    target_window: z.string().optional().describe('Wrapped optional target window.'),
    unit: z.string().optional().describe('Wrapped optional user-approved unit.'),
  }).strict().optional().describe('Optional host wrapper for add-item payloads. Fluent still treats this as one manual grocery item.'),
  notes: z.string().optional().describe('Optional user-approved note for this grocery item.'),
  quantity: z.number().positive().optional().describe('Optional user-approved quantity. Omit when the user did not supply it.'),
  target_window: z.string().optional().describe('Optional user-approved target window such as "this shop" or "next order".'),
  unit: z.string().optional().describe('Optional user-approved unit. Omit when the user did not supply it.'),
}).strict().describe('Add one explicit manual item to the living grocery list.');
const fluentVNextGroceryListMarkPlanItemChangeSchema = z.object({
  kind: z.literal('mark_plan_item').describe('Update the status of an existing grocery-plan item shown in the current grocery list.'),
  item_key: z.string().min(1).describe('Existing grocery-plan item key from a current grocery-list readback. Do not invent this value.'),
  notes: z.string().optional().describe('Optional user-approved note for the list item status update.'),
  purchased_at: z.string().optional().describe('Optional ISO timestamp/date for a bought item when the user supplied it.'),
  remember_inventory: z.boolean().optional().describe(
    'Set true only when the user explicitly approves saving this status as durable kitchen memory. Omit for normal checklist progress.',
  ),
  status: z.enum([
    'bought',
    'skipped',
    'deferred',
    'confirmed',
    'needs_purchase',
    'already_have_enough',
    'have_some_need_to_buy',
    'dont_have_it',
  ]).describe('User-approved list status. This does not operate a retailer cart or checkout.'),
}).strict().describe('Mark one existing current-list plan item with a bounded grocery-list status.');
const fluentVNextGroceryListSubstitutePlanItemChangeSchema = z.object({
  kind: z.literal('substitute_plan_item').describe('Record a user-approved substitution for an existing grocery-plan item.'),
  create_substitute_intent: z.boolean().optional().describe(
    'Set true only when the user explicitly wants the substitute added as a pending grocery-list item.',
  ),
  intent_notes: z.string().optional().describe('Optional note for a substitute intent when create_substitute_intent is true.'),
  item_key: z.string().min(1).describe('Existing grocery-plan item key from a current grocery-list readback. Do not invent this value.'),
  notes: z.string().optional().describe('Optional user-approved note for this substitution.'),
  substitute: z.object({
    display_name: z.string().min(1).optional().describe('Wrapped user-approved substitute item name. Prefer top-level substitute_display_name when possible.'),
    name: z.string().min(1).optional().describe('Wrapped alias for substitute_display_name.'),
    notes: z.string().optional().describe('Wrapped optional user-approved substitution note.'),
    quantity: z.number().positive().optional().describe('Wrapped optional user-approved substitute quantity.'),
    unit: z.string().optional().describe('Wrapped optional user-approved substitute unit.'),
  }).strict().optional().describe('Optional host wrapper for substitute payloads. Fluent still treats this as one bounded substitution.'),
  substitute_display_name: z.string().min(1).optional().describe('User-approved substitute item name.'),
  substituteDisplayName: z.string().min(1).optional().describe('Camel-case alias for substitute_display_name accepted for host ergonomics.'),
  substitute_item_key: z.string().optional().describe('Optional known substitute item key from Fluent state. Do not invent it.'),
  substitute_quantity: z.number().positive().optional().describe('Optional user-approved substitute quantity.'),
  substitute_unit: z.string().optional().describe('Optional user-approved substitute unit.'),
}).strict().describe('Substitute one existing current-list plan item without browsing, cart, checkout, or order execution.');
const fluentVNextGroceryListUpdateManualItemChangeSchema = z.object({
  kind: z.literal('update_manual_item').describe('Update one manual grocery-list item/intent already present on the current grocery list.'),
  display_name: z.string().min(1).optional().describe('Optional corrected item name. Omit to keep the current name.'),
  displayName: z.string().min(1).optional().describe('Camel-case alias for display_name accepted for host ergonomics.'),
  intent_id: z.string().min(1).optional().describe('Existing manual grocery intent ID from a current grocery-list readback. Do not invent this value.'),
  item_id: z.string().min(1).optional().describe('Alias for intent_id from hosts that use generic item identifiers.'),
  notes: z.string().optional().describe('Optional user-approved note. Omit to keep the current note.'),
  quantity: z.number().positive().optional().describe('Optional corrected quantity. Omit to keep the current quantity.'),
  status: z.enum(['pending', 'completed', 'deleted']).optional().describe('Manual item lifecycle status. Omit to keep the current status. Use deleted only when the user explicitly removes the item.'),
  target_window: z.string().optional().describe('Optional corrected target window. Omit to keep the current target window.'),
  unit: z.string().optional().describe('Optional corrected unit. Omit to keep the current unit.'),
}).strict().describe('Update one manual item on the living grocery list.');
const fluentVNextGroceryListChangeSchema = z.discriminatedUnion('kind', [
  fluentVNextGroceryListAddItemChangeSchema,
  fluentVNextGroceryListMarkPlanItemChangeSchema,
  fluentVNextGroceryListSubstitutePlanItemChangeSchema,
  fluentVNextGroceryListUpdateManualItemChangeSchema,
]).describe(
  'One bounded current grocery-list change. This schema cannot mutate retailer carts, checkout, orders, recipes, meal-plan truth, broad preferences, or arbitrary pantry quantities.',
);
const fluentVNextOperationValueObjectSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  note: z.string().optional(),
  status: z.string().optional(),
  tags: z.array(z.string()).optional(),
  title: z.string().optional(),
}).strict().describe('Small object value for a simple item patch operation.');
const fluentVNextOperationSchema = z.object({
  op: z.enum(['add', 'remove', 'replace']).describe('Patch operation to apply to a saved item.'),
  path: z.string().describe('JSON Pointer path such as /name, /status, or /ingredients/0.'),
  value: z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string()), fluentVNextOperationValueObjectSchema]).optional().describe(
    'Replacement value for add or replace operations. Use simple values; complex domain writes should use item fields.',
  ),
}).strict().describe('Simple JSON-patch-style operation for a saved item.');
const fluentVNextItemInputSchema = z.object({
  brand: z.string().optional().describe('Optional brand for a style item or product-like saved item.'),
  category: z.string().optional().describe('Optional domain category, such as dinner recipe, pantry item, outerwear, or shoe.'),
  description: z.string().optional().describe('Short user-confirmed description.'),
  id: z.string().optional().describe('Existing Fluent item ID when updating a saved item.'),
  ingredients: z.array(z.string()).optional().describe('Recipe ingredients or grocery item names when creating a meals item.'),
  instructions: z.array(z.string()).optional().describe('Recipe instructions when creating a meals recipe.'),
  name: z.string().optional().describe('User-visible item name.'),
  notes: z.string().optional().describe('Short user-confirmed notes to store with the item.'),
  photo_urls: z.array(z.string().url()).optional().describe('Direct image URLs for a style item when the user provided them.'),
  recipe_id: z.string().optional().describe('Existing recipe ID when updating a Meals recipe.'),
  recipeId: z.string().optional().describe('Camel-case recipe ID alias.'),
  status: z.enum(['active', 'archived', 'planned', 'completed']).optional().describe('Lifecycle status for the item.'),
  tags: z.array(z.string()).optional().describe('Optional user-confirmed tags.'),
  title: z.string().optional().describe('Alternate title for the item.'),
}).strict().describe('Typed item envelope for explicit user-approved item creation or update.');
const fluentVNextSourceSnapshotSchema = z.object({
  captured_at: z.string().optional().describe('ISO timestamp for when the host observed the source.'),
  notes: z.string().optional().describe('Short provenance note.'),
  title: z.string().optional().describe('Source title, if relevant.'),
  url: z.string().url().optional().describe('Source URL for provenance only. Fluent will not browse it.'),
}).strict().describe('Optional compact provenance snapshot for the write.');
const fluentVNextGroceryShoppingItemSchema = z.object({
  item_key: z.string().min(1).describe('A plan-item itemKey or manual-intent id from the current grocery-list readback.'),
  status: z.enum(['bought', 'skipped']).optional().describe('Optional result for this item. Omit to mark it bought.'),
}).strict().describe('One current-list item included in the completed shopping result.');
const fluentVNextGroceryShoppingSelectionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('item_checkbox'),
    item_key: z.string().min(1),
    checked: z.boolean(),
    purchase_id: z.string().min(1).optional().describe('Required when unchecking: exact purchaseId from checkboxPurchases readback.'),
  }).strict(),
  z.object({
    kind: z.literal('selected_items').describe('Reconcile only the explicitly listed current-list items.'),
    bought_items: z.array(fluentVNextGroceryShoppingItemSchema).min(1).describe('Required non-empty current-list item selection.'),
  }).strict(),
  z.object({
    kind: z.literal('all_to_buy').describe('Mark every current to-buy item as bought.'),
  }).strict(),
]).describe('Required shopping-result selection. Choose exactly one kind: selected_items, all_to_buy, or item_checkbox. item_checkbox saves one purchase or reverses its exact purchase_id; requires list_id, list_version, week_start and idempotency_key.');
const fluentVNextGroceryShoppingResultPublicInputSchema = z.object({
  approval: fluentVNextRecipeWriteApprovalSchema,
  selection: fluentVNextGroceryShoppingSelectionSchema.optional(),
  currentness_confirmed: z.boolean().optional().describe(
    'Required only when the current grocery list is stale or incomplete and the user explicitly confirms they still want to reconcile that list.',
  ),
  idempotency_key: z.string().min(1).optional().describe(
    'Stable retry identity for this exact shopping-result selection. Required for selection.kind="all_to_buy"; reuse it only when retrying the same list and selection.',
  ),
  list_id: z.string().optional().describe('Optional current grocery-list ID from a recent readback; used to prevent target mismatches.'),
  list_version: z.string().optional().describe('Optional current grocery-list version from a recent readback; used to prevent stale writes.'),
  response_mode: writeResponseModeSchema,
  week_start: z.string().optional().describe('Optional selected meal-plan week start from the current grocery-list readback.'),
  ...provenanceInputSchema,
}).passthrough().superRefine((input, context) => {
  const legacyBoughtItems = fluentVNextGroceryShoppingItemSchema.array().min(1).safeParse(input.bought_items);
  const legacyMarkAll = input.mark_all_to_buy_bought === true;
  if (input.selection && (input.bought_items !== undefined || input.mark_all_to_buy_bought !== undefined)) {
    context.addIssue({
      code: 'custom',
      message: 'fluent_apply_grocery_shopping_result accepts only selection; do not combine it with legacy selection fields.',
    });
  }
  if (!input.selection && legacyBoughtItems.success && legacyMarkAll) {
    context.addIssue({ code: 'custom', message: 'Cached widget payload must choose bought_items or mark_all_to_buy_bought, not both.' });
  }
  if (!input.selection && !legacyBoughtItems.success && !legacyMarkAll) {
    context.addIssue({ code: 'custom', message: 'fluent_apply_grocery_shopping_result requires selection.' });
  }
}).describe('Reconcile one completed shopping result using exactly one explicit selection mode.');
const fluentVNextGroceryShoppingResultInputSchema = fluentVNextGroceryShoppingResultPublicInputSchema.meta({
  // Runtime parsing keeps selection optional so already-mounted legacy widgets remain callable.
  // The generated public JSON Schema advertises only the canonical selection-required contract.
  required: ['approval', 'selection'],
});
const fluentVNextEventInputSchema = z.object({
  date: z.string().optional().describe('Optional ISO date for an outcome, feedback, or observation event.'),
  difficulty: z.string().optional().describe('Optional user-reported difficulty, especially for Meals feedback.'),
  event_type: z.string().optional().describe('Event type, such as meals_calibration_response, recipe_feedback, or meal_feedback.'),
  eventType: z.string().optional().describe('Camel-case event type alias.'),
  family_acceptance: z.string().optional().describe('Optional user-reported family acceptance for a meal or recipe.'),
  familyAcceptance: z.string().optional().describe('Camel-case family acceptance alias.'),
  kind: z.string().optional().describe('Optional event kind when event_type is omitted.'),
  meal_plan_entry_id: z.string().optional().describe('Optional meal plan entry ID for meal feedback.'),
  mealPlanEntryId: z.string().optional().describe('Camel-case meal plan entry ID alias.'),
  meal_plan_id: z.string().optional().describe('Optional meal plan ID for meal feedback.'),
  mealPlanId: z.string().optional().describe('Camel-case meal plan ID alias.'),
  notes: z.string().optional().describe('Short user-confirmed notes for the event.'),
  pantry_items: z.array(fluentVNextPantryItemPatchSchema).optional().describe('Explicit pantry or inventory calibration items.'),
  pantryItems: z.array(fluentVNextPantryItemPatchSchema).optional().describe('Camel-case pantry items alias.'),
  preferencePatch: fluentVNextPreferencePatchSchema.optional(),
  preference_patch: fluentVNextPreferencePatchSchema.optional(),
  recipe_id: z.string().optional().describe('Recipe ID for recipe or meal feedback.'),
  recipeId: z.string().optional().describe('Camel-case recipe ID alias.'),
  repeat_again: z.boolean().optional().describe('Whether the user wants to repeat this meal or recipe again.'),
  repeatAgain: z.boolean().optional().describe('Camel-case repeat-again alias.'),
  response: fluentVNextCalibrationResponsePatchSchema.optional(),
  signals: z.array(fluentVNextCalibrationSignalSchema).optional().describe('Explicit user-approved calibration signals.'),
  starter_preference_text: z.string().optional().describe('User-facing preference text captured during setup or correction.'),
  starterPreferenceText: z.string().optional().describe('Camel-case starter preference text alias.'),
  status: z.string().optional().describe('Optional event status when recording a compact outcome event.'),
  submitted_by: z.string().optional().describe('Optional person or role that supplied the feedback.'),
  submittedBy: z.string().optional().describe('Camel-case submitted-by alias.'),
  taste: z.string().optional().describe('Optional user-reported taste feedback.'),
  time_reality: z.string().optional().describe('Optional user-reported timing reality for a meal or recipe.'),
  timeReality: z.string().optional().describe('Camel-case timing reality alias.'),
  value: z.string().optional().describe('Optional compact event value for simple confirmation/correction events.'),
}).strict().describe(
  'Typed event envelope for explicit user-approved calibration, recipe feedback, meal feedback, or compact outcome events.',
);

type FluentMcpSecurityScheme = {
  scopes: string[];
  type: 'oauth2';
};

function oauth2SecuritySchemes(scopes: readonly string[]): FluentMcpSecurityScheme[] {
  return [{ type: 'oauth2', scopes: [...scopes] }];
}

function oauth2AlternativeSecuritySchemes(scopes: readonly string[]): FluentMcpSecurityScheme[] {
  return scopes.map((scope) => ({ type: 'oauth2', scopes: [scope] }));
}

function withToolSecurity<T extends Record<string, unknown>>(
  config: T,
  securitySchemes: FluentMcpSecurityScheme[],
): T & { _meta: Record<string, unknown>; securitySchemes: FluentMcpSecurityScheme[] } {
  const existingMeta = config._meta && typeof config._meta === 'object' && !Array.isArray(config._meta)
    ? config._meta as Record<string, unknown>
    : {};
  return {
    ...config,
    securitySchemes,
    _meta: {
      ...existingMeta,
      securitySchemes,
    },
  };
}

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
      billingBoundary: 'The assistant does not start, sell, upgrade, cancel, or manage paid access.',
      paymentDetails: 'Payment details are not returned by this tool.',
      privacyBoundary: 'Private account identifiers are not included in assistant-facing account text.',
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
    'Account management happens on meetfluent.app.',
  ].filter((line): line is string => Boolean(line)).join('\n');
}

export const STYLE_ITEM_NEEDS_PHOTO_GUIDANCE =
  `Some saved closet items here have no photo yet. They are complete saved items, so keep using them. When the user is discussing one of them, offer once to add a photo (a product shot or an on-you photo) and save it with fluent_set_style_item_image for that exact item_id; the first photo becomes its cover. Never create a new item just to add a photo, and do not ask repeatedly. ${STYLE_UPLOADED_PHOTO_DATA_URL_STEP}`;

// The published ChatGPT app caches a URL-only fluent_set_style_item_image schema (no image_file,
// no photo_action), so hosts decline to add photos to an item that already has a cover unless
// the data-URL route is spelled out. An omitted photo_action adds a fit/alternate photo.
export function styleItemAddMorePhotosGuidance(itemId?: string | null): string {
  return `To add an on-you fit photo or another photo to ${itemId ? 'this saved item' : 'a saved item that already has photos'}, call fluent_set_style_item_image for ${itemId ? 'this' : 'that exact'} item_id, one photo per call; a fit or alternate photo is added alongside the cover and every saved photo and never replaces them. If your fluent_set_style_item_image accepts image_file, pass the upload there with photo_action "add". Only if it has no image_file: ${styleUploadedPhotoDataUrlStep(itemId)}`;
}

function styleItemHasPhotos(item: unknown): boolean {
  const payload = recordOrNull(recordOrNull(item)?.payload);
  if (!payload || payload.status !== 'active') return false;
  if (typeof payload.photosCount === 'number') return payload.photosCount > 0;
  return Array.isArray(payload.photos) && payload.photos.length > 0;
}

function styleItemHasNoPhoto(item: unknown): boolean {
  const payload = recordOrNull(recordOrNull(item)?.payload);
  if (!payload || payload.status !== 'active') return false;
  if (typeof payload.photosCount === 'number') return payload.photosCount === 0;
  return Array.isArray(payload.photos) && payload.photos.length === 0;
}

function vNextToolResult(
  data: unknown,
  options: {
    compactContextSummaryText?: boolean;
    followUpGuidance?: string;
    includeMediaReferences?: boolean;
    preserveRecipeIngredients?: boolean;
    preserveListItems?: boolean;
    preserveStylePurchaseOwnedSlice?: boolean;
  } = {},
) {
  const structuredContent = toVNextModelVisibleValue(data, options);
  const modelText = options.compactContextSummaryText
    ? buildVNextContextSummaryText(structuredContent)
    : buildVNextModelText(data, options);
  return toolResult(data, {
    structuredContent,
    textData: options.followUpGuidance ? `${modelText}\n\n${options.followUpGuidance}` : modelText,
  });
}

function buildVNextContextSummaryText(value: unknown): string {
  const record = recordOrNull(value) ?? {};
  const facts = Array.isArray(record.compactFacts) ? record.compactFacts.length : 0;
  const items = Array.isArray(record.relevantItems) ? record.relevantItems.length : 0;
  const gaps = Array.isArray(record.evidenceGaps) ? record.evidenceGaps.length : 0;
  const freshness = recordOrNull(record.freshness);
  return [
    `Fluent returned a compact ${String(record.domain ?? 'shared')} context summary for ${String(record.intent ?? 'unknown')}.`,
    `Evidence: ${facts} compact fact(s), ${items} relevant item(s), ${gaps} evidence gap(s); freshness ${String(freshness?.status ?? 'unknown')}.`,
    'Use the structured ContextPacket as evidence, not as final judgment.',
  ].join('\n');
}

type VNextToolContentBlock =
  | { text: string; type: 'text' }
  | { data: string; mimeType: string; type: 'image' };

type VNextToolResult = {
  content: VNextToolContentBlock[];
  structuredContent: Record<string, unknown>;
};

// Render the MODEL-FACING text for a fluent_create_style_item result. The duplicate candidates Fluent
// already computed ride in ack.payload.duplicateCandidates (structuredContent), but the host primarily
// reads this text — so on a duplicate it must NAME the candidates, surface the concrete discriminators
// (brand/color/type/size/tags), and the force/skip escape hatches. Fluent SURFACES; the host DECIDES
// sameness — the decisive comparison goes in this text, not just guidance (guidance ≠ enforcement).
export function buildStyleItemCreateText(
  payload: unknown,
  options: { reviewSurfaceAttached?: boolean } = {},
): string {
  const p = (payload && typeof payload === 'object' ? payload : {}) as {
    createdItemId?: string | null;
    duplicateCandidates?: StyleDuplicateCandidate[];
    idempotentReplay?: boolean;
    lifecycleStatus?: string | null;
    nextAction?: string | null;
    nextPhotoStep?: string | null;
    photosCount?: number;
    photoStatus?: string | null;
    reviewHandoff?: {
      filter?: { item_ids?: string[]; status?: string };
      presentation?: { focused_item_id?: string; mode?: string };
    } | null;
    status?: string;
    userMessage?: string | null;
  };
  const createdId = p.createdItemId ?? null;
  const candidates = Array.isArray(p.duplicateCandidates) ? p.duplicateCandidates : [];
  const formatSignals = (signals?: StyleDuplicateCandidateSignals): string => {
    if (!signals) return '';
    const parts: string[] = [];
    if (signals.brand) parts.push(`brand ${signals.brand}`);
    const color = signals.colorName ?? signals.colorFamily;
    if (color) parts.push(`color ${color}`);
    const type = signals.itemType ?? signals.subcategory;
    if (type) parts.push(`type ${type}`);
    if (signals.size) parts.push(`size ${signals.size}`);
    if (signals.styleRole) parts.push(`role ${signals.styleRole}`);
    if (signals.tags && signals.tags.length > 0) parts.push(`tags ${signals.tags.join('/')}`);
    return parts.length > 0 ? ` — ${parts.join(', ')}` : '';
  };
  const describe = (candidate: StyleDuplicateCandidate) =>
    `"${candidate.name ?? candidate.id}" (${candidate.id}${candidate.reason ? `; matched: ${candidate.reason}` : ''})${formatSignals(candidate.signals)}`;
  if (createdId) {
    const exactReviewHandoff = p.lifecycleStatus === 'active'
      && p.reviewHandoff?.filter?.status === 'active'
      && p.reviewHandoff.filter.item_ids?.length === 1
      && p.reviewHandoff.filter.item_ids[0] === createdId
      && p.reviewHandoff.presentation?.mode === 'ingestion_review'
      && p.reviewHandoff.presentation.focused_item_id === createdId;
    const lead = p.idempotentReplay === true
      ? `Returned existing style item ${createdId} for the completed client_token; no new item was created.`
      : `Created style item ${createdId}.`;
    const duplicateReview = candidates.length > 0
      ? ` The acknowledgement retains the exact candidate that was explicitly distinguished for this keep-both creation; no unresolved duplicate was created automatically.`
      : '';
    const review = exactReviewHandoff
      ? options.reviewSurfaceAttached
        ? ` The authoritative readback confirms lifecycle status active. The attached app shows the exact saved item directly. Text-only or non-UI clients can follow payload.reviewHandoff. pending_review is not a lifecycle or render-filter status.`
        : ` The authoritative readback confirms lifecycle status active. The attached presentation was unavailable; follow payload.reviewHandoff exactly through fluent_render_style_closet_surface with filter.item_ids=["${createdId}"], filter.status="active", presentation.mode="ingestion_review", and presentation.focused_item_id="${createdId}". pending_review is not a lifecycle or render-filter status.`
      : ' No ingestion review handoff was returned because an exact active-state readback was unavailable.';
    const photo = p.photoStatus === 'needs_photo' && p.idempotentReplay !== true
      ? p.photosCount && p.photosCount > 0
        ? ` The item has a photo but no cover yet (photoStatus "needs_photo"). ${typeof p.nextPhotoStep === 'string' ? p.nextPhotoStep : STYLE_CREATE_NEXT_COVER_STEP}`
        : ` The item is saved without a photo (photoStatus "needs_photo"). ${typeof p.nextPhotoStep === 'string' ? p.nextPhotoStep : STYLE_CREATE_NEXT_PHOTO_STEP}`
      : p.photoStatus === 'has_cover' && p.idempotentReplay !== true
        ? ` ${styleItemAddMorePhotosGuidance(createdId)}`
        : '';
    return `${lead}${duplicateReview}${review}${photo}`;
  }
  if (p.status === 'skipped_duplicate' && candidates.length > 0) {
    return `Not created — matched an existing item: ${describe(candidates[0])}. Returned the existing item instead.`;
  }
  if (p.status === 'duplicate_warning' && candidates.length > 0) {
    return `Not created. Fluent flagged ${candidates.length === 1 ? 'a possible existing match' : 'possible existing matches'} but does NOT decide sameness — you do. Compare these signals (and the user's photo, if you have it) against the garment being added: ${candidates.map(describe).join('; ')}. `
      + 'To see a candidate\'s photo, call fluent_get_media_bundle with its id (or render fluent_render_style_closet_surface filtered to it). '
      + 'If it is genuinely different, call again with on_duplicate:"force" and duplicate_candidate_id set to that candidate; if it is the same item, use on_duplicate:"skip" with its exact duplicate_candidate_id. For a batch, keep processing unrelated garments and collect all unresolved matches for one concise decision turn; this warned item remains unsaved until resolved. The imported image is then retained on the chosen item. If the user wants it saved without a photo and this app requires catalog_ready, send catalog_ready:true with no image field: Fluent saves the item without a photo (photoStatus "needs_photo") and does not apply Catalog approval, so that call is truthful.';
  }
  if (p.status === 'acceptance_test_non_durable') {
    return [p.userMessage, p.nextAction].filter((line): line is string => typeof line === 'string' && line.length > 0).join(' ');
  }
  return 'Style item not created (no-op).';
}

function styleCreateAckImageTargetItemId(ack: FluentVNextWriteAck): string | null {
  const payload = ack.payload && typeof ack.payload === 'object' && !Array.isArray(ack.payload)
    ? ack.payload as { createdItemId?: unknown; matchedItemId?: unknown }
    : null;
  for (const value of [payload?.createdItemId, payload?.matchedItemId]) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

function styleCreateAckHasAtomicImage(ack: FluentVNextWriteAck): boolean {
  const payload = ack.payload && typeof ack.payload === 'object' && !Array.isArray(ack.payload)
    ? ack.payload as { imageAttachment?: unknown }
    : null;
  const attachment = payload?.imageAttachment && typeof payload.imageAttachment === 'object' && !Array.isArray(payload.imageAttachment)
    ? payload.imageAttachment as { status?: unknown }
    : null;
  return attachment?.status === 'attached';
}

function styleCreateAckIsIdempotentReplay(ack: FluentVNextWriteAck): boolean {
  const payload = ack.payload && typeof ack.payload === 'object' && !Array.isArray(ack.payload)
    ? ack.payload as { idempotentReplay?: unknown }
    : null;
  return payload?.idempotentReplay === true;
}

function styleCreateAckSupersededItemId(ack: FluentVNextWriteAck): string | null {
  const payload = ack.payload && typeof ack.payload === 'object' && !Array.isArray(ack.payload)
    ? ack.payload as { supersededItemId?: unknown }
    : null;
  return typeof payload?.supersededItemId === 'string' && payload.supersededItemId.length > 0
    ? payload.supersededItemId
    : null;
}

export const STYLE_CREATE_NEXT_PHOTO_STEP =
  `Offer once, in plain language, to add a photo of this item (a product shot or an on-you photo). If the user shares one, save it with fluent_set_style_item_image for this item_id; the first photo becomes the cover. ${STYLE_UPLOADED_PHOTO_DATA_URL_STEP} Saving without a photo is fine, so do not ask again in this turn.`;

// A saved item whose only photos are fit/alternate (for example a published-app catalog_ready
// create downgraded to an ordinary fit photo) has photos but no cover.
export const STYLE_CREATE_NEXT_COVER_STEP =
  'Offer once to add a clean primary product photo of this item as its cover with fluent_set_style_item_image for this item_id (image_type "primary"); the saved photos are kept. Do not ask again in this turn.';

// D24: an ordinary photo is optional, so an unusable ordinary image reference (an app-internal
// handle, a local path, or non-image bytes) does not block the create. The receipt says plainly
// that the photo was not attached, why, and the exact image_url data-URL step that attaches it.
const STYLE_CATALOG_REQUIRES_PRIMARY_REASON = 'a Catalog image must be the primary product photo';

// catalog_ready=true with a fit/alternate photo (the published app always sends catalog_ready=true).
function styleCreateCatalogDowngradeNote(imageType: 'alternate' | 'fit'): string {
  return `The photo was saved as ${imageType === 'fit' ? 'a fit' : 'an alternate'} photo, and the Catalog approval (catalog_ready) was NOT applied: ${STYLE_CATALOG_REQUIRES_PRIMARY_REASON}. To give the item a Catalog cover later, save a clean primary product photo with fluent_set_style_item_image (image_type "primary").`;
}

function styleCreateUnusableImageStep(reason: string, itemId: string | null, options: { catalogNotApplied?: boolean } = {}): string {
  const lead = options.catalogNotApplied
    ? 'The photo was NOT attached and the Catalog approval (catalog_ready) was NOT applied'
    : 'The photo was NOT attached';
  return `${lead}: ${reason.replace(/[.\s]+$/, '')}. ${styleUploadedPhotoDataUrlStep(itemId)}`;
}

// A create can finish with durable sub-operations even when the create step itself wrote nothing
// (use-existing skip): a committed photo attachment or a completed duplicate merge. The combined
// receipt reports durability from those actual sub-operations, never from the skip alone.
function withStyleCreateAggregateDurability(ack: FluentVNextWriteAck): FluentVNextWriteAck {
  const payload = ack.payload && typeof ack.payload === 'object' && !Array.isArray(ack.payload)
    ? ack.payload as Record<string, unknown>
    : null;
  if (!payload) return ack;
  const attachmentStatus = recordOrNull(payload.imageAttachment)?.status;
  const mergeStatus = recordOrNull(payload.supersededItemArchive)?.status;
  const subOperationDurable = payload.idempotentReplay !== true && (
    attachmentStatus === 'attached'
    || attachmentStatus === 'attached_readback_unavailable'
    || mergeStatus === 'merged'
  );
  // Single source of truth: the outer ack.durable always mirrors the aggregated payload.durable
  // (writeAck derives the outer field from the payload once, at construction).
  const durable = payload.durable === true || subOperationDurable;
  return { ...ack, durable, payload: { ...payload, durable } };
}

// Additive create output: photoStatus tells the host whether the saved item has a cover photo, read
// back from the durable item rather than inferred from the request. A photo-less save is a real,
// active item in the needs_photo state; it is never reported as Catalog-ready.
async function withStyleCreatePhotoStatus(ack: FluentVNextWriteAck, style: StyleService): Promise<FluentVNextWriteAck> {
  const payload = ack.payload && typeof ack.payload === 'object' && !Array.isArray(ack.payload)
    ? ack.payload as Record<string, unknown>
    : null;
  if (!payload || (payload.status !== 'created' && payload.status !== 'skipped_duplicate')) return ack;
  const itemId = styleCreateAckImageTargetItemId(ack);
  if (!itemId) return ack;
  let hasCover: boolean;
  let photosCount: number;
  try {
    const item = await style.getItem(itemId);
    if (!item) return ack;
    hasCover = item.photos.some((photo) => photo.isPrimary);
    photosCount = item.photos.length;
  } catch {
    return ack;
  }
  // A more specific step already on the payload (an unusable photo that was not attached) wins.
  const defaultStep = photosCount > 0 ? STYLE_CREATE_NEXT_COVER_STEP : STYLE_CREATE_NEXT_PHOTO_STEP;
  return {
    ...ack,
    payload: {
      ...payload,
      photoStatus: hasCover ? 'has_cover' : 'needs_photo',
      photosCount,
      ...(hasCover ? {} : { nextPhotoStep: typeof payload.nextPhotoStep === 'string' ? payload.nextPhotoStep : defaultStep }),
    },
  };
}

type StyleCreateReviewTarget = {
  itemId: string;
  mode: 'detail' | 'ingestion_review';
};

type StyleCreateOutcomePresentation = {
  duplicateCandidates: Array<{
    id: string;
    name: string | null;
    reason: string | null;
    signals: StyleDuplicateCandidateSignals | null;
  }>;
  experience: 'style_create_outcome';
  message: string;
  saved: boolean;
  status: 'duplicate_warning' | 'failure' | 'validation_only';
  surface: 'style_closet_create_outcome';
  templateUri: typeof STYLE_CLOSET_TEMPLATE_URI;
  title: string;
};

const fluentStyleCreateWriteAckOutputSchema = z.object({
  object: z.literal('WriteAck'),
  domain: z.literal('style'),
  durable: z.boolean().optional(),
  kind: z.literal('style_item_create'),
  status: z.enum(['applied', 'not_implemented']),
  target: z.object({ id: z.string().nullable(), type: z.string().nullable() }).strict(),
  source: z.string(),
  payload: z.json(),
  readAfterWrite: z.json(),
  boundaries: z.array(z.string()),
});

const fluentStyleCreateOutcomeOutputSchema = z.object({
  duplicateCandidates: z.array(z.object({
    id: z.string(),
    name: z.string().nullable(),
    reason: z.string().nullable(),
    signals: z.object({
      brand: z.string().optional(),
      colorFamily: z.string().optional(),
      colorName: z.string().optional(),
      itemType: z.string().optional(),
      size: z.string().optional(),
      styleRole: z.string().optional(),
      subcategory: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }).strict().nullable(),
  }).strict()),
  experience: z.literal('style_create_outcome'),
  message: z.string(),
  saved: z.boolean(),
  status: z.enum(['duplicate_warning', 'failure', 'validation_only']),
  surface: z.literal('style_closet_create_outcome'),
  templateUri: z.literal(STYLE_CLOSET_TEMPLATE_URI),
  title: z.string(),
}).strict();

const fluentStyleClosetReviewOutputSchema = z.object({
  cursor: z.string().nullable(),
  experience: z.literal('style_closet'),
  facets: z.array(z.object({ category: z.string(), count: z.number(), label: z.string() }).strict()),
  filter: z.object({
    brand: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    color: z.string().nullable().optional(),
    item_ids: z.array(z.string()).nullable().optional(),
    query: z.string().nullable().optional(),
    size: z.string().nullable().optional(),
    status: z.enum(['active', 'archived', 'any']),
    subcategory: z.string().nullable().optional(),
  }).strict(),
  filterOptions: z.object({
    brands: z.array(z.string()),
    colorFamilies: z.array(z.string()),
    sizes: z.array(z.string()),
    subcategories: z.array(z.string()),
  }).strict(),
  hostResponseInstruction: z.string(),
  hostResponseMode: z.literal('native_widget_rendered'),
  items: z.array(z.record(z.string(), z.unknown())),
  presentation: z.object({
    focusedItemId: z.string().nullable(),
    mode: z.enum(['browse', 'ingestion_review', 'comparison', 'detail', 'recommendation']),
    recommendationReason: z.string().nullable().optional(),
  }).strict(),
  surface: z.literal('style_closet'),
  summary: z.object({
    activeTotal: z.number(),
    filterLabel: z.string(),
    generatedCatalogReferenceTotal: z.number(),
    mediaReadyTotal: z.number(),
    missingOrUnavailablePhotoTotal: z.number(),
    needsNormalizationTotal: z.number(),
    needsPhotoTotal: z.number(),
    normalizedCatalogTotal: z.number(),
    remoteCandidateTotal: z.number(),
    shownTotal: z.number(),
    unavailableMediaTotal: z.number(),
  }).strict(),
  templateUri: z.literal(STYLE_CLOSET_TEMPLATE_URI),
  title: z.literal('Your closet'),
}).strict();

export const fluentCreateStyleItemOutputSchema = fluentStyleCreateWriteAckOutputSchema.extend({
  styleCreateOutcome: fluentStyleCreateOutcomeOutputSchema.optional(),
  styleClosetReview: fluentStyleClosetReviewOutputSchema.optional(),
}).strict().superRefine((value, context) => {
  if (Number(value.styleCreateOutcome !== undefined) + Number(value.styleClosetReview !== undefined) !== 1) {
    context.addIssue({
      code: 'custom',
      message: 'Exactly one create presentation field is required.',
      path: ['styleCreateOutcome'],
    });
  }
});

function styleCreateOutcomePresentation(ack: FluentVNextWriteAck): StyleCreateOutcomePresentation {
  const payload = ack.payload && typeof ack.payload === 'object' && !Array.isArray(ack.payload)
    ? ack.payload as {
        createdItemId?: unknown;
        duplicateCandidates?: unknown;
        idempotentReplay?: unknown;
        imageAttachment?: unknown;
        matchedItemId?: unknown;
        status?: unknown;
      }
    : {};
  const candidates = Array.isArray(payload.duplicateCandidates)
    ? payload.duplicateCandidates.filter((candidate): candidate is StyleDuplicateCandidate => Boolean(
        candidate
        && typeof candidate === 'object'
        && !Array.isArray(candidate)
        && typeof (candidate as { id?: unknown }).id === 'string',
      )).map((candidate) => ({
        id: candidate.id,
        name: typeof candidate.name === 'string' ? candidate.name : null,
        reason: typeof candidate.reason === 'string' ? candidate.reason : null,
        signals: candidate.signals ?? null,
      }))
    : [];
  if (payload.status === 'duplicate_warning') {
    return {
      duplicateCandidates: candidates,
      experience: 'style_create_outcome',
      message: candidates.length === 1
        ? 'Fluent found one possible existing item. Compare it with the garment before deciding whether to use the existing item or save a separate piece.'
        : `Fluent found ${candidates.length} possible existing items. Compare them with the garment before deciding whether to use one or save a separate piece.`,
      saved: false,
      status: 'duplicate_warning',
      surface: 'style_closet_create_outcome',
      templateUri: STYLE_CLOSET_TEMPLATE_URI,
      title: 'Possible match found',
    };
  }
  if (payload.status === 'acceptance_test_non_durable') {
    return {
      duplicateCandidates: [],
      experience: 'style_create_outcome',
      message: 'Validation only. Nothing was saved.',
      saved: false,
      status: 'validation_only',
      surface: 'style_closet_create_outcome',
      templateUri: STYLE_CLOSET_TEMPLATE_URI,
      title: 'Nothing was saved',
    };
  }
  const createdItemSaved = typeof payload.createdItemId === 'string' && payload.createdItemId.length > 0;
  const matchedItemRetained = payload.status === 'skipped_duplicate'
    && typeof payload.matchedItemId === 'string'
    && payload.matchedItemId.length > 0;
  const attachment = payload.imageAttachment && typeof payload.imageAttachment === 'object' && !Array.isArray(payload.imageAttachment)
    ? payload.imageAttachment as { status?: unknown }
    : null;
  const matchedItemUpdated = matchedItemRetained && attachment?.status === 'attached';
  const saved = createdItemSaved || matchedItemRetained;
  return {
    duplicateCandidates: [],
    experience: 'style_create_outcome',
    message: createdItemSaved
      ? 'The item was saved, but Fluent could not verify the exact review presentation. Your full Closet has not been opened in its place.'
      : matchedItemUpdated
        ? 'The image was saved to the existing item, but Fluent could not verify its exact detail presentation. Your full Closet has not been opened in its place.'
        : matchedItemRetained
          ? 'The existing item was retained, but Fluent could not verify its exact detail presentation. Your full Closet has not been opened in its place.'
          : 'Fluent could not create or verify this item. Nothing else in your Closet is shown or changed by this result.',
    saved,
    status: 'failure',
    surface: 'style_closet_create_outcome',
    templateUri: STYLE_CLOSET_TEMPLATE_URI,
    title: createdItemSaved ? 'Saved, but review unavailable' : matchedItemRetained ? 'Existing item review unavailable' : 'Item not created',
  };
}

function styleCreateReviewTarget(ack: FluentVNextWriteAck): StyleCreateReviewTarget | null {
  const payload = ack.payload && typeof ack.payload === 'object' && !Array.isArray(ack.payload)
    ? ack.payload as Record<string, unknown>
    : null;
  if (!payload) return null;
  const status = typeof payload.status === 'string' ? payload.status : null;
  const attachment = payload.imageAttachment && typeof payload.imageAttachment === 'object' && !Array.isArray(payload.imageAttachment)
    ? payload.imageAttachment as { status?: unknown }
    : null;
  // A photo is optional: a saved item without one (or whose ordinary photo could not be attached) is
  // still shown for review. Only a failed write to an existing matched item has nothing exact to show.
  if (attachment?.status === 'failed' && status !== 'created') return null;

  if (status === 'created') {
    const itemId = typeof payload.createdItemId === 'string' ? payload.createdItemId : null;
    const handoff = payload.reviewHandoff && typeof payload.reviewHandoff === 'object'
      ? payload.reviewHandoff as {
          filter?: { item_ids?: unknown; status?: unknown };
          presentation?: { focused_item_id?: unknown; mode?: unknown };
        }
      : null;
    const readAfterWrite = ack.readAfterWrite && typeof ack.readAfterWrite === 'object' && !Array.isArray(ack.readAfterWrite)
      ? ack.readAfterWrite as { id?: unknown; status?: unknown }
      : null;
    if (!itemId
      || payload.lifecycleStatus !== 'active'
      || handoff?.filter?.status !== 'active'
      || !Array.isArray(handoff.filter.item_ids)
      || handoff.filter.item_ids.length !== 1
      || handoff.filter.item_ids[0] !== itemId
      || handoff.presentation?.mode !== 'ingestion_review'
      || handoff.presentation.focused_item_id !== itemId
      || readAfterWrite?.id !== itemId
      || readAfterWrite.status !== 'active') return null;
    return { itemId, mode: 'ingestion_review' };
  }

  if (status === 'skipped_duplicate') {
    const itemId = typeof payload.matchedItemId === 'string' ? payload.matchedItemId : null;
    const readAfterWrite = ack.readAfterWrite && typeof ack.readAfterWrite === 'object' && !Array.isArray(ack.readAfterWrite)
      ? ack.readAfterWrite as { id?: unknown; status?: unknown }
      : null;
    if (!itemId || (readAfterWrite && (readAfterWrite.id !== itemId || readAfterWrite.status !== 'active'))) return null;
    return { itemId, mode: 'detail' };
  }
  return null;
}

function exactStyleCreateReviewSurface(
  surface: StyleClosetStructuredContent,
  target: StyleCreateReviewTarget,
): boolean {
  return surface.experience === 'style_closet'
    && surface.surface === 'style_closet'
    && surface.templateUri === STYLE_CLOSET_TEMPLATE_URI
    && surface.filter.status === 'active'
    && Array.isArray(surface.filter.item_ids)
    && surface.filter.item_ids.length === 1
    && surface.filter.item_ids[0] === target.itemId
    && surface.presentation.mode === target.mode
    && surface.presentation.focusedItemId === target.itemId
    && surface.items.length === 1
    && surface.items[0]?.id === target.itemId
    && surface.items[0]?.status === 'active'
    && surface.summary.shownTotal === 1;
}

async function finalizeStyleItemCreateToolResult(
  ack: FluentVNextWriteAck,
  options: {
    styleClosetSurfaceBuilder?: StyleClosetSurfaceBuilder;
    textSuffix?: string;
  },
): Promise<ReturnType<typeof toolResult>> {
  const target = styleCreateReviewTarget(ack);
  let reviewSurface: StyleClosetStructuredContent | null = null;
  if (target && options.styleClosetSurfaceBuilder) {
    try {
      const candidate = await options.styleClosetSurfaceBuilder({
        filter: { item_ids: [target.itemId], status: 'active' },
        limit: 1,
        presentation: { focused_item_id: target.itemId, mode: target.mode },
      });
      if (exactStyleCreateReviewSurface(candidate, target)) reviewSurface = candidate;
    } catch {
      // The durable write remains authoritative. Presentation is a fail-soft result layer.
    }
  }
  const payload = ack.payload && typeof ack.payload === 'object' && !Array.isArray(ack.payload)
    ? ack.payload as { status?: unknown }
    : null;
  const existingItemNote = reviewSurface && payload?.status === 'skipped_duplicate'
    ? ' The attached app shows the exact existing item.'
    : '';
  const createOutcome = reviewSurface ? null : styleCreateOutcomePresentation(ack);
  const structuredContent = reviewSurface
    ? { ...ack, styleClosetReview: reviewSurface }
    : { ...ack, styleCreateOutcome: createOutcome };
  return toolResult(ack, {
    meta: {
      ui: { resourceUri: STYLE_CLOSET_TEMPLATE_URI },
      'openai/outputTemplate': STYLE_CLOSET_TEMPLATE_URI,
      ...(reviewSurface ? { styleClosetReview: reviewSurface } : { styleCreateOutcome: createOutcome }),
    },
    structuredContent,
    textData: `${buildStyleItemCreateText(ack.payload, { reviewSurfaceAttached: reviewSurface !== null })}${existingItemNote}${options.textSuffix ? ` ${options.textSuffix}` : ''}`,
  });
}

// Once a committed photo is verified by a fresh readback, the photo write's own "could not be read
// back" recovery sentence is stale. Every combining path removes it through this one helper.
function withoutSupersededReadbackNote(photoWritePayload: unknown, recovery: unknown): unknown {
  const record = recordOrNull(photoWritePayload);
  const instruction = record?.hostResponseInstruction;
  if (!record || typeof instruction !== 'string' || typeof recovery !== 'string' || !recovery) return photoWritePayload;
  return { ...record, hostResponseInstruction: instruction.replace(` ${recovery}`, '').replace(recovery, '').trim() };
}

function mergeStyleCreateImageAck(
  createAck: FluentVNextWriteAck,
  imageAck: FluentVNextWriteAck | null,
  imageError: unknown,
  sourceImageAck: FluentVNextWriteAck | null = null,
  options: { readAfterWrite?: unknown; status?: 'attached' | 'attached_readback_unavailable' | 'unverified' } = {},
): FluentVNextWriteAck {
  // The combined ack describes a SAVED item, so the error is recorded outcome-neutrally.
  const imageErrorMessage = imageError ? styleImageNotAttachedReason(imageError) : null;
  const payload = createAck.payload && typeof createAck.payload === 'object' && !Array.isArray(createAck.payload)
    ? createAck.payload as Record<string, unknown>
    : {};
  // A committed photo write whose readback failed carries that fact into the combined receipt:
  // no read-after-write claim, the unavailable-readback flag, and its do-not-repeat recovery.
  // An explicit fresh readback (options.readAfterWrite) or status supersedes it.
  const readbackUnavailable = imageAck?.readbackStatus === 'unavailable'
    && options.readAfterWrite === undefined
    && (options.status === undefined || options.status === 'attached_readback_unavailable');
  const combined: FluentVNextWriteAck = {
    ...createAck,
    payload: {
      ...payload,
      imageAttachment: {
        attempted: true,
        error: imageErrorMessage,
        payload: imageAck && imageAck.readbackStatus === 'unavailable' && !readbackUnavailable
          ? withoutSupersededReadbackNote(imageAck.payload, imageAck.recovery)
          : imageAck?.payload ?? null,
        status: options.status ?? (imageAck ? (readbackUnavailable ? 'attached_readback_unavailable' : 'attached') : 'failed'),
      },
      ...(sourceImageAck
        ? {
            sourceImageAttachment: {
              payload: sourceImageAck.payload,
              status: 'attached',
            },
          }
        : {}),
    },
    readAfterWrite: options.readAfterWrite ?? (readbackUnavailable ? null : imageAck?.readAfterWrite ?? createAck.readAfterWrite),
  };
  if (readbackUnavailable) {
    combined.readbackStatus = 'unavailable';
    combined.recovery = imageAck?.recovery
      ?? 'The photo was saved, but the item could not be read back. Read the item before making another change; do not repeat this write.';
    combined.boundaries = createAck.boundaries.filter((boundary) => !boundary.startsWith('Read-after-write proof'));
  }
  return combined;
}

type PublicStyleImageSource =
  | { kind: 'openai_file_download'; value: string }
  | { kind: 'hosted_file_download'; value: string }
  | { kind: 'inline_data_url'; value: string }
  | { kind: 'reference_url'; value: string };

function publicStyleImageSource(
  args: {
    image_file?: {
      download_url: string;
      file_id: string;
      mime_type?: string;
      file_name?: string;
    } | null;
    hosted_file_download_url?: string | null;
    image_data_url?: string | null;
    image_url?: string | null;
  },
  required: boolean,
  fieldPrefix = '',
  allowReference = true,
): PublicStyleImageSource | null {
  const sources: PublicStyleImageSource[] = [];
  if (args.image_file?.download_url?.trim()) {
    sources.push({ kind: 'openai_file_download', value: args.image_file.download_url.trim() });
  }
  // image_url is classified before any write: data: URLs must be real image bytes (owned storage),
  // OpenAI upload links are copied into owned storage, and non-http(s) references are rejected.
  if (allowReference && args.image_url?.trim()) sources.push(routeStyleImageUrl(args.image_url));
  if (args.image_data_url?.trim()) {
    assertStyleImageDataUrl(args.image_data_url);
    sources.push({ kind: 'inline_data_url', value: args.image_data_url.trim() });
  }
  if (args.hosted_file_download_url?.trim()) {
    sources.push({ kind: 'hosted_file_download', value: args.hosted_file_download_url.trim() });
  }
  if (sources.length > 1 || (required && sources.length !== 1)) {
    throw new Error(
      `Provide exactly one of ${fieldPrefix}image_file, ${allowReference ? `${fieldPrefix}image_url, ` : ''}${fieldPrefix}image_data_url, or ${fieldPrefix}hosted_file_download_url for a Style image write.`,
    );
  }
  return sources[0] ?? null;
}

export function isViewableInlineImageMimeType(mimeType: string | null | undefined): boolean {
  return mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/webp' || mimeType === 'image/gif';
}

function activeReanalyzeDirective(value: unknown): string | null {
  const record = recordOrNull(value);
  const directive = record?.reanalyzeDirective;
  return typeof directive === 'string' && directive.trim().length > 0 ? directive : null;
}

// Ordered, server-fetchable candidate URLs for the requested item's primary photo, taken from the first
// `requested_item` asset of a getVisualBundle. The `requested_item` role already designates the item's
// primary photo (style/service.ts pushItemPrimaryPhoto), so DO NOT require a ':primary' photoId suffix —
// the real photoId is the stored/synthetic id. A real asset carries the URL across three fields and the
// bundle's own fetchability check (style/service.ts:2706) accepts any of them; we order them by what the
// cookie-less server fetcher can actually retrieve: fallbackSignedOriginalUrl (pre-signed owned route) and
// sourceUrl (public retailer) are fetchable; authenticatedOriginalUrl usually 401s without a bearer, so it
// is last. Caller fetches each in order and keeps the first that yields a viewable image.
function styleRequestedPrimaryPhotoCandidateUrls(bundle: unknown): string[] {
  const payload = recordOrNull(bundle)?.payload;
  const assets = recordOrNull(payload)?.assets;
  if (!Array.isArray(assets)) {
    return [];
  }
  const requested = recordOrNull(assets.find((asset) => recordOrNull(asset)?.role === 'requested_item'));
  if (!requested) {
    return [];
  }
  const ordered = [requested.fallbackSignedOriginalUrl, requested.sourceUrl, requested.authenticatedOriginalUrl];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const candidate of ordered) {
    if (typeof candidate === 'string' && candidate.trim().length > 0 && !seen.has(candidate)) {
      seen.add(candidate);
      urls.push(candidate);
    }
  }
  return urls;
}

// The single style item in focus for a media-bundle request, so a queued re-analysis can ride the
// get_media_bundle path too (guidance steers the model there, not get_item). item_ids takes precedence
// over subject (mirrors getFluentVNextMediaBundle); a multi-item comparator request has no single focus
// and is intentionally skipped so we never inline pixels across a comparator set.
function singleStyleFocusItemId(subject: unknown, itemIds: unknown): string | null {
  if (Array.isArray(itemIds)) {
    if (itemIds.length !== 1) {
      return null;
    }
    const only = itemIds[0];
    return typeof only === 'string' && only.trim().length > 0 ? only : null;
  }
  return typeof subject === 'string' && subject.trim().length > 0 ? subject : null;
}

// Append the item's primary photo as inline base64 pixels onto a tool result, given an ALREADY-BUILT
// media bundle. Tries each server-fetchable candidate URL in order and keeps the FIRST that yields a
// viewable image; never throws — a private/auth CDN the server cannot fetch is swallowed so the
// directive's text-only path carries the graceful degrade.
async function appendStyleReanalyzeInlinePhotoFromBundle(
  result: VNextToolResult,
  bundle: unknown,
  options: { reanalyzePending: boolean },
): Promise<void> {
  const candidates = styleRequestedPrimaryPhotoCandidateUrls(bundle);
  const failures: string[] = [];
  // ONE shared deadline across ALL candidate attempts. This inline enrichment now rides every single-focus
  // read, so a slow/hanging CDN must not stack multiple 15s timeouts and blow the host request budget; once
  // the shared signal aborts, any remaining candidate fetch rejects immediately.
  const inlineFetchDeadline = candidates.length > 0 ? createFetchTimeoutSignal(15_000) : undefined;
  for (const url of candidates) {
    try {
      const fetched = await fetchStyleVisualBundleImage(url, inlineFetchDeadline);
      if (isViewableInlineImageMimeType(fetched.mimeType)) {
        result.content.push({ type: 'image', data: fetched.data, mimeType: fetched.mimeType });
        return;
      }
      // Fetched, but the format is not host-viewable (e.g. a CDN served image/avif, which the vision
      // model cannot render). Record it and try the next candidate.
      failures.push(`server fetched ${fetched.mimeType}, which the vision model cannot display`);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  // No host-viewable image could be attached. Surface WHY so the model degrades honestly instead of
  // silently appearing to ignore the photo, and so the reason is observable. Only frame the next step as a
  // re-analysis when one is actually pending; a plain saved-item review gets neutral guidance.
  const detail = failures.length > 0
    ? [...new Set(failures)].join('; ')
    : 'no fetchable photo URL on the saved item';
  result.content.push({
    type: 'text',
    text: options.reanalyzePending
      ? `Re-analysis photo not attached inline: ${detail}. Refresh text-supported fields only (source="host_text", has_image:false) or ask the user to upload a photo; do not fabricate visual descriptors.`
      : `Item photo not available for inline inspection: ${detail}. Describe the item only from the provided text fields; do not fabricate visual descriptors.`,
  });
}

// get_item path: load this item's bundle, then inline its primary photo.
async function appendStyleReanalyzePrimaryPhotoInlineContent(
  result: VNextToolResult,
  services: FluentVNextReadServices,
  itemId: string,
): Promise<void> {
  try {
    const media = await getFluentVNextMediaBundle(services, {
      deliveryMode: 'authenticated_with_signed_fallback',
      domain: 'style',
      itemIds: [itemId],
      purpose: 'saved_item_review',
      subject: itemId,
    });
    await appendStyleReanalyzeInlinePhotoFromBundle(result, media, { reanalyzePending: true });
  } catch {
    // Defensive: a media-bundle load failure must not break the get_item read.
  }
}

function buildStyleClosetMutationProvenance(
  authProps: Parameters<typeof buildMutationProvenance>[0],
  args: Record<string, unknown>,
) {
  const nested = args.provenance && typeof args.provenance === 'object' && !Array.isArray(args.provenance)
    ? args.provenance as Record<string, unknown>
    : {};
  return buildMutationProvenance(authProps, {
    ...args,
    confidence: args.confidence ?? nested.confidence,
    session_id: args.session_id ?? nested.session_id ?? nested.sessionId,
    source_agent: args.source_agent ?? nested.source_agent ?? nested.sourceAgent,
    source_skill: args.source_skill ?? nested.source_skill ?? nested.sourceSkill,
    source_type: args.source_type ?? nested.source_type ?? nested.sourceType,
  } as Parameters<typeof buildMutationProvenance>[1]);
}

// The cached ChatGPT 1.0.0 registration sends target:{by:"id",item_id} | {by:"name",item_name}
// instead of top-level item_id/item_name. Map it exactly; never guess between conflicting targets.
export function resolveArchiveItemTarget(args: {
  item_id?: string;
  item_name?: string;
  target?: { by: 'id' | 'name'; item_id?: string; item_name?: string };
}): { itemId: string | undefined; itemName: string | undefined } {
  const target = args.target;
  if (!target) return { itemId: args.item_id, itemName: args.item_name };
  const targetValue = target.by === 'id' ? target.item_id : target.item_name;
  const otherTargetValue = target.by === 'id' ? target.item_name : target.item_id;
  if (!targetValue?.trim()) {
    throw new Error(`fluent_archive_item target.by="${target.by}" requires target.${target.by === 'id' ? 'item_id' : 'item_name'}.`);
  }
  if (otherTargetValue !== undefined) {
    throw new Error(`fluent_archive_item target.by="${target.by}" accepts only target.${target.by === 'id' ? 'item_id' : 'item_name'}.`);
  }
  const topLevel = target.by === 'id' ? args.item_id : args.item_name;
  const otherTopLevel = target.by === 'id' ? args.item_name : args.item_id;
  if ((topLevel !== undefined && topLevel !== targetValue) || otherTopLevel !== undefined) {
    throw new Error('fluent_archive_item received both target and a different item_id/item_name. Send one exact target.');
  }
  return target.by === 'id'
    ? { itemId: targetValue, itemName: undefined }
    : { itemId: undefined, itemName: targetValue };
}

async function requireExplicitPublicWriteApproval(
  approval: unknown,
  toolName: string,
  publicWriteRateLimiter?: FluentRateLimitBinding,
): Promise<void> {
  if (approval !== 'explicit_user_approved') {
    throw new Error(`${toolName} requires approval="explicit_user_approved".`);
  }
  await enforcePublicWriteRateLimit(publicWriteRateLimiter, getFluentAuthProps());
}

function buildStyleItemProfileRefreshFieldEvidence(
  profile: Record<string, unknown>,
  fieldSources: unknown,
  defaultSource: string | null,
  defaultConfidence: number | null,
): Record<string, { confidence: number | null; source: string | null; value: unknown }> {
  const fieldSourceMap = recordOrNull(fieldSources) ?? {};
  const evidence: Record<string, { confidence: number | null; source: string | null; value: unknown }> = {};
  for (const [field, value] of Object.entries(profile)) {
    const fieldSource = recordOrNull(fieldSourceMap[field]) ?? {};
    evidence[field] = {
      confidence: typeof fieldSource.confidence === 'number' ? fieldSource.confidence : defaultConfidence,
      source: typeof fieldSource.source === 'string' ? fieldSource.source : defaultSource,
      value,
    };
  }
  return evidence;
}

function stripStyleItemFitFields(profile: Record<string, unknown>): Record<string, unknown> {
  const stripped = { ...profile };
  for (const field of STYLE_ITEM_FIT_FIELDS) {
    delete stripped[field];
  }
  return stripped;
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
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
        label: 'needs review',
        nextStep: 'Contact support to restore normal account access.',
        summary: status.entitlement.summary,
      };
    case 'limited':
    case 'canceled_retention':
      return {
        label: 'limited',
        nextStep: 'Use meetfluent.app to export data, request deletion, or reactivate during the retention window.',
        summary: status.entitlement.summary,
      };
    case 'retention_expired':
      return {
        label: 'past the retention window',
        nextStep: 'Contact support if you believe this account state is wrong.',
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
  style: StyleService,
  budgets: BudgetsService,
  origin: string,
  options: {
    publicWriteRateLimiter?: FluentRateLimitBinding;
    styleClosetSurfaceBuilder?: StyleClosetSurfaceBuilder;
  } = {},
) {
  const budgetsEnvelopeSetupWidgetMeta = buildBudgetsEnvelopeSetupWidgetMeta(origin);
  const vNextReadSecuritySchemes = oauth2SecuritySchemes([
    FLUENT_MEALS_READ_SCOPE,
    FLUENT_STYLE_READ_SCOPE,
  ]);
  const vNextWriteSecuritySchemes = oauth2SecuritySchemes([
    FLUENT_MEALS_WRITE_SCOPE,
  ]);
  const vNextSharedProfileWriteSecuritySchemes = oauth2AlternativeSecuritySchemes([
    FLUENT_MEALS_WRITE_SCOPE,
    FLUENT_STYLE_WRITE_SCOPE,
  ]);
  const vNextBudgetWriteSecuritySchemes = oauth2AlternativeSecuritySchemes([
    FLUENT_MEALS_WRITE_SCOPE,
    FLUENT_STYLE_WRITE_SCOPE,
  ]);
  const vNextStyleWriteSecuritySchemes = oauth2SecuritySchemes([FLUENT_STYLE_WRITE_SCOPE]);
  const vNextStyleReadSecuritySchemes = oauth2SecuritySchemes([FLUENT_STYLE_READ_SCOPE]);
  const withVNextReadSecurity = <T extends Record<string, unknown>>(config: T) => withToolSecurity(config, vNextReadSecuritySchemes);
  const withVNextWriteSecurity = <T extends Record<string, unknown>>(config: T) => withToolSecurity(config, vNextWriteSecuritySchemes);
  const withVNextSharedProfileWriteSecurity = <T extends Record<string, unknown>>(config: T) => withToolSecurity(config, vNextSharedProfileWriteSecuritySchemes);
  const withVNextBudgetWriteSecurity = <T extends Record<string, unknown>>(config: T) => withToolSecurity(config, vNextBudgetWriteSecuritySchemes);
  const withVNextStyleClosetWriteSecurity = <T extends Record<string, unknown>>(config: T) => withToolSecurity(config, vNextStyleWriteSecuritySchemes);
  const withVNextStyleReadSecurity = <T extends Record<string, unknown>>(config: T) => withToolSecurity(config, vNextStyleReadSecuritySchemes);

  server.registerTool(
    FLUENT_ACCOUNT_PROFILE_TOOL,
    withToolSecurity({
      title: 'Get Fluent Account Profile',
      description: 'Return the account profile represented by the authenticated connection for account labeling. The opaque ID remains stable across reconnects, token refresh, and display-name changes.',
      inputSchema: z.object({}).strict(),
      outputSchema: accountProfileSchema,
      annotations: { title: 'Get Fluent Account Profile', readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
      _meta: { 'openai/profile': true },
    }, oauth2AlternativeSecuritySchemes([FLUENT_MEALS_READ_SCOPE, FLUENT_STYLE_READ_SCOPE])),
    async () => {
      requireAnyScope([FLUENT_MEALS_READ_SCOPE, FLUENT_STYLE_READ_SCOPE]);
      const profile = buildAccountProfile(await fluentCore.getProfile());
      return { structuredContent: profile, content: [{ type: 'text' as const, text: JSON.stringify(profile) }] };
    },
  );

  server.registerResource(
    'fluent-budgets-envelope-setup-widget-v1',
    BUDGETS_ENVELOPE_SETUP_TEMPLATE_URI,
    {
      title: 'Budget Envelopes Widget',
      description: 'Rich Fluent setup surface for declared clothing and grocery budget envelopes.',
      mimeType: 'text/html;profile=mcp-app',
      icons: iconFor(origin),
      _meta: budgetsEnvelopeSetupWidgetMeta,
    },
    async () => ({
      contents: [
        {
          uri: BUDGETS_ENVELOPE_SETUP_TEMPLATE_URI,
          mimeType: 'text/html;profile=mcp-app',
          text: getBudgetsEnvelopeSetupWidgetHtml(),
          _meta: budgetsEnvelopeSetupWidgetMeta,
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
      description: 'Data-minimized Fluent account access, domain, entitlement, export, deletion, and support status.',
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
    'fluent_get_capabilities',
    withVNextReadSecurity({
      title: 'Get Fluent Capabilities',
      description:
        'Fetch backend mode, contract version, available domains, enabled domains, onboarding state, and starter workflow discovery hints for Fluent tool routing.',
      annotations: { title: 'Get Fluent Capabilities', readOnlyHint: true, idempotentHint: true },
    }),
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
        host_family: fluentHostFamilySchema.optional(),
        intent: z.enum(['read', 'write', 'render', 'plan', 'onboard', 'unknown']).optional(),
        user_goal: z.string().optional(),
      },
      annotations: { title: 'Get Fluent Next Actions', readOnlyHint: true, idempotentHint: true },
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
      annotations: { title: 'Get Fluent Profile', readOnlyHint: true, idempotentHint: true },
    },
    async () => {
      requireAnyScope([FLUENT_MEALS_READ_SCOPE, FLUENT_HEALTH_READ_SCOPE, FLUENT_STYLE_READ_SCOPE]);
      return toolResult(await fluentCore.getProfile());
    },
  );

  const vNextReadServices = buildFluentVNextReadServices(fluentCore, meals, style, budgets);
  const vNextWriteServices = buildFluentVNextWriteServices(fluentCore, meals, style, budgets, {
    publicWriteRateLimiter: options.publicWriteRateLimiter,
  });

  server.registerTool(
    'fluent_get_shared_profile',
    withVNextReadSecurity({
      title: 'Get Fluent Shared Profile',
      description:
        'Fetch the shared profile envelope: core profile facts, capabilities, boundaries, and provenance-ready fact slots. Domain-specific payloads stay typed and are not flattened into generic memory.',
      inputSchema: {
        domains: z.array(fluentVNextDomainSchema).optional().describe('Optional domains to include in the shared profile envelope. Omit for the canonical public MCP profile.'),
        include_provenance: z.boolean().optional().describe('Set true only when the user asks where profile facts came from. Omit for a compact profile read.'),
      },
      annotations: {
        title: 'Get Fluent Shared Profile',
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    }),
    async () => {
      requireAnyScope([FLUENT_MEALS_READ_SCOPE, FLUENT_HEALTH_READ_SCOPE, FLUENT_STYLE_READ_SCOPE]);
      const profile = await getFluentVNextSharedProfile(vNextReadServices, { host: resolveHostFamily() });
      return vNextToolResult(profile);
    },
  );

  server.registerTool(
    'fluent_get_context',
    withVNextReadSecurity({
      title: 'Start Here: Fluent Context',
      description:
        'Fetch a compact context packet for a domain and intent. Use this first for broad Meals planning, currentness checks, "what Fluent knows", and weeknight meal planning: call fluent_get_context with domain="meals" and intent="planning". Also use it before any closet-grounded "what should I wear?", "which shoes?", or owned-item outfit answer: call fluent_get_context with domain="style" and intent="closet" before naming items the user owns. The host model owns reasoning and final judgment; Fluent supplies durable context, typed items, evidence gaps, freshness, and suggested writeback boundaries.',
      inputSchema: {
        amount: z.number().min(0).optional().describe('Required for domain="style", intent="purchase" with a candidate. Candidate purchase amount in CAD for budget arithmetic; it must match candidate.price_text or fall within its cited range. Fluent will not infer or default it.'),
        candidate: fluentVNextPurchaseCandidateSchema.optional(),
        detail: z
          .enum(['summary'])
          .optional()
          .describe('Optional compactness hint. Omit this or set summary; public Fluent context is always compact and never a full raw detail dump.'),
        domain: fluentVNextDomainSchema,
        intent: fluentVNextIntentSchema.optional(),
      },
      annotations: {
        title: 'Start Here: Fluent Context',
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    }),
    async ({ amount, candidate, detail, domain, intent }) => {
      requireVNextReadScope(domain);
      const context = await getFluentVNextContext(vNextReadServices, {
        amount: amount ?? null,
        candidate,
        detail: detail ?? 'summary',
        domain,
        host: resolveHostFamily(),
        intent,
      });
      return vNextToolResult(context, {
        compactContextSummaryText: context.detail === 'summary',
        includeMediaReferences: domain === 'style' && intent === 'purchase' && Boolean(candidate),
        preserveStylePurchaseOwnedSlice: domain === 'style' && intent === 'purchase' && Boolean(candidate),
      });
    },
  );

  server.registerTool(
    'fluent_list_items',
    withVNextReadSecurity({
      title: 'List Fluent Items',
      description:
        'List typed domain items such as Meals recipes, the living grocery list, inventory items, and Style closet items. Results are incomplete whenever nextCursor is returned: never conclude that an item is absent until relevant pages are exhausted or a confident match is found. Prefer targeted query values before broad inventory traversal. For saved Meals recipe discovery, pass item_type="recipe" plus query for the recipe title or ID, then call fluent_get_item with the returned ID before deriving grocery-list deltas. For Style photo ingestion, search discriminating brand or graphic text, garment description, and category/color evidence before creating; a matching item without Catalog media is an incomplete existing item to repair, not a new item. For owned-item outfit or shoe advice, list the relevant active Style category before recommending a saved item, then visually inspect shortlisted items through focused fluent_get_media_bundle calls. The shared envelope is generic, but the payload remains the canonical typed domain record.',
      inputSchema: {
        cursor: z.string().optional().describe('Opaque pagination cursor returned by a prior Fluent list call. Omit for the first page. When nextCursor is returned and no confident match exists, pass it to continue relevant pagination before concluding absence.'),
        domain: fluentVNextDomainSchema,
        item_type: fluentVNextItemTypeSchema.optional(),
        limit: z.number().int().min(1).max(50).optional().describe('Optional maximum number of items to return, from 1 to 50. Omit to use Fluent defaults.'),
        query: fluentVNextItemQuerySchema.optional(),
        status: z.enum(['active', 'archived', 'planned', 'completed', 'any']).optional().describe(
          'Optional lifecycle filter. Use active for normal saved state, planned for future meal/grocery state, completed for done items, archived for inactive memory, or any when the user asks broadly.',
        ),
      },
      annotations: {
        title: 'List Fluent Items',
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    }),
    async ({ cursor, domain, item_type, limit, query, status }) => {
      requireVNextReadScope(domain);
      const page = await listFluentVNextItemsPage(vNextReadServices, { cursor, domain, itemType: item_type, limit, query, status });
      // Style list items are compacted (see vnext-read-layer compactStyleListItem), so a full page fits the
      // model-visible text budget — let the host see every item on the page instead of the default 8-item
      // array cap that hid 91 of a 99-item closet. Other domains' list items are not yet compacted, so they
      // keep the conservative cap until they get an analogous compact projection.
      return vNextToolResult(page, {
        followUpGuidance: domain === 'style'
          ? [
              'Required continuation for closet-grounded outfit or shoe advice:',
              'follow nextCursor until it is null whenever the user asks for an outfit from the whole saved closet; the first page is not collection completeness.',
              'inspect plausible winners with separate focused fluent_get_media_bundle calls before making a visual choice.',
              'For one winning owned item, call fluent_render_style_closet_surface with only that exact ID, presentation.mode="recommendation", the same focused_item_id, and one concise recommendation_reason.',
              'For a complete outfit, render only the 3 to 5 selected exact saved IDs with presentation.mode="comparison"; name every selected item and offer at most one exact-owned replacement.',
              'Reserve presentation.mode="detail" for an explicit request to inspect or manage the full saved item.',
              'Do not end with prose alone or substitute a category-filtered closet for the exact recommended-item detail.',
              ...(page.items.some(styleItemHasNoPhoto)
                ? [STYLE_ITEM_NEEDS_PHOTO_GUIDANCE]
                // Only on targeted lookups (a search, as in the add-a-photo flow, or a short page), not on
                // whole-closet browsing pages. A search can match many items, so it is not count-capped.
                : (Boolean(query?.trim()) || page.items.length <= 3) && page.items.some(styleItemHasPhotos)
                  ? [styleItemAddMorePhotosGuidance()]
                  : []),
            ].join(' ')
          : undefined,
        preserveListItems: domain === 'style',
      });
    },
  );

  server.registerTool(
    'fluent_get_item',
    withVNextReadSecurity({
      title: 'Get Fluent Item',
      description:
        'Fetch one typed domain item with its canonical payload and provenance hooks. For Meals meal plans, use item_type="meal_plan" with item_id="current_meal_plan", a saved plan ID, or a week-start date returned by fluent_list_items. For Meals recipes, use the stable recipe ID returned by fluent_list_items; an exact saved recipe title is accepted as a fallback lookup, but do not invent IDs.',
      inputSchema: {
        domain: fluentVNextDomainSchema,
        item_id: z.string().describe('Stable saved item ID returned by fluent_list_items. For Meals meal plans, current_meal_plan and week-start dates are accepted. For Meals recipes, an exact saved recipe title is accepted when no ID is available.'),
        item_type: fluentVNextItemTypeSchema.optional(),
        view: readViewSchema,
      },
      annotations: { title: 'Get Fluent Item', readOnlyHint: true, idempotentHint: true },
    }),
    async ({ domain, item_id, item_type, view }) => {
      requireVNextReadScope(domain);
      const item = await getFluentVNextItem(vNextReadServices, { domain, itemId: item_id, itemType: item_type });
      const result = vNextToolResult(item, {
        followUpGuidance: domain === 'style' && styleItemHasNoPhoto(item)
          ? `This saved closet item has no photo yet. It is a complete saved item. Offer once to add a photo (a product shot or an on-you photo) and save it with fluent_set_style_item_image for this item_id; the first photo becomes its cover. Do not ask repeatedly. ${styleUploadedPhotoDataUrlStep(item_id)}`
          : domain === 'style' && styleItemHasPhotos(item)
            ? styleItemAddMorePhotosGuidance(item_id)
            : undefined,
        preserveRecipeIngredients: domain === 'meals' && item_type === 'recipe' && view === 'full',
      }) as VNextToolResult;
      if (domain === 'style' && activeReanalyzeDirective(item)) {
        await appendStyleReanalyzePrimaryPhotoInlineContent(result, vNextReadServices, item_id);
      }
      return result;
    },
  );

  server.registerTool(
    'fluent_list_evidence',
    withVNextReadSecurity({
      title: 'List Fluent Evidence',
      description:
        'List evidence, provenance, source snapshots, event history, or evidence gaps for a subject or claim. For Meals recipe-to-grocery reasoning, pass the saved recipe ID or exact saved recipe title as subject to ground ingredients before proposing a grocery-list delta. Evidence can inform host reasoning, but it is not a final plan, style verdict, medical judgment, or checkout action.',
      inputSchema: {
        claim: fluentVNextEvidenceClaimSchema.optional(),
        domain: fluentVNextDomainSchema.optional(),
        subject: fluentVNextEvidenceSubjectSchema.optional(),
      },
      annotations: { title: 'List Fluent Evidence', readOnlyHint: true, idempotentHint: true },
    }),
    async ({ claim, domain, subject }) => {
      if (domain) {
        requireVNextReadScope(domain);
      } else {
        requireAnyScope([FLUENT_MEALS_READ_SCOPE, FLUENT_HEALTH_READ_SCOPE, FLUENT_STYLE_READ_SCOPE]);
      }
      const evidence = await listFluentVNextEvidence(vNextReadServices, { claim, domain, subject });
      return vNextToolResult(evidence, { preserveRecipeIngredients: domain === 'meals' });
    },
  );

  server.registerTool(
    'fluent_get_media_bundle',
    withVNextStyleReadSecurity({
      title: 'Get Fluent Media Bundle',
      description:
        'Fetch host-inspectable media references and constraints for a subject. Fluent provides media provenance and delivery; the host model must inspect images before making visual claims. For visual outfit or shoe advice in ChatGPT, call this separately for each shortlisted saved item using subject or a singleton item_ids array so the focused item can include model-visible pixels; multi-item bundles are references-only. Never rank visual color, proportion, texture, or silhouette from item text or image URLs alone.',
      inputSchema: {
        candidate: fluentVNextMediaCandidateSchema.optional(),
        delivery_mode: fluentVNextMediaBundleDeliveryModeSchema.optional(),
        domain: z.enum(['style']).describe('Only style media bundles are implemented in the public profile.'),
        item_ids: z.array(z.string()).max(10).optional().describe(
          'Optional saved Fluent style item IDs to include as visual references or comparators. Use IDs returned by fluent_list_items or fluent_get_item.',
        ),
        purpose: fluentVNextMediaBundlePurposeSchema.optional(),
        subject: z.string().optional().describe(
          'Optional saved Fluent style item ID that is the main subject of the media request. Use an ID returned by fluent_list_items or fluent_get_item.',
        ),
      },
      annotations: { title: 'Get Fluent Media Bundle', readOnlyHint: true, idempotentHint: true },
      // Kept widget-callable for transition safety: a host still running a CACHED v1 closet widget may call
      // this read tool on flip. Hosts gate component-initiated calls on this flag; dropping it would
      // make those cached widgets' fit-photo reads fail. The current widget fetches the fit photo
      // server-side and does NOT call this — the flag is harmless (read-only, style-read scoped) here.
      _meta: { 'openai/widgetAccessible': true },
    }),
    async ({ candidate, delivery_mode, domain, item_ids, purpose, subject }) => {
      requireVNextReadScope(domain);
      const bundle = await getFluentVNextMediaBundle(vNextReadServices, {
          candidate,
          deliveryMode: delivery_mode,
          domain,
          itemIds: item_ids,
          purpose,
          subject,
        });
      // Re-analysis rides on THIS path too: the style-enrichment guidance steers the model to call
      // fluent_get_media_bundle (not fluent_get_item) to load a saved item's photo, so a queued
      // re-analysis must surface the firm directive + inline pixels here as well. Gated on a SINGLE
      // focused style item that is reanalyzePending (TTL); non-pending or multi-item comparator
      // bundles are returned unchanged (no directive, no inline-photo fetch, no payload bloat).
      const focusedStyleItemId = domain === 'style' && bundle ? singleStyleFocusItemId(subject, item_ids) : null;
      if (focusedStyleItemId) {
        // Inline the focused item's primary photo for ANY single-item style media read, not only when a
        // re-analysis is pending. Hosts that cannot self-fetch an external reference URL (e.g. ChatGPT apps)
        // otherwise receive references-only and no viewable pixels. Reuses the hardened no-UA/no-store fetcher
        // + avif-reject + honest degrade note in appendStyleReanalyzeInlinePhotoFromBundle. The reanalyze
        // directive/responseGuidance is layered on ONLY when a re-analysis is actually pending. Multi-item /
        // comparator requests have no single focus (focusedStyleItemId null) and stay references-only below.
        const focusedItem = await getFluentVNextItem(vNextReadServices, { domain: 'style', itemId: focusedStyleItemId });
        const directive = activeReanalyzeDirective(focusedItem);
        const responseGuidance = directive ? recordOrNull(focusedItem)?.responseGuidance : null;
        const enriched = directive
          ? { ...bundle, reanalyzeDirective: directive, ...(responseGuidance ? { responseGuidance } : {}) }
          : bundle;
        const result = vNextToolResult(enriched, { includeMediaReferences: true }) as VNextToolResult;
        await appendStyleReanalyzeInlinePhotoFromBundle(result, bundle, { reanalyzePending: Boolean(directive) });
        return result;
      }
      return vNextToolResult(bundle, { includeMediaReferences: true });
    },
  );

  server.registerTool(
    'fluent_get_purchase_context',
    withVNextReadSecurity({
      title: 'Get Fluent Purchase Context',
      description:
        'Fetch the reduced Fluent budget signal for a style clothing or meals grocery purchase. Returns declared envelope pressure and caveats only; the host model still owns purchase judgment, planning, and user-facing reasoning. For a Style purchase verdict, prefer fluent_get_context(domain="style", intent="purchase", candidate, amount), which returns the owned-category slice AND a budget over/under fact in one read; this tool returns only a category budget summary and does not reconcile a candidate price unless you pass amount.',
      inputSchema: {
        amount: z.number().min(0).optional().describe('Optional candidate purchase amount in CAD. Omit when no price is known; Fluent will not infer a price.'),
        category: fluentVNextBudgetCategorySchema,
      },
      annotations: { title: 'Get Fluent Purchase Context', readOnlyHint: true, idempotentHint: true },
    }),
    async ({ amount, category }) => {
      requireBudgetReadScope(category);
      const context = await getFluentVNextPurchaseContext(vNextReadServices, {
        amount: amount ?? null,
        category,
      });
      return vNextToolResult(context);
    },
  );

  server.registerTool(
    'fluent_update_shared_profile_patch',
    withVNextSharedProfileWriteSecurity({
      title: 'Update Fluent Shared Profile Patch',
      description:
        'Apply an explicit, provenance-backed profile patch through the canonical shared or domain profile service. Use only when the user intends to change durable Fluent memory.',
      inputSchema: fluentVNextSharedProfileToolInputSchema,
      annotations: { title: 'Update Fluent Shared Profile Patch', readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
    }),
    async (args) => {
      const exact = fluentVNextSharedProfileExactInputSchema.parse(withoutNullSharedProfilePattern(args));
      const authProps = requireVNextWriteScope(exact.domain);
      return vNextToolResult(
        await updateFluentVNextSharedProfilePatch(vNextWriteServices, {
          domain: exact.domain,
          host: resolveHostFamily(),
          patch: exact.patch,
          provenance: buildMutationProvenance(authProps, args),
        }),
      );
    },
  );

  server.registerTool(
    'fluent_set_budget_envelope',
    withVNextBudgetWriteSecurity({
      title: 'Set Fluent Budget Envelope',
      description:
        'Set one declared monthly budget envelope for style clothing or meals groceries and return read-after-write purchase context. Use only when the user explicitly asks Fluent to remember the envelope. This does not import transactions, connect Plaid, build dashboards, browse retailers, or make purchase decisions.',
      inputSchema: {
        approval: fluentVNextRecipeWriteApprovalSchema,
        category: fluentVNextBudgetCategorySchema,
        currency: z.literal('CAD').optional().describe('Currency for this R-1 envelope. CAD is the only supported public currency.'),
        monthly_amount: z.number().positive().describe('Declared monthly envelope amount in CAD.'),
        response_mode: writeResponseModeSchema,
        ...provenanceInputSchema,
      },
      annotations: { title: 'Set Fluent Budget Envelope', readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
      // The envelope-setup MCP App writes through the app->host bridge; hosts gate
      // widget-initiated tool calls on this flag.
      _meta: { 'openai/widgetAccessible': true },
    }),
    async (args) => {
      await requireExplicitPublicWriteApproval(
        args.approval,
        'fluent_set_budget_envelope',
        options.publicWriteRateLimiter,
      );
      const authProps = requireBudgetWriteScope(args.category);
      return vNextToolResult(
        await setFluentBudgetEnvelope(vNextWriteServices, {
          category: args.category,
          currency: args.currency ?? 'CAD',
          monthlyAmount: args.monthly_amount,
          provenance: buildMutationProvenance(authProps, args),
        }),
      );
    },
  );

  server.registerTool(
    'fluent_log_budget_spend',
    withVNextBudgetWriteSecurity({
      title: 'Log Fluent Budget Spend',
      description:
        'Log one explicit user-approved budget spend event or correction for style clothing or meals groceries and return read-after-write purchase context. This is manual declared spend only; it does not import transactions, connect accounts, sync cards, browse retailers, or create category taxonomies.',
      inputSchema: {
        approval: fluentVNextRecipeWriteApprovalSchema,
        amount: z.number().describe('Spend amount in CAD. Use a negative amount only for an explicit correction or reversal approved by the user.'),
        category: fluentVNextBudgetCategorySchema,
        note: z.string().max(240).optional().describe('Optional short user-facing note for this manual spend event.'),
        occurred_on: fluentVNextIsoDateSchema.optional().describe('Optional date the spend occurred, formatted YYYY-MM-DD. Omit to use today in the Fluent profile timezone.'),
        response_mode: writeResponseModeSchema,
        ...provenanceInputSchema,
      },
      annotations: { title: 'Log Fluent Budget Spend', readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
    }),
    async (args) => {
      await requireExplicitPublicWriteApproval(args.approval, 'fluent_log_budget_spend', options.publicWriteRateLimiter);
      const authProps = requireBudgetWriteScope(args.category);
      return vNextToolResult(
        await logFluentBudgetSpend(vNextWriteServices, {
          amount: args.amount,
          category: args.category,
          note: args.note ?? null,
          occurredOn: args.occurred_on ?? null,
          provenance: buildMutationProvenance(authProps, args),
        }),
      );
    },
  );

  server.registerTool(
    'fluent_save_recipe',
    withVNextWriteSecurity({
      title: 'Save Fluent Recipe',
      description:
        'Save one complete, user-approved Meals recipe through the recipe validator and return read-after-write proof. Use only after the user explicitly approves saving the recipe.',
      inputSchema: {
        approval: fluentVNextRecipeWriteApprovalSchema,
        recipe: recipeDocumentSchema.describe(
          'User-approved recipe document to save. Include only fields the user supplied or explicitly approved; do not invent missing quantities, servings, nutrition, cost, or timing.',
        ),
        response_mode: writeResponseModeSchema,
        ...provenanceInputSchema,
      },
      annotations: { title: 'Save Fluent Recipe', readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
    }),
    async (args) => {
      const authProps = requireVNextWriteScope('meals');
      return vNextToolResult(
        await saveFluentVNextRecipe(vNextWriteServices, {
          approval: args.approval,
          provenance: buildMutationProvenance(authProps, args),
          recipe: args.recipe,
        }),
      );
    },
  );

  server.registerTool(
    'fluent_update_recipe_patch',
    withVNextWriteSecurity({
      title: 'Update Fluent Recipe Patch',
      description:
        'Apply a typed sparse patch to an existing saved Meals recipe and return read-after-write proof. This cannot change recipe identity or create grocery/cart/order state.',
      inputSchema: {
        approval: fluentVNextRecipeWriteApprovalSchema,
        patch: fluentVNextRecipePatchSchema,
        recipe_id: z.string().min(1).describe('Existing saved Fluent recipe ID returned by fluent_list_items or fluent_get_item.'),
        response_mode: writeResponseModeSchema,
        ...provenanceInputSchema,
      },
      annotations: { title: 'Update Fluent Recipe Patch', readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
    }),
    async (args) => {
      const authProps = requireVNextWriteScope('meals');
      // The cached ChatGPT 1.0.0 schema requires patch.mode="merge"; it is a marker, not a field.
      const { mode: _legacyMergeMode, ...patch } = args.patch;
      return vNextToolResult(
        await updateFluentVNextRecipePatch(vNextWriteServices, {
          approval: args.approval,
          patch,
          provenance: buildMutationProvenance(authProps, args),
          recipeId: args.recipe_id,
        }),
      );
    },
  );

  server.registerTool(
    'fluent_record_recipe_feedback',
    withVNextWriteSecurity({
      title: 'Record Fluent Recipe Feedback',
      description:
        'Record explicit feedback for one saved Meals recipe and return read-after-write proof. This is recipe evidence, not a global preference, allergy, inventory, grocery, cart, or order update.',
      inputSchema: {
        approval: fluentVNextRecipeWriteApprovalSchema,
        feedback: fluentVNextRecipeFeedbackSchema,
        recipe_id: z.string().min(1).describe('Existing saved Fluent recipe ID that this feedback is about.'),
        response_mode: writeResponseModeSchema,
        ...provenanceInputSchema,
      },
      annotations: { title: 'Record Fluent Recipe Feedback', readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
    }),
    async (args) => {
      const authProps = requireVNextWriteScope('meals');
      return vNextToolResult(
        await recordFluentVNextRecipeFeedback(vNextWriteServices, {
          approval: args.approval,
          feedback: args.feedback,
          provenance: buildMutationProvenance(authProps, args),
          recipeId: args.recipe_id,
        }),
      );
    },
  );

  server.registerTool(
    'fluent_save_meal_plan',
    withVNextWriteSecurity({
      title: 'Save Fluent Meal Plan',
      description:
        'Save one explicit user-approved, host-authored Meals plan, derive its grocery plan from the referenced saved recipes, and return read-after-write proof for both the meal plan and living grocery list. Use only after the host model drafts the plan in conversation and the user approves saving it. This does not browse retailers, mutate carts, save recipes, or infer pantry/inventory truth.',
      inputSchema: {
        approval: fluentVNextRecipeWriteApprovalSchema,
        plan: fluentVNextMealPlanSchema,
        response_mode: writeResponseModeSchema,
        ...provenanceInputSchema,
      },
      annotations: { title: 'Save Fluent Meal Plan', readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
    }),
    async (args) => {
      const authProps = requireVNextWriteScope('meals');
      return vNextToolResult(
        await saveFluentVNextMealPlan(vNextWriteServices, {
          approval: args.approval,
          plan: args.plan,
          provenance: buildMutationProvenance(authProps, args),
        }),
      );
    },
  );

  server.registerTool(
    'fluent_apply_grocery_list_change',
    withVNextWriteSecurity({
      title: 'Apply Fluent Grocery List Change',
      description:
        'Apply one explicit user-approved change to the current living Meals grocery list and return read-after-write proof. Use change.kind exactly as one of add_item, mark_plan_item, substitute_plan_item, or update_manual_item. This does not browse retailers, mutate carts, place orders, save recipes, or write broad preferences.',
      inputSchema: {
        approval: fluentVNextRecipeWriteApprovalSchema,
        change: fluentVNextGroceryListChangeSchema,
        currentness_confirmed: z.boolean().optional().describe(
          'Required only when the current grocery list is stale or incomplete and the user explicitly confirms they still want to edit that list.',
        ),
        list_id: z.string().optional().describe('Optional current grocery-list ID from a recent readback; used to prevent target mismatches.'),
        list_version: z.string().optional().describe('Optional current grocery-list version from a recent readback; used to prevent stale writes.'),
        response_mode: writeResponseModeSchema,
        week_start: z.string().optional().describe('Optional selected meal-plan week start from the current grocery-list readback.'),
        ...provenanceInputSchema,
      },
      annotations: { title: 'Apply Fluent Grocery List Change', readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
      _meta: {
        'openai/widgetAccessible': true,
        ui: {
          visibility: ['model', 'app'],
        },
      },
    }),
    async (args) => {
      const authProps = requireVNextWriteScope('meals');
      return vNextToolResult(
        await applyFluentVNextGroceryListChange(vNextWriteServices, {
          approval: args.approval,
          change: args.change,
          currentnessConfirmed: args.currentness_confirmed,
          listId: args.list_id,
          listVersion: args.list_version,
          provenance: buildMutationProvenance(authProps, args),
          weekStart: args.week_start,
        }),
      );
    },
  );

  server.registerTool(
    'fluent_apply_grocery_shopping_result',
    withVNextWriteSecurity({
      title: 'Apply Fluent Grocery Shopping Result',
      description:
        'Reconcile a completed shopping trip in one explicit user-approved action, then return read-after-write proof. Use selection.kind="selected_items" with a non-empty bought_items list, or selection.kind="all_to_buy" with a stable idempotency_key. Choose exactly one selection kind. This does not browse retailers, mutate carts, place orders, invent new items, or infer quantities.',
      inputSchema: fluentVNextGroceryShoppingResultInputSchema,
      annotations: { title: 'Apply Fluent Grocery Shopping Result', readOnlyHint: false, idempotentHint: true, destructiveHint: false, openWorldHint: false },
      _meta: {
        'openai/widgetAccessible': true,
        ui: {
          visibility: ['model', 'app'],
        },
      },
    }),
    async (args) => {
      const authProps = requireVNextWriteScope('meals');
      const selection = args.selection;
      const legacyBoughtItems = fluentVNextGroceryShoppingItemSchema.array().min(1).safeParse(args.bought_items);
      const legacyMarkAll = args.mark_all_to_buy_bought === true;
      if (selection && (args.bought_items !== undefined || args.mark_all_to_buy_bought !== undefined)) {
        throw new Error('fluent_apply_grocery_shopping_result accepts only selection; do not combine it with legacy selection fields.');
      }
      if (!selection && legacyBoughtItems.success && legacyMarkAll) {
        throw new Error('Cached widget payload must choose bought_items or mark_all_to_buy_bought, not both.');
      }
      if (!selection && !legacyBoughtItems.success && !legacyMarkAll) {
        throw new Error('fluent_apply_grocery_shopping_result requires selection.');
      }
      const selectedItems = selection?.kind === 'selected_items'
        ? selection.bought_items
        : legacyBoughtItems.success
          ? legacyBoughtItems.data
          : undefined;
      return vNextToolResult(
        await applyFluentVNextGroceryShoppingResult(vNextWriteServices, {
          checkbox: selection?.kind === 'item_checkbox' ? {
            itemKey: selection.item_key, checked: selection.checked, purchaseId: selection.purchase_id,
          } : undefined,
          boughtItems: selectedItems?.map((entry) => ({ itemKey: entry.item_key, status: entry.status })),
          approval: args.approval,
          currentnessConfirmed: args.currentness_confirmed,
          idempotencyKey: typeof args.idempotency_key === 'string' ? args.idempotency_key : undefined,
          listId: args.list_id,
          listVersion: args.list_version,
          markAllToBuyBought: selection?.kind === 'all_to_buy' || legacyMarkAll,
          provenance: buildMutationProvenance(authProps, args),
          readbackMode: args.response_mode === 'ack' ? 'compact' : 'full',
          weekStart: args.week_start,
        }),
      );
    },
  );

  server.registerTool(
    'fluent_update_style_item_patch',
    withVNextStyleClosetWriteSecurity({
      title: 'Update Fluent Style Item Patch',
      description:
        'Update one saved Style item with read-after-write proof. Use patch for catalog details, product_enrichment with an empty patch for a linked product and attributed material/care facts, or photo_library for photo arrangement. Tags and styling descriptors belong in fluent_refresh_style_item_profile. For user-approved closet management only; Fluent does not browse retailers or read email.',
      inputSchema: {
        approval: fluentVNextRecipeWriteApprovalSchema,
        expected_duplicate_merge_id: z.string().uuid().optional().describe('Duplicate-merge Undo only: exact merge cycle supplied by the original combine action. Stale cycles fail closed.'),
        item_id: z.string().min(1).describe('Existing saved Fluent Style item ID.'),
        patch: fluentStyleItemPatchSchema,
        product_enrichment: productEnrichmentSchema.optional().describe('Save host-researched product identity and attributed facts. Read productReference.revision first; use 0 if absent. Supply an empty patch. No browsing, photo changes or ownership edits occur. For new items, create first then enrich the returned item ID.'),
        photo_library: z.object({expected_revision:z.string().regex(/^[a-f0-9]{64}$/),operation_id:z.string().uuid(),action:photoLibraryActionSchema}).optional().describe('Manage retained photos with the exact revision from the closet render and an empty patch. Removal preserves files. Undo requires the unchanged saved revision.'),
        provenance: nestedProvenanceSchema.describe('Who/what initiated this explicit user-approved closet edit; acceptance_test provenance stays non-durable.'),
        response_mode: fluentStyleClosetWriteResponseModeSchema,
        source_snapshot: fluentVNextSourceSnapshotSchema.optional(),
        ...provenanceInputSchema,
      },
      annotations: { title: 'Update Fluent Style Item Patch', readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
      _meta: {
        // Widget-callable for the closet edit form; stays model-visible. All closet write tools
        // (patch, set-image, archive) are model-visible; archive's "explicit user signal only" gate
        // lives in guidance, not by hiding the tool.
        'openai/widgetAccessible': true,
      },
    }),
    async (args) => {
      await requireExplicitPublicWriteApproval(
        args.approval,
        'fluent_update_style_item_patch',
        options.publicWriteRateLimiter,
      );
      const authProps = requireStyleClosetWriteScope();
      const { mode: _legacyMergeMode, ...patch } = args.patch;
      const ack = await updateFluentStyleItemPatch(vNextWriteServices, {
        productEnrichment: args.product_enrichment,
        photoLibrary: args.photo_library,
        expectedDuplicateMergeId: args.expected_duplicate_merge_id,
        itemId: args.item_id,
        patch,
        provenance: buildStyleClosetMutationProvenance(authProps, args),
        sourceSnapshot: args.source_snapshot,
      });
      return toolResult(ack, {
        structuredContent: ack,
        textData: ack.durable === true && ack.status === 'applied'
          ? ack.readbackStatus === 'unavailable'
            ? `Updated style item ${args.item_id}. ${ack.recovery}`
            : `Updated style item ${args.item_id}.`
          : `Style item ${args.item_id} was not saved; inspect the returned write result.`,
      });
    },
  );

  server.registerTool(
    'fluent_create_style_item',
    withVNextStyleClosetWriteSecurity({
      title: 'Create Fluent Style Item',
      description:
        'Create one NEW Style closet item from a profile YOU (the host model) produced from the user\'s photo or description. A photo is optional but strongly encouraged: when you have a usable image, include it so the item gets a cover. With a reviewed primary Catalog image set catalog_ready=true; in ChatGPT prefer image_file for an uploaded image, or pass the exact inspected direct public HTTPS image as image_url and Fluent will copy and validate its bytes before the atomic create. When the Catalog is host-generated, also pass the exact retained source evidence through source_image_file (or its bounded data/hosted-file equivalent) in the same call. Without catalog_ready, an image is saved as the item\'s ordinary photo after the create; with no image at all the item is saved with photoStatus "needs_photo", and you should offer once to add a photo with fluent_set_style_item_image. Fluent stores and hashes the bytes, binds the reviewed Catalog to its source, surfaces possible duplicates for YOU to judge, and returns read-after-write proof plus an exact reviewHandoff. In UI-capable hosts, a successful create directly presents the exact saved item in the current Closet app; the reviewHandoff is the text-only/non-UI fallback. A created item is active; ingestion_review is a render presentation mode, not a pending_review lifecycle status. Fluent does not inspect images, browse or scrape product pages, resolve product galleries, generate images, or infer taste; you own the visual judgment. For explicit user-approved closet onboarding only.',
      inputSchema: {
        approval: fluentVNextRecipeWriteApprovalSchema,
        category: z.enum(['TOP', 'BOTTOM', 'OUTERWEAR', 'SHOE', 'ACCESSORY']).describe('Canonical category (closed set).'),
        subcategory: z.string().min(1).describe('Short garment type, e.g. Tee, Jean, Sneaker.'),
        brand: z.string().nullable().optional().describe('Brand from a legible tag; null if unsure (do not guess).'),
        name: z.string().nullable().optional(),
        size: z.string().nullable().optional(),
        color_family: z.string().nullable().optional().describe('Dominant color family; Fluent normalizes to its canonical lowercase set.'),
        color_name: z.string().nullable().optional().describe('Specific colorway, e.g. Indigo.'),
        color_hex: z.string().nullable().optional().describe('Dominant color as #RRGGBB.'),
        formality: z.number().int().min(1).max(5).nullable().optional(),
        comparator_key: z.string().optional().describe('Advisory hint only; Fluent re-infers the comparator key.'),
        profile: z.record(z.string(), z.unknown()).optional().describe('Rich item understanding (itemType, styleRole, fit, tags, dressCode, etc.).'),
        fit_assessment: fluentStyleItemFitAssessmentSchema,
        technical_metadata: z.record(z.string(), z.unknown()).optional().describe('Advisory descriptors (aestheticLane, fabricWeight, definition, ...); stored, not filtered.'),
        field_evidence: z.record(z.string(), z.unknown()).optional().describe('Per-field { value, source, confidence } evidence.'),
        overall_confidence: z.number().min(0).max(1).nullable().optional(),
        host_model: z.string().nullable().optional().describe('Identifier of the host model that produced this profile.'),
        image_file: openAiFileParamSchema.nullable().optional(),
        image_url: z.string().min(1).max(26_700_128).nullable().optional().describe('Optional direct public HTTPS image URL that the host already inspected and confirmed shows this garment. With catalog_ready=true Fluent copies, validates, hashes, and owns the image bytes before the atomic create; without catalog_ready it is kept by reference as the item\'s ordinary photo. Do not pass a product page or gallery URL. A ChatGPT upload link (files.oaiusercontent.com or chatgpt.com estuary content) is copied into Fluent-owned storage at write time, and a data: URL must contain real JPEG, PNG, or WebP bytes. Never pass an app-internal image handle (for example a code-mode image reference) or a local file path: Fluent saves the item without that photo (never Catalog-approved) and returns the exact step to attach it.'),
        image_data_url: z.string().min(1).max(26_700_128).nullable().optional().describe('Optional host-inspected full-resolution JPEG, PNG, or WebP data URL to store as owned Fluent media. Use for local files; never pass an uninspected image. Fluent validates the data-URL MIME, base64 payload, byte signature, and size server-side.'),
        hosted_file_download_url: z.string().url().nullable().optional().describe('Optional temporary OpenAI-hosted file download URL for an inspected uploaded image. Fluent downloads it once into owned media and never persists the bearer URL.'),
        catalog_ready: z.boolean().nullable().optional().describe('Set true only as host attestation that the submitted primary image is the reviewed Catalog presentation; it then requires exactly one primary image source. Fluent independently binds the stored bytes and source lineage. Omit it for an ordinary photo or for a photo-less save.'),
        image_origin: fluentStyleImageOriginSchema,
        source_image_file: openAiFileParamSchema.nullable().optional().describe('For image_origin="host_generated", the exact uploaded/source image retained as garment evidence. ChatGPT supplies its temporary download URL.'),
        source_image_data_url: z.string().min(1).max(26_700_128).nullable().optional().describe('For image_origin="host_generated", bounded full-resolution JPEG, PNG, or WebP source bytes retained as garment evidence.'),
        source_hosted_file_download_url: z.string().url().nullable().optional().describe('For image_origin="host_generated", the temporary hosted-file URL for exact retained source evidence. Fluent copies the bytes and does not persist the bearer URL.'),
        source_image_type: z.enum(['alternate', 'fit']).nullable().optional().describe('How to retain host-generated Catalog source evidence. Use fit for an on-you photo; otherwise alternate.'),
        background_removed: z.boolean().nullable().optional().describe('True only when useful transparency/background removal was verified in the submitted bytes.'),
        image_type: fluentStyleImageTypeSchema,
        on_duplicate: z.enum(['warn', 'force', 'skip']).optional().describe('warn (default) writes nothing and returns candidate matches with discriminating signals for YOU to compare against the garment (Fluent does not decide sameness); skip returns the existing match; force creates anyway.'),
        duplicate_candidate_id: z.string().min(1).optional().describe('Required with skip or force when Fluent returned duplicate candidates. Names the exact candidate to use or deliberately distinguish from.'),
        client_token: z.string().min(1).max(200).optional().describe('Idempotency token; a retry with the same token returns the same item.'),
        batch_id: z.string().trim().min(1).max(200).optional().describe('Correlates items from one approved import. A possible duplicate still writes nothing; continue unrelated garments and collect warned items for one consolidated decision turn.'),
        provenance: nestedProvenanceSchema.describe('Who/what initiated this explicit user-approved onboarding; acceptance_test provenance stays non-durable.'),
        response_mode: fluentStyleClosetWriteResponseModeSchema,
        source_snapshot: fluentVNextSourceSnapshotSchema.optional(),
        ...provenanceInputSchema,
      },
      outputSchema: fluentCreateStyleItemOutputSchema,
      annotations: { title: 'Create Fluent Style Item', readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
      _meta: {
        // Widget-callable so the onboarding/confirm surface can create items; model-visible like the patch tool.
        'openai/widgetAccessible': true,
        'openai/fileParams': ['image_file', 'source_image_file'],
        ui: { resourceUri: STYLE_CLOSET_TEMPLATE_URI },
        'openai/outputTemplate': STYLE_CLOSET_TEMPLATE_URI,
      },
    }),
    async (args) => {
      await requireExplicitPublicWriteApproval(args.approval, 'fluent_create_style_item', options.publicWriteRateLimiter);
      const authProps = requireStyleClosetWriteScope();
      const imageOrigin = args.image_origin ?? 'user_source';
      const catalogRequested = args.catalog_ready === true;
      const sentAnyPrimaryImage = [args.image_file?.download_url, args.image_url, args.image_data_url, args.hosted_file_download_url]
        .some((value) => typeof value === 'string' && value.trim().length > 0);
      // D24: the published ChatGPT app pins catalog_ready=true, so an on-you or detail photo arrives
      // as catalog_ready + image_type fit/alternate. A Catalog image must be the primary product
      // photo, so that photo is saved as an ORDINARY owned photo of its type (never Catalog-approved,
      // no Catalog binding) instead of rejecting the create. Host-generated media is not downgraded:
      // a generated Catalog cannot be a fit or alternate photo, so that combination still rejects.
      const catalogDowngradedTo = catalogRequested
        && imageOrigin === 'user_source'
        && sentAnyPrimaryImage
        && (args.image_type === 'fit' || args.image_type === 'alternate')
        ? args.image_type
        : null;
      const catalogReady = catalogRequested && catalogDowngradedTo === null;
      if (
        args.image_file?.file_id?.trim()
        && args.source_image_file?.file_id?.trim()
        && args.image_file.file_id.trim() === args.source_image_file.file_id.trim()
      ) {
        throw new Error('image_file and source_image_file must use distinct file_id values.');
      }
      if (imageOrigin === 'host_generated' && !catalogRequested) {
        // Generated media is display-only; its required source evidence is validated and retained
        // only by the atomic Catalog transaction, so an ordinary-photo create cannot carry it.
        throw new Error('image_origin="host_generated" requires catalog_ready=true with the exact retained source_image_* evidence in the same call. To save the item with an ordinary photo, send the original image with image_origin="user_source".');
      }
      // A photo is optional (D24). Conflicting or malformed image fields still reject before any write,
      // and an attestation (catalog_ready, host_generated, background_removed) sent with no image at all
      // still rejects. But when an image WAS sent and is unusable (an app-internal handle, a local path,
      // non-image bytes, or bytes that cannot be downloaded or ingested), the item is saved text-first:
      // no photo row, never Catalog-approved, and the receipt says so with the exact attach step.
      const present = (value: string | null | undefined) => typeof value === 'string' && value.trim().length > 0;
      const sentPrimaryCount = [args.image_file?.download_url, args.image_url, args.image_data_url, args.hosted_file_download_url].filter(present).length;
      const sentSourceCount = [args.source_image_file?.download_url, args.source_image_data_url, args.source_hosted_file_download_url].filter(present).length;
      if (sentPrimaryCount > 1) {
        throw new Error('Provide exactly one of image_file, image_url, image_data_url, or hosted_file_download_url for a Style image write.');
      }
      if (sentSourceCount > 1) {
        throw new Error('Provide exactly one of source_image_file, source_image_data_url, or source_hosted_file_download_url for a Style image write.');
      }
      // With no image at all, only attestations that CONTRADICT the missing image reject: a claimed
      // generated image, source evidence for it, or verified background removal of submitted bytes.
      // catalog_ready=true alone (the published app pins it to true) is saved text-first (D24).
      if (sentPrimaryCount === 0) {
        if (imageOrigin === 'host_generated') {
          throw new Error('image_origin="host_generated" requires the generated primary image. To save the item without a photo, omit image_origin.');
        }
        if (sentSourceCount > 0 || args.source_image_type) {
          throw new Error('source_image_* fields describe evidence for a host-generated primary image and cannot be sent without one.');
        }
        if (args.background_removed === true) {
          throw new Error('background_removed=true describes a submitted image and cannot be sent without one.');
        }
      }
      if (catalogReady && sentPrimaryCount > 0 && (args.image_type ?? 'primary') !== 'primary') {
        throw new Error('fluent_create_style_item requires image_type="primary". Add alternate or fit images only after the presentation-ready item exists.');
      }
      if (imageOrigin === 'host_generated' && args.image_type === 'fit') {
        throw new Error('Host-generated media is display-only and cannot use image_type="fit".');
      }
      if (imageOrigin === 'user_source' && sentSourceCount > 0) {
        throw new Error('source_image_* fields are only valid when image_origin="host_generated".');
      }
      let unusableImageReason: string | null = null;
      const effectiveImageArgs = { ...args };
      for (const [field, check] of [
        ['image_url', routeStyleImageUrl],
        ['image_data_url', assertStyleImageDataUrl],
        ['source_image_data_url', assertStyleImageDataUrl],
      ] as const) {
        const value = effectiveImageArgs[field];
        if (!value?.trim()) continue;
        try {
          check(value);
        } catch (error) {
          const reason = unusableStyleImageReason(error);
          if (!reason) throw error;
          unusableImageReason = unusableImageReason ?? reason;
          effectiveImageArgs[field] = null;
        }
      }
      const noImageProvided = catalogReady && sentPrimaryCount === 0;
      if (noImageProvided) {
        unusableImageReason = 'no image was provided';
      }
      if (imageOrigin === 'host_generated' && sentSourceCount === 0 && !unusableImageReason) {
        unusableImageReason = 'the host-generated Catalog image arrived without its required source photo evidence (source_image_file), so the generated image was not stored';
      }
      // A Catalog create stores its photo as one atomic unit: any unusable part means no photo at all.
      let catalogNotApplied = catalogRequested && unusableImageReason !== null;
      let imageSource = catalogNotApplied ? null : publicStyleImageSource(effectiveImageArgs, catalogReady);
      let sourceImageSource = catalogNotApplied || imageOrigin !== 'host_generated'
        ? null
        : publicStyleImageSource({
            image_file: args.source_image_file,
            image_data_url: effectiveImageArgs.source_image_data_url,
            hosted_file_download_url: args.source_hosted_file_download_url,
          }, true, 'source_', false);
      const profile = stripStyleItemFitFields((args.profile ?? {}) as Record<string, unknown>);
      const createStyleItemFrom = (media: { imageSource: PublicStyleImageSource | null; sourceImageSource: PublicStyleImageSource | null }) => createFluentStyleItem(vNextWriteServices, {
        atomicCatalogMedia: catalogReady && media.imageSource
          ? {
              backgroundRemoved: args.background_removed,
              catalogHostedFileDownloadUrl: media.imageSource.kind === 'hosted_file_download' || media.imageSource.kind === 'openai_file_download'
                ? media.imageSource.value
                : null,
              catalogImageDataUrl: media.imageSource.kind === 'inline_data_url' ? media.imageSource.value : null,
              catalogImageUrl: media.imageSource.kind === 'reference_url' ? media.imageSource.value : null,
              imageOrigin,
              retainedSourceHostedFileDownloadUrl: media.sourceImageSource?.kind === 'hosted_file_download' || media.sourceImageSource?.kind === 'openai_file_download'
                ? media.sourceImageSource.value
                : null,
              retainedSourceImageDataUrl: media.sourceImageSource?.kind === 'inline_data_url' ? media.sourceImageSource.value : null,
              retainedSourceImageType: media.sourceImageSource ? args.source_image_type ?? 'alternate' : null,
            }
          : null,
        item: {
          brand: args.brand,
          category: args.category,
          color_family: args.color_family,
          color_hex: args.color_hex,
          color_name: args.color_name,
          comparator_key: args.comparator_key,
          formality: args.formality,
          name: args.name,
          size: args.size,
          subcategory: args.subcategory,
        },
        profile,
        technicalMetadata: args.technical_metadata,
        fieldEvidence: args.field_evidence,
        fitAssessment: args.fit_assessment,
        overallConfidence: args.overall_confidence,
        hostModel: args.host_model,
        hasImage: imageOrigin === 'user_source' ? media.imageSource !== null : media.sourceImageSource !== null,
        onDuplicate: args.on_duplicate,
        duplicateCandidateId: args.duplicate_candidate_id,
        clientToken: args.client_token,
        batchId: args.batch_id,
        provenance: buildStyleClosetMutationProvenance(authProps, args),
        sourceSnapshot: args.source_snapshot,
      });
      let ack: FluentVNextWriteAck;
      try {
        ack = await createStyleItemFrom({ imageSource, sourceImageSource });
      } catch (error) {
        // The atomic Catalog create failed while ingesting its image bytes, before any row was written.
        // Save the item text-first instead (D24); nothing Catalog-related is recorded.
        if (!isStyleCatalogMediaUnusableError(error)) throw error;
        unusableImageReason = styleImageNotAttachedReason(error);
        catalogNotApplied = true;
        imageSource = null;
        sourceImageSource = null;
        ack = await createStyleItemFrom({ imageSource, sourceImageSource });
      }
      // photoNotAttachedReason: an ordinary photo that was attempted after the text-first create and
      // confirmed absent. Its imageAttachment (status "failed") is already on the ack.
      const finalize = async (finalAck: FluentVNextWriteAck, textSuffix?: string, photoNotAttachedReason?: string) => {
        let reportedAck = finalAck;
        let reportedSuffix = textSuffix;
        const finalPayload = recordOrNull(finalAck.payload);
        const notAttachedReason = photoNotAttachedReason ?? unusableImageReason;
        const unusableStep = notAttachedReason && finalPayload && finalPayload.idempotentReplay !== true
          ? styleCreateUnusableImageStep(
              notAttachedReason,
              [finalPayload.createdItemId, finalPayload.matchedItemId].find((id): id is string => typeof id === 'string' && id.length > 0) ?? null,
              { catalogNotApplied: catalogRequested },
            )
          : null;
        if (unusableStep && finalPayload) {
          reportedAck = {
            ...finalAck,
            payload: {
              ...finalPayload,
              ...(photoNotAttachedReason
                ? {}
                : {
                    imageAttachment: {
                      attempted: false,
                      reason: unusableImageReason,
                      status: noImageProvided ? 'not_attached_no_image' : 'not_attached_unusable_image',
                      ...(catalogNotApplied ? { catalogReady: false, catalogReadyRequested: true } : {}),
                    },
                  }),
              nextPhotoStep: unusableStep,
            },
          };
        }
        if (catalogDowngradedTo && recordOrNull(reportedAck.payload)) {
          const downgradedPayload = reportedAck.payload as Record<string, unknown>;
          const attachment = recordOrNull(downgradedPayload.imageAttachment);
          const saved = attachment?.status === 'attached' || attachment?.status === 'attached_readback_unavailable';
          reportedAck = {
            ...reportedAck,
            payload: {
              ...downgradedPayload,
              imageAttachment: {
                ...(attachment ?? {}),
                catalogNotAppliedReason: STYLE_CATALOG_REQUIRES_PRIMARY_REASON,
                catalogReady: false,
                catalogReadyRequested: true,
              },
            },
          };
          if (saved && finalPayload?.idempotentReplay !== true) {
            reportedSuffix = [reportedSuffix, styleCreateCatalogDowngradeNote(catalogDowngradedTo)].filter(Boolean).join(' ');
          }
        }
        reportedAck = await withStyleCreatePhotoStatus(withStyleCreateAggregateDurability(reportedAck), style);
        // A newly created needs_photo item already carries the step in its receipt text; every other
        // outcome (duplicate warning, matched item, attached-elsewhere) gets it appended so the host
        // never reads the photo as saved.
        const reportedPayload = recordOrNull(reportedAck.payload);
        const receiptCarriesStep = typeof reportedPayload?.createdItemId === 'string' && reportedPayload.photoStatus === 'needs_photo';
        if (unusableStep && !receiptCarriesStep) {
          reportedSuffix = [textSuffix, unusableStep].filter(Boolean).join(' ');
        }
        return finalizeStyleItemCreateToolResult(reportedAck, {
          styleClosetSurfaceBuilder: options.styleClosetSurfaceBuilder,
          textSuffix: reportedSuffix,
        });
      };
      // Retiring the earlier client_token row is a duplicate MERGE into the kept item: one atomic
      // transaction archives the row and records its canonical redirect, so replaying either the
      // original or the corrected request resolves to the kept item instead of restoring the row.
      const archiveSupersededItem = async (currentAck: FluentVNextWriteAck, canonicalItemId: string) => {
        const supersededItemId = styleCreateAckSupersededItemId(ack);
        if (!supersededItemId) return currentAck;
        try {
          if ((await style.getItem(supersededItemId))?.status !== 'active') return currentAck;
          const mergeAck = await archiveFluentVNextItem(vNextWriteServices, {
            disposition: 'duplicate',
            domain: 'style',
            itemId: supersededItemId,
            itemType: 'style_item',
            mergeIntoItemId: canonicalItemId,
            provenance: buildStyleClosetMutationProvenance(authProps, args),
            reason: `Superseded by duplicate resolution to ${canonicalItemId}.`,
            sourceSnapshot: args.source_snapshot,
          });
          const merged: FluentVNextWriteAck = {
            ...currentAck,
            payload: {
              ...(currentAck.payload as Record<string, unknown>),
              supersededItemArchive: { itemId: supersededItemId, payload: mergeAck.payload, status: 'merged', targetItemId: canonicalItemId },
            },
            readAfterWrite: mergeAck.readAfterWrite ?? currentAck.readAfterWrite,
          };
          // If the photo write's own readback was unavailable, a NON-degraded merge readback of the
          // kept item that contains the exact saved photo is authoritative proof again. Otherwise
          // the unavailable disclosure stays.
          const mergeReadback = recordOrNull(mergeAck.readAfterWrite);
          const mergedPayload = merged.payload as Record<string, unknown>;
          const attachment = recordOrNull(mergedPayload.imageAttachment);
          const savedPhotoId = recordOrNull(attachment?.payload)?.photoId;
          if (
            currentAck.readbackStatus === 'unavailable'
            && typeof savedPhotoId === 'string'
            && mergeReadback
            && recordOrNull(mergeAck.payload)?.readbackDegraded !== true
            && Array.isArray(mergeReadback.photos)
            && mergeReadback.photos.some((photo) => recordOrNull(photo)?.id === savedPhotoId)
          ) {
            const { readbackStatus: _unavailable, recovery, ...verified } = merged;
            return {
              ...verified,
              boundaries: ack.boundaries,
              payload: {
                ...mergedPayload,
                imageAttachment: {
                  ...attachment,
                  // The photo write's own "could not be read back" note is superseded by the verified merge readback.
                  payload: withoutSupersededReadbackNote(attachment?.payload, recovery),
                  status: 'attached',
                },
              },
            };
          }
          return merged;
        } catch (archiveError) {
          return {
            ...currentAck,
            payload: {
              ...(currentAck.payload as Record<string, unknown>),
              supersededItemArchive: {
                error: archiveError instanceof Error ? archiveError.message : String(archiveError),
                itemId: supersededItemId,
                status: 'failed',
              },
            },
          };
        }
      };
      const verifyCommittedStylePhoto = async (
        itemId: string,
        photoId: string,
      ): Promise<{ readAfterWrite?: unknown; state: 'absent' | 'present' | 'unknown' }> => {
        try {
          const item = await style.getItem(itemId);
          if (!item) return { state: 'unknown' };
          if (!item.photos.some((photo) => photo.id === photoId)) return { state: 'absent' };
          let readAfterWrite: unknown;
          try {
            readAfterWrite = await getFluentVNextItem(vNextReadServices, { domain: 'style', itemId, itemType: 'style_item' });
          } catch {
            readAfterWrite = undefined;
          }
          return { readAfterWrite, state: 'present' };
        } catch {
          return { state: 'unknown' };
        }
      };
      const imageTargetItemId = styleCreateAckImageTargetItemId(ack);
      if (styleCreateAckIsIdempotentReplay(ack)) {
        const replayAck = {
          ...ack,
          payload: {
            ...(ack.payload as Record<string, unknown>),
            imageAttachment: { attempted: false, status: 'unchanged_idempotent_replay' },
          },
        };
        return finalize(replayAck, 'This client_token was already completed; Fluent made no additional media or item changes.');
      }
      if (styleCreateAckHasAtomicImage(ack)) {
        return finalize(ack, imageOrigin === 'host_generated' ? 'Saved the generated Catalog image as the cover, with its source photo.' : 'Saved the photo as the Catalog cover.');
      }
      const createdItemId = (ack.payload as { createdItemId?: unknown } | null)?.createdItemId;
      if (imageSource && typeof createdItemId === 'string' && createdItemId.length > 0) {
        // Ordinary (non-Catalog) photo for a newly created item, e.g. a 1.0.0 image_url. The item is
        // already saved, so a failed attachment is reported on the saved item instead of claiming
        // that nothing was created.
        const imageType = args.image_type ?? 'primary';
        try {
          const imageAck = await setFluentStyleItemImage(vNextWriteServices, {
            backgroundRemoved: args.background_removed,
            catalogReady: false,
            hostedFileDownloadUrl: imageSource.kind === 'hosted_file_download' || imageSource.kind === 'openai_file_download'
              ? imageSource.value
              : null,
            imageDataUrl: imageSource.kind === 'inline_data_url' ? imageSource.value : null,
            imageOrigin,
            imageType,
            imageUrl: imageSource.kind === 'reference_url' ? imageSource.value : null,
            itemId: createdItemId,
            provenance: buildStyleClosetMutationProvenance(authProps, args),
            sourceSnapshot: args.source_snapshot,
          });
          const photoId = typeof recordOrNull(imageAck.payload)?.photoId === 'string'
            ? String(recordOrNull(imageAck.payload)?.photoId)
            : styleImagePhotoId(createdItemId, imageOrigin, imageType);
          // Transport labels (inline_data_url, ...) stay in structured diagnostics, not receipt prose.
          const savedSuffix = `Saved the ${imageType} photo${imageType === 'primary' ? '; it is the item\'s cover' : ''}.`;
          if (imageAck.readbackStatus !== 'unavailable') {
            return finalize(mergeStyleCreateImageAck(ack, imageAck, null), savedSuffix);
          }
          // The photo write committed but its readback failed: verify the exact photo again before
          // choosing between a confirmed attachment and a disclosed unavailable readback.
          const verified = await verifyCommittedStylePhoto(createdItemId, photoId);
          if (verified.state === 'present') {
            return finalize(mergeStyleCreateImageAck(ack, imageAck, null, null, { readAfterWrite: verified.readAfterWrite }), savedSuffix);
          }
          return finalize(
            mergeStyleCreateImageAck(ack, imageAck, null),
            `The photo was saved, but the item could not be read back. Read the item before making another change; do not re-send the photo.`,
          );
        } catch (error) {
          // An exception is only a definitive failure once the exact photo is confirmed absent.
          const verified = await verifyCommittedStylePhoto(createdItemId, styleImagePhotoId(createdItemId, imageOrigin, imageType));
          if (verified.state === 'present') {
            return finalize(
              mergeStyleCreateImageAck(ack, null, null, null, { readAfterWrite: verified.readAfterWrite, status: 'attached' }),
              `Saved the ${imageType} photo; Fluent confirmed it on the item after a later error (${styleImageNotAttachedReason(error)}).`,
            );
          }
          if (verified.state === 'unknown') {
            return finalize(
              mergeStyleCreateImageAck(ack, null, error, null, { status: 'unverified' }),
              `The item was saved, but Fluent could not confirm whether its photo was saved (${styleImageNotAttachedReason(error)}). Read the item before retrying; do not re-send the photo or say it was saved.`,
            );
          }
          return finalize(
            mergeStyleCreateImageAck(ack, null, error),
            'The item was saved, but Fluent could not attach its photo. Do not say the photo was saved.',
            styleImageNotAttachedReason(error),
          );
        }
      }
      if (imageSource && imageTargetItemId) {
        let matchedPhotosBefore: string | null = null;
        let addToExistingForWrite = false;
        let writeAttempted = false;
        try {
          const sourceImageType = args.source_image_type ?? 'alternate';
          // A non-Catalog photo must never replace the cover of the existing item the user chose to keep.
          const matchedItem = await style.getItem(imageTargetItemId);
          matchedPhotosBefore = matchedItem ? JSON.stringify(matchedItem.photos) : null;
          const addToExisting = !catalogReady && imageOrigin === 'user_source' && (matchedItem?.photos.length ?? 0) > 0;
          addToExistingForWrite = addToExisting;
          writeAttempted = true;
          const imageAck = await setFluentStyleItemImage(vNextWriteServices, {
            backgroundRemoved: args.background_removed,
            catalogReady,
            duplicateResolution: args.on_duplicate === 'skip' && args.duplicate_candidate_id
              ? {
                  batchId: args.batch_id,
                  candidateId: imageTargetItemId,
                  clientToken: args.client_token,
                  decision: 'use_existing',
                }
              : null,
            hostedFileDownloadUrl: imageSource.kind === 'hosted_file_download' || imageSource.kind === 'openai_file_download'
              ? imageSource.value
              : null,
            imageDataUrl: imageSource.kind === 'inline_data_url' ? imageSource.value : null,
            imageOrigin,
            imageType: addToExisting ? (args.image_type === 'fit' ? 'fit' : 'alternate') : args.image_type ?? 'primary',
            imageUrl: !catalogReady && imageSource.kind === 'reference_url' ? imageSource.value : null,
            itemId: imageTargetItemId,
            photoAction: addToExisting ? 'add' : null,
            provenance: buildStyleClosetMutationProvenance(authProps, args),
            retainedSourceHostedFileDownloadUrl: sourceImageSource?.kind === 'hosted_file_download' || sourceImageSource?.kind === 'openai_file_download'
              ? sourceImageSource.value
              : null,
            retainedSourceImageDataUrl: sourceImageSource?.kind === 'inline_data_url' ? sourceImageSource.value : null,
            retainedSourceImageType: sourceImageSource ? sourceImageType : null,
            sourceSnapshot: args.source_snapshot,
          });
          const combinedAck = await archiveSupersededItem(
            mergeStyleCreateImageAck(ack, imageAck, null),
            imageTargetItemId,
          );
          // Describe what was actually written, not what was requested.
          const effectiveImageType = String(recordOrNull(imageAck.payload)?.imageType ?? (addToExisting ? 'alternate' : args.image_type ?? 'primary'));
          const attachedText = addToExisting
            ? `Added ${effectiveImageType === 'alternate' ? 'an alternate' : `a ${effectiveImageType}`} photo alongside the existing cover; the cover is unchanged.`
            : `Attached the ${effectiveImageType} ${imageOrigin === 'host_generated' ? 'generated image' : 'photo'}.`;
          return finalize(
            combinedAck,
            combinedAck.readbackStatus === 'unavailable'
              ? `${attachedText} The photo was saved to the existing item, but the item could not be read back. Read the item before making another change; do not re-send the photo.`
              : attachedText,
          );
        } catch (error) {
          // The write may have committed before a later step (readback, event recording) failed.
          // "Saved" is decided only from exact-photo evidence (the write's own photo id present
          // afterward); "left unchanged" only from a verified-unchanged photo set or an image-input
          // error, which is raised before anything is written. Anything else is "could not confirm".
          const reason = styleImageNotAttachedReason(error);
          const writtenPhotoId = recordOrNull(error)?.stylePhotoId;
          let afterPhotos: string | null = null;
          let exactPhotoPresent = false;
          let slotAfter: string | null = null;
          try {
            const after = await style.getItem(imageTargetItemId);
            afterPhotos = after ? JSON.stringify(after.photos) : null;
            const slot = typeof writtenPhotoId === 'string' ? after?.photos.find((photo) => photo.id === writtenPhotoId) : undefined;
            exactPhotoPresent = Boolean(slot);
            slotAfter = slot ? JSON.stringify(slot) : null;
          } catch {
            afterPhotos = null;
          }
          // Evidence that THIS write landed: the writer's own post-commit marker, or (for an added
          // photo, whose id is content-addressed) that exact photo present. A role-slot replace reuses
          // the slot id, so neither its presence nor an unrelated photo-set change counts.
          const committed = recordOrNull(error)?.styleWriteCommitted === true
            || (addToExistingForWrite && exactPhotoPresent);
          if (committed) {
            return finalize(
              mergeStyleCreateImageAck(ack, null, null, null, { status: 'attached' }),
              `The photo was saved to the existing item, but Fluent hit a later error (${reason}). Read the item before making another change; do not re-send the photo.`,
            );
          }
          const verifiedUnchanged = !writeAttempted
            || isStyleImageInputError(error)
            || (!exactPhotoPresent && afterPhotos !== null && matchedPhotosBefore !== null && afterPhotos === matchedPhotosBefore);
          // A replace that did not land leaves its slot exactly as it was before the write, even when
          // an unrelated concurrent change touched other photos.
          const slotBefore = typeof writtenPhotoId === 'string' && matchedPhotosBefore !== null
            ? (JSON.parse(matchedPhotosBefore) as Array<{ id?: unknown }>).find((photo) => photo.id === writtenPhotoId)
            : undefined;
          const slotUnchanged = !addToExistingForWrite && slotBefore !== undefined && slotAfter === JSON.stringify(slotBefore);
          if (!verifiedUnchanged && slotUnchanged) {
            const failed = catalogReady ? 'Primary Catalog image attachment failed' : 'The photo could not be saved to the existing item';
            throw new Error(`${failed} (${reason}); no new closet item was created, the requested photo was not saved, and the existing photo in that slot is unchanged.`);
          }
          if (!verifiedUnchanged) {
            throw new Error(`The photo write to the existing item ended with an error (${reason}), and Fluent could not confirm whether it was saved. No new closet item was created. Read the item before retrying; do not say the photo was saved.`);
          }
          const failed = catalogReady ? 'Primary Catalog image attachment failed' : 'The photo could not be added to the existing item';
          const nothingSaved = isStyleImageInputError(error) ? ' Nothing was saved.' : '';
          throw new Error(`${failed} (${reason}); no new closet item was created and the matched item was left unchanged.${nothingSaved}`);
        }
      }
      if (!imageSource && imageTargetItemId && (ack.payload as { status?: unknown } | null)?.status === 'skipped_duplicate') {
        // Photo-less "use existing": no media transaction carries the resolution, so the merge
        // above is the only durable step.
        return finalize(await archiveSupersededItem(ack, imageTargetItemId));
      }
      return finalize(ack);
    },
  );

  server.registerTool(
    'fluent_refresh_style_item_profile',
    withVNextStyleClosetWriteSecurity({
      title: 'Refresh Fluent Style Item Profile',
      description:
        'Refresh selected profile fields or typed natural-language wear feedback on an EXISTING saved Style closet item from explicit host/user evidence. This is the durable home for tags, descriptors, fit/wear learning, and recommendation corrections. Fluent rank-merges each field, preserves stronger existing evidence, never infers unworn from silence, and returns read-after-write proof.',
      inputSchema: {
        approval: fluentVNextRecipeWriteApprovalSchema,
        item_id: z.string().min(1).describe('Existing saved Fluent Style item ID to refresh. Unknown IDs are rejected.'),
        feedback: fluentStyleItemFeedbackSchema,
        profile: z.record(z.string(), z.unknown()).optional().describe('Optional sparse item profile fields to refresh. Omitted fields are not changed. Prefer the typed feedback object. For host compatibility, profile also accepts the equivalent camelCase feedbackNote/feedbackSignals/wearUnderstanding/worksFor/avoidFor fields or snake_case note/signals/wear_understanding/works_for/avoid_for fields, but never mixed aliases for the same field.'),
        field_sources: z.record(z.string(), z.object({
          confidence: z.number().min(0).max(1).nullable().optional(),
          source: fluentStyleItemProfileSourceSchema,
        }).passthrough()).optional().describe('Optional per-field { source, confidence } evidence map keyed by profile field.'),
        fit_assessment: fluentStyleItemFitAssessmentSchema,
        source: fluentStyleItemProfileSourceSchema.describe('Default source for profile fields that do not have an explicit field_sources entry.'),
        confidence: z.number().min(0).max(1).nullable().optional().describe('Default confidence for profile fields that do not have an explicit field_sources entry.'),
        host_model: z.string().nullable().optional().describe('Identifier of the host model that produced this profile refresh.'),
        has_image: z.boolean().optional().describe('Set true only when the host actually inspected an image for this refresh.'),
        provenance: nestedProvenanceSchema.describe('Who/what initiated this explicit user-approved profile refresh.'),
        response_mode: fluentStyleClosetWriteResponseModeSchema,
        source_snapshot: fluentVNextSourceSnapshotSchema.optional(),
        // Flat provenance fields declared by the cached ChatGPT 1.0.0 registration; without them the
        // 1.0.0 host's provenance was silently stripped from the write.
        session_id: provenanceInputSchema.session_id,
        source_agent: provenanceInputSchema.source_agent,
        source_skill: provenanceInputSchema.source_skill,
        source_type: provenanceInputSchema.source_type,
      },
      annotations: { title: 'Refresh Fluent Style Item Profile', readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
      _meta: {
        'openai/widgetAccessible': true,
      },
    }),
    async (args) => {
      await requireExplicitPublicWriteApproval(
        args.approval,
        'fluent_refresh_style_item_profile',
        options.publicWriteRateLimiter,
      );
      const authProps = requireStyleClosetWriteScope();
      const rawProfile = (args.profile ?? {}) as Record<string, unknown>;
      const feedbackProfileAliases = {
        avoidFor: 'avoid_for',
        avoid_for: 'avoid_for',
        feedbackNote: 'note',
        note: 'note',
        feedbackSignals: 'signals',
        signals: 'signals',
        wearUnderstanding: 'wear_understanding',
        wear_understanding: 'wear_understanding',
        worksFor: 'works_for',
        works_for: 'works_for',
      } as const;
      const feedbackProfileKeys = Object.keys(feedbackProfileAliases) as Array<keyof typeof feedbackProfileAliases>;
      const presentFeedbackProfileKeys = feedbackProfileKeys.filter((key) =>
        Object.prototype.hasOwnProperty.call(rawProfile, key));
      const profileFeedbackRequested = presentFeedbackProfileKeys.length > 0;
      if (args.feedback && profileFeedbackRequested) {
        throw new Error('fluent_refresh_style_item_profile feedback fields must be passed in feedback or profile, not both.');
      }
      const profileFeedbackInput: Record<string, unknown> = {};
      for (const key of presentFeedbackProfileKeys) {
        const canonicalKey = feedbackProfileAliases[key];
        if (Object.prototype.hasOwnProperty.call(profileFeedbackInput, canonicalKey)) {
          throw new Error(`fluent_refresh_style_item_profile profile contains multiple aliases for feedback field ${canonicalKey}.`);
        }
        profileFeedbackInput[canonicalKey] = rawProfile[key];
      }
      const profileFeedback = profileFeedbackRequested
        ? fluentStyleItemFeedbackSchema.parse(profileFeedbackInput)
        : undefined;
      const feedback = args.feedback ?? profileFeedback;
      const genericProfile = stripStyleItemFitFields(rawProfile);
      for (const key of [...feedbackProfileKeys, 'feedbackUpdatedAt', 'feedback_updated_at']) {
        delete genericProfile[key];
      }
      if (!args.profile && !args.feedback) {
        throw new Error('fluent_refresh_style_item_profile requires profile, feedback, or both.');
      }
      if (feedback && Object.keys(feedback).length === 0) {
        throw new Error('fluent_refresh_style_item_profile feedback must include at least one typed feedback field.');
      }
      if (feedback && args.source !== 'user' && args.source !== 'user_correction') {
        throw new Error('fluent_refresh_style_item_profile feedback requires source="user" or source="user_correction".');
      }
      if (feedback) {
        for (const key of ['avoidFor', 'feedbackNote', 'feedbackSignals', 'wearUnderstanding', 'worksFor']) {
          const fieldSource = args.field_sources?.[key]?.source;
          if (fieldSource && fieldSource !== 'user' && fieldSource !== 'user_correction') {
            throw new Error(`fluent_refresh_style_item_profile feedback field ${key} requires user evidence.`);
          }
        }
      }
      const profile = {
        ...genericProfile,
        ...(feedback
          ? {
            ...(feedback.avoid_for !== undefined ? { avoidFor: feedback.avoid_for } : {}),
            ...(feedback.note !== undefined ? { feedbackNote: feedback.note } : {}),
            ...(feedback.signals !== undefined ? { feedbackSignals: feedback.signals } : {}),
            ...(feedback.wear_understanding !== undefined
              ? { wearUnderstanding: feedback.wear_understanding }
              : {}),
            ...(feedback.works_for !== undefined ? { worksFor: feedback.works_for } : {}),
          }
          : {}),
      };
      const ack = await refreshFluentStyleItemProfile(vNextWriteServices, {
        confidence: args.confidence ?? null,
        fieldEvidence: buildStyleItemProfileRefreshFieldEvidence(
          profile,
          args.field_sources,
          args.source ?? null,
          args.confidence ?? null,
        ),
        fitAssessment: args.fit_assessment,
        hasImage: args.has_image === true,
        hostModel: args.host_model ?? null,
        itemId: args.item_id,
        profile,
        provenance: buildStyleClosetMutationProvenance(authProps, args),
        source: args.source ?? null,
        sourceSnapshot: args.source_snapshot,
      });
      return toolResult(ack, {
        structuredContent: ack,
        textData: `Refreshed style item profile for ${args.item_id}.`,
      });
    },
  );

  server.registerTool(
    'fluent_set_style_item_image',
    withVNextStyleClosetWriteSecurity({
      title: 'Set Fluent Style Item Image',
      description:
        'Set one inspected source image or host-generated Catalog display image for a saved Style closet item and return read-after-write proof. In ChatGPT, pass an uploaded, selected, or generated image through image_file. Set catalog_ready=true only after reviewing the final primary Catalog presentation; for host-generated media, also provide source_photo_id for the exact retained non-generated source on this item. Fluent stores and hashes inline/hosted-file bytes and atomically binds the reviewed Catalog to its source. It never inspects images or browses product pages. A fit or alternate photo is ADDED by default (every saved photo and the cover are kept; repeating the same image and role is a no-op); only a primary photo or an explicit photo_action="replace" replaces its slot.',
      inputSchema: {
        approval: fluentVNextRecipeWriteApprovalSchema,
        background_removed: z.boolean().nullable().optional().describe('True only when useful transparency/background removal was verified in the submitted bytes.'),
        photo_action: z.enum(['add', 'replace']).optional().describe('Use add for another original product, detail or fit photo on an existing item: preserves every saved photo and the current cover. Repeating the same input and role reuses the same added photo. When omitted, fit and alternate user_source photos are added (hosts whose schema has no photo_action, such as the published ChatGPT app 1.0.0, get the non-destructive behavior); primary, host-generated, and Catalog-ready writes keep role-slot replacement. Use replace only to deliberately replace a role slot. Add cannot set primary or approve a Catalog.'),
        caption: z.string().nullable().optional(),
        catalog_ready: z.boolean().nullable().optional().describe('Set true only for a reviewed primary Catalog presentation. Fluent will derive and persist byte/source bindings; no later widget normalization is required.'),
        image_type: fluentStyleImageTypeSchema,
        image_file: openAiFileParamSchema.nullable().optional(),
        image_url: z.string().min(1).max(26_700_128).nullable().optional().describe('Host-inspected direct image URL to retain by reference only when catalog_ready is false. Catalog-ready media requires owned bytes. A ChatGPT upload link (files.oaiusercontent.com or chatgpt.com estuary content) is copied into Fluent-owned storage at write time, and a data: URL must contain real JPEG, PNG, or WebP bytes. Never pass an app-internal image handle (for example a code-mode image reference) or a local file path: it is rejected, nothing is saved, and the error gives the exact data-URL step.'),
        image_data_url: z.string().min(1).max(26_700_128).nullable().optional().describe('Host-inspected full-resolution JPEG, PNG, or WebP data URL to store as owned Fluent media. Fluent validates the data-URL MIME, base64 payload, byte signature, and size server-side.'),
        hosted_file_download_url: z.string().url().nullable().optional().describe('Temporary OpenAI-hosted download URL for an inspected upload or ChatGPT-generated image, including its signed chatgpt.com/backend-api/estuary/content URL. Fluent copies the bytes into owned media and does not retain this URL.'),
        image_origin: fluentStyleImageOriginSchema,
        item_id: z.string().min(1).describe('Existing saved Fluent Style item ID.'),
        source_photo_id: z.string().min(1).nullable().optional().describe('Required with catalog_ready=true host-generated media: exact retained owned non-generated source photo ID for this item.'),
        provenance: nestedProvenanceSchema.describe('Who/what initiated this explicit user-approved image set; acceptance_test provenance stays non-durable.'),
        response_mode: fluentStyleClosetWriteResponseModeSchema,
        source_snapshot: fluentVNextSourceSnapshotSchema.optional(),
        ...provenanceInputSchema,
      },
      annotations: { title: 'Set Fluent Style Item Image', readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
      _meta: {
        'openai/widgetAccessible': true,
        'openai/fileParams': ['image_file'],
      },
    }),
    async (args) => {
      await requireExplicitPublicWriteApproval(
        args.approval,
        'fluent_set_style_item_image',
        options.publicWriteRateLimiter,
      );
      const authProps = requireStyleClosetWriteScope();
      // Here the write IS the photo: an unusable image rejects the call, and because image input is
      // validated and downloaded before anything is written, the rejection states nothing was saved.
      let ack: FluentVNextWriteAck;
      try {
      const imageSource = publicStyleImageSource(args, true)!;
      // Hosts without photo_action (the cached ChatGPT 1.0.0 schema) must not lose a photo: an
      // omitted action for an ordinary fit/alternate photo adds instead of replacing the role slot.
      // No call-shape heuristics: an omitted action ALWAYS adds for fit/alternate, and only an explicit
      // photo_action "replace" replaces a role slot. Accepted consequence: the frozen legacy closet
      // widgets (closet-manager.ts v8-v33, closet-manager-v7.ts) have a "Replace fit photo" button that
      // omits photo_action, so it now appends a photo instead (non-destructive; the label is stale).
      // Their byte-pinned HTML is cached by hosts per URI, so it is intentionally not edited.
      const photoAction = args.photo_action
        ?? ((args.image_type === 'fit' || args.image_type === 'alternate')
          && (args.image_origin ?? 'user_source') === 'user_source'
          && args.catalog_ready !== true
          ? 'add'
          : undefined);
      ack = await setFluentStyleItemImage(vNextWriteServices, {
        photoAction,
        backgroundRemoved: args.background_removed,
        catalogReady: args.catalog_ready,
        caption: args.caption ?? null,
        hostedFileDownloadUrl: imageSource.kind === 'hosted_file_download' || imageSource.kind === 'openai_file_download'
          ? imageSource.value
          : null,
        imageDataUrl: imageSource.kind === 'inline_data_url' ? imageSource.value : null,
        imageOrigin: args.image_origin ?? 'user_source',
        imageType: args.image_type,
        imageUrl: imageSource.kind === 'reference_url' ? imageSource.value : null,
        itemId: args.item_id,
        provenance: buildStyleClosetMutationProvenance(authProps, args),
        sourcePhotoId: args.source_photo_id,
        sourceSnapshot: args.source_snapshot,
      });
      } catch (error) {
        throw withNothingSavedNote(error);
      }
      return toolResult(ack, {
        structuredContent: ack,
        textData: typeof (ack.payload as Record<string, unknown> | undefined)?.hostResponseInstruction === 'string'
          ? (ack.payload as Record<string, unknown>).hostResponseInstruction as string
          : `Image write result for ${args.item_id}; verify the read-after-write result before reporting success.`,
      });
    },
  );

  server.registerTool(
    'fluent_upsert_item',
    withVNextWriteSecurity({
      title: 'Upsert Fluent Item',
      description:
        'Create or update a typed domain item through the canonical domain service and return read-after-write proof. The generic envelope does not bypass domain validators.',
      inputSchema: {
        domain: fluentVNextDomainSchema,
        item: fluentVNextItemInputSchema,
        item_id: z.string().optional(),
        item_type: fluentVNextItemTypeSchema.optional(),
        operations: z.array(fluentVNextOperationSchema).optional().describe(
          'Optional JSON-patch-style operations for updating an existing saved item. Omit when creating a new item from item fields.',
        ),
        response_mode: writeResponseModeSchema,
        source_snapshot: fluentVNextSourceSnapshotSchema.optional(),
        ...provenanceInputSchema,
      },
      annotations: { title: 'Upsert Fluent Item', readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
      _meta: {
        'openai/widgetAccessible': true,
        ui: {
          visibility: ['app'],
        },
      },
    }),
    async (args) => {
      const authProps = requireVNextWriteScope(args.domain);
      return vNextToolResult(
        await upsertFluentVNextItem(vNextWriteServices, {
          domain: args.domain,
          item: args.item,
          itemId: args.item_id,
          itemType: args.item_type,
          operations: args.operations,
          provenance: buildMutationProvenance(authProps, args),
          sourceSnapshot: args.source_snapshot,
        }),
      );
    },
  );

  server.registerTool(
    'fluent_archive_item',
    withVNextBudgetWriteSecurity({
      title: 'Archive Fluent Item',
      description:
        'Archive a typed domain item through the canonical domain service with an explicit reason, disposition, provenance, and read-after-write proof. For Meals this supports meal plans, recipes, and inventory items; archiving a meal plan also removes only its linked grocery intents and derived grocery state from the active list. Use for returned, sold, donated, gifted, worn-out, never-purchased, duplicate, cancelled, or otherwise gone items. This removes an item from active memory without deleting audit history.',
      inputSchema: {
        approval: fluentVNextRecipeWriteApprovalSchema,
        domain: fluentVNextArchiveDomainSchema,
        disposition: z.enum(['returned', 'sold', 'donated', 'gifted', 'worn_out', 'never_purchased', 'duplicate', 'other']).optional().describe(
          'Optional user-confirmed archive disposition recorded in the archive evidence trail.',
        ),
        item_id: z.string().optional(),
        item_name: z.string().optional(),
        item_type: fluentVNextItemTypeSchema.optional(),
        target: z.object({
          by: z.enum(['id', 'name']).describe('Target the stable item ID (preferred) or an exact saved name.'),
          item_id: z.string().min(1).optional().describe('Required with by="id": stable Fluent item ID from a current readback.'),
          item_name: z.string().min(1).optional().describe('Required with by="name": exact saved item name from a current readback.'),
        }).strict().optional().describe('Legacy archive target accepted for cached clients; equivalent to item_id or item_name. Prefer item_id.'),
        merge_into_item_id: z.string().optional().describe(
          'Style duplicate only: exact existing closet item that should remain active. Fluent atomically moves the duplicate item photos into this canonical item, fills only missing core details, and archives the redundant source item.',
        ),
        merge_operation_id: z.string().uuid().optional().describe(
          'Style duplicate only: client-generated cycle identity binding this exact combine action to its reversible Undo.',
        ),
        reason: z.string().optional(),
        response_mode: writeResponseModeSchema,
        source_snapshot: fluentVNextSourceSnapshotSchema.optional(),
        ...provenanceInputSchema,
      },
      annotations: { title: 'Archive Fluent Item', readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
      _meta: {
        'openai/widgetAccessible': true,
        ui: {
          // Model-callable (not app-only): an explicit user signal like "I donated this" should let
          // the host archive directly with read-after-write proof. Archive is reversible
          // (status:'active' restores), audited, and destructiveHint:false, so it is a safe model
          // write; the "explicit signal only, never infer" gate lives in fluent-guidance.ts, not by
          // hiding the tool. Still widget-callable (openai/widgetAccessible) for the closet manager.
          visibility: ['model', 'app'],
        },
      },
    }),
    async (args) => {
      await requireExplicitPublicWriteApproval(args.approval, 'fluent_archive_item', options.publicWriteRateLimiter);
      const authProps = requireArchiveItemWriteScope(args.domain);
      const { itemId, itemName } = resolveArchiveItemTarget(args);
      return vNextToolResult(
        await archiveFluentVNextItem(vNextWriteServices, {
          disposition: args.disposition,
          domain: args.domain,
          itemId,
          itemName,
          itemType: args.item_type,
          mergeIntoItemId: args.merge_into_item_id,
          mergeOperationId: args.merge_operation_id,
          provenance: buildMutationProvenance(authProps, args),
          reason: args.reason,
          sourceSnapshot: args.source_snapshot,
        }),
      );
    },
  );

  server.registerTool(
    'fluent_record_event',
    withVNextWriteSecurity({
      title: 'Record Fluent Event',
      description:
        'Record explicit user/model-observed outcomes, feedback, decisions, or evidence with provenance. Fluent stores the event; the host model remains responsible for reasoning from it.',
      inputSchema: {
        domain: fluentVNextDomainSchema,
        event: fluentVNextEventInputSchema,
        event_type: z.string().optional().describe('Optional top-level event type override when not present in event.event_type.'),
        response_mode: writeResponseModeSchema,
        subject: z.string().optional().describe('Optional existing Fluent subject ID, such as a recipe ID or calibration subject.'),
        ...provenanceInputSchema,
      },
      annotations: { title: 'Record Fluent Event', readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
    }),
    async (args) => {
      const authProps = requireVNextWriteScope(args.domain);
      return vNextToolResult(
        await recordFluentVNextEvent(vNextWriteServices, {
          domain: args.domain,
          event: args.event,
          eventType: args.event_type,
          provenance: buildMutationProvenance(authProps, args),
          subject: args.subject,
        }),
      );
    },
  );

  server.registerTool(
    'fluent_get_account_status',
    withVNextReadSecurity({
      title: 'Get Fluent Account Status',
      description:
        'Fetch the data-minimized Fluent account/status surface for account access, export, deletion, reactivation, and support. Returns access state, enabled domains, account and support links, export and deletion instructions, and support email. It does not start, sell, upgrade, cancel, or manage paid access from the assistant.',
      annotations: {
        title: 'Get Fluent Account Status',
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    }),
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
      annotations: { title: 'Update Fluent Profile' },
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
      annotations: { title: 'List Fluent Domains', readOnlyHint: true, idempotentHint: true },
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
      annotations: { title: 'List Domain Events', readOnlyHint: true, idempotentHint: true },
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
      annotations: { title: 'Enable Fluent Domain' },
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
      annotations: { title: 'Disable Fluent Domain' },
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
      annotations: { title: 'Begin Domain Onboarding' },
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
      annotations: { title: 'Complete Domain Onboarding' },
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

function buildFluentVNextReadServices(
  fluentCore: FluentCoreService,
  meals: MealsService,
  style: StyleService,
  budgets: BudgetsService,
): FluentVNextReadServices {
  return {
    budgets: {
      getPurchaseContext: (input) => budgets.getPurchaseContext(input),
    },
    core: {
      getAccountStatus: () => fluentCore.getAccountStatus(),
      getCapabilities: () => fluentCore.getCapabilities(),
      getProfile: () => fluentCore.getProfile(),
      listPersonFacts: (input) => fluentCore.listPersonFacts(input),
    },
    meals: {
      getCurrentGroceryList: (input) => meals.getCurrentGroceryList(input),
      getInventory: () => meals.getInventory(),
      getGroceryShoppingReconciliation: (input) => meals.getGroceryShoppingReconciliation(input),
      getMealMemory: (recipeId) => meals.getMealMemory(recipeId),
      getOnboardingCalibration: (input) => meals.getOnboardingCalibration(input),
      getPlan: (input) => input?.weekStart ? meals.getPlan(input.weekStart) : meals.getCurrentPlan(input?.today ?? undefined),
      getPreferences: () => meals.getPreferences(),
      getRecipe: (recipeId) => meals.getRecipe(recipeId),
      listDomainEvents: (filters) => meals.listDomainEvents(filters),
      listPlanHistory: (input) => meals.listPlanHistory(input?.limit ?? undefined),
      listRecipes: (mealType, status) => meals.listRecipes(mealType, status),
    },
    style: {
      getContext: () => style.getContext(),
      getItem: (itemId) => style.getItem(itemId),
      getItemProvenance: (itemId) => style.getItemProvenance(itemId),
      getOnboardingCalibration: () => style.getOnboardingCalibration(),
      getProfile: () => style.getProfile(),
      getVisualBundle: (input) => style.getVisualBundle(input),
      listEvidenceGaps: (input) => style.listEvidenceGaps(input as never),
      listItems: () => style.listItems(),
    },
  };
}

function buildFluentVNextWriteServices(
  fluentCore: FluentCoreService,
  meals: MealsService,
  style: StyleService,
  budgets: BudgetsService,
  options: { publicWriteRateLimiter?: FluentRateLimitBinding } = {},
): FluentVNextWriteServices {
  return {
    ...buildFluentVNextReadServices(fluentCore, meals, style, budgets),
    publicWriteRateLimiter: options.publicWriteRateLimiter,
    budgets: {
      getPurchaseContext: (input) => budgets.getPurchaseContext(input),
      logBudgetSpend: (input) => budgets.logBudgetSpend(input),
      setBudgetEnvelope: (input) => budgets.setBudgetEnvelope(input),
    },
    core: {
      appendPersonConsentEvent: (input, provenance) => fluentCore.appendPersonConsentEvent(input, provenance),
      getAccountStatus: () => fluentCore.getAccountStatus(),
      getCapabilities: () => fluentCore.getCapabilities(),
      getProfile: () => fluentCore.getProfile(),
      listPersonFacts: (input) => fluentCore.listPersonFacts(input),
      rejectPersonFact: (input, provenance) => fluentCore.rejectPersonFact(input, provenance),
      updateProfile: (input, provenance) => fluentCore.updateProfile(input, provenance),
      upsertPersonFact: (input, provenance) => fluentCore.upsertPersonFact(input, provenance),
    },
    meals: {
      getCurrentGroceryList: (input) => meals.getCurrentGroceryList(input),
      getInventory: () => meals.getInventory(),
      getGroceryShoppingReconciliation: (input) => meals.getGroceryShoppingReconciliation(input),
      getMealMemory: (recipeId) => meals.getMealMemory(recipeId),
      getOnboardingCalibration: (input) => meals.getOnboardingCalibration(input),
      getPlan: (input) => input?.weekStart ? meals.getPlan(input.weekStart) : meals.getCurrentPlan(input?.today ?? undefined),
      getPreferences: () => meals.getPreferences(),
      getRecipe: (recipeId) => meals.getRecipe(recipeId),
      listDomainEvents: (filters) => meals.listDomainEvents(filters),
      listPlanHistory: (input) => meals.listPlanHistory(input?.limit ?? undefined),
      listRecipes: (mealType, status) => meals.listRecipes(mealType, status),
      createRecipe: (input) => meals.createRecipe(input),
      logFeedback: (input) => meals.logFeedback(input as never),
      patchRecipe: (input) => meals.patchRecipe(input as never),
      recordCalibrationResponse: (input) => meals.recordCalibrationResponse(input),
      generateGroceryPlan: (input) => meals.generateGroceryPlan(input),
      confirmMealGroceryCoverage: (input) => meals.confirmMealGroceryCoverage(input),
      upsertPlan: (input) => meals.upsertPlan(input),
      upsertGroceryIntent: (input) => meals.upsertGroceryIntent(input),
      upsertGroceryPlanAction: (input) => meals.upsertGroceryPlanAction(input),
      applyGroceryShoppingResult: (input) => meals.applyGroceryShoppingResult(input),
      archiveMealPlan: (input) => meals.archiveMealPlan(input),
      archiveInventoryItem: (input) => meals.archiveInventoryItem(input),
    },
    style: {
      getContext: () => style.getContext(),
      getItem: (itemId) => style.getItem(itemId),
      getItemProvenance: (itemId) => style.getItemProvenance(itemId),
      getOnboardingCalibration: () => style.getOnboardingCalibration(),
      getProfile: () => style.getProfile(),
      getVisualBundle: (input) => style.getVisualBundle(input),
      listEvidenceGaps: (input) => style.listEvidenceGaps(input as never),
      listItems: () => style.listItems(),
      archiveItem: (input) => style.archiveItem(input),
      mergeDuplicateItem: (input) => style.mergeDuplicateItem(input),
      createItem: (input) => style.createItem(input),
      findDuplicates: (draft) => style.findStyleItemDuplicates(draft),
      updateProfile: (input) => style.updateProfile(input),
      upsertItem: (input) => style.upsertItem(input),
      upsertItemProfile: (input) => style.upsertItemProfile(input),
      appendItemPhoto: (input) => style.appendItemPhoto(input),
      upsertItemPhotos: (input) => style.upsertItemPhotos(input),
      managePhotoLibrary: input => style.managePhotoLibrary(input),
      saveProductReference: (itemId, input) => style.saveProductReference(itemId, input),
      getPhotoLibrary: itemId => style.getPhotoLibrary(itemId),
    },
  };
}

function requireVNextReadScope(domain: string): void {
  if (domain === 'meals') {
    requireScopes([FLUENT_MEALS_READ_SCOPE]);
    return;
  }
  if (domain === 'style') {
    requireScopes([FLUENT_STYLE_READ_SCOPE]);
    return;
  }
  if (domain === 'wellbeing') {
    requireScopes([FLUENT_HEALTH_READ_SCOPE]);
    return;
  }
  requireAnyScope([FLUENT_MEALS_READ_SCOPE, FLUENT_HEALTH_READ_SCOPE, FLUENT_STYLE_READ_SCOPE]);
}

function requireBudgetReadScope(category: BudgetCategory): void {
  if (category === 'style-clothing') {
    requireScopes([FLUENT_STYLE_READ_SCOPE]);
    return;
  }
  requireScopes([FLUENT_MEALS_READ_SCOPE]);
}

function requireVNextWriteScope(domain: string) {
  if (domain === 'meals') {
    return requireScopes([FLUENT_MEALS_WRITE_SCOPE]);
  }
  if (domain === 'style') {
    return requireScopes([FLUENT_STYLE_WRITE_SCOPE]);
  }
  if (domain === 'wellbeing') {
    return requireScopes([FLUENT_HEALTH_WRITE_SCOPE]);
  }
  return requireScopes([FLUENT_MEALS_WRITE_SCOPE]);
}

function requireBudgetWriteScope(category: BudgetCategory) {
  if (category === 'style-clothing') {
    return requireScopes([FLUENT_STYLE_WRITE_SCOPE]);
  }
  return requireScopes([FLUENT_MEALS_WRITE_SCOPE]);
}

function requireArchiveItemWriteScope(domain: string) {
  if (domain === 'style') {
    return requireScopes([FLUENT_STYLE_WRITE_SCOPE]);
  }
  if (domain === 'meals') {
    return requireScopes([FLUENT_MEALS_WRITE_SCOPE]);
  }
  throw new Error('fluent_archive_item supports only meals and style domains.');
}

function requireStyleClosetWriteScope() {
  return requireScopes([FLUENT_STYLE_WRITE_SCOPE]);
}
