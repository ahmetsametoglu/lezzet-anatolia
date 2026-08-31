-- Modül 11 — SEFER: gerçekleşen teslimat rotası + sefer kapanışı (11.7 · kullanıcı kararları 18.08).
-- Etüt: docs/feature/sefer.md (kararlar orada; kardeşi cok-gunluk-sefer.md).
--
-- ── İKİ "SEFER" VAR; BURASI YALNIZ GERÇEKLEŞENİ SAKLAR ──────────────────────
-- Planlanan sefer `(delivery_zone_id, delivery_date)` ikilisidir ve TÜRETİLMİŞ KALIR (0044 künyesi
-- yürürlükte: davet, checkout ve kesim penceresi o ikiliyi okumaya devam eder). Bu tablo aracın
-- FİİLEN çıktığı anda doğar: kim sürdü, hangi araç, ne zaman çıktı/döndü. Bugüne dek bu bilgi
-- hiçbir yerde durmuyordu — `order.courier_id` dört anlamı birden taşıyordu (plan ataması, fiili
-- sürücü varsayımı, mutabakat anahtarı, sahiplik kapısı) ve kapanış kaydı kendini "sipariş sonradan
-- başka kuryeye atansa bile" diye dondurarak koruyordu. Yama vardı, model yoktu.
--
-- ── `courier_id` SİPARİŞTE KALIR, SEFERDEN SENKRONLANIR (18.08) ─────────────
-- Sipariş kolonu sökülmedi: beş sahiplik kapısı ve ~90 okuma noktası ona yaslanıyor. Değişen şey
-- kolonu DOLDURAN el: sabah ataması (plan) yazmaya devam edebilir, ama sefer başladığı anda
-- `start_delivery_run` seferi süren kuryeyi aynı kolona yazar — kullanıcının cümlesi: *"siparişin
-- kurye bilgisi o gün gerçekleştirilen seferin kurye bilgisinden gelir."* Emsal desen:
-- `order.delivery_zone_id` de canlı bağ değil snapshot'tır (0012).

