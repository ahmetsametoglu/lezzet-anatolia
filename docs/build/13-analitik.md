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

- [~] (13.1) **Olay toplama:** sunucu-tarafı `AnalyticsEvent`; çerezsiz oturum anahtarı; **kişisel kimlik YOK** · `touches: supabase/migrations/0035_analytics.sql, packages/types/src/schemas/analytics.schema.ts, packages/database/src/services/analytics.service.ts, apps/web/lib/analytics/**, apps/backend/src/jobs/analytics-rollup.ts`
  - **`product_swipe` BU LİSTEDE DEĞİL (29.07):** beğen/geç bir iz değil bir beyandır — puan kazandırır, kişiye bağlanır, "aynı ürüne bir kez" tekilliği ister. `ProductFeedback`'te yaşar (17.3). Analitik yalnız müşteriyi tanımadan toplanan gezinme izini tutar; "toplu ölçüm, banner gerekmez" iddiası buna dayanır.
  - ~~giriş varsa opsiyonel `customer_id`~~ — **kolon YOK, nullable bile değil** (kullanıcı kararı 04.08 · `ANALYTICS §2`). Başlıktaki eski söz üstü çizildi: nullable bir kimlik "opsiyonel" değil KARARSIZdır ve şema kararsız kalınca kararı her okuma kendi verir.
  - *Bitti:* olaylar cihaza yazmadan kaydediliyor; parmak izi yok
  - **Durum (04.08) — ŞEMA + KAPI + İŞ TAMAMLANDI; kalan yalnız ATICILAR (08.9, müşteri şeridi).**
    - **Üç tablo, üç ayrı iş:** `analytics_event` (ham iz, **aylık bölümlenmiş**, 25 ay) · `analytics_session` (oturumun UTM künyesi, bir kez) · `analytics_daily` (**ekranların okuduğu** özet, süresiz, 24'lük saat dizisi). Ham deftere okuma metodu YOK ve olmayacak — bir `list()` eklendiği gün ekran hama bağlanır ve her hafta biraz daha yavaşlar.
    - **`nulls not distinct` ŞART ve ölçüldü:** özetin boyutlarının çoğu nullable ve SQL'de `null <> null` — standart `unique` aynı gün/tip için `warehouse_id = null` satırının defalarca yazılmasına izin verirdi. Özet **sessizce çoğalır**, hata vermez, ancak toplamlar tutmadığında fark edilirdi. Geri alınan bir işlemde denendi: null kovalı satır ikinci koşuda çoğalmadı (3 → 3).
    - **Üç bilinçli sapma, üçü de gerekçeli:** vekil anahtar (`id`) YOK — defter asla kimliğiyle okunmuyor, en çok yazılan tabloya kullanılmayan indeks eklenmez (ayrıca bölümlenmiş tabloda anahtar bölüm anahtarını içermek zorunda); **FK YOK** — silinen ürün/depo geçmiş sayıları geriye dönük değiştirmemeli (mart ayının grafiği haziranda başka bir sayı göstermemeli); `customer_id` **tipte bile yok** — bir gün "opsiyonel koyalım" diyen derleme hatası alsın.
    - **Saklama: satır silinmez, BÖLÜM DÜŞER** (`drop_analytics_partitions_before`). 25 aylık bir tabloda toplu `delete` hem uzun sürer hem ölü satır bırakır; `drop table` tek metadata işlemidir. Bölüm adından tarih ayrıştırılmıyor — `pg_inherits` taranıyor, çünkü adlandırma bir gün değişirse ad çözümlemesi **sessizce hiçbir şey silmezdi**.
    - **Kapı (`recordEvent`) — atıcı ne olduğunu söyler, neyin sayılacağına kapı karar verir.** Düşürülenler tek yerde: prefetch üstbilgisi · bot UA · UA'sız istek (ISR/arka plan) · **personel** (müşteri şeridinin tespiti — kendi vitrinimizi en çok biz geziyoruz; `cache()` ile istek başına bir sorgu, olay başına değil, oturumsuz ziyaretçide hiç sorgu yok). Kural atıcılara dağıtılsaydı biri unuturdu ve **unutulduğunda hata vermezdi** — payda sessizce şişerdi.
    - **`path` ROTA KALIBI olarak yazılır ve bu bir GİZLİLİK kararıdır:** `/feedback/<token>` `DATA_MODEL`'e göre oturum yerine geçen bir SIRDIR (defteri okuyan o bağlantıyı açabilirdi), `/orders/<reference>` doğrudan kimliklendiricidir. İki katman: eşleme tablosu + **emniyet ağı** (bilinmeyen rotada kimlik görünümlü segment maskelenir) — tablo tek başına bırakılsaydı yarın eklenen bir dinamik rota listeye yazılmayı unutulduğu gün ham değer sızardı. 21 test.
    - **DENETİM DÜZELTMELERİ (04.08 · `docs/denetim/denetim-analitik-yol-kalibi.md`) — üç bulgu, ikisi kırmızı, üçü de bu göreve bakıyordu. Ortak sınıf: kod doğru göründü, testler yeşildi, ama ÖLÇÜLEN DEĞER yanlıştı ve hiçbir yerde hata vermedi.**
      - **P1 — `path` ziyaret edilen sayfayı değil GELİNEN sayfayı yazıyordu.** Künye *"atıcı yol göndermez, kapı üstbilgiden okur"* diyordu; gerekçe sağlamdı ama dayandığı varsayım yanlıştı: `x-invoke-path` Next 15'te YOK ve müşteri dalı middleware'den erken döndüğü için yol üstbilgisi de yazılmıyor — geriye yalnız `referer` kalıyordu. Ölçüldü: `/fr/produit/…` ziyareti deftere `path=/catalogue` yazmış. Kapı artık ikinci bir `EventContext` parametresi alıyor (`recordEvent(input, { path })`); rota kalıbı bir OLGU, bir karar değil — "neyin sayılacağına kapı karar verir" ilkesi bozulmuyor. Sayfa kendi kalıbını DERLEME ZAMANINDA bilir, kapı çalışma zamanında tahmin ediyordu. Atıcı ayağı müşteri şeridinde tamamlandı; verilmediğinde eski türetim emniyet ağı olarak sürüyor (yanlış ama boş değil).
      - **P2 — kalıp sözlüğü İÇ İngilizce kelime bekliyordu, gerçek URL DIŞ kelime taşıyor** (`product` ↔ `produit`/`urun`). İki sonucu vardı: aynı ekran üç dilde üç kalıp, ve 20 karakterden kısa slug HAM yazılıyordu — yani `0036`'nın özetten bilinçle uzak tuttuğu şişme, `path` üzerinden geri giriyordu. Elle yazılmış tablo **silindi**; kalıplar `PATHNAMES`'ten türetiliyor (URL'in tek kaynağı). İkinci bir sözlük tutmanın kendisi hatanın sebebiydi: yeni rota eklendiğinde ölçüm kendiliğinden doğru kalıbı yazar. Testler de düzeldi — İngilizce iç yolla sınıyorlardı, yeşildi, ama girdi gerçeği temsil etmiyordu; altı gerçek-URL testi eklendi.
      - **P3 — üç küçük, biri ölçüyü oynatıyordu.** IPv6 kırpma 4 gruptan **3'e** indi (karar "son 80 bit atılır" idi, kod 16 bit fazla tutuyordu) ve `::` sıkıştırık gösterim artık AÇILIYOR: açmadan kırpınca `2001:db8::1` ile açık yazımı iki farklı anahtar üretiyordu — kimlik riski değil, **aynı ziyaretçinin iki oturum sayılması**, yani dönüşüm oranının sessizce düşmesi. Ayrıca bayat künye (`console.warn`) düzeltildi ve `country`/`language` için türetme UYDURULMADI, `BEKLEYEN(13.1)` yazıldı: uydurulmuş bir dil boş dilden kötüdür.
    - **Oturum tuzu RASTGELE üretilir, sabit bir sırdan TÜRETİLMEZ:** `hash(SIR ‖ gün)` biçimi, sırrı bilen için her günü geriye dönük yeniden hesaplanabilir kılardı — yani "eskisi saklanmıyor" iddiası yalan olurdu. IP kırpılır, ham hâli hiçbir yerde durmaz. Çerezden türetilmez: bugünkü çerezler kesinlikle-gerekli muafiyetinde ve analitiğe kullanıldıkları an o gerekçe düşer.
    - **`sessionCount` YAKLAŞIKTIR** ve künyeye yazılması şart: aynı oturum birden çok boyut satırına düşebilir, yani satırların toplamı gerçek oturum sayısından büyüktür. **Toplanabilir tek sayı `eventCount`.** Bilmeyen ekran "toplam ziyaretçi" diye yanlış bir sayı üretir.
    - **İş (`analytics_rollup`, günde bir 03:40):** bölüm bakımı → günlük özet → saklama süpürmesi. **Özet ÖNCE, silme SONRA**; ters sırada bir gün özet koşmazsa o günün verisi hem özette hem hamda yok olur. Bugün değil DÜN özetlenir (gün kapanmadan üretilen özet eksiktir) ve üç gün geriye kadar yeniden üretilir — idempotent olduğu için emniyet payı yalnız bir upsert.
    - **Şema 04.08'de İKİ KEZ büyüdü (aynı gün, `db:refresh` bir kez):** günlük özet `blocked_reason` boyutu kazandı (13.3 — sebep yalnız ham defterde durduğu sürece hiçbir ekrana ulaşmıyordu) ve `0036` üç sinyal özeti ekledi (13.2 · 13.4). `AnalyticsDaily` tipi de bir alan büyüdüğü için operasyon ekranının test fabrikasına tek satır eklendi (`blockedReason: null`) — şerit dışı ama mekanik bir sonuç, ayrıca bildirildi.
    - **BEKLEYEN(08.9):** atıcılar müşteri şeridinde; kapı ve sözleşme hazır, harita `08-musteri-app.md`'de yazılı.
- [~] (13.2) **UTM → sipariş eşleşmesi:** link UTM → sunucu oturumu → sipariş; `acquisition_source` ilk siparişte (07 ile); kampanya ROI raporu (ciro + gider yan yana, 12'den) · `touches: supabase/migrations/0036_analytics_signals.sql, apps/web/lib/analytics/{attribution,utm,read}.ts, apps/web/lib/order/checkout-draft.ts`
  - *Bitti:* "kampanya X → N sipariş / € ciro / € gider" tablosu çıkıyor
  - **Gider sütunu HAZIR** (12.5, 28.07): `MoneyMovementService.campaignSpend(from, to)` kampanya başına net reklam giderini veriyor; etiketsiz gider `campaign: null` kovasında görünür. Bu görev ciro sütununu (UTM↔sipariş) ekleyip ikisini yan yana koyacak — gider tarafı yeniden hesaplanmaz.
  - **Durum (04.08) — ZİNCİRİN TAMAMI BİTTİ; kalan yalnız ekranın tabloyu bağlaması (13.8).**
    - **Eksik olan kapı değil BESLEYİCİYDİ.** `acquisition_source`'un yazma kapısı aylardır duruyordu (`checkout-session.ts`: "yalnız boşsa yaz") ve alan her müşteride boştu — onu dolduran taraf hiç yazılmamıştı. Ekran bunu dürüstçe anlatıyordu ("henüz ölçülmüyor"); artık ölçülüyor.
    - **Besleyici TASLAKTA çağrılıyor, ödeme oturumunda değil** (`checkout-draft.ts`) ve bu bilinçli: checkout'un iki ödeme dalı var ve kapıda/vadeli dal ödeme oturumunu hiç açmıyor. Orada yazsaydık **nakit ve vadeli müşterilerin tamamı** sessizce "kaynağı ölçülmemiş" kalırdı — B2B'nin ana yolu tam olarak o dal. Taslak iki dalın da geçtiği tek noktadır.
    - **UTM artık KAPALI SÖZLÜK** (`normalizeUtm` → `{source, medium, campaign, content, term}`). Açık bırakılsaydı reklam aracının linke eklediği her parametre anonim deftere girerdi — `gclid`/`fbclid` gibi **tıklama kimlikleri** dâhil; onlar reklam ağının tarafında tek kullanıcıya çözülür, yani "kimlik kolonu yok" cümlesi teknik olarak doğru fiilen yanlış olurdu. 6 birim testi, en önemlisi "sözlük dışı anahtar ATILDI".
    - **Ciro İLK TEMAS atfıyla gelir ve bu künyeye yazılmak zorunda:** satır "o dönemde o reklama tıklayıp sipariş verenler" değil, "o kampanyanın kazandırdığı müşterilerin o dönemki siparişleri"dir (tekrar siparişler dâhil). Başka türlüsü oturum anahtarını siparişe yazmayı gerektirirdi ve **o tek `join` anonim defterin tamamını geriye dönük kimliklendirirdi** (`ANALYTICS §2`). Kısıt mahremiyet kararının bedeli; `newCustomerCount` sütunu farkı okutmak için var.
    - **Gider ile ciro aynı şeyi ölçmüyor:** gider dönemin gideri, ciro geçmişte kazanılmış müşteriyi de içerir. Yeni kampanyada ciro geç görünür, kapatılmış kampanyada gider bittiği hâlde ciro sürer. `readCampaignRoi` ikisini yan yana koyuyor ve **etiketsiz kovayı düşürmüyor** — düşseydi ne gerçek gider ne gerçek ciro tutardı, ROI kendiliğinden şişerdi.
    - **Kaynak dökümü OTURUM tablosundan değil DEFTERDEN üretiliyor** (`analytics_daily_source`, sol birleşim): `analytics_session` yalnız künyeli gelişte satır açıyor, oradan okusaydık doğrudan gelen ziyaretçi (muhtemelen çoğunluk) dökümde hiç görünmez ve yüzdeler yalan söylerdi.
    - **Bedeli dürüstçe:** tuz gün dönümünde değişiyor; 23:50'de tıklayıp 00:10'da sipariş veren müşterinin künyesi bulunamaz ve kaynağı boş kalır. Boş kalması yanlış yazmaktan iyidir.
    - **DÖNEM CİROSU da tamamlandı (04.08, ikinci tur — operasyon şeridinin iki kapı isteği).** `readOrderRevenue(from, to)` → dönem toplamı + **B2C/B2B ayrımı** + günlük seri; hero'nun Ticaret modunun tamamı tek çağrıdan.
      - **Süzgeç SİPARİŞ tarihinde, teslim gününde değil.** Var olan `order_counts` teslim gününe bakıyor; bugün verilen sipariş üç gün sonra teslim edilir, yani teslim gününe göre okunan bir dönem cirosu kampanya giderinin dönemiyle **hiç hizalanmaz** ve ROI tablosunun iki sütunu farklı dönemleri anlatırdı. Operasyon şeridi bu yüzden "yaklaşık doğru" bir ciro yazmayı reddetmişti — doğru yapmıştı.
      - **"Hangi sipariş ciro sayılır" artık TEK TANIM** (`analytics_order_base` görünümü): taslak/iptal/iade dışarıda. Üç okuma (kampanya cirosu · dönem cirosu · segment) aynı yerden okuyor — üç kez yazılsaydı biri iadeyi düşer öteki düşmezdi ve **aynı ekranda iki farklı ciro** belirirdi, hiçbiri hata vermeden. Bir test tam olarak bunu çiviliyor: iki okumanın toplamı eşit.
      - **Kanal ayrı satır:** karışık ölçüm yalan söyler (`ANALYTICS §3`) — B2B'nin tek siparişi B2C'nin ortalamasını savurur. Toplamak okuyanın kararı.
- [~] (13.3) **Huni + sepette bırakma:** ziyaret → ürün → sepet → checkout → sipariş dönüşüm oranları; terk noktası
  - *Bitti:* huni her aşamada sayı/oran veriyor
  - **Durum (04.08) — TERK KIRILIMI TAMAMLANDI; huninin kendisi 13.8'de çizili, atıcıları bekliyor.**
    - **Özet `blocked_reason`'ı taşımıyordu ve bu sessiz bir kayıptı** (0035 düzeltildi): sebep yalnız ham defterde duruyordu, yani huninin en değerli kolonu hiçbir ekrana ulaşmıyordu. *"Checkout'ta %38 düşüyor"* tek başına aksiyon üretmez; *"%38'in yarısı asgari sepet"* üretir.
    - Boyut yalnız `cart_blocked`/`checkout_blocked` satırlarında dolu; öteki tiplerde `null` ve `nulls not distinct` sayesinde tek satırda toplanıyor — özet çoğalmıyor (test: "terk sebebi özette bir boyut").
    - **Adım SIRASI tek kaynakta** (`ANALYTICS_FUNNEL_STEPS`, `packages/types`): etiketler ekranın dilinde kalır ama sıra bir iş kuralıdır. İki yerde yazılsaydı biri gün gelip adım eklerdi ve iki rapor aynı huninin iki farklı kayıp oranını gösterirdi — ikisi de hata vermeden.
    - **TEKİLLEŞTİRME TAMAMLANDI (04.08, ikinci tur — müşteri şeridinin isteği).** `order_placed` artık **oturum başına bir kez** sayılıyor; kararı kapı veriyor, atıcı bilmiyor.
      - **Neden gerekliydi:** olay bugüne dek yalnız kart-DIŞI yolda atılabiliyordu (sipariş orada sunucu eyleminin içinde kesinleşiyor). Kart yolunda onay webhook'ta veriliyor ve orada ziyaretçinin oturumu yok; atılabileceği tek yer dönüş sayfası, o da her yenilemede yeniden render oluyor. Yani huninin son adımı **kart ödemelerini sistematik olarak eksik sayıyordu** ve bu hata vermiyordu, yalnız dönüşüm oranı olduğundan düşük görünüyordu.
      - **Ölçüt OTURUM, sipariş DEĞİL** ve bu iki sebeple daha doğru: sipariş başına tekilleştirmek **sipariş kimliğini deftere sokmayı** gerektirirdi (defterin tüm iddiası kimlik taşımamak); ve `ANALYTICS §4` sipariş sayısında `order` tablosunu yetkili kılıyor — defterin sorusu "kaç sipariş" değil **"bu oturum siparişle bitti mi"**. Bölünen sepetin iki siparişi de tek bir tamamlanmış akıştır.
      - **Defterde bir okuma açıldı** (`wasRecordedInSession`) ve "okuma metodu yok" kuralını çiğnemiyor: yasak EKRAN okumasınadır. Bu bir varlık sorgusu — tek satır, `(session_key, created_at)` indeksinden, yalnız oturum başına bir kez sayılan tiplerde. Tarih süzgeci **bölüm budaması** için şart, yoksa 25 ayın tüm bölümleri taranırdı.
      - **Yarış kabul edildi:** iki eşzamanlı render ikisi de "yok" görebilir. Yenileme sıralıdır ve ters ödünleşme (kilit) en sıcak yola yazma maliyeti eklerdi. En kötü hâlde bir oturum iki kez sayılır; bugünkü hâlde ise HİÇ sayılmıyor.
      - **`date_unavailable` terk sebebi eklendi** (müşteri şeridinin ölçümü): "seçtiğiniz güne teslimat yok" gerçek bir sürtünme. **Dört hâl bilerek EKLENMEDİ** — `cart_unreachable` · `warehouse_unresolved` · `order_not_placed` bizim arızamız (huniye yazılsalardı müşteri vazgeçmiş görünürdü; yerleri `error_log`), `address_missing` ise checkout'un normal ilk hâli (engel sayılsaydı her oturum bir `checkout_blocked` üretir ve olay değerini kaybederdi).
- [~] (13.4) **Talep sinyalleri:** ürün-ilgi (çok bakılıp az alınan), site içi arama + **sıfır-sonuç** (talep/çeşit sinyali), aday ürün talep panosu (**beğeniler `ProductFeedback`'ten okunur**, analitikten değil)
  - *Bitti:* sıfır-sonuç aramalar listeleniyor; ürün-ilgi sıralaması çıkıyor
  - **Durum (04.08) — İKİ SİNYAL DE TAMAMLANDI. Aday ürün panosu bu görevde DEĞİL, `/operations/feedback`'te çalışıyor** (operasyon + arka uç şeritlerinin ortak tespiti; görev satırının kendi cümlesi zaten öyle diyordu).
    - **İki ayrı özet tablosu, `analytics_daily`'ye kolon DEĞİL:** ürünü ya da arama terimini günlük özete boyut olarak eklemek satır sayısını katalog büyüklüğüyle (ve arama çeşitliliğiyle) çarpardı; huni/ısı/seri okumaları da o şişmiş tabloyu taramak zorunda kalırdı.
    - **"Az alınıyor" yargısının PAYDASI satılabilir görüntülemedir**, toplam değil. Stoksuzken bakılan ürün "ilgi görüp satılmıyor" diye okunursa yönetici fiyata bakar; oysa doğru aksiyon tedariktir. Payda sıfırsa oran **`null`, sıfır değil** — sıfır yazsaydık hiç satılabilir görünmemiş ürün listenin başına oturur ve "kimse almıyor" diye okunurdu (`CLAUDE §1`).
    - **Sıfır-sonucun KOVASI bir boyut:** süzgeç boşluğu SIK bir arayüz sinyali, arama boşluğu SEYREK bir çeşit sinyalidir. Tek listede toplansalardı sık olan seyreği boğar ve "müşterinin istediği ama bizde olmayan şey" listesi kullanılamaz hâle gelirdi (`ANALYTICS §4`).
    - **Sıralama RPC'de ve gerekçesi `STACK §13`:** ölçüt türetilmiş bir orandır, ilk N ancak tüm dönem toplandıktan sonra bilinir. Uygulamada toplasaydık 141 ürünlük katalogda bir yıllık pencere 50 bin satır taşırdı ve 49.950'si atılmak için gelirdi.
    - **Arama özeti SÜRESİZ DEĞİL** — ham defterle aynı 25 ay. Sistemdeki tek kalıcı serbest metin; süresiz saklamak ham metnin ömrünü özet kılığında sonsuza uzatmak olurdu.
    - Ürün özetinin **ikinci tüketicisi müşteri vitrinidir** (`readShowcase`, 08.9): bugün katalogdan seçiyor, kapı hazır. Vitrin ham deftere bağlansaydı her ana sayfa açılışı bir toplama koşardı.
  - **KAPSAM-İÇİ POSTA KODU DÖNÜŞÜMÜ TAMAMLANDI (04.08 — kullanıcının kendi sorusu, denetimin şekliyle, şartlı onayla).**
    Soru şuydu: *"insanlar bir posta kodu giriyor ve genelde bir şey almadan çıkıyor — sıralamada en üstteki kodu bilebilecek miyim?"*
    - **YENİ TABLO AÇILMADI ve gerekmedi.** Ölçtüm: `postal_code_demand` **bölge içi kodları da sayıyor** (0023'ün kendi künyesi öyle diyor). Ortada olmayan tek şey sipariş tarafıydı. Ayrı bir "çözülme" defteri açmak aynı olguyu üçüncü kez kaydetmek olurdu — kullanıcının "eklemeli olsun, yük küçük kalsın" şartı zaten bunu istiyordu.
    - **Ayrı bir tablo/ekran da yok:** sütunlar var olan bölge talebi okumasına eklendi (`readZoneDemand` → `orderCount` · `revenueCents` · `orderRatio`). Yani 19.21 tablosunun kapsam-dışı ve kapsam-içi cevabı **tek listede**; ikinci bir ekran, aynı soruya iki yerde iki cevap demekti.
    - **Anahtar `address_snapshot`, canlı adres DEĞİL:** adres sonradan düzeltilebilir ve geçmiş dönüşüm oranları bugün değişirdi (kolonun kendi gerekçesi).
    - ⚠ **`orderRatio` bir dönüşüm YÜZDESİ DEĞİL, sıralama sinyalidir** ve okuyan bunu bilmeli: payda aynı ziyaretçinin tekrar sormasını da sayıyor (tekilleştirmek kimlik tutmayı gerektirirdi), payı ise kayıtlı adresinden sipariş veren müşteri sayaç hiç artmadan besliyor. Yani oran **1'i de aşabilir**, gerçek dönüşümden küçük de kalabilir. Kodlar arası karşılaştırmada anlamlı, mutlak sayı olarak değil.
    - ⚠ **Dönem süzgeci YOK ve bu bilinçli:** sayaç zaman kırılımı taşımıyor (kod başına tek satır). Siparişi döneme süzüp talebi tüm zamandan alsaydık oran pencere daraldıkça sessizce düşer ve düşüşü bir sinyal sanılırdı. İkisi de TÜM ZAMAN. Zaman kırılımı gerçekten gerekirse sayaç gün boyutu kazanmalı — o ayrı bir karar.
- [~] (13.5) **Segmentler:** edinim kaynağı kohortu (tekrar sipariş), RFM + uyuyan müşteri (siparişten türetilir), export'lu
  - *Bitti:* "90 gündür sipariş vermeyenler" listesi türetiliyor; export çalışıyor
  - **Pazarlama izni süzgeci TAMAMLANDI (04.08, operasyon şeridinin talebi — 13.1'i beklemedi).** `UserProfileService.list({ marketingConsent: 'email' | 'whatsapp' | 'any' })` + `countByMarketingConsent(...)`. `ANALYTICS §6`'nın köprüsü budur: analitik "kaç" der, Müşteriler "kim" der.
    **Kanal ayrımı ŞART ve tipte zorlanıyor:** e-postaya izin verenle WhatsApp'a izin veren aynı küme değil; tek bir "izinli" kovası e-posta listesine WhatsApp'çıları karıştırırdı — izinsiz gönderim demek. Kanal listesi şemadan TÜRÜYOR (`MarketingConsentSchema.keyof()`), elle ikinci bir liste yok: üçüncü kanal eklendiğinde derleme durur, süzgeç sessizce eksik saymaz.
    **Sayaç ile liste AYNI ölçütten çıkar** (`consentFilter` ikisinde de) — köprünün iki ucu farklı sayı gösterirse köprü zaten çalışmıyor demektir.
    **Yeni bir okuma primitifi:** `jsonPathFilters` (`BaseDbService`) — jsonb yol eşitliği; izin `marketing_consent->email->>granted` yolunda yaşıyor ve düz `filters` bunu yapamıyordu (`column()` camelCase→snake çevirisi ok işaretlerini bozar). Yol HAM gider. `'any'` ise `or` grubudur — yol eşitlikleri VE ile bağlanacağı için "her iki kanala birden izin verenler" olurdu, istenenin tersi.
    Doğrulama: 4 entegrasyon testi (kanal ayrımı · `any` · `granted:false` listeye girmez · sayaç-liste tutarlılığı). PostgREST yol sözdizimi canlı uçta ayrıca ölçüldü.
  - **RFM + uyuyan müşteri TAMAMLANDI (04.08).** `AnalyticsReportService.customerSegments(...)` → beş kova (`champion · new · active · dormant · lost`) sayı/sipariş/ciro ile; `segmentMembers(segment, limit, offset, ...)` sayfalı üye listesi (dışa alma ve Müşteriler köprüsü bunu okur).
    **Segment SAKLANMAZ, TÜRETİLİR** ve bu bilinçli: saklanan bir segment kolonu, onu tazeleyen iş bir gün koşmayınca sessizce yanlışa döner ve kimse fark etmez — "uyuyan" listesinde dün sipariş vermiş biri durur. Türetilen segment her okumada doğrudur.
    **Eşikler parametrik** (uyuyan 90 gün · yeni 30 gün · şampiyon 3 sipariş) ve **varsayılanlar SQL tarafında tek yerde** — iki yerde varsayılan tutmak, bir gün ikisinin ayrışması demektir. Verilmeyen parametre gönderilmiyor: PostgREST'e `null` geçmek varsayılanı EZER ve eşik `null` olunca her karşılaştırma `null` döner, tüm müşteriler sessizce `lost` sayılırdı.
    **Sayı ile liste AYNI ölçütten çıkar** (aynı `case` ifadesi) — köprünün iki ucu farklı sayı gösterirse köprü zaten çalışmıyor demektir; test bunu sınıyor.
    **Kohort tarafı 13.2'nin `newCustomerCount` sütunundan gelir:** "bu kampanyadan gelen tekrar alıyor mu" sorusu ayrı bir tabloya değil, kampanya cirosu satırının içine düştü — sipariş sayısı ile yeni müşteri sayısının farkı zaten tekrar siparişi anlatıyor.
    **Boş segment de dönülür** (`customerCount: 0`): "uyuyan müşteri yok" ile "uyuyan müşteri hesaplanmıyor" farklı cümlelerdir; satırı hiç göndermeseydik ekran ikisini ayıramazdı.
- [x] (13.6) **Kaydırma sinyal kalitesi:** `ProductFeedback.dwell_ms` + desen ile düşük kaliteli kaydırmayı zayıflatma (domain-core ağırlık); ödül müşteriye tam, analiz korunur
  - *Bitti:* hep-aynı/çok-hızlı swipe analizde zayıf ağırlıkta
  - **Durum (04.08) — İŞİ 17.3'TE TAMAMLANMIŞTI, satır bugüne dek yanlış bilgi veriyordu.** `weighSwipesByProduct` + `signal-quality` motorda, `getProductSignals` üzerinden iki ekranda kullanılıyor (aday panosu + ürün skorları). Analitiğin ekleyeceği yeni bir hesap yok; olsa olsa bu ağırlığı görselleştirir ve o 13.8'in işidir.
  - **Neden kapatıldı:** `CLAUDE §5` tamamlanmış satırın vaadini denetliyor; **tersi de yanlıştır** — işi inmişken `[ ]` duran satırı okuyan ajan aynı şeyi ikinci kez yazar ve aynı soru iki ekranda iki cevap verir. Üç şerit de aynı tespiti yapmıştı.
- [~] (13.7) **AI içgörü:** `packages/ai` toplu veriden anlatı/anormallik ("X kaynağı düştü", "Y çok bakılıp az alınıyor")
  - *Bitti:* haftalık özet anlatısı üretiliyor
  - **Durum (04.08) — GÖREV + İŞ + OKUMA KAPISI TAMAMLANDI; ekranın bloğu 13.8'de bağlanacak.** `analyticsInsightTask` (`packages/ai`) · `analytics_insight` işi (pazartesi 04:20) · `readWeeklyInsight()`.
    - **"Modele ham satır GİTMEZ, özet gider" artık bir cümle değil, bir TİP.** `AnalyticsInsightInput` yalnız toplanmış sayılar taşıyor — olay satırı, oturum anahtarı, yol ya da müşteri kimliği geçemez. Serbest bir "veri" alanı bıraksaydık kural bir temenni olurdu; şimdi derleme hatası.
    - **İstek anında değil HAFTALIK bir iş:** ekran her açıldığında modeli çağırmak hem parayı ziyaret sayısıyla çarpardı hem aynı haftanın anlatısını her yenilemede biraz farklı yazardı — yönetici sayfayı yenileyince fikir değiştiren bir rapor okurdu. Sonuç `settings`'te durur, ekran okur.
    - **Saklanan şey ÜRETİM ZAMANINI ve DÖNEMİ de taşıyor.** Taşımasaydı iş bir hafta koşmadığında ekran eski anlatıyı bu haftanınmış gibi gösterirdi ve kimse fark etmezdi.
    - **Dönemde hiç özet satırı yoksa model ÇAĞRILMAZ.** Boş bir haftadan anlatı istemek modeli bir şey uydurmaya davet etmektir; uydurulan şey de bir aksiyona dönüşür. Aynı gerekçe `nextStep`'in `null` olabilmesinde: her hafta öneri üretmeye zorlanan model veri yokken de öneri üretir.
    - **Çıktı şeması `packages/types`'ta**, `packages/ai`'da değil: iki tarafı var (görev üretir, ekran okur) ve iki tanım bir gün ayrışırdı — ayrıştığında da hata vermezdi, model yeni alanı doldurur ekran eskisini okurdu. Emsal: `SuggestLocalizedOutputSchema`.
    - **Cron sırası şart:** özet turu 03:40, içgörü 04:20. Ters sırada pazar gününün satırları henüz yazılmamış olurdu ve model haftanın son gününü boş görüp "hafta sonu çöktü" derdi — yanlış olmakla kalmaz, inandırıcı olurdu.

- [~] (13.8) **Analitik ekranı** *(tasarım: `Operasyon - Analitik.dc.html`, `design/pages/admin-analitik.md`)* · `touches: apps/web/app/(operations)/operations/analytics/**` — tezgâhın kendisi: kontrol barı (mod · dönem · kıyas) + kırılım şeridi + on blok. Ekran OKUMA-AĞIRLIKLIDIR, yazma kapısı yok. Bloklar kapı geldikçe dolar; ekran kapı beklemez.
  - **Durum (04.08 — EKRAN YAYINDA, BLOKLAR KAPI BEKLİYOR):** `/operations/analytics` yayında (`page` → `analytics-client` → `.desktop`/`.mobile`, yalnız yönetici). Çizimin blok sırası ve ızgara oranları birebir (1.2/1 · 1/1 · 1/1.1 · 1/1). 23 birim testi (`analytics-url.test` · `analytics-read.test`).
    - **ÜÇ VERİ HÂLİ AYRI YAZILIR** ve bu ekranın en önemli dürüstlüğü: `ready` (sayı var) · `warming` (kapı var, veri birikiyor) · `absent` (bu sayı bugün HİÇ hesaplanmıyor). Son ikisi de boş bir kutu gösterir ama biri "bekle", öteki "bekleme" der — tek bir "veri yok" hâline indirilseydi yönetici hiç dolmayacak bir bloğun dolmasını beklerdi.
    - **Bugün GERÇEK veri gösteren iki blok:** kampanya gideri (`campaignSpend`, 12.5) ve pazarlama izni sayaçları (`countByMarketingConsent` + Müşteriler'e köprü — `ANALYTICS §6`'nın "analitik kaç der, Müşteriler kim der" kararı). Defterden okuyan bloklar (`huni · seri · ısı`) kapıya BAĞLI ve veri gelince kendiliğinden dolar — 08.9 atıcıları bekliyor.
    - **Çizimdeki "Dolu / İlk gün" anahtarı KODLANMADI:** o bir demo kontrolü (çizimin kendi üst yazısı "veri halini üstten değiştirebilirsiniz" diyor). Gerçek ekranda yönetici veri hâlini seçemez, veriden okur. `Ticaret/Trafik` gerçek bir moddur ve kodlandı.
    - **Çizimdeki "Bölge dışı talep" tablosu BURADA DEĞİL:** kullanıcı kararı (04.08) onu Depolar'a taşıdı (`19.21`); analitikte işaret + köprü kaldı.
    - **Çizimden BİLEREK inmeyen dört öğe** (hepsi bir kapıya bağlı, hiçbiri unutulmadı): hero'daki **B2C/B2B ciro şeridi** (dönem cirosu okunmuyor) · zaman serisindeki **kampanya işareti** (◆) ve **"en büyük sızıntı … ort. 41 €" cümlesi** (sepet tutarı defterde yok, `ANALYTICS §4`) · **"Dışa al ↓"** (bugün dışa alınacak tek küme müşteri grupları ve o blok `absent` — boş bir dışa alma düğmesi tutulmayan bir söz olurdu). Dördü de kapıları gelince eklenir; `design/BACKLOG.md`'ye değil buraya yazıldı çünkü çizilemeyen değil, HENÜZ ölçülemeyen şeyler.
    - ⚠ **Özetin taşımadığı DÖRT boyut ekranda `absent` olarak duruyor** ve bu `ANALYTICS §5`'in listesinde YOK — kaynak kırılımı (oturum künyesinde), arama terimi (özet sayar, metni saklamaz), ürün kırılımı, tekil ziyaretçi (`sessionCount` toplanabilir değil). Dördü de çizilmiş blok; kapıları ayrı okumalar istiyor. Ortak çalışma dosyasına yazıldı.
  - **Durum (04.08 — ALTI BLOK BAĞLANDI; ekranda artık `absent` hâli KALMADI.)** Kapılar aynı gün yazıldı (`lib/analytics/read.ts`) ve ekran hepsini okuyor: trafik kaynağı · aranıp bulunamayan · çok bakılıp az alınan · kampanya getirisi (**ciro sütunu dâhil**) · müşteri grupları · haftalık AI anlatısı. `absent` hâli tipte duruyor ama bugün hiçbir blok onu kullanmıyor — bu doğru: o hâl "kapı yok" demekti ve artık yok.
    - **Ciro sütunu doldu ve künyesi bir UYARI taşıyor:** gider DÖNEMİN gideridir, ciro ise ilk-temas atfıyla gelir (o kampanyanın kazandırdığı müşterilerin bu dönemdeki siparişleri, tekrar siparişler dâhil). İki sütun aynı şeyi ölçmüyor; satır altındaki "N sipariş · N yeni müşteri" tam olarak bu farkı okutmak için orada.
    - **Kohort AYRI kapı açmadı:** çizimdeki "kaynağa göre tekrar sipariş" aynı `readCampaignRoi` satırlarının başka bir okunuşu (müşteri başına sipariş = sadakat). İkinci kapı, aynı atfı iki yerde hesaplamak olurdu.
    - **İçgörü `warming`, `absent` değil** — kapı var, haftalık iş henüz koşmamış olabilir; anlatı **tarihiyle** basılıyor, yoksa iş bir hafta koşmadığında geçen haftanın özeti bu haftanınmış gibi okunurdu.
    - **Müşteri gruplarında köprü YOK ve bu bilinçli:** `ANALYTICS §6` "Müşteriler kim der" diyor ama o ekranın daraltma kümesinde segment yok. Çalışmayan bir bağ kurmaktansa sayıyı gösterip köprüyü segment daraltması yazıldığı gün açmak doğru — 404'e giden bağ, olmayan bağdan kötüdür.
    - **Segmentler dönem çipine BAĞLANMADI:** "uyuyan müşteri" bugüne göre tanımlı bir hâl, seçili pencereye göre değil; bağlasaydık "son 7 günde kaç uyuyan vardı" gibi anlamsız bir soru üretirdik.
    - **Ticaret modu da doldu** (`readOrderRevenue` — `knip` onu tüketicisiz gösterdiği için fark edildi): hero'nun dördü de gerçek (Ciro · Sipariş · Ort. sepet · Dönüşüm), **çizimdeki B2C/B2B ciro şeridi** hero'nun ilk hücresine geldi ve zaman serisi modda kaynak değiştiriyor — Trafik defterden, **Ticaret `order` tablosundan** (`ANALYTICS §4`: parada tablo yetkili). Tek kaynaktan çizmek, kesin bir ciroyu örneklemli bir izle aynı güvende göstermek olurdu.
    - ⚠ **Gerçek veriyle ÜÇ arıza çıktı ve üçünü de `ui:shot` yakaladı** (tip denetimi hiçbirini göremezdi):
      **(c) "Dönüşüm %100,0"** — defterde tek ziyaret ve tek sipariş varken hero bunu yazıyordu. Sayı doğru, cümlesi yanlış: bir bakışta okunan bir gösterge olarak *"ziyaretçilerin tamamı sipariş verdi"* diyordu. Eşik kondu (`CONVERSION_MIN_SAMPLE = 30`, parametrik): altında oran gösterilir ama "örneklem küçük (N ziyaret)" denir ve **kıyas rozeti çizilmez** — güvenilmez bir oranın değişimi iki kat güvenilmezdir. Emsal ürün skorlarındaki `confident` eşiği. Analitikte en tehlikeli hata boş bir kutu değil, inandırıcı bir yanlıştır.
      **(a) Huninin adımları İÇ İÇE KÜMELER DEĞİL** — tek ziyaret sayfada altı ürün kartı görebiliyor, yani `product_view` `page_view`'dan büyük çıkabiliyor. Çubuk kutudan taşıyordu ve kayıp `−%-300` diye yazılıyordu. Oran 1'e kırpıldı, işaret ekrana bırakıldı (büyüme `+%300` olarak okunuyor, sızıntı sayılmıyor). Regresyon testi yazıldı.
      **(b) Tek noktalı seri boş bir kutu çiziyordu** — `polyline` iki nokta ister ve boş kutu "veri yok" diye okunuyordu; oysa veri VAR, eğilim yok. Artık "eğilim için en az iki gün gerek" diyor (çizimin kendi ilk-gün cümlesi).
  - *Bitti:* çizimdeki her blok ya gerçek sayı ya gerekçeli veri hâli gösteriyor; hiçbir blok uydurma rakam üretmiyor

## Şerit yorumları (04.08 — kullanıcı isteği)

> Modül yazılmadan önce üç şerit kendi açısından görüşünü buraya yazar. Amaç: kapsamı kodlamadan
> önce **çakışmaları ve sınır belirsizliklerini** görünür kılmak. Her şerit kendi başlığı altına
> yazar, başkasınınkini değiştirmez.

### Operasyon yüzeyi

**1. İki görev BAŞKA EKRANDA fiilen tamamlandı — kapsam güncellenmeli.**
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

**3. Nav girişi bugün ÖLÜ** (`/operations/analytics`, `09-admin.md` nav taraması). Ekran yayına girene kadar
raydan çıkarılması gerekebilir — ama bu modülün sırası en sonda olduğu için (kullanıcı kararı,
03.08) girişin uzun süre ölü kalacağı bilinmeli.

**4. Ekran tarafında beklentim küçük ve nettir:** analitik ekranı **okuma-ağırlıklı** olacak, yazma
kapısı yok. Yani bu modülde operasyon şeridinin işi büyük ölçüde *sunum*: kapılar hazır geldiğinde
ekran hızlı iner. Blokaj çıkarsa `13.1` (olay toplama) yüzünden çıkar — bugün hiç `AnalyticsEvent`
yazılmıyor, yani ekran yazılsa boş liste gösterir.

### Arka uç

**Karar önerim tek cümlede: olay defterinde kimlik kolonu OLMAZ.** Uzun gerekçe tartışma
dokümanında; buraya kalıcı olması gerekenler yazıldı (o klasör commit'lenmiyor).

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
(`BEKLEYEN(09.10)`). İkisi tamamlandığı gün ayrı bir `customer_activity` defteri açılabilir — kendi
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
doğruluyorum): ikisi de `[ ]` ama işleri tamamlandı — `weighSwipesByProduct` + `getProductSignals` motorda
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

**5. Müşteri yüzeyinde analitiği OKUYAN tek yer var ve o bende:** vitrin seçkisi (`readShowcase`).
**BAĞLANDI (04.08):** ölçüt son N günün görüntüleme + sepete ekleme toplamı, kaynak
`analytics_daily_product` — ham defter değil (`ANALYTICS §5`). Ürünün günlük özete boyut olarak
değil **kendi tablosuna** alınması arka ucun kararıydı ve doğruydu: `analytics_daily`'ye eklemek
satır sayısını katalog büyüklüğüyle çarpar, huni/ısı okumaları da o şişmiş tabloyu tarardı.
Katalog yedeği kalıcı — sinyal birikmemişken band boş kalmıyor.

**6. 13.1'den beklediğim tam olarak iki şey:** kapının imzası (atıcının çağıracağı tek fonksiyon)
ve `packages/types`'taki terk sebebi ayrık birliği. İkisi gelince atıcılar **tek turda** yazılır —
planladığım olayların hiçbiri yeni kapı açmıyor, hepsi zaten sunucuya gelen eylemlere asılıyor.
Tek istisna `shareProductAction` ve o da yeni bir uç değil, düğmenin var olan işinin sunucuya
taşınması.

## Netleşecekler

- **Dar izin katmanı (Faz 2):** Meta/Google pixel açılınca gereken küçük izin katmanı — o reklamlar başlarken kurulur; çekirdek analitik bundan bağımsız tam çalışır.
