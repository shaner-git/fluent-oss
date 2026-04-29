import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import type { CoreRuntimeBindings, FluentStorageBackend } from '../config';
import { FLUENT_CONTRACT_VERSION, fluentContractSnapshot } from '../contract';
import type {
  FluentBlobHttpMetadata,
  FluentBlobObject,
  FluentBlobStore,
  FluentBlobStorePutOptions,
  FluentDatabase,
  FluentPreparedStatement,
  FluentStatementResult,
} from '../storage';
import {
  defaultLocalScopes,
  ensureLocalTokenState,
  LOCAL_AUTH_MODEL,
  LOCAL_TOKEN_ENV,
  LOCAL_TOKEN_ENV_ALIASES,
  OSS_TOKEN_ENV,
} from '../local/auth';
import { LOCAL_DEFAULT_HOST, LOCAL_DEFAULT_PORT, resolveLocalRuntimePaths, type LocalRuntimePaths } from '../local/runtime';

type PgPrimitive = string | number | boolean | Date | Buffer | Uint8Array | null;

export const EXPERIMENTAL_STORAGE_BACKEND: FluentStorageBackend = 'postgres-s3';
export const EXPERIMENTAL_DEFAULT_HOST = LOCAL_DEFAULT_HOST;
export const EXPERIMENTAL_DEFAULT_PORT = LOCAL_DEFAULT_PORT;

export interface ExperimentalRuntimeContext {
  close(): Promise<void>;
  env: CoreRuntimeBindings;
  paths: LocalRuntimePaths;
  pg: PostgresDatabaseAdapter;
}

export interface ExperimentalRuntimeOptions {
  origin: string;
  rootDir?: string;
}

export class PostgresDatabaseAdapter implements FluentDatabase {
  constructor(readonly pool: Pool) {}

  prepare(query: string): FluentPreparedStatement {
    return new PostgresPreparedStatement(this.pool, query);
  }

