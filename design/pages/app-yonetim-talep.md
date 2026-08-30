# App — Yönetim · Talep bölümü (kuyruk + talep ekranı)

> Zemin: `app-operasyon-zemin.md` · bölüm brief'i: `app-yonetim.md` (Y1). Bu dosya **Operasyon
> Mobil v3'te OLMAYAN bir bölümün** brief'idir: v3 yönetime tek bir "Şikâyet" ekranı çizdi
> (`sikayet`, 26) ve o ekran **karar kutusundan gelen TEK talebi** gösteriyor. Kuyruğun kendisi —
> yani taleplerin listesi — tasarımda hiç yok.
>
> **Kullanıcının isteği (30.08):** *"Sosyal gelen kutusu gibi bizim mesajları görebildiğimiz bir
> talep bölümümüz olması gerekiyor. Ve o talep bölümünde hem işlemler yapabildiğimiz gibi hem de
> yazışabilmemiz gerekiyor."*
>
> Aynı kullanıcı, aynı gün, mesajlaşmanın biçimi için de karar verdi: *"mesajlaşma bölümünde bir
> mesaj balonunun görünmesi mantıklı… orası hem yazıştığımız hem karar verdiğimiz bir bölüm."*

## 1. Amaç ve kullanıcı

Müşteri taleplerinin (bozuk · eksik · soru · diğer) **telefondan** izlendiği, cevaplandığı ve
karara bağlandığı bölüm. Kullanıcı: yönetim yetkisi olan personel (mobilde tek rol).

**Bugün neden yetmiyor:** mobilde talebe girmenin tek yolu karar kutusundaki koyu kart ve o kart
**cevap bekleyen EN TAZE** talebi açıyor. Yani ikinci talep, dünkü talep, "AI'ın yürüttüğü" talep
ve kapanmış talep telefonda **görünmüyor**. Kuyruk webde var; telefonda yok.

**Masaüstünün yerine geçmez** (bölüm kuralı): kurulum ve derin inceleme webde kalır. Mobildeki iş
şu üçlüdür — **tara → oku → kısa karar/cevap**; uzun kuyruk masaya kalır ("Masada devam et" her
ekranda durur).

## 2. Bölümün iki ekranı

### A. Talep kuyruğu (yeni ekran)

Sosyal gelen kutusunun (v3:27) kardeşi ama **aynısı değil** — farkları §6'da.

- **Satır** — kim (müşteri adı) · **tür** (Bozuk · Eksik · Soru · Diğer) · **son mesajın
  önizlemesi** (ilk satır, operatörün dilinde) · ne zaman (göreli: "40 dk önce").
- **Satırın taşıdığı işaretler** (hepsi modelde ölçülü, uydurma yok):
  - **"top bizde"** — son sözü müşteri söyledi, cevap bekliyor. Kuyruğun tek amacı budur.
  - **durum** — Açık · İşlemde · Çözüldü.
  - **yürütücü** — İnsan · Hibrit · AI. "AI yürütüyor" bir rozettir.
  - **"AI yanıtladı"** — devralınmış talepte yürütücü İNSANDIR ama AI o talepte konuşmuştur; kalite
    denetimi tam o kümeye bakar. İki işaret ayrı durur, birleştirilmez.
  - **ek dosya var** — bozuk ürün fotoğrafı; karar çoğu kez fotoğraftan verilir.
  - **bağlı sipariş** referansı (varsa) — siparişsiz talep geçerlidir.
  - **iade tetiklenmiş** — bu talepten bir iade akışı başlatıldı.
- **Süzgeçler** (motorun desteklediği eksenler): cevap bekleyenler · tür · durum ·
  siparişli/siparişsiz · yürütücü. **Hepsi aynı anda çizilmez** — telefonda iki satır çip zaten
  ekranın altıda birini yiyor; tasarım hangi ikisinin görünür, hangilerinin bir çekmecede
  toplanacağını söylesin.
- **Sıra:** son mesaja göre, en taze üstte. Kuyruk uzun olabilir → **sonsuz kaydırma** (imleçli).
- **Boş hâl** iki ayrı cümle ister: *süzgeçten dolayı boş* ≠ *kuyruk gerçekten boş*.

### B. Talep ekranı (26'nın yerine geçer, onu kapsar)

**Hem yazışma hem karar yeri.** İki yarısı var ve ikisi de aynı ekranda yaşamalı:

