export class OrderService {
  constructor({ database }) {
    this.database = database;
  }

  async checkout() {
    return {
      database: this.database.name,
      checkout: {
        implementationId: 'sample-checkout',
        status: 'accepted',
      },
      payment: {
        implementationId: 'simulated-payment-processor',
        fraudImplementationId: 'sample-risk-check',
        status: 'authorized',
      },
      total: {
        amount: 42,
        currency: 'USD',
      },
    };
  }
}
