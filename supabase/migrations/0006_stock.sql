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
