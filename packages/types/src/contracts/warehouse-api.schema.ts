import { z } from 'zod';
import { FulfillmentAdjustmentSchema, PreparationPickSchema } from '../entities/order.schema';
import { ProductDateTypeEnum } from '../entities/product.schema';
import { AdjustBatchResultSchema, StockDirectionEnum, StockWriteOffReasonEnum } from '../entities/stock-movement.schema';
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
} from '../primitives/enums.schema';

/**
 * Depo SÖZLEŞME şemaları (21.11) — mobil `/api/v1/warehouse/*` uçlarının ve onları tüketen "Depo"
 * bölümünün (D1 · D2 · D4 · D5 · D6) ORTAK dili.
 *
 * Gerekçe `courier-api.schema.ts` ile aynı (02-mimari §3.2 "sözleşme tek kaynak"): şema uçta
 * yaşarken istemci ya kendi tipini elle yazar (ikinci sözleşme) ya da hiç doğrulamaz.
 *
 * ── ALANLAR `@lezzet/application`IN DEPO KAPILARININ AYNASIDIR ────────────────
 * Kaynak `packages/application/src/warehouse/{preparation,intake,adjustment,transfer}.ts` ve D6
 * için `order/refund.ts`. Uç, orkestrasyonun döndürdüğü şekli **indirgemez, yeniden adlandırmaz,
 * alan eklemez**. Buradaki her alanın bugün gerçekten taşınan bir davranışı vardır; ileride
 * gerekebilecek hiçbir alan şimdiden açılmadı — hub sayaçları ve D3 (yakın-SKT) listesi burada
 * YOK, çünkü karşılıkları henüz bir kapıda değil.
 *
 * ── `warehouseId` HİÇBİR İSTEK GÖVDESİNDE YOK, VE BU BİR KARAR ───────────────
 * Kapıların hepsi depo kimliğini ZORUNLU parametre alır (CLAUDE.md §1: varsayılan depo YOKTUR) ama
 * o kimlik **jetondan/personelin sabit deposundan** gelir, gövdeden değil. Gövdeye konsaydı depocu
 * başka deponun kimliğini yazıp onun malını düşebilirdi — yetkilendirme, doğrulanmamış bir girdiye
 * dayanamaz. (Sevkin HEDEF deposu istisnadır: o bir iş verisi, kimlik değil.)
 *
 * ── PARA BU DOSYADAN GEÇMEZ (D6 hariç, ve gerekçesiyle) ─────────────────────
 * Depo şemalarında tutar, maliyet, kâr alanı YOKTUR — tasarımın altın kuralı burada veri şeklinde
 * duruyor (v2: *"Depo ekranları fiyat/tutar görmez"*). Tek istisna D6'nın yanıtıdır: kurye dönüşü
 * bir SİPARİŞ düzeltmesidir ve iade tutarını çağıran (yönetim akışı) okur.
 *
 * ── OLUMSUZ SONUÇLAR DA SÖZLEŞMENİN İÇİNDE ──────────────────────────────────
 * `forbidden` / `stale` / `incomplete` / `pinned_violation` birer HATA DEĞİL, cevabın kendisidir ve
 * ekranın göstermesi gerekir. Bu yüzden yanıtlar ayrımlı birleşim (`discriminatedUnion`): taşıdıkları
 * bilgi (hangi parti, hangi satır, hangi durum) bir HTTP koduna indirgenirse kaybolur.
 */

// ── D1 · Hazırlık (toplama) ─────────────────────────────────────────────────

