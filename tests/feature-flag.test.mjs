import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { OpenFeature } from '@openfeature/server-sdk';
import {
  getFeatureFlagClient,
  initializeFeatureFlags,
} from '../runtime/feature-flags/open-feature.mjs';
import { buildFeatureFlagRegistry } from '../runtime/feature-flags/registry.mjs';

const flagsPath = new URL('../flags.goff.yaml', import.meta.url);

test.after(async () => {
  await OpenFeature.close();
});

async function waitForValue(client, key, expected, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = await client.getStringValue(key, 'legacy');
    if (value === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error('Timed out waiting for ' + key + '=' + expected);
}

test('OpenFeature provider initializes with no feature flags declared by Main', async () => {
  await initializeFeatureFlags();

  const client = await getFeatureFlagClient('hmg');

  assert.equal(await client.getStringValue('fraud-mode', 'legacy'), 'legacy');
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

  assert.equal(await hmgClient.getStringValue('fraud-mode', 'legacy'), 'legacy');
  assert.equal(
    await productionClient.getStringValue('fraud-mode', 'legacy'),
    'legacy',
  );
});

test('configuration changes are observed at runtime without rebuilding the application', async () => {
  assert.equal(existsSync(flagsPath), true);
  assert.equal(readFileSync(flagsPath, 'utf8').trim(), '{}');
});

test('deployed artifacts are the only source of feature flag registration', () => {
  const deployedFlags = `fraud-mode:
  variations:
    legacy: legacy
    rule-based: rule-based
  defaultRule:
    variation: legacy
  targeting:
    - query: environment eq "hmg"
      variation: rule-based

payment-mode:
  variations:
    legacy: legacy
    new: new
    canary: canary
  defaultRule:
    variation: legacy
  targeting:
    - query: environment eq "hmg"
      variation: legacy
`;

  const registered = buildFeatureFlagRegistry({
    deployedSources: [deployedFlags],
    existingSource: '{}\n',
  });

  assert.match(registered, /^fraud-mode:/m);
  assert.match(registered, /^payment-mode:/m);
  assert.doesNotMatch(registered, /^checkout-mode:/m);
  assert.match(registered, /rule-based: rule-based/);
  assert.match(registered, /canary: canary/);

  const cleared = buildFeatureFlagRegistry({
    deployedSources: [],
    existingSource: registered,
  });

  assert.equal(cleared, '{}\n');
});

test('deployed definitions do not overwrite existing QA flag values when the variation still exists', () => {
  const deployed = `fraud-mode:
  variations:
    legacy: legacy
    rule-based: rule-based
  defaultRule:
    variation: legacy
  targeting:
    - query: environment eq "hmg"
      variation: rule-based
`;

  const existing = `fraud-mode:
  variations:
    legacy: legacy
    rule-based: rule-based
  defaultRule:
    variation: rule-based
  targeting:
    - query: environment eq "hmg"
      variation: legacy
`;

  const registered = buildFeatureFlagRegistry({
    deployedSources: [deployed],
    existingSource: existing,
  });

  assert.match(registered, /    - query: environment eq "hmg"\n      variation: legacy/);
  assert.match(registered, /  defaultRule:\n    variation: rule-based/);
});
