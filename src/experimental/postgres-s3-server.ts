import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createFluentMcpServer } from '../mcp';
import { runWithFluentAuthProps } from '../auth';
import { authorizeLocalBearer, defaultLocalScopes, LOCAL_AUTH_MODEL } from '../local/auth';
import { maybeHandleStyleImageRequest } from '../style-image-handler';
import {
  checkExperimentalRuntime,
  createExperimentalRuntime,
  experimentalHealth,
  EXPERIMENTAL_DEFAULT_HOST,
  EXPERIMENTAL_DEFAULT_PORT,
  experimentalProbe,
  experimentalStartupSummary,
  parseExperimentalServerArgs,
} from './runtime';

const args = parseExperimentalServerArgs(process.argv.slice(2));

if (args.check === 'true') {
  const host = args.host ?? EXPERIMENTAL_DEFAULT_HOST;
  const port = Number(args.port ?? EXPERIMENTAL_DEFAULT_PORT);
  const origin = `http://${host}:${port}`;
  checkExperimentalRuntime(origin, args.root)
    .then((summary) => {
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
} else {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

async function main(): Promise<void> {
  const host = args.host ?? EXPERIMENTAL_DEFAULT_HOST;
  const port = Number(args.port ?? EXPERIMENTAL_DEFAULT_PORT);
  const origin = `http://${host}:${port}`;
  const runtime = await createExperimentalRuntime({
    origin,
    rootDir: args.root,
  });

  const server = createServer(async (req, res) => {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', origin);

    if (method === 'GET' && url.pathname === '/health') {
      return writeJson(res, 200, experimentalHealth(origin, runtime.paths));
    }

    if (method === 'GET' && url.pathname === '/codex-probe') {
      return writeJson(res, 200, experimentalProbe(origin));
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
          `Bearer realm="Fluent OSS Experimental", error="invalid_token", scope="${defaultLocalScopes().join(' ')}"`,
        );
        res.end(
          JSON.stringify(
            {
              auth_model: LOCAL_AUTH_MODEL,
              deploymentTrack: 'oss',
              error: 'Fluent OSS experimental MCP access requires Authorization: Bearer <token>.',
              recommended_auth_env: 'FLUENT_OSS_TOKEN',
              required_scopes: defaultLocalScopes(),
              storageBackend: 'postgres-s3',
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
            name: 'Fluent OSS Experimental',
            oauthClientId: 'fluent-oss-postgres-s3',
            oauthClientName: 'Fluent OSS Experimental',
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
        `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Fluent OSS Experimental</title></head><body><h1>Fluent OSS Experimental</h1><p>Experimental Postgres + S3-backed single-user Fluent runtime.</p><p>MCP endpoint: <code>${origin}/mcp</code></p><p>Probe: <code>${origin}/codex-probe</code></p><p>Health: <code>${origin}/health</code></p></body></html>`,
      );
    }

    return writeJson(res, 404, { error: 'Not Found', request_id: randomUUID() });
  });

  server.listen(port, host, () => {
    process.stdout.write(`${JSON.stringify(experimentalStartupSummary(origin, runtime.paths), null, 2)}\n`);
  });

  const shutdown = async () => {
    server.close();
    await runtime.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
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
