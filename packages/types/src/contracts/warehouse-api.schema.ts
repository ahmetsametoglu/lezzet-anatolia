import { z } from 'zod';
import { CourierReturnBoxSchema, CourierReturnFreeGoodSchema, CourierReturnStayBoxSchema } from './courier-return-api.schema';
import { DoorCollectionInputSchema } from './courier-api.schema';
import {
  FulfillmentAdjustmentSchema,
  OrderItemReturnSchema,
  PreparationPickSchema,
  ServicePointSnapshotSchema,
} from '../entities/order.schema';
import { ProductDateTypeEnum } from '../entities/product.schema';
import { AdjustBatchResultSchema, StockDirectionEnum, StockWriteOffReasonEnum } from '../entities/stock-movement.schema';
import { StorageAreaSchema } from '../entities/storage-point.schema';
import { PurchaseOrderStatusEnum, ReceiveIntakeResultSchema } from '../entities/supply.schema';
import { VariantBarcodeSchema } from '../entities/variant-barcode.schema';
import { DispatchLineSchema, ReceiveLineSchema } from '../entities/warehouse.schema';
import { PrinterPurposeEnum } from '../entities/warehouse-printer.schema';
import {
  ChannelEnum,
  DeliveryTypeEnum,
  OrderStatusEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
  ReturnDispositionEnum,
  TransferStatusEnum,
  WarehouseKindEnum,
} from '../primitives/enums.schema';

/**
 * Depo sözleşme şemaları — mobil `/api/v1/warehouse/*` uçlarının ortak dili, alanlar depo kapılarının aynasıdır; `warehouseId`
 * hiçbir istek gövdesinde yok, çünkü kimlik jetondan gelir ve gövdeden gelseydi depocu başka deponun malını düşebilirdi.
 * Depo şemalarında tutar yok (tek istisna D6 yanıtı, iade tutarını yönetim akışı okur) ve olumsuz sonuçlar hata değil
 * cevaptır, bu yüzden yanıtlar ayrımlı birleşimdir.
 */

// ── D1 · Hazırlık (toplama) ─────────────────────────────────────────────────

/** Motorun önerdiği tek parti — depocunun rafta arayacağı şey. Fiyat YOK. */
export const PreparationSuggestionSchema = z.object({
  stockId: z.string().uuid(),
  qty: z.number().int(),
  expiryDate: z.string(),
  /**
   * Partinin alanının adı ("Derin dondurucu 2"), kimliği değil: depocu rafta uuid aramıyor, tabelayı okuyor. Alan adı depo
   * içinde benzersizdir.
   */
  areaName: z.string().nullable(),
});
export type PreparationSuggestionContract = z.infer<typeof PreparationSuggestionSchema>;

export const PreparationLineSchema = z.object({
  itemId: z.string().uuid(),
  variantId: z.string().uuid(),
  /** Operasyon dilinde (Türkçe) — müşterinin dilinde değil. */
  productName: z.string(),
  /** "500 g" gibi boy etiketi; tek boylu üründe boş dize. */
  variantLabel: z.string(),
  /**
   * Ürün kapağının public URL'i — `null` = kapaksız ürün, ekran monograma düşer. Okutma eksenli toplamada aynı ürünün iki
   * boyu yan yana durur ve metin ayırt etmeye yetmez.
   */
  imageUrl: z.string().nullable(),
  /**
   * Kalemin paket barkodu; `null` = barkodu girilmemiş ürün. Kamerasız turun simülasyon çipleri siparişin gerçek kodlarıyla
   * çizilir ve `/codes/resolve`ın aynı yolundan geçer, simülasyonda bulunan arıza cihazda da tekrar eder.
   */
  barcode: z.string().nullable(),
  orderedQty: z.number().int(),
  /** Daha önce toplanmış adet — **yarım iş sürer**, ekran kaldığı yerden devam eder. */
  pickedQty: z.number().int(),
  /**
   * Kalemin şu anda yazılı parti dağılımı — boş dizi = henüz toplanmamış; şekil yazım şemasından türer, çünkü yazım
   * absolüttür ve ekranın göndereceği dizi bunun devamıdır. Yarım kalmış kalemin dağılımı tahminle yeniden kurulmaz;
   * `suggestion` motorun önerisidir, bu ise depocunun yazdığı gerçek.
   */
  pickedBatches: PreparationPickSchema.shape.batches,
  /** Doluysa öneri değil ZORUNLULUK: indirimli teklif kalemi yalnız bu partiden verilebilir. */
  pinnedStockId: z.string().uuid().nullable(),
  suggestion: z.array(PreparationSuggestionSchema),
  /** Önerilen partiler istenen adedi karşılayamıyorsa kalan — fiziksel eksik sinyali. */
  shortfallQty: z.number().int(),
});
export type PreparationLineContract = z.infer<typeof PreparationLineSchema>;

/**
 * Siparişin bir kutusu — `sealedAt null` = açık kutu. `items` kutuya konmuş kalemlerdir; mobil "bu kalemden kaç adet
 * kutulandı"yı bundan türetir, web yalnız sayar.
 */
export const PreparationBoxSchema = z.object({
  boxId: z.string().uuid(),
  boxNo: z.number().int().positive(),
  /** QR'ın içeriği (`KT-…`) — sipariş referansı DEĞİL (Netleşecek 4). */
  code: z.string(),
  sealedAt: z.string().nullable(),
  items: z.array(z.object({ orderItemId: z.string().uuid(), qty: z.number().int().positive() })),
  /**
   * Hangi kargo kutusu tipiyle açıldı — `null` = tip seçilmedi. Yalnız kimlik taşınır: ekran kutu tiplerini zaten okuyor,
   * adı ikinci kez göndermek aynı bilgiyi iki kaynaktan taşımak olurdu.
   */
  shippingBoxId: z.string().uuid().nullable(),
});
export type PreparationBoxContract = z.infer<typeof PreparationBoxSchema>;

/** Kuyruk satırı — sipariş künyesi + kalemleri. Tutar, adres, iletişim YOK (tasarım §6). */
export const PreparationOrderSchema = z.object({
  orderId: z.string().uuid(),
  referenceNo: z.string().nullable(),
  /** Koli etiketi için AD; iletişim ve adres okunmaz. */
  customerName: z.string(),
  /** Adrese giden kişi — koliye yazılacak ad; `null` = adreste alıcı yazılı değil, ekran müşteri adını kullanır. */
  recipientName: z.string().nullable(),
  channel: ChannelEnum,
  status: OrderStatusEnum,
  deliveryDate: z.string().nullable(),
  /**
   * Hangi kulvar — ekran bunu kutu tipi sorulacak mı diye okur: rota siparişinde kutu araca biner ve kargo kutusu sormak
   * cevabı olmayan bir sorudur.
   */
  deliveryType: DeliveryTypeEnum,
  lineCount: z.number().int(),
  pickedLineCount: z.number().int(),
  lines: z.array(PreparationLineSchema),
  /** Siparişin kutuları, `boxNo` sırasıyla; boş dizi = kutusuz akış (eski yol — bilinçli çift akış). */
  boxes: z.array(PreparationBoxSchema),
});
export type PreparationOrderContract = z.infer<typeof PreparationOrderSchema>;

/** `GET /warehouse/preparation` yanıtı. Gün ZORUNLU döner: istemci "hangi günü gösteriyorum" demez. */
export const PreparationQueueResponseSchema = z.object({
  /** Süzgeç uygulanan gün; verilmemişse `null` — o zaman bekleyen HER sipariş listededir. */
  date: z.string().nullable(),
  orders: z.array(PreparationOrderSchema),
});
export type PreparationQueueResponse = z.infer<typeof PreparationQueueResponseSchema>;

/**
 * Hazırlık onayı isteği (D1). `picks` VARLIK şemasından gelir (`PreparationPickSchema`) — RPC'nin
 * girdisiyle aynı şekil; ikinci bir tanım, aynı kalemi iki dilde konuşmak olurdu.
 */
export const ConfirmPreparationRequestSchema = z.object({
  picks: z.array(PreparationPickSchema),
});
export type ConfirmPreparationRequest = z.infer<typeof ConfirmPreparationRequestSchema>;

/**
 * Eksik kalan kalemin motor tavsiyesi — tutar taşımaz, depocu parayı görmez. Değerler `domain-core/stock/shortfall`ın
 * aynasıdır; `@lezzet/types` motoru bilmediği için burada yeniden yazılır.
 */
export const ShortfallSuggestionSchema = z.object({
  action: z.enum(['ask_customer', 'send_rest']),
  /** Öneriyi doğuran sebep — ekran bunu sade bir cümleye çevirir, TUTAR yazmadan. */
  reason: z.enum(['complete', 'line_fully_missing', 'large_share', 'high_value', 'minor']),
  missingQty: z.number().int(),
});
export type ShortfallSuggestionContract = z.infer<typeof ShortfallSuggestionSchema>;

export const ConfirmPreparationResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    items: z.number().int(),
    /** Tamamı toplandı ve sipariş `ready`'e geçti mi. `false` HATA DEĞİL: yarım iş `preparing`te sürer. */
    ready: z.boolean(),
    /** Eksik kalan kalemler — karar YÖNETİM ekranında (D1 → Y2), depocuya sorulmaz. */
    shortfalls: z.array(z.object({ itemId: z.string().uuid(), suggestion: ShortfallSuggestionSchema })),
  }),
  /** Kilitli kalem başka partiden verilmek istendi — HİÇBİR yazım yapılmadı. */
  z.object({ status: z.literal('pinned_violation'), itemId: z.string().uuid(), requiredStockId: z.string().uuid() }),
  /** Kargo siparişi kutusuz onaylanamaz: ölçü ve ağırlık kutu tipinden gelir, kutusuz sipariş sevk edilemez kalırdı. */
  z.object({ status: z.literal('box_required') }),
  z.object({ status: z.literal('forbidden'), reason: z.literal('out_of_scope') }),
  z.object({ status: z.literal('not_found') }),
]);
export type ConfirmPreparationResponse = z.infer<typeof ConfirmPreparationResponseSchema>;

// ── D1 · Kutu döngüsü (23.6 — karar §1.4) ───────────────────────────────────

/**
 * Kargo kutusu seçeneği — deponun benimsediği dış kutu tiplerinden biri; varyantın ambalajıyla karışmaz. Ölçüler depocuya
 * bilgi olarak taşınır ki elindeki kartonu tanısın; sistem şablonları gelmez, yalnız benimsenenler.
 */
export const ShippingBoxOptionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  lengthMm: z.number().int().positive(),
  widthMm: z.number().int().positive(),
  heightMm: z.number().int().positive(),
  /** Boş kutunun ağırlığı (g) — gönderi ağırlığına eklenir. `0` meşrudur (poşet/zarf). */
  tareG: z.number().int().nonnegative(),
  /** Azami İÇERİK ağırlığı (g, dara hariç). `null` = sınır bilinmiyor, sıfır DEĞİL. */
  maxContentG: z.number().int().positive().nullable(),
});
export type ShippingBoxOptionContract = z.infer<typeof ShippingBoxOptionSchema>;

/** `GET /warehouse/shipping-boxes` — yalnız AÇIK kutular; kapatılmış tip yeni kutuya seçilemez. */
export const ShippingBoxesResponseSchema = z.object({ boxes: z.array(ShippingBoxOptionSchema) });
export type ShippingBoxesResponse = z.infer<typeof ShippingBoxesResponseSchema>;

