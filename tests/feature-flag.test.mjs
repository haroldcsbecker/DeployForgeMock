import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenFeature } from '@openfeature/server-sdk';
import {
  getFeatureFlagClient,
  initializeFeatureFlags,
} from '../runtime/feature-flags/open-feature.mjs';

test('OpenFeature provider initializes and exposes the current GO Feature Flag configuration', async () => {
  await initializeFeatureFlags();

  const client = await getFeatureFlagClient('hmg');

  assert.equal(
    await client.getStringValue('payment-mode', 'legacy'),
    'canary',
  );
  assert.equal(
    await client.getStringValue('fraud-mode', 'legacy'),
    'rule-based',
  );
  assert.equal(
    await client.getStringValue('checkout-mode', 'legacy'),
    'new',
  );
});

test('boolean evaluation remains available through the standard OpenFeature API', async () => {
  const client = await getFeatureFlagClient('production');

  const enabled = await client.getBooleanValue(
    'missing-boolean-flag',
    false,
  );

  assert.equal(enabled, false);
});

test('string flags support independent environment targeting through OpenFeature context', async () => {
  const hmgClient = await getFeatureFlagClient('hmg');
  const productionClient = await getFeatureFlagClient('production');

  assert.equal(await hmgClient.getStringValue('payment-mode', 'legacy'), 'canary');
  assert.equal(
    await productionClient.getStringValue('payment-mode', 'legacy'),
    'legacy',
  );

  assert.equal(
    hmgClient.getProviderMetadata().name.includes('GO Feature Flag'),
    true,
  );
});

test('OpenFeature configuration can be consumed by the existing application without a custom flag registry', async () => {
  const clientsBefore = [
    await getFeatureFlagClient('hmg'),
    await getFeatureFlagClient('production'),
  ];

  const values = await Promise.all(
    clientsBefore.map((client) =>
      client.getStringValue('checkout-mode', 'legacy'),
    ),
  );

  assert.deepEqual(values, ['new', 'legacy']);

  assert.equal(OpenFeature.getClient('deployforge-mock:hmg'), clientsBefore[0]);
  assert.equal(
    OpenFeature.getClient('deployforge-mock:production'),
    clientsBefore[1],
  );
});
