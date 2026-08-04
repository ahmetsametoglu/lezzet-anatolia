# ANALYTICS — Analitik: sınır, olay şekli, saklama

> **Kaynak:** iki tartışma dosyasının (analitik kapsamı + ölçüm haritası, 04.08.2026) kararlaştırılmış
> özeti — üç şerit + denetim yazdı, kararları kullanıcı verdi (04.08). Tartışma dosyaları silindi;
> **referans burasıdır.** Görev durumu burada TUTULMAZ → `docs/build/13-analitik.md` (+ `08.9`).
> Alan listeleri → `data-model/iletisim-geribildirim.md`. Buradaki kurallar 13.1'in kabul ölçütüdür.

## 1. Sınır — analitik nedir, ne değildir

- **Analitik bir TABLO değil, bir SORUDUR.** Ekran birden çok kaynağı birleştirir: **beyan**
  (yorum/puan/beğeni) `ProductFeedback`'ten, **segment/ciro** siparişten, **gezinme** olay
  defterinden okunur. Satırın nerede yaşadığı ayrı, ekranın neyi okuduğu ayrı sorudur.
- **İlke 1 — ölçüm NİYETE bağlanır:** olay sunucu eyleminden atılır, render'dan değil (tek istisna
  `product_view`; bedeli §4'teki kapı ayıklaması). Emsal: `suggestPostalCodes` (okuma, ölçülmez) ↔
  `resolvePlace` (niyet, sayılır) ayrımı.
- **İlke 2 — kalıcı satır bırakan aksiyon analitikte TEKRARLANMAZ:** sipariş, yorum, başvuru,
  `zone_notice`, posta kodu talebi kendi tablosundan sayılır (CLAUDE §1 duplikasyon). Karar sorusu
  mekanik: *sunucuya niyetle mi geldi? geriye kalıcı satır bırakıyor mu?* Niyet var + satır yok →
  olay. **Tek bilinçli istisna `order_placed`:** huniyi defterde kapatmanın öteki yolu oturum
  anahtarını siparişe yazmaktı — istisna mahremiyeti bozan değil, koruyan seçenek (tutar/müşteri
  taşımaz, yalnız "oturum siparişle bitti" der).
- **Kupon:** KULLANIM kendi tablosundan (siparişle kalıcılaşır), DENEME (geçersiz kod, siparişsiz
  geçerli kod) analitikten.
- **Personel gezinmesi ÖLÇÜLMEZ.** Olay defteri yalnız müşteri yüzeyinden yazılır; operasyon
  yüzeyi ölçüm üretmez — iş akışıdır, niyet sinyali değil (ve çalışan izlemeye dönüşür).

## 2. Kimlik — defterde kimlik kolonu YOKTUR (kullanıcı kararı 04.08)

- `analytics_event`'te `customer_id` YOK — nullable bile değil. Gerekçeler: silme anlamı tanımsız
  kalır (cascade geçmiş sayıları değiştirir, set null "anonim" iddiasını çürütür); tek tablo iki
  hukuki dayanak ve iki saklama süresi taşıyamaz; toplanan ama gösterilemeyen veri risktir.
- **Kimlikli davranış defteri ayrı bir tablonun ve ayrı bir hukuki dayanağın işidir** ve ancak
  izin yüzeyi + "verilerimi indir/sil" aracıyla AYNI GÜN doğar (bağ: 09.10). Emsal desen:
  `postal_code_demand` (anonim sayaç) ↔ `zone_notice` (kimlikli, izinli) — aynı olguya iki kayıt.
- **`session_key` günlük dönen tuzla türer:** `hash(günlük_tuz ‖ kırpılmış_ip ‖ ua ‖ site)`.
  Tuz her gün değişir ve **eskisi SAKLANMAZ** (defter psödonimken anonime döner); ham IP hiçbir
  yerde durmaz; oturum ömrü = gün. **Çerezden türetilmez** (mevcut çerezler kesinlikle-gerekli
  muafiyetindedir; analitiğe kullanıldıkları an muafiyet düşer). **Siparişe yazılmaz** — UTM
  sipariş anında `acquisition_source`'a kopyalanır, eşleşme TÜKETİLİR, anahtar atılır.
