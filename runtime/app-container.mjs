import { createContainer, asClass, asFunction, asValue } from 'awilix';
import { OrderService } from './order-service.mjs';
import { getFeatureFlagClient } from './feature-flags/open-feature.mjs';

export async function createApplicationRuntime({ environment, artifactDigest }) {
  const featureFlagClient = await getFeatureFlagClient(environment);
  const container = createContainer({ strict: true });
  const logger = { events: [] };
  const database = { name: 'mock-database' };

  container.register({
    logger: asValue(logger),
    database: asValue(database),
    featureFlagClient: asValue(featureFlagClient),
    fraudLegacy: asFunction(() => ({ implementationId: 'legacy', evaluate: () => ({ implementationId: 'legacy', approved: true }) })).singleton(),
    fraudRules: asFunction(() => ({ implementationId: 'rule-based', evaluate: () => ({ implementationId: 'rule-based', approved: true }) })).singleton(),
    legacyPaymentProcessor: asClass(LegacyPaymentProcessor).singleton(),
    newPaymentProcessor: asClass(NewPaymentProcessor).singleton(),
    canaryPaymentProcessor: asClass(CanaryPaymentProcessor).singleton(),
    orderService: asClass(OrderService).singleton(),
  });
  container.resolve('orderService');
  return { container, featureFlagClient, artifactDigest, environment };
}

class LegacyPaymentProcessor {
  constructor({ logger }) { this.logger = logger; }
  process({ fraudImplementationId }) { this.logger.events.push('payment:legacy'); return { implementationId: 'legacy', fraudImplementationId }; }
}
class NewPaymentProcessor {
  constructor({ logger }) { this.logger = logger; }
  process({ fraudImplementationId }) { this.logger.events.push('payment:new'); return { implementationId: 'new', fraudImplementationId }; }
}
class CanaryPaymentProcessor {
  constructor({ logger }) { this.logger = logger; }
  process({ fraudImplementationId }) { this.logger.events.push('payment:canary'); return { implementationId: 'canary', fraudImplementationId }; }
}
