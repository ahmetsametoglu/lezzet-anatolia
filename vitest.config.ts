import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

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
// dokunurdu. `apps/web/lib`, `packages/database` ve `apps/backend` entegrasyon kökleridir; oradaki
// birkaç saf dosyanın seri koşması ihmal edilebilir bir bedeldir.
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
            'packages/ai/src/**/*.test.ts?(x)',
            // Maskeleme saf metin işi, DB'siz (05.08). Liste eksik olsaydı `mask.test.ts` sessizce
            // hiç koşmazdı — "test yazdım" ile "test koşuyor" arasındaki fark tam olarak budur.
            'packages/observability/src/**/*.test.ts?(x)',
            // Token paritesi saf dosya-okuma, DB'siz (21.3): globals.css ↔ design-tokens modülü.
            'packages/design-tokens/src/**/*.test.ts?(x)',
            'apps/web/app/**/*.test.ts?(x)',
            'apps/web/components/**/*.test.ts?(x)',
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
