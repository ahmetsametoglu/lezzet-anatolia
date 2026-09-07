-- Modül 15 — SOHBETTEN SEPET (15.20 · 15.21 · 15.22 · kullanıcı kararı 07.09).
--
-- ── KANAL İLKESİ ────────────────────────────────────────────────────────────
-- *"Hangi mesajlaşma platformunda olursa olsun en sonunda sepete yönlendirilir. Sepet onaylanır,
-- sonra ödeme ekranına geçilir."* Sepet HER kanalda kurulabilir; onay ve ödeme yalnız sitede
-- (`CHANNELS §3b`). Bu dosya o ilkenin iki veri parçasını açıyor:
--   1. **Sohbet sepeti** — `cart.conversation_id`: kimliksiz sohbetin (Messenger/IG) sepeti.
--   2. **Sepet bağlantısı** — `cart_link`: sohbette kurulan sepeti siteye TAŞIYAN jeton.
--
-- ── NEDEN `cart`e KOLON, AYRI TABLO DEĞİL (15.22 · kullanıcı kararı "a") ────
-- Alternatif, kalemleri bağlantının içinde taşımaktı (sunucuda sepet yok). Elendi: ajan sepeti her
-- turda sohbet geçmişinden yeniden kurmak zorunda kalır, 12 mesajlık pencere aşılınca sepet
-- kaybolur ve "sepetimde ne var" sorusu Messenger'da cevapsız kalırdı. Sepet kendi kimliğini aldı
-- (`0012`, `cart.id`); sahibi müşteri YA DA sohbet. Satır birleştirme, adet, süzme — hepsi tek
-- serviste, tek kuralla (`cart.service.ts`): sohbet sepeti ayrı bir tablo olsaydı aynı kural iki
-- yerde yaşar ve bir gün ayrışırdı.
--
-- ── BAĞLANTI JETONU — `wa_link_token`ın TERS YÖNÜ (0011 · DOMAIN §10) ───────
-- Oradaki akış siteden WhatsApp'a gider (giriş yapmış müşteri jetonu sohbete yazar). Buradaki
-- sohbetten siteye: ajan bağlantıyı sohbete yazar, bağlantıyı açan kişi siteye girer. Kanıt yine
-- iki katlı — bağlantıyı ALAN kişi sohbetin öteki ucundadır (hattı/hesabı şu an elinde tutuyor),
-- GİRİŞ yapan kişi posta kutusunun sahibidir. Güvenlik ENTROPİDEN gelir (12 hane okunabilir alfabe
-- ≈ 60 bit) + ömür + tek kullanım; 6 haneli çapa kodu değildir ve "koddan kimliğe gidilmez" kuralı
-- ona uygulanmaz (0011 künyesindeki aynı ayrım).
--
-- Jeton KENDİ TABLOSUNDA, kolon çifti değil: bir sohbet için birden çok bağlantı üretilebilir
-- (müşteri "tekrar gönder" der) ve "hangi bağlantı ne zaman, kim tarafından açıldı" sorusu
-- sonradan cevaplanabilmeli (15.19'un "kim, ne zaman, hangi kanıtla" kuralının aynısı). Eski
-- bağlantı SİLİNMEZ, süresi kapatılır — iz kalır.
--
-- ── STOK AYRILMAZ, FİYAT BAĞLAYICI DEĞİL ────────────────────────────────────
-- Bağlantı bir NİYET taşır, rezervasyon değil (DOMAIN §4 — sepetle aynı kural). Süresi bu yüzden
-- rezervasyon TTL'ine bağlı değil ve uzun (7 gün, uygulama sabiti): sepet aylarca bekleyebilir,
-- bağlantı da bir hafta bekleyebilir. Fiyat bağlantıyı açan tarafta yeniden çözülür (DOMAIN §5).

alter table public.cart
  -- Sohbet sepeti: kimliksiz sohbetin (Messenger/IG) niyeti. Kolon 0012'de (tablonun kendi
  -- dosyasında), yabancı anahtarı burada: `conversation` 0039'da doğuyor, kısıt ancak şimdi
  -- bağlanabilir. `cascade`: sohbet silinince (GDPR kovası, 0037) sepeti de gider.
  add constraint cart_conversation_id_fkey foreign key (conversation_id) references public.conversation (id) on delete cascade,
  -- Sepete dokunan sohbetin izi (15.23): sohbet silinirse sepet KALIR, yalnız iz düşer.
  add constraint cart_source_conversation_id_fkey foreign key (source_conversation_id) references public.conversation (id) on delete set null,
  -- Sahipsiz sepet olamaz — ikisinden en az biri dolu. İkisi birden DOLU olabilir mi? Hayır, ama
  -- bunu kısıt değil kapı söylüyor (`cart.service.ts`): sohbet müşteriye bağlanınca sepet
  -- TAŞINIR (`takeOver`), sohbet satırı silinir — iki sahipli bir satır hiç doğmaz.
  add constraint cart_owner check (customer_id is not null or conversation_id is not null);

create table public.cart_link (
  id uuid primary key default gen_random_uuid(),
  -- Okunabilir alfabe, 12 hane (`readableCode`). Büyük harfle saklanır; arama da büyük harfle.
  token text not null unique check (length(token) = 12),
  -- Bağlantı SOHBETİN bağlantısıdır, müşterinin değil: WhatsApp'ta sohbetin müşterisi var
  -- (taslak ya da gerçek), Messenger'da yok — sahibi bulmak açılış anında sohbetten yapılır.
  conversation_id uuid not null references public.conversation (id) on delete cascade,
  expires_at timestamptz not null,
  -- Tek kullanım: açılıp giriş yapıldığı an damgalanır; ikinci açılış `invalid` görür.
  claimed_at timestamptz,
  -- Kim açtı — bağlantıdan gelen kişinin profili (birleşme sonrası HEDEF hesap). `set null`: hesap
  -- silinirse damga durur, kim olduğu düşer.
  claimed_by uuid references public.user_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- "Kim açtı" ancak "ne zaman açıldı" varsa anlamlı; tersi (`claimed_by` boş) hesap silinince
  -- meşru olarak olur, o yüzden çift kısıt DEĞİL tek yönlü.
  constraint cart_link_claim check (claimed_by is null or claimed_at is not null)
);

-- Sohbetin bağlantıları — "bu sohbete kaç bağlantı üretildi, hangisi açıldı" sorusu.
create index cart_link_conversation_idx on public.cart_link (conversation_id, created_at desc);

-- Yalnız service-role: jeton bir YETKİDİR, hiçbir uçtan geri okutulmaz (`push_device` ile aynı karar).
alter table public.cart_link enable row level security;
