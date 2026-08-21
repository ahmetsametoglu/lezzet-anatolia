# Çok Dillilik ve SEO

## Diller

Türkçe, Fransızca, Almanca. Pazar: Fransa ve Almanya.

İki ayrı çok dillilik problemi vardır ve karıştırılmaz:

1. **Arayüz metinleri** (buton, sistem mesajı, etiket) — kod içi i18n dosyaları. Standart.
2. **İçerik** (ürün adı/açıklaması, kategori, kampanya) — veritabanında jsonb `{fr,de,tr}`. Bkz. `DATA_MODEL.md`.

---

## İçerik çeviri akışı

- Admin içeriği **herhangi bir dilde** girebilir; en az bir dil zorunlu, üçü birden değil.
- Sistem, girilen metni **referans alarak** diğer iki dili AI ile üretir (kaynak dil hangisiyse ondan çevirir).
- AI çevirisi bir **öneri**; admin kabul eder, düzenler, veya bir dili boş bırakır.
- Zorunlu çeviri yoktur.

---

## Gösterim ve yedek zinciri

Müşteri bir dil seçer. O dilde içerik yoksa yedek zinciri devreye girer:

```
seçili dil → TR → FR → DE
```

Yani içerik seçili dilde boşsa önce Türkçe, o da boşsa Fransızca, o da boşsa Almanca gösterilir. (En az bir dil dolu olduğundan zincir daima bir sonuç verir.)

---

## URL yapısı (SEO için kritik)

- Her dil **ayrı URL** altında: `/tr/...`, `/fr/...`, `/de/...`
- Her sayfada `hreflang` etiketleri: Google'a "bu sayfanın diğer dillerdeki karşılığı şu" bilgisi. Doğru ülkede doğru dil gösterimi bununla olur.
- `x-default` tanımlanır.
- Dil seçimi URL'de yaşar; çerezle değil (cookie'siz analitik ilkesiyle de uyumlu).

---

## SEO gereksinimleri

- **İçerik server-rendered olmalı.** Blueprint'in sunucu bileşeni deseni bunu zaten sağlar: `page.tsx` veriyi çeker, HTML içerikle gelir. Bot içeriği görür.
- **Mobil/masaüstü çatallanması içeriği kırpmaz.** Google mobil-öncelikli indeksler; mobil sunum içerik-tam olmalı, sadece düzen değişir (bkz. `ARCHITECTURE_DECISIONS.md` Sapma 3).
- **User-agent'e göre ayrı HTML sunma** (cloaking riski). Sunucu herkese aynı içeriği verir; çatallanma client'ta. Bu desen zaten SEO-güvenli.
- Meta başlık/açıklama dil başına, çok dilli içerikten türetilir.
- **Yapısal veri (schema.org) Faz 1'de indi** (08.1, 03.08). Bu satır bir ara *"Faz 2'de değerlendirilir"* diyordu; görev satırı `Product`/`LocalBusiness` istiyordu ve doğrusu oydu — sayfalar zaten sunucuda çizildiği için maliyeti neredeyse sıfır, ertelemenin kazandırdığı bir şey yoktu. `lib/seo/json-ld.tsx`: ürün sayfasında `Product` (varyant başına `Offer`, puan varsa `AggregateRating`), ana sayfada `GroceryStore`.
  **Kural: yalnız elimizde GERÇEKTEN olan alan yazılır.** Puan yoksa `aggregateRating` bloğu hiç doğmaz, fiyatı olmayan varyant `offers`a girmez, tam adres olmadığı için `address` yalnız şehir+ülke taşır. Yapısal veride uydurma değer yaptırıma uğrar — boş alan yazmaktansa alanı hiç yazmamak.

---

## Paylaşım kartları (Open Graph)

**Yeni bir sayfa açan herkes og'yi hreflang gibi düşünmeli** — bu bölüm o yüzden sözleşmede
(08.1, 08.08). Ölçüm bu bölümün yokluğunda ne olduğunu gösterdi: repoda sıfır `openGraph` etiketi
vardı ve WhatsApp'ta dolaşan her ürün bağlantısı **görselsiz, çıplak adres** olarak çıkıyordu.
Sayfa yapılırken kimse unutmamıştı; sözleşmede yazmıyordu.

