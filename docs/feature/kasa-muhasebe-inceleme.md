# Kasa ve muhasebe incelemesi: bulgular

`kasa-muhasebe.md` 13. karar gereği (07.10) iki ajan Hiboutik kasa entegrasyonunu ve muhasebe sistemini birbirinden bağımsız
inceledi. İki raporun 19 bulgusu (3'ü ortak) 16 maddeye indi; her madde kodda zinciriyle doğrulandı. Maddeler kullanıcıyla tek
tek konuşulur; karar ve sonuç maddenin altına yazılır.

**Durumlar:** Konuşulacak · Açıklandı · Ölçüldü · Kabul, yapılacak · Önlem alındı · Yapıldı

| # | Bulgu | Ağırlık | Durum |
|---|---|---|---|
| 1 | Araç satışı ana deponun kasa gününü kilitliyor | Yüksek | Yapıldı |
| 2 | Onaylı işletme müşterisinden KDV alınmıyor | Yüksek | Kabul, yapılacak |
| 3 | Çok kutulu hazırlık kasaya sahte iade ve yeniden satış yazıyor | Orta | Kabul, yapılacak |
| 4 | Yerinde satış bağlantı koparsa iki kez yazılabiliyor | Orta | Önlem alındı |
| 5 | Kart iadesi sonradan başarısız olursa bizde yapılmış görünüyor | Orta | Yapıldı |
| 6 | Onaysız şirkette ve işletme kargosunda KDV aktarımda iki kez sayılıyor | Orta | Konuşulacak |
| 7 | Şirket kârında kart komisyonu iki kez düşülüyor | Orta | Konuşulacak |
| 8 | Gece yarısına sarkan kasa yazımı iki günde kalıcı fark bırakıyor | Orta | Konuşulacak |
| 9 | İki kasa arasındaki nakit transferi kasaya tek taraftan yazılıyor | Orta | Konuşulacak |
| 10 | Kendi başlattığımız iade Revolut bildirimiyle yarışırsa iki kez yazılabiliyor | Düşük | Konuşulacak |
| 11 | Kapıda kart komisyonu yazılmıyor, kâr onu sıfır sayıyor | Düşük | Konuşulacak |
| 12 | İptal edilmiş siparişe gelen geç ödeme defterde iz bırakmıyor | Düşük | Konuşulacak |
| 13 | Hediye siparişin değeri aktarıma 0 € gidiyor | Düşük | Konuşulacak |
| 14 | Revolut'a giden iade anahtarı kırpılıyor | Düşük | Konuşulacak |
| 15 | Para ekranının yöntem dökümü siparişin son yönteminden okunuyor | Düşük | Konuşulacak |
| 16 | İşlenirken süreci kapanan bildirim bir daha işlenmiyor | Düşük | Konuşulacak |

**İnceleme dışı not:** şirket kârı dönemin para hareketlerini tek istekte okuyor (`money.service.ts:364`); yerel okuma tavanı
1000 satır (`supabase/config.toml:18`), tavanı aşan dönemde toplam eksik çıkar. Sunucunun tavanı ölçülmedi.

## 1. Araç satışı ana deponun kasa gününü kilitliyor

**Durum:** Yapıldı (07.10) · **Ağırlık:** yüksek · iki ajan da buldu

- **Mevcut durum:** Aracın kendi kasa mağazası yok; araç satışının fişi aracın bağlı olduğu ana deponun Hiboutik mağazasına
  yazılır. Gece karşılaştırması ise "olması gereken" satışları siparişin deposuna göre toplar ve araç satışının deposu araçtır.
- **Problem:** İki taraf aynı satışı farklı depoya sayar. İlk araç satışında ana deponun günü "kasada fazla satış" farkıyla
  kapanmaz; fark kendiliğinden düzelmez, kapanmayan gün düzelene kadar sonraki günler de kapanmaz. Pennylane yalnız kapanmış
  günü aldığı için tesisin satışları muhasebeye gitmez; kaybolmazlar, Hiboutik'te bekler ve günler kapanınca birlikte giderler.
- **Olması gereken:** Satışın yazıldığı yer doğrudur: araç tesise aittir, fişi de tesisin kasasına gider. Yalnız gece
  karşılaştırması aynı "araç → tesis" kuralını kullanır ve araç satışını tesisin listesine koyar.
- **Senaryo:**
  1. Kurye, Strasbourg tesisine bağlı aracından 12,50 € nakit satış yapar.
  2. Sipariş aracın depo kaydına yazılır, fiş tesisin Hiboutik mağazasına gider; tesisin günlük Z raporunda 12,50 € görünür.
  3. Gece 00:15'te iş, günü kapatmadan önce Hiboutik'i bizim kayıtlarla karşılaştırır; tutmayan günü kapatmaz, çünkü Hiboutik'te
     kapanan gün düzeltilemez. Bizim listemiz tesisin siparişlerinden oluşur ve araç satışını içermez, kasada ise 12,50 € vardır.
     Sonuç "kasada 12,50 € fazla"; gün kapatılmaz.
  4. Ertesi gece aynı fark yine çıkar. Hiboutik'te bir günü kapatmak önceki açık günleri de kapattığı için sonraki günler de
     kapatılmaz; 7 gün sonra "daha eski kapanmamış gün" uyarısı başlar, Pano her gün fark gösterir.
  5. Pennylane kapanmamış gün için "POS still open" der; düzeltilene kadar tesisin satışları muhasebeye gitmez.
- **Çözüm (07.10):** Karşılaştırma, mağazaya satışı yazılan depoların listesini alır: tesisin kendisi ve kendi mağazası olmayan
  araçları. Liste fişi yazan kuraldan türer; kural ikinci bir yerde yazılmaz.
- **Ek:** Ana deposu tanımlanmamış araçta satış hiçbir mağazaya yazılamaz ve kuyrukta süresiz bekler.
- **Kanıt:** `supabase/migrations/0059_register.sql:296` (beklenen taraf: siparişin deposu) · `:313` (yazılan taraf: fişin
  deposu) · `packages/application/src/register/sync.ts:266-271` (araç → ana depo) · `order/on-site-sale.ts:144` ·
  `register/day-end.ts:109`.

## 2. Onaylı işletme müşterisinden KDV alınmıyor

**Durum:** Kabul, yapılacak (07.10) · **Ağırlık:** yüksek

- **Mevcut durum:** İşletme fiyatı KDV hariç tutulur (DOMAIN §5), sipariş toplamı da KDV hariçtir. Online ödemede çekilen,
  kapıda istenen ve vadeli borca yazılan tutar bu toplamdır; KDV hiçbir yerde eklenmez.
- **Problem:** Yurt içi her işletme satışında %5,5 ya da %20 KDV müşteriden alınmaz; muhasebe aktarımı ise satışı KDV'li
  gösterir. Havaleyle KDV'li tutar gelirse sipariş fazla ödenmiş görünür.
- **Olması gereken:** Müşteriden istenen tutar KDV hariç toplam artı KDV'dir; ters yükümlülükte (doğrulanmış AB vergi numarası)
  KDV yoktur. Online ödeme, kapıda tahsilat, vadeli borç ve ödeme durumu aynı tutardan türer. 6. maddeyle birlikte ele alınır.
- **Kanıt:** `packages/application/src/order/checkout-options.ts:123` · `order/checkout-session.ts:104` ·
  `packages/domain-core/src/payment/payment-status.ts:115-149` · `packages/application/src/courier/door-payment.ts:39-47`.

## 3. Çok kutulu hazırlık kasaya sahte iade ve yeniden satış yazıyor

**Durum:** Kabul, yapılacak (07.10; çözüm kullanıcının önerisi) · **Ağırlık:** orta

- **Mevcut durum:** Online ödeme gelince para alınmıştır ve kanun gereği hemen kasaya yazılır (18. karar): sipariş edilen
  kalemlerle bir fiş açılıp kapatılır, kasada taslak yoktur. Kapanmış fiş değişmez; sonraki her değişiklik yeni bir düzeltme
  fişidir. Hiboutik fişi müşterinin ücretlendiği kalemleri yansıtır; hazırlıkta eksik çıkan kalem düzeltme fişiyle düşülür ve
  bu doğru davranıştır. "Hazırlık bitti mi" sorusunun cevabı tek bir kuraldan gelir: sipariş hazırlıktaysa ve en az bir kalem
  toplanmışsa hazırlık bitmiş sayılır. Kutu akışında ise her mühür yalnız o kutunun kalemlerini "toplandı" diye yazar.
- **Problem:** İlk kutu mühürlenince öteki kalemler hiç toplanmamış görünür; dakikalık kasa işi onları "eksik çıktı" sayıp
  Hiboutik'e iade fişi yazar, ikinci kutu mühürlenince aynı kalemleri yeniden satar. Para hareketi yazılmaz, Kasa hesabı ve
  iade akışı etkilenmez; ama Hiboutik'te silinemeyen iki fazla kayıt kalır ve kutular farklı günlerde mühürlenirse iki günün Z
  raporu yanlış olur. Aynı kural hazırlık sürerken siparişi ekranda geçici olarak "iade bekliyor" gösterir.
- **Neden:** Kural 29.07'de, hazırlığın tek adımda (bütün kalemler birden) yazıldığı dönemde kuruldu. Kutu akışı 22.08'de geldi
  ve hazırlığı kutu kutu yazmaya başladı; kural buna göre güncellenmedi.
- **Kapsam:** Fişi ödeme anında açılan, yani online peşin ödenmiş ve birden çok kutuya bölünen siparişler.
- **Olması gereken (kullanıcının önerisi, 07.10):** Ödeme fişi kanun gereği ödeme anında yazılmaya devam eder. İçerik
  düzeltmesi sipariş depodan çıkınca yazılır: araca yükleme, kargo firmasına teslim ya da gel-alda müşteriye teslim. "Hazır"
  yeterli değildir, çünkü hazır siparişin kutusu hâlâ yeniden açılabilir; araca binen kutu açılamaz (`0048_order_box.sql:231`).
  Ekrandaki ödeme durumu "hazır" anına bakmaya devam eder; hazırlık sürerken "iade bekliyor" görünmez.
- **Kanıt:** `packages/domain-core/src/order/status-machine.ts:54-58` · `register/plan.ts:164-173` ·
  `supabase/migrations/0048_order_box.sql:143` · `0059_register.sql:264-266` · kural `4d2c94c8` (29.07), kutu akışı `c07bc262`
  (22.08).

## 4. Yerinde satış bağlantı koparsa iki kez yazılabiliyor

**Durum:** Önlem alındı (07.10) · **Ağırlık:** orta

- **Mevcut durum (önlemden önce):** Kapı ve araç satışı isteği kimlik taşımıyordu; sunucu her isteği yeni satış sayıyordu.
  Cevap telefona ulaşmazsa ekran "Bağlantı yok — satış yazılmadı" diyor, sepeti koruyor ve hat gelince aynı sepetle yeniden
  göndermeyi bekliyordu.
- **Problem:** Satış sunucuda yazılmış ama cevabı yolda kaybolmuşsa yeniden gönderim ikinci satışı açar: stok iki kez düşer,
  çekmece iki tahsilat bekler, Hiboutik'e silinemeyen ikinci satış gider.
- **Olasılık:** Üç şart birlikte gerekir: istek sunucuya ulaşır, sunucu satışı yazarken telefonun bağlantısı kopar, kurye hat
  gelince yeniden basar. Araçta sinyal kaybı olağan olduğu için seyrek ama zor bir senaryo değil; ekranın "satış yazılmadı"
  cümlesi kuryeyi yeniden basmaya yönlendiriyordu. Sunucunun satışı yazma süresi, yani aralığın uzunluğu ölçülmedi.
- **Önlem:** Telefon her satış için bir kimlik üretir; aynı sepet yeniden gönderildikçe aynı kimlik gider, sepet ya da tahsilat
  türü değişince yeni kimlik doğar. Sunucu aynı kimliği ikinci kez görünce yazılmış satışı döner, yarıda kalmışsa aynı satışı
  tamamlar; ikinci satış açılmaz. Ekran cümlesi: "Bağlantı koptu. Hat gelince aynı sepetle yeniden tamamlayın; satış iki kez
  yazılmaz."
- **Kanıt:** `packages/types/src/contracts/sale-api.schema.ts` (`idempotencyKey`) · `packages/application/src/order/on-site-sale.ts`
  (`sellOnSite`) · `apps/mobile-operations/src/screens/sale/use-sale.hook.ts` (`saleKey`).

## 5. Kart iadesi sonradan başarısız olursa bizde yapılmış görünüyor

**Durum:** Yapıldı (07.10) · **Ağırlık:** orta

- **Mevcut durum:** Revolut kart iadesini ayrı bir "iade siparişi" olarak açar ve sonucunu sonradan bildirir. Biz iade açıldığı
  anda deftere "iade yapıldı" yazıyor, Hiboutik'e iade fişi gönderiyoruz; iadenin başarısız olduğunu bildiren olayları yok
  sayıyoruz.
- **Problem:** Revolut'ta başarısız olan iade bizde yapılmış görünür: müşteriye para dönmemiştir ama defter ve Hiboutik dönmüş
  der, hiçbir ekranda iz kalmaz.
- **Ölçüm:**
  - 06.10 sandbox: iade isteğine Revolut 201 döndü, iade siparişi o anda `processing` (işleniyor) durumundaydı ve 5 sn içinde
    `completed` oldu. "Yapıldı" yazdığımız anda iade henüz sonuçlanmamıştır (`.test-results/revolut/olcum/a4-iade.json`).
  - Revolut belgesi: iade siparişi de sipariş şemasını taşır; durumlarından biri `failed` (başarısız).
  - 07.10: ölçülen gerçek iade siparişi `failed` yapılıp olay çözücüye verildi. `ORDER_PAYMENT_FAILED`,
    `ORDER_PAYMENT_DECLINED`, `ORDER_FAILED` ve `ORDER_CANCELLED` olaylarının dördü de "yok sayıldı"; tamamlanma olayı doğru
    işlendi. İade isteğinin cevabı `failed` durumla gelse bile çağrı hata vermiyor ve iade "yapıldı" yazılıyor
    (`.test-results/kasa-inceleme/iade-basarisiz-olcum.mts`).
  - Sandbox'ta iadeyi başarısız yaptırmanın yolu bulunmadı; başarısızlık dalı yalnız yukarıdaki gibi sınandı.
- **Ödeme tarafında aynı açık var mı:**
  - Online kart ödemesi yalnız Revolut `completed` dediğinde yazılır: bildirim yolu yalnız tamamlanma olayını işler,
    zamanlayıcının mutabakatı tutarı yalnız `completed` durumda sayar. Reddedilen kart (06.10 sandbox:
    `ORDER_PAYMENT_DECLINED`, sipariş `pending`te kalır) yazılmaz.
  - Kapıda kart: operasyon uygulamasının Revolut bağlantısı yok (Tap to Pay açık iş); kuryenin "kartla alındı" beyanı
    yazılır, sistem doğrulamaz.
  - Tamamlanmış ödemenin bankaca geri alınması (itiraz, chargeback) işlenmiyor; `kasa-muhasebe.md` §6 Revolut açık
    kalanlarında.
- **Çözüm (07.10, basit yol):** İade açıldığı anda yazılmaya devam eder; düşerse geri alınır.
  - Revolut iadeyi açılışta düşürürse iade yazılmaz; operatör "iade yapılamadı" görür.
  - İade sonradan düşerse Revolut'un bildirimi bizdeki iade kaydının karşısına aynı tutarda ters kayıt yazar (iade kaydı
    tahsilat koruması gereği silinmez). Sipariş yeniden "iade bekliyor" olur, iz hata kaydına düşer, operatör iadeyi yeniden
    dener; Hiboutik'e de aynı ters kayıt gider.
  - Bunun için Revolut bildirim aboneliğinde `ORDER_PAYMENT_DECLINED` ve `ORDER_PAYMENT_FAILED` olmalı; test sunucusunun
    kaydına 07.10'da eklendi (imza anahtarı değişmedi), canlı kayıt altı olayla yapılır.
  - "İade tamamlanınca yazılsın" yolu seçilmedi: bekleyen iade kavramı ve kayıp bildirime karşı yedek zamanlayıcı isterdi.
