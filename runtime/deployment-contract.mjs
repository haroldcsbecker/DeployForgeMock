export const DEPLOYFORGE_MOCK_CONTRACT = Object.freeze({
  schemaVersion: 1,
  contractVersion: 1,
  id: 'deployforge-mock',
  name: 'DeployForgeMock',
  repository: 'https://github.com/haroldcsbecker/DeployForgeMock',
  role: 'example-deployment-target',
  description: 'A demonstration application and local deployment target for DeployForge CI/CD flows.',
  authority: {
    buildState: 'DeployForge',
    sourceSelection: 'DeployForge',
    commitDecisions: 'DeployForge',
    productionHistory: 'DeployForge',
    artifactMaterialization: 'DeployForgeMock',
    runtimeExecution: 'DeployForgeMock',
    runtimeHealth: 'DeployForgeMock',
  },
  controlApi: {
    defaultPort: 8090,
    identityPath: '/api/contract',
    livenessPath: '/healthz',
  },
  environments: [
    { id: 'dev', appPort: 8081 },
    { id: 'hmg', appPort: 8082 },
    { id: 'prod', appPort: 8083 },
  ],
  operations: [
    { method: 'POST', path: '/artifact/build-base', capability: 'artifact.build.base' },
    { method: 'POST', path: '/artifact/build', capability: 'artifact.build.hmg' },
    { method: 'POST', path: '/artifact/build-production', capability: 'artifact.build.production' },
    { method: 'POST', path: '/artifact/build-demo-ref', capability: 'artifact.build.reference' },
    { method: 'POST', path: '/artifact/verify', capability: 'artifact.verify' },
    { method: 'POST', path: '/demo/install-artifact', capability: 'artifact.install' },
    { method: 'POST', path: '/demo/reset', capability: 'runtime.reset.local' },
    { method: 'POST', path: '/deploy/base', capability: 'environment.deploy.base' },
    { method: 'POST', path: '/deploy/hmg', capability: 'environment.deploy.hmg' },
    { method: 'POST', path: '/deploy/hmg/reset', capability: 'environment.reset.hmg' },
    { method: 'POST', path: '/deploy/hmg/restore', capability: 'environment.restore.hmg' },
    { method: 'POST', path: '/deploy/hmg/remove', capability: 'environment.remove.hmg' },
    { method: 'POST', path: '/deploy/prod', capability: 'environment.deploy.prod' },
    { method: 'POST', path: '/hmg/ready', capability: 'environment.health.hmg' },
    { method: 'POST', path: '/prod/health', capability: 'environment.health.prod' },
  ],
});

export function handleControlMetadataRequest(request, response, writeJson) {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');

  if (request.method === 'GET' && url.pathname === '/api/contract') {
    writeJson(response, 200, DEPLOYFORGE_MOCK_CONTRACT);
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/healthz') {
    writeJson(response, 200, {
      ok: true,
      status: 'alive',
      service: DEPLOYFORGE_MOCK_CONTRACT.id,
      contractVersion: DEPLOYFORGE_MOCK_CONTRACT.contractVersion,
    });
    return true;
  }

  return false;
}
