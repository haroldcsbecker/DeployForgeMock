import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const server = readFileSync('runtime/server.mjs', 'utf8');
const resetHelper = readFileSync('scripts/reset-local-runtime.mjs', 'utf8');

const cleanStart = server.indexOf('const cleanDemoState = () => {');
const cleanEnd = server.indexOf('\n};', cleanStart);
assert.ok(cleanStart >= 0 && cleanEnd > cleanStart, 'local generated-state cleanup function missing');
const clean = server.slice(cleanStart, cleanEnd);

assert.match(clean, /clearDirectory\(environments\.hmg\.root\)/);
assert.match(clean, /clearDirectory\(environments\.prod\.root\)/);
assert.match(clean, /clearDirectory\(ARTIFACT_ROOT\)/);
assert.match(clean, /rmSync\(originBuildPath, \{ force: true \}\)/);
assert.doesNotMatch(clean, /clearDirectory\(DEV_ROOT\)/);
assert.doesNotMatch(clean, /clearDirectory\(REPO\)/);

const hmgResetIndex = server.indexOf("request.url === '/deploy/hmg/reset'");
const restoreIndex = server.indexOf("request.url === '/deploy/hmg/restore'", hmgResetIndex);
assert.ok(hmgResetIndex >= 0 && restoreIndex > hmgResetIndex, 'HMG reset route or following route missing');
const hmgReset = server.slice(hmgResetIndex, restoreIndex);
assert.match(hmgReset, /rmSync\(originBuildPath, \{ force: true \}\)/);
assert.match(hmgReset, /installArtifact\(artifactDigest, environments\.hmg/);
assert.doesNotMatch(hmgReset, /clearDirectory\(ARTIFACT_ROOT\)/,
  'HMG-only reset must preserve materialized historical artifacts');

assert.match(resetHelper, /loopbackHosts/);
assert.match(resetHelper, /redirect: 'error'/);
assert.match(resetHelper, /method: 'POST'/);
assert.doesNotMatch(resetHelper, /child_process|execFileSync|gh api|api\.github\.com|releases|packages/i,
  'local reset must not mutate GitHub state');

const clearStart = server.indexOf('const clearDirectory =');
const clearEnd = server.indexOf('\n};', clearStart);
assert.ok(clearStart >= 0 && clearEnd > clearStart, 'safe directory cleanup guard missing');
assert.match(server.slice(clearStart, clearEnd), /resolvedDirectory === resolvedRoot/);
assert.match(server.slice(clearStart, clearEnd), /resolve\(REPO\)/);

process.stdout.write('local runtime reset safety verification passed\n');