/** Motorun önerdiği tek parti — depocunun rafta arayacağı şey. Fiyat YOK. */
export const PreparationSuggestionSchema = z.object({
  stockId: z.string().uuid(),
  qty: z.number().int(),
  expiryDate: z.string(),
  /**
   * Partinin alanının ADI ("Derin dondurucu 2") — kimliği DEĞİL (19.29).
   *
   * Alan artık tanımlı bir kayıt (`storage_area`) ama sözleşme adı taşıyor: depocu rafta bir uuid
   * aramıyor, tabelayı okuyor. Kimliği göndermek telefona ikinci bir okuma yaptırırdı; ad zaten
   * sunucuda elimizde. Alan adı depo içinde benzersiz, yani ad burada da tekil bir işaret.
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
   * **Ürün kapağının public URL'i** (kullanıcı isteği 31.08) — `null` = kapaksız ürün, ekran iki
   * harflik monograma düşer.
   *
   * EK OKUMA İSTEMİYOR: kuyruk zaten `variantNames`i çağırıyor ve o fonksiyon `imageUrl`i çoktan
   * çözüyor (mal kabulün okutma çekmecesi için yazılmıştı, `names.ts`). Alan yalnız taşınmıyordu.
   *
   * Niçin gerekli: toplama artık OKUTMA eksenli — depocu satırı listede aramıyor, okutuyor. Ama
   * kontrol listesinde "ne kaldı" sorusuna bakarken aynı ürünün iki boyu (225 g / 450 g) yan yana
   * duruyor ve metin ayırt etmeye yetmiyor; arama çekmecesinde ölçülen ihtiyacın aynısı (30.08).
   */
  imageUrl: z.string().nullable(),
  /**
   * Kalemin PAKET barkodu; `null` = barkodu girilmemiş ürün.
   *
   * Kamerasız turun simülasyon çiplerini bu siparişin ÜRÜNLERİNE bağlar (kullanıcı isteği 31.08):
   * okutucu açıldığında çipler ürün adıyla ve GERÇEK kodla çiziliyor. Kısa devre yok — çipe basmak
   * `/codes/resolve`'un aynı yolundan geçiyor, yani simülasyonla bulunan arıza cihazda da tekrar
   * eder (`dev-scan-pool.ts` künyesinin kuralı).
   */
  barcode: z.string().nullable(),
  orderedQty: z.number().int(),
  /** Daha önce toplanmış adet — **yarım iş sürer**, ekran kaldığı yerden devam eder. */
  pickedQty: z.number().int(),
  /**
   * Kalemin ŞU ANDA yazılı parti dağılımı (21.11d) — boş dizi = henüz hiç toplanmamış.
   *
   * ── NEDEN ŞEKİL YAZIM ŞEMASININ AYNISI ──────────────────────────────────────
   * Alan `PreparationPickSchema.shape.batches`ten TÜRER, elle yazılmaz: yazım sözleşmesi absolüttür
   * (`record_preparation`, 0015 künyesi — *"önceki parti kaydı tamamen yenisiyle değişir"*), yani
   * ekranın göndereceği dizi bu dizinin devamıdır. İki şekli ayrı tanımlamak, aynı kalemi iki dilde
   * konuşmak ve bir gün ayrışmalarına izin vermek olurdu.
   *
   * ── NE ÇÖZÜYOR ──────────────────────────────────────────────────────────────
   * Bu alan olmadan yarım kalmış bir kalemin eski dağılımı ekrandan yeniden ÜRETİLEMİYORDU: adet
   * alanı "toplam kaç topladım"ı değil "bu kayıtla kaç yazıyorum"u sormak zorunda kalıyor,
   * varsayılanı 0 oluyordu (mobil `use-preparation.hook.ts` künyesi). Dağılım gelince alan
   * kümülatife döner — ve kritik olan şu: eksik kalanı "ilk öneri partisine" eklemek parti atamasını
   * TAHMİN etmek olurdu; geri çağırmanın dayandığı kayıt tahminle yazılmaz.
   *
   * `suggestion` ile karıştırılmaz: o motorun ÖNERİSİ (ne alınmalı), bu depocunun YAZDIĞI gerçek
   * (ne alınmış). İkisi çakışmak zorunda değil — depocu öneriden sapabilir (DOMAIN §4).
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
 * Siparişin bir kutusu — kuyrukla birlikte gelir (23.6). `sealedAt null` = açık kutu (masada
 * dolduruluyor). `items` kutuya KONMUŞ kalemlerdir: mobil ekran "bu kalemden kaç adet zaten
 * kutulandı"yı bundan türetir, web paneli yalnız sayar ("2 kutu · 1 kapalı").
 */
export const PreparationBoxSchema = z.object({
  boxId: z.string().uuid(),
  boxNo: z.number().int().positive(),
  /** QR'ın içeriği (`KT-…`) — sipariş referansı DEĞİL (Netleşecek 4). */
  code: z.string(),
  sealedAt: z.string().nullable(),
  items: z.array(z.object({ orderItemId: z.string().uuid(), qty: z.number().int().positive() })),
  /**
   * Hangi KARGO KUTUSU tipiyle açıldı (07.12) — `null` = tip seçilmedi (rota kulvarı ya da
   * seçimden önce açılmış kutu). Yalnız kimlik taşınır, ADI değil: ekran zaten kutu tipleri
   * listesini okuyor (`GET /warehouse/shipping-boxes`) ve adı ikinci kez göndermek aynı bilgiyi
   * iki kaynaktan taşımak olurdu — biri bir gün ötekiyle çelişirdi.
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
  /**
   * Adrese GİDEN kişi — koliye yazılacak ad (kullanıcı kararı 21.08; kapı künyesi
   * `preparation.ts:recipientName`). `null` = adreste alıcı yazılı değil, ekran müşteri adını
   * kullanır. Kapı alanı zaten dolduruyordu; sözleşmeye 23.3 turunda girdi (mobil şeridin
   * işareti: alan yazılıyor ama D1'e hiç ulaşmıyordu).
   */
  recipientName: z.string().nullable(),
  channel: ChannelEnum,
  status: OrderStatusEnum,
  deliveryDate: z.string().nullable(),
  /**
   * Hangi kulvar — `shipping` ise sipariş taşıyıcıya verilecek (07.12). Ekran bunu kutu tipi
   * SORULACAK MI sorusu için okuyor: rota siparişinde kargo kutusu seçimi anlamsızdır (kutu
   * araca biner, taşıyıcıya değil) ve sormak depocuya cevabı olmayan bir soru sormaktır.
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
 * Eksik kalan kalemin motor tavsiyesi — **tutar taşımaz** (depocu parayı görmez; motor tutarı yalnız
 * KARAR girdisi olarak alır).
 *
 * Değerler `domain-core/stock/shortfall`ın aynası. Zod karşılığı burada yeniden yazılıyor çünkü
 * `@lezzet/types` motoru BİLMEZ (bağımlılık tek yönlü: domain-core → types). Ayrışma riski
 * ölçülebilir: iki liste de küçük ve ikisi de tek yerde duruyor.
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
  /**
   * **Kargo siparişi kutusuz onaylanamaz** (kullanıcı kararı 28.08). Ölçü ve ağırlık kutu
   * tipinden geliyor; kutusuz kapanan sipariş "hazır" görünüp sevk edilemez hâlde kalırdı.
   */
  z.object({ status: z.literal('box_required') }),
  z.object({ status: z.literal('forbidden'), reason: z.literal('out_of_scope') }),
  z.object({ status: z.literal('not_found') }),
]);
export type ConfirmPreparationResponse = z.infer<typeof ConfirmPreparationResponseSchema>;

// ── D1 · Kutu döngüsü (23.6 — karar §1.4) ───────────────────────────────────

/**
 * **KARGO KUTUSU SEÇENEĞİ** (07.12) — deponun benimsediği dış kutu tiplerinden biri.
 *
 * Varyantın kendi ambalajıyla karıştırılmaz: `packed_*` "bu ürün paketiyle ne kadar yer kaplar"
 * der, bu ise "onları içine koyduğumuz kutu ne" der (`ShippingBoxSchema` künyesi).
 *
 * Ölçüler depocuya BİLGİ olarak taşınıyor, karar olarak değil: liste kısa ve fiziksel kutular
 * birbirine benziyor — "40×30×25" satırı, adı ezberlememiş depocunun elindekini tanımasını
 * sağlar. Sözleşme sistem şablonlarını HİÇ taşımaz (yalnız deponun benimsedikleri gelir);
 * şablon seçilemez, benimsenir (Depolar ekranının işi).
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
 * Kutu açılış gövdesi — TEK alan ve o da isteğe bağlı.
 *
 * Gövde 23.6'da bilerek YOKTU (*"kutunun içeriği doğumda yoktur"*) ve o gerekçe hâlâ geçerli:
 * burada gelen şey içerik değil, kutunun FİZİKSEL KİMLİĞİ — depocunun eline aldığı karton.
 * Kargo kulvarında gönderi ağırlığı ve ölçüsü bundan çıkıyor, yani seçim sipariş açılışında
 * yapılmazsa duyuru anında tahmine düşülürdü (§4.4).
 *
 * `null` meşru: rota siparişinde kutu tipi sorulmaz ve kargo siparişinde de depo hiç kutu
 * benimsememiş olabilir. Eksik ölçü SIFIR değildir — duyuru kapısı ölçüsüz kutuyu ön koşulda
 * durdurur ve sebebini söyler.
 */
export const OpenBoxRequestSchema = z.object({
  shippingBoxId: z.string().uuid().nullable().default(null),
});
export type OpenBoxRequest = z.infer<typeof OpenBoxRequestSchema>;

/**
 * Kutu açılışının cevabı. `stale` bir hata değil cevabın kendisidir: sipariş artık toplanabilir
 * durumda değil (araya biri girdi — teslim edildi, iptal oldu) ve ekran hangi durumda olduğunu
 * söyleyebilmeli.
 *
 * `unknown_box` ayrı bir daldır ve `not_found`a katlanmaz: sipariş duruyor, KUTU TİPİ geçersiz
 * (başka deponun kutusu ya da kapatılmış bir tip). İkisi tek cevaba indirgenseydi depocu var olan
 * bir siparişi yok sanardı — ve gerçek çare listeyi tazelemek olurdu.
 */
export const OpenBoxResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), box: PreparationBoxSchema }),
  z.object({ status: z.literal('forbidden'), reason: z.literal('out_of_scope') }),
  z.object({ status: z.literal('stale'), currentStatus: OrderStatusEnum }),
  z.object({ status: z.literal('unknown_box') }),
  z.object({ status: z.literal('not_found') }),
]);
export type OpenBoxResponse = z.infer<typeof OpenBoxResponseSchema>;

// ── D1 · Sevk: teklif + duyuru (07.12) ──────────────────────────────────────

/**
 * **SEVKİN ÖN KOŞULU TUTMADI** — teklif ve duyuru AYNI kümeyi paylaşır.
 *
 * Hepsi adlı, çünkü depocunun sorusu "olmadı" değil **"neden olmadı"**: ölçüsüz mal tartıya
 * gider, tipsiz kutu ekrandan seçilir, adressiz sipariş yönetime sorulur. Tek bir `error`a
 * indirgemek, üç ayrı işi tek bir çıkmaza çevirirdi.
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
  /** Teslim süresi; **`null` yaygın bir hâl** — bazı taşıyıcılar bildirmiyor (ölçüldü 28.08). */
  leadTimeHours: z.number().int().nullable(),
  lastMile: z.string().nullable(),
  tracked: z.boolean(),
});
export type DispatchOptionContract = z.infer<typeof DispatchOptionSchema>;

