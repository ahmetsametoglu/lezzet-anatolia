import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CategoryImageService, CategoryService, ProductFamilyService, ProductImageService, ProductService } from '@lezzet/database';
import { PRODUCT_GALLERY_MAX, hasAllLocales } from '@lezzet/types';
import type { LocalizedText, Nutrition, ProductAllergen, ProductStatus, ProductStorageType } from '@lezzet/types';
import { NOW, r2Keys, uploadImageFromUrl } from './shared';
import { teklifSkulari } from './supplier-prices';
import { enAz, type Katman } from './tier';

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
  portionKind?: 'item' | 'slice' | null;
  /** Paket içi adet (`(12 Pieces)` · `4x80g`). `null` = bildirilmemiş — sıfır DEĞİL. */
  piecesCount: number | null;
  sku: string | null;
  // `logistics` (koli/palet künyesi) BU TİPTE ARTIK YOK ve üreteç de yazmıyor (kullanıcı kararı
  // 28.08 · `05.22`): alan hiç okunmuyordu ve sorduğu soru başka yerde çözüldü — "kolide kaç adet"
  // `variant_barcode.qty_per_code`, palet ekseni ise kapsam dışı. Gerekçenin tamamı üreteçte.
  /** Kaynağı API OLMAYAN kalemlerde (basılı katalogdan gelen 7 SKU) `null`. */
  sourceId: number | null;
  sourceSlug: string | null;
}
/**
 * Üretici spesifikasyonundan GERÇEK yasal beyan — yalnız 6 üründe dolu, ötekilerde `null`.
 * Alanların künyesi ve belgelerin kendi çelişkileri `data/sources/README.md`'de.
 */
interface LezzaDeclarations {
  specDoc: string;
  ingredientsEU: string | null;
  allergens: string[];
  traces: string[];
  nutritionPer100g: Nutrition | null;
  storage: string | null;
  shelfLifeMonths: number | null;
  cookingTips: string | null;
}
interface LezzaProduct {
  slug: string;
  name: LocalizedText;
  sourceLanguage: string;
  category: string | null;
  brand: string | null;
  /** Basılı katalogdan gelen kalemlerde `null` — açıklamanın kaynağı API'ydi, uydurulmaz. */
  description: string | null;
  imageUrls: string[];
  channels: string[];
  declarations: LezzaDeclarations | null;
  variants: LezzaVariant[];
}
interface LezzaCatalog {
  categories: Array<{ key: string; name: LocalizedText; imageUrl: string | null }>;
  products: LezzaProduct[];
}

const DATA = join(dirname(fileURLToPath(import.meta.url)), 'data/lezza-catalog.json');
const CEVIRI = join(dirname(fileURLToPath(import.meta.url)), 'data/translations.json');

function readLezzaCatalog(): LezzaCatalog {
  return JSON.parse(readFileSync(DATA, 'utf8')) as LezzaCatalog;
}


/**
 * ── ÜRÜN ADI VE AÇIKLAMASININ ÜÇ DİLLİ KARŞILIĞI (kullanıcı isteği 16.08) ────────────────────────
 *
 * Kaynak katalog yalnız İNGİLİZCE ve öyle kalıyor (`sourceLanguage: 'en'` — üreteç künyesi). Eskiden
 * aynı İngilizce metin üç dile de yazılıyordu: Fransız müşteri "Spiral Rose Börek with Cheese"
 * okuyordu ve **kayıt teknik olarak "tam" görünüyordu** (`is_incomplete` yalnız alanın DOLU olmasına
 * bakar, dilinin doğru olmasına değil). Yani eksiklik hiçbir sayaçta görünmüyordu.
 *
 * `data/translations.json` bu boşluğu kapatıyor: 126 ürünün adı ve açıklaması üç dilde ELLE yazılı.
 * Dosya üretilmiş değil — `lezza:catalog` ona dokunmaz.
 *
 * **Kaynak İngilizce ad yine de gerekli ve saklanıyor:** alerjen tahmini ve KDV ölçütü İngilizce
 * anahtar kelimelere bakıyor (`ice cream`, `cup`, `slice`). Görünen ad çevrildiği hâlde bu desenler
 * kaynağın adı üzerinde çalışmaya devam eder — yoksa "Maraş Dondurması" İngilizce desene takılmaz ve
 * KDV sessizce %5,5'e düşerdi.
 */
interface LezzaCeviri {
  name: LocalizedText;
  description?: LocalizedText;
}

