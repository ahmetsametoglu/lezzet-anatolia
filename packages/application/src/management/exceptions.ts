import type { SupabaseClient } from '@supabase/supabase-js';
import { OrderItemService, OrderService } from '@lezzet/database';
import type { DecisionExceptionHead, OrderException } from '@lezzet/types';
import { openTicket } from '../ticket/staff-write';
import { adviseShortfalls, listPreparationQueue } from '../warehouse/preparation';
import { shortfallQuestion } from '../warehouse/shortfall-question';

/*
  Y2 · SİPARİŞ İSTİSNALARI (21.12) — eksik toplamalı hazırlık siparişleri + "müşteriye sor" kararı.

  ── İSTİSNA TÜRETİLİR, SAKLANMAZ ────────────────────────────────────────────
  Kaynak hazırlık kuyruğunun kendisi (`listPreparationQueue`): raftaki gerçeğin karşılayamadığı
  kalem (`shortfallQty > 0`) ve henüz müşteriye sorulmamış olan (`awaitingAnswer` değil). Ayrı bir
  "istisna" tablosu yok ve bilerek: durum makinesine hâl eklememe kararının (10.3 künyesi) aynısı —
  soru sorulunca kalem kuyruktan kendiliğinden düşer, ikinci bir defter tutulmaz.

  ── ÖNERİ MOTORUN, PARA BU EKRANDA GÖRÜNÜR ──────────────────────────────────
  `adviseShortfalls` oran/tutar eşikleriyle önerir (ayardan); eksik tutar (`missingValueCents`)
  admin'e gösterilir — doc 04: para D1'de değil Y2'de görünür. "Kalanı gönder" için ayrıca bir
  YAZIM YOKTUR: kısmi karşılamanın parası teslim tarafında netleşir (07.8) ve bugün modelde o
  kararı taşıyan bir kayıt yok — olmayan makine kurulmaz, öneri bilgi olarak sunulur.
*/

/** Verilen tesislerin karar bekleyen istisnaları — sipariş başına gruplu, en eski önce. */
export async function listOrderExceptions(
  db: SupabaseClient,
  input: { warehouseIds: readonly string[] },
): Promise<OrderException[]> {
  if (input.warehouseIds.length === 0) return [];

  const queues = await Promise.all(
    input.warehouseIds.map((warehouseId) => listPreparationQueue(db, { warehouseId })),
  );
  const candidates = queues
    .flat()
    .map((order) => ({
      order,
      shortLines: order.lines.filter((line) => line.shortfallQty > 0 && !line.awaitingAnswer),
    }))
    .filter((entry) => entry.shortLines.length > 0);
  if (candidates.length === 0) return [];

  // Öneri motoru KALEM varlığını ister (fiyat eşiği oradan) — kuyruk satırı taşımıyor, tek turda okunur.
  const orderIds = candidates.map((entry) => entry.order.orderId);
  const [items, orders] = await Promise.all([
    new OrderItemService(db).listByOrders(orderIds),
    new OrderService(db).listByIds(orderIds),
  ]);
  const itemOf = new Map(items.map((item) => [item.id, item]));
  const totalOf = new Map(orders.map((order) => [order.id, order.orderedTotalCents]));

  return Promise.all(
    candidates.map(async ({ order, shortLines }) => {
      const rows = shortLines.flatMap((line) => {
        const item = itemOf.get(line.itemId);
        return item ? [{ line, item }] : [];
      });
      const advices = await adviseShortfalls(
        db,
        rows.map(({ item, line }) => ({ item, pickedQty: item.qty - line.shortfallQty })),
      );
      const adviceOf = new Map(advices.map((advice) => [advice.itemId, advice.suggestion]));

      return {
        orderId: order.orderId,
        referenceNo: order.referenceNo,
        customerName: order.customerName,
        status: order.status,
        totalCents: totalOf.get(order.orderId) ?? 0,
        lines: rows.map(({ line, item }) => {
          const missingQty = line.shortfallQty;
          const suggestion = adviceOf.get(item.id);
          return {
            orderItemId: item.id,
            title: line.variantLabel ? `${line.productName} · ${line.variantLabel}` : line.productName,
            orderedQty: item.qty,
            pickedQty: item.qty - missingQty,
            missingQty,
            unitPriceCents: item.unitPriceCents,
            missingValueCents: item.unitPriceCents * missingQty,
            advice: {
              action: suggestion?.action ?? 'ask_customer',
              // Sebep motorun anahtar kelimesidir (`line_fully_missing` …); cümleyi yüzey kurar.
              reason: suggestion?.reason ?? 'unknown',
            },
          };
        }),
      };
    }),
  );
}

