-- Modül 04 — Kimlik dilimi: TEK kullanıcı profili tablosu + rol (referans proje deseni: user_profiles).
-- Müşteri de bir ROLDÜR — ayrı tablo yok; personel rolleri aynı enum'da. Çok-rol YOK (kullanıcı tek rol).
-- Kapsam bilinçli dar: auth'un (bul-veya-oluştur, bağlama, guard, ilk admin) ihtiyacı olan alanlar.
-- Kredi/pazarlama/şirket alanları ilgili modüllerin migration'larında eklenir.
-- Erişim modeli: tüm okuma/yazma sunucudan service_role ile; RLS deny-by-default (savunma katmanı).

-- Roller. `customer` MÜŞTERİ eksenidir, diğerleri OPERASYON rolleridir (bkz. aşağıdaki kısıt).
create type user_role as enum ('customer', 'admin', 'warehouse', 'courier', 'accounting');
create type customer_type as enum ('individual', 'company');
create type preferred_language as enum ('tr', 'fr', 'de');
create type country_code as enum ('FR', 'DE');

-- ============================================================================
-- user_profiles — her kimlik (müşteri + personel) tek tabloda; ROL ayırır (customer varsayılan).
-- auth_user_id NULLABLE: taslak müşteri (WhatsApp/manuel, DOMAIN §10) auth'suz açılır, girişte bağlanır.
-- Personel her zaman auth'ludur. İlk giriş yapan hesap trigger'la admin olur (0002).
--
-- ROL MODELİ (karar 27.07, kullanıcı): iki eksen, tek alan.
--   • Müşteri ↔ personel **keskin ayrımdır**: aynı kişi ikisi birden OLAMAZ.
--   • Personel içinde **çoklu rol** olağandır: depo + muhasebe aynı kişide, patron aynı zamanda admin.
-- Bu yüzden `roles` bir dizidir ve kısıt `customer`ın yalnız BAŞINA durmasını zorlar. Diziyi ayrı
-- bir bağ tablosuna çıkarmadık: rol okuması guard'ın sıcak yoludur (her korumalı istekte), dizi tek
-- satırda gelir; bağ tablosu her istekte join demekti.
-- ============================================================================

create table public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  roles user_role[] not null default '{customer}',
  type customer_type not null default 'individual',
  name text not null default '',
  email text,
  -- İLETİŞİM numarası (E.164 normalize) — kimlik anahtarı DEĞİL (04.10, 0001). Serbest metinden
  -- yazılır (hesap kartı, misafir checkout) ve kimlik çözümünde HİÇ okunmaz; doğrulanmış numara
  -- `customer_phone` satırında yaşar. Benzersiz de değil: aile telefonu meşru bir hâldir.
  phone text,
  preferred_language preferred_language not null default 'fr',
  country country_code not null default 'FR',
  -- ROLÜN İKİNCİ EKSENİ: ne yapar (`roles`) × NEREDE yapar (DOMAIN §17). `roles` ile aynı karar,
  -- aynı gerekçe — kapsam okuması guard'ın sıcak yolunda, bağ tablosu her istekte join demekti.
  -- FK YOK (dizi kolonda zaten kurulamaz): `warehouse` 0031'de açılır, kısıt orada tetikleyiciyle.
  -- **BOŞ DİZİ = HİÇBİR DEPO**, "hepsi" değil (fail-closed): depocu/kurye kapsamsız kalırsa kapı
  -- kapanır, sessizce tüm depolara açılmaz. Admin/muhasebe depo-ÜSTÜdür, kapsamı hiç okunmaz.
  warehouse_ids uuid[] not null default '{}',
  auth_user_id uuid unique references auth.users (id) on delete set null,
  b2b_approved boolean,                         -- B2B self-servis onayı; B2C/personel'de null
  is_draft boolean not null default false,      -- WhatsApp/manuel taslak; doğrulanınca false
  created_at timestamptz not null default now()
);

