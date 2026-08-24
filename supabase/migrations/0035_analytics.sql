-- Analitik olay defteri (13.1) — kuralların TAMAMI `docs/architecture/ANALYTICS.md`'dedir.
-- Bu dosya o kuralların şema karşılığıdır; buradaki her karar orada gerekçeliyle yazılı.
--
-- ── ÜÇ TABLO, ÜÇ AYRI İŞ ─────────────────────────────────────────────────────
--   `analytics_event`   ham iz, aylık bölümlenmiş, 25 ay yaşar        → yalnız DETAY
--   `analytics_session` oturumun kampanya künyesi (UTM), bir kez      → atfetme
--   `analytics_daily`   günlük özet, SÜRESİZ, saat kırılımı dizili    → EKRANLAR BUNU OKUR
--
-- **Ekran ham deftere BAĞLANMAZ.** Bağlandığı gün hızlıdır ve her hafta biraz daha yavaşlar; kimse
-- tek bir günü işaret edemez. Ham defter yalnız detaya inmek içindir (ANALYTICS §5).

-- ── KİMLİK YOK, VE BU BİR KOLON EKSİKLİĞİ DEĞİL BİR KARAR ────────────────────
-- `customer_id` YOKTUR, nullable bile değil (kullanıcı kararı 04.08 · ANALYTICS §2). Nullable bir
-- kimlik kolonu "opsiyonel" değil KARARSIZdır: silme anlamı tanımsız kalır (cascade geçmiş sayıları
-- geriye dönük değiştirir, set null "anonim" iddiasını çürütür), tek tablo iki hukuki dayanak ve iki
-- saklama süresi taşıyamaz. Kimlikli davranış defteri ayrı bir tablonun işidir ve ancak izin yüzeyi
-- + "verilerimi indir/sil" aracıyla aynı gün doğar (09.10).

