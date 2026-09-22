export function assertFeatureFlagName(name) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new TypeError('FeatureFlag name must be a non-empty string');
  }
}

export function assertFeatureFlagValue(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError('FeatureFlag value must be a non-empty string');
  }
}

export function assertFeatureFlagOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('FeatureFlag options must be an object of callbacks');
  }
}

export function assertFeatureFlagStorage(storage) {
  if (storage === undefined || storage === null) return;
  if (typeof storage.getAll !== 'function' || typeof storage.set !== 'function') {
    throw new TypeError('FeatureFlag storage must implement getAll() and set(name, value)');
  }
  if (storage.create !== undefined && typeof storage.create !== 'function') {
    throw new TypeError('FeatureFlag storage create must be a function when provided');
  }
}

export function assertStringRecord(values, message) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    throw new TypeError(message);
  }

  for (const [name, value] of Object.entries(values)) {
    if (typeof name !== 'string' || typeof value !== 'string') {
      throw new TypeError(message);
    }
  }
}
