# Müşteri — Sipariş Detay

## 1. Amaç ve kullanıcı

Müşterinin tek siparişinin içeriğini, durumunu ve teslimat bilgisini gördüğü, sorun varsa talebe başladığı sayfa. Kullanıcı: giriş yapmış B2C veya B2B müşteri.

## 2. İçerik envanteri — ne var, neden

- **Sipariş kimliği** — referans numarası + tarih; müşteri iletişimde bu numarayı kullanır
- **Durum takibi (sade dille)** — siparişin neresinde olduğu müşteri dilinde: alındı / hazırlanıyor / yolda / teslim edildi / iptal edildi / iade sürecinde. Kargolu siparişte kargo takip numarası ve takip bağlantısı
- **Teslimat bilgisi** — adres, teslimat şekli (kapıya teslim / kargo), bölge içi siparişte teslimat günü
- **Kalemler** — ürün, varyant, adet, birim fiyat, satır toplamı; paketten gelen kalemler paket adıyla gruplu görünür ("Bayram Paketi") — müşteri neyi neden aldığını hatırlar
- **Karşılanan miktar farkı** — bir kalem eksik karşılandıysa sipariş edilen ve gelen miktar net görünür ("3 sipariş edildi, 2 gönderildi") + fark tutarının nasıl çözüldüğü sade dille: peşin ödendiyse fark iade edilir, kapıda ödemede tahsilat düşük alınır. Müşteri hesabın doğruluğundan şüphe etmemeli
- **Tutar özeti** — ara toplam, indirim, kargo ücreti, genel toplam; ödeme yolu ve ödemenin durumu sade dille (ödendi / kapıda ödenecek / havale bekleniyor / iade edildi)
- **Teslimat özeti erişimi** — teslim edilen siparişte teslimat özeti belgesi (kalemler + teslim edilen miktarlar) görüntülenip indirilebilir; "resmî fatura değildir" ibaresi belgededir
- **"Bir sorun mu var?" girişi** — talep akışının başlangıcı; buradan açılan talep siparişe ve seçilen kalemlere bağlanır. Müşteri sorununu aramadan iletebilmeli

## 3. Aksiyonlar

- Kargolu siparişte kargo takibine gitme
- Teslimat özetini görüntüleme/indirme (teslim sonrası)
- **"Bir sorun mu var?"** → talep oluşturma akışı
- Tekrar sipariş (bu siparişin kalemlerini sepete kopyala)
- Bu siparişe bağlı ürünlere yorum yazma (teslim sonrası)

## 4. Durumlar ve varyasyonlar

- **Aktif / teslim edilmiş / iptal / iade sürecinde**
- **Tam karşılanmış / eksik karşılanmış** (fark açıklaması yalnız eksikte görünür)
- **Bölge içi / kargolu**; **peşin / kapıda / vadeli (B2B)** ödeme
- **B2C / B2B** — aynı sayfa; B2B'de kalem sayısı yüksek olabilir
- Üç dil

## 5. Akış bağlantıları

Gelinen: siparişler listesi, sipariş onayı sonrası, bildirim e-postası bağlantısı.
Gidilen: talep oluşturma, talep detayı (bu siparişe bağlı talep varsa), sepet (tekrar sipariş), ürün detay (yorum/inceleme).

## 6. Yapmaması gerekenler

- İç durum adları ve tüm ara geçişler görünmez; parti/lot, hangi partiden hazırlandığı, depo/kurye iç bilgileri görünmez
- Eksik karşılamada **sebep detayı** (stok sayımı, hazırlık kararı) anlatılmaz — durum ve para çözümü yeter
- Maliyet/marj, kaynak etiketi, iç referans eşleştirmeleri görünmez
- Teslimat özeti fatura gibi sunulmaz; sitede fatura yoktur
- Kurye kimliği/telefonu gibi operasyon detayı gösterilmez

## 7. Web / mobil notları (yalnız işlevsel)

- Müşteri bu sayfaya çoğu zaman bildirimden, mobilde gelir; durum ve teslimat bilgisi ilk bakışta kavranmalı
- "Bir sorun mu var?" girişi teslim sonrası da kolay bulunmalı (sorun çoğunlukla tesliminden sonra fark edilir)
