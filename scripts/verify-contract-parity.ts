import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  FLUENT_CONTRACT_FREEZE,
  FLUENT_CONTRACT_VERSION,
  FLUENT_MINIMUM_SUPPORTED_CONTRACT_VERSION,
  FLUENT_OPTIONAL_CAPABILITIES,
  FLUENT_RESOURCE_URIS,
  FLUENT_TOOL_NAMES,
  fluentContractSnapshot,
} from '../src/contract';
import { renderDomainSurfacesMarkdown } from './render-domain-surfaces-doc';
import { extractCurrentToolNamesFromMarkdown, normalizeNewlines } from './render-public-doc-shared';
import { renderContractDocMarkdown } from './render-contract-doc';
import { renderToolsReferenceMarkdown } from './render-tools-reference-doc';

type JsonRecord = Record<string, unknown>;

const args = parseArgs(process.argv.slice(2));
const cwd = path.resolve(args.cwd ?? process.cwd());

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

export async function verifyContractParity(options?: { cwd?: string }) {
  const rootDir = path.resolve(options?.cwd ?? cwd);
  const report = {
    checkedAt: new Date().toISOString(),
    contractVersion: FLUENT_CONTRACT_VERSION,
    parity: {
      frozenArtifact: null as unknown,
      frozenVsSource: null as unknown,
      contractDoc: null as unknown,
      toolsReferenceDoc: null as unknown,
      domainSurfacesDoc: null as unknown,
      rootPackage: null as unknown,
      codexPackage: null as unknown,
      claudePackage: null as unknown,
      openclawPackage: null as unknown,
      codexMcp: null as unknown,
      codexOssMcp: null as unknown,
      codexLocalMcp: null as unknown,
      claudeMcp: null as unknown,
      claudeOssMcp: null as unknown,
      claudeLocalMcp: null as unknown,
      openclawMcp: null as unknown,
      openclawOssMcp: null as unknown,
      openclawLocalMcp: null as unknown,
    },
    ok: false,
  };

  const expectedSnapshot = {
    ...fluentContractSnapshot(),
    freeze: FLUENT_CONTRACT_FREEZE,
  };

  report.parity.frozenArtifact = await readJson(path.join(rootDir, 'contracts', 'fluent-contract.v1.json'));
  report.parity.frozenVsSource = compareContractSnapshots(report.parity.frozenArtifact, expectedSnapshot);
  report.parity.contractDoc = await readGeneratedDocParity({
    filePath: path.join(rootDir, 'docs', 'fluent-contract-v1.md'),
    renderer: renderContractDocMarkdown,
  });
  report.parity.toolsReferenceDoc = await readGeneratedDocParity({
    expectedCurrentTools: [...FLUENT_TOOL_NAMES],
    filePath: path.join(rootDir, 'docs', 'fluent-tools-reference.md'),
    renderer: renderToolsReferenceMarkdown,
  });
  report.parity.domainSurfacesDoc = await readGeneratedDocParity({
    expectedCurrentTools: [...FLUENT_TOOL_NAMES],
    filePath: path.join(rootDir, 'docs', 'fluent-domain-surfaces.md'),
    renderer: renderDomainSurfacesMarkdown,
  });
  report.parity.rootPackage = await readRootPackage(path.join(rootDir, 'package.json'));
  report.parity.codexPackage = await readPluginPackage(
    path.join(rootDir, 'plugins', 'fluent', '.codex-plugin', 'plugin.json'),
  );
  report.parity.claudePackage = await readPluginPackage(
    path.join(rootDir, 'claude-plugin', 'fluent', '.claude-plugin', 'plugin.json'),
  );
  report.parity.openclawPackage = await readPluginPackage(
    path.join(rootDir, 'openclaw-plugin', 'fluent', 'package.json'),
  );
  report.parity.codexMcp = await readMcpTemplate(path.join(rootDir, 'plugins', 'fluent', '.mcp.json'));
  report.parity.codexOssMcp = await readMcpTemplate(path.join(rootDir, 'plugins', 'fluent', '.mcp.oss.json'));
  report.parity.codexLocalMcp = await readMcpTemplate(path.join(rootDir, 'plugins', 'fluent', '.mcp.local.json'));
  report.parity.claudeMcp = await readMcpTemplate(path.join(rootDir, 'claude-plugin', 'fluent', '.mcp.json'));
  report.parity.claudeOssMcp = await readMcpTemplate(path.join(rootDir, 'claude-plugin', 'fluent', '.mcp.oss.json'));
  report.parity.claudeLocalMcp = await readMcpTemplate(path.join(rootDir, 'claude-plugin', 'fluent', '.mcp.local.json'));
  report.parity.openclawMcp = await readMcpTemplate(path.join(rootDir, 'openclaw-plugin', 'fluent', '.mcp.json'));
  report.parity.openclawOssMcp = await readMcpTemplate(path.join(rootDir, 'openclaw-plugin', 'fluent', '.mcp.oss.json'));
  report.parity.openclawLocalMcp = await readMcpTemplate(path.join(rootDir, 'openclaw-plugin', 'fluent', '.mcp.local.json'));

  const assertions = [
    report.parity.frozenVsSource.ok === true,
    report.parity.contractDoc.ok === true,
    report.parity.toolsReferenceDoc.ok === true,
    report.parity.domainSurfacesDoc.ok === true,
    report.parity.rootPackage.ok === true,
    report.parity.rootPackage.minimumContractVersion === FLUENT_MINIMUM_SUPPORTED_CONTRACT_VERSION,
    report.parity.codexPackage.ok === true,
    report.parity.codexPackage.minimumContractVersion === FLUENT_CONTRACT_VERSION,
    report.parity.claudePackage.ok === true,
    report.parity.claudePackage.minimumContractVersion === FLUENT_CONTRACT_VERSION,
    report.parity.openclawPackage.ok === true,
    report.parity.openclawPackage.minimumContractVersion === FLUENT_CONTRACT_VERSION,
    report.parity.codexMcp.ok === true && report.parity.codexMcp.baseUrl === 'http://127.0.0.1:8788',
    report.parity.codexOssMcp.ok === true && report.parity.codexOssMcp.baseUrl === 'http://127.0.0.1:8788',
    report.parity.codexLocalMcp.ok === true && report.parity.codexLocalMcp.baseUrl === 'http://127.0.0.1:8788',
    report.parity.claudeMcp.ok === true && report.parity.claudeMcp.baseUrl === 'http://127.0.0.1:8788',
    report.parity.claudeOssMcp.ok === true && report.parity.claudeOssMcp.baseUrl === 'http://127.0.0.1:8788',
    report.parity.claudeLocalMcp.ok === true && report.parity.claudeLocalMcp.baseUrl === 'http://127.0.0.1:8788',
    report.parity.openclawMcp.ok === true && report.parity.openclawMcp.baseUrl === 'http://127.0.0.1:8788',
    report.parity.openclawOssMcp.ok === true && report.parity.openclawOssMcp.baseUrl === 'http://127.0.0.1:8788',
    report.parity.openclawLocalMcp.ok === true && report.parity.openclawLocalMcp.baseUrl === 'http://localhost:8788',
  ];

  report.ok = assertions.every(Boolean);
  return report;
}

