import { MoneyMovementService, OrderService } from '@lezzet/database';
import { derivePaymentStatusForOrder, type PaymentDerivation } from '@lezzet/domain-core';
import { revokeReferralOnUnpaidOrder, rewardReferralOnPaidOrder } from '../feedback/points';
import type { Order, OrderItem, PaymentStatus } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Siparişin para bağları (12.2; terfi 21.10 — kaynağı `apps/web/lib/money/order-payment.ts`).
 * DOMAIN §7, §9. Web kopyası geçiş köprüsüdür (checkout, banka eşleştirme, Stripe webhook ve hızlı
 * satış onu çağırmaya devam eder); benimsemesi ayrı talep dosyasıyla gider.
 *
 * **Neden bu dosya da terfi etti:** kurye kapısı (`courier/delivery`) ve `order/refund` ikisi de
 * buradan geçiyor — para yazımı orkestrasyonun İÇİNDE, yanında değil. Bırakılsaydı terfi edilen iki
 * kapı web'e bakmak zorunda kalırdı ve mobil uç onları hiç çağıramazdı.
 *
 * Üç katman bir araya gelir:
 * - **Veritabanı** hareketi yazar ve `amount_*` cache'ini KAYNAKTAN yeniden hesaplar (tek transaction).
 * - **Motor** ödeme durumunu TÜRETİR (`derivePaymentStatus`): net tahsilat vs karşılanan tutar.
 * - **Burası** ikisini bağlar ve türetilen durumu siparişe yazar.
 *
 * `payment_status` neden saklanıyor: liste ekranları ("ödenmemiş vadeli siparişler") onu süzer;
 * her satırda kalemleri okuyup yeniden türetmek her listeyi N+1 yapardı. Saklanan türetim ancak
 * **her değişimde yeniden hesaplanırsa** doğru kalır — o yüzden tek yazım yolu buradan geçer.
 */

export type PaymentOutcome =
  | {
      status: 'ok';
      amountCollectedCents: number;
      amountRefundedCents: number;
      paymentStatus: PaymentStatus;
      derivation: PaymentDerivation;
      /**
       * Bu çağrıda YENİ hareket yazılmadı; aynı `idempotencyKey` ile daha önce yazılmış bir tahsilat
       * bulundu (K4). Sonucun geri kalanı gerçek ve günceldir — tekrar eden istek, ilk isteğin
       * cevabını alır. Alan yoksa yazım gerçekten yapıldı.
       */
      deduped?: true;
    }
  | { status: 'not_found' };

export interface OrderMovementInput {
  orderId: string;
  /** Paranın girdiği/çıktığı hesap (kasa, banka, Stripe). */
  accountId: string;
  /** **Cent** (02.9 · STACK §8). */
  amountCents: number;
  valueDate?: string;
  description?: string | null;
  source?: 'manual' | 'bank_import';
  /**
   * Sağlayıcı künyesi (07.11) — tahsilatta `{ providerRef: 'pi_...' }` yazılır ve iade o referansın
   * üzerinden döner. Kapıda nakit/kart tahsilatında yoktur: dönülecek bir sağlayıcı da yoktur.
   */
  meta?: Record<string, unknown> | null;
  /**
   * **Aynı tahsilatın iki kez yazılmasını engelleyen anahtar** (K4 · 21.10).
   *
   * Sahadaki kurye kuyruklu çalışır: cevabı alamadığı isteği tekrar gönderir. Anahtar hareketin
   * KENDİ KOLONUNDA kalıcı durur, dolayısıyla tekrar bir saat sonra gelse de yakalanır.
   *
   * ── ARTIK ATOMİK (21.263 · BEKLEYEN(12.11) KAPANDI) ─────────────────────────
   * 05.09'a kadar kontrol burada, uygulama katmanında, OKU-SONRA-YAZ idi: hareketler okunup
   * `meta.idempotencyKey` aranıyordu. Sınırı bu künyede yazılıydı ve gerçekti — **aynı anda** gelen
   * iki eş-anahtarlı istek ikisi de "yok" okuyup ikisi de yazabiliyordu; yalnız peş peşe gelen
   * ikinci istek yakalanıyordu.
   *
   * Kararı artık veritabanı veriyor: `money_movement.idempotency_key` + tekil indeks (0018) ve
   * `record_order_movement` çakışmada var olan hareketin sonucunu döndürüyor. Kullanıcı kararı
   * 04.09 — aynı boşluk `warehouse_transfer`da da vardı ve ikisi tek DESEN olarak kapatıldı.
   */
  idempotencyKey?: string | null;
}

