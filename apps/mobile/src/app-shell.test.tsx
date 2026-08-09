import { screen } from 'expo-router/testing-library';
import { fireEvent } from '@testing-library/react-native';

import { renderShell } from '@/testing/render-shell';

/*
  KABUK SMOKE TESTİ — komponent testlerinden farkı: rota dosyaları GERÇEK (`./src/app` diskten
  taranır), yani kök yığın + sekme grubu + `BottomTabBar` bağlaması birlikte ayağa kalkar. Sekme
  çubuğu birim testi çubuğu tek başına doğruluyor; burada doğrulanan, `_layout`ların onu router'a
  DOĞRU bağladığıdır (rota → etiket sözlüğü, dokunuş → navigasyon).

  Dosya `src/app/` İÇİNE konamaz: expo-router o klasördeki her `.tsx`'i ROTA sayar, test dosyası
  sekme çubuğunda "app-shell" diye belirirdi. Kabuğun testi bu yüzden `src/` kökünde durur.

  AĞ MOCK'SUZ: vitrin artık `/home` ucunu ÇAĞIRIR (21.14b) ama bu ortamda `fetch` yoktur —
  istemci bunu ağ hatası olarak yutmaz, taşır; vitrin de o iki bölümü (bant/tarif) çizmez ve
  ekranın kalanı fixture'la ayakta kalır. Kabuk testinin konusu sekmeler olduğundan bu yeterli;
  vitrinin kendi veri hâlleri kendi testinin işi. Katalog ekranı tembel navigatörde hiç MOUNT
  olmaz. (`catalog-screen.test.tsx` kendi durumlarını kendisi kurar.)
*/

// Cihaz dili sabitlenir ki assert edilen etiketler koşulan makinenin diline bağlı olmasın.
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

// İlk-açılış kapısı tamamlanmış sayılır (modül-yanı mock — gerekçesi mock dosyasının başlığında):
// bayraksız ortamda kök layout '/' açılışını onboarding'e çevirirdi; bu testin konusu o değil.
jest.mock('@/lib/onboarding/onboarding-store');

// Vitrin artık oturumu dinliyor (`useMe`, 21.14c); bu ortamda Supabase env'i yok — istemci
// mock'lanır, oturumsuz hâl döner ("oturumsuz kullanım = müşteri"). Kabuk testinin konusu sekmeler.
jest.mock('@/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      refreshSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  }),
}));

// Sarmalayıcı + matcher tipi ORTAK iskelede (ikinci router testi doğunca oraya taşındı — CLAUDE §1).

describe('uygulama kabuğu', () => {
  it('kök rotada dört sekme çizilir, seçili olan Vitrin', async () => {
    const { app } = await renderShell('/');

    expect(app).toHavePathname('/');
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    // Etiketler sekme sözlüğünden (messages.json/tr) — sıra TASARIMIN sırası, alfabetik değil.
    expect(screen.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel)).toEqual([
      'Vitrin',
      'Katalog',
      'Siparişler',
      'Hesap',
    ]);
    expect(screen.getByRole('tab', { name: 'Vitrin', selected: true })).toBeOnTheScreen();
  });

  it('sekmeye dokunmak rotayı değiştirir — Siparişlerim ekranı açılır', async () => {
    const { app } = await renderShell('/');

    await fireEvent.press(screen.getByRole('tab', { name: 'Siparişler' }));

    expect(app).toHavePathname('/orders');
    expect(screen.getByRole('tab', { name: 'Siparişler', selected: true })).toBeOnTheScreen();
    // Sekme etiketi "Siparişler", ekranın kendi başlığı "Siparişlerim" (v3:718) — ikisi ayrı sözlük.
    expect(screen.getByRole('header', { name: 'Siparişlerim' })).toBeOnTheScreen();
  });

  it('seçili sekmeye tekrar dokunmak rotayı OYNATMAZ (layout `state.index` kapısı)', async () => {
    const { app } = await renderShell('/');

    await fireEvent.press(screen.getByRole('tab', { name: 'Vitrin' }));

    expect(app).toHavePathname('/');
    expect(screen.getByRole('tab', { name: 'Vitrin', selected: true })).toBeOnTheScreen();
  });
});
