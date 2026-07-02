import type {
  StyleBrandAffinityRecord,
  StyleBudgetProfileRecord,
  StyleComparatorKey,
  StyleClosetCoverage,
  StyleCalibrationSignalKind,
  StyleCalibrationSignalRecord,
  StyleCalibrationSignalStatus,
  StyleExceptionRuleRecord,
  StyleFitVerdict,
  StyleFitProfileRecord,
  StyleFormalityPreferenceRecord,
  StyleInferenceSource,
  StyleItemCalibrationRecord,
  StyleItemProfileDocument,
  StyleItemWearStatus,
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

// Onboarding canonical vocabularies (closet-onboarding-design.md §2). Closed sets so a host that ignores
// the guidance still yields an item byte-identical to the imported 95.
const STYLE_CATEGORIES = ['TOP', 'BOTTOM', 'OUTERWEAR', 'SHOE', 'ACCESSORY'] as const;

// Color family vocabulary — lowercase (byte-parity with the imported closet; avoids splitting the
// closet color facet into Navy/navy chips). Unmatched input normalizes to null; caller keeps the raw
// value in colorName / field evidence (D4).
const STYLE_COLOR_FAMILIES = [
  'black', 'white', 'gray', 'navy', 'blue', 'beige', 'brown', 'green', 'red', 'olive',
  'burgundy', 'cream', 'camel', 'khaki', 'silver', 'gold', 'pink', 'purple', 'yellow', 'orange', 'multi',
] as const;

const STYLE_COLOR_FAMILY_SYNONYMS: Record<string, string> = {
  grey: 'gray', charcoal: 'gray', graphite: 'gray', slate: 'gray', stone: 'gray', 'charcoal grey': 'gray',
  tan: 'camel', sand: 'beige', taupe: 'beige', oatmeal: 'beige', ecru: 'cream', ivory: 'cream', bone: 'cream', 'off white': 'cream',
  maroon: 'burgundy', wine: 'burgundy', oxblood: 'burgundy', rust: 'brown',
  denim: 'blue', indigo: 'blue', teal: 'green', forest: 'green', sage: 'green', 'hunter green': 'green',
  terracotta: 'orange', mustard: 'yellow', mauve: 'purple', lavender: 'purple',
  multicolor: 'multi', multicolour: 'multi', 'multi color': 'multi', print: 'multi', patterned: 'multi',
};

const STYLE_FIT_VERDICTS = ['true_to_size', 'runs_small', 'runs_large'] as const satisfies readonly StyleFitVerdict[];

// Wardrobe-job styleRole vocabulary the comparator/closet reason over, + synonyms repairing the
// casual/smart/lounge axis fluent-web emitted (which would silently degrade matching vs the 95) (D6).
const STYLE_ROLES = ['workhorse', 'bridge', 'statement', 'anchor', 'dress', 'specialist'] as const;

const STYLE_ROLE_SYNONYMS: Record<string, string> = {
  casual: 'workhorse', everyday: 'workhorse', basic: 'workhorse', relaxed: 'workhorse',
  smart: 'bridge', 'smart casual': 'bridge', versatile: 'bridge', business: 'bridge',
  formal: 'dress',
  lounge: 'specialist', loungewear: 'specialist', athletic: 'specialist', sport: 'specialist', outdoor: 'specialist', performance: 'specialist', specialty: 'specialist',
};

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
    calibrationSignals: [],
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
    itemCalibration: [],
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
    calibrationSignals: normalizeCalibrationSignals(record.calibrationSignals ?? defaults.calibrationSignals),
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
    itemCalibration: normalizeItemCalibration(record.itemCalibration ?? defaults.itemCalibration),
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
  if ('calibrationSignals' in record) patch.calibrationSignals = normalizeCalibrationSignals(record.calibrationSignals);
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
  if ('itemCalibration' in record) patch.itemCalibration = normalizeItemCalibration(record.itemCalibration);
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

const STYLE_PRACTICAL_CALIBRATION_SIGNAL_KINDS = new Set<StyleCalibrationSignalKind>([
  'budget',
  'fit',
  'hard_avoid',
  'occasion',
]);

const STYLE_TASTE_CALIBRATION_SIGNAL_KINDS = new Set<StyleCalibrationSignalKind>([
  'aesthetic',
  'color',
  'formality',
  'silhouette',
]);

function calibrationSignalWriteValue(signal: StyleCalibrationSignalRecord): string {
  return signal.status === 'corrected' && signal.correctedValue ? signal.correctedValue : signal.value;
}

function isConfirmedStyleCalibrationSignal(signal: StyleCalibrationSignalRecord): boolean {
  return signal.source === 'user_confirmed' && (signal.status === 'confirmed' || signal.status === 'corrected');
}

function hasConfirmedCalibrationSignalKind(
  profile: StyleProfileDocument,
  kinds: ReadonlySet<StyleCalibrationSignalKind>,
): boolean {
  return profile.calibrationSignals.some((signal) => isConfirmedStyleCalibrationSignal(signal) && kinds.has(signal.kind));
}

function appendUniqueStrings(existing: string[], additions: string[]): string[] {
  const result = [...existing];
  const seen = new Set(existing.map((entry) => entry.toLowerCase()));
  for (const addition of additions) {
    const value = asNullableString(addition);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function appendUniqueWeightedPreferences(
  existing: StyleWeightedPreferenceRecord[],
  additions: Array<{ note: string | null; value: string }>,
): StyleWeightedPreferenceRecord[] {
  const result = [...existing];
  const seen = new Set(existing.map((entry) => entry.value.toLowerCase()));
  for (const addition of additions) {
    const value = asNullableString(addition.value);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      note: addition.note,
      value,
      weight: 'medium',
    });
  }
  return result;
}

export function projectStyleCalibrationSignalsToProfile(profile: StyleProfileDocument): StyleProfileDocument {
  const confirmedSignals = profile.calibrationSignals.filter(isConfirmedStyleCalibrationSignal);
  const hardAvoids: string[] = [];
  const fitNotes: string[] = [];
  const sizingPreferences: string[] = [];
  const contextRules: string[] = [];
  const colorDirections: string[] = [];
  const colorPreferences: Array<{ note: string | null; value: string }> = [];
  const preferredSilhouettes: string[] = [];
  const silhouettePreferences: Array<{ note: string | null; value: string }> = [];
  const aestheticKeywords: string[] = [];
  const occasionRules: StyleOccasionRuleRecord[] = [];
  let formalityTendency = profile.formalityTendency;

  for (const signal of confirmedSignals) {
    const value = calibrationSignalWriteValue(signal);
    const note = signal.note ?? 'Projected from confirmed Style calibration signal.';
    switch (signal.kind) {
      case 'hard_avoid':
        hardAvoids.push(value);
        break;
      case 'fit':
        fitNotes.push(value);
        sizingPreferences.push(value);
        break;
      case 'budget':
        contextRules.push(`Budget: ${value}`);
        break;
      case 'occasion':
        contextRules.push(`Occasion: ${value}`);
        occasionRules.push({
          avoidLanes: [],
          note,
          occasion: value,
          preferredLanes: [],
        });
        break;
      case 'color':
        colorDirections.push(value);
        colorPreferences.push({ note, value });
        break;
      case 'silhouette':
        preferredSilhouettes.push(value);
        silhouettePreferences.push({ note, value });
        break;
      case 'aesthetic':
        aestheticKeywords.push(value);
        break;
      case 'formality':
        formalityTendency = formalityTendency ?? value;
        break;
    }
  }

  return mergeStyleProfile(profile, {
    aestheticKeywords: appendUniqueStrings(profile.aestheticKeywords, aestheticKeywords),
    colorDirections: appendUniqueStrings(profile.colorDirections, colorDirections),
    colorPreferences: appendUniqueWeightedPreferences(profile.colorPreferences, colorPreferences),
    contextRules: appendUniqueStrings(profile.contextRules, contextRules),
    fitNotes: appendUniqueStrings(profile.fitNotes, fitNotes),
    formalityTendency,
    hardAvoids: appendUniqueStrings(profile.hardAvoids, hardAvoids),
    occasionRules: [
      ...profile.occasionRules,
      ...occasionRules.filter(
        (addition) =>
          !profile.occasionRules.some((existing) => existing.occasion.toLowerCase() === addition.occasion.toLowerCase()),
      ),
    ],
    preferredSilhouettes: appendUniqueStrings(profile.preferredSilhouettes, preferredSilhouettes),
    practicalCalibrationConfirmed:
      profile.practicalCalibrationConfirmed ||
      hasConfirmedCalibrationSignalKind(profile, STYLE_PRACTICAL_CALIBRATION_SIGNAL_KINDS),
    silhouettePreferences: appendUniqueWeightedPreferences(profile.silhouettePreferences, silhouettePreferences),
    sizingPreferences: appendUniqueStrings(profile.sizingPreferences, sizingPreferences),
    tasteCalibrationConfirmed:
      profile.tasteCalibrationConfirmed ||
      hasConfirmedCalibrationSignalKind(profile, STYLE_TASTE_CALIBRATION_SIGNAL_KINDS),
  });
}

function normalizeCalibrationSignals(value: unknown): StyleCalibrationSignalRecord[] {
  const parsed = parseJsonLike<unknown>(value);
  const entries = Array.isArray(parsed) ? parsed : [];
  return entries
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => {
      const kind = normalizeCalibrationSignalKind(entry.kind);
      const value = asNullableString(entry.value);
      if (!kind || !value) {
        return null;
      }
      return {
        confidence: clampNullableConfidence(entry.confidence),
        correctedValue: asNullableString(entry.correctedValue ?? entry.corrected_value),
        id: asNullableString(entry.id) ?? `style-signal:${kind}:${slugSignalValue(value)}`,
        kind,
        note: asNullableString(entry.note),
        source: normalizeInferenceSource(entry.source),
        status: normalizeCalibrationSignalStatus(entry.status),
        updatedAt: asNullableString(entry.updatedAt ?? entry.updated_at),
        value,
      };
    })
    .filter((entry): entry is StyleCalibrationSignalRecord => Boolean(entry));
}

