import {
  BundleService,
  CategoryService,
  CollectionService,
  PriceService,
  ProductFamilyService,
  ProductImageService,
  ProductService,
} from '@lezzet/database';
import { bundleBalance, rebalanceAllocations } from '@lezzet/domain-core';
import { resolveLocalizedText, type LocalizedText } from '@lezzet/types';
import { euro, r2Keys, uploadImageFromUrl, type Db } from './shared';
import { lezzaGorselBySlug, seedLezzaProducts } from './catalog-lezza';

// Katalog (05): kategori · ürün · varyant · galeri · koleksiyon.
//
// **Elle yazılmış kategori/ürün YOK (kullanıcı kararı 08.08: "resmî olmayan kalmasın").** Eski üçlü
// kategori (Baklava/Şerbetli/Börek) + `Malzeme` ve altı elle ürün kaldırıldı: hepsi gerçek katalogda
// birebir karşılığı olan KOPYALARDI (fıstıklı baklava ↔ `baklava-with-pistachio-*`, su böreği ↔
// `cheese-pastry-su-borek`…). Kategoriler ve ürünler tek kaynaktan kurulur (`catalog-lezza.ts` +
// `data/lezza-catalog.json`); kategori görseli/altyazısı/vitrin işareti de orada.
// Elle ürünlerin taşıdığı sınır-durum örnekleri (pasif · aday · eksik dil · eksik beyan ·
// görselsiz) kaybolmadı: catalog-lezza aynı boşlukları SEYREK oranlarla serpiştiriyor.

// ── Katalog: kategori + ürün + varyant (05) ──────────────────────────────────────────────────────

export async function seedCatalog(db: Db): Promise<void> {
  const products = new ProductService(db);
  if ((await products.listAll()).length > 0) {
    console.log('▸ katalog zaten dolu — atlandı');
    return;
  }

  console.log('▸ KATALOG seed');
  // Kategoriler catalog-lezza içinde kurulur (görsel + tagline + is_featured ile) — catId oradan dolar.
  const catId = new Map<string, string>();
  const lezza = await seedLezzaProducts(new CategoryService(db), products, new ProductImageService(db), new ProductFamilyService(db), catId, 0);
  console.log(`  ✓ ${lezza.made} Lezza ürünü · ${lezza.variants} varyant · ${lezza.photos} galeri fotoğrafı · ${lezza.families} ürün ailesi`);
  console.log(`✓ katalog: ${catId.size} kategori, ${lezza.made} ürün`);
}

// ── Koleksiyon + üyelik (05) ─────────────────────────────────────────────────────────────────────

interface SeedCollection {
  slug: string; // paylaşım linki — admin belirler (servis benzersizleştirir)
  name: LocalizedText;
  /** Paylaşım (OG) açıklaması. Taslakta `null` — operatör metni yayına alırken yazar. */
  description: LocalizedText | null;
  /** Ürün slug'ları — DİZİNİN SIRASI vitrin kürasyon sırasıdır (position). İlki KAPAĞI da verir. */
  products: string[];
  /**
   * **Kuralla tamamlanır** (08.08 · kullanıcı: *"koleksiyonların sağlıklı yapılmış olması"*).
   *
   * Elle yazılan slug'lar başta kalır — kürasyon sırası bir KARARDIR ve türetilemez. Arkasına
   * gerçek katalogdan üye eklenir; yoksa "dolu koleksiyon" 133 ürünlük katalogda birkaç üyeyle
   * kalır ve kürasyon sürükleme fiilen denenemez.
   */
  fillFrom: {
    /** Kategori slug'ları — sıra öncelik sırasıdır. */
    categorySlugs: string[];
    /** Toplam üye tavanı (elle yazılanlar dâhil). Koleksiyon sayfalanmıyor; tavan bilinçli. */
    upTo: number;
  };
  /**
   * **TASLAK koleksiyon** — pasif + kapaksız + üyesiz, üçü bir arada (kapsam denetimi 09.08).
   *
   * Üçünü tek kayıtta toplamak bilinçli: operatörün gerçekte kurduğu hâl budur. Yeni koleksiyon
   * boş doğar, kapağı sonra yüklenir, hazır olunca yayına alınır — üç ayrı kayıt yapsaydık
   * seed'de gerçekte hiç yaşanmayan üç yapay hâl olurdu.
   *
   * Vitrin işareti KONMAZ: pasif ama işaretli kayıt ayrı bir hâl ve onu paket tarafı örnekliyor
   * (05.18 sayacının "1 işaretli kayıt pasif" uyarısı oradan besleniyor).
   */
  taslak?: true;
}

