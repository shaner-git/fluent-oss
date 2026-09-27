import { getFluentIdentityContext } from '../../fluent-identity';
import type { FluentDatabase } from '../../storage';

// Every style_item_photos column the replace path writes (besides tenant_id). The INSERT column
// list and the concurrency fingerprint are both built from this one list, so a concurrent change to
// any rewritten column (view, source, mime_type, captured_at, ...) is always detected.
const STYLE_PHOTO_REPLACE_COLUMNS = [
  'id',
  'item_id',
  'legacy_photo_id',
  'url',
  'source_url',
  'artifact_id',
  'mime_type',
  'view',
  'kind',
  'source',
  'captured_at',
  'is_primary',
  'is_fit',
  'bg_removed',
  'imported_from',
  'created_at',
] as const;
const STYLE_PHOTO_SET_FINGERPRINT_SQL = `SELECT json_group_array(json_array(${STYLE_PHOTO_REPLACE_COLUMNS.join(', ')})) FROM (SELECT * FROM style_item_photos WHERE tenant_id = ? AND item_id = ? ORDER BY id)`;

// Raised when a photo write would reference an artifact that cleanup has already released (its row
// deleted while unreferenced, its blob being deleted). Nothing in the write was committed.
export class StylePhotoArtifactReleasedError extends Error {
  constructor() {
    super('A photo in this write refers to media that was removed concurrently. Nothing was saved; read the item again and retry.');
    this.name = 'StylePhotoArtifactReleasedError';
  }
}

export class StyleRepository {
  constructor(private readonly db: FluentDatabase) {}

  async readProductReference(itemId: string) {
    return this.db.prepare('SELECT revision, operation_id, reference_json FROM style_product_references WHERE tenant_id=? AND item_id=?')
      .bind(this.profileKey.tenantId, itemId).first<{ revision: number; operation_id: string; reference_json: string }>();
  }

  async listProductReferences() {
    return (await this.db.prepare('SELECT item_id,revision,reference_json FROM style_product_references WHERE tenant_id=?')
      .bind(this.profileKey.tenantId).all<{item_id:string;revision:number;reference_json:string}>()).results;
  }

  async saveProductReference(itemId: string, revision: number, operationId: string, referenceJson: string) {
    const tenant = this.profileKey.tenantId;
    const result = await this.db.prepare(`INSERT INTO style_product_references (tenant_id,item_id,revision,operation_id,reference_json)
      SELECT ?,?,1,?,? WHERE EXISTS(SELECT 1 FROM style_items WHERE tenant_id=? AND id=? AND status='active')
      AND (?=0 OR EXISTS(SELECT 1 FROM style_product_references WHERE tenant_id=? AND item_id=? AND revision=?))
      ON CONFLICT(tenant_id,item_id) DO UPDATE SET revision=style_product_references.revision+1,operation_id=excluded.operation_id,reference_json=excluded.reference_json
      WHERE style_product_references.revision=?`)
      .bind(tenant,itemId,operationId,referenceJson,tenant,itemId,revision,tenant,itemId,revision,revision).run();
    if (result.meta.changes !== 1) throw Error('Product information changed. Read the item again before saving.');
  }

  get profileKey() {
    const identity = getFluentIdentityContext();
    return {
      profileId: identity.profileId,
      tenantId: identity.tenantId,
    };
  }

  async readPhotoLibrary(itemId: string) {
    const row=await this.db.prepare(`SELECT revision,state_json FROM style_photo_libraries WHERE tenant_id=? AND item_id=?`).bind(this.profileKey.tenantId,itemId).first<{revision:number;state_json:string}>();
    const fingerprint=await this.db.prepare(`SELECT json_group_array(json_array(id,url,artifact_id,source_url,is_primary,is_fit,bg_removed)) AS value FROM (SELECT * FROM style_item_photos WHERE tenant_id=? AND item_id=? ORDER BY id)`).bind(this.profileKey.tenantId,itemId).first<{value:string}>();
    return {revision:row?.revision??0,state:row?JSON.parse(row.state_json):{hidden:[],order:[]},fingerprint:fingerprint?.value??'[]'};
  }

