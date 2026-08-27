-- Modül 06 — ELLE stok düzeltmesi: imha / fire / sayım farkı / iade restoku (06.6). DOMAIN §4, §12.
--
-- ── `stock_adjustment` TABLOSU ARTIK YOK (06.14, 27.08) ─────────────────────
-- Bu dosya bir zamanlar kendi tablosunu taşıyordu ve künyesi *"stok azalışının SATIŞ DIŞI her
-- sebebi buraya yazılır"* diyordu. Sözleşme dürüsttü — sorun onu tüketen ekranındı: "Çıkışlar"
-- sekmesi bu tabloyu çıkışların TAMAMI sanıyordu, oysa satış, kapı satışı ve sevk hiç buraya
-- yazılmıyordu. Kaynağın kapsamını aşan bir tüketim, iki ayrı toplam ve bir daha hiç kapanmayan
-- bir "hangi sayı doğru" sorusu doğurdu.
--
-- Satırlar `stock_movement` defterine taşındı (`0006`, gerekçesi orada): imha artık defterin bir
-- `kind`'ı. Para tarafında `money_movement` nasıl tek defterse — "ayrıca cash_adjustment" diye
-- ikinci bir tablo yok — stok da öyle.
--
-- **BU DOSYADA KALAN:** elle düzeltmenin iki kapısı (`adjust_stock` tek parti, `adjust_stock_batch`
-- tutanaklı çok parti) + belge numarası sayacı. Kapılar aynı işi yapıyor, yalnız yazdıkları yer
-- değişti. Adları da korundu: çağıran için bu hâlâ "stoğu elle düzelt" işlemidir.
--
-- NEDEN RPC: iki tabloya bölünemez yazım (defter satırı + partinin fiili miktarı). Yarısı
-- yazılırsa ya kaydı olmayan kayıp ya da karşılığı olmayan kayıt kalır (STACK §13 (b) koşulu).