/**
 * `GET /warehouse/orders/:orderId/dispatch-options` — GERÇEK kolilere göre teklif.
 *
 * Checkout'un teklifinden farkı girdisi: orası sepetten bir plan kurar, burası depoda
 * MÜHÜRLENMİŞ kutuları ölçer. Sevk anında bağlayıcı olan ikincisidir.
 */
export const DispatchOptionsResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    options: z.array(DispatchOptionSchema),
    parcelCount: z.number().int().positive(),
    /** Koli + dara toplamı (g) — ekran "3 koli · 7,4 kg" diyebilsin diye. */
    totalWeightG: z.number().int().nonnegative(),
    /**
     * **Liste "yalnız adrese teslim"e DARALTILDI mı** (kullanıcı kararı 29.08 · Faz 2).
     *
     * Ücretsiz kargoda parayı biz ödüyoruz, koli EVE gider ve teslimat noktası seçenekleri
     * `quoteOrderShipment` içinde eleniyor. Bayrak o eleme yapıldığında `true`.
     *
     * **Sözleşmeye taşınmasının sebebi ölçülmüş bir sessizlik:** motor bu bayrağı 29.08'den beri
     * üretiyordu ama şemada karşılığı yoktu ve `.parse` onu her cevapta siliyordu — depocu
     * daraltılmış listeye TAM liste diye bakıyordu. Eksik listenin en kötü hâli, eksik olduğunu
     * söylemeyendir: liste boş kaldığında sebep "multicollo eledi" sanılırdı.
     */
    homeOnly: z.boolean(),
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
  ...DispatchBlockSchema.options,
]);
export type AnnounceShipmentResponse = z.infer<typeof AnnounceShipmentResponseSchema>;

/**
 * **DEVİR OKUTMASI** (07.12) — kutu fiziksel olarak taşıyıcıya verildi.
 *
 * Gövde tek alan: okutulan kod. Hangi kutu olduğunu SUNUCU çözüyor — telefon kodun taşıyıcı
 * numarası mı bizim kodumuz mu olduğunu bilmek zorunda değil (iki kolonda da aranıyor).
 */
export const HandoverRequestSchema = z.object({ code: z.string().trim().min(1).max(64) });
export type HandoverRequest = z.infer<typeof HandoverRequestSchema>;

/**
 * Devir cevabı — olumsuz dallar da 200 ve ADLI.
 *
 * `already_handed` bir hata DEĞİL: ikinci okutma "zaten verildi" demektir ve sayaç kıpırdamaz.
 * Depocu rampada aynı kutuyu iki kez okutabilir; hata cümlesi onu saymanın doğruluğundan
 * şüphelendirirdi.
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
]);
export type HandoverResponse = z.infer<typeof HandoverResponseSchema>;

/**
 * `GET /warehouse/handover/pending` — **rampada bekleyen kutu sayısı** (07.12 · tasarım §8.6).
 *
 * Hub rozetinin ve devir ekranı başlığının tek kaynağı. **Liste değil sayı** olması bilinçli:
 * devir ekranı bir okutucudur, depocu elindeki kutuyu okutur ve "hangi siparişi vereyim" diye bir
 * seçim yoktur. Sayı bir seçim davet etmiyor, bir BİTİŞ ölçüsü veriyor — sıfıra inince rampa
 * boşalmıştır.
 *
 * Sayaç devir kapısının reddettikleriyle **birebir aynı** süzgeci kullanıyor (mühürsüz ve
 * duyurulmamış kutu sayılmaz): gevşek bir sayaç, yapılamayacak bir işi varmış gibi gösterirdi.
 */
export const HandoverPendingResponseSchema = z.object({
  /** Mühürlü + duyurulmuş + henüz verilmemiş kutu adedi. Sıfır meşru bir cevap: rampa boş. */
  boxes: z.number().int().nonnegative(),
});
export type HandoverPendingResponse = z.infer<typeof HandoverPendingResponseSchema>;

/**
 * `GET /warehouse/boxes/:boxId/shipping-label` — TAŞIYICININ etiketi (bizimki değil).
 *
 * **İmzalı adres dönüyor, dosyanın kendisi değil:** PDF özel kovada duruyor ve telefon onu
 * doğrudan indiriyor. Sunucudan akıtmak, ödenmiş bir etiketin her basımında VPS'i aradaki boru
 * yapardı — ve kova zaten imzalı okuma veriyor.
 *
 * ⚠ **Bizim kutu etiketimizle (`/label.png`) KARIŞTIRILMAZ.** Kargo kulvarında bizim QR'lı
 * etiketimiz BASILMAZ (tasarım §4.6): kutunun üstünde iki barkod taşıyıcının tarayıcısını
 * şaşırtır. Bu uç taşıyıcının kendi A6 etiketini verir.
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
  z.object({ status: z.literal('forbidden'), reason: z.literal('out_of_scope') }),
  /** RPC reddi — mesaj operatöre AYNEN gösterilir (en sık: fiziksel gerçek ihlali, 0015/0048). */
  z.object({ status: z.literal('failed'), message: z.string() }),
  z.object({ status: z.literal('not_found') }),
]);
export type SealBoxResponse = z.infer<typeof SealBoxResponseSchema>;

/**
 * **Siparişi eksik kapat** (kullanıcı bulgusu 31.08) — kutuya HİÇ dokunmayan sipariş kararı.
 *
 * Beyan `sealBox`ın dalı olarak doğmuştu ve orada kalamazdı: kapanış bir KUTU işlemi, beyan bir
 * SİPARİŞ kararı. Depocunun gerçek hareketi son kutuyu kapatıp SONRA "kalanı bulamadım" demektir
 * ve o anda açık kutu yoktur — `sealBox` orada `empty` döner, yani düğme sessizce ölüdür (cihazda
 * ölçüldü). Gövde YOK: karar siparişin kimliğinden ve depodan türüyor.
 */
export const DeclareShortResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    /** Eksik kalemlerin tavsiyesi — karar yine YÖNETİM ekranında (D1 → Y2). */
    shortfalls: z.array(z.object({ itemId: z.string().uuid(), suggestion: ShortfallSuggestionSchema })),
  }),
  /** Açık kutuda ürün var: önce o kutu kapanmalı, yoksa içindekiler kayda geçmez. */
  z.object({ status: z.literal('open_box_not_empty'), boxNo: z.number().int().positive() }),
  z.object({ status: z.literal('forbidden'), reason: z.literal('out_of_scope') }),
  z.object({ status: z.literal('failed'), message: z.string() }),
  z.object({ status: z.literal('not_found') }),
]);
export type DeclareShortResponse = z.infer<typeof DeclareShortResponseSchema>;

/**
 * **Kutuyu geri aç** (kullanıcı isteği 01.09) — kapanış tersine çevrilebilir bir kayıttır.
 *
 * Gövde YOK: karar kutunun kimliğinden ve depodan türüyor. Olumsuz dallar da 200 — `not_sealed`
 * çift dokunuştur, `failed` RPC'nin okunur reddidir (araca binmiş kutu · hazırlıktan çıkmış
 * sipariş) ve mesajı depocuya AYNEN gösterilir.
 */
