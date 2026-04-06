export interface CanonicalMeasure {
  canonicalItemKey: string | null;
  canonicalQuantity: number | null;
  canonicalUnit: string | null;
  canonicalConfidence: number | null;
}

interface CuratedAliasRule {
  aliases: string[];
  matchIncludes?: string[];
  matchNames?: string[];
}

interface CuratedIngredientFormRule {
  canonicalItemKey: string;
  canonicalUnit?: string | null;
  aliases?: string[];
  matchIncludes?: string[];
  unitConversions?: Record<string, number>;
}

const UNIT_ALIASES: Record<string, string> = {
  g: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  ml: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  l: 'l',
  litre: 'l',
  litres: 'l',
  liter: 'l',
  liters: 'l',
  count: 'count',
  each: 'count',
  piece: 'count',
  pieces: 'count',
  unit: 'count',
  units: 'count',
  item: 'count',
  items: 'count',
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
};

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeComparableText(value: string): string {
  return normalizeText(value)
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function singularizeComparableToken(token: string): string {
  if (token.endsWith('ies') && token.length > 3) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.endsWith('oes') && token.length > 3) {
    return token.slice(0, -2);
  }
  if (token.endsWith('s') && !token.endsWith('ss') && token.length > 3) {
    return token.slice(0, -1);
  }
  return token;
}

function buildComparableNameVariants(value: string): string[] {
  const comparable = normalizeComparableText(value);
  if (!comparable) {
    return [];
  }

  const singularized = comparable
    .split(' ')
    .map(singularizeComparableToken)
    .filter(Boolean)
    .join(' ');

  return Array.from(new Set([comparable, singularized].filter((entry) => entry.length > 0)));
}

function matchesCuratedIngredientFormRule(name: string, rule: CuratedIngredientFormRule): boolean {
  const comparableNames = buildComparableNameVariants(name);
  if (comparableNames.length === 0) {
    return false;
  }

  const aliasMatch = (rule.aliases ?? []).some((entry) =>
    buildComparableNameVariants(entry).some((variant) => comparableNames.includes(variant)),
  );
  if (aliasMatch) {
    return true;
  }

  return (rule.matchIncludes ?? []).some((entry) => {
    const comparable = normalizeComparableText(entry);
    return comparable.length > 0 && comparableNames.some((candidate) => candidate.includes(comparable));
  });
}

