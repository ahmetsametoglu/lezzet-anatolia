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

// R2 host'u: public okuma adresi (05.11) — bugün r2.dev geliştirme adresi, alan adı gelince
// cdn.<domain> buraya eklenir. S3 API host'u (*.r2.cloudflarestorage.com) BİLEREK yok: imzalı okuma
// kalktı, yükleme sunucu tarafında — tarayıcı o host'a hiç gitmiyor, izin vermek gereksiz yüzey.
// Görsel <img>=img-src; ileride tarayıcıdan doğrudan yükleme/fetch için connect-src.
const R2_HOSTS = 'https://*.r2.dev';

// Stripe host'ları (07.5) — kart alanı KENDİ checkout sayfamızda, Stripe'ın `PaymentElement`
// iframe'i içinde (ADR Sapma 6). Barındırılan Checkout'a yönlendirseydik hiçbiri gerekmezdi;
// içeri alınca üç yönün de açılması şart ve Stripe'ın belgelediği liste tam olarak bu:
//   script-src  → `js.stripe.com` (Stripe.js'in kendisi; engellenince kart alanı HİÇ çizilmez)
//   frame-src   → aynı host + `hooks.stripe.com` (kart alanı ve 3-D Secure doğrulaması iframe'de)
//   connect-src → `api.stripe.com` (jeton ve ödeme onayı çağrıları)
// Kart bilgisi bu iframe'in içinde kalır: bizim sayfamız da, sunucumuz da onu hiç görmez.
const STRIPE_SCRIPT = 'https://js.stripe.com';
const STRIPE_FRAME = 'https://js.stripe.com https://hooks.stripe.com';
const STRIPE_API = 'https://api.stripe.com';

/**
 * Güvenlik başlıkları (referans deseninden uyarlandı). CSP host'ları modül geldikçe genişler.
 * Bugün: self + Supabase + R2 görselleri + Stripe (kart alanı, 07.5) + next/font (self-hosted).
 */
function securityHeaders(): Array<{ key: string; value: string }> {
  const { http: sbHttp, ws: sbWs } = supabaseOrigins();
  const isProd = process.env.NODE_ENV === 'production';
  // Dev'de Turbopack/HMR eval kullanır; prod'da hariç.
  const scriptExtra = isProd ? '' : " 'unsafe-eval'";

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' ${STRIPE_SCRIPT}${scriptExtra}`,
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${sbHttp} ${sbWs} ${R2_HOSTS} ${STRIPE_API}`.replace(/\s+/g, ' ').trim(),
    `img-src 'self' data: blob: ${sbHttp} ${R2_HOSTS}`.replace(/\s+/g, ' ').trim(),
    "font-src 'self' data:",
    `frame-src 'self' ${STRIPE_FRAME}`,
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
