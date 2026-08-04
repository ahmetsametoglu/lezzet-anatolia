import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CategoryService, ProductImageService, ProductService } from '@lezzet/database';
import type { LocalizedText, Nutrition, ProductAllergen, ProductStatus } from '@lezzet/types';
import { NOW, r2Keys, uploadImageFromUrl } from './shared';

/**
 * **GERÇEK katalog** (05 · kullanıcı kararı 04.08) — Lezza Foods'un 141 ürünü, uydurulmuş 69'un
 * yerine.
 *
 * ── İKİ KATMAN, VE AYRIMI OKUNAKLI TUTMAK ŞART ───────────────────────────────
 * `data/lezza-catalog.json` kaynağın AYNASIDIR (`pnpm lezza:catalog` üretir): ad, slug, SKU,
 * kategori, kanal, görsel adresi ve gramaj GERÇEKTİR. Bu dosya ise **sahnedir**: kaynakta hiç
 * olmayan alanları — yasal beyan, KDV, raf ömrü, durum, marj — biz ekliyoruz.
 *
 * Kullanıcı kararı bu ikinci katmanı açıkça istedi (*"datayı manipüle edelim, bazı bilgilerini biz
 * ekleyelim"*), ama bu bir uyarıyı geçersiz kılmıyor, yerini değiştiriyor: **ürün adları ve marka
 * GERÇEK olduğu için buradaki beyanlar üretim verisi sanılmamalı.** İki koruma koydum:
 *   1. Türetilen her alan bu dosyada, tek yerde ve gerekçesiyle duruyor — aramak için grep yeter.
 *   2. Türetim ADIN KENDİSİNDEN yapılıyor (aşağıdaki anahtar kelime tablosu), rastgele değil:
 *      "Cheese Pastry" süt+gluten, "Baklava with Walnut" sert kabuklu alır. Rastgele bir alerjen
 *      dağıtımı, gerçek bir ürüne gerçekten yanlış bir beyan yazardı; addan türeyen tahmin en
 *      azından ürünle tutarlı olur.
 *
 * **`ALERJEN_DESENLERI` gibi indise bağlı bir dağıtım BİLEREK KULLANILMADI.** Uydurma katalogda
 * doğruydu (orada ad da uydurmaydı, tek dert süzgecin denenmesiydi); burada "Vegan Falafel"e balık
 * alerjeni yazardı.
 *
 * ── SÜZGEÇ SENARYOLARI KORUNDU ───────────────────────────────────────────────
 * Eski toplu üretici her boşluğu indise göre serpiştiriyordu (eksik dil · eksik beyan · görselsiz ·
 * pasif · aday · kargolanamaz) ve operasyon süzgeçleri bundan besleniyordu. Gerçek veri bu
 * boşlukların hiçbirini taşımıyor — yani hiçbir şey yapmasaydık **süzgeçlerin yarısı sonuçsuz
 * kalırdı** ve bu sessiz bir kayıp olurdu. O yüzden boşluklar burada da serpiştiriliyor, ama
 * SEYREK: gerçekçilik ile denenebilirlik arasındaki denge, oranların içinde yazılı.
 */

interface LezzaVariant {
  label: LocalizedText | null;
  netWeightG: number | null;
  sku: string | null;
  sourceId: number;
  sourceSlug: string;
}
interface LezzaProduct {
  slug: string;
  name: LocalizedText;
  sourceLanguage: string;
  category: string | null;
  brand: string | null;
  description: string;
  imageUrls: string[];
  channels: string[];
  variants: LezzaVariant[];
}
interface LezzaCatalog {
  categories: Array<{ key: string; name: LocalizedText }>;
  products: LezzaProduct[];
}

const DATA = join(dirname(fileURLToPath(import.meta.url)), 'data/lezza-catalog.json');

function readLezzaCatalog(): LezzaCatalog {
  return JSON.parse(readFileSync(DATA, 'utf8')) as LezzaCatalog;
}

/**
 * Ada bakarak alerjen çıkarımı — **tahmindir, beyan değildir** (dosya künyesi).
 *
 * Sıra önemli değil, kapsam önemli: bir ürün birden çok anahtar kelime taşıyabilir ve hepsi
 * birikir ("Cheese Pastry (Su Börek)" hem süt hem gluten alır).
 */
