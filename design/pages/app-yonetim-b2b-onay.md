# App — Yönetim · B2B Başvuru Onayı

> Zemin: `app-operasyon-zemin.md` · bölüm brief'i: `app-yonetim.md` · masaüstü karşılığı:
> `admin-b2b-onay.md`. Bu dosya **Operasyon Mobil v3'te OLMAYAN bir ekranın** brief'idir: v3
> yönetime B2B için hiçbir şey çizmedi.
>
> **Kullanıcı kararı (07.09):** bildirim telefona düşüyor ama açılmıyor; *"A seçeneğini
> istiyorum"* — yani ekran yazılacak, karar telefondan da verilebilecek. Üç yol tartışıldı
> (ekranı yaz · yalnız okuma · kararı masaüstüne bırak) ve kullanıcı ekranı seçti.

## 1. Amaç ve kullanıcı

Bir müşteri "kurumsal hesap istiyorum" diye başvurduğunda, o hesabın **toptan fiyatlara erişip
erişmeyeceğine** karar verilen ekran. Kullanıcı: yönetim yetkisi olan personel (mobilde tek rol).

**Bugün neden yetmiyor:** başvuru bildirimi (`b2b_application_received`) mobil yönetim listesine
düşüyor ama **dokunulamıyor** — hedefi olmayan bildirimler için ayrılmış bir bekleme tablosunda
duruyor. Operatör başvurunun geldiğini görüyor, ne olduğunu göremiyor.

**Masaüstünün yerine geçmez** (bölüm kuralı). Masaüstünde bu karar müşteri panelinden açılan bir
**diyalog** — çünkü orada bir kullanıcı kararı var (30.07): *"onay, profesyonel müşterinin bir
hâlidir, ayrı bir varlık değil."* Mobilde müşteri paneli YOK ve giriş kapısı bildirimdir, o yüzden
burada ayrı bir ekran doğuyor. **Bilinçli sapma:** ekran ayrı ama VARLIK ayrı değil — başlık
müşterinin adıdır, "başvuru #12" değil.

## 2. İçerik envanteri — ne var, neden

Sistem başvuruyu hazır sinyallerle sunuyor; operatör sinyalleri okuyup kararı veriyor. Masaüstü
kartıyla **aynı kaynaktan** besleniyor (`readB2bCheck`) — iki yüzey aynı başvuru için farklı bir
şey söylerse operatör hangisine inanacağını bilemez.

### Künye (her zaman görünür)
- **Müşterinin adı** ve **resmî künye adı** — ikisi farklı olabilir (ticari ad ≠ unvan).
- **SIRET** ve **ülke** — FR başvurusunda resmî kayıttan otomatik dolmuş, DE'de elle girilmiş.
- **Telefon** ve **tek satırlık adres** (haritada açılabilir). Adres yoksa satır çizilmez.
- **Hâl rozeti** — dört hâl: *Başvuru yok · Bekliyor · Onaylı · Reddedildi*. Metinleri masaüstünden
  BİREBİR alınır, uydurulmaz.

### Karar bayrağı (tek cümle, en üstte)
Motorun genel yargısı — "sinyaller temiz" / "dikkat" gibi tek bir işaret ve tonu. Operatörün
listeden geçerken okuduğu ilk şey bu olmalı.

### Sinyaller (kararın gövdesi)
Her biri **etiket + değer + ton** taşıyan satırlar: resmî kayıtta görünüyor mu, faaliyet kodu ne,
kuruluş yılı, KDV numarası doğrulandı mı. Ton üç kademe (iyi · nötr · dikkat) ve **renk tek başına
anlam taşımaz** — etiket zaten cümlesini söyler.

### Mükerrer adaylar
"Bu telefon/ad başka bir kayıtta da var" satırları. Sayısı sıfırsa bölüm hiç çizilmez — boş bir
"mükerrer yok" başlığı, olmayan bir soruyu sordurur.

### Yapay zekâ özeti (isteğe bağlı, sonradan)
Kısa bir cümle: sinyalleri okumuş hâli. **Kartın kendisi çizildikten SONRA** isteniyor ve
üretilemezse ekran dürüst kalıyor ("sinyalleri aşağıdan okuyun") — özet bir kolaylık, kararın
dayanağı değil.

## 2b. LİSTE — bölümün asıl girişi (kullanıcı kararı 07.09, ikinci tur)

İlk turda bu bölüm YOKTU çünkü brief *"giriş kapısı bildirimdir, tek başvuru açılır"* diyordu.
Kullanıcı ölçtü ve değiştirdi: **liste asıl giriş.** Gerekçesi somut — bildirim tek başvuruyu açar,
ama operatör telefonu eline aldığında ikinci başvuru da bekliyor olabilir ve bugünkü çizimde onu
hiç göremez.

### Açılış kuralı — sayı ekranı seçer

