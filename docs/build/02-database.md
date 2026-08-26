# 02 — `packages/database`: Taban Servis ve İlk Şema

## Kapsam

Veritabanına konuşan tek katman: Supabase istemci kurulumu (yalnız sunucu tarafı), `BaseDbService` (jsonb-güvenli camelCase↔snake_case dönüştürücüler, `{data, error}` deseni, RPC yardımcıları), migration altyapısı ve **ilk şema migration'ları** (tüm tablolar). İş mantığı yok — o `domain-core`'da; burada yalnız erişim ve şema.

## Okunacaklar

- `STACK.md §6` (BaseDbService), `§13` (veri erişim güvenliği + migration — **taslak, netleşecek**)
- `WORKFLOW.md §2-3` (additive-only migration, deploy sırası)
- `DATA_MODEL.md` + `data-model/*.md` (tablolar, kısıtlar için)

## Bağımlılık

`01-types` bitmiş olmalı (şemalar tablo tanımlarının kaynağı).

## Başlarken verilecek izah (örnek)

> "Veritabanı katmanını kuruyoruz: tabloları oluşturan numaralı SQL dosyaları (migration — şema değişikliklerinin sıralı, geri alınamaz kayıtları) ve tüm servislerin miras alacağı bir taban sınıf. Taban sınıf iki dert çözüyor: kod camelCase, veritabanı snake_case konuşur — dönüşümü tek yerde yapar; ve hata fırlatmak yerine `{data, error}` döner, çağıran taraf hatayı bilinçli ele alır. Güvenlik modeli (kim hangi satırı okuyabilir) taslak durumda — kodlamadan önce seçenekleri konuşup netleştireceğiz."

## Görevler

- [x] (02.1) **[Önce netleştir]** Migration aracı ve veri erişim modeli konuşması (aşağıdaki "Netleşecekler") — kod bu karardan sonra
- [x] (02.2) Supabase projesi + env kurulumu (`.env.example` güncellenir; anahtarlar yalnız sunucu tarafında)
  - *Bitti:* lokal bağlantı smoke testi geçiyor
- [x] (02.3) Migration altyapısı: numaralı SQL, tek transaction'da uygulama, `schema_migrations` kaydı, hata durumunda durma
  - *Bitti:* boş projeye sıfırdan kurulum tek komutla; ikinci çalıştırma no-op
- [x] (02.4) İlk şema migration'ları — tüm tablolar + enum tipleri + kısıtlar: FK'lar, unique'ler (`Product.slug`, `Category.slug`, `WebhookEvent(provider, ~~provider_event_id~~ → `event_id`)`, `Cart.customer_id`), temel index'ler (sipariş/stok/hareket sorgu yolları)
  - *Bitti:* `DATA_MODEL.md`'deki her varlığın tablosu var; kısıt ihlali testle doğrulanmış (örnek: aynı webhook event iki kez yazılamıyor)
  - **Durum (26.08) — SATIR NEDEN `[~]` HİÇBİR YERDE YAZMIYORDU; ölçüldü, sebep artık kayıtlı.**
    Bir `[~]`, gerekçesi olmadan üstlenilemez: okuyan ajan neyin eksik olduğunu bilemez ve satır
    kapanmadan durur. İki ölçüm:
    - **Kriter yalnız KISMEN makinede.** `docs:check §1` (DATA_MODEL ↔ migration ↔ Zod) **29 tabloyu**
      denetliyor, veritabanında **84 tablo** var. Yani "her varlığın tablosu var" iddiası 29 için
      doğrulanmış, 55 için **ölçülmemiş** — "karşılandı" da denemez, "karşılanmadı" da.
    - **Satırın kendi bitiş ÖRNEĞİ olmayan bir teste dayanıyor.** *"aynı webhook event iki kez
      yazılamıyor"* deniyor; kısıt gerçekten var (`webhook_event_provider_key (provider, event_id)`)
      ama hiçbir test onu sınamıyor — `webhook-event.test.ts` diye bir dosya yok. Bu, **aynı dosyanın
      02.5'te bir kez itiraf ettiği** hatanın ikinci örneği (*"BÖYLE BİR TEST HİÇ YOKTU"*).
      Küçük ek: satır kısıtı `WebhookEvent(provider, provider_event_id)` diye anıyor, kolonun gerçek
      adı `event_id`.
    - **Kapanış şartı artık yazılı:** §1 kapsamı 84 tabloya çıkar (ya da neden çıkmadığı yazılır) +
      webhook tekillik testi yazılır. İkisi de bu turun kapsamında DEĞİL (kullanıcı sırası 26.08:
      önce kayıt düzeltmesi).
  - **Durum (26.08) — KAPANDI; iki şart da karşılandı, ama BEKLENDİĞİNDEN BAŞKA yoldan.**
    - **Kapsam şartı 02.18 ile çözüldü.** "§1'i 84 tabloya çıkar" diye yazılmıştı; olan şu oldu ki
      §1'in doküman↔tablo karşılaştırması **emekli edildi** — alan listesi artık migration'lardan
      TÜRETİLDİĞİ için ayrışması yapısal olarak imkânsız, karşılaştırılacak iki taraf kalmadı.
      Sonuç ölçüldü: **84 tablonun 75'i** kendi bölümüne ve türetilmiş listesine sahip (denetim
      öncesi 29'du). Bu tur üç varlığa bölüm de yazıldı — `postal_code_demand` · `zone_notice`
      (depo) ve `variant_stock_notice` (katalog); gerekçeleri migration künyelerinde zaten yazılıydı,
      iş onları çıkarmaktı.
    - **Bölümü OLMAYAN dokuz tablo gerekçelendirildi** (`DATA_MODEL.md` varlık indeksinde):
      ara tablo (`product_collections` · `discount_use` · `email_verifications`) · analitik ÖZETİ
      (`analytics_daily` + üç türevi) · başka şeridin alanı (`assistant_proposal` · `mcp_call_log`
      · `mcp_connection_key`, `docs/talep/not-mcp-veri-modeli-bolumu-bekliyor.md` ile bildirildi).
      Ölçüt yazıldı: **bir tablo, bağladığı varlıktan bağımsız bir KARAR taşıyorsa bölümü olur.**
    - **WEBHOOK TEKİLLİK TESTİ YAZILDI** (`webhook-event.test.ts`, 3 iddia). Satırın bitiş örneği
      buydu ve 26.08'de ölçüldü ki hiç yazılmamış: kısıt vardı, testi yoktu — yani ödeme akışını
      tekrardan koruyan tek şey **hiç sınanmamış bir indeksti.** Çivilenenler: ikinci geliş taze
      DEĞİL ve aynı satırı gösterir · EŞZAMANLI iki sahiplenmede yalnız biri taze döner (kontrol
      ile yazım ayrı ifadeler olsaydı ikisi de "yeni" derdi ve **tahsilat iki kez yazılırdı**) ·
      tekillik ÇİFTTEDİR, başka sağlayıcı aynı olay kimliğini kullanabilir.
      **Testin yakaladığı doğrulandı:** `webhook_event_provider_key` indeksi geçici olarak
      kaldırıldı → üç test de kırmızı; geri konunca üçü de yeşil.
    - **Satırın kolon adı da düzeltildi:** `WebhookEvent(provider, provider_event_id)` yazıyordu,
      gerçek ad `event_id` — aynı yanlış ad `data-model`'de de duruyordu (02.18 turunda bir ajan
      buldu), ikisi de bu turda düzeldi.
