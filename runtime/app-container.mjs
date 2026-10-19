import { createContainer, asClass, asValue } from 'awilix';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const artifactModuleUrl = (root, file, digest) =>
  pathToFileURL(join(root, 'runtime', file)).href +
  '?artifact=' +
  encodeURIComponent(digest);

export async function createApplicationRuntime({
  environment,
  artifactDigest,
  environmentRoot,
}) {
  const { OrderService } = await import(
    artifactModuleUrl(environmentRoot, 'order-service.mjs', artifactDigest)
  );
  const container = createContainer({ strict: true });

  container.register({
    database: asValue({ name: 'mock-database' }),
    orderService: asClass(OrderService).singleton(),
  });

  container.resolve('orderService');

  return {
    container,
    artifactDigest,
    environment,
  };
}
