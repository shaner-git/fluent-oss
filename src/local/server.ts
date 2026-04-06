import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createFluentMcpServer } from '../mcp';
import { runWithFluentAuthProps } from '../auth';
import { localHealth, localProbe, createLocalRuntime, LOCAL_DEFAULT_HOST, LOCAL_DEFAULT_PORT } from './runtime';
import { authorizeLocalBearer, defaultLocalScopes, LOCAL_AUTH_MODEL } from './auth';
import { maybeHandleStyleImageRequest } from '../style-image-handler';

const args = parseArgs(process.argv.slice(2));
const host = args.host ?? LOCAL_DEFAULT_HOST;
const port = Number(args.port ?? LOCAL_DEFAULT_PORT);
const origin = `http://${host}:${port}`;
const runtime = createLocalRuntime({
  origin,
  rootDir: args.root,
});

const server = createServer(async (req, res) => {
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', origin);

  if (method === 'GET' && url.pathname === '/health') {
    return writeJson(res, 200, localHealth(origin, runtime.paths));
  }

  if (method === 'GET' && url.pathname === '/codex-probe') {
    return writeJson(res, 200, localProbe(origin));
  }

  const styleImageResponse = await maybeHandleStyleImageRequest(
    new Request(url, {
      headers: req.headers as HeadersInit,
      method,
    }),
    runtime.env,
  );
  if (styleImageResponse) {
    return writeFetchResponse(res, styleImageResponse);
  }

  if (url.pathname === '/mcp') {
    const tokenState = authorizeLocalBearer(runtime.paths.rootDir, req.headers.authorization);
    if (!tokenState) {
      res.statusCode = 401;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader(
        'www-authenticate',
        `Bearer realm="Fluent OSS", error="invalid_token", scope="${defaultLocalScopes().join(' ')}"`,
      );
      res.end(
        JSON.stringify(
          {
            auth_model: LOCAL_AUTH_MODEL,
            deploymentTrack: 'oss',
            error: 'Fluent OSS MCP access requires Authorization: Bearer <token>.',
            recommended_auth_env: 'FLUENT_OSS_TOKEN',
            legacy_auth_envs: ['FLUENT_LOCAL_TOKEN'],
            required_scopes: defaultLocalScopes(),
            token_help: [
              'Bootstrap or print the OSS token with: npm run oss:token:print',
              'Rotate the OSS token with: npm run oss:token:rotate',
              'Bridge aliases remain available under npm run local:token:*',
            ],
            request_id: randomUUID(),
          },
          null,
          2,
        ),
      );
      return;
    }

    const mcpServer = createFluentMcpServer(runtime.env, origin);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await mcpServer.connect(transport);

    try {
      await runWithFluentAuthProps(
        {
          email: 'oss@fluent',
          name: 'Fluent OSS',
          oauthClientId: 'fluent-oss',
          oauthClientName: 'Fluent OSS',
          accessToken: tokenState.token,
          scope: tokenState.scopes,
        },
        async () => {
          await transport.handleRequest(req, res);
        },
      );
    } finally {
      await mcpServer.close();
    }
    return;
  }

  if (method === 'GET' && url.pathname === '/') {
    return writeHtml(
      res,
      200,
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Fluent OSS</title></head><body><h1>Fluent OSS</h1><p>Single-user self-hosted Fluent runtime.</p><p>MCP endpoint: <code>${origin}/mcp</code></p><p>Probe: <code>${origin}/codex-probe</code></p><p>Health: <code>${origin}/health</code></p></body></html>`,
    );
  }

  return writeJson(res, 404, { error: 'Not Found', request_id: randomUUID() });
});

server.listen(port, host, () => {
  process.stdout.write(
    `${JSON.stringify(
      {
        authModel: LOCAL_AUTH_MODEL,
        baseUrl: origin,
        localRoot: runtime.paths.rootDir,
        tokenFile: runtime.paths.tokenFile,
        deploymentTrack: 'oss',
        mode: 'oss',
        ok: true,
        storageBackend: runtime.env.storageBackend,
      },
      null,
      2,
    )}\n`,
  );
});

process.on('SIGINT', async () => {
  server.close();
  runtime.sqliteDb.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  server.close();
  runtime.sqliteDb.close();
  process.exit(0);
});

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

function writeHtml(res: import('node:http').ServerResponse, status: number, body: string): void {
  res.statusCode = status;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(body);
}

function writeJson(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body, null, 2));
}

async function writeFetchResponse(res: import('node:http').ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const body = await response.arrayBuffer();
  res.end(Buffer.from(body));
}
