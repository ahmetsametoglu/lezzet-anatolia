-- Modül 07 — Sipariş omurgası (07.6): sipariş, kalemleri, kalem-parti eşlemesi, durum geçiş kaydı.
-- Kurallar: ORDER_LIFECYCLE.md (tamamı), DOMAIN §5 (fiyat/indirim), §6 (teslimat), §7 (ödeme), §8 (kısmi).
--
-- İki eksen ayrıdır ve karıştırılmaz: `status` siparişin YOLCULUĞU (ORDER_LIFECYCLE),
-- `payment_status` PARANIN durumu — ikincisi TÜRETİLİR, elle set edilmez (DOMAIN §7, motor 03.6).

create type order_status as enum (
  'draft', 'confirmed', 'preparing', 'ready', 'out_for_delivery',
  'delivered', 'completed', 'cancelled', 'returned'
);
-- *Nereden kapandı* — kanaldan (b2b/b2c) BAĞIMSIZ eksen (CHANNELS §2).
create type order_source as enum ('web', 'whatsapp', 'door', 'manual');
create type payment_status as enum ('pending', 'paid', 'partial', 'refunded');
-- `on_account` (vadeli) BU LİSTEDE DEĞİL: vade bir yöntem değil, siparişin bayrağıdır (DOMAIN §7).
create type payment_method as enum ('online', 'cash', 'card', 'cheque', 'bank_transfer');
create type delivery_type as enum ('route', 'shipping');
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
  -- TÜRETİLİR (net tahsilat vs karşılanan tutar) — elle set edilmez, motor hesaplar (03.6).
  payment_status payment_status not null default 'pending',
  payment_method payment_method,
  -- Vadeli mi: yalnız `credit_enabled` müşteride true; peşin ödemesiz `confirmed` olur (DOMAIN §7).
  on_account boolean not null default false,

  delivery_type delivery_type not null default 'route',
  -- FK YOK: `delivery_zone` tablosu 07.2'de açılıyor. Zone düzenlenebilir olduğu için bu alan
  -- aynı zamanda SNAPSHOT'tır — sonradan bölge sınırı değişse sipariş bozulmaz.
  delivery_zone_id uuid,
  delivery_date date,                                -- rota günü; kargoda null
  address_id uuid references public.address (id) on delete set null,
  -- Adresin sipariş anındaki kopyası: adres sonradan düzeltilse bile sipariş neyi nereye gönderdiğini bilir.
  address_snapshot jsonb,
  courier_id uuid references public.user_profiles (id) on delete set null,
  delivery_country country_code not null default 'FR', -- DE B2C → OSS eşiği izlemi (DOMAIN §5)

  vat_number_snapshot text,                          -- reverse charge'da o anki geçerli no (denetim kanıtı)
  vat_treatment vat_treatment not null default 'domestic',

  -- SİPARİŞİN DİLİ — müşterinin bu siparişi verirken okuduğu dil (14.5). Sipariş maillerinin dili
  -- buradan gelir, profilden DEĞİL: profil sonradan değişebilir (hesap ekranından, ya da aynı şirket
  -- hesabından başka biri sipariş verince) ve o an eski siparişin maili dil değiştirirdi. Aynı gerekçe
  -- `address_snapshot`'ta da geçerli: siparişe ait olan bilgi siparişte durur.
  --
  -- NULL = "bilinmiyor" → okuyan taraf profilin `preferred_language`'ına düşer. Web checkout dolduruyor;
  -- hızlı satış ve operasyon girişi doldurmuyor — orada müşterinin okuduğu bir yüzey yok, tahmin de yok.
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

  -- Para (hepsi sipariş anında sabit; DOMAIN §5). Kargo ücreti KDV'ye tabidir.
  shipping_fee numeric(10, 2) not null default 0,
  total numeric(10, 2) not null default 0,           -- Σ kalem − indirim + kargo
  discount_id uuid,                                  -- FK YOK: `discount` tablosu 09'da; tek indirim (üst üste binmez)
  discount_amount numeric(10, 2) not null default 0,
  -- İnen indirimin MÜŞTERİYE GÖRÜNEN adı, sipariş anındaki hâliyle ({"fr":"Offre de bienvenue",...}).
  -- Neden kopya: kampanya sonradan yeniden adlandırılabilir, süresi dolabilir, silinebilir; ama o
  -- siparişin maili ve fişi ne dediyse onu demeye devam etmeli. `discount_id` üzerinden okusaydık
  -- geçmiş bir belgenin metni bugünkü tanıma göre değişirdi. NULL = ad verilmemiş → yüzey genel
  -- "İndirim / Remise / Rabatt"a düşer.
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
-- Müşteri sipariş geçmişi (sonsuz kaydırma).
create index order_customer_idx on public.order (customer_id, created_at desc);
-- Operasyon kuyruğu: "bugün hazırlanacaklar", "yolda olanlar".
create index order_status_idx on public.order (status, delivery_date);
-- Kuryenin günü.
create index order_courier_idx on public.order (courier_id, delivery_date) where courier_id is not null;

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
  -- Sepet/kupon indiriminin bu kaleme ORANSAL payı — kısmi iade ve kalem KDV'si indirimli birimden
  -- hesaplanır, sonradan hesap belirsizliği kalmaz (DOMAIN §5).
  line_discount_amount numeric(10, 2) not null default 0,
  vat_rate numeric(4, 2) not null,
  return_disposition return_disposition
);
create index order_item_order_idx on public.order_item (order_id);
-- "Bu ürün hangi siparişlere gitti" (geri çağırma ve satış analizi).
create index order_item_variant_idx on public.order_item (variant_id);

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
  created_at timestamptz not null default now()
);
create index order_status_log_order_idx on public.order_status_log (order_id, created_at);
-- "Şu tarihte teslim edilenler" — geri bildirim daveti ve analitik bu yolu kullanır.
create index order_status_log_to_idx on public.order_status_log (to_status, created_at desc);

