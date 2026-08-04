import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CategoryService, ProductFamilyService, ProductImageService, ProductService } from '@lezzet/database';
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
  families: ProductFamilyService,
  catId: Map<string, string>,
  startOrder: number,
): Promise<{ made: number; photos: number; variants: number; families: number }> {
  const katalog = readLezzaCatalog();
  /** Aile bağı ÜRÜNLER KURULDUKTAN SONRA yazılır: bağ iki ucun da var olmasını ister. */
  const urunIdBySlug = new Map<string, string>();

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

  // **`… Mono Pack` ürünleri SEED'E ALINMIYOR** (kullanıcı kararı 04.08). Kaynak katalog tek
  // porsiyonluk paketi AYRI BİR ÜRÜN olarak kurmuş; modelde doğrusu aynı ürünün bir paket BOYU
  // (varyant) olmasıydı. Ayrı ürün kaldıkları sürece limonlu kekin sayfasında üstte dört çeşit,
  // altta "bunlarla da ilgilenebilirsiniz"de AYNI dört kek çıkıyordu. Bu bir test verisi; kaynağın
  // kurgusunu düzeltmek yerine o dört satırı hiç almamak hem daha dürüst hem daha sade.
  const urunler = katalog.products.filter((p) => !/\bmono\s*pack\b/i.test(p.name.tr ?? ''));

  for (const [i, p] of urunler.entries()) {
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
    urunIdBySlug.set(p.slug, product.id);
  }

  // Süzülmüş liste geçilir: aile kurucusu `urunIdBySlug`'a bakıyor ve süzülen ürünlerin kimliği
  // orada yok — ama listeyi de süzmek, "üyesi bulunamadı" diye sessizce eksilen bir aile yerine
  // hiç kurulmayan bir aile üretir. İkisi arasındaki fark, bir gün birinin gözden kaçmasıdır.
  const aileler = await aileleriKur(families, products, urunler, urunIdBySlug);

  return { made, photos, variants: varyantSayisi, families: aileler };
}

// ── ÜRÜN AİLELERİ (05.15) ────────────────────────────────────────────────────
// Gerçek katalogda aileler ZATEN VAR ve uydurmaya gerek yok: *"E-Shaped Börek with Cheese / Meat /
// Potato / Spinach & Cheese"* tam olarak bir ailedir — aynı ürünün dolgusu değişiyor. Aynı desen
// Spiral Pie, Mini Roll ve daha birçok dalda tekrarlanıyor.
//
// **Aile addan TÜRETİLİYOR, elle listelenmiyor:** katalog 141 üründen ibaret değil, yarın büyüyecek;
// elle yazılmış bir aile listesi ilk güncellemede bayatlardı.

/**
 * `"E-Shaped Börek with Cheese"` → `{ taban: "E-Shaped Börek", dolgu: "Cheese" }`
 *
 * ── DOLGUDAN BOY EKİ SÖKÜLÜR ve bu düzeltme ölçümle geldi (04.08) ────────────
 * İlk hâl dolguyu ham alıyordu ve **boyu çeşit sanıyordu** — tam olarak tasarımın uyardığı
 * karışıklık ("iki seçici asla karışmaz"). Gerçek katalogda sonucu şuydu:
 *   Baklava → `Pistachio (12 Pieces)` · `Pistachio (36 Pieces)` · `Pistachio (6 Pieces)` …
 *   Spiral Rose Börek → `Cheese` · `Cheese 6x80g` (aynı çeşit, iki kart, ikisi de "Peynirli")
 * Parça sayısı ve paket ölçüsü BOYDUR; çeşit ekseninde yeri yoktur.
 */
function aileParcala(ad: string): { taban: string; dolgu: string } | null {
  const m = /^(.+?)\s+with\s+(.+)$/i.exec(ad.trim());
  if (!m?.[1] || !m[2]) return null;
  const dolgu = m[2]
    .replace(/\(\s*\d+\s*pieces?\s*\)/gi, '') // "(12 Pieces)"
    .replace(/\b\d+\s*x\s*\d+\s*g\b/gi, '') // "6x80g"
    .replace(/\b\d+\s*(g|kg|gr)\b/gi, '') // "1250g"
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!dolgu) return null;
  return { taban: m[1].trim(), dolgu };
}

/**
 * Dolgu adının üç dilli karşılığı. Kaynak katalog YALNIZ İNGİLİZCE (`sourceLanguage: 'en'`), yani
 * çeviri uydurulacak değil TÜRETİLECEK — alerjen tablosuyla aynı yaklaşım.
 *
 * Sözlükte olmayan dolgu üç dile de İngilizcesiyle yazılır: ürün ADLARI da bugün öyle duruyor
 * (üreteç aynı metni üç dile koyuyor), yani seed kendi içinde tutarlı kalır ve **var olmayan bir
 * çeviri varmış gibi görünmez.**
 */
