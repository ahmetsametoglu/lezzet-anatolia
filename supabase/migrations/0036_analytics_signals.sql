-- Analitik sinyal özetleri (ANALYTICS): ürün, arama terimi ve kaynak ayrı tablolardır, çünkü `analytics_daily`ye boyut
-- olarak eklenseler satırı katalog ve arama çeşitliliğiyle çarpardı. Üçü ham defterden üretilir, ekran ham deftere bağlanmaz.

-- ═══ ÜRÜN KIRILIMI ═══════════════════════════════════════════════════════════
-- İki tüketicisi var: yönetici raporu ve müşteri vitrini (`readShowcase`); vitrin ham deftere bağlansa her açılış toplama koşardı.
create table public.analytics_daily_product (
  day date not null,
  business business not null,
  -- FK YOK — defterle aynı gerekçe: silinen ürünün geçmiş sayıları silinmemeli, yoksa mart ayının
  -- grafiği haziranda başka bir sayı gösterir. Öksüz satır burada bir arıza değil, tarihtir.
  product_id uuid not null,

  view_count integer not null default 0,
  cart_count integer not null default 0,
  share_count integer not null default 0,
  -- **Satılabilir hâlde görüntülenme** — "az alınıyor" yargısının paydası budur, toplam görüntüleme
  -- değil. Stoksuzken bakılan ürün "ilgi görüp satılmıyor" diye okunursa yönetici fiyata bakar;
  -- oysa doğru aksiyon tedariktir (`ANALYTICS §3`).
  sellable_view_count integer not null default 0,
  session_count integer not null default 0,

  updated_at timestamptz not null default now(),
  constraint analytics_daily_product_key unique (day, business, product_id)
);

comment on table public.analytics_daily_product is
  'Günlük ürün kırılımı: ilgi ve dönüşüm sinyali; vitrin seçkisi de buradan okur.';

alter table public.analytics_daily_product enable row level security;

-- Tek ürünün zaman serisi (ürün kartı) — dönem taraması zaten unique indeksten karşılanıyor.
create index analytics_daily_product_product_idx on public.analytics_daily_product (product_id, day desc);

-- ═══ ARAMA TERİMLERİ ═════════════════════════════════════════════════════════
-- Kova bir boyuttur (`ANALYTICS §4`): sık süzgeç boşluğu seyrek arama boşluğunu boğmasın; `null` kova sonuç döndü demek.
create type analytics_zero_result_kind as enum ('search', 'filter');

create table public.analytics_daily_search (
  day date not null,
  business business not null,
  -- Defterdeki tek serbest metnin özeti. Kapıda `scrubMessage` + normalleştirme + 100 karakter
  -- tavanından geçmiş hâli yazılır; ham kullanıcı metni buraya hiç gelmez.
  query text not null,
  zero_result_kind analytics_zero_result_kind,

  search_count integer not null default 0,
  session_count integer not null default 0,

  updated_at timestamptz not null default now(),
  constraint analytics_daily_search_key unique nulls not distinct (day, business, query, zero_result_kind)
);

comment on table public.analytics_daily_search is
  'Günlük arama terimi özeti; süresiz değil, ham defterle aynı 25 ayı yaşar (serbest metin).';

alter table public.analytics_daily_search enable row level security;

create index analytics_daily_search_day_idx on public.analytics_daily_search (day desc, search_count desc);

-- ═══ TRAFİK KAYNAĞI ══════════════════════════════════════════════════════════
-- **Kaynak dökümü OTURUM tablosundan değil, DEFTERDEN oturum sayarak üretilir.** `analytics_session`
-- yalnız UTM'li ya da yönlendirmeli gelişte satır açar; oradan okusaydık doğrudan gelen ziyaretçi
-- (muhtemelen çoğunluk) dökümde HİÇ görünmez ve yüzdeler yalan söylerdi. Burada `source is null`
-- gerçek bir kovadır: "doğrudan / bilinmeyen".
create table public.analytics_daily_source (
  day date not null,
  business business not null,
  source text,
  campaign text,
  medium text,

  session_count integer not null default 0,
  event_count integer not null default 0,
  -- O gün o kaynaktan gelip siparişle biten oturum sayısı; ilk-temas cirosundan (aşağıdaki RPC) ayrı bir sorudur.
  order_session_count integer not null default 0,

  updated_at timestamptz not null default now(),
  constraint analytics_daily_source_key unique nulls not distinct (day, business, source, campaign, medium)
);

