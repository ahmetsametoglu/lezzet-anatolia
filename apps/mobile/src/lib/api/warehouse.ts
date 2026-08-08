import type { z } from 'zod';
import {
  ConfirmPreparationResponseSchema,
  InboundTransfersResponseSchema,
  IntakeFormResponseSchema,
  PreparationQueueResponseSchema,
  ReceiveGoodsResponseSchema,
  ReceiveTransferResponseSchema,
  RecordAdjustmentResponseSchema,
  WarehouseReturnResponseSchema,
  type ConfirmPreparationRequest,
  type RecordAdjustmentRequest,
  type ReceiveGoodsRequest,
  type ReceiveTransferRequest,
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
