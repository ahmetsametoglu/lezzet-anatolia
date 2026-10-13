// Ürünlerin KDV sınıflandırması: ülke başına kategorinin oranı ve ondan ayrılan ürünler. Oran ürünün ne olduğundan çıkar ve
// ülkeden ülkeye türetilemez — fındıklı pestil Fransa'da şekerleme (%20), Almanya'da Zuckerware (%7).
import { ADAY_SKULARI, CATEGORIES, EK_TASLAKLAR, PURCHASES } from './data';

/** İstisnadaki ürün: Lezza ürünü varyant koduyla, taslak faturadaki adla (`AILELER` gibi); ad düzeltmesi eşleşmeyi kaydırmaz. */
export type KdvUrunu = { sku: string } | { draft: string };

interface KdvTablosu {
  /** Kategori anahtarı (`CATEGORIES[].key`) → oran; istisnada geçmeyen ürün kategorisininkini alır. */
  kategori: Record<string, number>;
  istisna: Array<{ oran: number; urunler: KdvUrunu[] }>;
}

/** Fransa satıcının ülkesidir ve oranı ürünün kendi alanına yazılır (`product.vat_rate`); Almanya'nınki `product_vat_rate`e. */
export const KDV_ORANLARI: Record<'FR' | 'DE', KdvTablosu> = {
  // CGI 278-0 bis A: gıda %5,5; şekerleme ile çikolata ya da kakao içeren ürün %20 (BOI-TVA-LIQ-30-10-10 § 150-220).
  FR: {
    kategori: { firin: 5.5, tatli: 5.5, 'et-tavuk': 5.5, meze: 5.5, 'dogal-geleneksel': 5.5, 'kuru-meyve-kuruyemis': 5.5 },
    istisna: [
      // Pekmez ve şekerle pişen fındıklı ya da cevizli pestil şekerlemedir: "noisettes et sucre cuits" (§ 160).
      {
        oran: 20,
        urunler: [
          { draft: 'Pestil met Hazinoten Muska' },
          { draft: 'Cevizli Pestil Tatlısı' },
          { draft: 'Rulo Fındıklı Pestil' },
          { draft: 'Fındıklı Kadayıf Rulo Pestil' },
          { draft: 'Fındıklı Sultan Sarma' },
        ],
      },
      // Kakaolu ve içinde kakaolusu olan karışık Maraş dondurması: § 210 kakaolu pastayı ve tatlı kremasını ayırır, dondurmayı ayırmaz.
      { oran: 20, urunler: [{ sku: '111107' }, { sku: '111113' }] },
    ],
  },
  // UStG § 12 (2) Nr. 1 ve Anlage 2: gıda %7; meyve suyu (2009) ile içecek (Kapitel 22) %19. Pekmez, öz, şurup ve konsantreler
  // içecek değil öz olarak satılır, %7'dedir; Alman yorumu onları koyulaştırılmış meyve suyu (BMF Tz. 114) ya da içilen sıvı
  // takviye (BFH VII R 35/09) sayarsa %19 olur.
  DE: {
    kategori: { firin: 7, tatli: 7, 'et-tavuk': 7, meze: 7, 'dogal-geleneksel': 7, 'kuru-meyve-kuruyemis': 7 },
    istisna: [],
  },
};

/** Tablonun beslemeyle tutmayan yerleri, boşsa tamdır; besleme koşudan, birim testi commit'ten önce sorar. */
export function kdvSorunlari(): string[] {
  const kategoriler = new Set(CATEGORIES.map((c) => c.key));
  const taslaklar = new Set([...PURCHASES.flatMap((p) => p.drafts), ...EK_TASLAKLAR].map((d) => d.name));
  const skular = new Set([...PURCHASES.flatMap((p) => p.catalog.map((l) => l.sku)), ...ADAY_SKULARI]);
  const sorunlar: string[] = [];
  for (const [ulke, { kategori, istisna }] of Object.entries(KDV_ORANLARI)) {
    for (const key of kategoriler) if (kategori[key] === undefined) sorunlar.push(`${ulke}: ${key} kategorisinin oranı yok`);
    for (const key of Object.keys(kategori)) if (!kategoriler.has(key)) sorunlar.push(`${ulke}: ${key} beslemenin kategorisi değil`);
    const gorulen = new Set<string>();
    for (const urun of istisna.flatMap((g) => g.urunler)) {
      const ad = 'sku' in urun ? urun.sku : urun.draft;
      if (!('sku' in urun ? skular.has(urun.sku) : taslaklar.has(urun.draft))) sorunlar.push(`${ulke}: ${ad} beslemede yok`);
      if (gorulen.has(ad)) sorunlar.push(`${ulke}: ${ad} iki istisnada`);
      gorulen.add(ad);
    }
  }
  return sorunlar;
}
