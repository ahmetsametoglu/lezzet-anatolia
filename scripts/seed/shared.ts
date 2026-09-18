import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ProductService, type createServiceRoleClient } from '@lezzet/database';
import { getR2, r2Keys } from '@lezzet/storage';
import { resolveLocalizedText, type ProductStatus } from '@lezzet/types';
import { kunyeGecerli, kunyeOku, type KunyeSatiri } from './image-manifest';

/**
 * Seed bölümlerinin ortak zemini: istemci tipi, guard, tarih/para yardımcıları, görsel yükleme ve
 * katalog referansı. Bölümler birbirini DEĞİL burayı bilir — sıra `seed.ts`'te kurulur.
 */

export type Db = ReturnType<typeof createServiceRoleClient>;

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

/*
  `uploadImage` (temp/ altındaki elle konan görselleri yükleyen yardımcı) 01.09'da SİLİNDİ: tek
  çağıranı `seed/support.ts`ti (talep mesajlarının fotoğrafı) ve o dosya, besleme sipariş yazmayı
  bıraktığı için kalktı — talep bir siparişe bağlanır (künye `seed.ts` → §SİPARİŞ). Yükleme yolu
  gerekirse `uploadImageFromPath` aynı işi repo içi bir dosyayla yapıyor.
*/

/**
 * ── SEED GÖRSELİ: YÜKLEME + SÜRÜM (05.37 · 14.09) ────────────────────────────────────────────────
 *
 * Seed eskiden her koşuda bütün görselleri yeniden yüklüyor ve sürüm damgasını "şimdi" yazıyordu.
 * Damga okuma adresinin parçası (`?v=`, 05.11) ve CDN her yeni adresi yeni bir dönüşüm sayıyor: her
 * `db:refresh` sitenin bütün görsel adreslerini değiştiriyordu (ölçüldü 14.09 — ücretsiz dönüşüm kotası
 * bitti). Artık görsel künyesine bakılıyor (`image-manifest.ts`): künyede olan ve depoda AYNI içerikle
 * duran dosya yüklenmez, sürümü ve ölçüsü künyeden gelir.
 *
 * Yardımcılar anahtarı sürüm ve ölçüyle TEK değer olarak döndürür; çağıran onu satırın yazımına yayar
 * (`...gorsel`) — anahtarı sürümsüz yazmak mümkün olmaz. Servislerin `setImageKey`/`add`/`put` yolu
 * bu yüzden kullanılmıyor: o yol damgayı "şimdi" yazar.
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
 * Dosyayı depoya koyar, satıra yazılacak künyeyi döndürür. Künye geçerliyse (`kunyeGecerli`) YÜKLEME
 * YOK: sürüm ve ölçü künyeden gelir, adres bir önceki tazelemedekiyle aynı kalır. Değilse yüklenir —
 * sürüm "şimdi" (yeni dosya yeni adres; önbellek eskisini tutamaz), ölçü bilinmez ve seed sonunda
 * listelenir (`gorselOzeti`).
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

/**
 * DEPO İÇİNDEKİ bir dosyayı R2'ye koyar — yol repo köküne göre verilir.
 *
 * İhtiyaç sayfa görsellerinden doğdu (09.16): ana sayfanın kahramanı bugün
 * `apps/web/public/hero-sofra.jpg`'de geçici olarak duruyor ve slot tablosuna taşınırken kaynak o
 * dosyanın kendisi.
 */
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
 * UZAKTAKİ görseli indirir ve R2'ye koyar (Lezza kataloğu — 05, kullanıcı kararı 04.08).
 *
 * **İndirilen dosya `temp/lezza-cache/` altında ÖNBELLEKLENİR** ve sebebi ölçülebilir: katalogda
 * 141 ürün × 2 görsel var; her `db:refresh` bunları yeniden indirseydi seed'e üç yüz ağ turu
 * eklenirdi. Önbellek dizini `.gitignore`'da — veri repoya girmez, ama ikinci koşu ağa hiç çıkmaz.
 *
 * **R2 ayarsızsa `null`** — `uploadImage` ile aynı davranış: kayıt görselsiz oluşur, seed durmaz.
 * İnternet yoksa da aynı: önbellekte varsa oradan okunur, yoksa o ürün görselsiz kalır.
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
 * Seed sonu görsel özeti. Künye dışında yüklenen dosya yeni sürümle ve ölçüsüz yazıldı: bir sonraki
 * tazelemede adresi yine değişir. Kalıcı olması için ölçü dolgusu ve künye tazelemesi gerekir — ikisi
 * de ELLE, çünkü ölçü sorusu CDN dönüşüm kotasından yer.
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
 * ── FİKSTÜR GÖRSEL KÜNYESİ (`data/fixture-images.json`) ──────────────────────────────────────────
 *
 * Tarif ve paket kapakları katalogda karşılığı olmayan görsellerdir: bizim ürünümüz değil, bir
 * SOFRA fikri. Kaynakları Wikimedia Commons ve adresleri künye dosyasında duruyor — lisansıyla
 * birlikte, çünkü CC BY-SA atıf ister ve o bilgi kaybolursa geri getirilemez.
 *
 * **Neden `temp/` DEĞİL:** tarif görselleri bugüne dek `temp/1.jpeg`…`5.jpeg` arıyordu ve o dosyalar
 * repoda YOK (`temp/` .gitignore'da) — `uploadImage` sessizce `null` dönüyor, tarifler görselsiz
 * kuruluyordu. Aynı hata `site-image.ts`'de yaşanmış ve orada da not düşülmüştü: **seed'in ihtiyaç
 * duyduğu fikstür, seed'in erişebildiği bir yerde durmalı.** Uzak adres bu şartı sağlıyor: künye
 * repoda, dosya `lezza-cache`'te önbellekleniyor, ikinci koşu ağa hiç çıkmıyor.
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
   * Net ağırlık (g) — fiyatın gerçekçi olması için (05, gerçek katalog 04.08).
   *
   * Fiyat eskiden yalnız indise bağlıydı ve uydurma katalogda görünmüyordu: orada her varyant
   * 500–1000 g arasındaydı. Gerçek katalogda 40 g'lık poğaça ile 2,5 kg'lık baklava tepsisi yan
   * yana duruyor; ağırlıksız bir fiyat ikisini aynı banda koyar ve ekrandaki her fiyat listesi
   * bariz yanlış görünür. `null` = boysuz ürün (bütün pastalar) — çağıran kendi tabanını kullanır.
   */
  netQuantity: number | null;
  netUnit: 'g' | 'ml' | null;
  /**
   * Ürünün hedef marjı (%). Alış fiyatı buradan TÜRER (09.08) — sabit yazılmaz.
   * `null` = hedef belirlenmemiş; çağıran kendi varsayılanını kullanır.
   */
  targetMarginPercent: number | null;
  /**
   * Tedarikçi SKU'su — GERÇEK alış fiyatına açılan tek anahtar (19.08).
   *
   * Fiyat artık uydurma bir kilo tabanından değil, tedarikçinin verdiği fiyat teklifinden türüyor
   * (`data/sources/prices-supplier-2025-12.json`) ve o dosyanın kimliği SKU. Alan olmadan eşleşme
   * ada göre yapılırdı; ad eşleştirmesi denendi ve güvenilmez çıktı (ürün adlarımız İngilizce,
   * belgelerdeki adlar Türkçe/Fransızca). `null` = teklifte olmayan varyant.
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
