import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { OrderEffects } from '@lezzet/application';
import { ProductService, type createServiceRoleClient } from '@lezzet/database';
import { getR2, r2Keys } from '@lezzet/storage';
import { resolveLocalizedText, type ProductStatus } from '@lezzet/types';
import { kunyeGecerli, kunyeOku, type KunyeSatiri } from './image-manifest';

/**
 * Seed bölümlerinin ortak zemini: istemci tipi, guard, tarih/para yardımcıları, görsel yükleme ve
 * katalog referansı. Bölümler birbirini DEĞİL burayı bilir — sıra `seed.ts`'te kurulur.
 */

export type Db = ReturnType<typeof createServiceRoleClient>;

/** Beslemenin sipariş yan etkisi: müşteriye haber gitmez. Boş port bu kararı söyler; eksik port uyarısı portu unutan gerçek yüzey içindir. */
export const SESSIZ_ETKILER: OrderEffects = { notifyStatus: async () => undefined, notifyException: async () => undefined };

/** Bölüm guard'ı — tablo doluysa atlanır; seed'i tekrar çalıştırmak güvenli kalsın. */
export async function tabloDolu(db: Db, table: string): Promise<boolean> {
  const { count, error } = await db.from(table).select('*', { count: 'exact', head: true });
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** Bugüne göre n gün ötesi/berisi — `YYYY-MM-DD` (tarih kolonları). */
export const gun = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
/** Bugüne göre n gün ötesi/berisi — ISO damgası (timestamptz kolonları). */
export const an = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
/** 2 ondalığa yuvarlama — para alanları numeric(10,2). */
export const euro = (v: number) => Math.round(v * 100) / 100;

/**
 * Seed görseli: künyede olan ve depoda aynı içerikle duran dosya yüklenmez, sürümü ve ölçüsü künyeden (`image-manifest.ts`) gelir,
 * çünkü sürüm damgası okuma adresinin parçasıdır ve CDN her yeni adresi yeni dönüşüm sayar. Yardımcılar anahtarı sürüm ve ölçüyle
 * tek değer olarak döndürür (`...gorsel`); servislerin `setImageKey`/`add`/`put` yolu damgayı "şimdi" yazdığı için kullanılmaz.
 */
type SeedGorsel = KunyeSatiri & { imageKey: string };

type R2 = NonNullable<ReturnType<typeof getR2>>;

let kunye: Map<string, KunyeSatiri> | undefined;
const sayac = { kunyeden: 0, yuklenen: [] as string[] };

/** Görsel künyesi (`data/image-manifest.json`) — koşu başına bir kez okunur. */
function gorselKunyesi(): Map<string, KunyeSatiri> {
  if (!kunye) {
    const yol = join(process.cwd(), 'scripts/seed/data/image-manifest.json');
    if (existsSync(yol)) {
      kunye = kunyeOku(JSON.parse(readFileSync(yol, 'utf8')) as Record<string, unknown>);
    } else {
      // Künyesiz seed yine çalışır, ama her görseli yükleyip damgalar — kotayı bitiren eski davranış.
      console.warn('  ⚠ görsel künyesi yok (scripts/seed/data/image-manifest.json) — her görsel yüklenecek');
      kunye = new Map();
    }
  }
  return kunye;
}

/** İçerik tipi UZANTIDAN: kaynak webp veriyor; hepsini `image/jpeg` diye yüklemek CDN'i ve dönüşümleri yanıltır. */
function icerikTipi(ad: string): string {
  const uzanti = (ad.split('.').pop() || '').toLowerCase();
  return uzanti === 'png' ? 'image/png' : uzanti === 'webp' ? 'image/webp' : 'image/jpeg';
}

/**
 * Dosyayı depoya koyar ve satıra yazılacak künyeyi döndürür: künye geçerliyse (`kunyeGecerli`) yükleme yoktur ve adres önceki
 * tazelemedekiyle aynı kalır. Değilse yüklenir, sürüm "şimdi" olur ve ölçüsüz dosya seed sonunda listelenir (`gorselOzeti`).
 */
async function depoyaKoy(r2: R2, key: string, bytes: Buffer, tip: string): Promise<SeedGorsel> {
  const kayit = gorselKunyesi().get(key);
  const md5 = createHash('md5').update(bytes).digest('hex');
  if (kunyeGecerli(kayit, kayit ? await r2.fileEtag(key) : null, md5)) {
    sayac.kunyeden += 1;
    return { imageKey: key, ...kayit };
  }
  await r2.uploadFile(key, bytes, tip);
  sayac.yuklenen.push(key);
  return { imageKey: key, imageUpdatedAt: new Date().toISOString(), imageWidth: null, imageHeight: null };
}

/** Depo içindeki bir dosyayı R2'ye koyar; yol repo köküne göredir. R2 ayarsızsa ya da dosya okunamazsa `null` döner. */
export async function uploadImageFromPath(relPath: string, key: string): Promise<SeedGorsel | null> {
  const r2 = getR2();
  if (!r2) return null;
  try {
    return await depoyaKoy(r2, key, readFileSync(join(process.cwd(), relPath)), icerikTipi(relPath));
  } catch (err) {
    console.warn(`  ⚠ görsel atlandı (${relPath}): ${(err as Error).message}`);
    return null;
  }
}

/**
 * Uzaktaki görseli indirir ve R2'ye koyar; dosya `temp/lezza-cache/` altında önbelleklenir, çünkü her tazelemede yüzlerce indirme
 * seed'i ağa bağlardı. R2 ayarsızsa ya da dosya ne önbellekte ne ağda bulunursa `null` döner ve kayıt görselsiz kurulur.
 */
export async function uploadImageFromUrl(url: string, key: string): Promise<SeedGorsel | null> {
  const r2 = getR2();
  if (!r2) return null;
  const dosya = join(process.cwd(), 'temp', 'lezza-cache', url.split('/').pop() || 'image');
  try {
    let bytes: Buffer;
    if (existsSync(dosya)) {
      bytes = readFileSync(dosya);
    } else {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      bytes = Buffer.from(await res.arrayBuffer());
      mkdirSync(dirname(dosya), { recursive: true });
      writeFileSync(dosya, bytes);
    }
    return await depoyaKoy(r2, key, bytes, icerikTipi(url));
  } catch (err) {
    console.warn(`  ⚠ uzak görsel atlandı (${url.split('/').pop()}): ${(err as Error).message}`);
    return null;
  }
}

/**
 * Seed sonu görsel özeti: künye dışında yüklenen dosya ölçüsüz yazıldı ve bir sonraki tazelemede adresi yine değişir. Kalıcı olması
 * için ölçü dolgusu ve künye tazelemesi elle koşulur, çünkü ölçü sorusu CDN dönüşüm kotasından yer.
 */
export function gorselOzeti(): void {
  console.log(`✓ görsel: ${sayac.kunyeden} künyeden (yükleme yok) · ${sayac.yuklenen.length} yüklendi`);
  if (sayac.yuklenen.length === 0) return;
  for (const key of sayac.yuklenen.slice(0, 10)) console.log(`  · ${key}`);
  if (sayac.yuklenen.length > 10) console.log(`  · … ${sayac.yuklenen.length - 10} tane daha`);
  console.log('  ⚠ künye dışı görsel var — kotada yer varken `pnpm images:dims`, ardından `pnpm images:manifest`');
}

export { r2Keys };

/**
 * Fikstür görsel künyesi (`data/fixture-images.json`): tarif ve paket kapakları ürünümüz değil bir sofra fikridir; kaynak ve lisans
 * künyede durur, çünkü CC BY-SA atıf ister. Uzak adres künyesiyle repoda, dosyası `lezza-cache`'te durur ki seed'in ihtiyaç duyduğu
 * fikstür seed'in erişebildiği yerde olsun.
 */
interface FiksturGorsel {
  url: string;
  dosya: string;
  kaynak: string;
  lisans: string;
}

export function fiksturGorselleri(): Record<string, FiksturGorsel> {
  const yol = join(process.cwd(), 'scripts/seed/data/fixture-images.json');
  const ham = JSON.parse(readFileSync(yol, 'utf8')) as Record<string, FiksturGorsel | string>;
  // `_not` / `_uyari` / `_lisans` künye alanları veri değil.
  return Object.fromEntries(Object.entries(ham).filter(([k, v]) => !k.startsWith('_') && typeof v === 'object')) as Record<string, FiksturGorsel>;
}

/** `key → profil id` haritası; ticari zemin bölümleri kişilere bununla ulaşır. */
export type Kisiler = Map<string, string>;

export interface VaryantRef {
  id: string;
  productId: string;
  ad: string;
  vatRate: number;
  status: ProductStatus;
  shelfLifeDays: number | null;
  /**
   * Net ağırlık (g): ağırlıksız fiyat 40 g'lık poğaçayla 2,5 kg'lık tepsiyi aynı banda koyardı. `null` = boysuz ürün (bütün
   * pastalar), çağıran kendi tabanını kullanır.
   */
  netQuantity: number | null;
  netUnit: 'g' | 'ml' | null;
  /** Ürünün hedef marjı (%); alış fiyatı buradan türer, sabit yazılmaz. `null` = hedef belirlenmemiş, çağıran kendi varsayılanını kullanır. */
  targetMarginPercent: number | null;
  /**
   * Tedarikçi SKU'su: gerçek alış fiyatına (`data/sources/prices-supplier-2025-12.json`) açılan tek anahtar, çünkü ad eşleştirmesi
   * güvenilmez (adlarımız İngilizce, belgelerdekiler Türkçe ya da Fransızca). `null` = teklifte olmayan varyant.
   */
  sku: string | null;
}

/** Fiyat/stok/sipariş bölümlerinin ortak girdisi: satılabilir birimler TEK sorguda (N+1 yok). */
export async function katalogVaryantlari(db: Db): Promise<VaryantRef[]> {
  const page = await new ProductService(db).listWithRelations({ limit: 500 });
  return page.rows.flatMap((p) =>
    p.variants.map((v) => ({
      id: v.id,
      productId: p.id,
      ad: [resolveLocalizedText(p.name), resolveLocalizedText(v.label)].filter(Boolean).join(' · '),
      vatRate: p.vatRate,
      status: p.status,
      shelfLifeDays: p.shelfLifeDays,
      netQuantity: v.netQuantity ?? null,
      netUnit: v.netUnit ?? null,
      targetMarginPercent: p.targetMarginPercent ?? null,
      sku: v.sku ?? null,
    })),
  );
}
