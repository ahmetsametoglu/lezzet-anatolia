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
 * tipinde `unitCost` alanı YOKTUR — ekran isteseydi bile gönderemez.
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
 * **Mal kabul.** Satırlar partiye dönüşür, PO kapanır, son alış fiyatı güncellenir — hepsi tek
 * transaction'da (RPC). Bu kapının eklediği üç şey: PO'dan maliyet eşlemesi, MLOR uyarısı ve
 * beklenen–gelen farkı.
 *
 * Fark **hata değildir**: tedarikçi eksik ya da fazla göndermiş olabilir; kayıt gerçeği yazar,
 * sipariş kapanır ve fark görünür kalır (DOMAIN §16).
 */
export async function receiveGoods(input: {
  lines: readonly IntakeFormLine[];
  purchaseOrderId?: string | null;
  supplierId?: string | null;
  date?: string;
  note?: string | null;
}): Promise<IntakeOutcome> {
  if (input.lines.length === 0) return { status: 'empty' };

  const db = serviceDb();
  const costs = await unitCostsOf(db, input.purchaseOrderId);
  const expected = await expectedQtysOf(db, input.purchaseOrderId);

  const result = await new StockIntakeService(db).receive({
    supplierId: input.supplierId ?? (await supplierOf(db, input.purchaseOrderId)),
    purchaseOrderId: input.purchaseOrderId,
    date: input.date,
    note: input.note,
    // Maliyet BURADA eşleşir: depocunun gönderdiği satırda yoktur, PO'dan gelir.
    lines: input.lines.map((line) => ({ ...line, unitCost: costs.get(line.variantId) ?? null })),
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

async function unitCostsOf(db: ReturnType<typeof serviceDb>, purchaseOrderId?: string | null): Promise<Map<string, number>> {
  if (!purchaseOrderId) return new Map();
  const lines = await new PurchaseOrderItemService(db).listByOrder(purchaseOrderId);
  return new Map(lines.filter((line) => line.unitPrice != null).map((line) => [line.variantId, line.unitPrice!]));
}

async function expectedQtysOf(db: ReturnType<typeof serviceDb>, purchaseOrderId?: string | null): Promise<Map<string, number>> {
  if (!purchaseOrderId) return new Map();
  const lines = await new PurchaseOrderItemService(db).listByOrder(purchaseOrderId);
  return new Map(lines.map((line) => [line.variantId, line.qty]));
}

/** PO'lu kabulde tedarikçi siparişten türer — depocuya sorulmaz. */
async function supplierOf(db: ReturnType<typeof serviceDb>, purchaseOrderId?: string | null): Promise<string | null> {
  if (!purchaseOrderId) return null;
  return (await new PurchaseOrderService(db).getById(purchaseOrderId))?.supplierId ?? null;
}
