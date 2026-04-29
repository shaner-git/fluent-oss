import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createOssSnapshot } from '../scripts/export-oss-snapshot';
import { importSnapshotIntoOss } from '../scripts/import-snapshot-support';
import { FLUENT_OSS_DEFAULT_PROFILE_ID, FLUENT_OSS_DEFAULT_TENANT_ID } from '../src/fluent-identity';
import { createLocalRuntime } from '../src/local/runtime';

const tempRoots: string[] = [];

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  try {
    await exportsCloudCompatibleOssSnapshotShape();
    await roundTripsOssSnapshotIntoFreshRoot();
  } finally {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (root) {
        rmSync(root, { force: true, recursive: true });
      }
    }
  }
  console.log('oss snapshot ok');
}

async function exportsCloudCompatibleOssSnapshotShape() {
  const root = createTempRoot('fluent-oss-snapshot-');
  const runtime = createLocalRuntime({
    origin: 'http://127.0.0.1:8788',
    rootDir: root,
  });
  runtime.sqliteDb.close();

  const { snapshot } = await createOssSnapshot({ root });
  assert.equal(snapshot.backend_mode, 'local');
  assert.equal(snapshot.deployment_track, 'oss');
  assert.equal(typeof snapshot.database, 'string');
  assert.equal(typeof snapshot.created_at, 'string');
  assert.equal(typeof snapshot.contract_version, 'string');
  assert.equal(Array.isArray(snapshot.tables.fluent_tenants), true);
  assert.equal(Array.isArray(snapshot.tables.fluent_profile), true);
  assert.equal(Array.isArray(snapshot.tables.meal_recipes), true);
}

async function roundTripsOssSnapshotIntoFreshRoot() {
  const sourceRoot = createTempRoot('fluent-oss-export-');
  const targetRoot = createTempRoot('fluent-oss-import-');

  const sourceRuntime = createLocalRuntime({
    origin: 'http://127.0.0.1:8788',
    rootDir: sourceRoot,
  });
  try {
    sourceRuntime.sqliteDb.sqlite
      .prepare(
        `UPDATE fluent_profile
         SET display_name = ?, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = ? AND profile_id = ?`,
      )
      .run('OSS Snapshot Owner', FLUENT_OSS_DEFAULT_TENANT_ID, FLUENT_OSS_DEFAULT_PROFILE_ID);
  } finally {
    sourceRuntime.sqliteDb.close();
  }

  const { snapshot } = await createOssSnapshot({ root: sourceRoot });
  const snapshotFile = path.join(targetRoot, 'snapshot.json');
  writeFileSync(snapshotFile, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  const imported = await importSnapshotIntoOss({
    file: snapshotFile,
    root: targetRoot,
  });

  assert.equal(imported.importedTables > 0, true);
  assert.equal(imported.paths.rootDir, path.resolve(targetRoot));

  const importedRuntime = createLocalRuntime({
    origin: 'http://127.0.0.1:8788',
    rootDir: targetRoot,
  });
  try {
    const row = importedRuntime.sqliteDb.sqlite
      .prepare('SELECT display_name FROM fluent_profile WHERE tenant_id = ? AND profile_id = ?')
      .get(FLUENT_OSS_DEFAULT_TENANT_ID, FLUENT_OSS_DEFAULT_PROFILE_ID) as { display_name: string } | undefined;
    assert.equal(row?.display_name, 'OSS Snapshot Owner');
  } finally {
    importedRuntime.sqliteDb.close();
  }
}

function createTempRoot(prefix: string): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}