function normalizeItemCalibration(value: unknown): StyleItemCalibrationRecord[] {
  const parsed = parseJsonLike<unknown>(value);
  const entries = Array.isArray(parsed) ? parsed : [];
  return entries
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => {
      const itemId = asNullableString(entry.itemId ?? entry.item_id);
      if (!itemId) {
        return null;
      }
      return {
        itemId,
        note: asNullableString(entry.note),
        source: normalizeInferenceSource(entry.source),
        updatedAt: asNullableString(entry.updatedAt ?? entry.updated_at),
        wearStatus: normalizeItemWearStatus(entry.wearStatus ?? entry.wear_status),
      };
    })
    .filter((entry): entry is StyleItemCalibrationRecord => Boolean(entry));
}

function normalizeCalibrationSignalKind(value: unknown): StyleCalibrationSignalKind | null {
  if (
    value === 'aesthetic' ||
    value === 'budget' ||
    value === 'color' ||
    value === 'fit' ||
    value === 'formality' ||
    value === 'hard_avoid' ||
    value === 'occasion' ||
    value === 'silhouette'
  ) {
    return value;
  }
  return null;
}

function normalizeCalibrationSignalStatus(value: unknown): StyleCalibrationSignalStatus {
  if (value === 'confirmed' || value === 'rejected' || value === 'corrected') {
    return value;
  }
  return 'inferred';
}

