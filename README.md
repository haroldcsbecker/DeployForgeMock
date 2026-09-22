# DeployForge Mock

A deliberately small deployment target used to demonstrate the DeployForge workflow and runtime FeatureFlag selection.

## FeatureFlag runtime

There is one runtime concept: **FeatureFlag**.

Registering a flag is synchronous and uses the default value until startup hydration completes:

```js
const paymentMode = featureFlag('payment-mode', 'legacy');
```

Application code selects the callback using the FeatureFlag's current value:

```js
paymentMode.select({
  legacy: () => legacyPayment(),
  new: () => newPayment(),
  canary: () => canaryPayment(),
});
```

Two-option behavior uses exactly the same API:

```js
const checkoutMode = featureFlag('checkout-mode', 'legacy');

checkoutMode.select({
  legacy: () => legacyCheckout(),
  new: () => newCheckout(),
});
```

Runtime changes use the same handle:

```js
await paymentMode.set('canary');
```

`set()` changes the in-memory value before awaiting storage persistence. It does not rebuild Awilix services, replace the container, or restart the application.

## Initialization and storage

The standalone package exposes an asynchronous initialization step:

```js
await configureFeatureFlags({ storage });
```

The core package depends on no database, HTTP client, DeployForge service, Redis client, or Awilix container. Persistence is supplied through an adapter implementing `getAll()` and `set(name, value)`.

The mock runtime uses a JSON file adapter for local persistence:

```
environments/
  hmg/feature-flags.json
  prod/feature-flags.json
```

The registry is process-local. Separate application instances have separate in-memory values unless an external synchronization mechanism is added by the integration layer.

## Package structure

```
packages/feature-flag/
  package.json
  src/
    core/
      feature-flag.mjs
      registry.mjs
      validation.mjs
    index.mjs
runtime/
  feature-flag-file-storage.mjs
```

The package can be extracted into npm without bringing DeployForge or Awilix with it.

## Available demo FeatureFlags

- `fraud-mode`: `legacy | rule-based`
- `checkout-mode`: `legacy | new`
- `payment-mode`: `legacy | new | canary`

## Environments

- DEV: http://localhost:8081
- HMG: http://localhost:8082
- PROD: http://localhost:8083
- deployment/FeatureFlag control API: http://localhost:8090

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

Read the active FeatureFlag state:

```
GET /deployforge-feature-flags-runtime.json
```

Read an artifact FeatureFlag manifest:

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

The selection endpoint validates the selected value against the active immutable artifact, calls `FeatureFlag.set()`, persists through the storage adapter, and reuses the existing application service.

Artifact rollback remains a deployment concern. The FeatureFlag abstraction has no rollback or compensation API.
