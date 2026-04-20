import type {
  StyleBrandAffinityRecord,
  StyleBudgetProfileRecord,
  StyleComparatorKey,
  StyleClosetCoverage,
  StyleExceptionRuleRecord,
  StyleFitProfileRecord,
  StyleFormalityPreferenceRecord,
  StyleItemProfileDocument,
  StyleOccasionRuleRecord,
  StyleItemStatus,
  StyleOnboardingMode,
  StyleOnboardingPath,
  StylePreferenceWeight,
  StylePhotoKind,
  StylePhotoSource,
  StyleProfileDocument,
  StylePurchaseCandidate,
  StyleWeightedPreferenceRecord,
} from './types';

const STYLE_COMPARATOR_KEYS = [
  'unknown',
  'tee',
  'polo',
  'oxford_shirt',
  'dress_shirt',
  'camp_shirt',
  'overshirt',
  'sweater',
  'henley',
  'jersey',
  'hoodie',
  'cardigan',
  'jacket',
  'coat',
  'other_top',
  'jean',
  'chino',
  'trouser',
  'jogger',
  'short',
  'other_bottom',
  'sneaker',
  'loafer',
  'derby',
  'oxford',
  'boot',
  'sandal',
  'mule',
  'other_shoe',
] as const satisfies readonly StyleComparatorKey[];

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function asBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        .map((entry) => entry.trim())
    : [];
}

function normalizePreferenceWeight(value: unknown): StylePreferenceWeight {
  if (value === 'high' || value === 'strong') {
    return 'high';
  }
  if (value === 'low' || value === 'soft') {
    return 'low';
  }
  return 'medium';
}

export function parseJsonLike<T>(value: unknown): T | null {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return value == null ? null : (value as T);
}

