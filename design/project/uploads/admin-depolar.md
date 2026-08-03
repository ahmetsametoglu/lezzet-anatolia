# Admin — Depolar

> Depo ekseninin **davranış** kuralları sayfalar-üstü sözleşmededir (`operasyon-depo-ekseni.md`).
> Bu doküman o eksenin yönettiği **nesnenin kendi sayfasıdır**: tesis kartı.

## 1. Amaç ve kullanıcı

Fiziksel tesislerin tanımlandığı ve bir deponun varlığının sonuçlarının okunduğu ekran. Kullanıcı: yalnız yönetici (admin) — depo-üstü rol. Depocu ve kurye bu sayfayı hiç görmez.

Sayfa **iki soruya** cevap verir: "hangi tesislerimiz var, künyeleri ne?" ve — asıl zoru — **"bu depoyu kapatırsam ne olur?"**. Bir deponun kapatılması stoğunu, bölgelerini ve personelini aynı anda etkiler; bu etkiler ancak burada bir arada görülebilir.

## 2. İçerik envanteri — ne var, neden

- **Depo listesi** — her tesis: **kod** (`STR`, `KEHL`), ad, ülke, aktif/kapalı, kargo çıkış deposu mu, operatör sırası. Liste kısa kalır (tesis sayısı fiziksel bir gerçektir, veriyle büyümez); sıra operatörün belirlediği sıradır ve **sistemdeki bütün depo seçicilerinde aynı sıradır** — bağlam seçicisi, süzgeçler ve transfer hedefi dahil
- **Kod, ekran etiketi değil belge parçasıdır** — imha tutanağı `IMH-STR-26-0012`, transfer `TRF-STR-26-0007` bu kodu taşır; kâğıt klasör fiziksel olarak o depoda durur ve denetmen/tedarikçi kodu **elle yazar**. Bu yüzden kısa, okunur ve karışmaz olmalı. Kodun sonradan değiştirilmesi geçmiş belgeleri değiştirmez — eski kayıtlar eski önekle kalır; ekran bu sonucu söylemeden kodu değiştirtmez
- **Ülke** — tesisin fiziksel olarak nerede olduğu. Bölgenin ülkesiyle karıştırılmaz: bir teslimat bölgesi sınır ötesi olabilir, tesis olamaz. ⚠ **KDV bu alana bağlıdır** — yeni bir ÜLKEDE ilk depo açmak vergi modelini değiştirir; ekran bu adımda mali uyarıyı verir (`DOMAIN §5/§17`: mali danışmana sorulmadan açılmaz)
- **Kargo çıkış deposu işareti** — bölge dışı müşterilere ve rota müşterilerinin kargo dolgusuna hizmet eden depo. **Ülke başına en fazla bir tane** olabilir ve kural veritabanındadır: ikincisini işaretleme denemesi reddedilir. Ekran reddi okunur bir cümleye çevirir ve **o rolü şu an hangi deponun taşıdığını söyler** — kullanıcı "neden olmadı"yı aramak zorunda kalmaz, devretmek istiyorsa nereye gideceğini bilir
- **Adres** — irsaliye, tedarikçi yazışması ve denetim için; okunur ve kopyalanabilir olmalı
- **Bağlı teslimat bölgeleri (okunur)** — bu depoya bağlı bölgeler ve kapsadıkları posta kodu sayısı. Buradaki amaç yönetim değil **sonuç**: bu depo kapanırsa hangi adresler sahipsiz kalır. Bölge↔depo ataması **Rotalar** ekranındadır, burada değil (aynı bağ iki yerden yönetilmez)
- **Kapsamında bu depo olan personel (okunur)** — kim bu tesiste çalışıyor. Yine sonuç için: depocu ve kurye **kapsamsız olamaz** (kural veritabanında), yani bu depo tek kapsamı olan bir kişi varsa kapatma o kişiyi kapalı kapı hâline düşürür. Kapsam ataması **Ayarlar**'daki kişi kartındadır
- **Deponun içindekiler (okunur özeti)** — kaç varyantta stok, kaç parti, yaklaşan tarihli var mı, yolda bekleyen sevkiyatı var mı. Kapatma kararının en sert sonucu buradadır: **kapalı depodaki stok satış okumalarının hiçbirinde görünmez** — mal kayıtta durur ama sistem onu yok sayar. Bu bir arıza değil tanımdır (kapalı tesisten satış yapılmaz), ama farkında olmadan yapılırsa "stok buharlaştı" gibi yaşanır
- **Kurulumu eksik depo işareti** — ne bağlı bölgesi ne kargo çıkışı olan bir depo **hiçbir siparişi alamaz**: posta kodu ona çözülmez, kargo yolu ondan geçmez. Açık ama ulaşılamaz bir tesistir. Aynı şekilde kapsamlı personeli olmayan depoda mal kabul ve hazırlık yapılamaz. İkisi de veriden ölçülebilir; sessiz bırakılmaz

