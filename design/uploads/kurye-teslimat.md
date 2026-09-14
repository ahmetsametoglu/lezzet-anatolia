# Kurye — Teslimat Ekranı

## 1. Amaç ve kullanıcı

Tek bir teslimatın kapıda sonuçlandırıldığı ekran: teslim, tahsilat, kanıt — ya da ulaşılamadı/reddedildi. Kullanıcı: kurye (yalnız kendine atanan teslimat).

## 2. İçerik envanteri — ne var, neden

- **Müşteri + adres** — kimin kapısında olduğu; navigasyon ve arama/WhatsApp erişimi buradan
- **"Yoldayım" tek tık** — müşteriye WhatsApp'tan tek dokunuşla hazır "yoldayım" mesajı (wa.me); kapıda bekleme ve ulaşılamama oranını düşürür
- **Kalem listesi** — ürün + varyant + adet; teslim edilen malın tek tek dökümü. Teslim onayının konusu bu listedir — müşteri neyi aldığını bu listeden görür
- **Eksik/reddedilen kalem işaretleme** — müşteri bir kalemi kabul etmezse veya kalem eksik çıkarsa kurye o an işaretler; tahsil edilecek tutar buna göre **kendiliğinden** düşer (kurye hesap yapmaz)
- **Ödeme beklentisi ve tutar** — **kapıda ödenecekse:** tahsil edilecek tutar (eksik işaretlendiyse güncellenmiş hali) + yöntem seçimi **nakit / kart / çek**. **Ödendiyse:** "ödendi" bilgisi — para konuşulmaz
- **Nakit yasal sınır uyarısı** — nakit tahsilat yasal sınırı (≈1.000€, ayarlanabilir) aşıyorsa sistem **uyarır ama engellemez**; karar sahadadır (kart/çek önerilebilir). Uyarı kuryeyi zor durumda bırakmadan bilgilendirmeli
- **Teslim onayı (kanıt)** — kalem listesi müşteriye gösterilir; müşteri **ekranda imzalar** veya kurye **fotoğraf çeker**. B2B'de **zorunlu** (varsayılan), B2C'de kapalı (varsayılan) — ayarlanabilir. "Eksik geldi" ihtilafının tek sigortası budur
- **Teslimat özeti bilgisi** — teslimde müşteriye özet belge (kalemler + karşılanan adetler + sipariş referansı; "resmî fatura değildir" ibareli) e-postayla kendiliğinden gider; müşteri kâğıt isterse kurye aynı belgenin **çıktısını** verebilir
- **Ulaşılamadı / reddedildi ayrımı** — iki ayrı sonuç, iki ayrı akıbet: **ulaşılamadı** (evde yok, kapı açılmadı) → sipariş yeniden teslim edilmek üzere bekler, mal araçta kalır; **reddedildi** (müşteri kabul etmedi) → mal depoya iade döner. Kurye doğru olanı kolayca seçebilmeli — ikisi karışırsa stok ve iade süreci karışır

## 3. Aksiyonlar

- **Teslim et** (ana aksiyon): kalemleri onayla → (gerekiyorsa) eksik/reddedilen kalemi işaretle → (kapıda ödemede) yöntem seç + tutarı tahsil et → (gerekiyorsa) imza/foto al → teslimatı kapat
- **"Yoldayım" gönder** (tek tık, WhatsApp)
- Müşteriyi **ara** / navigasyon başlat
- **Ulaşılamadı** işaretle (kısa not eklenebilir: "zil bozuk", "kapıyı açan olmadı")
- **Reddedildi** işaretle (kısa sebep)
- Teslimat özeti **çıktısı ver** (istenirse)

## 4. Durumlar ve varyasyonlar

- **Kapıda ödemeli / önceden ödenmiş** teslimat
- **B2C (kanıt kapalı) / B2B (imza-foto zorunlu)** — zorunlu kanıt alınmadan B2B teslimatı kapanmamalı
- **Tam teslim / kısmi (eksik-reddedilen kalemli) teslim**
- **Nakit sınır uyarılı tahsilat**
- **Ulaşılamadı / reddedildi** sonuçları
- **İmza alınamıyor** (eldiven, yağmur, müşteri istemiyor) → fotoğraf alternatifi her zaman açık

## 5. Akış bağlantıları

Gelinen: **kurye-gun** listesindeki duraktan.
Gidilen: teslimat sonuçlanınca **kurye-gun** listesine dönülür (sıradaki durak); gün bitiminde **kurye-kapanis**. Reddedilen/eksik mal fiziksel olarak depoya döner — depo iade girişi (depo-imha-sayim) orada sonuçlanır, kurye ekranında yalnız işaret vardır.

## 6. Yapmaması gerekenler

- **Kurye fiyat/tutar değiştiremez, indirim yapamaz** — tutar siparişten gelir; eksik işaretlemede bile hesabı sistem yapar
- **Maliyet, kâr, marj, müşterinin vade/limit/borç durumu görünmez**
- Başka kuryenin teslimatı bu ekrandan açılamaz
- Nakit sınırı uyarısı **engel gibi tasarlanmaz** — uyarı bilgilendirir, teslim ve tahsilat devam edebilir
- "Ulaşılamadı" ve "reddedildi" tek bir "teslim edilemedi" düğmesine sıkıştırılmaz — ayrım stok/iade sürecinin temelidir
- İç terimler ("rezervasyon", "delivery_proof", "kısmi karşılama") arayüz dilinde kullanılmaz — "teslim onayı", "eksik kalem" gibi sade dil

## 7. Web / mobil notları (yalnız işlevsel)

- **Telefon esastır; kapı önünde, ayakta, çoğu zaman tek elle** — koli taşırken kullanım gerçektir. Ana aksiyonlar bu koşulda güvenle tamamlanabilmeli
- İmza müşterinin parmağıyla atılır — imza alanı bu kullanım için yeterli olmalı; fotoğraf çekimi kameraya tek dokunuşla geçmeli
- Güneş ışığında okunabilirlik (araç içi/kapı önü) işlevsel gerekliliktir
- Bağlantı kesintisinde teslim/tahsilat işaretleri kaybolmamalı; bağlantı gelince yansımalı