comment on table public.analytics_daily_source is
  'Günlük trafik kaynağı özeti; doğrudan trafik `source is null` kovasındadır, oturum başına dönüşüm taşır.';

alter table public.analytics_daily_source enable row level security;

create index analytics_daily_source_day_idx on public.analytics_daily_source (day desc, session_count desc);

-- Bu dosyada gün sınırı ya da tarih kullanan her fonksiyon `set timezone = 'Europe/Paris'` ile koşar, ki günlük özetle aynı işletme
-- gününü saysın.

-- Ürün kırılımını üretir (idempotent), yazılan satır sayısını döner. Sepet olayı yalnız varyantı taşıdığı için ürün burada
-- varyanttan çözülür; sıcak yazma yolundaki bir okumaya göre günlük işte bedelsizdir, paket satırı ise atfedilmez.
create or replace function public.build_analytics_daily_product(p_day date)
returns integer
language plpgsql
security definer
set search_path = public
set timezone = 'Europe/Paris'
as $$
declare
  yazilan integer;
begin
  insert into public.analytics_daily_product as t
    (day, business, product_id, view_count, cart_count, share_count, sellable_view_count, session_count, updated_at)
  select p_day,
         e.business,
         coalesce(e.product_id, v.product_id),
         count(*) filter (where e.type = 'product_view')::int,
         count(*) filter (where e.type = 'add_to_cart')::int,
         count(*) filter (where e.type = 'share')::int,
         count(*) filter (where e.type = 'product_view' and e.availability = 'sellable')::int,
         count(distinct e.session_key)::int,
         now()
    from public.analytics_event e
    -- Kimliği yazılmamış satırın ürünü varyanttan okunur; çoğu satır ürünü taşıdığı için `left join`.
    left join public.product_variant v
           on e.subject_type = 'variant' and v.id = e.subject_id
   where e.created_at >= p_day and e.created_at < p_day + 1
     and coalesce(e.product_id, v.product_id) is not null
   group by e.business, coalesce(e.product_id, v.product_id)
  on conflict on constraint analytics_daily_product_key do update
    set view_count = excluded.view_count,
        cart_count = excluded.cart_count,
        share_count = excluded.share_count,
        sellable_view_count = excluded.sellable_view_count,
        session_count = excluded.session_count,
        updated_at = now();

  get diagnostics yazilan = row_count;
  return yazilan;
end;
$$;

comment on function public.build_analytics_daily_product(date) is
  'Bir günün ürün kırılımını üretir. İdempotent.';

/**
 * Arama terimi özetini üretir (idempotent) → yazılan satır sayısı.
 *
 * Terim `meta->>'query'`den okunur; boş terim atlanır (arama kutusuna basılıp boş gönderilen istek
 * bir talep sinyali değildir).
 */
create or replace function public.build_analytics_daily_search(p_day date)
returns integer
language plpgsql
security definer
set search_path = public
set timezone = 'Europe/Paris'
as $$
declare
  yazilan integer;
begin
  insert into public.analytics_daily_search as t
    (day, business, query, zero_result_kind, search_count, session_count, updated_at)
  select p_day,
         e.business,
         e.meta->>'query',
         nullif(e.meta->>'zeroResultKind', '')::analytics_zero_result_kind,
         count(*)::int,
         count(distinct e.session_key)::int,
         now()
    from public.analytics_event e
   where e.created_at >= p_day and e.created_at < p_day + 1
     and e.type = 'search'
     and coalesce(e.meta->>'query', '') <> ''
   group by 2, 3, 4
  on conflict on constraint analytics_daily_search_key do update
    set search_count = excluded.search_count,
        session_count = excluded.session_count,
        updated_at = now();

  get diagnostics yazilan = row_count;
  return yazilan;
