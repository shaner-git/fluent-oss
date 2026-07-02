import {
  extractStylePurchasePageEvidence,
  isLikelyNonProductImage,
  normalizePublicProductUrl,
  type StylePurchasePageImageEvidence,
} from '../../mcp-style';

export type ProductDisplayImageRole = 'packshot' | 'on_model' | 'unknown';

export type ProductDisplayImageCandidate = {
  alt: string | null;
  isProductGallery?: boolean;
  productGalleryOrdinal?: number | null;
  role: ProductDisplayImageRole;
  score: number;
  source: string;
  url: string;
};

export type ProductDisplayImageResolution = {
  candidates: ProductDisplayImageCandidate[];
  confidence: 'high' | 'low';
  recommendedFitUrl: string | null;
  recommendedPrimaryUrl: string | null;
  warnings: string[];
};

type CandidateAccumulator = StylePurchasePageImageEvidence & {
  jsonLd: boolean;
};

const ON_MODEL_RE = /\b(model|worn|on[-_ ]?figure|onbody|on[-_ ]?body|on[-_ ]?model|lifestyle|look|outfit|editorial|campaign|hero)\b/i;
// Only treat an explicit `model` path token as on-model. A bare `on` token is too aggressive — it
// misclassifies brands/products like "On Running" (/shop/on/...) as on-model.
const ON_MODEL_TOKEN_RE = /(^|[\/_-])(model)($|[\/_.-])/i;
const PACKSHOT_RE = /\b(flat|laydown|lay[-_ ]?down|still|product|packshot|pack[-_ ]?shot|ghost|off[-_ ]?figure)\b/i;
const PACKSHOT_TOKEN_RE = /(^|[\/_-])(off|flat|1)($|[\/_.-])/i;
const PRODUCT_GALLERY_ORDINAL_RE = /\bimage\s*(?:number|#)?\s*(\d+)\s*(?:showing|of\b)/i;
const PRODUCT_GALLERY_VIEW_RE = /\bview\s*(\d+)\b/i;

export async function resolveProductDisplayImage(input: {
  fetchImpl?: typeof fetch;
  hostImageUrl?: string | null;
  productUrl: string;
}): Promise<ProductDisplayImageResolution> {
  const warnings: string[] = [];
  try {
    const evidence = await extractStylePurchasePageEvidence({
      // Retailers (e.g. Gap) serve degraded bot markup that omits the real gallery/packshot; the closet-add
      // resolver needs the full browser gallery so the packshot is actually enumerated and shown to the model.
      browserUserAgent: true,
      fetchImpl: input.fetchImpl,
      includeRawHtml: true,
      maxImages: 8,
      productUrl: input.productUrl,
    });
    warnings.push(...evidence.warnings);
    if (evidence.status !== 'image_references_extracted' && evidence.status !== 'no_images_found') {
      return emptyResolution(warnings);
    }

    const finalUrl = evidence.extraction.finalUrl ?? input.productUrl;
    const pageTitle = evidence.extraction.pageTitle;
    let jsonLdImages: StylePurchasePageImageEvidence[] = [];
    try {
      jsonLdImages = parseJsonLdProductImages(evidence.extraction.rawHtml ?? '', finalUrl);
    } catch (error) {
      warnings.push(`Could not parse JSON-LD product images: ${errorMessage(error)}`);
    }
    let galleryImages: StylePurchasePageImageEvidence[] = [];
    try {
      galleryImages = parseProductGalleryImages(evidence.extraction.rawHtml ?? '', finalUrl);
    } catch (error) {
      warnings.push(`Could not parse product gallery images: ${errorMessage(error)}`);
    }

    const candidates = buildDisplayCandidates({
      extractedCandidates: evidence.extraction.imageCandidates,
      galleryImages,
      jsonLdImages,
      pageTitle,
      pageUrl: finalUrl,
      productUrl: input.productUrl,
    });

    // Never let the og:image (the social/hero image — the demonstrated on-model failure) be the tile,
    // even when it is the only non-on_model candidate. The host-passed image is untrusted here too.
    const primary = candidates.find((candidate) => candidate.role !== 'on_model' && !candidate.source.includes('og:image')) ?? null;
    const fit =
      candidates.find((candidate) => candidate.role === 'on_model')?.url
      ?? classifyHostFitHint(input.hostImageUrl).url
      ?? null;
    const confidence = hasHighConfidenceDefault(primary) ? 'high' : 'low';

    return {
      candidates,
      confidence,
      recommendedFitUrl: fit,
      // Set a best-guess (non-hero) primary even on LOW confidence so the create handler hands the model
      // the gallery as inline images to confirm/correct with its own vision. confidence only tunes wording.
      recommendedPrimaryUrl: primary ? primary.url : null,
      warnings,
    };
  } catch (error) {
    return emptyResolution([`Could not resolve product display image: ${errorMessage(error)}`]);
  }
}

const PROMO_CUE_RES = [
  /\b\d{1,3}\s*%\s*off\b/i,
  /\bcardmember/i,
  /\bcoupon\b/i,
  /\bpromo(?:tion|code)?\b/i,
  /\bcode\s+[a-z0-9]{3,}\b/i,
  /\bends\s+\d/i,
  /\bexclusions?\s+apply\b/i,
  /\bapply\s+now\b/i,
  /\bsitewide\b/i,
  /\bgift\s*card\b/i,
  /\bfree\s+shipping\b/i,
];

// Product DISPLAY photos are raster (jpg/png/webp/avif/gif), never SVG; SVGs on a retailer CDN are
// logos/icons/promo banners. Also drop obvious sitewide promo/offer banners. This is a resolver-local guard
// (the shared isLikelyNonProductImage does not catch these) so a promo banner can never be enumerated as a
// gallery candidate, scored, or set as the display tile.
// Precision over recall: SVG is keyed on the URL extension; promo wording is matched on ALT text ONLY (not
// the URL, so a `/promo/` path doesn't drop a real photo) and requires >=2 distinct cues (so one innocent
// word like a product literally named "Code Red" or "10% recycled" never drops a legitimate packshot).
function isLikelyPromoOrNonDisplayImage(entry: { alt: string | null; source: string; url: string }): boolean {
  if (/\.svg(?:$|\?|#|$)/.test(urlPath(entry.url))) {
    return true;
  }
  const alt = (entry.alt ?? '').toLowerCase();
  if (!alt) {
    return false;
  }
  const cueHits = PROMO_CUE_RES.reduce((count, re) => count + (re.test(alt) ? 1 : 0), 0);
  return cueHits >= 2;
}

export function classifyProductImageRole(input: { alt?: string | null; source?: string | null; url: string }): ProductDisplayImageRole {
  const signature = `${input.url} ${input.alt ?? ''}`.toLowerCase();
  const hasOnModel = ON_MODEL_RE.test(signature) || ON_MODEL_TOKEN_RE.test(urlPath(input.url));
  if (hasOnModel) {
    return 'on_model';
  }
  if (PACKSHOT_RE.test(signature) || PACKSHOT_TOKEN_RE.test(urlPath(input.url)) || /\bfront\b/i.test(signature)) {
    return 'packshot';
  }
  return 'unknown';
}

export function isProductGalleryAlt(alt: string | null | undefined, pageTitle: string | null): boolean {
  return productGalleryAltSignal(alt, pageTitle).isProductGallery;
}

export function parseJsonLdProductImages(html: string, baseUrl: string): StylePurchasePageImageEvidence[] {
  const images: StylePurchasePageImageEvidence[] = [];
  for (const script of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const text = decodeJsonLdScript(script[1] ?? '').trim();
    if (!text) {
      continue;
    }
    // Parse per-script: one malformed/non-Product JSON-LD block must not drop the rest of the gallery.
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      continue;
    }
    for (const imageUrl of extractJsonLdImageUrls(parsed)) {
      const normalized = normalizeUrl(imageUrl, baseUrl);
      if (normalized) {
        images.push({ alt: null, source: 'json-ld:image', url: normalized });
      }
    }
  }
  return dedupeByDisplayIdentity(images).map(({ jsonLd: _jsonLd, ...entry }) => entry);
}

function parseProductGalleryImages(html: string, baseUrl: string): StylePurchasePageImageEvidence[] {
  const candidates: Array<StylePurchasePageImageEvidence & { widthScore: number }> = [];
  const push = (urlValue: string | null, source: string, alt: string | null, widthScore = 0) => {
    if (!urlValue) {
      return;
    }
    const normalized = normalizeUrl(urlValue, baseUrl);
    if (!normalized || !normalizePublicProductUrl(normalized)) {
      return;
    }
    candidates.push({ alt: normalizeHtmlText(alt), source, url: normalized, widthScore: Math.max(widthScore, imageUrlWidthScore(normalized)) });
  };
  const pushSrcset = (value: string | null, source: string, alt: string | null) => {
    for (const entry of splitSrcsetCandidates(value ?? '')) {
      push(entry.url, source, alt, entry.widthScore);
    }
  };

  for (const picture of html.matchAll(/<picture\b[^>]*>([\s\S]*?)<\/picture>/gi)) {
    const pictureHtml = picture[1] ?? '';
    const imgTag = /<img\b[^>]*>/i.exec(pictureHtml)?.[0] ?? null;
    const imgAttrs = imgTag ? parseHtmlAttributes(imgTag) : {};
    const alt = imgAttrs.alt ?? null;
    for (const sourceTag of pictureHtml.matchAll(/<source\b[^>]*>/gi)) {
      const attrs = parseHtmlAttributes(sourceTag[0]);
      push(attrs.src ?? null, 'picture-source', alt);
      pushSrcset(attrs.srcset ?? attrs['data-srcset'] ?? null, 'picture-source:srcset', alt);
    }
  }

  for (const tag of html.matchAll(/<img\b[^>]*>/gi)) {
    const attrs = parseHtmlAttributes(tag[0]);
    const alt = attrs.alt ?? null;
    push(attrs.src ?? attrs['data-src'] ?? attrs['data-original'] ?? null, 'img-gallery', alt);
    pushSrcset(attrs.srcset ?? attrs['data-srcset'] ?? null, 'img-gallery:srcset', alt);
  }

  return dedupeGalleryCandidates(candidates).map(({ widthScore: _widthScore, ...entry }) => entry);
}

function buildDisplayCandidates(input: {
  extractedCandidates: StylePurchasePageImageEvidence[];
  galleryImages: StylePurchasePageImageEvidence[];
  jsonLdImages: StylePurchasePageImageEvidence[];
  pageTitle: string | null;
  pageUrl: string;
  productUrl: string;
}): ProductDisplayImageCandidate[] {
  const byIdentity = new Map<string, CandidateAccumulator>();
  for (const entry of [
    ...input.jsonLdImages.map((candidate) => ({ ...candidate, jsonLd: true })),
    ...input.galleryImages.map((candidate) => ({ ...candidate, jsonLd: false })),
    ...input.extractedCandidates.map((candidate) => ({ ...candidate, jsonLd: false })),
  ]) {
    // Defense-in-depth: only ever score/store/inline a PUBLIC http(s) image URL. Rejects private,
    // localhost, link-local (cloud metadata), and non-http(s)/data: URLs from an untrusted product page,
    // even though outbound network fetch is also platform-guarded by global_fetch_strictly_public.
    if (!normalizePublicProductUrl(entry.url)) {
      continue;
    }
    if (isLikelyPromoOrNonDisplayImage(entry)) {
      continue;
    }
    if (isLikelyNonProductImage(entry, input.pageTitle, input.pageUrl)) {
      continue;
    }
    const identity = displayIdentityKey(entry.url);
    const existing = byIdentity.get(identity);
    if (!existing) {
      byIdentity.set(identity, entry);
      continue;
    }
    byIdentity.set(identity, mergeCandidate(existing, entry));
  }

  const candidateDrafts = [...byIdentity.values()]
    .map((entry) => ({
      entry,
      productGallerySignal: productGalleryAltSignal(entry.alt, input.pageTitle),
      role: classifyProductImageRole(entry),
    }));
  const hasIsolatedProductGallery = candidateDrafts.filter((candidate) => candidate.productGallerySignal.isProductGallery).length >= 2;
  const candidates = candidateDrafts.map(({ entry, productGallerySignal, role }) => ({
    alt: entry.alt,
    isProductGallery: productGallerySignal.isProductGallery,
    productGalleryOrdinal: productGallerySignal.ordinal,
    role,
    score: scoreDisplayCandidate(entry, role, input.productUrl, hasIsolatedProductGallery && productGallerySignal.isProductGallery),
    source: entry.source,
    url: entry.url,
  }));

  const productGalleryCandidates = candidates.filter((candidate) => candidate.isProductGallery);
  if (hasIsolatedProductGallery) {
    return productGalleryCandidates
      .sort(compareProductGalleryCandidates)
      .slice(0, 8);
  }

  return candidates
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);
}

