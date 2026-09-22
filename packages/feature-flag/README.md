# @deployforge/feature-flag

A dependency-free, process-local runtime FeatureFlag registry.

## API

Registration is synchronous:

```js
const paymentMode = featureFlag('payment-mode', 'legacy');
```

Selection always uses the current value:

```js
paymentMode.select({
  legacy: () => legacyPayment(),
  new: () => newPayment(),
  canary: () => canaryPayment(),
});
```

Runtime updates use the same handle:

```js
await paymentMode.set('canary');
```

The first call registers the flag. Repeated calls to the same name return the same logical registry entry.

## Initialization

Hydrate persisted values before application startup:

```js
await configureFeatureFlags({ storage });
```

The call to `featureFlag()` never waits for storage or network I/O. Without storage, defaults remain local.

## Storage

The package accepts an adapter with:

```ts
type FeatureFlagStorage = {
  getAll(): Promise<Record<string, string>>;
  set(name: string, value: string): Promise<void>;
  create?(name: string, defaultValue: string): Promise<void>;
};
```

Shared-state synchronization, databases, Redis, HTTP, and application-specific lifecycle behavior belong outside the core package.

## Runtime guarantees

- values are always strings;
- `select()` never silently falls back when the current value has no matching callback;
- non-callable selected options fail clearly;
- `set()` changes in-memory state before persistence resolves;
- changing a value does not rebuild dependency-injection containers;
- each registry is process-local and independent.
