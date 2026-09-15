-- Müşterinin ticari alanları ve adres. Ayrı müşteri tablosu yok: müşteri bir roldür, kimlik `user_profiles`ta yaşar ve buraya yalnız
-- ticari alanlar eklenir, çünkü 1:1 uzantı tablosu her sepet ve ödeme okumasına bir join eklerdi.

alter table public.user_profiles
  -- Doluysa B2B. Kanal (b2b/b2c) SAKLANMAZ, bunun varlığından türetilir (DATA_MODEL türetme ilkesi).
  add column company_info jsonb,
  add column vat_number text,                        -- AB vergi no (Alman USt-IdNr) — reverse charge
  add column vat_number_valid boolean,               -- VIES doğrulaması; null = hiç sorulmadı
  -- Sonucun yaşı: %0 KDV'yi (reverse charge) açan bayrak "ne zaman doğruydu"yu söylemez ve sonradan iptal edilen bir numara
  -- damgasız hep geçerli görünürdü. Damga `vat_number_valid` ile birlikte ve yalnız kesin cevapta yazılır; "sorulamadı" ikisini de
  -- değiştirmez, yoksa VIES'in meşgul olduğu bir gün bilgiyi silerdi.
  add column vat_number_checked_at timestamptz,

  -- Başvurunun üç hâli (bekliyor, onaylandı, reddedildi) `b2b_approved` ile ayrışmaz, çünkü ret de `false` bırakır; hâller enum
  -- yerine damgalarla ayrılır, çünkü damga "ne zaman"ı da söyler. Başvuru damgası `created_at` olamaz: B2C açılıp aylar sonra
  -- başvuran müşteri kuyrukta en eski görünürdü.
  add column b2b_applied_at timestamptz,
  add column b2b_rejected_at timestamptz,
  add column b2b_rejected_by uuid references public.user_profiles (id) on delete set null,
  add column b2b_reject_reason text,
  -- Ret gerekçesi e-postayla müşteriye gider, yani personelin Türkçe cümlesi Fransızca ya da Almanca konuşan birine ulaşır; torba
  -- yalnız makine çevirilerini taşır, orijinal `b2b_reject_reason`da durur. Dil kolonu yok, çünkü operasyon tek dilli ve torbada
  -- olmayan dil için `resolveUserText` orijinale düşer.
  add column b2b_reject_reason_translations jsonb,
  -- Çeviri işi baktı mı. Başarısızlıkta da yazılır (sonsuz retry yok) — bkz. 0027.
  add column b2b_reject_reason_translated_at timestamptz,

  -- Vade (DOMAIN §7): yetkidir, varsayılan KAPALI; admin elle açar. Açık bakiye saklanmaz —
  -- ödenmemiş vadeli siparişlerden türetilir.
  add column credit_enabled boolean not null default false,
  add column credit_limit numeric(10, 2),
  add column payment_term_days int,                  -- boşsa Setting varsayılanı (30)

  add column discount_percent numeric(5, 2),         -- müşteriye genel indirim oranı (DOMAIN §5)
  -- Fiyat grubu üyeliği (0005 price_group künyesi): B2B alt kademesi. `restrict` — üyesi olan
  -- grup sessizce silinmesin; operatör önce müşterileri taşır.
  add column price_group_id uuid references public.price_group (id) on delete restrict,
  add column cod_allowed boolean not null default true, -- kapıda ödeme izni; kötüye kullanımda kapanır

  -- Kanal bazlı pazarlama izni ve GDPR kanıtı (ne zaman, nereden); opt-in, yani anahtar yoksa izin yoktur. Kampanya açık rıza ister
  -- ve sessizliği rıza saymak hukuken yanlıştır.
  add column marketing_consent jsonb not null default '{}'::jsonb,
  /*
    Bildirim türü bazlı ret (anahtar tür adıdır, `feedbackInvite` gibi); `marketing_consent`e konmadı, çünkü oradaki anahtarlar kanal
    adıdır ve değerlendirme daveti operasyonun izin süzgecinde bir kanal gibi görünürdü. Varsayılan bilerek ters, opt-out: davet
    mevcut müşteri ilişkisine dayanır ve gereken rıza değil kolay reddedilebilirliktir; şekil `marketing_consent` ile aynı
    (`{granted, at, source}`).
  */
  add column notification_consent jsonb not null default '{}'::jsonb,
  /*
    Bildirim tercihleri sayfasının oturumsuz anahtarı: izni geri almak vermek kadar kolay olmalı (GDPR) ve `referral_code`
    kullanılamaz, çünkü paylaşılan o kodu gören herkes davet edenin bildirimlerini kapatabilirdi. Süresi bilerek yok, çünkü yıllar
    önceki bir mailin bağı ölmemeli; yetkisi yalnız tercihleri okuyup yazmaktır ve istek üzerine üretilir (`null` = henüz mail
    gitmedi).
  */
  add column notification_token text unique,
  -- Edinim kaynağı — İLK siparişte bir kez yazılır, sonra değişmez.
  add column acquisition_source jsonb,
  add column referred_by uuid references public.user_profiles (id) on delete set null,
  -- `anonymized_at` bir tarihtir, bayrak değil: satır silinmez (sipariş ve fatura kaydı yasal olarak durur), kimliği boşaltılır ve
  -- "ne zaman" sorusu denetimde sorulur. `referral_code` istek üzerine üretilen okunabilir koddur; uuid paylaşmak başka yerlerde
  -- anahtar olan kimliği açığa çıkarırdı.
  add column anonymized_at timestamptz,
  add column referral_code text,

  /*
    WhatsApp bağlama jetonu: müşterinin bize gönderdiği hazır mesajın içinde durur ve webhook hem numaranın sahipliğini hem hesabı
    görür. Güvenlik kodu gibi kısa olamaz, çünkü sorgu jetondan kimliğe gider ve tahmin edilen bir jeton hesabı devralmak olurdu;
    bu yüzden entropisi yüksek, ömrü kısa ve tek kullanımlıktır.
  */
  add column wa_link_token text,
  add column wa_link_expires_at timestamptz,
  -- Jeton ile süresi ayrışamaz: süresiz bir jeton sonsuza dek geçerli olurdu, jetonsuz bir süre
  -- hiçbir şey ifade etmezdi. İkisi birlikte var ya da birlikte yok.
  add constraint user_profiles_wa_link_pair check ((wa_link_token is null) = (wa_link_expires_at is null)),

  /*
    Kimlik çapası "bu numaranın geçmişi kimin" sorusunu cevaplar: yeniden dağıtılan numaranın yeni sahibi OTP'yi meşru alır ve onu
    ayıran tek şey önceden kurulmuş bir sırdır. Çapa ya kanıtlanmış e-posta (`email_anchored_at`, çünkü `email` operatörce elle
    girilmiş olabilir) ya da yedek sızarsa liste çıkmasın diye özetlenen 6 haneli koddur; bekleyen adres satırda durur, çünkü
    doğrulama numaradan kimliğe, kimlikten bekleyen adrese gider.
  */
  add column email_anchored_at timestamptz,
  add column anchor_email text,
  add column anchor_email_at timestamptz,
  add column security_code_hash text,
  -- Yanlış deneme sayacı — tavan 5 (DOMAIN §10). Doğru cevapta sıfırlanır.
  add column security_code_attempts integer not null default 0,
  -- Bekleyen adres ile istendiği an ayrışamaz (jeton çiftiyle aynı gerekçe).
  add constraint user_profiles_anchor_email_pair check ((anchor_email is null) = (anchor_email_at is null)),
  -- **İki çapa aynı müşteride bulunmaz** (DOMAIN §10): e-posta kanıtlandığında kod silinir.
  -- Kural veride duruyor çünkü ihlali sessiz olurdu — iki anahtar taşıyan bir kayıt hata vermez,
  -- yalnız sızacak yüzeyi ve anlatılacak şeyi ikiye katlar.
  add constraint user_profiles_single_anchor check (email_anchored_at is null or security_code_hash is null),

  /*
    Bekleyen kimlik sorusu cevaplanana kadar sürer ve türetilemez: tetiğin ölçütü `customer_phone.last_seen_at` soruyu doğuran
    mesajla tazelenir, soru kendiliğinden kaybolurdu; profilde durur, çünkü korunan şey kimliktir. Sebep saklanır, çünkü
    `delivery_failed` taşıyıcının beyanı, `silence` yalnız bir işarettir ve operatör hangisi olduğunu görmeli.
  */
  add column challenge_reason text,
  add column challenge_raised_at timestamptz,
  add constraint user_profiles_challenge_pair check ((challenge_reason is null) = (challenge_raised_at is null)),
  -- Değer kümesi `ChallengeReasonEnum` (types) ile aynı iki değer; Postgres enum'u açılmadı, çünkü küme şemada büyür ve veri yalnız
  -- yanlışı reddeder.
  add constraint user_profiles_challenge_reason_values check (
    challenge_reason is null or challenge_reason in ('silence', 'delivery_failed')
  ),

  -- Gerekçesiz ret YAZILAMAZ. Ret e-postayla bildiriliyor ve "neden" sorusunun cevabı yoksa soru
  -- desteğe düşer; damgayı atıp gerekçeyi atlamak, verilmiş kararı kayıt dışı bırakır.
  add constraint user_profiles_b2b_reject_stamp check (
    (b2b_rejected_at is null) = (b2b_reject_reason is null)
  );

