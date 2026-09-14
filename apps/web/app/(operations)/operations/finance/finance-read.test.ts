import type { AccountLedgerRow } from '@lezzet/types';
import { describe, expect, it } from 'vitest';
import type { MatchTarget } from '@/lib/bank/reconcile';
import { groupByDay, toMovementRows, type MovementReadContext } from './finance-read';

/**
 * Defter satırının görünümü (12.21 · sağ panel kalktı): BAĞ "Karşılığı" sütununa (`link`), İPUCU
 * açıklamanın altına (`ref`), ekstre satırının önerisi hapa (`suggestion*`) gider. Fikstür yalnız
 * indirgemenin okuduğu alanları taşır — okumadığı alanlar (`createdAt`, `accountId`, parmak izi…) yok,
 * bu yüzden tip `unknown` üstünden verilir.
 */
const base = {
  id: 'mov-1',
  ledgerAccountId: 'acc-1',
  valueDate: '2026-09-10',
  type: 'expense',
  direction: 'out',
  explained: true,
  nature: null,
  counterpartyId: null,
  tags: [],
  signedAmountCents: -36000,
  amountCents: 36000,
  description: 'PRLV CABINET COMPTABLE MULLER',
  source: 'manual',
  reconciled: false,
  meta: {},
  orderId: null,
  stockIntakeId: null,
  supplierId: null,
  counterAccountId: null,
} as unknown as AccountLedgerRow;

const context = (over: Partial<MovementReadContext> = {}): MovementReadContext => ({
  accountNames: new Map([
    ['acc-1', 'Crédit Mutuel'],
    ['acc-2', 'Kasa'],
  ]),
  orderRefs: new Map([['ord-1', 'LZA-26-7K4M2P']]),
  partyNames: new Map([['sup-1', 'Anadolu Gıda']]),
  natureLabels: new Map(),
  documentsOf: new Map(),
  ...over,
});

const read = (over: Partial<AccountLedgerRow>, ctx = context()) => toMovementRows([{ ...base, ...over }], ctx)[0];

describe('toMovementRows — bağ ve ipucu', () => {
  it('bağ "Karşılığı" sütununa gider, en somut olanı okunur; altta ipucu kalmaz', () => {
    expect(read({ type: 'order_payment', orderId: 'ord-1' })).toMatchObject({ link: { text: 'sipariş LZA-26-7K4M2P', tone: 'olive' }, ref: null });
    expect(read({ type: 'purchase', stockIntakeId: 'int-1', supplierId: 'sup-1' })).toMatchObject({ link: { text: 'mal kabule bağlı', tone: 'olive' } });
    expect(read({ type: 'purchase', supplierId: 'sup-1' })).toMatchObject({ link: { text: 'tedarikçi: Anadolu Gıda', tone: 'olive' } });
    expect(read({ type: 'transfer', counterAccountId: 'acc-2' })).toMatchObject({ link: { text: 'karşı hesap: Kasa', tone: 'neutral' } });
  });

  it('ipucu kampanya ya da izah sorusudur; soru tür alan satıra türü, almayana eksik bağı söyler', () => {
    expect(read({ meta: { campaign: 'Ramazan' } })).toMatchObject({ ref: 'kampanya: Ramazan', refTone: 'olive', link: null });
    expect(read({ explained: false })).toMatchObject({ ref: 'izah bekliyor — türünü seçin ya da belgeye bağlayın', refTone: 'amber' });
    expect(read({ type: 'order_payment', explained: false })).toMatchObject({ ref: 'izah bekliyor — siparişe bağlı değil', refTone: 'amber' });
  });

  it('eşleşme bekleyen ekstre satırının sorusu alta yazılmaz — önerisiyle hapa gider', () => {
    const target: MatchTarget = { kind: 'document', documentId: 'doc-1' };
    const suggestions = new Map([['mov-1', { strength: 'strong' as const, title: 'FA-2026-0912 · Cabinet Muller', target }]]);
    expect(read({ source: 'bank_import', explained: false }, context({ suggestions }))).toMatchObject({
      ref: null,
      suggestion: 'strong',
      suggestionTitle: 'FA-2026-0912 · Cabinet Muller',
      suggestionTarget: target,
    });
    expect(read({ source: 'bank_import', explained: false })).toMatchObject({ suggestion: null, suggestionTitle: null, suggestionTarget: null });
  });

  it('geri alma yalnız ekstre satırının cevabındadır', () => {
    expect(read({ source: 'bank_import', reconciled: true })).toMatchObject({ canUnmatch: true });
    expect(read({ source: 'bank_import', counterpartyId: 'cp-1' })).toMatchObject({ canUnmatch: true });
    expect(read({ source: 'manual', reconciled: true })).toMatchObject({ canUnmatch: false });
  });
});

describe('groupByDay — defterin gün başlıkları (12.22)', () => {
  const at = (id: string, valueDate: string) => ({ id, valueDate });

  it('ardışık aynı gün tek grup, sıra korunur', () => {
    const groups = groupByDay([at('a', '2026-09-14'), at('b', '2026-09-14'), at('c', '2026-09-11')]);
    expect(groups.map((group) => [group.day, group.rows.map((row) => row.id)])).toEqual([
      ['2026-09-14', ['a', 'b']],
      ['2026-09-11', ['c']],
    ]);
  });

  it('eklenen sayfanın ilk günü öncekinin son günüyse aynı gruba katılır', () => {
    const firstPage = [at('a', '2026-09-14'), at('b', '2026-09-11')];
    const nextPage = [at('c', '2026-09-11'), at('d', '2026-09-10')];
    expect(groupByDay([...firstPage, ...nextPage]).map((group) => group.rows.length)).toEqual([1, 2, 1]);
  });

  it('boş defter boş liste', () => {
    expect(groupByDay([])).toEqual([]);
  });
});
