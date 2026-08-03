-- Posta kodu talebi — "nereye getirelim" sorusunun işletme tarafındaki karşılığı (K33).
--
-- Müşteriye teslimat yerini sormamızın BİRİNCİ sebebi ona ne gönderebileceğimizi söylemek; ikincisi
-- burada: hangi posta kodlarından talep geldiğini bilmek, teslimat bölgesini nereye genişleteceğimize
-- dair tek gerçek sinyaldir. Bugün rota dışı kalan bir kod yarın bir rotanın gerekçesi olur.
--
-- **YALNIZ TOPLU SAYAÇ.** Ziyaretçi kimliği, oturum, IP ya da e-posta BURAYA YAZILMAZ ve tablo buna
-- yer bırakmaz. Talep sinyali için kim olduğu gereksiz; kaydetmek ise kişisel veri yükünü hiçbir
-- karşılık almadan üstlenmek olurdu. Kod başına tek satır, tek sayı.
--
-- Bölge içi kodlar da sayılır: talebin nerede yoğunlaştığı rota planlamasının (gün/sıklık) girdisidir.

create table public.postal_code_demand (
  -- Kodun kendisi anahtar: normalize edilmiş hâliyle yazılır (boşluksuz, büyük harf).
  postal_code text primary key,
  -- Kaç kez soruldu. Aynı ziyaretçinin tekrar sorması ayrı sayılır ve bu bilinçli: tekilleştirmek
  -- için kimlik tutmak gerekirdi, tutmuyoruz. Sayı mutlak bir "kişi" değil, ilgi yoğunluğudur.
  request_count integer not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.postal_code_demand enable row level security;

-- Bölge dışı talebi sıralamak için: en çok sorulan koda inen okuma (operasyon → analitik).
create index postal_code_demand_count_idx on public.postal_code_demand (request_count desc);

/**
 * Sayacı bir artır. Fonksiyon olmasının sebebi ATOMİKLİK: okuyup-yazan iki adımlı bir güncelleme,
 * aynı anda gelen iki istekte birini kaybeder. `on conflict` tek turda çözer.
 *
 * Karar VERMEZ (STACK §4): rota içi mi, bölge açılmalı mı — hiçbirini bilmez, yalnız sayar.
 */
create or replace function public.record_postal_code_demand(p_postal_code text)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  insert into public.postal_code_demand as d (postal_code, request_count)
  values (upper(regexp_replace(p_postal_code, '\s', '', 'g')), 1)
  on conflict (postal_code) do update
    set request_count = d.request_count + 1,
        last_seen_at = now();
$$;
