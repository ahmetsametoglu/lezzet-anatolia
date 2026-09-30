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

// Log sessiz, çünkü tekrarlanan uyarılar testin sonucunu gizler; `??=` sayesinde `LOG_LEVEL=debug pnpm test` ayıklamayı açar.
process.env.LOG_LEVEL ??= 'silent';
