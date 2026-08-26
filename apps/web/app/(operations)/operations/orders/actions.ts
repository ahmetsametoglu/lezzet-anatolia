'use server';

import { revalidatePath } from 'next/cache';
import { OrderService, serviceDb } from '@lezzet/database';
import { derivePaymentStatusForOrder } from '@lezzet/domain-core';
import {
  DEFAULT_PAGE_SIZE,
  ORDER_STATUS_LABELS,
  type FulfillmentAdjustment,
  type KeysetCursor,
  type OrderStatus,
} from '@lezzet/types';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { adjustFulfillment, cancelOrder, retryRefund, type RefundBlockReason } from '@/lib/order/refund';
import { transitionOrder } from '@/lib/order/transition';
import { readOrderDetail } from './[id]/order-detail-read';
import { readOrdersPage } from './orders-page-read';
import { ORDERS_PATH, parseOrdersUrl } from './orders-url';
import type { OrderPeek, OrdersData } from './orders-types';

// Sipariş ekranı server action'ları (09.7) — 'use server' + requireAdmin ilk + servise devret +
// `{ data, error }` DÖNER (throw yok) + revalidatePath.

/**
 * Sonsuz kaydırmanın sonraki sayfası. Süzgeçler URL'den okunur (ekranın adresi neyse o) — client'ın
 * gönderdiği bir süzgeç kopyası olsaydı ikisi ayrışabilirdi.
 */
