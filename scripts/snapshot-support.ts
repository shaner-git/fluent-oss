import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const SNAPSHOT_EXPORT_VERSION = '2026-03-28.fluent-core-v1.3';

export const SNAPSHOT_TABLES = [
  'fluent_tenants',
  'fluent_profile',
  'fluent_domains',
  'domain_events',
  'style_profile',
  'style_items',
  'style_item_photos',
  'style_item_profiles',
  'style_item_provenance',
  'meal_recipes',
  'meal_preferences',
  'meal_plans',
  'meal_plan_entries',
  'meal_grocery_plans',
  'meal_inventory_items',
  'meal_memory',
  'meal_feedback',
  'meal_plan_reviews',
  'meal_grocery_runs',
  'meal_brand_preferences',
  'grocery_intents',
  'artifacts',
] as const;

export interface FluentSnapshot {
  backend_mode: string;
  contract_version: string;
  created_at: string;
  database: string;
  deployment_track?: 'cloud' | 'oss';
  tables: Record<string, Array<Record<string, unknown>>>;
}

export function createSnapshotEnvelope(options: {
  backendMode: string;
  database: string;
  deploymentTrack?: 'cloud' | 'oss';
}): FluentSnapshot {
  return {
    backend_mode: options.backendMode,
    contract_version: SNAPSHOT_EXPORT_VERSION,
    created_at: new Date().toISOString(),
    database: options.database,
    ...(options.deploymentTrack ? { deployment_track: options.deploymentTrack } : {}),
    tables: {},
  };
}

export async function writeSnapshotFile(outFile: string, snapshot: FluentSnapshot): Promise<void> {
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

export function parseArgs(argv: string[]): Record<string, string> {
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