const ALERJEN_IPUCLARI: Array<[RegExp, ProductAllergen[]]> = [
  [/b[öo]rek|bagel|pastry|bun|cake|baklava|kunefe|k[üu]nefe|calzone|simit|croissant|pide|lahmacun|pizza|donut|profiterol|tiramisu|cheesecake|waffle|kadayif|kaday[ıi]f|nugget|burger|fillet|wings|crispy|breaded/i, ['gluten']],
  [/cheese|milk|cream|yogurt|yoghurt|butter|latte|tiramisu|cheesecake|ice cream|dondurma|kaymak|mara[şs]|profiterol|s[üu]tla[çc]|tres leches|mousse/i, ['sut']],
  [/walnut|pistachio|hazelnut|almond|nut(?!ella)|f[ıi]st[ıi]k|nutella/i, ['sert_kabuklu']],
  [/egg|yumurta|mayonnaise|tiramisu|profiterol|cake|waffle/i, ['yumurta']],
  [/sesame|simit|tahini|susam/i, ['susam']],
  [/soy|soya|vegan/i, ['soya']],
  [/fish|bal[ıi]k|anchovy|tuna/i, ['balik']],
];

function alerjenTuret(ad: string): ProductAllergen[] {
  const bulunan = new Set<ProductAllergen>();
  for (const [desen, alerjenler] of ALERJEN_IPUCLARI) if (desen.test(ad)) alerjenler.forEach((a) => bulunan.add(a));
  return [...bulunan];
}

/**
 * **İZ (çapraz bulaşma) — kapsamın ikinci ayağı, ve buradaki karar dosyanın en incelikli yeri.**
 *
 * Addan türetme yalnız YEDİ alerjen üretiyor (gluten · süt · sert kabuklu · yumurta · susam · soya ·
 * balık). Kalan yedisi (`kabuklu` · `yer_fistigi` · `kereviz` · `hardal` · `sulfit` · `aci_bakla` ·
 * `yumusaka`) hiçbir üründe geçmezse **alerjen süzgeci o yedisinde sessizce sonuçsuz kalır** — eski
 * toplu üreticinin künyesi tam bunu koruyordu (*"on dört yasal alerjenin TAMAMI en az bir üründe
 * geçer"*) ve geçen hafta düzeltilen hata da tam bu sınıftı: `% 7` ölçütü 14'lük dizide 7. deseni
 * her seferinde eliyordu, yani bir alerjen veriye HİÇ girmiyordu ve kimse fark etmiyordu.
 *
 * **Ama kapsamı `allergens` alanına yazarak sağlamak yanlış olurdu:** baklavaya "kereviz İÇERİR"
 * yazmak gerçek bir ürüne gerçekten yanlış bir beyandır. `traces` ise farklı bir cümledir —
 * *"aynı üretim hattında bulunabilir"* — ve ortak hatlı bir gıda üreticisinde savunulabilir.
 * Bu yüzden nadir alerjenler İZ olarak dağıtılıyor: süzgeç denenebilir kalıyor, hiçbir ürüne
 * yanlış bir "içerir" beyanı yazılmıyor.
 *
 * Dağıtım `% uzunluk` ile dönüyor ve araya "boş bırak" ölçütü KONMUYOR — ikinci bir modulo, ortak
 * çarpanı olduğu gün yine bir değeri sessizce elerdi. Boş iz zaten `beyanEksik` ve türetilmiş
 * alerjenle çakışma hâllerinden doğal olarak çıkıyor.
 */
const NADIR_IZLER: ProductAllergen[][] = [
  ['yer_fistigi'],
  ['kabuklu'],
  ['sulfit'],
  ['hardal'],
  ['kereviz'],
  ['aci_bakla'],
  ['yumusaka'],
  // `balik` bu katalogda ADDAN da türeyemiyor (fırın/tatlı/tavuk kataloğunda balıklı ürün yok) ve
  // ölçtüm: listeye konmazsa on dört alerjenden biri veriye HİÇ girmiyor. En zayıf halka bu —
  // ortak hatlı bir tatlı üreticisinde balık izi zorlama bir varsayım. Yine de konuyor, çünkü
  // hiçbir sonuç döndüremeyen bir süzgeç denenemez ve denenmeyen süzgeç bozuk olduğunda susar.
  ['balik'],
  ['yer_fistigi', 'sert_kabuklu'],
  ['sulfit', 'hardal'],
];

/**
 * KDV — Fransa gıda oranları. Dondurulmuş/paketli gıda %5,5; **hazır tüketime yakın kalemler %10**
 * (Fransa'da "consommation immédiate" ayrımı). Kaynakta oran yok, bu bizim varsayımımız ve
 * PARAMETRİK: tek yerde durduğu için değiştirilmesi tek satır.
 */