export function safeParseJson(value: string | null): unknown {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function stringifyJson(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

export function defaultStyleProfile(): StyleProfileDocument {
  return {
    aestheticKeywords: [],
    brandAffinities: [],
    budgetProfile: null,
    closetCoverage: null,
    colorPreferences: [],
    colorDirections: [],
    contextRules: [],
    exceptionRules: [],
    fitProfile: null,
    fitNotes: [],
    formalityPreferences: [],
    formalityTendency: null,
    hardAvoids: [],
    importedClosetAt: null,
    importedClosetConfirmed: false,
    importSource: null,
    onboardingPath: null,
    occasionRules: [],
    silhouettePreferences: [],
    preferredSilhouettes: [],
    practicalCalibrationConfirmed: false,
    sizingPreferences: [],
    tasteCalibrationConfirmed: false,
  };
}

export function normalizeStyleProfile(value: unknown): StyleProfileDocument {
  const record = asRecord(parseJsonLike<Record<string, unknown>>(value)) ?? {};
  const defaults = defaultStyleProfile();
  const legacyColorDirections = asStringArray(record.colorDirections ?? defaults.colorDirections);
  const legacyPreferredSilhouettes = asStringArray(record.preferredSilhouettes ?? defaults.preferredSilhouettes);
  return {
    aestheticKeywords: asStringArray(record.aestheticKeywords ?? defaults.aestheticKeywords),
    brandAffinities: normalizeBrandAffinities(record.brandAffinities ?? defaults.brandAffinities),
    budgetProfile: normalizeBudgetProfile(record.budgetProfile ?? defaults.budgetProfile),
    closetCoverage: normalizeStyleClosetCoverage(record.closetCoverage ?? defaults.closetCoverage),
    colorPreferences: normalizeWeightedPreferences(record.colorPreferences, legacyColorDirections),
    colorDirections: legacyColorDirections,
    contextRules: asStringArray(record.contextRules ?? defaults.contextRules),
    exceptionRules: normalizeExceptionRules(record.exceptionRules ?? defaults.exceptionRules),
    fitProfile: normalizeFitProfile(record.fitProfile ?? defaults.fitProfile),
    fitNotes: asStringArray(record.fitNotes ?? defaults.fitNotes),
    formalityPreferences: normalizeFormalityPreferences(record.formalityPreferences ?? defaults.formalityPreferences),
    formalityTendency: asNullableString(record.formalityTendency ?? defaults.formalityTendency),
    hardAvoids: asStringArray(record.hardAvoids ?? defaults.hardAvoids),
    importedClosetAt: asNullableString(record.importedClosetAt ?? defaults.importedClosetAt),
    importedClosetConfirmed:
      typeof record.importedClosetConfirmed === 'boolean'
        ? record.importedClosetConfirmed
        : defaults.importedClosetConfirmed,
    importSource: asNullableString(record.importSource ?? defaults.importSource),
    onboardingPath: normalizeStyleOnboardingPath(record.onboardingPath ?? defaults.onboardingPath),
    occasionRules: normalizeOccasionRules(record.occasionRules ?? defaults.occasionRules),
    silhouettePreferences: normalizeWeightedPreferences(record.silhouettePreferences, legacyPreferredSilhouettes),
    preferredSilhouettes: legacyPreferredSilhouettes,
    practicalCalibrationConfirmed:
      typeof record.practicalCalibrationConfirmed === 'boolean'
        ? record.practicalCalibrationConfirmed
        : defaults.practicalCalibrationConfirmed,
    sizingPreferences: asStringArray(record.sizingPreferences ?? defaults.sizingPreferences),
    tasteCalibrationConfirmed:
      typeof record.tasteCalibrationConfirmed === 'boolean'
        ? record.tasteCalibrationConfirmed
        : defaults.tasteCalibrationConfirmed,
  };
}

export function normalizeStyleProfilePatch(value: unknown): Partial<StyleProfileDocument> {
  const record = asRecord(parseJsonLike<Record<string, unknown>>(value)) ?? {};
  const patch: Partial<StyleProfileDocument> = {};

  if ('aestheticKeywords' in record) patch.aestheticKeywords = asStringArray(record.aestheticKeywords);
  if ('brandAffinities' in record) patch.brandAffinities = normalizeBrandAffinities(record.brandAffinities);
  if ('budgetProfile' in record) patch.budgetProfile = normalizeBudgetProfile(record.budgetProfile);
  if ('closetCoverage' in record) patch.closetCoverage = normalizeStyleClosetCoverage(record.closetCoverage);
  if ('colorPreferences' in record) patch.colorPreferences = normalizeWeightedPreferences(record.colorPreferences);
  if ('colorDirections' in record) patch.colorDirections = asStringArray(record.colorDirections);
  if ('contextRules' in record) patch.contextRules = asStringArray(record.contextRules);
  if ('exceptionRules' in record) patch.exceptionRules = normalizeExceptionRules(record.exceptionRules);
  if ('fitProfile' in record) patch.fitProfile = normalizeFitProfile(record.fitProfile);
  if ('fitNotes' in record) patch.fitNotes = asStringArray(record.fitNotes);
  if ('formalityPreferences' in record) patch.formalityPreferences = normalizeFormalityPreferences(record.formalityPreferences);
  if ('formalityTendency' in record) patch.formalityTendency = asNullableString(record.formalityTendency);
  if ('hardAvoids' in record) patch.hardAvoids = asStringArray(record.hardAvoids);
  if ('importedClosetAt' in record) patch.importedClosetAt = asNullableString(record.importedClosetAt);
  if ('importedClosetConfirmed' in record) patch.importedClosetConfirmed = record.importedClosetConfirmed === true;
  if ('importSource' in record) patch.importSource = asNullableString(record.importSource);
  if ('onboardingPath' in record) patch.onboardingPath = normalizeStyleOnboardingPath(record.onboardingPath);
  if ('occasionRules' in record) patch.occasionRules = normalizeOccasionRules(record.occasionRules);
  if ('silhouettePreferences' in record) {
    patch.silhouettePreferences = normalizeWeightedPreferences(record.silhouettePreferences);
  }
  if ('preferredSilhouettes' in record) patch.preferredSilhouettes = asStringArray(record.preferredSilhouettes);
  if ('practicalCalibrationConfirmed' in record) {
    patch.practicalCalibrationConfirmed = record.practicalCalibrationConfirmed === true;
  }
  if ('sizingPreferences' in record) patch.sizingPreferences = asStringArray(record.sizingPreferences);
  if ('tasteCalibrationConfirmed' in record) patch.tasteCalibrationConfirmed = record.tasteCalibrationConfirmed === true;

  return patch;
}

export function mergeStyleProfile(previous: StyleProfileDocument, patch: Partial<StyleProfileDocument>): StyleProfileDocument {
  return normalizeStyleProfile({
    ...previous,
    ...patch,
  });
}

export function normalizeStyleItemProfile(value: unknown): StyleItemProfileDocument {
  const record = asRecord(parseJsonLike<Record<string, unknown>>(value)) ?? {};
  const dressCode = asRecord(record.dressCode);
  return {
    avoidOccasions: asStringArray(record.avoidOccasions),
    bestOccasions: asStringArray(record.bestOccasions),
    confidence: asNullableNumber(record.confidence),
    descriptorConfidence: asNullableNumber(record.descriptorConfidence),
    dressCode: dressCode
      ? {
          max: asNullableNumber(dressCode.max),
          min: asNullableNumber(dressCode.min),
        }
      : null,
    fabricHand: asNullableString(record.fabricHand),
    fitObservations: asStringArray(record.fitObservations),
    itemType: asNullableString(record.itemType),
    pairingNotes: asNullableString(record.pairingNotes),
    polishLevel: asNullableString(record.polishLevel),
    qualityTier: asNullableString(record.qualityTier),
    seasonality: asStringArray(record.seasonality),
    silhouette: asNullableString(record.silhouette),
    styleRole: asNullableString(record.styleRole),
    structureLevel: asNullableString(record.structureLevel),
    tags: asStringArray(record.tags),
    texture: asNullableString(record.texture),
    useCases: asStringArray(record.useCases),
    avoidUseCases: asStringArray(record.avoidUseCases),
    visualWeight: asNullableString(record.visualWeight),
  };
}

export function normalizeStylePurchaseCandidate(value: unknown): StylePurchaseCandidate {
  const record = asRecord(parseJsonLike<Record<string, unknown>>(value)) ?? {};
  const price = asRecord(record.estimatedPrice);
  const category = asNullableString(record.category);
  if (!category) {
    throw new Error('Style purchase candidate must include a category.');
  }
  return {
    brand: asNullableString(record.brand),
    category,
    comparatorKey: inferStyleComparatorKey({
      category,
      comparatorKey: record.comparatorKey ?? record.comparator_key,
      extraSignals: [
        record.name,
        record.notes,
        record.fitType,
        record.fabricHand,
        record.silhouette,
        ...(Array.isArray(record.useCases) ? record.useCases : []),
      ],
      profile: {
        itemType: asNullableString(record.itemType),
        styleRole: asNullableString(record.styleRole),
        tags: asStringArray(record.tags),
      },
      subcategory: record.subcategory,
      tags: record.tags,
    }),
    colorFamily: asNullableString(record.colorFamily),
    colorName: asNullableString(record.colorName),
    estimatedPrice: price
      ? {
          max: asNullableNumber(price.max),
          min: asNullableNumber(price.min),
        }
      : null,
    descriptorConfidence: asNullableNumber(record.descriptorConfidence),
    fabricHand: asNullableString(record.fabricHand),
    fitType: asNullableString(record.fitType),
    fitObservations: asStringArray(record.fitObservations),
    formality: asNullableNumber(record.formality),
    imageUrls: collectPurchaseCandidateImageUrls(record),
    name: asNullableString(record.name),
    notes: asNullableString(record.notes),
    polishLevel: asNullableString(record.polishLevel),
    qualityTier: asNullableString(record.qualityTier),
    seasonality: asStringArray(record.seasonality),
    silhouette: asNullableString(record.silhouette),
    structureLevel: asNullableString(record.structureLevel),
    subcategory: asNullableString(record.subcategory),
    texture: asNullableString(record.texture),
    useCases: asStringArray(record.useCases),
    avoidUseCases: asStringArray(record.avoidUseCases),
    visualWeight: asNullableString(record.visualWeight),
  };
}

function normalizeWeightedPreferences(value: unknown, fallbackValues: string[] = []): StyleWeightedPreferenceRecord[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => asRecord(entry))
      .filter((entry): entry is Record<string, unknown> => Boolean(entry))
      .map((entry) => {
        const prefValue = asNullableString(entry.value);
        if (!prefValue) {
          return null;
        }
        return {
          note: asNullableString(entry.note),
          value: prefValue,
          weight: normalizePreferenceWeight(entry.weight),
        };
      })
      .filter((entry): entry is StyleWeightedPreferenceRecord => Boolean(entry));
  }

  return fallbackValues.map((prefValue) => ({
    note: null,
    value: prefValue,
    weight: 'medium',
  }));
}

