import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FLUENT_CONTRACT_FREEZE,
  FLUENT_RESOURCE_URIS,
  FLUENT_TOOL_ALIASES,
  FLUENT_TOOL_NAMES,
  fluentContractSnapshot,
} from '../src/contract';
import { createFluentMcpServer } from '../src/mcp';
import { fluentPublicProfile } from '../src/public-profile';

const frozenContractSnapshot = JSON.parse(readFileSync('contracts/fluent-contract.v2.json', 'utf8'));
const frozenPublicProfile = JSON.parse(readFileSync('contracts/fluent-public-profile.json', 'utf8'));

assert.deepEqual(frozenContractSnapshot, {
  ...fluentContractSnapshot(),
  freeze: FLUENT_CONTRACT_FREEZE,
});
assert.deepEqual(frozenPublicProfile, fluentPublicProfile());
assert.equal(FLUENT_TOOL_NAMES.length, 26);
assert.equal(new Set(FLUENT_TOOL_NAMES).size, 26, 'The public contract must not contain duplicate tools.');
assert.equal(FLUENT_RESOURCE_URIS.length, 3);
assert.deepEqual(FLUENT_TOOL_ALIASES, [], 'The 2.0 launch contract has no public tool aliases.');

for (const profile of ['assistant_app', 'chatgpt_app'] as const) {
  const server = createServer(profile);
  assert.deepEqual(
    Object.keys(server._registeredTools).sort(),
    [...FLUENT_TOOL_NAMES].sort(),
    `${profile} must expose exactly the 26-tool launch contract.`,
  );
  const resourceUris = Object.keys(server._registeredResources).sort();
  assert.deepEqual(resourceUris, [...FLUENT_RESOURCE_URIS].sort(), `${profile} must expose exactly three resources.`);
  assert.deepEqual(
    Object.keys(server._registeredTools).filter((name) => name.startsWith('health_')),
    [],
    `${profile} must not register reserved Health tools.`,
  );
  assert.equal(Object.hasOwn(server._registeredTools, 'style_extract_purchase_page_evidence'), false);
}

const localServerSource = readFileSync('src/local/server.ts', 'utf8');
assert.doesNotMatch(localServerSource, /candidate-full|profile:\s*['"]full['"]/);
const mcpSource = readFileSync('src/mcp.ts', 'utf8');
assert.doesNotMatch(mcpSource, /registerHealthMcpSurface\s*\(/);
assert.doesNotMatch(mcpSource, /allowPurchasePageExtraction/);
const mcpStyleSource = readFileSync('src/mcp-style.ts', 'utf8');
assert.doesNotMatch(mcpStyleSource, /allowPurchasePageExtraction/);
assert.doesNotMatch(mcpStyleSource, /style_extract_purchase_page_evidence/);

console.log('Fluent 2.0 contract surface ok');

function createServer(profile: 'assistant_app' | 'chatgpt_app') {
  const statement = {
    all: async () => ({ results: [] }),
    bind() {
      return this;
    },
    first: async () => null,
    run: async () => ({}),
  };
  return createFluentMcpServer(
    {
      artifacts: {},
      backendMode: 'local',
      db: { batch: async () => [], prepare: () => statement },
      deploymentTrack: 'oss',
      storageBackend: 'sqlite',
    } as never,
    'https://contract-surface.test',
    { profile },
  ) as never as {
    _registeredResources: Record<string, { template?: string; uri?: string }>;
    _registeredTools: Record<string, unknown>;
  };
}
