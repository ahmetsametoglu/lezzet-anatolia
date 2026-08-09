import { OrderService, type Db } from '@lezzet/database';
import { canTransition, generateReferenceNo, producesReferenceNo } from '@lezzet/domain-core';
import type { OrderStatus } from '@lezzet/types';
import { notifyStatusEffect, rewardDeliveredEffect, type OrderEffects } from './effects';

/**
 * Durum ilerletme kapısı (07.6) — **uygulama katmanı orkestrasyonu**.
 *
 * Karar motorun (`domain-core/order/status-machine`: izinli geçiş tablosu + referans üretim kuralı),
 * yazım servisin (koşullu RPC: durum + log tek transaction'da). İkisi birbirini bilmez (STACK §4);
 * birleştiren yer burasıdır.
 *
 * İki ayrı "hayır" vardır ve karıştırılmaz:
 * - **`forbidden`** — geçiş kurallara aykırı (ör. `draft → delivered`). Motorun cevabı.
 * - **`stale`** — geçiş kurallara uygun ama sipariş artık o durumda değil; araya biri girdi
 *   (depocu "hazır" derken kurye "yolda" demiş). Veritabanının cevabı.
 *
 * ── TERFİ (aşama 3/3) · WEB'DEN FARKLARI ─────────────────────────────────────
 * Kaynağı `apps/web/lib/order/transition.ts`tı; web kopyası KÖPRÜ olarak duruyor. Zincirin parçası
 * olduğu için taşındı: sipariş onaylama akışı (`place-order.ts`) kapıda/vadeli ödemede siparişi
 * BURADAN `confirmed`'a geçiriyor ve o akışın mobil ucu da aynı geçişi yapacak. İki yüzeyde iki
 * geçiş kapısı, bir gün iki ayrı referans numarası kuralı demekti.
 *
 * Değişen iki şey:
 *   · `db` çağırandan gelir (`serviceDb()` içeride çağrılmıyor) — paketin ortak deseni.
 *   · **İki yan etki PORT oldu** (`effects`): müşteri haberi (`notifyOrderStatus`, modül 14) ve
 *     sipariş puanı (`rewardCompletedOrder`, modül 17). İkisinin de GÖVDESİ 21.21'de bu pakete
 *     terfi etti (`order/notify.ts` · `feedback/points.ts`) ama port KALDI: port kayıt yeri değil
 *     KARAR yeridir — "haber ver" demeyi çağıran yüzey söyler, yoksa fikstür kuran her test mail
 *     göndermeye kalkardı. Gerekçenin tamamı `effects.ts` künyesinde, bu kapı o kararın ikinci
 *     vatandaşı. Yutma davranışı AYNEN korundu: etki patlarsa geçiş geri ALINMAZ, yalnız
 *     `logger.warn` ile iz bırakılır (`runEffect`). Web'de bu `try/catch` ile elle yazılıydı ve
 *     gerekçesi şuydu: "sipariş ilerledi, mail gitmediyse tekrar gönderilir; tersi veriyi bozar."
 */

export type TransitionOutcome =
  | { status: 'ok'; from: OrderStatus; to: OrderStatus; referenceNo: string | null }
  /** Kurallara aykırı geçiş — sebep motorun kodu (`same_status` / `terminal` / `not_allowed`). */
  | { status: 'forbidden'; reason: 'same_status' | 'terminal' | 'not_allowed' }
  /** Sipariş bu arada başkası tarafından ilerletilmiş — çağıran yeni duruma göre yeniden karar verir. */
  | { status: 'stale'; currentStatus: OrderStatus }
  | { status: 'not_found' };

export interface TransitionInput {
  orderId: string;
  to: OrderStatus;
  /** Geçişi yapan personel; sistem olayında (webhook, cron) verilmez. */
  actorId?: string | null;
  /**
   * Yüzeye ait yan etkiler — haber ve puan. Geçilmezse etki ATLANIR ama sessizce değil:
   * `runEffect` süreç başına bir kez uyarır (`effects.ts`).
   */
  effects?: OrderEffects;
}

export async function transitionOrder(db: Db, input: TransitionInput): Promise<TransitionOutcome> {
  const orders = new OrderService(db);

  const order = await orders.getById(input.orderId);
  if (!order) return { status: 'not_found' };

  // 1) Kural: bu geçiş izinli mi? Motor hata FIRLATMAZ, değer döner (03.1).
  const verdict = canTransition(order.status, input.to);
  if (!verdict.allowed) return { status: 'forbidden', reason: verdict.reason };

  // 2) Referans numarası İLK KALICI DURUMDA üretilir (`confirmed`, hızlı satışta `completed`).
  //    Zaten varsa yeniden üretilmez; RPC de mevcut numarayı ezmez (çift emniyet).
  const referenceNo =
    !order.referenceNo && producesReferenceNo(order.status, input.to)
      ? generateReferenceNo({ year: new Date(order.createdAt).getFullYear() })
      : null;

  // 3) Yazım: koşullu (yalnız beklenen kaynaktan) + log satırı aynı transaction'da.
  const result = await orders.transition({
    orderId: order.id,
    from: order.status,
    to: input.to,
    actorId: input.actorId,
    referenceNo,
  });

  if (!result.ok) return { status: 'stale', currentStatus: result.currentStatus };

  // 4) Haber müşteriye — YALNIZ geçiş gerçekten olduysa (14.5). Gönderim hatası geçişi geri almaz:
  //    sipariş ilerledi, mail gitmediyse tekrar gönderilir; tersi (ilerlemeyi iptal etmek) veriyi
  //    bozar. Yakalama portun içinde (`runEffect`) — çağıran kötü davranan bir port geçirse bile
  //    ilerlemiş bir sipariş "olmadı" diye görünmez.
  await notifyStatusEffect(input.effects, order.id, input.to);

  // 5) Sipariş puanı (17.4) — sipariş müşterinin eline GEÇTİĞİNDE. `delivered` ve `completed`
  //    aynı gerçeğin iki yüzü; hangisi önce gelirse o yazar, ikincisi defterin tekillik indeksinde
  //    sessizce düşer. **Ödül asıl işlemi durdurmaz** (DOMAIN §14): puan yazılamazsa sipariş yine
  //    ilerlemiş sayılır — tersi, bir ödül yüzünden teslimatı geri almak olurdu.
  if (input.to === 'delivered' || input.to === 'completed') {
    await rewardDeliveredEffect(input.effects, order.id);
  }

  return { status: 'ok', from: order.status, to: input.to, referenceNo: referenceNo ?? order.referenceNo };
}