function normalizeFormalityPreferences(value: unknown): StyleFormalityPreferenceRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => {
      const context = asNullableString(entry.context);
      if (!context) {
        return null;
      }
      const targetRange = asRecord(entry.targetRange);
      return {
        context,
        note: asNullableString(entry.note),
        targetRange: targetRange
          ? {
              max: asNullableNumber(targetRange.max),
              min: asNullableNumber(targetRange.min),
            }
          : null,
      };
    })
    .filter((entry): entry is StyleFormalityPreferenceRecord => Boolean(entry));
}

function normalizeOccasionRules(value: unknown): StyleOccasionRuleRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => {
      const occasion = asNullableString(entry.occasion);
      if (!occasion) {
        return null;
      }
      return {
        avoidLanes: asStringArray(entry.avoidLanes),
        note: asNullableString(entry.note),
        occasion,
        preferredLanes: asStringArray(entry.preferredLanes),
      };
    })
    .filter((entry): entry is StyleOccasionRuleRecord => Boolean(entry));
}

function normalizeFitProfile(value: unknown): StyleFitProfileRecord | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  return {
    bodyNotes: asStringArray(record.bodyNotes),
    legShapePreference: asNullableString(record.legShapePreference),
    risePreference: asNullableString(record.risePreference),
    sleevePreference: asNullableString(record.sleevePreference),
    topLengthPreference: asNullableString(record.topLengthPreference),
  };
}

