import type { ShipmentStatus } from '@lezzet/types';

/**
 * TAŞIYICI DURUM KODU → BİZİM DURUMUMUZ (saf karar).
 *
 * ── TABLO SEZGİSEL DEĞİL, ÖLÇÜLMÜŞTÜR (28.08) ───────────────────────────────
 * İlk yazımda "kamuya açık kod listesi yok" varsayılmış ve eşleme metin içi arama (`includes`)
 * ile kurulmuştu. **Yanlıştı:** `GET /api/v3/parcels/statuses` taksonominin tamamını veriyor
 * (canlı ölçüm: HTTP 200, **35 kod**). Sezgisel tablo o 35 koda karşı koşturuldu ve tam olarak
 * şunlar çıktı — hepsi sessiz arızaydı, çünkü her biri makul görünen bir cevap üretiyordu:
 *
 * | ölçülen kod | sezginin dediği | GERÇEK | sonuç |
 * |---|---|---|---|
 * | `CANCELLATION_FAILED` | `cancelled` | `error` | **ters**: iptal EDİLEMEDİ, koli canlı — biz kapatıp izlemeyi bırakırdık |
 * | `COLLECTED_BY_CUSTOMER` | `handed_over` | `delivered` | teslim noktasından alınan sipariş sonsuza dek "yolda" kalırdı |
 * | `ANNOUNCED_UNCOLLECTED` | `handed_over` | `created` | taşıyıcı hiç almamışken "taşıyıcıda" derdik |
 * | `ANNOUNCEMENT_FAILED` | `created` | `error` | bildirim düşmüşken "etiket hazır" derdik |
 * | `SHIPMENT_ON_ROUTE` · `DRIVER_ON_ROUTE` | — tanınmadı | `out_for_delivery` | **sipariş `out_for_delivery`ye HİÇ geçemezdi** |
 * | `REFUSED_BY_RECIPIENT` | — tanınmadı | `returned` | ret görünmezdi |
 * | `UNDELIVERABLE` · `ADDRESS_INVALID` | — tanınmadı | `error` | müdahale isteyen hâl sessiz kalırdı |
 *
 * Kalıp aramanın kendisi kusurluydu: `CANCELLATION_FAILED` içinde "CANCEL" geçiyor, ama kod
 * iptalin OLMADIĞINI söylüyor. Bir kodun anlamı harflerinde değil, taksonomisindedir.
 *
 * ── ÜÇ CEVAP VAR, İKİ DEĞİL ─────────────────────────────────────────────────
 * `null` tek başına iki ayrı şeyi anlatamıyordu ve karıştırılmaları alarmı çürütürdü:
 * - **`status`** — kod tanınıyor ve gönderiyi taşıyor.
 * - **`informational`** — kod tanınıyor ama durumu DEĞİŞTİRMEZ ("teslim adresi değişti", "iptal
 *   sürüyor"). Deftere yazılır, durum korunur, **alarma girmez**.
 * - **`unknown`** — kodu bilmiyoruz. Deftere yazılır, durum korunur ve **sayılır**: eşleme
 *   tablosunun büyüme sinyali budur. Bilgi olayları da buraya düşseydi her adres değişikliği
 *   alarmı şişirir, hep açık duran bir alarm da alarm olmaktan çıkardı.
 *
 * Bilinmeyen kodda mevcut durum KORUNUR (`CLAUDE §1`: ölçülemeyen değer sıfır değildir). Tahmin
 * eden bir eşleme siparişi yanlış yere taşır — "teslim edildi" diye işaretlenen gönderi kâr
 * snapshot'ı alır, müşteriye teslim maili gider ve geri alınması elle düzeltme ister.
 */

/** `informational` = kod tanınıyor ama gönderinin yerini değiştirmiyor. */
const INFORMATIONAL = 'informational' as const;

/**
 * Ölçülen taksonominin TAMAMI (35 kod, `GET /api/v3/parcels/statuses` — 28.08).
 *
 * Listeyi eksiksiz yazmak bilinçli: bir kod burada YOKSA cevabımız "bilmiyorum" olmalı, "kalıba
 * benziyor" değil. Sağlayıcı yeni kod eklediğinde tablo eksik kalır — ve eksikliği `unknown`
 * sayacı söyler.
 */
