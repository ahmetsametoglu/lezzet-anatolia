// @lezzet/i18n — dil birimleri (locale union) + ortak yerelleştirme sabitleri + URL yol tablosu.
// Arayüz metinleri her sayfanın kendi colocated JSON'unda; burada yalnız locale tanımı.
// Tarayıcı dili tespiti ve next-intl yönlendirmesi apps/web'de; yol TABLOSU burada (aşağı bak).
export const PACKAGE = '@lezzet/i18n' as const;

/** Müşteri yüzeyinde desteklenen diller. Operasyon yüzeyi yalnız Türkçedir. */
export const LOCALES = ['tr', 'fr', 'de'] as const;
export type Locale = (typeof LOCALES)[number];

/** Öneksiz varsayılan (birincil pazar Fransa) — `/connexion` = fr, `/de/...`, `/tr/...`. */
export const DEFAULT_LOCALE: Locale = 'fr';

/**
 * Locale-anahtarlı bir metin nesnesinden ({tr,fr,de:{…}}) seçili dilin şeklini verir.
 * Sayfa metin tiplerini `messages.json`'dan türetmek için: `type M = LocalizedCopy<typeof messages>`.
 * Diller özdeş varsayılır; değilse `[Locale]` birleşimi paritesizliği tipçe yüzeye çıkarır.
 */
export type LocalizedCopy<T extends Record<Locale, unknown>> = T[Locale];

// ── Müşteri yüzeyi URL yol tablosu ───────────────────────────────────────────
//
// **İç yol İngilizce, dış URL dile göre** (SEO_I18N): klasör adı `/checkout`, adres çubuğunda
// `/commande`. Slug içerikten türer (dil-bağımsız), burada değil.
//
// **Neden apps/web'de değil de burada:** bu tablo URL'in TEK KAYNAĞI ve onu iki uygulama okuyor.
// `apps/web` next-intl yönlendirmesini bununla kurar; `apps/backend` ise zamanlı işlerden giden
// bildirimlerin bağlantısını bununla üretir (davet maili). Tablo web'de kalsaydı backend kendi
// kopyasını taşımak zorunda kalırdı — ve bir rota değiştiğinde iki kopyadan biri sessizce eskir,
// giden mailin bağlantısı 404'e düşerdi. Kimse de fark etmezdi: mail gider, tıklanmaz.
//
// Yeni müşteri rotası buraya iç→dil eşlemesiyle eklenir. Operasyon yüzeyi (Türkçe, öneksiz) bu
// tablonun DIŞINDA.

/** Bir rotanın dile göre yolu: tüm dillerde aynıysa düz metin, değilse dil tablosu. */
type PathEntry = string | Record<Locale, string>;

