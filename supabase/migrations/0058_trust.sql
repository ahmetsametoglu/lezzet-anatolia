-- Güven defteri: müşterinin sadakatini ve işletmeye faydasını ölçen tavsiye puanı. Sadakat puanından (`points_entry`) ayrı, çünkü
-- o müşterinin harcayabildiği bir değerdir; bu ise müşteriye görünmez, B2B'yi de kapsar ve eksi hareket taşır.

create type trust_reason as enum (
  -- Artı: teslim edilen sipariş, davet ve katılım (davet, yorum, anket, ziyaret sadakat defterinin kararından okunur).
  'order_delivered',
  'referral',
  'neighbor',
  'review',
  'feedback',
  'visit',
  -- Eksi: müşterinin kendi davranışı; ödeme hatası ve stok yetmezliği iptali müşterinin kusuru olmayabileceği için burada yok.
  'order_cancelled',
  'delivery_refused',
  'order_returned',
  'delivery_unreachable',
  'payment_uncollected',
  'payment_overdue'
);

create table public.trust_entry (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.user_profiles (id) on delete cascade,
  -- Yazım anındaki ağırlık; ağırlık sonradan değişirse geçmiş yeniden yazılmaz. Sıfır ağırlıklı olay deftere hiç girmez.
  points int not null check (points <> 0),
  reason trust_reason not null,
  -- Olayı doğuran kayıt (sipariş, durum kaydı, puan satırı); tek kolon birden çok tabloyu gösterdiği için FK yok.
  ref_id uuid not null,
  -- Olayın kendi anı; geçmiş bu sırayla okunur, tarama anıyla değil.
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint trust_entry_source_key unique (customer_id, reason, ref_id)
);

alter table public.trust_entry enable row level security;

create index trust_entry_customer_idx on public.trust_entry (customer_id, occurred_at desc, id desc);

-- Puan saklanmaz, defterden türer; düzeltmeyi unutan tek yol onu kalıcı yanlış gösterirdi.
create or replace view public.customer_trust_score with (security_invoker = true) as
select customer_id,
       sum(points)::int as score,
       count(*)::int    as entry_count
  from public.trust_entry
 group by customer_id;

-- Deftere henüz yazılmamış olaylar. Süzgeç kaynakta, ki yazılmış olaylar tarama penceresini doldurmasın; puan ve tahsil bekleme
-- süresi motordadır. Vade gecikmesi burada yok: açık vade okuması ve `isOverdue` kuralı zaten var, ikinci kez yazılmaz.
create or replace view public.trust_fact with (security_invoker = true) as
with fact as (
  select 'order_delivered'::trust_reason as reason, o.customer_id, o.id as ref_id, min(l.created_at) as occurred_at
    from public.order_status_log l
    join public.order o on o.id = l.order_id
   where l.to_status = 'delivered' or (l.from_status = 'draft' and l.to_status = 'completed')
   group by o.customer_id, o.id
  union all
  select 'order_cancelled', o.customer_id, o.id, min(l.created_at)
    from public.order_status_log l
    join public.order o on o.id = l.order_id
   where l.to_status = 'cancelled' and o.cancel_reason = 'customer'
   group by o.customer_id, o.id
  union all
  -- Kapıda ulaşılamadı: yoldaki sipariş hazıra döner; her deneme ayrı olaydır.
  select 'delivery_unreachable', o.customer_id, l.id, l.created_at
    from public.order_status_log l
    join public.order o on o.id = l.order_id
   where l.from_status = 'out_for_delivery' and l.to_status = 'ready'
  union all
  select 'delivery_refused', o.customer_id, l.id, l.created_at
    from public.order_status_log l
    join public.order o on o.id = l.order_id
   where l.from_status = 'out_for_delivery' and l.to_status = 'returned'
  union all
  select 'order_returned', o.customer_id, l.id, l.created_at
    from public.order_status_log l
    join public.order o on o.id = l.order_id
   where l.from_status in ('delivered', 'completed') and l.to_status = 'returned'
  union all
  -- Aday: teslim edilmiş ama kapanmamış peşin sipariş; bekleme süresi dolmuş mu kararı motorun.
  select 'payment_uncollected', o.customer_id, o.id, min(l.created_at)
    from public.order o
    join public.order_status_log l on l.order_id = o.id and l.to_status = 'delivered'
   where o.status = 'delivered' and not o.on_account
   group by o.customer_id, o.id
  union all
  -- Sadakat defterinin verdiği ödüller; geri alınmış ödül sayılmaz.
  select case e.reason when 'feedback_purchase' then 'feedback'::trust_reason else e.reason::text::trust_reason end,
         e.customer_id, e.id, e.created_at
    from public.points_entry e
   where e.points > 0
     and e.reason in ('referral', 'neighbor', 'review', 'feedback_purchase', 'visit')
     and not exists (
       select 1 from public.points_entry r
        where r.points < 0 and r.customer_id = e.customer_id and r.reason = e.reason and r.ref_id = e.ref_id
     )
)
select f.reason, f.customer_id, f.ref_id, f.occurred_at
  from fact f
 where f.customer_id is not null
   and not exists (
     select 1 from public.trust_entry t
      where t.customer_id = f.customer_id and t.reason = f.reason and t.ref_id = f.ref_id
   );