-- E-posta benzersiz (dolu olduğunda). Bul-veya-oluştur buna dayanır.
create unique index user_profiles_email_key on public.user_profiles (lower(email)) where email is not null;
-- ⚠ `user_profiles_phone_key` KALDIRILDI (04.10). Kaldıran şey bir gevşetme değil, indeksin
-- neye hizmet ettiğinin düzeltilmesiydi: bu kolon doğrulanmadan yazılıyor, dolayısıyla indeks
-- "kimlik anahtarı" değil "bu dizeyi ilk yazan sahiplendi" kuralını zorluyordu. Doğrulanmış numaranın
-- tekilliği artık `customer_phone_active_key`de ve orada doğru soruyu soruyor. Yan sonuç kazanç:
-- aynı iletişim numarasını taşıyan iki müşteri (aile telefonu, işyeri hattı) artık meşru.
-- Rol kümesi kuralı DB'de zorlanır: uygulama unutsa da geçmez.
-- `cardinality` kullanılır, `array_length` DEĞİL: boş dizide array_length NULL döner ve NULL'a
-- düşen bir CHECK "ihlal edilmedi" sayılır — kısıt sessizce delinirdi.
alter table public.user_profiles add constraint user_profiles_roles_not_empty check (cardinality(roles) >= 1);
alter table public.user_profiles add constraint user_profiles_roles_exclusive
  check (not ('customer' = any (roles)) or cardinality(roles) = 1);

-- "Bu role sahip herkes" sorgusu (personel listesi, kurye ataması) — dizi araması GIN ister.
create index user_profiles_roles_idx on public.user_profiles using gin (roles);

-- RLS deny-by-default: politika tanımlanmadıkça anon/authenticated satır göremez; erişim service_role ile.
alter table public.user_profiles enable row level security;

-- ============================================================================
-- customer_phone — KİMLİK ANAHTARI: doğrulanmış telefon numarası (04.10). DOMAIN §10.
--
-- ── AÇIK NEYDİ ──────────────────────────────────────────────────────────────
-- `user_profiles.phone` iki işi birden yapıyordu: **iletişim numarası** (hesap kartından ve misafir
-- checkout formundan serbest metin olarak yazılır) ve **kimlik anahtarı** (yukarıda kaldırılan
-- `user_profiles_phone_key` + bul-veya-oluştur onun üstünde duruyordu). İki iş tek kolonda olunca
-- doğrulanmamış bir dize kimlik kurmaya yetiyordu:
--
--   • **Önceden sahiplenme.** Henüz kayıtlı olmayan bir numarayı formuna yazan kişi onu kilitler.
--     Gerçek sahibi WhatsApp'tan yazdığında `resolveIdentity` konuşmayı o yabancı hesaba bağlar —
--     sonrasında siparişi ve puanı da orada görünür. Sahibi kendi numarasına ulaşamaz (unique
--     indeks + self-servis geri alma yok), her vaka admin birleştirmesine düşer.
--     En sık hâli kötü niyet değil KAZA: eşin/işyerinin numarası, tuşlama hatası, aile telefonu.
--
--   • **Devredilmiş hat.** Operatör karantina süresi dolan numarayı yeniden dağıtır; yeni sahibi
--     WhatsApp'tan yazınca önceki kişinin geçmişini devralır. Kolon modelinde bunun kaydı da yok:
--     "emekliye ayırmak" `null`'lamaktır — o numaranın bir zamanlar kime ait olduğu silinir.
--
-- ── AYRIM ───────────────────────────────────────────────────────────────────
-- DOMAIN §10: *"Doğrulanmamış numara anahtar olmaz. Formdan gelen numara yalnız İLETİŞİM
-- numarasıdır."*
--   `user_profiles.phone`  → iletişim numarası. Serbest metin, benzersiz DEĞİL, kimlik çözümünde
--                            HİÇ okunmaz. Asıl işi adres formunun ön-doldurması (`addressDefaultsOf`).
--   `customer_phone`       → kimlik anahtarı. Satırın VARLIĞI zilyetlik kanıtıdır.
--
-- ── SATIR VARSA DOĞRULANMIŞTIR ──────────────────────────────────────────────
-- `verified_at` nullable DEĞİL ve bu kasıtlı: doğrulanmamış numaranın burada satırı olmaz. Nullable
-- bıraksaydık tablo yine iki işi birden yapardı — kolon modelinin aynı hatası, bir tablo ötede.
-- Bugünkü tek yazıcı imzası doğrulanmış Meta webhook'udur (15.7): o numaradan gelen mesaj, "bu hattı
-- bugün elimde tutuyorum" demektir. Operatörün elle yazdığı numara buraya YAZILMAZ — klavyeden
-- geçmek kanıt değildir.
--
-- **Kanıtın sınırı da yazılı:** zilyetlik gerçektir, BAĞ bayat olabilir. Bu tablo "bu numara bugün
-- kimde" sorusunu cevaplar, "bu numaranın geçmişi kimin" sorusunu değil. İkincisini çapa cevaplar
-- (e-posta ya da 6 haneli kod) ve o 04.10'un ikinci yarısıdır.
--
-- ── NEDEN BURADA, KENDİ MIGRATION'INDA DEĞİL ────────────────────────────────
-- Tablo bir tur `0049` olarak yazıldı ve **koşmadı**: `0040`ın `preview_customer_merge`i (SQL
-- gövdeli, yani oluşturulurken doğrulanan bir fonksiyon) bu tabloyu okuyor ve 0040, 0049'dan önce
-- koşuyor. Ölçüldü — `db:refresh` orada kesildi. Yeri zaten burasıydı: kimlik anahtarı, kimliğin
-- tanımlandığı migration'da ve kaldırılan indeksin hemen altında durunca ayrım tek okumada görünüyor.
--
-- ── BİR NUMARA EN ÇOK BİR AKTİF HESABA ÇIKAR ───────────────────────────────
-- Ürün tercihi değil zorunluluk: gelen mesajı tek bir müşteriye çözemezsek her mesaj cevapsız bir
-- soruya döner. Kısıt `retired_at is null` süzgeçli — emekliye ayrılan satır DURUR (geçmiş silinmez)
-- ama yeni sahibine yol açar. Devredilmiş hattın çözümü tam olarak budur; kolon modelinde aynı şey
-- ancak eski bağı silerek yapılabiliyordu.
--
-- **Ters yön (bir hesap kaç numara taşır) BİLEREK AÇIK** — DOMAIN §10, kullanıcı kararı ertelendi.
-- Meşru çok-numara halleri var (kişisel + işyeri, FR + TR hattı — diasporada yaygın). Yapı iki
-- seçeneği de taşıyor: tavan gerekince `setting` ile konur, şema değişmez.
--
-- ── `retired_at`ın BUGÜN YAZICISI YOK ───────────────────────────────────────
-- Kolon yapısaldır: aşağıdaki kısmi unique indeks onsuz kurulamaz ve indekssiz tablo aynı numarayı
-- iki hesaba bağlardı. Emekliye ayıran yol (3 ay sessizlik · taşıyıcının `failed` beyanı — DOMAIN
-- §10) 04.10'un devamında yazılıyor; gerekçe kolonu (`retired_reason`) o gün, YAZICISIYLA BİRLİKTE
-- doğar — bugün eklenseydi hiçbir zaman dolmayan bir alan olurdu.
-- ============================================================================

