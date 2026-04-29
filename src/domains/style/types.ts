export type StyleOnboardingPath = 'seeded' | 'fresh' | null;
export type StyleClosetCoverage = 'current' | 'partial' | null;
export type StylePhotoKind = 'product' | 'fit' | 'detail' | 'unknown';
export type StylePhotoSource = 'imported' | 'user_upload' | 'generated_metadata' | 'legacy_reference';
export type StyleItemStatus = 'active' | 'archived' | 'retired';
export type StyleOnboardingMode = 'seeded' | 'fresh';
export type StyleComparatorKey =
  | 'unknown'
  | 'tee'
  | 'polo'
  | 'oxford_shirt'
  | 'dress_shirt'
  | 'camp_shirt'
  | 'overshirt'
  | 'sweater'
  | 'henley'
  | 'jersey'
  | 'hoodie'
  | 'cardigan'
  | 'jacket'
  | 'coat'
  | 'other_top'
  | 'jean'
  | 'chino'
  | 'trouser'
  | 'jogger'
  | 'short'
  | 'other_bottom'
  | 'sneaker'
  | 'loafer'
  | 'derby'
  | 'oxford'
  | 'boot'
  | 'sandal'
  | 'mule'
  | 'other_shoe';
export type StyleComparatorCoverageMode = 'exact_comparator' | 'typed_role' | 'category_fallback' | 'sparse';
export type StylePreferenceWeight = 'low' | 'medium' | 'high';
export type StyleBrandAffinityStance = 'prefer' | 'avoid' | 'conditional';
export type StyleEvidenceGapType =
  | 'missing_primary_photo_delivery'
  | 'missing_typed_profile'
  | 'weak_descriptor_coverage'
  | 'weak_comparator_identity';
export type StyleEvidenceGapPriorityFilter = 'actionable' | 'all' | 'high' | 'low' | 'medium';
export type StyleWardrobeAnalysisFocus = 'all' | 'gaps' | 'replacements' | 'buy_next' | 'redundancy' | 'occasion';
export type StyleWardrobeFindingPriority = 'low' | 'medium' | 'high';
export type StyleOccasionCoverageLevel = 'strong' | 'partial' | 'weak';
export type StyleDescriptorBacklogFocus = 'all' | 'blocked' | 'priority';

export interface StyleWeightedPreferenceRecord {
  note: string | null;
  value: string;
  weight: StylePreferenceWeight;
}

export interface StyleFormalityPreferenceRecord {
  context: string;
  note: string | null;
  targetRange: {
    max: number | null;
    min: number | null;
  } | null;
}

export interface StyleOccasionRuleRecord {
  avoidLanes: string[];
  note: string | null;
  occasion: string;
  preferredLanes: string[];
}

export interface StyleFitProfileRecord {
  bodyNotes: string[];
  legShapePreference: string | null;
  risePreference: string | null;
  sleevePreference: string | null;
  topLengthPreference: string | null;
}

export interface StyleBudgetProfileRecord {
  everydayTier: string | null;
  investmentTier: string | null;
  splurgeCategories: string[];
}

export interface StyleBrandAffinityRecord {
  brand: string;
  note: string | null;
  stance: StyleBrandAffinityStance;
}

export interface StyleExceptionRuleRecord {
  allows: string[];
  note: string | null;
  when: string;
}

export interface StyleDescriptorSummaryRecord {
  descriptorConfidence: number | null;
  fabricHand: string | null;
  fitObservations: string[];
  polishLevel: string | null;
  qualityTier: string | null;
  seasonality: string[];
  silhouette: string | null;
  structureLevel: string | null;
  texture: string | null;
  useCases: string[];
  avoidUseCases: string[];
  visualWeight: string | null;
}

