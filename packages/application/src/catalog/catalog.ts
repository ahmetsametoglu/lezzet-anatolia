import { CategoryImageService, CategoryService, CollectionService, ProductListingService, ProductService } from '@lezzet/database';
import { DEFAULT_PAGE_SIZE, resolveLocalizedText } from '@lezzet/types';
import type { CatalogSort, KeysetCursor, PreferredLanguage } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { campaignsByProduct, readScopeCampaigns, type ScopeCampaign, type ScopeCampaigns } from './campaign';
import { listOfferProductIds, listStockedProductIds, loadProductContext } from './product-context';
import type { PricingViewer } from './pricing-viewer';
import { EMPTY_PRODUCT_CONTEXT, imageOf, toCategory, toProduct, type CatalogCategoryRow } from './map';
import type { PlaceWarehouses, StorefrontCatalog, StorefrontCollectionHead } from './storefront-types';

/**
 * Katalog okuması (08.10; terfi 21.6 — kaynağı `apps/web/lib/storefront/catalog.ts`).
 *
 * Süzme ve sayfalama SUNUCUDA: `ProductService.list` ad araması (üç dilde birden) ve kategori
 * süzgecini SQL'de çözer, sayfalama keyset'tir (`CLAUDE.md`: sınırsız büyüyen listeler sonsuz
 * kaydırma → servis okumaları cursor'lu). Liste büyüdükçe çağırana taşınan yük artmaz.
 *
 * **Fiyat sıralaması neden bir migration istedi:** uygulanabilir fiyat AYRI tablodadır (kanal +
 * geçerlilik tarihi + müşteriye özel satır) ve "bu ürünün b2c fiyatı" tek bir kolon değil bir
 * SEÇİMDİR. Sayfa çekildikten sonra sıralamak seçenek değil — "artan fiyat" yalnız o 30 satır içinde
 * artan olur ve keyset sayfalama bozulur. Çözüm `available_stock` deseninde bir okuma görünümü
 * (`0043`): seçim SQL'de çözülür, sıralama ve imleç onun üstünde çalışır.
 */

export interface CatalogQuery {
  /** Kategori slug'ı — dil-bağımsız, içerikten türer. */
  categorySlug?: string;
  /**
   * **Koleksiyon slug'ı** (08.26) — katalogun editoryal kesiti (`/catalog?collection=<slug>`).
   *
   * Kategoriyle BİRLİKTE verilebilir ve ikisi birbirini daraltır (kesişim): "Bayram koleksiyonunun
   * tatlıları" anlamlı bir sorudur. Biri ötekini ezmez.
   */
  collectionSlug?: string;
  search?: string;
  sort?: CatalogSort;
  /** "Yalnız indirimliler" — açık teklifi olan ürünlere daraltır (DOMAIN §5). */
  onlyOffers?: boolean;
  /**
   * **Yalnız BURADA fiilen duran mal** — `place.warehouseId` deposunda partisi olan ürünlere
   * daraltır (01.09). Varsayılan KAPALI: vitrinin kuralı süzmek değil işaretlemektir.
   *
   * Açan tek yüzey kuryenin yerinde satışı: araç bir vitrin değil, bir yüktür. Gerekçenin tamamı
   * `listStockedProductIds` künyesinde.
   */
  onlyStockedHere?: boolean;
  /**
   * Yalnız kargolanabilenler — "adresime gönderilebilir" çipi. Çip VARSAYILAN KAPALIDIR (tasarım):
   * bölge dışı bir posta kodunda soğuk zincir ürünleri gizlenmez, kartta etiketiyle durur. Katalogu
   * kendiliğinden küçültmek, müşteriye sormadan seçim yapmak olurdu.
   */
  onlyShippable?: boolean;
  cursor?: KeysetCursor;
}

