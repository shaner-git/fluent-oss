import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  FLUENT_CONTRACT_FREEZE,
  FLUENT_CONTRACT_VERSION,
  FLUENT_OPTIONAL_CAPABILITIES,
  FLUENT_RESOURCE_URIS,
  FLUENT_TOOL_NAMES,
} from '../src/contract';
import { importHostedSnapshotIntoLocalDb, SnapshotImportError } from '../src/local/import-snapshot';
import { createLocalRuntime } from '../src/local/runtime';

const tempRoots: string[] = [];

try {
  validatesFrozenContractArtifact();
  relabelsImportedProfileMetadataAsLocal();
  rollsBackWhenInsertsFailPartwayThroughImport();
  rollsBackAndReportsForeignKeyViolations();
} finally {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }
}

function validatesFrozenContractArtifact() {
  const artifact = JSON.parse(
    readRepoFile(path.join('contracts', 'fluent-contract.v1.json')),
  ) as Record<string, unknown>;

  assert.deepEqual(artifact, {
    contractVersion: FLUENT_CONTRACT_VERSION,
    optionalCapabilities: [...FLUENT_OPTIONAL_CAPABILITIES],
    resources: [...FLUENT_RESOURCE_URIS],
    tools: [...FLUENT_TOOL_NAMES],
    freeze: FLUENT_CONTRACT_FREEZE,
  });
}

function relabelsImportedProfileMetadataAsLocal() {
  const runtime = createTempRuntime();
  try {
    const snapshot = {
      fluent_tenants: [
        {
          id: 'primary',
          slug: 'primary',
          display_name: 'Hosted Fluent',
          backend_mode: 'hosted',
          status: 'active',
          onboarding_state: 'onboarding_completed',
          onboarding_version: '1',
          metadata_json: JSON.stringify({ product: 'Fluent', deployment: 'hosted' }),
          created_at: '2026-03-27 00:00:00',
          updated_at: '2026-03-27 00:00:00',
        },
      ],
      fluent_profile: [
        {
          tenant_id: 'primary',
          profile_id: 'owner',
          display_name: 'Riley Example',
          timezone: 'America/Toronto',
          metadata_json: JSON.stringify({ backend_mode: 'hosted', product: 'Fluent' }),
          created_at: '2026-03-27 00:00:00',
          updated_at: '2026-03-27 00:00:00',
        },
      ],
    };

    const result = importHostedSnapshotIntoLocalDb(runtime.sqliteDb, snapshot);
    assert.equal(result.importedTables, 2);
    assert.deepEqual(
      result.relabeledProfileMetadata,
      {
        backend_mode: 'local',
        deployment: 'oss',
        deployment_track: 'oss',
        product: 'Fluent OSS',
      },
    );

    const row = runtime.sqliteDb.sqlite
      .prepare('SELECT metadata_json FROM fluent_profile WHERE tenant_id = ? AND profile_id = ?')
      .get('primary', 'owner') as { metadata_json: string } | undefined;
    assert.deepEqual(JSON.parse(row?.metadata_json ?? '{}'), {
      backend_mode: 'local',
      deployment: 'oss',
      deployment_track: 'oss',
      product: 'Fluent OSS',
    });
  } finally {
    runtime.sqliteDb.close();
  }
}

function rollsBackWhenInsertsFailPartwayThroughImport() {
  const runtime = createTempRuntime();
  try {
    const beforeTenantCount = scalar(runtime.sqliteDb.sqlite, 'SELECT COUNT(*) AS count FROM fluent_tenants');
    const beforeProfileCount = scalar(runtime.sqliteDb.sqlite, 'SELECT COUNT(*) AS count FROM fluent_profile');

    assert.throws(
      () =>
        importHostedSnapshotIntoLocalDb(runtime.sqliteDb, {
          fluent_tenants: [
            {
              id: 'primary',
              slug: 'primary',
              display_name: 'Fluent OSS',
              backend_mode: 'local',
              status: 'active',
              onboarding_state: 'onboarding_completed',
              onboarding_version: '1',
              metadata_json: JSON.stringify({ product: 'Fluent OSS', deployment: 'oss', deployment_track: 'oss' }),
              created_at: '2026-03-27 00:00:00',
              updated_at: '2026-03-27 00:00:00',
            },
          ],
          fluent_profile: [
            {
              tenant_id: 'primary',
              profile_id: 'owner',
              display_name: 'Owner One',
              timezone: 'America/Toronto',
              metadata_json: JSON.stringify({ backend_mode: 'hosted' }),
              created_at: '2026-03-27 00:00:00',
              updated_at: '2026-03-27 00:00:00',
            },
            {
              tenant_id: 'primary',
              profile_id: 'owner',
              display_name: 'Owner Two',
              timezone: 'America/Toronto',
              metadata_json: JSON.stringify({ backend_mode: 'hosted' }),
              created_at: '2026-03-27 00:00:01',
              updated_at: '2026-03-27 00:00:01',
            },
          ],
        }),
    );

    assert.equal(scalar(runtime.sqliteDb.sqlite, 'SELECT COUNT(*) AS count FROM fluent_tenants'), beforeTenantCount);
    assert.equal(scalar(runtime.sqliteDb.sqlite, 'SELECT COUNT(*) AS count FROM fluent_profile'), beforeProfileCount);
  } finally {
    runtime.sqliteDb.close();
  }
}

function rollsBackAndReportsForeignKeyViolations() {
  const runtime = createTempRuntime();
  try {
    const beforeProfileCount = scalar(runtime.sqliteDb.sqlite, 'SELECT COUNT(*) AS count FROM fluent_profile');

    assert.throws(
      () =>
        importHostedSnapshotIntoLocalDb(runtime.sqliteDb, {
          fluent_tenants: [],
          fluent_profile: [
            {
              tenant_id: 'missing-tenant',
              profile_id: 'owner',
              display_name: 'Broken Owner',
              timezone: 'America/Toronto',
              metadata_json: JSON.stringify({ backend_mode: 'hosted' }),
              created_at: '2026-03-27 00:00:00',
              updated_at: '2026-03-27 00:00:00',
            },
          ],
        }),
      (error) => error instanceof SnapshotImportError && error.violations.length > 0,
    );

    assert.equal(scalar(runtime.sqliteDb.sqlite, 'SELECT COUNT(*) AS count FROM fluent_profile'), beforeProfileCount);
  } finally {
    runtime.sqliteDb.close();
  }
}

function createTempRuntime() {
  const root = mkdtempSync(path.join(tmpdir(), 'fluent-local-import-'));
  tempRoots.push(root);
  return createLocalRuntime({
    origin: 'http://127.0.0.1:8788',
    rootDir: root,
  });
}

function scalar(db: import('node:sqlite').DatabaseSync, sql: string): number {
  const row = db.prepare(sql).get() as { count: number } | undefined;
  return Number(row?.count ?? 0);
}

function readRepoFile(relativePath: string) {
  return readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}