## 3. Aksiyonlar

- Depo ekleme — kod, ad, ülke, adres, kargo çıkış deposu mu, sıra
- Depo künyesini düzenleme; sırayı değiştirme
- **Kapatma / yeniden açma** — kapatma öncesi sonuçlar (stok, bölge, personel, yoldaki sevkiyat) açıkça gösterilir ve onay istenir
- Kargo çıkış rolünü işaretleme/kaldırma (ret hâli §4'te)
- Bağlı bölgelere (Rotalar), personele (Ayarlar), bu deponun stoğuna (Stok) ve sevkiyatlarına (Transfer) geçiş

## 4. Durumlar ve varyasyonlar

- **Tek depolu kurulum (bugünkü durum)** — sayfa yine vardır ve tek satır gösterir; operasyonun geri kalanında depo ekseni görünmez. **İkinci depo tam burada doğar** — ekleme akışı, sistemin çok depolu hâline geçtiği andır ve o an ne değişeceğini söylemelidir (bağlam seçicisi belirir, listeler depo söylemeye başlar)
- **İkinci kargo deposu denemesi (ret)** — kural veritabanında; ekran ham hata metni değil sebebi ve mevcut sahibi gösterir. Rolü devretmek isteyen kullanıcı için yol açık kalır
- **Kapatılmak istenen depo — dört ayrı sonuç:** stoğu var (mal görünmez olur) · bağlı bölgesi var (adresler sahipsiz kalır) · tek kapsamı bu olan personeli var (kapalı kapıya düşer) · yolda ona gelen sevkiyat var (kabul edilecek yer kalmaz). Bunlar farklı ağırlıkta sonuçlardır; hepsi tek bir "emin misiniz?" cümlesine sıkıştırılamaz
- **Kapalı depo** — listede kalır, silinmez: geçmiş sipariş ve parti hangi tesisten çıktığını bilmek zorundadır. Kapalı depo hiçbir seçicide, süzgeçte ve transfer hedefinde görünmez
- **Yeni ülkede ilk depo** — mali uyarı hâli (yukarıda)
- **Kargo çıkış deposu olmayan ülke** — o ülkede bölge dışı müşteriye satış yapılamaz; sipariş, deposu çözülemediği için hiç açılmaz. Bu boşluk sessiz kalmaz, listede görünür bir eksiklik hâlidir

## 5. Akış bağlantıları

Gelinen: yönetim menüsü; Rotalar (bölge kartındaki depo adından); Stok, Siparişler ve Transfer ekranlarında geçen depo adından.
Gidilen: Rotalar (bölge↔depo ataması), Ayarlar (personel kapsamı), Stok (bu deponun stoğu — bağlam bu depoya alınarak), Transfer (bu deponun sevkiyatları).

## 6. Yapmaması gerekenler

- **Depo silinmez** — yalnız kapatılır; ekranda silme eylemi hiç bulunmaz (geçmiş kayıtların bağı kopamaz)
- **"Varsayılan depo" işareti yoktur ve icat edilmez** — hiçbir yerde bir depo "öntanımlı" olamaz; depo ya adresin posta kodundan ya personelin kapsamından gelir
- **Depo eksenine ait bağlam seçici bu sayfada işlemez** — depolar yönetim nesnesidir, hepsi her zaman listelenir; "şu an STR bağlamındayım" bu listeyi daraltmaz
- Stok sayıları burada **yönetilmez** — burası tesis kartıdır, envanter değil; sayılar yalnız kapatma kararına bağlam olsun diye özet hâlde durur
- Bölge tanımı (posta kodları, teslim günleri) burada düzenlenmez — Rotalar'ın işidir; burada yalnız hangi bölgelerin bağlı olduğu okunur
- Personel rolü/kapsamı burada atanmaz — Ayarlar'ın işidir (kişi tek yerden yönetilir)
- **Kasa hesabı burada açılmaz** — her depo bir kasadır ama hesap Para ekranının nesnesidir; bu sayfa para hareketi göstermez
- Vergi/KDV kuralı burada tanımlanmaz — ülke alanı bir beyandır, kuralın kendisi ayarlardadır
- Depo içi raf/konum yapısı burada tanımlanmaz — konum partinin alanıdır (depo içi çözünürlük), tesisin değil

## 7. Web / mobil notları (yalnız işlevsel)

- **Nadir ve sonuçları ağır bir kurulum işi** — günlük kullanım değildir; hız değil, doğruluk ve geri dönülmezliğin anlaşılması önemlidir
- Telefonda **okunabilir** olmalı (adres, kod, kimin çalıştığı sahada sorulur); ama kapatma gibi sonucu geniş bir eylem telefonda kazara verilebilecek bir karar olmamalı
- Kod ve adres kopyalanabilir olmalı — ikisi de sistem dışına (belge, tedarikçi yazışması) elle taşınır
