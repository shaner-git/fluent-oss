import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const shimPath = path.join(repoRoot, 'tests', 'support', 'windows-sqlite-cleanup-shim.cjs');
const tsxCliPath = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const testArgs = process.argv.slice(2);

if (testArgs.length === 0) {
  console.error('Missing test entrypoint for run-tsx-test.');
  process.exit(1);
}

const existingNodeOptions = process.env.NODE_OPTIONS?.trim() ?? '';
const requiredNodeOption = `--require=${shimPath.replace(/\\/g, '/')}`;
const nodeOptions = existingNodeOptions ? `${existingNodeOptions} ${requiredNodeOption}` : requiredNodeOption;

const child = spawn(process.execPath, [tsxCliPath, ...testArgs], {
  cwd: repoRoot,
  env: {
    ...process.env,
    NODE_OPTIONS: nodeOptions,
  },
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
