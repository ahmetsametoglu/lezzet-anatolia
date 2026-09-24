import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

// İki proje: `unit` DB'siz saf testler (paralel; kurulum `.env` yüklemez ve DB env'ini siler ki yanlış projeye düşen test anlaşılır
// biçimde patlasın), `integration` yerel Supabase'e vuranlar (seri, tam paket kilit altında). Sınır dizinle çizilir ve entegrasyon
// köklerindeki saf testler aşağıdaki listelerde tek yerde sayılır; `docs:check §3i` web listesini denetler.

/**
 * `packages/database` entegrasyon köküdür ama bu dosyalar saftır. Kök başına ayrı sabit, çünkü `docs:check §3i` `WEB_LIB_DBSIZ`i
 * adıyla okuyup `apps/` önekiyle tarar ve oraya konan paket yolu denetimin kapsamını bulandırırdı.
 */
const PAKET_DBSIZ = [
  'packages/database/src/utils/case-transformers.test.ts',
  // Test posta kodu üreteci saf (dize ve sayaç); entegrasyonda koşsaydı kararsızlığı önleyen kuralın testi tam pakete ertelenirdi.
  'packages/database/src/testing/postal-code.test.ts',
];

/**
 * `packages/application` entegrasyon köküdür ama saf karar fonksiyonları da taşır; burada sayılmazlarsa testleri yalnız tam pakette
 * koşar. Liste makineyle denetlenmez: eksik satır yalnız yavaşlık doğurur, DB'ye vuran satır birim projesinde gürültüyle patlar.
 */
const UYGULAMA_DBSIZ = [
  'packages/application/src/analytics/availability.test.ts',
  // Coğrafi kodlama taramasının kararı saf: sayaç muhasebesi ve "yarım nokta yazılmaz" kuralı; yazma tarafı entegrasyonda kalır.
  'packages/application/src/delivery/geocode-scan.test.ts',
  // BAN adaptörünün isteği `fetch` taklidiyle ölçülür, çünkü iki metodun farkı (`locate` posta kodunu pinler) yalnız URL'de görünür.
  'packages/application/src/delivery/geocode-provider.test.ts',
  // Tek adres kapısının dağıtımı: ülke → sağlayıcı ve cevabın çevirisi; BAN taklit, Google anahtarsız.
  'packages/application/src/delivery/address-suggest.test.ts',
  // Matris → maliyet çevirisi saf (simetrikleştirme, "tek null tüm matrisi reddeder"); sağlayıcının kendisi ağa çıkar.
  'packages/application/src/delivery/route-matrix-port.test.ts',
  // Hızlı giriş kapısının ret kararı saf olmak zorunda: sınadığı "hiç yönetici yok" hâli kurulu veritabanında üretilemez.
  'packages/application/src/auth/dev-login.test.ts',
  // Etiket şablonu saf metin üretir (SVG); rasterize uç katmanın işidir.
  'packages/application/src/warehouse/label-svg.test.ts',
  'packages/application/src/warehouse/karla-metrics.test.ts',
  'packages/application/src/cart/cart-blocker.test.ts',
  // Sepet bağlantısının cevaba eklenmesi saf metin kuralıdır; DB'siz olduğu için ayrı dosyada.
  'packages/application/src/cart/link-text.test.ts',
  'packages/application/src/catalog/campaign.test.ts',
  // CDN çerçeve kaynakları ve küçük resim saf adres kurucular; env'i test kendisi kurar.
  'packages/application/src/catalog/frame-sources.test.ts',
  // Ürün kartının kanal gövdeleri saf kurucudur; Meta sınırları burada zorlanır.
  'packages/application/src/catalog/product-card.test.ts',
  // Seçkinin sıralaması saf: dizi girer, dizi çıkar.
  'packages/application/src/catalog/showcase.test.ts',
  // Telefon vitrininin bant karışımı saf: seçim, karıştırma ve konum; dizi girer, dizi çıkar.
  'packages/application/src/catalog/home.test.ts',
  // Ajanın ürün araçlarının yere göre ayıklaması: hangi ürün bu adrese gider, gitmeyenin sebebi ne.
  'packages/application/src/ticket/product-reach.test.ts',
  // AI kullanım satırı: kayıttan satıra, tarifeden maliyete saf dönüşüm; yazım entegrasyonda.
  'packages/application/src/ai/usage-row.test.ts',
  // Ödeme sağlayıcısı portunun uyarlaması sahte istemciyle koşar; tanımadığı durumda karar vermemesi ve tutarı alınan paradan
  // okuması sınanır.
  'packages/application/src/order/payment-gateway.test.ts',
  // Durum → müşteri haberi seçimi saf: gel-al'da "hazır" haberdir, rota ve kargoda sessizdir.
  'packages/application/src/order/notify-event.test.ts',
];

