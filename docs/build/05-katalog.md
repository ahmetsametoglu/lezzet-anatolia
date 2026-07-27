# 05 — Katalog: Servisler ve Yönetim Zemini

## Kapsam

Kataloğun veri ve iş katmanı: `Category / Collection / Product / ProductVariant / Bundle` CRUD servisleri + Server Action'ları, `Price` yönetimi, `Discount` tanımları, çok dilli içerik girişi + **AI çeviri önerisi** (`packages/ai`'ın ilk gerçek kullanımı), slug üretimi/benzersizlik, görsel yükleme (`packages/storage`) ve vitrinin okuma sorguları (aktif katalog + dil yedek zinciri + kanala göre fiyat). **UI yok** — admin ekranları `09`'da, vitrin sayfaları `08`'de; burada o ekranların çağıracağı servis ve action katmanı yazılır. İndirim **uygulama** motoru burada değildir (03'te); burada yalnız tanımların yönetimi vardır. Stok da burada değildir (06).

## Okunacaklar

- `data-model/katalog.md` (Category → BundleItem arası varlıklar) + `DATA_MODEL.md` "Kalıcı kararlar"
- `DOMAIN.md §5` (fiyat kuralları), `§13` (kategori/koleksiyon/paket/aday ürün)
- `SEO_I18N.md` (çeviri akışı, slug/URL kuralı, yedek zinciri)
- `STACK.md §6` (servis ölçütü), `§10` (sabitler nerede yaşar)

## Bağımlılık

`01-types` ve `02-database` bitmiş olmalı. Vitrin fiyatlı okuma görevi `03-domain-core`'un fiyat çözüm fonksiyonunu kullanır; CRUD görevleri 03'ü beklemez.

## Başlarken verilecek izah (örnek)

> "Kataloğun motorunu yazıyoruz: ürün, kategori, koleksiyon ve paketlerin oluşturulup yönetildiği servisler. Ekran yok henüz — admin sayfaları bu servisleri sonra çağıracak; bugün 'ürün ekle' dediğimizde arka planda doğru çalışan parçayı kuruyoruz. İçerikler üç dilde (TR/FR/DE) tutuluyor; admin bir dilde yazınca yapay zeka diğer iki dili öneriyor, kabul etmek admin'in elinde. Ayrıca her ürüne temiz bir adres parçası (slug — URL'de görünen kısa ad) üretiyoruz ve görsellerin dosya deposuna yüklenmesini bağlıyoruz. Fiyatlar da burada: toptan/perakende listeleri ve müşteriye özel fiyat satırları."

## Görevler

- [x] (05.1) **Category + Collection servisleri:** CRUD, sıralama, aktif/pasif, `product_collections` çoklu bağı + Server Action'lar
  - *Bitti:* oluştur–güncelle–pasifle akışı testte; bir ürün iki koleksiyona girip çıkabiliyor
  - **Durum:** `CategoryService` + `CollectionService` (0004 migration, `LocalizedText` jsonb, slug addan türer + rename'de sabit) yazıldı; oluştur–güncelle–pasifle + slug çakışması entegrasyon testinde yeşil. `product_collections` çoklu bağı task 3'te (0005) eklendi: `CollectionService.addProduct/removeProduct/productIds` — üyelik junction `ProductCollectionService`'e (BaseDbService) devreder. **Sapma (bildirildi):** Server Action'lar çağıranı olan admin ekranıyla birlikte 09'a bırakılmıştı; 26.07'de operasyon katalog ekranıyla birlikte yazıldılar (kategori/koleksiyon CRUD + sıralama + koleksiyon üyeliği) — kolokasyon gereği sayfa klasöründe yaşıyorlar.
- [x] (05.2) **Slug üretici (`packages/helper`):** addan dil-bağımsız slug (Türkçe karakter temizliği) + benzersizlik (çakışmada ek); kategori/ürün/koleksiyon/paket hepsi aynı üreticiyi kullanır
  - *Bitti:* "Su Böreği" → `su-boregi`; aynı adla ikinci kayıt farklı slug alıyor (birim test)
  - **Durum:** `slugify` (çok-dilli, petit'in FR-only sürümünün genişletmesi) + `uniqueSlug` helper; birim testte yeşil. Servis tarafı benzersizlik `uniqueSlugForTable` (database utils, prefix sorgusu) ile paylaşımlı.
- [x] (05.3) **Product + ProductVariant servisleri:** paylaşılan alanlar üründe, satılabilir birim varyantta; varyantsız üründe **varsayılan varyant otomatik** açılır; `is_candidate` ürün satış sorgularının dışında
  - *Bitti:* tek varyantlı ürün oluşturunca varsayılan varyant kendiliğinden yazılıyor; aday ürün vitrin sorgusunda görünmüyor
  - **Durum:** 0005 migration (product + product_variant + product_collections). `ProductService` (create → varyant yoksa varsayılan varyant otomatik; `listSellable` aday'ı hariç tutar; `listCandidates`) + `ProductVariantService`. Entegrasyon testleri yeşil. **Incremental:** allergens + target_margin/auto_price geldi; **yasal beyan alanları hâlâ açık** — `ingredients`, `nutrition` (sabit kalemli), `traces`, `storage_instructions` ve `ProductVariant.label`'ın LocalizedText'e geçişi. Beşi de müşteri ürün detay sayfasının (`design/pages/musteri-urun-detay.md`) zorunlu bölümlerini besler; **tek migration turunda** yapılır, parça parça değil — hepsi aynı formu ve aynı sayfayı açar. **Base fix:** numeric (vat_rate) supabase-js'te string dönebildiğinden BaseDbService şema girdisi `unknown`'a gevşetildi (transform'lu şemalar için; Price de kullanacak).
- [ ] (05.4) **Price servisi:** kanal fiyatı (b2b/b2c) + müşteriye özel fiyat satırları + `valid_from`; okuma tarafında 03'ün çözüm sırasını kullanan "bu müşteri bu varyantı kaça alır" servisi
  - *Bitti:* özel fiyat → müşteri indirimi → kanal fiyatı senaryoları DB üstünde doğru çözülüyor (entegrasyon testi)
- [ ] (05.5) **Bundle + BundleItem servisleri:** paket CRUD; **atanmış kalem fiyatlarının toplamı = paket fiyatı** doğrulaması; hediye = 0 fiyatlı kalem; satılabilirlik türetimi stok verisine bağlanacak biçimde iskelet (bağlama 06'dan sonra)
  - *Bitti:* toplamı tutmayan paket `{error}` ile reddediliyor; 0 fiyatlı hediye kalemi kaydedilebiliyor
- [ ] (05.6) **Discount tanım servisi:** kupon/otomatik kampanya CRUD (kapsam, koşullar, tarih, kullanım sınırı, kişisel kupon); kod benzersizliği — uygulama/seçim motoru 03'te kalır
  - *Bitti:* aynı kodla ikinci kupon reddediliyor; koşul alanları şema doğrulamasından geçiyor
- [~] (05.7) **Görsel yükleme (`packages/storage` ilk kullanım):** yükleme action'ı (tip/boyut sınırı), `image_key` saklama (tam URL değil), okuma tarafında URL çözümü; **kapak + galeri** (`ProductImage`: ek görseller, sıralama) — ürün detay sayfası galeri gösterir, kapak üründe kalır
  - *Bitti:* yüklenen görsel depoda, üründe yalnız key duruyor, vitrin sorgusunda URL çözülüyor; bir ürüne birden çok görsel yüklenip sırası değiştirilebiliyor
  - **Durum (27.07 — kapak kırpma):** Görsel **oran + odak/zoom sistemi** kuruldu (Komponent Envanteri §0B + O15). Tek kaynak `packages/types/src/schemas/image.schema.ts`: oran sabitleri (3:2 nesne · 16:9 bant · 1:1 kare), `IMAGE_ROLES` (role→oran+türev çerçeveler), yükleme biçim denetimi + kalite/kadraj **uyarısı** (RED değil). **Sapma (bilinçli, bildirildi):** tasarım dikey/oranı tutmayan dosyayı reddedip "yatay çektir" diyor; fotoğraflar üreticiden geldiği ve yeniden çektirilemediği için RED YOK — operatör dikey/kare kaynağı bile **odak + zoom** ile yatay banda kırpar. Kırpma tamamen görüntüleme anında CSS (`object-position` + `transform`), sunucuda görsel işleme yok. `product` tablosuna `image_focal_x/y · image_zoom · image_alt` eklendi (0005 yerinde düzenlendi, greenfield). Paylaşılan bileşenler: `media/framed-image.tsx` (render primitifi, müşteri+operasyon), `operation/form/image-crop-dialog.tsx` (yükleme+odak+zoom+canlı türev önizleme+uyarı — formdan AYRI diyalog, `Dialog` artık üst üste açılabiliyor), `operation/form/image-crop-field.tsx` (formda kompakt önizleme + hover'da düzenle). Ürün formuna bağlandı. **Alt metin** ayrı zorunlu alan DEĞİL: boşsa müşteride ürün adına düşer (kopya tutulmaz). **Koleksiyon (Faz 1, 27.07):** kapak `ImageCropField`'a geçirildi (`role="collection"`, 16:9). Karar: koleksiyon görseli müşteri sayfasında **render edilmez**, yalnız paylaşım (OG) kartını besler → önizleme "paylaşım kartı (OG)" etiketli. `collection` tablosuna `image_focal_x/y·zoom·alt` (0004 yerinde). **Açık:** optimizasyon/boyutlandırma (sharp vs Cloudflare Image Resizing — sonraya bırakıldı); galeri (`product_image` çoklu görsel) 05.10'da; **kategori görseli** (kolon yok — Faz 2) ve **paket** (model yok — Faz 4) `ImageCropField`'ı `role` ile yeniden kullanacak.
- [ ] (05.8) **AI çeviri önerisi (`packages/ai` ilk kullanım):** `LocalizedText` alanı için girilen dili referans alıp diğer iki dili öneren servis + action — **öneri döner, kayda kendiliğinden yazmaz**
  - *Bitti:* TR girilen ad/açıklama için FR/DE önerisi dönüyor; admin onayı olmadan DB'de değişiklik yok
- [ ] (05.9) **Vitrin okuma servisleri:** aktif katalog (kategori/koleksiyon/ürün/paket listeleri + ürün detayı), dil yedek zinciri (seçili → TR → FR → DE) çözümü, kanala göre fiyat; arama/filtre sorgu zemini
  - *Bitti:* seed veriyle vitrin sorgusu üç dilde doğru içerik + giriş yapmamış ziyaretçiye B2C fiyatı dönüyor; kanal fiyatı olmayan ürün "satışa kapalı" görünüyor

- [ ] (05.10) **Ürün yasal beyan alanları + galeri (TEK migration turu)** · `touches: supabase/migrations/0005_catalog_product.sql, packages/types/src/schemas/product.schema.ts, packages/types/src/schemas/product-variant.schema.ts, packages/types/src/schemas/product-image.schema.ts, packages/types/src/schemas/index.ts, packages/database/src/services/product*.ts, apps/web/app/(operations)/operations/products/**`
  - *Bitti:* müşteri ürün detay sayfasının **her** yasal bölümü girilebiliyor; operasyon "beyan eksik" göstergesi bu alanları da sayıyor; entegrasyon testi yeşil
  - **Neden tek tur:** beşi de aynı migration'a, aynı şemaya, aynı forma ve aynı müşteri sayfasına dokunur — parça parça yapılırsa aynı dosyalar dört kez açılır. Greenfield olduğumuz için `0005` **doğrudan düzenlenir**, yama migration'ı yazılmaz (`WORKFLOW §2` greenfield notu). `pnpm db:reset` gerekiyorsa **kullanıcıdan iste**, kendin çalıştırma (`WORKFLOW §4b`).
  - **Kapsam (model `data-model/katalog.md`'de yazılı — oradan birebir uygula):**
    1. `product.ingredients` — `LocalizedText | null`. INCO: alerjenler metin içinde vurgulanır (vurguyu UI yapar, veri düz metin).
    2. `product.nutrition` — sabit kalemli jsonb, **100 g başına**: `energy_kj`, `energy_kcal`, `fat_g`, `saturated_fat_g`, `carbohydrate_g`, `sugars_g`, `protein_g`, `salt_g`. Serbest anahtar YOK; Zod şeması `NutritionSchema` olarak `product.schema.ts`'te tanımlanır, kalemler `.nullable()` (bilinmiyor → satır gösterilmez).
    3. `product.traces` — `product_allergen[]` (çapraz bulaşma). Serbest metin değil: "aynı tesiste … işlenir" cümlesi bu listeden i18n şablonuyla kurulur, `ALLERGEN_LABELS` zaten var.
    4. `product.storage_instructions` — `LocalizedText | null`. Saklama/hazırlama metni; `shelf_life_days` sayısaldır, bu müşteriye gösterilen metindir.
    5. `product_image` — YENİ tablo (**kapak meta verisi ayrı iştir:** `image_focal_x/y`, `image_alt` 27.07'de ürüne eklendi — galeri bunun üstüne gelir, onu tekrarlamaz): `id`, `product_id`, `image_key`, `alt (LocalizedText|null)`, `sort_order`, `created_at`. **Kapak `product.image_key`'de kalır**, bu tablo yalnız ek görselleri tutar (kapak burada tekrarlanmaz). Servis `BaseDbService` alt sınıfı; sıralama `sort_order`.
    6. `product_variant.label` — `text` → `jsonb` (LocalizedText). Müşteriye görünen boy etiketi ("700 g tepsi" / "plateau 700 g"); üç dilli yüzeyde tek dil kalamaz. `ProductVariantEntrySchema` ve form buna göre güncellenir.
  - **Zincir (sırayla):** migration → `packages/types` şemaları (`ProductSchema`, `ProductDetailsUpdateSchema`, `ProductVariantSchema`, yeni `product-image.schema.ts` + `index.ts` export) → servisler → operasyon ürün formu → "beyan eksik" ölçütü.
  - **"Beyan eksik" ölçütü genişler:** bugün yalnız `name` dilleri + `allergens` boşluğuna bakıyor (`product-preview.tsx`); `ingredients`, `nutrition`, `storage_instructions` de sayılmalı — yoksa operasyon "İçerik tam" derken müşteri sayfası boş kart gösterir.
  - **Tasarım engeli (form yerleşimi):** `Operasyon - Urunler.dc.html` §"Yasal beyan" bugün yalnız alerjen çipleri gösteriyor; içindekiler/besin/saklama/çapraz bulaşma alanları ve galeri yönetimi tasarımda YOK. Model + servis katmanı tasarımı beklemeden yazılabilir; **form alanlarının yerleşimi için tasarım güncellenmeli** — improvise edilmez (`CLAUDE.md §3`).
  - **Renk/stil:** ham hex yasak, `globals.css` token'ları kullanılır (`CLAUDE.md §3`, `STACK §9`).
## Netleşecekler

- **AI sağlayıcı kurulumu:** `packages/ai`'ın ilk gerçek bağlantısı — sağlayıcı hesabı/anahtarı kullanıcıyla birlikte kurulur (dış hesap işlemi); arayüz agnostik kalır.
