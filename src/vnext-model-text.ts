const REDACTED_KEY_PATTERNS = [
  /tenant[_-]?id/i,
  /profile[_-]?id/i,
  /stripe.*id/i,
  /trace[_-]?id/i,
  /span[_-]?id/i,
  /log[_-]?id/i,
  /event[_-]?id/i,
] as const;

const MEDIA_REFERENCE_KEY_PATTERNS = [
  /^photos?$/i,
  /^url$/i,
  /^source[_-]?url$/i,
  /^image[_-]?url$/i,
  /^image[_-]?urls$/i,
  /^delivery$/i,
  /^artifact[_-]?id$/i,
] as const;

const MAX_ARRAY_ITEMS = 8;
const MAX_RECIPE_INGREDIENT_ITEMS = 40;
// A list/enumeration response (fluent_list_items) must let the host SEE every item on the page. The
// 8-item array cap silently hid the rest — a host auditing a 99-item closet saw only 8 and gave up.
// Style list payloads are compacted per item (see vnext-read-layer compactStyleListItem) so a full page
// fits under MAX_TEXT_LENGTH; this cap applies only to the top-level `items` array of a list page.
const MAX_LIST_ITEMS = 50;
const MAX_DEPTH = 7;
const MAX_TEXT_LENGTH = 18_000;
const MAX_STRING_LENGTH = 900;

export interface VNextModelTextOptions {
  includeMediaReferences?: boolean;
  preserveRecipeIngredients?: boolean;
  preserveListItems?: boolean;
  preserveStylePurchaseOwnedSlice?: boolean;
}

export function buildVNextModelText(value: unknown, options: VNextModelTextOptions = {}): string {
  const safeValue = toVNextModelVisibleValue(value, options);
  const json = JSON.stringify(safeValue, null, 2);
  const body = json.length > MAX_TEXT_LENGTH
    ? `${json.slice(0, MAX_TEXT_LENGTH)}\n... truncated for model-visible tool text`
    : json;
  const guidance = isWriteReceipt(safeValue)
    ? [
        'Fluent returned an internal write receipt.',
        'Confirm the saved change in ordinary user language.',
        'Identifiers in this receipt are for internal tool chaining only. Never include them in the user-facing answer.',
      ]
    : ['Fluent returned this model-visible context. Use it as evidence, not as final judgment.'];
  return [
    ...guidance,
    body,
  ].join('\n');
}

function isWriteReceipt(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.kind === 'string' && 'readAfterWrite' in record && 'target' in record;
}

export function toVNextModelVisibleValue(
  value: unknown,
  options: VNextModelTextOptions = {},
  depth = 0,
  seen = new WeakSet<object>(),
  path: string[] = [],
): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...` : value;
  }

  if (typeof value !== 'object') {
    return String(value);
  }

  if (seen.has(value as object)) {
    return '[circular]';
  }

  if (depth >= MAX_DEPTH) {
    return Array.isArray(value) ? `[array depth limit: ${value.length}]` : '[object depth limit]';
  }

  seen.add(value as object);
  try {
    if (Array.isArray(value)) {
      const maxItems = maxArrayItemsForPath(path, value, options);
      const entries = value.slice(0, maxItems).map((entry) => toVNextModelVisibleValue(entry, options, depth + 1, seen, path));
      if (value.length > maxItems) {
        entries.push(`... ${value.length - maxItems} more item(s)`);
      }
      return entries;
    }

    const output: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
      if (shouldRedactKey(key)) {
        continue;
      }
      if (!options.includeMediaReferences && isMediaReferenceKey(key)) {
        if (Array.isArray(entryValue)) {
          output[`${key}Count`] = entryValue.length;
        } else if (entryValue) {
          output[`${key}Present`] = true;
        }
        continue;
      }
      if (entryValue === undefined || typeof entryValue === 'function') {
        continue;
      }
      output[key] = toVNextModelVisibleValue(entryValue, options, depth + 1, seen, [...path, key]);
    }
    return output;
  } finally {
    seen.delete(value as object);
  }
}

function shouldRedactKey(key: string): boolean {
  return REDACTED_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function isMediaReferenceKey(key: string): boolean {
  return MEDIA_REFERENCE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function maxArrayItemsForPath(path: string[], value: unknown[], options: VNextModelTextOptions): number {
  const lastKey = path.at(-1);
  // Safety-critical: the confirmed dietary exclusion list (MealsHardConstraints.confirmedExclusions)
  // is the complete set of allergies + hard avoids the host must honor.
  if (lastKey === 'confirmedExclusions') {
    return Number.POSITIVE_INFINITY;
  }
  // Ranking-critical: MealsSoftPreferences.likes/dislikes are purpose-built compact-fact arrays.
  // Scope this lift to compactFacts so unrelated payload arrays named `likes`/`dislikes` still cap.
  if (path.length === 2 && path[0] === 'compactFacts' && (lastKey === 'dislikes' || lastKey === 'likes')) {
    return Number.POSITIVE_INFINITY;
  }
  // The top-level `items` array of a list page IS the enumeration; show the whole (already page-bounded,
  // per-item-compacted) page rather than capping to 8. Scoped STRICTLY to the page-level array
  // (path === ['items']) so a nested array deeper in an item payload keyed `items` is NOT also uncapped.
  if (options.preserveListItems && path.length === 1 && path[0] === 'items') {
    return MAX_LIST_ITEMS;
  }
  // Purchase-verdict Phase 1: this owned slice is the complete category evidence the model judges from.
  // Keep the array whole while per-item compaction keeps it inside MAX_TEXT_LENGTH.
  if (
    options.preserveStylePurchaseOwnedSlice &&
    path[0] === 'compactFacts' &&
    (lastKey === 'items' || lastKey === 'itemIds')
  ) {
    return Number.POSITIVE_INFINITY;
  }
  if (options.preserveRecipeIngredients && lastKey === 'ingredients' && looksLikeRecipeIngredients(value)) {
    return MAX_RECIPE_INGREDIENT_ITEMS;
  }
  return MAX_ARRAY_ITEMS;
}

function looksLikeRecipeIngredients(value: unknown[]): boolean {
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return false;
    }
    const record = entry as Record<string, unknown>;
    return typeof record.item === 'string' && record.item.trim().length > 0;
  });
}
