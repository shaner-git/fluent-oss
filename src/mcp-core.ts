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
import { STYLE_ITEM_FIT_FIELDS, type StyleDuplicateCandidate, type StyleDuplicateCandidateSignals, type StyleService } from './domains/style/service';
import {
  FLUENT_GUIDANCE_RESOURCE_URIS,
} from './contract';
import { getFluentGuidanceDocument } from './fluent-guidance';
import { FluentCoreService, resolveHostFamily, type FluentAccountStatus } from './fluent-core';
import { iconFor, jsonResource, provenanceInputSchema, readViewSchema, toolResult, writeResponseModeSchema } from './mcp-shared';
import { createFetchTimeoutSignal, fetchStyleVisualBundleImage } from './mcp-style';
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
const fluentVNextSharedProfileWriteDomainSchema = z.enum(['shared', 'meals']).describe(
  'Domain for this explicit public memory write. Use shared only for timezone or display_name facts; use meals for confirmed food, grocery, routine, and meal-planning facts. Style, wellbeing, and finance writes are not exposed through this public fact patch.',
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
const fluentVNextMediaBundlePurposeSchema = z.enum(['saved_item_review', 'style_purchase_advice', 'visual_evidence_check']).describe(
  'Reason media is being fetched. Use style_purchase_advice for shopping/style advice, saved_item_review for an existing saved item, or visual_evidence_check when checking what images are available.',
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
  source: z.enum(['host_fit_vision', 'user']).optional().describe('Source for fit fields. Defaults to host_fit_vision; user-stated fit ranks above vision.'),
}).strict().optional().describe(
  'Sparse fit-assessment fields. Fit fields can ONLY be written here; fit fields inside profile are ignored to prevent product/display re-vision from clobbering fit data.',
);
const fluentStyleItemPatchSchema = z.object({
  brand: z.string().nullable().optional(),
  care: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  formality: z.number().nullable().optional(),
  name: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  size: z.string().nullable().optional(),
  status: z.enum(['active']).optional().describe('Set to "active" to restore (un-archive) an item to the active closet. Only "active" is accepted here; archiving must use fluent_archive_item with an explicit disposition.'),
  subcategory: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  use_case: z.array(z.string()).optional(),
}).strict().describe('Sparse Style closet item patch. Omitted fields are not changed. Set status:"active" to restore an archived item.');
const fluentStyleImageTypeSchema = z.enum(['primary', 'alternate', 'fit']).optional().describe(
  'Image role to store: primary/alternate are clean catalog/product display photos for the closet tile; fit is a worn/on-model photo for fit assessment.',
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
  'The single explicit fact the user approved saving. Use meals kinds for food/planning memory; use timezone or display_name only for shared profile facts.',
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
  value: z.string().describe('The user-confirmed value to remember, such as "Sunday", "30", "mushrooms", or "America/Toronto".'),
}).strict().describe(
  'One explicit user-approved Fluent memory fact. Required shape: patch.kind, patch.value, and patch.status. Do not send inferred facts, plans, transcripts, or arbitrary JSON.',
);
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
const fluentVNextMealPlanSchema = z.object({
  entries: z.array(fluentVNextMealPlanEntrySchema).min(1).max(28).describe('Approved meal-plan entries. Keep this to the user-approved planning horizon.'),
  generated_at: z.string().optional().describe('Optional ISO timestamp for when the host drafted the plan.'),
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
      billingBoundary: 'Managed Fluent is currently free.',
      paymentDetails: 'Current price: free.',
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
    'Managed Fluent is currently free. Account management happens on meetfluent.app.',
  ].filter((line): line is string => Boolean(line)).join('\n');
}

