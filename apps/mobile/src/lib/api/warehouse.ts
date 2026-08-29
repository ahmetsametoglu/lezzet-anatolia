import type { z } from 'zod';
import {
  BoxLabelResponseSchema,
  ConfirmPreparationResponseSchema,
  InboundTransfersResponseSchema,
  IntakeFormResponseSchema,
  LearnCodeResponseSchema,
  MarkBoxPrintedResponseSchema,
  OpenBoxResponseSchema,
  PendingIntakesResponseSchema,
  PreparationQueueResponseSchema,
  ReceiveGoodsResponseSchema,
  ReceiveTransferResponseSchema,
  RecordAdjustmentResponseSchema,
  ResolveCodeResponseSchema,
  AnnounceShipmentResponseSchema,
  DispatchOptionsResponseSchema,
  HandoverResponseSchema,
  SealBoxResponseSchema,
  ShippingBoxesResponseSchema,
  VariantSearchResponseSchema,
  WarehouseReturnResponseSchema,
  type ConfirmPreparationRequest,
  type LearnCodeRequest,
  type RecordAdjustmentRequest,
  type ReceiveGoodsRequest,
  type ReceiveTransferRequest,
  type AnnounceShipmentRequest,
  type SealBoxRequest,
  type WarehouseReturnRequest,
} from '@lezzet/types';

import { authorizedFetch } from '../auth/authorized-fetch';
import type { ApiResult } from './client';

/*
  DEPO UÇLARI — `/api/v1/warehouse/*` (21.11).

  ŞEMA BURADA YAZILMAZ: gövde sözleşmesi `@lezzet/types`ın (`contracts/warehouse-api.schema.ts`) ve
  uç DA aynı şemayla üretiyor (02-mimari §3.2 "sözleşme tek kaynak") — alan adı değişirse üreten ve
  tüketen aynı anda derlemede kırılır. Kurye emsali (`lib/api/courier.ts`) ile aynı düzen.

  HEPSİ KORUNAN ÇAĞRI (`authorizedFetch`): uçlar Bearer'ın arkasında, ayrıca `warehouse|admin` rol
  kapısı ve bir de DEPO kapısı var (aşağıda).

  ── DEPO KİMLİĞİ GÖVDEDE DE SORGUDA DA YOK, VE BU BİR KARAR ─────────────────
  Uç künyesi (`apps/mobile-api/src/api/v1/warehouse.ts`) kuralı tek cümleyle yazıyor: *"kapsamda tek
  depo varsa o, değilse söylenmeli."* Depocunun kapsamı veritabanı kısıtı gereği EN AZ bir depodur
  (`0031_warehouse.sql:151`) ve günlük hâli TAM BİR depodur — yani bu istemci hiçbir isteğe
  `?warehouseId=` yazmaz ve yazamaz da: parametreyi doldurabileceği bir kaynak YOK (`/me` sözleşmesi
  `warehouseIds`i bilerek dışarıda bırakıyor — `me-api.schema.ts`).

  Kapsamı tek olmayan kullanıcı (yalnız `admin`) `400 warehouse_required` alır ve bu bir arıza DEĞİL,
  ekranın göstereceği bir cevaptır — `screens/warehouse/warehouse-status.ts` onu okur. Buraya
  uydurma bir parametre koymak ya da ilk depoyu seçmek, yetkilendirmeyi doğrulanmamış bir tahmine
  dayandırmak olurdu (CLAUDE.md §1: varsayılan depo YOKTUR).

  ── OLUMSUZ SONUÇ BİR HATA DEĞİL, CEVABIN KENDİSİDİR ────────────────────────
  `pinned_violation` · `incomplete` · `stale` · `failed` · `forbidden` · `not_found` · `empty` uçtan
  **200** ile ve GÖVDEDE gelir. Yani bu dosyanın `ApiResult`u BAŞARI döner ve kararı ekran okur;
  hiçbiri burada hataya çevrilmez — çevirseydik taşıdıkları bilgi (hangi satır sayılmadı, hangi parti
  başka deponun, hangi kalem hangi partiye çıpalı) tek bir anahtara indirgenip kaybolurdu.

  Telin gerçek hataları (401 · 400 biçimsiz gövde · 400 `warehouse_required` · 500 · ağ) `ApiFail`.

  ── AÇILMAYAN İKİ KAPI ──────────────────────────────────────────────────────
  Sevk (`dispatch`) ve sevkin geri alınması (`cancel`) uçta BİLİNÇLİ olarak yok (uç künyesi): v2'nin
  D5 ekranı rampada SAYIM ekranıdır, sevk kurgusu barındırmaz. Burada da yok — çağıranı olmayan bir
  istemci fonksiyonu, ilk günden ölü koddur.
*/

