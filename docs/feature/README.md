# docs/feature — özellik etütleri

Yeni bir özelliğin mevcut sisteme yerleşim etütleri. Kapsam kararı kullanıcının. Karar alınınca
dosya özelliğin tek kaydı olur: kararlar, yol haritası ve açık işler orada tutulur; özellik işi
`docs/KALAN.md`'ye satır olarak açılmaz. Şerit ajanları teknik itirazlarını dosyanın sonuna yazabilir.

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
- `iki-is.md` — QUALITE (toptan) ve Lezzet (çevrim içi) iki işin bütün kayıtlarının bizim sistemde, zorunlu "iş" alanıyla
  tutulması: **kararlar alındı 03–04.10**, A (para) ve B (satış ve stok, depo üzerinden) tamamlandı; C (mobil gider fişi),
  D (e-fatura okuyucu) ve E (fişten otomatik okuma) sırada. Pennylane'in yerleşik stok modülü olmaması dayanağı, beş fazlı yol
  haritası ve ölçülmüş etki analizi.
- `kasa-muhasebe.md` — sertifikalı kasa, e-fatura ve KDV yükümlülüklerinin Hiboutik · Pennylane ·
  Revolut ile karşılanması: **kararlar alındı 30.09–01.10**, entegrasyon başlıyor. Yasal zemin
  (BOFiP, DGFiP fişleri), dokuz karar, veri akışı, beş fazlı yol haritası, ölçülecekler, riskler.
- `kasa-muhasebe-inceleme.md` — 13. kararın iki ajanlı incelemesinin 16 bulgusu (07.10): her madde mevcut durum, problem,
  olması gereken ve kanıtla; kullanıcıyla tek tek konuşuluyor, karar ve sonuç maddenin altında.
- `profesyonel-satis.md` — personelin profesyonel müşteri adına sipariş girmesi (web ve mobil, araçtan vadeli satış dahil),
  satış faturasının Pennylane'de kesilmesi ve havalenin faturalara bağlanması: **kararlar alındı 11.10**, Faz 0–1 tamamlandı.
  Ana iskelete dokunmayan altı fazlı yol haritası (dokunuş seviyesiyle), yasal zemin, açık sorular.
- `ulke-pazari.md` — Strasbourg'dan Almanya'ya satış: deponun kargo yaptığı ülkeler ve teslim noktası, ülkeye özel fiyat (tüketici
  ve işletme), ülke başına KDV oranı, uzaktan satış eşiği ve OSS: **kararlar alındı 12.10**, iki ajanla uygulanıyor.
- `degerlendirme.md` — alım sonrası değerlendirme akışı ve ürün sayfasındaki yorumlar: **kararlar alındı 12.10**, ikisi de
  tamamlandı. Ürün başına oy ve yorum, 2 kelimelik alt sınır, yazımda verilen puan, başlıkta puan ve tüm yorumlar ekranı; yol
  haritası (yapay zekâ ile otomatik onay, anlamsız metin ve küfür süzgeci).