const CODES: Readonly<Record<string, ShipmentStatus | typeof INFORMATIONAL>> = {
  // ── Bizde / etikette: taşıyıcı henüz almadı ────────────────────────────────
  READY_TO_SEND: 'created',
  ANNOUNCED: 'created',
  ANNOUNCING: 'created',
  // Bildirildi ama taşıyıcı HİÇ almadı — koli hâlâ bizde. "Taşıyıcıda" demek yanlış olurdu.
  ANNOUNCED_UNCOLLECTED: 'created',

  // ── Taşıyıcı aldı ─────────────────────────────────────────────────────────
  PICKED_UP_BY_DRIVER: 'handed_over',

  // ── Ağda ──────────────────────────────────────────────────────────────────
  TO_SORTING: 'in_transit',
  SORTING: 'in_transit',
  SORTED: 'in_transit',
  UNSORTED: 'in_transit',
  AT_SORTING_CENTRE: 'in_transit',
  AT_CUSTOMS: 'in_transit',
  // Gecikme bir arıza değil, yavaş bir yolculuktur: koli ilerlemeye devam ediyor.
  DELAYED: 'in_transit',

  // ── Alıcıya doğru ─────────────────────────────────────────────────────────
  SHIPMENT_ON_ROUTE: 'out_for_delivery',
  DRIVER_ON_ROUTE: 'out_for_delivery',
  // Teslim noktasında BEKLİYOR — henüz teslim DEĞİL. Teslim, müşteri alınca olur
  // (`COLLECTED_BY_CUSTOMER`).
  AWAITING_CUSTOMER_PICKUP: 'out_for_delivery',
  /*
    Başarısız teslim denemesi `error` DEĞİL: taşıyıcı kendiliğinden yeniden dener ya da teslim
    noktasına yönlendirir — koli akışın içindedir. Sınır şurada çiziliyor: **kendiliğinden
    ilerleyen hâller akışta kalır, MÜDAHALE isteyenler `error` olur** (`UNDELIVERABLE`,
    `ADDRESS_INVALID`). `error` demek operatörü her başarısız denemede masaya çağırmak olurdu;
    ham kod zaten deftere yazılıyor ve zaman çizgisinde görünüyor.
  */
  DELIVERY_FAILED: 'out_for_delivery',

  // ── Terminal: gitti ───────────────────────────────────────────────────────
  DELIVERED: 'delivered',
  // Teslim noktasından müşteri aldı = TESLİM. Sezgisel tablo bunu "taşıyıcı topladı" sanıyordu.
  COLLECTED_BY_CUSTOMER: 'delivered',

  // ── Terminal: geri dönüyor ────────────────────────────────────────────────
  RETURNED_TO_SENDER: 'returned',
  REFUSED_BY_RECIPIENT: 'returned',

  // ── Terminal: iptal ───────────────────────────────────────────────────────
  CANCELLED: 'cancelled',
  CANCELLED_UPSTREAM: 'cancelled',

  // ── Müdahale gerekiyor ────────────────────────────────────────────────────
  NO_LABEL: 'error',
  ANNOUNCEMENT_FAILED: 'error',
  COLLECT_ERROR: 'error',
  UNDELIVERABLE: 'error',
  ADDRESS_INVALID: 'error',
  // İptal İSTENDİ ama OLMADI: koli canlı ve yola devam ediyor. `cancelled` demek koliyi
  // defterden düşürüp izlemeyi bırakmak olurdu — sezgisel tablonun en tehlikeli hatası buydu.
  CANCELLATION_FAILED: 'error',
  EXCEPTION: 'error',

  // ── Tanınıyor, ama gönderinin YERİNİ söylemiyor ───────────────────────────
  // İptal SÜRÜYOR; sonucu `CANCELLED` ya da `CANCELLATION_FAILED` söyleyecek. Şimdiden iptal
  // saymak, olmamış bir sonucu yazmak olurdu.
  CANCELLING: INFORMATIONAL,
  CANCELLING_UPSTREAM: INFORMATIONAL,
  DELIVERY_METHOD_CHANGED: INFORMATIONAL,
  DELIVERY_DATE_CHANGED: INFORMATIONAL,
  DELIVERY_ADDRESS_CHANGED: INFORMATIONAL,
  // Sağlayıcının kendi "bilmiyorum"u — bizim tablomuzun eksikliği DEĞİL, o yüzden sayılmaz.
  UNKNOWN: INFORMATIONAL,
};