- **`path` ROTA KALIBI olarak yazılır** (`/product/[slug]`), somut değer asla: `/feedback/[token]`
  oturum yerine geçen bir sırdır, `/orders/[reference]` doğrudan kimliklendiricidir. Sorgu dizesi
  düşürülür; ölçülecek parametre `meta`'ya adıyla girer. (`pushState`'li panel aynı kalıpta kalır
  → sahte `page_view` üretmez.)
- **GDPR silme talebinde olay satırlarına hiçbir şey olmaz** — üç koşul sağlandığı için (kimlik
  yok, tuz dönüyor, rota kalıbı). Dürüst ifade: "tuz döndükten sonra anonim".

## 3. Olay şekli

- **`channel`** (B2C/B2B) — sunucuda çözülü, karışık ölçüm yalan söyler.
- **`place` DEPO granülünde, posta kodu DEĞİL** — `b2b + posta kodu + zaman ≈ tek işletme`
  (k-anonimlik). Posta kodu sorusunun sahibi `postal_code_demand` (kanalsız, yolsuz sayaç);
  "sepeti bölünen/vazgeçen" bölge kırılımı oraya iki sayaç olarak eklenir, deftere değil.
  **Aynı niyet iki kayda yazılıyorsa iki yazım TEK kapıdan çıkar** ve iki sayı birbirinin
  doğrulaması DEĞİLDİR (biri olay düşürür, öteki düşürmez — küçük sapma tasarımdır).
- **`availability` tek enum, anlık görüntü** (`sellable · sold_out · closed · not_here`) —
  görüntüleme anındaki hâl; kaydedilmezse "az alınan" listesinin başına stoksuzlar oturur.
  Emsal: `order_item.unit_price` (snapshot), `rating_breakdown` (ayrı kolonlar değil tek yapı).
- **`subject_type + subject_id` FK'SİZ** (bilinçli: silinen ürünün geçmişi silinmez, geçmiş
  sayılar değişmez) + ürün kırılımı için `product_id` denormalize anlık görüntü.
- **`cart_blocked` / `checkout_blocked` — huninin en değerli olayı; sebep TİPLİDİR:** motordaki
  kararlar (`min_basket · split · place_change · coupon_invalid …`) `packages/types`'ta ayrık
  birlik; serbest metin yasak. `meta` da olay tipine göre Zod ayrık birliğiyle doğrulanır —
  kapalı sözlük, çöp alan değil.
- **`add_to_cart` niyeti İSTEMCİ BEYANIDIR** (sepet ucu eşitleme ucudur, niyet sunucuda yok):
  parametre YALNIZ ölçüme akar, yazma nesnesine tip düzeyinde giremez. Beyan-edilmiş olay
  gözlenen olay değildir — sayısı sepet satırlarıyla tutmaz, bu arıza değildir.
- **Paylaşma sunucu eylemiyle ölçülür** (`shareProductAction` — kullanıcı kararı 04.08):
  istemciden çağrılabilir yazma ucu AÇILMAZ; haritadaki tek istisna olurdu, model istisnasız kalır.
- **Yer kapısı huninin İLK adımıdır:** `place_resolved` — oturumda yer çözülmeden düşen ziyaretçi
  en erken ve muhtemelen en büyük kayıptır; `postal_code_demand` yalnız onaylayanı sayar.
- **UTM: SAYFA görür, kapı YAZAR** *(düzeltme 04.08 — müşteri+arka uç ölçümüyle; ilk metin
  "middleware görür" idi)*: müşteri sayfaları `searchParams`'ı zaten görür ve UTM oturumun ilk
  `page_view`'ıyla kapıya gelir; kapı `analytics_session`'a BİR KEZ kalıcılaştırır, ikinci yazım
  yutulur (ilk kaynak kazanır — `acquisition_source` kuralıyla aynı). Middleware'e dokunulmaz:
  müşteri dalı erken dönüyor ve intl yönlendirmesi üstbilgiyi sessizce düşürebilirdi; DB işi de
  kenar paketine konmaz. Ayrı bir kampanya kapısı da YOK — atıcının iki şeyi hatırlaması
  gerekirdi, biri unutulurdu.
- **UTM KAPALI SÖZLÜKTÜR** (04.08): kapı gelen parametreleri `{source, medium, campaign, content,
  term}`e indirger (`normalizeUtm`) ve üç yazımı da tanır (`utm_source` · `utmSource` · `source`).
  Açık bırakılsaydı reklam aracının linke eklediği her parametre anonim deftere girerdi —
  `gclid`/`fbclid` gibi **tıklama kimlikleri** dâhil; onlar reklam ağının tarafında tek kullanıcıya
  çözülür, yani "defterde kimlik kolonu yok" cümlesi teknik olarak doğru, fiilen yanlış olurdu.
