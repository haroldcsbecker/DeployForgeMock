import { getFeatureFlagClient } from '../../runtime/feature-flags/open-feature.mjs';

export async function paymentFlagExample() {
  const client = await getFeatureFlagClient('hmg');
  return {
    flag: 'payment-mode',
    value: await client.getStringValue('payment-mode', 'legacy'),
  };
}