/**
 * Kutu açılış gövdesi — tek, isteğe bağlı alan: kutunun fiziksel kimliği; kargo ağırlık ve ölçüsü bundan çıkar. `null`
 * meşrudur: rota siparişinde tip sorulmaz, depo hiç kutu benimsememiş olabilir.
 */
export const OpenBoxRequestSchema = z.object({
  shippingBoxId: z.string().uuid().nullable().default(null),
});
export type OpenBoxRequest = z.infer<typeof OpenBoxRequestSchema>;

/**
 * Kutu açılışının cevabı: `stale` sipariş toplanabilir durumda değil demektir, ekran hangi durumda olduğunu söyler.
 * `unknown_box` `not_found`a katlanmaz: sipariş duruyor, geçersiz olan kutu tipidir.
 */
export const OpenBoxResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), box: PreparationBoxSchema }),
  z.object({ status: z.literal('forbidden'), reason: z.literal('out_of_scope') }),
  z.object({ status: z.literal('stale'), currentStatus: OrderStatusEnum }),
  z.object({ status: z.literal('unknown_box') }),
  z.object({ status: z.literal('not_found') }),
]);
export type OpenBoxResponse = z.infer<typeof OpenBoxResponseSchema>;

// ── D1 · Sevk: teklif + duyuru ─────────────────────────────────────────────

/**
 * Sevkin ön koşulu tutmadı — teklif ve duyuru aynı kümeyi paylaşır. Hepsi adlıdır, çünkü depocunun sorusu "neden olmadı":
 * ölçüsüz mal tartıya, tipsiz kutu seçime, adressiz sipariş yönetime gider.
 */
export const DispatchBlockSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('not_found') }),
  /** Rota siparişine taşıyıcı yazılmaz — kısıt veride de var (`order_carrier_only_shipping`). */
  z.object({ status: z.literal('not_shipping') }),
  /** Hiç mühürlü kutu yok: açık kutunun içeriği kesinleşmemiştir, ağırlığı da öyle. */
  z.object({ status: z.literal('no_sealed_box') }),
  /** Kutu tipi seçilmemiş — ölçü oradan geliyor. Hangi kutu olduğu söylenir. */
  z.object({ status: z.literal('box_type_missing'), boxNos: z.array(z.number().int().positive()) }),
  /** Ambalaj ağırlığı yazılmamış varyantlar — tartılmamış mal tarifeye giremez. */
  z.object({ status: z.literal('unmeasured'), variantIds: z.array(z.string().uuid()) }),
  /** Deponun adresi eksik: gönderici olmadan tarife hesaplanamaz. */
  z.object({ status: z.literal('no_sender') }),
  /** Siparişin adres kopyası eksik: gönderi nereye gideceğini bilmiyor. */
  z.object({ status: z.literal('no_recipient') }),
  /** Sağlayıcının senkron duyuru tavanı aşıldı. */
  z.object({ status: z.literal('too_many_parcels'), count: z.number().int(), max: z.number().int() }),
]);

/** Depocunun seçtiği kargo servisi — fiyat SUNUCUDAN, istemci tutar göndermez. */
export const DispatchOptionSchema = z.object({
  code: z.string(),
  /** Taşıyıcının GERÇEK adı ("Chronopost") — özel isim, çeviri istemez. */
  carrierName: z.string(),
  name: z.string(),
  priceCents: z.number().int().positive(),
  /** Teslim süresi; `null` yaygındır, bazı taşıyıcılar bildirmiyor. */
  leadTimeHours: z.number().int().nullable(),
  lastMile: z.string().nullable(),
  tracked: z.boolean(),
});
export type DispatchOptionContract = z.infer<typeof DispatchOptionSchema>;

/**
 * `GET /warehouse/orders/:orderId/dispatch-options` — gerçek kolilere göre teklif; checkout sepetten plan kurar, burası
 * mühürlenmiş kutuları ölçer ve sevkte bağlayıcı olan budur.
 */
export const DispatchOptionsResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    options: z.array(DispatchOptionSchema),
    parcelCount: z.number().int().positive(),
    /** Koli + dara toplamı (g) — ekran "3 koli · 7,4 kg" diyebilsin diye. */
    totalWeightG: z.number().int().nonnegative(),
    /**
     * Liste "yalnız adrese teslim"e daraltıldı mı: ücretsiz kargoda teslimat noktaları elenir. Bayrak taşınmazsa depocu
     * daraltılmış listeye tam liste diye bakardı.
     */
    homeOnly: z.boolean(),
    /** Servis ödeme anında seçildi: liste tek satırdır, depocu değiştiremez. */
    fixed: z.boolean(),
    /** Siparişin teslim noktası; eve teslimde `null`. */
    servicePoint: ServicePointSnapshotSchema.nullable(),
    /** Checkout'un planladığı koli sayısı; plan yoksa `null`. */
    plannedParcelCount: z.number().int().positive().nullable(),
  }),
  /** Siparişin servisi gerçek kolilerle alınamıyor: sunulmuyor ya da çok koli taşımıyor. */
  z.object({
    status: z.literal('selection_unusable'),
    reason: z.enum(['not_offered', 'multicollo']),
    parcelCount: z.number().int().positive(),
    plannedParcelCount: z.number().int().positive().nullable(),
  }),
  z.object({ status: z.literal('provider_error'), message: z.string() }),
  ...DispatchBlockSchema.options,
]);
export type DispatchOptionsResponse = z.infer<typeof DispatchOptionsResponseSchema>;

/**
 * Duyuru isteği — **GERÇEK PARA HARCAR.** Gövdede yalnız SEÇİM var: tutar yok, adres yok, koli
 * listesi yok. Adres siparişin kendi kopyasından okunuyor ve koliler mühürlü kutulardan çıkıyor;
 * hepsini istemciden almak, ödenen etiketin ne olacağına telefonun karar vermesi olurdu.
 */
export const AnnounceShipmentRequestSchema = z.object({
  shippingOptionCode: z.string().min(1),
  /** Teslimat noktası seçildiyse kimliği; eve teslimde `null`. */
  servicePointId: z.string().nullable().default(null),
  /** Depocuya gösterilen fiyat — maliyetin ilk kaydı. Sunucu bunu FİYAT olarak kullanmaz. */
  quotedCents: z.number().int().nonnegative().nullable().default(null),
});
export type AnnounceShipmentRequest = z.infer<typeof AnnounceShipmentRequestSchema>;

export const AnnounceShipmentResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    shipmentId: z.string().uuid(),
    parcels: z.array(z.object({ boxId: z.string().uuid(), trackingNumber: z.string(), labelKey: z.string().nullable() })),
    /**
     * Etiketi SAKLANAMAYAN kutuların numarası. Gönderi ALINDI ve parası ödendi — yükleme hatası
     * duyuruyu geri çekmez (23.7'nin "basım hatası kutu kapanışını geri çekmez" çizgisi).
     */
    labelFailures: z.array(z.number().int().positive()),
  }),
  /** Zaten duyurulmuş: ikinci duyuru ikinci koli ve gerçek para demek — kapı ONU açmaz. */
  z.object({ status: z.literal('already_announced'), shipmentId: z.string().uuid() }),
  z.object({ status: z.literal('provider_error'), code: z.string(), message: z.string() }),
  /** Siparişin ödeme anındaki servisinden farklı kod: depo servisi yeniden seçemez. */
  z.object({ status: z.literal('selection_mismatch') }),
  ...DispatchBlockSchema.options,
]);
export type AnnounceShipmentResponse = z.infer<typeof AnnounceShipmentResponseSchema>;

/**
 * Devir okutması — kutu fiziksel olarak taşıyıcıya verildi. Gövde yalnız okutulan kod; kodun taşıyıcı numarası mı bizim
 * kodumuz mu olduğunu sunucu çözer.
 */
export const HandoverRequestSchema = z.object({ code: z.string().trim().min(1).max(64) });
export type HandoverRequest = z.infer<typeof HandoverRequestSchema>;

/**
 * Devir cevabı — olumsuz dallar da 200 ve adlı. `already_handed` hata değil: ikinci okutma "zaten verildi" der ve sayaç
 * kıpırdamaz, hata cümlesi depocuyu saymanın doğruluğundan şüphelendirirdi.
 */
export const HandoverResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    boxNo: z.number().int().positive(),
    referenceNo: z.string().nullable(),
    /** Bu GÖNDERİNİN kaç kutusu verildi / toplam — depocunun "kaç kaldı" sorusu. */
    handedBoxes: z.number().int().positive(),
    boxCount: z.number().int().positive(),
    /** Son kutuydu: gönderi "taşıyıcıya verildi"ye geçti ve sipariş yola çıktı. */
    shipmentHandedOver: z.boolean(),
  }),
  z.object({
    status: z.literal('already_handed'),
    boxNo: z.number().int().positive(),
    handedBoxes: z.number().int().positive(),
    boxCount: z.number().int().positive(),
  }),
  z.object({ status: z.literal('unknown_code') }),
  /** Başka deponun kutusu — referans söylenir ki depocu onu doğru yığına geri koysun. */
  z.object({ status: z.literal('out_of_scope'), referenceNo: z.string().nullable() }),
  z.object({ status: z.literal('not_sealed'), boxNo: z.number().int().positive() }),
  /** Gönderi duyurulmadı: satın alınmamış etiketle kutu taşıyıcıya verilemez. */
  z.object({ status: z.literal('not_announced'), boxNo: z.number().int().positive() }),
  /**
   * Sipariş gönderilebilir değil (en sık hâli iptal) — iptal edilmiş, parası iade edilmiş siparişin kolisi taşıyıcıya
   * verilmez. Referans ve `currentStatus` ekranın cümlesi içindir; çıplak ret depocuya ne yapacağını söylemez.
   */
  z.object({
    status: z.literal('not_shippable'),
    boxNo: z.number().int().positive(),
    referenceNo: z.string().nullable(),
    currentStatus: OrderStatusEnum,
  }),
]);
export type HandoverResponse = z.infer<typeof HandoverResponseSchema>;

/**
 * `GET /warehouse/handover/pending` — rampada bekleyen kutu sayısı; devir ekranı bir okutucudur, sayı seçim değil bitiş
 * ölçüsü verir. Sayaç devir kapısının süzgecinin aynısını kullanır, gevşek sayaç yapılamayacak işi varmış gibi gösterirdi.
 */
export const AwaitingHandoverBoxSchema = z.object({
  boxId: z.string().uuid(),
  /** BİZİM kutu kodumuz — kargo kutusunda etiket olarak basılmaz ama taşıyıcının etiketine METİN
      olarak yazılır (§4.6), yani depocu onu kutunun üstünde okuyabiliyor. */
  code: z.string(),
  boxNo: z.number().int().positive(),
  /** Bu GÖNDERİNİN toplam kutusu — "kutu 2/3" cümlesinin paydası, siparişinki değil. */
  boxCount: z.number().int().positive(),
  referenceNo: z.string().nullable(),
});
export type AwaitingHandoverBoxContract = z.infer<typeof AwaitingHandoverBoxSchema>;

export const HandoverPendingResponseSchema = z.object({
  /** Mühürlü + duyurulmuş + henüz verilmemiş kutu adedi. Sıfır meşru bir cevap: rampa boş. */
  boxes: z.number().int().nonnegative(),
  /**
   * Rampada bekleyen kutuların kendisi — seçim değil envanter, dokunulamaz. Tavanlıdır ama sessiz değil: `boxes` gerçek
   * toplamı taşır ve ekran listenin kırpıldığını söyler.
   */
  waiting: z.array(AwaitingHandoverBoxSchema),
});
export type HandoverPendingResponse = z.infer<typeof HandoverPendingResponseSchema>;