function scoreDisplayCandidate(
  entry: CandidateAccumulator,
  role: ProductDisplayImageRole,
  productUrl: string,
  isProductGallery: boolean,
): number {
  let score = 0;
  if (isProductGallery) score += 60;
  if (entry.jsonLd || entry.source.includes('json-ld:image')) score += 35;
  if (isRealGallerySource(entry.source)) score += 45;
  if (role === 'packshot') score += 35;
  if (role === 'unknown') score += 8;
  if (role === 'on_model') score -= 45;
  if (entry.source.split('+').every((source) => source === 'html-url')) score -= 70;
  if (entry.source.includes('og:image')) score -= 40;
  if (entry.source.includes('twitter:image')) score -= 18;
  if (hasCheapProductPageIdMatch(entry.url, productUrl)) score += 10;
  if (/(^|[\/_-])1($|[\/_.-])/.test(urlPath(entry.url))) score += 8;
  if (/\b(hero|campaign|editorial)\b/i.test(`${entry.url} ${entry.alt ?? ''}`)) score -= 18;
  return score;
}

function compareProductGalleryCandidates(left: ProductDisplayImageCandidate, right: ProductDisplayImageCandidate): number {
  const leftOrdinal = left.productGalleryOrdinal;
  const rightOrdinal = right.productGalleryOrdinal;
  if (leftOrdinal != null && rightOrdinal != null && leftOrdinal !== rightOrdinal) {
    return leftOrdinal - rightOrdinal;
  }
  if (leftOrdinal != null && rightOrdinal == null) {
    return -1;
  }
  if (leftOrdinal == null && rightOrdinal != null) {
    return 1;
  }
  return right.score - left.score;
}