create table public.customer_phone (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.user_profiles (id) on delete cascade,
  -- E.164 normalize; `conversation.external_ref` ile AYNI dizeyi taşır (0039) — biri normalize
  -- edilip öteki edilmezse aynı kişi iki anahtarla iki kez görünür.
  phone        text not null,
  -- Zilyetliğin KANITLANDIĞI an. Satır varsa dolu (bkz. künye).
  verified_at  timestamptz not null default now(),
  -- Bu numaradan en son ne zaman mesaj geldi — sessizlik tetiğinin (DOMAIN §10, ~3 ay) ölçütü.
  -- Doğrulama anıyla aynı başlar; her gelen mesajda tazelenir.
  last_seen_at timestamptz not null default now(),
  -- Taşıyıcının SON beyanı: bu numaraya ulaşılamadı (`failed`). ERKEN tetik (DOMAIN §10) — sessizliği
  -- beklemenin anlamı yok, bağ zaten şüpheli. Tahmin değil beyan olduğu için ayrı kolonda duruyor.
  -- Soru SORULDUĞUNDA temizlenir: sinyal orada bekleyen bir soruya dönüşmüştür, iki kez sayılmaz.
  delivery_failed_at timestamptz,
  -- Emeklilik: bağ koptu (hat devredildi / taşıyıcı `failed` dedi). Satır SİLİNMEZ.
  retired_at   timestamptz,
  created_at   timestamptz not null default now()
);

-- Bir numara en çok bir AKTİF hesaba çıkar. Emekli satırlar süzgecin dışında: geçmiş durur.
create unique index customer_phone_active_key
  on public.customer_phone (phone) where retired_at is null;

-- "Bu müşterinin numaraları" — kimlik çözümünün ters yönü (müşteri kartı, sohbet paneli, hesap ekranı).
create index customer_phone_customer_idx
  on public.customer_phone (customer_id) where retired_at is null;

-- RLS deny-by-default: politika yok → anon/authenticated hiçbir satır göremez. Numara listesi
-- müşteri yüzeyine HİÇ açılmaz — "şu numara kimde" bir kimlik sorusudur.
alter table public.customer_phone enable row level security;