/**
 * Üç YAYINDAKİ koleksiyon gerçekçe kullanılabilir hâlde (kullanıcı kararı 08.08: "resmî olmayan
 * koleksiyon kalmasın"): aktif + kapaklı + gerçek ürünlerle dolu + vitrin havuzunda (`is_featured` —
 * ana sayfa 2 slotu bu havuzdan GÜNLÜK rotasyonla dolar, 08.26).
 *
 * ⚠ **DÜZELTME (09.08):** 08.08'de buraya *"kapaksız · pasif taslak · boş örnekleri test verisiydi
 * ve kalktı; o hâli operatör akışı zaten üretir"* diye yazmıştım. **Yanlıştı.** "Operatör akışı
 * üretir" demek, seed'i kuran hiç kimsenin o ekranı GÖREMEYECEĞİ demek — o hâli görmek için önce
 * elle bir koleksiyon açmak gerekiyordu. Kapsam sessizce daraldı ve ölçen bir şey olmadığı için
 * kimse fark etmedi. Kullanıcı kararı nettir ve tersidir: *"olası her durum için çeşitlendir."*
 * Aşağıdaki dördüncü kayıt o üç hâli tek satırda geri getiriyor; denetimi `pnpm seed:coverage`.
 *
 * `İndirimde` YOK ve olmayacak (08.08 kararı, gerekçe kalıcı): vitrinde zaten TÜRETİLMİŞ bir fırsat
 * bandı var — elle kürasyonlu bir "indirimde" seçkisi onun bayatlayan ikizi olurdu. İndirim bir
 * SÜZGEÇtir, seçki değil.
 */
const COLLECTIONS: SeedCollection[] = [
  {
    slug: 'bayram-sofrasi',
    name: { tr: 'Bayram Sofrası', fr: 'Table de fête', de: 'Festtafel' },
    description: {
      tr: 'Bayramda ikram edilecek klasikler — fıstıklı baklavadan künefeye.',
      fr: 'Les classiques à offrir pour les fêtes — du baklava à la pistache au künefe.',
      de: 'Klassiker für die Festtage — von Pistazien-Baklava bis Künefe.',
    },
    products: ['assorted-baklava', 'kunefe-including-syrup', 'baklava-with-pistachio-12-pieces', 'cold-baklava-with-pistachio'],
    fillFrom: { categorySlugs: ['tatli'], upTo: 24 },
  },
  {
    slug: 'yeni-gelenler',
    name: { tr: 'Yeni Gelenler', fr: 'Nouveautés', de: 'Neuheiten' },
    description: {
      tr: 'Kataloğa yeni eklenenler.',
      fr: 'Derniers ajouts au catalogue.',
      de: 'Neu im Katalog.',
    },
    // İkinci seçki BAŞKA kategorilerden: iki koleksiyon aynı ürünleri gösterseydi "bir ürün birden
    // çok koleksiyonda" durumu denenirdi ama "farklı seçkiler" denenmezdi.
    products: ['baklava-with-pistachio-6-pieces', 'maras-ice-cream-plain'],
    fillFrom: { categorySlugs: ['pasta', 'dondurma'], upTo: 18 },
  },
  {
    slug: 'cay-saati',
    name: { tr: 'Çay Saati', fr: "L'heure du thé", de: 'Teestunde' },
    description: {
      tr: 'Çayın yanına fırından çıtır börekler ve hamur işleri.',
      fr: 'Böreks croustillants et pâtisseries salées pour accompagner le thé.',
      de: 'Knusprige Börek und Gebäck zur Teestunde.',
    },
    products: ['cheese-pastry-su-borek', 'adana-borek-with-cheese'],
    fillFrom: { categorySlugs: ['firin'], upTo: 12 },
  },
  {
    // **TASLAK** — operatörün henüz yayına almadığı seçki: pasif · kapaksız · üyesiz.
    // Gerçekçi bir hâl, uydurma bir kayıt değil: sezonluk seçkiler böyle hazırlanır.
    slug: 'yilbasi-sofrasi',
    name: { tr: 'Yılbaşı Sofrası', fr: 'Table du Nouvel An', de: 'Silvestertafel' },
    description: null,
    products: [],
    fillFrom: { categorySlugs: [], upTo: 0 },
    taslak: true,
  },
];