function readCeviriler(): Record<string, LezzaCeviri> {
  const ham = JSON.parse(readFileSync(CEVIRI, 'utf8')) as Record<string, LezzaCeviri | string>;
  // `_not` / `_kapsam` gibi künye alanları veri değil; ayıklanır ki "çevirisi yok" uyarısı onları saymasın.
  return Object.fromEntries(Object.entries(ham).filter(([k, v]) => !k.startsWith('_') && typeof v === 'object')) as Record<string, LezzaCeviri>;
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
 * Spek belgesindeki alerjen adı → yasal enum. **Türetme değil ÇEVİRİ:** üstteki tablo addan tahmin
 * yürütür, bu tablo belgenin yazdığını karşılığına koyar.
 *
 * İkisi eşleme istiyor ve ikisi de `sert_kabuklu` altında toplanıyor: `ceviz` ve `antep fistigi`.
 * AB'nin on dörtlü listesinde ceviz ve fıstık ayrı kalem değildir — "sert kabuklu yemişler"
 * (fruits à coque) tek başlıktır. **`yer_fistigi` ile karıştırmamak kritik:** yer fıstığı baklagildir,
 * listede AYRI bir kalemdir ve alerjisi de ayrıdır; ikisini birleştirmek yanlış bir beyan olurdu.
 */
const SPEK_ALERJEN: Record<string, ProductAllergen> = {
  gluten: 'gluten',
  sut: 'sut',
  yumurta: 'yumurta',
  soya: 'soya',
  susam: 'susam',
  kereviz: 'kereviz',
  ceviz: 'sert_kabuklu',
  'antep fistigi': 'sert_kabuklu',
};

/**
 * Tanınmayan ad SESSİZ DÜŞMEZ, seed'i durdurur. Bir beyan alanında sessiz kayıp, eksik bir alerjen
 * satırı demektir — ve eksik alerjen beyanı, hiç beyan olmamasından tehlikelidir: ürün "beyanı tam"
 * görünür, oysa bir kalemi düşmüştür.
 */
function spekAlerjen(liste: string[]): ProductAllergen[] {
  return [
    ...new Set(
      liste.map((a) => {
        const enumDegeri = SPEK_ALERJEN[a.toLowerCase()];
        if (!enumDegeri) throw new Error(`spek alerjeni tanınmadı: "${a}" — SPEK_ALERJEN sözlüğüne ekle`);
        return enumDegeri;
      }),
    ),
  ];
}

/**
 * Spek metnini üç dile de yazar. **Çeviri DEĞİL, kopya** — ve bu ad/açıklamadaki kararın aynısı
 * (`sourceLanguage`): makine çevirisini buraya gömmek, çevrilmiş metni belgenin kendi cümlesi gibi
 * gösterirdi. Çeviri ayrı bir adımdır (20.2); o gün bu üç kopyanın ikisi gerçek çeviriyle değişir.
 */
const ucDile = (metin: string): LocalizedText => ({ tr: metin, fr: metin, de: metin });

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

/**
 * ── KATEGORİ FOTOĞRAFLARI — BEŞİ DE ELLE SEÇİLDİ (kullanıcı kararı 16.08) ────────────────────────
 *
 * Kaynağın kendi kategori kapağı (`categories[].imageUrl`) ARTIK KULLANILMIYOR. Onlar illüstrasyon +
 * ürün kolajıydı; kullanıcı 253 fotoğrafın tamamına bakıp her kategoriye **ambalajsız ürün
 * fotoğrafı** seçti — müşteri kategoriye tıklamadan önce ürünün kendisini görsün, kutusunu değil.
 *
 * **Dizinin İLKİ kapaktır** (`category.image_key`), kalan dördü havuza gider (`category_image`,
 * 05.23) ve kart kareyi GÜNE göre havuzdan seçer. Beş sayısı kullanıcının tavanı.
 *
 * Seçim SEED'DE duruyor, üreteçte değil, ve bu ayrım bilinçli: üreteç kaynağın aynasıdır ve bir
 * sonraki `pnpm lezza:catalog` koşusu oraya yazılmış her elle kararı sessizce silerdi. Hangi
 * fotoğrafın kapak olacağı editoryal bir karardır — sahnenin işi.
 *
 * ⚠ **Tavuk ürünlerinin beşi de AMBALAJLI** ve bu bir tercih değil, arşivin sınırı: kategorinin
 * 11 fotoğrafının 11'i de poşet çekimi (ölçüldü 16.08). Ambalajsız fotoğraf çekilene kadar böyle.
 */
const KATEGORI_GORSELLERI: Record<string, string[]> = {
  bakery: [
    'Cheese-Pastry-Su-Borek-2500g.webp',
    'Cheese-Rolls-Handmade-40g.webp',
    'Kumru-Bagel-140g.webp',
    'Lahmacun-3x180g-01.webp',
    'Mini-Pide-with-Cheese-250g-01.webp',
  ],
  dessert: [
    'Baklava-with-Pistachio-225g.webp',
    'Carrot-Slice-Baklava-1350g.webp',
    'Pistachio-Rolls-Baklava-2000g.webp',
    'Tres-Leches-Raspberry-2000g.webp',
    'Tulumba-Dessert-5000g.webp',
  ],
  cake: [
    'Artisan-Lemon-Cake-90g.webp',
    'Dark-Chocolate-Profiterol-Whole-Cake.webp',
    'Rasperry-CheesCake-165g.webp',
    'Special-Pistachio-Garden-Whole-Cake.webp',
    'tiramisu-145g.webp',
  ],
  anatolian: [
    'Turkish-Ravioli-with-Meat-Manti-1000g.webp',
    'Stuffed-Vine-Leaves-1000g.webp',
    'Vegan-Kibbeh-10-x-70-g.webp',
    'Vegan-Raw-Meatballs-1000g.webp',
    'Spicy-Turkish-Tomato-Dip-1000g.webp',
  ],
  chicken: [
    'Chicken-Tender-Fillet-700g.webp',
    'Crispy-Chicken-Burger-720g.webp',
    'Crispy-Chicken-Nugget-720g.webp',
    'Spicy-Chicken-Tender-Fillet-700g.webp',
    'Spicy-Chicken-Wings-700g.webp',
  ],
  'ice-cream': [
    'MARAS-ICE-CREAM-slice-plain-70g.webp',
    'Maras-Ice-Cream-Cocoa.webp',
    'Maras-Ice-Cream-Pistachio.webp',
    'Maras-Ice-Cream-Plain.webp',
    'Maras-Ice-Cream-Trio-Mix.webp',
  ],
};

/**
 * Dosya adı → uzak adres. Seçimler DOSYA ADIYLA yazılı (arşivde insanın gördüğü ad); indirme ise
 * adresi ister. Harita katalogdan kurulur, sabit bir liste tutulmaz — adres kaynakta değişirse
 * seçim yine tutar.
 */
export function lezzaGorselUrlByDosya(): Map<string, string> {
  const harita = new Map<string, string>();
  for (const p of readLezzaCatalog().products) {
    for (const url of p.imageUrls) {
      const ad = url.split('/').pop();
      if (ad && !harita.has(ad)) harita.set(ad, url);
    }
  }
  return harita;
}

/**
 * Kategori ALTYAZILARI (05.17 · kullanıcı kararı 08.08) — mobil vitrin bandının ikinci satırı,
 * web kullanımı tasarım kararına açık. Metinler EDİTORYAL fikstürdür: operatör Katalog ekranından
 * değiştirir (üç dilli form + AI çeviri önerisi); buradaki değer ilk kurulumun cümlesi, sözleşme
 * değil. Boş bırakılan kategori altyazısız çizilir — yedek metin uydurulmaz.
 */
const KATEGORI_TAGLINE: Record<string, LocalizedText> = {
  bakery: { tr: 'Börekler ve hamur işleri', fr: 'Böreks et pâtisseries', de: 'Börek und Gebäck' },
  dessert: { tr: 'Baklava ve şerbetli tatlılar', fr: 'Baklava et desserts', de: 'Baklava und Süßspeisen' },
  cake: { tr: 'Dilim ve bütün pastalar', fr: 'Gâteaux entiers et parts', de: 'Torten und Stücke' },
  chicken: { tr: 'Pişirmeye hazır tavuk', fr: 'Volaille prête à cuire', de: 'Küchenfertiges Geflügel' },
  'ice-cream': { tr: 'Maraş usulü dondurma', fr: 'Glace façon Maraş', de: 'Eis nach Maraş-Art' },
  anatolian: { tr: 'Sofraya hazır yemekler', fr: 'Plats prêts à servir', de: 'Servierfertige Gerichte' },
};

/**
 * **SAKLAMA REJİMLERİ — `shippable` buradan TÜRER, ayrı yazılmaz** (müşteri şeridi talebi 08.08).
 *
 * ── NEDEN TEK KAYNAK ────────────────────────────────────────────────────────
 * Önce iki alan elle ayrı yazılıyordu: saklama metni TEK bir sabitti (`−18 °C`, 110 ürüne aynısı)
 * ve `shippable` ondan bağımsız bir kategori kuralıydı (`p.category !== 'ice-cream'`). İki alan
 * elle ayrı tutulduğunda **bir gün çelişirler** ve çelişkinin görüldüğü yer ekran olur: *"−18 °C'de
 * saklayın"* yazan bir ürün kargoya verilir. Rejim tek kaynak; metin de kargo izni de ondan çıkar.
 *
 * ── AYRI BİR KOLON DEĞİL, SEED SÖZLÜĞÜ ──────────────────────────────────────
 * `storage_instructions` modelde SERBEST METİNDİR (çok dilli, operatör yazar) ve öyle kalmalı —
 * rejimi kolona çevirmek, operatörün cümlesini bir listeye hapsederdi. Bu sözlük yalnız BESLEMENİN
 * kuralı: gerçek katalogda rejimi insan seçer, burada üretilmesi gerekiyor.
 *
 * ── ORAN ────────────────────────────────────────────────────────────────────
 * Ölçülen sorun (talep 08.08): 120 üründen 114'ü `shippable=true`, yani yer'e bağlı her ekran
 * (katalog çipi, `StockMark`, sepet teslimat kısıtı, "karma paket" kuralı) altı dondurma üzerinden
 * sınanıyordu. Karma paket hâli seed'de HİÇ doğmuyordu. Serpiştirme ~%40'ı kargo dışına taşır.
 */
type SaklamaRejimi = 'donuk' | 'soguk-zincir' | 'sogutulmus' | 'raf';

/**
 * **Belgenin saklama cümlesi "−18 °C" diyor mu** — tek yerde, çünkü artık İKİ alan buna bakıyor
 * (`shippable` ve `storageType`). Ayrı ayrı yazılsalardı aynı belgeden iki farklı sonuç çıkarabilir
 * hâle gelirlerdi; bu dosyanın 08.08'de öğrendiği ders tam olarak buydu.
 *
 * Ölçüldü (16.08): belgesi olan altı ürünün **altısı da** "-18°C dondurulmuş" diyor, yani
 * kaynaklarda `chilled` ya da `ambient` tek bir kanıt YOK. Desen bu yüzden tek yönlü: "−18 °C
 * yazıyorsa donuk", yazmıyorsa **bilmiyoruz** (alan yazılmaz, kolonun varsayılanı kalır).
 */
const BEYAN_DONUK = /-\s*18\s*°?\s*c/i;

/**
 * **REJİM ARTIK ÜÇ ŞEYİN TEK KAYNAĞI** (16.08 · `product.storage_type` kolonu eklendi).
 *
 * Soğuk zincir bugüne kadar saklanMIYORDU: `shippable = false` onun yerine geçiyordu, yani sistem
 * SEBEBİ değil SONUCU tutuyordu (migration `0005` künyesi). Kolon gelince seed'in seçeceği bir
 * değer daha doğdu — ve onu ayrı bir sözlüğe yazmak, bu dosyanın 08.08'de çözdüğü hatayı geri
 * getirirdi: **iki alan elle ayrı tutulduğunda bir gün çelişirler.** Şimdi metin de, kargo izni de,
 * saklama rejimi de aynı satırdan çıkıyor; "−18 °C yazan ürün `ambient` işaretlenmiş" hâli
 * temsil edilemez oldu.
 *
 * Eşleme dörtten üçe iniyor ve kayıp yok: `donuk` ile `soguk-zincir` **aynı rejimdir** (ikisi de
 * `frozen`), ayrıldıkları yer kargo iznidir — dondurma yolu kaldırmaz, börek kaldırır. Kolonun üç
 * değeri saklamayı anlatıyor, teslimatı `shippable` anlatıyor; ikisi ayrı sorular (0005 künyesi).
 */
const SAKLAMA: Record<SaklamaRejimi, { metin: LocalizedText; shippable: boolean; storageType: ProductStorageType }> = {
  // Donuk ama kargolanabilir: yalıtımlı kutu 24-48 saatlik yolu kaldırır — kataloğun ana kütlesi.
  donuk: {
    metin: {
      tr: '−18 °C’de saklayın. Çözdürdükten sonra **tekrar dondurmayın**; 24 saat içinde tüketin.',
      fr: 'Conserver à −18 °C. **Ne pas recongeler** après décongélation ; à consommer sous 24 heures.',
      de: 'Bei −18 °C lagern. Nach dem Auftauen **nicht wieder einfrieren**; innerhalb von 24 Stunden verzehren.',
    },
    shippable: true,
    storageType: 'frozen',
  },
  // Kesintisiz soğuk zincir: çözülmeyi hiç kaldırmaz, kendi aracımızla gider. Dondurmanın rejimi.
  'soguk-zincir': {
    metin: {
      tr: '−18 °C’de, **kesintisiz soğuk zincirde** saklayın. Kısmi çözülme ürünü bozar; kargoyla gönderilmez.',
      fr: 'Conserver à −18 °C en **chaîne du froid ininterrompue**. Une décongélation partielle altère le produit ; non expédiable.',
      de: 'Bei −18 °C in **ununterbrochener Kühlkette** lagern. Teilweises Auftauen verdirbt das Produkt; kein Versand.',
    },
    shippable: false,
    // `donuk` ile AYNI rejim, farklı teslimat: ikisi de −18 °C'de saklanır, biri yolu kaldırır öteki
    // kaldırmaz. İade varsayılanının imha olması ikisinde de doğrudur — kolonun asıl işi bu.
    storageType: 'frozen',
  },
  // Soğutulmuş (0-4 °C), kısa raf ömrü: yolda geçen saat doğrudan tazelikten düşer.
  sogutulmus: {
    metin: {
      tr: '**0-4 °C**’de buzdolabında saklayın. Dondurmayın; ambalajı açıldıktan sonra 48 saat içinde tüketin.',
      fr: 'Conserver au réfrigérateur entre **0 et 4 °C**. Ne pas congeler ; à consommer sous 48 heures après ouverture.',
      de: 'Im Kühlschrank bei **0-4 °C** lagern. Nicht einfrieren; nach dem Öffnen innerhalb von 48 Stunden verzehren.',
    },
    shippable: false,
    storageType: 'chilled',
  },
  // Rafta duran kuru ürün (kuru baklava, simit, kuru pasta): oda sıcaklığı, kargonun en kolayı.
  raf: {
    metin: {
      tr: '**Serin ve kuru** yerde, oda sıcaklığında saklayın. Doğrudan güneş ışığından uzak tutun.',
      fr: 'Conserver dans un endroit **frais et sec**, à température ambiante. Tenir à l’abri du soleil.',
      de: 'An einem **kühlen, trockenen** Ort bei Raumtemperatur lagern. Vor direkter Sonne schützen.',
    },
    shippable: true,
    storageType: 'ambient',
  },
};

/**
 * Ürünün rejimi — kategori gerçek kuralı verir, serpiştirme çeşitliliği.
 *
 * **Dondurma her zaman soğuk zincir** ve bu serpiştirme DEĞİL, gerçek bir iş kuralı: eski kodun tek
 * doğru satırıydı, aynen korundu. Ötekilerde `i` üzerinden deterministik dağıtım — her kategoride
 * hem kargolanan hem kargolanmayan kalem bulunsun (talebin birinci maddesi), çünkü "karma paket"
 * hâli ancak öyle doğar ve `packages.ts`'in *"bir kalem kargolanamıyorsa paket tamamen rota içi"*
 * kuralı ancak öyle sınanır.
 *
 * Rastgele DEĞİL: seed her koşuda aynı kataloğu kurmalı, yoksa "dün geçen test bugün düştü" olur.
 */
function saklamaRejimi(kategori: string | null, i: number): SaklamaRejimi {
  if (kategori === 'ice-cream') return 'soguk-zincir';
  // Bölenler ÖLÇÜLEREK seçildi (talebin istediği ~%25-40 bandı): 5/5/7 denendi → %48, 6/7/5 → %39,
  // 7/8/5 → %36. Sonuncusu alındı; üçünde de her kategoride iki yön birden doğuyor.
  if (i % 7 === 0) return 'soguk-zincir';
  if (i % 8 === 3) return 'sogutulmus';
  if (i % 5 === 2) return 'raf';
  return 'donuk';
}

/**
 * Ürünün SATIŞ DURUMU — tek karar noktası (kullanıcı kararı 19.08).
 *
 * Sıralama bilinçli: önce satılabilir olmayı GEREKTİREN sebepler, sonra katman, sonra kusurlar.
 * Ters sırada yazılsaydı bir indis, paket kalemini pasife düşürebilir ve paketi bozardı.
 *
 * ── AİLE BÖLÜNMEZ (kullanıcı kararı 19.08) ───────────────────────────────────────────────────
 * *"Simitler bir aile olarak görünmüyor… ailelerin net görülebilmesi için bunların hepsinin
 * bilgisinin olması gerekiyor."* Ölçüldü: 25 ailenin **8'i tamamen adaydı** (Meze · Poğaça · Tavuk
 * Kanat · Kol Böreği · Kek Bardağı · Çıtır Tavuk Fileto · Mini Pide · Kalzone) — yani vitrinde HİÇ
 * yoklardı. Simit ailesinde 3 üründen yalnız Tatlı Simit satıştaydı; müşteri "simit" arayınca tek
 * sonuç görüyordu ve çeşit bloğu hiç çizilmiyordu.
 *
 * Sebebi ölçütün ürün başına bakmasıydı: *teklifte SKU'su yoksa aday*. Tesadüfen bir ailenin hiçbir
 * üyesi 22.12.2025 teklifinde yoksa aile toptan kayboluyordu.
 *
 * Kural artık şu: **aile üyesi ürün aday OLAMAZ.** Ticari gerekçesi de bu — aile aynı ürünün çeşit
 * eksenidir (E böreği: peynirli/kıymalı/patatesli/ıspanaklı) ve müşteri o eksende SEÇİM yapar. Yarım
 * bir çeşit bloğu bozuk raftır: dört çeşidin ikisini listeleyen dükkân, satmadığı iki çeşidi de
 * hatırlatmış olur. Bir ürün hattı ya bütün alınır ya hiç alınmaz.
 *
 * Aday bu yüzden **ailesiz ürünlerden** seçiliyor: tek başına duran bir kalemi stoklamamak hiçbir
 * ekranı yarım bırakmaz. Ölçülen sonuç: 64 aday → 26, sekiz boş ailenin hepsi doldu.
 *
 * Kural ayrıca bir fikstürü GEREKSİZ kıldı: `VITRIN_FIKSTURU` (901016B · 901023B · 901015B ·
 * 901024B) elle satışa açılmış dört Artisan kek idi ve dördü de aynı ailenin üyesi — aile kuralı
 * onları zaten aktif doğuruyor. Elle liste silindi; iki ölçüt aynı şeyi söylerse biri bir gün
 * ötekinden ayrılır ve hangisinin karar verdiği görünmez olur.
 */
function satilabilirDurum(o: {
  teklifli: boolean;
  kurguda: boolean;
  zayifVeri: boolean;
  aileli: boolean;
  kusurlu: boolean;
  /**
   * **Üç dil / yasal beyan eksik → YAYINLANAMAZ** (05.36, 27.08). Kural artık veride:
   * `product_publish_requires_all_locales`. Seed'in sentetik kusurları (`dilEksik`, `beyanEksik`)
   * bu üretece bildirilmiyordu ve `active` doğabiliyorlardı — kısıt konunca `db:reset` o satırda
   * kesilirdi.
   *
   * **Kova KAYBOLMUYOR, yerini buluyor:** "çevirisi tamamlanmamış ürün" hâli hâlâ doğuyor, artık
   * `candidate` olarak. Formun "çeviri eksik" uyarısı aday üründe de koşar — zaten operatörün
   * gerçek akışı da bu: ürün aday doğar, üç dil dolunca yayına alınır.
   */
  yayinaHazirDegil: boolean;
  i: number;
}): ProductStatus {
  // **TEKLİFLİ VE KURGUDAKİ ÜRÜNLER EN ÖNDE** — ama artık koşullu (05.36). Alış fiyatı olan ya da
  // bir pakete/koleksiyona giren ürün satıştadır; bu kural duruyor. Değişen şu: yayın kısıtı
  // (`product_publish_requires_all_locales`) bir kestirme tanımıyor — metinleri eksik ürün
  // `active` YAZILAMAZ, veritabanı reddeder. O yüzden burada da aday'a düşüyor; "satın aldığımız
  // mal satılamaz olmasın" kaygısının cevabı artık ürünün metinlerini tamamlamaktır, durumu
  // zorlamak değil.
  if (o.teklifli || o.kurguda) return o.yayinaHazirDegil ? 'candidate' : 'active';
  // ── PASİF ARTIK İNDİSTEN DEĞİL, VERİNİN KENDİSİNDEN (kullanıcı kararı 19.08) ─────────────────
  // *"85 aday çok, bazılarını pasife çekelim — özenle seçelim: bilgilerinin düzgün olmayışı,
  // resimlerinin olmayışı."* Ölçüt artık o ve indis (`i % 23`) yerine geçti: görseli, açıklaması
  // ya da çevirisi olmayan ürün SATIŞA SUNULAMAZ, dolayısıyla "aday" da değildir — aday tedarik
  // edilebilecek üründür, listelenebilecek olan.
  //
  // **YAYIN KONTROLÜNDEN ÖNCE ve bu bir düzeltme** (ölçüldü 27.08): `yayinaHazirDegil` bir tur en
  // öne konmuştu ve bu dalı YUTTU — `passive` ürün sayısı 3'ten **0'a** düştü, yani yukarıdaki
  // kullanıcı kararı seed'den sessizce kayboldu. İkisi AYRI hâl ve `catalog_health` onları ayrı
  // sayıyor: `passive` geri çekilmiş kaydın hâli, `candidate` henüz tamamlanmamış olanın. Kısıt
  // açısından fark yok — ikisi de `active` değil, yani ikisi de kısıttan muaf.
  if (o.zayifVeri) return 'passive';
  // Metinleri/beyanı eksik olan aday kalır — kısıt onu yayına almazdı zaten.
  if (o.yayinaHazirDegil) return 'candidate';
  // `base`: alış fiyatı olmayan her ürün ADAY. Bitmiş parti ve geri çekme kararı zamanla doğar —
  // ama eksik künye kurulum gününde de eksiktir, o yüzden `passive` yukarıda katmandan bağımsız.
  if (!o.kusurlu) return 'candidate';
  // Aile üyesi satıştadır — künyesi yukarıda. `base`te buraya hiç gelinmiyor (üstteki satır döndü).
  if (o.aileli) return 'active';
  // Ailesiz ürünlerin 7'de biri yine satışta: aday olmak ailesizliğin ZORUNLU sonucu değil, bir
  // assortiman kararı. Hepsi aday olsaydı "ailesiz = satılmıyor" gibi okunan sahte bir kural doğardı.
  if (o.i % 7 === 0) return 'active';
  return 'candidate';
}

/**
 * Kataloğu kurar. İmza eski toplu üreticiyle aynı şekilde: çağıran servisleri ve başlangıç sırasını
 * verir, sonuç sayıları döner.
 */
export async function seedLezzaProducts(
  categories: CategoryService,
  categoryImages: CategoryImageService,
  products: ProductService,
  images: ProductImageService,
  families: ProductFamilyService,
  catId: Map<string, string>,
  startOrder: number,
  /**
   * Satış kurgusuna GİRMİŞ ürünler — paket kalemi, tarif malzemesi, koleksiyon üyesi. Aday seçimi
   * bunları ATLAR (künyesi `durum` satırında). Küme çağırandan geliyor çünkü listelerin sahibi
   * `catalog.ts` ve `recipe.ts`; buraya kopyalansaydı iki liste bir gün ayrılır ve ayrıldığı gün
   * kimse fark etmezdi. Import de tek yönlü (`catalog.ts → catalog-lezza.ts`), tersi çevrim olurdu.
   */
  kurgu: { sku: ReadonlySet<string>; slug: ReadonlySet<string> },
  /** Besleme katmanı — `base` kusursuz katalog kurar (künye `tier.ts` ve `kusurlu` satırında). */
  katman: Katman,
): Promise<{ made: number; photos: number; variants: number; families: number }> {
  /** Bilinçli boşluklar (pasif · aday · beyansız · kapaksız · çevirisi yarım) `extend`ten itibaren. */
  const kusurlu = enAz(katman, 'extend');
  /**
   * **`base` HİÇBİR ALANI TÜRETMEZ** (kullanıcı kararı 16.08: *"hiçbir içerik üretilmeyecek"*).
   *
   * Bugün dokuz alan hesaplanıyor ve hiçbirinin arkasında bir belge yok: alerjen ADDAN çıkarılıyor,
   * besin künyesi KATEGORİ ORTALAMASINDAN, içindekiler alerjen listesinden kurulan bir cümleden,
   * saklama metni kategori rejiminden, raf ömrü kategori sabitinden, KDV oranı ürün ADININ
   * regex'inden, hedef marj ve otomatik fiyat indisten. Yerelde bunlar ekran doldurur; üretimde
   * **yanlış yasal beyan ve yanlış vergi sınıflandırması** olurlar.
   *
   * Şema bu boşluğu zaten temsil edebiliyor (ölçüldü): `allergens`/`traces` varsayılanı `{}`,
   * `ingredients`/`nutrition`/`storage_instructions`/`shelf_life_days`/`target_margin_percent`
   * nullable, `shippable` varsayılanı `false` ("bilmiyoruz" = kargolanmaz), `auto_price` `false`.
   * Tek istisna `vat_rate`: `NOT NULL` ve varsayılanı **5,5** — o bir tahmin değil, Fransa'da gıda
   * KDV oranının kendisi. Sonuç: 128 ürün `is_incomplete=true` doğar ve operatör doldurur.
   *
   * **Belgesi olan altı ürün etkilenmez** — onların beyanı gerçek ve üretime de gider.
   *
   * Ölçüt `kusurlu`nun aynısı ve bu bir tesadüf değil: türetilmiş bir alan da bilinçli bir boşluk
   * da aynı şeyi yapıyor — gerçekte olmayan bir hâli veriye yazmak. Uzak hedef ayrıca kontrol
   * edilmiyor çünkü `seed.ts` kapısı uzağa YALNIZ `base`i geçiriyor.
   */
  const turetmeSerbest = kusurlu;
  if (!turetmeSerbest) console.log('  · türetilmiş alan YAZILMAYACAK: alerjen · iz · içindekiler · saklama · besin künyesi · raf ömrü · KDV tahmini · hedef marj. Belgesi olan 6 ürün etkilenmez.');
  const katalog = readLezzaCatalog();
  /** Aile bağı ÜRÜNLER KURULDUKTAN SONRA yazılır: bağ iki ucun da var olmasını ister. */
  const urunIdBySlug = new Map<string, string>();

  // Kategoriler ARTIK YALNIZ kaynaktan kurulur (kullanıcı kararı 08.08: "resmî olmayan kategori
  // kalmasın"): elle yazılmış üçlü (Baklava/Şerbetli/Börek) ve `Malzeme` kaldırıldı, ürünleri de
  // gerçek katalogda birebir karşılığı olduğu için (kopyaydılar) katalogdan çıktı.
  //
  // Üç besleme birden (08.08): GÖRSEL kaynağın kendi kategori kapağından (`imageUrl` — build
  // script `/products/categories` ucundan çeker; "boş gri kutu" hâli seed'de artık örneklenmez),
  // TAGLINE alttaki sözlükten (mobil vitrin bandının altyazısı — 05.17; başlık = kategori ADI),
  // `isFeatured` HEPSİNE true: tasarımın vitrin ızgarası 6 slot ve kategori sayısı tam 6 —
  // operatör dilediğini Katalog ekranından vitrinden düşürür (05.18).
  //
  // ── KAPSAM BOŞLUKLARI: KATEGORİ (09.08) ────────────────────────────────────
  // Altı kategorinin altısı da aktif + kapaklı + altyazılı + vitrinde olduğu için DÖRT ekran hâli
  // seed'de hiç doğmuyordu (`pnpm seed:coverage`): kapaksız kartın baş-harf yedeği, altyazısız
  // bandın tek satırlık hâli, vitrin dışı kayıt ve pasif kategori. İkisini kullanıcı zaten EKRANDA
  // gördü ve sordu ("bu resmi olmayan kutular nedir?") — yani hâl gerçekti, seed onu üretmiyordu.
  //
  // Boşluk SON kategorilere konuyor: vitrin ızgarası altı slot ve sıra `sort_order`'dan geliyor,
  // yani vitrinden düşen kayıt listenin sonundaki olsun — ilk sıradakini düşürmek ana sayfayı
  // gerçek katalogda olmayacak bir hâlde gösterirdi.
  // **"Kapaksız kategori" boşluğu buradan KALKTI** (16.08): kullanıcı altı kategorinin altısına da
  // fotoğraf seçti ve seçilmiş bir kapağı "süzgeç denensin" diye atmak, kararı çöpe atmaktır. Kova
  // boş kalmıyor — aşağıdaki SEZONLUK kategori kapaksız doğuyor ve baş-harf yedeğini o sınıyor.
  // **"Altyazısız kategori" boşluğu da KALKTI (kullanıcı bildirimi 16.08: "dondurma kategorisinde
  // hiçbir metin yok").** Boşluk sondan ikinciye düşüyordu ve o kategori Dondurma'ydı: metni
  // sözlükte YAZILI olduğu hâlde seed onu siliyordu. Ekranda bunun bir kurgu olduğu anlaşılmıyor —
  // eksik bir veri gibi görünüyor, ki kullanıcı da öyle okudu. Kova sezonluk kategoriden doluyor
  // (aşağıda): o hem kapaksız hem altyazısız doğuyor, yani iki hâli birden sınıyor.
  const sonKategoriler = katalog.categories.length - 1;
  const gorselUrl = lezzaGorselUrlByDosya();
  for (const [k, c] of katalog.categories.entries()) {
    if (catId.has(c.key)) continue;
    const vitrinDisi = k >= sonKategoriler - 1; // ızgara 6 slot; ikisi dışarıda kalsın
    // `create` girdisi bilinçli dar (ad + sıra); tagline ve vitrin işareti update ile — aile
    // bağının `products.update` emsali. Tek çağrıda: ikisi de aynı ilk-kurulum kararının parçası.
    const created = await categories.create({ name: c.name });
    await categories.update({
      id: created.id,
      tagline: KATEGORI_TAGLINE[c.key] ?? null,
      isFeatured: !vitrinDisi,
    });
    catId.set(c.key, created.id);

    // Beş fotoğraf: ilki kapak (`image_key`), kalan dördü havuz (`category_image` — kart kareyi
    // güne göre oradan seçer). Yükleme başarısızsa (R2 ayarsız) o kare atlanır, seed durmaz.
    for (const [n, dosya] of (KATEGORI_GORSELLERI[c.key] ?? []).entries()) {
      const url = gorselUrl.get(dosya);
      if (!url) {
        console.log(`  ⚠ ${c.key} — "${dosya}" katalogda yok; kare atlandı`);
        continue;
      }
      const key = await uploadImageFromUrl(
        url,
        n === 0 ? r2Keys.categoryImage(created.slug, dosya) : r2Keys.categoryGalleryImage(created.slug, `${n + 1}`, dosya),
      );
      if (!key) continue;
      if (n === 0) await categories.setImageKey(created.id, key);
      else await categoryImages.add(created.id, key);
    }
  }

  // **PASİF kategori** — ayrı ve EK bir kayıt, gerçek altısından biri kapatılarak DEĞİL: pasif
  // kategori ürünlerini de katalogdan düşürür, yani gerçek bir kategoriyi kapatmak 20-30 ürünü
  // vitrinden silerdi. Sezonluk kategori gerçek bir operasyon hâlidir (yılın on ayı kapalı durur).
  //
  // **`base` katmanında YAZILMAZ:** kaynakta böyle bir kategori yok, bu kayıt yalnız kapsam denetimi için
  // uydurulmuş. Gerçek veriden başka bir şey yazmayan bir katmanda yeri olamaz.
  if (kusurlu) {
    const sezonluk = await categories.create({
      name: { tr: 'Ramazan Sofrası', fr: 'Table du Ramadan', de: 'Ramadan-Tafel' },
    });
    await categories.update({ id: sezonluk.id, isActive: false, isFeatured: false });
  }

  let made = 0;
  let photos = 0;
  let varyantSayisi = 0;

  // ── `mono` SÜZGECİ KALDIRILDI — SORUN SEED'DE DEĞİL KAYNAKTAYMIŞ (kullanıcı kararı 19.08) ────
  // 04.08'de tek porsiyonluk `mono` kayıtlar seed'e hiç alınmıyordu: kaynak onları AYRI ÜRÜN olarak
  // kurmuştu ve ayrı ürün kaldıkları sürece limonlu kekin sayfasında üstte dört çeşit, altta
  // "bunlarla da ilgilenebilirsiniz"de AYNI dört kek çıkıyordu. Süzgeç o belirtiyi susturuyordu.
  //
  // Doğrusu kullanıcının kuralıydı: *"Tatlı simidin dört paketi de olabilir, yüzlü paketi de
  // olabilir. Biz bunları varyant olarak sunarız."* Ambalaj boyu ürün değil VARYANTTIR — ve artık
  // öyle kuruluyor: eşleme `data/sources/variant-packs.json`da, birleştirme üreteçte
  // (`build-lezza-catalog.mjs` §3b). Ölçüldü: 8 mono kayıt bağlandı, katalog 134 → 126 ürün /
  // 175 varyant, çok boylu ürün 35 → 43. Süzgecin susturduğu şey artık doğru yerde duruyor,
  // dolayısıyla süzgecin kendisi de gereksiz.
  const urunler = katalog.products;

  const ceviriler = readCeviriler();
  const cevirisizler = urunler.filter((p) => !ceviriler[p.slug]).map((p) => p.slug);
  // Çevirisi olmayan ürün SESSİZ GEÇMEZ: kataloğa yeni bir kalem girdiğinde ilk kopan yer burasıdır
  // ve kopuş görünmez — ürün üç dile de İngilizce adıyla düşer, hiçbir sayaç bunu eksik saymaz.
  if (cevirisizler.length > 0) console.log(`  ⚠ çevirisi olmayan ${cevirisizler.length} ürün (İngilizce adıyla kurulacak): ${cevirisizler.join(' · ')}`);

  /** Gerçek alış fiyatı olan SKU'lar — ürünün AKTİF mi ADAY mı doğacağını bu belirliyor (`durum` künyesi). */
  const TEKLIF_SKULARI = teklifSkulari();

  for (const [i, p] of urunler.entries()) {
    // Kaynağın İNGİLİZCE adı — desen eşleştirmeleri (alerjen, KDV) bunun üzerinde çalışır.
    const ad = p.name.tr ?? '';
    const ceviri = ceviriler[p.slug];
    // **GERÇEK BEYAN VARSA TAHMİN HİÇ ÇALIŞMAZ** (15.08). Altı üründe üretici spesifikasyonu var ve
    // belgenin yazdığı alerjen, addan çıkarılandan hem daha doğru hem daha eksiksiz: `alerjenTuret`
    // "Vegan Çiğköfte"den kerevizi çıkaramaz (ada yazmıyor), belge çıkarıyor.
    const beyan = p.declarations;
    // **UZAK HEDEFTE TAHMİN YAZILMAZ** (katman künyesi `tier.ts`). Alerjen addan çıkarılıyor, besin
    // künyesi kategori ortalamasından, içindekiler alerjen listesinden — üçü de INCO kapsamında
    // YASAL BEYAN ve tahmin edilmiş bir beyan yanlış beyandır. Belgesi olan altı ürün etkilenmez:
    // onların beyanı gerçek ve üretime de gidebilir. Kalanlar boş gider, `is_incomplete` true olur
    // ve operatör doldurur — eksik bir künye, uydurulmuş bir künyeden dürüsttür.
    const alerjenler = beyan ? spekAlerjen(beyan.allergens) : turetmeSerbest ? alerjenTuret(`${ad} ${p.description ?? ''}`) : [];

    // ── Serpiştirilen boşluklar — YALNIZ `extend`ten itibaren (katman künyesi `tier.ts`) ─────────
    // `base` KUSURSUZDUR: açılış günü kataloğunda beyanı eksik, çevirisi yarım, kapaksız ya da
    // pasif ürün YOKTUR — bunlar operatörün zamanla biriktirdiği hâllerdir, kurulumun değil.
    //
    // Oranlar eski toplu üreticiden SEYREK: orada veri zaten uydurmaydı, burada gerçek bir katalogu
    // bozmamak gerekiyor. Yine de her süzgecin en az birkaç sonucu olacak kadar sık.
    // **Oran 17'de birden 41'de bire SEYRELDİ (16.08):** çeviriler artık gerçek ve elle yazılı, o
    // yüzden onları "süzgeç denensin" diye atmanın bedeli yükseldi. Üç ürün hâli sınamaya yeter.
    const dilEksik = kusurlu && i % 41 === 0; // fr/de düşer → "çevirisi tamamlanmamış ürün" hâli
    // **Beyanı GERÇEK olan ürün bu boşluğa hiç girmez.** Elimizde belgesi olan bir ürünün beyanını
    // "süzgeç denensin" diye silmek, sahnelemek değil veri kaybetmektir — ve kapsam zaten kalan
    // 128 üründen fazlasıyla doğuyor.
    const beyanEksik = kusurlu && !beyan && i % 13 === 0; // beyan dörtlüsü boş → "beyan eksik" süzgeci
    const kapaksiz = kusurlu && i % 19 === 0; // görselsiz kayıt → boş kapak durumu

    // ── DURUM STOK GERÇEĞİNDEN AYRILAMAZ (kullanıcı kararı 16.08) ─────────────────────────────
    // Önce durum burada (`i % 29`), stok ise `stock.ts`'te (`i < 45 || i % 3`) BİRBİRİNDEN HABERSİZ
    // iki indis kuralıyla veriliyordu. Sonuç ölçüldü: **116 aktif ürünün 53'ünün hiç stok partisi
    // yoktu** — yani kataloğun neredeyse yarısı müşteriye "tükendi" diye çıkıyordu, ve hepsi
    // BİTTİĞİ için değil hiç GELMEDİĞİ için. Buna karşılık gerçekten tükenmiş (partisi olup miktarı
    // sıfırlanmış) tek bir aktif ürün yoktu; tek örnek (`L-BITTI`) pasif bir ürüne düşmüştü, yani
    // müşteri yüzeyi onu hiç çizmiyordu.
    //
    // Oysa DOMAIN §13 aday ürünü zaten böyle tanımlıyor: *"stokta olmayan ama tedarik edilebilecek
    // ürün"*. Hiç stoklanmamış bir ürün "tükendi" değildir — daha satışa hiç çıkmamıştır, ve
    // operatöre "ne zaman gelecek" diye sorulabilen bir cevabı da yoktur. Doğru yeri keşif akışıdır.
    //
    // Kural artık TEK YÖNLÜ ve tek kaynaklı: **aday = stoklanmayacak ürün**; `stock.ts` aday
    // olmayan HER varyantı stoklar (orada ikinci bir "stoklu mu" kuralı kalmadı). "Tükendi" hâli
    // kayb olmuyor, `stock.ts`'te bilinçli olarak BİTMİŞ partiyle doğuyor — geçmişi olan bir tükeniş.
    //
    // **Satış kurgusuna girmiş ürün aday olamaz:** paket kalemi, tarif malzemesi ya da koleksiyon
    // üyesi bir ürünü aday yapmak o paketi/tarifi/seçkiyi sessizce satılamaz kılardı (aday ürünün
    // fiyatı da yok — paket fiyatı kalemlerin fiyatından türüyor, biri eksikse tutar yalan söyler).
    //
    // ── ÖLÇÜT ARTIK İNDİS DEĞİL, GERÇEK ALIŞ FİYATI (kullanıcı kararı 19.08) ──────────────────
    // Kural yukarıda doğru kurulmuştu ("aday = stoklanmayacak ürün") ama ÖLÇÜTÜ hâlâ indisti
    // (`i % 4 === 2`) ve o indisin gerçekle hiçbir bağı yoktu: 134 üründen 95'i aktif doğuyordu,
    // oysa gerçek alış fiyatımız **33 üründe** var. Kalan 62 aktif ürün fiyatını uydurma bir kilo
    // tabanından alıyor, stok partisi de uydurma — yani "satıştaki dükkân" büyük ölçüde kurgu.
    //
    // Kullanıcının istediği ölçüt açıktı: *"alış fiyatı ve satış fiyatı belirlenebilir olanlara
    // satın alma bilgisi gireceğiz; diğerlerinin az bir kısmı stokta bitti gösterirken büyük bir
    // kısmını aday yapacağız."* Ölçüt artık o: **teklifte SKU'su olan ürün aktif, olmayan aday.**
    //
    // "Tükendi" hâli TEKLİFSİZ ürünlerden seçiliyor (`i % 7`), teklifli olanlardan değil: teklifli
    // 33 ürün "aktif satın alınmış gibi" görünmeli, tükenmiş değil. Onların stoğu `stock.ts`te dolu
    // doğuyor, tükenenlerin partisi ise BİTMİŞ — geçmişi olan bir tükeniş (o dosyanın künyesi).
    //
    // **`base`te tükendi ve pasif YOK, ama aday VAR.** Açılış gününde bitmiş bir parti ya da geri
    // çekilmiş bir ürün olamaz — ikisi de zamanla doğar. Aday ise tam tersi: alış fiyatı olmayan,
    // stoğa hiç girmemiş ürün açılış günü de adaydır. Eskiden `base`te hepsi aktif doğuyordu ve
    // sonuç fiyatsız-stoksuz "aktif" ürünlerdi — vitrinde alınamaz kart, sebebi görünmeyen bir hâl.
    //
    // ⚠ **Satış kurgusundaki 16 ürün ADAY OLAMIYOR ve bu bir ödünç:** paket kalemi, tarif malzemesi
    // ve koleksiyon üyelerinin çoğu teklifte yok, ama aday yapılırlarsa o paket/tarif/seçki sessizce
    // satılamaz olur (aday ürünün fiyatı da yok; paket fiyatı kalemlerden türüyor). Doğru çözüm
    // kurguları teklifteki 34 kalemden yeniden kurmak. → BEKLEYEN(BACKLOG §2): satış kurguları
    const kurguda = kurgu.slug.has(p.slug) || p.variants.some((v) => v.sku && kurgu.sku.has(String(v.sku)));
    const teklifli = p.variants.some((v) => v.sku && TEKLIF_SKULARI.has(String(v.sku)));
    // KÜNYESİ YARIM ÜRÜN — üç sinyal de KAYNAĞIN kendi eksiği, bizim ürettiğimiz bir kusur değil:
    // galeri boş · açıklama yok · çeviri sözlüğünde karşılığı yok. Üçünden biri bile satışa
    // sunmayı engeller (vitrin kartı görselsiz ve dilsiz çizilemez).
    const zayifVeri = p.imageUrls.length === 0 || !p.description || !ceviri;
    // Aile üyeliği aday kararını ezer (künyesi `satilabilirDurum`). Küme `ELLE_AILELER`'den TÜRÜYOR,
    // ikinci bir listeye kopyalanmıyor: aileye bir çeşit eklenince satış durumu da kendiliğinden
    // doğru olsun — iki liste bir gün ayrılsaydı, ayrıldığı gün aile yine yarım kalırdı.
    const aileli = AILE_UYESI_SLUG.has(p.slug);
    // `durum` METİNLERDEN VE GÖRSELDEN SONRA hesaplanıyor (aşağıda) — yayın kısıtı onlara bakıyor.
    // **Künyesi eksik ürün** (kapsam denetimi 09.08) — ikisi de ayrı bir EKRAN hâli, ayrı sebep:
    //   raf ömrü yok  → "kalan %" hesaplanamaz; parti kartı o çubuğu HİÇ basmamalı
    //   hedef marj yok → marj uyarısı hesaplanamaz; "uyarı yok" ile "veri yok" aynı şey değil
    // Operatörün gerçekte unuttuğu iki alan bunlar; ikisi de zorunlu değil ve boş kalabiliyor.
    const rafOmruYok = kusurlu && i % 31 === 0;
    const marjYok = kusurlu && i % 37 === 0;

    // Saklama rejimi TEK KAYNAK: metin de kargo izni de buradan çıkar, ikisi ayrışamaz.
    // **Beyansız ürün kargolanmaz** ve bu, kolonun yeni varsayılanının (`false`) tam olarak
    // anlatmak istediği şey: beyanı olmayan bir üründe "kargolanabilir mi" sorusunun cevabı
    // "bilmiyoruz"dur ve donuk gıdada bilinmeyen, "evet" değil "hayır" sayılır.
    const rejim = SAKLAMA[saklamaRejimi(p.category ?? null, i)];

    // Görünen ad ve açıklama ÇEVİRİDEN; çeviri yoksa kaynağın İngilizcesine düşülür (yukarıda uyarı
    // basıldı). `dilEksik` sahnesi yalnız TÜRKÇEyi bırakır — operatörün yeni eklediği, henüz
    // çevrilmemiş ürünün gerçek hâli budur ve ürün formundaki "çeviri eksik" uyarısı ancak böyle koşar.
    const tamAd: LocalizedText = ceviri?.name ?? { tr: ad, fr: ad, de: ad };
    const tamAciklama: LocalizedText | null = ceviri?.description ?? (p.description ? { tr: p.description, fr: p.description, de: p.description } : null);
    const name: LocalizedText = dilEksik ? { tr: tamAd.tr } : tamAd;
    const aciklama: LocalizedText | null = tamAciklama ? (dilEksik ? { tr: tamAciklama.tr } : tamAciklama) : null;

    // Kapak GERÇEK görselden; R2 ayarsızsa null döner ve kayıt görselsiz oluşur (graceful).
    const kapakUrl = kapaksiz ? null : p.imageUrls[0];
    const imageKey = kapakUrl ? await uploadImageFromUrl(kapakUrl, r2Keys.productImage(p.slug, kapakUrl.split('/').pop() || 'cover.webp')) : null;

    // ── YAYINA HAZIR MI (05.36) ─────────────────────────────────────────────────────────────────
    // Ölçüt `hasAllLocales` — `has_all_locales(jsonb)` kısıtının TS karşılığı, elle yeniden
    // yazılmıyor. Beyan alanları (`ingredients`/`storage_instructions`) burada dolaylı sınanıyor:
    // ikisi de `beyanEksik`/türetme kapalıyken `null` yazılıyor ve kısıt onları da arıyor.
    //
    // **`imageAlt` yok** — kısıt onu aramıyor (formda alanı da yok, boşsa ürün adına düşüyor;
    // gerekçe `0005` kısıt künyesinde).
    const yayinaHazirDegil =
      !hasAllLocales(name) || !hasAllLocales(aciklama) || beyanEksik || (!beyan && !turetmeSerbest);
    const durum: ProductStatus = satilabilirDurum({ teklifli, kurguda, zayifVeri, aileli, kusurlu, yayinaHazirDegil, i });

    const { product, variants } = await products.create({
      name,
      description: aciklama,
      categoryId: catId.get(p.category ?? '') ?? null,
      imageKey,
      imageUpdatedAt: imageKey ? NOW : null,
      allergens: beyanEksik ? [] : alerjenler,
      // İz: nadir alerjenler buradan dolaşır (künyesi `NADIR_IZLER`'de). Ürünün ZATEN içerdiği bir
      // alerjen ize yazılmaz — "içerir" demişken "bulunabilir" demek, aynı şeyi iki kez ve daha
      // zayıf söylemektir. **Belgesi olan üründe iz de belgeden**, dağıtımdan değil.
      traces: beyan
        ? spekAlerjen(beyan.traces).filter((a) => !alerjenler.includes(a))
        : beyanEksik || !turetmeSerbest
          ? []
          : (NADIR_IZLER[i % NADIR_IZLER.length] ?? []).filter((a) => !alerjenler.includes(a)),
      ingredients: beyan?.ingredientsEU ? ucDile(beyan.ingredientsEU) : beyanEksik || !turetmeSerbest ? null : icindekiler(alerjenler),
      // Hazırlama önerisi varsa saklama metnine EKLENİR: kolon zaten ikisini birden taşıyor
      // ("saklama/hazırlama metni") ve belgede ayrı duran iki cümlenin ekranda ayrı yeri yok.
      storageInstructions: beyan?.storage
        ? ucDile(beyan.cookingTips ? `${beyan.storage} ${beyan.cookingTips}` : beyan.storage)
        : beyanEksik || !turetmeSerbest
          ? null
          : rejim.metin,
      nutrition: beyan?.nutritionPer100g ?? (beyanEksik || !turetmeSerbest ? null : besinDegeri(p.category, i)),
      // **KDV oranı ürün ADINDAN tahmin ediliyordu** (`HAZIR_TUKETIM` regex'i → %10). Vergi
      // sınıflandırması bir tahmin işi değil: yanlışı yasal sonuç doğurur. Türetme kapalıyken alan
      // hiç yazılmaz ve kolonun varsayılanı (%5,5 — Fransa gıda KDV'si) geçerli olur.
      vatRate: turetmeSerbest ? (HAZIR_TUKETIM.test(ad) ? KDV_HAZIR : KDV_GIDA) : undefined,
      // Raf ömrü belgede AY cinsinden; kolon gün tutuyor. Boşluk (`rafOmruYok`) gerçek veriyi
      // silmemek için burada da devre dışı — gerekçesi `beyanEksik` satırının aynısı.
      shelfLifeDays: beyan?.shelfLifeMonths
        ? beyan.shelfLifeMonths * 30
        : rafOmruYok || !turetmeSerbest
          ? undefined
          : (RAF_OMRU[p.category ?? ''] ?? 180),
      // Kargo izni SAKLAMA REJİMİNDEN türer, ayrı yazılmaz — gerekçe `SAKLAMA` künyesinde.
      // **Belgesi olan üründe rejim metnin kendisinden okunur:** "-18°C" yazan bir ürün donuktur ve
      // kategoriden türetilmiş tahminin ne dediği önemsizdir. Kaynağın cümlesi tahmini yener.
      // Türetme kapalıyken kolonun varsayılanı (`false`) kalır — "bilmiyoruz" donuk gıdada "hayır".
      shippable: beyan?.storage ? !BEYAN_DONUK.test(beyan.storage) : beyanEksik || !turetmeSerbest ? false : rejim.shippable,
      // ── SOĞUK ZİNCİR İŞARETİ (16.08 · `product.storage_type`) ──────────────────────────────
      // Sıra `shippable`ınkiyle aynı ve bilinçli: **belge tahmini yener.** Belgesi olan altı ürün
      // gerçek cümlesinden `frozen` alır — bu, `base` katmanına da giden GERÇEK veridir.
      // Belgesi olmayanda alan `base`de HİÇ YAZILMAZ: kaynakta o ürünün nasıl saklandığına dair
      // kanıt yok ve kolonun varsayılanı zaten güvenli tarafta (`frozen` — 0005 künyesi). Uydurmak
      // yerine varsayılanı bırakmak, "biliyoruz" ile "varsayıyoruz"u ayırt edilebilir tutuyor.
      // `extend`ten itibaren rejim sözlüğü konuşur ve üç değer de doğar (ekranların sınanması için).
      storageType: beyan?.storage
        ? BEYAN_DONUK.test(beyan.storage)
          ? 'frozen'
          : undefined
        : turetmeSerbest
          ? rejim.storageType
          : undefined,
      targetMarginPercent: marjYok || !turetmeSerbest ? undefined : 30 + (i % 6) * 3,
      autoPrice: turetmeSerbest && i % 4 === 0,
      status: durum,
      sortOrder: startOrder + i,
      variants: p.variants.map((v, n) => ({
        // Boysuz ürün tek varsayılan varyant taşır — modelin kendi kuralı.
        label: v.label ?? { tr: 'Tek boy', fr: 'Taille unique', de: 'Einheitsgröße' },
        // ── AĞIRLIKSIZ VARYANT ARTIK BİLİNÇLİ BİR BOŞLUK (19.08) ────────────────────────────
        // Eskiden kendiliğinden doğuyordu: 12 varyantın gramajı boştu. Basılı katalogdaki sayılar
        // üretece bağlanınca (05.31) **175 varyantın hepsi boyunu aldı** ve kapsam denetimi haklı
        // olarak kırmızıya döndü — "ağırlıksız varyant" hâli hiç doğmuyordu.
        //
        // Hâl GERÇEK ve korunmalı: `net_weight_g` nullable ve operatör ürün formundan elle ürün
        // açarken boş bırakabiliyor. Ekranlar bunu karşılamak zorunda (boy etiketi, kilo fiyatı,
        // kargo hesabı) ve karşılayıp karşılamadıkları ancak böyle bir satırla sınanır.
        //
        // **Yalnız `extend`+ ve yalnız ADAY üründe:** `base` gerçek veridir, orada boş gramaj
        // uydurma bir eksiklik olurdu. Ölçüt eskiden "teklifsiz" idi ve VİTRİNE bozuk kart
        // düşürüyordu (ölçüldü 19.08): gramajı olmayan varyantın fiyatı da hesaplanamıyor
        // (`pricing.ts` nöbeti), yani `Peynirli Adana Böreği` satıştaki bir ürün olarak doğup
        // alınamaz kart oluyordu. Aday üründe aynı hâl vitrini hiç kirletmiyor — aday zaten
        // satılabilir katalogda değil, keşif bölümünde.
        netWeightG: kusurlu && durum === 'candidate' && i % 37 === 0 && n === 0 ? undefined : (v.netWeightG ?? undefined),
        piecesCount: v.piecesCount ?? undefined,
        portionKind: v.portionKind ?? undefined,
        sku: v.sku ?? undefined,
        // **"Bu boy satıştan kalktı"** (kapsam denetimi 09.08) — kendi başına küçük bir alan ama
        // BÜYÜK bir kuralın tek tetikleyicisi: pasif varyant, o varyantı taşıyan PAKETİ
        // `listSellable`'dan tamamen düşürür (detay sayfası da 404). O kural bu hâl seed'de hiç
        // doğmadığı için bugüne dek hiç koşmadı.
        //
        // **Yalnız ÇOK BOYLU üründe ve son boyda:** tek varyantlı ürünün tek boyunu kapatmak, ürünü
        // satılamaz hâlde bırakır — gerçekte o karar `status: 'passive'` ile verilir, boy
        // kapatmakla değil. İki farklı niyeti aynı veriyle anlatmak, ekranda ikisini de okunmaz kılar.
        isActive: kusurlu && p.variants.length > 1 && n === p.variants.length - 1 && i % 11 === 0 ? false : undefined,
      })),
    });
    made += 1;
    varyantSayisi += variants.length;

    // ── GALERİ TAVANI UYGULAMADAN GELİR (05.14 · operasyon notu 08.08) ───────────────────────
    // Kaynakta tavan yok, uygulamada var (`PRODUCT_GALLERY_MAX`) — operasyon formu altıncı
    // fotoğrafı REDDEDİYOR. Seed sınırsız yazsaydı, formun KURAMAYACAĞI bir kayıt üretirdi:
    // operatör ürünü açar, fotoğrafı silmeden kaydedemez ve sebebini anlamaz.
    //
    // 08.08'de "bugün en kabarık ürün tam tavanda" diye kayda geçmişti; **adet birleşmesiyle
    // (09.08) tavan AŞILDI** — dört baklava kaydı tek ürüne inince görselleri de birleşti ve
    // `baklava-with-pistachio` 7 görsele çıktı (ölçüldü). Yani risk teorik değil, gerçekleşti.
    //
    // Sabit `@lezzet/types`'tan geliyor, burada yeniden yazılmıyor: ikinci bir sayı, bir gün
    // formunkinden ayrılırdı.
    for (const [n, url] of p.imageUrls.slice(1, 1 + PRODUCT_GALLERY_MAX).entries()) {
      const key = await uploadImageFromUrl(url, r2Keys.productImage(`${p.slug}-${n + 2}`, url.split('/').pop() || 'g.webp'));
      if (!key) continue;
      await images.insert({ productId: product.id, imageKey: key, sortOrder: n, imageUpdatedAt: NOW, imageFocalX: 50, imageFocalY: 50, imageZoom: 100 });
      photos += 1;
    }
    urunIdBySlug.set(p.slug, product.id);
  }

  const aileler = await aileleriKur(families, products, urunIdBySlug);

  return { made, photos, variants: varyantSayisi, families: aileler };
}

// ── ÜRÜN AİLELERİ (05.15 · nihai kürasyon 16.08) ─────────────────────────────
// Gerçek katalogda aileler ZATEN VAR ve uydurmaya gerek yok: *"E-Shaped Börek with Cheese / Meat /
// Potato / Spinach & Cheese"* tam olarak bir ailedir — aynı ürünün dolgusu değişiyor. Aynı desen
// Gül Böreği, Mini Rulo ve daha birçok dalda tekrarlanıyor.
//
// **Bir zamanlar addan TÜRETİLİYORDU; artık elle listeleniyor** (`ELLE_AILELER` künyesi). Gerekçe
// orada: ürün adları çevrildiği anda `"X with Y"` deseni çöker ve aileler habersiz dağılırdı.
// Türetici (`aileParcala`) bu yüzden silindi — arkasında kalan tek şey aşağıdaki dolgu sözlüğü,
// çünkü etiketin çevirisi hâlâ gerekli.

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
  olive: { tr: 'Zeytinli', fr: 'Olives', de: 'Oliven' },
  vegetable: { tr: 'Sebzeli', fr: 'Légumes', de: 'Gemüse' },
  // Sıfat-önde ailelerin çeşitleri (kek · cheesecake · dondurma).
  lemon: { tr: 'Limonlu', fr: 'Citron', de: 'Zitrone' },
  mango: { tr: 'Mangolu', fr: 'Mangue', de: 'Mango' },
  strawberry: { tr: 'Çilekli', fr: 'Fraise', de: 'Erdbeere' },
  raspberry: { tr: 'Frambuazlı', fr: 'Framboise', de: 'Himbeere' },
  'toffee caramel': { tr: 'Karamelli', fr: 'Caramel', de: 'Karamell' },
  caramel: { tr: 'Karamelli', fr: 'Caramel', de: 'Karamell' },
  cocoa: { tr: 'Kakaolu', fr: 'Cacao', de: 'Kakao' },
  plain: { tr: 'Sade', fr: 'Nature', de: 'Natur' },
  // ── Baklava çeşitleri ──────────────────────────────────────────────────────
  // Şekil adları ÇEVRİLİR (midye · kare), yer ve tarif adları çevrilMEZ: "Sobiyet" ile "Antep"
  // Fransızcada da Sobiyet ve Antep'tir — çevirmek ürünü tanınmaz yapardı.
  assorted: { tr: 'Karışık', fr: 'Assorti', de: 'Gemischt' },
  mussel: { tr: 'Midye', fr: 'Moule', de: 'Muschel' },
  square: { tr: 'Kare', fr: 'Carré', de: 'Quadrat' },
  sobiyet: { tr: 'Sobiyet', fr: 'Sobiyet', de: 'Sobiyet' },
  antep: { tr: 'Antep', fr: 'Antep', de: 'Antep' },
  'pistachio rolls': { tr: 'Fıstık sarma', fr: 'Roulé pistache', de: 'Pistazienrolle' },
  // ── Künefe · börek · fırın çeşitleri ───────────────────────────────────────
  classic: { tr: 'Klasik', fr: 'Classique', de: 'Klassisch' },
  plated: { tr: 'Tabaklı', fr: 'En assiette', de: 'Mit Teller' },
  special: { tr: 'Özel', fr: 'Spécial', de: 'Spezial' },
  wreathing: { tr: 'Burma', fr: 'Torsadé', de: 'Gedreht' },
  acma: { tr: 'Açma', fr: 'Açma', de: 'Açma' },
  sweet: { tr: 'Tatlı', fr: 'Sucré', de: 'Süß' },
  fermented: { tr: 'Ekşi mayalı', fr: 'Au levain', de: 'Sauerteig' },
  // ── Bütün pasta çeşitleri ──────────────────────────────────────────────────
  'black forest': { tr: 'Kara orman', fr: 'Forêt-Noire', de: 'Schwarzwälder' },
  'dark chocolate': { tr: 'Bitter çikolata', fr: 'Chocolat noir', de: 'Zartbitter' },
  profiterol: { tr: 'Profiterollü', fr: 'Profiterole', de: 'Profiterole' },
  latte: { tr: 'Latte', fr: 'Latte', de: 'Latte' },
  'red velvet': { tr: 'Kırmızı kadife', fr: 'Velours rouge', de: 'Roter Samt' },
  'pistachio garden': { tr: 'Fıstık bahçesi', fr: 'Jardin de pistaches', de: 'Pistaziengarten' },
  tiramisu: { tr: 'Tiramisu', fr: 'Tiramisu', de: 'Tiramisu' },
  // ── Meze ───────────────────────────────────────────────────────────────────
  hummus: { tr: 'Humus', fr: 'Houmous', de: 'Hummus' },
  saksuka: { tr: 'Şakşuka', fr: 'Şakşuka', de: 'Şakşuka' },
  'carrot tarator': { tr: 'Havuç tarator', fr: 'Tarator de carotte', de: 'Karotten-Tarator' },
  'tomato dip': { tr: 'Acılı domates', fr: 'Sauce tomate épicée', de: 'Scharfe Tomatensauce' },
  'eggplant yogurt': { tr: 'Yoğurtlu patlıcan', fr: 'Aubergine au yaourt', de: 'Aubergine mit Joghurt' },
  // ── Tavuk: baharat ve pişirme ekseni ───────────────────────────────────────
  spicy: { tr: 'Acılı', fr: 'Épicé', de: 'Scharf' },
  crispy: { tr: 'Çıtır', fr: 'Croustillant', de: 'Knusprig' },
  'crispy spicy': { tr: 'Çıtır acılı', fr: 'Croustillant épicé', de: 'Knusprig scharf' },
};

