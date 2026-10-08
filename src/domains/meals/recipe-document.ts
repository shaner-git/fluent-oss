import { z } from 'zod';
import { DEFAULT_CURRENCY, normalizeSupportedCurrency, SUPPORTED_CURRENCY_DESCRIPTION } from '../currency';
import { parseJsonLike } from './helpers';

export const recipeInstructionSchema = z.union([
  z.string(),
  z
    .object({
      detail: z.string().min(1),
      duration_minutes: z.number().int().min(0).nullable().optional(),
      equipment: z.array(z.string()).optional(),
      notes: z.string().nullable().optional(),
      step_number: z.number().int().min(1).optional(),
      title: z.string().nullable().optional(),
    })
    .passthrough(),
]);

export const recipeIngredientSchema = z
  .object({
    item: z.string().min(1),
    quantity: z.number().positive().nullable().optional(),
    unit: z.string().min(1).nullable().optional(),
    canonical_item: z.string().min(1).nullable().optional(),
    canonical_quantity: z.number().positive().nullable().optional(),
    canonical_unit: z.string().min(1).nullable().optional(),
    ordering_policy: z.enum(['pantry_item', 'flexible_match', 'direct_match', 'recipe_substitute']).optional(),
    allowed_substitute_queries: z.array(z.string()).nullable().optional(),
    blocked_substitute_terms: z.array(z.string()).nullable().optional(),
    brand_bias: z.array(z.string()).nullable().optional(),
    substitution_context: z.string().nullable().optional(),
  })
  .passthrough();

// Nutrition per serving. Every field is optional: absent or null means unknown; 0 means zero.
export const recipeMacrosSchema = z.object({
  calories: z.number().min(0).nullable().optional(),
  carbs_g: z.number().min(0).nullable().optional(),
  fat_g: z.number().min(0).nullable().optional(),
  fiber_g: z.number().min(0).nullable().optional(),
  protein_g: z.number().min(0).nullable().optional(),
  sodium_mg: z.number().min(0).nullable().optional(),
});
export const RECIPE_STATUSES = ['active', 'draft', 'retired', 'archived'] as const;

export const recipeDocumentSchema = z
  .object({
    id: z.string().min(1).optional(),
    name: z.string().min(1),
    status: z.enum(RECIPE_STATUSES).optional().describe('Omit for a normal save. Use draft to keep an incomplete recipe out of meal planning; a recipe without ingredients or instructions is always saved as a draft.'),
    meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'unknown']).optional(),
    servings: z.number().int().min(1).nullable().optional(),
    total_time: z.number().int().min(1).nullable().optional(),
    active_time: z.number().int().min(0).nullable().optional(),
    macros: recipeMacrosSchema.nullable().optional().describe('Per-serving nutrition. Include only the nutrients you know; 0 means zero.'),
    cost_per_serving_cad: z.number().min(0).nullable().optional().describe('Legacy: estimated cost per serving in CAD. Prefer cost_per_serving with cost_currency.'),
    cost_per_serving: z.number().min(0).nullable().optional().describe('Estimated cost per serving, in cost_currency.'),
    cost_currency: z.string().regex(/^[A-Za-z]{3}$/).nullable().optional().describe(SUPPORTED_CURRENCY_DESCRIPTION),
    source_url: z.string().url().nullable().optional().describe('Optional source URL for provenance only. Fluent does not browse it.'),
    tags: z.array(z.string()).optional().describe('Optional user-facing tags for this recipe.'),
    instructions: z.array(recipeInstructionSchema).min(1).optional(),
    ingredients: z.array(recipeIngredientSchema).min(1).optional(),
  })
  .passthrough();

export type RecipeDocument = z.infer<typeof recipeDocumentSchema>;

export interface JsonPatchOperation {
  op: 'add' | 'remove' | 'replace';
  path: string;
  value?: unknown;
}

