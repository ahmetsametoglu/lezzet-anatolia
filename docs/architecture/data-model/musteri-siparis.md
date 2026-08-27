# Veri Modeli — Müşteri ve Sipariş

Müşteri, adres, teslimat bölgesi, sipariş ve kalemleri, sepet, kurye gün kapanışı.

> Bu dosya `../DATA_MODEL.md`'nin parçasıdır. Ortak ilkeler (çok dilli alanlar, türetme ilkesi, enum listesi, kalıcı kararlar) ana dosyadadır; **karar oraya, alan buraya** yazılır.

---

## Customer (müşteri)

> **Tablo adı `user_profiles`.** Müşteri ayrı bir varlık değil, kimliğin bir **ROLÜDÜR**: müşteri ve
> personel tek tabloda yaşar, `roles` ayırır (bkz. `0001`). Aşağıdaki alanların kimlik kısmı `0001`'de,
> ticari kısmı `0013`'te eklenmiştir. `customer_id` diye geçen her FK (`address`, `price`, `order`)
> bu tabloyu işaret eder — "müşteri rolüyle davranan profil" demektir.
>
> 1:1 uzantı tablosu (`customer_profile`) bilinçli olarak açılmadı: alanlar küçük skaler, satır dar,
> güvenlik sınırı bizde tabloda değil (okuma sunucudan `service_role` + guard'dan geçer). Bölmek her
> sepet/checkout okumasına join, kimlik kurulumuna ikinci satır, birleştirmeye ikinci taşıma eklerdi.

<!-- alanlar:user_profiles -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `roles` | user_role[] |  | `'{customer}'` |
| `type` | customer_type |  | `'individual'` |
| `name` | text |  | `''` |
| `email` | text | • |  |
| `phone` | text | • |  |
| `preferred_language` | preferred_language |  | `'fr'` |
| `country` | country_code |  | `'FR'` |
| `warehouse_ids` | uuid[] |  | `'{}'` |
| `auth_user_id` | uuid | • |  |
| `b2b_approved` | boolean | • |  |
| `is_draft` | boolean |  | `false` |
| `created_at` | timestamptz |  | `now()` |
| `company_info` | jsonb | • |  |
| `vat_number` | text | • |  |
| `vat_number_valid` | boolean | • |  |
| `vat_number_checked_at` | timestamptz | • |  |
| `b2b_applied_at` | timestamptz | • |  |
| `b2b_rejected_at` | timestamptz | • |  |
| `b2b_rejected_by` | uuid | • |  |
| `b2b_reject_reason` | text | • |  |
| `b2b_reject_reason_translations` | jsonb | • |  |
| `b2b_reject_reason_translated_at` | timestamptz | • |  |
| `credit_enabled` | boolean |  | `false` |
| `credit_limit` | numeric(10, 2) | • |  |
| `payment_term_days` | int | • |  |
| `discount_percent` | numeric(5, 2) | • |  |
| `price_group_id` | uuid | • |  |
| `cod_allowed` | boolean |  | `true` |
| `marketing_consent` | jsonb |  | `'{}'::jsonb` |
| `notification_consent` | jsonb |  | `'{}'::jsonb` |
| `notification_token` | text | • |  |
| `acquisition_source` | jsonb | • |  |
| `referred_by` | uuid | • |  |
| `anonymized_at` | timestamptz | • |  |
| `referral_code` | text | • |  |
| `wa_link_token` | text | • |  |
| `wa_link_expires_at` | timestamptz | • |  |
| `email_anchored_at` | timestamptz | • |  |
| `anchor_email` | text | • |  |
| `anchor_email_at` | timestamptz | • |  |
| `security_code_hash` | text | • |  |
| `security_code_attempts` | integer |  | `0` |
| `challenge_reason` | text | • |  |
| `challenge_raised_at` | timestamptz | • |  |
| `b2b_pending` | boolean |  | *üretilmiş* |
| `merged_into_id` | uuid | • |  |
| `merged_at` | timestamptz | • |  |
| `merged_by` | uuid | • |  |
<!-- /alanlar -->

**Kararlar**

- **`type`** — kanal bunu belirler
- **`company_info`** — şirket bilgisi — doluysa B2B. Alanlar (`CompanyInfoSchema`): `legalName` · `siret` · `activityCode` (APE/NAF) · `foundedYear` · `isActive`. Self-servis başvuruda (08.7) SIRET yolunda resmî kayıttan dolar, AB yolunda elle girilir. jsonb olduğu için yeni alan migration istemez
- **`vat_number`** — AB vergi no (Alman USt-IdNr); reverse charge için
- **`vat_number_valid`** — VIES doğrulaması (açık API). Üç değerli: `true` geçerli · `false` geçersiz · `null` **sorulmadı**. Reverse charge YALNIZ `true`da açılır
- **`vat_number_checked_at`** — yukarıdaki sonucun ALINDIĞI an; `null` = hiç kesin cevap alınmamış. Damga yalnız KESİN cevapta yazılır — VIES "meşgulüm" dediğinde ne bayrak ne damga değişir, çünkü bilgi yokluğu bilgiyi silmez. Var olma sebebi: bayrak %0 KDV açıyor, yani yaşını söylemeyen bir `true` vergi hatasıdır (27.08). Onay kartı hem tazeliyor hem yaşı gösteriyor ("Geçerli · 12 gün önce"); eşik `domain-core` → `VAT_CHECK_FRESH_DAYS`
- **`email`** — web kimliği
- **`phone`** — **İLETİŞİM numarası** — kimlik anahtarı DEĞİL (04.10, 0049) ve benzersiz de değil. Formdan gelir (hesap kartı, misafir checkout), doğrulanmamıştır, kimlik çözümünde HİÇ okunmaz. Normalize (E.164). Bir tur bu kolon ikisini birden yapıyordu ve açık oradaydı — gerekçesi `CustomerPhone` bölümünde
- **`credit_enabled`** — vadeli (hesaba) sipariş yetkisi — **varsayılan false**, admin elle açar (bkz. `DOMAIN.md §7`)
- **`credit_limit`** — vade limiti (€) — vade açılırken admin girer; açık bakiye **türetilir** (ödenmemiş `on_account` siparişler), saklanmaz
- **`payment_term_days`** — vade süresi (gün) — boşsa `Setting` varsayılanı (30); gecikme bundan türetilir
- **`discount_percent`** — müşteriye genel özel indirim oranı; kanal fiyatına uygulanır (bkz. `DOMAIN.md §5`)
- **`price_group_id`** — fiyat grubu üyeliği (B2B alt kademesi — `katalog.md › PriceGroup`, 20.08); `restrict` FK, `null` = düz liste
- **`cod_allowed`** — kapıda ödeme izni (varsayılan true); kötüye kullanımda kapatılır (bkz. `DOMAIN.md §7`)
- **`roles`** — **dizi**: personel içinde çoklu rol olağandır (depo + muhasebe). `customer` yalnız BAŞINA durabilir — müşteri ↔ personel keskin ayrım, DB kısıtıyla zorlanır (`DOMAIN.md §2`)
- **`auth_user_id`** — Supabase Auth kullanıcısı; doğrulanınca bağlanır (bkz. `DOMAIN.md §10`). **Üçüncü kimlik anahtarıdır** — `0002` trigger'ı girişte profili e-postayla bulup bağlar
- **`marketing_consent`** — kanal bazlı pazarlama izni: `{email: {granted, at, source}, whatsapp: {...}}` — GDPR kanıtı (ne zaman, nereden). **OPT-IN:** anahtar yoksa izin yoktur. Kampanya gönderimi henüz yok; alan bugün tercih sayfasının ve operasyon süzgecinin kaynağı (bkz. `DOMAIN.md §11`)
- **`notification_consent`** — bildirim **TÜRÜ** bazlı ret: `{feedbackInvite: {granted, at, source}}`. `marketing_consent`ten AYRI çünkü orası KANAL sözlüğüdür ve `MarketingChannelEnum` onun anahtarlarından türer — tür oraya konsaydı operasyon süzgecinde bir kanal olarak belirirdi. **OPT-OUT:** anahtar yoksa gönderilir (kampanya açık rıza ister, teslim edilmiş siparişin değerlendirme daveti mevcut müşteri ilişkisine dayanır — gereken şey rıza değil kolay reddedilebilirlik). Değerlendirme daveti işi bunu **okuyor** (22.08)
- **`notification_token`** — (unique) bildirim tercihleri sayfasının **oturumsuz** anahtarı — her mailin altbilgisindeki bağ bunu taşır (`?t=`). İstek üzerine doğar (`referral_code` deseni), süresi yok (jeton yıllar önceki bir mailde durabilir), yetkisi dar (yalnız tercihler; ad/adres/sipariş görünmez). `referral_code` ile karıştırılmaz: o paylaşılmak için var, bu paylaşılmamak için. `anonymize_customer` düşürür
- **`wa_link_token`** · **`wa_link_expires_at`** — **WhatsApp bağlama jetonu** (04.10) — "WhatsApp'ımı bağla" düğmesinin ürettiği, önceden yazılı mesajın içindeki dize. `null` = bekleyen bağlama yok. **Neden gerekiyor:** gelen mesaj numaranın zilyetliğini kanıtlar ama hangi HESAP olduğunu söylemez; web'den kaydolmuş müşteri kendiliğinden yazdığında yeni bir taslak doğardı. **`referral_code` ile karıştırılmaz:** o paylaşılmak için var ve ömürsüz, bu paylaşılmamak için var ve 15 dakikalık. **`notification_token` ile de karıştırılmaz:** onun süresi bilerek YOK (yıllar önceki bir mailin altbilgisinde yaşar, yalnız tercihleri açar); bu bir KİMLİK anahtarı yazdırıyor. Tekil kısmi indeks ZORUNLU — webhook satırı jetonla buluyor. Çift kısıtı: jeton ile süresi birlikte var ya da birlikte yok
- **`email_anchored_at`** · **`anchor_email`** · **`anchor_email_at`** — **Kimlik ÇAPASI — e-posta** (04.10 · `DOMAIN.md §10`). Numaranın kanıtlanması *"bu hat BUGÜN bu kişide"* der; çapa *"bu numaranın GEÇMİŞİ kimin"* sorusunu cevaplar — devredilmiş hattın yeni sahibi hattı da gelen kodu da meşru olarak alır, çözen tek şey şüphe doğmadan ÖNCE kurulmuş bir sırdır. `email_anchored_at` = çapraz kanal kanıtı (kod E-POSTAYA gitti, cevap WHATSAPP'TAN döndü). **`email is not null` bunun YERİNE GEÇMEZ:** o kolon elle işlenen DM'de operatörün klavyesinden de dolabiliyor — "adresi var" ile "adresi kanıtlandı" iki ayrı gerçek, telefonda yaptığımız ayrımın aynısı. Üçüncü kanıt yolu (`auth_user_id`) damga istemez. `anchor_email` = doğrulanmayı BEKLEYEN adres; **satırda durması güvenliğin kendisi** — doğrulama numaradan kimliğe, kimlikten bekleyen adrese gider; adres cevabın içinden okunsaydı kodu ele geçiren onu istediği adresle eşleştirebilirdi. Çift kısıtı: adres ile damgası birlikte var ya da birlikte yok
- **`security_code_hash`** · **`security_code_attempts`** — **Kimlik ÇAPASI — 6 haneli kod** (04.10): e-posta bağlamak İSTEMEYENİN tek çapası. Sistem üretir (seçilen kodlar `1234`/`0000`/doğum yılında yığılır), **özetlenerek** saklanır — canlı DB'ye yazma yetkisi olana karşı değil (o zaten cevabı değiştirir), **yedek sızarsa** ortaya (numara, kod) listesi çıkmasın diye. Tavan 5 deneme → tahmin şansı ~200.000'de 1; doğru cevap sayacı sıfırlar. **Yalnız KENDİ numarasından geçerli** ve bu, kodun tek başına değerini sıfırlar: onu okuyan biri (ör. admin ekranında) kullanmak için o hattı da tutmak zorunda — aynı özellik oltalamayı da defeder. `user_profiles_single_anchor` kısıtı iki çapanın bir arada bulunmasını engelliyor: e-posta kanıtlanınca kod silinir. **İki çapa YEDEK DEĞİL, iki AYRI kitledir**
- **`challenge_reason`** · **`challenge_raised_at`** — **Bekleyen kimlik SORUSU** (04.10, 25.08 · `DOMAIN.md §10`). Tetik bir AN'dır (uzun sessizlik · taşıyıcının `failed` beyanı), soru ise cevaplanana kadar SÜREN bir hâl; kolonlar o hâli tutar. **Neden türetilemiyor:** sessizliğin ölçütü `customer_phone.last_seen_at` ama o damga, soruyu doğuran mesajın KENDİSİ tarafından tazeleniyor — bir satır sonra bakan kod üç aylık boşluğu sıfır saniye görür. Karar, boşluğun hâlâ görülebildiği tek anda (kanıt tazelenmeden hemen önce) verilip buraya yazılıyor; saklanmasaydı dönen yabancının iki kez "merhaba" yazması soruyu buharlaştırırdı. **Numarada değil PROFİLDE:** kapının koruduğu şey KİMLİKTİR ve cevabı da kimliğin çapasıdır. Değer kümesi veride kilitli (`silence`/`delivery_failed`), motorun `ChallengeReason`'ı ile aynı. Doğru cevap gelince (`answerEmailAnchor` · `verifySecurityCode`) temizlenir — ayrı bir "kapat" adımı yok
- **`acquisition_source`** — edinim kaynağı — **ilk siparişte bir kez** yazılır (UTM snapshot + order_source), sonra değişmez; "kaynağa göre tekrar sipariş" raporunun temeli
- **`referred_by`** — bu müşteriyi getiren müşteri (arkadaşını getir) — kayıtta bir kez
- **`b2b_approved`** — B2B self-servis kayıt onayı — onaylanana dek toptan fiyat görünmez (bkz. `DOMAIN.md §10`); B2C'de null. **Tek başına "bekliyor" DEMEZ:** reddedilen kayıt da `false` taşır (09.11: ret silmez) — hâl için `b2b_pending` / `b2bStatusOf` okunur
- **`b2b_applied_at`** — başvuru anı; onay kuyruğunun SIRALAMA ölçütü. `created_at` bu işi göremez (profilin doğduğu andır — B2C açılıp sonra başvuran müşteri listenin dibinde kalırdı). **Tetikleyici yazar** (`stamp_b2b_application`), uygulama değil: bugün başvuruyu yazan tek yol var ama ikincisi açıldığında damgayı unutur ve kuyruk sessizce yanlış sıralanır
- **`b2b_rejected_at`** · **`b2b_rejected_by`** · **`b2b_reject_reason`** — ret kararı, aktörü, gerekçesi. **Gerekçesiz ret yazılamaz** (`user_profiles_b2b_reject_stamp`): ret e-postayla bildiriliyor, "neden"in cevabı yoksa soru desteğe düşer. **Ret SİLİNMEZ, ESKİR** — aday künyesini düzeltip yeniden başvurunca `b2b_applied_at` retin önüne geçer, ret kaydı geçmiş olarak durur (09.11 "yeniden başvuruda geçmişi bilelim")
- **`b2b_pending`** — künye var + onaysız + (ret yok veya ret eskimiş). Kural veride, çünkü aynı soruyu üç yer soruyor (kısmi indeks · kuyruk süzgeci · `b2bStatusOf`); ayrı yazılsalardı biri gün gelip ayrışır ve **hata vermeden** yanlış liste üretirdi. Ayrıca uygulama bunu süzgeç olarak soramıyordu — PostgREST kolon-kolona karşılaştırma yazamaz
- **`is_draft`** — taslak müşteri (WhatsApp telefonuyla otomatik açılan) — doğrulanınca false; birleştirme adayı işareti
- **`merged_into_id`** — **Bu kayıt hangi müşteriye birleştirildi** (09.10, 0040). `null` = birleştirilmedi. Kayıt SİLİNMEZ kapanır — `order.customer_id` `restrict`, silme zaten reddedilirdi. **Zincir YASAK** (A→B→C): kapanmış kayıt ne hedef ne kaynak olabilir, RPC reddeder — izin verilseydi "bu kayıt nereye gitti" sorusunun cevabı tek ad değil bir yol olurdu
- **`merged_at`** / **`merged_by`** — Birleştirme anı ve yapan personel. Bayrak değil TARİH (`anonymized_at` ile aynı gerekçe); aktör ayrılırsa `null`a döner — iz gider, kayıt kalır
- **`anonymized_at`** — **GDPR silme damgası** (0037 `anonymize_customer`). `null` = hiç silinmedi. Satır SİLİNMEZ, kimliği boşaltılır — `order` buna `restrict` ile bağlı ve fatura kaydı yasal olarak duruyor; profili silen bir `delete` zaten DB tarafından reddedilirdi. **Bayrak değil TARİH:** "ne zaman silindi" denetimde sorulan bir sorudur, boolean onu bir daha cevaplayamaz. Ekran bunu okumalı: adı boş bir satırda silinmiş hesap ile yarım kalmış taslak aynı görünür

**Birleştirmenin ASIL işi kimlik anahtarlarını taşımaktır** (09.10). Kopya kayıt, iki kanalın iki farklı anahtarla gelmesinden doğar — taslakta telefon, web kaydında e-posta. Hedef ikisini de almazsa aynı kişi yarın üçüncü kez taslak açar ve birleştirme hiçbir şey çözmemiş olur. Boş alan dolar, DOLU alan ezilmez (`enrich` ile aynı kural). **Sıra zorunlu:** önce kaynağın anahtarları boşalır, sonra hedefe yazılır — tersi kısmi unique indekse çarpar ve işlevin kendisi çalışmaz (ölçüldü, 08.08). Tekillik çakışmalarında (sepet · aynı ürün değerlendirmesi · aynı gün ziyaret puanı) **hedefinki kalır** ve düşenler onay dökümünde SAYILIR: yalnız kazanımı gösteren bir onay ekranı kaybı gizler.

**Kimlik anahtarları tekildir (04.5):** `email` (küçük harfe indirgenmiş) ve `auth_user_id` kısmi unique indekslidir — aynı anahtar iki profile yazılamaz, boş anahtarlar çakışmaz. Telefon **bu tablodan çıktı** (04.10): tekilliği `customer_phone`da ve orada doğru soruyu soruyor. Kopya kayıt birleştirme gerektiren bir **istisnadır**; veritabanı engellemezse sessizce çoğalır. Çözüm kararı (bağlan / oluştur / çakışma) motorundur (`domain-core/identity`), kapısı `apps/web/lib/identity` — servis yalnız aday getirir.

**Trigger ile kapının iş bölümü:** `0002` trigger'ı `auth.users` insert'inde çalışır ve **yalnız e-postayla** eşleştirir — Google OAuth'ta sunucu kodumuz devrede olmayabilir, bağlama atomik olmalıdır. Sadece telefonu olan WhatsApp taslağı girişte eşleşmez, ikinci profil doğar; kapı bunu `conflict` olarak görünür kılar, birleştirme (04.7) çözer.

## CustomerPhone (kimlik anahtarı: doğrulanmış numara — 0049 · 04.10)

<!-- alanlar:customer_phone -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `customer_id` | uuid |  |  |
| `phone` | text |  |  |
| `verified_at` | timestamptz |  | `now()` |
| `last_seen_at` | timestamptz |  | `now()` |
| `delivery_failed_at` | timestamptz | • |  |
| `retired_at` | timestamptz | • |  |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`customer_id`** — `cascade`: kanıt satırının kimlikten bağımsız bir hayatı yok. `restrict` olsaydı her teardown/silme onu ayrıca temizlemek zorunda kalır ve biri unuturdu — sonuç, aktif tekillik indeksinde sonsuza dek tutulan bir numara
- **`phone`** — E.164 normalize; `conversation.external_ref` ile **aynı dizeyi** taşır (0039) — biri normalize edilip öteki edilmezse aynı kişi iki anahtarla iki kez görünür
- **`verified_at`** — Zilyetliğin kanıtlandığı an. **not null ve bu kasıtlı:** satır varsa doğrulanmıştır. Nullable bıraksaydık tablo yine iki işi birden yapar, kolon modelinin hatasını bir tablo ötede tekrarlardı
- **`last_seen_at`** — Bu numaradan gelen SON mesajın anı — sessizlik tetiğinin (~3 ay, `DOMAIN.md §10`) ölçütü. `verified_at`ten ayrı durur çünkü iki ayrı soru: biri "ne zaman kanıtlandı" (değişmez), öteki "hâlâ canlı mı". **Tazelemeyi `touch_customer_phone` RPC'si yapar, uygulama değil:** satır doğarken damgalar kolon varsayılanından (DB saati) geliyor; tazeleme uygulamanın saatiyle yazılınca iki saat karıştı ve damga GERİYE gitti (ölçüldü 25.08, 10 ms — tam pakette test düştü). Sessizlik tetiği tam olarak buradan hesaplanacak. Emekli satır tazelenmez
- **`delivery_failed_at`** — **Taşıyıcının son beyanı: ulaşılamadı** (`failed`) — kimlik şüphesinin ERKEN tetiği (04.10, 25.08). Tahmin değil BEYAN: numara kapanmış ya da bizi engellemiş; 3 aylık sessizliği beklemenin anlamı yok. `last_seen_at`ten ayrı durur çünkü ayrı bir şey söyler — biri "en son ne zaman yazdı", öteki "yazdığımız yerine ulaştı mı". Yazan: `mark_customer_phone_delivery` RPC'si (webhook'un `statuses` okuması). **Başarılı teslim SİLER** (sonraki teslim öncekini çürütür) ve **soru sorulunca da silinir** — bir sinyal iki kez sayılmaz. Belirsiz durumlar (`sent`, okunmayan `delivered`) bilerek yazılmaz: ağ gecikmesi ile terk edilmiş hat aynı görünür
- **`retired_at`** — Bağ koptu (hat devri · taşıyıcının `failed` beyanı). **Satır SİLİNMEZ.** **YAZICISI GELDİ (26.08):** bağlama jetonu, numarayı BAŞKA bir gerçek kayıttan devralırken eski satırı emekliye ayırıyor (`consumeWhatsappLink` → `transferred`). **Zaman aşımı YOK ve olmayacak** (kullanıcı kararı): bağı koparan şey sessizlik değil, biri çıkıp "bu hat bende" deyip kanıtlaması — hesabını açmış + hattı şu an elinde tutuyor. Sessizliğe bakan bir eşik, yılda bir sipariş veren sadık müşteriyi hiçbir şey olmadan ikiye bölerdi. Gerekçe kolonu hâlâ yok: bugün tek bir emeklilik sebebi var ve o da yazıcının kendisinden okunuyor

**Neden ayrı tablo — `user_profiles.phone` iki işi birden yapıyordu.** Kolon hem formdan yazılan iletişim numarasıydı hem bul-veya-oluştur'un okuduğu kimlik anahtarı (`user_profiles_phone_key`). Doğrulanmamış bir dize kimlik kurabildiği için **önceden sahiplenme** mümkündü: birinin hesap kartına yazdığı numara, gerçek sahibi WhatsApp'tan yazdığında onun konuşmasını, siparişini ve puanını yabancı hesapta gösteriyordu. En sık hâli kötü niyet değil kaza — eşin numarası, tuşlama hatası, aile telefonu. Ayrım şudur: **numara VERİLİR, zilyetlik KANITLANIR.**

**Satırı kim yazar:** bugün yalnız imzalı Meta webhook'u (15.7). Kod tarafında bayrak `phoneProven` ve tek `true` geçen yer orası; operatörün klavyesinden geçen numara, hesap kartı ve checkout formu kanıt değildir. `DOMAIN.md §10`'un *"bu güvenin dayanağı webhook imzasıdır"* cümlesi bu tablonun temelidir — imzasız bir uçta herkes "şu numaradan geliyorum" diyebilirdi.

**Motorun kuralı OKUMAYA değil YAZMAYA bakar:** kanıtsız numara var olan bir kayda **bağlanabilir** (eşleşme bu defterden gelir ve her satırı zaten kanıttır), ama kendi başına yeni kimlik **açamaz**. Açığın tamamı "açma" tarafındaydı.

**`customer_phone_active_key` (`phone` where `retired_at is null`):** bir numara en çok bir aktif hesaba çıkar — ürün tercihi değil zorunluluk, yoksa gelen mesaj tek müşteriye çözülemez. Süzgeç sayesinde devredilmiş hat **çözülebilir bir vaka** hâline gelir: eski satır emekliye ayrılır, geçmiş durur, numara yeni sahibine açılır. Kolon modelinde aynı şey ancak eski bağı `null`'layarak, yani "bu numara bir zamanlar kimdeydi" bilgisini silerek yapılabiliyordu.

**Ters yön (bir hesap kaç numara) BİLEREK AÇIK:** kullanıcı kararı ertelendi (`DOMAIN.md §10`); meşru çok-numara halleri var (kişisel + işyeri, FR + TR hattı — diasporada yaygın). Yapı iki seçeneği de taşıyor, tavan gerekirse `Setting` ile konur.

**Birleştirmede satırlar hedefe TAŞINIR** (`merge_customers`, 0040) — emekli olanlar dahil: kaynağın geçmişi hedefte devam etmeli, kapanmış kayıtta kalmamalı. Çakışma olamaz, tekillik numarada.

## Address (adres)

<!-- alanlar:address -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `customer_id` | uuid |  |  |
| `label` | text | • |  |
| `recipient` | text |  |  |
| `line1` | text |  |  |
| `line2` | text | • |  |
| `postal_code` | text |  |  |
| `city` | text |  |  |
| `phone` | text |  |  |
| `country` | country_code |  | `'FR'` |
| `is_default` | boolean |  | `false` |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`label`** — müşterinin kendi verdiği ad ("Ev", "İş"). Checkout adres kartının **başlığı** budur: iki adres arasında seçim yapan müşteri sokak adını okuyarak değil adıyla ayırt eder. Boş bırakılabilir — ekran o zaman şehri başlık yapar, uydurma etiket yazılmaz
- **`recipient`** — adrese **giden** kişi — hesap sahibiyle aynı olmak zorunda değil (hediye, iş adresi, aile büyüğü). Kurye kapıda kimi soracağını buradan bilir. **ZORUNLU** (kullanıcı kararı 22.08): adres kaydı *"burada kim teslim alır"* sorusunun cevabıdır; nullable kaldığı sürece cevap okuma anına erteleniyor ve okuyan her uç kendi yedeğini uyduruyordu — ölçüldü, iki yüzey aynı veride zıt karar verdi. Kolaylık formda: yeni adres hesabın künyesiyle **dolu** açılır
- **`phone`** — **teslimat** telefonu; `user_profiles.phone` hesabın numarasıdır, bu adresin. Kapıya teslimde kurye zili çalmadan önce arar — hediye adresinde aranacak numara alıcınınkidir. **ZORUNLU** (22.08, gerekçe `recipient` ile aynı). Biçim E.164 ve **istemcide** indirgenir (`normalizePhone`); kolonda biçim kısıtı YOK — dayatan bir check, numarası olan müşteriyi adres ekleyemez hâle getirirdi (adres defteri reddetmez, 10.08)
- **`is_default`** — müşterinin varsayılan adresi — checkout onu önceden seçer; **tekildir** (yenisi seçilince eskisi düşer). İlk adres otomatik varsayılan olur

**`in_route` bir KOLON DEĞİL, türetilir:** posta kodu aktif bir `DeliveryZone`'a düşüyor mu — **saklanmaz**.

Müşteri silinince adresleri de gider (CASCADE) — yetim adres kalmaz.

## DeliveryZone (rota / teslimat bölgesi)

Admin tarafından düzenlenir; rota-içi belirleme ve teslimat günü bundan türer.

<!-- alanlar:delivery_zone -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `name` | text |  |  |
| `warehouse_id` | uuid |  |  |
| `weekdays` | int[] |  | `'{}'` |
| `is_active` | boolean |  | `true` |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`name`** — iç etiket (ör. "Strasbourg Kuzey")
- **`warehouse_id`** — **bölge tek depoya bağlıdır** — posta kodu → bölge → depo zincirinin orta halkası (`DOMAIN §17`)
- **`weekdays`** — haftalık teslimat günleri, **ISO**: 1=Pzt … 7=Paz
- **`is_active`** — kapatılan bölge rota sayılmaz — adres kargoya düşer

**Posta kodları artık bu tabloda değil** (`DeliveryZonePostalCode`, `data-model/depo.md`): dizi kolonken iki bölgeye aynı kodu yazmak serbestti ve çözücü sessizce ilkini seçiyordu — çok depoda bu, siparişin yanlış depoya düşmesi demek. Anahtar `(ülke, kod)`: `67000` iki ülkede de geçerlidir.

**`name` MÜŞTERİYE GÖSTERİLMEZ** (kullanıcı kararı 10.08). Bu bir iç etikettir ve operasyon içine not yazıyor (`Kehl (DE) — hazırlanıyor`; depo adlarında da `Colmar — pilot depo (kapalı)`). Native uygulamanın "aracımız nerelere gidiyor" sayfası bir ara bölge adlarını gösterecekti ve bunun için tabloya müşteri-yüzü bir ad kolonu bile eklendi; kullanıcı ikisini de eledi — **bölge adının müşteri için bir anlamı yok**, müşterinin elindeki tek ölçü kendi posta kodudur. Sayfa `delivery_zone_postal_code`ten AKTİF bölgelerin kodlarını okuyor; eklenen kolon geri alındı, yeni alan gerekmedi.

**Rota içi/dışı SAKLANMAZ** (07.2): adresin posta kodu aktif bir bölgeye düşüyorsa rota içi. Bölge sınırı admin tarafından değiştirilebildiği için saklanan değer ertesi gün yalan olur. Teslimat günü hesabı da (kesim saati dâhil) motordadır — `domain-core/delivery`.

## Order (sipariş)

<!-- alanlar:order -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `customer_id` | uuid |  |  |
| `channel` | channel |  |  |
| `order_source` | order_source |  | `'web'` |
| `is_gift_order` | boolean |  | `false` |
| `status` | order_status |  | `'draft'` |
| `cancel_reason` | order_cancel_reason | • |  |
| `provider_refunded_at` | timestamptz | • |  |
| `payment_status` | payment_status |  | `'pending'` |
| `payment_method` | payment_method | • |  |
| `on_account` | boolean |  | `false` |
| `warehouse_id` | uuid |  |  |
| `delivery_type` | delivery_type |  | `'route'` |
| `delivery_zone_id` | uuid | • |  |
| `delivery_date` | date | • |  |
| `neighbor_invite_id` | uuid | • |  |
| `address_id` | uuid | • |  |
| `address_snapshot` | jsonb | • |  |
| `courier_id` | uuid | • |  |
| `delivery_run_id` | uuid | • |  |
| `delivery_country` | country_code |  | `'FR'` |
| `vat_number_snapshot` | text | • |  |
| `vat_treatment` | vat_treatment |  | `'domestic'` |
| `locale` | preferred_language | • |  |
| `reference_no` | text | • |  |
| `idempotency_key` | text | • |  |
| `invoice_no` | text | • |  |
| `delivery_proof` | jsonb | • |  |
| `carrier` | carrier | • |  |
| `tracking_number` | text | • |  |
| `shipping_fee` | numeric(10, 2) |  | `0` |
| `total` | numeric(10, 2) |  | `0` |
| `discount_id` | uuid | • |  |
| `discount_amount` | numeric(10, 2) |  | `0` |
| `discount_label` | jsonb | • |  |
| `amount_collected` | numeric(10, 2) |  | `0` |
| `amount_refunded` | numeric(10, 2) |  | `0` |
| `cogs_amount` | numeric(10, 2) | • |  |
| `delivery_cost` | numeric(10, 2) | • |  |
| `payment_fee` | numeric(10, 2) | • |  |
| `packaging_cost` | numeric(10, 2) | • |  |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`warehouse_id`** — **bir sipariş tek depodan çıkar** (`DOMAIN §17`, istisnasız): bölünmüş sipariş yoktur; kendi deposunda olmayan kargolanabilir ürün AYRI bir kargo siparişi olur. Kaynağı ya adresin posta kodu ya işlemi yapan personelin sabit deposudur — **varsayılan depo kavramı yoktur**. Siparişe yazılan partilerin de bu depodan olduğunu ertelenmiş kısıt tutar
- **`channel`** — *kim* — müşteri tipinden otomatik (`deriveChannel`) ve **DONAR**: müşteri sonradan şirkete dönse bile geçmiş siparişin kanalı sabit kalır. 27.08'e kadar bu satırdaki *"değişmez"* yalnız bir İDDİAYDI — ne şema ne veri koruyordu (`03.12`); artık iki katman zorluyor: `OrderUpdateSchema` alanı `omit` eder, `order_channel_frozen` tetikleyicisi şemayı atlayan yolu keser. Gerekçe: kanal `vat_treatment`ı ve fiyat kademesini belirler, yani sonradan değişmesi parası alınmış bir belgenin vergisini geriye dönük oynatırdı
- **`order_source`** — *nereden kapandı* — kanaldan bağımsız eksen (bkz. `CHANNELS.md §2`)
- **`is_gift_order`** — patron ikramı (arkadaşa hediye); **yalnız muhasebe export'una girmez** — gelir/kâr/kasa/ortaklık dahil gerisi tam normal, parayı patron öder (bkz. `DOMAIN.md §9`)
- **`status`** — bkz. `ORDER_LIFECYCLE.md`
- **`provider_refunded_at`** — **Sağlayıcı ödemesi iade edildi mi** (07.14); `null` = edilmedi. `cancel_reason`dan AYRI çünkü ayrı sorular ve bir dalda ayrışıyorlar: sebep "neden iptal", bu "para çekilip geri verildi mi". `out_of_stock`ta çakışırlar; webhook'un birinci iade dalında (sipariş zaten `superseded`, ödeme geç geliyor) çakışmazlar — sebebi `out_of_stock`a çevirmek yalan, boş bırakmak ekrana "tahsilat yapılmadı" dedirtiyordu. **`settleRefund`'ın müşteri iade borcundan farklı:** orada mal eksik geldi, defterde hareket var; burada sipariş hiç doğmadı, para gelip geri gitti, defter net sıfır. Bayrak değil TARİH — "ekstremde görünmüyor" diyen müşteriye tarih söylenir
- **`cancel_reason`** — **NEDEN iptal oldu** (07.14); `null` = iptal edilmedi. `superseded` → müşteri yeniden denedi, eski taslak kapandı; `out_of_stock` → mal kalmadı; `customer` · `staff` → iptali kim istedi. Kolon bir raporlama süsü değil: onay ekranı iptal edilen HER siparişte *"tahsilat yapılmadı"* diyordu ve kart yolunda bu yanlıştı
- **`payment_status`** — ayrı eksen; **türetilir** (`amount_collected`−`amount_refunded` vs karşılanan tutar) — bkz. Kalıcı kararlar
- **`payment_method`** — `bank_transfer` = havale (peşin veya vadeli tahsilat)
- **`on_account`** — vadeli sipariş mi — yalnız `credit_enabled` müşteride true; peşin ödemesiz `confirmed` (bkz. `DOMAIN.md §7`)
- **`delivery_zone_id`** — rota-içi ise hangi bölge (bkz. `DeliveryZone`)
- **`delivery_date`** — seçilen/atanan rota günü; kargoda null
- **`neighbor_invite_id`** — bu sipariş bir **komşu davetinden** mi geldi (17.10) — künye; davetin ödülü buradan doğar ve davetin kullanımı bu kolondan **sayılır** (davet satırında sayaç yok)
- **`address_id`** — teslimat adresi; hızlı satışta null
- **`address_snapshot`** — sipariş anında adresin kopyası — adres sonradan değişse de sipariş bozulmaz (zone editable olduğu için `delivery_zone_id` de snapshot'tır)
- **`courier_id`** — seferi süren kurye — `start_delivery_run` senkronlar (18.08; sahiplik kapıları buradan okur)
- **`delivery_run_id`** — hangi GERÇEKLEŞEN seferle gitti (0046) — yalnız start yazar, teslimle donar
- **`delivery_country`** — teslimat ülkesi — DE B2C 10.000€ OSS eşiği izlemi (bkz. `DOMAIN.md §5`)
- **`vat_number_snapshot`** — reverse charge siparişinde o anki geçerli vergi no (denetim kanıtı)
- **`shipping_fee`** — müşteriden alınan kargo ücreti (varsayılan 0); KDV'ye tabi (bkz. `DOMAIN.md §6`). Uygulamadaki adı `shippingFeeCents`, birimi **cent** (`STACK §8`)
- **`reference_no`** — sistemin ürettiği referans — marka+yıl+**rastgele** (ör. `LA-26-7K4M2P`), hacim sızdırmaz; **ilk kalıcı duruma geçişte** üretilir (`confirmed`, hızlı satışta `completed`); resmî fatura no değil
- **`idempotency_key`** — **çift sipariş kalkanı** — istemcinin o checkout denemesi için ürettiği anahtar; aynı istek ikinci kez ulaşırsa (çift tıklama, ağın yeniden denemesi) ikinci sipariş AÇILMAZ, var olan döner. Kısmi unique: anahtarsız satırlar (operasyon girişi, hızlı satış) birbirini engellemez
- **`delivery_proof`** — teslim onayı: imza görüntüsü/foto (storage yolu), onaylayan, zaman — B2B varsayılan zorunlu, B2C kapalı (parametrik; bkz. `DOMAIN.md §6`)
- **`carrier`** — kargo taşıyıcısı (`colissimo · chronopost · dhl · ups · other`). **Tanımlı küme, serbest metin değil:** takip bağlantısı taşıyıcının URL kalıbından üretilir. `other` kümeyi kapatmamak için — yeni taşıyıcı migration beklemez; seçilince bağlantı gösterilmez, numara düz metin durur
- **`tracking_number`** — kargo takip numarası. `carrier` ile birlikte **yalnız `delivery_type = 'shipping'`** siparişlerde dolar — kural veride (`order_carrier_only_shipping`): kendi aracımızla giden malın taşıyıcısı yoktur ve ekran unutsa bile yazılamaz
- **`invoice_no`** — dış muhasebeden sonradan eşleşir
- **`vat_treatment`** — KDV işleme tipi (export için); ileride `oss_destination`
- **`locale`** — **siparişin dili** — müşterinin bu siparişi verirken okuduğu yüzeyin dili; sipariş maillerinin dili buradan gelir. `null` = bilinmiyor (hızlı satış, operasyon girişi) → profilin `preferred_language`'ına düşülür. Profilden okumamanın sebebi snapshot mantığı: profil sonradan değişebilir, siparişin metni değişmemeli
- **`total`** — **sipariş edilen** toplam = Σ kalem − indirim + `shipping_fee` (sabit, sipariş anı). App: `totalCents`
- **`discount_id`** — uygulanan indirim/kupon (tek; üst üste binmez)
- **`discount_amount`** — uygulanan indirim tutarı; varsayılan 0. App: `discountAmountCents`
- **`discount_label`** — inen indirimin **müşteriye görünen adının** sipariş anındaki kopyası (`{"fr":"Offre de bienvenue",…}`) — kampanya yeniden adlandırılsa/silinse de siparişin maili ve fişi aynı şeyi der; `address_snapshot` ile aynı gerekçe. `null` = ad verilmemiş → yüzey genel "İndirim"e düşer
- **`amount_collected`** — **cache** — kaynak `MoneyMovement` (siparişe bağlı girişler); toplam tahsil edilen. App: `amountCollectedCents`
- **`amount_refunded`** — **cache** — kaynak `MoneyMovement` (`order_refund` çıkışları); toplam iade edilen. App: `amountRefundedCents`
- **`cogs_amount`** — malın maliyeti — tüketilen partilerin alışı; kapanışta sabitlenir. App: `cogsAmountCents`
- **`delivery_cost`** — teslimat maliyeti (kargo gerçek / rota birim); kapanışta sabitlenir. App: `deliveryCostCents`
- **`payment_fee`** — ödeme komisyonu (Stripe/SumUp); kapanışta sabitlenir. App: `paymentFeeCents`
- **`packaging_cost`** — paketleme (soğuk zincir) maliyeti; kapanışta sabitlenir. App: `packagingCostCents`

**`cancel_reason` "para hareket etti mi" DEMEZ ve tek başına okunamaz** (08.08 · müşteri şeridinin ölçümü). Eskiden bu tablo *"`out_of_stock` → para çekildi ve iade edildi"* diyordu; **yalnız kart yolunda doğru.** Aynı sebep ikinci bir yerde de yazılıyor: `paymentMethod !== 'online'` dalında rezervasyon tutmazsa sipariş `draft`ta kapanıyor ve ortada tahsilat hiç yok. Sebebi tek başına okuyan bir ekran orada tam ters yönde bir yalan üretirdi. Para sorusunun cevabı `provider_refunded_at`'tir (yukarıda); sebep "neden iptal oldu"yu cevaplar, o kadar.

**`payment_failed`'i bugün YAZAN YOK** ve bu bir eksiklik değil: kartın reddi Stripe'ın kendi arayüzünde veriliyor, sunucuya hiç uğramıyor (`checkout/actions.ts` künyesi). Reddedilen kartta sipariş `draft` kalıyor, müşteri tekrar denerse `supersedeOpenDrafts` onu `superseded` yapıyor. Değer kümede kalıyor çünkü ileride sağlayıcıdan gelen bir red olayı yazılabilir — ama "yazılıyor" sanılmasın diye burada duruyor.

**Ödeme oturumu açılamazsa ayrılmış mal TTL boyunca durur — ve bu bir sızıntı DEĞİL** (08.08, ölçüldü). `createCheckoutSession` önce ayırıyor sonra oturum açıyor (DOMAIN §4: "önce ayır, sonra tahsil et"); oturum açılamazsa rezervasyon serbest bırakılmıyor. Ama süresi var (`reservation_ttl_minutes`) ve süpürücüsü koşuyor (`ReservationService.sweepExpired` ← `apps/backend/src/jobs/sweep-reservations.ts`), yani durum "müşteri ödeme ekranını açtı ve bıraktı" hâliyle aynı yere çıkıyor. Hata dalına ayrıca bir serbest bırakma eklemek, aynı işi yapan ikinci bir mekanizma olurdu — üstelik nadiren koşan, yani bir gün bozulduğunda kimsenin fark etmeyeceği olan.

## OrderItem (sipariş kalemi)

<!-- alanlar:order_item -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `order_id` | uuid |  |  |
| `variant_id` | uuid |  |  |
| `qty` | int |  |  |
| `fulfilled_qty` | int |  | `0` |
| `stock_id` | uuid | • |  |
| `bundle_id` | uuid | • |  |
| `unit_price` | numeric(10, 2) |  |  |
| `list_unit_price` | numeric(10, 2) | • |  |
| `price_set_by` | uuid | • |  |
| `line_discount_amount` | numeric(10, 2) |  | `0` |
| `vat_rate` | numeric(4, 2) |  |  |
| `return_disposition` | return_disposition | • |  |
<!-- /alanlar -->

**Kararlar**

- **`qty`** — sipariş edilen
- **`fulfilled_qty`** — **fiziksel olarak müşteriye giden** miktar (varsayılan = qty; eksikte düşer, 0 olabilir). Mal geri döndüyse düşer; `goodwill` iadesinde düşmez — mal müşteride kalmıştır
- **`stock_id`** — partiye bağlı teklif satırıysa hangi parti (batch-pinned); normal satırda null. Fiilen çıkan parti(ler) `OrderItemBatch`'te
- **`bundle_id`** — bu kalem bir paketten geldiyse hangi paket; normal satırda null
- **`unit_price`** — **sabitlenmiş** fiyat (sepete eklenince). App: `unitPriceCents`
- **`list_unit_price`** — **pazarlık izi** (26.08): üstüne yazılmadan önce liste ne diyordu. App: `listUnitPriceCents`. `null` = pazarlık olmadı, liste = `unit_price`. Taviz **imzalı** türetilir: `coalesce(list_unit_price, unit_price) − unit_price`; eksi çıkabilir (listenin üstüne satış meşrudur)
- **`price_set_by`** — pazarlığı yapan personel (`restrict`). `list_unit_price` ile **birlikte** yaşar — yarım iz yoktur, kısıt veride (`order_item_negotiation_complete`)
- **`line_discount_amount`** — sepet/kupon indiriminin bu kaleme **oransal payı** (varsayılan 0). App: `lineDiscountAmountCents` — kısmi iade ve kalem KDV'si indirimli birimden hesaplanır (bkz. `DOMAIN.md §5`). **Pazarlık buraya YAZILMAZ:** bu kolon kupon/kampanya havuzunun ve `discount_amount = Σ line_discount_amount` kısıtına girer, yani kotayı tüketir
- **`vat_rate`** — o anki oran
- **`return_disposition`** — kalem iade edildiyse **mala ne oldu** (DOMAIN §8). `goodwill` = mal müşteride kaldı: `fulfilled_qty` ve stok DEĞİŞMEZ, yalnız para iade edilir — jestin maliyeti kârda görünür

## OrderItemBatch (kalem–parti eşlemesi)

Hazırlıkta fiilen çıkan parti(ler)in kaydı — depocu FEFO önerisini onaylarken otomatik yazılır (bkz. `DOMAIN.md §4`). Geri çağırma ("bu parti kimlere gitti") ve gerçek COGS (`Order.cogs_amount`) buradan türetilir.

<!-- alanlar:order_item_batch -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `order_item_id` | uuid |  |  |
| `stock_id` | uuid |  |  |
| `qty` | int |  |  |
<!-- /alanlar -->

**Kararlar**

- **`stock_id`** — çıkan parti
- **`qty`** — bu partiden çıkan adet (kalem birden çok partiden karşılanabilir)

Σ qty = kalemin `fulfilled_qty`'si. `cogs_amount` = Σ (qty × partinin `purchase_price`) — kapanışta sabitlenir.

## OrderBox (sipariş kutusu — 0048 · 23.6)

Bizim bastığımız QR'ın kaydı ("bu hangi kayıt" — ürün barkodunun "bu hangi mal"ından ayrı iş, `katalog.md`). Kutu döngüsü karar §1.4 (`docs/feature/barkod-okuyucu.md`): sipariş seç → kutu aç → okutarak doldur → kapat → her şey konduysa sipariş `ready`, değilse yeni kutu. Kutusu olmayan sipariş eski yoldan gider (bilinçli çift akış).

<!-- alanlar:order_box -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `order_id` | uuid |  |  |
| `warehouse_id` | uuid |  |  |
| `box_no` | int |  |  |
| `code` | text |  |  |
| `sealed_at` | timestamptz | • |  |
| `sealed_by` | uuid | • |  |
| `printed_at` | timestamptz | • |  |
| `loaded_at` | timestamptz | • |  |
| `loaded_by` | uuid | • |  |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`warehouse_id`** — siparişin deposu — yükleme okutması (23.8) rampayı siparişe gitmeden bilir
- **`box_no`** — sipariş içi insan sayısı ("Kutu 2/3"); kimlik DEĞİL — unique `(order_id, box_no)`
- **`code`** — **QR'ın içeriği**, global unique; `reference_no` değil ve ondan türetilemez (referans müşteriye görünür, kutu kodu teslim kaydı düşürür) — üreteç `orderBoxCode` (`KT-YY-` + 10 karakter)
- **`sealed_at`** / **`sealed_by`** — null = AÇIK kutu (masada); kapanan kutu salt-okunur. Mühür yalnız `seal_order_box` RPC'sinden
- **`printed_at`** — etiket basımı (23.7) — "kapalı ama basılamadı" görünür bir hâl
- **`loaded_at`** / **`loaded_by`** — araca yükleme (23.8); sayaç bu damgalardan türer, ayrı tablo yok. Kısıt: açık kutu yüklenemez

## OrderBoxItem (kutu içeriği)

<!-- alanlar:order_box_item -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `box_id` | uuid |  |  |
| `order_item_id` | uuid |  |  |
| `qty` | int |  |  |
<!-- /alanlar -->

**Kararlar**

- **`order_item_id`** — unique `(box_id, order_item_id)` — kalem kutuda tek satır; bir kalem birden çok KUTUYA bölünebilir
- **`qty`** — > 0

**Yazma yolu yalnız `seal_order_box` RPC'si** (kutu içeriği + `record_preparation` + mühür TEK transaction — "kutu var ama parti izi yok" doğamaz). RPC kapanışta **Σ kutu = `fulfilled_qty`** eşitliğini denetler: çok kutulu birleşimi `sealBox` kapısı kurar (0015'in absolüt yazımı), eksik kurulmuş birleşim tümüyle geri alınır. Kutulanmış kalem kutusuz akışla karışamaz — çift akış sipariş düzeyinde meşru, kalem düzeyinde değil.

## OrderStatusLog (durum geçiş kaydı)

"Her geçiş kaydedilir" kuralının varlığı (bkz. `ORDER_LIFECYCLE.md`). Teslim anı, kapanış anı ve geri bildirim zamanlaması (~10 gün) buradan türetilir.

<!-- alanlar:order_status_log -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `order_id` | uuid |  |  |
| `from_status` | order_status | • |  |
| `to_status` | order_status |  |  |
| `actor_id` | uuid | • |  |
| `note` | text | • |  |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`from_status`** — ilk kayıtta null (siparişin doğuşu)
- **`actor_id`** — kim (sistem olayında null)
- **`note`** — geçişe bağlı serbest bağlam — kuryenin "teslim edilemedi" notu gibi (08.08; ayrı tablo değil: not o geçişle anlamlı, yarınki deneme dünkü sebebi buradan okur)

**`transition_order_status` fonksiyonu (07.6):** durum güncellemesi + log satırı tek transaction'da ve **yalnız beklenen kaynaktan** (koşullu). Araya biri girmişse yazmaz, güncel durumu bildirir — depocu "hazır" derken kurye "yolda" dediğinde biri diğerini sessizce ezmez. Geçişin izinli olup olmadığına fonksiyon KARAR VERMEZ; o motorun işidir (`domain-core/order/status-machine`).

## order_sale (görünüm — gerçekleşmiş satış)

Sipariş kayıt anında değil, **gerçekleştiği anda** gelirdir. `order_sale`, teslim edilmiş ya da kapanmış siparişleri `sale_date` ile birlikte verir: `sale_date` = `OrderStatusLog`'un İLK `delivered`/`completed` kaydının günü. Muhasebe export'u (12.7) da dönemsel kârlılık (12.6) da bu tarihi okur — iki rapor iki ayrı "satış günü" hesaplamaz.

- **`min(...)` şart:** tam yolda sipariş önce `delivered` sonra `completed` olur, ikisi farklı aya düşebilir. Kapanışı esas alsaydık ocakta teslim edilmiş satış şubat cirosuna yazılırdı.
- **`o.*` seçilir:** görünüm siparişin alanlarını yeniden yazmaz, yalnız `sale_date` ekler. Şema da öyle türetilir (`OrderSaleSchema = OrderSchema.extend({saleDate})`); alan listesi kopyalansaydı `order`a eklenen kolon burada sessizce eksik kalırdı.
- **Hediye sipariş DIŞLANMAZ:** patron ikramı gelirdir, kârdır, kasaya girer — yalnız dış muhasebeye gitmez. Süzgeç export kapısındadır (`domain-core/accounting`); burada dışlansaydı `is_gift_order` "yalnız export filtresini etkiler" kuralı sessizce genişlerdi.
- **`returned` dışarıda:** mal geri gelmiş, para iadesi süreci açık (07.9). Sipariş `completed`'a dönünce satış yine görünür ve `sale_date` orijinal teslim günüdür — geçmiş dönemin raporu yeniden üretildiğinde satır doğru aya oturur.

## Cart (sunucu sepeti)

Giriş yapmış müşterinin sepeti sunucuda kalıcıdır — cihaz değişse de durur; sepet kurtarma e-postasının (Faz 2 otomasyonu) zeminidir.

<!-- alanlar:cart -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `customer_id` | uuid |  |  |
| `items` | jsonb |  | `'[]'::jsonb` |
| `saved_items` | jsonb |  | `'[]'::jsonb` |
| `updated_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`customer_id`** — **birincil anahtar** — "tek satır / müşteri" kuralı şemada zorlanır
- **`items`** — `[{ kind, variantId, bundleId, qty, unitPrice, stockId, addedAt }]`
- **`saved_items`** — **sonraya kaydedilenler** (K33) — aynı biçim, aynı satır
- **`updated_at`** — her dokunuşta tazelenir (sepet kurtarma zamanlaması buna bakar)

**Sepetteki `unitPrice` BAĞLAYICI DEĞİLDİR** (DOMAIN §5): gösterim ve değişiklik tespiti içindir. Bağlayıcı fiyat **checkout başlangıcında** çözülür ve orada sabitlenir — stok ayırma + ödeme oturumuyla aynı 30 dk'lık pencerede. Sepet aylarca bekleyebilir; oradaki fiyatı bağlayıcı saymak maliyeti oynayan üründe zarar, fiyat düştüğünde müşteriye haksızlık olurdu.

**`stockId` dolu satır** partiye çıpalı teklif kalemidir ve normal satırdan **ayrı yaşar** — aynı ürün hem indirimli partiden hem normal fiyattan sepette olabilir. İndirim partiye aittir; parti tükenirse başka partiye taşınmaz.

**Sepette stok ayrılmaz** (DOMAIN §4): sepet bir niyet kaydıdır, rezervasyon checkout'ta yapılır.

**İKİ TÜR satır vardır** ve `kind` bunu açıkça taşır: varyant satırı (`variantId` + `stockId`) ve **paket satırı** (`bundleId`, 05.5). Paketin varyantı ya da partisi yoktur — satılan şey paketin kendisidir ve sepette bütün olarak artırılır/silinir (DOMAIN §13). Türü kimlik alanının varlığından çıkarmak yerine açıkça yazmanın sebebi kod tarafında: TypeScript yalnız birim tipli alanlarla daraltma yapar, `string` birim tip değildir.

**`saved_items` — sonraya kaydedilenler.** Teslimat yerine gönderilemeyen kalem sepetten SİLİNMEZ, buraya taşınır: alışveriş ölmez, sepet bölünür. Ayrı tablo açılmadı çünkü ikisi aynı şeyin iki hâli — ikisi de "bu ürünü istiyorum" kaydı, ayrımları yalnız BUGÜN alınıp alınamayacağı. Ayrı yapılarda tutmak, aralarında taşırken iki yazma yolu açardı. `addedAt` taşınırken korunur: "iki haftadır bekliyor" sinyali listeye geçerken sıfırlanmamalı.

## DeliveryRun (sefer — gerçekleşen teslimat rotası, 0046 · 18.08)

Rotanın **fiilen sürülmüş** hâli: kim sürdü, hangi araç, ne zaman çıktı/döndü. Planlanan sefer
`(delivery_zone_id, delivery_date)` ikilisi olarak TÜRETİLMİŞ kalır (0044 kararı); bu tablo araç
hazırlanırken doğar. Kararlar ve gerekçeler: `docs/feature/sefer.md`.

<!-- alanlar:delivery_run -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `reference_no` | text |  |  |
| `delivery_zone_id` | uuid |  |  |
| `delivery_date` | date |  |  |
| `warehouse_id` | uuid |  |  |
| `courier_id` | uuid |  |  |
| `vehicle_id` | uuid | • |  |
| `created_at` | timestamptz |  | `now()` |
| `departed_at` | timestamptz | • |  |
| `returned_at` | timestamptz | • |  |
| `note` | text | • |  |
<!-- /alanlar -->

**Kararlar**

- **`reference_no`** — **tekil**, `SF-26-XXXXXX` — üretim domain-core (`deliveryRunReferenceNo`)
- **`delivery_zone_id`** — `restrict`; `(zone, date)` **mutlak tekil** — rota+gün başına TEK sefer (K3); eşzamanlılık kilidi indekste
- **`warehouse_id`** — SNAPSHOT — bölge sonradan taşınsa da seferin tesisi değişmez
- **`courier_id`** — `restrict` — kim sürdü; siparişin `courier_id`si start'ta BURADAN senkronlanır
- **`vehicle_id`** — `restrict`; zorunluluk parametrik (Setting) — soğuk zincir izi araç üstünden
- **`created_at`** / **`departed_at`** / **`returned_at`** — üç damga; durum makinesi YOK, hâl türetilir

**`order.delivery_run_id`** (`set null`): sipariş hangi gerçekleşen seferle gitti — yalnız
`start_delivery_run` yazar, teslimle donar. `courier_id` sonradan oynasa da "kim götürdü"nün
kanıtlı cevabı seferdir.

**Üç RPC:** `start_delivery_run` (satır + siparişlerin claim'i tek transaction; aynı kuryenin açık
sefere ikinci basışı catch-up claim — sonradan hazırlanan duraklar da bağlanır; durum geçişi RPC'de
DEĞİL, motor izniyle uygulama katmanında) · `close_delivery_run` (aşağıda) · `reassign_delivery_run`
(K2 devri: run + açık siparişlerin kuryesi birlikte; sonuçlanmış duraklara dokunulmaz).

## DeliveryRunClose (sefer kapanışı — kurye×gün kapanışının halefi, 18.08)

Kapanış bir **mutabakattır**, para hareketi değil: para kapıda tahsil edilirken yazıldı (`money_movement`, 12.2). Bu tablo beklenen ile sayılanı yan yana koyar ve farkı **aynı gün, seferiyle birlikte** görünür kılar (DOMAIN §7). Eski `courier_day_close` (kurye×gün) kaldırıldı — "fark hangi seferde doğdu" cevaplanamıyordu ve teslimden sonra yeniden atanan sipariş yanlış kuryeye yazılabiliyordu; `delivery_run_id` teslimle donduğu için o kayma kökten kapandı.

<!-- alanlar:delivery_run_close -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `delivery_run_id` | uuid |  |  |
| `expected_cash` | numeric(12, 2) |  | `0` |
| `expected_card` | numeric(12, 2) |  | `0` |
| `expected_cheque` | numeric(12, 2) |  | `0` |
| `counted_cash` | numeric(12, 2) |  | `0` |
| `counted_card` | numeric(12, 2) |  | `0` |
| `counted_cheque` | numeric(12, 2) |  | `0` |
| `delivered_orders` | uuid[] |  | `'{}'` |
| `returned_orders` | uuid[] |  | `'{}'` |
| `pending_orders` | uuid[] |  | `'{}'` |
| `note` | text | • |  |
| `closed_by` | uuid | • |  |
| `closed_at` | timestamptz |  | `now()` |
| `reconciled` | boolean | • | *üretilmiş* |
<!-- /alanlar -->

**Kararlar**

- **`delivery_run_id`** — `restrict` + **tekil**: bir sefer bir kez kapanır
- **`expected_cash`** / **`expected_card`** / **`expected_cheque`** — sistemin hesabı — kapanış anında DONDURULUR
- **`counted_cash`** / **`counted_card`** / **`counted_cheque`** — kuryenin fiilen teslim ettiği (sayım / cihaz raporu / yapraklar)
- **`delivered_orders`** — seferin teslim edilenleri (`delivered` + `completed`) — fotoğraf ÇÖZÜMDEN ÖNCE çekilir
- **`returned_orders`** — reddedilenler — getirilen mal
- **`pending_orders`** — kapanış ANINDA sonuçlanmamışlar; kapanış bunları `ready`ye çözer (K4), yeni günü sevkiyatçı yazar
- **`note`** — fark açıklaması — fark gizlenmez, açıklanır
- **`reconciled`** — **generated** — beklenen = sayılan mı

**`expected_*` türetilebilir olduğu hâlde SAKLANIR.** Kaynağı `delivery_run_collection` görünümüdür (seferin kapıda toplanan üç yöntemi, `order.delivery_run_id` ile gruplanır); ama kapanış o anın fotoğrafıdır — sonradan bir hareket düzeltilirse geçmiş mutabakat değişmemeli, "o gün ne konuşuldu" sabit kalmalı. Türetim ile snapshot çelişmez: canlı hesap görünümde, donmuş hesap burada.

**`reconciled` ise saklanmaz, generated kolondur.** Beklenen ve sayılan zaten yan yana duruyorken "fark var/yok" ayrıca yazılsaydı bir gün ikisi çelişirdi (DATA_MODEL kalıcı kararlar: türetilebilen sayaç tutulmaz). Generated kolon hem sorgulanabilir (mutabık olmayan günler listesi) hem kayamaz.

**Fark ayrı kolon değildir:** `counted − expected`. İşaret anlamlıdır — eksi eksik teslim, artı fazla para; ikisi de açıklanmayı hak eder, mutlak değere indirilmez.

**`close_delivery_run` fonksiyonu (11.7):** dönüş damgası + beklenen toplamlar + seferin üç listesi + takılı durakların çözümü + kapanış satırı tek transaction'da. Kapanmış sefer salt-okunurdur; ikinci çağrı ezmez, `already_closed` döner. Sonuçlanmamış durak kapanışı **engellemez** — üstelik kapanış onları motorun "ulaşılamadı" kenarıyla çözer (`stale` yutulur: kurye o an teslim yazdıysa onun kaydı kazanır); hangi güne yeniden yazılacağı sevkiyatçının kararıdır.
