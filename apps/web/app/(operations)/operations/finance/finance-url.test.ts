import { describe, expect, it } from 'vitest';
import { ALL_ACCOUNTS, financeUrl, parseFinanceUrl, resolveAccount, type FinanceUrlState } from './finance-url';

// Para ekranının URL sözleşmesi — DB'siz, saf. Süzgeçler adreste taşındığı için bu dosyanın
// koruduğu şey bir davranış değil bir SÖZ: aynı görünüm hep aynı adresi üretir, bozuk adres ekranı
// kırmaz.

const DEFAULTS: FinanceUrlState = { acct: ALL_ACCOUNTS, tab: 'movements', type: 'all', from: '', to: '', scope: 'all', open: false };

describe('parseFinanceUrl', () => {
  it('boş parametrede varsayılanları verir', () => {
    expect(parseFinanceUrl({})).toEqual(DEFAULTS);
  });

  it('tanınmayan değeri sessizce varsayılana düşürür', () => {
    // Bozuk bağlantı ekranı KIRMAMALI: elle düzenlenmiş ya da eskimiş bir adres, boş bir hata
    // sayfası yerine varsayılan görünümü açar. Eski `period` parametresi de artık yok sayılır.
    expect(parseFinanceUrl({ type: 'uydurma', tab: 'hepsi', period: 'd30', scope: 'hepsi', open: 'evet' })).toEqual(DEFAULTS);
  });

  it('geçerli süzgeçleri okur', () => {
    expect(
      parseFinanceUrl({ acct: 'abc', tab: 'documents', type: 'expense', from: '2026-09-01', to: '2026-09-13', scope: 'unmatched', open: '1' }),
    ).toEqual({ acct: 'abc', tab: 'documents', type: 'expense', from: '2026-09-01', to: '2026-09-13', scope: 'unmatched', open: true });
  });

  it('bozuk günü düşürür — biçim de, takvim de denetlenir', () => {
    expect(parseFinanceUrl({ from: '2026-9-1', to: '2026-13-40' })).toMatchObject({ from: '', to: '' });
  });

  it('ters aralığı çevirir — boş liste yerine kastedilen aralık açılır', () => {
    expect(parseFinanceUrl({ from: '2026-09-20', to: '2026-09-05' })).toMatchObject({ from: '2026-09-05', to: '2026-09-20' });
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
    const state: FinanceUrlState = { acct: 'abc', tab: 'documents', type: 'expense', from: '2026-09-01', to: '2026-09-13', scope: 'unmatched', open: true };
    expect(financeUrl(state)).toBe('/operations/finance?acct=abc&tab=documents&type=expense&from=2026-09-01&to=2026-09-13&scope=unmatched&open=1');
  });

  it('gidiş-dönüş kayıpsız', () => {
    const state: FinanceUrlState = { acct: 'x1', tab: 'movements', type: 'transfer', from: '2026-08-01', to: '2026-08-31', scope: 'unmatched', open: false };
    const query = financeUrl(state).split('?')[1] ?? '';
    expect(parseFinanceUrl(Object.fromEntries(new URLSearchParams(query)))).toEqual(state);
  });
});

describe('resolveAccount', () => {
  it('bilinmeyen kimliği `all`a düşürür', () => {
    // Doğrulanmasaydı hiçbir kartın seçili görünmediği bir hâlde boş liste çıkardı ve operatör onu
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
