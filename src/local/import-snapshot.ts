import { FLUENT_OWNER_PROFILE_ID, FLUENT_PRIMARY_TENANT_ID } from '../fluent-core';
import type { SqliteD1Database } from './sqlite-d1';

export interface HostedSnapshotTables {
  [table: string]: Array<Record<string, unknown>>;
}

export interface ImportSnapshotResult {
  importedTables: number;
  relabeledProfileMetadata: Record<string, unknown>;
  violations: Array<Record<string, unknown>>;
}

export function importHostedSnapshotIntoLocalDb(
  db: SqliteD1Database,
  tables: HostedSnapshotTables,
): ImportSnapshotResult {
  const tableNames = Object.keys(tables);

  db.sqlite.exec('PRAGMA foreign_keys = OFF;');
  db.sqlite.exec('BEGIN IMMEDIATE;');

  try {
    clearTables(db, tableNames);
    for (const table of tableNames) {
      insertRows(db, table, tables[table] ?? []);
    }

    relabelTenantAsLocal(db);
    const relabeledProfileMetadata = relabelProfileAsLocal(db);
    const violations = db.sqlite.prepare('PRAGMA foreign_key_check').all() as Array<Record<string, unknown>>;
    if (violations.length > 0) {
      throw new SnapshotImportError('Foreign key violations detected during local snapshot import.', violations);
    }

    db.sqlite.exec('COMMIT;');
    return {
      importedTables: tableNames.length,
      relabeledProfileMetadata,
      violations,
    };
  } catch (error) {
    try {
      db.sqlite.exec('ROLLBACK;');
    } catch {
      // Ignore secondary rollback errors so the original failure surfaces.
    }
    throw error;
  } finally {
    db.sqlite.exec('PRAGMA foreign_keys = ON;');
  }
}

export class SnapshotImportError extends Error {
  constructor(message: string, readonly violations: Array<Record<string, unknown>> = []) {
    super(message);
    this.name = 'SnapshotImportError';
  }
}

function relabelTenantAsLocal(db: SqliteD1Database): void {
  db.sqlite
    .prepare(
      `UPDATE fluent_tenants
       SET backend_mode = ?, display_name = ?, metadata_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .run(
      'local',
      'Fluent OSS',
      JSON.stringify({ product: 'Fluent OSS', deployment: 'oss', deployment_track: 'oss', imported_from: 'cloud' }),
      FLUENT_PRIMARY_TENANT_ID,
    );
}

function relabelProfileAsLocal(db: SqliteD1Database): Record<string, unknown> {
  const row = db.sqlite
    .prepare(
      `SELECT metadata_json
       FROM fluent_profile
       WHERE tenant_id = ? AND profile_id = ?`,
    )
    .get(FLUENT_PRIMARY_TENANT_ID, FLUENT_OWNER_PROFILE_ID) as { metadata_json: string | null } | undefined;

  const existingMetadata = row?.metadata_json ? safeParseJson(row.metadata_json) : {};
  const nextMetadata = {
    ...(existingMetadata && typeof existingMetadata === 'object' ? existingMetadata : {}),
    backend_mode: 'local',
    deployment: 'oss',
    deployment_track: 'oss',
    product: 'Fluent OSS',
  };

  db.sqlite
    .prepare(
      `UPDATE fluent_profile
       SET metadata_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ? AND profile_id = ?`,
    )
    .run(JSON.stringify(nextMetadata), FLUENT_PRIMARY_TENANT_ID, FLUENT_OWNER_PROFILE_ID);

  return nextMetadata;
}

function clearTables(db: SqliteD1Database, tables: string[]) {
  const reversed = [...tables].reverse();
  for (const table of reversed) {
    db.sqlite.prepare(`DELETE FROM ${table}`).run();
  }
}

function insertRows(db: SqliteD1Database, table: string, rows: Record<string, unknown>[]) {
  for (const row of rows) {
    const columns = Object.keys(row);
    if (columns.length === 0) {
      continue;
    }
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
    db.sqlite.prepare(sql).run(...columns.map((column) => normalizeValue(row[column])));
  }
}

function normalizeValue(value: unknown): string | number | bigint | Uint8Array | null {
  if (value === undefined) {
    return null;
  }
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return value;
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return JSON.stringify(value);
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
