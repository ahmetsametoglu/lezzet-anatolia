import type { DocumentVatRate } from '@lezzet/types';
import { describe, expect, it } from 'vitest';
import { documentDueOn, documentVatProblem, suggestVatRegime, vatLinesTotals } from './document-terms';

describe('belgenin KDV rejimi önerisi', () => {
  it("Fransa dışındaki tedarikçinin KDV'siz faturası ters yüklemedir — AB içi de ithalat da", () => {
    expect(suggestVatRegime({ supplierCountry: 'BE', vatAmountCents: 0 })).toBe('reverse_charge');
    expect(suggestVatRegime({ supplierCountry: 'TR', vatAmountCents: null })).toBe('reverse_charge');
  });

  it('KDV yazan belge standarttır; Fransız tedarikçi ve ülkesi bilinmeyen tedarikçi standart kalır', () => {
    expect(suggestVatRegime({ supplierCountry: 'BE', vatAmountCents: 1200 })).toBe('standard');
    expect(suggestVatRegime({ supplierCountry: 'FR', vatAmountCents: 0 })).toBe('standard');
    expect(suggestVatRegime({ supplierCountry: null, vatAmountCents: 0 })).toBe('standard');
  });
});

describe('belgenin KDV kırılımı', () => {
  const invoice = { kind: 'invoice', direction: 'out', vatRegime: 'standard' } as const;
  const line = (vatRate: DocumentVatRate, netCents: number, vatCents: number) => ({ vatRate, netCents, vatCents });

  it('ödeyeceğimiz fatura ve fiş kırılımsız geçmez; bordro, bize ödenecek belge ve muaf belge kırılımsız geçer', () => {
    expect(documentVatProblem({ ...invoice, amountCents: 12_000, vatLines: [] })).toBe('vat_lines_required');
    expect(documentVatProblem({ ...invoice, kind: 'receipt', vatRegime: 'reverse_charge', amountCents: 12_000, vatLines: [] })).toBe(
      'vat_lines_required',
    );
    expect(documentVatProblem({ ...invoice, kind: 'payslip', amountCents: 250_000, vatLines: [] })).toBeNull();
    expect(documentVatProblem({ ...invoice, direction: 'in', amountCents: 12_000, vatLines: [] })).toBeNull();
    expect(documentVatProblem({ ...invoice, vatRegime: 'exempt', amountCents: 42_000, vatLines: [] })).toBeNull();
  });

  it("ters yüklemede satırın KDV'si sıfırdır, muaf belgenin satırı olmaz", () => {
    expect(
      documentVatProblem({ ...invoice, vatRegime: 'reverse_charge', amountCents: 25_000, vatLines: [line(5.5, 25_000, 0)] }),
    ).toBeNull();
    expect(documentVatProblem({ ...invoice, vatRegime: 'reverse_charge', amountCents: 26_375, vatLines: [line(5.5, 25_000, 1375)] })).toBe(
      'vat_with_regime',
    );
    expect(documentVatProblem({ ...invoice, vatRegime: 'exempt', amountCents: 25_000, vatLines: [line(5.5, 25_000, 0)] })).toBe(
      'vat_with_regime',
    );
  });

  it('aynı oran iki satırda olmaz', () => {
    expect(documentVatProblem({ ...invoice, amountCents: 24_000, vatLines: [line(20, 10_000, 2000), line(20, 10_000, 2000)] })).toBe(
      'vat_rate_duplicate',
    );
  });

  it('KDV orana uymalı; kalem kalem yuvarlamanın payı geçer, yanlış oran geçmez', () => {
    // Küçük tutarda pay 2 cent: 20 % × 10,00 € = 2,00 €.
    expect(documentVatProblem({ ...invoice, amountCents: 1198, vatLines: [line(20, 1000, 198)] })).toBeNull();
    expect(documentVatProblem({ ...invoice, amountCents: 1202, vatLines: [line(20, 1000, 202)] })).toBeNull();
    expect(documentVatProblem({ ...invoice, amountCents: 1203, vatLines: [line(20, 1000, 203)] })).toBe('vat_rate_mismatch');
    // Büyük faturada pay binde beş: 20 % × 10.000 € = 2.000 €, 10 € sapma geçer, 10,01 € geçmez.
    expect(documentVatProblem({ ...invoice, amountCents: 1_201_000, vatLines: [line(20, 1_000_000, 201_000)] })).toBeNull();
    expect(documentVatProblem({ ...invoice, amountCents: 1_201_001, vatLines: [line(20, 1_000_000, 201_001)] })).toBe('vat_rate_mismatch');
    // 5,5 %'lik mal 20 % ile girilmiş.
    expect(documentVatProblem({ ...invoice, amountCents: 12_000, vatLines: [line(5.5, 10_000, 2000)] })).toBe('vat_rate_mismatch');
  });

  it('satırların KDV dâhil toplamı belgenin tutarıdır', () => {
    const lines = [line(20, 30_000, 6000), line(5.5, 1800, 99)];
    expect(documentVatProblem({ ...invoice, amountCents: 37_899, vatLines: lines })).toBeNull();
    expect(documentVatProblem({ ...invoice, amountCents: 37_900, vatLines: lines })).toBe('vat_total_mismatch');
  });

  it("satırsız belgenin KDV'si bilinmiyor değil yazmıyor: null; ters yüklemenin KDV'si sıfır", () => {
    expect(vatLinesTotals([])).toEqual({ netCents: 0, vatCents: null, grossCents: 0 });
    expect(vatLinesTotals([line(5.5, 25_000, 0)])).toEqual({ netCents: 25_000, vatCents: 0, grossCents: 25_000 });
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
