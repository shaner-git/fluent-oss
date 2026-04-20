import type { MutationProvenance } from '../../auth';
import path from 'node:path';
import type { FluentBlobStore, FluentDatabase } from '../../storage';
import { StyleRepository } from './repository';
import {
  asBoolean,
  asNullableNumber,
  asNullableString,
  asRecord,
  deriveBaselineStyleItemProfile,
  inferStyleComparatorKey,
  inferStyleOnboardingMode,
  inferStylePhotoKind,
  inferStylePhotoSource,
  isStylePurchaseEvalReady,
  mergeStyleProfile,
  normalizePhotoInput,
  normalizeStyleItemStatus,
  normalizeStyleItemInput,
  normalizeStyleItemProfile,
  normalizeStyleProfile,
  normalizeStyleProfilePatch,
  normalizeStyleComparatorKey,
  normalizeStylePhotoView,
  normalizeStylePurchaseCandidate,
  parseJsonLike,
  safeParseJson,
  stringifyJson,
} from './helpers';
import { buildSignedStyleImageUrl, buildStyleAssetKey, buildStyleImageUrl, parseOwnedStyleAsset } from './media';
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
  StyleItemSummaryRecord,
  StyleItemRecord,
  StyleOccasionCoverageRecord,
  StylePhotoRecord,
  StyleProfileRecord,
  StylePurchaseAnalysis,
  StylePurchaseCandidate,
  StylePurchaseAnalysisItemMatch,
  StyleComparatorCoverage,
  StylePhotoDeliveryRecord,
  StyleReplacementCandidateRecord,
  StyleWardrobeAnalysis,
  StyleWardrobeAnalysisFocus,
  StyleWardrobeFindingPriority,
  StyleWardrobeFindingRecord,
  StyleRedundancyClusterRecord,
  StyleVisualBundleAssetRecord,
  StyleVisualBundleDeliveryMode,
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

export class StyleService {
  private readonly repository: StyleRepository;

