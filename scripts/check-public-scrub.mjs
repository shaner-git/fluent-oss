import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const manifestPath = path.resolve(repoRoot, 'ops/public-oss-overlay/public-artifact-boundary.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const excludedDirectories = new Set((manifest.excludedDirectories ?? []).map((value) => value.toLowerCase()));
const allowedEmailDomains = new Set(['example.com', 'example.invalid', 'example.net', 'example.org', 'fluent', 'meetfluent.app']);
const privateSourceRepoIdentifier = ['fluent', 'private'].join('-');
const privateRepoNames = [['fluent', 'mcp'].join('-'), privateSourceRepoIdentifier];
const knownFixtureNames = [['Shane', 'Rodness'].join(' '), ['Sa', 'faa'].join('')];

const lineRules = [
  { rule: 'local absolute path', test: /C:\/Users\/|C:\\Users\\|\/Users\//i },
  { rule: 'private operator email', test: /@securebyte\.ca\b/i },
  { rule: 'private hosted example host', test: /\bhosted-fluent\.example\.com\b/i },
  { rule: 'private source repo identifier', test: new RegExp(`\\b${escapeRegExp(privateSourceRepoIdentifier)}\\b`, 'i') },
  { rule: 'private export manifest reference', test: /\bops\/export-oss\.manifest\.json\b/i },
  {
    rule: 'private repo reference',
    test: new RegExp(
      `github\\.com\\/[^\\s)]+\\/(?:${privateRepoNames.map((value) => escapeRegExp(value)).join('|')})(?:[/?#][^\\s)]*)?`,
      'i',
    ),
  },
  { rule: 'production account identifier', test: /\bfluent-mcp\.accounts-[a-z0-9-]+\.workers\.dev\b/i },
  ...knownFixtureNames.map((name) => ({
    rule: 'known real-person fixture name',
    test: new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i'),
  })),
];

const emailPattern = /\b([A-Z0-9._%+-]+)@([A-Z0-9.-]+\.[A-Z]{2,}|[A-Z0-9.-]+)\b/gi;
const violations = [];

for (const publicRoot of manifest.publicRoots) {
  const resolvedRoot = path.resolve(repoRoot, publicRoot);
  if (!existsSync(resolvedRoot)) {
    continue;
  }

  for (const filePath of walkPublicFiles(resolvedRoot)) {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      for (const rule of lineRules) {
        if (rule.test.test(line)) {
          violations.push({
            file: path.relative(repoRoot, filePath),
            line: index + 1,
            rule: rule.rule,
            snippet: line.trim(),
          });
        }
      }

      for (const match of line.matchAll(emailPattern)) {
        const domain = match[2]?.toLowerCase() ?? '';
        if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(domain)) {
          continue;
        }
        if (!allowedEmailDomains.has(domain)) {
          violations.push({
            file: path.relative(repoRoot, filePath),
            line: index + 1,
            rule: 'non-synthetic email address',
            snippet: match[0],
          });
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error('Public scrub check failed.\n');
  for (const violation of violations) {
    console.error(`${violation.file}:${violation.line} [${violation.rule}] ${violation.snippet}`);
  }
  process.exit(1);
}

console.log(`Public scrub check passed across ${manifest.publicRoots.length} public roots.`);

function walkPublicFiles(targetPath) {
  const stats = lstatSync(targetPath);
  if (stats.isFile()) {
    return [targetPath];
  }

  if (!stats.isDirectory()) {
    return [];
  }

  const files = [];
  for (const entry of readdirSync(targetPath, { withFileTypes: true })) {
    if (excludedDirectories.has(entry.name.toLowerCase())) {
      continue;
    }

    const childPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkPublicFiles(childPath));
      continue;
    }

    if (entry.isFile()) {
      files.push(childPath);
    }
  }
  return files;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
