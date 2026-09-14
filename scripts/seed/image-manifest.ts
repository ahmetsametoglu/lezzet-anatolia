import { ImageMetaSchema, type ImageMeta } from '@lezzet/types';

/**
 * ── GÖRSEL KÜNYESİ — seed görsellerinin sürümü ve ölçüsü (05.37, 14.09) ───────────────────────────
 *
 * Görselin okuma adresi sürüm damgasını taşır (`?v=<image_updated_at>`, `publicImageUrl`) ve CDN her
 * yeni adresi YENİ bir dönüşüm sayar. Seed eskiden her `db:refresh`te bütün görselleri yeniden yükleyip
 * damgayı "şimdi" yazıyordu — her tazeleme sitenin bütün görsel adreslerini değiştiriyordu — ve ölçüsüz
 * her satır için CDN'e ölçü soruyordu. Ölçüldü 14.09: tazelemeler ücretsiz dönüşüm kotasını (ayda 5.000)
 * bitirdi, önbellekte olmayan her kesit 429 döndü.
 *
 * Künye anahtar → sürüm + ölçü tutar. Seed künyedeki bir görselin depoda AYNI içerikle durduğunu
 * görürse yüklemez ve künyenin değerlerini yazar: adres tazelemeden tazelemeye aynı kalır, CDN'e ölçü
 * sorulmaz. Künye yerel veritabanından üretilir (`pnpm images:manifest`); bu dosya saf kısmıdır.
 */

/** Görsel taşıyan tablolar — kolon adları hepsinde aynı (`ImageMetaSchema`). Ölçü dolgusu da bunu okur. */
export const IMAGE_TABLES = ['category', 'category_image', 'collection', 'product', 'product_image', 'bundle', 'recipe', 'site_image'] as const;

/** Künyenin bir satırı — görsel satırına `imageKey` ile birlikte yazılan üç alan. */
export type KunyeSatiri = Pick<ImageMeta, 'imageUpdatedAt' | 'imageWidth' | 'imageHeight'>;

const KunyeSatiriSchema = ImageMetaSchema.pick({ imageUpdatedAt: true, imageWidth: true, imageHeight: true }).strict();

/** JSON'daki künyeyi doğrular. `_` ile başlayan alanlar not, veri değil; bozuk satır ADIYLA patlar. */
export function kunyeOku(ham: Record<string, unknown>): Map<string, KunyeSatiri> {
  const kunye = new Map<string, KunyeSatiri>();
  for (const [key, deger] of Object.entries(ham)) {
    if (key.startsWith('_')) continue;
    const sonuc = KunyeSatiriSchema.safeParse(deger);
    if (!sonuc.success) throw new Error(`görsel künyesi: "${key}" satırı bozuk — ${sonuc.error.issues[0]?.message ?? 'şema'}`);
    kunye.set(key, sonuc.data);
  }
  return kunye;
}

const ayni = (a: KunyeSatiri, b: KunyeSatiri) =>
  a.imageUpdatedAt === b.imageUpdatedAt && a.imageWidth === b.imageWidth && a.imageHeight === b.imageHeight;

/**
 * Veritabanı satırlarından künye — anahtara göre SIRALI, künyenin farkı okunur kalsın. Aynı anahtar iki
 * satırda farklı değerle duruyorsa patlar: hangisinin geçerli olduğunu künye bilemez.
 */
export function kunyeKur(rows: readonly (KunyeSatiri & { imageKey: string })[]): Record<string, KunyeSatiri> {
  const kunye = new Map<string, KunyeSatiri>();
  for (const r of rows) {
    const satir: KunyeSatiri = { imageUpdatedAt: r.imageUpdatedAt, imageWidth: r.imageWidth, imageHeight: r.imageHeight };
    const onceki = kunye.get(r.imageKey);
    if (onceki && !ayni(onceki, satir)) throw new Error(`görsel künyesi: "${r.imageKey}" iki satırda farklı sürüm/ölçüyle duruyor`);
    kunye.set(r.imageKey, satir);
  }
  return Object.fromEntries([...kunye].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/**
 * Künyedeki değer ancak depodaki nesne AYNI içerikse geçerlidir (ETag = MD5, tek parça yükleme).
 *
 * Künyeye tek başına güvenilmez: anahtar yalnız slug + uzantıdan türüyor (`r2Keys.productImage`), aynı
 * ürüne yeni fotoğraf verilirse anahtar değişmez ve eski dosya sessizce kalırdı. Depoda hiç olmayan dosya
 * (başka makine, başka `R2_PATH_PREFIX`) da aynı yoldan yüklenir.
 */
export function kunyeGecerli(kayit: KunyeSatiri | undefined, depodakiEtag: string | null, dosyaMd5: string): kayit is KunyeSatiri {
  return kayit !== undefined && depodakiEtag === dosyaMd5;
}
