import type { StyleItemProfileDocument, StyleItemRecord } from './types';
import { normalizeStyleRole } from './helpers';

export const STYLE_METADATA_TAXONOMY_VERSION = '2026-07-17-v1';

const BRAND_ALIASES = new Map<string, string>([
  ['nike x nocta', 'Nike x NOCTA'],
  ['wings horns', 'wings+horns'],
]);

const COLOR_FAMILY_ALIASES = new Map<string, string>([
  ['grey', 'gray'],
  ['off white', 'cream'],
  ['off-white', 'cream'],
  ['high dive auric gold multi', 'yellow'],
]);

const SUBCATEGORY_ALIASES = new Map<string, Map<string, string>>([
  ['BOTTOM', new Map([
    ['pants', 'Trouser'],
  ])],
  ['SHOE', new Map([
    ['basketball', 'Sneaker'],
    ['oxford derby', 'Dress shoe'],
    ['slides', 'Sandal'],
    ['trainer', 'Sneaker'],
  ])],
]);

const OCCASION_ALIASES = new Map<string, string>([
  ['active errands', 'errands'],
  ['casual errands', 'errands'],
  ['commuting', 'commute'],
  ['smart casual', 'smart casual'],
]);

const SEASON_ALIASES = new Map<string, string>([
  ['late fall', 'fall'],
  ['summer evenings', 'summer'],
]);

const POLISH_ALIASES = new Map<string, string>([
  ['athletic casual', 'athletic casual'],
  ['casual athletic', 'athletic casual'],
  ['casual elevated', 'elevated casual'],
  ['casual smart', 'smart casual'],
  ['formal smart', 'smart formal'],
  ['smart casual', 'smart casual'],
  ['smart formal', 'smart formal'],
]);

const TAG_ALIASES = new Map<string, string>([
  ['air force 1', 'Air Force 1'],
  ['cotton blend', 'cotton blend'],
  ['cotton-blend', 'cotton blend'],
  ['nocta', 'NOCTA'],
  ['shorts', 'short'],
  ['smart casual', 'smart casual'],
  ['trousers', 'trouser'],
  ['wings horns', 'wings+horns'],
]);

export type StyleCanonicalMetadataProjection = {
  brand: string | null;
  category: string | null;
  colorFamily: string | null;
  colorName: string | null;
  size: string | null;
  subcategory: string | null;
};

export function canonicalizeStyleMetadataProjection(input: StyleCanonicalMetadataProjection): StyleCanonicalMetadataProjection {
  const category = canonicalCategory(input.category);
  return {
    brand: canonicalBrand(input.brand),
    category,
    colorFamily: canonicalColorFamily(input.colorFamily),
    colorName: cleanScalar(input.colorName),
    size: canonicalSize(input.size),
    subcategory: canonicalSubcategory(category, input.subcategory),
  };
}

export function canonicalizeStyleItemRecord(item: StyleItemRecord): StyleItemRecord {
  const projection = canonicalizeStyleMetadataProjection(item);
  return {
    ...item,
    ...projection,
    profile: item.profile
      ? { ...item.profile, raw: canonicalizeStyleItemProfileMetadata(item.profile.raw) }
      : null,
  };
}

