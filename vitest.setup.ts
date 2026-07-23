// Testler Next.js dışında çalışır — .env'i process.env'e yükle (entegrasyon testleri
// createServiceRoleClient ile local Supabase'e vurur; env oradan okunur).
try {
  (process as { loadEnvFile?: (path: string) => void }).loadEnvFile?.('.env');
} catch {
  // .env yoksa (ör. CI) ortam değişkenleri zaten tanımlı olabilir.
}
