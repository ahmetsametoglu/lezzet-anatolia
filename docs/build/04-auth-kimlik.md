# 04 — Kimlik ve Yetki: Supabase Auth, Guard'lar, Müşteri Bağlama

## Kapsam

Kim kimdir ve kim neye dokunabilir: Supabase Auth kurulumu (**yalnız kimlik/oturum motoru** — mail göndermez), Google + e-posta OTP girişi, rol kapıları (`requireAuth/requireAdmin/requireWarehouse/requireCourier` tek yerden), Auth kullanıcısını `Customer`'a bağlama, misafir hızlı doğrulama akışının sunucu tarafı, telefon/e-posta ile **bul-veya-oluştur** servisinin DB'ye bağlanması ve **müşteri birleştirme** RPC'si. **UI yok** — giriş/hesap sayfaları `08`'de, admin ekranları `09`'da; burada servis, action ve altyapı katmanı yazılır. B2B başvuru **onay ekranı** da `09`'dadır (buradaki iş yalnız kimliğin kurulması).

## Okunacaklar

- `DOMAIN.md §2` (roller ve izin ilkesi), `§10` (kimlik, birleştirme, hesap ve doğrulama — tamamı)
- `CHANNELS.md §3` (telefon anahtardır)
- `STACK.md §7` (guard deseni), `§13` (veri erişim modeli — 02'de netleşen karar geçerli)
- `INTEGRATIONS.md` Bildirim bölümü ("Auth mailleri de buradan" notu)
- `data-model/musteri-siparis.md` (`Customer`, `Address`)

## Bağımlılık

`01-types` ve `02-database` bitmiş olmalı. Kimlik çözümü görevleri `03-domain-core`'un saf bul-veya-oluştur kararını kullanır (o fonksiyon bitmiş olmalı; 03'ün geri kalanı beklemez).

## Başlarken verilecek izah (örnek)

> "Giriş sistemini kuruyoruz: müşteri Google hesabıyla ya da e-postasına gelen tek kullanımlık kodla (OTP) girer — şifre yok. Kimliği Supabase'in hazır oturum motoru tutar, ama doğrulama maili dahil her e-postayı kendi mail paketimiz gönderir; böylece bütün mailler tek yerden, aynı görünümle çıkar. Ayrıca 'bu kullanıcı admin mi, depocu mu, kurye mi' kontrolünü tek dosyada topluyoruz — her korunan sayfa ve işlem aynı kapıdan geçer, izin kuralı iki yerde yaşamaz. Son parça: hangi yoldan girilirse girilsin (Google, e-posta, ileride WhatsApp) kişinin tek müşteri kaydında birleşmesi; yanlışlıkla kopya oluşursa admin'in tek aksiyonla birleştirebilmesi."

## Görevler

