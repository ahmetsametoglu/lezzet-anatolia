import { describe, expect, it } from 'vitest';
import { b2bFlag, b2bSignals, isFoodActivityCode, VAT_CHECK_FRESH_DAYS, type B2bSignalInput } from './b2b-approval';

/** Sabit "şimdi" — yaş hesabı sınandığı için saat okumak testi bir gün kendiliğinden kırardı. */
const SIMDI = new Date('2026-08-27T12:00:00.000Z');
const gunOnce = (n: number) => new Date(SIMDI.getTime() - n * 86_400_000).toISOString();

const temiz: B2bSignalInput = {
  companyInfo: { legalName: 'SARL BOSPHORE', siret: '81234567800019', activityCode: '5610A', foundedYear: 2016, isActive: true },
  vatNumber: 'FR81812345678',
  vatNumberValid: true,
  vatCheckedAt: SIMDI.toISOString(),
  now: SIMDI,
  country: 'FR',
  inRoute: true,
  duplicateCount: 0,
};

const bul = (input: B2bSignalInput, label: string) => b2bSignals(input).find((s) => s.label.startsWith(label));

describe('isFoodActivityCode', () => {
  it('gıda aileleri tanınır, noktalama yok sayılır', () => {
    for (const kod of ['56.10A', '5610A', '47.11B', '4632A', '1013B', '55.10Z']) {
      expect(isFoodActivityCode(kod), kod).toBe(true);
    }
  });

  it('gıda dışı kod ve boş değer false döner', () => {
    for (const kod of ['96.02A', '6201Z', '4321A', '', null, undefined]) {
      expect(isFoodActivityCode(kod), String(kod)).toBe(false);
    }
  });
});

describe('b2bSignals', () => {
  it('temiz FR başvurusunda altı sinyalin hepsi olumlu', () => {
    const s = b2bSignals(temiz);
    expect(s).toHaveLength(6);
    expect(s.every((x) => x.tone === 'ok')).toBe(true);
  });

  it('SORULMAMIŞ VIES ile GEÇERSİZ VIES ayrı — eksik veri kötü veri gibi okunmaz', () => {
    expect(bul({ ...temiz, vatNumberValid: null, vatCheckedAt: null }, 'KDV no')).toMatchObject({ value: 'Sorulmadı', tone: 'warn' });
    expect(bul({ ...temiz, vatNumberValid: false }, 'KDV no')).toMatchObject({ value: 'Geçersiz', tone: 'bad' });
  });

  it('numara hiç yoksa "Numara yok" der — "Sorulmadı" demek numara varmış izlenimi verirdi', () => {
    expect(bul({ ...temiz, vatNumber: null, vatNumberValid: null, vatCheckedAt: null }, 'KDV no')?.value).toBe('Numara yok');
  });
});

/**
 * **Doğrulamanın YAŞI** (27.08) — bu bayrak %0 KDV açıyor (`tax/vat-treatment`), yani bayat bir
 * "Geçerli" vergi hatasıdır. Sinyal yaşı söylemek zorunda; ama eski doğrulama GEÇERSİZLİK değildir,
 * o yüzden hiçbir yaşta kırmızıya dönmez.
 */
