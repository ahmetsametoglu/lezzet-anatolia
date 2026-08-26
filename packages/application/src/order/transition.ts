import { OrderService, type Db } from '@lezzet/database';
import { canTransition, gateFor, generateReferenceNo, producesReferenceNo, type OrderGate } from '@lezzet/domain-core';
import type { OrderStatus } from '@lezzet/types';
import { notifyStatusEffect, type OrderEffects } from './effects';

/**
 * Durum ilerletme kapısı (07.6) — **uygulama katmanı orkestrasyonu**.
 *
 * Karar motorun (`domain-core/order/status-machine`: izinli geçiş tablosu + referans üretim kuralı),
 * yazım servisin (koşullu RPC: durum + log tek transaction'da). İkisi birbirini bilmez (STACK §4);
 * birleştiren yer burasıdır.
 *
 * ÜÇ ayrı "hayır" vardır ve karıştırılmaz:
 * - **`forbidden` / `not_allowed` · `terminal` · `same_status`** — geçiş kurallara aykırı
 *   (ör. `draft → delivered`). Motorun geçiş tablosunun cevabı.
 * - **`forbidden` / `needs_dedicated_gate`** — geçiş kurallara UYGUN ama bu kapıdan yazılamaz:
 *   stok yazımı geçişle aynı transaction'da olmalı, o iş `cancel_order` / `deliver_order` /
 *   `quick_sale` içinde yapılıyor (denetim 26.08). "Yapılamaz" değil, "başka kapıdan" demektir.
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
  /**
   * Kurallara aykırı geçiş. İlk üç sebep motorun geçiş tablosundan (`canTransition`); dördüncüsü
   * KAPI kararıdır: geçiş izinli ama bu kapıdan yazılamaz (`needs_dedicated_gate`).
   */
  | { status: 'forbidden'; reason: 'same_status' | 'terminal' | 'not_allowed' | 'needs_dedicated_gate'; gate?: OrderGate }
  /** Sipariş bu arada başkası tarafından ilerletilmiş — çağıran yeni duruma göre yeniden karar verir. */
  | { status: 'stale'; currentStatus: OrderStatus }
  | { status: 'not_found' };

export interface TransitionInput {
  orderId: string;
  to: OrderStatus;
  /**
   * Çağıranın GÖRDÜĞÜ durum — verilirse iyimser kilit buna göre kurulur (26.08).
   *
   * Kapı siparişin güncel durumunu zaten okuyor; o okumayla yazım arasındaki yarışı RPC'nin kendi
   * koşullu update'i tutuyor. Ama bir de EKRANIN bayatlığı var ve o başka bir şey: operatör
   * "Onaylandı" gördüğü sayfada dururken sipariş "Hazırlanıyor"a geçmiş olabilir. Bu alan
   * verilmezse kapı yalnız kendi okumasını korur ve bayat bir ekrandan gelen istek, operatörün
   * beklediğinden BAŞKA bir durumdan ilerleyebilir — sonuç doğru yazılır ama operatöre yanlış
   * hikâyeyi anlatır.
   */
  expectedFrom?: OrderStatus;
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

  // 0) Ekran bayat mı — çağıranın gördüğü durum hâlâ geçerli mi? (yalnız bildirdiyse)
  if (input.expectedFrom && input.expectedFrom !== order.status) {
    return { status: 'stale', currentStatus: order.status };
  }

  // 1) Kural: bu geçiş izinli mi? Motor hata FIRLATMAZ, değer döner (03.1).
  const verdict = canTransition(order.status, input.to);
  if (!verdict.allowed) return { status: 'forbidden', reason: verdict.reason };

  /* 2) Kapı: izinli olmak YETMEZ, bu kapıdan yazılabilir olmalı (denetim 26.08).
     Stok yazımı geçişle AYNI transaction'da olan geçişler buradan geçmez — düz yazım yalnız
     `status` + log yazar, stoğu düşmez/bırakmaz. Ölçüldü: şeritten iptal edilen siparişin
     ayrılmış malı serbest kalmıyor, şeritten teslim edilenin fiili stoğu hiç düşmüyordu.
     Reddetmek "yapılamaz" demek değil, "başka kapıdan" demektir — sebep `gate` ile söylenir ki
     çağıran operatöre doğru düğmeyi gösterebilsin. */
  const gate = gateFor(order.status, input.to);
  if (gate !== 'plain') return { status: 'forbidden', reason: 'needs_dedicated_gate', gate };

  // 3) Referans numarası İLK KALICI DURUMDA üretilir (`confirmed`, hızlı satışta `completed`).
  //    Zaten varsa yeniden üretilmez; RPC de mevcut numarayı ezmez (çift emniyet).
  const referenceNo =
    !order.referenceNo && producesReferenceNo(order.status, input.to)
      ? generateReferenceNo({ year: new Date(order.createdAt).getFullYear() })
      : null;

  // 4) Yazım: koşullu (yalnız beklenen kaynaktan) + log satırı aynı transaction'da.
  const result = await orders.transition({
    orderId: order.id,
    from: order.status,
    to: input.to,
    actorId: input.actorId,
    referenceNo,
  });

  if (!result.ok) return { status: 'stale', currentStatus: result.currentStatus };

  // 5) Haber müşteriye — YALNIZ geçiş gerçekten olduysa (14.5). Gönderim hatası geçişi geri almaz:
  //    sipariş ilerledi, mail gitmediyse tekrar gönderilir; tersi (ilerlemeyi iptal etmek) veriyi
  //    bozar. Yakalama portun içinde (`runEffect`) — çağıran kötü davranan bir port geçirse bile
  //    ilerlemiş bir sipariş "olmadı" diye görünmez.
  await notifyStatusEffect(input.effects, order.id, input.to);

  // 6) ÖDÜL ÇAĞRISI BURADAN KALKTI (17.9). Sipariş puanı kaldırıldı (kullanıcı kararı 11.08) ve
  //    getirenin ödülü teslimattan ÖDEMEYE taşındı — `order/payment.ts` → `finalize`. Durum geçişi
  //    paranın alındığını BİLMEZ: `delivered` ödenmemiş bir siparişte de olabiliyor, yani burada
  //    yazılan puan "para alındığında yaz" kuralını deliyordu.

  return { status: 'ok', from: order.status, to: input.to, referenceNo: referenceNo ?? order.referenceNo };
}
