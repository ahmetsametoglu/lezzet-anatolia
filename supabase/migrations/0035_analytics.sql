-- Analitik olay defterinin şeması; kuralların gerekçesi `docs/architecture/ANALYTICS.md`'dedir. Ham iz (`analytics_event`),
-- oturumun kampanya künyesi (`analytics_session`) ve ekranların okuduğu günlük özet (`analytics_daily`) ayrıdır; ekran ham deftere bağlanmaz.

-- `customer_id` yoktur, nullable bile değil: nullable kimlik kolonunun silme anlamı tanımsız kalır ve tek tablo iki hukuki dayanak
-- taşıyamaz (ANALYTICS §2). Kimlikli davranış defteri ayrı bir tablonun işidir ve izin yüzeyiyle birlikte doğar.

create type analytics_event_type as enum (
  'page_view',
  'product_view',
  'search',
  -- Yer kapısı huninin ilk adımıdır: yer çözülmeden düşen ziyaretçi en erken kayıptır ve `postal_code_demand` yalnız onaylayanı sayar.
  'place_resolved',
  'add_to_cart',
  'cart_blocked',
  'checkout_start',
  'checkout_blocked',
  -- İlke 2'nin (kalıcı satır bırakan aksiyon tekrarlanmaz) TEK bilinçli istisnası: huniyi defterde
  -- kapatmanın öteki yolu oturum anahtarını siparişe yazmaktı — o da tüm oturumu geriye dönük
  -- kimliklerdi. Yani bu istisna mahremiyeti bozan değil KORUYAN seçenek: tutar ve müşteri taşımaz,
  -- yalnız "bu oturum siparişle bitti" der.
  'order_placed',
  'share'
);

-- Ölçülen nesne polimorfik ve FK'sizdir, çünkü silinen bir ürünün geçmiş görüntülemeleri silinmemeli. "Hangi tarif" sorusunun kimliği de
-- burada (`recipe`), çünkü `path` slug'ı maskeleyen rota kalıbıdır.
create type analytics_subject_type as enum ('product', 'variant', 'bundle', 'category', 'collection', 'recipe');

-- Görüntüleme anındaki satılabilirlik sonradan kurulamaz, çünkü stok hareket eder; kaydedilmezse "çok bakılıp az alınan" listesinin başına
-- stoksuz ürünler otururdu. Dört bayrak yerine tek enum, çünkü bunlar tek bir durumun hâlleridir.
create type analytics_availability as enum ('sellable', 'sold_out', 'closed', 'not_here');

-- Terk sebebi tiplidir, serbest metin yasaktır: değerler motordaki sonuçların karşılığıdır ve serbest metin huninin en kıymetli kolonunu
-- sorgulanamaz kılardı.
create type analytics_blocked_reason as enum (
  'min_basket',        -- asgari sepet tutmadı
  'split',             -- sepet ikiye bölündü (yerel + kargo)
  'place_change',      -- adres değişti, kalem düştü
  'coupon_invalid',    -- kupon kodu geçersiz
  'out_of_stock',      -- checkout anında stok yetmedi
  'payment_failed',    -- ödeme düştü
  'not_shippable',     -- seçilen yere gönderilemiyor
  -- Seçilen güne teslimat yok: müşterinin seçiminden doğan gerçek bir sürtünmedir, huniye girer. Bizim arızalarımız (bölge çözülemedi,
  -- sipariş açılamadı) burada yoktur, çünkü müşteri vazgeçmiş görünürdü; yerleri `error_log`dur.
  'date_unavailable'
);

-- Cihaz uygulamanın `Device` tipiyle aynı kümedir (`mobile | desktop`). Olayın cihazı ilk boyamanın, yani sunucunun çözdüğü cihazdır,
-- yoksa aynı ziyaret iki cihaz sayılabilirdi.
create type analytics_device as enum ('mobile', 'desktop');

-- Yüzey (web ya da native) cihazdan ayrı bir boyuttur, çünkü native uygulamada cihaz hep `mobile`dır; tek defter hem toplamı hem
-- kırılımı verir. Varsayılanı yoktur, çünkü `default 'web'` yüzeyi söylemeyi unutan yazımı sessizce web sayardı.
create type analytics_surface as enum ('web', 'native');

