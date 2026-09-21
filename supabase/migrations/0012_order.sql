-- Sipariş omurgası: sipariş, kalemleri, kalem–parti eşlemesi, durum geçiş kaydı (kurallar ORDER_LIFECYCLE.md).
-- `status` siparişin yolculuğu, `payment_status` paranın durumu; ikincisi türetilir, elle yazılmaz.

create type order_status as enum (
  'draft', 'confirmed', 'preparing', 'ready', 'out_for_delivery',
  'delivered', 'completed', 'cancelled', 'returned'
);
-- Nereden kapandı — kanaldan bağımsız eksen. Sohbette kurulan sepetin siparişi, ödeme sitede tamamlansa da
-- sohbetin kanalını taşır: satışın kapandığı yer sepetin netleştiği yerdir.
create type order_source as enum ('web', 'whatsapp', 'messenger', 'instagram', 'door', 'manual');
create type payment_status as enum ('pending', 'paid', 'partial', 'refunded');
/**
 * İptalin SEBEBİ (07.14). Serbest metin DEĞİL: ekran buna göre farklı cümle kuruyor ve elle yazılan
 * bir sebep üç dile çevrilemez, süzülemez, sayılamaz.
 *
 * Ayrım paranın yolunu izliyor — müşteriye kurulacak cümlenin dayanağı bu:
 *   · `payment_failed` — ödeme hiç geçmedi. Para ÇEKİLMEDİ.
 *   · `superseded`     — müşteri yeni bir taslak açtı, eskisi süpürüldü. Para ÇEKİLMEDİ.
 *   · `out_of_stock`   — ödeme geçti ama mal kalmadı → otomatik iade. **Para ÇEKİLDİ ve İADE EDİLDİ.**
 *   · `customer`       — müşteri iptal etti.
 *   · `staff`          — operasyon iptal etti.
 */
create type order_cancel_reason as enum ('payment_failed', 'superseded', 'out_of_stock', 'customer', 'staff');
-- `on_account` (vadeli) BU LİSTEDE DEĞİL: vade bir yöntem değil, siparişin bayrağıdır (DOMAIN §7).
create type payment_method as enum ('online', 'cash', 'card', 'cheque', 'bank_transfer');
-- Mal müşteriye nasıl ulaşır: bizim aracımız · taşıyıcı · müşterinin kendisi (`pickup`: yerinde satışta mal
-- gitmez). Varsayılana düşen yerinde satış rota sayılsaydı teslimat tipine göre kırılan her rapor yanılırdı.
create type delivery_type as enum ('route', 'shipping', 'pickup');
-- Kargo taşıyıcısı: tanımlı küme, çünkü takip bağlantısı URL kalıbından üretilir; `other` yeni taşıyıcı
-- migration beklemesin diye.
create type carrier as enum ('colissimo', 'chronopost', 'dhl', 'ups', 'other');
create type vat_treatment as enum ('domestic', 'intra_eu_b2b_reverse_charge');
-- İade edilen kalemde MALA ne oldu (DOMAIN §8). `goodwill` = mal müşteride kaldı.
create type return_disposition as enum ('restock', 'discard', 'goodwill');

