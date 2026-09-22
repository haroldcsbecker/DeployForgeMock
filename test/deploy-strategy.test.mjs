import test from 'node:test';
import assert from 'node:assert/strict';
import { createContainer, asClass, asValue } from 'awilix';
import { DeployStrategy, validateStrategyGraph } from '../runtime/deploy-strategy.mjs';
import { createDeployStrategy } from '../runtime/strategy-definitions.mjs';
import { OrderService } from '../runtime/order-service.mjs';

test('uses first implementation when no explicit default exists', async () => {
  const strategy = new DeployStrategy();
  class A {}
  class B {}
  strategy.register('example', strategy.switchBetween(A, B), { registration: 'example' });
  const container = createContainer({ strict: true });
  await strategy.attach(container);
  assert.equal(strategy.selections().example, 'a');
  assert.equal(container.resolve('example') instanceof A, true);
});

test('preserves explicit implementation identifiers and default', async () => {
  const strategy = new DeployStrategy();
  class RenamedClass {}
  function OtherImplementation() {
    return { kind: 'function' };
  }
  strategy.register(
    'example',
    strategy.switchBetween(
      { id: 'legacy-safe', implementation: RenamedClass },
      { id: 'modern', implementation: OtherImplementation },
    ).default('modern'),
  );
  const container = createContainer({ strict: true });
  await strategy.attach(container);
  assert.equal(strategy.selections().example, 'modern');
  assert.equal(container.resolve('example').kind, 'function');
});

test('does not replace ordinary Awilix registrations', async () => {
  const strategy = createDeployStrategy();
  const container = createContainer({ strict: true });
  const logger = { events: [] };
  container.register({ logger: asValue(logger), database: asValue({ name: 'db' }), orderService: asClass(OrderService).singleton() });
  await strategy.attach(container);
  assert.equal(container.resolve('database').name, 'db');
  assert.equal(container.resolve('orderService').database.name, 'db');
});

test('resolves class and function strategies through Awilix', async () => {
  const strategy = createDeployStrategy();
  const container = createContainer({ strict: true });
  container.register({ logger: asValue({ events: [] }), database: asValue({ name: 'db' }), orderService: asClass(OrderService).singleton() });
  await strategy.attach(container);
  const order = container.resolve('orderService').checkout();
  assert.equal(order.payment.implementationId, 'legacy');
  assert.equal(order.payment.fraudImplementationId, 'legacy');
});

test('supports cascading strategy resolution', async () => {
  const strategy = createDeployStrategy();
  const container = createContainer({ strict: true });
  container.register({
    logger: asValue({ events: [] }),
    database: asValue({ name: 'db' }),
    orderService: asClass(OrderService).singleton(),
  });
  await strategy.attach(container, {
    selectionByStrategy: {
      'fraud-strategy': 'rule-based',
      'payment-processor': 'new',
    },
  });
  const payment = container.resolve('paymentProcessor').process();
  assert.equal(payment.implementationId, 'new');
  assert.equal(payment.fraudImplementationId, 'rule-based');
});

test('switches only the strategy-controlled registration', async () => {
  const strategy = createDeployStrategy();
  const container = createContainer({ strict: true });
  container.register({ logger: asValue({ events: [] }), database: asValue({ name: 'db' }), orderService: asClass(OrderService).singleton() });
  await strategy.attach(container);
  await strategy.switchTo(container, 'payment-processor', 'new', { environment: 'hmg', artifactDigest: 'sha256:test' });
  assert.equal(strategy.selections()['payment-processor'], 'new');
  assert.equal(container.resolve('paymentProcessor').process().implementationId, 'new');
  assert.equal(container.resolve('database').name, 'db');
});

test('validates circular strategy dependencies', () => {
  const definitions = [
    { id: 'a', implementations: [{ id: 'a', implementation: class A {} }], defaultImplementation: 'a', dependsOn: ['b'], dependencyCompatibility: {}, lifecycle: {}, rollback: {} },
    { id: 'b', implementations: [{ id: 'b', implementation: class B {} }], defaultImplementation: 'b', dependsOn: ['a'], dependencyCompatibility: {}, lifecycle: {}, rollback: {} },
  ];
  assert.throws(() => validateStrategyGraph(definitions), /Circular strategy dependency/);
});

test('executes implementation-specific compensation independently from switching', async () => {
  const strategy = createDeployStrategy();
  const result = await strategy.compensate('payment-processor', 'new', { environment: 'production' });
  assert.equal(result.compensated, true);
  assert.match(result.details, /new payment compensation/);
});

test('resolves consumers with the active strategy after a switch', async () => {
  const strategy = createDeployStrategy();
  const container = createContainer({ strict: true });
  container.register({
    logger: asValue({ events: [] }),
    database: asValue({ name: 'db' }),
    orderService: asClass(OrderService),
  });

  await strategy.attach(container);
  const before = container.resolve('orderService').checkout();
  assert.equal(before.payment.implementationId, 'legacy');

  await strategy.switchTo(container, 'payment-processor', 'new', {
    environment: 'hmg',
    artifactDigest: 'sha256:test',
  });

  const after = container.resolve('orderService').checkout();
  assert.equal(after.payment.implementationId, 'new');
});
