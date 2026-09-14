# Admin — Stok

## 1. Amaç ve kullanıcı

Stokun parti (batch) gözüyle izlendiği ve tarihe bağlı kararların (near-expiry teklif, imha, geri çağırma sorgusu) verildiği ekran. Kullanıcı: yalnız admin rolü. (Mal kabul ve imha/sayım girişleri depo ekranlarında yaşar; burası admin'in görünüm ve karar yeridir.)

## 2. İçerik envanteri — ne var, neden

- **Stok seviyeleri (varyant bazında)** — fiili, ayrılmış ve kullanılabilir miktar; "satabileceğim ne kadar" sorusunun cevabı kullanılabilirdir, üç seviyenin ayrımı admin'e açıktır (müşteriye değil)
- **Parti listesi (varyant altında)** — her parti: miktar, son tarih ve tipi (DLC — geçince satılamaz / DDM — geçince satılabilir, kalite düşer), **kalan raf ömrü %** (türetilir: kalan gün ÷ toplam raf ömrü — kararlar mutlak günle değil bu yüzdeyle verilir), tedarikçi lot numarası, depo konumu, alış fiyatı, bağlı stok girişi/tedarikçi
- **Yaklaşan tarihli uyarılar** — kalan % eşiğin (varsayılan %25, parametrik) altına inen partiler bir arada; her biri teklif açma kararı bekler. DDM'i geçmiş ama satılabilir partiler de bu havuzda; **DLC'si geçmiş parti satılamaz** — yalnız imha yolu görünür
- **Near-expiry teklif önerisi** — uyarılan parti için sistemin önerdiği indirimli fiyat (varsayılan %30 indirim, parametrik) + partinin kalan miktarı + maliyeti; **öneri sistemden, fiyat ve karar admin'den**. Teklif açıkken: teklifin partiye bağlı olduğu, miktar tavanının partinin kalanı olduğu ve parti tükenince teklifin kendiliğinden kalktığı anlaşılmalı
- **MLOR bağlamı** — girişte MLOR eşiğinin (varsayılan kalan %75) altında kabul edilmiş partiler işaretli görünür; "bu parti zaten kısa ömürlü geldi" bilgisi teklif ve satış kararlarına bağlam verir
- **Lot arama / geri çağırma sorgusu** — lot numarası (veya parti) ile arama: **"bu parti kimlere gitti"** — partiden çıkan siparişler ve müşterileri (hazırlık kayıtlarından türetilir). Tedarikçi geri çağırması (rappel) anında dakikalar içinde cevap verebilmek içindir; bir adım geriye (hangi tedarikçiden, hangi girişle geldi) de izlenir
- **İmha/fire geçmişi** — partilere bağlı imha/fire/sayım kayıtları ve maliyet değeri; "bu üründen ne kadar çöpe gitti" görünür kalır (detaylı analiz raporlardadır)

## 3. Aksiyonlar

- Near-expiry teklifi açma — önerilen fiyatı kabul ederek veya değiştirerek; açık teklifin fiyatını güncelleme, teklifi kapatma
- DLC'si geçmiş parti için imha başlatma (kayıt depo akışıyla düşer)
- Lot/parti araması yapma; sonuçtan sipariş ve müşteri detayına geçme
- Varyant/ürün araması ve yaklaşan tarihlilere daraltma
- Parti detayından bağlı stok girişine/tedarikçiye geçme

## 4. Durumlar ve varyasyonlar

- **Sağlıklı stok / uyarılı stok** — eşik altına inmiş parti yoksa temiz hal; varsa uyarılar öne çıkar
- **DLC'li / DDM'li parti** — tarih geçince yol ayrımı tamamen farklıdır (imha / indirimli satış); ikisi karıştırılamaz olmalı
- **Teklif açık parti** — normal partiden ayırt edilir; kalan miktar eridiğinde tükenme yakınlığı görünür
- **Aynı varyantta çok parti** — farklı tarihli partiler yan yana; hazırlıkta FEFO'nun (önce süresi dolan) uygulandığı bilinir, admin sıralamayı elle yönetmez
- **Stokta olmayan varyant** — sıfır kullanılabilir; aday ürünler burada hiç görünmez (satılabilir stok dünyası değildir)
- **Ayrılmış > 0, fiili görünürde yerinde** — teslimata çıkmış ama teslim edilmemiş mal; stokta "duruyor" sanılmamalı

## 5. Akış bağlantıları

Gelinen: dashboard (yaklaşan tarihli parti uyarısı), fiyatlar (teklif önerileri aynı karara çıkar), ürünler (bu ürünün stoğu).
Gidilen: sipariş detay (lot sorgusundan), müşteri detay, satın alma/stok girişi (parti kaynağı), fiyatlar.

## 6. Yapmaması gerekenler

- Bu ekran **yalnız admin rolüne** açılır; depo kendi ekranlarında stok girer ve hazırlar ama **alış fiyatı/maliyet/teklif fiyatı görmez** — teklif kararı bu yüzden admin işidir, ekran depoya açılmaz
- Rezervasyon satırları tek tek gösterilmez — "ayrılmış toplam" yeter; TTL/cron mekaniği, rezervasyonun hangi siparişte olduğu gibi iç işleyiş karar için gerekmedikçe dökülmez (sipariş bağlamı sipariş ekranının işidir)
- Teklif açma kararı otomatikleştirilmez — sistem işaretler ve önerir, fiyatı ve kararı admin verir; ekran "sistem indirime soktu" izlenimi yaratmaz
- Müşteri-yüzü dil ile iç dil ayrımı: parti, lot, DLC/DDM, kalan % burada serbesttir ama müşteriye giden hiçbir metin (teklif adı vb.) bu terimleri taşımaz
- Kullanılabilir/ayrılmış gibi türetilmiş sayılar elle düzeltilmez — düzeltmenin yolu depo sayım/imha kaydıdır

## 7. Web / mobil notları (yalnız işlevsel)

- Telefon önceliklidir: yaklaşan tarihli uyarısına bakıp teklif açmak günlük, telefonda biten bir iştir; depoda raf karşısında parti/lot bakmak da telefonla olur
- Geri çağırma sorgusu acil durumda telefondan çalıştırılabilmeli — lot numarası girip müşteri listesine ulaşmak dakikalar içinde olmalı
