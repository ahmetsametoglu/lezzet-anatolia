import type { CustomerOrderStatus } from '@lezzet/types';

/*
  VİTRİN TEST/DEMO VERİSİ — 21.14 ilk etabı UI-only: vitrinin bir UCU YOK (bugün gerçek uç yalnız
  katalog/ürün) ve bu etapta backend işi ÜRETİLMEZ. Ekran o yüzden bu dosyadan besleniyor.

  TİPLER SAYFAYA ÖZEL, `@lezzet/types`a YAZILMADI (görevin açık kısıtı): vitrinin sözleşmesi henüz
  YOK ve olmayan bir sözleşmeyi şimdiden küresel tip olarak açmak, uç yazılırken tersine bir baskı
  kurardı ("tip böyle, uç da böyle olsun"). Sözleşme geldiğinde bu tipler silinir ve ekran
  `@lezzet/types`tan okur; fixture da o gün sözleşme tipiyle yeniden yazılır.

  ORTAK ALAN ADLARI sözleşmedekilerle AYNI YAZILDI (`slug`, `priceCents`, `photoUri`,
  `CustomerOrderStatus`) ki taşınma günü bir çeviri katmanı gerekmesin. Durum enum'u zaten
  şemadan geliyor — orası uydurulmadı.

  PARA CENT: biçimleme cihazda (`formatPrice`), veri ham tam sayı.
  FOTOĞRAF `null`: fixture ağa çıkmaz; daire baş harfle çizilir (tasarımın kendi `noPh` varyantı).
*/

export interface HomeCustomerView {
  /** Giriş yapılmışsa ad (selamlama için); misafirde `null`. */
  firstName: string | null;
  /** Başlıktaki konum hapı — "67000 STRASBOURG". */
  postalLabel: string;
  /** Puan rozeti; B2B ve misafirde `null` (şablonun kendi kuralı: puan yalnız B2C'de). */
  points: number | null;
  /** Toptan (B2B) rozeti. */
  wholesale: boolean;
  /** Zil rozetindeki okunmamış sayısı; 0 ise rozet çizilmez. */
  unreadNotifications: number;
}

export interface HomeLiveOrderView {
  reference: string;
  status: CustomerOrderStatus;
  /** "Bugün 14:00–18:00" gibi teslim penceresi — biçimlenmiş, veriden gelir. */
  dayLabel: string;
}

export interface HomeLastOrderView {
  reference: string;
  totalCents: number;
}

export interface HomeFlashDealView {
  slug: string;
  name: string;
  priceCents: number;
  wasCents: number;
  photoUri: string | null;
  /** Fırsatın bitiş anı (ms) — geri sayım bundan hesaplanır. */
  endsAtMs: number;
}

export interface HomeOfferView {
  slug: string;
  name: string;
  priceCents: number;
  wasCents: number;
  photoUri: string | null;
}

export interface HomeCollectionView {
  slug: string;
  /** Üstbaşlık — büyük harfe komponent çevirir. */
  name: string;
  subtitle: string;
  productCount: number;
  photoUri: string | null;
}

export interface HomeProductView {
  slug: string;
  name: string;
  priceCents: number;
  photoUri: string | null;
}

export interface HomeRecipeView {
  slug: string;
  name: string;
  /** Hazırlık süresi (dk) — cümlesi cihazda kurulur. */
  minutes: number;
  ingredientCount: number;
  photoUri: string | null;
}

export interface HomePackageView {
  slug: string;
  name: string;
  priceCents: number;
  itemCount: number;
  photoUri: string | null;
}

export interface HomeData {
  customer: HomeCustomerView;
  /** Süren sipariş — yoksa bant çizilmez. */
  liveOrder: HomeLiveOrderView | null;
  /** Süren sipariş YOKKEN gösterilen "tekrarla" bandı (şablon ikisini birlikte çizmez). */
  lastOrder: HomeLastOrderView | null;
  flashDeal: HomeFlashDealView | null;
  offers: HomeOfferView[];
  collections: HomeCollectionView[];
  featured: HomeProductView[];
  recipes: HomeRecipeView[];
  packages: HomePackageView[];
}

