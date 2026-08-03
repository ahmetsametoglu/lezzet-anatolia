# e2e — duman katmanı (00.9)

Playwright testleri **çalışan dev server'a karşı** koşar (build yok; server'ı KULLANICI yönetir).
Koşu: `pnpm test:e2e` — test kilidine girer; çıplak `playwright test` kilidi atlar, KOŞMA.
Anlık ekran bakışı için test yazmaya gerek yok: `pnpm ui:shot <yol>`.

## Şeritler için beş kural (kafa karışmasın diye — hepsi mevcut disiplinin aynısı)

1. **Senaryo kaynağı KOD DEĞİL, tasarım + DOMAIN'dir.** `it` adı tasarım/DOMAIN cümlesidir
   ("sepete eklenen ürün adediyle görünür"), implementasyon ayrıntısı değil. Duman testi ekranın
   NİYETİNİ sınar; iş mantığının güvencesi zaten 1600+ birim/entegrasyon testinde.
2. **Çapraz yazım (kullanıcı kararı 03.08):** müşteri yüzeyinin dumanını operasyon şeridi yazar,
   operasyonunkini müşteri şeridi — yazan, o ekranın kodunu okumadan tasarımdan yazar. **Bakım
   tersine:** ekranı değiştirip testi kızartan şerit düzeltir.
3. **Veri disiplini CLAUDE §4b'nin aynısı:** okuyan test seed'in deterministik kayıtlarını
   kullanır; yazan test damgalı (`Date.now()`) veri kurar ve `purgeTestData` ile toplar.
   `db:refresh` hiçbir koşuda ön şart değildir. Küresel tekil satıra (settings) dokunma.
4. **Görüntü assertion DEĞİL, artefakttır.** Piksel-diff yok (UI oynakken kırmızı gürültü olur —
   Kademe 3'te yeniden bakılır); düşüşte görüntü+iz `.test-results/e2e/` altına kendiliğinden düşer.
5. **Her senaryo iki projede koşar** (desktop + mobile — cihaz forkunun iki yüzü). Mobilde
   kırılan bir akış, forkun mobil yarısının işidir; testi daraltma (`test.skip` yazma), ekranı düzelt.

Yerleşim: `e2e/customer/**` · `e2e/operations/**` — dosya adı `<akış>.smoke.ts`.
Operasyon sayfaları dev auth bypass'ıyla açılır (guard.ts, seed'li DEV_ADMIN); giriş adımı yazmaya
gerek yok. Müşteri OTP akışı için kod-yakalama kapısı henüz YOK (00.9 notu) — OTP isteyen senaryo
o kapı inene dek yazılmaz.