end;
$$;

comment on function public.build_analytics_daily_search(date) is
  'Bir günün arama terimi özetini üretir. İdempotent.';

-- Trafik kaynağı özetini üretir (idempotent). UTM anahtarları kapalı sözlüktür ve kapı normalleştirir
-- (`lib/analytics/record.ts`); sözlük değişirse iki yer birden değişir.
create or replace function public.build_analytics_daily_source(p_day date)
returns integer
language plpgsql
security definer
set search_path = public
set timezone = 'Europe/Paris'
as $$
declare
  yazilan integer;
begin
  -- Oturum iş başına sayılır: girişten önce ziyaretçi olan tarayıcı aynı gün iki işin de oturumu olabilir.
  with oturum as (
    select e.session_key,
           e.business,
           count(*)::int as olay,
           bool_or(e.type = 'order_placed') as siparisli
      from public.analytics_event e
     where e.created_at >= p_day and e.created_at < p_day + 1
     group by e.session_key, e.business
  )
  insert into public.analytics_daily_source as t
    (day, business, source, campaign, medium, session_count, event_count, order_session_count, updated_at)
  -- Sol birleşim, çünkü künyesiz oturum da sayılmalı. UTM yönlendirenden önce gelir, yoksa reklamla gelen ziyaretçi
  -- iki kovaya bölünürdü; sıra `rememberAcquisition` ile aynı olmak zorunda.
  select p_day,
         o.business,
         coalesce(s.utm->>'source', s.source),
         s.utm->>'campaign',
         s.utm->>'medium',
         count(*)::int,
         sum(o.olay)::int,
         count(*) filter (where o.siparisli)::int,
         now()
    from oturum o
    left join public.analytics_session s on s.session_key = o.session_key
   group by 2, 3, 4, 5
  on conflict on constraint analytics_daily_source_key do update
    set session_count = excluded.session_count,
        event_count = excluded.event_count,
        order_session_count = excluded.order_session_count,
        updated_at = now();

  get diagnostics yazilan = row_count;
  return yazilan;
end;
$$;

comment on function public.build_analytics_daily_source(date) is
  'Bir günün trafik kaynağı özetini üretir. Doğrudan trafik null kovasında.';

-- Oturum künyelerini ve arama özetlerini ham defterle aynı 25 ayda siler: künye psödonim anahtar, arama özeti tek kalıcı
-- serbest metindir. Sayı taşıyan öteki özetler kişisel veri değildir ve süresiz kalır.
create or replace function public.purge_analytics_before(p_day date)
returns table (sessions integer, searches integer)
language plpgsql
security definer
set search_path = public
set timezone = 'Europe/Paris'
as $$
begin
  with silinen as (delete from public.analytics_session where first_seen_at < p_day returning 1)
  select count(*)::int into sessions from silinen;

  with silinen as (delete from public.analytics_daily_search where day < p_day returning 1)
  select count(*)::int into searches from silinen;

  return next;
end;
$$;

comment on function public.purge_analytics_before(date) is
  'Oturum künyelerini ve arama özetlerini saklama süresine göre siler; sayı özetleri süresizdir.';

