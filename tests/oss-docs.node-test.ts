import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const currentVersion = '2026-04-20.fluent-core-v1.37';
const staleVersions = [
  { date: '2026-04-13', version: 'fluent-core-v1.34' },
  { date: '2026-04-17', version: 'fluent-core-v1.35' },
].map(({ date, version }) => `${date}.${version}`);

for (const relativePath of [
  'README.md',
  'CHANGELOG.md',
  'docs/fluent-oss.md',
  'docs/fluent-contract-v1.md',
  'docs/fluent-tools-reference.md',
  'docs/fluent-domain-surfaces.md',
  'docs/oss/README.md',
  'docs/oss/fluent-oss-github-release-checklist.md',
  'docs/oss/fluent-oss-setup-matrix.md',
  'docs/oss/openclaw-package-versioning.md',
  'docs/oss/fluent-oss-upgrade-notes.md',
]) {
  const body = readRepoFile(relativePath);
  assert.equal(body.includes(currentVersion), true, `${relativePath} must reference ${currentVersion}.`);
  for (const staleVersion of staleVersions) {
    assert.equal(body.includes(staleVersion), false, `${relativePath} must not reference ${staleVersion}.`);
  }
}

const sharedDocs = readRepoFile('docs/shared/README.md');
assert.equal(sharedDocs.includes('fluent-tools-reference.md'), true);
assert.equal(sharedDocs.includes('fluent-domain-surfaces.md'), true);

const ci = readRepoFile('.github/workflows/ci.yml');
assert.equal(ci.includes('npm run export:oss:check'), true);
assert.equal(ci.includes('npm run verify:contract-parity'), true);

const packageJson = JSON.parse(readRepoFile('package.json')) as {
  scripts?: Record<string, string>;
  'x-fluent'?: Record<string, unknown>;
};
assert.equal(packageJson['x-fluent']?.minimumContractVersion, currentVersion);
assert.equal(packageJson.scripts?.['verify:contract-parity'], 'tsx scripts/verify-contract-parity.ts');
assert.equal(packageJson.scripts?.['export:oss:check'], 'npm run check:public-scrub && tsx scripts/check-oss-export.ts');

for (const relativePath of [
  'plugins/fluent/.codex-plugin/plugin.json',
  'claude-plugin/fluent/.claude-plugin/plugin.json',
  'openclaw-plugin/fluent/package.json',
]) {
  const json = JSON.parse(readRepoFile(relativePath)) as {
    'x-fluent'?: Record<string, unknown>;
  };
  assert.equal(json['x-fluent']?.minimumContractVersion, currentVersion, `${relativePath} must stay on ${currentVersion}.`);
}

const openclawPackage = JSON.parse(readRepoFile('openclaw-plugin/fluent/package.json')) as {
  name?: string;
  private?: boolean;
  'x-fluent'?: Record<string, unknown>;
};
assert.equal(openclawPackage.name, 'fluent-openclaw-oss-helper');
assert.equal(openclawPackage.private, true);
assert.equal(openclawPackage['x-fluent']?.artifactKind, 'oss-bundled-openclaw-helper');
assert.equal(
  openclawPackage['x-fluent']?.packagingDecision,
  'oss-embedded-openclaw-bundle-is-a-distinct-helper-package',
);

const openclawHelperReadme = readRepoFile('openclaw-plugin/fluent/README.md');
assert.equal(openclawHelperReadme.includes('fluent-openclaw-oss-helper'), true);
assert.equal(openclawHelperReadme.includes('openclaw plugins install fluent-openclaw'), true);
assert.equal(openclawHelperReadme.includes('not the published standalone `fluent-openclaw` package'), true);

console.log('oss docs ok');

function readRepoFile(relativePath: string): string {
  return readFileSync(path.resolve(repoRoot, relativePath), 'utf8');
}