create table public.order (
  id uuid primary key default gen_random_uuid(),
  -- "Hesapsız sipariş yoktur" (DOMAIN §10): her sipariş doğrulanmış bir kimliğe bağlıdır.
  customer_id uuid not null references public.user_profiles (id) on delete restrict,
  -- *Kim* alıyor — müşteri tipinden TÜRETİLİR ve sipariş anında sabitlenir (sonra değişmez).
  channel channel not null,
  order_source order_source not null default 'web',
  -- Patron ikramı: yalnız muhasebe export'una girmez; gelir/kâr/kasa tam normal (DOMAIN §9).
  is_gift_order boolean not null default false,

  status order_status not null default 'draft',
  -- Neden iptal oldu (`null` = iptal edilmedi): müşteriye doğru cümle kurulur, çünkü stok bitince otomatik
  -- iade edilen siparişte para çekilip geri verilmiştir ve `payment_status` bunu ayırmaz.
  cancel_reason order_cancel_reason,
  -- Sağlayıcıya iade damgası: sebepten ayrı soru ("para çekilip geri verildi mi"), webhook'un geç ödeme iadesinde
  -- sebep `superseded` kalırken para dönmüştür. Tarih, çünkü destek konuşmasının ilk sorusu "ne zaman"dır.
  provider_refunded_at timestamptz,
  -- Sağlayıcıdaki ödeme kimliği (Stripe PaymentIntent): webhook gelmezse ödeme sayfası ve zamanlayıcı "ödendi mi"
  -- diye bununla sorar, yeni denemede eski ödeme iptal edilir. Kısmi unique: bir ödeme tek siparişe bağlanır.
  payment_ref text,
  -- TÜRETİLİR (net tahsilat vs karşılanan tutar) — elle set edilmez, motor hesaplar (03.6).
  payment_status payment_status not null default 'pending',
  payment_method payment_method,
  -- Vadeli mi: yalnız `credit_enabled` müşteride true; peşin ödemesiz `confirmed` olur (DOMAIN §7).
  on_account boolean not null default false,

  -- Sipariş tek depodan çıkar ve varsayılan depo yoktur; partilerin bu depodan olduğunu 0031'deki ertelenmiş
  -- kısıt tutar. FK yok: `warehouse` 0031'de açılır.
  warehouse_id uuid not null,

  delivery_type delivery_type not null default 'route',
  -- FK YOK: `delivery_zone` tablosu 07.2'de açılıyor. Zone düzenlenebilir olduğu için bu alan
  -- aynı zamanda SNAPSHOT'tır — sonradan bölge sınırı değişse sipariş bozulmaz.
  delivery_zone_id uuid,
  delivery_date date,                                -- rota günü; kargoda null
  -- Komşu davetinden mi geldi; kullanım bu kolondan sayılır, azalan sayaç iptalde geri alınmayı unuturdu.
  -- FK yok: `neighbor_invite` 0044'te açılır.
  neighbor_invite_id uuid,
  address_id uuid references public.address (id) on delete set null,
  -- Adresin sipariş anındaki kopyası: adres sonradan düzeltilse bile sipariş neyi nereye gönderdiğini bilir.
  address_snapshot jsonb,
  courier_id uuid references public.user_profiles (id) on delete set null,
  -- Hangi gerçekleşen seferle gitti; yalnız `start_delivery_run` yazar, teslimle donar.
  -- FK yok: `delivery_run` 0046'da açılır.
  delivery_run_id uuid,
  delivery_country country_code not null default 'FR', -- DE B2C → OSS eşiği izlemi (DOMAIN §5)

  vat_number_snapshot text,                          -- reverse charge'da o anki geçerli no (denetim kanıtı)
  vat_treatment vat_treatment not null default 'domestic',

  -- Siparişin dili: sipariş mailleri profilden değil buradan okunur, profil sonradan değişebilir.
  -- NULL = bilinmiyor → okuyan taraf profilin diline düşer.
  locale preferred_language,

  -- Sistemin ürettiği referans (LA-26-7K4M2P) — resmî fatura no DEĞİL. İLK KALICI DURUMDA üretilir
  -- (`confirmed`, hızlı satışta `completed`); draft'ta null olduğu için kısmi unique.
  reference_no text,
  -- Çift sipariş kalkanı: aynı "Siparişi onayla" isteği ikinci kez ulaşırsa (çift tıklama, ağın
  -- yeniden denemesi) ikinci SİPARİŞ açılmaz — anahtar aynıysa var olan sipariş döner. Kısmi unique:
  -- anahtarsız satırlar (operasyon girişi, hızlı satış) birbirini engellemez.
  idempotency_key text,
  invoice_no text,                                   -- dış muhasebeden sonradan eşleşir
  delivery_proof jsonb,                              -- imza/foto + onaylayan + zaman (DOMAIN §6)

  -- Kargo künyesi — yalnız kargo siparişinde anlamlı; `other` seçilince takip bağlantısı gösterilmez.
  carrier carrier,
  tracking_number text,
  -- Rota siparişine kargo künyesi YAZILAMAZ: kendi aracımızla giden malın taşıyıcısı ve takip
  -- numarası yoktur. Kural veride durur çünkü ekran unutabilir; unutulduğunda müşteri hiç
  -- çalışmayacak bir takip bağlantısı görürdü.
  constraint order_carrier_only_shipping check (delivery_type = 'shipping' or (carrier is null and tracking_number is null)),

  -- Para (DOMAIN §5). Kargo ücreti KDV'ye tabidir.
  shipping_fee numeric(10, 2) not null default 0,
  -- `ordered_total` sipariş anında anlaşılan tutar, donuktur (ödeme niyeti, vade limiti, onay maili).
  -- `revenue_total` gerçekleşen ciro, kalemlerden tetikleyiciyle türer; rapor SQL'den okuduğu için saklanır.
  ordered_total numeric(10, 2) not null default 0,
  revenue_total numeric(10, 2) not null default 0,
  discount_id uuid,                                  -- FK YOK: `discount` tablosu 09'da; tek indirim (üst üste binmez)
  discount_amount numeric(10, 2) not null default 0,
  -- İndirimin müşteriye görünen adı, sipariş anındaki hâliyle: kampanya sonradan değişse de belgenin metni değişmemeli.
  -- NULL = ad verilmemiş → yüzey genel "İndirim" sözcüğüne düşer.
  discount_label jsonb,
  -- CACHE — kaynak `MoneyMovement` (modül 12). Ödeme durumu bunlardan TÜRETİLİR.
  amount_collected numeric(10, 2) not null default 0,
  amount_refunded numeric(10, 2) not null default 0,
  -- Kapanışta sabitlenen maliyetler (kâr hesabı, DOMAIN §12).
  cogs_amount numeric(10, 2),
  delivery_cost numeric(10, 2),
  payment_fee numeric(10, 2),
  packaging_cost numeric(10, 2),

  created_at timestamptz not null default now()
);

