import {
  ProductService,
  ProductVariantService,
  PurchaseOrderItemService,
  PurchaseOrderService,
  StockIntakeService,
} from '@lezzet/database';
import { meetsMlor } from '@lezzet/domain-core';
import { logger } from '@lezzet/observability';
import type { ReceiveIntakeResult } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { variantNames } from './names';

/**
 * **Mal kabul — D2** (10.4), terfi 21.11. Kaynağı `apps/web/lib/stock/intake.ts`;
 * `design/pages/depo-stok-giris.md` + DOMAIN §16 + mobil v2 "Mal Kabul" ekranı bağlayıcı.
 *
 * **Depocu alış fiyatı GÖRMEZ ve GİRMEZ.** Form satırı yalnız adet, son tarih, lot ve konum ister;
 * birim maliyet tedarik siparişinden (admin'in girdiği) sunucu tarafında eklenir. Bu yüzden depocu
 * yolunun satır tipinde `unitCostCents` alanı YOKTUR — ekran isteseydi bile gönderemez.
 *
 * **MLOR uyarısı engellemez, uyarır** (DOMAIN §4): raf ömrünün yeterince kalmadığı parti yine kabul
 * edilebilir — kararı mal kabul eden verir (v2: *"kalan ömür %X — uyarı, engellemez"*). Sistem yalnız
 * görünür kılar.
 *
 * **Parçalı kabul meşrudur ve cevapta görünür:** beklenen–gelen farkı `differences` ile döner, iş
 * durmaz (v2: *"FARK ÖZETİ — YALNIZ SAPAN SATIRLAR"*). Tedarikçi eksik ya da fazla göndermiş
 * olabilir; kayıt gerçeği yazar, fark görünür kalır.
 *
 * **Çevrimdışı ÇALIŞMAZ ve bu kural burada DEĞİL** (doc 04 D2): bağlantı şartı istemci davranışıdır
 * — sunucu tarafında "kuyruk" diye bir kavram yok, olsaydı raf ↔ sistem çelişkisini kurumsallaştırırdı.
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
 * Aynı varyant birden çok satırda gelebilir (farklı son tarih ya da farklı lot ayrı satırdır ve aynı
 * sevkiyatta farklı fiyata alınmış olabilir); varyant anahtarlı bir harita o farkı sessizce yutardı.
 */
