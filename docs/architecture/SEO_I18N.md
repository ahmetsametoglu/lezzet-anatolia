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

## Kalıcı kararlar

- Çeviri **AI ile, admin onaylı, zorunlu değil.**
- Yedek zinciri **TR → FR → DE.**
- Dil **URL'de**, çerezde değil.
- İçerik **server-rendered**, çatallanma içeriği kırpmaz.
