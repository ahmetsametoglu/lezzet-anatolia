# Müşteri — Talep / Şikâyet

## 1. Amaç ve kullanıcı

Müşterinin sorun veya sorusunu kolayca iletip taleplerinin durumunu izlediği ve yazıştığı alan. Kullanıcı: giriş yapmış B2C veya B2B müşteri (siparişe bağlı talep için oturum şart).

## 2. İçerik envanteri — ne var, neden

### Talep oluşturma

- **Siparişten gelen akış** — "bir sorun mu var?" ile gelindiğinde siparişin kalemleri listelenir; müşteri **ilgili ürünleri işaretler**, tip seçer (bozuk / eksik / soru / diğer), açıklama yazar, isteğe bağlı **fotoğraf** ekler. Fotoğraf, bozuk ürün şikâyetinde çözümü hızlandırır — istenmesi teşvik edilir ama zorunlu değildir
- **Genel "bize yaz" akışı** — birkaç yönlendirme sorusuyla başlar: *"Bir siparişle mi ilgili?"* Evetse: oturum yoksa giriş yaptırılır, sipariş seçtirilir → yukarıdaki akışa bağlanır. Hayırsa: doğrudan serbest mesaj (siparişsiz talep). Amaç: müşteriyi düşündürmeden doğru yola sokmak
- **Gönderim sonrası beklenti** — talebin alındığı ve cevabın e-posta ile bildirileceği sade söylenir

### Talep listesi ve detay

- **Talep listesi** — müşterinin talepleri: konu/tip, bağlı sipariş (varsa), tarih, durum
- **Durum sade dille** — açık ("aldık, sıradayız") / ilgileniyoruz / çözüldü. Çözülen talep gerekirse yeniden açılabilir
- **Yazışma** — talebe bağlı basit mesaj dizisi (müşteri ↔ işletme); müşteri cevap yazabilir, fotoğraf ekleyebilir. Şeffaflık güveni kurar: müşteri "kaale alındım mı" diye merak etmemeli
- **Çözüm bilgisi** — iade/para iadesi yapıldıysa sonucu burada ve sipariş detayında sade dille görünür

## 3. Aksiyonlar

- Talep oluşturma (siparişli: kalem seç + tip + açıklama + foto; siparişsiz: serbest mesaj)
- Taleplerini listeleme, detayını açma
- Yazışmaya cevap yazma, fotoğraf ekleme
- Çözülen talebi yeniden açma

## 4. Durumlar ve varyasyonlar

- **Siparişli / siparişsiz talep**
- **Durum: açık / ilgileniliyor / çözüldü / yeniden açılmış**
- **Boş liste** — hiç talep yoksa sade boş durum + "bize yaz" girişi
- **B2C / B2B** — aynı akış; B2B talepleri çoğu zaman eksik/hasar kaynaklıdır ve kalem işaretleme daha yoğun kullanılır
- Üç dil

## 5. Akış bağlantıları

Gelinen: sipariş detay ("bir sorun mu var?"), hesap, sitedeki genel "bize yaz" girişi, cevap bildirimi e-postasındaki bağlantı.
Gidilen: bağlı sipariş detayı, hesap.

## 6. Yapmaması gerekenler

- "Ticket", iç durum adları (`open/in_progress/resolved`), öncelik/atama gibi destek sistemi kavramları görünmez
- Müşteri **doğrudan iade/para iadesi başlatamaz** — arayüz böyle bir aksiyon vaat etmez; talep iletilir, kararı işletme verir
- İç değerlendirme notları, ürün kalite istatistikleri, parti bilgisi görünmez
- WhatsApp'taki yazışmalar burada birleşik gösterilmez — bu alan sitenin talepleriyle sınırlıdır

## 7. Web / mobil notları (yalnız işlevsel)

- Fotoğraf ekleme mobilde kameradan doğrudan yapılabilmeli (bozuk ürün fotoğrafı o an çekilir)
- Yazışma bildirimi e-postayla gelir; bağlantı doğrudan ilgili talebe açılmalı