-- Referans müşteriye söylenen numaradır: iki siparişte aynı olamaz. Draft'ta null (kısmi indeks).
create unique index order_reference_key on public.order (reference_no) where reference_no is not null;
create unique index order_idempotency_key on public.order (idempotency_key) where idempotency_key is not null;
create unique index order_payment_ref on public.order (payment_ref) where payment_ref is not null;
-- Müşteri sipariş geçmişi (sonsuz kaydırma).
create index order_customer_idx on public.order (customer_id, created_at desc);
-- Operasyon kuyruğu: "bu depoda bugün hazırlanacaklar", "yolda olanlar". Baş kolon depo (DOMAIN §17):
-- depocu yalnız kendi deposunun kuyruğunu görür, depo-üstü tarama yalnız admin ekranının işidir.
create index order_status_idx on public.order (warehouse_id, status, delivery_date);
-- Kuryenin günü.
create index order_courier_idx on public.order (courier_id, delivery_date) where courier_id is not null;

-- Kanal donar: KDV işlemesini ve fiyat kademesini belirlediği için sonradan değişmesi alınmış paranın vergisini
-- geriye dönük oynatırdı. Şema kendi kapısını korur; doğrudan SQL yazan betiği yalnız bu tetikleyici durdurur.
create function public.order_channel_frozen() returns trigger
language plpgsql
as $$
begin
  if new.channel <> old.channel then
    raise exception 'Siparişin kanalı değiştirilemez (%→%) — kanal sipariş açılırken türetilir ve donar.',
      old.channel, new.channel
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger order_channel_frozen
  before update of channel on public.order
  for each row
  execute function public.order_channel_frozen();

