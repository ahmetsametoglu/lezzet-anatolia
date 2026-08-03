-- Modül 07 — Siparişin DOĞUŞU tek transaction'da (07.4 RPC borcu). DOMAIN §5, STACK §13.
--
-- NEDEN RPC: yazma RPC eşiği iki koşuldan biridir — (a) eşzamanlılık yarışı ya da (b) **bölünemez
-- çok-tablolu yazım**. Bu (b) ve gerekçesi yaşanmış bir para hatasıdır:
--
--   Sipariş üç tabloya birden yazılır: başlık (`order`), kalemler (`order_item`) ve indirim inmişse
--   kullanım kaydı (`discount_use`). Uygulamada bunlar üç ayrı ifadeydi; kalemler düşerse başlık
--   "telafi silmesi" ile geri alınıyordu. Telafi bir garanti DEĞİLDİR: silme de düşebilir (o zaman
--   kalemsiz bir sipariş kalır), süreç arada ölebilir, ağ kopabilir. Üstelik telafi mantığı ancak
--   HATA anında çalışır — sessiz bir yarım yazım hiç fark edilmez.
--
--   Somut sonucu şuydu: başlığa `discount_amount = 3` yazılıyor, kalemlerin `line_discount_amount`'ı
--   0 kalıyordu. Ödeme durumu motoru "müşteri ne kadar borçlu" sorusunu kalemlerden topladığı için
--   tamamı ödenmiş bir sipariş `partial` görünüyor ve bildirim maili müşteriden kapıda 3 € daha
--   istiyordu. Muhasebe export'u ve kârlılık da ciroyu indirim kadar fazla sayıyordu.
--
-- FONKSİYON KURAL BİLMEZ (diğer RPC'lerle aynı çizgi): fiyat, indirim, kargo ve payların dağıtımı
-- motorlarda hesaplanır ve buraya HAZIR gelir. Buradaki tek kural fiziksel gerçektir: kalemsiz
-- sipariş olmaz, ve başlıktaki indirim kalemlere dağıtılanın toplamıdır.

-- ── Kolon listesi katalogdan ─────────────────────────────────────────────────
-- Kolonlar TEK TEK SAYILMAZ. Sayılsaydı `order`'a eklenen her yeni alan bu fonksiyonu da düzeltmeyi
-- gerektirirdi ve bir gün unutulurdu — nitekim aynı hata seed'de yaşandı: `line_discount_amount`
-- alanı eklendi, seed'in kalem tipine geçirilmedi, her `db:reset` bozukluğu yeniden üretti.
-- Bunun yerine gövdede GELEN anahtarlar tablonun gerçek kolonlarıyla kesiştirilir: gelmeyen kolon
-- ifadeye hiç girmez ve tablonun KENDİ varsayılanını alır (`status`, `created_at`, sayaçlar…).
-- Adlar katalogdan geldiği için enjeksiyon yolu yoktur; `quote_ident` ikinci kat.
create or replace function public.jsonb_insert_columns(p_table text, p_body jsonb, p_skip text[] default '{}')
returns text
language sql
stable
set search_path = public
as $$
  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position)
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = p_table
     and p_body ? c.column_name
     and not (c.column_name = any (p_skip));
$$;

revoke execute on function public.jsonb_insert_columns(text, jsonb, text[]) from public, anon, authenticated;