function normalizeInferenceSource(value: unknown): StyleInferenceSource {
  if (
    value === 'user_confirmed' ||
    value === 'closet_inferred' ||
    value === 'item_metadata' ||
    value === 'host_visual_inspection' ||
    value === 'fallback'
  ) {
    return value;
  }
  return 'fallback';
}

function normalizeItemWearStatus(value: unknown): StyleItemWearStatus {
  if (value === 'actively_worn' || value === 'stale' || value === 'accidental') {
    return value;
  }
  return 'unknown';
}

function clampNullableConfidence(value: unknown): number | null {
  const number = asNullableNumber(value);
  if (number == null || !Number.isFinite(number)) {
    return null;
  }
  return Math.max(0, Math.min(1, Number(number.toFixed(2))));
}

function normalizeStyleFitVerdict(value: unknown): StyleFitVerdict | null {
  const stringValue = asNullableString(value);
  if (!stringValue) {
    return null;
  }
  return STYLE_FIT_VERDICTS.includes(stringValue as StyleFitVerdict) ? stringValue as StyleFitVerdict : null;
}

function slugSignalValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || crypto.randomUUID();
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
    fitVerdict: normalizeStyleFitVerdict(record.fitVerdict),
    itemType: asNullableString(record.itemType),
    lengthNote: asNullableString(record.lengthNote),
    ownedSize: asNullableString(record.ownedSize),
    pairingNotes: asNullableString(record.pairingNotes),
    polishLevel: asNullableString(record.polishLevel),
    qualityTier: asNullableString(record.qualityTier),
    reanalyzePending: record.reanalyzePending === true,
    reanalyzeRequestedAt: asNullableString(record.reanalyzeRequestedAt),
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
  const rawStringValue = asNullableString(value);
  const parsed = parseJsonLike<unknown>(value);
  const directUrl = asNullableString(parsed) ?? rawStringValue;
  const record = asRecord(parsed) ?? (directUrl ? { notes: rawStringValue, url: directUrl } : {});
  const price = asRecord(record.estimatedPrice);
  const candidateName = asNullableString(record.name) ?? derivePurchaseCandidateName(record);
  const category = normalizeStyleCategory(record.category) ?? inferStylePurchaseCategory(record);
  const explicitSubcategory =
    asNullableString(record.subcategory) ??
    asNullableString(record.sub_category) ??
    asNullableString(record.subtype) ??
    asNullableString(record.sub_type);
  if (!category) {
    throw new Error('Style purchase candidate must include a category.');
  }
  const signalText = buildPurchaseCandidateSignalText(record, candidateName);
  const subcategory = explicitSubcategory ?? inferPurchaseCandidateSubcategory(category, signalText);
  const colorName =
    asNullableString(record.colorName) ??
    asNullableString(record.color_name) ??
    asNullableString(record.colourName) ??
    asNullableString(record.colour_name) ??
    asNullableString(record.colorway) ??
    asNullableString(record.colourway);
  return {
    brand: asNullableString(record.brand) ?? asNullableString(record.brand_name) ?? inferPurchaseCandidateBrand(signalText),
    category,
    comparatorKey: inferStyleComparatorKey({
      category,
      comparatorKey: record.comparatorKey ?? record.comparator_key,
      extraSignals: [
        candidateName,
        record.notes,
        record.url,
        record.productUrl,
        record.product_url,
        record.sourceUrl,
        record.source_url,
        record.pageUrl,
        record.page_url,
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
      subcategory,
      tags: record.tags,
    }),
    colorFamily:
      asNullableString(record.colorFamily) ??
      asNullableString(record.color_family) ??
      asNullableString(record.colourFamily) ??
      asNullableString(record.colour_family) ??
      inferPurchaseCandidateColorFamily(signalText, colorName),
    colorName,
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
    name: candidateName,
    notes: asNullableString(record.notes),
    polishLevel: asNullableString(record.polishLevel),
    qualityTier: asNullableString(record.qualityTier),
    seasonality: asStringArray(record.seasonality),
    silhouette: asNullableString(record.silhouette),
    structureLevel: asNullableString(record.structureLevel),
    subcategory,
    texture: asNullableString(record.texture),
    useCases: asStringArray(record.useCases),
    avoidUseCases: asStringArray(record.avoidUseCases),
    visualWeight: asNullableString(record.visualWeight),
  };
}

