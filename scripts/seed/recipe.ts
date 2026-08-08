import { ProductService, RecipeService } from '@lezzet/database';
import { resolveLocalizedText, type LocalizedText } from '@lezzet/types';
import { tabloDolu, type Db } from './shared';

/**
 * **TARİF seed'i — "Sofradan Fikirler"** (05.16 · müşteri yüzeyi 08.24 · yönetim 09.21).
 *
 * ── TARİF BİR YEMEK KİTABI DEĞİL, BİR SOFRA FİKRİ ───────────────────────────
 * Kataloğumuz hazır ürünlerden oluşuyor (börek, künefe, baklava) — un ve tereyağı satmıyoruz.
 * O yüzden tarifler "sıfırdan pişirme" değil **kurma** tarifleri: hangi ürünler bir araya gelince
 * bir sofra oluyor, nasıl ısıtılıyor, yanına evden ne konuyor. Tasarımın üçüncü kartı da tam olarak
 * bunu çiziyor (*"Sigara böreği, zeytinli açma ve Ezine peyniriyle kalabalık pazar sofrası"*).
 *
 * ── ÜÇÜ YAYINDA, BİRİ TASLAK — VE TASLAK BİLEREK ────────────────────────────
 * Seed'in kendi disiplini: gerçek veri boşluk taşımaz, yani hiçbir şey yapmazsak **yayın kapısı
 * hiç denenemez** (`catalog-lezza.ts` künyesi aynı gerekçeyle boşluk serpiştiriyor). Dördüncü tarif
 * yalnız Türkçe yazılmış — operasyon ekranında *"Yayınlanamaz: FR, DE dilinde ad yok"* cümlesi
 * ancak böyle bir satır varsa görünür. Müşteri yüzeyinde ise görünmemesi gerekiyor ve bu da
 * denenebilir hâle geliyor.
 *
 * ── GÖRSEL YOK ve bu bir eksik değil, SIRA ──────────────────────────────────
 * `r2Keys`te tarif anahtarı henüz yok (`docs/talep/arka-uc-tarif-gorseli-r2-anahtari.md`).
 * Anahtar geldiğinde yükleme buraya bir satırla girer (paket emsali: create'ten SONRA, slug
 * kesinleştikten sonra). O güne dek kartlar görselsiz çiziliyor — `FramedImage` boş çerçeveyi
 * zaten taşıyor, yani ekran bozulmuyor.
 */

interface SeedRecipeItem {
  /** Katalog SKU'su — seed'de deterministik (paket seed'iyle aynı köprü). */
  sku: string;
  qty: number;
}

interface SeedRecipe {
  name: LocalizedText;
  description: LocalizedText;
  duration: LocalizedText;
  serves: LocalizedText;
  meal: LocalizedText;
  /** Satır = adım (05.16). Numarayı ekran verir, metin taşımaz. */
  steps: LocalizedText;
  /** Satır = madde. Bunlar bizim ürünümüz DEĞİL — sepete eklenmez. */
  pantry: LocalizedText;
  isActive: boolean;
  items: SeedRecipeItem[];
}

