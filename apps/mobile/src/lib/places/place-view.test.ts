import type { PlaceResolution } from '@lezzet/types';

// Cihaz dili SABİTLENİR: metin iddiaları makinenin diline bağlanmasın (kit testlerinin deseni).
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-FR' }] }));

import messages from './messages.json';
import { packageStockStatus, placeModeOf, shippableChipVisible, stockMarkOf } from './place-view';

/*
  YER İŞARETİ — "bu ürün BANA nasıl gelir" sorusunun cevabı (21.20 · kullanıcı kararı 09.08).

  ── BU BORÇ DEFTERDE ADIYLA YAZILIYDI ───────────────────────────────────────
  `not-mobil-test-defteri.md` MB-38 altında *"21.20'nin birim test borcu (`StockMark`,
  `stockMarkOf`, `placeModeOf`)"* diye duruyordu. Üç fonksiyon da SAF ve üçü de karar veriyor.

  ── ÇİVİLENEN ASIL KARAR: BİLMEMEK "GÖNDEREMİYORUZ" DEĞİLDİR ────────────────
  `elsewhere` iki ayrı şey olabilir: **rota dışısınız** (kalıcı, "bu adrese gönderemiyoruz") ya da
  **bölgenizde şu an yok** (geçici, "yakında"). Ayrımı yer çözümü belirliyor ve yer BİLİNMİYORSA
  kural *"kalem"* der — çünkü "gönderemiyoruz" demek için rota dışında olduğunu BİLMEK gerekir.
  Ters çevrilseydi posta kodunu henüz vermemiş her ziyaretçiye kalıcı bir ret gösterilirdi ve
  hiçbir yerde hata vermezdi: müşteri sessizce vazgeçerdi.

  ── VE BİR SESSİZ EROZYON: `shipping` ÖNCE GELİR ────────────────────────────
  Sıra anlamlı — kargo işareti stok hâllerinin önünde. Ters çevrilse kargodan gelebilen ürün
  "bölgenizde yok" diye işaretlenir; ürün ALINABİLİRKEN alınamaz görünür.
*/

const tr = messages.tr;

/** Çözülmüş yer — `inRoute` ayrımı testin asıl değişkeni. */
function resolved(inRoute: boolean): PlaceResolution {
  return {
    kind: 'resolved',
    place: { country: 'FR', postalCode: '67000', placeName: null, places: [], inRoute },
  } as PlaceResolution;
}

describe('placeModeOf', () => {
  it('yer YOKSA bilinmiyor — çözülmemişlik bir mod değil, cevapsızlıktır', () => {
    expect(placeModeOf(null)).toBe('unknown');
  });

  it('çözülmemiş cevap da bilinmiyor', () => {
    expect(placeModeOf({ kind: 'unknown' } as PlaceResolution)).toBe('unknown');
  });

  it('rota içi → rota · rota dışı → kargo', () => {
    expect(placeModeOf(resolved(true))).toBe('route');
    expect(placeModeOf(resolved(false))).toBe('shipping');
  });
});

describe('packageStockStatus', () => {
  it('tükendi HER ŞEYİN önünde — rota ne olursa olsun', () => {
    // Rotası olan ama tükenmiş paket "gelebilir" gibi görünmemeli.
    expect(packageStockStatus({ soldOut: true, route: 'local' })).toBe('out_of_stock');
    expect(packageStockStatus({ soldOut: true, route: 'shipping' })).toBe('out_of_stock');
  });

  it('kargo rotası → kargo işareti', () => {
    expect(packageStockStatus({ soldOut: false, route: 'shipping' })).toBe('shipping');
  });

  it.each([['not_shippable_here'], ['unavailable']])('`%s` → başka yerde', (route) => {
    expect(packageStockStatus({ soldOut: false, route: route as 'unavailable' })).toBe('elsewhere');
  });

  it('yerel rota → işaretsiz (satılabilir)', () => {
    expect(packageStockStatus({ soldOut: false, route: 'local' })).toBe('available');
  });

  it('ROTA BİLİNMİYORSA satılabilir sayılır — bilinmeyen olumsuz DEĞİLDİR', () => {
    // Misafir henüz posta kodu vermemiştir; ona "bölgenizde yok" demek, sormadığımız bir soruya
    // olumsuz cevap uydurmak olurdu (CLAUDE §1).
    expect(packageStockStatus({ soldOut: false, route: null })).toBe('available');
  });
});

