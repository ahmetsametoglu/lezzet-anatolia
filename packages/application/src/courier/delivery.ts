import { OrderBoxService, OrderService, SettingsService } from '@lezzet/database';
import type { DeliveryProofRecord, FulfillmentAdjustment, Order, PaymentStatus } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrderEffects } from '../order/effects';
import { recordOrderPayment, syncOrderPaymentStatus } from '../order/payment';
import { deliverOrderWithAdjustments } from '../order/refund';

/**
 * Kapıda teslim: sıra kuralın kendisidir: önce kanıt kapısı (hiçbir yazım yapılmadan), sonra mal ve teslim tek yazımda, en sonda para; teslim `stale` dönerse karşılıksız para yazılmaz.
 * Kurye hesap yapmaz: eksik işaretlenince tahsil edilecek tutarı ödeme durumu türetimi düşürür, tutar tek yerde hesaplanır.
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
   * Kuyruk yeniden denemesi parayı iki kez yazmasın: anahtar istemcide üretilen istek kimliğidir ve tahsilat hareketinin `meta`sında kalıcı durur.
   * Birinci kilit durum makinesidir (teslim yalnız yoldaki siparişten), ikincisi bu anahtar; sınırı `order/payment.ts` künyesinde yazılı.
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
      /** Nakit yasal sınırı aşıldı mı; engel değil bilgi: tahsilat tamamlanır, karar sahadadır (DOMAIN §7). */
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
     * Kapıda okutulan kutu kodları: kutulu siparişte teslimin ön koşulu; set kutuları kapsamıyorsa hiçbir yazım yapılmadan `boxes_missing` döner.
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

  /*
    Kutu kapısı yazımdan önce çalışır: bütün kutular okutulmadan teslim tamamlanmaz ve kutusuz sipariş de geçemez, çünkü mal kutusuyla hazırlanır, araca biner ve kapıdan çıkar.
    Kutusuz sipariş buraya düşmemeli (hazırlık onu `ready` yapmıyor); düşerse teslim yazılmaz ve ekran "kutu kaydı yok" der ki arıza görünür olsun.
  */
  const boxes = await new OrderBoxService(db).listByOrder(input.orderId);
  const scanned = new Set((input.scannedBoxCodes ?? []).map((code) => code.trim()));
  const remaining = boxes.filter((box) => !scanned.has(box.code));
  if (boxes.length === 0 || remaining.length > 0) {
    return { status: 'boxes_missing', remainingBoxNos: remaining.map((box) => box.boxNo) };
  }

  // ── Kanıt kapısı: yazımdan önce ────────────────────────────────────────────
  if (!input.proof && (await proofRequired(db, order.channel))) {
    return { status: 'proof_required', channel: order.channel };
  }

  // ── Mal + teslim: TEK YAZIM ────────────────────────────────────────────────
  /*
    İKİSİ BÖLÜNMEZ (21.271 · denetim bulgusu 8). Bir tur burada ARDIŞIK iki çağrı vardı — önce
    `adjustFulfillment`, sonra `deliverOrder` — ve ikincisi `stale` dönerse birincisi geri
    alınmıyordu: karşılanan adet düşmüş, rezervasyon serbest kalmış, müşteriye "eksik karşılandı"
    haberi gitmiş, ama teslim yazılmamış oluyordu. Ekran kuryeye "olmadı" diyordu; oysa yarısı
    olmuştu ve haber geri alınamıyordu.

    Sırayı ters çevirmek çare değildi: düzeltmenin anlamı malın fiili stoktan düşüp düşmediğine
    bağlı (`0020` künyesi) — teslimden önce "rezervasyonu küçült", sonra "düşmüş stoğu geri koy".
    Çare ikisini tek transaction'a almaktı; künye `deliverOrderWithAdjustments`ta.

    Kapıda reddedilen mal fiili stoktan HİÇ düşmemiştir: kalem–parti kaydı ve rezervasyon azalır,
    mal araçta kalır ve depoya döner (0026).

    Kutulu siparişte okutulan kodlar KANITA yazılır (etüt 2.5): görselli kanıt varsa onun içine,
    yoksa görselsiz `box_scan` kaydı doğar — B2C'nin bugün hiç kanıt istemeyen teslimi böylece
    bedava bir kanıt kazanır.
  */
  const adjustments = input.adjustments ?? [];
  const boxCodes = boxes.length > 0 ? boxes.map((box) => box.code) : null;
  const written = await deliverOrderWithAdjustments(db, input.orderId, adjustments, {
    actorId: input.courierId,
    deliveryProof: input.proof
      ? proofRecord(input.proof, input.courierId, boxCodes)
      : boxCodes
        ? boxScanRecord(boxCodes, input.courierId)
        : null,
    effects: input.effects,
  });
  if (written.status === 'stale') return { status: 'stale', currentStatus: written.currentStatus };
  if (written.status === 'not_found') return { status: 'not_found' };
  /*
    `already_marked` BU YOLDAN DOĞAMAZ — ve bu artık sözleşmenin garantisi (21.272 · 07.09).

    Bir tur burada *"kurye yolunda da doğabilir"* yazıyordu ve `BEKLEYEN(21.272)` ile sözleşmeye
    ayrı bir dal açılması bekleniyordu. Ölçüldü, öyle değilmiş: veritabanının koşulu gelen isteğin
    bir AKIBET taşımasını şart koşuyor (`0020_order_return.sql:127` —
    `v_disposition is not null and v_disposition <> v_existing`), kurye ise akıbeti hiç göndermiyor.
    Yani ret kurye kapısında hiç tetiklenmiyordu; "kuryeye yanlış sebep söyleniyor" teşhisi
    yanlıştı.

    Gerçek açık ŞEMADAYDI: `ConfirmDoorDeliveryRequestSchema.adjustments` ortak kalem şeklini
    olduğu gibi taşıyor ve akıbet alanına kapı açık bırakıyordu — yani sözleşme, şeridin kuralından
    fazlasına izin veriyordu. Alan `omit` ile çıkarıldı; artık kurye isteği akıbet TAŞIYAMIYOR ve
    bu dal ulaşılamaz.

    Dal yine de SİLİNMEDİ: `deliverOrderWithAdjustments` paylaşılan bir kapı ve depo yolu o cevabı
    üretiyor, yani tip birleşimi onu taşımaya devam ediyor. Ulaşılamayan bir dalı sessizce düşürmek,
    tip bir gün genişlediğinde cevabı kaybetmek olurdu. En yakın doğru cevap `stale`: kapı hiçbir
    şey YAZMADI ve durak hâlâ yolda.
  */
  if (written.status === 'already_marked') {
    return { status: 'stale', currentStatus: 'out_for_delivery' };
  }

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
      adjustedLines: written.adjustedLines,
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
    // Sistemin yazdığı satır: kurye kapıda onaylar, deftere yazan teslim akışıdır.
    source: 'system',
  });
  if (paid.status !== 'ok') return { status: 'not_found' };

  return {
    status: 'ok',
    collectedCents: input.collection.amountCents,
    amountDueCents: paid.derivation.amountToCollectCents,
    paymentStatus: paid.paymentStatus,
    cashLimitExceeded,
    adjustedLines: written.adjustedLines,
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

/** Nakit yasal sınırı (cent) — ayardan; kodda sabit yok (CLAUDE.md §4). Gel-al tezgâhı da aynı sınırı okur. */
export function cashLegalLimitCents(db: SupabaseClient): Promise<number> {
  return new SettingsService(db).getNumber('cash_legal_limit_cents', 100_000);
}

/**
 * Siparişe yazılan kanıt (ne, kim, ne zaman): "eksik geldi" ihtilafının tek sigortası.
 * Şekil `packages/types`tan gelir, çünkü elle yazıldığında okuyan ekran başka alan adları arıyor ve hata vermiyordu.
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
 * Görselsiz kanıt: kapıda okutulan kodlar; yalnız kutulu siparişin görselsiz tesliminde doğar, görselli kanıt varken kodlar onun içine yazılır.
 * Gel-al tezgâhı da bu kaydı yazar; `courierId` orada teslim eden depocudur.
 */
export function boxScanRecord(boxCodes: string[], courierId: string): DeliveryProofRecord {
  return {
    kind: 'box_scan',
    imageKey: null,
    receivedBy: null,
    courierId,
    at: new Date().toISOString(),
    boxCodes,
  };
}
