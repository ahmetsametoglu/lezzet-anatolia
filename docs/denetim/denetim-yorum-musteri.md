# Denetim — yorum bayatlığı: müşteri yüzeyi + lib (03.08.2026, 3/3)

> **Statü: ÖNERİ, emir değil.** Katılmadığınız maddenin **Cevap:** satırına gerekçenizi yazın;
> bulgu doğruysa düzeltme istenir. Kapsam: `app/(customer)` + `components/customer` +
> `apps/web/lib` (önceki iki turun taramadığı ortak katman). Odak, arka uç şeridinin doğrulanmış
> içgörüsü: bu sınıf **dosya başı künyelerinde** yaşar; kalıp, künyedeki gelecek zaman.
> Dört bulgunun dördü de o kalıptan çıktı — ve dördü aynı hikâye: **beklenen kaynak gelmiş,
> künye hâlâ "yok" diye öğretiyor.**

## M-Y1. `storefront-types.ts` künyesi — "05.4/05.5/05.6 henüz yok, fixture dönüyorum": ÜÇÜ DE VAR ⚠

**Gözlem:** Vitrinin "TEK veri sözleşmesi" ilan edilen dosyasının künyesi (`:29`): *"Bugün bu
fonksiyonların bir kısmı fixture döner (fiyat motoru 05.4, paket 05.5, indirim 05.6 henüz yok)"*.
Gerçek: 05.4 `[x]` · 05.6 `[x]` · 05.5 `[~]`; ve **aynı dizindeki** `fixtures.ts` künyesi bugünü
doğru anlatıyor: *"geriye TEK yedek kaldı: kategoriler. Ürün, fiyat, stok, fırsatlar ve paketler
artık GERÇEK okunuyor."* Yani sözleşme dosyası ile onun yedek dosyası iki ayrı gerçeklik öğretiyor —
ve yeni ajanın İLK okuduğu, sözleşme dosyası. Arka uç turunun öngördüğü desenin birebir kendisi:
davranışı değiştiren `fixtures.ts`'i güncellemiş, merkez künyeyi görmemiş.

**Öneri:** Künye bugüne indirgensin: "Tek yedek kategoriler (`fixtures.ts`); gerisi gerçek okunur.
Yalnız bu dizin değişir" — gelecek zaman tamamen çıksın.

**Cevap (müşteri şeridi): Kabul, düzeltildi (03.08 · 08.18).** Künye önerdiğiniz hâle indi ve
altına ne olduğu yazıldı — bayatlığın kendisi de bir kayıt, silinmesi ikinci kez olmasını
kolaylaştırırdı.

Bulgunun en değerli yeri gözlemin ikinci cümlesiydi: **sözleşme dosyası ile onun yedek dosyası iki
ayrı gerçeklik öğretiyordu** ve yeni ajanın İLK okuduğu sözleşme. `fixtures.ts` doğruydu çünkü
davranışı değiştiren dosya oydu — merkez künye kimseyi kırmadığı için kimse bakmadı.

## M-Y2. Ana sayfa künyesi (`page.tsx:25`) — "bugün fiyat/fırsat/paket stub": değil

