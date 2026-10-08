import type { RegisterLine, RegisterPayment, RegisterTicketSnapshot } from '@lezzet/types';
import { describe, expect, it } from 'vitest';
import { planRegister, type RegisterItem, type RegisterMovement, type RegisterOrder, type RegisterPlanInput } from './plan';

/** 3 × 10,00 lokum (%5,5) + 1 × 2,00 ambalaj (%20) + 4,90 kargo = 36,90; ödeme alındı, hazırlık başlamadı. */
const order = (over: Partial<RegisterOrder> = {}): RegisterOrder => ({
  status: 'confirmed',
  channel: 'b2c',
  isGiftOrder: false,
  shippingFeeCents: 490,
  orderedTotalCents: 3690,
  pricesIncludeVat: true,
  ...over,
});

const lokum = (over: Partial<RegisterItem> = {}): RegisterItem => ({
  id: 'lokum',
  qty: 3,
  fulfilledQty: 0,
  goodwillQty: 0,
  unitPriceCents: 1000,
  lineDiscountAmountCents: 0,
  vatRate: 5.5,
  ...over,
});

const ambalaj = (over: Partial<RegisterItem> = {}): RegisterItem => ({
  ...lokum(),
  id: 'ambalaj',
  qty: 1,
  unitPriceCents: 200,
  vatRate: 20,
  ...over,
});

const move = (id: string, signedAmountCents: number, method: RegisterMovement['method'] = 'online', at = '10:00'): RegisterMovement => ({
  id,
  signedAmountCents,
  method,
  createdAt: `2026-10-01T${at}:00Z`,
});

const item = (orderItemId: string, qty: number, amountCents: number, vatRate: number): RegisterLine => ({
  kind: 'item',
  orderItemId,
  qty,
  amountCents,
  vatRate,
});
const shipping = (qty: number, amountCents: number, vatRate: number): RegisterLine => ({
  kind: 'shipping',
  orderItemId: null,
  qty,
  amountCents,
  vatRate,
});
const paid = (movementId: string, amountCents: number, method: RegisterPayment['method'] = 'online'): RegisterPayment => ({
  method,
  amountCents,
  movementId,
});

/** Test 1'in fişi: sipariş edilen kalemler; kargo 30,00 : 2,00 ağırlıkla 4,60 + 0,30. */
const ORDERED_LINES = [item('lokum', 3, 3000, 5.5), item('ambalaj', 1, 200, 20), shipping(1, 460, 5.5), shipping(1, 30, 20)];
const firstTicket = (payments: RegisterPayment[] = [paid('h1', 3690)]): RegisterTicketSnapshot => ({
  seq: 1,
  lines: ORDERED_LINES,
  payments,
});

const plan = (over: Partial<RegisterPlanInput> = {}) =>
  planRegister({ order: order(), items: [lokum(), ambalaj()], movements: [move('h1', 3690)], tickets: [], ...over });