- **Kanıt:** `apps/web/lib/order/revolut-event.ts:55-58, 72` · `packages/application/src/order/revolut.ts:151-169` ·
  `order/refund.ts:325-345` · `kasa-muhasebe.md` §6 Revolut İade satırı.

## 6. Onaysız şirkette ve işletme kargosunda KDV aktarımda iki kez sayılıyor

**Durum:** Konuşulacak · **Ağırlık:** orta

- **Mevcut durum:** Onaysız şirketin siparişi işletme kanalına yazılır ama fiyatı perakende (KDV dahil) tabandan gelir
  (DOMAIN §10). Kargo ücreti herkes için KDV dahil hesaplanır. Aktarım işletme kanalında KDV'yi tutarın üstüne ekler.
- **Problem:** Bu iki tutarda KDV iki kez sayılır: 52,75 € ödeyen onaysız şirket aktarımda 55,65 € görünür (doğrusu 50,00 € +
  2,75 € KDV), 11,90 € kargo 12,55 € olur. KDV beyanının girdisi ve kâr cirosu şişer.
- **Olması gereken:** Kalem ve kargo siparişin kanal tabanında saklanır; işletme siparişinde perakende fiyat KDV hariçe çevrilir.
- **Kanıt:** `packages/application/src/order/checkout-draft.ts:215, 554` · `catalog/pricing-viewer.ts:44-47` ·
  `order/shipping-selection.ts:13-17` · `packages/domain-core/src/accounting/line.ts:45-55`.