create type analytics_event_type as enum (
  'page_view',
  'product_view',
  'search',
  -- Yer kapısı huninin İLK adımı: yer çözülmeden düşen ziyaretçi en erken ve muhtemelen en büyük
  -- kayıptır. `postal_code_demand` yalnız ONAYLAYANI sayar, düşeni kimse saymıyordu.
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

-- Ölçülen NESNE. Polimorfik ve FK'siz — ikisi de bilinçli: silinen bir ürünün geçmiş görüntülemeleri
-- silinmemeli, yoksa mart ayının sayıları haziranda değişir. Çeviri torbası tartışmasındaki
-- "polimorfik olmasın" itirazı BURAYA UYMAZ: orada itiraz "FK'siz kalır, öksüz satır doğar" idi,
-- burada FK'yi zaten istemiyoruz.
create type analytics_subject_type as enum ('product', 'variant', 'bundle', 'category', 'collection');

-- Görüntüleme ANINDAKİ satılabilirlik — anlık görüntü (snapshot), sonradan kurulamaz çünkü stok
-- hareket eder. Kaydedilmezse "çok bakılıp az alınan" listesinin başına STOKSUZ ürünler oturur ve
-- yönetici fiyata bakar; oysa doğru aksiyon tedariktir.
-- Dört ayrı bayrak yerine TEK enum: bunlar bağımsız alanlar değil, tek bir durumun hâlleri —
-- ayrı kolonlar bir gün birbiriyle çelişir (emsal: `rating_breakdown` dizisi).
create type analytics_availability as enum ('sellable', 'sold_out', 'closed', 'not_here');

-- Terk SEBEBİ tiplidir; serbest metin YASAK. Değerler motordaki kararların karşılığıdır
-- (`meetsMinBasket` · `splitByRoute` · `diffCartByPlace` · kupon doğrulaması). Serbest metin
-- olsaydı huninin en kıymetli kolonu bir ay içinde sorgulanamaz hâle gelirdi: üç ekran üç farklı
-- cümle yazardı.
create type analytics_blocked_reason as enum (
  'min_basket',        -- asgari sepet tutmadı
  'split',             -- sepet ikiye bölündü (yerel + kargo)
  'place_change',      -- adres değişti, kalem düştü
  'coupon_invalid',    -- kupon kodu geçersiz
  'out_of_stock',      -- checkout anında stok yetmedi
  'payment_failed',    -- ödeme düştü
  'not_shippable',     -- seçilen yere gönderilemiyor
  -- Seçilen güne teslimat yok (müşteri şeridinin ölçümü, 04.08). Gerçek bir sürtünme ve müşterinin
  -- kendi seçiminden doğuyor — bizim arızamız değil, o yüzden huniye girer.
  -- **`warehouse_unresolved` ve `order_not_placed` BİLEREK YOK:** ikisi de BİZİM arızamız
  -- (bölge çözülemedi / sipariş açılamadı). Huniye yazılsalardı müşteri vazgeçmiş görünürdü;
  -- yerleri `error_log`. Aynı gerekçe `cart_unreachable` ve `address_missing` için de geçerli —
  -- ikincisi zaten checkout'un normal ilk hâli, engel sayılsaydı her oturum bir
  -- `checkout_blocked` üretir ve olay değerini kaybederdi.
  'date_unavailable'
);

-- Cihaz: uygulamanın `Device` tipiyle AYNI küme (`lib/device.ts`: mobile | desktop). Veri modelinde
-- `web|mobile` yazıyordu; kod `desktop` diyor ve iki sözlük tutmanın gerekçesi yok — kod haklıdır.
-- **Olayın cihazı İLK BOYAMANIN cihazıdır:** sunucu UA'dan çözer, istemci `matchMedia` ile düzeltir;
-- tanım sunucununkidir, yoksa aynı ziyaret iki cihaz sayılabilirdi.
create type analytics_device as enum ('mobile', 'desktop');

-- ═══ YÜZEY — hangi uygulamadan geldi (kullanıcı kararı 24.08 · MB-63) ════════
-- **`device` ile KARIŞTIRILMAZ:** o tarayıcı cihazıdır (`mobile|desktop`), bu ise ürünün hangi
-- yüzeyi. Native uygulamada `device` her zaman `mobile`dır ve o bilgi hiçbir soruyu ayırt etmez.
--
-- NEDEN AYRI TABLO DEĞİL, BOYUT (kullanıcı kararı 24.08): iki defter tutmak aynı huniyi iki kez
-- tanımlamak olurdu ve "toplam" sorusu her seferinde elle birleştirme isterdi. Tek defter +
-- boyut, hem toplamı hem kırılımı verir.
--
-- **VARSAYILANI YOK ve bu bilinçli.** `default 'web'` yazmak, yüzeyi söylemeyi unutan bir yazımın
-- sessizce web sayılması demekti — tam olarak MB-63'ün şikâyet ettiği arızanın (native sayılmıyor
-- ama ekranda "toplam" yazıyor) yeniden üretilmesi. Zorunlu alan, unutmayı derleme hatasına çevirir
-- — ama YALNIZ Zod şemasından geçen yazımda (`AnalyticsEventInsert`). Ham `insert` yazan testler
-- kısıttan öğrenir ve orası sessizdir: Supabase `insert()` hatayı FIRLATMAZ, DÖNDÜRÜR; satır hiç
-- doğmaz, test boş kümeyi ölçer. Ölçüldü 24.08: iki backend testi tam böyle düştü, sebebi
-- görünmeden. Bu tablonun ham fikstürünü yazan her testin `surface` taşıması gerekir.
--
-- GÜNLÜK ÖZETE (`analytics_daily_*`) KOYULMADI: özet `product_id`'ye göre gruplandığı için native
-- olayları kendiliğinden akar ve "toplam" yazan sayı GERÇEKTEN toplam olur — MB-63'ün kapattığı şey
-- budur. Yüzey kırılımı gerekirse ham defterden sorulur (25 ay duruyor); özeti şimdiden ikiye
-- katlamak, sorulmamış bir soruya satır üretmek olurdu.
create type analytics_surface as enum ('web', 'native');

