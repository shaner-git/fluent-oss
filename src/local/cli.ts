import path from 'node:path';

export interface ParsedCliArgs {
  [key: string]: string | undefined;
}

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const result: ParsedCliArgs = {};
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

    const eqIndex = token.indexOf('=');
    if (eqIndex > 2) {
      result[token.slice(2, eqIndex)] = token.slice(eqIndex + 1);
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

export function cliString(args: ParsedCliArgs, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = args[key];
    if (isUsableValue(value)) {
      return value.trim();
    }
  }
  return undefined;
}

export function resolveCliRoot(input: {
  args: ParsedCliArgs;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}): string | undefined {
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const env = input.env ?? process.env;
  const value =
    cliString(input.args, 'root') ??
    npmConfigValue(env, 'root') ??
    envValue(env, 'FLUENT_OSS_ROOT', 'FLUENT_LOCAL_ROOT');
  return value ? path.resolve(cwd, value) : undefined;
}

export function resolveCliBaseUrl(input: {
  args: ParsedCliArgs;
  defaultBaseUrl: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const env = input.env ?? process.env;
  return (
    cliString(input.args, 'base-url', 'baseUrl') ??
    npmConfigValue(env, 'base-url', 'baseUrl') ??
    envValue(env, 'FLUENT_OSS_BASE_URL', 'FLUENT_LOCAL_BASE_URL') ??
    input.defaultBaseUrl
  ).replace(/\/$/, '');
}

function npmConfigValue(env: NodeJS.ProcessEnv, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const normalized = key.replace(/-/g, '_').toLowerCase();
    const value = envValue(env, `npm_config_${normalized}`);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function envValue(env: NodeJS.ProcessEnv, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = env[key];
    if (isUsableValue(value)) {
      return value.trim();
    }
  }
  return undefined;
}

function isUsableValue(value: string | undefined): value is string {
  if (!value) {
    return false;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed !== 'true' && trimmed !== 'false';
}
