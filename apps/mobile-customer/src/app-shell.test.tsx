import { screen } from 'expo-router/testing-library';
import { fireEvent } from '@testing-library/react-native';

import { renderShell } from '@lezzet/mobile-kit/src/testing/render-shell';

/*
  Kabuk smoke testi: rota dosyaları diskten taranır ve `_layout`ların sekme çubuğunu router'a doğru bağladığı sınanır; dosya `src/app/`
  içine konamaz, çünkü expo-router orada her `.tsx`'i rota sayar. Ağ sahtelenmez, vitrinin veri bölümleri çizilmese de konu sekmelerdir.
*/

// Cihaz dili sabitlenir ki assert edilen etiketler koşulan makinenin diline bağlı olmasın.
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

// İlk-açılış kapısı tamamlanmış sayılır (modül-yanı mock — gerekçesi mock dosyasının başlığında):
// bayraksız ortamda kök layout '/' açılışını onboarding'e çevirirdi; bu testin konusu o değil.
jest.mock('@/lib/onboarding/onboarding-store');

// Vitrin oturumu dinler (`useMe`) ve bu ortamda Supabase env'i yoktur; istemci sahtelenir ve oturumsuz hâl döner.
jest.mock('@lezzet/mobile-kit/src/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      refreshSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  }),
}));

// İlan edilen tutarlar gerçek uçtan gelir ve vitrin başlığındaki posta kodu çekmecesi onu okur; sahtelenmezse çağrı ağa çıkar.
jest.mock('@/lib/api/delivery-terms', () => ({
  fetchDeliveryTerms: () =>
    Promise.resolve({
      data: {
        minBasketRouteCents: 4000,
        minBasketShippingCents: 0,
        freeShippingCents: 6000,
        codMaxCents: 50_000,
        shippingCountries: ['FR', 'DE'],
      },
      error: null,
      status: 200,
    }),
}));

// Sarmalayıcı + matcher tipi ORTAK iskelede (ikinci router testi doğunca oraya taşındı — CLAUDE §1).

describe('uygulama kabuğu', () => {
  it('kök rotada dört sekme çizilir, seçili olan Vitrin', async () => {
    const { app } = await renderShell('/');

    expect(app).toHavePathname('/');
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    // Etiketler sekme sözlüğünden (messages.json/tr) — sıra TASARIMIN sırası, alfabetik değil.
    // Üçüncü yuva PERAKENDE hâlidir (v3:1883): oturumsuz kabukta `useWholesale` false döner.
    expect(screen.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel)).toEqual([
      'Vitrin',
      'Katalog',
      'Paketler',
      'Hesap',
    ]);
    expect(screen.getByRole('tab', { name: 'Vitrin', selected: true })).toBeOnTheScreen();
  });

  it('sekmeye dokunmak rotayı değiştirir — Paketler ekranı açılır', async () => {
    const { app } = await renderShell('/');

    await fireEvent.press(screen.getByRole('tab', { name: 'Paketler' }));

    expect(app).toHavePathname('/packages');
    expect(screen.getByRole('tab', { name: 'Paketler', selected: true })).toBeOnTheScreen();
    // Sekme etiketi "Paketler", ekranın kendi başlığı tasarımın cümlesi (v3:862) — ayrı sözlükler.
    expect(screen.getByRole('header', { name: 'Sofrayı biz kuralım, siz buyur edin' })).toBeOnTheScreen();
  });

  it('seçili sekmeye tekrar dokunmak rotayı OYNATMAZ (layout `state.index` kapısı)', async () => {
    const { app } = await renderShell('/');

    await fireEvent.press(screen.getByRole('tab', { name: 'Vitrin' }));

    expect(app).toHavePathname('/');
    expect(screen.getByRole('tab', { name: 'Vitrin', selected: true })).toBeOnTheScreen();
  });
});
