import type { MetadataRoute } from 'next';
import { brand } from '@lezzet/brand';
import { customerSand } from '@lezzet/design-tokens/customer';
import type { Locale } from '@lezzet/i18n/locale';

/**
 * Üç dilin manifesti tek uygulamadır: `id` sabit, yoksa aynı müşteri her dilden ayrı bir uygulama kurardı. Açılış adresi dile
 * göre, kurulan uygulama müşterinin kurduğu dilde açılsın.
 */
export function pwaManifest(locale: Locale, description: string): MetadataRoute.Manifest {
  return {
    id: '/',
    name: brand.name,
    short_name: brand.name,
    description,
    lang: locale,
    start_url: `/${locale}`,
    scope: '/',
    display: 'standalone',
    background_color: customerSand['sand-25'],
    theme_color: customerSand['sand-25'],
    icons: [
      { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Android ikonu daireye kırpar; bu görselde işaret güvenli alanın içinde durur.
      { src: '/pwa/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
