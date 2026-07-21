# Admin — Raporlar: Kârlılık ve Muhasebe Export

## 1. Amaç ve kullanıcı

Yöneticinin "gerçekten ne kazanıyorum" sorusuna süssüz cevap aldığı ve dış muhasebeye giden veriyi ürettiği yer. İki ayrı kâr kavramı bilinçli olarak ayrı sunulur: ürün kârlılığı (katkı payı) ve şirket kârlılığı (genel giderler düşülmüş). Kullanıcı: yönetici (admin).

## 2. İçerik envanteri — ne var, neden

- **Ürün kârlılığı (katkı payı)** — ürün bazında: satış geliri − doğrudan giderler. Doğrudan gider detayı görünür: **malın maliyeti** (fiilen çıkan partilerin gerçek alış fiyatından, ortalama değil), **teslimat maliyeti** (kargoda gerçek ücret, rota içinde birim maliyet), **ödeme komisyonu**, **paketleme (soğuk zincir) maliyeti**. Bu kalemler sipariş kapanışında sabitlenmiştir — geçmiş rakam sonradan değişmez
- **Fire düşülmüş net marj** — imha/hasar/sayım kayıpları maliyet değeriyle ürünün kârından düşülür: "bu üründen yılda ne kadar çöpe attım" görünür; kârlılık süslü kalmaz. Fire tutarı ayrıca ayrı görünür (kâr içinde kaybolmaz)
- **Şirket kârlılığı** — ürün kârları toplamı − **genel giderler** (kira, maaş, araç, sabit masraf — para tarafındaki gider kayıtlarından). Genel gider ürünlere dağıtılmaz; şirket seviyesinde bir kez düşülür — ürün kararı temiz, şirket kârı gerçek
- **Kanal bazlı görünüm** — aynı kâr rakamları B2B/B2C ayrımıyla; hangi kanal ne kazandırıyor
- **Dönem seçimi** — tüm raporlar dönem (ay/çeyrek/yıl/serbest aralık) üzerinden okunur; karşılaştırma ihtiyacı (bu ay / geçen ay) doğaldır
- **Pazarlık indirimi görünümü** — kapıda/elle satışta liste fiyatından sapılarak verilen indirimlerin toplamı ("kapıda ne kadar indirim verdim") — iz kayıtlarından türetilir
- **Muhasebe export** — dış muhasebe yazılımına giden veri: dönem seçilir, dosya üretilir. **Hediye (ikram) siparişler export'a girmez** — iç raporlarda tam sayılır, yalnız dışarı giden veriden düşer; bu fark kullanıcıya sakin biçimde belli olur
- **Referans ↔ fatura no eşleştirme** — sistemin sipariş referans numarası ile muhasebenin kestiği resmî fatura numarası sonradan eşleştirilir: eşleşmemiş siparişler listelenir, kullanıcı fatura numarasını girer/yapıştırır. KDV işleme tipi (yurt içi / AB şirketler arası) export verisinde taşınır — muhasebe doğru beyanı bundan yapar

## 3. Aksiyonlar

- Dönem ve görünüm seçme (ürün / şirket / kanal)
- Ürün satırını açıp gider kırılımını ve fire detayını görme
- Muhasebe export'u üretme ve indirme/paylaşma
- Fatura numarası eşleştirme (tek tek giriş; eşleşmemişler kuyruğu üzerinden)
- Rapor verisini dışa alma (muhasebeciyle/ortakla paylaşım)

## 4. Durumlar ve varyasyonlar

- **Veri az / veri yok** — ilk dönemlerde raporlar cılızdır; boş hal moral bozmadan "henüz veri birikmedi" demeli
- **Kapanmamış siparişler** — dönem içinde henüz kapanmamış siparişlerin kârı kesinleşmemiştir; rapor kesinleşen ile bekleyeni karıştırmaz
- **Fire ağır ürün** — negatif net marj mümkündür; rakam saklanmaz, görünür
- **Export tekrar üretimi** — aynı dönem ikinci kez export edilebilir (muhasebeci dosyayı kaybetti); mükerrerlik korkusu yaratmadan
- Eşleşmemiş fatura no birikimi — normaldir (muhasebe gecikmeli çalışır), kuyruk boyutu görünür

## 5. Akış bağlantıları

Gelinen: admin ana menü/dashboard.
Gidilen: ürün detayı (fiyat/marj düzeltmesi gerekirse fiyat yönetimine), para hareketleri (genel gider kalemlerine), sipariş detayı (tekil sipariş kârı merak edilirse).

## 6. Yapmaması gerekenler

- İki kâr kavramı tek rakama indirgenerek karıştırılmaz — "ürün kârı" genel gider içermez, "şirket kârı" içerir; ikisi aynı tabloda tek sütun olmaz
- "COGS", "katkı payı", "snapshot", "contribution margin" gibi terimler arayüzde ham kullanılmaz — "malın maliyeti", "doğrudan giderler sonrası kâr" gibi insan dili
- Resmî mali tablolar (bilanço, resmî P&L, KDV beyanı) üretilmez — bu muhasebenin işi; buradaki rakamlar işletme kararı içindir
- Ortaklık paylaşım hesabı burada yapılmaz; sistem satışı doğru kaydeder, paylaşım iş anlaşmasıdır
- Depo/kurye rollerinin bu sayfaya erişimi yoktur — kâr yalnız admin görür

## 7. Web / mobil notları (yalnız işlevsel)

- Telefon önceliklidir: "bu ay nasıl gidiyor" kontrolü telefonda sık yapılır — özet rakamlar telefonda tek bakışta okunmalı
- Detay kırılım ve export/eşleştirme işleri masa başına daha yatkındır ama telefonda da çalışabilmeli (muhasebeci aradığında yolda cevap verilebilmeli)
- Uzun ürün tabloları telefonda taranabilir kalmalı