export function canonicalizeStyleItemProfileMetadata(profile: StyleItemProfileDocument): StyleItemProfileDocument {
  return {
    ...profile,
    avoidOccasions: canonicalList(profile.avoidOccasions, OCCASION_ALIASES),
    bestOccasions: canonicalList(profile.bestOccasions, OCCASION_ALIASES),
    fabricHand: cleanScalar(profile.fabricHand),
    fitObservations: canonicalList(profile.fitObservations, new Map()),
    itemType: cleanScalar(profile.itemType),
    lengthNote: cleanScalar(profile.lengthNote),
    ownedSize: canonicalSize(profile.ownedSize),
    pairingNotes: cleanScalar(profile.pairingNotes),
    polishLevel: canonicalAlias(profile.polishLevel, POLISH_ALIASES),
    qualityTier: canonicalDescriptor(profile.qualityTier),
    seasonality: canonicalList(profile.seasonality, SEASON_ALIASES),
    silhouette: canonicalSilhouette(profile.silhouette),
    // Unknown legacy descriptors stay in the immutable raw profile but are omitted from the
    // controlled presentation vocabulary rather than displayed as a second taxonomy.
    styleRole: normalizeStyleRole(profile.styleRole),
    structureLevel: canonicalDescriptor(profile.structureLevel),
    tags: canonicalList(profile.tags, TAG_ALIASES),
    texture: cleanScalar(profile.texture),
    useCases: canonicalList(profile.useCases, OCCASION_ALIASES),
    avoidUseCases: canonicalList(profile.avoidUseCases, OCCASION_ALIASES),
    visualWeight: canonicalDescriptor(profile.visualWeight),
  };
}

export function canonicalizeStyleSearchTerm(value: string | null): string | null {
  const cleaned = cleanScalar(value);
  if (!cleaned) return null;
  const projections = [
    canonicalBrand(cleaned),
    canonicalColorFamily(cleaned),
    canonicalSubcategory('BOTTOM', cleaned),
    canonicalSubcategory('SHOE', cleaned),
  ];
  return projections.find((candidate) => candidate && normalizationKey(candidate) !== normalizationKey(cleaned)) ?? cleaned;
}

function canonicalCategory(value: string | null): string | null {
  const cleaned = cleanScalar(value);
  if (!cleaned) return null;
  const upper = cleaned.toUpperCase();
  if (upper === 'TOP' || upper === 'BOTTOM' || upper === 'OUTERWEAR' || upper === 'SHOE' || upper === 'ACCESSORY' || upper === 'ONE_PIECE') {
    return upper;
  }
  return cleaned;
}

function canonicalBrand(value: string | null): string | null {
  const cleaned = cleanScalar(value);
  if (!cleaned) return null;
  return BRAND_ALIASES.get(normalizationKey(cleaned)) ?? cleaned;
}

function canonicalColorFamily(value: string | null): string | null {
  const cleaned = cleanScalar(value);
  if (!cleaned) return null;
  const key = normalizationKey(cleaned);
  return COLOR_FAMILY_ALIASES.get(key) ?? key;
}

function canonicalSubcategory(category: string | null, value: string | null): string | null {
  const cleaned = cleanScalar(value);
  if (!cleaned) return null;
  return SUBCATEGORY_ALIASES.get(category ?? '')?.get(normalizationKey(cleaned)) ?? cleaned;
}

function canonicalSilhouette(value: string | null): string | null {
  const cleaned = cleanScalar(value);
  if (!cleaned) return null;
  return normalizationKey(cleaned) === 'slim tapered' ? 'slim tapered' : cleaned;
}

function canonicalSize(value: string | null): string | null {
  const cleaned = cleanScalar(value);
  return cleaned && normalizationKey(cleaned) !== 'unspecified' ? cleaned : null;
}

function canonicalAlias(value: string | null, aliases: Map<string, string>): string | null {
  const cleaned = cleanScalar(value);
  if (!cleaned) return null;
  return aliases.get(normalizationKey(cleaned)) ?? cleaned;
}

function canonicalDescriptor(value: string | null): string | null {
  const cleaned = cleanScalar(value);
  return cleaned ? cleaned.replace(/_/g, ' ') : null;
}

function canonicalList(values: string[], aliases: Map<string, string>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const cleaned = cleanScalar(value);
    if (!cleaned) continue;
    const canonical = aliases.get(normalizationKey(cleaned)) ?? cleaned;
    const key = normalizationKey(canonical);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(canonical);
  }
  return output;
}

function cleanScalar(value: string | null): string | null {
  const cleaned = value?.replace(/\s+/g, ' ').trim() ?? '';
  return cleaned && cleaned.toLowerCase() !== 'null' ? cleaned : null;
}

function normalizationKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
