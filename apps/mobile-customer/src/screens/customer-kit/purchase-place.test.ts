import { act, renderHook } from '@testing-library/react-native';

import type { MeAddress } from '@/lib/api/addresses';
import { addressFixture } from './address-fixture';

/*
  Girişli ve adresli müşterinin yeri adresidir: vitrin ya da katalog cihazın gezinme kodunu okursa sepetle iki ayrı yer doğar, seçim yeri
  değiştirmezse müşteri seçtiği adresin ürünlerini görmez.
*/

const ONBOARDING = { postalCode: '67000' };
jest.mock('@/lib/onboarding/onboarding-store', () => ({
  subscribeOnboarding: () => () => undefined,
  getOnboardingSnapshot: () => ONBOARDING,
}));

const mockAddresses: MeAddress[] = [addressFixture('adres-paris', '75011', false), addressFixture('adres-bordeaux', '33000', true)];
jest.mock('@/lib/api/addresses', () => ({
  fetchAddresses: async () => ({ data: mockAddresses, error: null, status: 200, retryAfterSec: null }),
}));

import { selectDeliveryAddress } from './delivery-address-store';
import { usePurchasePlace } from './purchase-place';
import { loadAddresses } from './use-addresses.hook';

describe('satın alma yeri', () => {
  it('adres yokken cihazın kodu, adres gelince varsayılan adres, seçim değişince seçilen adres', async () => {
    const { result } = await renderHook(() => usePurchasePlace());
    expect(result.current.postalCode).toBe('67000');

    await act(async () => loadAddresses());
    expect(result.current.postalCode).toBe('33000');

    await act(async () => selectDeliveryAddress('adres-paris'));
    expect(result.current.postalCode).toBe('75011');
  });
});
