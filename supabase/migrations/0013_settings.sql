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

-- `warehouse` kapsamı (DOMAIN §17): depolar farklı şehirlerde, kurye anlaşmaları ve kesim saatleri
-- ayrışır. Mekanizma zaten burada — `settings`'e ayrı bir `warehouse_id` kolonu AÇILMAZ, ikinci bir
-- kapsam mekanizması duplication olurdu (CLAUDE.md §1). Depo bazlı olmaya aday değerler: kesim
-- saati, rota teslimat birim maliyeti (kâr hesabına girer — global kalırsa kâr sessizce yanlışlaşır),
-- paketleme maliyeti, minimum sepet. TTL ve raf ömrü eşikleri global kalır.
create type setting_scope as enum ('global', 'channel', 'zone', 'country', 'warehouse');

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  scope_type setting_scope not null default 'global',
  -- Kapsamın kimliği: `channel` için 'b2b'/'b2c', `country` için 'FR'/'DE', `zone` için bölge uuid'i,
  -- `warehouse` için depo uuid'i. Metin tutulur çünkü hepsi farklı tipte; global'de null.
  scope_id text,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  -- Değişikliğin AKTÖRÜ (09.16 · `admin-ayarlar.md §2`). "Ne zaman" tek başına yarım bir izdir ve
  -- yarım iz tam iz gibi okunur: ekran "3 Ağustos 10:12'de değişti" yazdığında okuyan "kim" sorusunun
  -- cevabının da bir yerde durduğunu varsayar. Bir ayar kararı — kesim saati, teslimat maliyeti —
  -- geri dönüp sorulacak türdendir.
  --
  -- `on delete set null`: ayrılan personelin sildiği iz, ayarın kendisini silmemeli. İz kaybolur,
  -- kayıt kalır — tersi (kaskad) çalışan ayrıldığında ayarı da götürürdü.
  --
  -- Tohum satırlarında NULL ve bu doğru: onları kimse değiştirmedi, sistem kurdu. Ekran boş aktörü
  -- "sistem varsayılanı" diye okur, uydurma bir isim yazmaz.
  updated_by uuid references public.user_profiles (id) on delete set null
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
  -- ── GÜNÜN EŞİK SAATLERİ (09.3 paneli, kullanıcı onayı 17.08) ────────────────
  -- Panelin "gün akışı" şeridi bu üç satırı okur; üstteki uyarı şeridi de günün EN YAKIN eşiğini
  -- bunlardan seçer. Saatler koda gömülmedi çünkü depo bazlı olmaya en açık değerler bunlar
  -- (yukarıdaki kapsam notu: *"depo bazlı olmaya aday: kesim saati"*) — Colmar'ın hazırlık kapanışı
  -- ile Kehl'inki aynı olmak zorunda değil, ve gün akışı yanlış saati gösterirse şerit yanlış işe
  -- yönlendirir. Global satır varsayılandır, özgül kapsam admin ekranından eklenir.
  --
  -- **Panelin beşinci eşiği YOK ve bilinçli:** tasarımda "gün sonu mutabakat 20:00" vardı, budandı
  -- (`design/KARARLAR.md` › Panel 17.08) — o para ekranının işidir, panelde karar tetiklemiyordu.
  ('prep_cutoff_time',             '"11:00"','Depo hazırlık kapanışı. Bu saate kadar hazırlanmayan sipariş rotaya yetişmez (panel gün akışı).'),
  ('route_departure_time',         '"14:00"','Rota çıkış saati — kuryenin yola çıkması beklenen an (panel gün akışı).'),
  ('courier_close_time',           '"18:00"','Kurye kapanışı — kasanın teslim alınması beklenen an (panel gün akışı).'),
  -- KAPIYA TESLİM tabanı (kullanıcı kararı 10.08). Kargo siparişinde OKUNMAZ — orada yalnız kanal
  -- satırı (toptan ticari şartı) geçerlidir; kuralın kendisi `application/cart/min-basket.ts`te.
  -- Küresel satıra yazılabilmesinin sebebi o kural: kargoya sızma yolu kapalı olduğu için taban
  -- bölge bölge tekrarlanmak zorunda değil. SSS de bu sayıyı yazıyor (`legal/faq`).
  ('min_basket_cents',             '4000',   'Asgari sepet — KAPIYA TESLİM için lojistik taban (cent). Kargo siparişinde uygulanmaz; 0 = alt sınır yok.'),
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
  ('packaging_unit_cost_cents',    '120',    'Paketleme (soğuk zincir) birim maliyeti (cent) — kâr hesabı.'),
  ('door_packaging_unit_cost_cents','0',     'Kapı önü satışta paketleme birim maliyeti (cent). Varsayılan 0: mal elden gidiyor, soğuk zincir paketi yok.');
