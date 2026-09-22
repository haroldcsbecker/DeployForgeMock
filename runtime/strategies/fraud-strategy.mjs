export function createFraudLegacy() {
  return {
    implementationId: 'legacy',
    evaluate: () => ({ implementationId: 'legacy', approved: true }),
  };
}

export function createFraudRules() {
  return {
    implementationId: 'rule-based',
    evaluate: () => ({ implementationId: 'rule-based', approved: true }),
  };
}