export async function seedCollections(db: Db): Promise<void> {
  const collections = new CollectionService(db);
  if ((await collections.list()).length > 0) {
    console.log('▸ koleksiyonlar zaten dolu — atlandı');
    return;
  }

  // Üyelik ürün id'sine muhtaç: slug → id eşlemesi DB'den (kaynak doğru, seed sırasından bağımsız).
  const urunler = await new ProductService(db).listAll();
  const idBySlug = new Map(urunler.map((p) => [p.slug, p.id]));
  // Kategori slug → id: kural tabanlı doldurma kategoriyle çalışıyor, ürün satırı ise id taşıyor.
  const catIdBySlug = new Map((await new CategoryService(db).list()).map((c) => [c.slug, c.id]));
  // Kapak gerçek ürünün kaynak görselinden (künye `lezzaGorselBySlug`).
  const gorselBySlug = lezzaGorselBySlug();

  console.log('▸ KOLEKSİYON seed');
  for (const c of COLLECTIONS) {
    const productIds = c.products.map((slug) => idBySlug.get(slug)).filter((id): id is string => Boolean(id));
    // Kuralla tamamlama: elle kürasyon başta kalır, arkasına kategori sırasına göre eklenir.
    // **Yalnız SATILABİLİR ürün** — pasif/aday bir ürünü vitrin seçkisine kural ile koymak, o
    // koleksiyonu açan müşteriye alınamayan bir kart göstermek olurdu.
    const secili = new Set(productIds);
    for (const catSlug of c.fillFrom.categorySlugs) {
      const catId = catIdBySlug.get(catSlug);
      if (!catId) continue;
      for (const p of urunler) {
        if (productIds.length >= c.fillFrom.upTo) break;
        if (p.categoryId !== catId || p.status !== 'active' || secili.has(p.id)) continue;
        secili.add(p.id);
        productIds.push(p.id);
      }
    }
    const created = await collections.create({
      name: c.name,
      description: c.description,
      slug: c.slug,
      productIds, // sıra = kürasyon (position 0..n-1)
    });
    if (c.taslak) {
      // Taslak: yayında değil, vitrinde değil, kapağı yok, üyesi yok. Üçü de kasıtlı — künyesi
      // `SeedCollection.taslak`'ta.
      await collections.edit(created.id, { isActive: false });
      console.log(`  ✓ ${resolveLocalizedText(created.name)} · TASLAK (pasif · kapaksız · üyesiz) · /${created.slug}`);
      continue;
    }
    // Vitrin havuzu işareti (05.18 kapısı) — ana sayfanın 2 slotu bu havuzdan günlük rotasyonla dolar (08.26).
    await collections.setFeatured(created.id, true);
    // Kapak create'ten SONRA: key kesinleşen slug'a bağlanır (gerçek admin akışının aynısı).
    const kapakUrl = gorselBySlug.get(c.products[0] ?? '');
    if (kapakUrl) {
      const key = await uploadImageFromUrl(kapakUrl, r2Keys.collectionImage(created.slug, kapakUrl.split('/').pop() || 'cover.webp'));
      if (key) await collections.setImageKey(created.id, key);
    }
    console.log(`  ✓ ${resolveLocalizedText(created.name)} · ${productIds.length} ürün · vitrin havuzunda · /${created.slug}`);
  }
  console.log(`✓ koleksiyon: ${COLLECTIONS.length} kayıt`);
}

