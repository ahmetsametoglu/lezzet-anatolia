import { defineConfig, devices } from '@playwright/test';
import { OPERATIONS_STORAGE_STATE } from './e2e/setup/paths';

/**
 * Playwright — duman katmanı (00.9 Kademe 2). ÇALIŞAN dev server'a karşı koşar; build YOK,
 * `webServer` bloğu BİLEREK yok: dev server'ı KULLANICI yönetir (CLAUDE §4), test başlatmaz.
 *
 * Dört proje: `ops-setup` personel oturumunu açıp saklar; `operations` o oturumla koşar; `desktop`
 * geri kalan her şeyi OTURUMSUZ koşar (ziyaretçi — müşteri yüzeyinin gerçek hâli); `mobile-web`
 * YALNIZ müşteri testlerini — operasyon web'i masaüstü-yalnız (kullanıcı kararı 06.08), personelin
 * mobil deneyimi native uygulamada (`docs/uygulama`). Proje adı BİLEREK `mobile-web`: native
 * uygulamayla karışmasın (CLAUDE §2). Görüntü/iz YALNIZ düşüşte toplanır ve `.test-results/e2e/`
 * altına düşer — ajanların inceleme kaynağı (anlık bakış için ayrı araç: `pnpm ui:shot`).
 *
 * Veri disiplini CLAUDE §4b'nin AYNISI: okuyan test seed'in deterministik satırlarını kullanır,
 * yazan test damgalı veri kurar + `purgeTestData` ile toplar; `db:refresh` hiçbir koşuda ön şart
 * değildir. Koşu `pnpm test:e2e` ile test kilidine girer (DB'ye vuruyor — çıplak `playwright test`
 * kilidi atlar, koşma).
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.smoke.ts', // dosya adı sözleşmesi e2e/README'de — varsayılan .spec/.test desenine girmiyor

  outputDir: './.test-results/e2e',
  fullyParallel: false, // paylaşılan DB + paylaşılan dev server — sıra, yarıştan ucuz
  // TEK işçi: iki proje (desktop+mobile-web) paralel işçilere düşünce dev server'ı aynı anda eziyor ve
  // yazan akışların eylemleri zaman aşıyordu (ölçüldü 05.08: order-advance yalnızken 3,5 sn yeşil,
  // paralelde iki proje de kırmızı). Süre bedeli kabul — istikrar önce; Kademe 3 kendi build'inde
  // yeniden değerlendirilir.
  workers: 1,
  retries: 0, // deneme evresi: flake gizlenmesin, görülsün (00.9 Kademe 3'te yeniden bakılır)
  // Dev server paylaşımlı ve sıcaklığı öngörülemez: üç şerit kod ittikçe rotalar yeniden derlenir,
  // soğuk derleme 30 sn'yi aşabilir (ölçüldü, 04.08). 60 sn bunu karşılar; gerçek bir asılmayı
  // yine yakalar. Kademe 3'ün build'e karşı koşusunda bu pay geri daraltılır.
  timeout: 60_000,
  reporter: [['list'], ['html', { outputFolder: '.test-results/e2e-report', open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE ?? 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    // Cihaz profilleri GERÇEK tarayıcı UA'sı taşır — analitik kapısının BOT süzgeci koşuları
    // göremez ve her duman koşusu deftere ziyaret/niyet yazar (ölçüldü 07.08: dönüşüm oranının
    // payı da paydası da şişiyordu). Kapı `x-e2e: 1`i prefetch/bot/personel ile aynı yerde
    // düşürür (lib/analytics/record.ts). Defterde VERİ İSTEYEN bir senaryo yazılırsa o test
    // kendi `extraHTTPHeaders`'ını üstbilgisiz ezmeli — varsayılan temiz defterdir.
    extraHTTPHeaders: { 'x-e2e': '1' },
  },
  projects: [
    /**
     * ── PERSONEL OTURUMU ARTIK GERÇEK (19.08) ─────────────────────────────────────────────────
     * Operasyon dumanları eskiden `guard.ts`in dev auth bypass'ıyla açılıyordu; o bypass söküldü
     * (gerekçe guard'ın künyesinde). Yerine `/auth/dev-login`den GERÇEK bir oturum alınıp
     * saklanıyor — duman koşusu artık production'daki yetki gerçekliğinin aynısını görüyor.
     */
    // `knip` bu dosyayı KENDİLİĞİNDEN göremiyor (Playwright eklentisi yalnız üstteki `testMatch`i
    // okuyor, proje bazlı olanı değil) — giriş noktası `knip.json`da ayrıca yazılı.
    { name: 'ops-setup', testMatch: 'e2e/setup/**/*.setup.ts', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'operations',
      testMatch: 'e2e/operations/**/*.smoke.ts',
      dependencies: ['ops-setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, storageState: OPERATIONS_STORAGE_STATE },
    },
    // Operasyon DIŞARIDA: müşteri yüzeyi ziyaretçi olarak sınanır ve personel çerezi taşımamalı —
    // fiyat görüntüsü (`pricingViewerOf`) ve sepet davranışı oturuma göre değişir.
    {
      name: 'desktop',
      testIgnore: 'e2e/operations/**',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    // iPhone profili varsayılanda WebKit ister; deneme katmanı TEK motorda (chromium) koşar —
    // UA/viewport/touch emülasyonu fork kararı için yeter. Gerçek WebKit Kademe 3'ün konusu.
    // YALNIZ müşteri: operasyon web'i masaüstü-yalnız (06.08), personelin mobil deneyimi native uygulamada.
    { name: 'mobile-web', testMatch: 'e2e/customer/**/*.smoke.ts', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
});
