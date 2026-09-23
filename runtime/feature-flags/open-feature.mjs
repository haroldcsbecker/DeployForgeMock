import { OpenFeature } from '@openfeature/server-sdk';
import {
  EvaluationType,
  GoFeatureFlagProvider,
} from '@openfeature/go-feature-flag-provider';

const DEFAULT_ENDPOINT = 'http://127.0.0.1:1031/';
const DEFAULT_POLLING_MS = 1000;
const TARGETING_KEY = 'deployforge-mock';

let initialization;

export function initializeFeatureFlags() {
  if (!initialization) {
    const provider = new GoFeatureFlagProvider({
      endpoint: process.env.GO_FEATURE_FLAG_ENDPOINT ?? DEFAULT_ENDPOINT,
      evaluationType: EvaluationType.InProcess,
      flagChangePollingIntervalMs: Number(
        process.env.GO_FEATURE_FLAG_POLLING_MS ?? DEFAULT_POLLING_MS,
      ),
      disableDataCollection: true,
    });

    initialization = OpenFeature.setProviderAndWait(provider);
  }

  return initialization;
}

export async function getFeatureFlagClient(environment) {
  await initializeFeatureFlags();

  const domain = 'deployforge-mock:' + environment;
  const client = OpenFeature.getClient(domain);

  await client.setContext({
    targetingKey: TARGETING_KEY,
    environment,
  });

  return client;
}
