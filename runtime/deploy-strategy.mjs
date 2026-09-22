import { asClass, asFunction } from 'awilix';

const kebabCase = (value) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

const implementationId = (implementation) => kebabCase(implementation.name || 'anonymous-implementation');
const isClass = (implementation) => /^class\s/.test(Function.prototype.toString.call(implementation));

const resolveImplementation = (implementations, value) => {
  if (typeof value === 'string') {
    const match = implementations.find((item) => item.id === value);
    if (!match) throw new Error('Unknown implementation "' + value + '"');
    return match.id;
  }
  const match = implementations.find((item) => item.implementation === value);
  if (!match) throw new Error('Implementation is not registered');
  return match.id;
};

export class StrategyBuilder {
  constructor(implementations) {

    const ids = new Set();
    this.implementations = implementations.map((item) => {
      const normalized = typeof item === 'function'
        ? { id: implementationId(item), implementation: item }
        : item;
      if (!normalized.id || !normalized.implementation) throw new Error('Strategy implementations require id and implementation');
      if (ids.has(normalized.id)) throw new Error('Duplicate implementation id "' + normalized.id + '"');
      ids.add(normalized.id);
      return normalized;
    });
    this.kind = 'switch';
    this.defaultImplementation = undefined;
    this.lifecycle = {};
    this.rollback = {};
    this.dependencies = [];
    this.dependencyCompatibility = {};
  }

  default(value) {
    if (this.kind === 'flag') {
      throw new Error('Feature flags use .flag(defaultEnabled) instead of .default()');
    }
    this.defaultImplementation = resolveImplementation(this.implementations, value);
    return this;
  }

  flag(defaultEnabled = false) {
    if (this.implementations.length) throw new Error('A feature flag cannot define implementations');
    this.kind = 'flag';
    this.defaultImplementation = defaultEnabled ? 'enabled' : 'disabled';
    return this;
  }

  withLifecycle(lifecycle) {
    this.lifecycle = { ...lifecycle };
    return this;
  }

  withRollback(rollback) {
    this.rollback = { ...rollback };
    return this;
  }

  dependsOn(...strategyIds) {
    this.dependencies = [...new Set(strategyIds)];
    return this;
  }

  compatibleWith(dependencyStrategyId, implementationIds) {
    this.dependencyCompatibility[dependencyStrategyId] = [...new Set(implementationIds)];
    return this;
  }

  definition(id, registration = id, metadata = {}) {
    if (this.kind === 'switch' && this.implementations.length < 1) {
      throw new Error('A Feature Switch needs at least one implementation');
    }
    return {
      id,
      kind: this.kind,
      registration,
      projectRepository: metadata.projectRepository ?? '',
      sourcePath: metadata.sourcePath ?? '',
      description: metadata.description ?? '',
      rollbackDescription: metadata.rollbackDescription ?? '',
      implementationDescriptions: { ...(metadata.implementationDescriptions ?? {}) },
      implementations: this.kind === 'flag'
        ? [
            { id: 'disabled', implementation: undefined },
            { id: 'enabled', implementation: undefined },
          ]
        : this.implementations.map(({ id: implementationId, implementation }) => ({
            id: implementationId,
            implementation,
          })),
      defaultImplementation: this.defaultImplementation ?? (this.kind === 'flag' ? 'disabled' : this.implementations[0].id),
      lifecycle: this.lifecycle,
      rollback: this.rollback,
      dependsOn: [...this.dependencies],
      dependencyCompatibility: structuredClone(this.dependencyCompatibility),
    };
  }
}

