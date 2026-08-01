# Admin — Stok

> **Yeniden kurgulandı (01.08).** Bu sayfa artık yalnız "ne var"ı değil **"ne girdi, ne çıktı"yı**
> da taşıyor: depolar arası transfer ayrı bir sayfa olmaktan çıkıp bir GİRİŞ/ÇIKIŞ türü oldu.
> Gerekçe §1'de.

## 1. Amaç ve kullanıcı

Stokun parti gözüyle izlendiği, tarihe bağlı kararların (near-expiry teklif, imha, geri çağırma) verildiği ve **malın depoya girip çıkışının okunduğu** ekran. Kullanıcı: yalnız admin rolü. Girişlerin kendisi (mal kabul, hazırlık, imha formu) depo ekranlarında yapılır; burası admin'in görünüm ve karar yeridir.

**Neden giriş/çıkış da burada — para modülünün emsali.** `DOMAIN §7`: *"Tüm finans tek mantıkla: para bir hesapta durur, hareketlerle girer/çıkar… Kasa hareketi ile banka hareketi aynı şeydir, yalnız hesabı farklı."* Stokta bunun karşılığı yazılmamıştı ve sonuç dağınıklıktı: "bu depoya ne girdi" sorusunun cevabı dört ekrana bölünmüştü (imha geçmişi burada, mal kabul satın almada, transfer ayrı sayfada, hazırlık siparişlerde). Depolar arası transfer, stok tarafının **hesaplar arası transferi**dir — parada o kendi sayfası değil bir hareket tipidir; burada da öyle: kaynakta bir çıkış, hedefte bir giriş.

## 2. İçerik envanteri — ne var, neden

Sayfa dört sekmedir: **Seviyeler · Yaklaşan tarihli · Mal kabul · Çıkışlar.**

> **Neden "Hareket" değil (kullanıcı itirazı, 01.08).** İlk kurguda tek bir "Hareketler" sekmesi
> vardı. "Hareket" doğru ama SOYUT bir kelime — depoda kimse "hareket yaptım" demez, "mal kabul
> ettim" ya da "sevk ettim" der. Tek somut isim de yetmiyordu: "Mal kabul" içeriğin yalnız yarısını
> adlandırır, çıkışlar isimsiz kalırdı. Çözüm soyut kelimeyi kaldırıp **yönü sekmeye çıkarmak**:
> giren mal bir sekme, çıkan mal bir sekme. Depodaki iş de zaten böyle bölünür.
>
> **Yoldakiler ayrı sekme DEĞİL, Mal kabul'ün "bekleyenler" kısmı.** Yoldaki transfer, hedef depo
> için "gelecek mal"dır — kabul edilmeyi bekler. Kaynak depo içinse çoktan yapılmış bir çıkıştır.
> Aynı kayıt, bakan tarafa göre iki sekmede: depo bağlamı bunu kendiliğinden çözer.

### Seviyeler — "ne var"

- **Stok seviyeleri (varyant bazında)** — fiili, ayrılmış ve kullanılabilir miktar; "satabileceğim ne kadar" sorusunun cevabı kullanılabilirdir, üç seviyenin ayrımı admin'e açıktır (müşteriye değil)
- **Depo kırılımı** — çok depolu bakışta satır varyant başına TEK kalır ("N depoda" ipucu), açılınca depo dağılımı görünür. Birleştirilmiş stok kimsenin stoğu değildir: *3 STR'de + 2 KEHL'de duran maldan 5 kişilik sipariş çıkmaz* (`DOMAIN §17`)
- **Parti listesi (varyant altında)** — her parti: miktar, son tarih ve tipi (DLC — geçince satılamaz / DDM — geçince satılabilir, kalite düşer), **kalan raf ömrü %** (kararlar mutlak günle değil bu yüzdeyle verilir), tedarikçi lot numarası, depo ve depo içi konum, alış fiyatı, bağlı stok girişi/tedarikçi. Parti her zaman TEK depodadır ve deposunu söyler
- **Eşik altı işareti** — asgari stok eşiğinin altına inmiş varyant. Eşik **depo bazlıdır**; karar kuyruğu olarak Satın Alma'nın "sipariş zamanı" listesinde yaşar, burada bir tarama işaretidir