/** Tahsilat — kapıda nakit/kart, havale, Stripe onayı, kurye gün kapanışı. */
export function recordOrderPayment(db: SupabaseClient, input: OrderMovementInput): Promise<PaymentOutcome> {
  return writeOrderMovement(db, input, 'order_payment');
}

/** İade — kısmi karşılama farkı (07.8), iptal/iade (07.9). */
export function recordOrderRefund(db: SupabaseClient, input: OrderMovementInput): Promise<PaymentOutcome> {
  return writeOrderMovement(db, input, 'order_refund');
}

async function writeOrderMovement(
  db: SupabaseClient,
  input: OrderMovementInput,
  type: 'order_payment' | 'order_refund',
): Promise<PaymentOutcome> {
  const found = await new OrderService(db).getWithItems(input.orderId);
  if (!found) return { status: 'not_found' };

  /*
    TEKRAR KONTROLÜ ARTIK BURADA DEĞİL, VERİDE (21.263). Bu satırın üstünde bir `alreadyWritten`
    yardımcısı duruyordu: siparişin hareketlerini okuyup `meta.idempotencyKey` arıyordu. Doğru
    çalışıyordu ama oku-sonra-yazdı ve kendi künyesinde bunu yazıyordu — aynı ANDA gelen iki
    eş-anahtarlı istek ikisi de "yok" okuyup ikisi de yazabiliyordu.

    Şimdi anahtar kolona gidiyor, tekil indeks ikinci yazımı reddediyor ve RPC var olan hareketin
    sonucunu `deduped` ile döndürüyor. Yani KAPI TEK: yazım denenir, cevabı veritabanı verir.
    Anahtar ayrıca `meta`ya YAZILMIYOR — iki yerde duran bir gerçek bir gün ayrışırdı.
  */
  const amounts = await new MoneyMovementService(db).recordForOrder({
    orderId: input.orderId,
    accountId: input.accountId,
    amountCents: input.amountCents,
    valueDate: input.valueDate,
    description: input.description,
    source: input.source,
    meta: input.meta ?? null,
    idempotencyKey: input.idempotencyKey,
    type,
  });
  // Para hareketi ailesi de cent'e geçti (02.9 dilim 6) — buradaki iki `toCents` düştü.
  const outcome = await finalize(db, found.order, found.items, amounts.amountCollectedCents, amounts.amountRefundedCents);
  // Tekrar eden istek ilk isteğin cevabını görür; tutarlar zaten defterin o anki hâli (RPC tekrar
  // dalında da `resync` koşuyor), değişen tek şey okuyan tarafa "yeni bir şey yazılmadı" demek.
  return outcome.status === 'ok' && amounts.deduped === true ? { ...outcome, deduped: true } : outcome;
}

/**
 * Ödeme durumunu yeniden türetip yazar. Para DIŞINDA bir şey değiştiğinde de çağrılır: kısmi
 * karşılamada `fulfilled_qty` düşünce (07.8) ya da sipariş iptal olunca karşılanan tutar değişir —
 * tahsilat hiç değişmese bile durum değişir.
 */
export async function syncOrderPaymentStatus(db: SupabaseClient, orderId: string): Promise<PaymentOutcome> {
  const found = await new OrderService(db).getWithItems(orderId);
  if (!found) return { status: 'not_found' };

  // Cache'i de tazele: hareket elle silinmiş/düzeltilmiş olabilir.
  const amounts = await new MoneyMovementService(db).resyncOrder(orderId);
  return finalize(db, found.order, found.items, amounts.amountCollectedCents, amounts.amountRefundedCents);
}