/**
 * `GET /warehouse/boxes/:boxId/shipping-label` — taşıyıcının etiketi, imzalı adres olarak; PDF özel kovada durur ve telefon
 * doğrudan indirir. Bizim QR'lı kutu etiketimizle (`/label.png`) karışmaz: kargo kutusunda iki barkod taşıyıcıyı şaşırtır.
 */
export const ShippingLabelResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    /** İmzalı, süreli okuma adresi — kalıcı değil, her istekte yeniden üretilir. */
    url: z.string().min(1),
  }),
  /** Kutu bu depoya ait değil ya da hiç yok. */
  z.object({ status: z.literal('not_found') }),
  /** Gönderi henüz duyurulmadı: satın alınmamış bir etiket basılamaz. */
  z.object({ status: z.literal('not_announced') }),
  /**
   * Gönderi duyuruldu ama etiket SAKLANAMADI (`labelFailures`). Ayrı bir dal, çünkü çaresi de
   * ayrı: duyuruyu tekrarlamak ikinci koli açar — burada yapılacak şey gönderiyi iptal edip
   * yeniden duyurmaktır ve bu bir OPERATÖR kararıdır.
   */
  z.object({ status: z.literal('no_label') }),
]);
export type ShippingLabelResponse = z.infer<typeof ShippingLabelResponseSchema>;

/**
 * Kutu kapanışı isteği — `picks` BU KUTUYA konanlardır (kutu başına dağılım), kümülatif değil:
 * absolüt birleşimi kapı kurar (`sealBox` — `record_preparation`ın absolüt yazımıyla çok kutulu
 * birleşim ekranın değil sunucunun işidir; ekran kurmaya kalksaydı yarım işte eski dağılımı
 * bilmek zorunda kalırdı).
 *
 * `declareShort`: "bu kutu SON — eksik kalanları bildiriyorum." Yalnız bu bayrakla eksik
 * tavsiyesi üretilir; bayraksız kapanışta eksik kalem "devam ediyor" demektir (yeni kutu
 * açılacak) ve tavsiye ÜRETİLMEZ — ara kutunun doğal eksiği yönetime soru olarak gitmemeli.
 */
export const SealBoxRequestSchema = z.object({
  picks: z.array(PreparationPickSchema),
  declareShort: z.boolean().optional(),
});
export type SealBoxRequest = z.infer<typeof SealBoxRequestSchema>;

export const SealBoxResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    boxNo: z.number().int().positive(),
    /** Sipariş tamamen kutulandı ve `ready`'e geçti mi — `false` hata değil: döngü sürüyor. */
    ready: z.boolean(),
    /** Eksik kalan kalemler (motorun aritmetiği) — ekran "yeni kutu"yu bununla önerir. */
    missing: z.array(z.object({ itemId: z.string().uuid(), missingQty: z.number().int().positive() })),
    /** Yalnız `declareShort` ile dolar — karar yine YÖNETİM ekranında (D1 → Y2). */
    shortfalls: z.array(z.object({ itemId: z.string().uuid(), suggestion: ShortfallSuggestionSchema })),
  }),
  /** Kilitli kalem başka partiden verilmek istendi — HİÇBİR yazım yapılmadı (kutu açık kalır). */
  z.object({ status: z.literal('pinned_violation'), itemId: z.string().uuid(), requiredStockId: z.string().uuid() }),
  /** Kutu zaten kapalı — çift dokunuş/yarış; içerik değişmedi. */
  z.object({ status: z.literal('already_sealed') }),
  /** Boş kutu kapatılamaz — etiketi basılacak içerik yok. */
  z.object({ status: z.literal('empty') }),
  /**
   * Sipariş toplanabilir kümede değil — kutu açıldıktan sonra iptal edilmiş olabilir. `openBox`un aynı dalı: kapıyı kapatan
   * kural açanla eş olmalı, yoksa mühür iptal edilmiş siparişte karşılanan adedi diriltirdi.
   */
  z.object({ status: z.literal('stale'), currentStatus: OrderStatusEnum }),
  z.object({ status: z.literal('forbidden'), reason: z.literal('out_of_scope') }),
  /** RPC reddi — mesaj operatöre AYNEN gösterilir (en sık: fiziksel gerçek ihlali, 0015/0048). */
  z.object({ status: z.literal('failed'), message: z.string() }),
  z.object({ status: z.literal('not_found') }),
]);
export type SealBoxResponse = z.infer<typeof SealBoxResponseSchema>;

/**
 * Siparişi eksik kapat — kutuya dokunmayan sipariş kararı; depocu son kutuyu kapattıktan sonra "kalanı bulamadım" der ve
 * o anda açık kutu yoktur. Gövde yok, karar siparişin kimliğinden ve depodan türer.
 */
export const DeclareShortResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    /** Eksik kalemlerin tavsiyesi — karar yine YÖNETİM ekranında (D1 → Y2). */
    shortfalls: z.array(z.object({ itemId: z.string().uuid(), suggestion: ShortfallSuggestionSchema })),
  }),
  /** Açık kutuda ürün var: önce o kutu kapanmalı, yoksa içindekiler kayda geçmez. */
  z.object({ status: z.literal('open_box_not_empty'), boxNo: z.number().int().positive() }),
  /** Sipariş toplanabilir kümede değil — mührün aynı dalı, aynı gerekçe. */
  z.object({ status: z.literal('stale'), currentStatus: OrderStatusEnum }),
  z.object({ status: z.literal('forbidden'), reason: z.literal('out_of_scope') }),
  z.object({ status: z.literal('failed'), message: z.string() }),
  z.object({ status: z.literal('not_found') }),
]);
export type DeclareShortResponse = z.infer<typeof DeclareShortResponseSchema>;

/**
 * Kutuyu geri aç — kapanış tersine çevrilebilir bir kayıttır; gövde yok. `not_sealed` çift dokunuştur, `failed` RPC'nin
 * okunur reddidir (araca binmiş kutu, hazırlıktan çıkmış sipariş) ve mesajı depocuya aynen gösterilir.
 */
export const UnsealBoxResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    boxNo: z.number().int().positive(),
    /**
     * Kutudan çıkan döküm (kalem + adet): açık kutu taslaktır ve dökümü kayda ancak kapanışta yazılır, geri açma satırları
     * serbest bırakmak zorundadır. İçerik kaybolmasın diye döküm burada geri verilir ve telefon taslağa yazar.
     */
    items: z.array(z.object({ orderItemId: z.string().uuid(), qty: z.number().int().positive() })),
  }),
  z.object({ status: z.literal('not_sealed') }),
  /**
   * Siparişin başka kutusu açık — geri açma reddedilir, hiçbir şey değişmez. Ekran açık kutuyu tekil biliyor; ikincisi
   * erişilemez bir kayda dönüşürdü.
   */
  z.object({ status: z.literal('other_box_open'), boxNo: z.number().int().positive() }),
  z.object({ status: z.literal('failed'), message: z.string() }),
  z.object({ status: z.literal('forbidden'), reason: z.literal('out_of_scope') }),
  z.object({ status: z.literal('not_found') }),
]);
export type UnsealBoxResponse = z.infer<typeof UnsealBoxResponseSchema>;

/**
 * 4×6 etiketin içeriği — sunucudan gelir, telefon gösterir/basar. Fiyat/tutar alanı yok: tahsilatın yalnız yöntemi yazılır,
 * kurye tutarı QR'ı okutunca kendi ekranında görür.
 */
export const BoxLabelSchema = z.object({
  /** QR'ın içeriği — kutu kodu; sipariş referansı DEĞİL (Netleşecek 4). */
  code: z.string(),
  boxNo: z.number().int().positive(),
  boxCount: z.number().int().positive(),
  referenceNo: z.string().nullable(),
  /** Koliye yazılacak ad: adresin alıcısı, yoksa hesap sahibi (10.9 kuralı). */
  parcelName: z.string(),
  routeName: z.string().nullable(),
  deliveryType: DeliveryTypeEnum,
  deliveryDate: z.string().nullable(),
  paymentMethod: PaymentMethodEnum.nullable(),
  items: z.array(z.object({ name: z.string(), qty: z.number().int().positive() })),
});
export type BoxLabelContract = z.infer<typeof BoxLabelSchema>;

/**
 * Deponun bir yazıcısı: `box` bizim 4×6 QR'lı etiketimiz, `shipping` taşıyıcının A6 etiketi; yanlış yazıcıda küçülen barkod
 * okunmaz. Hangi yazıcının kullanıldığı cihazın kendi bilgisidir ve bu sözleşmede yok, aynı depodaki iki telefon iki yazıcıya basabilir.
 */
export const BoxPrinterSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  purpose: PrinterPurposeEnum,
  /** Son bilinen yer — kimlik değil önbellek; cihaz taramada güncelini bulunca bunu tazeler. */
  address: z.string(),
  /** Değişmez kimlik (SDK keşfi). `null` = elle tanıtılmış satır; eşleşmesi adresten yapılır. */
  serialNumber: z.string().nullable(),
  model: z.string(),
  labelSize: z.string(),
});
export type BoxPrinterContract = z.infer<typeof BoxPrinterSchema>;

/** `GET /warehouse/printers` — deponun AÇIK yazıcıları; cihaz listeden seçer, elle IP yazmaz. */
export const WarehousePrintersResponseSchema = z.object({ printers: z.array(BoxPrinterSchema) });
export type WarehousePrintersResponse = z.infer<typeof WarehousePrintersResponseSchema>;

/**
 * Yazıcı tanıtma (`POST /warehouse/printers`) — telefonun ağda bulduğu yazıcıyı deponun envanterine yazar; adres keşiften
 * gelir, elle yazılmaz. Takılı kâğıt SDK'dan okunamadığı için sunucu modelden türetir ve tanınmayan model reddedilir.
 */
export const RegisterPrinterRequestSchema = z.object({
  purpose: PrinterPurposeEnum,
  model: z.string().min(1),
  address: z.string().min(1),
  /** Keşif veriyorsa kimlik; vermiyorsa `null` ve satır eski davranışta (adresten eşleşme) kalır. */
  serialNumber: z.string().min(1).nullable(),
  /** Verilmezse modelin adı kullanılır; Depolar ekranından insan adına çevrilebilir. */
  name: z.string().min(1).optional(),
});
export type RegisterPrinterRequest = z.infer<typeof RegisterPrinterRequestSchema>;

/**
 * `created` bir süs değil, ekranın cümlesi: ikinci kez dokunulan yazıcı **eklenmez, adresi
 * tazelenir** (0054'ün kısmi unique indeksi) — ve depocu "tanıtıldı" ile "adresi güncellendi"
 * arasındaki farkı görmeli, yoksa ikinci dokunuşun bir işe yarayıp yaramadığını bilemez.
 */
export const RegisterPrinterResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), printer: BoxPrinterSchema, created: z.boolean() }),
  /** Kâğıdını bilmediğimiz model — sessizce varsaymak yerine söylüyoruz. */
  z.object({ status: z.literal('unsupported_model'), model: z.string() }),
]);
export type RegisterPrinterResponse = z.infer<typeof RegisterPrinterResponseSchema>;