export type CarrierStatusVerdict =
  /** Kod tanınıyor ve gönderiyi bu duruma taşıyor. */
  | { kind: 'status'; status: ShipmentStatus }
  /** Kod tanınıyor ama durumu değiştirmiyor — deftere yazılır, alarma girmez. */
  | { kind: 'informational' }
  /** Kod tablomuzda yok — deftere yazılır, durum korunur ve SAYILIR (tablo büyümeli). */
  | { kind: 'unknown' };

export function classifyCarrierStatus(code: string | null | undefined): CarrierStatusVerdict {
  if (!code) return { kind: 'unknown' };
  // Büyük harfe çevirme tek esneklik: sağlayıcı kodu `READY_TO_SEND` diye veriyor ama gövde
  // biçimi sürümler arasında oynayabiliyor. Kalıp araması YOK — anlamı harfler taşımıyor.
  const hit = CODES[code.trim().toUpperCase()];
  if (hit === undefined) return { kind: 'unknown' };
  return hit === INFORMATIONAL ? { kind: 'informational' } : { kind: 'status', status: hit };
}

/** Terminal hâl mi — nöbet cron'u yalnız terminal OLMAYAN gönderileri yoklar. */
export function isTerminalShipmentStatus(status: ShipmentStatus): boolean {
  return status === 'delivered' || status === 'returned' || status === 'cancelled';
}

/** Akışın ilerleme sırası. `returned`/`cancelled`/`error` bu sıranın DIŞINDADIR — aşama değil, sapma. */
const PROGRESS: readonly ShipmentStatus[] = ['created', 'handed_over', 'in_transit', 'out_for_delivery', 'delivered'];

/**
 * **ÇOK KOLİLİ GÖNDERİNİN TEK DURUMU** — koli durumlarından gönderinin durumu.
 *
 * Kural tek cümle: **gönderi, EN GERİDEKİ kolisi kadar ilerlemiştir.** Üç kolinin ikisi teslim,
 * biri yoldaysa sipariş teslim edilmemiştir; tersini yazmak müşteriye eksik gönderiyi "tamam"
 * diye göstermek olurdu (tasarım kaydı §8.1: *"çok kutuluda tüm kutular teslim olmadan sipariş
 * kapanmaz"*).
 *
 * Sapmalar sıranın dışında olduğu için önce onlar sorulur:
 * - **herhangi biri `returned`** → gönderi `returned`. Geri dönen bir koli, teslim edilenlerin
 *   yanında görünmez kalmamalı.
 * - **herhangi biri `error`** → gönderi `error`. Müdahale isteyen hâl bastırılmaz.
 * - **hepsi `cancelled`** → `cancelled`. **Bir kısmı** iptalse `error`: yarısı iptal yarısı yolda
 *   olan gönderi ne iptaldir ne normaldir, ve bu ayrımı bir insan yapmalıdır.
 *
 * **ÖLÇÜLEMEYEN KOLİ, TESLİM EDİLMİŞ KOLİ DEĞİLDİR** (`CLAUDE §1`): bir kolinin durumu
 * okunamadıysa gönderi TERMİNALE taşınamaz — `null` döner ve çağıran mevcut durumu korur. Aksi
 * hâlde okunamayan tek koli, "hepsi teslim" diye kapanan bir siparişin içinde kaybolurdu.
 */
export function aggregateShipmentStatus(parcels: readonly (ShipmentStatus | null)[]): ShipmentStatus | null {
  const known = parcels.filter((s): s is ShipmentStatus => s !== null);
  if (known.length === 0) return null;

  if (known.includes('returned')) return 'returned';
  if (known.includes('error')) return 'error';

  const cancelled = known.filter((s) => s === 'cancelled').length;
  if (cancelled > 0) {
    // Hepsi iptal VE ölçülemeyen koli yok → gönderi gerçekten iptal.
    if (cancelled === known.length && known.length === parcels.length) return 'cancelled';
    return 'error'; // karışık hâl — insan bakmalı
  }

  const rank = Math.min(...known.map((s) => PROGRESS.indexOf(s)));
  const min = PROGRESS[rank]!;
  // Eksik ölçüm varken terminale geçilmez; en geri bilinen aşama zaten `delivered` ise cevabımız
  // "bilmiyorum"dur.
  if (known.length < parcels.length && min === 'delivered') return null;
  return min;
}
