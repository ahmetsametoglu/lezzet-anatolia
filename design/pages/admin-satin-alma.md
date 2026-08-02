# Admin — Tedarik

> **Kapsam daraldı (02.08, kullanıcı kararı).** Sayfanın adı "Satın Alma" değil **Tedarik**
> (nav etiketi de öyle) ve **mal kabul buradan ÇIKTI**. Gerekçe §1'de.

## 1. Amaç ve kullanıcı

Yöneticinin tedarik tarafını yönettiği yer — üç iş: **neyi sipariş etmeliyim** (eşik altı öneriler), **neyi sipariş ettim / neyi bekliyorum** (tedarik siparişleri) ve **kimden alıyorum** (tedarikçi kartları + kod eşlemesi). Kullanıcı: yönetici (admin).

**Mal kabul bu sayfada DEĞİLDİR** (karar 02.08): kabul bir **stok hareketidir** ve hareketlerin tek defteri Stok ekranıdır (`admin-stok.md` → "Mal kabul" sekmesi; 01.08'in para emsali kararı). Fiyatlı kabul formu da oradan açılır — arka ucu hazır (`receivePurchase`, satır maliyeti taşır). Bu sayfa siparişin **kapanışını okur** ("8/12 kalem · STR 6 · COL 2"), kaydı yazmaz.

Ayrım tek cümlede: **tedarik malı ısmarlar, stok malı sayar.** Depo yüzeyindeki fiyatsız kabul formu ise depocunundur (`depo-stok-giris.md`) — aynı hareketin rampadaki hâli.

## 2. İçerik envanteri — ne var, neden

- **"Sipariş zamanı" önerisi** — asgari stok eşiğinin altına düşen ürünler, **tedarikçiye göre gruplu** liste; sistem önerir, siparişi insan verir. Amaç: "neyi sipariş etmeliyim" sorusunun kafada değil ekranda cevaplanması. (İleride bu öneri satış hızı + sezonla akıllanacak; kurgu buna kapı bırakır)
- **Tedarik siparişi (taslak)** — tedarikçi + kalemler. Kalemler **tedarikçinin kendi sipariş koduyla** yazılır (kod eşlemesinden gelir); adet paket/koli cinsinden. Sipariş, tedarikçiye gönderilecek **temiz bir liste/PDF** üretir — sistem otomatik göndermez, gönderim (WhatsApp/e-posta/telefon) insana aittir
- **Sipariş durumu** — taslak / gönderildi / mal kabul edildi / iptal; gönderilmiş ama gelmemiş siparişler görünür kalır ("neyi bekliyorum"). Mal kabulde eksik gelen kalem **fark** olarak görünür
- **Tedarikçi kartları** — ad, iletişim, vergi no, **bize tanıdığı vade** (varsa), not; alım geçmişi ve **türetilen borç** (girişler − ödemeler): "bu tedarikçiye ne borcum var, bu yıl ne ödedim" tek bakışta. Az sayıda tedarikçi beklenir — dev CRM değil, basit kart listesi
- **Ürün–kod eşlemesi** — varyant başına: tedarikçideki sipariş kodu, oradaki adı, koli içi adet, son alış fiyatı, tercihli tedarikçi işareti. Bir ürünün birden çok tedarikçisi olabilir. Amaç: sipariş yazarken kod tarif etme devrinin bitmesi
> **Buradan ÇIKAN blok (02.08):** satın alma kaydı (fiyatlı stok girişi), parti satırları, toptan
> alıp paketleme hesabı, tazelik uyarısı ve "son alış fiyatı" bilgisi — hepsi **Stok → Mal kabul**
> sekmesinin işi. Aynı formu iki sayfanın sahiplenmesi, aynı hareketi iki yerden yazmak olurdu.
> Bu sayfa siparişin kabul İLERLEMESİNİ okur (yukarıdaki Kabul sütunu), kaydı yazmaz.

- **Son alış fiyatı — SİPARİŞ yazarken görünür** (kabul ederken değil): kalem eklenirken "geçen sefer kaçtı" bilgisi yanında durur, zam sipariş anında fark edilir

## 3. Aksiyonlar

- Öneri listesinden tedarikçi grubunu seç → **tek dokunuşla sipariş taslağı** oluştur → düzenle → "gönderildi" işaretle (liste/PDF'i alıp kendi kanalından gönderir)
- Elle sipariş taslağı oluşturma (öneriden bağımsız)
- Gönderilmiş siparişi **iptal etme** (mal gelmişse edilemez — zincir kopar)
- Tedarikçi ekleme/düzenleme; ürün–kod eşlemesi ekleme/düzenleme
- Kabul ilerlemesinden **Stok → Mal kabul**'e geçiş (kaydın kendisi orada)
- Tedarikçiye ödeme kaydına geçiş (para tarafına köprü)
- **(İleride, AI):** tedarikçi faturası fotoğrafı → form AI ile önceden dolar, kullanıcı kontrol edip onaylar

## 4. Durumlar ve varyasyonlar

- **Öneri listesi boş / dolu** (eşik tanımlı ürün yoksa bölüm sade biçimde susar)
- **Tedarikçisi eşlenmemiş öneri grubu** — görünür kalır ama sipariş açılamaz: kime yazılacağı belli değildir, sebebi satırda yazar
- **Sipariş beş hâlde**: taslak (henüz gönderilmedi) · gönderildi (bekliyor) · **kısmi kabul** (parçalı geldi, kalanı yolda) · mal kabul (kapandı) · iptal
- **Parçalı kabul, depo kırılımıyla** — tek sipariş birden çok depoya inebilir ve ilk kabul siparişi kapatmaz ("8/12 kalem · STR 6 · COL 2"); kırılım **fiilen giren** partiden gelir, kalemdeki hedef depo yalnız niyet beyanıdır
- **Tutarı eksik sipariş** — fiyatı girilmemiş kalem varsa tutar yaklaşıktır ve ekran bunu söyler ("≈"); hiçbir kalemin fiyatı yoksa tutar hiç yazılmaz (sıfır ≠ bilinmiyor)
- **Vadeli tedarikçi / peşin tedarikçi** (vade varsa borç takibi anlamlı)
- **Yeni tedarikçi / kayıtlı tedarikçi**; kod eşlemesi olan / olmayan ürün (eşleme yoksa sipariş bizim adımızla yazılır, eşleme sonradan eklenebilir)

## 5. Akış bağlantıları

Gelinen: dashboard (sipariş zamanı uyarısı), stok görünümü (azalan ürün / eşik altı), admin ana menü.
Gidilen: **Stok → Mal kabul** (siparişin kabulü ve giren partiler), para hareketleri (alım ödemesi / tedarikçiye ödeme), tedarikçi kartı, depo mal kabul ekranı (rampadaki fiyatsız hâli).

## 6. Yapmaması gerekenler

- Satış fiyatı, kâr marjı, müşteri bilgisi — bu sayfanın konusu değil
- **Mal kabul edilmez, parti yazılmaz, imha/sayım yapılmaz** — hepsi stok hareketidir ve Stok'un defterinde yaşar (§1). Burada yalnız siparişin ne kadarının geldiği okunur
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
