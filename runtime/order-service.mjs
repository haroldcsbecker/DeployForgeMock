export class OrderService {
  constructor({ paymentProcessor, database }) {
    this.paymentProcessor = paymentProcessor;
    this.database = database;
  }

  checkout() {
    return {
      database: this.database.name,
      payment: this.paymentProcessor.process(),
    };
  }
}