## 7. Şirket kârında kart komisyonu iki kez düşülüyor

**Durum:** Konuşulacak · **Ağırlık:** orta

- **Mevcut durum:** Online kart komisyonu hem gider hareketi olarak hem siparişin komisyon alanına yazılır. Sipariş kârı
  komisyon alanını düşer; şirket kârı dönemin bütün gider hareketlerini genel gider sayar.
- **Problem:** Her online kart ödemesinin komisyonu şirket kârından iki kez düşülür. İç rapordur, resmî muhasebeyi etkilemez.
- **Olması gereken:** Komisyon bir kez düşülür: ya genel giderden komisyon hareketi ayrılır ya da sipariş kârında sayılmaz.
- **Kanıt:** `apps/web/lib/order/payment-webhook.ts:122-141` · `packages/domain-core/src/accounting/profit.ts:96-109` ·
  `apps/web/lib/accounting/profit.ts:91-93`.

## 8. Gece yarısına sarkan kasa yazımı iki günde kalıcı fark bırakıyor

**Durum:** Konuşulacak · **Ağırlık:** orta

- **Mevcut durum:** Dakikalık kasa işi turun başında saati bir kez alır ve turdaki bütün kayıtlara "yazıldığı an" olarak onu
  yazar. Gün sonu bizim tarafı bu ana göre, Hiboutik tarafını satışın kasada kapandığı güne göre sayar.
