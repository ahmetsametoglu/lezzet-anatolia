import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import siteDescription from '@/lib/seo/site-description.json';
import { pwaManifest } from './pwa-manifest';

// Adres noktalı olduğu için dil ara katmanı bu yola dokunmaz; dil klasörün kendisinden okunur.
export const dynamic = 'force-static';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return new Response(null, { status: 404 });
  return new Response(JSON.stringify(pwaManifest(locale, siteDescription[locale].description)), {
    headers: { 'content-type': 'application/manifest+json' },
  });
}
