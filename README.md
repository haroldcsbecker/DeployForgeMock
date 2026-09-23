# DeployForge Mock

A small deployment target used to demonstrate the DeployForge workflow with GO Feature Flag and OpenFeature.

## Runtime feature flags

The application uses **OpenFeature** as its application-facing flag API and the official **GO Feature Flag provider** for evaluation.

The runtime initializes the provider once at startup and uses remote evaluation through the GO Feature Flag relay proxy.

Example:

~~~js
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
~~~

There is no custom Feature Flag registry, Feature Switch layer, runtime proxy, or persisted flag-value store.

## Flags

Current demo flags:

- fraud-mode: legacy | rule-based
- checkout-mode: legacy | new
- payment-mode: legacy | new | canary

GO Feature Flag configuration is stored in:

~~~text
flags.goff.yaml
~~~

The local relay configuration is:

~~~text
goff-proxy.yaml
~~~

HMG and Production use different OpenFeature environment attributes for targeting.

## Local runtime

The local feature-flag path is:

~~~text
DeployForgeMock application
        |
        v
OpenFeature Node.js SDK
        |
        v
GO Feature Flag provider
        |
        v
GO Feature Flag relay :1031
~~~

Start GO Feature Flag:

~~~bash
docker compose up -d go-feature-flag
~~~

Then start the mock:

~~~bash
npm install
npm run demo:start
~~~

The runtime exposes:

- DEV application: http://localhost:8081
- HMG application: http://localhost:8082
- PROD application: http://localhost:8083
- GO Feature Flag relay proxy: http://localhost:1031
- deployment control API: http://localhost:8090

The provider endpoint can be overridden with:

~~~env
GO_FEATURE_FLAG_ENDPOINT=http://127.0.0.1:1031/
~~~

## Deployment model

DeployForgeMock implements the physical side of the new deployment flow.

HMG receives one current artifact:

~~~text
Main + selected PRs = current HMG artifact
~~~

A new selection replaces the current HMG artifact by rebuilding and deploying the composition. The mock does not persist a batch, candidate queue, or HMG artifact history.

Production receives the production artifact selected by DeployForge. Production rollback can restore a production release through the deployment adapter.

## Validation

Run:

~~~bash
docker compose up -d go-feature-flag
npm test
npm run demo:check
docker compose down -v
~~~

The tests verify OpenFeature initialization, string and boolean evaluation, environment targeting, runtime configuration refresh, and application service behavior.
