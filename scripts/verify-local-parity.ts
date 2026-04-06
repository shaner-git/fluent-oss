import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { FLUENT_CONTRACT_VERSION, FLUENT_RESOURCE_URIS, FLUENT_TOOL_NAMES } from '../src/contract';
import { defaultLocalScopes, ensureLocalTokenState, LOCAL_AUTH_MODEL } from '../src/local/auth';
import { resolveLocalRuntimePaths } from '../src/local/runtime';

const args = parseArgs(process.argv.slice(2));
const cwd = path.resolve(args.cwd ?? process.cwd());
const baseUrl = (args['base-url'] ?? args.baseUrl ?? 'http://127.0.0.1:8788').replace(/\/$/, '');
const rootDir = args.root ? path.resolve(cwd, args.root) : undefined;
const paths = resolveLocalRuntimePaths(rootDir);

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const report = {
    baseUrl,
    checkedAt: new Date().toISOString(),
    contractVersion: FLUENT_CONTRACT_VERSION,
    ossRoot: paths.rootDir,
    ossDb: paths.dbPath,
    localRoot: paths.rootDir,
    localDb: paths.dbPath,
    health: null as unknown,
    probe: null as unknown,
    probeParity: null as unknown,
    unauthenticatedMcp: null as unknown,
    mcp: null as unknown,
    writes: null as unknown,
    eventLog: null as unknown,
    ok: false,
  };

  report.health = await fetchJson(`${baseUrl}/health`);
  report.probe = await fetchJson(`${baseUrl}/codex-probe`);
  report.unauthenticatedMcp = await fetchStatus(`${baseUrl}/mcp`);
  report.probeParity = compareSets({
    expectedResources: [...FLUENT_RESOURCE_URIS],
    expectedTools: [...FLUENT_TOOL_NAMES],
    liveResources: report.probe.body?.resources ?? [],
    liveTools: report.probe.body?.tools ?? [],
  });

  const db = new DatabaseSync(paths.dbPath);
  const tokenState = ensureLocalTokenState(paths.rootDir);
  try {
    const eventCountBefore = readEventCount(db);
    report.mcp = await verifyMcpSurface(tokenState.token);
    report.writes = await verifyWrites(db);
    const eventCountAfter = readEventCount(db);
    report.eventLog = {
      before: eventCountBefore,
      after: eventCountAfter,
      delta: eventCountAfter - eventCountBefore,
    };
  } finally {
    db.close();
  }

  const assertions = [
    report.health.ok === true,
    report.health.body?.auth_model === LOCAL_AUTH_MODEL,
    report.health.body?.deploymentTrack === 'oss',
    report.probe.ok === true,
    report.probe.body?.auth_model === LOCAL_AUTH_MODEL,
    report.probe.body?.deploymentTrack === 'oss',
    report.unauthenticatedMcp.status === 401,
    report.probe.body?.contract?.contractVersion === FLUENT_CONTRACT_VERSION,
    report.probeParity.missingResources.length === 0,
    report.probeParity.missingTools.length === 0,
    report.mcp?.toolParity?.missingTools?.length === 0,
    report.mcp?.resourceParity?.missingResources?.length === 0,
    report.mcp?.capabilities?.backendMode === 'local',
    report.mcp?.capabilities?.deploymentTrack === 'oss',
    report.mcp?.capabilities?.contractVersion === FLUENT_CONTRACT_VERSION,
    Array.isArray(report.mcp?.scopes) && defaultLocalScopes().every((scope) => report.mcp.scopes.includes(scope)),
    report.writes?.core?.restored === true,
    report.writes?.style?.restored === true,
    report.writes?.meals?.restored === true,
    (report.eventLog?.delta ?? 0) >= 2,
  ];

  report.ok = assertions.every(Boolean);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

