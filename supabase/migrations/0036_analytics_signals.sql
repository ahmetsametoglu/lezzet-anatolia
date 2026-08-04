-- Analitik SİNYAL özetleri + iki rapor okuması (13.2 · 13.4 · 13.5).
-- Kurallar `docs/architecture/ANALYTICS.md`; bu dosya 0035'in üstüne "ekranın soramadığı soruları"
-- ekler.
--
-- ── NEDEN AYRI TABLOLAR, NEDEN `analytics_daily`'YE KOLON EKLEMEDİK ──────────
-- `analytics_daily` boyutları gün × tip × rota × depo × kanal × satılabilirlik × terk sebebi. Ürünü
-- ya da arama terimini oraya BOYUT olarak eklemek satır sayısını katalog büyüklüğüyle (ve arama
-- çeşitliliğiyle) ÇARPARDI — ekranın bugün kullandığı huni/ısı/seri okumaları da o şişmiş tabloyu
-- taramak zorunda kalırdı. Üç ayrı soru, üç ayrı doğal tavan:
--   `analytics_daily_product`  gün × ürün          → "çok bakılıp az alınan" (13.4) + vitrin seçkisi (08.9)
--   `analytics_daily_search`   gün × terim × kova  → "aranıp bulunamayan" (13.4)
--   `analytics_daily_source`   gün × kaynak × kmp. → trafik kaynağı + kaynak dönüşümü (13.2)
--
-- Üçü de ham defterden ÜRETİLİR ve ekran ham deftere hiç bağlanmaz (`ANALYTICS §5`). §5 "aranıp
-- bulunamayan listesi ham defterden" diyordu; oradaki kasıt "kaynağı `analytics_daily` DEĞİL"dir.
-- Ham defterden okumayı seçmedik çünkü o okuma ayın tüm bölümünü tarar ve 25 ay dolunca listenin
-- geçmişi sessizce kısalırdı.

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
-- **Kova (`zero_result_kind`) bir BOYUTTUR, bayrak değil** (`ANALYTICS §4`): süzgeç boşluğu SIK bir
-- arayüz sinyali, arama boşluğu SEYREK bir çeşit sinyalidir. Tek listede toplansalardı sık olan
-- seyreği boğardı ve "müşterinin istediği ama bizde olmayan şey" listesi kullanılamaz hâle gelirdi.
-- `null` kova = arama sonuç DÖNDÜ (sıfır değil).
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
  -- **Kaynağın DÖNÜŞÜMÜ** — oturumu siparişle biten kaç oturum vardı. Kampanya ROI'sinin
  -- ciro-bağımsız yarısı: ciro `acquisition_source` üzerinden ilk-temas atfıyla gelir (aşağıdaki
  -- RPC), bu sayı ise o gün o kaynaktan gelen oturumun kendi dönüşümüdür. İkisi AYNI ŞEY DEĞİL ve
  -- birbirinin doğrulaması da değil.
  order_session_count integer not null default 0,

  updated_at timestamptz not null default now(),
  constraint analytics_daily_source_key unique nulls not distinct (day, source, campaign, medium)
);

comment on table public.analytics_daily_source is
  'Günlük trafik kaynağı özeti (13.2) — doğrudan trafik `source is null` kovasında; oturum başına dönüşüm taşır.';

alter table public.analytics_daily_source enable row level security;

create index analytics_daily_source_day_idx on public.analytics_daily_source (day desc, session_count desc);

/**
 * Ürün kırılımını üretir (idempotent) → yazılan satır sayısı.
 *
 * `product_id is null` satırlar DIŞARIDA: kategori/koleksiyon görüntülemeleri ürün sinyali değildir
 * ve toplanırlarsa "ilgi" sıralaması listeleme sayfalarıyla dolar.
 */
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
         e.product_id,
         count(*) filter (where e.type = 'product_view')::int,
         count(*) filter (where e.type = 'add_to_cart')::int,
         count(*) filter (where e.type = 'share')::int,
         count(*) filter (where e.type = 'product_view' and e.availability = 'sellable')::int,
         count(distinct e.session_key)::int,
         now()
    from public.analytics_event e
   where e.created_at >= p_day and e.created_at < p_day + 1
     and e.product_id is not null
   group by e.product_id
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

