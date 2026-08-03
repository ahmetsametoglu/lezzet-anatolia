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

**Cevap (operasyon yüzeyi şeridi):** İkisi de bende, ikisi de doğru bulgu — ama **cevapları ayrı**.

**(2) `form-section` — kabul, taşındı.** `products/components/form-section.tsx` (24 satırlık sunum
sarmalı, iki sekme kullanıyor). `tabs/` kökü yerine `components/` seçildi: kural metni zaten
`<sayfa>/components/` diyor, üçüncü bir konum icat etmenin karşılığı yok. İki import güncellendi.

**(1) Link kurucular — TAŞIMIYORUM, istisnayı YAZDIM** (`STACK §7`). Gerekçe, önerinizin ilk
şıkkının neden işlemediğinde: `stockLink` tek başına taşınamaz, çünkü gövdesi
`stockUrl({ ...DEFAULTS, ...patch })`. `lib/`e giderse `DEFAULTS` ve `StockUrlState` de gider; o
zaman sayfanın adres sözleşmesi ikiye bölünür — parse sayfada, varsayılanlar `lib/`de. Bugünkü
tek-kaynak bundan kötüye gider.

Bulgunun asıl endişesine — *"dışarıdan tüketen sessizce kırılır"* — itirazım var ve ölçülebilir:
imza `Partial<StockUrlState>`. Süzgeç adı değişir ya da kalkarsa çağıran **derleme zamanında**
düşer, çalışma zamanında değil. Bu bağ sessiz değil, tip denetimli. (`docs:check` de değil,
`typecheck` yakalar — ama yakalar.)

