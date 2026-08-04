# Müşteri — Ürün Detay

## 1. Amaç ve kullanıcı

Müşterinin bir ürünü tanıyıp doğru varyantı sepete eklediği sayfa. Kullanıcı: B2C veya B2B müşteri (giriş yapmış ya da ziyaretçi).

## 1b. Ürün ailesi — çeşit kartları (YENİ; yeniden tasarım sebebi — kullanıcı kararı 04.08)

**Durum:** Bazı ürünler bir "ailenin" üyesidir. Aileyi **operatör kurar** — model kısıt koymaz:
tipik örnek içeriği değişen çeşitlerdir (aynı kekin limonlu/mangolu/çilekli hâlleri: içindekiler,
besin değerleri, görseller ve fiyat çeşide göre değişir) ama operatör başka gruplamalar da
kurabilir. Her üye kendi ürün sayfasına sahiptir; varyanttan (aynı ürünün boy/porsiyon seçimi)
farklı bir eksendir.

**Amaç:** Müşteri bir üyenin sayfasındayken ailenin öbür üyelerini **aynı sayfada, kaydırmadan**
görmeli ve tek tıkla geçebilmeli. Geçişte sayfanın tamamı — galeri, açıklama, besin değerleri,
yorumlar — seçilen üyenin verisiyle dolar (teknikte kardeş ürünün sayfasına yumuşak geçiştir;
tasarım bunu "aynı sayfada çeşit değiştirme" hissiyle vermeli).

**Karar sırası ve konum:** Müşterinin karar akışı *"hangisi?" (çeşit) → "hangi boy?" (varyant) →
"kaç adet?"* şeklindedir. Çeşit seçimi kimlik kararıdır ve satın alma kararından ÖNCE, sayfanın
üst bölgesinde görünür olmalıdır — en alttaki benzer-ürünler bölgesine inmez.

**KRİTİK — iki seçici karışmamalı:** Çeşit kartları ile varyant seçici aynı şey değildir ve
müşteri bunu hissetmeli:

- **Çeşit kartı:** ürün fotoğraflı, adlı kart; tıklayınca sayfa o çeşide geçer. Aktif çeşit
  (şu an bakılan) belirgin işaretli.
- **Varyant seçici:** bugünkü gibi metin esaslı boy/porsiyon seçimi; tıklayınca yalnız
  fiyat/gramaj değişir, sayfa değişmez.
- İki grup ayrı adlandırılır (ör. "Çeşitler" / "Boy" — nihai söz tasarımın); görsel dilleri
  bilinçli olarak farklıdır.

**Kurallar:**

- Ailesiz üründe çeşit bloğu HİÇ yoktur (tek varyantlı üründe seçim adımının hiç olmaması
  ilkesiyle aynı).
- **Aile büyüklüğü değişkendir ve öngörülemez** — tasarım hem 2 üyeli dar hâli hem kalabalık
  hâli (10+) çözmeli; kalabalık hâlde blok sayfayı işgal etmemeli.
- **Tükenen çeşit kartlardan DÜŞER** — sayfa yalnız alınabilir çeşitleri gösterir. Sınır durumu:
  bakılan çeşidin kendisi tükenmişse (doğrudan bağlantıyla gelinmiş olabilir) sayfası yine açılır
  ve alınabilir kardeşlerin kartları görünür — müşteriye çıkış yolu kalır.
- Aile üyeleri alttaki benzer-ürünler bölümünde TEKRAR gösterilmez; o bölüm yalnız aile DIŞI
  önerileri taşır.

## 2. İçerik envanteri — ne var, neden