const DOLGU_SOZLUK: Record<string, LocalizedText> = {
  cheese: { tr: 'Peynirli', fr: 'Fromage', de: 'Käse' },
  meat: { tr: 'Kıymalı', fr: 'Viande', de: 'Hackfleisch' },
  potato: { tr: 'Patatesli', fr: 'Pomme de terre', de: 'Kartoffel' },
  'spinach & cheese': { tr: 'Ispanaklı peynirli', fr: 'Épinards & fromage', de: 'Spinat & Käse' },
  spinach: { tr: 'Ispanaklı', fr: 'Épinards', de: 'Spinat' },
  walnut: { tr: 'Cevizli', fr: 'Noix', de: 'Walnuss' },
  pistachio: { tr: 'Fıstıklı', fr: 'Pistache', de: 'Pistazie' },
  chocolate: { tr: 'Çikolatalı', fr: 'Chocolat', de: 'Schokolade' },
  // Sıfat-önde ailelerin çeşitleri (kek · cheesecake · dondurma).
  lemon: { tr: 'Limonlu', fr: 'Citron', de: 'Zitrone' },
  mango: { tr: 'Mangolu', fr: 'Mangue', de: 'Mango' },
  strawberry: { tr: 'Çilekli', fr: 'Fraise', de: 'Erdbeere' },
  raspberry: { tr: 'Frambuazlı', fr: 'Framboise', de: 'Himbeere' },
  'toffee caramel': { tr: 'Karamelli', fr: 'Caramel', de: 'Karamell' },
  cocoa: { tr: 'Kakaolu', fr: 'Cacao', de: 'Kakao' },
  plain: { tr: 'Sade', fr: 'Nature', de: 'Natur' },
};

function dolguEtiketi(dolgu: string): LocalizedText {
  return DOLGU_SOZLUK[dolgu.toLowerCase()] ?? { tr: dolgu, fr: dolgu, de: dolgu };
}

/**
 * **SIFAT-ÖNDE aileler — elle doğrulanmış, türetilmiyor** (04.08, kullanıcı sorusu üzerine).
 *
 * Kaynak katalog aileyi İKİ FARKLI biçimde adlandırıyor:
 *   1. `"E-Shaped Börek with Cheese"` — dolgu sonda, `aileParcala` bunu güvenle çözüyor.
 *   2. `"Artisan Lemon Cake"` — çeşit ORTADA. Tasarımın kendi örneği (limonlu/mangolu kek) tam
 *      olarak bu biçimde ve ilk turda TAMAMEN KAÇIRILMIŞTI.
 *
 * **İkincisi neden türetilmiyor:** "aynı uzunlukta, tek konumda ayrışan adlar aynı ailedendir"
 * kuralı denendi ve ÖLÇÜLDÜ — 26 aile üretti ama içinde `Hummus | Lahmacun | Şakşuka | Tiramisu`
 * (birbiriyle ilgisiz dört ürün) ve `10 | 5` (parça sayısı çeşit sanılmış) gibi uydurmalar vardı.
 * Seed'de **isabet kapsamdan önemlidir:** yanlış bir aile, ekranı çizen ajana ve kullanıcıya
 * kavramı yanlış öğretir. Az ve doğru, çok ve gürültülüden iyidir.
 *
 * Liste kısa kalmalı — uzarsa bu, kaynağın adlandırmasının değiştiğinin işaretidir.
 */
