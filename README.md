# DeployForge Mock

A deliberately small deployment target used to demonstrate the DeployForge workflow and runtime Feature Flag selection.

## Feature Flag runtime

There is one runtime concept: **Feature Flag**.

A Feature Flag contains a string selection and a map of named callbacks:

```ts
flag.select('canary', {
  legacy: legacyCallback,
  new: newCallback,
  canary: canaryCallback,
});
```

Two-option behavior uses the same API:

```ts
flag.select('legacy', {
  legacy: legacyCheckout,
  new: newCheckout,
});
```

The Feature Flag is deliberately independent from Awilix. Awilix constructs normal services; the Feature Flag only chooses which callback executes. Changing a value does not rebuild the container or restart the application.

Available demo flags:

- `fraud-mode`: `legacy | rule-based`
- `checkout-mode`: `legacy | new`
- `payment-mode`: `legacy | new | canary`

Selections are persisted independently for HMG and Production and are validated against the immutable active artifact.

## Environments

- DEV: http://localhost:8081
- HMG: http://localhost:8082
- PROD: http://localhost:8083
- deployment/Feature Flag control API: http://localhost:8090

Run:

```bash
npm install
npm run demo:start
```

## Validation

```bash
npm test
npm run demo:check
npm run feature-flag:validate
```

## Runtime API

Read the active Feature Flag state:

```
GET /deployforge-feature-flags-runtime.json
```

Read the artifact manifest:

```
POST /feature-flags/manifest
```

Change one environment's runtime selection:

```
POST /feature-flags/select

{
  "environment": "hmg",
  "featureFlagId": "payment-mode",
  "selectedValue": "canary",
  "artifactDigest": "sha256:..."
}
```

The selection endpoint validates that the flag and selected value exist in the currently active immutable artifact, mutates only runtime selection state, and then executes the existing application service with the selected callbacks.

Artifact rollback remains a deployment concern. The Feature Flag abstraction has no rollback or compensation API.

## Deployment isolation

HMG and Production use independent selection files:

```
environments/
  hmg/feature-flags.json
  prod/feature-flags.json
```

Changing a Feature Flag in HMG does not change Production and vice versa.