-- Ret silinmez, eskir: yeniden başvuru damgası ret damgasının önüne geçer, böylece aynı kişinin önceki reddi yeniden başvuruda
-- kaybolmaz.
create or replace function public.stamp_b2b_application() returns trigger
language plpgsql
set search_path = public
as $$
declare
  kunye_degisti boolean;
  ret_yeni boolean;
begin
  -- INSERT'te `old` YOKTUR; dallar `tg_op` ile ayrılır. Tek koşulda `or` ile birleştirmek
  -- güvenli değil — SQL boolean operatörlerinde kısa devre GARANTİSİ yoktur.
  if tg_op = 'INSERT' then
    -- Künyesiyle birlikte açılan profil de bir başvurudur (operatörün müşteri adına girmesi, tohum verisi); damgasız kalsa kuyruk
    -- onu sıralayamazdı.
    kunye_degisti := new.company_info is not null;
    ret_yeni := new.b2b_reject_reason is not null;
  else
    -- Damga yalnız künye değiştiğinde düşer: telefonunu değiştiren reddedilmiş aday kuyruğa dönmemeli. Aynı künyeyle yeniden
    -- göndermek de yeni başvuru değildir, çünkü yeni bilgi taşımaz ve operatörü aynı kararı ikinci kez vermeye çağırır.
    kunye_degisti := new.company_info is not null and new.company_info is distinct from old.company_info;
    ret_yeni := new.b2b_reject_reason is not null and old.b2b_reject_reason is null;
  end if;

  -- Ret damgasını da tetikleyici atar, çünkü iki damga `b2b_pending`te birbiriyle karşılaştırılır ve tek saatten gelmeli: uygulama
  -- ile veritabanı saati arasındaki kayma reddedilmiş adayı kuyruğa geri sokabilirdi.
  if ret_yeni then
    new.b2b_rejected_at := now();
  end if;

  if kunye_degisti and coalesce(new.b2b_approved, false) = false then
    new.b2b_applied_at := now();
  end if;

  return new;