- **Tek kapı: `openGraphOf` (`apps/web/lib/seo/open-graph.ts`)**, `localeAlternates`in kardeşi.
  Blok her sayfaya elle yazılsaydı kopyalar ayrışırdı — biri `siteName` yazar öteki yazmaz — ve
  fark ancak WhatsApp'ta görülürdü. Kapı `og:url`i **yol tablosundan türetir**: segment kelimesi
  dile göre değişiyor (`/recettes` · `/tarifler`), elle yazılan adres bir dilde yanlış olurdu.
- **Görsel yoksa alan HİÇ yazılmaz.** Boş `og:image` kartı görselsiz değil KIRIK üretir: paylaşım
  aracı adresi çeker, alamaz ve bazı istemcilerde kartın tamamını düşürür. Yapısal verinin *"ne
  söylenirse doğru söylenir"* kuralı burada da geçerli.
- **`og:type` `product` DEĞİL.** Ürün kartı fiyat/stok beklentisi doğurur (`og:price`,
  `availability`) ve o alanları doğru doldurmak bugün taşımadığımız bir söz. Satılan sayfalar
  `website`, okunan içerik (tarif) `article`.
- **`og:url` ile `canonical` AYNI adresi göstermeli.** İkisi ayrışırsa paylaşım aracı bir sayfayı,
  arama motoru başkasını görür. İkisi de yol tablosundan türediği için bu yapısal olarak korunuyor.
- **Bugün kart üreten sayfalar:** ana sayfa · ürün · paket · tarif listesi ve detayı. Görseli
  olanlar ürün, paket ve tarif (kapak görseli); ana sayfa ve tarif listesi görselsiz başlıyor —
  paylaşıma ayrılmış marka görseli yok (`design/BACKLOG §1` kahraman-görsel ailesi).

### Sekme başlığı

`title.template` kök layout'ta (`%s · Lezzet Anatolia`) ve **tek kaynak** `lib/seo/title.ts`.
Sayfalar markayı elle eklemez; ekleseler aynı dizginin onlarca kopyası olurdu.

⚠ **Next şablonu KENDİ segmentine uygulamaz, yalnız ALT rotalara.** Ana sayfa layout'la aynı
segmentte olduğu için ekini almıyordu (ölçüldü: ürün sayfasında ek var, ana sayfada yoktu) —
markasız kalan sayfa sitenin en çok arananıydı. `titleWithBrand` o boşluğu aynı ayırıcıyla kapatır.

### Varsayılan açıklama dile göredir

Kök layout'un `description`ı bir süre **Türkçe sabitti** ve Next onu kendi açıklaması olmayan HER
sayfaya basıyordu: Fransız ziyaretçinin gördüğü sayfa arama motoruna Türkçe açıklama beyan
ediyordu. Hata sessizdi — hiçbir yerde uyarı üretmez, yalnız yanlış dilde bir satır bırakır.
Artık `layout-messages.json`'dan dile göre çözülüyor.

---

## Kalıcı kararlar

- Çeviri **AI ile, admin onaylı, zorunlu değil.**
- Yedek zinciri **TR → FR → DE.**
- Dil **URL'de**, çerezde değil.
- İçerik **server-rendered**, çatallanma içeriği kırpmaz.

---

## Bu belgenin KAPSAMADIĞI üç konu (21.08)

Buradaki her şey **klasik arama motoru** optimizasyonudur. Aşağıdaki üçü ayrı işlerdir, hiçbiri
açılmadı ve **kullanıcı kararıyla en sona bırakıldı** (*"en son konuşulacak konular bunlar, şu an
vakit kaybetmeyelim"*). Kapsam ve gerekçeleri `BACKLOG.md` Faz 2'de:

1. **AI tarayıcı politikası** — `robots.ts` yalnız `userAgent: '*'` yazıyor; `GPTBot`/`ClaudeBot`
   vb. şu an örtük SERBEST. Tercih değil, **karar verilmemiş** olması.
2. **GEO/AEO** — üretken arama için içerik yapısı, `llms.txt`.
3. **Semantik indeks** — bu SEO DEĞİL, iç arama/öneri altyapısıdır (`pgvector` + gömme). İkisini
   aynı başlık altında konuşmak, birini ötekinin bütçesiyle ölçmeye yol açar.

Aranıp bulunamadığı için kayda geçiyor ki tekrar taranmasın: `llms.txt` · `GEO` · `AEO` ·
`embedding` · `pgvector` repoda **hiç geçmiyor**. Dokümandaki "semantik" tasarım renk ailelerini,
`vector` ise `to_tsvector`ü (tam metin, `05-katalog`da kapsam dışı) anlatır.