describe('KDV sinyalinin yaşı', () => {
  const kdv = (over: Partial<B2bSignalInput>) => bul({ ...temiz, ...over }, 'KDV no');

  it('bugün doğrulanmışsa gününü söyler ve yeşildir', () => {
    expect(kdv({ vatCheckedAt: SIMDI.toISOString() })).toMatchObject({ value: 'Geçerli · bugün', tone: 'ok' });
  });

  it('eşiğin İÇİNDE yaşını söyler ama yeşil kalır', () => {
    expect(kdv({ vatCheckedAt: gunOnce(VAT_CHECK_FRESH_DAYS) })).toMatchObject({
      value: `Geçerli · ${VAT_CHECK_FRESH_DAYS} gün önce`,
      tone: 'ok',
    });
  });

  it('eşiği AŞINCA bayat der ve sararır — ama KIRMIZI olmaz: eskimek geçersizlik değildir', () => {
    const s = kdv({ vatCheckedAt: gunOnce(VAT_CHECK_FRESH_DAYS + 1) });
    expect(s?.value).toContain('bayat');
    expect(s?.tone).toBe('warn');
  });

  it('DAMGASIZ "geçerli" taze SAYILMAZ — yaşı bilinmeyen doğrulama, kapatılan hatanın ta kendisi', () => {
    expect(kdv({ vatCheckedAt: null })).toMatchObject({ value: 'Geçerli · yaşı bilinmiyor', tone: 'warn' });
  });

  it('bozuk damga yaş UYDURMAZ, bilinmiyora düşer', () => {
    expect(kdv({ vatCheckedAt: 'dün' })?.value).toBe('Geçerli · yaşı bilinmiyor');
  });

  it('GEÇERSİZ numarada yaş hiç sorulmaz — damgası taze de olsa kırmızıdır', () => {
    expect(kdv({ vatNumberValid: false, vatCheckedAt: gunOnce(400) })).toMatchObject({ value: 'Geçersiz', tone: 'bad' });
  });

  it('bayat doğrulama bayrağı sarıya çeker, kırmızıya değil', () => {
    expect(b2bFlag(b2bSignals({ ...temiz, vatCheckedAt: gunOnce(365) }))).toMatchObject({ label: 'Dikkat', tone: 'warn' });
  });

  it('kapalı resmî kayıt kırmızı, EKSİK resmî kayıt yalnız uyarı', () => {
    expect(bul({ ...temiz, companyInfo: { ...temiz.companyInfo!, isActive: false } }, 'Resmî kayıt')?.tone).toBe('bad');
    expect(bul({ ...temiz, companyInfo: { ...temiz.companyInfo!, isActive: null } }, 'Resmî kayıt')?.tone).toBe('warn');
  });

  it('DE başvurusunda resmî kayıt sinyalinin yokluğu ARIZA DEĞİL — etiketi bunu söyler', () => {
    const s = bul({ ...temiz, country: 'DE', companyInfo: { legalName: 'Anadolu Markt GmbH' } }, 'Resmî kayıt');
    expect(s).toMatchObject({ value: 'Sinyal yok (DE)', tone: 'warn' });
  });

  it('rota DIŞI kırmızı değil: kargoyla satmak meşru bir karar, sadece bilinmesi gerekir', () => {
    expect(bul({ ...temiz, inRoute: false }, 'Adres–rota')).toMatchObject({ value: 'Rota dışı', tone: 'warn' });
  });

  it('adres yoksa ÖLÇÜLEMEDİ der, "rota dışı" demez', () => {
    expect(bul({ ...temiz, inRoute: null }, 'Adres–rota')?.value).toBe('Adres yok');
  });

  it('mükerrer eşleşme tek başına kırmızı — aynı işletmenin iki hesabı geçmişi ikiye böler', () => {
    expect(bul({ ...temiz, duplicateCount: 2 }, 'Mükerrer')).toMatchObject({ value: '2 olası eşleşme', tone: 'bad' });
  });

  it('gıda dışı faaliyet kodu uyarıdır, ret değil', () => {
    const s = bul({ ...temiz, companyInfo: { ...temiz.companyInfo!, activityCode: '9602A' } }, 'Faaliyet');
    expect(s).toMatchObject({ value: '9602A (gıda dışı)', tone: 'warn' });
  });
});

describe('b2bFlag', () => {
  it('hepsi olumluysa Temiz', () => {
    expect(b2bFlag(b2bSignals(temiz))).toMatchObject({ label: 'Temiz', tone: 'ok' });
  });

  it('mükerrer varsa bayrak onu adıyla söyler — en çok iş gerektiren durum o', () => {
    expect(b2bFlag(b2bSignals({ ...temiz, duplicateCount: 1 }))).toMatchObject({ label: 'Mükerrer', tone: 'bad' });
  });

  it('mükerrer olmayan olumsuz sinyalde Dikkat/kırmızı', () => {
    const s = b2bSignals({ ...temiz, companyInfo: { ...temiz.companyInfo!, isActive: false } });
    expect(b2bFlag(s)).toMatchObject({ label: 'Dikkat', tone: 'bad' });
  });

  it('yalnız eksik bilgi varsa Dikkat/amber — kırmızıya çekilmez', () => {
    expect(b2bFlag(b2bSignals({ ...temiz, inRoute: null }))).toMatchObject({ label: 'Dikkat', tone: 'warn' });
  });
});
