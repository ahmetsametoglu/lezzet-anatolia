-- Modül 07 — GÖNDERİ + OLAY DEFTERİ (07.12 · tasarım kaydı `docs/build/kargo-kanali-tasarimi.md §4.3, §4.5`).
--
-- ── SİPARİŞ KUTUSU = TAŞIYICIYA VERİLEN KUTU (kullanıcı kararı 28.08) ───────
-- Ayrı bir "koli" satırı AÇILMADI: kargoya verdiğimiz kutu, depoda doldurduğumuz kutunun
-- kendisidir. Taşıyıcı kimliği bu yüzden `order_box`ın üstüne biniyor.
--
-- ── `shipment` YİNE DE AYRI, çünkü kutu başına tekrarlanamaz ────────────────
-- Sağlayıcı gönderi kimliği, seçilen servis kodu, teklif ve gerçek maliyet, servis noktası —
-- bunlar GÖNDERİNİN alanları. Tek `announce` çağrısı N kutuyu birden açıyor ve tek fatura satırı
-- geliyor; kutu satırına kopyalasaydık aynı gerçek N kez yazılırdı.
-- Ayrıca bir siparişin BİRDEN ÇOK gönderi partisi olabilir (iki kutu bugün, geciken kalem yarın)
-- ve `order_box.shipment_id` bunu kendiliğinden taşıyor.

create type shipment_status as enum (
  'created',        -- duyuruldu, etiket alındı
  'handed_over',    -- taşıyıcıya verildi
  'in_transit',
  'out_for_delivery',
  'delivered',
  'returned',
  'cancelled',
  'error'
);

create table public.shipment (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.order (id) on delete cascade,
  -- Deponun kimliği: gönderi hangi çıkıştan yapıldı. `restrict` — gönderisi olan depo silinmez.
  warehouse_id uuid not null references public.warehouse (id) on delete restrict,
  status shipment_status not null default 'created',

  -- ── İKİ KİMLİK UZAYI (referans projenin 13 migration sonra öğrendiği ders) ────────────────
  -- `provider_shipment_id` = sağlayıcının GÖNDERİ kimliği: iptal ve durum sorgusu bunu ister.
  -- Kolinin kimliği BAŞKA bir uzaydadır ve `order_box.provider_parcel_ref`te durur; webhook
  -- koli kimliğini gönderir. İkisini tek kolona koymak, webhook'un hiç eşleşmemesi demekti.
  provider_shipment_id text unique,
  -- Hangi servis seçildi (`chronopost:shop2shop` gibi). Fiyatın ve teslim biçiminin dayanağı.
  shipping_option_code text,
  carrier_code text,
  carrier_name text,
  -- Teslim noktası (point relais) kimliği — kapıya teslimde null.
  service_point_id text,

  -- ── PARA: MALİYET ≠ GELİR ────────────────────────────────────────────────
  -- `quoted_cents` teklifte gördüğümüz, `actual_cost_cents` faturada ödediğimiz. İkisi ayrılır
  -- çünkü ayrışırlar (yakıt farkı, ağırlık düzeltmesi). Müşteriden ALINAN para bunların
  -- hiçbiri değil — o `order.shipping_fee`de ve bilinçli olarak ayrı bir sayı.
  quoted_cents int check (quoted_cents is null or quoted_cents >= 0),
  actual_cost_cents int check (actual_cost_cents is null or actual_cost_cents >= 0),

  cancelled_at timestamptz,
  created_at timestamptz not null default now()

  -- **"Gönderi yalnız kargo siparişinde olur" kuralı BURADA DEĞİL** ve bu bilinçli: `check`
  -- başka tabloya bakamaz (`order.delivery_type`), yani bu kural ya tetikleyici ister ya
  -- uygulama katmanında yaşar. Süs bir `check (true)` yazmak, kuralın veride durduğu izlenimi
  -- verip hiçbir şey zorlamamak olurdu — kısıtsızlıktan kötü. Kural `announceShipment`
  -- kapısında ve testiyle çivili.
);

create index shipment_order_idx on public.shipment (order_id, created_at);
create index shipment_status_idx on public.shipment (status) where status not in ('delivered', 'returned', 'cancelled');

alter table public.shipment enable row level security;
-- Politika YOK — service-role. Müşteri takip numarasını sunucudan hazırlanmış görünümde okur.

comment on table public.shipment is
  'Taşıyıcıdaki gönderi partisi (07.12). provider_shipment_id = sağlayıcının GÖNDERİ kimliği (iptal + durum sorgusu); kolinin kimliği order_box.provider_parcel_ref''te ve AYRI bir uzaydadır — webhook koli kimliğini gönderir. quoted/actual maliyet BİZİM ödediğimiz; müşteriden alınan order.shipping_fee''dedir.';