export interface PurchaseIntakeLine extends IntakeFormLine {
  /**
   * Birim alış fiyatı — **tamsayı cent** (`STACK §8`). Euro'ya çevrim bu dosyada DEĞİL, servisin RPC
   * sınırında (`StockIntakeService.receive`, 02.9).
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
 * **Bekleyen tedarik siparişinden dolu form.** PO yoksa boş dizi döner — plansız alım da meşrudur
 * (v2'nin "+ plansız kabul" yolu), form elle doldurulur.
 *
 * **Depo sorulmaz ve sorulmamalı:** satın alma depo-üstüdür (K6), mal hangi kapıdan gireceğini
 * kabul anında söyler (`receiveGoods.warehouseId`). Formu depoya süzmek, aynı siparişin ikinci
 * deposundaki kalemleri gizlerdi.
 *
 * @param db service-role istemci — çağıran enjekte eder (`serviceDb()`), `auth/otp` deseni.
 */
export async function openIntakeForm(db: SupabaseClient, purchaseOrderId: string): Promise<IntakeFormRow[]> {
  const lines = await new PurchaseOrderItemService(db).listByOrder(purchaseOrderId);
  if (lines.length === 0) return [];

  const names = await variantNames(db, lines.map((line) => line.variantId));
  return lines.map((line) => ({
    variantId: line.variantId,
    productName: names.get(line.variantId)?.productName ?? '—',
    variantLabel: names.get(line.variantId)?.variantLabel ?? '',
    expectedQty: line.qty,
  }));
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

/**
 * **Maliyet değişince otomatik fiyatı hedefe çeken port** (09.5 · DOMAIN "Maliyet ve hedef marj").
 *
 * ── NEDEN PORT, NEDEN TERFİ DEĞİL ────────────────────────────────────────────
 * Web kopyası `repriceVariants`'ı doğrudan çağırıyor (`apps/web/lib/pricing/auto-price.ts`, 146
 * satır + `cost-basis.ts`). O modül FİYAT şeridinin işi ve bu turda taşınmadı: taşımak, sahibi başka
 * olan bir modülü habersiz çatallamak olurdu (`order/effects.ts` ile aynı gerekçe). Port, bağın
 * KAYIP olduğunu değil **kayıtsız** olduğunu söyler — ve kaydedildiği gün davranış birebir olur.
 *
 * Dönen sayı "kaç fiyat hedefe çekildi". Kabulü BOZMAZ: fiyat hizalaması zaten yazılmış bir partinin
 * ardından gelir; port patlarsa mal kabul geri alınmaz.
 */
export type RepricePort = (variantIds: readonly string[]) => Promise<number>;

type IntakeOutcome =
  | {
      status: 'ok';
      result: ReceiveIntakeResult;
      /** Raf ömrü kısa gelen partiler — kabul ENGELLENMEZ, yalnız bildirilir. */
      warnings: IntakeWarning[];
      /** PO'ya göre eksik/fazla — fark olarak işaretlenir, iş durmaz. */
      differences: IntakeDifference[];
      /**
       * Yeni maliyet yüzünden hedefe çekilen fiyat sayısı (otomatik fiyatlı ürünler). Depocuya
       * gösterilmez — fiyat onun işi değil; kabul kaydında görünür kalması içindir.
       *
       * **`null` = ÖLÇÜLEMEDİ, sıfır DEĞİL** (CLAUDE.md §1): port kayıtlı değilse ya da çağrı
       * düştüyse "hiçbir fiyat değişmedi" demek, bozuk bir ölçümü sağlıklı gibi okutmak olurdu.
       */
      repricedCount: number | null;
    }
  | { status: 'empty' };

/**
 * **Mal kabul — DEPOCU yolu.** Satırlar partiye dönüşür, PO kapanır, son alış fiyatı güncellenir —
 * hepsi tek transaction'da (RPC). Bu kapının eklediği üç şey: PO'dan maliyet eşlemesi, MLOR uyarısı
 * ve beklenen–gelen farkı.
 *
 * Fiyatlı giriş için `receivePurchase` (09.14) — bu kapı fiyat KABUL ETMEZ ve etmemeli.
 */
export async function receiveGoods(
  db: SupabaseClient,
  input: {
    /** Mal HANGİ depoya girdi (K6) — zorunlu: satın alma depo-üstüdür ama mal bir kapıdan girer. */
    warehouseId: string;
    lines: readonly IntakeFormLine[];
    purchaseOrderId?: string | null;
    supplierId?: string | null;
    date?: string;
    note?: string | null;
    reprice?: RepricePort;
  },
): Promise<IntakeOutcome> {
  // Satırlar fiyatsız GİRER ve fiyatsız kalır: `null` burada "bilmiyorum" demek, ve çekirdek onu
  // PO'dan doldurur. Depocu yolunun fiyata dair söyleyebileceği hiçbir şey yok.
  return intake(db, { ...input, lines: input.lines.map((line) => ({ ...line, unitCostCents: null })) });
}

/**
 * **Satın alma kaydı** — admin'in "Stok girişi" yolu (09.14).
 *
 * `receiveGoods`'tan tek farkı satırların maliyet taşıması; envanter tarafı (parti, PO kapanışı,
 * MLOR uyarısı, fark raporu, yeniden fiyatlama) birebir aynıdır ve aynı çekirdekten geçer — iki
 * ayrı akış yazsaydık biri gün gelir ötekinden ayrılırdı.
 *
 * İki durumu birden karşılar: **PO'suz doğrudan alım** (maliyet yalnız buradan gelebilir) ve **PO'lu
 * kabulde fiyat düzeltmesi** (fatura siparişten farklı geldiyse gerçek fiyat yazılır).
 */
export async function receivePurchase(
  db: SupabaseClient,
  input: {
    warehouseId: string;
    lines: readonly PurchaseIntakeLine[];
    purchaseOrderId?: string | null;
    supplierId?: string | null;
    date?: string;
    note?: string | null;
    reprice?: RepricePort;
  },
): Promise<IntakeOutcome> {
  return intake(db, input);
}

async function intake(
  db: SupabaseClient,
  input: {
    warehouseId: string;
    lines: readonly PurchaseIntakeLine[];
    purchaseOrderId?: string | null;
    supplierId?: string | null;
    date?: string;
    note?: string | null;
    reprice?: RepricePort;
  },
): Promise<IntakeOutcome> {
  if (input.lines.length === 0) return { status: 'empty' };

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
    // Birim CENT ve öyle KALIR: euro'ya çevrim servisin RPC sınırında (02.9 · `STACK §8`).
    lines: input.lines.map((line) => ({
      variantId: line.variantId,
      qty: line.qty,
      expiryDate: line.expiryDate,
      lotNumber: line.lotNumber,
      location: line.location,
      unitCostCents: line.unitCostCents ?? costsInCents.get(line.variantId) ?? null,
    })),
  });

  return {
    status: 'ok',
    result,
    warnings: await mlorWarnings(db, input.lines),
    differences: differencesOf(input.lines, expected),
    repricedCount: await reprice(input.reprice, input.lines.map((line) => line.variantId)),
  };
}

/** Süreç başına tek uyarı: aynı eksik port her kabulde bağırırsa kimse duymaz olur (`effects.ts`). */
let warnedMissingReprice = false;