// ── Paket (bundle) + kalemleri (05.5) ────────────────────────────────────────────────────────────

interface SeedBundleItem {
  /** Varyant SKU'su — GERÇEK katalogdan (kullanıcı kararı 08.08); kimlik DB'den çözülür. */
  sku: string;
  qty: number;
  /** Hediye kalem: payı 0 kalır, dağıtıma girmez ama maliyeti marja yansır. */
  gift?: boolean;
}

interface SeedBundle {
  name: LocalizedText;
  description?: LocalizedText;
  /** Kapak: gerçek ürünün kaynak görseli (slug ile). Boşsa paket görselsiz kurulur. */
  imageSlug?: string;
  serves?: number; // "kaç kişilik" künyesi — boşsa müşteride o satır HİÇ çizilmez
  isActive?: boolean;
  /** Ana sayfa vitrini (2 slot, 08.26) — yalnız işaretliler düşer. */
  isFeatured?: boolean;
  /** Kalemlerin BİRİM FİYATLARI toplamına göre indirim — paket fiyatı bundan doğar. */
  discountPercent: number;
  /** Bilinçli mutabakatsızlık (€): liste rozetinin uyarı hâli ekranda görülebilsin. */
  mismatch?: number;
}

/**
 * Paketler arayüzün her durumunu örnekler: kişilik dolu/boş · hediye kalemi · aktif/pasif ·
 * MUTABAKATI TUTMAYAN bir satır · soğuk zincirli/tamamı kargolanır. Kalemler GERÇEK katalogun
 * SKU'ları (08.08 — elle ürünler kalktı); soğuk zincir örneği artık dondurma setidir (`shippable`
 * kuralı gereği dondurma kargoya verilmez, yalnız kapıya teslim).
 *
 * Aktif paket sayısı bilinçli DÖRT: paket liste sayfası iki kartla denenemez ve sepetteki teslimat
 * kısıtı hem "gönderilemeyen" hem "kalan" tarafını aynı anda gerektiriyor.
 *
 * FİYAT ELLE YAZILMAZ, birim fiyatlardan TÜRETİLİR (formun yaptığı işin aynısı: `rebalanceAllocations`
 * ağırlık olarak birim fiyatı alır). Görselsiz örnek pasif pakette yaşar — vitrine düşen her paket
 * kapaklıdır (kullanıcı kararı 08.08: "resim olmama problemini çözelim").
 */
