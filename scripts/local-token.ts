import path from 'node:path';
import {
  ensureLocalTokenState,
  LOCAL_AUTH_MODEL,
  LOCAL_TOKEN_ENV,
  LOCAL_TOKEN_ENV_ALIASES,
  OSS_TOKEN_ENV,
  readLocalTokenState,
  resolveLocalTokenFile,
  rotateLocalTokenState,
} from '../src/local/auth';
import { resolveLocalRuntimePaths } from '../src/local/runtime';

const args = parseArgs(process.argv.slice(2));
const cwd = path.resolve(args.cwd ?? process.cwd());
const rootDir = args.root ? path.resolve(cwd, args.root) : undefined;
const action = String(args.action ?? args._command ?? 'print').toLowerCase();
const paths = resolveLocalRuntimePaths(rootDir);

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  let state;
  if (action === 'rotate') {
    state = rotateLocalTokenState(paths.rootDir);
  } else if (action === 'bootstrap') {
    state = ensureLocalTokenState(paths.rootDir);
  } else if (action === 'print' || action === 'read') {
    state = readLocalTokenState(paths.rootDir) ?? ensureLocalTokenState(paths.rootDir);
  } else {
    throw new Error(`Unsupported action "${action}". Use print, bootstrap, or rotate.`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        action,
        authModel: LOCAL_AUTH_MODEL,
        envVar: OSS_TOKEN_ENV,
        envVarAliases: [...LOCAL_TOKEN_ENV_ALIASES],
        legacyEnvVar: LOCAL_TOKEN_ENV,
        localRoot: paths.rootDir,
        tokenFile: resolveLocalTokenFile(paths.rootDir),
        scopes: state.scopes,
        token: state.token,
        createdAt: state.createdAt,
        rotatedAt: state.rotatedAt,
      },
      null,
      2,
    ),
  );
}

function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  let positionalIndex = 0;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      if (positionalIndex === 0) {
        result._command = token;
      } else {
        result[`_${positionalIndex}`] = token;
      }
      positionalIndex += 1;
      continue;
    }
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
