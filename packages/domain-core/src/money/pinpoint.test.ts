import { describe, expect, it } from 'vitest';
import { hasSupplierIdentity, matchNature, phoneKeyOf, pinpointCounterparty, pinpointSupplier, vatKeyOf } from './pinpoint';

const suppliers = [
  { id: 's1', name: 'Gaziantep Baklava Fabrikası', vatNumber: 'TR1234567890', contact: { phone: '+905321112233' } },
  { id: 's2', name: 'Alsace Frais Distribution', vatNumber: 'FR12345678901', contact: { phone: '+33388991122', email: 'x@y.fr' } },
  { id: 's3', name: 'Alsace Frais', vatNumber: null, contact: null },
];

describe('tedarikçi nokta atışı (22.42 · kullanıcı kararı 14.09)', () => {
  it('vergi numarasıyla bulur — boşluk, nokta ve harf büyüklüğü fark etmez', () => {
    expect(pinpointSupplier(suppliers, { vatNumber: 'fr 12.345.678.901' })).toMatchObject({ status: 'found', record: { id: 's2' } });
  });

  it('telefonla bulur — ulusal biçim E.164 kayda eşitlenir', () => {
    expect(pinpointSupplier(suppliers, { phone: '03 88 99 11 22' })).toMatchObject({ status: 'found', record: { id: 's2' } });
  });

  it('tam adla bulur; parça ad BULMAZ', () => {
    expect(pinpointSupplier(suppliers, { name: 'gaziantep baklava fabrikasi' })).toMatchObject({ status: 'found', record: { id: 's1' } });
    expect(pinpointSupplier(suppliers, { name: 'Gaziantep' })).toEqual({ status: 'none' });
    expect(pinpointSupplier(suppliers, { name: 'Alsace' })).toEqual({ status: 'none' });
  });

  it('iki anahtar iki ayrı kayda gidiyorsa "birden çok" — fatura ile kayıt çelişiyor', () => {
    expect(pinpointSupplier(suppliers, { vatNumber: 'TR1234567890', name: 'Alsace Frais' })).toEqual({ status: 'ambiguous', count: 2 });
  });

  it('aynı kayda giden iki anahtar tek sonuçtur', () => {
    expect(pinpointSupplier(suppliers, { vatNumber: 'FR12345678901', name: 'Alsace Frais Distribution' })).toMatchObject({
      status: 'found',
      record: { id: 's2' },
    });
  });

  it('kimlik verilmemişse aranmaz; dört karakterden kısa vergi numarası kimlik sayılmaz', () => {
    expect(hasSupplierIdentity({})).toBe(false);
    expect(hasSupplierIdentity({ name: '  ' })).toBe(false);
    expect(hasSupplierIdentity({ vatNumber: 'FR1' })).toBe(false);
    expect(hasSupplierIdentity({ phone: '0388991122' })).toBe(true);
    expect(pinpointSupplier(suppliers, {})).toEqual({ status: 'none' });
  });

  it('anahtar normalizasyonu', () => {
    expect(vatKeyOf(' fr-12 345 ')).toBe('FR12345');
    expect(phoneKeyOf('0388991122')).toBe('+33388991122');
    expect(phoneKeyOf('abc')).toBeNull();
  });
});

const counterparties = [
  { id: 'c1', name: 'URSSAF', keywords: ['URSSAF'] },
  { id: 'c2', name: 'Cabinet Comptable Muller', keywords: ['CABINET COMPTABLE MULLER'] },
  { id: 'c3', name: 'SCI Rhin Immobilier', keywords: ['SCI RHIN'] },
];

describe('cari nokta atışı', () => {
  it('tam adla ya da eşleşme kelimesiyle bulur', () => {
    expect(pinpointCounterparty(counterparties, 'cabinet comptable muller')).toMatchObject({ status: 'found', record: { id: 'c2' } });
    expect(pinpointCounterparty(counterparties, 'SCI Rhin')).toMatchObject({ status: 'found', record: { id: 'c3' } });
  });

  it('parça ad bulmaz, boş ad aranmaz', () => {
    expect(pinpointCounterparty(counterparties, 'Muller')).toEqual({ status: 'none' });
    expect(pinpointCounterparty(counterparties, '')).toEqual({ status: 'none' });
    expect(pinpointCounterparty(counterparties, null)).toEqual({ status: 'none' });
  });
});

const natures = [
  { slug: 'kira', label: 'Kira', direction: 'out' as const },
  { slug: 'telefon-internet', label: 'Telefon ve internet', direction: 'out' as const },
  { slug: 'sermaye', label: 'Sermaye', direction: 'in' as const },
  { slug: 'faiz', label: 'Faiz', direction: null },
];

describe('tür eşleşmesi — slug ya da okunur ad, yöne uygun', () => {
  it('slug ve okunur ad aynı türü bulur; yönsüz tür her yönde', () => {
    expect(matchNature(natures, 'Kira', 'out')?.slug).toBe('kira');
    expect(matchNature(natures, 'telefon ve internet', 'out')?.slug).toBe('telefon-internet');
    expect(matchNature(natures, 'telefon-internet', 'out')?.slug).toBe('telefon-internet');
    expect(matchNature(natures, 'faiz', 'in')?.slug).toBe('faiz');
  });

  it('yöne uymayan tür ve bilinmeyen kelime null — uydurulmaz', () => {
    expect(matchNature(natures, 'Kira', 'in')).toBeNull();
    expect(matchNature(natures, 'yakıt', 'out')).toBeNull();
    expect(matchNature(natures, null, 'out')).toBeNull();
  });
});