/**
 * Trafik kaynağı özetini üretir (idempotent) → yazılan satır sayısı.
 *
 * **UTM anahtarları KAPALI SÖZLÜKTÜR** (`{source, medium, campaign, content, term}`) ve
 * normalleştirmeyi KAPI yapar (`lib/analytics/record.ts`). Burada `utm->>'utm_source'` aramıyoruz:
 * ham sorgu dizesinin anahtarları deftere hiç girmiyor. Sözlük değişirse iki yer birden değişir ve
 * ikisi de bu künyeye bakar.
 */
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
  -- Sol birleşim ŞART: künyesi olmayan oturum (doğrudan trafik) da sayılmalı — `source is null`
  -- kovasına düşer. İç birleşim yazsaydık toplam oturum sayısı sessizce küçülür ve her kaynağın
  -- payı olduğundan büyük görünürdü.
  -- **UTM ÖNCE, yönlendiren SONRA.** Reklamla gelen ziyaretçi teknik olarak da bir siteden
  -- yönlendirilmiştir (`instagram.com`) ve o ikinci bilgi kampanya etiketini (`instagram`)
  -- GÖLGELER: aynı kampanya iki kovaya bölünür, kaynak dökümü de reklam raporuyla tutmaz.
  -- Sıra `rememberAcquisition`'daki ile aynı olmak zorunda; ters yazılmıştı, test yakaladı.
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

/**
 * Süresi dolmuş oturum künyelerini ve arama özetlerini siler → silinen satır sayıları.
 *
 * **İkisi de ham defterle AYNI 25 ayı yaşar, `analytics_daily` gibi süresiz değil.** Gerekçe ikisi
 * için ayrı:
 *   · `analytics_session` — psödonim bir anahtar taşır; defterin bölümü düşerken künyesinin kalması
 *     "saklama süresi" iddiasını yarım bırakırdı (tablo bölümlenmemiş, o yüzden `delete`).
 *   · `analytics_daily_search` — sistemdeki tek kalıcı serbest metin; süresiz saklamak, ham metnin
 *     ömrünü özet kılığında sonsuza uzatmak olurdu.
 * Sayı ve oran taşıyan öteki özetler (gün/ürün/kaynak) kişisel veri değildir ve süresiz kalır.
 */
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
/**
 * Dönemin ürün sinyalleri (13.4 + vitrin seçkisi 08.9).
 *
 * **Neden RPC, neden uygulamada toplamıyoruz:** sıralama ölçütü TÜRETİLMİŞ bir orandır (sepete
 * dönüşüm) ve "en yüksek ilgi, en düşük dönüşüm" ilk N'i ancak tüm dönem toplandıktan sonra bilinir.
 * Uygulamada toplasaydık günler × ürünler kadar satırı çekmek gerekirdi — 141 ürünlük katalogda bir
 * yıllık pencere 50 bin satır eder ve o satırların 49.950'si atılmak için taşınırdı.
 *
 * **`cart_rate` paydası SATILABİLİR görüntülemedir**, toplam değil: stoksuz görüntülenen ürünün
 * sepete girmemesi bir ilgisizlik sinyali değildir. Payda 0 ise oran `null` — sıfır değil
 * (`CLAUDE §1`: ölçülemeyen değer sıfır değildir; sıfır yazsaydık hiç satılabilir görünmemiş ürün
 * listenin başına oturur ve yönetici onu "kimse almıyor" diye okurdu).
 */
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

/**
 * Dönemin arama sinyalleri (13.4).
 *
 * `p_zero_only` ile SIFIR SONUÇLU aramalar süzülür — talep/çeşit sinyali. Kova (`zero_result_kind`)
 * gruplamada KALIR: süzgeç boşluğu ile arama boşluğu ayrı raporlanır (`ANALYTICS §4`), tek listede
 * toplansalardı sık olan seyreği boğardı.
 */
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
-- Aşağıdaki üç okuma da (kampanya cirosu · dönem cirosu · segment) aynı soruyu soruyor ve cevabı
-- ÜÇ KEZ yazılsaydı bir gün ayrışırlardı: biri iadeyi düşer öteki düşmez, aynı ekranda iki farklı
-- ciro görünür ve **hiçbiri hata vermez**. Tanım burada, tek yerde.
--
-- Taslak SAYILMAZ (hiç sipariş olmadı), iptal SAYILMAZ (ciro değil), iade SAYILMAZ (parası geri
-- gitmiş bir satış ne kampanyanın getirisi ne dönemin cirosudur).
create or replace view public.analytics_order_base as
  select o.id, o.customer_id, o.channel, o.total, o.created_at, o.address_snapshot
    from public.order o
   where o.status not in ('draft', 'cancelled', 'returned');

