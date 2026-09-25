import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { MeCartView } from '@lezzet/types';

import type { MeAddress } from '@/lib/api/addresses';
import { cartView, cartViewLine } from '@/screens/cart/cart-view-fixture';
import { addressFixture } from './address-fixture';

/*
  Satın alma yeri oturumla okunan adres listesinden ve seçimden kurulur; yer değişimi kartı yalnız bilinen bir yer değişince doğar.
  İlk hizalanma duyurulursa kart her açılışta çıkar, adres seçimi yer değişimi sayılmazsa müşteri sepetini son gördüğü hâliyle hatırlar.
*/

let mockAuthCallback: ((event: string, session: unknown) => void) | null = null;
jest.mock('@lezzet/mobile-kit/src/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
        mockAuthCallback = callback;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
    },
  }),
}));

jest.mock('@lezzet/mobile-kit/src/lib/i18n/app-locale', () => ({ useAppLocale: () => 'tr' }));

// Anlık görüntü sabit nesne, çünkü `useSyncExternalStore` referans eşitliğine bakar.
const ONBOARDING = { postalCode: '67000' };
jest.mock('@/lib/onboarding/onboarding-store', () => ({
  subscribeOnboarding: () => () => undefined,
  getOnboardingSnapshot: () => ONBOARDING,
}));

// Baklava gezinme kodunda kargoya, ilk adreste kapıya, ikinci adreste yine kargoya düşer; ilk hizalanma da bir fark taşır.
const mockViews: Record<string, MeCartView> = {
  '67000': cartView([cartViewLine(1, 'Baklava', 'shipping')]),
  '33000': cartView([cartViewLine(1, 'Baklava', 'local')]),
  '75011': cartView([cartViewLine(1, 'Baklava', 'shipping')]),
  // Lyon'da baklava kapıya gelir, sucuk bu adrese hiç gelemez.
  '69007': cartView([cartViewLine(1, 'Baklava', 'local'), cartViewLine(2, 'Sucuk', 'undeliverable')]),
};
const mockAddresses: MeAddress[] = [
  addressFixture('adres-bordeaux', '33000', true),
  addressFixture('adres-paris', '75011', false),
  addressFixture('adres-lyon', '69007', false),
];
jest.mock('@/lib/api/addresses', () => ({
  fetchAddresses: async () => ({ data: mockAddresses, error: null, status: 200, retryAfterSec: null }),
}));

jest.mock('@/lib/api/cart', () => ({
  fetchCart: async (query: { postalCode: string | null }) => ({
    data: mockViews[query.postalCode ?? ''],
    error: null,
    status: 200,
    retryAfterSec: null,
  }),
  takeOverCart: jest.fn(),
  fetchGuestCartView: jest.fn(),
  addCartItems: jest.fn(),
  removeCartItem: jest.fn(),
  setCartItemQty: jest.fn(),
}));

import { setCartItemQty } from '@/lib/api/cart';
import { cartLineId, dismissPlaceChange, setProductQuantity, useCart, useCartSync } from './cart-store';
import { selectDeliveryAddress } from './delivery-address-store';

describe('yer değişimi kartı', () => {
  it('ilk hizalanmayı duyurmaz, bilinen yer değişince kalemin yeni hâlini söyler', async () => {
    const { result } = await renderHook(() => {
      useCartSync();
      return useCart();
    });

    // Oturum açılınca adresler okunur ve yer gezinme kodundan varsayılan adrese hizalanır.
    await act(async () => mockAuthCallback?.('INITIAL_SESSION', { user: { id: 'musteri' } }));
    await waitFor(() => expect(result.current.view.lines[0]?.group).toBe('local'));
    expect(result.current.placeChange).toBeNull();

    await act(async () => selectDeliveryAddress('adres-paris'));
    await waitFor(() => expect(result.current.placeChange).toEqual([{ kind: 'to_shipping', name: 'Baklava' }]));

    await act(async () => dismissPlaceChange());
    expect(result.current.placeChange).toBeNull();
  });
});

describe('adet değişiminin anlık görünümü', () => {
  // Sunucu gelemeyen kalemi ara toplamdan düşer; anlık hesap saysaydı cevap gelene kadar ekran başka bir toplam gösterirdi.
  it('gelemeyen kalem ara toplama ve toplama sayılmaz', async () => {
    const { result } = await renderHook(() => {
      useCartSync();
      return useCart();
    });
    await act(async () => mockAuthCallback?.('INITIAL_SESSION', { user: { id: 'musteri' } }));
    await act(async () => selectDeliveryAddress('adres-lyon'));
    await waitFor(() => expect(result.current.view.lines).toHaveLength(2));

    // Sunucu cevabı bekletilir ki ölçülen şey yalnız anlık görünüm olsun.
    jest.mocked(setCartItemQty).mockReturnValue(new Promise(() => undefined));
    const baklava = result.current.view.lines.find((line) => line.group === 'local')!;
    await act(async () => setProductQuantity(cartLineId(baklava), 2));

    expect(result.current.view).toMatchObject({ subtotalCents: 2000, totalCents: 2000, undeliverableSubtotalCents: 1000 });
  });
});