- **Problem:** 23:59'da başlayan tur bir satışı 00:00'dan sonra kapatırsa satış bizde önceki güne, kasada sonraki güne sayılır;
  iki günde de kalıcı fark çıkar ve 1. maddedeki kapanmama zinciri başlar. Seyrektir.
- **Olması gereken:** Kaydın günü, Hiboutik'in satışı kapattığı andan alınır.
- **Kanıt:** `packages/application/src/register/sync.ts:60-64, 336, 346, 430, 545, 556` · `register/day-end.ts:189-229`.

## 9. İki kasa arasındaki nakit transferi kasaya tek taraftan yazılıyor

**Durum:** Konuşulacak · **Ağırlık:** orta

- **Mevcut durum:** Hesaplar arası nakit transferi kasaya tek kayıt olarak yazılır: hareketin kendi hesabının mağazasına, o
  yoksa karşı hesabınkine.
- **Problem:** İki tarafı da kasa mağazasına bağlı iki çekmece arasında transfer olursa yalnız bir kasaya yazılır; ötekinin günü
  kapanmaz. Bugün tek kasa var, depo ağı kurulunca gerçekleşir.
- **Olması gereken:** İki taraf da bağlıysa birine çıkış, ötekine giriş yazılır.
- **Kanıt:** `packages/application/src/register/sync.ts:500-507` · `supabase/migrations/0059_register.sql:300-307` ·
  `0018_money.sql:526-535`.