  constructor(
    private readonly db: FluentDatabase,
    private readonly options: {
      artifacts?: FluentBlobStore;
      imageDeliverySecret?: string | null;
      origin?: string | null;
    } = {},
  ) {
    this.repository = new StyleRepository(db);
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
    const patch = normalizeStyleProfilePatch(input.profile);
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
    const categoryMap = new Map<string, number>();
    const colorMap = new Map<string, number>();
    let photoCount = 0;
    let profileCount = 0;
    let primaryPhotoCount = 0;
    let deliverablePhotoCount = 0;
    let usableProfileCount = 0;
    let stylistDescriptorCount = 0;

    for (const item of items) {
      if (item.category) {
        categoryMap.set(item.category, (categoryMap.get(item.category) ?? 0) + 1);
      }
      if (item.colorFamily) {
        colorMap.set(item.colorFamily, (colorMap.get(item.colorFamily) ?? 0) + 1);
      }
      photoCount += item.photos.length;
      profileCount += item.profile ? 1 : 0;
      primaryPhotoCount += item.photos.some((photo) => photo.isPrimary) ? 1 : 0;
      deliverablePhotoCount += item.photos.some((photo) => photo.delivery) ? 1 : 0;
      usableProfileCount += hasUsableStyleProfileEvidence(item.profile?.raw ?? null) ? 1 : 0;
      stylistDescriptorCount += hasStyleDescriptors(item.profile?.raw ?? null) ? 1 : 0;
    }

    const typedProfileCoverage = items.length > 0 ? Number((profileCount / items.length).toFixed(2)) : 0;
    const deliverablePhotoCoverage = items.length > 0 ? Number((deliverablePhotoCount / items.length).toFixed(2)) : 0;
    const usableProfileCoverage = items.length > 0 ? Number((usableProfileCount / items.length).toFixed(2)) : 0;
    const stylistDescriptorCoverage = items.length > 0 ? Number((stylistDescriptorCount / items.length).toFixed(2)) : 0;
    const evidenceGapCount = (await this.listEvidenceGaps({ priorityFilter: 'actionable' })).items.length;

    return {
      categoryBreakdown: [...categoryMap.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category)),
      deliverablePhotoCoverage,
      descriptorCoverage: stylistDescriptorCoverage,
      evidenceGapCount,
      colorBreakdown: [...colorMap.entries()]
        .map(([colorFamily, count]) => ({ colorFamily, count }))
        .sort((left, right) => right.count - left.count || left.colorFamily.localeCompare(right.colorFamily)),
      itemCount: items.length,
      onboardingMode: inferStyleOnboardingMode(items.length),
      photoCount,
      profile,
      profileCount,
      purchaseEvalReady: isStylePurchaseEvalReady(profile.raw, {
        itemCount: items.length,
        primaryPhotoCount,
      }),
      representativeItems: pickRepresentativeItems(items),
      seededClosetPresent: items.length > 0,
      stylistDescriptorCoverage,
      typedProfileCoverage,
      usableProfileCoverage,
    };
  }

  async listItems(): Promise<StyleItemRecord[]> {
    const [itemRows, photoRows, profileRows] = await Promise.all([
      this.repository.listItemRows(),
      this.repository.listPhotoRows(),
      this.repository.listItemProfileRows(),
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

    return itemRows.map((row) => ({
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

  async getItem(itemId: string): Promise<StyleItemRecord | null> {
    const row = await this.repository.getItemRow(itemId);
    if (!row) {
      return null;
    }

    const [photos, profile] = await Promise.all([
      this.repository.listPhotoRows(itemId),
      this.repository.getItemProfileRow(itemId),
    ]);

    return {
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
    };
  }

  async upsertItem(input: {
    item: unknown;
    provenance: MutationProvenance;
    sourceSnapshot?: unknown;
  }): Promise<StyleItemRecord> {
    const payload = normalizeStyleItemInput(input.item);
    const itemId = asNullableString(payload.id) ?? `style-item:${crypto.randomUUID()}`;
    const before = await this.getItem(itemId);
    const beforeProvenance = await this.getItemProvenance(itemId);
    const hasField = (primaryKey: string, aliasKey?: string) => primaryKey in payload || (aliasKey ? aliasKey in payload : false);
    const mergedString = (primaryKey: string, aliasKey: string | undefined, fallback: string | null) =>
      hasField(primaryKey, aliasKey) ? asNullableString(payload[primaryKey] ?? (aliasKey ? payload[aliasKey] : undefined)) : fallback;
    const mergedNumber = (primaryKey: string, aliasKey: string | undefined, fallback: number | null) =>
      hasField(primaryKey, aliasKey)
        ? asNullableNumber(payload[primaryKey] ?? (aliasKey ? payload[aliasKey] : undefined))
        : fallback;
    const comparatorKey = inferStyleComparatorKey({
      category: mergedString('category', undefined, before?.category ?? null),
      comparatorKey: payload.comparator_key ?? payload.comparatorKey,
      name: mergedString('name', undefined, before?.name ?? null),
      profile: before?.profile?.raw ?? null,
      subcategory: mergedString('subcategory', undefined, before?.subcategory ?? null),
      tags: before?.profile?.raw.tags ?? [],
    });

    await this.repository.upsertItem({
      brand: mergedString('brand', undefined, before?.brand ?? null),
      category: mergedString('category', undefined, before?.category ?? null),
      comparatorKey: comparatorKey === 'unknown' ? before?.comparatorKey ?? 'unknown' : comparatorKey,
      colorFamily: mergedString('color_family', 'colorFamily', before?.colorFamily ?? null),
      colorHex: mergedString('color_hex', 'colorHex', before?.colorHex ?? null),
      colorName: mergedString('color_name', 'colorName', before?.colorName ?? null),
      formality: mergedNumber('formality', undefined, before?.formality ?? null),
      id: itemId,
      legacyItemId: mergedNumber('legacy_item_id', 'legacyItemId', before?.legacyItemId ?? null),
      name: mergedString('name', undefined, before?.name ?? null),
      size: mergedString('size', undefined, before?.size ?? null),
      status: normalizeStyleItemStatus(payload.status, before?.status ?? 'active'),
        subcategory: mergedString('subcategory', undefined, before?.subcategory ?? null),
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
    const nextSourceSnapshot = hasSourceSnapshotInput ? input.sourceSnapshot : beforeProvenance?.sourceSnapshot;
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
            category: mergedString('category', undefined, before?.category ?? null),
            comparatorKey: comparatorKey === 'unknown' ? before?.comparatorKey ?? 'unknown' : comparatorKey,
            formality: mergedNumber('formality', undefined, before?.formality ?? null),
            name: mergedString('name', undefined, before?.name ?? null),
            subcategory: mergedString('subcategory', undefined, before?.subcategory ?? null),
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

  async upsertItemPhotos(input: {
    itemId: string;
    photos: unknown;
    provenance: MutationProvenance;
  }): Promise<StylePhotoRecord[]> {
    const before = await this.getItem(input.itemId);
    if (!before) {
      throw new Error(`Unknown style item: ${input.itemId}`);
    }

    const photos = await Promise.all(
      normalizePhotoInput(input.photos).map(async (photo, index) => {
        const photoId = asNullableString(photo.id) ?? `style-photo:${input.itemId}:${index + 1}`;
        const sourceUrl = asNullableString(photo.source_url ?? photo.sourceUrl ?? photo.url);
        const ownedAsset = await this.ingestPhotoAsset({
          dataBase64: asNullableString(photo.data_base64 ?? photo.dataBase64 ?? photo.base64),
          dataUrl: asNullableString(photo.data_url ?? photo.dataUrl),
          itemId: input.itemId,
          mimeType: asNullableString(photo.mime_type ?? photo.mimeType),
          photoId,
          sourceUrl,
        });
        if (!ownedAsset && isHostedLocalUploadReference(sourceUrl)) {
          throw new Error(
            'Hosted Style photo writes cannot ingest local upload paths directly. Provide image bytes via data_url/data_base64 or a fetchable remote image URL.',
          );
        }

        return {
          artifactId: ownedAsset?.artifactId ?? null,
          bgRemoved: asBoolean(photo.bg_removed ?? photo.bgRemoved),
          capturedAt: asNullableString(photo.captured_at ?? photo.capturedAt),
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
          url: sourceUrl ?? `artifact:${photoId}`,
          view: normalizeStylePhotoView(photo.view),
        };
      }),
    );

    await this.repository.replaceItemPhotos(input.itemId, photos);
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
    itemId: string;
    legacyProfileId?: number | null;
    method?: string | null;
    profile: unknown;
    provenance: MutationProvenance;
    source?: string | null;
  }): Promise<StyleItemProfileRecord> {
    const item = await this.getItem(input.itemId);
    if (!item) {
      throw new Error(`Unknown style item: ${input.itemId}`);
    }
    const before = await this.getItemProfile(input.itemId);
    const raw = normalizeStyleItemProfile(input.profile);

    await this.repository.upsertItemProfile({
      itemId: input.itemId,
      legacyProfileId: input.legacyProfileId ?? null,
      method: input.method ?? null,
      rawJson: JSON.stringify(raw),
      source: input.source ?? null,
    });

    const inferredComparatorKey = inferStyleComparatorKey({
      category: item.category,
      profile: raw,
      subcategory: item.subcategory,
      tags: raw.tags,
    });
    if (inferredComparatorKey !== item.comparatorKey) {
      await this.repository.updateItemComparatorKey(input.itemId, inferredComparatorKey);
    }

    const after = await this.getItemProfile(input.itemId);
    if (!after) {
      throw new Error(`Style item profile ${input.itemId} could not be read back after upsert.`);
    }

    await this.recordDomainEvent({
      after,
      before,
      entityId: input.itemId,
      entityType: 'style_item_profile',
      eventType: before ? 'style.item_profile_updated' : 'style.item_profile_created',
      provenance: input.provenance,
    });
    return after;
  }

  async listEvidenceGaps(input: {
    priorityFilter?: StyleEvidenceGapPriorityFilter | null;
  } = {}): Promise<StyleEvidenceGapListRecord> {
    const priorityFilter = input.priorityFilter ?? 'all';
    const items = await this.listItems();
    const itemsWithGaps: StyleEvidenceGapRecord[] = [];
    const countsByType: Record<StyleEvidenceGapType, number> = {
      missing_primary_photo_delivery: 0,
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
    const activeItems = items.filter((item) => item.status === 'active');
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

  async analyzePurchase(input: { candidate: unknown; provenance?: MutationProvenance }): Promise<StylePurchaseAnalysis> {
    const candidate = normalizeStylePurchaseCandidate(input.candidate);
    const [profile, items] = await Promise.all([this.getProfile(), this.listItems()]);
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
    const candidateComparatorKey =
      candidate.comparatorKey ??
      inferStyleComparatorKey({
        category: candidate.category,
        subcategory: candidate.subcategory,
      });
    const sameCategory = items.filter((item) => item.category?.toLowerCase() === candidateCategory);
    const exactComparatorItems = [...sameCategory]
      .map((item) => {
        if (candidateComparatorKey && candidateComparatorKey !== 'unknown' && item.comparatorKey === candidateComparatorKey) {
          const reasons = [`exact comparator lane (${candidateComparatorKey})`];
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
      .sort(
        (left, right) =>
          Number(right.item.status === 'active') - Number(left.item.status === 'active') ||
          left.item.name?.localeCompare(right.item.name ?? '') ||
          0,
      )
      .slice(0, 4)
      .map(({ item, reasons }) => {
        registerAnalysisItem(item);
        return {
          itemId: item.id,
          reasons,
        };
      });

    const typedRoleItems = [...sameCategory]
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
      .sort(
        (left, right) =>
          Number(right.item.status === 'active') - Number(left.item.status === 'active') ||
          left.item.name?.localeCompare(right.item.name ?? '') ||
          0,
      )
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
    const sameCategoryItems = [...sameCategory]
      .filter((item) => !excludedSameCategoryIds.has(item.id))
      .map((item) => {
        const reasons: string[] = [`same category lane (${candidate.category})`];
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
      .sort((left, right) => right.score - left.score || left.sortName?.localeCompare(right.sortName ?? '') || 0)
      .slice(0, 4)
      .map(({ item, reasons }) => {
        registerAnalysisItem(item);
        return {
          itemId: item.id,
          reasons,
        };
      });

    const sameColorFamilyItems = items
      .filter((item) => item.colorFamily && candidate.colorFamily && item.colorFamily.toLowerCase() === candidate.colorFamily.toLowerCase())
      .map((item) => {
        const reasons = [`same color family (${candidate.colorFamily})`];
        if (item.category?.toLowerCase() === candidateCategory) {
          reasons.push(`same category lane (${candidate.category})`);
        }
        return {
          item,
          reasons,
        };
      })
      .slice(0, 4)
      .map(({ item, reasons }) => {
        registerAnalysisItem(item);
        return {
          itemId: item.id,
          reasons,
        };
      });

    const nearbyFormalityItems = items
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
    const pairingCandidates: StylePurchaseAnalysisItemMatch[] = items
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
          reasons.push(`paired lane (${item.category})`);
          score += preferredPairCategories.length - preferredIndex + 3;
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
          reasons: reasons.length > 0 ? reasons : ['different lane with plausible pairing relationship'],
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
      tensionNotes.push('reads as sport or utility gear rather than a core wardrobe lane piece');
    }
    const typedProfileCoverage = items.length > 0 ? Number((items.filter((item) => item.profile !== null).length / items.length).toFixed(2)) : 0;
    const primaryPhotoCoverage =
      items.length > 0
        ? Number((items.filter((item) => item.photos.some((photo) => photo.isPrimary)).length / items.length).toFixed(2))
        : 0;
    const evidenceNotes: string[] = [];
    if (candidate.imageUrls.length === 0) {
      evidenceNotes.push('no candidate image provided; analysis relies on text attributes and closet state');
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
    const confidenceNotes = buildPurchaseConfidenceNotes({
      candidateHasImage: candidate.imageUrls.length > 0,
      comparatorCoverageMode: comparatorCoverage.mode,
      descriptorDeltas,
      exactComparatorCount: exactComparatorItems.length,
      itemsById,
    });

    const analysis: StylePurchaseAnalysis = {
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
      },
      comparatorCoverage,
      comparatorDescriptorSummaries,
      confidenceNotes,
      contextBuckets: {
        exactComparatorItems,
        nearbyFormalityItems,
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
        candidateImageCount: candidate.imageUrls.length,
        notes: evidenceNotes,
        primaryPhotoCoverage,
        typedProfileCoverage,
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
  }): Promise<StyleVisualBundleRecord> {
    const deliveryMode = input.deliveryMode === 'authenticated_only' ? 'authenticated_only' : 'authenticated_with_signed_fallback';
    const includeComparators = input.includeComparators !== false;
    const maxImages = clampVisualBundleMaxImages(input.maxImages);
    const requestedItemIds = Array.from(new Set((input.itemIds ?? []).map((itemId) => itemId.trim()).filter(Boolean)));
    const [items, analysis] = await Promise.all([
      this.listItems(),
      input.candidate ? this.analyzePurchase({ candidate: input.candidate }) : Promise.resolve(null),
    ]);
    const itemMap = new Map(items.map((item) => [item.id, item]));
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
      const bundlePhoto = selectBestVisualBundlePhoto(item.photos);
      if (!bundlePhoto) {
        evidenceWarnings.push(`${item.name ?? item.id} has no saved Style photo.`);
        return;
      }
      if (seenPhotoIds.has(bundlePhoto.id)) {
        return;
      }

      seenPhotoIds.add(bundlePhoto.id);
      if (!bundlePhoto.delivery) {
        evidenceWarnings.push(`${item.name ?? item.id} does not have an owned Fluent image delivery route yet.`);
      }
      const fallbackSigned = deliveryMode === 'authenticated_with_signed_fallback'
        ? await this.buildFallbackSignedPhotoDelivery(bundlePhoto.id, bundlePhoto.artifactId)
        : null;
      assets.push({
        authenticatedOriginalUrl: bundlePhoto.delivery?.originalUrl ?? null,
        fallbackExpiresAt: fallbackSigned?.expiresAt ?? null,
        fallbackSignedOriginalUrl: fallbackSigned?.originalUrl ?? null,
        itemId: item.id,
        label: item.name ?? item.id,
        photoId: bundlePhoto.id,
        role,
        sourceUrl: bundlePhoto.sourceUrl ?? bundlePhoto.url ?? null,
      });
    };

    if (analysis) {
      const candidateImageUrl = analysis.candidate.imageUrls[0] ?? null;
      if (candidateImageUrl) {
        assets.push({
          authenticatedOriginalUrl: null,
          fallbackExpiresAt: null,
          fallbackSignedOriginalUrl: null,
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
      await pushItemPrimaryPhoto(itemId, 'requested_item');
    }

    if (includeComparators && analysis) {
      const comparatorRoles: Array<{
        items: StylePurchaseAnalysisItemMatch[];
        role: Exclude<StyleVisualBundleAssetRecord['role'], 'candidate' | 'requested_item'>;
      }> = [
        { items: analysis.contextBuckets.exactComparatorItems, role: 'exact_comparator' },
        { items: analysis.contextBuckets.typedRoleItems, role: 'typed_role' },
        { items: analysis.contextBuckets.sameCategoryItems, role: 'same_category' },
        { items: analysis.contextBuckets.nearbyFormalityItems, role: 'nearby_formality' },
      ];

      for (const bucket of comparatorRoles) {
        for (const entry of bucket.items) {
          if (assets.length >= maxImages) {
            break;
          }
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

    return {
      assets,
      comparatorCoverageMode: analysis?.comparatorCoverage.mode ?? null,
      deliveryMode,
      evidenceWarnings: Array.from(new Set(evidenceWarnings)),
      requestedItemIds,
    };
  }

  async getItemProvenance(itemId: string) {
    const row = await this.repository.getProvenanceRow(itemId);
    return row
      ? {
          fieldEvidence: safeParseJson(row.field_evidence_json),
          sourceSnapshot: safeParseJson(row.source_snapshot_json),
          technicalMetadata: safeParseJson(row.technical_metadata_json),
          updatedAt: row.updated_at,
        }
      : null;
  }

  async getPhotoDeliveryAsset(photoId: string): Promise<{
    artifactId: string;
    mimeType: string;
    r2Key: string;
  } | null> {
    const row = await this.repository.getPhotoDeliveryRow(photoId);
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
          id, domain, entity_type, entity_id, event_type,
          before_json, after_json, patch_json,
          source_agent, source_skill, session_id, confidence, source_type, actor_email, actor_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        `domain-event:${crypto.randomUUID()}`,
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

  private async buildPhotoDelivery(photoId: string, artifactId: string | null): Promise<StylePhotoDeliveryRecord | null> {
    if (!artifactId || !this.options.origin) {
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
    });
  }

  private async ingestPhotoAsset(input: {
    dataBase64: string | null;
    dataUrl: string | null;
    filePath?: string | null;
    itemId: string;
    mimeType: string | null;
    photoId: string;
    sourceUrl: string | null;
  }): Promise<{ artifactId: string; mimeType: string } | null> {
    if (!this.options.artifacts) {
      return null;
    }

    const ownedAsset = await parseOwnedStyleAsset({
      dataBase64: input.dataBase64,
      dataUrl: input.dataUrl,
      filePath: input.filePath ?? null,
      mimeTypeHint: input.mimeType,
      sourceUrl: input.sourceUrl,
    });
    if (!ownedAsset) {
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

    return {
      artifactId: ownedAsset.artifactId,
      mimeType: ownedAsset.mimeType,
    };
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
    const sourceUrl = row.source_url ?? row.url ?? null;
    const delivery = await this.buildPhotoDelivery(row.id, row.artifact_id ?? null);
    return {
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
      url: sourceUrl ?? row.url,
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
          ? `No exact ${input.candidateComparatorKey} comparators found; falling back to typed role context.`
          : 'No exact comparator lane found; falling back to typed role context.',
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
          ? `No exact ${input.candidateComparatorKey} comparators found; falling back to ${input.candidateCategory.toLowerCase()} category context.`
          : `No exact comparator lane found; falling back to ${input.candidateCategory.toLowerCase()} category context.`,
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
  return Math.min(12, Math.max(1, Math.trunc(value)));
}

function selectBestVisualBundlePhoto(photos: StylePhotoRecord[]): StylePhotoRecord | null {
  if (photos.length === 0) {
    return null;
  }

  const sorted = [...photos].sort((left, right) => {
    const leftScore = scoreVisualBundlePhoto(left);
    const rightScore = scoreVisualBundlePhoto(right);
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

function scoreVisualBundlePhoto(photo: StylePhotoRecord): number {
  const hasArtifact = Boolean(photo.artifactId || photo.delivery);
  const isFit = photo.isFit || photo.kind === 'fit' || photo.view?.startsWith('fit_') === true;
  const isProduct = photo.kind === 'product' || photo.view === 'front' || photo.view === 'back' || photo.view === 'side';

  let score = 0;
  if (isFit) {
    score = hasArtifact ? 10 : 6;
  } else if (isProduct) {
    score = hasArtifact ? 8 : 3;
  } else {
    score = hasArtifact ? 7 : 2;
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
    notes.push(`candidate sits inside the existing ${buildLaneLabel(input.candidateComparatorKey)} lane`);
  } else if (input.typedRoleCount > 0 || input.sameCategoryCount > 0) {
    existingLane = input.candidateCategory.toLowerCase();
    notes.push(`candidate extends the existing ${input.candidateCategory.toLowerCase()} lane without a direct exact comparator`);
  } else {
    introduces = input.candidateComparatorKey ?? input.candidateCategory.toLowerCase();
    notes.push(`candidate introduces a relatively new ${input.candidateCategory.toLowerCase()} lane`);
  }
  if (input.pairingCount >= 2 && input.nearbyFormalityCount >= 1) {
    bridges.push('multiple existing pairing lanes');
    notes.push('candidate can bridge into multiple existing pairing lanes');
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
    notes.push('candidate strengthens a weak or missing lane in the current wardrobe');
    strengthensWeakArea = true;
  }
  if (!input.gapLane && (input.exactComparatorCount >= 2 || input.sameCategoryCount >= 4)) {
    notes.push('candidate enters a lane that is already fairly covered');
    pilesIntoCoveredLane = true;
  }
  if (input.bridgeCandidateCount >= 2) {
    notes.push('candidate has strong bridge potential across existing outfit lanes');
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
    notes.push('descriptor comparisons rely on adjacent closet lanes rather than exact twins');
  }
  if (Object.keys(input.itemsById).length === 0) {
    notes.push('closet context is sparse for this candidate');
  }
  if (input.descriptorDeltas.length === 0) {
    notes.push('descriptor deltas are limited, so final stylist judgment should lean on direct image reading');
  }
  return notes;
}
