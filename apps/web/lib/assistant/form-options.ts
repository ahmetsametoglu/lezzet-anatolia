import 'server-only';
import { CategoryService, CollectionService, ProductService, ProductVariantService, serviceDb } from '@lezzet/database';
import { resolveLocalizedText } from '@lezzet/types';
import type { ProductFormSource } from '@/components/operation/form/product-form/schema';

/**
 * KUYRUKTAKİ FORMLARIN SEÇENEK HAVUZU (22.10).
 *
 * ── NEDEN AYRI BİR OKUMA ────────────────────────────────────────────────────
 * Gövde artık gerçek bir form (indirim kuralı) ve formun `Select` kutuları seçenek ister: kapsam
 * kategorisi, koleksiyon. Bunlar önerinin payload'ında YOKTUR ve olmamalı da — dilekçe hedefin
 * KİMLİĞİNİ taşır, kataloğun tamamını değil. Operatör kapsamı değiştirmek isterse (asistan
 * "Tatlı" demiş, o "Baklava" diyecek) listenin orada olması gerekir.
 *
 * ── TİPE ÖZEL DEĞİL, ORTAK ──────────────────────────────────────────────────
 * Havuz tek yerde çünkü sıradaki gövdeler de aynı iki listeyi isteyecek (ürün taslağının kategorisi,
 * paketin koleksiyonu). Tip başına ayrı okuma yazılsaydı aynı sorgu üç kez koşar ve biri bir gün
 * sıralamayı ötekinden farklı yapardı.
 *
 * ── SAYFALAMA YOK, VE BU KURALA UYGUN ───────────────────────────────────────
 * Kategori ve koleksiyon operatörün elle kurduğu, doğal tavanı olan kümeler (`CLAUDE §1`): tek turda
 * çekilir. Veriyle büyüyen bir küme olsaydı `Select` zaten yanlış kontrol olurdu.
 */
export interface AssistantFormOptions {
  categories: Array<{ id: string; name: string }>;
  collections: Array<{ id: string; name: string }>;
  /**
   * ÜRÜN TASLAĞI önerilerinin konusu olan ürünlerin TAM kaydı (22.14).
   *
   * Gövde ürün ekranının GERÇEK formunu açıyor ve o form ürünün tamamını ister: kategori, KDV, tarih
   * tipi, raf ömrü, kargo izni, varyantlar. Dilekçe bunların hiçbirini taşımaz ve taşımamalı —
   * asistanın dokunduğu alanlar yalnız beyan alanları, ötekiler zaten kayıtta duruyor.
   *
   * Form ürünün BUGÜNKÜ hâliyle açılıp asistanın önerisi üzerine yazılıyor. Kayıt okunmasaydı form
   * boş açılır, kaydetme de dokunulmamış alanları (kategori, varyantlar) sıfırlardı.
   */
  products: Record<string, ProductFormSource>;
}

export async function readAssistantFormOptions(productIds: string[] = []): Promise<AssistantFormOptions> {
  const db = serviceDb();
  const wanted = [...new Set(productIds)];
  const [categories, collections, products] = await Promise.all([
    new CategoryService(db).list(),
    new CollectionService(db).list(),
    wanted.length > 0 ? new ProductService(db).listByIds(wanted) : Promise.resolve([]),
  ]);

  // Varyantlar AYRI okunur ve tek turda: form varyant satırlarını da düzenletiyor, ürün kaydı onları
  // taşımıyor. Ürün başına sorgu açmak listenin uzunluğu kadar tur demekti (`STACK §13`).
  const variants = products.length > 0 ? await new ProductVariantService(db).listByProducts(products.map((p) => p.id)) : [];

  return {
    categories: categories.map((c) => ({ id: c.id, name: resolveLocalizedText(c.name) })),
    collections: collections.map((c) => ({ id: c.id, name: resolveLocalizedText(c.name) })),
    products: Object.fromEntries(
      products.map((p) => [p.id, { ...p, variants: variants.filter((v) => v.productId === p.id) }]),
    ),
  };
}
