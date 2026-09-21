export function FraudLegacy() {
  return {
    implementationId: 'legacy',
    evaluate: () => true,
  };
}

export function FraudRules() {
  return {
    implementationId: 'rule-based',
    evaluate: () => true,
  };
}

export function FraudMl() {
  return {
    implementationId: 'ml',
    evaluate: () => true,
  };
}
