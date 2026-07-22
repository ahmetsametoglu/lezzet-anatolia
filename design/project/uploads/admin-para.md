# Admin — Para: Hesaplar, Hareketler, Banka Import

## 1. Amaç ve kullanıcı

Yöneticinin şirketin parasını tek mantıkla izlediği yer: para bir **hesapta** durur, **hareketlerle** girer/çıkar. Kasa (nakit), bankalar (ör. Revolut, Crédit Mutuel) ve Stripe aynı kavramın örnekleridir — "online para" ayrı bir dünya değil, Stripe hesabıdır. Kullanıcı: yönetici (admin).

## 2. İçerik envanteri — ne var, neden

- **Hesap listesi + bakiyeler** — her hesabın adı, tipi (nakit/banka/ödeme sağlayıcı) ve güncel bakiyesi; bakiye hareketlerden hesaplanır, elle yazılmaz. "Param nerede, ne kadar" tek bakışta
- **Para hareketleri listesi** — her satır: hesap, yön (giriş/çıkış), tutar, tip (sipariş ödemesi / iade / stok alımı / gider / transfer / sermaye / sair), kategori (kira, akaryakıt, maaş, reklam…), tarih, açıklama; bağlıysa sipariş veya alım referansı. Filtre/arama ihtiyacı vardır (hesap, tip, tarih aralığı)
- **Elle hareket girişi** — tip + kategori + hesap + tutar + tarih + açıklama; **reklam giderinde kampanya etiketi** girilir — analitik tarafında kampanyanın cirosu ve gideri yan yana konur (gerçek ROI), etiket bu köprünün anahtarıdır
- **Transfer** — hesaplar arası taşıma (nakit→banka, Stripe→banka aktarımı): tek işlem, iki hesapta simetrik hareket; kullanıcı "gelir/gider" diye düşünmek zorunda kalmaz
- **Banka Excel import** — banka dosyası yüklenir; **ilk seferde AI dosyanın sütun düzenini çıkarır** (hangi sütun tarih, hangisi tutar/açıklama/yön), kullanıcı onaylar, şablon o hesaba kaydedilir; sonraki importlar otomatik okunur. Satırlar hesabın hareketleri olarak girer
- **Satır eşleştirme (öneri + onay)** — import edilen satırlar sipariş ödemesi / gider / transfer adaylarıyla eşleştirilir: sistem önerir (tutar/tarih/açıklama benzerliği), **kullanıcı onaylar veya düzeltir** — tam otomatik değil. Vadeli (hesaba) B2B siparişin havalesi de burada eşleşip siparişi "ödendi" yapar
- **Mutabakat durumu** — hangi hareket eşleşmiş/eşleşmemiş görünür; eşleşmemişler bir iş kuyruğudur ("bu para neyin nesi"). Kurye gün kapanışından gelen kasa teslimi de kasa hesabına giriş olarak burada görünür

## 3. Aksiyonlar

- Elle hareket girme (gider/gelir/sermaye/sair; reklamda kampanya etiketiyle)
- Transfer kaydetme (hesaptan hesaba)
- Banka dosyası yükleme → AI şablon çıkarımını onaylama (ilk sefer) → satır önerilerini onaylama/düzeltme/atlamalı geçme
- Hareketi bir siparişe/alıma elle bağlama (öneri yanlışsa)
- Hareket düzeltme/silme (elle girilenlerde); import satırı silinmez, eşleşmesi değişir
- Hesap ekleme/pasifleştirme (nadir; kurulum işi)

## 4. Durumlar ve varyasyonlar

- **İlk import (şablon çıkarımı) / rutin import (şablon hazır)** — iki ayrı deneyim; ilki dikkat ister, ikincisi hızlı geçer
- **Eşleşme önerili satır / önerisiz satır / çoklu aday** — kullanıcı kararı netçe verebilmeli
- **Mükerrer import** — aynı dosya/satır ikinci kez gelirse çoğaltmamalı; kullanıcıya sakin bir "zaten var" durumu
- **Boş durum:** hiç hareket yok (kurulum başı), hiç eşleşmemiş satır yok ("her şey mutabık" — iyi haber hali)
- Negatif/iade hareketleri (para iadesi) listede yönüyle net ayrışmalı

## 5. Akış bağlantıları

Gelinen: admin ana menü/dashboard; sipariş detayı (ödemesini görme), satın alma (alımın ödemesi).
Gidilen: sipariş detayı (eşleşen hareketten), satın alma kaydı, raporlar (kârlılık bu verilerden beslenir).

## 6. Yapmaması gerekenler

- Resmî muhasebe değildir: fatura, resmî belge, beyan burada üretilmez — yalnız işletmenin kendi para takibi
- "MoneyMovement", "reconciled", "BankImportProfile" gibi iç terimler arayüzde yok — "hareket", "eşleşti/eşleşmedi", "banka şablonu" denir
- Kasa ile banka için ayrı ekran/ayrı mantık kurulmaz — tek liste, hesap yalnız bir filtredir (modelin bütün sadeliği budur)
- AI eşleştirmesi kullanıcı onayı olmadan kesinleşmez — otomatik kabul yok
- Sipariş tahsilatları elle girilmez (online/kapıda tahsilat kendi akışlarından düşer); elle giriş gider/transfer/istisna içindir

## 7. Web / mobil notları (yalnız işlevsel)

- Telefon önceliklidir: gider girişi çoğu zaman anlık yapılır (akaryakıt alındı, nakit çıktı) — hızlı elle giriş telefonda tek dakikalık iş olmalı
- Banka import + satır eşleştirme daha oturarak yapılan bir iştir; telefonda da yürüyebilmeli ama dosya yükleme ve seri onaylama masa başında da rahat olmalı
- Uzun hareket listesi telefonda taranabilir kalmalı (filtre/arama işlevsel ihtiyaçtır)