  async savePhotoLibrary(itemId:string,revision:number,fingerprint:string,state:unknown) {
    const result=await this.db.prepare(`INSERT INTO style_photo_libraries (tenant_id,item_id,revision,state_json)
      SELECT ?,?,1,? WHERE EXISTS(SELECT 1 FROM style_items WHERE tenant_id=? AND id=? AND status='active')
      AND (SELECT json_group_array(json_array(id,url,artifact_id,source_url,is_primary,is_fit,bg_removed)) FROM (SELECT * FROM style_item_photos WHERE tenant_id=? AND item_id=? ORDER BY id))=?
      AND (?=0 OR EXISTS(SELECT 1 FROM style_photo_libraries WHERE tenant_id=? AND item_id=? AND revision=?))
      ON CONFLICT(tenant_id,item_id) DO UPDATE SET revision=style_photo_libraries.revision+1,state_json=excluded.state_json WHERE style_photo_libraries.revision=?`)
      .bind(this.profileKey.tenantId,itemId,JSON.stringify(state),this.profileKey.tenantId,itemId,this.profileKey.tenantId,itemId,fingerprint,revision,this.profileKey.tenantId,itemId,revision,revision).run();
    if(result.meta.changes!==1)throw Error('Photos changed. Refresh this item before saving.');
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

  async createItemWithPhotos(input: {
    item: {
      brand: string | null;
      category: string | null;
      colorFamily: string | null;
      colorHex: string | null;
      colorName: string | null;
      comparatorKey: string | null;
      formality: number | null;
      id: string;
      name: string | null;
      size: string | null;
      subcategory: string | null;
    };
    photos: Parameters<StyleRepository['replaceItemPhotos']>[1];
    profile: { method: string | null; rawJson: string; source: string | null };
    provenance: NonNullable<Parameters<StyleRepository['replaceItemPhotos']>[2]>;
    event: {
      actorEmail: string | null;
      actorName: string | null;
      afterJson: string | null;
      confidence: number | null;
      id: string;
      sessionId: string | null;
      sourceAgent: string | null;
      sourceSkill: string | null;
      sourceType: string | null;
    };
  }) {
    const tenantId = this.profileKey.tenantId;
    const artifactIds = this.photoArtifactIds(input.photos);
    const statements = [
      ...this.photoArtifactGuards(artifactIds),
      this.db.prepare(
        `INSERT INTO style_items (
          tenant_id, id, legacy_item_id, brand, name, category, subcategory, size,
          color_family, color_name, color_hex, formality, comparator_key, status
        ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      ).bind(
        tenantId,
        input.item.id,
        input.item.brand,
        input.item.name,
        input.item.category,
        input.item.subcategory,
        input.item.size,
        input.item.colorFamily,
        input.item.colorName,
        input.item.colorHex,
        input.item.formality,
        input.item.comparatorKey,
      ),
      this.db.prepare(
        `INSERT INTO style_item_profiles (tenant_id, item_id, legacy_profile_id, raw_json, source, method)
         VALUES (?, ?, NULL, ?, ?, ?)`,
      ).bind(tenantId, input.item.id, input.profile.rawJson, input.profile.source, input.profile.method),
      this.db.prepare(
        `INSERT INTO style_item_provenance (
          tenant_id, item_id, field_evidence_json, technical_metadata_json, source_snapshot_json
        ) VALUES (?, ?, ?, ?, ?)`,
      ).bind(
        tenantId,
        input.item.id,
        input.provenance.fieldEvidenceJson,
        input.provenance.technicalMetadataJson,
        input.provenance.sourceSnapshotJson,
      ),
      ...input.photos.map((photo) => this.db.prepare(
        `INSERT INTO style_item_photos (
          tenant_id, id, item_id, legacy_photo_id, url, source_url, artifact_id, mime_type, view, kind, source,
          captured_at, is_primary, is_fit, bg_removed, imported_from, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
      ).bind(
        tenantId,
        photo.id,
        input.item.id,
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
        photo.createdAt,
      )),
      this.db.prepare(
        `INSERT INTO domain_events (
          id, domain, entity_type, entity_id, event_type,
          before_json, after_json, patch_json,
          source_agent, source_skill, session_id, confidence, source_type, actor_email, actor_name
        ) VALUES (?, 'style', 'style_item', ?, 'style.item_created', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        input.event.id,
        input.item.id,
        input.event.afterJson,
        JSON.stringify({ eventType: 'style.item_created' }),
        input.event.sourceAgent,
        input.event.sourceSkill,
        input.event.sessionId,
        input.event.confidence,
        input.event.sourceType,
        input.event.actorEmail,
        input.event.actorName,
      ),
      this.db.prepare(
        `SELECT CASE WHEN
           EXISTS (SELECT 1 FROM style_items WHERE tenant_id = ? AND id = ? AND status = 'active')
           AND (SELECT COUNT(*) FROM style_item_photos WHERE tenant_id = ? AND item_id = ?) = ?
           AND (SELECT COUNT(*) FROM style_item_photos WHERE tenant_id = ? AND item_id = ? AND is_primary = 1) = 1
           AND NOT EXISTS (
             SELECT 1 FROM style_item_photos p
             LEFT JOIN artifacts a ON a.tenant_id = p.tenant_id AND a.id = p.artifact_id
             WHERE p.tenant_id = ? AND p.item_id = ? AND (p.artifact_id IS NULL OR a.id IS NULL)
           )
         THEN 1 ELSE json_extract('invalid atomic Style create state', '$') END AS verified`,
      ).bind(
        tenantId, input.item.id,
        tenantId, input.item.id, input.photos.length,
        tenantId, input.item.id,
        tenantId, input.item.id,
      ),
    ];
    await this.runPhotoBatch(() => this.db.batch(statements), artifactIds);
  }

  async listDuplicateCreateIdempotencySnapshots() {
    const result = await this.db
      .prepare(
        `SELECT item_id, source_snapshot_json
         FROM style_item_provenance
         WHERE tenant_id = ? AND source_snapshot_json IS NOT NULL`,
      )
      .bind(this.profileKey.tenantId)
      .all<{ item_id: string; source_snapshot_json: string }>();
    return result.results ?? [];
  }

  async mergeDuplicateItem(input: {
    expectedPhotoCount: number;
    mergeId: string | null;
    sourceItemId: string;
    sourcePhotoIds: string[];
    sourcePrimaryPhotoId: string | null;
    targetItemId: string;
  }) {
    const { expectedPhotoCount, mergeId, sourceItemId, sourcePrimaryPhotoId, targetItemId } = input;
    const sourcePhotoIds = [...new Set(input.sourcePhotoIds.filter(Boolean))].sort();
    if (!sourceItemId || !targetItemId || sourceItemId === targetItemId) {
      throw new Error('Style duplicate merge requires two distinct item IDs.');
    }
    const tenantId = this.profileKey.tenantId;
    const sourceActive = `EXISTS (SELECT 1 FROM style_items source WHERE source.tenant_id = ? AND source.id = ? AND source.status = 'active')`;
    const targetActive = `EXISTS (SELECT 1 FROM style_items target WHERE target.tenant_id = ? AND target.id = ? AND target.status = 'active')`;
    const sourcePhotoPredicate = sourcePhotoIds.length
      ? `id IN (${sourcePhotoIds.map(() => '?').join(', ')})`
      : '0 = 1';
    await this.db.batch([
      this.db
        .prepare(
          `SELECT CASE WHEN
             ${sourceActive}
             AND ${targetActive}
             AND (SELECT COUNT(*) FROM style_item_photos WHERE tenant_id = ? AND item_id = ?) = ?
             AND (SELECT COUNT(*) FROM style_item_photos WHERE tenant_id = ? AND item_id = ? AND ${sourcePhotoPredicate}) = ?
             AND (
               (? IS NULL AND NOT EXISTS (
                 SELECT 1 FROM style_item_photos WHERE tenant_id = ? AND item_id = ? AND is_primary = 1
               ))
               OR EXISTS (
                 SELECT 1 FROM style_item_photos
                 WHERE tenant_id = ? AND item_id = ? AND id = ? AND is_primary = 1
               )
             )
           THEN 1 ELSE json_extract('invalid duplicate merge photo set', '$') END AS verified`,
        )
        .bind(
          tenantId,
          sourceItemId,
          tenantId,
          targetItemId,
          tenantId,
          sourceItemId,
          sourcePhotoIds.length,
          tenantId,
          sourceItemId,
          ...sourcePhotoIds,
          sourcePhotoIds.length,
          sourcePrimaryPhotoId,
          tenantId,
          sourceItemId,
          tenantId,
          sourceItemId,
          sourcePrimaryPhotoId,
        ),
      this.db
        .prepare(
          `UPDATE style_item_photos
           SET item_id = ?,
               is_primary = CASE
                 WHEN EXISTS (
                   SELECT 1 FROM style_item_photos current
                   WHERE current.tenant_id = ? AND current.item_id = ? AND current.is_primary = 1
                 ) THEN 0
                 ELSE is_primary
               END
           WHERE tenant_id = ? AND item_id = ? AND ${sourcePhotoPredicate}
             AND ${sourceActive}
             AND ${targetActive}`,
        )
        .bind(
          targetItemId,
          tenantId,
          targetItemId,
          tenantId,
          sourceItemId,
          ...sourcePhotoIds,
          tenantId,
          sourceItemId,
          tenantId,
          targetItemId,
        ),
      this.db
        .prepare(
          `UPDATE style_items AS target
           SET brand = COALESCE(NULLIF(target.brand, ''), (SELECT source.brand FROM style_items source WHERE source.tenant_id = target.tenant_id AND source.id = ?)),
               name = COALESCE(NULLIF(target.name, ''), (SELECT source.name FROM style_items source WHERE source.tenant_id = target.tenant_id AND source.id = ?)),
               category = COALESCE(NULLIF(target.category, ''), (SELECT source.category FROM style_items source WHERE source.tenant_id = target.tenant_id AND source.id = ?)),
               subcategory = COALESCE(NULLIF(target.subcategory, ''), (SELECT source.subcategory FROM style_items source WHERE source.tenant_id = target.tenant_id AND source.id = ?)),
               size = COALESCE(NULLIF(target.size, ''), (SELECT source.size FROM style_items source WHERE source.tenant_id = target.tenant_id AND source.id = ?)),
               color_family = COALESCE(NULLIF(target.color_family, ''), (SELECT source.color_family FROM style_items source WHERE source.tenant_id = target.tenant_id AND source.id = ?)),
               color_name = COALESCE(NULLIF(target.color_name, ''), (SELECT source.color_name FROM style_items source WHERE source.tenant_id = target.tenant_id AND source.id = ?)),
               color_hex = COALESCE(NULLIF(target.color_hex, ''), (SELECT source.color_hex FROM style_items source WHERE source.tenant_id = target.tenant_id AND source.id = ?)),
               formality = COALESCE(target.formality, (SELECT source.formality FROM style_items source WHERE source.tenant_id = target.tenant_id AND source.id = ?)),
               comparator_key = COALESCE(NULLIF(target.comparator_key, ''), (SELECT source.comparator_key FROM style_items source WHERE source.tenant_id = target.tenant_id AND source.id = ?)),
               updated_at = CURRENT_TIMESTAMP
           WHERE target.tenant_id = ? AND target.id = ? AND target.status = 'active'
             AND ${sourceActive}`,
        )
        .bind(
          sourceItemId,
          sourceItemId,
          sourceItemId,
          sourceItemId,
          sourceItemId,
          sourceItemId,
          sourceItemId,
          sourceItemId,
          sourceItemId,
          sourceItemId,
          tenantId,
          targetItemId,
          tenantId,
          sourceItemId,
        ),
      this.db
        .prepare(
          `INSERT INTO style_item_profiles (tenant_id, item_id, legacy_profile_id, raw_json, source, method)
           SELECT source.tenant_id, ?, source.legacy_profile_id, source.raw_json, source.source, source.method
           FROM style_item_profiles source
           WHERE source.tenant_id = ? AND source.item_id = ?
             AND NOT EXISTS (
               SELECT 1 FROM style_item_profiles target WHERE target.tenant_id = source.tenant_id AND target.item_id = ?
             )
             AND ${sourceActive}
             AND ${targetActive}`,
        )
        .bind(
          targetItemId,
          tenantId,
          sourceItemId,
          targetItemId,
          tenantId,
          sourceItemId,
          tenantId,
          targetItemId,
        ),
      this.db
        .prepare(
          `INSERT INTO style_item_provenance (tenant_id, item_id, source_snapshot_json)
           SELECT source.tenant_id,
                  ?,
                  json_object(
                    'duplicateMergeLineage',
                    (
                      SELECT json_group_array(json(lineage_entry))
                      FROM (
                        SELECT json_object(
                          'sourceItemId', source.id,
                          'mergeId', ?,
                          'mergedAt', CURRENT_TIMESTAMP,
                          'transferredPhotoIds', json(?),
                          'sourcePrimaryPhotoId', ?,
                          'sourceProvenance', json_object(
                            'fieldEvidence', CASE WHEN json_valid(provenance.field_evidence_json) THEN json(provenance.field_evidence_json) ELSE NULL END,
                            'technicalMetadata', CASE WHEN json_valid(provenance.technical_metadata_json) THEN json(provenance.technical_metadata_json) ELSE NULL END,
                            'sourceSnapshot', CASE WHEN json_valid(provenance.source_snapshot_json) THEN json(provenance.source_snapshot_json) ELSE NULL END
                          )
                        ) AS lineage_entry
                        UNION ALL
                        SELECT inherited.value AS lineage_entry
                        FROM json_each(provenance.source_snapshot_json, '$.duplicateMergeLineage') inherited
                      )
                    )
                  )
           FROM style_items source
           LEFT JOIN style_item_provenance provenance
             ON provenance.tenant_id = source.tenant_id AND provenance.item_id = source.id
           WHERE source.tenant_id = ? AND source.id = ? AND source.status = 'active'
             AND ${targetActive}
           ON CONFLICT (tenant_id, item_id) DO UPDATE SET
             source_snapshot_json = json_set(
               CASE
                 WHEN style_item_provenance.source_snapshot_json IS NOT NULL
                      AND json_valid(style_item_provenance.source_snapshot_json)
                   THEN style_item_provenance.source_snapshot_json
                 ELSE '{}'
               END,
               '$.duplicateMergeLineage',
               (
                 SELECT json_group_array(json(lineage_entry))
                 FROM (
                   SELECT existing.value AS lineage_entry
                   FROM json_each(
                     CASE
                       WHEN json_type(style_item_provenance.source_snapshot_json, '$.duplicateMergeLineage') = 'array'
                         THEN json_extract(style_item_provenance.source_snapshot_json, '$.duplicateMergeLineage')
                       ELSE json('[]')
                     END
                   ) existing
                   UNION ALL
                   SELECT incoming.value AS lineage_entry
                   FROM json_each(excluded.source_snapshot_json, '$.duplicateMergeLineage') incoming
                 )
               )
             ),
             updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(
          targetItemId,
          mergeId,
          JSON.stringify(sourcePhotoIds),
          sourcePrimaryPhotoId,
          tenantId,
          sourceItemId,
          tenantId,
          targetItemId,
        ),
      this.db
        .prepare(
          `INSERT INTO style_item_provenance (tenant_id, item_id, source_snapshot_json)
           SELECT source.tenant_id,
                  source.id,
                  json_object(
                    'duplicateMergeRedirect',
                    json_object(
                      'targetItemId', ?,
                      'mergeId', ?,
                      'mergedAt', CURRENT_TIMESTAMP,
                      'transferredPhotoIds', json(?),
                      'sourcePrimaryPhotoId', ?
                    )
                  )
           FROM style_items source
           WHERE source.tenant_id = ? AND source.id = ? AND source.status = 'active'
             AND ${targetActive}
           ON CONFLICT (tenant_id, item_id) DO UPDATE SET
             source_snapshot_json = json_set(
               CASE
                 WHEN style_item_provenance.source_snapshot_json IS NOT NULL
                      AND json_valid(style_item_provenance.source_snapshot_json)
                   THEN style_item_provenance.source_snapshot_json
                 ELSE '{}'
               END,
               '$.duplicateMergeRedirect',
               json_object(
                 'targetItemId', ?,
                 'mergeId', ?,
                 'mergedAt', CURRENT_TIMESTAMP,
                 'transferredPhotoIds', json(?),
                 'sourcePrimaryPhotoId', ?
               )
             ),
             updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(
          targetItemId,
          mergeId,
          JSON.stringify(sourcePhotoIds),
          sourcePrimaryPhotoId,
          tenantId,
          sourceItemId,
          tenantId,
          targetItemId,
          targetItemId,
          mergeId,
          JSON.stringify(sourcePhotoIds),
          sourcePrimaryPhotoId,
        ),
      this.db
        .prepare(
          `UPDATE style_item_provenance
           SET source_snapshot_json = json_set(
                 source_snapshot_json,
                 '$.duplicateMergeRedirect.targetItemId', ?,
                 '$.duplicateMergeRedirect.mergedAt', CURRENT_TIMESTAMP
               ),
               updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ?
             AND json_valid(source_snapshot_json)
             AND json_extract(source_snapshot_json, '$.duplicateMergeRedirect.targetItemId') = ?
             AND json_extract(source_snapshot_json, '$.duplicateMergeRedirect.undoneAt') IS NULL
             AND ${sourceActive}
             AND ${targetActive}`,
        )
        .bind(
          targetItemId,
          tenantId,
          sourceItemId,
          tenantId,
          sourceItemId,
          tenantId,
          targetItemId,
        ),
      this.db
        .prepare(
          `UPDATE style_items
           SET status = 'archived', updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND id = ? AND status = 'active'
             AND ${targetActive}`,
        )
        .bind(tenantId, sourceItemId, tenantId, targetItemId),
      this.db
        .prepare(
          `SELECT CASE WHEN
             EXISTS (SELECT 1 FROM style_items WHERE tenant_id = ? AND id = ? AND status = 'archived')
             AND EXISTS (SELECT 1 FROM style_items WHERE tenant_id = ? AND id = ? AND status = 'active')
             AND (SELECT COUNT(*) FROM style_item_photos WHERE tenant_id = ? AND item_id = ?) = 0
             AND (SELECT COUNT(*) FROM style_item_photos WHERE tenant_id = ? AND item_id = ?) = ?
             AND EXISTS (
               SELECT 1 FROM style_item_provenance
               WHERE tenant_id = ? AND item_id = ?
                 AND json_extract(source_snapshot_json, '$.duplicateMergeRedirect.targetItemId') = ?
                 AND ((? IS NULL AND json_extract(source_snapshot_json, '$.duplicateMergeRedirect.mergeId') IS NULL) OR json_extract(source_snapshot_json, '$.duplicateMergeRedirect.mergeId') = ?)
             )
             AND EXISTS (
               SELECT 1
               FROM style_item_provenance target_provenance,
                    json_each(target_provenance.source_snapshot_json, '$.duplicateMergeLineage') lineage
               WHERE target_provenance.tenant_id = ? AND target_provenance.item_id = ?
                 AND json_extract(lineage.value, '$.sourceItemId') = ?
                 AND ((? IS NULL AND json_extract(lineage.value, '$.mergeId') IS NULL) OR json_extract(lineage.value, '$.mergeId') = ?)
                 AND json_extract(lineage.value, '$.transferredPhotoIds') = json(?)
             )
           THEN 1 ELSE json_extract('invalid duplicate merge state', '$') END AS verified`,
        )
        .bind(
          tenantId,
          sourceItemId,
          tenantId,
          targetItemId,
          tenantId,
          sourceItemId,
          tenantId,
          targetItemId,
          expectedPhotoCount,
          tenantId,
          sourceItemId,
          targetItemId,
          mergeId,
          mergeId,
          tenantId,
          targetItemId,
          sourceItemId,
          mergeId,
          mergeId,
          JSON.stringify(sourcePhotoIds),
        ),
    ]);
    return {
      redirectTargetItemId: targetItemId,
      mergeId,
      sourcePhotoCount: 0,
      sourceStatus: 'archived',
      targetPhotoCount: expectedPhotoCount,
      targetStatus: 'active',
    };
  }

  async restoreDuplicateMergedItem(input: {
    mergeId: string | null;
    sourceItemId: string;
    sourcePhotoIds: string[];
    sourcePrimaryPhotoId: string | null;
    targetItemId: string;
  }) {
    const { mergeId, sourceItemId, sourcePrimaryPhotoId, targetItemId } = input;
    const sourcePhotoIds = [...new Set(input.sourcePhotoIds.filter(Boolean))].sort();
    if (!sourceItemId || !targetItemId || sourceItemId === targetItemId) {
      throw new Error('Style duplicate restore requires two distinct item IDs.');
    }
    const tenantId = this.profileKey.tenantId;
    const placeholders = sourcePhotoIds.map(() => '?').join(', ');
    const transferredCount = sourcePhotoIds.length;
    const exactTransferredPredicate = transferredCount
      ? `id IN (${placeholders})`
      : '0 = 1';
    await this.db.batch([
      this.db
        .prepare(
          `SELECT CASE WHEN
             EXISTS (SELECT 1 FROM style_items WHERE tenant_id = ? AND id = ? AND status = 'archived')
             AND EXISTS (SELECT 1 FROM style_items WHERE tenant_id = ? AND id = ? AND status = 'active')
             AND (SELECT COUNT(*) FROM style_item_photos WHERE tenant_id = ? AND item_id = ?) = 0
             AND (SELECT COUNT(*) FROM style_item_photos WHERE tenant_id = ? AND item_id = ? AND ${exactTransferredPredicate}) = ?
             AND EXISTS (
               SELECT 1 FROM style_item_provenance
               WHERE tenant_id = ? AND item_id = ?
                 AND json_extract(source_snapshot_json, '$.duplicateMergeRedirect.targetItemId') = ?
                 AND ((? IS NULL AND json_extract(source_snapshot_json, '$.duplicateMergeRedirect.mergeId') IS NULL) OR json_extract(source_snapshot_json, '$.duplicateMergeRedirect.mergeId') = ?)
                 AND json_extract(source_snapshot_json, '$.duplicateMergeRedirect.undoneAt') IS NULL
             )
             AND EXISTS (
               SELECT 1
               FROM style_item_provenance target_provenance,
                    json_each(target_provenance.source_snapshot_json, '$.duplicateMergeLineage') lineage
               WHERE target_provenance.tenant_id = ? AND target_provenance.item_id = ?
                 AND json_extract(lineage.value, '$.sourceItemId') = ?
                 AND ((? IS NULL AND json_extract(lineage.value, '$.mergeId') IS NULL) OR json_extract(lineage.value, '$.mergeId') = ?)
                 AND json_extract(lineage.value, '$.transferredPhotoIds') = json(?)
             )
             AND NOT EXISTS (
               SELECT 1
               FROM style_item_provenance target_provenance,
                    json_each(target_provenance.source_snapshot_json, '$.duplicateMergeUndos') undo
               WHERE target_provenance.tenant_id = ? AND target_provenance.item_id = ?
                 AND json_extract(undo.value, '$.sourceItemId') = ?
                 AND ? IS NOT NULL AND json_extract(undo.value, '$.mergeId') = ?
             )
           THEN 1 ELSE json_extract('invalid duplicate restore precondition', '$') END AS verified`,
        )
        .bind(
          tenantId,
          sourceItemId,
          tenantId,
          targetItemId,
          tenantId,
          sourceItemId,
          tenantId,
          targetItemId,
          ...sourcePhotoIds,
          transferredCount,
          tenantId,
          sourceItemId,
          targetItemId,
          mergeId,
          mergeId,
          tenantId,
          targetItemId,
          sourceItemId,
          mergeId,
          mergeId,
          JSON.stringify(sourcePhotoIds),
          tenantId,
          targetItemId,
          sourceItemId,
          mergeId,
          mergeId,
        ),
      this.db
        .prepare(
          `UPDATE style_item_photos
           SET item_id = ?,
               is_primary = CASE WHEN id = ? THEN 1 ELSE 0 END,
               updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND item_id = ? AND ${exactTransferredPredicate}`,
        )
        .bind(sourceItemId, sourcePrimaryPhotoId, tenantId, targetItemId, ...sourcePhotoIds),
      this.db
        .prepare(
          `UPDATE style_items
           SET status = 'active', updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND id = ? AND status = 'archived'`,
        )
        .bind(tenantId, sourceItemId),
      this.db
        .prepare(
          `UPDATE style_item_provenance
           SET source_snapshot_json = json_set(
                 source_snapshot_json,
                 '$.duplicateMergeRedirect.undoneAt', CURRENT_TIMESTAMP
               ),
               updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND item_id = ?
             AND json_extract(source_snapshot_json, '$.duplicateMergeRedirect.targetItemId') = ?
             AND ((? IS NULL AND json_extract(source_snapshot_json, '$.duplicateMergeRedirect.mergeId') IS NULL) OR json_extract(source_snapshot_json, '$.duplicateMergeRedirect.mergeId') = ?)
             AND json_extract(source_snapshot_json, '$.duplicateMergeRedirect.undoneAt') IS NULL`,
        )
        .bind(tenantId, sourceItemId, targetItemId, mergeId, mergeId),
      this.db
        .prepare(
          `UPDATE style_item_provenance
           SET source_snapshot_json = json_set(
                 source_snapshot_json,
                 '$.duplicateMergeUndos',
                 json_insert(
                   CASE
                     WHEN json_type(source_snapshot_json, '$.duplicateMergeUndos') = 'array'
                       THEN json_extract(source_snapshot_json, '$.duplicateMergeUndos')
                     ELSE json('[]')
                   END,
                   '$[#]',
                   json_object(
                     'sourceItemId', ?,
                     'mergeId', ?,
                     'undoneAt', CURRENT_TIMESTAMP,
                     'transferredPhotoIds', json(?)
                   )
                 )
               ),
               updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND item_id = ?
             AND EXISTS (
               SELECT 1 FROM json_each(source_snapshot_json, '$.duplicateMergeLineage') lineage
               WHERE json_extract(lineage.value, '$.sourceItemId') = ?
                 AND ((? IS NULL AND json_extract(lineage.value, '$.mergeId') IS NULL) OR json_extract(lineage.value, '$.mergeId') = ?)
             )`,
        )
        .bind(sourceItemId, mergeId, JSON.stringify(sourcePhotoIds), tenantId, targetItemId, sourceItemId, mergeId, mergeId),
      this.db
        .prepare(
          `SELECT CASE WHEN
             EXISTS (SELECT 1 FROM style_items WHERE tenant_id = ? AND id = ? AND status = 'active')
             AND EXISTS (SELECT 1 FROM style_items WHERE tenant_id = ? AND id = ? AND status = 'active')
             AND (SELECT COUNT(*) FROM style_item_photos WHERE tenant_id = ? AND item_id = ?) = ?
             AND (SELECT COUNT(*) FROM style_item_photos WHERE tenant_id = ? AND item_id = ? AND ${exactTransferredPredicate}) = ?
             AND (
               ? IS NULL
               OR EXISTS (
                 SELECT 1 FROM style_item_photos
                 WHERE tenant_id = ? AND item_id = ? AND id = ? AND is_primary = 1
               )
             )
             AND EXISTS (
               SELECT 1 FROM style_item_provenance
               WHERE tenant_id = ? AND item_id = ?
                 AND json_extract(source_snapshot_json, '$.duplicateMergeRedirect.undoneAt') IS NOT NULL
                 AND ((? IS NULL AND json_extract(source_snapshot_json, '$.duplicateMergeRedirect.mergeId') IS NULL) OR json_extract(source_snapshot_json, '$.duplicateMergeRedirect.mergeId') = ?)
             )
             AND EXISTS (
               SELECT 1
               FROM style_item_provenance target_provenance,
                    json_each(target_provenance.source_snapshot_json, '$.duplicateMergeUndos') undo
               WHERE target_provenance.tenant_id = ? AND target_provenance.item_id = ?
                 AND json_extract(undo.value, '$.sourceItemId') = ?
                 AND ((? IS NULL AND json_extract(undo.value, '$.mergeId') IS NULL) OR json_extract(undo.value, '$.mergeId') = ?)
                 AND json_extract(undo.value, '$.transferredPhotoIds') = json(?)
             )
           THEN 1 ELSE json_extract('invalid duplicate restore state', '$') END AS verified`,
        )
        .bind(
          tenantId,
          sourceItemId,
          tenantId,
          targetItemId,
          tenantId,
          sourceItemId,
          transferredCount,
          tenantId,
          sourceItemId,
          ...sourcePhotoIds,
          transferredCount,
          sourcePrimaryPhotoId,
          tenantId,
          sourceItemId,
          sourcePrimaryPhotoId,
          tenantId,
          sourceItemId,
          mergeId,
          mergeId,
          tenantId,
          targetItemId,
          sourceItemId,
          mergeId,
          mergeId,
          JSON.stringify(sourcePhotoIds),
        ),
    ]);
    return {
      restoredPhotoCount: transferredCount,
      sourceStatus: 'active',
      targetStatus: 'active',
    };
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
            `SELECT p.id, p.item_id, p.legacy_photo_id, p.url, p.source_url, p.artifact_id, p.mime_type,
                    p.view, p.kind, p.source, p.captured_at, p.is_primary, p.is_fit, p.bg_removed,
                    p.imported_from, p.created_at,
                    CASE WHEN a.id IS NULL THEN 0 ELSE 1 END AS artifact_exists
             FROM style_item_photos p
             LEFT JOIN artifacts a
               ON a.id = p.artifact_id
              AND a.tenant_id = p.tenant_id
              AND a.domain = 'style'
              AND a.artifact_type IN ('style_photo_original', 'style_original_image')
              AND a.entity_type = 'style_item_photo'
              AND a.entity_id = p.id
             WHERE p.tenant_id = ? AND p.item_id = ?
             ORDER BY p.is_primary DESC, p.created_at ASC, p.id ASC`,
          )
          .bind(this.profileKey.tenantId, itemId)
      : this.db
          .prepare(
            `SELECT p.id, p.item_id, p.legacy_photo_id, p.url, p.source_url, p.artifact_id, p.mime_type,
                    p.view, p.kind, p.source, p.captured_at, p.is_primary, p.is_fit, p.bg_removed,
                    p.imported_from, p.created_at,
                    CASE WHEN a.id IS NULL THEN 0 ELSE 1 END AS artifact_exists
             FROM style_item_photos p
             LEFT JOIN artifacts a
               ON a.id = p.artifact_id
              AND a.tenant_id = p.tenant_id
              AND a.domain = 'style'
              AND a.artifact_type IN ('style_photo_original', 'style_original_image')
              AND a.entity_type = 'style_item_photo'
              AND a.entity_id = p.id
             WHERE p.tenant_id = ?
             ORDER BY p.item_id ASC, p.is_primary DESC, p.created_at ASC, p.id ASC`,
          )
          .bind(this.profileKey.tenantId);

    const result = await statement.all<{
      captured_at: string | null;
      bg_removed: number | boolean | null;
      created_at: string | null;
      artifact_id: string | null;
      artifact_exists: number | boolean | null;
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

  // Atomic append: insert exactly one new photo row for an existing item without deleting or
  // rewriting any other row (so a concurrent write can never be undone by it, and the cover is never
  // touched). ON CONFLICT DO NOTHING makes a repeated add of the same content-addressed id a no-op.
  // Returns true when the row was inserted.
  async appendItemPhoto(
    itemId: string,
    photo: {
      artifactId: string | null;
      bgRemoved: boolean;
      capturedAt: string | null;
      id: string;
      importedFrom: string | null;
      isFit: boolean;
      kind: string | null;
      mimeType: string | null;
      source: string | null;
      sourceUrl: string | null;
      url: string;
      view: string | null;
    },
    // Optional provenance written in the SAME atomic batch (for example the duplicate "use existing"
    // client_token binding), so a committed append is never left without its idempotency record.
    // The provenance was derived from `expected` (the raw row as read, or null for no row): the batch
    // commits only if the row is still exactly that, so concurrent bindings cannot overwrite each
    // other. On a mismatch nothing is written and the caller re-reads and retries.
    provenance?: {
      expected: {
        fieldEvidenceJson: string | null;
        sourceSnapshotJson: string | null;
        technicalMetadataJson: string | null;
      } | null;
      fieldEvidenceJson: string | null;
      sourceSnapshotJson: string | null;
      technicalMetadataJson: string | null;
    },
  ): Promise<boolean> {
    const insert = this.db
      .prepare(
        `INSERT INTO style_item_photos (
          tenant_id, id, item_id, legacy_photo_id, url, source_url, artifact_id, mime_type, view, kind, source, captured_at, is_primary, is_fit, bg_removed, imported_from, created_at
        )
        SELECT ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, CURRENT_TIMESTAMP
        WHERE EXISTS (SELECT 1 FROM style_items WHERE tenant_id = ? AND id = ?)
        ON CONFLICT(tenant_id, id) DO NOTHING`,
      )
      .bind(
        this.profileKey.tenantId,
        photo.id,
        itemId,
        photo.url,
        photo.sourceUrl,
        photo.artifactId,
        photo.mimeType,
        photo.view,
        photo.kind,
        photo.source,
        photo.capturedAt,
        photo.isFit ? 1 : 0,
        photo.bgRemoved ? 1 : 0,
        photo.importedFrom,
        this.profileKey.tenantId,
        itemId,
      );
    const artifactIds = this.photoArtifactIds([photo]);
    const guards = this.photoArtifactGuards(artifactIds);
    if (!provenance) {
      const results = await this.runPhotoBatch(() => this.db.batch([...guards, insert]), artifactIds);
      return Number(results[guards.length]?.meta?.changes ?? 0) === 1;
    }
    const expected = provenance.expected;
    const guard = expected
      ? this.db
          .prepare(
            `SELECT CASE WHEN (
              SELECT COUNT(*) FROM style_item_provenance
              WHERE tenant_id = ? AND item_id = ?
                AND field_evidence_json IS ? AND technical_metadata_json IS ? AND source_snapshot_json IS ?
            ) = 1 THEN 1 ELSE json('style provenance changed concurrently') END AS guard`,
          )
          .bind(this.profileKey.tenantId, itemId, expected.fieldEvidenceJson, expected.technicalMetadataJson, expected.sourceSnapshotJson)
      : this.db
          .prepare(
            `SELECT CASE WHEN (
              SELECT COUNT(*) FROM style_item_provenance WHERE tenant_id = ? AND item_id = ?
            ) = 0 THEN 1 ELSE json('style provenance changed concurrently') END AS guard`,
          )
          .bind(this.profileKey.tenantId, itemId);
    const results = await this.runPhotoBatch(() => this.db.batch([
      ...guards,
      guard,
      insert,
      this.db
        .prepare(
          `INSERT INTO style_item_provenance (
            tenant_id, item_id, field_evidence_json, technical_metadata_json, source_snapshot_json
          )
          SELECT ?, ?, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM style_items WHERE tenant_id = ? AND id = ?)
          ON CONFLICT(tenant_id, item_id) DO UPDATE SET
            field_evidence_json = excluded.field_evidence_json,
            technical_metadata_json = excluded.technical_metadata_json,
            source_snapshot_json = excluded.source_snapshot_json,
            updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(
          this.profileKey.tenantId,
          itemId,
          provenance.fieldEvidenceJson,
          provenance.technicalMetadataJson,
          provenance.sourceSnapshotJson,
          this.profileKey.tenantId,
          itemId,
        ),
    ]), artifactIds);
    return Number(results[guards.length + 1]?.meta?.changes ?? 0) === 1;
  }