export const PATHNAMES = {
  '/': '/',
  '/login': { fr: '/connexion', de: '/anmelden', tr: '/giris' },
  '/catalog': { fr: '/catalogue', de: '/katalog', tr: '/katalog' },
  // Slug dil-bağımsızdır (içerikten türer) — yalnız segment kelimesi çevrilir. Böylece paylaşılan
  // link hangi dilde açılırsa açılsın aynı ürüne düşer; sosyal/WhatsApp trafiği bu sayfaya gelir.
  '/product/[slug]': { fr: '/produit/[slug]', de: '/produkt/[slug]', tr: '/urun/[slug]' },
  '/cart': { fr: '/panier', de: '/warenkorb', tr: '/sepet' },
  // Checkout = "commande" (FR) · "Kasse" (DE) · "ödeme" (TR) — sepetteki düğmenin sözcüğüyle aynı
  // ("Passer à la commande" · "Zur Kasse" · "Ödemeye geç"). URL ile düğme ayrı kelime kullansaydı
  // müşteri adres çubuğunda başka bir yere geldiğini sanardı.
  '/checkout': { fr: '/commande', de: '/kasse', tr: '/odeme' },
  // Ödeme dönüşünün indiği sayfa. Sipariş numarası YOLDA taşınır: dönüş adresi Stripe'ta oturum
  // açılırken yazılıyor ve sorgu dizesiyle taşınan referans paylaşılan bir linkte kaybolur.
  '/checkout/[reference]': { fr: '/commande/[reference]', de: '/kasse/[reference]', tr: '/odeme/[reference]' },
  // Paket = "coffret" (FR) · "Paket" (DE) — kart ve menü metinleriyle aynı sözcük.
  '/packages': { fr: '/coffrets', de: '/pakete', tr: '/paketler' },
  '/package/[slug]': { fr: '/coffret/[slug]', de: '/paket/[slug]', tr: '/paket/[slug]' },
  // Hesap grubu (08.5). Segment kelimeleri dile göre; iç yol İngilizce kalır.
  '/account': { fr: '/compte', de: '/konto', tr: '/hesap' },
  '/orders': { fr: '/commandes', de: '/bestellungen', tr: '/siparislerim' },
  // Sipariş bildirimi maillerinin hedefleri (14.5). Sayfaların kendisi modül 08'de doğar; adres
  // eşlemesi BURADA durur çünkü URL'in tek kaynağı bu tablodur — mail kendi yolunu kurmaz.
  '/orders/[reference]': { fr: '/commandes/[reference]', de: '/bestellungen/[reference]', tr: '/siparislerim/[reference]' },
  '/account/notifications': { fr: '/compte/notifications', de: '/konto/benachrichtigungen', tr: '/hesap/bildirim-tercihleri' },
  '/support': { fr: '/assistance', de: '/anfrage', tr: '/talep' },
  // Talep açma (08.6). Statik segment `[ticket]`ten önce çözülür — "new" adında bir talep kimliği
  // olamaz (kimlikler uuid), yani çakışma yapısal olarak imkânsız.
  '/support/new': { fr: '/assistance/nouvelle', de: '/anfrage/neu', tr: '/talep/yeni' },
  // Talep detayı — cevap/durum maillerinin hedefi (14.7 · 16.4). Sayfanın kendisi 16.2'de doğar;
  // adres eşlemesi burada durur çünkü URL'in tek kaynağı bu tablodur.
  '/support/[ticket]': { fr: '/assistance/[ticket]', de: '/anfrage/[ticket]', tr: '/talep/[ticket]' },
  // Alım-sonrası değerlendirme daveti (17.2). **Menüde yoktur, tek giriş yolu bağlantıdır** ve
  // `[token]` oturum yerine geçer (design/pages/musteri-geri-bildirim.md). Adres eşlemesi davet
  // gönderiminden önce burada duruyor: bağlantıyı üreten backend, sayfayı yazan müşteri yüzeyi —
  // ikisi de aynı satırı okusun ki yol tek kararla belirlensin.
  '/feedback/[token]': { fr: '/avis/[token]', de: '/bewertung/[token]', tr: '/degerlendirme/[token]' },
  /**
   * Statik/yasal sayfalar (08.8). **Beş ayrı rota, tek `[slug]` DEĞİL** — ve sebebi burada yazılı
   * olmalı çünkü ilk bakışta dinamik segment daha ekonomik görünür.
   *
   * Dinamik segmentin değeri dile göre değişmez (`/product/[slug]` künyesinde yazdığı gibi, slug
   * içerikten türer ve paylaşılan bağ hangi dilde açılırsa açılsın aynı yere düşsün diye böyledir).
   * Yasal sayfalarda ise dile göre değişmesi gereken tam olarak segmentin KENDİSİDİR: Fransız
   * ziyaretçi `mentions-legales`, Alman `impressum` arar ve bu sayfalar trafiğin çoğunu arama
   * motorundan alır. `/legal/[slug]` yazılsaydı üç dilde de aynı İngilizce slug görünürdü.
   *
   * İç yol İngilizce kalır (`/legal/...`), dışarıya çıkan dile göre — `CLAUDE.md §2`'nin kuralı.
   */
  '/legal/terms': { fr: '/mentions-legales', de: '/impressum', tr: '/yasal-bilgiler' },
  '/legal/sales': { fr: '/conditions-generales-de-vente', de: '/agb', tr: '/satis-kosullari' },
  '/legal/privacy': { fr: '/confidentialite', de: '/datenschutz', tr: '/gizlilik' },
  '/legal/delivery': { fr: '/livraison-et-retours', de: '/lieferung-und-ruecksendung', tr: '/teslimat-ve-iade' },
  '/legal/faq': { fr: '/questions-frequentes', de: '/haeufige-fragen', tr: '/sikca-sorulan-sorular' },
} as const satisfies Record<string, PathEntry>;

export type AppRoute = keyof typeof PATHNAMES;

/** Bir rotanın seçili dildeki yolu — `[param]` yer tutucuları doldurulmuş, önek YOK. */
export function localizedPath(route: AppRoute, locale: Locale, params: Record<string, string> = {}): string {
  const entry: PathEntry = PATHNAMES[route];
  const template = typeof entry === 'string' ? entry : entry[locale];
  return Object.entries(params).reduce((path, [key, value]) => path.replace(`[${key}]`, encodeURIComponent(value)), template);
}

/**
 * Dış dünyaya verilecek TAM adres (mail, WhatsApp, paylaşılan bağlantı) — dil öneki dâhil.
 *
 * Köken ortamdan gelir; yereldeki geliştirme sunucusu da üretimdeki alan adı da aynı çağrıyı
 * kullanır. Varsayılan üretim alan adıdır: kökeni okuyamayan bir gönderim, bağlantısız bir mail
 * yollamaktansa doğru adrese yollamayı denemelidir.
 */
export function localizedUrl(route: AppRoute, locale: Locale, params: Record<string, string> = {}): string {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lezzetanatolia.fr';
  return `${origin}/${locale}${localizedPath(route, locale, params)}`;
}