const BUNDLES: Array<SeedBundle & { items: SeedBundleItem[] }> = [
  {
    name: { tr: 'Bayram Sofrası Paketi', fr: 'Coffret Table de fête', de: 'Festtafel-Paket' },
    description: {
      tr: 'Kalabalık sofra için üç klasik: karışık baklava, künefe ve fıstıklı baklava.',
      fr: 'Trois classiques pour une grande table : baklava assorti, künefe et baklava à la pistache.',
      de: 'Drei Klassiker für die große Tafel: gemischtes Baklava, Künefe und Pistazien-Baklava.',
    },
    imageSlug: 'assorted-baklava',
    serves: 6,
    isFeatured: true,
    discountPercent: 12,
    items: [
      { sku: '601201', qty: 1 }, // Assorted Baklava 450g
      { sku: '500103', qty: 1 }, // Kunefe Including Syrup 420g
      { sku: '600102', qty: 1 }, // Baklava with Pistachio (12 Pieces)
    ],
  },
  {
    // Kişilik BOŞ + HEDİYE kalemi: iki sınır durum bir arada (serves satırı müşteride hiç çizilmez).
    name: { tr: 'Fıstık Sevenler', fr: 'Amateurs de pistache', de: 'Für Pistazienliebhaber' },
    description: {
      tr: 'İki kutu fıstıklı baklava; yanında hediye altılık kutu.',
      fr: 'Deux boîtes de baklava à la pistache ; une boîte de six offerte.',
      de: 'Zwei Schachteln Pistazien-Baklava; eine Sechserbox geschenkt.',
    },
    imageSlug: 'baklava-with-pistachio-12-pieces',
    isFeatured: true,
    discountPercent: 8,
    items: [
      { sku: '600102', qty: 2 }, // Baklava with Pistachio (12 Pieces)
      { sku: '600106', qty: 1, gift: true }, // Baklava with Pistachio (6 Pieces)
    ],
  },
  {
    // SOĞUK ZİNCİR paketi: dondurma KARGOLANMAZ (`shippable=false`) — sepetteki teslimat kısıtının
    // "gönderilemeyen" tarafı bu paketle denenir.
    name: { tr: 'Maraş Dondurma Seti', fr: 'Coffret glaces Maraş', de: 'Maraş-Eis-Set' },
    description: {
      tr: 'Sade ve kakaolu Maraş dondurması. Soğuk zincir bozulmaz — yalnız kapıya teslim.',
      fr: 'Glace Maraş nature et cacao. Chaîne du froid préservée — livraison à domicile uniquement.',
      de: 'Maraş-Eis natur und Kakao. Kühlkette bleibt erhalten — nur Lieferung an die Tür.',
    },
    imageSlug: 'maras-ice-cream-plain',
    serves: 4,
    discountPercent: 10,
    items: [
      { sku: '111101', qty: 1 }, // Maraş Ice Cream Plain
      { sku: '111107', qty: 1 }, // Maraş Ice Cream Cocoa
    ],
  },
  {
    // TAMAMI KARGOLANIR + büyük indirim: kısıt bloğunun "kalanı" tarafı ancak gönderilebilen bir
    // paket sepette dururken denenebilir (ayır → kalanla asgari sepeti/ücretsiz kargoyu aş).
    name: { tr: 'Baklava İkilisi', fr: 'Duo de baklavas', de: 'Baklava-Duo' },
    description: {
      tr: 'Fıstıklı ve cevizli — kalabalık sofranın iki klasiği bir arada.',
      fr: 'Pistache et noix — les deux classiques des grandes tablées.',
      de: 'Pistazie und Walnuss — die zwei Klassiker für große Tafeln.',
    },
    imageSlug: 'baklava-with-walnut',
    serves: 10,
    discountPercent: 15,
    items: [
      { sku: '600102', qty: 1 }, // Baklava with Pistachio (12 Pieces)
      { sku: '600207', qty: 1 }, // Baklava with Walnut 1250g
    ],
  },
  {
    // MUTABAKATI TUTMAYAN paket: paylar doğru dağıtılır, sonra paket fiyatı 0,95 € kaydırılır.
    // Bilinçli bozuk veri: form bu paketi düzeltilmeden kaydetmez, ama liste satırının bozulmuş bir
    // paketi SÖYLEDİĞİ görülebilsin. Pasif ki vitrine düşmesin; GÖRSELSİZ paket örneği de burada
    // yaşar — müşteri görmez, operasyon listesi boş-kapak hâlini yine de gösterebilir.
    name: { tr: 'Kış İkramları', fr: 'Douceurs d’hiver', de: 'Winter-Leckereien' },
    isActive: false,
    discountPercent: 10,
    mismatch: 0.95,
    items: [
      { sku: '700401', qty: 1 }, // Cheese Pastry (Su Börek) 500g
      { sku: '600106', qty: 1 }, // Baklava with Pistachio (6 Pieces)
    ],
  },
];

/** Kuruşa çevrim — `toCents` burada yok (`@lezzet/helper` kökün bağımlısı değil), aritmetik tek satır. */
const cents = (v: number) => Math.round(v * 100);

