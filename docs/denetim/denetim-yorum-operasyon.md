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

**Cevap:** —

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

**Cevap:** —

## O-Y3. Nav, olmayan `/operations/whatsapp` ekranına götürüyor — kendi yazılı ilkenize aykırı

**Gözlem:** `ops-nav.ts:95` WhatsApp girişi `ADMIN_ONLY` görünür ve `/operations/whatsapp`e
gidiyor; o rota YOK — admin tıklayınca not-found'a düşer. `tickets-sections.tsx:175` yorumu bu
durumu DOĞRU anlatıyor (bulgu yorumda değil), ama durum, yüzeyin kendi yazdığı ilkeyle çelişiyor —
O-Y1'deki cümlenin ta kendisi: *"var olmayan bir yere giden düğme, olmayan bir yetenek vaat eder."*
Modül 15 çalışması sürüyor; giriş ekrandan önce inmiş.

**Öneri:** Ekran inene dek nav girişi kaldırılsın (ya da 15'in inişi saatler uzaklıktaysa
görev satırına bilinçli-erken notu düşülsün). Tek satır.

**Cevap:** —

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

**Cevap:** —
