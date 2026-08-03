import {
  ProductService,
  ProductVariantService,
  PurchaseOrderItemService,
  PurchaseOrderService,
  StockIntakeService,
  serviceDb,
} from '@lezzet/database';
import { meetsMlor } from '@lezzet/domain-core';
import { resolveLocalizedText, type ReceiveIntakeResult } from '@lezzet/types';
import { repriceVariants } from '@/lib/pricing/auto-price';

/**
 * Mal kabul kapısı (10.4) — **uygulama katmanı orkestrasyonu**.
 * `design/pages/depo-stok-giris.md` + DOMAIN §16.
 *
 * **Depocu alış fiyatı GÖRMEZ ve GİRMEZ.** Form satırı yalnız adet, son tarih, lot ve konum ister;
 * birim maliyet tedarik siparişinden (admin'in girdiği) sunucu tarafında eklenir. Bu yüzden giriş
 * tipinde `unitCostCents` alanı YOKTUR — ekran isteseydi bile gönderemez.
 *
 * **MLOR uyarısı engellemez, uyarır** (DOMAIN §4): raf ömrünün yeterince kalmadığı parti yine kabul
 * edilebilir — kararı mal kabul eden verir. Sistem yalnız görünür kılar.
 */

/** Depocunun doldurduğu satır — para alanı yok. */
export interface IntakeFormLine {
  variantId: string;
  qty: number;
  expiryDate: string;
  lotNumber?: string | null;
  location?: string | null;
}

/**
 * Admin'in doldurduğu satır — **maliyeti taşıyan tek tip** (09.14).
 *
 * ── NEDEN AYRI TİP, `IntakeFormLine`'a ALAN DEĞİL ────────────────────────────
 * Depocunun fiyat görmemesi bir ekran kuralı değil, bir TİP sınırıdır: alanı ortak tipe koysaydık
 * depo ekranı onu "isteğe bağlı" diye gönderebilirdi ve sınır yalnız iyi niyetle ayakta kalırdı.
 * İki ayrı tip, iki ayrı kapı — depocu yolu fiyat gönderemez, admin yolu göndermeyi unutmaz.
 *
 * ── MALİYET SATIRIN, VARYANTIN DEĞİL ─────────────────────────────────────────
 * Talep `Record<variantId, …>` önermişti; o harita aynı varyantın İKİ satırını birbirine bağlardı.
 * Ama bu dosya aynı varyantın birden çok satırda gelebileceğini zaten biliyor (`differencesOf`
 * adetleri TOPLUYOR, üzerine yazmıyor): farklı son tarih ya da farklı lot ayrı satırdır ve aynı
 * sevkiyatta farklı fiyata alınmış olabilir. Varyant anahtarlı harita o farkı sessizce yutardı.
 */
export interface PurchaseIntakeLine extends IntakeFormLine {
  /**
   * Birim alış fiyatı — **tamsayı cent** (`STACK §8`). Adlandırma sözleşmenin parçası: `…Cents` ile
   * bitmeyen bir para alanı yoktur, çünkü `unitCost: number` gören biri euro mu cent mi olduğunu
   * bilemez ve hata satıra bakınca GÖRÜNMEZ. (Bu ekran birim maliyeti bölerek üretiyor —
   * toplam ÷ paket sayısı — ve o bölme kayan noktada kuruş kaçırır.)
   *
   * Euro'ya çevrim bu dosyada DEĞİL, servisin RPC sınırında (`StockIntakeService.receive`, 02.9) —
   * uygulama katmanının gördüğü her para sayısı cent.
   *
   * `null` = "bu satırın fiyatını bilmiyorum" ve bu meşrudur: PO'lu kabulde admin yalnız SAPAN
   * satırı düzeltir, ötekiler siparişten eşleşmeye devam eder.
   */
  unitCostCents: number | null;
}

/** PO'dan dolu gelen form satırı — beklenen adet + ürün adı; fiyat yok. */
export interface IntakeFormRow {
  variantId: string;
  productName: string;
  variantLabel: string;
  /** Tedarik siparişinde ısmarlanan adet; depocu sayarak doğrular. */
  expectedQty: number;
}

/**
 * Bekleyen tedarik siparişinden **dolu form**. PO yoksa boş dizi döner — plansız alım da meşrudur
 * (küçük/acil alım), form elle doldurulur.
 */
