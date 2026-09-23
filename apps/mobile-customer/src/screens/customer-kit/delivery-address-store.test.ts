import { act, renderHook } from '@testing-library/react-native';

import {
  resetDeliveryAddress,
  selectDeliveryAddress,
  selectPickupWarehouse,
  useSelectedDeliveryAddress,
  useSelectedPickupWarehouse,
} from './delivery-address-store';

/*
  SEÇİM TEK YERDİR: adres ile gel-al deposu aynı anda seçili olamaz — olsaydı sepet bir yere, checkout başka yere bakardı.
  Bu test şu hatada kırmızıya döner: depo seçilince adres seçimi düşmez ya da adres seçilince depo kalır.
*/
jest.mock('@lezzet/mobile-kit/src/lib/auth/session-end', () => ({ registerSessionCleanup: jest.fn() }));

/* RNTL v14 asenkron: `renderHook` ve `act` birer söz döndürür, beklenmezse React "act(...)" uyarısı verir. */
function selection() {
  return renderHook(() => ({ address: useSelectedDeliveryAddress(), pickup: useSelectedPickupWarehouse() }));
}

afterEach(async () => {
  await act(() => resetDeliveryAddress());
});

it('gel-al deposu seçilince adres seçimi düşer — varsayılan adres fatura adresi olarak kalır', async () => {
  const { result } = await selection();
  await act(() => selectDeliveryAddress('adr-1'));
  expect(result.current).toEqual({ address: 'adr-1', pickup: null });

  await act(() => selectPickupWarehouse('wh-1'));
  expect(result.current).toEqual({ address: null, pickup: 'wh-1' });
});

it('adres seçilince gel-al düşer; depoyu bırakmak adrese döner', async () => {
  const { result } = await selection();
  await act(() => selectPickupWarehouse('wh-1'));
  await act(() => selectDeliveryAddress('adr-2'));
  expect(result.current).toEqual({ address: 'adr-2', pickup: null });

  await act(() => selectPickupWarehouse('wh-1'));
  await act(() => selectPickupWarehouse(null));
  expect(result.current).toEqual({ address: null, pickup: null });
});

it('oturum kapanışı iki seçimi de düşürür', async () => {
  const { result } = await selection();
  await act(() => selectPickupWarehouse('wh-1'));
  await act(() => resetDeliveryAddress());
  expect(result.current).toEqual({ address: null, pickup: null });
});
