import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// Not: env, apps/web/.env.local'den native yüklenir (referans deseni). Kök .env script/backend içindir.

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** Supabase kaynak (origin) ve WebSocket kaynağını doğru şemayla türetir (yerelde http/ws). */
function supabaseOrigins(): { http: string; ws: string } {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return { http: '', ws: '' };
  try {
    const u = new URL(raw);
    const wsScheme = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return { http: u.origin, ws: `${wsScheme}//${u.host}` };
  } catch {
    return { http: '', ws: '' };
  }
}

/**
 * Güvenlik başlıkları (referans deseninden uyarlandı). CSP host'ları modül geldikçe genişler
 * (Stripe 07, R2/storage görselleri ilgili modülde eklenir). Şimdilik: self + Supabase + next/font (self-hosted).
 */
function securityHeaders(): Array<{ key: string; value: string }> {
  const { http: sbHttp, ws: sbWs } = supabaseOrigins();
  const isProd = process.env.NODE_ENV === 'production';
  // Dev'de Turbopack/HMR eval kullanır; prod'da hariç.
  const scriptExtra = isProd ? '' : " 'unsafe-eval'";

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${scriptExtra}`,
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${sbHttp} ${sbWs}`.replace(/\s+/g, ' ').trim(),
    `img-src 'self' data: blob: ${sbHttp}`.replace(/\s+/g, ' ').trim(),
    "font-src 'self' data:",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Yerelde Supabase http; upgrade yalnız prod'da (aksi halde localhost bağlantısı kırılır).
    ...(isProd ? ['upgrade-insecure-requests'] : []),
  ].join('; ');

  return [
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'Content-Security-Policy', value: csp },
  ];
}

const config: NextConfig = {
  reactStrictMode: true,
  // Paketler kaynak olarak dışa verildiği için Next transpile eder (ara derleme yok).
  transpilePackages: [
    '@lezzet/brand',
    '@lezzet/i18n',
    '@lezzet/types',
    '@lezzet/helper',
    '@lezzet/domain-core',
    '@lezzet/database',
    '@lezzet/storage',
    '@lezzet/email',
    '@lezzet/notify',
    '@lezzet/ai',
  ],
  experimental: {
    serverActions: {
      // İleride görsel/dosya yüklemeleri için başlangıç sınırı (modülü gelince ayarlanır).
      bodySizeLimit: '10mb',
    },
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders() }];
  },
};

export default withNextIntl(config);
