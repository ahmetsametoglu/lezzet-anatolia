# App — Kurye Bölümü (K1–K7)

> Zemin: `app-operasyon-zemin.md`. Web brief'leri `kurye-gun` / `kurye-teslimat` / `kurye-kapanis`
> ile aynı iş — bu dosya NATIVE uygulamanın ekran anlarını ve VERİ GERÇEKLİĞİNİ bağlar. Saha
> bölümü: kuyruklu çevrimdışılık, tek elle kullanım, büyük hedefler.

## K1 · Günün rotası

- **Amaç/an:** vardiya başı, araçta; günün durakları rota sırasında.
- **Veri (durak başına — modelden):** sipariş referansı (`LZA-26-7K4M2P`) · müşteri adı ·
  B2B/B2C ayrımı · adres (`null` olabilir — o durakta navigasyon köprüsü çizilmez; navigasyon
  ADRES METNİYLE harita uygulamasına gider, koordinat/ETA yok) · telefon · WhatsApp bağlantısı
  (`null` = düğme HİÇ görünmez) · **kapıda ödenecek tutar** (`null` = borç yok, para KONUŞULMAZ;
  doluysa tutar + beklenen yöntem) · kalem sayısı + içerik özeti ("2 × Fıstıklı Baklava, 1 × Mantı
  +3") · durak sonucu (aşağıdaki dörtlü) · deneme sayısı.
- **Durak sonucu sözlüğü (tek küme):** bekliyor · teslim edildi · ulaşılamadı · kabul etmedi.
  Sistem iç durumları ekrana sızmaz; "ulaşılamadı" listede KAYBOLMAZ, tekrar denenir.
- **Gün ilerlemesi:** biten/kalan durak + biriken nakit (K7 kapanışında sürpriz olmasın).

## K2 · Sıradaki durak

- Duraktan ayrılırken tek elle "sıradaki"; adresten harita uygulamasına köprü (canlı harita v2),
  müşteriyi ara / WhatsApp.

## K3 · Teslim + kanıt

- **An:** kapıda, müşteri karşısında. **İş:** kanıt al (**imza YA DA fotoğraf** — model ikisini
  de taşır) + kapıda teslim alan kişinin adı (isteğe bağlı) + teslimi işaretle.
- **Kanıt zorunluluğu kanal bazlı bir AYARDIR** (varsayılan: B2B'de zorunlu, B2C'de değil) —
  ekran iki hâli de bilir; zorunluysa kanıt alınmadan teslim yazılamaz (sıra kuralı: kanıt →
  mal → teslim → para; kanıtsız dalda hiçbir şey yazılmaz).
- Kanıt sonradan süreli-imzalı adresle görüntülenebilir (sipariş detayında "kanıtı gör").
- Çevrimdışı: işaret kuyruğa girer; ekran "eşitlenmeyi bekliyor" hâlini gösterir. Eşitlemede
  sistem REDDEDERSE (ör. sipariş bu arada iptal olduysa) bu çelişki NET bir durumla gösterilir —
  sessizce kaybolmaz (zemin §4).

## K4 · Kapıda tahsilat

- **An:** teslim ekranının parçası — tutar `null` değilse tahsilat adımı görünür.
- **Veri:** tahsil edilecek tutar MOTORDAN gelir ve alan onunla açılır; kurye GERÇEKLEŞEN tutarı
  düzeltebilir (eksik ödeme → durum kendiliğinden "Kısmi"ye türer). Yöntem ÜÇLÜ:
  **nakit · kart · çek** — online ve havale kuryenin eline hiç girmez.
- **Nakit yasal sınırı:** tutar eşiği aşarsa ekran UYARIR ama ENGELLEMEZ (bilgidir; eşik ayardan).
- **Kural:** ödeme durumu (Bekliyor/Kısmi/Ödendi/İade) tahsilat kaydından TÜRETİLİR — ekranda
  seçtirilmez. Kuyruk yeniden-denemesi parayı iki kez YAZAMAZ (idempotent kapı — tasarım yüzü:
  "tekrar dene" güvenle basılabilir).
- Kurye SİPARİŞ TUTARINI değiştiremez (fiyat pazarlığı yok); yalnız gerçekleşen tahsilatı yazar.

## K5 · Teslim edilemedi

- **İş:** sonuç seç — **ulaşılamadı** (kapı açılmadı) ya da **kabul etmedi** + kısa serbest not
  ("zil bozuk"; sebep listesi BİLEREK yok — kurye en yakın şıkka basar, yanlış veri doğru
  görünürdü) + fotoğraf.
- **Akıbet:** "kabul etmedi" → iade akışına gider; "ulaşılamadı" → mal AYRILMIŞ kalır, durak
  gün kapanışında BEKLEYEN listesine düşer. **Yeniden planlama otomatiği YOK** — karar operatörün
  (yönetim), kurye yalnız sonucu kaydeder.
- Sistemin ret cümleleri hazır sözlüktendir (ör. "Bu adım şu an yapılamaz — önce 'Yola çıktım'
  işaretlenmeli.") — uygulama kendi cümlesini uydurmaz.

## K6 · Sahada iade

- Müşteri ürünü geri verdi → iade kaydı + hasar fotoğrafı → depoya dönüş listesine girer (D6).

## K7 · Günü kapat

- **An:** rota bitti, araçta/depoya dönüşte. **İçerik (döküm motoru hazır):** teslim edilenler ·
  bekleyenler (ulaşılamadı dahil — yarına devrolur) · dönen mallar (kabul etmeyenler) ·
  **beklenen para: nakit/kart/çek ayrı ayrı** (günün tahsilat kayıtlarından donar).
- **İş:** kurye SAYDIĞINI girer (nakit/kart/çek sayımı) → **fark = sayılan − beklenen, İŞARETLİ
  gösterilir** (eksi = eksik teslim, artı = fazla para; mutlak değere indirgenmez) → kapanır;
  nakit teslimi para defterine düşer.
- Kapanmış gün SALT-OKUNUR açılır; ikinci kapanış denemesi ezmez ("gün zaten kapalı" gerçeğini
  söyler). Tüm duraklar sonuçlanmadan kapanış UYARILI ama mümkün.

## Yapmaması gerekenler

- Başka kuryenin durağı görünmez. Maliyet/marj/fiyat detayı yok — yalnız TAHSİL EDİLECEK tutar.
- Tutar/fiyat değiştirilemez; sipariş içeriği düzenlenemez (istisna kararları yönetimin).
- İç terimler yok ("rezervasyon", iç durum adları).

## YOKLAR (v1'de çizilmeyecek)

- Canlı harita / koordinat / ETA (v2 — navigasyon adres metniyle köprü), rota sırasını değiştirme
  (plan operatörün), müşteri sipariş geçmişi/hesap detayı, teslim-edilemedi sebep LİSTESİ
  (bilinçli — serbest kısa not var).