**Yazışma yarısı** — sosyal sohbetin (v3:28) anatomisiyle AYNI olmalı (kullanıcı kararı):
- baloncuk dizisi; **künye baloncuğun dışında** (kim · ne zaman), bizim sözümüz koyu, müşterininki
  açık;
- **üç gönderen ayırt edilir:** müşteri · operatör (adıyla) · yapay zekâ. YZ'nin gönderdiği mesaj
  operatörünkü gibi gösterilmez;
- **çeviri:** müşteri kendi dilinde yazar, operatör Türkçe okur; **"orijinali gör"** aslını açar.
  Yalnız gerçekten çevrilmiş mesajda görünür;
- **ekler** (fotoğraf) baloncukta açılabilir olmalı — telefonda büyütülüp bakılacak;
- **bekleyen YZ taslağı** bir mesaj DEĞİLDİR: yazışmanın içinde değil, **cevap kutusunun üstünde**
  bir yuvada durur (bu karar 30.08'de uygulandı). İki çıkışı var: *cevaba çevir* · *düzenleyerek
  gönder*.

**Karar yarısı** — talebin bir DURUM MAKİNESİ olması sohbetten en büyük farkıdır:
- **durum geçişi** (Açık → İşlemde → Çözüldü; çözülen yeniden açılabilir). Ekran **yalnız o an
  geçerli geçişleri** sunar — hangi geçişin açık olduğunu motor söyler, ekran hesaplamaz;
- **üstlenme** — AI/hibrit yürüyen talebi insan devralır; devralınca AI o talepte susar;
- **yürütücü modu** — İnsan · Hibrit · AI (sohbetteki üçlünün aynısı);
- **iade tetikleme** — talep haklıysa siparişin iade akışı buradan başlatılır. Karar burada verilir
  ama **iade burada sonuçlanmaz**: tutar ve stok siparişin işidir, talep tetikler ve sonucu
  ("↩ 5,90 € iade edildi") izler. Bağlı sipariş yoksa ya da iade zaten tetiklenmişse düğme
  **sebebiyle** kapalıdır;
- **bağlı kayıtlar** — sipariş referansı ve müşterinin işaretlediği kalemler (hangi ürün, kaç
  adet): şikâyetin somut zemini budur;
- **müşteri bağlamı** — bu müşterinin toplam talep sayısı ("ilk kez mi, sürekli mi"): iade
  kararının girdisidir.

## 3. Ekranın söylemesi gereken üç şey (öncelik sırası)

Tasarımın çözmesi gereken asıl mesele, bu üçünün tek ekranda çatışmaması:

1. **"Cevap bekliyor mu?"** — kuyruğun ve ekranın ilk sorusu.
2. **"Bu kimin elinde?"** — insan mı, AI mı, devralınmış mı.
3. **"Ne yapabilirim?"** — cevapla · üstlen · durumu değiştir · iadeyi başlat.

Bugün mobilde üçü de var ama **karar kapıları girdi alanının kuyruğu gibi** duruyor. v3'ün 26'sı bu
yüzden bir "KARAR" başlığı çiziyordu — o fikir doğru, ama tasarım karar listesini talebin gerçek
kapılarıyla (durum · üstlenme · iade) değil, olmayan seçeneklerle doldurmuştu (§7).

## 4. Durumlar ve varyasyonlar (hepsi çizilmeli)

- **Yükleniyor** — iskelet (halka değil): gelecek satırların ölçüsü tutulur.
- **Boş** — süzgeçli / süzgeçsiz iki ayrı cümle.
- **Okunamadı** — hata bloğu + "tekrar dene".
- **Siparişli / siparişsiz** talep — siparişsizde kalem ve iade bağlamı YOKTUR; ekran bunu söyler,
  boş bir blok bırakmaz.
- **Yeniden açılmış** talep — geçmiş yazışma kaybolmaz.
- **AI yürütüyor** · **devralınmış (AI yanıtladı)** · **insan** — üçü de kuyrukta ve ekranda ayırt
  edilir.
- **Ek dosyalı / dosyasız.**
- **İade tetiklenmiş** — düğme kapalı, yerinde sonucu duruyor.
- **Kapalı cevap penceresi yok** (bu sohbetin sorunu; talepte pencere kuralı yoktur — kanal e-posta
  ve iç defter).

## 5. Aksiyonların bugünkü karşılığı (tasarım ölü düğme çizmesin)

**Motor tarafında HAZIR** (webde çalışıyor, mobile taşınması bir sözleşme işi):
cevap yazma · durum değiştirme · üstlenme · yürütücü modu · taslak isteme · taslak tüketme ·
**iade tetikleme** · elle talep açma · kuyruk süzgeçleri ve sayfalama.

**Mobil uçta BUGÜN olan:** talebi okuma (tek talep) · cevap · üstlenme · taslak tüketme.
**Mobil uçta olmayan:** kuyruk listesi · süzgeçler · durum değiştirme · mod seçme · taslak isteme ·
iade tetikleme.

Yani tasarım bu bölümü **tam** çizebilir; eksik olan ekran değil, mobil sözleşmedir ve o kapatılır.
Bilerek dışarıda bıraktığımız tek şey **elle talep açma**: telefonda müşteri+sipariş arayıp kayıt
kurmak masa işidir.

## 6. Sosyal gelen kutusundan farkları (aynı dil, ayrı iş)

| | Sosyal sohbet | Talep |
| --- | --- | --- |
| Nesne | akan bir konuşma | **kayıt** — durumu, tipi, geçmişi var |
| Kapanış | kapanmaz, susar | **çözülür** (ve yeniden açılabilir) |
| Kanal | WhatsApp · Messenger · Instagram (kanal rengi taşır) | sipariş · form · WhatsApp · içeriden — **kanal değil KAYNAK** |
| Zaman baskısı | 24 saatlik ücret penceresi | penceresi yok |
| Karar | mod seçimi | mod + **durum** + **iade** |
| Ek | medya mesajı | **kanıt fotoğrafı** (karar buna bakar) |

**Ortak olması gereken:** baloncuk anatomisi, taslak yuvası, süzgeç çipi dili, satır kartı ritmi,
boş/yükleniyor hâlleri. İki bölüm birbirinin kardeşi gibi durmalı — ama talep satırı bir sohbet
satırından **daha çok şey söylemek zorunda** (tür + durum + yürütücü + ek + sipariş), ve tasarımın
asıl işi bu kalabalığı satırı boğmadan yerleştirmek.

## 7. Yapmaması gerekenler

- **Karmaşık ticket mekaniği kurulmaz** — atama, öncelik matrisi, SLA sayacı YOK. Model üç durumlu
  ve sade; ekran fazlasını icat etmez.
- **Olmayan karar seçenekleri çizilmez.** v3'ün 26'sı dört karar çipi ("jest · iade · yeniden
  gönderim" gibi) çiziyor; bunların arkasında **tek bir yazma kapısı yok** ve hiçbiri modelde
  tanımlı değil. Karar demek: durum · üstlenme · mod · iade tetikleme. Yeni bir karar türü
  isteniyorsa önce modelde tanımlanır.
- **İade burada sonuçlandırılmaz** (tutar/stok siparişin işi) — mükerrer bir iade arayüzü kurulmaz.
- **YZ cevabı insan cevabı gibi gösterilmez**; onaylanmamış taslak yazışmanın içine karışmaz.
- **İç bilgi müşteriye giden metne karışmaz** — ekran "iç not" ile "müşteri mesajı"nı
  karıştırtmamalı (bugün iç not YOK; varmış gibi bir alan da çizilmez).
- Talebe **insan okunur bir referans numarası uydurulmaz**: modelde talebin numarası yoktur
  (kimliği bir UUID'dir). v3'ün "SK-26-8H2P" künyesi bu yüzden yazılamadı — künyede SİPARİŞ
  referansı durur, o gerçek.
- Kuyrukta **sayfalama** görsel olarak vaat edilip beslenmezse liste kuyruğunu sessizce yutar.

## 8. Akış bağlantıları

**Gelinen:** karar kutusunun koyu kartı (cevap bekleyen talep) · bildirimler · bölüm sekmesi.
**Gidilen:** sipariş (iade tetikleme) · bağlı WhatsApp konuşması (talep oradan doğduysa) · masaüstü
("masada devam et").

## 9. Tasarımdan beklenen çıktı

1. **Talep kuyruğu** — dolu · boş (iki cümle) · yükleniyor · hata; süzgeç şeridinin telefonda
   çalışan hâli.
2. **Talep ekranı** — yazışma + karar yarısı; şu hâller: cevap bekleyen · AI yürütüyor · bekleyen
   taslak var · siparişsiz · iade tetiklenmiş · çözülmüş.
3. Satırın ve ekranın **işaret dili**: dört tür, üç durum, üç yürütücü, "top bizde", ek, iade —
   hangisi rozet, hangisi renk, hangisi metin. Bugün mobilde bu işaretlerin bir kısmı üç ayrı
   biçimde çiziliyor; tek bir sözlük gerekiyor.
