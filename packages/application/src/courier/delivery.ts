import { OrderBoxService, OrderService, SettingsService } from '@lezzet/database';
import type { DeliveryProofRecord, FulfillmentAdjustment, Order, PaymentStatus } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrderEffects } from '../order/effects';
import { deliverOrder } from '../order/fulfillment';
import { recordOrderPayment, syncOrderPaymentStatus } from '../order/payment';
import { adjustFulfillment } from '../order/refund';

/**
 * Kapıda teslim: onay, eksik kalem ve tahsilat (11.2/11.3) — **uygulama katmanı orkestrasyonu**.
 * `design/pages/kurye-teslimat.md` + DOMAIN §6 (teslim onayı), §7 (nakit sınırı), §8 (kısmi).
 * Terfi 21.10; kaynağı `apps/web/lib/courier/delivery.ts`, web kopyası geçiş köprüsüdür.
 *
 * **Sıra kuralın kendisidir:** önce kanıt kapısı (hiçbir yazım yapılmadan), sonra MAL, sonra teslim,
 * en sonda PARA.
 * - Kanıt kontrolü başta: B2B teslimatı imzasız kapanmamalı — yarısı yazılmış bir teslimat üstüne
 *   "olmadı" demek, malı düşmüş ama teslim görünmeyen sipariş bırakırdı.
 * - Eksik kalem teslimden ÖNCE düşülür: teslimden sonra düşseydi mal önce fiili stoktan çıkar,
 *   sonra geri alınırdı — kayıt aynı malı iki kez oynatırdı (0026'nın "tam bir kez say" kuralı).
 * - Tahsilat en sonda: teslim `stale` dönerse karşılığı olmayan para yazılmış olmaz.
 *
 * **Kurye hesap yapmaz.** Eksik işaretlendiğinde tahsil edilecek tutarı düşüren şey bu dosyadaki bir
 * çarpma değil, ödeme durumu türetimidir (`domain-core/payment`) — tutar tek yerde hesaplanır.
 */

/** Teslim onayı: müşteri ekranda imzalar ya da kurye fotoğraf çeker (DOMAIN §6). */
export interface DeliveryProofInput {
  kind: 'signature' | 'photo';
  /** Depolanan görselin anahtarı (imza çizimi de görsel olarak saklanır). */
  imageKey: string;
  /** Kapıda teslim alan kişi — B2B'de "kim imzaladı" ihtilafın cevabıdır. */
  receivedBy?: string | null;
}

/** Kapıda tahsilat. Yöntem üçle sınırlıdır: online ve havale kuryenin eline hiç girmez. */
export interface DoorCollectionInput {
  method: 'cash' | 'card' | 'cheque';
  /** **Cent** (02.9 · STACK §8). */
  amountCents: number;
  /** Paranın gireceği hesap (kurye kasası / kapı tahsilatı). */
  accountId: string;
  /**
   * **Kuyruk yeniden-denemesi parayı iki kez yazmasın** (K4 · doc 04 "kapı imzasına baştan
   * `idempotencyKey`"). Alan taşıma sırasında sözleşmeye girdi, sonradan değil: mobil istemci
   * çevrimdışı kuyrukla çalışıyor ve anahtarı sonradan eklemek kayıtlı isteklerin göçünü isterdi.
   *
   * Anahtar istemcide üretilir (durak + deneme değil, İSTEK kimliği) ve tahsilat hareketinin
   * `meta`sında KALICI durur — sınırı `order/payment.ts` künyesinde yazılı (oku-sonra-yaz; eşzamanlı
   * iki istek atomik olarak ayrılmıyor, ardışık tekrar yakalanıyor).
   *
   * **Tek başına yeterli değil ve bu bilerek böyle:** siparişin tamamı yeniden gönderilirse teslim
   * RPC'si zaten `stale` döner (`deliver_order` yalnız `out_for_delivery`den teslim eder) ve para
   * adımına HİÇ gelinmez. Yani mükerrer yazımın birinci kilidi durum makinesi, ikincisi bu anahtar.
   */
  idempotencyKey?: string | null;
}