export interface RecipeColumns {
  activeTimeMinutes: number | null;
  costPerServingCad: number | null;
  instructionsJson: string;
  kidFriendly: number;
  macrosJson: string | null;
  mealType: string;
  miseEnPlaceJson: string | null;
  name: string;
  prepNotes: string | null;
  rawJson: string;
  reheatGuidance: string | null;
  servings: number | null;
  servingNotes: string | null;
  status: string;
  slug: string;
  totalTimeMinutes: number | null;
}

// Sparse recipe patches replace whole top-level fields. Two fields need merge semantics so a partial
// update never erases known data: macros merge per nutrient (null clears one nutrient), and a legacy
// cost_per_serving_cad update (cached clients) also updates the canonical cost fields.
export function resolveRecipePatchOperations(current: RecipeDocument, operations: JsonPatchOperation[]): JsonPatchOperation[] {
  const resolved = operations.map((operation) => {
    if (operation.path !== '/macros' || operation.op === 'remove' || !operation.value || typeof operation.value !== 'object') return operation;
    const merged: Record<string, unknown> = { ...((current.macros as Record<string, unknown> | null | undefined) ?? {}) };
    for (const [nutrient, value] of Object.entries(operation.value as Record<string, unknown>)) {
      if (value === null) delete merged[nutrient];
      else merged[nutrient] = value;
    }
    return { ...operation, value: merged };
  });
  const paths = new Set(resolved.map((operation) => operation.path));
  const legacyCost = resolved.find((operation) => operation.path === '/cost_per_serving_cad' && operation.op !== 'remove');
  if (legacyCost && !paths.has('/cost_per_serving')) {
    resolved.push({ op: 'replace', path: '/cost_per_serving', value: legacyCost.value });
    if (!paths.has('/cost_currency')) resolved.push({ op: 'replace', path: '/cost_currency', value: 'CAD' });
  }
  return resolved;
}

export function applyJsonPatch<T>(input: T, operations: JsonPatchOperation[]): T {
  const document = structuredClone(input);

  for (const operation of operations) {
    const segments = parsePointer(operation.path);
    if (segments.length === 0 && operation.op !== 'replace') {
      throw new Error('Only replace is supported at the document root.');
    }

    if (segments.length === 0) {
      return structuredClone(operation.value) as T;
    }

    const parent = walkToParent(document as Record<string, unknown>, segments);
    const finalSegment = segments[segments.length - 1];

    if (Array.isArray(parent)) {
      const index = finalSegment === '-' ? parent.length : Number.parseInt(finalSegment, 10);
      if (!Number.isInteger(index)) {
        throw new Error(`Invalid array index in patch path: ${operation.path}`);
      }

      if (operation.op === 'add') {
        parent.splice(index, 0, structuredClone(operation.value));
        continue;
      }

      if (operation.op === 'replace') {
        if (index < 0 || index >= parent.length) {
          throw new Error(`Patch path does not exist: ${operation.path}`);
        }
        parent[index] = structuredClone(operation.value);
        continue;
      }

      if (operation.op === 'remove') {
        if (index < 0 || index >= parent.length) {
          throw new Error(`Patch path does not exist: ${operation.path}`);
        }
        parent.splice(index, 1);
        continue;
      }
    }

    if (typeof parent !== 'object' || parent === null) {
      throw new Error(`Patch path does not exist: ${operation.path}`);
    }

    const recordParent = parent as Record<string, unknown>;
    if (operation.op === 'add' || operation.op === 'replace') {
      recordParent[finalSegment] = structuredClone(operation.value);
      continue;
    }

    if (!(finalSegment in recordParent)) {
      throw new Error(`Patch path does not exist: ${operation.path}`);
    }
    delete recordParent[finalSegment];
  }

  return document;
}

export const ACTIVE_RECIPE_REQUIRES_CONTENT_MESSAGE =
  'An active recipe needs at least one ingredient and one instruction. Save it with status "draft", or add the missing ingredients or instructions.';

export function recipeHasIngredients(recipe: unknown): boolean {
  const ingredients = (recipe as { ingredients?: unknown } | null)?.ingredients;
  return Array.isArray(ingredients) && ingredients.length > 0;
}

