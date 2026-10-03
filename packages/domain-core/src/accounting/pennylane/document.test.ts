import type { MoneyDocument, PennylaneInvoiceDraft } from '@lezzet/types';
import { describe, expect, it } from 'vitest';
import {
  pennylaneDocumentScope,
  pennylaneInvoiceDraft,
  pennylaneInvoicePatch,
  pennylanePaymentStatus,
  pennylaneSupplierCandidates,
  pennylaneVatCode,
} from './document';

const document = (over: Partial<MoneyDocument> = {}): MoneyDocument =>
  ({
    id: '6f0c8a52-1d0e-4c3b-9a55-7b2f0c1d2e3f',
    kind: 'invoice',
    direction: 'out',
    number: 'F-2026-118',
    issuedOn: '2026-10-02',
    dueOn: '2026-11-01',
    supplierId: '0b8e2c11-6a2f-4a7e-8f0d-3c4b5a697887',
    counterpartyId: null,
    amountCents: 16_550,
    vatLines: [
      { vatRate: 5.5, netCents: 10_000, vatCents: 550 },
      { vatRate: 20, netCents: 5_000, vatCents: 1_000 },
    ],
    vatRegime: 'standard',
    fileKey: 'finance/documents/6f0c8a52-1d0e-4c3b-9a55-7b2f0c1d2e3f/belge.pdf',
    createdAt: '2026-10-02T09:00:00Z',
    ...over,
  }) as MoneyDocument;
const scope = (doc: MoneyDocument, opts: { country?: string | null; uploaded?: boolean } = {}) =>
  pennylaneDocumentScope({ document: doc, partyCountry: opts.country ?? 'FR', liveFrom: '2026-10-01', uploaded: opts.uploaded ?? false });

describe('Pennylane oran kodu', () => {
  it('standart oranlar Fransız koduna, muaf belge exempt koduna gider', () => {
    expect([2.1, 5.5, 10, 20].map((rate) => pennylaneVatCode(rate as 2.1, 'standard', 'FR'))).toEqual([
      'FR_21',
      'FR_55',
      'FR_100',
      'FR_200',
    ]);
    expect(pennylaneVatCode(20, 'exempt', 'FR')).toBe('exempt');
  });

  it('ters yüklemede AB içi karşı taraf intracom, dışı extracom alır; AB içi %20, ülkesi bilinmeyen ve Fransız karşı taraf kodsuz kalır', () => {
    expect(pennylaneVatCode(5.5, 'reverse_charge', 'DE')).toBe('intracom_55');
    expect(pennylaneVatCode(10, 'reverse_charge', 'IT')).toBe('intracom_100');
    expect(pennylaneVatCode(5.5, 'reverse_charge', 'TR')).toBe('extracom');
    expect(pennylaneVatCode(20, 'reverse_charge', 'DE')).toBeNull();
    expect(pennylaneVatCode(5.5, 'reverse_charge', null)).toBeNull();
    expect(pennylaneVatCode(5.5, 'reverse_charge', 'FR')).toBeNull();
  });
});

describe('belgenin Pennylane kapsamı', () => {
  it('canlıya geçiş gününden sonra girilmiş, ödeyeceğimiz fatura ve fiş yazılır; satır KDV dahil tutar ve oran kodu taşır', () => {
    expect(scope(document())).toEqual({
      kind: 'write',
      lines: [
        { grossCents: 10_550, vatCents: 550, vatCode: 'FR_55' },
        { grossCents: 6_000, vatCents: 1_000, vatCode: 'FR_200' },
      ],
    });
    expect(scope(document({ kind: 'receipt' })).kind).toBe('write');
  });

  it('alacak belgesi, sözleşme ve canlıya geçişten önce girilen belge kapsam dışıdır', () => {
    expect(scope(document({ direction: 'in' }))).toEqual({ kind: 'skip' });
    expect(scope(document({ kind: 'contract' }))).toEqual({ kind: 'skip' });
    // Gün Paris'indir: 30 Eylül 23:30 önce, 1 Ekim 00:30 canlıya geçiş günü.
    expect(scope(document({ createdAt: '2026-09-30T21:30:00Z' }))).toEqual({ kind: 'skip' });
    expect(scope(document({ createdAt: '2026-09-30T22:30:00Z' })).kind).toBe('write');
  });

  it('yüklenmiş belge kapsamdan çıksa da izlenir: Pennylane faturası sahipsiz kalır', () => {
    expect(scope(document({ kind: 'contract' }), { uploaded: true })).toEqual({ kind: 'blocked', reason: 'kind_changed' });
    expect(scope(document({ createdAt: '2026-09-30T08:00:00Z' }), { uploaded: true }).kind).toBe('write');
  });

  it('karşı tarafsız, dosyasız, Pennylane almayan dosyalı, KDV kırılımı tutmayan ve oran kodu bulunmayan belge sebebiyle durur', () => {
    expect(scope(document({ supplierId: null }))).toEqual({ kind: 'blocked', reason: 'no_party' });
    expect(scope(document({ fileKey: null }))).toEqual({ kind: 'blocked', reason: 'no_file' });
    expect(scope(document({ fileKey: 'finance/documents/x/belge.heic' }))).toEqual({ kind: 'blocked', reason: 'file_type' });
    expect(scope(document({ amountCents: 17_000 }))).toEqual({ kind: 'blocked', reason: 'vat' });
    const reverse = document({
      vatRegime: 'reverse_charge',
      amountCents: 6_000,
      vatLines: [{ vatRate: 20, netCents: 6_000, vatCents: 0 }],
    });
    expect(scope(reverse, { country: 'DE' })).toEqual({ kind: 'blocked', reason: 'vat_code' });
    expect(scope(reverse, { country: 'TR' })).toEqual({ kind: 'write', lines: [{ grossCents: 6_000, vatCents: 0, vatCode: 'extracom' }] });
  });

  it('muaf belge kırılımsız, tek exempt satırıyla yazılır', () => {
    expect(scope(document({ vatRegime: 'exempt', vatLines: [], amountCents: 90_000 }))).toEqual({
      kind: 'write',
      lines: [{ grossCents: 90_000, vatCents: 0, vatCode: 'exempt' }],
    });
  });
});