export type DoorDeliveryOutcome =
  | {
      status: 'ok';
      /** Fiilen yazılan tahsilat (**cent**); tahsilat yoksa 0. */
      collectedCents: number;
      /** Teslim sonrası kalan borç (**cent**) — kapıda ödenmediyse ya da eksik ödendiyse pozitif. */
      amountDueCents: number;
      paymentStatus: PaymentStatus;
      /**
       * Nakit yasal sınırı aşıldı mı (FR ~1.000 €). **Engel DEĞİL, bilgi:** tahsilat tamamlanır,
       * karar sahadadır (DOMAIN §7).
       */
      cashLimitExceeded: boolean;
      /** Eksik/reddedilen kalem yazıldı mı — tutar buna göre kendiliğinden düştü. */
      adjustedLines: number;
      /**
       * Tahsilat bu çağrıda YAZILMADI; aynı `idempotencyKey` ile zaten yazılmıştı (K4). Sonucun
       * geri kalanı gerçektir — tekrar eden istek ilk isteğin cevabını görür.
       */
      collectionDeduped?: true;
    }
  /** Kanıt zorunlu ama gelmedi — HİÇBİR yazım yapılmadı. */
  | { status: 'proof_required'; channel: Order['channel'] }
  /** Kutulu siparişte okutulmamış kutu var — teslim YAZILMADI (23.8, etüt 2.5). */
  | { status: 'boxes_missing'; remainingBoxNos: number[] }
  | { status: 'forbidden'; reason: 'not_assigned' }
  | { status: 'stale'; currentStatus: Order['status'] }
  | { status: 'not_found' };

/**
 * @param db service-role istemci — çağıran enjekte eder (`serviceDb()`), `auth/otp` deseni.
 */
export async function confirmDoorDelivery(
  db: SupabaseClient,
  input: {
    orderId: string;
    courierId: string;
    /**
     * Kapıda eksik çıkan / müşterinin kabul etmediği kalemler. `fulfilledQty` **hedef** değerdir
     * (kalan adet), fark değil — ekranda görülen sayı gönderilir (07.8).
     */
    adjustments?: readonly FulfillmentAdjustment[];
    proof?: DeliveryProofInput | null;
    collection?: DoorCollectionInput | null;
    /**
     * Kapıda okutulan kutu kodları (23.8). Kutulu siparişte teslimin ÖN KOŞULU: set siparişin
     * kutularını kapsamıyorsa hiçbir yazım yapılmadan `boxes_missing` döner — yanlış anda/yerde
     * okutulan kod sessiz geçmez. Kodlar `delivery_proof`a yazılır.
     */
    scannedBoxCodes?: readonly string[];
    /** Müşteri haberi / puan portları — `order/effects.ts`. */
    effects?: OrderEffects;
  },
): Promise<DoorDeliveryOutcome> {
  const orders = new OrderService(db);
  const order = await orders.getById(input.orderId);
  if (!order) return { status: 'not_found' };
  if (order.courierId !== input.courierId) return { status: 'forbidden', reason: 'not_assigned' };

  // ── Kutu kapısı: yazımdan önce (23.8, etüt 2.5) ───────────────────────────
  // "Tüm kutular okutulmadan teslim tamamlanmaz." Ekran kalan kutuyu numarasıyla söyler — kurye
  // araçta hangi kutuyu unuttuğunu numaradan bulur. Kutusuz sipariş bu kapıyı hiç görmez.
  const boxes = await new OrderBoxService(db).listByOrder(input.orderId);
  if (boxes.length > 0) {
    const scanned = new Set((input.scannedBoxCodes ?? []).map((code) => code.trim()));
    const remaining = boxes.filter((box) => !scanned.has(box.code));
    if (remaining.length > 0) {
      return { status: 'boxes_missing', remainingBoxNos: remaining.map((box) => box.boxNo) };
    }
  }

  // ── Kanıt kapısı: yazımdan önce ────────────────────────────────────────────
  if (!input.proof && (await proofRequired(db, order.channel))) {
    return { status: 'proof_required', channel: order.channel };
  }

  // ── Mal ────────────────────────────────────────────────────────────────────
  // Kapıda reddedilen mal fiili stoktan HİÇ düşmemiştir (sipariş henüz `delivered` değil): kalem–parti
  // kaydı ve rezervasyon azalır, mal araçta kalır ve depoya döner (0026).
  const adjustments = input.adjustments ?? [];
  if (adjustments.length > 0) {
    const adjusted = await adjustFulfillment(db, input.orderId, adjustments, {
      actorId: input.courierId,
      effects: input.effects,
    });
    if (adjusted.status === 'stale') return { status: 'stale', currentStatus: adjusted.currentStatus };
    if (adjusted.status === 'not_found') return { status: 'not_found' };
    // `forbidden` bu yoldan DOĞAMAZ: kapsam listesi geçirilmiyor, kuryenin yetkisi `courierId`
    // eşleşmesidir ve yukarıda soruldu. Ulaşılamaz dalı başka bir duruma çevirmek (ör. `not_found`)
    // YALAN olurdu; değişmez bir gün ihlal edilirse gürültü çıkarsın diye fırlatılıyor.
    if (adjusted.status === 'forbidden') {
      throw new Error(`[courier/delivery] kapsam dışı kalem düzeltmesi — sipariş ${input.orderId}`);
    }
  }

  // ── Teslim ─────────────────────────────────────────────────────────────────
  // Kutulu siparişte okutulan kodlar KANITA yazılır (etüt 2.5): görselli kanıt varsa onun içine,
  // yoksa görselsiz `box_scan` kaydı doğar — B2C'nin bugün hiç kanıt istemeyen teslimi böylece
  // bedava bir kanıt kazanır.
  const boxCodes = boxes.length > 0 ? boxes.map((box) => box.code) : null;
  const delivered = await deliverOrder(db, input.orderId, {
    actorId: input.courierId,
    deliveryProof: input.proof
      ? proofRecord(input.proof, input.courierId, boxCodes)
      : boxCodes
        ? boxScanRecord(boxCodes, input.courierId)
        : null,
    effects: input.effects,
  });
  if (!delivered.ok) return { status: 'stale', currentStatus: delivered.currentStatus };

  // ── Para ───────────────────────────────────────────────────────────────────
  const cashLimitExceeded =
    input.collection?.method === 'cash' && input.collection.amountCents > (await cashLegalLimitCents(db));

  if (!input.collection) {
    const synced = await syncOrderPaymentStatus(db, input.orderId);
    if (synced.status !== 'ok') return { status: 'not_found' };
    return {
      status: 'ok',
      collectedCents: 0,
      amountDueCents: synced.derivation.amountToCollectCents,
      paymentStatus: synced.paymentStatus,
      cashLimitExceeded: false,
      adjustedLines: adjustments.length,
    };
  }

  // Yöntem siparişe yazılır: gün kapanışı beklenen toplamları yöntem bazında bundan türetir (11.6).
  await orders.update({ id: input.orderId, paymentMethod: input.collection.method });

  const paid = await recordOrderPayment(db, {
    orderId: input.orderId,
    accountId: input.collection.accountId,
    amountCents: input.collection.amountCents,
    description: 'Kapıda tahsilat',
    idempotencyKey: input.collection.idempotencyKey,
  });
  if (paid.status !== 'ok') return { status: 'not_found' };

  return {
    status: 'ok',
    collectedCents: input.collection.amountCents,
    amountDueCents: paid.derivation.amountToCollectCents,
    paymentStatus: paid.paymentStatus,
    cashLimitExceeded,
    adjustedLines: adjustments.length,
    ...(paid.deduped ? { collectionDeduped: true as const } : {}),
  };
}