describe('kasa planı — fiş', () => {
  it('hazırlanmamış siparişin ilk fişi sipariş edilen kalemlerle açılır, kargo oranlara bölünür', () => {
    // Kargo tek orana yazılsaydı %5,5'lik malın taşıma payı %20'den vergilenirdi.
    expect(plan()).toEqual({
      status: 'plan',
      ops: [{ op: 'open_ticket', seq: 1, lines: ORDERED_LINES, payments: [paid('h1', 3690)] }],
      blocked: null,
      dueMismatch: false,
    });
  });

  it('eksik çıkan kalemin iadesi eksi kalemli fiştir; kargonun oran payı da düzelir', () => {
    // İade yalnız ödeme satırı olsaydı kasa gitmeyen malı satılmış gösterirdi.
    const r = plan({
      order: order({ status: 'out_for_delivery' }),
      items: [lokum({ fulfilledQty: 2 }), ambalaj({ fulfilledQty: 1 })],
      movements: [move('h1', 3690), move('h2', -1000, 'online', '11:00')],
      tickets: [firstTicket()],
    });
    expect(r).toMatchObject({
      ops: [
        {
          op: 'open_ticket',
          seq: 2,
          lines: [item('lokum', -1, -1000, 5.5), shipping(-1, -14, 5.5), shipping(1, 14, 20)],
          payments: [paid('h2', -1000)],
        },
      ],
      blocked: null,
      dueMismatch: false,
    });
  });

  it('kutu kutu hazırlıkta ve hazır siparişte kasaya düzeltme yazılmaz; eksik kalem sipariş depodan çıkınca düşülür', () => {
    // İlk kutu mühürlenince öteki kalem toplanmamış görünür; o an düzeltme yazılsaydı kasaya sahte iade ve yeniden satış giderdi.
    const firstBoxOnly = [lokum({ fulfilledQty: 3 }), ambalaj({ fulfilledQty: 0 })];
    for (const status of ['preparing', 'ready'] as const) {
      expect(plan({ order: order({ status }), items: firstBoxOnly, tickets: [firstTicket()] })).toMatchObject({ status: 'plan', ops: [] });
    }

    const left = plan({ order: order({ status: 'out_for_delivery' }), items: firstBoxOnly, tickets: [firstTicket()] });

    expect(left).toMatchObject({
      ops: [{ op: 'open_ticket', seq: 2, lines: expect.arrayContaining([item('ambalaj', -1, -200, 20)]), payments: [] }],
    });
  });

  it('iptal edilen siparişin ilk fişi sipariş edilenle açılır, iade fişi hepsini geri alır', () => {
    // İptalde ücretlenen kalem yoktur; ilk fiş ondan kurulsaydı alınan para kasaya hiç yazılmazdı.
    const r = plan({
      order: order({ status: 'cancelled' }),
      movements: [move('h1', 3690), move('h2', -3690, 'online', '11:00')],
    });
    expect(r).toMatchObject({
      ops: [
        { op: 'open_ticket', seq: 1, lines: ORDERED_LINES, payments: [paid('h1', 3690)] },
        {
          op: 'open_ticket',
          seq: 2,
          lines: [item('lokum', -3, -3000, 5.5), item('ambalaj', -1, -200, 20), shipping(-1, -460, 5.5), shipping(-1, -30, 20)],
          payments: [paid('h2', -3690)],
        },
      ],
    });
  });

  it('müşteride kalan adedin iadesi eksi kalemli fiştir', () => {
    // Müşteride kalan adet düşülmeseydi iade yalnız ödeme satırı olur, mal kasada satılmış kalırdı.
    const r = plan({
      order: order({ status: 'delivered', shippingFeeCents: 0, orderedTotalCents: 3000 }),
      items: [lokum({ fulfilledQty: 3, goodwillQty: 1 })],
      movements: [move('h1', 3000, 'cash'), move('h2', -1000, 'cash', '11:00')],
      tickets: [{ seq: 1, lines: [item('lokum', 3, 3000, 5.5)], payments: [paid('h1', 3000, 'cash')] }],
    });
    expect(r).toMatchObject({
      ops: [{ op: 'open_ticket', seq: 2, lines: [item('lokum', -1, -1000, 5.5)], payments: [paid('h2', -1000, 'cash')] }],
    });
  });

  it('para doğurmayan kalem farkı ödemesiz fiştir', () => {
    // Kapıda 20,00 alınmış 30,00'lık siparişte 10,00'luk kalem iade edilince borç kalmaz, hareket doğmaz; fiş açılmasaydı kasa
    // gitmeyen malı satılmış gösterirdi.
    const r = plan({
      order: order({ status: 'delivered', shippingFeeCents: 0, orderedTotalCents: 3000 }),
      items: [lokum({ fulfilledQty: 2 })],
      movements: [move('h1', 2000, 'cash')],
      tickets: [{ seq: 1, lines: [item('lokum', 3, 3000, 5.5)], payments: [paid('h1', 2000, 'cash')] }],
    });
    expect(r).toMatchObject({ ops: [{ op: 'open_ticket', seq: 2, lines: [item('lokum', -1, -1000, 5.5)], payments: [] }] });
  });

  it('fiyatı fişe yazıldıktan sonra değişen kalem geri alınıp yeniden yazılır', () => {
    // Fark tek kalem olsaydı sıfır adetli bir tutar kalemi çıkardı; kasa onu yazamaz.
    const r = plan({
      order: order({ status: 'delivered', shippingFeeCents: 0, orderedTotalCents: 3000 }),
      items: [lokum({ fulfilledQty: 3, unitPriceCents: 900 })],
      movements: [move('h1', 3000, 'cash'), move('h2', -300, 'cash', '11:00')],
      tickets: [{ seq: 1, lines: [item('lokum', 3, 3000, 5.5)], payments: [paid('h1', 3000, 'cash')] }],
    });
    expect(r).toMatchObject({
      ops: [
        {
          op: 'open_ticket',
          seq: 2,
          lines: [item('lokum', -3, -3000, 5.5), item('lokum', 3, 2700, 5.5)],
          payments: [paid('h2', -300, 'cash')],
        },
      ],
    });
  });
});