export interface CatalogInput {
  locale: PreferredLanguage;
  query?: CatalogQuery;
  /**
   * Müşterinin yerinden çözülen depolar. **Zorunlu ve varsayılansız**: `warehouseId: null` meşru
   * bir değerdir ("yer bilinmiyor", posta kodu zorunlu değil — K1) ama VERİLMESİ zorunludur.
   * Varsayılan bıraksaydık argümanı unutan çağrı derlenir ve sessizce depo-üstü okurdu —
   * `getAvailableMap`'i kurtaran şey (T8) tam olarak parametrenin zorunluluğuydu.
   *
   * `null` → depo-ÜSTÜ okuma: "tükendi" demenin tek dayanağı hiçbir depoda bulunmamasıdır (C3).
   */
  place: PlaceWarehouses;
  /**
   * **Kim soruyor** (kanal/onay/kimlik); zorunlu ve `place` ile aynı sebeple ÇAĞIRANDAN gelir:
   * çözümü oturumu/çerezi okur, kapının içine konsaydı bu modül istek bağlamı olmadan
   * çağrılamazdı — testler ve sunucu görevleri dâhil.
   */
  viewer: PricingViewer;
  /**
   * **Katalog tamamen boşken gösterilecek yedek kategoriler** — çağıranın kararı, paketin değil.
   *
   * Web'in `fixtures.ts`i seed atılmamış yerel ortamda vitrinin kabuğu çizilsin diye bu yedeğe
   * düşüyor; mobil API bilinçle düşmüyor ("boş liste doğru cevaptır; uydurma kimliklerle ürün
   * isteyen bir istemci üretmek, boş bir şerit çizmekten pahalıya patlar"). İki karar da meşru ve
   * ikisi de YÜZEYİN kararı — bu yüzden orkestrasyon yedeği kendi içinde tutmaz, PARAMETRE alır.
   * Verilmezse yedek yoktur; web bugünkü davranışını fixture'ı geçirerek birebir korur.
   */
  fallbackCategories?: readonly CatalogCategoryRow[];
  /**
   * **Sayfa boyutu — çağıranın kararı** (varsayılan `DEFAULT_PAGE_SIZE`).
   *
   * Web'in katalog sayfası sayfa boyutunu hiç sormuyor (sonsuz kaydırma tek ölçüde akar), o yüzden
   * sayı buraya sabit yazılmıştı. Mobil uç `?limit=` sunuyor ve sunmak ZORUNDA: HTTP istemcisi ilk
   * boyayı küçük bir sayfayla açıp gerisini kaydırmayla isteyebilir, tek ölçü dayatmak cihazın
   * bant genişliği kararını sunucuya taşımak olur.
   *
   * Alan **opsiyonel ve varsayılanı eskisiyle aynı**: geçirmeyen çağıran (web köprüsü dâhil) bit
   * bazında aynı sorguyu atar — davranış değişikliği yok, yalnız kararın yeri açıldı. Tavan
   * BURADA yok, çağıranda: "en çok kaç" bir taşıma politikasıdır (mobil uçta 50), orkestrasyonun
   * iş kuralı değil.
   */
  limit?: number;
  /**
   * **Kanalında satılamayan ürünler de gelsin mi** — varsayılan HAYIR (08.46).
   *
   * Vitrinin kuralı süzmektir: müşteri alamayacağı ürünü görmez. Ama bu kural yalnız **KEŞİF**
   * yüzeyleri içindir — birileri katalogu tarıyor ve satın alacak bir şey arıyor.
   *
   * **REFERANS okumalarda aynı kural TERS etki yapıyor** ve ölçüldü (24.08, `support-tools` testi
   * yakaladı): destek aracı `urun_ara` bir ürünü ADIYLA arıyor ("cevizli baklava var mı"). Ürün
   * süzülünce araç *"katalogda eşleşen ürün yok"* diyor — yani VAR OLAN bir ürün için "yok"
   * cevabı üretiyor. Doğru cümle *"var ama sizin fiyat kanalınızda satışa kapalı"*; 08.46'nın
   * kaldırmak istediği güven riskinin (engeli rafta değil kasada öğrenmek) başka bir kapıda geri
   * dönmesi olurdu.
   *
   * **Neden bayrak, ikinci bir kapı değil:** kurulum aynı (aynı süzgeç, aynı bağlam okuması, aynı
   * kart indirgemesi); ayrışan tek şey satırların hangi kaynaktan geldiği. İkinci bir kapı yazmak,
   * katalog montajını iki yerde yaşatmak olurdu.
   *
   * **Varsayılanın yönü bilinçli:** `false` = vitrin kuralı. Ters varsayılan, bayrağı geçirmeyi
   * unutan her yeni yüzeyi sessizce süzgeçsiz bırakırdı — ve kural yüzeyde durmayan bir kural olurdu.
   *
   * **FİYAT SIRALAMASI bu kipte ÇALIŞMAZ** ve sessizce yok sayılır: sıralama anahtarı yalnız
   * görünümde var, görünüm ise satılamayanı hiç üretmiyor. Referans okumaların da fiyata göre
   * sıralamaya ihtiyacı yok — birini adıyla arıyorlar.
   */
  includeUnsellable?: boolean;
}