  async batch<T = unknown>(statements: FluentPreparedStatement[]): Promise<FluentStatementResult<T>[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const results: FluentStatementResult<T>[] = [];
      for (const statement of statements as PostgresPreparedStatement[]) {
        results.push(await statement.runWithClient<T>(client));
      }
      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async exec(query: string): Promise<{ count: number; duration: number }> {
    await this.pool.query(query);
    return { count: 0, duration: 0 };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

class PostgresPreparedStatement implements FluentPreparedStatement {
  private bindings: PgPrimitive[] = [];

  constructor(
    private readonly pool: Pool,
    private readonly rawQuery: string,
  ) {}

  bind(...values: unknown[]): FluentPreparedStatement {
    const next = new PostgresPreparedStatement(this.pool, this.rawQuery);
    next.bindings = values.map(normalizePgBinding);
    return next;
  }

  async first<T = unknown>(columnName?: string): Promise<T | null> {
    const row = await this.querySingle<QueryResultRow>();
    if (!row) {
      return null;
    }
    if (columnName) {
      return ((row as Record<string, unknown>)[columnName] ?? null) as T | null;
    }
    return row as T;
  }

  async all<T = unknown>(): Promise<{ results: T[] }> {
    const result = await this.pool.query<T & QueryResultRow>(translatePgPlaceholders(this.rawQuery), this.bindings);
    return { results: result.rows as T[] };
  }

  async run<T = unknown>(): Promise<FluentStatementResult<T>> {
    return this.runWithClient<T>(this.pool);
  }

  async runWithClient<T = unknown>(client: Pool | PoolClient): Promise<FluentStatementResult<T>> {
    const result = await client.query<T & QueryResultRow>(translatePgPlaceholders(this.rawQuery), this.bindings);
    return {
      success: true,
      meta: {
        changes: Number(result.rowCount ?? 0),
        last_row_id: extractLastRowId(result.rows[0]),
      },
      results: result.rows as T[],
    };
  }

  private async querySingle<T extends QueryResultRow>(): Promise<T | null> {
    const result = await this.pool.query<T>(translatePgPlaceholders(this.rawQuery), this.bindings);
    return (result.rows[0] as T | undefined) ?? null;
  }
}

export class S3BlobStoreAdapter implements FluentBlobStore {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async get(key: string): Promise<FluentBlobObject | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      const bytes = await response.Body?.transformToByteArray();
      if (!bytes) {
        return null;
      }
      return {
        arrayBuffer: async () => new Uint8Array(bytes).buffer,
        customMetadata: response.Metadata,
        httpMetadata: toFluentBlobHttpMetadata(response),
        key,
        size: Number(response.ContentLength ?? bytes.byteLength),
        uploaded: response.LastModified ?? new Date(),
      };
    } catch (error) {
      if (isMissingS3Key(error)) {
        return null;
      }
      throw error;
    }
  }

  async head(key: string): Promise<Omit<FluentBlobObject, 'arrayBuffer'> | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return {
        customMetadata: response.Metadata,
        httpMetadata: toFluentBlobHttpMetadata(response),
        key,
        size: Number(response.ContentLength ?? 0),
        uploaded: response.LastModified ?? new Date(),
      };
    } catch (error) {
      if (isMissingS3Key(error)) {
        return null;
      }
      throw error;
    }
  }

  async put(key: string, body: BodyInit | null, options?: FluentBlobStorePutOptions): Promise<void> {
    const bytes = await toBlobBytes(body);
    await this.client.send(
      new PutObjectCommand({
        Body: bytes,
        Bucket: this.bucket,
        CacheControl: options?.httpMetadata?.cacheControl,
        ContentDisposition: options?.httpMetadata?.contentDisposition,
        ContentEncoding: options?.httpMetadata?.contentEncoding,
        ContentLanguage: options?.httpMetadata?.contentLanguage,
        ContentType: options?.httpMetadata?.contentType,
        Key: key,
        Metadata: options?.customMetadata,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }
}

export async function createExperimentalRuntime(options: ExperimentalRuntimeOptions): Promise<ExperimentalRuntimeContext> {
  const paths = resolveLocalRuntimePaths(options.rootDir);
  const tokenState = ensureLocalTokenState(paths.rootDir);
  const pool = new Pool({
    connectionString: requiredEnv('FLUENT_POSTGRES_URL'),
  });
  const pg = new PostgresDatabaseAdapter(pool);
  const s3 = new S3Client({
    credentials: {
      accessKeyId: requiredEnv('FLUENT_S3_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnv('FLUENT_S3_SECRET_ACCESS_KEY'),
    },
    endpoint: requiredEnv('FLUENT_S3_ENDPOINT'),
    forcePathStyle: readBooleanEnv('FLUENT_S3_FORCE_PATH_STYLE', true),
    region: process.env.FLUENT_S3_REGION?.trim() || 'us-east-1',
  });
  const bucket = requiredEnv('FLUENT_S3_BUCKET');
  await bootstrapExperimentalStorage(pool, s3, bucket);

  const env: CoreRuntimeBindings = {
    artifacts: new S3BlobStoreAdapter(s3, bucket),
    authModel: LOCAL_AUTH_MODEL,
    db: pg,
    deploymentTrack: 'oss',
    imageDeliverySecret: tokenState.token,
    publicBaseUrl: options.origin,
    storageBackend: EXPERIMENTAL_STORAGE_BACKEND,
  };

  return {
    async close() {
      await pg.close();
    },
    env,
    paths,
    pg,
  };
}

export function experimentalProbe(origin: string) {
  return {
    auth_model: LOCAL_AUTH_MODEL,
    authorization_required_paths: ['/mcp'],
    configured: {
      has_access_oauth: false,
      has_storage: true,
    },
    contract: fluentContractSnapshot(),
    deploymentTrack: 'oss',
    display_name: 'Fluent Experimental',
    icon_url: `${origin}/icon.svg`,
    marker: `fluent-oss-postgres-s3-probe-${FLUENT_CONTRACT_VERSION}`,
    legacy_auth_envs: [LOCAL_TOKEN_ENV],
    open_paths: ['/health', '/codex-probe'],
    recommended_auth_env: OSS_TOKEN_ENV,
    required_scopes: defaultLocalScopes(),
    resources: fluentContractSnapshot().resources,
    storageBackend: EXPERIMENTAL_STORAGE_BACKEND,
    supported_auth_envs: [...LOCAL_TOKEN_ENV_ALIASES],
    tools: fluentContractSnapshot().tools,
    worker_origin: origin,
  };
}

export function experimentalHealth(origin: string, paths: LocalRuntimePaths) {
  return {
    ok: true,
    auth_model: LOCAL_AUTH_MODEL,
    authorization_required_paths: ['/mcp'],
    has_storage: true,
    deploymentTrack: 'oss',
    local_root: paths.rootDir,
    local_token_file: paths.tokenFile,
    postgres_url: redactConnectionString(requiredEnv('FLUENT_POSTGRES_URL')),
    public_base_url: origin,
    recommended_auth_env: OSS_TOKEN_ENV,
    required_scopes: defaultLocalScopes(),
    s3_bucket: requiredEnv('FLUENT_S3_BUCKET'),
    s3_endpoint: requiredEnv('FLUENT_S3_ENDPOINT'),
    storageBackend: EXPERIMENTAL_STORAGE_BACKEND,
    supported_auth_envs: [...LOCAL_TOKEN_ENV_ALIASES],
  };
}

export function experimentalStartupSummary(origin: string, paths: LocalRuntimePaths) {
  return {
    authModel: LOCAL_AUTH_MODEL,
    baseUrl: origin,
    deploymentTrack: 'oss',
    localRoot: paths.rootDir,
    mode: 'oss-experimental',
    ok: true,
    postgresUrl: redactConnectionString(requiredEnv('FLUENT_POSTGRES_URL')),
    s3Bucket: requiredEnv('FLUENT_S3_BUCKET'),
    s3Endpoint: requiredEnv('FLUENT_S3_ENDPOINT'),
    storageBackend: EXPERIMENTAL_STORAGE_BACKEND,
    tokenFile: paths.tokenFile,
  };
}

export function parseExperimentalServerArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      result[key] = next;
      index += 1;
    } else {
      result[key] = 'true';
    }
  }
  return result;
}