### Yaklaşan tarihli — karar kuyruğu

- **Uyarılan partiler** — kalan % eşiğin (varsayılan %25, parametrik) altına inenler; her biri teklif açma kararı bekler. DDM'i geçmiş ama satılabilir partiler de bu havuzda; **DLC'si geçmiş parti satılamaz** — yalnız imha yolu görünür
- **Her parti deposunu TAM ADIYLA söyler** — bu bir karar kuyruğudur, tarama listesi değil: "SKT'ye 3 gün kaldı, %30 aç" kararı hangi şehirdeki mala verildiğini bilmeden alınamaz
- **Near-expiry teklif önerisi** — sistemin önerdiği indirimli fiyat (varsayılan %30, parametrik) + partinin kalan miktarı + maliyeti; **öneri sistemden, fiyat ve karar admin'den**. Teklif açıkken: teklifin partiye bağlı olduğu, tavanın partinin kalanı olduğu ve parti tükenince teklifin kendiliğinden kalktığı anlaşılmalı
- **MLOR bağlamı** — girişte MLOR eşiğinin (varsayılan kalan %75) altında kabul edilmiş partiler işaretli; "bu parti zaten kısa ömürlü" bilgisi karara bağlam verir
- **Kuyruk sayfalanmaz** — bir partiyi kaçırmak imha edilecek malı satmaktır

### Mal kabul — depoya giren

İki bölüm: **bekleyenler** (henüz gelmemiş / kabul edilmemiş) ve **kabul edilenler** (geçmiş girişler). Kabul FORMU buradan açılır — depocunun kendi giriş ekranı ayrıdır ve telefonda yaşar; burası yöneticinin gördüğü yüzdür.

**Bekleyenler — "ne gelecek"**

- **Açık tedarik siparişleri** — sipariş edilmiş, henüz gelmemiş kalemler; hangi depoya bekleniyor. Tek satın alma birden çok depoya **parçalı** gelebilir, ilerleme kalem bazında "sipariş edilen ↔ gelen" olarak okunur
- **Yoldaki transferler** — sevk edilmiş ama kabul edilmemiş sevkiyatlar: belge no, kaynak → hedef, sevk tarihi ve sevk eden, kalem/adet, **yolda geçen süre**. Bu listenin TAM olması zorunludur: yoldaki mal hiçbir deponun stoğunda değildir, listeden düşen bir sevkiyat iki depoda da görünmeyen mal demektir. Küme zamanla büyümez, her kabul birini düşürür; **boş olması sağlıklı hâldir**
- **Uzun süredir bekleyen** — ulaşım süresini aşmış sevkiyat ya da gelmeyen tedarik: kaybolmuş veya unutulmuş mal
- **Sanal "transit depo" YOKTUR** — ekran üçüncü bir envanter icat etmez; "yolda ne var" sorusunun kaynağı sevkiyat kaydının kendisidir

**Kabul edilenler — "ne geldi"**

- **Tedarikten kabul** — parti, adet, son tarih, lot, tedarikçi, bağlı tedarik siparişi. Eksik/fazla gelen kalem **fark olarak işaretlenir ve kalıcıdır**; fark bir hata değildir, kabul yine tamamlanır
- **Transferden kabul** — hedefte tarih/lot kopyalanmış YENİ parti doğar; parti kimliği korunur, başka partiyle birleşmez (geri çağırma izi ve gerçek maliyet transferden etkilenmez)
- **İade restoku** — müşteriden geri dönüp satılabilir stoğa giren mal
- **Sayım fazlası** — sayımda beklenenden çok çıkan
- **"Hiç girmedim" ile "sıfır geldi" ayrı şeylerdir** — ilki eksik bir kayıt, ikincisi bir beyandır ("kutu geldi, içi boştu")

### Çıkışlar — depodan çıkan