export const UnsealBoxResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    boxNo: z.number().int().positive(),
    /**
     * **Kutudan ÇIKAN döküm** (kullanıcı bulgusu 01.09) — geri açılan kutunun kapanışta yazılmış
     * içeriği, kalem kimliği + adet.
     *
     * ── NİÇİN CEVAPTA TAŞINIYOR ─────────────────────────────────────────────
     * Sistemin değişmezi *"açık kutu = taslak"*: bir kutunun dökümü veritabanına ancak KAPANIŞTA
     * yazılır (`seal_order_box` `insert` eder ve `unique (box_id, order_item_id)` ikinci yazımı
     * reddeder). Geri açma bu yüzden satırları serbest bırakmak zorunda — bırakmasaydı kutu bir
     * daha kapanamazdı ve karşılanan adet çift sayılırdı (`sealBox`ın birleşimi mevcut izin
     * ÜSTÜNE ekliyor).
     *
     * Ama serbest bırakmak, İÇERİĞİ KAYBETMEK değildir: döküm burada geri veriliyor ve telefon
     * onu açık kutunun taslağına yazıyor. Depocunun gördüğü şey "kutu boşaldı" değil, *"kutu
     * açıldı, içindekiler duruyor, istediğini çıkarabilirsin"* — kullanıcının cümlesi buydu
     * (*"neden sadece kutuyu açıp içinden birkaç şey çıkartamıyorum"*).
     *
     * Kayıt açısından bu bir kayıp değil çünkü açık kutunun dökümü zaten hiçbir zaman kayıtta
     * yaşamıyordu; doldurulmakta olan HER kutu bu hâlde.
     */
    items: z.array(z.object({ orderItemId: z.string().uuid(), qty: z.number().int().positive() })),
  }),
  z.object({ status: z.literal('not_sealed') }),
  /**
   * Siparişin BAŞKA kutusu açık (ölçüldü 01.09) — geri açma reddedilir, hiçbir şey değişmez.
   * Ekran açık kutuyu tekil biliyor; ikincisi çizilmez ve erişilemez bir kayda dönüşür (0048).
   */
  z.object({ status: z.literal('other_box_open'), boxNo: z.number().int().positive() }),
  z.object({ status: z.literal('failed'), message: z.string() }),
  z.object({ status: z.literal('forbidden'), reason: z.literal('out_of_scope') }),
  z.object({ status: z.literal('not_found') }),
]);
export type UnsealBoxResponse = z.infer<typeof UnsealBoxResponseSchema>;

/**
 * 4×6 etiketin içeriği (23.7 · karar §1.5/§1.9) — İÇERİK SUNUCUDAN, telefon gösterir/basar.
 * **Fiyat/tutar alanı YOK ve olamaz** (karar §1.5): tahsilatın yalnız YÖNTEMİ yazılır; kurye
 * tutarı QR'ı okutunca kendi ekranında görür. Bugünkü tüketici kapanış önizlemesi; Brother SDK
 * bağlanınca (23.5) aynı içerik basılır.
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
 * Deponun etiket yazıcısı (23.7) — `settings` warehouse kapsamından (`label_printer_*`).
 * `labelSize` Brother SDK'nın boy adıdır (23.5 ölçümü: takılı kâğıt SDK'dan okunamıyor —
 * ör. `DieCutW103H164`, `RollW62`). `null` = yazıcı tanımsız; telefon basmayı hiç denemez.
 */
/**
 * **DEPONUN BİR YAZICISI** (07.12 · `0054`).
 *
 * `purpose` iki değerli ve ayrım FİZİKSEL: `box` bizim 4×6 QR'lı kutu etiketimiz, `shipping`
 * taşıyıcının A6 yatay etiketi. Yanlış yazıcıya giden etiket ya reddedilir ya küçültülür
 * (ölçüldü, tasarım §4.6) — küçülen barkod okunmaz.
 *
 * **SEÇİM BU SÖZLEŞMEDE YOK ve olmayacak:** hangi yazıcının kullanıldığı cihazın kendi bilgisi
 * (kullanıcı kararı 29.08) ve telefonun yerel deposunda yaşıyor. Aynı depodaki iki telefon iki
 * ayrı yazıcıya basabilir — biri rampada, biri masada; bu bir çelişki değil kurulumun kendisi.
 */
export const BoxPrinterSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  purpose: PrinterPurposeEnum,
  address: z.string(),
  model: z.string(),
  labelSize: z.string(),
});
export type BoxPrinterContract = z.infer<typeof BoxPrinterSchema>;

/** `GET /warehouse/printers` — deponun AÇIK yazıcıları; cihaz listeden seçer, elle IP yazmaz. */
export const WarehousePrintersResponseSchema = z.object({ printers: z.array(BoxPrinterSchema) });
export type WarehousePrintersResponse = z.infer<typeof WarehousePrintersResponseSchema>;

/**
 * Etiket içeriği cevabı (23.7).
 *
 * ⚠ **`printer` alanı 29.08'de KALDIRILDI.** Tek yazıcı varsayımının kalıntısıydı: cevap deponun
 * tek ayarlı yazıcısını iliştiriyordu. Artık depoda N yazıcı var ve hangisinin kullanılacağı
 * CİHAZIN bilgisi — sunucunun cevaba iliştirdiği bir yazıcı, cihazın seçimini sessizce ezerdi.
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

/** PO'dan dolu gelen form satırı — beklenen adet + ad. **Fiyat alanı YOK ve olamaz.** */
/**
 * **KAYITLI KOLİ BOYU** — "bu üründe koli deyince kaç paket anlaşılır" (v3 · `sheetAdet`,
 * *"Boylar ürün kartındaki kutu tiplerinden gelir"*).
 *
 * Kaynak `variant_barcode`ın `kind='case'` satırlarıdır ve şema ondan TÜRETİLİR: çarpan kodun
 * kendi alanıdır (`qtyPerCode`), varyantta ya da tedarikçide durmaz — iki tedarikçinin kolisi
 * farklı boyda olabilir (entity künyesi §1.2).
 *
 * Adet çekmecesi bu listeyi ÇARPAN TABLOSU olarak kullanır: depocu "3 koli geldi" der, ekran
 * paketi kendi çarpar. Liste BOŞSA çekmece yalnız tek paket sayar — uydurma bir varsayılan koli
 * boyu (12'lik) stok sayımını sessizce bozardı (CLAUDE §1).
 */
export const CaseSizeSchema = VariantBarcodeSchema.pick({ code: true, qtyPerCode: true });
export type CaseSizeContract = z.infer<typeof CaseSizeSchema>;