comment on view public.analytics_order_base is
  'Analitik ciro tanımı (13.2 · 13.5) — hangi siparişin ciro sayıldığı TEK yerde; üç okuma da bunu kullanır.';

/**
 * **DÖNEM CİROSU — gün × kanal** (13.2 · operasyon şeridinin isteği 04.08).
 *
 * ── NEDEN AYRI BİR OKUMA, `order_counts` YETMİYOR ───────────────────────────
 * Var olan sayaç tarih süzgecini **TESLİM gününe** uyguluyor (`deliveryFrom/To`); analitiğin sorusu
 * ise **sipariş tarihidir**. İkisi aynı değil: bugün verilen bir sipariş üç gün sonra teslim edilir,
 * yani teslim gününe göre okunan bir "dönem cirosu" kampanya giderinin dönemiyle hiç hizalanmaz.
 * Operasyon şeridi bu yüzden "yaklaşık doğru" bir ciro yazmayı reddetti — doğru yaptı.
 *
 * ── NEDEN GÜN × KANAL, DÜZ TOPLAM DEĞİL ─────────────────────────────────────
 * Tek çağrı üç soruyu birden karşılıyor: dönem toplamı (satırların toplamı), B2C/B2B ayrımı
 * (hero şeridi) ve günlük seri (zaman grafiği + önceki dönemin hayalet çizgisi). Üç ayrı RPC
 * yazsaydık üçü de aynı tanımı tekrarlardı.
 *
 * **Karışık ölçüm yalan söyler** (`ANALYTICS §3`): B2B'nin tek siparişi B2C'nin ortalamasını
 * savurur, o yüzden kanal ayrı satır — toplamak okuyanın kararı.
 *
 * Satır sayısı doğal tavanlı (gün × 2), yani sayfalama gerekmez.
 */
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
         round(sum(o.total) * 100)::bigint as revenue_cents
    from public.analytics_order_base o
   where o.created_at >= p_from and o.created_at < p_to + 1
   group by 1, 2
   order by 1;
$$;

comment on function public.analytics_order_revenue(date, date) is
  'Dönem cirosu gün × kanal (13.2) — süzgeç SİPARİŞ tarihinde, teslim gününde değil.';

-- ═══ KAMPANYA CİROSU — İLK TEMAS ATFI (13.2) ═════════════════════════════════
/**
 * Dönemin siparişlerini müşterinin EDİNİM KAYNAĞINA göre toplar.
 *
 * **Bu İLK TEMAS (first-touch) atfıdır ve ölçtüğü şey künyeye yazılmak zorunda:** satır "o dönemde
 * o kampanyanın reklamına tıklayıp sipariş verenler" DEĞİL, "o kampanyanın bize kazandırdığı
 * müşterilerin o dönemde verdiği siparişler"dir. Tekrar siparişler de ilk kaynağa yazılır.
 *
 * **Neden başka türlüsü yok:** oturum anahtarı siparişe YAZILMIYOR (`ANALYTICS §2`) — yazsaydık tek
 * `join` ile anonim defterin tamamı geriye dönük kimliklenirdi. Elimizdeki tek kalıcı bağ, sipariş
 * anında müşteriye kopyalanan `acquisition_source`'tur. Yani bu kısıt mahremiyet kararının bedeli ve
 * bilerek ödeniyor.
 *
 * **Sonuç okunurken:** ROI'nin gider tarafı (`campaignSpend`) DÖNEMİN gideridir, ciro tarafı ise
 * geçmişte kazanılmış müşteriyi de içerir. Yeni kampanyada ciro geç görünür, eski kampanyada gider
 * bittiği hâlde ciro sürer — `new_customers` sütunu tam olarak bu farkı okutmak için var.
 *
 * jsonb anahtarları CAMELCASE: servis katmanı yazarken dönüştürüyor (`checkout-session.ts` künyesi).
 */
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
         round(sum(s.total) * 100)::bigint as revenue_cents,
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

