import { FLUENT_OWNER_PROFILE_ID, FLUENT_PRIMARY_TENANT_ID } from '../../fluent-core';
import type { FluentDatabase } from '../../storage';

export class StyleRepository {
  constructor(private readonly db: FluentDatabase) {}

  get profileKey() {
    return {
      profileId: FLUENT_OWNER_PROFILE_ID,
      tenantId: FLUENT_PRIMARY_TENANT_ID,
    };
  }

  async getProfileRow() {
    return this.db
      .prepare(
        `SELECT tenant_id, profile_id, raw_json, updated_at
         FROM style_profile
         WHERE tenant_id = ? AND profile_id = ?`,
      )
      .bind(this.profileKey.tenantId, this.profileKey.profileId)
      .first<{
        profile_id: string;
        raw_json: string | null;
        tenant_id: string;
        updated_at: string | null;
      }>();
  }

  async upsertProfile(rawJson: string) {
    await this.db
      .prepare(
        `INSERT INTO style_profile (tenant_id, profile_id, raw_json)
         VALUES (?, ?, ?)
         ON CONFLICT(tenant_id, profile_id) DO UPDATE SET
           raw_json = excluded.raw_json,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(this.profileKey.tenantId, this.profileKey.profileId, rawJson)
      .run();
  }

  async listItemRows() {
    const result = await this.db
      .prepare(
        `SELECT tenant_id, id, legacy_item_id, brand, name, category, subcategory, size,
                color_family, color_name, color_hex, formality, comparator_key, status, created_at, updated_at
         FROM style_items
         WHERE tenant_id = ?
         ORDER BY created_at ASC, id ASC`,
      )
      .bind(this.profileKey.tenantId)
      .all<{
        brand: string | null;
        category: string | null;
        color_family: string | null;
        color_hex: string | null;
        color_name: string | null;
        comparator_key: string | null;
        created_at: string | null;
        formality: number | null;
        id: string;
        legacy_item_id: number | null;
        name: string | null;
        size: string | null;
        status: string | null;
        subcategory: string | null;
        tenant_id: string;
        updated_at: string | null;
      }>();
    return result.results ?? [];
  }

  async getItemRow(itemId: string) {
    return this.db
      .prepare(
        `SELECT tenant_id, id, legacy_item_id, brand, name, category, subcategory, size,
                color_family, color_name, color_hex, formality, comparator_key, status, created_at, updated_at
         FROM style_items
         WHERE tenant_id = ? AND id = ?`,
      )
      .bind(this.profileKey.tenantId, itemId)
      .first<{
        brand: string | null;
        category: string | null;
        color_family: string | null;
        color_hex: string | null;
        color_name: string | null;
        comparator_key: string | null;
        created_at: string | null;
        formality: number | null;
        id: string;
        legacy_item_id: number | null;
        name: string | null;
        size: string | null;
        status: string | null;
        subcategory: string | null;
        tenant_id: string;
        updated_at: string | null;
      }>();
  }

  async upsertItem(input: {
    brand: string | null;
    category: string | null;
    colorFamily: string | null;
    colorHex: string | null;
    colorName: string | null;
    comparatorKey: string | null;
    formality: number | null;
    id: string;
    legacyItemId: number | null;
    name: string | null;
    size: string | null;
    status: string | null;
    subcategory: string | null;
  }) {
    await this.db
      .prepare(
        `INSERT INTO style_items (
          tenant_id, id, legacy_item_id, brand, name, category, subcategory, size,
          color_family, color_name, color_hex, formality, comparator_key, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(
        this.profileKey.tenantId,
        input.id,
        input.legacyItemId,
        input.brand,
        input.name,
        input.category,
        input.subcategory,
        input.size,
        input.colorFamily,
        input.colorName,
        input.colorHex,
        input.formality,
        input.comparatorKey,
        input.status,
      )
      .run();
  }

  async updateItemComparatorKey(itemId: string, comparatorKey: string) {
    await this.db
      .prepare(
        `UPDATE style_items
         SET comparator_key = ?, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = ? AND id = ?`,
      )
      .bind(comparatorKey, this.profileKey.tenantId, itemId)
      .run();
  }

  async listPhotoRows(itemId?: string) {
    const statement = itemId
      ? this.db
          .prepare(
            `SELECT id, item_id, legacy_photo_id, url, source_url, artifact_id, mime_type, view, kind, source, captured_at, is_primary, is_fit, bg_removed, imported_from, created_at
             FROM style_item_photos
             WHERE tenant_id = ? AND item_id = ?
             ORDER BY is_primary DESC, created_at ASC, id ASC`,
          )
          .bind(this.profileKey.tenantId, itemId)
      : this.db
          .prepare(
            `SELECT id, item_id, legacy_photo_id, url, source_url, artifact_id, mime_type, view, kind, source, captured_at, is_primary, is_fit, bg_removed, imported_from, created_at
             FROM style_item_photos
             WHERE tenant_id = ?
             ORDER BY item_id ASC, is_primary DESC, created_at ASC, id ASC`,
          )
          .bind(this.profileKey.tenantId);

    const result = await statement.all<{
      captured_at: string | null;
      bg_removed: number | boolean | null;
      created_at: string | null;
      artifact_id: string | null;
      id: string;
      imported_from: string | null;
      is_fit: number | boolean | null;
      is_primary: number | boolean | null;
      item_id: string;
      kind: string | null;
      legacy_photo_id: number | null;
      mime_type: string | null;
      source_url: string | null;
      source: string | null;
      url: string;
      view: string | null;
    }>();
    return result.results ?? [];
  }

  async replaceItemPhotos(
    itemId: string,
    photos: Array<{
      bgRemoved: boolean;
      capturedAt: string | null;
      kind: string | null;
      artifactId: string | null;
      id: string;
      importedFrom: string | null;
      isFit: boolean;
      isPrimary: boolean;
      legacyPhotoId: number | null;
      mimeType: string | null;
      sourceUrl: string | null;
      source: string | null;
      url: string;
      view: string | null;
    }>,
  ) {
    await this.db
      .prepare(`DELETE FROM style_item_photos WHERE tenant_id = ? AND item_id = ?`)
      .bind(this.profileKey.tenantId, itemId)
      .run();

    for (const photo of photos) {
      await this.db
        .prepare(
          `INSERT INTO style_item_photos (
            tenant_id, id, item_id, legacy_photo_id, url, source_url, artifact_id, mime_type, view, kind, source, captured_at, is_primary, is_fit, bg_removed, imported_from
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          this.profileKey.tenantId,
          photo.id,
          itemId,
          photo.legacyPhotoId,
          photo.url,
          photo.sourceUrl,
          photo.artifactId,
          photo.mimeType,
          photo.view,
          photo.kind,
          photo.source,
          photo.capturedAt,
          photo.isPrimary ? 1 : 0,
          photo.isFit ? 1 : 0,
          photo.bgRemoved ? 1 : 0,
          photo.importedFrom,
        )
        .run();
    }
  }

  async upsertArtifact(input: {
    artifactId: string;
    artifactType: string;
    entityId: string;
    entityType: string;
    metadataJson: string | null;
    mimeType: string | null;
    r2Key: string;
  }) {
    await this.db
      .prepare(
        `INSERT INTO artifacts (id, domain, artifact_type, entity_type, entity_id, r2_key, mime_type, metadata_json)
         VALUES (?, 'style', ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           artifact_type = excluded.artifact_type,
           entity_type = excluded.entity_type,
           entity_id = excluded.entity_id,
           r2_key = excluded.r2_key,
           mime_type = excluded.mime_type,
           metadata_json = excluded.metadata_json`,
      )
      .bind(
        input.artifactId,
        input.artifactType,
        input.entityType,
        input.entityId,
        input.r2Key,
        input.mimeType,
        input.metadataJson,
      )
      .run();
  }

  async getPhotoDeliveryRow(photoId: string) {
    return this.db
      .prepare(
        `SELECT p.id, p.item_id, p.artifact_id, p.mime_type, p.source_url, p.url,
                a.r2_key, a.mime_type AS artifact_mime_type
         FROM style_item_photos p
         LEFT JOIN artifacts a ON a.id = p.artifact_id
         WHERE p.tenant_id = ? AND p.id = ?`,
      )
      .bind(this.profileKey.tenantId, photoId)
      .first<{
        artifact_id: string | null;
        artifact_mime_type: string | null;
        id: string;
        item_id: string;
        mime_type: string | null;
        r2_key: string | null;
        source_url: string | null;
        url: string;
      }>();
  }

  async listPhotosMissingArtifacts(limit?: number | null) {
    const statement =
      typeof limit === 'number' && Number.isFinite(limit) && limit > 0
        ? this.db
            .prepare(
              `SELECT tenant_id, id, item_id, legacy_photo_id, url, source_url, artifact_id, mime_type, view, kind, source, captured_at, is_primary, is_fit, bg_removed, imported_from, created_at
               FROM style_item_photos
               WHERE tenant_id = ? AND artifact_id IS NULL
               ORDER BY created_at ASC, id ASC
               LIMIT ?`,
            )
            .bind(this.profileKey.tenantId, Math.trunc(limit))
        : this.db
            .prepare(
              `SELECT tenant_id, id, item_id, legacy_photo_id, url, source_url, artifact_id, mime_type, view, kind, source, captured_at, is_primary, is_fit, bg_removed, imported_from, created_at
               FROM style_item_photos
               WHERE tenant_id = ? AND artifact_id IS NULL
               ORDER BY created_at ASC, id ASC`,
            )
            .bind(this.profileKey.tenantId);

    const result = await statement.all<{
      artifact_id: string | null;
      bg_removed: number | boolean | null;
      captured_at: string | null;
      created_at: string | null;
      id: string;
      imported_from: string | null;
      is_fit: number | boolean | null;
      is_primary: number | boolean | null;
      item_id: string;
      kind: string | null;
      legacy_photo_id: number | null;
      mime_type: string | null;
      source: string | null;
      source_url: string | null;
      tenant_id: string;
      url: string;
      view: string | null;
    }>();
    return result.results ?? [];
  }

  async updatePhotoAssetBinding(input: {
    artifactId: string;
    mimeType: string | null;
    photoId: string;
    sourceUrl: string | null;
  }) {
    await this.db
      .prepare(
        `UPDATE style_item_photos
         SET artifact_id = ?,
             mime_type = COALESCE(?, mime_type),
             source_url = COALESCE(source_url, ?, url),
             updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = ? AND id = ?`,
      )
      .bind(input.artifactId, input.mimeType, input.sourceUrl, this.profileKey.tenantId, input.photoId)
      .run();
  }

  async getItemProfileRow(itemId: string) {
    return this.db
      .prepare(
        `SELECT item_id, legacy_profile_id, raw_json, source, method, updated_at
         FROM style_item_profiles
         WHERE tenant_id = ? AND item_id = ?`,
      )
      .bind(this.profileKey.tenantId, itemId)
      .first<{
        item_id: string;
        legacy_profile_id: number | null;
        method: string | null;
        raw_json: string | null;
        source: string | null;
        updated_at: string | null;
      }>();
  }

  async listItemProfileRows() {
    const result = await this.db
      .prepare(
        `SELECT item_id, legacy_profile_id, raw_json, source, method, updated_at
         FROM style_item_profiles
         WHERE tenant_id = ?`,
      )
      .bind(this.profileKey.tenantId)
      .all<{
        item_id: string;
        legacy_profile_id: number | null;
        method: string | null;
        raw_json: string | null;
        source: string | null;
        updated_at: string | null;
      }>();
    return result.results ?? [];
  }

  async upsertItemProfile(input: {
    itemId: string;
    legacyProfileId: number | null;
    method: string | null;
    rawJson: string;
    source: string | null;
  }) {
    await this.db
      .prepare(
        `INSERT INTO style_item_profiles (tenant_id, item_id, legacy_profile_id, raw_json, source, method)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(tenant_id, item_id) DO UPDATE SET
           legacy_profile_id = excluded.legacy_profile_id,
           raw_json = excluded.raw_json,
           source = excluded.source,
           method = excluded.method,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(
        this.profileKey.tenantId,
        input.itemId,
        input.legacyProfileId,
        input.rawJson,
        input.source,
        input.method,
      )
      .run();
  }

  async getProvenanceRow(itemId: string) {
    return this.db
      .prepare(
        `SELECT field_evidence_json, technical_metadata_json, source_snapshot_json, updated_at
         FROM style_item_provenance
         WHERE tenant_id = ? AND item_id = ?`,
      )
      .bind(this.profileKey.tenantId, itemId)
      .first<{
        field_evidence_json: string | null;
        source_snapshot_json: string | null;
        technical_metadata_json: string | null;
        updated_at: string | null;
      }>();
  }

  async upsertProvenance(input: {
    fieldEvidenceJson: string | null;
    itemId: string;
    sourceSnapshotJson: string | null;
    technicalMetadataJson: string | null;
  }) {
    await this.db
      .prepare(
        `INSERT INTO style_item_provenance (
          tenant_id, item_id, field_evidence_json, technical_metadata_json, source_snapshot_json
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, item_id) DO UPDATE SET
          field_evidence_json = excluded.field_evidence_json,
          technical_metadata_json = excluded.technical_metadata_json,
          source_snapshot_json = excluded.source_snapshot_json,
          updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(
        this.profileKey.tenantId,
        input.itemId,
        input.fieldEvidenceJson,
        input.technicalMetadataJson,
        input.sourceSnapshotJson,
      )
      .run();
  }
}
