import type { z } from 'zod';
import {
  BoxLabelResponseSchema,
  ConfirmPreparationResponseSchema,
  IntakeFormResponseSchema,
  LearnCodeResponseSchema,
  MarkBoxPrintedResponseSchema,
  OpenBoxResponseSchema,
  NearExpiryResponseSchema,
  PendingIntakesResponseSchema,
  PreparationQueueResponseSchema,
  ReceiveGoodsResponseSchema,
  ReceiveTransferResponseSchema,
  RecordAdjustmentResponseSchema,
  ResolveBatchResponseSchema,
  ResolveCodeResponseSchema,
  WarehouseBatchesResponseSchema,
  WarehouseTransfersResponseSchema,
  AnnounceShipmentResponseSchema,
  DispatchOptionsResponseSchema,
  HandoverPendingResponseSchema,
  HandoverResponseSchema,
  WarehousePrintersResponseSchema,
  DeclareShortResponseSchema,
  SealBoxResponseSchema,
  UnsealBoxResponseSchema,
  ShippingBoxesResponseSchema,
  VariantSearchResponseSchema,
  WarehouseReturnResponseSchema,
  WarehouseAreasResponseSchema,
  MarkBatchSeenResponseSchema,
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
import { withWarehouseChoice } from '../operations/warehouse-choice';
import type { ApiFetchInit, ApiResult } from './client';

/**
 * **Bu dosyanın TEK çağrı kapısı** — korunan çağrının üstüne deponun seçimini ekler.
 *
 * Sarmalayıcı olması bilinçli, her fonksiyona bir satır koymak DEĞİL: yirmi iki uç var ve biri
 * unutulsaydı o istek personelin seçtiği depoya değil, kapının çözebildiği depoya (ya da hiçbirine
 * — `400 warehouse_required`) giderdi. Sessiz olurdu: liste boş gelir, depocu "bugün iş yok" der.
 * Tek kapı, unutulamayan kapıdır (`trackWarehouse` sarmalayıcısının aynı gerekçesi).
 */
function warehouseFetch<TSchema extends z.ZodTypeAny>(
  path: string,
  schema: TSchema,
  init: ApiFetchInit = {},
): Promise<ApiResult<z.infer<TSchema>>> {
  return authorizedFetch(withWarehouseChoice(path), schema, init);
}

/*
  DEPO UÇLARI — `/api/v1/warehouse/*` (21.11).

  ŞEMA BURADA YAZILMAZ: gövde sözleşmesi `@lezzet/types`ın (`contracts/warehouse-api.schema.ts`) ve
  uç DA aynı şemayla üretiyor (02-mimari §3.2 "sözleşme tek kaynak") — alan adı değişirse üreten ve
  tüketen aynı anda derlemede kırılır. Kurye emsali (`lib/api/courier.ts`) ile aynı düzen.

  HEPSİ KORUNAN ÇAĞRI (`authorizedFetch`): uçlar Bearer'ın arkasında, ayrıca `warehouse|admin` rol
  kapısı ve bir de DEPO kapısı var (aşağıda).

  ── DEPO KİMLİĞİ GÖVDEDE YOK; SORGUDA ise YALNIZ PERSONEL SEÇTİYSE (30.08) ──
  Uç künyesi (`apps/mobile-api/src/api/v1/warehouse.ts`) kuralı tek cümleyle yazıyor: *"kapsamda tek
  depo varsa o, değilse söylenmeli."* Depocunun kapsamı veritabanı kısıtı gereği EN AZ bir depodur
  (`0031_warehouse.sql:151`) ve günlük hâli TAM BİR depodur — o hâlde bu istemci hiçbir şey
  göndermez, kimlik jetondan çözülür. **Değişen tek şey "söylenmeli" dalı:** kapsamı çok olan
  personel artık seçebiliyor (`lib/operations/warehouse-choice.ts`) ve seçim varsa adrese
  `?warehouseId=` olarak yazılıyor.

  ~~"Parametreyi doldurabileceği bir kaynak YOK"~~ — vardı ve açıldı: `/operations/scope`
  personelin depolarını veriyor. Kararın ÖZÜ değişmedi (CLAUDE §1 *varsayılan depo YOKTUR*):
  seçim tahmin edilmiyor, personelin açık eylemi olarak alınıyor ve kapı onu her istekte kapsama
  karşı sınıyor (`403 warehouse_out_of_scope`). Yasak olan şey ilk depoyu kendiliğinden seçmekti;
  o hâlâ yasak.

  Hiç seçim yapmamış ve kapsamı tek olmayan kullanıcı yine `400 warehouse_required` alır ve bu bir
  arıza DEĞİL, ekranın göstereceği bir cevaptır — `screens/warehouse/warehouse-status.ts` onu okur
  ve artık seçiciyi açar.

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

/**
 * **Hazırlama kuyruğu** (D1). Gün SÜZGEÇTİR: verilmezse deponun bekleyen HER siparişi gelir.
 *
 * `scope: 'done'` son tamamlananları getirir (mühürlenmiş ama taşıyıcıya verilmemiş) — aynı uç,
 * aynı gövde; sınırın gerekçesi `listPreparationQueue`ün `PreparationScope` künyesinde.
 */
export function fetchPreparationQueue(
  scope: 'pending' | 'done' = 'pending',
): Promise<ApiResult<z.infer<typeof PreparationQueueResponseSchema>>> {
  const yol = scope === 'done' ? '/api/v1/warehouse/preparation?scope=done' : '/api/v1/warehouse/preparation';
  return warehouseFetch(yol, PreparationQueueResponseSchema);
}

/**
 * **Hazırlık onayı** (D1). Yarım iş HATA DEĞİL: `ok` + `ready:false` "sipariş `preparing`te sürüyor"
 * demektir ve ekran kaldığı yerden devam eder.
 */
export function confirmPreparation(
  orderId: string,
  body: ConfirmPreparationRequest,
): Promise<ApiResult<z.infer<typeof ConfirmPreparationResponseSchema>>> {
  return warehouseFetch(`/api/v1/warehouse/preparation/${orderId}/confirm`, ConfirmPreparationResponseSchema, {
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
  return warehouseFetch('/api/v1/warehouse/shipping-boxes', ShippingBoxesResponseSchema);
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
  return warehouseFetch(`/api/v1/warehouse/orders/${orderId}/boxes`, OpenBoxResponseSchema, {
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
  return warehouseFetch(`/api/v1/warehouse/boxes/${boxId}/seal`, SealBoxResponseSchema, { method: 'POST', body });
}

/**
 * **Siparişi eksik kapat** (31.08) — kutu kapatmadan verilen SİPARİŞ kararı.
 *
 * `sealOrderBox(declareShort)`tan AYRI ve gerekçesi cihazda ölçüldü: son kutu kapandıktan sonra
 * mühürlenecek kutu kalmıyor ve o yol `empty` dönüp sessizce hiçbir şey yapmıyordu. Gövde yok —
 * hangi kalemin ne kadar eksik olduğunu sunucu kayıttan hesaplıyor, telefon iddia taşımıyor.
 */
export function declareOrderShort(orderId: string): Promise<ApiResult<z.infer<typeof DeclareShortResponseSchema>>> {
  return warehouseFetch(`/api/v1/warehouse/orders/${orderId}/declare-short`, DeclareShortResponseSchema, {
    method: 'POST',
  });
}

/**
 * **Kutuyu geri açar** (01.09) — mühür kalkar ve kutu yeniden doldurulabilir hâle döner.
 *
 * Kapanışın tersi ama simetrik DEĞİL: kapanış içerik gönderir, geri açma yalnız kimlik — kalan
 * dağılımı sunucu kendi kurar (`unseal_order_box`), telefon "şu kadarı kaldı" iddiası taşımaz.
 */
export function unsealOrderBox(boxId: string): Promise<ApiResult<z.infer<typeof UnsealBoxResponseSchema>>> {
  return warehouseFetch(`/api/v1/warehouse/boxes/${boxId}/unseal`, UnsealBoxResponseSchema, { method: 'POST' });
}

/** **Etiket içeriği** (23.7) — önizleme + basım girdisi; yazıcı ayarı da bu cevapta gelir. */
export function fetchBoxLabel(boxId: string): Promise<ApiResult<z.infer<typeof BoxLabelResponseSchema>>> {
  return warehouseFetch(`/api/v1/warehouse/boxes/${boxId}/label`, BoxLabelResponseSchema);
}

/** **Basım damgası** (23.7) — SDK "bastı" deyince çağrılır; damga başarının kaydıdır, niyetin değil. */
export function markBoxPrinted(boxId: string): Promise<ApiResult<z.infer<typeof MarkBoxPrintedResponseSchema>>> {
  return warehouseFetch(`/api/v1/warehouse/boxes/${boxId}/printed`, MarkBoxPrintedResponseSchema, { method: 'POST' });
}

/**
 * **"Hangi sevkiyatı bekliyorum"** (D2'nin konusuz açılışı) — uç 21.11d'den beri vardı, ekran
 * bunu 24.08'e kadar okumuyordu ve mal kabule YALNIZ derin bağlantıyla girilebiliyordu. Sipariş
 * kimliği her `db:refresh`te değiştiği için o yol her tazelemede kırılıyordu (ölçüldü 24.08:
 * elimdeki kimlik öldü, form "açık kalemi yok" dedi ve sebebi kimliğin bayatlığıydı).
 */
export function fetchPendingIntakes(): Promise<ApiResult<z.infer<typeof PendingIntakesResponseSchema>>> {
  return warehouseFetch('/api/v1/warehouse/intake', PendingIntakesResponseSchema);
}

/**
 * **Karar bekleyen partiler** (D3 · yakın-SKT turu).
 *
 * Kapı depoyu KENDİ süzgecinden alıyor (oturumun deposu), yani burada parametre yok: parti tek
 * depodadır ve başka deponun malını göstermek depocuya kendi rafında olmayan bir iş verirdi.
 */
export function fetchNearExpiry(): Promise<ApiResult<z.infer<typeof NearExpiryResponseSchema>>> {
  return warehouseFetch('/api/v1/warehouse/near-expiry', NearExpiryResponseSchema);
}

/**
 * **Plansız kabulün ürün araması** (23.13). Boş sorgu boş liste döner — ekran her tuşta çağırır ve
 * "henüz yazmadın" bir hata değil.
 */
export function searchIntakeVariants(query: string): Promise<ApiResult<z.infer<typeof VariantSearchResponseSchema>>> {
  return warehouseFetch(`/api/v1/warehouse/variants?q=${encodeURIComponent(query)}`, VariantSearchResponseSchema);
}

/** **Tedarik siparişinden dolu kabul formu** (D2). Boş dizi = plansız alım (form elle doldurulur). */
export function fetchIntakeForm(
  purchaseOrderId: string,
): Promise<ApiResult<z.infer<typeof IntakeFormResponseSchema>>> {
  return warehouseFetch(`/api/v1/warehouse/intake/${purchaseOrderId}`, IntakeFormResponseSchema);
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
  return warehouseFetch(path, ReceiveGoodsResponseSchema, { method: 'POST', body });
}

/**
 * **İmha / sayım kaydı** (D4). Bütün satırlar tek transaction'da yazılır ve tek OLAY belgesini
 * paylaşır; numarayı (`result.referenceNo`) DB üretir — istemci onu ÖNCEDEN bilemez.
 */
export function recordAdjustment(
  body: RecordAdjustmentRequest,
): Promise<ApiResult<z.infer<typeof RecordAdjustmentResponseSchema>>> {
  return warehouseFetch('/api/v1/warehouse/adjustments', RecordAdjustmentResponseSchema, { method: 'POST', body });
}

/**
 * **Transfer ekranının üç bölümü tek turda** (D5 · v3:11) — gelen (satırlarıyla) · yolda çıkan ·
 * son kapananlar. Üçü aynı ekranın aynı anda çizdiği şey; ayrı turlar olsaydı bölümlerden biri geç
 * gelene kadar ekran yarım bir gerçeklik gösterirdi.
 */
export function fetchWarehouseTransfers(): Promise<ApiResult<z.infer<typeof WarehouseTransfersResponseSchema>>> {
  return warehouseFetch('/api/v1/warehouse/transfers', WarehouseTransfersResponseSchema);
}

/**
 * **Transfer kabulü** (D5) — rampada sayım. Sayılmamış satır varsa kapı `incomplete` döner ve HANGİ
 * satırların eksik olduğunu söyler; `0` ise geçerli bir beyandır ("geldi ama kayıp").
 */
export function receiveTransfer(
  transferId: string,
  body: ReceiveTransferRequest,
): Promise<ApiResult<z.infer<typeof ReceiveTransferResponseSchema>>> {
  return warehouseFetch(`/api/v1/warehouse/transfers/${transferId}/receive`, ReceiveTransferResponseSchema, {
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
  return warehouseFetch('/api/v1/warehouse/codes/resolve', ResolveCodeResponseSchema, {
    method: 'POST',
    body: { code },
  });
}

/**
 * **Raftaki PARTİ etiketinin çözümü** (D4'ün ikinci çıkış yolu · v3:08) — üsttekinin kardeşi:
 * o kodu VARYANTA çevirir ("bu hangi mal"), bu PARTİYE ("bu raftaki hangi kutu"). Düzeltme daima
 * bir partiye yazılır ve aynı varyantın aynı depoda birden çok partisi olabilir.
 *
 * Eşleşme ÇOĞULDUR: lot numarası benzersiz değil — tekile indirmek, depocunun görmediği bir
 * partiden düşürmek olurdu. `unknown` bir hata değil cevaptır ("bu kodla bu depoda açık parti yok").
 */
export function resolveBatchCode(code: string): Promise<ApiResult<z.infer<typeof ResolveBatchResponseSchema>>> {
  return warehouseFetch('/api/v1/warehouse/batches/resolve', ResolveBatchResponseSchema, {
    method: 'POST',
    body: { code },
  });
}

/**
 * **RAF LİSTESİ** (D4/D4b · v3:08/09) — okutmanın YEDEĞİ, alternatifi değil.
 *
 * Okutma hızlı yoldur; bu kapı okunamayan etiket içindir (yırtılmış, silinmiş, hiç
 * yapıştırılmamış). Boş sorgu BOŞ LİSTE DEĞİL, ilk pencereyi döner: depocu ekranı açtığında
 * karşısında bir liste bulmalı — aramaya ancak listede göremezse başvurur.
 */
export function fetchWarehouseBatches(
  query: string,
): Promise<ApiResult<z.infer<typeof WarehouseBatchesResponseSchema>>> {
  return warehouseFetch(`/api/v1/warehouse/batches?q=${encodeURIComponent(query)}`, WarehouseBatchesResponseSchema);
}

/**
 * **Deponun alanları** (kullanıcı kararı 03.09) — seçicinin *"hangi dolabın önündesin"* sorusunun
 * envanteri. Yalnız açık alanlar; depo süzgeci jetondan/seçimden.
 */
export function fetchWarehouseAreas(): Promise<ApiResult<z.infer<typeof WarehouseAreasResponseSchema>>> {
  return warehouseFetch('/api/v1/warehouse/areas', WarehouseAreasResponseSchema);
}

/**
 * **Parti bu alanda görüldü** — partinin alanı "son görüldüğü yer"dir, taşıma kaydı YOK
 * (`batch-area.ts` künyesi). Dört cevap da 200; `invalid_area` ve `out_of_scope` operatöre
 * söylenecek cümlelerdir.
 */
export function markBatchSeen(
  stockId: string,
  storageAreaId: string,
): Promise<ApiResult<z.infer<typeof MarkBatchSeenResponseSchema>>> {
  return warehouseFetch(`/api/v1/warehouse/batches/${stockId}/seen`, MarkBatchSeenResponseSchema, {
    method: 'POST',
    body: { storageAreaId },
  });
}

/**
 * **Öğrenen eşleme** (karar §1.3): tanınmayan kod bir varyanta bağlanır, ikinci gelişte tanınır.
 * `already_bound` cevabın kendisidir — kod başka varyanta bağlıysa ekran kime bağlı olduğunu
 * söyler; düzeltme web varyant editöründen (sil + yeniden öğret).
 */
export function learnScannedCode(body: LearnCodeRequest): Promise<ApiResult<z.infer<typeof LearnCodeResponseSchema>>> {
  return warehouseFetch('/api/v1/warehouse/codes', LearnCodeResponseSchema, { method: 'POST', body });
}

/**
 * **Kurye dönüşü kabulü** (D6). Miktar HEDEF değerdir (kalan adet), fark değil — çıkarma sistemde
 * yapılır (sözleşme künyesi). Cevabın para alanları depocuya GÖSTERİLMEZ; çağıranın (yönetim) işi.
 */
export function submitWarehouseReturn(
  orderId: string,
  body: WarehouseReturnRequest,
): Promise<ApiResult<z.infer<typeof WarehouseReturnResponseSchema>>> {
  return warehouseFetch(`/api/v1/warehouse/returns/${orderId}`, WarehouseReturnResponseSchema, {
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
  return warehouseFetch(`/api/v1/warehouse/orders/${orderId}/dispatch-options`, DispatchOptionsResponseSchema);
}

/**
 * **GÖNDERİYİ DUYUR — GERÇEK PARA HARCAR.** Yeniden deneme YOK: sağlayıcıda idempotency anahtarı
 * yok ve ikinci çağrı ikinci koli açar. `already_announced` bu yüzden bir hata değil cevaptır.
 */
export function announceShipment(
  orderId: string,
  body: AnnounceShipmentRequest,
): Promise<ApiResult<z.infer<typeof AnnounceShipmentResponseSchema>>> {
  return warehouseFetch(`/api/v1/warehouse/orders/${orderId}/announce`, AnnounceShipmentResponseSchema, {
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
  return warehouseFetch('/api/v1/warehouse/handover', HandoverResponseSchema, { method: 'POST', body: { code } });
}

/**
 * **Rampada bekleyen kutu sayısı** (07.12) — hub rozeti + devir ekranının başlığı.
 *
 * Salt okuma ve liste DEĞİL sayı: devir bir okutma işidir, seçim değil. Sayının işi rampanın
 * bitişini ölçmek — sıfıra inince yığın boşalmıştır.
 */
export function fetchPendingHandover(): Promise<ApiResult<z.infer<typeof HandoverPendingResponseSchema>>> {
  return warehouseFetch('/api/v1/warehouse/handover/pending', HandoverPendingResponseSchema);
}

/**
 * **Deponun yazıcıları** (07.12) — envanter; SEÇİM cihazda (`lib/print/printer-choice`).
 *
 * Yalnız açık satırlar gelir. Liste basımdan hemen önce okunuyor: kurulum değişebilir (yazıcı
 * kapatılmış olabilir) ve önbelleğe alınmış bayat bir liste, sökülmüş bir cihaza basmayı denerdi.
 */
export function fetchPrinters(): Promise<ApiResult<z.infer<typeof WarehousePrintersResponseSchema>>> {
  return warehouseFetch('/api/v1/warehouse/printers', WarehousePrintersResponseSchema);
}
