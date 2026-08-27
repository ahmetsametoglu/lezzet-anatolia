import { renderHook } from '@testing-library/react-native';

/**
 * SUNUCU SEPETİNİN KAPISI — `useCartSync(enabled)` sözleşmesi.
 *
 * Sınanan tek şey KAPININ AÇILIP AÇILMADIĞI: açıkken oturum dinleyicisi kurulur, kapalıyken
 * Supabase'e HİÇ dokunulmaz. Sepetin kendi mantığı (devir, iyimser yazım, görünüm çözümü) burada
 * değil; burası kapının yerini koruyan bekçidir.
 *
 * NEDEN BEKÇİ GEREKTİ (ölçüldü 28.08, fiziksel Android): kapı sekme kabuğundayken `(tabs)` grubunun
 * DIŞINDA kalan rotaları (sepet · ürün · paket · tarif · checkout) kapsamıyordu. Derin bağlantıyla
 * gelen girişli müşterinin yazmaları sunucuya hiç gitmiyor, görünümü çözülmüyordu — ekran
 * "1 ürün · 0,00 €" derken checkout SUNUCUDAKİ başka sepeti okuyordu. Kapı köke taşındı.
 *
 * Kökte durmanın bedeli de bu sözleşmede: kök yığından personel kabuğu ve kimliği TOKEN olan
 * ziyaretçi yolları (geri bildirim · davet) da geçiyor. Onlarda kapı KAPALI açılmalı — oturumsuz
 * bir ziyaretçiyi oturum altyapısına bağlamamak için (`app/_layout.tsx` · `CARTLESS_TREES`).
 * Ters yönün bekçisi ayrı bir dosyada ve oradan gelir: `screens/feedback/feedback-routes.test.tsx`
 * gerçek rota ağacını monte eder, kapı orada açılırsa test env isteyip düşer.
 */

const mockOnAuthStateChange = jest.fn();
const mockUnsubscribe = jest.fn();
jest.mock('@/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      onAuthStateChange: (...args: unknown[]) => {
        mockOnAuthStateChange(...args);
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      },
    },
  }),
}));

jest.mock('@/lib/i18n/app-locale', () => ({ useAppLocale: () => 'fr' }));

/* Anlık görüntü SABİT nesnedir: `useSyncExternalStore` referans eşitliğine bakar ve her çağrıda
   yeni bir nesne döndüren bir mock sonsuz render döngüsü açar (ölçüldü — "Maximum update depth"). */
const ONBOARDING = { postalCode: '67000' };
jest.mock('@/lib/onboarding/onboarding-store', () => ({
  subscribeOnboarding: () => () => undefined,
  getOnboardingSnapshot: () => ONBOARDING,
}));

import { useCartSync } from './cart-store';

beforeEach(() => {
  mockOnAuthStateChange.mockClear();
  mockUnsubscribe.mockClear();
});

describe('useCartSync kapısı', () => {
  it('kapalıyken Supabase’e HİÇ dokunulmaz (ziyaretçi ve personel ağaçları)', async () => {
    const view = await renderHook(() => useCartSync(false));
    expect(mockOnAuthStateChange).not.toHaveBeenCalled();
    view.unmount();
  });

  it('varsayılan AÇIK — oturum dinleyicisi kurulur', async () => {
    const view = await renderHook(() => useCartSync());
    expect(mockOnAuthStateChange).toHaveBeenCalled();
    view.unmount();
  });
});