- **Tek bekleyen başvuru varsa liste ATLANIR**, doğrudan o başvurunun ekranı açılır. Tek satırlık
  bir liste, operatöre bir dokunuş fazladan ödetip hiçbir şey söylemez.
- **Birden çok varsa liste açılır.** Başvuru seçilerek girilir.
- **Bildirimden gelinirse** o başvuru doğrudan açılır — sayı ne olursa olsun. Bildirim zaten
  hangisini kastettiğini söylüyor; araya liste koymak, operatörün bildiği şeyi ona sordurmaktır.
- Detaydan geri dönüş **listeye** döner (liste atlanmışsa yönetim bölümüne).

### Satırın künyesi

**ad · karar bayrağı · şehir · ne kadar önce geldi**

Başlıkta da masaüstünün cümlesi var: *"2 bekleyen başvuru · en eski 3 saat önce"*. İkinci yarısı
asıl bilgi — sıranın unutulmuş olup olmadığını söyleyen şey yaştır, sayı değil.

**BU DÖRTLÜ MASAÜSTÜNDEN "AYNEN ALINDI" DEĞİL — ölçüldü (07.09).** Masaüstü *tasarımında* kuyruk ve
bayrak var, ama masaüstü *kodunda* yok: `b2bPending` müşteri listesinin bir SÜZGECİ ve satır düz
profil satırı (`CustomerRow` — ad · telefon · e-posta · tip · ülke). Yani bayrak, şehir ve başvuru
yaşı **bugün hiçbir yüzeyde hesaplanmıyor**; ilk hesaplayan bu ekran olacak.

**Bayrağın satırda kalması KULLANICI KARARI (07.09), üç seçenek tartışıldı:**

- **Bayrak satırda, tam hesapla (SEÇİLDİ).** Sinyalin yedi girdisinden beşi profil satırında zaten
  geliyor (ek maliyet sıfır); rota kümesi ve adresler sayfa başına iki sorgu; gerçek N+1 yalnız
  **mükerrer sayısı** (`findDuplicateCandidates` satır başına bir `or` sorgusu, toplu hâle
  getirilemiyor). **Dış servis çağrısı YOK** — liste okumayı `refreshExternal:false` ile çağırıyor,
  yani SIRET/VIES'e hiç gidilmiyor. N sayfa boyuyla tavanlı, tablo boyuyla değil.
- **Bayraksız satır — ELENDİ.** Liste "kaç tane var"ı söyler, "önce hangisi"ni söylemez: operatör
  her satırı açıp kapatmak zorunda kalır ve bu kararın tipik süresiyle (~15 sn) aynı mertebede bir
  maliyettir — iş kabaca ikiye katlanır. Daha sinsi zararı sıralamadır: bayrak yoksa sıra yalnız
  YAŞA kalır, oysa temiz başvuru on saniyede kapanır, mükerrer olan masaya kalır. Bayrak, kuyruğu
  dizinden İŞ KUYRUĞUNA çeviren tek şeydir.
- **Ucuz bayrak (mükerrersiz) — ELENDİ, maliyetten değil ÜRETECEĞİ YANLIŞTAN.** Aynı telefonu
  taşıyan iki kayıtta ucuz bayrak "Temiz" yazar, operatör listeden açmadan onaylar, oysa detay
  "Mükerrer" diyecekti. Sonuç yalnız yanlış etiket değil: **ekran operatörü yanlış eyleme davet
  etmiş** olur. İki yüzeyin aynı soruya iki hesabı bir gün mutlaka ayrışır (CLAUDE §1).

### Süzgeç

Masaüstünde iki sekme var: **Bekliyor** ve **Karar verilmiş**. Mobilde de ikisi yeter; üçüncü bir
eksen (ülke, tutar) açılmaz — kuyruk doğal olarak kısa.

### Boş hâl

Bekleyen başvuru yoksa liste **hiç açılmaz** ve bölüme girilmez; kart yönetim ekranında görünmez.
"Bekleyen başvuru yok" diye bir ekran, olmayan bir işi varmış gibi gösterir.

## 3. İş akışı — üç adım

**Tara → oku → karar.**

- **Onayla** — tek dokunuş, sebep istemez. Sonucu: müşteri toptan fiyatları görmeye başlar.
- **Reddet** — **sebep ZORUNLU.** Ret silmez: kayıt B2C olarak yaşamaya devam eder ve aday
  künyesini düzeltip yeniden başvurabilir. Sebep, "bunu neden reddetmişiz" sorusunun altı ay sonraki
  cevabıdır.
- **Masada devam et** — her zaman görünür. Uzun inceleme (belge okuma, şirketle yazışma) masaya
  kalır.

## 4. Niyet — okumanın hangi sırayla olması gerektiği

