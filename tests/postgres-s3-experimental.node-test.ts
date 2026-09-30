import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { ListBucketsCommand, S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Client } from 'pg';

const docker = resolveDockerBinary();
if (!docker) {
  if (process.env.FLUENT_REQUIRE_DOCKER === 'true') {
    throw new Error('experimental postgres+s3 requires Docker, but Docker is unavailable.');
  }
  console.log('experimental postgres+s3 skipped (docker unavailable)');
  process.exit(0);
}

const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const postgresContainer = `fluent-pg-${suffix}`;
// S3-compatible store for the test. MinIO's images are no longer anonymously pullable (Docker Hub
// and quay.io both deny pulls), so this uses SeaweedFS's S3 gateway, pinned for reproducibility.
// An explicit identity makes bucket creation and runtime object reads validate the test keys.
const S3_IMAGE = 'chrislusf/seaweedfs:4.05';
const S3_ACCESS_KEY_ID = 'fluent-test';
const S3_SECRET_ACCESS_KEY = 'fluent-test-secret';
const s3Container = `fluent-s3-${suffix}`;
const postgresPort = String(25000 + Math.floor(Math.random() * 500));
const s3Port = String(26000 + Math.floor(Math.random() * 500));
const appPort = String(27000 + Math.floor(Math.random() * 500));
const rootDir = mkdtempSync(path.join(tmpdir(), 'fluent-oss-postgres-s3-'));

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  let server: ReturnType<typeof spawn> | null = null;
  try {
    const s3ConfigPath = path.join(rootDir, 'seaweedfs-s3.json');
    writeFileSync(s3ConfigPath, JSON.stringify({
      identities: [{
        name: 'fluent-test',
        credentials: [{ accessKey: S3_ACCESS_KEY_ID, secretKey: S3_SECRET_ACCESS_KEY }],
        actions: ['Admin', 'Read', 'List', 'Write'],
      }],
    }));
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
      s3Container,
      '--mount',
      `type=bind,source=${s3ConfigPath},target=/etc/fluent-s3.json,readonly`,
      '-p',
      `${s3Port}:8333`,
      S3_IMAGE,
      'server',
      '-s3',
      '-s3.config=/etc/fluent-s3.json',
      '-dir=/data',
    ]);

    await waitForPostgres();
    await waitForS3();
    await rejectsInvalidS3Credentials();

    server = spawn(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['tsx', 'src/experimental/postgres-s3-server.ts', '--host', '127.0.0.1', '--port', appPort, '--root', rootDir],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          FLUENT_POSTGRES_URL: `postgres://fluent:fluent@127.0.0.1:${postgresPort}/fluent`,
          FLUENT_S3_ACCESS_KEY_ID: S3_ACCESS_KEY_ID,
          FLUENT_S3_BUCKET: 'fluent-oss',
          FLUENT_S3_ENDPOINT: `http://127.0.0.1:${s3Port}`,
          FLUENT_S3_FORCE_PATH_STYLE: 'true',
          FLUENT_S3_REGION: 'us-east-1',
          FLUENT_S3_SECRET_ACCESS_KEY: S3_SECRET_ACCESS_KEY,
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
    const s3 = s3Client();
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
        `INSERT INTO artifacts (id, tenant_id, domain, artifact_type, entity_type, entity_id, r2_key, mime_type)
         VALUES ('artifact:test', 'primary', 'style', 'style_photo_original', 'style_item_photo', 'style-photo:test', $1, 'image/png')
         ON CONFLICT (id) DO UPDATE SET tenant_id = excluded.tenant_id, r2_key = excluded.r2_key, mime_type = excluded.mime_type`,
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
    safeDocker(['rm', '-f', s3Container]);
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

function s3Client(accessKeyId = S3_ACCESS_KEY_ID, secretAccessKey = S3_SECRET_ACCESS_KEY): S3Client {
  return new S3Client({
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    endpoint: `http://127.0.0.1:${s3Port}`,
    forcePathStyle: true,
    region: 'us-east-1',
  });
}

// Fail closed if the identity file is ignored or the fixture stops checking SigV4.
// Require actual S3 auth errors: a connection failure is not credential coverage.
async function rejectsInvalidS3Credentials(): Promise<void> {
  const anonymous = await fetch(`http://127.0.0.1:${s3Port}/`);
  assert.equal(anonymous.status, 403, 'SeaweedFS must reject unsigned requests.');
  assert.match(await anonymous.text(), /<Code>AccessDenied<\/Code>/);

  for (const [accessKeyId, secretAccessKey, errorName] of [
    ['invalid-access-key', S3_SECRET_ACCESS_KEY, 'InvalidAccessKeyId'],
    [S3_ACCESS_KEY_ID, 'invalid-secret-key', 'SignatureDoesNotMatch'],
  ]) {
    const client = s3Client(accessKeyId, secretAccessKey);
    try {
      await assert.rejects(client.send(new ListBucketsCommand({})), (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.name, errorName);
        assert.equal((error as Error & { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode, 403);
        return true;
      }, `SeaweedFS must reject ${errorName}.`);
    } finally {
      client.destroy();
    }
  }
}

// Ready when the S3 API itself answers, independent of any server-specific health URL.
async function waitForS3(): Promise<void> {
  const deadline = Date.now() + 90_000;
  const client = s3Client();
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      await client.send(new ListBucketsCommand({}));
      return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw lastError instanceof Error ? lastError : new Error('Timed out waiting for the S3 API.');
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
    body: await response.json() as { storageBackend?: string },
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