async function main() {
  const report = await verifyContractParity({ cwd });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

async function readGeneratedDocParity(input: {
  expectedCurrentTools?: string[];
  filePath: string;
  renderer: () => string;
}) {
  if (!(await exists(input.filePath))) {
    return {
      filePath: input.filePath,
      ok: false,
      reason: 'missing_generated_doc',
    };
  }

  const actual = await readFile(input.filePath, 'utf8');
  const rendered = input.renderer();
  const currentTools = extractCurrentToolNamesFromMarkdown(actual);
  const invalidCurrentTools =
    input.expectedCurrentTools && input.expectedCurrentTools.length > 0
      ? currentTools.filter((toolName) => !input.expectedCurrentTools!.includes(toolName))
      : [];

  return {
    currentTools,
    filePath: input.filePath,
    invalidCurrentTools,
    ok: normalizeNewlines(actual) === normalizeNewlines(rendered) && invalidCurrentTools.length === 0,
  };
}

async function readJson(filePath: string) {
  if (!(await exists(filePath))) {
    return null;
  }
  return JSON.parse(await readFile(filePath, 'utf8')) as JsonRecord;
}

async function readRootPackage(filePath: string) {
  if (!(await exists(filePath))) {
    return {
      ok: false,
      reason: 'missing_root_package',
    };
  }

  const json = JSON.parse(await readFile(filePath, 'utf8')) as JsonRecord;
  const scripts = asRecord(json.scripts) ?? {};
  return {
    ok:
      json.name === 'fluent-oss' &&
      scripts['export:oss:check'] === 'npm run check:public-scrub && tsx scripts/check-oss-export.ts' &&
      scripts['verify:contract-parity'] === 'tsx scripts/verify-contract-parity.ts',
    minimumContractVersion: asRecord(json['x-fluent'])?.minimumContractVersion ?? null,
    scripts,
  };
}

async function readPluginPackage(filePath: string) {
  if (!(await exists(filePath))) {
    return {
      ok: false,
      reason: 'missing_plugin_package',
    };
  }

  const json = JSON.parse(await readFile(filePath, 'utf8')) as JsonRecord;
  return {
    ok: true,
    minimumContractVersion: asRecord(json['x-fluent'])?.minimumContractVersion ?? null,
    packageName: json.name ?? null,
  };
}

async function readMcpTemplate(filePath: string) {
  if (!(await exists(filePath))) {
    return {
      ok: false,
      reason: 'missing_mcp_template',
    };
  }

  const json = JSON.parse(await readFile(filePath, 'utf8')) as JsonRecord;
  const server = extractMcpServer(json);
  const url = typeof server?.url === 'string' ? server.url : null;
  return {
    baseUrl: url ? url.replace(/\/mcp$/, '') : null,
    ok: Boolean(url),
  };
}

function compareContractSnapshots(candidate: JsonRecord | null, expected: JsonRecord) {
  if (!candidate) {
    return {
      ok: false,
      reason: 'missing_contract_snapshot',
    };
  }

  return {
    ok:
      candidate.contractVersion === FLUENT_CONTRACT_VERSION &&
      arraysEqual(candidate.optionalCapabilities, [...FLUENT_OPTIONAL_CAPABILITIES]) &&
      arraysEqual(candidate.resources, [...FLUENT_RESOURCE_URIS]) &&
      arraysEqual(candidate.tools, [...FLUENT_TOOL_NAMES]) &&
      JSON.stringify(candidate.freeze ?? null) === JSON.stringify(expected.freeze ?? null),
  };
}

function arraysEqual(left: unknown, right: readonly string[]) {
  return Array.isArray(left) && JSON.stringify(left) === JSON.stringify([...right]);
}

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function extractMcpServer(config: JsonRecord) {
  if (config.mcpServers && typeof config.mcpServers === 'object' && !Array.isArray(config.mcpServers)) {
    return (config.mcpServers as JsonRecord).fluent as JsonRecord | null;
  }
  if (config.mcp && typeof config.mcp === 'object') {
    const servers = asRecord((config.mcp as JsonRecord).servers);
    return (servers?.fluent as JsonRecord | null) ?? null;
  }
  return typeof config.url === 'string' ? config : null;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;
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