export async function loadMoreOrdersAction(search: string, cursor: KeysetCursor): Promise<ActionResult<OrdersData>> {
  try {
    await requireAdmin();
    const urlState = parseOrdersUrl(Object.fromEntries(new URLSearchParams(search)));
    const data = await readOrdersPage(serviceDb(), urlState, { cursor, limit: DEFAULT_PAGE_SIZE });
    return { data, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Hızlı bakışın derinliği — satır açıldığında çekilir.
 *
 * Liste sorgusu bunları TAŞIMAZ ve taşımamalı: elli satırın kalemlerini, adreslerini ve
 * telefonlarını peşinen çekmek, biri açılsın diye ellisinin bedelini ödemektir. Okuma DETAY
 * SAYFASININ okumasıdır (`readOrderDetail`) — pencere için ikinci bir okuma yazılsaydı, aynı
 * siparişi iki farklı gerçekle gösteren iki yol açılırdı.
 */
export async function loadOrderPeekAction(orderId: string): Promise<ActionResult<OrderPeek>> {
  try {
    await requireAdmin();
    const detail = await readOrderDetail(serviceDb(), orderId);
    if (!detail) throw new Error('Sipariş bulunamadı — liste tazelenmeli.');
    const { lines, payment, delivery, customer, links, fulfillmentSettled } = detail;
    return { data: { lines, payment, delivery, customer, links, fulfillmentSettled }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Karar penceresinin ÖNİZLEMESİ — "bunu onaylarsam ne olur?".
 *
 * Sayı ekranda HESAPLANMAZ: aynı motor fonksiyonu (`derivePaymentStatusForOrder`), yalnız kalem
 * adetleri operatörün önerdiği hâlle değiştirilerek çalıştırılır. Client kendi hesabını yapsaydı
 * pencerede yazan tutar ile kaydedildikten sonra oluşan tutar bir gün ayrışırdı — hem de tam para
 * konuşurken.
 */
export async function previewFulfillmentAction(
  orderId: string,
  lines: ReadonlyArray<{ orderItemId: string; fulfilledQty: number }>,
): Promise<ActionResult<{ refundDueCents: number; amountToCollectCents: number; fulfilledAmountCents: number }>> {
  try {
    await requireAdmin();
    const found = await new OrderService(serviceDb()).getWithItems(orderId);
    if (!found) throw new Error('Sipariş bulunamadı.');

    const proposed = new Map(lines.map((l) => [l.orderItemId, l.fulfilledQty]));
    const derivation = derivePaymentStatusForOrder(
      found.order,
      found.items.map((item) => ({ ...item, fulfilledQty: proposed.get(item.id) ?? item.fulfilledQty })),
      { collectedCents: found.order.amountCollectedCents, refundedCents: found.order.amountRefundedCents },
    );

    return {
      data: {
        refundDueCents: derivation.refundDueCents,
        amountToCollectCents: derivation.amountToCollectCents,
        fulfilledAmountCents: derivation.fulfilledAmountCents,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * **Kısmi karşılama / iade** — karar penceresinin yazma yolu (07.8).
 *
 * Burada iş kuralı YOK: uygulama kapısı `lib/order/refund` zaten üç katmanı sırayla birleştiriyor
 * (mal → türetim → para hareketi). Action'ın işi guard, çeviri ve tazeleme.
 */
export async function adjustFulfillmentAction(
  orderId: string,
  lines: readonly FulfillmentAdjustment[],
  /**
   * `refundAmount` YALNIZ jest iadesinde dolu gelir: mal müşteride kaldığı için miktar düşmez,
   * motor borcu türetemez ve tutarı operatör söyler (DOMAIN §8). Diğer her durumda `null` — tutarı
   * ekranın söylemesi, türetimi ekrandan ezmek olurdu.
   */
  opts: { refundAccountId?: string | null; refundAmountCents?: number | null } = {},
): Promise<ActionResult<{ refundedAmountCents: number; amountToCollectCents: number; refundNotice: string | null; refundBlocked: RefundBlockReason | null }>> {
  try {
    const actor = await requireAdmin();
    const result = await adjustFulfillment(orderId, lines, { actorId: actor.profileId, ...opts });

    if (result.status === 'not_found') throw new Error('Sipariş bulunamadı.');
    if (result.status === 'stale') {
      throw new Error(
        `Sipariş bu sırada "${ORDER_STATUS_LABELS[result.currentStatus]}" durumuna geçmiş — ekranı tazeleyin.`,
      );
    }

    revalidatePath(`${ORDERS_PATH}/${orderId}`);
    revalidatePath(ORDERS_PATH);
    return {
      data: {
        refundedAmountCents: result.refundedAmountCents,
        amountToCollectCents: result.amountToCollectCents,
        refundNotice: refundNotice(result.refundBlocked),
        refundBlocked: result.refundBlocked ?? null,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** **İptal** (07.9) — ayrılan mal serbest kalır, tahsil edilmişse tamamı iadeye devrolur. */
export async function cancelOrderAction(
  orderId: string,
  opts: { refundAccountId?: string | null } = {},
): Promise<ActionResult<{ refundedAmountCents: number; refundNotice: string | null; refundBlocked: RefundBlockReason | null }>> {
  try {
    const actor = await requireAdmin();
    // Sebep `staff` (07.14): iptali operasyon istedi. Müşterinin kendi iptali ayrı bir sebeptir ve
    // ayrı bir kapıdan gelir — ikisini tek kovaya koymak "neden iptal oldu" sorusunu geri alırdı.
    const result = await cancelOrder(orderId, { actorId: actor.profileId, reason: 'staff', ...opts });

    if (result.status === 'not_found') throw new Error('Sipariş bulunamadı.');
    if (result.status === 'forbidden') {
      throw new Error(
        result.reason === 'terminal'
          ? 'Bu sipariş kapandı, iptal edilemez.'
          : 'Bu sipariş iptal edilemez — teslim edilmişse iade yoluna girer.',
      );
    }
    if (result.status === 'stale') {
      throw new Error(
        `Sipariş bu sırada "${ORDER_STATUS_LABELS[result.currentStatus]}" durumuna geçmiş — ekranı tazeleyin.`,
      );
    }

    revalidatePath(`${ORDERS_PATH}/${orderId}`);
    revalidatePath(ORDERS_PATH);
    return {
      data: {
        refundedAmountCents: result.refundedAmountCents,
        refundNotice: refundNotice(result.refundBlocked),
        refundBlocked: result.refundBlocked ?? null,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * **İadeyi yeniden dene** (07.11) — sağlayıcı çağrısı düştüğünde tek çıkış yolu.
 *
 * Düzeltme/iptal zaten yazıldığı için onları tekrar çalıştırmak yanlış olurdu (adetler ikinci kez
 * uygulanır). Bu action yalnız para ayağını tekrar dener; borcu da yeniden türetir, saklamaz.
 */
export async function retryRefundAction(
  orderId: string,
  opts: { refundAccountId?: string | null } = {},
): Promise<ActionResult<{ refundedAmountCents: number; refundNotice: string | null; refundBlocked: RefundBlockReason | null }>> {
  try {
    await requireAdmin();
    const result = await retryRefund(orderId, opts);
    if (result.status === 'not_found') throw new Error('Sipariş bulunamadı.');

    revalidatePath(`${ORDERS_PATH}/${orderId}`);
    revalidatePath(ORDERS_PATH);
    return {
      data: {
        refundedAmountCents: result.refundedAmountCents,
        refundNotice: refundNotice(result.refundBlocked),
        refundBlocked: result.refundBlocked ?? null,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * İade YAZILAMADIYSA operatöre söylenecek cümle (07.11).
 *
 * Bu bir hata değil — düzeltme/iptal geçerli, kaydedildi; eksik olan yalnız paranın çıkışı. Hata
 * gibi gösterilseydi operatör işlemi tekrar dener ve düzeltmeyi ikinci kez uygulardı. Ama sessiz de
 * kalınamaz: sıfır iade "borç yoktu" ile aynı görünürdü ve müşteri parasını beklerdi.
 *
 * Her cümle **ne yapılacağını** söyler; sebebi tekrarlamak operatörün işine yaramaz.
 */
function refundNotice(reason: RefundBlockReason | undefined): string | null {
  if (!reason) return null;

  const notices: Record<RefundBlockReason, string> = {
    no_account: 'İade yazılamadı: bu siparişte tahsilat kaydı yok, para hangi hesaptan çıkacağı belirlenemedi. Para hareketini elle girin.',
    provider_ref_missing:
      'İade yazılamadı: kart ödemesinin sağlayıcı künyesi kayıtlı değil, hangi ödemenin üzerinden dönüleceği bilinmiyor. Stripe panelinden iade edin.',
    provider_unavailable: 'İade yazılamadı: ödeme sağlayıcısı bu ortamda tanımlı değil.',
    provider_failed: 'İade yazılamadı: sağlayıcı çağrısı başarısız oldu. Para ÇIKMADI — tekrar deneyin ya da Stripe panelinden iade edin.',
  };
  return notices[reason];
}

/**
 * Durum ilerletme — **uygulama katmanının kapısından** (`transitionOrder`).
 *
 * ── NEDEN ARTIK SERVİSE DOĞRUDAN GİTMİYOR (denetim 26.08) ────────────────────
 * Burası `OrderService.transition`ı doğrudan çağırıyordu, yani `transitionOrder`ın kurduğu
 * orkestrasyonu ATLIYORDU. Sonucu iki katlıydı:
 *
 *   · **Kapı denetimi hiç uygulanmıyordu.** Şerit `cancelled` ve `delivered` düğmelerini de
 *     çiziyor ve düz yazıma yolluyordu — iptal edilen siparişin ayrılmış malı serbest kalmıyor,
 *     teslim edilenin fiili stoğu hiç düşmüyordu.
 *   · **Test edilen yol ile operatörün yürüdüğü yol farklıydı.** `transitionOrder` on test
 *     dosyasında sınanıyor; bu ekran onu çağırmadığı için o testlerin hiçbiri buraya bakmıyordu.
 *     Bulgunun kökü buydu: her parça test edilmişti, aradaki dikiş edilmemişti.
 *
 * Ekran zaten yalnız izinli VE düz kapıdan geçebilen geçişleri sunuyor (`order-detail-read`);
 * buradaki kontrol ikinci kattır — eski bir sekmeden gelen istek, ekranın sunmadığı bir geçişi
 * yazmasın. Karar tek yerde (motor + `transitionOrder`), burada yalnız operatöre söylenecek cümle
 * seçiliyor.
 *
 * **Müşteri haberi artık BU ekrandan da gider** ve bu bilinçli: `webOrderEffects` geçiyor. Aynı
 * geçiş teslimat ekranından yapıldığında (`deliveries/[orderId]/actions.ts`) haber zaten
 * gidiyordu — müşterinin "yolda" maili alıp almaması personelin hangi ekranı kullandığına bağlıydı.
 * Haber veren üç durum var (`confirmed` · `out_for_delivery` · `delivered`) ve tekrarı `notifyOrderStatus`
 * durum kaydından zaten engelliyor.
 */
export async function advanceOrderStatusAction(
  orderId: string,
  from: OrderStatus,
  to: OrderStatus,
): Promise<ActionResult<{ status: OrderStatus }>> {
  try {
    const actor = await requireAdmin();

    // `from` = ekranın gördüğü durum: iyimser kilit onunla kurulur, yoksa bayat bir sekmeden gelen
    // istek operatörün beklediğinden başka bir durumdan ilerleyebilirdi.
    const result = await transitionOrder({ orderId, to, expectedFrom: from, actorId: actor.profileId });

    if (result.status === 'not_found') throw new Error('Sipariş bulunamadı.');
    if (result.status === 'forbidden') throw new Error(gecisReddiCumlesi(result.reason, result.gate));
    // `stale` = araya biri girdi (başka bir ekran ilerletti). Ezmek yerine gerçeği söyleriz.
    if (result.status === 'stale') {
      throw new Error(`Sipariş bu sırada "${ORDER_STATUS_LABELS[result.currentStatus]}" durumuna geçmiş — ekranı tazeleyin.`);
    }

    revalidatePath(ORDERS_PATH);
    return { data: { status: result.to }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Reddin operatöre söylenecek hâli. **"Yapılamaz" ile "başka kapıdan" ayrı cümlelerdir**: birincisi
 * yolun kapalı olduğunu, ikincisi yolun BAŞKA olduğunu söyler. Aynı cümleyi kurmak, operatöre
 * elindeki işi yapamayacağını söylemek olurdu — oysa yapabilir, doğru düğme ekranın altında duruyor.
 */
function gecisReddiCumlesi(reason: 'same_status' | 'terminal' | 'not_allowed' | 'needs_dedicated_gate', gate?: string): string {
  if (reason === 'terminal') return 'Bu sipariş kapandı, durumu değişmez.';
  if (reason === 'same_status') return 'Sipariş zaten bu durumda.';
  if (reason === 'not_allowed') return 'Bu geçiş izinli değil.';
  return gate === 'deliver_order'
    ? 'Teslim işareti bu ekrandan verilmez — teslimat ekranından işaretleyin (stok düşümü orada yazılıyor).'
    : gate === 'quick_sale'
      ? 'Kapı önü satışı hızlı satış ekranından kapatılır.'
      : 'İptal bu düğmeden yapılmaz — aşağıdaki "Siparişi iptal et" kararını kullanın (ayrılmış mal ve para iadesi orada işlenir).';
}
