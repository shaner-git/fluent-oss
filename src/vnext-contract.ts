import {
  MEALS_GROCERY_LIST_VNEXT_BRIDGE_TEMPLATE_URI,
  MEALS_GROCERY_LIST_VNEXT_LEGACY_TEMPLATE_URI,
  MEALS_GROCERY_LIST_VNEXT_MULTIFRAME_TEMPLATE_URI,
  MEALS_GROCERY_LIST_VNEXT_PREVIOUS_TEMPLATE_URI,
  MEALS_GROCERY_LIST_VNEXT_TEMPLATE_URI,
} from './domains/meals/grocery-list';
import { BUDGETS_ENVELOPE_SETUP_TEMPLATE_URI } from './domains/budgets/envelope-setup';
import { STYLE_CLOSET_TEMPLATE_URI, STYLE_CLOSET_V4_TEMPLATE_URI, STYLE_CLOSET_V5_TEMPLATE_URI, STYLE_CLOSET_V6_TEMPLATE_URI } from './domains/style/closet-manager';

export const FLUENT_VNEXT_CONTRACT_VERSION = '2026-06-01.product-wide-vnext.phase1';

export type FluentVNextDomain = 'shared' | 'meals' | 'style' | 'wellbeing' | 'finance';
export type FluentVNextObjectType =
  | 'AccountStatus'
  | 'Action'
  | 'ConsentPolicy'
  | 'ContextPacket'
  | 'DomainItem'
  | 'Event'
  | 'Evidence'
  | 'HostProfile'
  | 'MediaBundle'
  | 'PurchaseContext'
  | 'SharedProfile';
export type FluentVNextConceptPhase = 'discovery' | 'phase1_read' | 'phase2_write' | 'adapter';
export type FluentVNextConceptKind = 'read' | 'write' | 'render';
export type FluentVNextHostProfileId = 'public_app' | 'assistant_product' | 'operator_private' | 'compat_legacy';

export interface FluentVNextConcept {
  name: string;
  kind: FluentVNextConceptKind;
  phase: FluentVNextConceptPhase;
  objectTypes: readonly FluentVNextObjectType[];
  domains: readonly FluentVNextDomain[];
  coreRequired: boolean;
  typedDomainSchemas: boolean;
  publicSafe: boolean;
  replacesToolFamilies: readonly string[];
  notes: readonly string[];
}

export interface FluentVNextHostProfile {
  id: FluentVNextHostProfileId;
  title: string;
  role: string;
  conceptNames: readonly string[];
  surfacePolicy: string;
  excludes: readonly string[];
}

export interface FluentVNextGeneratedHostProfile {
  id: FluentVNextHostProfileId;
  title: string;
  contractVersion: string;
  implementedConceptNames: readonly string[];
  omittedConceptNames: readonly string[];
  tools: readonly string[];
  resources: readonly string[];
  writeTools: readonly string[];
  renderAdapters: readonly string[];
  policy: string;
}

