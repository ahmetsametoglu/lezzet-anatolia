import { ProductService, StockService, VariantBarcodeService } from '@lezzet/database';
import { caseSizesByVariant } from './case-sizes';
import { publicImageUrl } from '@lezzet/storage';
import { resolveLocalizedText, type ProductDateType } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { variantNames } from './names';

/**
 * **PLANSIZ KABULÜN ÜRÜN ARAMASI** (23.13) — "elimde mal var, kayıtta karşılığı hangisi?"
 *
 * ── NEDEN AYRI BİR KAPI ─────────────────────────────────────────────────────
 * PO'lu kabulde satır kümesi SİPARİŞTEN gelir ve arama gereksizdir; oradaki "katalog araması
 * bilerek yok" kararı (karar §1.3) hâlâ geçerli — yanlış ürüne öğretmenin kapısıdır. Plansız
 * kabulde ise küme YOKTUR: mal gelmiştir, siparişi girilmemiştir. Depocu ürünü bir şekilde
 * seçebilmeli, yoksa kabul hiç yazılamaz (ekran bugüne kadar bu yüzden satır açamıyordu).
 *
 * ── KOD ARAMASI ÖNCE, AD SONRA ──────────────────────────────────────────────
 * Girilen metin bir KOD olabilir (okutulan barkod, SKU, tedarikçi kodu). Kod eşleşirse ada hiç
 * bakılmaz — kod kesin kimliktir, ad tahmindir (`code-search.ts`'in web'de aldığı aynı karar).
 * Zincir yine tek kapıdan (`findByCode`), ikinci bir arama sırası açılmıyor.
 *
 * ── PARA TAŞIMAZ ────────────────────────────────────────────────────────────
 * Dönen satırda fiyat YOK ve olamaz: depo yolu fiyat görmez (09.14) — kabul gövdesinde maliyet
 * alanı da yok. Satır yalnız kimlik + tanıma yetecek kadar künye taşır.
 */

export interface VariantSearchRow {
  variantId: string;
  productName: string;
  variantLabel: string;
  sku: string | null;
  /**
   * Ürünün tarih rejimi + toplam raf ömrü. Plansız kabulde SEÇİLEN ÜRÜN SATIR OLUR ve o satırın
   * SKT alanı bu ikisini ister; okutmayla açılan satır (`scan.ts`) da aynı iki alanı taşıyor —
   * aynı listede bir satır uyarı üretip ötekinin üretmemesi, kaynağa göre değişen bir kural olurdu.
   */
  dateType: ProductDateType;
  shelfLifeDays: number | null;
  imageUrl: string | null;
  /**
   * Çağıranın deposundaki kullanılabilir adet (rezervasyon düşülmüş). Depo-üstü toplam DEĞİL —
   * gerekçe sözleşme şemasında (`VariantSearchRowSchema.stockQty`).
   */
  stockQty: number;
  /** Kod eşleşmesiyle bulunduysa okutmanın kaç adet saydığı; ad aramasında `null`. */
  qtyPerCode: number | null;
  /**
   * Ürünün KAYITLI koli boyları — aramadan seçilen ürün de satır oluyor ve o satır adet
   * çekmecesini açıyor.
   *
   * `qtyPerCode` ile karıştırılmamalı: o OKUTULAN kodun çarpanıdır (tek sayı, ad aramasında yok),
   * bu ise ürünün bütün boylarıdır. Üçüncü kez aynı gerekçe (`sku`, `dateType`, `shelfLifeDays`):
   * aynı formda aramayla açılan satır ile okutmayla açılan satır aynı şeyi sorabilmeli.
   */
  caseSizes: { code: string; qtyPerCode: number }[];
}

/**
 * Tavan ÜRÜNE uygulanır, satıra değil: sayfa ürün sayfası ve her ürün boylarıyla açılıyor — yani
 * dönen satır sayısı bundan büyük olabilir (ölçüldü 24.08: "baklava" → 12 ürün, 27 boy). Doğrusu
 * da bu; bir ürünün boylarından yalnız bazılarını göstermek, depocuya elindeki malın listede
 * olmadığını düşündürürdü.
 */
const DEFAULT_LIMIT = 12;

