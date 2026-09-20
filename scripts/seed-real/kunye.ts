/*
  ── ÜRÜN KÜNYELERİ: VERİTABANI AYNASI ────────────────────────────────────────

  **Beyanların tek kaynağı TEST VERİTABANIDIR** (işletmeci kararı, 19.09): künyeler oraya etiket
  fotoğrafıyla, asistanın dilekçesi panelden onaylanarak girdi. `urun-kunyeleri.json` o kayıtların
  aynasıdır — elle yazılmaz, veritabanından çekilir; çelişki çıktığında kazanan veritabanıdır.

  Neden dosyada duruyor: besleme çevrimdışı koşmalı ve sıfırlanmış bir veritabanını yeniden
  kurabilmeli. Aynı desen katalogda da var (`seed/data/lezza-catalog.json`, kaynağın aynası).

  **Fatura bilgisi buraya GİRMEZ** (adet, alış fiyatı, tedarikçideki ad): o veri faturadan gelir ve
  `data.ts`te durur. Burada ürünün kendi künyesi vardır: ad, beyanlar, boy, barkod, ambalaj ölçüsü.

  ── AYNANIN TEK DOKUNUŞU: ALERJEN VURGUSU ───────────────────────────────────
  İşletmeci kararı (19.09): alerjen KALIN gösterilir. Panelden gelen kayıtların bir kısmı vurguyu
  büyük harfle taşıyordu ("BUĞDAY unu"), deponun işareti ise `**` (`parseEmphasis`). Aynaya çekilirken
  yalnız bu işaret çevrildi — beyanın kendisi, sırası ve sayıları değişmedi. Sonraki sıfırlamada
  veritabanı da aynadan yazıldığı için iki taraf yine aynı biçimi taşır.
*/
import { readFileSync } from 'node:fs';
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
   * Hazırlama adımları — müşterinin SIRAYLA yaptığı hareketler; sıra dizinin kendisidir, numarayı ekran basar.
   * Raf ürününün çoğunda boş: pekmezin, sirkenin, macunun hazırlanması yoktur ve boş dizi "adım girilmedi" demektir.
   * Zorunlu takviye ibareleri (doz, "ilaç değildir") adım DEĞİL beyandır; `storage`ta kalır.
   *
   * **EN ÇOK ÜÇ ADIM** (işletmeci kararı 20.09): tasarımın saklama kartı üç satır çiziyor ve kart, künyenin
   * öteki iki kartıyla aynı ızgarada (`repeat(3,1fr)`) duruyor — dördüncü satır ötekileri de uzatırdı.
   * Etiket daha çok adım yazıyorsa İÇERİK KORUNUR, sınır kaydırılır: birbirini izleyen iki hareket virgülle
   * tek adıma alınır ("10 dakika haşlayın, sonra suyunu süzün"). Etiketten cümle ATILMAZ.
   */
  preparationSteps?: LocalizedText[];
  shelfLifeDays?: number;
  /** `storage_type` ve `shippable` beraber gelir: ikisi de veritabanının kararı, türetilmez. */
  storageType?: 'ambient' | 'chilled' | 'frozen';
  shippable?: boolean;
  variants: KunyeVaryanti[];
}

const DOSYA = join(dirname(fileURLToPath(import.meta.url)), 'data/urun-kunyeleri.json');

/** Anahtar katalogdaki TÜRKÇE addır (`Draft.nameTr ?? Draft.name`) — taslakla künyeyi o eşler. */
export const KUNYELER: Record<string, UrunKunyesi> = JSON.parse(readFileSync(DOSYA, 'utf8')) as Record<string, UrunKunyesi>;
