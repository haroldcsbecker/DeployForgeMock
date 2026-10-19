import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplicationRuntime } from '../runtime/app-container.mjs';

test('the active artifact supplies the example application runtime', async () => {
  const runtime = await createApplicationRuntime({
    environment: 'hmg',
    artifactDigest: 'sha256:test-artifact',
    environmentRoot: process.cwd(),
  });
  const service = runtime.container.resolve('orderService');
  const result = await service.checkout();

  assert.equal(runtime.environment, 'hmg');
  assert.equal(runtime.artifactDigest, 'sha256:test-artifact');
  assert.equal(result.database, 'mock-database');
  assert.equal(result.checkout.status, 'accepted');
  assert.equal(result.payment.status, 'authorized');
  assert.equal(result.total.amount, 42);
  assert.equal(result.total.currency, 'USD');
  assert.equal(typeof result.payment.implementationId, 'string');
});

test('the sample checkout is deterministic and has no runtime flag dependency', async () => {
  const runtime = await createApplicationRuntime({
    environment: 'prod',
    artifactDigest: 'sha256:stable',
    environmentRoot: process.cwd(),
  });
  const service = runtime.container.resolve('orderService');

  assert.deepEqual(await service.checkout(), await service.checkout());
  assert.deepEqual(Object.keys(service), ['database']);
});
