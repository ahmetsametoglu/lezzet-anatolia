# Admin — Sistem (sağlık + hatalar)

> **Görsel kararı geldi (01.08):** `design/project/Operasyon - Sistem.dc.html` · komponentler
> **O20–O25** (`Komponent Envanteri - Operasyon.dc.html §6`). Diğer 38 sayfa tasarımdan doğdu, bu
> ihtiyaçtan doğdu (`build/18-operasyon-guvenlik.md` 18.5) — çizim sonradan geldi ve merkezinde
> §1'deki yükümlülük duruyor: **bu ekran alarmın yerini tutuyor.**
>
> **Ekran indi (01.08):** `/operations/system`. Tasarımın modelimizle çeliştiği dört yer bilinçli
> olarak KODUN lehine çözüldü ve 18.5'in durum notunda tek tek yazılı: saklama süresi (30 → **90
> gün**), bellek eşiği (sabit %85 → **mutlak 500 MB**'dan türetilen çizgi), yük çubuğu (5 dk → **1
> dk**, hükümle aynı sayı), hata sayacının rengi (>0 → **motorun eşiği**).

## 1. Amaç ve kullanıcı

Sistemin kendi durumunu bildirdiği tek ekran: sunucu ayakta ve rahat mı, son saatlerde ne bozuldu.
Kullanıcı: yalnız admin rolü — pratikte işletme sahibi ve geliştirici.

**Bu ekran bir alarmın yerini tutmak zorunda.** Karar verildi (`OBSERVABILITY §4.1`): kritik hatada
e-posta/itme bildirimi **gönderilmiyor**. Yani buraya bakılmazsa hiçbir yerden haber gelmiyor. Tasarımın
birinci işi bu yüzden estetik değil: **kötü durum, bakmayan gözü yakalayacak kadar yüksek sesle
görünmeli** — panelin girişinde, listenin içinde saklı değil.

Ekran **tek**, iki panel: sağlık ve hatalar. İkisi tek soruyu yanıtlıyor — *"her şey yolunda mı?"* İki
sayfaya bölmek, bakılması gereken yer sayısını ikiye çıkarır; bakılmayan ikinci ekran olmayan ekrandır.

## 2. İçerik envanteri — ne var, neden

### Tepe durumu

- **Tek kelimelik hüküm** — `iyi` / `uyarı` / `kritik`. Sayfaya giren ilk saniyede cevabı almalı;
  metrikleri okumak zorunda kalmamalı
