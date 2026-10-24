import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
if (Number(process.versions.node.split('.')[0]) < 24) {
  console.error('Vortex tests require Node 24 or later.');
  process.exit(1);
}
function run(label, args) {
  console.log(`\n${label}`);
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) {
    if (result.error) console.error('The test runner could not start.');
    process.exit(result.status ?? 1);
  }
}
run('Vitest: shared contracts, API, desktop, extension and integration', [
  resolve(root, 'node_modules/vitest/vitest.mjs'), 'run',
]);
const nodeTests = ['services/intelligence/test', 'services/fetch-agent/test'].flatMap((folder) =>
  readdirSync(resolve(root, folder)).filter((name) => name.endsWith('.test.mjs'))
    .sort().map((name) => resolve(root, folder, name)));
run('Node: intelligence and linked Fetch unit tests (mock providers)', [
  '--test', '--test-reporter=spec', ...nodeTests,
]);
