import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

// Monorepo geneli test yapılandırması — **iki proje**, çünkü iki farklı gerçek var:
//
//   • `unit`        — DB'siz saf fonksiyonlar (motor, yardımcılar, şablonlar). PARALEL koşar,
//                     saniyeler sürer. Kurulumu `.env` yüklemez ve DB env'ini siler: yanlış
//                     projeye düşen bir test sessizce değil, anlaşılır bir istisnayla patlar.
//   • `integration` — yerel Supabase'e vuran servisler ve kapılar. SERİ koşar (aynı satırlara
//                     girerler) ve tam paket kilit altında çalışır (`pnpm test`).
//
// **Neden bölündü (29.07):** 104 dosyanın 52'si DB'ye vuruyor ve `fileParallelism: false` hepsini
// birden yavaşlatıyordu — oysa saf yarının asıl test süresi 224 ms, kalanı kurulum ve sıra bekleme.
// Ayrıca üç ajan aynı yerel veritabanını paylaşıyor; ayrım olmadan her koşu ötekini kirletme
// riskini taşıyordu.
//
// **Sınır dizinle çizilir, isimle değil:** 52 dosyayı yeniden adlandırmak diğer ajanların işine
// dokunurdu. `apps/web/lib`, `packages/database` ve `apps/backend` entegrasyon kökleridir.
//
// **Ama "birkaç saf dosya ihmal edilebilir" varsayımı ÖLÇÜLDÜ ve yanlış çıktı (K8-1, 10.08):**
// `apps/web/lib`in 68 test dosyasının **19'u** DB'ye hiç vurmuyor. Bedel de artık yalnız hız değil:
// 08.08'den beri `CLAUDE §4b` DB'ye vuran koşuyu şeritlere kapatıyor, yani `cart-blocker`ı yazan
// şerit kendi testini KOŞAMIYOR. Dizin ölçütü burada işlemiyor çünkü klasörler karışık —
// `cart/discount.ts` (DB) ile `cart/discount-label.ts` (saf) aynı yerde durur.
//
// Çözüm yeniden adlandırma DEĞİL (yukarıdaki gerekçe hâlâ geçerli: dosyalar başka şeritlerin),
// **yolların tek yerde sayılması**. Liste ikiye bölünmez: birim projesi bunu `include`a ekler,
// entegrasyon `exclude`a — aynı sabitten. Çürümesini `docs:check §3g` engelliyor: DB'siz olup
// listede olmayan bir test dosyası commit'ten geçmez.
/**
 * `packages/database` de entegrasyon köküdür ama `utils/` altındaki dönüştürücüler **saf**: DB
 * istemcisi hiç kurulmuyor, dosya kendinden başka hiçbir şey import etmiyor.
 *
 * **Ayrı sabit ve bu bilinçli:** `WEB_LIB_DBSIZ`i `docs:check §3g` **adıyla** okuyor ve içindeki
 * yolları `'apps/…'` önekiyle tarıyor; oraya bir paket yolu koymak denetimin kapsamını sessizce
 * bulandırırdı (liste ile taranan ağaç birbirini tutmaz hâle gelirdi). Yukarıdaki *"liste ikiye
 * bölünmez"* kuralı **kök başına** geçerli: aynı kökün iki listesi olmaz, ayrı köklerin ayrı
 * listesi olur.
 */
const PAKET_DBSIZ = ['packages/database/src/utils/case-transformers.test.ts'];

