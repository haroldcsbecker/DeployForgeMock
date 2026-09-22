import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplicationRuntime } from '../runtime/app-container.mjs';

const createMemoryStorage = (values = {}) => ({
  values: { ...values },
  async getAll() {
    return { ...this.values };
  },
  async set(name, value) {
    this.values[name] = value;
  },
});

test('initialization hydrates payment, fraud and checkout values before application startup', async () => {
  const storage = createMemoryStorage({
    'fraud-mode': 'rule-based',
    'payment-mode': 'canary',
    'checkout-mode': 'new',
  });

  const runtime = await createApplicationRuntime({
    environmentRoot: process.cwd(),
    artifactDigest: 'test',
    storage,
  });

  const order = runtime.container.resolve('orderService').checkout();

  assert.equal(order.payment.implementationId, 'canary');
  assert.equal(order.payment.fraudImplementationId, 'rule-based');
  assert.equal(order.checkout.implementationId, 'new');
  assert.deepEqual(order.featureFlags, {
    'fraud-mode': 'rule-based',
    'payment-mode': 'canary',
    'checkout-mode': 'new',
  });
});

test('changing a runtime FeatureFlag does not recreate Awilix or the singleton service', async () => {
  const storage = createMemoryStorage({
    'fraud-mode': 'legacy',
    'payment-mode': 'legacy',
    'checkout-mode': 'legacy',
  });

  const runtime = await createApplicationRuntime({
    environmentRoot: process.cwd(),
    artifactDigest: 'test',
    storage,
  });

  const container = runtime.container;
  const orderService = container.resolve('orderService');
  const paymentMode = runtime.featureFlags['payment-mode'];

  assert.equal(orderService.checkout().payment.implementationId, 'legacy');

  await paymentMode.set('new');

  assert.equal(container, runtime.container);
  assert.equal(container.resolve('orderService'), orderService);
  assert.equal(orderService.checkout().payment.implementationId, 'new');
  assert.equal(storage.values['payment-mode'], 'new');
});

test('all application FeatureFlags are discovered through the registry and use string values', async () => {
  const runtime = await createApplicationRuntime({
    environmentRoot: process.cwd(),
    artifactDigest: 'test',
    storage: createMemoryStorage(),
  });

  const discovered = runtime.featureFlagRegistry.getAllFeatureFlags();

  assert.deepEqual(
    discovered.map((flag) => flag.name).sort(),
    ['checkout-mode', 'fraud-mode', 'payment-mode'],
  );

  for (const flag of discovered) {
    assert.equal(typeof flag.value, 'string');
    assert.equal(typeof flag.defaultValue, 'string');
  }
});