describe('kasa planı — ödeme satırı', () => {
  it('kalem değişmeden gelen para son fişe ödeme satırı olur', () => {
    // Kapıda eksik ödenen siparişin kalanı yeni fiş açsaydı aynı mal ikinci kez satılmış görünürdü.
    const r = plan({
      order: order({ status: 'delivered', shippingFeeCents: 0, orderedTotalCents: 3200 }),
      items: [lokum({ fulfilledQty: 3 }), ambalaj({ fulfilledQty: 1 })],
      movements: [move('h1', 2000, 'cash'), move('h2', 1200, 'cash', '12:00')],
      tickets: [{ seq: 1, lines: [item('lokum', 3, 3000, 5.5), item('ambalaj', 1, 200, 20)], payments: [paid('h1', 2000, 'cash')] }],
    });
    expect(r).toMatchObject({ ops: [{ op: 'add_payments', seq: 1, payments: [paid('h2', 1200, 'cash')] }] });
  });

  it('hazırlık kesinleşmeden gelen ikinci para ödeme satırıdır, kalemleri geri almaz', () => {
    // Hazırlıktan önce giden adet 0'dır; ondan okunsaydı kasa sipariş edilen malın tamamını iade edilmiş gösterirdi.
    const r = plan({ movements: [move('h1', 3690), move('h2', 100, 'online', '11:00')], tickets: [firstTicket()] });
    expect(r).toMatchObject({ ops: [{ op: 'add_payments', seq: 1, payments: [paid('h2', 100)] }] });
  });

  it('yazılmış her şey aynadaysa plan boştur', () => {
    // Tekrar eden tur boş dönmeseydi aynı tahsilat kasaya ikinci kez yazılırdı.
    expect(plan({ tickets: [firstTicket()] })).toMatchObject({ ops: [], blocked: null });
  });

  it('hareketi silinip eşdeğeri gelen ödeme satırı yeni harekete bağlanır, kasaya yazılmaz', () => {
    // Ekstre birleştirmesi elle yazılan hareketi silip yerine ekstre satırını koyar; bağ kurulmasaydı para iki kez yazılırdı.
    const r = plan({ movements: [move('yeni', 3690)], tickets: [firstTicket([paid('eski', 3690)])] });
    expect(r).toMatchObject({ ops: [{ op: 'relink_payment', fromMovementId: 'eski', toMovementId: 'yeni' }] });
  });

  it('eşdeğeri olmayan silinmiş hareket ters satırla bir kez geri alınır', () => {
    // Ters satır olmasaydı silinen tahsilat kasada kalırdı; net sıfırlanınca bir daha çevrilmez.
    const reversal = paid('silinen', -3690);
    expect(plan({ movements: [], tickets: [firstTicket([paid('silinen', 3690)])] })).toMatchObject({
      ops: [{ op: 'add_payments', seq: 1, payments: [reversal] }],
    });
    expect(plan({ movements: [], tickets: [firstTicket([paid('silinen', 3690), reversal])] })).toMatchObject({ ops: [] });
  });

  it('geri alınıp aynı siparişe yeniden bağlanan tahsilat kasaya yeniden yazılır', () => {
    // Banka eşleşmesi geri alınıp yeniden yapılınca satır ters çevrilmiş kalsaydı kasa ödenmiş satışı ödenmemiş gösterirdi.
    const r = plan({ movements: [move('h1', 3690)], tickets: [firstTicket([paid('h1', 3690), paid('h1', -3690)])] });
    expect(r).toMatchObject({ ops: [{ op: 'add_payments', seq: 1, payments: [paid('h1', 3690)] }] });
  });

  it('tutarı ya da yöntemi değişen hareketin farkı aynı harekete yeni satırdır', () => {
    // Kasadaki satır değişmez; fark yazılmasaydı kasa eski tutarı ya da eski yöntemi gösterirdi.
    expect(plan({ movements: [move('h1', 3790)], tickets: [firstTicket()] })).toMatchObject({
      ops: [{ op: 'add_payments', seq: 1, payments: [paid('h1', 100)] }],
    });
    expect(plan({ movements: [move('h1', 3690, 'cash')], tickets: [firstTicket()] })).toMatchObject({
      ops: [{ op: 'add_payments', seq: 1, payments: [paid('h1', -3690), paid('h1', 3690, 'cash')] }],
    });
  });
});