- **`acquisition_source`'u besleyen yer TASLAK SİPARİŞTİR, ödeme oturumu değil** (04.08). Checkout'un
  iki ödeme dalı var ve kapıda/vadeli dal ödeme oturumunu hiç açmıyor; orada beslesek **nakit ve
  vadeli müşterilerin tamamı** kaynağı ölçülmemiş kalırdı — B2B'nin ana yolu tam olarak o dal.
  Eşleşme sipariş anında TÜKETİLİR: oturum anahtarı hiçbir yere yazılmaz, kalan bağ kampanya adıdır.

## 4. Kapı kuralları (yazım tek kapıdan geçer)

- **Kapı düşürür, atıcı bilmez:** `Next-Router-Prefetch` · bot/tarayıcı UA · ISR yeniden üretim —
  üçü de "kimsenin bakmadığı görüntüleme"dir; kural atıcılara dağıtılırsa biri unutur ve payda
  sessizce şişer. Atıcı ne olduğunu söyler, neyin sayılacağına kapı karar verir.
- **Ölçüm asla akışı kesmez:** sonuç beklenmez; hata yutulur ama sessiz değil (emsal:
  `recordDemand`'ın gerekçeli catch'i).
- **`search.query` defterdeki TEK serbest metindir:** `scrubMessage`'dan geçer + normalleştirilir
  (kırp/küçült/tek boşluk) + ~100 karakter tavan. Başka hiçbir olaya serbest metin girmez; adres,
  e-posta, telefon, not gövdesi hiçbir olayda yer almaz. IP saklanmaz (yalnız `country` türetilir).
- **Yetki ayrımı:** oturum hunisi → defter yetkili; sipariş/ciro SAYISI → `order` tablosu yetkili,
  defter asla. Defterdeki sipariş sayısının tablodan az olması arıza değil tasarımdır.
- **Süzgeç sıfır-sonucu ile arama sıfır-sonucu ayrı raporlanır** (aynı olay tipi olabilir): süzgeç
  boşluğu sık bir arayüz sinyalidir, arama boşluğu seyrek bir çeşit sinyalidir; karışırsa sık olan
  seyreği boğar.

## 5. Saklama ve özet mimarisi (kullanıcı kararı 04.08)

- **Ham olay 25 AY** (13 değil: iki tam yılın aynı-ay karşılaştırma penceresi; CNIL "toplanan veri
  ömrü" — yerleşik çerçeve içinde; parametrik: düşürmek mümkün, geri almak imkânsız).
- **Ham tablo AYA GÖRE BÖLÜMLENİR;** süresi dolan veri satır silinerek değil **bölüm düşürülerek**
  gider (toplu DELETE şişkinliği yok). Silen iş 13.1'in parçasıdır — silen iş yoksa "saklama
  süresi" bir cümledir, kural değil. Sıra: günlük özet ÖNCE üretilir, silme SONRA.
- **Günlük özet (`analytics_daily`) SÜRESİZ** ve boyutları ZENGİN: gün × olay tipi × rota × depo ×
  kanal × satılabilirlik. Ekranlar HAM DEFTERE BAĞLANMAZ, özetten okur; ham yalnız detay içindir.
- **Hafta/ay/yıl AYRI TABLO DEĞİL** — günlükten okuma anında türetilir (türetilebilen ikinci kez
  yazılmaz). **Saatlik tablo da YOK:** günlük özet satırı 24 öğeli **saat kırılımı dizisi** taşır;
  ısı haritası (haftanın günü × saat; hafta/ay/yıl pencereleri) her zaman özetten okunur.
- **Özetin TAŞIMADIKLARI (bilinçli sınır):** çapraz saat kırılımı (saat × kanal/depo/ürün — 25 ay
  içinde hamdan sorulur), olay sırası/sekans (saat bazlı huni), gün-aşırı tekil ziyaretçi
  (kimliksizlik kararının zaten tanımsız kıldığı sayı). Özetten çıkmayan sayı "analitik bozuk"
  değildir; sınır budur. **Ayrım (04.08, operasyonun sorusu üzerine):** "özet taşımaz" ≠ "rapor
  imkânsız" — kaynağı başka olan bloklar KALICI SINIR DEĞİL, ayrı özetlerin işidir ve indiler
  (0036): trafik kaynağı → `analytics_daily_source` · aranıp bulunamayan → `analytics_daily_search`
  · çok bakılıp az alınan → `analytics_daily_product` (satılabilir-görüntülenme paydasıyla) ·
  günlük tekil oturum → ayrı sayım (gün-AŞIRI tekil ise kalıcı sınırdır). Üçü ayrı tablo çünkü
  ürünü/terimi `analytics_daily`'ye boyut olarak eklemek satır sayısını katalogla çarpardı.
  **Arama özeti `search.query`'nin ikinci yaşama yeridir** (scrub'lanmış hâliyle) ve bu yüzden
  günlük özetin "süresiz" kuralından AYRILIR: oturum künyesiyle birlikte ham defterin 25 ayına
  tabidir (`purge_analytics_before`).
