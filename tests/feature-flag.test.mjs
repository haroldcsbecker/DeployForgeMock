import assert from 'node:assert/strict';
import test from 'node:test';
import {
  configureFeatureFlags,
  createFeatureFlagRegistry,
  featureFlag,
} from '../packages/feature-flag/src/index.mjs';

const createMemoryStorage = (values = {}) => {
  const persisted = { ...values };
  let pending = Promise.resolve();

  return {
    values: persisted,
    async getAll() {
      return { ...persisted };
    },
    async set(name, value) {
      pending = pending.then(async () => {
        await Promise.resolve();
        persisted[name] = value;
      });
      return pending;
    },
    async create(name, value) {
      if (!(name in persisted)) persisted[name] = value;
    },
  };
};

test('package-level featureFlag API is synchronous and hydrates through configureFeatureFlags', async () => {
  const name = 'package-level-' + Date.now();
  const flag = featureFlag(name, 'legacy');
  const storage = createMemoryStorage({ [name]: 'new' });

  assert.equal(flag.value, 'legacy');

  await configureFeatureFlags({ storage });

  assert.equal(flag.value, 'new');
  assert.equal(featureFlag(name, 'legacy'), flag);
});

test('featureFlag(name, defaultValue) returns synchronously and registers automatically', () => {
  const registry = createFeatureFlagRegistry();
  const flag = registry.featureFlag('payment-mode', 'legacy');

  assert.equal(flag.name, 'payment-mode');
  assert.equal(flag.value, 'legacy');
  assert.deepEqual(registry.getAllFeatureFlags(), [
    {
      name: 'payment-mode',
      value: 'legacy',
      defaultValue: 'legacy',
      options: [],
    },
  ]);
});

test('existing persisted value overrides the declared default during async initialization', async () => {
  const registry = createFeatureFlagRegistry();
  const flag = registry.featureFlag('payment-mode', 'legacy');
  const storage = createMemoryStorage({ 'payment-mode': 'canary' });

  await registry.configure({ storage });

  assert.equal(flag.value, 'canary');
});

test('multiple calls to the same name return the same logical FeatureFlag entry', () => {
  const registry = createFeatureFlagRegistry();
  const first = registry.featureFlag('checkout-mode', 'legacy');
  const second = registry.featureFlag('checkout-mode', 'legacy');

  assert.equal(first, second);
  assert.equal(registry.getAllFeatureFlags().length, 1);
});

test('conflicting defaults for the same flag fail clearly', () => {
  const registry = createFeatureFlagRegistry();
  registry.featureFlag('checkout-mode', 'legacy');

  assert.throws(
    () => registry.featureFlag('checkout-mode', 'new'),
    /already registered with default "legacy"/,
  );
});

test('two-option selection executes the current value', async () => {
  const registry = createFeatureFlagRegistry();
  const flag = registry.featureFlag('checkout-mode', 'legacy');
  const calls = [];

  assert.equal(
    flag.select({
      legacy: () => {
        calls.push('legacy');
        return 'legacy-result';
      },
      new: () => {
        calls.push('new');
        return 'new-result';
      },
    }),
    'legacy-result',
  );

  await flag.set('new');

  assert.equal(
    flag.select({
      legacy: () => {
        calls.push('legacy');
        return 'legacy-result';
      },
      new: () => {
        calls.push('new');
        return 'new-result';
      },
    }),
    'new-result',
  );

  assert.deepEqual(calls, ['legacy', 'new']);
});

test('three-option selection executes canary', () => {
  const registry = createFeatureFlagRegistry();
  const flag = registry.featureFlag('payment-mode', 'legacy');
  const calls = [];

  void flag.set('canary');

  assert.equal(
    flag.select({
      legacy: () => calls.push('legacy'),
      new: () => calls.push('new'),
      canary: () => calls.push('canary'),
    }),
    undefined,
  );

  assert.deepEqual(calls, ['canary']);
});

test('unknown selected value throws instead of falling back', async () => {
  const registry = createFeatureFlagRegistry();
  const flag = registry.featureFlag('payment-mode', 'legacy');

  await flag.set('unknown');

  assert.throws(
    () =>
      flag.select({
        legacy: () => 'legacy',
        new: () => 'new',
      }),
    /selected value "unknown" with no matching callback/,
  );
});

test('missing selected option throws clearly', async () => {
  const registry = createFeatureFlagRegistry();
  const flag = registry.featureFlag('payment-mode', 'legacy');

  await flag.set('canary');

  assert.throws(
    () =>
      flag.select({
        legacy: () => 'legacy',
        new: () => 'new',
      }),
    /selected value "canary" with no matching callback/,
  );
});

test('non-callable selected option throws clearly', () => {
  const registry = createFeatureFlagRegistry();
  const flag = registry.featureFlag('payment-mode', 'legacy');

  assert.throws(
    () =>
      flag.select({
        legacy: 'not-callable',
      }),
    /option "legacy" is not callable/,
  );
});

test('set updates in-memory state before storage persistence completes', async () => {
  const registry = createFeatureFlagRegistry();
  const storage = {
    value: 'legacy',
    async getAll() {
      return { 'payment-mode': this.value };
    },
    async set(_name, value) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      this.value = value;
    },
  };

  await registry.configure({ storage });
  const flag = registry.featureFlag('payment-mode', 'legacy');

  const pending = flag.set('canary');
  assert.equal(flag.value, 'canary');
  assert.equal(flag.select({
    legacy: () => 'legacy',
    canary: () => 'canary',
  }), 'canary');

  await pending;
  assert.equal(storage.value, 'canary');
});

test('multiple flags are independent', async () => {
  const registry = createFeatureFlagRegistry();
  const paymentMode = registry.featureFlag('payment-mode', 'legacy');
  const checkoutMode = registry.featureFlag('checkout-mode', 'legacy');

  await paymentMode.set('canary');
  await checkoutMode.set('new');

  assert.equal(
    paymentMode.select({
      legacy: () => 'legacy',
      new: () => 'new',
      canary: () => 'canary',
    }),
    'canary',
  );
  assert.equal(
    checkoutMode.select({
      legacy: () => 'legacy',
      new: () => 'new',
    }),
    'new',
  );
});
