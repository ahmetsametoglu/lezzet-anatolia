-- İşletme ayarı: kesim saati, asgari sepet, kapıda ödeme tavanı gibi değerler işin sahibinin kararıdır, env'e ya da koda gömülmez ve
-- dağıtım beklemeden değişir. Aynı anahtar kanala, bölgeye, ülkeye ya da depoya göre farklılaşır (en özgül kapsam kazanır); değer jsonb,
-- çünkü ayar sayı, metin, saat, bayrak ya da nesne olabilir.

-- Depo kapsamı ayrı bir `warehouse_id` kolonu değil aynı kapsam mekanizmasıdır, çünkü ikinci bir mekanizma duplication olurdu
-- (CLAUDE.md §1).
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
  -- Değişikliğin aktörü, çünkü "ne zaman" tek başına yarım bir izdir ve ayar kararı geri dönüp sorulur. `on delete set null`: ayrılan
  -- personelin izi kaybolur ama ayar kalır; tohum satırında null "sistem varsayılanı" diye okunur.
  updated_by uuid references public.user_profiles (id) on delete set null
);

-- Aynı anahtar + aynı kapsam iki kez tanımlanamaz: hangisinin geçerli olduğu belirsiz kalmamalı.
-- Global satırda `scope_id` null olduğu için iki ayrı kısmi indeks gerekir (null'lar unique'te çakışmaz).
create unique index settings_scoped_key on public.settings (key, scope_type, scope_id) where scope_id is not null;
create unique index settings_global_key on public.settings (key) where scope_id is null;

alter table public.settings enable row level security;

-- Varsayılanlar global satırlardır, özgül kapsam admin ekranından eklenir; para değerleri cent (STACK §8), yüzdeler tam sayıdır.
insert into public.settings (key, value, description) values
  ('reservation_ttl_minutes',      '30',     'Checkout rezervasyon penceresi (dk). Stripe oturum asgarisi 30 dk — altına inilemez; ödeme penceresi buna eşitlenir.'),
  -- Yeni sohbetin yürütücüsü; yalnız yeni sohbete uygulanır (`open_conversation` çakışmada dokunmaz).
  ('conversation_default_handler', '"ai"',   'Yeni sohbetin yürütücüsü: human | hybrid | ai. Açık sohbetleri değiştirmez; Ayarlar ve Sosyal Mesajlar ekranından değiştirilir.'),
  -- AI model tarifesi, milyon jeton başına dolar (sağlayıcının faturası dolar); kullanım defterinin (`ai_usage.cost_usd`) tek girdisidir.
  -- Anahtar env'deki model adıdır: model değişince satır eklenir, eklenmezse o modelin maliyeti sıfır değil boş yazılır.
  ('ai_model_prices_usd',          '{"gemini-3.5-flash-lite": {"inputPerMillion": 0.30, "outputPerMillion": 2.50}, "gemini-3.5-flash": {"inputPerMillion": 1.50, "outputPerMillion": 9.00}}', 'AI model tarifesi — milyon jeton başına USD (girdi/çıktı). Kullanım defterinin maliyeti buradan hesaplanır; listede olmayan modelin maliyeti boş kalır.'),
  ('order_cutoff_time',            '"16:00"','Sipariş kesim saati. Sonrasında gelen sipariş bir SONRAKİ rota gününe yazılır.'),
  -- ── GÜNÜN EŞİK SAATLERİ ───────────────────────────────────────────────────
  -- Panelin gün akışı şeridi bu satırları okur ve uyarı şeridi en yakın eşiği bunlardan seçer; saatler depo bazlı olmaya en açık
  -- değerler olduğu için koda gömülmez.
  ('prep_cutoff_time',             '"11:00"','Depo hazırlık kapanışı. Bu saate kadar hazırlanmayan sipariş rotaya yetişmez (panel gün akışı).'),
  ('route_departure_time',         '"14:00"','Rota çıkış saati — kuryenin yola çıkması beklenen an (panel gün akışı).'),
  ('courier_close_time',           '"18:00"','Kurye kapanışı — kasanın teslim alınması beklenen an (panel gün akışı).'),
  -- Kapıya teslim tabanı; kargo siparişinde okunmaz, orada yalnız kanal satırı geçer (`application/cart/min-basket.ts`). SSS de bu sayıyı
  -- yazar (`legal/faq`).
  ('min_basket_cents',             '4000',   'Asgari sepet — KAPIYA TESLİM için lojistik taban (cent). Kargo siparişinde uygulanmaz; 0 = alt sınır yok.'),
  -- Ücretsiz kargo eşiği piyasaya göre konuldu (rakip Fransa'ya 125 € eşikle gönderiyor); kendi taşıyıcı maliyetimiz ölçülmeden doğru
  -- konamaz. BEKLEYEN(BACKLOG §2): donuk kargo birim maliyeti ölçülmedi.
  ('free_shipping_threshold_cents','10000',  'Ücretsiz kargo eşiği (cent). Piyasa ölçümü 19.08: rakip 125 €; biz 100 €.'),
  ('cod_max_cents',                '30000',  'Kapıda ödeme genel tavanı (cent) — kötüye kullanım freni.'),
  ('cash_legal_limit_cents',       '100000', 'Nakit yasal sınırı (FR ~1.000 €). Aşımda UYARI verir, engellemez.'),
  ('payment_term_days',            '30',     'Vade süresi varsayılanı (gün); müşteri kartında boşsa bu geçerli.'),
  ('near_expiry_percent',          '25',     'Yaklaşan son tarih eşiği — kalan raf ömrü %.'),
  ('transfer_transit_days',        '1',      'Depolar arası ulaşım süresi (gün). FEFO önerisi yolda ömrü yanacak partiyi uyarır; gecikme rozeti bu eşiği okur.'),
  ('near_expiry_discount_percent', '30',     'Yaklaşan son tarih için ÖNERİLEN indirim %. Karar insanın.'),
  ('mlor_percent',                 '75',     'Mal kabulde asgari kalan raf ömrü %. Altında uyarır, kabulü engellemez.'),
  -- Teslim kanıtı kutu okutmasıdır (`box_scan`), çünkü parmakla çizilen imza kimliği kanıtlamaz; ayar kapsam kanal bazında yine
  -- açılabilsin diye durur.
  ('delivery_proof_required',      '{"b2b": false, "b2c": false}', 'Teslim onayı (imza/foto) kapsamı — kanal bazında; ikisi de kapalı (kanıt kutu okutmasıdır).'),
  ('delivery_summary_email',       'true',   'Teslimde teslimat özeti e-postası otomatik gönderilsin mi.'),
  ('route_delivery_unit_cost_cents','250',   'Rota teslimat birim maliyeti (cent) — kâr hesabı.'),
  ('packaging_unit_cost_cents',    '120',    'Paketleme (soğuk zincir) birim maliyeti (cent) — kâr hesabı.'),
  ('door_packaging_unit_cost_cents','0',     'Kapı önü satışta paketleme birim maliyeti (cent). Varsayılan 0: mal elden gidiyor, soğuk zincir paketi yok.'),
  -- Gel-al siparişinde randevu sistem dışıdır (telefon); ayrılmış mal süresiz bekleyemez, süre dolunca ofis görür ve karar verir.
  ('pickup_wait_days',             '7',      'Gel-al siparişinin hazır bekleyebileceği süre (gün); dolunca ofis listesine düşer, iptal kararı ofisin.');
