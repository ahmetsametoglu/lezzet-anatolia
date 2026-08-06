# Web mi, native mi, hibrit mi? — platform etüdü (02.08.2026)

> **Statü: ÇALIŞMA/ÖNERİ — karar değil.** Soru: barkod okuyucu (ve "mobil uygulama mı gerekir?"
> dedirten diğer özellikler — kurye canlı takibi, push bildirim) mevcut web uygulamasıyla
> karşılanabilir mi, yoksa native ya da Capacitor benzeri hibrit bir kabuk mu gerekir?
> Zemin: `SCOPE.md` "ayrı mobil uygulama + push" Faz 2'dir ve Faz 1'de Faz 2'yi imkânsız kılacak
> karar alınmaz.

## 0. Kısa cevap

**Bugün ne native ne hibrit gerekiyor.** Masadaki özellikler tek tek incelendiğinde web'in
karşılayamadığı **tek** şey çıkıyor: *ekran kilitliyken kesintisiz arka plan GPS*. Onun da müşteri
deneyimi açısından daha iyi çalışan, web'le tam karşılanan olay-tabanlı bir alternatifi var (§3).
Barkod tamamen web'de çözülür (§2). Push, personel tarafında PWA kurulumuyla web'de çalışır;
müşteri tarafında Faz 1 kanalları zaten e-posta + WhatsApp (§4). Capacitor bir *kaçış kapısı*
olarak masada durmalı: gerekirse **aynı web kod tabanını saran ince kabuktur**, yeniden yazım
değildir — bu yüzden bugün kurmamak yarın bir kapıyı kapatmaz (§5).

## 1. Yetenek matrisi — web neyi karşılar

