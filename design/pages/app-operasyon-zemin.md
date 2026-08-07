# Native Uygulama — Operasyon Yüzeyi ORTAK ZEMİN

> Bu dosya operasyon uygulamasının (native, telefon) TÜM ekran brief'lerinin ortak zeminidir;
> `app-kurye` · `app-depo` · `app-yonetim` · `app-para` bunun üstüne oturur. Müşteri uygulamasının
> tasarımı (Mobil - Musteri v3) AYRI evrendir; operasyon tarafı kendi stilinde, sıfırdan
> kurgulanır (README: iki stil evreni serbest — operasyon hız ve netlik ister).

## 1. Kurum: TEK kabuk, ROL bölümleri

- Personel rolleri DÖRT: **kurye · depo · yönetim · muhasebe**. Bir kişi birden çok rol taşıyabilir.
- **Bugün tek kişi çok şapkalı; yarın her şapkaya bir kişi.** Uygulama TEK'tir: kişi hangi rollere
  sahipse o BÖLÜMLER görünür. Rol-değiştirme anahtarı YOKTUR — dört rollü kişi dört bölümü yan
  yana görür; tek rollü kurye yalnız kurye bölümünü görür. Tasarım her bölümü "tek başına da
  bütün, yan yana da tutarlı" kurmalı.
- Dil: **yalnız Türkçe** (operasyon yüzeyi tek dilli).

## 2. Cihaz ve kullanım gerçekliği

- **Telefon.** Barkod/QR okuma v1'de YOK (v2 — etiketleme süreciyle birlikte); v1 düzeni
  liste-işaretle.
- Kurye ve depo bölümleri **tek elle, eldivenle, hareket hâlinde** kullanılır: büyük dokunma
  hedefleri; yıkıcı onay (iptal, fark girişi) iki adım.
- Güneş altında / soğuk depoda okunurluk işlevsel gerekliliktir.

## 3. Bildirim omurgası (uygulamanın varlık sebeplerinden)

Push bildirim, bölümlerin ana girişidir: olay → rol yönlendirmesi. Örnek eşleme (tasarım bildirim
→ ekran açılışını akışın parçası saymalı):

| Olay | Bölüm |
| --- | --- |
| Yeni sipariş onaylandı (toplama bekliyor) | depo |
| Eksik toplama / sipariş istisnası | yönetim |
| Yeni talep/şikâyet · WhatsApp mesajı | yönetim |
| Azalan stok (tetik arka uçta hazırlanıyor) | yönetim |
| Rota atandı / güncellendi | kurye |

Kişi çok şapkalıysa hepsi aynı cihaza düşer — bildirim listesi bölüm renginden/adından ayırt edilir.

**Gerçeklik notu:** push ALTYAPISI (cihaz jetonu + gönderim) bugün sistemde yok — yapım
listemizdedir ve uygulamayla birlikte kurulacak. Tasarım bildirim→ekran akışını normal çizer;
ama HİÇBİR bölüm bildirime MUHTAÇ olamaz — her listeye elle de girilebilmeli (bildirim
hızlandırıcıdır, tek kapı değil).

## 4. Çevrimdışılık sözleşmeleri (bağlayıcı)

- **Saha kartları KUYRUKLU çalışır** (kurye: teslim, tahsilat, teslim-edilemedi): bağlantısızken
  işaretleme yapılır, bağlantı gelince eşitlenir. Ekran "eşitlenmeyi bekleyen" kaydı GÖSTERİR.
- **Depo kartları BAĞLANTI ŞARTLI** (mal kabul, transfer teslim alma): fiziksel mal rafta ↔ sistem
  "yolda" çelişkisi sayım/satışla kesişir; bu ekranlar çevrimdışıyken işaretlemeye izin vermez,
  bunu açıkça söyler.
- **Bayat işlem reddi GÖRÜNÜRDÜR:** kuyruktaki "teslim edildi" eşitlenmeden sipariş webden iptal
  edildiyse sistem işareti reddeder — uygulama bu reddi YUTMAZ; kuryenin "teslim ettim" kaydıyla
  sistemin cevabı çeliştiğinde bunu net bir durumla gösterir (tasarımda bu hâlin bir yeri olmalı).

## 5. v1 sınırları (çizilmeyecekler / stub kalacaklar)

- Canlı kurye haritası: **v2** (kullanıcı kararı). Navigasyon, harita uygulamasına köprüdür.
- Barkod/QR: **v2**.
- WhatsApp'tan sipariş KAYDI: v1'de "masaya erteleme" dalı (kapı henüz yok) — bildirim + not.
- Azalan-stok tetiği: arka uçta hazırlanıyor; ekran tasarlanır, v1'de tetik "yakında" durumunda.
- Muhasebe bölümü v1'de YALNIZ OKUR (yazma işleri masaüstünde).

## 6. Bölüm × ekran haritası (brief dosyaları)

- **Kurye** (`app-kurye.md`): günün rotası · durak/teslim + kanıt · kapıda tahsilat ·
  teslim-edilemedi · sahada iade · günü kapat (mal + NAKİT mutabakatı).
- **Depo** (`app-depo.md`): toplama listesi · mal kabul · yakın-SKT turu · sayım/düzeltme ·
  transfer · kurye dönüşü kabulü.
- **Yönetim** (`app-yonetim.md`): bildirim + hızlı aksiyon ekranları — şikâyet cevabı · sipariş
  istisnası kararı · SKT kampanya onayı · tedarik önerisi onayı · gün özeti · WhatsApp.
- **Para** (`app-para.md`): tahsilat izleme · gün sonu özeti (salt okuma).

## 7. Yapmaması gerekenler (tüm bölümler)

- İç terimler arayüzde kullanılmaz ("rezervasyon", "keyset", "fulfillment", iç durum adları).
- **Depo ekranları PARA GÖRMEZ** (fiyat/fark tutarı yazılmaz); kurye yalnız TAHSİL EDECEĞİ tutarı
  görür; maliyet/marj hiçbir mobil ekranda yok.
- Sistemin türettiği alanlar form alanı gibi çizilmez (ör. ödeme durumu tahsilattan TÜRETİLİR —
  elle seçtirilmez).
- Ekranlar veri envanterindeki alanların DIŞINA çıkmaz: brief'te olmayan alan uydurulmaz; eksik
  görülen brief'e soru olarak döner (paket-etiketi dersi).