/** **Hazırlama kuyruğu** (D1). Gün SÜZGEÇTİR: verilmezse deponun bekleyen HER siparişi gelir. */
export function fetchPreparationQueue(): Promise<ApiResult<z.infer<typeof PreparationQueueResponseSchema>>> {
  return authorizedFetch('/api/v1/warehouse/preparation', PreparationQueueResponseSchema);
}

/**
 * **Hazırlık onayı** (D1). Yarım iş HATA DEĞİL: `ok` + `ready:false` "sipariş `preparing`te sürüyor"
 * demektir ve ekran kaldığı yerden devam eder.
 */
export function confirmPreparation(
  orderId: string,
  body: ConfirmPreparationRequest,
): Promise<ApiResult<z.infer<typeof ConfirmPreparationResponseSchema>>> {
  return authorizedFetch(`/api/v1/warehouse/preparation/${orderId}/confirm`, ConfirmPreparationResponseSchema, {
    method: 'POST',
    body,
  });
}

/**
 * **Deponun kargo kutusu tipleri** (07.12) — kutu açılırken sorulan listenin kaynağı.
 *
 * Yalnız açık tipler ve yalnız bu deponunkiler gelir; süzgeç sunucuda (uç künyesi). Liste
 * ekranda ÖNCEDEN okunur: seçim anında ağ turu beklemek, depocuyu kartonu elinde tutarken
 * bekletirdi.
 */
export function fetchShippingBoxes(): Promise<ApiResult<z.infer<typeof ShippingBoxesResponseSchema>>> {
  return authorizedFetch('/api/v1/warehouse/shipping-boxes', ShippingBoxesResponseSchema);
}

/**
 * **Kutu açar** (23.6 · karar §1.4). İçerik doğumda yoktur, numara/kod sunucudan gelir; gövdedeki
 * tek alan kutunun FİZİKSEL KİMLİĞİDİR (`shippingBoxId`, 07.12) — gönderi ağırlığı ondan çıkıyor.
 * `null` = tip sorulmadı (rota kulvarı ya da deponun benimsediği kutu yok).
 */
export function openOrderBox(
  orderId: string,
  shippingBoxId: string | null = null,
): Promise<ApiResult<z.infer<typeof OpenBoxResponseSchema>>> {
  return authorizedFetch(`/api/v1/warehouse/orders/${orderId}/boxes`, OpenBoxResponseSchema, {
    method: 'POST',
    body: { shippingBoxId },
  });
}

/**
 * **Kutuyu kapatır** (23.6). `picks` BU kutunun dağılımıdır (kümülatif değil) — çok kutulu
 * birleşimi sunucu kurar (`sealBox` ⚠ künyesi); ekran kurmaya kalksaydı yarım işte eski dağılımı
 * bilmek zorunda kalırdı. `declareShort` = "bu kutu son, eksikleri bildiriyorum".
 */
export function sealOrderBox(
  boxId: string,
  body: SealBoxRequest,
): Promise<ApiResult<z.infer<typeof SealBoxResponseSchema>>> {
  return authorizedFetch(`/api/v1/warehouse/boxes/${boxId}/seal`, SealBoxResponseSchema, { method: 'POST', body });
}

/** **Etiket içeriği** (23.7) — önizleme + basım girdisi; yazıcı ayarı da bu cevapta gelir. */
export function fetchBoxLabel(boxId: string): Promise<ApiResult<z.infer<typeof BoxLabelResponseSchema>>> {
  return authorizedFetch(`/api/v1/warehouse/boxes/${boxId}/label`, BoxLabelResponseSchema);
}