function normalizeBudgetProfile(value: unknown): StyleBudgetProfileRecord | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  return {
    everydayTier: asNullableString(record.everydayTier),
    investmentTier: asNullableString(record.investmentTier),
    splurgeCategories: asStringArray(record.splurgeCategories),
  };
}

function normalizeBrandAffinities(value: unknown): StyleBrandAffinityRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => {
      const brand = asNullableString(entry.brand);
      if (!brand) {
        return null;
      }
      const stance =
        entry.stance === 'prefer' || entry.stance === 'avoid' || entry.stance === 'conditional'
          ? entry.stance
          : 'conditional';
      return {
        brand,
        note: asNullableString(entry.note),
        stance,
      };
    })
    .filter((entry): entry is StyleBrandAffinityRecord => Boolean(entry));
}

function normalizeExceptionRules(value: unknown): StyleExceptionRuleRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => {
      const when = asNullableString(entry.when);
      if (!when) {
        return null;
      }
      return {
        allows: asStringArray(entry.allows),
        note: asNullableString(entry.note),
        when,
      };
    })
    .filter((entry): entry is StyleExceptionRuleRecord => Boolean(entry));
}

function collectPurchaseCandidateImageUrls(record: Record<string, unknown>): string[] {
  const urls = [
    ...asStringArray(record.imageUrls ?? record.images),
    asNullableString(record.imageUrl),
    asNullableString(record.image_url),
    asNullableString(record.sourceUrl),
    asNullableString(record.source_url),
    asNullableString(record.url),
  ].filter((value): value is string => Boolean(value));
  return Array.from(new Set(urls));
}

