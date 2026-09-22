# DeployForge Feature Flag flow

The runtime has one concept: **Feature Flag**.

## Core model

```
Feature Flag
    |
    +-- selected string value
    |
    +-- named callbacks
```

Example:

```ts
flag.select('canary', {
  legacy: legacyPayment,
  new: newPayment,
  canary: canaryPayment,
});
```

A two-value selection is not a different type:

```ts
flag.select('legacy', {
  legacy: legacyCheckout,
  new: newCheckout,
});
```

## Awilix boundary

```
Awilix
  |
  +-- normal services/dependencies
  |
  +-- FeatureFlag singleton
          |
          +-- selected value
          |
          +-- callback map supplied by the application
```

The FeatureFlag implementation never registers, proxies, resolves, or replaces Awilix services.

Changing a selection only updates the environment's persisted string value. The existing application container remains alive.

## Environment state

```
                     Feature Flag: payment-mode
                              |
                +-------------+-------------+
                |                           |
              HMG                         Production
            canary                         legacy
              |                              |
        same artifact                    same/independent
        runtime state                    runtime state
```

Selections are validated against the immutable artifact's manifest. A missing Feature Flag or missing value blocks the selection.

## Rollback boundary

Artifact rollback belongs to DeployForge deployment control.

```
DeployForge artifact rollback
          |
          v
   restore immutable artifact
          |
          v
 reconcile Feature Flags to
 target artifact values/defaults
```

There is no Feature Flag compensation or rollback handler.

