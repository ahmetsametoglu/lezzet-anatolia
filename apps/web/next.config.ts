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

// Alan adı koda yazılmaz, `R2_PUBLIC_BASE_URL`den türer: env değişince CSP yeni kökü kendiliğinden tanır.
const R2_PUBLIC_ORIGIN = (() => {
  try {
    return process.env.R2_PUBLIC_BASE_URL ? new URL(process.env.R2_PUBLIC_BASE_URL).origin : '';
  } catch {
    return ''; // bozuk env: CSP'ye çöp yazmaktansa r2.dev'le kal — görsel çizilmez, sayfa çökmez
  }
})();
const R2_HOSTS = ['https://*.r2.dev', R2_PUBLIC_ORIGIN].filter(Boolean).join(' ');

// İmzalı adreslerin S3 host'u: tarayıcı teslim kanıtını doğrudan buraya yükler (`connect-src`), private kovadaki fotoğraf ve sesi
// buradan okur (`img-src`, `media-src`). Dosyayı sunucudan geçirmek onu iki kez taşımak ve Next'in gövde sınırına takılmak olurdu.
const R2_S3_HOST = 'https://*.r2.cloudflarestorage.com';

// Kart alanı kendi checkout sayfamızda Stripe iframe'i içinde durduğu için script, çerçeve, istek ve görsel yönlerinin dördü de açık.
// `*.js.stripe.com` joker'i şart: Stripe kart çerçevesini değişen bir alt adresten açabiliyor, yalnız çıplak host'a izin verilince alan ara ara hiç çizilmiyor.
const STRIPE_SCRIPT = 'https://js.stripe.com https://*.js.stripe.com';
const STRIPE_FRAME = 'https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com';
const STRIPE_API = 'https://api.stripe.com';
const STRIPE_IMG = 'https://*.stripe.com';

// Google karoları `<img>` olarak (`img-src`), görünen alanın telif satırı `fetch` ile (`connect-src`) aynı host'tan gelir; giden istek
// karo koordinatı, oturum jetonu ve herkese açık tarayıcı anahtarıdır.
const MAP_TILES = 'https://tile.googleapis.com';

// Adres önerisi tarayıcıdan çağrılır: servisin sınırı IP başınadır ve sunucudan geçseydi bütün müşteriler tek IP'yi paylaşırdı.
// Açılan yüzey yalnız `connect-src`; giden tek şey müşterinin yazdığı adres metnidir, kimlik ve çerez gitmez.
const BAN_API = 'https://data.geopf.fr';

/** Güvenlik başlıkları; her CSP host'unun gerekçesi kendi sabitinin üstünde. */
function securityHeaders(): Array<{ key: string; value: string }> {
  const { http: sbHttp, ws: sbWs } = supabaseOrigins();
  const isProd = process.env.NODE_ENV === 'production';
  // Dev'de Turbopack/HMR eval kullanır; prod'da hariç.
  const scriptExtra = isProd ? '' : " 'unsafe-eval'";

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' ${STRIPE_SCRIPT}${scriptExtra}`,
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${sbHttp} ${sbWs} ${R2_HOSTS} ${R2_S3_HOST} ${STRIPE_API} ${BAN_API} ${MAP_TILES}`.replace(/\s+/g, ' ').trim(),
    // Leaflet karoları `<img>` olarak yükler; private kovadaki fotoğraflar da imzalı adresle buradan gelir.
    `img-src 'self' data: blob: ${sbHttp} ${R2_HOSTS} ${R2_S3_HOST} ${STRIPE_IMG} ${MAP_TILES}`.replace(/\s+/g, ' ').trim(),
    // Sesli mesaj `<audio>`: yönerge yoksa `default-src 'self'` devreye girer ve kaydı keser.
    `media-src 'self' ${R2_S3_HOST}`,
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
  /**
   * Çıktı dizini env'den: dev sunucusu ile production kopyası aynı `.next`i paylaşınca `next build` dev sunucusunun okuduğu
   * parçaların üstüne yazıp onu çökertiyor. Varsayılan `.next` olduğu için dağıtım değişmez.
   */
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // pino pakete gömülürse transport worker'ı `.next` içinde olmayan bir yolda aranır ve sunucu `MODULE_NOT_FOUND` ile çöker.
  // Beyan yalnız `pino`/`pino-pretty` `apps/web`in kendi bağımlılığıyken işler; kod onları import etmediği için kullanılmıyor görünürler, `knip.json` bu yüzden yoksayar.
  serverExternalPackages: ['pino', 'pino-pretty'],
  // Paketler kaynak olarak dışa verildiği için Next transpile eder (ara derleme yok).
  transpilePackages: [
    '@lezzet/brand',
    // Telefon görünümünün ikon sözlüğü ve çizgi kalınlığı (`@lezzet/design-tokens/icons`).
    '@lezzet/design-tokens',
    '@lezzet/i18n',
    '@lezzet/types',
    '@lezzet/helper',
    '@lezzet/domain-core',
    '@lezzet/application',
    '@lezzet/database',
    '@lezzet/storage',
    // Web doğrudan import etmiyor ama bağımlılık grafiğinde duruyor: listeden düşerse transpile edilmemiş TS olarak paketlenmeye çalışılır.
    '@lezzet/email',
    '@lezzet/notify',
    '@lezzet/ai',
  ],
  experimental: {
    serverActions: {
      /**
       * Kendi görsel sınırımızdan (`IMAGE_MAX_UPLOAD_BYTES`, 8 MB) yüksek olmalı: düşük olsaydı Next isteği kapımıza hiç
       * ulaştırmaz, operatör yazılı kural yerine anlamsız bir ağ hatası görürdü. Aradaki pay çok parçalı gövdenin öteki alanları içindir.
       */
      bodySizeLimit: '10mb',
    },
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders() }];
  },
  /**
   * İşletim sistemleri ilişkilendirme dosyalarını tam olarak `/.well-known/` altında arar; `app/` altında noktayla başlayan
   * klasörün ele alınışı Next sürümüne göre değiştiği için klasör noktasız, adres yeniden yazımla doğru. Middleware bu
   * yolları görmediği için dil öneki eklenmez.
   */
  async rewrites() {
    return [{ source: '/.well-known/:file', destination: '/well-known/:file' }];
  },
};

export default withNextIntl(config);
