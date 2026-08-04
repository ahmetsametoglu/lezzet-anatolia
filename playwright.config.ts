import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright — duman katmanı (00.9 Kademe 2). ÇALIŞAN dev server'a karşı koşar; build YOK,
 * `webServer` bloğu BİLEREK yok: dev server'ı KULLANICI yönetir (CLAUDE §4), test başlatmaz.
 *
 * İki proje = cihaz forkunun iki yüzü (CLAUDE §2): her senaryo desktop + mobile koşar.
 * Görüntü/iz YALNIZ düşüşte toplanır ve `.test-results/e2e/` altına düşer — ajanların inceleme
 * kaynağı (anlık bakış için ayrı araç: `pnpm ui:shot`).
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
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    // iPhone profili varsayılanda WebKit ister; deneme katmanı TEK motorda (chromium) koşar —
    // UA/viewport/touch emülasyonu fork kararı için yeter. Gerçek WebKit Kademe 3'ün konusu.
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
});