function dolguEtiketi(dolgu: string): LocalizedText {
  return DOLGU_SOZLUK[dolgu.toLowerCase()] ?? { tr: dolgu, fr: dolgu, de: dolgu };
}

/**
 * ── AİLELERİN TAMAMI ELLE LİSTELENİR (kullanıcı kararı 16.08: "nihai şeklini veriyoruz") ─────────
 *
 * **Addan türetme KALDIRILDI ve sebebi tek cümle: ürün adları çevriliyor.** `aileParcala` İngilizce
 * `"X with Y"` desenine bağlıydı; adlar Türkçeleşince ("Peynirli Su Böreği") o desen çöker ve
 * aileler HABERSİZ dağılırdı — hata vermeden, yalnız çeşit blokları ekrandan kaybolarak.
 *
 * Elle liste ayrıca kullanıcının istediği şeyi mümkün kılıyor: hangi ürünün hangi ürünle aile
 * olduğu **tek yerde, okunarak onaylanabilir** durumda. Türetme bunu yapamazdı — kuralı okuyup
 * sonucu zihinde canlandırmak gerekirdi.
 *
 * ⚠ Eski künyenin uyarısı hâlâ geçerli ve listeyi bu yüzden kısa tutmuyoruz, DOĞRU tutuyoruz:
 * bir kez "aynı uzunlukta, tek konumda ayrışan adlar aynı ailedendir" kuralı denenmişti ve
 * `Hummus | Lahmacun | Şakşuka | Tiramisu`yu tek aile yapmıştı. **Yanlış bir aile, ekranı çizen
 * ajana ve müşteriye kavramı yanlış öğretir.**
 *
 * **Ne aile OLMAZ:** paket biçimi (dökme/bulk, tepsi, kutu) ve porsiyon (dilim, bardak, mono) çeşit
 * değildir — onlar boy eksenidir ve varyanta aittir. "Vegan" da aile değildir: bir özelliktir,
 * çeşit değil; süzgeci ayrıca gelir.
 */