/**
 * Etiket içeriği cevabı. Yazıcı cevaba iliştirilmez: hangisinin kullanılacağı cihazın bilgisidir ve sunucunun iliştirdiği
 * yazıcı cihazın seçimini ezerdi.
 */
export const BoxLabelResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), label: BoxLabelSchema }),
  /** Açık kutunun etiketi yoktur — içerik kesinleşmedi; basılan etiket yalan söylerdi. */
  z.object({ status: z.literal('not_sealed') }),
  z.object({ status: z.literal('forbidden'), reason: z.literal('out_of_scope') }),
  z.object({ status: z.literal('not_found') }),
]);
export type BoxLabelResponse = z.infer<typeof BoxLabelResponseSchema>;

/** Basım damgası cevabı (23.7) — damga başarının kaydıdır; telefon SDK "bastı" deyince çağırır. */
export const MarkBoxPrintedResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), printedAt: z.string() }),
  z.object({ status: z.literal('not_sealed') }),
  z.object({ status: z.literal('forbidden'), reason: z.literal('out_of_scope') }),
  z.object({ status: z.literal('not_found') }),
]);
export type MarkBoxPrintedResponse = z.infer<typeof MarkBoxPrintedResponseSchema>;

// ── D2 · Mal kabul ──────────────────────────────────────────────────────────

/**
 * Kayıtlı koli boyu — "bu üründe koli kaç paket"; kaynak `variant_barcode`ın `kind='case'` satırlarıdır, çarpan kodun kendi
 * alanıdır. Liste boşsa adet çekmecesi yalnız tek paket sayar; uydurma bir koli boyu stok sayımını bozardı (CLAUDE §1).
 */
export const CaseSizeSchema = VariantBarcodeSchema.pick({ code: true, qtyPerCode: true });
export type CaseSizeContract = z.infer<typeof CaseSizeSchema>;

/** PO'dan dolu gelen form satırı — beklenen adet + ad; fiyat alanı yok ve olamaz. */
export const IntakeFormRowSchema = z.object({
  variantId: z.string().uuid(),
  productName: z.string(),
  variantLabel: z.string(),
  expectedQty: z.number().int(),
  /**
   * Tedarikçinin bu kaleme verdiği kod — depocunun elinde tedarikçinin irsaliyesi vardır ve satırı kâğıtla eşleştirmenin
   * kesin anahtarı budur. `null` = kalem eşlemesiz açılmış; alış fiyatı buraya gelmez, yalnız kod.
   */
  supplierCode: z.string().nullable(),
  /**
   * Varyantın kendi kodu (`sku`) — plansız kabulde satırı tanıtan tek kod; arama ve okutma aynı alanı göstermeli.
   * `null` = varyanta SKU girilmemiş.
   */
  sku: z.string().nullable(),
  /**
   * Bu varyantın depoda duran lot kodları — lot çekmecesinin ikinci öneri kaynağı, ilk satırı yazan depocu da öneri görsün
   * diye; sıra yeniden eskiye ve sınırlıdır. Öneridir, doğrulama değil: listede olmayan yeni lot da yazılabilir.
   */
  lotCandidates: z.array(z.string()),
  /**
   * Tarih rejimi (DOMAIN §4): `DLC` güvenlik tarihi, `DDM` kalite tarihi. Şablonun "SKT ZORUNLU ·
   * DLC" etiketinin ikinci yarısı — SKT'nin zorunluluğu her satırda aynı (sözleşme kuralı), hangi
   * TÜR tarih yazılacağı ise ÜRÜNE göre değişir ve depocu kutunun üstünde hangisini arayacağını
   * bilmeli.
   */
  dateType: ProductDateTypeEnum,
  /**
   * Ürünün toplam raf ömrü (gün); `null` = girilmemiş, kalan ömür hesaplanamaz ve ekran uyarı üretmez (CLAUDE §1). Yüzdeyi
   * telefon hesaplar, çünkü girdisi olan son tarih depocu SKT'yi girdiği an yazılır.
   */
  shelfLifeDays: z.number().int().nullable(),
  /** Ürünün kayıtlı koli boyları — adet çekmecesinin çarpan tablosu (`CaseSizeSchema` künyesi). */
  caseSizes: z.array(CaseSizeSchema),
});
export type IntakeFormRowContract = z.infer<typeof IntakeFormRowSchema>;

/**
 * Tedarik siparişinin künyesi — ekran başlığı (*"TS-26-0114 · Gaziantep Gıda"*); sipariş başına tekildir, satıra
 * kopyalanmaz. Para yok: depocu hangi belgeyi tuttuğunu bilmeli, kaç para olduğunu değil; `null` alanlar uydurulmaz.
 */
export const IntakePurchaseOrderSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  referenceNo: z.string().nullable(),
  supplierName: z.string().nullable(),
});
export type IntakePurchaseOrderContract = z.infer<typeof IntakePurchaseOrderSchema>;

/**
 * `GET /warehouse/intake/:purchaseOrderId` yanıtı; boş `rows` = plansız alım. `purchaseOrder` `null` ise sipariş hiç yok:
 * "kalemsiz sipariş" ile "olmayan sipariş" ayrı cümledir.
 */
export const IntakeFormResponseSchema = z.object({
  purchaseOrder: IntakePurchaseOrderSchema.nullable(),
  rows: z.array(IntakeFormRowSchema),
  /**
   * MLOR eşiği (%) — bunun ALTINDA kalan ömürle gelen parti işaretlenir; **engellemez, uyarır**
   * (DOMAIN §4). Ayardır (`stock_mlor_percent`), kod sabiti değil: satıra değil YANITA konuyor
   * çünkü eşik sipariş başına değil sistem başına tekildir — satıra kopyalansaydı aynı sayı N kez
   * taşınır ve "satırın eşiği başka olabilir" diye yanlış bir beklenti kurardı (künyenin
   * `IntakePurchaseOrderSchema` için verdiği kararın aynısı).
   */
  mlorPercent: z.number(),
});
export type IntakeFormResponse = z.infer<typeof IntakeFormResponseSchema>;

/**
 * Bekleyen sevkiyat satırı — künyeden türer ki liste ile detay aynı alanları göstersin. `lineCount` kalem sayısıdır, adet
 * değil: depocu kaç satır sayacağını bilmek ister.
 */
export const PendingIntakeSchema = IntakePurchaseOrderSchema.extend({
  lineCount: z.number().int(),
  /**
   * Siparişin durumu: ilk kabulde koli hiç açılmamıştır, kısmi kabulde beklenen adetler kalandır ve ekran iki ayrı cümle
   * kurar. Küme varlık enum'undan daraltılarak türer, elle yazılmaz.
   */
  status: PurchaseOrderStatusEnum.extract(['sent', 'partially_received']),
});
export type PendingIntakeContract = z.infer<typeof PendingIntakeSchema>;

/**
 * `GET /warehouse/intake` yanıtı — "hangi sevkiyatı bekliyorum". Sayfalanmaz, çünkü açık tedarik siparişi kümesi kabul
 * edildikçe kapanır; tavan yine de var, tavansız okuma bir gün sessizce kesilir.
 */
export const PendingIntakesResponseSchema = z.object({ intakes: z.array(PendingIntakeSchema) });
export type PendingIntakesResponse = z.infer<typeof PendingIntakesResponseSchema>;

/**
 * Depocunun gönderdiği kabul satırı — maliyet alanı yok, depo yolu fiyat gönderemez; fiyatlı giriş yöneticinin ayrı
 * kapısıdır. `expiryDate` zorunlu: SKT girilmeden kabul kapanmaz.
 */
export const IntakeFormLineSchema = z.object({
  variantId: z.string().uuid(),
  qty: z.number().int().positive(),
  expiryDate: z.string(),
  /** Geri çağırma anahtarı; boş bırakmak BİLİNÇLİ bir karar olmalı (v2 notu). */
  lotNumber: z.string().nullish(),
  /**
   * Partinin konacağı alan — kimlik; okurken ad, yazarken kimlik ve asimetri kasıtlı: ad kabul etseydik yazım hatası yeni
   * bir "alan" uydururdu.
   */
  storageAreaId: z.string().uuid().nullish(),
});
export type IntakeFormLineContract = z.infer<typeof IntakeFormLineSchema>;

export const ReceiveGoodsRequestSchema = z.object({
  lines: z.array(IntakeFormLineSchema),
  /** PO'lu kabul; yoksa plansız alım — fark raporu da o zaman üretilmez. */
  purchaseOrderId: z.string().uuid().nullish(),
  supplierId: z.string().uuid().nullish(),
  date: z.string().optional(),
  note: z.string().nullish(),
});
export type ReceiveGoodsRequest = z.infer<typeof ReceiveGoodsRequestSchema>;

/** Raf ömrü uyarısı — **engel DEĞİL, bilgi**; kabul yine yazılır (DOMAIN §4). */
export const IntakeWarningSchema = z.object({
  variantId: z.string().uuid(),
  /** Kalan raf ömrü yüzdesi. `null` = ürünün toplam ömrü bilinmiyor — ölçülemeyen değer sıfır değildir. */
  remainingPercent: z.number().nullable(),
});
export type IntakeWarningContract = z.infer<typeof IntakeWarningSchema>;

/** Beklenen–gelen farkı — yalnız SAPAN satırlar (v2: "FARK ÖZETİ — YALNIZ SAPAN SATIRLAR"). */
export const IntakeDifferenceSchema = z.object({
  variantId: z.string().uuid(),
  expectedQty: z.number().int(),
  receivedQty: z.number().int(),
});
export type IntakeDifferenceContract = z.infer<typeof IntakeDifferenceSchema>;

export const ReceiveGoodsResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    result: ReceiveIntakeResultSchema,
    warnings: z.array(IntakeWarningSchema),
    differences: z.array(IntakeDifferenceSchema),
    /**
     * Hedefe çekilen otomatik fiyat sayısı; `null` = ölçülemedi (fiyat portu yok), sıfır değil (CLAUDE §1). Depocuya
     * gösterilmez, kabul kaydında görünür kalır.
     */
    repricedCount: z.number().int().nullable(),
  }),
  /** Satırsız istek — hiçbir şey yazılmadı. */
  z.object({ status: z.literal('empty') }),
]);
export type ReceiveGoodsResponse = z.infer<typeof ReceiveGoodsResponseSchema>;

// ── D4 · Sayım / düzeltme ───────────────────────────────────────────────────

/**
 * Depocunun seçebileceği sebepler — `return_restock` yok, iade stoğa dönüşü yönetim istisnasıdır; kural tipte durur.
 * Depocu tek listeden seçer, tip-sebep çevirisini sunucu yapar (`recordAdjustment`); liste imha sebeplerinden türer.
 */
export const WarehouseAdjustmentReasonEnum = z.enum([...StockWriteOffReasonEnum.options, 'count_diff']);
export type WarehouseAdjustmentReason = z.infer<typeof WarehouseAdjustmentReasonEnum>;

export const AdjustmentLineSchema = z.object({
  stockId: z.string().uuid(),
  /** Daima pozitif — yön ayrı alanda; işaret miktara gömülmez. */
  qty: z.number().int().positive(),
  /**
   * `out` = stoktan düş, `in` = stoğa ekle (yalnız sayım fazlası). Yön açık alanda, çünkü işarete gömülü yön raporda
   * dönem toplamlarını eksi gösteriyordu.
   */
  direction: StockDirectionEnum,
});
export type AdjustmentLineContract = z.infer<typeof AdjustmentLineSchema>;

