-- Modül 06 — Stok: parti (`stock`) + rezervasyon (`reservation`). Kurallar: DOMAIN §4.
--
-- Temel denklem: KULLANILABİLİR = FİİLİ − AKTİF REZERVASYON. "Ayrılmış toplam" hiçbir yerde
-- SAKLANMAZ; `reservation` satırlarından türetilir (DATA_MODEL kalıcı kararlar: sayaç tutulmaz,
-- kayarsa izi bulunamaz). Bu yüzden burada `reserved_qty` kolonu yoktur — arayan `available_stock`
-- görünümünü okur.
--
-- Atomik ayırma bu dosyada değil, `0007_reserve_stock.sql`'deki RPC'dedir (STACK §13 yazma eşiği:
-- eşzamanlılık yarışı olan yazım RPC'ye ödenir).
-- RLS deny-by-default (0001 deseni); erişim sunucudan service_role ile.

create table public.stock (
  id uuid primary key default gen_random_uuid(),
  -- Stok VARYANT seviyesindedir (satılabilir birim varyanttır). Parti silinmez → restrict.
  variant_id uuid not null references public.product_variant (id) on delete restrict,
  -- PARTİ BİR DEPODA DURUR (DOMAIN §17). FK YOK: `warehouse` tablosu 0031'de açılır — kolon burada
  -- doğar, bağ orada kurulur (`intake_id` emsali). `not null` bilinçli: deposuz parti fiziksel
  -- olarak imkânsızdır, "sonra gireriz" diye bir hâli yoktur.
  warehouse_id uuid not null,
  physical_qty int not null default 0 check (physical_qty >= 0),
  -- Partiye GİRİŞTE yazılan miktar — tarihtir, değişmez. `physical_qty` satış/fire ile erirken bu
  -- durur: "sipariş ettiğim kadar geldi mi" (DOMAIN §16 fark raporu) ve "bu partiden ne kadar
  -- tüketildi" soruları buna dayanır. Türetilemez: satış, fire ve iade ayrı yerlerde yaşar.
  initial_qty int not null default 0 check (initial_qty >= 0),
  -- Partinin son tarihi. TİPİ üründedir (`product.date_type`): DLC = güvenlik (geçince satılamaz),
  -- DDM = kalite (geçse de satılır). Kolon adı bu yüzden tipten bağımsız: `expiry_date`.
  expiry_date date not null,
  lot_number text,                                   -- tedarikçinin lot no'su — geri çağırma (rappel) eşleşmesi
  -- BİRİM (paket) başına alış maliyeti. Toptan alınıp paketlenirse giriş paket adediyle yapılır
  -- (1 kg → 10 × 100 gr) ve maliyet pakete bölünür; gerçek COGS bu alandan çıkar (DOMAIN §12).
  purchase_price numeric(10, 2) check (purchase_price >= 0),
  -- Bağlı stok girişi. FK YOK: `stock_intake` tablosu 06.10'da açılır (greenfield — o gün eklenir).
  intake_id uuid,
  -- Hangi TEDARİK KALEMİNİN karşılığı (DOMAIN §17, parçalı kabul). FK YOK: `purchase_order_item`
  -- 0010'da açılır. Tek PO iki depoda parça parça kabul edilebildiği için "sipariş ettiğim kadar
  -- geldi mi" artık intake üzerinden hesaplanamaz — giriş kalemi hangi PO satırını karşıladığını
  -- KENDİ taşır. Null: PO'suz doğrudan giriş, ya da transferle doğan parti (kökeni transfer kaydı).
  purchase_order_item_id uuid,
  -- Doluysa bu parti indirimli teklifte (near-expiry). Fiyat çözümünde partiye çıpalı satır olur
  -- ve rezervasyonu `stock_id` ile bu partiye bağlanır (DOMAIN §5).
  offer_price numeric(10, 2) check (offer_price >= 0),
  -- Depo İÇİ konum (dolap/raf) — `warehouse_id` ile aynı şey değil, iki ayrı çözünürlük:
  -- hangi tesis (depo) ↔ o tesiste hangi alan. Duplication değil (CLAUDE.md §1).
  --
  -- **SERBEST METİNDEN TANIMLI ALANA (17.08, 19.29).** `location text` idi ve `temperature_log`un
  -- 128. satırdaki üç zararı burada birebir geçerliydi: gruplama yazımla bölünüyordu (`Dolap 1` ≠
  -- `Dolap-1` → "bu dolapta ne var" eksik cevap verir) ve **olmayan görülemiyordu** ("hangi alan
  -- boş, hangisi aşırı dolu" sorusu sorulamıyordu).
  --
  -- Üçüncü ve asıl sebep `0045`in kendi gerekçesini tamamlıyor: `storage_area.kind` bilerek
  -- `product_storage_type` ile aynı kelimeleri kullanıyor ve künyesi *"donuk ürün donuk alanda
  -- durur" cümlesi ancak iki taraf aynı dili konuşursa kurulabilir* diyor. Cümlenin öteki yarısı
  -- BU kolondur; o gelene kadar tip kümesi hazır ama tüketicisi yoktu.
  --
  -- NULLABLE kalıyor: rafı bilinmeden de mal kabul edilir (bugünkü davranış korunur).
  -- FK YOK: `storage_area` 0045'te açılır — kolon burada doğar, bağ orada kurulur.
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

-- FEFO'nun tek okuma yolu: DEPO İÇİNDE varyantın partileri son tarihe göre artan. Baş kolon artık
-- depo — her okuma bir depoya bakar (depocu kendi deposunu görür, hazırlık siparişin deposundan
-- toplar), depo-üstü tarama yalnız raporun işidir.
create index stock_variant_expiry_idx on public.stock (warehouse_id, variant_id, expiry_date);
-- Teklif havuzu: indirimli partiler doğrudan süzülür (kısmi indeks — çoğu satır null).
create index stock_offer_idx on public.stock (warehouse_id, variant_id) where offer_price is not null;
-- Tedarik fark raporu: "bu PO kalemine karşılık ne girdi" (parçalı kabulde kalem başına toplanır).
create index stock_po_item_idx on public.stock (purchase_order_item_id) where purchase_order_item_id is not null;

create table public.reservation (
  id uuid primary key default gen_random_uuid(),
  -- FK YOK: `order` tablosu 07'de açılır. Sipariş kapanınca satır silinir (teslim/iptal).
  order_id uuid not null,
  variant_id uuid not null references public.product_variant (id) on delete restrict,
  -- REZERVASYON DEPOYU AÇIKÇA TAŞIR (DOMAIN §17, T1) — türetme ilkesinin gerekçeli istisnası.
  -- Siparişten türetilemez: normal rezervasyonun partisi yoktur (parti seçimi hazırlıkta) ve bu
  -- tablonun `order`'a FK'sı yok; türetmek `available_stock`ın sıcak yoluna join eklerdi.
  -- Yan fayda: `reserve_stock` kilidi depoya daralır, iki depo birbirini beklemez.
  -- FK YOK: `warehouse` 0031'de açılır. Sipariş deposuyla eşitliği orada ertelenmiş kısıt tutar.
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

-- Kullanılabilir stok — TÜRETİLİR, saklanmaz. Süresi dolmuş rezervasyon sayılmaz (cron onu zaten
-- geri bırakır; görünüm cron'u beklemez).
--
-- **GÖRÜNÜM BU DOSYADA DEĞİL, `0031_warehouse.sql`'DE.** Grain'i `(warehouse_id, variant_id)` ve
-- "her aktif depo için bir satır" sözleşmesi `warehouse` tablosuna cross join gerektiriyor; o tablo
-- bu dosyadan sonra doğuyor. Kolon FK'siz doğabilir (yukarıda öyle yaptık) ama görünüm tabloyu
-- BEKLEMEK zorunda — SQL'de "sonra bağlanacak join" diye bir şey yok.
--
-- Görünüm KARAR VERMEZ, olguyu toplar (STACK §13): `expired_dlc_qty` "tarihi geçmiş DLC partilerde
-- ne kadar var" olgusudur; "o yüzden satma" kararı motorundur. Satışa açık miktar isteyen çağıran
-- `available_qty − expired_dlc_qty` alır (parti kırılımı gerekiyorsa `listBatches` + motor).

alter table public.stock enable row level security;
alter table public.reservation enable row level security;


-- ═══ STOK HAREKET DEFTERİ (06.14) ═══
--
-- **NEDEN VAR: stokta hareketin defteri YOKTU ve bedeli üç kez ödendi.**
-- Depodan mal çıkmasının beş yolu var (`deliver_order` · `quick_sale` · `dispatch_transfer` ·
-- `adjust_stock` · `adjust_stock_batch`) ve bunların yalnız ikisi bir olay satırı yazıyordu.
-- Kalanlar stoğu DURUM tablolarından eritiyordu: mal gitti, geriye "gitti" diyen bir kayıt kalmadı.
--
-- Ölçüldü (27.08, iki bağımsız inceleme):
--   · "Çıkışlar" sekmesi dönemdeki çıkış olaylarının küçük bir dilimini görüyordu ve başlığında
--     NEGATİF bir çıkış toplamı yazıyordu (`−13,49 €`) — çünkü iade restoku ve sayım fazlası birer
--     GİRİŞ, ama işaret `qty`'ye gömülü olduğu için aynı toplamda eriyorlardı.
--   · `order_item_batch`ten defter TÜRETİLEMİYOR: zaman damgası yok, `record_preparation` satırları
--     silip yeniden yazıyor (`0015`), iade geriye dönük azaltıyor (`0020`). Yani o tablodan üretilen
--     bir "Ağustos'ta ne çıktı" raporu, Eylül'de gelen bir iadeyle KENDİ GEÇMİŞİNİ DEĞİŞTİRİR.
--   · Parti başına mutabakat bugün tutmuyor ve "doğru süzgeç" şemadan okunamıyor: aynı soruyu soran
--     iki makul sorgu iki farklı sayı veriyor (`returned` siparişleri sayılsın mı, `delivered` mi
--     `completed` mi damgalansın). Cevap sorgunun yazarına bağlı kalıyordu.
--
-- Boşluğun bedeli okuma katmanına bir TELAFİ MAKİNESİ olarak yayılmıştı (`domain-core/stock/history`
-- + `application/warehouse/variant-history`, ~530 satır) ve künyeleri dört ayrı üretim arızası
-- anlatıyor — dördü de "aynı hareketi iki yerde saymak" ya da "hiç sayamamak". Defterde hareket BİR
-- KEZ vardır; o sınıf hata bir daha doğamaz.
--
-- **EVİN KENDİ EMSALİ:** para tarafında `money_movement` TEK defterdir (`0018`) ve künyesi bu
-- arızayı önceden tarif etmiş: *"YÖN ayrı alandır, işaret tutara gömülmez (raporda '− yazılmış
-- giriş' gibi çift-anlamlı satır doğmasın)."* Stok bunu yapmamıştı; ekrandaki negatif çıkış toplamı
-- o kararın birebir öngörülmüş sonucuydu. Burada yön KOLONDA, miktar daima pozitif.
--
-- **`stock_adjustment` BU TABLOYA ERİDİ** (kullanıcı kararı 27.08). "money_movement + ayrıca
-- cash_adjustment" diye bölünmemiş bir evde stok da bölünmez: iki tablo = iki toplam = düzeltilen
-- hâlin ta kendisi. İmha artık defterin bir `kind`'ıdır.

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

-- ── `transfer_loss` diye bir tip YOK ve bu ölçülmüş bir karar (27.08) ────────
-- İlk tasarımda vardı (`BEKLEYEN(19.6)`: "sevk edildi, hedefe eksik ulaştı"). Yazılamadı, çünkü
-- kaybın bir PARTİSİ yok: kaynak parti `transfer_out` ile zaten düşüldü — oraya ikinci bir çıkış
-- yazmak aynı malı iki kez düşürür ve mutabakatı bozar; hedefte ise o mal için parti hiç doğmadı.
-- Yazılabileceği tek yer bir transit deposudur ve tasarım onu açıkça yasaklıyor (*"sanal transit
-- depo YOKTUR — ekran üçüncü bir envanter icat etmez"*).
--
-- Doğrusu: kayıp bir hareket değil, İKİ HAREKETİN FARKI (`transfer_out` − `transfer_in`) ve o fark
-- zaten kayıtlı (`warehouse_transfer_line.qty` ↔ `received_qty`). Mutabakat da kendiliğinden tutar:
-- mal kaynaktan çıktı (yazıldı), hedefe girmedi (yazılmadı) — iki depo arasında yok oldu, ki fiziksel
-- gerçek de budur. `BEKLEYEN(19.6)` bu yüzden AÇIK kalıyor: kaybın kayda dönüşmesi bir defter işi
-- değil, sorumluluk/telafi işi (tedarikçiye mi kurye şirketine mi yazılacağı kararı verilmemiş).

-- SEBEP KODU — hareket tipinden AYRI bir seviye ve bu ayrım bilinçli (SAP: hareket tipi 551 +
-- ayrıca reason code). "Çöpe attım" bir hareket tipidir; "neden" onun içinde bir kırılımdır ve
-- ekranın "Neden dağılımı" şeridi tam bunu gösteriyor. Tek enuma çökertseydik ya kırılım kaybolur
-- ya hareket tipi listesi sebep sayısınca şişerdi.
--
-- Eski `stock_adjustment_reason`dan İKİ değer buraya GELMEDİ, çünkü onlar sebep değil hareketti:
-- `count_diff` ve `return_restock` artık birer `kind`.
create type stock_write_off_reason as enum (
  'expired',   -- DLC geçti → imha
  'damaged',   -- hasar / soğuk zincir kırıldı
  'lost'       -- kayıp (sayımda bulunamadı)
);

create table public.stock_movement (
  id uuid primary key default gen_random_uuid(),
  -- Parti: varyant · lot · SKT · alış fiyatı hep ondan okunur. `restrict` — hareketi olan parti
  -- silinemez; defter partinin geçmişidir.
  stock_id uuid not null references public.stock (id) on delete restrict,
  -- **DEPO SATIRDA DURUR** (`CLAUDE §1`: "okuma depo süzgeçsiz yapılmaz"). Partiden türetilebilir
  -- ama bu tablo SINIRSIZ büyüyen ve her dönem sorgusuyla taranan tablodur; her okumada bir join,
  -- süzgecin unutulabildiği yerdir. Değeri çağıran YAZMAZ, aşağıdaki trigger türetir — iki yerde
  -- tutulan bir gerçek, bir gün ayrışan bir gerçektir.
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
  -- **KAYDIN anı** — defterin SIRASI budur. Ayrım `stock_intake`in `date`/`created_at` ayrımıyla
  -- birebir aynı (22.28 kararı): "az önce ne yazdım" sorusunu yalnız ikincisi cevaplar; geriye
  -- dönük girilen bir kayıt `occurred_at` sıralamasında listenin ortasına düşer ve bulunamaz.
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
  -- **İPTAL = TERS KAYIT** (SAP 551↔552 deseni). Defter append-only'dir: `cancel_transfer` bugün
  -- stoğu geri yazıp hiçbir yere satır düşmüyordu, yani "mal çıktı ve döndü" geçmişi yalanlanıyordu.
  -- Artık iptal, aslını işaret eden yeni bir satırdır; ikisi de görünür.
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

-- ── Defterin okunabilir yüzü ────────────────────────────────────────────────
--
-- `stock_adjustment_detail`in (09.18) devamı ve aynı gerekçe: ekran lot numarasına VEYA ürün adına
-- göre arıyor, ikisi iki ayrı gömülü kaynakta. PostgREST'in `or=` grubu yalnız üst tablonun
-- kolonlarına bakar — "lot VEYA ürün adı" sorgu kurucuyla ifade edilemiyor (`STACK §13` istisnası).
-- Arama metni görünümün İÇİNDE kuruluyor; ekranın terimi tek düz kolona bakar.
--
-- İç birleştirme satır düşürmez: `stock_id` `not null` + `restrict`.
create or replace view public.stock_movement_detail as
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


-- ═══ SICAKLIK KAYDI (06.7) ═══
-- Buraya AYRI BİR MIGRATION dosyasından taşındı (02.11 · denetim P2 — aile içi
-- birleştirme). İçerik değişmedi; eski dosya numarasıyla anılmıyor, çünkü o numara artık yok.

-- Modül 06 — Sıcaklık kaydı (06.7). DOMAIN §4 / hijyen denetimi.
--
-- Hijyen denetiminin İLK istediği veri budur: dolabın/aracın sıcaklığı düzenli ölçülmüş mü.
-- Sensör entegrasyonu YOK — günde bir-iki elle giriş yeter. Basit tutulur ki gerçekten girilsin.
--
-- ── NOKTA SERBEST METİNDEN TANIMLI KAYDA GEÇTİ (17.08, kullanıcı kararı) ─────
-- `location text` vardı ve içine hem dolap adı hem araç plakası yazılıyordu. Üç zararı ÖLÇÜLDÜ:
-- ekran noktaları birebir metinle grupluyor (`Dolap 1` ≠ `Dolap-1` ≠ `dolap 1` → geçmiş bölünür),
-- "bu nokta genelde şu kadar okuyor" uyarısı o bölünen geçmişe dayanıyor, ve en ağırı: **ölçülmeyen
-- tespit edilemiyor.** "Dondurucu 2 bugün ölçülmedi" demek için Dondurucu 2'nin var olduğunu bilmek
-- gerek; sistem yalnız yazılanı biliyordu, yazılması gerekeni değil. Denetimin sorduğu tam da bu.

create table public.temperature_log (
  id uuid primary key default gen_random_uuid(),
  -- HANGİ TESİS (DOMAIN §17): hijyen denetimi tesis bazındadır — denetmen bir depoya gelir ve o
  -- deponun kayıtlarını ister. FK YOK: `warehouse` 0031'de açılır.
  -- Araç kaydı da bir depoya yazılır (kaydın alındığı tesis): araç bir güne/kuryeye BAĞLANMAZ (K8)
  -- ama soğuk zincir kaydının bir tesis sahibi olmak zorundadır, yoksa denetimde sahipsiz kalır.
  warehouse_id uuid not null,
  -- ÖLÇÜM NOKTASI — ikisinden TAM BİRİ dolu. FK YOK: iki tablo da 0045'te açılır (emsal:
  -- `stock.intake_id` 0006'da FK'siz doğdu, tablosu gelince bağlandı).
  --
  -- İki ayrı kolon, tek "tip + kimlik" çifti DEĞİL (kullanıcı kararı 17.08 — iki ayrı tablo):
  -- polimorfik anahtar veritabanına FK yazdırmaz, yani silinen bir dolabın kayıtları sessizce
  -- sahipsiz kalırdı. İki kolon + `num_nonnulls` kısıtı hem bağı hem tekilliği veriye yazıyor.
  storage_area_id uuid,
  vehicle_id uuid,
  temperature_c numeric(4, 1) not null,              -- −18.5 gibi; donukta negatif normaldir
  recorded_by uuid,                                  -- FK yok: personel kimliği auth şemasında
  recorded_at timestamptz not null default now(),
  -- Noktasız ölçüm bir ölçüm değildir; iki noktalı ölçüm de bir kayıt değil, iki kayıttır.
  constraint temperature_log_one_point check (num_nonnulls(storage_area_id, vehicle_id) = 1)
);

-- Denetim sorgusu: depo + nokta + tarih aralığı ("şu depodaki şu dolabın geçen ayki kayıtları").
-- İki ayrı indeks, çünkü iki ayrı kolonun her birinde satırların yarısı `null`.
create index temperature_log_area_date_idx on public.temperature_log (warehouse_id, storage_area_id, recorded_at desc)
  where storage_area_id is not null;
create index temperature_log_vehicle_date_idx on public.temperature_log (warehouse_id, vehicle_id, recorded_at desc)
  where vehicle_id is not null;

alter table public.temperature_log enable row level security;