export interface StyleProfileDocument {
  aestheticKeywords: string[];
  brandAffinities: StyleBrandAffinityRecord[];
  budgetProfile: StyleBudgetProfileRecord | null;
  closetCoverage: StyleClosetCoverage;
  colorPreferences: StyleWeightedPreferenceRecord[];
  colorDirections: string[];
  contextRules: string[];
  exceptionRules: StyleExceptionRuleRecord[];
  fitProfile: StyleFitProfileRecord | null;
  fitNotes: string[];
  formalityPreferences: StyleFormalityPreferenceRecord[];
  formalityTendency: string | null;
  hardAvoids: string[];
  importedClosetAt: string | null;
  importedClosetConfirmed: boolean;
  importSource: string | null;
  onboardingPath: StyleOnboardingPath;
  occasionRules: StyleOccasionRuleRecord[];
  silhouettePreferences: StyleWeightedPreferenceRecord[];
  preferredSilhouettes: string[];
  practicalCalibrationConfirmed: boolean;
  sizingPreferences: string[];
  tasteCalibrationConfirmed: boolean;
}

export interface StyleProfileRecord {
  profileId: string;
  raw: StyleProfileDocument;
  tenantId: string;
  updatedAt: string | null;
}

export interface StylePhotoRecord {
  artifactId: string | null;
  bgRemoved: boolean;
  capturedAt: string | null;
  createdAt: string | null;
  delivery: StylePhotoDeliveryRecord | null;
  id: string;
  importedFrom: string | null;
  isFit: boolean;
  isPrimary: boolean;
  itemId: string;
  kind: StylePhotoKind;
  legacyPhotoId: number | null;
  mimeType: string | null;
  sourceUrl: string | null;
  source: StylePhotoSource;
  url: string;
  view: string | null;
}

export interface StylePhotoDeliveryRecord {
  auth: 'oauth_bearer';
  originalUrl: string;
}

export interface StyleItemSummaryRecord {
  brand: string | null;
  category: string | null;
  comparatorKey: StyleComparatorKey;
  colorFamily: string | null;
  formality: number | null;
  id: string;
  name: string | null;
  photoCount: number;
  primaryPhotoDelivery: StylePhotoDeliveryRecord | null;
  profileTags: string[];
  size: string | null;
  status: StyleItemStatus;
  subcategory: string | null;
}

export interface StyleItemProfileDocument {
  avoidOccasions: string[];
  bestOccasions: string[];
  confidence: number | null;
  descriptorConfidence: number | null;
  dressCode: {
    max: number | null;
    min: number | null;
  } | null;
  fabricHand: string | null;
  fitObservations: string[];
  itemType: string | null;
  pairingNotes: string | null;
  polishLevel: string | null;
  qualityTier: string | null;
  seasonality: string[];
  silhouette: string | null;
  styleRole: string | null;
  structureLevel: string | null;
  tags: string[];
  texture: string | null;
  useCases: string[];
  avoidUseCases: string[];
  visualWeight: string | null;
}

export interface StyleItemProfileRecord {
  itemId: string;
  legacyProfileId: number | null;
  method: string | null;
  raw: StyleItemProfileDocument;
  source: string | null;
  updatedAt: string | null;
}

export interface StyleItemRecord {
  brand: string | null;
  category: string | null;
  comparatorKey: StyleComparatorKey;
  colorFamily: string | null;
  colorHex: string | null;
  colorName: string | null;
  createdAt: string | null;
  formality: number | null;
  id: string;
  legacyItemId: number | null;
  name: string | null;
  photos: StylePhotoRecord[];
  profile: StyleItemProfileRecord | null;
  size: string | null;
  status: StyleItemStatus;
  subcategory: string | null;
  tenantId: string;
  updatedAt: string | null;
}

