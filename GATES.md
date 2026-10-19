# Server-flow rebuild gates

OWNS: runtime/server.mjs, runtime/deployment-contract.mjs, runtime/app-container.mjs, runtime/order-service.mjs, scripts/reset-local-runtime.mjs, scripts/verify-reset-artifacts.mjs, test/server-flow.integration.test.mjs, tests for runtime and adapter contracts

## P0: Make the target discoverable and define the adapter contract

- [x] C1: the control API advertises its identity, contract version, environment ports, ownership boundaries, and supported adapter operations.
  CHECK: `npm test`
  EXPECT: HTTP tests verify `GET /api/contract` and its stable schema.
  EVIDENCE: [CI 39270354083](https://github.com/haroldcsbecker/DeployForgeMock/actions/runs/39288786463) passed on `0e55048e72ad28baafeb8599dd876b9957432145`, including the expanded server-flow tests.

- [x] C2: process liveness is exposed independently of deployed-environment health.
  CHECK: `npm test`
  EXPECT: `GET /healthz` returns a stable service identifier and contract version.
  EVIDENCE: HTTP contract tests and isolated server-flow test passed in CI run [39270354083](https://github.com/haroldcsbecker/DeployForgeMock/actions/runs/39288786463).

## P1: Remove the old flag-oriented runtime path

- [x] R1: app startup and checkout evaluation require no external flag provider.
  CHECK: `npm install && npm test && npm run demo:check`
  EXPECT: runtime starts without a flag-provider container or SDK.
  EVIDENCE: no active flag provider/config files remain in the runtime tree; syntax checks and all 11 tests passed, including added server-flow assertions. in CI run [39270354083](https://github.com/haroldcsbecker/DeployForgeMock/actions/runs/39288786463).

- [x] R2: local reset is limited to generated runtime state, HMG-only reset preserves artifacts, DEV is preserved, and the CLI reset never mutates GitHub.
  CHECK: `node --check scripts/reset-local-runtime.mjs && npm run verify:reset`
  EXPECT: local runtime reset safety verification passes.
  EVIDENCE: `npm run verify:reset` passed in CI run [39270354083](https://github.com/haroldcsbecker/DeployForgeMock/actions/runs/39288786463). No reset command was executed against a real runtime or GitHub project.

## P2: Expand deterministic server-flow tests

- [x] T1: isolated HTTP tests prove artifact composition, HMG replacement, stale source rejection, exact-digest PROD deployment, missing-artifact rejection, health, and environment isolation.
  CHECK: `npm test`
  EXPECT: assertions verify HTTP responses, materialized/missing artifact verification, HMG readiness, active artifact preservation after invalid reset, and the application version actually served in each environment.
  EVIDENCE: [CI 39270354083](https://github.com/haroldcsbecker/DeployForgeMock/actions/runs/39288786463) passed the end-to-end server-flow test against temporary Git refs, separate loopback ports, and temporary runtime directories. Stale PR heads now return HTTP 409.

- [ ] T2: integration contract is proven in a shared end-to-end run with DeployForge.
  CHECK: after both PRs are merged, start the Mock on the configured local control port and verify `GET /api/deployment-target` reports `available`.
  EXPECT: DeployForge reports Mock identity and contract v1 as reachable, compatible, and healthy without mutating build state.
  EVIDENCE: DeployForge PR [#53](https://github.com/haroldcsbecker/DeployForge/pull/53) and this Mock PR are open; no shared runtime E2E or browser verification has been performed.