-- ── SİPARİŞ KUTUSU: taşıyıcı kimliği (0048'e ek) ────────────────────────────
alter table public.order_box add column shipment_id uuid references public.shipment (id) on delete set null;
-- Sağlayıcının KOLİ kimliği — webhook eşleşmesinin BİRİNCİL anahtarı. Takip numarası bazı
-- taşıyıcılarda geç atanır; ona bağlanan eşleşme erken webhook'ları kaçırır.
alter table public.order_box add column provider_parcel_ref text unique;
alter table public.order_box add column tracking_number text;
alter table public.order_box add column tracking_url text;
-- Etiket dosyasının depo anahtarı (tam URL değil — STACK §5).
alter table public.order_box add column label_key text;

create index order_box_tracking_idx on public.order_box (tracking_number) where tracking_number is not null;
create index order_box_shipment_idx on public.order_box (shipment_id) where shipment_id is not null;

comment on column public.order_box.provider_parcel_ref is
  'Sağlayıcının KOLİ kimliği — webhook eşleşmesinin birincil anahtarı. shipment.provider_shipment_id ile KARIŞTIRILMAZ: farklı kimlik uzayları (biri gönderi, biri koli).';

-- ── OLAY DEFTERİ ────────────────────────────────────────────────────────────
--
-- NEDEN AYRI TABLO — dört sebep, hepsi tasarım kaydında (§4.5):
--   1. Webhook yalnız TETİKLEYİCİ; gerçek durum REST'ten çekiliyor. Gelen HAM kod bir yere
--      yazılmazsa taksonomiyi hiç öğrenemeyiz (referans bunu log'a yazıyor — log döner).
--   2. Bilinmeyen kod kaydedilirse eşleme sonradan yazıldığında GEÇMİŞ yeniden okunabilir.
--   3. Müşterinin gördüğü zaman çizgisi her açılışta sağlayıcıya gitmemeli.
--   4. "Ne zaman verdik, ne zaman teslim oldu" kâr ve gecikme ölçümünün girdisi.
--
-- `webhook_event` (0022) YERİNE GEÇMEZ: o idempotens defteridir ("bu çağrı işlendi mi"), bu iş
-- kaydıdır ("bu koli nerede"). `order_status_log` da yerine geçmez: o BİZİM sipariş durumumuzun
-- geçiş defteri (sipariş düzeyi, bizim taksonomimiz); bu koli düzeyi ve taşıyıcının taksonomisi.
create table public.shipment_event (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipment (id) on delete cascade,
  -- Koli düzeyi olay; `null` = gönderi düzeyi (duyuruldu, iptal edildi).
  order_box_id uuid references public.order_box (id) on delete set null,
  -- Sağlayıcının HAM kodu ("DELIVERED", "ANNOUNCING"). Eşlenmese de saklanır.
  provider_code text not null,
  -- Bizim eşlememiz. **`null` = durumu DEĞİŞTİRMEDİ ve satır yine yazılır** (CLAUDE §1:
  -- ölçülemeyen değer sıfır değildir).
  mapped_status shipment_status,
  -- **Kod eşleme tablomuzda VAR mı.** `mapped_status` null olmasının İKİ sebebi var ve ayrılmaları
  -- şart (28.08, taksonomi ölçüldükten sonra eklendi):
  --   (a) `recognized = false` → kodu TANIMIYORUZ. Tablo eksik demektir; operasyon bunu sayar
  --       ("N tanınmayan taşıyıcı kodu") ve eşleme büyütülünce geçmiş yeniden okunabilir.
  --   (b) `recognized = true` + `mapped_status null` → kodu tanıyoruz ama gönderinin YERİNİ
  --       söylemiyor ("teslim adresi değişti", "iptal sürüyor"). Bilgi olayıdır.
  -- Ayrım olmasaydı her adres değişikliği alarmı şişirirdi; hep açık duran bir alarm da alarm
  -- olmaktan çıkar.
  recognized boolean not null default true,
  message text,
  -- Olayın KENDİ zamanı — bizim aldığımız an DEĞİL. Webhook 10 kez yeniden deneniyor ve saatler
  -- sonra gelebilir; zaman çizgisini olayın kendi damgası kurar.
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  -- Ham yük YALNIZ tanınmayan kodda saklanır: tanınan olayda değeri yok, her satırda tutmak
  -- tabloyu şişirir ve kişisel veri riskini kalıcılaştırır.
  -- ⚠ KİŞİSEL VERİ YAZILMAZ (CLAUDE §1 kırmızı çizgi): taşıyıcı yükü alıcı adı/adresi/telefonu
  -- taşıyabilir; yazan taraf bu alanları AYIKLAR. Olay için kod + cümle + zaman yeter, kimlik
  -- zaten satırın FK'sinde.
  raw jsonb,

  -- Aynı olay iki kez yazılmaz. Koli düzeyi olmayan olaylarda `order_box_id` null olduğu için
  -- bu kısıt onları kapsamaz — gönderi düzeyi olaylar zaten idempotens defterinden geçiyor.
  constraint shipment_event_uq unique (order_box_id, provider_code, occurred_at)
);

create index shipment_event_shipment_idx on public.shipment_event (shipment_id, occurred_at desc);
-- "Tanınmayan kod" dökümü — eşleme tablosu büyütüldükten sonra GEÇMİŞİ YENİDEN OKUMA turunun
-- girdisi. Süzgeç `mapped_status` DEĞİL `recognized`: bilgi olaylarının da eşlenmiş durumu yoktur
-- ve onlar bir eksiklik değildir.
-- (Anlık uyarı buradan okunmuyor: uzlaştırma tanınmayan kodu `error_log`'a warning olarak düşüyor
--  — orada kod başına gruplanır ve çözülene kadar durur; bir sayaç pencere geçince sıfırlanırdı.)
create index shipment_event_unmapped_idx on public.shipment_event (received_at desc) where not recognized;

alter table public.shipment_event enable row level security;

comment on table public.shipment_event is
  'Taşıyıcı olay defteri (07.12). Append-only. recognized=false = kod TANINMADI (eşleme tablosu eksik, operasyon sayar); recognized=true + mapped_status null = tanınan ama durumu değiştirmeyen bilgi olayı. raw yalnız TANINMAYAN kodda ve KİŞİSEL VERİ AYIKLANARAK saklanır.';