- [x] (04.1) **Supabase Auth kurulumu:** Google OAuth + e-posta OTP açık, şifreli giriş kapalı; sunucu tarafı oturum okuma yardımcıları (`lib/supabase`)
  - *Bitti:* test kullanıcısı iki yöntemle de giriş yapıp sunucuda oturumu okunabiliyor
  - **Durum (29.07 · dönüş adresi allow-list'i — Google girişini sessizce kıran ayar):** kullanıcı geri bildirimi: *"sepete ürün attım, ödeme sayfasında Google ile girdim; sepetim boşaldı ve ana sayfaya düştüm."* İkisi de TEK sebepten: `supabase/config.toml` `site_url = http://127.0.0.1:3000` ve `additional_redirect_urls = ["https://127.0.0.1:3000"]` idi — uygulama ise `http://localhost:3000`'de koşuyor (`NEXT_PUBLIC_SITE_URL`). Dönüş adresi listeyi geçemeyince **GoTrue sessizce `site_url`e düşer**: kod `/auth/callback`'e hiç uğramaz, `next` kaybolur (→ ana sayfa) ve müşteri **başka bir origin'de** uyanır. `localhost` ile `127.0.0.1` tarayıcı için ayrı origin'dir; misafir sepeti `localStorage`'da yaşadığı için (`lezzet.cart.v1`) diğer origin'de görünmez — sepet "boşalmış" gibi okunur. Sepet kodunda hata yoktu, sepet oradaydı; müşteri başka kapıdan çıkmıştı.
    **Düzeltme:** `site_url` uygulamanın origin'ine eşitlendi, allow-list joker yolla iki host'u da alıyor (`http://localhost:3000/**`, `http://127.0.0.1:3000/**`) — dönüş noktası tek değil, OTP ve şifre akışlarının kendi adresleri de var.
    **Canlıda karşılığı Supabase panelindeki Redirect URLs listesidir** — aynı biçimde doldurulmazsa aynı hata canlıda tekrarlar, üstelik orada "sepetim boşaldı" diyen gerçek bir müşteri olur.
    **Uygulanması için Supabase yeniden başlatılmalı** (`supabase stop && supabase start`) — auth ayarı kapsayıcı açılışında okunuyor. Veri silinmez; yine de servis komutu KULLANICININ.
- [x] (04.2) ~~**Send-email hook → `packages/email`**~~ → **OTP kodu bizde üretilir, mail Resend'den çıkar:** OTP/doğrulama maili `packages/email` şablonuyla gider, Supabase'in kendi mailinden hiçbir şey çıkmaz
  - *Bitti:* OTP maili bizim şablonla geliyor; Supabase'in kendi mailinden hiçbir şey gitmiyor
  - **Yol DEĞİŞTİ, sonuç aynı (künye 27.08'de gerçeğe uyduruldu — denetim):** başlık *"send-email hook"* diyordu ve arayan kişi olmayan bir kancayı arardı — `supabase/config.toml`da `[auth.hook.*]` bloklarının **hepsi yorumda**, etkin tek hook yok (ölçüldü). Bugünkü zincir üç adım: **(1)** kodu biz üretip `email_verifications`a **hash'leyerek** yazıyoruz, **(2)** düz kodu `sendEmail` ile Resend gönderiyor (`packages/application/src/auth/otp.ts`), **(3)** doğrulama geçince Supabase'in `admin.generateLink({type:'magiclink'})`i çağrılıyor — **mail atmak için değil**, oturumu açacak `hashedToken`ı almak için; o çağrı kullanıcı yoksa `auth.users` satırını da yaratır ve trigger profili bağlar. Yani Supabase mail zincirinde hiç yok. Test kapısı açıkken Resend'e HİÇ gidilmez (her e2e koşusu gerçek mail üretirdi).
- [x] (04.3) **Rol saklama + guard katmanı (`lib/guard.ts`):** rolün tek kaynak yeri (aşağıda netleşecek) + `requireAuth/requireAdmin/requireWarehouse/requireCourier` tek dosyadan; korunan örnek bir Server Action
  - *Bitti:* rolsüz kullanıcı korumalı action'dan `{error}` alıyor; dört guard da aynı dosyadan export
  - **Durum (27.07):** rol modeli karara bağlandı ve uygulandı. `user_profiles.role` → **`roles user_role[]`**; `accounting` rolü eklendi; guard'a `requireAccounting`. Motor `domain-core/identity/roles.ts` (12 test), DB kısıtları (6 test).
  - **İki eksen, tek alan:** müşteri ↔ personel keskin ayrım (DB kısıtı `customer`ın yalnız başına durmasını zorlar), personel içinde çoklu rol serbest. Ayrı bağ tablosuna çıkarılmadı: rol okuması guard'ın **sıcak yolu** (her korumalı istekte), dizi tek satırda gelir; bağ tablosu her istekte join demekti.
  - **Kısıt tuzağı:** `array_length(roles,1) >= 1` boş dizide **NULL** döner ve NULL'a düşen CHECK "ihlal edilmedi" sayılır — kısıt sessizce delinirdi. `cardinality()` ile düzeltildi (testli).
  - **Rol geçişi sessiz değil:** operasyon rolü verilince `customer` düşer, müşteri yapılınca tüm operasyon rolleri düşer, son rol alınınca kişi müşteriye düşer (hesap silinmez). `pnpm set-role` artık rol EKLER; `--only` ile kümeyi sıfırlar.
  - ~~**Kalan:** `requireAdmin/requireWarehouse/requireCourier/requireAccounting` yazıldı ama çağıranları ilgili modüllerin ekranlarıyla gelir (bugün yalnız `requireStaff` kullanımda).~~
  - **Çağıranlar GELDİ — sayıldı 27.08 (denetim):** `requireAdmin` **51** üretim dosyası · `requireStaff` **25** · `requireWarehouse` **8** · `requireWarehouseScope` **8** · `requireCourier` **6**. Yani 27.07'nin "bugün yalnız `requireStaff`" cümlesi bir aydır yanlıştı ve satırı okuyan "guard seti daha bağlanmamış" sanırdı.
  - **AÇIK ÖLÇÜM (işaret değil — `04.3` kapalı, kapanmış göreve borç asılmaz): `requireAccounting`in üretimde HÂLÂ sıfır çağıranı var** — yazıldığı günden 27.08'e kadar hiçbir yerden. `knip` bunu göremiyor (barrel'dan ihraç + `guard.ts` içinde tanımlı), yani makine değil ancak künye söyleyebilir. İki yol var ve **karar verilmedi**: muhasebe ekranları geldiğinde bağlanır, ya da `requireRole('accounting')` zaten tek satır olduğu için kısayol silinir. `requireAuth` de dışa açık ama tek tüketicisi `guard.ts`in kendisi — o bilinçli olabilir (kapı zinciri), ölçüm kayda geçti.
- [x] (04.4) **`Customer.auth_user_id` bağlama:** girişte Auth kullanıcısı e-postayla mevcut `Customer`'a bağlanır; yoksa yeni müşteri açılır (03'ün bul-veya-oluştur kararı + DB yazımı)
  - *Bitti:* aynı e-postayla önce müşteri kaydı sonra giriş → tek Customer, `auth_user_id` dolu
  - **Durum (27.07):** `0011_customer_fields.sql` — müşterinin ticari alanları (`company_info`, vergi no + VIES, vade üçlüsü, `discount_percent`, `cod_allowed`, pazarlama izni, edinim kaynağı, `referred_by`) **`user_profiles`'a eklendi**; `address` tablosu açıldı; `price.customer_id` FK'si bağlandı. `AddressService` + `UserProfileService`'e kimlik/liste/B2B uçları.
  - **AYRI MÜŞTERİ TABLOSU YOK — düzeltme (27.07):** ilk denemede `customer` diye ikinci bir tablo açılmıştı. `0001` zaten "müşteri bir ROLDÜR, ayrı tablo yok; ticari alanlar ilgili modülün migration'ında eklenir" diyordu; `UserProfileService.findOrCreate` de aynı işi yapıyordu. Yani tablo, servis ve kapı ikinci kez yazılmıştı — geri alındı, tek kimlik tablosunda birleştirildi. **Ders:** `DATA_MODEL`'deki varlık başlığından yürümeden önce o varlığın kodda karşılığı var mı diye bakılır (CLAUDE.md §1 + "kod ile doküman çelişirse kod haklı").
  - **1:1 uzantı tablosu da açılmadı** (kullanıcı kararı 27.07): alanların hepsi küçük skaler, satır dar; güvenlik sınırı bizde tabloda değil (her okuma sunucudan `service_role` + guard'dan geçer). Bölmek her sepet/checkout okumasına join, kimlik kurulumuna ikinci satır yazımı, birleştirmeye ikinci taşıma ekler.
  - **Tekillik DB'de:** ~~telefon,~~ e-posta (küçük harfe indirgenmiş) ve `auth_user_id` kısmi unique indeksli (`0001`). Kopya kayıt birleştirme gerektiren bir istisnadır.
  - **TELEFON ARTIK BURADA DEĞİL (27.08'de düzeltildi — denetim):** üstteki cümle 25.08'den beri yanlıştı ve **çelişkinin öteki ucu aynı dosyadaydı** (`04.10` birinci dilimi). `user_profiles`ta telefon unique indeksi YOK (ölçüldü: `pg_indexes`te tek bir telefonlu unique indeks bile yok); anahtar `customer_phone` tablosuna taşındı (`customer_phone_active_key`). Sebep `04.10`'da yazılı: serbest metinden yazılan bir kolon kimlik anahtarı olamaz — kayıtlı olmayan numara önceden sahiplenilebiliyordu. `user_profiles.phone` kolonu DURUYOR ama artık **anahtar değil, tercih**: adres formunun ön-doldurması onu okuyor (`04.10` ekran ayrımı).
  - **Kanal kolonu YOK:** b2b/b2c `company_info` varlığından türetilir; `in_route` de adreste saklanmaz.
- [x] (04.5) **Bul-veya-oluştur servisi (telefon + e-posta):** 03'teki saf eşleşme kararını çağırıp DB işini yapan servis; eşleşme yoksa `is_draft=true` taslak müşteri açar (WhatsApp/manuel girişlerin de kullanacağı tek kapı)
  - *Bitti:* telefon eşleşen / e-posta eşleşen / hiç eşleşmeyen üç senaryo doğru sonuçla testte
  - **Durum (27.07):** `apps/web/lib/identity/find-or-create.ts` — kimliğin tek kapısı, `user_profiles` üzerinde. Telefon E.164 normalize edilip aranır (yoksa "+33 6.." ile "0033 6.." ayrı kişi olur). Dört sonuç: `attached` · `created` · `conflict` (anahtarlar birden çok profile çıktı → sessizce seçilmez, admin birleştirir) · `insufficient` (anahtarsız kimlik kurulamaz — "hesapsız sipariş yok" burada başlar). 10 test.
  - **Kural servisten motora taşındı:** `UserProfileService.findOrCreate` çakışmada "telefon birincildir" diye kendi içinde karar veriyordu — iş kuralı servis katmanında yaşayamaz (STACK §4). Servis artık yalnız aday getirir (`findIdentityCandidates`), kararı `resolveIdentity` verir.
  - **Üçüncü kimlik anahtarı eklendi (03.9 genişletildi):** `auth_user_id`. Sebep somut: `0002` trigger'ı giriş anında profili zaten açıyor/bağlıyor; kapı bundan habersiz davranınca aynı Auth kullanıcısını ikinci profile yazmaya çalışıp tekillik kısıtına çarpıyordu. Çakışma sonucu da `customerIds: string[]` oldu — üç anahtar üç ayrı kayda düşebilir, iki adlı alan bunu ifade edemiyordu.
  - **Trigger ile iş bölümü:** trigger yalnız **e-postayla** eşleştirir (Google OAuth'ta sunucu kodumuz devrede olmayabilir, bağlama atomik olmalı). Sadece telefonu olan WhatsApp taslağı girişte eşleşmez ve ikinci profil doğar — bu gerçek bir kopya durumudur, kapı onu `conflict` olarak görünür kılar (testli), birleştirme 04.7'de.
  - **Eksik anahtar tamamlanır, dolu olan EZİLMEZ:** telefonla tanınan müşteri web'den e-postayla gelince o anahtar da karta yazılır (sonraki gelişte tek sorguda bulunur); ama adı gibi kullanıcının kendi düzelttiği veriyi otomatik akış üzerine yazmaz.
  - **Konum gerekçesi:** servis değil, **uygulama katmanı orkestrasyonu** — karar motorun (`resolveIdentity`), satır servisin, ikisi birbirini bilmez (STACK §4). Bugünkü tek tüketici web; WhatsApp (modül 15) da aynı kapıyı isteyince paylaşılan yere taşınır. İki tüketicisi olmadan paket açmak erken soyutlama olurdu. `touches: apps/web/lib/identity/**`
- [x] (04.6) **Misafir hızlı doğrulama akışı (sunucu tarafı):** hesapsız başlayan müşteri son adımda e-posta OTP ile doğrulanır → bul-veya-oluştur'dan geçip `Customer`'a bağlanır ("hesapsız sipariş yok" kuralının altyapısı; ekranı 08'de)
  - *Bitti:* doğrulanan misafir mevcut müşteriyse ona bağlanıyor, değilse yeni Customer açılıyor (iki dal testli)
  - **Durum (27.07):** `apps/web/lib/identity/verify-guest.ts` — OTP doğrulaması BAŞARILIYSA bul-veya-oluştur kapısından geçilir. Yanlış/süresi geçmiş kodda profil **açılmaz** (doğrulanmamış kimlik kayıt yaratmaz — testli). Checkout formundaki telefon aynı turda ikinci anahtar olarak karta yazılır. 5 test. Ekranı 08'de.
- [ ] (04.7) **Müşteri birleştirme RPC'si:** siparişler, adresler, puanlar, konuşmalar, ticket'lar hedef müşteriye taşınır; kaynak kayıt kapanır — tek transaction; admin action'ı (ekranı 09'da)
  - *Bitti:* taslak + gerçek kayıt birleştirme testinde tüm bağlı kayıtlar hedefte, kaynak pasif; yarıda kesilme durumunda hiçbir şey taşınmamış (atomiklik)
  - **Birleştirmenin üç mayını (30.07 · WhatsApp bağlama tartışmasında çıktı) — RPC yazılırken karara bağlanacak, sonra keşfedilirse veri kaybı olur:**
    **(1) Puan defterinin tekillik indeksi çakışır.** 17.4'te `(müşteri, sebep, kaynak)` kısmi unique indeksi var; birleşmede iki kaydın aynı `(sebep, kaynak)` satırı tek müşteriye düşer. `on conflict do nothing` **sessizce puan eksiltir** ve müşteri bunu destek çağrısıyla bildirir. Düşürmek doğru davranıştır (aynı kaynak iki kez ödüllendirilemez) ama **iz bırakmak zorundadır**.
    **(2) Getiren–getirilen kendi üstüne kapanabilir.** `referred_by` doluysa getirene 50 puan yazılıyor ve kaynak YENİ müşterinin kimliği (17.7). Kendi taslağını davet edip sonra birleştiren kişi kendini getirmiş olur; RPC bu döngüyü kırmalı ve verilmiş puanı geri almalıdır.
    **(3) Günlük tavan birleşme sonrası aşılmış görünür** (100/gün). Bu **kabul edilir**: tavan kazanmayı yönetir, geçmişi değil — satır silerek "düzeltmek" defteri bozar. Buraya yazıldı ki sonradan kimse hata sanıp düzeltmeye kalkmasın.
  - ~~**Neden bekliyor (27.07):** taşınacak beş tablodan bugün yalnız ikisi var (`address`, müşteriye özel `price`). Sipariş 07'de, puan 17'de, konuşma 15'te, ticket 16'da açılıyor... Bağlı tabloların çoğu ayağa kalkınca yazılacak.~~ — **ENGEL KALKTI ve RPC YAZILDI; satır bunu 27.08'e kadar bilmiyordu** (denetim ölçümü). Bu, `03.3`'te adı konan desenin aynısı: *"engeli kaldıran haber verir, satırın sahibi kapatır"* — engel kalktı, kimse dönmedi. **Bugün var olanlar:** `0040_customer_merge.sql` → `merge_customers` **15 tabloyu** taşıyor (sipariş · puan · konuşma · ticket · adres · fiyat · sepet · indirim kullanımı · ürün yorumu · telefon · bildirim kayıtları · geri bildirim isteği · getiren bağı) + `preview_customer_merge` (önizleme; satır bunu şart bile koşmamıştı) + `UserProfileService.merge/previewMerge` + testi (`user-profile-merge.test.ts`) + **üretim çağıranı** (`whatsapp-link.ts:193`). Kapı dört hâli reddediyor: kendiyle birleştirme, zincirleme birleşme (A→B→C), anonimleştirilmiş kayıt, personel kaydı. Kilit sırası kimliğe göre — ters yönden gelen iki operatör ölü kilit üretemiyor.
  - **BİRLEŞME KURALLARI KARARA BAĞLANDI ve YAZILDI (27.08 · kullanıcı kararı).** Denetim, birleştirmenin **on yedi ticari alanın hiçbirine** dokunmadığını ama SİPARİŞLERİ taşıdığını ölçtü: şirket kartı bireysel karta birleşince `company_info`, `vat_number`, `credit_enabled`, `credit_limit`, `payment_term_days`, `price_group_id`, `discount_percent` kapanan kayıtta kalıyor, ödenmemiş faturalar ise vade ayarı olmayan bir kartın üstüne geçiyordu — **borç duruyor, freni gidiyordu** (`checkout-options.ts` limiti müşteri kartından okur). Karar iki maddede:
    - **Bir tarafta ŞİRKET varsa birleşme YOK — istisnasız.** Gerekçe kullanıcının: birleştirmenin sebebi *"aynı kişi iki kez kaydolmuş"*tur; şirket kaydı ile bireysel kayıt çoğu zaman kopya DEĞİLDİR (lokanta sahibi işletmesi için faturalı/vadeli, evi için normal fiyattan alır — aynı insan, iki ayrı müşteri). Alanları taşımak da çözüm değildi: iki ayrı kişinin ticari koşulları birleştirilemez, SEÇİLİR, ve seçim operatörün işidir — sessiz bir `coalesce` değil. Kapı **fail-closed**: *"şirket mi"* sorusunun üretimde İKİ cevabı var (`type = 'company'` çekirdek yolda, `company_info is not null` `prices-read`te) ve onları bağlayan kısıt YOK — besleme bile ayrışmış kayıt üretiyor (ölçüldü), tek sinyale bakan kapı o satırda sessizce açık kalırdı. **Tek istisna, kaynak SAF TASLAKSA** (girişi yok, birleştirilmemiş, şirket künyesi yok): taslak ikinci bir müşteri değil, ezilecek ticari kimliği olmayan bir kırıntıdır — ve istisna olmasaydı **canlı bir akış kesilirdi**, ölçüldü: `merge_customers`ın üretimdeki tek çağrısı WhatsApp bağlamadır (`whatsapp-link.ts:193`), oraya yalnız kaynak saf taslakken girilir ve **hedef şirket olabilir**; şirket hesabı olan müşteri WhatsApp'ını bağlayamaz, geçmişi ayrı taslakta kalırdı. İstisna kaynağın şirket sinyalini ayrıca sınıyor, yani "taslak" etiketi künyeyi örtemiyor.
    - **İzinler `coalesce` değil KESİŞİM — kısıtlayıcı olan kazanır.** Tek cümleyle: *birleşmiş kart, iki karttan hiçbirinin yapamadığı bir şeyi yapamaz.* İzin bir olgu değil BEYANDIR; beyan miras kalmaz, aksi hâlde birleştirme bir izin ÜRETİRDİ. Aynı `update` satırında kimlik anahtarı için "boş olan dolar", izin için "kesişim" olması tutarsızlık değil — taşınan şeylerin cinsi farklı. İki kapının varsayılanı zıt olduğu için `merge_consent(hedef, kaynak, opt_in)` ayrımı taşıyor: kampanya OPT-IN (anahtar yoksa hayır), bildirim OPT-OUT (anahtar yoksa evet). **Kayıt UYDURULMUYOR:** sonuç "izin yok" ise reddeden tarafın satırı olduğu gibi alınır (tarihi ve kaynağıyla) ya da anahtar hiç yazılmaz — imal edilmiş bir `granted:false`, verilmemiş bir beyanı belgelemek olurdu. `b2b_pending` vakası ayrı bir dal istemedi: başvuran kaydın künyesi dolu olduğu için şirket kapısına takılıyor (yazılsaydı erişilemez kod olurdu).
    - *Testler:* `user-profile-merge.test.ts` 21 test (10'u bu turda) — hedef şirket · kaynak şirket · yalnız künye dolu (fail-closed'un ikinci sinyali) · saf taslak şirkete birleşir · taslak etiketi künyeyi örtmez · kampanya izni sessizlikte düşer / iki tarafta da varsa kalır / açık ret kazanır · bildirim varsayılanı korunur. `merge_consent` ayrıca altı hâliyle SQL'den doğrudan yoklandı. WhatsApp bağlama akışının 11 testi de yeşil — kesilmediği ölçüldü.
  - **KUTU BİLEREK `[ ]` BIRAKILDI (27.08):** iş bitmedi, iki ayağı açık ve ikisi de karar istiyor — **(a)** yönetici ekranı `09.10`'da (`[~]`) ve o olmadan birleştirmeyi yalnız WhatsApp bağlama yolu tetikleyebiliyor; **(b)** yukarıdaki **mayın 2** karşılanmadı ve mayın metni birebir gerçekleşiyor.
    **Ölçüldü (yerel DB, işlem geri alındı — 27.08):** kaynağı hedef davet etmişse (`kaynak.referred_by = hedef`, yani kişinin kendi taslağını davet etmesi) birleşme sonrası **`hedef.referred_by = hedef` oluyor — döngü KURULUYOR** (`referred_by = id` doğrulandı). Sebebi son güncellemedeki `coalesce(v_target.referred_by, v_source.referred_by)`: hedefin alanı boş olduğu için kaynağınki geçiyor ve kaynağınki zaten hedefi gösteriyordu. Veride engel yok — `merged_into_id` için self-check kısıtı var (`user_profiles_merge_not_self`), `referred_by` için YOK.
    **Puan da defterde kalıyor:** 500 puanlık `referral` satırı birleşmeden sağ çıkıyor ve hedefe kendini getirmenin ödülü olarak yazılı duruyor. Satırın `ref_id`si kapanmış kaynağı gösterdiği için `ref_id = customer_id` diye bakan naif bir tarama da onu **bulamaz**.
    **Araç eksik değil, ÇAĞRI eksik:** geri alma mekanizması zaten var ve iyi tasarlanmış — `revokeReferralOnUnpaidOrder` (17.08) ödülü `paid`ten çıkışta geri alıyor, ölçütü de ödülün anlamından türetiyor (*"kişinin ödenmiş başka siparişi kaldıysa olgu sürüyordur"*), altında `revokePoints(db, {customerId, reason:'referral', refId})` ilkeli duruyor. Birleştirme yolu bu ilkeli **hiç çağırmıyor**.
    **İkinci dereceden sonuç (kod okuması, koşturulmadı):** döngü kurulduktan sonra aynı kişinin YENİ bir ödenmiş siparişi `awardReferralPoints`i tetikler; fonksiyonda kendine-getirme kontrolü yok ve tekillik `(müşteri, sebep, kaynak)` üçlüsünde olduğu için `refId` bu kez kişinin kendisi olur — yani **ayrı bir satır**, ikinci bir 500 puan. Günlük tavan da frenlemez: `referral` bilerek `CAPPED_POINTS_REASONS` dışında (künyesi bunu yazıyor).
    **Testler de sessiz:** `user-profile-merge.test.ts`in 11 testinin hiçbiri `referred_by`e ya da getiren puanına bakmıyor (sayıldı). Mayın 1 (puan tekilliği) düzgün karşılanmış: çakışan ziyaret puanı düşüyor ve `points_dropped` ile **iz bırakıyor**, ki satırın istediği tam buydu. Mayın 3 zaten "kabul edilir" diye kapatılmıştı.
- [x] (04.8) **Rol atama zemini:** admin'in bir kullanıcıya rol verdiği/aldığı servis + action (ekranı 09'da); ilk admin'in seed/script ile atanması
  - *Bitti:* script ile atanan ilk admin `requireAdmin`'den geçiyor; rol alınan kullanıcı geçemiyor
  - **Durum:** ~~servis (`StaffRoleService.assign/remove/getRoles/hasRole`)~~ + seed script (`scripts/set-role.ts` → `pnpm set-role <email> <rol>`) yazıldı ve canlı doğrulandı (atanan admin guard'dan geçer, rol alınınca geçemez).
  - **`StaffRoleService` HİÇ VAR OLMADI — künye 27.08'de düzeltildi (denetim).** Ad depoda **yalnız bu dosyada** geçiyordu; kodda tek satırı yok (ölçüldü). Yetenek eksik değil, **yeri başka**: rol yazımı `UserProfileService.setRoles(profileId, roles, warehouseIds)` — aynı satırda rol ve depo kapsamı birlikte yazılıyor, ki `04.3`'ün "iki eksen, tek alan" kararı bunu gerektiriyor; ayrı bir rol servisi o satırı ikiye bölerdi. `docs:check` bunu yakalayamaz: dosya adını ve `pnpm` komutunu doğrular, **sınıf adını doğrulamaz** — yani `[x]` satırında anılan bir sınıfın varlığı bugün yalnız okuyanın gözüyle denetleniyor.
  - ~~**Admin assign/remove Server Action'ı, çağıranı olan ayar ekranıyla birlikte 09'da yazılır**~~ — **YAZILDI ve satır haber almadı.** Ekran `operations/settings` altında: `staff-dialog.tsx` rolleri seçtiriyor, `settings/actions.ts:167` `setRoles(id, roles, warehouseIds)` ile yazıyor, `:248` personeli müşteriye düşürüyor (hesap silmeden — `04.3`'ün rol geçişi kuralı). "Çağıransız yazılırsa ölü kod" endişesi doğruydu ve gerçekleşmedi.
  - **Yerelde artık `set-role` ZORUNLU (27.07):** seed bir admin profili açtığı için 0002'nin "ilk giriş yapan admin olur" bootstrap'ı tetiklenmez — kendi hesabınız `customer` açılır, `pnpm set-role <e-posta> admin` ile yükseltilir. Üretimde bootstrap olduğu gibi (seed atılmıyor). Ayrıntı: `build/02-database.md` (02.7). *(27.07'de o admin bypass'ın `dev-admin@lezzet.local` profiliydi; 19.08'de bypass sökülünce yerini seed'in gerçek yöneticisi aldı — kural aynı, dayanağı değişti.)*
- [x] (04.9) **Mailin dili: kayıt anında profile, sipariş anında siparişe** · `touches: apps/web/lib/identity/preferred-language.ts, apps/web/lib/identity/verify-guest.ts, apps/web/app/(customer)/[locale]/login/actions.ts, supabase/migrations/0012_order.sql, packages/types/src/entities/order.schema.ts, apps/web/lib/order/{checkout-draft,notification-data}.ts`
  - *Bitti:* Türkçe siteden kaydolan müşterinin profilinde `tr` yazılı; ona giden mail Türkçe çıkıyor
  - **Neden açık (29.07, gerçek olayla bulundu):** müşteriye giden mailin dili `customer.preferred_language`'dan okunuyor (`lib/order/notification-data.ts`) ve o kolonun **DB varsayılanı `'fr'`**. Kayıt/OTP/OAuth akışlarının hiçbiri onu yazmıyor — arandı, yalnız hesap sayfası OKUYOR. Sonuç: `/tr` ya da `/de` yüzeyinden sipariş veren müşteri de **Fransızca** mail alıyor.
  - **Bilgi elimizde:** sipariş verilen dil URL segmentinde (`routing.ts` locale). Yazılması gereken tek şey, bul-veya-oluştur anında (04.5/04.6) aktif locale'i profile geçirmek. Sonradan hesap sayfasından değiştirilebilir olması yeterli — dil bir tercihtir, her siparişte yeniden sorulmaz.
  - **Şablon tarafı HAZIR** (kontrol edildi 29.07): sipariş mailleri (6), OTP maili ve talep mailleri (14.7) üçü de üç dilde (`tr`/`fr`/`de`) metin tablosu taşıyor. Eksik olan tek şey, hangi dilin seçileceğini söyleyen veri.
  - **Durum (30.07 · dil TEK bir şey oldu — kullanıcı kararı):** kayıt anındaki tohum yerinde kalıyor ama **müşterinin sonradan değiştirebileceği bir yer yoktu**; kart ilk gündeki dilde donuyordu. Hesap sayfasına "bildirim dili" diye AYRI bir denetim eklendi ve kullanıcı haklı olarak reddetti: *"bildirim dili ayrı, sitenin dili ayrı demek çok mantıklı değil."* Ayrım geliştiricinin gözünde vardı, müşterinin gözünde yoktu — siteyi Türkçe gezen biri maillerinin Fransızca gelmesini beklemez.
    **Kural:** dil seçicisine basmak bilinçli bir seçimdir ve karta yazılır (`lib/identity/language-actions.ts`); footer'daki liste de hesap sayfasındaki hap da aynı kapıyı çağırır. **Yalnızca başka dildeki bir BAĞLANTIYA girmek yazmaz** — arkadaşının paylaştığı Fransızca bağlantıya tıklayan Türk müşteri o tek tıklamayla maillerinin dilini kaybetmemeli. Ayrım "URL'de hangi dil var" değil, "müşteri dili seçti mi". Bu yüzden yeni bir kolon (bir "kilit" bayrağı) da gerekmedi: otomatik olan tek yazma kayıt anındaki tohum, gerisi zaten müşterinin kendi eylemi.
    **Ziyaretçide sessizce döner:** yazacak kart yok, hata da yok — dil değiştirmek bir gezinme eylemi, önüne "giriş yapın" koymak saçma olurdu.
  - **Durum (29.07 — bitti). Çözüm iki katmanlı, çünkü iki ayrı soru vardı:**
    **(1) Siparişin dili siparişte durur** (`order.locale`, 0015). Sipariş mailleri artık profilden değil buradan okuyor. Profil sonradan değişebilir — müşteri hesap dilini değiştirir ya da aynı şirket hesabından başka biri sipariş verir; o an eski siparişin maili dil değiştirirdi. `address_snapshot` ile aynı gerekçe: siparişe ait bilgi siparişte durur. `null` = bilinmiyor (hızlı satış, operasyon girişi) → profile düşülür.
    **(2) Profilin dili kayıt anında tohumlanır** (`seedPreferredLanguage`). Sipariş DIŞI mailler (talep yanıtı, geri bildirim daveti) profilden okuyor; o yüzden yeni açılan kart geldiği yüzeyin dilini alıyor. **Yalnız İLK kez yazılır:** Fransızca bir bağlantıya tıklayıp giren Türk müşterinin kartı o tek tıklama yüzünden dil değiştirmemeli. Ölçüm `generateLink`'ten ÖNCE alınıyor — trigger profili açtıktan sonra bakan biri "zaten vardı" diye okurdu.
    **Kalan kapandı (30.07):** hesap ekranındaki dil artık gerçek bir denetim (`account/components/profile-card.tsx` → `LanguagePill`) ve footer'daki liste de aynı kapıyı çağırıyor. Tohumlama kuralının dayandığı "sonradan müşteri değiştirir" varsayımının karşılığı böylece kuruldu.

- [~] (04.10) **Kimlik çapası: e-posta bağlama + güvenlik kodu** — WhatsApp'tan gelen müşterinin hesabını sürdürülebilir kılan akış. `touches: apps/web/lib/identity/**, apps/web/app/(customer)/[locale]/account/**, packages/types/**, supabase/migrations/**`
- [x] (04.11) **Guard kimlik sözleşmesi: auth id ≠ profil id — gerçek girişte profil-FK'li kimlik yanlış geçiyor** *(mobilin ölçümü 08.08, koordinasyon defteri; denetim kodda bağımsız doğruladı)*: `guarded(requireCourier)` auth kimliğini döndürüyor (`lib/guard.ts` oturum kullanıcısı) ve `deliveries/page.tsx:62` onu `courierId` olarak kapıya geçiriyor — oysa `order.courier_id` FK'si `user_profiles(id)`. Dev bypass'ta görünmez (seed, bypass kimliğiyle AYNI id'li profil açıyor — `guard.ts` künyesi). **Envanter ÇIKARILDI (08.08, denetim — kullanıcı yetkisiyle): 16 akış · 9 dosya, tam liste `docs/talep/arka-uc-guard-profil-kimligi.md`.** İki belirti sınıfı: kurye OKUMALARI gerçek girişte sessizce boş (7 akış); personel YAZIMLARI (actorId/staffId/authorId — 9 akış) gerçek girişte FK ihlaliyle düşer, yani bypass'sız oturumda operasyon yüzeyi fiilen çalışmaz. Çözüm yönü: guard dönüşüne profil kimliği eklenir (`currentCustomerId`ın `findByAuthUserId` deseni), ekranlar profili geçer · `touches: apps/web/lib/guard.ts, apps/web/app/(operations)/operations/deliveries/**`
  - *Bitti:* bypass'sız kurye oturumu kendi günündeki durakları görüyor ve profil-FK'li hiçbir yazım auth kimliği taşımıyor
  - **Durum (08.08 · arka uç) — KAPANDI. 17 akış düzeltildi** (denetimin envanteri 16'ydı; `system/actions.ts:31` → `ErrorLogService.resolve` eklendi — `error_log.resolved_by` FK'si de `user_profiles`'a gidiyor, veritabanından doğrulandı).
  - **Sözleşme:** `StaffUser extends AuthUser { profileId }`. Auth kimliği `id`de kalıyor, profil kimliği yanına geliyor — **adlı**, çünkü çağıranın hangisini geçtiğini okurken görmesi gerekiyor. `guarded<T>` jenerik oldu ki personel kapısından geçen çağıran `profileId`yi kaybetmesin.
  - **Ek sorgu getirmedi, bir sorgu KAZANDIRDI:** `isStaff`/`hasRole`/`getRoles` zaten `findByAuthUserId` ile profili getirip yalnız `boolean` dönüyordu — satır okunuyor, kimliği atılıyordu. Guard'lar artık o satırı bir kez okuyup hem rol kararını (motorda: `roles.isStaff`) hem kimliği alıyor. `requireWarehouseScope` eskiden aynı satırı iki kez okuyordu.
  - **NÖBET — asıl kazanç bu.** Denetim *"typecheck de test de göremez"* demişti; doğruydu ama üçüncü bir yol varmış: bypass profilinin `auth_user_id`'si **zaten `null`** (operasyon layout'u bunu biliyor, boş rol kümesinde yöneticiye düşüyor), yani bypass'ın auth kimliğini profil kimliğinden ayırmak hiçbir şeyi bozmuyor. Ayrıldı (`DEV_BYPASS_AUTH_ID`). Sonuç: dev artık üretime benziyor ve `user.id`'yi profil kolonuna yazan bir yol **ilk denemede FK ihlaliyle patlıyor** — sessiz üretim arızası, gürültülü dev arızasına döndü.
  - **Gerçek girişle doğrulama yapılamadı** ve bu açıkça yazılıyor: bypass'sız oturum açmak arka uç şeridinin erişiminde değil. Zincir kodda ve tipte doğru; son onay 21.10 benimseme turunda kurye hesabıyla verilecek.
  - **KOD TARAFI 27.08'de bağımsız doğrulandı (denetim):** sözleşme yerinde — `guard.ts:50` `StaffUser.profileId`, `:157` profili tek okumadan dolduruyor; `deliveries/page.tsx:90` kuryeyi `courier.user.profileId` ile çağırıyor, yani envanterin işaret ettiği satır düzelmiş. Envanter dosyası (`docs/talep/arka-uc-guard-profil-kimligi.md`) da işlenip silinmiş.
  - **Ama vaat edilen ÇALIŞMA ANI onayı hiçbir yere yazılmadı:** `21.10` bu arada `[x]` oldu ve notlarında gerçek kurye oturumuyla yapılmış bir doğrulama kaydı YOK (arandı). Yani zincir "kodda doğru, sahada teyitsiz" hâlinde duruyor. İşaret bilerek `BEKLEYEN` yapılmadı — açık bir kod boşluğu değil, **kaydı düşülmemiş bir el yordamı kontrolü**; kapanmış bir göreve borç asmak da `docs:check`in reddettiği şeydir. Teyit ilk gerçek kurye oturumunda verilecek ve buraya bir satırla yazılacak.
    - **ARTIK ERİŞİLEBİLİR (15.08, `04.12`):** `/auth/dev-login` gerçek oturum kuruyor, yani "bypass'sız oturum açmak erişimimizde değil" cümlesi tarihe karıştı. Bu görevin ölçemediği şey — profil-FK'li yazımların gerçek girişte tutup tutmadığı — artık tek adresle sınanabilir (`?email=kurye@lezzetanatolia.fr`).
    - ✅ **SAHADAN TEYİT VERİLDİ (27.08, denetim — bir aydır bekleyen kayıt).** Ölçüm: production sunucusunda (3001, yani dev bypass'ının hiç var olmadığı derleme) `/auth/dev-login?email=kurye@lezzetanatolia.fr` → **307 → `/operations`**, çerez yazıldı; aynı çerezle `/operations/deliveries` → **200** ve sayfa **gerçek durak getirdi**: *"Durak 0 / 1 · 12 rue du Faubourg de Pierre, 67000 Strasbourg · Restaurant Bosphore · B2B · 60,00 € kapıda·kart · 1 kalem (4 × Bitter Çikolatalı Pasta 1600 g)"*. Yani kurye OKUMALARININ boş dönme belirtisi geçti — zincir `guard.ts` → `courier.user.profileId` → `order.courier_id` gerçek oturumda tutuyor. **Yazma tarafı bu turda ölçülmedi** (durak "Bekliyor" hâlinde bırakıldı; teslim yazımı yerel veriyi değiştirirdi).

- [x] (04.12) **HIZLI GİRİŞ KAPISI — production derlemesinde de gerçek oturum** (kullanıcı isteği 15.08).
  `touches: apps/web/app/auth/dev-login/route.ts, apps/web/lib/auth/dev-login-gate.ts,
  apps/web/app/(customer)/[locale]/login/{dev-login-links.tsx,page.tsx}, apps/web/.env.example`

  **İhtiyaç:** paralel production sunucusunda (`pnpm prod:web:start`, 3001 — `11.10`) operasyon
  ekranlarına admin olarak bakabilmek. Orada iki yol da kapalıydı: dev bypass `NODE_ENV !==
  'production'` şartına bağlı (`guard.ts:96`), sabit OTP kodu da `NODE_ENV === 'production'` iken
  kendini kapatıyor (`otp.ts:47`) — yani gerçek rastgele kod maille gidiyor ve okunamıyor.

  **BYPASS'I ÜRETİME AÇMAK SEÇİLMEDİ.** `guard.ts` künyesi *"production build'de env ne olursa
  olsun ASLA aktif olmaz"* diyor ve bu bir güvenlik güvencesidir; gevşetilseydi gerçek dağıtımda
  yanlış konmuş tek bir env değişkeni operasyon panelini herkese açardı. Onun yerine **mobilin
  deseni web'e alındı** (`apps/mobile-api/src/api/v1/dev-login.ts`): magic-link jetonu üretilir (mail
  GİTMEZ), SSR istemcisinde tüketilir, çerez normal giriş akışının yazdığının aynısı olur.
  **Guard'a hiç dokunulmadı.** Fark tam olarak budur: bypass auth'u ATLAR, bu kapı auth'u İŞLETİR
  — RLS, personel çözümü, denetim kaydındaki `actor_id`, hepsi gerçek. Test edilen şey de bu.

  **ÜÇ KİLİT, hiçbiri `NODE_ENV` değil** (kapının varlık sebebi production derlemesinde çalışması):
  (1) `DEV_LOGIN_ENABLED === 'true'` — varsayılan KAPALI, kapalıyken rota **404** döner (403
  değil: "burada bir kapı var ama sana kapalı" demek, kapının yerini söylemektir);
  (2) `NEXT_PUBLIC_SITE_URL` yerel bir adres olmalı — **asıl ikinci kilit budur**, çünkü SUNUCU
  yapılandırmasıdır ve isteği gönderen onu değiştiremez; gerçek dağıtımda oraya gerçek alan adı
  yazılıdır, bayrak açık unutulsa bile kapı kapalı kalır;
  (3) istek yerel host'a gelmiş olmalı — **ucuz ilk eleme, tek başına yeterli DEĞİL** ve künyede
  öyle yazıyor: `Host` başlığını isteği gönderen yazar, uydurulabilir.

  Hedef ROLDEN çözülüyor (`resolvePostLoginRedirect`), elle yazılmıyor — kurye adresiyle girilince
  kurye ekranına düşmesi kendiliğinden doğru olur. E-posta süzgeci bilerek YOK (mobil kapının aynı
  kararı): test hesabı değiştikçe uca dokunmak gerekmesin, yüzeyi zaten kilitler daraltıyor.

  **DÜĞME ŞERİDİ (kullanıcı isteği 15.08: *"tıpkı mobilde olduğu gibi butona basıp girebilecek
  miyim, sonrasında rollere göre de"*).** Giriş ekranının altında beş bağlantı — mobil giriş
  ekranının şeridinin aynısı, sırası da aynı. **Cihaz forkunun DIŞINDA** (`page.tsx`ten çiziliyor,
  `login.desktop`/`login.mobile`e ayrı ayrı değil): aynı liste iki dosyada yaşasaydı biri
  güncellenmeyi unuturdu. İstemci JS'i yok — düz `<a>`; `onClick` yazmak için bileşeni istemciye
  taşımak gerekirdi ve karşılığında hiçbir şey kazanılmazdı. Renk yüzeyi söylüyor: müşteri zeytin,
  operasyon terracotta (mobilin `operations` bayrağının aynısı).
  **Kilit tek yerde** (`lib/auth/dev-login-gate.ts`): rota da şerit de aynı fonksiyonu soruyor —
  ayrı yazılsaydı biri "kapalı" sanıp düğmeyi çizmezken öteki açık kalabilirdi, ya da tersi:
  çizilen ama 404 veren düğme. Kapalıyken şerit HİÇ çizilmez.
  **Bilinçli tekrar:** adresler `scripts/seed/people.ts`in malı ve burada kopyaları var. Tek
  kaynağa indirmenin yolu bugün yok — `scripts/` bir paket değil, web ondan import edemez;
  adresleri `packages/types`a taşımak geliştirme verisini sözleşme paketine sokardı. Dar ve
  künyeli bırakıldı.

  **ÖLÇÜLDÜ (15.08, dev sunucusunda — `curl`):**
  · yerel host + bayrak açık → **307**, `location: /operations`, `set-cookie: sb-…-auth-token`
  (yani gerçek Supabase oturumu yazılıyor)
  · `Host: evil.example.com` → **404** (üçüncü kilit tuttu)
  · rol ayrımı: `kurye@` ve `depo@` → `/operations`; `yamansehzade@` (müşteri) → `/` (vitrin)
  **ÖLÇÜLMEYEN:** production sunucusunda (3001) aynı tur. O an web derlemesi PARALEL ŞERİDİN
  düzeltmediği iki typecheck hatasıyla tutmuyordu (`assistant-body.tsx` → `PurchaseOrderPayload`,
  `procurement/actions.ts` → `StaffUser.user`). Kapının kendi mantığı `NODE_ENV`e hiç bakmadığı
  için davranışın değişmesini bekleyen bir sebep yok, ama **ölçülmedi** — derleme düzelince
  tek adresle doğrulanır.

  **KURULMAMIŞ VERİTABANINA HESAP AÇMIYOR (27.08 · mobil şeridin saha bulgusu 26.08).** Kapının
  kullandığı `generateLink` yalnız jeton üretmiyor: **kayıtsız e-postada `auth.users` satırını da
  YARATIYOR** (aynı çağrının öteki yarısı `04.2` künyesinde yazılı). Ölçülen zarar şuydu: cihaz
  turu sürerken `db:refresh` koştu, `auth.users` silindiği anda dev giriş düğmesi
  `kurye@lezzetanatolia.fr`e bastı, auth kullanıcısı **seed'den önce** doğdu ve `0002`nin AÇILIŞ
  KURALI (*"hiç admin yoksa doğan ilk hesap admin olur"*) ona `{admin}` verdi — **adsız,
  kapsamsız bir "yönetici"**. Ardından `seedKisiler` o satırı *"Marc Lemoine zaten var"* diye
  benimsedi; kurye hiç doğmadı ve hiçbir yerde hata yoktu.
  **`{admin}` bir varsayılan DEĞİL** (notun sorduğu buydu): trigger'ın rol varsayılanı
  `{customer}`, admin yalnız açılış kuralından geliyor. Kural üretimde gerekli ve doğru — birinin
  ilk yönetici olması lazım ve o an tabloda kimse yoktur. **Trigger DEĞİŞMEDİ.**
  Kapı artık yalnız o pencereyi kapatıyor: profili olmayan e-posta **+** tabloda hiç yönetici yok
  → **409**, hiçbir şey yazılmaz. **E-posta süzgeci EKLENMEDİ** — mobil kapının çivili kararı
  (*"kayıtsız e-posta da kabul edilir, ve bu BİLİNÇLİ"*, `preferences.test.ts`) yerinde duruyor ve
  ölçüm onu yanlışlamıyor: zarar yaratmaktan değil, **açılış kuralı silahlıyken** yaratmaktan
  doğdu. Kurulu bir veritabanında davranış hiç değişmedi.
  **Ölçüt tek yerde** (`@lezzet/application` → `auth/dev-login.ts`), çünkü web ve mobil kapıları
  aynı kararı veriyor. **Karar MOTORDA** (`devLoginRefusalOf`, 3 birim testi): sınadığı hâl —
  *"hiç yönetici yok"* — kurulu bir veritabanında üretilemez, üretmek tüm paketin okuduğu yönetici
  satırlarını silmek olurdu (`CLAUDE §4b`).
  **İKİNCİ HAT SEED'DE, ve kapıdan bağımsız gerekliydi:** profili e-postadan açan tek yol dev
  girişi değil (gerçek OTP akışı da açar), yani ölçüt yalnız uçta dursaydı aynı tuzak başka
  kapıdan kurulurdu. `seedKisiler` artık benimsediği kimliği tanıma karşı doğruluyor
  (`onarSapan`: ad · roller · depo kapsamı), sapmayı onarıyor ve **gürültü çıkarıyor**. Ölçüldü:
  `pnpm set-role depo.kehl@… admin` ile bozulan rol, sonraki seed turunda
  `⟳ rol {warehouse,admin} → {warehouse}` diye onarıldı; sapma yokken hiç satır basmıyor.
  - *Bitti:* doğrulanmamış numara kimlik anahtarı olmuyor; e-posta kodu WhatsApp'tan geri yazılınca hesap bağlanıyor; kod yalnız KENDİ numarasından geçerli (başka kanaldan reddediliyor); 3 ay sessizlik sonrası dönüşte geçmiş kod sorulmadan açılmıyor (dört dal testli)
  - **Kural metninin tamamı `DOMAIN §10`'da** ("Kimlik anahtarı, çapa ve süreklilik"). Kanal WhatsApp ama görev **kimlik** görevidir — bu yüzden 15'te değil burada. 15 yalnız mesajı taşır.
  - **Akış:** ilk sipariş tamamlanınca e-posta önerilir → kod **e-postaya** gider, müşteri **WhatsApp'tan** geri yazar (çapraz kanal kanıtı) → bağlanır. **İstemeyene** sistemin ürettiği 6 haneli güvenlik kodu verilir; e-posta sonradan doğrulanırsa kod silinir.
  - **Uygulamada kaybolmaması gereken şart — sorgunun YÖNÜ:** *gelen mesajın gönderen numarası → o numaraya bağlı kimlik → o kimliğin kodu eşleşiyor mu.* Tersi (*koddan kimliğe*) de çalışır, testleri de geçer, ama kodu numaradan bağımsız bir anahtara çevirir ve tasarımın güvenlik argümanını yok eder. İki yasak: web formundan/admin panelinden kod doğrulanmaz; **admin panelinde "kod doğrula" kutusu bulunmaz.**
  - ✅ **BİRİNCİ DİLİM YAZILDI (25.08) — ANAHTAR AYRILDI, `BEKLEYEN(04.10)` İŞARETLERİ KALKTI.** Açık şuydu (30.07'den beri): `user_profiles.phone` kimlik anahtarıydı (0001'de benzersiz kısmi indeks) ama **serbest metinden yazılıyordu** — hesap kartı (`updateProfileAction`) ve misafir checkout (`find-or-create` → `enrich`). Kayıtlı olmayan bir numara böylece **önceden sahiplenilebiliyordu**; gerçek sahibi WhatsApp'tan yazınca `resolveIdentity` onu sahiplenen hesaba bağlıyor, konuşması/siparişi/puanı yabancı bir hesapta görünüyordu. Sahibi kendi numarasına da ulaşamıyordu (benzersiz indeks + self-servis geri alma yok).
    **Çözüm bir kapı eklemek değil, İKİ İŞİ AYIRMAK oldu** (migration 0049): `user_profiles.phone` → iletişim numarası (tekillik KALDIRILDI, kimlik çözümünde hiç okunmuyor); `customer_phone` → kimlik anahtarı, satırın varlığı zilyetlik kanıtı. Motor kuralı: **kanıtsız numara var olan kayda BAĞLANABİLİR (eşleşme kanıt defterinden geliyor) ama yeni kimlik AÇAMAZ** — açığın tamamı "açma" tarafındaydı. Kanıtın bugünkü tek kaynağı imzalı Meta webhook'u (`phoneProven`, yalnız `meta-webhook.ts`'te `true`).
    **Ölçüldü:** kanıtsız numara sohbeti kimliksiz açıyor (taslak müşteri AÇILMIYOR), `user_profiles.phone`ta duran bir numara eşleşme saymıyor, kanıt defterindeki numara mevcut müşteriye bağlanıyor, emekliye ayrılan numara yeni sahibine açılıyor ve eski satır duruyor. Testler: `resolve-identity.test.ts` (15) · `customer-phone.test.ts` (8) · `conversation.test.ts` (yeniden yazıldı).
    **Yan kazanç — iki borç birden kapandı:** (a) `phone_taken` reddi kalktı (dayandığı indeks yok; aynı iletişim numarasını taşıyan iki müşteri artık meşru — aile telefonu, işyeri hattı), (b) B2B başvurusu numarayı sessizce DÜŞÜRMÜYOR (eski "çakışırsa atla" kuralı gerekçesini kaybetti), (c) web `updateProfileAction` artık `@lezzet/application`ın `updateCustomerProfile`ını çağırıyor — 21.14c'nin bıraktığı kopya kapandı.
    ~~`apps/web/lib/account/phone-key.test.ts`~~ SİLİNDİ: kısıt adını çiviliyordu, kısıt artık yok.
  - ✅ **EKRAN AYRIMI (25.08 · kullanıcı bulgusu ve kararı — "a").** Kullanıcı şemayı değil **ekranı** sorguladı: *"profildeki telefon numarası aynı zamanda adreslerdeki varsayılan telefon anlamına da geliyor, burada bir karmaşa var"*. Ölçüldü ve haklıydı — `addressDefaultsOf` (`address-form.tsx:130`) profilin numarasını yeni adres formuna ön-doldurma olarak veriyor; dört çağıran (checkout, hesap masaüstü/mobil web, mobilin kendi kopyası). **Yani kolon bir artık değil, işi olan bir alan.**
    Bu, "kolonu kaldıralım" seçeneğini (b) kapattı: varsayılan ya doğrulanmış numaralardan rastgele seçilirdi (müşteri böyle bir tercih belirtmedi) ya da `customer_phone`a bir "varsayılan" bayrağı eklenirdi — **yani kolonu tablonun içinde yeniden icat etmek**, ve bir KANIT satırına değişken bir tercih yüklemek. Düzelttiğimiz hatanın aynısı, bir katman aşağıda.
    **Karmaşa veride değil ETİKETTEYDİ:** alan üç dilde de "Telefon (WhatsApp)" diyordu ve tutamayacağı bir söz veriyordu — o kutuya yazılan numara WhatsApp kimliği kurmuyor. Ekran ayrıldı: `phone` → **"İletişim numarası"** + altında ne işe yaradığı (*"yeni adres eklerken önerilir"*); yanına yeni **WhatsApp** satırı → doğrulanmış numaralar, **salt okunur** ve rozetli, yoksa *"bize WhatsApp'tan yazdığınızda bağlanır"*. Salt okunur olması zorunlu: o değer bir kanıttır, elle yazılabilseydi kanıt olmaktan çıkardı. `AccountView.whatsappNumbers` (yalnız aktif satırlar).
  - ✅ **"WHATSAPP'IMI BAĞLA" YAZILDI (25.08 · kullanıcı bulgusu — metin yalan söylüyordu).** Ekran ayrımının ilk hâlinde WhatsApp satırı *"bize WhatsApp'tan yazdığınızda bağlanır"* diyordu ve kullanıcı bunu yakaladı: **yazmak yetmez.** Gelen mesaj numaranın zilyetliğini kanıtlar ama hangi HESAP olduğunu söylemez — web'den kaydolmuş müşteri kendiliğinden yazdığında elimizde hesabı gösteren hiçbir şey yoktur ve yeni bir taslak doğar. Cümle bir yeteneği değil, olmayan bir yeteneği anlatıyordu.
    **Yazılan akış** (`packages/application/src/customer/whatsapp-link.ts`): giriş yapmış müşteri düğmeye basar → jeton üretilir (`wa_link_token`, 0011) → `wa.me` bağlantısı ÖNCEDEN YAZILI mesajla açılır (`LA-WA-<12 hane>`) → müşteri gönderir → webhook iki şeyi birden görür: **kimden geldiği** (kanıt) ve **jeton** (hesap) → bağ kurulur, jeton düşer.
    **Biz hiç mesaj GÖNDERMİYORUZ** (kullanıcının ısrarla doğru olan noktası): akışı müşteri başlatır, yani ücretli `authentication` şablonu, Meta şablon onayı ve hız sınırı derdi yok — üstelik gelen mesaj 24 saatlik ücretsiz pencereyi de açar. Bir tur ücretli şablon önerilmişti; **geri çekildi.**
    **Jeton, 6 haneli güvenlik kodu DEĞİLDİR.** DOMAIN §10'un *"koddan kimliğe gidilmez"* kuralı o kısa ÇAPA kodu içindir ve gücünü numaraya bağlı olmaktan alır. Burada sorgunun yönü zorunlu olarak jetondan kimliğedir (mesaj gelene kadar kimin yazdığı bilinmez), o yüzden güvenlik ENTROPİDEN gelir: `readableCode(12)` ≈ 60 bit + 15 dk ömür + **tek kullanım**. Tahminle bulunan bir jeton, bulanın NUMARASINI başkasının hesabına yazdırırdı — hesap devralma.
    **En sık hâl bir kenar durum değildi ve ayrıca çözüldü:** müşteri çoğu zaman önce yazar (taslak + kanıt doğar), sonra siteden kaydolur, sonra "bağla"ya basar — o anda numara zaten TASLAĞA bağlıdır. Bağlama başarısız olsaydı akış tam işe yarayacağı yerde çalışmazdı. Taslak sahipse `merge_customers` ile hesaba **birleştiriliyor**; buradaki kanıt admin'inkinden güçlüdür (müşteri hem oturumunu hem hattını kanıtlamıştır). **Sahip GERÇEK bir kayıtsa birleştirme YOK** — iki gerçek kaydı otomatik birleştirmek geri alınamaz; DOMAIN §10'un kuralı geçerli: kalanı bir kapıya değil insana düşür.
    **Sıra zorunlu:** webhook jetonu kimlik çözümünden ÖNCE tüketir; sonra koşsaydı tanımadığı numara için taslak açar ve jeton o taslağa bakardı. Testler: `whatsapp-link.test.ts` **11/11** (ayrıştırma · tek kullanım · yeni jeton eskisini geçersizler · süre · taslak birleştirme · gerçek kayıt çakışması).
  - 🔧 **TAM PAKET BİR KUSUR YAKALADI — İKİ SAAT (25.08).** `customer-phone.test.ts`in *"`lastSeenAt` ilerler"* iddiası düştü: **1787685288518 → 1787685288508**, yani damga 10 ms GERİYE gitti. Sebep kararsızlık değil, iki ayrı saatti — satır doğarken damgalar kolon varsayılanından (DB saati) geliyordu, tazeleme uygulamadan `new Date()` ile yazılıyordu. Küçük görünüyor ama **sessizlik tetiği (~3 ay) tam olarak bu damgadan hesaplanacak**; geriye giden bir damga o hesabı bozar. Tazeleme `touch_customer_phone` RPC'sine taşındı (tek saat, emekli satıra dokunmaz) ve ikinci bir iddia kondu: emekli satır tazelenmez. Testin işi buydu — ölçüm o gün doğruydu, regresyonu ancak test yakalar.
  - ✅ **İKİNCİ DİLİM: ÇAPA KURULUYOR (25.08).** Numaranın kanıtlanması *"bu hat BUGÜN bu kişide"* der; çapa *"bu numaranın GEÇMİŞİ kimin"* sorusunu cevaplar. **OTP bu soruyu çözmez** — devredilmiş hattın yeni sahibi hattı da gelen kodu da meşru olarak alır; çözen tek şey şüphe doğmadan ÖNCE kurulmuş bir sırdır.
    **İki çapa, iki AYRI kitle, yedek DEĞİL:** e-posta (kod e-postaya gider, cevap WhatsApp'tan döner — kanıtın gücü çaprazlıktan) ve 6 haneli kod (e-posta istemeyenin tek çapası). E-posta kanıtlanınca kod silinir ve `user_profiles_single_anchor` kısıtı bunu **veride** zorluyor: ihlali sessiz olurdu.
    **Sorgunun yönü tasarımın tamamı** (`DOMAIN §10`: *"koddan kimliğe gidilmez, kimlikten koda gidilir"*). `answerEmailAnchor` ve `verifySecurityCode` imzaları `phone` alıyor, `code`+`customerId` değil — yön veriyle zorlanıyor. **"Kod doğrula" kutusu yok ve olmayacak;** o kutuyu besleyecek hiçbir kapı ihraç edilmedi.
    **Bekleyen adres SATIRDA duruyor** (`anchor_email`), mesajdan okunmuyor: adres cevabın içinden okunsaydı, kodu ele geçiren biri onu istediği adresle eşleştirebilirdi.
    **Gönderim para harcamıyor:** kod e-postayla (Resend) gidiyor, cevap WhatsApp'ın 24 saatlik ücretsiz penceresinden dönüyor — müşteri zaten yazmış durumda.
    **Yüzey OPERATÖRDE** (`/operations/social` sağ paneli): adres kutusu + "Kod gönder", altında "E-posta istemiyor — 6 haneli kod ver". Kod ekrana DÖNMÜYOR, doğrudan sohbete yazılıyor. `DOMAIN`in *"ilk sipariş tamamlanınca ajan önerir"* otomasyonu bunun YERİNE değil ÜSTÜNE gelecek — 15.16/15.19'un izlediği sıranın aynısı: önce insan eli, sonra otomasyon.
    **Mail şablonu kopyalanmadı, İKİ METİN kümesi oldu** (`OtpCodePurpose`): kabuk aynı, ama giriş maili *"tarayıcınızda açık sayfaya girin"* diyor ve çapa kodunda bu cümle düpedüz yanlış — müşteri açık bir sayfa aramaya başlardı.
    **Ölçüldü:** `anchor.test.ts` (motor) **16/16** · `customer/anchor.test.ts` (entegrasyon) **13/13**. Çivilenenler: başka numaradan gelen doğru kod hiçbir şey açmıyor · bekleyen soru yokken altı hane sessizce geçiliyor · adres başka hesaptaysa otomatik birleştirme yok · tavanda kilitleniyor, doğru cevap sayacı sıfırlıyor · e-posta kurulunca kod siliniyor · yedi haneli sayı kod sayılmıyor.
  - ✅ **ÜÇÜNCÜ DİLİM: KAPILAR VE TETİKLER BAĞLANDI (25.08).** Önceki dilimin açık maddesi buydu — motor yazılıydı ama çağıranı yoktu. Üçü birden bağlandı ve *"3 ay sessizlik sonrası dönüşte geçmiş kod sorulmadan açılmıyor"* kriteri artık karşılanıyor.
    **ÖLÇÜM BİR KUSUR GÖSTERDİ VE TASARIMI DEĞİŞTİRDİ: boşluk yalnız TEK BİR AN'da görülebiliyor.** `needsChallenge` sessizliği `customer_phone.last_seen_at`ten hesaplıyor; ama o damga, soruyu doğuran mesajın KENDİSİ tarafından tazeleniyor. Motoru olduğu gibi çağırsaydık tetik **hiçbir zaman ateşlemezdi** — bir satır sonra bakan kod, üç aylık boşluğu sıfır saniye olarak görürdü. Üstelik sonradan hesaplama da işe yaramazdı: dönen yabancının iki kez "merhaba" yazması boşluğu kapatır ve soruyu buharlaştırırdı. Karar bu yüzden **kanıt tazelenmeden hemen önce** veriliyor (`recordProof` artık tazelemeden ÖNCEKİ satırı da döndürüyor: `previous`) ve sonucu **saklanıyor** (`user_profiles.challenge_reason` + `challenge_raised_at`, 0011). Soru bir AN değil, cevaplanana kadar süren bir HÂL.
    **Kapı ARAÇTA, prompt'ta değil** (`ticket/ai.ts` → `runOpts`): kimlik kapısı kapalıysa ajana `customerSupportTools` **hiç verilmiyor** — modele "söyleme" demek bir ricadır, aracı vermemek bir kısıttır. Prompt'a eklenen `identity` bloğu yalnız SORUYU taşıyor, kapıyı değil; model o satırı yok saysa bile geçmişi okuyamıyor.
    **Soru yalnız SOHBET yolunda soruluyor, talep (e-posta) yolunda değil:** çapanın cevabı müşterinin kendi numarasından gelmek zorunda (`verifySecurityCode(db, phone, text)`), yani e-posta talebinde sormak cevaplanamayacak bir soru sormaktır. Kapı orada da kapalı — ama soru burada.
    **E-posta çapalı müşteride soruyu sormak, KODU GÖNDERMEKTİR** (DOMAIN §10, 02.08: *"kod yine e-postasına gider, WhatsApp'tan geri yazılır"*). Ajanın *"kutunuza gönderdiğimiz kodu yazın"* demesi ancak kod gerçekten gönderilmişse doğru; göndermeyip sormak müşteriyi olmayan bir maili aramaya yollardı. Gövde `startEmailAnchor` ile ORTAK (`sendAnchorCode`) — iki kopya olsaydı biri gün gelip dönüşteki kodu başka bir kanaldan yollardı.
    **Erken tetiğin yakıtı geldi:** webhook artık `statuses` olaylarını okuyor — `failed` numaranın kimlik künyesine damga basıyor (`customer_phone.delivery_failed_at`), başarılı teslim onu SİLİYOR (sonraki teslim öncekini çürütür). Belirsiz durumlar (`sent`, okunmayan `delivered`) bilerek yazılmıyor. Defter yarısı (mesaj durumu kolonu) hâlâ 15.11'in işi; bu okuma yalnız kimlik künyesine dokunuyor.
    **Puan kapısı iki gövdeye de kondu** (web `lib/feedback/points.ts` · `application/customer/points.ts`): çevirmenin iki kopyası var ve kural tek yerde dursaydı yarısı kapalı bir kapı olurdu. **Bekleyen SORU orada okunmuyor, yalnız çapanın varlığı:** oturum açmış müşteri kimliğini o an kanıtlamıştır (posta kutusuna gelen kodla girdi); onu WhatsApp'ta bekleyen bir soru yüzünden reddetmek, güçlü kanıtı zayıfına yenik düşürmek olurdu.
    **Ölçüldü:** `customer/anchor.test.ts` **+8 iddia** — sessizlik sorusu açıyor ve kapıyı kapatıyor · `failed` sessizliği beklemiyor ve damga soruya dönüşünce siliniyor · başarılı teslim damgayı çürütüyor · çapasız müşteriye soru sorulmuyor ama kapı da hiç açılmıyor · bekleyen soru yenilenmiyor (yoksa müşterinin elindeki kod her mesajda ölürdü) · e-posta yolunda soru açılınca kod yola çıkıyor · doğru cevap kapıyı açıyor · `recordProof` tazelemeden önceki satırı döndürüyor.
    Sessizlik eşiği parametrik: `IDENTITY_SILENCE_DAYS` (varsayılan 90) — doğru değer yerel veriden çıkarılamaz.
  - ✅ **DÖRDÜNCÜ DİLİM: ÇAPA KENDİLİĞİNDEN VERİLİYOR, NUMARA DEVREDİLEBİLİYOR (26.08 · kullanıcı senaryosu ve kararı).** Kullanıcı iki şeyi birden düzeltti.
    **(1) Emeklilik için önerdiğim ZAMAN AŞIMI geri çekildi.** Kullanıcının kurgusu daha iyiydi ve `DOMAIN §10`'un kendi ilkesine de uyuyordu (*"her ek kapı, bedeli kendi müşterilerimize ödetir"*): bağı koparan şey sessizlik değil, **olumlu bir olay** olmalı — biri çıkıp *"bu hat bende"* diyor ve kanıtlıyor. Kanıt iki katlı: hesabını açmış (posta kutusu) + hattı ŞU AN elinde tutuyor (jetonu o numaradan gönderdi). `consumeWhatsappLink`in `conflict` dalı `transferred` oldu: eski satır emekliye ayrılıyor (`retired_at` **yazıcısına kavuştu**), numara yeni kayda yazılıyor. **Birleşme YOK** — eski kaydın siparişi, puanı, geçmişi yerinde; taşınan yalnız kanal. Bedeli biliniyor ve kabul edildi: aile telefonunda hattı sonradan bağlayan kişi kanalı devralır (geri alınabilir, veri kaybolmaz).
    **(2) Kod artık düğmeye basılmasını beklemiyor.** Mekanizma vardı ama ANI yoktu: operatörün aklına gelmezse müşteri çapasız kalıyor ve altı ay sonra döndüğünde sorulacak bir şey olmuyordu — kapı sonsuza kadar kapalı. `offerAnchorIfDue` gelen mesajda koşulu ölçüyor (çapasız + siparişi var) ve kodu sohbete yazıyor.
    **Eşik "sipariş VERİLDİ", "teslim edildi" DEĞİL — ve bu, DOMAIN'in yazdığından bilinçli bir sapma** (metin güncellendi): `completed` teslimden sonra damgalanıyor ve müşteri o günden sonra bize bir daha yazmayabilir; oysa kaybedecek şey siparişin verildiği an doğuyor ve konuşma tam o sırada canlı. Taslak ve iptal sayılmıyor.
    **Gönderim ANI da bir karar: GELEN mesaj.** Serbest metin ancak 24 saatlik pencere açıkken ücretsiz gider ve sipariş anında o pencere kapalı olabilir. Gelen mesaj pencereyi tanımı gereği açar — zamanlayıcı, kuyruk ve "sonra tekrar dene" defteri gerekmiyor; koşul her mesajda yeniden ölçülüyor.
    **En kritik kural: otomatik verilen kod GÖNDERİLEMEZSE geri alınıyor.** Operatör yolunda düşen gönderim sorun değil (kod insana döner, o iletir); otomatik yolda iletecek kimse yok. Satırda kalsaydı ortaya **müşterinin bilmediği bir sır** çıkardı ve dönüşünde ona cevaplayamayacağı bir soru sorulurdu — çapasızlıktan BETER, çünkü çapasıza hiç soru sorulmuyor. Ölçülmüş hâl, varsayım değil: `META_ACCESS_TOKEN` yokken sürücü her gönderimi reddediyor (15.11 Meta tarafında beklemede), yani bugün canlıya alınsa BÜTÜN otomatik kodlar bu hâle düşerdi. Geri alma kendini de onarıyor: kod silindiği için bir sonraki mesajda yeniden deneniyor. Değişken `.env.example`a yazıldı (yoktu).
    **Cevapsız kalan şüphe artık GÖRÜNÜR** (`PendingChallenge`, sohbet panelinde): soru kaç gündür bekliyor ve o günden bugüne kaç sipariş geldi. Sipariş sayısı aciliyettir — sıfırsa muhtemelen kimse dönmedi, artıyorsa birinin siparişleri başkasının kaydına yazılıyordur. Karar insanın (04.7).
    **Kodun cümlesi tek gövdede** (`issueAndSendSecurityCode`): operatör düğmesi de otomatik kapı da onu çağırıyor; iki kopya olsaydı biri gün gelip ötekinden ayrılırdı.
    **Ölçüldü:** `customer/anchor.test.ts` **29/29** (+7), `whatsapp-link.test.ts` devir testine dönüştü, `meta-webhook.test.ts` **16/16** (+1: `failed` statüsü künyeye yazılıyor, başarılı teslim çürütüyor). Çivilenenler: selam veren yabancıya kod yok · siparişten sonraki mesajda var · ikinci kez verilmiyor (müşterinin sakladığı kod yaşıyor) · taslak sipariş sayılmıyor · çapası olana verilmiyor · gönderim düşünce geri alınıyor ve sonraki mesajda yeniden gidiyor · devirde eski kayıt AYAKTA ve emekli satır duruyor.
  - **AÇIK KALAN (görev `[~]`) — otomatik yol çapanın YALNIZ FALLBACK'ini kuruyor.** `DOMAIN §10` ilk siparişte **önce e-posta bağlamayı önermeyi**, istemeyene 6 haneyi vermeyi söylüyor; bugün otomatik giden yalnız 6 hane. Sebep mekanik: e-posta önerisi bir SOHBET ÇEVRİMİ ister (sor → cevabı bekle → gelen metni adres olarak oku) ve o çevrimin motoru 15.8'de. Operatörün e-posta kapısı duruyor, yani yol kapalı değil — otomatik değil. Ayrıca **e-posta çapası kodu SİLDİĞİ için** sonradan yükseltme kayıpsız: kodu olan müşteri bir gün adresini bağladığında kod düşüyor (DB kısıtı zorluyor).
    **İkinci, küçük madde:** puan kapısı İKİ gövdeye birden yazılmak zorunda kaldı çünkü çevirmenin iki kopyası var (`BEKLEYEN(04.10)`, ayrıntı ve yön 17.5'in durum notunda).
  - **En sık görülecek hâli kötü niyet değil KAZA:** eşinin/işyerinin numarasını yazan müşteri, tuşlama hatası, aile içinde paylaşılan telefon, çalışandan devralınan hat. Hepsi aynı yere çıkar — yanlış hesapta görünen sipariş.
  - **Hat devri, çözülmesi gereken asıl vakaydı:** numara terk edilir, operatör yeniden dağıtır, yeni sahibi WhatsApp'tan yazar. **OTP bunu çözmez** — yeni sahip kodu meşru olarak alır; zilyetlik gerçektir, bayat olan bağdır. Çözen şey, şüphe doğmadan ÖNCE kurulmuş bir sırdır (e-posta ya da güvenlik kodu). Terk edilmişliğin kendisi ölçülemez: yalnız **boşluk** hesaplanabilir ve o da teşhis değildir — yılda bir sipariş veren sadık müşteri ile devredilmiş hat aynı şekli üretir.
  - **Para riski ve tavanın rolü:** puan → kupon → euro (1 puan = 1 cent, `redeem_points`). Tavan (numara sayısı) **birincil önlem değildir** — puan çoğunlukla sipariş vermekten doğduğu için çiftlik kârsızdır, getiren puanının döngüsünü de birleştirme kuralı kırar (04.7 mayınları). Tavan derinlemesine savunmadır; bu yüzden cömert tutulur.
  - **AÇIK — karara bağlanmadı:** bir hesabın **kaç numara** taşıyacağı. Meşru çok-numara halleri var (kişisel + işyeri; FR + TR hattı, diasporada yaygın) ama kullanıcı tereddütlü ve yaşayan sistemde görmek istiyor. Kayıt yapısı iki seçeneği de taşır, karar ertelenebilir. Kesin olan tek yön: **bir numara en çok bir hesaba çıkar** (yoksa gelen mesaj tek müşteriye çözülemez).
  - **Parametrik (`Setting`):** güvenlik kodu 6 hane / sistem üretir · deneme tavanı 5 · sessizlik tetiği 3 ay · e-posta doğrulanınca kod silinir · kod hash'lenerek saklanır.
  - **İki ekleme (02.08 · kullanıcı kararı — kural metni `DOMAIN §10`):**
    **(a) Teslim durumu erken tetiktir.** Taşıyıcının döndüğü `failed` (numara kapanmış / engellenmiş) bir tahmin değil beyandır; 3 aylık sessizliği beklemeye gerek yok. `delivered` ama okunmadı hâlâ belirsiz — `failed` erken tetik, sessizlik geç tetik, ikisi birbirinin yerine geçmez. Uygulaması 15.7 webhook'unun statü olaylarını numara kaydına yazmasını gerektiriyor.
    **(b) Dönüşte çapa ezberden değil kanaldan sorulur.** Bağlı e-postası olan müşteriden 6 haneyi hatırlaması beklenmez: kod yine e-postasına gider, WhatsApp'tan geri yazılır — bağlama anındaki çapraz kanal kanıtının dönüş anındaki tekrarı. Aylar sonra kimse kodu saklamış olmaz ama posta kutusu elindedir; güvenlik özelliği aynen korunur (devredilmiş hattın yeni sahibi o kutuyu okuyamaz). **6 hane bir yedek DEĞİL:** e-posta bağlanınca kod siliniyor, yani ikisi aynı müşteride hiç bir arada bulunmuyor. Kod, e-postasını hiç bağlamamış müşterinin dönüşünde sorulacak TEK çapadır — iki ayrı kitle, iki ayrı yol.
  - **Sorulmadan verilen karar (türetme):** puanı harcamak bir çapa ister — **e-posta ya da güvenlik kodu**, ikisi de sayılır. Gerekçe: devredilmiş hattın yeni sahibi ikisini de bilemez, koruma aynıdır. Başka türlü okunuyorsa düzeltilsin.

- [x] (04.13) **DEV AUTH BYPASS SÖKÜLDÜ — guard yerelde de doğruyu söylüyor** (kullanıcı kararı 19.08).
  `touches: apps/web/lib/guard.ts, apps/web/app/(operations)/operations/layout.tsx,
  apps/web/lib/auth/dev-login-gate.ts, apps/web/app/auth/dev-login/route.ts,
  packages/types/src/entities/user-profile.schema.ts,
  scripts/seed/{people,observability,feedback,courier,support}.ts,
  playwright.config.ts, e2e/setup/**, e2e/README.md, knip.json`
  - *Bitti:* oturumsuz `/operations` yerelde de girişe atıyor; müşteri oturumu "bu alan personel içindir" ekranını görüyor; operasyon e2e'si gerçek oturumla koşuyor

  **BULGU (kullanıcı, 19.08):** *"giriş sayfasındaki müşteri butonuna bastığım zaman müşteri olarak
  giriş yapınca hata sayfasına giriyorum."* İki ayrı arıza çıktı, ikisi de aynı kökten.

  **ÖLÇÜLDÜ — guard yerelde yalan söylüyordu:** oturum HİÇ olmadan `localhost:3000/operations` →
  **200**; aynı istek production sunucusunda (3001) → **307 → /tr/giris**. Yani iki sunucu iki
  farklı yetki gerçekliği gösteriyordu. Sebep `DEV_AUTH_BYPASS`: `NODE_ENV !== 'production'` iken
  personel guard'larını kısa devre yapıp sahte bir admin döndürüyordu ve yerelde **varsayılan
  açıktı**. Bedeli:
  · Müşteri oturumuyla operasyona girilebiliyordu — layout'un dürüst cevabı (`NotStaffScreen`)
    yerelde HİÇ görülemiyordu, yani denenmemiş koddu.
  · Sahte kimliğin profili okunamadığı için layout rolleri `['admin']`'e düşürüyordu; yetki hatası
    ekranda yetki GİBİ görünüyordu.
  · `e2e/README` rol yönlendirmesi senaryosunu bu yüzden kapsam dışı bırakmıştı.
  · Kendi ürettiği iki arıza (04.11 · 07.08 boş kurye ekranları) yine bypass'a eklenen makineyle
    yamanmıştı — `DEV_AUTH_BYPASS_USER_ID` ve layout'un rol düşüşü.

  **MOBİL AYNI BYPASS'I BİLEREK REDDETMİŞTİ** ve gerekçesini ölçmüştü (`apps/mobile/src/lib/auth/
  dev-login.ts`, 11.08: müşteri jetonuyla `/courier/day` → 403, kurye jetonuyla → 200) —
  *"bypass'ı mobile taşımak, dev'de yakalanabilen yetki hatalarını görünmez kılardı."* Yani kural
  zaten yazılıydı, web onu uygulamamıştı.

  **YERİNE 04.12'nin KAPISI GEÇTİ.** `/auth/dev-login` mail turunu atlar ama oturumu GERÇEK kurar
  ve guard'a hiç dokunmaz. Bypass'ın karşıladığı ihtiyaç 15.08'den beri zaten bu kapıyla
  karşılanıyordu; ikisini birden tutmak yalnız guard'ı yalancı kılıyordu.

  **İKİNCİ ARIZA — "Müşteri" düğmesi baştan beri operasyona giriyordu.** Düğme kullanıcının kendi
  adresine (`yamansehzade@gmail.com`) basıyordu ve o adres bir müşteri değil: `auth.users`ın en
  eski satırı olduğu için `0002`nin *"hiç admin yoksa ilk hesap admin olur"* açılışı onu **admin**
  yapmıştı. 21.32 aynı arızayı personel düğmelerinde ölçüp çözmüştü (adresi seed'e taşımak); bu, o
  kuralın uygulanmadığı son düğmeydi. Seed artık `claire.weber@example.fr`e giriş hesabı açıyor.
  **OTP akışı kapanmadı:** öteki sekiz müşteri auth'suz kalıyor ve `0002` admin varken `{customer}`
  doğuruyor — o yol her yeni e-postayla açık.

  **SÖKÜLENLER:** `DEV_BYPASS_AUTH_ID` · `DEV_ADMIN_PROFILE_ID` (`@lezzet/types`) · seed'in
  `dev-admin@lezzet.local` profili · layout'un `['admin']` düşüşü · `.env.local`daki
  `DEV_AUTH_BYPASS`. Hata kaydının `resolved_by` aktörü artık sabit değil, seed'in gerçek
  yöneticisinden okunuyor.

  **E2E GERÇEK OTURUMA BAĞLANDI.** Dört operasyon dumanı 04.08'den beri girişsiz koşuyordu.
  `ops-setup` projesi `/auth/dev-login`den oturumu alıp saklıyor (`e2e/setup/operations-auth.setup.ts`
  → `storageState`), `operations` projesi onu yüklüyor. `desktop`/`mobile-web` operasyonu koşmaz ve
  oturum taşımaz: müşteri yüzeyi ziyaretçi olarak sınanır (fiyat görüntüsü ve sepet oturuma göre
  değişiyor).

  **ÖLÇÜLDÜ (19.08, dev sunucusunda):**
  · oturumsuz `/operations` → **307 → /tr/giris** (önce 200'dü)
  · "Müşteri" düğmesi → **`/`** (önce `/operations`); Yönetim/Kurye → `/operations`
  · müşteri oturumuyla `/operations` → başlık *"Bu alan personel içindir"*, gezinme bağlantısı **0**
  · operasyon e2e **9/9 yeşil** (25,9 sn) · `typecheck` 18/18 · `lint`/`knip`/`boundaries` temiz

  **ARTÇI — SÖKÜM SEED'İ KIRMIŞTI, `db:refresh`te ortaya çıktı (20.08).** `dev-admin` profili
  kaldırıldı ama onu ARAYAN dört yer kaldı: `seed/{feedback×2,courier,support}.ts`, hepsi
  `kisiler.get('devAdmin') ?? null` deseniyle. Üçü sessizce boşa düştü (admin künyeli satırlar hiç
  yazılmadı); dördüncüsü seed'i KESTİ: metinli yorum `moderator` yokken `pending` kaldı, ama
  yaşlandırma adımı damgayı ayrı bir koşuldan (`status !== 'pending'`) okuyup yine de yazdı →
  `feedback_moderation_stamp` reddetti (`23514`), seed DEĞERLENDİRME adımında durdu. **Arıza sökümde
  görünmemişti çünkü o gün `db:refresh` koşulmadı** — kalıntı ancak veritabanı sıfırdan kurulunca
  konuşur. Düzeltme iki parçalı: dört çağrı gerçek seed yöneticisine (`yonetici`) bağlandı **ve**
  damga artık moderasyonun GERÇEKTEN koştuğu tek koşula bağlı (`modereEdildi`) — `?? null` deseni
  yerinde duruyor, ama artık boşa düşse bile tutarsız satır üretemez. Ölçüm: `db:refresh` yeşil,
  kapsam **129 kovanın hepsinde** örnek var.

## Netleşecekler

- **Rolün saklandığı yer:** Auth `app_metadata` mı, kendi tablomuz mu — 02'de netleşen veri erişim modeliyle (RLS kapsamı) birlikte karara bağlanır; artı/eksi masaya konur, sonra kodlanır.
- ~~**Tek rol mü, çok rol mü**~~ — 27.07'de karara bağlandı (kullanıcı): **iki eksen, tek alan.** Müşteri ↔ personel keskin ayrım (bir arada olamaz); personel içinde çoklu rol olağan (depo + muhasebe, patron + admin). `user_profiles.roles` dizisi + DB check kısıtı; saf kural `domain-core/identity/roles`. `accounting` rolü eklendi. Ayrıntı `DOMAIN §2`.
- **Google OAuth konsol kurulumu:** Google Cloud tarafındaki uygulama kaydı ve anahtarlar kullanıcıyla birlikte yapılır (dış hesap işlemi).

---

**Modül durumu (27.08.2026):** 13 görevin 11'i tamam, `04.7` kısmi, `04.10` kısmi. Kimlik zinciri uçtan uca çalışıyor: giriş → profil → rol → depo kapsamı.
- **Var:** e-posta OTP girişi (tek `/connexion`) — kod bizde üretilir, mail Resend'den çıkar, Supabase mail zincirinde YOK (`04.2`) · **Google OAuth AÇIK** ve iki ekranda kullanımda (giriş + misafir checkout) · `lib/guard.ts` altı guard'la ve `StaffUser.profileId` sözleşmesiyle (`04.11`) · rol yazımı `UserProfileService.setRoles` + `pnpm set-role` + `operations/settings` ekranı · `user_profiles` trigger'ı (0001–0003) · müşterinin ticari alanları, `address` tablosu, bul-veya-oluştur kapısı, misafir doğrulaması (0013) · **telefon anahtarı `customer_phone`da**, güvenlik kodu ve çapa akışı (`04.10`) · dev bypass SÖKÜLDÜ, yerinde gerçek oturum açan hızlı giriş var (`04.12`/`04.13`).
- **Kısmi:** `04.7` — birleştirme RPC'si (`0040`) yazılı ve çağrılıyor, ama yönetici ekranı `09.10`'da ve getiren puanının geri alınması (mayın 2) uygulanmadı. `04.10` — çapanın otomatik yolu yalnız güvenlik kodunu kuruyor; e-posta önerisi `15.8`in sohbet çevrimini bekliyor (çevrim kodda henüz yok, ölçüldü 27.08).
- **Yok:** üretimde çağrılmayan tek guard `requireAccounting` (karar bekliyor, `04.3`).
- **Açılan yol:** `Order.customer_id` artık bağlanabilir → modül 07 önkoşulu karşılandı.

~~**Modül durumu (27.07.2026):** personel tarafı ayakta, müşteri kimliği kuruldu.~~ — bir ay bayat kaldı ve **dört iddiası birden yanlıştı** (denetim 27.08): guard setini "kısmi" sayıyordu (oysa `requireAdmin` 51 dosyada), birleştirme RPC'sini "yok" diyordu (vardı), Google OAuth'u "açılmadı" diyordu (açıktı), `StaffRoleService`i "var" diyordu (hiç olmadı). Modül 03'te aynı kusur aynı hafta bulundu: **altbilgi, altındaki satırlardan daha çok okunur ve kimse onu tazelemez.**
