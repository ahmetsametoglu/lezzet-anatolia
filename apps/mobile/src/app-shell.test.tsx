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

  Ağ YOK: başlangıç rotası Vitrin (yer tutucu) ve gezilen rota Siparişler (yer tutucu) — sekme
  navigatörü tembel olduğundan Katalog ekranı hiç MOUNT olmaz, `fetch` çağrısı doğmaz. Katalog
  ekranının kendi durumları kendi testinde (`catalog-screen.test.tsx`).
*/

// Cihaz dili sabitlenir ki assert edilen etiketler koşulan makinenin diline bağlı olmasın.
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

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

  it('sekmeye dokunmak rotayı değiştirir — Siparişler yer tutucusu açılır', async () => {
    const { app } = await renderShell('/');

    await fireEvent.press(screen.getByRole('tab', { name: 'Siparişler' }));

    expect(app).toHavePathname('/orders');
    expect(screen.getByRole('tab', { name: 'Siparişler', selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Siparişler' })).toBeOnTheScreen();
  });

  it('seçili sekmeye tekrar dokunmak rotayı OYNATMAZ (layout `state.index` kapısı)', async () => {
    const { app } = await renderShell('/');

    await fireEvent.press(screen.getByRole('tab', { name: 'Vitrin' }));

    expect(app).toHavePathname('/');
    expect(screen.getByRole('tab', { name: 'Vitrin', selected: true })).toBeOnTheScreen();
  });
});