async function verifyMcpSurface(token: string) {
  const client = new Client({ name: 'fluent-oss-verify', version: '1.0.0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  await client.connect(transport);
  try {
    const [
      toolsResult,
      resourcesResult,
      resourceTemplatesResult,
      capabilitiesResult,
      profileResult,
      domainsResult,
      styleProfileResult,
      styleContextResult,
      inventorySummaryResult,
      planResult,
    ] =
      await Promise.all([
        client.listTools(),
        client.listResources(),
        client.listResourceTemplates(),
        client.callTool({ name: 'fluent_get_capabilities', arguments: {} }),
        client.callTool({ name: 'fluent_get_profile', arguments: {} }),
        client.callTool({ name: 'fluent_list_domains', arguments: {} }),
        client.callTool({ name: 'style_get_profile', arguments: {} }),
        client.callTool({ name: 'style_get_context', arguments: {} }),
        client.callTool({ name: 'meals_get_inventory_summary', arguments: {} }),
        client.callTool({ name: 'meals_get_current_plan', arguments: {} }),
      ]);

    return {
      capabilities: extractToolStructuredContent(capabilitiesResult),
      domains: extractToolStructuredContent(domainsResult),
      inventorySummary: extractToolStructuredContent(inventorySummaryResult),
      plan: extractToolStructuredContent(planResult),
      profile: extractToolStructuredContent(profileResult),
      styleContext: extractToolStructuredContent(styleContextResult),
      styleProfile: extractToolStructuredContent(styleProfileResult),
      scopes: defaultLocalScopes(),
      resourceParity: compareSets({
        expectedResources: [...FLUENT_RESOURCE_URIS],
        expectedTools: [],
        liveResources: [
          ...(resourcesResult.resources ?? []).map((resource) => resource.uri),
          ...(resourceTemplatesResult.resourceTemplates ?? []).map((resource) => resource.uriTemplate),
        ],
        liveTools: [],
      }),
      toolParity: compareSets({
        expectedResources: [],
        expectedTools: [...FLUENT_TOOL_NAMES],
        liveResources: [],
        liveTools: (toolsResult.tools ?? []).map((tool) => tool.name),
      }),
    };
  } finally {
    await transport.close();
  }
}

async function verifyWrites(db: DatabaseSync) {
  const client = new Client({ name: 'fluent-oss-write-verify', version: '1.0.0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${ensureLocalTokenState(paths.rootDir).token}`,
      },
    },
  });

  await client.connect(transport);
  try {
    const domainsResult = await client.callTool({ name: 'fluent_list_domains', arguments: {} });
    const domains = extractToolStructuredContent(domainsResult) as Array<Record<string, unknown>>;
    const candidateDomain =
      domains.find((domain) => domain.domainId !== 'meals' && domain.lifecycleState === 'disabled') ??
      domains.find((domain) => domain.domainId !== 'meals' && domain.lifecycleState === 'enabled') ??
      domains.find((domain) => domain.domainId !== 'meals') ??
      domains[0];
    if (!candidateDomain) {
      throw new Error('No Fluent domains found in the Fluent OSS runtime.');
    }

    const originalLifecycle = String(candidateDomain.lifecycleState ?? 'available');
    if (!['disabled', 'enabled'].includes(originalLifecycle)) {
      throw new Error(
        `OSS parity needs a reversible lifecycle state, but ${String(candidateDomain.domainId)} is ${originalLifecycle}. Import a hosted snapshot with at least one enabled or disabled non-meals domain before rerunning parity.`,
      );
    }
    await client.callTool({
      name: 'fluent_disable_domain',
      arguments: {
        domain_id: String(candidateDomain.domainId),
        source_agent: 'verify-local-parity',
        source_skill: 'fluent-core',
      },
    });
    await client.callTool({
      name: originalLifecycle === 'disabled' ? 'fluent_disable_domain' : 'fluent_enable_domain',
      arguments: {
        domain_id: String(candidateDomain.domainId),
        source_agent: 'verify-local-parity',
        source_skill: 'fluent-core',
      },
    });
    const restoredDomain = readDomainLifecycle(db, String(candidateDomain.domainId)) === originalLifecycle;

    const styleProfileResult = await client.callTool({ name: 'style_get_profile', arguments: {} });
    const styleProfile = extractToolStructuredContent(styleProfileResult) as Record<string, unknown>;
    const originalFitNotes = Array.isArray(styleProfile.fitNotes) ? [...styleProfile.fitNotes] : [];
    const nextFitNotes = [...originalFitNotes, 'OSS parity verification note.'];

    await client.callTool({
      name: 'style_update_profile',
      arguments: {
        profile: { fitNotes: nextFitNotes },
        source_agent: 'verify-local-parity',
        source_skill: 'fluent-style',
      },
    });

    await client.callTool({
      name: 'style_update_profile',
      arguments: {
        profile: { fitNotes: originalFitNotes },
        source_agent: 'verify-local-parity',
        source_skill: 'fluent-style',
      },
    });

    const restoredStyleProfile = normalizeDbJsonValue(readStyleProfileRawJson(db)) === normalizeDbJsonValue(styleProfile);

    const recipesResult = await client.callTool({ name: 'meals_list_recipes', arguments: {} });
    const recipes = extractToolStructuredContent(recipesResult) as Array<Record<string, unknown>>;
    const recipeId = String(recipes[0]?.id ?? '');
    if (!recipeId) {
      throw new Error('No OSS recipes found for parity verification.');
    }

    const recipeResult = await client.callTool({ name: 'meals_get_recipe', arguments: { recipe_id: recipeId } });
    const recipe = extractToolStructuredContent(recipeResult) as Record<string, unknown>;
    const priorPrepNotes = recipe.prep_notes;

    await client.callTool({
      name: 'meals_patch_recipe',
      arguments: {
        recipe_id: recipeId,
        operations: [
          {
            op: 'add',
            path: '/prep_notes',
            value: 'OSS parity verification note.',
          },
        ],
        source_agent: 'verify-local-parity',
        source_skill: 'fluent-meals',
      },
    });

    await client.callTool({
      name: 'meals_patch_recipe',
      arguments: {
        recipe_id: recipeId,
        operations:
          priorPrepNotes === undefined
            ? [{ op: 'remove', path: '/prep_notes' }]
            : [{ op: 'replace', path: '/prep_notes', value: priorPrepNotes }],
        source_agent: 'verify-local-parity',
        source_skill: 'fluent-meals',
      },
    });

    const restoredRecipe = readRecipePrepNotes(db, recipeId) === normalizeDbJsonValue(priorPrepNotes);

    return {
      core: {
        domainId: String(candidateDomain.domainId),
        originalLifecycle,
        restored: restoredDomain,
      },
      style: {
        restored: restoredStyleProfile,
      },
      meals: {
        recipeId,
        restored: restoredRecipe,
      },
    };
  } finally {
    await transport.close();
  }
}

