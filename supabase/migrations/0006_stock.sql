-- Stok: parti (`stock`) ve rezervasyon (DOMAIN §4). Kullanılabilir = fiili − aktif rezervasyon ve ayrılmış toplam saklanmaz,
-- rezervasyon satırlarından türetilir; atomik ayırma `0007` RPC'sindedir.

create table public.stock (
  id uuid primary key default gen_random_uuid(),
  -- Stok VARYANT seviyesindedir (satılabilir birim varyanttır). Parti silinmez → restrict.
  variant_id uuid not null references public.product_variant (id) on delete restrict,
  -- Parti bir depoda durur (DOMAIN §17); deposuz parti fiziksel olarak imkânsız. FK 0031'de, `warehouse` orada açılıyor.
  warehouse_id uuid not null,
  physical_qty int not null default 0 check (physical_qty >= 0),
  -- Girişte yazılan miktar, `physical_qty` eridikçe değişmez: "sipariş ettiğim kadar geldi mi" ve "ne kadarı tüketildi"
  -- soruları buna dayanır, çünkü satış, fire ve iade ayrı yerlerde yaşar.
  initial_qty int not null default 0 check (initial_qty >= 0),
  -- Adı tipten bağımsız, çünkü tarihin tipi (DLC güvenlik, DDM kalite) üründe durur (`product.date_type`).
  expiry_date date not null,
  -- Bizim parti numaramız (`PRT-STR-26-0031`): önek · depo kodu · yıl · sıra; tetikleyici üretir (`stock_set_batch_no`, 0031).
  -- Lot ile karıştırılmaz: lot tedarikçinin üretim numarasıdır ve boş olabilir, parti numarası hep vardır.
  batch_no text not null,
  lot_number text,                                   -- tedarikçinin lot no'su — geri çağırma (rappel) eşleşmesi
  -- BİRİM (paket) başına alış maliyeti. Toptan alınıp paketlenirse giriş paket adediyle yapılır
  -- (1 kg → 10 × 100 gr) ve maliyet pakete bölünür; gerçek COGS bu alandan çıkar (DOMAIN §12).
  purchase_price numeric(10, 2) check (purchase_price >= 0),
  -- Bağlı stok girişi; FK yok, `stock_intake` sonraki migration'da açılır.
  intake_id uuid,
  -- Karşılanan tedarik kalemi (DOMAIN §17): bir PO iki depoda parça parça kabul edilebildiği için bağı giriş kalemi taşır.
  -- Boş: PO'suz doğrudan giriş ya da transferle doğan parti; FK 0010'da.
  purchase_order_item_id uuid,
  -- Doluysa bu parti indirimli teklifte (near-expiry). Fiyat çözümünde partiye çıpalı satır olur
  -- ve rezervasyonu `stock_id` ile bu partiye bağlanır (DOMAIN §5).
  offer_price numeric(10, 2) check (offer_price >= 0),
  -- Depo içi alan (dolap/raf); serbest metin gruplamayı yazıma göre bölüyor ve boş alanı gösteremiyordu.
  -- Boş olabilir, çünkü rafı bilinmeden de mal kabul edilir; FK 0045'te.
  storage_area_id uuid,
  created_at timestamptz not null default now()
);

-- Giriş miktarı uygulamada elle yazılmaz — kaynağı fiili miktardır, iki yerde tutulup kaymasın.
create or replace function public.stock_set_initial_qty() returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.initial_qty := new.physical_qty;
  return new;
end;
$$;

create trigger stock_initial_qty_trg
  before insert on public.stock
  for each row execute function public.stock_set_initial_qty();

-- FEFO'nun okuma yolu: her okuma bir depoya baktığı için baş kolon depo, sonra varyant ve son tarih.
create index stock_variant_expiry_idx on public.stock (warehouse_id, variant_id, expiry_date);
-- Parti numarası benzersiz: etiket okutulunca tek satıra düşer (lotun aksine — lot benzersiz değil).
create unique index stock_batch_no_key on public.stock (batch_no);
-- Teklif havuzu: indirimli partiler doğrudan süzülür (kısmi indeks — çoğu satır null).
create index stock_offer_idx on public.stock (warehouse_id, variant_id) where offer_price is not null;
-- Tedarik fark raporu: "bu PO kalemine karşılık ne girdi" (parçalı kabulde kalem başına toplanır).
create index stock_po_item_idx on public.stock (purchase_order_item_id) where purchase_order_item_id is not null;

