import { createFraudLegacy, createFraudRules } from './implementations/fraud.mjs';
import {
  CanaryPaymentProcessor,
  LegacyPaymentProcessor,
  NewPaymentProcessor,
} from './implementations/payment-processors.mjs';

const definitions = [
  {
    id: 'fraud-mode',
    values: ['legacy', 'rule-based'],
    defaultValue: 'legacy',
    projectRepository: 'https://github.com/haroldcsbecker/DeployForgeMock',
    sourcePath: 'runtime/implementations/fraud.mjs',
    description: 'Selects the fraud evaluation implementation used by checkout.',
    implementationDescriptions: {
      legacy: 'Legacy fraud evaluation path.',
      'rule-based': 'Rule-based fraud evaluation path.',
    },
  },
  {
    id: 'checkout-mode',
    values: ['legacy', 'new'],
    defaultValue: 'legacy',
    projectRepository: 'https://github.com/haroldcsbecker/DeployForgeMock',
    sourcePath: 'index.html',
    description: 'Selects the checkout experience exposed by the application.',
    implementationDescriptions: {
      legacy: 'Existing checkout experience.',
      new: 'New checkout experience.',
    },
  },
  {
    id: 'payment-mode',
    values: ['legacy', 'new', 'canary'],
    defaultValue: 'legacy',
    projectRepository: 'https://github.com/haroldcsbecker/DeployForgeMock',
    sourcePath: 'runtime/implementations/payment-processors.mjs',
    description: 'Selects the payment processor implementation used by checkout.',
    implementationDescriptions: {
      legacy: 'Legacy payment processor.',
      new: 'New payment processor.',
      canary: 'Canary payment processor used for controlled validation.',
    },
  },
];

export function createFeatureFlagDefinitions() {
  return definitions.map((definition) => structuredClone(definition));
}

export function createFeatureFlagManifest() {
  return {
    version: 1,
    featureFlags: createFeatureFlagDefinitions(),
  };
}

export function registerFeatureFlags(featureFlag) {
  return Object.fromEntries(
    definitions.map((definition) => [
      definition.id,
      featureFlag(definition.id, definition.defaultValue),
    ]),
  );
}

export { createFraudLegacy, createFraudRules, LegacyPaymentProcessor, NewPaymentProcessor, CanaryPaymentProcessor };
