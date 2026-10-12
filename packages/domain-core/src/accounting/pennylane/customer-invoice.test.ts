import { describe, expect, it } from 'vitest';
import type { UserProfile } from '@lezzet/types';
import type { SaleVatBasis } from '../export';
import {
  pennylaneCustomerCandidates,
  pennylaneCustomerDraft,
  pennylaneCustomerPatch,
  pennylaneSalesInvoiceDraft,
  pennylaneSalesInvoiceLines,
  pennylaneTotalsMatch,
  type SalesInvoiceItem,
} from './customer-invoice';

/**
 * Satış faturasının Pennylane'e giden hâli. Satırlar dökümün hesabından kurulur; yanlış satır kesinleşen faturaya girer ve
 * düzeltmesi alacak notudur.
 */

const B2B: SaleVatBasis = { pricesIncludeVat: false, vatTreatment: 'domestic', shippingFeeCents: 0 };
const item = (over: Partial<SalesInvoiceItem> = {}): SalesInvoiceItem => ({
  label: 'Baklava · 1 kg',
  qty: 1,
  fulfilledQty: 1,
  goodwillQty: 0,
  unitPriceCents: 1000,
  lineDiscountAmountCents: 0,
  vatRate: 5.5,
  ...over,
});
const lines = (items: SalesInvoiceItem[], sale: SaleVatBasis = B2B, regime: 'standard' | 'reverse_charge' = 'standard', country = 'FR') =>
  pennylaneSalesInvoiceLines([{ sale, items, shippingLabel: 'Livraison' }], regime, country);

describe('Pennylane müşteri kaydı', () => {
  // SIREN ve fatura adresi kayıtta olmazsa fatura alıcıya yönlenmez. Dil konuşulan dilden seçilseydi Pennylane'in şablonu olmayan
  // dilde (Türkçe) fatura istenir, Almanya'daki müşteri Fransızca alırdı.
  it("yasal ad, SIRET'ten SIREN ve fatura adresiyle açılır; dil adres Almanya'daysa Almanca, değilse Fransızcadır", () => {
    const customer = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Ahmet Yılmaz',
      email: 'muhasebe@oberjaegerhof.fr',
      companyInfo: { legalName: 'Restaurant Oberjaegerhof', siret: '73282932000074' },
      vatNumber: null,
    } as Pick<UserProfile, 'id' | 'name' | 'email' | 'companyInfo' | 'vatNumber'>;
    const address = { line1: '12 rue du Faubourg de Pierre', line2: null, postalCode: '67000', city: 'Strasbourg', country: 'FR' as const };
    expect(pennylaneCustomerDraft(customer, address)).toMatchObject({
      name: 'Restaurant Oberjaegerhof',
      externalReference: 'cus:11111111-1111-4111-8111-111111111111',
      regNo: '732829320',
      emails: ['muhasebe@oberjaegerhof.fr'],
      billingAddress: { address: '12 rue du Faubourg de Pierre', postalCode: '67000', city: 'Strasbourg', countryAlpha2: 'FR' },
      language: 'fr_FR',
    });
    expect(pennylaneCustomerDraft(customer, { ...address, postalCode: '77694', city: 'Kehl', country: 'DE' }).language).toBe('de_DE');
  });
});

describe("Pennylane'de aynı firma", () => {
  const record = (over: { regNo?: string | null; vatNumber?: string | null; name?: string }) => ({
    id: 1,
    name: over.name ?? 'Restaurant Oberjaegerhof',
    externalReference: null,
    regNo: over.regNo ?? null,
    vatNumber: over.vatNumber ?? null,
    billingAddress: null,
  });

  // Ad eşleşseydi aynı adlı başka firmanın kaydına fatura kesilirdi; SIREN ve KDV numarası tutmasaydı aynı firma ikinci kez açılırdı.
  it("SIRET ya da FR KDV numarası tutan kayıt SIREN'le, Alman kaydı KDV numarasıyla bulunur; yalnız adı tutan kayıt aday değildir", () => {
    const bySiret = record({ regNo: '732 829 320 00074' });
    const byVat = record({ vatNumber: 'FR 40 732829320' });
    const byName = record({});
    const german = record({ vatNumber: 'DE123456789' });
    expect(pennylaneCustomerCandidates([bySiret, byVat, byName, german], { regNo: '732829320', vatNumber: null })).toEqual([
      bySiret,
      byVat,
    ]);
    expect(pennylaneCustomerCandidates([bySiret, german], { regNo: null, vatNumber: 'de 123456789' })).toEqual([german]);
    expect(pennylaneCustomerCandidates([byName], { regNo: null, vatNumber: null })).toEqual([]);
  });

  const draft = pennylaneCustomerDraft(
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Ahmet Yılmaz',
      email: null,
      companyInfo: { legalName: 'Restaurant Oberjaegerhof', siret: '73282932000074' },
      vatNumber: null,
    } as Pick<UserProfile, 'id' | 'name' | 'email' | 'companyInfo' | 'vatNumber'>,
    { line1: '12 rue du Faubourg de Pierre', line2: null, postalCode: '67000', city: 'Strasbourg', country: 'FR' },
  );

  // Fark yazılmasaydı taşınan müşterinin faturası eski adrese kesilirdi; SIRET SIREN'le ezilseydi muhasebenin kaydı bozulurdu.
  it("kayıtla fark yalnız değişen alandır; SIRET tutan kaydın SIREN'i aynıysa kimlik değişmiş sayılmaz", () => {
    const same = { ...record({ regNo: '73282932000074' }), billingAddress: draft.billingAddress };
    expect(pennylaneCustomerPatch(same, draft)).toBeNull();
    const moved = { ...same, billingAddress: { ...draft.billingAddress, address: '3 place Kléber', postalCode: '67000' } };
    expect(pennylaneCustomerPatch(moved, draft)).toEqual({ billingAddress: draft.billingAddress });
    expect(pennylaneCustomerPatch({ ...same, billingAddress: null }, draft)).toEqual({ billingAddress: draft.billingAddress });
  });
});