/** Ürün bulunmayan katalog cevabı — süzgeç hiçbir şeyi getirmediğinde sorgu boşa atılmasın. */
const noProducts = (
  categories: StorefrontCatalog['categories'],
  activeCategory: StorefrontCatalog['activeCategory'],
  // Koleksiyon boş cevapta da TAŞINIR: başlık bandı ürün listesinden bağımsız — "Bayram · 0 ürün"
  // demek, müşteriyi kimliksiz bir boş sayfada bırakmaktan iyidir.
  activeCollection: StorefrontCatalog['activeCollection'],
  // Kampanya boş cevapta da taşınır: "bu koleksiyonda %15 var ama şu an ürün yok" cümlesi,
  // kampanyayı sessizce yok saymaktan dürüsttür (koleksiyon bandının aynı gerekçesi).
  campaign: StorefrontCatalog['campaign'] = null,
): StorefrontCatalog => ({
  categories,
  activeCategory,
  activeCollection,
  products: [],
  total: 0,
  nextCursor: null,
  campaign,
});

/**
 * Katalog sayfası: kategoriler + süzülmüş/sıralanmış ürünler + toplam + imleç.
 *
 * @param db service-role istemci — çağıran enjekte eder (`serviceDb()`), `auth/otp` deseni.
 */