create table public.order_item (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.order (id) on delete cascade,
  variant_id uuid not null references public.product_variant (id) on delete restrict,
  qty int not null check (qty > 0),
  -- FİZİKSEL olarak müşteriye giden miktar (varsayılan = qty; eksikte düşer, 0 olabilir).
  -- `goodwill` iadesinde DÜŞMEZ — mal müşteride kalmıştır (DOMAIN §8).
  fulfilled_qty int not null default 0 check (fulfilled_qty >= 0),
  -- Partiye çıpalı teklif satırıysa hangi parti; fiilen çıkan partiler `order_item_batch`'te.
  stock_id uuid references public.stock (id) on delete set null,
  -- Kalem hangi paketten geldi (DOMAIN §13): müşteriye "Bayram Paketi" olarak gruplu göstermek ve
  -- raporlamak için. `restrict` — sipariş görmüş paket SİLİNEMEZ, pasife alınır: geçmişin grup
  -- etiketini sessizce boşaltmak, siparişi "tek tek alınmış" gibi göstermek olurdu.
  bundle_id uuid references public.bundle (id) on delete restrict,
  unit_price numeric(10, 2) not null,                -- CHECKOUT BAŞLANGICINDA sabitlenir (DOMAIN §5)
  -- Pazarlık izi: üstüne yazılmadan önceki liste fiyatı; kampanya indirimi ile kişisel taviz ayrı yönetilsin diye
  -- `line_discount_amount`a girmez (o kotayı tüketir). `null` = pazarlık olmadı; taviz imzalı türetilir.
  list_unit_price numeric(10, 2) check (list_unit_price >= 0),
  -- Kim değiştirdi; `restrict`, çünkü iz sahipsiz kalırsa "kim verdi" sorusu cevapsızdır.
  price_set_by uuid references public.user_profiles (id) on delete restrict,
  -- Yarım iz diye bir şey yoktur: ya ikisi de yazılır ya hiçbiri. Tek başına bir liste fiyatı
  -- "birileri indirdi" der ama kimin indirdiğini söylemez — kaydın kendisi soruyu açar, cevabı
  -- vermez.
  constraint order_item_negotiation_complete check ((list_unit_price is null) = (price_set_by is null)),
  -- Sepet/kupon indiriminin bu kaleme ORANSAL payı — kısmi iade ve kalem KDV'si indirimli birimden
  -- hesaplanır, sonradan hesap belirsizliği kalmaz (DOMAIN §5).
  line_discount_amount numeric(10, 2) not null default 0,
  vat_rate numeric(4, 2) not null,
  return_disposition return_disposition,
  -- Akıbetin gerekçesi: "stoğa dön"ün zorunlu soğuk zincir beyanı. Kaleme yazılır, çünkü beyan malın kendisi
  -- hakkındadır ve stok hareketi onun sonucudur.
  return_note text
);
create index order_item_order_idx on public.order_item (order_id);
-- "Bu ürün hangi siparişlere gitti" (geri çağırma ve satış analizi).
create index order_item_variant_idx on public.order_item (variant_id);

