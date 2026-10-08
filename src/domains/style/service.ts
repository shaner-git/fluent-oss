import { findApprovedStyleCatalogPhoto } from './onboarding-calibration';
import {photoVersions,reconcilePhotoLibrary,changePhotoArrangement, type PhotoLibraryAction, type PhotoLibraryState} from './photo-library';
import type { MutationProvenance } from '../../auth';
import path from 'node:path';
import type { FluentBlobStore, FluentDatabase } from '../../storage';
import { StylePhotoArtifactReleasedError, StyleRepository } from './repository';
import {
  asBoolean,
  asNullableNumber,
  asNullableString,
  asRecord,
  asStringArray,
  deriveBaselineStyleItemProfile,
  inferStyleComparatorKey,
  inferStyleOnboardingMode,
  inferStylePhotoKind,
  inferStylePhotoSource,
  isStyleDisplayPhoto,
  isStyleFitPhoto,
  isStylePurchaseEvalReady,
  mergeStyleProfile,
  normalizePhotoInput,
  normalizeStyleItemStatus,
  normalizeStyleItemInput,
  normalizeStyleItemProfile,
  normalizeStyleCategoryStrict,
  normalizeStyleColorFamily,
  normalizeStyleRole,
  normalizeStyleSubcategory,
  normalizeStyleProfile,
  normalizeStyleProfilePatch,
  normalizeStyleComparatorKey,
  normalizeStylePhotoView,
  normalizeStylePurchaseCandidate,
  parseJsonLike,
  projectStyleCalibrationSignalsToProfile,
  safeParseJson,
  stringifyJson,
} from './helpers';
import {
  buildSignedStyleImageUrl,
  buildStyleAssetKey,
  buildStyleDerivedImageAssetKey,
  buildStyleImageUrl,
  normalizeStyleRemoteImageSourceUrl,
  assertStyleImageDataUrl,
  STYLE_SELF_HOSTED_IMAGE_LINK_REASON,
  StyleCatalogMediaUnusableError,
  StyleImageInputError,
  styleImageNotAttachedReason,
  parseOwnedStyleAsset,
} from './media';
import { canonicalizeStyleItemRecord } from './metadata-normalization';
import {
  buildStyleCalibrationSignal,
  buildStyleItemCalibration,
  buildStyleOnboardingCalibration,
  isStyleItemExcludedFromCalibration,
  mergeStyleCalibrationSignals,
  mergeStyleItemCalibration,
} from './onboarding-calibration';
import {
  presentStyleDescriptorBacklog,
  presentStylePurchaseAnalysis,
  presentStyleEvidenceGaps,
  presentStyleWardrobeAnalysis,
  summarizeStyleDescriptorBacklog,
  summarizeStyleContext,
  summarizeStyleEvidenceGaps,
  summarizeStyleItem,
  summarizeStyleProfile,
  summarizeStylePurchaseAnalysis,
  summarizeStyleWardrobeAnalysis,
} from './summaries';
import type {
  StyleContextRecord,
  StyleDescriptorBacklogEntry,
  StyleDescriptorBacklogFocus,
  StyleDescriptorBacklogRecord,
  StyleDescriptorSummaryRecord,
  StyleEvidenceGapListRecord,
  StyleEvidenceGapRecord,
  StyleEvidenceGapPriorityFilter,
  StyleEvidenceGapType,
  StyleItemProfileRecord,
  StyleItemProfileDocument,
  StyleItemSummaryRecord,
  StyleItemRecord,
  StyleOccasionCoverageRecord,
  StylePhotoRecord,
  StyleProfileRecord,
  StylePurchaseAnalysis,
  StylePurchaseCandidate,
  StylePurchaseAnalysisItemMatch,
  StylePurchaseVisualEvidence,
  StyleComparatorCoverage,
  StyleCalibrationSignalKind,
  StyleCalibrationSignalRecord,
  StyleCalibrationSignalStatus,
  StyleInferenceSource,
  StyleArchiveItemResult,
  StyleItemWearStatus,
  StyleOnboardingCalibrationRecord,
  StylePhotoDeliveryRecord,
  StyleReplacementCandidateRecord,
  StyleTopWardrobeJob,
  StyleWardrobeAnalysis,
  StyleWardrobeAnalysisFocus,
  StyleWardrobeFindingPriority,
  StyleWardrobeFindingRecord,
  StyleRedundancyClusterRecord,
  StyleVisualBundleAssetRecord,
  StyleVisualBundleComparisonBucketRole,
  StyleVisualBundleComparisonContext,
  StyleVisualBundleDeliveryMode,
  StyleVisualBundleItemContext,
  StyleVisualBundleRecord,
} from './types';

export {
  presentStyleDescriptorBacklog,
  presentStylePurchaseAnalysis,
  presentStyleEvidenceGaps,
  presentStyleWardrobeAnalysis,
  summarizeStyleDescriptorBacklog,
  summarizeStyleContext,
  summarizeStyleEvidenceGaps,
  summarizeStyleItem,
  summarizeStyleProfile,
  summarizeStylePurchaseAnalysis,
  summarizeStyleWardrobeAnalysis,
};

const EMPTY_PURCHASE_VISUAL_EVIDENCE: StylePurchaseVisualEvidence = {
  candidateInspected: false,
  candidateObservations: [],
  comparatorItemIdsInspected: [],
  source: null,
};

export function buildStyleMutationAck(
  entityType: string,
  entityId: string,
  eventType: string,
  happenedAt: string,
  summary: Record<string, unknown>,
) {
  return {
    entityId,
    entityType,
    eventType,
    happenedAt,
    summary,
  };
}

type StarterClosetEvidence = {
  fieldEvidence: Record<string, unknown>;
  profileSignals: Partial<StyleItemProfileDocument>;
  hasProfileSignals: boolean;
};

function buildStarterClosetEvidence(input: {
  item: Record<string, unknown>;
  photoUrl?: string | null;
  sourceSnapshot?: unknown;
}): StarterClosetEvidence {
  const rawProfile = asRecord(input.item.profile ?? input.item.item_profile ?? input.item.itemProfile) ?? {};
  const sourceSnapshotText = JSON.stringify(input.sourceSnapshot ?? '').slice(0, 2000);
  const text = [
    input.item.description,
    input.item.notes,
    input.item.name,
    input.item.subcategory,
    input.item.category,
    sourceSnapshotText,
  ]
    .map((value) => asNullableString(value))
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();
  const useCases = uniqueStrings([
    ...asStringArray(rawProfile.useCases),
    ...asStringArray(input.item.useCases ?? input.item.use_cases),
    ...asStringArray(input.item.occasions),
    ...inferStarterUseCases(text),
  ]);
  const bestOccasions = uniqueStrings([
    ...asStringArray(rawProfile.bestOccasions),
    ...asStringArray(input.item.bestOccasions ?? input.item.best_occasions),
    ...inferStarterUseCases(text),
  ]);
  const fitObservations = uniqueStrings([
    ...asStringArray(rawProfile.fitObservations),
    ...asStringArray(input.item.fitObservations ?? input.item.fit_observations),
    ...inferStarterFitObservations(text),
  ]);
  const structureLevel =
    asNullableString(rawProfile.structureLevel ?? input.item.structureLevel ?? input.item.structure_level) ??
    inferStarterStructureLevel(text);
  const silhouette =
    asNullableString(rawProfile.silhouette ?? input.item.silhouette) ??
    inferStarterSilhouette(text);
  const polishLevel =
    asNullableString(rawProfile.polishLevel ?? input.item.polishLevel ?? input.item.polish_level) ??
    inferStarterPolishLevel(text);
  const descriptorSignals = [
    structureLevel ? `structure:${structureLevel}` : null,
    silhouette ? `silhouette:${silhouette}` : null,
    polishLevel ? `polish:${polishLevel}` : null,
    ...fitObservations.map((entry) => `fit:${entry}`),
    ...useCases.map((entry) => `use:${entry}`),
  ].filter((value): value is string => Boolean(value));
  const profileSignals: Partial<StyleItemProfileDocument> = {
    bestOccasions,
    descriptorConfidence: descriptorSignals.length > 0 ? 0.5 : null,
    fitObservations,
    polishLevel,
    silhouette,
    structureLevel,
    tags: uniqueStrings([
      ...asStringArray(rawProfile.tags),
      ...asStringArray(input.item.tags),
      'starter closet',
      text ? 'text described' : null,
    ]),
    useCases,
  };
  const evidenceGaps = input.photoUrl ? [] : ['missing_photo_evidence'];
  const fieldEvidence = {
    starterCloset: {
      descriptionSignals: descriptorSignals,
      evidenceGaps,
      source: input.photoUrl ? 'user_photo_or_link' : 'user_description',
    },
  };
  return {
    fieldEvidence,
    hasProfileSignals: descriptorSignals.length > 0 || evidenceGaps.length > 0,
    profileSignals,
  };
}

function mergeStarterFieldEvidence(existing: unknown, starter: Record<string, unknown>): Record<string, unknown> {
  const existingRecord = asRecord(parseJsonLike(existing)) ?? {};
  return {
    ...existingRecord,
    ...starter,
  };
}

