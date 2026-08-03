import { fileURLToPath } from 'node:url';

/**
 * Backend env yüklemesi — **import edildiği anda koşar** (yan etki modülü).
 *
 * Neden yan etki: ESM'de importlar hoist edilir, yani `index.ts` içine yazılmış bir `loadEnv()`
 * çağrısı altındaki importlardan SONRA koşardı. Modül grafiği sırayla değerlendirildiği için
 * `import './env'` ilk sırada durduğunda env, sonraki modüller yüklenmeden hazır olur.
 *
 * Neden gerekli: backend Next.js değil, `tsx src/index.ts` ile koşar ve Node hiçbir `.env`
 * dosyasını kendiliğinden okumaz. Aynı desen script'lerde de var (`scripts/seed.ts`).
 *
 * **Yol cwd'ye göre DEĞİL modülün kendi konumuna göre çözülür:** süreç `pnpm --filter` ile paket
 * dizininden de, kökten de başlatılabilir; göreli bir yol ikisinde iki farklı dosyaya bakardı ve
 * biri sessizce boş dönerdi.
 */
const ENV_PATH = fileURLToPath(new URL('../.env.local', import.meta.url));

const loadEnvFile = (process as { loadEnvFile?: (path: string) => void }).loadEnvFile;

try {
  loadEnvFile?.(ENV_PATH);
} catch {
  // Dosya yoksa süreç DURMAZ: dağıtımda değerler gerçek ortam değişkeninden gelebilir (PM2/systemd)
  // ve orada bu dosya hiç bulunmaz. Eksikliği asıl bildiren yer env'i gerçekten arayan taraftır
  // (`serviceDb()` "Supabase env eksik" diye fırlatır) — burada yalnız yolu göstermek yeter.
  //
  // **Sessiz başarısızlık YOK.** Uyarı `logger` yerine `console`'a düşüyor ve bu bilinçli: logger
  // da bu env'e bakabilir ve bu satır onun kurulmasından önce koşar (`OBSERVABILITY §2`'nin
  // `console` istisnası — pino'nun henüz devrede olmadığı an).
  if (!process.env.SUPABASE_SECRET_KEY) {
    // eslint-disable-next-line no-console
    console.warn(`[backend] ${ENV_PATH} okunamadı ve SUPABASE_SECRET_KEY tanımlı değil — cron'lar ilk turlarında düşecek.`);
  }
}