-- ═══ DÖNEM OKUMALARI — TOPLAMA SQL'DE (STACK §13) ═══════════════════════════
-- RPC, çünkü sıralama türetilmiş bir orandır ve ilk N ancak dönem toplandıktan sonra bilinir. `cart_rate` paydası satılabilir
-- görüntülemedir ve payda 0 ise oran `null` döner.
create or replace function public.analytics_product_signals(
  p_from date,
  p_to date,
  p_limit integer default 20,
  p_business business default null
)
returns table (
  product_id uuid,
  view_count integer,
  cart_count integer,
  share_count integer,
  sellable_view_count integer,
  session_count integer,
  cart_rate numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select t.product_id,
         sum(t.view_count)::int,
         sum(t.cart_count)::int,
         sum(t.share_count)::int,
         sum(t.sellable_view_count)::int,
         -- Oturum sayısı günler arası TOPLANIR ve bu bir yaklaşımdır: aynı ziyaretçi iki gün
         -- geldiyse iki sayılır. Gün-aşırı tekillik kimliksizlik kararının zaten tanımsız kıldığı
         -- bir sayıdır (`ANALYTICS §5`).
         sum(t.session_count)::int,
         case when sum(t.sellable_view_count) > 0
              then round(sum(t.cart_count)::numeric / sum(t.sellable_view_count), 4)
         end
    from public.analytics_daily_product t
   where t.day >= p_from and t.day <= p_to
     and (p_business is null or t.business = p_business)
   group by t.product_id
   order by sum(t.view_count) desc
   limit p_limit;
$$;

comment on function public.analytics_product_signals(date, date, integer, business) is
  'Dönemin ürün sinyalleri: ilgi ve dönüşüm; vitrin seçkisi de bunu okur.';

-- Dönemin arama sinyalleri; `p_zero_only` sıfır sonuçluları süzer, kova gruplamada kalır (`ANALYTICS §4`).
create or replace function public.analytics_search_signals(
  p_from date,
  p_to date,
  p_limit integer default 20,
  p_zero_only boolean default false,
  p_business business default null
)
returns table (
  query text,
  zero_result_kind analytics_zero_result_kind,
  search_count integer,
  session_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select t.query,
         t.zero_result_kind,
         sum(t.search_count)::int,
         sum(t.session_count)::int
    from public.analytics_daily_search t
   where t.day >= p_from and t.day <= p_to
     and (not p_zero_only or t.zero_result_kind is not null)
     and (p_business is null or t.business = p_business)
   group by t.query, t.zero_result_kind
   order by sum(t.search_count) desc
   limit p_limit;
$$;

comment on function public.analytics_search_signals(date, date, integer, boolean, business) is
  'Dönemin arama sinyalleri; sıfır-sonuç süzgeci kovayı korur.';

-- ═══ "HANGİ SİPARİŞ CİRO SAYILIR" — TEK TANIM ════════════════════════════════
-- Üç okuma aynı tanımı kullanır ki ayrışmasın: taslak, iptal ve iade sayılmaz. İki tutar taşınır, raporlar bugün
-- `ordered_total`ı okur; `revenue_total`a geçiş BEKLEYEN(12.25).
create or replace view public.analytics_order_base with (security_invoker = true) as
  select o.id, o.customer_id, o.channel, o.ordered_total, o.revenue_total, o.created_at, o.address_snapshot, w.business
    from public.order o
    -- Siparişin işi deposunun işidir; müşterinin işiyle eşitliğini `order_business_matches` korur.
    join public.warehouse w on w.id = o.warehouse_id
   where o.status not in ('draft', 'cancelled', 'returned');

comment on view public.analytics_order_base is
  'Analitik ciro tanımı: hangi siparişin ciro sayıldığı tek yerde; üç okuma da bunu kullanır.';

-- Dönem cirosu, gün × kanal: `order_counts` teslim gününe süzer, analitik sipariş gününü sorar. Kanal ayrı satırdır,
-- çünkü karışık ölçüm yalan söyler (`ANALYTICS §3`); satır sayısı gün × 2 ile sınırlı.
create or replace function public.analytics_order_revenue(p_from date, p_to date, p_business business default null)
returns table (
  day date,
  channel channel,
  order_count integer,
  revenue_cents bigint
)
language sql
stable
security definer
set search_path = public
set timezone = 'Europe/Paris'
as $$
  select o.created_at::date as day,
         o.channel,
         count(*)::int as order_count,
         -- Euro → cent TAMSAYIDA (`STACK §8`): kayan noktada toplamak her satırda kuruş artığı bırakır.
         round(sum(o.ordered_total) * 100)::bigint as revenue_cents
    from public.analytics_order_base o
   where o.created_at >= p_from and o.created_at < p_to + 1
     and (p_business is null or o.business = p_business)
   group by 1, 2
   order by 1;
$$;

comment on function public.analytics_order_revenue(date, date, business) is
  'Dönem cirosu gün × kanal; süzgeç sipariş tarihinde, teslim gününde değil.';

-- ═══ KAMPANYA CİROSU — İLK TEMAS ATFI ═════════════════════════════════════════
-- Siparişleri müşterinin edinim kaynağına göre toplar: kampanyanın kazandırdığı müşterilerin dönem siparişleri, tekrarlar dahil.
-- Oturum anahtarı siparişe yazılmadığı için tek bağ `acquisition_source`tur; jsonb anahtarları camelCase.
create or replace function public.analytics_campaign_revenue(p_from date, p_to date, p_business business default null)
returns table (
  campaign text,
  source text,
  order_count integer,
  revenue_cents bigint,
  customer_count integer,
  new_customer_count integer
)
language sql
stable
security definer
set search_path = public
set timezone = 'Europe/Paris'
as $$
  -- Ciro tanımı `analytics_order_base`'ten gelir — üç okuma da aynı yerden, yoksa aynı ekranda
  -- iki farklı ciro belirir ve hiçbiri hata vermez.
  with sip as (select * from public.analytics_order_base where p_business is null or business = p_business),
  ilk as (
    select s.customer_id, min(s.created_at) as ilk_at from sip s group by 1
  )
  select p.acquisition_source->>'campaign' as campaign,
         coalesce(p.acquisition_source->>'source', p.acquisition_source->>'channel') as source,
         count(*)::int as order_count,
         -- Euro → cent tamsayıda (`STACK §8`): kayan noktada toplamak kuruş artığı bırakır.
         round(sum(s.ordered_total) * 100)::bigint as revenue_cents,
         count(distinct s.customer_id)::int as customer_count,
         count(distinct s.customer_id) filter (where i.ilk_at >= p_from and i.ilk_at < p_to + 1)::int as new_customer_count
    from sip s
    join public.user_profiles p on p.id = s.customer_id
    join ilk i on i.customer_id = s.customer_id
   where s.created_at >= p_from and s.created_at < p_to + 1
   -- Kaynağı OLMAYAN müşteri de düşmez: `campaign is null` kovası "kaynağı ölçülmemiş ciro"dur ve
   -- düşürülseydi kampanya toplamları dönemin gerçek cirosunu tutmazdı (`campaignSpend` ile aynı kural).
   group by 1, 2;
$$;

comment on function public.analytics_campaign_revenue(date, date, business) is
  'Kampanya cirosu, ilk temas atfı: tekrar siparişler de müşteriyi kazandıran kaynağa yazılır.';

-- Posta kodu başına sipariş, `postal_code_demand` talebinin karşı ucu. Anahtar `address_snapshot`, çünkü canlı adres
-- geçmiş oranı değiştirirdi; talep sayacı zaman kırılımı taşımadığı için iki taraf da tüm zamandır.
create or replace function public.analytics_postal_code_orders(p_codes text[])
returns table (postal_code text, order_count integer, revenue_cents bigint)
language sql
stable
security definer
set search_path = public
as $$
  -- `address_snapshot` uygulamanın yazdığı camelCase anahtarlarla saklanır; yanlış anahtar hata vermez, boş küme döndürür.
  select upper(regexp_replace(o.address_snapshot->>'postalCode', '\s', '', 'g')) as postal_code,
         count(*)::int,
         round(sum(o.ordered_total) * 100)::bigint
    from public.analytics_order_base o
   where o.address_snapshot->>'postalCode' is not null
     and upper(regexp_replace(o.address_snapshot->>'postalCode', '\s', '', 'g')) = any (p_codes)
   group by 1;
$$;

comment on function public.analytics_postal_code_orders(text[]) is
  'Posta kodu başına sipariş ve ciro, talep sayacının karşı ucu; kod normalleştirmesi bölge haberiyle aynı.';

-- ═══ MÜŞTERİ SEGMENTLERİ ═════════════════════════════════════════════════════
-- Segment türetilir, saklanan segment tazeleme işi koşmayınca sessizce yanlışa döner. Eşikler çağırandan gelir
-- (90 / 30 / 3); `case` ilk eşleşeni alır.
create or replace function public.analytics_customer_segments(
  p_reference date default current_date,
  p_dormant_days integer default 90,
  p_new_days integer default 30,
  p_champion_orders integer default 3,
  p_business business default null
)
returns table (
  segment text,
  customer_count integer,
  order_count integer,
  revenue_cents bigint
)
language sql
stable
security definer
set search_path = public
set timezone = 'Europe/Paris'
as $$
  -- Segment de aynı ciro tanımından okur (`analytics_order_base`): "iyi müşteri" yargısı ile
  -- "dönem cirosu" farklı sipariş kümelerinden çıksaydı ekran kendiyle çelişirdi.
  with sip as (select * from public.analytics_order_base where p_business is null or business = p_business),
  musteri as (
    select s.customer_id,
           count(*)::int as siparis,
           max(s.created_at)::date as son,
           sum(s.ordered_total) as ciro
      from sip s
     group by 1
  )
  select case
           when m.son >= p_reference - p_new_days and m.siparis >= p_champion_orders then 'champion'
           when m.son >= p_reference - p_new_days and m.siparis = 1 then 'new'
           when m.son >= p_reference - p_dormant_days then 'active'
           when m.son >= p_reference - (p_dormant_days * 2) then 'dormant'
           else 'lost'
         end as segment,
         count(*)::int as customer_count,
         sum(m.siparis)::int as order_count,
         round(sum(m.ciro) * 100)::bigint as revenue_cents
    from musteri m
   group by 1;
$$;

comment on function public.analytics_customer_segments(date, integer, integer, integer, business) is
  'Müşteri segmenti sayıları: segment türetilir, saklanmaz; eşikler parametrik.';

-- Segmentin üyeleri: sayı ile liste aynı ölçütten çıkmalı. Sayfalanır ve en yeni uyuyan üstte, çünkü geri kazanma şansı en yüksek odur.
create or replace function public.analytics_segment_members(
  p_segment text,
  p_limit integer default 50,
  p_offset integer default 0,
  p_reference date default current_date,
  p_dormant_days integer default 90,
  p_new_days integer default 30,
  p_champion_orders integer default 3,
  p_business business default null
)
returns table (
  customer_id uuid,
  order_count integer,
  last_order_at date,
  revenue_cents bigint
)
language sql
stable
security definer
set search_path = public
set timezone = 'Europe/Paris'
as $$
  -- Segment de aynı ciro tanımından okur (`analytics_order_base`): "iyi müşteri" yargısı ile
  -- "dönem cirosu" farklı sipariş kümelerinden çıksaydı ekran kendiyle çelişirdi.
  with sip as (select * from public.analytics_order_base where p_business is null or business = p_business),
  musteri as (
    select s.customer_id,
           count(*)::int as siparis,
           max(s.created_at)::date as son,
           sum(s.ordered_total) as ciro
      from sip s
     group by 1
  )
  select m.customer_id, m.siparis, m.son, round(m.ciro * 100)::bigint
    from musteri m
   where case
           when m.son >= p_reference - p_new_days and m.siparis >= p_champion_orders then 'champion'
           when m.son >= p_reference - p_new_days and m.siparis = 1 then 'new'
           when m.son >= p_reference - p_dormant_days then 'active'
           when m.son >= p_reference - (p_dormant_days * 2) then 'dormant'
           else 'lost'
         end = p_segment
   order by m.son desc, m.customer_id
   limit p_limit offset p_offset;
$$;

comment on function public.analytics_segment_members(text, integer, integer, date, integer, integer, integer, business) is
  'Bir segmentin üyeleri, sayfalı; dışa alma ve Müşteriler köprüsü bunu okur.';
