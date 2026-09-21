import { DeployStrategy } from './deploy-strategy.mjs';
import { LegacyPaymentProcessor, NewPaymentProcessor } from './strategies/payment-processor.mjs';
import { FraudLegacy, FraudMl, FraudRules } from './strategies/fraud-strategy.mjs';

export function createDeployStrategy() {
  const strategy = new DeployStrategy();

  strategy.register(
    'fraud-strategy',
    strategy
      .switchBetween(
        { id: 'legacy', implementation: FraudLegacy },
        { id: 'rule-based', implementation: FraudRules },
        { id: 'ml', implementation: FraudMl },
      ),
    {
      registration: 'fraudStrategy',
      projectRepository: 'https://github.com/haroldcsbecker/DeployForgeMock',
      sourcePath: 'runtime/strategies/fraud-strategy.mjs',
      description: 'Controls the fraud evaluation implementation used by the runtime.',
      rollbackDescription: 'Switching or rolling back the artifact restores the implementation selected by the target artifact. No external compensation handler is required for the fraud strategy.',
      implementationDescriptions: {
        legacy: 'Legacy fraud evaluation path.',
        'rule-based': 'Rule-based fraud evaluation path.',
        ml: 'Machine-learning fraud evaluation path for the next fraud version.',
      },
    },
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
    {
      registration: 'paymentProcessor',
      projectRepository: 'https://github.com/haroldcsbecker/DeployForgeMock',
      sourcePath: 'runtime/strategies/payment-processor.mjs',
      description: 'Selects the payment processor implementation used by checkout.',
      rollbackDescription: 'The selected payment implementation can run its compensation handler before an artifact rollback. The target artifact then determines the available implementations.',
      implementationDescriptions: {
        legacy: 'Legacy payment processor implementation.',
        new: 'New payment processor implementation with the current fraud strategy dependency.',
      },
    },
  );

  strategy.validate();
  return strategy;
}

export const strategyManifest = createDeployStrategy().manifest();