export async function getCatalogData(db: SupabaseClient, input: CatalogInput): Promise<StorefrontCatalog> {
  const { locale, place, viewer } = input;
  const q = input.query ?? {};
  const limit = input.limit ?? DEFAULT_PAGE_SIZE;

  const categoryRows = await new CategoryService(db).list({ activeOnly: true });
  const source = categoryRows.length ? categoryRows : (input.fallbackCategories ?? []);
  // Fotoğraf havuzu TEK turda, kart başına sorgu yok (05.23). Yedek satırlarda (fikstür) kimlikler
  // gerçek değil → havuz boş döner ve kart kapağa düşer; ikinci bir dal yazmaya gerek yok.
  const pools = await new CategoryImageService(db).listByCategories(source.map((c) => c.id));
  const categories = source.map((c) => toCategory(c, locale, pools.get(c.id)));
  const activeCategory = q.categorySlug ? (categories.find((c) => c.slug === q.categorySlug) ?? null) : null;
  // Koleksiyon SLUG'DAN çözülür (kategoriyle aynı sözleşme: dil-bağımsız, paylaşılabilir URL).
  // Slug verilmemişse sorgu HİÇ atılmaz — katalogun sıradan hâli koleksiyon tablosuna uğramaz.
  const activeCollection = q.collectionSlug ? await readCollectionHead(db, q.collectionSlug, locale) : null;

  // "Yalnız indirimliler" ürün kimliklerine çözülüp SORGUYA girer — sayfa çekildikten sonra elemek
  // keyset sayfalamayı ve toplam sayıyı bozardı. Boş küme erken döner: `ids: []` PostgREST'e
  // "hiçbiri" diye gitmez, süzgeç düşer ve TÜM katalog gelirdi.
  /* İKİ DARALTMA da kimliğe çözülür ve birlikte verilebilirler — kesişim burada alınır. Sıra
     önemsiz, ama "hiçbiri" hâli önemli: boş dizi süzgeci düşürmez, aşağıdaki erken çıkışa gider.
     `onlyStockedHere` depo-ÜSTÜ okumada (yer bilinmiyor) boş küme demektir: "burada duran mal"
     sorusunun deposuz bir cevabı yok ve sessizce tüm katalogu döndürmek yanlış cevap olurdu. */
  const idSets = await Promise.all([
    q.onlyOffers ? listOfferProductIds(db, place.warehouseId) : Promise.resolve(null),
    q.onlyStockedHere
      ? place.warehouseId === null
        ? Promise.resolve<string[]>([])
        : listStockedProductIds(db, place.warehouseId)
      : Promise.resolve(null),
  ]);
  const applied = idSets.filter((set): set is string[] => set !== null);
  const ids =
    applied.length === 0
      ? undefined
      : applied.reduce((left, right) => left.filter((id) => right.includes(id)));
  /* Ürünsüz erken çıkışın kampanyası — kesit seçiliyken "hiç ürün yok" da bir cevaptır ve
     kampanyayı yine söyler. Ana yolun okuması aşağıda, sayfa kimlikleriyle BİRLİKTE yapılıyor
     (23.08): iki çağrı yeri var ama her istekte yalnız biri koşuyor ve kural tek kapıda. */
  if (ids && !ids.length) {
    const only = await readScopeCampaigns(db, {
      categoryIds: activeCategory ? [activeCategory.id] : [],
      collectionIds: activeCollection ? [activeCollection.id] : [],
    });
    return noProducts(categories, activeCategory, activeCollection, sectionCampaignOf(only, activeCategory, activeCollection));
  }

  // Aday ürün katalogda GÖRÜNMEZ (`musteri-katalog.md §6`) — `status: 'active'` bunu sağlar.
  const filters = {
    query: q.search,
    categoryId: activeCategory?.id,
    status: 'active' as const,
    ids,
    // Koleksiyon üyeliği SORGUNUN kendi süzgeci (08.08'de düzeltildi: `productSelect` artık koşullu
    // `!inner` kuruyor). Kısa bir süre üyelik önden kimliklere çözülüp `ids`e yazılıyordu — süzgeç
    // sessizce tüm katalogu döndürdüğü için. O köprü söküldü: iki süzgeç birlikte açıkken kesişimi
    // artık elle almıyoruz, sorgu AND'liyor (ölçüldü 08.08: bayram-sofrasi `!inner` 24 · üstüne
    // `shippable` 17). Elle kesişim hem ikinci bir tur atıyordu hem de `ids`e son yazanın
    // ötekini ezmesi riskini taşıyordu.
    collectionId: activeCollection?.id,
    onlyShippable: q.onlyShippable,
  };
  const listing = new ProductListingService(db);
  /* **VİTRİNİN ÜÇ OKUMASI DA GÖRÜNÜMDEN** (08.46 · 08.54) — kapsam tek nesnede.

     Eskiden yalnız fiyat sıralaması görünümden geliyordu; varsayılan sıra ve sayaç ham `product`
     tablosundan okunuyordu. Görünüm kanalında satılamayan ürünü süzmeye başlayınca o bölünme
     tutarsızlaştı: aynı katalog "artan fiyat"ta süzülmüş, "öne çıkanlar"da süzülmemiş bir küme
     gösterirdi — ve başlıktaki sayı ikisini de tutmazdı.

     `place` ve `viewer` zaten ÇAĞIRANDAN geliyor (bu modülün kapıları istek bağlamı okumaz);
     kapsam da onlardan türer, burada yeni bir karar verilmiyor. */
  const scope = { warehouseId: place.warehouseId, channel: viewer.channel };
  const direction = q.sort === 'priceAsc' ? 'asc' : q.sort === 'priceDesc' ? 'desc' : null;
  /* REFERANS kipi (`includeUnsellable`) ham `product` tablosundan okur — görünüm satılamayanı hiç
     üretmiyor, o yüzden "hepsini getir" görünümden İSTENEMEZ. Süzgeç ve projeksiyon yine ortak
     (`buildProductQuery` · `productSelect`), yani süzme davranışı iki kaynakta ayrışmaz; ayrışan
     tek şey satırların nereden geldiği. Fiyat sıralaması bu kipte yok (künyesi `CatalogInput`de). */
  const referans = input.includeUnsellable === true;
  const products = referans ? new ProductService(db) : null;
  const [page, total] = await Promise.all([
    products
      ? products.listWithRelations({ filters, cursor: q.cursor, limit })
      : direction
        ? listing.listByPrice({ filters, cursor: q.cursor, limit, direction, ...scope })
        : listing.list({ filters, cursor: q.cursor, limit, ...scope }),
    // **`countMatching`, `counts` DEĞİL** — ve bu bir tercih değil, geri gelmiş bir arızanın
    // kapatılması (08.26'da ölçüldü). `counts()` operasyon RPC'sini çağırıyor ve süzgeçlerin
    // yalnız dördünü iletiyor (`query · category · status · onlyIncomplete`); vitrin ise altı-yedi
    // ile çağırıyor — `ids` (yalnız indirimliler), `onlyShippable` ve artık `collectionId`
    // SESSİZCE düşüyordu. Tam bu arıza 07.08'de bulunup `countMatching`e taşınmıştı (08.10
    // künyesi: *"çip açıkken liste 1 satır basarken başlık 131 diyordu"*); okuma bu pakete terfi
    // ederken eski çağrı geri gelmiş. Hata fırlatmıyor, çünkü çağrı tip olarak kusursuz: tam
    // nesne veriliyor, içeride üçü atılıyor.
    //
    // **Sayaç da artık GÖRÜNÜMDEN** (08.46): `ProductService`inki ham `product` tablosunu sayıyor
    // ve kanal/depo kapsamını bilmiyor — süzülen listenin yanında süzülmemiş bir sayı yazardı.
    // Aynı arızanın üçüncü kez doğmasını engelleyen şey, kapsamın süzgeçle aynı nesneden gitmesi.
    products ? products.countMatching(filters) : listing.countMatching(filters, scope),
  ]);
  /* KAMPANYA TEK OKUMADAN, İKİ SORUYA CEVAP (23.08 · kullanıcı kararı).
     Eskiden yalnız ETKİN kesit soruluyordu ve künyesi haklıydı: kampanya bir kesite aittir. Ama
     rozet KARIŞIK listede de gerekiyor (arama sonucu, benzer ürünler, vitrin rayı) ve orada
     başlık diye bir şey yok — kampanyayı söyleyecek tek yer kartın kendisi. Sayfanın kategori ve
     koleksiyon kimlikleri de sorulur oldu; ek SORGU doğmuyor, çünkü `ProductWithRelations` zaten
     `collections[]` taşıyor ve `categoryId` ürün satırında. `loadProductContext` ile PARALEL
     koşuyor: ikisi de sayfa satırlarına bakıyor ama birbirini beklemiyor. */
  const [context, scopeCampaigns] = await Promise.all([
    loadProductContext(db, page.rows, place, viewer),
    readScopeCampaigns(db, {
      categoryIds: [
        ...(activeCategory ? [activeCategory.id] : []),
        ...page.rows.flatMap((p) => (p.categoryId === null ? [] : [p.categoryId])),
      ],
      collectionIds: [
        ...(activeCollection ? [activeCollection.id] : []),
        ...page.rows.flatMap((p) => p.collections.map((c) => c.collectionId)),
      ],
    }),
  ]);
  /* Kesit başlığı kampanyayı ZATEN söylüyorsa kartta tekrarlanmaz (kullanıcı kararı 23.08):
     kategori ekranında 40 özdeş rozet, rozeti anlamsızlaştırır. Karar "rozet, başlığın
     söyleyemediği yerde" diye tek cümleye indi — ölçüt de o: kesit seçili mi. */
  const sectionSpeaks = activeCategory !== null || activeCollection !== null;
  const byProduct = sectionSpeaks
    ? new Map<string, ScopeCampaign>()
    : campaignsByProduct(
        scopeCampaigns,
        page.rows,
        new Map(page.rows.map((p) => [p.id, p.collections.map((c) => c.collectionId)])),
      );

  return {
    categories,
    activeCategory,
    activeCollection,
    products: page.rows.map((p) =>
      toProduct(p, locale, context.get(p.id) ?? EMPTY_PRODUCT_CONTEXT, byProduct.get(p.id) ?? null),
    ),
    total,
    nextCursor: page.nextCursor,
    campaign: sectionCampaignOf(scopeCampaigns, activeCategory, activeCollection),
  };
}