function getCuratedIngredientFormRule(name: string): CuratedIngredientFormRule | null {
  for (const rule of CURATED_INGREDIENT_FORM_RULES) {
    if (matchesCuratedIngredientFormRule(name, rule)) {
      return rule;
    }
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

const MASS_CONVERSIONS: Record<string, number> = {
  g: 1,
  kg: 1000,
  lb: 453.59237,
  oz: 28.349523125,
};

const VOLUME_CONVERSIONS: Record<string, number> = {
  ml: 1,
  l: 1000,
};

const CURATED_ALIAS_RULES: CuratedAliasRule[] = [
  {
    aliases: ['ground beef'],
    matchIncludes: ['ground turkey'],
  },
  {
    aliases: ['orange'],
    matchNames: ['clementine', 'clementines'],
  },
  {
    aliases: ['carrot sticks', 'celery sticks'],
    matchNames: ['carrot celery sticks', 'carrot and celery sticks'],
  },
];

const CURATED_INGREDIENT_FORM_RULES: CuratedIngredientFormRule[] = [
  {
    canonicalItemKey: 'garlic',
    canonicalUnit: 'garlic_eq',
    aliases: ['jarred minced garlic', 'minced garlic', 'garlic paste', 'jarred garlic'],
    unitConversions: { tsp: 2, tbsp: 6 },
  },
  {
    canonicalItemKey: 'garlic',
    canonicalUnit: 'garlic_eq',
    aliases: ['garlic powder'],
    unitConversions: { tsp: 8 },
  },
  {
    canonicalItemKey: 'garlic',
    canonicalUnit: 'garlic_eq',
    aliases: ['garlic clove', 'garlic cloves', 'garlic bulb', 'garlic'],
    unitConversions: { count: 1 },
  },
  {
    canonicalItemKey: 'ginger',
    canonicalUnit: 'ginger_eq',
    aliases: ['ginger paste', 'minced ginger', 'grated ginger', 'fresh ginger', 'ginger root', 'ginger'],
    unitConversions: { tsp: 1, tbsp: 3 },
  },
  {
    canonicalItemKey: 'ginger',
    canonicalUnit: 'ginger_eq',
    aliases: ['ground ginger'],
    unitConversions: { tsp: 4 },
  },
  {
    canonicalItemKey: 'lemon',
    canonicalUnit: 'lemon_eq',
    aliases: ['lemon juice'],
    unitConversions: { ml: 1 / 45, l: 1000 / 45, tsp: 5 / 45, tbsp: 15 / 45 },
  },
  {
    canonicalItemKey: 'lemon',
    canonicalUnit: 'lemon_eq',
    aliases: ['lemon', 'lemons'],
    unitConversions: { count: 1 },
  },
  {
    canonicalItemKey: 'parsley',
    canonicalUnit: 'parsley_eq',
    aliases: ['fresh parsley', 'parsley leaves', 'flat leaf parsley', 'parsley'],
    unitConversions: { tsp: 1 / 3, tbsp: 1 },
  },
  {
    canonicalItemKey: 'parsley',
    canonicalUnit: 'parsley_eq',
    aliases: ['dried parsley'],
    unitConversions: { tsp: 1, tbsp: 3 },
  },
  {
    canonicalItemKey: 'basil',
    canonicalUnit: 'basil_eq',
    aliases: ['fresh basil', 'basil leaves', 'basil'],
    unitConversions: { tsp: 1 / 3, tbsp: 1 },
  },
  {
    canonicalItemKey: 'basil',
    canonicalUnit: 'basil_eq',
    aliases: ['dried basil'],
    unitConversions: { tsp: 1, tbsp: 3 },
  },
];

const CURATED_MASS_PER_COUNT_GRAMS: Record<string, number> = {
  avocado: 136,
};

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function normalizeUnit(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeText(value);
  return UNIT_ALIASES[normalized] ?? normalized;
}

export function canonicalizeQuantity(
  quantity: number | null | undefined,
  unit: string | null | undefined,
): Pick<CanonicalMeasure, 'canonicalQuantity' | 'canonicalUnit' | 'canonicalConfidence'> {
  if (quantity == null || !Number.isFinite(quantity) || quantity <= 0) {
    return {
      canonicalConfidence: null,
      canonicalQuantity: null,
      canonicalUnit: null,
    };
  }

  const normalizedUnit = normalizeUnit(unit);
  if (!normalizedUnit) {
    return {
      canonicalConfidence: null,
      canonicalQuantity: null,
      canonicalUnit: null,
    };
  }

  if (normalizedUnit in MASS_CONVERSIONS) {
    return {
      canonicalConfidence: 1,
      canonicalQuantity: roundQuantity(quantity * MASS_CONVERSIONS[normalizedUnit]!),
      canonicalUnit: 'g',
    };
  }

  if (normalizedUnit in VOLUME_CONVERSIONS) {
    return {
      canonicalConfidence: 1,
      canonicalQuantity: roundQuantity(quantity * VOLUME_CONVERSIONS[normalizedUnit]!),
      canonicalUnit: 'ml',
    };
  }

  if (normalizedUnit === 'count') {
    return {
      canonicalConfidence: 1,
      canonicalQuantity: roundQuantity(quantity),
      canonicalUnit: 'count',
    };
  }

  return {
    canonicalConfidence: null,
    canonicalQuantity: null,
    canonicalUnit: null,
  };
}

export function getCuratedMatchAliases(input: {
  canonicalItemKey?: string | null;
  explicitCanonicalItem?: string | null;
  metadata?: unknown;
  name: string;
}): string[] {
  const record = asRecord(input.metadata);
  const candidates = [
    input.name,
    input.canonicalItemKey ?? null,
    input.explicitCanonicalItem ?? null,
    typeof record?.canonical_item === 'string' ? record.canonical_item : null,
    typeof record?.canonicalItem === 'string' ? record.canonicalItem : null,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const comparableNames = new Set(candidates.flatMap((value) => buildComparableNameVariants(value)));
  const aliases = new Set<string>();

  for (const rule of CURATED_ALIAS_RULES) {
    const exactMatch = rule.matchNames?.some((entry) =>
      buildComparableNameVariants(entry).some((variant) => comparableNames.has(variant)),
    );
    const includeMatch = rule.matchIncludes?.some((entry) =>
      Array.from(comparableNames).some((candidate) => candidate.includes(normalizeComparableText(entry))),
    );

    if (!exactMatch && !includeMatch) {
      continue;
    }

    for (const alias of rule.aliases) {
      aliases.add(alias);
    }
  }

  return Array.from(aliases);
}

function canonicalizeCuratedItemQuantity(
  canonicalItemKey: string | null,
  quantity: number | null | undefined,
  unit: string | null | undefined,
): Pick<CanonicalMeasure, 'canonicalQuantity' | 'canonicalUnit' | 'canonicalConfidence'> | null {
  if (!canonicalItemKey) {
    return null;
  }

  const massPerCount = CURATED_MASS_PER_COUNT_GRAMS[canonicalItemKey];
  if (!massPerCount) {
    return null;
  }

  const normalizedUnit = normalizeUnit(unit);
  if (quantity == null || !Number.isFinite(quantity) || quantity <= 0 || normalizedUnit !== 'count') {
    return null;
  }

  return {
    canonicalConfidence: 0.8,
    canonicalQuantity: roundQuantity(quantity * massPerCount),
    canonicalUnit: 'g',
  };
}

export function deriveCanonicalItemKey(name: string, metadata?: unknown, explicitCanonicalItem?: string | null): string | null {
  const record = asRecord(metadata);
  const candidates = [
    explicitCanonicalItem,
    typeof record?.canonical_item === 'string' ? record.canonical_item : null,
    typeof record?.canonicalItem === 'string' ? record.canonicalItem : null,
    ...asStringArray(record?.canonical_items).slice(0, 1),
    ...asStringArray(record?.canonicalItems).slice(0, 1),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  const selected = candidates[0];
  if (selected) {
    return normalizeText(selected);
  }

  const curatedRule = getCuratedIngredientFormRule(name);
  return curatedRule?.canonicalItemKey ?? normalizeText(name);
}

function canonicalizeCuratedIngredientFormQuantity(input: {
  canonicalItemKey: string | null;
  name: string;
  quantity: number | null | undefined;
  unit: string | null | undefined;
}): Pick<CanonicalMeasure, 'canonicalQuantity' | 'canonicalUnit' | 'canonicalConfidence'> | null {
  if (input.quantity == null || !Number.isFinite(input.quantity) || input.quantity <= 0) {
    return null;
  }

  const rule = getCuratedIngredientFormRule(input.name);
  if (!rule || (input.canonicalItemKey && rule.canonicalItemKey !== input.canonicalItemKey)) {
    return null;
  }

  const normalizedUnit = normalizeUnit(input.unit);
  if (!normalizedUnit || !rule.canonicalUnit || !rule.unitConversions?.[normalizedUnit]) {
    return null;
  }

  return {
    canonicalConfidence: 0.8,
    canonicalQuantity: roundQuantity(input.quantity * rule.unitConversions[normalizedUnit]!),
    canonicalUnit: rule.canonicalUnit,
  };
}

export function canonicalizeInventoryItem(input: {
  metadata?: unknown;
  name: string;
  quantity?: number | null;
  unit?: string | null;
}): CanonicalMeasure {
  const canonicalItemKey = deriveCanonicalItemKey(input.name, input.metadata);
  const canonicalQuantity =
    canonicalizeCuratedIngredientFormQuantity({
      canonicalItemKey,
      name: input.name,
      quantity: input.quantity ?? null,
      unit: input.unit ?? null,
    }) ??
    canonicalizeCuratedItemQuantity(canonicalItemKey, input.quantity ?? null, input.unit ?? null) ??
    canonicalizeQuantity(input.quantity ?? null, input.unit ?? null);

  return {
    canonicalConfidence: canonicalItemKey && canonicalQuantity.canonicalUnit ? canonicalQuantity.canonicalConfidence : null,
    canonicalItemKey,
    canonicalQuantity: canonicalQuantity.canonicalQuantity,
    canonicalUnit: canonicalQuantity.canonicalUnit,
  };
}

export function canonicalizeIngredient(input: {
  canonicalItem?: string | null;
  canonicalQuantity?: number | null;
  canonicalUnit?: string | null;
  metadata?: unknown;
  name: string;
  quantity?: number | null;
  unit?: string | null;
}): CanonicalMeasure {
  const canonicalItemKey = deriveCanonicalItemKey(input.name, input.metadata, input.canonicalItem ?? null);
  const quantitySource =
    input.canonicalQuantity != null || input.canonicalUnit != null
      ? canonicalizeQuantity(input.canonicalQuantity ?? null, input.canonicalUnit ?? null)
      : canonicalizeCuratedIngredientFormQuantity({
            canonicalItemKey,
            name: input.name,
            quantity: input.quantity ?? null,
            unit: input.unit ?? null,
          }) ??
        canonicalizeCuratedItemQuantity(canonicalItemKey, input.quantity ?? null, input.unit ?? null) ??
        canonicalizeQuantity(input.quantity ?? null, input.unit ?? null);

  return {
    canonicalConfidence: canonicalItemKey && quantitySource.canonicalUnit ? quantitySource.canonicalConfidence : null,
    canonicalItemKey,
    canonicalQuantity: quantitySource.canonicalQuantity,
    canonicalUnit: quantitySource.canonicalUnit,
  };
}
