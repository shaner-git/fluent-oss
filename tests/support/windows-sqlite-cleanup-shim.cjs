const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

if (process.platform !== 'win32') {
  return;
}

const originalRmSync = fs.rmSync.bind(fs);
const tempRoot = path.resolve(os.tmpdir());

fs.rmSync = function patchedRmSync(targetPath, options) {
  try {
    return originalRmSync(targetPath, options);
  } catch (error) {
    if (!shouldDeferRemoval(error, targetPath)) {
      throw error;
    }

    scheduleDeferredRemoval(targetPath);
    return;
  }
};

function shouldDeferRemoval(error, targetPath) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = typeof error.code === 'string' ? error.code : '';
  if (code !== 'EPERM' && code !== 'EBUSY') {
    return false;
  }

  if (typeof targetPath !== 'string') {
    return false;
  }

  const resolvedTarget = path.resolve(targetPath);
  if (!resolvedTarget.startsWith(tempRoot)) {
    return false;
  }

  return path.basename(resolvedTarget).startsWith('fluent-');
}

function scheduleDeferredRemoval(targetPath) {
  const escapedPath = path.resolve(targetPath).replace(/'/g, "''");
  const command = [
    'Start-Sleep -Milliseconds 250',
    `Remove-Item -LiteralPath '${escapedPath}' -Recurse -Force -ErrorAction SilentlyContinue`,
  ].join('; ');

  const child = childProcess.spawn(
    'powershell',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
    {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    },
  );

  child.unref();
}
