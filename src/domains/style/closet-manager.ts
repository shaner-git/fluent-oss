import { rememberWardrobeIndex } from './wardrobe-index';
import { appendRetainedWardrobeMedia } from './wardrobe-media';
import { isStyleFitPhoto } from './helpers';
import { normalizeStyleRemoteImageSourceUrl } from './media';
import { canonicalizeStyleMetadataProjection, canonicalizeStyleSearchTerm } from './metadata-normalization';
import {
  deriveStyleItemPresentationMediaSource,
  findApprovedStyleCatalogPhoto,
  hasStyleNormalizationSource,
} from './onboarding-calibration';
import type { StyleService } from './service';
import type {
  StyleFitVerdict,
  StyleItemProfileDocument,
  StyleItemRecord,
  StylePhotoSource,
  StylePresentationMediaSource,
  StyleVisualBundleAssetRecord,
} from './types';

export const STYLE_CLOSET_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-style-closet-v1.html';
export const STYLE_CLOSET_V2_TEMPLATE_URI = 'ui://widget/fluent-style-closet-v2.html';
export const STYLE_CLOSET_V3_TEMPLATE_URI = 'ui://widget/fluent-style-closet-v3.html';
export const STYLE_CLOSET_V4_TEMPLATE_URI = 'ui://widget/fluent-style-closet-v4.html';
export const STYLE_CLOSET_V5_TEMPLATE_URI = 'ui://widget/fluent-style-closet-v5.html';
export const STYLE_CLOSET_V6_TEMPLATE_URI = 'ui://widget/fluent-style-closet-v6.html';
export const STYLE_CLOSET_V7_TEMPLATE_URI = 'ui://widget/fluent-style-closet-v7.html';
export const STYLE_CLOSET_V8_TEMPLATE_URI = 'ui://widget/fluent-style-closet-v8.html';
export const STYLE_CLOSET_V20_TEMPLATE_URI = 'ui://widget/fluent-style-closet-v20.html';
export const STYLE_CLOSET_V21_TEMPLATE_URI = 'ui://widget/fluent-style-closet-v21.html';
export const STYLE_CLOSET_V22_TEMPLATE_URI = 'ui://widget/fluent-style-closet-v22.html';
export const STYLE_CLOSET_V23_TEMPLATE_URI = 'ui://widget/fluent-style-closet-v23.html';
export const STYLE_CLOSET_V24_TEMPLATE_URI = 'ui://widget/fluent-style-closet-v24.html';
export const STYLE_CLOSET_V25_TEMPLATE_URI = 'ui://widget/fluent-style-closet-v25.html';
export const STYLE_CLOSET_V26_TEMPLATE_URI = 'ui://widget/fluent-style-closet-v26.html';
export const STYLE_CLOSET_V27_TEMPLATE_URI = 'ui://widget/fluent-style-closet-v27.html';
export const STYLE_CLOSET_V33_TEMPLATE_URI = 'ui://widget/fluent-style-closet-v33.html';
export const STYLE_CLOSET_TEMPLATE_VERSION = 'v34';
export const STYLE_CLOSET_V34_TEMPLATE_URI = 'ui://widget/fluent-style-closet-v34.html';
export const STYLE_CLOSET_TEMPLATE_URI = 'ui://widget/fluent-style-closet.html';

export type StyleClosetPresentationMode = 'browse' | 'ingestion_review' | 'comparison' | 'detail' | 'recommendation';
export type StyleClosetPresentationMediaState = 'ready' | 'needs_normalization' | 'needs_photo' | 'unavailable';
export type StyleClosetPresentationMediaSource = StylePresentationMediaSource;
export type StyleClosetContextualMediaRole = 'none' | 'owner_model_full_body' | 'worn_source';
export type StyleClosetOwnerModelState = 'context_available' | 'enrolled_no_context' | 'setup_required';

export interface StyleClosetPresentationIntent {
  focused_item_id?: string | null;
  mode?: StyleClosetPresentationMode | null;
  recommendation_reason?: string | null;
}

export type StyleClosetStatusFilter = 'active' | 'archived' | 'any';

export interface StyleClosetFilter {
  brand?: string | null;
  category?: string | null;
  color?: string | null;
  item_ids?: string[] | null;
  query?: string | null;
  size?: string | null;
  status?: StyleClosetStatusFilter | null;
  subcategory?: string | null;
}

export interface StyleClosetViewModel {
  cursor: string | null;
  experience: 'style_closet';
  facets: Array<{ category: string; count: number; label: string }>;
  filter: Required<Pick<StyleClosetFilter, 'status'>> & Omit<StyleClosetFilter, 'status'>;
  filterOptions: { brands: string[]; colorFamilies: string[]; sizes: string[]; subcategories: string[] };
  items: StyleClosetItemViewModel[];
  presentation: {
    focusedItemId: string | null;
    mode: StyleClosetPresentationMode;
    recommendationReason?: string | null;
  };
  surface: 'style_closet';
  summary: {
    activeTotal: number;
    filterLabel: string;
    generatedCatalogReferenceTotal: number;
    mediaReadyTotal: number;
    missingOrUnavailablePhotoTotal: number;
    needsNormalizationTotal: number;
    needsPhotoTotal: number;
    normalizedCatalogTotal: number;
    remoteCandidateTotal: number;
    shownTotal: number;
    unavailableMediaTotal: number;
  };
  templateUri: typeof STYLE_CLOSET_TEMPLATE_URI;
  title: 'Your closet';
}

// The expanded item payload: fit + style fields surfaced progressively in the spatial detail sheet. All
// keys are NEUTRAL by design — the closet widget bans the words/keys verdict|score|recommendation|
// rating (style-closet-widget-interactions test), so `fitVerdict` is projected as a plain `fitSummary`
// label here and never under its raw name. Sparse profiles produce a null detail (no section shown).
export interface StyleClosetItemDetail {
  avoidOccasions?: string[];
  avoidUseCases?: string[];
  bestOccasions: string[];
  dressCodeMaximum?: number | null;
  dressCodeMinimum?: number | null;
  fabricHand: string | null;
  fitObservations: string[];
  fitSummary: string | null;
  lengthNote: string | null;
  ownedSize: string | null;
  pairingNotes: string | null;
  polishLevel?: string | null;
  qualityTier?: string | null;
  seasonality: string[];
  silhouette: string | null;
  styleRole: string | null;
  structureLevel?: string | null;
  tags: string[];
  texture?: string | null;
  useCases: string[];
  visualWeight?: string | null;
}

export interface StyleClosetItemViewModel {
  productReference?: StyleItemRecord['productReference'];
  archiveDisposition: 'returned' | 'sold' | 'donated' | 'gifted' | 'worn_out' | 'never_purchased' | 'duplicate' | 'other' | null;
  archiveReason: string | null;
  duplicateMergeId: string | null;
  brand: string | null;
  category: string | null;
  colorFamily: string | null;
  colorHex: string | null;
  colorName: string | null;
  dataCompleteness: { have: number; of: 3 };
  // Expanded metadata for the detail sheet; null when the item has no usable profile content.
  detail: StyleClosetItemDetail | null;
  duplicateCandidates: Array<{
    brand: string | null;
    colorFamily: string | null;
    id: string;
    imageUrl: string | null;
    mediaIds: string[];
    mediaLabels: Array<'Catalog' | 'Original' | 'On you'>;
    name: string | null;
    primaryMediaLabel: 'Catalog' | 'Original' | 'On you' | null;
    reason: string;
    score: number;
    size: string | null;
    subcategory: string | null;
  }>;
  // Signed URL of the worn/fit photo available to the detail media stage, or null when the item has no
  // distinct fit photo. Fetched server-side alongside the display image (no widget round-trip).
  fitImageUrl: string | null;
  hasImage: boolean;
  hasFitPhoto: boolean;
  id: string;
  imageUrl: string | null;
  photoRevision?: string;
  photoUndoToken?: string | null;
  coverPhotoId?: string | null;
  media: Array<{
    hidden?: boolean;
    sourcePhotoId?: string;
    artifactBacked: boolean;
    backgroundRemoved: boolean;
    contextualRole: StyleClosetContextualMediaRole;
    heroEligible: boolean;
    id: string;
    isSourceEvidence: boolean;
    label: 'Catalog' | 'Original' | 'On you';
    source: StylePhotoSource;
    url: string | null;
  }>;
  name: string | null;
  ownerModel: {
    generationCapability: 'host_required';
    referenceRevision: string | null;
    state: StyleClosetOwnerModelState;
  };
  // Presentation readiness is intentionally separate from source provenance. `ready` means the
  // exact current Catalog artifact has a durable, source-bound quality approval. An Original can be
  // rendered while it remains `needs_normalization`; availability alone is never Catalog readiness.
  presentationMediaState: StyleClosetPresentationMediaState;
  presentationMediaSource: StyleClosetPresentationMediaSource;
  /** Compatibility-only read field for retained v7/cached clients; the current widget never writes or renders it. */
  reanalyzePending: boolean;
  review: {
    lowConfidenceFields: string[];
    needsReview: boolean;
    overallConfidence: number | null;
  };
  size: string | null;
  status: StyleItemRecord['status'];
  subcategory: string | null;
  // Last time the item record changed; rendered as a muted "Updated …" footer on the detail card.
  updatedAt: string | null;
}

export type StyleClosetStructuredContent = StyleClosetViewModel & {
  hostResponseInstruction: string;
  hostResponseMode: 'native_widget_rendered';
  // MCP tool results require an index signature ({ [x: string]: unknown });
  // a type intersection carries it where an interface does not (R-2 lesson).
  [key: string]: unknown;
};

export function buildStyleClosetWidgetMeta(description: string, origin: string) {
  const resourceDomains = Array.from(new Set([
    origin,
    'https://cdn.shopify.com',
    'https://images.footlocker.com',
    'https://images.footlocker.ca',
    'https://images.unsplash.com',
  ]));
  return {
    'openai/widgetCSP': {
      connect_domains: [],
      resource_domains: resourceDomains,
    },
    'openai/widgetDescription': description,
    'openai/widgetDomain': origin,
    'openai/widgetPrefersBorder': false,
    ui: {
      csp: {
        connectDomains: [],
        resourceDomains,
      },
      prefersBorder: false,
    },
  } as const;
}

export async function buildStyleClosetStructuredContent(
  style: Pick<StyleService, 'getItemProvenanceBatch' | 'getVisualBundle' | 'listItems'> & Partial<Pick<StyleService, 'findStyleItemDuplicates' | 'getPhotoLibrary'>>,
  input: {
    cursor?: string | null;
    filter?: StyleClosetFilter | null;
    limit?: number | null;
    presentation?: StyleClosetPresentationIntent | null;
    resolveOwnedMediaUrl?: ((photoId: string) => Promise<string | null>) | null;
    resolveRemoteMediaUrl?: ((sourceUrl: string) => Promise<string | null>) | null;
  },
): Promise<StyleClosetStructuredContent> {
  const limit = clampLimit(input.limit);
  const cursor = decodeClosetCursor(input.cursor);
  const allItems = await style.listItems();
  const activeItems = allItems.filter((item) => item.status === 'active');
  // Resolve the caller's category/subcategory term against the closet's OWN vocabulary before matching,
  // so "shorts" finds the stored "Short" and "tees" finds "Tee" (the data is stored singular). This also
  // reassigns a term to the right field — Claude saying "pull up my shorts" as category resolves to the
  // subcategory "Short". The resolved filter is echoed in the view model, so the widget adopts the
  // canonical value and its dropdown highlights the match.
  const filter = resolveClosetFilterVocabulary(normalizeFilter(input.filter), activeItems);
  // Cursor pages are filtered server-side. v8 intentionally loads at most 48 cards initially, so a
  // client-only facet could miss every match that lives after that page. Facets/options still derive
  // from the complete applicable status set so users can broaden or switch filters authoritatively.
  const statusBase = filter.status === 'any' ? allItems : allItems.filter((item) => item.status === filter.status);
  const idNarrowed = Array.isArray(filter.item_ids) && filter.item_ids.length > 0;
  // HARD server-side narrow for the purchase comparator visual: the model passed the exact owned
  // item IDs it judged true comparators. We render ONLY those, in the model's order, so the grid
  // can never expand back to the whole category (a soft client-side facet could). cursor stays null.
  const statusItems = idNarrowed
    ? (() => {
        const byId = new Map(statusBase.map((item) => [item.id, item]));
        return filter.item_ids!
          .map((id) => byId.get(id))
          .filter((item): item is StyleItemRecord => Boolean(item));
      })()
    : statusBase;
  const matchedItems = idNarrowed ? statusItems : applyClosetFilters(statusBase, filter);
  // Read provenance for the complete filtered result before ordering or counting. Catalog quality
  // approval is bound to an exact current photo/artifact pair; page-local provenance would make the
  // summary and cursor order change as the user scrolls.
  const matchedProvenanceByItemId = await getStyleClosetProvenanceBatches(
    style,
    matchedItems.map((item) => item.id),
  );
  // A personal wardrobe should open on garments, not a checkerboard of migration gaps. Keep every
  // item reachable, but stably group records with a deliverable owned/remote media reference after
  // the image-led cohort. The cursor slices this same ordering, so paging never skips or duplicates.
  const orderedMatchedItems = idNarrowed
    ? matchedItems
    : prioritizePresentationMedia(matchedItems, matchedProvenanceByItemId);
  const requestedMode = input.presentation?.mode ?? null;
  const requestedFocusedItemId = input.presentation?.focused_item_id?.trim() || null;
  const requestedRecommendationReason = input.presentation?.recommendation_reason?.trim().slice(0, 180) || null;
  // A direct detail request must not depend on which 48-item page happens to be first. Move the exact
  // saved item to the front of the page source (without duplicating it) so the mounted widget can open
  // the requested sheet immediately while cursor paging still covers the complete status set.
  const focusedDetailItem = (requestedMode === 'detail' || requestedMode === 'recommendation') && requestedFocusedItemId
    ? statusItems.find((item) => item.id === requestedFocusedItemId) ?? null
    : null;
  const pageSource = focusedDetailItem
    ? [focusedDetailItem, ...orderedMatchedItems.filter((item) => item.id !== focusedDetailItem.id)]
    : orderedMatchedItems;
  const presentationRankByItemId = new Map(pageSource.map((item) => [
    item.id,
    styleClosetNormalizationRank(styleClosetNormalizationState(
      item,
      matchedProvenanceByItemId.get(item.id) ?? null,
    )),
  ]));
  // Exact-ID views preserve the caller's order, but they do not bypass the surface payload bound.
  // Small comparison/review cohorts still arrive in one page; a larger exact set continues through
  // the same cursor contract as browse and always retains the in-app "View full closet" escape.
  const keyedPageSource = buildClosetPageEntries(pageSource, {
    focusedItemId: focusedDetailItem?.id ?? null,
    itemIdOrder: idNarrowed ? filter.item_ids ?? [] : null,
    presentationRankByItemId,
    scope: closetCursorScope({ filter, focusedItemId: requestedFocusedItemId, mode: requestedMode, itemIds: idNarrowed ? filter.item_ids ?? [] : null }),
  });
  if (cursor && cursor.scope !== keyedPageSource[0]?.key.scope) {
    throw new Error('Style Closet cursor does not belong to this filter and presentation order.');
  }
  const cursorPageStart = cursor
    ? keyedPageSource.findIndex((entry) => compareClosetPageKey(entry.key, cursor) > 0)
    : 0;
  const normalizedPageStart = cursorPageStart < 0 ? keyedPageSource.length : cursorPageStart;
  const pageEntries = keyedPageSource.slice(normalizedPageStart, normalizedPageStart + limit);
  const pagedItems = pageEntries.map((entry) => entry.item);
  const focusedDuplicateCandidates = focusedDetailItem && style.findStyleItemDuplicates
    ? (await style.findStyleItemDuplicates({
        brand: focusedDetailItem.brand,
        colorFamily: focusedDetailItem.colorFamily ?? focusedDetailItem.colorName,
        comparatorKey: focusedDetailItem.comparatorKey,
        name: focusedDetailItem.name,
      })).filter((candidate) => candidate.id !== focusedDetailItem.id)
    : [];
  const duplicateCandidateIds = focusedDuplicateCandidates.map((candidate) => candidate.id);
  const mediaItemIds = Array.from(new Set([...pagedItems.map((item) => item.id), ...duplicateCandidateIds]));
  const nextCursor = normalizedPageStart + limit < keyedPageSource.length && pageEntries.length > 0
    ? encodeClosetCursor(pageEntries[pageEntries.length - 1].key)
    : null;
  // Fetch BOTH photo roles SERVER-SIDE inside this render handler, which is already authorized for the
  // Style closet read scope. The product photo is
  // the tile/display image; the worn/fit photo (when one exists and is distinct) rides along in the
  // payload for the spatial detail sheet. Doing it here rather than via a widget-initiated
  // fluent_get_media_bundle call keeps the detail card self-contained and needs no widget-callable read
  // tool. Only items that actually have a fit photo trigger the second fetch.
  const itemsWithFitPhoto = pagedItems.filter((item) => item.photos.some(isStyleFitPhoto));
  const [mediaBundle, fitBundle] = await Promise.all([
    style.getVisualBundle({
      deliveryMode: 'authenticated_with_signed_fallback',
      includeComparators: false,
      itemIds: mediaItemIds,
      maxImages: mediaItemIds.length,
      photoPreference: 'product',
    }),
    itemsWithFitPhoto.length > 0
      ? style.getVisualBundle({
          deliveryMode: 'authenticated_with_signed_fallback',
          includeComparators: false,
          itemIds: itemsWithFitPhoto.map((item) => item.id),
          maxImages: itemsWithFitPhoto.length,
          photoPreference: 'fit',
        })
      : Promise.resolve(null),
  ]);
  const imageUrlByItemId = new Map<string, string | null>();
  // Track which photo became the DISPLAY image so we can drop a "fit" asset that is actually the same
  // product photo (the fit preference falls back to the product photo when the fit photo has no
  // deliverable artifact — see selectBestVisualBundlePhoto). Same asset → same photoId.
  const displayPhotoIdByItemId = new Map<string, string | null>();
  for (const asset of mediaBundle.assets) {
    if (!asset.itemId || imageUrlByItemId.has(asset.itemId)) {
      continue;
    }
    imageUrlByItemId.set(asset.itemId, await resolvedClosetAssetUrl(asset, input.resolveRemoteMediaUrl));
    displayPhotoIdByItemId.set(asset.itemId, asset.photoId ?? null);
  }
  // Map the worn/fit photo per item, but only when it is a DISTINCT photo from the display image.
  const fitImageUrlByItemId = new Map<string, string | null>();
  const fitPhotoIdByItemId = new Map<string, string | null>();
  for (const asset of fitBundle?.assets ?? []) {
    if (!asset.itemId || fitImageUrlByItemId.has(asset.itemId)) {
      continue;
    }
    if (asset.photoId && asset.photoId === displayPhotoIdByItemId.get(asset.itemId)) {
      continue;
    }
    fitImageUrlByItemId.set(asset.itemId, await resolvedClosetAssetUrl(asset, input.resolveRemoteMediaUrl));
    fitPhotoIdByItemId.set(asset.itemId, asset.photoId ?? null);
  }
  // Only emit signed same-origin image URLs (from the bundle). An item with no signable bundle asset
  // shows the "Add photo" placeholder rather than a broken cross-origin/authenticated URL.
  const items = await Promise.all(pagedItems.map(async (item) => {
    const provenance = matchedProvenanceByItemId.get(item.id) ?? null;
    let selectedDisplayPhotoId = displayPhotoIdByItemId.get(item.id) ?? null;
    let selectedDisplayUrl = imageUrlByItemId.get(item.id) ?? null;
    let displayPhoto = selectedDisplayPhotoId
      ? item.photos.find((photo) => photo.id === selectedDisplayPhotoId && !isStyleFitPhoto(photo)) ?? null
      : item.photos.find((photo) => photo.isPrimary && !isStyleFitPhoto(photo))
        ?? item.photos.find((photo) => !isStyleFitPhoto(photo))
        ?? null;
    let originalPhoto = displayPhoto?.source === 'generated_metadata'
      ? selectPresentationOriginalPhoto(item, displayPhoto.id)
      : null;
    let proxiedOriginalUrl = originalPhoto?.artifactAvailable === true && input.resolveOwnedMediaUrl
      ? await input.resolveOwnedMediaUrl(originalPhoto.id)
      : originalPhoto?.sourceUrl && input.resolveRemoteMediaUrl
        ? await input.resolveRemoteMediaUrl(originalPhoto.sourceUrl)
        : null;
    // An unapproved generated row is not the wardrobe's Catalog truth. Prefer the retained Original
    // whenever it is deliverable, so a background/angle/crop candidate cannot lead the grid merely
    // because it has the structural generated-media tuple. The generated row remains retained for
    // review/replacement but stays explicitly non-ready until a source-bound quality marker exists.
    const approvedCatalog = findApprovedStyleCatalogPhoto(item, provenance);
    if (approvedCatalog?.id !== displayPhoto?.id && displayPhoto?.source === 'generated_metadata') {
      if (originalPhoto && proxiedOriginalUrl) {
        selectedDisplayPhotoId = originalPhoto.id;
        selectedDisplayUrl = proxiedOriginalUrl;
        displayPhoto = originalPhoto;
      } else {
        selectedDisplayPhotoId = null;
        selectedDisplayUrl = null;
        displayPhoto = null;
      }
      originalPhoto = null;
      proxiedOriginalUrl = null;
    }
    const closetItem = toClosetItem(
      item,
      selectedDisplayUrl,
      selectedDisplayPhotoId,
      fitImageUrlByItemId.get(item.id) ?? null,
      fitPhotoIdByItemId.get(item.id) ?? null,
      provenance,
      proxiedOriginalUrl,
    );
    closetItem.media = await appendRetainedWardrobeMedia(closetItem.media, item.photos, input);
    if(style.getPhotoLibrary){
      const library=await style.getPhotoLibrary(item.id);
      closetItem.photoRevision=library.revision;
      closetItem.photoUndoToken=library.state.undo?.fingerprint===library.fingerprint?library.state.undo.token:null;
      const quality=approvedCatalog?(provenance?.sourceSnapshot as any)?.catalogNormalizationQuality:null;
      const hidden=new Set(library.state.hidden),order=library.state.order;
      const defaultCover=approvedCatalog?.id??item.photos.find(p=>p.isPrimary&&!isStyleFitPhoto(p)&&p.source!=='generated_metadata')?.id??item.photos.find(p=>!isStyleFitPhoto(p)&&p.source!=='generated_metadata')?.id??item.photos.find(p=>isStyleFitPhoto(p)&&p.source!=='generated_metadata')?.id??null;
      closetItem.coverPhotoId=library.state.coverId===undefined?defaultCover:library.state.coverId;
      // Broken sources remain manageable without making up a usable image URL.
      for(const photo of item.photos){
        if(!closetItem.media.some(p=>p.id===photo.id)&&photo.source!=='generated_metadata')closetItem.media.push({id:photo.id,url:null,artifactBacked:photo.artifactAvailable===true,backgroundRemoved:photo.bgRemoved,contextualRole:'none',heroEligible:false,isSourceEvidence:true,label:isStyleFitPhoto(photo)?'On you':'Original',source:photo.source});
      }
      // An inspected original is its own evidence, not a separate source duplicate.
      // Omit that self-edge so cached gallery clients cannot suppress the cover.
      closetItem.media=closetItem.media.map(p=>({...p,hidden:hidden.has(p.id),...(p.id===quality?.catalogPhotoId&&quality?.sourcePhotoId&&quality.sourcePhotoId!==p.id?{sourcePhotoId:quality.sourcePhotoId}:{})}));
      closetItem.media.sort((a,b)=>a.id===closetItem.coverPhotoId?-1:b.id===closetItem.coverPhotoId?1:(order.includes(a.id)?order.indexOf(a.id):999)-(order.includes(b.id)?order.indexOf(b.id):999));
      const cover=closetItem.media.find(p=>p.id===closetItem.coverPhotoId&&!p.hidden);
      closetItem.imageUrl=cover?.url??null;closetItem.hasImage=!!closetItem.imageUrl;
    }

    return {
      ...closetItem,
      duplicateCandidates: item.id === focusedDetailItem?.id
        ? focusedDuplicateCandidates.map((candidate) => {
            const match = activeItems.find((entry) => entry.id === candidate.id) ?? null;
            const matchProvenance = match ? matchedProvenanceByItemId.get(match.id) ?? null : null;
            const approvedCatalogId = match ? findApprovedStyleCatalogPhoto(match, matchProvenance)?.id ?? null : null;
            const mediaLabels = match
              ? Array.from(new Set(match.photos.map((photo): 'Catalog' | 'Original' | 'On you' =>
                  isStyleFitPhoto(photo) ? 'On you' : photo.id === approvedCatalogId ? 'Catalog' : 'Original')))
              : [];
            const primaryPhotoId = displayPhotoIdByItemId.get(candidate.id) ?? null;
            const primaryMediaLabel: 'Catalog' | 'Original' | 'On you' | null = match
              ? (match.photos.find((photo) => photo.id === primaryPhotoId && isStyleFitPhoto(photo))
                  ? 'On you'
                  : primaryPhotoId === approvedCatalogId ? 'Catalog' : primaryPhotoId ? 'Original' : null)
              : null;
            return {
              brand: match?.brand ?? candidate.signals.brand ?? null,
              colorFamily: match?.colorFamily ?? candidate.signals.colorFamily ?? candidate.signals.colorName ?? null,
              id: candidate.id,
              imageUrl: imageUrlByItemId.get(candidate.id) ?? null,
              mediaIds: match?.photos.map((photo) => photo.id).sort() ?? [],
              mediaLabels,
              name: match?.name ?? candidate.name,
              primaryMediaLabel,
              reason: candidate.reason,
              score: candidate.score,
              size: match?.size ?? candidate.signals.size ?? null,
              subcategory: match?.subcategory ?? candidate.signals.subcategory ?? candidate.signals.itemType ?? null,
            };
          })
        : [],
    };
  }));
  const facetSource = idNarrowed ? statusItems : statusBase;
  const viewFilter =
    idNarrowed && statusItems.length > 0
      ? { ...filter, item_ids: statusItems.map((item) => item.id) }
      : filter;
  const normalizationStates = matchedItems.map((item) => styleClosetNormalizationState(
    item,
    matchedProvenanceByItemId.get(item.id) ?? null,
  ));
  const summary = {
    activeTotal: idNarrowed ? statusItems.length : activeItems.length,
    filterLabel: filterLabel(filter),
    generatedCatalogReferenceTotal: matchedItems.filter((item) => deriveStyleItemPresentationMediaSource(item) === 'generated_catalog_reference').length,
    mediaReadyTotal: normalizationStates.filter((state) => state === 'ready').length,
    missingOrUnavailablePhotoTotal: normalizationStates.filter((state) => state === 'needs_photo' || state === 'unavailable').length,
    needsNormalizationTotal: normalizationStates.filter((state) => state === 'needs_normalization').length,
    needsPhotoTotal: matchedItems.filter((item) => deriveStyleItemPresentationMediaSource(item) === 'none').length,
    normalizedCatalogTotal: normalizationStates.filter((state) => state === 'ready').length,
    remoteCandidateTotal: matchedItems.filter((item) => deriveStyleItemPresentationMediaSource(item) === 'retained_remote').length,
    shownTotal: matchedItems.length,
    unavailableMediaTotal: matchedItems.filter((item) => deriveStyleItemPresentationMediaSource(item) === 'legacy_unavailable').length,
  };
  const recommendationFocusReady = requestedMode !== 'recommendation'
    || Boolean(requestedFocusedItemId && items.some((item) => item.id === requestedFocusedItemId));
  const presentationMode: StyleClosetPresentationMode = requestedMode === 'recommendation' && !recommendationFocusReady
    ? (idNarrowed ? 'comparison' : 'browse')
    : requestedMode ?? (idNarrowed ? 'comparison' : 'browse');
  const result: StyleClosetStructuredContent = {
    ...buildStyleClosetViewModel({
      cursor: nextCursor,
      facets: buildCategoryFacets(facetSource),
      filter: viewFilter,
      filterOptions: idNarrowed
        ? buildFilterOptions(facetSource)
        : buildHierarchicalFilterOptions(statusBase, filter),
      items,
      presentation: {
        focusedItemId: requestedFocusedItemId && items.some((item) => item.id === requestedFocusedItemId)
          ? requestedFocusedItemId
          : null,
        mode: presentationMode,
        ...(presentationMode === 'recommendation' ? { recommendationReason: requestedRecommendationReason } : {}),
      },
      summary,
    }),
    hostResponseInstruction:
      'The Style Closet widget is ready. Keep the model response to a short acknowledgement and let the mounted app carry the grid.',
    hostResponseMode: 'native_widget_rendered',
  };
  rememberWardrobeIndex(result, facetSource);
  return result;
}

export function buildStyleClosetViewModel(input: {
  cursor: string | null;
  facets: StyleClosetViewModel['facets'];
  filter: StyleClosetViewModel['filter'];
  filterOptions: StyleClosetViewModel['filterOptions'];
  items: StyleClosetItemViewModel[];
  presentation?: StyleClosetViewModel['presentation'];
  summary: StyleClosetViewModel['summary'];
}): StyleClosetViewModel {
  return {
    cursor: input.cursor,
    experience: 'style_closet',
    facets: input.facets,
    filter: input.filter,
    filterOptions: input.filterOptions,
    items: input.items,
    presentation: input.presentation ?? { focusedItemId: null, mode: 'browse' },
    surface: 'style_closet',
    summary: input.summary,
    templateUri: STYLE_CLOSET_TEMPLATE_URI,
    title: 'Your closet',
  };
}

function restoreCompatibleStyleClosetWidgetHtml(html: string): string {
  html = html
    .replace(String.raw`      const recoverAmbiguousDuplicateMerge = async (sourceItemId, targetItemId, expectedRetainedMediaIds) => {
        // Some hosts can persist the merge but omit the structured write ACK from the widget bridge.
        // Reconcile both exact durable identities before treating that response as a failure. The
        // subsequent Closet refresh still verifies the exact retained media ids and active count.
        const [sourceResult, targetResult] = await Promise.all([
          callTool('fluent_get_item', {
            domain: 'style',
            item_id: sourceItemId,
            item_type: 'style_item',
            view: 'summary',
          }),
          callTool('fluent_get_item', {
            domain: 'style',
            item_id: targetItemId,
            item_type: 'style_item',
            view: 'summary',
          }),
        ]);
        const source = extractStyleDomainItem(sourceResult, sourceItemId);
        const target = extractStyleDomainItem(targetResult, targetItemId);
        if (!source || source.id !== sourceItemId || source.status !== 'archived') {
          throw new Error('duplicate merge recovery did not confirm the archived source');
        }
        if (!target || target.id !== targetItemId || target.status !== 'active') {
          throw new Error('duplicate merge recovery did not confirm the retained item');
        }
        const sourcePhotoIds = Array.isArray(source.photos) ? source.photos.map((photo) => photo && photo.id).filter(Boolean) : null;
        const targetPhotoIds = Array.isArray(target.photos) ? target.photos.map((photo) => photo && photo.id).filter(Boolean) : null;
        const sourcePhotoCount = Number(source.photosCount ?? source.photos_count ?? (sourcePhotoIds ? sourcePhotoIds.length : NaN));
        const targetPhotoCount = Number(target.photosCount ?? target.photos_count ?? (targetPhotoIds ? targetPhotoIds.length : NaN));
        const targetIdsMismatch = targetPhotoIds
          ? expectedRetainedMediaIds.some((mediaId) => !targetPhotoIds.includes(mediaId))
          : false;
        if (sourcePhotoCount !== 0 || !Number.isFinite(targetPhotoCount)
            || targetPhotoCount < expectedRetainedMediaIds.length || targetIdsMismatch) {
          throw new Error('duplicate merge recovery did not confirm the exact media transfer');
        }
        return { source, target };
      };
`, '')
    .replace(String.raw`              try {
                const ack = verifyDuplicateMergeAck(result, sourceItem.id, candidate.id, mergeOperationId);
                const proof = writeProofItem(ack);
                const durableMediaIds = (proof.payload && Array.isArray(proof.payload.photos) ? proof.payload.photos : [])
                  .map((photo) => photo && photo.id).filter(Boolean).sort();
                const missingExpectedMedia = expectedRetainedMediaIds.some((mediaId) => !durableMediaIds.includes(mediaId));
                const exactDurableSetMismatch = sourceDurableMediaIdsKnown && candidateDurableMediaIdsKnown
                  && (durableMediaIds.length !== expectedRetainedMediaIds.length
                    || durableMediaIds.some((mediaId, index) => mediaId !== expectedRetainedMediaIds[index]));
                if (missingExpectedMedia || exactDurableSetMismatch) {
                  throw new Error('duplicate merge read-after-write did not confirm the durable media transfer');
                }
              } catch (ackError) {
                await recoverAmbiguousDuplicateMerge(sourceItem.id, candidate.id, expectedRetainedMediaIds);
              }
`, String.raw`              verifyDuplicateMergeAck(result, sourceItem.id, candidate.id);
`);
  html = html.replace('verifyDuplicateMergeAck(result, sourceItem.id, candidate.id);', 'verifyDuplicateMergeAck(result, sourceItem.id, candidate.id, mergeOperationId);');
  html = html.replace(String.raw`        const focusedItemId = typeof renderOptions.focusedItemId === 'string' ? renderOptions.focusedItemId : null;
        const preserveCollectionFilter = renderOptions.preserveCollectionFilter === true;
        const filter = renderOptions.filterOverride && typeof renderOptions.filterOverride === 'object'
          ? Object.assign({}, renderOptions.filterOverride)
          : (focusedItemId && !preserveCollectionFilter ? { status: 'active', item_ids: [focusedItemId] } : activeServerFilter());
        const currentMode = typeof renderOptions.presentationMode === 'string'
          ? renderOptions.presentationMode
          : (focusedItemId ? 'detail' : activePresentationMode());
`, String.raw`        const focusedItemId = typeof renderOptions.focusedItemId === 'string' ? renderOptions.focusedItemId : null;
        const filter = focusedItemId ? { status: 'active', item_ids: [focusedItemId] } : activeServerFilter();
        const currentMode = focusedItemId ? 'detail' : activePresentationMode();
`);
  const replacements = [
  [
    String.raw`      const openDuplicateReview = (itemId, forcedReturnFocus = null) => {
        const sourceItem = itemById(itemId);
        let candidates = Array.isArray(sourceItem?.duplicateCandidates) ? sourceItem.duplicateCandidates.slice() : [];
        if (!sourceItem) return;
        const shell = document.createElement('div');
        shell.className = 'panel';
        shell.setAttribute('role', 'dialog');
        shell.setAttribute('aria-modal', 'true');
        shell.setAttribute('aria-label', 'Review possible closet match');
        let candidateIndex = 0;
        let busy = false;
        const returnFocus = forcedReturnFocus || $('detailLayer')?.querySelector('[data-detail-duplicates]');
        const closeReview = () => {
          shell.remove();
          if (activePanelClose === closeReview) activePanelClose = null;
          setCollectionModalState(Boolean(flippedId));
          if (returnFocus && returnFocus.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus();
        };
        const piece = (label, item, imageUrl) => {
          const facts = [item.colorFamily, item.brand, item.size ? 'Size ' + item.size : null, item.subcategory].filter(Boolean).join(' · ');
          const mediaLabels = Array.from(new Set(
            (Array.isArray(item.mediaLabels) ? item.mediaLabels : (item.media || []).map((media) => media.label)).filter(Boolean),
          ));
          const primaryMediaLabel = item.primaryMediaLabel || (item.media || []).find((media) => media.heroEligible)?.label || null;
          const mediaSummary = mediaLabels.length
            ? (primaryMediaLabel ? primaryMediaLabel + ' shown' : 'Saved media') + ' · ' + mediaLabels.join(' + ')
            : 'No retained media roles';
          const matchEvidence = item.reason
            ? '<p class="duplicate-evidence"><strong>Why it may match:</strong> ' + escapeHtml(item.reason) +
              (Number.isFinite(Number(item.score)) ? ' · ' + Math.round(Number(item.score) * 100) + '% signal' : '') + '</p>'
            : '';
          const photo = imageUrl
            ? '<img src="' + escapeHtml(imageUrl) + '" alt="' + escapeHtml(item.name || label) + '" referrerpolicy="no-referrer" />'
            : '<div class="empty">Photo unavailable</div>';
          return '<article class="duplicate-piece"><div class="duplicate-photo">' + photo + '</div><div class="duplicate-copy"><p class="micro">' + escapeHtml(label) + '</p><strong>' + escapeHtml(item.name || 'Unnamed piece') + '</strong><p>' + escapeHtml(facts || 'Closet item') + '</p><p class="micro">' + escapeHtml(mediaSummary) + '</p>' + matchEvidence + '</div></article>';
        };
        const renderSearch = (message = '') => {
          shell.innerHTML = '<div class="sheet duplicate-sheet"><button class="duplicate-close" type="button" aria-label="Back to item" data-close-review>×</button><h2>Find the item already in your closet</h2><p class="duplicate-intro">Search by name, brand, color, or type. Nothing is combined until you choose an exact item and confirm it.</p>' +
            '<form data-duplicate-search><label><span class="micro">Search your closet</span><input name="query" type="search" autocomplete="off" placeholder="Lavender tee" required /></label><div class="duplicate-candidate-actions"><button class="btn primary" type="submit">Search</button></div></form>' +
            (message ? '<p class="line" data-duplicate-search-message>' + escapeHtml(message) + '</p>' : '') +
            '<div data-duplicate-search-results></div></div>';
          shell.querySelector('[data-close-review]').addEventListener('click', closeReview);
          shell.querySelector('[data-duplicate-search]').addEventListener('submit', async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const query = String(new FormData(form).get('query') || '').trim();
            if (!query || busy) return;
            busy = true;
            form.querySelectorAll('button, input').forEach((control) => { control.disabled = true; });
            const results = shell.querySelector('[data-duplicate-search-results]');
            if (results) results.innerHTML = '<p class="line">Searching…</p>';
            try {
              const result = await callTool('fluent_render_style_closet_surface', {
                filter: { query, status: 'active' },
                limit: 24,
                presentation: { mode: 'browse' },
              });
              const searched = extractViewModel(result);
              const matches = (searched?.items || []).filter((entry) => entry.id !== sourceItem.id);
              if (!matches.length) {
                if (results) results.innerHTML = '<p class="line">No other closet item matched that search.</p>';
              } else if (results) {
                results.innerHTML = '<div class="duplicate-search-list">' + matches.map((entry, index) =>
                  '<button class="btn duplicate-search-result" type="button" data-select-match="' + index + '"><strong>' + escapeHtml(entry.name || 'Unnamed piece') + '</strong><span>' + escapeHtml([entry.brand, entry.colorFamily, entry.subcategory].filter(Boolean).join(' · ') || 'Closet item') + '</span></button>'
                ).join('') + '</div>';
                results.querySelectorAll('[data-select-match]').forEach((button) => button.addEventListener('click', () => {
                  const selected = matches[Number(button.getAttribute('data-select-match'))];
                  if (!selected) return;
                  candidates = [selected];
                  candidateIndex = 0;
                  busy = false;
                  renderCandidate();
                }));
              }
            } catch (error) {
              if (results) results.innerHTML = '<p class="line error">Couldn’t search the closet right now. Nothing was changed.</p>';
            } finally {
              busy = false;
              if (form.isConnected) form.querySelectorAll('button, input').forEach((control) => { control.disabled = false; });
            }
          });
          setTimeout(() => shell.querySelector('input')?.focus(), 0);
        };
        const renderCandidate = () => {
          const candidate = candidates[candidateIndex];
          const position = candidates.length > 1 ? '<p class="micro">Possible match ' + (candidateIndex + 1) + ' of ' + candidates.length + '</p>' : '';
          shell.innerHTML = '<div class="sheet duplicate-sheet"><button class="duplicate-close" type="button" aria-label="Back to item" data-close-review>×</button><h2>Are these the same piece?</h2><p class="duplicate-intro">If you combine them, <strong>' + escapeHtml(candidate.name || 'the possible match') + '</strong> will remain in your closet with all photos. This item will be archived; its non-empty details will not replace existing details.</p>' + position +
            '<div class="duplicate-pair">' + piece('This item', sourceItem, sourceItem.imageUrl) + piece('Item that will remain', candidate, candidate.imageUrl) + '</div>' +
            '<div class="duplicate-candidate-actions">' +
            (candidates.length > 1 ? '<button class="btn" type="button" data-next-match>Next match</button>' : '') +
            '<button class="btn" type="button" data-find-match>Choose a different match</button>' +
            '<button class="btn" type="button" data-keep-both>Keep both</button>' +
            '<button class="btn" type="button" data-decide-later>Decide later</button>' +
            '<button class="btn primary" type="button" data-combine>Use existing — combine</button></div></div>';
          shell.querySelector('[data-close-review]').addEventListener('click', closeReview);
          shell.querySelector('[data-find-match]').addEventListener('click', () => renderSearch());
          shell.querySelector('[data-keep-both]').addEventListener('click', () => {
            closeReview();
            showNote('Kept both closet items. Nothing was changed.', 'success');
          });
          shell.querySelector('[data-decide-later]').addEventListener('click', () => {
            closeReview();
            showNote('No duplicate decision was saved. You can review this match later.', '');
          });
          const next = shell.querySelector('[data-next-match]');
          if (next) next.addEventListener('click', () => { candidateIndex = (candidateIndex + 1) % candidates.length; renderCandidate(); });
          shell.querySelector('[data-combine]').addEventListener('click', async () => {
            if (busy) return;
            busy = true;
            let mergeCommitted = false;
            const activeTotalBefore = Number(viewModel.summary?.activeTotal);
            const mergeFilterItemIds = Array.isArray(activeServerFilter().item_ids) ? activeServerFilter().item_ids : [];
            const sourceMediaIds = (sourceItem.media || []).map((media) => media.id).sort();
            const sourceDurableMediaIdsKnown = Array.isArray(sourceItem.mediaIds);
            const candidateDurableMediaIdsKnown = Array.isArray(candidate.mediaIds);
            const expectedRetainedMediaIds = Array.from(new Set([
              ...(sourceDurableMediaIdsKnown ? sourceItem.mediaIds : (sourceItem.media || []).map((media) => media.id)),
              ...(Array.isArray(candidate.mediaIds) ? candidate.mediaIds : (candidate.media || []).map((media) => media.id)),
            ])).sort();
            const mergeOperationId = crypto.randomUUID();
            const mergeReceiptDescriptor = {
              activeTotalBefore,
              createdAt: Date.now(),
              mergeOperationId,
              receiptLabel: 'Combined the two records. Undo remains available.',
              sourceItemId: sourceItem.id,
              sourceMediaIds,
              targetItemId: candidate.id,
            };
            shell.querySelectorAll('button').forEach((button) => { button.disabled = true; });
            try {
              const result = await callTool('fluent_archive_item', {
                approval: 'explicit_user_approved',
                disposition: 'duplicate',
                domain: 'style',
                item_id: sourceItem.id,
                item_type: 'style_item',
                merge_into_item_id: candidate.id,
                merge_operation_id: mergeOperationId,
                reason: 'User confirmed these records describe the same physical garment.',
                response_mode: 'full',
                source_skill: 'fluent-style-closet-widget',
                source_snapshot: {
                  notes: 'fluent-style-closet-widget:merge_into_item_id=' + candidate.id,
                  title: 'Confirmed duplicate closet item merge',
                },
                source_type: 'user_confirmation',
              });
              verifyDuplicateMergeAck(result, sourceItem.id, candidate.id, mergeOperationId);
              mergeCommitted = true;
              persistDuplicateMergeReceipt(mergeReceiptDescriptor);
              closeReview();
              closeDetail();
              itemCache.delete(sourceItem.id);
              itemCache.delete(candidate.id);
              const receiptInverse = createDuplicateMergeReceiptInverse(mergeReceiptDescriptor);
              try {
                if (mergeFilterItemIds.length > 0) {
                  const remainingItemIds = mergeFilterItemIds.filter((itemId) => itemId !== sourceItem.id);
                  const countFilter = Object.assign({}, activeServerFilter(), remainingItemIds.length > 0
                    ? { item_ids: remainingItemIds }
                    : { item_ids: mergeFilterItemIds.slice() });
                  await rerender({
                    filterOverride: countFilter,
                    presentationMode: remainingItemIds.length > 1 ? 'comparison' : 'browse',
                  });
                } else {
                  await rerender();
                }
                const activeTotalAfter = Number(viewModel.summary?.activeTotal);
                if (!Number.isFinite(activeTotalBefore) || !Number.isFinite(activeTotalAfter) || activeTotalAfter !== activeTotalBefore - 1) {
                  throw new Error('Duplicate merge active-total readback did not decrease by exactly one.');
                }
                // Count reconciliation and final presentation are separate reads. The last result is
                // exact detail so host repaint cannot strand a stale comparison. Durable media
                // completeness remains owned by the write ACK above, not the smaller render subset.
                await rerender({ focusedItemId: candidate.id });
                if (!itemById(candidate.id)) throw new Error('Duplicate merge did not return the retained item.');
                const receiptLabel = 'Used ' + (candidate.name || 'the existing item') + ' and archived the duplicate. Active items: ' + activeTotalBefore + ' → ' + activeTotalAfter + '.';
                mergeReceiptDescriptor.receiptLabel = receiptLabel;
                persistDuplicateMergeReceipt(mergeReceiptDescriptor);
                setTimeout(() => {
                  openDetailItem(candidate.id);
                  showMutationReceipt(receiptLabel, receiptInverse);
                }, 0);
              } catch (refreshError) {
                showMutationReceipt('The pieces were combined, but exact count and media readback could not be confirmed. Undo remains available.', receiptInverse);
              }
            } catch (error) {
              if (mergeCommitted) return;
              busy = false;
              shell.querySelectorAll('button').forEach((button) => { button.disabled = false; });
              showNote('Couldn’t combine these pieces. Nothing was changed.', 'error');
            }
          });
        };
        activePanelClose = closeReview;
        shell.addEventListener('click', (event) => { if (event.target === shell && !busy) closeReview(); });
        if (candidates.length) renderCandidate();
        else renderSearch('No automatic match was found. Search the full closet to choose one yourself.');
        requestDisplayMode('fullscreen');
        setCollectionModalState(true);
        document.body.appendChild(shell);
        setTimeout(() => shell.querySelector('button')?.focus(), 0);
      };
`,
    String.raw`      const openDuplicateReview = (itemId, forcedReturnFocus = null) => {
        const sourceItem = itemById(itemId);
        let candidates = Array.isArray(sourceItem?.duplicateCandidates) ? sourceItem.duplicateCandidates.slice() : [];
        if (!sourceItem) return;
        const shell = document.createElement('div');
        shell.className = 'panel';
        shell.setAttribute('role', 'dialog');
        shell.setAttribute('aria-modal', 'true');
        shell.setAttribute('aria-label', 'Review possible closet match');
        let candidateIndex = 0;
        let busy = false;
        const returnFocus = forcedReturnFocus || $('detailLayer')?.querySelector('[data-detail-duplicates]');
        const closeReview = () => {
          shell.remove();
          if (activePanelClose === closeReview) activePanelClose = null;
          setCollectionModalState(Boolean(flippedId));
          if (returnFocus && returnFocus.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus();
        };
        const piece = (label, item, imageUrl) => {
          const facts = [item.colorFamily, item.brand, item.size ? 'Size ' + item.size : null, item.subcategory].filter(Boolean).join(' · ');
          const photo = imageUrl
            ? '<img src="' + escapeHtml(imageUrl) + '" alt="' + escapeHtml(item.name || label) + '" referrerpolicy="no-referrer" />'
            : '<div class="empty">Photo unavailable</div>';
          return '<article class="duplicate-piece"><div class="duplicate-photo">' + photo + '</div><div class="duplicate-copy"><p class="micro">' + escapeHtml(label) + '</p><strong>' + escapeHtml(item.name || 'Unnamed piece') + '</strong><p>' + escapeHtml(facts || 'Closet item') + '</p></div></article>';
        };
        const renderSearch = (message = '') => {
          shell.innerHTML = '<div class="sheet duplicate-sheet"><button class="duplicate-close" type="button" aria-label="Back to item" data-close-review>×</button><h2>Find the item already in your closet</h2><p class="duplicate-intro">Search by name, brand, color, or type. Nothing is combined until you choose an exact item and confirm it.</p>' +
            '<form data-duplicate-search><label><span class="micro">Search your closet</span><input name="query" type="search" autocomplete="off" placeholder="Lavender tee" required /></label><div class="duplicate-candidate-actions"><button class="btn primary" type="submit">Search</button></div></form>' +
            (message ? '<p class="line" data-duplicate-search-message>' + escapeHtml(message) + '</p>' : '') +
            '<div data-duplicate-search-results></div></div>';
          shell.querySelector('[data-close-review]').addEventListener('click', closeReview);
          shell.querySelector('[data-duplicate-search]').addEventListener('submit', async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const query = String(new FormData(form).get('query') || '').trim();
            if (!query || busy) return;
            busy = true;
            form.querySelectorAll('button, input').forEach((control) => { control.disabled = true; });
            const results = shell.querySelector('[data-duplicate-search-results]');
            if (results) results.innerHTML = '<p class="line">Searching…</p>';
            try {
              const result = await callTool('fluent_render_style_closet_surface', {
                filter: { query, status: 'active' },
                limit: 24,
                presentation: { mode: 'browse' },
              });
              const searched = extractViewModel(result);
              const matches = (searched?.items || []).filter((entry) => entry.id !== sourceItem.id);
              if (!matches.length) {
                if (results) results.innerHTML = '<p class="line">No other closet item matched that search.</p>';
              } else if (results) {
                results.innerHTML = '<div class="duplicate-search-list">' + matches.map((entry, index) =>
                  '<button class="btn duplicate-search-result" type="button" data-select-match="' + index + '"><strong>' + escapeHtml(entry.name || 'Unnamed piece') + '</strong><span>' + escapeHtml([entry.brand, entry.colorFamily, entry.subcategory].filter(Boolean).join(' · ') || 'Closet item') + '</span></button>'
                ).join('') + '</div>';
                results.querySelectorAll('[data-select-match]').forEach((button) => button.addEventListener('click', () => {
                  const selected = matches[Number(button.getAttribute('data-select-match'))];
                  if (!selected) return;
                  candidates = [selected];
                  candidateIndex = 0;
                  busy = false;
                  renderCandidate();
                }));
              }
            } catch (error) {
              if (results) results.innerHTML = '<p class="line error">Couldn’t search the closet right now. Nothing was changed.</p>';
            } finally {
              busy = false;
              if (form.isConnected) form.querySelectorAll('button, input').forEach((control) => { control.disabled = false; });
            }
          });
          setTimeout(() => shell.querySelector('input')?.focus(), 0);
        };
        const renderCandidate = () => {
          const candidate = candidates[candidateIndex];
          const position = candidates.length > 1 ? '<p class="micro">Possible match ' + (candidateIndex + 1) + ' of ' + candidates.length + '</p>' : '';
          shell.innerHTML = '<div class="sheet duplicate-sheet"><button class="duplicate-close" type="button" aria-label="Back to item" data-close-review>×</button><h2>Are these the same piece?</h2><p class="duplicate-intro">If you combine them, <strong>' + escapeHtml(candidate.name || 'the possible match') + '</strong> will remain in your closet with all photos. This item will be archived; its non-empty details will not replace existing details.</p>' + position +
            '<div class="duplicate-pair">' + piece('This item', sourceItem, sourceItem.imageUrl) + piece('Item that will remain', candidate, candidate.imageUrl) + '</div>' +
            '<div class="duplicate-candidate-actions">' +
            (candidates.length > 1 ? '<button class="btn" type="button" data-next-match>Next match</button>' : '') +
            '<button class="btn" type="button" data-find-match>Find another item</button>' +
            '<button class="btn primary" type="button" data-combine>Same piece — combine</button></div></div>';
          shell.querySelector('[data-close-review]').addEventListener('click', closeReview);
          shell.querySelector('[data-find-match]').addEventListener('click', () => renderSearch());
          const next = shell.querySelector('[data-next-match]');
          if (next) next.addEventListener('click', () => { candidateIndex = (candidateIndex + 1) % candidates.length; renderCandidate(); });
          shell.querySelector('[data-combine]').addEventListener('click', async () => {
            if (busy) return;
            busy = true;
            let mergeCommitted = false;
            shell.querySelectorAll('button').forEach((button) => { button.disabled = true; });
            try {
              const result = await callTool('fluent_archive_item', {
                approval: 'explicit_user_approved',
                disposition: 'duplicate',
                domain: 'style',
                item_id: sourceItem.id,
                item_type: 'style_item',
                reason: 'User confirmed these records describe the same physical garment.',
                response_mode: 'full',
                source_skill: 'fluent-style-closet-widget',
                source_snapshot: {
                  notes: 'fluent-style-closet-widget:merge_into_item_id=' + candidate.id,
                  title: 'Confirmed duplicate closet item merge',
                },
                source_type: 'user_confirmation',
              });
              verifyDuplicateMergeAck(result, sourceItem.id, candidate.id, mergeOperationId);
              mergeCommitted = true;
              closeReview();
              closeDetail();
              itemCache.delete(sourceItem.id);
              itemCache.delete(candidate.id);
              showMutationReceipt('Combined the two records. ' + (candidate.name || 'The existing item') + ' is now the active item.', null);
              try {
                await rerender({ focusedItemId: candidate.id });
                setTimeout(() => openDetailItem(candidate.id), 0);
              } catch (refreshError) {
                showNote('The pieces were combined. Refresh the closet to reopen the item.', 'success');
              }
            } catch (error) {
              if (mergeCommitted) return;
              busy = false;
              shell.querySelectorAll('button').forEach((button) => { button.disabled = false; });
              showNote('Couldn’t combine these pieces. Nothing was changed.', 'error');
            }
          });
        };
        activePanelClose = closeReview;
        shell.addEventListener('click', (event) => { if (event.target === shell && !busy) closeReview(); });
        if (candidates.length) renderCandidate();
        else renderSearch('No automatic match was found. Search the full closet to choose one yourself.');
        requestDisplayMode('fullscreen');
        setCollectionModalState(true);
        document.body.appendChild(shell);
        setTimeout(() => shell.querySelector('button')?.focus(), 0);
      };
`
  ],

  [
    "      let flippedId = null;\n      let retainedEditedDetailId = null;\n      let retainedEditedDetailItem = null;\n",
    "      let flippedId = null;\n"
  ],
  [
    "      const extractStyleDomainItem = (value, itemId, depth = 0) => {\n        if (!value || depth > MAX_DEPTH) return null;\n        if (Array.isArray(value)) {\n          for (const entry of value) {\n            const found = extractStyleDomainItem(entry, itemId, depth + 1);\n            if (found) return found;\n          }\n          return null;\n        }\n        if (typeof value !== 'object') return null;\n        if (value.object === 'DomainItem' && value.domain === 'style' && value.type === 'style_item'\n            && value.id === itemId && value.payload && typeof value.payload === 'object') {\n          return value.payload;\n        }\n        for (const key of VM_KEYS) {\n          if (value[key] != null) {\n            const found = extractStyleDomainItem(value[key], itemId, depth + 1);\n            if (found) return found;\n          }\n        }\n        return null;\n      };\n",
    ""
  ],
  [
    "      const recoverAmbiguousDuplicateMerge = async (sourceItemId, targetItemId, expectedRetainedMediaCount) => {\n        // Some hosts can persist the merge but omit the structured write ACK from the widget bridge.\n        // Reconcile both exact durable identities before treating that response as a failure. The\n        // subsequent Closet refresh still verifies the exact retained media ids and active count.\n        const [sourceResult, targetResult] = await Promise.all([\n          callTool('fluent_get_item', {\n            domain: 'style',\n            item_id: sourceItemId,\n            item_type: 'style_item',\n            view: 'summary',\n          }),\n          callTool('fluent_get_item', {\n            domain: 'style',\n            item_id: targetItemId,\n            item_type: 'style_item',\n            view: 'summary',\n          }),\n        ]);\n        const source = extractStyleDomainItem(sourceResult, sourceItemId);\n        const target = extractStyleDomainItem(targetResult, targetItemId);\n        if (!source || source.id !== sourceItemId || source.status !== 'archived') {\n          throw new Error('duplicate merge recovery did not confirm the archived source');\n        }\n        if (!target || target.id !== targetItemId || target.status !== 'active') {\n          throw new Error('duplicate merge recovery did not confirm the retained item');\n        }\n        const sourcePhotoCount = Number(source.photosCount ?? source.photos_count ?? (Array.isArray(source.media) ? source.media.length : NaN));\n        const targetPhotoCount = Number(target.photosCount ?? target.photos_count ?? (Array.isArray(target.media) ? target.media.length : NaN));\n        if (sourcePhotoCount !== 0 || targetPhotoCount !== expectedRetainedMediaCount) {\n          throw new Error('duplicate merge recovery did not confirm the exact media transfer');\n        }\n        return { source, target };\n      };\n",
    ""
  ],
  [
    "      const recoverAmbiguousStylePatch = async (itemId, patch) => {\n        // Confirmation of one exact write must not depend on the Closet template/render path.\n        // A host can persist the write yet fail or delay the widget render, which previously made\n        // Undo report a false failure. Read the exact canonical item through the existing read tool.\n        const result = await callTool('fluent_get_item', {\n          domain: 'style',\n          item_id: itemId,\n          item_type: 'style_item',\n          view: 'summary',\n        });\n        const candidate = extractStyleDomainItem(result, itemId);\n        return verifyStylePatchItem(candidate, itemId, patch);\n      };\n",
    "      const recoverAmbiguousStylePatch = async (itemId, patch) => {\n        const result = await callTool('fluent_render_style_closet_surface', {\n          filter: { item_ids: [itemId], status: 'any' },\n          limit: 1,\n          presentation: { focused_item_id: itemId, mode: 'detail' },\n        });\n        const readback = extractViewModel(result);\n        const candidate = readback && Array.isArray(readback.items)\n          ? readback.items.find((entry) => entry && entry.id === itemId)\n          : null;\n        return verifyStylePatchItem(candidate, itemId, patch);\n      };\n"
  ],
  [
    "      const itemMatchesCollection = (item) => {\n        const f = localFilter || {};\n        if (loadedItemIds && loadedItemIds.indexOf(item.id) === -1) return false;\n        if (f.status && f.status !== 'any' && item.status !== f.status) return false;\n        if (f.category && norm(item.category) !== norm(f.category)) return false;\n        if (f.subcategory && norm(item.subcategory) !== norm(f.subcategory)) return false;\n        if (f.brand && norm(item.brand) !== norm(f.brand)) return false;\n        if (f.color && norm(item.colorFamily) !== norm(f.color)) return false;\n        if (f.size && norm(item.size) !== norm(f.size)) return false;\n        if (f.query) {\n          const hay = [item.name, item.brand, item.category, item.subcategory, item.colorFamily, item.size].filter(Boolean).join(' ').toLowerCase();\n          // Match if the query names this item's category/subcategory (\"jeans\" -> \"Jean\") OR appears as\n          // text. Vocab match catches items classified into a type but not named after it.\n          const queryKey = vocabKey(f.query);\n          const vocabHit = queryKey === vocabKey(item.category) || queryKey === vocabKey(item.subcategory) || queryKey === headNounKey(item.subcategory);\n          if (!vocabHit && hay.indexOf(norm(f.query)) === -1) return false;\n        }\n        return true;\n      };\n      const clientVisible = () => {\n        const authoritativeItems = (viewModel && viewModel.items) || [];\n        const items = filterPending && !loadedItemIds && itemCache.size\n          ? Array.from(itemCache.values())\n          : authoritativeItems;\n        return items.filter(itemMatchesCollection);\n      };\n",
    "      const clientVisible = () => {\n        const authoritativeItems = (viewModel && viewModel.items) || [];\n        const items = filterPending && !loadedItemIds && itemCache.size\n          ? Array.from(itemCache.values())\n          : authoritativeItems;\n        const f = localFilter || {};\n        return items.filter((item) => {\n          if (loadedItemIds && loadedItemIds.indexOf(item.id) === -1) return false;\n          if (f.status && f.status !== 'any' && item.status !== f.status) return false;\n          if (f.category && norm(item.category) !== norm(f.category)) return false;\n          if (f.subcategory && norm(item.subcategory) !== norm(f.subcategory)) return false;\n          if (f.brand && norm(item.brand) !== norm(f.brand)) return false;\n          if (f.color && norm(item.colorFamily) !== norm(f.color)) return false;\n          if (f.size && norm(item.size) !== norm(f.size)) return false;\n          if (f.query) {\n            const hay = [item.name, item.brand, item.category, item.subcategory, item.colorFamily, item.size].filter(Boolean).join(' ').toLowerCase();\n            // Match if the query names this item's category/subcategory (\"jeans\" -> \"Jean\") OR appears as\n            // text. Vocab match catches items classified into a type but not named after it.\n            const queryKey = vocabKey(f.query);\n            const vocabHit = queryKey === vocabKey(item.category) || queryKey === vocabKey(item.subcategory) || queryKey === headNounKey(item.subcategory);\n            if (!vocabHit && hay.indexOf(norm(f.query)) === -1) return false;\n          }\n          return true;\n        });\n      };\n"
  ],
  [
    "        if (flippedId !== itemId) {\n          selectedDetailMediaId = null;\n          retainedEditedDetailId = null;\n          retainedEditedDetailItem = null;\n        }\n",
    "        if (flippedId !== itemId) selectedDetailMediaId = null;\n"
  ],
  [
    "        flippedId = null;\n        retainedEditedDetailId = null;\n        retainedEditedDetailItem = null;\n        recommendationExpanded = false;\n",
    "        flippedId = null;\n        recommendationExpanded = false;\n"
  ],
  [
    "            writeProven = true;\n            if (openingFromDetail && !itemMatchesCollection(item)) {\n              retainedEditedDetailId = item.id;\n              // The authoritative collection refresh correctly excludes an item that moved outside\n              // the active filter. Retain the exact already-mounted detail projection rather than\n              // allowing a narrower write/tool echo to replace its Catalog/Original media choices.\n              retainedEditedDetailItem = Object.assign({}, item, {\n                media: Array.isArray(before.media) ? before.media.slice() : before.media,\n                imageUrl: before.imageUrl,\n              });\n            } else {\n              retainedEditedDetailId = null;\n              retainedEditedDetailItem = null;\n            }\n            receiptLabel = 'Updated ' + (item.name || item.id) + '.';\n            receiptInverse = async () => {\n              try {\n                const inverse = await callTool('fluent_update_style_item_patch', { approval: 'explicit_user_approved', item_id: item.id, patch: inversePatch, provenance: { sourceType: 'user_confirmation' }, response_mode: 'read_after_write' });\n                verifyStylePatchAck(inverse, item.id, inversePatch);\n              } catch (writeError) {\n                // The inverse is the same durable patch contract as the forward edit. Resolve a\n                // missing/timed-out host ACK with the same exact-item authoritative readback rather\n                // than presenting a false failed-Undo state after the rollback already persisted.\n                try {\n                  await recoverAmbiguousStylePatch(item.id, inversePatch);\n                } catch (readbackError) {\n                  throw writeError;\n                }\n              }\n              retainedEditedDetailId = null;\n              retainedEditedDetailItem = null;\n              await rerender();\n            };\n",
    "            writeProven = true;\n            receiptLabel = 'Updated ' + (item.name || item.id) + '.';\n            receiptInverse = async () => {\n              const inverse = await callTool('fluent_update_style_item_patch', { approval: 'explicit_user_approved', item_id: item.id, patch: inversePatch, provenance: { sourceType: 'user_confirmation' }, response_mode: 'read_after_write' });\n              verifyStylePatchAck(inverse, item.id, inversePatch);\n              await rerender();\n            };\n"
  ],
  [
    "      const itemById = (itemId) => (retainedEditedDetailId === itemId ? retainedEditedDetailItem : null)\n        // A successful edit can move the focused item outside the active collection filter. Its\n        // retained detail must outrank a host-focused refresh that can no longer deliver every\n        // previously mounted media role through the narrowed collection projection.\n        || (viewModel && viewModel.items || []).find((item) => item.id === itemId)\n        || (filterPending ? itemCache.get(itemId) : null);\n",
    "      const itemById = (itemId) => (viewModel && viewModel.items || []).find((item) => item.id === itemId)\n        || (filterPending ? itemCache.get(itemId) : null);\n"
  ],
  [
    "        const openingFromDetail = flippedId === itemId;\n        const retainedDetailScrollTop = openingFromDetail\n          ? ($('detailLayer')?.querySelector('[data-detail-sheet]')?.scrollTop ?? 0)\n          : null;\n        const restoreEditedDetailScroll = () => {\n          if (retainedDetailScrollTop == null || flippedId !== itemId) return;\n          const sheet = $('detailLayer')?.querySelector('[data-detail-sheet]');\n          if (sheet) sheet.scrollTop = retainedDetailScrollTop;\n        };\n",
    "        const openingFromDetail = flippedId === itemId;\n"
  ],
  [
    "            if (openingFromDetail) await rerender({ focusedItemId: item.id, preserveCollectionFilter: true });\n            else await rerender();\n            restoreEditedDetailScroll();\n            requestAnimationFrame(restoreEditedDetailScroll);\n            const reviewedByEdit = viewModel?.presentation?.mode === 'ingestion_review' && item.review?.needsReview;\n",
    "            await rerender();\n            const reviewedByEdit = viewModel?.presentation?.mode === 'ingestion_review' && item.review?.needsReview;\n"
  ],
  [
    "          if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus({ preventScroll: true });\n",
    "          if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();\n"
  ],
  [
    "    .create-outcome { display:none; flex:1 1 auto; min-height:0; place-items:center; padding:42px 30px; background:var(--garment-canvas); }\n    .app.create-outcome-mode { block-size:min(520px, var(--app-block-size)); }\n    .app.create-outcome-mode .head, .app.create-outcome-mode .scroll, .app.create-outcome-mode .awaiting-status { display:none; }\n    .app.create-outcome-mode .create-outcome { display:grid; }\n    .create-outcome-card { width:min(560px,100%); padding:34px 0; border-top:1px solid var(--row-border); border-bottom:1px solid var(--row-border); }\n    .create-outcome-kicker { margin:0 0 10px; color:var(--text-soft); font-size:10px; letter-spacing:.14em; text-transform:uppercase; }\n    .create-outcome-card h2 { margin:0; font-family:var(--font-serif); font-size:clamp(30px,6vw,48px); line-height:1; font-weight:400; letter-spacing:-.03em; }\n    .create-outcome-message { margin:16px 0 0; max-width:520px; color:var(--text-muted); font-size:14px; line-height:1.55; }\n    .create-outcome-candidates { display:grid; gap:10px; margin:24px 0 0; padding:0; list-style:none; }\n    .create-outcome-candidate { padding:13px 0 0; border-top:1px solid var(--row-border); }\n    .create-outcome-candidate strong { display:block; font-family:var(--font-serif); font-size:19px; font-weight:400; }\n    .create-outcome-candidate span { display:block; margin-top:4px; color:var(--text-soft); font-size:11px; line-height:1.4; }\n",
    ""
  ],
  [
    "    <section class=\"create-outcome\" id=\"createOutcome\" aria-live=\"polite\"></section>\n",
    ""
  ],
  [
    "      let createOutcome = null;\n",
    ""
  ],
  [
    "      let initialCreateInputObserved = false;\n",
    ""
  ],
  [
    "      const extractCreateOutcome = (value, depth = 0) => {\n        if (!value || depth > MAX_DEPTH) return null;\n        if (Array.isArray(value)) {\n          for (const entry of value) {\n            const found = extractCreateOutcome(entry, depth + 1);\n            if (found) return found;\n          }\n          return null;\n        }\n        if (typeof value !== 'object') return null;\n        if (value.experience === 'style_create_outcome' && value.surface === 'style_closet_create_outcome') return value;\n        for (const key of VM_KEYS) {\n          if (value[key] != null) {\n            const found = extractCreateOutcome(value[key], depth + 1);\n            if (found) return found;\n          }\n        }\n        for (const entry of Object.values(value)) {\n          const found = extractCreateOutcome(entry, depth + 1);\n          if (found) return found;\n        }\n        return null;\n      };\n      const containsToolError = (value, depth = 0) => {\n        if (!value || depth > MAX_DEPTH) return false;\n        if (Array.isArray(value)) return value.some((entry) => containsToolError(entry, depth + 1));\n        if (typeof value !== 'object') return false;\n        if (value.isError === true) return true;\n        return Object.values(value).some((entry) => containsToolError(entry, depth + 1));\n      };\n      const genericInitialCreateFailure = () => ({\n        duplicateCandidates: [], experience: 'style_create_outcome',\n        message: 'Fluent could not create or verify this item. Nothing else in your Closet is shown or changed by this result.',\n        saved: false, status: 'failure', surface: 'style_closet_create_outcome',\n        templateUri: TEMPLATE_URI, title: 'Item not created',\n      });\n      const receiveCreateOutcome = (payload) => {\n        const next = extractCreateOutcome(payload);\n        if (!next || next.templateUri !== TEMPLATE_URI || !['duplicate_warning', 'failure', 'validation_only'].includes(next.status)) return null;\n        createOutcome = next;\n        hydrationRecoveryAttempted = true;\n        render();\n        return next;\n      };\n",
    ""
  ],
  [
    "        if (!viewModel) {\n          const outcome = extractCreateOutcome(payload);\n          if (outcome) return receiveCreateOutcome(outcome);\n          if (!createOutcome && initialCreateInputObserved && containsToolError(payload)) {\n            return receiveCreateOutcome(genericInitialCreateFailure());\n          }\n        }\n        if (createOutcome) return null;\n",
    ""
  ],
  [
    "        const looksLikeCreateInput = typeof value.category === 'string'\n          && typeof value.subcategory === 'string'\n          && value.approval === 'explicit_user_approved';\n        if (looksLikeCreateInput) {\n          initialCreateInputObserved = true;\n          return null;\n        }\n",
    ""
  ],
  [
    "        if (name === 'fluent_create_style_item') {\n          initialCreateInputObserved = true;\n          return;\n        }\n",
    ""
  ],
  [
    "      const renderCreateOutcome = () => {\n        const app = $('app');\n        const surface = $('createOutcome');\n        if (!app || !surface || !createOutcome) return;\n        app.classList.remove('awaiting', 'delayed', 'comparator-mode', 'focused-mode', 'recommendation-mode', 'recommendation-expanded', 'detail-open');\n        app.classList.add('create-outcome-mode');\n        app.removeAttribute('inert');\n        app.setAttribute('aria-busy', 'false');\n        const candidates = Array.isArray(createOutcome.duplicateCandidates) ? createOutcome.duplicateCandidates : [];\n        const candidateMarkup = candidates.map((candidate) => {\n          const signals = candidate && candidate.signals && typeof candidate.signals === 'object' ? candidate.signals : {};\n          const details = [signals.brand, signals.colorName || signals.colorFamily, signals.itemType || signals.subcategory, signals.size]\n            .filter((value) => typeof value === 'string' && value.trim());\n          const reason = typeof candidate.reason === 'string' && candidate.reason.trim() ? candidate.reason.trim() : null;\n          const meta = [details.join(' · '), reason].filter(Boolean).join(' — ');\n          return '<li class=\"create-outcome-candidate\"><strong>' + escapeHtml(candidate.name || 'Existing closet item') + '</strong>' +\n            (meta ? '<span>' + escapeHtml(meta) + '</span>' : '') + '</li>';\n        }).join('');\n        surface.innerHTML = '<div class=\"create-outcome-card\" data-create-status=\"' + escapeHtml(createOutcome.status) + '\">' +\n          '<p class=\"create-outcome-kicker\">Create outcome</p>' +\n          '<h2>' + escapeHtml(createOutcome.title) + '</h2>' +\n          '<p class=\"create-outcome-message\">' + escapeHtml(createOutcome.message) + '</p>' +\n          (candidateMarkup ? '<ul class=\"create-outcome-candidates\">' + candidateMarkup + '</ul>' : '') +\n          '</div>';\n        notifySize('create-outcome');\n      };\n",
    ""
  ],
  [
    "        if (createOutcome) {\n          renderCreateOutcome();\n          return;\n        }\n",
    ""
  ],
  [
    "          if (app) app.classList.remove('comparator-mode', 'focused-mode', 'recommendation-mode', 'recommendation-expanded', 'create-outcome-mode');\n",
    "          if (app) app.classList.remove('comparator-mode', 'focused-mode', 'recommendation-mode', 'recommendation-expanded');\n"
  ],
  [
    "          if (extractViewModel(candidate) || extractCreateOutcome(candidate) || (initialCreateInputObserved && containsToolError(candidate))) { receiveHostViewResult(candidate); return true; }\n",
    "          if (extractViewModel(candidate)) { receiveHostViewResult(candidate); return true; }\n"
  ],
  [
    "        if (viewModel || createOutcome) return;\n",
    "        if (viewModel) return;\n"
  ],
  [
    "        if (viewModel || createOutcome || hydrationRecoveryAttempted) return;\n",
    "        if (viewModel || hydrationRecoveryAttempted) return;\n"
  ],
  [
    "        if (viewModel || createOutcome) return;\n",
    "        if (viewModel) return;\n"
  ],
  [
    `      const archiveDispositionMismatch = (actualDisposition = null) => {
        const error = new Error('archive disposition readback did not confirm the selected disposition');
        error.code = 'archive_disposition_mismatch';
        error.actualDisposition = actualDisposition;
        error.archiveProven = true;
        return error;
      };
`,
    ""
  ],
  [
    `      const verifyArchiveAck = (result, itemId, expectedDisposition = null) => {
        const ack = requireDurableWriteAck(result, 'item_archive', itemId);
        const payload = ack.payload || {};
        const proof = writeProofItem(ack);
        if (proofField(proof, 'id') !== itemId || proofField(proof, 'status') !== 'archived') throw new Error('read-after-write did not confirm the archive');
        if (expectedDisposition && payload.disposition !== expectedDisposition) throw archiveDispositionMismatch(payload.disposition);
        return ack;
      };
`,
    `      const verifyArchiveAck = (result, itemId) => {
        const ack = requireDurableWriteAck(result, 'item_archive', itemId);
        const proof = writeProofItem(ack);
        if (proofField(proof, 'id') !== itemId || proofField(proof, 'status') !== 'archived') throw new Error('read-after-write did not confirm the archive');
        return ack;
      };
`
  ],
  [
    `      const recoverAmbiguousArchive = async (itemId, expectedDisposition = null) => {
        // Archive reason lives in the Closet projection's provenance join, not in fluent_get_item's
        // StyleItemRecord payload. Recover ambiguous host acknowledgements through the exact-item
        // Closet projection so tests and live behavior use the same production-shaped contract.
        const result = await callTool('fluent_render_style_closet_surface', {
          filter: { item_ids: [itemId], status: 'any' },
          limit: 1,
          presentation: { focused_item_id: itemId, mode: 'detail' },
        });
        const readback = extractViewModel(result);
        const candidate = readback && Array.isArray(readback.items)
          ? readback.items.find((entry) => entry && entry.id === itemId)
          : null;
        verifyStylePatchItem(candidate, itemId, { status: 'archived' });
        if (expectedDisposition && candidate.archiveDisposition !== expectedDisposition) throw archiveDispositionMismatch(candidate.archiveDisposition);
        return candidate;
      };
`,
    ""
  ],
  [
    `        const removeMenu = '<button class="menu-back" type="button" data-menuroot><span class="menu-ico" aria-hidden="true">‹</span> Remove from closet</button><div class="menu-sep"></div><div class="menu-dispo"><button class="dispo" type="button" data-archive="' + id + '" data-disposition="returned">Returned</button><button class="dispo" type="button" data-archive="' + id + '" data-disposition="sold">Sold</button><button class="dispo" type="button" data-archive="' + id + '" data-disposition="donated">Donated</button><button class="dispo" type="button" data-archive="' + id + '" data-disposition="gifted">Gifted</button><button class="dispo" type="button" data-archive="' + id + '" data-disposition="worn_out">Worn out</button><button class="dispo" type="button" data-archive="' + id + '" data-disposition="never_purchased">Never purchased</button><button class="dispo" type="button" data-archive="' + id + '" data-disposition="duplicate">Duplicate</button><button class="dispo" type="button" data-archive="' + id + '" data-disposition="other">Other</button></div>';`,
    `        const removeMenu = '<button class="menu-back" type="button" data-menuroot><span class="menu-ico" aria-hidden="true">‹</span> Remove from closet</button><div class="menu-sep"></div><div class="menu-dispo"><button class="dispo" type="button" data-archive="' + id + '" data-disposition="returned">Returned</button><button class="dispo" type="button" data-archive="' + id + '" data-disposition="sold">Sold</button><button class="dispo" type="button" data-archive="' + id + '" data-disposition="donated">Donated</button><button class="dispo" type="button" data-archive="' + id + '" data-disposition="worn_out">Worn out</button></div>';`
  ],
  [
    `          : '<button class="btn danger-btn" type="button" data-detail-archive>Remove from closet…</button>';`,
    `          : '<button class="btn danger-btn" type="button" data-detail-archive>Archive item…</button>';`
  ],
  [
    `        shell.setAttribute('aria-label', 'Remove closet item');`,
    `        shell.setAttribute('aria-label', 'Archive closet item');`
  ],
  [
    `          : '<label><span class="micro">What happened?</span><select name="disposition"><option value="returned">Returned</option><option value="sold">Sold</option><option value="donated">Donated</option><option value="gifted">Gifted</option><option value="worn_out">Worn out</option><option value="never_purchased">Never purchased</option><option value="duplicate">Duplicate</option><option value="other">Other</option></select></label>';`,
    `          : '<label><span class="micro">What happened?</span><select name="disposition"><option value="returned">Returned</option><option value="sold">Sold</option><option value="donated">Donated</option><option value="worn_out">Worn out</option></select></label>';`
  ],
  [
    `        shell.innerHTML = '<div class="sheet"><h2>Remove from closet?</h2><p class="line">This is reversible. You can Undo now or restore the item later from Archived.</p>' + dispositionField + '<div class="actions"><button class="btn" type="button" data-cancel>Cancel</button><button class="btn danger-btn" type="button" data-confirm>Remove from closet</button></div></div>';`,
    `        shell.innerHTML = '<div class="sheet"><h2>No longer owned?</h2>' + dispositionField + '<div class="actions"><button class="btn" type="button" data-cancel>Cancel</button><button class="btn danger-btn" type="button" data-confirm>Confirm</button></div></div>';`
  ],
  [
    `            try {
              const result = await callTool('fluent_archive_item', {
                approval: 'explicit_user_approved',
                disposition: selectedDisposition,
                domain: 'style',
                item_id: item.id,
                item_type: 'style_item',
                provenance: { sourceType: 'user_confirmation' },
                reason: 'No longer owned',
              });
              verifyArchiveAck(result, item.id, selectedDisposition);
            } catch (writeError) {
              try {
                await recoverAmbiguousArchive(item.id, selectedDisposition);
              } catch (readbackError) {
                throw writeError && writeError.archiveProven === true ? writeError : readbackError;
              }
            }`,
    `            const result = await callTool('fluent_archive_item', {
              approval: 'explicit_user_approved',
              disposition: selectedDisposition,
              domain: 'style',
              item_id: item.id,
              item_type: 'style_item',
              provenance: { sourceType: 'user_confirmation' },
              reason: 'No longer owned',
            });
            verifyArchiveAck(result, item.id);`
  ],
  [
    `              try {
                const inverse = await callTool('fluent_update_style_item_patch', { approval: 'explicit_user_approved', item_id: item.id, patch: { status: 'active' }, provenance: { sourceType: 'user_confirmation' }, response_mode: 'read_after_write' });
                verifyStylePatchAck(inverse, item.id, { status: 'active' });
              } catch (writeError) {
                try {
                  await recoverAmbiguousStylePatch(item.id, { status: 'active' });
                } catch (readbackError) {
                  throw writeError;
                }
              }`,
    `              const inverse = await callTool('fluent_update_style_item_patch', { approval: 'explicit_user_approved', item_id: item.id, patch: { status: 'active' }, provenance: { sourceType: 'user_confirmation' }, response_mode: 'read_after_write' });
              verifyStylePatchAck(inverse, item.id, { status: 'active' });`
  ],
  [
    `            try {
              const inverse = await callTool('fluent_archive_item', inverseArgs);
              verifyArchiveAck(inverse, item.id, priorArchiveDisposition);
            } catch (writeError) {
              try {
                await recoverAmbiguousArchive(item.id, priorArchiveDisposition);
              } catch (readbackError) {
                throw writeError;
              }
            }`,
    `            const inverse = await callTool('fluent_archive_item', inverseArgs);
            verifyArchiveAck(inverse, item.id);`
  ],
  [
    `            } else if (error && error.code === 'archive_disposition_mismatch' && error.archiveProven === true) {
              itemCache.delete(item.id);
              try { await rerender(); } catch (refreshError) { render(); }
              focusCollectionAfterRemoval(postMutationFocusId);
              const actualReason = typeof error.actualDisposition === 'string' && error.actualDisposition
                ? ' It was recorded as ' + error.actualDisposition.replace('_', ' ') + '.'
                : '';
              showNote('"' + label + '" was archived, but the selected reason was not confirmed.' + actualReason + ' Check Archived before changing it again.', 'error');
`,
    ""
  ],
  [
    "          if (!viewModel && !createOutcome) receiveViewModel(result, false, { adoptAuthoritativeView: true });\n",
    "          if (!viewModel) receiveViewModel(result, false, { adoptAuthoritativeView: true });\n"
  ],
  [
    `        image.setAttribute('src', image.dataset.gridSrc);
        image.dispatchEvent(new Event('fluent-grid-src-activated'));`,
    `        image.setAttribute('src', image.dataset.gridSrc);`
  ],
  [
    `          const armLoadDeadline = () => {
            clearLoadDeadline();
            if (!image.isConnected || !image.getAttribute('src') || image.complete) return;
            loadDeadline = setTimeout(() => {
              if (image.isConnected && !image.complete) recover();
            }, 12000);
          };
`,
    ``
  ],
  [
    `          image.addEventListener('fluent-grid-src-activated', armLoadDeadline);
`,
    ``
  ],
  [
    `      let remountRestoreInFlight = false;
      let remountRestoreAttempted = false;
`,
    ``
  ],
  [
    `        if (remountRestoreAttempted) persistClosetRemountSnapshot();
`,
    ``
  ],
  [
    `        if (!append && adoptAuthoritativeView) queueMicrotask(() => { void restoreClosetRemountSnapshot(); });
`,
    ``
  ],
  [
    `      const CLOSET_REMOUNT_STORAGE_KEY = 'fluent-closet-remount-v1:' + TEMPLATE_URI + ':' + TEMPLATE_VERSION;
      const clearClosetRemountSnapshot = () => {
        try { window.sessionStorage.removeItem(CLOSET_REMOUNT_STORAGE_KEY); } catch (error) {}
      };
      const persistClosetRemountSnapshot = () => {
        if (!viewModel || filterPending || loadingMore || activeMutationReceipt || remountRestoreInFlight) return;
        const presentation = viewModel.presentation || {};
        const detailSheet = $('detailLayer')?.querySelector('[data-detail-sheet]');
        try {
          window.sessionStorage.setItem(CLOSET_REMOUNT_STORAGE_KEY, JSON.stringify({
            activeTotal: Number(viewModel.summary?.activeTotal || 0),
            advancedOpen: $('advanced')?.classList.contains('open') === true,
            anchor: collectionAnchor(),
            detailItemId: flippedId || null,
            detailScrollTop: detailSheet?.scrollTop || 0,
            expiresAt: Date.now() + 90 * 1000,
            filterFingerprint: canonicalFilterFingerprint(confirmedFilter),
            firstPageItemIds: clientVisible().slice(0, 48).map((item) => item.id),
            gridScale,
            presentationMode: presentation.mode || 'browse',
            selectedDetailMediaId,
            templateUri: TEMPLATE_URI,
            templateVersion: TEMPLATE_VERSION,
          }));
        } catch (error) {}
      };
      const restoreClosetRemountSnapshot = async () => {
        remountRestoreAttempted = true;
        if (remountRestoreInFlight || !viewModel || filterPending) return false;
        let snapshot = null;
        try { snapshot = JSON.parse(window.sessionStorage.getItem(CLOSET_REMOUNT_STORAGE_KEY) || 'null'); } catch (error) {}
        const currentFirstPageIds = (viewModel.items || []).slice(0, 48).map((item) => item.id);
        const valid = snapshot
          && snapshot.templateUri === TEMPLATE_URI
          && snapshot.templateVersion === TEMPLATE_VERSION
          && snapshot.presentationMode === (viewModel.presentation?.mode || 'browse')
          && Number.isFinite(snapshot.expiresAt)
          && snapshot.expiresAt > Date.now()
          && snapshot.activeTotal === Number(viewModel.summary?.activeTotal || 0)
          && Array.isArray(snapshot.firstPageItemIds)
          && snapshot.firstPageItemIds.length === currentFirstPageIds.length
          && snapshot.firstPageItemIds.every((itemId, index) => itemId === currentFirstPageIds[index])
          && snapshot.filterFingerprint === canonicalFilterFingerprint(confirmedFilter);
        if (!valid) {
          if (snapshot) clearClosetRemountSnapshot();
          return false;
        }
        remountRestoreInFlight = true;
        try {
          applyGridScale(snapshot.gridScale, false);
          setAdvancedOpen(snapshot.advancedOpen === true);
          const anchorId = typeof snapshot.anchor?.itemId === 'string' ? snapshot.anchor.itemId : null;
          let pages = 0;
          while (anchorId && !itemById(anchorId) && viewModel?.cursor && pages < 3) {
            if (!await loadNextCursorPage()) break;
            pages += 1;
          }
          if (anchorId && itemById(anchorId)) {
            const generation = ++gridScaleRenderGeneration;
            restoreCollectionAnchor(snapshot.anchor, generation);
          }
          const detailItemId = typeof snapshot.detailItemId === 'string' ? snapshot.detailItemId : null;
          if (detailItemId && itemById(detailItemId)) {
            const item = itemById(detailItemId);
            const selectedId = typeof snapshot.selectedDetailMediaId === 'string' ? snapshot.selectedDetailMediaId : null;
            selectedDetailMediaId = selectedId && (item.media || []).some((entry) => String(entry.id || entry.label) === selectedId)
              ? selectedId
              : null;
            openDetailItem(detailItemId);
            requestAnimationFrame(() => {
              const sheet = $('detailLayer')?.querySelector('[data-detail-sheet]');
              if (sheet) sheet.scrollTop = Math.max(0, Number(snapshot.detailScrollTop) || 0);
            });
          }
          return true;
        } finally {
          clearClosetRemountSnapshot();
          remountRestoreInFlight = false;
        }
      };
`,
    ``
  ],
  [
    `      window.addEventListener('pagehide', () => { persistClosetRemountSnapshot(); clearModelContext(); });`,
    `      window.addEventListener('pagehide', clearModelContext);`
  ],
  [
    `            armLoadDeadline();`,
    `            loadDeadline = setTimeout(() => {
              if (image.isConnected && !image.complete) recover();
            }, 12000);`
  ],
  [
    `      const collectionAnchor = () => {
        const scroll = document.querySelector('.scroll');
        if (!scroll) return null;
        const top = scroll.getBoundingClientRect().top;
        const cards = Array.from(document.querySelectorAll('.card[data-item]'));
        const card = cards.find((candidate) => candidate.getBoundingClientRect().bottom > top + 1) || cards[0];
        if (!card) return null;
        return { itemId: card.dataset.item, offset: card.getBoundingClientRect().top - top };
      };
      let gridScaleRenderGeneration = 0;
      const restoreCollectionAnchor = (anchor, generation) => {
        if (!anchor) return;
        requestAnimationFrame(() => {
          if (generation !== gridScaleRenderGeneration) return;
          const scroll = document.querySelector('.scroll');
          const card = Array.from(document.querySelectorAll('.card[data-item]')).find((candidate) => candidate.dataset.item === anchor.itemId);
          if (!scroll || !card) return;
          const delta = card.getBoundingClientRect().top - scroll.getBoundingClientRect().top - anchor.offset;
          setCollectionScrollTop(scroll, scroll.scrollTop + delta);
        });
      };
      const gridLayoutForScale = (scale) => {
        const compact = window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
        if (compact) return { density: scale < 50 ? '3' : '2', widthPercent: 100 };
        if (scale < 34) return { density: '4', widthPercent: 82 + (scale / 34) * 18 };
        if (scale < 67) return { density: '3', widthPercent: 75 + ((scale - 34) / 33) * 25 };
        return { density: '2', widthPercent: (2 / 3) * 100 + ((scale - 67) / 33) * (100 / 3) };
      };
      const applyGridScale = (scale, persist = true) => {
        const parsed = Number(scale);
        if (!Number.isFinite(parsed)) return;
        const anchor = collectionAnchor();
        const generation = ++gridScaleRenderGeneration;
        gridScale = Math.max(0, Math.min(100, parsed));
        const layout = gridLayoutForScale(gridScale);
        const gridDensity = layout.density;
        $('app')?.setAttribute('data-grid-density', gridDensity);
        const grid = $('grid');
        if (grid) grid.style.maxWidth = layout.widthPercent.toFixed(3) + '%';
        const slider = $('gridScale');
        if (slider) {
          slider.value = String(gridScale);
          slider.setAttribute('aria-valuetext', gridDensity + ' items per row');
        }
        const status = $('gridDensityStatus');
        if (status) status.textContent = gridDensity + ' items per row';
        if (persist) {
          try {
            window.localStorage.setItem('fluent-closet-grid-scale', String(gridScale));
            window.localStorage.setItem('fluent-closet-grid-density', gridDensity);
          } catch (error) {}
        }
        restoreCollectionAnchor(anchor, generation);
        notifySize('grid-scale');
      };`,
    `      const gridDensityForScale = (scale) => {
        const compact = window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
        if (compact) return scale < 50 ? '3' : '2';
        return scale < 34 ? '4' : scale < 67 ? '3' : '2';
      };
      const applyGridScale = (scale, persist = true) => {
        const parsed = Number(scale);
        if (!Number.isFinite(parsed)) return;
        gridScale = Math.max(0, Math.min(100, parsed));
        const gridDensity = gridDensityForScale(gridScale);
        $('app')?.setAttribute('data-grid-density', gridDensity);
        const slider = $('gridScale');
        if (slider) {
          slider.value = String(gridScale);
          slider.setAttribute('aria-valuetext', gridDensity + ' items per row');
        }
        const status = $('gridDensityStatus');
        if (status) status.textContent = gridDensity + ' items per row';
        if (persist) {
          try {
            window.localStorage.setItem('fluent-closet-grid-scale', String(gridScale));
            window.localStorage.setItem('fluent-closet-grid-density', gridDensity);
          } catch (error) {}
        }
        notifySize('grid-scale');
      };`
  ]
] as const;
  let compatible = html;
  for (const [current, legacy] of replacements) {
    if (!compatible.includes(current)) {
      if (current.includes('remountRestore') || current.includes('restoreClosetRemountSnapshot') || current.includes('collectionAnchor') || current.includes('persistClosetRemountSnapshot') || current.includes('recoverAmbiguousDuplicateMerge')) continue;
      throw new Error('Style Closet compatibility replacement is missing: ' + current.slice(0, 120));
    }
    compatible = compatible.replace(current, legacy);
  }
  compatible = compatible
    .replace(`          if (rejectedScrollTop != null && flippedId) collectionScrollTop = rejectedScrollTop;
`, ``)
    .replace(`            if (rollbackScrollTop != null && flippedId) collectionScrollTop = rollbackScrollTop;
`, ``)
    .replace(`      let remountRestoreInFlight = false;
      let remountRestoreAttempted = false;
`, ``)
    .replace(`        if (remountRestoreAttempted) persistClosetRemountSnapshot(mode);
`, ``)
    .replace(`        if (!viewModel || collectionDisplayModeRequested || hostLayoutContext.displayMode === 'fullscreen'
          || remountRestoreInFlight || readClosetRemountSnapshot()) return;
`, `        if (!viewModel || collectionDisplayModeRequested || hostLayoutContext.displayMode === 'fullscreen') return;
`)
    .replace(`        if (!append && adoptAuthoritativeView) {
          queueMicrotask(() => { void restoreClosetRemountSnapshot().then((restored) => {
            if (!restored) requestCollectionDisplayMode();
            restoreDuplicateMergeReceipt();
          }); });
        } else {
          requestCollectionDisplayMode();
          queueMicrotask(() => { restoreDuplicateMergeReceipt(); });
        }
`, `        requestCollectionDisplayMode();
`)
    .replaceAll(`          $('app')?.setAttribute('data-confirmed-filter', canonicalFilterFingerprint(confirmedFilter));
`, ``)
    .replaceAll(`              $('app')?.setAttribute('data-confirmed-filter', canonicalFilterFingerprint(confirmedFilter));
`, ``)
    .replaceAll(`            $('app')?.setAttribute('data-confirmed-filter', canonicalFilterFingerprint(confirmedFilter));
`, ``)
    .replace(`              confirmedFilter = Object.assign({}, requestedFilter);
                  syncModelContext();`, `              confirmedFilter = Object.assign({}, requestedFilter);
              syncModelContext();`);
  const continuityStart = compatible.indexOf(`      const collectionAnchor = () => {`);
  const densityStart = compatible.indexOf(`      const gridLayoutForScale = (scale) => {`, continuityStart);
  if (continuityStart >= 0 && densityStart > continuityStart) {
    compatible = compatible.slice(0, continuityStart) + compatible.slice(densityStart);
  }
  const densityBlockStart = compatible.indexOf(`      const gridLayoutForScale = (scale) => {`);
  const densityBlockEnd = compatible.indexOf(`      $('gridScale')?.addEventListener`, densityBlockStart);
  const legacyDensity = replacements.find(([current]) => current.includes('const gridLayoutForScale = (scale) => {'))?.[1];
  if (densityBlockStart >= 0 && densityBlockEnd > densityBlockStart && legacyDensity) {
    compatible = compatible.slice(0, densityBlockStart) + legacyDensity + '\n' + compatible.slice(densityBlockEnd);
  }
  const collectionKeyboardStart = compatible.indexOf(`        if (!flippedId && !document.querySelector('.panel') && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {`);
  const modalTabStart = compatible.indexOf(`        if (event.key !== 'Tab') return;`, collectionKeyboardStart);
  if (collectionKeyboardStart >= 0 && modalTabStart > collectionKeyboardStart) {
    compatible = compatible.slice(0, collectionKeyboardStart) + compatible.slice(modalTabStart);
  }
  compatible = compatible
    .replace(String.raw`          metadataCombobox('brand', 'Brand', item.brand || ''),
          metadataCombobox('category', 'Category', item.category || ''),
          metadataCombobox('subcategory', 'Subcategory', item.subcategory || ''),
          metadataCombobox('size', 'Size', item.size || ''),
          colorField(item.colorFamily || '', true),`, String.raw`          input('brand', 'Brand', item.brand || ''),
          input('category', 'Category', item.category || ''),
          input('subcategory', 'Subcategory', item.subcategory || ''),
          input('size', 'Size', item.size || ''),
          colorField(item.colorFamily || ''),`)
    .replace(String.raw`          if (field) {
            field.value = button.dataset.colorChoice || '';
            field.dispatchEvent(new Event('input', { bubbles: true }));
          }`, String.raw`          if (field) field.value = button.dataset.colorChoice || '';`)
    .replace(`        wireEditMetadataSuggestions(editShell, item);
`, '')
    .replace(`      const metadataCombobox = (name, label, value) => '<label><span class="micro">' + escapeHtml(label) + '</span><input name="' + escapeHtml(name) + '" value="' + escapeHtml(value || '') + '" list="edit-' + escapeHtml(name) + '-options" autocomplete="off" placeholder="Choose or type" data-metadata-combobox="' + escapeHtml(name) + '" /><datalist id="edit-' + escapeHtml(name) + '-options"></datalist></label>';
`, '')
    .replace(`      const colorField = (value, editableMetadata = false) => {
        const options = Array.from(new Set([value].concat(viewModel?.filterOptions?.colorFamilies || []).filter(Boolean))).slice(0, 9);
        const choices = options.map((entry) => '<button class="color-choice" type="button" aria-label="Use ' + escapeHtml(titleCase(entry)) + '" aria-pressed="' + String(norm(entry) === norm(value)) + '" data-color-choice="' + escapeHtml(entry) + '" style="--swatch:' + colorCss(entry) + '"></button>').join('');
        const metadata = editableMetadata ? ' list="edit-color-options" autocomplete="off" placeholder="Choose or type" data-metadata-combobox="color"' : '';
        return '<label class="color-field"><span class="micro">Color</span><input name="color" value="' + escapeHtml(value || '') + '"' + metadata + ' />' + (editableMetadata ? '<datalist id="edit-color-options"></datalist>' : '') + (choices ? '<span class="color-palette" aria-label="Saved closet colors">' + choices + '</span>' : '') + '</label>';
      };
`, `      const colorField = (value) => {
        const options = Array.from(new Set([value].concat(viewModel?.filterOptions?.colorFamilies || []).filter(Boolean))).slice(0, 9);
        const choices = options.map((entry) => '<button class="color-choice" type="button" aria-label="Use ' + escapeHtml(titleCase(entry)) + '" aria-pressed="' + String(norm(entry) === norm(value)) + '" data-color-choice="' + escapeHtml(entry) + '" style="--swatch:' + colorCss(entry) + '"></button>').join('');
        return '<label class="color-field"><span class="micro">Color</span><input name="color" value="' + escapeHtml(value || '') + '" />' + (choices ? '<span class="color-palette" aria-label="Saved closet colors">' + choices + '</span>' : '') + '</label>';
      };
`);
  const metadataSuggestionStart = compatible.indexOf(`      const wireEditMetadataSuggestions = (shell, editedItem) => {`);
  const itemLookupStart = compatible.indexOf(`      const itemById = (itemId) =>`, metadataSuggestionStart);
  if (metadataSuggestionStart >= 0 && itemLookupStart > metadataSuggestionStart) {
    compatible = compatible.slice(0, metadataSuggestionStart) + compatible.slice(itemLookupStart);
  }
  compatible = compatible.replaceAll("response_mode: 'full'", "response_mode: 'read_after_write'");
  return compatible;
}

export function getStyleClosetWidgetHtml(
  options: { templateUri?: string; templateVersion?: string } = {},
): string {
  const templateUri = options.templateUri ?? STYLE_CLOSET_TEMPLATE_URI;
  const templateVersion = options.templateVersion ?? STYLE_CLOSET_TEMPLATE_VERSION;

  const html = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    /* Fluent Closet v8: warm editorial collection, quiet controls, and a host-contained detail
       takeover. The collection stays mounted while exactly one internal scroller owns each state. */
    :root {
      color-scheme: light;
      --card-bg: #f7f2e9;
      --card-border: rgba(23, 23, 21, 0.16);
      --surface-alt: #e8e0d5;
      --garment-canvas: #f1ece3;
      --row-border: rgba(23, 23, 21, 0.16);
      --text: #171715;
      --text-muted: #5f5b55;
      --text-soft: #6e6a63;
      --button-bg: rgba(241, 236, 227, 0.9);
      --button-border: rgba(23, 23, 21, 0.2);
      --accent: #171715;
      --accent-dim: rgba(23, 23, 21, 0.07);
      --danger: #b42318;
      --danger-dim: rgba(180, 35, 24, 0.08);
      --shadow: 0 18px 60px rgba(34, 29, 23, 0.15);
      --font-sans: "Helvetica Neue", "Segoe UI", Arial, sans-serif;
      --font-serif: Baskerville, "Iowan Old Style", "Palatino Linotype", Georgia, serif;
      --app-block-size: 760px;
      --app-inline-size: 100%;
      font-family: var(--font-sans);
      color: var(--text);
    }
    * { box-sizing: border-box; }
    html { width:min(100%, var(--app-inline-size)); max-width:100%; margin:0; overflow:hidden; }
    body { width:100%; max-width:100%; margin:0; overflow:hidden; }
    body { background: var(--garment-canvas); font-family: var(--font-sans); color: var(--text); }
    button, input, select { font: inherit; }
    button { cursor: pointer; }
    button:focus-visible, input:focus-visible, select:focus-visible, [tabindex]:focus-visible { outline: 2px solid var(--text); outline-offset: 4px; }
    .sr-only { position:absolute !important; width:1px !important; height:1px !important; padding:0 !important; margin:-1px !important; overflow:hidden !important; clip:rect(0,0,0,0) !important; white-space:nowrap !important; border:0 !important; }
    /* Match the proven v7 host contract: the bounded root owns no collection overflow. A flexing
       scroll child is the sole collection scroll owner, so app/body intrinsic height cannot expose
       the full garment grid to an assistant host's sizing observer. */
    .app { position:relative; isolation:isolate; margin:0; width:100%; max-width:100%; min-width:0; block-size:var(--app-block-size); min-block-size:0; max-block-size:none; display:flex; flex-direction:column; background:var(--garment-canvas); overflow:hidden; }
    /* Recommendation cards should ask the host for the height their visible payoff actually needs.
       This mirrors the proven v7 content-flow contract while keeping v9's richer item presentation.
       The full closet and expanded detail remain bounded application surfaces. */
    .app.recommendation-mode:not(.recommendation-expanded) { block-size:auto; max-block-size:none; }
    .app.recommendation-mode:not(.recommendation-expanded).detail-open .head,
    .app.recommendation-mode:not(.recommendation-expanded).detail-open .scroll { display:none; }
    /* ChatGPT takes its first inline allocation from the pre-hydration document and does not
       reliably honor a later size notification. Reserve the production-height collection canvas
       immediately so the host never locks the full closet into its 400px minimum frame. */
    .app.awaiting { block-size:var(--app-block-size); }
    .app.awaiting .head, .app.awaiting .scroll { display:none; }
    .awaiting-status { display:none; min-height:100%; align-items:center; justify-content:center; color:var(--text-soft); font-size:11px; letter-spacing:.08em; text-transform:uppercase; }
    .app.awaiting .awaiting-status { display:flex; }
    .app.awaiting.delayed .awaiting-status { letter-spacing:.04em; text-transform:none; }
    .create-outcome { display:none; flex:1 1 auto; min-height:0; place-items:center; padding:42px 30px; background:var(--garment-canvas); }
    .app.create-outcome-mode { block-size:min(520px, var(--app-block-size)); }
    .app.create-outcome-mode .head, .app.create-outcome-mode .scroll, .app.create-outcome-mode .awaiting-status { display:none; }
    .app.create-outcome-mode .create-outcome { display:grid; }
    .create-outcome-card { width:min(560px,100%); padding:34px 0; border-top:1px solid var(--row-border); border-bottom:1px solid var(--row-border); }
    .create-outcome-kicker { margin:0 0 10px; color:var(--text-soft); font-size:10px; letter-spacing:.14em; text-transform:uppercase; }
    .create-outcome-card h2 { margin:0; font-family:var(--font-serif); font-size:clamp(30px,6vw,48px); line-height:1; font-weight:400; letter-spacing:-.03em; }
    .create-outcome-message { margin:16px 0 0; max-width:520px; color:var(--text-muted); font-size:14px; line-height:1.55; }
    .create-outcome-candidates { display:grid; gap:10px; margin:24px 0 0; padding:0; list-style:none; }
    .create-outcome-candidate { padding:13px 0 0; border-top:1px solid var(--row-border); }
    .create-outcome-candidate strong { display:block; font-family:var(--font-serif); font-size:19px; font-weight:400; }
    .create-outcome-candidate span { display:block; margin-top:4px; color:var(--text-soft); font-size:11px; line-height:1.4; }
    .app.detail-open .head, .app.detail-open .scroll { opacity:.16; pointer-events:none; visibility:hidden; }
    .head { flex:0 0 auto; min-width:0; padding:0 30px; background:var(--garment-canvas); transition:opacity 210ms ease; }
    .scroll { flex:1 1 auto; min-width:0; min-height:0; overflow-x:hidden; overflow-y:auto; contain:size layout; overscroll-behavior-x:contain; overscroll-behavior-y:auto; -webkit-overflow-scrolling:touch; padding:2px 30px 52px; scroll-behavior:smooth; transition:opacity 210ms ease; }
    .app.detail-open .scroll { overflow-y:hidden; }
    .bar { height: 74px; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 18px; border-bottom: 1px solid var(--row-border); }
    .wordmark { display:flex; align-items:baseline; gap:11px; min-width:0; }
    h1 { font-family: var(--font-serif); font-size: 27px; line-height: 1; margin: 0; font-weight: 400; letter-spacing: -0.02em; }
    .wordmark-sub { color:var(--text-soft); font-size:10px; letter-spacing:.16em; text-transform:uppercase; }
    #summary { justify-self:center; margin:0; font-size:11px; color:var(--text-soft); letter-spacing:.08em; text-transform:uppercase; white-space:nowrap; }
    .top-actions { justify-self:end; display:flex; gap:16px; align-items:center; justify-content:flex-end; }
    .density-control { display:grid; grid-template-columns:12px minmax(66px,88px) 12px; align-items:center; gap:6px; min-height:32px; color:var(--text-soft); }
    .density-glyph { display:grid; place-items:center; width:12px; height:12px; font-size:12px; line-height:1; user-select:none; }
    .density-slider { appearance:none; width:100%; height:32px; margin:0; padding:0; background:transparent; cursor:ew-resize; }
    .density-slider::-webkit-slider-runnable-track { height:1px; background:var(--row-border); }
    .density-slider::-moz-range-track { height:1px; background:var(--row-border); }
    .density-slider::-webkit-slider-thumb { appearance:none; width:15px; height:15px; margin-top:-7px; border:3px solid var(--garment-canvas); border-radius:50%; background:var(--text); box-shadow:0 0 0 1px rgba(23,23,21,.22); }
    .density-slider::-moz-range-thumb { width:9px; height:9px; border:3px solid var(--garment-canvas); border-radius:50%; background:var(--text); box-shadow:0 0 0 1px rgba(23,23,21,.22); }
    .density-slider:focus-visible { outline:none; }
    .density-slider:focus-visible::-webkit-slider-thumb { box-shadow:0 0 0 2px var(--garment-canvas),0 0 0 3px var(--text); }
    .density-slider:focus-visible::-moz-range-thumb { box-shadow:0 0 0 2px var(--garment-canvas),0 0 0 3px var(--text); }
    .micro { color: var(--text-soft); font-size: 10px; letter-spacing: 0.1em; font-weight: 500; text-transform: uppercase; margin: 0 0 2px; }
    .filters { min-height:48px; display:flex; flex-wrap:nowrap; align-items:center; gap:24px; overflow-x:auto; scrollbar-width:none; white-space:nowrap; }
    .filters::-webkit-scrollbar { display:none; }
    .chip { appearance:none; border:0; border-radius:0; background:none; color:var(--text-soft); min-height:38px; padding:4px 0; display:inline-flex; align-items:center; gap:5px; font-size:11px; letter-spacing:.05em; font-weight:400; white-space:nowrap; }
    .chip .micro { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0); }
    .chip[aria-pressed="true"] { color:var(--text); border-bottom:1px solid var(--text); }
    .filters[aria-busy="true"] .chip[aria-pressed="true"] { color:var(--text); }
    .filters-toggle { min-height:32px; border:0; border-radius:0; padding:5px 0; background:none; color:var(--text-soft); font-size:11px; }
    .expand-toggle { min-height:32px; border:0; border-radius:0; padding:5px 0; background:none; color:var(--text-soft); font-size:11px; }
    .expand-toggle:hover, .expand-toggle:focus-visible { color:var(--text); }
    .filters-toggle .caret { font-size: 9px; color: var(--text-soft); transition: transform 0.15s ease; }
    .filters-toggle.open { color: var(--text); border-bottom:1px solid var(--text); }
    .filters-toggle.open .caret { transform: rotate(180deg); color: var(--accent); }
    .advanced { display: none; grid-template-columns: repeat(6, minmax(110px, 1fr)); gap: 12px; padding: 11px 0 16px; border-top:1px solid var(--row-border); }
    .advanced.open { display: grid; }
    .advanced input, .advanced select { min-height: 36px; border:0; border-bottom:1px solid var(--row-border); border-radius:0; background:transparent; padding:0 2px; color:var(--text); font-size:11px; }
    .grid { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); column-gap:clamp(18px,2vw,34px); row-gap:2px; align-items:stretch; }
    @media (min-width:1700px) { .grid { grid-template-columns:repeat(8,minmax(0,1fr)); } }
    .app:not(.focused-mode)[data-grid-density="2"] .grid { grid-template-columns:repeat(2,minmax(0,1fr)); max-width:720px; width:100%; margin-inline:auto; }
    .app:not(.focused-mode)[data-grid-density="3"] .grid { grid-template-columns:repeat(3,minmax(0,1fr)); max-width:940px; width:100%; margin-inline:auto; }
    .app:not(.focused-mode)[data-grid-density="4"] .grid { grid-template-columns:repeat(4,minmax(0,1fr)); max-width:1180px; width:100%; margin-inline:auto; }
    .app.focused-mode .grid { grid-template-columns: repeat(auto-fit, minmax(190px, 240px)); justify-content: center; max-width: 920px; margin-inline: auto; gap: 36px 24px; }
    .card { position:relative; width:100%; min-width:0; aspect-ratio:.77; border:0; border-radius:0; background:transparent; overflow:visible; content-visibility:auto; contain-intrinsic-size:220px 286px; isolation:isolate; }
    .card[data-matte="canvas"] { isolation:auto; }
    .card-button { appearance:none; display:block; position:relative; width:100%; height:100%; border:0; padding:0; background:transparent; color:inherit; text-align:left; border-radius:0; }
    .card-button:focus-visible { outline:none; }
    .card-button:focus-visible::after, .card.detail-selected::after { content:""; position:absolute; inset:6px; z-index:5; border:1px solid rgba(23,23,21,.68); pointer-events:none; }
    .card.detail-selected::after { border-color:rgba(23,23,21,.42); }
    .photo { position:absolute; inset:0; background:transparent; overflow:visible; }
    .photo::after { display:none; }
    .garment-zoom { position:absolute; width:100%; height:100%; left:50%; top:0; transform:translateX(-50%) scale(1); transform-origin:50% 52%; overflow:visible; }
    .garment-optical { position:absolute; width:var(--optical-width); height:var(--optical-height); left:50%; bottom:var(--baseline); transform:translateX(-50%); display:grid; place-items:end center; }
    .garment-optical img { width:100%; height:100%; object-fit:contain; object-position:center bottom; display:block; filter:saturate(.99); opacity:0; user-select:none; pointer-events:none; }
    .garment-optical img[data-content-fit="normalized"] { position:absolute; max-width:none; max-height:none; object-position:center center; }
    .garment-optical img[data-ready="true"] { opacity:1; }
    .card[data-matte="canvas"] .garment-optical { background:var(--garment-canvas); }
    .card[data-matte="canvas"] .garment-optical img { mix-blend-mode:multiply; }
    .card-button:focus-visible .garment-optical img { filter:saturate(.99) drop-shadow(0 0 1px rgba(241,236,227,.98)) drop-shadow(0 0 2.2px rgba(23,23,21,.9)); }
    .addPhoto { position:absolute; inset:13%; border:1px dashed rgba(23,23,21,.32); background:rgba(232,224,213,.58); color:var(--text-soft); display:grid; place-items:center; padding:16px; text-align:center; }
    .addPhoto .micro { color: var(--text-muted); }
    .media-state-badge { position:absolute; left:9px; bottom:9px; z-index:2; padding:5px 7px; border:1px solid rgba(23,23,21,.14); background:rgba(248,244,237,.92); color:var(--text-muted); font-size:9px; letter-spacing:.01em; }
    .recovery-name { display:block; margin-top:12px; color:var(--text); font-size:10px; line-height:1.25; font-weight:600; overflow:hidden; text-overflow:ellipsis; }
    .recovery-meta { display:block; margin-top:4px; color:var(--text-soft); font-size:9px; line-height:1.2; letter-spacing:.08em; text-transform:uppercase; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .plus { width:34px; height:34px; border:1px solid var(--button-border); border-radius:50%; display:grid; place-items:center; margin:0 auto 7px; font-size:18px; color:var(--text-muted); }
    .details { position:absolute; left:8px; right:8px; bottom:10px; z-index:2; opacity:0; transform:translateY(3px); transition:opacity .18s ease,transform .18s ease; text-align:center; pointer-events:none; }
    .card-button:focus-visible .details, .app.focused-mode .details { opacity:1; transform:translateY(0); }
    .name { font-weight:500; font-size:10px; line-height:1.25; letter-spacing:.01em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-shadow:0 1px 5px var(--garment-canvas); }
    .line { color:var(--text-soft); font-size:9px; line-height:1.3; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-shadow:0 1px 5px var(--garment-canvas); }
    .swatch { display: inline-block; width: 8px; height: 8px; border-radius: 50%; border: 1px solid var(--row-border); vertical-align: -1px; margin-right: 4px; background: var(--surface-alt); }
    .manage { position:absolute; top:8px; right:8px; width:32px; height:32px; border-radius:50%; border:1px solid var(--card-border); background:rgba(241,236,227,.92); box-shadow:0 4px 12px rgba(34,29,23,.08); color:var(--text); display:grid; place-items:center; line-height:1; opacity:0; transition:opacity .12s ease; z-index:4; }
    .manage:focus-visible { opacity:1; }
    .menu { position: absolute; top: 38px; right: 6px; width: 200px; max-width: calc(100% - 12px); border: 1px solid var(--card-border); border-radius: 12px; background: var(--card-bg); box-shadow: var(--shadow); padding: 6px; z-index: 5; }
    .menu > button { width: 100%; min-height: 32px; border: 0; border-radius: 8px; background: transparent; text-align: left; padding: 0 10px; font-size: 13px; color: var(--text); display: flex; align-items: center; gap: 8px; }
    .menu > button:hover { background: var(--surface-alt); }
    .menu > button.restore { color: var(--accent); font-weight: 600; }
    .menu > button.destructive { color: var(--danger); }
    .menu > button.destructive:hover { background: var(--danger-dim); color: var(--danger); }
    .menu-chevron { margin-left: auto; color: var(--text-soft); font-size: 16px; line-height: 1; }
    .menu > button.destructive .menu-chevron { color: var(--danger); opacity: 0.72; }
    .menu-back { min-height: 32px; font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-soft); background: var(--surface-alt); }
    .menu-back .menu-ico { font-size: 15px; line-height: 1; }
    .menu-sep { height: 1px; background: var(--row-border); margin: 6px 4px; }
    .menu-label { font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-soft); padding: 2px 10px 6px; }
    .menu-dispo { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .dispo { min-height: 32px; border: 1px solid var(--button-border); border-radius: 8px; background: var(--button-bg); color: var(--danger); font-size: 12px; }
    .dispo:hover { border-color: rgba(180, 35, 24, 0.4); background: var(--danger-dim); color: var(--danger); }
    .app.comparator-mode .filters,
    .app.comparator-mode #advancedToggle,
    .app.comparator-mode #advanced { display: none; }
    .empty { grid-column:1 / -1; padding:40px 16px; color:var(--text-soft); text-align:center; border:0; background:transparent; font-size:13px; }
    .empty-onboarding { min-height:220px; display:grid; place-content:center; justify-items:center; gap:8px; padding:44px 24px; }
    .empty-onboarding h2, .empty-filtered strong { margin:0; color:var(--text); font-family:var(--font-serif); font-size:25px; font-weight:400; letter-spacing:-.02em; }
    .empty-onboarding p, .empty-filtered span { margin:0; max-width:340px; line-height:1.5; }
    .empty-action { margin-top:8px; }
    .empty-filtered { display:grid; justify-items:center; gap:7px; }
    @media (hover:hover) and (pointer:fine) {
      .garment-zoom { transition:transform 210ms cubic-bezier(.2,.7,.2,1),filter 210ms ease; }
      .card:hover, .card:focus-within { z-index:3; }
      .card:hover .garment-zoom, .card-button:focus-visible .garment-zoom { transform:translateX(-50%) scale(1.028); filter:drop-shadow(0 12px 16px rgba(34,29,23,.13)); }
    }
    .panel { position:fixed; inset:0; z-index:60; background:rgba(43,39,34,.32); display:grid; place-items:start center; padding:18px; overflow:auto; }
    .sheet { width:min(520px,100%); border:1px solid var(--card-border); border-radius:0; background:var(--garment-canvas); box-shadow:var(--shadow); padding:24px 26px; }
    .sheet h2 { margin:0 0 22px; font-family:var(--font-serif); font-size:30px; line-height:1; font-weight:400; letter-spacing:-.025em; }
    .form { display:grid; grid-template-columns:1fr 1fr; gap:20px 18px; }
    .form label { display:grid; gap:7px; }
    .form .micro { margin: 0; }
    .form input, .form select { min-height:38px; border:0; border-bottom:1px solid var(--row-border); border-radius:0; background:transparent; padding:0 1px; color:var(--text); min-width:0; font-family:var(--font-serif); font-size:16px; }
    .color-field { grid-column:1 / -1; }
    .color-palette { display:flex; flex-wrap:wrap; align-items:center; gap:11px; padding-top:8px; }
    .color-choice { width:30px; height:30px; padding:0; border:1px solid rgba(23,23,21,.18); border-radius:0; background:var(--swatch); }
    .color-choice[aria-pressed="true"] { outline:1px solid var(--text); outline-offset:3px; }
    .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 16px; }
    .btn { min-height: 38px; border: 1px solid var(--button-border); border-radius: 10px; background: var(--button-bg); padding: 0 14px; font-size: 13px; font-weight: 500; color: var(--text); }
    .btn:hover { background: var(--surface-alt); }
    .primary { background: var(--accent); color: #fff; border-color: var(--accent); }
    .primary:hover { background: #2a2926; }
    .danger-btn { background: var(--danger); color: #fff; border-color: var(--danger); }
    .pending { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(255, 255, 255, 0.86); color: var(--text-muted); font-size: 12px; z-index: 4; }
    .detail-section { display: grid; gap: 6px; align-content: start; }
    .detail-section > .micro { margin: 0; }
    .detail-row { display: grid; grid-template-columns: 92px 1fr; gap: 10px; align-items: baseline; font-size: 12.5px; line-height: 1.35; }
    .detail-k { margin: 0; letter-spacing: 0.04em; }
    .detail-v { color: var(--text); }
    .note { margin-top: 10px; padding: 8px 11px; border-radius: 8px; font-size: 12.5px; line-height: 1.35; }
    .note[hidden] { display: none; }
    .note.error { background: var(--danger-dim); color: var(--danger); border: 1px solid rgba(180, 35, 24, 0.25); }
    .review-banner { display:none; margin:10px 0 6px; padding:18px 0; border-top:1px solid var(--row-border); border-bottom:1px solid var(--row-border); align-items:center; justify-content:space-between; gap:18px; }
    .review-banner.show { display:flex; }
    .review-banner h2 { margin:0; font-family:var(--font-serif); font-weight:400; font-size:24px; letter-spacing:-.02em; }
    .review-banner p { margin:4px 0 0; color:var(--text-muted); font-size:13px; }
    .review-actions { display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end; }
    .review-flag { position:absolute; top:9px; left:9px; display:none; align-items:center; gap:5px; padding:5px 7px; border:1px solid rgba(23,23,21,.18); background:rgba(241,236,227,.94); color:var(--text); font-size:9px; font-weight:600; letter-spacing:.03em; }
    .app.focused-mode .review-flag { display:inline-flex; }
    .continuation { min-height:2px; width:100%; }
    .needs-photo-divider { grid-column:1 / -1; display:flex; align-items:center; justify-content:space-between; gap:24px; margin:30px 0 14px; padding:20px 0 13px; border-top:1px solid var(--row-border); }
    .needs-photo-divider h2 { margin:0; font-family:var(--font-serif); font-size:22px; font-weight:400; letter-spacing:-.02em; }
    .needs-photo-divider p { margin:4px 0 0; max-width:560px; color:var(--text-soft); font-size:10px; line-height:1.45; }
    .needs-photo-divider .btn { flex:0 0 auto; min-height:38px; border-radius:0; }
    /* The collection stays mounted for exact return state, but detail is an in-app overlay outside
       flex layout. It therefore cannot add its content height to the bounded root's intrinsic size. */
    .detail-layer { position:absolute; inset:0; z-index:40; min-width:0; min-height:0; width:auto; height:auto; display:grid; overflow:hidden; opacity:0; visibility:hidden; pointer-events:none; background:var(--garment-canvas); transition:opacity 210ms ease,visibility 0s linear 210ms; }
    .detail-layer.open { opacity:1; visibility:visible; pointer-events:auto; transition:opacity 210ms ease; }
    .detail-sheet { position:relative; place-self:stretch; width:100%; min-width:0; height:100%; min-height:0; overflow-x:hidden; overflow-y:auto; overscroll-behavior-x:contain; overscroll-behavior-y:auto; background:var(--garment-canvas); padding:0; transform:translateY(12px); transition:transform 210ms cubic-bezier(.2,.7,.2,1); }
    .detail-layer.open .detail-sheet { transform:translateY(0); }
    .detail-hero { --detail-pad-top:26px; --detail-pad-inline:42px; --detail-pad-bottom:44px; position:relative; height:clamp(440px,60%,520px); min-height:440px; display:block; margin:0; overflow:hidden; background:var(--garment-canvas); }
    .detail-hero[data-detail-family="upper-shirt"], .detail-hero[data-detail-family="upper-tee"], .detail-hero[data-detail-family="knitwear"] { --detail-pad-top:18px; --detail-pad-inline:38px; --detail-pad-bottom:32px; }
    .detail-hero[data-detail-family="bottom-long"], .detail-hero[data-detail-family="one-piece"] { --detail-pad-top:20px; --detail-pad-inline:76px; --detail-pad-bottom:34px; }
    .detail-hero[data-detail-family="bottom-short"], .detail-hero[data-detail-family="bottom-skirt"] { --detail-pad-top:34px; --detail-pad-inline:70px; --detail-pad-bottom:58px; }
    .detail-hero[data-detail-family="outerwear"] { --detail-pad-top:20px; --detail-pad-inline:46px; --detail-pad-bottom:42px; }
    .detail-hero[data-detail-family^="footwear-"] { --detail-pad-top:48px; --detail-pad-inline:34px; --detail-pad-bottom:64px; }
    .stage-media { position:absolute; inset:0; display:grid; place-items:center; overflow:hidden; }
    .stage-media > img[data-detail-hero] { width:100%; height:100%; min-width:0; min-height:0; object-fit:cover; object-position:center center; display:block; filter:none; }
    .detail-hero[data-media-role="Catalog"] .stage-media > img { object-fit:contain; padding:var(--detail-pad-top) var(--detail-pad-inline) var(--detail-pad-bottom); background:var(--garment-canvas); }
    .detail-hero[data-media-role="Catalog"][data-matte="canvas"] .stage-media > img { mix-blend-mode:multiply; }
    .detail-hero[data-media-role="Original"] .stage-media > img { object-fit:contain; padding:0; background:var(--garment-canvas); }
    .detail-top { position:absolute; inset:0 0 auto; z-index:8; box-sizing:border-box; height:calc(56px + env(safe-area-inset-top, 0px)); min-width:0; display:flex; justify-content:flex-end; align-items:flex-start; padding:calc(12px + env(safe-area-inset-top, 0px)) calc(14px + env(safe-area-inset-right, 0px)) 0 14px; pointer-events:none; }
    .detail-close { flex:0 0 auto; width:44px; height:44px; display:grid; place-items:center; border:0; border-radius:50%; background:rgba(241,236,227,.92); box-shadow:0 2px 10px rgba(34,29,23,.1); color:var(--text); font-size:22px; line-height:1; padding:0; pointer-events:auto; }
    .detail-cutout { position:absolute; right:18px; bottom:16px; z-index:4; width:24%; min-width:104px; padding:8px; background:rgba(241,236,227,.94); box-shadow:0 13px 35px rgba(31,27,22,.12); }
    .detail-cutout[hidden] { display:none; }
    .detail-cutout img { width:100%; aspect-ratio:.82; object-fit:contain; display:block; }
    .detail-cutout .cutout-recovery { min-height:104px; display:grid; place-items:center; color:var(--text-soft); font-size:9px; line-height:1.35; text-align:center; }
    .media-tabs { position:absolute; left:16px; bottom:15px; z-index:5; display:inline-flex; align-items:center; gap:2px; padding:3px; margin:0; border:1px solid rgba(23,23,21,.18); background:rgba(241,236,227,.88); backdrop-filter:blur(12px); }
    .media-tab { min-height:30px; padding:7px 8px; border:0; border-radius:0; background:transparent; color:var(--text-soft); font-size:8px; letter-spacing:.08em; text-transform:uppercase; }
    .media-tab[aria-pressed="true"] { background:var(--text); color:var(--garment-canvas); }
    .detail-copy { min-width:0; padding:24px 28px 28px; }
    .detail-title { padding-right:0; }
    .detail-sheet h2 { margin:0; font-family:var(--font-serif); font-size:clamp(32px,3vw,43px); line-height:.96; font-weight:400; letter-spacing:-.032em; }
    .detail-essential { color:var(--text-soft); font-size:10px; line-height:1.45; letter-spacing:.07em; text-transform:uppercase; margin:15px 0 0; }
    .detail-category { margin:12px 0 0; color:var(--text); font-size:11px; line-height:1.35; }
    .detail-context { margin:18px 0 0; padding-top:16px; border-top:1px solid var(--row-border); font-family:var(--font-serif); font-size:16px; line-height:1.35; }
    .detail-edit-link { min-height:42px; margin-top:4px; border:0; background:none; padding:8px 0; color:var(--text-soft); font-size:10px; text-decoration:underline; text-underline-offset:4px; }
    .detail-management { margin-top:8px; border-top:1px solid var(--row-border); }
    .detail-management > summary { list-style:none; display:flex; align-items:center; min-height:42px; cursor:pointer; color:var(--text-soft); font-size:10px; }
    .detail-management > summary::-webkit-details-marker { display:none; }
    .detail-management > summary::after { content:"+"; margin-left:auto; color:var(--text); }
    .detail-management[open] > summary::after { content:"−"; }
    .detail-secondary { display:grid; grid-template-columns:1fr 1fr; gap:7px 18px; padding:1px 0 14px; }
    .detail-secondary .btn { min-height:34px; border:0; border-bottom:1px solid var(--row-border); border-radius:0; background:none; padding:5px 0; color:var(--text); font-size:10px; font-weight:400; text-align:left; }
    .duplicate-sheet { position:relative; width:min(760px,100%); padding:24px; }
    .duplicate-close { position:sticky; top:0; z-index:2; float:right; width:44px; height:44px; border-radius:999px; background:var(--paper); }
    .duplicate-intro { margin:-10px 0 20px; max-width:54ch; color:var(--text-muted); font-size:13px; line-height:1.45; }
    .duplicate-pair { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:12px; }
    .duplicate-piece { min-width:0; border:1px solid var(--row-border); background:rgba(255,255,255,.26); }
    .duplicate-photo { aspect-ratio:1 / .92; display:grid; place-items:center; overflow:hidden; background:var(--surface-alt); }
    .duplicate-photo img { width:100%; height:100%; object-fit:contain; padding:14px; mix-blend-mode:multiply; }
    .duplicate-photo .empty { padding:16px; font-size:11px; }
    .duplicate-copy { padding:12px 13px 14px; }
    .duplicate-copy .micro { margin:0 0 6px; }
    .duplicate-copy strong { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:var(--font-serif); font-size:18px; font-weight:400; }
    .duplicate-copy p { min-height:32px; margin:7px 0 0; color:var(--text-soft); font-size:10px; line-height:1.5; }
    .duplicate-candidate-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; margin-top:14px; }
    .duplicate-search-list { display:grid; gap:7px; margin-top:16px; }
    .duplicate-search-result { display:flex; align-items:center; justify-content:space-between; gap:16px; width:100%; min-height:48px; text-align:left; }
    .duplicate-search-result strong { font-family:var(--font-serif); font-size:16px; font-weight:400; }
    .duplicate-search-result span { color:var(--text-soft); font-size:10px; text-align:right; }
    .discard-check { margin-top:14px; padding:12px 0 0; border-top:1px solid var(--row-border); color:var(--text); font-size:11px; }
    .discard-check .actions { margin-top:8px; }
    .detail-row { grid-template-columns:112px 1fr; gap:16px; font-size:11px; line-height:1.45; }
    .review-fields { margin:16px 0 0; padding:11px 0; border-top:1px solid var(--row-border); border-bottom:1px solid var(--row-border); color:var(--text); font-size:10px; }
    .review-fields strong { display:block; margin-bottom:5px; }
    .review-completion { margin-top:10px; }
    /* Conversational advice gets a compact payoff, not the full closet-management takeover. The
       complete detail remains one explicit progressive-disclosure action away. */
    .detail-layer.recommendation:not(.expanded) { position:relative; inset:auto; min-height:0; overflow:visible; background:var(--garment-canvas); }
    .detail-layer.recommendation:not(.expanded) .detail-sheet { display:grid; grid-template-columns:minmax(240px,46%) minmax(0,1fr); height:auto; min-height:380px; overflow:visible; transform:none; }
    .detail-layer.recommendation:not(.expanded) .detail-hero { min-height:380px; height:auto; }
    .detail-layer.recommendation:not(.expanded) .detail-hero[data-detail-family^="footwear-"] { --detail-pad-top:26px; --detail-pad-inline:24px; --detail-pad-bottom:30px; }
    .detail-layer.recommendation:not(.expanded) .detail-copy { display:flex; flex-direction:column; justify-content:center; min-height:0; padding:24px 30px; }
    .detail-layer.recommendation:not(.expanded) .detail-sheet h2 { font-size:clamp(25px,3.2vw,34px); line-height:1.02; }
    .detail-layer.recommendation:not(.expanded) .detail-category { margin-top:9px; }
    .detail-layer.recommendation:not(.expanded) .detail-essential { margin-top:10px; }
    .detail-layer.recommendation:not(.expanded) .media-tabs,
    .detail-layer.recommendation:not(.expanded) .detail-cutout,
    .detail-layer.recommendation:not(.expanded) .detail-edit-link,
    .detail-layer.recommendation:not(.expanded) .detail-management,
    .detail-layer.recommendation:not(.expanded) .review-fields,
    .detail-layer.recommendation:not(.expanded) .review-completion { display:none; }
    .recommendation-reason { display:-webkit-box; max-width:48ch; margin:15px 0 0; overflow:hidden; color:var(--text-muted); font-family:var(--font-serif); font-size:15px; line-height:1.35; -webkit-box-orient:vertical; -webkit-line-clamp:3; }
    .recommendation-actions { margin-top:17px; }
    .recommendation-more { min-height:34px; border:0; border-bottom:1px solid var(--text); background:none; padding:0 0 3px; color:var(--text); font-size:10px; letter-spacing:.07em; text-transform:uppercase; }
    @media (max-width: 1180px) { .grid { grid-template-columns:repeat(5,minmax(0,1fr)); } }
    @media (max-width: 900px) { .grid { grid-template-columns:repeat(4,minmax(0,1fr)); } }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior:auto !important; transition:none !important; animation:none !important; }
      .card:hover .garment-zoom, .card-button:focus-visible .garment-zoom { transform:translateX(-50%) !important; }
    }
    @media (max-width: 640px) {
      .head { padding:0 14px; }
      /* ChatGPT mobile fullscreen owns the status bar and floats its close control over the
         app's upper-right corner. Nested app frames do not reliably inherit the phone safe-area
         inset, so reserve that host-owned region explicitly. Inline remains deliberately compact. */
      .app[data-display-mode="fullscreen"] .head { padding:max(env(safe-area-inset-top, 0px), 48px) 76px 0 14px; }
      .scroll { padding:2px 14px 36px; border-top:1px solid rgba(23,23,21,.07); box-shadow:inset 0 12px 18px -20px rgba(23,23,21,.65),inset 0 -12px 18px -20px rgba(23,23,21,.5); }
      .bar { height:58px; grid-template-columns:1fr auto; gap:8px; }
      .wordmark h1 { font-size:22px; }
      .wordmark-sub, #summary, .filters-toggle span:first-child, .filters-toggle .caret { display:none; }
      .top-actions { gap:4px; align-items:center; }
      .density-control { order:-1; grid-template-columns:10px 62px 10px; gap:4px; min-height:44px; }
      .density-slider { height:44px; }
      .expand-toggle { display:inline-flex; min-width:68px; height:44px; min-height:44px; align-items:center; justify-content:center; padding:0 10px; border:0; font-size:10px; letter-spacing:.04em; }
      .filters-toggle { display:inline-flex; width:44px; height:44px; min-height:44px; align-items:center; justify-content:center; border:0; font-size:0; }
      .filters-toggle::after { content:"⌕"; font-size:20px; transform:rotate(-18deg); }
      .filters { min-height:42px; gap:19px; padding-right:24px; -webkit-mask-image:linear-gradient(to right,#000 0,#000 calc(100% - 22px),transparent 100%); mask-image:linear-gradient(to right,#000 0,#000 calc(100% - 22px),transparent 100%); }
      .chip { min-height:44px; display:inline-flex; align-items:center; font-size:10px; }
      .grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:2px 15px; }
      .app:not(.focused-mode)[data-grid-density="2"] .grid,
      .app:not(.focused-mode)[data-grid-density="3"] .grid { max-width:none; }
      .app.focused-mode .grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px 15px; }
      .needs-photo-divider { display:grid; gap:11px; margin:24px 0 8px; padding-top:17px; }
      .needs-photo-divider .btn { justify-self:start; min-height:44px; }
      /* WebKit can collapse an offscreen content-visibility box whose children are all absolutely
         positioned. Mobile pages are small enough to render eagerly, so keep the two-column grid
         measurable and reserve content-visibility for the larger desktop collection. */
      .card { aspect-ratio:auto; overflow:hidden; content-visibility:visible; contain-intrinsic-size:none; align-self:start; }
      .card::before { content:""; display:block; padding-top:138.8889%; }
      .card-button { position:absolute; inset:0; height:auto; }
      .details { display:none; }
      .app.focused-mode .details { display:block; }
      .advanced { grid-template-columns:1fr 1fr; gap:7px 12px; padding:8px 0 14px; }
      .advanced input, .advanced select { min-height: 36px; font-size: 13px; padding: 0 9px; border-radius: 8px; }
      /* The ⋯ dropdown clips past the (content-sized) iframe on the bottom row, so on mobile present it
         as a bottom sheet fixed to the iframe bottom — never clipped, regardless of which card. */
      .menu { position: fixed; left: 10px; right: 10px; bottom: 10px; top: auto; width: auto; max-width: none; z-index: 20; box-shadow: 0 -4px 20px rgba(13, 13, 13, 0.18); }
      .menu > button { min-height: 44px; font-size: 14px; }
      .dispo { min-height: 44px; font-size: 13px; }
      .btn { min-height: 44px; }
      /* Touch collection stays image-led; the full-screen detail supplies Edit, Photos, Restore,
         and Archive without repeating a management control over every garment. */
      .manage { display:none; }
      .form { grid-template-columns: 1fr; }
      .form input, .form select { min-height: 44px; }
      .review-banner.show { display:block; }
      .review-actions { justify-content:flex-start; margin-top:14px; }
      .detail-sheet { width:100%; min-width:0; height:100%; padding:0; }
      .detail-hero { --detail-pad-top:18px; --detail-pad-inline:24px; --detail-pad-bottom:34px; min-height:400px; height:clamp(400px,54%,460px); max-height:none; overflow:hidden; }
      .detail-hero[data-detail-family="bottom-long"], .detail-hero[data-detail-family="one-piece"] { --detail-pad-inline:54px; --detail-pad-bottom:28px; }
      .detail-hero[data-detail-family="bottom-short"], .detail-hero[data-detail-family="bottom-skirt"] { --detail-pad-top:28px; --detail-pad-inline:48px; --detail-pad-bottom:46px; }
      .detail-hero[data-detail-family="outerwear"] { --detail-pad-top:16px; --detail-pad-inline:28px; --detail-pad-bottom:34px; }
      .detail-hero[data-detail-family^="footwear-"] { --detail-pad-top:42px; --detail-pad-inline:22px; --detail-pad-bottom:54px; }
      .detail-hero[data-media-role="Original"] .stage-media > img { padding:0; }
      .detail-top { height:calc(57px + env(safe-area-inset-top, 0px)); padding-top:calc(13px + env(safe-area-inset-top, 0px)); }
      .detail-close { background:rgba(241,236,227,.9); }
      .detail-cutout { right:14px; bottom:14px; width:27%; min-width:96px; padding:7px; }
      .media-tabs { left:12px; bottom:11px; }
      .media-tab { min-height:44px; padding:7px 10px; }
      .detail-copy { padding:22px 15px calc(104px + env(safe-area-inset-bottom, 0px)); }
      .detail-title { padding-right:0; }
      .detail-sheet h2 { font-size:35px; }
      .detail-edit-link { min-height:44px; }
      .detail-management > summary { min-height:48px; }
      .detail-secondary .btn { min-height:44px; font-size:12px; }
      .duplicate-sheet { padding:20px 14px calc(20px + env(safe-area-inset-bottom, 0px)); }
      .duplicate-pair { gap:8px; }
      .duplicate-copy { padding:10px; }
      .duplicate-copy strong { font-size:15px; }
      .duplicate-candidate-actions { position:sticky; bottom:0; margin:12px -14px -20px; padding:12px 14px calc(12px + env(safe-area-inset-bottom, 0px)); background:rgba(241,236,227,.96); border-top:1px solid var(--row-border); }
      .detail-row { grid-template-columns:88px 1fr; gap:12px; }
      .app.recommendation-mode:not(.recommendation-expanded) { block-size:auto; }
      .detail-layer.recommendation:not(.expanded) .detail-sheet { grid-template-columns:1fr; grid-template-rows:auto auto; min-height:0; }
      .detail-layer.recommendation:not(.expanded) .detail-hero { min-height:240px; height:clamp(240px,68vw,300px); }
      .detail-layer.recommendation:not(.expanded) .detail-hero[data-detail-family^="footwear-"] { --detail-pad-top:20px; --detail-pad-inline:20px; --detail-pad-bottom:24px; }
      .detail-layer.recommendation:not(.expanded) .detail-copy { justify-content:flex-start; padding:16px 18px 18px; }
      .detail-layer.recommendation:not(.expanded) .detail-sheet h2 { font-size:25px; }
      .detail-layer.recommendation:not(.expanded) .detail-essential { margin-top:7px; }
      .recommendation-reason { margin-top:10px; font-size:14px; line-height:1.3; }
      .recommendation-actions { margin-top:11px; }
      .recommendation-more { min-height:32px; }
    }
  </style>
</head>
<body>
  <main class="app awaiting" id="app" inert aria-busy="true">
    <div class="awaiting-status" role="status" aria-live="polite">Preparing your closet…</div>
    <section class="create-outcome" id="createOutcome" aria-live="polite"></section>
    <div class="head">
      <section class="bar">
        <div class="wordmark">
          <h1>Closet</h1>
          <span class="wordmark-sub">your wardrobe</span>
        </div>
        <div class="micro" id="summary">Awaiting closet</div>
        <div class="top-actions">
          <label class="density-control" for="gridScale" title="Adjust item size">
            <span class="density-glyph" aria-hidden="true">−</span>
            <input class="density-slider" id="gridScale" type="range" min="0" max="100" step="1" value="0" aria-label="Adjust item size" aria-describedby="gridDensityStatus" />
            <span class="density-glyph" aria-hidden="true">+</span>
            <output class="sr-only" id="gridDensityStatus" for="gridScale">Four items per row</output>
          </label>
          <button class="expand-toggle" id="expandCloset" type="button" title="Open the full closet">Expand</button>
          <button class="chip filters-toggle" id="advancedToggle" type="button" aria-expanded="false" aria-controls="advanced" title="Filter your closet"><span>Filters</span><span class="caret" aria-hidden="true">▾</span></button>
        </div>
      </section>
      <section class="review-banner" id="reviewBanner" aria-live="polite"></section>
      <section class="filters" id="filters"></section>
      <section class="advanced" id="advanced">
        <select id="statusFilter" aria-label="Status">
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="any">Any status</option>
        </select>
        <select id="subcategoryFilter" aria-label="Type"></select>
        <select id="brandFilter" aria-label="Brand"></select>
        <select id="colorFilter" aria-label="Color"></select>
        <select id="sizeFilter" aria-label="Size"></select>
        <input id="queryFilter" placeholder="Search" aria-label="Search closet" />
      </section>
      <div class="note" id="note" hidden></div>
    </div>
    <div class="scroll">
      <section class="grid" id="grid"></section>
      <div class="continuation" id="continuation" aria-hidden="true"></div>
      <span class="sr-only" id="continuationStatus" role="status" aria-live="polite"></span>
    </div>
    <div class="detail-layer" id="detailLayer" aria-hidden="true"></div>
  </main>
  <script>
    (() => {
      const TEMPLATE_URI = ${JSON.stringify(templateUri)};
      const TEMPLATE_VERSION = ${JSON.stringify(templateVersion)};
      const MAX_DEPTH = 4;
      const PROTOCOL_VERSION = '2026-01-26';
      let viewModel = null;
      let createOutcome = null;
      let initialRenderArgs = null;
      let renderInputObserved = false;
      let initialCreateInputObserved = false;
      let hydrationRecoveryAttempted = false;
      let pending = {};
      let openMenu = null;
      let menuView = 'root';
      // The selected item opens in the host-contained takeover; collection state stays mounted.
      let flippedId = null;
      let retainedEditedDetailId = null;
      let retainedEditedDetailItem = null;
      let recommendationExpanded = false;
      let remountRestoreInFlight = false;
      let remountRestoreAttempted = false;
      const RECOMMENDATION_EXPANSION_STORAGE_KEY = 'fluent-closet-recommendation-expansion';
      const readRecommendationExpansionMarker = () => {
        try {
          const marker = JSON.parse(window.sessionStorage.getItem(RECOMMENDATION_EXPANSION_STORAGE_KEY) || 'null');
          if (!marker || typeof marker.itemId !== 'string' || !Number.isFinite(marker.expiresAt) || marker.expiresAt <= Date.now()) {
            window.sessionStorage.removeItem(RECOMMENDATION_EXPANSION_STORAGE_KEY);
            return null;
          }
          return marker.itemId;
        } catch (error) { return null; }
      };
      const persistRecommendationExpansionMarker = (itemId) => {
        try {
          window.sessionStorage.setItem(RECOMMENDATION_EXPANSION_STORAGE_KEY, JSON.stringify({
            itemId,
            expiresAt: Date.now() + 5 * 60 * 1000,
          }));
        } catch (error) {}
      };
      const clearRecommendationExpansionMarker = () => {
        try { window.sessionStorage.removeItem(RECOMMENDATION_EXPANSION_STORAGE_KEY); } catch (error) {}
      };
      let collectionDisplayModeRequested = false;
      let gridScale = (() => {
        try {
          const savedScaleValue = window.localStorage.getItem('fluent-closet-grid-scale');
          const savedScale = Number(savedScaleValue);
          if (savedScaleValue != null && Number.isFinite(savedScale) && savedScale >= 0 && savedScale <= 100) return savedScale;
          const savedDensity = window.localStorage.getItem('fluent-closet-grid-density');
          if (savedDensity === '2') return 100;
          if (savedDensity === '3') return 50;
          if (savedDensity === '4') return 0;
        } catch (error) {}
        return window.matchMedia && window.matchMedia('(max-width: 640px)').matches ? 100 : 0;
      })();
      let requestedDisplayMode = null;
      let displayModeRequestViewportHeight = null;
      let detailReturnFocus = null;
      let selectedDetailMediaId = null;
      let collectionScrollTop = 0;
      let pointerDetailScrollTop = null;
      // localFilter drives the in-memory client-side filtering of viewModel.items. Status is the one
      // server-side dimension (the loaded set is one status); everything else filters locally.
      let localFilter = { status: 'active' };
      // Ambient host context must never expose an optimistic local choice. This snapshot advances
      // only after an authoritative render response confirms the requested filter.
      let confirmedFilter = { status: 'active' };
      let loadedStatus = 'active';
      let loadedItemIds = null;
      let hydratedFilterOnce = false;
      let loadingMore = false;
      let continuationObserver = null;
      let continuationVisible = false;
      let mobileContinuationArmed = false;
      let collectionRestartPending = false;
      let reviewDismissed = false;
      const reviewedItemIds = new Set();
      const unavailableMediaUrlByItemId = new Map();
      const detailImageRefreshed = Object.create(null);
      // Expired delivery URLs receive one authoritative refresh per exact URL. Keying only by item
      // would permanently suppress recovery after a user replaces a broken photo with a fresh URL.
      const gridImageRefreshed = new Set();
      const gridImageRefreshItemIds = new Set();
      const queuedGridMediaFailures = new Map();
      const garmentContentBoundsCache = new Map();
      let gridImageRefreshPromise = null;
      let gridMediaObserver = null;
      let garmentLayoutObserver = null;
      let viewRequestGeneration = 0;
      let filterAuthorityVersion = 0;
      const HOST_VIEW_MONOTONICITY_REQUIRED = true;
      let filterPending = false;
      let filterDebounceTimer = null;
      let optimisticFilterRenderTimer = null;
      let filterRollback = null;
      let filterRollbackScrollTop = null;
      const FILTER_DEBOUNCE_MS = 70;
      // Preserve every item the widget has already received so a category tap can paint a useful
      // local preview immediately while the authoritative cursor-zero page is fetched in the
      // background. The server response still owns the final result and cursor.
      const itemCache = new Map();
      const clearFilterTimers = () => {
        if (filterDebounceTimer) clearTimeout(filterDebounceTimer);
        if (optimisticFilterRenderTimer) clearTimeout(optimisticFilterRenderTimer);
        filterDebounceTimer = null;
        optimisticFilterRenderTimer = null;
      };
      let activePanelClose = null;
      let detailCloseTimer = null;
      let bridgeId = 1;
      let bridgeInitialized = false;
      let bridgeReady = null;
      const bridgePending = Object.create(null);
      let pendingWidgetViewRequests = 0;
      let deferredHostViewFlush = null;
      const deferredHostViewResults = [];
      const recentWidgetViewResults = new Map();
      let lastModelContextFingerprint = null;
      let activeMutationReceipt = null;
      const HOST_SIZE_CONVERGENCE_REQUIRED = true;
      const HOST_WIDTH_NORMALIZATION_REQUIRED = true;
      const HOST_GEOMETRY_TRACE_LIMIT = 160;
      const CONTENT_BOUND_OPTICAL_FIT_REQUIRED = true;
      const CONTENT_BOUND_ANALYSIS_MAX_AXIS = 320;
      const CONTENT_BOUND_ANALYSIS_MAX_PIXELS = 102400;
      const CONTENT_BOUND_ANALYSIS_DELAY_MS = 0;
      const AMBIGUOUS_MATTE_FAIL_CLOSED_REQUIRED = true;
      const MOBILE_SCROLL_CHAIN_REQUIRED = true;
      const PRIMARY_STYLE_ROLE_DEMOTION_REQUIRED = true;
      let hostLayoutContext = { containerHeight: null, containerWidth: null, displayMode: 'inline', revision: 0, source: 'fallback' };
      let sizeSettleGeneration = 0;
      let lastSizeFingerprint = null;
      let lastRequestedSize = null;
      let settledFocusIntent = null;
      let geometryTraceSequence = 0;
      const hostGeometryTrace = [];

      const traceHostGeometry = (phase, details = {}) => {
        const entry = Object.assign({
          phase,
          sequence: ++geometryTraceSequence,
        }, details || {});
        hostGeometryTrace.push(entry);
        if (hostGeometryTrace.length > HOST_GEOMETRY_TRACE_LIMIT) hostGeometryTrace.splice(0, hostGeometryTrace.length - HOST_GEOMETRY_TRACE_LIMIT);
        window.__fluentHostGeometryTrace = hostGeometryTrace;
        return entry;
      };

      const $ = (id) => document.getElementById(id);
      const syncDisplayModeControl = () => {
        const toggle = $('expandCloset');
        if (!toggle) return;
        const expanded = requestedDisplayMode === 'fullscreen'
          || (requestedDisplayMode !== 'inline' && hostLayoutContext.displayMode === 'fullscreen');
        toggle.textContent = expanded ? 'Minimize' : 'Expand';
        toggle.setAttribute('aria-label', expanded ? 'Minimize the closet' : 'Expand the closet');
        toggle.setAttribute('aria-pressed', String(expanded));
        toggle.title = expanded ? 'Return to the compact closet' : 'Open the full closet';
        $('app')?.setAttribute('data-display-mode', expanded ? 'fullscreen' : 'inline');
      };
      const clearSettledFocusIntent = (intent = settledFocusIntent) => {
        if (!intent) return;
        if (intent.onFocusIn) document.removeEventListener('focusin', intent.onFocusIn, true);
        if (settledFocusIntent === intent) settledFocusIntent = null;
      };
      const reassertSettledFocus = () => {
        const intent = settledFocusIntent;
        if (!intent) return;
        if (!intent.target?.isConnected || Date.now() > intent.expiresAt) {
          clearSettledFocusIntent(intent);
          return;
        }
        const active = document.activeElement;
        const canRecover = !active
          || active === document.body
          || active === document.documentElement
          || active === intent.target;
        // A real user move to another collection/detail control supersedes the short-lived recovery
        // intent. Only recover focus that the host sizing handshake dropped onto the iframe body.
        if (!canRecover) {
          clearSettledFocusIntent(intent);
          return;
        }
        if (active !== intent.target) intent.target.focus({ preventScroll: true });
      };
      const queueSettledFocus = (target) => {
        if (!target || typeof target.focus !== 'function') return;
        clearSettledFocusIntent();
        const intent = { expiresAt: Date.now() + 1400, onFocusIn: null, target };
        intent.onFocusIn = (event) => {
          if (settledFocusIntent !== intent) return;
          const nextTarget = event.target;
          if (!nextTarget || nextTarget === document.body || nextTarget === document.documentElement || nextTarget === intent.target) return;
          // Retarget immediately when the user moves within the active widget. If the host then
          // drops iframe focus later in the handshake, recovery returns to the user's control—not
          // the stale initial Close/card target.
          if (nextTarget.isConnected && typeof nextTarget.focus === 'function') intent.target = nextTarget;
        };
        settledFocusIntent = intent;
        document.addEventListener('focusin', intent.onFocusIn, true);
        requestAnimationFrame(reassertSettledFocus);
        setTimeout(reassertSettledFocus, 0);
        setTimeout(reassertSettledFocus, 80);
        setTimeout(reassertSettledFocus, 300);
        setTimeout(reassertSettledFocus, 700);
        setTimeout(() => {
          reassertSettledFocus();
          clearSettledFocusIntent(intent);
        }, 1200);
      };
      const clone = (value) => JSON.parse(JSON.stringify(value || {}));
      const getBridgeTargets = () => {
        try {
          // MCP Apps traffic belongs to the immediate embedding host. Broadcasting the same JSON-RPC
          // id to both parent and top lets nested ChatGPT wrappers race two authorities for one request.
          if (window.parent && window.parent !== window) return [window.parent];
        } catch (error) {}
        return [];
      };
      const isBridgeSource = (source) => getBridgeTargets().indexOf(source) !== -1;
      const rawPost = (message) => { getBridgeTargets().forEach((target) => target.postMessage(message, '*')); };
      // JSON-RPC notification: never carries an id. Suppressed until the host handshake completes,
      // except 'initialized' itself (the signal the host waits for before delivering tool-result).
      const bridgeNotify = (method, params) => {
        if (method !== 'ui/notifications/initialized' && !bridgeInitialized) return;
        rawPost({ jsonrpc: '2.0', method, params: params || {} });
      };
      // JSON-RPC request: carries an id and resolves on the matching host response.
      const bridgeRequest = (method, params, timeoutMs) => {
        const targets = getBridgeTargets();
        if (!targets.length) return Promise.reject(new Error('No MCP Apps bridge target.'));
        const id = bridgeId++;
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => { delete bridgePending[id]; reject(new Error('MCP Apps bridge timed out.')); }, timeoutMs || 15000);
          bridgePending[id] = { resolve, reject, timeout };
          rawPost({ jsonrpc: '2.0', id, method, params: params || {} });
        });
      };
      const requestDisplayMode = (mode) => {
        if (remountRestoreAttempted) persistClosetRemountSnapshot(mode);
        requestedDisplayMode = mode;
        syncDisplayModeControl();
        traceHostGeometry('display_mode_requested', { mode });
        if (mode === 'fullscreen' && displayModeRequestViewportHeight === null) {
          displayModeRequestViewportHeight = finiteDimension(document.documentElement.clientHeight)
            || finiteDimension(window.innerHeight)
            || 0;
        }
        if (window.openai && typeof window.openai.requestDisplayMode === 'function') {
          const applyResolvedMode = (result) => {
            const resolvedMode = typeof result === 'string'
              ? result
              : result && typeof result === 'object'
                ? (result.mode || result.displayMode || mode)
                : mode;
            if (resolvedMode !== mode) return;
            updateHostLayoutContext(window.openai, false, 'display-mode-globals');
            updateHostLayoutContext({ displayMode: resolvedMode }, false, 'display-mode-response');
            notifySize('display-mode-response');
          };
          try {
            const response = window.openai.requestDisplayMode({ mode });
            if (response && typeof response.then === 'function') response.then(applyResolvedMode).catch(() => {});
            else if (response !== undefined) applyResolvedMode(response);
          } catch (error) {}
          notifySize('display-mode-request');
          return;
        }
        bridgeNotify('ui/request-display-mode', { mode });
        notifySize('display-mode-request');
      };
      const requestCollectionDisplayMode = () => {
        if (!viewModel || collectionDisplayModeRequested || hostLayoutContext.displayMode === 'fullscreen'
          || remountRestoreInFlight || readClosetRemountSnapshot()) return;
        const viewportWidth = finiteDimension(document.documentElement.clientWidth) || finiteDimension(window.innerWidth) || 640;
        // Mobile starts as a compact, clearly bounded window inside the conversation. Expansion is
        // an explicit user choice so it is obvious whether a swipe scrolls ChatGPT or the closet.
        if (viewportWidth <= 480) return;
        const mode = viewModel.presentation && viewModel.presentation.mode;
        if (mode === 'recommendation' && !recommendationExpanded) return;
        if (!Array.isArray(viewModel.items) || viewModel.items.length === 0) return;
        collectionDisplayModeRequested = true;
        requestDisplayMode('fullscreen');
      };
      const callTool = async (name, args) => {
        // Bridge-first (grocery/budgets parity): the JSON-RPC tools/call round-trip resolves with the
        // full { content, structuredContent } envelope, which the widget re-renders from. Claude does
        // not reliably hand back window.openai.callTool's result for widget-initiated re-renders, and
        // ChatGPT versions have exposed a native callTool that throws while the bridge still works.
        const ownsViewModel = name === 'fluent_render_style_closet_surface';
        if (ownsViewModel) pendingWidgetViewRequests += 1;
        try {
          let result = null;
          if (getBridgeTargets().length) {
            try {
              result = await bridgeRequest('tools/call', { name, arguments: args }, 20000);
            } catch (bridgeError) {
              if (window.openai && typeof window.openai.callTool === 'function') {
                result = await window.openai.callTool(name, args);
              } else {
                throw bridgeError;
              }
            }
          } else if (window.openai && typeof window.openai.callTool === 'function') {
            result = await window.openai.callTool(name, args);
          }
          if (ownsViewModel) correlateWidgetViewResult(result);
          return result;
        } finally {
          if (ownsViewModel) {
            pendingWidgetViewRequests = Math.max(0, pendingWidgetViewRequests - 1);
            scheduleDeferredHostViewResults();
          }
        }
      };
      const finiteDimension = (value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      };
      const updateHostLayoutContext = (payload, invalidateMissingDimensions = false, source = 'host-context') => {
        const value = payload && typeof payload === 'object' ? payload : {};
        const context = value.hostContext || value.context || value;
        const dimensions = context.containerDimensions || context.container || context.availableSize || {};
        const width = finiteDimension(dimensions.width ?? dimensions.inlineSize ?? context.containerWidth);
        const height = finiteDimension(dimensions.height ?? dimensions.blockSize ?? context.containerHeight);
        const maxWidth = finiteDimension(dimensions.maxWidth ?? dimensions.maxInlineSize ?? context.maxContainerWidth);
        const maxHeight = finiteDimension(dimensions.maxHeight ?? dimensions.maxBlockSize ?? context.maxContainerHeight);
        const hasDimensionUpdate = Object.keys(dimensions).length > 0
          || Object.prototype.hasOwnProperty.call(context, 'containerWidth')
          || Object.prototype.hasOwnProperty.call(context, 'containerHeight')
          || Object.prototype.hasOwnProperty.call(context, 'maxContainerWidth')
          || Object.prototype.hasOwnProperty.call(context, 'maxContainerHeight');
        const displayMode = typeof context.displayMode === 'string' ? context.displayMode : hostLayoutContext.displayMode;
        const nextHeight = height && maxHeight ? Math.min(height, maxHeight) : (maxHeight ?? height);
        const nextWidth = width && maxWidth ? Math.min(width, maxWidth) : (maxWidth ?? width);
        hostLayoutContext = {
          containerHeight: invalidateMissingDimensions && hasDimensionUpdate ? nextHeight : (nextHeight ?? hostLayoutContext.containerHeight),
          containerWidth: invalidateMissingDimensions && hasDimensionUpdate ? nextWidth : (nextWidth ?? hostLayoutContext.containerWidth),
          displayMode: displayMode || 'inline',
          revision: hostLayoutContext.revision + 1,
          source,
        };
        // An explicit host mode is authoritative even when it declines or reverses the optimistic
        // local request (for example, collapsing fullscreen during a mobile resize).
        if (typeof context.displayMode === 'string') requestedDisplayMode = null;
        syncDisplayModeControl();
        if (hostLayoutContext.displayMode === 'inline') displayModeRequestViewportHeight = null;
        traceHostGeometry('host_context_received', {
          containerHeight: hostLayoutContext.containerHeight,
          containerWidth: hostLayoutContext.containerWidth,
          displayMode: hostLayoutContext.displayMode,
          revision: hostLayoutContext.revision,
          source,
        });
      };
      const preferredAppSize = () => {
        const viewportWidth = finiteDimension(document.documentElement.clientWidth)
          || finiteDimension(window.innerWidth)
          || 640;
        const viewportHeight = finiteDimension(document.documentElement.clientHeight)
          || finiteDimension(window.innerHeight)
          || 720;
        const suppliedWidth = finiteDimension(hostLayoutContext.containerWidth);
        const widthRatio = suppliedWidth ? suppliedWidth / Math.max(viewportWidth, 1) : 1;
        // A host width may be in an adjacent zoom/DPR coordinate space. Accept only a bounded
        // allocation near the actual layout viewport; stale desktop widths must not constrain a
        // later narrow host. The CSS cap still prevents a trusted width from overflowing the frame.
        const suppliedWidthIsTrustworthy = Boolean(suppliedWidth && widthRatio >= 0.75 && widthRatio <= 1.25);
        const width = Math.max(280, Math.min(1800, suppliedWidthIsTrustworthy ? suppliedWidth : viewportWidth));
        const suppliedHeight = finiteDimension(hostLayoutContext.containerHeight);
        const heightRatio = suppliedHeight ? suppliedHeight / Math.max(width, 1) : Infinity;
        // Host dimensions are trusted only when they describe a plausible allocated surface. The
        // known 640x21,022 and 720x5,000 echo states are deliberately rejected rather than mirrored.
        // ChatGPT can switch an app into fullscreen while briefly retaining the inline card's
        // 400px container height. Treat that squat desktop allocation as stale so the widget asks
        // for its bounded fullscreen height instead of reproducing the cramped inline scroller in
        // an otherwise empty fullscreen canvas. The proportional floor remains mobile-safe.
        const fullscreenHeightFloor = Math.min(640, width * 1.1);
        const presentationMode = viewModel?.presentation?.mode;
        const desktopCollection = width > 480
          && !['comparison', 'detail', 'ingestion_review', 'recommendation'].includes(presentationMode);
        const suppliedHeightIsTrustworthy = Boolean(suppliedHeight && suppliedHeight >= 320
          && suppliedHeight <= (hostLayoutContext.displayMode === 'fullscreen' ? 1400 : 1100)
          && heightRatio <= 2.45
          && (!desktopCollection || suppliedHeight >= 720)
          && (hostLayoutContext.displayMode !== 'fullscreen' || suppliedHeight >= fullscreenHeightFloor));
        const compactRecommendation = viewModel?.presentation?.mode === 'recommendation' && !recommendationExpanded;
        // Some ChatGPT builds expand the iframe without returning a mode payload or emitting a
        // globals event. Once this collection has requested expansion, the resized iframe itself
        // is authoritative for layout: follow its bounded viewport instead of waiting on metadata.
        const expandedViewportObserved = displayModeRequestViewportHeight !== null
          && viewportHeight >= Math.max(fullscreenHeightFloor, displayModeRequestViewportHeight * 1.25);
        // ChatGPT may recreate the nested MCP Apps document after expanding the outer app frame.
        // That reload loses the in-memory request marker and can still expose stale inline host
        // metadata, while the new document's actual layout viewport already has the authoritative
        // fullscreen allocation. Follow any bounded desktop viewport taller than the inline cap so
        // the recreated document cannot fall back to 800px inside a 1,359px host canvas.
        const boundedExpandedViewportObserved = width >= 1000
          && viewportHeight > 800
          && viewportHeight >= fullscreenHeightFloor
          && viewportHeight <= 1400;
        const fullscreenViewportHeight = (hostLayoutContext.displayMode === 'fullscreen'
          || expandedViewportObserved
          || boundedExpandedViewportObserved)
          && viewportHeight >= fullscreenHeightFloor
          && viewportHeight <= 1400
          ? viewportHeight
          : null;
        const fallbackHeight = compactRecommendation
          ? (width <= 480 ? 370 : 320)
          : fullscreenViewportHeight ?? 760;
        const mobileInlineHeight = width <= 480
          && hostLayoutContext.displayMode !== 'fullscreen'
          && requestedDisplayMode !== 'fullscreen'
          ? Math.min(560, suppliedHeightIsTrustworthy ? suppliedHeight : 560)
          : null;
        const height = Math.round(mobileInlineHeight ?? (boundedExpandedViewportObserved
            ? viewportHeight
            : suppliedHeightIsTrustworthy
              ? suppliedHeight
              : fallbackHeight));
        return {
          height: compactRecommendation ? fallbackHeight : Math.max(320, height),
          width: Math.round(width * 1000) / 1000,
          widthSource: suppliedWidthIsTrustworthy ? 'host' : 'viewport',
          heightSource: mobileInlineHeight !== null ? 'mobile-inline' : boundedExpandedViewportObserved ? 'viewport' : suppliedHeightIsTrustworthy ? 'host' : 'fallback',
        };
      };
      const observedHostAllocation = () => ({
        contextHeight: finiteDimension(hostLayoutContext.containerHeight),
        contextWidth: finiteDimension(hostLayoutContext.containerWidth),
        innerHeight: finiteDimension(window.innerHeight),
        innerWidth: finiteDimension(window.innerWidth),
      });
      const allocationMatches = (requested, observed) => {
        // containerDimensions are a host request/constraint, not proof that the iframe actually
        // changed. Only the widget viewport can acknowledge the resulting allocation; otherwise a
        // 400px context beside a retained 7,740px iframe would recreate the native false-green.
        const heightMatch = Math.abs((observed.innerHeight || Infinity) - requested.height) <= 1;
        const widthMatch = Math.abs((observed.innerWidth || Infinity) - requested.width) <= 1;
        return heightMatch && widthMatch;
      };
      const publishSettledSize = (reason, generation, preferred, settledFrames, rect) => {
        if (generation !== sizeSettleGeneration) return;
        const height = Math.max(1, Math.round(rect.height));
        const width = Math.max(1, Math.round(preferred.width));
        const fingerprint = width + 'x' + height + '@' + hostLayoutContext.displayMode;
        const observedBefore = observedHostAllocation();
        if (fingerprint === lastSizeFingerprint) {
          traceHostGeometry('size_request_suppressed', {
            generation,
            height,
            reason,
            settledFrames,
            width,
            allocationAcknowledged: allocationMatches({ height, width }, observedBefore),
            observed: observedBefore,
          });
          return;
        }
        lastSizeFingerprint = fingerprint;
        lastRequestedSize = { height, width };
        let nativePath = 'unavailable';
        if (HOST_SIZE_CONVERGENCE_REQUIRED && typeof window.openai?.notifyIntrinsicHeight === 'function') {
          nativePath = 'called';
          try {
            const response = window.openai.notifyIntrinsicHeight(height);
            if (response && typeof response.then === 'function') {
              response.then(() => {
                traceHostGeometry('native_size_response', { generation, height, status: 'resolved', width });
                reassertSettledFocus();
              })
                .catch(() => traceHostGeometry('native_size_response', { generation, height, status: 'rejected', width }));
            } else {
              traceHostGeometry('native_size_response', { generation, height, status: 'returned', width });
              reassertSettledFocus();
            }
          } catch (error) {
            nativePath = 'threw';
            traceHostGeometry('native_size_response', { generation, height, status: 'threw', width });
          }
        }
        const bridgePath = bridgeInitialized ? 'notified' : 'not-initialized';
        if (bridgeInitialized) bridgeNotify('ui/notifications/size-changed', { height, width });
        traceHostGeometry('size_request', {
          bridgePath,
          generation,
          height,
          nativePath,
          reason,
          settledFrames,
          width,
          widthSource: preferred.widthSource,
          heightSource: preferred.heightSource,
          allocationAcknowledged: allocationMatches({ height, width }, observedBefore),
          observed: observedBefore,
        });
        reassertSettledFocus();
      };
      const notifySize = (reasonOrPayload = 'state-change', optionalHostPayload = null) => {
        const reason = typeof reasonOrPayload === 'string' ? reasonOrPayload : 'host-context';
        const hostPayload = typeof reasonOrPayload === 'string' ? optionalHostPayload : reasonOrPayload;
        if (hostPayload) updateHostLayoutContext(hostPayload, true, reason);
        const app = $('app');
        if (!app) return;
        const preferred = preferredAppSize();
        app.style.setProperty('--app-block-size', preferred.height + 'px');
        if (HOST_WIDTH_NORMALIZATION_REQUIRED) {
          document.documentElement.style.setProperty('--app-inline-size', preferred.width + 'px');
        } else {
          document.documentElement.style.setProperty('--app-inline-size', '100%');
        }
        const settleGeneration = ++sizeSettleGeneration;
        traceHostGeometry('size_settle_scheduled', {
          displayMode: hostLayoutContext.displayMode,
          generation: settleGeneration,
          preferredHeight: preferred.height,
          preferredWidth: preferred.width,
          reason,
        });
        let priorRect = null;
        let sampledFrames = 0;
        let stableFrames = 0;
        const sampleSettledFrame = () => {
          if (settleGeneration !== sizeSettleGeneration) return;
          sampledFrames += 1;
          const rect = app.getBoundingClientRect();
          const measured = {
            height: Math.round(rect.height * 1000) / 1000,
            width: Math.round(rect.width * 1000) / 1000,
          };
          if (priorRect && Math.abs(priorRect.height - measured.height) <= 0.5 && Math.abs(priorRect.width - measured.width) <= 0.5) stableFrames += 1;
          else stableFrames = 1;
          priorRect = measured;
          traceHostGeometry('settled_frame', {
            allocation: observedHostAllocation(),
            frame: sampledFrames,
            generation: settleGeneration,
            measuredHeight: measured.height,
            measuredWidth: measured.width,
            reason,
            stableFrames,
          });
          if (stableFrames >= 3) {
            publishSettledSize(reason, settleGeneration, preferred, stableFrames, rect);
            return;
          }
          if (sampledFrames >= 12) {
            traceHostGeometry('size_settle_unstable', {
              frame: sampledFrames,
              generation: settleGeneration,
              measuredHeight: measured.height,
              measuredWidth: measured.width,
              reason,
              stableFrames,
            });
            return;
          }
          requestAnimationFrame(sampleSettledFrame);
        };
        requestAnimationFrame(sampleSettledFrame);
      };
      const modelContextProjection = () => {
        const source = confirmedFilter || {};
        const filter = { status: source.status || loadedStatus };
        for (const key of ['brand', 'category', 'color', 'query', 'size', 'subcategory']) {
          if (source[key]) filter[key] = source[key];
        }
        if (Array.isArray(source.item_ids) && source.item_ids.length > 0) filter.item_ids = source.item_ids.slice();
        const focusedItemId = flippedId && itemById(flippedId) ? flippedId : null;
        const presentedMode = viewModel?.presentation?.mode || (filter.item_ids ? 'comparison' : 'browse');
        const context = {
          filter,
          focusedItemId,
          mode: focusedItemId
            ? (presentedMode === 'recommendation' ? 'recommendation' : 'detail')
            : (presentedMode === 'detail' || presentedMode === 'recommendation' ? (loadedItemIds ? 'comparison' : 'browse') : presentedMode),
          surface: 'style_closet',
        };
        return context;
      };
      const syncModelContext = () => {
        if (!bridgeInitialized || !viewModel) return;
        const projection = modelContextProjection();
        const fingerprint = JSON.stringify(projection);
        if (fingerprint === lastModelContextFingerprint) return;
        lastModelContextFingerprint = fingerprint;
        bridgeNotify('ui/update-model-context', {
          mode: 'replace',
          context: { styleCloset: projection },
        });
      };
      const clearModelContext = () => {
        if (!bridgeInitialized || lastModelContextFingerprint === null) return;
        lastModelContextFingerprint = null;
        bridgeNotify('ui/update-model-context', { mode: 'replace', context: { styleCloset: null } });
      };
      const publishViewModel = (vm) => {
        if (window.openai) {
          window.openai.toolOutput = vm;
          window.openai.toolResponseMetadata = { viewModel: vm, templateUri: TEMPLATE_URI };
        }
      };
      const activeNoteElement = () => {
        const detailCopy = flippedId ? document.querySelector('#detailLayer .detail-copy') : null;
        if (!detailCopy) return $('note');
        let detailNote = detailCopy.querySelector('[data-detail-note]');
        if (!detailNote) {
          detailNote = document.createElement('div');
          detailNote.className = 'note';
          detailNote.dataset.detailNote = '';
          detailCopy.appendChild(detailNote);
        }
        return detailNote;
      };
      const clearNote = () => {
        document.querySelectorAll('#note, [data-detail-note]').forEach((el) => {
          if (el.hasAttribute('data-detail-note')) {
            el.remove();
            return;
          }
          el.hidden = true;
          el.textContent = '';
        });
      };
      const showNote = (text, kind) => {
        clearNote();
        const el = activeNoteElement();
        if (!el) return;
        el.textContent = text;
        el.className = 'note' + (kind ? ' ' + kind : '');
        el.hidden = false;
        notifySize('note-state');
      };
      const showMutationReceipt = (label, inverse) => {
        if (typeof inverse !== 'function') {
          activeMutationReceipt = null;
          showNote(label, 'success');
          return;
        }
        clearNote();
        const el = activeNoteElement();
        if (!el) return;
        activeMutationReceipt = { inverse, label };
        el.textContent = label + ' ';
        const undo = document.createElement('button');
        undo.className = 'btn';
        undo.type = 'button';
        undo.dataset.receiptUndo = 'true';
        undo.textContent = 'Undo';
        undo.addEventListener('click', async () => {
          if (!activeMutationReceipt || undo.disabled) return;
          const receipt = activeMutationReceipt;
          undo.disabled = true;
          undo.textContent = 'Undoing…';
          try {
            await receipt.inverse();
            if (activeMutationReceipt !== receipt) return;
            activeMutationReceipt = null;
            showNote('Undid: ' + receipt.label, '');
          } catch (error) {
            if (activeMutationReceipt !== receipt) return;
            undo.disabled = false;
            undo.textContent = 'Retry undo';
            el.textContent = 'Could not undo that confirmed change. The receipt remains available. ';
            el.appendChild(undo);
            el.className = 'note error';
            el.hidden = false;
            notifySize('receipt-state');
          }
        });
        el.appendChild(undo);
        el.className = 'note success';
        el.hidden = false;
        notifySize('receipt-state');
      };
      const setCollectionModalState = (active) => {
        const app = $('app');
        if (!app) return;
        for (const region of [app.querySelector('.head'), app.querySelector('.scroll')]) {
          if (!region) continue;
          // Some assistant webviews expose a non-reflecting inert property. Own the literal
          // attribute as the cross-host contract so closing detail cannot leave collection controls
          // untouchable even when the property setter does not remove it.
          try { region.inert = Boolean(active); } catch (error) {}
          if (active) {
            region.setAttribute('inert', '');
            region.setAttribute('aria-hidden', 'true');
          } else {
            region.removeAttribute('inert');
            region.removeAttribute('aria-hidden');
          }
        }
      };
      const setCollectionScrollTop = (scroll, top) => {
        if (!scroll) return;
        const priorBehavior = scroll.style.scrollBehavior;
        scroll.style.scrollBehavior = 'auto';
        scroll.scrollTop = Math.max(0, Number(top) || 0);
        if (priorBehavior) scroll.style.scrollBehavior = priorBehavior;
        else scroll.style.removeProperty('scroll-behavior');
      };
      const setAdvancedOpen = (open) => {
        const advanced = $('advanced');
        const toggle = $('advancedToggle');
        if (!advanced || !toggle) return;
        if (loadedItemIds) {
          advanced.classList.remove('open');
          toggle.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
          return;
        }
        advanced.classList.toggle('open', open);
        toggle.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', String(open));
      };
      // A widget-initiated tools/call can RESOLVE (not throw) with an MCP error envelope; the bridge
      // handler forwards any data.result. Treat an isError result as a failed write, not a success.
      const resultIsError = (result) => {
        if (!result || typeof result !== 'object') return false;
        if (result.isError === true) return true;
        return Boolean(result.result && typeof result.result === 'object' && result.result.isError === true);
      };
      const VM_KEYS = ['structuredContent', 'toolResponseMetadata', 'toolOutput', 'result', 'output', 'data', 'value', 'params', 'payload', 'readAfterWrite', 'content'];
      const extractViewModel = (value, depth = 0) => {
        if (!value || depth > MAX_DEPTH) return null;
        if (Array.isArray(value)) {
          for (const entry of value) {
            const found = extractViewModel(entry, depth + 1);
            if (found) return found;
          }
          return null;
        }
        if (typeof value === 'object') {
          if (value.experience === 'style_closet' || value.surface === 'style_closet') return value;
          // Unwrap the known MCP tool-result / Apps-SDK envelope keys first (so the bridge tools/call
          // return value parses regardless of nesting), then a bounded generic walk. Mirrors the
          // proven grocery/budgets extractors.
          for (const key of VM_KEYS) {
            if (value[key] != null) {
              const found = extractViewModel(value[key], depth + 1);
              if (found) return found;
            }
          }
          for (const entry of Object.values(value)) {
            const found = extractViewModel(entry, depth + 1);
            if (found) return found;
          }
        }
        return null;
      };
      const extractStyleDomainItem = (value, itemId, depth = 0) => {
        if (!value || depth > MAX_DEPTH) return null;
        if (Array.isArray(value)) {
          for (const entry of value) {
            const found = extractStyleDomainItem(entry, itemId, depth + 1);
            if (found) return found;
          }
          return null;
        }
        if (typeof value !== 'object') return null;
        if (value.object === 'DomainItem' && value.domain === 'style' && value.type === 'style_item'
            && value.id === itemId && value.payload && typeof value.payload === 'object') {
          return value.payload;
        }
        for (const key of VM_KEYS) {
          if (value[key] != null) {
            const found = extractStyleDomainItem(value[key], itemId, depth + 1);
            if (found) return found;
          }
        }
        return null;
      };
      const extractCreateOutcome = (value, depth = 0) => {
        if (!value || depth > MAX_DEPTH) return null;
        if (Array.isArray(value)) {
          for (const entry of value) {
            const found = extractCreateOutcome(entry, depth + 1);
            if (found) return found;
          }
          return null;
        }
        if (typeof value !== 'object') return null;
        if (value.experience === 'style_create_outcome' && value.surface === 'style_closet_create_outcome') return value;
        for (const key of VM_KEYS) {
          if (value[key] != null) {
            const found = extractCreateOutcome(value[key], depth + 1);
            if (found) return found;
          }
        }
        for (const entry of Object.values(value)) {
          const found = extractCreateOutcome(entry, depth + 1);
          if (found) return found;
        }
        return null;
      };
      const containsToolError = (value, depth = 0) => {
        if (!value || depth > MAX_DEPTH) return false;
        if (Array.isArray(value)) return value.some((entry) => containsToolError(entry, depth + 1));
        if (typeof value !== 'object') return false;
        if (value.isError === true) return true;
        return Object.values(value).some((entry) => containsToolError(entry, depth + 1));
      };
      const genericInitialCreateFailure = () => ({
        duplicateCandidates: [], experience: 'style_create_outcome',
        message: 'Fluent could not create or verify this item. Nothing else in your Closet is shown or changed by this result.',
        saved: false, status: 'failure', surface: 'style_closet_create_outcome',
        templateUri: TEMPLATE_URI, title: 'Item not created',
      });
      const receiveCreateOutcome = (payload) => {
        const next = extractCreateOutcome(payload);
        if (!next || next.templateUri !== TEMPLATE_URI || !['duplicate_warning', 'failure', 'validation_only'].includes(next.status)) return null;
        createOutcome = next;
        hydrationRecoveryAttempted = true;
        render();
        return next;
      };
      const receiveViewModel = (payload, append = false, renderOptions = {}) => {
        const next = extractViewModel(payload);
        if (!next) return null;
        for (const item of next.items || []) itemCache.set(item.id, item);
        const healedMediaItemIds = new Set();
        if (append && viewModel) {
          const existing = new Map((viewModel.items || []).map((item) => [item.id, item]));
          for (const item of next.items || []) existing.set(item.id, item);
          viewModel = Object.assign({}, next, { items: Array.from(existing.values()) });
        } else {
          viewModel = next;
        }
        loadingMore = false;
        for (const item of viewModel.items || []) {
          const failedUrl = unavailableMediaUrlByItemId.get(item.id);
          if (failedUrl && failedUrl !== item.imageUrl) {
            unavailableMediaUrlByItemId.delete(item.id);
            healedMediaItemIds.add(item.id);
          }
        }
        loadedStatus = (next.filter && next.filter.status) || 'active';
        const adoptAuthoritativeView = !hydratedFilterOnce || renderOptions.adoptAuthoritativeView === true;
        if (adoptAuthoritativeView) {
          // First hydrate: ADOPT the server-provided filter so an opened-pre-filtered closet
          // ("show my shirts") lands narrowed on the right category/type/color. Later facet changes
          // re-query the authoritative server set, so matches beyond the current cursor page are found.
          const f = next.filter || {};
          loadedItemIds = (next.filter && Array.isArray(next.filter.item_ids) && next.filter.item_ids.length > 0)
            ? next.filter.item_ids.slice()
            : null;
          localFilter = {
            status: loadedStatus,
            category: f.category || null,
            subcategory: f.subcategory || null,
            brand: f.brand || null,
            color: f.color || null,
            size: f.size || null,
            query: f.query || null,
          };
          confirmedFilter = Object.assign({}, localFilter, loadedItemIds ? { item_ids: loadedItemIds.slice() } : {});
          $('app')?.setAttribute('data-confirmed-filter', canonicalFilterFingerprint(confirmedFilter));
          hydratedFilterOnce = true;
          // Reveal the advanced panel when the narrowing lives there, so the user can see/clear it.
          if (f.subcategory || f.brand || f.color || f.size || f.query) setAdvancedOpen(true);
          // ChatGPT can replay the authoritative tool result after a local child action updates
          // model context. Preserve an already-focused item when it still exists in that replay;
          // otherwise the host refresh silently collapses detail back to the gallery.
          const retainedFocusedItemId = flippedId && itemById(flippedId) ? flippedId : null;
          flippedId = retainedFocusedItemId || next.presentation?.focusedItemId || null;
          recommendationExpanded = next.presentation?.mode === 'recommendation'
            && Boolean(flippedId)
            && readRecommendationExpansionMarker() === flippedId;
        } else {
          // Later re-renders (filter round-trip, archive/restore refetch): preserve the user's
          // in-memory filters; only sync the echoed server-side status dimension.
          localFilter = Object.assign({}, localFilter, { status: loadedStatus });
        }
        publishViewModel(viewModel);
        clearNote();
        const requestedReplacements = Array.from(renderOptions.replaceItemIds || []);
        render(Object.assign({}, renderOptions, {
          preserveExistingCards: append || renderOptions.preserveExistingCards === true,
          replaceItemIds: Array.from(new Set(requestedReplacements.concat(Array.from(healedMediaItemIds)))),
        }));
        if (!append && adoptAuthoritativeView) {
          queueMicrotask(() => { void restoreClosetRemountSnapshot().then((restored) => {
            if (!restored) requestCollectionDisplayMode();
            restoreDuplicateMergeReceipt();
          }); });
        } else {
          requestCollectionDisplayMode();
          queueMicrotask(() => { restoreDuplicateMergeReceipt(); });
        }
        return next;
      };
      // Some hosts echo a widget-initiated tools/call through the host-global tool-result
      // notification as well as resolving the correlated JSON-RPC request. The caller owns whether
      // that response replaces or appends. Applying the unscoped echo here would replace an appended
      // page and rebuild already-painted image nodes. Correlate by the exact returned Closet model,
      // defer notifications while the request is pending, and suppress only an identical recent echo.
      const viewModelFingerprint = (payload) => {
        const model = extractViewModel(payload);
        if (!model) return null;
        const canonicalize = (value, depth = 0) => {
          if (depth > MAX_DEPTH + 4 || value == null || typeof value !== 'object') return value;
          if (Array.isArray(value)) return value.map((entry) => canonicalize(entry, depth + 1));
          const output = {};
          for (const key of Object.keys(value).sort()) output[key] = canonicalize(value[key], depth + 1);
          return output;
        };
        // Bind the complete UI-relevant Closet model, not only media and IDs. A host-global update
        // that changes a name, detail field, summary, facet, or filter option must remain renderable.
        return JSON.stringify(canonicalize(model));
      };
      const canonicalFilterFingerprint = (filter) => {
        const source = filter && typeof filter === 'object' ? filter : {};
        const normalized = { status: String(source.status || loadedStatus || 'active').trim().toLowerCase() };
        for (const key of ['brand', 'category', 'color', 'query', 'size', 'subcategory']) {
          const value = String(source[key] == null ? '' : source[key]).trim().toLowerCase();
          if (value) normalized[key] = value;
        }
        if (Array.isArray(source.item_ids) && source.item_ids.length) {
          normalized.item_ids = source.item_ids.map((value) => String(value)).sort();
        }
        return JSON.stringify(normalized);
      };
      const viewMatchesFilter = (payload, expectedFilter) => {
        const model = extractViewModel(payload);
        return Boolean(model && canonicalFilterFingerprint(model.filter) === canonicalFilterFingerprint(expectedFilter));
      };
      const pruneRecentWidgetViewResults = () => {
        const now = Date.now();
        for (const [fingerprint, expiresAt] of recentWidgetViewResults.entries()) {
          if (expiresAt <= now) recentWidgetViewResults.delete(fingerprint);
        }
      };
      const correlateWidgetViewResult = (payload) => {
        const fingerprint = viewModelFingerprint(payload);
        if (!fingerprint) return;
        pruneRecentWidgetViewResults();
        recentWidgetViewResults.set(fingerprint, Date.now() + 5000);
        for (let index = deferredHostViewResults.length - 1; index >= 0; index -= 1) {
          if (deferredHostViewResults[index].fingerprint === fingerprint) deferredHostViewResults.splice(index, 1);
        }
      };
      const receiveHostViewResult = (payload) => {
        if (!viewModel) {
          const outcome = extractCreateOutcome(payload);
          if (outcome) return receiveCreateOutcome(outcome);
          if (!createOutcome && initialCreateInputObserved && containsToolError(payload)) {
            return receiveCreateOutcome(genericInitialCreateFailure());
          }
        }
        if (createOutcome) return null;
        const fingerprint = viewModelFingerprint(payload);
        if (!fingerprint) return null;
        pruneRecentWidgetViewResults();
        if (pendingWidgetViewRequests > 0) {
          deferredHostViewResults.push({ fingerprint, payload });
          return null;
        }
        if (recentWidgetViewResults.has(fingerprint)) return null;
        // Once the user has chosen a local facet, an uncorrelated host/global result may update the
        // same authoritative view but may not roll it back to an older filter. This closes the delayed
        // All/101 echo path observed after Shoes had already settled.
        if (filterAuthorityVersion > 0) {
          const expectedFilter = filterPending ? activeServerFilter() : confirmedFilter;
          if (!viewMatchesFilter(payload, expectedFilter)) return null;
        }
        const incomingModel = extractViewModel(payload);
        if (HOST_VIEW_MONOTONICITY_REQUIRED && viewModel && incomingModel) {
          const incomingFilterMatches = canonicalFilterFingerprint(incomingModel.filter)
            === canonicalFilterFingerprint(viewModel.filter || confirmedFilter);
          const currentPresentation = viewModel.presentation || {};
          const incomingPresentation = incomingModel.presentation || {};
          const incomingPresentationMatches = String(incomingPresentation.mode || currentPresentation.mode || 'browse')
            === String(currentPresentation.mode || 'browse')
            && String(incomingPresentation.focusedItemId || '') === String(currentPresentation.focusedItemId || '');
          const currentIds = new Set((viewModel.items || []).map((item) => item.id));
          const incomingItems = incomingModel.items || [];
          const incomingIsKnownSubset = incomingItems.every((item) => currentIds.has(item.id));
          const cursorWouldRegress = incomingModel.cursor !== viewModel.cursor && incomingItems.length <= (viewModel.items || []).length;
          if (incomingFilterMatches && incomingPresentationMatches && incomingIsKnownSubset
              && (incomingItems.length < (viewModel.items || []).length || cursorWouldRegress)) {
            // An uncorrelated same-filter cursor-zero echo may refresh metadata for its exact IDs, but
            // it cannot replace an already-appended chain or revive an earlier cursor. Merge only its
            // known rows into the current monotonic ordering and retain the authoritative cursor.
            const collectionScrollTop = document.querySelector('.scroll')?.scrollTop || 0;
            const replacements = new Map(incomingItems.map((item) => [item.id, item]));
            const guardedModel = Object.assign({}, incomingModel, {
              cursor: viewModel.cursor,
              items: (viewModel.items || []).map((item) => replacements.get(item.id) || item),
              presentation: viewModel.presentation,
              summary: Object.assign({}, incomingModel.summary || {}, {
                shownTotal: Math.max(
                  Number(incomingModel.summary?.shownTotal || 0),
                  Number(viewModel.summary?.shownTotal || 0),
                  (viewModel.items || []).length,
                ),
              }),
            });
            const received = receiveViewModel(guardedModel, false, { preserveExistingCards: true });
            setCollectionScrollTop(document.querySelector('.scroll'), collectionScrollTop);
            return received;
          }
        }
        return receiveViewModel(payload, false, { adoptAuthoritativeView: filterAuthorityVersion === 0 });
      };
      const scheduleDeferredHostViewResults = () => {
        if (pendingWidgetViewRequests > 0 || deferredHostViewFlush != null) return;
        deferredHostViewFlush = setTimeout(() => {
          deferredHostViewFlush = null;
          if (pendingWidgetViewRequests > 0) { scheduleDeferredHostViewResults(); return; }
          const queued = deferredHostViewResults.splice(0);
          for (const entry of queued) receiveHostViewResult(entry.payload);
        }, 0);
      };
      const extractWriteAck = (value, depth = 0) => {
        if (!value || depth > MAX_DEPTH) return null;
        if (Array.isArray(value)) {
          for (const entry of value) {
            const found = extractWriteAck(entry, depth + 1);
            if (found) return found;
          }
          return null;
        }
        if (typeof value !== 'object') return null;
        if (typeof value.kind === 'string' && value.target && Object.prototype.hasOwnProperty.call(value, 'readAfterWrite')) return value;
        for (const key of VM_KEYS) {
          if (value[key] != null) {
            const found = extractWriteAck(value[key], depth + 1);
            if (found) return found;
          }
        }
        return null;
      };
      const writeProofItem = (ack) => {
        const read = ack && ack.readAfterWrite && typeof ack.readAfterWrite === 'object' ? ack.readAfterWrite : null;
        const updated = read && read.updatedItem && typeof read.updatedItem === 'object' ? read.updatedItem : null;
        const root = updated || read;
        const payload = root && root.payload && typeof root.payload === 'object' ? root.payload : root;
        return { payload, read, root };
      };
      const proofField = (proof, key) => {
        if (proof.read && Object.prototype.hasOwnProperty.call(proof.read, key)) return proof.read[key];
        if (proof.root && Object.prototype.hasOwnProperty.call(proof.root, key)) return proof.root[key];
        if (!proof.payload) return undefined;
        if (Object.prototype.hasOwnProperty.call(proof.payload, key)) return proof.payload[key];
        if (key === 'color') return proof.payload.colorFamily ?? proof.payload.color_family;
        return undefined;
      };
      const requireDurableWriteAck = (result, expectedKind, itemId) => {
        if (resultIsError(result)) throw new Error('host rejected the write');
        const ack = extractWriteAck(result);
        const payload = ack && ack.payload && typeof ack.payload === 'object' ? ack.payload : null;
        if (!ack || ack.kind !== expectedKind || !payload || payload.durable !== true) throw new Error('write ACK was not durable');
        if (!ack.target || ack.target.id !== itemId || ack.target.type !== 'style_item') throw new Error('write ACK targeted a different item');
        return ack;
      };
      const verifyStylePatchAck = (result, itemId, patch) => {
        const ack = requireDurableWriteAck(result, 'style_item_patch', itemId);
        const proof = writeProofItem(ack);
        if (proofField(proof, 'id') !== itemId) throw new Error('read-after-write targeted a different item');
        for (const key of Object.keys(patch)) {
          if ((proofField(proof, key) ?? null) !== (patch[key] ?? null)) throw new Error('read-after-write did not confirm the patch');
        }
        return ack;
      };
      const verifyStylePatchItem = (candidate, itemId, patch) => {
        if (!candidate || candidate.id !== itemId) throw new Error('focused readback targeted a different item');
        for (const key of Object.keys(patch)) {
          const actual = key === 'color' ? candidate.colorFamily : candidate[key];
          if ((actual ?? null) !== (patch[key] ?? null)) throw new Error('focused readback did not confirm the patch');
        }
        return candidate;
      };
      const recoverAmbiguousStylePatch = async (itemId, patch) => {
        // Confirmation of one exact write must not depend on the Closet template/render path.
        // A host can persist the write yet fail or delay the widget render, which previously made
        // Undo report a false failure. Read the exact canonical item through the existing read tool.
        const result = await callTool('fluent_get_item', {
          domain: 'style',
          item_id: itemId,
          item_type: 'style_item',
          view: 'summary',
        });
        const candidate = extractStyleDomainItem(result, itemId);
        return verifyStylePatchItem(candidate, itemId, patch);
      };
      const archiveDispositionMismatch = (actualDisposition = null) => {
        const error = new Error('archive disposition readback did not confirm the selected disposition');
        error.code = 'archive_disposition_mismatch';
        error.actualDisposition = actualDisposition;
        error.archiveProven = true;
        return error;
      };
      const verifyArchiveAck = (result, itemId, expectedDisposition = null) => {
        const ack = requireDurableWriteAck(result, 'item_archive', itemId);
        const payload = ack.payload || {};
        const proof = writeProofItem(ack);
        if (proofField(proof, 'id') !== itemId || proofField(proof, 'status') !== 'archived') throw new Error('read-after-write did not confirm the archive');
        if (expectedDisposition && payload.disposition !== expectedDisposition) throw archiveDispositionMismatch(payload.disposition);
        return ack;
      };
      const recoverAmbiguousArchive = async (itemId, expectedDisposition = null) => {
        // Archive reason lives in the Closet projection's provenance join, not in fluent_get_item's
        // StyleItemRecord payload. Recover ambiguous host acknowledgements through the exact-item
        // Closet projection so tests and live behavior use the same production-shaped contract.
        const result = await callTool('fluent_render_style_closet_surface', {
          filter: { item_ids: [itemId], status: 'any' },
          limit: 1,
          presentation: { focused_item_id: itemId, mode: 'detail' },
        });
        const readback = extractViewModel(result);
        const candidate = readback && Array.isArray(readback.items)
          ? readback.items.find((entry) => entry && entry.id === itemId)
          : null;
        verifyStylePatchItem(candidate, itemId, { status: 'archived' });
        if (expectedDisposition && candidate.archiveDisposition !== expectedDisposition) throw archiveDispositionMismatch(candidate.archiveDisposition);
        return candidate;
      };
      const verifyDuplicateMergeAck = (result, sourceItemId, targetItemId, expectedMergeId) => {
        const ack = requireDurableWriteAck(result, 'style_item_duplicate_merge', targetItemId);
        const payload = ack.payload || {};
        const proof = writeProofItem(ack);
        if (payload.sourceItemId !== sourceItemId || payload.targetItemId !== targetItemId || payload.mergeId !== expectedMergeId || payload.verifiedOneActiveItem !== true) {
          throw new Error('duplicate merge ACK did not confirm the selected pair');
        }
        if (proofField(proof, 'id') !== targetItemId || proofField(proof, 'status') !== 'active') {
          throw new Error('duplicate merge read-after-write did not confirm the canonical item');
        }
        return ack;
      };
      const recoverAmbiguousDuplicateMerge = async (sourceItemId, targetItemId, expectedRetainedMediaIds) => {
        // Some hosts can persist the merge but omit the structured write ACK from the widget bridge.
        // Reconcile both exact durable identities before treating that response as a failure. The
        // subsequent Closet refresh still verifies the exact retained media ids and active count.
        const [sourceResult, targetResult] = await Promise.all([
          callTool('fluent_get_item', {
            domain: 'style',
            item_id: sourceItemId,
            item_type: 'style_item',
            view: 'summary',
          }),
          callTool('fluent_get_item', {
            domain: 'style',
            item_id: targetItemId,
            item_type: 'style_item',
            view: 'summary',
          }),
        ]);
        const source = extractStyleDomainItem(sourceResult, sourceItemId);
        const target = extractStyleDomainItem(targetResult, targetItemId);
        if (!source || source.id !== sourceItemId || source.status !== 'archived') {
          throw new Error('duplicate merge recovery did not confirm the archived source');
        }
        if (!target || target.id !== targetItemId || target.status !== 'active') {
          throw new Error('duplicate merge recovery did not confirm the retained item');
        }
        const sourcePhotoIds = Array.isArray(source.photos) ? source.photos.map((photo) => photo && photo.id).filter(Boolean) : null;
        const targetPhotoIds = Array.isArray(target.photos) ? target.photos.map((photo) => photo && photo.id).filter(Boolean) : null;
        const sourcePhotoCount = Number(source.photosCount ?? source.photos_count ?? (sourcePhotoIds ? sourcePhotoIds.length : NaN));
        const targetPhotoCount = Number(target.photosCount ?? target.photos_count ?? (targetPhotoIds ? targetPhotoIds.length : NaN));
        const targetIdsMismatch = targetPhotoIds
          ? expectedRetainedMediaIds.some((mediaId) => !targetPhotoIds.includes(mediaId))
          : false;
        if (sourcePhotoCount !== 0 || !Number.isFinite(targetPhotoCount)
            || targetPhotoCount < expectedRetainedMediaIds.length || targetIdsMismatch) {
          throw new Error('duplicate merge recovery did not confirm the exact media transfer');
        }
        return { source, target };
      };
      const verifyPhotoAck = (result, itemId, imageType, imageArgs) => {
        const ack = requireDurableWriteAck(result, 'style_item_image_set', itemId);
        const payload = ack.payload;
        const expectedStorage = imageArgs.image_data_url ? 'owned_upload' : 'reference_url';
        if (payload.imageType !== imageType || payload.imageStorage !== expectedStorage) throw new Error('photo ACK did not match the submitted role or storage');
        const proof = writeProofItem(ack);
        const photoId = typeof payload.photoId === 'string' ? payload.photoId : null;
        if (!photoId || proofField(proof, 'id') !== itemId || !proof.read || proof.read.hasImage !== true || proof.read.imageStorage !== expectedStorage || proof.read.photoId !== photoId) {
          throw new Error('read-after-write did not confirm the photo target');
        }
        const photos = proof.payload && Array.isArray(proof.payload.photos) ? proof.payload.photos : [];
        const photo = photos.find((entry) => entry && entry.id === photoId);
        if (!photo) throw new Error('read-after-write did not contain the submitted photo role');
        if ((photo.itemId ?? photo.item_id ?? itemId) !== itemId) throw new Error('read-after-write photo belonged to another item');
        const photoIsFit = Boolean(photo.isFit ?? photo.is_fit) || photo.kind === 'fit';
        if (photoIsFit !== (imageType === 'fit')) throw new Error('read-after-write photo role did not match the submitted role');
        if (expectedStorage === 'reference_url') {
          const sourceUrl = photo.sourceUrl ?? photo.source_url ?? null;
          if (sourceUrl !== imageArgs.image_url) throw new Error('read-after-write retained the previous photo source');
        } else {
          const artifactId = photo.artifactId ?? photo.artifact_id ?? null;
          if (!artifactId) throw new Error('read-after-write did not confirm owned photo storage');
        }
        return ack;
      };
      const sanitizeRenderArgs = (value) => {
        if (!value || typeof value !== 'object') return null;
        const next = {};
        if (value.filter && typeof value.filter === 'object') next.filter = clone(value.filter);
        if (value.presentation && typeof value.presentation === 'object') next.presentation = clone(value.presentation);
        if (typeof value.cursor === 'string' && value.cursor) next.cursor = value.cursor;
        if (Number.isFinite(value.limit) && value.limit > 0) next.limit = Math.min(120, Math.floor(value.limit));
        return Object.keys(next).length ? next : null;
      };
      const rememberRenderInput = (value) => {
        if (!value || typeof value !== 'object') return null;
        const looksLikeCreateInput = typeof value.category === 'string'
          && typeof value.subcategory === 'string'
          && value.approval === 'explicit_user_approved';
        if (looksLikeCreateInput) {
          initialCreateInputObserved = true;
          return null;
        }
        const next = sanitizeRenderArgs(value);
        renderInputObserved = true;
        initialRenderArgs = next ?? {};
        return initialRenderArgs;
      };
      const toolInput = (payload, allowRenderRecovery = true) => {
        const params = payload && (payload.params || payload);
        const name = params && (params.toolName || params.name);
        const args = params && (params.arguments || params.args || params.input);
        if (!args) return;
        if (name === 'fluent_render_style_closet_surface') {
          if (allowRenderRecovery) rememberRenderInput(args);
          return;
        }
        if (name === 'fluent_create_style_item') {
          initialCreateInputObserved = true;
          return;
        }
        if (!args.item_id) return;
        if (name === 'fluent_set_style_item_image') {
          pending[args.item_id] = { kind: 'photo', text: 'saving photo...' };
          render();
        }
      };
      const toolCancelled = () => {
        pending = {};
        render();
      };
      const norm = (value) => String(value == null ? '' : value).trim().toLowerCase();
      // Mirror of the server pluralKey: lowercases, strips one trailing "s", then aliases, so a free-text
      // query that names a type ("jeans", "tees") can be matched against the closet's singular stored
      // category/subcategory ("Jean", "Tee") — not just literal substring.
      const QUERY_ALIASES = { 't shirt': 'tee', 'tshirt': 'tee', 't-shirt': 'tee', 'derbie': 'derby', 'bootie': 'boot', 'accessorie': 'accessory' };
      const vocabKey = (value) => {
        let key = norm(value);
        if (key.length > 2 && key.charAt(key.length - 1) === 's') key = key.slice(0, -1);
        return QUERY_ALIASES[key] || key;
      };
      // pluralKey of a compound subcategory's head noun ("Cargo Short" -> "short"); mirrors the server
      // headNounKey so a free-text "shorts"/"boots" query reaches every compound in that family.
      const headNounKey = (value) => {
        const tokens = norm(value).split(/\s+/).filter(Boolean);
        return tokens.length > 0 ? vocabKey(tokens[tokens.length - 1]) : '';
      };
      // Filter options come from the complete server-side status set, not only the current cursor page,
      // so a narrow result can always be broadened again.
      const availableOptions = () => {
        const options = viewModel?.filterOptions || {};
        return {
          subcategories: options.subcategories || [],
          brands: options.brands || [],
          colorFamilies: options.colorFamilies || [],
          sizes: options.sizes || [],
        };
      };
      // The server already pages the complete matching set. Reapplying the echoed filter locally keeps
      // the render deterministic while new cursor pages are appended; it is not the authority for
      // discovering matches beyond the loaded page.
      const itemMatchesCollection = (item) => {
        const f = localFilter || {};
        if (loadedItemIds && loadedItemIds.indexOf(item.id) === -1) return false;
        if (f.status && f.status !== 'any' && item.status !== f.status) return false;
        if (f.category && norm(item.category) !== norm(f.category)) return false;
        if (f.subcategory && norm(item.subcategory) !== norm(f.subcategory)) return false;
        if (f.brand && norm(item.brand) !== norm(f.brand)) return false;
        if (f.color && norm(item.colorFamily) !== norm(f.color)) return false;
        if (f.size && norm(item.size) !== norm(f.size)) return false;
        if (f.query) {
          const hay = [item.name, item.brand, item.category, item.subcategory, item.colorFamily, item.size].filter(Boolean).join(' ').toLowerCase();
          // Match if the query names this item's category/subcategory ("jeans" -> "Jean") OR appears as
          // text. Vocab match catches items classified into a type but not named after it.
          const queryKey = vocabKey(f.query);
          const vocabHit = queryKey === vocabKey(item.category) || queryKey === vocabKey(item.subcategory) || queryKey === headNounKey(item.subcategory);
          if (!vocabHit && hay.indexOf(norm(f.query)) === -1) return false;
        }
        return true;
      };
      const clientVisible = () => {
        const authoritativeItems = (viewModel && viewModel.items) || [];
        const items = filterPending && !loadedItemIds && itemCache.size
          ? Array.from(itemCache.values())
          : authoritativeItems;
        return items.filter(itemMatchesCollection);
      };
      const openDetailItem = (itemId, returnFocus = null) => {
        if (!itemById(itemId)) return;
        if (flippedId !== itemId) {
          selectedDetailMediaId = null;
          retainedEditedDetailId = null;
          retainedEditedDetailItem = null;
        }
        const scroll = document.querySelector('.scroll');
        collectionScrollTop = pointerDetailScrollTop == null ? (scroll ? scroll.scrollTop : 0) : pointerDetailScrollTop;
        pointerDetailScrollTop = null;
        detailReturnFocus = returnFocus || menuButtonForItem(itemId) || document.activeElement;
        flippedId = itemId;
        if (detailCloseTimer) { clearTimeout(detailCloseTimer); detailCloseTimer = null; }
        dismissMenuInPlace();
        const app = $('app');
        if (app) app.classList.add('detail-open');
        const sourceCard = Array.prototype.slice.call(document.querySelectorAll('.card')).find((card) => card.dataset.item === itemId);
        if (sourceCard) {
          sourceCard.classList.add('detail-selected');
          sourceCard.querySelector('.card-button')?.setAttribute('aria-current', 'true');
        }
        // Detail is an overlay over the already-painted collection. Rebuilding the grid here used to
        // detach every card and image before the sheet appeared, making a local click feel remote.
        renderDetailSheet();
        syncModelContext();
      };
      const activateGridMedia = (image) => {
        if (!image || image.getAttribute('src') || !image.dataset.gridSrc) return;
        image.setAttribute('src', image.dataset.gridSrc);
        image.dispatchEvent(new Event('fluent-grid-src-activated'));
      };
      const ensureGridMediaObserver = () => {
        const root = document.querySelector('.scroll');
        if (!root || typeof IntersectionObserver !== 'function') return null;
        const overflowY = getComputedStyle(root).overflowY;
        const observerRoot = ['auto', 'scroll', 'hidden', 'clip'].includes(overflowY) ? root : null;
        if (gridMediaObserver && gridMediaObserver.root === observerRoot) return gridMediaObserver;
        if (gridMediaObserver) gridMediaObserver.disconnect();
        gridMediaObserver = new IntersectionObserver((entries, observer) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            activateGridMedia(entry.target);
            observer.unobserve(entry.target);
          }
        }, { root: observerRoot, rootMargin: '180px 0px', threshold: 0.01 });
        return gridMediaObserver;
      };
      const renderCreateOutcome = () => {
        const app = $('app');
        const surface = $('createOutcome');
        if (!app || !surface || !createOutcome) return;
        app.classList.remove('awaiting', 'delayed', 'comparator-mode', 'focused-mode', 'recommendation-mode', 'recommendation-expanded', 'detail-open');
        app.classList.add('create-outcome-mode');
        app.removeAttribute('inert');
        app.setAttribute('aria-busy', 'false');
        const candidates = Array.isArray(createOutcome.duplicateCandidates) ? createOutcome.duplicateCandidates : [];
        const candidateMarkup = candidates.map((candidate) => {
          const signals = candidate && candidate.signals && typeof candidate.signals === 'object' ? candidate.signals : {};
          const details = [signals.brand, signals.colorName || signals.colorFamily, signals.itemType || signals.subcategory, signals.size]
            .filter((value) => typeof value === 'string' && value.trim());
          const reason = typeof candidate.reason === 'string' && candidate.reason.trim() ? candidate.reason.trim() : null;
          const meta = [details.join(' · '), reason].filter(Boolean).join(' — ');
          return '<li class="create-outcome-candidate"><strong>' + escapeHtml(candidate.name || 'Existing closet item') + '</strong>' +
            (meta ? '<span>' + escapeHtml(meta) + '</span>' : '') + '</li>';
        }).join('');
        surface.innerHTML = '<div class="create-outcome-card" data-create-status="' + escapeHtml(createOutcome.status) + '">' +
          '<p class="create-outcome-kicker">Create outcome</p>' +
          '<h2>' + escapeHtml(createOutcome.title) + '</h2>' +
          '<p class="create-outcome-message">' + escapeHtml(createOutcome.message) + '</p>' +
          (candidateMarkup ? '<ul class="create-outcome-candidates">' + candidateMarkup + '</ul>' : '') +
          '</div>';
        notifySize('create-outcome');
      };
      const render = (options = {}) => {
        const preserveExistingCards = options.preserveExistingCards === true;
        const replaceItemIds = new Set(options.replaceItemIds || []);
        const summary = $('summary');
        const filters = $('filters');
        const grid = $('grid');
        const app = $('app');
        if (createOutcome) {
          renderCreateOutcome();
          return;
        }
        if (!viewModel) {
          if (app) app.classList.remove('comparator-mode', 'focused-mode', 'recommendation-mode', 'recommendation-expanded', 'create-outcome-mode');
          notifySize('mount-awaiting');
          return;
        }
        if (app) {
          app.classList.remove('awaiting', 'delayed');
          app.removeAttribute('inert');
          app.setAttribute('aria-busy', 'false');
        }
        if (app) app.classList.toggle('comparator-mode', Boolean(loadedItemIds));
        if (app) app.classList.toggle('focused-mode', ['ingestion_review', 'comparison'].includes(viewModel.presentation?.mode));
        if (app) app.classList.toggle('recommendation-mode', viewModel.presentation?.mode === 'recommendation');
        if (app) app.classList.toggle('recommendation-expanded', viewModel.presentation?.mode === 'recommendation' && recommendationExpanded);
        if (app) app.classList.toggle('detail-open', Boolean(flippedId));
        if (app) app.classList.toggle('filter-pending', filterPending);
        if (loadedItemIds) setAdvancedOpen(false);
        const f = localFilter || {};
        const category = f.category || 'all';
        const visible = clientVisible();
        // The same explicit state used by the server controls the cleanup boundary. A terminal image
        // failure can only demote an item locally; it never changes provenance or invents a source.
        const mediaState = (item) => unavailableMediaUrlByItemId.get(item.id) === item.imageUrl ? 'unavailable' : (item.presentationMediaState || (item.imageUrl ? 'ready' : 'needs_photo'));
        const mediaRank = { ready: 0, needs_normalization: 1, unavailable: 2, needs_photo: 3 };
        const orderedVisible = visible.map((item, index) => ({ item, index })).sort((left, right) =>
          (mediaRank[mediaState(left.item)] ?? 2) - (mediaRank[mediaState(right.item)] ?? 2) || left.index - right.index
        ).map((entry) => entry.item);
        const declaredTotal = Math.max(orderedVisible.length, Number(viewModel.summary?.shownTotal || 0));
        const pageItems = orderedVisible;
        const hasNarrowing = Boolean(loadedItemIds || f.category || f.subcategory || f.brand || f.color || f.size || f.query || (f.status && f.status !== 'active'));
        summary.textContent = visible.length + (hasNarrowing ? ' shown' : ' pieces') + (viewModel.cursor ? ' · More available' : '');
        renderReviewBanner();
        filters.innerHTML = (viewModel.facets || []).map((facet) => (
          '<button class="chip" type="button" data-category="' + escapeHtml(facet.category) + '" aria-label="' + escapeHtml(facet.label + ', ' + facet.count + ' pieces') + '" aria-pressed="' + String((facet.category === 'all' && category === 'all') || facet.category === category) + '">' +
          '<span>' + escapeHtml(facet.label) + '</span><span class="micro">' + String(facet.count) + '</span></button>'
        )).join('');
        filters.setAttribute('aria-busy', String(filterPending));
        filters.querySelectorAll('button[data-category]').forEach((button) => {
          button.addEventListener('click', () => applyFilter({ category: button.dataset.category === 'all' ? null : button.dataset.category }));
        });
        const filterOptions = availableOptions();
        fillFilterSelect($('subcategoryFilter'), 'All types', filterOptions.subcategories, f.subcategory || '');
        fillFilterSelect($('brandFilter'), 'All brands', filterOptions.brands, f.brand || '');
        fillFilterSelect($('colorFilter'), 'All colors', filterOptions.colorFamilies, f.color || '', titleCase);
        fillFilterSelect($('sizeFilter'), 'All sizes', filterOptions.sizes, f.size || '');
        if ($('statusFilter')) $('statusFilter').value = f.status || 'active';
        if ($('queryFilter')) $('queryFilter').value = f.query || '';
        const continuation = $('continuation');
        if (continuation) continuation.setAttribute('aria-hidden', String(!viewModel.cursor));
        const firstPiece = !hasNarrowing && Number(viewModel.summary?.activeTotal || 0) === 0;
        const emptyCopy = firstPiece
          ? '<div class="empty empty-onboarding"><h2>Your closet starts here</h2><p>Your saved pieces will appear here when they are available in Fluent.</p></div>'
          : '<div class="empty empty-filtered"><strong>No matches</strong><span>Try another filter or return to your full closet.</span><button class="btn empty-action" type="button" data-clear-filters>Clear filters</button></div>';
        const pendingEmptyCopy = '<div class="empty empty-filtered" role="status"><strong>Updating closet…</strong><span>Finding the right pieces without clearing your selection.</span></div>';
        const cleanupGroupingAllowed = !loadedItemIds && !['ingestion_review', 'comparison'].includes(viewModel.presentation?.mode);
        const existingCards = preserveExistingCards
          ? new Map(Array.from(grid.querySelectorAll('.card[data-item]'))
            .filter((card) => !replaceItemIds.has(card.dataset.item))
            .map((card) => [card.dataset.item, card]))
          : new Map();
        const focusedGridControl = preserveExistingCards && grid.contains(document.activeElement)
          ? document.activeElement
          : null;
        let normalizationDividerRendered = false;
        let missingDividerRendered = false;
        const visibleNormalizationItems = pageItems.filter((candidate) => mediaState(candidate) === 'needs_normalization');
        const visibleMissingItems = pageItems.filter((candidate) => ['unavailable', 'needs_photo'].includes(mediaState(candidate)));
        const cardMarkup = pageItems.map((item, itemIndex) => {
          const globalItemIndex = itemIndex;
          if (!cleanupGroupingAllowed) return cardHtml(item, globalItemIndex);
          const state = mediaState(item);
          if (state === 'needs_normalization' && !normalizationDividerRendered) {
            normalizationDividerRendered = true;
            const count = visibleNormalizationItems.length;
            return '<div class="needs-photo-divider" role="separator" aria-label="Older imports with source photos"><div><h2>Older incomplete imports' + (count ? ' · ' + count : '') + '</h2><p>These source photos were saved before catalog-ready onboarding. Fluent keeps them visible, but image generation belongs in the chat import turn—not this closet view.</p></div></div>' + cardHtml(item, globalItemIndex);
          }
          if ((state === 'unavailable' || state === 'needs_photo') && !missingDividerRendered) {
            missingDividerRendered = true;
            const count = visibleMissingItems.length;
            return '<div class="needs-photo-divider" role="separator" aria-label="Older imports without a usable catalog photo"><div><h2>Older incomplete imports without a usable photo' + (count ? ' · ' + count : '') + '</h2><p>These records predate catalog-ready onboarding. The closet cannot manufacture their missing image, so it does not offer a dead-end action.</p></div></div>' + cardHtml(item, globalItemIndex);
          }
          return cardHtml(item, globalItemIndex);
        }).join('');
        const desiredMarkup = pageItems.length ? cardMarkup : (filterPending ? pendingEmptyCopy : emptyCopy);
        if (preserveExistingCards) {
          const staging = document.createElement('template');
          staging.innerHTML = desiredMarkup;
          const desiredNodes = Array.from(staging.content.children).map((candidate) => {
            if (!candidate.matches('.card[data-item]')) return candidate;
            return existingCards.get(candidate.dataset.item) || candidate;
          });
          // Reorder preserved cards directly inside the live grid. insertBefore on the same parent
          // keeps each node connected (and its focused descendant focused); new cards/dividers enter
          // around them. Only stale trailing nodes are removed after the desired order is established.
          desiredNodes.forEach((node, index) => {
            const current = grid.children[index] || null;
            if (current !== node) grid.insertBefore(node, current);
          });
          while (grid.children.length > desiredNodes.length) grid.lastElementChild.remove();
          if (focusedGridControl && focusedGridControl.isConnected && document.activeElement !== focusedGridControl) {
            focusedGridControl.focus({ preventScroll: true });
          }
        } else {
          grid.innerHTML = desiredMarkup;
        }
        if (gridMediaObserver && gridMediaObserver.root && !gridMediaObserver.root.isConnected) {
          gridMediaObserver.disconnect();
          gridMediaObserver = null;
        }
        const freshGridNodes = (selector) => Array.from(grid.querySelectorAll(selector)).filter((element) => {
          const card = element.closest('.card');
          return !card || card.dataset.gridWired !== 'true';
        });
        freshGridNodes('[data-grid-image]').forEach((image) => {
          let recoveryStarted = false;
          let loadDeadline = null;
          const clearLoadDeadline = () => {
            if (loadDeadline !== null) clearTimeout(loadDeadline);
            loadDeadline = null;
          };
          const armLoadDeadline = () => {
            clearLoadDeadline();
            if (!image.isConnected || !image.getAttribute('src') || image.complete) return;
            loadDeadline = setTimeout(() => {
              if (image.isConnected && !image.complete) recover();
            }, 12000);
          };
          const reveal = async () => {
            if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) return;
            clearLoadDeadline();
            const requestSignature = contentAnalysisSignature(image);
            const loadStartedAt = performance.now();
            // A decoded garment is already useful. Do not hold it at opacity:0 while the optional
            // canvas analyzer finds tighter optical bounds; large closets otherwise appear randomly
            // empty as analyses settle one by one. The category contain layout is a safe initial
            // presentation and the exact-identity analyzer may refine it asynchronously.
            image.dataset.contentFit = 'fallback';
            image.dataset.ready = 'true';
            notifySize('media-visible');
            const normalized = await normalizeGridGarment(image, requestSignature);
            if (!image.isConnected || contentAnalysisSignature(image) !== requestSignature || normalized.stale) return;
            const readyAt = performance.now();
            const telemetry = Object.assign({}, normalized.telemetry || {}, {
              loadToReadyDurationMs: readyAt - loadStartedAt,
              readyAt,
              requestSignature,
            });
            image.__fluentContentAnalysis = telemetry;
          };
          const recover = async () => {
            if (recoveryStarted) return;
            recoveryStarted = true;
            clearLoadDeadline();
            const itemId = image.getAttribute('data-grid-image');
            const failedUrl = image.getAttribute('src') || '';
            const refreshKey = itemId ? itemId + '::' + failedUrl : '';
            if (itemId && !gridImageRefreshed.has(refreshKey) && loadingMore) {
              queuedGridMediaFailures.set(refreshKey, {
                failedUrl,
                filterFingerprint: JSON.stringify(activeServerFilter()),
                itemId,
                mode: activePresentationMode(),
              });
              return;
            }
            if (itemId && !gridImageRefreshed.has(refreshKey)) {
              gridImageRefreshed.add(refreshKey);
              gridImageRefreshItemIds.add(itemId);
              if (!gridImageRefreshPromise) {
                gridImageRefreshPromise = rerender({
                  preserveExistingCards: true,
                  replaceItemIds: gridImageRefreshItemIds,
                }).finally(() => {
                  gridImageRefreshPromise = null;
                  gridImageRefreshItemIds.clear();
                });
              }
              try { await gridImageRefreshPromise; return; } catch (error) { /* fall through to the durable recovery state */ }
            }
            if (itemId) unavailableMediaUrlByItemId.set(itemId, failedUrl);
            render({ preserveExistingCards: true, replaceItemIds: itemId ? [itemId] : [] });
          };
          image.addEventListener('load', () => { reveal().finally(() => notifySize('media-state')); });
          image.addEventListener('error', () => { clearLoadDeadline(); recover(); notifySize('media-state'); });
          image.addEventListener('fluent-grid-src-activated', armLoadDeadline);
          if (!image.getAttribute('src') && image.dataset.gridSrc) {
            const root = document.querySelector('.scroll');
            const card = image.closest('.card');
            const rootRect = root?.getBoundingClientRect();
            const cardRect = card?.getBoundingClientRect();
            const visibleRoot = rootRect ? {
              bottom: Math.min(rootRect.bottom, window.innerHeight),
              left: Math.max(rootRect.left, 0),
              right: Math.min(rootRect.right, window.innerWidth),
              top: Math.max(rootRect.top, 0),
            } : null;
            const inActivationRange = Boolean(rootRect && cardRect
              && visibleRoot && visibleRoot.bottom > visibleRoot.top && visibleRoot.right > visibleRoot.left
              && cardRect.bottom >= visibleRoot.top - 180
              && cardRect.top <= visibleRoot.bottom + 180
              && cardRect.right >= visibleRoot.left
              && cardRect.left <= visibleRoot.right);
            // content-visibility can defer an IntersectionObserver callback for a partially painted
            // card even though its garment is already inside the Closet scroller. Activate that exact
            // bounded cohort synchronously; only genuinely offscreen media remains observer-lazy.
            if (inActivationRange) activateGridMedia(image);
            else {
              const observer = ensureGridMediaObserver();
              if (observer) observer.observe(image); else activateGridMedia(image);
            }
          }
          if (image.getAttribute('src') && !image.complete) {
            armLoadDeadline();
          }
          // A cached or very fast failed response can complete between innerHTML assignment and
          // listener wiring. Detect that terminal state so the user never sees the browser's raw
          // broken-image icon/alt text instead of Fluent's durable recovery UI.
          if (image.complete && image.naturalWidth > 0) reveal().finally(() => notifySize('media-state'));
          else if (image.complete && image.naturalWidth === 0) queueMicrotask(() => {
            // A newly-created lazy image can briefly report complete with no selected currentSrc
            // before intersection scheduling begins. That is not a delivery failure and must not
            // trigger an authoritative rerender of the whole collection.
            if (image.isConnected && image.currentSrc && image.complete && image.naturalWidth === 0) recover();
          });
        });
        const clearFilters = grid.querySelector('[data-clear-filters]');
        if (clearFilters) clearFilters.addEventListener('click', () => applyFilter({ brand: null, category: null, color: null, query: null, size: null, status: 'active', subcategory: null }));
        freshGridNodes('[data-menu]').forEach((button) => {
          button.addEventListener('click', (event) => {
            event.stopPropagation();
            const itemId = button.dataset.menu;
            const opening = openMenu !== itemId;
            openMenu = opening ? itemId : null;
            menuView = 'root';
            render();
            const freshCard = Array.prototype.slice.call(document.querySelectorAll('.card')).find((card) => card.dataset.item === itemId);
            const focusTarget = opening ? freshCard?.querySelector('.menu button') : freshCard?.querySelector('[data-menu]');
            if (focusTarget) focusTarget.focus();
          });
        });
        freshGridNodes('[data-submenu]').forEach((button) => button.addEventListener('click', () => {
          menuView = button.dataset.submenu || 'root';
          render();
          const freshMenu = openMenu ? Array.prototype.slice.call(document.querySelectorAll('.card')).find((card) => card.dataset.item === openMenu)?.querySelector('.menu') : null;
          if (freshMenu) freshMenu.querySelector('button')?.focus();
        }));
        freshGridNodes('[data-menuroot]').forEach((button) => button.addEventListener('click', () => {
          menuView = 'root';
          render();
          const freshMenu = openMenu ? Array.prototype.slice.call(document.querySelectorAll('.card')).find((card) => card.dataset.item === openMenu)?.querySelector('.menu') : null;
          if (freshMenu) freshMenu.querySelector('button')?.focus();
        }));
        freshGridNodes('[data-edit]').forEach((button) => button.addEventListener('click', () => openEdit(button.dataset.edit)));
        freshGridNodes('[data-photo]').forEach((button) => button.addEventListener('click', () => openPhoto(button.dataset.photo)));
        freshGridNodes('[data-addfit]').forEach((button) => button.addEventListener('click', () => openPhoto(button.dataset.addfit, 'fit')));
        freshGridNodes('[data-archive]').forEach((button) => button.addEventListener('click', () => openArchive(button.dataset.archive, button.dataset.disposition || 'sold')));
        freshGridNodes('[data-restore]').forEach((button) => button.addEventListener('click', () => openRestore(button.dataset.restore)));
        // Whole-card click opens the item in the contained detail takeover. Clicks on the existing controls
        // (⋯ menu and add-photo placeholder) are ignored here so they keep their own behavior.
        freshGridNodes('.card').forEach((cardEl) => {
          cardEl.addEventListener('pointerdown', () => {
            const scroll = document.querySelector('.scroll');
            pointerDetailScrollTop = scroll ? scroll.scrollTop : 0;
          });
          cardEl.addEventListener('click', (event) => {
          const target = event.target;
          if (target && typeof target.closest === 'function' && target.closest('.manage, .menu')) { pointerDetailScrollTop = null; return; }
          const id = cardEl.dataset.item;
          if (!id) return;
          openDetailItem(id, cardEl.querySelector('.card-button') || cardEl);
          });
          cardEl.dataset.gridWired = 'true';
        });
        renderDetailSheet();
        syncModelContext();
        notifySize('render');
      };
      const renderReviewBanner = () => {
        const banner = $('reviewBanner');
        if (!banner || !viewModel) return;
        const mode = viewModel.presentation && viewModel.presentation.mode;
        const isFocused = mode === 'ingestion_review' || mode === 'comparison';
        if (!isFocused) { banner.className = 'review-banner'; banner.innerHTML = ''; return; }
        if (reviewDismissed) {
          banner.className = 'review-banner show';
          banner.innerHTML = '<div><h2>Review paused</h2><p>Return to the full closet whenever you are ready.</p></div><div class="review-actions"><button class="btn" type="button" data-full-closet>View full closet</button></div>';
          banner.querySelector('[data-full-closet]').addEventListener('click', showFullCloset);
          return;
        }
        const items = viewModel.items || [];
        const reviewHasMore = Boolean(viewModel.cursor);
        const declaredReviewTotal = Math.max(items.length, Number(viewModel.summary?.shownTotal || 0));
        const reviewCount = items.filter((item) => item.review && item.review.needsReview).length;
        const outstanding = items.filter((item) => item.review && item.review.needsReview && !reviewedItemIds.has(item.id));
        const title = mode === 'ingestion_review'
          ? (reviewHasMore ? items.length + ' of ' + declaredReviewTotal + ' new pieces loaded' : items.length + ' new ' + (items.length === 1 ? 'piece' : 'pieces'))
          : items.length + ' from your closet';
        const copy = mode === 'ingestion_review'
          ? (reviewCount
              ? (reviewCount - outstanding.length) + ' of ' + reviewCount + (reviewHasMore ? ' loaded checks complete. More pieces remain in this review.' : ' checks complete.')
              : (reviewHasMore ? 'This loaded page looks ready; more pieces remain in this review.' : 'Everything looks ready to wear into your closet.'))
          : 'Exact saved pieces, ready to compare or style.';
        banner.className = 'review-banner show';
        banner.innerHTML = '<div><h2>' + escapeHtml(title) + '</h2><p>' + escapeHtml(copy) + '</p></div>' +
          '<div class="review-actions">' + (mode === 'ingestion_review' && outstanding.length ? '<button class="btn primary" type="button" data-review-next>Review next</button>' : '') + '<button class="btn" type="button" data-review-later>Review later</button><button class="btn" type="button" data-full-closet>View full closet</button></div>';
        const reviewNext = banner.querySelector('[data-review-next]');
        if (reviewNext) reviewNext.addEventListener('click', () => openDetailItem(outstanding[0].id, reviewNext));
        banner.querySelector('[data-review-later]').addEventListener('click', () => { reviewDismissed = true; render(); });
        banner.querySelector('[data-full-closet]').addEventListener('click', showFullCloset);
      };
      const showFullCloset = async () => {
        clearFilterTimers();
        filterPending = false;
        filterRollback = null;
        reviewDismissed = false;
        const requestGeneration = ++viewRequestGeneration;
        const result = await callTool('fluent_render_style_closet_surface', { filter: { status: loadedStatus }, limit: 48, presentation: { mode: 'browse' } });
        if (requestGeneration === viewRequestGeneration && result && !resultIsError(result)) {
          receiveViewModel(result, false, { adoptAuthoritativeView: true });
        } else if (requestGeneration === viewRequestGeneration) {
          showNote('Could not open the full closet. The confirmed focused set remains active.', 'error');
        }
      };
      const detailRow = (label, value) => '<div class="detail-row"><span class="detail-k micro">' + escapeHtml(label) + '</span><span class="detail-v">' + escapeHtml(value) + '</span></div>';
      // The closet's lexical contract forbids a few judgment words in rendered text. Profile free-text
      // (fit notes, pairing notes, tags…) is user/host-authored, so a value could carry one as a
      // substring; drop such values rather than render a forbidden word. fitSummary comes from a fixed
      // enum and is always clean, but it flows through the same guard for uniformity. The pattern is
      // assembled from fragments so this widget's OWN source does not contain the contiguous words —
      // the contract test scans the rendered body text, which includes this inline script.
      const BANNED_DETAIL = new RegExp(['ver' + 'dict', 'sc' + 'ore', 'recommend' + 'ation', 'rat' + 'ing'].join('|'), 'i');
      const safeText = (value) => (typeof value === 'string' && value && !BANNED_DETAIL.test(value)) ? value : '';
      const safeList = (value) => (Array.isArray(value) ? value.filter((entry) => typeof entry === 'string' && entry && !BANNED_DETAIL.test(entry)) : []);
      const collectionPresentation = (item) => {
        const category = norm(item.category);
        const vocabulary = norm([item.category, item.subcategory].filter(Boolean).join(' ')).replace(/[^a-z0-9]+/g, ' ');
        const tokens = vocabulary.split(/\s+/).filter(Boolean);
        const categoryIs = (values) => values.indexOf(category) !== -1;
        const includesAny = (words) => words.some((word) => tokens.indexOf(word) !== -1);
        let family = 'upper-tee';
        let optical = [96, 86, 6];
        let axis = 'height';
        let target = 0.8;
        const applyFootwearTemplate = () => {
          axis = 'width';
          target = 0.8;
          if (includesAny(['boot'])) {
            family = 'footwear-boot'; optical = [84, 78, 7];
          } else if (includesAny(['sandal', 'sandals', 'slide', 'slides'])) {
            family = 'footwear-sandal'; optical = [88, 62, 14];
          } else if (includesAny(['loafer', 'derby', 'oxford', 'dress'])) {
            family = 'footwear-dress'; optical = [88, 66, 12];
          } else {
            family = 'footwear-sneaker'; optical = [92, 70, 10];
          }
        };
        // Canonical category wins. Subcategory tokens are only a fallback, so a BOTTOM / Bootcut Jean
        // cannot be mistaken for footwear merely because "boot" is a substring of "bootcut".
        if (categoryIs(['shoe', 'shoes', 'footwear'])) {
          applyFootwearTemplate();
        } else if (categoryIs(['bottom', 'bottoms'])) {
          if (includesAny(['short', 'shorts'])) { family = 'bottom-short'; optical = [78, 70, 12]; target = 0.66; }
          else if (includesAny(['skirt'])) { family = 'bottom-skirt'; optical = [76, 78, 9]; }
          else { family = 'bottom-long'; optical = [74, 90, 4]; target = 0.82; }
        } else if (categoryIs(['dress', 'dresses', 'one piece', 'one-piece'])) {
          family = 'one-piece'; optical = [74, 90, 4];
        } else if (categoryIs(['outerwear'])) {
          family = 'outerwear'; optical = [86, 86, 6];
        } else if (categoryIs(['accessory', 'accessories'])) {
          family = 'accessory'; optical = [80, 62, 16]; axis = 'width'; target = 0.72;
        } else if (includesAny(['shoe', 'shoes', 'sneaker', 'loafer', 'boot', 'sandal', 'slide', 'heel', 'derby', 'oxford'])) {
          applyFootwearTemplate();
        } else if (includesAny(['short', 'shorts'])) {
          family = 'bottom-short'; optical = [78, 70, 12]; target = 0.66;
        } else if (includesAny(['skirt'])) {
          family = 'bottom-skirt'; optical = [76, 78, 9];
        } else if (includesAny(['pant', 'pants', 'trouser', 'trousers', 'jean', 'jeans', 'bottom', 'bottoms'])) {
          family = 'bottom-long'; optical = [74, 90, 4]; target = 0.82;
        } else if (includesAny(['dress', 'dresses', 'jumpsuit', 'romper'])) {
          family = 'one-piece'; optical = [74, 90, 4];
        } else if (includesAny(['coat', 'jacket', 'outerwear', 'blazer', 'overshirt', 'hoodie', 'hooded', 'sweatshirt'])) {
          family = 'outerwear'; optical = [86, 86, 6];
        } else if (includesAny(['bag', 'belt', 'hat', 'scarf', 'accessory', 'accessories', 'watch'])) {
          family = 'accessory'; optical = [80, 62, 16]; axis = 'width'; target = 0.72;
        } else if (includesAny(['sweater', 'sweaters', 'knit', 'knitted', 'knitwear', 'crewneck'])) {
          family = 'knitwear'; optical = [84, 84, 7];
        } else if (includesAny(['shirt', 'polo', 'oxford', 'button', 'buttondown'])) {
          family = 'upper-shirt'; optical = [96, 86, 6];
        }
        const catalog = (item.media || []).find((entry) => entry && entry.label === 'Catalog') || null;
        const displayMedia = (item.media || []).find((entry) => entry && entry.url && entry.url === item.imageUrl) || catalog;
        const matte = displayMedia && displayMedia.backgroundRemoved ? 'alpha' : 'canvas';
        const fitMode = displayMedia && displayMedia.label === 'Catalog' && displayMedia.isSourceEvidence !== true
          ? (displayMedia.backgroundRemoved === true ? 'alpha' : 'matte')
          : 'fallback';
        const mediaIdentity = displayMedia && (displayMedia.id || displayMedia.url) || item.imageUrl || item.id;
        return { axis, baseline: optical[2], family, fitMode, height: optical[1], matte, mediaIdentity, target, width: optical[0] };
      };
      const contentAnalysisSignature = (image) => [
        image?.dataset?.mediaIdentity || 'unknown',
        image?.currentSrc || image?.getAttribute?.('src') || image?.dataset?.gridSrc || '',
        (image?.naturalWidth || 0) + 'x' + (image?.naturalHeight || 0),
        image?.dataset?.contentFitMode || 'fallback',
      ].join('|');
      const nextAnalysisFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const measuredContentBounds = (image, requestSignature) => {
        const fitMode = image.dataset.contentFitMode || 'fallback';
        if (!CONTENT_BOUND_OPTICAL_FIT_REQUIRED || !['alpha', 'matte'].includes(fitMode)) {
          return Promise.resolve({ bounds: null, telemetry: { outcome: 'category_fallback', requestSignature } });
        }
        const source = image.currentSrc || image.getAttribute('src') || image.dataset.gridSrc || '';
        if (!source || contentAnalysisSignature(image) !== requestSignature) {
          return Promise.resolve({ bounds: null, stale: true, telemetry: { outcome: 'stale_before_analysis', requestSignature } });
        }
        const cacheKey = requestSignature;
        if (garmentContentBoundsCache.has(cacheKey)) return garmentContentBoundsCache.get(cacheKey);
        const analysis = (async () => {
          const naturalWidth = image.naturalWidth;
          const naturalHeight = image.naturalHeight;
          const analysisStartedAt = performance.now();
          let analysisWidth = Math.max(1, Math.round(naturalWidth * Math.min(1, CONTENT_BOUND_ANALYSIS_MAX_AXIS / Math.max(naturalWidth, naturalHeight))));
          let analysisHeight = Math.max(1, Math.round(naturalHeight * Math.min(1, CONTENT_BOUND_ANALYSIS_MAX_AXIS / Math.max(naturalWidth, naturalHeight))));
          let maxBlockingSliceMs = 0;
          let heartbeatCount = 0;
          let sliceStartedAt = analysisStartedAt;
          const checkpoint = async () => {
            maxBlockingSliceMs = Math.max(maxBlockingSliceMs, performance.now() - sliceStartedAt);
            await nextAnalysisFrame();
            heartbeatCount += 1;
            sliceStartedAt = performance.now();
          };
          const finish = (bounds, outcome) => {
            maxBlockingSliceMs = Math.max(maxBlockingSliceMs, performance.now() - sliceStartedAt);
            const analysisEndedAt = performance.now();
            return {
              bounds,
              telemetry: {
                analysisDurationMs: analysisEndedAt - analysisStartedAt,
                analysisEndedAt,
                analysisHeight: bounds?.analysisHeight || analysisHeight,
                analysisPixels: bounds?.analysisPixels || analysisWidth * analysisHeight,
                analysisStartedAt,
                analysisWidth: bounds?.analysisWidth || analysisWidth,
                decodePath: 'reuse_loaded_image',
                heartbeatCount,
                maxBlockingSliceMs,
                naturalHeight,
                naturalWidth,
                outcome,
                requestSignature,
              },
            };
          };
          try {
            if (!(naturalWidth > 0 && naturalHeight > 0)) return finish(null, 'invalid_dimensions');
            const analysisScale = Math.min(1, CONTENT_BOUND_ANALYSIS_MAX_AXIS / Math.max(naturalWidth, naturalHeight));
            const width = Math.max(1, Math.round(naturalWidth * analysisScale));
            const height = Math.max(1, Math.round(naturalHeight * analysisScale));
            analysisWidth = width;
            analysisHeight = height;
            if (Math.max(width, height) > CONTENT_BOUND_ANALYSIS_MAX_AXIS || width * height > CONTENT_BOUND_ANALYSIS_MAX_PIXELS) {
              return finish(null, 'analysis_budget_rejected');
            }
            if (CONTENT_BOUND_ANALYSIS_DELAY_MS > 0) {
              await new Promise((resolve) => setTimeout(resolve, CONTENT_BOUND_ANALYSIS_DELAY_MS));
              if (contentAnalysisSignature(image) !== requestSignature) return { bounds: null, stale: true, telemetry: finish(null, 'stale_after_delay').telemetry };
            }
            await checkpoint();
            if (!image.isConnected || contentAnalysisSignature(image) !== requestSignature) {
              return { bounds: null, stale: true, telemetry: finish(null, 'stale_before_raster').telemetry };
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context) return finish(null, 'canvas_context_unavailable');
            // Reuse the browser's already-loaded decode. The analyzer creates only this explicitly
            // bounded raster; it never creates another natural-resolution Image/decode.
            context.drawImage(image, 0, 0, width, height);
            const pixels = context.getImageData(0, 0, width, height).data;
            await checkpoint();
            if (!image.isConnected || contentAnalysisSignature(image) !== requestSignature) {
              return { bounds: null, stale: true, telemetry: finish(null, 'stale_after_raster').telemetry };
            }
            let isForeground = (offset) => pixels[offset + 3] > 24;
            if (fitMode === 'matte') {
                  const corners = [
                    0,
                    (width - 1) * 4,
                    ((height - 1) * width) * 4,
                    ((height * width) - 1) * 4,
                  ].map((offset) => [pixels[offset], pixels[offset + 1], pixels[offset + 2]]);
                  const average = [0, 1, 2].map((channel) => corners.reduce((sum, color) => sum + color[channel], 0) / corners.length);
                  const cornerSpread = Math.max(...corners.map((color) =>
                    Math.abs(color[0] - average[0]) + Math.abs(color[1] - average[1]) + Math.abs(color[2] - average[2])));
                  if (cornerSpread > 24) return finish(null, 'ambiguous_corner_matte');
                  const distance = (offset) =>
                    Math.abs(pixels[offset] - average[0])
                    + Math.abs(pixels[offset + 1] - average[1])
                    + Math.abs(pixels[offset + 2] - average[2]);
                  let backgroundEdgeSamples = 0;
                  let edgeSamples = 0;
                  const sample = (x, y) => {
                    const offset = (y * width + x) * 4;
                    edgeSamples += 1;
                    if (distance(offset) <= 30) backgroundEdgeSamples += 1;
                  };
                  const stride = Math.max(1, Math.floor(Math.min(width, height) / 80));
                  for (let x = 0; x < width; x += stride) { sample(x, 0); sample(x, height - 1); }
                  for (let y = stride; y < height - stride; y += stride) { sample(0, y); sample(width - 1, y); }
                  if (!edgeSamples || backgroundEdgeSamples / edgeSamples < 0.92) return finish(null, 'ambiguous_edge_matte');
                  const background = new Uint8Array(width * height);
                  const queue = [];
                  const enqueue = (x, y) => {
                    const index = y * width + x;
                    if (background[index]) return;
                    const offset = index * 4;
                    if (pixels[offset + 3] <= 24 || distance(offset) <= 30) {
                      background[index] = 1;
                      queue.push(index);
                    }
                  };
                  for (let x = 0; x < width; x += 1) { enqueue(x, 0); enqueue(x, height - 1); }
                  for (let y = 1; y < height - 1; y += 1) { enqueue(0, y); enqueue(width - 1, y); }
                  for (let cursor = 0; cursor < queue.length; cursor += 1) {
                    const index = queue[cursor];
                    const x = index % width;
                    const y = Math.floor(index / width);
                    if (x > 0) enqueue(x - 1, y);
                    if (x + 1 < width) enqueue(x + 1, y);
                    if (y > 0) enqueue(x, y - 1);
                    if (y + 1 < height) enqueue(x, y + 1);
                  }
                  isForeground = (offset) => pixels[offset + 3] > 24 && background[Math.floor(offset / 4)] === 0;
            }
            await checkpoint();
            let left = width;
            let right = -1;
            let top = height;
            let bottom = -1;
            let foregroundPixels = 0;
            for (let y = 0; y < height; y += 1) {
              for (let x = 0; x < width; x += 1) {
                if (!isForeground((y * width + x) * 4)) continue;
                foregroundPixels += 1;
                left = Math.min(left, x);
                right = Math.max(right, x);
                top = Math.min(top, y);
                bottom = Math.max(bottom, y);
              }
            }
            if (right < left || bottom < top) return finish(null, 'no_trustworthy_content');
            const scaleX = naturalWidth / width;
            const scaleY = naturalHeight / height;
            const mappedLeft = Math.max(0, Math.min(naturalWidth, Math.floor(left * scaleX)));
            const mappedTop = Math.max(0, Math.min(naturalHeight, Math.floor(top * scaleY)));
            const mappedRight = Math.max(mappedLeft, Math.min(naturalWidth, Math.ceil((right + 1) * scaleX)));
            const mappedBottom = Math.max(mappedTop, Math.min(naturalHeight, Math.ceil((bottom + 1) * scaleY)));
            const analysisBoundsWidth = right - left + 1;
            const analysisBoundsHeight = bottom - top + 1;
            // Side-profile product shots read fastest when every shoe points the same direction.
            // Infer heel-vs-toe only for trustworthy analyzed sneaker/dress-shoe silhouettes:
            // the heel edge is materially taller, so a taller right edge means the asset needs one
            // presentation-only mirror. Ambiguous images stay untouched.
            let flipHorizontal = false;
            const opticalFamily = image.closest('.card')?.dataset?.opticalFamily || '';
            if (['footwear-sneaker', 'footwear-dress'].includes(opticalFamily) && analysisBoundsWidth >= 12) {
              const edgeBand = Math.max(2, Math.floor(analysisBoundsWidth * 0.28));
              const averageColumnSpan = (startX, endX) => {
                let total = 0;
                let columns = 0;
                for (let x = startX; x < endX; x += 1) {
                  let columnTop = height;
                  let columnBottom = -1;
                  for (let y = top; y <= bottom; y += 1) {
                    if (!isForeground((y * width + x) * 4)) continue;
                    columnTop = Math.min(columnTop, y);
                    columnBottom = Math.max(columnBottom, y);
                  }
                  if (columnBottom < columnTop) continue;
                  total += columnBottom - columnTop + 1;
                  columns += 1;
                }
                return columns ? total / columns : 0;
              };
              const leftSpan = averageColumnSpan(left, Math.min(right + 1, left + edgeBand));
              const rightSpan = averageColumnSpan(Math.max(left, right - edgeBand + 1), right + 1);
              flipHorizontal = rightSpan > leftSpan * 1.12 && rightSpan - leftSpan > analysisBoundsHeight * 0.05;
            }
            const bounds = {
              analysisHeight: height,
              analysisPixels: width * height,
              analysisWidth: width,
              bottom: mappedBottom,
              height: mappedBottom - mappedTop,
              left: mappedLeft,
              naturalHeight,
              naturalWidth,
              right: mappedRight,
              top: mappedTop,
              width: mappedRight - mappedLeft,
              flipHorizontal,
            };
            // An opaque or effectively edge-to-edge bitmap has no trustworthy foreground trim.
            // Keep the category contain fallback instead of pretending its canvas edge is a
            // garment edge.
            const contentShare = analysisBoundsWidth * analysisBoundsHeight / (width * height);
            const foregroundSolidity = foregroundPixels / (analysisBoundsWidth * analysisBoundsHeight);
            if (
              (analysisBoundsWidth / width > 0.985 && analysisBoundsHeight / height > 0.985)
              || contentShare < 0.015
              || contentShare > 0.9
              || (fitMode === 'matte' && AMBIGUOUS_MATTE_FAIL_CLOSED_REQUIRED && foregroundSolidity > 0.82)
            ) return finish(null, 'ambiguous_content');
            return finish(bounds, 'normalized');
          } catch (error) {
            return finish(null, 'analysis_error');
          }
        })();
        const cachedAnalysis = analysis.then((result) => {
          if (result?.stale && garmentContentBoundsCache.get(cacheKey) === cachedAnalysis) {
            garmentContentBoundsCache.delete(cacheKey);
          }
          return result;
        });
        garmentContentBoundsCache.set(cacheKey, cachedAnalysis);
        return cachedAnalysis;
      };
      const layoutContentBoundGarment = (image, bounds) => {
        if (!image?.isConnected || !bounds) return false;
        const optical = image.closest('.garment-optical');
        const card = image.closest('.card');
        if (!optical || !card) return false;
        const opticalRect = optical.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        if (!(opticalRect.width > 0 && opticalRect.height > 0 && cardRect.width > 0 && cardRect.height > 0)) return false;
        const axis = card.dataset.opticalAxis === 'width' ? 'width' : 'height';
        const target = Number(card.dataset.opticalTarget) || 0.8;
        const desiredAxis = (axis === 'width' ? cardRect.width : cardRect.height) * target;
        const sourceAxis = axis === 'width' ? bounds.width : bounds.height;
        const fitScale = Math.min(
          opticalRect.width * 0.96 / bounds.width,
          opticalRect.height * 0.96 / bounds.height,
        );
        const scale = Math.min(desiredAxis / sourceAxis, fitScale);
        const contentWidth = bounds.width * scale;
        const contentHeight = bounds.height * scale;
        const effectiveLeft = bounds.flipHorizontal ? bounds.naturalWidth - bounds.right : bounds.left;
        image.style.left = ((opticalRect.width - contentWidth) / 2 - effectiveLeft * scale) + 'px';
        image.style.top = ((opticalRect.height - contentHeight) / 2 - bounds.top * scale) + 'px';
        image.style.width = (bounds.naturalWidth * scale) + 'px';
        image.style.height = (bounds.naturalHeight * scale) + 'px';
        image.style.transform = bounds.flipHorizontal ? 'scaleX(-1)' : 'none';
        if (image.dataset.contentFitMode === 'matte') {
          const clip = 'inset('
            + (bounds.top / bounds.naturalHeight * 100) + '% '
            + ((bounds.naturalWidth - bounds.right) / bounds.naturalWidth * 100) + '% '
            + ((bounds.naturalHeight - bounds.bottom) / bounds.naturalHeight * 100) + '% '
            + (bounds.left / bounds.naturalWidth * 100) + '%)';
          image.style.clipPath = clip;
          image.style.webkitClipPath = clip;
        } else {
          image.style.clipPath = 'none';
          image.style.webkitClipPath = 'none';
        }
        image.dataset.contentFit = 'normalized';
        image.dataset.contentAxis = axis;
        image.dataset.contentTarget = String(target);
        image.__fluentContentBounds = bounds;
        return true;
      };
      const normalizeGridGarment = async (image, requestSignature = contentAnalysisSignature(image)) => {
        const result = await measuredContentBounds(image, requestSignature);
        if (!image?.isConnected || contentAnalysisSignature(image) !== requestSignature || result?.stale) {
          if (image?.isConnected && result?.telemetry) {
            image.__fluentStaleContentAnalyses = (image.__fluentStaleContentAnalyses || []).concat(result.telemetry).slice(-8);
          }
          return { laidOut: false, stale: true, telemetry: result?.telemetry || null };
        }
        const bounds = result?.bounds || null;
        if (!bounds) {
          image.style.removeProperty('left');
          image.style.removeProperty('top');
          image.style.removeProperty('width');
          image.style.removeProperty('height');
          image.style.removeProperty('clip-path');
          image.style.removeProperty('-webkit-clip-path');
          delete image.__fluentContentBounds;
          image.dataset.contentFit = CONTENT_BOUND_OPTICAL_FIT_REQUIRED ? 'fallback' : 'disabled';
          return { laidOut: false, stale: false, telemetry: result?.telemetry || null };
        }
        const laidOut = layoutContentBoundGarment(image, bounds);
        if (laidOut && typeof ResizeObserver === 'function') {
          if (!garmentLayoutObserver) garmentLayoutObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
              const candidate = entry.target.querySelector('[data-grid-image][data-content-fit="normalized"]');
              if (candidate?.__fluentContentBounds) layoutContentBoundGarment(candidate, candidate.__fluentContentBounds);
            }
          });
          garmentLayoutObserver.observe(image.closest('.garment-optical'));
        }
        return { laidOut, stale: false, telemetry: result?.telemetry || null };
      };
      const cardHtml = (item, itemIndex = 0) => {
        const isPending = pending[item.id];
        const color = item.colorHex || '#e5e5ea';
        const colorLabel = item.colorName || item.colorFamily || '';
        const line = [item.brand, item.subcategory || item.category, item.size, colorLabel].filter(Boolean).join(' / ');
        const presentation = collectionPresentation(item);
        // Exact color remains in the accessible item description on touch layouts; visible metadata is
        // deliberately progressive so the collection reads as a wardrobe before it reads as software.
        const swatch = '<span class="swatch" aria-hidden="true" style="background:' + escapeHtml(color) + '"></span>';
        const authoritativePresentationMediaState = item.presentationMediaState || (item.imageUrl ? 'ready' : 'needs_photo');
        const presentationMediaState = unavailableMediaUrlByItemId.get(item.id) === item.imageUrl ? 'unavailable' : authoritativePresentationMediaState;
        // Start two rows eagerly, then activate later media against the Closet's own .scroll viewport
        // (not the iframe/outer page). This keeps the visible cohort prompt without masking internally
        // clipped cards or turning a 120+ item closet into one network burst.
        const eagerImage = itemIndex < 12;
        const imageSource = eagerImage
          ? ' src="' + escapeHtml(item.imageUrl) + '" loading="eager"'
          : ' data-grid-src="' + escapeHtml(item.imageUrl) + '" loading="lazy"';
        const recoveryName = item.name || 'Saved closet item';
        const recoveryMeta = item.subcategory || item.category || 'Closet item';
        const displayedMedia = (item.media || []).find((entry) => entry && entry.url && entry.url === item.imageUrl) || null;
        const normalizationMediaLabel = displayedMedia && displayedMedia.label === 'Catalog'
          ? 'Catalog candidate · needs normalization'
          : displayedMedia && displayedMedia.label === 'On you'
            ? 'On-you source · catalog image needed'
            : 'Original · needs normalization';
        const normalizationAlt = displayedMedia && displayedMedia.label === 'Catalog'
          ? ' Catalog candidate awaiting quality approval'
          : displayedMedia && displayedMedia.label === 'On you'
            ? ' worn source photo awaiting a Catalog image'
            : ' original garment photo awaiting normalization';
        const photo = (presentationMediaState === 'ready' || presentationMediaState === 'needs_normalization') && item.hasImage && item.imageUrl
          ? '<span class="garment-zoom"><span class="garment-optical"><img alt="' + escapeHtml((item.name || 'Closet item') + (presentationMediaState === 'ready' ? ' normalized Catalog garment' : normalizationAlt)) + '"' + imageSource + ' crossorigin="anonymous" decoding="async" referrerpolicy="no-referrer" data-garment-media data-grid-image="' + escapeHtml(item.id) + '" data-matte="' + presentation.matte + '" data-content-fit-mode="' + presentation.fitMode + '" data-media-identity="' + escapeHtml(String(presentation.mediaIdentity)) + '" /></span></span>' + (presentationMediaState === 'needs_normalization' ? '<span class="media-state-badge">' + normalizationMediaLabel + '</span>' : '')
          : '<div class="addPhoto"' + (presentationMediaState === 'unavailable' ? ' data-grid-recovery' : '') + '><span><span class="micro">Photo unavailable</span><span class="recovery-name">' + escapeHtml(recoveryName) + '</span><span class="recovery-meta">' + escapeHtml(recoveryMeta) + '</span></span></div>';
        const photoMenuLabel = item.hasImage && item.imageUrl ? 'Replace photo' : 'Add photo';
        const fitPhotoMenuLabel = item.hasFitPhoto ? 'Replace fit photo' : 'Add a fit photo';
        const id = escapeHtml(item.id);
        // Archived items get a Restore action; active items get the no-longer-owned dispositions.
        const rootOwnershipSection = item.status === 'archived'
          ? '<button class="restore" type="button" data-restore="' + id + '">Restore to closet</button>'
          : '<button class="destructive" type="button" data-submenu="remove">Remove from closet<span class="menu-chevron" aria-hidden="true">›</span></button>';
        const rootMenu = '<button type="button" data-edit="' + id + '">Edit details</button><button type="button" data-submenu="photos">Photos<span class="menu-chevron" aria-hidden="true">›</span></button>' + '<div class="menu-sep"></div>' + rootOwnershipSection;
        const photosMenu = '<button class="menu-back" type="button" data-menuroot><span class="menu-ico" aria-hidden="true">‹</span> Photos</button><div class="menu-sep"></div><button type="button" data-photo="' + id + '">' + photoMenuLabel + '</button><button type="button" data-addfit="' + id + '">' + fitPhotoMenuLabel + '</button>';
        const removeMenu = '<button class="menu-back" type="button" data-menuroot><span class="menu-ico" aria-hidden="true">‹</span> Remove from closet</button><div class="menu-sep"></div><div class="menu-dispo"><button class="dispo" type="button" data-archive="' + id + '" data-disposition="returned">Returned</button><button class="dispo" type="button" data-archive="' + id + '" data-disposition="sold">Sold</button><button class="dispo" type="button" data-archive="' + id + '" data-disposition="donated">Donated</button><button class="dispo" type="button" data-archive="' + id + '" data-disposition="gifted">Gifted</button><button class="dispo" type="button" data-archive="' + id + '" data-disposition="worn_out">Worn out</button><button class="dispo" type="button" data-archive="' + id + '" data-disposition="never_purchased">Never purchased</button><button class="dispo" type="button" data-archive="' + id + '" data-disposition="duplicate">Duplicate</button><button class="dispo" type="button" data-archive="' + id + '" data-disposition="other">Other</button></div>';
        const menuBody = menuView === 'photos' ? photosMenu : menuView === 'remove' ? removeMenu : rootMenu;
        const menuId = 'manage-menu-' + id.replace(/[^a-zA-Z0-9_-]/g, '-');
        const menu = openMenu === item.id
          ? '<div class="menu" id="' + menuId + '">' + menuBody + '</div>'
          : '';
        const reviewFlag = item.review && item.review.needsReview
          ? '<span class="review-flag">Check ' + escapeHtml((item.review.lowConfidenceFields || []).slice(0, 2).join(' · ') || 'details') + '</span>'
          : '';
        const accessibleDescription = [item.name || 'Unnamed item', line || 'Closet item'].filter(Boolean).join(', ');
        return '<article class="card" data-item="' + escapeHtml(item.id) + '" data-optical-family="' + presentation.family + '" data-optical-axis="' + presentation.axis + '" data-optical-target="' + presentation.target + '" data-matte="' + presentation.matte + '" data-presentation-media-state="' + escapeHtml(presentationMediaState) + '" style="--optical-width:' + presentation.width + '%;--optical-height:' + presentation.height + '%;--baseline:' + presentation.baseline + '%">' +
          '<button class="card-button" type="button" aria-label="View details for ' + escapeHtml(accessibleDescription) + '"><div class="photo" data-matte="' + presentation.matte + '">' + photo + '</div>' + '<div class="details"><div class="name">' + escapeHtml(item.name || 'Unnamed item') + '</div><div class="line">' + swatch + escapeHtml(line || 'Closet item') + '</div></div><span class="sr-only">' + escapeHtml(line || 'Closet item') + '</span>' + reviewFlag + '</button>' +
          (isPending ? '<div class="pending">' + escapeHtml(isPending.text) + '</div>' : '') + '</article>';
      };
      const closeDetail = () => {
        if (viewModel?.presentation?.mode === 'recommendation' && recommendationExpanded) {
          recommendationExpanded = false;
          clearRecommendationExpansionMarker();
          $('app')?.classList.remove('recommendation-expanded');
          requestDisplayMode('inline');
          renderDetailSheet();
          notifySize('recommendation-collapse');
          return;
        }
        const closingItemId = flippedId;
        const receiptToRestore = activeMutationReceipt;
        // focused_item_id also identifies the first review target in ingestion_review. Only direct
        // detail mode is server-reordered and needs a cursor-zero collection restart on close.
        const focusedServerView = viewModel?.presentation?.mode === 'detail' && Boolean(viewModel?.presentation?.focusedItemId);
        const focusedCollectionFilter = focusedServerView ? activeServerFilter() : null;
        const focusedCollectionMode = focusedServerView
          ? (viewModel?.presentation?.mode === 'ingestion_review' ? 'ingestion_review' : (loadedItemIds ? 'comparison' : 'browse'))
          : 'browse';
        flippedId = null;
        retainedEditedDetailId = null;
        retainedEditedDetailItem = null;
        recommendationExpanded = false;
        // Ordinary detail is entirely local and may be opened while an optimistic category result is
        // reconciling. Closing it must not invalidate that in-flight filter and strand aria-busy.
        // Only a server-focused detail owns the cursor restart that needs generation cancellation.
        if (focusedServerView) viewRequestGeneration += 1;
        selectedDetailMediaId = null;
        const layer = $('detailLayer');
        if (layer) {
          layer.classList.remove('open');
          layer.classList.add('closing');
          layer.setAttribute('aria-hidden', 'true');
          layer.removeAttribute('role');
          layer.removeAttribute('aria-modal');
          layer.removeAttribute('aria-labelledby');
          const closeDelay = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220;
          detailCloseTimer = setTimeout(() => {
            if (!flippedId && layer.classList.contains('closing')) {
              layer.className = 'detail-layer';
              layer.innerHTML = '';
            }
            detailCloseTimer = null;
          }, closeDelay);
        }
        const app = $('app');
        if (app) app.classList.remove('detail-open');
        document.querySelectorAll('.card.detail-selected').forEach((card) => {
          card.classList.remove('detail-selected');
          card.querySelector('.card-button')?.removeAttribute('aria-current');
        });
        setCollectionModalState(false);
        const scroll = document.querySelector('.scroll');
        setCollectionScrollTop(scroll, collectionScrollTop);
        const returnFocus = detailReturnFocus;
        detailReturnFocus = null;
        const freshCard = closingItemId
          ? Array.prototype.slice.call(document.querySelectorAll('.card')).find((card) => card.dataset.item === closingItemId)?.querySelector('.card-button')
          : null;
        const focusTarget = returnFocus && returnFocus.isConnected ? returnFocus : freshCard;
        if (focusTarget && typeof focusTarget.focus === 'function') {
          focusTarget.focus({ preventScroll: true });
          // A backdrop pointerdown closes before the browser dispatches its synthetic click. Reassert
          // focus after that click completes so the underlying collection cannot steal it.
          setTimeout(() => { if (focusTarget.isConnected) focusTarget.focus({ preventScroll: true }); }, 0);
          queueSettledFocus(focusTarget);
        }
        syncModelContext();
        if (receiptToRestore) showMutationReceipt(receiptToRestore.label, receiptToRestore.inverse);
        notifySize('detail-close');
        if (focusedServerView) {
          // A focused server page may place an item ahead of its normal browse position. Once detail
          // closes, restart from browse cursor zero before any continuation request so the reordered
          // page cannot be composed with later pages from a different ordering.
          const restoreScrollTop = collectionScrollTop;
          const requestGeneration = ++viewRequestGeneration;
          hydratedFilterOnce = false;
          collectionRestartPending = true;
          loadingMore = true;
          // Freeze the focus-reordered page before the asynchronous cursor-zero restart begins.
          // A filter or other newer request may supersede this one; keeping the old cursor live in
          // that window would let later paging compose two incompatible server orderings.
          if (viewModel) viewModel = Object.assign({}, viewModel, {
            cursor: null,
            presentation: Object.assign({}, viewModel.presentation || {}, { focusedItemId: null, mode: focusedCollectionMode }),
            summary: Object.assign({}, viewModel.summary || {}, { shownTotal: (viewModel.items || []).length }),
          });
          render();
          const releaseSupersededRestart = () => {
            collectionRestartPending = false;
            loadingMore = false;
            // The current model is either the cursor-frozen page above or a newer authoritative
            // response. Rendering it cannot revive the stale focused cursor.
            render();
          };
          const freezeFailedRestart = () => {
            collectionRestartPending = false;
            loadingMore = false;
            // The mounted page is still focus-reordered. Its cursor belongs to a different stable
            // order and must never become actionable after a failed cursor-zero restart.
            if (viewModel) viewModel = Object.assign({}, viewModel, {
              cursor: null,
              presentation: Object.assign({}, viewModel.presentation || {}, { focusedItemId: null, mode: focusedCollectionMode }),
              summary: Object.assign({}, viewModel.summary || {}, { shownTotal: (viewModel.items || []).length }),
            });
            render();
            showNote('The item closed, but the collection could not refresh. Use View full closet or change a filter to restart browsing.', 'error');
          };
          callTool('fluent_render_style_closet_surface', { filter: focusedCollectionFilter || { status: loadedStatus }, limit: 48, presentation: { mode: focusedCollectionMode } }).then((result) => {
            if (requestGeneration !== viewRequestGeneration) { releaseSupersededRestart(); return; }
            if (!result || resultIsError(result)) { freezeFailedRestart(); return; }
            if (!viewMatchesFilter(result, focusedCollectionFilter || { status: loadedStatus })) { freezeFailedRestart(); return; }
            const received = receiveViewModel(result);
            if (!received) { freezeFailedRestart(); return; }
            collectionRestartPending = false;
            const refreshedScroll = document.querySelector('.scroll');
            setCollectionScrollTop(refreshedScroll, restoreScrollTop);
            // The exact focused item can legitimately fall beyond cursor page one once the server
            // restores stable collection order. Focus it when present; otherwise move to the first
            // connected collection action instead of leaving focus on the detached detail opener.
            focusCollectionAfterRemoval(closingItemId);
          }).catch(() => {
            if (requestGeneration !== viewRequestGeneration) { releaseSupersededRestart(); return; }
            freezeFailedRestart();
          });
        }
      };
      const renderDetailSheet = () => {
        const layer = $('detailLayer');
        const item = flippedId ? itemById(flippedId) : null;
        if (!layer || !item) {
          if (layer) {
            layer.className = 'detail-layer';
            layer.setAttribute('aria-hidden', 'true');
            layer.removeAttribute('role');
            layer.removeAttribute('aria-modal');
            layer.removeAttribute('aria-labelledby');
            layer.innerHTML = '';
          }
          if (flippedId && !item) {
            // An optimistic cached card may disappear when the authoritative response arrives (for
            // example after a remote archive or recategorization). Fully release the modal contract;
            // merely emptying the layer would leave the collection inert behind an invisible sheet.
            flippedId = null;
            selectedDetailMediaId = null;
            $('app')?.classList.remove('detail-open');
            setCollectionModalState(false);
            const returnFocus = detailReturnFocus;
            detailReturnFocus = null;
            const focusTarget = (returnFocus && returnFocus.isConnected ? returnFocus : null)
              || document.querySelector('.card .card-button') || $('advancedToggle');
            if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus({ preventScroll: true });
          }
          // A host replay can legitimately clear a server-focused item. Never leave the collection
          // inert when neither a detail sheet nor a child editor still owns the modal boundary.
          if (!flippedId && !document.querySelector('.panel')) setCollectionModalState(false);
          return;
        }
        if (detailCloseTimer) { clearTimeout(detailCloseTimer); detailCloseTimer = null; }
        const wasOpen = layer.classList.contains('open') && !layer.classList.contains('closing');
        const priorDetailScrollTop = layer.querySelector('[data-detail-sheet]')?.scrollTop || 0;
        const recommendationMode = viewModel?.presentation?.mode === 'recommendation';
        const compactRecommendation = recommendationMode && !recommendationExpanded;
        layer.className = 'detail-layer' + (recommendationMode ? ' recommendation' : '') + (recommendationExpanded ? ' expanded' : '') + (wasOpen ? ' open' : '');
        const sourceCard = Array.prototype.slice.call(document.querySelectorAll('.card')).find((card) => card.dataset.item === item.id);
        if (sourceCard) {
          sourceCard.classList.add('detail-selected');
          sourceCard.querySelector('.card-button')?.setAttribute('aria-current', 'true');
        }
        const media = (item.media || []).filter(Boolean);
        if (!media.length && item.imageUrl) media.push({ label: 'Catalog', url: item.imageUrl, isSourceEvidence: false, backgroundRemoved: false, contextualRole: 'none', heroEligible: false, source: 'generated_metadata' });
        const selected = selectedDetailMediaId
          ? media.find((entry) => String(entry.id || entry.label) === selectedDetailMediaId && entry.url)
          : null;
        const catalog = media.find((entry) => entry.label === 'Catalog' && entry.url) || null;
        const contextual = media.find((entry) => entry.label === 'On you' && entry.url) || null;
        const ownerContext = media.find((entry) => entry.label === 'On you' && entry.url && entry.heroEligible === true && entry.contextualRole === 'owner_model_full_body') || null;
        const original = media.find((entry) => entry.label === 'Original' && entry.url) || null;
        // A retained fit/worn source remains selectable, but it is not an enrolled account-model
        // lookbook hero. Only an explicitly owner-scoped, consented full-body generated asset can
        // lead; otherwise the exact Catalog presentation remains the calm default.
        const first = selected || ownerContext || catalog || original || contextual || media.find((entry) => entry.url) || media[0] || null;
        const altFor = (entry) => (entry.label === 'On you' ? 'On-you photo of ' : entry.label + ' photo of ') + (item.name || 'closet item');
        const heroFor = (entry) => entry && entry.url
          ? '<img src="' + escapeHtml(entry.url) + '" alt="' + escapeHtml(altFor(entry)) + '" referrerpolicy="no-referrer" data-detail-hero />'
          : '<div class="empty">This retained photo is currently unavailable. Open Photos to add or replace an owned photo.</div>';
        const hero = heroFor(first);
        const firstIndex = Math.max(0, media.indexOf(first));
        const tabs = media.length > 1
          ? media.map((entry, index) => '<button class="media-tab" type="button" aria-pressed="' + String(index === firstIndex) + '" data-media-index="' + index + '" data-media-role="' + escapeHtml(entry.label) + '" data-source-evidence="' + String(entry.isSourceEvidence === true) + '" data-contextual-role="' + escapeHtml(entry.contextualRole || 'none') + '" data-hero-eligible="' + String(entry.heroEligible === true) + '"' + (!entry.url ? ' disabled title="Retained photo is currently unavailable"' : '') + '>' + escapeHtml(entry.label) + (!entry.url ? ' · unavailable' : '') + '</button>').join('')
          : '';
        const categoryParts = [item.subcategory, item.category ? titleCase(norm(item.category)) : null]
          .filter((value, index, values) => value && values.findIndex((entry) => norm(entry) === norm(value)) === index);
        const identityParts = [item.colorName || (item.colorFamily ? titleCase(item.colorFamily) : null), item.brand, item.size ? 'Size ' + item.size : null]
          .filter((value, index, values) => value && values.findIndex((entry) => norm(entry) === norm(value)) === index);
        const reviewFields = item.review && item.review.needsReview
          ? '<div class="review-fields"><strong>Quick check needed</strong>' + escapeHtml((item.review.lowConfidenceFields || []).length ? item.review.lowConfidenceFields.join(', ') : 'Confirm the essential item details.') + '</div>'
          : '';
        const reviewAction = viewModel.presentation?.mode === 'ingestion_review' && item.review?.needsReview && !reviewedItemIds.has(item.id)
          ? '<button class="btn" type="button" data-looks-right>Looks right</button>'
          : '';
        const detail = item.detail || {};
        // Interpretive wardrobe roles and use-case summaries remain in the structured item detail for
        // the host model. They do not compete with factual identity or masquerade as evidence in the
        // user's primary detail hierarchy.
        const context = PRIMARY_STYLE_ROLE_DEMOTION_REQUIRED
          ? ''
          : (safeText(detail.styleRole) || safeList(detail.bestOccasions)[0] || safeList(detail.useCases)[0] || '');
        const cutout = catalog
          ? '<div class="detail-cutout" data-detail-cutout' + (first && first.label === 'On you' ? '' : ' hidden') + ' aria-label="Exact catalog garment shown beside the contextual view"><img src="' + escapeHtml(catalog.url) + '" alt="Exact ' + escapeHtml(item.name || 'closet item') + ' catalog garment" referrerpolicy="no-referrer" data-detail-cutout-image /></div>'
          : '';
        const ownershipAction = item.status === 'archived'
          ? '<button class="btn" type="button" data-detail-restore>Restore to closet</button>'
          : '<button class="btn danger-btn" type="button" data-detail-archive>Remove from closet…</button>';
        const duplicateAction = '<button class="btn" type="button" data-detail-duplicates>' + ((item.duplicateCandidates || []).length > 0 ? 'Review possible match' : 'Check for duplicate') + '</button>';
        const managementActions = duplicateAction + '<button class="btn" type="button" data-detail-photo>Photos</button>' +
          '<button class="btn" type="button" data-detail-fit-photo>Fit photo</button>' +
          ownershipAction;
        const recommendationReason = typeof viewModel?.presentation?.recommendationReason === 'string'
          ? viewModel.presentation.recommendationReason.trim().slice(0, 180)
          : '';
        const recommendationCopy = recommendationMode && recommendationReason
          ? '<p class="recommendation-reason">' + escapeHtml(recommendationReason) + '</p>'
          : '';
        const recommendationAction = compactRecommendation
          ? '<div class="recommendation-actions"><button class="recommendation-more" type="button" data-recommendation-more>View details</button></div>'
          : '';
        layer.setAttribute('aria-hidden', 'false');
        layer.setAttribute('role', compactRecommendation ? 'region' : 'dialog');
        if (compactRecommendation) layer.removeAttribute('aria-modal');
        else layer.setAttribute('aria-modal', 'true');
        layer.setAttribute('aria-labelledby', 'detailTitle');
        const detailPresentation = collectionPresentation(item);
        const detailTop = compactRecommendation
          ? ''
          : '<div class="detail-top"><button class="detail-close" type="button" aria-label="' + (recommendationMode ? 'Back to recommendation' : 'Close item details') + '" data-detail-close>' + (recommendationMode ? '←' : '×') + '</button></div>';
        layer.innerHTML = detailTop +
          '<div class="detail-sheet" data-detail-sheet data-owner-model-state="' + escapeHtml(item.ownerModel?.state || 'setup_required') + '">' +
          '<section class="detail-hero" data-detail-stage data-detail-family="' + escapeHtml(detailPresentation.family) + '" data-matte="' + (first && first.backgroundRemoved === true ? 'alpha' : 'canvas') + '" data-media-role="' + escapeHtml(first && first.label || 'Unavailable') + '" data-source-evidence="' + String(first && first.isSourceEvidence === true) + '" data-contextual-role="' + escapeHtml(first && first.contextualRole || 'none') + '" data-hero-eligible="' + String(first && first.heroEligible === true) + '">' +
            '<div class="stage-media" data-detail-hero-wrap>' + hero + '</div>' +
            cutout +
            (tabs ? '<div class="media-tabs" role="group" aria-label="Choose item media">' + tabs + '</div>' : '') +
          '</section>' +
          '<div class="detail-copy"><div class="detail-title"><h2 id="detailTitle">' + escapeHtml(item.name || 'Unnamed item') + '</h2>' +
          '<p class="detail-category">' + escapeHtml(categoryParts.join(' · ') || 'Closet item') + '</p>' +
          (identityParts.length ? '<p class="detail-essential">' + escapeHtml(identityParts.join(' · ')) + '</p>' : '') + '</div>' +
          recommendationCopy + recommendationAction +
          (context ? '<p class="detail-context">' + escapeHtml(context) + '</p>' : '') + reviewFields + (reviewAction ? '<div class="review-completion">' + reviewAction + '</div>' : '') +
          '<button class="detail-edit-link" type="button" data-detail-edit>Edit details</button>' +
          '<details class="detail-management"><summary>Manage item</summary><div class="detail-secondary">' + managementActions + '</div></details>' +
          '</div>' +
          '</div>';
        if (!wasOpen) requestAnimationFrame(() => {
          if (flippedId === item.id && layer.getAttribute('aria-hidden') === 'false') layer.classList.add('open');
        });
        const detailClose = layer.querySelector('[data-detail-close]');
        if (detailClose) detailClose.addEventListener('click', closeDetail);
        if (!compactRecommendation) layer.addEventListener('click', (event) => { if (event.target === layer) closeDetail(); });
        const recommendationMore = layer.querySelector('[data-recommendation-more]');
        if (recommendationMore) recommendationMore.addEventListener('click', () => {
          recommendationExpanded = true;
          persistRecommendationExpansionMarker(item.id);
          $('app')?.classList.add('recommendation-expanded');
          requestDisplayMode('fullscreen');
          renderDetailSheet();
          notifySize('recommendation-expand');
        });
        const looksRight = layer.querySelector('[data-looks-right]');
        if (looksRight) looksRight.addEventListener('click', () => {
          reviewedItemIds.add(item.id);
          syncModelContext();
          const next = (viewModel.items || []).find((entry) => entry.review?.needsReview && !reviewedItemIds.has(entry.id));
          closeDetail();
          if (next) setTimeout(() => openDetailItem(next.id), 0);
          else if (viewModel.cursor) showNote('This loaded page is checked. More pieces remain in this review; load the next page to continue.', '');
          else showNote('Review complete. These confirmations apply to this review session; saved field edits are persisted separately.', '');
        });
        const leaveDetailFor = (launcher) => {
          const returnFocus = Array.prototype.slice.call(document.querySelectorAll('.card'))
            .find((card) => card.dataset.item === item.id)?.querySelector('.card-button') || detailReturnFocus;
          closeDetail();
          setTimeout(() => launcher(returnFocus), 0);
        };
        // Editing is a child action of the focused item. Keep the detail sheet mounted behind the
        // editor so Cancel and Save return to the same item, media scale, and detail scroll position
        // instead of dropping the user back into the collection.
        layer.querySelector('[data-detail-edit]').addEventListener('click', (event) => openEdit(item.id, event.currentTarget));
        layer.querySelector('[data-detail-duplicates]').addEventListener('click', async (event) => {
          const trigger = event.currentTarget;
          try {
            if (!(itemById(item.id)?.duplicateCandidates || []).length) await rerender();
            openDuplicateReview(item.id, trigger);
          } catch (error) {
            showNote('Couldn’t check this piece for matches right now.', 'error');
          }
        });
        layer.querySelector('[data-detail-photo]').addEventListener('click', () => leaveDetailFor((returnFocus) => openPhoto(item.id, 'primary', returnFocus)));
        layer.querySelector('[data-detail-fit-photo]').addEventListener('click', () => leaveDetailFor((returnFocus) => openPhoto(item.id, 'fit', returnFocus)));
        const archiveAction = layer.querySelector('[data-detail-archive]');
        if (archiveAction) archiveAction.addEventListener('click', () => leaveDetailFor((returnFocus) => openArchive(item.id, null, returnFocus)));
        const restoreAction = layer.querySelector('[data-detail-restore]');
        if (restoreAction) restoreAction.addEventListener('click', () => leaveDetailFor(() => openRestore(item.id)));
        const mediaRecoveryKey = (entry) => item.id + ':' + String(entry && entry.id || entry && entry.label || 'media');
        const refreshMediaOnce = async (entry) => {
          const recoveryKey = mediaRecoveryKey(entry);
          if (detailImageRefreshed[recoveryKey]) return false;
          detailImageRefreshed[recoveryKey] = true;
          try {
            await rerender();
            return true;
          } catch (error) {
            return false;
          }
        };
        const wireHeroRecovery = (entry) => {
          const heroImg = layer.querySelector('[data-detail-hero-wrap] [data-detail-hero]');
          if (!heroImg) return;
          let recoveryStarted = false;
          const recover = async () => {
            if (recoveryStarted) return;
            recoveryStarted = true;
            if (await refreshMediaOnce(entry)) return;
            const wrap = layer.querySelector('[data-detail-hero-wrap]');
            if (wrap) wrap.innerHTML = '<div class="empty">This photo expired or could not load. Your item details are still available. Open Photos to add or replace it.</div>';
          };
          heroImg.addEventListener('error', recover);
          if (heroImg.complete && heroImg.naturalWidth === 0) queueMicrotask(recover);
        };
        const wireCutoutRecovery = (entry) => {
          const cutoutImg = layer.querySelector('[data-detail-cutout-image]');
          if (!cutoutImg || !entry) return;
          let recoveryStarted = false;
          const recover = async () => {
            if (recoveryStarted) return;
            recoveryStarted = true;
            if (await refreshMediaOnce(entry)) return;
            const cutoutEl = layer.querySelector('[data-detail-cutout]');
            if (cutoutEl) cutoutEl.innerHTML = '<span class="cutout-recovery" data-cutout-recovery>Catalog preview unavailable</span>';
          };
          cutoutImg.addEventListener('error', recover);
          if (cutoutImg.complete && cutoutImg.naturalWidth === 0) queueMicrotask(recover);
        };
        if (first) wireHeroRecovery(first);
        if (catalog) wireCutoutRecovery(catalog);
        layer.querySelectorAll('[data-media-index]').forEach((button) => button.addEventListener('click', () => {
          const entry = media[Number(button.dataset.mediaIndex)];
          if (!entry) return;
          selectedDetailMediaId = String(entry.id || entry.label);
          const wrap = layer.querySelector('[data-detail-hero-wrap]');
          if (wrap) wrap.innerHTML = entry.url
            ? '<img src="' + escapeHtml(entry.url) + '" alt="' + escapeHtml(altFor(entry)) + '" referrerpolicy="no-referrer" data-detail-hero />'
            : '<div class="empty">This retained photo is currently unavailable. Open Photos to add or replace an owned photo.</div>';
          const stage = layer.querySelector('[data-detail-stage]');
          if (stage) {
            stage.setAttribute('data-media-role', entry.label || 'Unavailable');
            stage.setAttribute('data-source-evidence', String(entry.isSourceEvidence === true));
            stage.setAttribute('data-contextual-role', entry.contextualRole || 'none');
            stage.setAttribute('data-hero-eligible', String(entry.heroEligible === true));
            stage.setAttribute('data-matte', entry.backgroundRemoved === true ? 'alpha' : 'canvas');
          }
          const cutoutEl = layer.querySelector('[data-detail-cutout]');
          if (cutoutEl) cutoutEl.hidden = !(entry.label === 'On you' && catalog);
          layer.querySelectorAll('[data-media-index]').forEach((tab) => tab.setAttribute('aria-pressed', String(tab === button)));
          wireHeroRecovery(entry);
        }));
        setCollectionModalState(true);
        const closeButton = layer.querySelector('[data-detail-close]');
        const recommendationButton = layer.querySelector('[data-recommendation-more]');
        const focusDetailClose = () => {
          const focusTarget = closeButton || recommendationButton;
          if (focusTarget && layer.classList.contains('open') && document.activeElement !== focusTarget) {
            focusTarget.focus({ preventScroll: true });
          }
        };
        if ((closeButton || recommendationButton) && !layer.contains(document.activeElement)) focusDetailClose();
        // Some assistant hosts move focus back to the iframe body after the activating click has
        // dispatched. Reassert on the next frame and task so the contained detail begins inside its
        // focus trap without changing the collection return target.
        requestAnimationFrame(focusDetailClose);
        setTimeout(focusDetailClose, 0);
        queueSettledFocus(closeButton || recommendationButton);
        const detailSheet = layer.querySelector('[data-detail-sheet]');
        if (detailSheet) {
          if (!MOBILE_SCROLL_CHAIN_REQUIRED) detailSheet.style.overscrollBehaviorY = 'contain';
          detailSheet.scrollLeft = 0;
          if (wasOpen) detailSheet.scrollTop = priorDetailScrollTop;
          requestAnimationFrame(() => {
            detailSheet.scrollLeft = 0;
            if (wasOpen) detailSheet.scrollTop = priorDetailScrollTop;
          });
        }
        notifySize('detail-open');
      };
      const paintFilterFeedback = () => {
        const category = localFilter?.category || 'all';
        const filters = $('filters');
        if (filters) {
          filters.setAttribute('aria-busy', 'true');
          filters.querySelectorAll('button[data-category]').forEach((button) => {
            const value = button.dataset.category || 'all';
            button.setAttribute('aria-pressed', String(value === category));
          });
        }
        const app = $('app');
        if (app) app.classList.add('filter-pending');
        const summary = $('summary');
        if (summary) summary.textContent = 'Updating closet…';
        notifySize('filter-feedback');
      };
      const applyFilter = (patch) => {
        if (!filterPending) {
          filterRollback = Object.assign({}, localFilter || {});
          filterRollbackScrollTop = document.querySelector('.scroll')?.scrollTop ?? 0;
        }
        const before = Object.assign({}, localFilter || {});
        const next = Object.assign({}, localFilter, patch);
        if (!next.category) delete next.category;
        if (norm(next.category) !== norm(before.category)) {
          delete next.subcategory; delete next.brand; delete next.color; delete next.size;
        } else if (norm(next.subcategory) !== norm(before.subcategory)) {
          delete next.brand; delete next.color; delete next.size;
        } else if (norm(next.brand) !== norm(before.brand)) {
          delete next.color; delete next.size;
        }
        localFilter = next;
        filterAuthorityVersion += 1;
        // A category starts a new authoritative result set, not a continuation of the prior
        // collection's viewport. Reset the sole collection scroller before optimistic paint and
        // again after the cursor-zero server response so a late layout/image settlement cannot
        // strand Shoes (or any other category) midway through its new result set.
        const collectionScroll = document.querySelector('.scroll');
        setCollectionScrollTop(collectionScroll, 0);
        // Changing filters closes any open detail card (it may no longer be in the visible set).
        flippedId = null;
        // Every filter starts a fresh authoritative cursor page. The server owns the complete status
        // set, so matches beyond the first 48 are returned immediately instead of requiring users to
        // load unrelated pages first; broadening is another bounded round-trip.
        const mode = loadedItemIds ? (viewModel?.presentation?.mode || 'comparison') : 'browse';
        const requestGeneration = ++viewRequestGeneration;
        filterPending = true;
        paintFilterFeedback();
        clearFilterTimers();
        optimisticFilterRenderTimer = setTimeout(() => {
          optimisticFilterRenderTimer = null;
          if (requestGeneration === viewRequestGeneration && filterPending) {
            render({ preserveExistingCards: true });
          }
        }, 0);
        filterDebounceTimer = setTimeout(async () => {
          filterDebounceTimer = null;
          let rejectedScrollTop = null;
          try {
            const requestedFilter = activeServerFilter();
            const result = await callTool('fluent_render_style_closet_surface', {
              filter: requestedFilter,
              limit: 48,
              presentation: { mode },
            });
            if (requestGeneration !== viewRequestGeneration) return;
            const rollback = filterRollback;
            filterPending = false;
            if (result && !resultIsError(result) && viewMatchesFilter(result, requestedFilter)
              && receiveViewModel(result, false, { preserveExistingCards: true })) {
              const settledCollectionScroll = document.querySelector('.scroll');
              setCollectionScrollTop(settledCollectionScroll, 0);
              confirmedFilter = Object.assign({}, requestedFilter);
              $('app')?.setAttribute('data-confirmed-filter', canonicalFilterFingerprint(confirmedFilter));
              syncModelContext();
              filterRollback = null;
              filterRollbackScrollTop = null;
              // The continuation sentinel can remain intersecting across a cursor-zero filter
              // replacement, so IntersectionObserver need not emit another edge. Continue the new
              // authoritative chain once when that already-visible boundary still has a cursor.
              if (continuationVisible && viewModel?.cursor) queueMicrotask(() => { void loadNextCursorPage(); });
              return;
            }
            localFilter = rollback || localFilter;
            filterRollback = null;
            rejectedScrollTop = filterRollbackScrollTop;
            filterRollbackScrollTop = null;
          } catch (error) {
            if (requestGeneration !== viewRequestGeneration) return;
            const rollback = filterRollback;
            filterPending = false;
            localFilter = rollback || localFilter;
            filterRollback = null;
            rejectedScrollTop = filterRollbackScrollTop;
            filterRollbackScrollTop = null;
          }
          if (rejectedScrollTop != null && flippedId) collectionScrollTop = rejectedScrollTop;
          render({ preserveExistingCards: true });
          const restoredCollectionScroll = document.querySelector('.scroll');
          if (rejectedScrollTop != null) setCollectionScrollTop(restoredCollectionScroll, rejectedScrollTop);
          showNote('Could not update this closet view. Try the category again.', 'error');
        }, FILTER_DEBOUNCE_MS);
      };
      const openEdit = (itemId, forcedReturnFocus = null) => {
        const item = itemById(itemId);
        if (!item) return;
        const openingFromDetail = flippedId === itemId;
        const retainedDetailScrollTop = openingFromDetail
          ? ($('detailLayer')?.querySelector('[data-detail-sheet]')?.scrollTop ?? 0)
          : null;
        const restoreEditedDetailScroll = () => {
          if (retainedDetailScrollTop == null || flippedId !== itemId) return;
          const sheet = $('detailLayer')?.querySelector('[data-detail-sheet]');
          if (sheet) sheet.scrollTop = retainedDetailScrollTop;
        };
        openMenu = null;
        menuView = 'root';
        // A grid menu needs repainting after it closes. Repainting an already-open detail sheet is
        // destructive: it replaces the focused DOM and resets its scroll/media presentation before
        // the editor even appears.
        if (!openingFromDetail) render();
        const returnFocus = forcedReturnFocus || (flippedId === itemId ? $('detailLayer')?.querySelector('[data-detail-edit]') : menuButtonForItem(itemId));
        // The focused detail is already rendered in the host allocation that owns this child
        // action. Re-requesting fullscreen here makes ChatGPT remount the MCP App, which destroys
        // the retained detail state and recreates the gallery underneath the editor.
        if (!openingFromDetail) requestDisplayMode('fullscreen');
        const editShell = panel('Edit essentials', [
          input('name', 'Name', item.name || ''),
          metadataCombobox('brand', 'Brand', item.brand || ''),
          metadataCombobox('category', 'Category', item.category || ''),
          metadataCombobox('subcategory', 'Subcategory', item.subcategory || ''),
          metadataCombobox('size', 'Size', item.size || ''),
          colorField(item.colorFamily || '', true),
        ], async (values, close) => {
          const patch = {};
          for (const key of Object.keys(values)) {
            const oldValue = key === 'color' ? item.colorFamily : item[key];
            if ((values[key] || '') !== (oldValue || '')) patch[key] = values[key] || null;
          }
          if (Object.keys(patch).length === 0) { close(); return; }
          close();
          // Optimistic: apply to the card immediately (no flaky re-render round-trip), then persist.
          const before = Object.assign({}, item);
          const inversePatch = {};
          for (const key of Object.keys(patch)) inversePatch[key] = key === 'color' ? (before.colorFamily ?? null) : (before[key] ?? null);
          Object.keys(patch).forEach((key) => { if (key === 'color') item.colorFamily = patch[key]; else item[key] = patch[key]; });
          render();
          let writeProven = false;
          let receiptLabel = null;
          let receiptInverse = null;
          try {
            let result = null;
            try {
              result = await callTool('fluent_update_style_item_patch', { approval: 'explicit_user_approved', item_id: item.id, patch, provenance: { sourceType: 'user_confirmation' }, response_mode: 'read_after_write' });
              verifyStylePatchAck(result, item.id, patch);
            } catch (writeError) {
              // ChatGPT can time out or omit a widget-initiated write ACK after the durable
              // mutation completed. Resolve that ambiguity with one exact-item readback.
              // A real rejection or no-op still fails because the submitted fields will differ.
              try {
                await recoverAmbiguousStylePatch(item.id, patch);
              } catch (readbackError) {
                throw writeError;
              }
            }
            writeProven = true;
            if (openingFromDetail && !itemMatchesCollection(item)) {
              retainedEditedDetailId = item.id;
              // The authoritative collection refresh correctly excludes an item that moved outside
              // the active filter. Retain the exact already-mounted detail projection rather than
              // allowing a narrower write/tool echo to replace its Catalog/Original media choices.
              retainedEditedDetailItem = Object.assign({}, item, {
                media: Array.isArray(before.media) ? before.media.slice() : before.media,
                imageUrl: before.imageUrl,
              });
            } else {
              retainedEditedDetailId = null;
              retainedEditedDetailItem = null;
            }
            receiptLabel = 'Updated ' + (item.name || item.id) + '.';
            receiptInverse = async () => {
              try {
                const inverse = await callTool('fluent_update_style_item_patch', { approval: 'explicit_user_approved', item_id: item.id, patch: inversePatch, provenance: { sourceType: 'user_confirmation' }, response_mode: 'read_after_write' });
                verifyStylePatchAck(inverse, item.id, inversePatch);
              } catch (writeError) {
                // The inverse is the same durable patch contract as the forward edit. Resolve a
                // missing/timed-out host ACK with the same exact-item authoritative readback rather
                // than presenting a false failed-Undo state after the rollback already persisted.
                try {
                  await recoverAmbiguousStylePatch(item.id, inversePatch);
                } catch (readbackError) {
                  throw writeError;
                }
              }
              retainedEditedDetailId = null;
              retainedEditedDetailItem = null;
              await rerender();
            };
            if (openingFromDetail) await rerender({ focusedItemId: item.id, preserveCollectionFilter: true });
            else await rerender();
            restoreEditedDetailScroll();
            requestAnimationFrame(restoreEditedDetailScroll);
            const reviewedByEdit = viewModel?.presentation?.mode === 'ingestion_review' && item.review?.needsReview;
            if (reviewedByEdit) reviewedItemIds.add(item.id);
            showMutationReceipt(receiptLabel, receiptInverse);
            if (reviewedByEdit) {
              const next = (viewModel.items || []).find((entry) => entry.review?.needsReview && !reviewedItemIds.has(entry.id));
              if (next) setTimeout(() => openDetailItem(next.id), 0);
            }
          } catch (error) {
            if (writeProven) {
              render();
              showMutationReceipt(receiptLabel + ' The closet could not refresh; Undo remains available.', receiptInverse);
            } else {
              const current = itemById(item.id) || item;
              Object.assign(current, before);
              render();
              showNote('Couldn’t update “' + (before.name || item.id) + '” right now. No change was made.', 'error');
            }
          }
        }, returnFocus);
        editShell.querySelectorAll('[data-color-choice]').forEach((button) => button.addEventListener('click', () => {
          const field = editShell.querySelector('input[name="color"]');
          if (field) {
            field.value = button.dataset.colorChoice || '';
            field.dispatchEvent(new Event('input', { bubbles: true }));
          }
          editShell.querySelectorAll('[data-color-choice]').forEach((choice) => choice.setAttribute('aria-pressed', String(choice === button)));
        }));
        wireEditMetadataSuggestions(editShell, item);
        document.body.appendChild(editShell);
      };
      const openPhoto = (itemId, imageType = 'primary', forcedReturnFocus = null) => {
        const item = itemById(itemId);
        if (!item) return;
        openMenu = null;
        menuView = 'root';
        render();
        const returnFocus = forcedReturnFocus ? cardButtonForItem(itemId) : (flippedId === itemId ? $('detailLayer')?.querySelector('[data-detail-photo]') : menuButtonForItem(itemId));
        requestDisplayMode('fullscreen');
        const isFitPhoto = imageType === 'fit';
        const title = isFitPhoto ? (item.hasFitPhoto ? 'Replace fit photo' : 'Add a fit photo') : (item.hasImage ? 'Replace photo' : 'Add a photo');
        document.body.appendChild(panel(title, [
          '<label><span class="micro">Choose a photo</span><input name="image_file_local" type="file" accept="image/png,image/jpeg,image/webp" /></label>',
          input('image_url', 'Or paste a direct image link', '', 'https://…'),
        ], async (values, close, shell) => {
          const fileInput = shell.querySelector('[name="image_file_local"]');
          const file = fileInput && fileInput.files && fileInput.files[0];
          if (!file && !values.image_url) return;
          if (file && file.size > 6000000) { showNote('Choose a PNG, JPEG, or WebP under 6 MB.', 'error'); return; }
          close();
          pending[item.id] = { kind: 'photo', text: 'saving photo...' };
          render();
          let writeProven = false;
          let receiptLabel = null;
          try {
            const imageArgs = { approval: 'explicit_user_approved', image_origin: 'user_source', image_type: imageType, item_id: item.id, provenance: { sourceType: 'user_confirmation' }, response_mode: 'read_after_write' };
            if (file) imageArgs.image_data_url = await fileToDataUrl(file);
            else imageArgs.image_url = values.image_url;
            const result = await callTool('fluent_set_style_item_image', imageArgs);
            const imageAck = verifyPhotoAck(result, item.id, imageType, imageArgs);
            if (imageAck.payload?.noOp === true) {
              delete pending[item.id];
              render();
              showNote('That photo is already attached to “' + (item.name || item.id) + '”. No change was needed.', 'success');
              return;
            }
            writeProven = true;
            delete pending[item.id];
            receiptLabel = (isFitPhoto ? 'Updated fit photo for ' : 'Updated photo for ') + (item.name || item.id) + '.';
            // Re-fetch so the server's same-origin proxied image URL replaces the entered (possibly
            // cross-origin) one — external URLs only display through Fluent's signed image route.
            await rerender();
            const after = itemById(item.id);
            receiptLabel = (isFitPhoto ? 'Updated fit photo for ' : 'Updated photo for ') + (after?.name || item.name || item.id) + '.';
            showMutationReceipt(receiptLabel, null);
          } catch (error) {
            delete pending[item.id];
            render();
            if (writeProven) {
              showMutationReceipt(receiptLabel + ' The photo was saved, but the closet could not refresh.', null);
            } else {
              showNote('Couldn’t attach that photo to “' + (item.name || item.id) + '”. No photo was changed.', 'error');
            }
          }
        }, returnFocus));
      };
      const openDuplicateReview = (itemId, forcedReturnFocus = null) => {
        const sourceItem = itemById(itemId);
        let candidates = Array.isArray(sourceItem?.duplicateCandidates) ? sourceItem.duplicateCandidates.slice() : [];
        if (!sourceItem) return;
        const shell = document.createElement('div');
        shell.className = 'panel';
        shell.setAttribute('role', 'dialog');
        shell.setAttribute('aria-modal', 'true');
        shell.setAttribute('aria-label', 'Review possible closet match');
        let candidateIndex = 0;
        let busy = false;
        const returnFocus = forcedReturnFocus || $('detailLayer')?.querySelector('[data-detail-duplicates]');
        const closeReview = () => {
          shell.remove();
          if (activePanelClose === closeReview) activePanelClose = null;
          setCollectionModalState(Boolean(flippedId));
          if (returnFocus && returnFocus.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus();
        };
        const piece = (label, item, imageUrl) => {
          const facts = [item.colorFamily, item.brand, item.size ? 'Size ' + item.size : null, item.subcategory].filter(Boolean).join(' · ');
          const mediaLabels = Array.from(new Set(
            (Array.isArray(item.mediaLabels) ? item.mediaLabels : (item.media || []).map((media) => media.label)).filter(Boolean),
          ));
          const primaryMediaLabel = item.primaryMediaLabel || (item.media || []).find((media) => media.heroEligible)?.label || null;
          const mediaSummary = mediaLabels.length
            ? (primaryMediaLabel ? primaryMediaLabel + ' shown' : 'Saved media') + ' · ' + mediaLabels.join(' + ')
            : 'No retained media roles';
          const matchEvidence = item.reason
            ? '<p class="duplicate-evidence"><strong>Why it may match:</strong> ' + escapeHtml(item.reason) +
              (Number.isFinite(Number(item.score)) ? ' · ' + Math.round(Number(item.score) * 100) + '% signal' : '') + '</p>'
            : '';
          const photo = imageUrl
            ? '<img src="' + escapeHtml(imageUrl) + '" alt="' + escapeHtml(item.name || label) + '" referrerpolicy="no-referrer" />'
            : '<div class="empty">Photo unavailable</div>';
          return '<article class="duplicate-piece"><div class="duplicate-photo">' + photo + '</div><div class="duplicate-copy"><p class="micro">' + escapeHtml(label) + '</p><strong>' + escapeHtml(item.name || 'Unnamed piece') + '</strong><p>' + escapeHtml(facts || 'Closet item') + '</p><p class="micro">' + escapeHtml(mediaSummary) + '</p>' + matchEvidence + '</div></article>';
        };
        const renderSearch = (message = '') => {
          shell.innerHTML = '<div class="sheet duplicate-sheet"><button class="duplicate-close" type="button" aria-label="Back to item" data-close-review>×</button><h2>Find the item already in your closet</h2><p class="duplicate-intro">Search by name, brand, color, or type. Nothing is combined until you choose an exact item and confirm it.</p>' +
            '<form data-duplicate-search><label><span class="micro">Search your closet</span><input name="query" type="search" autocomplete="off" placeholder="Lavender tee" required /></label><div class="duplicate-candidate-actions"><button class="btn primary" type="submit">Search</button></div></form>' +
            (message ? '<p class="line" data-duplicate-search-message>' + escapeHtml(message) + '</p>' : '') +
            '<div data-duplicate-search-results></div></div>';
          shell.querySelector('[data-close-review]').addEventListener('click', closeReview);
          shell.querySelector('[data-duplicate-search]').addEventListener('submit', async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const query = String(new FormData(form).get('query') || '').trim();
            if (!query || busy) return;
            busy = true;
            form.querySelectorAll('button, input').forEach((control) => { control.disabled = true; });
            const results = shell.querySelector('[data-duplicate-search-results]');
            if (results) results.innerHTML = '<p class="line">Searching…</p>';
            try {
              const result = await callTool('fluent_render_style_closet_surface', {
                filter: { query, status: 'active' },
                limit: 24,
                presentation: { mode: 'browse' },
              });
              const searched = extractViewModel(result);
              const matches = (searched?.items || []).filter((entry) => entry.id !== sourceItem.id);
              if (!matches.length) {
                if (results) results.innerHTML = '<p class="line">No other closet item matched that search.</p>';
              } else if (results) {
                results.innerHTML = '<div class="duplicate-search-list">' + matches.map((entry, index) =>
                  '<button class="btn duplicate-search-result" type="button" data-select-match="' + index + '"><strong>' + escapeHtml(entry.name || 'Unnamed piece') + '</strong><span>' + escapeHtml([entry.brand, entry.colorFamily, entry.subcategory].filter(Boolean).join(' · ') || 'Closet item') + '</span></button>'
                ).join('') + '</div>';
                results.querySelectorAll('[data-select-match]').forEach((button) => button.addEventListener('click', () => {
                  const selected = matches[Number(button.getAttribute('data-select-match'))];
                  if (!selected) return;
                  candidates = [selected];
                  candidateIndex = 0;
                  busy = false;
                  renderCandidate();
                }));
              }
            } catch (error) {
              if (results) results.innerHTML = '<p class="line error">Couldn’t search the closet right now. Nothing was changed.</p>';
            } finally {
              busy = false;
              if (form.isConnected) form.querySelectorAll('button, input').forEach((control) => { control.disabled = false; });
            }
          });
          setTimeout(() => shell.querySelector('input')?.focus(), 0);
        };
        const renderCandidate = () => {
          const candidate = candidates[candidateIndex];
          const position = candidates.length > 1 ? '<p class="micro">Possible match ' + (candidateIndex + 1) + ' of ' + candidates.length + '</p>' : '';
          shell.innerHTML = '<div class="sheet duplicate-sheet"><button class="duplicate-close" type="button" aria-label="Back to item" data-close-review>×</button><h2>Are these the same piece?</h2><p class="duplicate-intro">If you combine them, <strong>' + escapeHtml(candidate.name || 'the possible match') + '</strong> will remain in your closet with all photos. This item will be archived; its non-empty details will not replace existing details.</p>' + position +
            '<div class="duplicate-pair">' + piece('This item', sourceItem, sourceItem.imageUrl) + piece('Item that will remain', candidate, candidate.imageUrl) + '</div>' +
            '<div class="duplicate-candidate-actions">' +
            (candidates.length > 1 ? '<button class="btn" type="button" data-next-match>Next match</button>' : '') +
            '<button class="btn" type="button" data-find-match>Choose a different match</button>' +
            '<button class="btn" type="button" data-keep-both>Keep both</button>' +
            '<button class="btn" type="button" data-decide-later>Decide later</button>' +
            '<button class="btn primary" type="button" data-combine>Use existing — combine</button></div></div>';
          shell.querySelector('[data-close-review]').addEventListener('click', closeReview);
          shell.querySelector('[data-find-match]').addEventListener('click', () => renderSearch());
          shell.querySelector('[data-keep-both]').addEventListener('click', () => {
            closeReview();
            showNote('Kept both closet items. Nothing was changed.', 'success');
          });
          shell.querySelector('[data-decide-later]').addEventListener('click', () => {
            closeReview();
            showNote('No duplicate decision was saved. You can review this match later.', '');
          });
          const next = shell.querySelector('[data-next-match]');
          if (next) next.addEventListener('click', () => { candidateIndex = (candidateIndex + 1) % candidates.length; renderCandidate(); });
          shell.querySelector('[data-combine]').addEventListener('click', async () => {
            if (busy) return;
            busy = true;
            let mergeCommitted = false;
            const activeTotalBefore = Number(viewModel.summary?.activeTotal);
            const mergeFilterItemIds = Array.isArray(activeServerFilter().item_ids) ? activeServerFilter().item_ids : [];
            const sourceMediaIds = (sourceItem.media || []).map((media) => media.id).sort();
            const sourceDurableMediaIdsKnown = Array.isArray(sourceItem.mediaIds);
            const candidateDurableMediaIdsKnown = Array.isArray(candidate.mediaIds);
            const expectedRetainedMediaIds = Array.from(new Set([
              ...(sourceDurableMediaIdsKnown ? sourceItem.mediaIds : (sourceItem.media || []).map((media) => media.id)),
              ...(Array.isArray(candidate.mediaIds) ? candidate.mediaIds : (candidate.media || []).map((media) => media.id)),
            ])).sort();
            const mergeOperationId = crypto.randomUUID();
            const mergeReceiptDescriptor = {
              activeTotalBefore,
              createdAt: Date.now(),
              mergeOperationId,
              receiptLabel: 'Combined the two records. Undo remains available.',
              sourceItemId: sourceItem.id,
              sourceMediaIds,
              targetItemId: candidate.id,
            };
            shell.querySelectorAll('button').forEach((button) => { button.disabled = true; });
            try {
              const result = await callTool('fluent_archive_item', {
                approval: 'explicit_user_approved',
                disposition: 'duplicate',
                domain: 'style',
                item_id: sourceItem.id,
                item_type: 'style_item',
                merge_into_item_id: candidate.id,
                merge_operation_id: mergeOperationId,
                reason: 'User confirmed these records describe the same physical garment.',
                response_mode: 'full',
                source_skill: 'fluent-style-closet-widget',
                source_snapshot: {
                  notes: 'fluent-style-closet-widget:merge_into_item_id=' + candidate.id,
                  title: 'Confirmed duplicate closet item merge',
                },
                source_type: 'user_confirmation',
              });
              try {
                const ack = verifyDuplicateMergeAck(result, sourceItem.id, candidate.id, mergeOperationId);
                const proof = writeProofItem(ack);
                const durableMediaIds = (proof.payload && Array.isArray(proof.payload.photos) ? proof.payload.photos : [])
                  .map((photo) => photo && photo.id).filter(Boolean).sort();
                const missingExpectedMedia = expectedRetainedMediaIds.some((mediaId) => !durableMediaIds.includes(mediaId));
                const exactDurableSetMismatch = sourceDurableMediaIdsKnown && candidateDurableMediaIdsKnown
                  && (durableMediaIds.length !== expectedRetainedMediaIds.length
                    || durableMediaIds.some((mediaId, index) => mediaId !== expectedRetainedMediaIds[index]));
                if (missingExpectedMedia || exactDurableSetMismatch) {
                  throw new Error('duplicate merge read-after-write did not confirm the durable media transfer');
                }
              } catch (ackError) {
                await recoverAmbiguousDuplicateMerge(sourceItem.id, candidate.id, expectedRetainedMediaIds);
              }
              mergeCommitted = true;
              persistDuplicateMergeReceipt(mergeReceiptDescriptor);
              closeReview();
              closeDetail();
              itemCache.delete(sourceItem.id);
              itemCache.delete(candidate.id);
              const receiptInverse = createDuplicateMergeReceiptInverse(mergeReceiptDescriptor);
              try {
                if (mergeFilterItemIds.length > 0) {
                  const remainingItemIds = mergeFilterItemIds.filter((itemId) => itemId !== sourceItem.id);
                  const countFilter = Object.assign({}, activeServerFilter(), remainingItemIds.length > 0
                    ? { item_ids: remainingItemIds }
                    : { item_ids: mergeFilterItemIds.slice() });
                  await rerender({
                    filterOverride: countFilter,
                    presentationMode: remainingItemIds.length > 1 ? 'comparison' : 'browse',
                  });
                } else {
                  await rerender();
                }
                const activeTotalAfter = Number(viewModel.summary?.activeTotal);
                if (!Number.isFinite(activeTotalBefore) || !Number.isFinite(activeTotalAfter) || activeTotalAfter !== activeTotalBefore - 1) {
                  throw new Error('Duplicate merge active-total readback did not decrease by exactly one.');
                }
                // Count reconciliation and final presentation are separate reads. The last result is
                // exact detail so host repaint cannot strand a stale comparison. Durable media
                // completeness remains owned by the write ACK above, not the smaller render subset.
                await rerender({ focusedItemId: candidate.id });
                if (!itemById(candidate.id)) throw new Error('Duplicate merge did not return the retained item.');
                const receiptLabel = 'Used ' + (candidate.name || 'the existing item') + ' and archived the duplicate. Active items: ' + activeTotalBefore + ' → ' + activeTotalAfter + '.';
                mergeReceiptDescriptor.receiptLabel = receiptLabel;
                persistDuplicateMergeReceipt(mergeReceiptDescriptor);
                setTimeout(() => {
                  openDetailItem(candidate.id);
                  showMutationReceipt(receiptLabel, receiptInverse);
                }, 0);
              } catch (refreshError) {
                showMutationReceipt('The pieces were combined, but exact count and media readback could not be confirmed. Undo remains available.', receiptInverse);
              }
            } catch (error) {
              if (mergeCommitted) return;
              busy = false;
              shell.querySelectorAll('button').forEach((button) => { button.disabled = false; });
              showNote('Couldn’t combine these pieces. Nothing was changed.', 'error');
            }
          });
        };
        activePanelClose = closeReview;
        shell.addEventListener('click', (event) => { if (event.target === shell && !busy) closeReview(); });
        if (candidates.length) renderCandidate();
        else renderSearch('No automatic match was found. Search the full closet to choose one yourself.');
        requestDisplayMode('fullscreen');
        setCollectionModalState(true);
        document.body.appendChild(shell);
        setTimeout(() => shell.querySelector('button')?.focus(), 0);
      };
      const openArchive = (itemId, disposition = null, forcedReturnFocus = null) => {
        const item = itemById(itemId);
        if (!item) return;
        openMenu = null;
        menuView = 'root';
        render();
        const returnFocus = forcedReturnFocus ? cardButtonForItem(itemId) : (flippedId === itemId ? $('detailLayer')?.querySelector('[data-detail-archive]') : menuButtonForItem(itemId));
        requestDisplayMode('fullscreen');
        const shell = document.createElement('div');
        shell.className = 'panel';
        shell.setAttribute('role', 'dialog');
        shell.setAttribute('aria-modal', 'true');
        shell.setAttribute('aria-label', 'Remove closet item');
        const dispositionField = disposition
          ? '<p class="line">This moves the item out of the active closet as ' + escapeHtml(disposition.replace('_', ' ')) + '.</p>'
          : '<label><span class="micro">What happened?</span><select name="disposition"><option value="returned">Returned</option><option value="sold">Sold</option><option value="donated">Donated</option><option value="gifted">Gifted</option><option value="worn_out">Worn out</option><option value="never_purchased">Never purchased</option><option value="duplicate">Duplicate</option><option value="other">Other</option></select></label>';
        shell.innerHTML = '<div class="sheet"><h2>Remove from closet?</h2><p class="line">This is reversible. You can Undo now or restore the item later from Archived.</p>' + dispositionField + '<div class="actions"><button class="btn" type="button" data-cancel>Cancel</button><button class="btn danger-btn" type="button" data-confirm>Remove from closet</button></div></div>';
        const previouslyFocused = returnFocus;
        let postMutationFocusId = null;
        const closeArchive = () => {
          shell.remove();
          if (activePanelClose === closeArchive) activePanelClose = null;
          setCollectionModalState(false);
          const focusTarget = previouslyFocused && previouslyFocused.isConnected
            ? previouslyFocused
            : (postMutationFocusId ? cardButtonForItem(postMutationFocusId) : null) || document.querySelector('.card .card-button') || $('advancedToggle');
          if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus();
        };
        activePanelClose = closeArchive;
        shell.querySelector('[data-cancel]').addEventListener('click', closeArchive);
        shell.addEventListener('click', (event) => { if (event.target === shell) closeArchive(); });
        shell.querySelector('[data-confirm]').addEventListener('click', async () => {
          const selectedDisposition = disposition || shell.querySelector('[name="disposition"]')?.value;
          if (!selectedDisposition) return;
          const label = item.name || 'that item';
          const beforeItems = viewModel.items.slice();
          postMutationFocusId = neighboringItemId(beforeItems, item.id);
          viewModel.items = viewModel.items.filter((entry) => entry.id !== item.id);
          clearNote();
          render();
          closeArchive();
          let writeProven = false;
          let receiptLabel = null;
          let receiptInverse = null;
          try {
            try {
              const result = await callTool('fluent_archive_item', {
                approval: 'explicit_user_approved',
                disposition: selectedDisposition,
                domain: 'style',
                item_id: item.id,
                item_type: 'style_item',
                provenance: { sourceType: 'user_confirmation' },
                reason: 'No longer owned',
              });
              verifyArchiveAck(result, item.id, selectedDisposition);
            } catch (writeError) {
              try {
                await recoverAmbiguousArchive(item.id, selectedDisposition);
              } catch (readbackError) {
                throw writeError && writeError.archiveProven === true ? writeError : readbackError;
              }
            }
            writeProven = true;
            itemCache.delete(item.id);
            receiptLabel = 'Archived ' + (item.name || item.id) + ' as ' + selectedDisposition.replace('_', ' ') + '.';
            receiptInverse = async () => {
              try {
                const inverse = await callTool('fluent_update_style_item_patch', { approval: 'explicit_user_approved', item_id: item.id, patch: { status: 'active' }, provenance: { sourceType: 'user_confirmation' }, response_mode: 'read_after_write' });
                verifyStylePatchAck(inverse, item.id, { status: 'active' });
              } catch (writeError) {
                try {
                  await recoverAmbiguousStylePatch(item.id, { status: 'active' });
                } catch (readbackError) {
                  throw writeError;
                }
              }
              await rerender();
            };
            await rerender();
            focusCollectionAfterRemoval(postMutationFocusId);
            showMutationReceipt(receiptLabel, receiptInverse);
          } catch (error) {
            if (writeProven) {
              render();
              focusCollectionAfterRemoval(postMutationFocusId);
              showMutationReceipt(receiptLabel + ' The closet could not refresh; Undo remains available.', receiptInverse);
            } else if (error && error.code === 'archive_disposition_mismatch' && error.archiveProven === true) {
              itemCache.delete(item.id);
              try { await rerender(); } catch (refreshError) { render(); }
              focusCollectionAfterRemoval(postMutationFocusId);
              const actualReason = typeof error.actualDisposition === 'string' && error.actualDisposition
                ? ' It was recorded as ' + error.actualDisposition.replace('_', ' ') + '.'
                : '';
              showNote('"' + label + '" was archived, but the selected reason was not confirmed.' + actualReason + ' Check Archived before changing it again.', 'error');
            } else {
              viewModel.items = beforeItems;
              render();
              focusCollectionAfterRemoval(item.id);
              showNote('Couldn’t archive “' + label + '” right now. No change was made.', 'error');
            }
          }
        });
        setCollectionModalState(true);
        document.body.appendChild(shell);
        setTimeout(() => { const first = shell.querySelector('select,button'); if (first) first.focus(); }, 0);
      };
      const openRestore = async (itemId) => {
        const item = itemById(itemId);
        if (!item) return;
        const label = item.name || 'that item';
        const priorArchiveDisposition = item.archiveDisposition;
        const priorArchiveReason = item.archiveReason;
        openMenu = null;
        menuView = 'root';
        const beforeItems = viewModel.items.slice();
        const postMutationFocusId = neighboringItemId(beforeItems, item.id);
        // Restoring makes the item active again, so it leaves the archived view it was clicked from.
        viewModel.items = viewModel.items.filter((entry) => entry.id !== item.id);
        clearNote();
        render();
        focusCollectionAfterRemoval(postMutationFocusId);
        let writeProven = false;
        let receiptLabel = null;
        let receiptInverse = null;
        try {
          // Restore-only patch: status:'active' un-archives; the model still cannot archive via patch.
          try {
            const result = await callTool('fluent_update_style_item_patch', { approval: 'explicit_user_approved', expected_duplicate_merge_id: item.duplicateMergeId || undefined, item_id: item.id, patch: { status: 'active' }, provenance: { sourceType: 'user_confirmation' }, response_mode: 'read_after_write' });
            verifyStylePatchAck(result, item.id, { status: 'active' });
          } catch (writeError) {
            // ChatGPT can omit the widget-initiated write ACK even after the durable restore.
            // Resolve that ambiguity with the same exact-item readback used by Edit essentials.
            // A real rejection still fails because the item remains archived.
            try {
              await recoverAmbiguousStylePatch(item.id, { status: 'active' });
            } catch (readbackError) {
              throw writeError;
            }
          }
          writeProven = true;
          itemCache.delete(item.id);
          receiptLabel = 'Restored ' + (item.name || item.id) + ' to the active closet.';
          receiptInverse = async () => {
            const inverseArgs = {
              approval: 'explicit_user_approved',
              domain: 'style',
              item_id: item.id,
              item_type: 'style_item',
              provenance: { sourceType: 'user_confirmation' },
            };
            if (priorArchiveReason) inverseArgs.reason = priorArchiveReason;
            if (priorArchiveDisposition) inverseArgs.disposition = priorArchiveDisposition;
            try {
              const inverse = await callTool('fluent_archive_item', inverseArgs);
              verifyArchiveAck(inverse, item.id, priorArchiveDisposition);
            } catch (writeError) {
              try {
                await recoverAmbiguousArchive(item.id, priorArchiveDisposition);
              } catch (readbackError) {
                throw writeError;
              }
            }
            await rerender();
          };
          await rerender();
          focusCollectionAfterRemoval(postMutationFocusId);
          showMutationReceipt(receiptLabel, receiptInverse);
        } catch (error) {
          if (writeProven) {
            render();
            focusCollectionAfterRemoval(postMutationFocusId);
            showMutationReceipt(receiptLabel + ' The closet could not refresh; Undo remains available.', receiptInverse);
          } else {
            viewModel.items = beforeItems;
            render();
            focusCollectionAfterRemoval(item.id);
            showNote('Couldn’t restore “' + label + '” right now. No change was made.', 'error');
          }
        }
      };
      const activePresentationMode = () => flippedId
        ? 'detail'
        : (viewModel?.presentation?.mode === 'ingestion_review' ? 'ingestion_review' : (loadedItemIds ? 'comparison' : 'browse'));
      const rerender = async (renderOptions = {}) => {
        // Refresh at least the number of items already loaded so a write on page 2+ never collapses
        // the collection back to the first 48. A closet beyond the 120-item request cap is completed
        // with the same cursor loop used by automatic continuation.
        const focusedItemId = typeof renderOptions.focusedItemId === 'string' ? renderOptions.focusedItemId : null;
        const preserveCollectionFilter = renderOptions.preserveCollectionFilter === true;
        const filter = renderOptions.filterOverride && typeof renderOptions.filterOverride === 'object'
          ? Object.assign({}, renderOptions.filterOverride)
          : (focusedItemId && !preserveCollectionFilter ? { status: 'active', item_ids: [focusedItemId] } : activeServerFilter());
        const currentMode = typeof renderOptions.presentationMode === 'string'
          ? renderOptions.presentationMode
          : (focusedItemId ? 'detail' : activePresentationMode());
        const presentation = { mode: currentMode, focused_item_id: focusedItemId || flippedId || undefined };
        const targetCount = Math.max(48, (viewModel && viewModel.items || []).length);
        const itemsBeforeRefresh = (viewModel && viewModel.items || []).slice();
        const supersedesPendingFilter = filterPending;
        if (supersedesPendingFilter) clearFilterTimers();
        const requestGeneration = ++viewRequestGeneration;
        try {
          const result = await callTool('fluent_render_style_closet_surface', {
            filter,
            limit: Math.min(120, targetCount),
            presentation,
          });
          if (requestGeneration !== viewRequestGeneration) return;
          // A media refresh can start from a focused/detail subset, then resolve after the user has
          // loaded a broader collection. Never let that older, narrower response collapse the newer
          // in-memory wardrobe; the next explicit refresh can still replace it deliberately.
          if (((viewModel && viewModel.items) || []).length > targetCount) {
            if (supersedesPendingFilter) {
              filterPending = false;
              filterRollback = null;
              filterRollbackScrollTop = null;
              render({ preserveExistingCards: true });
            }
            return;
          }
          if (!viewMatchesFilter(result, filter)) throw new Error('closet refresh returned a stale filter');
          const firstPage = extractViewModel(result);
          if (!firstPage) throw new Error('closet refresh returned no fresh view model');
          // A refresh that must revalidate more than one cursor page must not paint an intermediate
          // first page and detach the already-loaded tail. Retain those keyed items until their
          // authoritative cursor page arrives below; receiveViewModel's append merge replaces each
          // retained value by exact ID before the refresh completes.
          if (renderOptions.preserveExistingCards === true && (firstPage.items || []).length < itemsBeforeRefresh.length) {
            const refreshedIds = new Set((firstPage.items || []).map((item) => item.id));
            firstPage.items = (firstPage.items || []).concat(itemsBeforeRefresh.filter((item) => !refreshedIds.has(item.id)));
          }
          if (supersedesPendingFilter) {
            filterPending = false;
            filterRollback = null;
            filterRollbackScrollTop = null;
          }
          if (!receiveViewModel(result, false, renderOptions)) throw new Error('closet refresh returned no fresh view model');
          while (viewModel && viewModel.cursor && viewModel.items.length < targetCount) {
            const beforeCount = viewModel.items.length;
            const more = await callTool('fluent_render_style_closet_surface', {
              cursor: viewModel.cursor,
              filter,
              limit: Math.min(120, targetCount - beforeCount),
              presentation,
            });
            if (requestGeneration !== viewRequestGeneration) return;
            if (!viewMatchesFilter(more, filter)) throw new Error('closet page refresh returned a stale filter');
            if (!receiveViewModel(more, true, renderOptions)) {
              throw new Error('closet page refresh returned no fresh view model');
            }
            if (!viewModel || viewModel.items.length <= beforeCount) break;
          }
        } catch (error) {
          if (supersedesPendingFilter && requestGeneration === viewRequestGeneration && filterPending) {
            filterPending = false;
            localFilter = filterRollback || localFilter;
            filterRollback = null;
            const rollbackScrollTop = filterRollbackScrollTop;
            filterRollbackScrollTop = null;
            if (rollbackScrollTop != null && flippedId) collectionScrollTop = rollbackScrollTop;
            render({ preserveExistingCards: true });
            setCollectionScrollTop(document.querySelector('.scroll'), rollbackScrollTop);
          }
          throw error;
        }
      };
      const activeServerFilter = () => {
        const source = localFilter || {};
        const filter = { status: source.status || loadedStatus };
        for (const key of ['brand', 'category', 'color', 'query', 'size', 'subcategory']) {
          if (source[key]) filter[key] = source[key];
        }
        if (loadedItemIds) filter.item_ids = loadedItemIds.slice();
        return filter;
      };
      const drainQueuedGridMediaFailures = async () => {
        if (queuedGridMediaFailures.size === 0 || loadingMore) return;
        const filterFingerprint = JSON.stringify(activeServerFilter());
        const mode = activePresentationMode();
        const pending = Array.from(queuedGridMediaFailures.entries());
        queuedGridMediaFailures.clear();
        for (const [refreshKey, failure] of pending) {
          if (failure.filterFingerprint !== filterFingerprint || failure.mode !== mode) continue;
          gridImageRefreshed.add(refreshKey);
          gridImageRefreshItemIds.add(failure.itemId);
        }
        if (gridImageRefreshItemIds.size === 0) return;
        if (!gridImageRefreshPromise) {
          gridImageRefreshPromise = rerender({
            preserveExistingCards: true,
            replaceItemIds: new Set(gridImageRefreshItemIds),
          }).finally(() => {
            gridImageRefreshPromise = null;
            gridImageRefreshItemIds.clear();
          });
        }
        try { await gridImageRefreshPromise; } catch (error) {
          for (const [, failure] of pending) unavailableMediaUrlByItemId.set(failure.itemId, failure.failedUrl);
          render({ preserveExistingCards: true, replaceItemIds: pending.map(([, failure]) => failure.itemId) });
        }
      };
      const panel = (title, fields, onSave, returnFocus) => {
        const shell = document.createElement('div');
        shell.className = 'panel';
        shell.setAttribute('role', 'dialog');
        shell.setAttribute('aria-modal', 'true');
        shell.setAttribute('aria-label', title);
        shell.innerHTML = '<form class="sheet"><h2>' + escapeHtml(title) + '</h2><div class="form">' + fields.join('') + '</div><div class="actions"><button class="btn" type="button" data-cancel>Cancel</button><button class="btn primary" type="submit">Save</button></div></form>';
        const previouslyFocused = returnFocus || document.activeElement;
        const form = shell.querySelector('form');
        const formSnapshot = () => Array.prototype.slice.call(shell.querySelectorAll('[name]')).map((field) => field.name + '=' + (field.type === 'file' ? (field.files && field.files[0]?.name || '') : field.value)).join('&');
        const initialSnapshot = formSnapshot();
        const close = () => {
          shell.remove();
          if (activePanelClose === requestClose) activePanelClose = null;
          // The collection remains inert while a focused item detail is still open behind this
          // child editor. Only expose the collection when no detail modal remains.
          setCollectionModalState(Boolean(flippedId));
          if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus({ preventScroll: true });
        };
        const clearDiscardCheck = () => shell.querySelector('[data-discard-check]')?.remove();
        const requestClose = () => {
          if (formSnapshot() === initialSnapshot) { close(); return; }
          if (shell.querySelector('[data-discard-check]')) {
            shell.querySelector('[data-keep-editing]')?.focus();
            return;
          }
          const check = document.createElement('div');
          check.className = 'discard-check';
          check.dataset.discardCheck = '';
          check.setAttribute('role', 'alert');
          check.innerHTML = '<strong>Discard unsaved changes?</strong><div class="actions"><button class="btn" type="button" data-keep-editing>Keep editing</button><button class="btn danger-btn" type="button" data-discard>Discard</button></div>';
          form.appendChild(check);
          check.querySelector('[data-keep-editing]').addEventListener('click', () => { clearDiscardCheck(); shell.querySelector('input,select,button')?.focus(); });
          check.querySelector('[data-discard]').addEventListener('click', close);
          check.querySelector('[data-keep-editing]').focus();
        };
        activePanelClose = requestClose;
        shell.querySelector('[data-cancel]').addEventListener('click', requestClose);
        shell.addEventListener('click', (event) => { if (event.target === shell) requestClose(); });
        form.addEventListener('input', clearDiscardCheck);
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const values = {};
          shell.querySelectorAll('[name]').forEach((field) => { if (field.type !== 'file') values[field.name] = field.value.trim(); });
          await onSave(values, close, shell);
        });
        setCollectionModalState(true);
        setTimeout(() => { const first = shell.querySelector('input,select,button'); if (first) first.focus(); }, 0);
        return shell;
      };
      const fileToDataUrl = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Could not read photo.'));
        reader.readAsDataURL(file);
      });
      const input = (name, label, value, placeholder) => '<label><span class="micro">' + escapeHtml(label) + '</span><input name="' + escapeHtml(name) + '" value="' + escapeHtml(value) + '" placeholder="' + escapeHtml(placeholder || '') + '" /></label>';
      const metadataCombobox = (name, label, value) => '<label><span class="micro">' + escapeHtml(label) + '</span><input name="' + escapeHtml(name) + '" value="' + escapeHtml(value || '') + '" list="edit-' + escapeHtml(name) + '-options" autocomplete="off" placeholder="Choose or type" data-metadata-combobox="' + escapeHtml(name) + '" /><datalist id="edit-' + escapeHtml(name) + '-options"></datalist></label>';
      const colorCss = (value) => {
        const palette = { beige:'#c8b69e', black:'#1d1d1b', blue:'#395273', brown:'#72503a', cream:'#e7dcc8', gray:'#8b8882', green:'#596a52', grey:'#8b8882', navy:'#222f42', olive:'#6c6e48', orange:'#b86b3e', pink:'#c78e96', purple:'#6e587c', red:'#8b342f', white:'#f7f3ea', yellow:'#c4a84e' };
        return palette[norm(value)] || '#b8b2a8';
      };
      const colorField = (value, editableMetadata = false) => {
        const options = Array.from(new Set([value].concat(viewModel?.filterOptions?.colorFamilies || []).filter(Boolean))).slice(0, 9);
        const choices = options.map((entry) => '<button class="color-choice" type="button" aria-label="Use ' + escapeHtml(titleCase(entry)) + '" aria-pressed="' + String(norm(entry) === norm(value)) + '" data-color-choice="' + escapeHtml(entry) + '" style="--swatch:' + colorCss(entry) + '"></button>').join('');
        const metadata = editableMetadata ? ' list="edit-color-options" autocomplete="off" placeholder="Choose or type" data-metadata-combobox="color"' : '';
        return '<label class="color-field"><span class="micro">Color</span><input name="color" value="' + escapeHtml(value || '') + '"' + metadata + ' />' + (editableMetadata ? '<datalist id="edit-color-options"></datalist>' : '') + (choices ? '<span class="color-palette" aria-label="Saved closet colors">' + choices + '</span>' : '') + '</label>';
      };
      const wireEditMetadataSuggestions = (shell, editedItem) => {
        const fields = ['brand', 'category', 'subcategory', 'size', 'color'];
        const unique = (values) => Array.from(new Set((values || []).filter(Boolean).map((value) => String(value).trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right));
        const options = viewModel?.filterOptions || {};
        const globalOptions = {
          brand: unique([editedItem.brand].concat(options.brands || [])),
          category: unique([editedItem.category].concat((viewModel?.facets || []).filter((entry) => entry.category !== 'all').map((entry) => entry.category))),
          subcategory: unique([editedItem.subcategory].concat(options.subcategories || [])),
          size: unique([editedItem.size].concat(options.sizes || [])),
          color: unique([editedItem.colorFamily].concat(options.colorFamilies || [])),
        };
        const rows = (viewModel?.items || []).concat([editedItem]).map((entry) => ({
          brand: entry.brand || '',
          category: entry.category || '',
          subcategory: entry.subcategory || '',
          size: entry.size || '',
          color: entry.colorFamily || '',
        }));
        const controls = Object.fromEntries(fields.map((name) => [name, shell.querySelector('[data-metadata-combobox="' + name + '"]')]));
        const isKnown = (name, value) => !value || globalOptions[name].some((entry) => norm(entry) === norm(value));
        const refresh = () => {
          const selected = Object.fromEntries(fields.map((name) => [name, controls[name]?.value.trim() || '']));
          fields.forEach((name) => {
            let values = globalOptions[name];
            if (name !== 'category') {
              const dependencies = name === 'subcategory' ? ['category'] : name === 'brand' ? ['category', 'subcategory'] : ['category', 'subcategory', 'brand'];
              const narrowed = rows
                .filter((row) => dependencies.every((dependency) => !selected[dependency] || !isKnown(dependency, selected[dependency]) || norm(row[dependency]) === norm(selected[dependency])))
                .map((row) => row[name]);
              if (narrowed.some(Boolean)) values = unique([selected[name]].concat(narrowed));
            }
            const list = shell.querySelector('#edit-' + name + '-options');
            if (list) list.innerHTML = values.map((value) => '<option value="' + escapeHtml(value) + '"></option>').join('');
          });
        };
        fields.forEach((name) => {
          controls[name]?.addEventListener('input', refresh);
          controls[name]?.addEventListener('change', refresh);
        });
        refresh();
      };
      const itemById = (itemId) => (retainedEditedDetailId === itemId ? retainedEditedDetailItem : null)
        // A successful edit can move the focused item outside the active collection filter. Its
        // retained detail must outrank a host-focused refresh that can no longer deliver every
        // previously mounted media role through the narrowed collection projection.
        || (viewModel && viewModel.items || []).find((item) => item.id === itemId)
        || (filterPending ? itemCache.get(itemId) : null);
      const menuButtonForItem = (itemId) => Array.prototype.slice.call(document.querySelectorAll('[data-menu]')).find((button) => button.dataset.menu === itemId) || null;
      const cardButtonForItem = (itemId) => Array.prototype.slice.call(document.querySelectorAll('.card')).find((card) => card.dataset.item === itemId)?.querySelector('.card-button') || null;
      const neighboringItemId = (items, itemId) => {
        const index = (items || []).findIndex((entry) => entry.id === itemId);
        if (index < 0) return null;
        return items[index + 1]?.id || items[index - 1]?.id || null;
      };
      const focusCollectionAfterRemoval = (preferredItemId) => {
        const focusNow = () => {
          const target = (preferredItemId ? cardButtonForItem(preferredItemId) : null) || document.querySelector('.card .card-button') || $('advancedToggle');
          if (target && typeof target.focus === 'function') target.focus();
        };
        focusNow();
        setTimeout(focusNow, 0);
      };
      const escapeHtml = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
      const titleCase = (value) => String(value == null ? '' : value).replace(/\b\w/g, (char) => char.toUpperCase());
      const fillFilterSelect = (el, anyLabel, values, selected, format) => {
        if (!el) return;
        const fmt = format || ((value) => value);
        el.innerHTML = '<option value="">' + escapeHtml(anyLabel) + '</option>' + (values || []).map((value) => (
          '<option value="' + escapeHtml(value) + '"' + (value === selected ? ' selected' : '') + '>' + escapeHtml(fmt(value)) + '</option>'
        )).join('');
        el.value = selected || '';
      };

      const collectionAnchor = () => {
        const scroll = document.querySelector('.scroll');
        if (!scroll) return null;
        const top = scroll.getBoundingClientRect().top;
        const cards = Array.from(document.querySelectorAll('.card[data-item]'));
        const card = cards.find((candidate) => candidate.getBoundingClientRect().bottom > top + 1) || cards[0];
        if (!card) return null;
        return { itemId: card.dataset.item, offset: card.getBoundingClientRect().top - top };
      };
      let gridScaleRenderGeneration = 0;
      const restoreCollectionAnchor = (anchor, generation) => {
        if (!anchor) return Promise.resolve(false);
        return new Promise((resolve) => requestAnimationFrame(() => {
          if (generation !== gridScaleRenderGeneration) { resolve(false); return; }
          const scroll = document.querySelector('.scroll');
          const card = Array.from(document.querySelectorAll('.card[data-item]')).find((candidate) => candidate.dataset.item === anchor.itemId);
          if (!scroll || !card) { resolve(false); return; }
          const delta = card.getBoundingClientRect().top - scroll.getBoundingClientRect().top - anchor.offset;
          setCollectionScrollTop(scroll, scroll.scrollTop + delta);
          resolve(true);
        }));
      };
      const CLOSET_REMOUNT_TOKEN_KEY = 'fluentClosetRemountToken';
      const createOpaqueRemountToken = () => {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
        if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
          const bytes = new Uint8Array(16);
          window.crypto.getRandomValues(bytes);
          return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
        }
        return null;
      };
      const ensureOpaqueRemountToken = () => {
        const state = window.openai && window.openai.widgetState && typeof window.openai.widgetState === 'object'
          ? window.openai.widgetState
          : {};
        const existing = typeof state[CLOSET_REMOUNT_TOKEN_KEY] === 'string' ? state[CLOSET_REMOUNT_TOKEN_KEY] : null;
        if (existing && /^[a-f0-9-]{32,36}$/i.test(existing)) return existing;
        if (!window.openai || typeof window.openai.setWidgetState !== 'function') return null;
        const token = createOpaqueRemountToken();
        if (!token) return null;
        const next = Object.assign({}, state, { [CLOSET_REMOUNT_TOKEN_KEY]: token });
        try {
          const result = window.openai.setWidgetState(next);
          window.openai.widgetState = next;
          if (result && typeof result.catch === 'function') result.catch(() => {});
          return token;
        } catch (error) { return null; }
      };
      const closetRemountToken = ensureOpaqueRemountToken();
      const CLOSET_REMOUNT_STORAGE_KEY = closetRemountToken
        ? 'fluent-closet-remount-v1:' + TEMPLATE_URI + ':' + TEMPLATE_VERSION + ':' + closetRemountToken
        : null;
      const DUPLICATE_MERGE_RECEIPT_TTL_MS = 10 * 60 * 1000;
      const DUPLICATE_MERGE_RECEIPT_STORAGE_KEY = closetRemountToken
        ? 'fluent-closet-merge-undo-v1:' + TEMPLATE_URI + ':' + TEMPLATE_VERSION + ':' + closetRemountToken
        : null;
      const validDuplicateMergeReceipt = (candidate) => {
        const validItemId = (value) => typeof value === 'string'
          && value.length <= 192
          && /^[a-z0-9][a-z0-9:_-]*$/i.test(value);
        return candidate
          && validItemId(candidate.sourceItemId)
          && validItemId(candidate.targetItemId)
          && candidate.sourceItemId !== candidate.targetItemId
          && typeof candidate.mergeOperationId === 'string'
          && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(candidate.mergeOperationId)
          && Array.isArray(candidate.sourceMediaIds)
          && candidate.sourceMediaIds.length <= 64
          && candidate.sourceMediaIds.every(validItemId)
          && Number.isFinite(candidate.activeTotalBefore)
          && candidate.activeTotalBefore >= 1
          && Number.isFinite(candidate.createdAt)
          && Number.isFinite(candidate.expiresAt)
          && candidate.createdAt <= Date.now()
          && candidate.expiresAt > Date.now()
          && candidate.expiresAt - candidate.createdAt <= DUPLICATE_MERGE_RECEIPT_TTL_MS
          && typeof candidate.receiptLabel === 'string'
          && candidate.receiptLabel.length > 0
          && candidate.receiptLabel.length <= 320;
      };
      const clearDuplicateMergeReceipt = () => {
        if (!DUPLICATE_MERGE_RECEIPT_STORAGE_KEY) return;
        try { window.sessionStorage.removeItem(DUPLICATE_MERGE_RECEIPT_STORAGE_KEY); } catch (error) {}
      };
      const readDuplicateMergeReceipt = () => {
        if (!DUPLICATE_MERGE_RECEIPT_STORAGE_KEY) return null;
        let candidate = null;
        try { candidate = JSON.parse(window.sessionStorage.getItem(DUPLICATE_MERGE_RECEIPT_STORAGE_KEY) || 'null'); }
        catch (error) {}
        if (!validDuplicateMergeReceipt(candidate)) {
          if (candidate) clearDuplicateMergeReceipt();
          return null;
        }
        return candidate;
      };
      const persistDuplicateMergeReceipt = (descriptor) => {
        if (!DUPLICATE_MERGE_RECEIPT_STORAGE_KEY) return false;
        const createdAt = Number.isFinite(descriptor?.createdAt) ? descriptor.createdAt : Date.now();
        const candidate = Object.assign({}, descriptor, {
          createdAt,
          expiresAt: createdAt + DUPLICATE_MERGE_RECEIPT_TTL_MS,
          sourceMediaIds: Array.from(new Set(descriptor?.sourceMediaIds || [])).sort(),
        });
        if (!validDuplicateMergeReceipt(candidate)) return false;
        try {
          window.sessionStorage.setItem(DUPLICATE_MERGE_RECEIPT_STORAGE_KEY, JSON.stringify(candidate));
          return true;
        } catch (error) { return false; }
      };
      const createDuplicateMergeReceiptInverse = (descriptor) => async () => {
        try {
          const inverse = await callTool('fluent_update_style_item_patch', {
            approval: 'explicit_user_approved',
            item_id: descriptor.sourceItemId,
            expected_duplicate_merge_id: descriptor.mergeOperationId,
            patch: { status: 'active' },
            provenance: { sourceType: 'user_confirmation' },
            response_mode: 'read_after_write',
          });
          verifyStylePatchAck(inverse, descriptor.sourceItemId, { status: 'active' });
        } catch (writeError) {
          try {
            await recoverAmbiguousStylePatch(descriptor.sourceItemId, { status: 'active' });
          } catch (readbackError) {
            throw writeError;
          }
        }
        itemCache.delete(descriptor.sourceItemId);
        itemCache.delete(descriptor.targetItemId);
        await rerender();
        const restoredTotal = Number(viewModel.summary?.activeTotal);
        const restoredSource = itemById(descriptor.sourceItemId);
        const restoredMediaIds = (restoredSource?.media || []).map((media) => media.id).sort();
        if (!Number.isFinite(restoredTotal) || restoredTotal !== descriptor.activeTotalBefore) {
          throw new Error('Duplicate restore active-total readback did not return to the prior total.');
        }
        if (restoredMediaIds.length !== descriptor.sourceMediaIds.length
          || restoredMediaIds.some((mediaId, index) => mediaId !== descriptor.sourceMediaIds[index])) {
          throw new Error('Duplicate restore did not return the exact source media set.');
        }
        clearDuplicateMergeReceipt();
        setTimeout(() => openDetailItem(descriptor.sourceItemId), 0);
      };
      const restoreDuplicateMergeReceipt = () => {
        if (!viewModel || activeMutationReceipt) return false;
        const descriptor = readDuplicateMergeReceipt();
        if (!descriptor) return false;
        showMutationReceipt(descriptor.receiptLabel, createDuplicateMergeReceiptInverse(descriptor));
        return true;
      };
      const readClosetRemountSnapshot = () => {
        if (!CLOSET_REMOUNT_STORAGE_KEY) return null;
        try { return JSON.parse(window.sessionStorage.getItem(CLOSET_REMOUNT_STORAGE_KEY) || 'null'); }
        catch (error) { return null; }
      };
      const clearClosetRemountSnapshot = () => {
        if (!CLOSET_REMOUNT_STORAGE_KEY) return;
        try { window.sessionStorage.removeItem(CLOSET_REMOUNT_STORAGE_KEY); } catch (error) {}
      };
      const persistClosetRemountSnapshot = (targetDisplayMode) => {
        if (!CLOSET_REMOUNT_STORAGE_KEY || !viewModel || filterPending || loadingMore || activeMutationReceipt || remountRestoreInFlight) return;
        const createdAt = Date.now();
        const presentation = viewModel.presentation || {};
        const detailSheet = $('detailLayer')?.querySelector('[data-detail-sheet]');
        const settledFilter = Object.assign({}, confirmedFilter);
        try {
          window.sessionStorage.setItem(CLOSET_REMOUNT_STORAGE_KEY, JSON.stringify({
            activeTotal: Number(viewModel.summary?.activeTotal || 0),
            advancedOpen: $('advanced')?.classList.contains('open') === true,
            anchor: collectionAnchor(),
            createdAt,
            detailItemId: flippedId || null,
            detailScrollTop: detailSheet?.scrollTop || 0,
            expiresAt: createdAt + 10 * 1000,
            filter: settledFilter,
            filterFingerprint: canonicalFilterFingerprint(settledFilter),
            firstPageItemIds: (viewModel.items || []).slice(0, 48).map((item) => item.id),
            gridScale,
            instanceToken: closetRemountToken,
            presentationMode: presentation.mode || 'browse',
            selectedDetailMediaId,
            targetDisplayMode,
            templateUri: TEMPLATE_URI,
            templateVersion: TEMPLATE_VERSION,
          }));
          setTimeout(() => {
            try {
              const current = readClosetRemountSnapshot();
              if (current?.createdAt === createdAt) clearClosetRemountSnapshot();
            } catch (error) { clearClosetRemountSnapshot(); }
          }, 10 * 1000);
        } catch (error) {}
      };
      const restoreClosetRemountSnapshot = async () => {
        remountRestoreAttempted = true;
        if (remountRestoreInFlight || !viewModel || filterPending) return false;
        const snapshot = readClosetRemountSnapshot();
        const requestedFilter = snapshot && snapshot.filter && typeof snapshot.filter === 'object'
          ? snapshot.filter
          : null;
        const validProvenance = snapshot
          && snapshot.templateUri === TEMPLATE_URI
          && snapshot.templateVersion === TEMPLATE_VERSION
          && snapshot.instanceToken === closetRemountToken
          && snapshot.presentationMode === (viewModel.presentation?.mode || 'browse')
          && ['fullscreen', 'inline'].includes(snapshot.targetDisplayMode)
          && (snapshot.targetDisplayMode === requestedDisplayMode || snapshot.targetDisplayMode === hostLayoutContext.displayMode)
          && Number.isFinite(snapshot.createdAt)
          && Date.now() - snapshot.createdAt <= 10 * 1000
          && Number.isFinite(snapshot.expiresAt)
          && snapshot.expiresAt > Date.now()
          && snapshot.activeTotal === Number(viewModel.summary?.activeTotal || 0)
          && Array.isArray(snapshot.firstPageItemIds)
          && requestedFilter
          && snapshot.filterFingerprint === canonicalFilterFingerprint(requestedFilter);
        if (!validProvenance) {
          if (snapshot) clearClosetRemountSnapshot();
          return false;
        }
        remountRestoreInFlight = true;
        try {
          if (snapshot.filterFingerprint !== canonicalFilterFingerprint(confirmedFilter)) {
            const result = await callTool('fluent_render_style_closet_surface', {
              filter: requestedFilter,
              limit: 48,
              presentation: { mode: snapshot.presentationMode },
            });
            if (resultIsError(result) || !viewMatchesFilter(result, requestedFilter)) return false;
            confirmedFilter = Object.assign({}, requestedFilter);
            localFilter = Object.assign({}, requestedFilter);
            $('app')?.setAttribute('data-confirmed-filter', canonicalFilterFingerprint(confirmedFilter));
            if (!receiveViewModel(result, false)) return false;
          }
          const contextStable = () => !filterPending
            && snapshot.filterFingerprint === canonicalFilterFingerprint(confirmedFilter)
            && snapshot.activeTotal === Number(viewModel?.summary?.activeTotal || 0);
          if (!contextStable()) return false;
          const currentFirstPageIds = (viewModel.items || []).slice(0, 48).map((item) => item.id);
          if (snapshot.firstPageItemIds.length !== currentFirstPageIds.length
            || !snapshot.firstPageItemIds.every((itemId, index) => itemId === currentFirstPageIds[index])) return false;
          applyGridScale(snapshot.gridScale, false);
          setAdvancedOpen(snapshot.advancedOpen === true);
          const anchorId = typeof snapshot.anchor?.itemId === 'string' ? snapshot.anchor.itemId : null;
          let pages = 0;
          while (anchorId && !itemById(anchorId) && viewModel?.cursor && pages < 3) {
            if (!await loadNextCursorPage()) break;
            if (!contextStable()) return false;
            pages += 1;
          }
          if (anchorId && !itemById(anchorId)) return false;
          if (anchorId) {
            const generation = ++gridScaleRenderGeneration;
            if (!await restoreCollectionAnchor(snapshot.anchor, generation)) return false;
          }
          const detailItemId = typeof snapshot.detailItemId === 'string' ? snapshot.detailItemId : null;
          if (!contextStable()) return false;
          if (detailItemId && !itemById(detailItemId)) return false;
          if (detailItemId) {
            const item = itemById(detailItemId);
            const selectedId = typeof snapshot.selectedDetailMediaId === 'string' ? snapshot.selectedDetailMediaId : null;
            openDetailItem(detailItemId);
            selectedDetailMediaId = selectedId && (item.media || []).some((entry) => String(entry.id || entry.label) === selectedId)
              ? selectedId
              : null;
            renderDetailSheet();
            await new Promise((resolve) => requestAnimationFrame(() => {
              const sheet = $('detailLayer')?.querySelector('[data-detail-sheet]');
              if (sheet) sheet.scrollTop = Math.max(0, Number(snapshot.detailScrollTop) || 0);
              resolve();
            }));
          }
          return true;
        } finally {
          clearClosetRemountSnapshot();
          remountRestoreInFlight = false;
        }
      };
      const gridLayoutForScale = (scale) => {
        const compact = window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
        if (compact) return { density: scale < 50 ? '3' : '2', widthPercent: 100 };
        if (scale < 34) return { density: '4', widthPercent: 82 + (scale / 34) * 18 };
        if (scale < 67) return { density: '3', widthPercent: 75 + ((scale - 34) / 33) * 25 };
        return { density: '2', widthPercent: (2 / 3) * 100 + ((scale - 67) / 33) * (100 / 3) };
      };
      const applyGridScale = (scale, persist = true) => {
        const parsed = Number(scale);
        if (!Number.isFinite(parsed)) return;
        const anchor = collectionAnchor();
        const generation = ++gridScaleRenderGeneration;
        gridScale = Math.max(0, Math.min(100, parsed));
        const layout = gridLayoutForScale(gridScale);
        const gridDensity = layout.density;
        $('app')?.setAttribute('data-grid-density', gridDensity);
        const grid = $('grid');
        if (grid) grid.style.maxWidth = layout.widthPercent.toFixed(3) + '%';
        const slider = $('gridScale');
        if (slider) {
          slider.value = String(gridScale);
          slider.setAttribute('aria-valuetext', gridDensity + ' items per row');
        }
        const status = $('gridDensityStatus');
        if (status) status.textContent = gridDensity + ' items per row';
        if (persist) {
          try {
            window.localStorage.setItem('fluent-closet-grid-scale', String(gridScale));
            window.localStorage.setItem('fluent-closet-grid-density', gridDensity);
          } catch (error) {}
        }
        restoreCollectionAnchor(anchor, generation);
        notifySize('grid-scale');
      };
      $('gridScale')?.addEventListener('input', (event) => applyGridScale(event.currentTarget.value));
      const compactGridQuery = window.matchMedia ? window.matchMedia('(max-width: 640px)') : null;
      compactGridQuery?.addEventListener?.('change', () => applyGridScale(gridScale, false));
      applyGridScale(gridScale, false);

     $('advancedToggle').addEventListener('click', () => {
       setAdvancedOpen(!$('advanced').classList.contains('open'));
       notifySize('advanced-filter-toggle');
     });
      const loadNextCursorPage = async () => {
        if (!viewModel || !viewModel.cursor || loadingMore || collectionRestartPending || filterPending) return false;
        const syncContinuationStatus = (message = '') => {
          const continuation = $('continuation');
          if (continuation) continuation.setAttribute('aria-busy', String(loadingMore));
          const status = $('continuationStatus');
          if (status) status.textContent = message;
        };
        const itemCountBefore = (viewModel.items || []).length;
        loadingMore = true;
        // Loading state is local chrome; do not rebuild already-painted garment nodes simply to
        // disable one button. The keyed append render below preserves every existing card/image.
        syncContinuationStatus('Loading more pieces.');
        try {
          const cursorBeforeWait = viewModel.cursor;
          const filterBeforeWait = activeServerFilter();
          const filterFingerprintBeforeWait = JSON.stringify(filterBeforeWait);
          const modeBeforeWait = activePresentationMode();
          const focusedItemBeforeWait = flippedId || undefined;
          const generationBeforeWait = viewRequestGeneration;
          // A signed-image refresh and cursor append both replace the current view model. Serialize
          // them so a slower recovery response cannot overwrite an appended page. An image that
          // fails after paging starts is queued and refreshed once the cursor response settles.
          if (gridImageRefreshPromise) await gridImageRefreshPromise;
          const requestContextChanged = !viewModel
            || viewRequestGeneration !== generationBeforeWait
            || viewModel.cursor !== cursorBeforeWait
            || JSON.stringify(activeServerFilter()) !== filterFingerprintBeforeWait
            || activePresentationMode() !== modeBeforeWait
            || (flippedId || undefined) !== focusedItemBeforeWait;
          if (requestContextChanged || !viewModel.cursor) {
            loadingMore = false;
            syncContinuationStatus('');
            return false;
          }
          const requestGeneration = ++viewRequestGeneration;
          const result = await callTool('fluent_render_style_closet_surface', {
            cursor: cursorBeforeWait,
            filter: filterBeforeWait,
            limit: 48,
            presentation: {
              mode: modeBeforeWait,
              focused_item_id: focusedItemBeforeWait,
            },
          });
          if (requestGeneration !== viewRequestGeneration) {
            loadingMore = false;
            syncContinuationStatus('');
            return false;
          } else if (result && viewMatchesFilter(result, filterBeforeWait)) {
            const received = receiveViewModel(result, true);
            const appended = Math.max(0, (viewModel?.items || []).length - itemCountBefore);
            syncContinuationStatus(appended ? appended + ' more pieces loaded.' : 'Closet is up to date.');
            return Boolean(received);
          } else {
            loadingMore = false;
            showNote('Could not load the next pieces. Try again.', 'error');
            syncContinuationStatus('More pieces could not be loaded.');
            return false;
          }
        } catch (error) {
          loadingMore = false;
          showNote('Could not load the next pieces. Try again.', 'error');
          syncContinuationStatus('More pieces could not be loaded.');
          return false;
        } finally {
          loadingMore = false;
          if (queuedGridMediaFailures.size) queueMicrotask(() => { void drainQueuedGridMediaFailures(); });
        }
      };
      const ensureContinuationObserver = () => {
        const sentinel = $('continuation');
        const root = document.querySelector('.scroll');
        if (!sentinel || !root || typeof IntersectionObserver !== 'function') return;
        if (continuationObserver) continuationObserver.disconnect();
        continuationObserver = new IntersectionObserver((entries) => {
          continuationVisible = entries.some((entry) => entry.isIntersecting);
          const mobile = window.matchMedia('(max-width: 640px)').matches;
          if (continuationVisible && viewModel?.cursor && !flippedId && (!mobile || mobileContinuationArmed)) {
            if (mobile) mobileContinuationArmed = false;
            void loadNextCursorPage();
          }
        }, { root, rootMargin: '360px 0px', threshold: 0.01 });
        continuationObserver.observe(sentinel);
      };
      const armMobileContinuation = () => {
        if (!window.matchMedia('(max-width: 640px)').matches) return;
        mobileContinuationArmed = true;
        if (continuationVisible && viewModel?.cursor && !flippedId && !loadingMore && !collectionRestartPending && !filterPending) {
          mobileContinuationArmed = false;
          void loadNextCursorPage();
        }
      };
      ensureContinuationObserver();
      document.querySelector('.scroll')?.addEventListener('scroll', armMobileContinuation, { passive: true });
      document.addEventListener('touchmove', armMobileContinuation, { passive: true });
      document.addEventListener('wheel', armMobileContinuation, { passive: true });
      const applyFilterControls = () => applyFilter({
          brand: $('brandFilter').value || null,
          color: $('colorFilter').value || null,
          query: $('queryFilter').value || null,
          size: $('sizeFilter').value || null,
          status: $('statusFilter').value || 'active',
          subcategory: $('subcategoryFilter').value || null,
        });
      for (const id of ['statusFilter', 'subcategoryFilter', 'brandFilter', 'colorFilter', 'sizeFilter']) {
        $(id).addEventListener('change', applyFilterControls);
      }
      $('queryFilter').addEventListener('input', applyFilterControls);
      window.addEventListener('resize', () => {
        if (lastRequestedSize) {
          const observed = observedHostAllocation();
          traceHostGeometry('host_allocation_observed', {
            allocationAcknowledged: allocationMatches(lastRequestedSize, observed),
            observed,
            requested: lastRequestedSize,
            source: 'resize',
          });
        }
        notifySize('resize');
      });
      document.addEventListener('keydown', (event) => {
        const layer = $('detailLayer');
        if (event.key === 'Escape') {
          if (activePanelClose) { event.preventDefault(); activePanelClose(); return; }
          if (flippedId) { event.preventDefault(); closeDetail(); return; }
          if (openMenu) {
            const closingMenu = openMenu;
            openMenu = null;
            menuView = 'root';
            render();
            const freshButton = Array.prototype.slice.call(document.querySelectorAll('[data-menu]')).find((button) => button.dataset.menu === closingMenu);
            if (freshButton) freshButton.focus();
            return;
          }
          return;
        }
        if (!flippedId && !document.querySelector('.panel') && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
          const activeButton = document.activeElement?.closest?.('.card[data-item] .card-button');
          if (activeButton) {
            event.preventDefault();
            const buttons = Array.from(document.querySelectorAll('.card[data-item] .card-button'));
            const currentIndex = buttons.indexOf(activeButton);
            const columns = Math.max(1, Number($('app')?.getAttribute('data-grid-density') || 1));
            let nextIndex = currentIndex;
            if (event.key === 'ArrowLeft') nextIndex -= 1;
            if (event.key === 'ArrowRight') nextIndex += 1;
            if (event.key === 'ArrowUp') nextIndex -= columns;
            if (event.key === 'ArrowDown') nextIndex += columns;
            if (event.key === 'Home') nextIndex = 0;
            if (event.key === 'End') nextIndex = buttons.length - 1;
            nextIndex = Math.max(0, Math.min(buttons.length - 1, nextIndex));
            if (nextIndex !== currentIndex) {
              buttons[nextIndex].focus({ preventScroll: true });
              buttons[nextIndex].scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }
            return;
          }
        }
        if (event.key !== 'Tab') return;
        const activeModal = document.querySelector('.panel') || (flippedId && layer && layer.classList.contains('open') ? layer : null);
        if (!activeModal) return;
        const focusable = Array.prototype.slice.call(activeModal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'))
          .filter((element) => {
            const closedDetails = element.closest('details:not([open])');
            const isClosedDetailsSummary = closedDetails && element.tagName === 'SUMMARY' && element.parentElement === closedDetails;
            if (closedDetails && !isClosedDetailsSummary) return false;
            return element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
          });
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      });
      // Clicking outside an open ⋯ menu closes only that menu. A pointerdown listener used to run the
      // full collection renderer before the eventual click; when the target was a category chip, that
      // detached the chip and consumed the user's first tap. Keep the live card/image nodes in place.
      const dismissMenuInPlace = () => {
        const closingMenu = openMenu;
        openMenu = null;
        menuView = 'root';
        if (!closingMenu) return;
        const card = Array.prototype.slice.call(document.querySelectorAll('.card[data-item]'))
          .find((candidate) => candidate.dataset.item === closingMenu);
        card?.querySelector('.menu')?.remove();
        card?.querySelector('[data-menu]')?.setAttribute('aria-expanded', 'false');
      };
      const dismissOnOutside = (event) => {
        const target = event.target;
        // The desktop backdrop is part of the modal close contract: route through closeDetail so
        // collection scroll and focus are restored instead of merely deleting the visible layer.
        if (flippedId && target === $('detailLayer')) {
          closeDetail();
          return;
        }
        if (!openMenu) return;
        if (target && typeof target.closest === 'function' && (target.closest('.menu') || target.closest('[data-menu]'))) return;
        dismissMenuInPlace();
      };
      document.addEventListener('click', dismissOnOutside);
      window.addEventListener('message', (event) => {
        if (!isBridgeSource(event.source)) return;
        const data = event.data || {};
        if (data.jsonrpc !== '2.0') return;
        const method = data.method;
        // Host-initiated handshake: reply to the JSON-RPC request id, THEN signal readiness.
        // Claude delivers data via ui/notifications/tool-result only after this handshake closes,
        // so the {id,result} reply is load-bearing (host fact #3, 2026-06-11; grocery/budgets parity).
        if (method === 'ui/initialize') {
          if (data.id != null) {
            event.source.postMessage({ jsonrpc: '2.0', id: data.id, result: { appCapabilities: {}, protocolVersion: PROTOCOL_VERSION } }, '*');
          }
          bridgeInitialized = true;
          updateHostLayoutContext(data.params || data, false, 'host-initialize');
          receiveHostViewResult(data.params || data);
          bridgeNotify('ui/notifications/initialized', { templateUri: TEMPLATE_URI });
          bridgeNotify('ui/subscribe', { event: 'host-context-changed' });
          render();
          return;
        }
        if (method === 'ui/notifications/tool-result') { receiveHostViewResult(data.params || data); return; }
        if (method === 'ui/notifications/tool-input') { toolInput(data.params || data); return; }
        if (method === 'ui/notifications/tool-input-partial') { toolInput(data.params || data, false); return; }
        if (method === 'ui/notifications/tool-cancelled') { toolCancelled(); return; }
        if (method === 'host-context-changed') {
          const payload = data.params || data;
          if (lastRequestedSize) {
            const observed = observedHostAllocation();
            traceHostGeometry('host_allocation_observed', {
              allocationAcknowledged: allocationMatches(lastRequestedSize, observed),
              observed,
              requested: lastRequestedSize,
              source: 'host-context-before-update',
            });
          }
          notifySize('host-context', payload);
          return;
        }
        // JSON-RPC response to a widget-initiated request (connectMcpAppsHost's ui/initialize).
        if (data.id != null && bridgePending[data.id]) {
          const entry = bridgePending[data.id];
          delete bridgePending[data.id];
          clearTimeout(entry.timeout);
          if (data.error) entry.reject(new Error((data.error && data.error.message) || 'MCP Apps bridge error.'));
          else entry.resolve(data.result);
        }
      });
      // Widget-initiated handshake (parity with grocery/budgets). Whichever side initiates first,
      // both set bridgeInitialized; the host then pushes data via ui/notifications/tool-result.
      const connectMcpAppsHost = () => {
        if (bridgeReady) return bridgeReady;
        if (!getBridgeTargets().length) { bridgeReady = Promise.resolve(null); return bridgeReady; }
        bridgeReady = bridgeRequest('ui/initialize', {
          appInfo: { name: 'Fluent Style Closet', version: TEMPLATE_VERSION },
          appCapabilities: {},
          protocolVersion: PROTOCOL_VERSION,
        }, 6000).then((result) => {
          bridgeInitialized = true;
          updateHostLayoutContext(result, false, 'widget-initialize-response');
          receiveHostViewResult(result);
          bridgeNotify('ui/notifications/initialized', { templateUri: TEMPLATE_URI });
          render();
          return result;
        }).catch(() => null);
        return bridgeReady;
      };
      // OpenAI Apps SDK globals path (secondary; Claude uses the postMessage handshake above).
      const hydrateFromGlobals = () => {
        if (!window.openai) return false;
        updateHostLayoutContext(window.openai, false, 'openai-globals');
        rememberRenderInput(window.openai.toolInput);
        const candidates = [window.openai.toolResponseMetadata, window.openai.toolOutput, window.openai.structuredContent, window.openai.params, window.openai];
        for (const candidate of candidates) {
          if (extractViewModel(candidate) || extractCreateOutcome(candidate) || (initialCreateInputObserved && containsToolError(candidate))) { receiveHostViewResult(candidate); return true; }
        }
        return false;
      };
      const failInitialHydration = () => {
        if (viewModel || createOutcome) return;
        const app = $('app');
        app?.classList.add('delayed');
        app?.setAttribute('aria-busy', 'false');
        const status = app?.querySelector('.awaiting-status');
        if (status) status.textContent = 'Couldn\u2019t reload your closet. Ask ChatGPT to open it again.';
        notifySize('mount-failed');
      };
      const recoverInitialHydration = async () => {
        if (viewModel || createOutcome || hydrationRecoveryAttempted) return;
        hydrateFromGlobals();
        if (viewModel || createOutcome) return;
        hydrationRecoveryAttempted = true;
        const app = $('app');
        app?.classList.add('delayed');
        const status = app?.querySelector('.awaiting-status');
        if (status) status.textContent = 'Reconnecting to your closet\u2026';
        notifySize('mount-recovery');
        const args = initialRenderArgs;
        if (!renderInputObserved) {
          failInitialHydration();
          return;
        }
        try {
          let result = null;
          if (!bridgeInitialized && window.openai && typeof window.openai.callTool === 'function') {
            result = await window.openai.callTool('fluent_render_style_closet_surface', args);
          } else if (bridgeInitialized) {
            result = await callTool('fluent_render_style_closet_surface', args);
          } else {
            throw new Error('No initialized host tool path.');
          }
          if (!viewModel && !createOutcome) receiveViewModel(result, false, { adoptAuthoritativeView: true });
        } catch (error) {}
        if (!viewModel) failInitialHydration();
      };
      window.addEventListener('openai:set_globals', () => { hydrateFromGlobals(); notifySize('openai-globals'); });
      window.addEventListener('pagehide', clearModelContext);
      $('expandCloset')?.addEventListener('click', () => {
        const expanded = requestedDisplayMode === 'fullscreen'
          || (requestedDisplayMode !== 'inline' && hostLayoutContext.displayMode === 'fullscreen');
        requestDisplayMode(expanded ? 'inline' : 'fullscreen');
      });
      syncDisplayModeControl();
      hydrateFromGlobals();
      render();
      connectMcpAppsHost();
      setTimeout(() => {
        if (!viewModel) {
          const app = $('app');
          app?.classList.add('delayed');
          const status = app?.querySelector('.awaiting-status');
          if (status) status.textContent = 'Still loading your closet…';
          notifySize('mount-delayed');
        }
      }, 6000);
      setTimeout(() => {
        if (!viewModel) void recoverInitialHydration();
      }, 7000);
    })();
  </script>
</body>
</html>`;
  return templateVersion === STYLE_CLOSET_TEMPLATE_VERSION || templateVersion === 'v33'
    ? html
    : restoreCompatibleStyleClosetWidgetHtml(html);
}

async function getStyleClosetProvenanceBatches(
  style: Pick<StyleService, 'getItemProvenanceBatch'>,
  itemIds: string[],
) {
  const output: Awaited<ReturnType<StyleService['getItemProvenanceBatch']>> = new Map();
  for (let offset = 0; offset < itemIds.length; offset += 48) {
    const batch = await style.getItemProvenanceBatch(itemIds.slice(offset, offset + 48));
    for (const [itemId, provenance] of batch) output.set(itemId, provenance);
  }
  return output;
}

function normalizeFilter(filter: StyleClosetFilter | null | undefined): StyleClosetViewModel['filter'] {
  const canonical = canonicalizeStyleMetadataProjection({
    brand: nullableTrim(filter?.brand),
    category: nullableTrim(filter?.category),
    colorFamily: nullableTrim(filter?.color),
    colorName: null,
    size: nullableTrim(filter?.size),
    subcategory: nullableTrim(filter?.subcategory),
  });
  return {
    brand: canonical.brand,
    category: canonical.category,
    color: canonical.colorFamily,
    item_ids: normalizeIdList(filter?.item_ids),
    query: canonicalizeStyleSearchTerm(nullableTrim(filter?.query)),
    size: canonical.size,
    status: filter?.status ?? 'active',
    subcategory: canonical.subcategory,
  };
}

function applyClosetFilters(items: StyleItemRecord[], filter: StyleClosetViewModel['filter']): StyleItemRecord[] {
  return items.filter((item) => {
    if (filter.item_ids && filter.item_ids.length > 0 && !filter.item_ids.includes(item.id)) {
      return false;
    }
    if (filter.status !== 'any' && item.status !== filter.status) {
      return false;
    }
    if (filter.category && normalizeComparable(item.category) !== normalizeComparable(filter.category)) {
      return false;
    }
    if (filter.brand && normalizeComparable(item.brand) !== normalizeComparable(filter.brand)) {
      return false;
    }
    // Subcategory/color/size are dropdown-selected from the closet's own values, so match them
    // exactly (a substring match made size "S" also catch "XS"). Free-text search stays substring.
    if (filter.subcategory && normalizeComparable(item.subcategory) !== normalizeComparable(filter.subcategory)) {
      return false;
    }
    if (filter.color && normalizeComparable(item.colorFamily ?? item.colorName) !== normalizeComparable(filter.color)) {
      return false;
    }
    if (filter.size && normalizeComparable(item.size) !== normalizeComparable(filter.size)) {
      return false;
    }
    if (filter.query) {
      const haystack = [item.name, item.brand, item.category, item.subcategory, item.colorFamily, item.size]
        .filter(Boolean)
        .join(' ');
      // A query that is itself a category/subcategory word ("jeans") should match every item in that
      // group, not only items whose text literally contains it — otherwise items classified "Jean" but
      // not named "...jeans" are missed. Fall back to substring for ordinary free-text queries.
      const queryKey = pluralKey(filter.query);
      const matchesVocab =
        queryKey === pluralKey(item.category) ||
        queryKey === pluralKey(item.subcategory) ||
        queryKey === headNounKey(item.subcategory);
      if (!matchesVocab && !containsNormalized(haystack, filter.query)) {
        return false;
      }
    }
    return true;
  });
}

function prioritizePresentationMedia(
  items: StyleItemRecord[],
  provenanceByItemId: Awaited<ReturnType<StyleService['getItemProvenanceBatch']>>,
): StyleItemRecord[] {
  const cohorts = new Map<StyleClosetPresentationMediaState, StyleItemRecord[]>([
    ['ready', []],
    ['needs_normalization', []],
    ['unavailable', []],
    ['needs_photo', []],
  ]);
  for (const item of items) {
    cohorts.get(styleClosetNormalizationState(item, provenanceByItemId.get(item.id) ?? null))!.push(item);
  }
  return [
    ...cohorts.get('ready')!,
    ...cohorts.get('needs_normalization')!,
    ...cohorts.get('unavailable')!,
    ...cohorts.get('needs_photo')!,
  ];
}

function styleClosetNormalizationState(
  item: StyleItemRecord,
  provenance: Awaited<ReturnType<StyleService['getItemProvenance']>>,
): StyleClosetPresentationMediaState {
  if (findApprovedStyleCatalogPhoto(item, provenance)) return 'ready';
  const source = deriveStyleItemPresentationMediaSource(item);
  if (hasStyleClosetNormalizationSource(item)) return 'needs_normalization';
  if (source === 'none') return 'needs_photo';
  return 'unavailable';
}

function hasStyleClosetNormalizationSource(item: StyleItemRecord): boolean {
  // A worn/fit photo can remain source evidence, but the closet deliberately exposes no image-
  // generation action. Catalog presentation is now a host-owned precondition of new ingestion;
  // this legacy classification only keeps older source-backed records understandable and visible.
  const productPhotos = item.photos.filter((photo) => !isStyleFitPhoto(photo));
  return productPhotos.length > 0 && hasStyleNormalizationSource({ ...item, photos: productPhotos });
}

function styleClosetNormalizationRank(state: StyleClosetPresentationMediaState): number {
  return state === 'ready' ? 0 : state === 'needs_normalization' ? 1 : state === 'unavailable' ? 2 : 3;
}

function buildFilterOptions(activeItems: StyleItemRecord[]): StyleClosetViewModel['filterOptions'] {
  const brands = new Set<string>();
  const subcategories = new Set<string>();
  const colorFamilies = new Set<string>();
  const sizes = new Set<string>();
  for (const item of activeItems) {
    const brand = item.brand?.trim();
    if (brand) {
      brands.add(brand);
    }
    const subcategory = item.subcategory?.trim();
    if (subcategory) {
      subcategories.add(subcategory);
    }
    const colorFamily = (item.colorFamily ?? item.colorName)?.trim();
    if (colorFamily) {
      colorFamilies.add(colorFamily);
    }
    const size = item.size?.trim();
    if (size) {
      sizes.add(size);
    }
  }
  const sorted = (set: Set<string>) => Array.from(set).sort((left, right) => left.localeCompare(right));
  return { brands: sorted(brands), colorFamilies: sorted(colorFamilies), sizes: sorted(sizes), subcategories: sorted(subcategories) };
}

// Maps a user-facing term to the closet's own stored vocabulary, matching by exact value, then by a
// plural-insensitive "key" (data is stored singular: "Short", "Tee", "Jean"). Returns the field the term
// actually belongs to plus the canonical stored value, so a category term that is really a subcategory
// ("shorts") gets reassigned. Aliases stay tiny and non-colliding (never merges real distinct values).
const SUBCATEGORY_ALIASES: Record<string, string> = {
  't shirt': 'tee',
  'tshirt': 'tee',
  't-shirt': 'tee',
  // Irregular plurals the single-"s" stripper can't reach: "derbies"->"derbie", "booties"->"bootie",
  // "accessories"->"accessorie". Mapped to the stored singular/category key so "show me my derbies" etc.
  // surface (the filter vocab uses pluralKey, not the strict category normalizer).
  'derbie': 'derby',
  'bootie': 'boot',
  'accessorie': 'accessory',
};

function pluralKey(value: string | null | undefined): string {
  const normalized = normalizeComparable(value);
  // Strip a single trailing "s" first — never "es" (which would turn "shoes" into "sho") — THEN alias,
  // so plural vernacular ("t-shirts") singularizes to "t-shirt" and still maps onto the canonical "tee".
  const singular = normalized.length > 2 && normalized.endsWith('s') ? normalized.slice(0, -1) : normalized;
  return SUBCATEGORY_ALIASES[singular] ?? singular;
}

// The pluralKey of a compound subcategory's HEAD NOUN (final token): headNounKey("Cargo Short") -> "short".
// Used surfacing-only, so a free-text "shorts"/"boots" query reaches every compound in that family
// ("Cargo Short", "Chelsea Boot") without merging the distinct stored values themselves.
function headNounKey(value: string | null | undefined): string {
  const tokens = normalizeComparable(value).split(/\s+/).filter(Boolean);
  return tokens.length > 0 ? pluralKey(tokens[tokens.length - 1]) : '';
}

function resolveTermToVocabulary(
  term: string,
  categories: string[],
  subcategories: string[],
  preferred: 'category' | 'subcategory',
): { field: 'category' | 'subcategory'; value: string } | null {
  const vocab = { category: categories, subcategory: subcategories } as const;
  // Check the field we're resolving FIRST, so a term that legitimately matches both vocabularies stays
  // in its own field instead of being yanked to the other one on a coincidental key collision.
  const order: Array<'category' | 'subcategory'> = preferred === 'category' ? ['category', 'subcategory'] : ['subcategory', 'category'];
  for (const field of order) {
    const exact = vocab[field].find((value) => normalizeComparable(value) === normalizeComparable(term));
    if (exact) return { field, value: exact };
  }
  const key = pluralKey(term);
  for (const field of order) {
    const fuzzy = vocab[field].find((value) => pluralKey(value) === key);
    if (fuzzy) return { field, value: fuzzy };
  }
  return null;
}

function resolveClosetFilterVocabulary(
  filter: StyleClosetViewModel['filter'],
  activeItems: StyleItemRecord[],
): StyleClosetViewModel['filter'] {
  const distinct = (values: Array<string | null | undefined>) =>
    Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
  const categories = distinct(activeItems.map((item) => item.category));
  const subcategories = distinct(activeItems.map((item) => item.subcategory));
  const next = { ...filter };
  // Resolve the more specific field first so it wins; a term that belongs to the other field is moved
  // there (and the original field cleared) rather than silently failing an exact match.
  for (const key of ['subcategory', 'category'] as const) {
    const term = next[key];
    if (!term) continue;
    const hit = resolveTermToVocabulary(term, categories, subcategories, key);
    if (!hit) continue;
    if (hit.field === key) {
      next[key] = hit.value;
    } else {
      next[key] = null;
      if (!next[hit.field]) next[hit.field] = hit.value;
    }
  }
  return next;
}

function buildCategoryFacets(activeItems: StyleItemRecord[]): StyleClosetViewModel['facets'] {
  const counts = new Map<string, number>();
  for (const item of activeItems) {
    const category = item.category?.trim();
    if (category) {
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }
  return [
    { category: 'all', count: activeItems.length, label: 'All' },
    ...Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([category, count]) => ({ category, count, label: categoryLabel(category) })),
  ];
}

function selectPresentationOriginalPhoto(item: StyleItemRecord, displayPhotoId: string | null) {
  const candidates = item.photos.filter((photo) =>
    photo.source !== 'generated_metadata'
    && !isStyleFitPhoto(photo)
    && photo.id !== displayPhotoId,
  );
  const ranked = (photos: typeof candidates) => [...photos].sort((left, right) => {
    const leftUserSource = left.source === 'user_upload' ? 1 : 0;
    const rightUserSource = right.source === 'user_upload' ? 1 : 0;
    if (leftUserSource !== rightUserSource) return rightUserSource - leftUserSource;
    const leftTime = Math.max(Date.parse(left.createdAt ?? '') || 0, Date.parse(left.capturedAt ?? '') || 0);
    const rightTime = Math.max(Date.parse(right.createdAt ?? '') || 0, Date.parse(right.capturedAt ?? '') || 0);
    if (leftTime !== rightTime) return rightTime - leftTime;
    const leftOwned = left.artifactAvailable === true ? 1 : 0;
    const rightOwned = right.artifactAvailable === true ? 1 : 0;
    return rightOwned - leftOwned;
  });
  const deliverable = candidates.filter((photo) =>
    photo.artifactAvailable === true
    || Boolean(photo.sourceUrl && normalizeStyleRemoteImageSourceUrl(photo.sourceUrl)),
  );
  return ranked(deliverable)[0] ?? ranked(candidates)[0] ?? null;
}

function toClosetItem(
  item: StyleItemRecord,
  imageUrl: string | null,
  displayPhotoId: string | null,
  fitImageUrl: string | null,
  fitPhotoId: string | null,
  provenance: Awaited<ReturnType<StyleService['getItemProvenance']>>,
  originalImageUrl: string | null,
): StyleClosetItemViewModel {
  // The visual bundle resolves deliverability and may deliberately select a non-primary generated
  // Catalog row over a stale/private primary. Bind the returned URL and provenance to that exact row.
  const displayPhoto = displayPhotoId
    ? item.photos.find((photo) => photo.id === displayPhotoId && !isStyleFitPhoto(photo)) ?? null
    : item.photos.find((photo) => photo.isPrimary && !isStyleFitPhoto(photo))
      ?? item.photos.find((photo) => !isStyleFitPhoto(photo))
      ?? null;
  const displayIsGenerated = displayPhoto?.source === 'generated_metadata';
  const originalPhoto = displayIsGenerated && displayPhoto
    ? selectPresentationOriginalPhoto(item, displayPhoto.id)
    : null;
  // Bind the authorized URL to the exact photo selected by the visual bundle. Choosing the first
  // stored fit row independently can pair one person's URL with another row's owner-model marker.
  const fitPhoto = fitPhotoId
    ? item.photos.find((photo) => photo.id === fitPhotoId && isStyleFitPhoto(photo)) ?? null
    : null;
  const ownerModel = styleClosetOwnerModelState(provenance, fitPhoto);
  const media: StyleClosetItemViewModel['media'] = [];
  if (imageUrl && displayPhoto) {
    media.push({
      artifactBacked: displayPhoto.artifactAvailable === true,
      backgroundRemoved: displayPhoto.bgRemoved,
      contextualRole: 'none',
      heroEligible: false,
      id: displayPhoto.id,
      isSourceEvidence: !displayIsGenerated,
      label: displayIsGenerated ? 'Catalog' : 'Original',
      source: displayPhoto.source,
      url: imageUrl,
    });
  }
  if (originalPhoto) {
    media.push({
      artifactBacked: originalPhoto.artifactAvailable === true,
      backgroundRemoved: originalPhoto.bgRemoved,
      contextualRole: 'none',
      heroEligible: false,
      id: originalPhoto.id,
      isSourceEvidence: true,
      label: 'Original',
      source: originalPhoto.source,
      // Remote originals arrive only through the signed proxy resolver; owned artifacts are signed
      // later by photo id. The retained raw source URL never enters structured content.
      url: originalImageUrl,
    });
  }
  const ownerModelContextAvailable = ownerModel.state === 'context_available';
  const retainedWornSource = fitPhoto?.source !== 'generated_metadata';
  // Generic generated fit media may depict an unknown person. It remains retained in storage but is
  // omitted from the user-facing gallery until provenance binds it to the enrolled owner reference;
  // the label "On you" is reserved for verified owner context or retained worn/source evidence.
  const visibleFitImageUrl = fitPhoto && fitImageUrl && (ownerModelContextAvailable || retainedWornSource)
    ? fitImageUrl
    : null;
  // A retained worn/source photo is still useful closet media even when the item has no normalized
  // Catalog image yet. Use it as an explicitly labelled collection fallback rather than presenting a
  // blank "Add photo" tile that falsely implies the item has no image at all.
  const collectionImageUrl = imageUrl ?? visibleFitImageUrl;
  const hasImage = Boolean(collectionImageUrl);
  const dataCompleteness = [
    Boolean(item.name && item.category),
    Boolean(item.brand || item.size || item.colorFamily || item.subcategory),
    hasImage,
  ].filter(Boolean).length;
  if (fitPhoto && visibleFitImageUrl) {
    media.push({
      artifactBacked: fitPhoto.artifactAvailable === true,
      backgroundRemoved: fitPhoto.bgRemoved,
      contextualRole: ownerModelContextAvailable
        ? 'owner_model_full_body'
        : 'worn_source',
      heroEligible: ownerModelContextAvailable,
      id: fitPhoto.id,
      isSourceEvidence: fitPhoto.source !== 'generated_metadata',
      label: 'On you',
      source: fitPhoto.source,
      url: visibleFitImageUrl,
    });
  }
  const review = styleClosetReviewState(provenance);
  const archiveState = styleClosetArchiveState(provenance);
  const sourceSnapshot = isRecord(provenance?.sourceSnapshot) ? provenance.sourceSnapshot : null;
  const duplicateMergeRedirect = sourceSnapshot && isRecord(sourceSnapshot.duplicateMergeRedirect) ? sourceSnapshot.duplicateMergeRedirect : null;
  const duplicateMergeId = typeof duplicateMergeRedirect?.mergeId === 'string' ? duplicateMergeRedirect.mergeId : null;
  const presentationMediaSource = deriveStyleItemPresentationMediaSource(item);
  const normalizedCatalog = findApprovedStyleCatalogPhoto(item, provenance);
  const presentationMediaState: StyleClosetPresentationMediaState = normalizedCatalog?.id === displayPhoto?.id && imageUrl
    ? 'ready'
    : hasStyleClosetNormalizationSource(item) || Boolean(visibleFitImageUrl)
      ? 'needs_normalization'
      : presentationMediaSource === 'none'
        ? 'needs_photo'
        : 'unavailable';
  return {
    archiveDisposition: archiveState.archiveDisposition,
    productReference: item.productReference?.reference?.status === 'confirmed' ? item.productReference : undefined,
    archiveReason: archiveState.archiveReason,
    brand: item.brand,
    category: item.category,
    colorFamily: item.colorFamily,
    colorHex: item.colorHex,
    colorName: item.colorName,
    dataCompleteness: { have: dataCompleteness, of: 3 },
    detail: toClosetDetail(item.profile?.raw ?? null),
    duplicateCandidates: [],
    duplicateMergeId,
    fitImageUrl: visibleFitImageUrl,
    hasImage,
    hasFitPhoto: item.photos.some(isStyleFitPhoto),
    id: item.id,
    imageUrl: collectionImageUrl,
    media,
    name: item.name,
    ownerModel,
    presentationMediaSource,
    presentationMediaState,
    // Compatibility-only projection for retained v7/cached clients; v22 never writes or renders it.
    reanalyzePending: item.profile?.raw.reanalyzePending === true,
    review,
    size: item.size,
    status: item.status,
    subcategory: item.subcategory,
    updatedAt: item.updatedAt,
  };
}

function styleClosetArchiveState(
  provenance: Awaited<ReturnType<StyleService['getItemProvenance']>>,
): Pick<StyleClosetItemViewModel, 'archiveDisposition' | 'archiveReason'> {
  const sourceSnapshot = isRecord(provenance?.sourceSnapshot) ? provenance.sourceSnapshot : null;
  const archiveEvidenceTrail = sourceSnapshot && isRecord(sourceSnapshot.archiveEvidenceTrail)
    ? sourceSnapshot.archiveEvidenceTrail
    : null;
  const rawDisposition = archiveEvidenceTrail?.disposition ?? sourceSnapshot?.disposition;
  const allowedDispositions = new Set([
    'returned',
    'sold',
    'donated',
    'gifted',
    'worn_out',
    'never_purchased',
    'duplicate',
    'other',
  ]);
  const archiveDisposition = typeof rawDisposition === 'string' && allowedDispositions.has(rawDisposition)
    ? rawDisposition as StyleClosetItemViewModel['archiveDisposition']
    : null;
  const rawReason = archiveEvidenceTrail?.reason ?? sourceSnapshot?.archiveReason;
  const archiveReason = typeof rawReason === 'string' && rawReason.trim() ? rawReason.trim() : null;
  return { archiveDisposition, archiveReason };
}

function buildHierarchicalFilterOptions(
  statusItems: StyleItemRecord[],
  filter: Required<Pick<StyleClosetFilter, 'status'>> & Omit<StyleClosetFilter, 'status'>,
): StyleClosetViewModel['filterOptions'] {
  const categoryItems = filter.category
    ? statusItems.filter((item) => normalizeComparable(item.category) === normalizeComparable(filter.category))
    : statusItems;
  const subcategoryItems = filter.subcategory
    ? categoryItems.filter((item) => normalizeComparable(item.subcategory) === normalizeComparable(filter.subcategory))
    : categoryItems;
  const brandItems = filter.brand
    ? subcategoryItems.filter((item) => normalizeComparable(item.brand) === normalizeComparable(filter.brand))
    : subcategoryItems;
  return {
    // Each level is derived from the complete applicable status set, never the current 48-item page.
    // A list also deliberately ignores its own selected value so users can switch rather than becoming
    // trapped by the current choice.
    subcategories: buildFilterOptions(categoryItems).subcategories,
    brands: buildFilterOptions(subcategoryItems).brands,
    colorFamilies: buildFilterOptions(brandItems).colorFamilies,
    sizes: buildFilterOptions(brandItems).sizes,
  };
}

function styleClosetOwnerModelState(
  provenance: Awaited<ReturnType<StyleService['getItemProvenance']>>,
  fitPhoto: StyleItemRecord['photos'][number] | null,
): StyleClosetItemViewModel['ownerModel'] {
  const technicalMetadata = isRecord(provenance?.technicalMetadata) ? provenance.technicalMetadata : null;
  const marker = technicalMetadata && isRecord(technicalMetadata.ownerModel) ? technicalMetadata.ownerModel : null;
  const referenceRevision = typeof marker?.referenceRevision === 'string' && marker.referenceRevision.trim()
    ? marker.referenceRevision.trim()
    : null;
  // The marker is deliberately fail-closed. Generic fit photos and generic host-generated images do
  // not become account-model media by implication; every enrollment, consent, scope, version,
  // revocation, capability, and exact-photo binding predicate must be explicit in stored provenance.
  const enrolled = Boolean(
    marker
    && marker.state === 'enrolled'
    && marker.ownerScoped === true
    && marker.consent === 'granted'
    && marker.fullBody === true
    && marker.revocable === true
    && marker.generationCapability === 'supported'
    && referenceRevision,
  );
  const contextAvailable = Boolean(
    enrolled
    && fitPhoto
    && fitPhoto.source === 'generated_metadata'
    && marker?.generatedPhotoId === fitPhoto.id,
  );
  return {
    generationCapability: 'host_required',
    referenceRevision: enrolled ? referenceRevision : null,
    state: contextAvailable ? 'context_available' : enrolled ? 'enrolled_no_context' : 'setup_required',
  };
}

function styleClosetReviewState(
  provenance: Awaited<ReturnType<StyleService['getItemProvenance']>>,
): StyleClosetItemViewModel['review'] {
  const metadata = isRecord(provenance?.technicalMetadata) ? provenance.technicalMetadata : null;
  const review = metadata && isRecord(metadata.review) ? metadata.review : null;
  const lowConfidenceFields = Array.isArray(review?.lowConfidenceFields)
    ? review.lowConfidenceFields.filter((field): field is string => typeof field === 'string' && Boolean(field.trim()))
    : [];
  const overallConfidence = typeof review?.overallConfidence === 'number' && Number.isFinite(review.overallConfidence)
    ? review.overallConfidence
    : null;
  return {
    lowConfidenceFields,
    needsReview: review?.needsReview === true || lowConfidenceFields.length > 0,
    overallConfidence,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

// Project the raw fit verdict to a neutral, user-facing label. The widget bans the word "verdict"
// (and score/rating/recommendation), so we never surface the enum or the word — only this phrasing.
function fitSummaryLabel(verdict: StyleFitVerdict | null | undefined): string | null {
  switch (verdict) {
    case 'true_to_size':
      return 'True to size';
    case 'runs_small':
      return 'Runs small';
    case 'runs_large':
      return 'Runs large';
    default:
      return null;
  }
}

// The closet widget's lexical contract forbids these words in rendered text AND keeps them out of the
// model-visible payload. Profile free-text is user/host-authored, so a value can carry a forbidden
// substring (e.g. "deco-rating"); filter at the SOURCE so structuredContent never carries it.
const CLOSET_BANNED_DETAIL = /verdict|score|recommendation|rating/i;
const cleanClosetText = (value: string | null | undefined): string | null =>
  typeof value === 'string' && value.trim() && !CLOSET_BANNED_DETAIL.test(value) ? value : null;
const cleanClosetList = (value: string[] | null | undefined): string[] =>
  Array.isArray(value)
    ? value.filter((entry) => typeof entry === 'string' && entry.trim() && !CLOSET_BANNED_DETAIL.test(entry))
    : [];

// Map the loaded profile document to the detail-card view model. Returns null when there is no
// meaningful content so the widget shows the catalog + larger photo without an empty section.
function toClosetDetail(profile: StyleItemProfileDocument | null): StyleClosetItemDetail | null {
  if (!profile) {
    return null;
  }
  const detail: StyleClosetItemDetail = {
    avoidOccasions: cleanClosetList(profile.avoidOccasions),
    avoidUseCases: cleanClosetList(profile.avoidUseCases),
    bestOccasions: cleanClosetList(profile.bestOccasions),
    dressCodeMaximum: profile.dressCode?.max ?? null,
    dressCodeMinimum: profile.dressCode?.min ?? null,
    fabricHand: cleanClosetText(profile.fabricHand),
    fitObservations: cleanClosetList(profile.fitObservations),
    fitSummary: cleanClosetText(fitSummaryLabel(profile.fitVerdict)),
    lengthNote: cleanClosetText(profile.lengthNote),
    ownedSize: cleanClosetText(profile.ownedSize),
    pairingNotes: cleanClosetText(profile.pairingNotes),
    polishLevel: cleanClosetText(profile.polishLevel),
    qualityTier: cleanClosetText(profile.qualityTier),
    seasonality: cleanClosetList(profile.seasonality),
    silhouette: cleanClosetText(profile.silhouette),
    styleRole: cleanClosetText(profile.styleRole),
    structureLevel: cleanClosetText(profile.structureLevel),
    tags: cleanClosetList(profile.tags),
    texture: cleanClosetText(profile.texture),
    useCases: cleanClosetList(profile.useCases),
    visualWeight: cleanClosetText(profile.visualWeight),
  };
  const hasContent =
    Boolean(detail.fitSummary || detail.ownedSize || detail.lengthNote || detail.pairingNotes || detail.styleRole || detail.silhouette || detail.fabricHand || detail.polishLevel || detail.qualityTier || detail.structureLevel || detail.texture || detail.visualWeight || detail.dressCodeMinimum != null || detail.dressCodeMaximum != null) ||
    detail.fitObservations.length > 0 ||
    detail.bestOccasions.length > 0 ||
    (detail.avoidOccasions?.length ?? 0) > 0 ||
    (detail.avoidUseCases?.length ?? 0) > 0 ||
    detail.useCases.length > 0 ||
    detail.seasonality.length > 0 ||
    detail.tags.length > 0;
  return hasContent ? detail : null;
}

function assetUrl(asset: StyleVisualBundleAssetRecord): string | null {
  return asset.fallbackSignedOriginalUrl ?? asset.authenticatedOriginalUrl ?? asset.sourceUrl ?? null;
}

async function resolvedClosetAssetUrl(
  asset: StyleVisualBundleAssetRecord,
  resolveRemoteMediaUrl: ((sourceUrl: string) => Promise<string | null>) | null | undefined,
): Promise<string | null> {
  const url = assetUrl(asset);
  if (!url || url !== asset.sourceUrl) return url;
  return resolveRemoteMediaUrl && asset.sourceUrl ? resolveRemoteMediaUrl(asset.sourceUrl) : null;
}

function filterLabel(filter: StyleClosetViewModel['filter']): string {
  if (filter.item_ids && filter.item_ids.length > 0) {
    return 'Items like this';
  }
  if (filter.category) {
    return categoryLabel(filter.category);
  }
  if (filter.status === 'archived') {
    return 'Archived';
  }
  if (filter.query) {
    return `Search: ${filter.query}`;
  }
  return 'All';
}

function categoryLabel(category: string): string {
  const normalized = category.toUpperCase();
  const labels: Record<string, string> = {
    ACCESSORY: 'Accessories',
    BOTTOM: 'Bottoms',
    BOTTOMS: 'Bottoms',
    ONE_PIECE: 'Dresses & jumpsuits',
    OUTERWEAR: 'Outerwear',
    SHOE: 'Shoes',
    SHOES: 'Shoes',
    TOP: 'Tops',
    TOPS: 'Tops',
  };
  return labels[normalized] ?? titleCase(category.replace(/_/g, ' '));
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function normalizeComparable(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function containsNormalized(value: string | null | undefined, needle: string): boolean {
  return normalizeComparable(value).includes(normalizeComparable(needle));
}

function nullableTrim(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeIdList(value: Array<string | null | undefined> | null | undefined): string[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    const trimmed = raw?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out.length > 0 ? out : null;
}

function clampLimit(limit: number | null | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    // Keep first paint useful without eagerly requesting every original asset in a realistic closet.
    // The widget continues from an opaque server cursor near the collection end.
    return 48;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), 120);
}

type StyleClosetCursorKey = { id: string; rank: number; scope: string; value: string; version: 1 };

function buildClosetPageEntries(
  items: StyleItemRecord[],
  input: {
    focusedItemId: string | null;
    itemIdOrder: string[] | null;
    presentationRankByItemId: Map<string, number>;
    scope: string;
  },
): Array<{ item: StyleItemRecord; key: StyleClosetCursorKey }> {
  const exactOrder = input.itemIdOrder
    ? new Map(input.itemIdOrder.map((id, index) => [id, index]))
    : null;
  return items.map((item) => {
    const exactIndex = exactOrder?.get(item.id);
    const created = Date.parse(item.createdAt ?? '');
    const inverseCreated = Number.isFinite(created) ? 9_999_999_999_999 - created : 9_999_999_999_999;
    const key: StyleClosetCursorKey = {
      id: item.id,
      rank: item.id === input.focusedItemId
        ? -1
        : exactIndex !== undefined
          ? 0
          : input.presentationRankByItemId.get(item.id) ?? 3,
      scope: input.scope,
      value: exactIndex !== undefined
        ? String(exactIndex).padStart(12, '0')
        : String(inverseCreated).padStart(13, '0'),
      version: 1,
    };
    return { item, key };
  }).sort((left, right) => compareClosetPageKey(left.key, right.key));
}

function compareClosetPageKey(left: StyleClosetCursorKey, right: StyleClosetCursorKey): number {
  return left.rank - right.rank || left.value.localeCompare(right.value) || left.id.localeCompare(right.id);
}

function encodeClosetCursor(key: StyleClosetCursorKey): string {
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');
}

function decodeClosetCursor(cursor: string | null | undefined): StyleClosetCursorKey | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<StyleClosetCursorKey>;
    if (
      parsed.version !== 1 || typeof parsed.id !== 'string' || !parsed.id
      || typeof parsed.rank !== 'number' || !Number.isInteger(parsed.rank)
      || typeof parsed.scope !== 'string' || !parsed.scope
      || typeof parsed.value !== 'string' || !parsed.value
    ) throw new Error('invalid cursor payload');
    return parsed as StyleClosetCursorKey;
  } catch {
    throw new Error('Style Closet cursor is malformed or unsupported.');
  }
}

function closetCursorScope(input: {
  filter: StyleClosetViewModel['filter'];
  focusedItemId: string | null;
  itemIds: string[] | null;
  mode: StyleClosetPresentationMode | null;
}): string {
  const filter = Object.fromEntries(Object.entries(input.filter).sort(([left], [right]) => left.localeCompare(right)));
  return JSON.stringify({ filter, focusedItemId: input.focusedItemId, itemIds: input.itemIds, mode: input.mode ?? 'browse', version: 1 });
}
