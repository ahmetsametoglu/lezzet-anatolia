# Admin — Tedarik / Satın Alma

## 1. Amaç ve kullanıcı

Yöneticinin tedarik tarafını yönettiği yer: tedarikçi kartları, "sipariş zamanı" önerileri, tedarik siparişi hazırlama ve mal alımının (fiyatlı) sisteme işlenmesi. Kullanıcı: yönetici (admin). Depo tarafında ayrı ve fiyatsız bir mal kabul ekranı vardır; bu sayfa fiyat ve tedarikçi boyutunu içeren admin halidir.

## 2. İçerik envanteri — ne var, neden

- **"Sipariş zamanı" önerisi** — asgari stok eşiğinin altına düşen ürünler, **tedarikçiye göre gruplu** liste; sistem önerir, siparişi insan verir. Amaç: "neyi sipariş etmeliyim" sorusunun kafada değil ekranda cevaplanması. (İleride bu öneri satış hızı + sezonla akıllanacak; kurgu buna kapı bırakır)
- **Tedarik siparişi (taslak)** — tedarikçi + kalemler. Kalemler **tedarikçinin kendi sipariş koduyla** yazılır (kod eşlemesinden gelir); adet paket/koli cinsinden. Sipariş, tedarikçiye gönderilecek **temiz bir liste/PDF** üretir — sistem otomatik göndermez, gönderim (WhatsApp/e-posta/telefon) insana aittir
- **Sipariş durumu** — taslak / gönderildi / mal kabul edildi / iptal; gönderilmiş ama gelmemiş siparişler görünür kalır ("neyi bekliyorum"). Mal kabulde eksik gelen kalem **fark** olarak görünür
- **Tedarikçi kartları** — ad, iletişim, vergi no, **bize tanıdığı vade** (varsa), not; alım geçmişi ve **türetilen borç** (girişler − ödemeler): "bu tedarikçiye ne borcum var, bu yıl ne ödedim" tek bakışta. Az sayıda tedarikçi beklenir — dev CRM değil, basit kart listesi
- **Ürün–kod eşlemesi** — varyant başına: tedarikçideki sipariş kodu, oradaki adı, koli içi adet, son alış fiyatı, tercihli tedarikçi işareti. Bir ürünün birden çok tedarikçisi olabilir. Amaç: sipariş yazarken kod tarif etme devrinin bitmesi
- **Satın alma kaydı (stok girişi)** — tedarikçi + tarih + toplam tutar; bir alımdan doğan tüm partiler bu kayda bağlanır. Tedarik siparişinden geliyorsa kalemler önceden dolu. Ödemesi para tarafına gider olarak bağlanır
- **Parti satırları** — ürün/varyant + adet + **son tarih** + **lot numarası** + **birim alış fiyatı**. Lot, geri çağırma zincirinin halkasıdır
- **Toptan alıp paketleme girişi** — "1 kg alıp 10×100gr paketledim": toplam maliyet pakete bölünür, birim maliyeti sistem hesaplar
- **Tazelik uyarısı** — girilen tarihe göre kalan raf ömrü beklenenden kısaysa uyarı; **engellemez**, kabul kararı insanın
- **Son alış fiyatı bilgisi** — önceki alış girişte görünür; fiyat artışı anında fark edilir

## 3. Aksiyonlar

- Öneri listesinden tedarikçi grubunu seç → **tek dokunuşla sipariş taslağı** oluştur → düzenle → "gönderildi" işaretle (liste/PDF'i alıp kendi kanalından gönderir)
- Elle sipariş taslağı oluşturma (öneriden bağımsız)
- Yeni satın alma girişi: tedarikçi seç → parti satırlarını gir → kaydet; siparişten geliyorsa dolu formu doğrula
- Paketleme hesabı: toplam miktar + paket sayısı → birim maliyet otomatik
- Tedarikçi ekleme/düzenleme; ürün–kod eşlemesi ekleme/düzenleme
- Tedarikçiye ödeme kaydına geçiş (para tarafına köprü)
- **(İleride, AI):** tedarikçi faturası fotoğrafı → form AI ile önceden dolar, kullanıcı kontrol edip onaylar

## 4. Durumlar ve varyasyonlar

- **Öneri listesi boş / dolu** (eşik tanımlı ürün yoksa bölüm sade biçimde susar)
- **Siparişli alım / doğrudan alım** (sipariş zorunlu değil — küçük/plansız alım her zaman mümkün)
- **Beklenen ↔ gelen farkı** olan kabul (eksik gelen kalem)
- **Vadeli tedarikçi / peşin tedarikçi** (vade varsa borç takibi anlamlı)
- **Tek partili basit alım / çok satırlı büyük alım**
- **Yeni tedarikçi / kayıtlı tedarikçi**; kod eşlemesi olan / olmayan ürün (eşleme yoksa sipariş bizim adımızla yazılır, eşleme sonradan eklenebilir)
- Son tarih tipi ürüne göre değişir — girişte ekstra soru sorulmaz

## 5. Akış bağlantıları

Gelinen: dashboard (sipariş zamanı uyarısı), stok görünümü (azalan ürün), admin ana menü.
Gidilen: stok görünümü (girilen partiler), para hareketleri (alım ödemesi / tedarikçiye ödeme), tedarikçi kartı, depo mal kabul (siparişin fiziksel kabulü orada da yapılabilir).

## 6. Yapmaması gerekenler

- Satış fiyatı, kâr marjı, müşteri bilgisi — bu sayfanın konusu değil
- **Otomatik sipariş gönderimi yoktur** — sistem hazırlar, insan gönderir; bu bir tasarım kararıdır, eksiklik değil
- "MLOR", "StockIntake", "PO" gibi iç terimler arayüzde kullanılmaz — "kalan tazelik", "stok girişi", "tedarik siparişi" denir
- Muhasebe işlemi yapılmaz; alım yalnız gider olarak para tarafına bağlanır
- Depo mal kabul ekranıyla karışmaz: depocunun yüzeyinde alış fiyatı ve borç yoktur
- Teklif→onay zinciri, çok aşamalı satın alma bürokrasisi kurulmaz — taslak/gönderildi/kabul üç adımı yeter

## 7. Web / mobil notları (yalnız işlevsel)

- Telefon önceliklidir: sipariş taslağı çoğu zaman depoda stok bakarken, giriş koliler açılırken yapılır
- Üretilen sipariş listesi/PDF'i telefondan WhatsApp'a paylaşmak en olası gönderim yoludur — bu akış kesintisiz olmalı
- Tarih ve sayı girişi yoğundur; sahada aceleci kullanımda yanlış girişe dayanıklılık önemli
- Fatura fotoğrafı çekme senaryosu (ileriki AI dolumu) telefonun doğal işidir