-- ═══ OTURUMUN KAMPANYA KÜNYESİ ═══════════════════════════════════════════════
-- UTM oturum başına BİR KEZ düşer; sonraki olaylar taşımaz, rapor `session_key` üzerinden çözer.
--
-- **`session_key` günlük dönen tuzla türer** (ANALYTICS §2): `hash(günlük_tuz ‖ kırpılmış_ip ‖ ua ‖ site)`.
-- Tuz her gün değişir ve ESKİSİ SAKLANMAZ — atıldığı an o günün anahtarları geri hesaplanamaz, yani
-- defter psödonimden ANONİME döner. Sabit tuzla kurulsaydı bu bir PARMAK İZİ olurdu ve rıza isterdi.
-- Bedeli dürüstçe: "tekrar gelen ziyaretçi" ölçülemez (o soru siparişten cevaplanıyor — 13.5).
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

-- ═══ HAM OLAY DEFTERİ ════════════════════════════════════════════════════════
-- **Aylık BÖLÜMLENMİŞ** (ANALYTICS §5): süresi dolan veri satır silinerek değil BÖLÜM DÜŞÜRÜLEREK
-- gider. 25 aylık bir tabloda toplu `delete` hem uzun sürer hem tabloyu şişirir (ölü satırlar);
-- `drop partition` tek metadata işlemidir.
--
-- **Vekil anahtar (id) YOK ve bu bilinçli bir sapma.** Bu depoda her tablo `id uuid primary key`
-- taşır; burada taşımıyor çünkü satır asla kimliğiyle okunmuyor — defter yalnız YAZILIYOR ve
-- toplanıyor. En çok yazılan tabloya, hiçbir okumanın kullanmadığı bir indeks eklemek bedava değil.
-- (Bölümlenmiş tabloda birincil anahtar zaten bölüm anahtarını içermek zorundadır, yani `id` tek
-- başına anahtar da olamazdı.)
create table public.analytics_event (
  created_at timestamptz not null default now(),
  type analytics_event_type not null,

  -- Oturum bağı. FK YOK: oturum satırı ancak UTM'li gelişte doğar, olay ise her ziyarette yazılır —
  -- FK koysaydık UTM'siz gelen ziyaretçinin hiçbir olayı yazılamazdı.
  session_key text not null,

  -- **ROTA KALIBI, somut değer ASLA** (ANALYTICS §2): `/product/[slug]`. Ham yol yazılsaydı deftere
  -- `/feedback/<token>` (oturum yerine geçen bir SIR) ve `/orders/<reference>` (doğrudan
  -- kimliklendirici) düşerdi. Sorgu dizesi tümüyle düşer; ölçülecek parametre `meta`'ya adıyla girer.
  path text,

  subject_type analytics_subject_type,
  subject_id uuid,
  -- Ürün kırılımı için DENORMALİZE anlık görüntü: varyant ya da paket silinse bile "çok bakılıp az
  -- alınan" listesi ürün düzeyinde okunabilsin.
  product_id uuid,

  -- Kanal: karışık ölçüm yalan söyler (tasarımın kendi sözleşmesi).
  channel channel,
  -- **YER: DEPO granülünde, posta kodu DEĞİL.** `b2b + posta kodu + zaman ≈ tek işletme` — defter
  -- kolon kolon anonim olur, satır olarak değil (k-anonimlik). Posta kodu sorusunun sahibi
  -- `postal_code_demand`: kanalsız, yolsuz, oturumsuz bir sayaç.
  -- **`null` BİR KOVADIR, eksik veri değil:** yer seçmeden gezinme gerçek ve muhtemelen kalabalık;
  -- huninin en büyük kayıp adımı orada. Düşürülseydi rapor onu hiç görmezdi (CLAUDE §1).
  -- FK YOK — `subject_id` ile aynı gerekçe: silinen bir depo geçmiş satırları `null`'a çevirirdi ve
  -- o satırlar "yer seçilmemiş" kovasına karışırdı. Geçmiş sayılar geriye dönük değişmemeli.
  warehouse_id uuid,

  availability analytics_availability,
  -- Yalnız `cart_blocked` / `checkout_blocked` olaylarında dolu.
  blocked_reason analytics_blocked_reason,

  device analytics_device,
  -- Hangi yüzeyden geldi — ZORUNLU (enum künyesi: varsayılan yok, unutma derlemede patlasın).
  surface analytics_surface not null,
  country country_code,
  language preferred_language,

  -- Tipe ÖZEL alanlar. Sözlüğü KAPALI ve kapıda Zod ayrık birliğiyle doğrulanır (olay tipine göre) —
  -- yoksa altı ay sonra kimsenin şemasını bilmediği bir çöp alan olur.
  -- **Defterdeki TEK serbest metin `search.query`'dir** ve o da `scrubMessage`'dan geçer,
  -- normalleştirilir, ~100 karakterde kesilir. Adres, e-posta, telefon, not gövdesi hiçbir olaya
  -- girmez; IP hiçbir yerde durmaz (yalnız `country` türetilir).
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
 * Bölüm açıcı — verilen ayın bölümü yoksa yaratır. İdempotent.
 *
 * **Neden fonksiyon:** bölüm YOKSA insert HATA VERİR ve o hata ayın ilk gününde, gece yarısı,
 * ölçümün en sessiz yerinde patlar. Kapı ölçümü akışı kesmeyecek biçimde yazıldığı için hata da
 * yutulur — yani ay başında ölçüm sessizce durur ve kimse fark etmez. Bölüm bakımı bu yüzden bir
 * işin (`analytics_rollup`) parçasıdır, elle yapılan bir bakım değil.
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
 * Saklama süresi dolmuş BÖLÜMLERİ düşürür (25 ay — `ANALYTICS §5`). Düşen bölüm adlarını döner.
 *
 * **Satır silinmiyor, bölüm düşüyor.** 25 aylık bir tabloda `delete from … where created_at < …`
 * hem uzun sürer hem tabloyu ölü satırlarla şişirir (vakum işi); `drop table` tek metadata
 * işlemidir ve diski anında bırakır.
 *
 * Ad ÇÖZÜMLEMESİ yerine `pg_inherits` taranıyor: bölüm adından tarih ayrıştırmak, adlandırma bir
 * gün değişirse sessizce hiçbir şey silmezdi — miras zinciri ise şemanın kendi gerçeğidir.
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

-- ═══ GÜNLÜK ÖZET — EKRANLARIN OKUDUĞU TABLO ══════════════════════════════════
-- SÜRESİZ yaşar: özet kişisel veri değildir ve yıllar arası karşılaştırma ancak böyle mümkündür.
--
-- **Hafta/ay/yıl AYRI TABLO DEĞİL** — günlükten okuma anında türetilir (türetilebilen ikinci kez
-- yazılmaz). **Saatlik tablo da YOK:** satır 24 öğeli bir saat kırılımı dizisi taşıyor; ısı haritası
-- (haftanın günü × saat) her pencerede bundan okunur.
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

  -- **`nulls not distinct` ŞART ve sebebi ölçüldü.** Boyutların çoğu nullable (`path`,
  -- `warehouse_id`, `channel`, `availability`) ve SQL'de `null <> null` — standart `unique` aynı
  -- gün/tip için `warehouse_id = null` satırının defalarca yazılmasına izin verirdi. Özet sessizce
  -- çoğalır, hata vermez, yalnız toplamlar tutmadığında fark edilirdi. Postgres 15+ gerekiyor
  -- (yerelde 17.6).
  constraint analytics_daily_key unique nulls not distinct (day, type, path, warehouse_id, channel, availability, blocked_reason)
);

comment on table public.analytics_daily is
  'Günlük özet (13.1) — ekranların okuduğu yer. Süresiz; hafta/ay/yıl ve saat kırılımı buradan türetilir.';

alter table public.analytics_daily enable row level security;

create index analytics_daily_day_idx on public.analytics_daily (day desc, type);

/**
 * Bir günün özetini ham defterden ÜRETİR (idempotent: aynı gün ikinci kez koşarsa üzerine yazar).
 *
 * **Neden RPC:** toplama + `on conflict` upsert PostgREST'ten söylenemez (toplama fonksiyonları bu
 * kurulumda kapalı) ve gün başına on binlerce satırı uygulamaya çekmek zaten yanlış olurdu —
 * `STACK §13`'ün RPC eşiği burada fazlasıyla karşılanıyor.
 *
 * **Sıra kritiktir (ANALYTICS §5): özet ÖNCE, silme SONRA.** Ters sırada bir gün özet koşmazsa o
 * günün verisi hem özette hem ham defterde yok olur ve bunu kimse fark etmez.
 */
create or replace function public.build_analytics_daily(p_day date)
returns integer
language plpgsql
security definer
set search_path = public
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