function recipeHasInstructions(recipe: unknown): boolean {
  const instructions = (recipe as { instructions?: unknown } | null)?.instructions;
  return Array.isArray(instructions) && instructions.length > 0;
}

// A recipe without ingredients or instructions is a draft: it is kept out of meal planning and
// never counts toward grocery coverage. Cost is normalized so cost_per_serving + cost_currency is
// canonical and the legacy cost_per_serving_cad stays in sync for CAD (cached 1.0.0/1.0.1 clients).
export function validateRecipeDocument(input: unknown): RecipeDocument {
  const recipe = recipeDocumentSchema.parse(parseJsonLike(input));
  const complete = recipeHasIngredients(recipe) && recipeHasInstructions(recipe);
  if (!complete) {
    if (recipe.status === 'active') throw new Error(ACTIVE_RECIPE_REQUIRES_CONTENT_MESSAGE);
    if (!recipe.status) recipe.status = 'draft';
  }
  const currency = normalizeSupportedCurrency(recipe.cost_currency, 'cost_currency');
  if (typeof recipe.cost_per_serving === 'number') {
    recipe.cost_currency = currency ?? DEFAULT_CURRENCY;
    if (recipe.cost_currency === 'CAD') recipe.cost_per_serving_cad = recipe.cost_per_serving;
    else delete recipe.cost_per_serving_cad;
  } else if (typeof recipe.cost_per_serving_cad === 'number') {
    recipe.cost_per_serving = recipe.cost_per_serving_cad;
    recipe.cost_currency = 'CAD';
  } else if (currency) {
    recipe.cost_currency = currency;
  }
  return recipe;
}

export function deriveRecipeColumns(recipe: RecipeDocument & { id: string }): RecipeColumns {
  const status = typeof recipe.status === 'string' && recipe.status.trim().length > 0 ? recipe.status.trim().toLowerCase() : 'active';
  return {
    activeTimeMinutes: recipe.active_time ?? null,
    costPerServingCad: recipe.cost_per_serving_cad ?? null,
    instructionsJson: JSON.stringify(recipe.instructions ?? []),
    kidFriendly: recipe.kid_friendly ? 1 : 0,
    macrosJson: recipe.macros ? JSON.stringify(recipe.macros) : null,
    mealType: recipe.meal_type ?? 'unknown',
    miseEnPlaceJson: Array.isArray(recipe.mise_en_place) ? JSON.stringify(recipe.mise_en_place) : null,
    name: recipe.name,
    prepNotes: typeof recipe.prep_notes === 'string' ? recipe.prep_notes : null,
    rawJson: JSON.stringify(recipe),
    reheatGuidance: typeof recipe.reheat_guidance === 'string' ? recipe.reheat_guidance : null,
    servings: recipe.servings ?? null,
    servingNotes: typeof recipe.serving_notes === 'string' ? recipe.serving_notes : null,
    status,
    slug: slugify(recipe.id),
    totalTimeMinutes: recipe.total_time ?? null,
  };
}

function parsePointer(path: string): string[] {
  if (!path.startsWith('/')) {
    throw new Error(`Invalid JSON Pointer path: ${path}`);
  }

  return path
    .split('/')
    .slice(1)
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function walkToParent(document: Record<string, unknown>, segments: string[]): unknown {
  let current: unknown = document;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];

    if (Array.isArray(current)) {
      const arrayIndex = Number.parseInt(segment, 10);
      if (!Number.isInteger(arrayIndex) || arrayIndex < 0 || arrayIndex >= current.length) {
        throw new Error(`Patch path does not exist: /${segments.slice(0, index + 1).join('/')}`);
      }
      current = current[arrayIndex];
      continue;
    }

    if (typeof current !== 'object' || current === null || !(segment in (current as Record<string, unknown>))) {
      throw new Error(`Patch path does not exist: /${segments.slice(0, index + 1).join('/')}`);
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
