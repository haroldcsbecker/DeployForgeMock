import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { OpenFeature } from '@openfeature/server-sdk';
import {
  getFeatureFlagClient,
  initializeFeatureFlags,
} from '../runtime/feature-flags/open-feature.mjs';

const flagsPath = new URL('../flags.goff.yaml', import.meta.url);

async function waitForValue(client, key, expected, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = await client.getStringValue(key, 'legacy');
    if (value === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error('Timed out waiting for ' + key + '=' + expected);
}

test('OpenFeature provider initializes and exposes current GO Feature Flag variants', async () => {
  await initializeFeatureFlags();

  const client = await getFeatureFlagClient('hmg');

  assert.equal(await client.getStringValue('payment-mode', 'legacy'), 'canary');
  assert.equal(await client.getStringValue('fraud-mode', 'legacy'), 'rule-based');
  assert.equal(await client.getStringValue('checkout-mode', 'legacy'), 'new');
});

test('boolean evaluation remains available through the standard OpenFeature API', async () => {
  const client = await getFeatureFlagClient('production');
  const enabled = await client.getBooleanValue('missing-boolean-flag', false);

  assert.equal(enabled, false);
});

test('HMG and Production use independent OpenFeature targeting contexts', async () => {
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

test('configuration changes are observed at runtime without rebuilding the application', async () => {
  assert.equal(existsSync(flagsPath), true);

  const original = readFileSync(flagsPath, 'utf8');
  const changed = original.replace(
    '    - query: environment eq "hmg"\n      variation: canary',
    '    - query: environment eq "hmg"\n      variation: new',
  );

  assert.notEqual(changed, original);

  const client = await getFeatureFlagClient('hmg');

  try {
    await waitForValue(client, 'payment-mode', 'canary');

    writeFileSync(flagsPath, changed, 'utf8');

    await waitForValue(client, 'payment-mode', 'new');
  } finally {
    writeFileSync(flagsPath, original, 'utf8');
    try {
      await waitForValue(client, 'payment-mode', 'canary');
    } catch {
      // The test process can terminate before the relay's final poll.
    }
  }
});

test('OpenFeature client identity remains stable across repeated lookups', async () => {
  const first = await getFeatureFlagClient('hmg');
  const second = await getFeatureFlagClient('hmg');

  assert.equal(OpenFeature.getClient('deployforge-mock:hmg'), first);
  assert.equal(second, first);
});