export const FLUENT_VNEXT_CONCEPTS = [
  {
    name: 'fluent_get_capabilities',
    kind: 'read',
    phase: 'discovery',
    objectTypes: ['HostProfile', 'ConsentPolicy'],
    domains: ['shared', 'meals', 'style', 'wellbeing', 'finance'],
    coreRequired: true,
    typedDomainSchemas: false,
    publicSafe: true,
    replacesToolFamilies: ['fluent_get_capabilities', 'fluent_list_domains'],
    notes: ['Discovers available domains, consent boundaries, and generated host-profile policy.'],
  },
  {
    name: 'fluent_get_account_status',
    kind: 'read',
    phase: 'discovery',
    objectTypes: ['AccountStatus'],
    domains: ['shared'],
    coreRequired: true,
    typedDomainSchemas: false,
    publicSafe: true,
    replacesToolFamilies: ['fluent_get_account_status'],
    notes: ['Keeps account readiness, access, export, deletion, support, and billing boundaries explicit.'],
  },
  {
    name: 'fluent_get_context',
    kind: 'read',
    phase: 'phase1_read',
    objectTypes: ['ContextPacket', 'SharedProfile', 'DomainItem', 'Evidence', 'Action'],
    domains: ['shared', 'meals', 'style', 'wellbeing', 'finance'],
    coreRequired: true,
    typedDomainSchemas: true,
    publicSafe: true,
    replacesToolFamilies: [
      'fluent_get_home',
      'meals_get_today_context',
      'meals_get_onboarding_calibration',
      'style_get_context',
      'style_get_onboarding_calibration',
      'health_get_context',
    ],
    notes: ['Main compact model context packet. The host model reasons from it; Fluent does not generate final plans or judgments.'],
  },
  {
    name: 'fluent_get_shared_profile',
    kind: 'read',
    phase: 'phase1_read',
    objectTypes: ['SharedProfile', 'ConsentPolicy', 'Evidence'],
    domains: ['shared', 'meals', 'style', 'wellbeing', 'finance'],
    coreRequired: true,
    typedDomainSchemas: true,
    publicSafe: true,
    replacesToolFamilies: ['fluent_get_profile', 'meals_get_preferences', 'style_get_profile', 'health_get_preferences'],
    notes: ['Cross-domain facts with confirmed/inferred status, provenance, freshness, sharing scope, and suppression state.'],
  },
  {
    name: 'fluent_update_shared_profile_patch',
    kind: 'write',
    phase: 'phase2_write',
    objectTypes: ['SharedProfile', 'ConsentPolicy', 'Evidence', 'Event'],
    domains: ['shared', 'meals'],
    coreRequired: true,
    typedDomainSchemas: true,
    publicSafe: true,
    replacesToolFamilies: ['fluent_update_profile', 'meals_record_calibration_response'],
    notes: [
      'Explicit, provenance-backed updates to durable shared or Meals facts, corrections, and suppressions. Style, wellbeing, and finance writes require narrower domain-specific schemas before public exposure.',
    ],
  },
  {
    name: 'fluent_list_items',
    kind: 'read',
    phase: 'phase1_read',
    objectTypes: ['DomainItem', 'Evidence'],
    domains: ['meals', 'style', 'wellbeing', 'finance'],
    coreRequired: true,
    typedDomainSchemas: true,
    publicSafe: true,
    replacesToolFamilies: ['meals_list_recipes', 'meals_get_current_grocery_list', 'style_list_items', 'health_list_goals'],
    notes: ['Lists typed domain state without exposing workflow-specific verbs for every item class.'],
  },
  {
    name: 'fluent_get_item',
    kind: 'read',
    phase: 'phase1_read',
    objectTypes: ['DomainItem', 'Evidence', 'MediaBundle'],
    domains: ['meals', 'style', 'wellbeing', 'finance'],
    coreRequired: true,
    typedDomainSchemas: true,
    publicSafe: true,
    replacesToolFamilies: ['meals_get_recipe', 'style_get_item', 'style_get_item_profile', 'health_get_active_block'],
    notes: ['Fetches one typed item with provenance and freshness instead of exposing item-class-specific read tools.'],
  },
  {
    name: 'fluent_upsert_item',
    kind: 'write',
    phase: 'phase2_write',
    objectTypes: ['DomainItem', 'Evidence', 'Event'],
    domains: ['meals', 'style', 'wellbeing', 'finance'],
    coreRequired: true,
    typedDomainSchemas: true,
    publicSafe: true,
    replacesToolFamilies: ['meals_create_recipe', 'meals_patch_recipe', 'meals_upsert_plan', 'style_upsert_item', 'health_upsert_goal'],
    notes: ['Creates or updates explicit typed domain state; domain validators remain in force.'],
  },
  {
    name: 'fluent_save_recipe',
    kind: 'write',
    phase: 'phase2_write',
    objectTypes: ['DomainItem', 'Evidence', 'Event'],
    domains: ['meals'],
    coreRequired: true,
    typedDomainSchemas: true,
    publicSafe: true,
    replacesToolFamilies: ['meals_create_recipe'],
    notes: [
      'Candidate B named recipe write: saves only a complete, user-approved Meals recipe through the recipe validator with provenance and read-after-write proof.',
    ],
  },
  {
    name: 'fluent_update_recipe_patch',
    kind: 'write',
    phase: 'phase2_write',
    objectTypes: ['DomainItem', 'Evidence', 'Event'],
    domains: ['meals'],
    coreRequired: true,
    typedDomainSchemas: true,
    publicSafe: true,
    replacesToolFamilies: ['meals_patch_recipe'],
    notes: [
      'Candidate B named recipe write: patches an existing saved recipe with a typed sparse schema, explicit approval, provenance, and no recipe identity changes.',
    ],
  },
  {
    name: 'fluent_record_recipe_feedback',
    kind: 'write',
    phase: 'phase2_write',
    objectTypes: ['Event', 'Evidence', 'DomainItem'],
    domains: ['meals'],
    coreRequired: true,
    typedDomainSchemas: true,
    publicSafe: true,
    replacesToolFamilies: ['meals_log_feedback'],
    notes: [
      'Candidate B named recipe write: records explicit recipe-scoped feedback with provenance and read-after-write proof without converting it into a global preference.',
    ],
  },
  {
    name: 'fluent_save_meal_plan',
    kind: 'write',
    phase: 'phase2_write',
    objectTypes: ['DomainItem', 'Evidence', 'Event'],
    domains: ['meals'],
    coreRequired: true,
    typedDomainSchemas: true,
    publicSafe: true,
    replacesToolFamilies: ['meals_upsert_plan', 'meals_accept_plan_candidate'],
    notes: [
      'Named meal-plan write: saves one explicit user-approved, host-authored Meals plan with provenance and read-after-write proof. Fluent stores the accepted plan; the host model owns planning judgment.',
    ],
  },
  {
    name: 'fluent_apply_grocery_list_change',
    kind: 'write',
    phase: 'phase2_write',
    objectTypes: ['DomainItem', 'Evidence', 'Event', 'Action'],
    domains: ['meals'],
    coreRequired: true,
    typedDomainSchemas: true,
    publicSafe: true,
    replacesToolFamilies: ['meals_upsert_grocery_plan_action', 'meals_upsert_grocery_intent'],
    notes: [
      'Named grocery-list write: applies one explicit current living-list change with a discriminated schema, provenance, and read-after-write proof; it does not expose retailer, cart, checkout, order, recipe, generic event, or broad preference writes.',
    ],
  },
  {
    name: 'fluent_apply_grocery_shopping_result',
    kind: 'write',
    phase: 'phase2_write',
    objectTypes: ['DomainItem', 'Evidence', 'Event', 'Action'],
    domains: ['meals'],
    coreRequired: true,
    typedDomainSchemas: true,
    publicSafe: true,
    replacesToolFamilies: ['meals_update_inventory_batch'],
    notes: [
      'Named post-shopping reconcile write: in one explicit user-approved action, marks the current grocery list bought items purchased (plan items and manual intents) and refreshes inventory presence, with provenance and read-after-write proof. It does not expose retailer, cart, checkout, or order writes, invent new items, or infer quantities.',
    ],
  },
  {
    name: 'fluent_get_purchase_context',
    kind: 'read',
    phase: 'phase1_read',
    objectTypes: ['PurchaseContext', 'Evidence'],
    domains: ['meals', 'style'],
    coreRequired: true,
    typedDomainSchemas: true,
    publicSafe: true,
    replacesToolFamilies: ['new:r1_budget_envelopes'],
    notes: [
      'R-1 Budgets read: returns only the reduced declared-envelope purchase signal for style clothing or meals groceries. Fluent does not expose dashboards, category taxonomies, Plaid feeds, or final purchase judgment.',
    ],
  },
  {
    name: 'fluent_set_budget_envelope',
    kind: 'write',
    phase: 'phase2_write',
    objectTypes: ['PurchaseContext', 'Evidence', 'Event'],
    domains: ['meals', 'style'],
    coreRequired: true,
    typedDomainSchemas: true,
    publicSafe: true,
    replacesToolFamilies: ['new:r1_budget_envelopes'],
    notes: [
      'R-1 Budgets write: sets one explicit monthly declared envelope with provenance and read-after-write proof; acceptance-test provenance is non-durable.',
    ],
  },
  {
    name: 'fluent_log_budget_spend',
    kind: 'write',
    phase: 'phase2_write',
    objectTypes: ['PurchaseContext', 'Evidence', 'Event'],
    domains: ['meals', 'style'],
    coreRequired: true,
    typedDomainSchemas: true,
    publicSafe: true,
    replacesToolFamilies: ['new:r1_budget_envelopes'],
    notes: [
      'R-1 Budgets write: logs one explicit spend or correction event against a declared envelope with provenance and read-after-write proof; acceptance-test provenance is non-durable.',
    ],
  },
  {
    name: 'fluent_update_style_item_patch',
    kind: 'write',
    phase: 'phase2_write',
    objectTypes: ['DomainItem', 'Evidence', 'Event'],
    domains: ['style'],
    coreRequired: true,
    typedDomainSchemas: true,
    publicSafe: true,
    replacesToolFamilies: ['style_upsert_item'],
    notes: [
      'R-3.5 Style closet write: applies one typed sparse saved-item patch through StyleService.upsertItem with provenance and read-after-write proof; acceptance-test provenance is non-durable.',
    ],
  },
  {
    name: 'fluent_create_style_item',
    kind: 'write',
    phase: 'phase2_write',
    objectTypes: ['DomainItem', 'Evidence', 'Event'],
    domains: ['style'],
    coreRequired: true,
    typedDomainSchemas: true,
    publicSafe: true,
    replacesToolFamilies: ['style_add_starter_closet_item'],
    notes: [
      'Closet onboarding write: creates one NEW typed style item from a host-produced profile through StyleService.createItem with server-side normalization (strict category, colorFamily, styleRole), create-correct comparatorKey, dedup-on-add, client_token idempotency, host-vision profile, and read-after-write proof; acceptance-test provenance is non-durable.',
    ],
  },
  {
    name: 'fluent_refresh_style_item_profile',
    kind: 'write',
    phase: 'phase2_write',
    objectTypes: ['DomainItem', 'Evidence', 'Event'],
    domains: ['style'],
    coreRequired: true,
    typedDomainSchemas: true,
    publicSafe: true,
    replacesToolFamilies: ['style_upsert_item_profile'],
    notes: [
      'Style closet profile refresh write: rank-merges explicit host/user evidence into an existing saved item through StyleService.upsertItemProfile with per-field source/confidence, no-image vision downgrade, merge audit, provenance, and read-after-write proof. Structured fit fields write only through the dedicated fit_assessment channel with host_fit_vision/user evidence; general profile refreshes strip fit fields before merge so product/display re-vision cannot clobber fit data.',
    ],
  },
  {
    name: 'fluent_set_style_item_image',
    kind: 'write',
    phase: 'phase2_write',
    objectTypes: ['DomainItem', 'Evidence', 'MediaBundle', 'Event'],
    domains: ['style'],
    coreRequired: true,
    typedDomainSchemas: true,
    publicSafe: true,
    replacesToolFamilies: ['style_upsert_item_photos'],
    notes: [
      'R-3.5 Style closet write: stores one host-inspected saved-item image through StyleService.upsertItemPhotos with provenance and read-after-write proof; Fluent does not scrape product pages.',
    ],
  },
  {
    name: 'fluent_archive_item',
    kind: 'write',
    phase: 'phase2_write',
    objectTypes: ['DomainItem', 'Evidence', 'Event'],
    domains: ['meals', 'style', 'wellbeing', 'finance'],
    coreRequired: true,
    typedDomainSchemas: true,
    publicSafe: true,
    replacesToolFamilies: ['style_archive_item', 'meals_delete_inventory_item'],
    notes: ['Non-destructive correction/removal from active memory with a reason and provenance.'],
  },
  {
    name: 'fluent_list_evidence',
    kind: 'read',
    phase: 'phase1_read',
    objectTypes: ['Evidence', 'Event', 'SharedProfile', 'DomainItem'],
    domains: ['shared', 'meals', 'style', 'wellbeing', 'finance'],
    coreRequired: true,
    typedDomainSchemas: true,
    publicSafe: true,
    replacesToolFamilies: ['fluent_list_domain_events', 'style_get_item_provenance', 'style_list_evidence_gaps', 'meals_list_feedback'],
    notes: ['Makes proof, confidence, source snapshots, and evidence gaps first-class instead of hiding them in domain workflows.'],
  },
  {
    name: 'fluent_record_event',
    kind: 'write',
    phase: 'phase2_write',
    objectTypes: ['Event', 'Evidence'],
    domains: ['shared', 'meals', 'style', 'wellbeing', 'finance'],
    coreRequired: true,
    typedDomainSchemas: true,
    publicSafe: true,
    replacesToolFamilies: ['meals_log_feedback', 'meals_record_plan_review', 'style_submit_purchase_visual_observations', 'health_record_block_review'],
    notes: ['Records explicit user/model-observed outcomes, feedback, decisions, reviews, and receipt evidence with provenance.'],
  },
  {
    name: 'fluent_get_media_bundle',
    kind: 'read',
    phase: 'phase1_read',
    objectTypes: ['MediaBundle', 'Evidence', 'DomainItem'],
    domains: ['style', 'meals'],
    coreRequired: true,
    typedDomainSchemas: true,
    publicSafe: true,
    replacesToolFamilies: ['style_get_visual_bundle', 'style_get_purchase_vision_packet'],
    notes: ['Provides host-inspectable media and constraints; the host model owns image interpretation and judgment.'],
  },
  {
    name: 'fluent_list_actions',
    kind: 'read',
    phase: 'phase1_read',
    objectTypes: ['Action', 'Evidence', 'DomainItem'],
    domains: ['shared', 'meals', 'style', 'wellbeing', 'finance'],
    coreRequired: true,
    typedDomainSchemas: true,
    publicSafe: true,
    replacesToolFamilies: ['fluent_get_next_actions', 'meals_get_grocery_plan'],
    notes: ['Lists pending or staged actions without making Fluent a workflow router or planner.'],
  },
  {
    name: 'fluent_apply_action',
    kind: 'write',
    phase: 'phase2_write',
    objectTypes: ['Action', 'DomainItem', 'Evidence', 'Event'],
    domains: ['shared', 'meals', 'style', 'wellbeing', 'finance'],
    coreRequired: true,
    typedDomainSchemas: true,
    publicSafe: true,
    replacesToolFamilies: ['meals_upsert_grocery_plan_action', 'meals_upsert_grocery_intent', 'style_apply_purchase_analysis_action'],
    notes: ['Applies explicit actions with provenance and read-after-write proof.'],
  },
  {
    name: 'fluent_render_surface',
    kind: 'render',
    phase: 'adapter',
    objectTypes: ['Action', 'ContextPacket', 'DomainItem', 'MediaBundle'],
    domains: ['shared', 'meals', 'style', 'wellbeing'],
    coreRequired: false,
    typedDomainSchemas: true,
    publicSafe: true,
    replacesToolFamilies: [
      'meals_render_grocery_list_v2',
      'meals_render_recipe_card',
      'meals_render_pantry_dashboard',
      'style_show_setup_calibration_widget',
      'style_show_purchase_analysis_widget',
    ],
    notes: ['Optional adapter for surviving widgets. State access must work without it.'],
  },
  {
    name: 'fluent_render_budgets_surface',
    kind: 'render',
    phase: 'adapter',
    objectTypes: ['ContextPacket'],
    domains: ['shared', 'meals', 'style'],
    coreRequired: false,
    typedDomainSchemas: true,
    publicSafe: true,
    replacesToolFamilies: ['fluent_render_surface'],
    notes: [
      'Dedicated MCP Apps adapter for the budgets envelope-setup view, split out of the fluent_render_surface mount path. Hosts mount the registration-level output template only — Claude ignores per-result templateUri (observed live 2026-06-11), so this surface needs its own tool.',
    ],
  },
  {
    name: 'fluent_render_style_closet_surface',
    kind: 'render',
    phase: 'adapter',
    objectTypes: ['ContextPacket', 'DomainItem', 'MediaBundle'],
    domains: ['shared', 'style'],
    coreRequired: false,
    typedDomainSchemas: true,
    publicSafe: true,
    replacesToolFamilies: ['style_list_items', 'style_upsert_item', 'style_archive_item'],
    notes: [
      'Dedicated MCP Apps adapter for the Style closet manager view. Hosts mount the registration-level output template; state persists server-side and is re-fetched through the adapter after writes.',
    ],
  },
] as const satisfies readonly FluentVNextConcept[];

