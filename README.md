# DeployForge Mock

A deliberately small deployment target used to demonstrate the DeployForge workflow with GO Feature Flag and OpenFeature.

## Runtime feature flags

The application uses **OpenFeature** as its application-facing flag API and the official **GO Feature Flag provider** for evaluation.

The runtime initializes the provider once at startup and uses **in-process evaluation**, so application evaluations do not perform a network request for every flag lookup.

Example:

```js
const paymentMode = await featureFlagClient.getStringValue(
  'payment-mode',
  'legacy',
);

const processors = {
  legacy: legacyPaymentProcessor,
  new: newPaymentProcessor,
  canary: canaryPaymentProcessor,
};

const processor = processors[paymentMode] ?? legacyPaymentProcessor;
```

Two-option behavior uses standard OpenFeature string or boolean evaluation. There is no custom `FeatureFlag`, Feature Switch, callback registry, runtime proxy, or flag persistence layer.

## Flags

Current demo flags:

- `fraud-mode`: `legacy | rule-based`
- `checkout-mode`: `legacy | new`
- `payment-mode`: `legacy | new | canary`

The GO Feature Flag configuration is stored in:

```
flags.goff.yaml
```

The local relay proxy configuration is:

```
goff-proxy.yaml
```

HMG, Production and other contexts are selected through the OpenFeature evaluation context. The current demo uses the same targeting key and adds an `environment` attribute for targeting.

## Local runtime

The complete local feature-flag path is:

```
Docker Compose
    ↓
GO Feature Flag relay proxy :1031
    ↓
OpenFeature Node.js SDK
    ↓
GO Feature Flag provider
    ↓
DeployForgeMock application
```

Start GO Feature Flag:

```bash
docker compose up -d go-feature-flag
```

Then start the mock:

```bash
npm install
npm run demo:start
```

The runtime exposes:

- DEV application: http://localhost:8081
- HMG application: http://localhost:8082
- PROD application: http://localhost:8083
- GO Feature Flag relay proxy: http://localhost:1031
- deployment control API: http://localhost:8090

The provider endpoint can be overridden with:

```env
GO_FEATURE_FLAG_ENDPOINT=http://127.0.0.1:1031/
```

The default is the local relay proxy above.

## Configuration changes

GO Feature Flag owns runtime configuration. Editing `flags.goff.yaml` changes the provider configuration; the Node provider polls for configuration changes while the process remains running.

No DeployForge database update, artifact rebuild, container rebuild or application restart is required for a supported configuration refresh.

## Deployment separation

DeployForgeMock does not persist feature-flag values in `environments/*` and does not expose a custom Feature Flag REST API.

DeployForge remains responsible for:

- immutable artifacts
- HMG deployment and QA
- Production deployment
- GMUD
- artifact rollback

GO Feature Flag remains responsible for:

- flag configuration
- variants and values
- targeting
- runtime evaluation

Changing a flag is a runtime configuration operation, not an artifact rollback.

## Validation

Run:

```bash
docker compose up -d go-feature-flag
npm test
npm run demo:check
docker compose down -v
```

The tests verify OpenFeature initialization, boolean and string evaluation, environment targeting, and application service behavior without dependency-container replacement.

<!-- ci: goff-openfeature validation -->
