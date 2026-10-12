/*
  Ürün künyelerinin veritabanı aynası: beyanların tek kaynağı test veritabanıdır, `urun-kunyeleri.json` elle yazılmaz ve
  `scripts/seed-real-ayna.ts` onu veritabanından baştan yazar. Dosyada durur, çünkü besleme çevrimdışı koşup sıfırlanmış bir
  veritabanını yeniden kurabilmeli.

  Fatura bilgisi (adet, alış fiyatı, tedarikçideki ad) `data.ts`te, KDV sınıflandırması `kdv.ts`te durur; künye yalnız ürünün
  kendi beyanını taşır.
*/
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LocalizedText, Nutrition, PortionKind, ProductAllergen } from '@lezzet/types';

/** Bir boyun künyesi — kolonların adları veritabanındakiyle aynı, çeviri katmanı yok. */
export interface KunyeVaryanti {
  label: LocalizedText;
  netQuantity?: number;
  netUnit?: 'g' | 'ml';
  piecesCount?: number;
  portionKind?: PortionKind;
  packedWeightG?: number;
  packedLengthMm?: number;
  packedWidthMm?: number;
  packedHeightMm?: number;
  sku?: string;
  barcodes?: Array<{ code: string; kind: 'unit' | 'case'; qtyPerCode: number }>;
}

/** Bir ürünün künyesi. Yazılmayan alan veritabanında da BOŞTU: eksik beyan uydurulmaz. */
export interface UrunKunyesi {
  name: LocalizedText;
  description?: LocalizedText;
  ingredients?: LocalizedText;
  nutrition?: Nutrition;
  allergens?: ProductAllergen[];
  traces?: ProductAllergen[];
  /** Saklama KOŞULUNUN beyanı — sıcaklık, kap, uyarı ve "doğaldır" gözlemi. Hazırlama buraya girmez. */
  storage?: LocalizedText;
  /**
   * Müşterinin sırayla yaptığı hareketler; boş dizi "adım girilmedi" demektir, takviye ibareleri (doz, "ilaç değildir") adım değil
   * beyandır ve `storage`ta kalır. En çok üç adım: saklama kartı künyenin öteki iki kartıyla aynı ızgarada üç satır çizer, fazlası
   * komşusuyla virgülle birleşir ve etiketten cümle atılmaz.
   */
  preparationSteps?: LocalizedText[];
  shelfLifeDays?: number;
  /** `storage_type` ve `shippable` beraber gelir: ikisi de veritabanının kararı, türetilmez. */
  storageType?: 'ambient' | 'chilled' | 'frozen';
  shippable?: boolean;
  dateType?: 'DLC' | 'DDM';
  /** Beslemenin kategori anahtarı (`CATEGORIES[].key`); veritabanında doğan ürünün faturası olmadığı için kategori de buradan gelir. */
  category?: string;
  variants: KunyeVaryanti[];
}

const DOSYA = join(dirname(fileURLToPath(import.meta.url)), 'data/urun-kunyeleri.json');

/** Anahtar katalogdaki TÜRKÇE addır (`Draft.nameTr ?? Draft.name`) — taslakla künyeyi o eşler. */
export const KUNYELER: Record<string, UrunKunyesi> = JSON.parse(readFileSync(DOSYA, 'utf8')) as Record<string, UrunKunyesi>;

/**
 * KAYNAK KATALOĞUN ürününe yazılan künye — ürünü kurmaz, kaynaktan kurulanın ÜSTÜNE yazar. Bu yüzden `name` ve
 * `description` yoktur (onlar `seed/data/translations.json`ta), `variants` da dizi değil SKU sözlüğüdür: yalnız
 * kaynağınkinden farklı olan boy yazılır. Gerisi aynı kural — kaynak veritabanı, eksik alan orada da eksikti.
 */
export interface KatalogKunyesi extends Omit<UrunKunyesi, 'name' | 'variants'> {
  /** Paneldeki ad; anahtar çevirideki ad kalır (`katalogAynaAnahtarlari`), ad düzeltilince ayna kopmasın. */
  name?: LocalizedText;
  /** İşletmecinin kapattığı ama katalogda tuttuğu ürün; kurulur ve pasife alınır. */
  status?: 'passive';
  variants?: Record<string, Omit<KunyeVaryanti, 'sku'>>;
}

/** Sayılmış partinin boyu: SKU varsa o, yoksa ürünün Türkçe adı + boy etiketi (veritabanında doğan üründe SKU yok). */
export interface SayimBoyu {
  sku?: string;
  product: string;
  label: string;
}

export interface SayimSatiri {
  variant: SayimBoyu;
  qty: number;
  expiryDate: string;
  lotNumber: string | null;
  storageArea: string | null;
  /** Yalnız siparişsiz kabulde; siparişli kabulde maliyeti siparişin birim fiyatı verir. */
  unitCostCents: number | null;
}

/** Bir mal kabulü — adet partinin BUGÜNKÜ fiili miktarıdır, ilk girişi değil: ayna anlık görüntüdür. */
export interface SayimKabulu {
  warehouse: string;
  date: string;
  note: string | null;
  supplier: string | null;
  /** Bağlı tedarik siparişinin notu (`Fatura INV/…`); besleme siparişi bu notla bulur. */
  purchaseOrderNote: string | null;
  lines: SayimSatiri[];
}

const SAYIM_DOSYASI = join(dirname(fileURLToPath(import.meta.url)), 'data/stok-sayimi.json');

/** Sayılmış gerçek stok — veritabanı aynası; dosya yoksa stok yok demektir. */
export const STOK_SAYIMI: SayimKabulu[] = existsSync(SAYIM_DOSYASI)
  ? (JSON.parse(readFileSync(SAYIM_DOSYASI, 'utf8')) as SayimKabulu[])
  : [];

const KATALOG_DOSYASI = join(dirname(fileURLToPath(import.meta.url)), 'data/katalog-kunyeleri.json');

/** Anahtar ürünün Türkçe adı (`translations.json`taki ad) — `_` ile başlayan satır dosyanın künyesidir, veri değil. */
export const KATALOG_KUNYELERI: Record<string, KatalogKunyesi> = Object.fromEntries(
  Object.entries(JSON.parse(readFileSync(KATALOG_DOSYASI, 'utf8')) as Record<string, KatalogKunyesi>).filter(
    ([ad]) => !ad.startsWith('_'),
  ),
);