export async function seedBundles(db: Db): Promise<void> {
  const bundles = new BundleService(db);
  if ((await bundles.listAll()).length > 0) {
    console.log('▸ paketler zaten dolu — atlandı');
    return;
  }

  // SKU → varyant kimliği: paket kalemi varyanta bağlıdır ve SKU gerçek katalogdan. Tek sorgu
  // (gömülü varyantlar) — kalem başına arama N+1 doğururdu.
  const products = await new ProductService(db).listWithRelations({ limit: 500 });
  const idBySku = new Map(
    products.rows.flatMap((p) => p.variants.filter((v) => v.sku).map((v) => [v.sku as string, v.id] as const)),
  );
  // Birim fiyatlar (b2c TTC) tek turda: paket fiyatı bunlardan türeyecek.
  const priceMap = await new PriceService(db).findApplicableMap([...idBySku.values()], 'b2c');
  const unitPriceOf = (variantId: string) => priceMap.get(variantId)?.channelPrice?.amountCents ?? null;
  const gorselBySlug = lezzaGorselBySlug();

  console.log('▸ PAKET seed');
  for (const b of BUNDLES) {
    const lines = b.items.map((i) => ({ ...i, variantId: idBySku.get(i.sku), priceCents: null as number | null }));
    for (const l of lines) l.priceCents = l.variantId ? unitPriceOf(l.variantId) : null;
    if (lines.some((l) => !l.variantId || l.priceCents == null)) {
      console.warn(`  ⚠ ${resolveLocalizedText(b.name)}: SKU ya da birim fiyat eksik — atlandı`);
      continue;
    }

    // Paket fiyatı = birim fiyatlar toplamının indirimlisi. Hediye kalem toplama GİRER (müşteri onu da
    // ayrı alsa parasını verirdi) ama payı 0 kalır — indirimin tamamını öbür kalemler taşır.
    const listTotalCents = lines.reduce((sum, l) => sum + l.priceCents! * l.qty, 0);
    const targetCents = Math.round(listTotalCents * (1 - b.discountPercent / 100));

    const shareable = lines.filter((l) => !l.gift);
    const shares = rebalanceAllocations(
      shareable.map((l) => ({ qty: l.qty, allocatedUnitPriceCents: l.priceCents! })),
      targetCents,
    );
    let shareIndex = 0;
    const items = lines.map((l) => ({
      variantId: l.variantId!,
      qty: l.qty,
      allocatedUnitPrice: l.gift ? 0 : (shares.unitPricesCents[shareIndex++] ?? 0) / 100,
    }));

    const totalPrice = euro(shares.achievedTotalCents / 100 + (b.mismatch ?? 0));
    const { bundle } = await bundles.create({
      name: b.name,
      description: b.description ?? null,
      totalPrice,
      serves: b.serves ?? null,
      isActive: b.isActive ?? true,
      isFeatured: b.isFeatured ?? false,
      items,
    });
    // Kapak create'ten SONRA: anahtar kesinleşen slug'a bağlanır (gerçek admin akışının aynısı).
    const kapakUrl = b.imageSlug ? gorselBySlug.get(b.imageSlug) : undefined;
    if (kapakUrl) {
      const key = await uploadImageFromUrl(kapakUrl, r2Keys.bundleImage(bundle.slug, kapakUrl.split('/').pop() || 'cover.webp'));
      if (key) await bundles.setImageKey(bundle.id, key);
    }

    // "Tutuyor mu" kararı MOTORUN (`bundleBalance`) — seed kendi ölçütünü uydurmaz.
    const denge = bundleBalance(
      items.map((i) => ({ qty: i.qty, allocatedUnitPriceCents: cents(i.allocatedUnitPrice) })),
      cents(totalPrice),
    );
    const mutabakat = denge.balanced ? 'tutuyor' : `TUTMUYOR (${(denge.diffCents / 100).toFixed(2)} € fark)`;
    console.log(
      `  ✓ ${resolveLocalizedText(bundle.name)} · ${items.length} kalem · ayrı ayrı ${(listTotalCents / 100).toFixed(2)} € → paket ${totalPrice.toFixed(2)} € (%${b.discountPercent}) · ${mutabakat} · ${(b.isActive ?? true) ? 'aktif' : 'pasif'} · /${bundle.slug}`,
    );
  }
  console.log(`✓ paket: ${BUNDLES.length} kayıt`);
}
