import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { SnapshotImportError } from '../src/local/import-snapshot';
import { createOssSnapshotRuntime, importSnapshotIntoDatabase } from './oss-snapshot-support';

export { SnapshotImportError };

export interface ImportedOssSnapshotResult {
  backend: string;
  databaseDescriptor: string;
  importedTables: number;
  paths: Awaited<ReturnType<typeof createOssSnapshotRuntime>>['paths'];
  relabeledProfileMetadata: Record<string, unknown>;
  snapshotFile: string;
}

export async function importSnapshotIntoOss(options: {
  backend?: string;
  cwd?: string;
  file?: string;
  origin?: string;
  root?: string;
}): Promise<ImportedOssSnapshotResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const snapshotFile = path.resolve(cwd, options.file ?? './tmp/fluent-hosted-snapshot.json');
  const rootDir = options.root ? path.resolve(cwd, options.root) : undefined;
  const runtime = await createOssSnapshotRuntime({
    backend: options.backend,
    origin: options.origin ?? 'http://127.0.0.1:8788',
    root: rootDir,
  });

  try {
    const snapshot = JSON.parse(await readFile(snapshotFile, 'utf8')) as {
      tables?: Record<string, Record<string, unknown>[]>;
    };
    const result = await importSnapshotIntoDatabase(runtime.db, { tables: snapshot.tables ?? {} });
    return {
      backend: runtime.backend,
      databaseDescriptor: runtime.databaseDescriptor,
      importedTables: result.importedTables,
      paths: runtime.paths,
      relabeledProfileMetadata: result.relabeledProfileMetadata,
      snapshotFile,
    };
  } finally {
    await runtime.close();
  }
}