export function validateStrategyGraph(definitions, selections = {}) {
  const errors = [];
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));

  for (const definition of definitions) {
    const implementationIds = new Set(definition.kind === 'flag' ? ['disabled', 'enabled'] : definition.implementations.map((item) => item.id));
    if (definition.kind === 'flag' && !['disabled', 'enabled'].includes(definition.defaultImplementation)) {
      errors.push('Feature Flag "' + definition.id + '" has an invalid default value');
    }
    if (definition.kind !== 'flag' && !implementationIds.has(definition.defaultImplementation)) {
      errors.push('Strategy "' + definition.id + '" has an invalid default implementation');
    }

    const selected = selections[definition.id];
    if (definition.kind !== 'flag' && selected && !implementationIds.has(selected)) {
      errors.push('Strategy "' + definition.id + '" selected a missing implementation "' + selected + '"');
    }

    for (const dependency of definition.dependsOn) {
      const dependencyDefinition = byId.get(dependency);
      if (!dependencyDefinition) {
        errors.push('Strategy "' + definition.id + '" depends on missing strategy "' + dependency + '"');
        continue;
      }
      const compatibility = definition.dependencyCompatibility?.[dependency];
      if (compatibility?.some((id) => !dependencyDefinition.implementations.some((item) => item.id === id))) {
        errors.push('Strategy "' + definition.id + '" has invalid compatibility requirements for "' + dependency + '"');
      }
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const visit = (id, path = []) => {
    if (visiting.has(id)) {
      errors.push('Circular strategy dependency: ' + [...path, id].join(' -> '));
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency, [...path, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const definition of definitions) visit(definition.id);

  for (const definition of definitions) {
    const selected = selections[definition.id] ?? definition.defaultImplementation;
    for (const dependency of definition.dependsOn) {
      const allowed = definition.dependencyCompatibility?.[dependency];
      if (allowed && !allowed.includes(selections[dependency] ?? byId.get(dependency)?.defaultImplementation)) {
        errors.push('Strategy "' + definition.id + '" is incompatible with selected implementation of "' + dependency + '"');
      }
    }
    if (definition.kind !== 'flag' && !definition.implementations.some((item) => item.id === selected)) {
      errors.push('Strategy "' + definition.id + '" selected a missing implementation "' + selected + '"');
    }
  }

  if (errors.length) throw new Error([...new Set(errors)].join('; '));
  return { valid: true };
}

export class DeployStrategy {
  constructor() {
    this.definitions = new Map();
    this.selected = new Map();
    this.previousResolvers = new Map();
  }

  switchBetween(...implementations) {
    return new StrategyBuilder(implementations);
  }

  flag(defaultEnabled = false) {
    return new StrategyBuilder([]).flag(defaultEnabled);
  }

  register(strategyId, builder, options = {}) {
    if (!(builder instanceof StrategyBuilder)) throw new Error('DeployStrategy.register expects a StrategyBuilder');
    if (this.definitions.has(strategyId)) throw new Error('Strategy "' + strategyId + '" is already registered');
    this.definitions.set(
      strategyId,
      builder.definition(strategyId, options.registration ?? strategyId, options),
    );
    return this;
  }

  getDefinition(strategyId) {
    const definition = this.definitions.get(strategyId);
    if (!definition) throw new Error('Unknown strategy "' + strategyId + '"');
    return definition;
  }

  manifest() {
    return {
      version: 1,
      strategies: [...this.definitions.values()].map((definition) => ({
        id: definition.id,
        registration: definition.registration,
        implementations: definition.implementations.map((item) => item.id),
        defaultImplementation: definition.defaultImplementation,
        dependsOn: [...definition.dependsOn],
        kind: definition.kind,
        lifecycle: Object.keys(definition.lifecycle ?? {}).length > 0,
        rollback: Object.keys(definition.rollback ?? {}).length > 0,
        projectRepository: definition.projectRepository,
        sourcePath: definition.sourcePath,
        description: definition.description,
        rollbackDescription: definition.rollbackDescription,
        implementationDescriptions: { ...(definition.implementationDescriptions ?? {}) },
      })),
    };
  }

  validate(selections = {}) {
    validateStrategyGraph([...this.definitions.values()], selections);
    return this;
  }

  selections() {
    return Object.fromEntries(this.selected.entries());
  }

  #resolver(definition, implementationId) {
    const implementation = definition.implementations.find((item) => item.id === implementationId)?.implementation;
    if (!implementation) throw new Error('Unknown implementation "' + implementationId + '" for strategy "' + definition.id + '"');
    return isClass(implementation) ? asClass(implementation).singleton() : asFunction(implementation).singleton();
  }

  #implementationRegistrationName(definition, implementationId) {
    return '__deployforge_' + kebabCase(definition.id) + '_' + kebabCase(implementationId);
  }

  #install(container, definition, implementationId) {
    const registrationName = definition.registration;
    if (!this.previousResolvers.has(registrationName)) {
      let existing = container.registrations[registrationName];
      if (!existing) {
        try { existing = container.getRegistration(registrationName); } catch {}
      }
      if (existing) this.previousResolvers.set(registrationName, existing);
    }

    for (const candidate of definition.implementations) {
      const hiddenName = this.#implementationRegistrationName(definition, candidate.id);
      if (!container.registrations[hiddenName]) {
        container.register({ [hiddenName]: this.#resolver(definition, candidate.id) });
      }
    }

    container.register({
      [registrationName]: asFunction(() => {
        const initial = container.resolve(this.#implementationRegistrationName(definition, implementationId));
        return new Proxy(initial, {
          get: (_target, property) => {
            const selected = this.selected.get(definition.id) ?? implementationId;
            const implementation = container.resolve(this.#implementationRegistrationName(definition, selected));
            const value = Reflect.get(implementation, property, implementation);
            return typeof value === 'function' ? value.bind(implementation) : value;
          },
          set: (_target, property, value) => {
            const selected = this.selected.get(definition.id) ?? implementationId;
            const implementation = container.resolve(this.#implementationRegistrationName(definition, selected));
            return Reflect.set(implementation, property, value);
          },
        });
      }).singleton(),
    });
  }

  async attach(container, { selectionByStrategy = {}, environment = 'unknown', artifactDigest = '' } = {}) {
    this.validate(selectionByStrategy);
    for (const definition of this.definitions.values()) {
      const selected = selectionByStrategy[definition.id] ?? definition.defaultImplementation;
      if (definition.kind !== 'flag') this.#install(container, definition, selected);
      this.selected.set(definition.id, selected);
      await definition.lifecycle?.afterActivate?.({
        strategyId: definition.id,
        fromImplementation: undefined,
        toImplementation: selected,
        environment,
        artifactDigest,
      });
    }
    return this;
  }

  async switchTo(container, strategyId, implementationId, context = {}) {
    const definition = this.getDefinition(strategyId);
    if (definition.kind === 'flag') {
      if (implementationId !== 'enabled' && implementationId !== 'disabled') {
        throw new Error('Feature Flag value must be enabled or disabled');
      }
      return this.setFlag(strategyId, implementationId === 'enabled', context);
    }
    this.validate({ ...this.selections(), [strategyId]: implementationId });
    const previous = this.selected.get(strategyId) ?? definition.defaultImplementation;
    if (previous === implementationId) {
      return { strategyId, previousImplementation: previous, implementationId, changed: false };
    }

    const switchContext = {
      ...context,
      strategyId,
      fromImplementation: previous,
      toImplementation: implementationId,
    };

    try {
      await definition.lifecycle?.beforeDeactivate?.(switchContext);
      await definition.lifecycle?.afterDeactivate?.(switchContext);
      this.selected.set(strategyId, implementationId);
      await definition.lifecycle?.beforeActivate?.(switchContext);
      await definition.lifecycle?.afterActivate?.(switchContext);
    } catch (error) {
      this.selected.set(strategyId, previous);
      throw error;
    }

    return { strategyId, previousImplementation: previous, implementationId, changed: true };
  }

  isEnabled(strategyId) {
    const definition = this.getDefinition(strategyId);
    if (definition.kind !== 'flag') throw new Error('Strategy "' + strategyId + '" is a Feature Switch');
    return (this.selected.get(strategyId) ?? definition.defaultImplementation) === 'enabled';
  }

  async setFlag(strategyId, enabled, context = {}) {
    const definition = this.getDefinition(strategyId);
    if (definition.kind !== 'flag') throw new Error('Strategy "' + strategyId + '" is a Feature Switch');
    const previous = (this.selected.get(strategyId) ?? definition.defaultImplementation) === 'enabled';
    if (previous === enabled) return { strategyId, previousEnabled: previous, enabled, changed: false };
    const nextValue = enabled ? 'enabled' : 'disabled';
    const switchContext = { ...context, strategyId, fromValue: previous, toValue: enabled };
    try {
      await definition.lifecycle?.beforeDeactivate?.(switchContext);
      this.selected.set(strategyId, nextValue);
      await definition.lifecycle?.afterActivate?.(switchContext);
    } catch (error) {
      this.selected.set(strategyId, previous ? 'enabled' : 'disabled');
      throw error;
    }
    return { strategyId, previousEnabled: previous, enabled, changed: true };
  }

  values() {
    return this.selections();
  }

  async compensate(strategyId, implementationId, context = {}) {
    const definition = this.getDefinition(strategyId);
    const rollback = definition.rollback?.[implementationId];
    if (!rollback) return { success: true, strategyId, implementationId, compensated: false };

    const result = typeof rollback === 'function'
      ? await rollback({ ...context, strategyId, implementationId })
      : await rollback.execute({ ...context, strategyId, implementationId });
    return {
      success: true,
      strategyId,
      implementationId,
      compensated: true,
      ...(result ?? {}),
    };
  }
}