-- Defter satırı + fiili düşüm TEK transaction'da. Fonksiyon karar vermez; tek kuralı fiziksel
-- gerçektir: partide olmayan miktar düşülemez, fiili negatife inemez.
--
-- ── İMZA DEĞİŞTİ: İŞARET ARTIK MİKTARDA DEĞİL ───────────────────────────────
-- Eskiden `p_qty` işaretliydi (`+` düşüm, `−` geri ekleme) ve çağıranlar `-v_take` diye negatif
-- geçiyordu. İşareti miktara gömmek `money_movement`ın (0018) açıkça yasakladığı şeydi ve bedeli
-- ekranda ölçüldü: "Çıkışlar" başlığı altında negatif bir çıkış toplamı. Yön artık AYRI parametre,
-- miktar daima pozitif — kolonun kuralıyla aynı.
create or replace function public.adjust_stock(
  p_stock_id uuid,
  p_qty int,                                         -- POZİTİF, daima
  p_direction stock_direction,                       -- 'out' = stoktan düş, 'in' = stoğa ekle
  p_kind stock_movement_kind,                        -- write_off | count_diff | return_restock
  p_reason stock_write_off_reason default null,      -- yalnız write_off'ta (kısıt zorlar)
  p_note text default null,
  p_created_by uuid default null,
  p_order_id uuid default null                       -- iade restokunda hangi sipariş (isteğe bağlı iz)
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
  if p_qty is null or p_qty <= 0 then
    raise exception 'adjust_stock: qty pozitif olmalı (yön p_direction ile verilir)';
  end if;

  -- ELLE düzeltmenin kapısı bu; satış/sevk/kabul kendi RPC'lerinden deftere yazar. Buradan
  -- `sale` yazılabilseydi aynı olayın iki doğum yeri olurdu ve hangisinin geçtiği çağırana kalırdı.
  if p_kind not in ('write_off', 'count_diff', 'return_restock') then
    raise exception 'adjust_stock: bu kapı yalnız elle düzeltme yazar (% geçersiz)', p_kind;
  end if;

  -- Stoğa ekleme her zaman bir İSTİSNADIR (iade restoku, sayım fazlası) — sebebi yazılmadan geçmez.
  if p_direction = 'in' and (p_note is null or btrim(p_note) = '') then
    raise exception 'adjust_stock: stoğa geri ekleme sebep notu ister';
  end if;

  select physical_qty, purchase_price into v_physical, v_cost
    from public.stock where id = p_stock_id for update;

  if not found then
    raise exception 'adjust_stock: parti bulunamadı (%)', p_stock_id;
  end if;

  if p_direction = 'out' and p_qty > v_physical then
    raise exception 'adjust_stock: partide % adet var, % adet düşülemez', v_physical, p_qty;
  end if;

  insert into public.stock_movement
    (stock_id, direction, qty, kind, reason, unit_cost, note, actor_id, order_id)
  values
    (p_stock_id, p_direction, p_qty, p_kind, p_reason, v_cost, p_note, p_created_by, p_order_id)
  returning id into v_id;

  update public.stock
     set physical_qty = physical_qty + case p_direction when 'out' then -p_qty else p_qty end
   where id = p_stock_id;

  return jsonb_build_object(
    'ok', true,
    'movement_id', v_id,
    'remaining_qty', v_physical + case p_direction when 'out' then -p_qty else p_qty end
  );
end;
$$;

revoke execute on function public.adjust_stock(
  uuid, int, stock_direction, stock_movement_kind, stock_write_off_reason, text, uuid, uuid
) from public, anon, authenticated;

-- Listenin görünümü (09.18) `stock_movement_detail` olarak `0006`'ya taşındı — defter tek tablo
-- olunca "imha listesi" ayrı bir görünüm olmaktan çıktı, defterin süzülmüş bir yüzü oldu.


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
--
-- ── YÖN SATIR BAŞINADIR (06.14) ─────────────────────────────────────────────
-- Tutanağın TİPİ olaya aittir (`p_kind`: bir sayım tutanağı bir sayımdır), ama YÖNÜ satıra:
-- tasarım sözleşmesinin ⚠ maddesi tam bunu söylüyor — *"tek sayım tutanağında hem fazla hem eksik
-- satır olabilir; o belge iki sekmede de görünür ve ekran bunu belgenin iki yüzü olarak
-- anlatmalıdır."* İşaret `qty`'de gömülüyken bu kendiliğinden çalışıyordu ama toplamları da
-- kendiliğinden eritiyordu; artık her satır yönünü açıkça söyler.
create or replace function public.adjust_stock_batch(
  p_lines jsonb,                                     -- [{"stock_id": uuid, "qty": int>0, "direction": "in"|"out"}]
  p_kind stock_movement_kind,                        -- write_off | count_diff | return_restock
  p_prefix text,                                     -- IMH | SAY | IAD (motor seçer; depo kodunu bu fonksiyon ekler)
  p_reason stock_write_off_reason default null,      -- yalnız write_off'ta
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
  v_direction stock_direction;
  v_physical int;
  v_cost numeric(10, 2);
  v_warehouse_count int;
  v_warehouse_code text;
  v_lines int := 0;
  v_out_qty int := 0;
  v_in_qty int := 0;
  v_out_cost numeric(12, 2) := 0;
  v_in_cost numeric(12, 2) := 0;
begin
  if p_kind not in ('write_off', 'count_diff', 'return_restock') then
    raise exception 'adjust_stock_batch: bu kapı yalnız elle düzeltme yazar (% geçersiz)', p_kind;
  end if;

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
    v_direction := (v_line ->> 'direction')::stock_direction;

    if v_qty is null or v_qty <= 0 then
      raise exception 'adjust_stock_batch: qty pozitif olmalı (parti %) — yön satırın direction alanında', v_stock_id;
    end if;

    if v_direction is null then
      raise exception 'adjust_stock_batch: satırın yönü yazılmalı (parti %)', v_stock_id;
    end if;

    -- Stoğa ekleme her zaman bir İSTİSNADIR — sebebi yazılmadan geçmez (`adjust_stock` ile aynı kural).
    if v_direction = 'in' and (p_note is null or btrim(p_note) = '') then
      raise exception 'adjust_stock_batch: stoğa geri ekleme sebep notu ister';
    end if;

    select physical_qty, purchase_price into v_physical, v_cost
      from public.stock where id = v_stock_id for update;

    if not found then
      raise exception 'adjust_stock_batch: parti bulunamadı (%)', v_stock_id;
    end if;

    if v_direction = 'out' and v_qty > v_physical then
      raise exception 'adjust_stock_batch: partide % adet var, % adet düşülemez', v_physical, v_qty;
    end if;

    insert into public.stock_movement
      (stock_id, direction, qty, kind, reason, unit_cost, note, actor_id, reference_no)
    values
      (v_stock_id, v_direction, v_qty, p_kind, p_reason, v_cost, p_note, p_created_by, v_reference);

    update public.stock
       set physical_qty = physical_qty + case v_direction when 'out' then -v_qty else v_qty end
     where id = v_stock_id;

    v_lines := v_lines + 1;
    if v_direction = 'out' then
      v_out_qty := v_out_qty + v_qty;
      v_out_cost := v_out_cost + coalesce(v_cost, 0) * v_qty;
    else
      v_in_qty := v_in_qty + v_qty;
      v_in_cost := v_in_cost + coalesce(v_cost, 0) * v_qty;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'reference_no', v_reference,
    'lines', v_lines,
    -- **İKİ YÖN AYRI DÖNER, net TEK sayı değil** (06.14). Eskiden tek `total_qty`/`cost_total`
    -- vardı ve işaret onların içinde eriyordu; karışık bir sayım tutanağı "1 adet · −35,56 €" gibi
    -- hiçbir şeyin ölçüsü olmayan bir satır üretiyordu (ölçüldü 27.08). Net isteyen çağıran ikisini
    -- çıkarır — ama artık bunu BİLEREK yapar.
    -- Birim EURO (kolonlarla aynı); cent'e çevrim servis sınırında (`adjustBatch`, STACK §8).
    'out_qty', v_out_qty,
    'in_qty', v_in_qty,
    'out_cost', v_out_cost,
    'in_cost', v_in_cost
  );
end;
$$;

revoke execute on function public.next_document_no(text, int) from public, anon, authenticated;
revoke execute on function public.adjust_stock_batch(
  jsonb, stock_movement_kind, text, stock_write_off_reason, text, uuid
) from public, anon, authenticated;