describe('fatura satırları', () => {
  // Teslim edilmeyen adet faturaya girseydi müşteri almadığı malın faturasını alırdı.
  it('kalem teslim edilen adet ve KDV hariç birim fiyatla yazılır', () => {
    expect(lines([item({ qty: 4, fulfilledQty: 3 })])).toEqual([
      { label: 'Baklava · 1 kg', quantity: 3, unit: 'piece', unitPrice: '10', vatCode: 'FR_55' },
    ]);
  });

  it('kalem indirimi birim fiyata iner', () => {
    expect(lines([item({ qty: 2, fulfilledQty: 2, lineDiscountAmountCents: 200 })])?.[0]?.unitPrice).toBe('9');
  });

  // KDV dahil fiyatlı siparişte birim fiyat ayrıştırılmasaydı Pennylane KDV'yi bir kez daha eklerdi.
  it('KDV dahil fiyatlı siparişte birim fiyat KDV hariçtir', () => {
    expect(lines([item({ unitPriceCents: 1055 })], { ...B2B, pricesIncludeVat: true })?.[0]?.unitPrice).toBe('10');
  });

  it('kargo oran payıyla KDV hariç ayrı satırdır', () => {
    const result = lines([item()], { ...B2B, shippingFeeCents: 600 });
    expect(result?.[1]).toEqual({ label: 'Livraison', quantity: 1, unit: 'piece', unitPrice: '5.69', vatCode: 'FR_55' });
  });

  // Ters yüklemede KDV ayrılsaydı Alman müşterinin faturası eksik tutarlı olurdu.
  it('ters yüklemede satır AB içi kodla ve KDV ayrılmadan yazılır', () => {
    expect(lines([item()], { ...B2B, vatTreatment: 'intra_eu_b2b_reverse_charge' }, 'reverse_charge', 'DE')).toEqual([
      { label: 'Baklava · 1 kg', quantity: 1, unit: 'piece', unitPrice: '10', vatCode: 'intracom_55' },
    ]);
  });

  // Kodu olmayan oran sessizce gitseydi Pennylane faturayı yanlış kodla keserdi.
  it('Pennylane kodu olmayan oranda fatura satır üretmez, muhasebeciyle netleşir', () => {
    expect(lines([item({ vatRate: 20 })], { ...B2B, vatTreatment: 'intra_eu_b2b_reverse_charge' }, 'reverse_charge', 'DE')).toBeNull();
    expect(lines([item({ vatRate: 7 })])).toBeNull();
  });
});

describe('fatura taslağı', () => {
  // İbare basılmasaydı Alman müşterinin KDV'siz faturası yasal dayanağını göstermezdi.
  it('ters yüklemede dökümün ibaresi faturaya basılır, yurt içi satışta basılmaz', () => {
    const draft = (vatTreatment: 'domestic' | 'intra_eu_b2b_reverse_charge') =>
      pennylaneSalesInvoiceDraft({
        documentId: '22222222-2222-4222-8222-222222222222',
        customerId: 7,
        date: '2026-10-12',
        deadline: '2026-11-11',
        templateId: null,
        language: 'de',
        vatTreatment,
        lines: lines([item()])!,
      });
    expect(draft('intra_eu_b2b_reverse_charge')).toMatchObject({
      specialMention: 'Autoliquidation',
      externalReference: 'sinv:22222222-2222-4222-8222-222222222222',
      language: 'de_DE',
    });
    expect(draft('domestic').specialMention).toBeNull();
  });
});

describe('Pennylane toplamı', () => {
  const document = { amountCents: 1055, vatLines: [{ vatRate: 5.5 as const, netCents: 1000, vatCents: 55 }] };

  // Kuruş farkı gözden kaçsaydı kesinleşen faturanın tutarı bizim belgemizden ayrılırdı ve düzeltmesi alacak notu olurdu.
  it('tutar, KDV hariç ve KDV birebir aynıysa eşleşir; kuruş farkı ya da ayrı bölüşüm eşleşmez', () => {
    expect(pennylaneTotalsMatch(document, { amountCents: 1055, netCents: 1000, taxCents: 55 })).toBe(true);
    expect(pennylaneTotalsMatch(document, { amountCents: 1056, netCents: 1000, taxCents: 56 })).toBe(false);
    expect(pennylaneTotalsMatch(document, { amountCents: 1055, netCents: 1001, taxCents: 54 })).toBe(false);
  });
});