export function normalizeStyleItemInput(value: unknown): Record<string, unknown> {
  const record = asRecord(parseJsonLike<Record<string, unknown>>(value));
  if (!record) {
    throw new Error('Style item payload must be an object.');
  }
  return record;
}

export function normalizePhotoInput(value: unknown): Record<string, unknown>[] {
  const parsed = parseJsonLike<unknown[]>(value);
  if (!Array.isArray(parsed)) {
    throw new Error('Style photo payload must be an array.');
  }
  return parsed.map((entry) => asRecord(entry)).filter((entry): entry is Record<string, unknown> => Boolean(entry));
}

export function normalizeStyleItemStatus(value: unknown, fallback: StyleItemStatus = 'active'): StyleItemStatus {
  if (value === 'archived' || value === 'retired' || value === 'active') {
    return value;
  }
  return fallback;
}

export function normalizeStyleComparatorKey(value: unknown): StyleComparatorKey {
  return typeof value === 'string' && STYLE_COMPARATOR_KEYS.includes(value as StyleComparatorKey)
    ? (value as StyleComparatorKey)
    : 'unknown';
}

export function normalizeStyleClosetCoverage(value: unknown): StyleClosetCoverage {
  return value === 'current' || value === 'partial' ? value : null;
}

export function normalizeStyleOnboardingPath(value: unknown): StyleOnboardingPath {
  return value === 'seeded' || value === 'fresh' ? value : null;
}

export function inferStyleOnboardingMode(itemCount: number): StyleOnboardingMode {
  return itemCount > 0 ? 'seeded' : 'fresh';
}

export function inferStyleComparatorKey(input: {
  category?: unknown;
  comparatorKey?: unknown;
  extraSignals?: unknown[];
  name?: unknown;
  notes?: unknown;
  profile?: Pick<StyleItemProfileDocument, 'itemType' | 'styleRole' | 'tags'> | null;
  subcategory?: unknown;
  tags?: unknown;
}): StyleComparatorKey {
  const explicit = normalizeStyleComparatorKey(input.comparatorKey);
  if (explicit !== 'unknown') {
    return explicit;
  }

  const category = normalizeStyleCategory(input.category);
  const signals = collectComparatorSignals(input.subcategory, input.profile, input.tags, [
    ...(input.extraSignals ?? []),
    input.name,
    input.notes,
  ]);
  if (signals.length === 0) {
    return 'unknown';
  }

  const categorySpecific = inferComparatorKeyForCategory(category, signals);
  if (categorySpecific !== 'unknown') {
    return categorySpecific;
  }

  if (category === 'TOP' || category === 'OUTERWEAR') {
    return 'other_top';
  }
  if (category === 'BOTTOM') {
    return 'other_bottom';
  }
  if (category === 'SHOE') {
    return 'other_shoe';
  }
  return 'unknown';
}

export function normalizeStylePhotoView(value: unknown): string | null {
  const raw = asNullableString(value);
  if (!raw) {
    return null;
  }

  switch (raw.trim().toLowerCase().replace(/[\s-]+/g, '_')) {
    case 'front':
    case 'back':
    case 'side':
    case 'detail':
    case 'fit_front':
    case 'fit_side':
    case 'fit_other':
    case 'unknown':
      return raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
    default:
      return 'unknown';
  }
}

export function inferStylePhotoKind(input: {
  isFit?: boolean;
  kind?: unknown;
  view?: unknown;
}): StylePhotoKind {
  if (input.kind === 'product' || input.kind === 'fit' || input.kind === 'detail' || input.kind === 'unknown') {
    return input.kind;
  }

  if (input.isFit) {
    return 'fit';
  }

  const view = normalizeStylePhotoView(input.view);
  if (view?.startsWith('fit_')) {
    return 'fit';
  }
  if (view === 'front' || view === 'back' || view === 'side') {
    return 'product';
  }
  if (view === 'detail') {
    return 'detail';
  }
  return 'unknown';
}

