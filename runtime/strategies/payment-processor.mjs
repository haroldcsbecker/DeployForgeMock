export class LegacyPaymentProcessor {
  constructor({ fraudStrategy, logger }) {
    this.fraudStrategy = fraudStrategy;
    this.logger = logger;
  }

  process() {
    this.logger.events.push('payment:legacy');
    return {
      implementationId: 'legacy',
      fraudImplementationId: this.fraudStrategy.implementationId,
    };
  }
}

export class NewPaymentProcessor {
  constructor({ fraudStrategy, logger }) {
    this.fraudStrategy = fraudStrategy;
    this.logger = logger;
  }

  process() {
    this.logger.events.push('payment:new');
    return {
      implementationId: 'new',
      fraudImplementationId: this.fraudStrategy.implementationId,
    };
  }
}
