import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { ensureLocalTokenState } from '../src/local/auth';
import { generateMcpConfig } from '../scripts/scaffold-mcp';

const tempRoots: string[] = [];

try {
  generatesCloudConfigFromExplicitBaseUrl();
  generatesOssConfigFromExplicitToken();
  generatesOssConfigFromPreferredEnvToken();
  generatesOssConfigFromBootstrappedToken();
} finally {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }
}

function generatesCloudConfigFromExplicitBaseUrl() {
  const config = generateMcpConfig({
    baseUrl: 'https://hosted-fluent.example.com',
    client: 'codex',
    track: 'cloud',
  }) as { mcpServers: { fluent: { type: string; url: string } } };

  assert.equal(config.mcpServers.fluent.type, 'http');
  assert.equal(config.mcpServers.fluent.url, 'https://hosted-fluent.example.com/mcp');
}

function generatesOssConfigFromExplicitToken() {
  const config = generateMcpConfig({
    baseUrl: 'http://192.168.2.20:8788',
    client: 'claude',
    token: 'test-oss-token',
    track: 'oss',
  }) as { mcpServers: { fluent: { headers?: { Authorization?: string }; url: string } } };

  assert.equal(config.mcpServers.fluent.url, 'http://192.168.2.20:8788/mcp');
  assert.equal(config.mcpServers.fluent.headers?.Authorization, 'Bearer test-oss-token');
}

function generatesOssConfigFromPreferredEnvToken() {
  const priorOss = process.env.FLUENT_OSS_TOKEN;
  const priorLocal = process.env.FLUENT_LOCAL_TOKEN;
  try {
    process.env.FLUENT_OSS_TOKEN = 'env-oss-token';
    delete process.env.FLUENT_LOCAL_TOKEN;

    const config = generateMcpConfig({
      client: 'codex',
      track: 'oss',
    }) as { mcpServers: { fluent: { headers?: { Authorization?: string } } } };

    assert.equal(config.mcpServers.fluent.headers?.Authorization, 'Bearer env-oss-token');
  } finally {
    if (priorOss === undefined) {
      delete process.env.FLUENT_OSS_TOKEN;
    } else {
      process.env.FLUENT_OSS_TOKEN = priorOss;
    }
    if (priorLocal === undefined) {
      delete process.env.FLUENT_LOCAL_TOKEN;
    } else {
      process.env.FLUENT_LOCAL_TOKEN = priorLocal;
    }
  }
}

function generatesOssConfigFromBootstrappedToken() {
  const root = mkdtempSync(path.join(tmpdir(), 'fluent-scaffold-'));
  tempRoots.push(root);
  const state = ensureLocalTokenState(root);

  const config = generateMcpConfig({
    client: 'codex',
    root,
    track: 'oss',
  }) as { mcpServers: { fluent: { headers?: { Authorization?: string }; url: string } } };

  assert.equal(config.mcpServers.fluent.url, 'http://127.0.0.1:8788/mcp');
  assert.equal(config.mcpServers.fluent.headers?.Authorization, `Bearer ${state.token}`);
}

console.log('scaffold mcp ok');
