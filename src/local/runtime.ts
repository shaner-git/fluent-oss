import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { homedir } from 'node:os';
import { FLUENT_CONTRACT_VERSION, fluentContractSnapshot } from '../contract';
import type { CoreRuntimeBindings } from '../config';
import type { FluentStorageBackend } from '../config';
import { FLUENT_OWNER_PROFILE_ID, FLUENT_PRIMARY_TENANT_ID } from '../fluent-core';
import { LocalArtifactBucket } from './file-artifacts';
import { SqliteD1Database } from './sqlite-d1';
import {
  defaultLocalScopes,
  ensureLocalTokenState,
  LOCAL_AUTH_MODEL,
  LOCAL_TOKEN_ENV,
  LOCAL_TOKEN_ENV_ALIASES,
  OSS_TOKEN_ENV,
  resolveLocalTokenFile,
} from './auth';

export const LOCAL_DEFAULT_HOST = '127.0.0.1';
export const LOCAL_DEFAULT_PORT = 8788;
export const LOCAL_DB_FILENAME = 'fluent-local.db';

export interface LocalRuntimePaths {
  artifactsDir: string;
  authDir: string;
  dataDir: string;
  dbPath: string;
  rootDir: string;
  tokenFile: string;
}

export interface LocalRuntimeContext {
  env: CoreRuntimeBindings;
  paths: LocalRuntimePaths;
  sqliteDb: SqliteD1Database;
}

export function resolveLocalRuntimePaths(rootDir?: string): LocalRuntimePaths {
  const resolvedRoot = path.resolve(rootDir ?? path.join(homedir(), '.fluent'));
  const dataDir = path.join(resolvedRoot, 'data');
  const artifactsDir = path.join(resolvedRoot, 'artifacts');
  const authDir = path.join(resolvedRoot, 'auth');

  mkdirSync(dataDir, { recursive: true });
  mkdirSync(artifactsDir, { recursive: true });
  mkdirSync(authDir, { recursive: true });

  return {
    artifactsDir,
    authDir,
    dataDir,
    dbPath: path.join(dataDir, LOCAL_DB_FILENAME),
    rootDir: resolvedRoot,
    tokenFile: resolveLocalTokenFile(resolvedRoot),
  };
}

export function createLocalRuntime(options: { origin: string; rootDir?: string }): LocalRuntimeContext {
  const paths = resolveLocalRuntimePaths(options.rootDir);
  const tokenState = ensureLocalTokenState(paths.rootDir);
  const sqliteDb = new SqliteD1Database(paths.dbPath);
  applyMigrations(sqliteDb, findBootstrapFile(), findMigrationFiles());
  applyLocalDefaults(sqliteDb);

  const storageBackend: FluentStorageBackend = 'sqlite-fs';
  const artifacts = new LocalArtifactBucket(paths.artifactsDir);
  const db = sqliteDb;
  const env = Object.assign(
    {
      artifacts,
      authModel: LOCAL_AUTH_MODEL,
      db,
      deploymentTrack: 'oss' as const,
      imageDeliverySecret: tokenState.token,
      localArtifactsDir: paths.artifactsDir,
      publicBaseUrl: options.origin,
      storageBackend,
    } satisfies CoreRuntimeBindings,
    {
      ARTIFACTS: artifacts,
      DB: db,
      IMAGE_DELIVERY_SECRET: tokenState.token,
      LOCAL_ARTIFACTS_DIR: paths.artifactsDir,
      PUBLIC_BASE_URL: options.origin,
    },
  ) as CoreRuntimeBindings;

  return {
    env,
    paths,
    sqliteDb,
  };
}

export function localProbe(origin: string) {
  return {
    auth_model: LOCAL_AUTH_MODEL,
    authorization_required_paths: ['/mcp'],
    configured: {
      has_access_oauth: false,
      has_storage: true,
    },
    contract: fluentContractSnapshot(),
    deploymentTrack: 'oss',
    display_name: 'Fluent OSS',
    icon_url: `${origin}/icon.svg`,
    marker: `fluent-oss-probe-${FLUENT_CONTRACT_VERSION}`,
    legacy_auth_envs: [LOCAL_TOKEN_ENV],
    open_paths: ['/health', '/codex-probe'],
    recommended_auth_env: OSS_TOKEN_ENV,
    storageBackend: 'sqlite-fs',
    supported_auth_envs: [...LOCAL_TOKEN_ENV_ALIASES],
    resources: fluentContractSnapshot().resources,
    required_scopes: defaultLocalScopes(),
    tools: fluentContractSnapshot().tools,
    worker_origin: origin,
  };
}

