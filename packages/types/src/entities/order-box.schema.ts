import { z } from 'zod';

/**
 * SİPARİŞ KUTUSU — bizim bastığımız QR'ın kaydı (Modül 23 · `0048_order_box.sql`).
 *
 * İki kimlikten İKİNCİSİ: `variant_barcode` dış dünyanın kimliğini taşır ("bu hangi mal"), bu
 * tablo bizimkini ("bu hangi kayıt"). Kutu döngüsü karar §1.4: sipariş seç → kutu aç → okutarak
 * doldur → kapat → her şey konduysa sipariş kapanır, değilse yeni kutu. `sealedAt null` = açık
 * kutu; kapanan kutu salt-okunurdur.
 *
 * `code` QR'ın içeriğidir ve sipariş referansı DEĞİLDİR (Netleşecek 4): referans müşteriye
 * gösterilir, kutu kodu teslim kaydını düşürür — biri ötekinden türetilemez olmalı. Üreteç
 * `orderBoxCode` (domain-core).
 */

export const OrderBoxSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  /** Siparişin deposu — yükleme okutması (23.8) rampayı siparişe gitmeden bilir. */
  warehouseId: z.string().uuid(),
  /** Sipariş içi insan sayısı ("Kutu 2/3") — kimlik değil, kimlik `code`. */
  boxNo: z.number().int().positive(),
  code: z.string().min(1),
  /** Kapanış anı; `null` = açık kutu (masada dolduruluyor). */
  sealedAt: z.string().nullable(),
  sealedBy: z.string().uuid().nullable(),
  /** Etiket basım anı (23.7) — "kapalı ama etiketi basılamadı" görünür bir hâl. */
  printedAt: z.string().nullable(),
  /** Araca yükleme damgası (23.8); sayaç bu damgalardan türer, ayrı tablo yok. */
  loadedAt: z.string().nullable(),
  loadedBy: z.string().uuid().nullable(),
  /**
   * Hangi KARGO KUTUSU tipinde (0052) — ölçü ve dara oradan gelir. `null` = tip seçilmemiş;
   * rota kulvarında meşru, kargoda etiketin ÖN ŞARTIDIR. Bileşik FK deposuyla birlikte doğrular:
   * şablon seçilemez, başka deponun kutusu seçilemez.
   */
  shippingBoxId: z.string().uuid().nullable(),
  /**
   * ── TAŞIYICI KİMLİĞİ (0053) ────────────────────────────────────────────────
   * **Sipariş kutusu = taşıyıcıya verilen kutu** (kullanıcı kararı 28.08) — ayrı bir "koli"
   * varlığı yok, kimlik bu satırın üstüne biniyor.
   */
  shipmentId: z.string().uuid().nullable(),
  /**
   * Sağlayıcının KOLİ kimliği — webhook eşleşmesinin BİRİNCİL anahtarı.
   * `Shipment.providerShipmentId` ile karıştırılmaz: farklı kimlik uzayları. Takip numarası bazı
   * taşıyıcılarda geç atanır; ona bağlanan eşleşme erken webhook'ları kaçırır.
   */
  providerParcelRef: z.string().nullable(),
  trackingNumber: z.string().nullable(),
  trackingUrl: z.string().nullable(),
  /** Etiket dosyasının depo anahtarı — tam URL değil (STACK §5). */
  labelKey: z.string().nullable(),
  createdAt: z.string(),
});
export type OrderBox = z.infer<typeof OrderBoxSchema>;

/**
 * Kutu AÇIK doğar: kapanış/basım/yükleme damgaları doğumda yazılmaz — hepsi kendi kapısından.
 *
 * **`shippingBoxId` istisnadır ve doğumda yazılır** (07.12): depocu kartonu kutuyu doldurmaya
 * başlarken eline alıyor, yani tip açılış anında BİLİNİYOR. İsteğe bağlı — rota kulvarında kargo
 * kutusu diye bir şey yok.
 */
export const OrderBoxInsertSchema = OrderBoxSchema.pick({
  orderId: true,
  warehouseId: true,
  boxNo: true,
  code: true,
}).extend(OrderBoxSchema.pick({ shippingBoxId: true }).partial().shape);
export type OrderBoxInsert = z.infer<typeof OrderBoxInsertSchema>;

/**
 * Güncellenen yalnız DAMGALARDIR: kapanış RPC'de (`seal_order_box`), basım ve yükleme kendi
 * kapılarında. Kutunun kimliği (`code`, `boxNo`, sipariş) doğumdan sonra DEĞİŞMEZ.
 */
export const OrderBoxUpdateSchema = OrderBoxSchema.pick({
  id: true,
}).extend(
  OrderBoxSchema.pick({
    printedAt: true,
    loadedAt: true,
    loadedBy: true,
    // Kutu tipi kapanışa kadar değişebilir (depocu yanlış kutu seçmiş olabilir); mühürden sonra
    // değişmesi anlamsız ama kural veride değil kapıda — kutu döngüsü zaten mühürlüyü korur.
    shippingBoxId: true,
    // Taşıyıcı kimliği duyuru kapısından yazılır (`announceOrderShipment`) — tek yazan orası.
    shipmentId: true,
    providerParcelRef: true,
    trackingNumber: true,
    trackingUrl: true,
    labelKey: true,
  })
    .partial().shape,
);
export type OrderBoxUpdate = z.infer<typeof OrderBoxUpdateSchema>;

export const OrderBoxItemSchema = z.object({
  id: z.string().uuid(),
  boxId: z.string().uuid(),
  orderItemId: z.string().uuid(),
  qty: z.number().int().positive(),
});
export type OrderBoxItem = z.infer<typeof OrderBoxItemSchema>;

/**
 * Insert şeması yalnız RPC yolunun aynasıdır: kutu kalemi `seal_order_box` içinde doğar (kutu +
 * picks TEK transaction — STACK §13); servis katmanından tek satır yazma kapısı AÇILMAZ
 * (`order_item_batch`in "yazma yolu yok" kararının aynısı).
 */
export const OrderBoxItemInsertSchema = OrderBoxItemSchema.pick({ boxId: true, orderItemId: true, qty: true });
export type OrderBoxItemInsert = z.infer<typeof OrderBoxItemInsertSchema>;

export const OrderBoxItemUpdateSchema = OrderBoxItemSchema.pick({}).extend({});
export type OrderBoxItemUpdate = z.infer<typeof OrderBoxItemUpdateSchema>;
