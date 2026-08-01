-- 0045 — Varyant + yer bazlı "gelince haber ver" (19.12)
--
-- `zone_notice` (0030) ile KARIŞTIRILMAZ, iki farklı sözdür:
--   zone_notice          → "bölgenize henüz gelmiyoruz"   (rota hiç yok)
--   variant_stock_notice → "bölgenize geliyoruz ama BU ÜRÜN burada şu an yok"
--
-- İkincisi 19.10'un dördüncü hâlidir (`elsewhere`): ürün ağda var, müşterinin yerine ulaşamıyor —
-- soğuk zincir olduğu için kargoya da verilemiyor. Tek bir "yok" mesajına indirmek müşteriyi
-- gelmeyecek bir mal için bekletir ya da gelecek malı kaçırtır.
--
-- ── ANAHTAR DEPO DEĞİL, YER ─────────────────────────────────────────────────────
-- Kayıt `(ülke, posta kodu)` ile tutulur, `warehouse_id` ile DEĞİL. Müşteriye verilen söz kendi
-- adresi hakkındadır, bizim iç coğrafyamız hakkında değil: bir bölgeyi ileride başka depoya
-- bağlarsak söz ayakta kalmalı. Depo anahtarlı kayıt o gün sessizce yanlış listeye düşerdi — ve
-- "müşteri depoyu hiç görmez" kuralı (DOMAIN §17) veride de korunmuş olur.

create table public.variant_stock_notice (
  id uuid primary key default gen_random_uuid(),
  -- Hangi boy bekleniyor: karar varyant düzeyindedir, ürün düzeyinde değil. 700 g'ı bekleyen
  -- müşteriye 1,5 kg geldi diye haber vermek, sözü tutmak değil bozmaktır.
  variant_id uuid not null references public.product_variant (id) on delete cascade,
  -- Yer: müşterinin cevabı (19.9 çerezi ile aynı ikili). Ülke posta kodundan türer (19.8) ve
  -- burada SAKLANIR — kod tek başına 610 vakada iki ülkeye çözülüyor.
  country country_code not null,
  postal_code text not null,
  -- İletişim adresi. Ziyaretçi de kayıt bırakabilir — hesap ZORUNLU DEĞİL: "haber ver"in önüne
  -- giriş duvarı koymak, tam da vazgeçmeye en yakın anda ikinci bir engel çıkarmaktır.
  email text not null,
  -- Girişli müşteride kim olduğu; ziyaretçide null. Hesap sayfası kendi kayıtlarını bununla bulur.
  customer_id uuid references public.user_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Haber gönderildiğinde damgalanır. **Tek hatırlatma** sözü bu alanla tutulur: dolu olan satıra
  -- ikinci kez yazılmaz.
  notified_at timestamptz
);

alter table public.variant_stock_notice enable row level security;

comment on table public.variant_stock_notice is
  'Varyant + yer bazlı stok bildirimi (19.12). "Bölgenize geliyoruz ama bu ürün burada yok" hâli; zone_notice''tan farklı — o "bölgenize gelmiyoruz" der.';

-- Aynı kişi aynı ürün + aynı yer için tek AÇIK kayıt tutar. Kısmi: haber verilmiş satır yeni bir
-- bekleyişi engellemez — müşteri aynı ürünü aylar sonra yeniden bekleyebilir ve bu yeni bir sözdür.
create unique index variant_stock_notice_open_idx
  on public.variant_stock_notice (variant_id, country, postal_code, lower(email))
  where notified_at is null;

-- "Bu varyant bu yerde stoklandı, bekleyen var mı" sorgusu — tetikleyicinin okuması.
create index variant_stock_notice_pending_idx
  on public.variant_stock_notice (variant_id, country, postal_code)
  where notified_at is null;

-- Hesap sayfasının "beklediklerim" listesi.
create index variant_stock_notice_customer_idx
  on public.variant_stock_notice (customer_id, created_at desc)
  where customer_id is not null;