/**
 * Etkin kesitin kampanyası — koleksiyon kategoriyi yener (daha dar olan kazanır; müşteri o
 * koleksiyonu seçerek zaten daralttı). İki çağrı yeri var (ürünsüz erken çıkış ve ana yol), kural
 * tek yerde: sıra ikiye yazılsaydı bir gün ayrışır ve aynı kesit iki yolda iki kampanya söylerdi.
 */
function sectionCampaignOf(
  campaigns: ScopeCampaigns,
  activeCategory: { id: string } | null,
  activeCollection: { id: string } | null,
): ScopeCampaign | null {
  return (
    (activeCollection ? campaigns.byCollection.get(activeCollection.id) : undefined) ??
    (activeCategory ? campaigns.byCategory.get(activeCategory.id) : undefined) ??
    null
  );
}

/**
 * Slug'dan koleksiyon künyesi. **Aktif olmayan koleksiyon `null` döner** — pasife çekilmiş bir
 * koleksiyonun bağlantısı bir gün paylaşılmış olabilir ve onu hâlâ açmak, operatörün "yayından
 * kaldırdım" kararını görmezden gelmek olurdu. Ekran o hâlde sıradan katalogu gösterir.
 *
 * **Dışa VERİLİR** çünkü ikinci bir okuyanı var: `generateMetadata` paylaşım kartını kurarken
 * yalnız künyeye ihtiyaç duyuyor, ürün listesine değil. Sayfanın kendi okumasını (`getCatalogData`)
 * metadata için ikinci kez çağırmak, kartı çizmek için tüm katalog sayfasını sorgulamak olurdu.
 */
export async function readCollectionHead(
  db: SupabaseClient,
  slug: string,
  locale: PreferredLanguage,
): Promise<StorefrontCollectionHead | null> {
  const row = (await new CollectionService(db).list({ activeOnly: true })).find((c) => c.slug === slug);
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: resolveLocalizedText(row.name, locale),
    // Açıklama NULLABLE (koleksiyona metin girmek zorunlu değil) — boş dizeye indiriliyor ki
    // okuyan taraf "yok" ile "boş"u ayırt etmek zorunda kalmasın; ikisi de aynı ekranı üretir.
    description: row.description ? resolveLocalizedText(row.description, locale) : '',
    image: imageOf(row),
  };
}