create or replace function public.create_order(
  p_order jsonb,
  p_items jsonb,
  -- Kuponun hangi KAPISINDAN girildi (`discount_code.id`). Kotayı bölmez — "hangi dil karşılık
  -- buldu" kırılımı. Otomatik kampanyada ve kodsuz yollarda boş.
  p_discount_code_id uuid default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order_id uuid;
  v_cols text;
  v_item jsonb;
  v_discount_id uuid;
  v_customer_id uuid;
  v_discount_amount numeric(10, 2);
begin
  -- Kalemsiz sipariş anlamsızdır: ne toplamı doğrulanabilir, ne hazırlanabilir, ne faturalanabilir.
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'create_order: kalemsiz sipariş açılamaz';
  end if;

  v_cols := public.jsonb_insert_columns('order', p_order);
  if v_cols is null then
    raise exception 'create_order: sipariş gövdesi boş';
  end if;

  execute format(
    'insert into public.order (%1$s) select %1$s from jsonb_populate_record(null::public.order, $1) returning id',
    v_cols
  ) using p_order into v_order_id;

  -- Kalemler SATIR SATIR yazılır, toplu değil. `jsonb_populate_recordset` tek bir kolon listesi
  -- dayatır; kalemlerin anahtar kümesi farklıysa (biri `stock_id` taşır, öbürü taşımaz) eksik alan
  -- NULL olarak yazılırdı — varsayılanı olan NOT NULL kolonlarda bu doğrudan bir ihlal. Satır başına
  -- kendi listesi çıkarıldığında her kalem kendi varsayılanlarını alır. Sipariş başına birkaç kalem;
  -- döngünün maliyeti ölçülebilir değil.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    -- `order_id` gövdeden ALINMAZ: siparişin kimliği bu transaction'da doğdu, çağıranın gönderdiği
    -- bir değer başka bir siparişin kalemini yazmanın yolu olurdu.
    v_cols := public.jsonb_insert_columns('order_item', v_item, array['id', 'order_id']);
    if v_cols is null then
      raise exception 'create_order: boş kalem gövdesi';
    end if;

    execute format(
      'insert into public.order_item (order_id, %1$s) select $2, %1$s from jsonb_populate_record(null::public.order_item, $1)',
      v_cols
    ) using v_item, v_order_id;
  end loop;

  select discount_id, customer_id, discount_amount
    into v_discount_id, v_customer_id, v_discount_amount
    from public.order where id = v_order_id;

  -- KOTA BURADA TÜKENİR ve bu bilinçli bir yer seçimi: kayıt siparişin KENDİ verisinden türer,
  -- çağıranın hatırlamasına bağlı değil. Kapıya (checkout) yazılsaydı elle sipariş girişi (09.8),
  -- WhatsApp ajanı ve kapıda satış aynı şeyi ayrı ayrı hatırlamak zorunda kalırdı — ve hatırlamayan
  -- ilk yol kotayı sessizce delerdi. Açık zaten böyle doğmuştu (09.6).
  --
  -- İndirim İNMEDİYSE kayıt da yazılmaz. Tutar sıfır olsa bile kural uygulanmışsa hak tükenir:
  -- kotayı harcayan şey indirimin büyüklüğü değil, kuralın kullanılmış olması.
  if v_discount_id is not null then
    -- Çakışma sessizce atlanır (`discount_use_order_key`): yeniden denenen bir checkout kuponun
    -- ikinci hakkını yemez. Garanti indekste, uygulamada bir kontrolde değil.
    insert into public.discount_use (discount_id, discount_code_id, customer_id, order_id, amount)
    values (v_discount_id, p_discount_code_id, v_customer_id, v_order_id, v_discount_amount)
    on conflict do nothing;
  end if;

  return v_order_id;
end;
$$;

revoke execute on function public.create_order(jsonb, jsonb, uuid) from public, anon, authenticated;


-- ── İndirim dengesi: Σ kalem payı = başlıktaki indirim ───────────────────────
-- **Değişmezi artık VERİTABANI zorluyor, yazan tarafın dikkati değil.** Bu ayrım önemli: yukarıdaki
-- RPC bugünün tek yazım yoludur, ama yarın elle sipariş girişi, WhatsApp ajanı ya da bir onarım
-- betiği ikinci bir yol açabilir. Kısıt yazım yolunda değil VERİDE durursa, hangi yoldan gelinirse
-- gelinsin bozuk sipariş yazılamaz.
--
-- ERTELENMİŞ (`deferrable initially deferred`) olmak zorunda: başlık kalemlerden ÖNCE yazılır, yani
-- ifade ifade bakıldığında denge geçici olarak bozuktur. Kontrol COMMIT anında yapılır — o an
-- siparişin tamamı ortadadır.
create or replace function public.assert_order_discount_balance(p_order_id uuid) returns void
language plpgsql
set search_path = public
as $$
declare
  v_header numeric(10, 2);
  v_lines numeric(10, 2);
begin
  select discount_amount into v_header from public.order where id = p_order_id;
  -- Sipariş silinmiş: kalemleri de cascade ile gitti, denetlenecek bir denge yok.
  if not found then
    return;
  end if;

  select coalesce(sum(line_discount_amount), 0) into v_lines
    from public.order_item where order_id = p_order_id;

  if v_header <> v_lines then
    raise exception 'sipariş %: başlıktaki indirim (%) kalem paylarının toplamına (%) eşit değil',
      p_order_id, v_header, v_lines
      using errcode = 'check_violation';
  end if;
end;
$$;

-- İki ince sarmalayıcı: kontrolün kendisi tek yerde kalsın diye. Kalem tarafında silme de sayılır —
-- bir kalemin payı listeden çıkarsa denge o an bozulur.
create or replace function public.order_item_discount_balance() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.assert_order_discount_balance(old.order_id);
  else
    perform public.assert_order_discount_balance(new.order_id);
  end if;
  return null;
end;
$$;

create or replace function public.order_discount_balance() returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.assert_order_discount_balance(new.id);
  return null;
end;
$$;

create constraint trigger order_item_discount_balance
  after insert or update or delete on public.order_item
  deferrable initially deferred
  for each row execute function public.order_item_discount_balance();

-- Başlık tarafında yalnız `discount_amount` değişimi izlenir. Her `order` güncellemesine bağlansaydı
-- durum geçişi, teslim, tahsilat — siparişin ömrü boyunca yapılan her yazım bu denetimi de ödeterdi;
-- oysa hiçbiri indirime dokunmuyor.
create constraint trigger order_discount_balance
  after insert or update of discount_amount on public.order
  deferrable initially deferred
  for each row execute function public.order_discount_balance();
