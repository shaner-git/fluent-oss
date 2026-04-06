import type { FluentDatabase } from '../src/storage';
import { FLUENT_OWNER_PROFILE_ID, FLUENT_PRIMARY_TENANT_ID } from '../src/fluent-core';
import { createLocalRuntime, type LocalRuntimePaths } from '../src/local/runtime';
import { createExperimentalRuntime } from '../src/experimental/runtime';
import type { FluentSnapshot } from './snapshot-support';

export type OssSnapshotBackend = 'sqlite-fs' | 'postgres-s3';

export interface OssSnapshotRuntime {
  backend: OssSnapshotBackend;
  close(): Promise<void>;
  databaseDescriptor: string;
  db: FluentDatabase;
  paths: LocalRuntimePaths;
}

export async function createOssSnapshotRuntime(options: {
  backend?: string;
  cwd?: string;
  origin?: string;
  root?: string;
}): Promise<OssSnapshotRuntime> {
  const backend = normalizeOssSnapshotBackend(options.backend);
  if (backend === 'postgres-s3') {
    const runtime = await createExperimentalRuntime({
      origin: options.origin ?? 'http://127.0.0.1:8788',
      rootDir: options.root,
    });
    return {
      backend,
      async close() {
        await runtime.close();
      },
      databaseDescriptor: redactConnectionString(process.env.FLUENT_POSTGRES_URL ?? 'postgres://unknown'),
      db: runtime.env.db,
      paths: runtime.paths,
    };
  }

  const runtime = createLocalRuntime({
    origin: options.origin ?? 'http://127.0.0.1:8788',
    rootDir: options.root,
  });
  return {
    backend,
    async close() {
      runtime.sqliteDb.close();
    },
    databaseDescriptor: runtime.paths.dbPath,
    db: runtime.env.db,
    paths: runtime.paths,
  };
}

export async function exportSnapshotTables(
  db: FluentDatabase,
  tables: readonly string[],
): Promise<Record<string, Array<Record<string, unknown>>>> {
  const snapshotTables: Record<string, Array<Record<string, unknown>>> = {};
  for (const table of tables) {
    const result = await db.prepare(`SELECT * FROM ${table}`).all<Record<string, unknown>>();
    snapshotTables[table] = result.results ?? [];
  }
  return snapshotTables;
}

export async function importSnapshotIntoDatabase(
  db: FluentDatabase,
  snapshot: Pick<FluentSnapshot, 'tables'>,
): Promise<{ importedTables: number; relabeledProfileMetadata: Record<string, unknown> }> {
  const tableNames = Object.keys(snapshot.tables ?? {});
  if (!db.exec) {
    throw new Error('Snapshot import requires a database adapter that supports exec().');
  }

  await db.exec('BEGIN');
  try {
    for (const table of [...tableNames].reverse()) {
      await db.prepare(`DELETE FROM ${table}`).run();
    }

    for (const table of tableNames) {
      for (const row of snapshot.tables[table] ?? []) {
        const columns = Object.keys(row);
        if (columns.length === 0) {
          continue;
        }
        const placeholders = columns.map(() => '?').join(', ');
        await db
          .prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`)
          .bind(...columns.map((column) => normalizeSnapshotValue(row[column])))
          .run();
      }
    }

    await db
      .prepare(
        `UPDATE fluent_tenants
         SET backend_mode = ?, display_name = ?, metadata_json = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(
        'local',
        'Fluent OSS',
        JSON.stringify({ product: 'Fluent OSS', deployment: 'oss', deployment_track: 'oss', imported_from: 'cloud' }),
        FLUENT_PRIMARY_TENANT_ID,
      )
      .run();

    const currentProfile = await db
      .prepare(
        `SELECT metadata_json
         FROM fluent_profile
         WHERE tenant_id = ? AND profile_id = ?`,
      )
      .bind(FLUENT_PRIMARY_TENANT_ID, FLUENT_OWNER_PROFILE_ID)
      .first<{ metadata_json: string | null }>();
    const relabeledProfileMetadata = {
      ...(safeParseRecord(currentProfile?.metadata_json) ?? {}),
      backend_mode: 'local',
      deployment: 'oss',
      deployment_track: 'oss',
      product: 'Fluent OSS',
    };
    await db
      .prepare(
        `UPDATE fluent_profile
         SET metadata_json = ?, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = ? AND profile_id = ?`,
      )
      .bind(JSON.stringify(relabeledProfileMetadata), FLUENT_PRIMARY_TENANT_ID, FLUENT_OWNER_PROFILE_ID)
      .run();

    await db.exec('COMMIT');
    return {
      importedTables: tableNames.length,
      relabeledProfileMetadata,
    };
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

export function normalizeOssSnapshotBackend(value: string | undefined): OssSnapshotBackend {
  return value === 'postgres-s3' ? 'postgres-s3' : 'sqlite-fs';
}

function normalizeSnapshotValue(value: unknown): string | number | bigint | Uint8Array | null {
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
  return JSON.stringify(value);
}

function redactConnectionString(value: string): string {
  try {
    const url = new URL(value);
    if (url.password) {
      url.password = '***';
    }
    return url.toString();
  } catch {
    return value.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
  }
}

function safeParseRecord(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
