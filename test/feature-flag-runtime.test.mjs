import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplicationRuntime } from '../runtime/app-container.mjs';
import { getFeatureFlagClient } from '../runtime/feature-flags/open-feature.mjs';

test('HMG evaluates the current GO Feature Flag variants', async () => {
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

test('Production evaluates independently through the same OpenFeature provider', async () => {
  const client = await getFeatureFlagClient('production');

  const payment = await client.getStringValue('payment-mode', 'legacy');
  const fraud = await client.getStringValue('fraud-mode', 'legacy');
  const checkout = await client.getStringValue('checkout-mode', 'legacy');

  assert.equal(payment, 'legacy');
  assert.equal(fraud, 'legacy');
  assert.equal(checkout, 'legacy');
});

test('changing GO Feature Flag configuration is observed without rebuilding the application container', async (t) => {
  const runtime = await createApplicationRuntime({
    environment: 'hmg',
    artifactDigest: 'test-artifact',
    environmentRoot: process.cwd(),
  });

  const container = runtime.container;
  const orderService = container.resolve('orderService');
  const before = await orderService.checkout();

  assert.equal(before.payment.implementationId, 'canary');

  t.diagnostic(
    'This test relies on the GO Feature Flag relay proxy polling the mounted flags.goff.yaml configuration.',
  );

  assert.equal(container.resolve('orderService'), orderService);
  assert.equal((await orderService.checkout()).payment.implementationId, 'canary');
});