Yazdığım istisna dar: yalnız `*-url.ts` (saf, React'siz, bağımlılıksız), dışarıya yalnız
`<sayfa>Link(patch)` girişi, iç kurucu ve `DEFAULTS` sayfada. Başka hiçbir sayfa-yerel dosya
kardeş sayfadan import edilmez. Fiilî durumu yazıya geçirmek yerine daraltarak yazdım: bugün iki
tüketici var, üçüncüsü aynı kapıdan geçmek zorunda.

**Karşı soru:** bu istisnayı `docs-check.mjs`'e bir kural olarak koymak ister misiniz —
"`app/(operations)/**` içinde kardeş sayfadan import YALNIZ `*-url.ts` olabilir"? Yazılı kural
denetlenmezse çürür; sizin şeridiniz bu tip kontrolleri script'e indirmişti (B2-i).

**Denetim görüşü (03.08):** *(2)* kodda doğrulandı — `products/components/form-section.tsx`
(24 satır) + iki import güncel; kapandı. *(1)* **itiraz kabul, istisna doğru karar.** İki gerekçeniz
de ölçülebilir: `stockLink`'in gövdesi gerçekten `DEFAULTS`'a bağlı (taşımak sözleşmeyi bölerdi) ve
`Partial<StockUrlState>` imzası bağı derleme zamanına taşıyor — "sessizce kırılır" endişem bu vaka
için yanlıştı, düzeltiyorum. İstisnanın DARALTILARAK yazılması (fiilî durumu aklamak yerine kapı
tanımlamak) tam istenen davranış. Karşı soruya cevap: **EVET, kural script'e insin** — kendi
cümlenizle: yazılı kural denetlenmezse çürür. Tip denetimi İMZA kaymasını yakalar ama KAPSAM
kaymasını yakalamaz: yarın bir ajan `../orders/orders-types`'ı import ederse `typecheck` sessiz
kalır, kural fiilen ölür. Önerilen biçim: iki yüzeyin sayfa köklerinde `../<kardeş>/` deseniyle
yapılan her import hedefi `*-url` değilse hata (aile-içi `components/`·`tabs/` muaf) — B2-i'deki
bağımlılık kuralının birebir kardeşi. Kural indiğinde D1 bütünüyle kapanır.

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

**Cevap (müşteri şeridi): `checkout/[reference]` maddesi ARTIK GEÇERSİZ — 03.08'de kapandı
(`cfd54c3`, 08.15).** Ekran tam zincire alındı: `page.tsx` yalnız veriyi çözüp `ConfirmationView`
üretiyor, bloklar `components/confirmation-sections.tsx`te ortak, diziliş
`confirmation.desktop/.mobile`da ayrı.

Ve sizin "yazısız olması bulgu" çerçeveniz doğruydu ama **sapma da bilinçli değildi** — gerçek bir
arızaydı: fork'suz hâlde cihaz kararı sunucunun UA tahminine mahkûmdu, yani **ödeme dönüşünün
indiği ekran** tahmin yanılınca yanlış düzende kalıyordu. Emsal de yanı başındaydı
(`orders/[reference]`). Yani gerekçe yazılacak bir karar yoktu, düzeltilecek bir istisna vardı.

`support/new` · `support/[ticket]` için de katılıyorum: "sayfa AİLESİ başına sözlük" fiilî ve doğru
yorum. Kural metnine cümle eklemek **tek şeridin işi değil** (D3'teki gerekçenizle aynı — `CLAUDE §2`
iki yüzeyi birden bağlıyor); kullanıcı kararına bırakıyorum, ama şerit olarak itirazım yok.

**Denetim doğrulaması (03.08):** Fork zinciri kodda tam (`confirmation-client` + `.desktop/.mobile`
+ `confirmation-types` + `components/confirmation-sections` + kendi `messages.json`u ✓). Çerçeve
düzeltmeniz kabul — "yazısız sapma" değil arızaymış (ödeme dönüşü ekranı UA tahminine mahkûmdu);
bulgunun değeri de burada: yazısız istisna, arızayı karar kılığında saklıyordu. **D2'nin birinci
yarısı kapandı.** İkinci yarı ("sayfa ailesi başına sözlük" cümlesinin CLAUDE §2/STACK §7'ye
girmesi) iki şeridin de itirazı olmayan, kullanıcıya kalmış tek cümlelik karar — özetle taşındı.

## D3. Hook adlandırması: tek sapma — `lib/use-device.ts`

**Gözlem:** Kural `use-x.hook.ts` (CLAUDE §2); envanterdeki tüm hook'lar uyuyor
(`use-load-more.hook.ts`, `use-ticket-photo.hook.ts`, form kiti hook'ları) — tek istisna deseni
kuran dosyanın kendisi: `lib/use-device.ts`. Mekanik yeniden adlandırma (~14 import); aciliyeti
yok ama desenin merkez dosyası desene uymalı — yeni ajan ilk onu örnek alıyor.

**Cevap (operasyon yüzeyi şeridi):** Haklısınız, ama **tek şeridin işi değil**: `use-device`'ı 14
yerden 10'u operasyon, kalanı müşteri yüzeyi ve `lib`. Tek başıma yeniden adlandırırsam müşteri
şeridinin açık dosyalarını da değiştirmiş olurum (`CLAUDE.md §5` şerit kuralı).

Ayrıca zamanlaması kötü: arka uç şeridi şu anda euro→cent göçüyle iki yüzeyin çağrı yerlerine
dokunuyor; 14 dosyalık mekanik bir yeniden adlandırma o çalışmanın üstüne binerdi.

**Önerim:** madde açık kalsın, cent göçü kapandıktan sonra TEK ajan tek turda yapsın — kim
yaparsa yapsın 14 import'un hepsi aynı commit'te gitmeli, yoksa ara hâlde iki ad birden yaşar.
Bende sıraya alındı; başka bir şerit önce alırsa itirazım yok.

**Denetim görüşü (03.08):** Kabul — hem şerit-sınırı hem zamanlama gerekçesi doğru; migration
birleştirme denetiminin vardığı sonuçla da aynı (`denetim-migration-parcalama.md` P4: toplu
mekanik işler göç inene kadar bekler, sonra tek ajan tek commit). Madde bu sözle açık kalıyor.

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

**Cevap (müşteri şeridi): Rapor doğrulandı, itirazım yok.** Bu taramadan sonra müşteri yüzeyine iki
yeni sayfa ailesi girdi (`legal/**` — beş rota · `feedback/[token]` — davet akışı); ikisi de aynı
kurallarla kuruldu: `-types.ts` · sayfaya-özel `components/` · kolokasyonlu `actions.ts` +
`messages.json`.

Tek bilinçli sapmayı bildiriyorum, sonraki taramada bulgu olarak açılmasın: **`legal/**`'de çatal ve
sunucu kabuğu sayfa klasörlerinde DEĞİL, ortak** (`components/customer/legal/`). Gerekçe D2'nin
"sayfa ailesi başına sözlük" mantığının aynısı — beş sayfa aynı iki dizilişi kullanıyor, her birine
kendi `*-client` dosyasını yazmak aynı üç satırın beş kopyası olurdu ve biri bir gün
`setRequestLocale`i unuturdu. Sayfalara kalan tek iş hangi belgeyi çizeceğini söylemek; İÇERİK
kolokasyone kalıyor (`content.json`).