comment on table public.customer_phone is
  'Kimlik anahtarı: DOĞRULANMIŞ telefon numarası (DOMAIN §10). Satırın varlığı zilyetlik kanıtıdır; '
  'user_profiles.phone yalnız iletişim numarasıdır ve kimlik çözümünde okunmaz.';
comment on column public.customer_phone.verified_at is
  'Zilyetliğin kanıtlandığı an (imzalı webhook''tan gelen mesaj). Satır varsa doludur.';
comment on column public.customer_phone.last_seen_at is
  'Bu numaradan gelen SON mesajın anı — sessizlik tetiğinin ölçütü.';
comment on column public.customer_phone.delivery_failed_at is
  'Taşıyıcı bu numaraya ulaşamadı (`failed`) — kimlik şüphesinin ERKEN tetiği. Soru sorulunca temizlenir.';
comment on column public.customer_phone.retired_at is
  'Bağ koptu (hat devri / taşıyıcı beyanı). Satır silinmez; numara yeni sahibine açılır.';

-- ─── "Bu numara şu an görüldü" ───────────────────────────────────────────────
-- Damgayı **veritabanının saati** yazar, uygulamanınki değil. Küçük görünen ama gerçek bir kusuru
-- kapatıyor: `verified_at` ve `last_seen_at` satır doğarken kolon varsayılanından (yani DB saatinden)
-- geliyor; tazeleme uygulamadan `new Date()` ile yazılsaydı iki AYRI saat karışırdı ve aralarındaki
-- kayma kadar **`last_seen_at` GERİYE gidebilirdi**.
--
-- ÖLÇÜLDÜ (25.08): tam pakette test düştü — ilk kanıt 1787685288518, tazelenmiş hâli 1787685288508.
-- 10 milisaniye; ama sessizlik tetiği (~3 ay, DOMAIN §10) tam olarak bu damgadan hesaplanacak ve
-- geriye giden bir damga o hesabı bozar. Testin yakaladığı şey bir kararsızlık değil, iki saatti.
--
-- Emekli satır TAZELENMEZ (`retired_at is null` süzgeci): bağı kopmuş bir numaranın "hâlâ canlı"
-- damgası, emekliliğin kendisini görünmez kılardı.
create or replace function public.touch_customer_phone(p_id uuid)
returns setof public.customer_phone
language sql
security definer
set search_path = public
as $$
  update public.customer_phone
     set last_seen_at = now()
   where id = p_id and retired_at is null
  returning *;
$$;

revoke all on function public.touch_customer_phone(uuid) from public, anon, authenticated;
grant execute on function public.touch_customer_phone(uuid) to service_role;

comment on function public.touch_customer_phone(uuid) is
  'Kanıt satırının son görülme damgasını DB saatiyle tazeler (04.10). Emekli satıra dokunmaz.';

-- ─── "Taşıyıcı ne dedi" ──────────────────────────────────────────────────────
-- Giden mesajın durum olayı (`failed` / `delivered`) → numaranın kimlik künyesi. **Numara ile
-- çağrılır, satır kimliğiyle değil:** taşıyıcının elinde bizim satır kimliğimiz yok, `recipient_id`
-- var — arada bir okuma yapmamak için kapı numarayı kabul ediyor.
--
-- Tek deyim, tek tur: `failed` damgayı basar, başarılı teslim onu SİLER. Silme önemli — taşıyıcının
-- sonraki başarılı teslimi, önceki başarısızlığı gerçekten çürütür; bayat kalan bir damga her
-- dönüşte gereksiz bir kimlik sorusu doğururdu (DOMAIN §10: "cezalandırdığı kitlenin ezici
-- çoğunluğu kendi müşterilerimiz olur").
--
-- Emekli satır güncellenmez: bağı kopmuş numaranın teslim durumu artık kimsenin kimliği değil.
create or replace function public.mark_customer_phone_delivery(p_phone text, p_failed boolean)
returns setof public.customer_phone
language sql
security definer
set search_path = public
as $$
  update public.customer_phone
     set delivery_failed_at = case when p_failed then now() else null end
   where phone = p_phone and retired_at is null
  returning *;
$$;

revoke all on function public.mark_customer_phone_delivery(text, boolean) from public, anon, authenticated;
grant execute on function public.mark_customer_phone_delivery(text, boolean) to service_role;

comment on function public.mark_customer_phone_delivery(text, boolean) is
  'Taşıyıcının teslim beyanını numaranın kimlik künyesine yazar (04.10): failed damgalar, başarılı teslim siler.';
