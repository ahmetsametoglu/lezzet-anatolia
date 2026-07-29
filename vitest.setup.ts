// Testler Next.js dışında çalışır — .env'i process.env'e yükle (entegrasyon testleri
// createServiceRoleClient ile local Supabase'e vurur; env oradan okunur).
try {
  (process as { loadEnvFile?: (path: string) => void }).loadEnvFile?.('.env');
} catch {
  // .env yoksa (ör. CI) ortam değişkenleri zaten tanımlı olabilir.
}

// Entegrasyon testleri local Supabase'e vurur. Yığın yeni başlatıldıysa (ya da `db:reset`'ten hemen
// sonra) PostgREST henüz hazır olmayabilir: ilk istek kapıdan 502 alır ve dosya `beforeAll`'da
// yüklenemez — testin kendisi sağlamken suite kırmızı görünür. Bir kez, hepsi için bekleriz.
// Env eksikse (birim testler; DB'ye hiç dokunmayanlar) sessizce atlanır.
if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
  const { serviceDb, waitForRest } = await import('@lezzet/database');
  await waitForRest(serviceDb());
}

// **Log SESSİZ** (18.5): uygulama artık gerçekten logluyor ve test çıktısı yüzlerce satır uyarıyla
// dolup testin SONUCUNU gizliyordu — "RESEND_API_KEY yok" satırı tek başına doğru, kırk kere
// tekrarlanınca gürültü. `??=` ile atanır: geliştirici `LOG_LEVEL=debug pnpm test` diyerek açabilir,
// yani ayıklama yolu kapanmıyor.
process.env.LOG_LEVEL ??= 'silent';