export async function openIntakeForm(purchaseOrderId: string): Promise<IntakeFormRow[]> {
  const db = serviceDb();
  const lines = await new PurchaseOrderItemService(db).listByOrder(purchaseOrderId);
  if (lines.length === 0) return [];

  const variants = await new ProductVariantService(db).listByIds([...new Set(lines.map((line) => line.variantId))]);
  const products = await new ProductService(db).listByIds([...new Set(variants.map((variant) => variant.productId))]);
  const productOf = new Map(products.map((product) => [product.id, product]));
  const variantOf = new Map(variants.map((variant) => [variant.id, variant]));

  return lines.map((line) => {
    const variant = variantOf.get(line.variantId);
    return {
      variantId: line.variantId,
      productName: resolveLocalizedText(variant ? (productOf.get(variant.productId)?.name ?? {}) : {}, 'tr'),
      variantLabel: resolveLocalizedText(variant?.label ?? {}, 'tr'),
      expectedQty: line.qty,
    };
  });
}

export interface IntakeWarning {
  variantId: string;
  /** Raf ömrünün kalan yüzdesi — eşiğin altındaysa uyarı doğar. */
  remainingPercent: number | null;
}

export interface IntakeDifference {
  variantId: string;
  expectedQty: number;
  receivedQty: number;
}

type IntakeOutcome =
  | {
      status: 'ok';
      result: ReceiveIntakeResult;
      /** Raf ömrü kısa gelen partiler — kabul ENGELLENMEZ, yalnız bildirilir. */
      warnings: IntakeWarning[];
      /** PO'ya göre eksik/fazla — fark olarak işaretlenir, iş durmaz. */
      differences: IntakeDifference[];
      /**
       * Yeni maliyet yüzünden hedefe çekilen fiyat sayısı (otomatik fiyatlı ürünler).
       * Depocuya gösterilmez — fiyat onun işi değil; kabul kaydında görünür kalması içindir.
       */
      repricedCount: number;
    }
  | { status: 'empty' };

/**
 * **Mal kabul — DEPOCU yolu.** Satırlar partiye dönüşür, PO kapanır, son alış fiyatı güncellenir —
 * hepsi tek transaction'da (RPC). Bu kapının eklediği üç şey: PO'dan maliyet eşlemesi, MLOR uyarısı
 * ve beklenen–gelen farkı.
 *
 * Fark **hata değildir**: tedarikçi eksik ya da fazla göndermiş olabilir; kayıt gerçeği yazar,
 * sipariş kapanır ve fark görünür kalır (DOMAIN §16).
 *
 * Fiyatlı giriş için `receivePurchase` (09.14) — bu kapı fiyat KABUL ETMEZ ve etmemeli.
 */
export async function receiveGoods(input: {
  /** Mal HANGİ depoya girdi (K6) — zorunlu: satın alma depo-üstüdür ama mal bir kapıdan girer. */
  warehouseId: string;
  lines: readonly IntakeFormLine[];
  purchaseOrderId?: string | null;
  supplierId?: string | null;
  date?: string;
  note?: string | null;
}): Promise<IntakeOutcome> {
  // Satırlar fiyatsız GİRER ve fiyatsız kalır: `null` burada "bilmiyorum" demek, ve çekirdek onu
  // PO'dan doldurur. Depocu yolunun fiyata dair söyleyebileceği hiçbir şey yok.
  return intake({ ...input, lines: input.lines.map((line) => ({ ...line, unitCostCents: null })) });
}

/**
 * **Satın alma kaydı** — admin'in "Stok girişi" yolu (09.14).
 *
 * `receiveGoods`'tan tek farkı satırların maliyet taşıması; envanter tarafı (parti, PO kapanışı,
 * MLOR uyarısı, fark raporu, yeniden fiyatlama) birebir aynıdır ve aynı çekirdekten geçer — iki
 * ayrı akış yazsaydık biri gün gelir ötekinden ayrılırdı.
 *
 * İki durumu birden karşılar: **PO'suz doğrudan alım** (maliyet yalnız buradan gelebilir — eskiden
 * parti maliyetsiz doğuyordu) ve **PO'lu kabulde fiyat düzeltmesi** (fatura siparişten farklı
 * geldiyse gerçek fiyat yazılır; son alış fiyatı ve `auto_price`'ın tabanı onu izler).
 */