const READ_LAYER_CONCEPT_NAMES = [
  'fluent_get_context',
  'fluent_get_shared_profile',
  'fluent_list_items',
  'fluent_get_item',
  'fluent_list_evidence',
  'fluent_get_media_bundle',
  'fluent_get_purchase_context',
] as const;

const WRITE_LAYER_CONCEPT_NAMES = [
  'fluent_update_shared_profile_patch',
  'fluent_upsert_item',
  'fluent_save_recipe',
  'fluent_update_recipe_patch',
  'fluent_record_recipe_feedback',
  'fluent_save_meal_plan',
  'fluent_apply_grocery_list_change',
  'fluent_apply_grocery_shopping_result',
  'fluent_set_budget_envelope',
  'fluent_log_budget_spend',
  'fluent_update_style_item_patch',
  'fluent_create_style_item',
  'fluent_refresh_style_item_profile',
  'fluent_set_style_item_image',
  'fluent_archive_item',
  'fluent_record_event',
] as const;

const IMPLEMENTED_ASSISTANT_PRODUCT_CONCEPT_NAMES = [
  'fluent_get_capabilities',
  'fluent_get_account_status',
  'fluent_get_context',
  'fluent_get_shared_profile',
  'fluent_update_shared_profile_patch',
  'fluent_list_items',
  'fluent_get_item',
  'fluent_save_recipe',
  'fluent_update_recipe_patch',
  'fluent_record_recipe_feedback',
  'fluent_save_meal_plan',
  'fluent_apply_grocery_list_change',
  'fluent_apply_grocery_shopping_result',
  'fluent_get_purchase_context',
  'fluent_set_budget_envelope',
  'fluent_log_budget_spend',
  'fluent_update_style_item_patch',
  'fluent_create_style_item',
  'fluent_refresh_style_item_profile',
  'fluent_set_style_item_image',
  'fluent_archive_item',
  'fluent_list_evidence',
  'fluent_get_media_bundle',
  'fluent_render_surface',
  'fluent_render_budgets_surface',
  'fluent_render_style_closet_surface',
] as const;