  // The raw provenance row, exactly as stored, for revision-checked provenance writes.
  async provenanceRevision(itemId: string): Promise<{
      fieldEvidenceJson: string | null;
      sourceSnapshotJson: string | null;
      technicalMetadataJson: string | null;
    } | null> {
    const row = await this.db
      .prepare(
        `SELECT field_evidence_json, technical_metadata_json, source_snapshot_json
         FROM style_item_provenance WHERE tenant_id = ? AND item_id = ?`,
      )
      .bind(this.profileKey.tenantId, itemId)
      .first<{ field_evidence_json: string | null; source_snapshot_json: string | null; technical_metadata_json: string | null }>();
    return row
      ? {
          fieldEvidenceJson: row.field_evidence_json,
          sourceSnapshotJson: row.source_snapshot_json,
          technicalMetadataJson: row.technical_metadata_json,
        }
      : null;
  }

  // Full-row fingerprint of an item's photo rows: every column the replace path rewrites, derived
  // from the same STYLE_PHOTO_REPLACE_COLUMNS list as its INSERT so the two cannot drift.
  async photoSetFingerprint(itemId: string): Promise<string> {
    const row = await this.db
      .prepare(`SELECT (${STYLE_PHOTO_SET_FINGERPRINT_SQL}) AS value`)
      .bind(this.profileKey.tenantId, itemId)
      .first<{ value: string }>();
    return row?.value ?? '[]';
  }

