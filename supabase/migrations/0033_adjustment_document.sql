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

-- Kayda düşen `reference_no` kolonu `0010`'dadır — greenfield kuralı (CLAUDE.md): yama migration'ı
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
    'cost_total', v_cost_total
  );
end;
$$;

revoke execute on function public.next_document_no(text, int) from public, anon, authenticated;
revoke execute on function public.adjust_stock_batch(jsonb, stock_adjustment_reason, text, text, uuid)
  from public, anon, authenticated;
