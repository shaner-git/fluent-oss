import { normalizeText } from './helpers';

export type DietaryPattern = 'vegetarian' | 'vegan' | 'pescatarian';
export type DietaryPatternExcludedClass = 'dairy' | 'eggs' | 'fish_seafood' | 'honey' | 'meat' | 'poultry';

export const DIETARY_PATTERN_LABELS: Record<string, DietaryPattern> = {
  vegetarian: 'vegetarian',
  veggie: 'vegetarian',
  vegan: 'vegan',
  'plant based': 'vegan',
  'plant-based': 'vegan',
  pescatarian: 'pescatarian',
  pescetarian: 'pescatarian',
};

const DIETARY_PATTERN_NEGATION_CUES = ['not', 'no longer', 'used to', 'former', 'ex-', 'anti-', "isn't", 'stopped'];
const DIETARY_PATTERN_HEDGE_CUES = [
  'mostly',
  'mainly',
  'kinda',
  'kind of',
  'sort of',
  '-ish',
  'ish',
  'flexi',
  'flexitarian',
  'leaning',
  'forward',
  'trying',
  'cutting',
  'reducing',
  'less',
  'when i can',
  'aiming',
  '%',
  'weekday',
  'weeknight',
  'during the week',
];

export const MEAT_BLOCKERS = [
  'bacon',
  'beef',
  'chicken',
  'duck',
  'ham',
  'lamb',
  'pancetta',
  'pork',
  'prosciutto',
  'sausage',
  'steak',
  'turkey',
];
export const POULTRY_BLOCKERS = ['chicken', 'turkey'];
export const SEAFOOD_BLOCKERS = ['anchovy', 'cod', 'crab', 'fish', 'mussels', 'oyster', 'salmon', 'sardine', 'shellfish', 'shrimp', 'tuna'];
export const DAIRY_BLOCKERS = ['butter', 'cheese', 'cream', 'ghee', 'milk', 'whey', 'yogurt'];
export const EGG_BLOCKERS = ['egg', 'eggs'];
export const HONEY_BLOCKERS = ['honey'];
export const VEGETARIAN_BLOCKERS = [...MEAT_BLOCKERS, ...SEAFOOD_BLOCKERS];
export const VEGAN_BLOCKERS = [
  ...VEGETARIAN_BLOCKERS,
  ...DAIRY_BLOCKERS,
  ...EGG_BLOCKERS,
  ...HONEY_BLOCKERS,
];
export const PESCATARIAN_BLOCKERS = MEAT_BLOCKERS;
export const PLANT_BASED_QUALIFIERS = ['meatless', 'plant based', 'plant-based', 'vegan', 'vegetarian'];
export const DAIRY_FREE_QUALIFIERS = ['dairy free', 'dairy-free', 'vegan'];

export const PATTERN_EXCLUDED_CLASSES: Record<DietaryPattern, DietaryPatternExcludedClass[]> = {
  pescatarian: ['meat', 'poultry'],
  vegan: ['dairy', 'eggs', 'fish_seafood', 'honey', 'meat', 'poultry'],
  vegetarian: ['fish_seafood', 'meat', 'poultry'],
};

export const DIETARY_PATTERN_CLASS_BLOCKERS: Record<DietaryPatternExcludedClass, string[]> = {
  dairy: DAIRY_BLOCKERS,
  eggs: EGG_BLOCKERS,
  fish_seafood: SEAFOOD_BLOCKERS,
  honey: HONEY_BLOCKERS,
  meat: MEAT_BLOCKERS,
  poultry: POULTRY_BLOCKERS,
};

export function recognizeDietaryPattern(rawLabel: string | null | undefined): DietaryPattern | null {
  const normalized = normalizeDietaryPatternLabel(rawLabel);
  if (!normalized) {
    return null;
  }
  if (hasDietaryNegationOrHedgeCue(rawLabel)) {
    return null;
  }
  return DIETARY_PATTERN_LABELS[normalized] ?? null;
}

export function hasDietaryNegationOrHedgeCue(rawLabel: string | null | undefined): boolean {
  const normalized = normalizeDietaryPatternLabel(rawLabel);
  if (!normalized) {
    return false;
  }
  return (
    DIETARY_PATTERN_NEGATION_CUES.some((cue) => normalizedDietaryPatternLabelHasCue(normalized, cue)) ||
    DIETARY_PATTERN_HEDGE_CUES.some((cue) => normalizedDietaryPatternLabelHasCue(normalized, cue))
  );
}

export function blockersForDietaryPattern(pattern: DietaryPattern): string[] {
  return uniqueSorted(PATTERN_EXCLUDED_CLASSES[pattern].flatMap((excludedClass) => DIETARY_PATTERN_CLASS_BLOCKERS[excludedClass]));
}

export function ingredientMatchesAnyBlocker(
  ingredientNames: string[],
  blockers: string[],
  allowedQualifiers: string[] = [],
): boolean {
  return ingredientNames.some((ingredient) => {
    const normalizedIngredient = normalizeText(ingredient);
    if (!normalizedIngredient) {
      return false;
    }
    return blockers.some((blocker) =>
      new RegExp(`\\b${escapeRegExp(normalizeText(blocker))}\\b`, 'i').test(normalizedIngredient) &&
      !allowedQualifiers.some((qualifier) => normalizedIngredient.includes(normalizeText(qualifier))),
    );
  });
}

function normalizeDietaryPatternLabel(rawLabel: string | null | undefined): string {
  if (typeof rawLabel !== 'string') {
    return '';
  }
  return rawLabel.toLowerCase().trim().replace(/\s+/g, ' ');
}

function normalizedDietaryPatternLabelHasCue(normalizedLabel: string, cue: string): boolean {
  const normalizedCue = normalizeDietaryPatternLabel(cue);
  if (!normalizedCue) {
    return false;
  }
  if (normalizedCue === '%' || normalizedCue.startsWith('-')) {
    return normalizedLabel.includes(normalizedCue);
  }
  if (normalizedCue.endsWith('-')) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedCue)}`, 'i').test(normalizedLabel);
  }
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedCue)}([^a-z0-9]|$)`, 'i').test(normalizedLabel);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
