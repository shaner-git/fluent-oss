import type {
  StyleContextRecord,
  StyleDescriptorBacklogRecord,
  StyleEvidenceGapListRecord,
  StyleItemRecord,
  StyleProfileRecord,
  StylePurchaseAnalysis,
  StyleWardrobeAnalysis,
} from './types';

export function summarizeStyleProfile(profile: StyleProfileRecord) {
  return {
    aestheticKeywords: profile.raw.aestheticKeywords,
    brandAffinities: profile.raw.brandAffinities,
    budgetProfile: profile.raw.budgetProfile,
    closetCoverage: profile.raw.closetCoverage,
    colorPreferences: profile.raw.colorPreferences,
    colorDirections: profile.raw.colorDirections,
    contextRules: profile.raw.contextRules,
    exceptionRules: profile.raw.exceptionRules,
    fitProfile: profile.raw.fitProfile,
    fitNotes: profile.raw.fitNotes,
    formalityPreferences: profile.raw.formalityPreferences,
    formalityTendency: profile.raw.formalityTendency,
    hardAvoids: profile.raw.hardAvoids,
    importedClosetAt: profile.raw.importedClosetAt,
    importedClosetConfirmed: profile.raw.importedClosetConfirmed,
    importSource: profile.raw.importSource,
    onboardingPath: profile.raw.onboardingPath,
    occasionRules: profile.raw.occasionRules,
    preferredSilhouettes: profile.raw.preferredSilhouettes,
    practicalCalibrationConfirmed: profile.raw.practicalCalibrationConfirmed,
    silhouettePreferences: profile.raw.silhouettePreferences,
    sizingPreferences: profile.raw.sizingPreferences,
    tasteCalibrationConfirmed: profile.raw.tasteCalibrationConfirmed,
    updatedAt: profile.updatedAt,
  };
}

export function summarizeStyleItem(item: StyleItemRecord) {
  const primaryPhoto = item.photos.find((photo) => photo.isPrimary) ?? item.photos[0] ?? null;
  return {
    brand: item.brand,
    category: item.category,
    comparatorKey: item.comparatorKey,
    colorFamily: item.colorFamily,
    formality: item.formality,
    id: item.id,
    name: item.name,
    photoCount: item.photos.length,
    primaryPhotoDelivery: primaryPhoto?.delivery ?? null,
    profileTags: item.profile?.raw.tags ?? [],
    size: item.size,
    status: item.status,
    subcategory: item.subcategory,
  };
}

export function summarizeStyleContext(context: StyleContextRecord) {
  return {
    categoryBreakdown: context.categoryBreakdown,
    colorBreakdown: context.colorBreakdown,
    deliverablePhotoCoverage: context.deliverablePhotoCoverage,
    descriptorCoverage: context.descriptorCoverage,
    evidenceGapCount: context.evidenceGapCount,
    itemCount: context.itemCount,
    onboardingMode: context.onboardingMode,
    photoCount: context.photoCount,
    profile: summarizeStyleProfile(context.profile),
    profileCount: context.profileCount,
    purchaseEvalReady: context.purchaseEvalReady,
    representativeItems: context.representativeItems,
    seededClosetPresent: context.seededClosetPresent,
    stylistDescriptorCoverage: context.stylistDescriptorCoverage,
    typedProfileCoverage: context.typedProfileCoverage,
    usableProfileCoverage: context.usableProfileCoverage,
  };
}

export function summarizeStylePurchaseAnalysis(analysis: StylePurchaseAnalysis) {
  return {
    alignmentSignalCount: analysis.alignmentSignals.matchedSignals.length,
    candidateCategory: analysis.candidateSummary.category,
    candidateComparatorKey: analysis.candidateSummary.comparatorKey,
    candidateDescriptorSummary: analysis.candidateDescriptorSummary,
    candidateName: analysis.candidateSummary.name,
    comparatorCoverageMode: analysis.comparatorCoverage.mode,
    confidenceNotes: analysis.confidenceNotes,
    coverageImpact: analysis.coverageImpact,
    descriptorDeltas: analysis.descriptorDeltas,
    exactComparatorItemCount: analysis.contextBuckets.exactComparatorItems.length,
    laneAssessment: analysis.laneAssessment,
    nearbyFormalityItemCount: analysis.contextBuckets.nearbyFormalityItems.length,
    pairingCandidateCount: analysis.contextBuckets.pairingCandidates.length,
    evidenceWarnings: analysis.evidenceQuality.notes,
    hardAvoid: analysis.tensionSignals.hardAvoid,
    sameCategoryItemCount: analysis.contextBuckets.sameCategoryItems.length,
    sameColorFamilyItemCount: analysis.contextBuckets.sameColorFamilyItems.length,
    sportUtilityException: analysis.tensionSignals.sportUtilityException,
    tensionCount: analysis.tensionSignals.notes.length,
    typedRoleCount: analysis.comparatorCoverage.typedRoleCount,
    typedRoleItemCount: analysis.contextBuckets.typedRoleItems.length,
  };
}

