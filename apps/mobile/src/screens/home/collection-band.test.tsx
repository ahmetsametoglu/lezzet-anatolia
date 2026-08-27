import { render, screen } from '@testing-library/react-native';

import { CollectionBand, CollectionPhotoOverlay } from './collection-band';

// Bant adı müşterinin diline göre büyütülüyor (`upperIn`) — cihaz dili sabitlenmezse ortam kararır.
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-FR' }] }));

/*
  KESİT ROZETİ BANTTA (27.08 · kullanıcı kararı).

  ── NE KORUYOR ──────────────────────────────────────────────────────────────
  Kampanya rozeti 23.08'de ÜRÜN kartlarına konmuştu ve yanıltıcıydı: motor sabit tutarı sepetin
  kapsam toplamına BİR KEZ indiriyor (`Math.min(amountCents, scopeBase)`) ve adaylardan yalnız
  birini kazandırıyor — yani "3,00 € indirim" yazan üç ürünü alan müşteri 9 € değil 3 € indirim
  alıyordu. Rozetin doğru katmanı kesitin kendi kartıdır, çünkü kampanyanın kapsamı da bir kesittir
  (`matchesScope`: kategori | koleksiyon).

  Bu dosya o katmanı çivileyen tek yer: rozet BANTTA çiziliyor mu, ve çizilmemesi gerekince
  susuyor mu. Metnin kendisi kitin işi (`campaign-label.test.ts` — eşikli kampanyanın elenmesi
  orada ölçülüyor); burada sorulan soru "bant onu ekrana koyuyor mu".
*/

const band = {
  name: 'Bayram Sofrası',
  subtitle: 'Bayram klasikleri',
  countLabel: '20 çeşit ›',
  index: 0,
  photoUri: null,
  onPress: () => {},
};

describe('CollectionBand — kesit rozeti', () => {
  it('rozet verilince bantta çizilir', async () => {
    await render(<CollectionBand {...band} discountLabel="−3,00 €" testID="band" />);
    expect(screen.getByText('−3,00 €')).toBeOnTheScreen();
  });

  it('rozet verilmezse bant sessizdir — sayaç satırı yalnız sayıyı söyler', async () => {
    await render(<CollectionBand {...band} testID="band" />);
    expect(screen.queryByText('−3,00 €')).toBeNull();
    expect(screen.getByText('20 çeşit ›')).toBeOnTheScreen();
  });

  it('rozet SAYAÇ SATIRINI düşürmez — ikisi birlikte okunur', async () => {
    // Hap indirimi söyler, sayaç kesitin büyüklüğünü. Biri ötekinin yerine geçerse müşteri ya
    // indirimi ya kesiti kaybeder.
    await render(<CollectionBand {...band} discountLabel="−%15" testID="band" />);
    expect(screen.getByText('−%15')).toBeOnTheScreen();
    expect(screen.getByText('20 çeşit ›')).toBeOnTheScreen();
  });
});

/*
  VİTRİNİN GERÇEKTEN KULLANDIĞI YOL BUDUR (`photoInOverlay`): daireler bantların ÜSTÜNDE, ayrı bir
  katmanda çizilir çünkü v3'te daire komşu banda taşar ve RN'de kardeş sırası z-sırasıdır. Rozet
  dairenin köşesinde durduğuna göre onunla birlikte bu katmana geçmek ZORUNDA — bandın içinde
  kalsaydı vitrinde hiç görünmezdi. Yukarıdaki testler bandın kendi dairesini çizdiği hâli ölçüyor;
  bu blok olmasa vitrindeki rozetin kaybolması hiçbir testi düşürmezdi.
*/
describe('CollectionPhotoOverlay — vitrinin üst katmanı', () => {
  it('rozeti dairesiyle birlikte taşır', async () => {
    await render(<CollectionPhotoOverlay name="Bayram Sofrası" index={0} photoUri={null} discountLabel="−3,00 €" />);
    expect(screen.getByText('−3,00 €')).toBeOnTheScreen();
  });

  it('kampanyasız kesitte sessizdir', async () => {
    await render(<CollectionPhotoOverlay name="Bayram Sofrası" index={0} photoUri={null} />);
    expect(screen.queryByText('−3,00 €')).toBeNull();
  });
});
