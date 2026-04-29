import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  FLUENT_CONTRACT_FREEZE,
  FLUENT_CONTRACT_VERSION,
  FLUENT_DEV_RESOURCE_URIS,
  FLUENT_DEV_TOOL_NAMES,
  FLUENT_MINIMUM_SUPPORTED_CONTRACT_VERSION,
  FLUENT_RESOURCE_URIS,
  FLUENT_TOOL_ALIASES,
  FLUENT_TOOL_NAMES,
  fluentContractSnapshot,
} from '../src/contract';
import { registerCoreMcpSurface } from '../src/mcp-core';
import { registerHealthMcpSurface } from '../src/mcp-health';
import { registerMealsMcpSurface } from '../src/mcp-meals';
import { registerStyleMcpSurface } from '../src/mcp-style';
import { PREVIEW_RICH_TOOL_GUIDE } from '../scripts/render-public-doc-shared';

type ResourceRegistration = {
  name: string;
  uri: string;
};

type ToolRegistration = {
  name: string;
};

const repoRoot = process.cwd();
const runtimeSurface = enumerateRuntimeSurface();
const runtimeSurfaceWithDevWidgets = enumerateRuntimeSurface({ includeDevWidgetSurfaces: true });
const publicTools = new Set<string>(FLUENT_TOOL_NAMES);
const publicResources = new Set<string>(FLUENT_RESOURCE_URIS);
const aliasTools = new Set<string>(FLUENT_TOOL_ALIASES.map((entry) => entry.name));
const devTools = new Set<string>(FLUENT_DEV_TOOL_NAMES);
const devResources = new Set<string>(FLUENT_DEV_RESOURCE_URIS);
const previewTools = PREVIEW_RICH_TOOL_GUIDE.map((entry) => entry.name);
const frozenContractSnapshot = JSON.parse(readRepoFile('contracts/fluent-contract.v1.json')) as {
  contractVersion: string;
  freeze: unknown;
  optionalCapabilities: string[];
  resources: string[];
  tools: string[];
};

assert.deepEqual(
  frozenContractSnapshot,
  {
    ...fluentContractSnapshot(),
    freeze: FLUENT_CONTRACT_FREEZE,
  },
  'contracts/fluent-contract.v1.json must stay in exact parity with src/contract.ts.',
);

assert.deepEqual(
  runtimeSurface.tools
    .map((entry) => entry.name)
    .filter((name) => !publicTools.has(name) && !aliasTools.has(name) && !devTools.has(name)),
  [],
  'Every registered runtime tool must be public contract, alias-only, or dev-only.',
);

assert.deepEqual(
  runtimeSurface.resources
    .map((entry) => entry.uri)
    .filter((uri) => !publicResources.has(uri) && !devResources.has(uri)),
  [],
  'Every registered runtime resource must be public contract or dev-only.',
);

assert.deepEqual(
  [...FLUENT_TOOL_NAMES].filter((name) => !runtimeSurface.tools.some((entry) => entry.name === name)),
  [],
  'Every frozen contract tool must be registered at runtime.',
);

assert.deepEqual(
  [...FLUENT_RESOURCE_URIS].filter((uri) => !runtimeSurface.resources.some((entry) => entry.uri === uri)),
  [],
  'Every frozen contract resource must be registered at runtime.',
);

assert.deepEqual(
  [...aliasTools].filter((name) => !runtimeSurface.tools.some((entry) => entry.name === name)),
  [],
  'Every documented alias tool must still be registered at runtime.',
);

assert.deepEqual(
  [...devTools].filter((name) => runtimeSurface.tools.some((entry) => entry.name === name)),
  [],
  'Dev-only tools must stay out of the default runtime surface.',
);

assert.deepEqual(
  [...devResources].filter((uri) => runtimeSurface.resources.some((entry) => entry.uri === uri)),
  [],
  'Dev-only resources must stay out of the default runtime surface.',
);

assert.deepEqual(
  [...devTools].filter((name) => !runtimeSurfaceWithDevWidgets.tools.some((entry) => entry.name === name)),
  [],
  'Every documented dev-only tool must still be available when dev widget surfaces are intentionally enabled.',
);

assert.deepEqual(
  [...devResources].filter((uri) => !runtimeSurfaceWithDevWidgets.resources.some((entry) => entry.uri === uri)),
  [],
  'Every documented dev-only resource must still be available when dev widget surfaces are intentionally enabled.',
);

assert.equal(publicTools.has('meals_show_recipe'), false, 'meals_show_recipe must stay outside the frozen contract.');
assert.equal(aliasTools.has('meals_show_recipe'), true, 'meals_show_recipe must stay classified as an alias.');
assert.match(
  FLUENT_TOOL_ALIASES.find((entry) => entry.name === 'meals_show_recipe')?.note ?? '',
  /preferred public runtime alias/i,
  'meals_show_recipe must stay documented as the preferred public alias when it remains registered.',
);
assert.equal(publicTools.has('meals_render_grocery_widget_smoke'), false, 'meals_render_grocery_widget_smoke must stay outside the frozen contract.');
assert.equal(devTools.has('meals_render_grocery_widget_smoke'), true, 'meals_render_grocery_widget_smoke must stay classified as dev-only.');

assert.equal(
  publicResources.has('ui://widget/fluent-grocery-smoke-v1.html'),
  false,
  'The grocery smoke widget resource must stay outside the frozen contract.',
);
assert.equal(
  devResources.has('ui://widget/fluent-grocery-smoke-v1.html'),
  true,
  'The grocery smoke widget resource must stay classified as dev-only.',
);

