# Admin — Depolar Arası Transfer

> Depo ekseninin **davranış** kuralları sayfalar-üstü sözleşmededir (`operasyon-depo-ekseni.md`).
> Bu sayfa o eksenin en doğrudan tüketicisidir: gösterdiği her şey iki depo arasındadır.

## 1. Amaç ve kullanıcı

Malın bir depodan diğerine taşınmasının kayda geçtiği ve **yolda ne olduğunun** görüldüğü ekran.

**Tek ekran, rolüne göre daralır** — bölünmez. Bunun sebebi ekonomi değil model: yoldaki bir sevkiyat aynı anda iki deponun gerçeğidir (birinden çıkmıştır, ötekine gelmektedir); iki ayrı ekran aynı kaydı iki kez anlatır ve biri diğerinden geride kalır. Depo bağlamı tek depodayken liste "bu deponun gönderdikleri + aldıkları"na süzülür; "Tüm depolar" bağlamında tüm ağ görünür.

**Karar ile kayıt farklı kişilerde olabilir:** "KEHL'e 20 koli gitsin" kararı yöneticinindir — çünkü karar iki deponun stoğunu karşılaştırmayı gerektirir ve o karşılaştırma yalnız yöneticide vardır (depocu başka deponun stoğunu görmez, `DOMAIN §17`). Kaydı ise **malı fiilen eline alan** kişi açar: rafın önündeki depocu sevk eder, rampadaki depocu kabul eder. Sistemde "planlanmış transfer" diye bir ara hâl yoktur — sevk kaydı malın çıktığı andır, o an stok gerçekten düşer.

## 2. İçerik envanteri — ne var, neden

- **Yoldakiler** — sayfanın omurgası. Sevk edilmiş ama henüz kabul edilmemiş her sevkiyat: belge no, kaynak → hedef, sevk tarihi ve sevk eden, kalem sayısı ve toplam adet, **yolda geçen süre**. Bu listenin **tam** olması zorunludur: yoldaki mal hiçbir deponun stoğunda değildir, yani listeden düşen bir sevkiyat iki depoda da görünmeyen mal demektir. Liste zamanla büyümez — her kabul birini düşürür; boş olması sağlıklı hâldir, bir eksiklik değil
- **Sevk oluşturma** — hedef depo + taşınacak varyantlar ve istenen miktarlar. **Kaynak depo sorulmaz**: partiler zaten bir depoda duruyor, kaynak çalışılan depodur (yönetici "Tüm depolar" bağlamındaysa önce kaynağı seçer — bir sevkiyatın kalemleri tek depodan çıkmak zorundadır)
- **Parti önerisi (FEFO) — sistemden, karar operatörden** — her varyant için hangi partiden kaç adet: önce süresi dolan. Operatör öneriyi serbestçe değiştirir; sistemin işi taramayı ondan almaktır, kararı değil
- **Öneri KULLANILABİLİR üzerinden yapılır** — müşteriye söz verilmiş (ayrılmış ya da indirimli teklife çıpalı) mal başka şehre gidemez. Fiiliye bakan bir öneri, karşılanamayacak bir sipariş üretirdi
- **Yolda ömür yanar uyarısı** — hedefe ulaşım süresi (parametrik, ayarlardan) kadar bile ömrü kalmayan parti **önerilmez**; ama seçilebilir. "En yakın tarihliyi gönder" kuralı doğrudur, uzağa gönderilen malda yanlış sonuç verir. **Uyarı engel değildir** — hedefte kampanya vardır, orada hızlı tüketilecektir; kararı bilen insan verir
- **Öneri isteneni karşılayamıyorsa SEBEBİ** — iki farklı hâl vardır ve aynı cümleyle anlatılamaz: (a) o kadar kullanılabilir mal yok → gönderilemez; (b) yeterli mal var ama kalanların hepsi yolda bozulacak kadar kısa ömürlü → gönderilebilir, ama bilerek. İlki bir sınır, ikincisi bir tercih
- **Kabul** — gelen sevkiyatın **her satırı için** kaç adet geldiği. Boş bırakılan satır kabulü tamamlamaz; **"hiç girmedim" ile "sıfır geldi" ayrı şeylerdir**: ilki eksik bir kayıt, ikincisi bir beyandır ("kutu geldi ama içi boştu / kayboldu"). Fark kalıcı olarak kayıtta durur, sessizce eşitlenmez
- **Transfer detayı** — kalemler: hangi parti (son tarih, lot), sevk edilen, kabul edilen, fark. Hedefte partinin tarihi ve lotu **kopyalanarak yeni bir parti doğar**; parti kimliği taşınır, başka partiyle birleşmez — geri çağırma izi ve gerçek maliyet transferden etkilenmez
- **Belge numarası** — `TRF-STR-26-0007`; öneki **kaynak** deponun kodudur, çünkü kâğıt nüsha orada dosyalanır
- **Transfer geçmişi** — bir deponun gönderdikleri ve aldıkları, en yeniden eskiye. Bu küme veriyle büyür (her sevk bir satır) — sabit bir tavanla kesilmez, kaydırdıkça devam eder
- **Sevk kaydını geri alma ≠ malı geri getirme** — sistemde "henüz yola çıkmamış transfer" diye bir hâl yoktur; geri alınacak şey her zaman **zaten sevk edilmiş** bir kayıttır. İki ayrı gerçek vardır ve tek eyleme sıkıştırılırsa stok yalan söyler: **(1) kayıt hatalıydı, mal hiç çıkmadı** → sevk geri alınır, mal kaynağa döner, iz kalır; **(2) mal çıktı, sonra geri döndü** → bu **ters yönde yeni bir transferdir**, çünkü mal fiilen iki kez yol gitmiştir ve tek kayda indirmek soğuk zincir geçmişini siler. Eylemin adı ne yaptığını söylemelidir — "iptal" ikisini de karşılar gibi durur, hiçbirini karşılamaz

