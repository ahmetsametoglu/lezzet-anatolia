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
   * `meta`sında KALICI olarak durur, dolayısıyla tekrar bir saat sonra gelse de yakalanır.
   *
   * ── SINIRI OLDUĞU GİBİ YAZILIYOR ────────────────────────────────────────────
   * Kontrol **oku-sonra-yaz**dır, atomik DEĞİL: `money_movement`ta bu anahtar için tekil indeks
   * yoktur (`import_fingerprint` var ama `record_order_movement` onu hiç doldurmuyor — ölçüldü,
   * migration 0018). Yani **aynı anda** gelen iki eş-anahtarlı istek ikisi de "yok" okuyup ikisi de
   * yazabilir; peş peşe gelen ikinci istek yakalanır. Tam kapanış migration ister
   * (`money_movement.idempotency_key` + kısmi tekil indeks — checkout emsali `order.idempotency_key`,
   * 0012); şema bu görevin alanı dışında ve rapora yazıldı.
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

/**
 * Bu anahtarla zaten yazılmış bir hareket var mı. Sipariş başına okunur — anahtar siparişin
 * hareketleri arasında aranır, tablo taranmaz.
 *
 * BEKLEYEN(12.11): bu arama atomik DEĞİL (birinci kilit durum makinesi); kalıcı kapanış
 * `money_movement.idempotency_key` kolonu + kısmi tekil indeks + RPC parametresi.
 */
async function alreadyWritten(db: SupabaseClient, orderId: string, type: 'order_payment' | 'order_refund', key: string): Promise<boolean> {
  const movements = await new MoneyMovementService(db).listByOrder(orderId);
  return movements.some((movement) => movement.type === type && movement.meta?.['idempotencyKey'] === key);
}

async function writeOrderMovement(
  db: SupabaseClient,
  input: OrderMovementInput,
  type: 'order_payment' | 'order_refund',
): Promise<PaymentOutcome> {
  const found = await new OrderService(db).getWithItems(input.orderId);
  if (!found) return { status: 'not_found' };

  if (input.idempotencyKey && (await alreadyWritten(db, input.orderId, type, input.idempotencyKey))) {
    // Yazım YOK ama cevap gerçek: tekrar eden istek ilk isteğin sonucunu görür. `resync` hareketleri
    // yeniden toplar (yeni satır üretmez), böylece dönen tutarlar defterin o anki hâlidir.
    const synced = await syncOrderPaymentStatus(db, input.orderId);
    return synced.status === 'ok' ? { ...synced, deduped: true } : synced;
  }

  const meta = input.idempotencyKey ? { ...(input.meta ?? {}), idempotencyKey: input.idempotencyKey } : (input.meta ?? null);
  const amounts = await new MoneyMovementService(db).recordForOrder({
    orderId: input.orderId,
    accountId: input.accountId,
    amountCents: input.amountCents,
    valueDate: input.valueDate,
    description: input.description,
    source: input.source,
    meta,
    type,
  });
  // Para hareketi ailesi de cent'e geçti (02.9 dilim 6) — buradaki iki `toCents` düştü.
  return finalize(db, found.order, found.items, amounts.amountCollectedCents, amounts.amountRefundedCents);
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
     * ── PARA GERİ GİTTİ: ÖDÜL DE GERİ GİDER (★ karar 7 · kullanıcı kararı 17.08) ──
     * Yukarıdaki satırın simetriği. Ölçülen boşluk (17.08): burada yalnız `paid`e GİRİŞ
     * dinleniyordu, `paid`ten ÇIKIŞ hiçbir şey tetiklemiyordu — kartla ödenmiş bir sipariş iptal
     * edilip parası iade edilince davet edenin 100/500 puanı defterde kalıyordu.
     *
     * **Koşul "eski durum `paid`di" değil, "yeni durum `paid` DEĞİL"** — çünkü buraya yalnız durum
     * gerçekten değiştiğinde giriliyor (dıştaki `if`) ve `paid` dışındaki her hedef (`refunded` ·
     * `partial` · `pending`) aynı şeyi söylüyor: elde tutulan para artık ödülü karşılamıyor. Kısmi
     * iade de kapsanır ve kapsanması doğru: sipariş `partial`a düştüyse tam bedel alınmamıştır.
     *
     * Geri alınacak ödül yoksa (kapıda ödeme, tavan, B2B) çağrı sessizce geçer.
     */
    if (derivation.status !== 'paid') await revokeReferralOnUnpaidOrder(db, order.id);
  }

  return {
    status: 'ok',
    amountCollectedCents: collectedCents,
    amountRefundedCents: refundedCents,
    paymentStatus: derivation.status,
    derivation,
  };
}