const WEB_LIB_DBSIZ = [
  'apps/web/lib/analytics/route-pattern.test.ts',
  'apps/web/lib/analytics/session-key.test.ts',
  'apps/web/lib/analytics/utm.test.ts',
  'apps/web/lib/assistant/economics.test.ts',
  // Fırsat kararının yasakları saf: motoru (`expiryFlagOf`) çağırır, DB'ye gitmez.
  'apps/web/lib/assistant/offer-block.test.ts',
  // Sepet bağlantısının ara katman yönlendirmesi saf: URL alır, URL verir.
  'apps/web/lib/cart-link-redirect.test.ts',
  'apps/web/lib/auth/post-login-target.test.ts',
  // Sohbet bağlantısının kapı kararı saf: amaç ve oturum → yol.
  'apps/web/lib/identity/cart-link-landing.test.ts',
  'apps/web/lib/cart/cart-blocker.test.ts',
  'apps/web/lib/cart/discount-label.test.ts',
  'apps/web/lib/cart/place-change.test.ts',
  'apps/web/lib/customer/name.test.ts',
  'apps/web/lib/customer/scorecard.test.ts',
  // `delivery/map-codes.test.ts` buraya girmez: kendi metninde DB izi yok ama `./map-codes` `serviceDb` çağırır.
  'apps/web/lib/delivery/place-filter.test.ts',
  // `verifyMetaSignature` saf: modül `serviceDb`i import eder ama çağırmaz, istemci fonksiyonun içinde kurulur.
  'packages/application/src/messaging/meta-signature.test.ts',
  // Görsel yükleme kapısı saf: gerçek `File`/`FormData` kurar, biçim ve tavan sorar. Modül `server-only` taşır ama koşucu onu boş
  // modüle bağlar.
  'apps/web/lib/media/upload.test.ts',
  'apps/web/lib/order/order-id.test.ts',
  // Paylaşım kartının görseli saf: künye alır, adres verir.
  'apps/web/lib/seo/open-graph.test.ts',
  'apps/web/lib/storefront/featured.test.ts',
  // Boyun müşteriye görünen adı — saf türetme (alanlar + sözlük → dize), DB'ye gitmiyor.
  'apps/web/lib/storefront/variant-name.test.ts',
  'apps/web/lib/use-load-more.hook.test.ts',
  // Bağlam kapısı DB'sizdir ama §3i'nin statik izi onu göremez: depo servisini `vi.mock` ile taklit ettiği için `@lezzet/database`
  // dizgesini taşır.
  'apps/web/lib/warehouse/context.test.ts',
  'apps/web/lib/warehouse/filter.test.ts',
];