## 3. Aksiyonlar

- Sevk oluşturma: hedef seç → varyant + miktar ekle → öneriyi gözden geçir/değiştir → **sevk et** (mal o an kaynaktan düşer)
- Kabul: yoldaki sevkiyatı aç → her satır için gelen adedi gir → **kabul et** (mal hedefte yeni parti olarak doğar)
- Yoldakileri ve geçmişi izleme; transfer detayına inme
- Sevk kaydını geri alma (yalnız mal hiç çıkmamış yanlış kayıt için); mal fiilen döndüyse ters yönde yeni bir sevk açılır
- Kalemden partiye / stok ekranına geçiş

## 4. Durumlar ve varyasyonlar

- **Yolda hiçbir şey yok** — normal ve iyi hâl; "bir şey eksik" tonunda gösterilmez
- **Uzun süredir yolda** — ulaşım süresini belirgin şekilde aşmış sevkiyat: kaybolmuş ya da kabul edilmeyi unutmuş mal. Bu mal iki depoda da satılamaz durumda beklediği için görünür olmalı
- **Tam kabul / kısmi kabul / sıfır kabul** — üç ayrı sonuç; kısmi ve sıfır kabulde fark kalıcı kayıttır
- **Çok kalemli sevkiyatın kısmen girilmiş kabulü** — yarım bırakılmış kabul tamamlanmamış sayılır; ekran hangi satırların beklediğini söyler
- **Kısa ömürlü parti önerildi (uyarılı)** / **hiç uygun parti yok** — §2'deki iki sebep ayrımı
- **Depocu görünümü** — yalnız kendi deposu; hedef deponun stoğu, karşılaştırması ve "orada az kalmış" bilgisi **yoktur**. Gördüğü şey mala dair değil sevkiyata dairdir
- **Yönetici görünümü** — tüm ağ; satırlar iki depoyu da söyler
- **Tek depolu kurulum** — transfer edilecek bir yer yoktur; sayfa boş değil **kapalı** hâldedir ve sebebini söyler ("ikinci depo açılınca burası çalışır")
- **Hedefi kapatılmış sevkiyat** — kapatılan depoya yolda mal varsa kabul edecek yer kalmaz; bu hâl Depolar ekranında kapatma öncesi uyarı olarak çıkar, burada da yalnız bırakılmaz

## 5. Akış bağlantıları

Gelinen: Stok (bir depoda eşik altına inen varyant — çözüm ya tedarik siparişi ya transferdir), Depolar (bir tesisin sevkiyatları), yönetim menüsü; depocu için kendi ana menüsünden ("bana ne geliyor").
Gidilen: Stok (parti ve seviye detayı), Depolar (tesis künyesi), Satın Alma (transfer yerine tedarik kararı verildiğinde).

## 6. Yapmaması gerekenler

- **Sanal bir "transit depo" gösterilmez** — yoldaki mal hiçbir depoda değildir; ekran üçüncü bir envanter icat etmez. "Yolda ne var" sorusunun kaynağı sevkiyat kaydının kendisidir
- **Transfer kaydı düzeltilmez, silinmez** — olay kaydıdır; yanlış sevkin çözümü ters yönde yeni bir transferdir. Kayıt silmek geçmişi yalanlar
- **Depocuya hedef deponun stoğu gösterilmez** — ne miktar, ne "orada bu üründen az kalmış" ipucu. Depolar fiziksel olarak uzaktır; o bilginin depocuda operasyonel karşılığı yoktur, karşılaştırma yöneticinin işidir
- **Hedef depo seçicisi bir kapsam süzgeci değildir** — depocu kapsamı dışındaki bir depoya sevk edebilir (kamyon oraya gidiyor). Kapsam kuralı *hangi verinin okunabildiğini* sınırlar; hedef listesi malın nereye gidebileceğidir ve hedefin adını görmek onun stoğunu görmek değildir
- **Alış fiyatı / maliyet / satış fiyatı görünmez** — depocu para görmez; parti kimliği korunduğu için maliyet arka planda zaten taşınır
- **Transfer bir tedarik girişi değildir** — tedarikçi, irsaliye, tedarik siparişi alanları burada yoktur; parti buraya dışarıdan girmez, içeriden gelir
- **FEFO zorlanmaz** — sistem sıralar ve uyarır, kilitlemez
- Yeni son tarih / lot girilmez — hedefteki parti kaynağınkini taşır; yeniden yazdırmak izi kırardı
- Müşteri yüzeyine hiçbir parçası sızmaz — müşteri deponun da transferin de varlığından habersizdir

## 7. Web / mobil notları (yalnız işlevsel)

- **Telefon önceliklidir** — sevk de kabul de rampada, ayakta, koli sayarak yapılır; tek elle ilerleyebilmeli
- **Kabul, sayarak yapılan bir iştir**: satır satır adet girme akışı, sayılan koliyle ekrandaki satırı karıştırmayacak kadar net olmalı — hata en çok burada olur ve fark kalıcı kayda geçer
- Çok kalemli sevkiyatın hazırlanması masaüstünde de yapılabilir (yönetici karar verirken); iki biçimde de aynı akış yürümeli
- Yoldakiler listesine gün içinde birden çok kez, kısa bakışlarla bakılır — "bugün ne bekliyorum" bir bakışta okunmalı
