import { renderRouter, screen } from 'expo-router/testing-library';
import { fireEvent } from '@testing-library/react-native';

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

/*
  MATCHER TİPİ ELLE: expo-router 57'nin yayını `expect.d.ts`i BOŞ basıyor (`export {}`) — matcher
  çalışma zamanında kayıtlı ama tipte yok. Tek tüketici bu dosya; ikinci bir router testi doğarsa
  bildirim ortak bir ambient dosyaya taşınır.
*/
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toHavePathname(pathname: string): R;
    }
  }
}

/*
  RNTL v14 `render`ı ASYNC döndürür; `renderRouter` (57.0.11) bunu bilmez ve `getPathname` gibi
  metodları sözün (promise) üstüne iliştirir. Bu sarmalayıcı sözü bekler ama İLİŞTİRİLMİŞ nesneyi
  DÜZ DÖNDÜREMEZ: async fonksiyondan thenable dönerse `await` onu bir kez daha çözer ve elde
  metodsuz iç sonuç kalır. Nesneye sarmak (`{ app }`) o ikinci çözülmeyi keser — matcher'lar
  (`toHavePathname`) metodları `app`ten okur.
*/
async function renderShell(initialUrl: string) {
  const app = renderRouter('./src/app', { initialUrl });
  await app;
  return { app };
}

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
