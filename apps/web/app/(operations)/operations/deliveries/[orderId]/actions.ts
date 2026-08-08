'use server';

import { revalidatePath } from 'next/cache';
import { OrderService, serviceDb } from '@lezzet/database';
import type { FulfillmentAdjustment } from '@lezzet/types';
import { markUndelivered } from '@/lib/courier/day';
import { confirmDoorDelivery, type DeliveryProofInput, type DoorCollectionInput } from '@/lib/courier/delivery';
import { requestDeliveryProofUploadUrl } from '@/lib/courier/proof';
import { transitionOrder } from '@/lib/order/transition';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { requireCourier } from '@/lib/guard';

// Kapıdaki üç yazma yolu (11.2/11.3/11.4) — 'use server' + guard ilk + kapıya devret +
// `{ data, error }` döner (throw yok).
//
// **Hiçbiri kural yazmıyor.** Sıra (kanıt → mal → teslim → para), stok sonucu ve tutar türetimi
// kapıların içinde; buradaki üç fonksiyon yalnız kuryenin kim olduğunu söyleyip cevabı Türkçeye
// çeviriyor. Ekranın kararı sandığı her satır bir gün kapıyla ayrışırdı.

const DAY_PATH = '/operations/deliveries';

/** Her yazımdan sonra hem gün listesi hem durak tazelenir: ikisi de aynı gerçeği gösteriyor. */
function refresh(orderId: string): void {
  revalidatePath(DAY_PATH);
  revalidatePath(`${DAY_PATH}/${orderId}`);
}

/**
 * **Yola çıktım** — `ready → out_for_delivery`.
 *
 * Neden kuryenin ekranında: teslim de, ulaşılamadı da, reddedildi de YOLDAKİ siparişten olur
 * (`0016_deliver_order`: "teslim yalnız yoldaki siparişten olur"). Bu işaret konmadan kapıdaki
 * hiçbir sonuç yazılamaz. Sevkiyatçı gün planından toplu işaretleyecek (09.15) ama o ekranın kapısı
 * henüz yok; kuryenin kendi eliyle söylemesi bugün TEK çalışan yol ve sahada da doğru olan —
 * "araca yükledim, çıkıyorum" diyen kuryedir.
 *
 * Sevkiyatçı dalı gelince bu düğme zararsız kalır: zaten yoldaki sipariş `same_status` döner.
 */