export const IntakeFormRowSchema = z.object({
  variantId: z.string().uuid(),
  productName: z.string(),
  variantLabel: z.string(),
  expectedQty: z.number().int(),
  /**
   * **Tedarikçinin bu kaleme verdiği kod** ("GAZ-7120") — `supplier_product.supplier_code`, kalemin
   * `supplier_product_id` bağından çözülür.
   *
   * Depocunun elinde bizim adımız değil TEDARİKÇİNİN irsaliyesi vardır ve orada bu kod yazar;
   * satırı kâğıtla eşleştirmenin tek kesin anahtarı odur (ürün adı çevrilmiş, boy etiketi bizim
   * dilimizde). `null` = kalem bir eşlemeye bağlanmadan açılmış — uydurma bir kod yerine görünür
   * boşluk.
   *
   * **Para değildir ve para taşımaz:** `supplier_product` satırında alış fiyatı da var, buraya
   * yalnız KOD geliyor (09.14 sınırı).
   */
  supplierCode: z.string().nullable(),
  /**
   * Varyantın kendi kodu (`product_variant.sku`) — plansız kabulün satırında görünen şey.
   *
   * PO'lu kabulde satırın anahtarı TEDARİKÇİNİN kodudur (elde onun irsaliyesi var); plansızda
   * sipariş yoktur, yani tedarikçi kodu da yoktur ve satırı tanıtan tek kod bizim SKU'muzdur.
   * Satır aramadan da okutmadan da açılabiliyor ve ikisi aynı alanı göstermeli — biri kodlu, öteki
   * kodsuz bir liste depocuya "bu ürünün kodu yok mu" diye sordururdu (23.13 eleştirisi).
   *
   * `null` = varyanta SKU girilmemiş.
   */
  sku: z.string().nullable(),
  /**
   * **BU VARYANTIN DEPODA DURAN LOT KODLARI** — lot çekmecesinin ikinci öneri kaynağı (21.175).
   *
   * Depocu lot kodunu elle yazıyor ve aynı tedarikçiden gelen mal çoğunlukla ya aynı lottan ya da
   * bir öncekine çok benzeyen bir lottan geliyor. Öneri listesinin İLK kaynağı aynı kabuldeki
   * öteki satırlar (`lotsUsedBy`), ama o liste ilk satırda boştur — ilk satırı yazan depocu hiçbir
   * öneri görmez. Bu alan o boşluğu dolduruyor: varyantın halihazırda depoda duran partilerinin
   * kodları.
   *
   * ÖNERİ, DOĞRULAMA DEĞİL: listede olmayan bir kod da yazılabilir ve yazılmalıdır — yeni lot her
   * zaman mümkün. Kapalı bir liste yapmak, sahayı var olmayan bir kodu seçmeye zorlardı.
   *
   * SIRA YENİDEN ESKİYE ve sayı SINIRLI (motorun künyesi): en son giren parti, elindeki koliyle
   * en çok benzeşme ihtimali olan koddur.
   *
   * TASARIMIN KAYNAĞI BAŞKA ve bugün kurulamıyor: şablon *"okunan koliden gelen adaylar"* diyor,
   * yani kolinin üstündeki lot etiketinden. Okutma cevabı lot taşımıyor ve kolinin lot kodunu
   * okuyacak bir alan yok. Kaynağın farklı olduğu ekranda SAKLANMIYOR — listeye olmayan bir
   * kesinlik atfetmemek için künyeye yazılı.
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
   * Ürünün toplam raf ömrü (gün). **`null` = girilmemiş → kalan ömür HESAPLANAMAZ** ve ekran uyarı
   * üretmez (CLAUDE §1: ölçülemeyen değer sıfır değildir; `remainingShelfLifePercent` aynı kararı
   * veriyor). Yüzdeyi sunucu hesaplayamaz çünkü girdisi olan son tarih henüz YAZILMAMIŞTIR —
   * depocu SKT'yi girdiği anda, telefonda, `meetsMlor` ile hesaplanır.
   */
  shelfLifeDays: z.number().int().nullable(),
  /** Ürünün kayıtlı koli boyları — adet çekmecesinin çarpan tablosu (`CaseSizeSchema` künyesi). */
  caseSizes: z.array(CaseSizeSchema),
});
export type IntakeFormRowContract = z.infer<typeof IntakeFormRowSchema>;

/**
 * Tedarik siparişinin KÜNYESİ (21.11d) — ekranın başlığı: *"TS-26-0114 · Gaziantep Gıda"*.
 *
 * ── NEDEN SATIRLARDAN AYRI ──────────────────────────────────────────────────
 * `IntakeFormRowSchema` kalemin şeklidir ve künye kalem başına DEĞİL sipariş başına tekildir; satıra
 * kopyalansaydı aynı iki dize N kez taşınır ve "satırın tedarikçisi başka olabilir" diye yanlış bir
 * beklenti kurardı (kurye ucundaki `doorAccountId` kararının aynısı).
 *
 * **Para YOK ve olamaz:** sipariş tutarı, birim alış, beklenen toplam — hiçbiri burada değil. Depocu
 * hangi belgeyi elinde tuttuğunu bilmeli, o belgenin kaç para olduğunu değil.
 *
 * `referenceNo` taslakta `null`dır (numara gönderimde doğar) ve `supplierName` silinmiş/erişilemeyen
 * tedarikçide `null` döner — uydurma bir ad yerine görünür bir boşluk.
 */
export const IntakePurchaseOrderSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  referenceNo: z.string().nullable(),
  supplierName: z.string().nullable(),
});
export type IntakePurchaseOrderContract = z.infer<typeof IntakePurchaseOrderSchema>;

/**
 * `GET /warehouse/intake/:purchaseOrderId` yanıtı. Boş `rows` = plansız alım (form elle doldurulur).
 *
 * `purchaseOrder` `null` ise sipariş HİÇ YOK: boş satır listesiyle karıştırılmaz — biri "kalemsiz
 * sipariş", öteki "olmayan sipariş"tir ve ekranın kuracağı cümle farklıdır.
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
 * Bekleyen sevkiyat satırı (D2'nin konusuz açılışı, 21.11d) — künye + satır sayısı.
 *
 * Künyeden TÜRER (`.extend`): liste ile detay aynı üç alanı gösteriyor ve ikisini ayrı yazmak, bir
 * gün listede tedarikçi adı, detayda tedarikçi kodu göstermenin önünü açardı.
 *
 * `lineCount` "kaç KALEM ısmarlandı"dır, "kaç adet" DEĞİL: depocu kaç satır sayacağını bilmek ister;
 * toplam adet siparişin büyüklüğünü söyler ve o bir satın alma sorusudur.
 */
export const PendingIntakeSchema = IntakePurchaseOrderSchema.extend({
  lineCount: z.number().int(),
  /**
   * Siparişin DURUMU — liste iki durumu birden taşır (`listPendingIntakes` künyesi: `sent` **ve**
   * `partially_received`) ve ikisi depocu için ayrı cümledir: birinde koli hiç açılmadı, ötekinde
   * ikinci turdur ve beklenen adetler KALANDIR. Ekranın sabit "gönderildi" yazması listenin
   * yarısı için yanlış olurdu.
   *
   * Küme varlık enum'undan DARALTILARAK türer (`.extract`), elle yazılmaz: `draft` hiç girmez
   * (tedarikçi habersiz), `received`/`cancelled` kapandı — üçünden biri buraya düşerse tip tutmaz.
   */
  status: PurchaseOrderStatusEnum.extract(['sent', 'partially_received']),
});
export type PendingIntakeContract = z.infer<typeof PendingIntakeSchema>;

/**
 * `GET /warehouse/intake` yanıtı — "hangi sevkiyatı bekliyorum".
 *
 * Sayfalanmaz ve gerekçesi ölçüldü: açık tedarik siparişi kümesi veriyle BÜYÜMEZ, kabul edildikçe
 * kapanır (`PurchaseOrderService.openProgress` künyesi) — CLAUDE.md §1'in "doğal tavanı olan küme"
 * dalı. Tavan yine de var (kapının `limit`i), çünkü tavansız bir okuma bir gün sessizce kesilir.
 */
export const PendingIntakesResponseSchema = z.object({ intakes: z.array(PendingIntakeSchema) });
export type PendingIntakesResponse = z.infer<typeof PendingIntakesResponseSchema>;

