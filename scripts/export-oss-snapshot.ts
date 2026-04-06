import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOssSnapshotRuntime, exportSnapshotTables } from './oss-snapshot-support';
import { createSnapshotEnvelope, parseArgs, SNAPSHOT_TABLES, type FluentSnapshot, writeSnapshotFile } from './snapshot-support';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export async function createOssSnapshot(options: {
  backend?: string;
  cwd?: string;
  origin?: string;
  root?: string;
}): Promise<{ backend: string; paths: Awaited<ReturnType<typeof createOssSnapshotRuntime>>['paths']; snapshot: FluentSnapshot }> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const rootDir = options.root ? path.resolve(cwd, options.root) : undefined;
  const runtime = await createOssSnapshotRuntime({
    backend: options.backend,
    origin: options.origin ?? 'http://127.0.0.1:8788',
    root: rootDir,
  });

  try {
    const snapshot = createSnapshotEnvelope({
      backendMode: 'local',
      database: runtime.databaseDescriptor,
      deploymentTrack: 'oss',
    });
    snapshot.tables = await exportSnapshotTables(runtime.db, SNAPSHOT_TABLES);

    return {
      backend: runtime.backend,
      paths: runtime.paths,
      snapshot,
    };
  } finally {
    await runtime.close();
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cwd = path.resolve(args.cwd ?? process.cwd());
  const outFile = path.resolve(cwd, args.out ?? './tmp/fluent-oss-snapshot.json');
  const { backend, paths, snapshot } = await createOssSnapshot({
    backend: args.backend,
    cwd,
    origin: args.origin,
    root: args.root,
  });

  await writeSnapshotFile(outFile, snapshot);
  console.log(
    JSON.stringify(
      {
        ok: true,
        backend,
        outFile,
        ossDb: snapshot.database,
        ossRoot: paths.rootDir,
        tableCount: SNAPSHOT_TABLES.length,
      },
      null,
      2,
    ),
  );
}
