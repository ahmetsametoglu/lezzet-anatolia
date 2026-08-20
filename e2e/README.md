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
5. **Her senaryo iki projede koşar** (desktop + mobile-web — cihaz forkunun iki yüzü; ad BİLEREK
   `mobile-web`, native uygulamayla karışmasın — CLAUDE §2). Mobil webde kırılan bir akış, forkun
   mobil web yarısının işidir; testi daraltma (`test.skip` yazma), ekranı düzelt.

## Koşu gerçeği (04.08 ölçümü · 06.08 vakası) — önce ÖN-UÇUŞ, tam paket SAKİN pencerede

**Asılı sunucu vakası (06.08):** Next dev süreci 30+ saat sonra ASILDI — süreç canlı (CPU %0),
port açık, her istek sonsuz beklemede (ölçüldü: 0,3 sn'lik rota → 90 sn+ cevapsız). E2E bunu
ayırt edemeyince zaman aşımlarını sırayla yaktı. Tedbir: **`pnpm test:e2e` artık ön-uçuş
yoklamasıyla başlar** (`scripts/e2e-preflight.mjs`) — sunucu cevapsız/500 ise koşu HİÇ başlamaz,
adlı hatayla düşer; çare dev server'ı yeniden başlatmaktır (kullanıcı yönetir). Elle koşuda da
önce yoklamayı çağırın. Belirtiyi tanıyın: koşular topluca ve rastgele zaman aşıyorsa suçlu
senaryo değil, sunucudur.

Dev server üç şeritle paylaşılıyor ve bir şerit kaydettiği an rotalar yeniden derleniyor: aynı
URL sakin anda 0,3 sn, patlama anında 60 sn+ (ölçüldü). Bu yüzden: *(1)* tüm gezinmeler
`domcontentloaded` sözleşmesiyle yazılır (`NAV` sabiti — `load` olayı dev'de asılı kalabiliyor;
hazır-olma güvencesi web-first iddialarda) · *(2)* tam paket, şeritler kod itmiyorken koşulur —
yoğun saatte düşen testler koşudan koşuya DEĞİŞİR, bu senaryo hatası değil ortam imzasıdır ·
*(3)* kalıcı çözüm Kademe 3'ün kendi build'ine karşı koşusudur.

## Kademe 2 kapsamı — denetim yazıyor (Parti 1 İNDİ 04.08; küçük partilerle ilerler)

Planlanan ~10 yolculuk (tasarım+DOMAIN'den; liste taslak, yazım sırasında daralabilir/gerekçeyle değişir):

- **Müşteri:** vitrin → ürün → sepete ekle → checkout taslağı (Stripe yönlendirme SINIRINA dek —
  webhook zinciri entegrasyon testlerinde) · yer/posta kodu seçimi ve rota-dışı hâli · fr/de/tr
  rota değişimi · sipariş onay ekranı (`/checkout/[reference]`) · sepette fiyat-artışı onayı.
- **Operasyon:** rol yönlendirmesi · sipariş kuyruğu → hazırlık onayı · mal kabul · Kasa/para
  ekranı ilk bakış.
- **Dışarıda kalanlar (bilinçli):** OTP akışı (kod-yakalama kapısı inene dek) · Stripe ödeme
  tamamlama · piksel karşılaştırma · WebKit — Kademe 3 konusu.
  *(**Rol yönlendirmesi** bu listeden 19.08'de ÇIKTI: gerekçesi "dev bypass TEK kimlik verir"di,
  bypass söküldü. Artık `e2e/setup/` altına ikinci bir oturum dosyası koyup kurye/depo rolüyle de
  koşulabilir — senaryo henüz yazılmadı.)*

Denetmenin sınırı: senaryo YAZAR, ekran koduna DOKUNMAZ — duman kırmızıysa bulgu/not açar,
düzeltme ekran sahibinin. Deneme dumanlarındaki kaba iddialar Kademe 2'de gerçek yolculuklara
evrilir.

Yerleşim: `e2e/customer/**` · `e2e/operations/**` — dosya adı `<akış>.smoke.ts`.
Oturum: `e2e/setup/**.setup.ts` (proje adı `ops-setup`).

**Operasyon senaryoları GERÇEK oturumla koşar (19.08).** Eskiden `guard.ts`in dev auth bypass'ı
açıyordu ve giriş adımı yazmak gerekmiyordu; o bypass söküldü (gerekçe guard'ın künyesinde:
ölçüldü, oturumsuz `/operations` yerelde 200 dönüyordu). Şimdi `ops-setup` projesi
`/auth/dev-login`den seed yöneticisinin oturumunu alıp saklıyor, `operations` projesi onu
`storageState` olarak yüklüyor. Senaryo yazarken yine giriş adımı yazmıyorsunuz — **ama artık
oturum gerçek**, yani yetki hatası duman koşusunda görünür. Kapı kapalıysa (`DEV_LOGIN_ENABLED`)
kurulum adlı hatayla düşer.

`desktop` ve `mobile-web` projeleri operasyonu KOŞMAZ ve oturum taşımaz: müşteri yüzeyi ziyaretçi
olarak sınanır — fiyat görüntüsü ve sepet davranışı oturuma göre değişiyor.

Müşteri OTP akışı için kod-yakalama kapısı henüz YOK (00.9 notu) — OTP isteyen senaryo o kapı
inene dek yazılmaz.
