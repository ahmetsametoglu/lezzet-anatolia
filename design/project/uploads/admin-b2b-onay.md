# Admin — B2B Başvuru Onayı

## 1. Amaç ve kullanıcı

Self-servis açılan B2B hesaplarının toptan fiyatlara erişimine karar verilen ekran: başvuru kuyruğu + başvuru başına kontrol kartı. Tipik karar ~15 saniyedir; ekran bunun için kurulur. Kullanıcı: yalnız admin rolü.

## 2. İçerik envanteri — ne var, neden

### Kuyruk

- **Bekleyen başvurular** — şirket adı, şehir, başvuru zamanı; en eskisi unutulmasın diye sıra belli olmalı
- **Karar verilmişler** — onaylanan/reddedilenlerin geçmişi (kim, ne zaman); sonradan "bunu neden reddetmişiz" sorusunun cevabı

### Kontrol kartı (başvuru başına)

Sistem başvuruyu hazır sinyallerle sunar; admin sinyalleri okur, kararı verir:

- **Şirket kimliği** — unvan, SIRET, adres, faaliyet kodu, kuruluş yılı (FR başvurusunda resmî kayıttan otomatik dolmuş; DE başvurusunda elle girilmiş)
- **Resmî kayıt aktifliği** — şirket resmî kayıtta aktif mi; kapanmış şirket ilk elenendir
- **Faaliyet kodu değerlendirmesi** — gıda/restoran/market ile uyumlu mu; alakasız faaliyet risk işaretidir
- **Kuruluş yılı** — köklülük sinyali; çok yeni şirket dikkat ister
- **Adres–rota uyumu** — adres mevcut teslimat bölgelerine düşüyor mu; rota dışıysa yalnız kargo ilişkisi kurulabilir, karar bunu bilerek verilir
- **Mükerrer kontrolü** — telefon / e-posta / SIRET mevcut bir müşteriyle eşleşiyor mu; eşleşme varsa hangi kayıtla (köprü) — kopya hesap veya eski müşterinin yeniden başvurusu olabilir
- **DE başvurusunda VIES** — USt-IdNr'nin VIES doğrulama sonucu (geçerli/geçersiz); reverse charge bu numaraya dayanır, geçersiz numara güçlü risk işaretidir
- **AI özeti** — tek cümlelik değerlendirme ("2016'dan beri aktif restoran, rota içinde — risk işareti yok"); hızlı okuma içindir, sinyallerin yerine geçmez
- **Google/Haritalar linki** — tek dokunuşla dış doğrulama (işletme gerçekten var mı, yorumları ne diyor)
- **Başvuranın iletişim bilgisi** — telefon/e-posta; tereddütte aramak en hızlı doğrulamadır

## 3. Aksiyonlar

- **Onay** (tek dokunuş) — müşteri toptan fiyatları görmeye başlar; vade/limit **açılmaz** (o ayrı ve elle bir karardır, müşteri detayında)
- **Ret** (tek dokunuş) — hesap B2C olarak kalabilir; toptan fiyat açılmaz
- Mükerrer eşleşmede ilgili müşteri kaydına geçme (gerekirse birleştirme oradan)
- Google/Haritalar linkini açma; başvurana telefon/e-posta ile ulaşma

## 4. Durumlar ve varyasyonlar

- **FR başvurusu** — bilgiler resmî kayıttan otomatik; sinyaller tam
- **DE başvurusu** — bilgiler elle girilmiş, resmî kayıt sinyalleri yok; VIES sonucu ana doğrulamadır — sinyal eksikliği kartta belli olmalı, admin daha dikkatli bakacağını bilmeli
- **Temiz başvuru / risk işaretli başvuru** — hangi sinyalin sorunlu olduğu tek bakışta ayrışmalı
- **Mükerrer eşleşmeli başvuru** — onay yerine önce mevcut kayıtla ilişkiyi çözmek gerekebilir
- **Boş kuyruk** — bekleyen yoksa temiz hali
- Resmî kayıt API'sine o an ulaşılamamışsa sinyaller eksik kalır; kart "doğrulanamadı" halini taşıyabilmeli (yanıltıcı "temiz" görünmemeli)

## 5. Akış bağlantıları

Gelinen: dashboard (bekleyen başvuru sayısı), müşteriler (onay durumu üzerinden).
Gidilen: müşteri detay (onay sonrası — vade/limit kararı orada; mükerrer eşleşme incelemesi), müşteri birleştirme.

## 6. Yapmaması gerekenler

- Bu ekran **yalnız admin rolüne** açılır
- **Otomatik onay yoktur** — sinyaller ne kadar temiz olursa olsun kararı sistem vermez; ekran "sistem onayladı" izlenimi yaratmaz. AI özeti de karar değil okuma yardımıdır
- Onay, vade/limit açmaz — iki kararın ayrılığı ekranda karışmamalı ("onayladım, artık veresiye alabilir" yanılgısı doğmamalı)
- Başvurana sinyallerin içeriği (risk değerlendirmesi, AI özeti, mükerrer bulgusu) hiçbir kanaldan yansıtılmaz — iç değerlendirmedir; müşteri yalnız sonucu öğrenir
- SIRET girmiş olmak kimlik kanıtı değildir — kart bu şüpheyle kurulur; "resmî kayıtta var" tek başına yeşil ışık gibi sunulmaz

## 7. Web / mobil notları (yalnız işlevsel)

- Telefon önceliklidir: başvurular gün içinde tek tek düşer, karar çoğu zaman telefonda anında verilir — kart tek ekranda okunmalı, onay/ret tek dokunuşla ama yanlışlıkla tetiklenmeden verilebilmeli
- Google/Haritalar dış doğrulaması telefonda uygulama/harita geçişiyle kesintisiz olmalı
