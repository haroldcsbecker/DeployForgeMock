import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { OpenFeature } from '@openfeature/server-sdk';
import {
  getFeatureFlagClient,
  initializeFeatureFlags,
} from '../runtime/feature-flags/open-feature.mjs';

const flagsPath = new URL('../flags.goff.yaml', import.meta.url);

test.after(async () => {
  await OpenFeature.close();
});

function hasFraudFlag() {
  return readFileSync(flagsPath, 'utf8').trim() !== '{}'
    && readFileSync(flagsPath, 'utf8').includes('fraud-mode:');
}

async function waitForValue(client, key, expected, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = await client.getStringValue(key, 'legacy');
    if (value === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error('Timed out waiting for ' + key + '=' + expected);
}

test('OpenFeature provider initializes and exposes the configured fraud flag', async () => {
  await initializeFeatureFlags();

  const client = await getFeatureFlagClient('hmg');

  assert.equal(
    await client.getStringValue('fraud-mode', 'legacy'),
    hasFraudFlag() ? 'rule-based' : 'legacy',
  );
  assert.equal(await client.getStringValue('payment-mode', 'legacy'), 'legacy');
  assert.equal(await client.getStringValue('checkout-mode', 'legacy'), 'legacy');
});

test('boolean evaluation remains available through the standard OpenFeature API', async () => {
  const client = await getFeatureFlagClient('production');
  const enabled = await client.getBooleanValue('missing-boolean-flag', false);

  assert.equal(enabled, false);
});

test('HMG and Production use independent OpenFeature targeting contexts', async () => {
  const hmgClient = await getFeatureFlagClient('hmg');
  const productionClient = await getFeatureFlagClient('production');

  assert.equal(
    await hmgClient.getStringValue('fraud-mode', 'legacy'),
    hasFraudFlag() ? 'rule-based' : 'legacy',
  );
  assert.equal(
    await productionClient.getStringValue('fraud-mode', 'legacy'),
    'legacy',
  );
});

test('configuration changes are observed at runtime without rebuilding the application', async () => {
  assert.equal(existsSync(flagsPath), true);

  const original = readFileSync(flagsPath, 'utf8');
  if (!original.includes('fraud-mode:')) {
    const client = await getFeatureFlagClient('hmg');
    assert.equal(await client.getStringValue('fraud-mode', 'legacy'), 'legacy');
    return;
  }

  const changed = original.replace(
    '    - query: environment eq "hmg"\n      variation: rule-based',
    '    - query: environment eq "hmg"\n      variation: legacy',
  );

  assert.notEqual(changed, original);

  const client = await getFeatureFlagClient('hmg');

  try {
    await waitForValue(client, 'fraud-mode', 'rule-based');

    writeFileSync(flagsPath, changed, 'utf8');

    await waitForValue(client, 'fraud-mode', 'legacy');
  } finally {
    writeFileSync(flagsPath, original, 'utf8');
    try {
      await waitForValue(client, 'fraud-mode', 'rule-based');
    } catch {
      // The test process can terminate before the relay's final poll.
    }
  }
});
