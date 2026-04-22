import { access, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { verifyContractParity } from './verify-contract-parity';

const args = parseArgs(process.argv.slice(2));
const cwd = path.resolve(args.cwd ?? process.cwd());
const staleVersions = [
  { date: '2026-04-13', version: 'fluent-core-v1.34' },
  { date: '2026-04-17', version: 'fluent-core-v1.35' },
].map(({ date, version }) => `${date}.${version}`);
const textExtensions = new Set(['.json', '.md', '.ts', '.yml']);

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const parity = await verifyContractParity({ cwd });
  const staleMatches: Array<{ file: string; version: string }> = [];

  for (const relativePath of [
    'README.md',
    'CHANGELOG.md',
    'package.json',
    'contracts',
    'docs',
    'src/contract.ts',
    'plugins',
    'claude-plugin',
    'openclaw-plugin',
    '.github/workflows/ci.yml',
  ]) {
    const absolutePath = path.join(cwd, relativePath);
    if (!(await exists(absolutePath))) continue;
    for (const filePath of await enumerateTextFiles(absolutePath)) {
      const body = await readFile(filePath, 'utf8');
      for (const version of staleVersions) {
        if (body.includes(version)) {
          staleMatches.push({
            file: path.relative(cwd, filePath),
            version,
          });
        }
      }
    }
  }

  const ciBody = await readFile(path.join(cwd, '.github', 'workflows', 'ci.yml'), 'utf8');
  const ci = {
    runsExportCheck: ciBody.includes('npm run export:oss:check'),
    runsVerifyContractParity: ciBody.includes('npm run verify:contract-parity'),
  };

  const report = {
    checkedAt: new Date().toISOString(),
    ci,
    parityOk: parity.ok,
    staleMatches,
    ok: parity.ok && staleMatches.length === 0 && ci.runsExportCheck && ci.runsVerifyContractParity,
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

async function enumerateTextFiles(targetPath: string): Promise<string[]> {
  const targetStat = await stat(targetPath);
  if (targetStat.isFile()) {
    return textExtensions.has(path.extname(targetPath).toLowerCase()) ? [targetPath] : [];
  }

  const files: string[] = [];
  const entries = await readdir(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    const nextPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await enumerateTextFiles(nextPath)));
      continue;
    }
    if (textExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(nextPath);
    }
  }
  return files;
}

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      result[key] = next;
      index += 1;
    } else {
      result[key] = 'true';
    }
  }
  return result;
}