export function inferStylePhotoSource(input: {
  importedFrom?: unknown;
  source?: unknown;
  url?: unknown;
}): StylePhotoSource {
  if (
    input.source === 'imported' ||
    input.source === 'user_upload' ||
    input.source === 'generated_metadata' ||
    input.source === 'legacy_reference'
  ) {
    return input.source;
  }

  const importedFrom = asNullableString(input.importedFrom);
  const url = asNullableString(input.url) ?? '';
  if (url.startsWith('/')) {
    return 'legacy_reference';
  }
  if (importedFrom) {
    return 'imported';
  }
  return 'user_upload';
}

export function isStyleCalibrationPracticallyConfirmed(profile: StyleProfileDocument): boolean {
  return (
    profile.practicalCalibrationConfirmed ||
    profile.fitNotes.length > 0 ||
    profile.sizingPreferences.length > 0 ||
    profile.hardAvoids.length > 0 ||
    profile.contextRules.length > 0
  );
}

export function isStyleCalibrationTasteConfirmed(profile: StyleProfileDocument): boolean {
  return (
    profile.tasteCalibrationConfirmed ||
    profile.preferredSilhouettes.length > 0 ||
    profile.colorDirections.length > 0 ||
    profile.aestheticKeywords.length > 0 ||
    profile.formalityTendency !== null
  );
}

export function isStylePurchaseEvalReady(
  profile: StyleProfileDocument,
  input: {
    itemCount: number;
    primaryPhotoCount: number;
  },
): boolean {
  const practicalConfirmed = isStyleCalibrationPracticallyConfirmed(profile);
  const tasteConfirmed = isStyleCalibrationTasteConfirmed(profile);
  if (input.itemCount > 0) {
    return profile.importedClosetConfirmed && practicalConfirmed && tasteConfirmed;
  }
  return input.primaryPhotoCount > 0 && practicalConfirmed && tasteConfirmed;
}

function normalizeStyleCategory(value: unknown): string | null {
  const category = asNullableString(value);
  return category ? category.trim().toUpperCase() : null;
}

function collectComparatorSignals(
  subcategory: unknown,
  profile: Pick<StyleItemProfileDocument, 'itemType' | 'styleRole' | 'tags'> | null | undefined,
  extraTags: unknown,
  extraSignals: unknown[] = [],
) {
  const signals = new Set<string>();

  for (const value of [
    asNullableString(subcategory),
    asNullableString(profile?.itemType),
    asNullableString(profile?.styleRole),
    ...asStringArray(profile?.tags),
    ...asStringArray(extraTags),
    ...extraSignals.flatMap((value) => (Array.isArray(value) ? value : [value])),
  ]) {
    const normalized = normalizeComparatorText(value);
    if (!normalized) {
      continue;
    }
    signals.add(normalized);
    for (const fragment of normalized.split('_')) {
      if (fragment.length > 1) {
        signals.add(fragment);
      }
    }
  }

  return [...signals];
}

