import { createContainer, asClass, asValue } from 'awilix';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { OrderService } from './order-service.mjs';

const moduleUrl = (root, digest) =>
  pathToFileURL(join(root, 'runtime', 'strategy-definitions.mjs')).href + '?artifact=' + encodeURIComponent(digest);

export async function createApplicationRuntime({ environmentRoot, environment, artifactDigest, selections = {} }) {
  const container = createContainer({ strict: true });
  const logger = { events: [] };
  const database = { name: 'mock-database' };

  container.register({
    logger: asValue(logger),
    database: asValue(database),
    orderService: asClass(OrderService).singleton(),
  });

  const strategyModule = await import(moduleUrl(environmentRoot, artifactDigest));
  const deployStrategy = strategyModule.createDeployStrategy();
  await deployStrategy.attach(container, {
    selectionByStrategy: selections,
    environment,
    artifactDigest,
  });

  return {
    container,
    deployStrategy,
    manifest: deployStrategy.manifest(),
  };
}
