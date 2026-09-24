import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { MeCartView } from '@lezzet/types';

import { cartView, cartViewLine } from '@/screens/cart/cart-view-fixture';

/*
  Yer değişimi kartı yalnız bilinen bir satın alma yeri değişince doğar: gezinme kodundan adrese ilk hizalanma duyurulursa kart her
  açılışta çıkar, gerçek adres değişimi duyurulmazsa müşteri sepetini son gördüğü hâliyle hatırlar.
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
};
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

import { dismissPlaceChange, setPurchasePlace, useCart, useCartSync } from './cart-store';

describe('yer değişimi kartı', () => {
  it('ilk hizalanmayı duyurmaz, bilinen yer değişince kalemin yeni hâlini söyler', async () => {
    const { result } = await renderHook(() => {
      useCartSync();
      return useCart();
    });

    await act(async () => mockAuthCallback?.('INITIAL_SESSION', { user: { id: 'musteri' } }));
    await waitFor(() => expect(result.current.view.lines).toHaveLength(1));

    await act(async () => setPurchasePlace('33000'));
    await waitFor(() => expect(result.current.resolving).toBe(false));
    expect(result.current.placeChange).toBeNull();

    await act(async () => setPurchasePlace('75011'));
    await waitFor(() => expect(result.current.placeChange).toEqual([{ kind: 'to_shipping', name: 'Baklava' }]));

    await act(async () => dismissPlaceChange());
    expect(result.current.placeChange).toBeNull();
  });
});
