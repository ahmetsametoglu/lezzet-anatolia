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
  -- OLAY belgesi (10.5, `0009`): `IMH-26-0012`. Aynı imhanın/sayımın BÜTÜN satırları aynı numarayı
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


-- ═══ DÜZELTME TUTANAĞI (06.11) ═══
-- Buraya AYRI BİR MIGRATION dosyasından taşındı (02.11 · denetim P2 — aile içi
-- birleştirme). İçerik değişmedi; eski dosya numarasıyla anılmıyor, çünkü o numara artık yok.

-- Modül 10 — İmha/sayım OLAY referansı (10.5). `design/BACKLOG.md §1c` kullanıcı kararı (28.07).
--
-- Stok ekranındaki "Kayıt" sütunu çizilmişti ama açılamıyordu: arkasında bir numara yoktu. İhtiyaç
-- üç yerde gerçek — kâğıt ↔ kayıt eşleşmesi (imha tutanağı fiziksel tutulur, denetmenin elindeki
-- kâğıdın ekranda karşılığı bulunmalı), tedarikçiye alacak yazışması ve sayım oturumu.
--
-- NUMARA SATIR BAŞINA DEĞİL, OLAY BAŞINADIR. Bir imhada üç ayrı parti çöpe gidebilir; üçüne üç
-- numara vermek, eşleştirilmek istenen kâğıdı üçe bölerdi. Doğru şekil aynı operasyonun bütün
-- satırlarının PAYLAŞTIĞI bir referanstır.
--
-- SIRALI, rastgele değil — `Order.reference_no`'nun tersi ve bilerek: sipariş numarası dışarıya
-- gider ve sıralı olsaydı "bu yıl kaç sipariş aldınız"ı sızdırırdı. Bu numara İÇERİDE kalır;
-- denetmenin ve tedarikçinin okuyup yazacağı şey `IMH-26-0012`'dir, altı haneli rastgele bir dizi
-- değil. Sızacak bir şey de yok: kaç imha yaptığımız zaten kendi kaydımız.

-- ── Numara sayacı ────────────────────────────────────────────────────────────
-- Ayrı tablo: sıra ATOMİK artmalı. `max(...)+1` iki eşzamanlı imhada aynı numarayı verir; Postgres
-- sequence'i ise yıl başında sıfırlanamaz ve önek başına ayrışmaz.
create table public.document_counter (
  prefix text not null,
  year int not null,
  -- SON VERİLEN numara; sonraki `+1`'dir. Sayaç geriye alınmaz: iptal edilen kayıt numarayı yakar
  -- ve bu doğrudur — atlanan numara "burada bir şey olmuş" der, yeniden kullanılan numara yalan söyler.
  last_value int not null default 0,
  primary key (prefix, year)
);
alter table public.document_counter enable row level security;

-- Sıradaki numara — TEK ifadede artırır ve döndürür (yarış yok).
create or replace function public.next_document_no(p_prefix text, p_year int)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_value int;
begin
  insert into public.document_counter (prefix, year, last_value)
  values (p_prefix, p_year, 1)
  on conflict (prefix, year)
  do update set last_value = public.document_counter.last_value + 1
  returning last_value into v_value;

  -- `IMH-26-0012` — dört hane okunabilirlik içindir, tavan değil: 9999'u aşan yıl beş hane yazar.
  return format('%s-%s-%s', p_prefix, right(p_year::text, 2), lpad(v_value::text, 4, '0'));
end;
$$;

-- Kayda düşen `reference_no` kolonu `0009`'dadır — greenfield kuralı (CLAUDE.md): yama migration'ı
-- yazılmaz, alan doğduğu tablonun dosyasında durur.