export function localHealth(origin: string, paths: LocalRuntimePaths) {
  return {
    ok: true,
    auth_model: LOCAL_AUTH_MODEL,
    authorization_required_paths: ['/mcp'],
    has_storage: true,
    deploymentTrack: 'oss',
    local_root: paths.rootDir,
    local_database: paths.dbPath,
    local_token_file: paths.tokenFile,
    public_base_url: origin,
    recommended_auth_env: OSS_TOKEN_ENV,
    storageBackend: 'sqlite-fs',
    supported_auth_envs: [...LOCAL_TOKEN_ENV_ALIASES],
    required_scopes: defaultLocalScopes(),
  };
}

function applyMigrations(db: SqliteD1Database, bootstrapFile: string, migrationFiles: string[]): void {
  db.sqlite.exec(
    `CREATE TABLE IF NOT EXISTS local_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
  );

  const applied = new Set(
    (db.sqlite.prepare('SELECT name FROM local_migrations ORDER BY name ASC').all() as Array<{ name: string }>).map(
      (row) => row.name,
    ),
  );

  if (applied.size === 0 && !hasTable(db, 'fluent_tenants')) {
    db.sqlite.exec(readFileSync(bootstrapFile, 'utf8'));
    const markApplied = db.sqlite.prepare('INSERT INTO local_migrations (name) VALUES (?)');
    markApplied.run(path.basename(bootstrapFile));
    for (const file of migrationFiles) {
      markApplied.run(path.basename(file));
    }
    return;
  }

  for (const file of migrationFiles) {
    const name = path.basename(file);
    if (applied.has(name)) {
      continue;
    }

    const sql = readFileSync(file, 'utf8');
    db.sqlite.exec(sql);
    db.sqlite.prepare('INSERT INTO local_migrations (name) VALUES (?)').run(name);
  }
}

function applyLocalDefaults(db: SqliteD1Database): void {
  db.sqlite
    .prepare(
      `UPDATE fluent_tenants
       SET backend_mode = 'local',
           display_name = 'Fluent OSS',
           metadata_json = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .run(JSON.stringify({ product: 'Fluent OSS', deployment: 'oss', deployment_track: 'oss' }), FLUENT_PRIMARY_TENANT_ID);

  const profileRow = db.sqlite
    .prepare(
      `SELECT metadata_json
       FROM fluent_profile
       WHERE tenant_id = ? AND profile_id = ?`,
    )
    .get(FLUENT_PRIMARY_TENANT_ID, FLUENT_OWNER_PROFILE_ID) as { metadata_json: string | null } | undefined;
  const existingProfileMetadata = profileRow?.metadata_json ? safeParseJson(profileRow.metadata_json) : {};
  const localProfileMetadata = {
    ...(existingProfileMetadata && typeof existingProfileMetadata === 'object' ? existingProfileMetadata : {}),
    backend_mode: 'local',
    deployment: 'oss',
    deployment_track: 'oss',
    product: 'Fluent OSS',
  };

  db.sqlite
    .prepare(
      `UPDATE fluent_profile
       SET metadata_json = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ? AND profile_id = ?`,
    )
    .run(JSON.stringify(localProfileMetadata), FLUENT_PRIMARY_TENANT_ID, FLUENT_OWNER_PROFILE_ID);
}

function findMigrationFiles(): string[] {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const migrationsDir = path.resolve(path.join(moduleDir, '..', '..', 'migrations'));
  return readdirSync(migrationsDir)
    .filter((file) => /^\d+_.*\.sql$/i.test(file))
    .sort()
    .map((file) => path.join(migrationsDir, file));
}

function findBootstrapFile(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(path.join(moduleDir, '..', '..', 'migrations', 'postgres', 'bootstrap.sql'));
}

function hasTable(db: SqliteD1Database, tableName: string): boolean {
  const row = db.sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name?: string } | undefined;
  return row?.name === tableName;
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