export function presentStylePurchaseAnalysis(analysis: StylePurchaseAnalysis) {
  return {
    alignmentSignals: analysis.alignmentSignals,
    candidate: analysis.candidate,
    candidateDescriptorSummary: analysis.candidateDescriptorSummary,
    candidateSummary: analysis.candidateSummary,
    comparatorCoverage: analysis.comparatorCoverage,
    comparatorDescriptorSummaries: analysis.comparatorDescriptorSummaries,
    confidenceNotes: analysis.confidenceNotes,
    contextBuckets: analysis.contextBuckets,
    coverageImpact: analysis.coverageImpact,
    descriptorDeltas: analysis.descriptorDeltas,
    evidenceQuality: analysis.evidenceQuality,
    laneAssessment: analysis.laneAssessment,
    referencedItemCount: Object.keys(analysis.itemsById).length,
    tensionSignals: analysis.tensionSignals,
  };
}

export function summarizeStyleEvidenceGaps(gaps: StyleEvidenceGapListRecord) {
  return {
    appliedPriorityFilter: gaps.appliedPriorityFilter,
    countsByType: gaps.countsByType,
    deliverablePhotoCoverage: gaps.deliverablePhotoCoverage,
    descriptorCoverage: gaps.descriptorCoverage,
    itemCount: gaps.items.length,
    omittedItemCount: gaps.omittedItemCount,
    preview: gaps.items.slice(0, 8),
    stylistDescriptorCoverage: gaps.stylistDescriptorCoverage,
    typedProfileCoverage: gaps.typedProfileCoverage,
    usableProfileCoverage: gaps.usableProfileCoverage,
  };
}

export function summarizeStyleWardrobeAnalysis(analysis: StyleWardrobeAnalysis) {
  return {
    bridgePieceCount: analysis.bridgePieces.length,
    buyNextCount: analysis.buyNextCandidates.length,
    evidenceWarnings: analysis.evidenceWarnings,
    focus: analysis.focus,
    gapLaneCount: analysis.gapLanes.length,
    occasionCoverageCount: analysis.occasionCoverage.length,
    redundancyClusterCount: analysis.redundancyClusters.length,
    replacementCandidateCount: analysis.replacementCandidates.length,
    strengthCount: analysis.strengths.length,
    weakSpotCount: analysis.weakSpots.length,
  };
}

export function summarizeStyleDescriptorBacklog(backlog: StyleDescriptorBacklogRecord) {
  return {
    appliedFocus: backlog.appliedFocus,
    blockedItemCount: backlog.blockedItemCount,
    descriptorCoverage: backlog.descriptorCoverage,
    itemCount: backlog.itemCount,
    preview: backlog.entries.slice(0, 8),
    stylistDescriptorCoverage: backlog.stylistDescriptorCoverage,
    typedProfileCoverage: backlog.typedProfileCoverage,
    usableProfileCoverage: backlog.usableProfileCoverage,
  };
}

export function presentStyleEvidenceGaps(gaps: StyleEvidenceGapListRecord) {
  return {
    appliedPriorityFilter: gaps.appliedPriorityFilter,
    countsByType: gaps.countsByType,
    deliverablePhotoCoverage: gaps.deliverablePhotoCoverage,
    descriptorCoverage: gaps.descriptorCoverage,
    items: gaps.items,
    omittedItemCount: gaps.omittedItemCount,
    stylistDescriptorCoverage: gaps.stylistDescriptorCoverage,
    typedProfileCoverage: gaps.typedProfileCoverage,
    usableProfileCoverage: gaps.usableProfileCoverage,
  };
}

export function presentStyleDescriptorBacklog(backlog: StyleDescriptorBacklogRecord) {
  return {
    appliedFocus: backlog.appliedFocus,
    blockedItemCount: backlog.blockedItemCount,
    descriptorCoverage: backlog.descriptorCoverage,
    entries: backlog.entries,
    itemCount: backlog.itemCount,
    stylistDescriptorCoverage: backlog.stylistDescriptorCoverage,
    typedProfileCoverage: backlog.typedProfileCoverage,
    usableProfileCoverage: backlog.usableProfileCoverage,
  };
}

export function presentStyleWardrobeAnalysis(analysis: StyleWardrobeAnalysis) {
  return {
    bridgePieces: analysis.bridgePieces,
    buyNextCandidates: analysis.buyNextCandidates,
    evidenceWarnings: analysis.evidenceWarnings,
    focus: analysis.focus,
    gapLanes: analysis.gapLanes,
    occasionCoverage: analysis.occasionCoverage,
    redundancyClusters: analysis.redundancyClusters,
    referencedItemCount: new Set([
      ...analysis.bridgePieces.flatMap((entry) => entry.itemIds),
      ...analysis.buyNextCandidates.flatMap((entry) => entry.itemIds),
      ...analysis.gapLanes.flatMap((entry) => entry.itemIds),
      ...analysis.occasionCoverage.flatMap((entry) => entry.itemIds),
      ...analysis.redundancyClusters.flatMap((entry) => entry.itemIds),
      ...analysis.replacementCandidates.map((entry) => entry.itemId),
      ...analysis.strengths.flatMap((entry) => entry.itemIds),
      ...analysis.weakSpots.flatMap((entry) => entry.itemIds),
    ]).size,
    replacementCandidates: analysis.replacementCandidates,
    strengths: analysis.strengths,
    weakSpots: analysis.weakSpots,
  };
}
