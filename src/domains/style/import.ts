import {
  asBoolean,
  asNullableNumber,
  asNullableString,
  asRecord,
  defaultStyleProfile,
  inferStyleComparatorKey,
  inferStylePhotoKind,
  inferStylePhotoSource,
  normalizeStyleItemProfile,
  normalizeStylePhotoView,
  parseJsonLike,
} from './helpers';
import type {
  StyleComparatorKey,
  StyleItemProfileDocument,
  StyleItemStatus,
  StylePhotoKind,
  StylePhotoSource,
  StyleProfileDocument,
} from './types';

const IMPORT_TENANT_ID = 'primary';
const IMPORT_PROFILE_ID = 'owner';

export interface StyleImportItem {
  brand: string | null;
  category: string | null;
  comparatorKey: StyleComparatorKey;
  colorFamily: string | null;
  colorHex: string | null;
  colorName: string | null;
  formality: number | null;
  id: string;
  legacyItemId: number | null;
  name: string | null;
  size: string | null;
  status: StyleItemStatus;
  subcategory: string | null;
}

export interface StyleImportPhoto {
  bgRemoved: boolean;
  capturedAt: string | null;
  id: string;
  importedFrom: string | null;
  isFit: boolean;
  isPrimary: boolean;
  itemId: string;
  kind: StylePhotoKind;
  legacyPhotoId: number | null;
  source: StylePhotoSource;
  url: string;
  view: string | null;
}

export interface StyleImportItemProfile {
  itemId: string;
  legacyProfileId: number | null;
  method: string | null;
  profile: StyleItemProfileDocument;
  source: string | null;
}

export interface StyleImportProvenance {
  fieldEvidence: unknown;
  itemId: string;
  sourceSnapshot: unknown;
  technicalMetadata: unknown;
}

export interface StyleImportBundle {
  itemProfiles: StyleImportItemProfile[];
  items: StyleImportItem[];
  photos: StyleImportPhoto[];
  profile: StyleProfileDocument;
  provenance: StyleImportProvenance[];
  summary: {
    itemCount: number;
    photoCount: number;
    profileCount: number;
    provenanceCount: number;
  };
}

export interface BuildStyleImportBundleOptions {
  importedAt?: string;
  importSource?: string | null;
}

export interface BuildStyleImportSqlOptions {
  importedAt?: string;
  importSource?: string | null;
  runId?: string;
  snapshotFile?: string | null;
  sourceName?: string | null;
}