/*
  ═══ CİRO KALEMLERDEN TÜRER (01.09) ═══════════════════════════════════════════════════════════

  `order.revenue_total` bir CACHE'tir; kaynağı `order_item.fulfilled_qty`dir. Kural
  `resync_order_amounts`ın (0018) aynısı: **cache artırılmaz, kaynaktan yeniden hesaplanır.**
  `revenue_total = revenue_total + x` yazsaydık kaçırılan ya da tekrarlanan her çağrı kalıcı bir
  sapma bırakırdı ve hangisinin kaydırdığı bulunamazdı.

  ── NEDEN TETİKLEYİCİ, NEDEN UYGULAMA KATMANI DEĞİL ─────────────────────────────────────────
  `fulfilled_qty` BEŞ yerden yazılıyor ve hepsi SQL: `record_preparation` (0015) ·
  `adjust_fulfillment` (0020, iki dal: hedef değer ve tam iade) · `quick_sale` (0017) · kutu
  kapanışı (0048, `record_preparation`ı çağırır). TypeScript bu fonksiyonların içini görmez —
  yeniden hesaplama uygulama katmanına yazılsaydı bu yolların bazısı onu atlar ve `revenue_total`
  kalemlerle SESSİZCE ayrışırdı. Yakalayacak bir kısıt da yok. Tetikleyici hepsini kapsıyor, ve
  yarın altıncı bir yol açılsa onu da kapsar.

  ── FORMÜL MOTORUN AYNISI (`fulfilledLineAmountCents`) ──────────────────────────────────────
  İndirim payı kalemin TAMAMI için yazılmıştır; karşılanan orana bölünür — yarısı gittiyse
  indirimin yarısı düşülür. Yuvarlama kuruşta (`round(..., 2)`), TypeScript tarafı da tamsayı
  cent üstünde yuvarlıyor: aynı sonuç.

  ── KARGO: HİÇBİR KALEM GİTMEDİYSE CİROYA GİRMEZ ────────────────────────────────────────────
  Motorun kararı birebir (`payment-status.ts`): en az bir kalem gittiyse taşıma hizmeti
  verilmiştir. Hiçbiri gitmediyse kargo da iade edilir, ciro sıfırdır.
*/
create or replace function public.resync_order_revenue(p_order_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.order o
     set revenue_total = coalesce(k.tutar, 0)
                       + case when coalesce(k.giden, 0) > 0 then o.shipping_fee else 0 end
    from (
      select coalesce(sum(
               oi.fulfilled_qty * oi.unit_price
               - round(oi.line_discount_amount * oi.fulfilled_qty / greatest(oi.qty, 1), 2)
             ), 0) as tutar,
             coalesce(sum(oi.fulfilled_qty), 0) as giden
        from public.order_item oi
       where oi.order_id = p_order_id
    ) k
   where o.id = p_order_id;
$$;

create or replace function public.order_item_revenue_sync()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Silmede satır artık yok; kimliği OLD taşır. Kalem başka siparişe taşınmaz (order_id sabit),
  -- yani tek sipariş yeniden hesaplanır.
  perform public.resync_order_revenue(coalesce(new.order_id, old.order_id));
  return null;
end;
$$;

-- `after` ve `for each row`: yazım tamamlandıktan sonra okuyup toplar. `statement` düzeyi tek
-- turda birden çok siparişin kalemi yazıldığında hangisini tazeleyeceğini bilemezdi.
create trigger order_item_revenue_sync_trg
after insert or update of fulfilled_qty, qty, unit_price, line_discount_amount or delete
on public.order_item
for each row execute function public.order_item_revenue_sync();

revoke execute on function public.resync_order_revenue(uuid) from public, anon, authenticated;

-- Hazırlıkta fiilen çıkan parti(ler) — depocu FEFO önerisini onaylarken yazılır (DOMAIN §4).
-- İki şeyi mümkün kılar: geri çağırmada "bu parti kimlere gitti" TEK sorgu, ve gerçek COGS.
create table public.order_item_batch (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_item (id) on delete cascade,
  stock_id uuid not null references public.stock (id) on delete restrict,
  qty int not null check (qty > 0)
);
create index order_item_batch_item_idx on public.order_item_batch (order_item_id);
-- Geri çağırma (rappel): partiden siparişe.
create index order_item_batch_stock_idx on public.order_item_batch (stock_id);

-- "Her geçiş kaydedilir" (ORDER_LIFECYCLE). Teslim anı, kapanış anı ve geri bildirim zamanlaması
-- (~10 gün) bu tablodan TÜRETİLİR — ayrı `delivered_at`/`completed_at` kolonu tutulmaz.
create table public.order_status_log (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.order (id) on delete cascade,
  from_status order_status,                          -- ilk kayıtta null (siparişin doğuşu)
  to_status order_status not null,
  actor_id uuid references public.user_profiles (id) on delete set null, -- sistem olayında null
  -- Geçişe bağlı serbest bağlam — kuryenin "teslim edilemedi" notu ("zil bozuk") gibi. Ayrı tablo
  -- değil: not tek başına değil, O GEÇİŞLE anlamlı (yarınki deneme dünkü sebebi buradan okur).
  note text,
  created_at timestamptz not null default now()
);
create index order_status_log_order_idx on public.order_status_log (order_id, created_at);
-- "Şu tarihte teslim edilenler" — geri bildirim daveti ve analitik bu yolu kullanır.
create index order_status_log_to_idx on public.order_status_log (to_status, created_at desc);

alter table public.order enable row level security;
alter table public.order_item enable row level security;
alter table public.order_item_batch enable row level security;
alter table public.order_status_log enable row level security;

-- Durum geçişi RPC'de: eşzamanlı iki ilerletme birbirini ezmesin ve durum ile log birlikte yazılsın.
-- Geçişin izni motorundur; buradaki tek kural kaynaktan ilerletebilmektir.
create or replace function public.transition_order_status(
  p_order_id uuid,
  p_from order_status,
  p_to order_status,
  p_actor_id uuid default null,
  p_reference_no text default null,                  -- ilk kalıcı durumda üretilen referans (motor verir)
  p_note text default null                           -- geçişe bağlı serbest bağlam (ör. kurye notu)
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current order_status;
begin
  -- Koşullu ilerletme: yalnız beklenen kaynaktan. Satır kilitli okunur ki araya girilmesin.
  select status into v_current from public.order where id = p_order_id for update;

  if not found then
    raise exception 'transition_order_status: sipariş bulunamadı (%)', p_order_id;
  end if;

  if v_current <> p_from then
    -- Başkası ilerletmiş: sessizce ezmek yerine çağıranı bilgilendir (yeniden karar versin).
    return jsonb_build_object('ok', false, 'reason', 'stale', 'current_status', v_current);
  end if;

  update public.order
     set status = p_to,
         -- Referans BİR KEZ üretilir: sonradan gelen değer mevcut numarayı ezemez.
         reference_no = coalesce(reference_no, p_reference_no)
   where id = p_order_id;

  insert into public.order_status_log (order_id, from_status, to_status, actor_id, note)
  values (p_order_id, p_from, p_to, p_actor_id, p_note);

  return jsonb_build_object('ok', true, 'current_status', p_to);
end;
$$;

revoke execute on function public.transition_order_status(uuid, order_status, order_status, uuid, text, text)
  from public, anon, authenticated;


-- Müşterinin ciro ve sipariş sayısı ayrı fonksiyon, çünkü `order_counts`un müşteri süzgeci terimsiz çağrıda uygulanmaz;
-- iptal ciroya girmez, iade girer. BEKLEYEN(12.25): sütun `revenue` ama taban `ordered_total`.
create or replace function public.customer_order_totals(p_customer_id uuid)
returns table (order_count int, revenue numeric)
language sql
stable
as $$
  select count(*)::int, coalesce(sum(o.ordered_total), 0)
    from public.order o
   where o.customer_id = p_customer_id
     and o.status <> 'draft'
     and o.status <> 'cancelled';
$$;

-- Sipariş ekranının sekme sayaçları ve alt toplamı tek okumada; sayılar süzgecin tamamına aittir, sayfaya değil.
-- İş kuralı taşımaz: "açık tutar" ve vade gecikmesi motorda, arama ölçütü `UserProfileService.search`te.
create or replace function public.order_counts(
  p_reference text default null,
  p_customer_ids uuid[] default null,
  p_channel text default null,
  p_source text default null,
  p_delivery_type text default null,
  p_payment_status text default null,
  p_from date default null,
  p_to date default null,
  -- Depo süzgeci bir küme: `null` depo-üstü, dolu dizi kapsamdaki depolar; boş dizi hiçbir satırla eşleşmez
  -- (kapsamsız personel hiçbir şey görmez).
  p_warehouse_ids uuid[] default null
)
returns table (
  by_status jsonb,
  total int,
  sum_total numeric,
  sum_collected numeric,
  sum_refunded numeric,
  cod_count int,
  cod_total numeric,
  cod_collected numeric,
  cod_refunded numeric,
  -- Sayılan iş iptal hariç: `by_status` iptal sekmesini beslediği için toplam iptali içerir, ama panelin
  -- "bugünkü sipariş/ciro" kartı bir iş ölçüsüdür.
  active_count int,
  active_total numeric
)
language sql
stable
as $$
  with base as (
    -- Taban sipariş edilen tutar: sayaçlar "ne kadarlık iş var" der (BEKLEYEN(12.25)).
    select o.status, o.ordered_total as total, o.amount_collected, o.amount_refunded, o.payment_method,
           o.on_account, o.payment_status
    from public.order o
    where o.status <> 'draft'
      and (p_warehouse_ids is null or o.warehouse_id = any (p_warehouse_ids))
      and (p_channel is null or o.channel = p_channel::channel)
      and (p_source is null or o.order_source = p_source::order_source)
      and (p_delivery_type is null or o.delivery_type = p_delivery_type::delivery_type)
      and (p_payment_status is null or o.payment_status = p_payment_status::payment_status)
      and (p_from is null or o.delivery_date >= p_from)
      and (p_to is null or o.delivery_date <= p_to)
      and (
        p_reference is null or p_reference = ''
        or o.reference_no ilike '%' || p_reference || '%'
        or (p_customer_ids is not null and o.customer_id = any (p_customer_ids))
      )
  ),
  -- Kapıda tahsilat: peşin ödenmemiş, vadeye yazılmamış, yöntemi kapı yöntemi olan sipariş. İptal edilen
  -- siparişten para beklenmez; eleme `base`te değil, çünkü iptal sekmesi iptalleri göstermeli.
  cod as (
    select * from base
    where status <> 'cancelled' and payment_status <> 'paid' and not on_account and payment_method in ('cash', 'card')
  )
  select
    coalesce(
      (select jsonb_object_agg(status, n) from (select status, count(*)::int as n from base group by status) s),
      '{}'::jsonb
    ),
    (select count(*) from base)::int,
    (select coalesce(sum(total), 0) from base),
    (select coalesce(sum(amount_collected), 0) from base),
    (select coalesce(sum(amount_refunded), 0) from base),
    (select count(*) from cod)::int,
    (select coalesce(sum(total), 0) from cod),
    (select coalesce(sum(amount_collected), 0) from cod),
    (select coalesce(sum(amount_refunded), 0) from cod),
    (select count(*) from base where status <> 'cancelled')::int,
    (select coalesce(sum(total), 0) from base where status <> 'cancelled');
$$;

-- Operasyon okumasıdır; müşteri yüzeyine açılmaz.
revoke execute on function public.order_counts(text, uuid[], text, text, text, text, date, date, uuid[]) from public;
grant execute on function public.order_counts(text, uuid[], text, text, text, text, date, date, uuid[]) to service_role;


-- ═══ SEPET ═══

-- Sunucu sepeti: sahibi başına tek satır (müşteri ya da kimliksiz sohbet, ikisi de `unique`); stok ayrılmaz,
-- rezervasyon checkout'ta yapılır. Kalemler jsonb, çünkü sepet sorgulanmaz, okunur.

create table public.cart (
  id uuid primary key default gen_random_uuid(),
  -- Müşteri sepeti — "tek satır / müşteri" kuralı `unique` ile şemada. `null` = sohbet sepeti.
  customer_id uuid unique references public.user_profiles (id) on delete cascade,
  -- `unitPrice` bağlayıcı değildir, gösterim ve değişiklik tespiti içindir: fiyat checkout başında sabitlenir,
  -- aylarca bekleyen sepetin fiyatı bağlayıcı sayılsaydı donuk gıdada zarar doğardı.
  items jsonb not null default '[]'::jsonb,
  -- Sonraya kaydedilenler: teslimat yerine gönderilemeyen ürün silinmez, buraya taşınır. Aynı satırda, çünkü
  -- ikisi aynı niyetin iki hâli; ayrı tablo iki yazma yolu açardı.
  saved_items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  -- Sohbet sepeti: kimliksiz sohbetin niyeti; FK 0055'te, çünkü `conversation` bu dosyadan sonra doğar.
  conversation_id uuid unique,
  -- Sepete dokunan sohbet: checkout siparişin kaynağını bu sohbetin kanalından yazar. Sahiplik değil iz;
  -- FK 0055'te (`set null`).
  source_conversation_id uuid
);

alter table public.cart enable row level security;
