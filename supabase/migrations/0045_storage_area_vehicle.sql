-- Modül 19 — Ölçüm noktaları: depo içi stoklama alanları + araçlar (19.28, kullanıcı kararı 17.08).
--
-- ── NEDEN ŞİMDİ, VE NEDEN BİR KEZ DÜŞÜRÜLMÜŞTÜ ──────────────────────────────
-- `vehicle` tablosu 0031'de bir kez tanımlandı ve 03.08'de DÜŞÜRÜLDÜ. Gerekçesi doğruydu:
-- tüketeni yoktu, `from('vehicle')` hiçbir yerde geçmiyordu, sıfır satır taşıyordu — yani bir
-- ihtiyacın karşılığı değil "ileri tarihli bir tahmin"di. O günün künyesi şunu yazmıştı:
-- *"gerçekten gerekince geri gelir ve o gün doğru soruyu sorarız: araç bir depoya mı, bir güne mi,
-- bir kuryeye mi bağlanır."*
--
-- Bugün tüketici var ve soru cevaplanıyor: **araç bir ÖLÇÜM NOKTASIDIR.** Soğuk zincirin iki
-- yeri var — depodaki dolap ve yoldaki araç — ve ikisi de aynı denetim sorusuna cevap veriyor.
--
-- ── İKİ TABLO, TEK TABLO DEĞİL (kullanıcı kararı 17.08) ─────────────────────
-- Ortak bir `storage_point(type)` tablosu da mümkündü ve sıcaklık kaydının bağını tekilleştirirdi.
-- Ayrı tutmanın kazancı zorunlulukların dürüstlüğü: dolabın deposu ZORUNLU (fiziksel olarak tek
-- tesistedir), aracınki değil; plaka araçta benzersiz, alanda böyle bir alan yok. Tek tabloda
-- bunların hepsi nullable olur, yani kural veriden ekrana kaçardı.
--
-- ── ARAÇ ↔ DEPO: K8'DEN BİLİNÇLİ SAPMA ──────────────────────────────────────
-- Eski kayıt (`data-model/depo.md` › Vehicle) *"depo FK'sı YOK"* diyordu ve sebebi şuydu: bağ,
-- "araç bir depoya aittir" diye bugün OLMAYAN bir kısıtı veriye yazardı. O itiraz kısıta karşıydı,
-- künyeye değil. Buradaki alan **nullable** ve hiçbir yerde zorlanmıyor — bir aidiyet değil, bir
-- adres: "genelde buradan yükler". Kurye günü ve gün kapanışı kurye/gün ekseninde AYNEN kalıyor
-- (`DOMAIN §7`); araç hâlâ ne bir güne ne bir kuryeye bağlanıyor.

-- ── Alanın türü ─────────────────────────────────────────────────────────────
-- Küme KAPALI ve ürünün saklama rejimiyle (`product_storage_type`) BİLEREK aynı üç kelimeyi
-- kullanıyor: "donuk ürün donuk alanda durur" cümlesi ancak iki taraf aynı dili konuşursa
-- kurulabilir. Dördüncüsü `staging` — mal kabul/sevk alanı; bir saklama rejimi değil bir GEÇİŞ
-- yeri ve hedef aralığı olmaması normaldir.
--
-- Tür bir ETİKET değil, ekranın varsayılanını ve denetimin beklentisini taşır: donuk bir alanda
-- −18 beklenir, rafta beklenti yoktur. Serbest metin olsaydı "Dondurucu"/"dondurucu"/"Freezer"
-- üç ayrı tür olurdu — kapattığımız hatanın aynısı.
create type public.storage_area_kind as enum ('frozen', 'chilled', 'ambient', 'staging');