describe('fatura taslağı ve farkı', () => {
  const lines = [{ grossCents: 10_550, vatCents: 550, vatCode: 'FR_55' }];

  it('vadesi olmayan belgenin vadesi belge günüdür; boş numara gönderilmez', () => {
    expect(pennylaneInvoiceDraft(document({ dueOn: null, number: '  ' }), 77, lines)).toEqual({
      supplierId: 77,
      date: '2026-10-02',
      deadline: '2026-10-02',
      invoiceNumber: null,
      externalReference: 'doc:6f0c8a52-1d0e-4c3b-9a55-7b2f0c1d2e3f',
      lines,
    });
  });

  it('fark yalnız değişen alanı taşır; anahtar sırası değişmiş aynı satırlar fark değildir', () => {
    const written: PennylaneInvoiceDraft = pennylaneInvoiceDraft(document(), 77, lines);
    const reordered = { ...written, lines: [{ vatCode: 'FR_55', vatCents: 550, grossCents: 10_550 }] };
    expect(pennylaneInvoicePatch(reordered, written)).toBeNull();
    expect(pennylaneInvoicePatch(written, { ...written, invoiceNumber: 'F-2026-118B' })).toEqual({ invoiceNumber: 'F-2026-118B' });
    const changed = [{ grossCents: 11_605, vatCents: 605, vatCode: 'FR_55' }];
    expect(pennylaneInvoicePatch(written, { ...written, supplierId: 78, lines: changed })).toEqual({ supplierId: 78, lines: changed });
  });
});

describe('ödeme durumu', () => {
  it('banka satırı olmayan hareketle tamamen kapanan belge ödendi işaretini bir kez alır', () => {
    expect(pennylanePaymentStatus({ openAmountCents: 0, allocations: [{ bank: false }], written: null })).toBe('paid');
    expect(pennylanePaymentStatus({ openAmountCents: 0, allocations: [{ bank: false }], written: 'paid' })).toBeNull();
  });

  it('bankadan ödenen, kısmen ödenen ve hiç ödenmeyen belge işaret almaz', () => {
    expect(pennylanePaymentStatus({ openAmountCents: 0, allocations: [{ bank: true }], written: null })).toBeNull();
    expect(pennylanePaymentStatus({ openAmountCents: 0, allocations: [{ bank: false }, { bank: true }], written: null })).toBeNull();
    expect(pennylanePaymentStatus({ openAmountCents: 400, allocations: [{ bank: false }], written: null })).toBeNull();
    expect(pennylanePaymentStatus({ openAmountCents: 16_550, allocations: [], written: null })).toBeNull();
  });

  it('bağı çözülen ya da bankaya geçen belgenin işareti ödenecek durumuna döner', () => {
    expect(pennylanePaymentStatus({ openAmountCents: 16_550, allocations: [], written: 'paid' })).toBe('to_be_paid');
    expect(pennylanePaymentStatus({ openAmountCents: 0, allocations: [{ bank: true }], written: 'paid' })).toBe('to_be_paid');
    expect(pennylanePaymentStatus({ openAmountCents: 16_550, allocations: [], written: 'to_be_paid' })).toBeNull();
  });
});

describe("Pennylane'de aynı firmanın tedarikçisi", () => {
  const suppliers = [
    { id: 1, name: 'Société Anatolie Gıda', vatNumber: 'FR91028564762' },
    { id: 2, name: 'Orange', vatNumber: null },
    { id: 3, name: 'Muller', vatNumber: 'FR11111111111' },
  ];

  it('KDV numarası tutan kayıt adı farklı olsa da aynı firmadır; numara boşluk, nokta ve harf büyüklüğü farkıyla da tutar', () => {
    expect(pennylaneSupplierCandidates(suppliers, { name: 'Anatolie', vatNumber: 'fr 910.285-647 62' }).map((row) => row.id)).toEqual([1]);
  });

  it('KDV numarası yoksa ad aksan, büyüklük ve noktalama farkı gözetmeden karşılaştırılır; numarası çelişen aynı adlı kayıt başka firmadır', () => {
    expect(pennylaneSupplierCandidates(suppliers, { name: '  ORANGE ', vatNumber: null }).map((row) => row.id)).toEqual([2]);
    expect(pennylaneSupplierCandidates(suppliers, { name: 'Societe  Anatolie-Gida', vatNumber: null }).map((row) => row.id)).toEqual([1]);
    expect(pennylaneSupplierCandidates(suppliers, { name: 'Muller', vatNumber: 'FR22222222222' })).toEqual([]);
    expect(pennylaneSupplierCandidates(suppliers, { name: 'Orange', vatNumber: 'FR33333333333' }).map((row) => row.id)).toEqual([2]);
  });
});
