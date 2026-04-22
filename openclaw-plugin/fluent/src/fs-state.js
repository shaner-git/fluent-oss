import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AUTH_STATE_VERSION, FLUENT_PLUGIN_ID } from './constants.js';

const LOCK_RETRY_MS = 100;
const LOCK_TIMEOUT_MS = 5_000;

export function sanitizeProfileName(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return 'default';
  }
  return trimmed.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'default';
}

export function buildAuthStateFilePath(stateDir, profileName) {
  return path.join(stateDir, 'plugins', FLUENT_PLUGIN_ID, 'auth', `${sanitizeProfileName(profileName)}.json`);
}

export async function readTokenState(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeTokenState(filePath, state) {
  await withFileLock(`${filePath}.lock`, async () => {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify({ version: AUTH_STATE_VERSION, ...state }, null, 2)}\n`, 'utf8');
  });
}

export async function removeTokenState(filePath) {
  await withFileLock(`${filePath}.lock`, async () => {
    await rm(filePath, { force: true });
  });
}

export async function withFileLock(lockPath, fn) {
  const startedAt = Date.now();
  while (true) {
    let handle = null;
    try {
      await mkdir(path.dirname(lockPath), { recursive: true });
      handle = await open(lockPath, 'wx');
      return await fn();
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error;
      }
      if (Date.now() - startedAt >= LOCK_TIMEOUT_MS) {
        throw new Error(`Timed out waiting for Fluent auth state lock: ${lockPath}`);
      }
      await delay(LOCK_RETRY_MS);
    } finally {
      if (handle) {
        await handle.close().catch(() => {});
        await rm(lockPath, { force: true }).catch(() => {});
      }
    }
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
