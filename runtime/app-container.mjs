import { createContainer, asClass, asFunction, asValue } from 'awilix';
import { OrderService } from './order-service.mjs';
import { getFeatureFlagClient } from './feature-flags/open-feature.mjs';
import { createFraudLegacy, createFraudRules } from './implementations/fraud.mjs';
import {
  CanaryPaymentProcessor,
  LegacyPaymentProcessor,
  NewPaymentProcessor,
} from './implementations/payment-processors.mjs';

export async function createApplicationRuntime({ environment, artifactDigest }) {
  const featureFlagClient = await getFeatureFlagClient(environment);

  const container = createContainer({ strict: true });
  const logger = { events: [] };
  const database = { name: 'mock-database' };

  container.register({
    logger: asValue(logger),
    database: asValue(database),
    featureFlagClient: asValue(featureFlagClient),

    fraudLegacy: asFunction(createFraudLegacy).singleton(),
    fraudRules: asFunction(createFraudRules).singleton(),

    legacyPaymentProcessor: asClass(LegacyPaymentProcessor).singleton(),
    newPaymentProcessor: asClass(NewPaymentProcessor).singleton(),
    canaryPaymentProcessor: asClass(CanaryPaymentProcessor).singleton(),

    orderService: asClass(OrderService).singleton(),
  });

  container.resolve('orderService');

  return {
    container,
    featureFlagClient,
    artifactDigest,
    environment,
  };
}