const IMPLEMENTED_PUBLIC_APP_CONCEPT_NAMES = IMPLEMENTED_ASSISTANT_PRODUCT_CONCEPT_NAMES;

const IMPLEMENTED_OPERATOR_PRIVATE_CONCEPT_NAMES = [
  ...IMPLEMENTED_ASSISTANT_PRODUCT_CONCEPT_NAMES,
  'fluent_save_recipe',
  'fluent_update_recipe_patch',
  'fluent_record_recipe_feedback',
  'fluent_upsert_item',
  'fluent_record_event',
] as const;

export const FLUENT_VNEXT_HOST_PROFILES = [
  {
    id: 'public_app',
    title: 'Public App',
    role: 'Canonical public product profile for ChatGPT app review and other assistant-native hosts.',
    conceptNames: FLUENT_VNEXT_CONCEPTS.map((concept) => concept.name),
    surfacePolicy:
      'Expose the same product-safe context, evidence, media, and explicit write primitives as the canonical /mcp assistant product profile. Public safety belongs in the contract itself, not in a separate user-facing route.',
    excludes: [
      'server-side planning or final stylist judgment',
      'browser, retailer, checkout, or product-page operation',
      'raw finance data',
      'tracker-shaped Health behavior',
      'old widget resource tails',
      'operator diagnostics and migration tools',
      'generic item upsert/event writes until their domain-specific schemas survive zero-based host review',
      'grocery list mutation outside the bounded fluent_apply_grocery_list_change schema',
    ],
  },
  {
    id: 'assistant_product',
    title: 'Assistant Product',
    role: 'Main public product profile for Claude, Codex, generic MCP, and advanced assistant-native hosts.',
    conceptNames: FLUENT_VNEXT_CONCEPTS.map((concept) => concept.name),
    surfacePolicy:
      'Expose only product-safe context, evidence, media, and explicit writes with typed schemas. Normal hosted /mcp is the canonical protected assistant endpoint for ChatGPT, Claude, Codex, OpenClaw, and generic MCP; it is not a developer/full-power lane or a more permissive user-bypass route. Private diagnostics, migrations, and arbitrary legacy detail tools stay out of every public profile.',
    excludes: [
      'developer or operator diagnostics as default product behavior',
      'external execution as Fluent Core behavior',
      'legacy detail tools that bypass context-first safety',
      'generic item upsert/event writes until their domain-specific schemas survive zero-based host review',
      'grocery list mutation outside the bounded fluent_apply_grocery_list_change schema',
    ],
  },
  {
    id: 'operator_private',
    title: 'Operator Private',
    role: 'Private/admin/dev lane for migrations, exports, diagnostics, verification, and internal execution experiments.',
    conceptNames: FLUENT_VNEXT_CONCEPTS.map((concept) => concept.name),
    surfacePolicy:
      'May include private maintenance tools outside the product contract, but those tools must not be described as public Fluent Core.',
    excludes: ['public product positioning', 'reviewed app exposure by default'],
  },
  {
    id: 'compat_legacy',
    title: 'Compatibility Legacy',
    role: 'Private migration and equivalence profile for old tool names during cutover.',
    conceptNames: [],
    surfacePolicy:
      'Maps old tools to current concepts only for migration and deterministic equivalence checks. It is not a launchable public profile.',
    excludes: ['public app submission', 'new host guidance', 'portfolio demo center'],
  },
] as const satisfies readonly FluentVNextHostProfile[];