export const RecordAdjustmentRequestSchema = z.object({
  lines: z.array(AdjustmentLineSchema),
  reason: WarehouseAdjustmentReasonEnum,
  /** Geri eklemede ZORUNLU — kuralı veritabanı zorlar, sözleşme yalnız yolu açar. */
  note: z.string().nullish(),
});
export type RecordAdjustmentRequest = z.infer<typeof RecordAdjustmentRequestSchema>;

/**
 * Yazımdan sonraki iki sayı — ölçülen, hesaplanan değil: ekranın kendi çıkarması aynı partiye o sırada dokunan başka
 * yazımı yok sayardı. `null` = ölçülemedi ve sıfır değildir; ekran bir şey uydurmaz (CLAUDE §1).
 */
export const AdjustmentAfterSchema = z.object({
  /** Partinin yazımdan sonraki fiili adedi. */
  batchQty: z.number().int(),
  /** Ürünün bu depodaki toplam fiili stoğu — bağlam kartındaki ikinci sayının yeni hâli. */
  variantWarehouseQty: z.number().int(),
});
export type AdjustmentAfter = z.infer<typeof AdjustmentAfterSchema>;

export const RecordAdjustmentResponseSchema = z.discriminatedUnion('status', [
  /** `result.referenceNo` OLAY belgesidir — ekranda gösterilir, kâğıt tutanakla eşleşir. */
  z.object({
    status: z.literal('ok'),
    result: AdjustBatchResultSchema,
    /** TEK partili yazımda dolu; çok partili bir olayda `null` — "hangi partinin yeni hâli" sorusu
        o hâlde tek cevaplı değildir. */
    after: AdjustmentAfterSchema.nullable(),
  }),
  /** Fiziksel gerçek ihlali ("partide 3 var, 5 düşülemez") — mesaj operatöre AYNEN gösterilir. */
  z.object({ status: z.literal('failed'), message: z.string() }),
  /** Başka deponun partisi — hangileri olduğu döner ki operatör satırı bulabilsin. */
  z.object({ status: z.literal('forbidden'), reason: z.literal('out_of_scope'), stockIds: z.array(z.string().uuid()) }),
  z.object({ status: z.literal('not_found'), stockIds: z.array(z.string().uuid()) }),
  z.object({ status: z.literal('empty') }),
]);
export type RecordAdjustmentResponse = z.infer<typeof RecordAdjustmentResponseSchema>;

// ── D5 · Transfer ───────────────────────────────────────────────────────────

export const InboundTransferLineSchema = z.object({
  lineId: z.string().uuid(),
  sourceStockId: z.string().uuid(),
  /** Ürün adı ve boy etiketi ayrı: satır mal kabuldeki gibi "Ürün · boy" yazar; tek boylu üründe `variantLabel` boş dize. */
  productName: z.string(),
  variantLabel: z.string(),
  /** Ürün kapağı — rampada satır resmiyle tanınır; `null` = kapak yok, ekran monogram çizer. */
  imageUrl: z.string().nullable(),
  /** Kaynak partinin lotu ve tarihi: aynı üründen iki parti aynı sevkiyatta gelebilir ve ad ikisini ayırmaz. */
  lotNumber: z.string().nullable(),
  expiryDate: z.string(),
  dispatchedQty: z.number().int(),
  /** **`null` = henüz sayılmadı, `0` = geldi ama kayıp.** İkisi ayrı şeydir (0042). */
  receivedQty: z.number().int().nullable(),
  /**
   * Ürünün kayıtlı koli boyları — rampada sayım koli koli yapılır ve adet çekmecesi çarpanı buradan alır. Boş dizi =
   * kayıtlı koli boyu yok.
   */
  caseSizes: z.array(CaseSizeSchema),
});
export type InboundTransferLineContract = z.infer<typeof InboundTransferLineSchema>;

export const InboundTransferSchema = z.object({
  transferId: z.string().uuid(),
  /** TRF-COL-26-0007 — KAYNAK deponun kodu; kâğıt klasör orada durur. */
  referenceNo: z.string(),
  fromWarehouseId: z.string().uuid(),
  /**
   * Kaynak deponun adı — künye "Kehl → Strasbourg" diyebilsin, yalnız alan deponun adı "oradan geldi" gibi okunurdu. Depo
   * silinmişse `null`, ekran yalnız referansı yazar.
   */
  fromWarehouseName: z.string().nullable(),
  dispatchedAt: z.string(),
  note: z.string().nullable(),
  lines: z.array(InboundTransferLineSchema),
});
export type InboundTransferContract = z.infer<typeof InboundTransferSchema>;

/**
 * Bu depodan çıkmış, hâlâ yolda — transferin öteki yüzü; satırları yok, çünkü gönderen depoda yapılacak iş kalmadı. Tekil
 * kaydın satırları gerekiyorsa kapısı ayrıdır (`readTransferDetail`).
 */
export const OutboundTransferSchema = z.object({
  transferId: z.string().uuid(),
  referenceNo: z.string(),
  /** Hedef deponun KİMLİĞİ; adı bu sözleşmede YOK (depo adı kapsam ucunun işi — hub ekranı künyesi). */
  toWarehouseId: z.string().uuid(),
  dispatchedAt: z.string(),
  lineCount: z.number().int(),
  /**
   * Tahmini varış günü (`YYYY-MM-DD`) = sevk günü + ulaşım süresi ayarı (`transfer_transit_days`).
   * Bir SÖZ değil bir beklentidir: taşıyıcıdan gelen gerçek bir tarih değil, deponun kendi ayarı.
   */
  etaDate: z.string(),
  /** Hedef deponun adı — "Strasbourg → Bordeaux" cümlesinin sağ yarısı; depo silinmişse `null`. */
  toWarehouseName: z.string().nullable(),
  /**
   * Sevkten bu yana geçen gün ve tonu — web'in transfer sekmesiyle aynı üç hâl: `ok` ayarın içinde · `warn` bir gün aştı ·
   * `late` daha fazla. Gecikmiş sevkiyat sessizce durmasın.
   */
  ageDays: z.number().int().nonnegative(),
  ageTone: z.enum(['ok', 'warn', 'late']),
  /** Tahmini varışı KAÇ GÜN aştı — rozetin sayısı ("3 gün gecikti"); ayar içindeyken `0`. */
  lateDays: z.number().int().nonnegative(),
});
export type OutboundTransferContract = z.infer<typeof OutboundTransferSchema>;

/**
 * Son kapananlar — kabul edilmiş ya da geri alınmış sevkiyatlar, iki yön birden; gönderdiğinin kapanışı da depocunun işi.
 * `direction` alandır, çünkü ekran kendi deposunun kimliğini bilmez.
 */
export const ClosedTransferSchema = z.object({
  transferId: z.string().uuid(),
  referenceNo: z.string(),
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
  /** `in` = bu depo aldı, `out` = bu depo gönderdi. */
  direction: z.enum(['in', 'out']),
  status: TransferStatusEnum.extract(['received', 'cancelled']),
  /** Kabul ya da geri alma damgası — kaydın KAPANDIĞI an, sevk anı değil. */
  closedAt: z.string(),
  lineCount: z.number().int(),
  /**
   * Sevk edilenden AZ sayılan satır sayısı — `0` = tam kabul. **Geri alınmışta `null`**: iptal bir
   * kabul değildir, "0 eksik" demek hiç sayılmamış bir sevkiyatı sorunsuz kabul gibi okuturdu
   * (CLAUDE §1 — ölçülemeyen değer sıfır değildir).
   */
  shortLineCount: z.number().int().nullable(),
  /** Eksik gelen toplam adet — satır sayısı değil, rozet "−5 adet" der; geri alınmışta `null`. */
  shortQty: z.number().int().nonnegative().nullable(),
  /** Eksiğin IMH belgesi; eksik yoksa ya da beyan öncesi kayıtsa `null`. */
  shortfallReferenceNo: z.string().nullable(),
  /** Fazla gelen toplam adet — rozet "+2 adet"; geri alınmışta `null`. */
  excessQty: z.number().int().nonnegative().nullable(),
  /** Fazlanın SAY belgesi (`count_diff · in`, transfere bağlı); fazla yoksa `null`. */
  excessReferenceNo: z.string().nullable(),
  /** Karşı taraf tesis mi araç mı: araç yüklemeleri geçmişte "araca / araçtan" diye ayrılır, yoksa depolar arası kaybolur. */
  counterpartKind: WarehouseKindEnum,
  counterpartName: z.string().nullable(),
});
export type ClosedTransferContract = z.infer<typeof ClosedTransferSchema>;

/**
 * `GET /warehouse/transfers` yanıtı — üç bölüm tek turda, yoksa geç gelen bölüm yarım bir gerçeklik gösterirdi.
 * `transfers` ve `outbound` sayfalanmaz, küme fiziksel gerçekle sınırlı ve tam olmalı; `closed` veriyle büyür, sabit sınırlı pencere.
 */
export const WarehouseTransfersResponseSchema = z.object({
  transfers: z.array(InboundTransferSchema),
  outbound: z.array(OutboundTransferSchema),
  closed: z.array(ClosedTransferSchema),
});
export type WarehouseTransfersResponse = z.infer<typeof WarehouseTransfersResponseSchema>;

/**
 * `GET /warehouse/transfers/:transferId` — tek kaydın içi, salt okuma; kalemler liste yanıtına konmaz, nadiren açılan şey
 * için her seferinde ödenmesin. Şema `InboundTransferLineSchema`yı yeniden kullanır: sayılan satırla geçmişte okunan aynıdır.
 */
export const TransferDetailResponseSchema = z.object({
  transferId: z.string().uuid(),
  referenceNo: z.string(),
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
  /** Durum SÜZÜLMEZ — kapanmış, iptal edilmiş ve yoldaki kayıt aynı kapıdan okunur. */
  status: TransferStatusEnum,
  dispatchedAt: z.string(),
  note: z.string().nullable(),
  lines: z.array(InboundTransferLineSchema),
});
export type TransferDetailResponse = z.infer<typeof TransferDetailResponseSchema>;
/** Ekranın okuduğu ad — liste satırlarının `…Contract` kalıbıyla aynı. */
export type TransferDetailContract = TransferDetailResponse;

/**
 * Eksik beyanı — yalnız eksik varken okunur; sebep `transfer_shortfall` (nakliyede kayıp) ya da `damaged` (imha). Not
 * isteğe bağlı: zorunlu tutulsaydı rampada uydurulurdu.
 */
export const TransferShortfallDeclarationSchema = z.object({
  /**
   * Eksiğin sebebi; fazla-yalnız beyanda gönderilmez, fazlanın sebebi yok. Eksik varken boş geçilirse kapı
   * `transfer_shortfall` sayar.
   */
  reason: StockWriteOffReasonEnum.extract(['transfer_shortfall', 'damaged']).nullish(),
  note: z.string().max(500).nullish(),
});
export type TransferShortfallDeclaration = z.infer<typeof TransferShortfallDeclarationSchema>;

/**
 * Transfer kabulü isteği; satır tipi varlık şemasından (`ReceiveLineSchema`). `receivedQty` sıfır olabilir ve bu bir
 * beyandır ("sevk edildi ama gelmedi"), satırı hiç göndermemek ise kabulü bloklar.
 */