## 10. Kendi başlattığımız iade Revolut bildirimiyle yarışırsa iki kez yazılabiliyor

**Durum:** Konuşulacak · **Ağırlık:** düşük

- **Mevcut durum:** Kart iadesinde önce Revolut çağrılır, sonra hareket yazılır. "İade tamamlandı" bildirimi gelince o ödemeye
  bağlı iadeler toplanır ve eksik varsa "panelden yapılmış iade" olarak yazılır.
- **Problem:** Bildirim bizim hareketimiz yazılmadan işlenirse aynı iade iki kez yazılır. Aralık iade cevabı ile hareket yazımı
  arasındaki kısa süredir; ölçülmedi.
- **Olması gereken:** İki yazım aynı iade siparişinin kimliğinde birleşir. 5. maddenin çözümüyle birlikte ele alınır.
- **Kanıt:** `packages/application/src/order/refund.ts:328-345` · `apps/web/lib/order/payment-webhook.ts:147-181`.

## 11. Kapıda kart komisyonu yazılmıyor, kâr onu sıfır sayıyor

**Durum:** Konuşulacak · **Ağırlık:** düşük

- **Mevcut durum:** Kapıda kart ödemesinde komisyon yazılmaz; nakitte de alan boş kalır. Kâr hesabı boş komisyonu sıfır sayar ve
  siparişi "maliyeti bilinen" gösterir.
