-- Modül 17 — KOMŞU DAVETİ (17.10). Kullanıcı kararı 11.08: davetin İKİNCİ türü, getiren
-- davetinden (17.9) ayrı bir kavram.
--
-- ── İKİ DAVET, İKİ FARKLI SORU ──────────────────────────────────────────────
-- Getiren daveti (`user_profiles.referred_by` + `referral` puanı) **hesapsız birini müşteri yapmayı**
-- ödüllendirir; kimlik eksenlidir, ömür boyu bir kez kurulur ve bir SEFERE bağlı değildir.
-- Komşu daveti ise var olan bir **sefere ikinci bir sipariş eklemeyi** ödüllendirir: aynı bölge,
-- aynı gün, aynı durak civarı → kilometre başına maliyet düşer. Davet edilen kişi ZATEN müşterimiz
-- olabilir (kullanıcı kararı 11.08) ve o hâlde getiren ödülü hiç doğmaz ama komşu ödülü doğar.
--
-- İki kavram tek tabloya sığmıyordu: birinin anahtarı kişi, ötekinin anahtarı SEFER.
--
-- ── "SEFER" YENİ BİR VARLIK DEĞİL ───────────────────────────────────────────
-- Rota günü zaten `(delivery_zone_id, delivery_date)` ikilisiyle tanımlı (0012 + 0014) ve kurye
-- ekranı da siparişleri bu ikiliyle topluyor. Ayrı bir `trip`/`route_run` tablosu açmak, bugün
-- türetilen bir gerçeği saklamak ve iki kaynağın bir gün ayrışmasını göze almak olurdu — bölge
-- sınırı ya da gün değiştiğinde saklanan sefer yalan söylerdi. Davet bu yüzden ikiliyi KENDİ
-- satırında taşır: davet doğduğu andaki seferin FOTOĞRAFIDIR, canlı bir bağ değil.
--
-- ── DAVET SİPARİŞTEN DOĞAR, MÜŞTERİDEN DEĞİL ───────────────────────────────
-- `order_id` tekil: bir siparişten bir davet. Müşteri başına tek davet olsaydı iki ayrı seferi olan
-- müşteri ikincisini çağıramazdı; sınırsız olsaydı aynı sefer için onlarca bağlantı üretilebilirdi.
-- Sipariş, "hangi sefer" sorusunun zaten cevabı olduğu için doğal anahtar odur.
--
-- ── KULLANIM SAYILMAZ, TÜRETİLİR ────────────────────────────────────────────
-- `remaining_uses` diye azalan bir sayaç YOK. Kullanım, o daveti künyesinde taşıyan siparişlerin
-- sayısıdır (`order.neighbor_invite_id`) — defterin `points_entry`de ve para hareketlerinde
-- uygulanan kuralının aynısı: sayaç bozulur, defter bozulmaz. Sipariş iptal olursa sayı kendiliğinden
-- düşer ve davet yeniden kullanılabilir hâle gelir; sayaç tutulsaydı o iade elle yapılmak zorunda
-- kalır, biri unutulurdu.
--
-- ── ÖDÜLÜN ANI BURADA DEĞİL, PARADA ─────────────────────────────────────────
-- Puan satırını bu tablo değil `points_entry` taşır ve yazım anı 17.9'da kurulan kuralın aynısıdır:
-- **para gerçekten alındığında** (`order/payment.ts` → `finalize`). Tekillik de oradaki indeksten
-- gelir (`customer_id, reason, ref_id`) — `ref_id` komşunun SİPARİŞİDİR, yani aynı siparişten iki
-- kez ödül yazılamaz.

create table public.neighbor_invite (
  id uuid primary key default gen_random_uuid(),

  -- Bağlantının kimliği. Sipariş referansı/kupon koduyla AYNI okunabilir alfabe (O/0, I/1 yok) —
  -- davet WhatsApp'ta dolaşır ve telefonda elle de yazılabilmeli. Uzunluk geri bildirim
  -- belirtecininkiyle aynı (16): bu bağ da oturum sormadan açılıyor, yani tahmin edilebilir
  -- olmamalı. Üretim CSPRNG (`readableCode`).
  token text not null unique,

  -- Daveti açan müşteri. `restrict`: davet edenin kaydı, kazanılmış bir ödülün kaynağıdır.
  inviter_id uuid not null references public.user_profiles (id) on delete restrict,

  -- Davetin doğduğu sipariş — "hangi sefer" sorusunun kaynağı. Sipariş başına TEK davet.
  order_id uuid not null unique references public.order (id) on delete cascade,

  -- ── SEFERİN FOTOĞRAFI ─────────────────────────────────────────────────────
  -- Siparişten okunabilir ama KOPYALANIYOR ve bu bilinçli bir istisna: sipariş bölgesi ya da günü
  -- sonradan değişebilir (operasyon taşır), oysa davet edilen komşuya SÖZ VERİLEN gün davetin
  -- doğduğu gündür. Bağ canlı olsaydı, komşunun tıkladığı bağlantı ertesi gün başka bir günü
  -- gösterirdi — ve kimse fark etmezdi.
  delivery_zone_id uuid not null references public.delivery_zone (id) on delete cascade,
  delivery_date date not null,

  -- Kaç komşu bu davetten sipariş verebilir. Varsayılan 3, ayardan gelmez ve **satırda durur**:
  -- ayar sonradan değişirse bugün paylaşılmış bir davetin sözü değişmemeli. Sınırın kendisi bir
  -- istismar frenidir — davet "komşum" içindir, sosyal medya kampanyası için değil.
  max_uses int not null default 3 check (max_uses between 1 and 20),

  created_at timestamptz not null default now()
);