export interface StyleContextRecord {
  categoryBreakdown: Array<{ category: string; count: number }>;
  deliverablePhotoCoverage: number;
  descriptorCoverage: number;
  evidenceGapCount: number;
  colorBreakdown: Array<{ colorFamily: string; count: number }>;
  itemCount: number;
  onboardingMode: StyleOnboardingMode;
  photoCount: number;
  profile: StyleProfileRecord;
  profileCount: number;
  purchaseEvalReady: boolean;
  representativeItems: StyleItemSummaryRecord[];
  seededClosetPresent: boolean;
  stylistDescriptorCoverage: number;
  typedProfileCoverage: number;
  usableProfileCoverage: number;
}

export interface StylePurchaseCandidate {
  brand: string | null;
  category: string;
  comparatorKey: StyleComparatorKey | null;
  colorFamily: string | null;
  colorName: string | null;
  descriptorConfidence: number | null;
  estimatedPrice: {
    max: number | null;
    min: number | null;
  } | null;
  fabricHand: string | null;
  fitType: string | null;
  fitObservations: string[];
  formality: number | null;
  imageUrls: string[];
  name: string | null;
  notes: string | null;
  polishLevel: string | null;
  qualityTier: string | null;
  seasonality: string[];
  silhouette: string | null;
  structureLevel: string | null;
  subcategory: string | null;
  texture: string | null;
  useCases: string[];
  avoidUseCases: string[];
  visualWeight: string | null;
}

export type StylePurchaseCandidateVisualGrounding = 'none' | 'image_reference_only' | 'host_visual_inspection';

export interface StylePurchaseVisualEvidence {
  candidateInspected: boolean;
  candidateObservations: string[];
  comparatorItemIdsInspected: string[];
  source: string | null;
}

export interface StylePurchaseAnalysisItemMatch {
  itemId: string;
  reasons: string[];
}

export type StylePurchaseComparisonRelation = 'duplicate' | 'replacement' | 'upgrade' | 'adjacent' | 'distinct' | 'uncertain';
export type StylePurchaseComparisonConfidence = 'low' | 'medium' | 'high';
export type StylePurchaseReasoningFraming = 'duplicate' | 'replacement' | 'upgrade' | 'adjacent' | 'addition' | 'uncertain';

export interface StylePurchasePairwiseComparison {
  confidence: StylePurchaseComparisonConfidence;
  itemId: string;
  notes: string[];
  overlapScore: number;
  relation: StylePurchaseComparisonRelation;
  summary: string;
}

export interface StylePurchaseRejectedComparison {
  itemId: string;
  rejectedBecause: string;
  reasons: string[];
}

export interface StylePurchaseComparatorReasoning {
  framing: StylePurchaseReasoningFraming;
  mode: 'baseline' | 'shoe_pairwise';
  notes: string[];
  rejectedComparisons: StylePurchaseRejectedComparison[];
  summary: string;
  topComparisons: StylePurchasePairwiseComparison[];
}

export interface StylePurchaseAnalysisBuckets {
  exactComparatorItems: StylePurchaseAnalysisItemMatch[];
  nearbyFormalityItems: StylePurchaseAnalysisItemMatch[];
  nonComparatorItems: StylePurchaseRejectedComparison[];
  pairingCandidates: StylePurchaseAnalysisItemMatch[];
  sameCategoryItems: StylePurchaseAnalysisItemMatch[];
  sameColorFamilyItems: StylePurchaseAnalysisItemMatch[];
  typedRoleItems: StylePurchaseAnalysisItemMatch[];
}

export interface StyleComparatorCoverage {
  exactComparatorCount: number;
  mode: StyleComparatorCoverageMode;
  note: string | null;
  sameCategoryCount: number;
  typedRoleCount: number;
}