describe('kasa planı — kapsam ve durma', () => {
  it('B2B ve parası olmayan hediye sipariş kasaya girmez', () => {
    // B2B fişe dönüşseydi satış Pennylane'e hem kasadan hem faturadan girerdi.
    expect(plan({ order: order({ channel: 'b2b' }) })).toEqual({ status: 'skip', reason: 'b2b' });
    expect(plan({ order: order({ isGiftOrder: true }), movements: [] })).toEqual({ status: 'skip', reason: 'gift_order' });
  });

  it('hediye siparişe yazılmış para planı durdurur', () => {
    // Hediye ödemesiz kapanır; parası sessizce atlansaydı kasaya giren para kayıt dışı kalırdı.
    expect(plan({ order: order({ isGiftOrder: true }) })).toMatchObject({
      ops: [],
      blocked: { reason: 'gift_order_money', movementId: 'h1' },
    });
  });

  it('yöntemi bilinmeyen hareket planı durdurur, sonraki hareket sırasını bekler', () => {
    // Ödeme kodu tahminle yazılsaydı nakit kartta görünür, kasa sayımı tutmazdı.
    const r = plan({ movements: [move('h1', 3690, null), move('h2', 100, 'cash', '11:00')] });
    expect(r).toMatchObject({ ops: [], blocked: { reason: 'unknown_method', movementId: 'h1' } });
  });

  it('fişi olmayan siparişin ilk hareketi iadeyse yazılmaz', () => {
    // Satışı olmayan iade kasaya karşılıksız eksi bakiye yazardı.
    expect(plan({ movements: [move('h1', -1000)] })).toMatchObject({
      ops: [],
      blocked: { reason: 'refund_before_sale', movementId: 'h1' },
    });
  });

  it('hedef kalemler türetilen borcu tutmuyorsa işaretlenir', () => {
    // İşaret olmasaydı kasaya borçtan farklı bir tutar sessizce yazılırdı.
    expect(plan({ order: order({ orderedTotalCents: 3500 }) })).toMatchObject({ dueMismatch: true });
  });
});
