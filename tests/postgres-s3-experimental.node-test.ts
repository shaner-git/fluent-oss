import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Client } from 'pg';

const docker = resolveDockerBinary();
if (!docker) {
  console.log('experimental postgres+s3 skipped (docker unavailable)');
  process.exit(0);
}

const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const postgresContainer = `fluent-pg-${suffix}`;
const minioContainer = `fluent-minio-${suffix}`;
const postgresPort = String(25000 + Math.floor(Math.random() * 500));
const minioPort = String(26000 + Math.floor(Math.random() * 500));
const appPort = String(27000 + Math.floor(Math.random() * 500));
const rootDir = mkdtempSync(path.join(tmpdir(), 'fluent-oss-postgres-s3-'));

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  let server: ReturnType<typeof spawn> | null = null;
  try {
    execDocker([
      'run',
      '-d',
      '--name',
      postgresContainer,
      '-e',
      'POSTGRES_USER=fluent',
      '-e',
      'POSTGRES_PASSWORD=fluent',
      '-e',
      'POSTGRES_DB=fluent',
      '-p',
      `${postgresPort}:5432`,
      'postgres:16-alpine',
    ]);
    execDocker([
      'run',
      '-d',
      '--name',
      minioContainer,
      '-e',
      'MINIO_ROOT_USER=minioadmin',
      '-e',
      'MINIO_ROOT_PASSWORD=minioadmin',
      '-p',
      `${minioPort}:9000`,
      'minio/minio',
      'server',
      '/data',
    ]);

    await waitForPostgres();
    await waitForHttp(`http://127.0.0.1:${minioPort}/minio/health/ready`);

    server = spawn(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['tsx', 'src/experimental/postgres-s3-server.ts', '--host', '127.0.0.1', '--port', appPort, '--root', rootDir],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          FLUENT_POSTGRES_URL: `postgres://fluent:fluent@127.0.0.1:${postgresPort}/fluent`,
          FLUENT_S3_ACCESS_KEY_ID: 'minioadmin',
          FLUENT_S3_BUCKET: 'fluent-oss',
          FLUENT_S3_ENDPOINT: `http://127.0.0.1:${minioPort}`,
          FLUENT_S3_FORCE_PATH_STYLE: 'true',
          FLUENT_S3_REGION: 'us-east-1',
          FLUENT_S3_SECRET_ACCESS_KEY: 'minioadmin',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    await waitForHttp(`http://127.0.0.1:${appPort}/health`);

    const [health, probe, mcp] = await Promise.all([
      fetchJson(`http://127.0.0.1:${appPort}/health`),
      fetchJson(`http://127.0.0.1:${appPort}/codex-probe`),
      fetch(`http://127.0.0.1:${appPort}/mcp`),
    ]);

    assert.equal(health.ok, true);
    assert.equal(health.body?.storageBackend, 'postgres-s3');
    assert.equal(probe.ok, true);
    assert.equal(probe.body?.storageBackend, 'postgres-s3');
    assert.equal(mcp.status, 401);

    const token = JSON.parse(readFileSync(path.join(rootDir, 'auth', 'oss-access-token.json'), 'utf8')) as {
      token: string;
    };
    const objectKey = 'style/test-photo.png';
    const s3 = new S3Client({
      credentials: {
        accessKeyId: 'minioadmin',
        secretAccessKey: 'minioadmin',
      },
      endpoint: `http://127.0.0.1:${minioPort}`,
      forcePathStyle: true,
      region: 'us-east-1',
    });
    await s3.send(
      new PutObjectCommand({
        Body: new Uint8Array([137, 80, 78, 71]),
        Bucket: 'fluent-oss',
        ContentType: 'image/png',
        Key: objectKey,
      }),
    );

    const pg = new Client({
      connectionString: `postgres://fluent:fluent@127.0.0.1:${postgresPort}/fluent`,
    });
    await pg.connect();
    try {
      await pg.query(
        `INSERT INTO style_items (tenant_id, id, name, status)
         VALUES ('primary', 'style-item:test', 'Test item', 'active')
         ON CONFLICT (tenant_id, id) DO NOTHING`,
      );
      await pg.query(
        `INSERT INTO artifacts (id, domain, artifact_type, entity_type, entity_id, r2_key, mime_type)
         VALUES ('artifact:test', 'style', 'style_photo_original', 'style_item_photo', 'style-photo:test', $1, 'image/png')
         ON CONFLICT (id) DO UPDATE SET r2_key = excluded.r2_key, mime_type = excluded.mime_type`,
        [objectKey],
      );
      await pg.query(
        `INSERT INTO style_item_photos (
           tenant_id, id, item_id, url, source_url, artifact_id, mime_type, source, is_primary, is_fit, bg_removed
         ) VALUES (
           'primary', 'style-photo:test', 'style-item:test', 'artifact:style-photo:test', 'artifact:style-photo:test', 'artifact:test', 'image/png', 'imported', 1, 0, 0
         )
         ON CONFLICT (tenant_id, id) DO UPDATE SET artifact_id = excluded.artifact_id, mime_type = excluded.mime_type`,
      );
    } finally {
      await pg.end();
    }

    const styleImage = await fetch(`http://127.0.0.1:${appPort}/images/style/style-photo%3Atest/original`, {
      headers: {
        authorization: `Bearer ${token.token}`,
      },
    });
    assert.equal(styleImage.status, 200);
    assert.equal(styleImage.headers.get('content-type'), 'image/png');
    assert.deepEqual(new Uint8Array(await styleImage.arrayBuffer()), new Uint8Array([137, 80, 78, 71]));
  } finally {
    if (server) {
      server.kill('SIGTERM');
    }
    safeDocker(['rm', '-f', postgresContainer]);
    safeDocker(['rm', '-f', minioContainer]);
    rmSync(rootDir, { force: true, recursive: true });
  }

  console.log('experimental postgres+s3 ok');
}

async function waitForPostgres(): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const result = spawnSync(docker!, ['exec', postgresContainer, 'pg_isready', '-U', 'fluent'], {
      stdio: 'ignore',
    });
    if (result.status === 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('Timed out waiting for Postgres readiness.');
}

async function waitForHttp(url: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`HTTP ${response.status} from ${url}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw lastError instanceof Error ? lastError : new Error(`Timed out waiting for ${url}`);
}

async function fetchJson(url: string) {
  const response = await fetch(url);
  return {
    body: await response.json(),
    ok: response.ok,
    status: response.status,
  };
}

function resolveDockerBinary(): string | null {
  const result = spawnSync('docker', ['version'], { stdio: 'ignore' });
  return result.status === 0 ? 'docker' : null;
}

function execDocker(args: string[]): string {
  return execFileSync(docker!, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function safeDocker(args: string[]): void {
  try {
    execDocker(args);
  } catch {
    // Best-effort cleanup.
  }
}