  async replaceItemPhotos(
    itemId: string,
    photos: Array<{
      bgRemoved: boolean;
      capturedAt: string | null;
      createdAt: string | null;
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
    provenance?: {
      fieldEvidenceJson: string | null;
      sourceSnapshotJson: string | null;
      technicalMetadataJson: string | null;
    },
    expectedPhotoSetFingerprint?: string | null,
  ) {
    const artifactIds = this.photoArtifactIds(photos);
    const statements = [
      ...this.photoArtifactGuards(artifactIds),
      // Optimistic concurrency: when the caller built this photo set from a read, the batch only
      // commits if every photo row is still exactly as read (full tuple: id, url, artifact, source,
      // role flags), not merely the same ids. Otherwise the guard raises a runtime error inside the
      // atomic batch, so nothing is deleted or inserted and no replaced artifact can be restored.
      ...(expectedPhotoSetFingerprint
        ? [
            this.db
              .prepare(
                `SELECT CASE WHEN (${STYLE_PHOTO_SET_FINGERPRINT_SQL}) = ? THEN 1 ELSE json('style photo set changed concurrently') END AS guard`,
              )
              .bind(this.profileKey.tenantId, itemId, expectedPhotoSetFingerprint),
          ]
        : []),
      this.db
        .prepare(`DELETE FROM style_item_photos WHERE tenant_id = ? AND item_id = ?`)
        .bind(this.profileKey.tenantId, itemId),
      ...photos.map((photo) =>
        this.db
          .prepare(
            `INSERT INTO style_item_photos (
              tenant_id, ${STYLE_PHOTO_REPLACE_COLUMNS.join(', ')}
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
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
            photo.createdAt,
          ),
      ),
      ...(provenance
        ? [
            this.db
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
                itemId,
                provenance.fieldEvidenceJson,
                provenance.technicalMetadataJson,
                provenance.sourceSnapshotJson,
              ),
          ]
        : []),
    ];

    // D1 batch and the local SQLite adapter both make the photo replacement and any
    // presentation-quality provenance binding one atomic write.
    await this.runPhotoBatch(() => this.db.batch(statements), artifactIds);
  }

  async listItemPhotoArtifacts(itemId: string) {
    const result = await this.db
      .prepare(
        `SELECT DISTINCT a.id, a.r2_key
         FROM style_item_photos p
         INNER JOIN artifacts a
           ON a.id = p.artifact_id
          AND a.tenant_id = p.tenant_id
          AND a.domain = 'style'
          AND a.artifact_type IN ('style_photo_original', 'style_original_image')
          AND a.entity_type = 'style_item_photo'
          AND a.entity_id = p.id
         WHERE p.tenant_id = ? AND p.item_id = ? AND p.artifact_id IS NOT NULL`,
      )
      .bind(this.profileKey.tenantId, itemId)
      .all<{ id: string; r2_key: string }>();
    return result.results ?? [];
  }

  // Cleanup invariant: a photo row may reference an artifact only while that artifact's row exists or
  // it is already referenced. Cleanup deletes an artifact row only while it is unreferenced, and only
  // then its blob, so a released artifact can never be referenced again. References that already
  // exist pass even when their artifact row is missing (legacy rows), so this never blocks an edit.
  private static readonly PHOTO_ARTIFACT_LIVE_SQL = `(
    EXISTS (SELECT 1 FROM artifacts WHERE id = ? AND tenant_id = ?)
    OR EXISTS (SELECT 1 FROM style_item_photos WHERE artifact_id = ?)
  )`;

  private photoArtifactIds(photos: Array<{ artifactId: string | null }>): string[] {
    return [...new Set(photos.map((photo) => photo.artifactId).filter((id): id is string => Boolean(id)))];
  }

  private photoArtifactGuards(artifactIds: string[]) {
    return artifactIds.map((artifactId) =>
      this.db
        .prepare(
          `SELECT CASE WHEN ${StyleRepository.PHOTO_ARTIFACT_LIVE_SQL}
           THEN 1 ELSE json('style photo artifact was released concurrently') END AS guard`,
        )
        .bind(artifactId, this.profileKey.tenantId, artifactId));
  }

  // Runs a photo-writing batch whose guards come first. A guard failure aborts the whole batch; a
  // released artifact stays released, so re-checking after the failure identifies it reliably.
  private async runPhotoBatch<T>(run: () => Promise<T>, artifactIds: string[]): Promise<T> {
    try {
      return await run();
    } catch (error) {
      for (const artifactId of artifactIds) {
        const live = await this.db
          .prepare(`SELECT CASE WHEN ${StyleRepository.PHOTO_ARTIFACT_LIVE_SQL} THEN 1 ELSE 0 END AS live`)
          .bind(artifactId, this.profileKey.tenantId, artifactId)
          .first<{ live: number }>()
          .catch(() => null);
        if (live && Number(live.live) === 0) throw new StylePhotoArtifactReleasedError();
      }
      throw error;
    }
  }

  async getUnreferencedArtifact(artifactId: string) {
    return this.db
      .prepare(
        `SELECT id, r2_key
         FROM artifacts a
         WHERE a.id = ?
           AND a.tenant_id = ?
           AND a.domain = 'style'
           AND NOT EXISTS (
             SELECT 1 FROM style_item_photos p WHERE p.artifact_id = a.id
           )`,
      )
      .bind(artifactId, this.profileKey.tenantId)
      .first<{ id: string; r2_key: string }>();
  }

  async hasOtherArtifactAtR2Key(artifactId: string, r2Key: string): Promise<boolean> {
    const row = await this.db
      .prepare(`SELECT id FROM artifacts WHERE r2_key = ? AND id <> ? LIMIT 1`)
      .bind(r2Key, artifactId)
      .first<{ id: string }>();
    return Boolean(row);
  }

  // Atomically releases an artifact: deletes its row only while no photo row references it. Returns
  // true only when this call deleted the row, which is the sole permission to delete its blob.
  async deleteArtifactIfUnreferenced(artifactId: string): Promise<boolean> {
    const result = await this.db
      .prepare(
        `DELETE FROM artifacts
         WHERE id = ?
           AND tenant_id = ?
           AND domain = 'style'
           AND NOT EXISTS (
             SELECT 1 FROM style_item_photos p WHERE p.artifact_id = artifacts.id
           )`,
      )
      .bind(artifactId, this.profileKey.tenantId)
      .run();
    return Number(result.meta?.changes ?? 0) === 1;
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
        `INSERT INTO artifacts (id, tenant_id, domain, artifact_type, entity_type, entity_id, r2_key, mime_type, metadata_json)
         VALUES (?, ?, 'style', ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           artifact_type = excluded.artifact_type,
           entity_type = excluded.entity_type,
           entity_id = excluded.entity_id,
           r2_key = excluded.r2_key,
           mime_type = excluded.mime_type,
           metadata_json = excluded.metadata_json
         WHERE artifacts.tenant_id = excluded.tenant_id`,
      )
      .bind(
        input.artifactId,
        this.profileKey.tenantId,
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
    return this.getPhotoDeliveryRowForTenant(this.profileKey.tenantId, photoId);
  }

  async getPhotoDeliveryRowForTenant(tenantId: string, photoId: string) {
    return this.db
      .prepare(
        `SELECT p.id, p.item_id, p.artifact_id, p.mime_type, p.source_url, p.url,
                a.r2_key, a.mime_type AS artifact_mime_type
         FROM style_item_photos p
         LEFT JOIN artifacts a
           ON a.id = p.artifact_id
          AND a.tenant_id = p.tenant_id
          AND a.domain = 'style'
          AND a.artifact_type IN ('style_photo_original', 'style_original_image')
          AND a.entity_type = 'style_item_photo'
          AND a.entity_id = p.id
         WHERE p.tenant_id = ? AND p.id = ?`,
      )
      .bind(tenantId, photoId)
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
    const artifactIds = this.photoArtifactIds([input]);
    await this.runPhotoBatch(() => this.db.batch([
      ...this.photoArtifactGuards(artifactIds),
      this.db
        .prepare(
          `UPDATE style_item_photos
           SET artifact_id = ?,
               mime_type = COALESCE(?, mime_type),
               source_url = COALESCE(source_url, ?, url),
               updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND id = ?`,
        )
        .bind(input.artifactId, input.mimeType, input.sourceUrl, this.profileKey.tenantId, input.photoId),
    ]), artifactIds);
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

  async listProvenanceRows(itemIds: string[]) {
    const uniqueItemIds = Array.from(new Set(itemIds.map((itemId) => itemId.trim()).filter(Boolean)));
    if (uniqueItemIds.length === 0) {
      return [];
    }
    const rows: Array<{
        field_evidence_json: string | null;
        item_id: string;
        source_snapshot_json: string | null;
        technical_metadata_json: string | null;
        updated_at: string | null;
      }> = [];
    // Cloudflare D1 rejects statements with too many bound variables. Keep the
    // tenant predicate on every query and bound the item cohort well below that
    // limit so a 100+ item Closet cannot break setup/context reads.
    for (let offset = 0; offset < uniqueItemIds.length; offset += 48) {
      const batch = uniqueItemIds.slice(offset, offset + 48);
      const placeholders = batch.map(() => '?').join(', ');
      const result = await this.db
        .prepare(
          `SELECT item_id, field_evidence_json, technical_metadata_json, source_snapshot_json, updated_at
           FROM style_item_provenance
           WHERE tenant_id = ? AND item_id IN (${placeholders})`,
        )
        .bind(this.profileKey.tenantId, ...batch)
        .all<{
          field_evidence_json: string | null;
          item_id: string;
          source_snapshot_json: string | null;
          technical_metadata_json: string | null;
          updated_at: string | null;
        }>();
      rows.push(...(result.results ?? []));
    }
    return rows;
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
          source_snapshot_json = CASE
            WHEN json_valid(style_item_provenance.source_snapshot_json)
                 AND json_type(style_item_provenance.source_snapshot_json, '$.duplicateMergeRedirect') = 'object'
              THEN json_set(
                CASE
                  WHEN excluded.source_snapshot_json IS NOT NULL AND json_valid(excluded.source_snapshot_json)
                    THEN excluded.source_snapshot_json
                  ELSE '{}'
                END,
                '$.duplicateMergeRedirect',
                json_extract(style_item_provenance.source_snapshot_json, '$.duplicateMergeRedirect')
              )
            ELSE excluded.source_snapshot_json
          END,
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
