import { CategoryService, CollectionService, ProductService } from '@lezzet/database';
import {
  dailyRng,
  getCatalogData,
  imageOf,
  readScopeCampaigns,
  EMPTY_SCOPE_CAMPAIGNS,
  type PlaceWarehouses,
  type PricingViewer,
  type ScopeCampaign,
  type ScopeCampaigns,
  type StorefrontProduct,
} from '@lezzet/application';
import { resolveLocalizedText } from '@lezzet/types';
import type {
  Category,
  Collection,
  HomeBand,
  HomeBandKind,
  ImageMeta,
  LocalizedText,
  PreferredLanguage,
} from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Vitrin okuma KAPISI — `GET /api/v1/home`un veri tarafı (21.14 bağlanma etabı).
 *
 * BURADA duruyor, `@lezzet/application`da DEĞİL, çünkü paketin künyesi açık: oraya giren akışın
 * ölçütü **en az iki yüzeyin** çağırmasıdır; bu kompozisyonun (bant karışımı, tarif kart başlığı)
 * tek tüketeni mobil vitrin. Web'in ana sayfa orkestrasyonu (`apps/web/lib/storefront/home.ts`)
 * kendi yüzeyinde aynı gerekçeyle yaşıyor — o dosyanın application'a terfisi web şeridiyle defter
 * mutabakatı bekliyor, KOPYALANMADI: buradaki her bölüm ya application'ın mevcut kapısından geçer
 * (fırsatlar → `getCatalogData`) ya web'de hiç olmayan, kullanıcı kararıyla mobile verilmiş bir
 * kuraldır (bant karışımı — 08.08) ya da karar içermeyen içerik indirgemesidir (tarif kartı).
 *
 * ── SABİT SINIRLAR, `limit` SORGUSU YOK ──────────────────────────────────────
 * Vitrin rayları editoryal seçkidir: sayfalanmaz ama sabit sınır taşır (CLAUDE §1). Sınırlar v3
 * tasarımının ızgarasından geliyor ve parametrik sabit — istemci büyütemez.
 */

/**
 * Fırsat şeridi (kullanıcı kararı 09.08 — 2'den 10'a).
 *
 * v3 tasarımı iki kart çiziyordu ve sınır oradan gelmişti; ama şerit YATAY KAYDIRILABİLİR
 * (`home-screen.tsx` → `ScrollView horizontal`), yani ikiden fazlası bir yerleşim sorunu değil.
 * Kullanıcı bunu ölçerek gördü: katalogda 4 fırsat varken vitrin ikisini gösteriyordu.
 *
 * SINIRSIZ YAPILMADI ve gerekçesi veriye bağlı: fırsat, SKT'si yaklaşan bir partiden doğuyor —
 * yani sayısı katalogla değil, stoğun yaşıyla büyüyor ve bir gün onlarca olabilir. Vitrin
 * uygulamanın AÇILIŞ ekranı; oraya sınırsız bir dizi koymak, açılışta katalogdaki her indirimli
 * ürünü indirip çizmek demek. 10 bugünkü veriyi (4) rahat kapsıyor ve tavan olduğu görünür kalıyor.
 * Tek sayı; artırmak isteyen burayı değiştirir.
 */
const HOME_OFFER_LIMIT = 10;
/** Vitrin seçkisi rayı — v3'te dört daire. */
const HOME_FEATURED_LIMIT = 4;
/** Bant karışımı: 4 kategori + 2 koleksiyon = 6 slot (kullanıcı kararı 08.08). */
export const HOME_BAND_CATEGORY_COUNT = 4;
export const HOME_BAND_COLLECTION_COUNT = 2;
/** Toplam slot — ayrı bir sabit DEĞİL: iki sayının toplamından türer, üçüncü bir gerçek açılmaz. */
const HOME_BAND_TOTAL = HOME_BAND_CATEGORY_COUNT + HOME_BAND_COLLECTION_COUNT;

