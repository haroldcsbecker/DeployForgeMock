# Local deployment runtime

DeployForgeMock is an example application and local deployment target used to demonstrate DeployForge's CI/CD behavior. DeployForge owns durable build decisions, source selection, commit approvals, production History, and rollback decisions. The Mock reports and runs artifacts; it does not make promotion decisions.

## Local services

| Service | Default URL | Role |
|---|---|---|
| Control API | http://127.0.0.1:8090 | Artifact and deployment adapter |
| DEV application | http://127.0.0.1:8081 | Current source checkout |
| HMG application | http://127.0.0.1:8082 | Current test artifact |
| PROD application | http://127.0.0.1:8083 | Current production artifact |

The control API listens on loopback by default. Do not expose it directly to an untrusted network.

## Discovery

- `GET /healthz` reports process liveness.
- `GET /api/contract` returns the service identity, contract version, environment ports, ownership boundaries, and supported adapter operations.

DeployForge should verify liveness and contract compatibility before it attempts a deployment. A reachable server is not proof that a deployed environment is healthy.

## Artifact and environment behavior

HMG receives one current artifact built from the configured Main SHA and selected PR head SHAs. A new source selection replaces the current testing artifact. HMG does not own durable build history.

PROD receives the exact artifact chosen by DeployForge after its production checks. Production History and rollback decisions stay in DeployForge; the Mock only materializes the artifact and reports runtime health.

## Validation

```bash
npm install
npm test
npm run demo:check
npm run verify:reset
```

Start the server with `npm run demo:start`. The server requires a Git checkout with the configured remote and base branch available; defaults are `origin/main`.

`npm run demo:reset` only calls the loopback control API to reset local generated runtime state. It does not create or close pull requests, delete GitHub releases, or delete container-package versions.
