# Admin — Depolar

> Depo ekseninin **davranış** kuralları sayfalar-üstü sözleşmededir (`operasyon-depo-ekseni.md`).
> Bu doküman o eksenin yönettiği **nesnenin kendi sayfasıdır**.

## 1. Amaç ve kullanıcı

Bir tesisin **kim olduğu, nereye hizmet ettiği ve nasıl durduğu** — üçü bir arada. Kullanıcı: yalnız yönetici (admin). Depocu ve kurye bu sayfayı hiç görmez.

Sayfa üç soruya cevap verir ve üçü de aynı nesneye ait olduğu için ayrılmaz:

1. **Künye** — kod, ülke, adres, kargo çıkışı mı, açık mı
2. **Hizmet alanı** — hangi posta kodlarından gelen sipariş bu depodan çıkar, hangi günlerde
3. **Karne** — bu depo bugün nasıl duruyor (risk, eşik, yolda bekleyen)

**Mal giriş/çıkışı burada DEĞİL.** Kabul, sevk, imha ve hazırlık birer harekettir ve hepsi Stok ekranının hareket defterinde yaşar (karar 01.08). Burası tesisin kendisi; oradan geçen mal değil.

## 2. İçerik envanteri — ne var, neden

### Künye

- **Depo listesi** — her tesis: **kod** (`STR`, `KEHL`), ad, ülke, aktif/kapalı, kargo çıkış deposu mu, operatör sırası. Liste kısa kalır (tesis sayısı fiziksel bir gerçektir, veriyle büyümez); sıra operatörün belirlediği sıradır ve **sistemdeki bütün depo seçicilerinde aynı sıradır** — bağlam seçicisi, tablo süzgeçleri, transfer hedefi
- **Kod, ekran etiketi değil belge parçasıdır** — imha tutanağı `IMH-STR-26-0012`, transfer `TRF-STR-26-0007` bu kodu taşır; kâğıt klasör o depoda durur ve denetmen/tedarikçi kodu **elle yazar**. Kısa, okunur, karışmaz olmalı. Kodun sonradan değişmesi geçmiş belgeleri değiştirmez — eski kayıtlar eski önekle kalır; ekran bu sonucu söylemeden kodu değiştirtmez
- **Ülke** — tesisin fiziksel yeri. Bölgenin ülkesiyle karıştırılmaz: bir bölge sınır ötesi olabilir, tesis olamaz. ⚠ **KDV bu alana bağlıdır** — yeni bir ÜLKEDE ilk depo açmak vergi modelini değiştirir; ekran o adımda mali uyarıyı verir (`DOMAIN §5/§17`)
- **Kargo çıkış deposu işareti** — bölge dışı müşterilere ve rota müşterilerinin kargo dolgusuna hizmet eden depo. **Ülke başına en fazla bir tane**; kural veritabanındadır ve ikincisi reddedilir. Ekran reddi okunur bir cümleye çevirir ve **o rolü şu an hangi deponun taşıdığını söyler**
- **Adres** — irsaliye, tedarikçi yazışması, denetim; okunur ve kopyalanabilir

### Hizmet alanı (bölgeler + posta kodları)

Bu bölüm **Teslimat sayfasından buraya taşındı** (karar 01.08; o sayfa eskiden "Rotalar"dı). Gerekçe: bölge tanımı bir **kurulum** işidir (yılda birkaç kez), Teslimat'ın günlük işi ise o günün çıkışları ve kurye atamasıdır. Kurulum kurulumla durur. Teslimat bölgeyi okumaya devam eder, tanımlamaz.