export async function startDeliveryAction(orderId: string): Promise<ActionResult<{ started: true }>> {
  try {
    const courier = await requireCourier();
    await assertOwnStop(orderId, courier.id);

    const result = await transitionOrder({ orderId, to: 'out_for_delivery', actorId: courier.id });
    if (result.status === 'not_found') throw new Error('Sipariş bulunamadı.');
    if (result.status === 'forbidden') throw new Error(FORBIDDEN[result.reason]);
    if (result.status === 'stale') throw new Error(`Sipariş artık "${result.currentStatus}" durumunda — listeyi tazeleyin.`);

    refresh(orderId);
    return { data: { started: true }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * **Kanıt için imzalı yükleme izni** (11.2).
 *
 * Dosya SUNUCUDAN GEÇMEZ: tarayıcı doğrudan R2'ye yükler, buradan çıkan tek şey kısa ömürlü bir
 * izin. Sunucu üzerinden geçirmek fotoğrafı iki kez taşımak ve Next'in gövde sınırıyla boğuşmak
 * olurdu (kapının kendi künyesi).
 *
 * **Anahtarı istemci seçmez** — kapı kendi kurar. Seçseydi gelen yolu doğrulamak zorunda kalırdık
 * ve o doğrulamanın unutulduğu gün private kovanın herhangi bir yerine yazma izni verilirdi.
 */
export async function requestProofUploadAction(
  orderId: string,
  filename: string,
  alreadyRequested: number,
): Promise<ActionResult<{ key: string; uploadUrl: string }>> {
  try {
    const courier = await requireCourier();
    const result = await requestDeliveryProofUploadUrl({ orderId, courierId: courier.id, filename, alreadyRequested });
    if (!result.ok) throw new Error(UPLOAD_REFUSAL[result.reason]);
    return { data: { key: result.key, uploadUrl: result.uploadUrl }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

interface DoorDeliveryResult {
  /** Fiilen yazılan tahsilat (**cent**). */
  collectedCents: number;
  /** Teslim sonrası açık kalan borç (**cent**) — kısmi ödemede ya da hiç tahsilat yokken pozitif. */
  amountDueCents: number;
  /** Nakit yasal eşiği aşıldı mı. Teslim TAMAMLANDI; bu bir bilgidir, bir ret değil (DOMAIN §7). */
  cashLimitExceeded: boolean;
  /** Eksik/reddedilen işaretlenen satır sayısı. */
  adjustedLines: number;
}

/**
 * **Teslim ettim** — eksik kalem + tahsilat tek çağrıda (11.2 + 11.3).
 *
 * İkisi ayrı düğme olsaydı arada yarım kalan bir teslimat doğardı: mal düşmüş ama para yazılmamış
 * ya da tersi. Kapı sırayı kendi içinde tutuyor, ekran da tek karar olarak soruyor.
 */
export async function confirmDeliveryAction(
  orderId: string,
  input: {
    adjustments: FulfillmentAdjustment[];
    collection: DoorCollectionInput | null;
    proof: DeliveryProofInput | null;
  },
): Promise<ActionResult<DoorDeliveryResult>> {
  try {
    const courier = await requireCourier();

    const result = await confirmDoorDelivery({
      orderId,
      courierId: courier.id,
      adjustments: input.adjustments,
      collection: input.collection,
      proof: input.proof,
    });

    if (result.status === 'not_found') throw new Error('Sipariş bulunamadı.');
    if (result.status === 'forbidden') throw new Error(FORBIDDEN.not_assigned);
    if (result.status === 'stale') {
      throw new Error(`Sipariş artık "${result.currentStatus}" durumunda — bu durak başkası tarafından kapatılmış olabilir.`);
    }
    // Kanıt kapısı: HİÇBİR yazım yapılmadı. Cümle bunu açıkça söylüyor — "olmadı" ile "yarısı oldu"
    // arasındaki farkı kurye kapıda bilmek zorunda.
    if (result.status === 'proof_required') {
      throw new Error('Bu teslimat imza ya da fotoğraf ister; kanıt alınmadan kapanmaz. Hiçbir kayıt yazılmadı.');
    }

    refresh(orderId);
    return {
      data: {
        collectedCents: result.collectedCents,
        amountDueCents: result.amountDueCents,
        cashLimitExceeded: result.cashLimitExceeded,
        adjustedLines: result.adjustedLines,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * **Ulaşılamadı / reddedildi** (11.4) — iki ayrı işaret, iki ayrı akıbet. Tek "teslim edilemedi"
 * düğmesine sıkıştırılmaz: ulaşılamayanın malı araçta ayrılmış kalır, reddedilenin malı depoya
 * döner. Not serbest ve kısa; sebebi standartlaştırmak kuryeyi en yakın seçeneğe iter.
 */
export async function markUndeliveredAction(
  orderId: string,
  outcome: 'unreachable' | 'refused',
  note: string | null,
): Promise<ActionResult<{ outcome: 'unreachable' | 'refused' }>> {
  try {
    const courier = await requireCourier();

    const result = await markUndelivered({ orderId, courierId: courier.id, outcome, note });
    if (result.status === 'not_found') throw new Error('Sipariş bulunamadı.');
    if (result.status === 'forbidden') throw new Error(FORBIDDEN[result.reason]);
    if (result.status === 'stale') throw new Error(`Sipariş artık "${result.currentStatus}" durumunda — listeyi tazeleyin.`);

    refresh(orderId);
    return { data: { outcome: result.outcome }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Motorun ret kodları — kuryenin diline. `not_allowed` en sık görülecek olan: durak henüz yola
 * çıkmamışken kapatılmak istendiğinde gelir, ve cevabı bir hata değil bir YÖNLENDİRMEDİR.
 */
const FORBIDDEN: Record<'not_assigned' | 'same_status' | 'terminal' | 'not_allowed', string> = {
  not_assigned: 'Bu durak size atanmamış.',
  same_status: 'Sipariş zaten bu durumda.',
  terminal: 'Bu sipariş kapanmış; üzerinde değişiklik yapılamaz.',
  not_allowed: 'Bu adım şu an yapılamaz — önce "Yola çıktım" işaretlenmeli.',
};

/**
 * Yükleme kapısının ret kodları — kuryenin diline. `FORBIDDEN`'dan SONRA tanımlı olması şart:
 * modül yüklenirken değerlendiriliyor ve `not_found` ona bakıyor.
 *
 * `storage_unavailable` en tehlikelisi, o yüzden en açık yazılanı: kova yapılandırılmamışken
 * sessizce "oldu" demek kuryeye kanıtı yüklediğini sandırırdı — teslim kanıtsız kapanır ve bunu
 * ancak ihtilaf gününde öğrenirdik.
 *
 * `not_found` kasıtlı olarak "senin değil" ile AYNI cümle: kapı da ikisini ayırmıyor (olmayan bir
 * siparişin varlığı doğrulanmaz), ekran ayırsaydı kapının sakladığını sızdırırdı.
 */
const UPLOAD_REFUSAL: Record<'unsupported_type' | 'too_many' | 'not_found' | 'storage_unavailable', string> = {
  unsupported_type: 'Bu dosya türü kabul edilmiyor — fotoğraf gönderin (jpg, png, webp, heic).',
  too_many: 'Bu teslimat için kanıt sayısı sınırına ulaşıldı.',
  not_found: FORBIDDEN.not_assigned,
  storage_unavailable:
    'Kanıt deposu şu an yapılandırılmamış — yükleme yapılamıyor. Teslim kanıtsız kapatılamaz; operasyonu arayın.',
};

/**
 * Durak gerçekten bu kuryenin mi. `confirmDoorDelivery` ve `markUndelivered` bunu kendileri
 * soruyor; `transitionOrder` genel bir kapı olduğu için sormuyor — o yüzden burada soruluyor.
 */
async function assertOwnStop(orderId: string, courierId: string): Promise<void> {
  const order = await new OrderService(serviceDb()).getById(orderId);
  if (!order) throw new Error('Sipariş bulunamadı.');
  if (order.courierId !== courierId) throw new Error(FORBIDDEN.not_assigned);
}
