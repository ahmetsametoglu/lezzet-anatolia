// Testler Next.js dışında çalışır — .env'i process.env'e yükle (entegrasyon testleri
// createServiceRoleClient ile local Supabase'e vurur; env oradan okunur).
try {
  (process as { loadEnvFile?: (path: string) => void }).loadEnvFile?.('.env');
} catch {
  // .env yoksa (ör. CI) ortam değişkenleri zaten tanımlı olabilir.
}

// Yığın yeni başlatıldıysa PostgREST ilk isteğe 502 döner ve dosya `beforeAll`'da yüklenemez; bir kez, hepsi için beklenir.
// Env eksikse (birim testler) sessizce atlanır.
if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
  const { serviceDb, waitForRest } = await import('@lezzet/database');
  await waitForRest(serviceDb());
}

// Personel bildirimi hazır yöneticiler dahil gerçek profillere yazılır; onların cihazı yerelde kayıtlıysa koşu gerçek telefonu ve
// masaüstünü çaldırırdı. Cihaz taşıyıcısına giden istek testte düşer, gönderimi sınayan testler sahte taşıyıcı verir.
delete process.env.WEB_PUSH_PRIVATE_KEY;
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  String(input instanceof Request ? input.url : input).startsWith('https://exp.host/')
    ? Promise.reject(new Error('testte cihaz bildirimi gönderilmez'))
    : realFetch(input, init)) as typeof fetch;

// Kasa yazımı ödemenin arkasından kendiliğinden koşar; anahtar kalsaydı testin siparişi gerçek Hiboutik deneme hesabına gidebilirdi.
// Kasayı sınayan testler bellek içi kasayı verir.
delete process.env.HIBOUTIK_API_KEY;

// Log sessiz, çünkü tekrarlanan uyarılar testin sonucunu gizler; `??=` sayesinde `LOG_LEVEL=debug pnpm test` ayıklamayı açar.
process.env.LOG_LEVEL ??= 'silent';
