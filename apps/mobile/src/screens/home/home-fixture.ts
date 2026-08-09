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

/*
  BANTLAR · SEÇKİ · TARİFLER · PAKETLER BURADA DEĞİL (21.14b): sözleşmeleri geldi (`HomeBand` ·
  `CatalogProduct` · `HomeRecipe` · `HomePackage`, `@lezzet/types`) ve ekran onları GERÇEK uçtan
  okuyor (`use-home.hook`) — künyenin "sözleşme geldiğinde bu tipler silinir" sözü o bölümler için
  yerine getirildi. Kalanlar hâlâ fixture ve sebepleri ayrı: kimlikli bölümler (selamlama · puan ·
  süren sipariş · bildirim) giriş akışının bağlanmasını bekliyor; günün fırsatının seçim kuralı
  henüz hiçbir yüzeyde kararlaştırılmadı.

  FIRSATLAR DA ARTIK BURADA DEĞİL (09.08): kullanıcı isteği üzerine bölümün gerçekten bağlı olup
  olmadığı ölçüldü — bağlı DEĞİLDİ, sözleşmesi (`HomeOfferSchema`) hazır olduğu hâlde ekran
  fixture'daki iki kartı çiziyordu. Bugün `/home`un `offers` dizisinden okunuyor. Uç o diziyi
  şimdilik BOŞ döndürüyor (`home.ts` yeri `UNKNOWN_PLACE` ile çözüyor: teklif tutarı yer
  bilinmeden hiç okunmaz) — yani bölüm çizilmiyor. Uydurma iki kart basmak, olmayan bir indirimi
  varmış gibi göstermekti; boş bırakmak arızayı görünür kılıyor (terfi ihtiyacı raporlandı).
*/
export interface HomeData {
  customer: HomeCustomerView;
  /** Süren sipariş — yoksa bant çizilmez. */
  liveOrder: HomeLiveOrderView | null;
  /** Süren sipariş YOKKEN gösterilen "tekrarla" bandı (şablon ikisini birlikte çizmez). */
  lastOrder: HomeLastOrderView | null;
  flashDeal: HomeFlashDealView | null;
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
 * B2C müşteri, süren bir sipariş ve günün fırsatı.
 * `overrides` ile her test/demo kendi hâlini kurar (misafir, boş vitrin, B2B).
 */
export function homeData(overrides: Partial<HomeData> = {}): HomeData {
  return {
    customer: {
      firstName: 'Ayşe',
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
    ...overrides,
  };
}