function normalizeComparatorText(value: unknown): string | null {
  const raw = asNullableString(value);
  if (!raw) {
    return null;
  }
  return raw
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function inferComparatorKeyForCategory(category: string | null, signals: string[]): StyleComparatorKey {
  if (category === 'TOP') {
    if (matchesComparatorAlias(signals, ['polo', 'polo_shirt'])) return 'polo';
    if (matchesComparatorAlias(signals, ['oxford_shirt', 'oxford', 'button_down', 'buttondown', 'ocbd'])) return 'oxford_shirt';
    if (matchesComparatorAlias(signals, ['camp_shirt', 'camp_collar', 'camp_collar_shirt', 'resort_shirt', 'cabana_shirt'])) {
      return 'camp_shirt';
    }
    if (
      hasComparatorAlias(signals, ['shirt', 'button_up', 'buttonup', 'short_sleeve_button_up', 'short_sleeve_shirt']) &&
      hasComparatorAlias(signals, ['linen', 'relaxed', 'casual', 'vacation', 'resort', 'summer'])
    ) {
      return 'camp_shirt';
    }
    if (matchesComparatorAlias(signals, ['henley', 'henley_shirt'])) return 'henley';
    if (matchesComparatorAlias(signals, ['jersey', 'basketball_jersey', 'nba_jersey', 'soccer_jersey', 'football_jersey'])) {
      return 'jersey';
    }
    if (
      matchesComparatorAlias(signals, [
        't_shirt',
        'tshirt',
        'tee',
        'tee_shirt',
        'long_sleeve_tee',
        'graphic_tee',
        'tour_tee',
        'merch_tee',
      ])
    ) {
      return 'tee';
    }
    if (matchesComparatorAlias(signals, ['dress_shirt', 'shirt', 'button_up', 'buttonup'])) return 'dress_shirt';
    if (matchesComparatorAlias(signals, ['overshirt', 'shirt_jacket', 'shacket'])) return 'overshirt';
    if (matchesComparatorAlias(signals, ['sweater', 'jumper', 'crewneck', 'pullover', 'knit'])) return 'sweater';
    if (matchesComparatorAlias(signals, ['hoodie', 'hooded', 'hooded_sweatshirt'])) return 'hoodie';
    if (matchesComparatorAlias(signals, ['cardigan'])) return 'cardigan';
    if (matchesComparatorAlias(signals, ['coat', 'overcoat', 'parka', 'trench', 'raincoat', 'mac'])) return 'coat';
    if (matchesComparatorAlias(signals, ['jacket', 'blazer', 'sport_coat', 'bomber'])) return 'jacket';
  }

  if (category === 'OUTERWEAR') {
    if (matchesComparatorAlias(signals, ['coat', 'overcoat', 'parka', 'trench', 'raincoat', 'mac'])) return 'coat';
    if (matchesComparatorAlias(signals, ['jacket', 'blazer', 'sport_coat', 'bomber', 'anorak'])) return 'jacket';
    if (matchesComparatorAlias(signals, ['overshirt', 'shirt_jacket', 'shacket'])) return 'overshirt';
    if (matchesComparatorAlias(signals, ['hoodie', 'hooded', 'hooded_sweatshirt'])) return 'hoodie';
  }

  if (category === 'BOTTOM') {
    if (matchesComparatorAlias(signals, ['jean', 'jeans', 'denim'])) return 'jean';
    if (matchesComparatorAlias(signals, ['chino', 'chinos'])) return 'chino';
    if (matchesComparatorAlias(signals, ['trouser', 'trousers', 'slack', 'slacks', 'pant', 'pants'])) return 'trouser';
    if (matchesComparatorAlias(signals, ['jogger', 'joggers', 'track_pant', 'track_pants', 'sweatpant', 'sweatpants'])) {
      return 'jogger';
    }
    if (matchesComparatorAlias(signals, ['short', 'shorts'])) return 'short';
  }

  if (category === 'SHOE') {
    if (matchesComparatorAlias(signals, ['loafer', 'loafers'])) return 'loafer';
    if (matchesComparatorAlias(signals, ['oxford', 'oxfords', 'cap_toe_oxford', 'oxford_derby'])) return 'oxford';
    if (matchesComparatorAlias(signals, ['derby', 'derbies', 'blucher'])) return 'derby';
    if (
      matchesComparatorAlias(signals, [
        'sneaker',
        'sneakers',
        'trainer',
        'trainers',
        'runner',
        'running_shoe',
        'basketball_shoe',
        'basketball_sneaker',
        'basketball',
        'court_shoe',
      ])
    ) {
      return 'sneaker';
    }
    if (matchesComparatorAlias(signals, ['boot', 'boots', 'chelsea', 'chukka'])) return 'boot';
    if (matchesComparatorAlias(signals, ['mule', 'mules', 'clog', 'clogs'])) return 'mule';
    if (matchesComparatorAlias(signals, ['sandal', 'sandals', 'slides', 'slide', 'flip_flop'])) return 'sandal';
  }

  return 'unknown';
}

function matchesComparatorAlias(signals: string[], aliases: string[]) {
  return signals.some((signal) => aliases.includes(signal));
}

function hasComparatorAlias(signals: string[], aliases: string[]) {
  return matchesComparatorAlias(signals, aliases);
}

export function deriveBaselineStyleItemProfile(input: {
  category?: unknown;
  comparatorKey?: unknown;
  formality?: unknown;
  name?: unknown;
  subcategory?: unknown;
}): StyleItemProfileDocument {
  const comparatorKey = normalizeStyleComparatorKey(input.comparatorKey);
  const formality = asNullableNumber(input.formality);
  const subcategory = asNullableString(input.subcategory);
  const itemType = deriveBaselineItemType(comparatorKey, subcategory);
  const tags = Array.from(
    new Set(
      [comparatorKey !== 'unknown' ? comparatorKey.replace(/_/g, ' ') : null, subcategory, asNullableString(input.category)]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.toLowerCase()),
    ),
  );

  return normalizeStyleItemProfile({
    dressCode:
      formality != null
        ? {
            max: Math.min(5, Math.max(formality, formality + 1)),
            min: Math.max(1, formality - 1),
          }
        : null,
    itemType,
    pairingNotes: deriveBaselinePairingNotes(comparatorKey, formality),
    styleRole: deriveBaselineStyleRole(comparatorKey),
    tags,
  });
}

