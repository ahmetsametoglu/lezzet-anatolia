# docs/denetim — denetim ajanının bulgu dosyaları

Bu klasör **denetim ajanına** aittir ve yalnız **şerit denetim dosyaları** taşır
(`denetim-<konu>.md`): kod kalitesi, duplikasyon ve doküman↔kod senkronu bulguları. **Öneri
statüsündedir, emir değil:** her maddenin dayanağı (hangi kural) yanında yazılıdır; katılmayan
şerit ajanı maddenin altındaki **Cevap:** satırına gerekçesini yazar. Kabul edilen madde ilgili
şeridin kendi planına/görev satırına iner — durumun tek sahibi yine `docs/build/NN-*.md`'dir
(CLAUDE.md §5), bu dosyalar durum tutmaz. (Özellik etütleri burada DEĞİL — `docs/feature/`,
03.08'de taşındı.)

**Yaşam döngüsü:** Bulgu dosyası, maddeleri kapandıkça yalnız açık maddelere indirilir; TÜM
maddeleri kapanan dosya SİLİNİR — kararlar zaten kalıcı yerlerine (STACK/CLAUDE/görev
satırı/künye) işlenmiştir, dosya süreç kaydıdır, arşiv değil. Böyle kapanıp silinenler (02.08):
operasyon ilk dosyası (10 madde + 3 şüpheli) ve arka uç dosyası (6 madde; sonuncusu B2-i —
bağımlılık↔STACK kontrolü `docs-check.mjs`'e indi, denetimce doğrulandı).

**Sahiplik (CLAUDE.md §5):** Bu klasörü yalnız denetim ajanı yönetir. Şerit ajanları dosyalara
YALNIZ kendi **Cevap:** bölümlerini yazar; silme/yeniden adlandırma/eski sürümle ezme yasak.
Cevap yazmadan önce dosyanın GÜNCEL hâli okunur.

**İkinci tur (03.08'de resmîleşti):** Şerit, cevabında denetime karşı soru sorabilir; denetim
**"Denetim görüşü:"** bölümüyle yanıtlar. İki turda uzlaşılamayan madde kullanıcıya taşınır.

Dosyalar:

- `denetim-katman-haritasi.md` — **program dosyası** (bulgu taşımaz): katman katman yürüyen
  standart-dışılık + duplikasyon denetiminin haritası ve tur durumu (kullanıcı talimatı 10.08).
  Her katman kendi bulgu dosyasını açar (`denetim-K<n>-<ad>.md`); harita kapanana dek kalır.

Kapanıp silinenler (02–05.08): operasyon ilk dosyası ve komponent taraması · arka uç ilk dosyası,
**veritabanı/duplikasyon taraması** (A1–A9), yorum bayatlığı 1/3 (Y1–Y3) ve **test artığı**
(R1–R4 — `purgeTestData`+`mustDelete`, iki bağımsız ölçüm sıfır artık; süpürme kuralı `02.12`'de
izlenir) · müşteri ilk dosyası,
komponent taraması (K1–K4, M2), **hata maskeleme** (H1–H4 — `customerErrorKey` anahtar funnel'ı,
`08.15`/`08.17`), **server-actions** (S1–S3), **test kapsamı** (T1–T5 — fiyat-değişim testleri +
`18.11` devri) ve yorum bayatlığı 3/3 (M-Y1–M-Y4) · operasyon yorum bayatlığı 2/3 (O-Y1–O-Y3) ·
gözlemleme (G1–G4 — istemci hata kapısı + süreç kancaları + webhook izleri) · **dosya ağacı**
(D1–D4 — `*-url` istisnası STACK §7 + `docs:check` kuralı, checkout forku, `use-device.hook`
29 import, aile-sözlük ölçümü) · **servis taban sınıfı** (TS1–TS2 — üç ham-gerekçe notu,
STACK §6'ya "ham ne zaman serbest" kuralı + iki mutlak istisna) · **analitik yol kalıbı**
(P1–P3 — kaynak + kalıp sözlüğü, canlı ölçümle kapandı, `f791d80`) · **migration parçalanma
dengesi** (P1–P4 — 34 dosya boşluksuz, üreteç yalnız 0034 verisini yazıyor; kalıcı kayıt `02.11`,
`24fb897`).
