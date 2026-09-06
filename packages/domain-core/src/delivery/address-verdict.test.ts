import { describe, expect, it } from 'vitest';

import { addressVerdict, type AddressCandidate } from './address-verdict';

/**
 * **"Bu kapı var mı" kararı** (11.11) — merkezinde kullanıcının ölçtüğü gerçek vaka.
 *
 * İki sipariş, aynı adres satırı (`192c Rue du Maréchal Foch`), iki farklı posta kodu; kapı
 * yalnız birinde var ve aralarında 7,2 km. BAN'a kısıtsız sorulduğunda cevap netti:
 * `housenumber 0,973 → 67380 Lingolsheim`, `street 0,717 → 67000 Strasbourg`.
 *
 * Bu dosyanın işi, o cevabın **doğru karara** dönüştüğünü çivilemek.
 */
const LINGOLSHEIM: AddressCandidate = {
  label: '192c Rue du Maréchal Foch 67380 Lingolsheim',
  postalCode: '67380',
  precision: 'housenumber',
  score: 0.973,
};

const kapi = (over: Partial<AddressCandidate> = {}): AddressCandidate => ({ ...LINGOLSHEIM, ...over });

describe('addressVerdict · doğrulanan kapı', () => {
  it('kapı İSTENEN kodda bulunduysa söylenecek bir şey yok', () => {
    // Çağıran bu hâlde ikinci sorguya hiç çıkmıyor; karar yine de bu dalı bilmeli.
    expect(addressVerdict({ matchedPrecision: 'housenumber', elsewhere: [], postalCode: '67380' })).toEqual({
      kind: 'confirmed',
    });
  });

  it('kısıtlı sorgu bulamasa da KISITSIZ sorgu AYNI kodda buluyorsa adres DOĞRUDUR', () => {
    /* Sorgu metni ya da yazım yüzünden pinlenmiş arama ıskalayabiliyor. Servis kapının o kodda
       olduğunu söylüyorsa bunu "yanlış kod" diye göstermek, müşteriye DOĞRU adresini
       değiştirtmek olurdu. */
    const verdict = addressVerdict({
      matchedPrecision: 'street',
      elsewhere: [kapi({ postalCode: '67380' })],
      postalCode: '67380',
    });

    expect(verdict).toEqual({ kind: 'confirmed' });
  });

  it('posta kodu karşılaştırması boşluğa ve büyük harfe duyarsız', () => {
    // Kaynaklar kodu farklı yazabiliyor; biçim farkı yüzünden "yanlış kod" demek yanlış olurdu.
    const verdict = addressVerdict({
      matchedPrecision: 'street',
      elsewhere: [kapi({ postalCode: '67 380' })],
      postalCode: '67380',
    });

    expect(verdict).toEqual({ kind: 'confirmed' });
  });
});

describe('addressVerdict · yanlış posta kodu (kullanıcının vakası)', () => {
  it('kapı BAŞKA kodda bulunduysa DÜZELTME TEKLİF EDİLİR', () => {
    /* Ölçülen vakanın kendisi: müşteri 67000 Strasbourg yazdı, kapı 67380 Lingolsheim'de.
       Bugün sistem bunu sessizce kabul ediyor ve kurye var olmayan bir kapıya sıralanıyor. */
    const verdict = addressVerdict({
      matchedPrecision: 'street',
      elsewhere: [LINGOLSHEIM],
      postalCode: '67000',
    });

    expect(verdict).toEqual({ kind: 'wrong_postal_code', suggestion: LINGOLSHEIM });
  });

  it('teklifin metni SERVİSİN etiketidir — biz cümle kurmayız', () => {
    // Ekranda gösterilecek "bunu mu demek istediniz" içeriği; kendi birleştirmemiz olsaydı
    // servisin bildiği yazımdan (kısaltma, aksan) sapardı.
    const verdict = addressVerdict({ matchedPrecision: 'street', elsewhere: [LINGOLSHEIM], postalCode: '67000' });

    expect(verdict.kind === 'wrong_postal_code' && verdict.suggestion.label).toBe(
      '192c Rue du Maréchal Foch 67380 Lingolsheim',
    );
  });

  it('EN GÜVENİLİR aday seçilir, listedeki ilk aday değil', () => {
    const zayif = kapi({ postalCode: '67100', label: 'zayıf', score: 0.84 });
    const verdict = addressVerdict({
      matchedPrecision: 'street',
      elsewhere: [zayif, LINGOLSHEIM],
      postalCode: '67000',
    });

    expect(verdict).toMatchObject({ kind: 'wrong_postal_code', suggestion: { postalCode: '67380' } });
  });
});