end;
$$;

-- Damgalar uygulamada yazılmaz: başvuruyu yazan ikinci bir yol (operatörün müşteri adına künye girmesi) damgayı unutur ve kuyruk
-- sessizce yanlış sıralanırdı.
create trigger user_profiles_b2b_stamp_trg
  before insert or update on public.user_profiles
  for each row execute function public.stamp_b2b_application();

-- Kaynak metin değişince eski çeviri sessizce yanlış olur; kural bu yüzden kapıya değil veriye konur ve fonksiyon kolon adlarını
-- `tg_argv`den alarak üç tabloda aynı kalır. Burada tanımlı, çünkü ilk kullanan tablo bu ve `create trigger` fonksiyonun o anda
-- var olmasını ister.
create or replace function public.reset_translation_on_text_change() returns trigger
language plpgsql
set search_path = public
as $$
declare
  metin_kolonu text := tg_argv[0];
  torba_kolonu text := tg_argv[1];
  damga_kolonu text := tg_argv[2];
begin
  -- Kolonlara dinamik erişim: `new.<değişken>` plpgsql'de yazılamaz, jsonb köprüsü kullanılır.
  -- `is distinct from` null-güvenlidir — metnin silinmesi de bir değişikliktir.
  if (to_jsonb(new) ->> metin_kolonu) is distinct from (to_jsonb(old) ->> metin_kolonu) then
    new := jsonb_populate_record(new, jsonb_build_object(torba_kolonu, null, damga_kolonu, null));
  end if;
  return new;
end;
$$;

create trigger user_profiles_reject_reason_translation_trg
  before update on public.user_profiles
  for each row
  execute function public.reset_translation_on_text_change(
    'b2b_reject_reason', 'b2b_reject_reason_translations', 'b2b_reject_reason_translated_at'
  );

-- Davet kodu TEKİLDİR — ama yalnız var olanlar arasında (kısmi indeks): kodu olmayan müşteriler
-- birbiriyle çakışamaz. `null`'ları da kapsayan düz bir unique kısıt, Postgres'te çalışırdı ama
-- indeksi gereksiz yere tüm tabloya yayardı.
create unique index user_profiles_referral_code_key
  on public.user_profiles (referral_code)
  where referral_code is not null;

