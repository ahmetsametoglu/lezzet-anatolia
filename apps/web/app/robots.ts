import type { MetadataRoute } from 'next';
import { siteOrigin } from '@lezzet/i18n';
import { PRIVATE_PATH_PREFIXES } from '@/lib/seo/private-routes';

/**
 * `robots.txt` — kişiye özel yüzeyler ve operasyon taranmaz. Kurallar önek eşler, bu yüzden sona
 * eğik çizgi konmaz: `/fr/commandes` hem listeyi hem altındaki detayları kapatır.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api', '/operations', ...PRIVATE_PATH_PREFIXES].sort() },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
