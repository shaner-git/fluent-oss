// Meals retirement (D30, Shane 2026-10-06). Meals is unplugged from every public surface, not deleted:
// the domain code, tables, account export and purge stay as they are. The shared tools keep accepting
// domain="meals", the meals item types and the food fact kinds so cached 1.0.x clients still validate,
// but such calls get this plain retirement result and never read or write Meals data.

export const MEALS_RETIRED_ON = '2026-10-06';
export const MEALS_RETIREMENT_URL = 'https://meetfluent.app/meals';
export const MEALS_RETIREMENT_MESSAGE =
  `Fluent no longer does meals. Meals was retired on ${MEALS_RETIRED_ON}; Fluent now focuses on your closet. Your saved meal data is kept and included in your account export: ${MEALS_RETIREMENT_URL}`;

// Item types that only ever addressed Meals data.
export const MEALS_RETIRED_ITEM_TYPES = ['meal_plan', 'recipe', 'grocery_list', 'inventory_item'] as const;

// Public profile-patch kinds that only ever wrote food or meal-planning memory.
export const MEALS_RETIRED_PROFILE_FACT_KINDS = [
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
] as const;

// Person-fact sections that hold food facts (allergies, dietary pattern, meal taste, household).
// Identity and Style sections stay visible.
export const MEALS_RETIRED_PERSON_FACT_SECTIONS = ['dietary', 'taste', 'household'] as const;

export function isMealsRetiredItemType(itemType: string | null | undefined): boolean {
  return (MEALS_RETIRED_ITEM_TYPES as readonly string[]).includes(itemType ?? '');
}

export function isMealsRetiredReadRequest(input: { domain?: string | null; itemType?: string | null }): boolean {
  return input.domain === 'meals' || isMealsRetiredItemType(input.itemType);
}

export function isMealsRetiredProfilePatch(input: { domain?: string | null; kind?: unknown }): boolean {
  return input.domain === 'meals'
    || (typeof input.kind === 'string' && (MEALS_RETIRED_PROFILE_FACT_KINDS as readonly string[]).includes(input.kind));
}

export function isMealsRetiredPersonFactSection(section: string): boolean {
  return (MEALS_RETIRED_PERSON_FACT_SECTIONS as readonly string[]).includes(section);
}

export type MealsRetiredResult = {
  object: 'MealsRetired';
  domain: 'meals';
  status: 'retired';
  retiredOn: typeof MEALS_RETIRED_ON;
  durable: false;
  message: string;
  learnMore: typeof MEALS_RETIREMENT_URL;
};

export function mealsRetiredResult(): MealsRetiredResult {
  return {
    object: 'MealsRetired',
    domain: 'meals',
    status: 'retired',
    retiredOn: MEALS_RETIRED_ON,
    // Nothing was read or written; this keeps onboarding milestones from counting the call as a save.
    durable: false,
    message: MEALS_RETIREMENT_MESSAGE,
    learnMore: MEALS_RETIREMENT_URL,
  };
}

// A plain, successful tool result: cached clients should relay the message, not treat it as an error.
export function mealsRetiredToolResult() {
  return {
    content: [{ type: 'text' as const, text: MEALS_RETIREMENT_MESSAGE }],
    structuredContent: mealsRetiredResult(),
  };
}

// The single choke point for public person-fact reads (wired into the public read and write services in
// mcp-core.ts): food facts never reach a public tool result, whichever domain or intent asks.
export function withoutMealsRetiredPersonFacts<T extends { section: string }>(facts: readonly T[]): T[] {
  return facts.filter((fact) => !isMealsRetiredPersonFactSection(fact.section));
}
