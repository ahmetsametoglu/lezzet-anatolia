# e2e — duman katmanı (00.9)

Playwright testleri **çalışan dev server'a karşı** koşar (build yok; server'ı KULLANICI yönetir).
Koşu: `pnpm test:e2e` — test kilidine girer; çıplak `playwright test` kilidi atlar, KOŞMA.
Anlık ekran bakışı için test yazmaya gerek yok: `pnpm ui:shot <yol>`.

## Şeritler için beş kural (kafa karışmasın diye — hepsi mevcut disiplinin aynısı)

1. **Senaryo kaynağı KOD DEĞİL, tasarım + DOMAIN'dir.** `it` adı tasarım/DOMAIN cümlesidir
   ("sepete eklenen ürün adediyle görünür"), implementasyon ayrıntısı değil. Duman testi ekranın
   NİYETİNİ sınar; iş mantığının güvencesi zaten 1600+ birim/entegrasyon testinde.
2. **Senaryoları DENETİM AJANI yazar (kullanıcı kararı 03.08).** Gerekçe çapraz-yazımla aynı:
   yazan, hiçbir ekranın kodunu yazmamış olmalı — denetmen tanımın kendisi. Şeritler `e2e/`ye
   senaryo AÇMAZ; senaryo bir bulgu dosyası gibi İTİRAZA AÇIKTIR (yanlış/eksik görürseniz
   `docs/talep`'e denetime not düşün) ve senaryo ihtiyacınız varsa aynı yoldan isteyin.
   **Bakım tersine, ekran sahibinde:** ekranı değiştirip testi kızartan şerit düzeltir — düzeltme
   iddianın ÖZÜNÜ değiştiriyorsa (davranış değişti) commit'te tek satır gerekçe yeter.
3. **Veri disiplini CLAUDE §4b'nin aynısı:** okuyan test seed'in deterministik kayıtlarını
   kullanır; yazan test damgalı (`Date.now()`) veri kurar ve `purgeTestData` ile toplar.
   `db:refresh` hiçbir koşuda ön şart değildir. Küresel tekil satıra (settings) dokunma.
4. **Görüntü assertion DEĞİL, artefakttır.** Piksel-diff yok (UI oynakken kırmızı gürültü olur —
   Kademe 3'te yeniden bakılır); düşüşte görüntü+iz `.test-results/e2e/` altına kendiliğinden düşer.
5. **Her senaryo iki projede koşar** (desktop + mobile — cihaz forkunun iki yüzü). Mobilde
   kırılan bir akış, forkun mobil yarısının işidir; testi daraltma (`test.skip` yazma), ekranı düzelt.

## Kademe 2 kapsamı — denetim yazacak (HENÜZ BAŞLAMADI, kullanıcı işaretiyle başlar)

Planlanan ~10 yolculuk (tasarım+DOMAIN'den; liste taslak, yazım sırasında daralabilir/gerekçeyle değişir):

- **Müşteri:** vitrin → ürün → sepete ekle → checkout taslağı (Stripe yönlendirme SINIRINA dek —
  webhook zinciri entegrasyon testlerinde) · yer/posta kodu seçimi ve rota-dışı hâli · fr/de/tr
  rota değişimi · sipariş onay ekranı (`/checkout/[reference]`) · sepette fiyat-artışı onayı.
- **Operasyon:** rol yönlendirmesi · sipariş kuyruğu → hazırlık onayı · mal kabul · Kasa/para
  ekranı ilk bakış.
- **Dışarıda kalanlar (bilinçli):** OTP akışı (kod-yakalama kapısı inene dek) · Stripe ödeme
  tamamlama · piksel karşılaştırma · WebKit — hepsi Kademe 3 konusu.

Denetmenin sınırı: senaryo YAZAR, ekran koduna DOKUNMAZ — duman kırmızıysa bulgu/not açar,
düzeltme ekran sahibinin. Deneme dumanlarındaki kaba iddialar Kademe 2'de gerçek yolculuklara
evrilir.

Yerleşim: `e2e/customer/**` · `e2e/operations/**` — dosya adı `<akış>.smoke.ts`.
Operasyon sayfaları dev auth bypass'ıyla açılır (guard.ts, seed'li DEV_ADMIN); giriş adımı yazmaya
gerek yok. Müşteri OTP akışı için kod-yakalama kapısı henüz YOK (00.9 notu) — OTP isteyen senaryo
o kapı inene dek yazılmaz.
