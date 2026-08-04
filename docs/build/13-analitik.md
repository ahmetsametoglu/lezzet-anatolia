# 13 — Analitik

## Kapsam

Çerezsiz-öncelikli, sunucu-tarafı, toplu ölçüm — banner gerektirmeden. Olay toplama, UTM reklam ROI, edinim kaynağı kohortu, huni, segmentler, AI içgörü. Reklam gün birden olacağı için **baştan tam** kurulur; yalnız pixel/CAPI ve ileri analitik Faz 2.

## Okunacaklar

- `FEATURES.md` (Analitik — cookie'siz hibrit kural), `data-model/iletisim-geribildirim.md` (AnalyticsEvent)
- `DOMAIN.md §14` (sinyal kalitesi/ağırlık — **veri `ProductFeedback`'te, analitikte değil**), `SCOPE.md` (tek faz, izin sınırı)

## Bağımlılık

`07-siparis` + `08-musteri-app` (olay atan yüzeyler), `12-para` (kampanya gider verisi), `packages/ai` (içgörü).

## Başlarken verilecek izah (örnek)

> "Analitiği kuruyoruz — ama çerez koymadan. Ölçümü sunucu tarafında, kişiyi tanımadan, toplu yapıyoruz; bu yüzden çerez banner'ı gerekmiyor (CNIL uyumlu). Reklam linklerindeki etiketleri (UTM) siparişle eşleştirip 'hangi kampanya kaç satış getirdi'yi görüyoruz. Müşterinin bizi hangi reklamdan bulduğunu bir kez kaydediyoruz ki 'bu kampanyadan gelen tekrar alıyor mu' sorusuna cevap verebilelim. Yapay zekâ toplu veriden anlatı çıkarıyor: 'şu kaynak düştü', 'şu ürün çok bakılıp az alınıyor'."

## Görevler

- [ ] (13.1) **Olay toplama:** sunucu-tarafı `AnalyticsEvent` (page_view/product_view/add_to_cart/checkout_start/order_placed/search/share); çerezsiz oturum anahtarı; kişisel kimlik yok, giriş varsa opsiyonel `customer_id`
  - **`product_swipe` BU LİSTEDE DEĞİL (29.07):** beğen/geç bir iz değil bir beyandır — puan kazandırır, kişiye bağlanır, "aynı ürüne bir kez" tekilliği ister. `ProductFeedback`'te yaşar (17.3). Analitik yalnız müşteriyi tanımadan toplanan gezinme izini tutar; "toplu ölçüm, banner gerekmez" iddiası buna dayanır.
  - *Bitti:* olaylar cihaza yazmadan kaydediliyor; parmak izi yok
- [ ] (13.2) **UTM → sipariş eşleşmesi:** link UTM → sunucu oturumu → sipariş; `acquisition_source` ilk siparişte (07 ile); kampanya ROI raporu (ciro + gider yan yana, 12'den)
  - *Bitti:* "kampanya X → N sipariş / € ciro / € gider" tablosu çıkıyor
  - **Gider sütunu HAZIR** (12.5, 28.07): `MoneyMovementService.campaignSpend(from, to)` kampanya başına net reklam giderini veriyor; etiketsiz gider `campaign: null` kovasında görünür. Bu görev ciro sütununu (UTM↔sipariş) ekleyip ikisini yan yana koyacak — gider tarafı yeniden hesaplanmaz.
- [ ] (13.3) **Huni + sepette bırakma:** ziyaret → ürün → sepet → checkout → sipariş dönüşüm oranları; terk noktası
  - *Bitti:* huni her aşamada sayı/oran veriyor
- [ ] (13.4) **Talep sinyalleri:** ürün-ilgi (çok bakılıp az alınan), site içi arama + **sıfır-sonuç** (talep/çeşit sinyali), aday ürün talep panosu (**beğeniler `ProductFeedback`'ten okunur**, analitikten değil)
  - *Bitti:* sıfır-sonuç aramalar listeleniyor; ürün-ilgi sıralaması çıkıyor
- [ ] (13.5) **Segmentler:** edinim kaynağı kohortu (tekrar sipariş), RFM + uyuyan müşteri (siparişten türetilir), export'lu
  - *Bitti:* "90 gündür sipariş vermeyenler" listesi türetiliyor; export çalışıyor
- [ ] (13.6) **Kaydırma sinyal kalitesi:** `ProductFeedback.dwell_ms` + desen ile düşük kaliteli kaydırmayı zayıflatma (domain-core ağırlık); ödül müşteriye tam, analiz korunur
  - *Bitti:* hep-aynı/çok-hızlı swipe analizde zayıf ağırlıkta
- [ ] (13.7) **AI içgörü:** `packages/ai` toplu veriden anlatı/anormallik ("X kaynağı düştü", "Y çok bakılıp az alınıyor")
  - *Bitti:* haftalık özet anlatısı üretiliyor

## Şerit yorumları (04.08 — kullanıcı isteği)

> Modül yazılmadan önce üç şerit kendi açısından görüşünü buraya yazar. Amaç: kapsamı kodlamadan
> önce **çakışmaları ve sınır belirsizliklerini** görünür kılmak. Her şerit kendi başlığı altına
> yazar, başkasınınkini değiştirmez.

### Operasyon yüzeyi

**1. İki görev BAŞKA EKRANDA fiilen indi — kapsam güncellenmeli.**
- `13.4` aday ürün talep panosu → **Geri Bildirim ekranında çalışıyor** (`/operations/feedback`,
  aday panosu sekmesi). Görev satırının kendisi bunu öngörmüş ("beğeniler `ProductFeedback`'ten
  okunur, analitikten değil") ama satır hâlâ `[ ]` ve burada duruyor. Analitik yazılırken ikinci
  bir pano çizilirse aynı soru iki ekranda iki farklı cevap verir.
- `13.6` kaydırma sinyal kalitesi → **motorda ve iki ekranda kullanılıyor** (`signal-quality`,
  `getProductSignals`; aday panosu + ürün skorları). Analitiğin yapacağı yeni bir şey yok; olsa olsa
  bu ağırlığı **görselleştirir**.

**2. Asıl belirsizlik: Raporlar ile Analitik'in sınırı nerede?**
İki ayrı ekran çizili (`admin-raporlar.md` · `admin-analitik.md`) ve iki ayrı modül var
(`12.6` kârlılık raporları · bu modül). Bugünkü hâliyle ikisi de "sayılara bakılan yer" ve sınır
yazılı değil. Önerim — **soruyla ayırmak:**
- **Raporlar** = *"ne oldu"* — para ve mal: ciro, kâr, fire, tedarikçi borcu. Kaynağı defter,
  cevabı kesin, dönemi kapalı.
- **Analitik** = *"neden oldu / ne olacak"* — davranış: huni, terk noktası, kaynak kohortu, talep
  sinyali. Kaynağı iz (`AnalyticsEvent`), cevabı olasılıklı.

Bu ayrım `DATA_MODEL`'in kendi ilkesiyle de hizalı (*"İZ ile BEYAN ayrı yaşar"*). Karar verilmezse
iki ekran birbirinin yarısını gösterir ve operatör hangisine bakacağını bilemez.

**3. Nav girişi bugün ÖLÜ** (`/operations/analytics`, `09-admin.md` nav taraması). Ekran inene kadar
raydan çıkarılması gerekebilir — ama bu modülün sırası en sonda olduğu için (kullanıcı kararı,
03.08) girişin uzun süre ölü kalacağı bilinmeli.

**4. Ekran tarafında beklentim küçük ve nettir:** analitik ekranı **okuma-ağırlıklı** olacak, yazma
kapısı yok. Yani bu modülde operasyon şeridinin işi büyük ölçüde *sunum*: kapılar hazır geldiğinde
ekran hızlı iner. Blokaj çıkarsa `13.1` (olay toplama) yüzünden çıkar — bugün hiç `AnalyticsEvent`
yazılmıyor, yani ekran yazılsa boş liste gösterir.

### Arka uç

**Karar önerim tek cümlede: olay defterinde kimlik kolonu OLMAZ.** Uzun gerekçe tartışma
dokümanında; buraya kalıcı olması gerekenler indi (o klasör commit'lenmiyor).

**1. `AnalyticsEvent.customer_id` çıkmalı.** Nullable bir kimlik kolonu "opsiyonel" değil
**kararsız**dır; şema kararsız kalınca kararı her okuma kendi verir. Üç somut sebep:
- **Silmenin anlamı tanımsız kalır.** FK `cascade` ise geçmiş sayılar geriye dönük değişir (mart
  ayının ziyaret grafiği haziranda başka bir sayı gösterir); `set null` ise anonim iddia ettiğimiz
  defterde "burada kimlik vardı" boşluğu durur; FK hiç yoksa silinen müşteri defterde öksüz bir
  uuid olarak yaşar. Üçü de yanlış.
- **Tek tablo iki SAKLAMA SÜRESİ taşıyamaz.** Anonim ölçüm uzun tutulabilir; kimlikli davranış
  verisi izin çekilince silinmelidir. Aynı tabloya iki `delete` kuralı yazılamaz.
- **Hacim.** En çok yazılan tabloya, bugün karşılığı olmayan bir sorgu için indeks eklenmez.

**Kimlikli defter kapatılmıyor, sırası konuyor:** izin modeli ZATEN var ve iyi
(`MarketingConsent` kanal bazlı + üç hâlli); eksik olan izni **soran yüzey** ve **silme aracı**
(`BEKLEYEN(09.10)`). İkisi indiği gün ayrı bir `customer_activity` defteri açılabilir — kendi
hukuki dayanağı, kendi saklama süresiyle. Emsal bu depoda zaten uygulanmış ve canlı şemada duruyor:
`postal_code_demand` (anonim sayaç) ↔ `zone_notice` (kimlikli kişi), `0023`.

**Hukuki çerçevede bir düzeltme:** `customer_id` **çerez banner'ı** iddiasını kırmaz — banner
ePrivacy 5(3)'ün konusudur (cihaza yazmak/okumak) ve sunucudaki satırın kime ait olduğu o maddeyi
ilgilendirmez. Kırdığı şey **GDPR hukuki dayanağıdır**: toplu ölçüm için meşru menfaat
savunulabilir, kişiye bağlı gezinme profilini pazarlamada kullanmak açık rıza ister. Banner'ı asıl
tehdit eden yer `session_key`'in türetimidir (parmak izi → CNIL'e göre rıza ister). *(Okuma; hukuki
metin değil — teyide değer, ama üç seçenek arasındaki tercihi değiştirmiyor.)*

**2. `session_key` günlük dönen tuzla türer ve SİPARİŞE YAZILMAZ.**
`hash(gunluk_tuz ‖ kirpilmis_ip ‖ user_agent ‖ site)`; tuz her gün değişir ve eskisi saklanmaz —
atıldığı anda o günün anahtarları geri hesaplanamaz, defter psödonimden anonime döner. Sabit tuz
bunu bir **parmak izine** çevirirdi. Bedeli dürüstçe yazılmalı: **"tekrar gelen ziyaretçi"
ölçülemez** (o soru zaten siparişten cevaplanıyor — 13.5 RFM + `acquisition_source` kohortu).
Anahtarı `order`'a yazmak anonim defterin tamamını tek `join` ile geriye dönük kimliklendirirdi;
13.2'nin ihtiyacı anahtar değil **UTM**'dir — eşleşme sipariş anında tüketilir, saklanmaz.

**3. `path` HAM URL olarak yazılamaz — bugünkü tanımıyla deftere jeton ve kimlik sızıyor.**
İki gerçek rota: `/[locale]/feedback/[token]` (bu segment `FeedbackRequest.token`'dır ve
`DATA_MODEL`'e göre **oturum yerine geçer** — yani anonim defterde bir kimlik doğrulama sırrı) ve
`/[locale]/orders/[reference]` (müşterinin bildiği sipariş numarası). Kural: kapı **normalleştirilmiş
rota kalıbını** yazar (`/product/[slug]`), somut değeri değil; sorgu dizesi düşürülür, ölçülecek
parametre `meta`'ya adıyla konur. Yan faydası: `pushState` ile açılan paneller sahte `page_view`
üretmez.

**4. Olayın alanları.** `channel` (B2C/B2B) evet · görüntüleme anındaki satılabilirlik evet ama
**tek enum** (`sellable · sold_out · closed · not_here`; dört bayrak bir gün çelişir — beş
`rating_N_count` yerine `rating_breakdown` dizisine geçmemizle aynı gerekçe) · `subject_type +
subject_id` evet, ürün kırılımı için `product_id` denormalize anlık görüntü olarak yanında ·
terk sebebi (`cart_blocked`/`checkout_blocked`) evet ama **sebep serbest metin olamaz**, motorda
zaten tipli (`meetsMinBasket` · `splitByRoute` · `diffCartByPlace`) ve kod `packages/types`'ta ortak
birlik olarak durur.
**Tek itirazım yer granülü:** `place` DEPO düzeyinde olmalı, posta kodu düzeyinde değil —
`channel='b2b'` + posta kodu + zaman damgası Strasbourg ölçeğinde **tek işletmeye** iner
(k-anonimlik ihlali; defter kolon kolan anonim olur, satır olarak değil). Posta kodu kırılımı
isteyen tek soru zaten `postal_code_demand`'de ve orada kanal yok.

**5. Prefetch ayıklaması KAPIDA.** Atıcı ne olduğunu söyler, neyin sayılacağına kapı karar verir:
kural atıcılara dağıtılırsa biri unutur ve **unutulduğunda hata vermez**, yalnız payda sessizce
şişer. Kapı `Next-Router-Prefetch` başlığını kendi okur ve olayı **düşürür** (bayrakla kaydetmez).
Aynı yerde iki hayalet daha düşer: bot UA'ları ve ISR yeniden üretimi.

**6. Bu modülün en büyük teknik riski kimlik değil HACİM — ve kapsamda hiç geçmiyor.**
`page_view` sistemin en çok yazılan tablosu olacak ve her analitik okuması onun üzerinde bir
toplamadır. Sorun bugün değil, veriyi kullanmaya başladığımız gün çıkar. İkisi baştan girmeli:
**saklama penceresi** (ham olay 13 ay — CNIL kitle ölçümü muafiyetinin sınırı; aynı sayıyı kullanmak
bedava tutarlılık — ve **silen bir iş**, yoksa "saklama süresi" bir cümledir) ve **günlük özet
tablosu** (ekran özeti okur, ham defter yalnız detaya inmek için). Ekran ham deftere bağlanırsa
bağlandığı gün hızlıdır ve her hafta biraz daha yavaşlar; kimse tek bir günü işaret edemez.

**7. `13.4` ve `13.6` bugün YANLIŞ bilgi veriyor** (operasyon şeridiyle aynı tespit, arka uçtan
doğruluyorum): ikisi de `[ ]` ama işleri indi — `weighSwipesByProduct` + `getProductSignals` motorda
ve iki ekranda, aday panosu `/operations/feedback`'te çalışıyor. `CLAUDE §5` tamamlanmış satırın
vaadini denetliyor; **tersi de yanlıştır** — işi inmişken `[ ]` duran satırı okuyan ajan aynı şeyi
ikinci kez yazar ve aynı soru iki ekranda iki cevap verir. `13.4` bölünmeli (aday panosu kapandı,
analitiğe kalan gerçek iş "çok bakılıp az alınan" + sıfır-sonuç arama), `13.6` kapanmalı.

**8. `13.7` şimdiden bir sözleşme maddesi istiyor: AI'a ham satır GİTMEZ, özet gider.** Ham defteri
modele vermek hem faturayı satır sayısıyla çarpar hem anonimliği modelin bağlamına taşır.
`packages/ai` DB'yi zaten göremiyor (`ai-scope`), yani kararı çağıran verir — çağıranın günlük özeti
geçmesi tercih değil, kural olmalı.

**Kabul edilirse `DATA_MODEL.md` tek cümle kazanır** (*"Olay defterinde kimlik kolonu YOKTUR;
kimlikli davranış verisi ayrı bir defterin ve ayrı bir hukuki dayanağın işidir"*) ve
`data-model/iletisim-geribildirim.md`'den `customer_id` satırı çıkar — bugün ikisi çelişiyor.

### Müşteri yüzeyi

**Kararların tamamı kabul.** İkisi benim tarafımda bedelli, biri de kapı kurallarında bir boşluk
bırakıyor. Atıcı haritasının kendisi görev satırındadır (`08-musteri-app.md` → `08.9`); burada
yalnız kararların yüzeye çarptığı yerler var.

**1. Yer kapısı huninin ilk adımı — ve "yer çözülmemiş gezinme" gerçek bir hâl.**
Ziyaretçi yer seçmeden katalogu geziyor: çerez yoksa `readPlaceWarehouses` `warehouseId: null`
döner (`lib/delivery/read-place.ts:95` → `readPlaceAnswerFromCookie` `null`). İki sonucu var:
- `place_resolved` gerçekten **ilk** adım. `postal_code_demand` yalnız onaylayanı sayıyor; kodu
  hiç girmeden düşen ziyaretçiyi bugün hiçbir sayaç görmüyor.
- **Olayın `place` alanı `null` olabilir ve bu "bilinmiyor"dur, "depo yok" değil** (`CLAUDE §1`:
  ölçülemeyen değer sıfır değildir). Huni okunurken `place = null` kendi kovası olmalı; düşürülen
  satır olursa en büyük kayıp adımı raporun dışında kalır.

**2. `add_to_cart` beyanı — ziyaretçide ölçümün TEK yolu bu, tercih değil.**
Sepet ucu eşitleme ucudur ve ziyaretçide sunucuya hiç yazmaz
(`if (!customerId) … serverCart: false`, `lib/cart/actions.ts:131`). Niyet istemciden gelmezse
ziyaretçinin sepete eklemesi **hiç** ölçülmez — oysa huninin asıl sorusu tam olarak ziyaretçinin
nerede düştüğü. Künyeye yazılacak cümle: *beyan edilmiş olay gözlenen olay değildir; sayısı sepet
satırlarıyla tutmaz ve bu arıza değildir.*

**3. Paylaşma sunucu eylemine dönüyor — üç ayrıntı, üçü de düğmenin bugünkü hâlinden.**
`ShareButton` (`components/customer/ui/share-button.tsx`) **konusunu bilmiyor**: yalnız `label`
alıyor ve `window.location.href`'i paylaşıyor. İki yerde kullanılıyor — mobil detay başlığı
(`ui/site-frame.tsx:209`) ve paket detayı (`package/[slug]/package.desktop.tsx:48`).
- Düğme `subject` alacak (`subject_type + subject_id`); yoksa "ne paylaşıldı" adresten tahmin
  edilir ve rota kalıbı kararı (§2) o tahmini zaten imkânsız kılıyor.
- **İptal SAYILMAZ:** `navigator.share` kullanıcı vazgeçince reddediyor. Olay promise **çözülünce**
  atılır, çağrılınca değil — bugünkü kod iptali bilerek yutuyor, ölçüm de aynı yerden ayrılmalı.
- **Pano kopyalama da paylaşmadır** (masaüstünde tek yol) ve sayılır, ama `meta.method` ile ayrı:
  ikisinin dönüşümü aynı değil, tek sayıda toplamak masaüstünü mobil gibi okutur.

**4. Kapı kurallarında bir boşluk: PERSONEL de müşteri yüzeyini geziyor.**
§1 "personel gezinmesi ölçülmez" diyor ve operasyon yüzeyini kastediyor — ama personel kendi
vitrinini de geziyor (sipariş kontrol ederken, ürüne bakarken) ve o gezinme defterde müşteri gibi
görünür. Küçük hacimde oranları hissedilir biçimde oynatır. Öneri: kapı personel oturumunu görürse
olayı **düşürür** — prefetch/bot/ISR ile aynı yerde, aynı gerekçeyle (atıcı ne olduğunu söyler,
neyin sayılacağına kapı karar verir).

**5. Müşteri yüzeyinde analitiği OKUYAN tek yer var ve o bende:** vitrin seçkisi
(`readShowcase`, `lib/storefront/home.ts:45` — `BEKLEYEN(08.9)`). Bugün ölçüt olmadığı için
katalogdan seçiyor. §5 kuralı gereği **ham deftere değil `analytics_daily`'ye** bağlanacak; ölçüt
son N günün `product_view` + `add_to_cart` toplamı, N ve pencere parametrik. Yani günlük özetin
"gün × olay tipi × rota × depo" boyutları bana yetiyor — ürün kırılımı için `product_id`
denormalize alanının özete de taşınması şart (arka uç §4'te zaten öyle diyor, teyit ediyorum).

**6. 13.1'den beklediğim tam olarak iki şey:** kapının imzası (atıcının çağıracağı tek fonksiyon)
ve `packages/types`'taki terk sebebi ayrık birliği. İkisi gelince atıcılar **tek turda** yazılır —
planladığım olayların hiçbiri yeni kapı açmıyor, hepsi zaten sunucuya gelen eylemlere asılıyor.
Tek istisna `shareProductAction` ve o da yeni bir uç değil, düğmenin var olan işinin sunucuya
taşınması.

## Netleşecekler

- **Dar izin katmanı (Faz 2):** Meta/Google pixel açılınca gereken küçük izin katmanı — o reklamlar başlarken kurulur; çekirdek analitik bundan bağımsız tam çalışır.