create table public.reservation (
  id uuid primary key default gen_random_uuid(),
  -- FK YOK: `order` tablosu 07'de açılır. Sipariş kapanınca satır silinir (teslim/iptal).
  order_id uuid not null,
  variant_id uuid not null references public.product_variant (id) on delete restrict,
  -- Rezervasyon depoyu açıkça taşır: normal rezervasyonun partisi yok ve siparişten türetmek `available_stock`ın
  -- sıcak yoluna join eklerdi. Sipariş deposuyla eşitliği 0031'deki ertelenmiş kısıt tutar.
  warehouse_id uuid not null,
  -- YALNIZ partiye bağlı teklif satırında dolu (batch-pinned). Normal rezervasyon varyant-toplamı
  -- seviyesindedir; parti seçimi hazırlıkta FEFO ile yapılır (DOMAIN §4).
  stock_id uuid references public.stock (id) on delete restrict,
  qty int not null check (qty > 0),
  -- Online checkout TTL'i (varsayılan 30 dk, `Setting`). Kapıda/vadeli rezervasyonda null:
  -- süresizdir, siparişin kendisi kapatır.
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- Kullanılabilir hesabının sıcak yolu: DEPODAKİ varyantın aktif rezervasyonları.
create index reservation_variant_idx on public.reservation (warehouse_id, variant_id);
-- Sipariş kapanışında toplu silme.
create index reservation_order_idx on public.reservation (order_id);
-- TTL süpürücüsü (06.4) yalnız süreli satırları tarar — kısmi indeks, tablo büyüdükçe fark açılır.
create index reservation_expires_idx on public.reservation (expires_at) where expires_at is not null;
-- Partiye çıpalı miktarın o partinin kullanılabilirinden düşülmesi (FEFO önerisi, 06.5).
create index reservation_stock_idx on public.reservation (stock_id) where stock_id is not null;

-- `available_stock` görünümü 0031'de, çünkü depo başına satır sözleşmesi `warehouse` tablosuna cross join ister.
-- Görünüm karar vermez: `expired_dlc_qty` olgudur, "satma" kararı motorundur.

alter table public.stock enable row level security;
alter table public.reservation enable row level security;


-- ═══ STOK HAREKET DEFTERİ ═══
-- Her depo hareketi burada bir kez yazılır; durum tablolarından türetilen geçmiş sonradan gelen iadeyle kendini değiştirir.
-- Yön kolonda, miktar daima pozitif (`money_movement` gibi), imha da defterin bir `kind`'ıdır.

-- Yön: hareketin fiziksel işareti. `qty` DAİMA pozitif (`money_movement.direction` emsali).
create type stock_direction as enum ('in', 'out');

-- HAREKET TİPİ — kapalı liste. SAP'nin `BWART`ı, Odoo'nun konum çifti, D365'in `ReferenceCategory`si
-- ile aynı iş: her hareket hangi OLAYDAN doğduğunu kendi taşır, çağıranın yorumuna bırakılmaz.
create type stock_movement_kind as enum (
  'intake',          -- tedarikten kabul                    (in)
  'transfer_in',     -- sevkiyat kabulü — hedefte yeni parti (in)
  'transfer_out',    -- sevk                                (out)
  'transfer_cancel', -- sevk geri alındı — mal KAYNAĞA döndü (in)
  'sale',            -- siparişe çıkan mal (teslim)         (out)
  'counter_sale',    -- kapı satışı                         (out)
  'return_restock',  -- iade → rafa döndü                   (in)
  'write_off',       -- imha / hasar / kayıp                (out)
  'count_diff'       -- sayım farkı                         (İKİ YÖNLÜ)
);

-- `transfer_loss` tipi yok: kaybın partisi alan depoda doğar. `receive_transfer` sevk edilen adetle `transfer_in` yazar,
-- eksiği aynı işlemde `write_off · transfer_shortfall` olarak o partiden düşer; transit depo yok.

-- Sebep kodu hareket tipinden ayrı seviyedir (SAP 551 + reason code): tek enum ya kırılımı kaybeder ya listeyi şişirirdi.
-- `count_diff` ve `return_restock` sebep değil harekettir, bu yüzden `kind`'dadır.
create type stock_write_off_reason as enum (
  'expired',   -- DLC geçti → imha
  'damaged',   -- hasar / soğuk zincir kırıldı
  'lost',      -- kayıp (sayımda bulunamadı)
  -- Sevk edilen geldi diye yazılır, gelmeyen alan depodan bu sebeple düşülür. Ayrı sebep, çünkü nakliye kaybı ile
  -- rafta bulunamayan ayrı sorulardır.
  'transfer_shortfall'
);

create table public.stock_movement (
  id uuid primary key default gen_random_uuid(),
  -- Parti: varyant · lot · SKT · alış fiyatı hep ondan okunur. `restrict` — hareketi olan parti
  -- silinemez; defter partinin geçmişidir.
  stock_id uuid not null references public.stock (id) on delete restrict,
  -- Partiden türetilebilir ama sınırsız büyüyen tabloda her okumaya join ve unutulabilir süzgeç eklerdi.
  -- Değeri çağıran yazmaz, tetikleyici türetir.
  warehouse_id uuid not null,
  direction stock_direction not null,
  -- POZİTİF, DAİMA. Yön ayrı kolonda (`money_movement` kuralı, 0018): işareti miktara gömmek
  -- "−13,49 € çıkış" gibi çift-anlamlı satırlar doğuruyordu.
  qty int not null check (qty > 0),
  kind stock_movement_kind not null,
  -- Yalnız imhada dolu (aşağıdaki kısıt zorlar).
  reason stock_write_off_reason,
  -- Partinin alış fiyatı, işlem ANINDA kopyalanır: parti sonradan düzeltilse bile dönem raporu
  -- kaymaz (eski `stock_adjustment.unit_cost` kuralı, aynen korundu — DOMAIN §12 gerçek COGS).
  unit_cost numeric(10, 2),
  -- **OLAYIN anı** — dönem süzgeci buna bakar ("bu çeyrekte ne çıktı" fiziksel bir sorudur).
  occurred_at timestamptz not null default now(),
  -- Kaydın anı, defterin sırası budur: geriye dönük girilen kayıt `occurred_at` sırasında listenin ortasına düşer ve
  -- "az önce ne yazdım" sorusunu yalnız bu cevaplar.
  created_at timestamptz not null default now(),
  actor_id uuid,                                     -- FK yok: personel kimliği auth şemasında
  note text,
  -- Operatörün okuyacağı belge: `IMH-STR-26-0012` · `TRF-STR-26-0007` · siparişin referansı.
  reference_no text,
  -- KAYNAK BELGE — tipine göre biri zorunlu (aşağıdaki kısıt). FK YOK, üçü de sonraki dosyalarda
  -- doğuyor (`stock.intake_id` emsali: kolon burada doğar, bağ 0010/0012/0031'de kurulur).
  order_id uuid,
  transfer_id uuid,
  intake_id uuid,
  -- İptal ters kayıttır (SAP 551↔552): defter append-only, aslını işaret eden yeni satır iki hareketi de görünür bırakır.
  reverses_id uuid references public.stock_movement (id) on delete restrict,

  -- Hareket tipi yönünü BELİRLER — tek istisna sayım farkı, o gerçekten iki yönlüdür.
  -- Kural veride durur (`CLAUDE §1`): RPC'yi atlayan bir insert bunu delemesin.
  constraint stock_movement_direction_kind check (
    case kind
      when 'intake'          then direction = 'in'
      when 'transfer_in'     then direction = 'in'
      when 'transfer_cancel' then direction = 'in'
      when 'return_restock'  then direction = 'in'
      when 'transfer_out'   then direction = 'out'
      when 'sale'           then direction = 'out'
      when 'counter_sale'   then direction = 'out'
      when 'write_off'      then direction = 'out'
      else true
    end
  ),
  -- Sebep YALNIZ imhada ve imhada ZORUNLU: sebepsiz bir imha "ne kadarını neden attım" sorusunu
  -- cevaplayamaz, imha olmayan bir satırda sebep ise okuyanı yanıltır.
  constraint stock_movement_reason_only_write_off check (
    (kind = 'write_off') = (reason is not null)
  ),
  -- Kaynak belgesi olan tipte belge ZORUNLU. İmha/sayım/iade belgesiz olabilir (elle kayıt);
  -- tutanakları varsa `reference_no` taşır.
  constraint stock_movement_source check (
    case kind
      when 'intake'        then intake_id is not null
      when 'sale'          then order_id is not null
      when 'counter_sale'  then order_id is not null
      when 'transfer_in'     then transfer_id is not null
      when 'transfer_out'    then transfer_id is not null
      when 'transfer_cancel' then transfer_id is not null
      else true
    end
  )
);

-- Depo satırda ama çağıranın elinde DEĞİL — partiden türer (`stock_set_initial_qty` emsali).
-- Parti hiç depo değiştirmez (transfer hedefte YENİ parti doğurur, `0031`), yani türetme kalıcıdır.
create or replace function public.stock_movement_set_warehouse() returns trigger
language plpgsql
set search_path = public
as $$
begin
  select warehouse_id into new.warehouse_id from public.stock where id = new.stock_id;
  if new.warehouse_id is null then
    raise exception 'stock_movement: parti bulunamadı (%)', new.stock_id;
  end if;
  return new;
end;
$$;

create trigger stock_movement_warehouse_trg
  before insert on public.stock_movement
  for each row execute function public.stock_movement_set_warehouse();

-- Sekmenin dönem sorgusu: depo + tarih aralığı + yön kırılımı.
create index stock_movement_warehouse_date_idx on public.stock_movement (warehouse_id, occurred_at desc);
-- Partinin geçmişi ve MUTABAKAT sorgusu (`Σin − Σout = physical_qty`); sıra kaydın anı.
create index stock_movement_stock_idx on public.stock_movement (stock_id, created_at desc);
-- Tür kırılımı ("bu çeyrekte ne kadarı imha, ne kadarı satış").
create index stock_movement_kind_idx on public.stock_movement (kind, occurred_at desc);
-- "Elimdeki kâğıdın karşılığı" — numara başına birkaç satır döner.
create index stock_movement_reference_idx on public.stock_movement (reference_no)
  where reference_no is not null;

alter table public.stock_movement enable row level security;

comment on table public.stock_movement is
  'Stok hareket defteri (06.14) — append-only. Miktar değiştiren her olay burada bir satırdır; '
  'düzeltme yoktur, iptal ters kayıttır (reverses_id). `stock.physical_qty` bu defterin bakiyesidir.';

-- Ekran lot numarasına veya ürün adına göre arar ve PostgREST'in `or=` grubu gömülü kaynağa bakamaz (`STACK §13` istisnası);
-- arama metni bu yüzden görünümde tek kolonda kurulur.
create or replace view public.stock_movement_detail with (security_invoker = true) as
select m.id,
       m.stock_id,
       m.warehouse_id,
       m.direction,
       m.qty,
       m.kind,
       m.reason,
       m.unit_cost,
       m.occurred_at,
       m.created_at,
       m.actor_id,
       m.note,
       m.reference_no,
       m.order_id,
       m.transfer_id,
       m.intake_id,
       m.reverses_id,
       s.lot_number,
       s.expiry_date,
       v.id    as variant_id,
       v.label as variant_label,
       p.id    as product_id,
       p.name  as product_name,
       -- Üç dil birden: operasyon Türkçe ama katalog üç dilli ve operatör ürünü hangi adla
       -- hatırlıyorsa onu yazar.
       concat_ws(' ', s.lot_number, p.name ->> 'tr', p.name ->> 'fr', p.name ->> 'de',
                 v.label ->> 'tr', m.reference_no) as search_text
  from public.stock_movement m
  join public.stock s on s.id = m.stock_id
  join public.product_variant v on v.id = s.variant_id
  join public.product p on p.id = v.product_id;

comment on view public.stock_movement_detail is
  'Hareket defteri + aranabilir metin (06.14, 09.18 devamı). Arama lot · ürün adı (3 dil) · varyant · belge no.';


-- ═══ SICAKLIK KAYDI ═══

-- Hijyen kontrolünün ilk istediği veri (DOMAIN §4): dolap ve araç sıcaklığı elle, günde bir-iki kez girilir.
-- Nokta tanımlı kayıttır, çünkü ölçülmeyen noktayı tespit etmek için var olduğunu bilmek gerekir.

create table public.temperature_log (
  id uuid primary key default gen_random_uuid(),
  -- Hijyen kontrolü tesis bazındadır; araç kaydı da alındığı tesise yazılır ki soğuk zincir kaydı sahipsiz kalmasın.
  -- FK 0031'de.
  warehouse_id uuid not null,
  -- Ölçüm noktası: ikisinden tam biri dolu. İki kolon, çünkü polimorfik anahtar FK kurdurmaz ve silinen dolabın kayıtları
  -- sahipsiz kalırdı; FK'ler 0045'te.
  storage_area_id uuid,
  vehicle_id uuid,
  temperature_c numeric(4, 1) not null,              -- −18.5 gibi; donukta negatif normaldir
  recorded_by uuid,                                  -- FK yok: personel kimliği auth şemasında
  recorded_at timestamptz not null default now(),
  -- Noktasız ölçüm bir ölçüm değildir; iki noktalı ölçüm de bir kayıt değil, iki kayıttır.
  constraint temperature_log_one_point check (num_nonnulls(storage_area_id, vehicle_id) = 1)
);

-- Kontrol sorgusu: depo + nokta + tarih aralığı. İki ayrı indeks, çünkü iki kolonun her birinde satırların yarısı `null`.
create index temperature_log_area_date_idx on public.temperature_log (warehouse_id, storage_area_id, recorded_at desc)
  where storage_area_id is not null;
create index temperature_log_vehicle_date_idx on public.temperature_log (warehouse_id, vehicle_id, recorded_at desc)
  where vehicle_id is not null;

alter table public.temperature_log enable row level security;