- **Hazırlık** — siparişe çıkan mal; hangi siparişe gittiği satırdan okunur
- **Transfer sevk** — başka depoya giden; kaynakta düşer, hedefte kabulle doğar. Sevk FORMU buradan açılır
- **İmha / fire** — **bugünkü "İmha geçmişi" sekmesi burada erir**, ayrı sekmesi kalmaz: imha bir çıkış türüdür, hak ettiğinden fazla yer tutuyordu
- **Sayım eksiği** — sayımda beklenenden az çıkan
- **Kapı satışı** — tezgâhtan doğrudan satılan

**Her iki sekmede ortak**

- Satır: tarih, depo, ürün/boy, parti, adet, tür, belge no, varsa kim yaptı
- **Dönem toplamı ve tür dağılımı** — seçili dönemde ne girdi, ne çıktı, hangi türden. Sayfalı listeden türetilemez: "bu çeyrek ne kadar çöpe gitti" sorusu ilk 30 satırla yanıtlanmaz
- **Belge numarası** — imha `IMH-STR-26-0012`, transfer `TRF-STR-26-0007`; depo koduyla ayrışır çünkü kâğıt klasör o depoda durur
- ⚠ **Karışık belge** — tek bir sayım tutanağında hem fazla hem eksik satır olabilir; o belge iki sekmede de görünür ve ekran bunu bir tekrar gibi değil, belgenin iki yüzü olarak anlatmalıdır

## 3. Aksiyonlar

Kararlar liste üstünde açılan formlarda verilir (bu ekranın mevcut deseni: teklif diyaloğu, lot sorgusu).

- **Near-expiry teklifi açma/güncelleme/kapatma** — önerilen fiyatı kabul ederek veya değiştirerek
- **Sevk oluşturma** — hedef depo + varyant/miktar → sistem FEFO **önerir** (kaynak, çalışılan depodur; ayrıca sorulmaz). Öneri **kullanılabilir** üzerinden yapılır: müşteriye söz verilmiş mal başka şehre gidemez. Hedefe ulaşım süresi kadar ömrü kalmayan parti önerilmez ama **seçilebilir** — uyarı, engel değil. Öneri isteneni karşılayamıyorsa sebep iki ayrı hâldir ve aynı cümleyle anlatılamaz: *o kadar kullanılabilir mal yok* (gönderilemez) ile *kalanların hepsi yolda bozulacak* (gönderilebilir, ama bilerek)
- **Sevkiyatı kabul etme** — her satır için gelen adet. **"Hiç girmedim" ile "sıfır geldi" ayrı şeylerdir**: ilki eksik bir kayıt, ikincisi bir beyandır ("kutu geldi, içi boştu"). Fark kalıcı olarak kayıtta durur
- **Sevk kaydını geri alma** — yalnız **mal hiç çıkmamışken**; mal çıkıp geri döndüyse bu **ters yönde yeni bir transferdir** (mal fiilen iki kez yol gitti, tek kayda indirmek soğuk zincir geçmişini siler). Eylemin adı ne yaptığını söylemeli; "iptal" ikisini de karşılar gibi durup hiçbirini karşılamaz
- **DLC'si geçmiş parti için imha başlatma** (kayıt depo akışıyla düşer)
- **Lot / geri çağırma sorgusu** — lot numarasıyla "bu parti kimlere gitti": partiden çıkan siparişler ve müşteriler. Tedarikçi geri çağırmasında dakikalar içinde cevap verebilmek içindir; bir adım geriye (hangi tedarikçi, hangi giriş) de izlenir
- Süzme: ürün/kategori araması, depo, hareket türü, dönem
- Parti detayından bağlı stok girişine/tedarikçiye/siparişe geçiş

## 4. Durumlar ve varyasyonlar

