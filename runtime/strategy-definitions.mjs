import { DeployStrategy } from './deploy-strategy.mjs';
import { LegacyPaymentProcessor, NewPaymentProcessor } from './strategies/payment-processor.mjs';
import { FraudLegacy, FraudRules } from './strategies/fraud-strategy.mjs';

export function createDeployStrategy() {
  const strategy = new DeployStrategy();

  strategy.register(
    'fraud-strategy',
    strategy
      .switchBetween(
        { id: 'legacy', implementation: FraudLegacy },
        { id: 'rule-based', implementation: FraudRules },
      ),
    { registration: 'fraudStrategy' },
  );

  strategy.register(
    'payment-processor',
    strategy
      .switchBetween(
        { id: 'legacy', implementation: LegacyPaymentProcessor },
        { id: 'new', implementation: NewPaymentProcessor },
      )
      .default('legacy')
      .dependsOn('fraud-strategy')
      .withLifecycle({
        beforeActivate: async () => {},
        afterActivate: async () => {},
        beforeDeactivate: async () => {},
        afterDeactivate: async () => {},
      })
      .withRollback({
        legacy: async () => ({ details: 'legacy payment compensation executed' }),
        new: {
          execute: async () => ({ details: 'new payment compensation executed' }),
        },
      }),
    { registration: 'paymentProcessor' },
  );

  strategy.validate();
  return strategy;
}

export const strategyManifest = createDeployStrategy().manifest();