const alias = {
  // `@/…` web'in tsconfig takma adıdır. `server-only` paketleyici korumasıdır ve Node koşucusunda istemci paketi olmadığı için boş
  // modüle bağlanır; koruma Next derlemesinde aynen durur.
  '@': fileURLToPath(new URL('./apps/web', import.meta.url)),
  'server-only': fileURLToPath(new URL('./vitest.server-only.ts', import.meta.url)),
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        /*
          JSX'i koşucu çevirir, tsconfig değil: web'in tsconfig'i `jsx: "preserve"` der ve Vite onu izlerse JSX yazan hiçbir web
          dosyası birim projesinde import edilemez. Seçenek yalnız test koşusunda geçerlidir; Next kendi yolundan derler.
        */
        oxc: { jsx: { runtime: 'automatic' } },
        test: {
          name: 'unit',
          environment: 'node',
          include: [
            'packages/domain-core/src/**/*.test.ts?(x)',
            'packages/helper/src/**/*.test.ts?(x)',
            'packages/types/src/**/*.test.ts?(x)',
            'packages/storage/src/**/*.test.ts?(x)',
            'packages/notify/src/**/*.test.ts?(x)',
            'packages/email/src/**/*.test.ts?(x)',
            'packages/brand/src/**/*.test.ts?(x)',
            'packages/i18n/src/**/*.test.ts?(x)',
            // Adres paketi saf: `fetch` taklit edilir, test ağa çıkmaz; React kancasını çizen test bu node ortamında koşamaz.
            'packages/address/src/**/*.test.ts?(x)',
            'packages/ai/src/**/*.test.ts?(x)',
            // Sendcloud istemcisi saf, sahte `fetch` enjekte edilir; paketin testleri bu satır olmadan sessizce hiç koşmaz.
            'packages/sendcloud/src/**/*.test.ts?(x)',
            // Maskeleme saf metin işidir; satır eksik olsaydı `mask.test.ts` sessizce hiç koşmazdı.
            'packages/observability/src/**/*.test.ts?(x)',
            // Token paritesi saf dosya okumasıdır: globals.css ↔ design-tokens modülü.
            'packages/design-tokens/src/**/*.test.ts?(x)',
            // `scripts` kökünün yalnız kendi dosyaları: araçlar saf mantık taşır, `seed/` ise DB'ye vurur ve oraya yazılan test
            // entegrasyona alınır.
            'scripts/*.test.ts',
            // `scripts/seed`ten yalnız DB'siz olanlar, dar desenle: geniş bir `seed/**` deseni DB'ye vuran testi de birim projesine alırdı.
            'scripts/seed/assistant.test.ts',
            // Ambalaj ölçüsü üreteci saf; dar desen yüzünden her yeni saf seed testi kendi satırını ister.
            'scripts/seed/packing.test.ts',
            // Görsel künyesi saf: JSON girer, künye çıkar.
            'scripts/seed/image-manifest.test.ts',
            'apps/web/app/**/*.test.ts?(x)',
            'apps/web/components/**/*.test.ts?(x)',
            // `apps/web/lib` entegrasyon köküdür ama bu dosyalar DB'ye vurmaz.
            ...WEB_LIB_DBSIZ,
            ...PAKET_DBSIZ,
            ...UYGULAMA_DBSIZ,
          ],
          setupFiles: ['./vitest.setup.unit.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          environment: 'node',
          include: [
            'apps/web/lib/**/*.test.ts?(x)',
            'packages/database/src/**/*.test.ts?(x)',
            'apps/backend/src/**/*.test.ts?(x)',
            // Mobile-api entegrasyon köküdür: auth testleri yerel Supabase'e vurur.
            'apps/mobile-api/src/**/*.test.ts?(x)',
            // Application da entegrasyon köküdür: orkestrasyonlar servislerle DB'ye vurur.
            'packages/application/src/**/*.test.ts?(x)',
          ],
          // Birim projesine alınan dosyalar buradan düşer, yoksa iki projede birden koşarlardı; `configDefaults.exclude` korunur,
          // çünkü `exclude` vitest varsayılanını ezer ve `node_modules` yeniden taranırdı.
          exclude: [...configDefaults.exclude, ...WEB_LIB_DBSIZ, ...PAKET_DBSIZ, ...UYGULAMA_DBSIZ],
          setupFiles: ['./vitest.setup.ts'],
          // Aynı satırlara giren testler paralel koşamaz; suite küçük, seri kalması sorun değil.
          fileParallelism: false,
          // Varsayılan tavanlar paylaşılan yerel Supabase için dardır: eşzamanlı koşularda testler sıra bekler ve yalancı kırmızı
          // üretir; asılı kalan sorgu genişletilmiş tavanda yine düşer.
          testTimeout: 15_000,
          // Kanca tavanı testinkinden geniştir, çünkü kesilen bir kanca (afterAll purge) kirlilik bırakır, kesilen bir test bırakmaz.
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
