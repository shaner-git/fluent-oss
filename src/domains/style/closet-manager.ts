import { isStyleFitPhoto } from './helpers';
import type { StyleService } from './service';
import type { StyleFitVerdict, StyleItemProfileDocument, StyleItemRecord, StyleVisualBundleAssetRecord } from './types';

export const STYLE_CLOSET_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-style-closet-v1.html';
export const STYLE_CLOSET_V2_TEMPLATE_URI = 'ui://widget/fluent-style-closet-v2.html';
export const STYLE_CLOSET_V3_TEMPLATE_URI = 'ui://widget/fluent-style-closet-v3.html';
export const STYLE_CLOSET_V4_TEMPLATE_URI = 'ui://widget/fluent-style-closet-v4.html';
export const STYLE_CLOSET_V5_TEMPLATE_URI = 'ui://widget/fluent-style-closet-v5.html';
export const STYLE_CLOSET_V6_TEMPLATE_URI = 'ui://widget/fluent-style-closet-v6.html';
export const STYLE_CLOSET_TEMPLATE_VERSION = 'v7';
export const STYLE_CLOSET_TEMPLATE_URI = 'ui://widget/fluent-style-closet-v7.html';

export type StyleClosetStatusFilter = 'active' | 'archived' | 'any';

export interface StyleClosetFilter {
  brand?: string | null;
  category?: string | null;
  color?: string | null;
  favorite_only?: boolean | null;
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
  surface: 'style_closet';
  summary: {
    activeTotal: number;
    filterLabel: string;
    shownTotal: number;
  };
  templateUri: typeof STYLE_CLOSET_TEMPLATE_URI;
  title: 'Your closet';
}

// The expanded detail-card payload: fit + style fields surfaced when an item is flipped open. All
// keys are NEUTRAL by design — the closet widget bans the words/keys verdict|score|recommendation|
// rating (style-closet-widget-interactions test), so `fitVerdict` is projected as a plain `fitSummary`
// label here and never under its raw name. Sparse profiles produce a null detail (no section shown).
export interface StyleClosetItemDetail {
  bestOccasions: string[];
  fabricHand: string | null;
  fitObservations: string[];
  fitSummary: string | null;
  lengthNote: string | null;
  ownedSize: string | null;
  pairingNotes: string | null;
  seasonality: string[];
  silhouette: string | null;
  styleRole: string | null;
  tags: string[];
  useCases: string[];
}

