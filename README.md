# DeployForgeMock

DeployForgeMock is an **example application and local deployment target** that demonstrates the CI/CD flow provided by [DeployForge](https://github.com/haroldcsbecker/DeployForge). It is not a second orchestrator or source of deployment decisions.

DeployForge owns build state, source selection, approval/rejection, promotion, production History, and rollback decisions. DeployForgeMock builds/materializes the requested artifact, installs it into a local runtime environment, and exposes the application plus runtime health information.

## Local runtime

| Service | Default URL |
|---|---|
| Control API | http://127.0.0.1:8090 |
| DEV application | http://127.0.0.1:8081 |
| HMG application | http://127.0.0.1:8082 |
| PROD application | http://127.0.0.1:8083 |

The control API only binds to loopback by default. Do not expose it directly to an untrusted network.

## Requirements

- Node.js 24
- Git
- A checkout with an `origin` remote and `main` available

## Run locally

```bash
npm install
npm run demo:start
```

In another terminal, run the checks:

```bash
npm test
npm run demo:check
npm run verify:reset
```

To reset generated local runtime state while the server is running:

```bash
npm run demo:reset
```

The reset command only calls the local Mock control API. It does not mutate GitHub pull requests, releases, branches, or package versions.

## Discovery and integration contract

Before calling deployment operations, DeployForge can inspect:

- `GET /healthz`: whether the control process is alive.
- `GET /api/contract`: project identity, contract version, ownership boundaries, environments, and adapter capabilities.

The contract version is `1`. A contract mismatch must be reported as incompatible, not as a successful target connection. Process liveness and per-environment health are distinct checks.

## Deployment model

- **DEV** serves the source checkout for local demonstration.
- **HMG** serves the current composed test artifact. Replacing the source selection replaces the current HMG artifact.
- **PROD** serves the artifact DeployForge has chosen to deploy.
- **History** belongs to DeployForge. DeployForgeMock does not make rollback decisions or maintain production business history.

The deployed example application displays runtime metadata and provides a deterministic sample checkout endpoint. Those behaviors make the artifact currently running in each environment observable during a demonstration.

## Safety boundary

Deployment mutation endpoints are intended for a trusted local development environment. Keep the API on loopback unless authenticated access and network controls are added. Never use this simulator as a real production deployment target.
