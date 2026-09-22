export class OrderService {
  constructor({
    paymentMode,
    fraudMode,
    checkoutMode,
    database,
    fraudLegacy,
    fraudRules,
    legacyPaymentProcessor,
    newPaymentProcessor,
    canaryPaymentProcessor,
  }) {
    this.paymentMode = paymentMode;
    this.fraudMode = fraudMode;
    this.checkoutMode = checkoutMode;
    this.database = database;
    this.fraudLegacy = fraudLegacy;
    this.fraudRules = fraudRules;
    this.legacyPaymentProcessor = legacyPaymentProcessor;
    this.newPaymentProcessor = newPaymentProcessor;
    this.canaryPaymentProcessor = canaryPaymentProcessor;
  }

  checkout() {
    const fraud = this.fraudMode.select({
      legacy: () => this.fraudLegacy.evaluate(),
      'rule-based': () => this.fraudRules.evaluate(),
    });

    const payment = this.paymentMode.select({
      legacy: () =>
        this.legacyPaymentProcessor.process({
          fraudImplementationId: fraud.implementationId,
        }),
      new: () =>
        this.newPaymentProcessor.process({
          fraudImplementationId: fraud.implementationId,
        }),
      canary: () =>
        this.canaryPaymentProcessor.process({
          fraudImplementationId: fraud.implementationId,
        }),
    });

    const checkout = this.checkoutMode.select({
      legacy: () => ({ implementationId: 'legacy' }),
      new: () => ({ implementationId: 'new' }),
    });

    return {
      database: this.database.name,
      checkout,
      payment,
      featureFlags: {
        'fraud-mode': this.fraudMode.value,
        'payment-mode': this.paymentMode.value,
        'checkout-mode': this.checkoutMode.value,
      },
    };
  }
}