export type AskShortfallOutcome =
  | { status: 'ok'; ticketId: string }
  | { status: 'not_found' }
  | { status: 'no_shortfall' }
  | { status: 'already_asked'; ticketId: string };

/**
 * "Müşteriye sorulsun" — YÖNETİM yolu (web hazırlık ekranındaki `askCustomerAction` ile aynı iki
 * kapı: `shortfallQuestion` soruyu kurar, `openTicket` talebi açar; müşteriye otomatik mesaj
 * GİTMEZ, soru operasyon kuyruğuna düşer).
 *
 * Depo kapsamı SİPARİŞİN KENDİ deposudur: admin depo-üstüdür (OrderListFilters künyesi), depocu
 * yolundaki "çalıştığın depo" sorusu burada sorulmaz — motorun kapsam kapısı yine de koşar,
 * atlanmaz.
 */
export async function askShortfall(
  db: SupabaseClient,
  input: { orderItemId: string; authorId: string },
): Promise<AskShortfallOutcome> {
  const item = await new OrderItemService(db).getById(input.orderItemId);
  if (!item) return { status: 'not_found' };
  const order = await new OrderService(db).getById(item.orderId);
  if (!order) return { status: 'not_found' };

  const draft = await shortfallQuestion(db, { orderItemId: input.orderItemId, warehouseId: order.warehouseId });
  if (draft.status === 'not_found' || draft.status === 'out_of_scope') return { status: 'not_found' };
  if (draft.status === 'no_shortfall') return { status: 'no_shortfall' };
  if (draft.status === 'already_asked') return { status: 'already_asked', ticketId: draft.ticketId };

  const result = await openTicket(db, {
    customerId: draft.customerId,
    // `admin`: ilk sözü işletme söylüyor. `question`: bir arıza bildirimi değil, bir soru.
    source: 'admin',
    type: 'question',
    body: draft.body,
    subject: draft.subject,
    orderId: draft.orderId,
    // Kalem bağı ŞART: çift talep koruması (`findOpenByOrderItem`) tam bu alandan okuyor.
    orderItemIds: [draft.orderItemId],
    authorId: input.authorId,
  });
  if (!result.ok) return { status: 'not_found' };
  return { status: 'ok', ticketId: result.data.id };
}

/**
 * Hub'ın karar kutusu bu okumayı SAYAR — kutu ile ekran aynı motoru okur, ayrışamaz.
 *
 * Künye EN ÜSTTEKİ kalemi de taşır (21.164): kart "1 kalem eksik" derken hangi üründen söz
 * ettiğini söylemiyordu ve yönetici kararı ürünü bilmeden veremiyordu (tasarım v3:2104 ürünü
 * yazıyor). Kalemsiz bir istisna künye ÜRETMEZ — sayı ile künyenin ayrışması, kartın var olmayan
 * bir kalemi göstermesi demekti.
 */
export async function countOrderExceptions(
  db: SupabaseClient,
  input: { warehouseIds: readonly string[] },
): Promise<{ count: number; head: DecisionExceptionHead | null }> {
  const exceptions = await listOrderExceptions(db, input);
  const head = exceptions[0] ?? null;
  const line = head?.lines[0] ?? null;
  return {
    count: exceptions.length,
    head:
      head && line
        ? {
            orderId: head.orderId,
            referenceNo: head.referenceNo,
            shortLineCount: head.lines.length,
            lineTitle: line.title,
            missingQty: line.missingQty,
          }
        : null,
  };
}