/** **Basım damgası** (23.7) — SDK "bastı" deyince çağrılır; damga başarının kaydıdır, niyetin değil. */
export function markBoxPrinted(boxId: string): Promise<ApiResult<z.infer<typeof MarkBoxPrintedResponseSchema>>> {
  return authorizedFetch(`/api/v1/warehouse/boxes/${boxId}/printed`, MarkBoxPrintedResponseSchema, { method: 'POST' });
}

/**
 * **"Hangi sevkiyatı bekliyorum"** (D2'nin konusuz açılışı) — uç 21.11d'den beri vardı, ekran
 * bunu 24.08'e kadar okumuyordu ve mal kabule YALNIZ derin bağlantıyla girilebiliyordu. Sipariş
 * kimliği her `db:refresh`te değiştiği için o yol her tazelemede kırılıyordu (ölçüldü 24.08:
 * elimdeki kimlik öldü, form "açık kalemi yok" dedi ve sebebi kimliğin bayatlığıydı).
 */
export function fetchPendingIntakes(): Promise<ApiResult<z.infer<typeof PendingIntakesResponseSchema>>> {
  return authorizedFetch('/api/v1/warehouse/intake', PendingIntakesResponseSchema);
}

/**
 * **Plansız kabulün ürün araması** (23.13). Boş sorgu boş liste döner — ekran her tuşta çağırır ve
 * "henüz yazmadın" bir hata değil.
 */
export function searchIntakeVariants(query: string): Promise<ApiResult<z.infer<typeof VariantSearchResponseSchema>>> {
  return authorizedFetch(`/api/v1/warehouse/variants?q=${encodeURIComponent(query)}`, VariantSearchResponseSchema);
}

/** **Tedarik siparişinden dolu kabul formu** (D2). Boş dizi = plansız alım (form elle doldurulur). */
export function fetchIntakeForm(
  purchaseOrderId: string,
): Promise<ApiResult<z.infer<typeof IntakeFormResponseSchema>>> {
  return authorizedFetch(`/api/v1/warehouse/intake/${purchaseOrderId}`, IntakeFormResponseSchema);
}

/**
 * **Mal kabul** (D2). `purchaseOrderId` verilirse PO'lu kabul (fark raporu üretilir), verilmezse
 * PLANSIZ kabul — iki AYRI adres, çünkü "siparişsiz" hâli aynı yola boş bir kimlikle girmek olurdu.
 *
 * Gövdede maliyet alanı YOKTUR ve bu şemanın değil KAPININ kararı: depo yolu fiyat gönderemez (09.14).
 */
export function receiveGoods(
  purchaseOrderId: string | null,
  body: Omit<ReceiveGoodsRequest, 'purchaseOrderId'>,
): Promise<ApiResult<z.infer<typeof ReceiveGoodsResponseSchema>>> {
  const path =
    purchaseOrderId === null
      ? '/api/v1/warehouse/intake/receive'
      : `/api/v1/warehouse/intake/${purchaseOrderId}/receive`;
  return authorizedFetch(path, ReceiveGoodsResponseSchema, { method: 'POST', body });
}

/**
 * **İmha / sayım kaydı** (D4). Bütün satırlar tek transaction'da yazılır ve tek OLAY belgesini
 * paylaşır; numarayı (`result.referenceNo`) DB üretir — istemci onu ÖNCEDEN bilemez.
 */
export function recordAdjustment(
  body: RecordAdjustmentRequest,
): Promise<ApiResult<z.infer<typeof RecordAdjustmentResponseSchema>>> {
  return authorizedFetch('/api/v1/warehouse/adjustments', RecordAdjustmentResponseSchema, { method: 'POST', body });
}

/** **"Bana ne geliyor"** (D5) — bu depoya yolda olan transferler, satırlarıyla. Sayfalanmaz. */
export function fetchInboundTransfers(): Promise<ApiResult<z.infer<typeof InboundTransfersResponseSchema>>> {
  return authorizedFetch('/api/v1/warehouse/transfers', InboundTransfersResponseSchema);
}

/**
 * **Transfer kabulü** (D5) — rampada sayım. Sayılmamış satır varsa kapı `incomplete` döner ve HANGİ
 * satırların eksik olduğunu söyler; `0` ise geçerli bir beyandır ("geldi ama kayıp").
 */