function deriveBaselineItemType(comparatorKey: StyleComparatorKey, subcategory: string | null) {
  if (subcategory && !/^shirt$/i.test(subcategory)) {
    return subcategory.toLowerCase();
  }
  switch (comparatorKey) {
    case 'camp_shirt':
      return 'camp shirt';
    case 'oxford_shirt':
      return 'oxford shirt';
    case 'dress_shirt':
      return 'dress shirt';
    case 'jogger':
      return 'jogger';
    case 'loafer':
      return 'loafer';
    case 'jersey':
      return 'jersey';
    default:
      return comparatorKey === 'unknown' ? subcategory?.toLowerCase() ?? 'item' : comparatorKey.replace(/_/g, ' ');
  }
}

function deriveBaselineStyleRole(comparatorKey: StyleComparatorKey): string | null {
  switch (comparatorKey) {
    case 'jersey':
      return 'statement';
    case 'dress_shirt':
    case 'oxford_shirt':
    case 'loafer':
    case 'trouser':
      return 'bridge';
    case 'tee':
    case 'sweater':
    case 'short':
    case 'jean':
    case 'jogger':
      return 'workhorse';
    default:
      return null;
  }
}

function deriveBaselinePairingNotes(comparatorKey: StyleComparatorKey, formality: number | null): string | null {
  switch (comparatorKey) {
    case 'loafer':
      return 'bridges clean trousers and sharper tops without feeling fully formal';
    case 'trouser':
      return 'anchors cleaner smart-casual outfits with knitwear, refined shirts, and bridge shoes';
    case 'oxford_shirt':
      return 'pairs easily with trousers, chinos, and loafers for polished casual outfits';
    case 'dress_shirt':
      return 'works best with sharper trousers and dressier footwear';
    case 'camp_shirt':
      return 'sits best with relaxed trousers, shorts, and cleaner casual shoes';
    case 'jersey':
      return 'best treated as a statement casual piece rather than a wardrobe bridge item';
    default:
      if (formality != null && formality >= 4) {
        return 'best used with sharper supporting pieces';
      }
      if (formality != null && formality <= 2) {
        return 'works best inside the casual side of the wardrobe';
      }
      return null;
  }
}
