import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

const sourceRoot = process.cwd();

function trace(message) {
  process.stderr.write('[server-flow] ' + message + '\n');
}

function git(cwd, ...args) {
  trace('git -C ' + cwd + ' ' + args.join(' '));
  try {
    return execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000,
    }).trim();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const stderr = error && typeof error === 'object' && 'stderr' in error && Buffer.isBuffer(error.stderr)
      ? error.stderr.toString('utf8').trim()
      : '';
    throw new Error('Fixture Git command failed: git -C ' + cwd + ' ' + args.join(' ') + ': ' + detail + (stderr ? '\n' + stderr : ''));
  }
}

function gitInit(...args) {
  trace('git ' + args.join(' '));
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000,
    }).trim();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const stderr = error && typeof error === 'object' && 'stderr' in error && Buffer.isBuffer(error.stderr)
      ? error.stderr.toString('utf8').trim()
      : '';
    throw new Error('Fixture Git command failed: git ' + args.join(' ') + ': ' + detail + (stderr ? '\n' + stderr : ''));
  }
}

async function freePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const port = server.address().port;
  await new Promise((resolveClose, reject) => {
    server.close((error) => error ? reject(error) : resolveClose());
  });
  return port;
}

const orderService = (deploymentMarker) => `export class OrderService {
  constructor({ database }) {
    this.database = database;
  }

  async checkout() {
    return {
      database: this.database.name,
      deploymentMarker: ${JSON.stringify(deploymentMarker)},
      checkout: { implementationId: 'sample-checkout', status: 'accepted' },
      payment: { implementationId: 'simulated-payment-processor', status: 'authorized' },
      total: { amount: 42, currency: 'USD' },
    };
  }
}
`;

