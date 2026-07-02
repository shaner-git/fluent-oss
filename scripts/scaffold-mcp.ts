import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { LOCAL_TOKEN_ENV, OSS_TOKEN_ENV, readLocalTokenState } from '../src/local/auth';
import { cliString, parseCliArgs, resolveCliBaseUrl, resolveCliRoot } from '../src/local/cli';

export type McpClient = 'claude' | 'codex' | 'openclaw';
export type McpTrack = 'cloud' | 'oss';

export interface ScaffoldOptions {
  baseUrl?: string;
  client: McpClient;
  out?: string;
  root?: string;
  token?: string;
  track: McpTrack;
}

const DEFAULT_OSS_BASE_URL = 'http://127.0.0.1:8788/mcp';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

export function generateMcpConfig(options: ScaffoldOptions): Record<string, unknown> {
  const url = normalizeMcpUrl(options.baseUrl, options.track);
  const server: Record<string, unknown> =
    options.client === 'openclaw'
      ? {
          transport: 'streamable-http',
          url,
        }
      : {
          type: 'http',
          url,
        };

  if (options.track === 'oss') {
    const token = resolveOssToken(options);
    server.headers = {
      Authorization: `Bearer ${token}`,
    };
  }

  if (options.client === 'openclaw') {
    return server;
  }

  return {
    mcpServers: {
      fluent: server,
    },
  };
}

function main(): void {
  const args = parseCliArgs(process.argv.slice(2));
  const client = normalizeClient(cliString(args, 'client'));
  const track = normalizeTrack(cliString(args, 'track'));
  if (!client) {
    throw new Error('Missing --client. Expected codex, claude, or openclaw.');
  }
  if (!track) {
    throw new Error('Missing --track. Expected cloud or oss.');
  }

  const output = JSON.stringify(
    generateMcpConfig({
      baseUrl: resolveCliBaseUrl({ args, defaultBaseUrl: track === 'cloud' ? '' : DEFAULT_OSS_BASE_URL }),
      client,
      out: cliString(args, 'out'),
      root: resolveCliRoot({ args }),
      token: cliString(args, 'token'),
      track,
    }),
    null,
    2,
  );

  const out = cliString(args, 'out');
  const outPath = out ? path.resolve(process.cwd(), out) : null;
  if (outPath) {
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${output}\n`, 'utf8');
    process.stdout.write(`${outPath}\n`);
    return;
  }

  process.stdout.write(`${output}\n`);
}

function normalizeClient(value: string | undefined): McpClient | null {
  return value === 'codex' || value === 'claude' || value === 'openclaw' ? value : null;
}

function normalizeTrack(value: string | undefined): McpTrack | null {
  return value === 'cloud' || value === 'oss' ? value : null;
}

function normalizeMcpUrl(baseUrl: string | undefined, track: McpTrack): string {
  const explicitBaseUrl = baseUrl?.trim();
  if (track === 'cloud' && !explicitBaseUrl) {
    throw new Error(
      'Missing --base-url for --track cloud. Fluent Cloud is not GA in the public OSS export, so pass the hosted base URL explicitly.',
    );
  }
  const rawBase = explicitBaseUrl || DEFAULT_OSS_BASE_URL;
  const raw = rawBase.replace(/\/$/, '');
  return raw.endsWith('/mcp') ? raw : `${raw}/mcp`;
}

function resolveOssToken(options: Pick<ScaffoldOptions, 'root' | 'token'>): string {
  const explicit = options.token?.trim();
  if (explicit) {
    return explicit;
  }

  const envToken = process.env[OSS_TOKEN_ENV]?.trim() || process.env[LOCAL_TOKEN_ENV]?.trim();
  if (envToken) {
    return envToken;
  }

  const rootDir = path.resolve(options.root ?? process.env.FLUENT_OSS_ROOT ?? process.env.FLUENT_LOCAL_ROOT ?? path.join(homedir(), '.fluent'));
  const tokenState = readLocalTokenState(rootDir);
  if (!tokenState?.token) {
    throw new Error(
      `Missing OSS token. Pass --token explicitly or bootstrap one first with npm run oss:token:bootstrap${options.root ? ` -- --root "${options.root}"` : ''}.`,
    );
  }
  return tokenState.token;
}

