export class LegacyOrderRouter {
  constructor({ logger }) { this.logger = logger; }
  route(order) { this.logger.events.push('order:legacy'); return { implementationId: 'legacy', route: 'legacy', order }; }
}

export class RulesOrderRouter {
  constructor({ logger }) { this.logger = logger; }
  route(order) { this.logger.events.push('order:rules'); return { implementationId: 'rules', route: 'rules', order }; }
}

export class OptimizedOrderRouter {
  constructor({ logger }) { this.logger = logger; }
  route(order) { this.logger.events.push('order:optimized'); return { implementationId: 'optimized', route: 'optimized', order }; }
}

export class AsyncOrderRouter {
  constructor({ logger }) { this.logger = logger; }
  route(order) { this.logger.events.push('order:async'); return { implementationId: 'async', route: 'async', order }; }
}

export class ExperimentOrderRouter {
  constructor({ logger }) { this.logger = logger; }
  route(order) { this.logger.events.push('order:experiment'); return { implementationId: 'experiment', route: 'experiment', order }; }
}