async function finalize(
  db: SupabaseClient,
  order: Order,
  items: OrderItem[],
  collectedCents: number,
  refundedCents: number,
): Promise<PaymentOutcome> {
  // Eşleme motorda (kargo, indirim payı, iptal kuralı) — burada tekrarlanmaz.
  const derivation = derivePaymentStatusForOrder(order, items, { collectedCents, refundedCents });

  if (derivation.status !== order.paymentStatus) {
    await new OrderService(db).update({ id: order.id, paymentStatus: derivation.status });

    /**
     * ── PARA ALINDI: GETİRENİN ÖDÜLÜ BURADA DOĞAR (17.9) ──────────────────
     * Kural kullanıcının tek cümlesi: **puan, para gerçekten alındığında yazılır** — kartla
     * ödeyende sipariş anı, kapıda ödeyende teslimat anı. İkisini de kapsayan tek an, ödeme
     * durumunun `paid`e DÖNDÜĞÜ andır ve o an yalnız burada türetiliyor.
     *
     * Önce `delivered` etkisine bağlıydı (`rewardDelivered`); teslimat anı kartla ödeyen müşteri
     * için geç, kapıda ödeyen için doğruydu. Buraya taşınınca ikisi de doğru oldu ve sömürü kapısı
     * kapandı: ödenmemiş bir sipariş puan doğurmuyor.
     *
     * **GEÇİŞ anında, her senkronda değil:** `finalize` para dışındaki değişikliklerde de koşuyor
     * (kısmi karşılama, iptal). Koşul `if` bloğunun İÇİNDE olduğu için ödül yalnız durum gerçekten
     * değişince aranıyor; zaten `paid` olan bir siparişin yeniden senkronu ödülü tekrar tetiklemez.
     * Tetiklese de zarar vermezdi (defterin tekillik indeksi düşürür) — ama boş sorgu da atmıyoruz.
     *
     * **Ödül asıl işlemi durdurmaz** (`DOMAIN §14`): `awardPoints` B2B'de, tavanda ve yarışta
     * sessizce `null` döner; buradan yukarı yalnız gerçek bir arıza çıkar ve o da ödemeyi değil
     * çağıran akışı ilgilendirir.
     */
    if (derivation.status === 'paid') await rewardReferralOnPaidOrder(db, order.id);

    /**
     * ── PARA TAMAMEN GERİ GİTTİ: ÖDÜL DE GERİ GİDER (★ karar 7 · 17.08, DARALTILDI 25.08) ──
     * Yukarıdaki satırın simetriği. Ölçülen boşluk (17.08): burada yalnız `paid`e GİRİŞ
     * dinleniyordu, `paid`ten ÇIKIŞ hiçbir şey tetiklemiyordu — kartla ödenmiş bir sipariş iptal
     * edilip parası iade edilince davet edenin 100/500 puanı defterde kalıyordu.
     *
     * ── KOŞUL DARALDI: `partial` ARTIK KAPSAM DIŞI (kullanıcı kararı 25.08) ───────
     * Eski koşul *"yeni durum `paid` DEĞİL"*di ve künyesi *"kısmi iade de kapsanır ve kapsanması
     * doğru"* diyordu. **Ölçüm bu gerekçeyi çürüttü** (25.08, 14 senaryo):
     *   · 30 €'luk siparişte **1 €** iade → getirenin **500 puanı** siliniyordu;
     *   · operatörün **jest iadesi** (mal müşteride KALIR, gönül alınır) aynı şeyi yapıyordu;
     *   · ve geri dönüşü yoktu — para yeniden tahsil edilse bile ödül geri gelmiyor (tekillik).
     * Kullanıcının kuralı: *"kısmî iade aslında kısmî sipariş de demektir, dolayısıyla puan geri
     * alınmasın."* Kısmî karşılamada (depo eksik gönderdi) zaten sorun yoktu: orada beklenen tutar
     * da düştüğü için durum `paid` kalıyor — ölçüldü.
     *
     * **Yeni ölçüt tek cümle: ELDE HİÇ PARA KALMADI MI.** `statusOf` bunu zaten ayırıyor —
     * `net <= 0` ise `refunded` (bir iade oldu) ya da `pending` (hiç tahsil edilmedi); `partial`
     * ise "bir kısmı elimizde" demek. Eşiğe gerek yok: ayrım motorda zaten var.
     *
     * `pending` de kapsanıyor ve bu savunma amaçlı: `paid`ten oraya düşmek "tahsilat defterden
     * tümden kayboldu" demektir, yani hak ediş de yoktur.
     *
     * Geri alınacak ödül yoksa (kapıda ödeme, tavan, B2B) çağrı sessizce geçer.
     */
    if (derivation.status === 'refunded' || derivation.status === 'pending') {
      await revokeReferralOnUnpaidOrder(db, order.id);
    }
  }

  return {
    status: 'ok',
    amountCollectedCents: collectedCents,
    amountRefundedCents: refundedCents,
    paymentStatus: derivation.status,
    derivation,
  };
}
