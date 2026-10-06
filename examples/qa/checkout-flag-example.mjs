import { getFeatureFlagClient } from '../../runtime/feature-flags/open-feature.mjs';

export async function checkoutFlagExample() {
  const client = await getFeatureFlagClient('hmg');
  return {
    flag: 'checkout-mode',
    value: await client.getStringValue('checkout-mode', 'legacy'),
  };
}