/**
 * `packages/application` de entegrasyon köküdür (orkestrasyonlar servislerle DB'ye vurur) ama
 * içinde SAF karar fonksiyonları da var: sepet engelleri, ölçüm kovaları, kampanya üstünlüğü.
 * Hiçbiri istemci kurmuyor.
 *
 * **Neden ayrı liste, neden bugün doğdu (24.08):** `CLAUDE §4b` entegrasyon koşusunu şeritlere
 * KAPATIYOR — yani bu dosyalar entegrasyon projesinde kaldığı sürece, onları yazan şerit kendi
 * testini koşamıyor ve doğrulaması commit öncesi tam pakete erteleniyor. `WEB_LIB_DBSIZ`in K8-1
 * ölçümüyle çözdüğü sorunun aynısı, ikinci kökte.
 *
 * **Kök başına ayrı sabit** (üstteki künyenin kuralı): `docs:check §3g` `WEB_LIB_DBSIZ`i ADIYLA
 * okuyup `'apps/…'` önekiyle tarıyor, buraya paket yolu koymak denetimin kapsamını bulandırırdı.
 *
 * **BU LİSTE MAKİNEYLE DENETLENMİYOR ve bilerek yazılıyor:** §3g yalnız `apps/` ağacını tarar,
 * yani buraya girmeyi hak eden yeni bir saf dosya sessizce entegrasyonda kalabilir. Bedeli
 * yavaşlık ve şeridin koşamaması; yanlış sonuç değil. Tersi — DB'ye vuran bir dosyayı buraya
 * yazmak — GÜRÜLTÜLÜ patlar: birim projesi `.env` yüklemez ve DB env'ini siler, dosya ilk
 * satırında "Supabase env eksik" der.
 */
const UYGULAMA_DBSIZ = [
  'packages/application/src/analytics/availability.test.ts',
  'packages/application/src/cart/cart-blocker.test.ts',
  'packages/application/src/catalog/campaign.test.ts',
];

const WEB_LIB_DBSIZ = [
  'apps/web/lib/analytics/route-pattern.test.ts',
  'apps/web/lib/analytics/session-key.test.ts',
  'apps/web/lib/analytics/utm.test.ts',
  'apps/web/lib/assistant/economics.test.ts',
  'apps/web/lib/auth/post-login-target.test.ts',
  'apps/web/lib/cart/cart-blocker.test.ts',
  'apps/web/lib/cart/discount-label.test.ts',
  'apps/web/lib/cart/place-change.test.ts',
  'apps/web/lib/customer/name.test.ts',
  'apps/web/lib/customer/scorecard.test.ts',
  // `delivery/map-codes.test.ts` BURAYA GİRMEZ — denetimin K8-1 listesinde vardı, ölçünce düştü:
  // kendi metninde DB izi yok ama `./map-codes` → `serviceDb` çağırıyor ve birim projesinde 7 test
  // birden patlıyor. Listeyi grep'le değil koşuyla doğrulamanın sebebi bu tek dosya.
  'apps/web/lib/delivery/place-filter.test.ts',
  // `order/carrier.test.ts` YOK ARTIK — kural pakete terfi etmişti, web nüshası köprü bile olmadan
  // sahipsiz kalmıştı (K5-1 benimsemesi 10.08). Dosya ve testi silindi, test pakete taşındı.
  // `verifyMetaSignature` saf: node:crypto + dize. Modül `serviceDb`i import ediyor ama ÇAĞIRMIYOR
  // (istemci fonksiyon içinde kuruluyor) — bu yüzden birim projesinde güvenle koşuyor. Ölçüldü 23.08;
  // `delivery/map-codes.test.ts`in listeye ALINMAMA gerekçesi tam da bunun tersiydi.
  'apps/web/lib/messaging/meta-signature.test.ts',
  'apps/web/lib/order/order-id.test.ts',
  'apps/web/lib/storefront/featured.test.ts',
  'apps/web/lib/storefront/showcase-rank.test.ts',
  'apps/web/lib/use-load-more.hook.test.ts',
  'apps/web/lib/warehouse/filter.test.ts',
];