alter table public.order enable row level security;
alter table public.order_item enable row level security;
alter table public.order_item_batch enable row level security;
alter table public.order_status_log enable row level security;

-- ── Durum geçişi (07.6) ──────────────────────────────────────────────────────
-- NEDEN RPC: iki koşul birden (STACK §13). (a) Eşzamanlılık: iki kişi aynı siparişi aynı anda
-- ilerletebilir (depocu "hazır" derken kurye "yolda" der) — koşullu update olmadan biri diğerini
-- sessizce ezer. (b) Bölünemez yazım: durum + log satırı birlikte yazılmalı; log düşerse teslim anı
-- ve geri bildirim zamanlaması izsiz kalır.
--
-- Fonksiyon geçişin İZİNLİ olup olmadığına KARAR VERMEZ — o motorun işi (domain-core/status-machine).
-- Buradaki tek kural fiziksel gerçektir: kaynağından ilerletebilirsin, başkası ilerlettiyse ilerletemezsin.
create or replace function public.transition_order_status(
  p_order_id uuid,
  p_from order_status,
  p_to order_status,
  p_actor_id uuid default null,
  p_reference_no text default null                   -- ilk kalıcı durumda üretilen referans (motor verir)
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

  insert into public.order_status_log (order_id, from_status, to_status, actor_id)
  values (p_order_id, p_from, p_to, p_actor_id);

  return jsonb_build_object('ok', true, 'current_status', p_to);
end;
$$;

revoke execute on function public.transition_order_status(uuid, order_status, order_status, uuid, text)
  from public, anon, authenticated;


-- Sipariş ekranının sekme sayaçları ve alt şerit toplamı — TEK okuma (09.7 · STACK §13).
--
-- Tasarım altı sekme gösteriyor ve her birinin yanında canlı bir sayı var ("Hazırlanıyor 6"), altta
-- da özet şerit ("24 sipariş · toplam 3.842 € · kapıda tahsilat 504,50 €"). Bu sayılar SAYFANIN
-- değil, süzgecin TAMAMININ sayılarıdır: yüklenmiş ilk sayfadan hesaplanan sekme sayacı, listenin
-- kuyruğunu sessizce yutar ve operatör "bugün altı işim var" diye yanlış karar verir.
--
-- Altı sekme için altı `HEAD` sayım + üç toplam için ayrı okumalar = dokuz tur. Burada bir tur.
--
-- FONKSİYON İŞ KURALI TAŞIMAZ (`product_counts` ile aynı çizgi): yalnız mekanik eşleşme ve toplama
-- yapar. Özellikle:
--   · "Açık tutar" formülü (toplam − tahsil + iade) BURADA YOK — üç kolonun toplamı ayrı ayrı
--     dönüyor, formülü motor uyguluyor (`openAmountCents`). Toplama doğrusal olduğu için sonuç
--     birebir aynı; ama kural tek yerde kalıyor.
--   · Vade gecikmesi de yok: o müşterinin `payment_term_days`'ine ve BUGÜNE bağlı bir karardır,
--     satır satır motorda hesaplanır (checkout freniyle aynı tanım). SQL'e kopyalansaydı iki yer
--     bir gün ayrışırdı.
--
-- TASLAK SİPARİŞ SAYILMAZ: `draft` yarım kalmış bir checkout'tur, sipariş değil — operasyon
-- listesinde görünmez, sayacı da şişirmez. (TTL süpürücüsü onları `cancelled`'a çeker.)
-- ARAMA BURADA TANIMLANMAZ: "müşterinin neyinde aranır" (ad · telefon · e-posta) sorusunun cevabı
-- `UserProfileService.search`'te duruyor ve liste de sayaç da AYNI sonucu kullanmalı. Bu yüzden
-- fonksiyon müşteri kimliklerini hazır alır; kendi başına `user_profiles`'a join atıp ölçütü
-- kopyalasaydı sayaç ile listenin bir gün farklı sayı söylemesi kaçınılmazdı.
create or replace function public.order_counts(
  p_reference text default null,
  p_customer_ids uuid[] default null,
  p_channel text default null,
  p_source text default null,
  p_delivery_type text default null,
  p_payment_status text default null,
  p_from date default null,
  p_to date default null
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
  cod_refunded numeric
)
language sql
stable
as $$
  with base as (
    select o.status, o.total, o.amount_collected, o.amount_refunded, o.payment_method,
           o.on_account, o.payment_status
    from public.order o
    where o.status <> 'draft'
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
  -- Kapıda tahsilat: peşin ödenmemiş, vadeye de yazılmamış, yöntemi kapı yöntemi olan sipariş.
  -- Yöntem eşlemesi bir KURAL değil, enum'ın kendi anlamıdır (online = önceden ödendi).
  cod as (
    select * from base
    where payment_status <> 'paid' and not on_account and payment_method in ('cash', 'card')
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
    (select coalesce(sum(amount_refunded), 0) from cod);
$$;

-- Operasyon okumasıdır; müşteri yüzeyine açılmaz.
revoke execute on function public.order_counts(text, uuid[], text, text, text, text, date, date) from public;
grant execute on function public.order_counts(text, uuid[], text, text, text, text, date, date) to service_role;