/**
 * Otomatik fiyat hizalaması. **Kayıtsız port sessizce atlanmaz** — bir kez uyarır ve `null` döner;
 * çağrı patlarsa kaydı düşer, kabulü geri almaz.
 */
async function reprice(port: RepricePort | undefined, variantIds: readonly string[]): Promise<number | null> {
  if (!port) {
    if (!warnedMissingReprice) {
      warnedMissingReprice = true;
      logger.warn(
        { context: 'application/warehouse-intake', effect: 'reprice' },
        'otomatik fiyat portu KAYITLI DEĞİL — maliyet değişti ama fiyat hizalaması atlandı',
      );
    }
    return null;
  }
  try {
    return await port(variantIds);
  } catch (err) {
    logger.warn(
      { context: 'application/warehouse-intake', err: err instanceof Error ? err.message : String(err) },
      'otomatik fiyat hizalaması düştü — mal kabul geri ALINMADI, fiyat sonraki tetikte hizalanır',
    );
    return null;
  }
}

/** Raf ömrü uyarıları — ölçüt üründe (`shelfLifeDays`); ömür bilinmiyorsa uyarı üretilmez. */
async function mlorWarnings(db: SupabaseClient, lines: readonly IntakeFormLine[]): Promise<IntakeWarning[]> {
  const shelfLifeOf = await shelfLivesOf(db, lines.map((line) => line.variantId));

  const warnings: IntakeWarning[] = [];
  for (const line of lines) {
    const verdict = meetsMlor(line.expiryDate, shelfLifeOf.get(line.variantId));
    if (!verdict.ok) warnings.push({ variantId: line.variantId, remainingPercent: verdict.remainingPercent });
  }
  return warnings;
}

/**
 * Varyant → ürünün toplam raf ömrü (gün). MLOR'un tek girdisi bu; ad çözümü (`names.ts`) burada
 * kullanılmıyor çünkü ekranın sorusu farklı — o "ne yazacağım", bu "kaç gün".
 */
async function shelfLivesOf(db: SupabaseClient, variantIds: readonly string[]): Promise<Map<string, number | null>> {
  const variants = await new ProductVariantService(db).listByIds([...new Set(variantIds)]);
  const products = await new ProductService(db).listByIds([...new Set(variants.map((variant) => variant.productId))]);
  const shelfLifeOf = new Map(products.map((product) => [product.id, product.shelfLifeDays]));
  return new Map(variants.map((variant) => [variant.id, shelfLifeOf.get(variant.productId) ?? null]));
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
async function unitCostsOf(db: SupabaseClient, purchaseOrderId?: string | null): Promise<Map<string, number>> {
  if (!purchaseOrderId) return new Map();
  const lines = await new PurchaseOrderItemService(db).listByOrder(purchaseOrderId);
  return new Map(
    lines.filter((line) => line.unitPriceCents != null).map((line) => [line.variantId, line.unitPriceCents!]),
  );
}

/**
 * Siparişin KALAN beklentisi — "bu kabulden önce daha ne bekliyorduk".
 *
 * Ölçü `purchase_order_progress` görünümüdür (0031_warehouse), PO kaleminin ham `qty`'si DEĞİL. Fark bu
 * yüzden önemli: tek sipariş birden çok depoda parça parça kabul edilebilir (K6). Ham `qty`'ye
 * bakan bir karşılaştırma, 30'luk siparişin 20'si Strasbourg'a girdikten sonra Kehl'deki ikinci
 * kabulde "20 eksik" derdi — oysa o 20 çoktan gelmişti.
 *
 * `missing_qty` kümülatiftir ve `initial_qty` üzerinden hesaplanır (`physical_qty` satışla erir).
 */
async function expectedQtysOf(db: SupabaseClient, purchaseOrderId?: string | null): Promise<Map<string, number>> {
  if (!purchaseOrderId) return new Map();
  const rows = await new PurchaseOrderService(db).progressOf(purchaseOrderId);

  // Aynı varyant iki kalemde olabilir: beklenti TOPLANIR, üzerine yazılmaz. `new Map(...)` ile
  // kurulsaydı sessizce sonuncu kalem kazanırdı ve fark raporu diğerini yok sayardı.
  const kalan = new Map<string, number>();
  for (const row of rows) kalan.set(row.variantId, (kalan.get(row.variantId) ?? 0) + row.missingQty);
  return kalan;
}

/** PO'lu kabulde tedarikçi siparişten türer — depocuya sorulmaz. */
async function supplierOf(db: SupabaseClient, purchaseOrderId?: string | null): Promise<string | null> {
  if (!purchaseOrderId) return null;
  return (await new PurchaseOrderService(db).getById(purchaseOrderId))?.supplierId ?? null;
}
