import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { OpenFeature } from '@openfeature/server-sdk';
import { createApplicationRuntime } from '../runtime/app-container.mjs';

const flagsPath = new URL('../flags.goff.yaml', import.meta.url);

test.after(async () => {
  await OpenFeature.close();
});

function fraudModeExpected() {
  const source = readFileSync(flagsPath, 'utf8').trim();
  return source !== '{}' && source.includes('fraud-mode:') ? 'rule-based' : 'legacy';
}

test('HMG application evaluates the configured fraud flag through OpenFeature', async () => {
  const runtime = await createApplicationRuntime({
    environment: 'hmg',
    artifactDigest: 'test-artifact',
    environmentRoot: process.cwd(),
  });

  const order = await runtime.container.resolve('orderService').checkout();

  assert.equal(order.featureFlags['fraud-mode'], fraudModeExpected());
  assert.equal(order.featureFlags['payment-mode'], 'legacy');
  assert.equal(order.featureFlags['checkout-mode'], 'legacy');
  assert.equal(order.payment.implementationId, 'legacy');
  assert.equal(order.payment.fraudImplementationId, fraudModeExpected());
  assert.equal(order.checkout.implementationId, 'legacy');
});

test('the same application service reflects HMG versus Production OpenFeature context without container rebuild', async () => {
  const runtime = await createApplicationRuntime({
    environment: 'hmg',
    artifactDigest: 'test-artifact',
    environmentRoot: process.cwd(),
  });

  const container = runtime.container;
  const orderService = container.resolve('orderService');
  const client = runtime.featureFlagClient;

  assert.equal((await orderService.checkout()).featureFlags['fraud-mode'], fraudModeExpected());

  await client.setContext({
    targetingKey: 'deployforge-production-test',
    environment: 'production',
  });

  const productionOrder = await orderService.checkout();

  assert.equal(container.resolve('orderService'), orderService);
  assert.equal(productionOrder.featureFlags['fraud-mode'], 'legacy');
  assert.equal(productionOrder.featureFlags['payment-mode'], 'legacy');
  assert.equal(productionOrder.featureFlags['checkout-mode'], 'legacy');

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
