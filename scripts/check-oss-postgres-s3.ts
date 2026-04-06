import { checkExperimentalRuntime, EXPERIMENTAL_DEFAULT_HOST, EXPERIMENTAL_DEFAULT_PORT } from '../src/experimental/runtime';
import { parseArgs } from './snapshot-support';

const args = parseArgs(process.argv.slice(2));
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