async function requestJson(url, method = 'GET', body) {
  trace('HTTP ' + method + ' ' + url);
  const response = await fetch(url, {
    method,
    headers: body === undefined ? { Accept: 'application/json' } : {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('Expected JSON from ' + url + ', got: ' + text.slice(0, 200));
  }
  trace('HTTP result ' + response.status + ' ' + url);
  return { status: response.status, body: payload };
}

async function startFixture(t) {
  trace('create isolated fixture');
  const tempRoot = mkdtempSync(join(tmpdir(), 'deployforge-mock-flow-'));
  let child;
  let logs = '';

  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const waitForExit = () => {
        if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
        return new Promise((resolveExit) => child.once('exit', resolveExit));
      };

      const gracefulExit = waitForExit();
      child.kill('SIGTERM');
      const stopped = await Promise.race([
        gracefulExit.then(() => true),
        delay(1500).then(() => false),
      ]);

      if (!stopped && child.exitCode === null && child.signalCode === null) {
        const forcedExit = waitForExit();
        child.kill('SIGKILL');
        await Promise.race([forcedExit, delay(1500)]);
      }
    }
    rmSync(tempRoot, { recursive: true, force: true });
  });

  const runtimeDir = join(tempRoot, 'runtime');
  mkdirSync(runtimeDir, { recursive: true });
  for (const path of [
    'runtime/server.mjs',
    'runtime/deployment-contract.mjs',
    'runtime/app-container.mjs',
    'runtime/order-service.mjs',
  ]) {
    copyFileSync(join(sourceRoot, path), join(tempRoot, path));
  }
  symlinkSync(resolve(sourceRoot, 'node_modules'), join(tempRoot, 'node_modules'), 'dir');

  const bare = join(tempRoot, 'origin.git');
  const checkout = join(tempRoot, 'source');
  gitInit('init', '--bare', '--initial-branch=main', bare);
  gitInit('init', '--initial-branch=main', checkout);
  git(checkout, 'config', 'user.name', 'DeployForge test fixture');
  git(checkout, 'config', 'user.email', 'fixture@example.invalid');
  mkdirSync(join(checkout, 'runtime'), { recursive: true });
  writeFileSync(join(checkout, 'index.html'), '<!doctype html><html><body>example app</body></html>\n');
  writeFileSync(join(checkout, 'styles.css'), 'body { font-family: sans-serif; }\n');
  writeFileSync(join(checkout, 'runtime/order-service.mjs'), orderService('main'));
  git(checkout, 'add', '.');
  git(checkout, 'commit', '-m', 'fixture: initial application');
  git(checkout, 'remote', 'add', 'origin', bare);
  git(checkout, 'push', '--set-upstream', 'origin', 'main');
  git(checkout, 'fetch', 'origin', 'main');

  git(checkout, 'switch', '-c', 'pr-one');
  writeFileSync(join(checkout, 'runtime/order-service.mjs'), orderService('pull-request-1'));
  git(checkout, 'add', 'runtime/order-service.mjs');
  git(checkout, 'commit', '-m', 'fixture: PR one');
  const prOneSha = git(checkout, 'rev-parse', 'HEAD');
  git(checkout, 'push', 'origin', 'HEAD:refs/pull/1/head');
  git(checkout, 'switch', 'main');

  git(checkout, 'switch', '-c', 'pr-two');
  writeFileSync(join(checkout, 'runtime/order-service.mjs'), orderService('pull-request-2'));
  git(checkout, 'add', 'runtime/order-service.mjs');
  git(checkout, 'commit', '-m', 'fixture: PR two');
  const prTwoSha = git(checkout, 'rev-parse', 'HEAD');
  git(checkout, 'push', 'origin', 'HEAD:refs/pull/2/head');
  git(checkout, 'switch', 'main');
  const mainSha = git(checkout, 'rev-parse', 'origin/main');

  trace('Git fixture with main and PR refs ready');
  const [controlPort, devPort, hmgPort, prodPort] = await Promise.all([
    freePort(), freePort(), freePort(), freePort(),
  ]);
  const env = {
    ...process.env,
    DEPLOYFORGE_MOCK_PROJECT_PATH: checkout,
    DEPLOYFORGE_MOCK_BASE_BRANCH: 'main',
    DEPLOYFORGE_MOCK_CONTROL_PORT: String(controlPort),
    DEPLOYFORGE_MOCK_DEV_PORT: String(devPort),
    DEPLOYFORGE_MOCK_HMG_PORT: String(hmgPort),
    DEPLOYFORGE_MOCK_PROD_PORT: String(prodPort),
  };

  trace('launch mock process on control port ' + controlPort);
  child = spawn(process.execPath, [join(tempRoot, 'runtime/server.mjs')], {
    cwd: tempRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (data) => { logs += data.toString(); });
  child.stderr.on('data', (data) => { logs += data.toString(); });

  const controlUrl = 'http://127.0.0.1:' + controlPort;
  const deadline = Date.now() + 20_000;
  let lastError = 'control API has not started';
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error('Mock runtime exited during startup. Output:\n' + logs);
    }
    try {
      const response = await fetch(controlUrl + '/healthz', {
        signal: AbortSignal.timeout(800),
      });
      if (response.ok) break;
      lastError = 'HTTP ' + response.status;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(100);
  }
  trace('control API readiness polling completed');
  const health = await requestJson(controlUrl + '/healthz');
  assert.equal(health.status, 200, 'control API did not start: ' + lastError + '\n' + logs);

  return {
    tempRoot,
    checkout,
    controlUrl,
    devUrl: 'http://127.0.0.1:' + devPort,
    hmgUrl: 'http://127.0.0.1:' + hmgPort,
    prodUrl: 'http://127.0.0.1:' + prodPort,
    mainSha,
    prOneSha,
    prTwoSha,
    logs: () => logs,
  };
}