const RECIPES: SeedRecipe[] = [
  {
    name: {
      tr: 'Çıtır Pazar Kahvaltısı',
      fr: 'Brunch croustillant du dimanche',
      de: 'Knuspriges Sonntagsfrühstück',
    },
    description: {
      tr: 'El açması börek, mini pide ve su böreğiyle kalabalık bir pazar sofrası — fırın çalışırken sofrayı kurun.',
      fr: 'Une grande tablée du dimanche : böreks faits main, mini pides et su börek — dressez la table pendant que le four travaille.',
      de: 'Eine große Sonntagstafel: handgemachte Börek, Mini-Pide und Su Börek — decken Sie den Tisch, während der Ofen arbeitet.',
    },
    duration: { tr: '35 dk', fr: '35 min', de: '35 Min.' },
    serves: { tr: '4–5 kişilik', fr: 'Pour 4–5 personnes', de: 'Für 4–5 Personen' },
    meal: { tr: 'Kahvaltı', fr: 'Petit-déjeuner', de: 'Frühstück' },
    steps: {
      tr: "Fırını 180 °C'ye ısıtın; börekleri ve mini pideleri tepsiye aralıklı dizin.\nDondurucudan çıktığı gibi 20–25 dakika, üzerleri altın rengi olana dek pişirin — çözdürmeyin, hamur sulanır.\nSu böreğini son 10 dakikada ekleyin; ince yufkası daha çabuk kızarır.\nFırın çalışırken sofrayı kurun: zeytin, domates, salatalık, demlik çay. Börekleri sıcakken servis edin.",
      fr: "Préchauffez le four à 180 °C ; disposez les böreks et les mini pides espacés sur la plaque.\nEnfournez-les tels quels, sortis du congélateur, 20–25 minutes jusqu'à ce qu'ils soient dorés — ne les décongelez pas, la pâte rendrait de l'eau.\nAjoutez le su börek dans les 10 dernières minutes ; sa pâte fine dore plus vite.\nDressez la table pendant la cuisson : olives, tomates, concombre, thé en théière. Servez les böreks bien chauds.",
      de: 'Heizen Sie den Ofen auf 180 °C vor; legen Sie Börek und Mini-Pide mit Abstand auf das Blech.\nBacken Sie sie direkt aus dem Gefrierfach 20–25 Minuten goldbraun — nicht auftauen, sonst wird der Teig wässrig.\nGeben Sie das Su Börek in den letzten 10 Minuten dazu; sein dünner Teig bräunt schneller.\nDecken Sie währenddessen den Tisch: Oliven, Tomaten, Gurke, Tee aus der Kanne. Servieren Sie die Börek heiß.',
    },
    pantry: {
      tr: 'Siyah ve yeşil zeytin\nDomates, salatalık\nDemlik çay\nTereyağı',
      fr: 'Olives noires et vertes\nTomates, concombre\nThé en théière\nBeurre',
      de: 'Schwarze und grüne Oliven\nTomaten, Gurke\nTee aus der Kanne\nButter',
    },
    isActive: true,
    items: [
      { sku: '700901', qty: 1 },
      { sku: '701221', qty: 1 },
      { sku: '700401', qty: 1 },
    ],
  },
  {
    name: { tr: 'Künefe Sofrası', fr: 'La table à künefe', de: 'Künefe-Tafel' },
    description: {
      tr: 'Şerbeti kutusunda gelen künefe: fırında on beş dakika, üstüne fıstık, yanına kaymak.',
      fr: 'Le künefe arrive avec son sirop : quinze minutes au four, pistaches dessus, kaymak à côté.',
      de: 'Künefe kommt mit seinem Sirup: fünfzehn Minuten im Ofen, Pistazien darüber, Kaymak dazu.',
    },
    duration: { tr: '20 dk', fr: '20 min', de: '20 Min.' },
    serves: { tr: '2 kişilik', fr: 'Pour 2 personnes', de: 'Für 2 Personen' },
    meal: { tr: 'Tatlı', fr: 'Dessert', de: 'Dessert' },
    steps: {
      tr: 'Künefeyi tepsisiyle birlikte 200 °C fırına verin; üstü kızarana dek 12–15 dakika pişirin.\nKutusundan çıkan şerbeti ısıtmadan, sıcak künefenin üzerine gezdirin — sıcak şerbet hamuru ağırlaştırır.\nBeş dakika dinlendirin, şerbet çekilsin.\nÜzerine dövülmüş antep fıstığı serpin; yanına kaymak koyup sıcak servis edin.',
      fr: "Enfournez le künefe dans son plat à 200 °C ; laissez 12–15 minutes jusqu'à ce que le dessus dore.\nVersez le sirop fourni, sans le chauffer, sur le künefe brûlant — un sirop chaud alourdirait la pâte.\nLaissez reposer cinq minutes, le temps que le sirop pénètre.\nParsemez de pistaches concassées ; servez chaud avec du kaymak.",
      de: 'Schieben Sie das Künefe in seiner Form bei 200 °C in den Ofen; 12–15 Minuten backen, bis die Oberfläche bräunt.\nGießen Sie den beiliegenden Sirup ungewärmt über das heiße Künefe — warmer Sirup macht den Teig schwer.\nFünf Minuten ruhen lassen, damit der Sirup einzieht.\nMit gehackten Pistazien bestreuen; heiß mit Kaymak servieren.',
    },
    pantry: {
      tr: 'Dövülmüş antep fıstığı\nKaymak\nTürk kahvesi',
      fr: 'Pistaches concassées\nKaymak\nCafé turc',
      de: 'Gehackte Pistazien\nKaymak\nTürkischer Kaffee',
    },
    isActive: true,
    items: [{ sku: '500103', qty: 2 }],
  },
  {
    name: { tr: 'Bayram Tabağı', fr: 'Le plateau de fête', de: 'Festtagsplatte' },
    description: {
      tr: 'Üç çeşit baklava tek tabakta: fıstıklı, cevizli ve havuç dilimi. Pişirmek yok, kurmak var.',
      fr: 'Trois baklavas sur un seul plateau : pistache, noix et « tranche de carotte ». Rien à cuire, tout à dresser.',
      de: 'Drei Baklava auf einer Platte: Pistazie, Walnuss und Karottenschnitte. Nichts zu backen, nur anzurichten.',
    },
    duration: { tr: '10 dk', fr: '10 min', de: '10 Min.' },
    serves: { tr: '6–8 kişilik', fr: 'Pour 6–8 personnes', de: 'Für 6–8 Personen' },
    meal: { tr: 'İkram', fr: 'À partager', de: 'Zum Teilen' },
    steps: {
      tr: 'Baklavaları buzdolabından çıkarıp 30 dakika oda sıcaklığında bekletin — soğuk baklavanın şerbeti damakta ağır kalır.\nGeniş bir tabağa üç çeşidi ayrı ayrı, dilimler birbirine değmeyecek biçimde dizin.\nHavuç dilimi baklavayı ortaya alın; yüksekliği tabağa hacim verir.\nYanında sade Türk kahvesi ve soğuk su ile ikram edin.',
      fr: "Sortez les baklavas du réfrigérateur 30 minutes avant — froid, le sirop reste lourd en bouche.\nDisposez les trois variétés sur un grand plateau, sans que les parts se touchent.\nPlacez la « tranche de carotte » au centre ; sa hauteur donne du volume au plateau.\nServez avec un café turc sans sucre et un verre d'eau fraîche.",
      de: 'Nehmen Sie die Baklava 30 Minuten vorher aus dem Kühlschrank — kalt bleibt der Sirup schwer am Gaumen.\nRichten Sie die drei Sorten auf einer großen Platte an, ohne dass sich die Stücke berühren.\nSetzen Sie die Karottenschnitte in die Mitte; ihre Höhe gibt der Platte Volumen.\nDazu türkischen Kaffee ohne Zucker und ein Glas kaltes Wasser reichen.',
    },
    pantry: {
      tr: 'Türk kahvesi\nSoğuk su',
      fr: 'Café turc\nEau fraîche',
      de: 'Türkischer Kaffee\nKaltes Wasser',
    },
    isActive: true,
    items: [
      { sku: '600102', qty: 1 },
      { sku: '600202', qty: 1 },
      { sku: '600402', qty: 1 },
    ],
  },
  {
    /**
     * TASLAK — yalnız Türkçe. Yayın kapısının denenebilmesi için var (künye yukarıda): operasyon
     * ekranı *"Yayınlanamaz: FR, DE dilinde ad yok"* der, müşteri yüzeyinde ise HİÇ görünmez.
     * `isActive: false` şart değil, ZORUNLU: üç dil dolmadan kısıt zaten yazdırmaz (0038).
     */
    name: { tr: 'Akşama Fırın Böreği' },
    description: { tr: 'Hafif bir akşam için tek tepsi: peynirli börek, yanında yoğurt.' },
    duration: { tr: '30 dk' },
    serves: { tr: '3–4 kişilik' },
    meal: { tr: 'Akşam yemeği' },
    steps: { tr: "Fırını 180 °C'ye ısıtın.\nBörekleri tepsiye dizip 25 dakika pişirin.\nSıcak servis edin; yanına yoğurt." },
    pantry: { tr: 'Süzme yoğurt\nKuru nane' },
    isActive: false,
    items: [{ sku: '700904', qty: 2 }],
  },
];

