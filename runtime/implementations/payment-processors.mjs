export class LegacyPaymentProcessor {
  constructor({ logger }) { this.logger = logger; }

  process({ fraudImplementationId }) {
    this.logger.events.push('payment:legacy');
    return { implementationId: 'legacy', fraudImplementationId };
  }
}

export class NewPaymentProcessor {
  constructor({ logger }) { this.logger = logger; }

  process({ fraudImplementationId }) {
    this.logger.events.push('payment:new');
    return { implementationId: 'new', fraudImplementationId };
  }
}

export class CanaryPaymentProcessor {
  constructor({ logger }) { this.logger = logger; }

  process({ fraudImplementationId }) {
    this.logger.events.push('payment:canary');
    return { implementationId: 'canary', fraudImplementationId };
  }
}
