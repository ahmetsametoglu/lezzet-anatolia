-- Paket listesi okuma fonksiyonu: veri beş tablodan birleşir ve varyant başına ağırlıklı alış ortalaması ile kalem başına KDV'siz
-- gelir PostgREST'in gömülü seçimiyle ifade edilemez; fonksiyon iş kuralı taşımaz, ham toplamları döner ve kararı motor verir.

-- Maliyet gizlidir: fonksiyon alış fiyatı ve marj girdisi döndürür, bu yüzden `execute` PUBLIC'ten geri alınıp yalnız servis
-- rolüne verilir.
create or replace function public.bundle_list_rows()
returns table (
  id uuid,
  name jsonb,
  description jsonb,
  slug text,
  image_key text,
  image_focal_x smallint,
  image_focal_y smallint,
  image_zoom smallint,
  image_alt jsonb,
  image_updated_at timestamptz,
  image_width smallint,                          -- kaynak ölçüsü — açık kolon listesi, unutulursa Zod'da patlar (aşağıdaki not)
  image_height smallint,
  total_price numeric,
  serves int,
  is_active boolean,
  sort_order int,
  -- Vitrin işareti: kolon listesi açık yazıldığı için alan buraya da eklenmeli, yoksa `BundleSchema`'dan türeyen `BundleListRow`
  -- okuması Zod'da konusuyla ilgisiz bir yerde patlar.
  is_featured boolean,
  created_at timestamptz,
  -- ── Kalemlerden türeyen özet ──
  item_count int,
  variant_ids uuid[],                 -- ürün formundaki "bu ürün N pakette kullanılıyor" bağı
  item_names jsonb,                   -- [{p: ürün adı, v: boy etiketi}] — dil çözümü uygulamada
  allocated_total numeric,            -- Σ adet × atanmış birim fiyat
  list_total numeric,                 -- Σ adet × güncel b2c fiyatı ("ayrı ayrı alınsa")
  missing_price_count int,            -- fiyatı olmayan kalem → list_total EKSİK demektir
  cost_total numeric,                 -- Σ adet × eldeki partilerin ağırlıklı ortalama alışı
  missing_cost_count int,             -- maliyeti olmayan kalem → cost_total EKSİK demektir
  revenue_ht numeric,                 -- Σ (pay ÷ (1 + kdv)) × adet — paketin tek KDV oranı yoktur
  blocked_item_count int              -- ürünü/boyu satışta olmayan kalem sayısı
)
language sql
stable
as $$
  with unit_cost as (
    -- Varyant başına TAHMİNİ birim maliyet: eldeki partilerin adetle ağırlıklı ortalaması. Alış fiyatı
    -- girilmemiş parti hesaba katılmaz (0 saymak maliyeti düşük gösterip marjı şişirirdi).
    select s.variant_id, sum(s.physical_qty * s.purchase_price) / nullif(sum(s.physical_qty), 0) as amount
    from public.stock s
    where s.physical_qty > 0 and s.purchase_price is not null
    group by s.variant_id
  ),
  unit_price as (
    -- Varyantın GÜNCEL b2c genel liste fiyatı: müşteriye ve ülkeye özel satır yok, çünkü paket yalnız b2c'dedir, pazarlıklı fiyat
    -- pakete girmez ve ülke fiyatı servis okumasında seçilir.
    select distinct on (p.variant_id) p.variant_id, p.amount
    from public.price p
    where p.channel = 'b2c' and p.customer_id is null and p.country is null and p.valid_from <= now()
    order by p.variant_id, p.valid_from desc
  ),
  agg as (
    select
      bi.bundle_id,
      count(*)::int as item_count,
      array_agg(bi.variant_id order by bi.sort_order) as variant_ids,
      jsonb_agg(jsonb_build_object('p', pr.name, 'v', v.label) order by bi.sort_order) as item_names,
      sum(bi.qty * bi.allocated_unit_price) as allocated_total,
      sum(bi.qty * up.amount) as list_total,
      count(*) filter (where up.amount is null)::int as missing_price_count,
      sum(bi.qty * uc.amount) as cost_total,
      count(*) filter (where uc.amount is null)::int as missing_cost_count,
      sum(bi.qty * (bi.allocated_unit_price / (1 + pr.vat_rate / 100.0))) as revenue_ht,
      count(*) filter (where not v.is_active or pr.status <> 'active')::int as blocked_item_count
    from public.bundle_item bi
    join public.product_variant v on v.id = bi.variant_id
    join public.product pr on pr.id = v.product_id
    left join unit_price up on up.variant_id = bi.variant_id
    left join unit_cost uc on uc.variant_id = bi.variant_id
    group by bi.bundle_id
  )
  select
    b.id, b.name, b.description, b.slug,
    b.image_key, b.image_focal_x, b.image_focal_y, b.image_zoom, b.image_alt, b.image_updated_at,
    b.image_width, b.image_height,
    b.total_price, b.serves, b.is_active, b.sort_order, b.is_featured, b.created_at,
    coalesce(a.item_count, 0),
    coalesce(a.variant_ids, '{}'::uuid[]),
    coalesce(a.item_names, '[]'::jsonb),
    coalesce(a.allocated_total, 0),
    a.list_total,
    coalesce(a.missing_price_count, 0),
    a.cost_total,
    coalesce(a.missing_cost_count, 0),
    coalesce(a.revenue_ht, 0),
    coalesce(a.blocked_item_count, 0)
  from public.bundle b
  left join agg a on a.bundle_id = b.id
  order by b.sort_order, b.created_at;
$$;

revoke execute on function public.bundle_list_rows() from public;
grant execute on function public.bundle_list_rows() to service_role;
