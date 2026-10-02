import { describe, expect, it } from 'vitest';
import { DOCUMENT_VAT_PROBLEM_LABEL } from './labels';
import { invoiceBlock, invoiceTermsOf, settled, withRegime, type InvoiceFields } from './schema';

/**
 * Faturanın para künyesi: belge penceresi ile asistanın üç gövdesi aynı bloğu açar ve kapıya giden kırılım ile toplam burada türer;
 * gizlenen ya da kilitlenen kutudaki eski değer kapıya gitmesin.
 */
const fields = (patch: Partial<InvoiceFields> = {}): InvoiceFields => ({
  amount: null,
  vatLines: [{ vatRate: 20, net: 300, vat: 60 }],
  vatRegime: 'standard',
  dueOn: '',
  ...patch,
});

describe('faturanın kırılımı', () => {
  it("ters yüklemede satırın KDV'si kapıya sıfır gider ve toplam KDV hariç tutara iner; standarda dönünce kutudaki KDV geri gelir", () => {
    const ters = withRegime(settled(fields()), 'reverse_charge');
    expect(invoiceTermsOf(ters)).toMatchObject({ amountCents: 30_000, vatLines: [{ vatRate: 20, netCents: 30_000, vatCents: 0 }] });
    expect(ters.amount).toBe(300);
    expect(invoiceTermsOf(withRegime(ters, 'standard')).vatLines).toEqual([{ vatRate: 20, netCents: 30_000, vatCents: 6000 }]);
  });

  it('muaf belgede kırılım kapıya gitmez; toplam kutudan okunur ve son kırılımın toplamı orada kalır', () => {
    expect(invoiceTermsOf(withRegime(settled(fields()), 'exempt'))).toMatchObject({
      amountCents: 36_000,
      vatLines: [],
      vatRegime: 'exempt',
    });
  });

  it('KDV hariç tutarı boş ya da sıfır satır sayılmaz; kırılım doluysa toplam kutudan değil satırlardan türer', () => {
    const invoice = fields({
      amount: 999,
      vatLines: [
        { vatRate: 20, net: 300, vat: 60 },
        { vatRate: 5.5, net: null, vat: null },
        { vatRate: 10, net: 0, vat: 0 },
      ],
    });
    expect(invoiceTermsOf(invoice)).toMatchObject({ amountCents: 36_000, vatLines: [{ vatRate: 20, netCents: 30_000, vatCents: 6000 }] });
  });

  it('mal kabul ve sipariş gövdesinde fatura ödenecek faturadır: kırılımsız kaydedilmez; bordro kırılımsız geçer', () => {
    expect(invoiceBlock(fields({ amount: 120, vatLines: [] }), '2026-10-02')).toBe(DOCUMENT_VAT_PROBLEM_LABEL.vat_lines_required);
    expect(invoiceBlock(fields({ amount: 120, vatLines: [] }), '2026-10-02', { kind: 'payslip', direction: 'out' })).toBeNull();
  });
});