export async function receivePurchase(input: {
  warehouseId: string;
  lines: readonly PurchaseIntakeLine[];
  purchaseOrderId?: string | null;
  supplierId?: string | null;
  date?: string;
  note?: string | null;
}): Promise<IntakeOutcome> {
  return intake(input);
}

async function intake(input: {
  warehouseId: string;
  lines: readonly PurchaseIntakeLine[];
  purchaseOrderId?: string | null;
  supplierId?: string | null;
  date?: string;
  note?: string | null;
}): Promise<IntakeOutcome> {
  if (input.lines.length === 0) return { status: 'empty' };

  const db = serviceDb();
  const costsInCents = await unitCostsOf(db, input.purchaseOrderId);
  const expected = await expectedQtysOf(db, input.purchaseOrderId);

  const result = await new StockIntakeService(db).receive({
    warehouseId: input.warehouseId,
    supplierId: input.supplierId ?? (await supplierOf(db, input.purchaseOrderId)),
    purchaseOrderId: input.purchaseOrderId,
    date: input.date,
    note: input.note,
    // ── MALİYETİN ÖNCELİĞİ: SATIR > PO > null ──────────────────────────────
    // Elle girilen fiyat siparişteki beklentiyi EZER, çünkü fatura gerçeği söyler: tedarikçi zamla
    // gönderdiyse "son alış fiyatı" o zamlı fiyattır ve `auto_price` da onu görmelidir. Tersi sıra
    // (PO kazansa) admin'in düzeltmesini sessizce çöpe atardı.
    //
    // Birim CENT ve öyle KALIR: euro'ya çevrim artık servisin RPC sınırında (02.9 · `STACK §8`).
    // İki kaynak da (satırın kendi fiyatı, PO'dan gelen beklenti) cent olduğu için `??` zinciri
    // tek birimle çalışıyor — eskiden PO tarafı euro geliyordu ve burada elle çevriliyordu.
    lines: input.lines.map((line) => ({
      variantId: line.variantId,
      qty: line.qty,
      expiryDate: line.expiryDate,
      lotNumber: line.lotNumber,
      location: line.location,
      unitCostCents: line.unitCostCents ?? costsInCents.get(line.variantId) ?? null,
    })),
  });

  // MALİYET DEĞİŞTİ → otomatik fiyatlı ürünlerin fiyatı hedef marja çekilir (DOMAIN §"Maliyet ve
  // hedef marj"). Otomatik fiyatın asıl tetikleyicisi burasıdır: yeni parti ortalama maliyeti
  // değiştirir ve `auto_price` açık ürün, o değişimi beklemeden zaten eski fiyatındadır.
  // Kabulü BOZMAZ: fiyat hizalaması bu noktada zaten yazılmış bir partinin ardından gelir, hata
  // verirse mal kabul geri alınmaz — fiyat bir sonraki tetikte hizalanır.
  const repriced = await repriceVariants(db, input.lines.map((line) => line.variantId)).catch(() => null);

  return {
    status: 'ok',
    result,
    warnings: await mlorWarnings(db, input.lines),
    differences: differencesOf(input.lines, expected),
    repricedCount: repriced?.changes.length ?? 0,
  };
}

/** Raf ömrü uyarıları — ölçüt üründe (`shelfLifeDays`); ömür bilinmiyorsa uyarı üretilmez. */
async function mlorWarnings(db: ReturnType<typeof serviceDb>, lines: readonly IntakeFormLine[]): Promise<IntakeWarning[]> {
  const variants = await new ProductVariantService(db).listByIds([...new Set(lines.map((line) => line.variantId))]);
  const products = await new ProductService(db).listByIds([...new Set(variants.map((variant) => variant.productId))]);
  const shelfLifeOf = new Map(products.map((product) => [product.id, product.shelfLifeDays]));
  const variantOf = new Map(variants.map((variant) => [variant.id, variant]));

  const warnings: IntakeWarning[] = [];
  for (const line of lines) {
    const variant = variantOf.get(line.variantId);
    const verdict = meetsMlor(line.expiryDate, variant ? shelfLifeOf.get(variant.productId) : null);
    if (!verdict.ok) warnings.push({ variantId: line.variantId, remainingPercent: verdict.remainingPercent });
  }
  return warnings;
}