test('isolated server flow builds and replaces HMG, deploys PROD, and preserves environment isolation', { timeout: 120_000 }, async (t) => {
  trace('begin server-flow test');
  const fixture = await startFixture(t);
  trace('server ready; begin request/response flow');
  const repository = 'example/deployforge-sample';

  const contract = await requestJson(fixture.controlUrl + '/api/contract');
  assert.equal(contract.status, 200);
  assert.equal(contract.body.id, 'deployforge-mock');
  assert.equal(contract.body.authority.buildState, 'DeployForge');

  const devBefore = await requestJson(fixture.devUrl + '/api/checkout');
  const hmgBefore = await requestJson(fixture.hmgUrl + '/api/checkout');
  const prodBefore = await requestJson(fixture.prodUrl + '/api/checkout');
  assert.equal(devBefore.status, 200);
  assert.equal(hmgBefore.status, 200);
  assert.equal(prodBefore.status, 200);
  assert.equal(devBefore.body.order.deploymentMarker, 'main');
  assert.equal(hmgBefore.body.order.deploymentMarker, 'main');
  assert.equal(prodBefore.body.order.deploymentMarker, 'main');

  const hmgBuildOneInput = {
    artifactId: 'integration-pr-one',
    repository,
    baseMainSha: fixture.mainSha,
    prNumbers: [1],
    prHeadShas: { 'pr-1': fixture.prOneSha },
  };
  trace('build HMG PR #1');
  const hmgBuildOne = await requestJson(
    fixture.controlUrl + '/artifact/build', 'POST', hmgBuildOneInput,
  );
  assert.equal(hmgBuildOne.status, 200, JSON.stringify(hmgBuildOne.body));
  assert.match(hmgBuildOne.body.artifactDigest, /^sha256:/);
  const verifyBuiltArtifact = await requestJson(fixture.controlUrl + '/artifact/verify', 'POST', {
    digest: hmgBuildOne.body.artifactDigest,
  });
  assert.equal(verifyBuiltArtifact.status, 200);
  assert.deepEqual(verifyBuiltArtifact.body, { ok: true, exists: true });

  const verifyMissingArtifact = await requestJson(fixture.controlUrl + '/artifact/verify', 'POST', {
    digest: 'sha256:not-materialized',
  });
  assert.equal(verifyMissingArtifact.status, 200);
  assert.deepEqual(verifyMissingArtifact.body, { ok: false, exists: false });

  trace('deploy HMG PR #1');
  const hmgDeployOne = await requestJson(fixture.controlUrl + '/deploy/hmg', 'POST', {
    ...hmgBuildOneInput,
    artifactDigest: hmgBuildOne.body.artifactDigest,
  });
  assert.equal(hmgDeployOne.status, 200, JSON.stringify(hmgDeployOne.body));
  assert.match(hmgDeployOne.body.deploymentId, /^hmg-/);
  const hmgReadiness = await requestJson(fixture.controlUrl + '/hmg/ready', 'POST', {
    deploymentId: hmgDeployOne.body.deploymentId,
  });
  assert.equal(hmgReadiness.status, 200);
  assert.equal(hmgReadiness.body.healthy, true);

  const hmgAfterOne = await requestJson(fixture.hmgUrl + '/api/checkout');
  const devAfterOne = await requestJson(fixture.devUrl + '/api/checkout');
  const prodAfterOne = await requestJson(fixture.prodUrl + '/api/checkout');
  assert.equal(hmgAfterOne.body.order.deploymentMarker, 'pull-request-1');
  assert.equal(hmgAfterOne.body.artifactDigest, hmgBuildOne.body.artifactDigest);
  assert.equal(devAfterOne.body.artifactDigest, devBefore.body.artifactDigest);
  assert.equal(prodAfterOne.body.artifactDigest, prodBefore.body.artifactDigest);

  const hmgBuildTwoInput = {
    artifactId: 'integration-pr-two',
    repository,
    baseMainSha: fixture.mainSha,
    prNumbers: [2],
    prHeadShas: { 'pr-2': fixture.prTwoSha },
  };
  trace('build HMG PR #2');
  const hmgBuildTwo = await requestJson(
    fixture.controlUrl + '/artifact/build', 'POST', hmgBuildTwoInput,
  );
  assert.equal(hmgBuildTwo.status, 200, JSON.stringify(hmgBuildTwo.body));
  assert.notEqual(hmgBuildTwo.body.artifactDigest, hmgBuildOne.body.artifactDigest);

  trace('deploy HMG PR #2');
  const hmgDeployTwo = await requestJson(fixture.controlUrl + '/deploy/hmg', 'POST', {
    ...hmgBuildTwoInput,
    artifactDigest: hmgBuildTwo.body.artifactDigest,
  });
  assert.equal(hmgDeployTwo.status, 200, JSON.stringify(hmgDeployTwo.body));

  const hmgAfterTwo = await requestJson(fixture.hmgUrl + '/api/checkout');
  assert.equal(hmgAfterTwo.body.order.deploymentMarker, 'pull-request-2');
  assert.equal(hmgAfterTwo.body.artifactDigest, hmgBuildTwo.body.artifactDigest);
  assert.equal((await requestJson(fixture.prodUrl + '/api/checkout')).body.artifactDigest, prodBefore.body.artifactDigest);

  git(fixture.checkout, 'switch', 'pr-two');
  writeFileSync(join(fixture.checkout, 'runtime/order-service.mjs'), orderService('pull-request-2-updated'));
  git(fixture.checkout, 'add', 'runtime/order-service.mjs');
  git(fixture.checkout, 'commit', '-m', 'fixture: update PR two after selection');
  const updatedPrTwoSha = git(fixture.checkout, 'rev-parse', 'HEAD');
  git(fixture.checkout, 'push', 'origin', 'HEAD:refs/pull/2/head');
  git(fixture.checkout, 'switch', 'main');

  trace('assert stale source heads are rejected');
  const staleBuild = await requestJson(fixture.controlUrl + '/artifact/build', 'POST', {
    ...hmgBuildTwoInput,
    prHeadShas: { 'pr-2': '0'.repeat(40) },
  });
  assert.equal(staleBuild.status, 409);
  assert.match(staleBuild.body.error, /PR #2 changed/);
  assert.notEqual(updatedPrTwoSha, fixture.prTwoSha);
  const hmgAfterStaleBuild = await requestJson(fixture.hmgUrl + '/api/checkout');
  assert.equal(hmgAfterStaleBuild.body.order.deploymentMarker, 'pull-request-2');
  assert.equal(hmgAfterStaleBuild.body.artifactDigest, hmgBuildTwo.body.artifactDigest);

  trace('build production artifact');
  const prodBuild = await requestJson(fixture.controlUrl + '/artifact/build-production', 'POST', {
    repository,
    sourceSha: fixture.mainSha,
    excludedShas: [],
  });
  assert.equal(prodBuild.status, 200, JSON.stringify(prodBuild.body));
  assert.match(prodBuild.body.artifactDigest, /^sha256:/);
  trace('deploy production artifact');
  const prodDeploy = await requestJson(fixture.controlUrl + '/deploy/prod', 'POST', {
    releaseId: 'integration-release',
    artifactDigest: prodBuild.body.artifactDigest,
    sourceSha: fixture.mainSha,
  });
  assert.equal(prodDeploy.status, 200, JSON.stringify(prodDeploy.body));
  const prodAfterDeploy = await requestJson(fixture.prodUrl + '/api/checkout');
  assert.equal(prodAfterDeploy.body.order.deploymentMarker, 'main');
  assert.equal(prodAfterDeploy.body.artifactDigest, prodBuild.body.artifactDigest);
  const prodHealth = await requestJson(fixture.controlUrl + '/prod/health', 'POST', {
    releaseId: 'integration-release',
  });
  assert.equal(prodHealth.status, 200);
  assert.equal(prodHealth.body.healthy, true);
  assert.equal((await requestJson(fixture.hmgUrl + '/api/checkout')).body.artifactDigest, hmgBuildTwo.body.artifactDigest);

  const missingArtifact = await requestJson(fixture.controlUrl + '/deploy/prod', 'POST', {
    releaseId: 'missing',
    artifactDigest: 'sha256:not-materialized',
    sourceSha: fixture.mainSha,
  });
  assert.equal(missingArtifact.status, 409);
  assert.equal((await requestJson(fixture.prodUrl + '/api/checkout')).body.artifactDigest, prodBuild.body.artifactDigest);

  trace('reject malformed HMG reset without changing the active artifact');
  const invalidHmgReset = await requestJson(fixture.controlUrl + '/deploy/hmg/reset', 'POST', {
    repository,
  });
  assert.equal(invalidHmgReset.status, 400);
  assert.equal(
    (await requestJson(fixture.hmgUrl + '/api/checkout')).body.artifactDigest,
    hmgBuildTwo.body.artifactDigest,
  );

  trace('reset HMG to Main');
  const hmgReset = await requestJson(fixture.controlUrl + '/deploy/hmg/reset', 'POST', {
    repository,
    mainSha: fixture.mainSha,
  });
  assert.equal(hmgReset.status, 200, JSON.stringify(hmgReset.body));
  const hmgAfterReset = await requestJson(fixture.hmgUrl + '/api/checkout');
  const prodAfterReset = await requestJson(fixture.prodUrl + '/api/checkout');
  assert.equal(hmgAfterReset.body.order.deploymentMarker, 'main');
  assert.notEqual(hmgAfterReset.body.artifactDigest, hmgBuildTwo.body.artifactDigest);
  const preservedHistoricalArtifact = await requestJson(fixture.controlUrl + '/artifact/verify', 'POST', {
    digest: hmgBuildTwo.body.artifactDigest,
  });
  assert.equal(preservedHistoricalArtifact.status, 200);
  assert.deepEqual(preservedHistoricalArtifact.body, { ok: true, exists: true });
  assert.equal((await requestJson(fixture.devUrl + '/api/checkout')).body.artifactDigest, devBefore.body.artifactDigest);
  assert.equal(prodAfterReset.body.artifactDigest, prodBuild.body.artifactDigest);
  assert.equal(prodAfterReset.body.order.deploymentMarker, 'main');
});
