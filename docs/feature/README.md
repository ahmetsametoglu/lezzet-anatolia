# docs/feature — özellik etütleri

Yeni bir özelliğin mevcut sisteme yerleşim etütleri. **Karar değildir** — kapsam kararı
kullanıcının; karar olgunlaşınca ilgili `docs/build/NN-*.md` dosyalarına görev satırı olarak iner
ve etüt o karara işaret eder. Şerit ajanları teknik itirazlarını dosyanın sonuna yazabilir.

- `barkod-okuyucu.md` — barkod/QR ile operasyon takibi: **kararlar alındı 17.08** (telefon kamerası ·
  koli barkodu + adet çarpanı · öğrenen kod eşlemesi · sipariş KUTUSU kavramı · 4×6 termal etiket ·
  Brother SDK üzerinden diyalogsuz basım · lot etiketi ertelendi); aşama aşama akış, veri modeli
  yönü, fazlama
- `mobil-platform.md` — web mi / native mi / hibrit mi: yetenek matrisi, kurye takibi analizi
  (olay-tabanlı öneri), Capacitor karar çerçevesi (üç tetikleyici)
- `cok-gunluk-sefer.md` — **AÇIK TARTIŞMA, ajan görüşü bekliyor** (kullanıcı kararı 17.08): 2-3 günlük
  tur (400-500 km) modeli nasıl taşır — "müşteri gün seçer, araç tur yapar" çerçevesi, iki kolon
  önerisi (`trip_group`/`trip_day`), ölçülmüş etki analizi (11+4 dosya, rapor tarafı sıfır) ve sekiz
  açık soru. Ajanlar §7'yi okur, §8'e görüş yazar; kararı kullanıcı görüşlerden sonra verir.
- `sefer.md` — gerçekleşen teslimat rotası (`delivery_run`): **implemente edildi 18.08**, görev `11.7`.
  Kararlar aynı gün: kapanış SEFER başına · elle atama devir düğmesine iner · rota+gün başına tek
  sefer · takılı durakları kapanış çözer, günü sevkiyatçı yazar. Ölçülmüş yedi gereklilik kanıtı,
  şema, beş fazlı yol haritası. Tek günlük hâl — turla ilişkisi §6'da, `cok-gunluk-sefer.md`yle
  birlikte okunur.