export async function checkExperimentalRuntime(origin: string, rootDir?: string) {
  const runtime = await createExperimentalRuntime({ origin, rootDir });
  try {
    return {
      health: experimentalHealth(origin, runtime.paths),
      probe: experimentalProbe(origin),
      startup: experimentalStartupSummary(origin, runtime.paths),
    };
  } finally {
    await runtime.close();
  }
}

async function bootstrapExperimentalStorage(pool: Pool, s3: S3Client, bucket: string): Promise<void> {
  await pool.query(readBootstrapSql());
  await ensureBucket(s3, bucket);
}

function readBootstrapSql(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const bootstrapPath = path.resolve(path.join(moduleDir, '..', '..', 'migrations', 'postgres', 'bootstrap.sql'));
  return readFileSync(bootstrapPath, 'utf8');
}

async function ensureBucket(client: S3Client, bucket: string): Promise<void> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required experimental OSS env var: ${name}`);
  }
  return value;
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(value);
}

function translatePgPlaceholders(query: string): string {
  let index = 0;
  return query.replace(/\?/g, () => `$${++index}`);
}

function normalizePgBinding(value: unknown): PgPrimitive {
  if (value === undefined) {
    return null;
  }
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value instanceof Date ||
    Buffer.isBuffer(value)
  ) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return JSON.stringify(value);
}

function extractLastRowId(row: QueryResultRow | undefined): number {
  const candidate = row && typeof row === 'object' ? (row as Record<string, unknown>).id : undefined;
  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
    return candidate;
  }
  if (typeof candidate === 'string') {
    const parsed = Number(candidate);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toFluentBlobHttpMetadata(input: {
  CacheControl?: string;
  ContentDisposition?: string;
  ContentEncoding?: string;
  ContentLanguage?: string;
  ContentType?: string;
  Expires?: Date;
}): FluentBlobHttpMetadata | undefined {
  return {
    cacheControl: input.CacheControl,
    cacheExpiry: input.Expires?.toISOString(),
    contentDisposition: input.ContentDisposition,
    contentEncoding: input.ContentEncoding,
    contentLanguage: input.ContentLanguage,
    contentType: input.ContentType,
  };
}

async function toBlobBytes(value: BodyInit | null): Promise<Uint8Array> {
  if (value == null) {
    return new Uint8Array();
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
  if (typeof value === 'string') {
    return new TextEncoder().encode(value);
  }
  return new Uint8Array(await new Response(value).arrayBuffer());
}

function isMissingS3Key(error: unknown): boolean {
  const code = typeof error === 'object' && error && '$metadata' in error ? (error as { name?: string }).name : undefined;
  return code === 'NoSuchKey' || code === 'NotFound';
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
