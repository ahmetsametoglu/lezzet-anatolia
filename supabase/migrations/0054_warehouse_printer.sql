-- Modül 07 — DEPO YAZICI ENVANTERİ (07.12 · tasarım kaydı `kargo-kanali-tasarimi.md §4.7`).
--
-- ── NEDEN AYAR YETMEDİ ──────────────────────────────────────────────────────
-- 23.7'de yazıcı `settings`in depo kapsamında ve TEKti (`label_printer_address` · `_model` ·
-- `_label_size`) — ve o gün doğruydu: tek yazıcı, tek etiket. Kargo kanalı ikisini de çoğalttı:
--
--   · İKİ ETİKET TÜRÜ: bizim kutu etiketimiz (4×6, QR'lı) ve TAŞIYICININ etiketi (A6 yatay).
--   · İKİ RULO: QL-1110NWB 102 mm · QL-820NWB 62 mm (23.5 karar §1.6).
--
-- Yani eksik olan eksen "hangi cihaz" değil **"hangi İŞ"**: bir depoda N yazıcı olabilir ve her
-- BASIM TÜRÜ birine bakmalı. Ölçülü risk somut (tasarım §4.6): kargo etiketi 148×105 mm, elimizdeki
-- kalıp kesim 103×164 mm — yanlış yazıcıya giden etiket ya reddedilir ya küçültülür, ve küçülen
-- barkod okunmaz.
--
-- ── ENVANTER DEPONUN, SEÇİM CİHAZIN (kullanıcı kararı 29.08) ────────────────
-- *"Sunucu: bu depoda hangi yazıcılar var. Cihaz: hangisini kullanıyor — listeden seçer, elle IP
-- yazmaz."* Bu tablo envanterin kendisi; cihazın seçimi cihazda yaşıyor (telefonun yerel deposu).
--
-- Envanterin sunucuda kalmasının üç somut karşılığı var:
--   1. telefon değişince kurulum "listeden seç" olur, "IP'yi bul ve yaz" değil
--   2. takılı kâğıdın tek doğru kaynağı olur — yanlış boy SDK'da `SetLabelSizeError` (23.5 ölçümü)
--   3. Depolar ekranı "bu depoda hangi yazıcılar var" sorusunu cevaplayabilir
--
-- ── (warehouse_id, purpose) BENZERSİZ DEĞİL, ve bu kullanıcı düzeltmesidir ──
-- Tasarım kaydı önce `unique (warehouse_id, purpose)` öneriyordu; kullanıcı 28.08'de düzeltti:
-- *"bir depoda aynı iş için birden çok yazıcı olabilir; kurulumu yapan kişi doğru olanı seçer."*
-- Kısıt konsaydı ikinci bir kargo yazıcısı tabloya hiç giremezdi ve depocu onu "başka amaç" diye
-- yanlış yere yazardı.
--
-- ── A4 TOPLAMA LİSTESİ BU TABLONUN KONUSU DEĞİL ────────────────────────────
-- Üçüncü kâğıt (toplama listesi) kullanıcı kararıyla depodaki PC'den basılıyor (§4.8): Brother SDK
-- QL serisi etiket yazıcıları için ve A4 oradan çıkmaz. `purpose` bu yüzden iki değerli — telefonun
-- tanıdığı iki yazıcı.

create table public.warehouse_printer (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouse (id) on delete cascade,
  -- Operatörün listede gördüğü ad ("Rampa · QL-1110"). Adres teknik kimlik, bu insan kimliği:
  -- iki yazıcı arasında seçim yapan depocu 192.168.1.90 ile .91'i ayırt edemez.
  name text not null check (length(btrim(name)) > 0),
  -- Hangi İŞ: `box` bizim QR'lı kutu etiketimiz · `shipping` taşıyıcının etiketi.
  purpose text not null check (purpose in ('box', 'shipping')),
  address text not null check (length(btrim(address)) > 0),
  model text not null check (length(btrim(model)) > 0),
  -- Takılı kâğıt. SDK'dan OKUNAMIYOR (23.5 ölçümü) — doğruyu söylemek bu satırın işi.
  label_size text not null check (length(btrim(label_size)) > 0),
  -- Yazıcı bozulur/sökülür: satır silinmez, kapatılır. Cihazların seçimi kimliğe bağlı ve silinen
  -- bir satır o seçimleri sessizce "yazıcı yok"a düşürürdü — kapatma bunu SÖYLER.
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.warehouse_printer is
  'Deponun etiket yazıcıları (07.12). Envanter burada, SEÇİM cihazda (telefonun yerel deposu). '
  '(warehouse_id, purpose) bilerek benzersiz DEĞİL: aynı iş için birden çok yazıcı olabilir.';

comment on column public.warehouse_printer.purpose is
  'box = bizim QR''lı kutu etiketimiz · shipping = taşıyıcının A6 etiketi. Kargo kulvarında ikisi '
  'AYNI kutuya basılmaz (tasarım §4.6: iki barkod taşıyıcının tarayıcısını şaşırtır).';

-- Ekranın tek sorgusu: "bu deponun açık yazıcıları". Kısmi indeks, çünkü kapalı satır hiç okunmuyor.
create index warehouse_printer_scope_idx
  on public.warehouse_printer (warehouse_id, purpose)
  where is_active;

alter table public.warehouse_printer enable row level security;
-- Politika YOK — bilinçli (0047/0048/0052 ile aynı): tabloya yalnız service-role erişir. Yazıcı
-- adresi iç ağın topolojisidir; müşteri yüzeyinin onunla işi yoktur ve olmamalı.
