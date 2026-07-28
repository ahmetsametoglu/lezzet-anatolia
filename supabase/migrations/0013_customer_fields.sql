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
  add column referred_by uuid references public.user_profiles (id) on delete set null;

-- B2B onay kuyruğu (onaylanana dek toptan fiyat görünmez — DOMAIN §10).
create index user_profiles_b2b_pending_idx on public.user_profiles (created_at desc) where b2b_approved = false;
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

-- Müşteriye özel fiyat satırı (0006'da FK'siz açılmıştı — kimlik tablosu hazır, bağ kuruldu).
alter table public.price add constraint price_customer_fk
  foreign key (customer_id) references public.user_profiles (id) on delete cascade;