function readEventCount(db: DatabaseSync): number {
  const row = db.prepare('SELECT COUNT(*) AS count FROM domain_events').get() as { count: number } | undefined;
  return Number(row?.count ?? 0);
}

function readDomainLifecycle(db: DatabaseSync, domainId: string): string {
  const row = db
    .prepare('SELECT lifecycle_state FROM fluent_domains WHERE tenant_id = ? AND domain_id = ?')
    .get('primary', domainId) as { lifecycle_state: string } | undefined;
  return row?.lifecycle_state ?? '';
}

function readRecipePrepNotes(db: DatabaseSync, recipeId: string): string | null {
  const row = db
    .prepare('SELECT prep_notes FROM meal_recipes WHERE id = ?')
    .get(recipeId) as { prep_notes: string | null } | undefined;
  return row?.prep_notes ?? null;
}

function readStyleProfileRawJson(db: DatabaseSync): string | null {
  const row = db
    .prepare('SELECT raw_json FROM style_profile WHERE tenant_id = ? AND profile_id = ?')
    .get('primary', 'owner') as { raw_json: string | null } | undefined;
  return row?.raw_json ?? null;
}

function normalizeDbJsonValue(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function extractToolStructuredContent(result: Record<string, unknown>) {
  if ('structuredContent' in result && result.structuredContent !== undefined) {
    const structured = result.structuredContent as Record<string, unknown>;
    if (
      structured &&
      typeof structured === 'object' &&
      Object.keys(structured).length === 1 &&
      Object.prototype.hasOwnProperty.call(structured, 'value')
    ) {
      return structured.value;
    }
    return structured;
  }

  const content = Array.isArray(result.content) ? result.content : [];
  const firstText = content.find((entry) => entry && typeof entry === 'object' && (entry as { type?: string }).type === 'text') as
    | { text?: string }
    | undefined;

  if (!firstText?.text) {
    return null;
  }

  return JSON.parse(firstText.text);
}

async function fetchJson(url: string) {
  const response = await fetch(url);
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    url,
    body: JSON.parse(text),
  };
}

async function fetchStatus(url: string) {
  const response = await fetch(url, { redirect: 'manual' });
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    url,
    body: tryParseJson(text) ?? text,
    wwwAuthenticate: response.headers.get('www-authenticate'),
  };
}

function compareSets({
  expectedResources,
  expectedTools,
  liveResources,
  liveTools,
}: {
  expectedResources: string[];
  expectedTools: string[];
  liveResources: string[];
  liveTools: string[];
}) {
  return {
    extraResources: liveResources.filter((value) => !expectedResources.includes(value)),
    extraTools: liveTools.filter((value) => !expectedTools.includes(value)),
    missingResources: expectedResources.filter((value) => !liveResources.includes(value)),
    missingTools: expectedTools.filter((value) => !liveTools.includes(value)),
  };
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

function tryParseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
