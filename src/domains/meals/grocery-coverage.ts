// Grocery coverage for meal plans saved without host-derived grocery_items.
//
// Fluent derives groceries only from saved recipes. When fluent_save_meal_plan saves an entry that
// is not linked to a saved recipe and the host sent no grocery_items (for example the cached ChatGPT
// app 1.0.0 schema, which has no grocery_items), Fluent cannot know that meal's groceries. The save
// records those entries on the plan's source snapshot (`grocery_coverage`, the save-time history)
// and every grocery read derives the current coverage from it: a meal stays unverified until the
// user explicitly confirms its groceries are handled (fluent_apply_grocery_list_change
// mark_plan_item on the meal's readback key with status "confirmed"). Adding an item never resolves
// coverage by itself. Plans without a `grocery_coverage` record have no coverage state at all.
//
// Each save gets a fresh coverage revision, and every readback key embeds that revision plus the
// meal's identity (date, meal type, name). A confirmation therefore applies only to the exact saved
// plan revision and meal it was made for: re-saving a plan (even with the same plan id) or replacing
// it starts unverified again, and a replayed old key no longer matches anything current.
//
// A `grocery_coverage` record without a revision (the unkeyed shape written before revisions
// existed) or one that cannot be read is never treated as "no coverage": its meals stay unverified
// and are NOT confirmable, because such a key could not be bound to one plan revision (it would
// collide across meals and tenants). The plan must be saved again to refresh grocery coverage.
import type { GroceryPlanActionRecord, MealPlanRecord } from './types';

export const MEAL_COVERAGE_ITEM_KEY_PREFIX = 'meal-coverage:';
const UNREVISIONED = 'legacy';

export interface MealGroceryCoverageMeal {
  /** False when the saved record could not be read; the plan must be saved again. */
  confirmable: boolean;
  confirmedAt: string | null;
  date: string | null;
  itemKey: string;
  mealType: string | null;
  recipeName: string;
}

export interface MealGroceryCoverageRecord {
  confirmedMeals: MealGroceryCoverageMeal[];
  mealPlanId: string;
  revision: string;
  status: 'complete' | 'incomplete';
  summary: string;
  uncoveredMeals: MealGroceryCoverageMeal[];
}

type SavedCoverageEntry = Omit<MealGroceryCoverageMeal, 'confirmedAt'>;

/** A fresh, per-save coverage revision. */
export function newMealCoverageRevision(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

export function mealCoverageItemKey(
  revision: string,
  entryIndex: number,
  meal: { date: string | null; mealType: string | null; recipeName: string | null },
): string {
  return `${MEAL_COVERAGE_ITEM_KEY_PREFIX}${revision}:${entryIndex}:${mealIdentityHash(meal)}`;
}

export function isMealCoverageItemKey(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(MEAL_COVERAGE_ITEM_KEY_PREFIX);
}

/**
 * Save-time coverage entries recorded on the plan, or null when the plan has no coverage record.
 * Entries are always keyed to the record's revision and meal identity; keys stored on the record
 * are not trusted and are re-derived.
 */
export function savedMealCoverageEntries(
  plan: Pick<MealPlanRecord, 'sourceSnapshot'> | null | undefined,
): { entries: SavedCoverageEntry[]; revision: string } | null {
  const snapshot = asRecord(plan?.sourceSnapshot);
  if (!snapshot || !('grocery_coverage' in snapshot) || snapshot.grocery_coverage == null) {
    return null;
  }
  const coverage = asRecord(snapshot.grocery_coverage);
  const revision = typeof coverage?.revision === 'string' && /^[A-Za-z0-9]{1,64}$/.test(coverage.revision)
    ? coverage.revision
    : UNREVISIONED;
  if (!coverage || !Array.isArray(coverage.uncovered_entries) || coverage.uncovered_entries.length === 0) {
    return { entries: [unreadableEntry(revision, 0)], revision };
  }
  const entries = coverage.uncovered_entries.map((entry, index): SavedCoverageEntry => {
    const record = asRecord(entry);
    const recipeName = stringOrNull(record?.recipe_name);
    if (!record || !recipeName) {
      return unreadableEntry(revision, index);
    }
    const entryIndex = typeof record.entry_index === 'number' && Number.isInteger(record.entry_index) && record.entry_index >= 0
      ? record.entry_index
      : index;
    const meal = { date: stringOrNull(record.date), mealType: stringOrNull(record.meal_type), recipeName };
    if (revision === UNREVISIONED) {
      // Shown as unverified, never confirmable: no key without a revision is safe to accept.
      return { ...meal, confirmable: false, itemKey: `${MEAL_COVERAGE_ITEM_KEY_PREFIX}${UNREVISIONED}:${index}:needs-resave` };
    }
    return { ...meal, confirmable: true, itemKey: mealCoverageItemKey(revision, entryIndex, meal) };
  });
  return { entries, revision };
}

export function buildMealGroceryCoverage(
  plan: Pick<MealPlanRecord, 'id' | 'sourceSnapshot'> | null | undefined,
  actions: GroceryPlanActionRecord[],
): MealGroceryCoverageRecord | null {
  const saved = plan ? savedMealCoverageEntries(plan) : null;
  if (!plan || !saved) {
    return null;
  }
  const confirmations = new Map(
    actions
      .filter((action) => isMealCoverageItemKey(action.itemKey) && action.mealPlanId === plan.id && action.actionStatus === 'confirmed')
      .map((action) => [action.itemKey, action.updatedAt ?? action.createdAt ?? null]),
  );
  const confirmedMeals: MealGroceryCoverageMeal[] = [];
  const uncoveredMeals: MealGroceryCoverageMeal[] = [];
  for (const entry of saved.entries) {
    if (entry.confirmable && confirmations.has(entry.itemKey)) {
      confirmedMeals.push({ ...entry, confirmedAt: confirmations.get(entry.itemKey) ?? null });
    } else {
      uncoveredMeals.push({ ...entry, confirmedAt: null });
    }
  }
  const needsResave = uncoveredMeals.some((meal) => !meal.confirmable);
  return {
    confirmedMeals,
    mealPlanId: plan.id,
    revision: saved.revision,
    status: uncoveredMeals.length > 0 ? 'incomplete' : 'complete',
    summary: uncoveredMeals.length > 0
      ? `Groceries not verified for ${mealCountLabel(uncoveredMeals.length)}: ${uncoveredMeals.map((meal) => meal.recipeName).join(', ')}. ` +
        (needsResave
          ? 'This plan’s grocery-coverage record is from an older format or could not be read; save the meal plan again to refresh grocery coverage.'
          : 'These meals have no saved ingredients in Fluent, so Fluent could not derive their groceries; compare them with this list and confirm each one.')
      : 'Groceries were confirmed for every meal without saved ingredients.',
    uncoveredMeals,
  };
}

export function mealCountLabel(count: number): string {
  return `${count} meal${count === 1 ? '' : 's'}`;
}

function unreadableEntry(revision: string, index: number): SavedCoverageEntry {
  return {
    confirmable: false,
    date: null,
    itemKey: `${MEAL_COVERAGE_ITEM_KEY_PREFIX}${revision}:${index}:unreadable`,
    mealType: null,
    recipeName: 'a meal Fluent could not read',
  };
}

// Short FNV-1a hash of the meal identity; binds a key to the exact meal it was issued for.
function mealIdentityHash(meal: { date: string | null; mealType: string | null; recipeName: string | null }): string {
  const input = [meal.date ?? '', meal.mealType ?? '', (meal.recipeName ?? '').trim().toLowerCase()].join('|');
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}
