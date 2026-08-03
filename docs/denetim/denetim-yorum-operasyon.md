# Denetim — yorum bayatlığı: operasyon yüzeyi (03.08.2026, 2/3)

> **Statü: ÖNERİ, emir değil.** Katılmadığınız maddenin **Cevap:** satırına gerekçenizi yazın;
> bulgu doğruysa düzeltme istenir (kullanıcı talimatı 03.08). Yöntem arka uç turuyla aynı
> (`denetim-yorum-arka-uc.md`): zaman kalıpları + sayısal iddialar + referanslar, kodun bugünkü
> hâline karşı okundu. Bu turun ortak deseni farklı çıktı: **"arka uçtan gelince" diye bekleyen
> yorumların beklediği şey GELMİŞ, yorum ve ekran güncellenmemiş.** Ek eksen: `CONTROL_H` ölçü
> taraması (şeridin 03.08 önerisi üzerine).

## O-Y1. `warehouses-sections.tsx:396` — "Ayarlar ekranı henüz yok (09.16)": ekran VAR ⚠

**Gözlem:** Yorum *"Ayarlar ekranı henüz yok (09.16) — bağlantı KOYMUYORUZ: var olmayan bir yere
giden düğme, olmayan bir yetenek vaat eder"* diyip personel kapsamı için düz metin bırakıyor.
Oysa `operations/settings/` bugün 16 dosyalık canlı bir ekran (09.16 `[~]`) ve içinde
**`staff-dialog.tsx` bile var** — yani yalnız ekran değil, cümlenin işaret ettiği personel/rol
yönetimi de doğmuş. Yorumun ilkesi doğruydu ve şimdi TERSİNE çalışıyor: var olan bir yeteneğe
bağlantı vermemek de kullanıcıya olmayan bir eksiklik anlatır.

**Öneri:** "Kapsam Ayarlar'da yönetilir" cümlesi `/operations/settings`e bağlansın; yorum silinsin.

**Cevap:** **Kabul, düzeltildi.** Bulgu doğru ve teşhisiniz benimkinden keskin: yorumun ilkesi
doğruydu, ters çalışan şey ilkenin kendisi değil ekranın bayat gerçeklik algısıydı.

Bağlantı ekranın köküne değil **personel sekmesine** gidiyor (`settingsLink({ tab: 'staff' })`).
Sebebi: operatörün sorusu "bu kişinin kapsamını nereden değiştiririm" ve cevabı bir sekme uzakta
bırakmak, bildiğimiz bir yolu yarım tarif etmek olurdu. `settingsLink` tam bu iş için yazılmıştı ve
ilk gerçek tüketicisini burada buldu — adres elle kurulmadı.

## O-Y2. `procurement-sections.tsx:135` — beklenen "dönemli toplam" GELMİŞ, etiket hâlâ eski ⚠

**Gözlem:** Yorum: *"Tasarım 'Bu yıl' istiyor; dönemli toplam arka uç talebinde — o gelene dek
dürüst etiket."* Arka uç bunu teslim etmiş: `SupplierService.debt(supplierId, { from, to })`
dönem desteğiyle çalışıyor ve künyesi *"Dönem isteğe bağlı (tedarik talebi §6)"* diye teslimatı
kaydediyor — dönemli çağrının anlamlı alanının `intakeTotalCents` olduğu uyarısıyla birlikte
(tam ekranın istediği sayı). Ekran ise `svc.debt(s.id)` — dönemsiz — çağırıp "Toplam alım"
gösteriyor. Talep→teslim zinciri kapanmış ama tüketen taraf haberdar değil; talep dosyası
deseninin tam da bunun için istediğimiz yaşam döngüsü boşluğu (karşılanan talebin tüketicisi
güncellenmeden talep "bitmiş" sayılamaz).

**Öneri:** Kart okuması yıl başlangıcıyla `debt(s.id, { from: yılbaşı })` çağırsın, etiket
tasarımdaki "Bu yıl"a dönsün, yorum silinsin. (Borç alanı dönemsiz çağrıdan gelmeye devam etmeli —
künyedeki uyarı: dönemli `balanceCents` borç değildir.)

**Cevap:** **Kabul, düzeltildi — ve parantez içindeki uyarınız bulgunun kendisinden değerliydi.**
Onu görmeden yazsaydım tek çağrıyı dönemli hâle getirir, borcu sessizce bozardım: dönem içindeki
ödemeler dönem dışındaki alımları kapatmaz, yani "borç" alanı her yılbaşında kendiliğinden
sıfırlanmış gibi görünürdü. Ekranda hiçbir hata belirtisi olmadan.

Artık tedarikçi başına **iki** `debt()` çağrısı var, ikisi ayrı soruyu soruyor: borç dönemsiz,
alım yılbaşından. Tek çağrıya indirmenin yolu yok — dönem süzgeci ikisini birden kaydırıyor.
Etiket `Bu yıl alım`, gerekçe yorumda; kart okumasının künyesine de "ikisi ayrı soru" notu düştü.

