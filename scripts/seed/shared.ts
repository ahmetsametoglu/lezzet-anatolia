import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ProductService, type createServiceRoleClient } from '@lezzet/database';
import { getR2, r2Keys } from '@lezzet/storage';
import { resolveLocalizedText, type ProductStatus } from '@lezzet/types';

/**
 * Seed bölümlerinin ortak zemini: istemci tipi, guard, tarih/para yardımcıları, görsel yükleme ve
 * katalog referansı. Bölümler birbirini DEĞİL burayı bilir — sıra `seed.ts`'te kurulur.
 */

export type Db = ReturnType<typeof createServiceRoleClient>;

/**
 * Görsel sürüm damgası — seed bu koşuşta yüklüyor. Public okuma URL'i `?v=<damga>` ile kurulur
 * (05.11); damgasız kayıtta yeni dosya CDN'in eski kopyasının arkasında kalırdı.
 */
export const NOW = new Date().toISOString();

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
 * temp/<file> görselini R2'ye verilen key ile yükler ve saklanacak RELATIVE key'i döner. R2 ayarsızsa
 * (local'de creds yoksa) sessizce null döner → kayıt görselsiz oluşur (graceful degradation).
 */
export async function uploadImage(file: string, key: string): Promise<string | null> {
  const r2 = getR2();
  if (!r2) return null;
  try {
    const bytes = readFileSync(join(process.cwd(), 'temp', file));
    await r2.uploadFile(key, bytes, 'image/jpeg');
    return key;
  } catch (err) {
    console.warn(`  ⚠ görsel atlandı (${file}): ${(err as Error).message}`);
    return null;
  }
}

/**
 * DEPO İÇİNDEKİ bir dosyayı R2'ye yükler — yol repo köküne göre verilir.
 *
 * `uploadImage`'dan farkı yalnız kök: o `temp/` altına bakar (repoya girmeyen, elle konan
 * görseller), bu repoda DURAN bir dosyayı alır. İhtiyaç sayfa görsellerinden doğdu (09.16): ana
 * sayfanın kahramanı bugün `apps/web/public/hero-sofra.jpg`'de geçici olarak duruyor ve slot
 * tablosuna taşınırken kaynak o dosyanın kendisi.
 */
export async function uploadImageFromPath(relPath: string, key: string): Promise<string | null> {
  const r2 = getR2();
  if (!r2) return null;
  try {
    const bytes = readFileSync(join(process.cwd(), relPath));
    const uzanti = (relPath.split('.').pop() || '').toLowerCase();
    await r2.uploadFile(key, bytes, uzanti === 'png' ? 'image/png' : uzanti === 'webp' ? 'image/webp' : 'image/jpeg');
    return key;
  } catch (err) {
    console.warn(`  ⚠ görsel atlandı (${relPath}): ${(err as Error).message}`);
    return null;
  }
}

/**
 * UZAKTAKİ görseli indirir ve R2'ye yükler (Lezza kataloğu — 05, kullanıcı kararı 04.08).
 *
 * **İndirilen dosya `temp/lezza-cache/` altında ÖNBELLEKLENİR** ve sebebi ölçülebilir: katalogda
 * 141 ürün × 2 görsel var; her `db:refresh` bunları yeniden indirseydi seed'e üç yüz ağ turu
 * eklenirdi. Önbellek dizini `.gitignore`'da — veri repoya girmez, ama ikinci koşu ağa hiç çıkmaz.
 *
 * **R2 ayarsızsa `null`** — `uploadImage` ile aynı davranış: kayıt görselsiz oluşur, seed durmaz.
 * İnternet yoksa da aynı: önbellekte varsa oradan okunur, yoksa o ürün görselsiz kalır.
 */
export async function uploadImageFromUrl(url: string, key: string): Promise<string | null> {
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
    // İçerik tipi UZANTIDAN: kaynak webp veriyor ve hepsini `image/jpeg` diye yüklemek tarayıcıyı
    // yanıltmasa da CDN'i ve ileride yapılacak dönüşümleri yanıltır.
    const uzanti = (url.split('.').pop() || '').toLowerCase();
    const tip = uzanti === 'png' ? 'image/png' : uzanti === 'webp' ? 'image/webp' : 'image/jpeg';
    await r2.uploadFile(key, bytes, tip);
    return key;
  } catch (err) {
    console.warn(`  ⚠ uzak görsel atlandı (${url.split('/').pop()}): ${(err as Error).message}`);
    return null;
  }
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
  netWeightG: number | null;
  /**
   * Ürünün hedef marjı (%). Alış fiyatı buradan TÜRER (09.08) — sabit yazılmaz.
   * `null` = hedef belirlenmemiş; çağıran kendi varsayılanını kullanır.
   */
  targetMarginPercent: number | null;
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
      netWeightG: v.netWeightG ?? null,
      targetMarginPercent: p.targetMarginPercent ?? null,
    })),
  );
}