- **Problem:** Kapıda kartla alınan siparişin kârı komisyon kadar şişkin görünür; "bilinmeyen değer sıfır değildir" kuralına
  aykırıdır.
- **Olması gereken:** Nakitte komisyon 0 yazılır; kapıda kartta bilinmiyorsa sipariş "maliyeti eksik" görünür. Tap to Pay
  komisyonu canlıda ölçülecek (`kasa-muhasebe.md` §6).
- **Kanıt:** `packages/domain-core/src/accounting/profit.ts:98-106` · `packages/application/src/courier/delivery.ts:149-161`.

## 12. İptal edilmiş siparişe gelen geç ödeme defterde iz bırakmıyor

**Durum:** Konuşulacak · **Ağırlık:** düşük

- **Mevcut durum:** İptal edilmiş ya da stoğu kalmamış siparişe sonradan gelen kart ödemesi Revolut'tan iade edilir; defterde ne
  tahsilat ne iade yazılır, komisyon da yazılmaz.
- **Problem:** Para Revolut'a girip çıktığı hâlde defterde iz yoktur. 06.10 sandbox'ta komisyon iadeyle geri dönmedi; canlıda da
  öyleyse Merchant bakiyesi komisyon kadar kayar. Bu ödemenin kasaya yazılıp yazılmayacağı yasal bir sorudur.