- **Hükmün gerekçesi** — durum `iyi` değilse *hangi* koşulun tuttuğu yazılır ("disk %84", "backend
  süreci 3 kez yeniden başladı"). Renk tek başına bilgi değildir; sebebi görünmeyen bir uyarı,
  görmezden gelinen bir uyarıdır
- **Ölçüm zamanı** — "2 dk önce". Toplama iki dakikada bir koşuyor; bayat bir görüntüyü canlı sanmak,
  arızayı gecikmeli görmek olur. Toplama durursa bu alan kendiliğinden söyler

### Sunucu paneli

- **Disk** — kullanılan / toplam ve yüzde. Bu ölçekte sistemi durduran en olası tek şey diskin dolması
- **Bellek** — kullanılan / toplam, ayrıca **kullanılabilir**; swap kullanımı ayrı. Swap'a düşmüş bir
  sunucu "çalışıyor" ama yavaşlamıştır — iki ayrı haber
- **Yük** — 1/5/15 dakika ortalaması, **çekirdek sayısına göre** okunur. Ham "2.4" bir bilgi değil;
  "2 çekirdekte 2.4" doygunluktur
- **Çalışma süresi** — beklenmeyen bir yeniden başlatma buradan anlaşılır

### Süreçler paneli

- **Süreç başına satır** (web · backend): durum, **yeniden başlama sayısı**, bellek, CPU. Yeniden
  başlama sayısı sessiz arızanın en iyi göstergesi: süreç ayakta görünür ama gece boyu 40 kez düşüp
  kalkmış olabilir

### Servisler paneli

- **Web ayakta mı** — sunucunun içinden yapılan denetim
- **Caddy etkin mi** — ters vekil düşerse site erişilemez ama süreçler "online" görünür; ikisi ayrı soru
- **HTTPS sertifikası** — kaç gün sonra doluyor. Sessizce dolan bir sertifika siteyi bir sabah kapatır;
  alınamıyorsa "bilinmiyor" yazar, tahmin edilmez

### Uygulama paneli — son bir saat

- **Hata sayısı** ve **düşen cron sayısı**. Bu iki sayı sunucu metriklerinden farklı bir şeyi söyler:
  makine rahat ama uygulama bozuk olabilir

### Trend

- **Disk · bellek · yük** için zaman grafiği; pencere seçilebilir (10 dk / 1 saat / 24 saat / 7 gün)
- Amaç anlık değeri değil **yönü** görmek: %84 dolu disk, bir haftadır %84'te duruyorsa haber değil;
  üç günde %60'tan geldiyse haberdir. Yüzde metrikleri **tam ölçekte** (tavan 100) çizilir — otomatik
  ölçek, sabit bir değeri dramatik dalgalanma gibi gösterir

### Hatalar paneli

- **Hata satırı** — mesaj, kaynak (web / cron / webhook), **kaç kez görüldüğü**, ilk ve son görülme
  zamanı. Sayı ile son görülme birlikte anlam kazanır: 400 kez görülmüş ama son görülme üç gün önceyse
  sorun bitmiş olabilir
- **Seviye** — uyarı / hata / ölümcül; ayrımı görünür ama liste sırası **son görülmeye** göredir
  (seviyeye göre değil: taze bir uyarı, eski bir hatadan daha çok şey söyler)
- **Açık / çözülmüş ayrımı** — varsayılan odak açık olanlar; çözülmüşler ayrı sekmeden görülür
- **Yeniden doğmuş hata** — çözüldü işaretlendikten sonra tekrar gelen hata **yeni bir satır** açar ve
  bunu söyler. Regresyon, hiç çözülmemiş bir hatadan farklı bir haberdir; ekran bu ikisini aynı
  göstermemeli
- **Hata detayı** — tam mesaj, stack, bağlam (`orderId`, iş adı, yol) ve istek yolu. Bağlam **kimlik
  taşır, içerik taşımaz** (`OBSERVABILITY §5`): burada müşterinin e-postası ya da adresi görünmez —
  görünen kimlikle veritabanına bakılır
- **Arama** — mesaj / kaynak / yol üzerinde. Elli satırlık bir listede bile "bunu daha önce görmüş
  müydüm" sorusu sorulur

## 3. Aksiyonlar

- **Çözüldü işaretleme** — hata satırı kapatılır; kim kapattı kaydedilir. Silme YOK: kayıt kalır,
  yalnız odaktan çıkar
- **Trend penceresi değiştirme**
- **Hata listesini süzme** — açık/çözülmüş, arama
- **Yenileme** — sayfa açık kalabilir; veri iki dakikada bir tazelendiği için ekran kendi kendini
  güncelleyebilir ama bunun **görünür** olması gerekir (sessizce değişen bir sayı, okuyanı yanıltır)

## 4. Durumlar ve varyasyonlar

- **Her şey iyi** — en sık görülecek hâl ve bu hâlin **sakin** görünmesi gerekiyor; sürekli dikkat
  isteyen bir panel, gerçekten dikkat gerektiğinde dikkat çekmez
- **Uyarı** / **Kritik** — ikisi ayırt edilebilir olmalı; kritik hâlde gerekçe kaçırılamayacak yerde
- **Hiç hata yok** — boş liste; "sistem yeni kurulmuş" ile "hata yok" aynı görünmemeli
- **Ölçüm bayat** — toplama işi durmuşsa (son görüntü 10+ dakika önce) ekran **bunu bir arıza olarak**
  gösterir. İzlemenin kendisinin durduğu hâl, izlemenin en tehlikeli hâlidir
- **Metrik alınamamış** — bir kaynak okunamadıysa o alan "bilinmiyor" der; sıfır göstermez. Sıfır bir
  ölçümdür, bilinmemek değildir
- **Uzun hata listesi** — aynı hata gruplanmış olsa da liste uzayabilir; sayfalama gerekir
- **Çok uzun stack** — detay alanı taşmadan okunabilmeli, kopyalanabilmeli

## 5. Akış bağlantıları

Gelinen: operasyon paneli (**çözülmemiş hata sayacı** ve sistem durumu rozeti oradan görünür — alarm
olmadığı için o rozet zorunlu), doğrudan menü.
Gidilen: hata bağlamındaki sipariş kimliğinden sipariş detayına köprü (varsa).

## 6. Yapmaması gerekenler

- **Yalnız admin rolüne** açılır; müşteri ve personel yüzeyinde izi olmaz
- **Grafik panosu kurulmaz** — bu bir APM ekranı değil. Beş metrik, üç trend, bir hata listesi; her
  eklenen kutu asıl haberi seyreltir
- **Ham log akışı gösterilmez** — log stdout'a yazılır ve süreç yöneticisinde durur. Log satırlarını
  ekrana taşımak, ekranı bir terminale çevirir ve süresi olan veriyi ikinci bir yere kopyalar
- **Hata silinmez** — yalnız "çözüldü" işaretlenir; süpürme saklama süresinin işidir, elin değil
- **Kişisel veri gösterilmez** — bağlamda kimlik vardır, içerik yoktur. Ekranın işi teşhis, müşteri
  kaydı okumak değil
- **Eşikler ekrandan ayarlanmaz** — sabit ve testli (`data-model/operasyon.md`). Ayar kutusu koymak,
  kimsenin ayarlamayacağı bir ayarın bakım borcunu doğurur
- **Sahte tazelik yok** — ekran, elindeki verinin yaşını saklamaz

## 7. Web / mobil notları (yalnız işlevsel)

- **Masaüstü öncelikli** — operasyonun geri kalanı telefon öncelikliyken bu ekran değil: buraya bir
  sorun araştırılırken bakılır ve stack okumak, trend karşılaştırmak geniş ekran işidir
- **Telefonda yine de tam çalışır** ama sıra değişir: tepe durumu → hatalar → sunucu → trend. Yolda
  "bir şey mi oldu" diye bakan kişi hükmü ve son hataları görmeli; grafik aşağıda kalabilir
- Stack ve bağlam telefonda **kopyalanabilir** olmalı — çoğu zaman bir yere yapıştırılacaktır
