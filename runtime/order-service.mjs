export class OrderService {
  constructor({
    featureFlagClient,
    database,
    fraudLegacy,
    fraudRules,
    legacyPaymentProcessor,
    newPaymentProcessor,
    canaryPaymentProcessor,
  }) {
    this.featureFlagClient = featureFlagClient;
    this.database = database;
    this.fraudLegacy = fraudLegacy;
    this.fraudRules = fraudRules;
    this.legacyPaymentProcessor = legacyPaymentProcessor;
    this.newPaymentProcessor = newPaymentProcessor;
    this.canaryPaymentProcessor = canaryPaymentProcessor;
  }

  async checkout() {
    const fraudMode = await this.featureFlagClient.getStringValue(
      'fraud-mode',
      'legacy',
    );

    const fraud = {
      legacy: () => this.fraudLegacy.evaluate(),
      'rule-based': () => this.fraudRules.evaluate(),
    }[fraudMode]?.() ?? this.fraudLegacy.evaluate();

    const paymentMode = await this.featureFlagClient.getStringValue(
      'payment-mode',
      'legacy',
    );

    const payment = {
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
    }[paymentMode]?.() ?? this.legacyPaymentProcessor.process({
      fraudImplementationId: fraud.implementationId,
    });

    const checkoutMode = await this.featureFlagClient.getStringValue(
      'checkout-mode',
      'legacy',
    );

    const checkout =
      checkoutMode === 'new'
        ? { implementationId: 'new' }
        : { implementationId: 'legacy' };

    return {
      database: this.database.name,
      checkout,
      payment,
      featureFlags: {
        'fraud-mode': fraudMode,
        'payment-mode': paymentMode,
        'checkout-mode': checkoutMode,
      },
    };
  }
}