function hasHighConfidenceDefault(primary: ProductDisplayImageCandidate | null): boolean {
  if (!primary) {
    return false;
  }
  // High confidence requires a clear non-hero PACKSHOT signal on the chosen primary — NOT merely that a
  // JSON-LD gallery exists. Opaque CDN galleries (e.g. Gap's cnXXXX.png) have no packshot signal, so they
  // stay LOW confidence and the create handler hands the gallery to the model's vision to pick.
  return primary.role === 'packshot' && !primary.source.includes('og:image');
}

function classifyHostFitHint(hostImageUrl?: string | null): { url: string | null } {
  // The host-passed image is untrusted: only promote it to a fit write if it is a PUBLIC http(s) URL,
  // so a private/localhost/link-local/data: host hint can never be stored as item media.
  if (!hostImageUrl || !normalizePublicProductUrl(hostImageUrl)) {
    return { url: null };
  }
  return classifyProductImageRole({ url: hostImageUrl }) === 'on_model'
    ? { url: hostImageUrl }
    : { url: null };
}

function emptyResolution(warnings: string[]): ProductDisplayImageResolution {
  return {
    candidates: [],
    confidence: 'low',
    recommendedFitUrl: null,
    recommendedPrimaryUrl: null,
    warnings,
  };
}

function mergeCandidate(existing: CandidateAccumulator, incoming: CandidateAccumulator): CandidateAccumulator {
  const jsonLd = existing.jsonLd || incoming.jsonLd;
  const preferred = existing.jsonLd && !incoming.jsonLd
    ? existing
    : incoming.jsonLd && !existing.jsonLd
      ? incoming
      : sourcePriority(incoming.source) > sourcePriority(existing.source)
        ? incoming
        : existing;
  const sources = new Set([...existing.source.split('+'), ...incoming.source.split('+')]);
  return {
    alt: preferred.alt ?? existing.alt ?? incoming.alt,
    jsonLd,
    source: [...sources].sort((left, right) => sourcePriority(right) - sourcePriority(left)).join('+'),
    url: preferred.url,
  };
}