/** Fırsatın bitişi: şablonda "bugünün sonu" (23:59:59). */
/** Seed kataloğunun R2 görselleri — demo amaçlı (gerekçe `flashDeal.photoUri` yorumunda). */
function demoPhoto(file: string): string {
  return `https://pub-fea54e4ec61347e3ac37a7d45cbee943.r2.dev/dev/catalog/products/${file}`;
}

function endOfToday(): number {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return end.getTime();
}

/**
 * Şablonun kendi vitrini (v3 `V.homeCats` · `V.vitrin` · `V.rcps` · `V.pkgsHome`) — giriş yapmış
 * B2C müşteri, süren bir sipariş, günün fırsatı ve iki fırsat kartı.
 * `overrides` ile her test/demo kendi hâlini kurar (misafir, boş vitrin, B2B).
 */
export function homeData(overrides: Partial<HomeData> = {}): HomeData {
  return {
    customer: {
      firstName: 'Ayşe',
      postalLabel: '67000 STRASBOURG',
      points: 145,
      wholesale: false,
      unreadNotifications: 2,
    },
    liveOrder: { reference: 'LA-2418', status: 'on_the_way', dayLabel: 'Bugün 14:00 – 18:00' },
    lastOrder: null,
    flashDeal: {
      slug: 'kol-boregi',
      name: 'El Açması Kol Böreği',
      priceCents: 890,
      wasCents: 1190,
      // Demo görseller (kullanıcı onayı 08.08): v3 die-cut FOTO çizer, harf yalnız son çaredir.
      // URL'ler seed kataloğunun R2 (internet) görselleri — UI-only etapta ekran v3 gibi görünsün;
      // gerçek bağlanmada bu alanlar uçtan dolacak ve fixture yalnız testlere kalacak.
      photoUri: demoPhoto('fistikli-baklava.jpeg'),
      endsAtMs: endOfToday(),
    },
    offers: [
      { slug: 'antep-fistigi', name: 'Antep Fıstığı', priceCents: 1490, wasCents: 1890, photoUri: demoPhoto('artisan-lemon-cake.webp') },
      { slug: 'kunefelik-peynir', name: 'Künefelik Peynir', priceCents: 640, wasCents: 790, photoUri: demoPhoto('kunefe.jpeg') },
    ],
    collections: [
      { slug: 'borekler', name: 'Börekler', subtitle: 'El açması, fırına hazır', productCount: 12, photoUri: demoPhoto('cevizli-baklava.jpeg') },
      { slug: 'tatlilar', name: 'Tatlılar', subtitle: 'Şerbetli ve sütlü', productCount: 9, photoUri: demoPhoto('kazandibi.jpeg') },
      { slug: 'kahvaltilik', name: 'Kahvaltılık', subtitle: 'Pazar sofrası kurulur', productCount: 14, photoUri: demoPhoto('artisan-mango-cake.webp') },
    ],
    featured: [
      { slug: 'su-boregi', name: 'Su Böreği', priceCents: 1290, photoUri: null },
      { slug: 'manti', name: 'El Mantısı', priceCents: 1090, photoUri: null },
      { slug: 'tulum-peyniri', name: 'Tulum Peyniri', priceCents: 1690, photoUri: null },
      { slug: 'kunefe', name: 'Künefe', priceCents: 950, photoUri: null },
    ],
    recipes: [
      { slug: 'mantili-sofra', name: 'Mantılı Pazar Sofrası', minutes: 45, ingredientCount: 6, photoUri: null },
      { slug: 'kahvalti-tabagi', name: 'Anadolu Kahvaltı Tabağı', minutes: 20, ingredientCount: 8, photoUri: null },
      { slug: 'serbetli-tatlilar', name: 'Şerbetli Tatlı Üçlüsü', minutes: 60, ingredientCount: 5, photoUri: null },
    ],
    packages: [
      { slug: 'kahvalti-paketi', name: 'Kahvaltı Paketi', priceCents: 3490, itemCount: 6, photoUri: null },
      { slug: 'misafir-paketi', name: 'Misafir Sofrası', priceCents: 4290, itemCount: 5, photoUri: null },
    ],
    ...overrides,
  };
}
