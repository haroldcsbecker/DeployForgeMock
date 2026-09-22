import assert from 'node:assert/strict';
import test from 'node:test';
import { DeployStrategy } from '../runtime/deploy-strategy.mjs';

test('feature flag uses the consolidated strategy runtime as a boolean value', async () => {
  const runtime = new DeployStrategy();

  runtime.register(
    'new-checkout',
    runtime.flag(false),
    { registration: 'newCheckoutEnabled' },
  );

  const manifest = runtime.manifest();
  const definition = manifest.strategies.find((item) => item.id === 'new-checkout');

  assert.equal(definition.kind, 'flag');
  assert.deepEqual(definition.implementations, ['disabled', 'enabled']);
  assert.equal(definition.defaultImplementation, 'disabled');

  await runtime.attach({}, {
    selectionByStrategy: {},
    environment: 'hmg',
    artifactDigest: 'sha256:' + 'a'.repeat(64),
  });

  assert.equal(runtime.isEnabled('new-checkout'), false);

  const result = await runtime.switchTo({}, 'new-checkout', 'enabled', {
    environment: 'hmg',
    artifactDigest: 'sha256:' + 'a'.repeat(64),
    actor: 'test',
  });

  assert.equal(result.changed, true);
  assert.equal(result.enabled, true);
  assert.equal(runtime.isEnabled('new-checkout'), true);

  await runtime.switchTo({}, 'new-checkout', 'disabled', {
    environment: 'hmg',
    artifactDigest: 'sha256:' + 'a'.repeat(64),
    actor: 'test',
  });

  assert.equal(runtime.isEnabled('new-checkout'), false);
});