-- ── Depo içi stoklama alanı ─────────────────────────────────────────────────
create table public.storage_area (
  id uuid primary key default gen_random_uuid(),
  -- ZORUNLU ve `restrict`: bir dolap fiziksel olarak tek tesistedir, ve kayıtları olan bir alanın
  -- deposu silinemez — silinirse ölçümler sahipsiz kalır (deponun kendi `restrict` deseni).
  warehouse_id uuid not null references public.warehouse (id) on delete restrict,
  name text not null,
  kind storage_area_kind not null default 'chilled',
  /**
   * Hedef aralık — ölçümün SAPMA sayılıp sayılmayacağının ölçütü.
   *
   * Bugün ekran bunu geçmiş ortalamadan TAHMİN ediyor ("bu nokta genelde −18,5 okuyor"). Tahmin,
   * ilk günlerde hiç veri olmadığı için susar ve yanlış girilmiş bir seri kendi kendini normal
   * ilan eder. Beklenen aralık burada yazılıysa ilk ölçüm bile sapma verebilir.
   *
   * Nullable: oda sıcaklığı rafında beklenen aralık yoktur ve uydurmak, ölçülmeyen bir eşiği
   * ölçülmüş gibi göstermek olurdu (`CLAUDE §1`).
   */
  target_min_c numeric(4, 1),
  target_max_c numeric(4, 1),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  -- Aralık ya TAM verilir ya hiç: tek uçlu bir aralık "üstü serbest" mi "altı serbest" mi belli
  -- değildir ve okuyan taraf bunu tahmin etmek zorunda kalırdı.
  constraint storage_area_target_pair check (num_nonnulls(target_min_c, target_max_c) <> 1),
  constraint storage_area_target_order check (target_min_c is null or target_min_c <= target_max_c)
);

-- Ad TESİS İÇİNDE benzersiz: "Dolap 1" iki depoda da bulunabilir, aynı depoda iki kez bulunamaz —
-- ikinci "Dolap 1" hangi dolabın ölçüldüğü sorusunu cevapsız bırakırdı.
create unique index storage_area_name_uq on public.storage_area (warehouse_id, lower(name));
create index storage_area_warehouse_idx on public.storage_area (warehouse_id, is_active, sort_order);

alter table public.storage_area enable row level security;

-- ── Araç ────────────────────────────────────────────────────────────────────
create table public.vehicle (
  id uuid primary key default gen_random_uuid(),
  -- Plaka benzersiz: iki kayıt aynı aracı gösterirse soğuk zincir geçmişi ikiye bölünür.
  plate text not null unique,
  label text,                                        -- "Küçük kamyonet" — ekranda okunan ad
  -- NULLABLE ve zorlanmıyor (yukarıdaki K8 künyesi): aidiyet değil künye. `set null` çünkü depo
  -- kapanınca araç yok olmaz, yalnız adresi bilinmez olur.
  warehouse_id uuid references public.warehouse (id) on delete set null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index vehicle_active_idx on public.vehicle (is_active, sort_order, plate);
create index vehicle_warehouse_idx on public.vehicle (warehouse_id) where warehouse_id is not null;

alter table public.vehicle enable row level security;

-- ── Sıcaklık kaydının bağları (kolonlar 0006'da doğdu) ──────────────────────
-- `restrict`: ölçümü olan bir nokta silinemez. Denetim geçmişi noktanın adına değil KAYDINA bağlı;
-- silinebilseydi "bu dolabın kayıtları" sorusu bir gün cevapsız kalırdı. Kullanımdan kalkan nokta
-- `is_active = false` ile susturulur — işaretlemek yasaklamak değildir (kataloğun aynı ayrımı).
alter table public.temperature_log
  add constraint temperature_log_area_fk foreign key (storage_area_id)
    references public.storage_area (id) on delete restrict,
  add constraint temperature_log_vehicle_fk foreign key (vehicle_id)
    references public.vehicle (id) on delete restrict;

-- ── Partinin alanı (kolon 0006'da doğdu) ────────────────────────────────────
-- `restrict` ve gerekçesi ölçümünkinden farklı: orada geçmiş kaydı koruyoruz, burada BUGÜNKÜ malı.
-- İçinde parti duran bir alan silinebilseydi mal, sistemde yeri olmayan bir yerde kalırdı.
-- Kullanımdan kalkan alan önce boşaltılır, sonra `is_active = false` ile susturulur.
alter table public.stock
  add constraint stock_storage_area_fk foreign key (storage_area_id)
    references public.storage_area (id) on delete restrict;

-- "Bu alanda ne var" — alan ekranının ve toplama sırasının sorusu. Kısmi: partilerin çoğunda alan
-- boş kalabilir (rafı bilinmeden kabul meşru) ve boş satırlar indekste yer kaplamamalı.
create index stock_storage_area_idx on public.stock (storage_area_id) where storage_area_id is not null;
