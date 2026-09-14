# Müşteri — Katalog

## 1. Amaç ve kullanıcı

Müşterinin ürünleri kategoriyle, aramayla ve filtreyle bulup detaya veya sepete ilerlediği liste sayfası. Kullanıcı: ziyaretçi, B2C veya onaylı B2B müşteri.

## 2. İçerik envanteri — ne var, neden

- **Kategori listesi** — düz (tek seviye) kategoriler: Börekler, Tatlılar, Çerezler…; müşterinin ana gezinme ekseni. Bir ürün tek kategoridedir
- **Koleksiyona göre görünüm** — koleksiyon linkinden gelindiğinde liste o koleksiyonla sınırlı; başlığı belli olmalı ("Bayram" gibi)
- **Ürün listesi** — her üründe: ad, görsel, fiyat (girene göre B2C/B2B), indirimli teklifteyse tek indirimli fiyat, tükendiyse tükendi hali. Liste sepete giden en kısa yoldur
- **Arama** — ürün adında arama; Türkçe/Fransızca/Almanca girilebilir, sonuç sayfanın dilinde gösterilir
- **Filtre/sıralama** — sade bir set yeterli: kategori, fiyat sıralaması, indirimli olanlar. Filtre çeşitliliği katalog küçükken karmaşıklık üretmemeli
- **Sıfır-sonuç durumu** — arama sonuç vermezse müşteriye sade bir boş durum: "bulunamadı" + kataloğa/kategorilere dönüş önerisi. Arama sorgusu arka planda talep sinyali olarak kaydedilir; müşteriye bundan söz edilmez, ayrıca "talebini ilet" gibi bir form da açılmaz
- **Tükenen ürünlerin görünürlüğü** — tükenen ürün listede kalır (tekrar gelecek ürünler için doğru beklenti) ama sepete eklenemez

## 3. Aksiyonlar

- Kategori seçme / değiştirme
- Arama yapma; filtre/sıralama uygulama
- Ürün detayına gitme
- Tek varyantlı ve stokta olan üründe listeden hızlı sepete ekleme (çok varyantlıda detaya gidilir — varyant seçimi atlanamaz)
- Dil değiştirme

## 4. Durumlar ve varyasyonlar

- **Ziyaretçi / B2C / onaylı B2B** — aynı liste, farklı fiyat
- **Tüm katalog / tek kategori / koleksiyon görünümü**
- **Arama sonucu dolu / sıfır-sonuç**
- **Ürün: normal / indirimli teklif / tükendi**
- **B2B kullanım** — B2B müşteri listeden hızla çok kalem toplar; liste bu tempoya uygun olmalı
- Üç dil — metin uzunlukları değişir

## 5. Akış bağlantıları

Gelinen: ana sayfa, kategori/koleksiyon linkleri, arama, sosyal paylaşım linkleri.
Gidilen: ürün detay, paket detay, sepet. Sepete ekleme sonrası alışveriş kesintisiz sürebilmeli.

## 6. Yapmaması gerekenler

- Stok adedi, parti/lot, son tarih, maliyet/marj görünmez
- Sıfır-sonuçta "talebiniz kaydedildi" gibi sistemi ifşa eden mesaj verilmez — boş durum sadedir
- Aday (henüz satılmayan) ürünler katalogda görünmez — onların yeri keşif bölümüdür
- İndirimli teklifte eski fiyat + yeni fiyat iki seçenek gibi sunulmaz; adet sınırı varsa sade söylenir
- B2C ve B2B fiyatı aynı anda gösterilmez

## 7. Web / mobil notları (yalnız işlevsel)

- Mobilde tek elle gezme ve hızlı sepete ekleme ana kullanım; B2B müşteri mobilde de hacimli sipariş girer
- Arama her iki biçimde de kolay ulaşılır olmalı; liste uzadıkça performans (çok ürünlü kategori) düşünülmeli