alter table public.neighbor_invite enable row level security;

-- "Bu müşterinin açık davetleri" — hesap/sipariş ekranı. Geçmiş seferler sorgunun dışında kalsın
-- diye tarih de indekste.
create index neighbor_invite_inviter_idx on public.neighbor_invite (inviter_id, delivery_date desc);

-- ── SİPARİŞ HANGİ DAVETTEN GELDİ ────────────────────────────────────────────
-- Kolon siparişte durur (0012'de tanımlı, burada BAĞLANIYOR — `delivery_zone_id`in aynı deseni),
-- ayrı bir `neighbor_invite_use` tablosunda değil: kullanım siparişin KÜNYESİDİR (nereden geldi),
-- sipariş kadar yaşayan ayrı bir olay değil. Ayrı tablo olsaydı "sipariş var ama kullanım satırı
-- silinmiş" hâli mümkün olurdu ve ödül sorgusu sessizce boş dönerdi.
--
-- `set null`: davet silinse bile sipariş silinmez — geçmiş bir sipariş, davetin ömrüne bağlı değildir.
alter table public.order add constraint order_neighbor_invite_fk
  foreign key (neighbor_invite_id) references public.neighbor_invite (id) on delete set null;

-- Davet başına kullanım sayımı ve ödül yazımı bu indeksten geçer.
create index order_neighbor_invite_idx on public.order (neighbor_invite_id)
  where neighbor_invite_id is not null;

-- ── KABUL EDİLEN DAVET KİŞİYE YAZILIR ───────────────────────────────────────
-- Kullanıcının sorusu (12.08): *"Kullanıcı ister önce gitsin, hesap açsın, gezinsin. Sonra mobil
-- uygulamayı yüklesin. Sepete geldiğinde bunu görebilmeli."* İlk kurguda davet YALNIZ tarayıcı
-- çerezinde (`lz_neighbor`) yaşıyordu ve üç yerden birden kopuyordu: web'de hesap açıp uygulamayı
-- yükleyen kişide davet yoktu, başka cihazdan giren kaybediyordu, çerezi temizleyen siliyordu.
--
-- Getiren daveti bu sorunu yaşamıyor çünkü orada bağ kayıt anında PROFİLE yazılıyor (`referred_by`)
-- — kişiye yapışıyor. Komşu davetinde o adım eksikti: çerez orada bir KÖPRÜ, burada SON DURAKtı.
--
-- ── NEDEN PROFİLDE BİR KOLON DEĞİL ──────────────────────────────────────────
-- `referred_by` ömürde bir kezdir. Komşu daveti bir SEFERE bağlıdır, tekrarlanır ve o sefer geçince
-- ölür; dahası **aynı kişiyi iki komşusu iki AYRI sefere çağırabilir**. Tek kolon o hâlde veri
-- kaybettirir — hangi seferin daveti tutulacak? Kendi satırı olması, checkout'un "bu siparişin
-- seferine uyan davet hangisi" sorusunu da doğal biçimde cevaplıyor.
--
-- ── SAYAÇ YOK, DAMGA YOK: "BEKLİYOR" TÜRETİLİR ──────────────────────────────
-- Satırda `used_at`/`status` yok. Bir kabul "bekliyor" sayılır: o müşteriden o daveti künyesinde
-- taşıyan (iptal olmayan) bir sipariş YOKSA ve seferin penceresi hâlâ AÇIKSA. İkisi de zaten
-- başka yerde ölçülüyor (`order.neighbor_invite_id` · `deliveryRunWindow`); üçüncü bir damga
-- tutmak, iptal edilen siparişte elle geri alınması gereken bir durum daha demekti.
--
-- Satır SİLİNMEZ: kabul, olmuş bir olaydır. "Kaç davet kabul edildi, kaçı siparişe döndü" sorusunun
-- tek kaynağı bu tablo — silinseydi dönüşüm ölçülemezdi.
create table public.neighbor_invite_claim (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.neighbor_invite (id) on delete cascade,
  -- Kabul eden müşteri. `cascade`: hesap silinirse kabul kaydı da düşer (kişisel veri, 0037).
  customer_id uuid not null references public.user_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Aynı kişi aynı daveti bir kez kabul eder; ikinci tıklama yeni satır açmaz.
  constraint neighbor_invite_claim_key unique (invite_id, customer_id)
);

alter table public.neighbor_invite_claim enable row level security;

-- "Bu müşterinin bekleyen davetleri" — sepet, teslimat günü seçimi ve ana ekran bunu okur.
create index neighbor_invite_claim_customer_idx on public.neighbor_invite_claim (customer_id, created_at desc);

