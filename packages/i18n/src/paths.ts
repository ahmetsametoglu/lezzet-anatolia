// Müşteri yüzeyi URL yol tablosu — iç yol İngilizce, dış URL dile göre; URL'in tek kaynağı (web, backend, native okur).
// Kendi modülünde ve değer importsuz, çünkü `apps/mobile-customer/app.config.ts` onu Node ESM'le okur ve
// uzantısız göreli ihracı çözemez: buraya değer importu eklenirse `expo start` sebepsiz bir hatayla kırılır.
// Operasyon yüzeyi (Türkçe, öneksiz) bu tablonun dışında.

import type { Locale } from './locale';

/** Bir rotanın dile göre yolu: tüm dillerde aynıysa düz metin, değilse dil tablosu. */
type PathEntry = string | Record<Locale, string>;

export const PATHNAMES = {
  '/': '/',
  '/login': { fr: '/connexion', de: '/anmelden', tr: '/giris' },
  '/catalog': { fr: '/catalogue', de: '/katalog', tr: '/katalog' },
  // Slug dil-bağımsızdır: paylaşılan bağ hangi dilde açılırsa açılsın aynı ürüne düşer.
  '/product/[slug]': { fr: '/produit/[slug]', de: '/produkt/[slug]', tr: '/urun/[slug]' },
  '/cart': { fr: '/panier', de: '/warenkorb', tr: '/sepet' },
  // Sepetteki düğmenin sözcüğüyle aynı; ayrı kelime müşteriye başka yere geldiğini düşündürürdü.
  '/checkout': { fr: '/commande', de: '/kasse', tr: '/odeme' },
  // Sipariş numarası yolda: Stripe dönüş adresinde sorgu dizesi paylaşılan bağda kaybolur.
  '/checkout/[reference]': { fr: '/commande/[reference]', de: '/kasse/[reference]', tr: '/odeme/[reference]' },
  '/packages': { fr: '/coffrets', de: '/pakete', tr: '/paketler' },
  '/package/[slug]': { fr: '/coffret/[slug]', de: '/paket/[slug]', tr: '/paket/[slug]' },
  // Segment arama sözcüğü olduğu için çevrilir ("recette börek", "türkisches rezept").
  '/recipes': { fr: '/recettes', de: '/rezepte', tr: '/tarifler' },
  '/recipe/[slug]': { fr: '/recette/[slug]', de: '/rezept/[slug]', tr: '/tarif/[slug]' },
  '/account': { fr: '/compte', de: '/konto', tr: '/hesap' },
  '/orders': { fr: '/commandes', de: '/bestellungen', tr: '/siparislerim' },
  '/orders/[reference]': { fr: '/commandes/[reference]', de: '/bestellungen/[reference]', tr: '/siparislerim/[reference]' },
  // Hesap zilinin akışı; "notifications" kelimesi akışındır, ayarlar `/account/preferences`ta.
  '/account/notifications': { fr: '/compte/notifications', de: '/konto/benachrichtigungen', tr: '/hesap/bildirimler' },
  /** Bildirim tercihleri — mail altbilgisinin "tercihlerinizi yönetin" hedefi; jetonla da açılır. */
  '/account/preferences': { fr: '/compte/preferences', de: '/konto/einstellungen', tr: '/hesap/bildirim-tercihleri' },
  '/account/points': { fr: '/compte/points', de: '/konto/punkte', tr: '/hesap/puan-gecmisi' },
  '/support': { fr: '/assistance', de: '/anfrage', tr: '/talep' },
  // Statik segment `[ticket]`ten önce çözülür; kimlikler uuid olduğu için çakışma olamaz.
  '/support/new': { fr: '/assistance/nouvelle', de: '/anfrage/neu', tr: '/talep/yeni' },
  '/support/[ticket]': { fr: '/assistance/[ticket]', de: '/anfrage/[ticket]', tr: '/talep/[ticket]' },
  // Menüde yok, tek giriş yolu bağlantı; `[token]` oturum yerine geçer.
  '/feedback/[token]': { fr: '/avis/[token]', de: '/bewertung/[token]', tr: '/degerlendirme/[token]' },
  // Menüde yok; `[code]` getirenin davet kodudur, kimlik değil. Segment güven sözcüğü: bağı alan adresi okur.
  '/invite/[code]': { fr: '/parrainage/[code]', de: '/einladung/[code]', tr: '/davet/[code]' },
  // Getiren davetinden ayrı rota: bu belirteç bir sefere bağlı ve kesim saatinde ölür, iki ömür tek adreste gizlenmesin.
  '/neighbor/[token]': { fr: '/voisin/[token]', de: '/nachbarn/[token]', tr: '/komsu/[token]' },
  // Ziyaretçi "keşfet" diye arar, "aday ürün" diye değil.
  '/discover': { fr: '/decouverte', de: '/entdecken', tr: '/kesfet' },
  '/professionals': { fr: '/professionnels', de: '/geschaeftskunden', tr: '/profesyoneller' },
  // Yasal sayfalar tek `[slug]` değil: dile göre değişmesi gereken segmentin kendisi (`mentions-legales` · `impressum`).
  '/legal/terms': { fr: '/mentions-legales', de: '/impressum', tr: '/yasal-bilgiler' },
  '/legal/sales': { fr: '/conditions-generales-de-vente', de: '/agb', tr: '/satis-kosullari' },
  '/legal/privacy': { fr: '/confidentialite', de: '/datenschutz', tr: '/gizlilik' },
  '/legal/delivery': { fr: '/livraison-et-retours', de: '/lieferung-und-ruecksendung', tr: '/teslimat-ve-iade' },
  '/legal/faq': { fr: '/questions-frequentes', de: '/haeufige-fragen', tr: '/sikca-sorulan-sorular' },
} as const satisfies Record<string, PathEntry>;

export type AppRoute = keyof typeof PATHNAMES;

/**
 * Sepet bağlantı jetonunun sorgu parametresi (`/{dil}/panier?link=…`). Burada, çünkü ara katman da
 * okuyor ve veritabanı çeken uygulama paketini içeri alamaz.
 */
export const CART_LINK_PARAM = 'link';

/** Bir rotanın seçili dildeki yolu — `[param]` yer tutucuları doldurulmuş, önek yok. */
export function localizedPath(route: AppRoute, locale: Locale, params: Record<string, string> = {}): string {
  const entry: PathEntry = PATHNAMES[route];
  const template = typeof entry === 'string' ? entry : entry[locale];
  return Object.entries(params).reduce((path, [key, value]) => path.replace(`[${key}]`, encodeURIComponent(value)), template);
}

/** Dil önekli yol. Kök rota `/fr` olur, `/fr/` değil: sondaki eğik çizgi 308 ile yönlenir. */
export function localizedHref(route: AppRoute, locale: Locale, params: Record<string, string> = {}): string {
  const path = localizedPath(route, locale, params);
  return path === '/' ? `/${locale}` : `/${locale}${path}`;
}