/**
 * **POSTA KODU BAŞINA SİPARİŞ** — "çok soruluyor, az alınıyor" listesinin karşı ucu.
 *
 * ── KULLANICI SORUSU (04.08) ────────────────────────────────────────────────
 * *"İnsanlar bir posta kodu giriyor ve genelde bir şey almadan çıkıyor — sıralamada en üstteki
 * kodu bilebilecek miyim?"* Talep tarafı zaten sayılıyordu (`postal_code_demand`, **bölge içi
 * kodlar dâhil** — 0023'ün kendi künyesi öyle diyor). Eksik olan sipariş tarafıydı.
 *
 * ── YENİ TABLO AÇILMADI ve bu kullanıcının şartıydı ─────────────────────────
 * Sayaç var, sipariş var; ortada olmayan tek şey ikisini yan yana koyan okumaydı. Ayrı bir
 * "çözülme" defteri açmak aynı olguyu üçüncü kez kaydetmek olurdu (`postal_code_demand` anonim
 * sayaç ↔ `zone_notice` kimlikli kişi zaten var).
 *
 * ── ANAHTAR `address_snapshot`, `address` TABLOSU DEĞİL ─────────────────────
 * Adres sonradan düzeltilebilir ya da silinebilir; siparişin nereye gittiği siparişte durur
 * (kolonun kendi gerekçesi). Canlı adresten okusaydık geçmiş dönüşüm oranları bugün değişirdi.
 *
 * ⚠ **DÖNEM SÜZGECİ YOK ve bu bilinçli bir eksiklik:** `postal_code_demand` zaman kırılımı
 * taşımıyor (kod başına tek satır, tek sayı). Siparişi döneme süzüp talebi tüm zamandan alsaydık
 * oran pencere daraldıkça sessizce düşerdi — ve düşüşü bir sinyal sanılırdı. İkisi de TÜM ZAMAN.
 * Zaman kırılımı gerçekten gerekirse sayaç gün boyutu kazanmalı; o ayrı bir karardır.
 */
create or replace function public.analytics_postal_code_orders(p_codes text[])
returns table (postal_code text, order_count integer, revenue_cents bigint)
language sql
stable
security definer
set search_path = public
as $$
  select upper(regexp_replace(o.address_snapshot->>'postal_code', '\s', '', 'g')) as postal_code,
         count(*)::int,
         round(sum(o.total) * 100)::bigint
    from public.analytics_order_base o
   where o.address_snapshot->>'postal_code' is not null
     and upper(regexp_replace(o.address_snapshot->>'postal_code', '\s', '', 'g')) = any (p_codes)
   group by 1;
$$;

comment on function public.analytics_postal_code_orders(text[]) is
  'Posta kodu başına sipariş/ciro (13.4) — talep sayacının karşı ucu; kod normalleştirmesi 0023 ile aynı.';

-- ═══ MÜŞTERİ SEGMENTLERİ (13.5) ══════════════════════════════════════════════
/**
 * Müşteriyi son sipariş tarihi + sipariş sayısından SEGMENTE indirger.
 *
 * **Segment saklanmaz, TÜRETİLİR** ve bu bilinçli: saklanan bir segment kolonu, onu tazeleyen iş bir
 * gün koşmayınca sessizce yanlışa döner ve kimse fark etmez — "uyuyan" listesinde dün sipariş vermiş
 * biri durur. Türetilen segment her okumada doğrudur.
 *
 * Eşikler PARAMETRİK (`CLAUDE §4`): uyuyan sınırı, "yeni" penceresi ve şampiyon sipariş sayısı
 * çağırandan gelir; varsayılanlar 90 / 30 / 3.
 *
 * Sıra önemlidir — `case` ilk eşleşeni alır: champion → new → active → dormant → lost.
 */
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
           sum(s.total) as ciro
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

/**
 * Bir segmentin ÜYELERİ — "analitik kaç der, Müşteriler kim der" köprüsünün kim tarafı
 * (`ANALYTICS §6`). Sayı ile liste AYNI ölçütten çıkmalı, yoksa köprü zaten çalışmıyor demektir;
 * bu yüzden segment `case`'i ikinci kez yazılmadı — üstteki fonksiyonun mantığı tek yerde durur ve
 * bu fonksiyon onu satır düzeyinde tekrar eder.
 *
 * **Sayfalanır** (`CLAUDE §1`: müşteri kümesi veriyle sınırsız büyür). Sıralama son siparişe göre:
 * uyuyan listesinde en yeni uyuyan en üstte, çünkü geri kazanma şansı en yüksek olan odur.
 */
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
           sum(s.total) as ciro
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
