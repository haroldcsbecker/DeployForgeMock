import { getFeatureFlagClient } from '../../runtime/feature-flags/open-feature.mjs';

export async function fraudFlagExample() {
  const client = await getFeatureFlagClient('hmg');
  return {
    flag: 'fraud-mode',
    value: await client.getStringValue('fraud-mode', 'legacy'),
  };
}