/**
 * Rastgelelik DIŞARIDAN gelir (emsal: web `rotateDaily`in `now` parametresi — "test günü
 * sabitleyebilsin"). Testte tohumlu sayaç. Kuralın kendisi rastgele, KANITI deterministik olmalı.
 *
 * ── ÜRETİMDE ARTIK `Math.random` DEĞİL, `dailyRng()` (kullanıcı kararı 18.08) ─
 * KOMPOZİSYON DEĞİŞMEDİ: hâlâ 4 kategori + 2 koleksiyon, koleksiyonlar işaretliler arasından,
 * altısı birbirine rastgele konumlarda karışıyor, fotoğraflar kendi havuzundan geliyor. Değişen
 * TEK ŞEY rastgeleliğin kaynağı — artık gün numarasından türeyen deterministik bir üreteç
 * (`@lezzet/application`, `rotateDaily`nin kardeşi).
 *
 * **Gerekçe cihazda ölçüldü (18.08):** her yenilemede koleksiyon sırası ve fotoğraflar
 * değişiyordu. `rotateDaily`nin künyesi bu hâli zaten üç maddede reddetmişti — *"sayfa
 * önbelleğini kırar · aynı müşteriye her yenilemede başka vitrin gösterir, vitrin değil kumar
 * olur · 'dün gördüğüm koleksiyon neydi' sorusunun cevabı kalmaz"* — ama o gerekçe web ana
 * sayfasında uygulanmış, mobilde uygulanmamıştı. **Aynı ürün kararı iki yüzeyde iki ayrı şekilde
 * yürüyordu** (CLAUDE §1); artık ikisi de günü tohum alıyor.
 *
 * Kural NEDEN `rotateDaily`ye çevrilmedi: o "havuzu sırayla döndür" der ve buradaki kompozisyonu
 * (dörde-iki + karıştırma + fotoğraf havuzu) ifade edemez. Değişmesi gereken kural değil, tohumdu.
 */
export type Rng = () => number;

/**
 * Havuzdan `count` FARKLI öğe seçer; seçilenler HAVUZDAKİ sıralarını korur.
 *
 * Sıranın korunması kuralın yarısıdır (08.08): "rastgele 2 koleksiyon" seçilir ama "ikisinin kendi
 * arası sırası `sortOrder`a uyar" — havuz zaten o sırada geldiği için indeksleri artan sıralamak
 * yeter. Kısmi Fisher–Yates: her aday eşit olasılıkla seçilir, tam karıştırma maliyeti ödenmez.
 */
export function pickRandomDistinct<T>(pool: readonly T[], count: number, rng: Rng): T[] {
  if (count >= pool.length) return [...pool];
  const indices = pool.map((_, i) => i);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (indices.length - i));
    const tmp = indices[i]!;
    indices[i] = indices[j]!;
    indices[j] = tmp;
  }
  return indices
    .slice(0, count)
    .sort((a, b) => a - b)
    .map((i) => pool[i]!);
}

/**
 * `secondary` öğelerini birleşik dizinin RASTGELE konumlarına yerleştirir; iki dizinin de KENDİ İÇ
 * sırası korunur (08.08: koleksiyonlar 6'lı dizide rastgele iki konuma girer, kategoriler kendi
 * aralarındaki sırayı korur).
 */
export function interleaveAtRandom<T>(primary: readonly T[], secondary: readonly T[], rng: Rng): T[] {
  const total = primary.length + secondary.length;
  const slots = new Set(
    pickRandomDistinct(
      Array.from({ length: total }, (_, i) => i),
      secondary.length,
      rng,
    ),
  );
  const out: T[] = [];
  let p = 0;
  let s = 0;
  for (let i = 0; i < total; i++) out.push(slots.has(i) ? secondary[s++]! : primary[p++]!);
  return out;
}

/**
 * Bant KAYNAKLARININ seçimi — saf karar, DB'siz (test edilebilir diye ayrı duruyor).
 *
 * Kural (kullanıcı kararı 08.08, web'den bilinçli sapma):
 *   koleksiyon → işaretlilerden (`isFeatured`) RASTGELE en çok 2; kendi aralarında `sortOrder`.
 *   kategori   → işaretlilerden `sortOrder` sırasıyla, toplam 6'ya TAMAMLAYACAK kadar (koleksiyon
 *                2'den azsa kategori 4'ten çok olabilir). Toplam 6'yı bulamazsa olduğu kadar —
 *                dolgu/uydurma yok.
 *
 * İşaret SEÇİMDİR, yedeği yoktur: hiç işaret yoksa bant da yoktur. (Web'in `pickFeatured`ı işaretsiz
 * havuzda "ilk N gerçek satır"a düşer — o kural web'de yaşıyor ve KOPYALANMADI; buradaki kural
 * kullanıcının mobile verdiği kuraldır ve işaretsiz veride boş döner.)
 */
