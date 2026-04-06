import { importSnapshotIntoOss, SnapshotImportError } from './import-snapshot-support';
import { parseArgs } from './snapshot-support';

const args = parseArgs(process.argv.slice(2));

main().catch((error) => {
  if (error instanceof SnapshotImportError) {
    console.error(
      JSON.stringify(
        {
          message: error.message,
          ok: false,
          violationCount: error.violations.length,
          firstViolation: error.violations[0] ?? null,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});

async function main() {
  const result = await importSnapshotIntoOss({
    backend: args.backend,
    cwd: args.cwd,
    file: args.file,
    root: args.root,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        backend: result.backend,
        importedTables: result.importedTables,
        ossDb: result.databaseDescriptor,
        ossRoot: result.paths.rootDir,
        profileMetadata: result.relabeledProfileMetadata,
        snapshotFile: result.snapshotFile,
      },
      null,
      2,
    ),
  );
}
