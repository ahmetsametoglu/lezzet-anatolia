-- Modül 02 — İşletme ayarı (02.6/02.7). DATA_MODEL "Setting"; blueprint STACK §10.
--
-- **İşletme ayarı env'e veya koda gömülmez.** Kesim saati, minimum sepet, kapıda ödeme tavanı,
-- rezervasyon TTL'i gibi değerler işin sahibinin kararıdır ve dağıtım beklemeden değişebilmelidir.
--
-- KAPSAMLI (scoped): aynı anahtar kanala/bölgeye/ülkeye göre farklılaşabilir — "minimum sepet
-- Strasbourg'da 25 €, kargoda 60 €" gibi. Çözücü EN ÖZGÜL kapsamı seçer, yoksa global'e düşer.
--
-- Değer jsonb: ayarlar sayı, metin, saat, bayrak ve nesne olabiliyor (ör. teslim onayı kapsamı
-- kanal başına). Tip başına ayrı kolon açmak tabloyu boş kolonlarla doldururdu.

create type setting_scope as enum ('global', 'channel', 'zone', 'country');

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  scope_type setting_scope not null default 'global',
  -- Kapsamın kimliği: `channel` için 'b2b'/'b2c', `country` için 'FR'/'DE', `zone` için bölge uuid'i.
  -- Metin tutulur çünkü üçü farklı tipte; global'de null.
  scope_id text,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

-- Aynı anahtar + aynı kapsam iki kez tanımlanamaz: hangisinin geçerli olduğu belirsiz kalmamalı.
-- Global satırda `scope_id` null olduğu için iki ayrı kısmi indeks gerekir (null'lar unique'te çakışmaz).
create unique index settings_scoped_key on public.settings (key, scope_type, scope_id) where scope_id is not null;
create unique index settings_global_key on public.settings (key) where scope_id is null;

alter table public.settings enable row level security;

-- Varsayılanlar — `DATA_MODEL` Setting listesi. Hepsi global; özgül kapsam admin ekranından eklenir.
-- Para değerleri CENT (STACK §8: para tamsayı cent'te taşınır), yüzdeler tam sayı.
insert into public.settings (key, value, description) values
  ('reservation_ttl_minutes',      '30',     'Checkout rezervasyon penceresi (dk). Stripe oturum asgarisi 30 dk — altına inilemez; ödeme penceresi buna eşitlenir.'),
  ('order_cutoff_time',            '"16:00"','Sipariş kesim saati. Sonrasında gelen sipariş bir SONRAKİ rota gününe yazılır.'),
  ('min_basket_cents',             '0',      'Minimum sepet tutarı (cent). 0 = alt sınır yok.'),
  ('free_shipping_threshold_cents','6000',   'Ücretsiz kargo eşiği (cent).'),
  ('shipping_fee_cents',           '790',    'Eşik altı kargo ücreti (cent). KDV''ye tabidir.'),
  ('cod_max_cents',                '30000',  'Kapıda ödeme genel tavanı (cent) — kötüye kullanım freni.'),
  ('cash_legal_limit_cents',       '100000', 'Nakit yasal sınırı (FR ~1.000 €). Aşımda UYARI verir, engellemez.'),
  ('payment_term_days',            '30',     'Vade süresi varsayılanı (gün); müşteri kartında boşsa bu geçerli.'),
  ('near_expiry_percent',          '25',     'Yaklaşan son tarih eşiği — kalan raf ömrü %.'),
  ('near_expiry_discount_percent', '30',     'Yaklaşan son tarih için ÖNERİLEN indirim %. Karar insanın.'),
  ('mlor_percent',                 '75',     'Mal kabulde asgari kalan raf ömrü %. Altında uyarır, kabulü engellemez.'),
  ('delivery_proof_required',      '{"b2b": true, "b2c": false}', 'Teslim onayı (imza/foto) kapsamı — kanal bazında.'),
  ('delivery_summary_email',       'true',   'Teslimde teslimat özeti e-postası otomatik gönderilsin mi.'),
  ('route_delivery_unit_cost_cents','250',   'Rota teslimat birim maliyeti (cent) — kâr hesabı.'),
  ('packaging_unit_cost_cents',    '120',    'Paketleme (soğuk zincir) birim maliyeti (cent) — kâr hesabı.');
