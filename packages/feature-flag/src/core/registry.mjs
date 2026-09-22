import { FeatureFlag } from './feature-flag.mjs';
import {
  assertFeatureFlagName,
  assertFeatureFlagStorage,
  assertFeatureFlagValue,
  assertStringRecord,
} from './validation.mjs';

export class FeatureFlagRegistry {
  constructor() {
    this.flags = new Map();
    this.hydratedValues = new Map();
    this.storage = undefined;
    this.initialized = false;
    this.persistDefaults = false;
  }

  featureFlag(name, defaultValue) {
    assertFeatureFlagName(name);
    assertFeatureFlagValue(defaultValue);

    const existing = this.flags.get(name);
    if (existing) {
      if (existing.defaultValue !== defaultValue) {
        throw new Error(
          'FeatureFlag "' +
            name +
            '" was already registered with default "' +
            existing.defaultValue +
            '", not "' +
            defaultValue +
            '"',
        );
      }
      return existing;
    }

    const value = this.hydratedValues.get(name) ?? defaultValue;
    const flag = new FeatureFlag({
      registry: this,
      name,
      defaultValue,
      value,
    });

    this.flags.set(name, flag);

    if (
      this.initialized &&
      this.persistDefaults &&
      !this.hydratedValues.has(name) &&
      this.storage?.create
    ) {
      void this.storage.create(name, defaultValue).catch(() => {});
    }

    return flag;
  }

  get(name) {
    assertFeatureFlagName(name);
    return this.flags.get(name);
  }

  getAllFeatureFlags() {
    return [...this.flags.values()].map((flag) => flag.toJSON());
  }

  async configure({ storage, persistDefaults = false } = {}) {
    assertFeatureFlagStorage(storage);

    this.storage = storage;
    this.persistDefaults = persistDefaults;

    if (!storage) {
      this.initialized = true;
      return this.getAllFeatureFlags();
    }

    const persisted = await storage.getAll();
    assertStringRecord(
      persisted,
      'FeatureFlag storage getAll() must return Record<string, string>',
    );

    this.hydratedValues = new Map(Object.entries(persisted));

    for (const [name, flag] of this.flags) {
      const value = this.hydratedValues.get(name);
      if (value !== undefined) flag._value = value;
    }

    if (persistDefaults && storage.create) {
      for (const [name, flag] of this.flags) {
        if (!this.hydratedValues.has(name)) {
          await storage.create(name, flag.defaultValue);
        }
      }
    }

    this.initialized = true;
    return this.getAllFeatureFlags();
  }

  reset() {
    this.flags.clear();
    this.hydratedValues.clear();
    this.storage = undefined;
    this.initialized = false;
    this.persistDefaults = false;
  }
}

export function createFeatureFlagRegistry() {
  return new FeatureFlagRegistry();
}
