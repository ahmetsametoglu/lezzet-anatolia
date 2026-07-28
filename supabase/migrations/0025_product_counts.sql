-- Ürün ekranının başlık sayaçları — TEK okuma (05.12 · STACK §13).
--
-- ÖNCE: dört ayrı istek gidiyordu — üç `HEAD` sayım (toplam · aday · beyan eksik) ve kategori
-- sayaçları için TÜM ürünlerin `category_id`'sini çeken bir okuma (katalog büyüdükçe büyüyen bir
-- yük). Dört sayı için dört tur.
--
-- FONKSİYON İŞ KURALI TAŞIMAZ: parametreler mekanik olarak eşleşir. "Beyan eksik" ölçütü buraya
-- KOPYALANMADI — `product.is_incomplete` üretilmiş kolonunda tek kaynakta duruyor (0005), süzgeç de
-- sayaç da onu okuyor. Buradaki tek "kural benzeri" şey aramanın üç ad dilinde yapılması; o da bir
-- yapı gerçeği (LocalizedText'in dilleri), eşik/sıra/izin türünden bir karar değil.
--
-- SAYAÇLARIN KAPSAMI bilinçli olarak farklı:
--   · total/incomplete → ekrandaki süzgeçlerin AYNISI (süzgeç uygulanmışsa sayaç da süzülür)
--   · candidate        → durum süzgecini YOK SAYAR (aday sayısı "kaç aday var" sorusudur; durum
--                        süzgeci 'active' iken 0 yazmak, aday kuyruğunu görünmez kılardı)
--   · by_category      → SÜZGEÇSİZ; kategori listesinin kendi sayısıdır, ürün süzgecinden bağımsız
create or replace function public.product_counts(
  p_query text default null,
  p_category uuid default null,
  p_status text default null,
  p_only_incomplete boolean default false
)
returns table (total int, candidate int, incomplete int, by_category jsonb)
language sql
stable
as $$
  with base as (
    select p.status, p.is_incomplete
    from public.product p
    where (p_category is null or p.category_id = p_category)
      and (not p_only_incomplete or p.is_incomplete)
      and (
        p_query is null or p_query = ''
        or p.name ->> 'tr' ilike '%' || p_query || '%'
        or p.name ->> 'fr' ilike '%' || p_query || '%'
        or p.name ->> 'de' ilike '%' || p_query || '%'
      )
  ),
  scoped as (
    select * from base where (p_status is null or status = p_status::product_status)
  )
  select
    (select count(*) from scoped)::int,
    (select count(*) from base where status = 'candidate')::int,
    (select count(*) from scoped where is_incomplete)::int,
    coalesce(
      (
        select jsonb_object_agg(category_id, product_count)
        from (
          select category_id, count(*)::int as product_count
          from public.product
          where category_id is not null
          group by category_id
        ) k
      ),
      '{}'::jsonb
    );
$$;

-- Operasyon okumasıdır; müşteri yüzeyine açılmaz (fonksiyonlara `execute` varsayılan olarak
-- PUBLIC'e verilir — geri alınıyor).
revoke execute on function public.product_counts(text, uuid, text, boolean) from public;
grant execute on function public.product_counts(text, uuid, text, boolean) to service_role;
