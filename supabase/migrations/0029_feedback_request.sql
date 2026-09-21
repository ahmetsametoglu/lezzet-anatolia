-- Alım-sonrası geri bildirim daveti (DOMAIN §14): teslimden sonra giden kişisel bağlantı, giriş ekranı istemez.

-- İlerleme saklanmaz, siparişin ürünleri ile davetten doğan `product_feedback` kayıtlarından türetilir (`feedback_request_progress`).
-- `completed_at` yine saklanır, çünkü müşteri her ürünü değerlendirmeden bitirebilir ve puan bu damgayla tek kez verilir.

-- Davetin hangi kanaldan gittiği. Müşterinin tercih ettiği kanal değil, DAVETİN kanalı: aynı
-- müşteriye bir kez e-posta bir kez WhatsApp gidebilir ve hangisinin tamamlandığını bilmek,
-- kanalların dönüşümünü karşılaştırmanın tek yolu.
create type feedback_channel as enum ('email', 'whatsapp');

create table public.feedback_request (
  id uuid primary key default gen_random_uuid(),

  order_id uuid not null references public.order (id) on delete cascade,
  customer_id uuid not null references public.user_profiles (id) on delete cascade,

  -- Oturum yerine geçen anahtar kriptografik rastgele üretilir (`readableCode`), çünkü öngörülebilir token komşu davetin siparişini açardı.
  token text not null unique,
  -- Sızan bağlantının ömrünü sınırlar; 90 gün, onuncu günde giden ve bir dakikada biten davet için cömert bir paydır.
  expires_at timestamptz not null default (now() + interval '90 days'),

  channel feedback_channel not null,
  sent_at timestamptz,
  completed_at timestamptz,
  -- Tamamlamada verilen puan. Defterdeki satırın kopyası DEĞİL, davetin kendi kaydı: "bu davet ne
  -- kazandırdı" sorusu, defteri taramadan cevaplanabilmeli.
  points_awarded int check (points_awarded >= 0),
  constraint feedback_request_points_need_completion check (points_awarded is null or completed_at is not null),

  created_at timestamptz not null default now()
);

alter table public.feedback_request enable row level security;

-- **Sipariş başına tek davet.** İkinci bir davet aynı ürünleri ikinci kez sorardı; müşteri için
-- bıkkınlık, veri için gürültü.
create unique index feedback_request_order_key on public.feedback_request (order_id);
create index feedback_request_customer_idx on public.feedback_request (customer_id, created_at desc);
-- Gönderilmeyi bekleyen davetler (tarama işi buradan okur).
create index feedback_request_unsent_idx on public.feedback_request (created_at) where sent_at is null;

-- ── İlerleme ────────────────────────────────────────────────────────────────
-- Siparişteki AYRI ÜRÜN sayısı ile o davetten doğan değerlendirme sayısı. Varyant değil ürün
-- sayılır: değerlendirme ürün düzeyindedir (aynı ürünün iki boyu tek karttır).
create or replace view public.feedback_request_progress with (security_invoker = true) as
select r.id as feedback_request_id,
       r.order_id,
       r.customer_id,
       r.completed_at,
       coalesce(o.product_count, 0) as total_products,
       coalesce(f.rated_count, 0)   as rated_products
  from public.feedback_request r
  left join lateral (
    select count(distinct v.product_id) as product_count
      from public.order_item oi
      join public.product_variant v on v.id = oi.variant_id
     where oi.order_id = r.order_id
  ) o on true
  left join lateral (
    select count(*) as rated_count
      from public.product_feedback pf
     where pf.feedback_request_id = r.id
  ) f on true;

comment on view public.feedback_request_progress is
  'Davetin ilerlemesi — "2/5" siparişten ve değerlendirmelerden TÜRETİLİR, saklanmaz (17.2).';

-- Süzgeç kaynakta, çünkü uygulamada olsaydı davetli siparişler tarama penceresini doldurur ve yenilere sıra gelmezdi.
-- Bekleme süresi (`feedback_delay_days`) motorun kararıdır; görünüm yalnız olguyu verir.
create or replace view public.feedback_due_order with (security_invoker = true) as
select o.id          as order_id,
       o.customer_id,
       o.status,
       d.delivered_at
  from public.order o
  join lateral (
    select min(l.created_at) as delivered_at
      from public.order_status_log l
     where l.order_id = o.id and l.to_status = 'delivered'
  ) d on true
 where o.status in ('delivered', 'completed')
   and d.delivered_at is not null
   and not exists (select 1 from public.feedback_request r where r.order_id = o.id);

comment on view public.feedback_due_order is
  'Daveti bekleyen siparişler — teslim edilmiş, daveti YOK (17.2). Bekleme süresi motorun kararı.';

-- Bekleme süresi ve dış değerlendirme platformu ayardadır, çünkü ikisi de dağıtım beklemeden değişebilen iş kararıdır.
-- `review_platform_url` boş başlar: kayıt açılmadan uydurma adrese yönlendirmektense davet gösterilmez (`feedbackOutcomeOf`).
insert into public.settings (key, value, description) values
  ('feedback_delay_days',   '10',       'Teslimden kaç gün sonra geri bildirim daveti gider. Erken sormak "daha açmadım", geç sormak unutulmuş bir deneyim getirir.'),
  ('review_platform_url',   '""',       'Dış değerlendirme bağlantısı (Google İşletme Profili / Trustpilot). BOŞSA akış sonunda davet gösterilmez.'),
  ('review_platform_name',  '"Google"', 'Değerlendirme platformunun müşteriye gösterilen adı — davet metnindeki "… üzerinde değerlendir".')
on conflict (key) where scope_id is null do nothing;
