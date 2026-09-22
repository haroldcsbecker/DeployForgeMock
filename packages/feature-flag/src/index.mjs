import { createFeatureFlagRegistry } from './core/registry.mjs';

const defaultRegistry = createFeatureFlagRegistry();

export const featureFlag = (name, defaultValue) =>
  defaultRegistry.featureFlag(name, defaultValue);

export const configureFeatureFlags = (options) =>
  defaultRegistry.configure(options);

export const getAllFeatureFlags = () =>
  defaultRegistry.getAllFeatureFlags();

export const getFeatureFlag = (name) =>
  defaultRegistry.get(name);

export { FeatureFlag } from './core/feature-flag.mjs';
export {
  FeatureFlagRegistry,
  createFeatureFlagRegistry,
} from './core/registry.mjs';
