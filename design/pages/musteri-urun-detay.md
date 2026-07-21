# Müşteri — Ürün Detay

## 1. Amaç ve kullanıcı

Müşterinin bir ürünü tanıyıp doğru varyantı sepete eklediği sayfa. Kullanıcı: B2C veya B2B müşteri (giriş yapmış ya da ziyaretçi).

## 2. İçerik envanteri — ne var, neden

- **Ürün adı + görsel(ler)** — tanıma; görsel iştah açıcı ana unsur (donuk gıdada güven görselle kurulur)
- **Fiyat** — girene göre değişir: ziyaretçi ve B2C perakende fiyatı görür; onaylı B2B müşteri kendi toptan fiyatını görür. Fiyatın *nasıl hesaplandığı* asla gösterilmez, sadece sonuç
- **Varyant seçici** (ör. 70gr / 500gr) — satılabilir birim varyanttır; tek varyantlı üründe seçici hiç görünmez
- **Birim fiyat (€/kg)** — paket fiyatının yanında küçük; karşılaştırma kolaylığı (yasal iyi uygulama)
- **Stok durumu** — sade: "stokta" / "tükendi"; sayı gösterilmez. Tükendiyse sepete ekleme kapalı
- **İndirimli teklif hali** — ürün indirimli teklifteyse **tek fiyat** gösterilir (indirimli), üstü çizili eski fiyat + "son partiler" gibi sade bir rozet olabilir; **adet sınırı** varsa "en fazla X adet" açıkça yazar
- **Açıklama** — kısa, çok dilli
- **İçindekiler + alerjenler** — yasal beyan; alerjenler görsel olarak ayrışır (ikon/rozet), metne gömülmez
- **Net ağırlık + besin değerleri tablosu** — yasal beyan (uzaktan satış); katlanabilir bölüm olabilir, ama erişilebilir
- **Saklama/son tarih tipi bilgisi** — "asgari tazelik tarihi" gibi sade bir dille; teknik terim (DLC/DDM) kullanılmaz
- **Yorumlar + ürün puanı** — onaylı müşteri yorumları ve yıldız/skor; sosyal kanıt. Yorum yoksa bölüm sade bir boş durumla görünür
- **Kargo kısıtı** — ürün kargoyla gönderilemiyorsa ("yalnız bölge içi teslimat") sade bir bilgi satırı
- **Benzer/ilgili ürünler** — keşfi sürdürme (aynı kategori/koleksiyon)

## 3. Aksiyonlar

- Varyant seç → adet seç → **sepete ekle** (ana aksiyon, her an erişilebilir)
- Görselleri büyüt/kaydır
- Yorumları oku; (satın almış müşteri) yorum yaz
- Paylaş (sosyal/WhatsApp)
- Tükendiyse: "gelince haber ver" **yoktur** (kurgulanmadı) — sadece tükendi durumu

## 4. Durumlar ve varyasyonlar

- **Ziyaretçi / B2C / onaylı B2B** — aynı sayfa, farklı fiyat. B2B'ye ayrıca koli/hacim hissi verilebilir (ör. adet artırıcının hızlı büyük adımları)
- **Tek varyant / çok varyant**
- **Normal fiyat / indirimli teklif** (adet sınırlı)
- **Stokta / tükendi**
- **Kargo yasak ürün** (yalnız bölge içi)
- **Yorumlu / yorumsuz**
- Üç dil — metin uzunlukları değişir (Almanca uzun)

## 5. Akış bağlantıları

Gelinen: katalog, ana sayfa, arama, paylaşılan link (sosyal/WhatsApp), benzer ürünler.
Gidilen: sepet (ekleme sonrası mikro-onay + sepete git seçeneği), katalog (geri), benzer ürün detayı.

## 6. Yapmaması gerekenler

- Stok **adedi**, parti/lot bilgisi, son kullanma **tarihi**, alış maliyeti, kâr marjı — asla görünmez
- "DLC", "DDM", "MLOR", "rezervasyon" gibi iç terimler arayüz dilinde kullanılmaz
- İndirimli teklifte normal fiyat + teklif fiyatı **iki ayrı satın alma seçeneği gibi** sunulmaz — tek fiyat kuralı
- B2C fiyatı ile B2B fiyatı aynı anda gösterilmez

## 7. Web / mobil notları

- **Mobil:** görsel üstte tam genişlik; "sepete ekle" ekran altına sabit (sticky); besin/içindekiler katlanır bölümler
- **Web:** görsel sol, bilgi sağ klasik iki sütun; yorumlar aşağıda tam genişlik
- Sepete ekleme her iki biçimde de sayfadan ayrılmadan olur (mikro-onay)