export function receiveTransfer(
  transferId: string,
  body: ReceiveTransferRequest,
): Promise<ApiResult<z.infer<typeof ReceiveTransferResponseSchema>>> {
  return authorizedFetch(`/api/v1/warehouse/transfers/${transferId}/receive`, ReceiveTransferResponseSchema, {
    method: 'POST',
    body,
  });
}

/**
 * **Okutulan kodun çözümü** (Modül 23) — TEK tarama sözleşmesi: mal kabul, toplama, transfer ve
 * tezgâh aynı ucu çağırır. Kimlik bulur, stok/depo kararı VERMEZ. `unknown` bir hata değil ÖĞRENME
 * davetidir — ekran "bu kod hangi ürün?" diye sorar ve cevabı `learnScannedCode` ile yazar.
 */
export function resolveScannedCode(code: string): Promise<ApiResult<z.infer<typeof ResolveCodeResponseSchema>>> {
  return authorizedFetch('/api/v1/warehouse/codes/resolve', ResolveCodeResponseSchema, {
    method: 'POST',
    body: { code },
  });
}

/**
 * **Öğrenen eşleme** (karar §1.3): tanınmayan kod bir varyanta bağlanır, ikinci gelişte tanınır.
 * `already_bound` cevabın kendisidir — kod başka varyanta bağlıysa ekran kime bağlı olduğunu
 * söyler; düzeltme web varyant editöründen (sil + yeniden öğret).
 */
export function learnScannedCode(body: LearnCodeRequest): Promise<ApiResult<z.infer<typeof LearnCodeResponseSchema>>> {
  return authorizedFetch('/api/v1/warehouse/codes', LearnCodeResponseSchema, { method: 'POST', body });
}

/**
 * **Kurye dönüşü kabulü** (D6). Miktar HEDEF değerdir (kalan adet), fark değil — çıkarma sistemde
 * yapılır (sözleşme künyesi). Cevabın para alanları depocuya GÖSTERİLMEZ; çağıranın (yönetim) işi.
 */
export function submitWarehouseReturn(
  orderId: string,
  body: WarehouseReturnRequest,
): Promise<ApiResult<z.infer<typeof WarehouseReturnResponseSchema>>> {
  return authorizedFetch(`/api/v1/warehouse/returns/${orderId}`, WarehouseReturnResponseSchema, {
    method: 'POST',
    body,
  });
}

/**
 * **SEVK SEÇENEKLERİ** (07.12) — depocunun servis seçtiği liste, GERÇEK kolilere göre fiyatlı.
 *
 * Salt okuma, para harcamaz. Ön koşullar duyurunun kullandığı kapıdan geçiyor, yani burada
 * görünen seçenek satın alma anında da geçerli.
 */
export function fetchDispatchOptions(orderId: string): Promise<ApiResult<z.infer<typeof DispatchOptionsResponseSchema>>> {
  return authorizedFetch(`/api/v1/warehouse/orders/${orderId}/dispatch-options`, DispatchOptionsResponseSchema);
}

/**
 * **GÖNDERİYİ DUYUR — GERÇEK PARA HARCAR.** Yeniden deneme YOK: sağlayıcıda idempotency anahtarı
 * yok ve ikinci çağrı ikinci koli açar. `already_announced` bu yüzden bir hata değil cevaptır.
 */
export function announceShipment(
  orderId: string,
  body: AnnounceShipmentRequest,
): Promise<ApiResult<z.infer<typeof AnnounceShipmentResponseSchema>>> {
  return authorizedFetch(`/api/v1/warehouse/orders/${orderId}/announce`, AnnounceShipmentResponseSchema, {
    method: 'POST',
    body,
  });
}

/**
 * **DEVİR OKUTMASI** (07.12) — kutu taşıyıcıya verildi.
 *
 * Kod ya taşıyıcının takip numarası ya bizim kutu kodumuz; hangisi olduğunu SUNUCU çözüyor.
 * `already_handed` bir hata değil cevaptır — depocu rampada aynı kutuyu iki kez okutabilir.
 */
export function handOverBox(code: string): Promise<ApiResult<z.infer<typeof HandoverResponseSchema>>> {
  return authorizedFetch('/api/v1/warehouse/handover', HandoverResponseSchema, { method: 'POST', body: { code } });
}