const alias = {
  // `@/…` — apps/web'in tsconfig takma adı. Test koşucusu bunu bilmezse web tarafındaki saf
  // fonksiyonlar (yönlendirme kararı gibi) yalnız göreli yolla test edilebilirdi.
  // `server-only` bir PAKETLEYİCİ korumasıdır: "bu modül istemci paketine girmesin" der ve
  // içeri girildiğinde fırlatır. Node test koşucusunda istemci paketi diye bir şey yok, dolayısıyla
  // koruma yalnız sunucu okumalarının test edilmesini engelliyordu. Boş modüle bağlanır — koruma
  // gerçek yerinde (Next derlemesi) aynen durur.
  '@': fileURLToPath(new URL('./apps/web', import.meta.url)),
  'server-only': fileURLToPath(new URL('./vitest.server-only.ts', import.meta.url)),
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
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
            // Adres ayrıştırma saf: tek bağımlılığı zod, DB istemcisi hiç kurulmuyor.
            'packages/address-fr/src/**/*.test.ts?(x)',
            /*
              Gecikmeli arama çekirdeği — DB'siz ama React'e bağlı, ve bu ayrım burada ÖNEMLİ.
              Liste bir "çalışma ortamı" vaadi değil, "bu dosyalar KOŞSUN" listesidir: iki paket
              23.08'e kadar HİÇBİR projede değildi, yani oraya yazılacak bir test sessizce hiç
              koşmayacaktı (`mask.test.ts` tuzağının aynısı, künyesi aşağıda).
              Hook'u RENDER eden bir test bu node ortamında düşer — ama GÖRÜNÜR biçimde düşer,
              sessizce yok sayılmaz; kötü olan ikincisidir. Render gerektiğinde jsdom kararı
              ayrıca verilir (bugün depoda jsdom da testing-library da YOK ve bu bilinçli:
              web'in dört komponent testi de saf mantık sınıyor, hiçbiri render etmiyor).
            */
            'packages/react-hooks/src/**/*.test.ts?(x)',
            'packages/ai/src/**/*.test.ts?(x)',
            // Maskeleme saf metin işi, DB'siz (05.08). Liste eksik olsaydı `mask.test.ts` sessizce
            // hiç koşmazdı — "test yazdım" ile "test koşuyor" arasındaki fark tam olarak budur.
            'packages/observability/src/**/*.test.ts?(x)',
            // Token paritesi saf dosya-okuma, DB'siz (21.3): globals.css ↔ design-tokens modülü.
            'packages/design-tokens/src/**/*.test.ts?(x)',
            'apps/web/app/**/*.test.ts?(x)',
            'apps/web/components/**/*.test.ts?(x)',
            // `apps/web/lib` entegrasyon köküdür ama içindeki bu 19 dosya DB'ye vurmuyor (K8-1).
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
            // Mobile-api entegrasyon köküdür (21.1): auth testleri yerel Supabase'e vurur.
            'apps/mobile-api/src/**/*.test.ts?(x)',
            // Application da entegrasyon köküdür (21.4a): orkestrasyonlar servislerle DB'ye vurur.
            'packages/application/src/**/*.test.ts?(x)',
          ],
          // Birim projesine alınan 19 dosya buradan DÜŞER, yoksa İKİ projede birden koşarlardı.
          // `configDefaults.exclude` korunuyor: `exclude` verildiğinde vitest varsayılanı EZER ve
          // `node_modules` yeniden taranmaya başlardı.
          exclude: [...configDefaults.exclude, ...WEB_LIB_DBSIZ, ...PAKET_DBSIZ, ...UYGULAMA_DBSIZ],
          setupFiles: ['./vitest.setup.ts'],
          // Aynı satırlara giren testler paralel koşamaz; suite küçük, seri kalması sorun değil.
          fileParallelism: false,
          // Varsayılan 5 sn/10 sn tavanları paylaşılan yerel Supabase için DAR (ölçüldü 08.08):
          // üç şerit aynı DB'ye vururken tam paket koşusunda testler tam 5000 ms'te, kancalar
          // 10000 ms'te kesiliyordu — hep FARKLI dosyalarda, izole koşuda hepsi <200 ms. Bu bir
          // kod yavaşlığı değil sıra bekleme; tavanı kaldırmak değil genişletmek doğru: asılı
          // kalan sorgu yine düşer, yalnız yalancı kırmızı üretmez.
          testTimeout: 15_000,
          // Kanca tavanı testinkinden AYRI ve daha geniş (ölçüldü 09.08): refresh'in hemen
          // ardındaki koşuda stock.test'in beforeAll VE afterAll'ı 30 sn'de kesildi — 23 test hiç
          // koşamadı (yalancı kırmızı) ve kesilen afterAll purge'ü yarıda bıraktı: depo + kategori
          // artığı kaldı, başka şeridin ölçümünü yanlış yöne çekti. Aynı dosya sakin pencerede
          // 1,7 sn. Kesilen bir TEST kirlilik bırakmaz (afterAll yine koşar); kesilen bir KANCA
          // bırakır — o yüzden kancaya sabır, teste değil. Gerçek kilitlenme 120 sn'de yine düşer.
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