- **Sağlıklı / uyarılı stok** — eşik altına inmiş parti yoksa temiz hâl; varsa uyarılar öne çıkar
- **DLC'li / DDM'li parti** — tarih geçince yol ayrımı tamamen farklıdır (imha / indirimli satış); karıştırılamaz olmalı
- **Teklif açık parti** — normal partiden ayırt edilir; kalan miktar eridikçe tükenme yakınlığı görünür
- **Aynı varyantta çok parti / çok depo** — farklı tarihli partiler yan yana; hazırlıkta FEFO'nun uygulandığı bilinir, admin sıralamayı elle yönetmez
- **Stokta olmayan varyant** — sıfır kullanılabilir; aday ürünler burada hiç görünmez
- **Ayrılmış > 0, fiili yerinde** — teslimata çıkmış ama teslim edilmemiş mal; "duruyor" sanılmamalı
- **Yolda hiçbir şey yok** — normal ve iyi hâl, bir eksiklik gibi gösterilmez
- **Uzun süredir yolda** — ulaşım süresini aşmış sevkiyat: kaybolmuş ya da kabul edilmeyi unutmuş mal; iki depoda da satılamaz durumda bekliyor
- **Tam / kısmi / sıfır kabul** — üç ayrı sonuç; kısmi ve sıfırda fark kalıcı kayıttır
- **Tek depolu kurulum** — depo kırılımı, depo süzgeci ve "bekleyen transfer" bölümü görünmez (transfer edilecek yer yok); Mal kabul yalnız tedarikten geleni gösterir. Ekran bugünkü hâlinden farksızdır; eksen ikinci depoyla belirir

## 5. Akış bağlantıları

Gelinen: dashboard (yaklaşan tarihli uyarısı), **Depolar** (karnedeki sayıdan — bağlam o depoya alınmış hâlde), fiyatlar (teklif kararı aynı yere çıkar), ürünler (bu ürünün stoğu).
Gidilen: sipariş detay (lot sorgusundan ve hazırlık hareketinden), müşteri detay, satın alma (parti kaynağı; eşik altı → tedarik siparişi), fiyatlar, Depolar (tesis künyesi).

## 6. Yapmaması gerekenler

- Bu ekran **yalnız admin rolüne** açılır; depo kendi ekranlarında stok girer ve hazırlar ama **alış fiyatı/maliyet/teklif fiyatı görmez** — teklif kararı bu yüzden admin işidir
- **Mal kabul, imha ve hazırlık FORMLARI burada değildir** — burası onların kaydını gösterir. Formlar depo yüzeyindedir (telefon önceliklidir, rampada doldurulur); sevk/kabul formu istisnadır çünkü transfer kararı admin'indir
- **Transfer kaydı düzeltilmez, silinmez** — olay kaydıdır; yanlış sevkin çözümü ters yönde yeni bir transferdir. Kayıt silmek geçmişi yalanlar
- Rezervasyon satırları tek tek gösterilmez — "ayrılmış toplam" yeter; TTL/cron mekaniği karar için gerekmedikçe dökülmez
- Teklif açma otomatikleştirilmez — sistem işaretler ve önerir, fiyatı ve kararı admin verir
- **FEFO zorlanmaz** — sistem sıralar ve uyarır, kilitlemez
- Müşteri-yüzü dil ile iç dil ayrımı: parti, lot, DLC/DDM, kalan % burada serbesttir ama müşteriye giden hiçbir metin bu terimleri taşımaz
- Kullanılabilir/ayrılmış gibi türetilmiş sayılar elle düzeltilmez — düzeltmenin yolu sayım/imha kaydıdır
- **Tesis künyesi burada düzenlenmez** — depo kodu, adresi, bölgeleri Depolar sayfasının nesnesidir

## 7. Web / mobil notları (yalnız işlevsel)

- Telefon önceliklidir: yaklaşan tarihliye bakıp teklif açmak günlük, telefonda biten bir iştir; depoda raf karşısında parti/lot bakmak da telefonla olur
- **Geri çağırma sorgusu acil durumda telefondan çalıştırılabilmeli** — lot numarası girip müşteri listesine ulaşmak dakikalar içinde olmalı
- **Sevkiyat kabulü sayarak yapılan bir iştir** ve rampada, ayakta yapılır: satır satır adet girme akışı, sayılan koliyle ekrandaki satırı karıştırmayacak kadar net olmalı — hata en çok burada olur ve fark kalıcı kayda geçer
- Mal kabul'ün bekleyenler bölümüne gün içinde kısa bakışlarla birden çok kez bakılır: "bugün ne bekliyorum" bir bakışta okunmalı
- Çok kalemli sevkiyatın hazırlanması masaüstünde de yapılır (yönetici karar verirken); iki biçimde de aynı akış yürümeli
