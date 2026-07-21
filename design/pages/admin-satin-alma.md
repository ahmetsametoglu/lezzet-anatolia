# Admin — Satın Alma / Stok Girişi / Tedarikçi

## 1. Amaç ve kullanıcı

Yöneticinin mal alımını sisteme işlediği yer: tedarikçiden gelen mal, partiler halinde stoğa girer; alış maliyeti ve ödeme bağı burada kurulur. Kullanıcı: yönetici (admin). Depo tarafında ayrı bir mal kabul ekranı vardır (fiyatsız); bu sayfa fiyat ve tedarikçi boyutunu da içeren admin halidir.

## 2. İçerik envanteri — ne var, neden

- **Satın alma kaydı (stok girişi)** — tedarikçi + tarih + toplam tutar + not; bir alımdan doğan tüm partiler bu kayda bağlanır. Alımın ödemesi para tarafına bir gider olarak düşer (bağ kurulur, bu sayfada muhasebe işletilmez)
- **Parti satırları** — her satır: ürün/varyant + adet + **son tarih** + **tedarikçi lot numarası** + **birim (paket) alış fiyatı**. Lot numarası geri çağırma (ürün toplatma) durumunda "bu parti kimden geldi, kimlere gitti" zincirinin halkasıdır — girişte istenir
- **Toptan alıp paketleme girişi** — "1 kg alıp 10×100gr paketledim" senaryosu: giriş paket adediyle yapılır, toplam alış maliyeti pakete bölünür. Kullanıcı toplam aldığını ve kaça böldüğünü söyler; birim maliyeti sistem hesaplar
- **Tazelik (MLOR) uyarısı** — girilen son tarihe göre partinin kalan raf ömrü yüzdesi hesaplanır; eşiğin (varsayılan %75) altındaysa uyarı gösterilir: "bu parti zaten ömrünün çoğunu yemiş". Uyarı **engellemez**, kabul kararı insanındır
- **Geçmiş alımlar listesi** — tarih, tedarikçi, tutar, kaç parti; kontrol ve geri dönüp bakma
- **Tedarikçi kartları** — ad, iletişim (telefon/e-posta/adres), not; tedarikçiden yapılan alımların geçmişi. Az sayıda tedarikçi beklenir — dev bir CRM değil, basit kart listesi
- **Son alış fiyatı bilgisi** — aynı varyantın önceki alış fiyatı girişte görünür; "geçen sefer kaçtı" sorusunu masada cevaplar, fiyat artışı anında fark edilir

## 3. Aksiyonlar

- Yeni satın alma girişi: tedarikçi seç (veya yeni ekle) → parti satırlarını gir → kaydet (sayfanın ana aksiyonu)
- Paketleme hesabı: toplam miktar + paket sayısı gir → birim maliyet otomatik
- MLOR uyarısına rağmen kabul etme (bilinçli onay)
- Tedarikçi ekleme/düzenleme
- Geçmiş bir alımı açıp görüntüleme; hatalı girişte düzeltme
- **(İleride, AI):** tedarikçi faturasının fotoğrafı/dosyası → form alanları AI ile önceden dolar, kullanıcı kontrol edip onaylar. Tasarım bu geleceğe kapı bırakır (girişin "boş form" ve "dolu gelmiş form" halleri aynı kurguda yaşayabilmeli)

## 4. Durumlar ve varyasyonlar

- **Tek partili basit alım / çok satırlı büyük alım** — ikisi de akıcı olmalı
- **MLOR uyarılı / uyarısız parti**
- **Yeni tedarikçi / kayıtlı tedarikçi**
- **Paketlemeli giriş / doğrudan paket alımı**
- **Boş durum:** hiç alım yokken ilk giriş yönlendirmesi
- Son tarih tipi ürüne göre değişir (güvenlik tarihi / kalite tarihi) — giriş aynıdır, kullanıcıya ürünün tanımındaki tip uygulanır; girişte ekstra soru sorulmaz

## 5. Akış bağlantıları

Gelinen: admin ana menü/dashboard (stok uyarısından da gelinebilir), stok görünümü ("yeni giriş" ihtiyacı).
Gidilen: stok görünümü (girilen partiler orada yaşar), para hareketleri (alımın ödemesi), tedarikçi kartı.

## 6. Yapmaması gerekenler

- Satış fiyatı, kâr marjı, müşteri bilgisi — bu sayfanın konusu değil; satın alma yalnız "mal + maliyet girişi"dir
- "MLOR", "StockIntake", "intake" gibi iç terimler arayüzde kullanılmaz — "kalan tazelik", "stok girişi" gibi insan diliyle konuşulur
- Muhasebe işlemi yapılmaz (fatura kesme, resmî kayıt); alım yalnız gider olarak para tarafına bağlanır
- Depo mal kabul ekranıyla karışmaz: depocunun gördüğü yüzeyde alış fiyatı yoktur; bu sayfa yalnız admin içindir
- Karmaşık satın alma siparişi süreci (teklif → onay → sipariş → kabul zinciri) kurulmaz — tek adımlı giriş

## 7. Web / mobil notları (yalnız işlevsel)

- Telefon önceliklidir: giriş çoğu zaman depoda, koliler açılırken, tek elle yapılır — çok satırlı parti girişi telefonda hızlı ve hatasız akmalı
- Tarih ve sayı girişi yoğundur (son tarih, adet, fiyat) — sahada eldivenli/aceleci kullanımda yanlış girişe dayanıklılık önemli
- Fatura fotoğrafı çekme senaryosu (ileriki AI dolumu) telefonun doğal işidir