/**
 * Depocunun gönderdiği kabul satırı. **Maliyet alanı YOKTUR** — bu bir ekran kuralı değil, tip
 * sınırı: depo yolu fiyat gönderemez (09.14). Fiyatlı giriş admin'in ayrı kapısıdır ve mobil depo
 * ucunda karşılığı yok.
 *
 * `expiryDate` zorunlu ve bu v2'nin cümlesi: *"SKT her satırda zorunlu — girilmeden kabul kapanmaz."*
 */
export const IntakeFormLineSchema = z.object({
  variantId: z.string().uuid(),
  qty: z.number().int().positive(),
  expiryDate: z.string(),
  /** Geri çağırma anahtarı; boş bırakmak BİLİNÇLİ bir karar olmalı (v2 notu). */
  lotNumber: z.string().nullish(),
  /**
   * Partinin konacağı alan — **kimlik** (19.29). Öneride ad gider, yazmada KİMLİK gelir ve asimetri
   * kasıtlı: okurken depocu tabelayı okur, yazarken listeden seçer. Ad kabul etseydik yazım hatası
   * yeni bir "alan" uydurur ve serbest metne geri dönerdik.
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
     * Hedefe çekilen otomatik fiyat sayısı. **`null` = ÖLÇÜLEMEDİ** (fiyat portu kayıtlı değil),
     * sıfır değil — bozuk bir ölçümü sağlıklı gibi okutmamak için (CLAUDE.md §1). Depocuya
     * gösterilmez; kabul kaydında görünür kalması içindir.
     */
    repricedCount: z.number().int().nullable(),
  }),
  /** Satırsız istek — hiçbir şey yazılmadı. */
  z.object({ status: z.literal('empty') }),
]);
export type ReceiveGoodsResponse = z.infer<typeof ReceiveGoodsResponseSchema>;

// ── D4 · Sayım / düzeltme ───────────────────────────────────────────────────

/**
 * Depocunun seçebileceği sebepler — **`return_restock` YOK** (v2: *"'İade stoğa döndü' depocuya
 * açılmaz — yönetim istisnasıdır"*). Kural tipte duruyor, ekranda değil.
 *
 * ── TEK LİSTE, İKİ SEVİYE (06.14) ───────────────────────────────────────────
 * Veride bunlar artık iki ayrı şey: imhanın kendisi bir hareket TİPİ (`write_off`), DLC/hasar/kayıp
 * ise onun SEBEBİ; sayım farkı ise ayrı bir tip. Depocunun ekranında ise tek bir seçim listesi
 * olmalı — "tarihi geçti / hasar / kayıp / sayım farkı" diye seçer, tip-sebep ayrımı onun sorunu
 * değil. Çeviriyi sunucu sınırı yapıyor (`recordAdjustment`).
 *
 * Liste yine TÜRETİLİR, elle yazılmaz: imha sebepleri varlık enum'undan geliyor, sayım farkı tek
 * ek değer. Yarın yeni bir imha sebebi eklenirse depo kapısı onu kendiliğinden görür.
 */
export const WarehouseAdjustmentReasonEnum = z.enum([...StockWriteOffReasonEnum.options, 'count_diff']);
export type WarehouseAdjustmentReason = z.infer<typeof WarehouseAdjustmentReasonEnum>;

export const AdjustmentLineSchema = z.object({
  stockId: z.string().uuid(),
  /** DAİMA pozitif — yön ayrı alanda (06.14; `money_movement` kuralı, işaret miktara gömülmez). */
  qty: z.number().int().positive(),
  /**
   * `out` = stoktan düş, `in` = stoğa ekle (yalnız sayım FAZLASI).
   *
   * Eskiden `qty` işaretliydi ve fazla çıkan mal negatif adetle gönderiliyordu. Yön açık alana
   * çıktı çünkü aynı gömülülük rapor tarafında ölçülmüş bir arızaya yol açmıştı: "Çıkışlar"
   * sekmesi dönem toplamını eksi gösteriyordu.
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

export const RecordAdjustmentResponseSchema = z.discriminatedUnion('status', [
  /** `result.referenceNo` OLAY belgesidir — ekranda gösterilir, kâğıt tutanakla eşleşir. */
  z.object({ status: z.literal('ok'), result: AdjustBatchResultSchema }),
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
  /** "Ürün (boy)" — operasyon dilinde. */
  name: z.string(),
  dispatchedQty: z.number().int(),
  /** **`null` = henüz sayılmadı, `0` = geldi ama kayıp.** İkisi ayrı şeydir (0042). */
  receivedQty: z.number().int().nullable(),
});
export type InboundTransferLineContract = z.infer<typeof InboundTransferLineSchema>;

export const InboundTransferSchema = z.object({
  transferId: z.string().uuid(),
  /** TRF-COL-26-0007 — KAYNAK deponun kodu; kâğıt klasör orada durur. */
  referenceNo: z.string(),
  fromWarehouseId: z.string().uuid(),
  dispatchedAt: z.string(),
  note: z.string().nullable(),
  lines: z.array(InboundTransferLineSchema),
});
export type InboundTransferContract = z.infer<typeof InboundTransferSchema>;

/**
 * **Bu depodan ÇIKMIŞ, hâlâ yolda** — transferin öteki yüzü.
 *
 * Satırları YOK ve bu bilinçli: gelen transferin satırları rampada SAYILACAK şeydir, çıkanınki ise
 * çoktan sayılıp yola çıkmıştır — gönderen depoda yapılacak bir iş kalmadı. Bölüm "unuttuğum bir
 * sevkiyat yolda mı" sorusunun cevabıdır, ikinci bir kabul ekranı değil; satırları taşımak telefona
 * hiç açılmayacak bir ağaç indirtirdi. Tekil kaydın satırları gerekiyorsa kapısı ayrı
 * (`readTransferDetail`).
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
});
export type OutboundTransferContract = z.infer<typeof OutboundTransferSchema>;

/**
 * **Son kapananlar** — kabul edilmiş ya da geri alınmış sevkiyatlar, iki yön birden.
 *
 * ── NEDEN İKİ YÖN TEK LİSTEDE ───────────────────────────────────────────────
 * Depocunun sorusu "bu hafta ne kapandı"dır; gönderdiğinin kapanışı da aldığınınki kadar onun işi
 * (eksik kabul edilen bir sevkiyatın gönderen tarafı da farkı görmeli). `direction` o yüzden alan:
 * ekran kendi deposunun kimliğini BİLMEZ — kimlik jetonda, sunucuda çözülüyor.
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
});
export type ClosedTransferContract = z.infer<typeof ClosedTransferSchema>;

/**
 * `GET /warehouse/transfers` yanıtı — şablonun ÜÇ bölümü tek turda (v3 · 11).
 *
 * ── NEDEN TEK UÇ, ÜÇ LİSTE ──────────────────────────────────────────────────
 * Üçü aynı ekranın aynı anda çizdiği şey ve üçü de aynı depo kimliğinden süzülüyor. Üç ayrı uç,
 * rampadaki telefona üç tur attırır ve bölümlerden biri geç gelirse ekran yarım bir gerçeklik
 * gösterirdi ("yolda hiçbir şey yok" — henüz gelmediği için).
 *
 * `transfers` ve `outbound` sayfalanmaz: küme fiziksel gerçekle sınırlı (aynı anda yolda olan
 * sevkiyat kadar) ve TAM olması gerekir — bir sevkiyatı kaçırmak iki depoda da görünmeyen mal
 * demektir. `closed` ise veriyle BÜYÜR; o yüzden liste değil PENCEREDİR: sabit sınırlı bir
 * "son kapananlar" seçkisi (CLAUDE §1'in editoryal seçki dalı), geçmişin tamamı değil.
 */