- **Olması gereken:** Konuşulacak.
- **Kanıt:** `packages/application/src/order/confirm-payment.ts:48-62` · `apps/web/lib/order/payment-webhook.ts:111-114`.

## 13. Hediye siparişin değeri aktarıma 0 € gidiyor

**Durum:** Konuşulacak · **Ağırlık:** düşük

- **Mevcut durum:** Hediye siparişin kalemleri 0 € fiyatla yazılır; aktarımın hediye satırı bu sıfır fiyatlı kalemleri toplar.
- **Problem:** Muhasebeciye "N satış, TTC 0" gider; ikramın değeri yoktur ve hediye gideri işlenemez (karar 11).
- **Olması gereken:** Aktarım hediyenin maliyetini, bilgi için liste fiyatını taşır.
- **Kanıt:** `packages/application/src/order/checkout-draft.ts:260-263` · `packages/domain-core/src/accounting/export.ts:176-187` ·
  `apps/web/lib/accounting/export.ts:78`.

## 14. Revolut'a giden iade anahtarı kırpılıyor

**Durum:** Konuşulacak · **Ağırlık:** düşük

- **Mevcut durum:** İade anahtarı sipariş kimliği, sıra ve tutardan kurulur; tutar zaten cent olduğu hâlde 100'le bir kez daha
  çarpılır. Revolut'a giderken anahtar 50 karakterde kesilir ve tutardan yalnız 4 hane kalır.
- **Problem:** Aynı siparişte aynı sıradaki iki farklı iade (ör. 15,00 € ve 150,00 €) aynı anahtarı alır. İlk iade geçip
  hareket yazılamazsa yeniden denemede Revolut ilk iadeyi döner ya da reddeder.
- **Olması gereken:** Anahtar 50 karaktere sığacak biçimde kurulur, tutar cent olarak bir kez girer.
- **Kanıt:** `packages/application/src/order/refund.ts:357-361` · `order/revolut.ts:164`.

## 15. Para ekranının yöntem dökümü siparişin son yönteminden okunuyor

**Durum:** Konuşulacak · **Ağırlık:** düşük

- **Mevcut durum:** Para ekranındaki "bugün yöntem başına" dökümü her tahsilatın yöntemini siparişe en son yazılan yöntemden
  okur; hareketin kendi yöntemi var ama okunmaz. Bekleyen kalan da iade ve eksik karşılamayı saymaz.
- **Problem:** 10 € online kapora ve 25 € kapıda nakit ödenen sipariş ekranda 35 € nakit görünür. Yalnız gösterimdir.
- **Olması gereken:** Döküm hareketin yönteminden, kalan ödeme durumu türetiminden okunur.
- **Kanıt:** `packages/application/src/accounting/money.ts:45-67`.

## 16. İşlenirken süreci kapanan bildirim bir daha işlenmiyor

**Durum:** Konuşulacak · **Ağırlık:** düşük

- **Mevcut durum:** Bildirim işlenmeye başlarken kaydedilir; hata olursa hata yazılır ve tekrar gelen bildirim yeniden işlenir
  (KALAN 18.3 düzeltmesi). Süreç işlerken kapanırsa kayıt "işleniyor" hâlinde kalır.
- **Problem:** Revolut'un tekrar gönderimleri "zaten işleniyor" sayılıp atlanır; aktarım ya da panelden yapılan iade sessizce
  kaybolur. Dağıtım anında sunucunun yeniden başlaması yeter.
- **Olması gereken:** Belli bir süreden uzun "işleniyor" kalan bildirim yeniden alınabilir.
- **Kanıt:** `packages/database/src/services/webhook-event.service.ts:29`.
