# Denetim — müşteriye gösterilen hatalar: maskeleme (03.08.2026)

> **Statü: ÖNERİ, emir değil.** Katılmadığınız maddenin **Cevap:** satırına gerekçenizi yazın;
> karşı soru sorabilirsiniz (ikinci tur deseni). Soru: müşteriye giden hata metni iç yapı hakkında
> fikir veriyor mu? Yöntem: zincirin tamamı izlendi — DB hatası → servis → funnel → action → UI.

## H1. Beklenmeyen hatalar müşteriye HAM gidiyor — maskeleme yok ⚠ (müşteri şeridi + funnel sahibi)

**Gözlem — zincir:** `BaseDbService` ham PostgREST hatasını fırlatır (`base.service.ts:115` vd.
`if (error) throw error`) → `getErrorMessage` her `Error`'ın mesajını AYNEN döndürür
(`lib/error.ts`: `err instanceof Error ? err.message : '…'`) → müşteri yüzeyinde **8+ nokta** bu
dizeyi ekrana basar (`checkout-steps.tsx:540` · `checkout-client` `setError(failure)` ·
`review-form:76` · `reply-box:93` · `new-ticket-form:283` · `addresses-card:158` ·
`profile-card:183` · `guest-verify:147`).

**Sonuç:** DB'ye dokunan herhangi bir beklenmeyen hatada müşteri şunları görebilir:
`duplicate key value violates unique constraint "address_…"` (kısıt/tablo adı), `column … does not
exist` (şema), ya da iç öneklі mesajlar — `[reserve] sipariş bulunamadı: <uuid>`
(`lib/order/reserve.ts:33`), `checkout: müşteri bulunamadı (<uuid>)` (`checkout-options.ts:78`).
Hepsi İngilizce/iç sözlük; yapı hakkında fikir verir. **Funnel künyesi "iç detay sızmaz" diyor —
davranış tersi:** jenerik metin yalnız `Error` OLMAYAN fırlatmalara uygulanıyor, oysa sızdıran
mesajların tamamı `Error` türevi.

**Öneri — sözleşme tersine çevrilsin (varsayılan: MASKELE):** bilinen, müşteriye söylenmek İSTENEN
hatalar bir sözleşmeyle geçer (login'in `authErrorMessage(key, locale)` deseni ya da checkout'un
`t.rejected.*` anahtarları — ikisi de projede zaten var ve doğru); geri kalan HER ŞEY jenerik
metne düşer, ham mesaj yalnız `error_log`'a gider (o kanal zaten kurulu — 18.5). Not: operasyon
yüzeyi bu bulgunun DIŞINDA — personel iç sözlüğü görebilir, `readable()` deseni orada doğru.

**Cevap:** —

## H2. Jenerik hata metni TEK DİLDE — "Beklenmeyen bir hata oluştu" Türkçe (müşteri şeridi)

**Gözlem:** Funnel'ın jenerik metni Türkçe sabit; müşteri yüzeyi FR/DE/TR. Fransız müşteri,
maskelenmiş hâlde bile Türkçe bir cümle görür. i18n kuralı ("her sayfa kendi `messages.json`u")
hata metinlerini de kapsamalı — H1'in anahtar sözleşmesi bunu kendiliğinden çözer: action anahtar
döner, ekran kendi sözlüğünden okur (login bugün tam böyle yapıyor).

**Cevap:** —

## H3. Küçük: `catalog/actions.ts:39` `KeysetCursorSchema.parse` — ZodError funnel'a düşer

Bozuk imleçte ZodError mesajı (alan adlarıyla çok satırlı döküm) H1 zincirinden geçer. İmleç
kurcalanmış demektir; `safeParse` + sessiz varsayılana dönüş (ilk sayfa) hem daha doğru davranış
hem sızıntısız. Tek satır.

**Cevap:** —

## H4. İyi desenler (kayıt için — H1'in çözümü bunların genelleşmesi)

- `authErrorMessage(key, locale)` — login akışı: anahtar → yerel metin, bilinmeyene jenerik ✓
- Checkout'un `t.rejected.*` sözlüğü (bilinen red sebepleri anahtarla) ✓
- Kupon reddi sebepleri domain'den yapılandırılmış geliyor, ham mesaj değil ✓
- `adet depodakinden fazlaysa "mümkün olan adet söylenir"` — kural-tabanlı, yerelleştirilebilir mesaj ✓

**Cevap:** —