export function buildStyleImportBundle(
  snapshot: { tables?: Record<string, Array<Record<string, unknown>>> } | Record<string, unknown>,
  options: BuildStyleImportBundleOptions = {},
): StyleImportBundle {
  const tables = resolveSnapshotTables(snapshot);
  const itemRows = getTableRows(tables, 'items');
  const photoRows = getTableRows(tables, 'photos');
  const itemProfileRows = getTableRows(tables, 'item_profiles');

  const items: StyleImportItem[] = [];
  const provenance: StyleImportProvenance[] = [];
  const legacyItemIdToStyleId = new Map<string, string>();

  for (const [index, row] of itemRows.entries()) {
    const legacyItemId = asNullableNumber(row.id) ?? asNullableNumber(row.legacy_item_id ?? row.legacyItemId);
    const styleItemId = buildImportedItemId(legacyItemId, index);
    if (legacyItemId !== null) {
      legacyItemIdToStyleId.set(String(legacyItemId), styleItemId);
    }

    items.push({
      brand: asNullableString(row.brand),
      category: asNullableString(row.category),
      comparatorKey: inferStyleComparatorKey({
        category: row.category,
        comparatorKey: row.comparator_key ?? row.comparatorKey,
        subcategory: row.subcategory,
      }),
      colorFamily: asNullableString(row.color_family ?? row.colorFamily),
      colorHex: asNullableString(row.color_hex ?? row.colorHex),
      colorName: asNullableString(row.color_name ?? row.colorName),
      formality: asNullableNumber(row.formality),
      id: styleItemId,
      legacyItemId,
      name: asNullableString(row.name),
      size: asNullableString(row.size),
      status: 'active',
      subcategory: asNullableString(row.subcategory),
    });

    provenance.push({
      fieldEvidence: parseJsonLike(row.field_evidence ?? row.fieldEvidence),
      itemId: styleItemId,
      sourceSnapshot: sanitizeSourceSnapshot(row),
      technicalMetadata: parseJsonLike(row.technical_metadata ?? row.technicalMetadata),
    });
  }

  const photos: StyleImportPhoto[] = [];
  for (const [index, row] of photoRows.entries()) {
    const styleItemId = resolveImportedItemId(row.item_id ?? row.itemId, legacyItemIdToStyleId);
    if (!styleItemId) {
      continue;
    }

    const url =
      asNullableString(row.url) ??
      asNullableString(row.photo_url ?? row.photoUrl) ??
      asNullableString(row.cdn_url ?? row.cdnUrl) ??
      '';
    if (!url) {
      continue;
    }

    const legacyPhotoId = asNullableNumber(row.id) ?? asNullableNumber(row.legacy_photo_id ?? row.legacyPhotoId);
    const view = normalizeStylePhotoView(asNullableString(row.view));
    const importedFrom = asNullableString(row.imported_from ?? row.importedFrom);
    const isFit = asBoolean(row.is_fit ?? row.isFit);
    photos.push({
      bgRemoved: asBoolean(row.bg_removed ?? row.bgRemoved),
      capturedAt: asNullableString(row.captured_at ?? row.capturedAt ?? row.created_at ?? row.createdAt),
      id: buildImportedPhotoId(styleItemId, legacyPhotoId, index),
      importedFrom,
      isFit,
      isPrimary: asBoolean(row.is_primary ?? row.isPrimary),
      itemId: styleItemId,
      kind: inferStylePhotoKind({
        isFit,
        kind: asNullableString(row.kind),
        view,
      }),
      legacyPhotoId,
      source: inferStylePhotoSource({
        importedFrom,
        source: asNullableString(row.source),
        url,
      }),
      url,
      view,
    });
  }

  const itemProfiles: StyleImportItemProfile[] = [];
  for (const row of itemProfileRows) {
    const styleItemId = resolveImportedItemId(row.item_id ?? row.itemId, legacyItemIdToStyleId);
    if (!styleItemId) {
      continue;
    }

    const rawProfile = row.profile_json ?? row.profileJson ?? row.raw_json ?? row.rawJson ?? row.profile;
    itemProfiles.push({
      itemId: styleItemId,
      legacyProfileId: asNullableNumber(row.id) ?? asNullableNumber(row.legacy_profile_id ?? row.legacyProfileId),
      method: asNullableString(row.method),
      profile: normalizeStyleItemProfile(rawProfile),
      source: asNullableString(row.source),
    });
  }

  const profileByItemId = new Map(itemProfiles.map((profile) => [profile.itemId, profile.profile]));
  for (const item of items) {
    item.comparatorKey = inferStyleComparatorKey({
      category: item.category,
      profile: profileByItemId.get(item.id) ?? null,
      subcategory: item.subcategory,
    });
  }

  const importedAt = options.importedAt ?? new Date().toISOString();
  const importSource = asNullableString(options.importSource) ?? null;
  const profile: StyleProfileDocument = {
    ...defaultStyleProfile(),
    closetCoverage: null,
    importedClosetAt: importedAt,
    importedClosetConfirmed: false,
    importSource,
    onboardingPath: items.length > 0 ? 'seeded' : 'fresh',
    practicalCalibrationConfirmed: false,
    tasteCalibrationConfirmed: false,
  };

  return {
    itemProfiles,
    items,
    photos,
    profile,
    provenance,
    summary: {
      itemCount: items.length,
      photoCount: photos.length,
      profileCount: itemProfiles.length,
      provenanceCount: provenance.length,
    },
  };
}