export function selectHomeBandSources<C extends { id: string; isFeatured: boolean }, K extends { id: string; isFeatured: boolean }>(
  categories: readonly C[],
  collections: readonly K[],
  rng: Rng,
  campaigns: ScopeCampaigns = EMPTY_SCOPE_CAMPAIGNS,
): { categories: C[]; collections: K[] } {
  /*
    KAMPANYALI BANT ÖNE ALINIR (08.44) — ve bu bir süsleme değil, TUTARLILIK düzeltmesi.
    Ölçüldü: koleksiyonlar işaretli havuzdan RASTGELE seçiliyor ve toplam slot sınırlı, yani
    kampanyalı bir koleksiyon o gün hiç görünmeyebiliyordu. Kampanya açan operatör kampanyanın
    görüneceğini varsayar; görünmeyen kampanya, açılmamış kampanyadır.

    Öncelik seçimin İÇİNDE, sonrasında değil: rastgeleliği bozmadan havuzu ikiye ayırıyoruz —
    kampanyalılar önce, kalanlar sonra ve kendi aralarında yine rastgele. Böylece kampanyasız
    günlerde bugünkü davranış BİREBİR korunuyor (aynı `rng`, aynı sonuç).
  */
  const featuredCollections = collections.filter((c) => c.isFeatured);
  const withCampaign = featuredCollections.filter((c) => campaigns.byCollection.has(c.id));
  const withoutCampaign = featuredCollections.filter((c) => !campaigns.byCollection.has(c.id));
  const chosenCollections = [
    ...pickRandomDistinct(withCampaign, HOME_BAND_COLLECTION_COUNT, rng),
    ...pickRandomDistinct(withoutCampaign, HOME_BAND_COLLECTION_COUNT, rng),
  ].slice(0, HOME_BAND_COLLECTION_COUNT);

  // Kategoride sıra OPERATÖRÜN (`sortOrder`) ve öyle kalıyor; kampanyalı olan yalnız öne çekiliyor,
  // kendi içindeki sıra bozulmuyor — iki grup da kaynak sırasını koruyor.
  const featuredCategories = categories.filter((c) => c.isFeatured);
  const chosenCategories = [
    ...featuredCategories.filter((c) => campaigns.byCategory.has(c.id)),
    ...featuredCategories.filter((c) => !campaigns.byCategory.has(c.id)),
  ].slice(0, HOME_BAND_TOTAL - chosenCollections.length);
  return { categories: chosenCategories, collections: chosenCollections };
}

/** Bant kompozisyonunun girdisi — uç küresel listeyi verir; test kendi kurduğu satırları verir. */
interface HomeBandPools {
  /** AKTİF kategoriler, `sortOrder` sırasında (`CategoryService.list`). */
  categories: Category[];
  /** AKTİF koleksiyonlar + üye ürün kimlikleri (`listWithProductIds` — üyelik gömülü, N+1 yok). */
  collections: Array<Collection & { productIds: string[] }>;
}

/**
 * Çok dilli metni çözer; boş/boşluk `null` sayılır — altyazı ve rozet boşuna açılmasın.
 * Dışa verilir: paket ucu (`api/v1/packages.ts`) açıklamayı aynı kuralla indirger — ikinci tanım
 * açılmaz (`catalog.ts`teki `UNKNOWN_PLACE`/`readViewer` ihracının aynı deseni).
 */
export function resolvedOrNull(value: LocalizedText | null, locale: PreferredLanguage): string | null {
  if (!value) return null;
  const text = resolveLocalizedText(value, locale).trim();
  return text.length > 0 ? text : null;
}

