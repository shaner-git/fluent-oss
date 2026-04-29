import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

const root = mkdtempSync(path.join(tmpdir(), 'fluent-oss-bind-'));
const port = 19000 + Math.floor(Math.random() * 1000);
const tsxCli = path.resolve(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const child = spawn(process.execPath, [tsxCli, 'src/local/server.ts', '--host', '0.0.0.0', '--port', String(port), '--root', root], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForStartup(child);

    const [health, probe] = await Promise.all([
      fetchJson(`http://127.0.0.1:${port}/health`),
      fetchJson(`http://127.0.0.1:${port}/codex-probe`),
    ]);

    assert.equal(health.ok, true);
    assert.equal(health.body?.deploymentTrack, 'oss');
    assert.equal(probe.ok, true);
    assert.equal(probe.body?.deploymentTrack, 'oss');
    assert.equal(probe.body?.display_name, 'Fluent');
  } finally {
    child.kill('SIGTERM');
    await waitForExit(child);
    await removeRoot(root);
  }
}

async function waitForStartup(child: import('node:child_process').ChildProcessWithoutNullStreams): Promise<void> {
  let stdout = '';
  let stderr = '';

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for OSS server startup.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 15000);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      if (stdout.includes('"ok": true')) {
        clearTimeout(timeout);
        resolve();
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`OSS server exited before startup with code ${code}.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    });
  });
}

async function waitForExit(child: import('node:child_process').ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }
  await new Promise<void>((resolve) => child.once('exit', () => resolve()));
}

async function fetchJson(url: string) {
  const response = await fetch(url);
  return {
    body: await response.json(),
    ok: response.ok,
    status: response.status,
  };
}

async function removeRoot(target: string): Promise<void> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmSync(target, { force: true, recursive: true });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Failed to remove temp root ${target}`);
}

console.log('oss bind ok');