export const ReceiveTransferRequestSchema = z.object({
  lines: z.array(ReceiveLineSchema),
  /** Verilmezse ve eksik varsa kapı `transfer_shortfall` sayar, notsuz — web'in kabul formu böyle çağırır. */
  declaration: TransferShortfallDeclarationSchema.nullish(),
});
export type ReceiveTransferRequest = z.infer<typeof ReceiveTransferRequestSchema>;

/** Sayım farkının kaydı — eksik ve fazla için aynı biçim: toplam adet, belge, satır satır fark. */
const TransferDiscrepancySchema = z.object({
  qty: z.number().int().positive(),
  referenceNo: z.string().nullable(),
  lines: z.array(
    z.object({ lineId: z.string().uuid(), dispatchedQty: z.number().int(), receivedQty: z.number().int() }),
  ),
});

export const ReceiveTransferResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    transferId: z.string().uuid(),
    createdBatches: z.number().int(),
    /**
     * Eksik beyanı yazıldıysa: toplam adet, IMH belgesi ve satır satır fark, toast bunları söylesin. Tam kabulde `null`:
     * "0 eksik" yazmak beyan edilmemiş şeyi beyan gibi okuturdu.
     */
    shortfall: TransferDiscrepancySchema.nullable(),
    /**
     * Fazla beyanı yazıldıysa: sevk edilenden fazlası SAY belgesiyle partiye eklendi; fazla yoksa `null`. Eksikle aynı biçim,
     * ikisi aynı sayımın iki yüzü.
     */
    excess: TransferDiscrepancySchema.nullable(),
  }),
  z.object({ status: z.literal('forbidden'), reason: z.literal('out_of_scope') }),
  /** Araya biri girdi: transfer yolda değil. Ekran bunu gösterir, yutmaz. */
  z.object({ status: z.literal('stale'), currentStatus: TransferStatusEnum }),
  /** Sayılmamış (ya da tanınmayan) satır var — kabul YAPILMADI, hangileri olduğu döner. */
  z.object({
    status: z.literal('incomplete'),
    missingLineIds: z.array(z.string().uuid()),
    unknownLineIds: z.array(z.string().uuid()),
  }),
  z.object({ status: z.literal('failed'), message: z.string() }),
  z.object({ status: z.literal('not_found') }),
]);
export type ReceiveTransferResponse = z.infer<typeof ReceiveTransferResponseSchema>;

/**
 * Sevk isteği — kaynak depo gövdede yok: partiler zaten bir depoda duruyor ve kimlik jetondan gelir. Hedef ise iş verisidir.
 */
export const DispatchTransferRequestSchema = z.object({
  toWarehouseId: z.string().uuid(),
  lines: z.array(DispatchLineSchema),
  note: z.string().nullish(),
});
export type DispatchTransferRequest = z.infer<typeof DispatchTransferRequestSchema>;

export const DispatchTransferResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), transferId: z.string().uuid(), referenceNo: z.string() }),
  z.object({
    status: z.literal('forbidden'),
    reason: z.enum(['out_of_scope', 'same_warehouse']),
    stockIds: z.array(z.string().uuid()).optional(),
  }),
  z.object({ status: z.literal('not_found'), stockIds: z.array(z.string().uuid()) }),
  /** RPC reddi — en sık sebebi "kullanılabilir stok yetmiyor" (söz verilmiş mal yola çıkmaz). */
  z.object({ status: z.literal('failed'), message: z.string() }),
  z.object({ status: z.literal('empty') }),
]);
export type DispatchTransferResponse = z.infer<typeof DispatchTransferResponseSchema>;

/** Sevk kaydını geri al (19.6) — "mal hiç çıkmadı". Gerekçe serbest metin, zorunlu değil. */
export const CancelTransferRequestSchema = z.object({ reason: z.string().nullish() });
export type CancelTransferRequest = z.infer<typeof CancelTransferRequestSchema>;

export const CancelTransferResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), transferId: z.string().uuid(), restoredLines: z.number().int() }),
  z.object({ status: z.literal('forbidden'), reason: z.literal('out_of_scope') }),
  z.object({ status: z.literal('stale'), currentStatus: TransferStatusEnum }),
  z.object({ status: z.literal('failed'), message: z.string() }),
  z.object({ status: z.literal('not_found') }),
]);
export type CancelTransferResponse = z.infer<typeof CancelTransferResponseSchema>;

// ── D6 · Kurye dönüşü kabulü ────────────────────────────────────────────────
// Kapı YENİ DEĞİL: `application/order/refund.adjustFulfillment` zaten var ve `warehouseScope`
// parametresini taşıyor. Burada yalnız o kapının uç ZARFI tanımlanıyor — ikinci bir davranış değil.

/**
 * Dönen kolinin tek satırı. `fulfilledQty` hedefin tavanıdır, çünkü `adjust_fulfillment` hedefi karşılanan adedin üstüne
 * çıkaramaz; `pendingQty` akıbeti bekleyen adettir ve sıfırsa ekran satırı ikinci kez göndermez.
 */
export const ReturnDropLineSchema = z.object({
  orderItemId: z.string().uuid(),
  /** "Ürün (boy)" — operasyon dilinde (Türkçe). */
  name: z.string(),
  fulfilledQty: z.number().int(),
  pendingQty: z.number().int().nonnegative(),
  /** Yazılmış akıbetler ve beyanları; bir satırın adetleri farklı akıbet alabilir, depocu ne işaretlediğini satırda görür. */
  returns: z.array(OrderItemReturnSchema.pick({ qty: true, note: true }).extend({ disposition: ReturnDispositionEnum })),
});
export type ReturnDropLineContract = z.infer<typeof ReturnDropLineSchema>;

/**
 * Depoya geri gelen bir sipariş — D6'nın dökümü; para yok, depocu iade tutarını görmez. `note` kuryenin kapıdaki notudur
 * ve akıbet kararının tek bağlamıdır; kuryesiz siparişte `courierName` `null` kalır, ad uydurulmaz.
 */
export const ReturnDropSchema = z.object({
  orderId: z.string().uuid(),
  referenceNo: z.string().nullable(),
  /**
   * Malı getiren kurye — **kimlik**, çünkü rampa listesi dönüşleri kuryeye göre kümeliyor ve ada
   * göre kümelemek iki adaşı tek satırda birleştirirdi. `null` = sipariş bir kuryeye hiç
   * atanmamış (kargo/tezgâh yolu); o dönüşler kendi kümesinde toplanır.
   */
  courierId: z.string().uuid().nullable(),
  courierName: z.string().nullable(),
  note: z.string().nullable(),
  /** `returned`'a geçiş ANI — liste bununla sıralanır. Geçiş kaydı yoksa `null`. */
  returnedAt: z.string().nullable(),
  lines: z.array(ReturnDropLineSchema),
});
export type ReturnDropContract = z.infer<typeof ReturnDropSchema>;

/**
 * `GET /warehouse/returns` yanıtı — bu depoya ne geri geldi, hangisinin akıbeti belirsiz; anahtar deponun rampasıdır,
 * kuryenin günü değil. Ulaşılamayanlar burada yok: mal araçta kalır, sipariş `ready`e döner.
 */
export const WarehouseReturnQueueResponseSchema = z.object({ drops: z.array(ReturnDropSchema) });
export type WarehouseReturnQueueResponse = z.infer<typeof WarehouseReturnQueueResponseSchema>;

/**
 * Rampa listesinin satırı — teslim vermeyi bekleyen bir kurye; para sefer başına, mal kurye başına kapanır ve araç bir kez
 * boşalır. `courierId` `null` olabilir: kargo ya da tezgâh yoluyla dönen siparişler tek kümede toplanır.
 */
export const ReturningCourierSchema = z.object({
  courierId: z.string().uuid().nullable(),
  courierName: z.string().nullable(),
  vehicleLabel: z.string().nullable(),
  /** Akıbeti BEKLEYEN kalem sayısı — işin kendisi. */
  pendingLines: z.number().int().nonnegative(),
  /** Reddedilen siparişin araçtan inecek kutuları. */
  boxesDownCount: z.number().int().nonnegative(),
  /** Ulaşılamayanın ve başka seferlerin kutuları — kabul EDİLMEZ, yalnız sayılır. */
  boxesStayCount: z.number().int().nonnegative(),
  /** Araç deposunda duran serbest ürün TOPLAM adedi (kalem değil adet: rampada sayılan şey adet). */
  freeGoodsQty: z.number().int().nonnegative(),
  /** Sürülen sefer sayısı — doluysa araç bugün boşalmayabilir. */
  drivingRuns: z.number().int().nonnegative(),
  /** En yeni dönüş anı; liste bununla sıralanır. Dönüşü olmayan (yalnız araçta malı olan) satırda `null`. */
  lastReturnAt: z.string().nullable(),
});
export type ReturningCourierContract = z.infer<typeof ReturningCourierSchema>;

export const WarehouseReturningCouriersResponseSchema = z.object({ couriers: z.array(ReturningCourierSchema) });
export type WarehouseReturningCouriersResponse = z.infer<typeof WarehouseReturningCouriersResponseSchema>;

/**
 * Tek kuryenin dönüşü — ekran tek CTA ile iki kapının işini yazdığı için iki cevap tek okumada birleşir. Kuryesiz küme aynı
 * şekli taşır: araç ve kutu listeleri boş, `drops` dolu.
 */
export const WarehouseCourierReturnResponseSchema = z.object({
  courierId: z.string().uuid().nullable(),
  courierName: z.string().nullable(),
  vehicleLabel: z.string().nullable(),
  vehicleWarehouseId: z.string().uuid().nullable(),
  drivingRuns: z.number().int().nonnegative(),
  freeGoods: z.array(CourierReturnFreeGoodSchema),
  boxesDown: z.array(CourierReturnBoxSchema),
  boxesStay: z.array(CourierReturnStayBoxSchema),
  drops: z.array(ReturnDropSchema),
});
export type WarehouseCourierReturnResponse = z.infer<typeof WarehouseCourierReturnResponseSchema>;

/**
 * Dönen malın akıbeti (D6). Satır tipi VARLIK şemasından (`FulfillmentAdjustmentSchema`):
 * `fulfilledQty` **hedef** değerdir (kalan adet), fark değil — v2'nin cümlesi birebir: *"Miktar hedef
 * değer olarak girilir; fark sistemde hesaplanır."*
 *
 * `returnDisposition` üç akıbeti taşır: `restock` (stoğa dön — **sebep notu zorunlu**, soğuk zincir
 * beyanı), `discard` (imha), `goodwill` (jest — mal ve stok DEĞİŞMEZ, yalnız kayıt düşer).
 */
export const WarehouseReturnRequestSchema = z.object({
  adjustments: z.array(FulfillmentAdjustmentSchema),
});
export type WarehouseReturnRequest = z.infer<typeof WarehouseReturnRequestSchema>;