- **Kapıları sırada olan bloklar İNDİ (04.08) ve üçü de AYRI ÖZET oldu, ham okuma değil.** Yukarıdaki
  ayrımda *"aranıp bulunamayan listesi ham defterden"* yazıyordu; kasıt "kaynağı `analytics_daily`
  değil" idi ve o kısım aynen geçerli. Ama okumayı hama bağlamadık, çünkü **ham okuma iki yerden
  çürür**: her açılışta ayın tüm bölümünü tarar, ve 25 ay dolunca listenin geçmişi sessizce kısalır.
  Yerine üç dar özet: `analytics_daily_product` (gün × ürün) · `analytics_daily_search`
  (gün × terim × sıfır-sonuç kovası) · `analytics_daily_source` (gün × kaynak × kampanya).
  **`analytics_daily`'ye BOYUT olarak eklenmediler** — satır sayısını katalog büyüklüğüyle ve arama
  çeşitliliğiyle çarparlardı; huni/ısı/seri okumaları da o şişmiş tabloyu taramak zorunda kalırdı.
- **Kaynak dökümü OTURUM tablosundan değil DEFTERDEN üretilir.** `analytics_session` yalnız künyeli
  gelişte satır açar; oradan sayılsaydı **doğrudan gelen ziyaretçi dökümde hiç görünmez** ve her
  kaynağın payı olduğundan büyük çıkardı. Özet defterin oturumlarını sayar, künyeye sol birleşimle
  bakar; `source is null` gerçek bir kovadır.
- **Sayı özetleri süresiz, SERBEST METİN özeti değil:** `analytics_daily_search` ham defterle aynı
  25 ayı yaşar (`purge_analytics_before`). Süresiz saklamak, ham metnin ömrünü özet kılığında
  sonsuza uzatmak olurdu. Aynı süpürme `analytics_session`'ı da alır — tablo bölümlenmemiş, yani
  bölüm düşürmek oraya işlemiyor ve künyesi kalan bir oturum "defteri sildik" cümlesini yarım bırakır.
- **Terk sebebi GÜNLÜK ÖZETİN boyutudur** (04.08 düzeltmesi). Yalnız ham defterde durduğu sürece
  huninin en değerli kolonu hiçbir ekrana ulaşmıyordu: *"checkout'ta %38 düşüyor"* tek başına aksiyon
  üretmez, *"%38'in yarısı asgari sepet"* üretir.
- **AI içgörüye (13.7) HAM SATIR GİTMEZ, ÖZET GİDER** — sözleşme maddesi, tercih değil. **Artık bir
  tiple zorlanıyor:** `AnalyticsInsightInput` yalnız toplanmış sayı taşır; satır geçiremez.

## 6. Ekran yerleşimi (kullanıcı kararı 04.08)

- **"Bölge dışı talep — posta kodları" tablosu DEPOLAR ekranındadır** (karar orada veriliyor);
  analitikte yalnız işaret + köprü.
- **Pazarlama kişi listesi MÜŞTERİLER ekranındadır;** analitikte sayı + `customersUrl` köprüsü —
  analitik "kaç" der, Müşteriler "kim" der; kişi bazlı gezinme ekranı yoktur.
- Ekran önce defterden bağımsız bloklarla iner (beyan · posta kodu talebi · kampanya gideri ·
  segmentler); gezinme blokları 13.1 inince eklenir. Raporlar "ne oldu" (para/mal, defter),
  Analitik "neden/ne olacak" (davranış, iz).