| Yetenek | Web (mobil tarayıcı/PWA) | Not |
| --- | --- | --- |
| Donanım barkod okuyucu (HID) | ✅ tam | Klavye taklidi; odaklı input yeter, sıfır bağımlılık |
| Kamerayla barkod okuma | ✅ tam | `getUserMedia` + tek JS/WASM çözücü kütüphane (iOS Safari'de `BarcodeDetector` yok, kütüphane şart) |
| Ön planda konum (ekran açık) | ✅ tam | Geolocation API; `Wake Lock` ile ekran uyumaz (iOS 16.4+) |
| **Arka planda konum (ekran kilitli / başka uygulama)** | ❌ yok | Web'in bilinçli sınırı; hiçbir PWA izniyle açılmaz |
| Push — personel | ✅ şartlı | Web Push; iOS'ta yalnız ana ekrana eklenmiş PWA'da (16.4+). Personele "uygulamayı ana ekrana ekle" tek seferlik kurulum adımı |
| Push — müşteri | ⚠ zayıf | Müşteriye PWA kurdurtmak sürtünmedir; zaten Faz 1 kararı e-posta + WhatsApp utility template (`SCOPE.md`) |
| Çevrimdışı okuma / zayıf bağlantı | ✅ makul | Service worker önbelleği; yazma işlemleri sunucu-onaylı kalır (retry deseni) — native de senkron sorununu bedava çözmez |
| Kamera (fotoğraf: hasar kaydı, teslim kanıtı) | ✅ tam | `<input capture>` zaten kullanılıyor (destek ekranı) |
| Bluetooth (etiket yazıcısı vb.) | ⚠ Android'de var, iOS Safari'de yok | Gerekirse yazıcıya ağ üzerinden (Wi-Fi/sunucu) basmak web-uyumlu alternatif |
| App Store varlığı / marka algısı | ❌ | Ürün kararı, teknik değil — Faz 2 sorusu |

## 2. Barkod özelinde hüküm: web yeter, iki kademe

`barkod-okuyucu-calismasi.md §3`'teki kademelendirme bu soruyu zaten kapsıyor:

1. **HID okuyucu** — depo/tezgâh gibi sabit noktalarda en hızlı ve en sağlam yol; tarayıcıda
   sıfır bağımlılıkla çalışır. Native uygulamanın burada hiçbir artısı yok.
2. **Telefon kamerası** — `getUserMedia` her mobil tarayıcıda var; eksik olan yalnız çözücü
   (iOS'ta `BarcodeDetector` yok) → tek kütüphane seçilir, STACK'e beyanla girer. EAN-13 gibi
   1D kodlar için WASM çözücüler depo ışığında yeterli performans verir. Native'in (ML Kit)
   avantajı düşük ışık/açı toleransı — depo içi kullanımda karar değiştirecek fark değil.

**Barkod, platform kararını tetikleyen bir özellik değildir.**

## 3. Asıl soru: kurye canlı takibi — "native dedirten" tek özellik, ama gerçekten gerekli mi?

Müşteri deneyimi hedefi: *"siparişim ne zaman gelecek?"* sorusunun sürtünmesiz cevabı. İki yol var:

**(a) Sürekli GPS izleme** (Uber deseni): araç haritada canlı nokta. Bunu ekran kilitliyken
sürdürmek web'de imkânsız — Capacitor + arka plan konum eklentisi ister; ayrıca "her zaman izin
ver" konum izni, pil tüketimi ve sürücüyü sürekli izleme (çalışan mahremiyeti, GDPR'da amaç
sınırlaması) maliyetleri gelir.

**(b) Olay-tabanlı ilerleme** (kargo deseni): rota zaten sistemde — duraklar, sıra, kesim saati.
Kurye her teslim onayında (bu ekran zaten `11-kurye-rota` kapsamında var) sistem kalan durak
sayısını bilir → müşteriye "kurye yola çıktı", "sıradaki teslimat sizsiniz", "~30 dk" bildirimi
WhatsApp/e-posta ile gider. GPS'e hiç ihtiyaç yok; sinyal kaynağı kuryenin **zaten yapmak zorunda
olduğu** teslim onayı.

Denetim görüşü: **(b) müşteri için daha iyi bir deneyim** — müşterinin sorusu "araç haritada
nerede" değil "bana ne zaman gelecek"tir; durak-bazlı tahmin bunu doğrudan cevaplar, canlı harita
ise cevabı müşterinin kendisinin çıkarmasını ister. Ve (b) bugünkü web + Faz 1 bildirim
kanallarıyla eksiksiz kurulur. İnce bir ara kademe de mümkün: kurye telefonu araçta "teslimat modu"
ekranında açık dururken (Wake Lock) **ön planda** konum da gönderilebilir — operasyonun "araç
nerede" iç sorusu için, müşteriye açmadan.

Sürekli canlı harita bir gün ürün kararı olarak isterse: o gün Capacitor kabuğu + arka plan konum
eklentisi eklenir, web kod tabanı aynen kalır (§5). Karar o güne ertelenebilir — bugün alınmasına
gerek olan hiçbir şey yok.

## 4. Push bildirim

- **Personel (kurye/depocu):** Web Push + ana ekrana eklenmiş PWA. Kurulum tek seferlik ve
  personel sayısı az — yönetilebilir. Manifest + service worker + `packages/notify`'a push sürücüsü
  gerektirir; bildirim katmanı zaten soyut (SCOPE'un istediği gibi), sürücü eklemek mimariyi bozmaz.
- **Müşteri:** Faz 1 kararı e-posta + WhatsApp; push Faz 2'nin "ayrı mobil uygulama" paketinde.
  §3(b)'nin bildirimleri bu kanallardan akar — push'suz da sürtünmesiz.

## 5. Capacitor'ın doğru yeri: bugün değil, ama kapı açık

Capacitor'ın değeri, günü geldiğinde **aynı Next.js uygulamasını** ince bir native kabukla sarıp
yalnız eksik yetenekleri (arka plan GPS, garanti push, iOS Bluetooth) eklenti olarak vermesi.
Bedeli: iki mağaza süreci (imzalama, inceleme, sürüm dağıtımı), ikinci build hattı, cihaz test
matrisi — üç şeritli bir ekip için bugün belirgin yük, ve `CLAUDE.md` "sistemin karmaşıklığı
arayüze yansımaz / sade" ilkesiyle gerilir. Bugün kurulmamasının kapattığı hiçbir kapı yok; tek
şart Faz 1'de web'i **PWA-uyumlu** tutmak (manifest, service worker, HTTPS — zaten hedef bu).

**Karar çerçevesi (ileride):** Capacitor'a ancak şu üçünden biri *kanıtlanmış ihtiyaç* olursa
gidilir: (1) ekran kilitliyken sürekli GPS ürün kararı olur, (2) personel push'unda PWA kurulumu
fiilen yetersiz kalır, (3) iOS'ta Bluetooth donanımı şart olur. Üçü de yokken kabuk kurmak, iki
platformu tek özellik için taşımaktır.

## 6. Önerilen yol

1. Faz 1 web-first devam; barkod `barkod-okuyucu-calismasi.md` fazlamasıyla web'de.
2. Kurye tarafında olay-tabanlı ilerleme bildirimi (§3b) — `11-kurye-rota` + `14-bildirim`
   kapsamlarının doğal kesişimi; yeni platform istemez.
3. PWA temel taşları (manifest + service worker) operasyon yüzeyine eklensin — hem personel
   push'unun hem olası Capacitor gününün ortak ön şartı; ikisine de hizmet eder.
4. Platform sorusu §5'teki üç tetikleyiciden biri gerçekleşince yeniden açılır; o güne kadar kapalı.

**Cevaplar / itirazlar:** 05.08.2026 kullanıcı kararı: müşteri mobil uygulaması YAPILACAK
(Faz 2 kalemi öne alındı). Bu dosyanın hükmü ("özellikler uygulamayı zorlamıyor") geçersiz
kılınmadı — soru değişti. Teknoloji etüdü: `docs/uygulama/01-teknoloji-secimi.md`.
