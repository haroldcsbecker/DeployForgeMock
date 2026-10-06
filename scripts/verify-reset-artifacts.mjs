import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('runtime/server.mjs', 'utf8');

const resetIndex = source.indexOf("request.url === '/deploy/hmg/reset'");
assert.notEqual(resetIndex, -1, 'HMG reset route missing');

const resetSource = source.slice(resetIndex, resetIndex + 4000);

const clearArtifactsIndex = resetSource.indexOf('clearDirectory(ARTIFACT_ROOT)');
const clearOriginIndex = resetSource.indexOf("rmSync(originBuildPath, { force: true })");
const createManifestIndex = resetSource.indexOf('writeFileSync(manifest, JSON.stringify({');

assert.ok(clearArtifactsIndex >= 0, 'artifact store is not cleared');
assert.ok(clearOriginIndex >= 0, 'origin-build marker is not cleared');
assert.ok(createManifestIndex > clearArtifactsIndex, 'BASE manifest must be created after artifact cleanup');

process.stdout.write('local artifact reset verification passed\n');


const cleanSource = source.slice(0, resetIndex);
assert.doesNotMatch(cleanSource, /Object\.values\(environments\)\.forEach\(\(\{ root \}\) => clearDirectory\(root\)\)/);
assert.match(cleanSource, /clearDirectory\(environments\.hmg\.root\)/);
assert.match(cleanSource, /clearDirectory\(environments\.prod\.root\)/);
assert.doesNotMatch(cleanSource, /clearDirectory\(DEV_ROOT\)/);
assert.doesNotMatch(cleanSource, /clearDirectory\(REPO\)/);
assert.match(cleanSource, /if \(resolvedDirectory === resolvedRoot \|\| resolvedDirectory === resolve\(REPO\)\) \{/);
assert.match(cleanSource, /if \(resolvedDirectory === resolvedRoot \|\| resolvedDirectory === resolve\(REPO\)\) \{\n    return;/);
assert.match(cleanSource, /resolve\(directory\)/);
