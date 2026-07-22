# 05 — Katalog: Servisler ve Yönetim Zemini

## Kapsam

Kataloğun veri ve iş katmanı: `Category / Collection / Product / ProductVariant / Bundle` CRUD servisleri + Server Action'ları, `Price` yönetimi, `Discount` tanımları, çok dilli içerik girişi + **AI çeviri önerisi** (`packages/ai`'ın ilk gerçek kullanımı), slug üretimi/benzersizlik, görsel yükleme (`packages/storage`) ve vitrinin okuma sorguları (aktif katalog + dil yedek zinciri + kanala göre fiyat). **UI yok** — admin ekranları `09`'da, vitrin sayfaları `08`'de; burada o ekranların çağıracağı servis ve action katmanı yazılır. İndirim **uygulama** motoru burada değildir (03'te); burada yalnız tanımların yönetimi vardır. Stok da burada değildir (06).

## Okunacaklar

- `DATA_MODEL.md` (Category → Discount arası varlıklar + "Kalıcı kararlar")
- `DOMAIN.md §5` (fiyat kuralları), `§13` (kategori/koleksiyon/paket/aday ürün)
- `SEO_I18N.md` (çeviri akışı, slug/URL kuralı, yedek zinciri)
- `STACK.md §6` (servis ölçütü), `§10` (sabitler nerede yaşar)

## Bağımlılık

`01-types` ve `02-database` bitmiş olmalı. Vitrin fiyatlı okuma görevi `03-domain-core`'un fiyat çözüm fonksiyonunu kullanır; CRUD görevleri 03'ü beklemez.

## Başlarken verilecek izah (örnek)

> "Kataloğun motorunu yazıyoruz: ürün, kategori, koleksiyon ve paketlerin oluşturulup yönetildiği servisler. Ekran yok henüz — admin sayfaları bu servisleri sonra çağıracak; bugün 'ürün ekle' dediğimizde arka planda doğru çalışan parçayı kuruyoruz. İçerikler üç dilde (TR/FR/DE) tutuluyor; admin bir dilde yazınca yapay zeka diğer iki dili öneriyor, kabul etmek admin'in elinde. Ayrıca her ürüne temiz bir adres parçası (slug — URL'de görünen kısa ad) üretiyoruz ve görsellerin dosya deposuna yüklenmesini bağlıyoruz. Fiyatlar da burada: toptan/perakende listeleri ve müşteriye özel fiyat satırları."

## Görevler

- [ ] **Category + Collection servisleri:** CRUD, sıralama, aktif/pasif, `product_collections` çoklu bağı + Server Action'lar
  - *Bitti:* oluştur–güncelle–pasifle akışı testte; bir ürün iki koleksiyona girip çıkabiliyor
- [ ] **Slug üretici (`packages/helper`):** addan dil-bağımsız slug (Türkçe karakter temizliği) + benzersizlik (çakışmada ek); kategori/ürün/koleksiyon/paket hepsi aynı üreticiyi kullanır
  - *Bitti:* "Su Böreği" → `su-boregi`; aynı adla ikinci kayıt farklı slug alıyor (birim test)
- [ ] **Product + ProductVariant servisleri:** paylaşılan alanlar üründe, satılabilir birim varyantta; varyantsız üründe **varsayılan varyant otomatik** açılır; `is_candidate` ürün satış sorgularının dışında
  - *Bitti:* tek varyantlı ürün oluşturunca varsayılan varyant kendiliğinden yazılıyor; aday ürün vitrin sorgusunda görünmüyor
- [ ] **Price servisi:** kanal fiyatı (b2b/b2c) + müşteriye özel fiyat satırları + `valid_from`; okuma tarafında 03'ün çözüm sırasını kullanan "bu müşteri bu varyantı kaça alır" servisi
  - *Bitti:* özel fiyat → müşteri indirimi → kanal fiyatı senaryoları DB üstünde doğru çözülüyor (entegrasyon testi)
- [ ] **Bundle + BundleItem servisleri:** paket CRUD; **atanmış kalem fiyatlarının toplamı = paket fiyatı** doğrulaması; hediye = 0 fiyatlı kalem; satılabilirlik türetimi stok verisine bağlanacak biçimde iskelet (bağlama 06'dan sonra)
  - *Bitti:* toplamı tutmayan paket `{error}` ile reddediliyor; 0 fiyatlı hediye kalemi kaydedilebiliyor
- [ ] **Discount tanım servisi:** kupon/otomatik kampanya CRUD (kapsam, koşullar, tarih, kullanım sınırı, kişisel kupon); kod benzersizliği — uygulama/seçim motoru 03'te kalır
  - *Bitti:* aynı kodla ikinci kupon reddediliyor; koşul alanları şema doğrulamasından geçiyor
- [ ] **Görsel yükleme (`packages/storage` ilk kullanım):** yükleme action'ı (tip/boyut sınırı), `image_key` saklama (tam URL değil), okuma tarafında URL çözümü
  - *Bitti:* yüklenen görsel depoda, üründe yalnız key duruyor, vitrin sorgusunda URL çözülüyor
- [ ] **AI çeviri önerisi (`packages/ai` ilk kullanım):** `LocalizedText` alanı için girilen dili referans alıp diğer iki dili öneren servis + action — **öneri döner, kayda kendiliğinden yazmaz**
  - *Bitti:* TR girilen ad/açıklama için FR/DE önerisi dönüyor; admin onayı olmadan DB'de değişiklik yok
- [ ] **Vitrin okuma servisleri:** aktif katalog (kategori/koleksiyon/ürün/paket listeleri + ürün detayı), dil yedek zinciri (seçili → TR → FR → DE) çözümü, kanala göre fiyat; arama/filtre sorgu zemini
  - *Bitti:* seed veriyle vitrin sorgusu üç dilde doğru içerik + giriş yapmamış ziyaretçiye B2C fiyatı dönüyor; kanal fiyatı olmayan ürün "satışa kapalı" görünüyor

## Netleşecekler

- **AI sağlayıcı kurulumu:** `packages/ai`'ın ilk gerçek bağlantısı — sağlayıcı hesabı/anahtarı kullanıcıyla birlikte kurulur (dış hesap işlemi); arayüz agnostik kalır.
