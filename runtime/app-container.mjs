import { createContainer, asClass, asFunction, asValue } from 'awilix';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { createFeatureFlagRegistry } from '../packages/feature-flag/src/index.mjs';
import { OrderService } from './order-service.mjs';

const moduleUrl = (root, digest) =>
  pathToFileURL(join(root, 'runtime', 'feature-flag-definitions.mjs')).href +
  '?artifact=' +
  encodeURIComponent(digest);

const assertManifestMatchesRegistry = (manifest, registry) => {
  const discovered = new Map(
    registry.getAllFeatureFlags().map((flag) => [flag.name, flag]),
  );

  for (const definition of manifest.featureFlags) {
    const flag = discovered.get(definition.id);
    if (!flag) {
      throw new Error(
        'Feature Flag "' +
          definition.id +
          '" was declared by the artifact but not registered by the application',
      );
    }

    if (flag.defaultValue !== definition.defaultValue) {
      throw new Error(
        'Feature Flag "' +
          definition.id +
          '" default mismatch between application and manifest',
      );
    }

    if (!definition.values.includes(flag.value)) {
      throw new Error(
        'Persisted Feature Flag selection "' +
          definition.id +
          '=' +
          flag.value +
          '" is not available in the active artifact',
      );
    }
  }
};

export async function createApplicationRuntime({
  environmentRoot,
  artifactDigest,
  storage,
}) {
  const featureFlagModule = await import(moduleUrl(environmentRoot, artifactDigest));
  const manifest = featureFlagModule.createFeatureFlagManifest();

  const featureFlagRegistry = createFeatureFlagRegistry();
  await featureFlagRegistry.configure({ storage });

  const featureFlag = featureFlagRegistry.featureFlag.bind(featureFlagRegistry);
  const featureFlags = featureFlagModule.registerFeatureFlags(featureFlag);

  assertManifestMatchesRegistry(manifest, featureFlagRegistry);

  const container = createContainer({ strict: true });
  const logger = { events: [] };
  const database = { name: 'mock-database' };

  container.register({
    logger: asValue(logger),
    database: asValue(database),
    featureFlag: asValue(featureFlag),
    featureFlagRegistry: asValue(featureFlagRegistry),

    paymentMode: asValue(featureFlags['payment-mode']),
    fraudMode: asValue(featureFlags['fraud-mode']),
    checkoutMode: asValue(featureFlags['checkout-mode']),

    fraudLegacy: asFunction(featureFlagModule.createFraudLegacy).singleton(),
    fraudRules: asFunction(featureFlagModule.createFraudRules).singleton(),

    legacyPaymentProcessor: asClass(featureFlagModule.LegacyPaymentProcessor).singleton(),
    newPaymentProcessor: asClass(featureFlagModule.NewPaymentProcessor).singleton(),
    canaryPaymentProcessor: asClass(featureFlagModule.CanaryPaymentProcessor).singleton(),

    orderService: asClass(OrderService).singleton(),
  });

  container.resolve('orderService');

  return {
    container,
    featureFlag,
    featureFlagRegistry,
    featureFlags,
    manifest,
  };
}
