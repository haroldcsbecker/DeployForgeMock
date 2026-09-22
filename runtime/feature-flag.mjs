export class FeatureFlag {
  select(selectedValue, options) {
    if (typeof selectedValue !== 'string' || !selectedValue.trim()) {
      throw new Error('FeatureFlag selection must be a non-empty string');
    }
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new Error('FeatureFlag options must be an object of callbacks');
    }
    if (!Object.prototype.hasOwnProperty.call(options, selectedValue)) {
      throw new Error('FeatureFlag selection "' + selectedValue + '" is not present in the options');
    }

    const callback = options[selectedValue];
    if (typeof callback !== 'function') {
      throw new Error('FeatureFlag option "' + selectedValue + '" is not callable');
    }

    return callback();
  }
}
