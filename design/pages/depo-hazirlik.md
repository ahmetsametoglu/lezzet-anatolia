# Depo — Sipariş Hazırlama

## 1. Amaç ve kullanıcı

Depocunun onaylanmış siparişleri doğru partiden toplayıp "hazır" hale getirdiği ekran. Kullanıcı: depo sorumlusu (yalnız bu rol).

## 2. İçerik envanteri — ne var, neden

- **Depo seçim satırları (açılış hâli)** — kapsamı çok depolu personel sayfaya girdiğinde, boş bir "önce depo seçin" duvarı yerine tesis başına **tam genişlik bir satır** görür. Satırın içi: künye (kod · ad · durum rozeti) → tek satırlık künye cümlesi (`3 sipariş · 7 adet · 1 B2B`) → dört karne kutusu → varsa kurulum engeli. Satıra tıklamak o depoyu seçer ve kuyruğu açar. **Varsayılan depo yoktur** kuralı bozulmuyor — hiçbir satır önceden seçili ya da "önerilen" değil; değişen tek şey, seçimin bir engel değil sayfanın ilk adımı olarak kurulması ve **bilgiyle beslenmesi**: operatör hangi depoda iş olduğunu görerek seçer, adını hatırlayarak değil
  - **Dört karne kutusu:** geciken · bugün · kargo · yarım kalan. Her kutu Depolar ekranının karne sözleşmesini taşır — etiket · iri sayı · **açıklayıcı not** · gerektiğinde ton. Notlar sayının söyleyemediğini söyler: geciken kutusunun notu **gecikmenin yaşıdır** ("en eskisi 3 gündür bekliyor") çünkü kararı veren sayı değil süredir; "yarım kalan" biri toplamaya başlayıp bırakmış siparişleri sayar ve üç el değmemiş siparişle üç yarım sipariş bambaşka iki gündür
  - **Kutunun rengi işini söyler,** ve renkler uydurulmaz — operasyonun kapalı ton sözlüğünden okunur: **geciken kırmızı** (sözlükte kırmızı zaten "hata/gecikme"), **bugün olive** ("yolunda" — planlandığı gibi akan iş), **kargo mavi** ("bilgi/aday" — bir güne ait değil, sırası gelince yapılacak), **yarım kalan amber** ("dikkat/karar" — sürecek birini bekliyor). **Sıfırın tonu olmaz:** sayı sıfırsa kutu nötr kalır, çünkü sabit renkli bir "0 geciken" gerçek gecikmeyi kendi gürültüsünde kaybettirir
  - **Satır amber, kutu kırmızı** ve bu ayrım kasıtlı: satır *"buraya bak"* der, kutu *"sebebi bu"* der. Satırı da kırmızı yapmak, işi geciken bir depoyu bozuk bir depo gibi göstermek olurdu — tesiste bir arıza yok, bir işi sarkmış
  - **Kurulum engeli seçimden önce okunur:** kapsamlı personeli olmayan bir depoda "0 bekleyen", işin bitmiş olması değil hiç yapılamaması demektir. İki hâli ayırt etmeden seçim yaptırmak, operatörü girip hiçbir şey yapamayacağı bir masaya oturtmaktır. Cümle Depolar ekranıyla aynı kaynaktan gelir
  - **Ekran hiç boş kalmaz ve yeni görsel dil icat etmez:** yüzey dolu ekranla aynı (beyaz tuval), parçalar Depolar ve Sevkiyat ekranlarının parçalarıdır. Bir önceki hâli — küçük bir kart ızgarası — bu üç sebeple reddedildi (19.08 ekran turu)
- **Tesis şeridi (kuyruk açıkken)** — depo seçildikten sonra tesisler başlığın hemen altındaki şeritte kalır: kod · ad ve tek satırlık iş notu (`2 geciken · 7 bekleyen`). Tek tıkla başka depoya geçilir. Seçim ekranı seçimden sonra kaybolursa ikinci depoya bakmak sayfanın dışına çıkmayı gerektirir — Depolar ekranı da tam bu yüzden iki görünümden vazgeçmiştir. Şerit **sıralanmaz**: sıra operatörün Depolar'da dizdiği sıradır ve sistemdeki bütün depo seçicilerinde aynıdır. Geciken işi olan tesis şeritte de işaretli — operatör başka depoda çalışırken bir yerde işin sarktığını görmelidir. Kapsam tek depoluysa şerit hiç çizilmez (tek seçenekli seçici, seçim değil süstür)
- **Hazırlanacak sipariş listesi — ÜÇ KULVAR** *(19.08; öncesinde yalnız "bugün" vardı ve iki kulvar sessizce kayıptı)*: **geciken** (günü geçmiş, hâlâ hazırlanmamış — dünün işi bugünün önüne geçer) · **bugün** · **kargo** (teslim günü OLMAYAN sipariş; takvimde yeri yok ama hazırlanması gerekiyor). İleri tarihli sipariş kuyruğa girmez. Kulvar başlığı yalnız o kulvarda sipariş varken çizilir — boş bir "geciken 0" başlığı, olmayan bir sorunu her gün göz önünde tutmaktı. Sıralama aciliyet: geciken → bugün → kargo. Her satırda: Her satırda: sipariş referans numarası, müşteri adı (koli etiketleme/eşleştirme için), B2B/B2C işareti (hacim beklentisini kurar — B2B 10-50 koli olabilir), kalem sayısı ve durum (bekliyor / hazırlanıyor / hazır)
- **Sipariş kalem listesi** — ürün adı + varyant (ör. 500gr) + istenen adet; hazırlamanın çekirdeği. Ürün görseli tanımaya yardım eder (donuk pakette karışıklık olur)
- **Sistem parti önerisi (kalem başına)** — sistem her kalem için hangi partiden kaç adet alınacağını **önerir**; sıralama daima "önce tarihi yakın olan çıkar" kuralıyla yapılır (arayüzde bu kuralın adı geçmez — depocu sadece "şu tarihli partiden al" görür). Öneri şunları gösterir: partinin **son tarihi**, **depo konumu** (raf/dolap) ve o partiden alınacak **adet**. Bir kalem birden fazla partiden karşılanabilir (3 adet A partisi + 2 adet B partisi) — öneri bunu açıkça bölerek verir
- **Partiye bağlı teklif kalemi** — müşteri indirimli tekliften aldıysa o kalem **belirli bir partiye kilitlidir**; öneri değil zorunluluktur, depocu başka partiden veremez. Bu fark arayüzde anlaşılır olmalı ("bu kalem şu partiden çıkmalı")
- **Parti stok yeterliliği** — önerilen partide fiziksel eksik varsa (sayım tutmuyor) depocunun bunu görmesi ve işaretleyebilmesi gerekir
- **Eksik durumunda sistem önerisi** — bir kalem karşılanamıyorsa sistem eksiğin değerine/kritikliğine göre **akıllı bir öneri** sunar ("müşteriye sor" ya da "kalanı gönder") — ama bu yalnız öneridir, karar hazırlayanındır
- **Hazırlık ilerlemesi** — siparişin kaç kaleminin toplandığı; yarım kalan iş kaldığı yerden sürmeli