- **Bu depoya bağlı bölgeler** — her bölge: ad ("Strasbourg Merkez"), **posta kodları**, **haftalık teslim günleri**, aktif/pasif. Bir depo birden çok bölgeye hizmet eder ve bölgelerin günleri farklıdır
- **Deponun sorumlu olduğu kodların TOPLAMI** — bölgelerin birleşimi, tek bir liste olarak da okunabilmeli: "STR'ye 7 posta kodu bağlı". Operatörün asıl sorusu çoğu zaman budur ("bu adres hangi depodan çıkar?"), bölge o sorunun arasındaki katmandır
- **Posta kodu neden doğrudan depoya bağlanmaz** — bölge yalnız bir gruplama değil, **teslim günlerini** taşıyan katmandır. Kodu doğrudan depoya bağlamak günü kaybettirirdi. Ekran bunu bir açıklama olarak değil, yapı olarak gösterir: depo → bölge → kodlar
- **Çakışma reddi** — bir posta kodu **tek bir bölgede** olabilir (pasif bölge dahil). Başka bölgede tanımlı bir kod eklenmeye çalışılırsa kayıt reddedilir; ekran hangi bölgenin ve hangi deponun tuttuğunu söyler ve taşımanın yolunu gösterir. Sessiz "ilki kazanır" YOKTUR — çok depoda bunun bedeli siparişin yanlış şehre düşmesidir
- **Bir kodu çıkarmanın sonucu** — o adresler rota dışına düşer ve kargo yoluna geçer; ekran bunu değişiklik anında söyler

### Karne (bu depo nasıl duruyor)

Karne **SAYAR, listelemez**: her sayı Stok ekranına o depo bağlamıyla giden bir kapıdır. Satırların kendisi orada yaşar — burada tekrarlanması aynı listenin iki sahibi olması demekti.

- **Elde ne var** — kaç varyantta stok, kaç parti
- **Risk** — yaklaşan tarihli parti sayısı ve **risk tutarı**; DLC'si geçmiş (yalnız imha yolu kalan) parti sayısı ayrı. Bu deponun kendi gerçeğidir: aynı ürünün STR'de son günlerinde, KEHL'de yeni gelmiş partisi olması rutindir
- **Eşik altı** — bu depoda asgari stok eşiğinin altına inmiş varyantlar. **Eşik depo bazlıdır** (`DOMAIN §17`): 20 adet Strasbourg'da bol, Kehl'de kritik olabilir. Çözümü iki yolludur ve ekran ikisini de gösterir: tedarik siparişi ya da başka depodan transfer
- **Yolda bekleyen** — bu depoya gelen ve bu depodan giden, henüz kabul edilmemiş sevkiyat sayısı. Yoldaki mal hiçbir depoda satılamaz; uzun süredir bekleyen sevkiyat bir arıza işaretidir
- **Açık iş** — bu depodan çıkacak, henüz teslim edilmemiş sipariş sayısı
- **Son hareket** — en son ne zaman mal girdi/çıktı; sessizleşmiş bir depo ya kapatılmayı bekliyordur ya unutulmuştur
- **Kurulumu eksik depo işareti** — ne bağlı bölgesi ne kargo çıkışı olan depo **hiçbir siparişi alamaz**: posta kodu ona çözülmez, kargo yolu ondan geçmez. Açık ama ulaşılamaz bir tesistir. Kapsamlı personeli olmayan depoda da mal kabul ve hazırlık yapılamaz. İkisi de veriden ölçülebilir, sessiz bırakılmaz

### Bağlı personel (okunur)

- **Kapsamında bu depo olan kişiler** — kim bu tesiste çalışıyor. Amaç yönetim değil **sonuç**: depocu ve kurye **kapsamsız olamaz** (kural veritabanında), yani tek kapsamı bu olan biri varsa kapatma onu kapalı kapı hâline düşürür. Kapsam ataması Ayarlar'daki kişi kartındadır — kişi tek yerden yönetilir

## 3. Aksiyonlar