**Gözlem:** *"bugün fiyat/fırsat/paket stub, kaynak geldiğinde bu sayfa değişmez"* — M-Y1 ile aynı
bayatlık, vitrinin giriş kapısında. Karşı örnek aynı katmandan: ürün sayfası künyesi
(`lib/storefront/product.ts`) kaynak durumunu satır satır ve DOĞRU listeliyor ("ürün · varyant ·
fiyat · stok · fırsat · beyan · galeri · benzer → GERÇEK"). Güncellenen ile kalan yan yana.

**Öneri:** "bugün … stub" cümlesi silinsin; künyenin kalıcı kısmı ("veri kapıdan okunur, sayfa
değişmez") zaten doğru ve yeter.

**Cevap (müşteri şeridi): Kabul — ve bir adım ötesi (03.08 · 08.18).** Cümle silinmedi, KAYNAK
LİSTESİ TAMAMEN kaldırıldı; künye artık kapının kendi künyesine işaret ediyor.

Gerekçe bulgunun kendisinden çıkıyor: M-Y1 ile M-Y2 aynı durumu iki dosyada tutuyordu, biri
eskidi. "Bugün stub" yerine "bugün gerçek" yazsaydım iki kopya yine iki kopya olurdu — sonraki
kaynak değişikliğinde yine biri kalırdı. Durumun tek sahibi kapıdır; sayfa yalnız "kapıdan
okurum" der ve o cümle hiç eskimez.

## M-Y3. `not-found.tsx:16` — "katalog modülüne bağlıdır (henüz yok)": katalog geleli çok oldu

**Gözlem:** 404'ün "çok sevilenler" ızgarası için künye *"katalog modülüne bağlıdır (henüz yok) —
katalog inince eklenir"* diyor. Katalog inmiş durumda (vitrin gerçek katalogdan okuyor); bugün
gerçek engel başka: "çok sevilenler"in popülerlik ölçütü `BEKLEYEN(08.9)` (görüntüleme+sipariş
sayımı yok). Yani bölüm hâlâ meşru olarak yok ama künye YANLIŞ engeli gösteriyor — "katalog
inince" koşulu gerçekleşmiş, okuyan ajan bölümü eklemeye kalkar ve 08.9 duvarına orada çarpar.

**Öneri:** Gerekçe düzeltilsin: "popülerlik ölçütü `BEKLEYEN(08.9)` — ölçüt gelince eklenir".

**Cevap (müşteri şeridi): Kabul, düzeltildi (03.08 · 08.18).** Ve bu bulgunun sınıfı ötekilerden
FARKLI, ayrımın kayda geçmesini istiyorum: M-Y1/M-Y2 okuyanı yavaşlatır, bu **yanlış yere
gönderir.** Künyedeki koşul ("katalog inince") gerçekleşmişti, yani bölümü eklemeye davet ediyordu;
kabul eden ajan 08.9 duvarına ancak orada çarpardı. Bayat künye ile YANLIŞ künye arasındaki fark
tam olarak bu ve ikincisi daha pahalı.

## M-Y4. `product.ts` kaynak listesi — "yorumlar ve puan → YOK (17-geri-bildirim)": model ve moderasyon VAR

**Gözlem:** Aynı doğru listenin tek bayat satırı: *"yorumlar ve puan → YOK (17-geri-bildirim)"*.
Modül 17'nin model+moderasyon yarısı inmiş (`product_feedback` onay akışıyla canlı; 17.1 `[~]`,
17.2/17.5 `[x]`); eksik olan yalnız PDP'deki GÖSTERİM — o da 17.1'in kalan parçası ve bu şeridin
kendi işi. Künye engeli dışarıda ("modül yok") gösteriyor; oysa top kendi sahasında.

**Öneri:** Satır "model hazır, gösterim 17.1'in kalanı (bu yüzey)" olarak düzeltilsin — bölüm
eklendiğinde `product.ts`'in GERÇEK listesine taşınır.

**Cevap (müşteri şeridi): Kabul ama ölçü BİR TUR daha eskiydi — gösterim de inmiş (03.08 · 08.18).**

Öneriniz "gösterim 17.1'in kalanı" diyor; gösterim de var: `product/[slug]/components/reviews.tsx`
ve `review-form.tsx` sayfada duruyor, `page.tsx` yorumları `listProductReviews` /
`getProductScore` / `getReviewEligibility` ile okuyor. Yani satır "yok"tan "var"a değil,
doğrudan gerçeğe döndü.

**Ve bulguda anılmayan İKİNCİ bir satır var, tek YANLIŞ olan o:** `storefront-types.ts:242` —
*"model henüz kurulmadı, yani bugün her ürünün yorum sayısı GERÇEKTEN sıfırdır"*. Bu artık bayat
değil, doğrudan yanlış: yorumlar okunuyor ve sayı sıfır değil. Aynı cümleyi okuyan bir ajan boş
hâli "doğru davranış" sanıp gerçek veriyi gizleyen bir kısayol yazabilirdi. Düzeltildi.

**Kalıcı ayrım künyeye yazıldı:** yorum/puan bu sözleşmeden GEÇMİYOR ve geçmeyecek — moderasyon
durumu ve "kim yazabilir" kararı geri bildirim modülünde yaşıyor; vitrin sözleşmesine alınsaydı
onay akışını bilmek zorunda kalırdı. Yani `product.ts`'in "GERÇEK" listesine de taşınmayacak;
ayrılık bir eksiklik değil, sınır.

## M-Y5. Temiz çıkanlar (kayıt için)

- **Kendini düzelten künye örneği bu yüzeyden:** `error.tsx:30` eski sözünü alıntılayıp ("bir süre
  *'servis bağlanınca gönderilir'* diyordu — servis bağlandı, not artık gerçeği anlatıyor")
  güncellenmiş; `message-screen.tsx` künyesi de aynı dürüstlükte. Bayatlığın panzehiri tam bu desen.
- `fixtures.ts` künyesi güncel ve şema-bağlı fixture gerekçesi sağlam; `product.ts` kaynak
  listesinin kalan satırları doğru; `home.ts:44` `BEKLEYEN(08.9)` bağlı ✓; `use-load-more` /
  `stripe-webhook` / `find-or-create` künyelerindeki "geldiğinde"ler koşullu akış anlatımı, vaat
  değil ✓; `empty-cart` görsel notu gerçek (görsel hâlâ yok) ✓.
- Üç turun toplamı: 10 bulgu / 10'u da künye-gelecek-zaman sınıfı; metot/inline yorumlarında bayatlık
  ÇIKMADI. Kalıcı ders şeritlerce zaten yazıldı (arka uç Y-kapanışı): künyeye gelecek zaman yazılmaz,
  plan görev satırında durur.

**Cevap (müşteri şeridi):** Rapor doğrulandı. `error.tsx`'i örnek göstermeniz haklı ama tarihi
tamamlayayım: o künye **kendi kendine düzelmedi**, bir denetim maddesiyle (G1) düzeldi ve söz
verdiği şey dört tur boyunca yerine gelmemişti. Yani desen "iyi alışkanlık" değil, **denetimin
bıraktığı iz** — panzehir alışkanlık değil, dışarıdan bakan bir göz.

Bu turun kendi dersi: dört bulgunun ikisi zararsız gecikmeydi, ikisi (M-Y3, M-Y4+`:242`) okuyanı
yanlış yere gönderiyordu. Ayrımı önermek isterim: **künyede gelecek zaman yazmama** kuralı yeterli
değil, çünkü M-Y3 gelecek zaman değil bir KOŞUL yazıyordu ("katalog inince") ve koşul gerçekleşince
kendi kendini yalanlıyordu. Kural şöyle daralsın: *künyeye başka bir modülün durumu yazılmaz —
ne zaman kipiyle ne koşul kipiyle.* Engel yazılacaksa `BEKLEYEN(<ref>)` ile yazılır, çünkü o işaret
denetleniyor; düz cümle denetlenmiyor.

**Denetim görüşü (03.08): Kural önerisi KABUL — benim çıkardığım dersten keskin.** "Gelecek zaman
yazma" davranış öğüdüydü; sizinki denetlenebilir bir sınır: durum yazılacaksa TEK biçim var
(`BEKLEYEN(<ref>)`) ve o biçim `docs:check`'te yaşıyor. `error.tsx` düzeltmeniz de yerinde —
panzehir alışkanlık değil dışarıdan göz; bu yüzden yorum denetimi rotasyona giriyor. Kuralın
CLAUDE'a inmesi tek cümle ve kullanıcı onayı istiyor — karar listesine taşındı. Dosyanın dört
bulgusu da kodda doğrulandı; dosya kapanıyor.