export interface StylePurchaseAnalysis {
  candidate: StylePurchaseCandidate;
  candidateDescriptorSummary: StyleDescriptorSummaryRecord | null;
  candidateSummary: {
    category: string;
    comparatorKey: StyleComparatorKey | null;
    colorFamily: string | null;
    formality: number | null;
    hasCandidateImages: boolean;
    imageCount: number;
    name: string | null;
    silhouette: string | null;
    subcategory: string | null;
  };
  comparatorDescriptorSummaries: Record<string, StyleDescriptorSummaryRecord | null>;
  comparatorCoverage: StyleComparatorCoverage;
  comparatorReasoning: StylePurchaseComparatorReasoning;
  confidenceNotes: string[];
  contextBuckets: StylePurchaseAnalysisBuckets;
  coverageImpact: {
    notes: string[];
    pilesIntoCoveredLane: boolean;
    strengthensWeakArea: boolean;
  };
  descriptorDeltas: Array<{
    itemId: string;
    notes: string[];
  }>;
  itemsById: Record<string, StyleItemSummaryRecord>;
  laneAssessment: {
    bridges: string[];
    existingLane: string | null;
    introduces: string | null;
    notes: string[];
  };
  alignmentSignals: {
    matchedSignals: string[];
    notes: string[];
  };
  tensionSignals: {
    formalityMismatch: boolean;
    hardAvoid: string | null;
    notes: string[];
    paletteMismatch: boolean;
    silhouetteMismatch: boolean;
    sportUtilityException: boolean;
  };
  evidenceQuality: {
    candidateVisualGrounding: StylePurchaseCandidateVisualGrounding;
    candidateImageCount: number;
    candidateVisualObservations: string[];
    comparatorItemIdsInspected: string[];
    notes: string[];
    primaryPhotoCoverage: number;
    typedProfileCoverage: number;
    visualEvidenceSource: string | null;
  };
}

export interface StyleEvidenceGapRecord {
  gapTypes: StyleEvidenceGapType[];
  itemId: string;
  notes: string[];
  priority: StyleWardrobeFindingPriority;
  summary: StyleItemSummaryRecord;
}

export interface StyleEvidenceGapListRecord {
  appliedPriorityFilter: StyleEvidenceGapPriorityFilter;
  countsByType: Record<StyleEvidenceGapType, number>;
  descriptorCoverage: number;
  deliverablePhotoCoverage: number;
  items: StyleEvidenceGapRecord[];
  omittedItemCount: number;
  stylistDescriptorCoverage: number;
  typedProfileCoverage: number;
  usableProfileCoverage: number;
}

export interface StyleDescriptorBacklogEntry {
  blockedByPhoto: boolean;
  fitPreferredFields: string[];
  fitRequiredFields: string[];
  itemId: string;
  missingDescriptorFields: string[];
  photoSupport: {
    availablePhotoKinds: StylePhotoKind[];
    blockedByPhoto: boolean;
    deliverableFitPhoto: boolean;
    deliverableProductPhoto: boolean;
    deliverablePhotoCount: number;
  };
  priority: StyleWardrobeFindingPriority;
  productSafeFields: string[];
  reasons: string[];
  sourceSignals: string[];
  summary: StyleItemSummaryRecord;
}

export interface StyleDescriptorBacklogRecord {
  appliedFocus: StyleDescriptorBacklogFocus;
  blockedItemCount: number;
  descriptorCoverage: number;
  entries: StyleDescriptorBacklogEntry[];
  itemCount: number;
  stylistDescriptorCoverage: number;
  typedProfileCoverage: number;
  usableProfileCoverage: number;
}

export interface StyleWardrobeFindingRecord {
  itemIds: string[];
  label: string;
  lane: string | null;
  notes: string[];
  priority: StyleWardrobeFindingPriority;
}

export interface StyleRedundancyClusterRecord {
  itemIds: string[];
  label: string;
  lane: string;
  notes: string[];
}

export interface StyleOccasionCoverageRecord {
  coverage: StyleOccasionCoverageLevel;
  itemIds: string[];
  notes: string[];
  occasion: string;
}

export interface StyleReplacementCandidateRecord {
  itemId: string;
  notes: string[];
  priority: StyleWardrobeFindingPriority;
  replacementLane: string | null;
}