export const WarehouseReturnResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    restockedQty: z.number().int(),
    discardedQty: z.number().int(),
    /** Ayrılmıştan geri bırakılan adet — başkasına satılabilir hâle gelen mal. */
    releasedQty: z.number().int(),
    /** **Cent.** Depocuya gösterilmez; çağıranın (yönetim akışı, defter) okuduğu sayı. */
    refundedAmountCents: z.number().int(),
    paymentStatus: PaymentStatusEnum,
    amountToCollectCents: z.number().int(),
    /**
     * Borç vardı ama iade yazılamadı — sebebiyle; yokluğu "iade tamam" demektir. `split_payment`da ekranın cümlesi "tekrar
     * dene" değil hesap başına elle iadedir, çünkü tek hesaptan yazmak parayı almamış hesabın bakiyesini bozardı.
     */
    refundBlocked: z
      .enum(['no_account', 'provider_ref_missing', 'provider_unavailable', 'provider_failed', 'split_payment'])
      .optional(),
  }),
  z.object({ status: z.literal('forbidden'), reason: z.literal('out_of_scope') }),
  z.object({ status: z.literal('stale'), currentStatus: OrderStatusEnum }),
  /**
   * İstenen adetler zaten yazılmış — ekran bayat ya da istek tekrar; hiçbir satır yazılmadı. `stale`den ayrı: orada sipariş
   * değişmiştir, burada kalemin adetleri.
   */
  z.object({
    status: z.literal('already_marked'),
    orderItemId: z.string().uuid().nullable(),
  }),
  z.object({ status: z.literal('not_found') }),
]);
export type WarehouseReturnResponse = z.infer<typeof WarehouseReturnResponseSchema>;

// ── Tarama · kod çözümü + öğrenen eşleme (Modül 23) ─────────────────────────

/**
 * Okutulan kodun çözümü — TEK tarama sözleşmesi: mal kabul, toplama, transfer ve tezgâh aynı
 * kapıyı çağırır, ekran kaynağın ne olduğunu bilmez (etüt 2.3). Kapı yalnız KİMLİK bulur; stok ve
 * depo kararı mevcut motorlarda kalır (CLAUDE §1 depo değişmezi — barkodla satış kararı verilmez).
 */
export const ResolveCodeRequestSchema = z.object({ code: z.string().min(1) });
export type ResolveCodeRequest = z.infer<typeof ResolveCodeRequestSchema>;

/**
 * Arama zinciri tek kapıda ve sırası sözleşmenin parçası: `barcode → sku → supplier_code`; `source` döner, çünkü SKU
 * eşleşmesi barkod kadar kesin değildir. `unknown` hata değil öğrenme davetidir.
 */
export const ResolveCodeResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('found'),
    variantId: z.string().uuid(),
    /** Operasyon dilinde ad — "Fıstıklı Baklava" + boy etiketi ("500 g"; tek boyluda boş). */
    productName: z.string(),
    variantLabel: z.string(),
    kind: z.enum(['unit', 'case']),
    /** Bu kod kaç adet sayılır — koli kodunda çarpan, SKU/tedarikçi kodunda 1. */
    qtyPerCode: z.number().int().positive(),
    source: z.enum(['barcode', 'sku', 'supplier_code']),
    /**
     * Varyantın kendi kodu (`sku`), okutulan kod değil — arama ve okutma aynı alanı göstermeli. `null` = varyanta SKU
     * girilmemiş, boş dize değil.
     */
    sku: z.string().nullable(),
    /**
     * Ürünün tarih rejimi + toplam raf ömrü — plansız kabulde OKUTMA SATIR AÇAR ve o satır SKT
     * ister. PO'lu formda aynı iki alan satırla geliyor (`IntakeFormRowSchema`); okutmayla açılan
     * satır onlarsız kalsaydı aynı listede bir satır ömür uyarısı üretir, ötekisi üretmezdi.
     */
    dateType: ProductDateTypeEnum,
    shelfLifeDays: z.number().int().nullable(),
    /** Ürün görseli (public URL) — okutma çekmecesinin "doğru malı mı tuttum" bakışı; yoksa null. */
    imageUrl: z.string().nullable(),
    /**
     * Ürünün kayıtlı koli boyları — PO'lu formda satırla geliyor (`IntakeFormRowSchema`), plansız
     * kabulde SATIRI OKUTMA AÇIYOR ve o satır da adet çekmecesini açacak. Okutmayla açılan satır
     * bu listesiz kalsaydı aynı listede bir satır koli sayabilir, ötekisi sayamazdı — `sku`,
     * `dateType` ve `shelfLifeDays` aynı gerekçeyle burada.
     */
    caseSizes: z.array(CaseSizeSchema),
  }),
  z.object({ status: z.literal('unknown') }),
]);
export type ResolveCodeResponse = z.infer<typeof ResolveCodeResponseSchema>;

/**
 * Parti kodunun çözümü — `codes/resolve` kodu varyanta çevirir, sayımın sorusu ise "raftaki hangi parti"dir. Eşleşme
 * çoğuldur, çünkü lot numarası benzersiz değil; tekile indirmek sayımı depocunun görmediği partiden düşürürdü.
 */
export const ResolveBatchRequestSchema = z.object({ code: z.string().min(1) });
export type ResolveBatchRequest = z.infer<typeof ResolveBatchRequestSchema>;

/** Çözülen parti — sayım ekranının konusu; para yok, partinin alışı depo yolundan geçmez. */
export const ResolvedBatchSchema = z.object({
  stockId: z.string().uuid(),
  variantId: z.string().uuid(),
  /** "Ürün (boy)" — operasyon dilinde; ekranın üstbaşlığında görünen ad. */
  name: z.string(),
  /**
   * Parti numarası (`PRT-STR-26-0031`) — partinin bizim kimliğimiz, her partide var; lot (tedarikçinin numarası) yanına
   * yazılır. Okutma ikisini de tanır.
   */
  batchNo: z.string(),
  /**
   * Partinin lot numarası; raf listesinde `null` olabilir, çünkü mal kabulde lot boş bırakmak meşrudur. Lotsuz partiyi
   * düşürmek sayımın en çok gerektiği partiyi gizlerdi; ekran "lot yazılmamış" der, kod uydurmaz.
   */
  lotNumber: z.string().nullable(),
  expiryDate: z.string(),
  /**
   * Tarih rejimi — `DLC` (geçince satılamaz) / `DDM` (geçince satılır); tarihin yanında durur, çünkü rejimi söylenmeyen
   * tarih satılabilir malı imha ettirebilir.
   */
  dateType: ProductDateTypeEnum,
  /** Kayıttaki fiili adet — sayımın karşılaştıracağı sayı. */
  physicalQty: z.number().int(),
  /** Partinin alanının adı ("Derin dondurucu 2"); rafı seçilmemiş partide `null`. */
  storageAreaName: z.string().nullable(),
  /**
   * Alanın kimliği — "depocunun aktif alanı bu partinin alanı mı" adla sorulamaz, ad değişebilir. `null` = rafı bilinmiyor.
   */
  storageAreaId: z.string().uuid().nullable(),
  /** Ürün kapağı (public URL) — seçici satırının solundaki kare; kapaksız üründe `null`. */
  imageUrl: z.string().nullable(),
  /**
   * Kalan raf ömrü yüzdesi. **`null` = ölçülemedi** (ürünün toplam ömrü girilmemiş) ve sıfır
   * DEĞİLDİR — "%0" yazmak sağlam bir partiyi imhalık gösterirdi (CLAUDE §1).
   */
  lifePercent: z.number().nullable(),
  /**
   * Ürünün bu depodaki toplam fiili stoğu — parti adedinin yanında durur ki "ürün bitiyor mu" sorusu kararın bağlamında
   * cevaplansın. Depo süzgeçli (CLAUDE §1): depo-üstü toplam başka şehrin malını burada varmış gibi gösterirdi.
   */
  variantWarehouseQty: z.number().int(),
  /** Ürünün kayıtlı koli boyları — rafta koli de durur, sayım çekmecesi çarpanı buradan alır. */
  caseSizes: z.array(CaseSizeSchema),
});
export type ResolvedBatchContract = z.infer<typeof ResolvedBatchSchema>;

/**
 * `unknown` bir hata değil bir CEVAPTIR: kod bu depoda açık bir partiye denk gelmiyor. Ekran
 * "başka deponun partisi olabilir" diyemez ve dememeli — kapsam dışı partiyi göstermek, depocuya
 * düşemeyeceği bir satırı düşürtmeye çalıştırırdı (`recordAdjustment`ın `out_of_scope` reddi).
 */
export const ResolveBatchResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('found'), batches: z.array(ResolvedBatchSchema) }),
  z.object({ status: z.literal('unknown') }),
]);
export type ResolveBatchResponse = z.infer<typeof ResolveBatchResponseSchema>;

/**
 * Raf listesi — `GET /warehouse/batches?q=…`; okunamayan etiketli partinin de sayılabilmesi için. Sıra son kullanma
 * tarihine göre: rafta ilk elden çıkacak parti listenin başındadır.
 */
export const WarehouseBatchesResponseSchema = z.object({
  batches: z.array(ResolvedBatchSchema),
  /**
   * Sonraki sayfanın imleci — opak dize, istemci `?cursor=` diye geri verir; `null` = liste bitti. Küme veriyle büyüdüğü
   * için keyset + sonsuz kaydırma (CLAUDE §1).
   */
  nextCursor: z.string().nullable(),
});
export type WarehouseBatchesResponse = z.infer<typeof WarehouseBatchesResponseSchema>;

/*
  Deponun alanları: parti tek alanda durur ve depo içi taşıma işlemi yoktur; alan partinin son görüldüğü yerdir ve sistem
  onu sayımda depocunun önünde durduğu dolaptan öğrenir. Adet bölünmez, hareket defterine satır düşmez.
*/

/**
 * Deponun alanı — seçici için dar görünüm. Sıcaklık aralıkları ve denetim beklentisi burada
 * YOK: sayım ekranı "hangi dolap" diye soruyor, "kaç derece olmalı" diye değil.
 */
export const WarehouseAreaSchema = StorageAreaSchema.pick({ id: true, name: true, kind: true, sortOrder: true });
export type WarehouseAreaContract = z.infer<typeof WarehouseAreaSchema>;

/** `GET /warehouse/areas` — depo süzgeci jetondan. Yalnız AÇIK alanlar: pasif dolap seçilemez. */
export const WarehouseAreasResponseSchema = z.object({ areas: z.array(WarehouseAreaSchema) });
export type WarehouseAreasResponse = z.infer<typeof WarehouseAreasResponseSchema>;

/** `POST /warehouse/batches/:stockId/seen` — parti bu alanda görüldü. */
export const MarkBatchSeenRequestSchema = z.object({ storageAreaId: z.string().uuid() });
export type MarkBatchSeenRequest = z.infer<typeof MarkBatchSeenRequestSchema>;

export const MarkBatchSeenResponseSchema = z.discriminatedUnion('status', [
  /** `changed: false` = parti zaten oradaydı; yazım yok, cevap yine `ok` (çift dokunuş hata değil). */
  z.object({ status: z.literal('ok'), changed: z.boolean(), storageAreaName: z.string() }),
  /** Alan bu deponun değil ya da kapatılmış — kapsam dışı partiyle AYNI şey değil, ayrı söylenir. */
  z.object({ status: z.literal('invalid_area') }),
  z.object({ status: z.literal('forbidden'), reason: z.literal('out_of_scope') }),
  z.object({ status: z.literal('not_found') }),
]);
export type MarkBatchSeenResponse = z.infer<typeof MarkBatchSeenResponseSchema>;

/**
 * Plansız kabulün ürün araması — `GET /warehouse/variants?q=…`; PO'lu kabulde arama yok, satırlar siparişten gelir.
 * Satırda fiyat yok, depo yolu fiyat görmez.
 */
/*
  ══ D3 · YAKIN-SKT TURU ═════════════════════════════════════════════════════
  Depocunun ömrü azalan partileri gezip karar verdiği liste. Ekran BUGÜNE KADAR FİKSTÜRLE
  çalışıyordu (`near-expiry-fixture.ts`) ve gerekçesi uç künyesinde yazılıydı: motor vardı
  (`batch-view.ts`) ama kapı yoktu.
*/

