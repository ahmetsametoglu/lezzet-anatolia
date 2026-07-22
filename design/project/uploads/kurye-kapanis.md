# Kurye — Gün Kapanışı ve Kasa Mutabakatı

## 1. Amaç ve kullanıcı

Kuryenin gün sonunda teslimatlarını, topladığı parayı ve getirdiği iadeleri kapatıp kasaya teslim ettiği ekran. Kullanıcı: kurye (yalnız kendi günü).

## 2. İçerik envanteri — ne var, neden

- **Günün teslimat dökümü** — teslim edilenler, ulaşılamayanlar, reddedilenler; sayı ve liste olarak. Kapanış "bugün ne oldu"nun tek resmidir
- **Tahsilat toplamları — yöntem bazında** — **nakit / kart / çek** ayrı ayrı beklenen toplamlar; sistem gün içindeki tahsilat işaretlerinden kendisi hesaplar. Nakit fiziksel sayımla, kart cihaz raporuyla, çek yaprak yaprak karşılaştırılır — yöntemler karışırsa mutabakat yapılamaz
- **Kuryenin girdiği fiili teslim tutarları** — kurye elindeki parayı sayar ve yöntem bazında girer; "beklenen"in yanına "sayılan" konur
- **Beklenen − teslim edilen farkı** — sistem karşılaştırır; fark **aynı gün, bu ekranda** görünür. Fark ertesi güne sarkarsa iz soğur; aynı gün görünürlük bu ekranın varlık sebebidir
- **İadeler / getirilen mal** — reddedilen ve teslim edilemeyen kolilerin listesi; kurye bunları depoya fiziksel teslim eder. Kapanış "araçta mal kalmadı"nın da teyididir
- **Ulaşılamayan siparişlerin akıbeti** — yeniden denenecekler listesi; kapanışta kaybolmadıkları görünür (yarının işine devrolur)
- **Kapanış onayı** — gün kapatıldı bilgisi; kapanmış gün salt-okunur görünür

## 3. Aksiyonlar

- Yöntem bazında **sayılan tutarları gir** (nakit sayımı, kart cihaz raporu, çekler)
- Getirilen malı **teslim ettim** olarak işaretle (fiziksel depo teslimiyle birlikte)
- **Günü kapat** (ana aksiyon) — tahsilatlar kasaya teslim edilir, fark varsa kayda geçer
- Fark çıktığında kısa **açıklama notu** ekle ("müşteri X bozuk para veremedi" gibi) — fark gizlenmez, açıklanır
- Kapanmış günü **görüntüle** (salt-okunur)

## 4. Durumlar ve varyasyonlar

- **Gün henüz bitmemiş** — sonuçlanmamış durak varken kapanışa gelinirse kullanıcı uyarılır ama engellenmez (ulaşılamayan duraklar açık kalabilir)
- **Fark yok (mutabık) / fark var** — iki hal net ayrışmalı; fark hem eksik hem fazla yönlü olabilir
- **İadesiz gün / iadeli gün**
- **Tahsilatsız gün** — tüm teslimatlar önceden ödenmişse para adımı doğal olarak boş geçer
- **Boş durum** — bugün hiç teslimat atanmamış

## 5. Akış bağlantıları

Gelinen: **kurye-gun** ekranından gün sonunda; genelde depoya dönüşte açılır.
Gidilen: kapanış sonrası günün özeti; getirilen iade mal depo tarafında (depo-imha-sayim) sonuçlanır — stoğa geri alma/imha kararı depocunundur, kurye yalnız fiziksel teslim eder. Kapanış verisi admin'in kasa/para ekranlarına oradan akar; kurye o ekranları görmez.

## 6. Yapmaması gerekenler

- **Başka kuryenin günü/kapanışı asla görünmez**
- **Maliyet, kâr, marj, işletme kasa bakiyesi, diğer para hesapları görünmez** — kurye yalnız kendi günündeki tahsilatla ilgilenir
- Kurye geçmiş günlerin kapanışını **değiştiremez** (görüntüleme salt-okunur)
- Fark çıktığında ekran suçlayıcı bir dil kurmaz; fark kayda geçer, değerlendirme admin'in işidir
- İç terimler ("mutabakat kaydı", "reconciliation", "para hareketi") arayüz dilinde kullanılmaz — "beklenen", "sayılan", "fark" gibi sade dil

## 7. Web / mobil notları (yalnız işlevsel)

- **Telefon esastır** — kapanış çoğu zaman depoya dönüşte, araçta veya depo girişinde ayakta yapılır
- Para sayarken telefonla tutar girme senaryosu gerçektir — tutar girişi hatasız ve hızlı olmalı
- Gün dökümü uzun olabilir (20+ durak); özet ile detay arasında kaybolmadan gezinilebilmeli
