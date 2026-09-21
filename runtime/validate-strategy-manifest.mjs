import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDeployStrategy } from './strategy-definitions.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const expected = JSON.parse(readFileSync(join(root, 'deployforge-strategy-manifest.json'), 'utf8'));
const actual = createDeployStrategy().manifest();

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  console.error('DeployStrategy manifest is stale or inconsistent with the runtime definitions');
  console.error(JSON.stringify({ expected, actual }, null, 2));
  process.exit(1);
}

createDeployStrategy().validate();
console.log('DeployStrategy manifest and graph are valid');