function sourcePriority(source: string): number {
  if (source.includes('json-ld:image')) return 7;
  if (source.includes('picture-source')) return 6;
  if (source.includes('img-gallery')) return 5;
  if (source.startsWith('img')) return 4;
  if (source === 'link:image_src') return 3;
  if (source.startsWith('twitter:image')) return 2;
  if (source.startsWith('og:image')) return 1;
  return 0;
}

function isRealGallerySource(source: string): boolean {
  return source.split('+').some((entry) =>
    entry.includes('json-ld:image') || entry.includes('picture-source') || entry.includes('img-gallery') || entry === 'img' || entry === 'img:srcset',
  );
}

function productGalleryAltSignal(alt: string | null | undefined, pageTitle: string | null): { isProductGallery: boolean; ordinal: number | null } {
  const normalizedAlt = normalizeHtmlText(alt);
  if (!normalizedAlt) {
    return { isProductGallery: false, ordinal: null };
  }
  const ordinal = extractProductGalleryOrdinal(normalizedAlt);
  if (ordinal != null || /\bimage\s*(?:number|#)?\s*\d+\s*(?:showing|of\b)/i.test(normalizedAlt) || PRODUCT_GALLERY_VIEW_RE.test(normalizedAlt)) {
    return { isProductGallery: true, ordinal };
  }
  const altSearchText = normalizedAlt.toLowerCase();
  const hasTitleTerm = productGalleryTitleTerms(pageTitle).some((term) => altSearchText.includes(term));
  return { isProductGallery: hasTitleTerm, ordinal: null };
}

function extractProductGalleryOrdinal(alt: string): number | null {
  const ordinalText = PRODUCT_GALLERY_ORDINAL_RE.exec(alt)?.[1] ?? PRODUCT_GALLERY_VIEW_RE.exec(alt)?.[1] ?? null;
  if (!ordinalText) {
    return null;
  }
  const ordinal = Number(ordinalText);
  return Number.isInteger(ordinal) && ordinal > 0 ? ordinal : null;
}

function productGalleryTitleTerms(pageTitle: string | null): string[] {
  return (pageTitle ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 4);
}

function extractJsonLdImageUrls(value: unknown): string[] {
  const urls: string[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const entry of node) visit(entry);
      return;
    }
    if (!node || typeof node !== 'object') {
      return;
    }
    const record = node as Record<string, unknown>;
    const graph = record['@graph'];
    if (Array.isArray(graph)) {
      visit(graph);
    }
    if (isProductLikeJsonLdNode(record)) {
      urls.push(...jsonLdImageValueToUrls(record.image));
    }
  };
  visit(value);
  return urls;
}