assert.deepEqual(
  previewTools.filter((name) => publicTools.has(name) || aliasTools.has(name) || devTools.has(name)),
  [],
  'Preview or planned tools must not be reclassified as public, alias-only, or dev-only until they are intentionally promoted.',
);

assert.deepEqual(
  previewTools.filter(
    (name) =>
      runtimeSurface.tools.some((entry) => entry.name === name) ||
      runtimeSurfaceWithDevWidgets.tools.some((entry) => entry.name === name),
  ),
  [],
  'Preview or planned tools must not be registered at runtime until they are intentionally promoted.',
);

assert.deepEqual(
  frozenContractSnapshot.tools.filter((name) => aliasTools.has(name) || devTools.has(name)),
  [],
  'Alias-only and dev-only tools must stay out of the frozen contract artifact.',
);

assert.deepEqual(
  frozenContractSnapshot.resources.filter((uri) => devResources.has(uri)),
  [],
  'Dev-only resources must stay out of the frozen contract artifact.',
);

for (const filePath of [
  'README.md',
  'CHANGELOG.md',
  'docs/fluent-oss.md',
  'docs/oss/README.md',
  'docs/oss/fluent-oss-github-release-checklist.md',
  'docs/oss/fluent-oss-setup-matrix.md',
  'docs/oss/fluent-oss-upgrade-notes.md',
  'plugins/fluent/README.md',
  'claude-plugin/fluent/README.md',
  'ops/public-oss-overlay/README.md',
  'ops/public-oss-overlay/docs/fluent-oss.md',
  'ops/public-oss-overlay/docs/oss/README.md',
]) {
  if (!repoFileExists(filePath)) {
    continue;
  }
  const body = readRepoFile(filePath);
  if (
    !body.includes('minimum contract version') &&
    !body.includes('supported minimum contract version') &&
    !body.includes('supported contract version') &&
    !body.includes('supported contract floor')
  ) {
    continue;
  }
  assert.equal(
    body.includes(FLUENT_MINIMUM_SUPPORTED_CONTRACT_VERSION),
    true,
    `${filePath} must advertise the canonical minimum supported contract version.`,
  );
}

for (const filePath of [
  'plugins/fluent/.codex-plugin/plugin.json',
  'claude-plugin/fluent/.claude-plugin/plugin.json',
  'openclaw-plugin/fluent/package.json',
]) {
  const json = JSON.parse(readRepoFile(filePath)) as {
    'x-fluent'?: {
      minimumContractVersion?: string;
    };
  };
  assert.equal(
    json['x-fluent']?.minimumContractVersion,
    FLUENT_CONTRACT_VERSION,
    `${filePath} must declare the canonical contract version as its minimum contract version.`,
  );
}

if (repoFileExists('docs/fluent-hosted-client-testing.md')) {
  const hostedClientTestingDoc = readRepoFile('docs/fluent-hosted-client-testing.md');
  for (const toolName of extractCodeBulletSection(
    hostedClientTestingDoc,
    'Required callable tools:',
    'Registered runtime alias and dev-only verification surfaces are intentionally excluded from this required contract list:',
  )) {
    assert.equal(
      publicTools.has(toolName),
      true,
      `docs/fluent-hosted-client-testing.md lists ${toolName}, but it is not in the frozen contract.`,
    );
  }

  for (const resourceUri of extractCodeBulletSection(
    hostedClientTestingDoc,
    'Required resources:',
    'Required callable tools:',
  )) {
    assert.equal(
      publicResources.has(resourceUri),
      true,
      `docs/fluent-hosted-client-testing.md lists ${resourceUri}, but it is not in the frozen contract.`,
    );
  }
}

console.log('contract surface ok');

function enumerateRuntimeSurface(options?: {
  includeDevWidgetSurfaces?: boolean;
}): {
  resources: ResourceRegistration[];
  tools: ToolRegistration[];
} {
  const resources: ResourceRegistration[] = [];
  const tools: ToolRegistration[] = [];
  const fakeServer = {
    registerResource(name: string, uriOrTemplate: string | ResourceTemplate) {
      resources.push({
        name,
        uri: typeof uriOrTemplate === 'string' ? uriOrTemplate : uriOrTemplate._uriTemplate.template,
      });
    },
    registerTool(name: string) {
      tools.push({ name });
    },
  };

  const origin = 'https://contract-surface.test';
  registerCoreMcpSurface(fakeServer as never, {} as never, {} as never, {} as never, {} as never, origin);
  registerHealthMcpSurface(fakeServer as never, {} as never, origin);
  registerMealsMcpSurface(fakeServer as never, {} as never, {} as never, origin, options);
  registerStyleMcpSurface(fakeServer as never, {} as never, origin);

  return {
    resources,
    tools,
  };
}

function extractCodeBulletSection(body: string, startMarker: string, endMarker: string): string[] {
  const startIndex = body.indexOf(startMarker);
  assert.notEqual(startIndex, -1, `Missing section marker ${startMarker}.`);
  const endIndex = body.indexOf(endMarker, startIndex);
  assert.notEqual(endIndex, -1, `Missing section marker ${endMarker}.`);
  const section = body.slice(startIndex + startMarker.length, endIndex);
  return Array.from(section.matchAll(/^\s*-\s+`([^`]+)`\s*$/gm), (match) => match[1]!);
}

function readRepoFile(relativePath: string): string {
  return readFileSync(path.resolve(repoRoot, relativePath), 'utf8');
}

function repoFileExists(relativePath: string): boolean {
  return existsSync(path.resolve(repoRoot, relativePath));
}
