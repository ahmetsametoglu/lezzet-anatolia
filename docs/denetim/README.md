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

- `denetim-dosya-agaci.md` — dosya ağacı standardı (D1-kural `docs:check` bekliyor · D3 sırada;
  D1/2 ve D2 kapalı)
- `denetim-servis-taban-sinifi.md` — DB servislerinde taban sınıf disiplini (sonuç: SAĞLAM —
  ham yazma 1/gerekçeli, RPC tek kapı, bypass sıfır; TS1 üç nota, TS2 STACK §6 cümlesi)
- `denetim-migration-parcalama.md` — migration dosya dengesi (P3 kapandı; P1/P2 kabul → `02.11`,
  P1'in `db:refresh` onayı KULLANICIDA)

Kapanıp silinenler (02–03.08): operasyon ilk dosyası ve komponent taraması · arka uç ilk dosyası,
**veritabanı/duplikasyon taraması** (A1–A9), yorum bayatlığı 1/3 (Y1–Y3) ve **test artığı**
(R1–R4 — `purgeTestData`+`mustDelete`, iki bağımsız ölçüm sıfır artık; süpürme kuralı `02.12`'de
izlenir) · müşteri ilk dosyası,
komponent taraması (K1–K4, M2), **hata maskeleme** (H1–H4 — `customerErrorKey` anahtar funnel'ı,
`08.15`/`08.17`), **server-actions** (S1–S3), **test kapsamı** (T1–T5 — fiyat-değişim testleri +
`18.11` devri) ve yorum bayatlığı 3/3 (M-Y1–M-Y4) · operasyon yorum bayatlığı 2/3 (O-Y1–O-Y3) ·
gözlemleme (G1–G4 — istemci hata kapısı + süreç kancaları + webhook izleri).