Bu bölüm **stil vermez** (CLAUDE §3); yalnız bilginin işlevini söyler, biçimi Claude Design'ın işi.
Bir tur burada beş soru sorulmuştu ("kart mı liste mi", "rozet nerede") — yanlıştı, o kararlar
tasarımındır ve brief'in işi onları sormak değil dayanağını vermek.

- **Karar bayrağı operatörün İLK okuduğu şeydir.** Kuyrukta da kartta da: "bu başvuruya kaç saniye
  ayıracağım" sorusunun cevabı odur.
- **Onay ile ret eşit ağırlıkta DEĞİLDİR.** Onay tek dokunuşla biter; ret sebep isteyen ikinci bir
  adım açar. İkisi aynı ağırlıkta çizilirse ekran, olmayan bir simetri vaat eder.
- **Mükerrer bloğu bir SORU'dur, uyarı değil** — "aynı kişi olabilir mi". Cevabı çoğu zaman
  "yükselt, onaylama"dır; arıza tonuyla çizilirse operatör onu bir hata sanıp yanlış yere bakar.
- **Sinyaller okunmak için var, sayılmak için değil.** Dört-altı satır, her biri etiket+değer+ton;
  operatör hepsini okumadan da bayrağa bakıp karar verebilmeli.
- **Karar verilmiş başvuru da açılabilir** (bildirim eski olabilir) ve ekran bunu SÖYLEMELİDİR:
  eylem artık yoktur, kararın kendisi ve künyesi vardır.
- **Renk tek başına anlam taşımaz.** Üç tonun (temiz · dikkat · mükerrer) her biri okunabilir bir
  etiketle birlikte gelir.

## 5. Sınırlar (tasarım bunları VAR SAYMASIN)

- ~~**Başvuru KUYRUĞU bu ekranda yok.** Giriş kapısı bildirimdir; tek başvuru açılır.~~
  **BU SINIR KALKTI (kullanıcı kararı 07.09, tasarımın ilk turundan sonra):** *"öncelikle liste
  görünsün istiyorum ben. Eğer tek kayıt varsa o kaydı görebiliriz."* Liste artık bölümün ASIL
  girişi — §2b'ye bak. Sınırı ben çizmiştim ve ilk tur tasarım ona uydu; yanlış olan tasarım değil
  benim sınırımdı.
- **Vade/limit ayarı yok.** Onay yalnız toptan fiyat erişimini açar; ödeme koşulu başka bir iş.
- **Belge yükleme/okuma yok.** Mobil yüzey belge incelemesi için kurulmuyor.

## 6. Bağımlılık

Ekran, `readB2bCheck` okumasının paylaşılan pakete taşınmasını bekliyor (talep açıldı:
`docs/talep/operasyon-b2b-kontrol-karti-uygulama-paketine.md`). Tasarım o taşımayı beklemeden
çizilebilir — veri şekli yukarıda ve değişmiyor.

## 7. İlk tur tasarım — ne geldi, ne kaldı (07.09 · 13:00)

Mobil v3 tazelendi ve yönetime tek ekran girdi: `b2bOnay — "Kurumsal hesap başvurusu"`
(`design/derived/operasyon-mobil-v3/36-b2bOnay-yonetim-b2b-basvuru-onayi.html`).

**Brief'in beş kararından üçü karşılandı ve ikisi benim yazdığımdan iyi çıktı:**

- **Mükerrer bloğunun tonu.** Brief *"bu bir uyarı değil bir SORU"* diyordu; tasarım başlığı
  **"AYNI KİŞİ OLABİLİR Mİ?"** yapmış ve altına şunu koymuş: *"Bu bir soru, arıza değil — aynı
  işletmeyse eski kaydı yükseltmek onaydan iyidir."* Tonu ayarlamakla kalmamış, operatöre ne
  YAPACAĞINI da söylemiş.
- **İki eylemin asimetrisi.** *"Onayla — toptan fiyatı aç"* tam cümle; *"Reddet…"* üç noktayla,
  yani ikinci adım açacağını kendisi söylüyor.
- **Karar verilmiş başvurunun hâli.** *"Karar verildi; düğmeler kalktı. Değiştirmek masaüstünden."*
- Asistan özetinin başlığı da sınırını taşıyor: *"OKUMA YARDIMI, KARAR DEĞİL"*.

**AÇIK KALAN — dört hâlin yalnız biri çizilmiş.** Ekranda yalnız **Bekliyor** rozeti var; *Onaylı ·
Reddedildi · Başvuru yok* yok. Bu bir eksiklik, çünkü **bildirim eski olabilir**: operatör dünkü
bildirime bugün dokunduğunda karar çoktan verilmiş olabilir ve ekranın bunu rozetle söylemesi
gerekir. Metinler masaüstünden BİREBİR alınır (`B2B_STATUS_VIEW`), uydurulmaz:
*Başvuru yok · Bekliyor · Onaylı · Reddedildi*.

**LİSTE eksik değil, İSTENMEMİŞTİ** — §2b artık istiyor.
