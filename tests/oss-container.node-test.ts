import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';

const docker = resolveDockerBinary();
if (!docker) {
  console.log('oss container skipped (docker unavailable)');
  process.exit(0);
}

const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const image = `fluent-oss-test:${suffix}`;
const volume = `fluent-oss-data-${suffix}`;
const firstContainer = `fluent-oss-first-${suffix}`;
const secondContainer = `fluent-oss-second-${suffix}`;
const port = String(19000 + Math.floor(Math.random() * 1000));

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  try {
    execDocker(['build', '-t', image, '.']);
    execDocker(['volume', 'create', volume]);

    await startContainer(firstContainer);
    await waitForHealthy(port);
    const [health, probe, firstToken] = await Promise.all([
      fetchJson(`http://127.0.0.1:${port}/health`),
      fetchJson(`http://127.0.0.1:${port}/codex-probe`),
      readToken(firstContainer),
    ]);

    assert.equal(health.ok, true);
    assert.equal(health.body?.deploymentTrack, 'oss');
    assert.equal(probe.ok, true);
    assert.equal(probe.body?.deploymentTrack, 'oss');

    execDocker(['rm', '-f', firstContainer]);

    await startContainer(secondContainer);
    await waitForHealthy(port);
    const secondToken = await readToken(secondContainer);
    assert.equal(secondToken.token, firstToken.token);
  } finally {
    safeDocker(['rm', '-f', firstContainer]);
    safeDocker(['rm', '-f', secondContainer]);
    safeDocker(['volume', 'rm', '-f', volume]);
    safeDocker(['image', 'rm', '-f', image]);
  }

  console.log('oss container ok');
}

async function startContainer(name: string): Promise<void> {
  execDocker([
    'run',
    '-d',
    '--name',
    name,
    '-e',
    'FLUENT_OSS_HOST=0.0.0.0',
    '-e',
    'FLUENT_OSS_PORT=8788',
    '-e',
    'FLUENT_OSS_ROOT=/var/lib/fluent',
    '-p',
    `${port}:8788`,
    '-v',
    `${volume}:/var/lib/fluent`,
    image,
  ]);
}

async function waitForHealthy(currentPort: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${currentPort}/health`);
      if (response.ok) {
        return;
      }
      lastError = new Error(`Health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw lastError instanceof Error ? lastError : new Error('Timed out waiting for OSS container health.');
}

async function fetchJson(url: string) {
  const response = await fetch(url);
  return {
    body: await response.json(),
    ok: response.ok,
    status: response.status,
  };
}

async function readToken(name: string): Promise<{ token: string }> {
  const raw = execDocker([
    'exec',
    name,
    'node',
    '-e',
    "const fs=require('node:fs');process.stdout.write(fs.readFileSync('/var/lib/fluent/auth/oss-access-token.json','utf8'))",
  ]);
  return JSON.parse(raw);
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