const ELLE_AILELER: Array<{ ad: string; uyeler: Array<{ slug: string; dolgu: string }> }> = [
  {
    ad: 'Artisan Cake',
    uyeler: [
      { slug: 'artisan-lemon-cake', dolgu: 'Lemon' },
      { slug: 'artisan-mango-cake', dolgu: 'Mango' },
      { slug: 'artisan-pistachio-cake', dolgu: 'Pistachio' },
      { slug: 'artisan-strawberry-cake', dolgu: 'Strawberry' },
    ],
  },
  // **`… Mono Pack` ürünleri BİLEREK AİLE YAPILMADI** (kullanıcı kararı 04.08). Bir tur ayrı bir
  // aile olarak kurulmuşlardı ve sonucu ölçüldü: limonlu kekin sayfasında üstte dört çeşit,
  // ALTTA "bunlarla da ilgilenebilirsiniz"de **aynı dört kek** tek porsiyonluk hâliyle çıkıyordu.
  // Modelde doğrusu bunların ayrı ürün değil aynı ürünün bir PAKET BOYU olmasıydı; kaynak katalog
  // öyle kurmadı ve bu bir test verisi, kaynağın kurgusunu düzeltmek seed'in işi değil.
  {
    ad: 'Cake Cup',
    uyeler: [
      { slug: 'chocolate-cake-cup', dolgu: 'Chocolate' },
      { slug: 'pistachio-cake-cup', dolgu: 'Pistachio' },
      { slug: 'toffee-caramel-cake-cup', dolgu: 'Toffee Caramel' },
    ],
  },
  {
    // `raspberry-cheesecake-cup` ve `lemon-cheesecake-slice` BİLEREK YOK: ikisi de format
    // (boy) ekseni, çeşit değil. `san-sebastian-cheesecake` de yok — o bir çeşit değil ayrı bir
    // tarif, aynı ailede göstermek "limonlu/frambuazlı" seçimini bozardı.
    ad: 'Cheesecake',
    uyeler: [
      { slug: 'lemon-cheesecake', dolgu: 'Lemon' },
      { slug: 'raspberry-cheesecake', dolgu: 'Raspberry' },
    ],
  },
  {
    ad: 'Maraş Ice Cream',
    uyeler: [
      { slug: 'maras-ice-cream-plain', dolgu: 'Plain' },
      { slug: 'maras-ice-cream-cocoa', dolgu: 'Cocoa' },
      { slug: 'maras-ice-cream-pistachio', dolgu: 'Pistachio' },
    ],
  },
  {
    ad: 'Maraş Ice Cream Slice',
    uyeler: [
      { slug: 'maras-ice-cream-slice-plain', dolgu: 'Plain' },
      { slug: 'maras-ice-cream-slice-cocoa', dolgu: 'Cocoa' },
      { slug: 'maras-ice-cream-slice-lemon', dolgu: 'Lemon' },
    ],
  },
];

/**
 * Aynı tabanı paylaşan **iki ya da daha çok** ürünü bir aileye bağlar.
 *
 * Tek üyeli grup aile SAYILMAZ: bir çeşidi olan ürün ailesizdir ve ekranda çeşit bloğu hiç
 * çizilmez (brief §1b). Veri buna izin verirdi ama seed'in gerçekçi olması gerekiyor.
 */
async function aileleriKur(
  families: ProductFamilyService,
  products: ProductService,
  kaynak: readonly { slug: string; name: LocalizedText }[],
  urunIdBySlug: Map<string, string>,
): Promise<number> {
  const gruplar = new Map<string, Array<{ slug: string; dolgu: string }>>();
  for (const p of kaynak) {
    const parca = aileParcala(p.name.tr ?? '');
    if (!parca) continue;
    const grup = gruplar.get(parca.taban) ?? [];
    // **AYNI ÇEŞİT İKİNCİ KEZ ALINMAZ.** Katalogda aynı dolgu birden çok pakette geçiyor
    // (`Cheese` + `Cheese 6x80g`) ve ikisi de üye olsaydı yan yana AYNI ETİKETLİ iki kart
    // çıkardı — müşteri iki "Peynirli" arasında seçim yapamaz. Modelde doğrusu bunların tek
    // ürünün iki VARYANTI olmasıydı; kaynak katalog öyle kurmadığı için seed ilkini alıyor,
    // ötekiler ailesiz normal ürün olarak kalıyor. Seed'in işi gerçekçi veri üretmek, kaynağın
    // kurgusunu düzeltmek değil.
    if (grup.some((u) => u.dolgu.toLowerCase() === parca.dolgu.toLowerCase())) continue;
    grup.push({ slug: p.slug, dolgu: parca.dolgu });
    gruplar.set(parca.taban, grup);
  }

  // Elle doğrulanmış aileler türetilenlerin YANINA gelir; slug'ları `… with …` desenine uymadığı
  // için ikisi çakışmaz.
  for (const aile of ELLE_AILELER) gruplar.set(aile.ad, [...aile.uyeler]);

  let kurulan = 0;
  for (const [taban, uyeler] of gruplar) {
    if (uyeler.length < 2) continue;
    // Aile adı TEK DİLLİ: yalnız operatör görüyor (kullanıcı kararı 04.08).
    const aile = await families.insert({ name: taban });
    for (const [sira, uye] of uyeler.entries()) {
      const id = urunIdBySlug.get(uye.slug);
      if (!id) continue;
      await products.update({ id, familyId: aile.id, familyLabel: dolguEtiketi(uye.dolgu), familyPosition: sira });
    }
    kurulan += 1;
  }
  return kurulan;
}
