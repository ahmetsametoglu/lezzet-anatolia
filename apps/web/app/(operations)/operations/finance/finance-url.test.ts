import { describe, expect, it } from 'vitest';
import { ALL_ACCOUNTS, financeUrl, parseFinanceUrl, periodRange, resolveAccount, type FinanceUrlState } from './finance-url';

// Para ekranının URL sözleşmesi — DB'siz, saf. Süzgeçler adreste taşındığı için bu dosyanın
// koruduğu şey bir davranış değil bir SÖZ: aynı görünüm hep aynı adresi üretir, bozuk adres ekranı
// kırmaz.

const DEFAULTS: FinanceUrlState = { acct: ALL_ACCOUNTS, type: 'all', period: 'all', scope: 'all' };

describe('parseFinanceUrl', () => {
  it('boş parametrede varsayılanları verir', () => {
    expect(parseFinanceUrl({})).toEqual(DEFAULTS);
  });

  it('tanınmayan değeri sessizce varsayılana düşürür', () => {
    // Bozuk bağlantı ekranı KIRMAMALI: elle düzenlenmiş ya da eskimiş bir adres, boş bir hata
    // sayfası yerine varsayılan görünümü açar.
    expect(parseFinanceUrl({ type: 'uydurma', period: 'd1', scope: 'hepsi' })).toEqual(DEFAULTS);
  });

  it('geçerli süzgeçleri okur', () => {
    expect(parseFinanceUrl({ acct: 'abc', type: 'expense', period: 'd30', scope: 'unmatched' })).toEqual({
      acct: 'abc',
      type: 'expense',
      period: 'd30',
      scope: 'unmatched',
    });
  });

  it('tekrarlanan anahtarda İLK değeri alır', () => {
    // Hangisinin kazandığı SABİT olmalı: yoksa kopyalanırken sona eklenen bir parametre aynı
    // bağlantıyı sessizce başka bir görünüme çevirirdi (`one()` kuralı).
    expect(parseFinanceUrl({ type: ['expense', 'transfer'] }).type).toBe('expense');
  });
});

describe('financeUrl', () => {
  it('varsayılanları adrese YAZMAZ', () => {
    expect(financeUrl(DEFAULTS)).toBe('/operations/finance');
  });

  it('aynı görünüm aynı adresi üretir (sıra sabit)', () => {
    const state: FinanceUrlState = { acct: 'abc', type: 'expense', period: 'd30', scope: 'unmatched' };
    expect(financeUrl(state)).toBe('/operations/finance?acct=abc&type=expense&period=d30&scope=unmatched');
  });

  it('gidiş-dönüş kayıpsız', () => {
    const state: FinanceUrlState = { acct: 'x1', type: 'transfer', period: 'd90', scope: 'unmatched' };
    const query = financeUrl(state).split('?')[1] ?? '';
    expect(parseFinanceUrl(Object.fromEntries(new URLSearchParams(query)))).toEqual(state);
  });
});

describe('resolveAccount', () => {
  it('bilinmeyen kimliği `all`a düşürür', () => {
    // Doğrulanmasaydı hiçbir çipin seçili görünmediği bir hâlde boş liste çıkardı ve operatör onu
    // "hiç hareket yok" diye okurdu — oysa yalnız süzgeç geçersiz.
    expect(resolveAccount('silinmis-hesap', ['a', 'b'])).toBe(ALL_ACCOUNTS);
  });

  it('gerçek kimliği korur', () => {
    expect(resolveAccount('b', ['a', 'b'])).toBe('b');
  });

  it('`all`ı olduğu gibi bırakır', () => {
    expect(resolveAccount(ALL_ACCOUNTS, [])).toBe(ALL_ACCOUNTS);
  });
});

describe('periodRange', () => {
  it('`all` pencere üretmez', () => {
    // Penceresiz olması ŞART: liste zaten en yeniden eskiye sonsuz kaydırıyor ve öntanımlı bir
    // pencere, aradığı eski hareketi bulamayan operatörü listede değil süzgeçte kaybederdi.
    expect(periodRange('all', new Date('2026-08-04T10:00:00.000Z'))).toBeUndefined();
  });

  it('gün sayısını geriye sayar ve GÜN döner (saat değil)', () => {
    expect(periodRange('d7', new Date('2026-08-04T10:00:00.000Z'))).toEqual({ from: '2026-07-28', to: '2026-08-04' });
  });

  it('90 günlük pencere ay sınırını doğru geçer', () => {
    expect(periodRange('d90', new Date('2026-08-04T10:00:00.000Z'))).toEqual({ from: '2026-05-06', to: '2026-08-04' });
  });
});
