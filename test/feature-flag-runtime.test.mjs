import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplicationRuntime } from '../runtime/app-container.mjs';

test('HMG application evaluates fraud, payment and checkout through OpenFeature', async () => {
  const runtime = await createApplicationRuntime({
    environment: 'hmg',
    artifactDigest: 'test-artifact',
    environmentRoot: process.cwd(),
  });

  const orderService = runtime.container.resolve('orderService');
  const order = await orderService.checkout();

  assert.equal(order.featureFlags['fraud-mode'], 'rule-based');
  assert.equal(order.featureFlags['payment-mode'], 'canary');
  assert.equal(order.featureFlags['checkout-mode'], 'new');
  assert.equal(order.payment.implementationId, 'canary');
  assert.equal(order.payment.fraudImplementationId, 'rule-based');
  assert.equal(order.checkout.implementationId, 'new');
});

test('the same application service reflects a changed OpenFeature context without container rebuild', async () => {
  const runtime = await createApplicationRuntime({
    environment: 'hmg',
    artifactDigest: 'test-artifact',
    environmentRoot: process.cwd(),
  });

  const container = runtime.container;
  const orderService = container.resolve('orderService');
  const client = runtime.featureFlagClient;

  assert.equal((await orderService.checkout()).payment.implementationId, 'canary');

  await client.setContext({
    targetingKey: 'deployforge-production-test',
    environment: 'production',
  });

  const order = await orderService.checkout();

  assert.equal(container.resolve('orderService'), orderService);
  assert.equal(order.payment.implementationId, 'legacy');
  assert.equal(order.featureFlags['payment-mode'], 'legacy');
  assert.equal(order.featureFlags['checkout-mode'], 'legacy');

  await client.setContext({
    targetingKey: 'deployforge-mock',
    environment: 'hmg',
  });
});

test('application runtime loads implementation code from the active artifact', async () => {
  const runtime = await createApplicationRuntime({
    environment: 'hmg',
    artifactDigest: 'test-artifact',
    environmentRoot: process.cwd(),
  });

  assert.ok(runtime.container.resolve('legacyPaymentProcessor'));
  assert.ok(runtime.container.resolve('newPaymentProcessor'));
  assert.ok(runtime.container.resolve('canaryPaymentProcessor'));
  assert.ok(runtime.container.resolve('orderService'));
});
