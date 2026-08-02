# docs/denetim — denetim ajanının dosyaları

Bu klasör **denetim ajanına** aittir. İçindekiler iki türdür:

1. **Şerit denetim dosyaları** (`denetim-<şerit>*.md`) — kod kalitesi, duplikasyon ve
   doküman↔kod senkronu bulguları. **Öneri statüsündedir, emir değil:** her maddenin dayanağı
   (hangi kural) yanında yazılıdır; katılmayan şerit ajanı maddenin altındaki **Cevap:** satırına
   gerekçesini yazar. Kabul edilen madde ilgili şeridin kendi planına/görev satırına iner —
   durumun tek sahibi yine `docs/build/NN-*.md`'dir (CLAUDE.md §5), bu dosyalar durum tutmaz.
2. **Çalışma/etüt dosyaları** (`*-calismasi.md`) — yeni bir özelliğin mevcut sisteme yerleşim
   etüdü. Karar değildir; karar olgunlaşınca ilgili modül dosyalarına görev satırı olarak iner.

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

- `denetim-server-actions.md` — 26 `'use server'` dosyasının taraması (S1 müşteri · S2 operasyon;
  geneli temiz)
- `denetim-gozlemleme.md` — hata kaydı ağının kör noktaları (G1 kısmen kapandı — operasyon
  bağlandı, müşteri sınırları + `SOURCES` sabiti bekliyor; G2–G3 cevap bekliyor)
- `denetim-musteri-hata-maskeleme.md` — müşteriye giden hata metinleri (H1 ham sızıntı ⚠ ·
  H2 tek dilli jenerik · H3 Zod imleci; H4 iyi desenler)
- `denetim-test-kapsami.md` — test senaryoları kapsam/kurgu denetimi (T1 güçlü çekirdek ·
  T2 teklif akışı · T3 fiyat-değişim onayı · T4 cron iş testi)

Kapanıp silinenler (02–03.08): operasyon ilk dosyası ve komponent taraması · arka uç ilk dosyası
ve **veritabanı/duplikasyon taraması** (A1–A9 tamamı uygulanıp doğrulandı — para kaydı düzeltmesi,
`postal-code`/`date`/`bundle-qty` tek evleri, `ZoneNoticeService`, migration indeksi + `docs:check`
§3c2 kuralı, PII maskeleme, DOMAIN ödeme pasajları; 02.9 cent göçü `02-database.md` görev satırında
izlenir) · müşteri ilk dosyası ve komponent taraması (K1–K4, M2 dahil).
- `barkod-okuyucu-calismasi.md` — barkod okuyucu entegrasyonu etüdü
- `mobil-platform-calismasi.md` — web mi / native mi / hibrit mi platform etüdü (barkod + kurye
  takibi + push ekseninde)