describe('stockMarkOf', () => {
  it('KARGO işareti stok hâllerinin ÖNÜNDE — ürün alınabilirken alınamaz görünmesin', () => {
    const mark = stockMarkOf('shipping', resolved(true), 'tr');

    expect(mark).toEqual({ label: tr.shipMark, tone: 'info' });
  });

  it('satılabilir ve tükenmiş hâllerde işaret YOK — her kartta yazan bilgi bilgi olmaktan çıkar', () => {
    expect(stockMarkOf('available', resolved(true), 'tr')).toBeNull();
    expect(stockMarkOf('out_of_stock', resolved(true), 'tr')).toBeNull();
  });

  it('ROTA DIŞI müşteriye KALICI ret — "bu adrese gönderemiyoruz"', () => {
    const mark = stockMarkOf('elsewhere', resolved(false), 'tr');

    expect(mark).toEqual({ label: tr.lineBlocked, tone: 'blocked' });
  });

  it('ROTA İÇİ müşteriye GEÇİCİ not — "bölgenizde şu an yok"', () => {
    const mark = stockMarkOf('elsewhere', resolved(true), 'tr');

    expect(mark).toEqual({ label: tr.awayMark, tone: 'pending' });
  });

  it('YER BİLİNMİYORSA geçici not — kalıcı ret için rota dışında olduğunu BİLMEK gerekir', () => {
    /* Bu dosyanın asıl iddiası. Ters çevrilseydi posta kodunu henüz vermemiş HER ziyaretçiye
       kalıcı bir ret gösterilirdi — hiçbir yerde hata vermez, müşteri sessizce vazgeçer. */
    const mark = stockMarkOf('elsewhere', null, 'tr');

    expect(mark?.tone).toBe('pending');
    expect(mark?.label).toBe(tr.awayMark);
  });

  it('metin müşterinin dilinde — sözlük sabitlenmiş değil', () => {
    const fr = stockMarkOf('shipping', resolved(false), 'fr');

    expect(fr?.label).toBe(messages.fr.shipMark);
    expect(fr?.label).not.toBe(tr.shipMark);
  });
});

describe('shippableChipVisible — daraltma çipinin görünürlüğü', () => {
  /*
    Çip YALNIZ kargo modunda anlamlıdır ve üç hâlin ayrımı burada çivileniyor:
    · rota içinde her ürün zaten geliyor — "adresime gönderilebilir" süzgeci hiçbir şeyi elemez,
      çizilse müşteriye işe yaramaz bir düğme gösterilirdi;
    · yer BİLİNMİYORSA soru zaten sorulamaz (aynı soru vitrinin hapıyla ve onboarding'le
      soruluyor; üçüncü bir davet aynı şeyi üç yerden sormak olurdu).
    Ters çevrilirse arıza SESSİZ olur: çip görünür, basılır ve liste hiç değişmez.
  */
  it('KARGO modunda görünür — daraltmanın anlamlı olduğu tek hâl', () => {
    expect(shippableChipVisible('shipping')).toBe(true);
  });

  it('ROTA içinde görünmez — süzgeç hiçbir şeyi elemezdi', () => {
    expect(shippableChipVisible('route')).toBe(false);
  });

  it('yer BİLİNMİYORKEN görünmez — cevabı olmayan soru sorulmaz', () => {
    expect(shippableChipVisible('unknown')).toBe(false);
  });
});