- Depo ekleme / künye düzenleme / sırayı değiştirme
- **Kapatma / yeniden açma** — kapatma öncesi sonuçlar açıkça gösterilir ve onay istenir
- Kargo çıkış rolünü işaretleme/kaldırma (ret hâli §4'te)
- **Bölge ekleme/düzenleme/pasifleştirme** — posta kodları + teslim günleri; kod ekleme/çıkarma
- Karnedeki bir sayıdan Stok'a geçiş (bağlam o depoya alınmış hâlde)
- Personele (Ayarlar), gün planına (Teslimat) geçiş

## 4. Durumlar ve varyasyonlar

- **Tek depolu kurulum (bugünkü durum)** — sayfa tek satır gösterir; operasyonun geri kalanında depo ekseni görünmez. **İkinci depo burada doğar** ve ekleme akışı ne değişeceğini söylemelidir (bağlam seçicisi belirir, listeler depo söylemeye başlar)
- **İkinci kargo deposu denemesi (ret)** — sebep ve mevcut sahip gösterilir; rolü devretmenin yolu açık kalır
- **Posta kodu çakışması (ret)** — hangi bölge, hangi depo, nasıl taşınır
- **Kapatılmak istenen depo — dört ayrı sonuç:** stoğu var (mal görünmez olur) · bağlı bölgesi var (adresler sahipsiz kalır) · tek kapsamı bu olan personeli var (kapalı kapıya düşer) · yolda ona gelen sevkiyat var (kabul edecek yer kalmaz). Farklı ağırlıkta sonuçlardır; tek bir "emin misiniz?" cümlesine sıkışmaz
- **Kapalı depo** — listede kalır, silinmez: geçmiş sipariş ve parti hangi tesisten çıktığını bilmek zorundadır. Hiçbir seçicide, süzgeçte ve transfer hedefinde görünmez
- **Yeni ülkede ilk depo** — mali uyarı hâli
- **Kargo çıkış deposu olmayan ülke** — o ülkede bölge dışı müşteriye satış yapılamaz; sipariş deposu çözülemediği için hiç açılmaz. Listede görünür bir eksiklik hâlidir
- **Bölgesiz depo** — yalnız kargo çıkışıysa normaldir; değilse kurulumu eksiktir

## 5. Akış bağlantıları

Gelinen: yönetim menüsü; Stok/Siparişler ekranlarında geçen depo adından; Teslimat (gün planındaki bölge adından).
Gidilen: **Stok** (karneden — bağlam o depoya alınır: seviyeler, hareketler, yoldakiler), **Teslimat** (bu bölgelerin gün planı), **Ayarlar** (personel kapsamı), **Satın Alma** (eşik altı → tedarik siparişi).

## 6. Yapmaması gerekenler

- **Mal giriş/çıkışı burada yapılmaz ve listelenmez** — kabul, sevk, kabul, imha, hazırlık hepsi Stok'un hareket defterindedir. Burada yalnız SAYILARI görünür ve o sayılar oraya götürür
- **Parti listesi yoktur** — karne "6 parti risk altında" der, hangi partiler olduğunu Stok söyler
- **Depo silinmez** — yalnız kapatılır; silme eylemi hiç bulunmaz
- **"Varsayılan depo" işareti yoktur ve icat edilmez** — depo ya adresin posta kodundan ya personelin kapsamından gelir
- **Depo ekseninin bağlam seçicisi bu sayfayı daraltmaz** — depolar yönetim nesnesidir, hepsi her zaman listelenir
- Personel rolü/kapsamı burada atanmaz (Ayarlar'ın işi); gün planı ve kurye ataması burada yapılmaz (Teslimat'ın işi) — bölge TANIMI burada, bölgenin GÜNLÜK kullanımı orada
- **Kasa hesabı burada açılmaz** — her depo bir kasadır ama hesap Para ekranının nesnesidir; bu sayfa para hareketi göstermez (risk TUTARI bir hareket değil, bir ölçüdür)
- Vergi/KDV kuralı burada tanımlanmaz — ülke bir beyandır, kural ayarlardadır
- Depo içi raf/konum yapısı burada tanımlanmaz — konum partinin alanıdır (depo İÇİ çözünürlük), tesisin değil

## 7. Web / mobil notları (yalnız işlevsel)

- **Nadir ve sonuçları ağır bir kurulum işi** — hız değil, doğruluk ve geri dönülmezliğin anlaşılması önemlidir
- Karne bunun istisnasıdır: telefondan **bakılır** (sahada "KEHL'de durum ne?"), ama oradan karar verilmez — sayıya dokunmak Stok'a götürür
- Posta kodu listeleri uzayabilir (FR + DE); çok kodlu bölge girişinde toplu giriş/tarama işlevsel bir ihtiyaçtır
- Kapatma gibi sonucu geniş bir eylem telefonda kazara verilebilecek bir karar olmamalı
- Kod ve adres kopyalanabilir olmalı — ikisi de sistem dışına elle taşınır