create table public.delivery_run (
  id uuid primary key default gen_random_uuid(),
  -- Okunabilir sefer kodu (`SF-26-XXXXXX`) — üretim domain-core'da (`deliveryRunReferenceNo`),
  -- benzersizlik burada; çakışmada çağıran yeni kodla dener (sipariş referansının aynı deseni).
  reference_no text not null unique,

  -- SEFERİN KİMLİĞİ: hangi rotanın hangi günü sürüldü.
  -- `restrict`: sefer görmüş rota silinmez, pasife alınır — geçmiş sefer "hangi rota" sorusuna
  -- cevap verebilmeli (courier_day_close'un kurye kuralıyla aynı gerekçe).
  delivery_zone_id uuid not null references public.delivery_zone (id) on delete restrict,
  delivery_date date not null,

  -- SNAPSHOT (0012'nin `delivery_zone_id` deseni): bölge sonradan başka depoya taşınsa da bu
  -- seferin hangi tesisten yüklendiği değişmez. Kaynağı start anındaki `zone.warehouse_id`.
  warehouse_id uuid not null references public.warehouse (id) on delete restrict,

  -- KİM SÜRDÜ. `restrict` — kapanışı olan kişi yok edilirse sefer kimin diye sorulamaz.
  courier_id uuid not null references public.user_profiles (id) on delete restrict,

  -- HANGİ ARAÇ. Nullable + parametrik zorunluluk (18.08): araç kaydı girilmemiş kurulumda kurye
  -- kilitlenmemeli; soğuk taşıyan rotada operatör `Setting` ile zorunlu kılar. `restrict`: sefer
  -- görmüş araç silinmez (temperature_log FK'siyle aynı) — soğuk zincir izi araca bağlı.
  vehicle_id uuid references public.vehicle (id) on delete restrict,

  -- Yaşam çizgisi ÜÇ DAMGA, durum makinesi DEĞİL (18.08): hâl damgalardan türetilir (satır var +
  -- departed null = yükleniyor · departed dolu = yolda · returned dolu = döndü). Projenin yerleşik
  -- deseni bu ("durum saklama, andan türet": teslim anı loglardan, `reconciled` generated).
  --
  -- ── VE 31.08'DE AYRIŞTI ───────────────────────────────────────────────────
  -- Bu satırın kendi notu "V1'de start tek harekettir; YÜKLEME AYRI BİR AN OLURSA AYRIŞIR" diyordu.
  -- O an geldi (kullanıcı kararı 31.08): **araç bir ara depodur** ve içinde birden çok seferin —
  -- bugünün de yarının da — kutusu durabilir. Sefer KURULUR (satır doğar, siparişler damgalanır,
  -- kutular okutulabilir) ama BAŞLAMAZ; başlatan ayrı bir eylemdir ve müşteriye haber o an gider.
  -- Üç kapı, üç damga: `open_delivery_run` → `depart_delivery_run` → `close_delivery_run`.
  created_at timestamptz not null default now(),
  departed_at timestamptz,
  returned_at timestamptz,
  note text,

  -- ── DURAK SIRASI — TURUN ÖZELLİĞİ, SİPARİŞİN DEĞİL (11.9) ─────────────────
  -- Sıra `order.stop_seq int` olarak siparişe YAZILMADI ve gerekçe yapısal: `stop_seq = 3` paydasız
  -- bir sayıdır — neyin üçüncüsü? Sipariş başka güne ya da başka rotaya taşındığı an o sayı sessizce
  -- yalana döner ve hiçbir yerde hata vermez. Sıra bir TURUN özelliğidir; turun kimliği de bu satır.
  -- Emsal aynı dosyada: `delivery_run_close.delivered_orders uuid[]` — kimlik dizisi seferde durur.
  --
  -- **DİZİ SIRALAMADIR, ÜYELİK DEĞİL.** Üyelik bugünkü yerinde kalıyor (`order.delivery_run_id`);
  -- okuma dizideki yere göre dizer ve **dizide olmayan durak DÜŞMEZ**, sırasız olarak sona gider.
  -- Bayat bir dizi bu yüzden hiçbir durağı gizleyemez — `uuid[]`in FK taşımaması kabul edilmiş
  -- bedeldir ve zararı yapısal olarak sınırlıdır.
  stop_order uuid[] not null default '{}',

  -- Sırayı KİM koydu. `manual` bir kilittir: `set_run_stop_order` motor yazımını `p_force` olmadan
  -- reddeder (aşağıda). Bugün elle sıra düzeltme YÜZEYİ yok (kullanıcı kararı 31.08 — önce motor
  -- izlenir); alan kapıyı açık tutuyor, etkileşim yazılmadı.
  stop_order_source text check (stop_order_source in ('engine', 'manual')),
  -- Hangi ÖLÇÜYLE dizildi. Kuş uçuşu turun makro şeklini (git-dön) doğru kurar ama bariyerin iki
  -- yakasını (nehir, demiryolu, tek yön) "200 m" sayar — araç 4 km sürer. Yol matrisi bağlandığında
  -- burası `matrix` der. **Veriye yazılıyor, yalnız log'a değil:** log'a bakan yok, ekrandaki sıraya
  -- bakan var.
  stop_order_metric text check (stop_order_metric in ('haversine', 'matrix')),
  -- Hangi İNCELİKTE. Rotanın posta kodlarının bir kısmı yoğun, bir kısmı tek duraklı (kullanıcı
  -- ölçümü 31.08) — yani aynı seferde iki çözünürlük bir arada olabilir ve ekran bunu söylemeli:
  -- `postal_centroid` yazıyorsa sıra sokak düzeyinde DEĞİLDİR.
  stop_order_precision text check (stop_order_precision in ('address', 'postal_centroid', 'mixed')),
  -- KARARIN anı — sonucu boş olsa bile damgalanır ("hesaplandı, sıralanamadı"). Yoksa düşmüş bir
  -- sağlayıcı her gün ekranı yoklamasında yeniden dövülürdü.
  stop_order_generated_at timestamptz,
  stop_order_by uuid references public.user_profiles (id) on delete set null,

  constraint delivery_run_times check (
    (departed_at is null or departed_at >= created_at)
    and (returned_at is null or departed_at is not null)   -- çıkmadan dönülmez
    and (returned_at is null or returned_at >= departed_at)
  )
);

-- ROTA+GÜN BAŞINA TEK SEFER (kullanıcı kararı 18.08 — ikinci tur veride yasak; gerçek olursa
-- kısmi unique'e gevşetilir, greenfield'da ucuz). Eşzamanlılık kilidi UYGULAMADA DEĞİL BURADA:
-- iki kurye aynı rotayı aynı anda başlatırsa ikincisi `already_started` cevabını RPC'den alır.
create unique index delivery_run_key on public.delivery_run (delivery_zone_id, delivery_date);

-- Kuryenin seferleri (mobil gün ekranı + kapanış köprüsü) ve geçmiş sefer listesi (keyset).
create index delivery_run_courier_idx on public.delivery_run (courier_id, delivery_date desc);
-- Soğuk zincir raporu: "bu araç hangi seferlerde" — temperature_log zaman-aralığı join'inin girişi.
create index delivery_run_vehicle_idx on public.delivery_run (vehicle_id, delivery_date desc)
  where vehicle_id is not null;

alter table public.delivery_run enable row level security;

-- ── Sipariş sefere bağlanır (kolon 0012'de doğdu, bağ BURADA kurulur) ────────
-- `set null`: sefer kaydı silinse sipariş silinmez (order_delivery_zone_fk deseni). Kısmi indeks:
-- satırların çoğunda (kargo, kapı önü, henüz çıkmamış) alan boş.
alter table public.order add constraint order_delivery_run_fk
  foreign key (delivery_run_id) references public.delivery_run (id) on delete set null;
create index order_delivery_run_idx on public.order (delivery_run_id) where delivery_run_id is not null;

-- ── Beklenen tahsilat (türetim) — SEFER BAZINDA ─────────────────────────────
-- 0025'teki `courier_day_collection` görünümünün halefi; eksen kurye×gün'den SEFERE indi
-- (kullanıcı kararı 18.08: "fark hangi seferde doğdu" cevaplanabilmeli). Kurye zaten seferde
-- durduğu için gruplama anahtarı tek kolona indi — ve 0025'in kabul ettiği kayma (teslimden sonra
-- yeniden atanan sipariş yanlış kuryeye yazılırdı) kökten kapandı: `delivery_run_id` teslimle donar.
--
-- Yalnız KAPIDA toplanan üç yöntem sayılır: online (Stripe) ve havale kuryenin eline hiç girmez.
create or replace view public.delivery_run_collection as
select o.delivery_run_id,
       coalesce(sum(m.amount) filter (where o.payment_method = 'cash'), 0)::numeric(12, 2)   as expected_cash,
       coalesce(sum(m.amount) filter (where o.payment_method = 'card'), 0)::numeric(12, 2)   as expected_card,
       coalesce(sum(m.amount) filter (where o.payment_method = 'cheque'), 0)::numeric(12, 2) as expected_cheque
  from public.order o
  join public.money_movement m on m.order_id = o.id and m.type = 'order_payment'
 where o.delivery_run_id is not null
   and o.payment_method in ('cash', 'card', 'cheque')
 group by o.delivery_run_id;

-- ── Sefer kapanışı — mutabakat kaydı ────────────────────────────────────────
-- 0025'teki `courier_day_close`un halefi, anahtar `(courier_id, date)` → `delivery_run_id`.
-- Kapanış bir MUTABAKATTIR, para hareketi değil: para kapıda tahsil edilirken yazıldı. Beklenen
-- ile sayılan yan yana konur, fark AYNI GÜN görünür. İki seferli günde iki sayım — bilinçli bedel
-- (18.08): kurye kasaya dönüşte teslim eder, ekran günün toplamını ayrıca gösterebilir.
create table public.delivery_run_close (
  id uuid primary key default gen_random_uuid(),
  -- Sefer başına BİR kapanış; kapanışı olan sefer silinemez.
  delivery_run_id uuid not null unique references public.delivery_run (id) on delete restrict,

  -- Sistemin hesabı (kapanış anındaki fotoğraf). Görünümden türer ama BURAYA DONDURULUR: sonradan
  -- bir hareket düzeltilirse geçmiş mutabakat değişmemeli — "o gün ne konuşuldu" sabit kalır.
  expected_cash numeric(12, 2) not null default 0,
  expected_card numeric(12, 2) not null default 0,
  expected_cheque numeric(12, 2) not null default 0,
  -- Kuryenin fiilen teslim ettiği: nakit sayımı, kart cihaz raporu, çek yaprakları.
  counted_cash numeric(12, 2) not null default 0,
  counted_card numeric(12, 2) not null default 0,
  counted_cheque numeric(12, 2) not null default 0,

  -- Seferin resmi — üç ayrı akıbet, üç ayrı liste. Sayı değil KİMLİK tutulur: kapanıştan sonra
  -- "hangi sipariş" sorusu cevapsız kalmasın. Fotoğraf ÇÖZÜMDEN ÖNCE çekilir: kapanışın ready'ye
  -- düşürdüğü duraklar bu listede `pending` olarak görünür — o an öyleydiler.
  delivered_orders uuid[] not null default '{}',
  returned_orders uuid[] not null default '{}',
  pending_orders uuid[] not null default '{}',

  -- Fark çıktığında kuryenin kısa açıklaması. Fark gizlenmez, AÇIKLANIR.
  note text,
  closed_by uuid references public.user_profiles (id) on delete set null,
  closed_at timestamptz not null default now(),

  -- TÜRETİLİR, yazılmaz: saklansaydı bir gün kolonlarla çelişirdi.
  reconciled boolean generated always as (
    expected_cash = counted_cash and expected_card = counted_card and expected_cheque = counted_cheque
  ) stored
);

-- Admin'in "mutabık olmayan seferler" listesi — azınlıktır, kısmi indeks.
create index delivery_run_close_open_idx on public.delivery_run_close (closed_at desc) where not reconciled;

alter table public.delivery_run_close enable row level security;

-- ── Seferi KUR ───────────────────────────────────────────────────────────────
-- NEDEN RPC (STACK §13): (a) eşzamanlılık — iki kurye aynı rotayı aynı anda başlatırsa ikincisi
-- sessizce ezmek yerine `already_started` + mevcut künyeyi alır; (b) bölünemez çok-tablolu yazım —
-- sefer satırı + siparişlerin damgalanması yarım kalırsa "sefer var ama durakları yok" doğar.
--
-- DURUM GEÇİŞİ BURADA YAPILMAZ: `ready → out_for_delivery` kenarının izni motorundur
-- (`canTransition`) ve dört-liste sözleşmesi (started/alreadyOut/stale/skipped) uygulama
-- katmanında kurulur. RPC yalnız CLAIM'in atomikliğini taşır: hangi siparişler bu sefere ait,
-- kuryesi kim. `out_for_delivery` de claim edilir (web'in tekil "yola çıktım"ıyla çıkmış olabilir —
-- araçtaki mal o seferindir); `delivered`/`completed`/`returned`/`cancelled` dokunulmaz.
--
-- **SEFER KURULUR, BAŞLAMAZ** (31.08): `departed_at` NULL doğar. Kurulmuş sefer "araçta bekleyen"
-- seferdir — kutuları okutulabilir (`loadBox` siparişin damgasını okuyor ve damga burada yazılıyor),
-- ama durakları açılmaz ve müşteriye haber gitmez. Yola çıkaran `depart_delivery_run`.
-- Eski adı `start_delivery_run`'dı ve iki işi birden yapıyordu; ad da artık yaptığı işi söylüyor.
create or replace function public.open_delivery_run(
  p_zone_id uuid,
  p_date date,
  p_courier_id uuid,
  p_reference_no text,
  p_vehicle_id uuid default null,
  p_actor_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_zone public.delivery_zone;
  v_existing public.delivery_run;
  v_run public.delivery_run;
  v_claimed jsonb;
begin
  select * into v_zone from public.delivery_zone where id = p_zone_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'zone_not_found');
  end if;

  -- Rota+gün başına TEK sefer (18.08). Mevcut satır iki yoldan bulunur — sakin ikinci basış İLK
  -- select'te, YARIŞIN kaybedeni unique_violation handler'ında (READ COMMITTED: kazananın satırı
  -- ancak commit'ten sonra görünür) — ve iki yol da AYNI ortak dala düşer: aynı kuryenin AÇIK
  -- seferi "KALANLARI DA AL"dır (catch-up claim, mobil şeridin bulgusu — gün ortasında hazırlanan
  -- sipariş aksi hâlde hiçbir sefere giremezdi); başkasının seferi ya da kapanmış sefer
  -- `already_started`. İlk sürümde catch-up yalnız ilk select'teydi ve yarış kaybedeni handler'dan
  -- eski cevabı alıyordu — test yakaladı (18.08).
  select * into v_existing from public.delivery_run
   where delivery_zone_id = p_zone_id and delivery_date = p_date
   for update;

  if not found then
    begin
      insert into public.delivery_run
        (reference_no, delivery_zone_id, delivery_date, warehouse_id, courier_id, vehicle_id)
      values
        (p_reference_no, p_zone_id, p_date, v_zone.warehouse_id, p_courier_id, p_vehicle_id)
      returning * into v_run;
    exception when unique_violation then
      -- Yarışın kaybedeni: kazananın satırını kilitleyip ortak dala taşı. Satır yine yoksa çakışan
      -- şey REFERANS koduydu — çağıran yeni kodla dener (sipariş referansı deseni).
      select * into v_existing from public.delivery_run
       where delivery_zone_id = p_zone_id and delivery_date = p_date
       for update;
      if not found then
        return jsonb_build_object('ok', false, 'reason', 'reference_collision');
      end if;
    end;
  end if;

  if v_run.id is null then
    -- Ortak dal: sefer zaten var (sakin ikinci basış YA DA yarış kaybedeni).
    if v_existing.courier_id = p_courier_id and v_existing.returned_at is null then
      v_run := v_existing;  -- catch-up: claim aşağıda, yeni satırla aynı yoldan koşar
    else
      return jsonb_build_object(
        'ok', false, 'reason', 'already_started',
        'run_id', v_existing.id, 'reference_no', v_existing.reference_no,
        'courier_id', v_existing.courier_id, 'departed_at', v_existing.departed_at
      );
    end if;
  end if;

  -- CLAIM: seferin siparişleri damgalanır; kurye SEFERDEN gelir (plan ataması ne derse desin —
  -- teslim edenin kimliği artık seferin gerçeğidir).
  with claimed as (
    update public.order o
       set delivery_run_id = v_run.id, courier_id = p_courier_id
     where o.delivery_zone_id = p_zone_id
       and o.delivery_date = p_date
       and o.delivery_type = 'route'
       and o.status in ('confirmed', 'preparing', 'ready', 'out_for_delivery')
     returning o.id, o.status
  )
  select coalesce(jsonb_agg(jsonb_build_object('order_id', id, 'status', status)), '[]'::jsonb)
    into v_claimed from claimed;

  return jsonb_build_object(
    'ok', true,
    'run_id', v_run.id,
    'reference_no', v_run.reference_no,
    'departed_at', v_run.departed_at,
    'claimed', v_claimed
  );
end;
$$;

revoke execute on function public.open_delivery_run(uuid, date, uuid, text, uuid, uuid)
  from public, anon, authenticated;

-- ── Seferi BAŞLAT (yola çık) ─────────────────────────────────────────────────
-- Kurulmuş seferin `departed_at` damgası. Durum geçişleri BURADA DEĞİL uygulama katmanındadır —
-- `open_delivery_run`ın aynı gerekçesi: kenarın izni motorundur (`canTransition`) ve dört-liste
-- sözleşmesi orada kurulur. RPC'nin taşıdığı tek şey damganın ATOMİKLİĞİ ve tekrar basılamazlığı.
--
-- İkinci basış hata DEĞİL: damga zaten varsa aynı künye `already_departed` ile döner. Kurye
-- "yola çık"a iki kez basabilir; müşteriye ikinci kez haber gitmemesi uygulama katmanının işi
-- (`notifyOrderStatus`ın "geçiş başına tek mail" kuralı zaten durum kaydından türüyor).
create or replace function public.depart_delivery_run(
  p_run_id uuid,
  p_courier_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run public.delivery_run;
begin
  select * into v_run from public.delivery_run where id = p_run_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Başkasının seferi başlatılamaz: sefer kimin kurduğunun üstünde durur.
  if v_run.courier_id <> p_courier_id then
    return jsonb_build_object('ok', false, 'reason', 'not_mine');
  end if;

  if v_run.departed_at is not null then
    return jsonb_build_object('ok', true, 'reason', 'already_departed', 'departed_at', v_run.departed_at);
  end if;

  update public.delivery_run set departed_at = now() where id = p_run_id returning * into v_run;
  return jsonb_build_object('ok', true, 'departed_at', v_run.departed_at);
end;
$$;

revoke execute on function public.depart_delivery_run(uuid, uuid) from public, anon, authenticated;

-- ── Seferi kapat ─────────────────────────────────────────────────────────────
-- NEDEN RPC: dönüş damgası + kapanış fotoğrafı + takılı durakların çözümü TEK anın işi olmalı —
-- araya bir teslim girerse yarım resim kalır.
--
-- K4 (18.08): kapanış, hâlâ `out_for_delivery` görünen durakları motorun "ulaşılamadı" kenarıyla
-- (`ready`) çözer — bugüne dek bu siparişler hiçbir rolün ulaşamadığı bir kilitte kalıyordu ve
-- sevkiyatçı `bringForward` ile elle kurtarıyordu. Mal ayrılmış kalır, stok HİÇ değişmez
-- (ORDER_LIFECYCLE). Hangi GÜNE yeniden yazılacağı ise burada YAZILMAZ: tarih sevkiyatçının
-- kararıdır (16.08 "görünür devir" — müşteriye verilen gün sözü haber verilmeden değişmez).
-- Geçiş `transition_order_status` üzerinden koşullu gider: kurye o milisaniyede teslim yazdıysa
-- onun kaydı kazanır (`stale` yutulur, durak delivered kalır).
create or replace function public.close_delivery_run(
  p_run_id uuid,
  p_counted_cash numeric default 0,
  p_counted_card numeric default 0,
  p_counted_cheque numeric default 0,
  p_note text default null,
  p_actor_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run public.delivery_run;
  v_existing public.delivery_run_close;
  v_expected record;
  v_delivered uuid[];
  v_returned uuid[];
  v_pending uuid[];
  v_stuck uuid;
  v_transition jsonb;
  v_released int := 0;
  v_row public.delivery_run_close;
begin
  select * into v_run from public.delivery_run where id = p_run_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- BAŞLAMAMIŞ SEFER KAPATILMAZ (31.08): kurulmuş ama yola çıkmamış sefer araçta bekliyordur —
  -- yarının seferi olabilir. `delivery_run_times` kısıtı zaten reddediyordu ama ham bir veritabanı
  -- hatasıyla; kapı kendi cevabını verir ki ekran "bu sefer daha başlamadı" diyebilsin.
  if v_run.departed_at is null then
    return jsonb_build_object('ok', false, 'reason', 'not_departed');
  end if;

  -- Kapanmış sefer salt-okunur: ikinci çağrı ezmez, mevcut kaydı bildirir.
  select * into v_existing from public.delivery_run_close where delivery_run_id = p_run_id;
  if found then
    return jsonb_build_object('ok', false, 'reason', 'already_closed', 'id', v_existing.id, 'closed_at', v_existing.closed_at);
  end if;

  select coalesce(c.expected_cash, 0)   as cash,
         coalesce(c.expected_card, 0)   as card,
         coalesce(c.expected_cheque, 0) as cheque
    into v_expected
    from (select 1) dummy
    left join public.delivery_run_collection c on c.delivery_run_id = p_run_id;

  -- FOTOĞRAF ÇÖZÜMDEN ÖNCE: kapanış anında durak neydiyse liste onu söyler. `completed` de teslim
  -- edilmiştir (kapanış geciktiyse sipariş çoktan kapanmış olabilir).
  select coalesce(array_agg(o.id) filter (where o.status in ('delivered', 'completed')), '{}'),
         coalesce(array_agg(o.id) filter (where o.status = 'returned'), '{}'),
         coalesce(array_agg(o.id) filter (where o.status not in ('delivered', 'completed', 'returned', 'cancelled')), '{}')
    into v_delivered, v_returned, v_pending
    from public.order o
   where o.delivery_run_id = p_run_id;

  -- Takılı durakların çözümü (K4). Koşullu geçiş: stale dönen sayılmaz — o durağı kurye kazandı.
  for v_stuck in
    select id from public.order where delivery_run_id = p_run_id and status = 'out_for_delivery'
  loop
    v_transition := public.transition_order_status(
      v_stuck, 'out_for_delivery', 'ready', p_actor_id, null,
      'Sefer kapandı, durak sonuçlanmadı — yeniden planlanacak.'
    );
    if (v_transition ->> 'ok')::boolean then
      v_released := v_released + 1;
    end if;
  end loop;

  -- Dönüş damgası: zaten dolu ise (teorik) ezilmez. Not, seferin notuna değil kapanışa yazılır.
  update public.delivery_run
     set returned_at = coalesce(returned_at, now())
   where id = p_run_id;

  insert into public.delivery_run_close (
    delivery_run_id,
    expected_cash, expected_card, expected_cheque,
    counted_cash, counted_card, counted_cheque,
    delivered_orders, returned_orders, pending_orders, note, closed_by
  ) values (
    p_run_id,
    v_expected.cash, v_expected.card, v_expected.cheque,
    coalesce(p_counted_cash, 0), coalesce(p_counted_card, 0), coalesce(p_counted_cheque, 0),
    v_delivered, v_returned, v_pending, p_note, p_actor_id
  )
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'run_id', p_run_id,
    'expected_cash', v_row.expected_cash,
    'expected_card', v_row.expected_card,
    'expected_cheque', v_row.expected_cheque,
    'counted_cash', v_row.counted_cash,
    'counted_card', v_row.counted_card,
    'counted_cheque', v_row.counted_cheque,
    -- Fark = sayılan − beklenen. İşaret anlamlıdır: eksi eksik teslim, artı fazla para.
    'difference_cash', v_row.counted_cash - v_row.expected_cash,
    'difference_card', v_row.counted_card - v_row.expected_card,
    'difference_cheque', v_row.counted_cheque - v_row.expected_cheque,
    'reconciled', v_row.reconciled,
    'delivered_count', coalesce(array_length(v_row.delivered_orders, 1), 0),
    'returned_count', coalesce(array_length(v_row.returned_orders, 1), 0),
    'pending_count', coalesce(array_length(v_row.pending_orders, 1), 0),
    'released_count', v_released,
    'returned_at', (select returned_at from public.delivery_run where id = p_run_id)
  );
end;
$$;

revoke execute on function public.close_delivery_run(uuid, numeric, numeric, numeric, text, uuid)
  from public, anon, authenticated;

-- ── Seferi devret ────────────────────────────────────────────────────────────
-- K2 (18.08): elle kurye ataması kalktı; kalan tek istisna SEFER devri — kurye hastalandı, telefon
-- evde kaldı. Devir kuryeyi run'da VE seferin açık siparişlerinde birlikte değiştirir (senkron
-- kuralı: "siparişin kuryesi seferin kuryesinden gelir") — iki yazım tek transaction, yarım devir
-- "kapı kabul etmiyor" diye görünürdü (sahiplik kapıları order.courier_id okuyor).
--
-- SONUÇLANMIŞ duraklara DOKUNULMAZ: teslim edilmiş siparişin kuryesi tarihî gerçektir — ilk yarıyı
-- ilk kurye taşıdıysa teslim kayıtları onda kalır, kalan yol yeni kuryenindir.
create or replace function public.reassign_delivery_run(
  p_run_id uuid,
  p_courier_id uuid,
  p_actor_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run public.delivery_run;
  v_closed public.delivery_run_close;
  v_moved int;
begin
  select * into v_run from public.delivery_run where id = p_run_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Kapanmış sefer devredilemez: mutabakat yapıldı, araç döndü — devredilecek bir yol kalmadı.
  select * into v_closed from public.delivery_run_close where delivery_run_id = p_run_id;
  if found then
    return jsonb_build_object('ok', false, 'reason', 'already_closed');
  end if;

  if v_run.courier_id = p_courier_id then
    return jsonb_build_object('ok', false, 'reason', 'same_courier');
  end if;

  update public.delivery_run set courier_id = p_courier_id where id = p_run_id;

  with moved as (
    update public.order o
       set courier_id = p_courier_id
     where o.delivery_run_id = p_run_id
       and o.status not in ('delivered', 'completed', 'returned', 'cancelled')
     returning o.id
  )
  select count(*) into v_moved from moved;

  return jsonb_build_object('ok', true, 'run_id', p_run_id, 'courier_id', p_courier_id, 'moved_stops', v_moved);
end;
$$;

revoke execute on function public.reassign_delivery_run(uuid, uuid, uuid)
  from public, anon, authenticated;

-- ── Durak sırasını yaz (11.9) ────────────────────────────────────────────────
-- NEDEN RPC: `DeliveryRunService` bilinçli olarak yazımsız (`BaseDbService<DeliveryRun, never, never>`
-- — künyesi: *"Elle insert/update açık değil — ikinci bir yazım yolu…"*). O değişmez korunuyor:
-- sıra da tek kapıdan yazılır.
--
-- **KİLİT BURADA, UYGULAMADA DEĞİL.** `manual` kaynağı motor yazımını reddeder. Kural uygulamada
-- oku-sonra-yaz olarak dursaydı, biri sırayı elle dizerken uçuşta olan bir yeniden hesap onu
-- ezebilirdi — ve bu hiçbir yerde hata vermezdi, yalnız kuryenin dizdiği sıra kaybolurdu.
-- (Elle sıra yüzeyi bugün YOK; kilit alanla birlikte doğuyor ki yüzey geldiği gün eksik olmasın.)
--
-- Sıranın İÇERİĞİ doğrulanmaz — hangi siparişin bu sefere ait olduğu okuma tarafının sorusudur ve
-- orada zaten çözülüyor: dizide olmayan durak düşmez, dizideki yabancı kimlik hiçbir şeye denk
-- gelmez. Burada `not null` bir diziyi yazmak yeterli; ikinci bir doğruluk kapısı, aynı kuralı iki
-- yerde tutmak olurdu.
create or replace function public.set_run_stop_order(
  p_run_id uuid,
  p_order_ids uuid[],
  p_source text,
  p_metric text,
  p_precision text,
  p_actor_id uuid default null,
  p_force boolean default false
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run public.delivery_run;
begin
  select * into v_run from public.delivery_run where id = p_run_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'run_not_found');
  end if;

  -- Kapanmış seferin sırası DONAR: "o gün hangi sırayla gidildi" sorusu geçmişe dönük değişmemeli
  -- (kapanış fotoğrafının `delivered_orders`la aynı gerekçesi).
  if v_run.returned_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'run_closed');
  end if;

  if v_run.stop_order_source = 'manual' and p_source = 'engine' and not p_force then
    return jsonb_build_object('ok', false, 'reason', 'manual_order_kept');
  end if;

  update public.delivery_run
     set stop_order = p_order_ids,
         stop_order_source = p_source,
         stop_order_metric = p_metric,
         stop_order_precision = p_precision,
         -- Damga sonuç BOŞ olsa da vurulur: "hesaplandı, sıralanamadı" da bir cevaptır ve düşmüş
         -- bir sağlayıcının her okumada yeniden dövülmesini bu engelliyor.
         stop_order_generated_at = now(),
         stop_order_by = p_actor_id
   where id = p_run_id;

  return jsonb_build_object('ok', true, 'run_id', p_run_id, 'stops', coalesce(array_length(p_order_ids, 1), 0));
end;
$$;

revoke execute on function public.set_run_stop_order(uuid, uuid[], text, text, text, uuid, boolean)
  from public, anon, authenticated;
