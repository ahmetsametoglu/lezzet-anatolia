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
// cdn.<domain> buraya eklenir. Görsel `<img>` = img-src.
const R2_HOSTS = 'https://*.r2.dev';

// S3 API host'u — YALNIZ `connect-src`, yalnız YÜKLEME için (11.2, ölçüldü 08.08).
//
// 05.11'de bilerek dışarıda bırakılmıştı ve o gün doğruydu: *"yükleme sunucu tarafında, tarayıcı o
// host'a hiç gitmiyor"*. Sonra kapı değişti — teslim kanıtının yükleme kapısı (`lib/courier/proof.ts`)
// imzalı adres üretiyor ve künyesi *"dosya SUNUCUDAN GEÇMEZ: tarayıcı doğrudan R2'ye yükler"* diyor.
// CSP o değişiklikte güncellenmedi ve **hiçbir yerde patlamadı, çünkü tüketicisi yoktu**: imzalı
// yükleme kapısı yazıldığı günden beri hiçbir ekrandan çağrılmıyordu (şikâyet eki de dahil).
// Kanıt yakalama bağlanınca ilk PUT'ta göründü — tarayıcı isteği CSP'de kesti, `fetch` hata verdi.
//
// **Neden sunucuya taşımak değil de host açmak:** dosyayı sunucu üzerinden geçirmek fotoğrafı iki kez
// taşımak ve Next'in gövde sınırıyla boğuşmak demek — kapının kendi künyesi bu yolu bilinçle
// reddediyor. Açılan yüzey dar: yalnız `connect-src` (bu host'tan script çalıştırılamaz, çerçeve
// açılamaz), ve giden şey imzalı, süreli (10 dk) bir adrese yapılan tek PUT.
const R2_UPLOAD_HOST = 'https://*.r2.cloudflarestorage.com';

// Stripe host'ları (07.5) — kart alanı KENDİ checkout sayfamızda, Stripe'ın `PaymentElement`
// iframe'i içinde (ADR Sapma 6). Barındırılan Checkout'a yönlendirseydik hiçbiri gerekmezdi;
// içeri alınca üç yönün de açılması şart ve Stripe'ın belgelediği liste tam olarak bu:
//   script-src  → `js.stripe.com` (Stripe.js'in kendisi; engellenince kart alanı HİÇ çizilmez)
//   frame-src   → aynı host + `hooks.stripe.com` (kart alanı ve 3-D Secure doğrulaması iframe'de)
//   connect-src → `api.stripe.com` (jeton ve ödeme onayı çağrıları)
//   img-src     → `*.stripe.com` (kart markası/ödeme yöntemi simgeleri)
// Kart bilgisi bu iframe'in içinde kalır: bizim sayfamız da, sunucumuz da onu hiç görmez.
//
// **`*.js.stripe.com` joker'i ŞART, süs değil.** Stripe kart çerçevesini başarım için değişken bir
// alt kaynaktan (`b.js.stripe.com` gibi) açabiliyor ve hangisini seçeceği bize bağlı değil. Yalnız
// çıplak `js.stripe.com`a izin verildiğinde alan bir açılıp bir açılmıyordu: seçim tuttuğunda
// çalışıyor, kaydığında CSP çerçeveyi düşürüyor ve Payment Element `loaderror` veriyordu (29.07).
// Stripe'ın kendi CSP belgesi de tam olarak bu yüzden joker'i listeliyor.
const STRIPE_SCRIPT = 'https://js.stripe.com https://*.js.stripe.com';
const STRIPE_FRAME = 'https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com';
const STRIPE_API = 'https://api.stripe.com';
const STRIPE_IMG = 'https://*.stripe.com';

// Harita karoları (19.20) — rota kurulumu haritadan (`Depolar - Bolge Haritasi.html`).
//
// **Haritanın İKİ yarısı var, yalnız biri dışarıdan geliyor.** Noktalar bizim: 16.878 posta kodu
// enlem/boylamıyla `postal_code_place`ta ve `'self'`ten gelir. Dışarıdan gelen şey noktaların
// ALTINDAKİ zemin — sokaklar, nehirler, yer adları. Tasarımın gerekçesi bu zemindir (*"karar 'bu yol
// üstünde mi' olduğu için taban harita yol ağını gösterir"*); zemin olmadan ekran haritaya benzer ama
// kararı vermez.
//
// **Bu host bizim verimizi GÖRMEZ:** giden istek yalnız karo koordinatıdır (z/x/y).
//
// **YALNIZ `img-src` gerekiyor** (07.08): karolar Leaflet'te `<img>` olarak yüklenir. Bir tur
// MapLibre denendi ve `connect-src` + `worker-src 'self' blob:` gerekmişti — vektör karoyu bir Web
// Worker'da çözüp WebGL ile boyadığı için. O zincir ekranda BOŞ TUVAL bıraktı ve tasarımın hiç
// ihtiyaç duymadığı bir yüzeydi; ikisi de geri çıkarıldı. Daha az izin, daha az arıza.
const MAP_TILES = 'https://tile.openstreetmap.org';

/**
 * Güvenlik başlıkları (referans deseninden uyarlandı). CSP host'ları modül geldikçe genişler.
 * Bugün: self + Supabase + R2 görselleri + Stripe (kart alanı, 07.5) + harita karoları (bölge
 * kurulumu, 19.20) + next/font (self-hosted).
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
    `connect-src 'self' ${sbHttp} ${sbWs} ${R2_HOSTS} ${R2_UPLOAD_HOST} ${STRIPE_API}`.replace(/\s+/g, ' ').trim(),
    // Harita karoları BURADA ve yalnız burada: Leaflet onları `<img>` olarak yükler.
    `img-src 'self' data: blob: ${sbHttp} ${R2_HOSTS} ${STRIPE_IMG} ${MAP_TILES}`.replace(/\s+/g, ' ').trim(),
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
  // pino sunucu paketine GÖMÜLMEZ (ölçüldü 08.08): `@lezzet/application` (transpile listesinde)
  // `@lezzet/observability` üzerinden pino'yu içeri çekince webpack pino+thread-stream'i
  // vendor-chunks'a gömdü; pino'nun transport worker'ı `__dirname`den dosya arar ve
  // `.next/server/vendor-chunks/lib/worker.js` diye OLMAYAN bir yola düşer — dev server
  // `MODULE_NOT_FOUND` ile ÇÖKER (yaşandı: POST /fr/compte). Next'in varsayılan dış-paket
  // listesi pino'yu tanır ama transpile edilen paketin import zincirinden gelen kopyayı
  // kurtarmadı; açık beyan ikisini de dışta tutar: worker gerçek node_modules yolundan doğar.
  serverExternalPackages: ['pino', 'pino-pretty'],
  // Paketler kaynak olarak dışa verildiği için Next transpile eder (ara derleme yok).
  transpilePackages: [
    '@lezzet/brand',
    '@lezzet/i18n',
    '@lezzet/types',
    '@lezzet/helper',
    '@lezzet/domain-core',
    '@lezzet/application',
    '@lezzet/database',
    '@lezzet/storage',
    // Web artık DOĞRUDAN import etmiyor (OTP maili `@lezzet/application`a taşındı, 07.08) ama
    // grafikte duruyor: listeden düşerse transpile edilmemiş TS olarak paketlenmeye çalışılır.
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