const KDV_HAZIR = 10;
const KDV_GIDA = 5.5;
const HAZIR_TUKETIM = /ice cream|dondurma|cup|slice|mono pack/i;

/** Raf ömrü — dondurulmuş ürün uzun, fırın kısa. Kaynakta yok; kategoriden türetiliyor. */
const RAF_OMRU: Record<string, number> = { bakery: 120, dessert: 365, cake: 270, chicken: 365, 'ice-cream': 540, anatolian: 300 };

function besinDegeri(kategori: string | null, i: number): Nutrition {
  // Kategorinin tipik profili + indise bağlı küçük sapma: iki ürün birebir aynı tabloyu
  // göstermesin (ekranda kopyala-yapıştır izlenimi verirdi).
  const taban: Record<string, [number, number, number, number, number]> = {
    // [kcal, yağ, doymuş, karbonhidrat, protein]
    bakery: [285, 12, 5, 35, 8],
    dessert: [420, 21, 8, 52, 6],
    cake: [365, 19, 9, 44, 5],
    chicken: [215, 11, 2, 14, 16],
    'ice-cream': [230, 13, 8, 25, 4],
    anatolian: [180, 9, 2, 20, 5],
  };
  const [kcal, fat, sat, carb, prot] = taban[kategori ?? ''] ?? [300, 14, 6, 38, 7];
  const sapma = (i % 7) - 3; // −3 … +3
  return {
    energyKcal: kcal + sapma * 4,
    energyKj: Math.round((kcal + sapma * 4) * 4.184),
    fatG: Math.max(0, fat + sapma * 0.4),
    saturatedFatG: Math.max(0, sat + sapma * 0.2),
    carbohydrateG: Math.max(0, carb + sapma),
    sugarsG: Math.max(0, Math.round(carb * 0.45)),
    proteinG: Math.max(0, prot + sapma * 0.2),
    saltG: kategori === 'chicken' || kategori === 'bakery' ? 1.1 : 0.25,
  };
}

/** İçindekiler metni — alerjen listesiyle TUTARLI kurulur; `**vurgu**` alerjeni işaretler. */
function icindekiler(alerjenler: ProductAllergen[]): LocalizedText {
  const tr = ['Un', 'su', 'tuz'];
  const fr = ['Farine', 'eau', 'sel'];
  const de = ['Mehl', 'Wasser', 'Salz'];
  if (alerjenler.includes('gluten')) {
    tr[0] = '**Buğday unu**';
    fr[0] = '**Farine de blé**';
    de[0] = '**Weizenmehl**';
  }
  if (alerjenler.includes('sut')) {
    tr.push('**süt**');
    fr.push('**lait**');
    de.push('**Milch**');
  }
  if (alerjenler.includes('yumurta')) {
    tr.push('**yumurta**');
    fr.push('**œuf**');
    de.push('**Ei**');
  }
  if (alerjenler.includes('sert_kabuklu')) {
    tr.push('**sert kabuklu meyve**');
    fr.push('**fruits à coque**');
    de.push('**Schalenfrüchte**');
  }
  if (alerjenler.includes('susam')) {
    tr.push('**susam**');
    fr.push('**sésame**');
    de.push('**Sesam**');
  }
  return { tr: `${tr.join(', ')}, şeker.`, fr: `${fr.join(', ')}, sucre.`, de: `${de.join(', ')}, Zucker.` };
}

const SAKLAMA: LocalizedText = {
  tr: '−18 °C’de saklayın. Çözdürdükten sonra **tekrar dondurmayın**; 24 saat içinde tüketin.',
  fr: 'Conserver à −18 °C. **Ne pas recongeler** après décongélation ; à consommer sous 24 heures.',
  de: 'Bei −18 °C lagern. Nach dem Auftauen **nicht wieder einfrieren**; innerhalb von 24 Stunden verzehren.',
};

/**
 * Kataloğu kurar. İmza eski toplu üreticiyle aynı şekilde: çağıran servisleri ve başlangıç sırasını
 * verir, sonuç sayıları döner.
 */
