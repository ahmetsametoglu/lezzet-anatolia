-- Modül 06 — Stok düzeltmesi: imha / fire / sayım farkı (06.6). DOMAIN §4, §12.
--
-- Stok azalışının SATIŞ DIŞI her sebebi buraya yazılır — "bu üründen yılda ne kadar çöpe attım"
-- sorusunun tek cevabı bu tablodur. Kayıp görünmezse yönetilemez.
--
-- NEDEN RPC: iki tabloya bölünemez yazım (düzeltme kaydı + partinin fiili miktarı). Yarısı
-- yazılırsa ya kaydı olmayan kayıp ya da karşılığı olmayan kayıt kalır (STACK §13 (b) koşulu).

create type stock_adjustment_reason as enum (
  'expired',        -- DLC geçti → imha
  'damaged',        -- hasar / soğuk zincir kırıldı
  'count_diff',     -- sayım farkı (iki yönlü olabilir)
  'lost',           -- kayıp
  'return_restock'  -- teslim-sonrası iade stoğa döndü — İSTİSNADIR, sebep notu zorunlu (DOMAIN §4)
);

create table public.stock_adjustment (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid not null references public.stock (id) on delete restrict,
  -- İŞARETLİ: pozitif = stoktan düşüm (imha/fire/kayıp), negatif = stoğa geri ekleme (sayım fazlası,
  -- iade restoku). Tek alanda iki yön tutulur ki "net kayıp" tek toplamla çıksın.
  qty int not null check (qty <> 0),
  reason stock_adjustment_reason not null,
  -- Partinin alış fiyatı, işlem ANINDA kopyalanır: parti sonradan düzeltilse bile fire maliyeti
  -- kaymaz (DOMAIN §12 gerçek COGS).
  unit_cost numeric(10, 2),
  note text,
  created_by uuid,                                   -- FK yok: personel kimliği auth şemasında
  -- OLAY belgesi (10.5, `0033`): `IMH-26-0012`. Aynı imhanın/sayımın BÜTÜN satırları aynı numarayı
  -- paylaşır — kâğıt tutanakla eşleşen şey satır değil olaydır. Tek partilik `adjust_stock`
  -- çağrılarında null: kısmi karşılama ve kurye akışları tutanak üretmez, stoğu düzeltir.
  reference_no text,
  created_at timestamptz not null default now()
);

create index stock_adjustment_stock_idx on public.stock_adjustment (stock_id);
-- "Elimdeki kâğıdın karşılığı" araması — numara başına birkaç satır döner.
create index stock_adjustment_reference_idx on public.stock_adjustment (reference_no)
  where reference_no is not null;
-- Dönemsel fire raporu (DOMAIN §12): tarih aralığı + sebep kırılımı.
create index stock_adjustment_date_idx on public.stock_adjustment (created_at desc);

alter table public.stock_adjustment enable row level security;

-- Düzeltme kaydı + fiili düşüm TEK transaction'da. Fonksiyon karar vermez; tek kuralı fiziksel
-- gerçektir: partide olmayan miktar düşülemez, fiili negatife inemez.
create or replace function public.adjust_stock(
  p_stock_id uuid,
  p_qty int,                                         -- + düşüm, − geri ekleme
  p_reason stock_adjustment_reason,
  p_note text default null,
  p_created_by uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_physical int;
  v_cost numeric(10, 2);
  v_id uuid;
begin
  if p_qty is null or p_qty = 0 then
    raise exception 'adjust_stock: qty sıfır olamaz';
  end if;

  -- Geri ekleme her zaman bir İSTİSNADIR (iade restoku, sayım fazlası) — sebebi yazılmadan geçmez.
  if p_qty < 0 and (p_note is null or btrim(p_note) = '') then
    raise exception 'adjust_stock: stoğa geri ekleme sebep notu ister';
  end if;

  select physical_qty, purchase_price into v_physical, v_cost
    from public.stock where id = p_stock_id for update;

  if not found then
    raise exception 'adjust_stock: parti bulunamadı (%)', p_stock_id;
  end if;

  if p_qty > v_physical then
    raise exception 'adjust_stock: partide % adet var, % adet düşülemez', v_physical, p_qty;
  end if;

  insert into public.stock_adjustment (stock_id, qty, reason, unit_cost, note, created_by)
  values (p_stock_id, p_qty, p_reason, v_cost, p_note, p_created_by)
  returning id into v_id;

  update public.stock set physical_qty = physical_qty - p_qty where id = p_stock_id;

  return jsonb_build_object('ok', true, 'adjustment_id', v_id, 'remaining_qty', v_physical - p_qty);
end;
$$;

revoke execute on function public.adjust_stock(uuid, int, stock_adjustment_reason, text, uuid)
  from public, anon, authenticated;

-- ── İmha/fire LİSTESİNİN görünümü (09.18) ───────────────────────────────────
--
-- **Neden görünüm, gömülü `select` değil.** Ekran lot numarasına VEYA ürün adına göre arıyor; ikisi
-- iki ayrı gömülü kaynakta (`stock.lot_number`, `stock→variant→product.name`). PostgREST'in `or=`
-- grubu YALNIZ üst tablonun kolonlarına bakar — gömülü süzgeçler ayrı parametrelerdir ve birbirine
-- VE ile bağlanır. Yani "lot VEYA ürün adı" sorgu kurucuyla ifade edilemiyor; `STACK §13`'ün
-- "kurucunun ifade edemediği şey" istisnası tam bu.
--
-- Eleneni de yazalım: iki ayrı sorgu + birleştirme keyset sayfalamayı bozardı (iki imleçli sayfa
-- birleştirilemez), eşleşen `stock_id`'leri önce çözüp `in (…)` ile süzmek ise ya tavan (sessiz
-- kırpma) ya şişen sorgu demekti.
--
-- **İç birleştirme (join) hiçbir satır düşürmez:** `stock_id` `not null` ve `on delete restrict`,
-- yani partisi silinmiş bir düzeltme satırı yapısal olarak var olamıyor. `left join` yazmak
-- olmayan bir ihtimale karşı korunmak olurdu.
create or replace view public.stock_adjustment_detail as
select a.id,
       a.stock_id,
       a.qty,
       a.reason,
       a.unit_cost,
       a.note,
       a.created_by,
       a.reference_no,
       a.created_at,
       s.lot_number,
       s.expiry_date,
       v.id                as variant_id,
       v.label             as variant_label,
       p.id                as product_id,
       p.name              as product_name,
       -- ARAMA METNİ görünümün içinde kuruluyor: ekranın terimi tek bir düz kolona bakar, `or`
       -- gerekmez ve sorgu kurucusu yeterli olur. Üç dil birden: operasyon Türkçe ama katalog üç
       -- dilli ve operatör ürünü hangi adla hatırlıyorsa onu yazar.
       concat_ws(' ', s.lot_number, p.name ->> 'tr', p.name ->> 'fr', p.name ->> 'de',
                 v.label ->> 'tr', a.reference_no) as search_text
  from public.stock_adjustment a
  join public.stock s on s.id = a.stock_id
  join public.product_variant v on v.id = s.variant_id
  join public.product p on p.id = v.product_id;

comment on view public.stock_adjustment_detail is
  'İmha/fire listesi + aranabilir metin (09.18). Arama lot · ürün adı (3 dil) · varyant · belge no.';
