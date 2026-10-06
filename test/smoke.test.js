import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('DEV is not a deployed environment directory', () => {
  assert.equal(fs.existsSync('environments/dev'), false);
});

test('HMG and PROD have materialization targets', () => {
  assert.equal(fs.existsSync('environments/hmg'), true);
  assert.equal(fs.existsSync('environments/prod'), true);
});

test('runtime server contains baseline bootstrap for deployed environments', () => {
  const source = fs.readFileSync('runtime/server.mjs', 'utf8');
  assert.match(source, /bootstrapDeployedEnvironments/);
  assert.match(source, /feature: 'Base main'/);
  assert.match(source, /findLatestArtifact/);
});