function inferStylePurchaseCategory(record: Record<string, unknown>): string | null {
  const url =
    asNullableString(record.url) ??
    asNullableString(record.productUrl) ??
    asNullableString(record.product_url) ??
    asNullableString(record.sourceUrl) ??
    asNullableString(record.source_url) ??
    asNullableString(record.pageUrl) ??
    asNullableString(record.page_url);
  const signals = [
    asNullableString(record.name),
    asNullableString(record.subcategory),
    asNullableString(record.sub_category),
    asNullableString(record.subtype),
    asNullableString(record.sub_type),
    asNullableString(record.notes),
    url,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase()
    .replace(/[-_]+/g, ' ');

  if (!signals) {
    return null;
  }

  if (/(shoe|shoes|sneaker|sneakers|trainer|trainers|runner|runners|boot|boots|loafer|loafers|slides|sandals|air force|air max|stan smith|common projects)/.test(signals)) {
    return 'SHOE';
  }
  if (/(jacket|coat|overshirt|hoodie|hooded)/.test(signals)) {
    return 'OUTERWEAR';
  }
  if (/(jean|jeans|trouser|trousers|pants|pant|short|shorts|chino|chinos|jogger|joggers)/.test(signals)) {
    return 'BOTTOM';
  }
  if (/(tee|t-shirt|t shirt|shirt|shirts|sweater|polo|henley|jersey)/.test(signals)) {
    return 'TOP';
  }

  return null;
}

function buildPurchaseCandidateSignalText(record: Record<string, unknown>, candidateName: string | null): string {
  return [
    candidateName,
    record.brand,
    record.brand_name,
    record.colorFamily,
    record.color_family,
    record.colorName,
    record.color_name,
    record.colourFamily,
    record.colour_family,
    record.colourName,
    record.colour_name,
    record.colorway,
    record.colourway,
    record.subcategory,
    record.sub_category,
    record.subtype,
    record.sub_type,
    record.notes,
    record.title,
    record.pageTitle,
    record.page_title,
    record.url,
    record.productUrl,
    record.product_url,
    record.sourceUrl,
    record.source_url,
    record.pageUrl,
    record.page_url,
  ]
    .map((entry) => asNullableString(entry))
    .filter((entry): entry is string => Boolean(entry))
    .join(' ')
    .toLowerCase()
    .replace(/[-_]+/g, ' ');
}

function inferPurchaseCandidateBrand(signalText: string): string | null {
  if (!signalText) {
    return null;
  }
  if (/\b(nocta|nike x nocta)\b/.test(signalText)) {
    return 'Nike x NOCTA';
  }
  if (/\bnike\b/.test(signalText)) {
    return 'Nike';
  }
  if (/\badidas\b/.test(signalText)) {
    return 'Adidas';
  }
  if (/\bcommon projects\b/.test(signalText)) {
    return 'Common Projects';
  }
  if (/\ballen edmonds\b/.test(signalText)) {
    return 'Allen Edmonds';
  }
  return null;
}

function inferPurchaseCandidateSubcategory(category: string, signalText: string): string | null {
  if (!signalText) {
    return null;
  }

  const patternsByCategory: Record<string, Array<[RegExp, string]>> = {
    BOTTOM: [
      [/\b(chino|chinos)\b/, 'Chino'],
      [/\b(jean|jeans|denim)\b/, 'Jean'],
      [/\b(trouser|trousers|slack|slacks|pant|pants)\b/, 'Trouser'],
      [/\b(jogger|joggers|track pants?|sweatpants?)\b/, 'Jogger'],
      [/\b(short|shorts)\b/, 'Short'],
    ],
    OUTERWEAR: [
      [/\b(parka)\b/, 'Parka'],
      [/\b(overcoat|topcoat|trench|raincoat|mac)\b/, 'Coat'],
      [/\b(bomber|blazer|sport coat|jacket|anorak)\b/, 'Jacket'],
      [/\b(overshirt|shirt jacket|shacket)\b/, 'Overshirt'],
      [/\b(hoodie|hooded sweatshirt)\b/, 'Hoodie'],
    ],
    SHOE: [
      [/\b(air force 1|af1|air max|stan smith|common projects|achilles|sneaker|sneakers|trainer|trainers|runner|running shoe|court shoe)\b/, 'Sneaker'],
      [/\b(loafer|loafers)\b/, 'Loafer'],
      [/\b(oxford|oxfords|cap toe)\b/, 'Oxford'],
      [/\b(derby|derbies|blucher)\b/, 'Derby'],
      [/\b(chelsea|chukka|boot|boots)\b/, 'Boot'],
      [/\b(sandal|sandals|slide|slides|flip flop)\b/, 'Sandal'],
      [/\b(mule|mules|clog|clogs)\b/, 'Mule'],
    ],
    TOP: [
      [/\b(crew neck sweater|crewneck sweater|crew neck jumper|crewneck jumper|sweater|jumper|pullover|knit)\b/, 'Sweater'],
      [/\b(polo|polo shirt)\b/, 'Polo'],
      [/\b(oxford shirt|ocbd|button down)\b/, 'Oxford Shirt'],
      [/\b(camp shirt|camp collar|resort shirt|cabana shirt)\b/, 'Camp Shirt'],
      [/\b(henley)\b/, 'Henley'],
      [/\b(basketball jersey|soccer jersey|football jersey)\b/, 'Jersey'],
      [/\b(t-shirt|t shirt|tee|tshirt)\b/, 'T-Shirt'],
      [/\b(jersey)\b/, 'Jersey'],
      [/\b(hoodie|hooded sweatshirt)\b/, 'Hoodie'],
      [/\b(cardigan)\b/, 'Cardigan'],
      [/\b(dress shirt|button up|buttonup|shirt)\b/, 'Shirt'],
    ],
  };

  for (const [pattern, subcategory] of patternsByCategory[category] ?? []) {
    if (pattern.test(signalText)) {
      return subcategory;
    }
  }
  return null;
}

function inferPurchaseCandidateColorFamily(signalText: string, colorName: string | null): string | null {
  const signals = [colorName, signalText]
    .map((entry) => asNullableString(entry))
    .filter((entry): entry is string => Boolean(entry))
    .join(' ')
    .toLowerCase()
    .replace(/[-_]+/g, ' ');
  if (!signals) {
    return null;
  }

  const colorPatterns: Array<[RegExp, string]> = [
    [/\b(triple white|all white|white)\b/, 'white'],
    [/\b(triple black|all black|black)\b/, 'black'],
    [/\b(gray|grey|silver)\b/, 'gray'],
    [/\b(brown|chocolate|espresso|tan|taupe|beige|cream|sail|khaki)\b/, 'brown'],
    [/\b(yellow|citron|gold)\b/, 'yellow'],
    [/\b(green|olive)\b/, 'green'],
    [/\b(blue|navy)\b/, 'blue'],
    [/\b(red|burgundy|maroon)\b/, 'red'],
    [/\b(pink|rose)\b/, 'pink'],
    [/\b(orange|rust)\b/, 'orange'],
    [/\b(purple|violet)\b/, 'purple'],
  ];

  return colorPatterns.find(([pattern]) => pattern.test(signals))?.[1] ?? null;
}

function derivePurchaseCandidateName(record: Record<string, unknown>): string | null {
  const urlValue =
    asNullableString(record.url) ??
    asNullableString(record.productUrl) ??
    asNullableString(record.product_url) ??
    asNullableString(record.sourceUrl) ??
    asNullableString(record.source_url) ??
    asNullableString(record.pageUrl) ??
    asNullableString(record.page_url);
  if (!urlValue) return null;

  try {
    const url = new URL(urlValue);
    const slug = url.pathname
      .split('/')
      .filter(Boolean)
      .slice(-2)
      .find((part) => /[a-z]/i.test(part) && !/^\d+$/.test(part));
    if (!slug) return null;

    const normalized = slug
      .replace(/\.(html|htm)$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\bmens?\b/gi, '')
      .replace(/\bwomens?\b/gi, '')
      .replace(/\bkids?\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!normalized) return null;
    return normalized
      .split(' ')
      .map((part) => {
        if (/^\d/.test(part)) return part;
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(' ');
  } catch {
    return null;
  }
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
  return Array.from(new Set(urls.filter(looksLikeImageUrl)));
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

  // Primary signals = the host's STRUCTURED fields (subcategory + profile.itemType/tags). Name/notes are
  // free text and pollution-prone, so they are collected separately and DEMOTED by
  // resolveComparatorWithNameDemotion — consulted only when they don't contradict a specific structured
  // type. With no name/notes, allSignals === primarySignals and the result is unchanged from before.
  const primarySignals = collectComparatorSignals(input.subcategory, input.profile, input.tags, []);
  const nameSignals = collectComparatorSignals(undefined, null, undefined, [
    ...(input.extraSignals ?? []),
    input.name,
    input.notes,
  ]);
  const allSignals = [...new Set([...primarySignals, ...nameSignals])];
  if (allSignals.length === 0) {
    return 'unknown';
  }

  const categorySpecific = resolveComparatorWithNameDemotion(category, primarySignals, allSignals);
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
  is_fit?: boolean;
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

export function isStyleFitPhoto(input: {
  isFit?: boolean | null;
  is_fit?: boolean | null;
  kind?: unknown;
  view?: unknown;
}): boolean {
  const view = normalizeStylePhotoView(input.view);
  return Boolean(input.isFit ?? input.is_fit) || input.kind === 'fit' || view?.startsWith('fit_') === true;
}

export function isStyleDisplayPhoto(input: {
  isFit?: boolean | null;
  is_fit?: boolean | null;
  kind?: unknown;
  view?: unknown;
}): boolean {
  if (isStyleFitPhoto(input)) {
    return false;
  }
  return inferStylePhotoKind({
    isFit: Boolean(input.isFit ?? input.is_fit),
    kind: input.kind,
    view: input.view,
  }) === 'product';
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
    profile.contextRules.length > 0 ||
    profile.occasionRules.length > 0 ||
    profile.budgetProfile !== null ||
    hasConfirmedCalibrationSignalKind(profile, STYLE_PRACTICAL_CALIBRATION_SIGNAL_KINDS)
  );
}

export function isStyleCalibrationTasteConfirmed(profile: StyleProfileDocument): boolean {
  return (
    profile.tasteCalibrationConfirmed ||
    profile.preferredSilhouettes.length > 0 ||
    profile.colorDirections.length > 0 ||
    profile.colorPreferences.length > 0 ||
    profile.silhouettePreferences.length > 0 ||
    profile.aestheticKeywords.length > 0 ||
    profile.formalityTendency !== null ||
    profile.formalityPreferences.length > 0 ||
    hasConfirmedCalibrationSignalKind(profile, STYLE_TASTE_CALIBRATION_SIGNAL_KINDS)
  );
}

export function isStylePurchaseEvalReady(
  profile: StyleProfileDocument,
  input: {
    itemCount: number;
    itemProfileCount?: number;
    primaryPhotoCount: number;
  },
): boolean {
  const practicalConfirmed = isStyleCalibrationPracticallyConfirmed(profile);
  const tasteConfirmed = isStyleCalibrationTasteConfirmed(profile);
  if (input.itemCount > 0) {
    // A mature, well-photographed, profiled closet counts as closet-confirmed for purchase eval
    // even without importedClosetConfirmed. Seeded closets carry onboardingPath=null in production
    // (seeding is tracked via context.onboardingMode, not the profile field), so keying off
    // onboardingPath wrongly blocked real calibrated accounts. Base it on actual closet maturity.
    const matureCloset =
      input.itemCount >= 24 &&
      input.primaryPhotoCount >= 12 &&
      (input.itemProfileCount ?? 0) >= 24;
    return (profile.importedClosetConfirmed || matureCloset) && practicalConfirmed && tasteConfirmed;
  }
  return input.primaryPhotoCount > 0 && practicalConfirmed && tasteConfirmed;
}

export function normalizeStyleCategory(value: unknown): string | null {
  const category = asNullableString(value);
  if (!category) {
    return null;
  }

  switch (category.trim().toLowerCase().replace(/[\s_-]+/g, ' ')) {
    case 'top':
    case 'tops':
    case 'shirt':
    case 'shirts':
      return 'TOP';
    case 'bottom':
    case 'bottoms':
    case 'pants':
    case 'trousers':
      return 'BOTTOM';
    case 'outerwear':
    case 'outer wear':
    case 'jacket':
    case 'jackets':
    case 'coat':
    case 'coats':
      return 'OUTERWEAR';
    case 'shoe':
    case 'shoes':
    case 'footwear':
    case 'sneaker':
    case 'sneakers':
    case 'boot':
    case 'boots':
      return 'SHOE';
    case 'accessory':
    case 'accessories':
      return 'ACCESSORY';
    default:
      return category.trim().toUpperCase();
  }
}

// Strict variant for the onboarding create path: returns a canonical category or null — never the
// .toUpperCase() fallthrough — so a host sending a non-canonical category (fluent-web's BASE_LAYER,
// "OTHER", "DRESS") is rejected rather than polluting the closed 5-category closet. Reuses the synonym
// mapping above; existing callers keep the lenient normalizeStyleCategory. See design D3.
export function normalizeStyleCategoryStrict(value: unknown): string | null {
  const normalized = normalizeStyleCategory(value);
  return normalized && (STYLE_CATEGORIES as readonly string[]).includes(normalized) ? normalized : null;
}

// Canonical color-family normalizer for onboarding: lowercase, synonym-mapped, restricted to the closed
// STYLE_COLOR_FAMILIES set. Unmatched -> null (caller preserves the raw value in colorName / evidence). D4.
export function normalizeStyleColorFamily(value: unknown): string | null {
  const raw = asNullableString(value);
  if (!raw) {
    return null;
  }
  const key = raw.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  const mapped = STYLE_COLOR_FAMILY_SYNONYMS[key] ?? key;
  return (STYLE_COLOR_FAMILIES as readonly string[]).includes(mapped) ? mapped : null;
}

// Snap a host-supplied styleRole to the wardrobe-job vocabulary the comparator reasons over; repair
// fluent-web's casual/smart/lounge axis. Unrecognized -> null rather than storing an off-axis value. D6.
export function normalizeStyleRole(value: unknown): string | null {
  const raw = asNullableString(value);
  if (!raw) {
    return null;
  }
  const key = raw.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  if ((STYLE_ROLES as readonly string[]).includes(key)) {
    return key;
  }
  return STYLE_ROLE_SYNONYMS[key] ?? null;
}

// Inherent "-ie" nouns whose plural is a plain "+s" ("Hoodies"->"Hoodie", "Booties"->"Bootie"). A blanket
// -ies->y rule would wreck these (->"Hoody"/"Booty"), so the singularizer skips them and lets the lone-s
// rule handle the trailing "s". Compared against the lowercased stem with the final "s" removed.
const SUBCATEGORY_IE_NOUN_DENYLIST = new Set(['hoodie', 'bootie', 'beanie', 'movie', 'cookie', 'brownie']);

// Singularize the head noun of a subcategory: (1) "-ies"->"y" for consonant+y stems, EXCEPT inherent -ie
// nouns (Derbies->Derby, but Hoodies->Hoodie); (2) drop "-es" after a sibilant (Dresses->Dress,
// Watches->Watch, Galoshes->Galosh); (3) else strip a lone trailing "s", never "ss" (Jeans->Jean, Dress
// stays Dress). Short words (<=3) are left as-is ("Tee").
function singularizeSubcategoryWord(word: string): string {
  if (word.length <= 3) {
    return word;
  }
  const lower = word.toLowerCase();
  if (lower.endsWith('ies') && word.length > 4 && !SUBCATEGORY_IE_NOUN_DENYLIST.has(lower.slice(0, -1))) {
    return `${word.slice(0, -3)}y`;
  }
  if (lower.endsWith('es') && /(ss|x|z|ch|sh)es$/.test(lower)) {
    return word.slice(0, -2);
  }
  if (/[a-rt-z]s$/i.test(word)) {
    return word.slice(0, -1);
  }
  return word;
}

// Normalize a subcategory to the closet's singular Title-Case form (the imported 95 store "Jean",
// "Short", "Sneaker", "Camp Shirt"). Title-cases each space-separated word and singularizes the last
// word. Required field — null when empty.
export function normalizeStyleSubcategory(value: unknown): string | null {
  const raw = asNullableString(value);
  if (!raw) {
    return null;
  }
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  if (!cleaned) {
    return null;
  }
  const words = cleaned.split(' ').map((word) => (word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word));
  const lastIndex = words.length - 1;
  words[lastIndex] = singularizeSubcategoryWord(words[lastIndex]);
  return words.join(' ');
}

function looksLikeImageUrl(value: string): boolean {
  if (/^data:image\//i.test(value)) {
    return true;
  }

  try {
    const url = new URL(value);
    const pathname = url.pathname.toLowerCase();
    if (/\.(avif|gif|jpe?g|png|svg|webp)$/.test(pathname)) {
      return true;
    }
    if (pathname.endsWith('.html') || pathname.endsWith('.htm')) {
      return false;
    }
    const hint = `${url.hostname}${pathname}${url.search}`.toLowerCase();
    return /(image|img|photo|cdn|media)/.test(hint) && !/product/.test(pathname);
  } catch {
    return false;
  }
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
    if (matchesComparatorAlias(signals, ['polo', 'polo_shirt', 'rugby', 'rugby_shirt'])) return 'polo';
    if (matchesComparatorAlias(signals, ['oxford_shirt', 'oxford', 'button_down', 'buttondown', 'ocbd'])) return 'oxford_shirt';
    if (matchesComparatorAlias(signals, ['camp_shirt', 'camp', 'camp_collar', 'camp_collar_shirt', 'resort_shirt', 'cabana_shirt'])) {
      return 'camp_shirt';
    }
    if (matchesComparatorAlias(signals, ['henley', 'henley_shirt'])) return 'henley';
    if (matchesComparatorAlias(signals, ['basketball_jersey', 'nba_jersey', 'soccer_jersey', 'football_jersey'])) {
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
    if (matchesComparatorAlias(signals, ['jersey'])) {
      return 'jersey';
    }
    // Vibe-based camp-shirt inference runs AFTER the hard type checks (polo/oxford/camp-direct/henley/
    // tee/jersey): the loose `shirt` token also matches the fragment of a COMPOUND type like "t-shirt"
    // or "Henley Shirt", so running it earlier mis-slotted casual tees/henleys as camp_shirt (#1/#6/#68).
    // It is still gated so an explicit dress/oxford/flannel/plaid shirt wins, and still sits ABOVE
    // overshirt/dress_shirt so a genuinely vibe-y button-up resolves to camp_shirt.
    if (
      hasComparatorAlias(signals, ['shirt', 'button_up', 'buttonup', 'short_sleeve_button_up', 'short_sleeve_shirt']) &&
      hasComparatorAlias(signals, ['linen', 'relaxed', 'casual', 'vacation', 'resort', 'summer']) &&
      !hasComparatorAlias(signals, ['dress_shirt', 'dress', 'oxford', 'oxford_shirt', 'flannel', 'plaid'])
    ) {
      return 'camp_shirt';
    }
    // overshirt/shacket before dress_shirt (a shacket is not a dress shirt). A sport coat/blazer and a
    // down/puffer insulation layer are JACKETS — guard them before the coat AND sweater checks (a
    // Patagonia-style "Down Sweater" filed under TOP must read jacket, matching OUTERWEAR). This guard is
    // safe below dress_shirt: any button-down carries a `shirt` token and resolves there first, so the
    // `down` fragment of "button-down" never reaches this line.
    if (matchesComparatorAlias(signals, ['overshirt', 'shirt_jacket', 'shacket'])) return 'overshirt';
    if (matchesComparatorAlias(signals, ['dress_shirt', 'shirt', 'button_up', 'buttonup'])) return 'dress_shirt';
    if (matchesComparatorAlias(signals, ['sport_coat', 'sportcoat', 'blazer', 'down', 'puffer'])) return 'jacket';
    // A hooded sweatshirt IS a hoodie, so hoodie is checked BEFORE sweater — whose alias holds
    // sweatshirt/pullover and would otherwise swallow it (the `hooded_sweatshirt` alias was unreachable).
    // cardigan stays above sweater (a knit cardigan is not a sweater); turtleneck/mock/roll-neck are sweaters.
    if (matchesComparatorAlias(signals, ['cardigan'])) return 'cardigan';
    if (matchesComparatorAlias(signals, ['hoodie', 'hooded', 'hooded_sweatshirt'])) return 'hoodie';
    if (matchesComparatorAlias(signals, ['sweater', 'jumper', 'crewneck', 'pullover', 'knit', 'sweatshirt', 'crewneck_sweatshirt', 'turtleneck', 'mock_neck', 'roll_neck'])) {
      return 'sweater';
    }
    if (matchesComparatorAlias(signals, ['coat', 'overcoat', 'parka', 'trench', 'raincoat', 'mac', 'topcoat', 'peacoat', 'greatcoat'])) return 'coat';
    if (matchesComparatorAlias(signals, ['jacket', 'bomber', 'anorak'])) return 'jacket';
  }

  if (category === 'OUTERWEAR') {
    // overshirt before jacket (same CPO must not split by host label); sport coat/blazer is a jacket
    // before the coat check; cardigan + a NARROW sweater alias have explicit OUTERWEAR slots.
    if (matchesComparatorAlias(signals, ['overshirt', 'shirt_jacket', 'shacket'])) return 'overshirt';
    if (matchesComparatorAlias(signals, ['sport_coat', 'sportcoat', 'blazer'])) return 'jacket';
    if (matchesComparatorAlias(signals, ['coat', 'overcoat', 'parka', 'trench', 'raincoat', 'mac', 'topcoat', 'peacoat', 'greatcoat'])) return 'coat';
    if (matchesComparatorAlias(signals, ['jacket', 'bomber', 'anorak', 'down', 'puffer'])) return 'jacket';
    if (matchesComparatorAlias(signals, ['cardigan'])) return 'cardigan';
    if (matchesComparatorAlias(signals, ['sweater', 'jumper'])) return 'sweater';
    if (matchesComparatorAlias(signals, ['hoodie', 'hooded', 'hooded_sweatshirt'])) return 'hoodie';
  }

  if (category === 'BOTTOM') {
    // A short is its own wardrobe slot regardless of fabric/cut (trouser/chino/denim short are all shorts),
    // and a jogger is its own slot regardless of the "pant" token — both must be checked BEFORE
    // jean/chino/trouser, which share a token with the descriptive subcategory and would otherwise win.
    if (matchesComparatorAlias(signals, ['short', 'shorts'])) return 'short';
    if (matchesComparatorAlias(signals, ['jogger', 'joggers', 'track_pant', 'track_pants', 'sweatpant', 'sweatpants', 'sweat_pant', 'sweat_pants'])) {
      return 'jogger';
    }
    if (matchesComparatorAlias(signals, ['jean', 'jeans', 'denim'])) return 'jean';
    if (matchesComparatorAlias(signals, ['chino', 'chinos'])) return 'chino';
    if (matchesComparatorAlias(signals, ['trouser', 'trousers', 'slack', 'slacks', 'pant', 'pants'])) return 'trouser';
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
    // A brand-only hint (Common Projects, AF1, Air Max, ...) implies a sneaker, but ONLY after every
    // explicit shoe type above has had its say — otherwise a "Common Projects Chelsea Boot" becomes a
    // sneaker because the brand token beats the type (#15).
    if (signals.some((signal) => /(air_force_1|af1|air_max|stan_smith|common_projects|achilles)/.test(signal))) {
      return 'sneaker';
    }
  }

  return 'unknown';
}

function matchesComparatorAlias(signals: string[], aliases: string[]) {
  return signals.some((signal) => aliases.includes(signal));
}

function hasComparatorAlias(signals: string[], aliases: string[]) {
  return matchesComparatorAlias(signals, aliases);
}

// Genus tokens are too generic to identify a wardrobe slot on their own — "Shirt" could be a dress shirt,
// camp shirt, oxford, or overshirt; "Pants" could be trousers, chinos, or joggers. They are excluded when
// testing whether the host's STRUCTURED fields already carry a SPECIFIC type (name-token demotion below),
// so a genus token can't out-rank the real type by alias order.
const GENUS_COMPARATOR_TOKENS = new Set<string>(['shirt', 'top', 'pant', 'pants', 'bottom', 'shoe', 'shoes', 'footwear']);

// Two-tier resolution (#16/#17 structural fix). The host's STRUCTURED fields (subcategory + profile.itemType
// + tags) classify first; the free-text name/notes are pollution-prone — a brand like "AG Jeans" or a color
// like "Oxford Grey" injects a false type token — so they are folded into `allSignals` but DEMOTED. When the
// structured-only and name-inclusive answers disagree, the structured answer wins iff it rests on a specific
// (non-genus) token; otherwise the richer name/notes signal wins (a bare "Shirt" must not block a
// "Relaxed Linen ... for summer" -> camp_shirt). With no name/notes the result is byte-identical to before.
function resolveComparatorWithNameDemotion(
  category: string | null,
  primarySignals: string[],
  allSignals: string[],
): StyleComparatorKey {
  const fullKey = inferComparatorKeyForCategory(category, allSignals);
  const primaryKey = inferComparatorKeyForCategory(category, primarySignals);
  if (primaryKey === fullKey) {
    return fullKey;
  }
  const specificPrimary = primarySignals.filter((signal) => !GENUS_COMPARATOR_TOKENS.has(signal));
  const specificKey = inferComparatorKeyForCategory(category, specificPrimary);
  return specificKey !== 'unknown' ? specificKey : fullKey;
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
