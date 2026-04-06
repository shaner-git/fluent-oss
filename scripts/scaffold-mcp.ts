import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { LOCAL_TOKEN_ENV, OSS_TOKEN_ENV, readLocalTokenState } from '../src/local/auth';

export type McpClient = 'claude' | 'codex';
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
  const server: Record<string, unknown> = {
    type: 'http',
    url,
  };

  if (options.track === 'oss') {
    const token = resolveOssToken(options);
    server.headers = {
      Authorization: `Bearer ${token}`,
    };
  }

  return {
    mcpServers: {
      fluent: server,
    },
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const client = normalizeClient(args.client);
  const track = normalizeTrack(args.track);
  if (!client) {
    throw new Error('Missing --client. Expected codex or claude.');
  }
  if (!track) {
    throw new Error('Missing --track. Expected cloud or oss.');
  }

  const output = JSON.stringify(
    generateMcpConfig({
      baseUrl: args['base-url'] ?? args.baseUrl,
      client,
      out: args.out,
      root: args.root,
      token: args.token,
      track,
    }),
    null,
    2,
  );

  const outPath = args.out ? path.resolve(process.cwd(), args.out) : null;
  if (outPath) {
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${output}\n`, 'utf8');
    process.stdout.write(`${outPath}\n`);
    return;
  }

  process.stdout.write(`${output}\n`);
}

function normalizeClient(value: string | undefined): McpClient | null {
  return value === 'codex' || value === 'claude' ? value : null;
}

function normalizeTrack(value: string | undefined): McpTrack | null {
  return value === 'cloud' || value === 'oss' ? value : null;
}

function normalizeMcpUrl(baseUrl: string | undefined, track: McpTrack): string {
  const rawBase =
    track === 'cloud'
      ? baseUrl?.trim() || 'https://hosted-fluent.example.com'
      : baseUrl?.trim() || DEFAULT_OSS_BASE_URL;
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

  const rootDir = path.resolve(options.root ?? path.join(homedir(), '.fluent'));
  const tokenState = readLocalTokenState(rootDir);
  if (!tokenState?.token) {
    throw new Error(
      `Missing OSS token. Pass --token explicitly or bootstrap one first with npm run oss:token:bootstrap${options.root ? ` -- --root "${options.root}"` : ''}.`,
    );
  }
  return tokenState.token;
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
