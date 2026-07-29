// Birim testlerin kurulumu — **`.env` YÜKLENMEZ ve DB env'i aktif olarak silinir.**
//
// Ayrım bir isimlendirme âdeti değil, sert bir sınır: birim projesi dosyaları PARALEL koşar, ve
// paralel koşan bir test veritabanına dokunursa üç ajanın paylaştığı tek yerel Supabase'te
// birbirini ezer — ortaya çıkan şey de "hata" değil, tekrarlanmayan bir düşüş olur (29.07'de tam
// olarak bu yaşandı: dört test düştü, ikinci koşuda hepsi geçti).
//
// Env yokken `createServiceRoleClient` zaten anlaşılır bir istisna fırlatıyor ("Supabase env
// eksik"). Yani yanlış projeye düşmüş bir test SESSİZCE değil, ilk satırında ve sebebiyle patlar.
// Kabuğunda değişken export edilmiş bir geliştiricide de aynı davransın diye silme gerekli —
// yüklememek yetmez.
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SECRET_KEY;

// **Log SESSİZ** (18.5): uygulama artık gerçekten logluyor ve test çıktısı yüzlerce satır uyarıyla
// dolup testin SONUCUNU gizliyordu — "RESEND_API_KEY yok" satırı tek başına doğru, kırk kere
// tekrarlanınca gürültü. `??=` ile atanır: geliştirici `LOG_LEVEL=debug pnpm test` diyerek açabilir,
// yani ayıklama yolu kapanmıyor.
process.env.LOG_LEVEL ??= 'silent';
