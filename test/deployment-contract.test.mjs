import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import {
  DEPLOYFORGE_MOCK_CONTRACT,
  handleControlMetadataRequest,
} from '../runtime/deployment-contract.mjs';

const writeJson = (response, status, body) => {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  response.end(payload);
};

async function startServer(t) {
  const server = createServer((request, response) => {
    if (handleControlMetadataRequest(request, response, writeJson)) return;
    writeJson(response, 404, { error: 'Not found' });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const address = server.address();
  return 'http://127.0.0.1:' + address.port;
}

test('HTTP contract identifies Mock as an example target and DeployForge as decision authority', async (t) => {
  const baseUrl = await startServer(t);
  const response = await fetch(baseUrl + '/api/contract?client=deployforge');
  const contract = await response.json();

  assert.equal(response.status, 200);
  assert.equal(contract.id, 'deployforge-mock');
  assert.equal(contract.name, 'DeployForgeMock');
  assert.equal(contract.repository, 'https://github.com/haroldcsbecker/DeployForgeMock');
  assert.equal(contract.role, 'example-deployment-target');
  assert.equal(contract.contractVersion, 1);
  assert.equal(contract.authority.buildState, 'DeployForge');
  assert.equal(contract.authority.sourceSelection, 'DeployForge');
  assert.equal(contract.authority.commitDecisions, 'DeployForge');
  assert.equal(contract.authority.productionHistory, 'DeployForge');
  assert.deepEqual(contract.environments.map(({ id }) => id), ['dev', 'hmg', 'prod']);
});

test('HTTP liveness is separate from environment health', async (t) => {
  const baseUrl = await startServer(t);
  const response = await fetch(baseUrl + '/healthz');
  const health = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(health, {
    ok: true,
    status: 'alive',
    service: 'deployforge-mock',
    contractVersion: 1,
  });
});

test('contract lists the current deployment operations and no orchestration decisions', async (t) => {
  const baseUrl = await startServer(t);
  const response = await fetch(baseUrl + '/api/contract');
  const contract = await response.json();
  const paths = new Set(contract.operations.map(({ method, path }) => method + ' ' + path));

  assert.ok(paths.has('POST /artifact/build'));
  assert.ok(paths.has('POST /deploy/hmg'));
  assert.ok(paths.has('POST /deploy/prod'));
  assert.ok(paths.has('POST /prod/health'));
  assert.doesNotMatch(JSON.stringify(contract), /feature.?flag|openfeature|go-feature-flag/i);
  assert.equal(DEPLOYFORGE_MOCK_CONTRACT.contractVersion, 1);
});

test('unknown metadata paths are not claimed by the contract handler', async () => {
  let called = false;
  const handled = handleControlMetadataRequest(
    { method: 'GET', url: '/not-supported' },
    {},
    () => { called = true; },
  );
  assert.equal(handled, false);
  assert.equal(called, false);
});