function isProductLikeJsonLdNode(record: Record<string, unknown>): boolean {
  const typeValue = record['@type'];
  const types = Array.isArray(typeValue) ? typeValue : [typeValue];
  return types.some((entry) => typeof entry === 'string' && entry.toLowerCase() === 'product') || record.image != null;
}

function jsonLdImageValueToUrls(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(jsonLdImageValueToUrls);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return [record.url, record.contentUrl]
      .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  }
  return [];
}

function dedupeByDisplayIdentity(candidates: StylePurchasePageImageEvidence[]): CandidateAccumulator[] {
  const byIdentity = new Map<string, CandidateAccumulator>();
  for (const candidate of candidates) {
    const entry = { ...candidate, jsonLd: true };
    if (!byIdentity.has(displayIdentityKey(candidate.url))) {
      byIdentity.set(displayIdentityKey(candidate.url), entry);
    }
  }
  return [...byIdentity.values()];
}

function dedupeGalleryCandidates(
  candidates: Array<StylePurchasePageImageEvidence & { widthScore: number }>,
): Array<StylePurchasePageImageEvidence & { widthScore: number }> {
  const byIdentity = new Map<string, StylePurchasePageImageEvidence & { widthScore: number }>();
  for (const candidate of candidates) {
    const identity = displayIdentityKey(candidate.url);
    const existing = byIdentity.get(identity);
    if (
      !existing
      || candidate.widthScore > existing.widthScore
      || (candidate.widthScore === existing.widthScore && sourcePriority(candidate.source) > sourcePriority(existing.source))
    ) {
      byIdentity.set(identity, candidate);
    }
  }
  return [...byIdentity.values()];
}

function displayIdentityKey(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`.toLowerCase();
  } catch {
    return url.toLowerCase().split('?')[0] ?? url.toLowerCase();
  }
}

function normalizeUrl(url: string, baseUrl: string): string | null {
  try {
    return new URL(url.replace(/\\\//g, '/'), baseUrl).toString();
  } catch {
    return null;
  }
}

function imageUrlWidthScore(value: string): number {
  try {
    const url = new URL(value);
    const width = Number(url.searchParams.get('width') ?? url.searchParams.get('w') ?? url.searchParams.get('wid') ?? 0);
    return Number.isFinite(width) ? width : 0;
  } catch {
    return 0;
  }
}

function parseHtmlAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
    attrs[match[1]!.toLowerCase()] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

function splitSrcsetCandidates(value: string): Array<{ url: string; widthScore: number }> {
  return value
    .split(',')
    .map((entry) => {
      const parts = entry.trim().split(/\s+/);
      const url = parts[0] ?? '';
      const widthDescriptor = parts.find((part) => /^\d+w$/i.test(part));
      const widthScore = widthDescriptor ? Number(widthDescriptor.slice(0, -1)) : 0;
      return { url, widthScore: Number.isFinite(widthScore) ? widthScore : 0 };
    })
    .filter((entry) => Boolean(entry.url));
}

function normalizeHtmlText(value: string | null | undefined): string | null {
  const normalized = decodeHtmlEntities(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#x22;/gi, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function urlPath(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function hasCheapProductPageIdMatch(imageUrl: string, productUrl: string): boolean {
  const imageText = imageUrl.toLowerCase();
  const pageTokens = urlPath(productUrl)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);
  return pageTokens.some((token) => imageText.includes(token));
}

function decodeJsonLdScript(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#x22;/gi, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