export function buildStyleImportSql(
  bundle: StyleImportBundle,
  options: BuildStyleImportSqlOptions = {},
): string {
  const importedAt = options.importedAt ?? bundle.profile.importedClosetAt ?? new Date().toISOString();
  const importSource = asNullableString(options.importSource) ?? bundle.profile.importSource ?? null;
  const snapshotFile = asNullableString(options.snapshotFile) ?? importSource;
  const sourceName = asNullableString(options.sourceName) ?? 'fluent-web';
  const runId = asNullableString(options.runId) ?? `style-import:${importedAt}`;

  const lines: string[] = ['BEGIN TRANSACTION;'];
  lines.push(
    `INSERT OR IGNORE INTO style_profile (tenant_id, profile_id, raw_json) VALUES (${sqlString(IMPORT_TENANT_ID)}, ${sqlString(IMPORT_PROFILE_ID)}, ${sqlString(JSON.stringify(defaultStyleProfile()))});`,
  );
  lines.push(
    `UPDATE style_profile
SET raw_json = json_set(
  COALESCE(raw_json, '{}'),
  '$.importedClosetAt', ${sqlString(importedAt)},
  '$.importedClosetConfirmed', json('false'),
  '$.importSource', ${sqlString(importSource)}
),
updated_at = CURRENT_TIMESTAMP
WHERE tenant_id = ${sqlString(IMPORT_TENANT_ID)} AND profile_id = ${sqlString(IMPORT_PROFILE_ID)};`,
  );

  for (const item of bundle.items) {
    lines.push(
      `INSERT INTO style_items (
  tenant_id, id, legacy_item_id, brand, name, category, subcategory, size, color_family, color_name, color_hex, formality, status
  , comparator_key
) VALUES (
  ${sqlString(IMPORT_TENANT_ID)}, ${sqlString(item.id)}, ${sqlNumber(item.legacyItemId)}, ${sqlString(item.brand)},
  ${sqlString(item.name)}, ${sqlString(item.category)}, ${sqlString(item.subcategory)}, ${sqlString(item.size)},
  ${sqlString(item.colorFamily)}, ${sqlString(item.colorName)}, ${sqlString(item.colorHex)}, ${sqlNumber(item.formality)}, ${sqlString(item.status)},
  ${sqlString(item.comparatorKey)}
)
ON CONFLICT(tenant_id, id) DO UPDATE SET
  legacy_item_id = excluded.legacy_item_id,
  brand = excluded.brand,
  name = excluded.name,
  category = excluded.category,
  subcategory = excluded.subcategory,
  size = excluded.size,
  color_family = excluded.color_family,
  color_name = excluded.color_name,
  color_hex = excluded.color_hex,
  formality = excluded.formality,
  comparator_key = excluded.comparator_key,
  status = excluded.status,
  updated_at = CURRENT_TIMESTAMP;`,
    );
  }

  if (bundle.items.length > 0) {
    lines.push(
      `DELETE FROM style_item_photos
WHERE tenant_id = ${sqlString(IMPORT_TENANT_ID)}
  AND item_id IN (${bundle.items.map((item) => sqlString(item.id)).join(', ')});`,
    );
  }

  for (const photo of bundle.photos) {
    lines.push(
      `INSERT INTO style_item_photos (
  tenant_id, id, item_id, legacy_photo_id, url, view, is_primary, is_fit, bg_removed, imported_from, kind, source, captured_at
) VALUES (
  ${sqlString(IMPORT_TENANT_ID)}, ${sqlString(photo.id)}, ${sqlString(photo.itemId)}, ${sqlNumber(photo.legacyPhotoId)},
  ${sqlString(photo.url)}, ${sqlString(photo.view)}, ${sqlBoolean(photo.isPrimary)}, ${sqlBoolean(photo.isFit)},
  ${sqlBoolean(photo.bgRemoved)}, ${sqlString(photo.importedFrom)}, ${sqlString(photo.kind)}, ${sqlString(photo.source)}, ${sqlString(photo.capturedAt)}
)
ON CONFLICT(tenant_id, id) DO UPDATE SET
  item_id = excluded.item_id,
  legacy_photo_id = excluded.legacy_photo_id,
  url = excluded.url,
  view = excluded.view,
  is_primary = excluded.is_primary,
  is_fit = excluded.is_fit,
  bg_removed = excluded.bg_removed,
  imported_from = excluded.imported_from,
  kind = excluded.kind,
  source = excluded.source,
  captured_at = excluded.captured_at,
  updated_at = CURRENT_TIMESTAMP;`,
    );
  }

  for (const profile of bundle.itemProfiles) {
    lines.push(
      `INSERT INTO style_item_profiles (
  tenant_id, item_id, legacy_profile_id, raw_json, source, method
) VALUES (
  ${sqlString(IMPORT_TENANT_ID)}, ${sqlString(profile.itemId)}, ${sqlNumber(profile.legacyProfileId)},
  ${sqlString(JSON.stringify(profile.profile))}, ${sqlString(profile.source)}, ${sqlString(profile.method)}
)
ON CONFLICT(tenant_id, item_id) DO UPDATE SET
  legacy_profile_id = excluded.legacy_profile_id,
  raw_json = excluded.raw_json,
  source = excluded.source,
  method = excluded.method,
  updated_at = CURRENT_TIMESTAMP;`,
    );
  }

  for (const record of bundle.provenance) {
    lines.push(
      `INSERT INTO style_item_provenance (
  tenant_id, item_id, field_evidence_json, technical_metadata_json, source_snapshot_json
) VALUES (
  ${sqlString(IMPORT_TENANT_ID)}, ${sqlString(record.itemId)}, ${sqlJson(record.fieldEvidence)},
  ${sqlJson(record.technicalMetadata)}, ${sqlJson(record.sourceSnapshot)}
)
ON CONFLICT(tenant_id, item_id) DO UPDATE SET
  field_evidence_json = excluded.field_evidence_json,
  technical_metadata_json = excluded.technical_metadata_json,
  source_snapshot_json = excluded.source_snapshot_json,
  updated_at = CURRENT_TIMESTAMP;`,
    );
  }

  lines.push(
    `INSERT INTO style_import_runs (
  id, tenant_id, source_name, source_snapshot_path, item_count, photo_count, profile_count
) VALUES (
  ${sqlString(runId)}, ${sqlString(IMPORT_TENANT_ID)}, ${sqlString(sourceName)}, ${sqlString(snapshotFile)},
  ${bundle.summary.itemCount}, ${bundle.summary.photoCount}, ${bundle.summary.profileCount}
)
ON CONFLICT(id) DO UPDATE SET
  source_name = excluded.source_name,
  source_snapshot_path = excluded.source_snapshot_path,
  item_count = excluded.item_count,
  photo_count = excluded.photo_count,
  profile_count = excluded.profile_count;`,
  );
  lines.push('COMMIT;');
  return `${lines.join('\n\n')}\n`;
}