-- ── Çok satırlı düzeltme (tek olay) ──────────────────────────────────────────
-- NEDEN AYRI RPC: `adjust_stock` tek partiyi düzeltir ve öyle kalmalı (07.8/11.4 onu tek tek çağırır).
-- Buradaki iş farklı: N parti + PAYLAŞILAN bir numara, hepsi bölünemez. Satırları tek tek yazsaydık
-- üçüncü satır düştüğünde elde yarım bir tutanak kalırdı — kâğıtla eşleşmeyen, iki satırlık bir imha.
--
-- Fonksiyon KARAR VERMEZ: hangi sebebin hangi öneke düştüğü bir sınıflandırmadır ve motordadır
-- (`domain-core/stock/document-no`); buraya öneğin kendisi gelir. Numaranın benzersizliği ve
-- atomikliği ise veritabanının işidir — motor onu garanti edemez.
--
-- ÖNEK ARTIK DEPO KODU TAŞIR (DOMAIN §17): `IMH-STR-26-0012`. Sayaç şeması değişmedi — `prefix`
-- kolonu 'IMH-STR' değerini alır ve seriler kendiliğinden depo başına ayrışır (T6).
--
-- Depo kodunu MOTOR DEĞİL BU FONKSİYON ekler (T6'dan sapma, gerekçesiyle): sınıflandırma motorda
-- kalıyor ('IMH' | 'SAY' | 'IAD'), depo kodu ise burada zaten biliniyor — partilerin kendisinden
-- türüyor. Motora bıraksaydık aynı bilgi iki yerde üretilir ve ayrışabilirdi: çağıran depo kodunu
-- eklemeyi unutursa KEHL'in ilk imhası STR'nin serisini sürdürür ve dosyanın kendi deyimiyle
-- "denetmene delik" gösterir. Kısıtın yarısı veride yarısı çağıranın dikkatinde kalamaz.
--
-- Karşılığı aşağıdaki kuraldır: tek tutanak tek depodan olmak zorunda, çünkü kâğıt klasör fiziksel
-- olarak o depoda duruyor.
create or replace function public.adjust_stock_batch(
  p_lines jsonb,                                     -- [{"stock_id": uuid, "qty": int}]
  p_reason stock_adjustment_reason,
  p_prefix text,                                     -- IMH | SAY | IAD (motor seçer; depo kodunu bu fonksiyon ekler)
  p_note text default null,
  p_created_by uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_reference text;
  v_line jsonb;
  v_stock_id uuid;
  v_qty int;
  v_physical int;
  v_cost numeric(10, 2);
  v_warehouse_count int;
  v_warehouse_code text;
  v_lines int := 0;
  v_total_qty int := 0;
  v_cost_total numeric(12, 2) := 0;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'adjust_stock_batch: satır listesi boş olamaz';
  end if;

  -- Tutanağın deposu satırlardan TÜRER (ayrıca sorulmaz — sorulsaydı satırlarla çelişebilirdi).
  -- Tek tutanak tek depodan: kâğıt klasör fiziksel olarak o depoda duruyor, ortak numara iki
  -- depoya yayılsaydı ikisinin de serisinde delik açardı.
  select count(distinct s.warehouse_id), min(w.code)
    into v_warehouse_count, v_warehouse_code
    from jsonb_array_elements(p_lines) l
    join public.stock s on s.id = (l ->> 'stock_id')::uuid
    join public.warehouse w on w.id = s.warehouse_id;

  if v_warehouse_count = 0 then
    raise exception 'adjust_stock_batch: hiçbir parti bulunamadı';
  elsif v_warehouse_count > 1 then
    raise exception 'adjust_stock_batch: tek tutanakta tek depo olur (% farklı depo)', v_warehouse_count;
  end if;

  -- Numara İŞ BAŞARILIRSA anlamlıdır ama BAŞTA alınır: satırlar ona yazılacak. Yazım düşerse
  -- transaction geri sarılır ve numara da geri gelir — yakılan numara yalnız commit'lenmiş
  -- iptallerde kalır.
  v_reference := public.next_document_no(p_prefix || '-' || v_warehouse_code, extract(year from now())::int);

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_stock_id := (v_line ->> 'stock_id')::uuid;
    v_qty := (v_line ->> 'qty')::int;

    if v_qty is null or v_qty = 0 then
      raise exception 'adjust_stock_batch: qty sıfır olamaz (parti %)', v_stock_id;
    end if;

    -- Geri ekleme her zaman bir İSTİSNADIR — sebebi yazılmadan geçmez (0010 ile aynı kural).
    if v_qty < 0 and (p_note is null or btrim(p_note) = '') then
      raise exception 'adjust_stock_batch: stoğa geri ekleme sebep notu ister';
    end if;

    select physical_qty, purchase_price into v_physical, v_cost
      from public.stock where id = v_stock_id for update;

    if not found then
      raise exception 'adjust_stock_batch: parti bulunamadı (%)', v_stock_id;
    end if;

    if v_qty > v_physical then
      raise exception 'adjust_stock_batch: partide % adet var, % adet düşülemez', v_physical, v_qty;
    end if;

    insert into public.stock_adjustment (stock_id, qty, reason, unit_cost, note, created_by, reference_no)
    values (v_stock_id, v_qty, p_reason, v_cost, p_note, p_created_by, v_reference);

    update public.stock set physical_qty = physical_qty - v_qty where id = v_stock_id;

    v_lines := v_lines + 1;
    v_total_qty := v_total_qty + v_qty;
    v_cost_total := v_cost_total + coalesce(v_cost, 0) * v_qty;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'reference_no', v_reference,
    'lines', v_lines,
    'total_qty', v_total_qty,
    -- İşaret KORUNUR: geri ekleme toplamı düşürür → rapor NET kaybı gösterir (0010 ile aynı ilke).
    -- Birim EURO (kolonlarla aynı); cent'e çevrim servis sınırında (`adjustBatch`, STACK §8).
    'cost_total', v_cost_total
  );
end;
$$;

revoke execute on function public.next_document_no(text, int) from public, anon, authenticated;
revoke execute on function public.adjust_stock_batch(jsonb, stock_adjustment_reason, text, text, uuid)
  from public, anon, authenticated;