Teşhisinizdeki asıl nokta bende de not edildi: **karşılanan talebin tüketicisi güncellenmeden talep
bitmiş sayılamaz.** Yeni `docs/talep/` yaşam döngüsünde ("açan doğrular ve siler") bu kural zaten
yapısal olarak var; eski `docs/build/*-talebi.md` deseninde yoktu ve bu bulgu tam o boşluktan çıktı.

## O-Y3. Nav, olmayan `/operations/whatsapp` ekranına götürüyor — kendi yazılı ilkenize aykırı

**Gözlem:** `ops-nav.ts:95` WhatsApp girişi `ADMIN_ONLY` görünür ve `/operations/whatsapp`e
gidiyor; o rota YOK — admin tıklayınca not-found'a düşer. `tickets-sections.tsx:175` yorumu bu
durumu DOĞRU anlatıyor (bulgu yorumda değil), ama durum, yüzeyin kendi yazdığı ilkeyle çelişiyor —
O-Y1'deki cümlenin ta kendisi: *"var olmayan bir yere giden düğme, olmayan bir yetenek vaat eder."*
Modül 15 çalışması sürüyor; giriş ekrandan önce inmiş.

**Öneri:** Ekran inene dek nav girişi kaldırılsın (ya da 15'in inişi saatler uzaklıktaysa
görev satırına bilinçli-erken notu düşülsün). Tek satır.

**Cevap:** **Kabul, giriş kaldırıldı.** Sunduğunuz iki seçenekten ilkini seçtim ve sebebi ölçülebilir:
modül 15'in **hiçbir görevi başlamamış** — 15.1'den 15.8'e kadar tamamı `[ ]`. Yani "saatler
uzaklıkta" değil; bilinçli-erken notu, aylarca not-found'a düşen bir düğmeye gerekçe uydurmak olurdu.

Bulgunun yorumda değil DURUMDA olması ayrıca doğru tespit: `tickets-sections.tsx:175`'teki yorum
(WhatsApp köprüsünü düz metin bırakan) zaten aynı ilkeyi uyguluyordu. Yani yüzey aynı kuralı bir
yerde uygulayıp başka yerde çiğniyordu — kuralın kendisi değil, uygulanmadığı yer sorundu.

`whatsapp` ikonu ve `NavIconName` üyesi **bilerek duruyor**: 15.5 inince giriş geri gelecek ve ikonu
silip yeniden çizmek boş bir gidiş-dönüş olurdu. Kaldırma noktasına "15.5 ile birlikte geri koyun"
notu bırakıldı; kayıt `09-admin.md` (09.13, ray) satırında.

## O-Y4. Temiz çıkanlar (kayıt için)

- **"Bekleyen" yorumlarının çoğu gerçekten bekliyor:** tickets §8b sayımı (talep dosyasında
  "Arka uç cevabı:" boş, `countByStatus` yok ✓) · `lib/ai/translate.ts` THROW künyesi
  (`packages/ai` bugün iskelet — arka uç turu Y2 ile tutarlı) · `b2b-approval-dialog`
  `BEKLEYEN(09.10)` (docs:check bağlı) · procurement `lead_time_days` "henüz yok" (kolon gerçekten
  yok ✓). Bayatlamış olan üç istisna yukarıda.
- **Ölçü ekseni (CONTROL_H, şeridin önerisi):** operasyon genelinde `CONTROL_H` dışında sabit
  yükseklik alan buton/girdi/seçici taraması SIFIR bulgu — kontrol yükseklikleri tek kaynaktan.
- `bundle-form-dialog` "veri gelene kadar çizilmez" künyeleri davranışla birebir; `page.tsx`
  "KPI bandı sonraki dilimde" notu 09 planıyla tutarlı.

**Cevap:** Temiz liste de kayıt olarak değerli — özellikle *"bekleyen yorumların çoğu gerçekten
bekliyor"* satırı, çünkü bu turun bulgusu "yorumlar çürümüş" değil, **üçü çürümüş** demek oluyor.
Ölçüyü vermeseydiniz üç bulgu, bir sistem sorunu gibi okunurdu.

`CONTROL_H` taramasını istediğim için yaptığınızı biliyorum ve sıfır bulgu çıkması benim için de
bilgi: o eksende ikinci bir denetim turu istemeye gerek yok.

**Turun ortak deseni doğru teşhis edildi ve bende karşılığı var:** üç bulgunun ikisi (O-Y1, O-Y2)
"arka uçtan gelince" diye bekleyen yorumlardı ve beklenen şey gelmişti. İkisi de eski
`docs/build/*-talebi.md` deseninden çıktı — o dosyalarda talebin karşılandığını kimse geri
bildirmiyordu. Yeni `docs/talep/` yaşam döngüsü ("açan doğrular ve siler") bu sınıfı yapısal olarak
kapatıyor; kalan risk, **eski dosyalarda hâlâ bekleyen taleplerin** aynı sessizlikle karşılanması.
Kendi açık maddelerimi (`operasyon-ekranlari-arka-uc-talebi.md` §4·§5·§6·§7·§8) bu gözle bir kez
taradım — §4 (`COUNTRY_LABELS`) da cevaplanmış ve tüketicisi henüz güncellenmemiş; onu kendi
şeridimde sıraya aldım.
