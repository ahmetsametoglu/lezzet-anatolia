# Admin — Ürünler

## 1. Amaç ve kullanıcı

Kataloğun yönetildiği ekran: ürün, varyant, kategori, koleksiyon ve paket oluşturma/düzenleme. Kullanıcı: yalnız admin rolü.

## 2. İçerik envanteri — ne var, neden

- **Ürün listesi** — ad, kategori, aktiflik, varyant sayısı; arama ve kategoriye/duruma göre daraltma. Katalog büyüdükçe ürünü hızla bulmak esastır
- **Ürün bilgileri (paylaşılan)** — ad, açıklama, kategori (tek — ürünün yapısal yeri), görsel, KDV oranı (5,5 / 20), son tarih tipi (DLC/DDM — güvenlik mi kalite mi), toplam raf ömrü (gün — kalan % hesabının temeli), aktiflik, sıralama
- **Çok dilli içerik girişi** — ad/açıklama/içindekiler TR-FR-DE tutulur; en az bir dil zorunlu, üçü birden değil. Admin bir dilde yazar, **AI çeviri önerisi** diğer dilleri doldurur — öneri düzenlenebilir, olduğu gibi kabul edilebilir veya reddedilir; çeviri zorunlu değildir (eksik dil müşteri tarafında yedek zincirle kapanır, admin bunu dert etmez ama hangi dillerin dolu olduğunu görmeli)
- **Slug** — dil-bağımsız URL parçası, benzersiz; addan önerilir, düzenlenebilir. Yayınlanmış slug'ı değiştirmenin link kırma sonucu olduğu anlaşılmalı
- **Yasal beyanlar** — içindekiler (çok dilli), alerjenler (AB 14 listesinden çoklu seçim — serbest metin değil), besin değerleri (100g başına enerji/yağ/karbonhidrat/protein/tuz; opsiyonel), varyantta net ağırlık (gram). Bunlar müşteri sayfasındaki zorunlu beyanların kaynağıdır; eksikse admin fark etmeli
- **Kargo izni** — ürün kargoyla gönderilebilir mi; kapalıysa yalnız rota-içi teslim. Soğuk zincir kararıdır, müşteri tarafındaki görünürlüğü doğrudan etkiler
- **Aday ürün işareti** — stokta olmayan, tedarik edilebilecek ürün; satılamaz, yalnız müşteri keşif bölümünde görünür. Adayı **etkinleştirme** (varyant/stok/fiyat tamamlayıp satılabilir yapma) buradan yapılır
- **Varyantlar** — satılabilir birim varyanttır; etiket (70gr/500gr), net ağırlık, SKU, aktiflik. Tek varyantlı ürün varsayılan varyant taşır — admin bunu ayrıca kurmak zorunda kalmamalı
- **Hedef marj ve otomatik fiyat düğmesi** — ürün başına hedef marj % ve auto_price aç/kapa; davranışın kendisi (uyar / otomatik güncelle) fiyat sayfasında yaşar, tanım üründe durur
- **Kategoriler** — düz liste (iç içe yok); ad (çok dilli), slug, sıralama, aktiflik
- **Koleksiyonlar** — esnek pazarlama grupları (Bayram, Yeni…); ad (çok dilli), slug (sosyal paylaşım linki), ürün ekleme/çıkarma — bir ürün birden çok koleksiyonda olabilir
- **Paketler** — ad/açıklama (çok dilli), görsel, slug, kalemler (varyant + adet) ve **kaleme atanmış birim fiyatlar**; atanmışların toplamı = paket fiyatı, sistem toplamı doğrular. Hediye kalem = 0 fiyat. Paket yeni ürün yaratmaz — bunun kurgusu admin'e açık olmalı

## 3. Aksiyonlar

- Ürün/varyant/kategori/koleksiyon/paket oluşturma, düzenleme, aktif/pasif yapma
- AI çeviri önerisi isteme → öneriyi düzenleme/kabul/ret
- Aday ürünü etkinleştirme (satılabilir hale getirme)
- Görsel yükleme/değiştirme
- Koleksiyona ürün ekleme/çıkarma; paket kalemi ve atanmış fiyat düzenleme

## 4. Durumlar ve varyasyonlar

- **Yeni ürün / mevcut ürünü düzenleme** — yeni üründe zorunlu alanlar netçe ayrışmalı (ad, kategori, KDV, tarih tipi); yasal beyanlar sonradan tamamlanabilir ama eksikliği görünür kalmalı
- **Tek varyant / çok varyant**
- **Aday ürün / satılabilir ürün** — aday üründe fiyat/stok beklenmez
- **Çeviri tam / eksik** — hangi dillerin dolu olduğu ürün başına görünür
- **Paket toplamı tutmuyor** — atanmış fiyatların toplamı paket fiyatına eşit değilse kayıt tamamlanamaz; hata anlaşılır olmalı
- Boş kategoriler/koleksiyonlar var olabilir

## 5. Akış bağlantıları

Gelinen: admin ana gezinme; stok ve fiyat ekranlarından ürüne atıf.
Gidilen: fiyat yönetimi (bu ürünün fiyatları), stok (bu ürünün partileri); müşteri tarafındaki ürün sayfasını görme (kontrol amaçlı).

## 6. Yapmaması gerekenler

- Bu ekran **yalnız admin rolüne** açılır; depo ürün tanımı düzenlemez
- Fiyat girişinin kendisi burada yaşamaz — fiyat kanala/müşteriye göre çözülen ayrı bir dünyadır (admin-fiyatlar); iki yerde fiyat düzenlemek tutarsızlık üretir. Aynı şekilde stok/parti düzenleme burada yapılmaz
- Paket kalemlerine atanmış fiyatların **müşteriye asla görünmediği** bilgisiyle karışan bir dil kullanılmaz — atanmış fiyat iç muhasebe aracıdır
- Alerjen serbest metinle girilmez — yasal beyan sabit listeden seçilir
- AI çevirisi admin onayı olmadan yayına gitmez izlenimi doğru kurulmalı: öneri öneridir

## 7. Web / mobil notları (yalnız işlevsel)

- Telefon önceliklidir; ama çok dilli metin girişi ve paket kurma gibi yoğun işler masaüstünde de rahat olmalı — telefonda tek alan düzeltme (fiyat dışı: ad, aktiflik, koleksiyon) en sık senaryodur
- Görsel yükleme telefondan (kamera/galeri) beklenir
