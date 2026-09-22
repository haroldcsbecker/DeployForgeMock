import { createContainer, asClass, asFunction, asValue } from 'awilix';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { FeatureFlag } from './feature-flag.mjs';
import { OrderService } from './order-service.mjs';

const moduleUrl = (root, digest) =>
  pathToFileURL(join(root, 'runtime', 'feature-flag-definitions.mjs')).href + '?artifact=' + encodeURIComponent(digest);

export async function createApplicationRuntime({ environmentRoot, artifactDigest, selections = {} }) {
  const featureFlagModule = await import(moduleUrl(environmentRoot, artifactDigest));
  const definitions = featureFlagModule.createFeatureFlagDefinitions();
  const featureSelections = Object.fromEntries(
    definitions.map((definition) => [
      definition.id,
      selections[definition.id] ?? definition.defaultValue,
    ]),
  );

  const invalidSelections = Object.entries(selections).filter(([featureFlagId, selectedValue]) => {
    const definition = definitions.find((item) => item.id === featureFlagId);
    return !definition || !definition.values.includes(selectedValue);
  });
  if (invalidSelections.length) {
    throw new Error(
      'Persisted Feature Flag selection is not available in artifact: ' +
        invalidSelections.map(([featureFlagId, selectedValue]) => featureFlagId + '=' + selectedValue).join(', '),
    );
  }

  const container = createContainer({ strict: true });
  const logger = { events: [] };
  const database = { name: 'mock-database' };

  container.register({
    logger: asValue(logger),
    database: asValue(database),
    featureFlag: asClass(FeatureFlag).singleton(),
    featureSelections: asValue(featureSelections),

    fraudLegacy: asFunction(featureFlagModule.createFraudLegacy).singleton(),
    fraudRules: asFunction(featureFlagModule.createFraudRules).singleton(),

    legacyPaymentProcessor: asClass(featureFlagModule.LegacyPaymentProcessor).singleton(),
    newPaymentProcessor: asClass(featureFlagModule.NewPaymentProcessor).singleton(),
    canaryPaymentProcessor: asClass(featureFlagModule.CanaryPaymentProcessor).singleton(),

    orderService: asClass(OrderService).singleton(),
  });

  const manifest = featureFlagModule.createFeatureFlagManifest();
  return {
    container,
    featureFlag: container.resolve('featureFlag'),
    featureSelections,
    manifest,
  };
}
