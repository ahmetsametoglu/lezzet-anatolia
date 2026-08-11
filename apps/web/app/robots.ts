import type { MetadataRoute } from 'next';
import { LOCALES, localizedPath, siteOrigin, type AppRoute } from '@lezzet/i18n';

/**
 * `robots.txt` (08.1) — neyin taranmayacağı ve site haritasının nerede olduğu.
 *
 * **Kapatılanlar kişiye özel ya da oturumlu yüzeyler.** Sepet, checkout, hesap, siparişler,
 * talepler, giriş ve değerlendirme daveti: hiçbiri arama sonucunda anlamlı değil, üstelik bazıları
 * belirteçle açılıyor (`/feedback/[token]`) — taranan bir belirteç, kayıtlara düşen bir belirteçtir.
 *
 * **Yollar TABLODAN türetiliyor**, elle yazılmıyor: kural `/panier`, `/warenkorb` ve `/sepet` için
 * ayrı ayrı yazılmalı ve biri unutulduğunda o dilin sepeti sessizce indekse açık kalır. Tablodan
 * türetince "hangi rota kapalı" tek bir kararda durur, üç dilde de uygulanır.
 *
 * Operasyon yüzeyi (`/operations`) de kapalı: personel ekranı, dil öneki taşımaz, tek satır yeter.
 */

/** Taranmaması gereken müşteri rotaları — kişiye özel ya da oturum gerektiren her şey. */
const PRIVATE_ROUTES: AppRoute[] = [
  '/cart',
  '/checkout',
  '/login',
  '/account',
  '/account/notifications',
  '/orders',
  '/support',
  '/feedback/[token]',
  // Davet karşılaması (17.9): kod bir belirteç değil ama BAŞKASININ künyesidir — taranan bir
  // davet bağlantısı, sahibinin adını arama sonucuna taşır. Sayfanın arama trafiğinden de
  // beklentisi yok: tek giriş yolu paylaşılan bağlantı.
  '/invite/[code]',
];

export default function robots(): MetadataRoute.Robots {
  const disallow = ['/operations', '/api'];
  for (const route of PRIVATE_ROUTES) {
    for (const locale of LOCALES) {
      // Parametreli yollarda yer tutucu atılır (`/avis/[token]` → `/avis`). Sonuna eğik çizgi
      // KONMAZ: `robots.txt` kuralları ÖNEK eşleşir, yani `/fr/commandes` hem listeyi hem
      // altındaki bütün sipariş detaylarını kapatır. Eğik çizgi eklenseydi listenin kendisi
      // (`/fr/commandes`) kuralın dışında kalır ve indekse açık kalırdı.
      const path = localizedPath(route, locale).replace(/\/\[[^\]]+\]$/, '');
      disallow.push(`/${locale}${path}`);
    }
  }

  return {
    rules: { userAgent: '*', allow: '/', disallow: [...new Set(disallow)].sort() },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
