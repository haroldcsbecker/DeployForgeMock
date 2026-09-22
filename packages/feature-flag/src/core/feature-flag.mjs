import {
  assertFeatureFlagName,
  assertFeatureFlagOptions,
  assertFeatureFlagValue,
} from './validation.mjs';

export class FeatureFlag {
  constructor({ registry, name, defaultValue, value }) {
    assertFeatureFlagName(name);
    assertFeatureFlagValue(defaultValue);

    this.registry = registry;
    this.name = name;
    this.defaultValue = defaultValue;
    this._value = value ?? defaultValue;
    this._options = new Set();
  }

  get value() {
    return this._value;
  }

  async set(value) {
    assertFeatureFlagValue(value);

    const previousValue = this._value;
    this._value = value;

    if (this.registry.storage) {
      await this.registry.storage.set(this.name, value);
    }

    return {
      changed: previousValue !== value,
      previousValue,
      value,
    };
  }

  select(options) {
    assertFeatureFlagOptions(options);

    const optionNames = Object.keys(options);
    for (const optionName of optionNames) this._options.add(optionName);

    const currentValue = this._value;
    if (typeof currentValue !== 'string' || !currentValue.trim()) {
      throw new Error(
        'FeatureFlag "' + this.name + '" has an invalid runtime value',
      );
    }

    if (!Object.prototype.hasOwnProperty.call(options, currentValue)) {
      throw new Error(
        'FeatureFlag "' +
          this.name +
          '" has selected value "' +
          currentValue +
          '" with no matching callback',
      );
    }

    const callback = options[currentValue];
    if (typeof callback !== 'function') {
      throw new Error(
        'FeatureFlag "' +
          this.name +
          '" option "' +
          currentValue +
          '" is not callable',
      );
    }

    return callback();
  }

  toJSON() {
    return {
      name: this.name,
      value: this.value,
      defaultValue: this.defaultValue,
      options: [...this._options],
    };
  }
}
