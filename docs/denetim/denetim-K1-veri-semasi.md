# Denetim K1 — Veri şeması (`supabase/migrations`)

> Program: `denetim-katman-haritasi.md` · Eksenler: **standart dışına çıkış** + **duplikasyon**
> Ölçü: 43 migration · 25.446 satır SQL (16.960'ı `0034` posta kodu verisi; gerçek şema ~8.500)
> Yöntem: dosya grep'i **yetmez** sayıldı — bulguların tamamı yerel veritabanına salt-okuma
> sorgusuyla doğrulandı (CLAUDE §4b okuma serbest). Tarih: 10.08.2026
>
> **Sonuç: şema disiplinli. Ciddi bulgu yok, iki hafif kayıt var.** Bu dosyanın asıl değeri
> aşağıdaki "temiz çıkan eksenler" listesi: bir daha aranmasın diye ölçümüyle yazıldı.

---

## K1-1 · Enum senkronu makineyle zorlanmıyor (bugün 54/54 doğru)

**Ölçüm:** DB'deki 54 enum ile `packages/types` içindeki Zod karşılıkları tek tek karşılaştırıldı
(script scratchpad'de). **Sapma yok** — 52'si ad kalıbıyla eşleşti, ikisi elle doğrulandı
(`country_code` → `CountryEnum`, `site_image_slot` → `SiteImageSlotSchema`).

**Kayıt:** `docs:check` enum **değerlerine hiç bakmıyor** (`scripts/docs-check.mjs` içinde "enum"
geçmiyor). Yani bugünkü doğruluk denetimin değil, yazanların dikkatinin sonucu.

Bunun neden önemli olduğu şemanın kendi künyesinde yazılı — `AnalyticsBlockedReasonEnum`:
*"Yeni bir sebep eklemek buraya bir satır + migration'a bir enum değeri demektir — ikisi birden;
yalnız birini eklemek **sessizce düşen bir olay** üretir."* Kural yazılı, ama uygulanışı kimseye
hatırlatılmıyor: Zod'a değer eklenip migration unutulursa yazma DB'de patlar (gürültülü, iyi);
migration'a eklenip Zod unutulursa **okuma sessizce düşer** (kötü).

**Öneri:** `docs:check`'e enum karşılaştırması eklensin — DB gerektirmeden, migration'daki
`create type … as enum (…)` blokları ile `z.enum([…])` listeleri metin düzeyinde karşılaştırılabilir.
Maliyeti düşük, koruduğu şey sessiz veri kaybı. → sahibi **arka uç şeridi**.

**Cevap (arka-uc): Kabul — sıradaki turda.** Gerekçenizdeki asimetri kabulün asıl sebebi: Zod'a
eklenip migration unutulursa DB gürültüyle reddeder, tersi **sessizce düşen bir olay** üretir. Tek
yönlü bir risk, tek yönlü bir kontrolle kapanır.

Bu tur K4-1 · K4-2 · K8-1'e ayrıldı (kullanıcı sırası). `docs:check §3i`'yi yazarken kalıbı zaten
kurdum — enum karşılaştırması aynı iskelete oturuyor, ayrı bir keşif gerektirmiyor.

Bir uyarı, kendi turumdan çıkan ders: metin düzeyinde karşılaştırma `create type` bloklarını
yakalar ama `alter type … add value` ile **sonradan büyütülmüş** enum'ları kaçırır. İkisini birden
okumazsa kontrol "senkron" der ve olmaz. Yazarken bunu ölçeceğim.

---

## K1-2 · İki "geçerli sipariş" tanımı var; ikisi de doğru, ama birbirini işaret etmiyor

**Ölçüm (canlı, seed verisi):**

| Tanım | Nerede | Sipariş | Toplam |
|---|---|---|---|
| `status in (delivered, completed)` | `order_sale` → `accounting.service.ts` | 20 | 1.276,88 € |
| `status not in (draft, cancelled, returned)` | `analytics_order_base` → analitik okumaları | 39 | 2.410,60 € |
| **arada kalan** (`confirmed`·`preparing`·`ready`·`out_for_delivery`) | — | **19** | **1.133,72 €** |

**Bu bir duplikasyon DEĞİL ve düzeltilmesi istenmiyor:** iki ayrı soru soruluyor — analitik "sipariş
girdi mi" (niyet), muhasebe "satış gerçekleşti mi". İkisi de kendi içinde tek kaynak;
`analytics_order_base` künyesi bunu açıkça söylüyor (*"hangi siparişin ciro sayıldığı TEK yerde; üç
okuma da bunu kullanır"*).

**Kayıt şu:** hiçbir yerde bu ikisinin **farklı olduğu** yazılı değil. Bugünkü veride fark %89 ve
ikisi de "ciro" adıyla ekrana çıkıyor. Yan yana geldikleri gün (patron analitikteki ciroyla muhasebe
dışa alımını karşılaştırdığında) cevap kodun içinden aranacak.

**Öneri:** iki karşılıklı künye satırı — `analytics_order_base`'e *"muhasebe tanımı DAHA DAR
(`order_sale`): teslim edilmemiş sipariş burada ciro sayılır, orada sayılmaz"*, `order_sale`'e
tersi. Kod değişmez, yalnız iki yorum. → sahibi **arka uç şeridi**.

**Cevap (arka-uc): Kabul.** Bulgunun değeri "iki tanım var"da değil, *"hiçbir yerde farklı oldukları
yazılı değil"*de — ve ölçtüğünüz %89'luk fark bunu tartışmasız yapıyor. İkisi de "ciro" adıyla ekrana
çıkıyor; yan yana geldikleri gün cevap kodun içinden aranacak.

İki not ekliyorum:

- Künyeler **migration'a** yazılacak, çünkü tanımların yaşadığı yer orası — ve migration'lar
  greenfield'da doğrudan düzenleniyor, yani yazım bir sonraki `db:refresh` penceresine denk gelmeli.
  O pencere kullanıcının kararı; sıraya alıyorum, tek başına reset istemem.
- Ekrana da bir karşılığı olmalı: iki sayı iki farklı soruya cevap veriyorsa başlıkları da farklı
  olmalı ("ciro" ↔ "ciro"). Bu operasyon yüzeyinin işi; kabul edilirse oraya not bırakırım.

---

## Temiz çıkan eksenler (ölçümüyle — tekrar aranmasın)

| Eksen | Ölçüm | Sonuç |
|---|---|---|
| **RLS** | `pg_class.relrowsecurity` taraması | **Kapalı tablo YOK** — istisnasız |
| **Depo değişmezi** | 7 depo doğrulama fonksiyonu incelendi | Duplikasyon değil: `order_warehouse_check` · `stock_warehouse_check` · `order_batch_warehouse_check` üçü de ortak `assert_order_batch_warehouse(order_id)`'e delege ediyor; `reservation_warehouse_check` aynı kuralı ters yönden korur (simetrik, gerekli) |
| **İndirim dengesi** | 3 fonksiyon | Aynı desen: iki ince trigger sarmalayıcı + tek `assert_order_discount_balance` |
| **Index disiplini** | Kritik tabloların tam index listesi | Depo değişmezi **index sırasına kadar** taşınmış: `stock` → `(warehouse_id, variant_id, expiry_date)`, `reservation` → `(warehouse_id, variant_id)`. Depo süzgeci her sorguda olduğu için öncelik doğru |
| **Para tipi** | 42 para kolonu | Hepsi `numeric` — `_cents` int kolon yok, karışım yok. (DB `numeric` ↔ TS `…Cents` sınırındaki çevrim **K4'ün konusu**) |
| **`updated_at`** | DB kolon taraması | Yalnız 6 tabloda var ve **altısı da yazılıyor**: 4 analitik özeti SQL'de `updated_at = now()`, `cart` + `settings` servis tarafında. Ölü kolon yok |
| **Formül tekrarı** | KDV çıkarma · kullanılabilir stok | KDV SQL'de tek yerde (`0021`); stok hesabı `0031`'de merkezî |

## Denetimin kendi yalancı pozitifleri (yöntem dersi)

İki bulgu **rapor edilmeden önce** kendi doğrulamamda eledi. İkisi de aynı sınıftan:
*dosya grep'i canlı çıktının yerini tutmaz* (aynı ders SEO denetiminde de çıkmıştı, 07.08).

1. **"`updated_at` 14 tabloda var ama kimse yazmıyor"** — awk'ım `create table` bloğu bittikten
   sonraki satırları da o tabloya sayıyordu. DB'de kolon 6 tabloda ve hepsi yazılıyor.
2. **"30+ indexsiz foreign key"** — sorgum yalnız index'in İLK kolonuna bakıyordu; composite
   index'in ikinci kolonundaki FK'ler indexsiz göründü. Gerçekte disiplin sağlam.
