import { render, screen } from '@testing-library/react-native';

import { CollectionBand } from './collection-band';

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

  it('rozet SAYACIN yanında durur, onun yerine geçmez', async () => {
    // İkisi birlikte okunmalı: hap indirimi söyler, sayaç kesitin büyüklüğünü. Biri ötekini
    // düşürürse müşteri ya indirimi ya kesiti kaybeder.
    await render(<CollectionBand {...band} discountLabel="−%15" testID="band" />);
    expect(screen.getByText('−%15')).toBeOnTheScreen();
    expect(screen.getByText('20 çeşit ›')).toBeOnTheScreen();
  });
});