function toBand(
  kind: HomeBandKind,
  row: { slug: string; name: LocalizedText } & ImageMeta,
  subtitle: LocalizedText | null,
  productCount: number,
  locale: PreferredLanguage,
  campaign: ScopeCampaign | undefined,
): HomeBand {
  return {
    kind,
    slug: row.slug,
    name: resolveLocalizedText(row.name, locale),
    // `null` = yazılmamış; yedek metin UYDURULMAZ (sözleşme künyesi — ada düşmek tekrar üretirdi).
    subtitle: resolvedOrNull(subtitle, locale),
    productCount,
    image: imageOf(row),
    // Kampanyanın ADI burada çözülür (sözleşme tek dize taşır); tutar çözülmez, çünkü taşınan şey
    // tutar değil kuralın kendisi — ekran onu kendi diliyle cümleye döker.
    campaign:
      campaign === undefined
        ? null
        : {
            label: resolvedOrNull(campaign.label, locale),
            percent: campaign.percent,
            amountCents: campaign.amountCents,
            minBasketCents: campaign.minBasketCents,
          },
  };
}

/**
 * Bant karışımını kurar: seç → SEÇİLENLER için say → boş kapıyı düşür → karıştır.
 *
 * Sıra maliyeti belirliyor (web koleksiyon bandının aynı gerekçesi): sayım sorgusu yalnız seçilen
 * ≤6 kayıt için atılır; ters sırada bandın maliyeti katalogdaki kategori/koleksiyon sayısıyla
 * büyürdü. Sayaç kataloğun ölçütüyle AYNI (`status: 'active'`; koleksiyonda aktif ÜYE) —
 * üyelik/kayıt sayısını basmak kartı yalancı yapardı.
 *
 * **Ürünü kalmamış bant karta GİRMEZ** (web emsali: tıklanınca boş katalog açan kapı, kapı
 * değildir) — sayımdan sonra düşer ve dizi kısalır; yerine yenisi SAYILMAZ (sayım maliyeti sabit
 * kalsın, "olduğu kadar" esnemesi 08.08 kararında zaten var). Sözleşmenin `positive` kilidi de bu.
 */
export async function composeHomeBands(
  db: SupabaseClient,
  locale: PreferredLanguage,
  pools: HomeBandPools,
  rng: Rng = dailyRng(),
): Promise<HomeBand[]> {
  /* Kampanya okuması SEÇİMDEN ÖNCE: seçimin kendisi kampanyalıyı öne alıyor (`selectHomeBandSources`
     künyesi), yani sonradan sorulamaz. Tek okuma — havuzun tamamı için, kimlik başına sorgu yok. */
  const campaigns = await readScopeCampaigns(db, {
    categoryIds: pools.categories.map((c) => c.id),
    collectionIds: pools.collections.map((c) => c.id),
  });
  const chosen = selectHomeBandSources(pools.categories, pools.collections, rng, campaigns);

  const products = new ProductService(db);
  const [categoryCounts, collectionCounts] = await Promise.all([
    Promise.all(chosen.categories.map((c) => products.countMatching({ categoryId: c.id, status: 'active' }))),
    Promise.all(
      chosen.collections.map((c) =>
        // Üyesiz koleksiyona sorgu atılmaz: boş `ids` süzgeci "süzgeçsiz" okunurdu (web'in aynı korunması).
        c.productIds.length === 0 ? Promise.resolve(0) : products.countMatching({ ids: c.productIds, status: 'active' }),
      ),
    ),
  ]);

  const categoryBands = chosen.categories
    .map((c, i) => toBand('category', c, c.tagline, categoryCounts[i] ?? 0, locale, campaigns.byCategory.get(c.id)))
    .filter((band) => band.productCount > 0);
  const collectionBands = chosen.collections
    .map((c, i) => toBand('collection', c, c.description, collectionCounts[i] ?? 0, locale, campaigns.byCollection.get(c.id)))
    .filter((band) => band.productCount > 0);

  return interleaveAtRandom(categoryBands, collectionBands, rng);
}

/** Uçtan çağrılan hâli — havuzları küresel listeden kurar (2 okuma), kuralı kompozisyona bırakır. */
export async function readHomeBands(db: SupabaseClient, locale: PreferredLanguage, rng: Rng = dailyRng()): Promise<HomeBand[]> {
  const [categories, collections] = await Promise.all([
    new CategoryService(db).list({ activeOnly: true }),
    new CollectionService(db).listWithProductIds({ activeOnly: true }),
  ]);
  return composeHomeBands(db, locale, { categories, collections }, rng);
}

