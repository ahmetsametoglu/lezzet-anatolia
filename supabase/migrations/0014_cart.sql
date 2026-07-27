-- Modül 07 — Sunucu sepeti (07.1). DOMAIN §4 ("sepette hold yok"), §5 (fiyat sabitleme).
--
-- Sepet SUNUCUDA kalıcıdır: müşteri telefondan ekleyip bilgisayardan devam edebilir; sepet kurtarma
-- e-postasının (Faz 2) zemini de budur. Müşteri başına TEK satır — sepet bir liste değil, bir durum.
--
-- **Sepette stok AYRILMAZ.** Rezervasyon checkout başlarken yapılır (DOMAIN §4); sepet yalnız niyet
-- kaydıdır. Bu yüzden burada rezervasyon bağı yok.
--
-- Kalemler jsonb: sepet kalemi bir VARLIK değil, geçici bir seçim. Ayrı tablo açmak her ekleme/çıkarma
-- için satır yönetimi getirir, karşılığında sorgulanabilirlik kazandırır — sepet sorgulanmaz, okunur.

create table public.cart (
  -- Birincil anahtar müşterinin kendisi: "tek satır / müşteri" kuralı şemada zorlanır.
  customer_id uuid primary key references public.user_profiles (id) on delete cascade,
  -- [{ variantId, qty, unitPrice, stockId, addedAt }] — `unitPrice` **BAĞLAYICI DEĞİLDİR**:
  -- gösterim ve değişiklik tespiti içindir (DOMAIN §5, karar 27.07). Fiyat CHECKOUT BAŞLANGICINDA
  -- sabitlenir — stok ayırma ve ödeme oturumuyla aynı 30 dk'lık pencerede. Sepet aylarca
  -- bekleyebildiği için buradaki fiyatı bağlayıcı saymak, maliyeti oynayan donuk gıdada doğrudan
  -- zarardır; fiyat düşmüşse de müşteriye fazla ödetir.
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.cart enable row level security;
