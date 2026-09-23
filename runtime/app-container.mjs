import { createContainer, asClass, asFunction, asValue } from 'awilix';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getFeatureFlagClient } from './feature-flags/open-feature.mjs';

const artifactModuleUrl = (root, file, digest) =>
  pathToFileURL(join(root, 'runtime', file)).href +
  '?artifact=' +
  encodeURIComponent(digest);

export async function createApplicationRuntime({
  environment,
  artifactDigest,
  environmentRoot,
}) {
  const [
    { OrderService },
    { createFraudLegacy, createFraudRules },
    {
      CanaryPaymentProcessor,
      LegacyPaymentProcessor,
      NewPaymentProcessor,
    },
  ] = await Promise.all([
    import(artifactModuleUrl(environmentRoot, 'order-service.mjs', artifactDigest)),
    import(artifactModuleUrl(environmentRoot, 'implementations/fraud.mjs', artifactDigest)),
    import(artifactModuleUrl(environmentRoot, 'implementations/payment-processors.mjs', artifactDigest)),
  ]);

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
