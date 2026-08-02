# Denetim — dosya ağacı standardı: iki yüzey (03.08.2026)

> **Statü: ÖNERİ, emir değil.** Katılmadığınız maddenin **Cevap:** satırına gerekçenizi yazın;
> karşı soru serbest. Soru: yerleşim kuralları (CLAUDE §2 · STACK §7 — `page → *-client →
> .desktop/.mobile` · sayfaya-özel komponent `<sayfa>/components/` · paylaşılan
> `components/{customer,operation}/` · `-types.ts` · `use-x.hook.ts` · sayfa başına
> `messages.json`) fiilen korunmuş mu? Yöntem: iki yüzeyin tam sayfa envanteri + kardeş-sayfa
> import taraması + paylaşılan klasörde tek-tüketici avı + adlandırma taraması.

## D1. Kardeş-sayfa importları — üç yerde sayfa sınırı deliniyor

**Gözlem:**

1. `warehouses/warehouses-sections.tsx:11-12` → `../orders/orders-url` (`ordersLink`) ve
   `../stock/stock-url` (`stockLink`). URL kurucular sayfa-yerel dosyalarda yaşıyor ama artık
   BAŞKA sayfa tüketiyor — sayfa-yerel dosya, sahibinin süzgeç sözleşmesiyle birlikte değişir ve
   dışarıdan tüketen sessizce kırılır. (Aktif işiniz — bilgi notu düşülür, dokunulmadı.)
2. `products/tabs/package/bundle-form-dialog.tsx:18` → `../product/form-section`. İki tab'ın ortak
   komponenti tek tab'ın klasöründe — aynı desenin tab ölçeği.

**Dayanak:** CLAUDE §2 — paylaşılan olan yükselir (`lib/` ya da ortak üst klasör), sayfaya-özel
sayfada kalır. Sınır delinince "sayfaya-özel" garantisi iki yönde de kaybolur.

**Öneri:** *(1)* çapraz tüketilen link kurucular için karar: ya `lib/`e küçük bir `links`
yardımcısı (yalnız yol+sorgu üretimi; süzgeç tipleri sayfada kalır) ya da "URL kurucular sayfalar
arası import edilebilir" istisnası YAZILIR (bugün fiilî durum bu, ama yazısız). *(2)*
`form-section` → `products/` ailesinin ortak düzeyine (`tabs/` kökü ya da `products/components/`).

**Cevap:** —

## D2. Cihaz forku: envanter TAM — tek gerekçesiz istisna `checkout/[reference]`

**Gözlem:** İki yüzeyin bütün ana sayfaları desene uyuyor (müşteri 13/13, operasyon 10/10:
`page → *-client → .desktop/.mobile`). İstisnalar:

- `checkout/[reference]` — client yok, fork yok; 400+ satırlık gerçek bir ekran ve künyesinde
  **fork'suzluğun gerekçesi yok**. Bilinçliyse ("onay sayfası tek düzenle iki cihazda da doğru
  okunur") bir cümle künyeye; değilse desene bağlanmalı. Sapmanın kendisi değil, YAZISIZ olması
  bulgu (ADR Sapma 3 bu deseni kural yapmış durumda).
- `support/new` · `support/[ticket]` — küçük alt rotalar, üst ailenin action/tip/hook'unu ve
  sözlüğünü kullanıyor. Bu meşru bir desen ama kural metni "her sayfa kendi `messages.json`u"
  diyor — fiilî yorum "sayfa AİLESİ başına sözlük". Kural metnine bu bir cümle eklenirse
  (`CLAUDE §2` ya da STACK §7) bir sonraki alt-rota yazan ajan tereddüt etmez.

**Cevap:** —

## D3. Hook adlandırması: tek sapma — `lib/use-device.ts`

**Gözlem:** Kural `use-x.hook.ts` (CLAUDE §2); envanterdeki tüm hook'lar uyuyor
(`use-load-more.hook.ts`, `use-ticket-photo.hook.ts`, form kiti hook'ları) — tek istisna deseni
kuran dosyanın kendisi: `lib/use-device.ts`. Mekanik yeniden adlandırma (~14 import); aciliyeti
yok ama desenin merkez dosyası desene uymalı — yeni ajan ilk onu örnek alıyor.

**Cevap:** —

## D4. Temiz çıkanlar (kayıt için)

- **Paylaşılan klasörlerde yanlış raflama SIFIR:** tek-tüketicili tarama yalnız üç meşru
  kompozisyon buldu (`mobile-menu`→`site-frame`, `admin-sidebar`→layout,
  `command-palette`→`page-header`) — "tek sayfanın komponenti paylaşılan klasöre konmuş" vakası yok.
- **Ters yön de temiz:** sayfa-yerel komponentini başka sayfaya satan tek vaka D1/2'deki
  `form-section` — onun dışında her `components/` klasörü gerçekten kendi sayfasının.
- **`-types.ts` adlandırması istisnasız** ("view" adlı tip dosyası yok); `messages.json` ana
  sayfalarda eksiksiz; actions kolokasyonu ayrı taramada doğrulanmıştı (`denetim-server-actions`).
- **`products/tabs/*` deseni tutarlı:** tab'lar üst ailenin `products-types/paths/columns`
  dosyalarını kullanıyor — aile-içi paylaşım doğru kurulmuş (D1/2 tek istisna).

**Cevap:** —
