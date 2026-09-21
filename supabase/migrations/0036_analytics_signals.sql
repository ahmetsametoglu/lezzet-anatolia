-- Analitik sinyal özetleri (ANALYTICS): ürün, arama terimi ve kaynak ayrı tablolardır, çünkü `analytics_daily`ye boyut
-- olarak eklenseler satırı katalog ve arama çeşitliliğiyle çarpardı. Üçü ham defterden üretilir, ekran ham deftere bağlanmaz.

-- ═══ ÜRÜN KIRILIMI ═══════════════════════════════════════════════════════════
-- **Bu tablonun iki tüketicisi var ve ikincisi kolay gözden kaçar:** yönetici raporu ("çok bakılıp
-- az alınan") ve MÜŞTERİ vitrini (`readShowcase`, 08.9 — bugün katalogdan seçiyor). Vitrin ham
-- deftere bağlansaydı her ana sayfa açılışı bir toplama koşardı.
create table public.analytics_daily_product (
  day date not null,
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
  constraint analytics_daily_product_key unique (day, product_id)
);

comment on table public.analytics_daily_product is
  'Günlük ürün kırılımı (13.4) — ilgi/dönüşüm sinyali; vitrin seçkisi de buradan okur (08.9).';

alter table public.analytics_daily_product enable row level security;

-- Tek ürünün zaman serisi (ürün kartı) — dönem taraması zaten unique indeksten karşılanıyor.
create index analytics_daily_product_product_idx on public.analytics_daily_product (product_id, day desc);

-- ═══ ARAMA TERİMLERİ ═════════════════════════════════════════════════════════
-- Kova bir boyuttur (`ANALYTICS §4`): sık süzgeç boşluğu seyrek arama boşluğunu boğmasın; `null` kova sonuç döndü demek.
create type analytics_zero_result_kind as enum ('search', 'filter');

create table public.analytics_daily_search (
  day date not null,
  -- Defterdeki tek serbest metnin özeti. Kapıda `scrubMessage` + normalleştirme + 100 karakter
  -- tavanından geçmiş hâli yazılır; ham kullanıcı metni buraya hiç gelmez.
  query text not null,
  zero_result_kind analytics_zero_result_kind,

  search_count integer not null default 0,
  session_count integer not null default 0,

  updated_at timestamptz not null default now(),
  constraint analytics_daily_search_key unique nulls not distinct (day, query, zero_result_kind)
);

comment on table public.analytics_daily_search is
  'Günlük arama terimi özeti (13.4) — SÜRESİZ DEĞİL: ham defterle aynı 25 ayı yaşar (serbest metin).';

alter table public.analytics_daily_search enable row level security;

create index analytics_daily_search_day_idx on public.analytics_daily_search (day desc, search_count desc);

-- ═══ TRAFİK KAYNAĞI ══════════════════════════════════════════════════════════
-- **Kaynak dökümü OTURUM tablosundan değil, DEFTERDEN oturum sayarak üretilir.** `analytics_session`
-- yalnız UTM'li ya da yönlendirmeli gelişte satır açar; oradan okusaydık doğrudan gelen ziyaretçi
-- (muhtemelen çoğunluk) dökümde HİÇ görünmez ve yüzdeler yalan söylerdi. Burada `source is null`
-- gerçek bir kovadır: "doğrudan / bilinmeyen".
create table public.analytics_daily_source (
  day date not null,
  source text,
  campaign text,
  medium text,

  session_count integer not null default 0,
  event_count integer not null default 0,
  -- O gün o kaynaktan gelip siparişle biten oturum sayısı; ilk-temas cirosundan (aşağıdaki RPC) ayrı bir sorudur.
  order_session_count integer not null default 0,

  updated_at timestamptz not null default now(),
  constraint analytics_daily_source_key unique nulls not distinct (day, source, campaign, medium)
);

comment on table public.analytics_daily_source is
  'Günlük trafik kaynağı özeti (13.2) — doğrudan trafik `source is null` kovasında; oturum başına dönüşüm taşır.';

alter table public.analytics_daily_source enable row level security;

create index analytics_daily_source_day_idx on public.analytics_daily_source (day desc, session_count desc);

-- Ürün kırılımını üretir (idempotent), yazılan satır sayısını döner. Sepet olayı yalnız varyantı taşıdığı için ürün burada
-- varyanttan çözülür; sıcak yazma yolundaki bir okumaya göre günlük işte bedelsizdir, paket satırı ise atfedilmez.
create or replace function public.build_analytics_daily_product(p_day date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  yazilan integer;
begin
  insert into public.analytics_daily_product as t
    (day, product_id, view_count, cart_count, share_count, sellable_view_count, session_count, updated_at)
  select p_day,
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
   group by coalesce(e.product_id, v.product_id)
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
  'Bir günün ürün kırılımını üretir (13.4). İdempotent.';

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
as $$
declare
  yazilan integer;
begin
  insert into public.analytics_daily_search as t
    (day, query, zero_result_kind, search_count, session_count, updated_at)
  select p_day,
         e.meta->>'query',
         nullif(e.meta->>'zeroResultKind', '')::analytics_zero_result_kind,
         count(*)::int,
         count(distinct e.session_key)::int,
         now()
    from public.analytics_event e
   where e.created_at >= p_day and e.created_at < p_day + 1
     and e.type = 'search'
     and coalesce(e.meta->>'query', '') <> ''
   group by 2, 3
  on conflict on constraint analytics_daily_search_key do update
    set search_count = excluded.search_count,
        session_count = excluded.session_count,
        updated_at = now();

  get diagnostics yazilan = row_count;
  return yazilan;
end;
$$;

comment on function public.build_analytics_daily_search(date) is
  'Bir günün arama terimi özetini üretir (13.4). İdempotent.';

-- Trafik kaynağı özetini üretir (idempotent). UTM anahtarları kapalı sözlüktür ve kapı normalleştirir
-- (`lib/analytics/record.ts`); sözlük değişirse iki yer birden değişir.
create or replace function public.build_analytics_daily_source(p_day date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  yazilan integer;
begin
  with oturum as (
    select e.session_key,
           count(*)::int as olay,
           bool_or(e.type = 'order_placed') as siparisli
      from public.analytics_event e
     where e.created_at >= p_day and e.created_at < p_day + 1
     group by e.session_key
  )
  insert into public.analytics_daily_source as t
    (day, source, campaign, medium, session_count, event_count, order_session_count, updated_at)
  -- Sol birleşim, çünkü künyesiz oturum da sayılmalı. UTM yönlendirenden önce gelir, yoksa reklamla gelen ziyaretçi
  -- iki kovaya bölünürdü; sıra `rememberAcquisition` ile aynı olmak zorunda.
  select p_day,
         coalesce(s.utm->>'source', s.source),
         s.utm->>'campaign',
         s.utm->>'medium',
         count(*)::int,
         sum(o.olay)::int,
         count(*) filter (where o.siparisli)::int,
         now()
    from oturum o
    left join public.analytics_session s on s.session_key = o.session_key
   group by 2, 3, 4
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
  'Bir günün trafik kaynağı özetini üretir (13.2). Doğrudan trafik null kovasında.';

-- Oturum künyelerini ve arama özetlerini ham defterle aynı 25 ayda siler: künye psödonim anahtar, arama özeti tek kalıcı
-- serbest metindir. Sayı taşıyan öteki özetler kişisel veri değildir ve süresiz kalır.
create or replace function public.purge_analytics_before(p_day date)
returns table (sessions integer, searches integer)
language plpgsql
security definer
set search_path = public
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
  'Oturum künyelerini ve arama özetlerini saklama süresine göre siler (13.1) — sayı özetleri süresizdir.';

-- ═══ DÖNEM OKUMALARI — TOPLAMA SQL'DE (STACK §13) ═══════════════════════════
-- RPC, çünkü sıralama türetilmiş bir orandır ve ilk N ancak dönem toplandıktan sonra bilinir. `cart_rate` paydası satılabilir
-- görüntülemedir ve payda 0 ise oran `null` döner.
create or replace function public.analytics_product_signals(
  p_from date,
  p_to date,
  p_limit integer default 20
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
   group by t.product_id
   order by sum(t.view_count) desc
   limit p_limit;
$$;

comment on function public.analytics_product_signals(date, date, integer) is
  'Dönemin ürün sinyalleri (13.4) — ilgi/dönüşüm; vitrin seçkisi de bunu okur (08.9).';

-- Dönemin arama sinyalleri; `p_zero_only` sıfır sonuçluları süzer, kova gruplamada kalır (`ANALYTICS §4`).
create or replace function public.analytics_search_signals(
  p_from date,
  p_to date,
  p_limit integer default 20,
  p_zero_only boolean default false
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
   group by t.query, t.zero_result_kind
   order by sum(t.search_count) desc
   limit p_limit;
$$;

comment on function public.analytics_search_signals(date, date, integer, boolean) is
  'Dönemin arama sinyalleri (13.4) — sıfır-sonuç süzgeci kovayı korur.';

-- ═══ "HANGİ SİPARİŞ CİRO SAYILIR" — TEK TANIM ════════════════════════════════
-- Üç okuma aynı tanımı kullanır ki ayrışmasın: taslak, iptal ve iade sayılmaz. İki tutar taşınır, raporlar bugün
-- `ordered_total`ı okur; `revenue_total`a geçiş BEKLEYEN(12.25).
create or replace view public.analytics_order_base as
  select o.id, o.customer_id, o.channel, o.ordered_total, o.revenue_total, o.created_at, o.address_snapshot
    from public.order o
   where o.status not in ('draft', 'cancelled', 'returned');

comment on view public.analytics_order_base is
  'Analitik ciro tanımı (13.2 · 13.5) — hangi siparişin ciro sayıldığı TEK yerde; üç okuma da bunu kullanır.';

-- Dönem cirosu, gün × kanal: `order_counts` teslim gününe süzer, analitik sipariş gününü sorar. Kanal ayrı satırdır,
-- çünkü karışık ölçüm yalan söyler (`ANALYTICS §3`); satır sayısı gün × 2 ile sınırlı.
create or replace function public.analytics_order_revenue(p_from date, p_to date)
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
as $$
  select o.created_at::date as day,
         o.channel,
         count(*)::int as order_count,
         -- Euro → cent TAMSAYIDA (`STACK §8`): kayan noktada toplamak her satırda kuruş artığı bırakır.
         round(sum(o.ordered_total) * 100)::bigint as revenue_cents
    from public.analytics_order_base o
   where o.created_at >= p_from and o.created_at < p_to + 1
   group by 1, 2
   order by 1;
$$;

comment on function public.analytics_order_revenue(date, date) is
  'Dönem cirosu gün × kanal (13.2) — süzgeç SİPARİŞ tarihinde, teslim gününde değil.';

-- ═══ KAMPANYA CİROSU — İLK TEMAS ATFI ═════════════════════════════════════════
-- Siparişleri müşterinin edinim kaynağına göre toplar: kampanyanın kazandırdığı müşterilerin dönem siparişleri, tekrarlar dahil.
-- Oturum anahtarı siparişe yazılmadığı için tek bağ `acquisition_source`tur; jsonb anahtarları camelCase.
create or replace function public.analytics_campaign_revenue(p_from date, p_to date)
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
as $$
  -- Ciro tanımı `analytics_order_base`'ten gelir — üç okuma da aynı yerden, yoksa aynı ekranda
  -- iki farklı ciro belirir ve hiçbiri hata vermez.
  with sip as (select * from public.analytics_order_base),
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

comment on function public.analytics_campaign_revenue(date, date) is
  'Kampanya cirosu — İLK TEMAS atfı (13.2): tekrar siparişler de müşteriyi kazandıran kaynağa yazılır.';

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
  'Posta kodu başına sipariş/ciro (13.4) — talep sayacının karşı ucu; kod normalleştirmesi 0023 ile aynı.';

-- ═══ MÜŞTERİ SEGMENTLERİ ═════════════════════════════════════════════════════
-- Segment türetilir, saklanan segment tazeleme işi koşmayınca sessizce yanlışa döner. Eşikler çağırandan gelir
-- (90 / 30 / 3); `case` ilk eşleşeni alır.
create or replace function public.analytics_customer_segments(
  p_reference date default current_date,
  p_dormant_days integer default 90,
  p_new_days integer default 30,
  p_champion_orders integer default 3
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
as $$
  -- Segment de aynı ciro tanımından okur (`analytics_order_base`): "iyi müşteri" yargısı ile
  -- "dönem cirosu" farklı sipariş kümelerinden çıksaydı ekran kendiyle çelişirdi.
  with sip as (select * from public.analytics_order_base),
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

comment on function public.analytics_customer_segments(date, integer, integer, integer) is
  'Müşteri segmenti SAYILARI (13.5) — segment türetilir, saklanmaz; eşikler parametrik.';

-- Segmentin üyeleri: sayı ile liste aynı ölçütten çıkmalı. Sayfalanır ve en yeni uyuyan üstte, çünkü geri kazanma şansı en yüksek odur.
create or replace function public.analytics_segment_members(
  p_segment text,
  p_limit integer default 50,
  p_offset integer default 0,
  p_reference date default current_date,
  p_dormant_days integer default 90,
  p_new_days integer default 30,
  p_champion_orders integer default 3
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
as $$
  -- Segment de aynı ciro tanımından okur (`analytics_order_base`): "iyi müşteri" yargısı ile
  -- "dönem cirosu" farklı sipariş kümelerinden çıksaydı ekran kendiyle çelişirdi.
  with sip as (select * from public.analytics_order_base),
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

comment on function public.analytics_segment_members(text, integer, integer, date, integer, integer, integer) is
  'Bir segmentin üyeleri (13.5) — sayfalı; dışa alma ve Müşteriler köprüsü bunu okur.';
