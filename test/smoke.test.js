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

test('runtime server bootstraps deployed environments and exposes target discovery', () => {
  const source = fs.readFileSync('runtime/server.mjs', 'utf8');
  assert.match(source, /bootstrapDeployedEnvironments/);
  assert.match(source, /handleControlMetadataRequest/);
  assert.match(source, /findLatestArtifact/);
});

test('ready demo scenario changes the current application copy and refuses a no-op', () => {
  const workflow = fs.readFileSync('.github/workflows/generate-demo-scenarios.yml', 'utf8');
  assert.match(workflow, /Bot-ready scenario: this example artifact is ready/);
  assert.match(workflow, /Expected example-app text was not found/);
  assert.doesNotMatch(workflow, /Feature: loading/);
});
