import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type FrozenContractSnapshot = {
  contractVersion: string;
  optionalCapabilities: string[];
  resources: string[];
  tools: string[];
};

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const defaultFrozenContractPath = path.join(rootDir, 'contracts', 'fluent-contract.v2.json');

export function readFrozenContractSnapshot(filePath = defaultFrozenContractPath): FrozenContractSnapshot {
  return JSON.parse(readFileSync(filePath, 'utf8')) as FrozenContractSnapshot;
}

export function extractCurrentToolNamesFromMarkdown(markdown: string): string[] {
  const matches = Array.from(markdown.matchAll(/<!-- current-tools:start -->([\s\S]*?)<!-- current-tools:end -->/g));
  const seen = new Set<string>();
  const tools: string[] = [];
  for (const match of matches) {
    for (const toolMatch of (match[1] ?? '').matchAll(/`(fluent_[a-z0-9_]+)`/g)) {
      const name = toolMatch[1];
      if (name && !seen.has(name)) {
        seen.add(name);
        tools.push(name);
      }
    }
  }
  return tools;
}

export function formatCodeList(items: readonly string[]) {
  return items.map((item) => `- \`${item}\``);
}

export function normalizeNewlines(value: string) {
  return value.replace(/\r\n/g, '\n');
}