-- Bağlama jetonu TEKİLDİR (kısmi indeks, davet koduyla aynı gerekçe) — ve burada tekillik bir
-- kolaylık değil ZORUNLULUK: webhook satırı jetonla buluyor, iki kayıt aynı jetonu taşısaydı gelen
-- mesaj hangisine bağlanacağını söyleyemezdi. Çakışmada üretici yeniden dener.
create unique index user_profiles_wa_link_token_key
  on public.user_profiles (wa_link_token)
  where wa_link_token is not null;

-- Çeviri kuyruğu: gerekçesi yazılmış ama henüz çevrilmemiş retler.
create index user_profiles_reject_reason_untranslated_idx
  on public.user_profiles (b2b_rejected_at)
  where b2b_reject_reason is not null and b2b_reject_reason_translated_at is null;

-- "Onay bekliyor" üretilmiş kolondur, çünkü kural (künye var, onay yok, ret yok ya da eskimiş) kısmi indeks, kuyruk süzgeci ve
-- `b2bStatusOf` tarafından soruluyor ve tek yerde durmalı. PostgREST kolonu kolonla karşılaştıramadığı için süzgeç de ancak düz bir
-- boolean üzerinden yazılabilir.
alter table public.user_profiles
-- Kolon üç değerli olamaz: reddi olup başvuru damgası olmayan satırda karşılaştırma NULL üretir ve şema (`z.boolean()`) okumada
-- patlar; bu yüzden başvuru damgasının varlığı açıkça sorulur.
  add column b2b_pending boolean generated always as (
    company_info is not null
    and coalesce(b2b_approved, false) = false
    and (b2b_rejected_at is null or (b2b_applied_at is not null and b2b_rejected_at < b2b_applied_at))
  ) stored;

-- B2B onay kuyruğu başvuru sırasıyla okunur; `created_at` profilin doğduğu andır ve B2C açılıp aylar sonra başvuranı listenin
-- dibine gönderirdi.
create index user_profiles_b2b_pending_idx on public.user_profiles (b2b_applied_at desc)
  where b2b_pending;
-- Taslak listesi (birleştirme ekranı).
create index user_profiles_draft_idx on public.user_profiles (created_at desc) where is_draft = true;

-- Adresin coğrafi noktası ve inceliği: kapı eşleşmesi ile belediye merkezi kilometrelerce ayrışabilir, tek bir çiftte eşitlenirse
-- kaba ölçüm kesinmiş gibi okunur. Kademeler BAN'ın kendi dört değerinin aynası, çünkü yeniden adlandırmak bir gün ayrışacak bir
-- eşleme tablosu demek olurdu.
create type public.address_geo_precision as enum ('housenumber', 'street', 'locality', 'municipality');
-- Üç kaynak: Fransız adres servisi (BAN), Google (Almanya) ve insan. Kaynak yaşlanma kuralını belirler: `google` noktası Google
-- politikası gereği 30 günden uzun saklanmaz (`geocode-scan` düşürür), `ban` süresizdir (Licence Ouverte).
create type public.address_geo_source as enum ('ban', 'google', 'manual');

