import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  authorizeLocalBearer,
  ensureLocalTokenState,
  LOCAL_AUTH_MODEL,
  LOCAL_TOKEN_ENV,
  LOCAL_TOKEN_ENV_ALIASES,
  OSS_TOKEN_ENV,
  resolveLocalTokenFile,
  rotateLocalTokenState,
} from '../src/local/auth';
import { createLocalRuntime, localHealth, localProbe } from '../src/local/runtime';

const tempRoots: string[] = [];

try {
  bootstrapsAndRotatesLocalToken();
  exposesBearerAuthModelThroughProbeAndHealth();
} finally {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }
}

function bootstrapsAndRotatesLocalToken() {
  const root = mkdtempSync(path.join(tmpdir(), 'fluent-local-auth-'));
  tempRoots.push(root);

  const initial = ensureLocalTokenState(root);
  assert.equal(initial.authModel, LOCAL_AUTH_MODEL);
  assert.equal(resolveLocalTokenFile(root).endsWith('oss-access-token.json'), true);
  assert.equal(authorizeLocalBearer(root, `Bearer ${initial.token}`)?.token, initial.token);
  assert.equal(authorizeLocalBearer(root, undefined), null);
  assert.equal(authorizeLocalBearer(root, 'Bearer wrong-token'), null);

  const rotated = rotateLocalTokenState(root);
  assert.equal(rotated.authModel, LOCAL_AUTH_MODEL);
  assert.notEqual(rotated.token, initial.token);
  assert.equal(rotated.rotatedAt !== null, true);
  assert.equal(authorizeLocalBearer(root, `Bearer ${rotated.token}`)?.token, rotated.token);
  assert.equal(authorizeLocalBearer(root, `Bearer ${initial.token}`), null);
}

function exposesBearerAuthModelThroughProbeAndHealth() {
  const root = mkdtempSync(path.join(tmpdir(), 'fluent-local-runtime-'));
  tempRoots.push(root);
  const runtime = createLocalRuntime({
    origin: 'http://127.0.0.1:8788',
    rootDir: root,
  });
  try {
    const probe = localProbe('http://127.0.0.1:8788');
    const health = localHealth('http://127.0.0.1:8788', runtime.paths);

    assert.equal(probe.auth_model, LOCAL_AUTH_MODEL);
    assert.equal(probe.deploymentTrack, 'oss');
    assert.deepEqual(probe.authorization_required_paths, ['/mcp']);
    assert.equal(probe.recommended_auth_env, OSS_TOKEN_ENV);
    assert.deepEqual(probe.supported_auth_envs, [...LOCAL_TOKEN_ENV_ALIASES]);
    assert.deepEqual(probe.legacy_auth_envs, [LOCAL_TOKEN_ENV]);
    assert.equal(probe.display_name, 'Fluent OSS');
    assert.deepEqual(health.authorization_required_paths, ['/mcp']);
    assert.equal(health.auth_model, LOCAL_AUTH_MODEL);
    assert.equal(health.deploymentTrack, 'oss');
    assert.equal(health.recommended_auth_env, OSS_TOKEN_ENV);
    assert.deepEqual(health.supported_auth_envs, [...LOCAL_TOKEN_ENV_ALIASES]);
    assert.equal(typeof health.local_token_file, 'string');
  } finally {
    runtime.sqliteDb.close();
  }
}

console.log('local auth ok');
