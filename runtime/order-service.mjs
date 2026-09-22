export class OrderService {
  constructor({
    featureFlag,
    featureSelections,
    database,
    fraudLegacy,
    fraudRules,
    legacyPaymentProcessor,
    newPaymentProcessor,
    canaryPaymentProcessor,
  }) {
    this.featureFlag = featureFlag;
    this.featureSelections = featureSelections;
    this.database = database;
    this.fraudLegacy = fraudLegacy;
    this.fraudRules = fraudRules;
    this.legacyPaymentProcessor = legacyPaymentProcessor;
    this.newPaymentProcessor = newPaymentProcessor;
    this.canaryPaymentProcessor = canaryPaymentProcessor;
  }

  checkout() {
    const fraud = this.featureFlag.select(this.featureSelections['fraud-mode'], {
      legacy: () => this.fraudLegacy.evaluate(),
      'rule-based': () => this.fraudRules.evaluate(),
    });

    const payment = this.featureFlag.select(this.featureSelections['payment-mode'], {
      legacy: () => this.legacyPaymentProcessor.process({ fraudImplementationId: fraud.implementationId }),
      new: () => this.newPaymentProcessor.process({ fraudImplementationId: fraud.implementationId }),
      canary: () => this.canaryPaymentProcessor.process({ fraudImplementationId: fraud.implementationId }),
    });

    const checkout = this.featureFlag.select(this.featureSelections['checkout-mode'], {
      legacy: () => ({ implementationId: 'legacy' }),
      new: () => ({ implementationId: 'new' }),
    });

    return {
      database: this.database.name,
      checkout,
      payment,
      featureSelections: { ...this.featureSelections },
    };
  }
}