export async function seedLezzaProducts(
  categories: CategoryService,
  products: ProductService,
  images: ProductImageService,
  catId: Map<string, string>,
  startOrder: number,
): Promise<{ made: number; photos: number; variants: number }> {
  const katalog = readLezzaCatalog();

  // Aile kategorileri — elle yazılan dördün YANINA gelir, onların yerine değil: eski dört kategori
  // elle yazılmış beş ürünün evi ve koleksiyonlar o slug'lara bağlı.
  for (const c of katalog.categories) {
    if (catId.has(c.key)) continue;
    const created = await categories.create({ name: c.name });
    catId.set(c.key, created.id);
  }

  let made = 0;
  let photos = 0;
  let varyantSayisi = 0;

  for (const [i, p] of katalog.products.entries()) {
    const ad = p.name.tr ?? '';
    const alerjenler = alerjenTuret(`${ad} ${p.description}`);

    // ── Serpiştirilen boşluklar (gerekçesi dosya künyesinde) ──────────────────
    // Oranlar eski toplu üreticiden SEYREK: orada veri zaten uydurmaydı, burada gerçek bir katalogu
    // bozmamak gerekiyor. Yine de her süzgecin en az birkaç sonucu olacak kadar sık.
    const dilEksik = i % 17 === 0; // fr/de düşer → "eksik dil" süzgeci
    const beyanEksik = i % 13 === 0; // beyan dörtlüsü boş → "beyan eksik" süzgeci
    const kapaksiz = i % 19 === 0; // görselsiz kayıt → boş kapak durumu
    const durum: ProductStatus = i % 23 === 0 ? 'passive' : i % 29 === 0 ? 'candidate' : 'active';

    const name: LocalizedText = dilEksik ? { tr: ad } : p.name;
    const aciklama: LocalizedText | null = p.description
      ? dilEksik
        ? { tr: p.description }
        : { tr: p.description, fr: p.description, de: p.description }
      : null;

    // Kapak GERÇEK görselden; R2 ayarsızsa null döner ve kayıt görselsiz oluşur (graceful).
    const kapakUrl = kapaksiz ? null : p.imageUrls[0];
    const imageKey = kapakUrl ? await uploadImageFromUrl(kapakUrl, r2Keys.productImage(p.slug, kapakUrl.split('/').pop() || 'cover.webp')) : null;

    const { product, variants } = await products.create({
      name,
      description: aciklama,
      categoryId: catId.get(p.category ?? '') ?? null,
      imageKey,
      imageUpdatedAt: imageKey ? NOW : null,
      allergens: beyanEksik ? [] : alerjenler,
      // İz: nadir alerjenler buradan dolaşır (künyesi `NADIR_IZLER`'de). Ürünün ZATEN içerdiği bir
      // alerjen ize yazılmaz — "içerir" demişken "bulunabilir" demek, aynı şeyi iki kez ve daha
      // zayıf söylemektir.
      traces: beyanEksik ? [] : (NADIR_IZLER[i % NADIR_IZLER.length] ?? []).filter((a) => !alerjenler.includes(a)),
      ingredients: beyanEksik ? null : icindekiler(alerjenler),
      storageInstructions: beyanEksik ? null : SAKLAMA,
      nutrition: beyanEksik ? null : besinDegeri(p.category, i),
      vatRate: HAZIR_TUKETIM.test(ad) ? KDV_HAZIR : KDV_GIDA,
      shelfLifeDays: RAF_OMRU[p.category ?? ''] ?? 180,
      // Dondurma KARGOLANMAZ ve bu gerçek bir iş kuralı, serpiştirme değil: soğuk zincir kendi
      // aracımızla taşınır (`CLAUDE §1`, `Product.shippable`).
      shippable: p.category !== 'ice-cream',
      targetMarginPercent: 30 + (i % 6) * 3,
      autoPrice: i % 4 === 0,
      status: durum,
      sortOrder: startOrder + i,
      variants: p.variants.map((v) => ({
        // Boysuz ürün (bütün pastalar) tek varsayılan varyant taşır — modelin kendi kuralı.
        label: v.label ?? { tr: 'Tek boy', fr: 'Taille unique', de: 'Einheitsgröße' },
        netWeightG: v.netWeightG ?? undefined,
        sku: v.sku ?? undefined,
      })),
    });
    made += 1;
    varyantSayisi += variants.length;

    // Galeri: kaynaktaki İKİNCİ görsel. 98 üründe var, yani galeri denemesi gerçek veriyle yapılır.
    for (const [n, url] of p.imageUrls.slice(1).entries()) {
      const key = await uploadImageFromUrl(url, r2Keys.productImage(`${p.slug}-${n + 2}`, url.split('/').pop() || 'g.webp'));
      if (!key) continue;
      await images.insert({ productId: product.id, imageKey: key, sortOrder: n, imageUpdatedAt: NOW, imageFocalX: 50, imageFocalY: 50, imageZoom: 100 });
      photos += 1;
    }
  }

  return { made, photos, variants: varyantSayisi };
}