- **Ürün adı + görsel(ler)** — tanıma; donuk gıdada güven ve iştah görselle kurulur
- **Fiyat** — girene göre değişir: ziyaretçi ve B2C perakende fiyatı görür; onaylı B2B müşteri kendi toptan fiyatını görür. Fiyatın *nasıl hesaplandığı* gösterilmez, sadece sonuç
- **Varyant seçimi** (ör. 70gr / 500gr) — satılabilir birim varyanttır; tek varyantlı üründe seçim adımı hiç var olmamalı
- **Birim fiyat (€/kg)** — paket fiyatlarını karşılaştırılabilir kılar (yasal iyi uygulama)
- **Stok durumu** — sade: "stokta" / "tükendi"; sayı verilmez. Tükendiyse sepete ekleme yapılamaz
- **İndirimli teklif hali** — ürün indirimli teklifteyse müşteri **tek fiyat** görür (indirimli); indirimde olduğu ve varsa **adet sınırı** ("en fazla X adet") açıkça anlaşılmalı
- **Açıklama** — kısa; sayfa hangi dildeyse o dilde tek metin (içerik üç dilde tutulur ama aynı anda tek dil gösterilir; çeviri eksikse yedek dilden gelir — tasarım bunu ayrıca göstermez)
- **İçindekiler + alerjenler** — yasal beyan; alerjenler güvenlik bilgisi olduğu için müşterinin gözünden kaçmamalı
- **Net ağırlık + besin değerleri** — yasal beyan (uzaktan satışta satın alma öncesi erişilebilir olmalı)
- **Saklama/tazelik bilgisi** — sade dille ("asgari tazelik tarihi" gibi); teknik terim kullanılmaz
- **Yorumlar + ürün puanı** — onaylı müşteri yorumları ve ürün skoru; sosyal kanıt. Yorum yoksa bölümün boş hali de tasarlanır
- **Kargo kısıtı** — ürün kargoyla gönderilemiyorsa müşteri bunu sipariş vermeden önce öğrenmeli ("yalnız bölge içi teslimat")
- **Aile çeşit kartları** (§1b) — ailenin öbür üyeleri; resimli, üst bölgede, varyant seçiciden ayrı dilde
- **Benzer/ilgili ürünler** — keşfi sürdürme (aynı kategori/koleksiyon); **aile üyeleri burada tekrar görünmez** (§1b)

## 3. Aksiyonlar

- Çeşit kartına tıkla → kardeş çeşidin sayfası (URL değişir; tarayıcı geri tuşu önceki çeşide döner)
- Varyant seç → adet seç → **sepete ekle** (sayfanın ana aksiyonu)
- Görsellere bakma
- Yorumları okuma; (satın almış müşteri) yorum yazma
- Paylaşma (sosyal/WhatsApp)
- Tükendiyse: yalnız tükendi durumu — "gelince haber ver" kurgusu yok

## 4. Durumlar ve varyasyonlar

- **Ziyaretçi / B2C / onaylı B2B** — aynı sayfa, farklı fiyat. B2B müşteri hacimli adet girer (10-50 koli) — adet girişi bu kullanım için de rahat olmalı
- **Tek varyant / çok varyant**
- **Aileli / ailesiz ürün** — aileli hâlde: 2 üyeli en dar hâl · 10+ üyeli kalabalık hâl · bakılan çeşidin kendisi tükenmiş hâl · aile + çok varyant bir arada (çeşit kartları ve boy seçici aynı sayfada)
- **Normal fiyat / indirimli teklif** (adet sınırlı)
- **Stokta / tükendi**
- **Kargo yasak ürün** (yalnız bölge içi)
- **Yorumlu / yorumsuz**
- Üç dil — metin uzunlukları değişir (Almanca uzun yazılır)

## 5. Akış bağlantıları

Gelinen: katalog, ana sayfa, arama, paylaşılan link (sosyal/WhatsApp), benzer ürünler.
Gidilen: sepet, katalog (geri), benzer ürün detayı. Sepete ekleme sonrası müşteri alışverişe kolayca devam edebilmeli (akış tasarımcının kararı).

## 6. Yapmaması gerekenler

- Stok **adedi**, parti/lot bilgisi, son kullanma **tarihi**, alış maliyeti, kâr marjı — asla görünmez
- "DLC", "DDM", "MLOR", "rezervasyon" gibi iç terimler arayüz dilinde kullanılmaz
- İndirimli teklifte normal fiyat + teklif fiyatı **iki ayrı satın alma seçeneği gibi** sunulmaz — tek fiyat kuralı
- B2C fiyatı ile B2B fiyatı aynı anda gösterilmez

## 7. Web / mobil notları (yalnız işlevsel)

- Mobil ağırlıklı kullanım beklenir (sosyal medya ve WhatsApp'tan gelen trafik doğrudan bu sayfaya düşer — sayfa tek başına ilk izlenim olabilir)
- Yasal beyanlar (içindekiler, alerjen, besin, net ağırlık) her iki biçimde de satın alma öncesi erişilebilir olmalı
