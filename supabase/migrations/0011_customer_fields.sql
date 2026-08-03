-- Modül 04 — Müşterinin ticari alanları + adres. DOMAIN §10 (kimlik), §7 (vade/kapıda), §5 (indirim).
--
-- **Ayrı `customer` tablosu YOKTUR.** Müşteri bir ROLDÜR: kimlik (müşteri + personel) tek tabloda,
-- `user_profiles`'ta yaşar (0001). Kimlik anahtarları (telefon/e-posta/auth bağı) ve tekillik
-- indeksleri orada; burada yalnız **müşteri rolüyle davranan** profilin ticari alanları eklenir —
-- 0001'in planladığı gibi ("kredi/pazarlama/şirket alanları ilgili modüllerin migration'larında").
--
-- Neden bölmedik: alanların hepsi küçük skaler, satır dar; güvenlik sınırı bizde tabloda değil
-- (her okuma sunucudan service_role + guard'dan geçer, RLS ikinci hat). 1:1 uzantı tablosu her
-- sepet/checkout okumasına bir join ekler, bul-veya-oluştur'a ikinci satır, birleştirmeye ikinci taşıma.

alter table public.user_profiles
  -- Doluysa B2B. Kanal (b2b/b2c) SAKLANMAZ, bunun varlığından türetilir (DATA_MODEL türetme ilkesi).
  add column company_info jsonb,
  add column vat_number text,                        -- AB vergi no (Alman USt-IdNr) — reverse charge
  add column vat_number_valid boolean,               -- VIES doğrulaması; null = hiç sorulmadı

  -- ── B2B başvurusunun ZAMAN EKSENİ (08.7 · 09.11) ─────────────────────────────────────────────
  -- `b2b_approved` iki hâl taşıyor ama başvurunun ÜÇ hâli var: bekliyor · onaylandı · reddedildi.
  -- Ret de `false` bıraktığı için (09.11: "ret SİLMEZ, kayıt B2C olarak kalır") "sırasını bekliyor"
  -- ile "bakıldı, olmadı" veride ayrışmıyordu; ekran reddedilen adaya hiç gelmeyecek bir cevabı
  -- beklediğini söylüyordu. Üçüncü hâl bir enum'la DEĞİL, damgalarla ayrılır: enum yalnız "hangi
  -- hâl"i söyler, damga "ne zaman ve neden"i de söyler — ve onay kartının istediği zaten bu.
  --
  -- Başvuru damgası. `created_at` bu işi GÖREMEZ: o profilin doğduğu andır ve B2C olarak açılıp
  -- aylar sonra B2B'ye başvuran müşteride kuyruğu yanlış sıralar (bugünkü başvuru en eski görünür).
  add column b2b_applied_at timestamptz,
  add column b2b_rejected_at timestamptz,
  add column b2b_rejected_by uuid references public.user_profiles (id) on delete set null,
  add column b2b_reject_reason text,

  -- Vade (DOMAIN §7): yetkidir, varsayılan KAPALI; admin elle açar. Açık bakiye saklanmaz —
  -- ödenmemiş vadeli siparişlerden türetilir.
  add column credit_enabled boolean not null default false,
  add column credit_limit numeric(10, 2),
  add column payment_term_days int,                  -- boşsa Setting varsayılanı (30)

  add column discount_percent numeric(5, 2),         -- müşteriye genel indirim oranı (DOMAIN §5)
  add column cod_allowed boolean not null default true, -- kapıda ödeme izni; kötüye kullanımda kapanır

  -- Kanal bazlı pazarlama izni + GDPR kanıtı (ne zaman, nereden). Faz 1'de yalnız toplanır.
  add column marketing_consent jsonb not null default '{}'::jsonb,
  -- Edinim kaynağı — İLK siparişte bir kez yazılır, sonra değişmez.
  add column acquisition_source jsonb,
  add column referred_by uuid references public.user_profiles (id) on delete set null,

  -- Gerekçesiz ret YAZILAMAZ. Ret e-postayla bildiriliyor ve "neden" sorusunun cevabı yoksa soru
  -- desteğe düşer; damgayı atıp gerekçeyi atlamak, verilmiş kararı kayıt dışı bırakır.
  add constraint user_profiles_b2b_reject_stamp check (
    (b2b_rejected_at is null) = (b2b_reject_reason is null)
  );

-- Ret ASLA silinmez, ESKİR: yeniden başvuru damgası ret damgasının önüne geçer. Ret alanlarını
-- temizleseydik 09.11'in istediği geçmiş ("aynı kişi yarın yeniden başvurursa bilelim") ilk yeniden
-- başvuruda kaybolurdu — tam da geçmişi bilmenin işe yaradığı yerde.
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
    -- Künyesiyle birlikte AÇILAN profil de bir başvurudur (operatörün müşteri adına girmesi,
    -- tohum verisi). İlk yazımda tetikleyici yalnız UPDATE'te koşuyordu ve bu satırlar hiç damga
    -- almıyordu: kuyruk onları sıralayamıyor, ret damgası konunca da hâlleri belirsizleşiyordu.
    kunye_degisti := new.company_info is not null;
    ret_yeni := new.b2b_reject_reason is not null;
  else
    -- Damga KÜNYE DEĞİŞTİĞİNDE düşer, her profil güncellemesinde değil: telefonunu değiştiren
    -- reddedilmiş bir aday sırf o yüzden kuyruğa geri dönmemeli.
    --
    -- Aynı künyeyle ikinci kez başvurmak da yeni bir başvuru değildir: reddedilen şey aynı bilgi.
    -- Adayın yapması gereken künyeyi DÜZELTMEK; formu değiştirmeden yeniden göndermek yeni bilgi
    -- taşımaz, yalnız operatörü aynı kararı ikinci kez vermeye çağırır.
    kunye_degisti := new.company_info is not null and new.company_info is distinct from old.company_info;
    ret_yeni := new.b2b_reject_reason is not null and old.b2b_reject_reason is null;
  end if;

  -- **Ret damgasını da tetikleyici atar** ve sebebi "unutulmasın"dan fazlası: iki damga
  -- BİRBİRİYLE KARŞILAŞTIRILIYOR (`b2b_pending`). Biri uygulamanın saatinden, öteki
  -- veritabanınınkinden gelseydi aradaki kayma reddedilmiş bir adayı kuyruğa geri sokabilir ya da
  -- taze bir başvuruyu reddedilmiş gösterebilirdi. Karşılaştırılan iki değer tek saatten gelmeli.
  if ret_yeni then
    new.b2b_rejected_at := now();
  end if;

  if kunye_degisti and coalesce(new.b2b_approved, false) = false then
    new.b2b_applied_at := now();
  end if;

  return new;
end;
$$;

-- Damgalar UYGULAMADA yazılmaz: bugün başvuruyu yazan tek yol var, ama yarın ikincisi açılırsa
-- (operatörün müşteri adına künye girmesi) o yol damgayı unutur ve kuyruk sessizce yanlış sıralanır.
-- Kural veride durur (CLAUDE §1).
create trigger user_profiles_b2b_stamp_trg
  before insert or update on public.user_profiles
  for each row execute function public.stamp_b2b_application();

-- "Onay bekliyor" hâli — ÜRETİLMİŞ kolon, çünkü kuralın tek bir yerde durması gerekiyor.
--
-- Kural şu: künyesi var + onaylanmamış + (hiç reddedilmemiş VEYA reddi eskimiş). Üç ayrı yer bunu
-- sormak zorunda: kısmi indeks, kuyruk süzgeci ve başvuru durumu (`b2bStatusOf`). Üçüne ayrı ayrı
-- yazılsaydı biri bir gün ötekilerden ayrışırdı — hem de sessizce, çünkü "reddedilen kuyrukta
-- görünüyor" bir hata mesajı vermez, yalnız yanlış bir liste üretir.
--
-- Ayrıca uygulama bunu SÜZGEÇ olarak soramıyordu: PostgREST kolon-kolona karşılaştırma yazamaz
-- (`b2b_rejected_at=lt.b2b_applied_at` sağ tarafı düz metin sanar). Üretilmiş kolon düz bir boolean
-- verdiği için süzgeç de indeks de sıradan hâle geliyor.
alter table public.user_profiles
-- **Üç değerli olamaz.** İlk yazımda son koşul `b2b_rejected_at is null or b2b_rejected_at <
-- b2b_applied_at` idi ve reddi olup başvuru damgası olmayan satırda `false or NULL` = **NULL**
-- üretiyordu. Kolon null dönünce şema (`z.boolean()`) her okumada patlıyordu — hata, sessiz bir
-- yanlış listeden iyidir ama bu kolonun tek işi soruya EVET/HAYIR demek: "bilinmiyor" bir cevap
-- değil. Başvuru damgasının varlığı açıkça sorularak karşılaştırma iki dolu değere indirildi.
  add column b2b_pending boolean generated always as (
    company_info is not null
    and coalesce(b2b_approved, false) = false
    and (b2b_rejected_at is null or (b2b_applied_at is not null and b2b_rejected_at < b2b_applied_at))
  ) stored;

-- B2B onay kuyruğu (onaylanana dek toptan fiyat görünmez — DOMAIN §10).
--
-- Sıralama `b2b_applied_at`: kuyruk BAŞVURU sırasına göre okunur. `created_at` profilin doğduğu
-- andır ve B2C açılıp aylar sonra başvuran müşteriyi listenin dibine gönderirdi.
create index user_profiles_b2b_pending_idx on public.user_profiles (b2b_applied_at desc)
  where b2b_pending;
-- Taslak listesi (birleştirme ekranı).
create index user_profiles_draft_idx on public.user_profiles (created_at desc) where is_draft = true;

-- `customer_id` = "müşteri rolüyle davranan profil". Kolon adı ticari bağlamda okunur kalsın diye
-- domain dilinde tutulur; işaret ettiği yer tek kimlik tablosudur.
create table public.address (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.user_profiles (id) on delete cascade,
  -- Müşterinin kendi verdiği ad ("Ev", "İş", "Annem"). Checkout adres kartının başlığı budur:
  -- iki adres arasında seçim yapan müşteri sokak adını okuyarak değil, adıyla ayırt eder.
  -- Boş bırakılabilir — o zaman ekran şehri başlık yapar, uydurma bir etiket yazılmaz.
  label text,
  -- Alıcı: adrese GİDEN kişi. Hesap sahibiyle aynı olmak ZORUNDA DEĞİL — hediye gönderimi, iş
  -- adresi, aile büyüğüne sipariş. Kurye kapıda kimi soracağını buradan bilir; hesabın adını
  -- kullanmak "Ayşe'nin siparişi" yazan bir paketi annesinin kapısına götürmek olurdu.
  recipient text,
  line1 text not null,
  line2 text,
  postal_code text not null,
  city text not null,
  -- Teslimat telefonu — ADRESE aittir, hesaba değil (`user_profiles.phone` hesabın numarasıdır).
  -- Kapıya teslimde kurye zili çalmadan önce arar; hediye adresinde aranacak numara müşterinin
  -- kendi numarası değil, alıcınınkidir. Tek numara tutulsaydı bu iki hâl birbirini ezerdi.
  phone text,
  country country_code not null default 'FR',
  -- Checkout'un önceden seçtiği adres; TEKİLDİR (yenisi seçilince eskisi düşer).
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
-- `in_route` SAKLANMAZ: posta kodunun aktif bir DeliveryZone'a düşmesinden türetilir (modül 07).

create index address_customer_idx on public.address (customer_id);

alter table public.address enable row level security;

-- Müşteriye özel fiyat satırı (0005'te FK'siz açılmıştı — kimlik tablosu hazır, bağ kuruldu).
alter table public.price add constraint price_customer_fk
  foreign key (customer_id) references public.user_profiles (id) on delete cascade;
