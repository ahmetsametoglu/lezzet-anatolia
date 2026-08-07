import { fileURLToPath } from 'node:url';

/**
 * Mobile-api env yüklemesi — **import edildiği anda koşar** (yan etki modülü; apps/backend deseni).
 *
 * Neden yan etki: ESM'de importlar hoist edilir, yani `index.ts` içine yazılmış bir `loadEnv()`
 * çağrısı altındaki importlardan SONRA koşardı. Modül grafiği sırayla değerlendirildiği için
 * `import './env'` ilk sırada durduğunda env, sonraki modüller yüklenmeden hazır olur.
 *
 * Neden gerekli: mobile-api Next.js değil, `tsx src/index.ts` ile koşar ve Node hiçbir `.env`
 * dosyasını kendiliğinden okumaz.
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
  // (`serviceDb()` ve `anonDb()` "Supabase env eksik" diye fırlatır) — burada yalnız yolu
  // göstermek yeter.
  //
  // **Sessiz başarısızlık YOK.** Uyarı `logger` yerine `console`'a düşüyor ve bu bilinçli: logger
  // da bu env'e bakabilir ve bu satır onun kurulmasından önce koşar (`OBSERVABILITY §2`'nin
  // `console` istisnası — pino'nun henüz devrede olmadığı an).
  if (!process.env.SUPABASE_SECRET_KEY || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    // eslint-disable-next-line no-console
    console.warn(`[mobile-api] ${ENV_PATH} okunamadı ve Supabase anahtarları tanımlı değil — ilk istekte düşecek.`);
  }
}
