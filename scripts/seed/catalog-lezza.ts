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
  /** Paket içi adet (`(12 Pieces)` · `4x80g`). `null` = bildirilmemiş — sıfır DEĞİL. */
  piecesCount: number | null;
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
  categories: Array<{ key: string; name: LocalizedText; imageUrl: string | null }>;
  products: LezzaProduct[];
}

const DATA = join(dirname(fileURLToPath(import.meta.url)), 'data/lezza-catalog.json');

function readLezzaCatalog(): LezzaCatalog {
  return JSON.parse(readFileSync(DATA, 'utf8')) as LezzaCatalog;
}

/**
 * Koleksiyon/paket KAPAKLARI için: ürün slug'ı → kaynak kapak URL'i (JSON'dan, DB'siz).
 * Kapaklar da gerçek üründen gelir (kullanıcı kararı 08.08) — temp örnek dosyalar kalktı; ürünün
 * DB'deki `image_key`i kopyalanMAZ: iki kayıt aynı anahtara işaret etseydi, ürün kapağı değişince
 * koleksiyon kapağı da sessizce değişirdi (sürpriz bağ). Herkes kendi anahtarına yükler.
 */
export function lezzaGorselBySlug(): Map<string, string> {
  return new Map(readLezzaCatalog().products.flatMap((p) => (p.imageUrls[0] ? [[p.slug, p.imageUrls[0]] as const] : [])));
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

/**
 * Kategori ALTYAZILARI (05.17 · kullanıcı kararı 08.08) — mobil vitrin bandının ikinci satırı,
 * web kullanımı tasarım kararına açık. Metinler EDİTORYAL fikstürdür: operatör Katalog ekranından
 * değiştirir (üç dilli form + AI çeviri önerisi); buradaki değer ilk kurulumun cümlesi, sözleşme
 * değil. Boş bırakılan kategori altyazısız çizilir — yedek metin uydurulmaz.
 */
const KATEGORI_TAGLINE: Record<string, LocalizedText> = {
  bakery: { tr: 'Börekler ve el açması hamur işleri', fr: 'Böreks et pâtisseries salées', de: 'Börek und handgemachtes Gebäck' },
  dessert: { tr: 'Baklavadan sütlü tatlıya', fr: 'Du baklava aux desserts lactés', de: 'Von Baklava bis Milchdessert' },
  cake: { tr: 'Dilim ve bütün pastalar', fr: 'Gâteaux entiers et en parts', de: 'Torten im Ganzen und in Stücken' },
  chicken: { tr: 'Pişirmeye hazır tavuk', fr: 'Volaille prête à cuire', de: 'Küchenfertiges Geflügel' },
  'ice-cream': { tr: 'Maraş usulü dondurma', fr: 'Glace façon Maraş', de: 'Eis nach Maraş-Art' },
  anatolian: { tr: 'Sofraya hazır Anadolu yemekleri', fr: 'Plats anatoliens prêts à servir', de: 'Anatolische Gerichte, servierfertig' },
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

const SAKLAMA: Record<SaklamaRejimi, { metin: LocalizedText; shippable: boolean }> = {
  // Donuk ama kargolanabilir: yalıtımlı kutu 24-48 saatlik yolu kaldırır — kataloğun ana kütlesi.
  donuk: {
    metin: {
      tr: '−18 °C’de saklayın. Çözdürdükten sonra **tekrar dondurmayın**; 24 saat içinde tüketin.',
      fr: 'Conserver à −18 °C. **Ne pas recongeler** après décongélation ; à consommer sous 24 heures.',
      de: 'Bei −18 °C lagern. Nach dem Auftauen **nicht wieder einfrieren**; innerhalb von 24 Stunden verzehren.',
    },
    shippable: true,
  },
  // Kesintisiz soğuk zincir: çözülmeyi hiç kaldırmaz, kendi aracımızla gider. Dondurmanın rejimi.
  'soguk-zincir': {
    metin: {
      tr: '−18 °C’de, **kesintisiz soğuk zincirde** saklayın. Kısmi çözülme ürünü bozar; kargoyla gönderilmez.',
      fr: 'Conserver à −18 °C en **chaîne du froid ininterrompue**. Une décongélation partielle altère le produit ; non expédiable.',
      de: 'Bei −18 °C in **ununterbrochener Kühlkette** lagern. Teilweises Auftauen verdirbt das Produkt; kein Versand.',
    },
    shippable: false,
  },
  // Soğutulmuş (0-4 °C), kısa raf ömrü: yolda geçen saat doğrudan tazelikten düşer.
  sogutulmus: {
    metin: {
      tr: '**0-4 °C**’de buzdolabında saklayın. Dondurmayın; ambalajı açıldıktan sonra 48 saat içinde tüketin.',
      fr: 'Conserver au réfrigérateur entre **0 et 4 °C**. Ne pas congeler ; à consommer sous 48 heures après ouverture.',
      de: 'Im Kühlschrank bei **0-4 °C** lagern. Nicht einfrieren; nach dem Öffnen innerhalb von 48 Stunden verzehren.',
    },
    shippable: false,
  },
  // Rafta duran kuru ürün (kuru baklava, simit, kuru pasta): oda sıcaklığı, kargonun en kolayı.
  raf: {
    metin: {
      tr: '**Serin ve kuru** yerde, oda sıcaklığında saklayın. Doğrudan güneş ışığından uzak tutun.',
      fr: 'Conserver dans un endroit **frais et sec**, à température ambiante. Tenir à l’abri du soleil.',
      de: 'An einem **kühlen, trockenen** Ort bei Raumtemperatur lagern. Vor direkter Sonne schützen.',
    },
    shippable: true,
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
  const sonKategoriler = katalog.categories.length - 1;
  for (const [k, c] of katalog.categories.entries()) {
    if (catId.has(c.key)) continue;
    const kapaksiz = k === sonKategoriler; // baş-harf yedeği bu kayıtta denenir
    const altyazisiz = k === sonKategoriler - 1; // altyazısız kategori altyazısız çizilir (05.17)
    const vitrinDisi = k >= sonKategoriler - 1; // ızgara 6 slot; ikisi dışarıda kalsın
    // `create` girdisi bilinçli dar (ad + sıra); tagline ve vitrin işareti update ile — aile
    // bağının `products.update` emsali. Tek çağrıda: ikisi de aynı ilk-kurulum kararının parçası.
    const created = await categories.create({ name: c.name });
    await categories.update({
      id: created.id,
      tagline: altyazisiz ? null : (KATEGORI_TAGLINE[c.key] ?? null),
      isFeatured: !vitrinDisi,
    });
    catId.set(c.key, created.id);
    if (c.imageUrl && !kapaksiz) {
      const key = await uploadImageFromUrl(c.imageUrl, r2Keys.categoryImage(created.slug, c.imageUrl.split('/').pop() || 'cover.webp'));
      if (key) await categories.setImageKey(created.id, key);
    }
  }

  // **PASİF kategori** — ayrı ve EK bir kayıt, gerçek altısından biri kapatılarak DEĞİL: pasif
  // kategori ürünlerini de katalogdan düşürür, yani gerçek bir kategoriyi kapatmak 20-30 ürünü
  // vitrinden silerdi. Sezonluk kategori gerçek bir operasyon hâlidir (yılın on ayı kapalı durur).
  const sezonluk = await categories.create({
    name: { tr: 'Ramazan Sofrası', fr: 'Table du Ramadan', de: 'Ramadan-Tafel' },
  });
  await categories.update({ id: sezonluk.id, isActive: false, isFeatured: false });

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
    // **Künyesi eksik ürün** (kapsam denetimi 09.08) — ikisi de ayrı bir EKRAN hâli, ayrı sebep:
    //   raf ömrü yok  → "kalan %" hesaplanamaz; parti kartı o çubuğu HİÇ basmamalı
    //   hedef marj yok → marj uyarısı hesaplanamaz; "uyarı yok" ile "veri yok" aynı şey değil
    // Operatörün gerçekte unuttuğu iki alan bunlar; ikisi de zorunlu değil ve boş kalabiliyor.
    const rafOmruYok = i % 31 === 0;
    const marjYok = i % 37 === 0;

    // Saklama rejimi TEK KAYNAK: metin de kargo izni de buradan çıkar, ikisi ayrışamaz.
    // **Beyansız ürün kargolanmaz** ve bu, kolonun yeni varsayılanının (`false`) tam olarak
    // anlatmak istediği şey: beyanı olmayan bir üründe "kargolanabilir mi" sorusunun cevabı
    // "bilmiyoruz"dur ve donuk gıdada bilinmeyen, "evet" değil "hayır" sayılır.
    const rejim = SAKLAMA[saklamaRejimi(p.category ?? null, i)];

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
      storageInstructions: beyanEksik ? null : rejim.metin,
      nutrition: beyanEksik ? null : besinDegeri(p.category, i),
      vatRate: HAZIR_TUKETIM.test(ad) ? KDV_HAZIR : KDV_GIDA,
      shelfLifeDays: rafOmruYok ? undefined : (RAF_OMRU[p.category ?? ''] ?? 180),
      // Kargo izni SAKLAMA REJİMİNDEN türer, ayrı yazılmaz — gerekçe `SAKLAMA` künyesinde.
      shippable: beyanEksik ? false : rejim.shippable,
      targetMarginPercent: marjYok ? undefined : 30 + (i % 6) * 3,
      autoPrice: i % 4 === 0,
      status: durum,
      sortOrder: startOrder + i,
      variants: p.variants.map((v, n) => ({
        // Boysuz ürün (bütün pastalar) tek varsayılan varyant taşır — modelin kendi kuralı.
        label: v.label ?? { tr: 'Tek boy', fr: 'Taille unique', de: 'Einheitsgröße' },
        netWeightG: v.netWeightG ?? undefined,
        piecesCount: v.piecesCount ?? undefined,
        sku: v.sku ?? undefined,
        // **"Bu boy satıştan kalktı"** (kapsam denetimi 09.08) — kendi başına küçük bir alan ama
        // BÜYÜK bir kuralın tek tetikleyicisi: pasif varyant, o varyantı taşıyan PAKETİ
        // `listSellable`'dan tamamen düşürür (detay sayfası da 404). O kural bu hâl seed'de hiç
        // doğmadığı için bugüne dek hiç koşmadı.
        //
        // **Yalnız ÇOK BOYLU üründe ve son boyda:** tek varyantlı ürünün tek boyunu kapatmak, ürünü
        // satılamaz hâlde bırakır — gerçekte o karar `status: 'passive'` ile verilir, boy
        // kapatmakla değil. İki farklı niyeti aynı veriyle anlatmak, ekranda ikisini de okunmaz kılar.
        isActive: p.variants.length > 1 && n === p.variants.length - 1 && i % 11 === 0 ? false : undefined,
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

  // Kurulacak aileler ÖNCE süzülür: `gruplar` tek üyelileri de taşıyor ve onlar aile olmuyor.
  // İlk yazımda "sonuncusu pasif" ölçütü `gruplar.size`e bakıyordu ve hiç tutmuyordu — ölçüldü
  // (`seed:coverage`: "aile pasif" kovası boş kaldı). Süzülmüş liste üzerinden saymak tek doğru yol.
  const kurulacak = [...gruplar].filter(([, uyeler]) => uyeler.length >= 2);

  let kurulan = 0;
  for (const [taban, uyeler] of kurulacak) {
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