- [x] (02.5) `BaseDbService`: jsonb-güvenli case dönüştürücüler (LocalizedText içleri dönüşmez), `{data, error}` deseni, `toRpcParams` yardımcısı
  - *Bitti:* ~~dönüştürücü birim testleri (jsonb alanı bozulmuyor) geçiyor~~ **BÖYLE BİR TEST HİÇ YOKTU** (ölçüldü 15.08: `packages/database/src/utils/` altında tek test dosyası yok) — vaat edilmiş ama teslim edilmemiş bir kanıt, `13.5`'in *"export çalışıyor"* satırıyla aynı sınıf (`CLAUDE.md §5`).
  - **Durum (15.08 — KURAL NİHAYET KODA GEÇTİ; kullanıcı kararı).** Satırın kendisi *"jsonb-güvenli … LocalizedText içleri dönüşmez"* diyordu ve `STACK §211` de aynı sözü veriyordu; **ikisi de niyetti, kod jsonb'nin içine iniyordu.** Kimse fark etmedi çünkü kural `LocalizedText` için yazılmıştı ve `tr`/`fr`/`de` anahtarlarında ne alt tire ne büyük harf var — dönüştürücü onlara iki yönde de dokunmuyor. Yani koruma, yazıldığı durumda zaten gereksizdi; gerekli olduğu durumlar (serbest anahtarlı ve dış kaynaklı jsonb) sonradan geldi ve o arada repoda **iki biçim yan yana** oluştu.
    - **Ölçüt:** kolon adı şemanın SÖZLÜĞÜDÜR (çevrilmesi meşru bir adlandırma köprüsü), jsonb anahtarı uygulamanın yazdığı VERİDİR. Dönüşüm artık satır düzeyinde kalıyor.
    - **Varsayılan TERS çevrildi:** inmemek esas, inmek beyan (`BaseDbService.embeds`). Alternatif kurgu *"servisler jsonb alanlarını bildirsin"*di; arızanın sesi belirledi — jsonb beyanı unutulursa veri **sessizce** bozulur, gömme beyanı unutulursa Zod o sorguda **anında** patlar. Bu tur birebir yaşandı: `ProductListingService` atlanmıştı ve katalog okuması `variants[0].productId` ile gürültüyle düştü.
    - **İki sessiz kırılma noktası ölçülerek bulundu:** sağlık grafiğinin `metrics->system->>disk_used_pct` yolları ve `analytics_postal_code_orders`ın `address_snapshot->>'postal_code'` okuması — ikisi de hata vermez, `null` döner (biri grafiği boşaltır, öteki posta kodu sayacını sıfırlar).
    - **Bir test eski ASİMETRİYİ çiviliyormuş:** `checkout-session` `{utm_source}` yazıp `{utmSource}` bekliyordu — uygulama bir şekil yazıp başka şekil okuyordu. UTM etiketleri adreste zaten `utm_source` diye geliyor; onları "düzeltmek" bu katmanın işi değildi.
    - **Kapsam dar çıktı:** gömülü seçimi olan 9 dosyanın 7'si beyan etti; kalan ikisi (`discount`, `stock-adjustment`) ham sorgu — çeviriciye hiç uğramıyorlar. RPC'ler de etkilenmedi (`executeRpc` parametreleri hiç çevirmiyor).
    - **Doğrulama:** `db:refresh` (kapsam tam) · typecheck 18/18 · lint temiz · tam paket **2695/2696** (düşenler zaman aşımı, üçü de yalıtılmışta yeşil) · `mobile-api` katalog 25/25 · `proposal` 35/35.
    - **Vaat edilen test NİHAYET YAZILDI** (`case-transformers.test.ts`, 12 iddia · 147 ms). Çivilenenler: satır düzeyi dönüşüm iki yönde · jsonb'nin okumada **ve yazmada** korunması (iç içe nesne ve dizi dahil) · yazma yönünde gömme istisnasının OLMAMASI · beyan edilen gömmenin çevrilmesi ve **iki katlı** gömmenin tek beyanla kapsanması · beyanın app tarafı adıyla eşleşmesi (`order_item` → `orderItem`) · beyan yokken gömmenin ham kalması (yani arızanın sessiz değil gürültülü olması) · rakam tuzağının kolon adında SÜRDÜĞÜ ama jsonb içinde artık doğmadığı.
    - Dosya **birim projesinde** koşuyor (`vitest.config` → yeni `PAKET_DBSIZ` sabiti): kaynak modül hiçbir şey import etmiyor, yani her şerit kendi değişikliğini DB'ye vurmadan sınayabilir (`CLAUDE §4b`). Sabit `WEB_LIB_DBSIZ`ten AYRI çünkü `docs:check §3i` onu adıyla okuyup `'apps/…'` önekiyle tarıyor — paket yolu oraya girseydi denetimin kapsamı ile listesi sessizce ayrışırdı.
  - **Durum (28.07 — yerel yığının aralıklı 502'si teşhis edildi ve kapatıldı):** Haftalardır rastgele
    görünen `An invalid response was received from the upstream server` bir kod hatası değildi. Kong
    günlüğü sebebi yazıyordu: `recv() failed (104: Connection reset by peer) while reading response
    header from upstream`. PostgREST boşta duran keep-alive bağlantısını kapatıyor, Kong o bayat
    bağlantıyı yeniden kullanıyor. **GET'i Kong kendiliğinden taze bağlantıyla yeniden deniyor** — bu
    yüzden okumalar hiç düşmüyordu ve belirti "rastgele" görünüyordu; POST'u denemiyor (idempotent
    değil), dolayısıyla hata HER ZAMAN bir yazmada çıkıyordu (testlerin `beforeAll` insert'leri,
    seed'in ilk bölümü). İki katmanda kapatıldı: **(1)** `waitForRest` — `db reset`/`start`
    konteynerleri yeniden başlatır ve komut VERİTABANI sağlıklı olur olmaz döner, PostgREST hâlâ şema
    önbelleğini yüklüyor olabilir; seed ve test kurulumu ilk sorgudan önce hazır olmasını bekler
    (tavana varınca sessizce devam etmez, hatayı yükseltir). **(2)** yerel istemcide bayat keep-alive
    için TEK seferlik yeniden deneme — bağlantı istek okunmadan kapandığı için yazma hiç
    gerçekleşmemiştir, tarayıcıların yaptığı da budur. `LOCAL_HOST` sınamasıyla **yalnız yerelde**
    devrede: üretimde 502 işlemin ORTASINDA da doğabilir, orada sessiz yeniden deneme kaydı ikizler.
    Ayrıca `purgeTestData` tanımsız kimlikleri ayıklıyor — `beforeAll` düşünce teardown
    `invalid input syntax for uuid: "undefined"` diye İKİNCİ bir hata basıp asıl sebebi gömüyordu.
    Sonuç: üç koşu üst üste 49/49 dosya · 491/491 test.
- [x] (02.6) İlk somut servisler (okuma/yazma smoke): `SettingsService` (kapsamlı çözücü: özgül → global) + bir örnek CRUD servisi
  - *Bitti:* Setting çözücüsü "bölge değeri globali ezer" birim testini geçiyor
  - **Durum (27.07):** `0013_settings.sql` + `SettingsService` *(not 27.07'de `SettingService` diye yazılmıştı — aynı dosyanın alt bilgisindeki kullanıcı kararıyla çelişiyordu, 26.08'de düzeltildi)*. Özgüllük sırası **bölge > kanal > ülke > global**; hiç satır yoksa çağıranın verdiği varsayılana düşer — kodda sabit kalmaz, varsayılan çağrı yerinde görünür. Süreç içi önbellek (ayarlar her checkout'ta okunur, neredeyse hiç değişmez); yazmada düşer. Bozuk değer akışı kilitlemez, varsayılana döner. 9 test.
  - **Kapsam anahtarı metin:** `scope_id` üç farklı tipi taşıyor (kanal 'b2b', ülke 'FR', bölge uuid) — tip başına ayrı kolon açmak tabloyu boş kolonlarla doldururdu.
- [x] (02.7) Seed: `Setting` varsayılanları (TTL 30 dk, eşikler, tavanlar — `DATA_MODEL.md` Setting listesi) + bir test kategorisi/ürünü
  - *Bitti:* temiz kurulum + seed sonrası vitrin sorgusu veri dönüyor
  - **Durum (27.07):** 16 varsayılan migration'ın kendisinde (`insert`) — seed script'inde değil. Sebep: bunlar test verisi değil, **sistemin çalışması için gereken zemin**; `db:reset` sonrası seed çalıştırılmasa da kesim saati ve TTL yerinde olmalı. Para değerleri cent (STACK §8), yüzdeler tam sayı.
  - **Seed genişletildi (27.07) — 15 tablo daha.** Katalog doluyken alt zemin boştu: fiyatsız ürün satılamıyor, stoksuz ürün vitrinde "tükendi" görünüyordu. Eklenenler: fiyat (b2c TTC + b2b HT, geçmiş/ileri tarihli liste, müşteriye özel) · teslimat bölgesi · adres · tedarikçi + ürün-kod eşlemesi + tedarik siparişi + mal kabul · stok partileri · stok düzeltmesi · sıcaklık kaydı · ticari müşteri kartları + personel · sepet · sipariş (kalem, parti, geçiş logu, rezervasyon) · iş izi.
  - **Ölçüt "bir ekranın her hâli listede bulunabilmeli"dir**, satır sayısı değil. Bu yüzden sınır durumlar bilinçli serpiştirildi: tarihi geçmiş DLC (satılamaz) ve DDM (satılabilir) parti, indirimli near-expiry teklif, alış fiyatı girilmemiş parti, eksik gelen tedarik siparişi, pasif bölge, rota dışı adres, bayat sepet, vadesi geçmiş ödenmemiş sipariş, hatalı biten cron. Tek "mutlu yol" satırı bu hâllerin hiçbirini göstermezdi.
  - **Siparişler gerçek akışla kurulur** (ayır → onayla → hazırla → yola çık → teslim et → kapat), elle durum yazılarak değil: rezervasyon, kalem–parti kaydı, geçiş logu ve kâr snapshot'ı böylece kendiliğinden tutarlı doğar. Seed aynı zamanda 06/07 zincirinin uçtan uca dumanı olur.
  - ~~**Dev admin SEED'LENİR — ve bu zorunludur.**~~ **KALKTI (19.08).** Bu satır sabit kimlikli bir `dev-admin@lezzet.local` profilini zorunlu kılıyordu; gerekçesi, dev auth bypass'ının enjekte ettiği sahte kimliğin `order_status_log.actor_id` FK'sinden düşmemesiydi. **Bypass söküldü** (`apps/web/lib/guard.ts` künyesi — ölçüldü: oturumsuz `/operations` yerelde 200 dönüyordu, production sunucusunda 307), dolayısıyla o profil de, onu bağlayan `DEV_ADMIN_PROFILE_ID`/`DEV_BYPASS_AUTH_ID` sabitleri de gitti. Aktör artık seed'in GERÇEK yöneticisi (`yonetim@lezzetanatolia.fr`) ve kimliği sabitten değil satırdan okunuyor.
  - **Bootstrap yine tetiklenmez, ama sebebi değişti:** veritabanında admin bulunduğu için (`yonetici` profili) 0002'nin "ilk giriş yapan admin olur" açılışı çalışmaz; gerçek hesap `customer` açılır, yükseltme `pnpm set-role <e-posta> admin` iledir. Seed yalnız yerel kurulumdur — üretim veritabanına atılmadığı için oradaki bootstrap olduğu gibi durur.
  - **Giriş hesabı bir MÜŞTERİYE de açılır (19.08):** `claire.weber@example.fr`. Dev girişinin "Müşteri" düğmesi bugüne dek kullanıcının kendi adresine basıyordu ve o adres `auth.users`ın en eski satırı olduğu için bootstrap onu **admin** yapmıştı — yani düğme baştan beri operasyona giriyordu. OTP akışı kapanmaz: öteki sekiz müşteri auth'suz kalır, o yol her yeni e-postayla açık.
  - **Değerler deterministik** (indise göre, rastgelelik yok) ve her bölüm kendi guard'ıyla idempotent — seed'i tekrar çalıştırmak güvenlidir, iki koşu aynı veriyi kurar.
- [x] (02.8) **`order_item_batch` junction servisi (kural borcu — STACK §6):** `OrderService` içindeki üç ham okuma (`listBatches`, kalem maliyetleri, `recallByStocks`) kendi `BaseDbService` alt sınıfına taşınır
  - *Bitti:* kalem–parti kaydını okuyan hiçbir yer ham `this.supabase` yazmıyor; mevcut testler geçiyor
  - **Neden bir borç:** kural "junction tablosu = kendi alt sınıfı" diyor; kalem–parti kaydı sipariş servisinin içinden ham `this.supabase` ile okunuyordu. Üçü BİRLİKTE taşındı — yalnız birini ayırmak aynı tabloyu iki eve bölerdi, ki bu eski hâlden kötüdür: "bu tablo nereden okunuyor" sorusunun iki cevabı olurdu.
  - **Durum (03.08):** `OrderItemBatchService` (`listByOrder` · `recallByStocks` · `itemCosts`) + `WarehouseTransferLineService` (`listByTransfer`). İkincisi ayrı bir görev değildi ama aynı borcun ikinci örneğiydi ve işareti bunu söylüyordu (*"ikisi birlikte çıkarılacak"*) — ayrı bırakmak, kapanmış bir görevin altında asılı kalan bir işaret demekti.
    - **İkisinde de YAZMA YOLU YOK** (`never, never`) ve bu bilinçli: satırlar RPC'lerle doğuyor (`record_preparation` · `quick_sale` · sevk/kabul), çünkü junction satırının yazılmasıyla stoğun hareketi **bölünemez** bir işlem (`STACK §13`). Tek satır yazma kapısı açmak o bölünmezliği delen ikinci bir yol olurdu.
    - **`selectRows` `private`den `protected`e alındı.** Bazı okumaların çıktısı bir VARLIK değil: geri çağırma isabeti ve kalem maliyeti gömülü ilişkilerden türüyor ve doğrulama **toplamadan sonra** yapılıyor. Aradaki ham şekle Zod şeması yazmak, yalnız araya girmek için var olan bir tip üretirdi. Ham sorgu kapısı DEĞİL: sorguyu taban sınıf kuruyor, alt sınıf yalnız süzgeç ve `select` veriyor.
    - Çağıranlar taşındı: sipariş detayı okuması, geri çağırma aksiyonu, kâr raporu ve beş test dosyası.
- [x] (02.9) **Para dönüşümü sınırda yapılsın (kural borcu — STACK §8):** servisler `dbNumeric` para kolonlarını **cent** olarak döndürsün (`…Cents` adıyla); çağrı yerlerindeki elle `toCents` çağrıları kalksın. `touches: packages/types/src/**, packages/database/src/**`
  - *Bitti:* bir para alanı okuyan hiçbir çağrı yeri dönüşüm yapmıyor; alan adları `…Cents` ile bitiyor; mevcut testler geçiyor
  - **Neden borç, ve neden "biçim" DEĞİL (30.07, gerçek hatayla bulundu):** STACK §8 *"DB'de `numeric`, sınırda (servis katmanında) cent'e çevrilir"* diyor. Kod bunu yapmıyor — servisler euroyu olduğu gibi döndürüyor, dönüşüm **her çağrı yerine** dağılmış (bugün ~20 nokta). Sonuç: müşteri sipariş detayı ekranı 74,17 €'yu **0,74 €** gösterdi. Kullanıcı ekran görüntüsüyle yakaladı; ben iki dosyayı ortak helper'a çektim ama **kök neden duruyor.**
  - **Tip sistemi bunu yakalayamaz:** euro da cent de `number`. Bu yüzden ya sınır gerçekten servis katmanına çekilir (bu görev) ya da tek savunma adlandırma kalır. Branded type (`type Cents = number & {…}`) de düşünülebilir — o zaman derleyici yakalar; kararı bu görev verecek.
  - **Ölçü:** yalnız PARA kolonları. Yüzde/oran çeviren `Math.round(x * 100)` çağrıları (geri bildirim skoru, sistem sağlığı, görsel oranı) bu işin kapsamı DIŞINDA — onlar cent değil.
  - 🔴 **KAPSAM ÖLÇÜLDÜ (03.08) ve satırdaki "~20 nokta" tahmini YANLIŞTI:** **121 çağrı, 42 dosya, ~40 para kolonu.** Üç şeridin de alanına yayılıyor. Tahminin altı katı; iş "bir öğleden sonra" değil, dilimlenmesi gereken bir refactor.
  - 🔴 **YAPISAL ENGEL — satır bunu öngörmemişti.** Uygulama alan adı ile DB kolon adı `camelToSnake` ile BAĞLI: `amountCents` yazınca taban sınıf `amount_cents` kolonunu arar, oysa kolon `amount`. Yani "alan adları `…Cents` ile bitsin" tek başına uygulanamıyor; üç yol var:
    - **(a) DB kolonlarını `…_cents`e çevir ve birimi değiştir** — 40 kolon + SQL'de para aritmetiği yapan 22 yer (RPC ve görünümler). `STACK §8`'in *"DB'de `numeric`"* kararıyla da çelişir. **Elendi:** riski faydasının kat kat üstünde.
    - **(b) Alanı `amount` bırak, cent tut** — adı birimini söylemeyen bir para alanı, yani 74,17 € → 0,74 € hatasının tam zemini. **Elendi.**
    - **(c) SEÇİLEN: eşleme taban sınıfta.** Servis kendi para alanlarını beyan eder (`moneyFields`), `BaseDbService` okumada euro→cent çevirip adı `…Cents`e taşır, yazımda tersini yapar. Şema düz `z.object` kalır — yani `.partial()`/`.pick()`/`.extend()` türetmeleri (`CLAUDE.md §1`) bozulmaz. DB'ye hiç dokunulmaz, migration yok.
      - Sınır: projeksiyonlu okumalar (`getPageAs`, gömülü `select`) bu eşlemenin DIŞINDA kalır — orada dönüşüm bugünkü gibi elle yapılır ve doğrudur; otomatik eşleme gömülü ilişkinin içine inemez.
  - **Branded tip (`type Cents = number & {…}`) kararı ERTELENDİ:** adlandırma bittikten sonra bakılmalı. Önce sebebi (dağınık dönüşüm) kaldırılır; branded tip kalan artık sınıfa karşı ikinci bir emniyettir ve tek başına 42 dosyayı kırmızıya çevirir.
  - **Sıra:** para alanı ailesine göre dilim dilim (fiyat → indirim → stok → sipariş → para hareketi → profil), her dilim ayrı commit ve yeşil. Üç ajan aynı ağaçta çalışıyor; tek büyük commit çakışma üretir.
  - **Durum (03.08) — profil ailesi BİTTİ (operasyon şeridi devraldı, kullanıcı kararı).** Aile tek alandan ibaret: `creditLimit` → **`creditLimitCents`**. `discountPercent` de `numeric` ama YÜZDE'dir ve satırın kendi ölçüsüne göre kapsam dışı — bilerek bırakıldı, künyesine de yazıldı.
    - `UserProfileService.moneyFields = ['creditLimitCents']`; DB kolonu `credit_limit` **euro `numeric` kaldı** (ölçüldü: `2500.00`), migration yok. Dönüşüm sınırda.
    - **Dört elle çevirme kalktı** ve dördü de aynı alanı ayrı ayrı çeviriyordu: `customers/actions` (okuma `toCents`, yazma `fromCents`), `order-detail-read` (`toCents`), `checkout-options` (**`customer.creditLimit * 100`** — satırdaki 74,17 € → 0,74 € hatasının doğduğu desenin birebir kendisi).
    - **Sızıntı nöbetine DOKUNULMADI** (`lib/courier/day.test.ts:137`): kuryeye giden veride yasaklı alan adlarını alt-dize ile arıyor, `creditLimit` dizesi `creditLimitCents` içinde geçtiği için nöbet aynen çalışıyor. Adı uzatmak, geri dönen bir `creditLimit` alanını yakalayamaz hâle getirirdi — nöbeti zayıflatmak olurdu.
    - Doğrulama: `user-profile.test.ts` 21/21 (fixture cent yazıp geri okuyor, yani eşleme uçtan uca sınandı). `checkout-options.test.ts`'te kalan iki düşüş SİPARİŞ ailesinin (`CreateOrderItemSchema.parse`) — o dilim hâlâ arka uç şeridinin elinde.
    - `scripts/seed/people.ts` yalnız kendi hunk'larım indekse alınarak commit'lendi; aynı dosyada duran başka şeridin commit'siz işi (Kehl personeli, `preferredLanguage`) çalışma ağacında dokunulmadan bırakıldı.
    - **Kalan aileler:** sipariş (sürüyor) · para hareketi.
  - **Durum (03.08) — kurye gün kapanışı ailesi BİTTİ (operasyon şeridi, çakışmasız dilim).** Kalan aileler ölçüldü ve **ayak izi tamamen boşta olan tek aile** buydu: beş dosyanın dördü serbest, meşgul olan tekinin (`day-close.test.ts`) değişikliği sipariş kaynaklıydı ve başka satırlardaydı. 18 alan: `expected/counted/difference` × `Cash/Card/Cheque` üç şekilde.
    - **Üç şekil, üç ayrı mekanizma** — bu ailenin öğreticiliği burada: `CourierDayClose` bir TABLO (→ `moneyFields`), `CourierDayCollection` bir GÖRÜNÜM (→ kendi servisinde `moneyFields`), `CourierDayCloseResult` ise bir **RPC dönüşü** (`jsonb`) ve `moneyFields` yolundan geçmez — orada arka uç şeridinin açtığı ortak yardımcı kullanıldı (`utils/rpc-money`).
    - `close()` girişi de cent'e geçti (`countedCashCents`); RPC euro beklediği için çeviri servis sınırında `fromCents` ile yapılıyor — çağıranın birim çevirmesi gereken tek bir yer kalmadı.
    - **Kayan nokta eşiği kalktı:** kapanış farkı artık tamsayı çıkarma, yani "kuruş altı kalıntı" diye bir hâl doğmuyor. Tohumdaki `euro()` yuvarlaması da bu yüzden düştü.
    - Doğrulama: `lib/courier` 29/29 (RPC yolu dahil — `differenceCashCents: -500` bekleyen test geçiyor), lint temiz, `docs:check` kurye tarafında sıfır bulgu.
    - **`day-close.test.ts` yalnız kendi hunk'larımla commit'lendi**; aynı dosyadaki sipariş ailesi hunk'ı (başka şeridin, commit'siz) dokunulmadan bırakıldı.
  - **Kalan tek aile: sipariş** (ve onun sürüklediği muhasebe/banka/para dosyaları) — tamamı arka uç şeridinin elinde.
  - ⚠ **YÜRÜTME NOTU (03.08, operasyon şeridi — işin GEREKLİLİĞİNE değil, YÜRÜTÜLÜŞÜNE dair).** Göçün kendisi gerekli ve kapsamı doğru çizilmiş; itiraz yok. Üç karar da yerinde: yalnız para kolonları (yüzde/oran dışarıda), DB kolonlarına dokunulmuyor (seçenek (a) elenmiş), branded tip ertelenmiş. **Daha da daraltmak en kötü seçenek olurdu** — yarı göç edilmiş hâlde kodu okuyan kişi hangi `number`ın hangi birim olduğunu ayırt edemez; satırın kendi (b) analizi bunu zaten söylüyor.
    - **Tutmayan söz yukarıdaki "Sıra" satırının kendisinde:** *"her dilim ayrı commit ve yeşil"*. 03.08 02:30 ölçümü — sipariş ailesi **commit'siz** açıkken (`order.schema.ts` +32/−28, bir düzine servis ve `domain-core` dosyası birlikte) `apps/web` doğrudan `tsc` ile **167 hata** veriyor, `domain-core/accounting` ve `apps/web` birim testleri kırmızı.
    - **Bunun sebebi dilimin ŞEKLİ:** aile dilimi yatay bir kesit (tip → servis → iki yüzeyin tüketicileri). `Order.total` → `totalCents` yazıldığı an her iki yüzeyin çağrı yerleri aynı anda kırılıyor; dilim ancak uçtan uca bitince yeşile dönüyor. Yani "dilim = aile" ile "her dilim yeşil" birbirini tutmuyor.
    - **Kural zaten var ve bu vakayı tarif ediyor:** `WORKFLOW §7` paralel çalışma kuralı 3 — *"Ajan başına ayrı dal/çalışma ağacı. Aynı çalışma dizininde iki ajan koşmaz (dosya yarışı)."* Projede emsali de var: `19-coklu-depo.md` çok-depo göçünü *"Tek ajan, tek dal… bu pencerede diğer ajanlar DB'ye vuran iş almaz; kapanış: `db:reset` → `pnpm test` → merge"* diye yürüttü. Cent göçü aynı sınıfta ama o protokole alınmadı.
    - **Ölçülen bedel (varsayım değil):** *(a)* öteki şeritler kendi işlerinin doğrulamasını 167 hatalık gürültüden ayıklamak zorunda; *(b)* `turbo` önbelleği bir tur **yanlış "temiz" raporu** verdi — operasyon şeridi buna dayanarak hatalı bir doğrulama bildirdi, `apps/web` içinde doğrudan `tsc` koşana kadar fark edilmedi; *(c)* `7bf4967` başka bir ajanın **commit'lenmemiş `STACK.md` düzenlemesini** de içine aldı (içerik doğru, sahiplik yanlış); *(d)* tam paket üç ardışık koşuda 1 → 5 → 196 test düşürdü, hangisinin gerçek hangisinin geçiş hâli olduğu ancak yalıtım koşularıyla ayrıldı.
    - **Öneri (karar arka uç şeridinin + kullanıcının):** kalan aileler (sipariş · para hareketi · profil) **dalda** yürüsün; dal olmayacaksa kural sertleşsin — bir aile, öteki şeritlerdeki çağrı yerleri dahil **tek yeşil commit**. Sipariş ailesi en büyüğü (en çok para alanı, en çok tüketici); yalnız o dala alınsa bile yeter.
    - **Çalışma zamanına sızan bir bulgu:** `apps/web/app/(operations)/operations/orders/orders-read.ts:102` `openAmountCents`'e eski adları geçiyor (`total`/`amountCollected`/`amountRefunded`) → üçü `undefined` → sonuç **`NaN`**. Siparişler ekranının "kapıda açık tutar" sayacı boş değil, YANLIŞ görünür. 167 hatanın çoğu derlemede düşen türden; bu biri değil.
    - **Göç bitince branded tip yeniden masaya gelmeli** (satırda ertelenmiş, doğru): bu hata sınıfını "olası değil"den "imkânsız"a taşıyan tek şey o.
  - **Durum (03.08) — dilim 1/6 BİTTİ: fiyat ailesi.** Mekanizma (c) kuruldu ve ilk aile üstünde çalışıyor.
    - `BaseDbService.moneyFields` — beyan eden servis için taban sınıf ÜÇ yerde birden çevirir: okunan satır (euro→cent), yazılan satır (cent→euro) ve **süzgeç değeri**. Üçüncüsü satırda yazılı değildi ve en tehlikelisi: `{ amountCents: 1690 }` çevrilmezse sorgu 1690 € arar, hata patlamaz, **liste sessizce boş döner**. Keyset imleci de cent'te tutulur (`pageOf` çevirir, `keysetGroup` geri alır) — uygulamanın gördüğü her para sayısı cent, imleç dâhil.
    - `PriceSchema.amount` → `amountCents` (`z.number().int()`, `dbNumeric` düştü); `PriceService` beyanı verdi. DB'ye dokunulmadı, migration yok. 11 çağrı yerindeki elle `toCents`/`fromCents` kalktı; `VariantOption.listPrice` de `listPriceCents` oldu (euro adıyla duran bir para alanını dokunduğum yerin yanında bırakmak, kapatılan hatayı yeniden açmaktı).
    - **`docs:check` kuralı devrede** (denetim A7 şartı): bir `…Cents` şema alanının servis `moneyFields` beyanında karşılığı olmalı ve `dbNumeric` KULLANMAMALI. Kuralın ısırdığı doğrulandı — beyan geçici olarak kaldırılınca üç satırla patladı. Ada güvenmek güvenceyi süse çevirirdi.
    - **Sınır testi iki katmanlı:** `core/base.service.test.ts` (6 test, DB'siz, sorgu kaydediciyle — *kurulan sorgunun kendisi* denetlenir, çünkü yanlış birimli süzgeç gerçek DB'de "boş liste" döner ve bu da geçerli bir sonuç gibi görünür) + `services/price.test.ts` "euro↔cent sınırı" (ham kolon okunur: uygulama cent yazar, kolon 12,34 tutar, geri okunan cent'tir).
    - **Kalan beş aile hâlâ euro döndürüyor** — indirim · stok · sipariş · para hareketi · profil. `STACK §8` altındaki açık notu bunu söylüyor.
  - **Durum (03.08) — dilim 2/6 BİTTİ: indirim ailesi.** `minBasketCents` · `amountCents` (kural) · `amountCents` (kullanım kaydı) beyanla geçti; `lib/cart/discount.ts`'teki elle `Math.round(row.value * 100)` kalktı — `STACK §8` o biçimi açıkça yasaklıyordu.
    - 🔴 **`Discount.value` mekanizmayla ÇEVRİLEMİYORDU ve bu satırda öngörülmemişti:** birimi `type`'a bağlıydı (yüzde ya da euro). Böyle bir kolon hiçbir adla dürüst olamaz — `valueCents` yüzde satırında yalan söyler, `value` sabit satırında birimini söylemez. Greenfield olduğu için **şema düzeltildi**: `0031` içinde kolon `percent` + `amount` olarak ayrıldı, `discount_value_matches_type` kısıtı hangisinin dolu olacağını tutuyor (ikisi de boş bir kural sessizce "sıfır indirim" uygulardı). Ayrım motora ve iki görünüm tipine kadar taşındı; `valueCents` adıyla yüzde taşıyan form alanı da düzeldi.
    - **`docs:check`'te iki kusur çıktı, ikisi de düzeltildi.** (1) `discount`/`discount_code` denetlenen varlık listesinde **hiç yoktu** — tablosu, doküman satırı ve şeması olan bir varlık üç katman ayrışsa kimsenin görmeyeceği yerdeydi; eklendi ve `created_at`'in dokümanda eksik olduğu hemen çıktı. (2) `tableColumns` çok satırlı `constraint … check (…)` bloklarının **devam satırlarını kolon sanıyordu** (`or (scope = …` → "kolon"); parantez derinliğiyle atlanıyor. Bu kusur ancak listeye bir tablo eklenince görünür oluyordu — yani kendini gizleyen yerde duruyordu.
    - **Testte sessiz bir açık kapandı:** `coupon()` yardımcısı `Record<string, unknown>` alıyordu; alan adı değişince `minBasket` sessizce düştü ve koşulsuz kalan kupon uygulandı. İki test "reddedilmeliydi" diye patladı ama sebebini söylemedi. İmza `Partial<DiscountInsert>` oldu. `packages/database/src/services/order.test.ts`'teki `line()` yardımcısı aynı biçimde gevşek — sipariş dilimi (4/6) onu da kapatacak.
    - **Yerel DB bu değişiklikten ÖNCE de ayrık kolonlara sahipti** (doğrudan kolon sorgusuyla ölçüldü: `percent`/`amount` var, `min_basket` euro). Migration dosyası ise `value` taşıyordu — yani şema ile dosya ayrışmış durumdaydı ve dosya artık gerçeğe uyuyor. Nasıl ayrıştığını buradan söyleyemem; `db:refresh` gerekmedi, tam paket yeşil.
    - **Kalan dört aile:** stok · sipariş · para hareketi · profil.
  - **Durum (03.08) — dilim 3/6 BİTTİ: stok ailesi.** `purchasePriceCents` · `offerPriceCents` (parti), `unitCostCents` (fire kaydı ve `stock_adjustment_detail` görünümü). Yaklaşık 45 çağrı yerindeki elle çeviri kalktı.
    - 🔴 **İKİ REJİM ERTELENEMEDİ, dilim 1'de çizilen sınır burada ÇÖKTÜ.** `StockAdjustmentDetailSchema` entite şemasından türüyor (`StockAdjustmentSchema.extend`), yani `…Cents` alanını miras alıyor — ama projeksiyon eşlemenin dışında bırakılmıştı ve şema tamsayı beklerken euro geliyordu. Bu bir "borç" değil, doğrulamada patlayan bir çelişkiydi. `getAllAs`/`getPageAs` artık eşlemeden geçiyor: kural **üst düzey alanlar**dır ve projeksiyonun üst düzeyi her zaman servisin kendi tablosudur. Gömülü ilişki (`stock:stock(purchase_price)`) ve RPC dönüşü (jsonb) dışarıda kalır — oralarda dönüşüm okuma sınırında, yine `toCents` ile.
    - **Denetimin A7 şartı bu yüzden erken kapandı:** "iki rejim geçici, kalıcı çözüm son dilim" diyordu; kalıcı çözüm son dilime kalmadı, üçüncü dilimde geldi. `STACK §8` ve `BaseDbService` künyesi buna göre yeniden yazıldı.
    - **İki elle `Math.round(x * 100)` bulundu ve ortak `toCents`'e çevrildi** (`order-item-batch.service` gömülü okuması, `stock.service` dar sorgusu) — `STACK §8` o biçimi adıyla yasaklıyor.
    - **`unitCostMap` → `unitCostCentsMap`, `purchaseHistoryMap` → `purchaseHistoryCentsMap`.** İlkinin künyesi "yuvarlama YAPILMAZ, tüketici çevirirken yuvarlar" diyordu; oysa tüketici zaten `toCents` çağırıyordu, yani yuvarlama vardı, yalnız yeri farklıydı. Ortalama euro'da alınıp kuruşa sonra iniliyor (parti başına yuvarlansaydı her partide bir kuruş kaçardı) ve bunu bir test sabitliyor.
    - **Bir test yorumu YANLIŞMIŞ, veri düzelince doğru oldu:** `auto-price.test` "geçmiş 2,10, son alış 4,50" diyordu ama alan euro olduğu için sayılar 210 € ve 450 € demekti. Oran aynı olduğundan test yine geçiyordu — birim hatası testin içinde saklanabiliyor.
    - **RPC dönüşü için migration DEĞİŞTİRİLMEDİ.** `adjust_stock_batch`'in `cost_total`'ını cent'e çevirmek `db:refresh` isterdi; o kullanıcının kararıdır (`CLAUDE.md`). Dönüşüm servis sınırına alındı, migration'da yalnız açıklama satırı değişti.
    - **Kalan dört aile:** sipariş · para hareketi · profil · **tedarik** (`supplier_product.last_purchase_price`, `purchase_order_item.unit_cost` — bu aile ilk listede hiç anılmamıştı).
    - 🔴 **Bu dilim CANLI BİR HATA BIRAKTI ve dilim 5'te kapandı.** `unitCostCentsMap` cent döndürmeye başladı ama `VariantOption.unitCost` alanı euro adıyla ve euro künyesiyle kaldı; `bundle-pricing.ts` üstüne bir kez daha `toCents` uyguluyordu → **paket kalem maliyeti 100 kat** şişiyor, her kalem "marj altı" sayılıyordu. Bulan: tedarik dilimini yürüten paralel ajan. Ders, kuralın kendi gerekçesi: adı `…Cents` olsaydı hata satıra bakınca görünürdü; yeniden adlandırma **kaynağı** değiştirip **tüketiciyi** bırakınca sessiz kalıyor.
  - **Durum (03.08) — dilim 4/6 BİTTİ: tedarik ailesi** (paralel ajan; denetimi bu şerit yaptı). `lastPurchasePriceCents` (ürün–kod eşlemesi), `unitPriceCents` (PO kalemi + liste satırının gömülü kalemi), `totalAmountCents` (mal kabul ve `receive_intake` dönüşü), `unitCostCents` (RPC kalem girdisi). 8 elle çevrim ve 5 helper importu kalktı; `supply.schema.ts`'te `dbNumeric` hiç kalmadı.
    - **Tedarik ilk göç listesinde HİÇ YOKTU** — beş aile değil altı.
    - 🔴 **Bir sınır iki ailenin ortasından geçiyordu: `SupplierService.debt()`.** Σ giriş (`stock_intake`) − Σ ödeme (`money_movement`) — yalnız tedarik yarısını cent'e almak aynı çıkarmada iki birim bırakırdı ve sonuç sessizce 100× şaşardı. İkisi birden cent'e alındı; para tarafı ham kolon okuması olarak duruyor, `money.schema.ts`'e dokunulmadı. Yan fayda: `Math.round(v*100)/100` kayan-nokta düzeltmesi gereksizleşti.
    - **Gömülü ilişkide şema İKİYE AYRILMADI, sarmalandı.** `PurchaseOrderRow.items[].unitPrice` gömülü geliyor ve `getPageAs` satırı kendi içinde doğruluyor, yani "okuyup map et" yolu kapalı. Çözüm servis dosyasında `z.preprocess` + `toCents`. `packages/types`'a transform konamazdı — `types-is-pure` kuralı `@lezzet/helper`'ı yasaklıyor.
    - **Sınır testi üç yolu ayrı ayrı denetliyor** (`supply.test.ts` › "euro↔cent sınırı"): beyan, gömülü ilişki, RPC — kolonlar ham okunarak.
  - **Durum (03.08) — dilim 5/6 BİTTİ: sipariş ailesi.** En büyük dilim: `Order`'ın dokuz para kolonu + `OrderItem`'ın ikisi + üç RPC dönüşü (`close_order`, `quick_sale`, `order_counts`) + `order_sale` görünümü. Motor tarafı da geçti: `AccountingLine`, `SaleVatBasis`, `ContributionInput`, `CreditOrder`, `MatchCandidate`.
    - 🔴 **RPC GİRDİSİ sessiz bir tuzaktı — tedarik ajanının uyarısı bu şeritte de doğrulandı.** `create_order` gövdesi jsonb gider ve fonksiyon gelen anahtarları kolonlarla **kesiştirir**: `unitPriceCents` olduğu gibi gönderilince `unit_price_cents` üretiliyor, öyle bir kolon olmadığı için anahtar sessizce düşüyor ve `unit_price` null kalıyordu. Burada `not null` kısıtı patladı ve hatayı görünür kıldı; kısıtı olmayan bir kolonda satır fiyatsız doğar ve **hiçbir yerde hata çıkmazdı**. `rpcMoneyToEuro` yardımcısı bu yüzden var.
    - 🔴 **`undefined` ile `null`u aynı saymak `not null default` kolonlarını kırdı.** İlk hâlim ikisini de `null` yazıyordu; `shipping_fee` (`not null default 0`) kısıt ihlaliyle patladı. Yazma yolunda `undefined` "gönderme" (kolon varsayılanını alır), `null` "boşalt" demektir — ayrım hem `rpcMoneyToEuro`'da hem `BaseDbService.toDbRow`'da korunuyor ve bir test sabitliyor.
    - **Üç elle çevrim kalktı ve üçü de kural ihlaliydi:** `payment-status.ts`'teki yerel `cent = v => Math.round(v * 100)`, `credit.ts`'te euro çıkarıp `* 100` ile çeviren `openAmountCents` (kayan noktada çıkarma — kuruş kaçıran yer), `bank/reconcile.ts`'te `Math.round((…) * 100) / 100`.
    - **`courier/day.ts`'teki "kuruş altı kalıntı sıfır sayılır" eşiği KALKTI** (`due > 0.005`). O eşik kayan nokta çıkarmasının ürettiği çöpü süpürmek içindi; hesap tamsayı cent'e geçince öyle bir kalıntı doğamaz ve eşik bir sayıyı sessizce yutan gereksiz bir kapıya dönüşürdü.
    - **Muhasebe export satırı bilerek euro kaldı** (`gross`/`net`/`vat`/`shippingFee`): o satır muhasebeciye giden bir BELGE, uygulama içi bir model değil. `…Cents`e geçmesi para/muhasebe ailesinin işi.
    - **Sınır testi** (`order.test.ts` › "euro↔cent sınırı"): yazma RPC'si, okuma ve güncelleme ayrı ayrı; kolonlar `db.from('order')` ile ham okunuyor. Ayrıca `undefined` → varsayılan davranışı için ayrı bir iddia.
    - **Kalan iki aile:** para hareketi · profil.
  - **Durum (03.08) — dilim 6/6 BİTTİ: para hareketi. GÖÇ TAMAM.** `amountCents` (hareket), `signedAmountCents` (`account_movement` görünümünün türettiği işaretli tutar), `balanceCents` (`account_balance`), `amountCollectedCents`/`amountRefundedCents` (RPC dönüşü). Profil ailesi zaten cent'teydi (`creditLimitCents`) — altı aile değil, beş aile + bir hazır.
    - 🔴 **HAM OKUMA EŞLEMEYİ ATLIYORDU ve hata SESSİZDİ.** `findByProviderRef` `dbSchema.parse(dbToApp(...))` yazıyordu — `getAll` gibi taban sınıftan geçmediği için para eşlemesi çalışmıyor, satır euro `amount` taşırken şema `amountCents` istiyor ve doğrulama patlıyordu. Webhook o hatayı yutup `status: 'error'` dönüyordu: **panelden yapılan iade deftere hiç düşmüyordu**. Ham okuma yapan her yer `parseRows`'tan geçmeli — kural bu, ve `moneyFields`'ten önce de geçerliydi, yalnız görünmüyordu.
    - **Üç kayan-nokta yaması kalktı:** `periodTotals` ve `campaignSpend`'deki `Math.round((toplam + x) * 100) / 100`, `profit.ts`'teki `Math.round(overhead * 100) / 100`, `money.test`'teki `euro()` kırpıcısı. Hepsi tamsayı toplamada süpürülecek artık olmadığı için gereksizleşti — yamanın sebebi kalkınca yama da kalkar.
    - **`signedAmountFor` → `signedAmountCentsFor`** (motor); `openAmountCents` gibi zaten cent dönen ama euro girdi alan fonksiyonların ikili doğası bitti.
    - **Sınır testi dört yolu ayrı denetliyor** (`money.test.ts` › "euro↔cent sınırı"): tablo · görünümün türettiği `signed_amount` · bakiye görünümü · RPC.
  - **GÖÇ ÖZETİ (02.9 kapanışı).** Altı dilim, ~121 çağrı yeri, 42+ dosya. Uygulamada euro yalnız iki yerde kaldı ve ikisi de bilinçli: DB kolonları (`numeric`) ve muhasebe export SATIRI (belge, model değil).
    - **Hataların hepsi aynı biçimdeydi: kaynağı değiştirip tüketiciyi bırakmak.** Dört örnek — `unitCostCentsMap` cent döndü ama `VariantOption.unitCost` euro adıyla kaldı (paket maliyeti 100× şişti); `create_order`'a `unit_price_cents` gitti ama kolon `unit_price` (anahtar sessizce düştü); `day-close.ts` `cashCents` yazdı ama tipi `cash` dedi; `findByProviderRef` eşlemeyi atladı. `…Cents` adlandırma kuralının varlık sebebi tam olarak bu.
    - **En tehlikelisi hata VERMEYEN olandır.** RPC gövdesindeki anahtar kesişmede düşer ve hiçbir yerde iz bırakmaz; bizde `not null` kısıtı yakaladı. Bu yüzden `rpcMoneyToEuro`/`rpcMoneyToCents` var ve künyeleri bunu anlatıyor.
    - **Paralel ajan denetimi işe yaradı:** dilim 3'ün canlı 100× hatasını tedarik dilimini yürüten ajan buldu. Kendi commit'ini kendin denetlemek bu sınıf hatayı görmez.
    - **Sıra branded tipte** (`type Cents = number & {…}`): bugün güvence `docs:check`'te (beyan + `dbNumeric` yasağı), o gün derleyiciye geçer.
- [x] (02.10) **Ayar önbelleği SÜRELİ olsun (operasyon şeridinin bulgusu — 02.08)**: `SettingsService` süreç içi önbelleği hiç düşmüyordu; `SETTINGS_CACHE_TTL_MS` (30 sn) eklendi ve dışa açıldı — touches: `packages/database/src/services/settings.service.ts`
  - *Bitti:* dış kaynaklı ayar değişikliği en geç 30 sn içinde her süreçte geçerli; yazan süreç anında görür
  - **Neden bir arıza, "gecikme" değil:** önbellek yalnız `set()` ile düşüyordu, yani YALNIZ yazan sürecinki. Çok süreçli dağıtımda (PM2, 18.9) operatör Ayarlar ekranından değeri değiştirir, ekran "kaydedildi" der, kararı veren öteki süreç **bir sonraki dağıtıma kadar** eski değeri okurdu. Servisin kendi künyesi bunu "çok instance'ta gecikmeli yayılır" diye anlatıyordu ve o cümle yanlıştı; düzeltildi.
  - **TTL, `LISTEN/NOTIFY` DEĞİL:** yayın anında yansıtır ama kalıcı bağlantı ister (PostgREST `LISTEN` bilmez → `pg` ya da Realtime) ve arızası **sessizdir** — abonelik koparsa önbellek bir daha hiç düşmez, üstelik çalışırken anında yansıdığı için kimse süreyi izlemez. TTL sınırlı ve kendi kendini onarır.
  - **Asıl fark söylenebilirlik:** TTL bir SÖZLEŞMEDİR, ekran yazabilir ("en geç 30 sn"). Yayın kurulumunda söylenebilecek tek şey "genelde anında, bozulursa bilinmiyor" — belirsiz vaat, yanlış vaatten kötüdür. Sabit dışa açık (`SETTINGS_CACHE_TTL_MS`) ki sayı iki yerde ayrı yaşamasın. Ayarın kendisi ayardan okunamaz (kendi kendine bağımlılık).
  - Kaynak: `operasyon-ekranlari-arka-uc-talebi.md` §1 — `09.16` (Ayarlar ekranı) bunu bekliyordu.
- [x] (02.11) **Migration dosya dengesi (denetim P1/P2/P4)** — `touches: supabase/migrations/**, scripts/build-postal-codes.mjs`
  - **Bitti (03.08): 43 dosya → 34, boşluksuz `0001`–`0034`.** `db:refresh` + seed koştu, ikisi de temiz; tam paket 1694/1694 geçti. Satır bir tur `[~]` kaldı ve bu bir hataydı — refresh koştuğu an kapanmalıydı; denetim bayatlığı yakaladı (`CLAUDE §5`: durumun tek sahibi bu satır, denetim dosyası kapanıp silindiği için kalıcı kayıt burasıdır).
  - **P1 — posta kodu dosyası ikiye ayrıldı.** Şema `0033` (ELLE bakılır) + veri `0034` (üretilir). Bölme `head`/`tail` ile yapıldı ama **üreteç önce düzeltildi**, yani bir sonraki `postal:build` aynı düzeni yeniden üretir; veri kısmının bayt bayt aynı kaldığı sağlama ile doğrulandı (`shasum` eşit).
  - **Üreteçte BAYAT ŞABLON bulundu** — plandan fazlası: dosyada `text_pattern_ops` vardı (19.19 ölçümü, `like '672%'` 36,9 ms → 0,11 ms), üreteçte YOKTU. Yani `pnpm postal:build` bugün koşsaydı ölçülmüş bir kazancı sessizce geri alacaktı. Kök sebep tam da P1'in tarif ettiği çelişkiydi: "elle düzenlenmez" diyen dosyanın şema yorumları elle düzenleniyordu. **Çözüm bölmenin kendisi:** üreteç artık YALNIZ veri dosyasını yazıyor, ürettiği dosyada elle bakılacak tek satır yok, kayma yüzeyi sıfır.
  - **P2 — aile içi birleştirme:** gözlemleme (üç dosya → `0008`), para (dört → `0018`), katalog fiyat, sıcaklık kaydı, düzeltme tutanağı, bildirimler (üç → `0023`), sepet → sipariş. Her taşınan bloğun başında ayrı bir dosyadan geldiğini söyleyen ayraç var; içerik değişmedi.
  - ~~**Numaralar yeniden VERİLMEZ, boşluk bırakılır**~~ — **kullanıcı kararı (03.08): boşluk bırakılmadı, numaralar sıfırdan sıralandı.** Gerekçem "toplu yeniden numaralandırma 28.07 çakışma vakasının zemini"ydi; kullanıcı greenfield'de bunun karşılığı olmadığını söyledi ve haklı: canlı yok, veri yok, tek ortam var, iş tek ajanın tek penceresinde yapıldı. **Bu kapı ilk üretim dağıtımında kapanır** — o günden sonra numara değişmez (WORKFLOW §2).
    - **DURUM DEĞİŞTİ, KARAR ERTELENDİ (kullanıcı kararı 26.08).** Bugün ölçüldü: 50 dosya var,
      aralık `0001`–`0051` ve **`0025` boşlukta** — 18.08'de kurye×gün kapanışı sefer eksenine
      inince ~~`0025_courier_day_close.sql`~~ kaldırıldı, yeri kapatılmadı. Yani yukarıdaki
      *"boşluksuz"* özelliği artık geçerli DEĞİL ve bunu kimse karar vererek yapmadı; bir dosya
      silinince kendiliğinden oldu.
      **Şimdi dokunulmuyor:** kullanıcı, migration dosyalarının adlandırması ve içeriğiyle ilgili
      düzenlemenin **proje tam anlamıyla tamamlandıktan sonra** tek turda ele alınacağını söyledi.
      Bugün yeniden numaralandırmak 26 dosyayı kaydırır ve üç şeridin aynı ağaçta çalıştığı bir
      günde tam olarak 28.08 çakışma vakasının zeminini kurardı.
      **Boşluk sessiz değil:** `docs:check §3c2` her migration dosyasının `index.md`'de bir satırı
      olmasını zorluyor, yani eksik numara kayıttan da görünür.
  - **Sıra doğruluğu makineyle sınandı** (reset'i boşa harcamamak için): 34 dosyada şema düzeyinde ileri-atıf YOK — ne FK, ne enum tipi, ne görünüm. Tek istisna `auth.users` (Supabase'in kendi şeması). `adjust_stock_batch`'in `warehouse`'a değmesi fonksiyon gövdesindedir, plpgsql geç çözer; taşımadan önce de sonra da aynı.
  - ~~**`vehicle` tablosu DÜŞTÜ** — servisi yok, `from('vehicle')` hiç geçmiyor, 0 satır, hiçbir tasarım aracı bir VARLIK olarak kullanmıyor. **Zod şeması da düştü:** tablosu olmayan bir tip, okuyanı "araçlar sistemde tutuluyor" diye inandırır.~~ **GERİ GELDİ (denetim ölçümü 26.08):** `0045_storage_area_vehicle.sql` tabloyu yeniden kuruyor ve `temperature_log.vehicle_id` ona FK ile bağlanıyor — yani araç artık gerçekten bir VARLIK (araç bir depo türü olduğu gün, 26.08, zemin de gerekti). Düşürme kararı yazıldığı gün doğruydu; **ölü şemayı `knip`in yakalayamayacağı gerekçesi de aynen geçerli.** Not olduğu gibi bırakılsaydı satırı okuyan "araç diye bir tablo yok" sonucuna varırdı.
  - **75 bayat atıf onarıldı** (27 dosya): yeniden adlandırma dokümanlarda ve kod künyelerinde asılı referanslar bırakmıştı. Aynı commit'te düzeltildi — 02.12 emsali: kural tek başına inseydi üç şerit kırmızı bir kapıyla yaşardı. Numara değişince bozulan Türkçe ekler de düzeltildi (`0006'de` → `0006'da`: sayı sesli okunur).
- [x] (02.12) **Teardown'da elle silme kuralı + 34 dosyanın süpürülmesi (denetim R4-açık)** — `touches: **/*.test.ts, scripts/docs-check.mjs`
    - *Bitti:* `*.test.ts` içinde `from('warehouse'|'account').delete()` KALMADI; silme sırası tek yerde (`cleanup.ts`) ve kural `docs:check §3f` ile zorlanıyor.
    - **Kural ve süpürme aynı commit'te** (denetim görüşü 03.08): kural tek başına inseydi üç şerit 34 dosyada kırmızı bir kapıyla yaşardı. Kuralın ısırdığı kanıtlandı — bir ihlal geri konup `docs:check` düşürüldü, sonra geri alındı.
    - **Kapsam `account`'a da genişletildi:** R1'in kökü aynıydı ve orada da FK `restrict`. Süpürme sırasında `purgeTestData`'nın hesap bölümü eksik çıktı — `bank_import` hesabı `restrict` ile tutuyor, şablon `cascade` olduğu için tek başına görünmüyordu; ikisi de purge'e eklendi.
    - **`stock.test`'te ikinci bir sessizlik daha vardı:** servis silmeleri `.catch(() => {})` ile susturuluyordu, yani ürün hiç silinmese de test yeşil kalıyordu. Purge'e devredildi.
    - Ölçüm (tam paket, öncesi/sonrası): `warehouse 2→2 · account 5→5 · money_movement 41→41 · document_counter 1→1 · stock 196→196 · bank_import 1→1` — altı tabloda sıfır artık, 1675/1675 yeşil.
    - Sıra: bu bitti → sırada `02.11` (büyük, kullanıcı penceresi).
- [x] (02.13) **Başvuru ve ayar izleri — iki şeridin beklediği alanlar** — `touches: supabase/migrations/0011_customer_fields.sql, supabase/migrations/0013_settings.sql, packages/types/src/entities/{user-profile,setting}.schema.ts, packages/database/src/services/{user-profile,settings}.service.ts, packages/domain-core/src/identity/b2b-application.ts`
    - **B2B ret hâli** (müşteri şeridinin talebi · `08.7`/`09.11`): `b2b_applied_at` · `b2b_rejected_at` · `b2b_rejected_by` · `b2b_reject_reason` + `b2b_pending` (**üretilmiş kolon**). Gerekçesiz ret veride yazılamıyor (`user_profiles_b2b_reject_stamp`).
    - **Talepteki iki seçenekten hiçbiri seçilmedi.** Enum yalnız *hangi hâl* der; "ne zaman/neden/kim" yine ayrı alan isterdi — maliyet, kazanç değil. "Ret tarihi + gerekçe" ise yeniden başvuruyu çözmüyordu: alanlar temizlenmezse aday bir daha kuyruğa giremez, temizlenirse `09.11`'in istediği geçmiş kaybolur. **Ret SİLİNMEZ, ESKİR** — yeniden başvuru damgası retin önüne geçer, ret kaydı geçmiş olarak durur.
    - **Damgayı tetikleyici atar, uygulama değil** (`stamp_b2b_application`): bugün başvuruyu yazan tek yol var, ama ikinci bir yol açıldığında (operatörün müşteri adına künye girmesi) o yol damgayı unutur ve kuyruk sessizce yanlış sıralanır. Sayesinde müşteri şeridinde **tek satır değişiklik gerekmedi**.
    - **`b2b_pending` neden üretilmiş kolon:** aynı soruyu üç yer soruyor (kısmi indeks · kuyruk süzgeci · `b2bStatusOf`); ayrı ayrı yazılsalardı biri gün gelip ayrışırdı ve ayrıştığında hata VERMEZDİ, yalnız yanlış bir liste üretirdi. Ayrıca uygulama bunu süzgeç olarak soramıyordu — PostgREST kolon-kolona karşılaştırma yazamaz.
    - **Yan kazanç:** kuyruk `created_at desc` ile sıralanıyordu, yani profilin DOĞDUĞU an. B2C açılıp aylar sonra başvuran müşteri bugün başvurmasına rağmen listenin dibinde görünüyordu; sıralama `b2b_applied_at`'e geçti.
    - **`settings.updated_by`** (operasyon talebi §7c · `09.16`): kolon + `set(…, { actorId })`. `null` = **"sistem kurdu"**, "bilinmiyor" değil — tohum satırlarını kimse değiştirmedi. `actorId` opsiyonel, çünkü ayar yazan her şey insan değil (tohum, göç, iş süreçleri) ve onlara sahte aktör atamak izi *güvenilir sanılan* bir yalana çevirirdi.
    - `setB2bApproval` **silinmedi, `@deprecated`** işaretlendi: tek çağıranı operasyon yüzeyinde ve o dosya bu şeridin alanı değil — kaldırmak üç şerit için derlemeyi kırardı. `not-operasyon-b2b-ret-hali.md` ile devredildi.
    - **İlk refresh üç hata açığa çıkardı, üçü de sessiz sınıftandı** (9 test düştü, `b2b_pending` alanında `ZodError`):
        1. **Tetikleyici yalnız `update`'te koşuyordu.** Künyesiyle birlikte AÇILAN profil (operatörün müşteri adına girmesi, tohum verisi) hiç damga almıyordu; kuyruk onları sıralayamıyor, ret damgası konunca hâlleri belirsizleşiyordu. `before insert or update` oldu; `old` INSERT'te yok olduğu için dallar `tg_op` ile ayrıldı (tek koşulda `or` ile birleştirmek güvenli değil — SQL'de kısa devre garantisi yoktur).
        2. **Üretilmiş kolon ÜÇ değerliydi.** Reddi olup başvuru damgası olmayan satırda `false or NULL` = **NULL** dönüyordu. Bu kolonun tek işi EVET/HAYIR demek; "bilinmiyor" bir cevap değil. Başvuru damgasının varlığı açıkça sorularak karşılaştırma iki dolu değere indirildi.
        3. **İki damga iki ayrı SAATTEN geliyordu** — ret uygulamadan (`new Date()`), başvuru veritabanından (`now()`). Oysa ikisi BİRBİRİYLE karşılaştırılıyor: aradaki kayma reddedilmiş bir adayı kuyruğa geri sokabilir ya da taze bir başvuruyu reddedilmiş gösterebilirdi. Ret damgası da tetikleyiciye geçti; uygulama "reddedildi" der, "ne zaman"ı veritabanı söyler. `b2bRejectedAt` de yazılamaz alanlara katıldı.
    - **Dördüncü hata ikinci koşuda çıktı:** `rejectB2b` `Promise` döndürüyor ama gerekçe boşken **eşzamanlı** fırlatıyordu (`async` değildi). İmzaya bakıp `.catch()` yazan çağıran hatayı hiç yakalayamazdı. `async` oldu.
    - Düzeltmeler geri alınan bir işlemde ayrı şemada baştan sona sınandı (B2C · künyesiyle açılan · onaylı · ret sonrası düzeltme · aynı künyeyle yeniden gönderim · alakasız güncelleme): beş hâlin beşi doğru, sıfır NULL.
    - ~~**Kalan:** ikinci bir `db:refresh` (kullanıcının kararı) + tam paket.~~ **KAPANDI (08.08).** Beş kolonun beşi de veritabanında yerinde (ölçüldü: `information_schema` → `b2b_applied_at · b2b_rejected_at · b2b_rejected_by · b2b_reject_reason · b2b_pending`) ve entegrasyon paketi haftalardır bu şemaya vurarak koşuyor. Şema DDL kilidi altında uygulandığı için (`with-test-lock --kind=ddl`) **ikinci bir `db:refresh` gerekmedi** — bekleyen şey bir işti değil, bir varsayımdı.
- [x] (02.14) **Katman denetimi turu: taban servis duplikasyonu + test projesi ayrımı (denetim K4-1 · K4-2 · K8-1)** — `touches: packages/database/src/core/base.service.ts, packages/database/src/services/{address,supplier,zone-notice}.service.ts, vitest.config.ts, scripts/docs-check.mjs`
    - **K4-1 — `setExclusiveFlag` tabana çıktı:** `address.setDefault` ↔ `supplier.setPreferred` satır satır aynıydı (değişen üç ad: tablo, bayrak, kapsam). `STACK §6`'nın eşiği "ikinci tüketici" ve o çıkmıştı. İki metot birer satıra indi.
    - İmzada denetimin önerisinden sapıldı: `scopeValue` parametresi **alınmadı** — `getById` satırın tamamını zaten getiriyor, çağıranın ikinci kez okuması hem tur hem hata payıydı.
    - **Sıra bilinçli** (künyeye yazıldı): *önce temizle, sonra işaretle*. Tersi bir an İKİ bayrak üretir; bu sıra bir an SIFIR üretir. Sıfır "seçim yok" diye okunur, iki bayrak sessizce yanlış olanı seçtirebilir — ve bu sıra, kural kısmi unique index'e taşınırsa uyumlu olan tek sıradır.
    - **Tabana açılan sessiz hata kapısı kapatıldı:** `flagField` düz `string` olduğu için derleyici yanlış adı yakalayamıyor, `update()` de Zod'dan geçtiği için şemada olmayan alanı **atarak** yazıyor — çağrı başarılı döner, hiçbir bayrak değişmez. İki bekçi kondu (kapsam alanı yoksa · yazım tutmadıysa fırlatır).
    - Bulgunun altındaki bulgu ayrı göreve taşındı → `02.15`: kural veride hiç durmuyor.
    - **K4-2 — `zone-notice.markNotified` ham yazımdan çıktı:** `updateWhereIn`'e geçti, kolon adı (`notified_at`) artık elle yazılmıyor. Yol bir cron işinin içinde, yani kolon yeniden adlandırılsa hata kullanıcıya değil log'a düşerdi. Yan etki: `updateWhereIn`in "tek tüketicisi" durumu da kapandı.
    - **K8-1 — 18 DB'siz test entegrasyon kuyruğundan çıktı.** Yollar tek sabitte (`vitest.config.ts` → `WEB_LIB_DBSIZ`); birim `include`a, entegrasyon `exclude`a **aynı sabitten** alıyor. Denetimin (b) şıkkı (`*.unit.test.ts` adlandırması) alınmadı: yapılandırmanın künyesi isimle ayırmayı zaten gerekçesiyle reddetmiş (dosyalar dört ayrı şeridin). Çürüyen şey adlandırma kararı değil, aynı künyedeki *"birkaç saf dosya ihmal edilebilir"* cümlesiydi — 68'de 19 birkaç değil, ve `CLAUDE §4b` (08.08) bunu hız sorunundan **erişim** sorununa çevirmişti.
    - **Denetimin listesi 19'du, 18 çıktı.** `delivery/map-codes.test.ts` DB'ye vuruyor: iz kendi metninde değil, import ettiği modülde (`./map-codes` → `serviceDb`). Ekleyip koşunca 7 test patladı. Aynı hata bende de vardı; yakalayan şey grep değil koşu oldu.
    - **`docs:check §3i`** *(26.08'e kadar `§3g` yazıyordu — araya kural eklendikçe bölüm harfleri kaydı, bkz. 02.17)* listeyi çürümeye karşı koruyor: DB'siz olup listede olmayan dosya ve listede kalmış silinmiş yol commit'ten geçmiyor. İz **geçişli** aranıyor (import zinciri, `@/` takma adı, döngü korumalı) ama kontrol **tek yönlü**: "listede ama DB'ye vuruyor" yönü yazılmadı, çünkü orada statik iz yanılıyor (ölçüldü: altı dosya `serviceDb` açan modülü import ediyor, beşi o yolu hiç çağırmıyor) ve daha iyi bir hakemi var — `pnpm test:unit` `.env` yüklemediği için böyle bir dosya ilk satırında patlar.
    - Ölçüm: `pnpm test:unit` **117 dosya / 1351 test yeşil, 3,3 sn** (önce 98 dosya / ~1190). `typecheck` · `lint` · `docs:check` temiz. Bekçinin üç yönü de elle sınandı (eksik satır · yanlış satır · bayat satır), üçü de ateşliyor.
    - **K3-1 reddedildi** (`denetim-K3-domain-core.md` Cevap'ında gerekçesiyle): "KDV bölmesi testsiz" bulgusu `line.test.ts` dosyasının yokluğuna dayanıyor, oysa üç iddianın üçü de `export.test.ts`/`profit.test.ts` içinde çivili — `net+vat=gross` beş yerde, kanal yönü iki bağımsız dosyada, kısmi teslimat payı `export.test.ts:96`'da.
- [x] (02.15) **"Grup içinde tek bayrak" kuralı VERİDE dursun — kısmi unique index** — `touches: supabase/migrations/**`
    - Bugün kuralı tutan tek şey `setExclusiveFlag` (`02.14`). Herhangi bir doğrudan yazım — tohum, düzeltme script'i, ileride yazılacak toplu içe alma — kuralı sessizce kırabilir. `CLAUDE §1`: *"Kural veride durur (ertelenmiş kısıtlar, `not null`, kısmi unique)."*
    - Kapsam: `address(customer_id) where is_default` · `supplier_product(variant_id) where is_preferred`. Aynı desen ileride her "grup içinde tek" alanında doğacak.
    - **Bugün ihlal YOK** (ölçüldü 10.08, salt-okuma): `address` 8 satır/6 grup, `supplier_product` 23 satır/18 grup — çoklu bayrak 0, bayraksız grup 0. Yani düzeltilecek veri yok; eksik olan güvence.
    - Index `setExclusiveFlag`'in sırasıyla uyumlu (*önce temizle, sonra işaretle*); ters sıra index'i anında ihlal ederdi.
    - **Neden bekliyor:** migration değişikliği `db:refresh` penceresi ister ve o kullanıcının kararıdır.
    - **Durum (26.08) — YAZILDI (kullanıcı kararı: "migration'ı şimdi yaz, sonraki tazelemede uygulansın").**
      İki kısmi indeks, tabloların KENDİ dosyalarına (greenfield: yama migration'ı yazılmaz):
      `address_one_default_per_customer` (`0011_customer_fields.sql`) · `supplier_product_one_preferred_per_variant`
      (`0010_supply.sql`). Kısmi, çünkü `false` satırlar sınırsızdır; tekillik yalnız İŞARETLİ olana aittir.
      `setExclusiveFlag`in *önce temizle, sonra işaretle* sırasıyla uyumlu — ters sıra bir an iki
      işaretli satır üretir ve indeksi o anda ihlal ederdi.
    - **DOĞRULAMA GERİ ALINAN BİR İŞLEMDE YAPILDI — kalıcı hiçbir şey yazılmadı.** Şema değişikliği
      kullanıcının penceresi olduğu için `db:refresh` beklenmedi; onun yerine `begin … rollback`
      içinde indeksler kurulup dört iddia sınandı: *(1)* mevcut veri indeksleri KALDIRIYOR (yani
      tazeleme kırılmayacak — ayrıca sayıldı: 6 müşteride 6 varsayılan adres, 28 varyantta 28
      tercihli tedarikçi, çoklu bayrak sıfır) · *(2)* aynı müşteriye ikinci varsayılan adres
      **reddedildi** · *(3)* aynı varyanta ikinci tercihli tedarikçi **reddedildi** · *(4)* işaretsiz
      ikinci satır **serbest** (kural yalnız bayrağa ait).
      **Ölçüm sırasında iki kez kendi sabotajım yanlış yerden patladı** ve ikisi de öğreticiydi:
      önce eksik kolonlu bir satır yazdım (`recipient not null`), sonra kopyaladığım satır
      `supplier_product_key`e çarptı — yani indeksimi hiç sınamamıştım. Bir sabotajın kırmızı
      vermesi, DOĞRU kuralı kırdığı anlamına gelmiyor; hata mesajının hangi kısıttan geldiğine
      bakmak gerekiyor.
    - **Kalan tek adım kullanıcıda:** bir sonraki `db:refresh` indeksleri uygular. O ana kadar kural
      yine yalnız kodda duruyor.
- [x] (02.16) **Teardown kaçağı: elle silme purge'ü hiç çağıramıyordu (kullanıcı bildirimi 14.08)** — `touches: packages/database/src/testing/cleanup.ts, **/*.test.ts`
    - *Bitti:* 17 dosyadan `afterAll` içindeki elle `mustDelete` satırları kalktı; dört ayrı entegrasyon koşusunda **sıfır yeni artık** (DB'den sayımla kanıtlı).
    - **Ölçüm (kanıt önce, müdahale sonra — `CLAUDE §0`):** 51 artık depo (3 gerçek), 28 kategori, 8 profil, 1 hesap, 1 ürün. **%85'i tek bir çöken koşudan** (14.08 02:30–02:34). Ve asıl bulgu: **51 deponun 46'sı BOMBOŞTU** — stok/sipariş/kabul/bölge hiç yok, yani onları hiçbir FK tutmuyordu. Silme başarısız olmamıştı, **hiç denenmemişti**.
    - **Kök sebep zincirlemeydi:** `beforeAll` altyapı yüzünden düşüyor (`statement timeout` → `current transaction is aborted`) → `customerId` `undefined` kalıyor → `afterAll`ın İLK satırı `mustDelete(db,'order', q=>q.eq('customer_id', customerId))` → PostgREST'e `customer_id=eq.undefined` gidiyor → uuid hatasıyla **fırlıyor** → `purgeTestData` hiç çağrılmıyor. `previous.log`da 90 teardown hatası, 13'ü tam bu imzayla. Purge kendi içinde `clean()` ile tanımsızları ayıklıyordu (`02.5`) ama **dosyaların kendi silme satırlarında o koruma yoktu**.
    - **Elle silmelerin çoğu ZATEN GEREKSİZDİ** (FK'ler ölçüldü): `address`·`product_feedback`·`points_entry`·`feedback_request` → `cascade`; `reservation`/`stock`/`stock_adjustment` → purge §1; `warehouse_transfer` → purge §8. Yani kaçağa sebep olan satırlar hiçbir iş yapmıyordu. Gerçekten eksik olan ikisi purge'e girdi: **`order` by `customer_id`** ve **`courier_day_close` by `courier_id`** (ikisi de profili `restrict` ile tutuyor) — artık `profileIds` verildiğinde toplanıyorlar.
    - **`purgeTestData` DAYANIKLI hâle geldi:** `mustDelete` fırlatarak sessiz birikimi gürültüye çevirmişti (`02.12`) ama tek `await` zincirinde fırlayan hata kendinden sonraki HER silmeyi iptal ediyordu — yaprak bir tabloda (`category`) takılan teardown, ilgisiz DEPOYU da bırakıyordu. Artık FK ile bağlı olmayan dallar ayrı gruplarda (`step`): analitik · iş izleri · asistan · ana zincir · para · bağımsızlar · **depolar**. Grup İÇİNDE sıra hâlâ kutsal. Hatalar yutulmaz, biriktirilip **sonda tek hatada** fırlar.
    - **Yan bulgu — purge'ün kendi sırası eksikmiş (§0c):** `warehouse_transfer_line` partiyi İKİ uçtan da `restrict` ile tutuyor (`source_stock_id`, `target_stock_id`), ama devir temizliği §8'deydi — parti silmesinden (§1) SONRA. Sıra tersti ve parti silinemezdi. Görünmüyordu çünkü devir testi kendi elle silmesiyle önden temizliyordu; o satır kalkınca eksik sıra ortaya çıktı. Devirler §0c'ye alındı. **Pansumanın maskelediği gerçek arıza buydu.**
    - **Yeni hedef `zoneNoticePostalCodes`:** `zone_notice` bölgeye FK ile bağlı değil (kayıt, bölgenin HENÜZ OLMADIĞI kod için açılıyor) ve `customer_id` `set null` — hiçbir cascade toplamıyordu.
    - **İki SESSİZ silme daha kapandı** (kullanıcının "her test kendi artığını topluyor mu" sorusu üzerine tarandı): `product-image.test.ts` ve `product-list.test.ts` teardown'ları `.catch(() => {})` ile susturulmuştu — ürün hiç silinmese de test yeşil kalırdı. `stock.test`te aynı sessizlik `02.12`'de bulunmuştu, bu ikisi atlanmış. İkisi de `purgeTestData`ya devredildi. (`postal-code-place.test.ts` temizliksiz ama **salt okuma** — sıfır yazma, seed satırlarına bakıyor.)
    - **Kaçak senaryosu DOĞRUDAN ölçüldü** (atılabilir betik): depo açılmış, geri kalan kimlikler `undefined` — yani `beforeAll`ın yarıda düştüğü hâl. Teardown depoyu topladı. Eskiden bu tam olarak kaçağın doğduğu andı.
    - **Mevcut artıklar bu görevde silinmedi** (kullanıcı kararı 14.08); kullanıcı sonrasında veritabanını kendi sıfırladı — 51 artık depo gitti, geriye 3 gerçek depo kaldı.
    - **Geride kalan boşluk:** kural makineyle zorlanmıyor. Yeni yazılan bir test `afterAll`da yine elle silme yazabilir; bugün kuralı tutan tek şey disiplin ve `docs:check §3f`in yalnız `warehouse`/`account` için koyduğu dar kapı. `BEKLEYEN(02.16): afterAll içinde purgeTestData'dan önce mustDelete yazılmasını docs:check yakalasın.`
- [x] (02.17) **`docs:check` bölüm harfleri KONUMSAL — atıflar sessizce yanlışlanıyor** (denetim ölçümü 26.08) — `touches: scripts/docs-check.mjs, vitest.config.ts, docs/**`
  - **Ölçülen arıza:** `§3g` bir zamanlar "DB'siz test entegrasyon kuyruğunda kalmamalı" kuralıydı;
    araya yeni kurallar eklendikçe o kural **`§3i`**'ye kaydı ve `§3g` bugün bambaşka bir şeyi
    ("Operasyon ekranı KENDİ zeminini çizmeli") anlatıyor. Ona yapılmış **altı atıf** yanlış hedefi
    gösteriyordu: `vitest.config.ts` (4) · `02-database.md` (1) · iki denetim dosyası. Altısı da
    26.08'de elle düzeltildi — ama **kusur duruyor**: bir sonraki eklenen kural aynı kaymayı yeniden
    üretir. `STACK.md §251` ise `§3g`yi DOĞRU anlamda kullanıyor, yani aynı etiket iki anlamla
    dolaşıyordu.
  - **Neden sinsi:** yanlış bir bölüm atfı hiçbir yerde hata vermez. Okuyan ajan `docs-check.mjs`i
    açar, `§3g`yi bulur, alakasız bir kural okur ve ya yanlış iş yapar ya da "bu kural yok" sanır.
  - **İki iş:** *(1)* harf bir kez verilir ve **yeniden kullanılmaz** — yeni kural sona eklenir,
    araya girmez; *(2)* `docs:check` kendi atıflarını doğrular: metinde geçen her `§3x`, gerçekten o
    harfi taşıyan bir bölüm başlığına gitmeli. Bugün altı atıf yanlıştı ve hiçbir bekçi görmedi.
  - **Durum (26.08) — KAPANDI: `§3j` bekçisi yazıldı.**
    - **Varlık denetimi YETMEZDİ ve bu ölçüldü:** altı yanlış atfın hepsi VAR OLAN bir harfi
      gösteriyordu. Yakalanması gereken şey harfin yokluğu değil, **anlamının değişmesi**.
    - Bu yüzden bölüm künyesi betiğin içinde SABİT yazılı (`BOLUM_KUNYE`, 17 bölüm). Bir başlık
      değişirse ya da harf başka bir kurala verilirse denetim kırmızıya döner ve yazan ya harfi geri
      verir ya bütün atıfları günceller. **Harf bir kez verilir, yeniden kullanılmaz** — yeni kural
      sona eklenir. Künyede olmayan yeni bölüm de bildiriliyor (kural kendi kendini kaydettiriyor).
    - İkinci iddia: metinde geçen her `docs:check §x` atfı gerçekten bir bölüme gitmeli.
      **Desen DAR tutuldu** ve bu bir ölçümün sonucu: ilk hâli 120 karakterlik bir yakınlık
      arıyordu ve BAŞKA dokümanların bölümlerini yakalıyordu (`WORKFLOW §7`, `STACK §6c`) — aynı
      paragrafta "docs:check" geçmesi, o atfın docs:check'e olduğunu göstermiyor.
    - **Bekçinin ısırdığı doğrulandı:** `§3g`nin başlığı geçici olarak değiştirildi → *"ANLAMI
      DEĞİŞMİŞ"* diye kırmızı; geri alınınca yeşil.

- [x] (02.18) **Veri modeli dokümanı: alan listesi TÜRETİLİR, karar insanda kalır** (kullanıcı kararı 26.08) — `touches: docs/architecture/data-model/**, scripts/docs-check.mjs`
  - **Kullanıcının sorusu işi başlattı:** *"Bu doküman güncel tutulması zor. Ama veritabanındaki
    kritik değişiklikle alakalı data modellerinin görülmesi de gerekiyor. O zaman bunu uygun bir
    şekilde kırpmak, sadeleştirmek ve eksikliklerini gidermek lazım."*
  - **Ölçüm (26.08):** 7 dosya · 77 varlık · 1.796 satır · 728 alan satırı. Ağırlık dağılımı:
    **%24 boş** (yalnız kolon adı) · **%42 çok kısa** (*"ekranda okunan ad"*, *"null"* — şemanın
    zaten söylediği) · %12 orta · **yalnız %22 gerçek karar**. Yani satırların üçte ikisi taşımadığı
    bir yükü taşıyordu ve asıl değer o gürültünün içinde kayboluyordu. Ayrıca 22 tabloda gerçek
    ayrışma vardı — `bundle.serves` gibi **müşterinin gördüğü** alanlar dokümanda hiç yoktu.
  - **Karar: bölüşüm.** Alan listesi makinenin (`<!-- alanlar:tablo -->` bloğu, `pnpm docs:sync`
    migration'lardan üretir), karar insanın (yalnız söyleyecek şeyi olan alan). Gerekçe `CLAUDE §1`:
    aynı bilgi zaten İKİ yerde ve ikisi de çalıştırılabilir (migration + Zod); markdown üçüncü
    nüshaydı ve **tek çürüyebilen** oydu.
  - **Denetim kuralı TERSİNE çevrildi.** Eskisi *"kolon var, dokümanda yok = hata"* idi ve dokümanı
    EKSİKSİZ olmaya zorluyordu — çürümenin kaynağı da buydu. Yenisi: *"dokümanda anılan alan
    veritabanında yok = hata."* Yani doküman **eksik olabilir ama yalan söyleyemez**; kırpılmış bir
    doküman ancak böyle güvenli olur.
  - **AYRIŞTIRICI CANLI VERİTABANINA KARŞI DOĞRULANDI:** 84 tablonun **84'ü** kolon kolon tuttu.
    (Tutmayan üç ad çalışma anında doğan analitik BÖLMELERİ — migration'da yoklar, olmamaları doğru.)
  - **PİLOT `para.md` ÜSTÜNDE KOŞTU VE İKİ HATA YAKALADI — küçük dosyada denemenin karşılığı budur:**
    *(1)* **Üretici içerik YEDİ.** Desen boş bloğu tutmuyordu (`\n` iki yanda da zorunluydu), eşleşme
    bir sonraki kapanış işaretine taşıyor ve aradaki `## MoneyMovement` · `## BankImport`
    başlıklarını siliyordu. Düzeltildi (`\n?`) ve ikinci bir emniyet kondu: gövdede yeni bir açılış
    işareti görülürse blok BOZUK sayılır, asla yazılmaz — sessiz veri kaybı yerine gürültü.
    *(2)* **Tırnak içindeki virgül kolonu bölüyordu.** `default ','` satırı ikiye ayrılıyor,
    varsayılan `'` diye yazılıyordu; virgül taşıyan her metin varsayılanı aynı hatayı üretirdi.
  - **Pilotun bulduğu iki doküman hatası:** `para.md`'de **aynı başlıklı İKİ `BankImportProfile`
    bölümü** vardı (ikisi de kendi tablosuyla — okuyan hangisinin geçerli olduğunu bilemezdi) ve
    `amount_mode`/`decimal_separator`/`date_format` `enum(...)` diye anlatılıyordu; üçü de `text` +
    `check`. Türetilmiş liste ikisini de görünür kıldı.
  - **Üç korumanın da ısırdığı doğrulandı:** uydurma alan adı taşıyan karar satırı yakalandı · elle
    düzenlenen blok "bayat" diye bildirildi · bozuk blok üretimi durdurdu.
  - **KALAN 6 DOSYA DA BİTTİ (26.08) — altı OPUS ajanı, dosya başına bir tane, paralel** (kullanıcı
    izni + model seçimi 26.08). Toplam: **67 varlık · 596 elle yazılmış alan satırı silindi ·
    456 karar maddesi tutuldu.** Dosya başına: `iletisim-geribildirim` 16 varlık/106 karar ·
    `musteri-siparis` 13/124 · `katalog` 17/120 · `stok-tedarik` 10/47 · `depo` 8/35 ·
    `operasyon` 3/18.
  - **HİÇBİR GERÇEK KARAR KAYBOLMADI — ölçüldü.** Eski dosyalardaki 60 karakterden uzun 161 notun
    tamamı yeni dosyalarda arandı: ajanların dokunduğu altı dosyada **kayıp sıfır**. Bulunamayan üç
    not PİLOTUNKİYDİ (benim yeniden ifade ettiklerim); üçü de yerinde, yalnız cümleleri değişmiş.
  - **Sınır ihlali yok:** altı ajanın hiçbiri kendi dosyasının dışına çıkmadı, `scripts/` altına
    dosya bırakmadı, `git` ya da `db:*` çalıştırmadı. `docs:sync`i de koşmadılar ve gerekçeleri
    doğruydu: `--fix` bütün data-model dosyalarına yazar, yani o an başka ajanın yarım işini ezerdi;
    onun yerine üretim fonksiyonunu kendi kopyalarında yalnız kendi dosyalarına uyguladılar.
  - **"ŞÜPHEDEYSEN TUT" KURALI ÖLÇÜLEBİLİR BİÇİMDE ÇALIŞTI.** Ön ölçüm 480 satırın atılabilir
    olduğunu söylüyordu; ajanlar 272 attı, yani **tahminden daha az kırptılar.** Bu bir eksiklik
    değil, kuralın kendisi: hata yönü geri alınabilir tarafa çevrildi — fazla tutulan satır sonraki
    turda kırpılır, silinen gerekçe geri gelmez. İkinci bir kırpma turu artık GÜVENLE yapılabilir.
  - **Ajanlar üç doküman hatası daha buldu:** *(1)* `webhook_event` kolonu dokümanda
    `provider_event_id` diye anlatılıyordu, gerçek ad `event_id` — **aynı yanlış ad 02.4'ün görev
    satırında da duruyordu** (bu turda ikisi de düzeltildi); *(2)* `error_log.source` notundaki
    kaynak listesi migration'daki `web-action`'ı içermiyor ve migration'ın gerekçesi
    (*"serbest metin, enum DEĞİL — yeni bir kaynak migration istemesin"*) dokümanda hiç yok;
    *(3)* `para.md`'de aynı başlıklı iki `BankImportProfile` bölümü vardı.
  - **ESKİ `§1` EMEKLİ EDİLDİ (geçiş artığı 29 satırdı; iki ajan bağımsız bildirdi).** Doküman↔tablo
    karşılaştırması türetilmiş bloğu olan varlıklarda ATLANIYOR — o karşılaştırma artık anlamsız,
    çünkü liste zaten tablodan üretiliyor. **Zod↔tablo karşılaştırması AYNEN sürüyor** ve ısırdığı
    doğrulandı (şemaya uydurma alan eklenince kırmızı). Şema elle yazılır, kayabilir; denetlenmesi
    gereken tek çift artık odur.
  - **KALAN (ayrı tur):** *(a)* ikinci kırpma turu — `path`/`(varsa)` gibi tipi tekrar eden satırlar
    ajanların "şüphedeysen tut" kuralı gereği duruyor; *(b)* `error_log.source` listesinin
    migration'la hizalanması. İkisi de içerik güvende olduğu için artık risksiz.

## Netleşecekler

- **Migration aracı:** Supabase CLI mi, kendi küçük runner'ımız mı — artı/eksi masaya konup karar verilecek (STACK §13 statü notu gereği).
- **Veri erişim modeli:** service-role + guard (tek kat) mı, + RLS ikinci hat mı; RLS'nin ilk kapsamı hangi tablolar. Aynı konuşmada karar.

---

**Modül durumu (26.08.2026 — denetim ölçümü):** altyapı tamam; şema kapsamı artımlı büyüdü ve
`DATA_MODEL`'in tüm aileleri artık yerinde.
- **Ölçülen:** 50 migration (`0001`–`0051`, `0025` boşlukta — aşağıya bak) · **84 tablo** ·
  63 servis · `pnpm db:start/stop/reset/migrate/new/seed/refresh` · `BaseDbService`
  (jsonb-güvenli case dönüşümü, `moneyFields` euro↔cent sınırı, `{data,error}`, keyset).
- **Açık:** `02.15` (kısmi unique indeksler) ve `02.4`'ün ölçülmemiş kalan kapsamı — ikisi de
  kendi satırlarında.

> **Önceki alt bilgi bir aydan fazla bayattı ve üç yanlış şey söylüyordu** (26.08 ölçümü):
> migration aralığı `0001–0005` yazıyordu (gerçek: 50 dosya) ve *"Yok: para, mesajlaşma, geri
> bildirim tabloları"* diyordu — üçü de aylardır var. Sebep 01'dekiyle aynı ve yapısal: tablo
> BAŞKA modülün turunda doğuyor, o modül kendi satırını işaretliyor, **02'nin alt bilgisi kimsenin
> işi olmadığı için donuyor.** Bir alt bilgi, ancak birinin dönüp ÖLÇMESİYLE doğru kalır.

**Adlandırma (27.07, kullanıcı kararı):** ayar tarafı **çoğuldur** — tablo `settings`, servis `SettingsService`. Gerekçe: orada bir ayar değil, ayarlar tutulur. Satır tipi tekil kalır (`Setting`) — bir satır bir ayardır; aynı desen `user_profiles` → `UserProfile`'da zaten var.

> **Açık kalan tutarsızlık:** tabloların ~~23'ü~~ **80'i** tekil (`product`, `order`, `stock`…), 4'ü çoğul (`settings`, `user_profiles`, `email_verifications`, `product_collections`). "Tabloda çoğul şey durur" argümanı hepsi için geçerli; yani ya hepsi çoğul olmalı ya da ayrım bilinçli sayılmalı. Toptan yeniden adlandırma greenfield'da mümkün ama `user_profiles` her yerde geçiyor ve `product_collections` başka ajanın aktif alanında — ürün tarafı boşaldığında tek seferde konuşulacak.