/** Kartın fırsat hâline geçtiğinin tek ölçütü: motor teklifi kazandırdı → üstü çizili referans var. */
function hasWonOffer(p: StorefrontProduct): p is StorefrontProduct & { wasCents: number } {
  return p.wasCents !== undefined;
}

/**
 * Fırsat kartları — application'ın MEVCUT kapısından (`getCatalogData` + `onlyOffers`): teklifli
 * ürünlerin bulunması, fiyatın motora çözdürülmesi ve kart indirgemesi web katalogunun okuduğu
 * kararların TAM AYNISI. Web ana sayfasının `readOffers`ı kopyalanmadı; buradaki tek iş sözleşme
 * daraltması — teklif normal fiyatı YENMEDİYSE `wasCents` doğmaz ve kart fırsat bandına giremez
 * (web `isOffer` süzgecinin teli; karar motorun, süzgeç sonucu okur).
 *
 * Bedeli bilinçli: kapı bu uçta kullanılmayan iki okuma da yapar (kategori listesi + süzgeç
 * sayacı). Kopyasız tek yol buydu; tur sayısı rapora ölçülü yazıldı, tek-okumaya indirme kararı
 * gecikme ölçümüyle birlikte verilecek (STACK "Okumada RPC eşiği").
 *
 * ⚠ Yer bilinmezken (`warehouseId: null`) teklif TUTARI hiç okunmaz — verilmiş söz (`catalog.ts`
 * `UNKNOWN_PLACE` künyesi): dizi bugün hep BOŞ döner, yer çözümü terfi edince (21.6 B) dolar.
 */
export async function readHomeOffers(
  db: SupabaseClient,
  locale: PreferredLanguage,
  place: PlaceWarehouses,
  viewer: PricingViewer,
): Promise<Array<StorefrontProduct & { wasCents: number }>> {
  const page = await getCatalogData(db, { locale, query: { onlyOffers: true }, place, viewer, limit: HOME_OFFER_LIMIT });
  return page.products.filter(hasWonOffer);
}

/**
 * Vitrin seçkisi — kataloğun KENDİ `featured` sıralamasından ilk N (application'ın mevcut kapısı;
 * katalog sekmesinin açılış sırasının kendisi). **GEÇİCİ SEÇKİ KURALI** (08.08 ikinci tur): web'in
 * sinyalli seçkisi (`readShowcase` — görüntüleme+sepet sinyali+ayar) KOPYALANMADI; sinyalsiz veride
 * iki yüzey aynı listeyi verir, sinyal birikince ayrışır — web kuralı pakete terfi ettiğinde
 * (defter kaydı 08.08) bu okuma o kapıya döner. BEKLEYEN(21.14).
 *
 * Fiyatsız (satışa kapalı) ürün rayda taşınmaz: kart fiyat etiketi zorunlu bir gezinme davetidir.
 */
export async function readHomeFeatured(
  db: SupabaseClient,
  locale: PreferredLanguage,
  place: PlaceWarehouses,
  viewer: PricingViewer,
): Promise<StorefrontProduct[]> {
  const page = await getCatalogData(db, { locale, query: {}, place, viewer, limit: HOME_FEATURED_LIMIT });
  return page.products.filter((p) => p.priceCents !== null);
}

/*
 * TARİF ve PAKET KARTLARI ARTIK BURADA DEĞİL — `lib/ideas.ts`te (09.08).
 *
 * Fikirler sekmesi (`GET /recipes` · `GET /packages`) aynı kartların İKİNCİ tüketenini doğurdu;
 * kartı vitrinin dosyasında bırakıp listeye ikinci bir indirgeme yazmak aynı kartın iki tanımı
 * olurdu (CLAUDE §1). Vitrin ucu artık o kapıyı kendi sınırlarıyla çağırıyor
 * (`readRecipeCards` / `readPackageCards`); sınır sabitleri de kartla birlikte taşındı.
 */