-- UTM oturum başına bir kez düşer. `session_key` günlük dönen tuzla türer ve eski tuz saklanmaz, böylece defter psödonimden anonime döner;
-- bedeli "tekrar gelen ziyaretçi"nin ölçülememesidir (ANALYTICS §2).
create table public.analytics_session (
  session_key text primary key,
  -- Kampanya künyesi: `{source, medium, campaign, content, term}`. Serbest jsonb çünkü UTM'in kendisi
  -- serbest; ama sözlüğü kapalı tutmak KAPININ işi (Zod), tablonun değil.
  utm jsonb,
  -- Yönlendiren alan adı (utm yoksa da dolabilir). Ham URL DEĞİL: sorgu dizesi kişisel veri taşır.
  source text,
  first_seen_at timestamptz not null default now()
);

comment on table public.analytics_session is
  'Oturumun kampanya künyesi (13.1) — UTM bir kez düşer, siparişe YAZILMAZ: eşleşme sipariş anında tüketilir.';

alter table public.analytics_session enable row level security;

-- Ham defter aylık bölümlenmiştir: süresi dolan veri bölüm düşürülerek gider, çünkü toplu `delete` uzun sürer ve tabloyu şişirir.
-- Vekil anahtar yoktur, çünkü satır kimliğiyle hiç okunmaz ve en çok yazılan tabloya kullanılmayan bir indeks eklemek bedava değildir.
create table public.analytics_event (
  created_at timestamptz not null default now(),
  type analytics_event_type not null,

  -- Oturum bağı. FK YOK: oturum satırı ancak UTM'li gelişte doğar, olay ise her ziyarette yazılır —
  -- FK koysaydık UTM'siz gelen ziyaretçinin hiçbir olayı yazılamazdı.
  session_key text not null,

  -- Somut değer değil rota kalıbı yazılır (`/product/[slug]`), çünkü ham yol deftere sır ve kimliklendirici taşırdı; sorgu dizesi düşer.
  path text,

  subject_type analytics_subject_type,
  subject_id uuid,
  -- Ürün kırılımı için DENORMALİZE anlık görüntü: varyant ya da paket silinse bile "çok bakılıp az
  -- alınan" listesi ürün düzeyinde okunabilsin.
  product_id uuid,

  -- Kanal: karışık ölçüm yalan söyler (tasarımın kendi sözleşmesi).
  channel channel,
  -- Yer depo granülündedir, posta kodu değil, çünkü kanal, posta kodu ve zaman birlikte tek işletmeyi ele verir; `null` yer seçmeden
  -- gezinmenin kovasıdır. FK yoktur, çünkü silinen bir depo geçmiş satırları `null` kovasına karıştırırdı.
  warehouse_id uuid,

  availability analytics_availability,
  -- Yalnız `cart_blocked` / `checkout_blocked` olaylarında dolu.
  blocked_reason analytics_blocked_reason,

  device analytics_device,
  -- Hangi yüzeyden geldi — ZORUNLU (enum künyesi: varsayılan yok, unutma derlemede patlasın).
  surface analytics_surface not null,
  country country_code,
  language preferred_language,

  -- Tipe özel alanların sözlüğü kapalıdır ve kapıda Zod ayrık birliğiyle doğrulanır. Tek serbest metin temizlenip kesilen `search.query`dir;
  -- IP hiçbir yerde durmaz.
  meta jsonb
) partition by range (created_at);

comment on table public.analytics_event is
  'Ham gezinme izi (13.1) — kimliksiz, aylık bölümlenmiş, 25 ay. Ekranlar buradan DEĞİL analytics_daily''den okur.';

alter table public.analytics_event enable row level security;

-- Okuma desenleri iki tane: özet işi (gün + tip + boyutlar) ve oturum detayı (huni).
-- Bölümleme zaten tarih süzgecini karşılıyor, o yüzden ayrıca `created_at` indeksi YOK.
create index analytics_event_session_idx on public.analytics_event (session_key, created_at);
create index analytics_event_product_idx on public.analytics_event (product_id, created_at) where product_id is not null;

