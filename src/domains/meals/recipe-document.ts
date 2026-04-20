import { z } from 'zod';
import { parseJsonLike } from './helpers';

const recipeInstructionSchema = z.union([
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

const recipeIngredientSchema = z
  .object({
    item: z.string().min(1),
    quantity: z.number().positive(),
    unit: z.string().min(1),
    canonical_item: z.string().min(1).nullable().optional(),
    canonical_quantity: z.number().positive().nullable().optional(),
    canonical_unit: z.string().min(1).nullable().optional(),
    ordering_policy: z.enum(['pantry_item', 'flexible_match', 'direct_match', 'recipe_substitute']),
    allowed_substitute_queries: z.array(z.string()).nullable().optional(),
    blocked_substitute_terms: z.array(z.string()).nullable().optional(),
    brand_bias: z.array(z.string()).nullable().optional(),
    substitution_context: z.string().nullable().optional(),
  })
  .passthrough();

export const recipeDocumentSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
    servings: z.number().int().min(1),
    total_time: z.number().int().min(1),
    active_time: z.number().int().min(0),
    macros: z.object({
      calories: z.number(),
      fiber_g: z.number(),
      protein_g: z.number(),
      sodium_mg: z.number(),
    }),
    cost_per_serving_cad: z.number().min(0),
    instructions: z.array(recipeInstructionSchema).min(1),
    ingredients: z.array(recipeIngredientSchema).min(1),
  })
  .passthrough();

export type RecipeDocument = z.infer<typeof recipeDocumentSchema>;

export interface JsonPatchOperation {
  op: 'add' | 'remove' | 'replace';
  path: string;
  value?: unknown;
}

export interface RecipeColumns {
  activeTimeMinutes: number;
  costPerServingCad: number;
  instructionsJson: string;
  kidFriendly: number;
  macrosJson: string;
  mealType: string;
  miseEnPlaceJson: string | null;
  name: string;
  prepNotes: string | null;
  rawJson: string;
  reheatGuidance: string | null;
  servings: number;
  servingNotes: string | null;
  status: string;
  slug: string;
  totalTimeMinutes: number;
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

export function validateRecipeDocument(input: unknown): RecipeDocument {
  return recipeDocumentSchema.parse(parseJsonLike(input));
}

export function deriveRecipeColumns(recipe: RecipeDocument): RecipeColumns {
  const status = typeof recipe.status === 'string' && recipe.status.trim().length > 0 ? recipe.status.trim().toLowerCase() : 'active';
  return {
    activeTimeMinutes: recipe.active_time,
    costPerServingCad: recipe.cost_per_serving_cad,
    instructionsJson: JSON.stringify(recipe.instructions),
    kidFriendly: recipe.kid_friendly ? 1 : 0,
    macrosJson: JSON.stringify(recipe.macros),
    mealType: recipe.meal_type,
    miseEnPlaceJson: Array.isArray(recipe.mise_en_place) ? JSON.stringify(recipe.mise_en_place) : null,
    name: recipe.name,
    prepNotes: typeof recipe.prep_notes === 'string' ? recipe.prep_notes : null,
    rawJson: JSON.stringify(recipe),
    reheatGuidance: typeof recipe.reheat_guidance === 'string' ? recipe.reheat_guidance : null,
    servings: recipe.servings,
    servingNotes: typeof recipe.serving_notes === 'string' ? recipe.serving_notes : null,
    status,
    slug: slugify(recipe.id),
    totalTimeMinutes: recipe.total_time,
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