/**
 * Yakın-SKT listesinin bir satırı — bir parti, bir ürün değil: aynı ürünün iki partisi iki ayrı karar bekler ve depocu
 * rafta partiyi etiketinden bulur.
 */
export const NearExpiryBatchSchema = z.object({
  stockId: z.string().uuid(),
  /** Parti numarası — bizim kimliğimiz, hep var; satırın künyesi bununla başlar. */
  batchNo: z.string(),
  /** Tedarikçinin lotu — geri çağırma anahtarı; yazılmamış olabilir, o zaman satırda hiç görünmez. */
  lotNumber: z.string().nullable(),
  productName: z.string(),
  variantLabel: z.string(),
  qty: z.number().int(),
  expiryDate: z.string(),
  /**
   * Bugünden son kullanma tarihine kalan gün; geçmiş partide negatif. Aciliyet rengi bundan türer ve taşınmaz: renk ekranın
   * kararıdır, taşısaydık aynı eşik iki yerde yaşardı.
   */
  daysLeft: z.number().int(),
  /**
   * Kalan ömür yüzdesi (0–100); `null` = ölçülemedi, sıfır değil (CLAUDE §1). Raf ömrü girilmemişse "%0" partiyi imhalık
   * gösterirdi, ekran çubuğu hiç çizmez.
   */
  remainingPercent: z.number().nullable(),
  /**
   * Partinin bugün beklediği karar — motorun dili (`OfferDecision`), ekranın değil.
   *
   * Ekran kendi sözlüğüyle çevirir; sözleşmede ikinci bir adlandırma açmak (fikstürün
   * `offer_candidate`/`discard` çifti gibi) aynı kavramı iki dilde yaşatmak olurdu.
   */
  decision: z.enum(['none', 'can_offer', 'offer_open', 'must_discard']),
  /** Kalan ömür işletmenin MLOR eşiğinin altında mı — satılabilirliğin ayrı sorusu. */
  belowMlor: z.boolean(),
  /**
   * Tarih rejimi — kararın sebebi: "DLC geçti = satılamaz · DDM geçti = satılabilir". Sebep yazılmazsa depocu satılabilir
   * malı imha etmeye kalkabilirdi.
   */
  dateType: ProductDateTypeEnum,
  /**
   * Partinin rafı — depocu malı orada arayacak. Alan atanmamışsa `null`; uydurma bir raf adı,
   * depocuyu olmayan bir rafa gönderirdi.
   */
  shelfLabel: z.string().nullable(),
  /**
   * Ürünün bu depodaki toplam stoğu — imha çekmecesinin bağlamı: parti adedi "bu ürün bitiyor mu" sorusunu cevaplamaz.
   * Para değil stok: fiyat yasağı para içindir (CLAUDE §2).
   */
  productStockQty: z.number().int(),
});
export type NearExpiryBatchContract = z.infer<typeof NearExpiryBatchSchema>;

/**
 * **PARA YOK ve bu şemanın değil KAPININ kararı** (CLAUDE §2 · depo yüzeyi): motor fiyat da
 * üretiyor (`listPriceCents`, `suggestedOfferCents`) ama depo ekranı tutar görmez. Alanı
 * taşımamak, ekranın onu bir gün "sadece bilgi olsun" diye çizmesinin önünü kapatıyor.
 */
export const NearExpiryResponseSchema = z.object({ batches: z.array(NearExpiryBatchSchema) });

export const VariantSearchRowSchema = z.object({
  variantId: z.string().uuid(),
  productName: z.string(),
  variantLabel: z.string(),
  sku: z.string().nullable(),
  /**
   * Ürünün tarih rejimi + toplam raf ömrü. Plansız kabulde SEÇİLEN ÜRÜN SATIR OLUR ve o satır SKT
   * ister; okutmayla açılan satır da (`ResolveCodeResponseSchema`) aynı iki alanı taşıyor — aynı
   * listede bir satırın ömür uyarısı üretip ötekinin üretmemesi, kaynağa göre değişen bir kuraldır.
   */
  dateType: ProductDateTypeEnum,
  shelfLifeDays: z.number().int().nullable(),
  imageUrl: z.string().nullable(),
  /**
   * Personelin deposundaki kullanılabilir adet ("GAZ-7120 · stok 24") — depo-üstü toplam kimsenin stoğu değildir,
   * rezervasyon düşülmüştür. `0` gerçek bir cevaptır: kapı personelin deposunu bilir ve satırı olmayan varyant sıfırdır.
   */
  stockQty: z.number().int(),
  /** Kod eşleşmesiyle bulunduysa bir okutmanın kaç adet saydığı; ad aramasında `null`. */
  qtyPerCode: z.number().int().positive().nullable(),
  /**
   * Ürünün kayıtlı koli boyları — aramadan seçilen ürün SATIR oluyor ve o satır adet çekmecesini
   * açıyor. Üstteki `qtyPerCode` okutulan KODUN çarpanıdır (tek sayı), bu ise ürünün bütün
   * boylarıdır; ikisi ayrı sorunun cevabı (`CaseSizeSchema` künyesi).
   */
  caseSizes: z.array(CaseSizeSchema),
});
export type VariantSearchRowContract = z.infer<typeof VariantSearchRowSchema>;

/**
 * Sayfalanmaz: arama zaten DARALTMA aracı ve kapı kendi tavanını taşıyor (`DEFAULT_LIMIT`).
 * Tavansız bir okuma bir gün sessizce kesilirdi; sayfalı bir arama ise depocuyu ikinci sayfaya
 * göndermek olurdu — cevap ilk turda gelmeliyse sorgu daraltılmalıdır.
 */
export const VariantSearchResponseSchema = z.object({ variants: z.array(VariantSearchRowSchema) });
export type VariantSearchResponse = z.infer<typeof VariantSearchResponseSchema>;

/** Öğrenen eşleme: tanınmayan kod bir varyanta bağlanır — kabul ekranının "bu kod hangi ürün?"
    cevabı. `kind`/`qtyPerCode` verilmezse `unit`/1 (koli olduğu biliniyorsa çarpanla gelir). */
export const LearnCodeRequestSchema = z.object({
  code: z.string().min(1),
  variantId: z.string().uuid(),
  kind: z.enum(['unit', 'case']).optional(),
  qtyPerCode: z.number().int().positive().optional(),
});
export type LearnCodeRequest = z.infer<typeof LearnCodeRequestSchema>;

/**
 * `already_bound` bir ret ve cevabın kendisi: kod BAŞKA varyanta bağlıysa ikinci bağ yazılmaz
 * (kural veride — `variant_barcode_code_uq`); ekran hangi varyanta bağlı olduğunu söyler ki
 * depocu yanlışı fark edebilsin. Düzeltme web varyant editöründen (sil + yeniden öğret).
 */
export const LearnCodeResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok') }),
  z.object({
    status: z.literal('already_bound'),
    variantId: z.string().uuid(),
    productName: z.string(),
    variantLabel: z.string(),
  }),
]);
export type LearnCodeResponse = z.infer<typeof LearnCodeResponseSchema>;

// ── D9 · Gel-al teslim ───────────────────────────────────────────────────────

/**
 * `GET /warehouse/pickup` — **müşterisini bekleyen gel-al siparişleri**: hazır (`ready`) ve `delivery_type = 'pickup'`, bu
 * deponun. Hazırlık kuyruğunun "tamamlananlar" yüzünden ayrı bir liste, çünkü orası taşıyıcıya gidecek kutuları sayar;
 * burada bekleyen müşteridir ve süre (`waitingDays`) kararın girdisidir — randevu sistem dışı (telefon), mal süresiz
 * ayrılmış kalamaz.
 */
export const PickupQueueOrderSchema = z.object({
  orderId: z.string().uuid(),
  referenceNo: z.string().nullable(),
  /** Hesap sahibi — tezgâhta "kim için" sorusunun cevabı; alıcı adı değil, çünkü gel-al'da kapıya giden yok. */
  customerName: z.string().nullable(),
  channel: ChannelEnum,
  lineCount: z.number().int().nonnegative(),
  boxCount: z.number().int().nonnegative(),
  /** Kutu kodları — tezgâhta okutulur; ekran yabancı kodu buradan ayırır, simülasyon çipini buradan kurar. */
  boxes: z.array(z.object({ boxNo: z.number().int().positive(), code: z.string() })),
  /** `ready`ye ilk geçiş anı; defterde yoksa `null` (eski kayıt) — süre o zaman hesaplanmaz. */
  readyAt: z.string().nullable(),
  waitingDays: z.number().int().nonnegative().nullable(),
  /** Tezgâhta alınacak para (cent); online ödenmiş ya da vadeli siparişte 0. */
  amountDueCents: z.number().int().nonnegative(),
  onAccount: z.boolean(),
  paymentStatus: PaymentStatusEnum,
});
export type PickupQueueOrderContract = z.infer<typeof PickupQueueOrderSchema>;

export const PickupQueueResponseSchema = z.object({
  orders: z.array(PickupQueueOrderSchema),
  /** Tezgâh tahsilatının gireceği kasa (deponun kapı kasası ayarı); boşsa ekran tahsilat bloğunu kapalı çizer. */
  cashAccountId: z.string().uuid().nullable(),
});
export type PickupQueueResponse = z.infer<typeof PickupQueueResponseSchema>;

/**
 * `POST /warehouse/pickup/:orderId/deliver` — müşteriye teslim. Kutu okutması rota kapısıyla aynı şart (tüm kutular),
 * tahsilat kuryenin kapı tahsilatıyla aynı şekil (`DoorCollectionInputSchema`): yöntem, tutar, kasa, tekrar anahtarı.
 */
export const PickupDeliverRequestSchema = z.object({
  scannedBoxCodes: z.array(z.string()).default([]),
  collection: DoorCollectionInputSchema.nullish(),
});
export type PickupDeliverRequest = z.infer<typeof PickupDeliverRequestSchema>;

export const PickupDeliverResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    /** Fiilen yazılan tahsilat (cent); tahsilat yoksa 0. */
    collectedCents: z.number().int(),
    /** Teslim sonrası kalan borç (cent). */
    amountDueCents: z.number().int(),
    paymentStatus: PaymentStatusEnum,
    /** Nakit yasal sınırı aşıldı mı — engel değil, bilgi (DOMAIN §7). */
    cashLimitExceeded: z.boolean(),
    /** Tahsilat bu istekte yazılmadı; aynı anahtarla zaten yazılmıştı. */
    collectionDeduped: z.literal(true).optional(),
  }),
  /** Okutulmamış kutu var — teslim YAZILMADI; kalan kutuların numarası döner. */
  z.object({ status: z.literal('boxes_missing'), remainingBoxNos: z.array(z.number().int()) }),
  /** Sipariş hazır değil (henüz toplanıyor ya da çoktan teslim edilmiş). */
  z.object({ status: z.literal('not_ready'), currentStatus: OrderStatusEnum }),
  /** Sipariş gel-al değil — rota ve kargo bu kapıdan teslim edilmez. */
  z.object({ status: z.literal('not_pickup') }),
  z.object({ status: z.literal('forbidden'), reason: z.literal('out_of_scope') }),
  z.object({ status: z.literal('not_found') }),
]);
export type PickupDeliverResponse = z.infer<typeof PickupDeliverResponseSchema>;