/**
 * Beklenen–gelen farkı. Yalnız SAPAN satırlar döner; eşit olan satır gürültüdür.
 *
 * **PO yoksa fark da yoktur:** plansız alımda karşılaştırılacak bir sipariş bulunmaz; her satırı
 * "beklenmedik mal" diye işaretlemek anlamsız bir uyarı yığını üretirdi.
 */
function differencesOf(lines: readonly IntakeFormLine[], expected: Map<string, number>): IntakeDifference[] {
  if (expected.size === 0) return [];

  const received = new Map<string, number>();
  for (const line of lines) received.set(line.variantId, (received.get(line.variantId) ?? 0) + line.qty);

  const differences: IntakeDifference[] = [];
  for (const [variantId, expectedQty] of expected) {
    const receivedQty = received.get(variantId) ?? 0;
    if (receivedQty !== expectedQty) differences.push({ variantId, expectedQty, receivedQty });
  }
  // PO'da olmayan ama gelen mal da bir farktır (tedarikçi ikram/ikame göndermiş olabilir).
  for (const [variantId, receivedQty] of received) {
    if (!expected.has(variantId)) differences.push({ variantId, expectedQty: 0, receivedQty });
  }
  return differences;
}

/**
 * PO kalemlerinin birim fiyatı — **cent** olarak (servis öyle döndürüyor, 02.9 · `STACK §8`).
 *
 * Fiyatı GİRİLMEMİŞ kalem haritaya hiç girmez: `null`'ı taşımak "bilinmiyor"u bir değer gibi
 * göstermek olurdu; yokluk zaten `??` zincirinin bir sonraki halkasına düşüyor.
 */
async function unitCostsOf(db: ReturnType<typeof serviceDb>, purchaseOrderId?: string | null): Promise<Map<string, number>> {
  if (!purchaseOrderId) return new Map();
  const lines = await new PurchaseOrderItemService(db).listByOrder(purchaseOrderId);
  return new Map(lines.filter((line) => line.unitPriceCents != null).map((line) => [line.variantId, line.unitPriceCents!]));
}

/**
 * Siparişin KALAN beklentisi — "bu kabulden önce daha ne bekliyorduk".
 *
 * Ölçü `purchase_order_progress` görünümüdür (0042), PO kaleminin ham `qty`'si DEĞİL. Fark bu
 * yüzden önemli: tek sipariş birden çok depoda parça parça kabul edilebilir (K6). Ham `qty`'ye
 * bakan bir karşılaştırma, 30'luk siparişin 20'si Strasbourg'a girdikten sonra Kehl'deki ikinci
 * kabulde "20 eksik" derdi — oysa o 20 çoktan gelmişti. Sistem aynı soruya iki cevap verirdi:
 * ekran "eksik", PO durumu "tamamlandı".
 *
 * `missing_qty` kümülatiftir ve `initial_qty` üzerinden hesaplanır (`physical_qty` satışla erir).
 * Kalemi olmayan sipariş boş harita döndürür — karşılaştırılacak bir beklenti yoktur.
 */
async function expectedQtysOf(db: ReturnType<typeof serviceDb>, purchaseOrderId?: string | null): Promise<Map<string, number>> {
  if (!purchaseOrderId) return new Map();
  const rows = await new PurchaseOrderService(db).progressOf(purchaseOrderId);

  // Aynı varyant iki kalemde olabilir: beklenti TOPLANIR, üzerine yazılmaz. `new Map(...)` ile
  // kurulsaydı sessizce sonuncu kalem kazanırdı ve fark raporu diğerini yok sayardı.
  const kalan = new Map<string, number>();
  for (const row of rows) kalan.set(row.variantId, (kalan.get(row.variantId) ?? 0) + row.missingQty);
  return kalan;
}

/** PO'lu kabulde tedarikçi siparişten türer — depocuya sorulmaz. */
async function supplierOf(db: ReturnType<typeof serviceDb>, purchaseOrderId?: string | null): Promise<string | null> {
  if (!purchaseOrderId) return null;
  return (await new PurchaseOrderService(db).getById(purchaseOrderId))?.supplierId ?? null;
}