export function fluentVNextContractRegistry() {
  return {
    version: FLUENT_VNEXT_CONTRACT_VERSION,
    concepts: FLUENT_VNEXT_CONCEPTS,
    hostProfiles: FLUENT_VNEXT_HOST_PROFILES,
    readLayerConceptNames: READ_LAYER_CONCEPT_NAMES,
    writeLayerConceptNames: WRITE_LAYER_CONCEPT_NAMES,
    implementedAssistantProductConceptNames: IMPLEMENTED_ASSISTANT_PRODUCT_CONCEPT_NAMES,
  };
}

export function fluentVNextConcept(name: string): FluentVNextConcept | undefined {
  return FLUENT_VNEXT_CONCEPTS.find((concept) => concept.name === name);
}

export function fluentVNextHostProfile(id: FluentVNextHostProfileId): FluentVNextHostProfile {
  const profile = FLUENT_VNEXT_HOST_PROFILES.find((entry) => entry.id === id);
  if (!profile) {
    throw new Error(`Unknown Fluent vNext host profile: ${id}`);
  }
  return profile;
}

export function fluentVNextConceptsForHostProfile(id: FluentVNextHostProfileId): FluentVNextConcept[] {
  const profile = fluentVNextHostProfile(id);
  const conceptByName = new Map<string, FluentVNextConcept>(FLUENT_VNEXT_CONCEPTS.map((concept) => [concept.name, concept]));
  return profile.conceptNames.map((name) => {
    const concept = conceptByName.get(name);
    if (!concept) {
      throw new Error(`Fluent vNext host profile ${id} references unknown concept: ${name}`);
    }
    return concept;
  });
}