function resolveSnapshotTables(
  snapshot: { tables?: Record<string, Array<Record<string, unknown>>> } | Record<string, unknown>,
): Record<string, Array<Record<string, unknown>>> {
  const record = asRecord(snapshot) ?? {};
  const tables = asRecord(record.tables) ?? record;
  return Object.fromEntries(
    Object.entries(tables).map(([key, value]) => [key, Array.isArray(value) ? value.filter((row) => asRecord(row)).map((row) => row as Record<string, unknown>) : []]),
  );
}

function getTableRows(
  tables: Record<string, Array<Record<string, unknown>>>,
  tableName: string,
): Array<Record<string, unknown>> {
  return Array.isArray(tables[tableName]) ? tables[tableName] : [];
}

function buildImportedItemId(legacyItemId: number | null, index: number): string {
  return legacyItemId === null ? `style-item:fluent-web:row-${index + 1}` : `style-item:fluent-web:${legacyItemId}`;
}

function buildImportedPhotoId(styleItemId: string, legacyPhotoId: number | null, index: number): string {
  return legacyPhotoId === null ? `style-photo:fluent-web:${styleItemId}:${index + 1}` : `style-photo:fluent-web:${legacyPhotoId}`;
}

function resolveImportedItemId(value: unknown, legacyItemIdToStyleId: Map<string, string>): string | null {
  const legacyItemId = asNullableNumber(value);
  if (legacyItemId === null) {
    return null;
  }
  return legacyItemIdToStyleId.get(String(legacyItemId)) ?? null;
}

function sanitizeSourceSnapshot(row: Record<string, unknown>) {
  const {
    field_evidence,
    fieldEvidence,
    llm_ratings,
    llmRatings,
    technical_metadata,
    technicalMetadata,
    ...rest
  } = row;
  return rest;
}

function sqlString(value: string | null): string {
  if (value === null) {
    return 'NULL';
  }
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlNumber(value: number | null): string {
  return value === null ? 'NULL' : String(value);
}

function sqlBoolean(value: boolean): string {
  return value ? '1' : '0';
}

function sqlJson(value: unknown): string {
  return value === undefined ? 'NULL' : sqlString(value === null ? null : JSON.stringify(value));
}