export async function seedRecipes(db: Db): Promise<void> {
  if (await tabloDolu(db, 'recipe')) {
    console.log('▸ tarifler zaten dolu — atlandı');
    return;
  }

  // SKU → varyant kimliği: tarif kalemi VARYANTA bağlıdır ("Ezine peyniri" yetmez, "350 g" olan
  // satır sepete eklenebilen tek şeydir — 05.16). Tek sorgu; kalem başına arama N+1 doğururdu.
  const products = await new ProductService(db).listWithRelations({ limit: 500 });
  const idBySku = new Map(
    products.rows.flatMap((p) => p.variants.filter((v) => v.sku).map((v) => [v.sku as string, v.id] as const)),
  );

  console.log('▸ TARİF seed');
  const recipes = new RecipeService(db);
  let sira = 0;
  for (const r of RECIPES) {
    const items = r.items.map((i) => ({ variantId: idBySku.get(i.sku), qty: i.qty }));
    // SKU'su çözülemeyen tarif ATLANIR, yarım kurulmaz: eksik malzemeli bir tarif ekranda "3 ürün"
    // derken iki satır gösterir ve kimse bunun seed'den geldiğini anlamaz (paket seed'i emsali).
    const eksik = r.items.filter((i) => !idBySku.has(i.sku)).map((i) => i.sku);
    if (eksik.length > 0) {
      console.warn(`  ⚠ ${resolveLocalizedText(r.name)}: SKU bulunamadı (${eksik.join(', ')}) — atlandı`);
      continue;
    }

    await recipes.createWithItems({
      name: r.name,
      description: r.description,
      duration: r.duration,
      serves: r.serves,
      meal: r.meal,
      steps: r.steps,
      pantry: r.pantry,
      isActive: r.isActive,
      sortOrder: sira++,
      items: items.map((i) => ({ variantId: i.variantId as string, qty: i.qty })),
    });
  }

  const yayinda = RECIPES.filter((r) => r.isActive).length;
  console.log(`  ${RECIPES.length} tarif (${yayinda} yayında, ${RECIPES.length - yayinda} taslak)`);
}