export function fluentVNextReadLayerConceptNames(): readonly string[] {
  return READ_LAYER_CONCEPT_NAMES;
}

export function fluentVNextWriteLayerConceptNames(): readonly string[] {
  return WRITE_LAYER_CONCEPT_NAMES;
}

export function fluentVNextImplementedAssistantProductConceptNames(): readonly string[] {
  return IMPLEMENTED_ASSISTANT_PRODUCT_CONCEPT_NAMES;
}

export function fluentVNextGeneratedHostProfile(id: FluentVNextHostProfileId): FluentVNextGeneratedHostProfile {
  const profile = fluentVNextHostProfile(id);
  const implementedConceptNames =
    id === 'public_app'
      ? profile.conceptNames.filter((name) => IMPLEMENTED_PUBLIC_APP_CONCEPT_NAMES.includes(name as never))
      : id === 'assistant_product'
        ? profile.conceptNames.filter((name) => IMPLEMENTED_ASSISTANT_PRODUCT_CONCEPT_NAMES.includes(name as never))
      : id === 'operator_private'
        ? profile.conceptNames.filter((name) => IMPLEMENTED_OPERATOR_PRIVATE_CONCEPT_NAMES.includes(name as never))
      : profile.conceptNames;
  const omittedConceptNames = profile.conceptNames.filter((name) => !implementedConceptNames.includes(name));
  const implementedConcepts = implementedConceptNames.map((name) => fluentVNextConcept(name)).filter(Boolean) as FluentVNextConcept[];

  return {
    id,
    title: profile.title,
    contractVersion: FLUENT_VNEXT_CONTRACT_VERSION,
    implementedConceptNames,
    omittedConceptNames,
    tools: implementedConcepts.map((concept) => concept.name),
    resources: [
      ...(implementedConceptNames.includes('fluent_render_surface')
        ? [
          MEALS_GROCERY_LIST_VNEXT_LEGACY_TEMPLATE_URI,
          MEALS_GROCERY_LIST_VNEXT_PREVIOUS_TEMPLATE_URI,
          MEALS_GROCERY_LIST_VNEXT_BRIDGE_TEMPLATE_URI,
          MEALS_GROCERY_LIST_VNEXT_MULTIFRAME_TEMPLATE_URI,
          MEALS_GROCERY_LIST_VNEXT_TEMPLATE_URI,
        ]
        : []),
      ...(implementedConceptNames.includes('fluent_render_budgets_surface')
        ? [BUDGETS_ENVELOPE_SETUP_TEMPLATE_URI]
        : []),
      ...(implementedConceptNames.includes('fluent_render_style_closet_surface')
        ? [STYLE_CLOSET_V4_TEMPLATE_URI, STYLE_CLOSET_V5_TEMPLATE_URI, STYLE_CLOSET_V6_TEMPLATE_URI, STYLE_CLOSET_TEMPLATE_URI]
        : []),
    ],
    writeTools: implementedConcepts.filter((concept) => concept.kind === 'write').map((concept) => concept.name),
    renderAdapters: implementedConcepts.filter((concept) => concept.kind === 'render').map((concept) => concept.name),
    policy: profile.surfacePolicy,
  };
}