const ELLE_AILELER: Array<{ ad: string; uyeler: Array<{ slug: string; dolgu: string }> }> = [
  // ── FIRIN: dolgu ekseni ────────────────────────────────────────────────────
  {
    ad: 'E Böreği',
    uyeler: [
      { slug: 'e-shaped-borek-with-cheese', dolgu: 'Cheese' },
      { slug: 'e-shaped-borek-with-meat', dolgu: 'Meat' },
      { slug: 'e-shaped-borek-with-potato', dolgu: 'Potato' },
      { slug: 'e-shaped-borek-with-spinach-cheese', dolgu: 'Spinach & Cheese' },
    ],
  },
  {
    ad: 'Çubuk Börek',
    uyeler: [
      { slug: 'stick-borek-with-cheese', dolgu: 'Cheese' },
      { slug: 'stick-borek-with-meat', dolgu: 'Meat' },
      { slug: 'stick-borek-with-potato', dolgu: 'Potato' },
      { slug: 'stick-borek-with-spinach-cheese', dolgu: 'Spinach & Cheese' },
    ],
  },
  {
    ad: 'Gül Böreği',
    uyeler: [
      { slug: 'spiral-rose-borek-with-cheese', dolgu: 'Cheese' },
      { slug: 'spiral-rose-borek-with-meat', dolgu: 'Meat' },
      { slug: 'spiral-rose-borek-with-potato', dolgu: 'Potato' },
      { slug: 'spiral-rose-borek-with-spinach-cheese', dolgu: 'Spinach & Cheese' },
    ],
  },
  {
    ad: 'Kol Böreği',
    uyeler: [
      { slug: 'spiral-pie-borek-with-cheese', dolgu: 'Cheese' },
      { slug: 'spiral-pie-borek-with-potato', dolgu: 'Potato' },
      { slug: 'spiral-pie-borek-with-spinach-cheese', dolgu: 'Spinach & Cheese' },
    ],
  },
  {
    ad: 'Mini Rulo Börek',
    uyeler: [
      { slug: 'mini-roll-borek-with-cheese', dolgu: 'Cheese' },
      { slug: 'mini-roll-borek-with-spinach-cheese', dolgu: 'Spinach & Cheese' },
    ],
  },
  {
    ad: 'Mini Pide',
    uyeler: [
      { slug: 'mini-pide-with-cheese', dolgu: 'Cheese' },
      { slug: 'mini-pide-with-spinach-cheese', dolgu: 'Spinach & Cheese' },
    ],
  },
  {
    ad: 'Poğaça',
    uyeler: [
      { slug: 'plain-pastry', dolgu: 'Plain' },
      { slug: 'cheese-filled-pastry', dolgu: 'Cheese' },
      { slug: 'potato-filled-pastry', dolgu: 'Potato' },
      { slug: 'olive-filled-pastry', dolgu: 'Olive' },
    ],
  },
  {
    // Açma bir dolgu değil bir hamur biçimi, ama müşterinin gözünde aynı raftaki üç kardeş:
    // sade çörek, peynirli çörek, açma. Seçim ekseni tutarlı — "hangisini alayım" sorusu aynı.
    ad: 'Çörek',
    uyeler: [
      { slug: 'savoury-bun', dolgu: 'Plain' },
      { slug: 'savoury-bun-with-cheese', dolgu: 'Cheese' },
      { slug: 'savoury-bun-acma', dolgu: 'Acma' },
    ],
  },
  {
    ad: 'Simit',
    uyeler: [
      { slug: 'turkish-bagel-simit', dolgu: 'Classic' },
      { slug: 'sweet-turkish-bagel-simit', dolgu: 'Sweet' },
      { slug: 'turkish-fermented-bagel', dolgu: 'Fermented' },
    ],
  },
  {
    ad: 'Kalzone',
    uyeler: [
      { slug: 'cheese-calzone', dolgu: 'Cheese' },
      { slug: 'vegetable-calzone', dolgu: 'Vegetable' },
    ],
  },
  // ── TATLI ──────────────────────────────────────────────────────────────────
  {
    // Kullanıcı kararı 16.08: baklava İKİYE ayrılıyor. Buradakiler günlük çeşitler — müşterinin
    // "hangi baklava" sorusuna verdiği ilk cevap.
    ad: 'Baklava',
    uyeler: [
      { slug: 'baklava-with-pistachio', dolgu: 'Pistachio' },
      { slug: 'baklava-with-walnut', dolgu: 'Walnut' },
      { slug: 'chocolate-baklava', dolgu: 'Chocolate' },
      { slug: 'assorted-baklava', dolgu: 'Assorted' },
    ],
  },
  {
    // Özel baklavalar şekil ve tarifle ayrışıyor (sobiyet kaymaklı, midye kıvrımlı, kare dilimli).
    // Klasiklerle aynı blokta gösterilseler seçim on bir kartlık bir listeye dönerdi.
    ad: 'Özel Baklava',
    uyeler: [
      { slug: 'sobiyet-baklava', dolgu: 'Sobiyet' },
      { slug: 'mussel-baklava', dolgu: 'Mussel' },
      { slug: 'special-antep-baklava', dolgu: 'Antep' },
      { slug: 'special-square-baklava', dolgu: 'Square' },
      { slug: 'pistachio-rolls-baklava', dolgu: 'Pistachio Rolls' },
    ],
  },
  {
    ad: 'Soğuk Baklava',
    uyeler: [
      { slug: 'cold-baklava-with-pistachio', dolgu: 'Pistachio' },
      { slug: 'cold-baklava-with-walnut', dolgu: 'Walnut' },
    ],
  },
  {
    // Dökme (bulk) kalemler BİLEREK YOK: onlar toptan paket biçimi, çeşit değil.
    ad: 'Künefe',
    uyeler: [
      { slug: 'kunefe-including-syrup', dolgu: 'Classic' },
      { slug: 'kunefe-with-plate-and-syrup', dolgu: 'Plated' },
      { slug: 'special-kunefe', dolgu: 'Special' },
      { slug: 'wreathing-kunefe-including-syrup', dolgu: 'Wreathing' },
    ],
  },
  {
    // `tres-leches-caramel-cup` YOK: bardak porsiyonu boy eksenidir, çeşit değil.
    ad: 'Tres Leches',
    uyeler: [
      { slug: 'tres-leches-caramel', dolgu: 'Caramel' },
      { slug: 'tres-leches-raspberry', dolgu: 'Raspberry' },
    ],
  },
  // ── PASTA ──────────────────────────────────────────────────────────────────
  {
    ad: 'Artisan Kek',
    uyeler: [
      { slug: 'artisan-lemon-cake', dolgu: 'Lemon' },
      { slug: 'artisan-mango-cake', dolgu: 'Mango' },
      { slug: 'artisan-pistachio-cake', dolgu: 'Pistachio' },
      { slug: 'artisan-strawberry-cake', dolgu: 'Strawberry' },
    ],
  },
  {
    // Bütün pastalar tek ailede: müşteri "hangi bütün pastayı alayım" diye soruyor ve cevabın
    // tamamı burada. Dilim/bardak hâlleri AYRI ürün olarak duruyor — onlar boy değil, farklı
    // bir satış biçimi (kaynak öyle kurmuş) ve çeşit bloğunu kalabalıklaştırırlardı.
    ad: 'Bütün Pasta',
    uyeler: [
      { slug: 'black-forest-whole-cake', dolgu: 'Black Forest' },
      { slug: 'dark-chocolate-whole-cake', dolgu: 'Dark Chocolate' },
      { slug: 'dark-chocolate-profiterol-whole-cake', dolgu: 'Profiterol' },
      { slug: 'latte-whole-cake', dolgu: 'Latte' },
      { slug: 'red-velvet-whole-cake', dolgu: 'Red Velvet' },
      { slug: 'special-pistachio-garden-whole-cake', dolgu: 'Pistachio Garden' },
      { slug: 'tiramisu-whole-cake', dolgu: 'Tiramisu' },
    ],
  },
  // **`… Mono Pack` ürünleri BİLEREK AİLE YAPILMADI** (kullanıcı kararı 04.08). Bir tur ayrı bir
  // aile olarak kurulmuşlardı ve sonucu ölçüldü: limonlu kekin sayfasında üstte dört çeşit,
  // ALTTA "bunlarla da ilgilenebilirsiniz"de **aynı dört kek** tek porsiyonluk hâliyle çıkıyordu.
  // Modelde doğrusu bunların ayrı ürün değil aynı ürünün bir PAKET BOYU olmasıydı; kaynak katalog
  // öyle kurmadı ve bu bir test verisi, kaynağın kurgusunu düzeltmek seed'in işi değil.
  {
    ad: 'Kek Bardağı',
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
  // ── ANADOLU MUTFAĞI ────────────────────────────────────────────────────────
  {
    // Kullanıcı kararı 16.08. Beşi de aynı masada, aynı kullanımda — "yanına ne alsam" sorusunun
    // cevabı. **Vegan ürünler aile DEĞİL:** "vegan" bir çeşit değil bir özelliktir; çiğ köfte ile
    // falafeli aynı seçicide göstermek, ikisini birbirinin alternatifi sanmak olurdu.
    ad: 'Meze',
    uyeler: [
      { slug: 'hummus', dolgu: 'Hummus' },
      { slug: 'saksuka', dolgu: 'Saksuka' },
      { slug: 'carrot-tarator', dolgu: 'Carrot Tarator' },
      { slug: 'spicy-turkish-tomato-dip', dolgu: 'Tomato Dip' },
      { slug: 'eggplant-with-yogurt', dolgu: 'Eggplant Yogurt' },
    ],
  },
  // ── TAVUK: baharat ve pişirme ekseni ───────────────────────────────────────
  // Katalogda her kalemin sade ve acılı hâli ayrı ürün. Bu tam olarak bir çeşit eksenidir:
  // müşteri "acılı mı alsam" diye soruyor ve iki kart yan yana durmalı.
  {
    ad: 'Tavuk Fileto',
    uyeler: [
      { slug: 'chicken-tender-fillet', dolgu: 'Plain' },
      { slug: 'spicy-chicken-tender-fillet', dolgu: 'Spicy' },
    ],
  },
  {
    ad: 'Çıtır Tavuk Fileto',
    uyeler: [
      { slug: 'crispy-tender-fillet', dolgu: 'Crispy' },
      { slug: 'crispy-spicy-tender-fillet', dolgu: 'Crispy Spicy' },
    ],
  },
  {
    ad: 'Tavuk Kanat',
    uyeler: [
      { slug: 'crispy-chicken-wings', dolgu: 'Crispy' },
      { slug: 'crispy-spicy-chicken-wings', dolgu: 'Crispy Spicy' },
      { slug: 'spicy-chicken-wings', dolgu: 'Spicy' },
    ],
  },
  // ── DONDURMA ───────────────────────────────────────────────────────────────
  {
    ad: 'Maraş Dondurması',
    uyeler: [
      { slug: 'maras-ice-cream-plain', dolgu: 'Plain' },
      { slug: 'maras-ice-cream-cocoa', dolgu: 'Cocoa' },
      { slug: 'maras-ice-cream-pistachio', dolgu: 'Pistachio' },
    ],
  },
  {
    ad: 'Maraş Dondurma Dilimi',
    uyeler: [
      { slug: 'maras-ice-cream-slice-plain', dolgu: 'Plain' },
      { slug: 'maras-ice-cream-slice-cocoa', dolgu: 'Cocoa' },
      { slug: 'maras-ice-cream-slice-lemon', dolgu: 'Lemon' },
    ],
  },
];

/**
 * Bir aileye BAĞLANACAK ürünlerin slug'ları — satış durumu kararının okuduğu küme.
 *
 * Süzgeç `aileleriKur`unkinin aynısı ve öyle kalmalı: tek üyeli satır aile KURMUYOR, dolayısıyla o
 * ürün ailesizdir ve aday olabilir. İki yerde iki farklı süzgeç olsaydı, tek üyeli bir satır burada
 * "aileli" sayılıp satışa açılır ama ekranda çeşit bloğu yine çizilmezdi — sebebi görünmeyen bir hâl.
 */
const AILE_UYESI_SLUG: ReadonlySet<string> = new Set(
  ELLE_AILELER.filter((a) => a.uyeler.length >= 2).flatMap((a) => a.uyeler.map((u) => u.slug)),
);

/**
 * Aynı tabanı paylaşan **iki ya da daha çok** ürünü bir aileye bağlar.
 *
 * Tek üyeli grup aile SAYILMAZ: bir çeşidi olan ürün ailesizdir ve ekranda çeşit bloğu hiç
 * çizilmez (brief §1b). Veri buna izin verirdi ama seed'in gerçekçi olması gerekiyor.
 */
async function aileleriKur(
  families: ProductFamilyService,
  products: ProductService,
  urunIdBySlug: Map<string, string>,
): Promise<number> {
  // **Liste ARTIK TEK KAYNAK** (16.08): addan türetme kaldırıldı, künyesi `ELLE_AILELER`'de.
  // Tek üyeli aile yine kurulmaz — bir çeşidi olan ürün ailesizdir ve ekranda çeşit bloğu hiç
  // çizilmez (brief §1b). Listede tek üyeli bir aile kalırsa bu bir yazım hatasıdır, süzülür.
  const kurulacak = ELLE_AILELER.filter((a) => a.uyeler.length >= 2);

  // **Üyesi katalogda BULUNAMAYAN satır sessiz geçmez.** Liste elle yazılıyor ve katalog
  // değişebiliyor; tutmayan bir slug o çeşidi ekrandan sessizce düşürür — aile yine kurulur,
  // yalnız bir kartı eksik olur, ki bu ancak sayılırsa fark edilir.
  const eksikler = kurulacak.flatMap((a) => a.uyeler.filter((u) => !urunIdBySlug.has(u.slug)).map((u) => `${a.ad} → ${u.slug}`));
  if (eksikler.length > 0) console.log(`  ⚠ aile üyesi katalogda yok (${eksikler.length}): ${eksikler.join(' · ')}`);

  let kurulan = 0;
  for (const { ad: taban, uyeler } of kurulacak) {
    // Aile adı TEK DİLLİ: yalnız operatör görüyor (kullanıcı kararı 04.08).
    // **Son aile PASİF** (kapsam denetimi 09.08): üyeleri satışta kalır ama "Çeşitler" bloğu
    // çizilmez (0004 künyesi). Silmek yerine pasifleştirme kuralının tek sınanma yeri burası.
    const aile = await families.insert({ name: taban, isActive: kurulan < kurulacak.length - 1 });
    for (const [sira, uye] of uyeler.entries()) {
      const id = urunIdBySlug.get(uye.slug);
      if (!id) continue;
      await products.update({ id, familyId: aile.id, familyLabel: dolguEtiketi(uye.dolgu), familyPosition: sira });
    }
    kurulan += 1;
  }
  return kurulan;
}