-- `customer_id` = "müşteri rolüyle davranan profil". Kolon adı ticari bağlamda okunur kalsın diye
-- domain dilinde tutulur; işaret ettiği yer tek kimlik tablosudur.
create table public.address (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.user_profiles (id) on delete cascade,
  -- Müşterinin verdiği ad ("Ev", "İş") adres kartının başlığıdır, çünkü iki adres arasında seçen müşteri sokak adıyla değil adıyla
  -- ayırt eder. Boşsa ekran şehri başlık yapar; uydurma etiket yazılmaz.
  label text,
  -- Alıcı adrese giden kişidir, hesap sahibiyle aynı olmak zorunda değil (hediye, iş adresi); kurye kapıda kimi soracağını buradan
  -- bilir. Zorunlu ve varsayılansız: kural veride durmazsa her yeni yazma yolu boş satır üretir, `''` ise "yazılmamış"ı "boş" diye
  -- kaydederdi.
  recipient text not null,
  line1 text not null,
  line2 text,
  postal_code text not null,
  city text not null,
  -- Teslimat telefonu adrese aittir, hesaba değil: hediye adresinde aranacak numara alıcınınkidir. Biçim E.164'e istemcide
  -- (`normalizePhone`) indirgenir ve kısıt yalnız numaranın varlığını zorlar, çünkü adres defteri biçim yüzünden reddetmez.
  phone text not null,
  country country_code not null default 'FR',
  -- Checkout'un önceden seçtiği adres; TEKİLDİR (yenisi seçilince eskisi düşer).
  is_default boolean not null default false,
  -- Fatura adresi işletmenin künye adresidir ve `is_default`ten ayrı bir roldür, çünkü "mal nereye" ile "fatura kime ve nereye" ayrı
  -- sorulardır. Çoğu küçük işletmede ikisi aynı satırdır; tekil bir `kind` kolonu aynı adresi bir gün ayrışacak iki satıra bölerdi.
  is_billing boolean not null default false,
  created_at timestamptz not null default now(),

  -- Nokta boş olabilir: adres defteri hiçbir hâlde reddetmez ve koordinat ağın öbür ucunda çözülür. Noktasız adres "sıralanamadı"
  -- der, sıfıra düşmez.
  lat numeric(9, 6),
  lng numeric(9, 6),
  geo_precision address_geo_precision,
  geo_source address_geo_source,
  -- ÖLÇÜMÜN anı (nokta yazıldığı an) ile son DENEME anı ayrı sorular: ikincisi taramanın frenidir.
  geo_at timestamptz,
  geo_checked_at timestamptz,
  -- Servisin kaç kez "eşleşme yok" dediği; yalnız cevaplı ret sayılır, çünkü geçici arızayı (`unavailable`/`rate_limited`) saymak
  -- servisin düştüğü bir günde yüzlerce adresi kalıcı olarak çözülemez yapardı. Böylece yanlış yazılmış adres ile düşük servis ayrı
  -- kalır ve ayrı bir `geo_status` kolonu gerekmez.
  geo_attempts int not null default 0,

  -- Servisin başka posta kodunda bulduğu kapının tam etiketi; doluysa adres yanlış kodda demektir ve metin servisin kendi yazımıyla
  -- ekrana basılır. Aynı zamanda "uyarıldı ama düzeltmedi" kaydıdır: teklif kabul edilirse adres değişir ve etiket temizlenir,
  -- reddedilirse kalır.
  geo_alt_label text,

  -- İkisi birlikte var ya da birlikte yok (`postal_code_place_point` emsali): tek başına enlem bir
  -- nokta değildir.
  constraint address_geo_point check ((lat is null) = (lng is null)),
  -- Kapı DOĞRULANMIŞKEN düzeltme önerisi taşıyan satır bir ÇELİŞKİDİR: ekran aynı anda hem "adres
  -- doğru" hem "şunu mu demek istediniz" derdi. `wrong_postal_code` hâlinde satırın kendi inceliği
  -- zaten `housenumber` DEĞİLDİR (kısıtlı arama kapıyı bulamamıştır) — kısıt o değişmezi çiviliyor.
  constraint address_geo_alt check (geo_alt_label is null or geo_precision is distinct from 'housenumber'),
  -- Kaynağı olan ama noktası olmayan satır yasak: yazma yolunun yarım kaldığını gösterir ve sessizce çözülmüş gibi okunurdu.
  constraint address_geo_meta check (
    lat is not null or (geo_precision is null and geo_source is null and geo_at is null)
  )
);
-- `in_route` saklanmaz: posta kodunun aktif bir teslimat bölgesine düşmesinden türetilir.

-- Taramanın kuyruğu — çözülmüş satırlar indekse hiç girmez (çoğunluk oradadır).
-- Eşik (`geo_attempts < N`) yükleme YAZILMAZ: indeks yüklemi değişmez olmalı ve eşik parametrik
-- kalmalı; süzgeç sorgunun kendisinde.
create index address_geo_pending_idx on public.address (geo_checked_at nulls first) where lat is null;

create index address_customer_idx on public.address (customer_id);

-- Müşteri başına tek varsayılan adres kuralı veride durur: uygulamadan geçmeyen her yazım (tohum, düzeltme betiği, içe alma) onu
-- sessizce kırar ve checkout iki varsayılandan birini sıralamaya göre seçerdi. Kısmi indeks, çünkü tekillik yalnız işaretlilere
-- aittir; `setExclusiveFlag` önce temizler sonra işaretler, ters sıra bir an iki işaretli satır üretirdi.
create unique index address_one_default_per_customer
  on public.address (customer_id)
  where is_default;

-- Fatura adresi de tekildir ve aynı gerekçeyle kısmi: bir hesabın faturası tek adrese kesilir, iki işaretli satır ise okuyan her
-- ucu kendi yedeğini uydurmaya iterdi.
create unique index address_one_billing_per_customer
  on public.address (customer_id)
  where is_billing;

alter table public.address enable row level security;

alter table public.price add constraint price_customer_fk
  foreign key (customer_id) references public.user_profiles (id) on delete cascade;