export interface StyleWardrobeAnalysis {
  bridgePieces: StyleWardrobeFindingRecord[];
  buyNextCandidates: StyleWardrobeFindingRecord[];
  evidenceWarnings: string[];
  focus: StyleWardrobeAnalysisFocus;
  gapLanes: StyleWardrobeFindingRecord[];
  itemsById: Record<string, StyleItemSummaryRecord>;
  occasionCoverage: StyleOccasionCoverageRecord[];
  redundancyClusters: StyleRedundancyClusterRecord[];
  replacementCandidates: StyleReplacementCandidateRecord[];
  strengths: StyleWardrobeFindingRecord[];
  weakSpots: StyleWardrobeFindingRecord[];
}

export interface StyleArchiveItemResult {
  activeExactMatchesAfter: StyleItemSummaryRecord[];
  activeExactMatchesBefore: StyleItemSummaryRecord[];
  archivedItemIds: string[];
  archivedItems: StyleItemSummaryRecord[];
  matchedItems: StyleItemSummaryRecord[];
  notes: string[];
  requestedItemId: string | null;
  requestedName: string | null;
  status: 'already_archived' | 'archived' | 'needs_disambiguation' | 'not_found';
  verifiedNoActiveExactMatch: boolean;
}

export type StyleVisualBundleDeliveryMode = 'authenticated_only' | 'authenticated_with_signed_fallback';

export type StyleVisualBundleAssetRole =
  | 'candidate'
  | 'requested_item'
  | 'exact_comparator'
  | 'typed_role'
  | 'same_category'
  | 'nearby_formality';

export type StyleVisualBundleComparisonBucketRole =
  | 'top_comparison'
  | 'exact_comparator'
  | 'typed_role'
  | 'same_category'
  | 'same_color_family'
  | 'nearby_formality'
  | 'pairing_candidate'
  | 'rejected_non_comparator';

export interface StyleVisualBundleItemContext {
  brand: string | null;
  category: string | null;
  colorFamily: string | null;
  colorName: string | null;
  comparatorKey: StyleComparatorKey;
  fabricHand: string | null;
  formality: number | null;
  itemType: string | null;
  name: string | null;
  pairingNotes: string | null;
  polishLevel: string | null;
  qualityTier: string | null;
  silhouette: string | null;
  status: StyleItemStatus;
  styleRole: string | null;
  subcategory: string | null;
  tags: string[];
  texture: string | null;
  useCases: string[];
  visualWeight: string | null;
}

export interface StyleVisualBundleComparisonContext {
  bucketRoles: StyleVisualBundleComparisonBucketRole[];
  confidence: StylePurchaseComparisonConfidence | null;
  descriptorDeltas: string[];
  notes: string[];
  overlapScore: number | null;
  reasons: string[];
  rejectedBecause: string | null;
  relation: StylePurchaseComparisonRelation | null;
  summary: string | null;
}

export interface StyleVisualBundleAssetRecord {
  authenticatedOriginalUrl: string | null;
  comparisonContext: StyleVisualBundleComparisonContext | null;
  fallbackExpiresAt: string | null;
  fallbackSignedOriginalUrl: string | null;
  itemContext: StyleVisualBundleItemContext | null;
  itemId: string | null;
  label: string;
  photoId: string | null;
  role: StyleVisualBundleAssetRole;
  sourceUrl: string | null;
}

export interface StyleVisualBundleRecord {
  assets: StyleVisualBundleAssetRecord[];
  comparatorCoverageMode: StyleComparatorCoverageMode | null;
  deliveryMode: StyleVisualBundleDeliveryMode;
  evidenceWarnings: string[];
  requestedItemIds: string[];
  visualInspection: {
    assetCount: number;
    fetchableAssetCount: number;
    note: string;
    state: 'no_images_available' | 'missing_candidate_image' | 'image_references_returned';
  };
}