/**
 * Kanıt bu kanalda zorunlu mu. Kapsam parametriktir (B2B zorunlu, B2C kapalı — varsayılan); ayar
 * okunamazsa **zorunlu değil** kabul edilir: eksik ayar yüzünden kuryenin kapıda kilitlenmesi,
 * kanıtsız bir teslimattan daha pahalıdır.
 */
async function proofRequired(db: SupabaseClient, channel: Order['channel']): Promise<boolean> {
  const scope = await new SettingsService(db).get<Record<string, boolean>>('delivery_proof_required', {
    b2b: true,
    b2c: false,
  });
  return scope?.[channel] === true;
}

/** Nakit yasal sınırı (cent) — ayardan; kodda sabit yok (CLAUDE.md §4). */
function cashLegalLimitCents(db: SupabaseClient): Promise<number> {
  return new SettingsService(db).getNumber('cash_legal_limit_cents', 100_000);
}

/**
 * Siparişe yazılan kanıt: ne, kim, ne zaman — "eksik geldi" ihtilafının tek sigortası (DOMAIN §6).
 *
 * **Şekil `packages/types`'tan geliyor** (`DeliveryProofRecord`), burada elle yazılmıyor. Eskiden
 * yazılıyordu ve okuyan ekran BAŞKA alan adları arıyordu (`photos[]`, `by`, `note`) — ortak tek
 * alan `at` idi. İki taraf da kendi içinde tutarlı olduğu için hiçbir yerde hata vermiyordu; ekran
 * kanıtı "var" gösteriyor, ama neyin var olduğunu söyleyemiyordu. Tipe bağlanınca yanlış alan adı
 * derleme hatasına döndü.
 */
function proofRecord(proof: DeliveryProofInput, courierId: string, boxCodes: string[] | null = null): DeliveryProofRecord {
  return {
    kind: proof.kind,
    imageKey: proof.imageKey,
    receivedBy: proof.receivedBy ?? null,
    courierId,
    at: new Date().toISOString(),
    ...(boxCodes ? { boxCodes } : {}),
  };
}

/**
 * Görselsiz kanıt (23.8): kanıtın kendisi kapıda okutulan QR'lardır. Yalnız kutulu siparişin
 * görselsiz tesliminde doğar — görselli kanıt varken kodlar onun İÇİNE yazılır, iki kayıt olmaz.
 */
function boxScanRecord(boxCodes: string[], courierId: string): DeliveryProofRecord {
  return {
    kind: 'box_scan',
    imageKey: null,
    receivedBy: null,
    courierId,
    at: new Date().toISOString(),
    boxCodes,
  };
}