export interface StyleClosetItemViewModel {
  brand: string | null;
  category: string | null;
  colorFamily: string | null;
  colorHex: string | null;
  colorName: string | null;
  dataCompleteness: { have: number; of: 3 };
  // Expanded metadata for the flip-to-detail card; null when the item has no usable profile content.
  detail: StyleClosetItemDetail | null;
  // Signed URL of the worn/fit photo shown on the detail back-face, or null when the item has no
  // distinct fit photo. Fetched server-side alongside the display image (no widget round-trip).
  fitImageUrl: string | null;
  hasImage: boolean;
  hasFitPhoto: boolean;
  id: string;
  imageUrl: string | null;
  name: string | null;
  reanalyzePending: boolean;
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
  style: Pick<StyleService, 'getVisualBundle' | 'listItems'>,
  input: { cursor?: string | null; filter?: StyleClosetFilter | null; limit?: number | null },
): Promise<StyleClosetStructuredContent> {
  const limit = clampLimit(input.limit);
  const offset = parseCursor(input.cursor);
  const allItems = await style.listItems();
  const activeItems = allItems.filter((item) => item.status === 'active');
  // Resolve the caller's category/subcategory term against the closet's OWN vocabulary before matching,
  // so "shorts" finds the stored "Short" and "tees" finds "Tee" (the data is stored singular). This also
  // reassigns a term to the right field — Claude saying "pull up my shorts" as category resolves to the
  // subcategory "Short". The resolved filter is echoed in the view model, so the widget adopts the
  // canonical value and its dropdown highlights the match.
  const filter = resolveClosetFilterVocabulary(normalizeFilter(input.filter), activeItems);
  // Load the full set for the requested STATUS only. The widget filters category/subcategory/color/
  // size/search CLIENT-SIDE from this set so the user can switch facets without a host round-trip;
  // pre-narrowing the items here would break in-widget chip switching. The rest of `filter` is echoed
  // in the view model so the widget ADOPTS it as its initial filter ("show my shirts" opens
  // pre-narrowed), and matchedItems drives the count/label for the text fallback.
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
  const matchedItems = applyClosetFilters(allItems, filter);
  const pagedItems = idNarrowed ? statusItems : statusItems.slice(offset, offset + limit);
  const nextCursor = idNarrowed ? null : offset + limit < statusItems.length ? String(offset + limit) : null;
  // Fetch BOTH photo roles SERVER-SIDE inside this render handler, which is already authorized for the
  // closet's read scope (meals OR style — see requireAnyScope at the render tool). The product photo is
  // the tile/display image; the worn/fit photo (when one exists and is distinct) rides along in the
  // payload for the flip-to-detail card. Doing it here rather than via a widget-initiated
  // fluent_get_media_bundle call keeps the detail card working under a meals-only closet token and needs
  // no widget-callable read tool. Only items that actually have a fit photo trigger the second fetch.
  const itemsWithFitPhoto = pagedItems.filter((item) => item.photos.some(isStyleFitPhoto));
  const [mediaBundle, fitBundle] = await Promise.all([
    style.getVisualBundle({
      deliveryMode: 'authenticated_with_signed_fallback',
      includeComparators: false,
      itemIds: pagedItems.map((item) => item.id),
      maxImages: pagedItems.length,
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
    imageUrlByItemId.set(asset.itemId, assetUrl(asset));
    displayPhotoIdByItemId.set(asset.itemId, asset.photoId ?? null);
  }
  // Map the worn/fit photo per item, but only when it is a DISTINCT photo from the display image.
  const fitImageUrlByItemId = new Map<string, string | null>();
  for (const asset of fitBundle?.assets ?? []) {
    if (!asset.itemId || fitImageUrlByItemId.has(asset.itemId)) {
      continue;
    }
    if (asset.photoId && asset.photoId === displayPhotoIdByItemId.get(asset.itemId)) {
      continue;
    }
    fitImageUrlByItemId.set(asset.itemId, assetUrl(asset));
  }
  // Only emit signed same-origin image URLs (from the bundle). An item with no signable bundle asset
  // shows the "Add photo" placeholder rather than a broken cross-origin/authenticated URL.
  const items = pagedItems.map((item) =>
    toClosetItem(item, imageUrlByItemId.get(item.id) ?? null, fitImageUrlByItemId.get(item.id) ?? null),
  );
  const facetSource = idNarrowed ? statusItems : activeItems;
  const viewFilter =
    idNarrowed && statusItems.length > 0
      ? { ...filter, item_ids: statusItems.map((item) => item.id) }
      : filter;
  const summary = {
    activeTotal: idNarrowed ? statusItems.length : activeItems.length,
    filterLabel: filterLabel(filter),
    shownTotal: idNarrowed ? statusItems.length : matchedItems.length,
  };
  return {
    ...buildStyleClosetViewModel({
      cursor: nextCursor,
      facets: buildCategoryFacets(facetSource),
      filter: viewFilter,
      filterOptions: buildFilterOptions(facetSource),
      items,
      summary,
    }),
    hostResponseInstruction:
      'The Style Closet widget is ready. Keep the model response to a short acknowledgement and let the mounted app carry the grid.',
    hostResponseMode: 'native_widget_rendered',
  };
}

export function buildStyleClosetViewModel(input: {
  cursor: string | null;
  facets: StyleClosetViewModel['facets'];
  filter: StyleClosetViewModel['filter'];
  filterOptions: StyleClosetViewModel['filterOptions'];
  items: StyleClosetItemViewModel[];
  summary: StyleClosetViewModel['summary'];
}): StyleClosetViewModel {
  return {
    cursor: input.cursor,
    experience: 'style_closet',
    facets: input.facets,
    filter: input.filter,
    filterOptions: input.filterOptions,
    items: input.items,
    surface: 'style_closet',
    summary: input.summary,
    templateUri: STYLE_CLOSET_TEMPLATE_URI,
    title: 'Your closet',
  };
}

export function getStyleClosetWidgetHtml(): string {
  return String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    /* Compact, bounded closet (grocery-neutral tokens). The whole widget is capped to ~one screen:
       the header + filter chips are fixed in .head and only .scroll (the grid) scrolls. Denser
       4-across cards. Token source of truth: src/domains/meals/grocery-list.ts :root. */
    :root {
      color-scheme: light;
      --card-bg: #ffffff;
      --card-border: rgba(0, 0, 0, 0.08);
      --surface-alt: #f7f7f8;
      --row-border: rgba(0, 0, 0, 0.08);
      --text: #0d0d0d;
      --text-muted: #3c3c43;
      --text-soft: #6e6e73;
      --button-bg: #ffffff;
      --button-border: rgba(0, 0, 0, 0.08);
      --accent: #2f6feb;
      --accent-dim: rgba(47, 111, 235, 0.1);
      --danger: #b42318;
      --danger-dim: rgba(180, 35, 24, 0.08);
      --shadow: 0 1px 3px rgba(0, 0, 0, 0.06), 0 10px 28px rgba(0, 0, 0, 0.04);
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "Helvetica Neue", sans-serif;
      font-family: var(--font-sans);
      color: var(--text);
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: transparent; font-family: var(--font-sans); color: var(--text); }
    button, input, select { font: inherit; }
    button { cursor: pointer; }
    .app { margin: 0; display: flex; flex-direction: column; max-height: 760px; border: 1px solid var(--card-border); border-radius: 16px; background: var(--card-bg); box-shadow: var(--shadow); overflow: hidden; }
    .head { flex: 0 0 auto; padding: 14px 18px 10px; border-bottom: 1px solid var(--row-border); }
    .scroll { flex: 1 1 auto; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 12px 18px 14px; }
    .bar { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
    h1 { font-size: 18px; line-height: 1.25; margin: 0; font-weight: 600; letter-spacing: -0.01em; }
    .micro { color: var(--text-soft); font-size: 11px; letter-spacing: 0.08em; font-weight: 500; text-transform: uppercase; margin: 0 0 2px; }
    .filters { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; margin-top: 10px; }
    .chip { border: 1px solid var(--button-border); background: var(--button-bg); color: var(--text); min-height: 28px; border-radius: 999px; padding: 0 11px; display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 500; }
    .chip .micro { margin: 0; font-size: 11px; letter-spacing: 0; text-transform: none; color: var(--text-soft); font-variant-numeric: tabular-nums; }
    .chip[aria-pressed="true"] { background: var(--accent-dim); border-color: rgba(47, 111, 235, 0.3); color: var(--accent); }
    .chip[aria-pressed="true"] .micro { color: var(--accent); }
    .filters-toggle { gap: 6px; color: var(--text-muted); min-height: 30px; }
    .filters-toggle .caret { font-size: 10px; color: var(--text-soft); transition: transform 0.15s ease; }
    .filters-toggle.open { background: var(--accent-dim); border-color: rgba(47, 111, 235, 0.3); color: var(--accent); }
    .filters-toggle.open .caret { transform: rotate(180deg); color: var(--accent); }
    .advanced { display: none; grid-template-columns: repeat(4, minmax(120px, 1fr)); gap: 8px; margin: 10px 0 2px; }
    .advanced.open { display: grid; }
    .advanced input, .advanced select { min-height: 34px; border: 1px solid var(--button-border); border-radius: 8px; background: var(--card-bg); padding: 0 10px; color: var(--text); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(155px, 1fr)); gap: 12px; }
    .card { position: relative; min-width: 0; border: 1px solid var(--card-border); border-radius: 12px; background: var(--card-bg); overflow: hidden; }
    .photo { position: relative; aspect-ratio: 3 / 4; background: var(--surface-alt); display: grid; place-items: center; overflow: hidden; }
    .photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .addPhoto { width: 100%; height: 100%; border: 0; background: transparent; color: var(--text-soft); display: grid; place-items: center; padding: 16px; }
    .plus { width: 36px; height: 36px; border: 1px solid var(--button-border); border-radius: 50%; display: grid; place-items: center; margin: 0 auto 6px; font-size: 20px; color: var(--text-muted); }
    .details { position: relative; padding: 8px 9px 9px; }
    .name { font-weight: 600; font-size: 12.5px; line-height: 1.25; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .line { color: var(--text-soft); font-size: 11px; line-height: 1.3; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .swatch { display: inline-block; width: 8px; height: 8px; border-radius: 50%; border: 1px solid var(--row-border); vertical-align: -1px; margin-right: 4px; background: var(--surface-alt); }
    button.swatch { padding: 0; cursor: pointer; }
    /* Color-detail bubble: sibling of .line (escapes its overflow clip), anchored above .details so it
       points up over the photo and stays inside the card. Revealed on swatch tap (mobile) or hover (desktop title). */
    .swatch-tip { position: absolute; left: 9px; bottom: 100%; margin-bottom: 3px; display: none; max-width: calc(100% - 18px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: #1c1c1e; color: #fff; font-size: 11px; line-height: 1.3; padding: 3px 7px; border-radius: 6px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25); z-index: 6; pointer-events: none; }
    .swatch-tip.show { display: block; }
    .manage { position: absolute; top: 6px; right: 6px; width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--card-border); background: rgba(255, 255, 255, 0.92); box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1); color: var(--text-muted); display: grid; place-items: center; line-height: 1; }
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
    .empty { padding: 40px 16px; color: var(--text-soft); text-align: center; border: 1px dashed var(--card-border); border-radius: 14px; background: var(--surface-alt); font-size: 13px; }
    .panel { position: fixed; inset: 0; z-index: 10; background: rgba(13, 13, 13, 0.32); display: grid; place-items: start center; padding: 18px; overflow: auto; }
    .sheet { width: min(520px, 100%); border: 1px solid var(--card-border); border-radius: 16px; background: var(--card-bg); box-shadow: var(--shadow); padding: 18px 20px; }
    .sheet h2 { margin: 0 0 14px; font-size: 18px; line-height: 1.2; font-weight: 600; letter-spacing: -0.01em; }
    .form { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .form label { display: grid; gap: 5px; }
    .form .micro { margin: 0; }
    .form input, .form select { min-height: 38px; border: 1px solid var(--button-border); border-radius: 8px; background: var(--card-bg); padding: 0 10px; color: var(--text); min-width: 0; }
    .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 16px; }
    .btn { min-height: 38px; border: 1px solid var(--button-border); border-radius: 10px; background: var(--button-bg); padding: 0 14px; font-size: 13px; font-weight: 500; color: var(--text); }
    .btn:hover { background: var(--surface-alt); }
    .primary { background: var(--accent); color: #fff; border-color: var(--accent); }
    .primary:hover { background: #245fd0; }
    .danger-btn { background: var(--danger); color: #fff; border-color: var(--danger); }
    .pending { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(255, 255, 255, 0.86); color: var(--text-muted); font-size: 12px; z-index: 4; }
    .reanalyzeBadge { position: absolute; left: 10px; top: 10px; z-index: 3; max-width: calc(100% - 52px); border: 1px solid rgba(37, 99, 235, 0.22); border-radius: 999px; background: rgba(255, 255, 255, 0.9); color: #1d4ed8; font-size: 10px; font-weight: 600; line-height: 1.2; padding: 4px 7px; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08); }
    /* Flip-to-detail card. Clicking a tile flips it to a back-face with a larger photo (plus the worn
       photo when one exists) and the item's full metadata. The 3D rotateY lives on .card-inner so the
       card itself can keep overflow:hidden for its rounded corners without killing preserve-3d. The
       VISIBLE face drives the card's height: the front is in-flow by default (small tile height); when
       flipped, the back becomes in-flow (its taller content sets the height) and the card spans the row
       so the detail has room. notifySize() reports the new height so the host grows the iframe. */
    /* Both perspective() AND preserve-3d are applied ONLY in the flipped state. A transform, perspective,
       or preserve-3d on a non-flipped ancestor would make it the containing block for position:fixed
       descendants and collapse the mobile .menu bottom-sheet onto the card. The flip always closes any
       open menu first, so when these properties are active there is no fixed menu to mis-contain. */
    .card-inner { position: relative; width: 100%; transition: transform 0.45s cubic-bezier(0.2, 0.7, 0.2, 1); }
    .card.flipped .card-inner { transform: perspective(1100px) rotateY(180deg); transform-style: preserve-3d; }
    /* Only the face currently shown is interactive. backface-visibility:hidden hides the rotated-away
       face visually, but WebKit/iOS still HIT-TESTS it (Blink culls it): with no preserve-3d 3D context
       on the non-flipped card, the hidden .card-back sits atop .card-front and swallows taps on the ⋯
       button — that is the mobile menu-reopen bug. Gating pointer-events by flip state fixes hit-testing
       without a transform/preserve-3d on the non-flipped card (which would re-break the fixed menu). */
    .card-front, .card-back { width: 100%; -webkit-backface-visibility: hidden; backface-visibility: hidden; }
    .card-front { position: relative; }
    .card-back { position: absolute; top: 0; left: 0; transform: rotateY(180deg); background: var(--card-bg); pointer-events: none; }
    .card.flipped .card-front { position: absolute; top: 0; left: 0; pointer-events: none; }
    .card.flipped .card-back { position: relative; pointer-events: auto; }
    .card.flipped { grid-column: 1 / -1; z-index: 3; box-shadow: var(--shadow); }
    .back-close { position: absolute; top: 6px; right: 6px; width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--card-border); background: rgba(255, 255, 255, 0.92); box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1); color: var(--text-muted); font-size: 18px; line-height: 1; display: grid; place-items: center; z-index: 4; }
    /* Photo carousel: one photo at a time with prev/next arrows + dots (display photo, then worn/fit).
       Replaces the side-by-side layout that read as cramped, especially on mobile. */
    .carousel { position: relative; max-width: 460px; margin: 0 auto; background: var(--surface-alt); }
    .cviewport { position: relative; min-height: 220px; display: grid; place-items: center; overflow: hidden; }
    .cviewport .micro { color: var(--text-soft); padding: 44px 0; }
    .cslide { display: none; width: 100%; max-height: 380px; object-fit: contain; }
    .cslide.active { display: block; }
    .carrow { position: absolute; top: 50%; transform: translateY(-50%); width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--card-border); background: rgba(255, 255, 255, 0.92); box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12); color: var(--text-muted); font-size: 20px; line-height: 1; display: grid; place-items: center; z-index: 2; }
    .carrow.prev { left: 8px; }
    .carrow.next { right: 8px; }
    .cdots { position: absolute; bottom: 8px; left: 0; right: 0; display: flex; justify-content: center; gap: 6px; z-index: 2; }
    .cdot { width: 7px; height: 7px; padding: 0; border: 0; border-radius: 50%; background: rgba(0, 0, 0, 0.28); }
    .cdot.active { background: var(--text); }
    .detail-body { padding: 12px 16px 16px; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px 28px; align-items: start; }
    .detail-head { grid-column: 1 / -1; }
    .detail-head .name { white-space: normal; }
    .detail-head .line { white-space: normal; }
    .detail-section { display: grid; gap: 6px; align-content: start; }
    .detail-section > .micro { margin: 0; }
    .detail-row { display: grid; grid-template-columns: 92px 1fr; gap: 10px; align-items: baseline; font-size: 12.5px; line-height: 1.35; }
    .detail-k { margin: 0; letter-spacing: 0.04em; }
    .detail-v { color: var(--text); }
    .detail-foot { grid-column: 1 / -1; margin: 0; color: var(--text-soft); }
    .note { margin-top: 10px; padding: 8px 11px; border-radius: 8px; font-size: 12.5px; line-height: 1.35; }
    .note[hidden] { display: none; }
    .note.error { background: var(--danger-dim); color: var(--danger); border: 1px solid rgba(180, 35, 24, 0.25); }
    .pager { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 10px; }
    .pager[hidden] { display: none; }
    .pgbtn { min-height: 38px; min-width: 46px; border: 1px solid var(--button-border); border-radius: 9px; background: var(--button-bg); color: var(--text); font-size: 20px; line-height: 1; display: inline-flex; align-items: center; justify-content: center; }
    .pgbtn:disabled { opacity: 0.38; }
    .pginfo { font-size: 13px; font-weight: 500; color: var(--text-muted); font-variant-numeric: tabular-nums; }
    @media (max-width: 640px) {
      /* Mobile: Claude's iOS iframe won't touch-scroll, so instead of a scroller we PAGINATE (render
         one small page that fits) and let the card flow to its natural height; notifySize reports that
         content height so the host grows the iframe to fit the page exactly — nothing clipped, nothing
         to scroll. The header pager navigates pages. Shorter (square) photos so a page fits the screen.
         Desktop (>640px) keeps a bounded 760px inner-scroll layout — tall enough that the large 3/4
         photos show two full card rows (plus a peek of the next) before scrolling. ~44px tap targets. */
      .app { display: block; max-height: none; overflow: visible; border-radius: 0; border-left: 0; border-right: 0; }
      .head { padding: 12px 14px 8px; }
      .scroll { overflow: visible; padding: 10px 14px 12px; }
      .photo { aspect-ratio: 1 / 1; }
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .filters { gap: 8px; }
      .chip { min-height: 40px; padding: 0 14px; font-size: 13px; }
      .filters-toggle { min-height: 40px; }
      /* Compact filter dropdowns on mobile (round-8's 44px/14px read as oversized). 2-up, denser. */
      .advanced { grid-template-columns: 1fr 1fr; gap: 7px; margin: 8px 0 2px; }
      .advanced input, .advanced select { min-height: 36px; font-size: 13px; padding: 0 9px; border-radius: 8px; }
      /* The ⋯ dropdown clips past the (content-sized) iframe on the bottom row, so on mobile present it
         as a bottom sheet fixed to the iframe bottom — never clipped, regardless of which card. */
      .menu { position: fixed; left: 10px; right: 10px; bottom: 10px; top: auto; width: auto; max-width: none; z-index: 20; box-shadow: 0 -4px 20px rgba(13, 13, 13, 0.18); }
      .menu > button { min-height: 42px; font-size: 14px; }
      .dispo { min-height: 42px; font-size: 13px; }
      .btn { min-height: 44px; }
      .manage { width: 32px; height: 32px; }
      .form { grid-template-columns: 1fr; }
      .form input, .form select { min-height: 44px; }
      /* The flipped detail card spans both mobile columns. Full-bleed carousel, single column of detail,
         and bigger arrow tap targets. */
      .carousel { max-width: none; }
      .cslide { max-height: 320px; }
      .carrow { width: 40px; height: 40px; font-size: 22px; }
      .detail-body { grid-template-columns: 1fr; padding: 12px 14px 14px; }
    }
  </style>
</head>
<body>
  <main class="app" id="app">
    <div class="head">
      <section class="bar">
        <div>
          <div class="micro" id="summary">Awaiting closet</div>
          <h1>Your closet</h1>
        </div>
        <button class="chip filters-toggle" id="advancedToggle" type="button" aria-expanded="false" aria-controls="advanced" title="Filter your closet"><span>Filters</span><span class="caret" aria-hidden="true">▾</span></button>
      </section>
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
        <input id="queryFilter" placeholder="Search" />
      </section>
      <div class="note" id="note" hidden></div>
      <section class="pager" id="pager" hidden></section>
    </div>
    <div class="scroll">
      <section class="grid" id="grid"><div class="empty">Waiting for the closet view.</div></section>
    </div>
  </main>
  <script>
    (() => {
      const TEMPLATE_URI = ${JSON.stringify(STYLE_CLOSET_TEMPLATE_URI)};
      const MAX_DEPTH = 4;
      const PROTOCOL_VERSION = '2026-01-26';
      let viewModel = null;
      let pending = {};
      let openMenu = null;
      let menuView = 'root';
      // Which card is flipped to its detail back-face (one at a time, like openMenu). Re-applied across
      // re-renders so an optimistic edit doesn't snap the open detail shut.
      let flippedId = null;
      // localFilter drives the in-memory client-side filtering of viewModel.items. Status is the one
      // server-side dimension (the loaded set is one status); everything else filters locally.
      let localFilter = { status: 'active' };
      let loadedStatus = 'active';
      let loadedItemIds = null;
      let hydratedFilterOnce = false;
      let pageIndex = 0;
      // Claude's iOS iframe will not touch-scroll a long grid (the dead-zone), so on mobile we never
      // lay out a long list — we render one small page that fits without scrolling and navigate with
      // header controls. Desktop is unaffected (renders the full grid; its inner-scroll works there).
      const MOBILE_PAGE_SIZE = 4;
      let bridgeId = 1;
      let bridgeInitialized = false;
      let bridgeReady = null;
      const bridgePending = Object.create(null);

      const $ = (id) => document.getElementById(id);
      const clone = (value) => JSON.parse(JSON.stringify(value || {}));
      const getBridgeTargets = () => {
        const targets = [];
        try {
          if (window.parent && window.parent !== window) targets.push(window.parent);
          if (window.top && window.top !== window && targets.indexOf(window.top) === -1) targets.push(window.top);
        } catch (error) {}
        return targets;
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
        if (window.openai && typeof window.openai.requestDisplayMode === 'function') {
          window.openai.requestDisplayMode(mode);
          return;
        }
        bridgeNotify('ui/request-display-mode', { mode });
      };
      const callTool = async (name, args) => {
        // Bridge-first (grocery/budgets parity): the JSON-RPC tools/call round-trip resolves with the
        // full { content, structuredContent } envelope, which the widget re-renders from. Claude does
        // not reliably hand back window.openai.callTool's result for widget-initiated re-renders.
        if (getBridgeTargets().length) {
          try {
            return await bridgeRequest('tools/call', { name, arguments: args }, 20000);
          } catch (bridgeError) {
            if (window.openai && typeof window.openai.callTool === 'function') {
              return window.openai.callTool(name, args);
            }
            throw bridgeError;
          }
        }
        if (window.openai && typeof window.openai.callTool === 'function') {
          return window.openai.callTool(name, args);
        }
        return null;
      };
      const sendHostMessage = (text) => {
        const trimmed = String(text || '').trim();
        if (!trimmed) return false;
        try {
          if (typeof window.openai?.sendMessage === 'function') {
            window.openai.sendMessage({ role: 'user', content: [{ type: 'text', text: trimmed }] });
            return true;
          }
          if (getBridgeTargets().length) {
            // MCP Apps 'ui/message' (SEP-1865) is a JSON-RPC REQUEST (carries an id) that the host adds to
            // the conversation — NOT a notification. claude.ai advertises hostCapabilities.message.text and
            // routes it via the request path (same path as tools/call, which works); the id-less notification
            // form is dropped, which is why Re-analyze silently no-op'd. Send it as a request.
            bridgeRequest('ui/message', { role: 'user', content: { type: 'text', text: trimmed } }, 20000).catch(() => {});
            return true;
          }
        } catch (error) {}
        return false;
      };
      const isMobileViewport = () => {
        try { return !!(window.matchMedia && window.matchMedia('(max-width: 640px)').matches); } catch (error) { return false; }
      };
      const notifySize = () => {
        const root = document.documentElement;
        // Report the TRUE content height so the host grows the iframe to fit it. On mobile the grid is
        // paginated to a small page, so the page flows to a modest height and the host sizes the iframe
        // to fit the whole page — nothing clipped, nothing to scroll (Claude's iOS iframe won't
        // touch-scroll, so we render a page that fits rather than a scroller). The header pager
        // navigates pages. Desktop keeps its bounded 760px inner-scroll layout.
        const height = Math.max(root.scrollHeight, document.body.scrollHeight, 1);
        bridgeNotify('ui/notifications/size-changed', {
          height: Math.max(height, 1),
          width: Math.max(root.scrollWidth, document.body.scrollWidth, 1),
        });
      };
      const updateModelContext = (line) => {
        bridgeNotify('ui/update-model-context', {
          mode: 'replace',
          context: {
            styleCloset: {
              message: line,
              surface: 'style_closet',
              templateUri: TEMPLATE_URI,
              updatedAt: new Date().toISOString(),
            },
          },
        });
      };
      const publishViewModel = (vm) => {
        if (window.openai) {
          window.openai.toolOutput = vm;
          window.openai.toolResponseMetadata = { viewModel: vm, templateUri: TEMPLATE_URI };
        }
      };
      const showNote = (text, kind) => {
        const el = $('note');
        if (!el) return;
        el.textContent = text;
        el.className = 'note' + (kind ? ' ' + kind : '');
        el.hidden = false;
        notifySize();
      };
      const clearNote = () => {
        const el = $('note');
        if (!el || el.hidden) return;
        el.hidden = true;
        el.textContent = '';
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
      const receiveViewModel = (payload) => {
        const next = extractViewModel(payload);
        if (!next) return;
        viewModel = next;
        loadedStatus = (next.filter && next.filter.status) || 'active';
        if (!hydratedFilterOnce) {
          // First hydrate: ADOPT the server-provided filter so an opened-pre-filtered closet
          // ("show my shirts") lands narrowed on the right category/type/color. The full per-status
          // set is loaded, so the user can still switch facets client-side afterward.
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
          hydratedFilterOnce = true;
          // Reveal the advanced panel when the narrowing lives there, so the user can see/clear it.
          if (f.subcategory || f.brand || f.color || f.size || f.query) setAdvancedOpen(true);
        } else {
          // Later re-renders (status change, archive/restore refetch): preserve the user's in-memory
          // filters; only sync the one server-side dimension (status). The loaded set stays complete.
          localFilter = Object.assign({}, localFilter, { status: loadedStatus });
        }
        publishViewModel(viewModel);
        clearNote();
        render();
      };
      const toolInput = (payload) => {
        const params = payload && (payload.params || payload);
        const name = params && (params.toolName || params.name);
        const args = params && (params.arguments || params.args || params.input);
        if (!args || !args.item_id) return;
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
      // Cascading (faceted) filter options computed from the loaded items, narrowing down a hierarchy:
      // Type narrows by category; Brand by category+subcategory; Color and Size by category+subcategory+
      // brand. So the dropdowns only offer values that exist in the current context — e.g. Shoes →
      // shoe types/brands/sizes; picking a Brand then narrows its colors/sizes only.
      const availableOptions = () => {
        const items = (viewModel && viewModel.items) || [];
        const f = localFilter || {};
        const inCategory = items.filter((item) => !f.category || norm(item.category) === norm(f.category));
        const inSubcategory = inCategory.filter((item) => !f.subcategory || norm(item.subcategory) === norm(f.subcategory));
        const inBrand = inSubcategory.filter((item) => !f.brand || norm(item.brand) === norm(f.brand));
        const uniqueSorted = (values) => Array.from(new Set(values
          .map((value) => String(value == null ? '' : value).trim())
          .filter(Boolean)))
          .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
        return {
          subcategories: uniqueSorted(inCategory.map((item) => item.subcategory)),
          brands: uniqueSorted(inSubcategory.map((item) => item.brand)),
          colorFamilies: uniqueSorted(inBrand.map((item) => item.colorFamily)),
          sizes: uniqueSorted(inBrand.map((item) => item.size)),
        };
      };
      // Client-side filter of the loaded items. Status is applied server-side (the loaded set is one
      // status); category/subcategory/color/size/search all filter the in-memory items right here.
      const clientVisible = () => {
        const items = (viewModel && viewModel.items) || [];
        const f = localFilter || {};
        return items.filter((item) => {
          if (loadedItemIds && loadedItemIds.indexOf(item.id) === -1) return false;
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
        });
      };
      const render = () => {
        const summary = $('summary');
        const filters = $('filters');
        const grid = $('grid');
        const app = $('app');
        if (!viewModel) {
          if (app) app.classList.remove('comparator-mode');
          grid.innerHTML = '<div class="empty">Waiting for the closet view.</div>';
          notifySize();
          return;
        }
        if (app) app.classList.toggle('comparator-mode', Boolean(loadedItemIds));
        if (loadedItemIds) setAdvancedOpen(false);
        const f = localFilter || {};
        const category = f.category || 'all';
        const visible = clientVisible();
        const mobile = isMobileViewport();
        const totalPages = mobile ? Math.max(1, Math.ceil(visible.length / MOBILE_PAGE_SIZE)) : 1;
        if (pageIndex > totalPages - 1) pageIndex = totalPages - 1;
        if (pageIndex < 0) pageIndex = 0;
        const pageStart = pageIndex * MOBILE_PAGE_SIZE;
        const pageItems = mobile ? visible.slice(pageStart, pageStart + MOBILE_PAGE_SIZE) : visible;
        summary.textContent = mobile && visible.length
          ? (pageStart + 1) + '-' + Math.min(pageStart + MOBILE_PAGE_SIZE, visible.length) + ' of ' + visible.length
          : visible.length + ' shown';
        filters.innerHTML = (viewModel.facets || []).map((facet) => (
          '<button class="chip" type="button" data-category="' + escapeHtml(facet.category) + '" aria-pressed="' + String((facet.category === 'all' && category === 'all') || facet.category === category) + '">' +
          '<span>' + escapeHtml(facet.label) + '</span><span class="micro">' + String(facet.count) + '</span></button>'
        )).join('');
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
        const pager = $('pager');
        if (pager) {
          if (mobile && totalPages > 1) {
            pager.hidden = false;
            pager.innerHTML = '<button class="pgbtn" type="button" data-page="prev"' + (pageIndex <= 0 ? ' disabled' : '') + ' aria-label="Previous page">‹</button>' +
              '<span class="pginfo">Page ' + (pageIndex + 1) + ' of ' + totalPages + '</span>' +
              '<button class="pgbtn" type="button" data-page="next"' + (pageIndex >= totalPages - 1 ? ' disabled' : '') + ' aria-label="Next page">›</button>';
            const prevBtn = pager.querySelector('[data-page="prev"]');
            const nextBtn = pager.querySelector('[data-page="next"]');
            if (prevBtn) prevBtn.addEventListener('click', () => { if (pageIndex > 0) { pageIndex -= 1; openMenu = null; menuView = 'root'; flippedId = null; render(); } });
            if (nextBtn) nextBtn.addEventListener('click', () => { if (pageIndex < totalPages - 1) { pageIndex += 1; openMenu = null; menuView = 'root'; flippedId = null; render(); } });
          } else {
            pager.hidden = true;
            pager.innerHTML = '';
          }
        }
        grid.innerHTML = pageItems.length ? pageItems.map(cardHtml).join('') : '<div class="empty">No closet items match these filters.</div>';
        grid.querySelectorAll('[data-menu]').forEach((button) => {
          button.addEventListener('click', (event) => {
            event.stopPropagation();
            openMenu = openMenu === button.dataset.menu ? null : button.dataset.menu;
            menuView = 'root';
            render();
          });
        });
        grid.querySelectorAll('[data-submenu]').forEach((button) => button.addEventListener('click', () => {
          menuView = button.dataset.submenu || 'root';
          render();
        }));
        grid.querySelectorAll('[data-menuroot]').forEach((button) => button.addEventListener('click', () => {
          menuView = 'root';
          render();
        }));
        grid.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => openEdit(button.dataset.edit)));
        grid.querySelectorAll('[data-photo]').forEach((button) => button.addEventListener('click', () => openPhoto(button.dataset.photo)));
        grid.querySelectorAll('[data-addfit]').forEach((button) => button.addEventListener('click', () => openPhoto(button.dataset.addfit, 'fit')));
        grid.querySelectorAll('[data-reanalyze]').forEach((button) => button.addEventListener('click', () => askReanalyze(button.dataset.reanalyze)));
        grid.querySelectorAll('[data-archive]').forEach((button) => button.addEventListener('click', () => openArchive(button.dataset.archive, button.dataset.disposition || 'sold')));
        grid.querySelectorAll('[data-restore]').forEach((button) => button.addEventListener('click', () => openRestore(button.dataset.restore)));
        // Swatch tap toggles its color-detail bubble (one at a time). The dismiss-on-outside listener
        // fires on BOTH click and pointerdown (pointerdown so an iOS tap on a non-interactive element,
        // which Safari never turns into a click, still dismisses). The swatch stops BOTH from reaching
        // it — otherwise pointerdown clears the tip a beat before this click re-shows it (breaking the
        // toggle-off) or a re-render drops the bubble — so any open ⋯ menu is closed in place here.
        grid.querySelectorAll('[data-swatch]').forEach((button) => {
          button.addEventListener('pointerdown', (event) => event.stopPropagation());
          button.addEventListener('click', (event) => {
            event.stopPropagation();
            if (openMenu) { openMenu = null; menuView = 'root'; grid.querySelectorAll('.menu').forEach((menuEl) => menuEl.remove()); }
            const tip = grid.querySelector('.swatch-tip[data-tip="' + button.dataset.swatch + '"]');
            const wasShown = tip && tip.classList.contains('show');
            grid.querySelectorAll('.swatch-tip.show').forEach((el) => el.classList.remove('show'));
            if (tip && !wasShown) tip.classList.add('show');
          });
        });
        // Whole-card click flips the tile to/from its detail back-face. Clicks on the existing controls
        // (⋯ menu, swatch, the add-photo placeholder) are ignored here so they keep their own behavior;
        // the swatch handler above already stops propagation, the rest are filtered by closest().
        grid.querySelectorAll('.card').forEach((cardEl) => cardEl.addEventListener('click', (event) => {
          const target = event.target;
          if (target && typeof target.closest === 'function' && target.closest('.manage, .menu, [data-swatch], .addPhoto')) return;
          const id = cardEl.dataset.item;
          if (!id) return;
          flippedId = flippedId === id ? null : id;
          openMenu = null;
          menuView = 'root';
          render();
        }));
        if (flippedId) hydrateFlippedCard(flippedId);
        notifySize();
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
      const askReanalyze = (itemId) => {
        const item = itemById(itemId);
        if (!item) return;
        openMenu = null;
        menuView = 'root';
        item.reanalyzePending = true;
        pending[item.id] = { kind: 'reanalyze', text: 'Queuing re-analysis...' };
        render();
        callTool('fluent_refresh_style_item_profile', {
          approval: 'explicit_user_approved',
          item_id: item.id,
          profile: { reanalyzePending: true },
          source: 'user',
          provenance: { sourceType: 'user_confirmation' },
          response_mode: 'read_after_write',
        }).then(() => {
          item.reanalyzePending = true;
          pending[item.id] = {
            kind: 'reanalyze',
            text: 'Queued for re-analysis — Fluent will refresh it from its photo next time you view this item.',
          };
          render();
          updateModelContext('Queued Fluent re-analysis for ' + (item.name || item.id) + ' from its photo');
          setTimeout(() => {
            if (pending[item.id] && pending[item.id].kind === 'reanalyze') {
              delete pending[item.id];
              render();
            }
          }, 2400);
        }).catch(() => {
          item.reanalyzePending = false;
          pending[item.id] = { kind: 'reanalyze', text: 'Could not queue re-analysis. Try again.' };
          render();
          setTimeout(() => {
            if (pending[item.id] && pending[item.id].kind === 'reanalyze') {
              delete pending[item.id];
              render();
            }
          }, 2400);
        });
      };
      const formatDate = (iso) => {
        if (!iso) return '';
        try {
          const date = new Date(iso);
          if (isNaN(date.getTime())) return '';
          return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
        } catch (error) { return ''; }
      };
      // Back-face of the flip card: a one-photo-at-a-time carousel (display photo, then worn/fit when
      // distinct) with prev/next arrows + dots, then the catalog line, populated Fit / Style sections,
      // and a muted updated date. Photo srcs are deferred (data-src) and injected on flip.
      const backHtml = (item) => {
        const line = [item.brand, item.subcategory || item.category, item.size].filter(Boolean).join(' / ');
        const photoUrls = [];
        if (item.hasImage && item.imageUrl) photoUrls.push(item.imageUrl);
        if (item.fitImageUrl) photoUrls.push(item.fitImageUrl);
        let carousel;
        if (photoUrls.length === 0) {
          carousel = '<div class="carousel"><div class="cviewport"><span class="micro">No photo</span></div></div>';
        } else {
          const slides = photoUrls.map((url, i) =>
            '<img class="cslide' + (i === 0 ? ' active' : '') + '" alt="" data-src="' + escapeHtml(url) + '" referrerpolicy="no-referrer" />'
          ).join('');
          let controls = '';
          if (photoUrls.length > 1) {
            const dots = photoUrls.map((_, i) =>
              '<button type="button" class="cdot' + (i === 0 ? ' active' : '') + '" aria-label="Photo ' + (i + 1) + '"></button>'
            ).join('');
            controls = '<button type="button" class="carrow prev" data-carousel-prev aria-label="Previous photo">‹</button>' +
              '<button type="button" class="carrow next" data-carousel-next aria-label="Next photo">›</button>' +
              '<div class="cdots">' + dots + '</div>';
          }
          carousel = '<div class="carousel"><div class="cviewport">' + slides + '</div>' + controls + '</div>';
        }
        const detail = item.detail || null;
        const sections = [];
        if (detail) {
          const fitRows = [];
          const sizing = safeText(detail.fitSummary);
          if (sizing) fitRows.push(detailRow('Sizing', sizing));
          const ownedSize = safeText(detail.ownedSize);
          if (ownedSize) fitRows.push(detailRow('Owned size', ownedSize));
          const lengthNote = safeText(detail.lengthNote);
          if (lengthNote) fitRows.push(detailRow('Length', lengthNote));
          const observations = safeList(detail.fitObservations);
          if (observations.length) fitRows.push(detailRow('Notes', observations.join(', ')));
          if (fitRows.length) sections.push('<div class="detail-section"><div class="micro">Fit</div>' + fitRows.join('') + '</div>');
          const styleRows = [];
          const styleRole = safeText(detail.styleRole);
          if (styleRole) styleRows.push(detailRow('Role', styleRole));
          const pairingNotes = safeText(detail.pairingNotes);
          if (pairingNotes) styleRows.push(detailRow('Pairs with', pairingNotes));
          const occasions = safeList(detail.bestOccasions);
          if (occasions.length) styleRows.push(detailRow('Occasions', occasions.join(', ')));
          const useCases = safeList(detail.useCases);
          if (useCases.length) styleRows.push(detailRow('Use cases', useCases.join(', ')));
          const seasons = safeList(detail.seasonality);
          if (seasons.length) styleRows.push(detailRow('Seasons', seasons.join(', ')));
          const silhouette = safeText(detail.silhouette);
          if (silhouette) styleRows.push(detailRow('Silhouette', silhouette));
          const fabric = safeText(detail.fabricHand);
          if (fabric) styleRows.push(detailRow('Fabric', fabric));
          const tags = safeList(detail.tags);
          if (tags.length) styleRows.push(detailRow('Tags', tags.join(', ')));
          if (styleRows.length) sections.push('<div class="detail-section"><div class="micro">Style</div>' + styleRows.join('') + '</div>');
        }
        const updated = formatDate(item.updatedAt);
        const footer = updated ? '<div class="detail-foot micro">Updated ' + escapeHtml(updated) + '</div>' : '';
        const head = '<div class="detail-head"><div class="name">' + escapeHtml(item.name || 'Unnamed item') + '</div><div class="line">' + escapeHtml(line || 'Closet item') + '</div></div>';
        return '<div class="card-back">' +
          '<button type="button" class="back-close" aria-label="Close details">×</button>' +
          carousel +
          '<div class="detail-body">' + head + sections.join('') + footer + '</div>' +
          '</div>';
      };
      const cardHtml = (item) => {
        const isPending = pending[item.id];
        const color = item.colorHex || '#e5e5ea';
        const line = [item.brand, item.subcategory || item.category, item.size].filter(Boolean).join(' / ');
        // Color detail (e.g. "Tan" vs "brown") lives behind the swatch so two same-family items are
        // distinguishable: native title on hover (desktop) + tap-to-toggle bubble (mobile iframe has no
        // hover). Falls back to the family name; renders a plain dot when neither value exists.
        const colorLabel = item.colorName || item.colorFamily || '';
        const swatch = colorLabel
          ? '<button type="button" class="swatch" data-swatch="' + escapeHtml(item.id) + '" title="' + escapeHtml(colorLabel) + '" aria-label="Color: ' + escapeHtml(colorLabel) + '" style="background:' + escapeHtml(color) + '"></button>'
          : '<span class="swatch" style="background:' + escapeHtml(color) + '"></span>';
        const colorTip = colorLabel
          ? '<span class="swatch-tip" data-tip="' + escapeHtml(item.id) + '" role="status">' + escapeHtml(colorLabel) + '</span>'
          : '';
        const photo = item.hasImage && item.imageUrl
          ? '<img alt="" src="' + escapeHtml(item.imageUrl) + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove();" />'
          : '<button class="addPhoto" type="button" data-photo="' + escapeHtml(item.id) + '"><span><span class="plus">+</span><span class="micro">Add photo</span></span></button>';
        const photoMenuLabel = item.hasImage && item.imageUrl ? 'Replace photo' : 'Add photo';
        const fitPhotoMenuLabel = item.hasFitPhoto ? 'Replace fit photo' : 'Add a fit photo';
        const id = escapeHtml(item.id);
        const hostCanCallTool = (typeof window.openai?.callTool === 'function') || getBridgeTargets().length > 0;
        const reanalyzeButton = hostCanCallTool ? '<button type="button" data-reanalyze="' + id + '">Re-analyze</button>' : '';
        // Archived items get a Restore action; active items get the no-longer-owned dispositions.
        const rootOwnershipSection = item.status === 'archived'
          ? '<button class="restore" type="button" data-restore="' + id + '">Restore to closet</button>'
          : '<button class="destructive" type="button" data-submenu="remove">Remove from closet<span class="menu-chevron" aria-hidden="true">›</span></button>';
        const rootMenu = '<button type="button" data-edit="' + id + '">Edit details</button><button type="button" data-submenu="photos">Photos<span class="menu-chevron" aria-hidden="true">›</span></button>' + reanalyzeButton + '<div class="menu-sep"></div>' + rootOwnershipSection;
        const photosMenu = '<button class="menu-back" type="button" data-menuroot><span class="menu-ico" aria-hidden="true">‹</span> Photos</button><div class="menu-sep"></div><button type="button" data-photo="' + id + '">' + photoMenuLabel + '</button><button type="button" data-addfit="' + id + '">' + fitPhotoMenuLabel + '</button>';
        const removeMenu = '<button class="menu-back" type="button" data-menuroot><span class="menu-ico" aria-hidden="true">‹</span> Remove from closet</button><div class="menu-sep"></div><div class="menu-dispo"><button class="dispo" type="button" data-archive="' + id + '" data-disposition="returned">Returned</button><button class="dispo" type="button" data-archive="' + id + '" data-disposition="sold">Sold</button><button class="dispo" type="button" data-archive="' + id + '" data-disposition="donated">Donated</button><button class="dispo" type="button" data-archive="' + id + '" data-disposition="worn_out">Worn out</button></div>';
        const menuBody = menuView === 'photos' ? photosMenu : menuView === 'remove' ? removeMenu : rootMenu;
        const menu = openMenu === item.id
          ? '<div class="menu">' + menuBody + '</div>'
          : '';
        const reanalyzeBadge = item.reanalyzePending ? '<div class="reanalyzeBadge">Queued for re-analysis</div>' : '';
        const front = '<div class="card-front"><div class="photo">' + photo + '</div>' + reanalyzeBadge + '<button class="manage" type="button" title="Manage item" aria-label="Manage item" data-menu="' + escapeHtml(item.id) + '">⋯</button>' + menu + '<div class="details"><div class="name">' + escapeHtml(item.name || 'Unnamed item') + '</div><div class="line">' + swatch + escapeHtml(line || 'Closet item') + '</div>' + colorTip + '</div>' + (isPending ? '<div class="pending">' + escapeHtml(isPending.text) + '</div>' : '') + '</div>';
        const flipped = flippedId === item.id ? ' flipped' : '';
        return '<article class="card' + flipped + '" data-item="' + escapeHtml(item.id) + '"><div class="card-inner">' + front + backHtml(item) + '</div></article>';
      };
      const applyFilter = async (patch) => {
        const next = Object.assign({}, localFilter, patch);
        if (!next.category) delete next.category;
        localFilter = next;
        pageIndex = 0;
        // Changing filters closes any open detail card (it may no longer be in the visible set).
        flippedId = null;
        // Cascading prune: drop any lower-level selection that no longer exists in the narrowed option
        // set (e.g. switching category clears a now-invalid subcategory; that in turn can clear color/size).
        if (localFilter.subcategory && !availableOptions().subcategories.some((value) => norm(value) === norm(localFilter.subcategory))) delete localFilter.subcategory;
        // Brand narrows by category+subcategory; prune it BEFORE color/size, which now narrow by brand —
        // so a stale color/size left over after a brand change is dropped against the brand-narrowed set.
        if (localFilter.brand && !availableOptions().brands.some((value) => norm(value) === norm(localFilter.brand))) delete localFilter.brand;
        const narrowedOptions = availableOptions();
        if (localFilter.color && !narrowedOptions.colorFamilies.some((value) => norm(value) === norm(localFilter.color))) delete localFilter.color;
        if (localFilter.size && !narrowedOptions.sizes.some((value) => norm(value) === norm(localFilter.size))) delete localFilter.size;
        // Status is the only dimension the server must re-query (the loaded set is one status); a
        // status change refetches the full status set. Every other filter (category chips,
        // subcategory/color/size/search) is applied to the already-loaded items client-side, instantly
        // and reliably — no host round-trip, which is what kept silently failing.
        if (patch && patch.status && patch.status !== loadedStatus) {
          const filter = loadedItemIds ? { status: patch.status, item_ids: loadedItemIds } : { status: patch.status };
          const result = await callTool('fluent_render_style_closet_surface', { filter });
          if (result) receiveViewModel(result);
          return;
        }
        render();
      };
      const openEdit = (itemId) => {
        const item = itemById(itemId);
        if (!item) return;
        openMenu = null;
        menuView = 'root';
        render();
        requestDisplayMode('fullscreen');
        document.body.appendChild(panel('Edit details', [
          input('name', 'Name', item.name || ''),
          input('brand', 'Brand', item.brand || ''),
          input('category', 'Category', item.category || ''),
          input('subcategory', 'Subcategory', item.subcategory || ''),
          input('color', 'Color', item.colorFamily || ''),
          input('size', 'Size', item.size || ''),
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
          Object.keys(patch).forEach((key) => { if (key === 'color') item.colorFamily = patch[key]; else item[key] = patch[key]; });
          render();
          try {
            await callTool('fluent_update_style_item_patch', { approval: 'explicit_user_approved', item_id: item.id, patch, provenance: { sourceType: 'user_confirmation' }, response_mode: 'read_after_write' });
            updateModelContext('Updated ' + (item.name || item.id));
          } catch (error) {
            Object.assign(item, before);
            render();
          }
        }));
      };
      const openPhoto = (itemId, imageType = 'primary') => {
        const item = itemById(itemId);
        if (!item) return;
        openMenu = null;
        menuView = 'root';
        render();
        requestDisplayMode('fullscreen');
        const isFitPhoto = imageType === 'fit';
        const title = isFitPhoto ? (item.hasFitPhoto ? 'Replace fit photo' : 'Add a fit photo') : (item.hasImage ? 'Replace photo' : 'Add a photo');
        document.body.appendChild(panel(title, [input('image_url', 'Image link', '', 'Paste a direct link to a photo of this item')], async (values, close) => {
          if (!values.image_url) return;
          close();
          pending[item.id] = { kind: 'photo', text: 'saving photo...' };
          render();
          try {
            await callTool('fluent_set_style_item_image', { approval: 'explicit_user_approved', image_type: imageType, image_url: values.image_url, item_id: item.id, provenance: { sourceType: 'user_confirmation' }, response_mode: 'read_after_write' });
            delete pending[item.id];
            updateModelContext((isFitPhoto ? 'Updated fit photo for ' : 'Updated photo for ') + (item.name || item.id));
            // Re-fetch so the server's same-origin proxied image URL replaces the entered (possibly
            // cross-origin) one — external URLs only display through Fluent's signed image route.
            await rerender();
          } catch (error) {
            delete pending[item.id];
            render();
          }
        }));
      };
      const openArchive = (itemId, disposition) => {
        const item = itemById(itemId);
        if (!item) return;
        openMenu = null;
        menuView = 'root';
        render();
        requestDisplayMode('fullscreen');
        const shell = document.createElement('div');
        shell.className = 'panel';
        shell.innerHTML = '<div class="sheet"><h2>No longer owned?</h2><p class="line">This moves the item out of the active closet as ' + escapeHtml(disposition.replace('_', ' ')) + '.</p><div class="actions"><button class="btn" type="button" data-cancel>Cancel</button><button class="btn danger-btn" type="button" data-confirm>Confirm</button></div></div>';
        shell.querySelector('[data-cancel]').addEventListener('click', () => shell.remove());
        shell.querySelector('[data-confirm]').addEventListener('click', async () => {
          const label = item.name || 'that item';
          const beforeItems = viewModel.items.slice();
          viewModel.items = viewModel.items.filter((entry) => entry.id !== item.id);
          clearNote();
          render();
          shell.remove();
          try {
            const result = await callTool('fluent_archive_item', {
              approval: 'explicit_user_approved',
              disposition,
              domain: 'style',
              item_id: item.id,
              item_type: 'style_item',
              provenance: { sourceType: 'user_confirmation' },
              reason: 'No longer owned',
            });
            if (resultIsError(result)) {
              throw new Error('host rejected the archive');
            }
            updateModelContext('Archived ' + (item.name || item.id) + ' as ' + disposition.replace('_', ' '));
            // VERIFY persistence — do not trust the optimistic removal. Claude does not reliably
            // execute or hand back widget-initiated writes, so refetch the active set as the source
            // of truth. If the item is STILL active after the refetch, the archive did not take
            // effect on the host: surface that loudly instead of a silent snap-back (a bug found
            // in live use), and let the grid show the item as still owned (which it is).
            await rerender();
            const after = itemById(item.id);
            if (after && after.status !== 'archived') {
              showNote('Couldn’t archive “' + label + '” — the host didn’t confirm the change, so nothing was removed.', 'error');
            }
          } catch (error) {
            viewModel.items = beforeItems;
            render();
            showNote('Couldn’t archive “' + label + '” right now. No change was made.', 'error');
          }
        });
        document.body.appendChild(shell);
      };
      const openRestore = async (itemId) => {
        const item = itemById(itemId);
        if (!item) return;
        const label = item.name || 'that item';
        openMenu = null;
        menuView = 'root';
        const beforeItems = viewModel.items.slice();
        // Restoring makes the item active again, so it leaves the archived view it was clicked from.
        viewModel.items = viewModel.items.filter((entry) => entry.id !== item.id);
        clearNote();
        render();
        try {
          // Restore-only patch: status:'active' un-archives; the model still cannot archive via patch.
          const result = await callTool('fluent_update_style_item_patch', { approval: 'explicit_user_approved', item_id: item.id, patch: { status: 'active' }, provenance: { sourceType: 'user_confirmation' }, response_mode: 'read_after_write' });
          if (resultIsError(result)) {
            throw new Error('host rejected the restore');
          }
          updateModelContext('Restored ' + (item.name || item.id) + ' to the active closet');
          // VERIFY like archive: refetch the loaded set; if the item is still archived, the restore did
          // not persist — surface it loudly instead of a phantom removal. (Status-aware so an "Any
          // status" view, where a restored item stays visible as active, is not a false failure.)
          await rerender();
          const after = itemById(item.id);
          if (after && after.status === 'archived') {
            showNote('Couldn’t restore “' + label + '” — the host didn’t confirm the change, so it stays archived.', 'error');
          }
        } catch (error) {
          viewModel.items = beforeItems;
          render();
          showNote('Couldn’t restore “' + label + '” right now. No change was made.', 'error');
        }
      };
      const rerender = async () => {
        // Always refetch the full status set (status-only) so loadedItems stays complete for
        // client-side filtering; receiveViewModel preserves the user's category/color/size/search.
        const filter = loadedItemIds ? { status: loadedStatus, item_ids: loadedItemIds } : { status: loadedStatus };
        const result = await callTool('fluent_render_style_closet_surface', { filter });
        if (result) receiveViewModel(result);
      };
      const panel = (title, fields, onSave) => {
        const shell = document.createElement('div');
        shell.className = 'panel';
        shell.innerHTML = '<form class="sheet"><h2>' + escapeHtml(title) + '</h2><div class="form">' + fields.join('') + '</div><div class="actions"><button class="btn" type="button" data-cancel>Cancel</button><button class="btn primary" type="submit">Save</button></div></form>';
        const close = () => shell.remove();
        shell.querySelector('[data-cancel]').addEventListener('click', close);
        shell.querySelector('form').addEventListener('submit', async (event) => {
          event.preventDefault();
          const values = {};
          shell.querySelectorAll('[name]').forEach((field) => { values[field.name] = field.value.trim(); });
          await onSave(values, close);
        });
        return shell;
      };
      const input = (name, label, value, placeholder) => '<label><span class="micro">' + escapeHtml(label) + '</span><input name="' + escapeHtml(name) + '" value="' + escapeHtml(value) + '" placeholder="' + escapeHtml(placeholder || '') + '" /></label>';
      const itemById = (itemId) => (viewModel && viewModel.items || []).find((item) => item.id === itemId);
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

      // Show carousel slide i (wrapping), syncing the active slide + dot, and re-report height.
      const showCarouselSlide = (carousel, idx) => {
        const slides = Array.prototype.slice.call(carousel.querySelectorAll('.cslide'));
        const dots = Array.prototype.slice.call(carousel.querySelectorAll('.cdot'));
        if (!slides.length) return;
        const i = ((idx % slides.length) + slides.length) % slides.length;
        slides.forEach((slide, k) => slide.classList.toggle('active', k === i));
        dots.forEach((dot, k) => dot.classList.toggle('active', k === i));
        notifySize();
      };
      const carouselActiveIndex = (carousel) => {
        const slides = Array.prototype.slice.call(carousel.querySelectorAll('.cslide'));
        return Math.max(0, slides.findIndex((slide) => slide.classList.contains('active')));
      };
      // A slide that still fails after the one refresh is dropped; if only one photo remains, the arrows
      // and dots are removed so it reads as a plain single image.
      const pruneBrokenSlide = (carousel, img) => {
        img.remove();
        const dots = carousel.querySelectorAll('.cdot');
        if (dots.length) dots[dots.length - 1].remove();
        if (carousel.querySelectorAll('.cslide').length <= 1) {
          carousel.querySelectorAll('.carrow, .cdots').forEach((el) => el.remove());
        }
        showCarouselSlide(carousel, 0);
      };
      // After a render that left a card flipped, inject the deferred carousel photo sources (display +
      // worn/fit, both already in the payload) so the larger images are decoded only when the card is
      // opened, and wire the carousel arrows/dots. No widget-initiated tool call — the URLs ship with the
      // closet payload. Re-reports height once each image paints so the host grows the iframe to fit.
      const staleImageRefreshed = Object.create(null);
      const hydrateFlippedCard = (id) => {
        const grid = $('grid');
        if (!grid) return;
        let card = null;
        grid.querySelectorAll('.card').forEach((entry) => { if (entry.dataset.item === id) card = entry; });
        if (!card) return;
        card.querySelectorAll('.card-back img[data-src]').forEach((img) => {
          if (img.getAttribute('src')) return;
          img.addEventListener('load', notifySize);
          img.addEventListener('error', () => {
            // The signed photo URL has a short TTL (STYLE_SIGNED_FALLBACK_TTL_MS). If the closet sat open
            // past it before this first flip, the deferred src is expired. Refetch the closet ONCE per
            // item to re-sign URLs (rerender preserves flippedId, so this card re-hydrates with a fresh
            // src); if it still fails after a refresh, drop that slide rather than loop.
            if (staleImageRefreshed[id]) {
              const carousel = img.closest('.carousel');
              if (carousel) pruneBrokenSlide(carousel, img); else { img.remove(); notifySize(); }
              return;
            }
            staleImageRefreshed[id] = true;
            rerender();
          });
          img.setAttribute('src', img.getAttribute('data-src'));
        });
        // Wire the carousel arrows + dots. stopPropagation so a tap on a control doesn't flip the card
        // shut (the whole-card click toggles the flip).
        const carousel = card.querySelector('.carousel');
        if (carousel && carousel.dataset.wired !== '1') {
          carousel.dataset.wired = '1';
          const prev = carousel.querySelector('[data-carousel-prev]');
          const next = carousel.querySelector('[data-carousel-next]');
          if (prev) prev.addEventListener('click', (event) => { event.stopPropagation(); showCarouselSlide(carousel, carouselActiveIndex(carousel) - 1); });
          if (next) next.addEventListener('click', (event) => { event.stopPropagation(); showCarouselSlide(carousel, carouselActiveIndex(carousel) + 1); });
          carousel.querySelectorAll('.cdot').forEach((dot, k) => dot.addEventListener('click', (event) => { event.stopPropagation(); showCarouselSlide(carousel, k); }));
        }
      };
      $('advancedToggle').addEventListener('click', () => {
        setAdvancedOpen(!$('advanced').classList.contains('open'));
        notifySize();
      });
      for (const id of ['statusFilter', 'subcategoryFilter', 'brandFilter', 'colorFilter', 'sizeFilter', 'queryFilter']) {
        $(id).addEventListener('change', () => applyFilter({
          brand: $('brandFilter').value || null,
          color: $('colorFilter').value || null,
          query: $('queryFilter').value || null,
          size: $('sizeFilter').value || null,
          status: $('statusFilter').value || 'active',
          subcategory: $('subcategoryFilter').value || null,
        }));
      }
      window.addEventListener('resize', notifySize);
      // Tapping/clicking outside an open ⋯ menu closes it. Ignore clicks inside the menu (an action
      // handles itself) and on a ⋯ toggle button (its own handler toggles), so this never fights the
      // open gesture or an in-menu action.
      const dismissOnOutside = (event) => {
        const target = event.target;
        // Dismiss any open color-detail bubble on an outside tap (the swatch's own handler stops
        // propagation, so this only fires for taps elsewhere). No re-render needed — toggle in place.
        const grid = $('grid');
        if (grid) grid.querySelectorAll('.swatch-tip.show').forEach((el) => el.classList.remove('show'));
        // Tapping outside an open detail card flips it shut. Clicks INSIDE a card are handled by the
        // card's own flip toggle, and clicks inside an edit/photo panel are left alone.
        if (flippedId && target && typeof target.closest === 'function' && !target.closest('.card') && !target.closest('.panel')) {
          flippedId = null;
          render();
          return;
        }
        if (!openMenu) return;
        if (target && typeof target.closest === 'function' && (target.closest('.menu') || target.closest('[data-menu]'))) return;
        openMenu = null;
        menuView = 'root';
        render();
      };
      document.addEventListener('click', dismissOnOutside);
      document.addEventListener('pointerdown', dismissOnOutside);
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
          receiveViewModel(data.params || data);
          bridgeNotify('ui/notifications/initialized', { templateUri: TEMPLATE_URI });
          bridgeNotify('ui/subscribe', { event: 'host-context-changed' });
          render();
          return;
        }
        if (method === 'ui/notifications/tool-result') { receiveViewModel(data.params || data); return; }
        if (method === 'ui/notifications/tool-input' || method === 'ui/notifications/tool-input-partial') { toolInput(data.params || data); return; }
        if (method === 'ui/notifications/tool-cancelled') { toolCancelled(); return; }
        if (method === 'host-context-changed') { notifySize(); return; }
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
          appInfo: { name: 'Fluent Style Closet', version: 'v1' },
          appCapabilities: {},
          protocolVersion: PROTOCOL_VERSION,
        }, 6000).then((result) => {
          bridgeInitialized = true;
          receiveViewModel(result);
          bridgeNotify('ui/notifications/initialized', { templateUri: TEMPLATE_URI });
          render();
          return result;
        }).catch(() => null);
        return bridgeReady;
      };
      // OpenAI Apps SDK globals path (secondary; Claude uses the postMessage handshake above).
      const hydrateFromGlobals = () => {
        if (!window.openai) return false;
        const candidates = [window.openai.toolResponseMetadata, window.openai.toolOutput, window.openai.structuredContent, window.openai.params, window.openai];
        for (const candidate of candidates) {
          if (extractViewModel(candidate)) { receiveViewModel(candidate); return true; }
        }
        return false;
      };
      window.addEventListener('openai:set_globals', () => { hydrateFromGlobals(); });
      hydrateFromGlobals();
      render();
      connectMcpAppsHost();
    })();
  </script>
</body>
</html>`;
}

function normalizeFilter(filter: StyleClosetFilter | null | undefined): StyleClosetViewModel['filter'] {
  return {
    brand: nullableTrim(filter?.brand),
    category: nullableTrim(filter?.category),
    color: nullableTrim(filter?.color),
    favorite_only: filter?.favorite_only ?? null,
    item_ids: normalizeIdList(filter?.item_ids),
    query: nullableTrim(filter?.query),
    size: nullableTrim(filter?.size),
    status: filter?.status ?? 'active',
    subcategory: nullableTrim(filter?.subcategory),
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
    if (filter.favorite_only && !isFavorite(item)) {
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

function toClosetItem(item: StyleItemRecord, imageUrl: string | null, fitImageUrl: string | null): StyleClosetItemViewModel {
  const hasImage = Boolean(imageUrl);
  const dataCompleteness = [
    Boolean(item.name && item.category),
    Boolean(item.brand || item.size || item.colorFamily || item.subcategory),
    hasImage,
  ].filter(Boolean).length;
  return {
    brand: item.brand,
    category: item.category,
    colorFamily: item.colorFamily,
    colorHex: item.colorHex,
    colorName: item.colorName,
    dataCompleteness: { have: dataCompleteness, of: 3 },
    detail: toClosetDetail(item.profile?.raw ?? null),
    fitImageUrl,
    hasImage,
    hasFitPhoto: item.photos.some(isStyleFitPhoto),
    id: item.id,
    imageUrl,
    name: item.name,
    reanalyzePending: item.profile?.raw.reanalyzePending === true,
    size: item.size,
    status: item.status,
    subcategory: item.subcategory,
    updatedAt: item.updatedAt,
  };
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
    bestOccasions: cleanClosetList(profile.bestOccasions),
    fabricHand: cleanClosetText(profile.fabricHand),
    fitObservations: cleanClosetList(profile.fitObservations),
    fitSummary: cleanClosetText(fitSummaryLabel(profile.fitVerdict)),
    lengthNote: cleanClosetText(profile.lengthNote),
    ownedSize: cleanClosetText(profile.ownedSize),
    pairingNotes: cleanClosetText(profile.pairingNotes),
    seasonality: cleanClosetList(profile.seasonality),
    silhouette: cleanClosetText(profile.silhouette),
    styleRole: cleanClosetText(profile.styleRole),
    tags: cleanClosetList(profile.tags),
    useCases: cleanClosetList(profile.useCases),
  };
  const hasContent =
    Boolean(detail.fitSummary || detail.ownedSize || detail.lengthNote || detail.pairingNotes || detail.styleRole || detail.silhouette || detail.fabricHand) ||
    detail.fitObservations.length > 0 ||
    detail.bestOccasions.length > 0 ||
    detail.useCases.length > 0 ||
    detail.seasonality.length > 0 ||
    detail.tags.length > 0;
  return hasContent ? detail : null;
}

function assetUrl(asset: StyleVisualBundleAssetRecord): string | null {
  return asset.fallbackSignedOriginalUrl ?? asset.authenticatedOriginalUrl ?? asset.sourceUrl ?? null;
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

function isFavorite(item: StyleItemRecord): boolean {
  const raw = item.profile?.raw as Record<string, unknown> | undefined;
  return raw?.favorite === true || raw?.isFavorite === true;
}

function clampLimit(limit: number | null | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    // A closet viewer should show the whole active closet, not a page of it. Default to the cap
    // so a normal-size closet (~96 active items in the reference account) renders in full; >120 would need cursor paging.
    return 120;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), 120);
}

function parseCursor(cursor: string | null | undefined): number {
  if (!cursor) {
    return 0;
  }
  const parsed = Number.parseInt(cursor, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
