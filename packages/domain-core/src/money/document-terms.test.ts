import { describe, expect, it } from 'vitest';
import { documentDueOn, suggestVatRegime, vatRegimeProblem } from './document-terms';

describe('belgenin KDV rejimi önerisi (12.26)', () => {
  it('Fransa dışındaki tedarikçinin KDV\'siz faturası ters yüklemedir — AB içi de ithalat da', () => {
    expect(suggestVatRegime({ supplierCountry: 'BE', vatAmountCents: 0 })).toBe('reverse_charge');
    expect(suggestVatRegime({ supplierCountry: 'TR', vatAmountCents: null })).toBe('reverse_charge');
  });

  it('KDV yazan belge standarttır; Fransız tedarikçi ve ülkesi bilinmeyen tedarikçi standart kalır', () => {
    expect(suggestVatRegime({ supplierCountry: 'BE', vatAmountCents: 1200 })).toBe('standard');
    expect(suggestVatRegime({ supplierCountry: 'FR', vatAmountCents: 0 })).toBe('standard');
    expect(suggestVatRegime({ supplierCountry: null, vatAmountCents: 0 })).toBe('standard');
  });

  it('standart dışındaki rejimde KDV olamaz', () => {
    expect(vatRegimeProblem('reverse_charge', 100)).toBe('vat_with_regime');
    expect(vatRegimeProblem('exempt', 1)).toBe('vat_with_regime');
    expect(vatRegimeProblem('reverse_charge', 0)).toBeNull();
    expect(vatRegimeProblem('reverse_charge', null)).toBeNull();
    expect(vatRegimeProblem('standard', 5000)).toBeNull();
  });
});

describe('vade önerisi', () => {
  it('belge günü + tedarikçinin vadesi; ay ve yıl sınırını geçer', () => {
    expect(documentDueOn('2026-09-12', 10)).toBe('2026-09-22');
    expect(documentDueOn('2026-12-20', 30)).toBe('2027-01-19');
  });

  it('vadesiz tedarikçi peşin çalışır — vade belgenin günü; bozuk tarih uydurulmaz', () => {
    expect(documentDueOn('2026-09-12', null)).toBe('2026-09-12');
    expect(documentDueOn('12/09/2026', 10)).toBeNull();
    expect(documentDueOn('', 10)).toBeNull();
  });
});
