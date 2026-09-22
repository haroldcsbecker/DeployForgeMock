export type FeatureFlagCallback<T> = () => T;

export type FeatureFlagOptions<T = unknown> = Record<string, FeatureFlagCallback<T>>;

export type FeatureFlagStorage = {
  getAll(): Promise<Record<string, string>>;
  set(name: string, value: string): Promise<void>;
  create?(name: string, defaultValue: string): Promise<void>;
};

export type FeatureFlagMetadata = {
  name: string;
  value: string;
  defaultValue: string;
  options: string[];
};

export class FeatureFlag<T = unknown> {
  readonly name: string;
  readonly defaultValue: string;
  readonly value: string;

  set(value: string): Promise<{
    changed: boolean;
    previousValue: string;
    value: string;
  }>;

  select(options: FeatureFlagOptions<T>): T;

  toJSON(): FeatureFlagMetadata;
}

export class FeatureFlagRegistry {
  featureFlag<T = unknown>(name: string, defaultValue: string): FeatureFlag<T>;
  get<T = unknown>(name: string): FeatureFlag<T> | undefined;
  getAllFeatureFlags(): FeatureFlagMetadata[];
  configure(options?: {
    storage?: FeatureFlagStorage;
    persistDefaults?: boolean;
  }): Promise<FeatureFlagMetadata[]>;
  reset(): void;
}

export function createFeatureFlagRegistry(): FeatureFlagRegistry;

export function featureFlag<T = unknown>(
  name: string,
  defaultValue: string,
): FeatureFlag<T>;

export function configureFeatureFlags(options?: {
  storage?: FeatureFlagStorage;
  persistDefaults?: boolean;
}): Promise<FeatureFlagMetadata[]>;

export function getAllFeatureFlags(): FeatureFlagMetadata[];

export function getFeatureFlag<T = unknown>(
  name: string,
): FeatureFlag<T> | undefined;