export const WarehouseTransfersResponseSchema = z.object({
  transfers: z.array(InboundTransferSchema),
  outbound: z.array(OutboundTransferSchema),
  closed: z.array(ClosedTransferSchema),
});
export type WarehouseTransfersResponse = z.infer<typeof WarehouseTransfersResponseSchema>;

/**
 * Transfer kabulü isteği (D5). Satır tipi VARLIK şemasından (`ReceiveLineSchema`) — `receivedQty`
 * sıfır olabilir ve bu bir BEYANDIR ("sevk edildi ama gelmedi"); satırı hiç göndermemek ise kabulü
 * bloklar (v2: *"boş satır kabulü bloklar, ikisi ayrı şeydir"*).
 */
export const ReceiveTransferRequestSchema = z.object({ lines: z.array(ReceiveLineSchema) });
export type ReceiveTransferRequest = z.infer<typeof ReceiveTransferRequestSchema>;

export const ReceiveTransferResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), transferId: z.string().uuid(), createdBatches: z.number().int() }),
  z.object({ status: z.literal('forbidden'), reason: z.literal('out_of_scope') }),
  /** Araya biri girdi: transfer artık yolda değil. Ekran bunu GÖSTERİR, yutmaz. */
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
 * Sevk isteği (D5'in "ver" yarısı). **Kaynak depo gövdede YOK** — partiler zaten bir depoda duruyor
 * ve ayrıca sorulan bir kaynak onlarla çelişebilirdi; kimlik jetondan gelir. Hedef ise iş verisidir.
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
 * Dönen kolinin tek satırı (21.11d okuma ayağı).
 *
 * ── ÖLÇÜ `fulfilledQty`, `qty` DEĞİL — VE BU BİR YAZIM KISITI ────────────────
 * `adjust_fulfillment` (0020) hedef değeri MEVCUT karşılanan adedin üstüne çıkaramaz: *"karşılanan
 * miktar artırılamaz"*. Ekranın tavanı bu yüzden sipariş edilen adet değil, hâlihazırda karşılanmış
 * adettir — sipariş adedini göstermek depocuya kapının reddedeceği bir sayı girdirirdi.
 *
 * `disposition` dolu = bu satırın akıbeti ZATEN işaretlenmiş. Alan gösterilmeseydi ekran aynı satırı
 * ikinci kez gönderir, `restock` ikinci kez stoğa yazılırdı; boş bırakmak da "hiç dokunulmadı"
 * demenin tek yolu olurdu ve ikisi ayrı şeydir.
 */
export const ReturnDropLineSchema = z.object({
  orderItemId: z.string().uuid(),
  /** "Ürün (boy)" — operasyon dilinde (Türkçe). */
  name: z.string(),
  fulfilledQty: z.number().int(),
  disposition: ReturnDispositionEnum.nullable(),
});
export type ReturnDropLineContract = z.infer<typeof ReturnDropLineSchema>;

/**
 * Depoya geri gelen bir sipariş — D6'nın "döküm"ü.
 *
 * **Para YOK** (D6'nın YANITINDAKİ istisna buraya taşınmaz): dönüşü karşılayan depocu iade tutarını
 * görmez; tutar yalnız işaretleme YAZILDIKTAN sonraki cevapta, yönetim akışı için döner.
 *
 * `note` kuryenin kapıdaki serbest notudur (`order_status_log.note` — `returned`'a geçiş satırı);
 * depocunun akıbet kararının tek bağlamı odur. `courierName` `null` olabilir: sipariş bir kuryeye
 * hiç atanmamış olabilir (kargo/mağaza yolu) — uydurma bir ad yerine görünür boşluk.
 */
export const ReturnDropSchema = z.object({
  orderId: z.string().uuid(),
  referenceNo: z.string().nullable(),
  courierName: z.string().nullable(),
  note: z.string().nullable(),
  /** `returned`'a geçiş ANI — liste bununla sıralanır. Geçiş kaydı yoksa `null`. */
  returnedAt: z.string().nullable(),
  lines: z.array(ReturnDropLineSchema),
});
export type ReturnDropContract = z.infer<typeof ReturnDropSchema>;

/**
 * `GET /warehouse/returns` yanıtı — "bu depoya ne geri geldi, hangisinin akıbeti belirsiz".
 *
 * ── ANAHTAR KURYENİN GÜNÜ DEĞİL, DEPONUN RAMPASI ────────────────────────────
 * Bir `courierDayCloseId` süzgeci ölçüldü ve ELENDİ: siparişin kapanış kaydına bağı YOK (bağ
 * kurye + gün üzerinden dolaylı kurulurdu) ve bir kuryenin günü deponun listesi değildir — aynı
 * rampaya iki kurye dönebilir, biri günü kapatmamış olabilir. Deponun sorusu "bugün kim kapattı"
 * değil, "elimde akıbeti belirsiz ne var".
 *
 * **Ulaşılamayanlar bu listede YOK ve olmamalı:** o mal araca yüklenmiş, kabul EDİLMEMİŞ ve yarına
 * devrolmuştur (v2:505) — sipariş `ready`'e döner, deponun rampasına hiç girmez.
 */
export const WarehouseReturnQueueResponseSchema = z.object({ drops: z.array(ReturnDropSchema) });
export type WarehouseReturnQueueResponse = z.infer<typeof WarehouseReturnQueueResponseSchema>;

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
     * Borç vardı ama iade YAZILAMADI — sebebiyle. Yokluğu "iade tamam" demektir; sessizce sıfır
     * dönmek operatöre iadeyi yapılmış gibi gösterirdi.
     */
    refundBlocked: z.enum(['no_account', 'provider_ref_missing', 'provider_unavailable', 'provider_failed']).optional(),
  }),
  z.object({ status: z.literal('forbidden'), reason: z.literal('out_of_scope') }),
  z.object({ status: z.literal('stale'), currentStatus: OrderStatusEnum }),
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
 * Arama zinciri TEK kapıda ve öncelik sırası sözleşmenin parçası: `barcode → sku → supplier_code`
 * (etüt §4). `source` o yüzden dönüyor — SKU'dan bulunan bir eşleşme barkod eşleşmesi kadar kesin
 * değildir ve ekran "SKU'dan bulundu" diyebilmeli. `unknown` bir hata değil ÖĞRENME davetidir:
 * ekran "bu kod hangi ürün?" diye sorar (karar §1.3).
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
     * Varyantın KENDİ kodu (`product_variant.sku`) — okutulan kod DEĞİL.
     *
     * Aramadan eklenen satır bunu zaten taşıyordu (`VariantSearchRowSchema.sku`), okutmadan eklenen
     * taşımıyordu; aynı listede bir satırda kod olup ötekinde olmaması depocuya "bu ürünün kodu yok
     * mu" diye sordururdu. Kaynak tek: iki yol da aynı varyantın aynı alanını gösteriyor.
     *
     * `null` = varyanta SKU girilmemiş (alan `product_variant`ta nullable) — boş dize değil.
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
 * **PARTİ kodunun çözümü** — `codes/resolve`in İKİZİ DEĞİL, kardeşi (D4'ün ikinci çıkış yolu).
 *
 * ── NEDEN AYRI KAPI ─────────────────────────────────────────────────────────
 * `codes/resolve` bir kodu **varyanta** çevirir: "bu hangi mal". Sayım ekranının sorusu başkadır —
 * "bu RAFTAKİ hangi parti": düzeltme daima bir partiye yazılır ve aynı varyantın aynı depoda birden
 * çok partisi olabilir. İki soruyu tek kapıya yükleseydik cevabın tipi ya varyant ya parti olurdu
 * ve çağıranların yarısı ötekinin dalını hiç kullanmazdı.
 *
 * ── EŞLEŞME ÇOĞULDUR ────────────────────────────────────────────────────────
 * Lot numarası benzersiz DEĞİL (`stock.lot_number` üzerinde tekillik kısıtı yok; aynı lot iki ayrı
 * son tarihle ya da iki ayrı alanda durabilir). Tekile indirseydik sistem depocunun görmediği bir
 * partiyi seçerdi — sayım yanlış partiden düşerdi.
 */
export const ResolveBatchRequestSchema = z.object({ code: z.string().min(1) });
export type ResolveBatchRequest = z.infer<typeof ResolveBatchRequestSchema>;

/** Çözülen parti — sayım ekranının konusu. **Para YOK**: partinin alışı depo yolundan geçmez (09.14). */
export const ResolvedBatchSchema = z.object({
  stockId: z.string().uuid(),
  variantId: z.string().uuid(),
  /** "Ürün (boy)" — operasyon dilinde; ekranın üstbaşlığında görünen ad. */
  name: z.string(),
  /** Rafta okunan kod; eşleşme bunun üzerinden kuruldu, yani burada daima dolu. */
  lotNumber: z.string(),
  expiryDate: z.string(),
  /** Kayıttaki fiili adet — sayımın karşılaştıracağı sayı. */
  physicalQty: z.number().int(),
  /** Partinin alanının ADI ("Derin dondurucu 2"); rafı seçilmemiş partide `null` (19.29). */
  storageAreaName: z.string().nullable(),
  /**
   * Kalan raf ömrü yüzdesi. **`null` = ölçülemedi** (ürünün toplam ömrü girilmemiş) ve sıfır
   * DEĞİLDİR — "%0" yazmak sağlam bir partiyi imhalık gösterirdi (CLAUDE §1).
   */
  lifePercent: z.number().nullable(),
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
 * **Plansız kabulün ürün araması** (23.13) — `GET /warehouse/variants?q=…`.
 *
 * PO'lu kabulde arama YOKTUR ve olmamalı (satır kümesi siparişten gelir; katalog araması açmak
 * yanlış ürüne öğretmenin kapısıdır — karar §1.3). Plansızda küme yoktur: mal gelmiş, siparişi
 * girilmemiştir; depocu ürünü seçemezse kabul hiç yazılamaz.
 *
 * **Para taşımaz:** satırda fiyat alanı yok — depo yolu fiyat görmez (09.14).
 */
/*
  ══ D3 · YAKIN-SKT TURU ═════════════════════════════════════════════════════
  Depocunun ömrü azalan partileri gezip karar verdiği liste. Ekran BUGÜNE KADAR FİKSTÜRLE
  çalışıyordu (`near-expiry-fixture.ts`) ve gerekçesi uç künyesinde yazılıydı: motor vardı
  (`batch-view.ts`) ama kapı yoktu.
*/

/**
 * Yakın-SKT listesinin bir satırı — **bir PARTİ**, bir ürün değil.
 *
 * Ayrım işin kendisi: aynı ürünün iki partisi iki ayrı karar bekler ve depocu rafta partiyi
 * etiketinden bulur. Ürün bazında toplamak, "hangi kutuyu indireceğim" sorusunu cevapsız bırakırdı.
 */
export const NearExpiryBatchSchema = z.object({
  stockId: z.string().uuid(),
  /** Parti kodu — kâğıt etiketle eşleşen künye; yazılmamış olabilir. */
  lotNumber: z.string().nullable(),
  productName: z.string(),
  variantLabel: z.string(),
  qty: z.number().int(),
  expiryDate: z.string(),
  /**
   * Bugünden son kullanma tarihine kalan GÜN; geçmiş partide NEGATİF.
   *
   * Aciliyet rengi bundan TÜRETİLİR ve sözleşmede taşınmaz: renk ekranın kararıdır, kapının değil.
   * Taşısaydık aynı eşik iki yerde yaşar ve biri bir gün ötekiyle çelişirdi (CLAUDE §1).
   */
  daysLeft: z.number().int(),
  /**
   * Kalan ömür yüzdesi (0–100) — **`null` = ÖLÇÜLEMEDİ**, sıfır değil (CLAUDE §1).
   *
   * Ürünün toplam raf ömrü girilmemişse yüzde hesaplanamaz; "%0" yazmak o partiyi imhalık
   * gösterirdi. Ekran `null` gelince çubuğu HİÇ çizmiyor.
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
   * **TARİH REJİMİ — kararın sebebi** (tasarım güncellemesi 31.08).
   *
   * Bu alan olmadan ekran doğru kararı gösteriyor ama SEBEBİNİ söyleyemiyordu: "6 gün (geçti)"
   * yazan bir satırın kararı "teklife girebilir" olabiliyor ve depocu bunu görünce satılabilir malı
   * imha etmeye kalkabiliyordu. Tasarımın kuralı artık başlıkta yazılı: *"DLC geçti = satılamaz ·
   * DDM geçti = satılabilir."*
   */
  dateType: ProductDateTypeEnum,
  /**
   * Partinin rafı — depocu malı orada arayacak. Alan atanmamışsa `null`; uydurma bir raf adı,
   * depocuyu olmayan bir rafa gönderirdi.
   */
  shelfLabel: z.string().nullable(),
  /**
   * **ÜRÜNÜN BU DEPODAKİ TOPLAM STOĞU** — imha çekmecesinin bağlamı (tasarım: *"partide {kalan}
   * adet · toplam stok {stok}"*).
   *
   * Partinin adedi tek başına "kaç düşüyorum" sorusunu cevaplıyor ama "bu ürün bitiyor mu"
   * sorusunu cevaplamıyor. Depocu 12 adetlik partiyi imha ederken depoda 200 adet daha olduğunu
   * bilmeli — kararı değiştirmez ama telaşı değiştirir.
   *
   * PARA DEĞİL STOK: fiyat yasağı para kararı içindi (CLAUDE §2), stok depocunun işinin kendisi.
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
   * **PERSONELİN DEPOSUNDAKİ kullanılabilir adet** — tasarımın satır künyesi *"GAZ-7120 · stok 24"*.
   *
   * Depo-ÜSTÜ toplam DEĞİL: birleştirilmiş stok kimsenin stoğu değildir (`AvailableStockTotal`
   * künyesi) ve depocunun "bu üründen bende var mı" sorusunun cevabı yalnız kendi deposudur.
   * Rezervasyon düşülmüş `availableQty` okunuyor; rafta duran ama başkasına ayrılmış mal,
   * depocunun serbestçe kullanabileceği mal değildir.
   *
   * `0` GERÇEK BİR CEVAPTIR ve bu alanda ölçüm düşmesi yoktur: kapı personelin deposunu zaten
   * biliyor, satırı olmayan varyant gerçekten sıfırdır (`listAvailableAcross` sıfır satırları
   * sorgudan düşürüyor, o yüzden yokluk = sıfır).
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