function vNextToolResult(
  data: unknown,
  options: {
    compactContextSummaryText?: boolean;
    includeMediaReferences?: boolean;
    preserveRecipeIngredients?: boolean;
    preserveListItems?: boolean;
    preserveStylePurchaseOwnedSlice?: boolean;
  } = {},
) {
  const structuredContent = toVNextModelVisibleValue(data, options);
  return toolResult(data, {
    structuredContent,
    textData: options.compactContextSummaryText
      ? buildVNextContextSummaryText(structuredContent)
      : buildVNextModelText(data, options),
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
export function buildStyleItemCreateText(payload: unknown): string {
  const p = (payload && typeof payload === 'object' ? payload : {}) as {
    createdItemId?: string | null;
    duplicateCandidates?: StyleDuplicateCandidate[];
    nextAction?: string | null;
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
    return `Created style item ${createdId}.`;
  }
  if (p.status === 'skipped_duplicate' && candidates.length > 0) {
    return `Not created — matched an existing item: ${describe(candidates[0])}. Returned the existing item instead.`;
  }
  if (p.status === 'duplicate_warning' && candidates.length > 0) {
    return `Not created. Fluent flagged ${candidates.length === 1 ? 'a possible existing match' : 'possible existing matches'} but does NOT decide sameness — you do. Compare these signals (and the user's photo, if you have it) against the garment being added: ${candidates.map(describe).join('; ')}. `
      + 'To see a candidate\'s photo, call fluent_get_media_bundle with its id (or render fluent_render_style_closet_surface filtered to it). '
      + 'If it is genuinely a different item, call again with on_duplicate:"force"; if it is the same item, use on_duplicate:"skip".';
  }
  if (p.status === 'acceptance_test_non_durable') {
    return [p.userMessage, p.nextAction].filter((line): line is string => typeof line === 'string' && line.length > 0).join(' ');
  }
  return 'Style item not created (no-op).';
}

function styleCreateAckCreatedItemId(ack: FluentVNextWriteAck): string | null {
  const payload = ack.payload && typeof ack.payload === 'object' && !Array.isArray(ack.payload)
    ? ack.payload as { createdItemId?: unknown }
    : null;
  return typeof payload?.createdItemId === 'string' && payload.createdItemId.length > 0
    ? payload.createdItemId
    : null;
}

function mergeStyleCreateImageAck(
  createAck: FluentVNextWriteAck,
  imageAck: FluentVNextWriteAck | null,
  imageError: unknown,
): FluentVNextWriteAck {
  const imageErrorMessage = imageError instanceof Error ? imageError.message : imageError ? String(imageError) : null;
  const payload = createAck.payload && typeof createAck.payload === 'object' && !Array.isArray(createAck.payload)
    ? createAck.payload as Record<string, unknown>
    : {};
  return {
    ...createAck,
    payload: {
      ...payload,
      imageAttachment: {
        attempted: true,
        error: imageErrorMessage,
        payload: imageAck?.payload ?? null,
        status: imageAck ? 'attached' : 'failed',
      },
    },
    readAfterWrite: imageAck?.readAfterWrite ?? createAck.readAfterWrite,
  };
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
  let detail = candidates.length === 0 ? 'no fetchable photo URL on the saved item' : '';
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
      detail = `server fetched ${fetched.mimeType}, which the vision model cannot display`;
    } catch (error) {
      detail = error instanceof Error ? error.message : String(error);
    }
  }
  // No host-viewable image could be attached. Surface WHY so the model degrades honestly instead of
  // silently appearing to ignore the photo, and so the reason is observable. Only frame the next step as a
  // re-analysis when one is actually pending; a plain saved-item review gets neutral guidance.
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
  options: { publicWriteRateLimiter?: FluentRateLimitBinding } = {},
) {
  const budgetsEnvelopeSetupWidgetMeta = buildBudgetsEnvelopeSetupWidgetMeta(origin);
  const vNextReadSecuritySchemes = oauth2SecuritySchemes([
    FLUENT_MEALS_READ_SCOPE,
    FLUENT_STYLE_READ_SCOPE,
  ]);
  const vNextWriteSecuritySchemes = oauth2SecuritySchemes([
    FLUENT_MEALS_WRITE_SCOPE,
  ]);
  const vNextBudgetWriteSecuritySchemes = oauth2AlternativeSecuritySchemes([
    FLUENT_MEALS_WRITE_SCOPE,
    FLUENT_STYLE_WRITE_SCOPE,
  ]);
  const vNextStyleWriteSecuritySchemes = oauth2SecuritySchemes([FLUENT_STYLE_WRITE_SCOPE]);
  const vNextStyleReadSecuritySchemes = oauth2SecuritySchemes([FLUENT_STYLE_READ_SCOPE]);
  const withVNextReadSecurity = <T extends Record<string, unknown>>(config: T) => withToolSecurity(config, vNextReadSecuritySchemes);
  const withVNextWriteSecurity = <T extends Record<string, unknown>>(config: T) => withToolSecurity(config, vNextWriteSecuritySchemes);
  const withVNextBudgetWriteSecurity = <T extends Record<string, unknown>>(config: T) => withToolSecurity(config, vNextBudgetWriteSecuritySchemes);
  const withVNextStyleClosetWriteSecurity = <T extends Record<string, unknown>>(config: T) => withToolSecurity(config, vNextStyleWriteSecuritySchemes);
  const withVNextStyleReadSecurity = <T extends Record<string, unknown>>(config: T) => withToolSecurity(config, vNextStyleReadSecuritySchemes);

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
      annotations: { title: 'Get Fluent Shared Profile', readOnlyHint: true, idempotentHint: true },
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
        'Fetch a compact context packet for a domain and intent. Use this first for broad Meals planning, currentness checks, "what Fluent knows", and weeknight meal planning: call fluent_get_context with domain="meals" and intent="planning". The host model owns reasoning and final judgment; Fluent supplies durable context, typed items, evidence gaps, freshness, and suggested writeback boundaries.',
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
      annotations: { title: 'Start Here: Fluent Context', readOnlyHint: true, idempotentHint: true },
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
        'List typed domain items such as Meals recipes, the living grocery list, inventory items, and Style closet items. For saved Meals recipe discovery, pass item_type="recipe" plus query for the recipe title or ID, then call fluent_get_item with the returned ID before deriving grocery-list deltas. The shared envelope is generic, but the payload remains the canonical typed domain record.',
      inputSchema: {
        cursor: z.string().optional().describe('Optional opaque pagination cursor returned by a prior Fluent list call. Omit for the first page.'),
        domain: fluentVNextDomainSchema,
        item_type: fluentVNextItemTypeSchema.optional(),
        limit: z.number().int().min(1).max(50).optional().describe('Optional maximum number of items to return, from 1 to 50. Omit to use Fluent defaults.'),
        query: fluentVNextItemQuerySchema.optional(),
        status: z.enum(['active', 'archived', 'planned', 'completed', 'any']).optional().describe(
          'Optional lifecycle filter. Use active for normal saved state, planned for future meal/grocery state, completed for done items, archived for inactive memory, or any when the user asks broadly.',
        ),
      },
      annotations: { title: 'List Fluent Items', readOnlyHint: true, idempotentHint: true },
    }),
    async ({ cursor, domain, item_type, limit, query, status }) => {
      requireVNextReadScope(domain);
      const page = await listFluentVNextItemsPage(vNextReadServices, { cursor, domain, itemType: item_type, limit, query, status });
      // Style list items are compacted (see vnext-read-layer compactStyleListItem), so a full page fits the
      // model-visible text budget — let the host see every item on the page instead of the default 8-item
      // array cap that hid 91 of a 99-item closet. Other domains' list items are not yet compacted, so they
      // keep the conservative cap until they get an analogous compact projection.
      return vNextToolResult(page, { preserveListItems: domain === 'style' });
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
        'Fetch host-inspectable media references and constraints for a subject. Fluent provides media provenance and delivery; the host model must inspect images before making visual claims.',
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
    withVNextWriteSecurity({
      title: 'Update Fluent Shared Profile Patch',
      description:
        'Apply an explicit, provenance-backed profile patch through the canonical shared or domain profile service. Use only when the user intends to change durable Fluent memory.',
      inputSchema: {
        domain: fluentVNextSharedProfileWriteDomainSchema,
        patch: fluentVNextSharedProfilePatchSchema,
        response_mode: writeResponseModeSchema,
        ...provenanceInputSchema,
      },
      annotations: { title: 'Update Fluent Shared Profile Patch', readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
    }),
    async (args) => {
      const authProps = requireVNextWriteScope(args.domain);
      return vNextToolResult(
        await updateFluentVNextSharedProfilePatch(vNextWriteServices, {
          domain: args.domain,
          host: resolveHostFamily(),
          patch: args.patch,
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
      return vNextToolResult(
        await updateFluentVNextRecipePatch(vNextWriteServices, {
          approval: args.approval,
          patch: args.patch,
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
        'Save one explicit user-approved, host-authored Meals plan and return read-after-write proof. Use only after the host model drafts the plan in conversation and the user approves saving it. This does not generate a plan on the server, browse retailers, mutate carts, create grocery items, save recipes, or infer pantry/inventory truth.',
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
        'Reconcile a completed shopping trip: in one explicit user-approved action, mark the current Meals grocery list bought items purchased (plan items and manual intents) and refresh inventory presence, returning read-after-write proof. Provide bought_items OR mark_all_to_buy_bought. This does not browse retailers, mutate carts, place orders, invent new items, or infer quantities.',
      inputSchema: {
        approval: fluentVNextRecipeWriteApprovalSchema,
        bought_items: z
          .array(
            z.object({
              item_key: z
                .string()
                .min(1)
                .describe('A plan-item itemKey OR a manual-intent id from the current grocery-list readback.'),
              status: z
                .enum(['bought', 'skipped'])
                .optional()
                .describe('Defaults to bought.'),
            }),
          )
          .optional()
          .describe('Explicit subset of current-list items to reconcile. Provide this OR mark_all_to_buy_bought.'),
        mark_all_to_buy_bought: z
          .boolean()
          .optional()
          .describe('Mark every current to-buy item (plan items + manual intents) as bought. Provide this OR bought_items.'),
        currentness_confirmed: z.boolean().optional().describe(
          'Required only when the current grocery list is stale or incomplete and the user explicitly confirms they still want to reconcile that list.',
        ),
        list_id: z.string().optional().describe('Optional current grocery-list ID from a recent readback; used to prevent target mismatches.'),
        list_version: z.string().optional().describe('Optional current grocery-list version from a recent readback; used to prevent stale writes.'),
        response_mode: writeResponseModeSchema,
        week_start: z.string().optional().describe('Optional selected meal-plan week start from the current grocery-list readback.'),
        ...provenanceInputSchema,
      },
      annotations: { title: 'Apply Fluent Grocery Shopping Result', readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
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
        await applyFluentVNextGroceryShoppingResult(vNextWriteServices, {
          boughtItems: args.bought_items?.map((entry) => ({ itemKey: entry.item_key, status: entry.status })),
          approval: args.approval,
          currentnessConfirmed: args.currentness_confirmed,
          listId: args.list_id,
          listVersion: args.list_version,
          markAllToBuyBought: args.mark_all_to_buy_bought,
          provenance: buildMutationProvenance(authProps, args),
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
        'Apply a typed sparse catalog/details patch to one saved Style closet item and return read-after-write proof. This is catalog-only: tags, use_case, care, and notes are not durable here and should go through fluent_refresh_style_item_profile instead. For explicit user-approved closet management only; it does not browse retailers, infer taste, or make purchase advice.',
      inputSchema: {
        approval: fluentVNextRecipeWriteApprovalSchema,
        item_id: z.string().min(1).describe('Existing saved Fluent Style item ID.'),
        patch: fluentStyleItemPatchSchema,
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
      const ack = await updateFluentStyleItemPatch(vNextWriteServices, {
        itemId: args.item_id,
        patch: args.patch,
        provenance: buildStyleClosetMutationProvenance(authProps, args),
        sourceSnapshot: args.source_snapshot,
      });
      return toolResult(ack, {
        structuredContent: ack,
        textData: `Updated style item ${args.item_id}.`,
      });
    },
  );

  server.registerTool(
    'fluent_create_style_item',
    withVNextStyleClosetWriteSecurity({
      title: 'Create Fluent Style Item',
      description:
        'Create one NEW saved Style closet item from a profile YOU (the host model) produced by looking at the garment. Fluent validates and normalizes the structured fields, infers the comparator key, surfaces possible existing matches with discriminating signals (brand/color/type/size/tags) for YOU to judge — Fluent flags candidates but does NOT decide sameness — stores provenance + confidence, and returns read-after-write proof. Fluent does not inspect images, browse or scrape product pages, resolve product galleries, or infer taste; you own the visual judgment. For explicit user-approved closet onboarding only.',
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
        image_url: z.string().url().nullable().optional().describe('Optional direct image URL that the host already inspected and explicitly chose to store for this item. Fluent stores this URL with the requested image_type; it does not fetch a product page or resolve a gallery.'),
        image_type: fluentStyleImageTypeSchema,
        on_duplicate: z.enum(['warn', 'force', 'skip']).optional().describe('warn (default) writes nothing and returns candidate matches with discriminating signals for YOU to compare against the garment (Fluent does not decide sameness); skip returns the existing match; force creates anyway.'),
        client_token: z.string().min(1).max(200).optional().describe('Idempotency token; a retry with the same token returns the same item.'),
        batch_id: z.string().optional().describe('Groups items onboarded together for batch review.'),
        provenance: nestedProvenanceSchema.describe('Who/what initiated this explicit user-approved onboarding; acceptance_test provenance stays non-durable.'),
        response_mode: fluentStyleClosetWriteResponseModeSchema,
        source_snapshot: fluentVNextSourceSnapshotSchema.optional(),
        ...provenanceInputSchema,
      },
      annotations: { title: 'Create Fluent Style Item', readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
      _meta: {
        // Widget-callable so the onboarding/confirm surface can create items; model-visible like the patch tool.
        'openai/widgetAccessible': true,
      },
    }),
    async (args) => {
      await requireExplicitPublicWriteApproval(args.approval, 'fluent_create_style_item', options.publicWriteRateLimiter);
      const authProps = requireStyleClosetWriteScope();
      const profile = stripStyleItemFitFields((args.profile ?? {}) as Record<string, unknown>);
      const ack = await createFluentStyleItem(vNextWriteServices, {
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
        // Phase 1 is text-first: no image is transferred, so vision-sourced fields are downgraded server-side.
        hasImage: false,
        onDuplicate: args.on_duplicate,
        clientToken: args.client_token,
        batchId: args.batch_id,
        provenance: buildStyleClosetMutationProvenance(authProps, args),
        sourceSnapshot: args.source_snapshot,
      });
      const createdItemId = styleCreateAckCreatedItemId(ack);
      if (args.image_url && createdItemId) {
        try {
          const imageAck = await setFluentStyleItemImage(vNextWriteServices, {
            imageType: args.image_type ?? 'primary',
            imageUrl: args.image_url,
            itemId: createdItemId,
            provenance: buildStyleClosetMutationProvenance(authProps, args),
            sourceSnapshot: args.source_snapshot,
          });
          const combinedAck = mergeStyleCreateImageAck(ack, imageAck, null);
          return toolResult(combinedAck, {
            structuredContent: combinedAck,
            textData: `${buildStyleItemCreateText(ack.payload)} Attached ${args.image_type ?? 'primary'} image ${args.image_url}.`,
          });
        } catch (error) {
          const combinedAck = mergeStyleCreateImageAck(ack, null, error);
          const message = error instanceof Error ? error.message : String(error);
          return toolResult(combinedAck, {
            structuredContent: combinedAck,
            textData: `${buildStyleItemCreateText(ack.payload)} The item exists, but Fluent could not attach image_url: ${message}`,
          });
        }
      }
      return toolResult(ack, {
        structuredContent: ack,
        textData: buildStyleItemCreateText(ack.payload),
      });
    },
  );

  server.registerTool(
    'fluent_refresh_style_item_profile',
    withVNextStyleClosetWriteSecurity({
      title: 'Refresh Fluent Style Item Profile',
      description:
        'Refresh selected profile fields on an EXISTING saved Style closet item from explicit host/user evidence. This is the durable home for tags and descriptors, including web-found ones stamped url_scrape or host_text. Fluent rank-merges each field, preserves stronger existing evidence, downgrades visual claims when no image is present, and returns read-after-write proof.',
      inputSchema: {
        approval: fluentVNextRecipeWriteApprovalSchema,
        item_id: z.string().min(1).describe('Existing saved Fluent Style item ID to refresh. Unknown IDs are rejected.'),
        profile: z.record(z.string(), z.unknown()).describe('Sparse item profile fields to refresh. Omitted fields are not changed.'),
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
      const profile = stripStyleItemFitFields(args.profile as Record<string, unknown>);
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
        'Set one host-inspected image URL for a saved Style closet item and return read-after-write proof. The host must inspect or provide the image URL; Fluent does not scrape or browse product pages. Open and confirm the image shows this item before setting it; hold uncertain or representative images for user confirmation.',
      inputSchema: {
        approval: fluentVNextRecipeWriteApprovalSchema,
        caption: z.string().nullable().optional(),
        image_type: fluentStyleImageTypeSchema,
        image_url: z.string().url().describe('Host-inspected image URL to store as Style item media.'),
        item_id: z.string().min(1).describe('Existing saved Fluent Style item ID.'),
        provenance: nestedProvenanceSchema.describe('Who/what initiated this explicit user-approved image set; acceptance_test provenance stays non-durable.'),
        response_mode: fluentStyleClosetWriteResponseModeSchema,
        source_snapshot: fluentVNextSourceSnapshotSchema.optional(),
        ...provenanceInputSchema,
      },
      annotations: { title: 'Set Fluent Style Item Image', readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
      _meta: {
        'openai/widgetAccessible': true,
      },
    }),
    async (args) => {
      await requireExplicitPublicWriteApproval(
        args.approval,
        'fluent_set_style_item_image',
        options.publicWriteRateLimiter,
      );
      const authProps = requireStyleClosetWriteScope();
      const ack = await setFluentStyleItemImage(vNextWriteServices, {
        caption: args.caption ?? null,
        imageType: args.image_type,
        imageUrl: args.image_url,
        itemId: args.item_id,
        provenance: buildStyleClosetMutationProvenance(authProps, args),
        sourceSnapshot: args.source_snapshot,
      });
      return toolResult(ack, {
        structuredContent: ack,
        textData: `Updated style item image for ${args.item_id}.`,
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
        'Archive a typed domain item through the canonical domain service with an explicit reason, disposition, provenance, and read-after-write proof. Use for returned, sold, donated, gifted, worn-out, never-purchased, duplicate, or otherwise gone items. This removes an item from active memory without deleting audit history.',
      inputSchema: {
        approval: fluentVNextRecipeWriteApprovalSchema,
        domain: fluentVNextArchiveDomainSchema,
        disposition: z.enum(['returned', 'sold', 'donated', 'gifted', 'worn_out', 'never_purchased', 'duplicate', 'other']).optional().describe(
          'Optional user-confirmed archive disposition recorded in the archive evidence trail.',
        ),
        item_id: z.string().optional(),
        item_name: z.string().optional(),
        item_type: fluentVNextItemTypeSchema.optional(),
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
      return vNextToolResult(
        await archiveFluentVNextItem(vNextWriteServices, {
          disposition: args.disposition,
          domain: args.domain,
          itemId: args.item_id,
          itemName: args.item_name,
          itemType: args.item_type,
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
        'Fetch the Fluent account/status surface when the user asks about account status, access, export, deletion, reactivation, support, or whether Fluent is ready for their account. Returns access state, enabled domains, account and support links, export and deletion instructions, and support email. Managed Fluent is currently free.',
      annotations: { title: 'Get Fluent Account Status', readOnlyHint: true, idempotentHint: true },
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
      upsertPlan: (input) => meals.upsertPlan(input),
      upsertGroceryIntent: (input) => meals.upsertGroceryIntent(input),
      upsertGroceryPlanAction: (input) => meals.upsertGroceryPlanAction(input),
      applyGroceryShoppingResult: (input) => meals.applyGroceryShoppingResult(input),
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
      createItem: (input) => style.createItem(input),
      findDuplicates: (draft) => style.findStyleItemDuplicates(draft),
      updateProfile: (input) => style.updateProfile(input),
      upsertItem: (input) => style.upsertItem(input),
      upsertItemProfile: (input) => style.upsertItemProfile(input),
      upsertItemPhotos: (input) => style.upsertItemPhotos(input),
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
