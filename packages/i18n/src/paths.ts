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
// **Neden `index`te değil de KENDİ modülünde (26.08, ölçüldü):** `apps/mobile/app.config.ts` bu
// tabloyu Metro'dan ÖNCE, Node'un kendi ESM yükleyicisiyle okur ve Node uzantısız göreli ihracı
// (`export … from './locale'`) çözemez — index'e `./locale` ayrıştırması gelince `expo start`
// `ERR_MODULE_NOT_FOUND` ile kesildi (MB-42'nin birebir tekrarı; çare de aynısı:
// `design-tokens/customer` gibi ALT YOL İHRACI + yaprak modül). Bu dosyanın tek göreli bağı
// `import type` — derlemede silinir, çalışma anında bağ bırakmaz. **Buraya değer importu eklemek
// bu yüzden YASAK**: eklendiği gün `expo start` yine kırılır ve hata mesajı sebebini söylemez.
//
// Yeni müşteri rotası buraya iç→dil eşlemesiyle eklenir. Operasyon yüzeyi (Türkçe, öneksiz) bu
// tablonun DIŞINDA.

import type { Locale } from './locale';

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
  /**
   * Tarifler — "Sofradan Fikirler" (08.24). Segment üç dilde de yemek tarifinin kendi sözcüğü:
   * sayfa aramadan trafik alır ("recette börek", "türkisches rezept") ve marka sözcüğü değil ARAMA
   * sözcüğü olduğu için çevrilir — `/professionals`ta verilen kararın tersi yönü, aynı ölçüt.
   *
   * Slug dil-bağımsızdır (içerikten türer, `RecipeService.createWithItems`): paylaşılan bağ hangi
   * dilde açılırsa açılsın aynı tarife düşer.
   */
  '/recipes': { fr: '/recettes', de: '/rezepte', tr: '/tarifler' },
  '/recipe/[slug]': { fr: '/recette/[slug]', de: '/rezept/[slug]', tr: '/tarif/[slug]' },
  // Hesap grubu (08.5). Segment kelimeleri dile göre; iç yol İngilizce kalır.
  '/account': { fr: '/compte', de: '/konto', tr: '/hesap' },
  '/orders': { fr: '/commandes', de: '/bestellungen', tr: '/siparislerim' },
  // Sipariş bildirimi maillerinin hedefleri (14.5). Sayfaların kendisi modül 08'de doğar; adres
  // eşlemesi BURADA durur çünkü URL'in tek kaynağı bu tablodur — mail kendi yolunu kurmaz.
  '/orders/[reference]': { fr: '/commandes/[reference]', de: '/bestellungen/[reference]', tr: '/siparislerim/[reference]' },
  /**
   * Bildirim AKIŞI (14.15) — hesap zilinin listesi. "notifications" kelimesi akışındır: müşteri
   * zile basınca bildirimlerini bekler, ayar anahtarlarını değil. Tercih sayfası bu kelimeyi
   * 22.08–26.08 arasında taşıdı ve 14.15'te `/account/preferences`a taşındı (greenfield — canlıya
   * çıkmış mail bağı yok; KARARLAR 26.08 girdisi).
   */
  '/account/notifications': { fr: '/compte/notifications', de: '/konto/benachrichtigungen', tr: '/hesap/bildirimler' },
  /** Bildirim TERCİHLERİ (22.08) — mail altbilgisinin "tercihlerinizi yönetin" hedefi; jetonla da açılır. */
  '/account/preferences': { fr: '/compte/preferences', de: '/konto/einstellungen', tr: '/hesap/bildirim-tercihleri' },
  // Puan geçmişi (20.08) — hesabın "Son kazanımlar" listesinin tam dökümü; sayfalıdır (defter
  // sınırsız büyür → keyset). Segment üç dilde de programın kendi sözcüğü.
  '/account/points': { fr: '/compte/points', de: '/konto/punkte', tr: '/hesap/puan-gecmisi' },
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
   * Davet karşılaması (17.9) — **menüde yoktur, tek giriş yolu paylaşılan bağlantıdır** ve
   * `[code]` müşterinin `referral_code`üdür (oturum yerine GEÇMEZ: kod kimlik değil, davetiyedir).
   *
   * Segment üç dilde de davetin kendi sözcüğü, çünkü bu adres bir ARAMA sözcüğü değil ama bir
   * GÜVEN sözcüğüdür: bağlantı WhatsApp'ta tanıdıktan gelir ve alan kişi adresi okur. Fransızcada
   * `parrainage` ("referans/sponsorluk") programın piyasadaki adıdır; Almanca `einladung` ve
   * Türkçe `davet` düz karşılıklar.
   *
   * Kod dil-bağımsızdır (`/product/[slug]`in aynı kararı): paylaşılan bağ hangi dilde açılırsa
   * açılsın aynı getirene düşer.
   */
  '/invite/[code]': { fr: '/parrainage/[code]', de: '/einladung/[code]', tr: '/davet/[code]' },
  /**
   * Komşu daveti karşılaması (17.10) — `/invite/[code]`in KARDEŞİ ama AYRI rota, bilerek.
   *
   * İkisi de bir davet bağlantısı ama sözleri farklı: getiren daveti "bize katıl" der ve süresizdir;
   * bu "şu güne, bu sefere yetiş" der ve kesim saatinde ölür. Tek rotada birleştirilselerdi karşılama
   * sayfası belirtecin türünü tahmin etmek zorunda kalır, iki farklı ömür tek adresin arkasında
   * gizlenirdi. Ayrı adres, sayfanın ne söyleyeceğini adresin kendisinden belli ediyor.
   *
   * Segment üç dilde de "komşu" sözcüğüdür: bağlantıyı alan kişi kimden geldiğini adreste görüyor.
   */
  '/neighbor/[token]': { fr: '/voisin/[token]', de: '/nachbarn/[token]', tr: '/komsu/[token]' },
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
  /**
   * Keşif — aday ürün kaydırma (08.7 · 17.3). Segment üç dilde de fiilin kendisi: ziyaretçi
   * "keşfet" diye arar, "aday ürün" diye değil (tasarım §6: iç kavramlar görünmez).
   */
  '/discover': { fr: '/decouverte', de: '/entdecken', tr: '/kesfet' },
  /**
   * B2B tanıtım + self-servis kayıt (08.7). **Menüdeki etiket üç dilde de "Professionnels"**
   * (tasarımın kararı: marka sözcüğü), ama ADRES dile göre çevrilir ve bu ikisi çelişmez —
   * etiket bir marka işareti, URL bir ARAMA sözcüğüdür. Alman restoran sahibi "Professionnels"
   * diye aramaz; yasal sayfalarda verilen kararın aynısı (aşağıdaki künye).
   */
  '/professionals': { fr: '/professionnels', de: '/geschaeftskunden', tr: '/kurumsal' },
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
