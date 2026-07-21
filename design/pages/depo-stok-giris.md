# Depo — Mal Kabul (Stok Girişi)

## 1. Amaç ve kullanıcı

Tedarikçiden gelen malın parti parti sisteme girildiği ekran. Kullanıcı: depo sorumlusu.

## 2. İçerik envanteri — ne var, neden

- **Ürün + varyant seçimi** — stok varyant (satılabilir paket boyutu) seviyesinde tutulur; giriş de o seviyede yapılır. Ürün arama/seçme kabul anında hızlı olmalı (kamyon beklerken)
- **Adet** — kaç paket girdi. Satış birimi sabit paket olduğu için giriş daima **paket adediyle** yapılır
- **Son tarih** — partinin üstündeki tarih; her partinin kendi tarihi vardır ve zorunludur. Ürünün tarih tipi (güvenlik tarihi mi, kalite tarihi mi) üründe tanımlıdır — depocu tip seçmez, sadece tarihi girer
- **Lot numarası** — tedarikçinin paket üstündeki lot numarası; geri çağırma durumunda "bu lot kimlere gitti" sorusunun tek anahtarıdır. Girişte istenir
- **Tedarikçi** — parti hangi tedarikçiden geldi; izlenebilirliğin "bir adım geri" halkası. Kayıtlı tedarikçi listesinden seçilir
- **Depo konumu** — parti nereye kondu (raf/dolap); hazırlıkta depocuyu doğru yere yönlendirir
- **Raf ömrü uyarısı** — girilen tarihe göre partinin **kalan raf ömrü beklenenden kısaysa** sistem uyarır ("bu parti kısa ömürlü geldi" anlamında). Uyarı **engellemez** — malı kabul edip etmemek sahadaki insanın kararıdır; uyarı yalnız kararı bilinçli kılar
- **Toptan alıp paketleme girişi** — 1 kg dökme alınıp 10×100gr paketlenen mal, paketlendiği haliyle (**10 paket** olarak) girilir; ekran bu senaryoyu doğal karşılamalı (girişin birimi her zaman satılan paket)
- **Girilen partilerin günlük özeti** — bugün kabul edilen partiler; "girdim mi girmedim mi" belirsizliği yaşanmaz, yanlış giriş hemen fark edilir

## 3. Aksiyonlar

- Ürün/varyant seç → adet + son tarih + lot + tedarikçi + konum gir → **kaydet** (ana aksiyon). Aynı irsaliyedeki sonraki ürüne hızla geçilebilmeli (kabul tek ürünle bitmez, ardışık giriş akıcı olmalı)
- Raf ömrü uyarısı çıkarsa: **yine de kabul et** veya vazgeç (karar insanın)
- Az önce girilen partiyi **düzelt** (yanlış adet/tarih anında toparlanır)

## 4. Durumlar ve varyasyonlar

- **Boş / dolu form** — form her partide sıfırdan değil, ardışık girişte tedarikçi gibi ortak alanlar korunarak akmalı
- **Raf ömrü normal / kısa (uyarılı)** parti
- **Hazır paket / toptan alınıp paketlenen** mal
- **Tek ürünlü küçük kabul / çok kalemli büyük kabul** (bir palet dolusu çeşit)
- **Yeni tedarikçi** — listede yoksa akış kırılmadan eklenebilmeli (ad + telefon yeter; detay admin işi)

## 5. Akış bağlantıları

Gelinen: mal geldiğinde doğrudan açılır (depocunun ana menüsünden); admin tarafında oluşturulan satın alma kaydıyla ilişkilenebilir.
Gidilen: kayıt sonrası aynı ekranda sonraki ürüne devam; kabul bitince günlük özet. Girilen partiler anında satılabilir stoğa ve hazırlık önerilerine yansır.

## 6. Yapmaması gerekenler

- **Alış fiyatı / maliyet alanı bu ekranda yoktur** — depocu fiyat görmez ve girmez; alımın para tarafı (tutar, ödeme) admin'in satın alma ekranında yaşar
- Satış fiyatı, kâr marjı, partinin "indirimli teklife çıkarılması" — hepsi admin işidir, burada görünmez
- "MLOR", "DLC/DDM", "parti/batch" gibi iç terimler arayüz dilinde kullanılmaz — "son tarih", "kalan raf ömrü", "parti" yerine gerekiyorsa "giriş" gibi sade dil
- Stokun tamamının dökümü/raporu bu ekrana yığılmaz — bu ekran giriş içindir, stok görünümü admin tarafındadır

## 7. Web / mobil notları (yalnız işlevsel)

- **Telefon önceliklidir.** Kabul rampada/soğuk depoda ayakta yapılır; tek elle, eldivenle, koli üstündeki etikete bakarak giriş senaryosu esastır
- Tarih ve lot girişi bu koşulda hatasız yapılabilmeli (etiketten okuyup yazma anı — hata en çok burada olur)
- Çok kalemli büyük kabulde masaüstü/tablet kullanımı da olasıdır; ardışık giriş her iki biçimde de akıcı olmalı