describe('addressVerdict · teklif YAPILMAYAN hâller', () => {
  it('ZAYIF eşleşmeyle teklif yapılmaz — müşterinin ağzına söz konmaz', () => {
    /* Eşik `geocode-provider`ın 0,4'ünden yüksek ve bilerek: o eşik "bu bir cevap mı" sorusunun,
       buradaki ise "düzeltme önerecek kadar emin miyim" sorusunun. Zayıf bir adayla teklif yapmak,
       doğru yazılmış bir adresi yanlışmış gibi gösterirdi. */
    const verdict = addressVerdict({
      matchedPrecision: 'street',
      elsewhere: [kapi({ score: 0.62 })],
      postalCode: '67000',
    });

    expect(verdict).toEqual({ kind: 'street_only' });
  });

  it('AYIRT EDİLEMEZ iki kod varsa teklif yapılmaz — kura atılmaz', () => {
    /* Motorun `indistinguishable` reddiyle aynı disiplin: birbirine denk iki seçenekten birini
       seçmek bir hesap değil bir kuradır. Müşteriye rastgele birini önermek, onu bizim tahminimize
       göre adresini değiştirmeye davet ederdi. */
    const verdict = addressVerdict({
      matchedPrecision: 'street',
      elsewhere: [kapi({ postalCode: '67380', score: 0.93 }), kapi({ postalCode: '67100', score: 0.91 })],
      postalCode: '67000',
    });

    expect(verdict).toEqual({ kind: 'street_only' });
  });

  it('ama AÇIK ARA önde olan aday teklif edilir — her ikilik belirsizlik değildir', () => {
    const verdict = addressVerdict({
      matchedPrecision: 'street',
      elsewhere: [kapi({ postalCode: '67380', score: 0.97 }), kapi({ postalCode: '67100', score: 0.82 })],
      postalCode: '67000',
    });

    expect(verdict).toMatchObject({ kind: 'wrong_postal_code', suggestion: { postalCode: '67380' } });
  });

  it('SOKAK düzeyindeki aday teklif edilmez — o da aynı belirsizliği taşır', () => {
    // "Adresiniz aslında şurada" demek ancak KAPI bulunduğunda söylenebilir.
    const verdict = addressVerdict({
      matchedPrecision: 'street',
      elsewhere: [kapi({ precision: 'street', postalCode: '59160', score: 0.95 })],
      postalCode: '67000',
    });

    expect(verdict).toEqual({ kind: 'street_only' });
  });
});

describe('addressVerdict · kapı hiçbir yerde yok', () => {
  it('sokak eşleşmesi VARSA yeni yapı olabilir — yumuşak hâl', () => {
    /* `street` tek başına bir hüküm değil bir GÜVEN DÜZEYİ: servis yeni binaları ve `bis/ter`
       eklerini bilmeyebiliyor. Bu yüzden burada engel değil, yalnız "kapıyı doğrulayamadım". */
    expect(addressVerdict({ matchedPrecision: 'street', elsewhere: [], postalCode: '67000' })).toEqual({
      kind: 'street_only',
    });
  });

  it('kaba eşleşmeler de sokak hâlinde sayılır', () => {
    for (const precision of ['locality', 'municipality'] as const) {
      expect(addressVerdict({ matchedPrecision: precision, elsewhere: [], postalCode: '67000' })).toEqual({
        kind: 'street_only',
      });
    }
  });

  it('HİÇ eşleşme yoksa ayrı bir hâldir — "sokak var" demek yalan olurdu', () => {
    expect(addressVerdict({ matchedPrecision: null, elsewhere: [], postalCode: '67000' })).toEqual({
      kind: 'not_found',
    });
  });

  it('hiç eşleşme yokken BAŞKA kodda kapı bulunduysa yine TEKLİF edilir', () => {
    // En değerli hâllerden biri: kod tümüyle yanlış yazılmış ve doğrusu elimizde.
    const verdict = addressVerdict({ matchedPrecision: null, elsewhere: [LINGOLSHEIM], postalCode: '99999' });

    expect(verdict).toMatchObject({ kind: 'wrong_postal_code', suggestion: { postalCode: '67380' } });
  });
});