/**
 * Bölüm açıcı, idempotent. Bölüm yoksa yazım hata verir ve kapı hatayı yuttuğu için ölçüm ay başında sessizce dururdu; bakım bu yüzden
 * `analytics_rollup` işinin parçasıdır.
 */
create or replace function public.ensure_analytics_partition(p_month date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  bas date := date_trunc('month', p_month)::date;
  son date := (date_trunc('month', p_month) + interval '1 month')::date;
  ad  text := format('analytics_event_%s', to_char(bas, 'YYYYMM'));
begin
  if to_regclass(format('public.%I', ad)) is null then
    execute format(
      'create table public.%I partition of public.analytics_event for values from (%L) to (%L)',
      ad, bas, son
    );
    execute format('alter table public.%I enable row level security', ad);
  end if;
end;
$$;

-- Açılışta üç bölüm: geçen ay (geç gelen yazım), bu ay, gelecek ay (ay sonu gece yarısı boşluk
-- kalmasın). İş bunu her koşuda ileriye doğru sürdürür.
select public.ensure_analytics_partition((now() - interval '1 month')::date);
select public.ensure_analytics_partition(now()::date);
select public.ensure_analytics_partition((now() + interval '1 month')::date);

/**
 * Saklama süresi dolmuş bölümleri düşürür (25 ay, `ANALYTICS §5`) ve adlarını döner. Bölümler adlarından değil `pg_inherits`ten bulunur,
 * çünkü adlandırma değişirse ad ayrıştırma sessizce hiçbir şey silmezdi.
 */
create or replace function public.drop_analytics_partitions_before(p_month date)
returns table (dropped text)
language plpgsql
security definer
set search_path = public
as $$
declare
  esik date := date_trunc('month', p_month)::date;
  b record;
begin
  for b in
    select c.relname, pg_get_expr(c.relpartbound, c.oid) as sinir
      from pg_class c
      join pg_inherits i on i.inhrelid = c.oid
      join pg_class p on p.oid = i.inhparent
     where p.relname = 'analytics_event'
  loop
    -- Bölümün ÜST sınırı eşiğin altındaysa tamamı süresini doldurmuş demektir.
    if (substring(b.sinir from 'TO \(''([0-9-]+)')::date) <= esik then
      execute format('drop table public.%I', b.relname);
      dropped := b.relname;
      return next;
    end if;
  end loop;
end;
$$;

comment on function public.drop_analytics_partitions_before(date) is
  'Süresi dolmuş olay bölümlerini düşürür (13.1) — satır silmez, bölüm düşürür.';

-- Günlük özet süresiz yaşar, çünkü kişisel veri değildir ve yıllar arası karşılaştırma ancak böyle mümkündür. Hafta, ay ve saat ayrı
-- tablo değildir; günlükten ve satırın 24 öğeli saat dizisinden türetilir.
create table public.analytics_daily (
  day date not null,
  type analytics_event_type not null,
  path text,
  warehouse_id uuid,
  channel channel,
  availability analytics_availability,
  -- **Terk SEBEBİ özette de boyut** — yalnız ham defterde kalsaydı huninin en değerli kolonu hiçbir
  -- ekrana ulaşmazdı: "checkout'ta %38 düşüyor" bilgisi tek başına aksiyon üretmez, "%38'in yarısı
  -- asgari sepet" üretir. Yalnız `cart_blocked`/`checkout_blocked` satırlarında dolu; öteki tiplerde
  -- `null` ve `nulls not distinct` sayesinde tek satırda toplanır (boyut çoğaltmaz).
  blocked_reason analytics_blocked_reason,

  event_count integer not null default 0,
  -- Oturum sayısı YAKLAŞIKTIR ve künyeye yazılması şart: aynı oturum birden çok boyut satırına
  -- düşebilir, yani satırların toplamı gerçek oturum sayısından büyüktür. Toplanabilir tek sayı
  -- `event_count`'tur.
  session_count integer not null default 0,
  -- Saat kırılımı: indis 0 = 00:00 … indis 23 = 23:00. Dizi, 24 kolon DEĞİL — aynı gerekçe
  -- `rating_breakdown`'da yazılı: bunlar bağımsız alanlar değil tek bir dağılımın parçaları.
  hourly integer[] not null default array_fill(0, array[24]),

  updated_at timestamptz not null default now(),

  -- `nulls not distinct` şarttır, çünkü boyutların çoğu nullable ve standart `unique` aynı gün ve tip için `null` boyutlu satırın defalarca
  -- yazılmasına izin verirdi.
  constraint analytics_daily_key unique nulls not distinct (day, type, path, warehouse_id, channel, availability, blocked_reason)
);

comment on table public.analytics_daily is
  'Günlük özet (13.1) — ekranların okuduğu yer. Süresiz; hafta/ay/yıl ve saat kırılımı buradan türetilir.';

alter table public.analytics_daily enable row level security;

create index analytics_daily_day_idx on public.analytics_daily (day desc, type);

/**
 * Bir günün özetini ham defterden üretir, idempotent; toplama ve upsert PostgREST'ten söylenemediği için RPC'dir. Gün ve saat Paris
 * takvimindedir (`set timezone`), çünkü sunucunun UTC günü gece yarısından sonraki olayları önceki güne ve kayık saate yazardı.
 */
create or replace function public.build_analytics_daily(p_day date)
returns integer
language plpgsql
security definer
set search_path = public
set timezone = 'Europe/Paris'
as $$
declare
  yazilan integer;
begin
  -- İki gruplama, tek tarama mantığı: `boyut` satırın toplamlarını, `saatlik` aynı boyutların saat
  -- kırılımını verir. Diziyi doğrudan gruplama içinde kurmak mümkün değil (24 kovanın hepsi, hiç
  -- olay düşmeyen saatler dahil, satırda bulunmalı) — bu yüzden `generate_series` ile sol birleşim.
  with boyut as (
    select e.type, e.path, e.warehouse_id, e.channel, e.availability, e.blocked_reason,
           count(*)::int as olay,
           -- Oturum sayısı YAKLAŞIKTIR: aynı oturum birden çok boyut satırına düşebilir, yani
           -- satırların toplamı gerçek oturum sayısından büyüktür. Toplanabilir tek sayı `olay`.
           count(distinct e.session_key)::int as oturum
      from public.analytics_event e
     where e.created_at >= p_day and e.created_at < p_day + 1
     group by 1, 2, 3, 4, 5, 6
  ),
  saatlik as (
    select e.type, e.path, e.warehouse_id, e.channel, e.availability, e.blocked_reason,
           extract(hour from e.created_at)::int as saat,
           count(*)::int as olay
      from public.analytics_event e
     where e.created_at >= p_day and e.created_at < p_day + 1
     group by 1, 2, 3, 4, 5, 6, 7
  )
  insert into public.analytics_daily as d (day, type, path, warehouse_id, channel, availability, blocked_reason, event_count, session_count, hourly, updated_at)
  select p_day, b.type, b.path, b.warehouse_id, b.channel, b.availability, b.blocked_reason, b.olay, b.oturum,
         -- 24 kovalı dizi; olay düşmeyen saat 0 olur (eksik değil — o saatte gerçekten kimse yoktu).
         -- Boyut karşılaştırmaları `is not distinct from`: `null` kovası da eşleşmeli, yoksa yer
         -- seçmemiş ziyaretçinin saat kırılımı sessizce boş kalırdı.
         (select array_agg(coalesce(s.olay, 0) order by g.saat)
            from generate_series(0, 23) as g(saat)
            left join saatlik s
              on s.type = b.type
             and s.path is not distinct from b.path
             and s.warehouse_id is not distinct from b.warehouse_id
             and s.channel is not distinct from b.channel
             and s.availability is not distinct from b.availability
             and s.blocked_reason is not distinct from b.blocked_reason
             and s.saat = g.saat),
         now()
    from boyut b
  on conflict on constraint analytics_daily_key do update
    set event_count = excluded.event_count,
        session_count = excluded.session_count,
        hourly = excluded.hourly,
        updated_at = now();

  get diagnostics yazilan = row_count;
  return yazilan;
end;
$$;

comment on function public.build_analytics_daily(date) is
  'Bir günün özetini üretir (13.1). İdempotent — yeniden koşmak üzerine yazar; sıra: özet ÖNCE, silme SONRA.';