function mergeStarterProfileSignals(
  base: StyleItemProfileDocument | null | undefined,
  signals: Partial<StyleItemProfileDocument>,
): StyleItemProfileDocument {
  const merged = normalizeStyleItemProfile({
    ...(base ?? {}),
    ...signals,
    descriptorConfidence: signals.descriptorConfidence ?? base?.descriptorConfidence ?? null,
    polishLevel: signals.polishLevel ?? base?.polishLevel ?? null,
    silhouette: signals.silhouette ?? base?.silhouette ?? null,
    structureLevel: signals.structureLevel ?? base?.structureLevel ?? null,
    bestOccasions: uniqueStrings([...(base?.bestOccasions ?? []), ...(signals.bestOccasions ?? [])]),
    fitObservations: uniqueStrings([...(base?.fitObservations ?? []), ...(signals.fitObservations ?? [])]),
    tags: uniqueStrings([...(base?.tags ?? []), ...(signals.tags ?? [])]),
    useCases: uniqueStrings([...(base?.useCases ?? []), ...(signals.useCases ?? [])]),
  });
  return merged;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function inferStarterFitObservations(text: string): string[] {
  const observations: string[] = [];
  if (/\bknee[-\s]?length\b/.test(text)) observations.push('knee length');
  if (/\bstructured shoulders?\b/.test(text)) observations.push('structured shoulders');
  if (/\b(boxy|relaxed|oversized|slim|cropped|longline)\b/.test(text)) {
    observations.push(text.match(/\b(boxy|relaxed|oversized|slim|cropped|longline)\b/)![1]);
  }
  return observations;
}

function inferStarterStructureLevel(text: string): string | null {
  if (/\bunstructured\b/.test(text)) return 'unstructured';
  if (/\bstructured shoulders?\b|\bstructured\b|\btailored\b/.test(text)) return 'structured';
  if (/\bsoft\b|\bslouchy\b/.test(text)) return 'soft';
  return null;
}

function inferStarterSilhouette(text: string): string | null {
  if (/\bknee[-\s]?length\b/.test(text)) return 'long coat';
  if (/\bboxy\b/.test(text)) return 'boxy';
  if (/\boversized\b/.test(text)) return 'oversized';
  if (/\brelaxed\b/.test(text)) return 'relaxed';
  if (/\bslim\b/.test(text)) return 'slim';
  if (/\bcropped\b/.test(text)) return 'cropped';
  return null;
}

function inferStarterPolishLevel(text: string): string | null {
  if (/\bformal\b|\bdressy\b|\bblack tie\b/.test(text)) return 'formal';
  if (/\bsmart casual\b|\bpolished\b|\bstructured\b|\btailored\b|\bdinner\b|\boffice\b|\bwork\b/.test(text)) {
    return 'polished';
  }
  if (/\bcasual\b|\bweekend\b|\bathletic\b|\brunning\b/.test(text)) return 'casual';
  return null;
}

function inferStarterUseCases(text: string): string[] {
  const useCases: string[] = [];
  if (/\bwork\b|\boffice\b/.test(text)) useCases.push('work');
  if (/\bdinners?\b|\bdate night\b|\brestaurant\b/.test(text)) useCases.push('dinner');
  if (/\bweekend\b/.test(text)) useCases.push('weekend');
  if (/\btravel\b/.test(text)) useCases.push('travel');
  if (/\bathletic\b|\brunning\b|\bgym\b|\btraining\b/.test(text)) useCases.push('athletic');
  return useCases;
}

function normalizeStylePurchaseVisualEvidence(value: unknown): StylePurchaseVisualEvidence {
  const record = asRecord(value);
  if (!record) {
    return EMPTY_PURCHASE_VISUAL_EVIDENCE;
  }

  const candidateObservations = [
    ...asStringArray(record.candidateObservations ?? record.candidate_observations ?? record.observations),
    asNullableString(record.candidateObservation ?? record.candidate_observation ?? record.note),
  ]
    .filter((entry): entry is string => Boolean(entry))
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const comparatorItemIdsInspected = asStringArray(
    record.comparatorItemIdsInspected ?? record.comparator_item_ids_inspected ?? record.inspectedComparatorItemIds,
  );
  const candidateInspected =
    asBoolean(record.candidateInspected ?? record.candidate_inspected) === true || candidateObservations.length > 0;

  return {
    candidateInspected,
    candidateObservations: Array.from(new Set(candidateObservations)).slice(0, 8),
    comparatorItemIdsInspected: Array.from(new Set(comparatorItemIdsInspected)).slice(0, 12),
    source: asNullableString(record.source) ?? (candidateInspected ? 'host_vision' : null),
  };
}

function normalizeCalibrationSignalForWrite(input: {
  confidence?: number | null;
  correctedValue?: string | null;
  kind: StyleCalibrationSignalKind;
  note?: string | null;
  source?: StyleInferenceSource;
  status?: StyleCalibrationSignalStatus;
  updatedAt: string;
  value: string;
}): StyleCalibrationSignalRecord {
  if (!input.status) {
    throw new Error('Style calibration signals require explicit status.');
  }
  if (!input.source) {
    throw new Error('Style calibration signals require explicit source.');
  }
  const status = input.status;
  const source = input.source;
  if ((status === 'confirmed' || status === 'corrected' || status === 'rejected') && source !== 'user_confirmed') {
    throw new Error(`Style calibration status "${status}" requires source "user_confirmed".`);
  }
  if (status === 'inferred' && source === 'user_confirmed') {
    throw new Error('Inferred Style calibration signals cannot use source "user_confirmed".');
  }
  if (status === 'corrected' && !asNullableString(input.correctedValue)) {
    throw new Error('Corrected Style calibration signals require corrected_value.');
  }
  if (status !== 'corrected' && asNullableString(input.correctedValue)) {
    throw new Error('Style calibration corrected_value can only be used with status "corrected".');
  }
  return buildStyleCalibrationSignal({
    confidence: input.confidence,
    correctedValue: input.correctedValue,
    kind: input.kind,
    note: input.note,
    source,
    status,
    updatedAt: input.updatedAt,
    value: input.value,
  });
}

function isAcceptanceTestCalibrationWrite(provenance: MutationProvenance): boolean {
  return new Set(['acceptance_test', 'acceptance-test', 'verifier_acceptance_test']).has(provenance.sourceType.trim().toLowerCase());
}

type StyleItemProfileField = keyof StyleItemProfileDocument;

export const STYLE_ITEM_FIT_FIELDS = ['fitObservations', 'fitVerdict', 'ownedSize', 'lengthNote'] as const satisfies readonly StyleItemProfileField[];

export interface StyleItemProfileMergeAuditEntry {
  changed: boolean;
  field: StyleItemProfileField;
  fromSource: string | null;
  toSource: string | null;
}

export type StyleItemProfileMergeResult = StyleItemProfileRecord & {
  mergeAudit: StyleItemProfileMergeAuditEntry[];
};

const STYLE_ITEM_PROFILE_FIELDS: StyleItemProfileField[] = [
  'avoidOccasions',
  'bestOccasions',
  'confidence',
  'descriptorConfidence',
  'dressCode',
  'fabricHand',
  'feedbackNote',
  'feedbackSignals',
  'feedbackUpdatedAt',
  'fitObservations',
  'fitVerdict',
  'itemType',
  'lengthNote',
  'ownedSize',
  'pairingNotes',
  'polishLevel',
  'qualityTier',
  'reanalyzePending',
  'reanalyzeRequestedAt',
  'seasonality',
  'silhouette',
  'styleRole',
  'structureLevel',
  'tags',
  'texture',
  'useCases',
  'avoidUseCases',
  'visualWeight',
  'wearUnderstanding',
  'worksFor',
  'avoidFor',
];

const STYLE_ITEM_PROFILE_CONTROL_FIELDS = new Set<StyleItemProfileField>([
  'reanalyzePending',
  'reanalyzeRequestedAt',
]);

export const STYLE_ITEM_PROFILE_SOURCE_RANK: Record<string, number> = {
  host_fit_vision: 3,
  host_text: 1,
  host_vision: 3,
  host_visual_inspection: 3,
  heuristic_bootstrap: 0,
  inferred: 0,
  editor: 5,
  manual_enrichment: 5,
  starter_closet_description: 1,
  style_auto_bootstrap: 0,
  style_starter_closet: 1,
  stylist_visual: 3,
  tag_ocr: 4,
  test: 1,
  url_scrape: 2,
  user: 5,
  user_correction: 5,
};

// Generic garment-type, cut/fit, and color words used by findStyleItemDuplicates to stop-word the
// name-overlap signal. These carry no item identity (color is already scored on its own axis), so a
// shared generic word like "short"/"black"/"slim" must NOT earn the +0.05 name-match weight and tip a
// brandless type+color coincidence to the 0.70 duplicate gate.
const STYLE_GENERIC_NAME_TOKENS = new Set<string>([
  // garment types (incl. de-punctuated forms, since tokens are punctuation-stripped before lookup:
  // "t-shirt" -> "tshirt", "long-sleeve" -> "longsleeve")
  'short', 'shorts', 'tee', 'tees', 'shirt', 'shirts', 'tshirt', 'tshirts', 'jean', 'jeans', 'pant',
  'pants', 'sweatpant', 'sweatpants', 'trouser', 'trousers', 'chino', 'chinos', 'sneaker', 'sneakers',
  'shoe', 'shoes', 'boot', 'boots', 'loafer', 'loafers', 'sandal', 'sandals', 'jacket', 'coat', 'blazer',
  'sweater', 'sweatshirt', 'hoodie', 'cardigan', 'dress', 'skirt', 'top', 'tank', 'polo', 'henley',
  'overshirt', 'vest', 'crewneck', 'vneck', 'longsleeve', 'pullover',
  // cuts / fits / generic descriptors
  'slim', 'regular', 'relaxed', 'straight', 'skinny', 'tapered', 'cropped', 'oversized', 'classic',
  'standard', 'fitted', 'loose', 'athletic', 'performance', 'essential', 'basic', 'original',
  // colors (already scored on the color axis — must not double-count)
  'black', 'white', 'navy', 'blue', 'gray', 'grey', 'green', 'red', 'brown', 'tan', 'beige', 'olive',
  'khaki', 'pink', 'purple', 'orange', 'yellow', 'cream', 'charcoal', 'denim', 'ivory', 'burgundy', 'maroon',
]);

// Compact per-candidate discriminators surfaced on a duplicate warning so the HOST can decide
// same-vs-different from concrete signals (Fluent surfaces, host decides). Only present (non-empty)
// fields are included. No photo URLs — the host inspects photos via the canonical media/render path.
export interface StyleDuplicateCandidateSignals {
  brand?: string;
  colorFamily?: string;
  colorName?: string;
  itemType?: string;
  size?: string;
  styleRole?: string;
  subcategory?: string;
  tags?: string[];
}

export interface StyleDuplicateCandidate {
  id: string;
  name: string | null;
  reason: string;
  score: number;
  signals: StyleDuplicateCandidateSignals;
}

export type StyleCatalogQualityMode = 'host_generated' | 'inspected_source';

export interface StyleCatalogQualityReviewInput {
  catalogMode: StyleCatalogQualityMode;
  catalogPhotoId: string;
  sourcePhotoId?: string | null;
}

export interface StyleAtomicCatalogMediaInput {
  backgroundRemoved?: boolean | null;
  catalogHostedFileDownloadUrl?: string | null;
  catalogImageDataUrl?: string | null;
  catalogImageUrl?: string | null;
  imageOrigin: 'host_generated' | 'user_source';
  retainedSourceHostedFileDownloadUrl?: string | null;
  retainedSourceImageDataUrl?: string | null;
  retainedSourceImageType?: 'alternate' | 'fit' | null;
}

// Raised when a photo write was built from a photo set that changed before it could commit.
// Nothing was written; callers re-read and rebuild (setFluentStyleItemImage retries).
const STYLE_PROVENANCE_WRITE_MAX_ATTEMPTS = 5;

// Marks an error thrown AFTER this write's photo rows committed, so callers can report the photo as
// saved from the writer's own evidence rather than inferring it from the item's photo set.
export function markStyleWriteCommitted(error: unknown): unknown {
  if (error && typeof error === 'object') {
    Object.defineProperty(error, 'styleWriteCommitted', { configurable: true, value: true });
  }
  return error;
}

export class StylePhotoSetConflictError extends Error {
  constructor(itemId: string) {
    super(`The photos on ${itemId} changed while this photo was being saved. Nothing was saved; try again.`);
    this.name = 'StylePhotoSetConflictError';
  }
}

export class StyleService {
  private readonly repository: StyleRepository;

  constructor(
    private readonly db: FluentDatabase,
    private readonly options: {
      artifacts?: FluentBlobStore;
      // True only on a runtime whose outbound fetch is strictly public after DNS resolution
      // (CoreRuntimeBindings.strictPublicFetch, i.e. hosted Cloudflare). It gates EVERY server-side
      // fetch of a caller-supplied, non-OpenAI image URL: copying a linked photo
      // (copy_source_to_owned), a Catalog create from image_url, and legacy URL imports. Without it
      // (Node/local/self-hosted), hostname checks alone cannot stop a name that resolves to a private
      // address, so links stay references and a Catalog image must arrive as bytes.
      strictPublicFetch?: boolean;
      imageDeliverySecret?: string | null;
      origin?: string | null;
    } = {},
  ) {
    this.repository = new StyleRepository(db);
  }

  // Whether this runtime may download a caller-supplied (non-OpenAI) image URL server-side.
  fetchesCallerImageUrls(): boolean {
    return this.options.strictPublicFetch === true;
  }

  async getProfile(): Promise<StyleProfileRecord> {
    const row = await this.repository.getProfileRow();
    return {
      profileId: row?.profile_id ?? this.repository.profileKey.profileId,
      raw: normalizeStyleProfile(row?.raw_json ?? null),
      tenantId: row?.tenant_id ?? this.repository.profileKey.tenantId,
      updatedAt: row?.updated_at ?? null,
    };
  }

  async updateProfile(input: { profile: unknown; provenance: MutationProvenance }): Promise<StyleProfileRecord> {
    const before = await this.getProfile();
    const requested = asRecord(parseJsonLike(input.profile)) ?? {};
    const patch = normalizeStyleProfilePatch(input.profile);
    delete patch.closetCoverageConfirmedAt;
    if (Object.hasOwn(requested, 'closetCoverage')) {
      patch.closetCoverageConfirmedAt = new Date().toISOString();
    }
    const merged = mergeStyleProfile(before.raw, patch);

    await this.repository.upsertProfile(JSON.stringify(merged));
    const after = await this.getProfile();

    await this.recordDomainEvent({
      after: summarizeStyleProfile(after),
      before: summarizeStyleProfile(before),
      entityId: after.profileId,
      entityType: 'style_profile',
      eventType: 'style.profile_updated',
      provenance: input.provenance,
    });
    return after;
  }

  async getContext(): Promise<StyleContextRecord> {
    const [profile, items] = await Promise.all([this.getProfile(), this.listItems()]);
    const activeItems = items.filter((item) => item.status === 'active');
    const inactiveItems = items.filter((item) => item.status !== 'active');
    const categoryMap = new Map<string, number>();
    const colorMap = new Map<string, number>();
    const totalCategoryMap = new Map<string, number>();
    const totalColorMap = new Map<string, number>();
    const inactiveStatusMap = new Map<string, number>();
    let photoCount = 0;
    let profileCount = 0;
    let primaryPhotoCount = 0;
    let deliverablePhotoCount = 0;
    let pendingReanalyzeCount = 0;
    let usableProfileCount = 0;
    let stylistDescriptorCount = 0;

    for (const item of items) {
      if (item.category) {
        const category = item.category.toLowerCase();
        totalCategoryMap.set(category, (totalCategoryMap.get(category) ?? 0) + 1);
      }
      if (item.colorFamily) {
        totalColorMap.set(item.colorFamily, (totalColorMap.get(item.colorFamily) ?? 0) + 1);
      }
      if (item.status !== 'active') {
        inactiveStatusMap.set(item.status, (inactiveStatusMap.get(item.status) ?? 0) + 1);
      }
    }

    for (const item of activeItems) {
      if (item.category) {
        const category = item.category.toLowerCase();
        categoryMap.set(category, (categoryMap.get(category) ?? 0) + 1);
      }
      if (item.colorFamily) {
        colorMap.set(item.colorFamily, (colorMap.get(item.colorFamily) ?? 0) + 1);
      }
      photoCount += item.photos.length;
      profileCount += item.profile ? 1 : 0;
      primaryPhotoCount += item.photos.some((photo) => photo.isPrimary) ? 1 : 0;
      deliverablePhotoCount += item.photos.some((photo) => photo.delivery) ? 1 : 0;
      pendingReanalyzeCount += item.profile?.raw.reanalyzePending === true ? 1 : 0;
      usableProfileCount += hasUsableStyleProfileEvidence(item.profile?.raw ?? null) ? 1 : 0;
      stylistDescriptorCount += hasStyleDescriptors(item.profile?.raw ?? null) ? 1 : 0;
    }

    const typedProfileCoverage = activeItems.length > 0 ? Number((profileCount / activeItems.length).toFixed(2)) : 0;
    const deliverablePhotoCoverage = activeItems.length > 0 ? Number((deliverablePhotoCount / activeItems.length).toFixed(2)) : 0;
    const usableProfileCoverage = activeItems.length > 0 ? Number((usableProfileCount / activeItems.length).toFixed(2)) : 0;
    const stylistDescriptorCoverage = activeItems.length > 0 ? Number((stylistDescriptorCount / activeItems.length).toFixed(2)) : 0;
    const activeItemIds = new Set(activeItems.map((item) => item.id));
    const evidenceGapCount = (await this.listEvidenceGaps({ priorityFilter: 'actionable' })).items
      .filter((gap) => activeItemIds.has(gap.itemId)).length;

    return {
      activeItemCount: activeItems.length,
      categoryBreakdown: [...categoryMap.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category)),
      deliverablePhotoCoverage,
      descriptorCoverage: stylistDescriptorCoverage,
      evidenceGapCount,
      colorBreakdown: [...colorMap.entries()]
        .map(([colorFamily, count]) => ({ colorFamily, count }))
        .sort((left, right) => right.count - left.count || left.colorFamily.localeCompare(right.colorFamily)),
      inactiveItemCount: inactiveItems.length,
      inactiveStatusBreakdown: [...inactiveStatusMap.entries()]
        .map(([status, count]) => ({ status: status as StyleItemRecord['status'], count }))
        .sort((left, right) => right.count - left.count || left.status.localeCompare(right.status)),
      itemCount: activeItems.length,
      onboardingMode: inferStyleOnboardingMode(activeItems.length),
      pendingReanalyzeCount,
      pendingReanalyzeItemIds: activeItems
        .filter((item) => item.profile?.raw.reanalyzePending === true)
        .map((item) => item.id)
        .slice(0, 3),
      photoCount,
      profile,
      profileCount,
      purchaseEvalReady: isStylePurchaseEvalReady(profile.raw, {
        itemCount: activeItems.length,
        itemProfileCount: profileCount,
        primaryPhotoCount,
      }),
      representativeItems: pickRepresentativeItems(activeItems),
      seededClosetPresent: activeItems.length > 0,
      stylistDescriptorCoverage,
      totalCategoryBreakdown: [...totalCategoryMap.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category)),
      totalColorBreakdown: [...totalColorMap.entries()]
        .map(([colorFamily, count]) => ({ colorFamily, count }))
        .sort((left, right) => right.count - left.count || left.colorFamily.localeCompare(right.colorFamily)),
      totalItemCount: items.length,
      typedProfileCoverage,
      usableProfileCoverage,
    };
  }

  async getOnboardingCalibration(): Promise<StyleOnboardingCalibrationRecord> {
    const [profile, items] = await Promise.all([this.getProfile(), this.listItems()]);
    const activeItemIds = items.filter((item) => item.status === 'active').map((item) => item.id);
    const provenanceByItemId = await this.getItemProvenanceBatch(activeItemIds);
    return buildStyleOnboardingCalibration({ profile, items, provenanceByItemId });
  }

  async recordCalibrationResponse(input: {
    itemWearStatuses?: Array<{
      itemId: string;
      note?: string | null;
      wearStatus: StyleItemWearStatus;
    }> | null;
    profilePatch?: unknown;
    signals?: Array<{
      confidence?: number | null;
      correctedValue?: string | null;
      kind: StyleCalibrationSignalKind;
      note?: string | null;
      source?: StyleInferenceSource;
      status?: StyleCalibrationSignalStatus;
      value: string;
    }> | null;
    provenance: MutationProvenance;
  }): Promise<StyleOnboardingCalibrationRecord> {
    const [before, items] = await Promise.all([this.getProfile(), this.listItems()]);
    const knownItemIds = new Set(items.map((item) => item.id));
    const unknownItemId = (input.itemWearStatuses ?? []).find((entry) => !knownItemIds.has(entry.itemId))?.itemId;
    if (unknownItemId) {
      throw new Error(`Unknown style item for calibration: ${unknownItemId}. Use a phrase-level rejected signal when no stable item match is available.`);
    }
    const profilePatch = normalizeStyleProfilePatch(input.profilePatch);
    const signalTimestamp = new Date().toISOString();
    const nextSignals = (input.signals ?? []).map((signal) =>
      normalizeCalibrationSignalForWrite({
        confidence: signal.confidence,
        correctedValue: signal.correctedValue,
        kind: signal.kind,
        note: signal.note,
        source: signal.source,
        status: signal.status,
        updatedAt: signalTimestamp,
        value: signal.value,
      }),
    );
    const durableSignals = isAcceptanceTestCalibrationWrite(input.provenance) ? [] : nextSignals;
    const calibrationSignals = mergeStyleCalibrationSignals(
      before.raw.calibrationSignals,
      durableSignals,
    );
    const itemCalibration = mergeStyleItemCalibration(
      before.raw.itemCalibration,
      (input.itemWearStatuses ?? []).map((entry) =>
        buildStyleItemCalibration({
          itemId: entry.itemId,
          note: entry.note,
          updatedAt: signalTimestamp,
          wearStatus: entry.wearStatus,
        }),
      ),
    );
    const inferredPracticalConfirmed = calibrationSignals.some(
      (signal) =>
        (signal.status === 'confirmed' || signal.status === 'corrected') &&
        signal.source === 'user_confirmed' &&
        ['budget', 'fit', 'hard_avoid', 'occasion'].includes(signal.kind),
    );
    const inferredTasteConfirmed = calibrationSignals.some(
      (signal) =>
        (signal.status === 'confirmed' || signal.status === 'corrected') &&
        signal.source === 'user_confirmed' &&
        ['aesthetic', 'color', 'formality', 'silhouette'].includes(signal.kind),
    );
    const beforeProvenanceByItemId = await this.getItemProvenanceBatch(
      items.filter((item) => item.status === 'active').map((item) => item.id),
    );
    const beforeCalibration = buildStyleOnboardingCalibration({
      profile: before,
      items,
      provenanceByItemId: beforeProvenanceByItemId,
    });
    const merged = projectStyleCalibrationSignalsToProfile(mergeStyleProfile(before.raw, {
      ...profilePatch,
      calibrationSignals,
      itemCalibration,
      practicalCalibrationConfirmed:
        profilePatch.practicalCalibrationConfirmed ?? (before.raw.practicalCalibrationConfirmed || inferredPracticalConfirmed),
      tasteCalibrationConfirmed:
        profilePatch.tasteCalibrationConfirmed ?? (before.raw.tasteCalibrationConfirmed || inferredTasteConfirmed),
    }));

    await this.repository.upsertProfile(JSON.stringify(merged));
    const after = await this.getProfile();
    const calibration = await this.getOnboardingCalibration();

    await this.recordDomainEvent({
      after: calibration,
      before: beforeCalibration,
      entityId: after.profileId,
      entityType: 'style_calibration',
      eventType: 'style.calibration_response_recorded',
      provenance: input.provenance,
    });
    return calibration;
  }

  async addStarterClosetItem(input: {
    item: unknown;
    photoUrl?: string | null;
    provenance: MutationProvenance;
    sourceSnapshot?: unknown;
  }): Promise<{ calibration: StyleOnboardingCalibrationRecord; item: StyleItemRecord }> {
    const normalizedItem = normalizeStyleItemInput(input.item);
    const starterEvidence = buildStarterClosetEvidence({
      item: normalizedItem,
      photoUrl: input.photoUrl,
      sourceSnapshot: input.sourceSnapshot,
    });
    const item = await this.upsertItem({
      item: {
        ...normalizedItem,
        field_evidence: mergeStarterFieldEvidence(normalizedItem.field_evidence ?? normalizedItem.fieldEvidence, starterEvidence.fieldEvidence),
        status: 'active',
      },
      provenance: input.provenance,
      sourceSnapshot: input.sourceSnapshot,
    });
    if (starterEvidence.hasProfileSignals) {
      const current = await this.getItem(item.id);
      await this.repository.upsertItemProfile({
        itemId: item.id,
        legacyProfileId: current?.profile?.legacyProfileId ?? null,
        method: 'starter_closet_description',
        rawJson: JSON.stringify(mergeStarterProfileSignals(current?.profile?.raw, starterEvidence.profileSignals)),
        source: 'style_starter_closet',
      });
    }
    const photoUrl = asNullableString(input.photoUrl);
    if (photoUrl) {
      await this.upsertItemPhotos({
        itemId: item.id,
        photos: [
          {
            id: `style-photo:${item.id}:starter-primary`,
            is_primary: true,
            kind: 'product',
            source_url: photoUrl,
            url: photoUrl,
            view: 'product',
          },
        ],
        provenance: input.provenance,
      });
    }
    const created = await this.getItem(item.id);
    if (!created) {
      throw new Error(`Style starter item ${item.id} could not be read back.`);
    }
    return {
      calibration: await this.getOnboardingCalibration(),
      item: created,
    };
  }

  async listItems(): Promise<StyleItemRecord[]> {
    const [itemRows, photoRows, profileRows, productRows] = await Promise.all([
      this.repository.listItemRows(),
      this.repository.listPhotoRows(),
      this.repository.listItemProfileRows(),
      this.repository.listProductReferences(),
    ]);

    const photoMap = new Map<string, StylePhotoRecord[]>();
    for (const row of photoRows) {
      const current = photoMap.get(row.item_id) ?? [];
      current.push(await this.mapPhotoRow(row));
      photoMap.set(row.item_id, current);
    }

    const profileMap = new Map<string, StyleItemProfileRecord>();
    for (const row of profileRows) {
      profileMap.set(row.item_id, {
        itemId: row.item_id,
        legacyProfileId: row.legacy_profile_id,
        method: row.method,
        raw: normalizeStyleItemProfile(row.raw_json),
        source: row.source,
        updatedAt: row.updated_at,
      });
    }

    const products = new Map(productRows.map(row => [row.item_id, {revision:row.revision,reference:JSON.parse(row.reference_json)}]));
    return itemRows.map((row) => canonicalizeStyleItemRecord({
      productReference: products.get(row.id) ?? {revision:0,reference:null},
      brand: row.brand,
      category: row.category,
      comparatorKey: normalizeStyleComparatorKey(row.comparator_key),
      colorFamily: row.color_family,
      colorHex: row.color_hex,
      colorName: row.color_name,
      createdAt: row.created_at,
      formality: asNullableNumber(row.formality),
      id: row.id,
      legacyItemId: row.legacy_item_id,
      name: row.name,
      photos: photoMap.get(row.id) ?? [],
      profile: profileMap.get(row.id) ?? null,
      size: row.size,
      status: normalizeStyleItemStatus(row.status),
      subcategory: row.subcategory,
      tenantId: row.tenant_id,
      updatedAt: row.updated_at,
    }));
  }

  async saveProductReference(itemId: string, input: import('./product-reference').ProductEnrichment) {
    const { productEnrichmentSchema } = await import('./product-reference');
    const parsed = productEnrichmentSchema.parse(input);
    const item = await this.repository.getItemRow(itemId);
    if (!item || item.status !== 'active') throw Error('Item no longer available.');
    const current = await this.repository.readProductReference(itemId);
    const json = JSON.stringify(parsed.reference);
    if (current?.operation_id === parsed.operation_id) {
      if (current.reference_json !== json) throw Error('Operation ID already used for different product information.');
      return { revision: current.revision, reference: parsed.reference };
    }
    if ((current?.revision ?? 0) !== parsed.expected_revision) throw Error('Product information changed. Read the item again before saving.');
    if (current) {
      const previous = JSON.parse(current.reference_json) as import('./product-reference').ProductReference;
      if (previous.status === 'confirmed' && parsed.reference.status === 'candidate') throw Error('An uncertain candidate cannot replace a confirmed product.');
      if (previous.status === 'rejected' && previous.product_url === parsed.reference.product_url && parsed.reference.status !== 'rejected' && parsed.reference.match_basis !== 'user_confirmed') throw Error('This product was rejected. Ask before matching it again.');
      const changedKnownFact = Object.entries(previous.facts).some(([key, fact]) => fact?.value !== parsed.reference.facts[key as keyof typeof previous.facts]?.value);
      const changedIdentity = previous.product_url !== parsed.reference.product_url || previous.brand !== parsed.reference.brand || previous.name !== parsed.reference.name || previous.product_code !== parsed.reference.product_code;
      if (previous.status === 'confirmed' && parsed.reference.match_basis !== 'user_confirmed' && (changedIdentity || changedKnownFact || parsed.reference.status !== 'confirmed')) throw Error('Confirm conflicting product information before replacing it.');
    }
    await this.repository.saveProductReference(itemId, parsed.expected_revision, parsed.operation_id, json);
    const saved = await this.repository.readProductReference(itemId);
    if (saved?.operation_id !== parsed.operation_id) throw Error('Product information changed again. Read the latest item.');
    return { revision: saved.revision, reference: parsed.reference };
  }

  async getItem(itemId: string): Promise<StyleItemRecord | null> {
    const row = await this.repository.getItemRow(itemId);
    if (!row) {
      return null;
    }

    const [photos, profile, product] = await Promise.all([
      this.repository.listPhotoRows(itemId),
      this.repository.getItemProfileRow(itemId),
      this.repository.readProductReference(itemId),
    ]);

    return canonicalizeStyleItemRecord({
      productReference: { revision: product?.revision ?? 0, reference: product ? JSON.parse(product.reference_json) : null },
      brand: row.brand,
      category: row.category,
      comparatorKey: normalizeStyleComparatorKey(row.comparator_key),
      colorFamily: row.color_family,
      colorHex: row.color_hex,
      colorName: row.color_name,
      createdAt: row.created_at,
      formality: asNullableNumber(row.formality),
      id: row.id,
      legacyItemId: row.legacy_item_id,
      name: row.name,
      photos: await Promise.all(photos.map((photo) => this.mapPhotoRow(photo))),
      profile: profile
        ? {
            itemId: profile.item_id,
            legacyProfileId: profile.legacy_profile_id,
            method: profile.method,
            raw: normalizeStyleItemProfile(profile.raw_json),
            source: profile.source,
            updatedAt: profile.updated_at,
          }
        : null,
      size: row.size,
      status: normalizeStyleItemStatus(row.status),
      subcategory: row.subcategory,
      tenantId: row.tenant_id,
      updatedAt: row.updated_at,
    });
  }

  async upsertItem(input: {
    expectedDuplicateMergeId?: string | null;
    item: unknown;
    provenance: MutationProvenance;
    sourceSnapshot?: unknown;
  }): Promise<StyleItemRecord> {
    const payload = normalizeStyleItemInput(input.item);
    const itemId = asNullableString(payload.id) ?? `style-item:${crypto.randomUUID()}`;
    // Public reads return a canonical presentation projection. Partial writes must merge against the
    // stored tuple so an unrelated edit cannot overwrite extracted provenance with display aliases.
    const storedBefore = await this.repository.getItemRow(itemId);
    const before = await this.getItem(itemId);
    const beforeProvenance = await this.getItemProvenance(itemId);
    const requestedStatus = normalizeStyleItemStatus(payload.status, normalizeStyleItemStatus(storedBefore?.status, 'active'));
    const duplicateMergeRedirect = asRecord(asRecord(beforeProvenance?.sourceSnapshot)?.duplicateMergeRedirect);
    const duplicateMergeTargetId = asNullableString(duplicateMergeRedirect?.targetItemId);
    const duplicateMergeId = asNullableString(duplicateMergeRedirect?.mergeId);
    const duplicateMergeUndoneAt = asNullableString(duplicateMergeRedirect?.undoneAt);
    if (storedBefore?.status === 'archived' && requestedStatus === 'active' && duplicateMergeTargetId && !duplicateMergeUndoneAt) {
      if (!duplicateMergeId && input.expectedDuplicateMergeId) {
        throw new Error('Style duplicate restore rejected a cycle identity for a legacy unbound merge.');
      }
      if (duplicateMergeId && input.expectedDuplicateMergeId !== duplicateMergeId) {
        throw new Error('Style duplicate restore rejected a stale merge cycle identity.');
      }
      const transferredPhotoIds = Array.isArray(duplicateMergeRedirect?.transferredPhotoIds)
        ? duplicateMergeRedirect.transferredPhotoIds
          .map((photoId) => asNullableString(photoId))
          .filter((photoId): photoId is string => Boolean(photoId))
        : [];
      const sourcePrimaryPhotoId = asNullableString(duplicateMergeRedirect?.sourcePrimaryPhotoId);
      const restored = await this.repository.restoreDuplicateMergedItem({
        mergeId: duplicateMergeId,
        sourceItemId: itemId,
        sourcePhotoIds: transferredPhotoIds,
        sourcePrimaryPhotoId,
        targetItemId: duplicateMergeTargetId,
      });
      if (
        restored.sourceStatus !== 'active'
        || restored.targetStatus !== 'active'
        || restored.restoredPhotoCount !== transferredPhotoIds.length
      ) {
        throw new Error(`Style duplicate restore did not produce the required canonical state: ${JSON.stringify(restored)}.`);
      }
    }
    const hasField = (primaryKey: string, aliasKey?: string) => primaryKey in payload || (aliasKey ? aliasKey in payload : false);
    const mergedString = (primaryKey: string, aliasKey: string | undefined, fallback: string | null) =>
      hasField(primaryKey, aliasKey) ? asNullableString(payload[primaryKey] ?? (aliasKey ? payload[aliasKey] : undefined)) : fallback;
    const mergedNumber = (primaryKey: string, aliasKey: string | undefined, fallback: number | null) =>
      hasField(primaryKey, aliasKey)
        ? asNullableNumber(payload[primaryKey] ?? (aliasKey ? payload[aliasKey] : undefined))
        : fallback;
    const comparatorKey = inferStyleComparatorKey({
      category: mergedString('category', undefined, storedBefore?.category ?? null),
      comparatorKey: payload.comparator_key ?? payload.comparatorKey,
      name: mergedString('name', undefined, storedBefore?.name ?? null),
      profile: before?.profile?.raw ?? null,
      subcategory: mergedString('subcategory', undefined, storedBefore?.subcategory ?? null),
      tags: before?.profile?.raw.tags ?? [],
    });

    await this.repository.upsertItem({
      brand: mergedString('brand', undefined, storedBefore?.brand ?? null),
      category: mergedString('category', undefined, storedBefore?.category ?? null),
      comparatorKey: comparatorKey === 'unknown' ? storedBefore?.comparator_key ?? 'unknown' : comparatorKey,
      colorFamily: mergedString('color_family', 'colorFamily', storedBefore?.color_family ?? null),
      colorHex: mergedString('color_hex', 'colorHex', storedBefore?.color_hex ?? null),
      colorName: mergedString('color_name', 'colorName', storedBefore?.color_name ?? null),
      formality: mergedNumber('formality', undefined, storedBefore?.formality ?? null),
      id: itemId,
      legacyItemId: mergedNumber('legacy_item_id', 'legacyItemId', storedBefore?.legacy_item_id ?? null),
      name: mergedString('name', undefined, storedBefore?.name ?? null),
      size: mergedString('size', undefined, storedBefore?.size ?? null),
      status: requestedStatus,
      subcategory: mergedString('subcategory', undefined, storedBefore?.subcategory ?? null),
    });

    const hasFieldEvidenceInput = hasField('field_evidence', 'fieldEvidence');
    const hasTechnicalMetadataInput = hasField('technical_metadata', 'technicalMetadata');
    const hasSourceSnapshotInput = Object.prototype.hasOwnProperty.call(input, 'sourceSnapshot');
    const nextFieldEvidence = hasFieldEvidenceInput
      ? parseJsonLike(payload.field_evidence ?? payload.fieldEvidence)
      : beforeProvenance?.fieldEvidence;
    const nextTechnicalMetadata = hasTechnicalMetadataInput
      ? parseJsonLike(payload.technical_metadata ?? payload.technicalMetadata)
      : beforeProvenance?.technicalMetadata;
    const requestedSourceSnapshot = hasSourceSnapshotInput ? parseJsonLike(input.sourceSnapshot) : undefined;
    const existingSourceSnapshotRecord = asRecord(parseJsonLike(beforeProvenance?.sourceSnapshot));
    const requestedSourceSnapshotRecord = asRecord(requestedSourceSnapshot);
    const nextSourceSnapshot = hasSourceSnapshotInput
      ? requestedSourceSnapshotRecord && existingSourceSnapshotRecord
        ? { ...existingSourceSnapshotRecord, ...requestedSourceSnapshotRecord }
        : requestedSourceSnapshot
      : beforeProvenance?.sourceSnapshot;
    const fieldEvidenceJson = stringifyJson(nextFieldEvidence);
    const technicalMetadataJson = stringifyJson(nextTechnicalMetadata);
    const sourceSnapshotJson = stringifyJson(nextSourceSnapshot);
    if (
      hasFieldEvidenceInput ||
      hasTechnicalMetadataInput ||
      hasSourceSnapshotInput ||
      fieldEvidenceJson !== null ||
      technicalMetadataJson !== null ||
      sourceSnapshotJson !== null
    ) {
      await this.repository.upsertProvenance({
        fieldEvidenceJson,
        itemId,
        sourceSnapshotJson,
        technicalMetadataJson,
      });
    }

    if (!before?.profile) {
      await this.repository.upsertItemProfile({
        itemId,
        legacyProfileId: null,
        method: 'heuristic_bootstrap',
        rawJson: JSON.stringify(
            deriveBaselineStyleItemProfile({
            category: mergedString('category', undefined, storedBefore?.category ?? null),
            comparatorKey: comparatorKey === 'unknown' ? storedBefore?.comparator_key ?? 'unknown' : comparatorKey,
            formality: mergedNumber('formality', undefined, storedBefore?.formality ?? null),
            name: mergedString('name', undefined, storedBefore?.name ?? null),
            subcategory: mergedString('subcategory', undefined, storedBefore?.subcategory ?? null),
          }),
        ),
        source: 'style_auto_bootstrap',
      });
    }

    const after = await this.getItem(itemId);
    if (!after) {
      throw new Error(`Style item ${itemId} could not be read back after upsert.`);
    }

    await this.recordDomainEvent({
      after: summarizeStyleItem(after),
      before: before ? summarizeStyleItem(before) : null,
      entityId: itemId,
      entityType: 'style_item',
      eventType: before ? 'style.item_updated' : 'style.item_created',
      provenance: input.provenance,
    });
    return after;
  }

  // Onboarding create path (tasks/closet-onboarding-design.md §3). A thin create-only front door over
  // upsertItem that adds what onboarding needs: server-side normalization (strict category, colorFamily,
  // styleRole — D3/D4/D6), CREATE-correct comparatorKey inference (upsertItem reads before?.profile which
  // is null on create — H2/R3), dedup-on-add, client_token idempotency (D13), the host-vision profile
  // (replacing the heuristic stub), and the review block. Rich metadata + the review flag ride in the
  // provenance columns because normalizeStyleItemProfile strips unknown keys from profile.raw (D2/R1).
  async createItem(input: {
    atomicCatalogMedia?: StyleAtomicCatalogMediaInput | null;
    item: unknown;
    profile?: unknown;
    technicalMetadata?: unknown;
    fieldEvidence?: unknown;
    overallConfidence?: number | null;
    hostModel?: string | null;
    hasImage?: boolean;
    onDuplicate?: 'warn' | 'force' | 'skip';
    duplicateCandidateId?: string | null;
    clientToken?: string | null;
    batchId?: string | null;
    provenance: MutationProvenance;
    sourceSnapshot?: unknown;
  }): Promise<{
    duplicateCandidates: StyleDuplicateCandidate[];
    idempotentReplay: boolean;
    item: StyleItemRecord | null;
    lowConfidenceFields: string[];
    normalizationNotes: string[];
    profileMethod: 'heuristic_bootstrap' | 'host_text' | 'host_vision';
    status: 'created' | 'duplicate_warning' | 'skipped_duplicate';
    supersededItemId: string | null;
  }> {
    const raw = normalizeStyleItemInput(input.item);
    const notes: string[] = [];

    const category = normalizeStyleCategoryStrict(raw.category);
    if (!category) {
      throw new Error(
        `fluent_add_closet_item: category ${JSON.stringify(asNullableString(raw.category))} is not canonical (expected one of TOP, BOTTOM, OUTERWEAR, SHOE, ACCESSORY, ONE_PIECE).`,
      );
    }
    const subcategory = normalizeStyleSubcategory(raw.subcategory);
    if (!subcategory) {
      throw new Error('fluent_add_closet_item: subcategory is required (a short garment type such as Tee, Jean, Sneaker).');
    }
    const brand = asNullableString(raw.brand);
    const name = asNullableString(raw.name);
    const size = asNullableString(raw.size);

    const rawColorFamily = asNullableString(raw.color_family ?? raw.colorFamily);
    const colorFamily = normalizeStyleColorFamily(rawColorFamily);
    if (rawColorFamily && !colorFamily) {
      notes.push(`colorFamily ${JSON.stringify(rawColorFamily)} is not canonical; preserved as colorName`);
    }
    const colorName = asNullableString(raw.color_name ?? raw.colorName) ?? (rawColorFamily && !colorFamily ? rawColorFamily : null);

    let colorHex = asNullableString(raw.color_hex ?? raw.colorHex);
    if (colorHex) {
      const hex = colorHex.startsWith('#') ? colorHex : `#${colorHex}`;
      colorHex = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toLowerCase() : null;
      if (!colorHex) notes.push('colorHex was not a valid #RRGGBB value; dropped');
    }

    const formalityRaw = asNullableNumber(raw.formality);
    const formality = formalityRaw === null ? null : Math.min(5, Math.max(1, Math.round(formalityRaw)));

    // Host profile (the 20 stored fields). Distinguish "host supplied a profile" from "omitted": when it
    // is omitted we must NOT overwrite upsertItem's heuristic bootstrap with an empty host profile
    // (design §3 step 9). styleRole is snapped to the wardrobe-job vocabulary.
    const hostProfileRecord = asRecord(parseJsonLike(input.profile));
    const hasHostProfile = hostProfileRecord !== null && Object.keys(hostProfileRecord).length > 0;
    const profileDoc = normalizeStyleItemProfile(input.profile ?? {});
    if (profileDoc.styleRole) {
      const snapped = normalizeStyleRole(profileDoc.styleRole);
      if (snapped !== profileDoc.styleRole) {
        notes.push(`styleRole ${JSON.stringify(profileDoc.styleRole)} normalized to ${JSON.stringify(snapped)}`);
      }
      profileDoc.styleRole = snapped;
    }

    // CREATE-correct comparatorKey: infer from category/subcategory + the host's profile signals
    // (itemType/tags), but WITHOUT the host's comparator_key hint — a wrong hint must not be able to save
    // a jean as a polo (D8). The hint is advisory: used only to break a tie that inference leaves 'unknown'.
    let comparatorKey = inferStyleComparatorKey({
      category,
      name,
      profile: { itemType: profileDoc.itemType, styleRole: profileDoc.styleRole, tags: profileDoc.tags },
      subcategory,
      tags: profileDoc.tags,
    });
    if (comparatorKey === 'unknown') {
      const hint = normalizeStyleComparatorKey(raw.comparator_key ?? raw.comparatorKey);
      if (hint !== 'unknown') {
        comparatorKey = hint;
      }
    }

    // Provenance honesty (GAP-4/R9): with no image delivered, a host_vision claim is impossible.
    const hasImage = input.hasImage === true;
    const fieldEvidence = downgradeOnboardingFieldEvidence(input.fieldEvidence, hasImage);
    const hasFieldEvidence = fieldEvidence !== null && Object.keys(fieldEvidence).length > 0;
    const profileMethod: 'heuristic_bootstrap' | 'host_text' | 'host_vision' = !hasHostProfile
      ? 'heuristic_bootstrap'
      : hasImage
        ? 'host_vision'
        : 'host_text';
    const lowConfidenceFields = computeLowConfidenceOnboardingFields(fieldEvidence, 0.6);
    // Flag for review when a field is low-confidence, OR overall confidence is low, OR the item is thin
    // (no host profile and no evidence) — a bare create must not look review-clean (Codex review).
    const overallConfidence = typeof input.overallConfidence === 'number' ? input.overallConfidence : null;
    const needsReview =
      lowConfidenceFields.length > 0 ||
      (overallConfidence !== null && overallConfidence < 0.6) ||
      (!hasHostProfile && !hasFieldEvidence);

    const batchId = input.batchId?.trim() || null;

    // Idempotency (D13) FIRST, before dedup: a client_token maps to a deterministic id (hash of the EXACT
    // token — collision-safe, unlike sanitize+truncate), so a retried create returns the SAME row rather
    // than minting a new uuid or being flagged as a duplicate of itself.
    const clientTokenHash = input.clientToken ? await hashClientToken(input.clientToken) : null;
    const itemId = clientTokenHash
      ? `style-item:ct:${clientTokenHash}`
      : `style-item:${crypto.randomUUID()}`;
    const existingClientTokenItem = input.clientToken ? await this.getItem(itemId) : null;
    const correctingExistingDuplicate = Boolean(
      existingClientTokenItem
      && input.onDuplicate === 'skip'
      && input.duplicateCandidateId
      && input.duplicateCandidateId !== existingClientTokenItem.id,
    );
    if (existingClientTokenItem?.status === 'active' && !correctingExistingDuplicate) {
      const replayProvenance = await this.getItemProvenance(existingClientTokenItem.id);
      const replayReview = asRecord(asRecord(replayProvenance?.technicalMetadata)?.review);
      const replayDuplicateCandidates = Array.isArray(replayReview?.possibleDuplicateCandidates)
        ? replayReview.possibleDuplicateCandidates.flatMap((candidate): StyleDuplicateCandidate[] => {
            const record = asRecord(candidate);
            const signals = asRecord(record?.signals);
            if (!record || !signals || typeof record.id !== 'string' || typeof record.reason !== 'string' || typeof record.score !== 'number') {
              return [];
            }
            return [{
              id: record.id,
              name: typeof record.name === 'string' ? record.name : null,
              reason: record.reason,
              score: record.score,
              signals: signals as StyleDuplicateCandidateSignals,
            }];
          })
        : [];
      return { duplicateCandidates: replayDuplicateCandidates, idempotentReplay: true, item: existingClientTokenItem, lowConfidenceFields, normalizationNotes: notes, profileMethod, status: 'created', supersededItemId: null };
    }
    if (existingClientTokenItem?.status === 'archived') {
      const redirect = await this.resolveDuplicateMergeRedirect(existingClientTokenItem.id);
      if (redirect?.item?.status === 'active') {
        return {
          duplicateCandidates: [],
          idempotentReplay: true,
          item: redirect.item,
          lowConfidenceFields,
          normalizationNotes: notes,
          profileMethod,
          status: 'skipped_duplicate',
          supersededItemId: existingClientTokenItem.id,
        };
      }
      if (redirect) {
        throw new Error(`Style item ${existingClientTokenItem.id} was merged and its canonical closet item is unavailable.`);
      }
    }
    if (clientTokenHash && !existingClientTokenItem) {
      const duplicateReplayItem = await this.resolveDuplicateCreateIdempotency(clientTokenHash);
      if (duplicateReplayItem) {
        return {
          duplicateCandidates: [{
            id: duplicateReplayItem.id,
            name: duplicateReplayItem.name,
            reason: 'previous client_token resolved to this existing closet item',
            score: 1,
            signals: {
              brand: duplicateReplayItem.brand ?? undefined,
              colorFamily: duplicateReplayItem.colorFamily ?? undefined,
              colorName: duplicateReplayItem.colorName ?? undefined,
              size: duplicateReplayItem.size ?? undefined,
              subcategory: duplicateReplayItem.subcategory ?? undefined,
            },
          }],
          idempotentReplay: true,
          item: duplicateReplayItem,
          lowConfidenceFields,
          normalizationNotes: notes,
          profileMethod,
          status: 'skipped_duplicate',
          supersededItemId: null,
        };
      }
    }

    // Dedup-on-add: warn (default) writes nothing. A resolution must name the candidate it resolves;
    // silently choosing the top score loses user intent whenever more than one similar item exists.
    const duplicateCandidates = (await this.findStyleItemDuplicates({ brand, colorFamily: colorFamily ?? colorName, comparatorKey, name }))
      .filter((candidate) => candidate.id !== existingClientTokenItem?.id);
    const onDuplicate = input.onDuplicate ?? 'warn';
    const duplicateCandidateId = asNullableString(input.duplicateCandidateId);
    const selectedDuplicate = duplicateCandidateId
      ? duplicateCandidates.find((candidate) => candidate.id === duplicateCandidateId) ?? null
      : null;
    if (onDuplicate !== 'warn' && !selectedDuplicate) {
      throw new Error('fluent_add_closet_item duplicate resolution requires duplicate_candidate_id matching a returned candidate.');
    }
    if (duplicateCandidates.length > 0 && onDuplicate !== 'force') {
      const matchedItem = onDuplicate === 'skip' && selectedDuplicate
        ? await this.getItem(selectedDuplicate.id)
        : null;
      // Resolution becomes durable only with the successful Catalog/source photo
      // transaction. Returning the intent here prevents a failed attachment from
      // partially rewriting the canonical item or archiving an earlier token row.
      return {
        duplicateCandidates,
        idempotentReplay: false,
        item: matchedItem,
        lowConfidenceFields,
        normalizationNotes: notes,
        profileMethod,
        status: onDuplicate === 'skip' ? 'skipped_duplicate' : 'duplicate_warning',
        supersededItemId: matchedItem && existingClientTokenItem && existingClientTokenItem.id !== matchedItem.id
          ? existingClientTokenItem.id
          : null,
      };
    }

    // Review block + technical metadata -> provenance columns (profile.raw strips unknown keys, D2).
    const technicalMetadata = {
      ...(asRecord(parseJsonLike(input.technicalMetadata)) ?? {}),
      ...(selectedDuplicate ? {
        duplicateResolution: {
          batchId,
          candidateId: selectedDuplicate.id,
          clientToken: input.clientToken ?? null,
          decision: 'keep_both',
          reason: selectedDuplicate.reason,
          resolvedAt: new Date().toISOString(),
        },
      } : {}),
      review: {
        batchId,
        clientToken: input.clientToken ?? null,
        hostModel: input.hostModel ?? null,
        lowConfidenceFields,
        needsReview,
        onboardingSource: profileMethod,
        overallConfidence,
      },
    };

    const onboardingSourceSnapshot = {
      ...(asRecord(parseJsonLike(input.sourceSnapshot)) ?? {}),
      createdVia: 'fluent_add_closet_item',
      hostModel: input.hostModel ?? null,
      onboardingSource: profileMethod,
      source: hasImage ? 'host_vision' : 'host_text',
      ...(selectedDuplicate ? {
        distinguishedFrom: selectedDuplicate.id,
        duplicateDecision: 'keep_both',
      } : {}),
    };
    if (input.atomicCatalogMedia) {
      const created = await this.createItemWithAtomicCatalogMedia({
        fieldEvidence,
        hasHostProfile,
        item: {
          brand,
          category,
          colorFamily,
          colorHex,
          colorName,
          comparatorKey,
          formality,
          id: itemId,
          name,
          size,
          subcategory,
        },
        media: input.atomicCatalogMedia,
        profile: profileDoc,
        profileMethod,
        provenance: input.provenance,
        sourceSnapshot: onboardingSourceSnapshot,
        technicalMetadata,
      });
      return {
        duplicateCandidates: selectedDuplicate ? [selectedDuplicate] : [],
        idempotentReplay: false,
        item: created,
        lowConfidenceFields,
        normalizationNotes: notes,
        profileMethod,
        status: 'created',
        supersededItemId: null,
      };
    }

    const created = await this.upsertItem({
      item: {
        brand,
        category,
        color_family: colorFamily,
        color_hex: colorHex,
        color_name: colorName,
        comparator_key: comparatorKey,
        field_evidence: fieldEvidence,
        formality,
        id: itemId,
        name,
        size,
        status: 'active',
        subcategory,
        technical_metadata: technicalMetadata,
      },
      provenance: input.provenance,
      sourceSnapshot: onboardingSourceSnapshot,
    });

    // Replace upsertItem's heuristic bootstrap with the host understanding ONLY when the host supplied a
    // profile; otherwise the bootstrap stands (design §3 step 9 — never overwrite it with an empty doc).
    if (hasHostProfile) {
      await this.upsertItemProfile({
        fieldEvidence,
        hasImage,
        itemId: created.id,
        method: hasImage ? 'host_vision' : 'host_text',
        profile: profileDoc,
        provenance: input.provenance,
        source: 'style_host_onboarding',
      });
    }

    return {
      duplicateCandidates: selectedDuplicate ? [selectedDuplicate] : [],
      idempotentReplay: false,
      item: await this.getItem(created.id),
      lowConfidenceFields,
      normalizationNotes: notes,
      profileMethod,
      status: 'created',
      supersededItemId: null,
    };
  }

  // Dedup-on-add scoring: same comparatorKey 0.5 + same brand 0.3 + same color 0.15 + a shared MEANINGFUL
  // name token 0.05. Strong candidates score >= 0.7. When either side lacks a brand, same type+color at
  // 0.65 is deliberately surfaced as a weaker candidate for host inspection instead of silently creating
  // a likely camera-roll duplicate. Two explicit disagreeing brands never enter this weaker lane. Generic
  // garment/cut/color words remain stop-worded out of the name signal. Returns up to 5, highest first.
  async findStyleItemDuplicates(draft: {
    brand: string | null;
    colorFamily: string | null;
    comparatorKey: string;
    name: string | null;
  }): Promise<StyleDuplicateCandidate[]> {
    const norm = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();
    // Tokenize a name to lowercased, PUNCTUATION-STRIPPED tokens so hyphenated/punctuated generic words
    // ("t-shirt" -> "tshirt") get caught by the stop-word lookup instead of slipping through as
    // "meaningful" (Codex review). A token is meaningful only if > 2 chars and not a generic
    // garment-type/cut/color word (color scores on its own axis, so color words must not double-count).
    const tokenize = (value: string | null | undefined) => norm(value).split(/\s+/).map((token) => token.replace(/[^a-z0-9]+/g, '')).filter(Boolean);
    // Brand match key: punctuation/connector-insensitive so spelling variants are the SAME brand
    // ("A.P.C."=="APC", "Rag & Bone"=="Rag and Bone", "Levi's"=="Levis") for both the brand axis and the
    // brand-conflict gate — otherwise a re-add with a differently-spelled brand wrongly slips (Codex review).
    const brandKey = (value: string | null | undefined) => norm(value).replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
    const isMeaningfulNameToken = (token: string) => token.length > 2 && !STYLE_GENERIC_NAME_TOKENS.has(token);
    // Canonical name key for the exact-name fallback: crudely singularize each token and order-insensitively
    // join, so trivial variants ("Black Performance Short" vs "…Shorts") of an all-generic name still match.
    const canonicalNameKey = (value: string | null | undefined) => tokenize(value)
      .map((token) => (token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token))
      .sort()
      .join(' ');
    const draftNameTokens = new Set(tokenize(draft.name).filter(isMeaningfulNameToken));
    const candidates: StyleDuplicateCandidate[] = [];
    const trimmedOrNull = (value: unknown): string | null =>
      typeof value === 'string' && value.trim() ? value.trim() : null;
    for (const item of await this.listItems()) {
      if (item.status !== 'active') continue;
      let score = 0;
      const reasons: string[] = [];
      if (draft.comparatorKey !== 'unknown' && item.comparatorKey === draft.comparatorKey) {
        score += 0.5;
        reasons.push('same type');
      }
      const draftBrandKey = brandKey(draft.brand);
      const itemBrandKey = brandKey(item.brand);
      let brandAxisMatched = false;
      if (draftBrandKey && draftBrandKey === itemBrandKey) {
        score += 0.3;
        reasons.push('same brand');
        brandAxisMatched = true;
      }
      if (draft.colorFamily && norm(item.colorFamily ?? item.colorName) === norm(draft.colorFamily)) {
        score += 0.15;
        reasons.push('same color');
      }
      // The whole NAME signal (token overlap + exact-name) is gated on brand compatibility: if BOTH sides
      // carry explicit brand fields that DISAGREE, the name can't contribute — different brands are
      // different items, even when type/color/(generic) name coincide. This kills the brand-mismatch
      // false-positive class (e.g. Nike "Short" vs Adidas "Shorts"; "Red Wing" vs "Wing + Horns") in one
      // rule; the host can still force-add if they truly are the same. (Codex review.)
      const brandsConflict = Boolean(itemBrandKey && draftBrandKey && itemBrandKey !== draftBrandKey);
      const itemMatchTokens = new Set(tokenize(item.name));
      const draftMatchTokens = new Set(draftNameTokens);
      // Asymmetric brand recovery: when exactly one side carries a brand FIELD (the other has the brand in
      // its NAME), fold that brand's MEANINGFUL tokens into the name match so e.g. existing "Nike" +
      // "SB Chino Short" vs draft "Nike SB Chino Short" (no brand field) is still caught.
      if (!brandAxisMatched && (!itemBrandKey || !draftBrandKey)) {
        for (const brandToken of tokenize(item.brand)) {
          if (isMeaningfulNameToken(brandToken)) itemMatchTokens.add(brandToken);
        }
        for (const brandToken of tokenize(draft.brand)) {
          if (isMeaningfulNameToken(brandToken)) draftMatchTokens.add(brandToken);
        }
      }
      // An IDENTICAL canonical name (punctuation/plural-insensitive) is a name signal even when every token
      // is generic, so re-adding the exact same all-generic-named item still warns.
      const draftCanonicalName = canonicalNameKey(draft.name);
      const exactNameMatch = draftCanonicalName.length > 0 && draftCanonicalName === canonicalNameKey(item.name);
      const meaningfulNameOverlap = draftMatchTokens.size > 0 && [...draftMatchTokens].some((token) => itemMatchTokens.has(token));
      if (!brandsConflict && (exactNameMatch || meaningfulNameOverlap)) {
        score += 0.05;
        reasons.push(exactNameMatch ? 'same name' : 'name overlap');
      }
      const missingBrandEvidence = !draftBrandKey || !itemBrandKey;
      if (score >= 0.7 || (!brandsConflict && missingBrandEvidence && score >= 0.65)) {
        const raw = item.profile?.raw;
        const signals: StyleDuplicateCandidateSignals = {};
        const brand = trimmedOrNull(item.brand);
        if (brand) signals.brand = brand;
        const colorFamily = trimmedOrNull(item.colorFamily);
        if (colorFamily) signals.colorFamily = colorFamily;
        const colorName = trimmedOrNull(item.colorName);
        if (colorName) signals.colorName = colorName;
        const itemType = trimmedOrNull(raw?.itemType);
        if (itemType) signals.itemType = itemType;
        const size = trimmedOrNull(item.size);
        if (size) signals.size = size;
        const styleRole = trimmedOrNull(raw?.styleRole);
        if (styleRole) signals.styleRole = styleRole;
        const subcategory = trimmedOrNull(item.subcategory);
        if (subcategory) signals.subcategory = subcategory;
        const tags = Array.isArray(raw?.tags)
          ? raw.tags.map((tag) => trimmedOrNull(tag)).filter((tag): tag is string => tag !== null).slice(0, 6)
          : [];
        if (tags.length) signals.tags = tags;
        candidates.push({ id: item.id, name: item.name, reason: reasons.join(', '), score: Math.round(score * 100) / 100, signals });
      }
    }
    return candidates.sort((left, right) => right.score - left.score).slice(0, 5);
  }

  async archiveItem(input: {
    itemId?: string | null;
    itemName?: string | null;
    provenance: MutationProvenance;
    sourceSnapshot?: unknown;
  }): Promise<StyleArchiveItemResult> {
    const requestedItemId = asNullableString(input.itemId);
    const requestedName = asNullableString(input.itemName);
    if (!requestedItemId && !requestedName) {
      throw new Error('style_archive_item requires item_id or item_name.');
    }

    const beforeItems = await this.listItems();
    const nameKey = normalizeStyleArchiveMatchName(requestedName);
    const exactNameMatches = nameKey
      ? beforeItems.filter((item) => normalizeStyleArchiveMatchName(item.name) === nameKey)
      : [];
    const matchedItems = requestedItemId
      ? beforeItems.filter((item) => item.id === requestedItemId)
      : exactNameMatches;
    const activeExactMatchesBefore = matchedItems.filter((item) => item.status === 'active');

    if (matchedItems.length === 0) {
      return {
        activeExactMatchesAfter: [],
        activeExactMatchesBefore: [],
        archivedItemIds: [],
        archivedItems: [],
        matchedItems: rankStyleArchiveNameCandidates(beforeItems, requestedName).map((item) => summarizeStyleItem(item) as StyleItemSummaryRecord),
        notes: [
          requestedItemId
            ? `No Style closet item found with id ${requestedItemId}.`
            : `No exact Style closet item name match found for ${requestedName}.`,
        ],
        requestedItemId,
        requestedName,
        status: 'not_found',
        verifiedNoActiveExactMatch: false,
      };
    }

    if (!requestedItemId && activeExactMatchesBefore.length > 1) {
      return {
        activeExactMatchesAfter: activeExactMatchesBefore.map((item) => summarizeStyleItem(item) as StyleItemSummaryRecord),
        activeExactMatchesBefore: activeExactMatchesBefore.map((item) => summarizeStyleItem(item) as StyleItemSummaryRecord),
        archivedItemIds: [],
        archivedItems: [],
        matchedItems: matchedItems.map((item) => summarizeStyleItem(item) as StyleItemSummaryRecord),
        notes: ['Multiple active exact-name matches found; provide item_id before archiving. No items were changed.'],
        requestedItemId,
        requestedName,
        status: 'needs_disambiguation',
        verifiedNoActiveExactMatch: false,
      };
    }

    const archivedItems: StyleItemRecord[] = [];
    for (const item of activeExactMatchesBefore) {
      archivedItems.push(
        await this.upsertItem({
          item: {
            id: item.id,
            status: 'archived',
          },
          provenance: input.provenance,
          ...(input.sourceSnapshot !== undefined ? { sourceSnapshot: input.sourceSnapshot } : {}),
        }),
      );
    }

    const afterItems = await this.listItems();
    const activeExactMatchesAfter = requestedItemId
      ? afterItems.filter((item) => item.id === requestedItemId && item.status === 'active')
      : afterItems.filter((item) => normalizeStyleArchiveMatchName(item.name) === nameKey && item.status === 'active');
    const status =
      archivedItems.length > 0
        ? 'archived'
        : matchedItems.every((item) => item.status !== 'active')
          ? 'already_archived'
          : 'needs_disambiguation';

    return {
      activeExactMatchesAfter: activeExactMatchesAfter.map((item) => summarizeStyleItem(item) as StyleItemSummaryRecord),
      activeExactMatchesBefore: activeExactMatchesBefore.map((item) => summarizeStyleItem(item) as StyleItemSummaryRecord),
      archivedItemIds: archivedItems.map((item) => item.id),
      archivedItems: archivedItems.map((item) => summarizeStyleItem(item) as StyleItemSummaryRecord),
      matchedItems: matchedItems.map((item) => summarizeStyleItem(item) as StyleItemSummaryRecord),
      notes:
        activeExactMatchesAfter.length === 0
          ? ['Read-after-write verification found no active exact match for the requested item.']
          : ['Read-after-write verification still found active exact matches; use item_id to disambiguate.'],
      requestedItemId,
      requestedName,
      status,
      verifiedNoActiveExactMatch: activeExactMatchesAfter.length === 0,
    };
  }

  async getPhotoLibrary(itemId:string) {
    const item=await this.getItem(itemId);
    if(!item)throw Error('Item no longer available.');
    const stored=await this.repository.readPhotoLibrary(itemId);
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([stored.revision,stored.fingerprint])));
    const revision=Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
    return {...stored,revisionNumber:stored.revision,revision,state:reconcilePhotoLibrary(stored.state as PhotoLibraryState,stored.fingerprint)};
  }

  async managePhotoLibrary(input:{itemId:string;expectedRevision:string;operationId:string;action:PhotoLibraryAction;provenance:MutationProvenance}) {
    const item=await this.getItem(input.itemId);
    if(!item||item.status!=='active')throw Error('Item no longer available.');
    const current=await this.getPhotoLibrary(input.itemId);
    const actionJson=JSON.stringify(input.action);
    if(current.state.operationId===input.operationId){
      if(current.state.actionJson!==actionJson)throw Error('This operation ID was already used for a different change.');
      return {revision:current.revision,undoToken:current.state.undo?.token??null,state:{hidden:current.state.hidden,order:current.state.order,coverId:current.state.coverId}};
    }
    if(current.revision!==input.expectedRevision)throw Error('Photos changed. Refresh this item before saving.');
    const before={hidden:current.state.hidden,order:current.state.order,hiddenVersions:current.state.hiddenVersions,...(current.state.coverId!==undefined?{coverId:current.state.coverId}:{})};
    let next;
    if(input.action.type==='undo'){
      if(!current.state.undo||current.state.undo.token!==input.action.token||current.state.undo.fingerprint!==current.fingerprint)throw Error('This Undo is no longer available.');
      next=current.state.undo.before;
    }else{
      const provenance=await this.getItemProvenance(input.itemId);
      const quality=asRecord(asRecord(provenance?.sourceSnapshot)?.catalogNormalizationQuality);
      const approved=findApprovedStyleCatalogPhoto(item,provenance);
      const defaultCover=approved?.id??item.photos.find(p=>p.isPrimary&&!isStyleFitPhoto(p)&&p.source!=='generated_metadata')?.id??item.photos.find(p=>!isStyleFitPhoto(p)&&p.source!=='generated_metadata')?.id??item.photos.find(p=>isStyleFitPhoto(p)&&p.source!=='generated_metadata')?.id??null;
      const sourceId=asNullableString(quality?.sourcePhotoId);
      const catalogId=approved?.id??null;
      const candidates=item.photos.filter(p=>(p.source!=='generated_metadata'||p.id===catalogId)&&!(sourceId===p.id&&sourceId!==catalogId&&catalogId&&item.photos.some(c=>c.id===catalogId)&&!before.hidden.includes(catalogId)));
      next=changePhotoArrangement(before,candidates,input.action,defaultCover);
      if((input.action.type==='remove'||input.action.type==='replace')&&input.action.photoId===catalogId&&sourceId)next.hidden=[...new Set([...next.hidden,sourceId])];
    }
    const versions=photoVersions(current.fingerprint);
    next.hiddenVersions=Object.fromEntries(next.hidden.map(id=>[id,versions[id]]));
    const state:PhotoLibraryState={...next,operationId:input.operationId,actionJson,...(input.action.type==='undo'?{}:{undo:{token:crypto.randomUUID(),fingerprint:current.fingerprint,before}})};
    await this.repository.savePhotoLibrary(input.itemId,current.revisionNumber,current.fingerprint,state);
    const after=await this.getPhotoLibrary(input.itemId);
    if(after.state.operationId!==input.operationId)throw Error('Photos changed again. Refresh to see the latest state.');
    return {revision:after.revision,undoToken:after.state.undo?.token??null,state:{hidden:after.state.hidden,order:after.state.order,coverId:after.state.coverId}};
  }

  async upsertItemPhotos(input: {
    catalogQualityReview?: StyleCatalogQualityReviewInput | null;
    duplicateResolution?: {
      batchId?: string | null;
      candidateId: string;
      clientToken?: string | null;
      decision: 'use_existing';
    } | null;
    itemId: string;
    photos: unknown;
    preserveExistingPhotoIds?: string[];
    /** The photo ids the caller's new set was built from; the write commits only if unchanged. */
    expectedCurrentPhotoIds?: string[] | null;
    provenance: MutationProvenance;
    sourceSnapshot?: unknown;
  }): Promise<StylePhotoRecord[]> {
    const before = await this.getItem(input.itemId);
    if (!before) {
      throw new Error(`Unknown style item: ${input.itemId}`);
    }
    const beforeProvenance = await this.getItemProvenance(input.itemId);
    const qualityReview = input.catalogQualityReview ?? null;
    let retainedSourceSha256: string | null = null;
    let retainedSourceArtifactId: string | null = null;
    if (qualityReview?.catalogMode === 'host_generated') {
      const sourcePhotoId = asNullableString(qualityReview.sourcePhotoId);
      const sourcePhoto = sourcePhotoId ? before.photos.find((photo) => photo.id === sourcePhotoId) ?? null : null;
      if (sourcePhoto) {
        if (
          sourcePhoto.source === 'generated_metadata'
          || sourcePhoto.importedFrom === 'fluent_style_host_generated'
          || sourcePhoto.artifactAvailable !== true
          || !sourcePhoto.artifactId
        ) {
          throw new Error('Catalog-ready host-generated media requires one exact retained, owned, non-generated source_photo_id for this item.');
        }
        retainedSourceArtifactId = sourcePhoto.artifactId;
        retainedSourceSha256 = await this.hashOwnedPhotoBytes(sourcePhoto);
      }
    }

    const expectedCurrentPhotoIds = input.expectedCurrentPhotoIds ?? null;
    // Bracket the row read with full-tuple fingerprints so the guarded write below is bound to the
    // exact rows this call read (a concurrent change in between is a conflict, not stale data).
    const photoSetFingerprint = expectedCurrentPhotoIds ? await this.repository.photoSetFingerprint(input.itemId) : null;
    const previousPhotoRows = await this.repository.listPhotoRows(input.itemId);
    if (photoSetFingerprint !== null && await this.repository.photoSetFingerprint(input.itemId) !== photoSetFingerprint) {
      throw new StylePhotoSetConflictError(input.itemId);
    }
    const previousPhotoRowsById = new Map(previousPhotoRows.map((photo) => [photo.id, photo]));
    const photoSetMatchesExpected = (ids: string[]) =>
      expectedCurrentPhotoIds !== null
      && [...ids].sort().join(String.fromCharCode(31)) === [...expectedCurrentPhotoIds].sort().join(String.fromCharCode(31));
    if (expectedCurrentPhotoIds && !photoSetMatchesExpected(previousPhotoRows.map((photo) => photo.id))) {
      throw new StylePhotoSetConflictError(input.itemId);
    }
    const normalizedPhotos = normalizePhotoInput(input.photos);
    const preserveExistingPhotoIds = new Set(input.preserveExistingPhotoIds ?? []);
    if (preserveExistingPhotoIds.size !== (input.preserveExistingPhotoIds?.length ?? 0)) {
      throw new Error('Style photo preservation IDs must be unique.');
    }
    const incomingPhotoIds = new Set(normalizedPhotos.map((photo, index) =>
      asNullableString(photo.id) ?? `style-photo:${input.itemId}:${index + 1}`,
    ));
    for (const photoId of preserveExistingPhotoIds) {
      if (!previousPhotoRowsById.has(photoId) || !incomingPhotoIds.has(photoId)) {
        throw new Error(`Cannot preserve missing Style photo tuple: ${photoId}.`);
      }
    }
    const generatedCatalogId = `style-photo:${input.itemId}:catalog`;
    const incomingCatalog = normalizedPhotos.find((photo) => asNullableString(photo.id) === generatedCatalogId);
    const previousCatalog = previousPhotoRowsById.get(generatedCatalogId);
    if (incomingCatalog && !isIncomingGeneratedCatalogPhotoTuple(incomingCatalog)) {
      throw new Error('Generated Catalog photo ID is reserved for fully classified presentation media.');
    }
    if (previousCatalog && !isPersistedGeneratedCatalogPhotoTuple(previousCatalog)) {
      throw new Error('Generated Catalog photo ID collides with non-Catalog evidence.');
    }
    const previousArtifacts = await this.repository.listItemPhotoArtifacts(input.itemId);
    const previousArtifactsById = new Map(previousArtifacts.map((artifact) => [artifact.id, artifact]));
    if (previousArtifacts.length > 0 && !this.options.artifacts?.delete) {
      throw new Error('Style photo replacement requires artifact deletion support for previously owned media.');
    }

    const createdArtifacts: Array<{ id: string; r2_key: string }> = [];
    let committed = false;
    try {
      const photos: Parameters<StyleRepository['replaceItemPhotos']>[1] = [];
      let catalogSha256: string | null = null;
      for (const [index, photo] of normalizedPhotos.entries()) {
        const photoId = asNullableString(photo.id) ?? `style-photo:${input.itemId}:${index + 1}`;
        if (preserveExistingPhotoIds.has(photoId)) {
          const previousPhoto = previousPhotoRowsById.get(photoId);
          if (!previousPhoto) {
            throw new Error(`Cannot preserve missing Style photo tuple: ${photoId}.`);
          }
          photos.push({
            artifactId: previousPhoto.artifact_id,
            bgRemoved: asBoolean(previousPhoto.bg_removed),
            capturedAt: previousPhoto.captured_at,
            createdAt: previousPhoto.created_at,
            id: previousPhoto.id,
            importedFrom: previousPhoto.imported_from,
            isFit: asBoolean(previousPhoto.is_fit),
            isPrimary: asBoolean(photo.is_primary ?? photo.isPrimary),
            kind: previousPhoto.kind,
            legacyPhotoId: previousPhoto.legacy_photo_id,
            mimeType: previousPhoto.mime_type,
            source: previousPhoto.source,
            sourceUrl: previousPhoto.source_url,
            url: previousPhoto.url,
            view: previousPhoto.view,
          });
          continue;
        }
        const existingArtifactId = asNullableString(photo.artifact_id ?? photo.artifactId);
        const existingArtifact = existingArtifactId ? previousArtifactsById.get(existingArtifactId) ?? null : null;
        const explicitSourceUrl = asNullableString(photo.source_url ?? photo.sourceUrl);
        const rawSourceUrl = explicitSourceUrl ?? (existingArtifact ? null : asNullableString(photo.url));
        // A data: URL is never a reference: validate it as image bytes and ingest it into owned
        // artifact storage, so no data URL (or app-internal handle) lands in the url column.
        const sourceDataUrl = rawSourceUrl && /^data:/i.test(rawSourceUrl) ? rawSourceUrl : null;
        if (sourceDataUrl) assertStyleImageDataUrl(sourceDataUrl);
        const inlineDataUrl = asNullableString(photo.data_url ?? photo.dataUrl) ?? sourceDataUrl;
        if (inlineDataUrl) assertStyleImageDataUrl(inlineDataUrl);
        const sourceUrl = sourceDataUrl ? null : rawSourceUrl;
        const hasInlineImage = Boolean(
          asNullableString(photo.data_base64 ?? photo.dataBase64 ?? photo.base64) ||
          inlineDataUrl,
        );
        const hostedFileDownloadUrl = asNullableString(
          photo.hosted_file_download_url ?? photo.hostedFileDownloadUrl,
        );
        if (hasInlineImage && hostedFileDownloadUrl) {
          throw new Error('Style photo input cannot combine inline image bytes with a hosted file download.');
        }
        // Store-by-reference for host-inspected closet photos (the public fluent_set_closet_item_photo
        // path): the host already has/inspected the image and the widget renders it via the
        // adapter CSP, so DO NOT server-side fetch the caller-supplied URL — that would be an SSRF
        // surface on a public write. Mirrors fluent_get_closet_item_photos, which provides URLs, never
        // fetches pixels. A declared ChatGPT file parameter is the narrow exception: it goes
        // through the allowlisted, size-capped, signature-checked owned-asset importer below.
        const importedFrom = asNullableString(photo.imported_from ?? photo.importedFrom);
        const presentationInputSha256 = asNullableString(
          photo.presentation_input_sha256 ?? photo.presentationInputSha256,
        );
        if (presentationInputSha256 && !/^[a-f0-9]{64}$/.test(presentationInputSha256)) {
          throw new Error('Style presentation input fingerprint must be a lowercase SHA-256 value.');
        }
        // A linked image the caller asked to copy (fluent_set_closet_item_photo image_url) goes through
        // the SSRF-guarded public importer into owned storage instead of staying a reference.
        const copySourceToOwned = this.fetchesCallerImageUrls()
          && asBoolean(photo.copy_source_to_owned ?? photo.copySourceToOwned);
        const referenceOnly = !hasInlineImage && !hostedFileDownloadUrl && !copySourceToOwned && (
          asNullableString(photo.source) === 'host_inspected' || importedFrom?.startsWith('fluent_style_') === true
        );
        const ownedAsset = existingArtifact
          ? {
              artifactId: existingArtifact.id,
              mimeType: asNullableString(photo.mime_type ?? photo.mimeType) ?? 'application/octet-stream',
              r2Key: existingArtifact.r2_key,
            }
          : referenceOnly
          ? null
          : await this.ingestPhotoAsset({
              dataBase64: asNullableString(photo.data_base64 ?? photo.dataBase64 ?? photo.base64),
              dataUrl: inlineDataUrl,
              hostedFileDownloadUrl,
              itemId: input.itemId,
              mimeType: asNullableString(
                photo.hosted_file_mime_type ?? photo.hostedFileMimeType ?? photo.mime_type ?? photo.mimeType,
              ),
              photoId,
              sourceUrl,
              copyRequested: copySourceToOwned,
            });
        if (!ownedAsset && isHostedLocalUploadReference(sourceUrl)) {
          throw new Error(
            'Hosted Style photo writes cannot ingest local upload paths directly. Provide image bytes via data_url/data_base64 or a fetchable remote image URL.',
          );
        }

        if (ownedAsset && !existingArtifact) {
          createdArtifacts.push({ id: ownedAsset.artifactId, r2_key: ownedAsset.r2Key });
        }
        if (qualityReview && photoId === qualityReview.catalogPhotoId) {
          if (!ownedAsset || existingArtifact || !('sha256' in ownedAsset)) {
            throw new Error('Catalog-ready media must be supplied as newly owned image bytes, not a mutable URL or caller-selected artifact reference.');
          }
          catalogSha256 = ownedAsset.sha256;
        }
        if (
          qualityReview?.catalogMode === 'host_generated'
          && photoId === qualityReview.sourcePhotoId
          && !retainedSourceSha256
        ) {
          if (
            !ownedAsset
            || existingArtifact
            || !('sha256' in ownedAsset)
            || asNullableString(photo.source) === 'generated_metadata'
            || importedFrom === 'fluent_style_host_generated'
          ) {
            throw new Error('Catalog-ready host-generated media requires newly owned, non-generated source bytes when source_photo_id is not already retained.');
          }
          retainedSourceArtifactId = ownedAsset.artifactId;
          retainedSourceSha256 = ownedAsset.sha256;
        }

        photos.push({
          artifactId: ownedAsset?.artifactId ?? null,
          bgRemoved: asBoolean(photo.bg_removed ?? photo.bgRemoved),
          capturedAt: asNullableString(photo.captured_at ?? photo.capturedAt),
          createdAt: null,
          kind: inferStylePhotoKind({
            isFit: asBoolean(photo.is_fit ?? photo.isFit),
            kind: photo.kind,
            view: photo.view,
          }),
          id: photoId,
          importedFrom: asNullableString(photo.imported_from ?? photo.importedFrom),
          isFit: asBoolean(photo.is_fit ?? photo.isFit),
          isPrimary: asBoolean(photo.is_primary ?? photo.isPrimary),
          legacyPhotoId: asNullableNumber(photo.legacy_photo_id ?? photo.legacyPhotoId),
          mimeType: ownedAsset?.mimeType ?? asNullableString(photo.mime_type ?? photo.mimeType),
          source: inferStylePhotoSource({
            importedFrom: photo.imported_from ?? photo.importedFrom,
            source: photo.source,
            url: sourceUrl,
          }),
          sourceUrl,
          url: sourceUrl ?? (
            ownedAsset
            && importedFrom === 'fluent_style_host_generated'
            && presentationInputSha256
              ? `artifact:${photoId}#input-sha256=${presentationInputSha256}`
              : `artifact:${photoId}`
          ),
          view: normalizeStylePhotoView(photo.view),
        });
      }

      const provenanceUpdate = await this.catalogQualityProvenanceUpdate({
        beforeProvenance,
        catalogSha256,
        duplicateResolution: input.duplicateResolution ?? null,
        itemId: input.itemId,
        photos,
        qualityReview,
        retainedSourceArtifactId,
        retainedSourceSha256,
        sourceSnapshot: input.sourceSnapshot,
      });
      try {
        await this.repository.replaceItemPhotos(input.itemId, photos, provenanceUpdate, photoSetFingerprint);
        committed = true;
      } catch (error) {
        // A photo this write built from its read was released by a concurrent replacement.
        if (error instanceof StylePhotoArtifactReleasedError) throw new StylePhotoSetConflictError(input.itemId);
        if (photoSetFingerprint !== null) {
          const current = await this.repository.photoSetFingerprint(input.itemId).catch(() => null);
          if (current !== null && current !== photoSetFingerprint) {
            throw new StylePhotoSetConflictError(input.itemId);
          }
        }
        throw error;
      }
      await this.cleanupUnreferencedPhotoArtifacts(previousArtifacts);
      const after = await this.getItem(input.itemId);
      if (!after) {
        throw new Error(`Style item ${input.itemId} disappeared after photo update.`);
      }

      await this.recordDomainEvent({
        after: { itemId: input.itemId, photoCount: after.photos.length },
        before: { itemId: input.itemId, photoCount: before.photos.length },
        entityId: input.itemId,
        entityType: 'style_item_photos',
        eventType: 'style.item_photos_replaced',
        provenance: input.provenance,
      });
      return after.photos;
    } catch (error) {
      if (committed) {
        // Post-commit failure: the commit evidence is attached FIRST, and cleanup can never mask it.
        // Cleanup only releases artifacts that no photo row references (getUnreferencedArtifact), so
        // the committed rows' artifacts and blobs are never deleted here.
        markStyleWriteCommitted(error);
        await this.cleanupUnreferencedPhotoArtifacts(createdArtifacts).catch(() => undefined);
        throw error;
      }
      // If ingestion or the transactional row swap fails, delete any new assets that did not
      // become the durable replacement. Assets referenced by a successful swap are preserved.
      await this.cleanupUnreferencedPhotoArtifacts(createdArtifacts);
      throw error;
    }
  }

  // Atomic append for photo_action "add": ingest exactly one new non-cover photo and insert only
  // its row. No other row is deleted or rewritten, so a concurrent replace or add can never be
  // undone (and no replaced artifact restored) by this write, and the cover is never touched.
  // A repeat of the same content-addressed id is a no-op (the new artifact is then released).
  async appendItemPhoto(input: {
    // A duplicate "use existing" resolution completed by this append: its client_token binding is
    // written atomically with the new photo row, so a same-token retry replays the completed result.
    duplicateResolution?: {
      batchId?: string | null;
      candidateId: string;
      clientToken?: string | null;
      decision: 'use_existing';
    } | null;
    itemId: string;
    photo: Record<string, unknown>;
    provenance: MutationProvenance;
  }): Promise<{ inserted: boolean; photos: StylePhotoRecord[] }> {
    const before = await this.getItem(input.itemId);
    if (!before) {
      throw new Error(`Unknown style item: ${input.itemId}`);
    }
    const photo = input.photo;
    const photoId = asNullableString(photo.id);
    if (!photoId) throw new Error('Style photo append requires a photo id.');
    if (asBoolean(photo.is_primary ?? photo.isPrimary)) {
      throw new Error('Adding a photo cannot change the cover.');
    }
    const rawSourceUrl = asNullableString(photo.source_url ?? photo.sourceUrl ?? photo.url);
    const sourceDataUrl = rawSourceUrl && /^data:/i.test(rawSourceUrl) ? rawSourceUrl : null;
    const inlineDataUrl = asNullableString(photo.data_url ?? photo.dataUrl) ?? sourceDataUrl;
    if (inlineDataUrl) assertStyleImageDataUrl(inlineDataUrl);
    const sourceUrl = sourceDataUrl ? null : rawSourceUrl;
    const hostedFileDownloadUrl = asNullableString(photo.hosted_file_download_url ?? photo.hostedFileDownloadUrl);
    if (inlineDataUrl && hostedFileDownloadUrl) {
      throw new Error('Style photo input cannot combine inline image bytes with a hosted file download.');
    }
    const importedFrom = asNullableString(photo.imported_from ?? photo.importedFrom);
    const copySourceToOwned = this.fetchesCallerImageUrls()
      && asBoolean(photo.copy_source_to_owned ?? photo.copySourceToOwned);
    const referenceOnly = !inlineDataUrl && !hostedFileDownloadUrl && !copySourceToOwned && (
      asNullableString(photo.source) === 'host_inspected' || importedFrom?.startsWith('fluent_style_') === true
    );
    const ownedAsset = referenceOnly
      ? null
      : await this.ingestPhotoAsset({
          dataBase64: null,
          dataUrl: inlineDataUrl,
          hostedFileDownloadUrl,
          itemId: input.itemId,
          mimeType: asNullableString(photo.mime_type ?? photo.mimeType),
          photoId,
          sourceUrl,
          copyRequested: copySourceToOwned,
        });
    if (!ownedAsset && !sourceUrl) {
      throw new Error('Style photo append requires image bytes or a direct image URL.');
    }
    const createdArtifacts = ownedAsset ? [{ id: ownedAsset.artifactId, r2_key: ownedAsset.r2Key }] : [];
    const row = {
      artifactId: ownedAsset?.artifactId ?? null,
      bgRemoved: asBoolean(photo.bg_removed ?? photo.bgRemoved),
      capturedAt: asNullableString(photo.captured_at ?? photo.capturedAt),
      id: photoId,
      importedFrom,
      isFit: asBoolean(photo.is_fit ?? photo.isFit),
      kind: inferStylePhotoKind({
        isFit: asBoolean(photo.is_fit ?? photo.isFit),
        kind: photo.kind,
        view: photo.view,
      }),
      mimeType: ownedAsset?.mimeType ?? asNullableString(photo.mime_type ?? photo.mimeType),
      source: inferStylePhotoSource({ importedFrom, source: photo.source, url: sourceUrl }),
      sourceUrl,
      url: sourceUrl ?? `artifact:${photoId}`,
      view: normalizeStylePhotoView(photo.view),
    };
    let inserted = false;
    try {
      // A duplicate-resolution token binding is merged into the CURRENT provenance: each attempt reads
      // the raw row, derives the update from it, and commits only if the row is unchanged (revision
      // check). A concurrent binding makes the batch write nothing; the next attempt merges on top.
      for (let attempt = 1; ; attempt += 1) {
        const expected = input.duplicateResolution ? await this.repository.provenanceRevision(input.itemId) : null;
        const resolutionProvenance = input.duplicateResolution
          ? await this.catalogQualityProvenanceUpdate({
              beforeProvenance: await this.getItemProvenance(input.itemId),
              catalogSha256: null,
              duplicateResolution: input.duplicateResolution,
              itemId: input.itemId,
              photos: [],
              qualityReview: null,
              retainedSourceArtifactId: null,
              retainedSourceSha256: null,
              sourceSnapshot: null,
            })
          : undefined;
        try {
          inserted = await this.repository.appendItemPhoto(
            input.itemId,
            row,
            resolutionProvenance ? { ...resolutionProvenance, expected } : undefined,
          );
          break;
        } catch (error) {
          if (!resolutionProvenance || attempt >= STYLE_PROVENANCE_WRITE_MAX_ATTEMPTS) throw error;
          const current = await this.repository.provenanceRevision(input.itemId);
          if (JSON.stringify(current) === JSON.stringify(expected)) throw error;
        }
      }
    } catch (error) {
      await this.cleanupUnreferencedPhotoArtifacts(createdArtifacts);
      throw error;
    }
    if (!inserted) {
      // Same content already added (or the item vanished): release the unused new artifact.
      await this.cleanupUnreferencedPhotoArtifacts(createdArtifacts);
    }
    try {
      const after = await this.getItem(input.itemId);
      if (!after) {
        throw new Error(`Style item ${input.itemId} disappeared after photo append.`);
      }
      if (inserted) {
        await this.recordDomainEvent({
          after: { itemId: input.itemId, photoCount: after.photos.length, photoId },
          before: { itemId: input.itemId, photoCount: before.photos.length },
          entityId: input.itemId,
          entityType: 'style_item_photos',
          eventType: 'style.item_photo_added',
          provenance: input.provenance,
        });
      }
      return { inserted, photos: after.photos };
    } catch (error) {
      // After a committed insert no rollback cleanup runs; only the commit evidence is attached.
      throw inserted ? markStyleWriteCommitted(error) : error;
    }
  }

  async getItemProfile(itemId: string): Promise<StyleItemProfileRecord | null> {
    const row = await this.repository.getItemProfileRow(itemId);
    if (!row) {
      return null;
    }
    return {
      itemId: row.item_id,
      legacyProfileId: row.legacy_profile_id,
      method: row.method,
      raw: normalizeStyleItemProfile(row.raw_json),
      source: row.source,
      updatedAt: row.updated_at,
    };
  }

  async upsertItemProfile(input: {
    fieldEvidence?: unknown;
    hasImage?: boolean;
    itemId: string;
    legacyProfileId?: number | null;
    method?: string | null;
    profile: unknown;
    provenance: MutationProvenance;
    source?: string | null;
    sourceSnapshot?: unknown;
  }): Promise<StyleItemProfileMergeResult> {
    const item = await this.getItem(input.itemId);
    if (!item) {
      throw new Error(`Unknown style item: ${input.itemId}`);
    }
    const before = await this.getItemProfile(input.itemId);
    const beforeProvenance = await this.getItemProvenance(input.itemId);
    const incomingRecord = asRecord(parseJsonLike(input.profile)) ?? {};
    const incomingFields = STYLE_ITEM_PROFILE_FIELDS.filter((field) =>
      Object.prototype.hasOwnProperty.call(incomingRecord, field),
    );
    const incomingRaw = normalizeStyleItemProfile(input.profile);
    const nextRaw: StyleItemProfileDocument = before ? { ...before.raw } : normalizeStyleItemProfile({});
    const hasImage = input.hasImage === true;
    const method = downgradeStyleItemProfileSource(input.method ?? null, hasImage);
    const source =
      input.source === 'style_host_onboarding'
        ? 'style_host_onboarding'
        : downgradeStyleItemProfileSource(input.source ?? null, hasImage);
    const inheritedMethod = method ?? before?.method ?? null;
    const inheritedSource = source ?? before?.source ?? null;
    const defaultIncomingSource = canonicalStyleItemProfileSource(inheritedSource, inheritedMethod, hasImage);
    const storedEvidence = asRecord(beforeProvenance?.fieldEvidence) ?? {};
    const incomingEvidence = downgradeOnboardingFieldEvidence(input.fieldEvidence, hasImage) ?? {};
    const nextEvidence: Record<string, unknown> = { ...storedEvidence };
    const mergeAudit: StyleItemProfileMergeAuditEntry[] = [];
    let incomingWon = false;

    for (const field of incomingFields) {
      if (STYLE_ITEM_PROFILE_CONTROL_FIELDS.has(field)) {
        const beforeValue = nextRaw[field];
        const incomingValue = incomingRaw[field];
        nextRaw[field] = incomingValue as never;
        incomingWon = true;
        mergeAudit.push({
          changed: !styleItemProfileValuesEqual(beforeValue, nextRaw[field]),
          field,
          fromSource: null,
          toSource: null,
        });
        continue;
      }
      const evidence = asRecord(incomingEvidence[field]);
      const incomingSource = canonicalStyleItemProfileSource(
        asNullableString(evidence?.source) ?? defaultIncomingSource,
        inheritedMethod,
        hasImage,
      );
      const storedSource = styleItemProfileStoredSource(field, storedEvidence, before);
      const incomingRank = styleItemProfileSourceRank(incomingSource, inheritedMethod);
      const storedRank = styleItemProfileSourceRank(storedSource, before?.method ?? null);
      const beforeValue = nextRaw[field];
      const incomingValue = incomingRaw[field];
      if (
        field === 'wearUnderstanding'
        && incomingValue !== 'unknown'
        && incomingSource !== 'user'
        && incomingSource !== 'user_correction'
      ) {
        throw new Error('wearUnderstanding recently_worn/rarely_worn requires explicit user evidence.');
      }
      const shouldApply = incomingRank >= storedRank || isEmptyStyleItemProfileValue(beforeValue);

      if (shouldApply) {
        nextRaw[field] = incomingValue as never;
        if (evidence) {
          nextEvidence[field] = buildStyleItemProfileFieldEvidence({
            baseEvidence: evidence,
            confidence: asNullableNumber(evidence?.confidence) ?? input.provenance.confidence ?? null,
            source: incomingSource,
            value: incomingValue,
          });
        }
        incomingWon = true;
      } else if (!asRecord(nextEvidence[field]) && before) {
        nextEvidence[field] = buildStyleItemProfileFieldEvidence({
          confidence: null,
          source: storedSource,
          value: beforeValue,
        });
      }

      mergeAudit.push({
        changed: !styleItemProfileValuesEqual(beforeValue, nextRaw[field]),
        field,
        fromSource: storedSource,
        toSource: shouldApply ? incomingSource : storedSource,
      });
    }

    const nextMethod = incomingWon ? (method ?? before?.method ?? null) : (before?.method ?? method ?? null);
    const nextSource = incomingWon ? (source ?? before?.source ?? null) : (before?.source ?? source ?? null);
    // PROVENANCE PIN (G1): when the row scalar is about to change, freeze each untouched,
    // un-evidenced, non-empty field's provenance at its PRE-write resolved floor, so the scalar
    // bump can never retroactively promote a field this write did not supply.
    const scalarWillMove =
      before != null &&
      (nextSource !== (before.source ?? null) || nextMethod !== (before.method ?? null));
    if (scalarWillMove) {
      const incomingFieldSet = new Set(incomingFields);
      for (const field of STYLE_ITEM_PROFILE_FIELDS) {
        if (incomingFieldSet.has(field)) continue; // win / reject-stamp path already handled it
        if (asRecord(nextEvidence[field])) continue; // already has explicit evidence - never clobber
        if (field === 'wearUnderstanding' && nextRaw[field] === 'unknown') continue; // default means no wear evidence
        if (isEmptyStyleItemProfileValue(nextRaw[field])) continue; // nothing to protect
        const floor = styleItemProfileStoredSource(field, storedEvidence, before);
        if (!floor) continue;
        nextEvidence[field] = buildStyleItemProfileFieldEvidence({
          confidence: null,
          source: floor,
          value: nextRaw[field],
        });
      }
    }
    const mergedEvidenceJson =
      Object.keys(nextEvidence).length > 0 ? stringifyJson(nextEvidence) : stringifyJson(beforeProvenance?.fieldEvidence);

    await this.repository.upsertItemProfile({
      itemId: input.itemId,
      legacyProfileId: input.legacyProfileId ?? before?.legacyProfileId ?? null,
      method: nextMethod,
      rawJson: JSON.stringify(nextRaw),
      source: nextSource,
    });

    if (mergedEvidenceJson || beforeProvenance) {
      await this.repository.upsertProvenance({
        fieldEvidenceJson: mergedEvidenceJson,
        itemId: input.itemId,
        sourceSnapshotJson: stringifyJson(input.sourceSnapshot ?? beforeProvenance?.sourceSnapshot),
        technicalMetadataJson: stringifyJson(beforeProvenance?.technicalMetadata),
      });
    }

    const inferredComparatorKey = inferStyleComparatorKey({
      category: item.category,
      profile: nextRaw,
      subcategory: item.subcategory,
      tags: nextRaw.tags,
    });
    if (inferredComparatorKey !== item.comparatorKey) {
      await this.repository.updateItemComparatorKey(input.itemId, inferredComparatorKey);
    }

    const after = await this.getItemProfile(input.itemId);
    if (!after) {
      throw new Error(`Style item profile ${input.itemId} could not be read back after upsert.`);
    }

    await this.recordDomainEvent({
      after: { ...after, mergeAudit },
      before,
      entityId: input.itemId,
      entityType: 'style_item_profile',
      eventType: before ? 'style.item_profile_updated' : 'style.item_profile_created',
      provenance: input.provenance,
    });
    return { ...after, mergeAudit };
  }

  async listEvidenceGaps(input: {
    priorityFilter?: StyleEvidenceGapPriorityFilter | null;
  } = {}): Promise<StyleEvidenceGapListRecord> {
    const priorityFilter = input.priorityFilter ?? 'all';
    const items = await this.listItems();
    const itemsWithGaps: StyleEvidenceGapRecord[] = [];
    const countsByType: Record<StyleEvidenceGapType, number> = {
      missing_primary_photo_delivery: 0,
      missing_display_photo: 0,
      missing_fit_photo: 0,
      missing_typed_profile: 0,
      weak_descriptor_coverage: 0,
      weak_comparator_identity: 0,
    };
    let deliverablePhotoCount = 0;
    let typedProfileCount = 0;
    let usableProfileCount = 0;
    let stylistDescriptorCount = 0;

    for (const item of items) {
      const gapTypes: StyleEvidenceGapType[] = [];
      const notes: string[] = [];
      if (item.photos.some((photo) => photo.delivery)) {
        deliverablePhotoCount += 1;
      } else {
        gapTypes.push('missing_primary_photo_delivery');
        notes.push('item has no deliverable Fluent image');
      }
      if (item.status === 'active') {
        if (!item.photos.some(isStyleDisplayPhoto)) {
          gapTypes.push('missing_display_photo');
          notes.push('active item has no product/display photo for closet surfaces');
        }
        if (!item.photos.some(isStyleFitPhoto)) {
          gapTypes.push('missing_fit_photo');
          notes.push('active item has no worn fit photo for fit assessment');
        }
      }
      if (item.profile) {
        typedProfileCount += 1;
      } else {
        gapTypes.push('missing_typed_profile');
        notes.push('item has no typed style profile');
      }
      if (hasUsableStyleProfileEvidence(item.profile?.raw ?? null)) {
        usableProfileCount += 1;
      } else {
        gapTypes.push('weak_descriptor_coverage');
        notes.push('item is missing enough typed style evidence to support confident wardrobe reasoning');
      }
      if (hasStyleDescriptors(item.profile?.raw ?? null)) {
        stylistDescriptorCount += 1;
      }
      if (item.comparatorKey === 'unknown') {
        gapTypes.push('weak_comparator_identity');
        notes.push('item is missing a strong comparator lane');
      }
      if (gapTypes.length === 0) {
        continue;
      }
      for (const gapType of gapTypes) {
        countsByType[gapType] += 1;
      }
      itemsWithGaps.push({
        gapTypes,
        itemId: item.id,
        notes,
        priority: classifyEvidenceGapPriority(gapTypes),
        summary: summarizeStyleItem(item) as StyleItemSummaryRecord,
      });
    }

    const filteredItems = filterEvidenceGapItemsByPriority(itemsWithGaps, priorityFilter);

    return {
      appliedPriorityFilter: priorityFilter,
      countsByType,
      descriptorCoverage: items.length > 0 ? Number((stylistDescriptorCount / items.length).toFixed(2)) : 0,
      deliverablePhotoCoverage: items.length > 0 ? Number((deliverablePhotoCount / items.length).toFixed(2)) : 0,
      items: filteredItems,
      omittedItemCount: itemsWithGaps.length - filteredItems.length,
      stylistDescriptorCoverage: items.length > 0 ? Number((stylistDescriptorCount / items.length).toFixed(2)) : 0,
      typedProfileCoverage: items.length > 0 ? Number((typedProfileCount / items.length).toFixed(2)) : 0,
      usableProfileCoverage: items.length > 0 ? Number((usableProfileCount / items.length).toFixed(2)) : 0,
    };
  }

  async listDescriptorBacklog(input: {
    focus?: StyleDescriptorBacklogFocus | null;
    maxItems?: number | null;
  } = {}): Promise<StyleDescriptorBacklogRecord> {
    const focus = input.focus ?? 'priority';
    const maxItems = Math.min(Math.max(input.maxItems ?? 12, 1), 24);
    const [items, wardrobe] = await Promise.all([
      this.listItems(),
      this.analyzeWardrobe({ focus: 'all' }),
    ]);
    const itemMap = new Map(items.map((item) => [item.id, item]));
    const candidates = new Map<string, {
      item: StyleItemRecord;
      priority: number;
      reasons: string[];
      sourceSignals: Set<string>;
      blockedByPhoto: boolean;
    }>();

    const register = (itemId: string, sourceSignal: string, priority: number, reason: string) => {
      const item = itemMap.get(itemId);
      if (!item) {
        return;
      }
      const support = descriptorPhotoSupport(item);
      const existing = candidates.get(itemId);
      if (existing) {
        existing.priority = Math.max(existing.priority, priority);
        if (!existing.reasons.includes(reason)) {
          existing.reasons.push(reason);
        }
        existing.sourceSignals.add(sourceSignal);
        existing.blockedByPhoto = existing.blockedByPhoto && support.blockedByPhoto;
        return;
      }
      candidates.set(itemId, {
        blockedByPhoto: support.blockedByPhoto,
        item,
        priority,
        reasons: [reason],
        sourceSignals: new Set([sourceSignal]),
      });
    };

    for (const cluster of wardrobe.redundancyClusters) {
      for (const itemId of cluster.itemIds) {
        register(itemId, 'redundancy_cluster', 5, `appears in redundancy cluster: ${cluster.label}`);
      }
    }
    for (const candidate of wardrobe.replacementCandidates) {
      register(candidate.itemId, 'replacement_candidate', 6, `currently flagged as a replacement candidate in ${candidate.replacementLane ?? 'a crowded lane'}`);
    }
    for (const finding of wardrobe.bridgePieces) {
      for (const itemId of finding.itemIds) {
        register(itemId, 'bridge_anchor', wardrobePriorityScore(finding.priority) + 2, `anchors a bridge context: ${finding.label}`);
      }
    }
    for (const coverage of wardrobe.occasionCoverage) {
      const occasionPriority = coverage.coverage === 'strong' ? 3 : coverage.coverage === 'partial' ? 2 : 1;
      for (const itemId of coverage.itemIds) {
        register(itemId, 'occasion_anchor', occasionPriority, `helps cover ${coverage.occasion.replace(/_/g, ' ')} dressing`);
      }
    }

    const entries = [...candidates.values()]
      .map(({ blockedByPhoto, item, priority, reasons, sourceSignals }) =>
        buildDescriptorBacklogEntry({
          blockedByPhoto,
          item,
          priority,
          reasons,
          sourceSignals: [...sourceSignals],
        }))
      .filter((entry) => entry.missingDescriptorFields.length > 0)
      .filter((entry) => {
        if (focus === 'blocked') {
          return entry.blockedByPhoto;
        }
        if (focus === 'priority') {
          return !entry.blockedByPhoto;
        }
        return true;
      })
      .sort((left, right) => {
        const priorityDelta = wardrobePriorityScore(right.priority) - wardrobePriorityScore(left.priority);
        if (priorityDelta !== 0) {
          return priorityDelta;
        }
        const rightSignalDelta = right.sourceSignals.length - left.sourceSignals.length;
        if (rightSignalDelta !== 0) {
          return rightSignalDelta;
        }
        const blockedDelta = Number(left.blockedByPhoto) - Number(right.blockedByPhoto);
        if (blockedDelta !== 0) {
          return blockedDelta;
        }
        return (left.summary.name ?? left.itemId).localeCompare(right.summary.name ?? right.itemId);
      })
      .slice(0, maxItems);

    const blockedItemCount = [...candidates.values()]
      .map((entry) =>
        buildDescriptorBacklogEntry({
          blockedByPhoto: entry.blockedByPhoto,
          item: entry.item,
          priority: entry.priority,
          reasons: entry.reasons,
          sourceSignals: [...entry.sourceSignals],
        }))
      .filter((entry) => entry.blockedByPhoto && entry.missingDescriptorFields.length > 0).length;

    const totalItems = items.length;
    const typedProfileCount = items.filter((item) => Boolean(item.profile)).length;
    const usableProfileCount = items.filter((item) => hasUsableStyleProfileEvidence(item.profile?.raw ?? null)).length;
    const stylistDescriptorCount = items.filter((item) => hasStyleDescriptors(item.profile?.raw ?? null)).length;

    return {
      appliedFocus: focus,
      blockedItemCount,
      descriptorCoverage: totalItems > 0 ? Number((stylistDescriptorCount / totalItems).toFixed(2)) : 0,
      entries,
      itemCount: entries.length,
      stylistDescriptorCoverage: totalItems > 0 ? Number((stylistDescriptorCount / totalItems).toFixed(2)) : 0,
      typedProfileCoverage: totalItems > 0 ? Number((typedProfileCount / totalItems).toFixed(2)) : 0,
      usableProfileCoverage: totalItems > 0 ? Number((usableProfileCount / totalItems).toFixed(2)) : 0,
    };
  }

  async analyzeWardrobe(input: { focus?: StyleWardrobeAnalysisFocus | null }): Promise<StyleWardrobeAnalysis> {
    const focus = input.focus ?? 'all';
    const [profile, items, evidenceGaps] = await Promise.all([this.getProfile(), this.listItems(), this.listEvidenceGaps()]);
    const provenanceByItemId = await this.getItemProvenanceBatch(
      items.filter((item) => item.status === 'active').map((item) => item.id),
    );
    const calibration = buildStyleOnboardingCalibration({ profile, items, provenanceByItemId });
    const activeItems = items.filter((item) => item.status === 'active' && !isStyleItemExcludedFromCalibration(profile, item.id));
    const itemsById = Object.fromEntries(
      activeItems.map((item) => [item.id, summarizeStyleItem(item) as StyleItemSummaryRecord]),
    );
    const laneMap = new Map<string, StyleItemRecord[]>();
    const categoryMap = new Map<string, StyleItemRecord[]>();
    const preferredColors = activeStyleColorSignals(profile.raw);
    const preferredSilhouettes = activeStyleSilhouetteSignals(profile.raw);

    for (const item of activeItems) {
      laneMap.set(item.comparatorKey, [...(laneMap.get(item.comparatorKey) ?? []), item]);
      if (item.category) {
        const categoryKey = item.category.toLowerCase();
        categoryMap.set(categoryKey, [...(categoryMap.get(categoryKey) ?? []), item]);
      }
    }

    const strengths: StyleWardrobeFindingRecord[] = [];
    for (const [lane, laneItems] of laneMap.entries()) {
      if (lane === 'unknown' || laneItems.length < 2) {
        continue;
      }
      const usableProfileBackedCount = laneItems.filter((item) => hasUsableStyleProfileEvidence(item.profile?.raw ?? null)).length;
      const descriptorBackedCount = laneItems.filter((item) => hasStyleDescriptors(item.profile?.raw ?? null)).length;
      const formalityBackedCount = laneItems.filter((item) => item.formality != null).length;
      if (usableProfileBackedCount === 0 && descriptorBackedCount === 0 && formalityBackedCount === 0) {
        continue;
      }
      const paletteBackedCount = laneItems.filter(
        (item) => item.colorFamily && preferredColors.includes(item.colorFamily.toLowerCase()),
      ).length;
      const occasionNote = describeLaneOccasionSupport(lane, laneItems);
      const notes = [`${laneItems.length} active pieces already cover this lane`];
      if (paletteBackedCount > 0) {
        notes.push(`${paletteBackedCount} pieces sit inside the preferred palette`);
      } else if (usableProfileBackedCount > 0) {
        notes.push(`${usableProfileBackedCount} pieces already carry usable typed style evidence`);
      } else if (descriptorBackedCount > 0) {
        notes.push(`${descriptorBackedCount} pieces already carry stylist descriptor coverage`);
      }
      if (occasionNote) {
        notes.push(occasionNote);
      }
      strengths.push({
        itemIds: laneItems.map((item) => item.id),
        label: buildLaneLabel(lane),
        lane,
        notes,
        priority:
          laneItems.length >= 3 || paletteBackedCount >= 2 || descriptorBackedCount >= 2 || usableProfileBackedCount >= 2
            ? 'high'
            : 'medium',
      });
    }
    strengths.sort((left, right) => {
      const priorityDelta = wardrobePriorityScore(right.priority) - wardrobePriorityScore(left.priority);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return right.itemIds.length - left.itemIds.length || left.label.localeCompare(right.label);
    });

    const redundancyClusters: StyleRedundancyClusterRecord[] = [];
    const replacementCandidates: StyleReplacementCandidateRecord[] = [];
    for (const [clusterKey, clusterItems] of groupItemsByRedundancyCluster(activeItems).entries()) {
      if (clusterItems.length < 3) {
        continue;
      }
      const [lane, colorFamily, subLane] = clusterKey.split('::');
      const subLaneLabel = formatRedundancySubLaneLabel(subLane ?? 'general');
        redundancyClusters.push({
          itemIds: clusterItems.map((item) => item.id),
          label: `${buildLaneLabel(lane)}${colorFamily && colorFamily !== 'unknown' ? ` in ${colorFamily}` : ''}${subLaneLabel ? ` (${subLaneLabel})` : ''}`,
          lane,
          notes: [
            `${clusterItems.length} pieces occupy the same comparator and color lane`,
            subLaneLabel ? `these pieces are redundant inside the ${subLaneLabel}` : 'these pieces serve the same stylist lane',
            'visual inspection recommended before concluding true redundancy',
            'consider replacement or rotation cleanup before adding more here',
          ],
        });
      const weakest = chooseReplacementCandidate(clusterItems);
      if (weakest) {
        replacementCandidates.push({
          itemId: weakest.id,
          notes: ['this lane is already crowded', 'this piece carries the weakest quality or descriptor signal in the cluster'],
          priority: clusterItems.length >= 4 ? 'high' : 'medium',
          replacementLane: lane,
        });
      }
    }

    const gapLanes = deriveWardrobeGapLanes({ activeItems, categoryMap, laneMap, profile });
    const bridgePieces = deriveBridgePieces({ categoryMap, laneMap, profile });
    const buyNextCandidates = deriveBuyNextCandidates(gapLanes, bridgePieces);
    const redundancyWeakSpots: StyleWardrobeFindingRecord[] = redundancyClusters.slice(0, 2).map((cluster) => ({
      itemIds: cluster.itemIds,
      label: cluster.label,
      lane: cluster.lane,
      notes: cluster.notes,
      priority: (cluster.itemIds.length >= 4 ? 'high' : 'medium') as StyleWardrobeFindingPriority,
    }));
    const weakSpots = deriveWardrobeWeakSpots({
      focus,
      gapLanes,
      redundancyWeakSpots,
    });
    const occasionCoverage = deriveOccasionCoverage({ activeItems, laneMap, profile });
    const evidenceWarnings: string[] = [];
    const totalEvidenceGapCount = evidenceGaps.items.length + evidenceGaps.omittedItemCount;
    if (totalEvidenceGapCount > 0) {
      evidenceWarnings.push(`${totalEvidenceGapCount} items still have evidence gaps that may soften wardrobe-level confidence.`);
    }
    if (preferredSilhouettes.length === 0) {
      evidenceWarnings.push('preferred silhouettes are still sparse in the style profile.');
    }
    if (preferredColors.length === 0) {
      evidenceWarnings.push('preferred color directions are still sparse in the style profile.');
    }

    return {
      bridgePieces: filterWardrobeFindingsForFocus(bridgePieces, focus, ['all', 'gaps', 'buy_next']),
      buyNextCandidates: filterWardrobeFindingsForFocus(buyNextCandidates, focus, ['all', 'buy_next', 'gaps']),
      evidenceWarnings,
      focus,
      gapLanes: filterWardrobeFindingsForFocus(gapLanes, focus, ['all', 'gaps', 'buy_next']),
      itemsById,
      occasionCoverage: focus === 'all' || focus === 'occasion' ? occasionCoverage : [],
      redundancyClusters: focus === 'all' || focus === 'redundancy' || focus === 'replacements' ? redundancyClusters : [],
      replacementCandidates: focus === 'all' || focus === 'replacements' ? replacementCandidates : [],
      strengths: focus === 'all' ? strengths.slice(0, 6) : [],
      weakSpots,
    };
  }

  async analyzePurchase(input: {
    candidate: unknown;
    provenance?: MutationProvenance;
    visualEvidence?: unknown;
  }): Promise<StylePurchaseAnalysis> {
    const candidate = normalizeStylePurchaseCandidate(input.candidate);
    const visualEvidence = normalizeStylePurchaseVisualEvidence(input.visualEvidence);
    const [profile, items] = await Promise.all([this.getProfile(), this.listItems()]);
    const provenanceByItemId = await this.getItemProvenanceBatch(
      items.filter((item) => item.status === 'active').map((item) => item.id),
    );
    const calibration = buildStyleOnboardingCalibration({ profile, items, provenanceByItemId });
    const activeItems = items.filter((item) => item.status === 'active' && !isStyleItemExcludedFromCalibration(profile, item.id));
    const itemsById: Record<string, StyleItemSummaryRecord> = {};
    const registerAnalysisItem = (item: StyleItemRecord): StyleItemSummaryRecord => {
      const existing = itemsById[item.id];
      if (existing) {
        return existing;
      }
      const summary = summarizeStyleItem(item) as StyleItemSummaryRecord;
      itemsById[item.id] = summary;
      return summary;
    };
    const candidateCategory = candidate.category.toLowerCase();
    const candidateComparatorKey = resolvePurchaseCandidateComparatorKey(candidate);
    const candidateWardrobeJob = inferTopWardrobeJobFromCandidate(candidate);
    const sameCategory = activeItems.filter((item) => item.category?.toLowerCase() === candidateCategory);
    const comparableSameCategory = sameCategory.filter((item) => isDirectPurchaseComparatorCandidate(candidate, item));
    const exactComparatorItems = [...comparableSameCategory]
      .map((item) => {
        const itemComparatorKey = resolveStyleItemComparatorKey(item);
        if (candidateComparatorKey && candidateComparatorKey !== 'unknown' && itemComparatorKey === candidateComparatorKey) {
          const reasons = [`closest wardrobe match (${candidateComparatorKey})`];
          if (candidate.colorFamily && item.colorFamily?.toLowerCase() === candidate.colorFamily.toLowerCase()) {
            reasons.push(`same color family (${candidate.colorFamily})`);
          }
          if (candidate.formality != null && item.formality != null && Math.abs(item.formality - candidate.formality) <= 1) {
            reasons.push(`nearby formality (${item.formality})`);
          }
          return {
            item,
            reasons,
          };
        }
        return null;
      })
      .filter((entry): entry is { item: StyleItemRecord; reasons: string[] } => Boolean(entry))
      .sort((left, right) => comparePurchaseBucketEntries(candidate, left.item, right.item))
      .slice(0, 4)
      .map(({ item, reasons }) => {
        registerAnalysisItem(item);
        return {
          itemId: item.id,
          reasons,
        };
      });
    const exactComparatorItemIds = new Set(exactComparatorItems.map((entry) => entry.itemId));

    const typedRoleItems = [...comparableSameCategory]
      .filter((item) => !exactComparatorItemIds.has(item.id))
      .map((item) => {
        if (matchesTypedRoleCandidate(candidate, item)) {
          const reasons = [`typed role match (${candidate.subcategory ?? item.profile?.raw.itemType ?? candidateComparatorKey ?? candidate.category})`];
          if (candidate.formality != null && item.formality != null && Math.abs(item.formality - candidate.formality) <= 1) {
            reasons.push(`nearby formality (${item.formality})`);
          }
          return {
            item,
            reasons,
          };
        }
        return null;
      })
      .filter((entry): entry is { item: StyleItemRecord; reasons: string[] } => Boolean(entry))
      .sort((left, right) => comparePurchaseBucketEntries(candidate, left.item, right.item))
      .slice(0, 4)
      .map(({ item, reasons }) => {
        registerAnalysisItem(item);
        return {
          itemId: item.id,
          reasons,
        };
      });

    const excludedSameCategoryIds = new Set([
      ...exactComparatorItems.map((entry) => entry.itemId),
      ...typedRoleItems.map((entry) => entry.itemId),
    ]);
    const sameCategoryItems = [...comparableSameCategory]
      .filter((item) => !excludedSameCategoryIds.has(item.id))
      .map((item) => {
        const reasons: string[] = [`same kind of item (${candidate.category})`];
        let score = 1;
        if (candidate.colorFamily && item.colorFamily?.toLowerCase() === candidate.colorFamily.toLowerCase()) {
          reasons.push(`same color family (${candidate.colorFamily})`);
          score += 2;
        }
        if (candidate.formality != null && item.formality != null) {
          const formalityDistance = Math.abs(item.formality - candidate.formality);
          if (formalityDistance <= 1) {
            reasons.push(`nearby formality (${item.formality})`);
            score += 2 - formalityDistance;
          }
        }
        if (item.status === 'active') {
          score += 1;
        }
        return {
          item,
          reasons,
          sortName: item.name,
          score,
        };
      })
      .filter((entry) => entry.score > 1)
      .sort((left, right) => {
        const bucketOrder = comparePurchaseBucketEntries(candidate, left.item, right.item);
        if (bucketOrder !== 0) {
          return bucketOrder;
        }
        return right.score - left.score || left.sortName?.localeCompare(right.sortName ?? '') || 0;
      })
      .slice(0, 4)
      .map(({ item, reasons }) => {
        registerAnalysisItem(item);
        return {
          itemId: item.id,
          reasons,
        };
      });

    const sameColorFamilyItems = comparableSameCategory
      .filter((item) => item.colorFamily && candidate.colorFamily && item.colorFamily.toLowerCase() === candidate.colorFamily.toLowerCase())
      .map((item) => {
        const reasons = [`same color family (${candidate.colorFamily})`];
        reasons.push(`same kind of item (${candidate.category})`);
        return {
          item,
          reasons,
        };
      })
      .sort((left, right) => comparePurchaseBucketEntries(candidate, left.item, right.item))
      .slice(0, 4)
      .map(({ item, reasons }) => {
        registerAnalysisItem(item);
        return {
          itemId: item.id,
          reasons,
        };
      });

    const nearbyFormalityItems = activeItems
      .filter((item) => candidate.formality != null && item.formality != null && Math.abs(item.formality - candidate.formality) <= 1)
      .map((item) => ({
        item,
        reasons: [`nearby formality (${item.formality})`],
      }))
      .slice(0, 4)
      .map(({ item, reasons }) => {
        registerAnalysisItem(item);
        return {
          itemId: item.id,
          reasons,
        };
      });

    const relatedCategoryPriority: Record<string, string[]> = {
      bottom: ['top', 'outerwear', 'shoe'],
      outerwear: ['top', 'bottom', 'shoe'],
      shoe: ['bottom', 'top', 'outerwear'],
      top: ['bottom', 'outerwear', 'shoe'],
    };
    const preferredPairCategories = relatedCategoryPriority[candidateCategory] ?? [];
    const candidateAthletic = isAthleticPurchaseCandidate(candidate);
    const pairingCandidates: StylePurchaseAnalysisItemMatch[] = activeItems
      .filter((item) => item.category && item.category.toLowerCase() !== candidateCategory)
      .filter((item) =>
        isCoherentPairingCandidate({
          candidateAthletic,
          item,
        }))
      .map((item) => {
        const reasons: string[] = [];
        let score = 0;
        const itemCategory = item.category?.toLowerCase() ?? '';
        const preferredIndex = preferredPairCategories.indexOf(itemCategory);
        if (preferredIndex >= 0) {
          reasons.push(`pairs with this part of the closet (${item.category})`);
          score += preferredPairCategories.length - preferredIndex + 3;
        }
        if (candidateCategory === 'bottom' && itemCategory === 'top') {
          const itemTopJob = inferTopWardrobeJobFromItem(item);
          if (itemTopJob === 'lifestyle_plain_tee') {
            reasons.push('easy casual top pairing');
            score += 3;
          } else if (itemTopJob === 'athletic_training_performance_tee') {
            score -= 3;
          } else if (itemTopJob === 'graphic_statement_tee' || itemTopJob === 'jersey_fanwear') {
            score -= 1;
          }
        }
        if (candidate.formality != null && item.formality != null) {
          const formalityDistance = Math.abs(item.formality - candidate.formality);
          if (formalityDistance <= 1) {
            reasons.push(`nearby formality (${item.formality})`);
            score += 3 - formalityDistance;
          }
        }
        if (item.colorFamily && profile.raw.colorDirections.includes(item.colorFamily)) {
          reasons.push(`already sits in your color direction (${item.colorFamily})`);
          score += 1;
        }
        if (item.profile?.raw.tags.includes('workhorse')) {
          reasons.push('existing workhorse piece');
          score += 1;
        }
        return {
          item,
          reasons: reasons.length > 0 ? reasons : ['different closet area with plausible pairing relationship'],
          sortName: item.name,
          score,
        };
      })
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.sortName?.localeCompare(right.sortName ?? '') || 0)
      .slice(0, 4)
      .map(({ item, reasons }) => {
        registerAnalysisItem(item);
        return {
          itemId: item.id,
          reasons,
        };
      });

    const nonComparatorItems = buildPurchaseNonComparatorItems({
      candidate,
      candidateCategory,
      items: activeItems,
    }).filter((entry) => !pairingCandidates.some((pairing) => pairing.itemId === entry.itemId));
    for (const rejected of nonComparatorItems) {
      const item = activeItems.find((entry) => entry.id === rejected.itemId);
      if (item) {
        registerAnalysisItem(item);
      }
    }

    const preferredColors = activeStyleColorSignals(profile.raw);
    const preferredSilhouettes = activeStyleSilhouetteSignals(profile.raw);
    const matchedSignals: string[] = [];
    const alignmentNotes: string[] = [];
    if (candidate.colorFamily && preferredColors.includes(candidate.colorFamily.toLowerCase())) {
      matchedSignals.push(`preferred color direction (${candidate.colorFamily})`);
      alignmentNotes.push(`candidate stays inside the current color direction (${candidate.colorFamily})`);
    }
    if (candidate.silhouette && preferredSilhouettes.includes(candidate.silhouette.toLowerCase())) {
      matchedSignals.push(`preferred silhouette (${candidate.silhouette})`);
      alignmentNotes.push(`candidate matches a preferred silhouette (${candidate.silhouette})`);
    }
    if (profile.raw.formalityTendency && candidate.formality != null) {
      const prefersCasual = /casual/i.test(profile.raw.formalityTendency);
      const matchesFormality = (prefersCasual && candidate.formality <= 3) || (!prefersCasual && candidate.formality >= 3);
      if (matchesFormality) {
        matchedSignals.push(`formality tendency (${profile.raw.formalityTendency})`);
        alignmentNotes.push(`candidate fits the current formality tendency (${profile.raw.formalityTendency})`);
      }
    }

    const candidateBlob = [
      candidate.brand,
      candidate.name,
      candidate.category,
      candidate.subcategory,
      candidate.colorFamily,
      candidate.colorName,
      candidate.notes,
      candidate.fitType,
      candidate.silhouette,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const hardAvoidHit = profile.raw.hardAvoids.find((entry) => candidateBlob.includes(entry.toLowerCase()));

    const paletteMismatch = Boolean(candidate.colorFamily) && preferredColors.length > 0
      ? !preferredColors.includes(candidate.colorFamily!.toLowerCase())
      : false;
    const silhouetteMismatch = Boolean(candidate.silhouette) && preferredSilhouettes.length > 0
      ? !preferredSilhouettes.includes(candidate.silhouette!.toLowerCase())
      : false;
    const formalityMismatch =
      Boolean(profile.raw.formalityTendency) && candidate.formality != null
        ? /casual/i.test(profile.raw.formalityTendency ?? '') ? candidate.formality > 3 : candidate.formality < 3
        : false;
    const sportUtilityException = /\b(running|technical|performance|trail|athletic)\b/i.test(candidateBlob);

    const tensionNotes: string[] = [];
    if (hardAvoidHit) {
      tensionNotes.push(`hard avoid present: ${hardAvoidHit}`);
    }
    if (paletteMismatch && candidate.colorFamily) {
      tensionNotes.push(`outside the current color direction (${candidate.colorFamily})`);
    }
    if (silhouetteMismatch && candidate.silhouette) {
      tensionNotes.push(`outside the preferred silhouette set (${candidate.silhouette})`);
    }
    if (formalityMismatch && profile.raw.formalityTendency) {
      tensionNotes.push(`sits outside the current formality tendency (${profile.raw.formalityTendency})`);
    }
    if (sportUtilityException) {
      tensionNotes.push('reads as sport or utility gear rather than a core wardrobe piece');
    }
    const typedProfileCoverage =
      activeItems.length > 0
        ? Number((activeItems.filter((item) => item.profile !== null).length / activeItems.length).toFixed(2))
        : 0;
    const primaryPhotoCoverage =
      activeItems.length > 0
        ? Number(
            (
              activeItems.filter((item) => item.photos.some((photo) => photo.isPrimary)).length / activeItems.length
            ).toFixed(2),
          )
        : 0;
    const evidenceNotes: string[] = [];
    const candidateHasImage = candidate.imageUrls.length > 0;
    const candidateHasHostInspection =
      visualEvidence.candidateInspected &&
      visualEvidence.candidateObservations.length > 0 &&
      (candidateHasImage || visualEvidence.source === 'host_vision');
    const candidateVisualGrounding = candidateHasHostInspection
      ? 'host_visual_inspection'
      : candidateHasImage
        ? 'image_reference_only'
        : 'none';
    if (candidateHasHostInspection && candidateHasImage) {
      evidenceNotes.push('candidate image was inspected by the host before this purchase analysis was finalized');
    } else if (candidateHasHostInspection) {
      evidenceNotes.push('candidate image was inspected in the host, but no renderable image URL was passed to Fluent');
    } else if (candidate.imageUrls.length === 0) {
      evidenceNotes.push('no candidate image provided; analysis relies on text attributes and closet state');
      if (visualEvidence.candidateInspected) {
        evidenceNotes.push('submitted visual observations were not accepted as final grounding because the candidate has no image reference');
      }
    } else {
      evidenceNotes.push(
        'candidate image reference is present, but purchase analysis has not inspected pixels; use style_get_purchase_vision_packet and direct image reading before making color or material claims. Reserve style_get_visual_bundle for broad closet visual context outside the staged purchase path.',
      );
    }
    for (const observation of visualEvidence.candidateObservations.slice(0, 4)) {
      evidenceNotes.push(`candidate visual observation: ${observation}`);
    }
    if (visualEvidence.comparatorItemIdsInspected.length > 0) {
      evidenceNotes.push(`host inspected ${visualEvidence.comparatorItemIdsInspected.length} closet comparator image(s)`);
    }
    if (typedProfileCoverage < 0.5) {
      evidenceNotes.push('typed profile coverage is still partial across the closet');
    }
    if (primaryPhotoCoverage < 0.7) {
      evidenceNotes.push('primary item-photo coverage is incomplete for parts of the closet');
    }
    const comparatorCoverage = buildComparatorCoverage({
      candidateCategory: candidate.category,
      candidateComparatorKey,
      exactComparatorCount: exactComparatorItems.length,
      sameCategoryCount: sameCategory.length,
      typedRoleCount: typedRoleItems.length,
    });
    if (comparatorCoverage.note) {
      evidenceNotes.push(comparatorCoverage.note);
    }
    const candidateDescriptorSummary = descriptorSummaryFromCandidate(candidate);
    const laneAssessment = buildLaneAssessment({
      candidateCategory: candidate.category,
      candidateComparatorKey,
      exactComparatorCount: exactComparatorItems.length,
      nearbyFormalityCount: nearbyFormalityItems.length,
      pairingCount: pairingCandidates.length,
      sameCategoryCount: sameCategory.length,
      typedRoleCount: typedRoleItems.length,
    });
    const coverageImpact = buildCoverageImpact({
      bridgeCandidateCount: pairingCandidates.length,
      exactComparatorCount: exactComparatorItems.length,
      gapLane: exactComparatorItems.length === 0 && typedRoleItems.length === 0,
      sameCategoryCount: sameCategory.length,
    });
    const comparatorReasoning = buildPurchaseComparatorReasoning({
      candidate,
      contextBuckets: {
        exactComparatorItems,
        nearbyFormalityItems,
        nonComparatorItems,
        pairingCandidates,
        sameCategoryItems,
        sameColorFamilyItems,
        typedRoleItems,
      },
      coverageImpact,
      items: activeItems,
      laneAssessment,
    });
    for (const comparison of comparatorReasoning.topComparisons) {
      const item = items.find((entry) => entry.id === comparison.itemId);
      if (item) {
        registerAnalysisItem(item);
      }
    }
    const comparatorDescriptorSummaries = Object.fromEntries(
      Object.keys(itemsById).map((itemId) => {
        const item = items.find((entry) => entry.id === itemId);
        return [itemId, descriptorSummaryFromItem(item ?? null)];
      }),
    );
    const descriptorDeltas = descriptorDeltaNotes({
      candidate: candidateDescriptorSummary,
      comparatorIds: exactComparatorItems.map((entry) => entry.itemId),
      comparatorSummaries: comparatorDescriptorSummaries,
    });
    const confidenceNotes = [
      ...calibration.purchaseAnalysisReadiness.notes,
      ...buildPurchaseConfidenceNotes({
        candidateHasImage: candidate.imageUrls.length > 0,
        comparatorCoverageMode: comparatorCoverage.mode,
        descriptorDeltas,
        exactComparatorCount: exactComparatorItems.length,
        itemsById,
      }),
    ];
    const analysis: StylePurchaseAnalysis = {
      calibration,
      candidate,
      candidateDescriptorSummary,
      candidateSummary: {
        category: candidate.category,
        comparatorKey: candidateComparatorKey,
        colorFamily: candidate.colorFamily,
        formality: candidate.formality,
        hasCandidateImages: candidate.imageUrls.length > 0,
        imageCount: candidate.imageUrls.length,
        name: candidate.name,
        silhouette: candidate.silhouette,
        subcategory: candidate.subcategory,
        wardrobeJob: candidate.category === 'TOP' ? candidateWardrobeJob : null,
      },
      comparatorCoverage,
      comparatorDescriptorSummaries,
      comparatorReasoning,
      confidenceNotes,
      contextBuckets: {
        exactComparatorItems,
        nearbyFormalityItems,
        nonComparatorItems,
        pairingCandidates,
        sameCategoryItems,
        sameColorFamilyItems,
        typedRoleItems,
      },
      coverageImpact,
      descriptorDeltas,
      itemsById,
      laneAssessment,
      alignmentSignals: {
        matchedSignals,
        notes: alignmentNotes,
      },
      tensionSignals: {
        formalityMismatch,
        hardAvoid: hardAvoidHit ?? null,
        notes: tensionNotes,
        paletteMismatch,
        silhouetteMismatch,
        sportUtilityException,
      },
      evidenceQuality: {
        candidateVisualGrounding,
        candidateImageCount: candidate.imageUrls.length,
        candidateVisualObservations: visualEvidence.candidateObservations,
        comparatorItemIdsInspected: visualEvidence.comparatorItemIdsInspected,
        notes: evidenceNotes,
        primaryPhotoCoverage,
        typedProfileCoverage,
        visualEvidenceSource: visualEvidence.source,
      },
    };

    if (input.provenance) {
      await this.recordDomainEvent({
        after: analysis,
        before: null,
        entityId: `purchase-analysis:${crypto.randomUUID()}`,
        entityType: 'style_purchase_analysis',
        eventType: 'style.purchase_analyzed',
        provenance: input.provenance,
      });
    }

    return analysis;
  }

  async getVisualBundle(input: {
    candidate?: unknown;
    deliveryMode?: StyleVisualBundleDeliveryMode | null;
    includeComparators?: boolean | null;
    itemIds?: string[] | null;
    maxImages?: number | null;
    photoPreference?: 'product' | 'fit' | null;
    sourceEvidenceOnly?: boolean | null;
  }): Promise<StyleVisualBundleRecord> {
    const deliveryMode = input.deliveryMode === 'authenticated_only' ? 'authenticated_only' : 'authenticated_with_signed_fallback';
    const includeComparators = input.includeComparators !== false;
    const maxImages = clampVisualBundleMaxImages(input.maxImages);
    const photoPreference: 'product' | 'fit' = input.photoPreference === 'product' ? 'product' : 'fit';
    const requestedItemIds = Array.from(new Set((input.itemIds ?? []).map((itemId) => itemId.trim()).filter(Boolean)));
    const [items, analysis] = await Promise.all([
      this.listItems(),
      input.candidate ? this.analyzePurchase({ candidate: input.candidate }) : Promise.resolve(null),
    ]);
    const itemMap = new Map(items.map((item) => [item.id, item]));
    const comparisonContextByItemId = analysis
      ? buildVisualBundleComparisonContextByItemId(analysis)
      : new Map<string, StyleVisualBundleComparisonContext>();
    const assets: StyleVisualBundleAssetRecord[] = [];
    const evidenceWarnings: string[] = [];
    const seenPhotoIds = new Set<string>();

    const pushItemPrimaryPhoto = async (
      itemId: string,
      role: Exclude<StyleVisualBundleAssetRecord['role'], 'candidate'>,
    ): Promise<void> => {
      if (assets.length >= maxImages) {
        return;
      }
      const item = itemMap.get(itemId);
      if (!item) {
        evidenceWarnings.push(`Item ${itemId} is not present in the current closet state.`);
        return;
      }
      const bundlePhoto = selectBestVisualBundlePhoto(
        item.photos,
        photoPreference,
        input.sourceEvidenceOnly === true,
      );
      if (!bundlePhoto) {
        evidenceWarnings.push(
          item.photos.length > 0
            ? `${item.name ?? item.id} has no deliverable saved Style photo.`
            : `${item.name ?? item.id} has no saved Style photo.`,
        );
        return;
      }
      if (seenPhotoIds.has(bundlePhoto.id)) {
        return;
      }

      seenPhotoIds.add(bundlePhoto.id);
      if (!bundlePhoto.delivery) {
        evidenceWarnings.push(`${item.name ?? item.id} does not have an owned Fluent image delivery route yet.`);
      }
      const fallbackSigned = deliveryMode === 'authenticated_with_signed_fallback' && bundlePhoto.artifactAvailable === true
        ? await this.buildFallbackSignedPhotoDelivery(bundlePhoto.id, bundlePhoto.artifactId)
        : null;
      const retainedSourceUrl = normalizeStyleRemoteImageSourceUrl(
        bundlePhoto.sourceUrl?.trim() || bundlePhoto.url?.trim() || '',
      )?.toString() ?? null;
      assets.push({
        authenticatedOriginalUrl: bundlePhoto.delivery?.originalUrl ?? null,
        comparisonContext: comparisonContextByItemId.get(item.id) ?? null,
        fallbackExpiresAt: fallbackSigned?.expiresAt ?? null,
        fallbackSignedOriginalUrl: fallbackSigned?.originalUrl ?? null,
        itemContext: buildVisualBundleItemContext(item),
        itemId: item.id,
        label: item.name ?? item.id,
        photoId: bundlePhoto.id,
        role,
        // An owned/backfilled artifact can remain safely deliverable even when its historical
        // source tuple is private, insecure, or relative. Keep that provenance server-side and
        // expose only validated public HTTPS sources in assistant-facing structured content.
        sourceUrl: retainedSourceUrl,
      });
    };
    const roleForRequestedItem = (
      itemId: string,
    ): Exclude<StyleVisualBundleAssetRecord['role'], 'candidate'> => {
      const context = comparisonContextByItemId.get(itemId);
      if (!context) {
        return 'requested_item';
      }
      if (context.bucketRoles.includes('exact_comparator')) {
        return 'exact_comparator';
      }
      if (context.bucketRoles.includes('typed_role')) {
        return 'typed_role';
      }
      if (context.bucketRoles.includes('rejected_non_comparator')) {
        return 'rejected_comparator';
      }
      if (context.bucketRoles.includes('top_comparison')) {
        return 'adjacent_reference';
      }
      if (context.bucketRoles.includes('same_category')) {
        return 'same_category';
      }
      if (context.bucketRoles.includes('nearby_formality')) {
        return 'nearby_formality';
      }
      return 'requested_item';
    };

    if (analysis) {
      const candidateImageUrl = analysis.candidate.imageUrls[0] ?? null;
      if (candidateImageUrl) {
        assets.push({
          authenticatedOriginalUrl: null,
          comparisonContext: null,
          fallbackExpiresAt: null,
          fallbackSignedOriginalUrl: null,
          itemContext: null,
          itemId: null,
          label: analysis.candidate.name ?? 'Candidate',
          photoId: null,
          role: 'candidate',
          sourceUrl: candidateImageUrl,
        });
      } else {
        evidenceWarnings.push('Candidate did not include an image, so the visual bundle cannot inspect it directly.');
      }
    }

    for (const itemId of requestedItemIds) {
      await pushItemPrimaryPhoto(itemId, roleForRequestedItem(itemId));
    }

    if (includeComparators && analysis && requestedItemIds.length === 0) {
      const exactComparatorIds = new Set(analysis.contextBuckets.exactComparatorItems.map((entry) => entry.itemId));
      const typedRoleIds = new Set(analysis.contextBuckets.typedRoleItems.map((entry) => entry.itemId));
      const pushedComparatorIds = new Set<string>();
      const roleForComparison = (itemId: string): Exclude<StyleVisualBundleAssetRecord['role'], 'candidate' | 'requested_item'> => {
        if (exactComparatorIds.has(itemId)) {
          return 'exact_comparator';
        }
        if (typedRoleIds.has(itemId)) {
          return 'typed_role';
        }
        return 'same_category';
      };

      for (const comparison of analysis.comparatorReasoning.topComparisons) {
        if (assets.length >= maxImages) {
          break;
        }
        pushedComparatorIds.add(comparison.itemId);
        await pushItemPrimaryPhoto(comparison.itemId, roleForComparison(comparison.itemId));
      }

      const comparatorRoles: Array<{
        items: StylePurchaseAnalysisItemMatch[];
        role: Exclude<StyleVisualBundleAssetRecord['role'], 'candidate' | 'requested_item'>;
      }> = [
        { items: analysis.contextBuckets.exactComparatorItems, role: 'exact_comparator' },
        { items: analysis.contextBuckets.typedRoleItems, role: 'typed_role' },
        { items: analysis.contextBuckets.sameCategoryItems, role: 'same_category' },
      ];

      for (const bucket of comparatorRoles) {
        for (const entry of bucket.items) {
          if (assets.length >= maxImages) {
            break;
          }
          if (pushedComparatorIds.has(entry.itemId)) {
            continue;
          }
          pushedComparatorIds.add(entry.itemId);
          await pushItemPrimaryPhoto(entry.itemId, bucket.role);
        }
        if (assets.length >= maxImages) {
          break;
        }
      }
    }

    if (analysis) {
      evidenceWarnings.push(...analysis.evidenceQuality.notes);
    }

    const fetchableAssetCount = assets.filter((asset) => asset.fallbackSignedOriginalUrl || asset.authenticatedOriginalUrl || asset.sourceUrl).length;
    const missingCandidateImage = Boolean(analysis) && !assets.some((asset) => asset.role === 'candidate');
    const visualInspectionState =
      missingCandidateImage
        ? 'missing_candidate_image'
        : assets.length === 0
          ? 'no_images_available'
          : 'image_references_returned';

    return {
      assets,
      comparatorCoverageMode: analysis?.comparatorCoverage.mode ?? null,
      deliveryMode,
      evidenceWarnings: Array.from(new Set(evidenceWarnings)),
      requestedItemIds,
      visualInspection: {
        assetCount: assets.length,
        fetchableAssetCount,
        note:
          missingCandidateImage
            ? 'Comparator image references plus compact closet item and comparator context may be returned, but no candidate image was available. Ask for or use a direct product image before making color, texture, condition, fit, or fine visual-overlap claims about the candidate.'
            : assets.length === 0
              ? 'No image references were returned; answer from metadata only.'
              : 'This bundle returns image references plus compact closet item and comparator context. Use host vision on the images before making color, texture, condition, or visual-overlap claims; a separate style_get_item call is only needed for correction, provenance, or unusually deep item detail.',
        state: visualInspectionState,
      },
    };
  }

  async getItemProvenance(itemId: string) {
    const row = await this.repository.getProvenanceRow(itemId);
    if (!row) {
      return null;
    }
    // Control flags (reanalyzePending/reanalyzeRequestedAt) live in the profile document, not as evidenced
    // descriptors — strip them from the provenance fieldEvidence surface so they never leak into
    // fieldEvidenceKeys / list_evidence, and so they don't accumulate into stored evidence via the merge's
    // beforeProvenance read.
    const parsedEvidence = safeParseJson(row.field_evidence_json);
    const evidenceRecord = asRecord(parsedEvidence);
    const fieldEvidence = evidenceRecord
      ? Object.fromEntries(
          Object.entries(evidenceRecord).filter(([key]) => !STYLE_ITEM_PROFILE_CONTROL_FIELDS.has(key as StyleItemProfileField)),
        )
      : parsedEvidence;
    return {
      fieldEvidence,
      sourceSnapshot: safeParseJson(row.source_snapshot_json),
      technicalMetadata: safeParseJson(row.technical_metadata_json),
      updatedAt: row.updated_at,
    };
  }

  async getItemProvenanceBatch(itemIds: string[]) {
    const rows = await this.repository.listProvenanceRows(itemIds);
    return new Map(rows.map((row) => {
      const parsedEvidence = safeParseJson(row.field_evidence_json);
      const evidenceRecord = asRecord(parsedEvidence);
      const fieldEvidence = evidenceRecord
        ? Object.fromEntries(
            Object.entries(evidenceRecord).filter(([key]) => !STYLE_ITEM_PROFILE_CONTROL_FIELDS.has(key as StyleItemProfileField)),
          )
        : parsedEvidence;
      return [row.item_id, {
        fieldEvidence,
        sourceSnapshot: safeParseJson(row.source_snapshot_json),
        technicalMetadata: safeParseJson(row.technical_metadata_json),
        updatedAt: row.updated_at,
      }] as const;
    }));
  }

  async getPhotoDeliveryAsset(photoId: string): Promise<{
    artifactId: string;
    mimeType: string;
    r2Key: string;
  } | null> {
    const row = await this.repository.getPhotoDeliveryRow(photoId);
    return this.mapPhotoDeliveryAsset(row);
  }

  async getPhotoDeliveryAssetForTenant(input: {
    photoId: string;
    tenantId: string;
  }): Promise<{
    artifactId: string;
    mimeType: string;
    r2Key: string;
  } | null> {
    const tenantId = input.tenantId.trim();
    if (!tenantId) {
      return null;
    }
    const row = await this.repository.getPhotoDeliveryRowForTenant(tenantId, input.photoId);
    return this.mapPhotoDeliveryAsset(row);
  }

  private mapPhotoDeliveryAsset(row: Awaited<ReturnType<StyleRepository['getPhotoDeliveryRow']>>): {
    artifactId: string;
    mimeType: string;
    r2Key: string;
  } | null {
    if (!row?.artifact_id || !row.r2_key) {
      return null;
    }
    return {
      artifactId: row.artifact_id,
      mimeType: row.mime_type ?? row.artifact_mime_type ?? 'application/octet-stream',
      r2Key: row.r2_key,
    };
  }

  async backfillOwnedPhotoAssets(input: {
    legacyBaseUrl?: string | null;
    legacyImageRoot?: string | null;
    limit?: number | null;
  }): Promise<{
    attempted: number;
    backfilled: number;
    failed: Array<{ photoId: string; reason: string }>;
    skipped: Array<{ photoId: string; reason: string }>;
  }> {
    const rows = await this.repository.listPhotosMissingArtifacts(input.limit);
    const failed: Array<{ photoId: string; reason: string }> = [];
    const skipped: Array<{ photoId: string; reason: string }> = [];
    let backfilled = 0;

    for (const row of rows) {
      const resolved = this.resolveBackfillSource({
        legacyBaseUrl: input.legacyBaseUrl ?? null,
        legacyImageRoot: input.legacyImageRoot ?? null,
        sourceUrl: row.source_url ?? row.url ?? null,
      });

      if (resolved.kind === 'skip') {
        skipped.push({ photoId: row.id, reason: resolved.reason });
        continue;
      }

      try {
        const ownedAsset = await this.ingestPhotoAsset({
          dataBase64: null,
          dataUrl: null,
          filePath: resolved.kind === 'file' ? resolved.filePath : null,
          itemId: row.item_id,
          mimeType: row.mime_type ?? null,
          photoId: row.id,
          sourceUrl: resolved.kind === 'remote' ? resolved.url : row.source_url ?? row.url ?? null,
        });
        if (!ownedAsset) {
          skipped.push({ photoId: row.id, reason: 'photo source could not be ingested' });
          continue;
        }

        await this.repository.updatePhotoAssetBinding({
          artifactId: ownedAsset.artifactId,
          mimeType: ownedAsset.mimeType,
          photoId: row.id,
          sourceUrl: row.source_url ?? row.url ?? null,
        });
        backfilled += 1;
      } catch (error) {
        failed.push({
          photoId: row.id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      attempted: rows.length,
      backfilled,
      failed,
      skipped,
    };
  }

  private async recordDomainEvent(input: {
    after: unknown;
    before: unknown;
    entityId: string;
    entityType: string;
    eventType: string;
    provenance: MutationProvenance;
  }) {
    await this.db
      .prepare(
        `INSERT INTO domain_events (
          id, tenant_id, domain, entity_type, entity_id, event_type,
          before_json, after_json, patch_json,
          source_agent, source_skill, session_id, confidence, source_type, actor_email, actor_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        `domain-event:${crypto.randomUUID()}`,
        this.repository.profileKey.tenantId,
        'style',
        input.entityType,
        input.entityId,
        input.eventType,
        stringifyJson(input.before),
        stringifyJson(input.after),
        stringifyJson({ eventType: input.eventType }),
        input.provenance.sourceAgent,
        input.provenance.sourceSkill,
        input.provenance.sessionId,
        input.provenance.confidence,
        input.provenance.sourceType,
        input.provenance.actorEmail,
        input.provenance.actorName,
      )
      .run();
  }

  private async buildPhotoDelivery(
    photoId: string,
    artifactId: string | null,
    artifactAvailable: boolean,
  ): Promise<StylePhotoDeliveryRecord | null> {
    if (!artifactId || !artifactAvailable || !this.options.origin) {
      return null;
    }
    return {
      auth: 'oauth_bearer',
      originalUrl: buildStyleImageUrl({
        origin: this.options.origin,
        photoId,
      }).originalUrl,
    };
  }

  private async buildFallbackSignedPhotoDelivery(
    photoId: string,
    artifactId: string | null,
  ): Promise<{ expiresAt: string; originalUrl: string } | null> {
    if (!artifactId || !this.options.origin || !this.options.imageDeliverySecret) {
      return null;
    }
    return buildSignedStyleImageUrl({
      origin: this.options.origin,
      photoId,
      secret: this.options.imageDeliverySecret,
      tenantId: this.repository.profileKey.tenantId,
    });
  }

  private async catalogQualityProvenanceUpdate(input: {
    beforeProvenance: Awaited<ReturnType<StyleService['getItemProvenance']>>;
    catalogSha256: string | null;
    duplicateResolution: {
      batchId?: string | null;
      candidateId: string;
      clientToken?: string | null;
      decision: 'use_existing';
    } | null;
    itemId: string;
    photos: Parameters<StyleRepository['replaceItemPhotos']>[1];
    qualityReview: StyleCatalogQualityReviewInput | null;
    retainedSourceArtifactId: string | null;
    retainedSourceSha256: string | null;
    sourceSnapshot: unknown;
  }): Promise<Parameters<StyleRepository['replaceItemPhotos']>[2] | undefined> {
    const requestedSnapshot = asRecord(parseJsonLike(input.sourceSnapshot));
    if (!input.qualityReview && !requestedSnapshot && !input.duplicateResolution) {
      return undefined;
    }
    const existingSnapshot = asRecord(parseJsonLike(input.beforeProvenance?.sourceSnapshot)) ?? {};
    const nextSnapshot: Record<string, unknown> = {
      ...existingSnapshot,
      ...(requestedSnapshot ?? {}),
    };
    const existingTechnicalMetadata = asRecord(parseJsonLike(input.beforeProvenance?.technicalMetadata)) ?? {};
    const nextTechnicalMetadata: Record<string, unknown> = { ...existingTechnicalMetadata };
    if (input.duplicateResolution) {
      const resolvedAt = new Date().toISOString();
      nextTechnicalMetadata.duplicateResolution = {
        ...input.duplicateResolution,
        resolvedAt,
      };
      const existingObservations = Array.isArray(existingSnapshot.duplicateObservations)
        ? existingSnapshot.duplicateObservations.slice(-19)
        : [];
      nextSnapshot.duplicateObservations = [
        ...existingObservations,
        {
          ...input.duplicateResolution,
          resolvedAt,
          source: requestedSnapshot ?? null,
        },
      ];
      if (input.duplicateResolution.clientToken) {
        const clientTokenSha256 = await hashClientToken(input.duplicateResolution.clientToken);
        const existingBindings = Array.isArray(existingSnapshot.duplicateCreateIdempotency)
          ? existingSnapshot.duplicateCreateIdempotency.filter((binding) =>
              asNullableString(asRecord(binding)?.clientTokenSha256) !== clientTokenSha256,
            )
          : [];
        nextSnapshot.duplicateCreateIdempotency = [
          ...existingBindings,
          {
            batchId: input.duplicateResolution.batchId ?? null,
            boundAt: resolvedAt,
            clientTokenSha256,
            decision: 'use_existing',
            targetItemId: input.itemId,
          },
        ];
      }
    }
    if (input.qualityReview) {
      const catalog = input.photos.find((photo) => photo.id === input.qualityReview?.catalogPhotoId) ?? null;
      if (
        !catalog
        || !catalog.artifactId
        || !input.catalogSha256
        || catalog.isPrimary !== true
        || catalog.isFit === true
        || catalog.kind !== 'product'
        || catalog.view !== 'front'
      ) {
        throw new Error('Catalog-ready attestation did not bind to one owned primary front-facing product image.');
      }
      const generated = input.qualityReview.catalogMode === 'host_generated';
      if (generated && (
        catalog.source !== 'generated_metadata'
        || catalog.importedFrom !== 'fluent_style_host_generated'
      )) {
        throw new Error('Host-generated Catalog approval requires the reserved generated Catalog tuple.');
      }
      if (!generated && (
        catalog.source === 'generated_metadata'
        || catalog.importedFrom === 'fluent_style_host_generated'
      )) {
        throw new Error('Inspected-source Catalog approval cannot classify generated media as source evidence.');
      }
      const source = generated
        ? input.photos.find((photo) => photo.id === input.qualityReview?.sourcePhotoId) ?? null
        : catalog;
      const sourceSha256 = generated ? input.retainedSourceSha256 : input.catalogSha256;
      const sourceArtifactId = generated ? input.retainedSourceArtifactId : catalog.artifactId;
      if (
        !source
        || !sourceArtifactId
        || !sourceSha256
        || source.artifactId !== sourceArtifactId
        || source.source === 'generated_metadata'
        || source.importedFrom === 'fluent_style_host_generated'
      ) {
        throw new Error('Catalog-ready attestation lost its exact retained source binding before persistence.');
      }
      const checks = {
        backgroundClean: true,
        centered: true,
        colorAndPatternMatch: true,
        detailsAndLogoMatch: true,
        frontFacing: true,
        fullSilhouette: true,
        identityAndCategoryMatch: true,
        scaleAndMatteConsistent: true,
      } as const;
      const generationInputSha256 = await sha256StyleCatalogBinding({
        itemId: input.itemId,
        mode: input.qualityReview.catalogMode,
        sourceArtifactId,
        sourcePhotoId: source.id,
        sourceSha256,
      });
      const reviewBoardSha256 = await sha256StyleCatalogBinding({
        catalogArtifactId: catalog.artifactId,
        catalogPhotoId: catalog.id,
        catalogSha256: input.catalogSha256,
        checks,
        generationInputSha256,
        itemId: input.itemId,
        mode: input.qualityReview.catalogMode,
        sourceArtifactId,
        sourcePhotoId: source.id,
        sourceSha256,
      });
      nextSnapshot.catalogNormalizationQuality = {
        catalogArtifactId: catalog.artifactId,
        catalogPhotoId: catalog.id,
        catalogSha256: input.catalogSha256,
        checks,
        generationInputSha256,
        itemId: input.itemId,
        mode: input.qualityReview.catalogMode,
        reviewBoardSha256,
        sourceArtifactId,
        sourcePhotoId: source.id,
        sourceSha256,
        status: 'approved',
      };
    }
    return {
      fieldEvidenceJson: stringifyJson(input.beforeProvenance?.fieldEvidence),
      sourceSnapshotJson: stringifyJson(nextSnapshot),
      technicalMetadataJson: stringifyJson(nextTechnicalMetadata),
    };
  }

  async mergeDuplicateItem(input: {
    mergeId?: string | null;
    provenance: MutationProvenance;
    sourceItemId: string;
    targetItemId: string;
  }) {
    const requestedMergeId = asNullableString(input.mergeId);
    if (!input.sourceItemId || !input.targetItemId || input.sourceItemId === input.targetItemId) {
      throw new Error('Style duplicate merge requires distinct source and target item IDs.');
    }
    const [sourceBefore, targetBefore] = await Promise.all([
      this.getItem(input.sourceItemId),
      this.getItem(input.targetItemId),
    ]);
    if (sourceBefore?.status === 'archived') {
      const sourceProvenance = await this.getItemProvenance(sourceBefore.id);
      const currentRedirect = asRecord(asRecord(sourceProvenance?.sourceSnapshot)?.duplicateMergeRedirect);
      const currentMergeId = asNullableString(currentRedirect?.mergeId);
      if (requestedMergeId !== currentMergeId) {
        throw new Error('Style duplicate merge rejected a different cycle identity for an already merged item.');
      }
      const redirect = await this.resolveDuplicateMergeRedirect(sourceBefore.id);
      if (redirect?.item?.status === 'active' && redirect.path.includes(input.targetItemId)) {
        return {
          archivedSourceItemId: sourceBefore.id,
          sourceStatus: sourceBefore.status,
          targetItem: redirect.item,
          targetItemId: redirect.item.id,
          transferredPhotoIds: [],
          verifiedOneActiveItem: true,
          eventRecorded: false,
          idempotentReplay: true,
          mergeId: currentMergeId,
        };
      }
    }
    if (!sourceBefore || sourceBefore.status !== 'active') {
      throw new Error(`Style duplicate source ${input.sourceItemId} is not an active closet item.`);
    }
    if (!targetBefore || targetBefore.status !== 'active') {
      throw new Error(`Style duplicate target ${input.targetItemId} is not an active closet item.`);
    }
    const sourcePhotoIds = sourceBefore.photos.map((photo) => photo.id);
    // A caller that does not yet understand merge cycle IDs must create a legacy
    // unbound cycle so that the same cached client can still Undo it. Current
    // clients always provide a UUID and therefore get the stronger bound path.
    const mergeId = requestedMergeId;
    const expectedPhotoIds = new Set([...targetBefore.photos, ...sourceBefore.photos].map((photo) => photo.id));
    const repositoryVerification = await this.repository.mergeDuplicateItem({
      mergeId,
      expectedPhotoCount: expectedPhotoIds.size,
      sourceItemId: input.sourceItemId,
      sourcePhotoIds,
      sourcePrimaryPhotoId: sourceBefore.photos.find((photo) => photo.isPrimary)?.id ?? null,
      targetItemId: input.targetItemId,
    });
    if (
      repositoryVerification.sourceStatus !== 'archived'
      || repositoryVerification.targetStatus !== 'active'
      || repositoryVerification.sourcePhotoCount !== 0
      || repositoryVerification.targetPhotoCount !== expectedPhotoIds.size
      || repositoryVerification.redirectTargetItemId !== input.targetItemId
    ) {
      throw new Error(`Style duplicate merge transaction did not produce the required canonical state: ${JSON.stringify(repositoryVerification)}.`);
    }
    let sourceAfter: StyleItemRecord | null = null;
    let targetAfter: StyleItemRecord | null = null;
    let readbackDegraded = false;
    try {
      [sourceAfter, targetAfter] = await Promise.all([
        this.getItem(input.sourceItemId),
        this.getItem(input.targetItemId),
      ]);
    } catch (error) {
      readbackDegraded = true;
      targetAfter = {
        ...targetBefore,
        photos: [...targetBefore.photos, ...sourceBefore.photos],
        status: 'active',
      };
      sourceAfter = { ...sourceBefore, status: 'archived' };
    }
    if (!sourceAfter || sourceAfter.status !== 'archived') {
      throw new Error('Style duplicate merge did not archive the redundant item.');
    }
    if (!targetAfter || targetAfter.status !== 'active') {
      throw new Error('Style duplicate merge did not preserve the canonical item.');
    }
    const actualPhotoIds = new Set(targetAfter.photos.map((photo) => photo.id));
    if (actualPhotoIds.size !== expectedPhotoIds.size || [...expectedPhotoIds].some((photoId) => !actualPhotoIds.has(photoId))) {
      throw new Error('Style duplicate merge did not preserve the complete combined photo set.');
    }
    let eventRecorded = true;
    try {
      await this.recordDomainEvent({
        after: { sourceItemId: sourceAfter.id, sourceStatus: sourceAfter.status, targetItemId: targetAfter.id, targetPhotoCount: targetAfter.photos.length },
        before: { sourceItemId: sourceBefore.id, sourcePhotoCount: sourceBefore.photos.length, targetItemId: targetBefore.id, targetPhotoCount: targetBefore.photos.length },
        entityId: targetAfter.id,
        entityType: 'style_item',
        eventType: 'style.duplicate_items_merged',
        provenance: input.provenance,
      });
    } catch (error) {
      // The item/photo transaction and its readback are authoritative. A secondary audit-event
      // failure must not tell the user that nothing changed and invite a destructive retry.
      eventRecorded = false;
    }
    return {
      archivedSourceItemId: sourceAfter.id,
      sourceStatus: sourceAfter.status,
      targetItem: targetAfter,
      targetItemId: targetAfter.id,
      transferredPhotoIds: sourcePhotoIds,
      verifiedOneActiveItem: sourceAfter.status === 'archived' && targetAfter.status === 'active',
      eventRecorded,
      idempotentReplay: false,
      mergeId,
      readbackDegraded,
    };
  }

  private async resolveDuplicateMergeRedirect(itemId: string) {
    const seen = new Set<string>([itemId]);
    const path: string[] = [];
    let currentId = itemId;
    for (let depth = 0; depth < 24; depth += 1) {
      const provenance = await this.getItemProvenance(currentId);
      const redirect = asRecord(asRecord(provenance?.sourceSnapshot)?.duplicateMergeRedirect);
      const targetItemId = asNullableString(redirect?.targetItemId);
      if (asNullableString(redirect?.undoneAt)) return path.length > 0 ? { item: await this.getItem(currentId), path } : null;
      if (!targetItemId) return path.length > 0 ? { item: await this.getItem(currentId), path } : null;
      if (seen.has(targetItemId)) throw new Error(`Style duplicate merge redirect cycle detected for ${itemId}.`);
      seen.add(targetItemId);
      path.push(targetItemId);
      const target = await this.getItem(targetItemId);
      if (target?.status === 'active') return { item: target, path };
      currentId = targetItemId;
    }
    throw new Error(`Style duplicate merge redirect chain is too deep for ${itemId}.`);
  }

  private async resolveDuplicateCreateIdempotency(clientTokenSha256: string): Promise<StyleItemRecord | null> {
    const rows = await this.repository.listDuplicateCreateIdempotencySnapshots();
    for (const row of rows) {
      const snapshot = asRecord(parseJsonLike(row.source_snapshot_json));
      const bindings = Array.isArray(snapshot?.duplicateCreateIdempotency)
        ? snapshot.duplicateCreateIdempotency
        : [];
      const matched = bindings.some((binding) =>
        asNullableString(asRecord(binding)?.clientTokenSha256) === clientTokenSha256
        && asNullableString(asRecord(binding)?.decision) === 'use_existing'
        && asNullableString(asRecord(binding)?.targetItemId) === row.item_id,
      );
      if (!matched) continue;
      const item = await this.getItem(row.item_id);
      if (!item || item.status !== 'active') {
        throw new Error(`Style duplicate idempotency target ${row.item_id} is unavailable.`);
      }
      return item;
    }
    return null;
  }

  private async hashOwnedPhotoBytes(photo: StylePhotoRecord): Promise<string> {
    if (!photo.artifactId || !this.options.artifacts) {
      throw new Error(`Cannot hash unowned Style source photo ${photo.id}.`);
    }
    const delivery = await this.repository.getPhotoDeliveryRow(photo.id);
    if (!delivery?.r2_key || delivery.artifact_id !== photo.artifactId) {
      throw new Error(`Style source photo ${photo.id} does not have an exact owned artifact binding.`);
    }
    const object = await this.options.artifacts.get(delivery.r2_key);
    if (!object) {
      throw new Error(`Style source photo ${photo.id} is missing its owned bytes.`);
    }
    return sha256StyleBytes(new Uint8Array(await object.arrayBuffer()));
  }

  private async createItemWithAtomicCatalogMedia(input: {
    fieldEvidence: unknown;
    hasHostProfile: boolean;
    item: {
      brand: string | null;
      category: string;
      colorFamily: string | null;
      colorHex: string | null;
      colorName: string | null;
      comparatorKey: string;
      formality: number | null;
      id: string;
      name: string | null;
      size: string | null;
      subcategory: string;
    };
    media: StyleAtomicCatalogMediaInput;
    profile: ReturnType<typeof normalizeStyleItemProfile>;
    profileMethod: 'heuristic_bootstrap' | 'host_text' | 'host_vision';
    provenance: MutationProvenance;
    sourceSnapshot: unknown;
    technicalMetadata: unknown;
  }): Promise<StyleItemRecord> {
    const media = input.media;
    const catalogUsesData = Boolean(media.catalogImageDataUrl?.trim());
    const catalogUsesHosted = Boolean(media.catalogHostedFileDownloadUrl?.trim());
    const catalogUsesUrl = Boolean(media.catalogImageUrl?.trim());
    if ([catalogUsesData, catalogUsesHosted, catalogUsesUrl].filter(Boolean).length !== 1) {
      throw new Error('Atomic Style create requires exactly one owned Catalog byte source.');
    }
    const generated = media.imageOrigin === 'host_generated';
    const sourceUsesData = Boolean(media.retainedSourceImageDataUrl?.trim());
    const sourceUsesHosted = Boolean(media.retainedSourceHostedFileDownloadUrl?.trim());
    if (generated && sourceUsesData === sourceUsesHosted) {
      throw new Error('Atomic host-generated Style create requires exactly one retained source byte input.');
    }
    if (!generated && (sourceUsesData || sourceUsesHosted)) {
      throw new Error('Atomic inspected-source Style create uses the Catalog bytes as source evidence and cannot accept a second retained source.');
    }

    const catalogPhotoId = `style-photo:${input.item.id}:${generated ? 'catalog' : 'primary'}`;
    const sourcePhotoId = generated ? `style-photo:${input.item.id}:source-${crypto.randomUUID()}` : null;
    const createdArtifacts: Array<{ id: string; r2_key: string }> = [];
    let committed = false;
    try {
      // Reading and validating the image bytes runs before any item or photo row is written. Those
      // failures are typed (unusableStage) so the public create can save the item text-first instead
      // of losing it (D24). Storage failures stay ordinary errors; artifacts are cleaned below.
      const catalogAsset = await this.ingestPhotoAsset({
        dataBase64: null,
        dataUrl: media.catalogImageDataUrl?.trim() || null,
        hostedFileDownloadUrl: media.catalogHostedFileDownloadUrl?.trim() || null,
        itemId: input.item.id,
        mimeType: null,
        photoId: catalogPhotoId,
        sourceUrl: media.catalogImageUrl?.trim() || null,
        unusableStage: 'catalog',
      });
      if (!catalogAsset) throw new Error('Atomic Style create could not retain the required Catalog bytes.');
      createdArtifacts.push({ id: catalogAsset.artifactId, r2_key: catalogAsset.r2Key });

      const retainedSourceAsset = generated && sourcePhotoId
        ? await this.ingestPhotoAsset({
            dataBase64: null,
            dataUrl: media.retainedSourceImageDataUrl?.trim() || null,
            hostedFileDownloadUrl: media.retainedSourceHostedFileDownloadUrl?.trim() || null,
            itemId: input.item.id,
            mimeType: null,
            photoId: sourcePhotoId,
            sourceUrl: null,
            unusableStage: 'source',
          })
        : null;
      if (generated && !retainedSourceAsset) {
        throw new Error('Atomic Style create could not retain the required source bytes.');
      }
      if (retainedSourceAsset) createdArtifacts.push({ id: retainedSourceAsset.artifactId, r2_key: retainedSourceAsset.r2Key });

      const photos: Parameters<StyleRepository['replaceItemPhotos']>[1] = [
        {
          artifactId: catalogAsset.artifactId,
          bgRemoved: media.backgroundRemoved === true,
          capturedAt: null,
          createdAt: null,
          id: catalogPhotoId,
          importedFrom: generated ? 'fluent_style_host_generated' : 'fluent_style_user_source',
          isFit: false,
          isPrimary: true,
          kind: 'product',
          legacyPhotoId: null,
          mimeType: catalogAsset.mimeType,
          source: generated ? 'generated_metadata' : 'user_upload',
          sourceUrl: null,
          url: `artifact:${catalogPhotoId}`,
          view: 'front',
        },
        ...(retainedSourceAsset && sourcePhotoId
          ? [{
              artifactId: retainedSourceAsset.artifactId,
              bgRemoved: false,
              capturedAt: null,
              createdAt: null,
              id: sourcePhotoId,
              importedFrom: 'fluent_style_user_source',
              isFit: (media.retainedSourceImageType ?? 'alternate') === 'fit',
              isPrimary: false,
              kind: (media.retainedSourceImageType ?? 'alternate') === 'fit' ? 'fit' : 'product',
              legacyPhotoId: null,
              mimeType: retainedSourceAsset.mimeType,
              source: 'user_upload',
              sourceUrl: null,
              url: `artifact:${sourcePhotoId}`,
              view: (media.retainedSourceImageType ?? 'alternate') === 'fit' ? 'fit_front' : 'front',
            } satisfies Parameters<StyleRepository['replaceItemPhotos']>[1][number]]
          : []),
      ];
      const provenance = await this.catalogQualityProvenanceUpdate({
        beforeProvenance: {
          fieldEvidence: input.fieldEvidence,
          sourceSnapshot: input.sourceSnapshot,
          technicalMetadata: input.technicalMetadata,
          updatedAt: null,
        },
        catalogSha256: catalogAsset.sha256,
        duplicateResolution: null,
        itemId: input.item.id,
        photos,
        qualityReview: {
          catalogMode: generated ? 'host_generated' : 'inspected_source',
          catalogPhotoId,
          sourcePhotoId,
        },
        retainedSourceArtifactId: retainedSourceAsset?.artifactId ?? (generated ? null : catalogAsset.artifactId),
        retainedSourceSha256: retainedSourceAsset?.sha256 ?? (generated ? null : catalogAsset.sha256),
        sourceSnapshot: {
          ...(asRecord(parseJsonLike(input.sourceSnapshot)) ?? {}),
          imageInput: catalogUsesData ? 'inline_data_url' : 'hosted_file_download',
          imageOrigin: media.imageOrigin,
        },
      });
      if (!provenance) throw new Error('Atomic Style create did not produce the required provenance binding.');
      const profile = input.hasHostProfile
        ? input.profile
        : deriveBaselineStyleItemProfile({
            category: input.item.category,
            comparatorKey: input.item.comparatorKey,
            formality: input.item.formality,
            name: input.item.name,
            subcategory: input.item.subcategory,
          });
      const profileSource = input.hasHostProfile ? 'style_host_onboarding' : 'style_auto_bootstrap';
      const profileMethod = input.hasHostProfile ? input.profileMethod : 'heuristic_bootstrap';
      const committedFallback: StyleItemRecord = {
        brand: input.item.brand,
        category: input.item.category,
        colorFamily: input.item.colorFamily,
        colorHex: input.item.colorHex,
        colorName: input.item.colorName,
        comparatorKey: input.item.comparatorKey as StyleItemRecord['comparatorKey'],
        createdAt: null,
        formality: input.item.formality,
        id: input.item.id,
        legacyItemId: null,
        name: input.item.name,
        photos: photos.map((photo) => ({
          artifactAvailable: true,
          artifactId: photo.artifactId,
          bgRemoved: photo.bgRemoved,
          capturedAt: photo.capturedAt,
          createdAt: photo.createdAt,
          delivery: null,
          id: photo.id,
          importedFrom: photo.importedFrom,
          isFit: photo.isFit,
          isPrimary: photo.isPrimary,
          itemId: input.item.id,
          kind: photo.kind as StylePhotoRecord['kind'],
          legacyPhotoId: photo.legacyPhotoId,
          mimeType: photo.mimeType,
          source: photo.source as StylePhotoRecord['source'],
          sourceUrl: photo.sourceUrl,
          url: photo.url,
          view: photo.view,
        })),
        profile: {
          itemId: input.item.id,
          legacyProfileId: null,
          method: profileMethod,
          raw: profile,
          source: profileSource,
          updatedAt: null,
        },
        size: input.item.size,
        status: 'active',
        subcategory: input.item.subcategory,
        tenantId: this.repository.profileKey.tenantId,
        updatedAt: null,
      };
      await this.repository.createItemWithPhotos({
        event: {
          actorEmail: input.provenance.actorEmail,
          actorName: input.provenance.actorName,
          afterJson: stringifyJson(summarizeStyleItem(committedFallback)),
          confidence: input.provenance.confidence,
          id: `domain-event:${crypto.randomUUID()}`,
          sessionId: input.provenance.sessionId,
          sourceAgent: input.provenance.sourceAgent,
          sourceSkill: input.provenance.sourceSkill,
          sourceType: input.provenance.sourceType,
        },
        item: input.item,
        photos,
        profile: {
          method: profileMethod,
          rawJson: JSON.stringify(profile),
          source: profileSource,
        },
        provenance,
      });
      committed = true;
      try {
        const created = await this.getItem(input.item.id);
        if (created?.status === 'active' && created.photos.length === photos.length) {
          return created;
        }
      } catch {
        // The repository batch atomically verified the complete item/media state and durable event.
        // A secondary presentation readback failure cannot turn that committed success into a retry risk.
      }
      return committedFallback;
    } catch (error) {
      if (!committed) await this.cleanupUnreferencedPhotoArtifacts(createdArtifacts);
      throw error;
    }
  }

  private async ingestPhotoAsset(input: {
    dataBase64: string | null;
    dataUrl: string | null;
    filePath?: string | null;
    hostedFileDownloadUrl?: string | null;
    itemId: string;
    mimeType: string | null;
    photoId: string;
    sourceUrl: string | null;
    // Set by the atomic Catalog create: a failure to read or validate the image bytes is raised as
    // StyleCatalogMediaUnusableError so the caller can save the item text-first.
    unusableStage?: 'catalog' | 'source';
    // Set when the caller asked for a linked image to be copied: a failed download is an
    // outcome-neutral image-input error (the photo is not attached), never a silent reference.
    copyRequested?: boolean;
  }): Promise<{ artifactId: string; mimeType: string; r2Key: string; sha256: string } | null> {
    if (!this.options.artifacts) {
      return null;
    }
    // SSRF gate: a request whose only image source is an http(s) link would make
    // parseOwnedStyleAsset download it. Without strict public fetch that never happens: an ordinary
    // photo keeps the link as a reference, and a Catalog photo is unusable (the create saves text-first).
    const onlyRemoteLink = !input.dataBase64?.trim()
      && !input.dataUrl?.trim()
      && !input.filePath?.trim()
      && !input.hostedFileDownloadUrl?.trim()
      && /^https?:\/\//i.test(input.sourceUrl?.trim() ?? '');
    if (onlyRemoteLink && !this.fetchesCallerImageUrls()) {
      if (input.unusableStage) {
        throw new StyleCatalogMediaUnusableError(STYLE_SELF_HOSTED_IMAGE_LINK_REASON, input.unusableStage);
      }
      if (input.copyRequested) {
        throw new StyleImageInputError(STYLE_SELF_HOSTED_IMAGE_LINK_REASON);
      }
      return null;
    }

    let ownedAsset: Awaited<ReturnType<typeof parseOwnedStyleAsset>>;
    try {
      ownedAsset = await parseOwnedStyleAsset({
        dataBase64: input.dataBase64,
        dataUrl: input.dataUrl,
        filePath: input.filePath ?? null,
        hostedFileDownloadUrl: input.hostedFileDownloadUrl ?? null,
        mimeTypeHint: input.mimeType,
        sourceUrl: input.sourceUrl,
      });
    } catch (error) {
      if (input.unusableStage) {
        throw new StyleCatalogMediaUnusableError(styleImageNotAttachedReason(error), input.unusableStage);
      }
      if (input.copyRequested) {
        throw new StyleImageInputError(`the image link could not be copied into Fluent (${styleImageNotAttachedReason(error)})`);
      }
      throw error;
    }
    if (!ownedAsset) {
      if (input.unusableStage) {
        throw new StyleCatalogMediaUnusableError('the image reference is not a downloadable image', input.unusableStage);
      }
      if (input.copyRequested) {
        throw new StyleImageInputError('the image link is not a downloadable image');
      }
      return null;
    }

    const r2Key = buildStyleAssetKey({
      artifactId: ownedAsset.artifactId,
      extension: ownedAsset.extension,
      itemId: input.itemId,
      photoId: input.photoId,
      tenantId: this.repository.profileKey.tenantId,
    });

    await this.options.artifacts.put(r2Key, ownedAsset.bytes, {
      customMetadata: {
        item_id: input.itemId,
        photo_id: input.photoId,
      },
      httpMetadata: {
        cacheControl: 'public, max-age=31536000, immutable',
        contentType: ownedAsset.mimeType,
      },
    });

    try {
      await this.repository.upsertArtifact({
        artifactId: ownedAsset.artifactId,
        artifactType: 'style_photo_original',
        entityId: input.photoId,
        entityType: 'style_item_photo',
        metadataJson: stringifyJson({
          itemId: input.itemId,
          photoId: input.photoId,
          sourceUrl: ownedAsset.sourceUrl,
        }),
        mimeType: ownedAsset.mimeType,
        r2Key,
      });
    } catch (error) {
      await this.options.artifacts.delete?.(r2Key);
      throw error;
    }

    return {
      artifactId: ownedAsset.artifactId,
      mimeType: ownedAsset.mimeType,
      r2Key,
      sha256: await sha256StyleBytes(ownedAsset.bytes),
    };
  }

  private async cleanupUnreferencedPhotoArtifacts(artifacts: Array<{ id: string; r2_key: string }>): Promise<void> {
    const uniqueArtifacts = [...new Map(artifacts.map((artifact) => [artifact.id, artifact])).values()];
    for (const artifact of uniqueArtifacts) {
      const unreferenced = await this.repository.getUnreferencedArtifact(artifact.id);
      if (!unreferenced) {
        continue;
      }
      const blobDelete = this.options.artifacts?.delete?.bind(this.options.artifacts);
      if (!blobDelete && !await this.repository.hasOtherArtifactAtR2Key(unreferenced.id, unreferenced.r2_key)) {
        throw new Error(`Cannot delete superseded Style artifact ${unreferenced.id}: blob deletion is unavailable.`);
      }
      // Release the row first, atomically and only while unreferenced; only that release permits the
      // blob delete. Photo writes refuse to reference a released artifact (see the repository guard),
      // so no committed row can reference a blob deleted here. A failed blob delete leaks a blob
      // (never a broken reference).
      if (!await this.repository.deleteArtifactIfUnreferenced(unreferenced.id)) {
        continue;
      }
      const keyIsShared = await this.repository.hasOtherArtifactAtR2Key(unreferenced.id, unreferenced.r2_key);
      if (!keyIsShared && blobDelete) {
        await blobDelete(unreferenced.r2_key);
        await blobDelete(buildStyleDerivedImageAssetKey(unreferenced.r2_key, 'thumbnail'));
        await blobDelete(buildStyleDerivedImageAssetKey(unreferenced.r2_key, 'detail'));
      }
    }
  }

  private resolveBackfillSource(input: {
    legacyBaseUrl: string | null;
    legacyImageRoot: string | null;
    sourceUrl: string | null;
  }):
    | { kind: 'remote'; url: string }
    | { kind: 'file'; filePath: string }
    | { kind: 'skip'; reason: string } {
    const sourceUrl = input.sourceUrl?.trim() || null;
    if (!sourceUrl) {
      return { kind: 'skip', reason: 'missing source URL' };
    }
    if (sourceUrl.startsWith('artifact:')) {
      return { kind: 'skip', reason: 'already points at artifact placeholder without source bytes' };
    }
    if (/^https?:\/\//i.test(sourceUrl)) {
      return { kind: 'remote', url: sourceUrl };
    }
    if (sourceUrl.startsWith('/')) {
      if (input.legacyImageRoot) {
        return {
          kind: 'file',
          filePath: path.join(input.legacyImageRoot, ...sourceUrl.replace(/^\/+/, '').split('/')),
        };
      }
      if (input.legacyBaseUrl) {
        return { kind: 'remote', url: new URL(sourceUrl, input.legacyBaseUrl).toString() };
      }
      return { kind: 'skip', reason: 'relative legacy image path needs --legacy-base-url or --legacy-image-root' };
    }
    return { kind: 'skip', reason: 'unsupported photo source format' };
  }

  private async mapPhotoRow(row: {
    artifact_id?: string | null;
    artifact_exists?: unknown;
    bg_removed: unknown;
    captured_at?: string | null;
    created_at: string | null;
    id: string;
    imported_from: string | null;
    is_fit: unknown;
    is_primary: unknown;
    item_id: string;
    kind?: string | null;
    legacy_photo_id: number | null;
    mime_type?: string | null;
    source?: string | null;
    source_url?: string | null;
    url: string;
    view: string | null;
  }): Promise<StylePhotoRecord> {
    const isFit = asBoolean(row.is_fit);
    // Keep retained source evidence separate from the display transport. Owned
    // photos use an artifact:<photoId> display URL; that pseudo-URL is not a
    // source reference and must never satisfy source-evidence replay checks.
    const sourceUrl = row.source_url ?? null;
    const artifactAvailable = asBoolean(row.artifact_exists);
    const delivery = await this.buildPhotoDelivery(row.id, row.artifact_id ?? null, artifactAvailable);
    return {
      artifactAvailable,
      artifactId: row.artifact_id ?? null,
      bgRemoved: asBoolean(row.bg_removed),
      capturedAt: row.captured_at ?? null,
      createdAt: row.created_at,
      delivery,
      id: row.id,
      importedFrom: row.imported_from,
      isFit,
      isPrimary: asBoolean(row.is_primary),
      itemId: row.item_id,
      kind: inferStylePhotoKind({
        isFit,
        kind: row.kind,
        view: row.view,
      }),
      legacyPhotoId: row.legacy_photo_id,
      mimeType: row.mime_type ?? null,
      source: inferStylePhotoSource({
        importedFrom: row.imported_from,
        source: row.source,
        url: sourceUrl,
      }),
      sourceUrl,
      url: row.url,
      view: normalizeStylePhotoView(row.view),
    };
  }
}

function buildComparatorCoverage(input: {
  candidateCategory: string;
  candidateComparatorKey: string | null;
  exactComparatorCount: number;
  sameCategoryCount: number;
  typedRoleCount: number;
}): StyleComparatorCoverage {
  if (input.exactComparatorCount > 0) {
    return {
      exactComparatorCount: input.exactComparatorCount,
      mode: 'exact_comparator',
      note: null,
      sameCategoryCount: input.sameCategoryCount,
      typedRoleCount: input.typedRoleCount,
    };
  }

  if (input.typedRoleCount > 0) {
    return {
      exactComparatorCount: 0,
      mode: 'typed_role',
      note:
        input.candidateComparatorKey && input.candidateComparatorKey !== 'unknown'
          ? `No exact ${input.candidateComparatorKey} comparators found; falling back to similar wardrobe-job context.`
          : 'No exact wardrobe match found; falling back to similar wardrobe-job context.',
      sameCategoryCount: input.sameCategoryCount,
      typedRoleCount: input.typedRoleCount,
    };
  }

  if (input.sameCategoryCount > 0) {
    return {
      exactComparatorCount: 0,
      mode: 'category_fallback',
      note:
        input.candidateComparatorKey && input.candidateComparatorKey !== 'unknown'
          ? `No exact ${input.candidateComparatorKey} comparators found; falling back to closest ${input.candidateCategory.toLowerCase()} closet context.`
          : `No exact wardrobe match found; falling back to closest ${input.candidateCategory.toLowerCase()} closet context.`,
      sameCategoryCount: input.sameCategoryCount,
      typedRoleCount: 0,
    };
  }

  return {
    exactComparatorCount: 0,
    mode: 'sparse',
    note: `No meaningful ${input.candidateCategory.toLowerCase()} comparator coverage found in the current closet.`,
    sameCategoryCount: 0,
    typedRoleCount: 0,
  };
}

function isIncomingGeneratedCatalogPhotoTuple(photo: Record<string, unknown>): boolean {
  return asNullableString(photo.imported_from ?? photo.importedFrom) === 'fluent_style_host_generated'
    && asNullableString(photo.source) === 'generated_metadata'
    && asNullableString(photo.kind) === 'product'
    && asNullableString(photo.view) === 'front'
    && !asBoolean(photo.is_fit ?? photo.isFit);
}

function isPersistedGeneratedCatalogPhotoTuple(photo: Record<string, unknown>): boolean {
  if (!isIncomingGeneratedCatalogPhotoTuple(photo)) return false;
  const artifactBacked = asNullableString(photo.artifact_id ?? photo.artifactId) !== null
    && asBoolean(photo.artifact_exists ?? photo.artifactAvailable);
  const sourceUrl = asNullableString(photo.source_url ?? photo.sourceUrl);
  const referenceBacked = sourceUrl !== null
    && asNullableString(photo.url) === sourceUrl
    && normalizeStyleRemoteImageSourceUrl(sourceUrl) !== null;
  return artifactBacked || referenceBacked;
}

function pickRepresentativeItems(items: StyleItemRecord[]): StyleItemSummaryRecord[] {
  if (items.length === 0) {
    return [];
  }

  const byCategoryCount = new Map<string, number>();
  for (const item of items) {
    if (item.category) {
      byCategoryCount.set(item.category, (byCategoryCount.get(item.category) ?? 0) + 1);
    }
  }

  const sortedItems = [...items].sort((left, right) => {
    const leftCount = left.category ? byCategoryCount.get(left.category) ?? 0 : 0;
    const rightCount = right.category ? byCategoryCount.get(right.category) ?? 0 : 0;
    if (rightCount !== leftCount) {
      return rightCount - leftCount;
    }
    return (left.name ?? left.id).localeCompare(right.name ?? right.id);
  });

  const picked: StyleItemRecord[] = [];
  const usedCategories = new Set<string>();
  for (const item of sortedItems) {
    if (picked.length >= 5) {
      break;
    }
    if (item.category && !usedCategories.has(item.category)) {
      picked.push(item);
      usedCategories.add(item.category);
    }
  }

  for (const item of sortedItems) {
    if (picked.length >= 5) {
      break;
    }
    if (!picked.some((entry) => entry.id === item.id)) {
      picked.push(item);
    }
  }

  return picked.slice(0, 5).map((item) => summarizeStyleItem(item));
}

function clampVisualBundleMaxImages(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 8;
  }
  // Ceiling raised 12 -> 120 so the full closet viewer can sign every shown item (it requests
  // maxImages = page size, up to 120). Comparator/purchase-analysis callers request <= 8, so this
  // does not change their behaviour.
  return Math.min(120, Math.max(1, Math.trunc(value)));
}

function buildVisualBundleItemContext(item: StyleItemRecord): StyleVisualBundleItemContext {
  const profile = item.profile?.raw ?? null;
  return {
    brand: item.brand,
    category: item.category,
    colorFamily: item.colorFamily,
    colorName: item.colorName,
    comparatorKey: item.comparatorKey,
    fabricHand: profile?.fabricHand ?? null,
    formality: item.formality,
    itemType: profile?.itemType ?? null,
    name: item.name,
    pairingNotes: profile?.pairingNotes ?? null,
    polishLevel: profile?.polishLevel ?? null,
    qualityTier: profile?.qualityTier ?? null,
    silhouette: profile?.silhouette ?? null,
    status: item.status,
    styleRole: profile?.styleRole ?? null,
    subcategory: item.subcategory,
    tags: clampVisualBundleStrings(profile?.tags ?? [], 12),
    texture: profile?.texture ?? null,
    useCases: clampVisualBundleStrings(profile?.useCases ?? [], 8),
    visualWeight: profile?.visualWeight ?? null,
  };
}

function buildVisualBundleComparisonContextByItemId(
  analysis: StylePurchaseAnalysis,
): Map<string, StyleVisualBundleComparisonContext> {
  const contexts = new Map<string, StyleVisualBundleComparisonContext>();
  const ensureContext = (itemId: string): StyleVisualBundleComparisonContext => {
    const existing = contexts.get(itemId);
    if (existing) {
      return existing;
    }
    const created: StyleVisualBundleComparisonContext = {
      bucketRoles: [],
      confidence: null,
      descriptorDeltas: [],
      notes: [],
      overlapScore: null,
      reasons: [],
      rejectedBecause: null,
      relation: null,
      summary: null,
    };
    contexts.set(itemId, created);
    return created;
  };
  const addBucketMatches = (
    role: StyleVisualBundleComparisonBucketRole,
    entries: StylePurchaseAnalysisItemMatch[],
  ) => {
    for (const entry of entries) {
      const context = ensureContext(entry.itemId);
      addUniqueVisualBundleValue(context.bucketRoles, role);
      addUniqueVisualBundleValues(context.reasons, entry.reasons);
    }
  };

  for (const comparison of analysis.comparatorReasoning.topComparisons) {
    const context = ensureContext(comparison.itemId);
    addUniqueVisualBundleValue(context.bucketRoles, 'top_comparison');
    context.confidence = comparison.confidence;
    context.overlapScore = comparison.overlapScore;
    context.relation = comparison.relation;
    context.summary = comparison.summary;
    addUniqueVisualBundleValues(context.notes, comparison.notes);
  }

  addBucketMatches('exact_comparator', analysis.contextBuckets.exactComparatorItems);
  addBucketMatches('typed_role', analysis.contextBuckets.typedRoleItems);
  addBucketMatches('same_category', analysis.contextBuckets.sameCategoryItems);
  addBucketMatches('same_color_family', analysis.contextBuckets.sameColorFamilyItems);
  addBucketMatches('nearby_formality', analysis.contextBuckets.nearbyFormalityItems);
  addBucketMatches('pairing_candidate', analysis.contextBuckets.pairingCandidates);

  for (const rejected of analysis.contextBuckets.nonComparatorItems) {
    const context = ensureContext(rejected.itemId);
    addUniqueVisualBundleValue(context.bucketRoles, 'rejected_non_comparator');
    context.rejectedBecause = rejected.rejectedBecause;
    addUniqueVisualBundleValues(context.reasons, rejected.reasons);
  }

  for (const rejected of analysis.comparatorReasoning.rejectedComparisons) {
    const context = ensureContext(rejected.itemId);
    addUniqueVisualBundleValue(context.bucketRoles, 'rejected_non_comparator');
    context.rejectedBecause = context.rejectedBecause ?? rejected.rejectedBecause;
    addUniqueVisualBundleValues(context.reasons, rejected.reasons);
  }

  for (const delta of analysis.descriptorDeltas) {
    const context = ensureContext(delta.itemId);
    addUniqueVisualBundleValues(context.descriptorDeltas, delta.notes);
  }

  return contexts;
}

function addUniqueVisualBundleValue<T>(target: T[], value: T): void {
  if (!target.includes(value)) {
    target.push(value);
  }
}

function addUniqueVisualBundleValues(target: string[], values: string[]): void {
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length > 0 && !target.includes(trimmed)) {
      target.push(trimmed);
    }
  }
}

function clampVisualBundleStrings(values: string[], maxLength: number): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, maxLength);
}

function normalizeStyleArchiveMatchName(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized : null;
}

function rankStyleArchiveNameCandidates(items: StyleItemRecord[], requestedName: string | null): StyleItemRecord[] {
  const requestedKey = normalizeStyleArchiveMatchName(requestedName);
  if (!requestedKey) {
    return [];
  }
  const requestedTokens = new Set(requestedKey.split(' '));
  return items
    .map((item) => {
      const itemKey = normalizeStyleArchiveMatchName(item.name);
      if (!itemKey) {
        return { item, score: 0 };
      }
      const itemTokens = new Set(itemKey.split(' '));
      const sharedTokenCount = [...requestedTokens].filter((token) => itemTokens.has(token)).length;
      const containmentScore = itemKey.includes(requestedKey) || requestedKey.includes(itemKey) ? 2 : 0;
      const activeScore = item.status === 'active' ? 0.25 : 0;
      return {
        item,
        score: containmentScore + sharedTokenCount / Math.max(requestedTokens.size, 1) + activeScore,
      };
    })
    .filter((entry) => entry.score >= 0.75)
    .sort((left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id))
    .slice(0, 6)
    .map((entry) => entry.item);
}

function selectBestVisualBundlePhoto(
  photos: StylePhotoRecord[],
  preference: 'product' | 'fit' = 'fit',
  sourceEvidenceOnly = false,
): StylePhotoRecord | null {
  // Grid/catalog presentation excludes worn fit photos, but must not discard retained source,
  // detail, or unknown-view media before deliverability is considered. Legacy imports often
  // carry their only healthy source image under one of those non-product labels.
  const roleCandidates = preference === 'product' ? photos.filter((photo) => !isStyleFitPhoto(photo)) : photos;
  // Repair reads must recover the exact retained/source evidence, never a generated presentation
  // derivative that happens to be primary or incompletely classified as Catalog. Normal Closet,
  // purchase, and visual-bundle selection deliberately keep their existing generated-media path.
  const evidenceCandidates = sourceEvidenceOnly
    ? roleCandidates.filter((photo) => photo.source !== 'generated_metadata' && photo.importedFrom !== 'fluent_style_host_generated')
    : roleCandidates;
  // Eligibility is stricter than ranking: a saved row is not visual evidence unless Fluent can
  // deliver its owned artifact or the retained source is a validated public HTTPS URL. This keeps
  // private, insecure, and relative legacy references out of MCP structured content entirely.
  const candidates = evidenceCandidates.filter(isDeliverableVisualBundlePhoto);
  if (candidates.length === 0) {
    return null;
  }
  const hasDeliverableNonGeneratedPrimary = candidates.some((photo) =>
    photo.isPrimary && photo.source !== 'generated_metadata',
  );

  const sorted = [...candidates].sort((left, right) => {
    const leftScore = scoreVisualBundlePhoto(left, preference, hasDeliverableNonGeneratedPrimary);
    const rightScore = scoreVisualBundlePhoto(right, preference, hasDeliverableNonGeneratedPrimary);
    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }
    if (left.isPrimary !== right.isPrimary) {
      return left.isPrimary ? -1 : 1;
    }
    return left.id.localeCompare(right.id);
  });
  return sorted[0] ?? null;
}

function isDeliverableVisualBundlePhoto(photo: StylePhotoRecord): boolean {
  if (photo.artifactAvailable === true) {
    return true;
  }
  const sourceUrl = photo.sourceUrl?.trim() || photo.url?.trim() || '';
  return normalizeStyleRemoteImageSourceUrl(sourceUrl) !== null;
}

function scoreVisualBundlePhoto(
  photo: StylePhotoRecord,
  preference: 'product' | 'fit' = 'fit',
  hasDeliverableNonGeneratedPrimary = false,
): number {
  const hasArtifact = photo.artifactAvailable === true;
  const sourceUrl = photo.sourceUrl?.trim() || photo.url?.trim() || '';
  const hasRetainedRemoteCandidate = normalizeStyleRemoteImageSourceUrl(sourceUrl) !== null;
  const isFit = isStyleFitPhoto(photo);
  const isProduct = isStyleDisplayPhoto(photo);

  // Product/Grid mode ranks actual deliverability first, then clean product semantics. This lets
  // a retained source/detail image beat a dangling legacy row merely labelled as a product photo.
  if (preference === 'product') {
    const isGeneratedCatalog = photo.source === 'generated_metadata'
      && photo.importedFrom === 'fluent_style_host_generated'
      && photo.kind === 'product'
      && photo.view === 'front'
      && (photo.isPrimary || !hasDeliverableNonGeneratedPrimary)
      && !isFit;
    const deliverabilityScore = hasArtifact ? 30 : hasRetainedRemoteCandidate ? 20 : 0;
    // Catalog is presentation, Original is truth. A valid generated Catalog reference must remain
    // the grid/detail presentation even when an owned Original is also available for trust review.
    return (isGeneratedCatalog ? 40 : 0) + deliverabilityScore + (isProduct ? 4 : 0) + (photo.isPrimary ? 1 : 0);
  }

  // Default fit mode preserves purchase-analysis/comparator behaviour where worn imagery is
  // richer for silhouette reasoning.
  const preferred = isFit;
  const secondary = isProduct;

  let score = 0;
  if (preferred) {
    score = hasArtifact ? 10 : hasRetainedRemoteCandidate ? 7 : 3;
  } else if (secondary) {
    score = hasArtifact ? 8 : hasRetainedRemoteCandidate ? 5 : 2;
  } else {
    score = hasArtifact ? 7 : hasRetainedRemoteCandidate ? 4 : 1;
  }
  if (photo.isPrimary) {
    score += 1;
  }
  return score;
}

function hasStyleDescriptors(profile: StyleItemProfileRecord['raw'] | null | undefined): boolean {
  if (!profile) {
    return false;
  }
  return Boolean(
    profile.silhouette ||
      profile.visualWeight ||
      profile.texture ||
      profile.fabricHand ||
      profile.polishLevel ||
      profile.structureLevel ||
      profile.qualityTier ||
      (profile.seasonality?.length ?? 0) > 0 ||
      (profile.useCases?.length ?? 0) > 0 ||
      (profile.avoidUseCases?.length ?? 0) > 0 ||
      (profile.fitObservations?.length ?? 0) > 0,
  );
}

function hasUsableStyleProfileEvidence(profile: StyleItemProfileRecord['raw'] | null | undefined): boolean {
  if (!profile) {
    return false;
  }
  if (hasStyleDescriptors(profile)) {
    return true;
  }
  return Boolean(
    profile.itemType ||
      profile.pairingNotes ||
      profile.styleRole ||
      (profile.tags?.length ?? 0) > 0 ||
      (profile.bestOccasions?.length ?? 0) > 0 ||
      (profile.avoidOccasions?.length ?? 0) > 0 ||
      profile.dressCode?.min != null ||
      profile.dressCode?.max != null,
  );
}

const STYLE_PRODUCT_SAFE_DESCRIPTOR_FIELDS = ['texture', 'fabricHand', 'polishLevel', 'qualityTier'] as const;
const STYLE_FIT_PREFERRED_DESCRIPTOR_FIELDS = ['silhouette', 'visualWeight', 'structureLevel'] as const;
const STYLE_FIT_REQUIRED_DESCRIPTOR_FIELDS = ['fitObservations'] as const;

function buildDescriptorBacklogEntry(input: {
  blockedByPhoto: boolean;
  item: StyleItemRecord;
  priority: number;
  reasons: string[];
  sourceSignals: string[];
}): StyleDescriptorBacklogEntry {
  const photoSupport = descriptorPhotoSupport(input.item);
  const missingDescriptorFields = missingStyleDescriptorFields(input.item.profile?.raw ?? null, photoSupport);
  const priority = input.priority >= 5 ? 'high' : input.priority >= 3 ? 'medium' : 'low';
  const reasons = [...input.reasons];

  if (photoSupport.deliverableFitPhoto) {
    reasons.push('fit imagery is available, so silhouette and fit descriptors can be captured confidently');
  } else if (photoSupport.deliverableProductPhoto) {
    reasons.push('product imagery is available, so surface and polish descriptors can be captured now');
  } else {
    reasons.push('descriptor enrichment is blocked until a deliverable fit or product photo exists');
  }

  return {
    blockedByPhoto: input.blockedByPhoto,
    fitPreferredFields: [...STYLE_FIT_PREFERRED_DESCRIPTOR_FIELDS],
    fitRequiredFields: [...STYLE_FIT_REQUIRED_DESCRIPTOR_FIELDS],
    itemId: input.item.id,
    missingDescriptorFields,
    photoSupport,
    priority,
    productSafeFields: [...STYLE_PRODUCT_SAFE_DESCRIPTOR_FIELDS],
    reasons: Array.from(new Set(reasons)),
    sourceSignals: input.sourceSignals.sort(),
    summary: summarizeStyleItem(input.item) as StyleItemSummaryRecord,
  };
}

function descriptorPhotoSupport(item: StyleItemRecord): StyleDescriptorBacklogEntry['photoSupport'] {
  const deliverablePhotos = item.photos.filter((photo) => Boolean(photo.delivery));
  const deliverableFitPhoto = deliverablePhotos.some((photo) => photo.isFit || photo.kind === 'fit' || photo.view?.startsWith('fit_') === true);
  const deliverableProductPhoto = deliverablePhotos.some((photo) => photo.kind === 'product' || photo.view === 'front' || photo.view === 'back' || photo.view === 'side');
  const availablePhotoKinds = Array.from(new Set(item.photos.map((photo) => photo.kind)));
  return {
    availablePhotoKinds,
    blockedByPhoto: deliverablePhotos.length === 0,
    deliverableFitPhoto,
    deliverablePhotoCount: deliverablePhotos.length,
    deliverableProductPhoto,
  };
}

function missingStyleDescriptorFields(
  profile: StyleItemProfileRecord['raw'] | null | undefined,
  _photoSupport: StyleDescriptorBacklogEntry['photoSupport'],
): string[] {
  const missing: string[] = [];
  for (const field of STYLE_PRODUCT_SAFE_DESCRIPTOR_FIELDS) {
    if (!hasFilledDescriptorField(profile, field)) {
      missing.push(field);
    }
  }
  for (const field of STYLE_FIT_PREFERRED_DESCRIPTOR_FIELDS) {
    if (!hasFilledDescriptorField(profile, field)) {
      missing.push(field);
    }
  }
  for (const field of STYLE_FIT_REQUIRED_DESCRIPTOR_FIELDS) {
    if (!hasFilledDescriptorField(profile, field)) {
      missing.push(field);
    }
  }
  if (profile?.descriptorConfidence == null && missing.length > 0) {
    missing.push('descriptorConfidence');
  }
  return missing;
}

function hasFilledDescriptorField(
  profile: StyleItemProfileRecord['raw'] | null | undefined,
  field: (typeof STYLE_PRODUCT_SAFE_DESCRIPTOR_FIELDS | typeof STYLE_FIT_PREFERRED_DESCRIPTOR_FIELDS | typeof STYLE_FIT_REQUIRED_DESCRIPTOR_FIELDS)[number],
): boolean {
  if (!profile) {
    return false;
  }
  const value = profile[field];
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return value != null && value !== '';
}

function isHostedLocalUploadReference(sourceUrl: string | null): boolean {
  if (!sourceUrl) {
    return false;
  }
  return sourceUrl.startsWith('/mnt/user-data/uploads/') || /^[a-zA-Z]:\\/.test(sourceUrl);
}

function classifyEvidenceGapPriority(gapTypes: StyleEvidenceGapType[]): StyleWardrobeFindingPriority {
  if (
    gapTypes.includes('missing_primary_photo_delivery') &&
    (gapTypes.includes('missing_typed_profile') || gapTypes.includes('weak_descriptor_coverage'))
  ) {
    return 'high';
  }
  if (gapTypes.includes('weak_comparator_identity')) {
    return 'medium';
  }
  if (gapTypes.includes('missing_primary_photo_delivery') || gapTypes.includes('missing_typed_profile')) {
    return 'medium';
  }
  return 'low';
}

function filterEvidenceGapItemsByPriority(
  items: StyleEvidenceGapRecord[],
  priorityFilter: StyleEvidenceGapPriorityFilter,
): StyleEvidenceGapRecord[] {
  if (priorityFilter === 'all') {
    return items;
  }
  if (priorityFilter === 'actionable') {
    return items.filter((item) => item.priority === 'high' || item.priority === 'medium');
  }
  return items.filter((item) => item.priority === priorityFilter);
}

function descriptorSummaryFromItem(item: StyleItemRecord | null): StyleDescriptorSummaryRecord | null {
  if (!item?.profile) {
    return null;
  }
  return descriptorSummaryFromProfile(item.profile.raw);
}

function descriptorSummaryFromProfile(profile: StyleItemProfileRecord['raw'] | null): StyleDescriptorSummaryRecord | null {
  if (!profile) {
    return null;
  }
  return {
    descriptorConfidence: profile.descriptorConfidence ?? null,
    fabricHand: profile.fabricHand ?? null,
    fitObservations: profile.fitObservations ?? [],
    polishLevel: profile.polishLevel ?? null,
    qualityTier: profile.qualityTier ?? null,
    seasonality: profile.seasonality ?? [],
    silhouette: profile.silhouette ?? null,
    structureLevel: profile.structureLevel ?? null,
    texture: profile.texture ?? null,
    useCases: profile.useCases ?? [],
    avoidUseCases: profile.avoidUseCases ?? [],
    visualWeight: profile.visualWeight ?? null,
  };
}

function descriptorSummaryFromCandidate(
  candidate: StylePurchaseAnalysis['candidate'],
): StyleDescriptorSummaryRecord | null {
  return {
    descriptorConfidence: candidate.descriptorConfidence ?? null,
    fabricHand: candidate.fabricHand ?? null,
    fitObservations: candidate.fitObservations ?? [],
    polishLevel: candidate.polishLevel ?? null,
    qualityTier: candidate.qualityTier ?? null,
    seasonality: candidate.seasonality ?? [],
    silhouette: candidate.silhouette ?? null,
    structureLevel: candidate.structureLevel ?? null,
    texture: candidate.texture ?? null,
    useCases: candidate.useCases ?? [],
    avoidUseCases: candidate.avoidUseCases ?? [],
    visualWeight: candidate.visualWeight ?? null,
  };
}

function styleItemProfileSourceRank(source: string | null | undefined, method?: string | null): number {
  const normalized = source?.trim() ?? '';
  if (normalized === 'style_host_onboarding') {
    return styleItemProfileSourceRank(method, null);
  }
  const sourceRank = STYLE_ITEM_PROFILE_SOURCE_RANK[normalized];
  if (sourceRank !== undefined) {
    return sourceRank;
  }
  const normalizedMethod = method?.trim() ?? '';
  if (!normalizedMethod || normalizedMethod === normalized) {
    return -1;
  }
  return STYLE_ITEM_PROFILE_SOURCE_RANK[normalizedMethod] ?? -1;
}

function canonicalStyleItemProfileSource(
  source: string | null | undefined,
  method: string | null | undefined,
  hasImage: boolean,
): string | null {
  const normalized = source?.trim() || null;
  if (normalized === 'style_host_onboarding') {
    return downgradeStyleItemProfileSource(method ?? null, hasImage);
  }
  return downgradeStyleItemProfileSource(normalized ?? method ?? null, hasImage);
}

function downgradeStyleItemProfileSource(source: string | null | undefined, hasImage: boolean): string | null {
  const normalized = source?.trim() || null;
  if (!normalized) {
    return null;
  }
  if (!hasImage && (normalized === 'host_vision' || normalized === 'host_visual_inspection' || normalized === 'host_fit_vision')) {
    return 'host_text';
  }
  return normalized;
}

function styleItemProfileStoredSource(
  field: StyleItemProfileField,
  storedEvidence: Record<string, unknown>,
  before: StyleItemProfileRecord | null,
): string | null {
  const evidence = asRecord(storedEvidence[field]);
  const evidenceSource = asNullableString(evidence?.source);
  if (evidenceSource) {
    return evidenceSource;
  }
  const source = before?.source ?? null;
  const method = before?.method ?? null;
  if (source === 'style_host_onboarding') {
    return canonicalStyleItemProfileSource(source, method, true);
  }
  if (method && styleItemProfileSourceRank(source, null) < 0 && styleItemProfileSourceRank(method, null) >= 0) {
    return method;
  }
  return source ?? method ?? null;
}

function buildStyleItemProfileFieldEvidence(input: {
  baseEvidence?: Record<string, unknown> | null;
  confidence: number | null;
  source: string | null;
  value: unknown;
}): Record<string, unknown> {
  return {
    ...(input.baseEvidence ?? {}),
    confidence: input.confidence,
    source: input.source,
    value: input.value,
  };
}

function isEmptyStyleItemProfileValue(value: unknown): boolean {
  if (value == null) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === 'string') {
    return value.trim().length === 0;
  }
  const record = asRecord(value);
  if (record) {
    return Object.values(record).every((entry) => entry == null);
  }
  return false;
}

function styleItemProfileValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

// Collision-safe deterministic id segment for client_token idempotency: SHA-256 of the EXACT token
// (no lossy sanitize/truncate that could map two distinct tokens to one id). Portable across the Worker
// runtime and Node via the global Web Crypto SubtleCrypto.
async function hashClientToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 40);
}

async function sha256StyleBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256StyleCatalogBinding(value: Record<string, unknown>): Promise<string> {
  return sha256StyleBytes(new TextEncoder().encode(JSON.stringify(value)));
}

// Onboarding provenance honesty (GAP-4/R9): with no image delivered, downgrade any host_vision field
// evidence to host_text — a host with zero pixels could not have vision-sourced a field.
function downgradeOnboardingFieldEvidence(fieldEvidence: unknown, hasImage: boolean): Record<string, unknown> | null {
  const record = asRecord(parseJsonLike(fieldEvidence));
  if (!record) {
    return null;
  }
  if (hasImage) {
    return record;
  }
  const out: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(record)) {
    const evidence = asRecord(value);
    if (evidence && (evidence.source === 'host_vision' || evidence.source === 'host_fit_vision')) {
      out[field] = { ...evidence, downgradedReason: 'no_image_supplied', source: 'host_text' };
    } else {
      out[field] = value;
    }
  }
  return out;
}

// Server-computed low-confidence fields (design §6, threshold 0.6). A tag_ocr-sourced field is trusted
// even at moderate confidence (mirrors fluent-web's brandStrong), so it is never flagged.
function computeLowConfidenceOnboardingFields(fieldEvidence: unknown, threshold: number): string[] {
  const record = asRecord(parseJsonLike(fieldEvidence));
  if (!record) {
    return [];
  }
  const low: string[] = [];
  for (const [field, value] of Object.entries(record)) {
    const evidence = asRecord(value);
    if (!evidence || asNullableString(evidence.source) === 'tag_ocr') {
      continue;
    }
    const confidence = asNullableNumber(evidence.confidence);
    if (confidence !== null && confidence < threshold) {
      low.push(field);
    }
  }
  return low.sort();
}

function matchesTypedRoleCandidate(candidate: StylePurchaseAnalysis['candidate'], item: StyleItemRecord): boolean {
  const candidateSubcategory = candidate.subcategory?.trim().toLowerCase();
  const itemType = item.profile?.raw.itemType?.trim().toLowerCase() ?? null;
  if (!candidateSubcategory || !itemType) {
    return false;
  }
  if (itemType === candidateSubcategory) {
    return true;
  }
  const candidateRole = inferStyleComparatorKey({
    category: candidate.category,
    subcategory: candidate.subcategory,
  });
  const itemRole = inferStyleComparatorKey({
    category: item.category,
    subcategory: item.profile?.raw.itemType,
    tags: item.profile?.raw.tags ?? [],
  });
  return candidateRole !== 'unknown' && candidateRole === itemRole;
}

function inferTopWardrobeJobFromCandidate(candidate: StylePurchaseAnalysis['candidate']): StyleTopWardrobeJob {
  if (candidate.category !== 'TOP') {
    return 'unknown';
  }
  return inferTopWardrobeJob({
    descriptorSignals: [candidate.notes, candidate.fabricHand, candidate.fitType, candidate.silhouette],
    garmentTypeSignals: [candidate.subcategory],
    identitySignals: [candidate.name, candidate.comparatorKey],
    useCases: candidate.useCases ?? [],
  });
}

function inferTopWardrobeJobFromItem(item: StyleItemRecord): StyleTopWardrobeJob {
  if (item.category !== 'TOP') {
    return 'unknown';
  }
  const profile = item.profile?.raw;
  return inferTopWardrobeJob({
    descriptorSignals: [profile?.fabricHand, profile?.silhouette, profile?.texture],
    garmentTypeSignals: [item.subcategory, profile?.itemType],
    identitySignals: [item.name, item.comparatorKey, profile?.styleRole],
    tags: profile?.tags ?? [],
    useCases: profile?.useCases ?? [],
  });
}

type TopWardrobeJobSignalInput = {
  descriptorSignals?: Array<string | null | undefined>;
  garmentTypeSignals?: Array<string | null | undefined>;
  identitySignals?: Array<string | null | undefined>;
  tags?: Array<string | null | undefined>;
  useCases?: Array<string | null | undefined>;
};

function inferTopWardrobeJob(input: TopWardrobeJobSignalInput): StyleTopWardrobeJob {
  const identityText = joinTopWardrobeSignals([
    ...(input.identitySignals ?? []),
    ...(input.garmentTypeSignals ?? []),
    ...(input.tags ?? []),
    ...(input.useCases ?? []),
  ]);
  const descriptorText = joinTopWardrobeSignals(input.descriptorSignals ?? []);
  const positiveText = joinTopWardrobeSignals([identityText, descriptorText]);
  const garmentTypeText = joinTopWardrobeSignals(input.garmentTypeSignals ?? []);
  if (!positiveText.trim()) {
    return 'unknown';
  }
  if (hasFanwearTopSignal({ garmentTypeText, positiveText })) {
    return 'jersey_fanwear';
  }
  if (/\b(undershirt|under shirt|base layer|baselayer|thermal base|compression top)\b/.test(positiveText)) {
    return 'undershirt_base_layer';
  }
  if (/\b(tour|concert|band|merch|merchandise)\s+(?:tee|t-shirt|t shirt)\b/.test(positiveText)) {
    return 'merch_tour_tee';
  }
  if (/\b(training|performance|athletic|workout|running|dri-fit|dry-fit|technical tee|tech tee|gym|deltapeak)\b/.test(positiveText)) {
    return 'athletic_training_performance_tee';
  }
  if (/\b(graphic|statement|printed|print|logo|art)\s+(?:tee|t-shirt|t shirt)\b/.test(positiveText)) {
    return 'graphic_statement_tee';
  }
  if (/\b(tee|t-shirt|t shirt|crewneck t|short sleeve)\b/.test(positiveText)) {
    return 'lifestyle_plain_tee';
  }
  return 'non_tee_top';
}

function joinTopWardrobeSignals(signals: Array<string | null | undefined>): string {
  return signals
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();
}

function hasFanwearTopSignal(input: { garmentTypeText: string; positiveText: string }): boolean {
  if (/\b(basketball|nba|nhl|nfl|mlb|fanwear|hardwood classics|team jersey|game jersey|swingman|throwback jersey)\b/.test(input.positiveText)) {
    return true;
  }
  return (
    /\bjersey\b/.test(input.garmentTypeText) &&
    !/\b(cotton jersey|jersey cotton|jersey knit|knit jersey|jersey-knit|jersey tee|jersey t-shirt|jersey t shirt|jersey top)\b/.test(
      input.garmentTypeText,
    )
  );
}

function topWardrobeJobsMatch(candidate: StylePurchaseAnalysis['candidate'], item: StyleItemRecord): boolean {
  const candidateJob = inferTopWardrobeJobFromCandidate(candidate);
  const itemJob = inferTopWardrobeJobFromItem(item);
  if (candidateJob === 'unknown' || itemJob === 'unknown') {
    return false;
  }
  return candidateJob === itemJob;
}

function formatTopWardrobeJob(job: StyleTopWardrobeJob): string {
  switch (job) {
    case 'lifestyle_plain_tee':
      return 'lifestyle/plain tee';
    case 'graphic_statement_tee':
      return 'graphic/statement tee';
    case 'athletic_training_performance_tee':
      return 'athletic/training tee';
    case 'merch_tour_tee':
      return 'merch/tour tee';
    case 'undershirt_base_layer':
      return 'undershirt/base layer';
    case 'jersey_fanwear':
      return 'jersey/fanwear';
    case 'non_tee_top':
      return 'non-tee top';
    case 'unknown':
      return 'unknown top role';
    default:
      return job;
  }
}

function isDirectPurchaseComparatorCandidate(candidate: StylePurchaseAnalysis['candidate'], item: StyleItemRecord): boolean {
  if (!item.category || item.category.toLowerCase() !== candidate.category.toLowerCase()) {
    return false;
  }

  const candidateKey = resolvePurchaseCandidateComparatorKey(candidate);
  const itemKey = resolveStyleItemComparatorKey(item);

  if (candidate.category === 'TOP') {
    const candidateJob = inferTopWardrobeJobFromCandidate(candidate);
    const itemJob = inferTopWardrobeJobFromItem(item);
    if (
      candidateJob !== 'unknown' &&
      candidateJob !== 'non_tee_top' &&
      itemJob !== 'unknown' &&
      candidateJob !== itemJob
    ) {
      return false;
    }
    if (candidateKey === 'tee') {
      return itemKey === 'tee' && !looksLikeJerseyItem(item) && candidateJob === itemJob;
    }
    if (candidateKey === 'jersey') {
      return itemKey === 'jersey';
    }
    if (looksLikeJerseyItem(item)) {
      return false;
    }
  }

  if (candidate.category === 'SHOE') {
    const candidateSignals = buildShoeComparisonSignalsFromCandidate(candidate);
    const itemSignals = buildShoeComparisonSignalsFromItem(item);
    if (
      candidateSignals.wardrobeJob !== 'unknown_shoe' &&
      itemSignals.wardrobeJob !== 'unknown_shoe' &&
      candidateSignals.wardrobeJob !== itemSignals.wardrobeJob
    ) {
      return false;
    }
  }

  if (candidateKey && !isBroadComparatorKey(candidateKey)) {
    return itemKey === candidateKey;
  }

  return true;
}

function resolvePurchaseCandidateComparatorKey(candidate: StylePurchaseAnalysis['candidate']) {
  if (
    candidate.category === 'TOP' &&
    inferTopWardrobeJobFromCandidate(candidate) !== 'jersey_fanwear' &&
    /\b(tee|t-shirt|t shirt)\b/i.test([candidate.name, candidate.subcategory, candidate.notes].filter(Boolean).join(' '))
  ) {
    return 'tee';
  }
  return candidate.comparatorKey && candidate.comparatorKey !== 'unknown'
    ? candidate.comparatorKey
    : inferStyleComparatorKey({
        category: candidate.category,
        extraSignals: [candidate.name, candidate.notes, candidate.fabricHand, candidate.fitType, candidate.silhouette],
        subcategory: candidate.subcategory,
      });
}

function resolveStyleItemComparatorKey(item: StyleItemRecord) {
  if (looksLikeJerseyItem(item)) {
    return 'jersey';
  }
  if (looksLikeTeeItem(item)) {
    return 'tee';
  }
  return item.comparatorKey && item.comparatorKey !== 'unknown'
    ? item.comparatorKey
    : inferStyleComparatorKey({
        category: item.category,
        name: item.name,
        profile: item.profile?.raw ?? null,
        subcategory: item.subcategory,
        tags: item.profile?.raw.tags ?? [],
      });
}

function looksLikeJerseyItem(item: StyleItemRecord): boolean {
  const profile = item.profile?.raw;
  const positiveText = joinTopWardrobeSignals([
    item.name,
    item.subcategory,
    profile?.itemType,
    profile?.styleRole,
    ...(profile?.tags ?? []),
    ...(profile?.useCases ?? []),
  ]);
  const garmentTypeText = joinTopWardrobeSignals([item.subcategory, profile?.itemType]);
  return hasFanwearTopSignal({ garmentTypeText, positiveText });
}

function looksLikeTeeItem(item: StyleItemRecord): boolean {
  const profile = item.profile?.raw;
  return /\b(tee|t-shirt|t shirt|graphic tee|merch tee|tour tee)\b/i.test(
    [
      item.name,
      item.subcategory,
      profile?.itemType,
      profile?.styleRole,
      ...(profile?.tags ?? []),
    ]
      .filter(Boolean)
      .join(' '),
  );
}

function isBroadComparatorKey(key: string | null | undefined): boolean {
  return key === 'unknown' || key === 'other_top' || key === 'other_bottom' || key === 'other_shoe' || key === 'other_one_piece';
}

function descriptorDeltaNotes(input: {
  candidate: StyleDescriptorSummaryRecord | null;
  comparatorIds: string[];
  comparatorSummaries: Record<string, StyleDescriptorSummaryRecord | null>;
}): Array<{ itemId: string; notes: string[] }> {
  const candidate = input.candidate;
  if (!candidate) {
    return [];
  }
  const comparatorEntries = input.comparatorIds
    .map((itemId) => ({ itemId, summary: input.comparatorSummaries[itemId] }))
    .filter((entry): entry is { itemId: string; summary: StyleDescriptorSummaryRecord } => Boolean(entry.summary));
  if (comparatorEntries.length === 0) {
    return [];
  }
  return comparatorEntries
    .map(({ itemId, summary }) => {
      const notes = new Set<string>();
      const compareAxis = (
        axis: keyof Pick<
          StyleDescriptorSummaryRecord,
          'visualWeight' | 'texture' | 'fabricHand' | 'polishLevel' | 'structureLevel' | 'qualityTier'
        >,
        label: string,
      ) => {
        const candidateValue = candidate[axis];
        const comparatorValue = summary[axis];
        if (candidateValue && comparatorValue && candidateValue !== comparatorValue) {
          notes.add(`${label} shifts from ${comparatorValue} to ${candidateValue}`);
        }
      };

      compareAxis('visualWeight', 'visual weight');
      compareAxis('texture', 'texture');
      compareAxis('fabricHand', 'fabric hand');
      compareAxis('polishLevel', 'polish');
      compareAxis('structureLevel', 'structure');
      compareAxis('qualityTier', 'quality tier');

      if (candidate.silhouette && summary.silhouette && candidate.silhouette !== summary.silhouette) {
        notes.add(`silhouette shifts from ${summary.silhouette} to ${candidate.silhouette}`);
      }

      const candidateUseCases = new Set((candidate.useCases ?? []).map((value) => value.toLowerCase()));
      const comparatorUseCases = new Set((summary.useCases ?? []).map((value) => value.toLowerCase()));
      const newUseCases = [...candidateUseCases].filter((value) => !comparatorUseCases.has(value));
      if (newUseCases.length > 0) {
        notes.add(`candidate opens extra use cases: ${newUseCases.slice(0, 3).join(', ')}`);
      }

      return { itemId, notes: [...notes] };
    })
    .filter((entry) => entry.notes.length > 0);
}

function buildPurchaseNonComparatorItems(input: {
  candidate: StylePurchaseAnalysis['candidate'];
  candidateCategory: string;
  items: StyleItemRecord[];
}): StylePurchaseAnalysis['contextBuckets']['nonComparatorItems'] {
  return input.items
    .filter(
      (item) =>
        item.category?.toLowerCase() !== input.candidateCategory ||
        !isDirectPurchaseComparatorCandidate(input.candidate, item),
    )
    .map((item) => {
      const reasons: string[] = [];
      let score = 0;
      const candidateTopJob =
        input.candidate.category === 'TOP' ? inferTopWardrobeJobFromCandidate(input.candidate) : 'unknown';
      const itemTopJob = item.category === 'TOP' ? inferTopWardrobeJobFromItem(item) : 'unknown';
      const sameTopNounDifferentJob =
        input.candidate.category === 'TOP' &&
        item.category === 'TOP' &&
        resolvePurchaseCandidateComparatorKey(input.candidate) === 'tee' &&
        resolveStyleItemComparatorKey(item) === 'tee' &&
        candidateTopJob !== 'unknown' &&
        itemTopJob !== 'unknown' &&
        candidateTopJob !== itemTopJob;
      const candidateComparatorKey = resolvePurchaseCandidateComparatorKey(input.candidate);
      const itemComparatorKey = resolveStyleItemComparatorKey(item);
      const sameCategoryDifferentComparator =
        item.category?.toLowerCase() === input.candidateCategory &&
        candidateComparatorKey !== 'unknown' &&
        itemComparatorKey !== 'unknown' &&
        candidateComparatorKey !== itemComparatorKey;
      if (sameTopNounDifferentJob) {
        reasons.push(
          `same tee wording, different wardrobe job (${formatTopWardrobeJob(itemTopJob)} vs ${formatTopWardrobeJob(candidateTopJob)})`,
        );
        score += 4;
      }
      if (sameCategoryDifferentComparator) {
        reasons.push(`same category, different item type (${itemComparatorKey} vs ${candidateComparatorKey})`);
        score += 4;
      }
      if (
        input.candidate.colorFamily &&
        item.colorFamily?.toLowerCase() === input.candidate.colorFamily.toLowerCase()
      ) {
        reasons.push(`same color family (${input.candidate.colorFamily})`);
        score += 3;
        if (item.category?.toLowerCase() !== input.candidateCategory) {
          score += 2;
        }
      }
      if (input.candidate.formality != null && item.formality != null) {
        const formalityDistance = Math.abs(item.formality - input.candidate.formality);
        if (formalityDistance <= 1) {
          reasons.push(`nearby formality (${item.formality})`);
          score += 2 - formalityDistance;
          if (item.category?.toLowerCase() !== input.candidateCategory) {
            score += 2;
          }
        }
      }
      if (sharesCandidateNameToken(input.candidate, item)) {
        reasons.push('shares product or brand wording');
        score += 1;
      }
      if (reasons.length === 0) {
        return null;
      }
      const candidateCategoryLabel = formatCategoryLaneLabel(input.candidate.category);
      const itemCategoryLabel = formatCategoryLaneLabel(item.category);
      const rejectedBecause =
        sameTopNounDifferentJob
          ? `${formatOwnedItemLabel(item)} is a ${formatTopWardrobeJob(itemTopJob)}, not a ${formatTopWardrobeJob(candidateTopJob)}; use it as context only, not as a direct substitute.`
          : sameCategoryDifferentComparator
          ? `${formatOwnedItemLabel(item)} is a ${formatCandidateKindLabel({ ...input.candidate, comparatorKey: itemComparatorKey })}, not a ${formatCandidateKindLabel(input.candidate)}; use it as context only, not as a direct substitute.`
          : item.category?.toLowerCase() === input.candidateCategory
          ? `${formatOwnedItemLabel(item)} is not a clean substitute for this ${formatCandidateKindLabel(input.candidate)}; use it as style context only, not as the closest duplicate.`
          : `${formatOwnedItemLabel(item)} is a ${itemCategoryLabel}, not a ${candidateCategoryLabel}; use it as styling context only, not as a duplicate or substitute comparator.`;
      return {
        itemId: item.id,
        rejectedBecause,
        reasons,
        score,
        sortName: item.name,
      };
    })
    .filter((entry): entry is { itemId: string; rejectedBecause: string; reasons: string[]; score: number; sortName: string | null } =>
      Boolean(entry),
    )
    .sort((left, right) => right.score - left.score || left.sortName?.localeCompare(right.sortName ?? '') || 0)
    .slice(0, 12)
    .map(({ itemId, rejectedBecause, reasons }) => ({
      itemId,
      rejectedBecause,
      reasons,
    }));
}

function buildPurchaseComparatorReasoning(input: {
  candidate: StylePurchaseAnalysis['candidate'];
  contextBuckets: StylePurchaseAnalysis['contextBuckets'];
  coverageImpact: StylePurchaseAnalysis['coverageImpact'];
  items: StyleItemRecord[];
  laneAssessment: StylePurchaseAnalysis['laneAssessment'];
}): StylePurchaseAnalysis['comparatorReasoning'] {
  const comparatorIds = Array.from(
    new Set([
      ...input.contextBuckets.exactComparatorItems.map((entry) => entry.itemId),
      ...input.contextBuckets.typedRoleItems.map((entry) => entry.itemId),
      ...input.contextBuckets.sameCategoryItems.map((entry) => entry.itemId),
      ...input.contextBuckets.sameColorFamilyItems.map((entry) => entry.itemId),
    ]),
  );
  const itemMap = new Map(input.items.map((item) => [item.id, item]));
  const comparatorItems = comparatorIds
    .map((itemId) => itemMap.get(itemId))
    .filter((item): item is StyleItemRecord => Boolean(item));

  if (input.candidate.category === 'SHOE') {
    const allShoeComparators = uniqueStyleItemsById([
      ...comparatorItems,
      ...input.items.filter((item) => item.category === input.candidate.category),
    ]);
    return buildShoeComparatorReasoning({
      candidate: input.candidate,
      comparatorItems: allShoeComparators,
      coverageImpact: input.coverageImpact,
      laneAssessment: input.laneAssessment,
      rejectedComparisons: input.contextBuckets.nonComparatorItems,
    });
  }

  return buildBaselineComparatorReasoning({
    candidate: input.candidate,
    comparatorItems,
    coverageImpact: input.coverageImpact,
    laneAssessment: input.laneAssessment,
    rejectedComparisons: input.contextBuckets.nonComparatorItems,
  });
}

function buildBaselineComparatorReasoning(input: {
  candidate: StylePurchaseAnalysis['candidate'];
  comparatorItems: StyleItemRecord[];
  coverageImpact: StylePurchaseAnalysis['coverageImpact'];
  laneAssessment: StylePurchaseAnalysis['laneAssessment'];
  rejectedComparisons: StylePurchaseAnalysis['comparatorReasoning']['rejectedComparisons'];
}): StylePurchaseAnalysis['comparatorReasoning'] {
  const topComparisons = input.comparatorItems.slice(0, 3).map((item) => {
    const candidateKey = resolvePurchaseCandidateComparatorKey(input.candidate);
    const itemKey = resolveStyleItemComparatorKey(item);
    const exactOuterwearOverlap =
      input.candidate.category === 'OUTERWEAR' &&
      candidateKey &&
      candidateKey === itemKey &&
      sameCandidateColorFamily(input.candidate, item);
    const relation = exactOuterwearOverlap ? 'duplicate' as const : 'adjacent' as const;
    const itemLabel = formatOwnedItemLabel(item);
    return {
      confidence: exactOuterwearOverlap ? 'high' as const : 'medium' as const,
      itemId: item.id,
      notes: exactOuterwearOverlap
        ? [`same outerwear type (${candidateKey})`, `same color family (${input.candidate.colorFamily})`]
        : [`same kind of item (${input.candidate.category.toLowerCase()})`],
      overlapScore: exactOuterwearOverlap
        ? 86
        : item.category === input.candidate.category
          ? (sameCandidateColorFamily(input.candidate, item) ? 68 : 58)
          : 42,
      relation,
      summary: exactOuterwearOverlap
        ? `${itemLabel} already covers this outerwear need in the same color family.`
        : `${itemLabel} shares some closet context, but it is not a true duplicate.`,
    };
  });

  const duplicateComparisons = topComparisons.filter((entry) => entry.relation === 'duplicate');
  if (duplicateComparisons.length > 0) {
    return {
      framing: 'duplicate',
      mode: 'baseline',
      notes: duplicateComparisons.slice(0, 2).map((entry) => entry.summary),
      rejectedComparisons: input.rejectedComparisons,
      summary: 'Your closet already covers this exact outerwear need.',
      topComparisons,
    };
  }

  if (topComparisons.length > 0) {
    return {
      framing: 'adjacent',
      mode: 'baseline',
      notes: [topComparisons[0]!.summary],
      rejectedComparisons: input.rejectedComparisons,
      summary: 'There is overlap, but it does not read like an obvious duplicate.',
      topComparisons,
    };
  }

  if (input.coverageImpact.strengthensWeakArea || input.laneAssessment.introduces) {
    return {
      framing: 'addition',
      mode: 'baseline',
      notes: ['This still reads like a real addition rather than a near-duplicate.'],
      rejectedComparisons: input.rejectedComparisons,
      summary: 'This looks like a real addition, not more of the same.',
      topComparisons,
    };
  }

  return {
    framing: 'uncertain',
    mode: 'baseline',
    notes: ['There are not enough grounded closet comparators yet to make a sharper call.'],
    rejectedComparisons: input.rejectedComparisons,
    summary: 'The closet signal is still too thin to make a stronger comparison.',
    topComparisons: [],
  };
}

function uniqueStyleItemsById(items: StyleItemRecord[]): StyleItemRecord[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function comparePurchaseBucketEntries(
  candidate: StylePurchaseAnalysis['candidate'],
  left: StyleItemRecord,
  right: StyleItemRecord,
): number {
  if (candidate.category === 'SHOE') {
    const leftComparison = compareShoeCandidateAgainstItem(candidate, left);
    const rightComparison = compareShoeCandidateAgainstItem(candidate, right);
    const relationPriority = shoeRelationPriority(rightComparison.relation) - shoeRelationPriority(leftComparison.relation);
    if (relationPriority !== 0) {
      return relationPriority;
    }
    const confidencePriority =
      shoeConfidencePriority(rightComparison.confidence) - shoeConfidencePriority(leftComparison.confidence);
    if (confidencePriority !== 0) {
      return confidencePriority;
    }
    const overlapPriority = rightComparison.overlapScore - leftComparison.overlapScore;
    if (overlapPriority !== 0) {
      return overlapPriority;
    }
  }

  if (candidate.category === 'TOP') {
    const leftJobMatches = topWardrobeJobsMatch(candidate, left);
    const rightJobMatches = topWardrobeJobsMatch(candidate, right);
    if (Number(rightJobMatches) - Number(leftJobMatches) !== 0) {
      return Number(rightJobMatches) - Number(leftJobMatches);
    }
    const imagePriority = Number(hasPurchaseComparableImage(right)) - Number(hasPurchaseComparableImage(left));
    if (imagePriority !== 0) {
      return imagePriority;
    }
  }

  return (
    Number(right.status === 'active') - Number(left.status === 'active') ||
    Number(sameCandidateColorFamily(candidate, right)) - Number(sameCandidateColorFamily(candidate, left)) ||
    left.name?.localeCompare(right.name ?? '') ||
    0
  );
}

function hasPurchaseComparableImage(item: StyleItemRecord): boolean {
  return item.photos.some((photo) =>
    Boolean(photo.delivery?.originalUrl || photo.sourceUrl || photo.url),
  );
}

function formatCandidateKindLabel(candidate: StylePurchaseAnalysis['candidate']): string {
  const key = resolvePurchaseCandidateComparatorKey(candidate);
  if (key && !isBroadComparatorKey(key)) {
    return key.replace(/_/g, ' ');
  }
  return formatCategoryLaneLabel(candidate.category);
}

function sameCandidateColorFamily(candidate: StylePurchaseAnalysis['candidate'], item: StyleItemRecord): boolean {
  return Boolean(
    candidate.colorFamily &&
      item.colorFamily &&
      item.colorFamily.toLowerCase() === candidate.colorFamily.toLowerCase(),
  );
}

function buildShoeComparatorReasoning(input: {
  candidate: StylePurchaseAnalysis['candidate'];
  comparatorItems: StyleItemRecord[];
  coverageImpact: StylePurchaseAnalysis['coverageImpact'];
  laneAssessment: StylePurchaseAnalysis['laneAssessment'];
  rejectedComparisons: StylePurchaseAnalysis['comparatorReasoning']['rejectedComparisons'];
}): StylePurchaseAnalysis['comparatorReasoning'] {
  const shoeKindLabel = describeShoeKind(input.candidate);
  const rankedComparisons = input.comparatorItems
    .map((item) => compareShoeCandidateAgainstItem(input.candidate, item))
    .sort((left, right) => {
      const priority = shoeRelationPriority(right.relation) - shoeRelationPriority(left.relation);
      if (priority !== 0) {
        return priority;
      }
      return right.overlapScore - left.overlapScore;
    });
  const meaningfulComparisons = rankedComparisons.filter((entry) => entry.relation !== 'distinct');
  const topComparisons = meaningfulComparisons.slice(0, 4);

  const duplicateComparisons = topComparisons.filter((entry) => entry.relation === 'duplicate');
  const replacementComparisons = topComparisons.filter((entry) => entry.relation === 'replacement');
  const upgradeComparisons = topComparisons.filter((entry) => entry.relation === 'upgrade');
  const adjacentComparisons = topComparisons.filter((entry) => entry.relation === 'adjacent');

  if (
    duplicateComparisons.length >= 2 ||
    duplicateComparisons.some((entry) => entry.confidence === 'high')
  ) {
    return {
      framing: 'duplicate',
      mode: 'shoe_pairwise',
      notes: duplicateComparisons.slice(0, 2).map((entry) => entry.summary),
      rejectedComparisons: input.rejectedComparisons,
      summary: `This looks too close to ${pluralizeShoeKind(shoeKindLabel)} you already own.`,
      topComparisons,
    };
  }

  if (replacementComparisons.length > 0) {
    return {
      framing: 'replacement',
      mode: 'shoe_pairwise',
      notes: replacementComparisons.slice(0, 2).map((entry) => entry.summary),
      rejectedComparisons: input.rejectedComparisons,
      summary: `This reads more like a replacement than a genuinely new ${shoeKindLabel}.`,
      topComparisons,
    };
  }

  if (upgradeComparisons.length > 0) {
    return {
      framing: 'upgrade',
      mode: 'shoe_pairwise',
      notes: upgradeComparisons.slice(0, 2).map((entry) => entry.summary),
      rejectedComparisons: input.rejectedComparisons,
      summary: `This could upgrade a ${shoeKindLabel} you already wear rather than expand your rotation.`,
      topComparisons,
    };
  }

  if (input.coverageImpact.strengthensWeakArea || input.laneAssessment.introduces) {
    return {
      framing: 'addition',
      mode: 'shoe_pairwise',
      notes: topComparisons.slice(0, 2).map((entry) => entry.summary),
      rejectedComparisons: input.rejectedComparisons,
      summary: 'The closest shoe comparisons still point toward a real addition.',
      topComparisons,
    };
  }

  if (adjacentComparisons.length > 0) {
    return {
      framing: 'adjacent',
      mode: 'shoe_pairwise',
      notes: adjacentComparisons.slice(0, 2).map((entry) => entry.summary),
      rejectedComparisons: input.rejectedComparisons,
      summary: 'This overlaps with shoes you own, but it may still earn a slightly different role.',
      topComparisons,
    };
  }

  return {
    framing: 'uncertain',
    mode: 'shoe_pairwise',
    notes: ['The closest shoe comparisons are still too thin to call this a duplicate or a real addition.'],
    rejectedComparisons: input.rejectedComparisons,
    summary: 'There is not enough grounded shoe context yet for a sharper call.',
    topComparisons,
  };
}

function compareShoeCandidateAgainstItem(
  candidate: StylePurchaseAnalysis['candidate'],
  item: StyleItemRecord,
): StylePurchaseAnalysis['comparatorReasoning']['topComparisons'][number] {
  const shoeKindLabel = describeShoeKind(candidate);
  const candidateSignals = buildShoeComparisonSignalsFromCandidate(candidate);
  const itemSignals = buildShoeComparisonSignalsFromItem(item);
  const familyOverlap = intersectStrings(candidateSignals.families, itemSignals.families);
  const sameArchetype = Boolean(candidateSignals.archetype && candidateSignals.archetype === itemSignals.archetype);
  const sameColor =
    Boolean(candidate.colorFamily) &&
    Boolean(item.colorFamily) &&
    candidate.colorFamily!.toLowerCase() === item.colorFamily!.toLowerCase();
  const colorDetailOverlap = intersectStrings(candidateSignals.colorDetails, itemSignals.colorDetails);
  const sameSpecificColorDetail = colorDetailOverlap.some((entry) => isSpecificShoeColorDetail(entry));
  const conflictingSpecificColorDetail = itemSignals.colorDetails.some(
    (entry) => isSpecificShoeColorDetail(entry) && !candidateSignals.colorDetails.includes(entry),
  );
  const colorSignalMissing = !candidate.colorFamily || !item.colorFamily;
  const overlappingRoles = intersectStrings(candidateSignals.roleTags, itemSignals.roleTags);
  const sameRole = overlappingRoles.length > 0;
  const sameWardrobeJob = candidateSignals.wardrobeJob === itemSignals.wardrobeJob;
  const refinementDelta = candidateSignals.refinementScore - itemSignals.refinementScore;
  const candidateMoreRefined = refinementDelta >= 1.4;

  const notes: string[] = [];
  if (familyOverlap.length > 0) {
    notes.push(`same family (${familyOverlap.map(formatShoeFamilyLabel).join(', ')})`);
  }
  if (sameArchetype && candidateSignals.archetype) {
    notes.push(`same archetype (${formatShoeArchetypeLabel(candidateSignals.archetype)})`);
  }
  if (sameColor && candidate.colorFamily) {
    notes.push(`same color family (${candidate.colorFamily})`);
  }
  if (colorDetailOverlap.length > 0) {
    notes.push(`same color detail (${colorDetailOverlap.map(formatShoeColorDetailLabel).join(', ')})`);
  }
  if (sameRole) {
    notes.push(`same footwear job (${overlappingRoles.map(formatShoeRoleLabel).join(', ')})`);
  }
  if (sameWardrobeJob) {
    notes.push(`same shoe job (${formatShoeWardrobeJobLabel(candidateSignals.wardrobeJob)})`);
  }
  if (candidateMoreRefined) {
    notes.push('candidate reads more refined than the owned comparator');
  } else if (refinementDelta <= -1.4) {
    notes.push('owned comparator already reads more refined');
  }

  let relation: StylePurchaseAnalysis['comparatorReasoning']['topComparisons'][number]['relation'] = 'distinct';
  if (
    sameWardrobeJob &&
    ((familyOverlap.length > 0 && sameRole && !candidateMoreRefined) ||
      (sameArchetype && sameRole && !candidateMoreRefined && (sameColor || colorSignalMissing)))
  ) {
    relation = 'duplicate';
  } else if (sameWardrobeJob && (familyOverlap.length > 0 || sameArchetype) && sameRole && candidateMoreRefined && sameColor) {
    relation = 'replacement';
  } else if (sameWardrobeJob && (familyOverlap.length > 0 || sameArchetype) && sameRole && candidateMoreRefined) {
    relation = 'upgrade';
  } else if (familyOverlap.length > 0 || sameArchetype || sameWardrobeJob || (sameColor && sameRole)) {
    relation = 'adjacent';
  }

  const rawOverlapScore =
    18 +
    (familyOverlap.length > 0 ? 42 : 0) +
    (sameArchetype ? 20 : 0) +
    (sameColor ? 8 : 0) +
    (sameSpecificColorDetail ? 12 : colorDetailOverlap.length > 0 ? 4 : 0) +
    (sameRole ? 12 : 0) +
    (sameWardrobeJob ? 20 : sameArchetype ? -8 : 0) +
    (relation === 'replacement' || relation === 'upgrade' ? 6 : 0);
  const overlapScore = Math.max(
    24,
    Math.min(100, rawOverlapScore) - (conflictingSpecificColorDetail ? 10 : 0),
  );
  const confidence =
    familyOverlap.length > 0 || (sameWardrobeJob && sameArchetype && sameRole && sameColor)
      ? 'high'
      : sameWardrobeJob || sameArchetype || sameRole
        ? 'medium'
        : 'low';

  const itemLabel = formatOwnedItemLabel(item);
  let summary = `${itemLabel} is nearby, but not close enough to treat as the same kind of ${shoeKindLabel}.`;
  if (relation === 'duplicate') {
    summary = `${itemLabel} already covers almost the same kind of ${shoeKindLabel} in your closet.`;
  } else if (relation === 'replacement') {
    summary = `${itemLabel} is the closest version you already own, so this feels more like a nicer replacement than a true addition.`;
  } else if (relation === 'upgrade') {
    summary = `${itemLabel} covers a similar role, but this reads as a more elevated take on that kind of ${shoeKindLabel}.`;
  } else if (relation === 'adjacent') {
    summary = `${itemLabel} is close, but this could still earn a slightly different role.`;
  }

  return {
    confidence,
    itemId: item.id,
    notes,
    overlapScore,
    relation,
    summary,
  };
}

function buildShoeComparisonSignalsFromCandidate(candidate: StylePurchaseAnalysis['candidate']) {
  const profileSummary = descriptorSummaryFromCandidate(candidate);
  const brand = candidate.brand?.trim().toLowerCase() ?? null;
  const blob = buildShoeSignalBlob([
    candidate.brand,
    candidate.name,
    candidate.subcategory,
    candidate.colorFamily,
    candidate.colorName,
    candidate.notes,
    candidate.silhouette,
    candidate.fitType,
    ...(candidate.useCases ?? []),
  ]);
  return buildShoeComparisonSignals({
    archetype: inferShoeArchetype(blob),
    blob,
    brand,
    colorFamily: candidate.colorFamily,
    descriptorSummary: profileSummary,
    formality: candidate.formality,
    styleRole: null,
  });
}

function buildShoeComparisonSignalsFromItem(item: StyleItemRecord) {
  const profileSummary = descriptorSummaryFromItem(item);
  const brand = item.brand?.trim().toLowerCase() ?? null;
  const blob = buildShoeSignalBlob([
    item.brand,
    item.name,
    item.subcategory,
    item.colorFamily,
    item.colorName,
    item.profile?.raw.itemType,
    item.profile?.raw.styleRole,
    ...(item.profile?.raw.tags ?? []),
    ...(item.profile?.raw.useCases ?? []),
  ]);
  return buildShoeComparisonSignals({
    archetype: inferShoeArchetype(blob),
    blob,
    brand,
    colorFamily: item.colorFamily,
    descriptorSummary: profileSummary,
    formality: item.formality,
    styleRole: item.profile?.raw.styleRole ?? null,
  });
}

function buildShoeComparisonSignals(input: {
  archetype: string | null;
  blob: string;
  brand: string | null;
  colorFamily: string | null;
  descriptorSummary: StyleDescriptorSummaryRecord | null;
  formality: number | null;
  styleRole: string | null;
}) {
  const refinementScore = inferShoeRefinementScore({
    archetype: input.archetype,
    blob: input.blob,
    brand: input.brand,
    descriptorSummary: input.descriptorSummary,
    formality: input.formality,
  });
  return {
    archetype: input.archetype,
    colorFamily: input.colorFamily?.toLowerCase() ?? null,
    colorDetails: extractShoeColorDetailSignals(input.blob),
    families: extractShoeFamilySignals(input.blob),
    refinementScore,
    roleTags: inferShoeRoleTags({
      archetype: input.archetype,
      blob: input.blob,
      refinementScore,
      styleRole: input.styleRole,
    }),
    wardrobeJob: inferShoeWardrobeJob({
      archetype: input.archetype,
      blob: input.blob,
      refinementScore,
      styleRole: input.styleRole,
    }),
  };
}

function buildShoeSignalBlob(values: Array<string | null | undefined>): string {
  return values
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();
}

function inferShoeArchetype(blob: string): string | null {
  if (!blob) {
    return null;
  }
  if (/\bloafer\b/.test(blob)) {
    return 'loafer';
  }
  if (/\bchelsea\b/.test(blob)) {
    return 'chelsea_boot';
  }
  if (/\b(oxford|derby|cap-toe)\b/.test(blob)) {
    return 'dress_shoe';
  }
  if (/\b(slide|slides|sandal|sandals)\b/.test(blob)) {
    return 'slide';
  }
  if (/\b(air force 1|af1|stan smith|achilles|common projects|court sneaker|tennis sneaker|leather sneaker)\b/.test(blob)) {
    return 'court_sneaker';
  }
  if (/\b(air max|runner|running|retro runner)\b/.test(blob)) {
    return 'runner';
  }
  if (/\b(kobe|kyrie|basketball|jordan)\b/.test(blob)) {
    return 'basketball_sneaker';
  }
  if (/\b(boot|ranger)\b/.test(blob)) {
    return 'boot';
  }
  if (/\b(sneaker|sneakers|trainer|trainers)\b/.test(blob)) {
    return 'general_sneaker';
  }
  return null;
}

function extractShoeFamilySignals(blob: string): string[] {
  const families = new Set<string>();
  const familyPatterns: Array<[RegExp, string]> = [
    [/\b(air force 1|af1)\b/, 'air_force_1'],
    [/\bstan smith\b/, 'stan_smith'],
    [/\b(common projects|achilles)\b/, 'common_projects_achilles'],
    [/\bair max\b/, 'air_max'],
    [/\bhot step\b/, 'hot_step'],
    [/\biron ranger\b/, 'iron_ranger'],
    [/\bduke chelsea\b/, 'duke_chelsea'],
  ];

  for (const [pattern, family] of familyPatterns) {
    if (pattern.test(blob)) {
      families.add(family);
    }
  }

  return [...families];
}

function extractShoeColorDetailSignals(blob: string): string[] {
  const details = new Set<string>();
  const colorPatterns: Array<[RegExp, string]> = [
    [/\b(triple white|all white)\b/, 'triple_white'],
    [/\b(triple black|all black)\b/, 'triple_black'],
    [/\bcitron(?: tint)?\b/, 'citron_tint'],
    [/\bcobalt(?: tint)?\b/, 'cobalt_tint'],
    [/\bmetallic silver\b/, 'metallic_silver'],
    [/\bsail\b/, 'sail'],
    [/\bwhite\b/, 'white'],
    [/\bblack\b/, 'black'],
    [/\b(gray|grey|silver)\b/, 'gray'],
    [/\b(beige|cream|tan|taupe|khaki)\b/, 'beige'],
    [/\b(yellow|gold)\b/, 'yellow'],
    [/\b(olive|green)\b/, 'green'],
  ];

  for (const [pattern, detail] of colorPatterns) {
    if (pattern.test(blob)) {
      details.add(detail);
    }
  }

  return [...details];
}

function isSpecificShoeColorDetail(detail: string): boolean {
  return detail !== 'white' && detail !== 'black' && detail !== 'gray' && detail !== 'beige';
}

function inferShoeRoleTags(input: {
  archetype: string | null;
  blob: string;
  refinementScore: number;
  styleRole: string | null;
}): string[] {
  const tags = new Set<string>();
  if (/\b(training|running|athletic|performance|basketball)\b/.test(input.blob)) {
    tags.add('athletic');
  }
  if (/\b(streetwear|collab|nocta|statement)\b/.test(input.blob)) {
    tags.add('statement');
  }
  if (input.styleRole && /statement/i.test(input.styleRole)) {
    tags.add('statement');
  }
  if (
    input.archetype === 'loafer' ||
    input.archetype === 'dress_shoe' ||
    input.archetype === 'chelsea_boot' ||
    input.refinementScore >= 4.2
  ) {
    tags.add('elevated');
  }
  if (
    input.archetype === 'court_sneaker' ||
    input.archetype === 'general_sneaker' ||
    input.archetype === 'runner' ||
    input.archetype === 'boot'
  ) {
    tags.add('everyday');
  }
  if (tags.size === 0) {
    tags.add('general');
  }
  return [...tags];
}

function inferShoeWardrobeJob(input: {
  archetype: string | null;
  blob: string;
  refinementScore: number;
  styleRole: string | null;
}): string {
  const styleRole = input.styleRole ?? '';
  if (input.archetype === 'loafer') {
    return 'loafer_bridge';
  }
  if (input.archetype === 'dress_shoe') {
    return 'formal_dress_shoe';
  }
  if (input.archetype === 'chelsea_boot' || input.archetype === 'boot') {
    return 'boot';
  }
  if (input.archetype === 'slide') {
    return 'slide';
  }
  if (input.archetype === 'runner' || /\b(runner|running|air max|performance|training)\b/.test(input.blob)) {
    return 'runner_sneaker';
  }
  if (
    /\b(air force 1|af1|nocta|jordan|kobe|basketball|streetwear|collab|statement)\b/.test(input.blob) ||
    /streetwear|statement/i.test(styleRole)
  ) {
    return 'streetwear_sneaker';
  }
  if (
    input.archetype === 'court_sneaker' &&
    (/\b(common projects|achilles|minimal|minimalist|smart casual|refined|leather low[- ]?top|white sneaker)\b/.test(input.blob) ||
      input.refinementScore >= 4.2)
  ) {
    return 'minimal_smart_sneaker';
  }
  if (input.archetype === 'court_sneaker' || input.archetype === 'general_sneaker') {
    return 'everyday_sneaker';
  }
  return input.archetype ?? 'unknown_shoe';
}

function inferShoeRefinementScore(input: {
  archetype: string | null;
  blob: string;
  brand: string | null;
  descriptorSummary: StyleDescriptorSummaryRecord | null;
  formality: number | null;
}): number {
  let score = 2.6;
  const qualityTier = input.descriptorSummary?.qualityTier?.toLowerCase() ?? null;
  if (qualityTier === 'investment') {
    score += 1.8;
  } else if (qualityTier === 'premium') {
    score += 1.2;
  } else if (qualityTier === 'mid') {
    score += 0.4;
  } else if (qualityTier === 'budget') {
    score -= 0.4;
  }

  const polish = input.descriptorSummary?.polishLevel?.toLowerCase() ?? '';
  if (/(polished|refined|minimal|sleek|clean|luxury|quiet luxury|italian)/.test(polish + ' ' + input.blob)) {
    score += 0.8;
  }

  if (input.formality != null) {
    score += Math.max(0, input.formality - 2) * 0.25;
  }

  if (input.archetype === 'dress_shoe' || input.archetype === 'loafer') {
    score += 0.6;
  }

  const brandScores: Record<string, number> = {
    'common projects': 4.8,
    alden: 4.6,
    'allen edmonds': 4.1,
    'red wing': 3.8,
    'thursday boots': 3.2,
    nike: 2.8,
    adidas: 2.5,
  };
  if (input.brand && brandScores[input.brand] != null) {
    score = Math.max(score, brandScores[input.brand]!);
  }

  return Math.max(1, Math.min(5, Number(score.toFixed(1))));
}

function shoeRelationPriority(
  relation: StylePurchaseAnalysis['comparatorReasoning']['topComparisons'][number]['relation'],
): number {
  switch (relation) {
    case 'duplicate':
      return 5;
    case 'replacement':
      return 4;
    case 'upgrade':
      return 3;
    case 'adjacent':
      return 2;
    case 'distinct':
      return 1;
    default:
      return 0;
  }
}

function shoeConfidencePriority(
  confidence: StylePurchaseAnalysis['comparatorReasoning']['topComparisons'][number]['confidence'],
): number {
  switch (confidence) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
}

function intersectStrings(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((entry) => rightSet.has(entry));
}

function formatShoeFamilyLabel(family: string): string {
  switch (family) {
    case 'air_force_1':
      return 'Air Force 1';
    case 'stan_smith':
      return 'Stan Smith';
    case 'common_projects_achilles':
      return 'Common Projects / Achilles';
    case 'air_max':
      return 'Air Max';
    case 'hot_step':
      return 'Hot Step';
    case 'iron_ranger':
      return 'Iron Ranger';
    case 'duke_chelsea':
      return 'Duke Chelsea';
    default:
      return family.replace(/_/g, ' ');
  }
}

function formatShoeColorDetailLabel(detail: string): string {
  switch (detail) {
    case 'triple_white':
      return 'triple white';
    case 'triple_black':
      return 'triple black';
    case 'citron_tint':
      return 'citron tint';
    case 'cobalt_tint':
      return 'cobalt tint';
    case 'metallic_silver':
      return 'metallic silver';
    default:
      return detail.replace(/_/g, ' ');
  }
}

function describeShoeKind(candidate: StylePurchaseAnalysis['candidate']): string {
  const archetype = inferShoeArchetype(buildShoeSignalBlob([
    candidate.brand,
    candidate.name,
    candidate.subcategory,
    candidate.notes,
    candidate.silhouette,
    candidate.texture,
  ]));

  switch (archetype) {
    case 'court_sneaker':
    case 'general_sneaker':
    case 'runner':
      return 'sneaker';
    case 'loafer':
      return 'loafer';
    case 'chelsea_boot':
    case 'boot':
      return 'boot';
    case 'dress_shoe':
      return 'dress shoe';
    case 'slide':
      return 'slide';
    default:
      break;
  }

  const fallback = candidate.subcategory ?? candidate.comparatorKey ?? candidate.category ?? 'shoe';
  return fallback.toString().trim().toLowerCase().replace(/_/g, ' ') || 'shoe';
}

function pluralizeShoeKind(kind: string): string {
  if (kind.endsWith('s')) return kind;
  if (kind.endsWith('y')) return `${kind.slice(0, -1)}ies`;
  return `${kind}s`;
}

function formatOwnedItemLabel(item: StyleItemRecord): string {
  const name = item.name?.trim();
  const brand = item.brand?.trim();
  if (!name) return item.id;
  if (!brand) return name;
  if (name.toLowerCase().includes(brand.toLowerCase())) {
    return name;
  }
  return `${brand} ${name}`;
}

function formatCategoryLaneLabel(category: string | null | undefined): string {
  const normalized = category?.toString().trim().toLowerCase().replace(/_/g, ' ') ?? '';
  return normalized || 'unknown lane';
}

function sharesCandidateNameToken(candidate: StylePurchaseAnalysis['candidate'], item: StyleItemRecord): boolean {
  const candidateTokens = meaningfulComparisonTokens([candidate.brand, candidate.name, candidate.subcategory]);
  const itemTokens = meaningfulComparisonTokens([item.brand, item.name, item.subcategory]);
  if (candidateTokens.size === 0 || itemTokens.size === 0) {
    return false;
  }
  return [...candidateTokens].some((token) => itemTokens.has(token));
}

function meaningfulComparisonTokens(values: Array<string | null | undefined>): Set<string> {
  const ignored = new Set(['and', 'for', 'low', 'men', 'mens', 'the', 'with']);
  const tokens = values
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !ignored.has(token));
  return new Set(tokens);
}

function formatShoeArchetypeLabel(archetype: string): string {
  switch (archetype) {
    case 'court_sneaker':
      return 'court sneaker';
    case 'runner':
      return 'runner';
    case 'basketball_sneaker':
      return 'basketball sneaker';
    case 'dress_shoe':
      return 'dress shoe';
    case 'chelsea_boot':
      return 'Chelsea boot';
    default:
      return archetype.replace(/_/g, ' ');
  }
}

function formatShoeRoleLabel(role: string): string {
  switch (role) {
    case 'everyday':
      return 'everyday casual';
    case 'elevated':
      return 'elevated casual';
    default:
      return role.replace(/_/g, ' ');
  }
}

function formatShoeWardrobeJobLabel(job: string): string {
  switch (job) {
    case 'minimal_smart_sneaker':
      return 'minimal smart sneaker';
    case 'streetwear_sneaker':
      return 'streetwear sneaker';
    case 'runner_sneaker':
      return 'runner sneaker';
    case 'loafer_bridge':
      return 'loafer';
    case 'formal_dress_shoe':
      return 'dress shoe';
    default:
      return job.replace(/_/g, ' ');
  }
}

function activeStyleColorSignals(profile: StyleProfileRecord['raw']): string[] {
  const weighted = (profile.colorPreferences ?? []).map((entry) => entry.value?.toLowerCase()).filter(Boolean) as string[];
  const legacy = (profile.colorDirections ?? []).map((entry) => entry.toLowerCase());
  return Array.from(new Set([...weighted, ...legacy]));
}

function activeStyleSilhouetteSignals(profile: StyleProfileRecord['raw']): string[] {
  const weighted = (profile.silhouettePreferences ?? []).map((entry) => entry.value?.toLowerCase()).filter(Boolean) as string[];
  const legacy = (profile.preferredSilhouettes ?? []).map((entry) => entry.toLowerCase());
  return Array.from(new Set([...weighted, ...legacy]));
}

function buildLaneLabel(lane: string | null | undefined): string {
  if (!lane || lane === 'unknown') {
    return 'general wardrobe lane';
  }
  return lane
    .split('_')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function groupItemsByRedundancyCluster(items: StyleItemRecord[]): Map<string, StyleItemRecord[]> {
  const clusters = new Map<string, StyleItemRecord[]>();
  for (const item of items) {
    const key = `${item.comparatorKey ?? 'unknown'}::${item.colorFamily?.toLowerCase() ?? 'unknown'}::${deriveRedundancySubLane(item)}`;
    clusters.set(key, [...(clusters.get(key) ?? []), item]);
  }
  return clusters;
}

function deriveRedundancySubLane(item: StyleItemRecord): string {
  const profile = item.profile?.raw ?? null;
  if (!profile) {
    return 'general';
  }

  const bestOccasions = new Set((profile.bestOccasions ?? []).map((value) => value.toLowerCase()));
  const tags = new Set((profile.tags ?? []).map((value) => value.toLowerCase()));
  const itemType = profile.itemType?.toLowerCase() ?? '';
  const styleRole = profile.styleRole?.toLowerCase() ?? '';
  const dressCodeMin = profile.dressCode?.min ?? null;
  const dressCodeMax = profile.dressCode?.max ?? null;
  const narrowLowDressCode = dressCodeMin != null && dressCodeMax != null && dressCodeMin <= 1 && dressCodeMax <= 1;
  const broadCasualDressCode = dressCodeMin != null && dressCodeMax != null && dressCodeMin <= 1 && dressCodeMax <= 3;

  if (
    bestOccasions.has('athletic') ||
    bestOccasions.has('training') ||
    tags.has('athletic') ||
    tags.has('training') ||
    tags.has('gym') ||
    tags.has('running') ||
    tags.has('performance') ||
    (styleRole === 'workhorse' && narrowLowDressCode)
  ) {
    return 'athletic';
  }

  if (
    styleRole === 'statement' ||
    tags.has('graphic tee') ||
    tags.has('graphic_tee') ||
    tags.has('merch') ||
    tags.has('merch tee') ||
    tags.has('streetwear') ||
    itemType === 'long sleeve tee' ||
    itemType === 'graphic tee' ||
    itemType === 'merch tee'
  ) {
    return 'statement';
  }

  if (
    styleRole === 'smart' ||
    styleRole === 'bridge' ||
    bestOccasions.has('smart_casual') ||
    bestOccasions.has('smart casual') ||
    bestOccasions.has('formal') ||
    (dressCodeMin != null && dressCodeMin >= 3)
  ) {
    return 'smart';
  }

  if (styleRole === 'workhorse' || broadCasualDressCode) {
    return 'casual_basics';
  }

  return 'general';
}

function formatRedundancySubLaneLabel(subLane: string): string | null {
  switch (subLane) {
    case 'athletic':
      return 'athletic lane';
    case 'statement':
      return 'statement lane';
    case 'smart':
      return 'smarter lane';
    case 'casual_basics':
      return 'casual basics lane';
    default:
      return null;
  }
}

function chooseReplacementCandidate(items: StyleItemRecord[]): StyleItemRecord | null {
  if (items.length === 0) {
    return null;
  }
  const sorted = [...items].sort((left, right) => {
    const leftScore = replacementCandidateScore(left);
    const rightScore = replacementCandidateScore(right);
    if (leftScore !== rightScore) {
      return leftScore - rightScore;
    }
    return (left.name ?? left.id).localeCompare(right.name ?? right.id);
  });
  return sorted[0] ?? null;
}

function replacementCandidateScore(item: StyleItemRecord): number {
  let score = 0;
  if (item.photos.some((photo) => photo.delivery)) {
    score += 1;
  }
  if (hasStyleDescriptors(item.profile?.raw ?? null)) {
    score += 1;
  }
  if (item.profile?.raw.qualityTier === 'investment') {
    score += 3;
  }
  if (item.profile?.raw.qualityTier === 'premium') {
    score += 2;
  }
  if (item.profile?.raw.styleRole === 'workhorse') {
    score += 1;
  }
  if (item.formality != null && item.formality >= 2) {
    score += 1;
  }
  if (/(smart|structured|polished)/i.test(item.profile?.raw.polishLevel ?? '')) {
    score += 1;
  }
  return score;
}

function deriveWardrobeWeakSpots(input: {
  focus: StyleWardrobeAnalysisFocus;
  gapLanes: StyleWardrobeFindingRecord[];
  redundancyWeakSpots: StyleWardrobeFindingRecord[];
}): StyleWardrobeFindingRecord[] {
  if (input.focus === 'redundancy' || input.focus === 'replacements') {
    return input.redundancyWeakSpots.slice(0, 6);
  }
  if (input.focus === 'gaps' || input.focus === 'buy_next') {
    return input.gapLanes.slice(0, 6);
  }
  if (input.focus === 'occasion') {
    return [];
  }
  return [...input.gapLanes, ...input.redundancyWeakSpots].slice(0, 6);
}

function deriveWardrobeGapLanes(input: {
  activeItems: StyleItemRecord[];
  categoryMap: Map<string, StyleItemRecord[]>;
  laneMap: Map<string, StyleItemRecord[]>;
  profile: StyleProfileRecord;
}): StyleWardrobeFindingRecord[] {
  const gaps: StyleWardrobeFindingRecord[] = [];
  const hasLoafer = (input.laneMap.get('loafer')?.length ?? 0) > 0;
  const hasTrouser = (input.laneMap.get('trouser')?.length ?? 0) > 0;
  const hasOxfordShirt = (input.laneMap.get('oxford_shirt')?.length ?? 0) > 0;
  const hasOuterwearBridge = (input.categoryMap.get('outerwear')?.length ?? 0) > 0;

  if (!hasLoafer) {
    gaps.push({
      itemIds: [],
      label: 'Smart-casual bridge shoe',
      lane: 'loafer',
      notes: ['no dedicated loafer or equivalent bridge shoe is present', 'this limits smart-casual range between sneakers and formal shoes'],
      priority: 'high',
    });
  }
  if (!hasTrouser) {
    gaps.push({
      itemIds: [],
      label: 'Clean trouser lane',
      lane: 'trouser',
      notes: ['the wardrobe lacks a clean trouser lane', 'this weakens sharper smart-casual combinations'],
      priority: 'high',
    });
  }
  if (!hasOxfordShirt) {
    gaps.push({
      itemIds: [],
      label: 'Refined shirt lane',
      lane: 'oxford_shirt',
      notes: ['there is no reliable oxford or equivalent refined shirt lane', 'this makes the wardrobe rely too heavily on casual tops'],
      priority: 'medium',
    });
  }
  if (!hasOuterwearBridge && input.activeItems.length >= 6) {
    gaps.push({
      itemIds: [],
      label: 'Bridge outerwear',
      lane: 'smart_casual_outerwear',
      notes: ['outerwear coverage is thin for smart-casual looks', 'a bridge layer would help connect casual basics to sharper pieces'],
      priority: 'medium',
    });
  }

  const preferredColors = activeStyleColorSignals(input.profile.raw);
  if (preferredColors.length > 0) {
    const activeColorSet = new Set(input.activeItems.map((item) => item.colorFamily?.toLowerCase()).filter(Boolean));
    const missingPreferredColors = preferredColors.filter((value) => !activeColorSet.has(value));
    if (missingPreferredColors.length > 0) {
      gaps.push({
        itemIds: [],
        label: 'Preferred palette coverage',
        lane: 'palette',
        notes: [`preferred palette is missing visible coverage in ${missingPreferredColors.slice(0, 3).join(', ')}`],
        priority: 'low',
      });
    }
  }

  return gaps.slice(0, 6);
}

function deriveBridgePieces(input: {
  categoryMap: Map<string, StyleItemRecord[]>;
  laneMap: Map<string, StyleItemRecord[]>;
  profile: StyleProfileRecord;
}): StyleWardrobeFindingRecord[] {
  const bridges: StyleWardrobeFindingRecord[] = [];
  if ((input.laneMap.get('trouser')?.length ?? 0) > 0 && (input.laneMap.get('loafer')?.length ?? 0) === 0) {
    bridges.push({
      itemIds: input.laneMap.get('trouser')?.map((item) => item.id) ?? [],
      label: 'Bridge shoe',
      lane: 'loafer',
      notes: ['clean trousers exist but there is no bridge shoe to carry them into smarter outfits'],
      priority: 'high',
    });
  }
  if ((input.categoryMap.get('top')?.length ?? 0) >= 4 && (input.laneMap.get('oxford_shirt')?.length ?? 0) === 0) {
    bridges.push({
      itemIds: [],
      label: 'Bridge shirt',
      lane: 'oxford_shirt',
      notes: ['tops skew casual; a more refined shirt lane would connect casual and polished outfits'],
      priority: 'medium',
    });
  }
  return bridges;
}

function deriveBuyNextCandidates(
  gapLanes: StyleWardrobeFindingRecord[],
  bridgePieces: StyleWardrobeFindingRecord[],
): StyleWardrobeFindingRecord[] {
  const deduped = new Map<string, StyleWardrobeFindingRecord>();
  for (const entry of [...gapLanes, ...bridgePieces].sort(
    (left, right) => wardrobePriorityScore(right.priority) - wardrobePriorityScore(left.priority),
  )) {
    const key = entry.lane ? `lane:${entry.lane}` : `label:${entry.label.trim().toLowerCase()}`;
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, {
        ...entry,
        notes: [...entry.notes, 'treat this as a buy-next lane, not a hardcoded recommendation verdict'],
      });
      continue;
    }
    deduped.set(key, {
      ...existing,
      itemIds: Array.from(new Set([...existing.itemIds, ...entry.itemIds])),
      notes: Array.from(new Set([...existing.notes, ...entry.notes])),
      priority:
        wardrobePriorityScore(entry.priority) > wardrobePriorityScore(existing.priority) ? entry.priority : existing.priority,
    });
  }
  return [...deduped.values()].slice(0, 5);
}

function deriveOccasionCoverage(input: {
  activeItems: StyleItemRecord[];
  laneMap: Map<string, StyleItemRecord[]>;
  profile: StyleProfileRecord;
}): StyleOccasionCoverageRecord[] {
  const smartCasualAnchors =
    (input.laneMap.get('trouser')?.length ?? 0) +
    (input.laneMap.get('oxford_shirt')?.length ?? 0) +
    (input.laneMap.get('loafer')?.length ?? 0);
  const casualAnchors = input.activeItems.filter((item) => (item.formality ?? 0) <= 2).length;
  const formalAnchors = input.activeItems.filter((item) => (item.formality ?? 0) >= 4).length;

  return [
    {
      coverage: casualAnchors >= 3 ? 'strong' : casualAnchors >= 1 ? 'partial' : 'weak',
      itemIds: input.activeItems.filter((item) => (item.formality ?? 0) <= 2).slice(0, 4).map((item) => item.id),
      notes: casualAnchors >= 3 ? ['casual coverage is already healthy'] : ['casual coverage is still light'],
      occasion: 'casual',
    },
    {
      coverage: smartCasualAnchors >= 3 ? 'strong' : smartCasualAnchors >= 1 ? 'partial' : 'weak',
      itemIds: [
        ...(input.laneMap.get('trouser')?.slice(0, 2).map((item) => item.id) ?? []),
        ...(input.laneMap.get('oxford_shirt')?.slice(0, 1).map((item) => item.id) ?? []),
        ...(input.laneMap.get('loafer')?.slice(0, 1).map((item) => item.id) ?? []),
      ],
      notes:
        smartCasualAnchors >= 3
          ? ['smart-casual anchor pieces exist across shirt, trouser, and footwear lanes']
          : ['smart-casual bridge coverage is still incomplete'],
      occasion: 'smart_casual',
    },
    {
      coverage: formalAnchors >= 2 ? 'strong' : formalAnchors >= 1 ? 'partial' : 'weak',
      itemIds: input.activeItems.filter((item) => (item.formality ?? 0) >= 4).slice(0, 4).map((item) => item.id),
      notes: formalAnchors >= 2 ? ['formal coverage exists for dressier occasions'] : ['formal coverage is limited'],
      occasion: 'formal',
    },
  ];
}

function describeLaneOccasionSupport(lane: string, laneItems: StyleItemRecord[]): string | null {
  const averageFormality =
    laneItems.reduce((sum, item) => sum + (item.formality ?? 0), 0) / Math.max(1, laneItems.length);
  if (averageFormality >= 4) {
    return 'this lane meaningfully supports dressier occasion coverage';
  }
  if (averageFormality >= 2.5) {
    return 'this lane helps carry smart-casual dressing without much strain';
  }
  if (averageFormality > 0) {
    return 'this lane gives the casual core enough depth to stay intentional';
  }
  if (lane === 'tee' || lane === 'sneaker' || lane === 'jean') {
    return 'this lane clearly anchors the casual side of the wardrobe';
  }
  return null;
}

function filterWardrobeFindingsForFocus<T extends { priority?: StyleWardrobeFindingPriority }>(
  findings: T[],
  focus: StyleWardrobeAnalysisFocus,
  allowedFocuses: StyleWardrobeAnalysisFocus[],
): T[] {
  if (!allowedFocuses.includes(focus)) {
    return [];
  }
  return findings
    .slice()
    .sort((left, right) => wardrobePriorityScore((right.priority ?? 'low') as StyleWardrobeFindingPriority) - wardrobePriorityScore((left.priority ?? 'low') as StyleWardrobeFindingPriority))
    .slice(0, 6);
}

function isAthleticPurchaseCandidate(candidate: StylePurchaseCandidate): boolean {
  const blob = [
    candidate.name,
    candidate.notes,
    candidate.subcategory,
    candidate.comparatorKey,
    candidate.useCases.join(' '),
    candidate.avoidUseCases.join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /\b(running|technical|performance|trail|athletic|training|gym|jersey)\b/i.test(blob);
}

function isAthleticStyleItem(item: StyleItemRecord): boolean {
  const profile = item.profile?.raw;
  const blob = [
    item.name,
    item.subcategory,
    item.comparatorKey,
    profile?.itemType,
    ...(profile?.tags ?? []),
    ...(profile?.bestOccasions ?? []),
    ...(profile?.useCases ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/\b(athletic|training|performance|gym|running|jogger|jersey)\b/i.test(blob)) {
    return true;
  }
  return (profile?.dressCode?.max ?? null) === 1 && (profile?.bestOccasions ?? []).includes('athletic');
}

function isCoherentPairingCandidate(input: {
  candidateAthletic: boolean;
  item: StyleItemRecord;
}): boolean {
  if (input.candidateAthletic) {
    return true;
  }
  if (!isAthleticStyleItem(input.item)) {
    return true;
  }
  const itemCategory = input.item.category?.toLowerCase() ?? '';
  return itemCategory !== 'bottom' && itemCategory !== 'shoe';
}

function wardrobePriorityScore(priority: StyleWardrobeFindingPriority): number {
  if (priority === 'high') {
    return 3;
  }
  if (priority === 'medium') {
    return 2;
  }
  return 1;
}

function buildLaneAssessment(input: {
  candidateCategory: string;
  candidateComparatorKey: string | null;
  exactComparatorCount: number;
  nearbyFormalityCount: number;
  pairingCount: number;
  sameCategoryCount: number;
  typedRoleCount: number;
}): StylePurchaseAnalysis['laneAssessment'] {
  const notes: string[] = [];
  let existingLane: string | null = null;
  let introduces: string | null = null;
  const bridges: string[] = [];
  if (input.exactComparatorCount > 0) {
    existingLane = input.candidateComparatorKey;
    notes.push(`candidate sits inside the existing ${buildLaneLabel(input.candidateComparatorKey)} area`);
  } else if (input.typedRoleCount > 0 || input.sameCategoryCount > 0) {
    existingLane = input.candidateCategory.toLowerCase();
    notes.push(`candidate extends the existing ${input.candidateCategory.toLowerCase()} area without a direct exact comparator`);
  } else {
    introduces = input.candidateComparatorKey ?? input.candidateCategory.toLowerCase();
    notes.push(`candidate introduces a relatively new ${input.candidateCategory.toLowerCase()} area`);
  }
  if (input.pairingCount >= 2 && input.nearbyFormalityCount >= 1) {
    bridges.push('multiple existing pairing groups');
    notes.push('candidate can bridge into multiple existing pairing groups');
  }
  return {
    bridges,
    existingLane,
    introduces,
    notes,
  };
}

function buildCoverageImpact(input: {
  bridgeCandidateCount: number;
  exactComparatorCount: number;
  gapLane: boolean;
  sameCategoryCount: number;
}): StylePurchaseAnalysis['coverageImpact'] {
  const notes: string[] = [];
  let strengthensWeakArea = false;
  let pilesIntoCoveredLane = false;
  if (input.gapLane) {
    notes.push('candidate strengthens a weak or missing area in the current wardrobe');
    strengthensWeakArea = true;
  }
  if (!input.gapLane && (input.exactComparatorCount >= 2 || input.sameCategoryCount >= 4)) {
    notes.push('candidate enters an area that is already fairly covered');
    pilesIntoCoveredLane = true;
  }
  if (input.bridgeCandidateCount >= 2) {
    notes.push('candidate has strong bridge potential across existing outfit groups');
  }
  return {
    notes,
    pilesIntoCoveredLane,
    strengthensWeakArea,
  };
}

function buildPurchaseConfidenceNotes(input: {
  candidateHasImage: boolean;
  comparatorCoverageMode: StyleComparatorCoverage['mode'];
  descriptorDeltas: Array<{ itemId: string; notes: string[] }>;
  exactComparatorCount: number;
  itemsById: Record<string, StyleItemSummaryRecord>;
}): string[] {
  const notes: string[] = [];
  if (!input.candidateHasImage) {
    notes.push('candidate-side visual grounding is partial because no candidate image was provided');
  }
  if (input.comparatorCoverageMode !== 'exact_comparator') {
    notes.push(`comparator confidence is ${input.comparatorCoverageMode.replace(/_/g, ' ')} rather than exact comparator coverage`);
  }
  if (input.exactComparatorCount === 0) {
    notes.push('descriptor comparisons rely on related closet areas rather than exact twins');
  }
  if (Object.keys(input.itemsById).length === 0) {
    notes.push('closet context is sparse for this candidate');
  }
  if (input.descriptorDeltas.length === 0) {
    notes.push('descriptor deltas are limited, so final stylist judgment should lean on direct image reading');
  }
  return notes;
}