export async function searchVariantsForIntake(
  db: SupabaseClient,
  input: { query: string; warehouseId: string; limit?: number },
): Promise<VariantSearchRow[]> {
  const query = input.query.trim();
  if (query.length === 0) return [];
  const limit = input.limit ?? DEFAULT_LIMIT;

  // 1) KOD: eşleşirse tek satır döner ve ada hiç bakılmaz.
  const match = await new VariantBarcodeService(db).findByCode(query);
  if (match) {
    // Ad/görsel/KOD çözümü depo kapılarının ORTAK okumasından (`names.ts`) — ikinci bir "varyantın
    // adı nasıl bulunur" yolu açılmıyor. SKU için ayrıca `ProductVariantService.listByIds`
    // çağrılıyordu (30.08'e kadar): o okuma varyant satırını zaten getiriyor, ikinci tur onun
    // kopyasıydı ve okutma kapısı (`scan`) aynı alanı hiç göremiyordu.
    const names = await variantNames(db, [match.variantId]);
    const name = names.get(match.variantId);
    if (name !== undefined) {
      return withStock(db, input.warehouseId, [
        {
          variantId: match.variantId,
          productName: name.productName,
          variantLabel: name.variantLabel,
          sku: name.sku,
          dateType: name.dateType,
          shelfLifeDays: name.shelfLifeDays,
          imageUrl: name.imageUrl,
          qtyPerCode: match.qtyPerCode,
        },
      ]);
    }
  }

  // 2) AD: üç dilde `ilike` (servisin kendi süzgeci). Aday ürünler de gelir — depoya girmiş bir
  // numunenin kabulü meşrudur; satılamaz olması ekranın söyleyeceği şeydir, saklayacağı değil.
  const page = await new ProductService(db).listStockRows({ filters: { query }, limit });
  return withStock(
    db,
    input.warehouseId,
    page.rows.flatMap((product) =>
      product.variants
        .filter((variant) => variant.isActive)
        .map((variant) => ({
          variantId: variant.id,
          productName: resolveLocalizedText(product.name, 'tr'),
          variantLabel: resolveLocalizedText(variant.label, 'tr'),
          sku: variant.sku ?? null,
          // Dar satır (`listStockRows`) tarih rejimini zaten taşıyor — kod dalıyla aynı iki alan,
          // ikinci bir okuma açılmadan.
          dateType: product.dateType,
          shelfLifeDays: product.shelfLifeDays,
          imageUrl: publicImageUrl(product.imageKey, product.imageUpdatedAt),
          qtyPerCode: null,
        })),
    ),
  );
}

/**
 * Satırlara **personelin deposundaki** stoğu ekler — TEK sorguda, satır başına okuma yok.
 *
 * `listStockRows` stok taşımıyor (adı sayfanın adından geliyor, verinin değil) ve taşıması da
 * gerekmiyor: stok depo-bağımlıdır, ürün satırı değildir. Birleştirme burada, iki dalın ORTAK
 * çıkışında yapılıyor — kod dalıyla ad dalının aynı künyeyi göstermesi gerekiyor ve iki ayrı
 * yerde yazılsaydı biri bir gün ötekinden ayrılırdı (CLAUDE §1).
 *
 * SATIRI OLMAYAN VARYANT SIFIRDIR, "ölçülemedi" değil: `listAvailableAcross` sıfır satırları
 * sorgudan bilerek düşürüyor (kendi künyesi: çapraz birleşim PostgREST'in satır tavanına
 * dayanıyordu). Yani burada `?? 0` bir varsayım değil, o sorgunun sözleşmesi.
 */
async function withStock(
  db: SupabaseClient,
  warehouseId: string,
  rows: Omit<VariantSearchRow, 'stockQty' | 'caseSizes'>[],
): Promise<VariantSearchRow[]> {
  if (rows.length === 0) return [];
  const variantIds = rows.map((row) => row.variantId);
  // Stok ve koli boyları birbirini beklemez: ikisi de aynı listenin aynı anındaki künyesi.
  const [stock, casesOf] = await Promise.all([
    new StockService(db).listAvailableAcross([warehouseId], variantIds),
    // Eleme (paket kodu) ve sıra (çarpan) tek kapıda — `case-sizes` künyesi.
    caseSizesByVariant(db, variantIds),
  ]);
  const available = new Map(stock.map((row) => [row.variantId, row.availableQty]));
  return rows.map((row) => ({
    ...row,
    stockQty: available.get(row.variantId) ?? 0,
    caseSizes: casesOf.get(row.variantId) ?? [],
  }));
}