## 3. Aksiyonlar

- Sipariş seç → kalemleri sırayla topla → kalem başına **"hazırlandı"** onayı (sayfanın ana aksiyonu). Onayla birlikte çıkan parti(ler) sisteme **otomatik** kaydedilir — depocu ayrıca kayıt girmez, günlük ek yük sıfırdır
- **Öneriden sapma (istisna):** depocu fiilen başka partiden aldıysa yalnız o satırın partisini/adedini değiştirir; gerisi öneriyle akar
- **Eksik işaretleme:** kalemde karşılanamayan adedi işaretler (tamamı da eksik olabilir)
- **Eksik kararı (insan kararı):** (i) **müşteriye sor** — "kalanı göndereyim mi, iptal mi?" sorusu müşteriye iletilir — ya da (ii) **kalanı gönder** — fark otomatik çözülür (peşin ödendiyse iade, kapıda ödenecekse tahsilat düşer; bu hesap depocuya görünmez, sadece kararı verir)
- Siparişin tamamı toplandığında **"sipariş hazır"** — sipariş kurye/sevkiyat aşamasına geçer

## 4. Durumlar ve varyasyonlar

- **Boş durum** — hazırlanacak sipariş yok
- **Tek partili / çok partili karşılama** — aynı kalem birden çok partiye bölünebilir
- **Normal kalem / partiye kilitli teklif kalemi**
- **Tam karşılanan / kısmi eksik / tamamen eksik kalem**
- **B2C küçük sipariş / B2B hacimli sipariş** — kalem ve adet sayısı büyür, liste bu hacimde de okunur kalmalı
- **Yarım kalan hazırlık** — araya iş girer, depocu geri dönünce kaldığı yerden sürer

## 5. Akış bağlantıları

Gelinen: sipariş onaylanınca (ödeme onayı veya kapıda-ödeme onayı) bu listeye düşer; depocu genelde güne bu ekrandan başlar.
Gidilen: "sipariş hazır" sonrası sipariş kurye gün listesine (rota) veya kargoya geçer; depocu listedeki sıradaki siparişe döner. Eksikte "müşteriye sor" seçilirse sipariş cevap bekleyen durumda görünür.

## 6. Yapmaması gerekenler

- **Fiyat, tutar, kâr, maliyet — asla görünmez.** Ne kalem fiyatı, ne sipariş toplamı, ne alış maliyeti. Depocu adet ve ürün hazırlar, para görmez. Eksik kararındaki "fark iadesi" bile tutar olarak gösterilmez
- **Müşteri iletişim bilgisi ve adres görünmez** — teslimat kuryenin işidir; depocuya yalnız ad (koli eşleştirme) yeter
- "FEFO", "rezervasyon", "batch-pinned", "fulfilled_qty" gibi iç terimler arayüz dilinde kullanılmaz — "önce şu tarihli partiden", "ayrılmış", "karşılanan adet" gibi sade karşılıklar yazılır
- Başka günlerin/haftaların sipariş arşivi bu ekrana yığılmaz — bugünün işi net kalır. ⚠ **Bu kural "yalnız bugünün tarihi" DEMEK DEĞİLDİR** ve 19.08'e kadar öyle uygulanıyordu: teslim gününe eşitlik süzgeci konmuştu ve iki şeyi birden düşürüyordu — teslim günü olmayan **kargo** siparişini (eşitlik `NULL`u hiç tutmaz) ve dünden kalan **hazırlanmamış** siparişi. Ölçüldü: bekleyen 9 siparişin 3'ü hiçbir günde görünmüyordu. **Geciken iş arşiv değildir, yapılmamış iştir**; kargonun ise bir günü hiç yoktur. Yığılmaması gereken şey İLERİ tarihli sipariştir ve o hâlâ dışarıda

## 7. Web / mobil notları (yalnız işlevsel)

- **Telefon önceliklidir.** Depocu soğuk depoda, ayakta, çoğu zaman **tek elle ve eldivenle** kullanır — onay aksiyonları bu koşulda güvenle basılabilir olmalı, yanlışlıkla "hazırlandı" basmak kolay olmamalı
- Parti son tarihi ve konum bilgisi toplama anında bir bakışta okunmalı (raf karşısında telefonla durulan an)
- Web (masaüstü) hali günün tamamını görüp planlamak için kullanılabilir; işin kendisi telefonda biter
